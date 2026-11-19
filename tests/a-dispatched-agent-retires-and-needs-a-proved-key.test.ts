// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** All writes use a throwaway office. No message worker is started. */
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, fakeTranscript, freshDb, type TestDb } from './helpers.ts'
import { CANNOT_REACH_WORDS, deliveryReading } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let person: Record<string, string>
let office: Record<string, string>
const unproved = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

/**
 * ONE OFFICE FOR THE FILE. Each case files the agents, threads, runs and records it acts on, so a
 * case reads only its own. Two cases close the key window; nothing reopens it, so the office's row
 * is put back to open after each case, which is the state the office began in.
 *
 * The three modules below are loaded once, here, so they are the instances the server itself uses.
 * `freshDb` resets the module registry, and a module a later case imported would not be the one the
 * running server reads.
 */
let agentForRecord: typeof import('../src/server/lib/participants.ts').agentForRecord
let deadLettersInTheQueue: typeof import('../src/server/lib/worker.ts').deadLettersInTheQueue
let deadLettersNow: typeof import('../src/server/lib/deadletters.ts').deadLettersNow
let forgetTheKeyWindowThisProcessRead: typeof import('../src/server/lib/keywindow.ts').forgetTheKeyWindowThisProcessRead

async function anOffice(): Promise<void> {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const keys = JSON.parse(readFileSync(join(dirname(t.file), 'keys.json'), 'utf8'))
  person = { ...unproved, 'x-mole-office-key': keys.person }
  office = { ...unproved, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker', 'x-mole-office-key': keys.office }
}

beforeAll(async () => {
  await anOffice()
  ;({ agentForRecord } = await import('../src/server/lib/participants.ts'))
  ;({ deadLettersInTheQueue } = await import('../src/server/lib/worker.ts'))
  ;({ deadLettersNow } = await import('../src/server/lib/deadletters.ts'))
  ;({ forgetTheKeyWindowThisProcessRead } = await import('../src/server/lib/keywindow.ts'))
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/**
 * GIVE THE OFFICE BACK THE TWO THINGS A CASE CHANGES AND THE NEXT CASE ASSUMES.
 *
 * A run's key file is the office's, and a case that leaves a run open leaves its file behind. And a
 * case that closes the key window would leave it closed for the rest of the file, though the office
 * began with it open, so the row is put back and the reading this process keeps is dropped.
 */
function putBackWhatACaseChanges(): void {
  const directory = join(dirname(t.file), 'agent-run-keys')
  if (existsSync(directory)) for (const one of readdirSync(directory)) rmSync(join(directory, one), { force: true })
  // A live agent a case made and left with every key revoked would refuse the next close press, so
  // this office retires it. A case's own assertions have already been made when this runs.
  const proved = new Set(
    (t.client.sqlite
      .prepare(
        "SELECT whose_id FROM held_keys WHERE whose_kind = 'agent' AND revoked_at IS NULL AND mint_proved_by IN ('the-persons-press', 'the-persons-key', 'the-offices-key', 'a-proved-agents-key')",
      )
      .all() as { whose_id: string }[]).map((one) => one.whose_id),
  )
  for (const agent of t.client.sqlite.prepare('SELECT id, handle FROM agents WHERE retired = 0').all() as { id: string; handle: string }[]) {
    if (agent.handle === 'mole-office' || proved.has(agent.id) || proved.has(agent.handle)) continue
    t.client.sqlite
      .prepare('UPDATE agents SET retired = 1, retired_because = ? WHERE id = ?')
      .run('This test office retired an agent the case made, so the next case began as this file did.', agent.id)
  }
  t.client.sqlite
    .prepare('UPDATE installation SET window_closed_at = NULL, window_closed_by_kind = NULL, window_closed_by_id = NULL WHERE only_row = 1')
    .run()
  forgetTheKeyWindowThisProcessRead()
}

afterEach(() => {
  putBackWhatACaseChanges()
})
function ask(method: 'POST' | 'GET' | 'PATCH', url: string, payload?: unknown, headers = person) {
  return app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
}
async function file(kind: string, title: string, data: Record<string, unknown> = {}, answers: 201 | 409 = 201) {
  const r = await ask('POST', '/api/records', { kind, title, data })
  expect(r.statusCode, r.body).toBe(answers)
  return r.json().record.id as string
}
async function thread(recipient: Record<string, unknown> = { kind: 'new' }) {
  const made = await ask('POST', '/api/agent/threads', { title: 'Synthetic queued work', mode: 'direct' })
  expect(made.statusCode).toBe(201)
  const id = made.json().thread.id as string
  const said = await ask('POST', `/api/agent/threads/${id}/messages`, { intent: 'discuss', body: 'Synthetic words kept for the agent.', recipient })
  expect(said.statusCode, said.body).toBe(201)
  return id
}
function row(run: string) {
  const one = t.client.sqlite.prepare('SELECT agent_id, request, state FROM agent_runs WHERE id = ?').get(run) as { agent_id: string; request: string; state: string }
  const agent = t.client.sqlite.prepare('SELECT a.* FROM agents a JOIN agent_records m ON m.agent_id = a.id WHERE m.record_id = ?').get(one.agent_id) as { id: string; retired: number; retired_because: string; name: string; handle: string }
  return { ...one, agent, request: JSON.parse(one.request) as { agentKeyId: string; actorId: string } }
}
async function dispatch(to = { kind: 'new' } as Record<string, unknown>) {
  const id = await thread(to)
  const sent = await ask('POST', `/api/agent/threads/${id}/dispatch`)
  expect(sent.statusCode, sent.body).toBe(201)
  return { thread: id, run: sent.json().runs[0].id as string }
}
function keyFiles() {
  const directory = join(dirname(t.file), 'agent-run-keys')
  return existsSync(directory) ? readdirSync(directory).sort() : []
}
function snapshot() {
  return { runs: t.client.sqlite.prepare('SELECT * FROM agent_runs').all(), keys: t.client.sqlite.prepare('SELECT * FROM held_keys').all(), files: keyFiles() }
}
function key(run: string) {
  return t.client.sqlite.prepare('SELECT mint_proved_by, revoked_at FROM held_keys WHERE id = ?').get(row(run).request.agentKeyId) as { mint_proved_by: string; revoked_at: string | null }
}

for (const ending of ['finished', 'failed', 'crashed', 'ended by the person'] as const) {
  it(`retires a new recipient when its run is ${ending}, including after a later record edit`, async () => {
    const { run } = await dispatch()
    const result = ending === 'finished' ? { result: { answer: 'Synthetic work is complete.' } } : { error: ending === 'ended by the person' ? 'The person ended this run.' : `Synthetic run ${ending}.` }
    const ended = await ask('POST', `/api/agent/runs/${run}/result`, result, ending === 'ended by the person' ? person : office)
    expect(ended.statusCode, ended.body).toBe(200)
    const after = row(run)
    expect(after.agent.retired).toBe(1)
    expect(after.agent.retired_because).toContain(run)
    expect(key(run).revoked_at).not.toBeNull()
    expect(keyFiles()).toEqual([])
    const changed = await ask('PATCH', `/api/records/${after.agent_id}`, { summary: 'A later synthetic record edit.' })
    expect(changed.statusCode, changed.body).toBe(200)
    expect(row(run).agent.retired).toBe(1)
    expect((await ask('GET', `/api/records/${after.agent_id}`)).json().record.data.state).toBe('retired')
  })
}

it('keeps the agent and its key on decline, then retires it after another worker answers', async () => {
  const { run } = await dispatch()
  const declined = await ask('POST', `/api/agent/runs/${run}/result`, { declined: true, error: 'Synthetic worker cannot serve this run.' }, office)
  expect(declined.statusCode).toBe(200)
  expect(row(run).agent.retired).toBe(0)
  expect(key(run).revoked_at).toBeNull()
  expect(keyFiles()).toContain(run)
  const next = await ask('POST', `/api/agent/runs/${run}/claim`, { worker: 'another synthetic worker' }, office)
  expect(next.statusCode, next.body).toBe(200)
  expect(typeof next.json().runKey === 'string').toBe(true)
  expect((await ask('POST', `/api/agent/runs/${run}/result`, { result: { answer: 'Answered on the second worker.' } }, office)).statusCode).toBe(200)
  expect(row(run).agent.retired).toBe(1)
  expect(keyFiles()).toEqual([])
})

it.each(['secretary', 'supervisor', 'worker'])('gives an existing %s a proved run key and leaves it active at the end', async (role) => {
  const agentId = await file('agent', `Synthetic ${role}`, { handle: `synthetic-${role}`, state: 'active', runtime: 'claude-code', role })
  const { run } = await dispatch({ kind: 'agent', agentId })
  expect(key(run).mint_proved_by).toBe('the-persons-press')
  const claimed = await ask('POST', `/api/agent/runs/${run}/claim`, { worker: 'synthetic worker' }, office)
  expect(claimed.statusCode, claimed.body).toBe(200)
  expect(typeof claimed.json().runKey === 'string').toBe(true)
  expect((await ask('POST', `/api/agent/runs/${run}/result`, { error: 'Synthetic end.' }, office)).statusCode).toBe(200)
  expect(row(run).agent.retired).toBe(0)
  expect(key(run).revoked_at).not.toBeNull()
  expect(keyFiles()).toEqual([])
})

for (const closed of [false, true]) {
  describe(closed ? 'after the key window closes' : 'while the key window is open', () => {
    it('keeps a retired recipient’s comments queued, then the proved press dispatches a different agent', async () => {
      const { run } = await dispatch()
      expect((await ask('POST', `/api/agent/runs/${run}/result`, { result: { answer: 'Done.' } })).statusCode).toBe(200)
      const old = row(run)
      if (closed) expect((await ask('POST', '/api/office/key-window/close', {})).statusCode).toBe(200)
      const queued = await thread({ kind: 'agent', agentId: old.agent_id })
      const before = snapshot()
      const refused = await ask('POST', `/api/agent/threads/${queued}/dispatch`)
      expect(refused.statusCode, refused.body).toBe(409)
      expect(refused.json().error).toContain(CANNOT_REACH_WORDS.cannotReach(old.agent.name))
      expect(refused.json().error).toContain(CANNOT_REACH_WORDS.startANewAgent)
      expect(snapshot()).toEqual(before)
      expect((await ask('GET', `/api/agent/threads/${queued}`)).json().messages[0].state).toBe('queued')
      const denied = await ask('POST', `/api/agents/${old.agent.id}/start-a-new-agent`, {}, unproved)
      expect(denied.statusCode).toBe(403)
      expect(snapshot()).toEqual(before)
      const press = await ask('POST', `/api/agents/${old.agent.id}/start-a-new-agent`, {})
      expect(press.statusCode, press.body).toBe(200)
      expect(press.json().agent).not.toBe(old.agent_id)
      expect(press.json().agent).toBeTruthy()
      const made = t.client.sqlite.prepare('SELECT id FROM agent_runs WHERE agent_id = ?').get(press.json().agent) as { id: string }
      expect(key(made.id).mint_proved_by).toBe('the-persons-press')
      // WHERE IT CAME FROM, AS FACTS (round 37), on this path as on the chat path.
      expect((await ask('GET', `/api/records/${String(press.json().agent)}`)).json().record.data.branchedFrom)
        .toEqual({ agent: old.agent.id, handle: old.agent.handle })
      expect(row(run).agent.retired).toBe(1)
      const claimed = await ask('POST', `/api/agent/runs/${made.id}/claim`, { worker: 'synthetic replacement' }, office)
      expect(claimed.statusCode, claimed.body).toBe(200)
      expect(typeof claimed.json().runKey === 'string').toBe(true)
      expect((await ask('GET', `/api/agent/threads/${queued}`)).json().messages[0].state).toBe('sent')
    })
    it('refuses an unproved press for an active recipient before writing any run or key', async () => {
      const agent = await file('agent', 'Synthetic active agent', { handle: `synthetic-active-${closed ? 'closed' : 'open'}`, state: 'active', runtime: 'claude-code' })
      // The first proved dispatch supplies this live agent a key before the close.
      await dispatch({ kind: 'agent', agentId: agent })
      if (closed) expect((await ask('POST', '/api/office/key-window/close', {})).statusCode).toBe(200)
      const queued = await thread({ kind: 'agent', agentId: agent })
      const before = snapshot()
      expect((await ask('POST', `/api/agent/threads/${queued}/dispatch`, undefined, unproved)).statusCode).toBe(403)
      expect(snapshot()).toEqual(before)
    })
  })
}

it('removes a key file when the review transaction fails after dispatch returned', async () => {
  const target = await file('note', 'Synthetic review target')
  const review = (await ask('POST', '/api/reviews', { entry: { target: { kind: 'record', recordId: target, workspaceId: 'default' } } })).json().review.id
  const comment = await file('annotation', 'Synthetic review comment', { body: 'Read the synthetic note.', context: { target: { kind: 'record', recordId: target, workspaceId: 'default' } } })
  expect((await ask('POST', `/api/reviews/${review}/finish-collecting`)).statusCode).toBe(200)
  const before = snapshot()
  t.client.sqlite.exec("CREATE TEMP TRIGGER fail_after_dispatch BEFORE UPDATE OF state ON reviews WHEN NEW.state = 'sent' BEGIN SELECT RAISE(ABORT, 'Synthetic failure after dispatch'); END")
  const failed = await ask('POST', `/api/reviews/${review}/send`, { to: [{ commentId: comment, recipient: { kind: 'new' } }] })
  expect(failed.statusCode, failed.body).toBe(409)
  expect(failed.body).toContain('Synthetic failure after dispatch')
  expect(snapshot()).toEqual(before)
  expect(t.client.sqlite.prepare("SELECT state FROM agent_messages WHERE from_annotation_id = ?").get(comment)).toEqual({ state: 'queued' })
  t.client.sqlite.exec('DROP TRIGGER fail_after_dispatch')
  expect((await ask('POST', `/api/reviews/${review}/send`, { to: [] })).statusCode).toBe(200)
})

it('keeps the ordinary chat branch and gives its run the press proof', async () => {
  const agent = await file('agent', 'Synthetic unreachable agent', { handle: 'synthetic-chat', state: 'active', runtime: 'claude-code' })
  const old = agentForRecord(agent)!
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  await file('message', 'Synthetic chat request', { body: 'Synthetic chat words.', to: [{ kind: 'agent', id: old.id }] }, 409)
  const press = await ask('POST', `/api/agents/${old.id}/start-a-new-agent`, {})
  expect(press.statusCode, press.body).toBe(200)
  const made = agentForRecord(press.json().agent)!
  const run = await ask('POST', '/api/records', { kind: 'session', title: 'Synthetic message-worker run', data: {
    state: 'running', runtime: 'claude-code', servingAgent: made.handle, servingAgentId: made.id,
    startedByMoleOffice: true, deliveringMessage: press.json().moved[0],
  } }, office)
  expect(run.statusCode, run.body).toBe(201)
  expect(typeof run.json().runKey?.key === 'string').toBe(true)
  const stored = (await ask('GET', `/api/records/${run.json().record.id}`)).json().record
  const kept = t.client.sqlite.prepare('SELECT mint_proved_by FROM held_keys WHERE id = ?').get(stored.data.extra.runKeyId)
  expect(kept).toEqual({ mint_proved_by: 'the-persons-press' })
  expect(agentForRecord(agent)!.id).not.toBe(made.id)
})


it.each(['agent', 'session'])('keeps only the retired %s recipient’s review comments for the press', async (kind) => {
  const old = await dispatch()
  await ask('POST', `/api/agent/runs/${old.run}/result`, { result: { answer: 'Done.' } })
  const retired = row(old.run)
  const target = await file('note', 'Synthetic held-review target')
  const review = (await ask('POST', '/api/reviews', { entry: { target: { kind: 'record', recordId: target, workspaceId: 'default' } } })).json().review.id
  const comment = await file('annotation', 'Synthetic held-review comment', { body: 'These review words wait.', context: { target: { kind: 'record', recordId: target, workspaceId: 'default' } } })
  await ask('POST', `/api/reviews/${review}/finish-collecting`)
  const otherAgent = await file('agent', 'Synthetic other recipient', { handle: `synthetic-other-${kind}`, state: 'active' })
  const other = await thread({ kind: 'agent', agentId: otherAgent })
  const before = snapshot()
  const recipient = kind === 'agent' ? { kind, agentId: retired.agent_id } : { kind, sessionId: await file('session', 'Synthetic retired review session', { state: 'idle', runtime: 'claude-code', ranAs: [{ workspaceId: 'default', agentId: retired.agent_id }] }) }
  const held = await ask('POST', `/api/reviews/${review}/send`, { to: [{ commentId: comment, recipient }] })
  expect(held.statusCode, held.body).toBe(409)
  expect(held.body).toContain(CANNOT_REACH_WORDS.cannotReach(retired.agent.name))
  expect(snapshot()).toEqual(before)
  const press = await ask('POST', `/api/agents/${retired.agent.id}/start-a-new-agent`, {})
  expect(press.statusCode, press.body).toBe(200)
  const made = t.client.sqlite.prepare('SELECT request FROM agent_runs WHERE agent_id = ?').get(press.json().agent) as { request: string }
  expect(JSON.parse(made.request).messages.map((m: { body: string }) => m.body)).toEqual(['These review words wait.'])
  expect((await ask('GET', `/api/agent/threads/${other}`)).json().messages[0].state).toBe('queued')
  const reading = (await ask('GET', `/api/reviews/${review}`)).json()
  expect(JSON.stringify(reading)).toContain('These review words wait.')
  expect(t.client.sqlite.prepare("SELECT state FROM agent_messages WHERE from_annotation_id = ?").all(comment)).toEqual([{ state: 'sent' }, { state: 'sent' }])
  expect(row(old.run).agent.retired).toBe(1)
})

it('gives an addressed session its registered agent’s key and refuses it after retirement', async () => {
  const { run } = await dispatch()
  const original = row(run)
  const externalId = 'synthetic-session-to-dispatch'
  const session = await file('session', 'Synthetic addressed session', { state: 'idle', runtime: 'claude-code', servingAgent: original.agent.handle,
    servingAgentId: original.agent.id, extra: { discovered: { tool: 'claude-code', externalId,
      logPath: fakeTranscript(externalId), resumeCommand: `claude --resume ${externalId}`, observedState: 'idle',
      stateReason: 'Synthetic transcript.', filesTouched: [], filesComplete: true, at: '2026-09-27 01:00:00' } } })
  const addressed = await dispatch({ kind: 'session', sessionId: session })
  expect(key(addressed.run).mint_proved_by).toBe('the-persons-press')
  expect(row(addressed.run).request.actorId).toBe(original.agent.handle)
  const claimed = await ask('POST', `/api/agent/runs/${addressed.run}/claim`, { worker: 'synthetic session worker' }, office)
  expect(claimed.statusCode).toBe(200)
  expect(typeof claimed.json().runKey === 'string').toBe(true)
  await ask('POST', `/api/agent/runs/${addressed.run}/result`, { error: 'Synthetic end.' })
  expect(row(run).agent.retired).toBe(0)
  await ask('POST', `/api/agent/runs/${run}/result`, { result: { answer: 'Done.' } })
  const queued = await thread({ kind: 'session', sessionId: session })
  const before = snapshot()
  const held = await ask('POST', `/api/agent/threads/${queued}/dispatch`)
  expect(held.statusCode, held.body).toBe(409)
  expect(held.body).toContain(CANNOT_REACH_WORDS.cannotReach(original.agent.name))
  expect(snapshot()).toEqual(before)
})

it('carries held comments and chat messages once across two presses on a retired agent', async () => {
  const first = await dispatch()
  expect((await ask('POST', `/api/agent/runs/${first.run}/result`, { result: { answer: 'Synthetic work finished.' } })).statusCode).toBe(200)
  const old = row(first.run)
  const held = await thread({ kind: 'agent', agentId: old.agent_id })
  const commentOne = (await ask('GET', `/api/agent/threads/${held}`)).json().messages[0].id
  t.client.sqlite.prepare("UPDATE agent_messages SET body = 'Synthetic comment one.', created_at = '2026-01-01 00:00:01' WHERE id = ?").run(commentOne)
  const one = await ask('POST', '/api/records', { kind: 'message', title: 'Synthetic chat one', data: { body: 'Synthetic chat one.', to: [{ kind: 'agent', id: old.agent.id }] } })
  expect(one.statusCode, one.body).toBe(409)
  const chatOne = one.json().record.id
  const next = await ask('POST', `/api/agent/threads/${held}/messages`, { intent: 'discuss', body: 'Synthetic comment two.', recipient: { kind: 'agent', agentId: old.agent_id } })
  expect(next.statusCode, next.body).toBe(201)
  const commentTwo = next.json().message.id
  t.client.sqlite.prepare("UPDATE agent_messages SET created_at = '2026-01-01 00:00:03' WHERE id = ?").run(commentTwo)
  const two = await ask('POST', '/api/records', { kind: 'message', title: 'Synthetic chat two', data: { body: 'Synthetic chat two.', to: [{ kind: 'agent', id: old.agent.id }] } })
  expect(two.statusCode, two.body).toBe(409)
  const chatTwo = two.json().record.id
  t.client.sqlite.prepare("UPDATE records SET created_at = '2026-01-01 00:00:02' WHERE id = ?").run(chatOne)
  t.client.sqlite.prepare("UPDATE records SET created_at = '2026-01-01 00:00:04' WHERE id = ?").run(chatTwo)
  const before = [chatOne, chatTwo].map((id) => t.client.sqlite.prepare('SELECT * FROM records WHERE id = ?').get(id))
  const press = await ask('POST', `/api/agents/${old.agent.id}/start-a-new-agent`, {})
  expect(press.statusCode, press.body).toBe(200)
  const made = t.client.sqlite.prepare('SELECT id FROM agent_runs WHERE agent_id = ?').all(press.json().agent) as { id: string }[]
  expect(made).toHaveLength(1)
  const claimed = await ask('POST', `/api/agent/runs/${made[0]!.id}/claim`, { worker: 'synthetic replacement' }, office)
  expect(claimed.statusCode, claimed.body).toBe(200)
  expect(claimed.json().run.messages.map((message: { body: string }) => message.body)).toEqual([
    'Synthetic comment one.', 'Synthetic chat one.', 'Synthetic comment two.', 'Synthetic chat two.',
  ])
  expect(key(made[0]!.id).mint_proved_by).toBe('the-persons-press')
  expect((await ask('POST', `/api/agent/runs/${made[0]!.id}/claim`, { worker: 'synthetic second claimant' }, office)).statusCode).toBe(409)
  expect([chatOne, chatTwo].map((id) => t.client.sqlite.prepare('SELECT * FROM records WHERE id = ?').get(id))).toEqual(before)
  for (const id of [chatOne, chatTwo]) {
    const carried = t.client.sqlite.prepare('SELECT mark, because FROM message_delivery WHERE message_id = ? AND recipient_id = ?').get(id, old.agent.id) as { mark: string; because: string }
    expect(carried).toEqual({ mark: 'delivered', because: expect.stringContaining(`carried this message to "${press.json().handle}"`) })
    expect(deliveryReading(carried).sentence).toBe(carried.because)
    expect(deliveryReading(carried).sentence).toContain(`"${old.agent.handle}" did not read it.`)
    expect(deliveryReading(carried).sentence).not.toContain('has read this message')
  }
  expect((await ask('GET', `/api/agent/threads/${held}`)).json().messages.map((message: { state: string }) => message.state)).toEqual(['sent', 'sent'])
  expect((await ask('GET', `/api/handles/${old.agent.id}/waiting`)).json().waiting.filter((one: { messageId: string }) => [chatOne, chatTwo].includes(one.messageId))).toEqual([])

  const laterComments = await thread({ kind: 'agent', agentId: old.agent_id })
  const later = await ask('POST', '/api/records', { kind: 'message', title: 'Synthetic later chat', data: { body: 'Synthetic chat after the first press.', to: [{ kind: 'agent', id: old.agent.id }] } })
  expect(later.statusCode, later.body).toBe(409)
  const laterChat = later.json().record.id as string
  const secondPress = await ask('POST', `/api/agents/${old.agent.id}/start-a-new-agent`, {})
  expect(secondPress.statusCode, secondPress.body).toBe(200)
  expect(secondPress.json().agent).not.toBe(press.json().agent)
  const secondRuns = t.client.sqlite.prepare('SELECT id FROM agent_runs WHERE agent_id = ?').all(secondPress.json().agent) as { id: string }[]
  expect(secondRuns).toHaveLength(1)
  const secondClaim = await ask('POST', `/api/agent/runs/${secondRuns[0]!.id}/claim`, { worker: 'synthetic later replacement' }, office)
  expect(secondClaim.statusCode, secondClaim.body).toBe(200)
  expect(secondClaim.json().run.messages.map((message: { body: string }) => message.body)).toEqual([
    'Synthetic words kept for the agent.', 'Synthetic chat after the first press.',
  ])
  expect((await ask('GET', `/api/agent/threads/${laterComments}`)).json().messages[0].state).toBe('sent')
  expect((await ask('GET', `/api/handles/${old.agent.id}/waiting`)).json().waiting.filter((one: { messageId: string }) => [chatOne, chatTwo, laterChat].includes(one.messageId))).toEqual([])
  expect(t.client.sqlite.prepare('SELECT mark, because FROM message_delivery WHERE message_id = ? AND recipient_id = ?').get(laterChat, old.agent.id)).toEqual({ mark: 'delivered', because: expect.stringContaining(`carried this message to "${secondPress.json().handle}"`) })
  const conversation = await ask('GET', `/api/messages/conversation?kind=agent&id=${old.agent.id}`)
  expect(conversation.json().messages.map((message: { id: string }) => message.id)).toEqual(expect.arrayContaining([chatOne, chatTwo, laterChat]))
  expect(deadLettersNow().filter((one) => [chatOne, chatTwo, laterChat].includes(one.messageId))).toEqual([])
  for (const id of [chatOne, chatTwo, laterChat]) t.client.sqlite.prepare("UPDATE records SET deleted_at = '2026-01-01 00:00:00' WHERE id = ?").run(id)
  expect(deadLettersInTheQueue('default').filter((one) => [chatOne, chatTwo, laterChat].includes(one.messageId))).toEqual([])
  expect(row(first.run).agent.retired).toBe(1)
})
