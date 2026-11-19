// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Real routing and reach readers in a throwaway office; all participants and letters are synthetic.
 * Ended workers return 409 and route immediately up owners; an older letter is sent while its reader is held.
 */
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { setFixtureOwner } from './agent-owner-fixture.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { AGENT_RUNTIMES } from '../src/shared/participants.ts'
import { CHECKPOINT_RUNTIMES } from '../src/shared/worker-delivery/contract.mjs'

let t: TestDb
let app: FastifyInstance
let serial = 0
const person = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const agent = (id: string) => ({ ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })
async function post(url: string, payload: any, headers = person) {
  const r = await app.inject({ method: 'POST', url, payload, headers })
  expect(r.statusCode, r.body).toBeLessThan(300)
  return r.json()
}
async function registered(role = 'worker', starter?: string, runtime = 'codex') {
  const handle = `synthetic-checkpoint-${++serial}`
  return (await post('/api/agents/started', { handle, name: handle, role, ...(runtime ? { runtime } : {}) }, starter ? agent(starter) : person)).agent
}
function run(who: any, state = 'running', checkpoint = true, runtime = 'codex') {
  const attachment = t.client.sqlite.prepare('SELECT record_id FROM agent_records JOIN records ON records.id = agent_records.record_id WHERE agent_id = ? AND workspace_id = ?').get(who.id, 'default') as { record_id: string }
  const id = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Synthetic sandbox run',
    actor: t.api.HUMAN, origin: 'fixture', data: {
      state: 'running', runtime, servingAgentId: who.id, servingAgent: who.handle,
      ranAs: [{ workspaceId: 'default', agentId: attachment.record_id }],
      sandbox: { template: 'synthetic', container: 'synthetic' },
      ...(checkpoint ? { extra: { officeCheckpoint: true } } : {}),
    } }).id
  if (state !== 'running') t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', ?) WHERE id = ?").run(state, id)
  return id
}
async function ownProcess(session: string, pid = process.pid) {
  const { registerResource } = await import('../src/server/lib/resources.ts')
  return registerResource({ workspaceId: 'default', sessionRecordId: session, type: 'process',
    key: String(pid), startedByTheProduct: true, actor: t.api.HUMAN })
}
function data(id: string) { return JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as any).data) }
async function note(to: string, from: string | null, status: number) {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers: from === null ? person : agent(from),
    payload: { kind: 'message', title: 'Synthetic checkpoint letter',
      data: { to: [{ kind: 'agent', id: to }], body: 'Synthetic original words remain whole.' } } })
  expect(reply.statusCode, reply.body).toBe(status)
  return reply.json().record.id as string
}
beforeAll(async () => { t = await freshDb(); app = (await apiApp()).app; await app.ready() })
afterAll(async () => { await app?.close(); t?.close() })
afterEach(() => { t.client.sqlite.prepare('UPDATE session_resources SET released_at = ? WHERE released_at IS NULL').run('2000-01-01 00:00:00') })

it('canonical serving identity is reachable without a dispatch job, and its pending letter is not swept', async () => {
  const starter = await registered('supervisor')
  const worker = await registered('worker', starter.id)
  const session = run(worker)
  await ownProcess(session)
  const { runServing, whyThisAgentCannotBeReached, theAgentARunServes } = await import('../src/server/lib/worker.ts')
  expect(theAgentARunServes(data(session))?.id).toBe(worker.id)
  expect(worker.id).not.toBe(worker.handle)
  expect(runServing(worker.id, 'default')).toBe(session)
  expect(whyThisAgentCannotBeReached(worker.id, 'default')).toBeNull()
  const letter = await note(worker.id, starter.id, 201)
  expect(data(letter).routed ?? []).toEqual([])
  const { sweepDeadLetters } = await import('../src/server/lib/deadletters.ts')
  sweepDeadLetters(t.api.HUMAN)
  expect(data(letter).routed ?? []).toEqual([])
  expect(t.client.sqlite.prepare('SELECT mark FROM message_delivery WHERE message_id = ? AND recipient_id = ?').get(letter, worker.id)).toEqual({ mark: 'queued' })
  expect(t.client.sqlite.prepare('SELECT count(*) AS n FROM agent_runs WHERE agent_id = ?').get(worker.id)).toEqual({ n: 0 })
})

it('after the model process ends, new pending originals route once while older originals stay byte for byte', async () => {
  const starter = await registered('supervisor')
  // The runner's parent stays alive, so the selected starter is reachable after the worker ends.
  await ownProcess(run(starter), process.ppid)
  const worker = await registered('worker', starter.id)
  const holder = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'A synthetic holder', actor: t.api.HUMAN,
    data: { state: 'running', runtime: 'codex' } }).id
  await ownProcess(holder)
  const held = await app.inject({ method: 'POST', url: `/api/handles/${encodeURIComponent(worker.handle)}/hold`, headers: person,
    payload: { session: holder, machine: 'a-synthetic-machine', runtime: 'codex' } })
  expect(held.statusCode, held.body).toBe(201)
  const old = await note(worker.id, starter.id, 201)
  const released = await app.inject({ method: 'POST', url: `/api/handles/${encodeURIComponent(worker.handle)}/release`, headers: person,
    payload: { session: holder, because: 'The synthetic send is complete.' } })
  expect(released.statusCode, released.body).toBe(200)
  const oldRecord = t.client.sqlite.prepare('SELECT * FROM records WHERE id = ?').get(old)
  const oldDeliveries = t.client.sqlite.prepare('SELECT * FROM message_delivery WHERE message_id = ?').all(old)
  const session = run(worker)
  const processRow = await ownProcess(session)
  const pending = await note(worker.id, starter.id, 201)
  const checkpoint = await app.inject({ method: 'GET', url: '/api/messages?only=waiting-for-me&checkpoint=1&limit=1',
    headers: { ...agent(worker.id), 'x-mole-office-session': session } })
  expect(checkpoint.statusCode, checkpoint.body).toBe(200)
  expect(checkpoint.json().checkpoint).toMatchObject({ run: session, agent: worker.id })
  expect(checkpoint.json().messages.map((m: any) => m.id)).toEqual([pending])
  expect(t.client.sqlite.prepare('SELECT * FROM message_delivery WHERE message_id = ?').all(old)).toEqual(oldDeliveries)
  // The launcher closes its own resource without stopping any process of this fixture.
  t.client.sqlite.prepare('UPDATE session_resources SET released_at = ? WHERE id = ?').run('2000-01-01 00:00:00', processRow.id)
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'finished', '$.lastOutputAt', ?) WHERE id = ?").run('2999-01-01 00:00:00', session)
  const { sweepDeadLetters } = await import('../src/server/lib/deadletters.ts')
  sweepDeadLetters(t.api.HUMAN)
  const routed = data(pending).routed
  expect(routed).toHaveLength(1)
  expect(routed[0]).toMatchObject({ for: { kind: 'agent', id: worker.id }, to: null, said: { ending: { how: 'the owner sent it' } } })
  expect(routed[0].because).toBeTruthy()
  expect(data(pending).body).toBe('Synthetic original words remain whole.')
  expect(data(pending).to).toEqual([{ kind: 'agent', id: worker.id }])
  expect(t.client.sqlite.prepare('SELECT * FROM records WHERE id = ?').get(old)).toEqual(oldRecord)
  expect(t.client.sqlite.prepare('SELECT * FROM message_delivery WHERE message_id = ?').all(old)).toEqual(oldDeliveries)
  sweepDeadLetters(t.api.HUMAN)
  expect(data(pending).routed).toEqual(routed)
  expect(t.client.sqlite.prepare('SELECT recipient_id FROM message_delivery WHERE message_id = ?').all(pending)).toEqual([{ recipient_id: worker.id }])
})

it('an ownerless agent that returns can read its own preserved message', async () => {
  const worker = await registered('worker')
  // The person registered this worker, so it is the person's until its owner is cleared, as an old agent with no recorded owner is.
  setFixtureOwner(t.client.sqlite, null, worker.id)
  run(worker, 'finished', false)
  const letter = await note(worker.id, null, 409)
  const original = data(letter)
  const { OWNERLESS_ROUTING_ENDING, routedOf } = await import('../src/shared/messages.ts')
  expect(routedOf(original)[0]).toMatchObject({ for: { kind: 'agent', id: worker.id }, to: null, said: { ending: { how: OWNERLESS_ROUTING_ENDING } } })
  expect(original.to).toEqual([{ kind: 'agent', id: worker.id }])
  const session = run(worker, 'running', false)
  await ownProcess(session)
  const { sweepDeadLetters } = await import('../src/server/lib/deadletters.ts')
  sweepDeadLetters(t.api.HUMAN)
  sweepDeadLetters(t.api.HUMAN)
  const waiting = await app.inject({ method: 'GET', url: '/api/messages?only=waiting-for-me&limit=25', headers: agent(worker.id) })
  expect(waiting.statusCode).toBe(200)
  expect(waiting.json().messages.map((message: { id: string }) => message.id)).toContain(letter)
  const marked = await app.inject({ method: 'POST', url: `/api/messages/${letter}/mark`, headers: agent(worker.id), payload: { mark: 'seen' } })
  expect(marked.statusCode).toBe(200)
  expect(t.client.sqlite.prepare('SELECT recipient_id, mark FROM message_delivery WHERE message_id = ?').all(letter)).toEqual([{ recipient_id: worker.id, mark: 'seen' }])
  expect(data(letter).to).toEqual(original.to)
  expect(data(letter).body).toBe(original.body)
})

it('a letter sent after a run ends reaches a reachable starter, retaining its original addressee', async () => {
  const sender = await registered('supervisor')
  const starter = await registered('supervisor')
  const worker = await registered('worker', starter.id)
  const starterRun = run(starter)
  await ownProcess(starterRun)
  run(worker, 'finished')
  const letter = await note(worker.id, sender.id, 409)
  expect(data(letter).routed).toHaveLength(1)
  expect(data(letter).routed[0].to).toEqual({ kind: 'agent', id: starter.id })
  expect(data(letter).to).toEqual([{ kind: 'agent', id: worker.id }])
  expect(t.client.sqlite.prepare('SELECT mark FROM message_delivery WHERE message_id = ? AND recipient_id = ?').get(letter, worker.id)).toEqual({ mark: 'queued' })
})

it('letters to an ended worker wait for an available owner', async () => {
  const { PARTICIPANT_KINDS } = await import('../src/shared/participants.ts')
  for (const senderKind of PARTICIPANT_KINDS) {
  const sender = senderKind === 'agent' ? await registered('supervisor') : null
  const owner = await registered('supervisor')
  const worker = await registered('worker', owner.id)
  run(worker, 'finished')
  const letter = await note(worker.id, sender?.id ?? null, 409)
  const before = data(letter)
  const { PERSON_OWNER_ROUTING_ENDING } = await import('../src/shared/messages.ts')
  expect(before.routed).toHaveLength(1)
  expect(before.routed[0]).toMatchObject({ for: { kind: 'agent', id: worker.id }, to: null, said: { ending: { how: PERSON_OWNER_ROUTING_ENDING } } })
  expect(before.to).toEqual([{ kind: 'agent', id: worker.id }])
  expect(t.client.sqlite.prepare('SELECT mark FROM message_delivery WHERE message_id = ? AND recipient_id = ?').get(letter, worker.id)).toEqual({ mark: 'queued' })
  const { sweepDeadLetters } = await import('../src/server/lib/deadletters.ts')
  sweepDeadLetters(t.api.HUMAN)
  expect(data(letter)).toEqual(before)
  await ownProcess(run(owner))
  sweepDeadLetters(t.api.HUMAN)
  sweepDeadLetters(t.api.HUMAN)
  const after = data(letter)
  expect(after.to).toEqual(before.to)
  expect(after.sentBy).toEqual(before.sentBy)
  expect(after.body).toEqual(before.body)
  expect(after.routed.filter((entry: any) => entry.to?.id === owner.id)).toHaveLength(1)
  expect(t.client.sqlite.prepare('SELECT count(*) AS n FROM message_delivery WHERE message_id = ? AND recipient_id = ?').get(letter, owner.id)).toEqual({ n: 1 })
  t.client.sqlite.prepare('UPDATE session_resources SET released_at = ? WHERE released_at IS NULL').run('2000-01-01 00:00:00')
  }
})

it('a returning ended worker receives its waiting letter before an owner', async () => {
  const sender = await registered('supervisor')
  const owner = await registered('supervisor')
  const worker = await registered('worker', owner.id)
  run(worker, 'finished')
  const letter = await note(worker.id, sender.id, 409)
  const before = data(letter)
  await ownProcess(run(owner))
  await ownProcess(run(worker))
  const { sweepDeadLetters } = await import('../src/server/lib/deadletters.ts')
  sweepDeadLetters(t.api.HUMAN)
  sweepDeadLetters(t.api.HUMAN)
  expect(data(letter)).toEqual(before)
  expect(t.client.sqlite.prepare('SELECT recipient_id FROM message_delivery WHERE message_id = ?').all(letter)).toEqual([{ recipient_id: worker.id }])
})

it.each(['&offset=1', '&state=seen', '&words=synthetic', '&markDelivered=1'])('checkpoint flags explicitly refuse incompatible semantics: %s', async flags => {
  const starter = await registered('supervisor')
  const worker = await registered('worker', starter.id)
  const session = run(worker)
  await ownProcess(session)
  const pending = await note(worker.id, starter.id, 201)
  const reply = await app.inject({ method: 'GET', url: `/api/messages?only=waiting-for-me&checkpoint=1${flags}`,
    headers: { ...agent(worker.id), 'x-mole-office-session': session } })
  expect(reply.statusCode, reply.body).toBe(200)
  expect(reply.json().checkpoint.supported).toBe(false)
  expect(reply.json().messages).toEqual([])
  expect(t.client.sqlite.prepare('SELECT mark FROM message_delivery WHERE message_id = ? AND recipient_id = ?').get(pending, worker.id)).toEqual({ mark: 'queued' })
})

it('strict grey sending still keeps the registered starter note after its own checkpoint worker ends', async () => {
  const { THE_MESSAGE_DOOR_SETTING } = await import('../src/server/lib/env.ts')
  const previous = process.env[THE_MESSAGE_DOOR_SETTING]
  process.env[THE_MESSAGE_DOOR_SETTING] = '1'
  try {
    const starter = await registered('supervisor')
    await ownProcess(run(starter), process.ppid)
    const worker = await registered('worker', starter.id)
    const session = run(worker)
    const model = await ownProcess(session)
    t.client.sqlite.prepare('UPDATE session_resources SET released_at = ? WHERE id = ?').run('2000-01-01 00:00:00', model.id)
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'finished') WHERE id = ?").run(session)
    const letter = await note(worker.id, starter.id, 409)
    expect(data(letter).routed).toHaveLength(1)
    expect(data(letter).routed[0]).toMatchObject({ to: null, said: { ending: { how: 'the owner sent it' } } })
    expect(data(letter).to).toEqual([{ kind: 'agent', id: worker.id }])
    expect(t.client.sqlite.prepare('SELECT recipient_id, mark FROM message_delivery WHERE message_id = ?').all(letter)).toEqual([{ recipient_id: worker.id, mark: 'queued' }])
  } finally {
    if (previous === undefined) delete process.env[THE_MESSAGE_DOOR_SETTING]
    else process.env[THE_MESSAGE_DOOR_SETTING] = previous
  }
})

it('strict grey sending keeps refusing unrelated, unknown, retired and unsupported-runtime addressees', async () => {
  const { THE_MESSAGE_DOOR_SETTING } = await import('../src/server/lib/env.ts')
  const previous = process.env[THE_MESSAGE_DOOR_SETTING]
  process.env[THE_MESSAGE_DOOR_SETTING] = '1'
  try {
    const starter = await registered('supervisor')
    const otherStarter = await registered('supervisor')
    const unrelated = await registered('worker', otherStarter.id)
    run(unrelated, 'finished')
    const retired = await registered('worker', starter.id)
    run(retired, 'finished')
    t.client.sqlite.prepare("UPDATE agents SET retired = 1, retired_because = 'Synthetic task ended.' WHERE id = ?").run(retired.id)
    const refused = [unrelated.id, retired.id, 'synthetic-never-registered']
    for (const runtime of AGENT_RUNTIMES.filter(runtime => !CHECKPOINT_RUNTIMES.includes(runtime))) {
      const unsupported = await registered('worker', starter.id, runtime)
      run(unsupported, 'finished', true, runtime)
      refused.push(unsupported.id)
    }
    for (const id of refused) {
      const count = () => (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'message'").get() as { n: number }).n
      const before = count()
      const reply = await app.inject({ method: 'POST', url: '/api/records', headers: agent(starter.id),
        payload: { kind: 'message', title: 'Synthetic strict send', data: { to: [{ kind: 'agent', id }], body: 'Synthetic unrelated letter.' } } })
      expect(reply.statusCode, reply.body).toBeGreaterThanOrEqual(400)
      expect(count()).toBe(before)
    }
  } finally {
    if (previous === undefined) delete process.env[THE_MESSAGE_DOOR_SETTING]
    else process.env[THE_MESSAGE_DOOR_SETTING] = previous
  }
})
