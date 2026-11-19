// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { spawn } from 'node:child_process'
import { once } from 'node:events'
/** Every record, key and check here belongs to this throwaway office. */
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { historicalSession } from './synthetic-submission-fixtures.ts'
import { apiApp, freshDb, writeAVerdictAsItsDoorWould, type TestDb } from './helpers.ts'
import { howARunStands, RUN_STANDING } from '../src/shared/releasing.ts'
import { classifyPixelWork } from '../src/shared/pixel-office.ts'
import type { DeltaOp } from '../src/shared/delta.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance
let inspection: typeof import('../src/server/lib/inspection.ts')
let secretaryId: string
const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const worker = { type: 'agent', id: 'unchecked-worker' } as const
const PERSON_KEY = 'a'.repeat(64)
const headers = (type: string, id: string, key?: string) => ({
  'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': type, 'x-mole-office-actor-id': id,
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
})
const asPerson = headers('human', THE_TEST_OFFICES_OWNER.id, PERSON_KEY)
let asSecretary: Record<string, string>
let asWorker: Record<string, string>
const because = 'Synthetic: the old check was never started and nobody will run it.'
const requested = { askedAt: '2026-09-26 09:00:00', checkout: { directory: '/synthetic/old-checkout', cutFrom: 'main' }, says: 'Synthetic check waiting.' }
const aClosure = { by: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }, at: '2026-09-26 10:00:00', because }

async function register(handle: string, role = 'worker') {
  const response = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asPerson, payload: { handle, name: `Synthetic ${handle}`, role, ...(role === 'worker' ? { workArea: ['work'] } : {}) } })
  expect(response.statusCode).toBe(201)
  const participants = await import('../src/server/lib/participants.ts')
  return participants.agentByHandle(handle)!.id
}
beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({ person: PERSON_KEY, office: 'b'.repeat(64), providers: {} }))
  app = (await apiApp()).app
  inspection = await import('../src/server/lib/inspection.ts')
  secretaryId = await register('unchecked-secretary', 'secretary')
  const workerId = await register(worker.id)
  await register('unchecked-inspector', 'inspector')
  const keys = await import('../src/server/lib/keys.ts')
  asSecretary = headers('agent', 'unchecked-secretary', keys.makeAnAgentKey(secretaryId, null))
  asWorker = headers('agent', worker.id, keys.makeAnAgentKey(workerId, null))
})
afterAll(async () => { await app?.close(); t?.close() })

function run(data: Record<string, unknown> = {}) {
  const held = { state: 'finished', servingAgent: worker.id, theCheck: requested, ...data }
  if (held.theCheck === undefined) delete (held as Record<string, unknown>).theCheck
  // A RUN OF ANOTHER AGENT IS FILED BY THAT AGENT: a session for an agent is filed only by that agent, those above it,
  // the person proved, or the office (the filing door of round 30), and the worker is none of them for a retiree.
  const filer = held.servingAgent === worker.id ? worker : ({ type: 'agent', id: String(held.servingAgent) } as const)
  return historicalSession(t, { workspaceId: 'default', kind: 'session', title: 'Synthetic unchecked run', origin: 'fixture', actor: filer, data: held }).id
}
function corpus() {
  return createHash('sha256').update(JSON.stringify(['records', 'changes', 'revisions', 'links', 'allocations'].map((table) =>
    t.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()))).digest('hex')
}
async function close(id: string, who = asSecretary, body: Record<string, unknown> = { because }) {
  return app.inject({ method: 'POST', url: `/api/checks/${id}/closed-unchecked`, headers: who, payload: body })
}
async function refused(id: string, status: number, words: string, who = asSecretary, body?: Record<string, unknown>) {
  const before = corpus()
  const response = await close(id, who, body)
  expect(response.statusCode, response.body).toBe(status)
  expect(response.json().error).toContain(words)
  expect(response.json().error).toContain('Nothing was written.')
  expect(corpus()).toBe(before)
}

describe('the closure belongs to a proved secretary or person', () => {
  for (const earlier of ['asked', 'refused', 'released', 'crashed', 'orphaned'] as const) {
    it(`archives a ${earlier} run with who, when, why and the decision, keeping its earlier history`, async () => {
      const id = run(earlier === 'crashed' || earlier === 'orphaned' ? { state: earlier } : {})
      if (earlier === 'released') writeAVerdictAsItsDoorWould(t, id, { released: { by: { kind: 'agent', id: 'unchecked-inspector' }, at: requested.askedAt, how: 'an inspector', check: 'synthetic-check' } })
      if (earlier === 'refused' || earlier === 'crashed' || earlier === 'orphaned') writeAVerdictAsItsDoorWould(t, id, { refused: { by: { kind: 'agent', id: 'unchecked-inspector' }, at: requested.askedAt, check: 'synthetic-check', missing: ['Synthetic missing check.'], chapter: 5, group: 'synthetic-group' } })
      const decision = t.api.createRecord({ workspaceId: 'default', kind: 'decision', title: 'Synthetic closure decision', actor: person, origin: 'fixture' })
      const before = t.api.getRecord(id)!.data
      if (earlier === 'crashed') expect(howARunStands(before).standing).toBe('rebuttal')
      const response = await close(id, asSecretary, { because, decision: decision.id })
      expect(response.statusCode, response.body).toBe(201)
      const after = t.api.getRecord(id)!.data
      const closed = after.closedUnchecked
      expect(closed).toEqual({ by: { kind: 'agent', id: secretaryId }, at: expect.stringMatching(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/), because, decision: decision.id })
      expect(after).toEqual({ ...before, closedUnchecked: closed })
      expect(response.json().stands).toMatchObject({ standing: 'closed unchecked', unreleasedFinish: false, waitingFor: null })
      expect(response.json().says).toContain('Closed unchecked by unchecked-secretary at ')
      expect(response.json().says).toContain(because)
      if (earlier === 'asked') {
        const listed = await app.inject({ method: 'GET', url: '/api/checks', headers: asPerson })
        expect(listed.json().list).toEqual([])
        expect(listed.json().says).toBe('No finished run in this project is waiting for a check.')
      }
    })
  }
  it('accepts the person’s key and records no decision when none was cited', async () => {
    const id = run()
    const response = await close(id, asPerson)
    expect(response.statusCode, response.body).toBe(201)
    expect(response.json().stands.closedUnchecked).toMatchObject({ by: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id } })
    expect(response.json().stands.closedUnchecked).not.toHaveProperty('decision')
  })
  it('refuses a keyed ordinary worker', async () => { await refused(run(), 403, 'secretary card', asWorker) })
  for (const [type, id] of [['agent', 'unchecked-secretary'], ['human', THE_TEST_OFFICES_OWNER.id]]) {
    it(`refuses the keyless ${type} claim while the key window is open`, async () => {
      await refused(run(), 403, 'even while the key window is open', headers(type!, id!))
    })
  }
  it('refuses an office key carried under the secretary’s name', async () => {
    await refused(run(), 403, 'own key', headers('agent', 'unchecked-secretary', 'b'.repeat(64)))
  })
  for (const state of ['running', 'idle', 'unknown']) {
    it(`refuses a run still ${state}`, async () => {
      const id = run({ state })
      writeAVerdictAsItsDoorWould(t, id, { refused: { by: { kind: 'agent', id: 'unchecked-inspector' }, at: requested.askedAt, check: 'synthetic-check', missing: ['Synthetic work is still in progress.'], chapter: 5, group: 'synthetic-group' } })
      await refused(id, 409, 'has not ended')
    })
  }
  it('refuses an ended run whose standing owes neither a check nor a report', async () => { await refused(run({ state: 'crashed', theCheck: undefined }), 409, 'owes no check or report') })
  it('refuses an absent decision before writing', async () => { await refused(run(), 409, 'not a decision', asSecretary, { because, decision: 'no-such-decision' }) })
  it('refuses an empty reason in the library before writing', () => {
    const id = run(); const before = corpus()
    expect(() => inspection.closeARunUnchecked({ runId: id, workspaceId: 'default', because: '  ', actor: { ...person, provedBy: 'the-person-key' } })).toThrow('Say why')
    expect(corpus()).toBe(before)
  })
})

describe('a run is settled once', () => {
  for (const settlement of ['confirmed', 'superseded', 'landedByHand', 'closedUnchecked'] as const) {
    it(`refuses an already ${settlement} run without writing`, async () => {
      const id = run()
      if (settlement === 'confirmed') writeAVerdictAsItsDoorWould(t, id, {
        released: { by: { kind: 'agent', id: 'unchecked-inspector' }, at: requested.askedAt, how: 'an inspector', check: 'synthetic-check' },
        confirmed: { by: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }, at: requested.askedAt, because },
      })
      else {
        const value = settlement === 'closedUnchecked' ? aClosure : settlement === 'superseded'
          ? { by: 'synthetic-later', at: requested.askedAt, byWhom: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }, because }
          : { commit: 'a'.repeat(40), lane: '/synthetic/main', by: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }, at: requested.askedAt, because, contains: { how: 'ancestor', laterCommit: 'a'.repeat(40), commits: [{ commit: 'a'.repeat(40), as: 'a'.repeat(40) }] } }
        t.doors.asTheDoorOf(settlement, () => t.api.patchRecord(id, { dataPatch: settlement === 'closedUnchecked' ? { closedUnchecked: value } : { theCheck: { [settlement]: value } } }, person))
      }
      await refused(id, 409, settlement === 'landedByHand' ? 'landed by hand' : settlement === 'closedUnchecked' ? 'already closed unchecked' : `already ${settlement}`)
    })
  }
  it('keeps the settlement when an old tool ends, and refuses asking again', async () => {
    const tool = run({ state: 'running' })
    const id = run({ theCheck: { ...requested, askedOf: 'unchecked-inspector', execution: { session: tool, startedAt: requested.askedAt, log: '/synthetic/log', model: 'synthetic', minutes: 1 } } })
    expect((await close(id)).statusCode).toBe(201)
    const closure = howARunStands(t.api.getRecord(id)!.data).closedUnchecked
    inspection.recordCheckToolEnded(id, tool, 'Synthetic old tool ended.', 'default')
    expect(howARunStands(t.api.getRecord(id)!.data)).toMatchObject({ closedUnchecked: closure, standing: 'closed unchecked', waitingFor: null })
    const before = corpus()
    expect(() => inspection.askForTheCheckAgain(id, 'default', person)).toThrow('closed unchecked')
    expect(corpus()).toBe(before)
  })
  it('refuses superseding a run already closed unchecked', async () => {
    const id = run(); const later = run()
    expect((await close(id)).statusCode).toBe(201)
    const before = corpus()
    expect(() => inspection.supersedeARun({ runId: id, workspaceId: 'default', by: later, because, actor: person })).toThrow('already closed unchecked')
    expect(corpus()).toBe(before)
  })
})

describe('only the closure door writes its field', () => {
  it('refuses a create carrying the closure', async () => {
    const before = corpus()
    const response = await app.inject({ method: 'POST', url: '/api/records', headers: asPerson, payload: { kind: 'session', title: 'Synthetic forged closure', data: { state: 'finished', closedUnchecked: aClosure } } })
    expect(response.statusCode, response.body).toBe(403)
    expect(response.body).toContain('closed-unchecked')
    expect(corpus()).toBe(before)
  })
  it('refuses patching the closure in, changing it or dropping it, while permitting an unchanged round trip', async () => {
    const id = run()
    async function refusePatch(payload: Record<string, unknown>) {
      const before = corpus()
      const response = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asPerson, payload })
      expect(response.statusCode, response.body).toBe(403)
      expect(response.body).toContain('closed-unchecked')
      expect(corpus()).toBe(before)
    }
    await refusePatch({ dataPatch: { closedUnchecked: aClosure } })
    expect((await close(id)).statusCode).toBe(201)
    await refusePatch({ dataPatch: { closedUnchecked: { because: 'Synthetic rewrite.' } } })
    await refusePatch({ dataPatch: { closedUnchecked: null } })
    const data = t.api.getRecord(id)!.data
    const { closedUnchecked: _closed, ...withoutClosure } = data
    await refusePatch({ data: withoutClosure, replace: true })
    const roundTrip = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asPerson, payload: { data: { ...data, doing: 'Synthetic unrelated edit.' } } })
    expect(roundTrip.statusCode, roundTrip.body).toBe(200)
  })
  for (const direction of ['into', 'out of']) {
    it(`refuses a kind change ${direction} a run carrying the closure`, async () => {
      const id = direction === 'into' ? t.api.createRecord({ workspaceId: 'default', kind: 'task', title: 'Synthetic kind change', actor: person, data: { extra: { closedUnchecked: aClosure } } }).id : run()
      if (direction !== 'into') expect((await close(id)).statusCode).toBe(201)
      const before = corpus()
      const response = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asPerson, payload: { kind: direction === 'into' ? 'session' : 'task' } })
      expect(response.statusCode, response.body).toBe(403)
      expect(response.body).toContain('closed-unchecked')
      expect(corpus()).toBe(before)
    })
  }
  it('refuses restoring the revision before the closure', async () => {
    const id = run(); expect((await close(id)).statusCode).toBe(201)
    const before = corpus()
    const response = await app.inject({ method: 'POST', url: `/api/records/${id}/revisions/1/restore`, headers: asPerson })
    expect(response.statusCode, response.body).toBe(403)
    expect(response.body).toContain('closed-unchecked')
    expect(corpus()).toBe(before)
  })
  for (const operation of ['set_field', 'create_record'] as const) {
    it(`refuses an applied proposal’s ${operation} and rolls back earlier operations`, async () => {
      const id = run()
      const bad: DeltaOp = operation === 'set_field' ? { op: operation, recordId: id, expectVersion: t.api.versionOf(t.api.getRecord(id)!), field: 'closedUnchecked', value: aClosure, says: 'Synthetic edit.' }
        : { op: operation, workspaceId: 'default', kind: 'session', title: 'Synthetic forged closure', data: { state: 'finished', closedUnchecked: aClosure }, says: 'Synthetic creation.' }
      const proposal = t.api.createRecord({ workspaceId: 'default', kind: 'proposal', title: 'Synthetic closure proposal', actor: worker, data: { question: 'Synthetic question?', options: ['yes', 'no'], who_settles_it: 'the owner', extra: { delta: { ops: [
        { op: 'create_record', workspaceId: 'default', kind: 'task', title: 'Synthetic preceding operation', says: 'Synthetic earlier write.' }, bad,
      ] } } } })
      const decision = t.api.createRecord({ workspaceId: 'default', kind: 'decision', title: 'Synthetic approval', actor: person })
      t.api.createLink({ fromId: decision.id, toId: proposal.id, type: 'derived_from', actor: person })
      const before = corpus()
      const response = await app.inject({ method: 'POST', url: `/api/planning/proposals/${proposal.id}/apply`, headers: asPerson })
      expect(response.statusCode, response.body).toBe(403)
      expect(response.body).toContain('closed-unchecked')
      expect(corpus()).toBe(before)
    })
  }
})

describe('the settlement means nothing is owed', () => {
  for (const wasAsked of [true, false]) {
    it(`retires an agent whose only owed run was closed unchecked, ${wasAsked ? 'with' : 'without'} a recorded request`, async () => {
      const handle = `unchecked-retiree-${String(wasAsked)}`
      const agentId = await register(handle)
      const id = run({ servingAgent: handle, ...(wasAsked ? {} : { theCheck: undefined }) })
      expect(inspection.whatRetiringWhileACheckIsOwed({ id: agentId, handle }).map((owed) => owed.run)).toEqual([id])
      expect((await close(id)).statusCode).toBe(201)
      if (!wasAsked) expect(t.api.getRecord(id)!.data).not.toHaveProperty('theCheck')
      expect(t.api.getRecord(id)!.data).toHaveProperty('closedUnchecked')
      const response = await app.inject({ method: 'POST', url: `/api/participants/agent/${handle}/retire`, headers: asPerson, payload: { because: 'Synthetic work is settled.' } })
      expect(response.statusCode, response.body).toBe(200)
    })
  }
  it('omits the closed archive from the general and starter lists, and from the unreleased count', async () => {
    const closed = run(); const open = run()
    expect((await close(closed)).statusCode).toBe(201)
    for (const url of ['/api/checks', `/api/checks?startedBy=${THE_TEST_OFFICES_OWNER.id}&startedByKind=person`]) {
      const response = await app.inject({ method: 'GET', url, headers: asPerson })
      expect(response.statusCode, response.body).toBe(200)
      expect(response.json().list.map((one: { run: string }) => one.run)).not.toContain(closed)
      expect(response.json().list.map((one: { run: string }) => one.run)).toContain(open)
    }
    expect(howARunStands(t.api.getRecord(closed)!.data)).toMatchObject({ standing: 'closed unchecked', unreleasedFinish: false, waitingFor: null })
  })
  it('gives the standing its own word and shows completed work in the office picture', () => {
    const data = { state: 'finished', closedUnchecked: aClosure }
    expect(RUN_STANDING['closed unchecked'].word).toBe('Closed unchecked')
    expect(classifyPixelWork(data, false)).toBe('completed')
  })
  it('reads each office-only refusal from its single door description', async () => {
    const fields = await import('../src/server/lib/office-only-run-fields.ts')
    for (const field of ['needsNoCheck', 'endedWithItsMergeEntry'] as const) {
      const description = t.doors.THE_DOOR_OF[field]
      expect(fields.anOfficeOnlyFieldAWholeDataWouldMove({}, { [field]: {} })?.refusal).toBe(`The office writes ${field} ${description}. Nothing was written.`)
    }
  })
})

/** Mutation: omit this settlement's shared close; the release and rollback assertions fail. */
it('closes only gone process rows in the settlement write and keeps the live process running', async () => {
  const id = run()
  const resources = await import('../src/server/lib/resources.ts')
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' })
  await once(child, 'spawn')
  const ended = once(child, 'exit')
  try {
    const live = resources.registerResource({ workspaceId: 'default', sessionRecordId: id, type: 'process', key: String(child.pid!), actor: worker })
    const goneChild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' })
    await once(goneChild, 'spawn')
    const goneEnded = once(goneChild, 'exit')
    let gone: ReturnType<typeof resources.registerResource>
    try {
      gone = resources.registerResource({ workspaceId: 'default', sessionRecordId: id, type: 'process', key: String(goneChild.pid!), actor: worker })
    } finally {
      process.kill(-goneChild.pid!, 'SIGTERM')
      await goneEnded
    }
    const stored = (row: string) => t.client.sqlite.prepare('SELECT released_at, release_note FROM session_resources WHERE id = ?').get(row) as { released_at: string | null; release_note: string | null }
    const before = t.api.getRecord(id)!.data
    t.client.sqlite.exec("CREATE TRIGGER refuse_settlement_close BEFORE UPDATE OF released_at ON session_resources BEGIN SELECT RAISE(ABORT, 'synthetic settlement close failure'); END")
    try {
      const refused = await close(id)
      expect(refused.statusCode, refused.body).toBe(409)
      expect(refused.body).toContain('synthetic settlement close failure')
      expect(t.api.getRecord(id)!.data).toEqual(before)
      expect(stored(gone.id).released_at).toBeNull()
    } finally { t.client.sqlite.exec('DROP TRIGGER refuse_settlement_close') }
    const response = await close(id)
    expect(response.statusCode, response.body).toBe(201)
    expect(stored(gone.id).released_at).not.toBeNull()
    expect(stored(gone.id).release_note).toMatch(new RegExp(`^The run ${id} ended as closed unchecked\\.`))
    expect(stored(live.id).released_at).toBeNull()
    expect(response.json().says).toContain(`It closed 1 process row whose process had ended (${gone.id}).`)
    expect(response.json().says).toContain(`1 process row stays open because its process is still running or could not be read (${live.id}).`)
    expect(child.exitCode).toBeNull()
    expect(child.signalCode).toBeNull()
    expect(resources.processLivenessForRun(id, 'default').some(one => one.state === 'alive')).toBe(true)
  } finally {
    process.kill(-child.pid!, 'SIGTERM')
    await ended
  }
})

/** Mutations: always append a process-row or claim sentence, even when the run holds none. */
it('keeps the answer unchanged when the settled run holds no claims or process rows', async () => {
  const id = run()
  const response = await close(id)
  expect(response.statusCode, response.body).toBe(201)
  expect(response.json().says).toBe(response.json().stands.says)
})

/** Mutations: restore the state-only guard; use state rather than standing in the settled reason.
 * The synthetic run says it finished through closedHow, while its stored state remains running. */
it('closes a running run’s gone row at settlement with its settled reason and keeps its live process running', async () => {
  const id = run({ state: 'running', closedHow: 'agent-said' })
  const resources = await import('../src/server/lib/resources.ts')
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' })
  await once(child, 'spawn')
  const ended = once(child, 'exit')
  try {
    const live = resources.registerResource({ workspaceId: 'default', sessionRecordId: id, type: 'process', key: String(child.pid!), actor: worker })
    const goneChild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' })
    await once(goneChild, 'spawn')
    const goneEnded = once(goneChild, 'exit')
    let gone: ReturnType<typeof resources.registerResource>
    try {
      gone = resources.registerResource({ workspaceId: 'default', sessionRecordId: id, type: 'process', key: String(goneChild.pid!), actor: worker })
    } finally {
      process.kill(-goneChild.pid!, 'SIGTERM')
      await goneEnded
    }
    const stored = (row: string) => t.client.sqlite.prepare('SELECT released_at, release_note FROM session_resources WHERE id = ?').get(row) as { released_at: string | null; release_note: string | null }
    expect(t.api.getRecord(id)!.data['state']).toBe('running')
    const response = await close(id)
    expect(response.statusCode, response.body).toBe(201)
    expect(t.api.getRecord(id)!.data['state']).toBe('running')
    expect(stored(gone.id).released_at).not.toBeNull()
    expect(stored(gone.id).release_note).toMatch(new RegExp(`^The run ${id} ended as closed unchecked\\.`))
    expect(stored(live.id).released_at).toBeNull()
    expect(response.json().says).toContain(`It closed 1 process row whose process had ended (${gone.id}).`)
    expect(response.json().says).toContain(`1 process row stays open because its process is still running or could not be read (${live.id}).`)
    expect(child.exitCode).toBeNull()
    expect(child.signalCode).toBeNull()
    expect(resources.processLivenessForRun(id, 'default').some(one => one.state === 'alive')).toBe(true)
  } finally {
    process.kill(-child.pid!, 'SIGTERM')
    await ended
  }
})

/** Mutation: restore the old settlement code without its claims call. */
it('ends a running run’s claim at settlement and tells its overlap group', async () => {
  const id = run({ state: 'running' })
  const claims = await import('../src/server/lib/claims.ts')
  const participants = await import('../src/server/lib/participants.ts')
  const actor = { type: 'agent' as const, id: 'unchecked-worker' }
  const claimant = { kind: 'agent' as const, id: participants.agentByHandle(actor.id)!.id }
  const things = [{ what: 'path' as const, id: 'work/synthetic-claim' }]
  const first = claims.fileAClaim({ workspaceId: 'default', claimant, run: id, things }, actor)
  const other = historicalSession(t, { workspaceId: 'default', kind: 'session', title: 'Synthetic overlapping run', origin: 'fixture', actor: personActor(), data: { state: 'running' } }).id
  const second = claims.fileAClaim({ workspaceId: 'default', claimant: { kind: 'person', id: personActor().id }, run: other, things }, personActor())
  expect(second.groups).toHaveLength(1)
  t.api.patchRecord(id, { dataPatch: { closedHow: 'agent-said' } }, actor)
  const stored = () => t.client.sqlite.prepare('SELECT released_at, released_because FROM work_claims WHERE id = ?').get(first.claim.id) as { released_at: string | null; released_because: string | null }
  expect(t.api.getRecord(id)!.data['state']).toBe('running')
  expect(stored().released_at).toBeNull()
  const response = await close(id)
  expect(response.statusCode, JSON.stringify(response.json())).toBe(201)
  expect(stored().released_at).not.toBeNull()
  expect(stored().released_because).toBe('The run it belonged to was closed unchecked.')
  expect(response.json()['says']).toContain(` It ended 1 claim (${first.claim.id}).`)
  const messages = await import('../src/server/lib/messages.ts')
  const { THE_OVERLAP_ENDED_PREFIX } = await import('../src/shared/groups.ts')
  const ended = messages.messagesInAGroup(second.groups[0]!, messages.EVERY_PROJECT).filter(one => one.body.startsWith(THE_OVERLAP_ENDED_PREFIX))
  expect(ended).toHaveLength(1)
  expect(ended[0]!.body).toContain('run ended')
})

/** Mutation: move the claims call after the transaction commits. */
it('rolls settlement and process rows back when ending a running run’s claim fails', async () => {
  const id = run({ state: 'running' })
  const claims = await import('../src/server/lib/claims.ts')
  const participants = await import('../src/server/lib/participants.ts')
  const actor = { type: 'agent' as const, id: 'unchecked-worker' }
  const first = claims.fileAClaim({ workspaceId: 'default', claimant: { kind: 'agent', id: participants.agentByHandle(actor.id)!.id }, run: id, things: [{ what: 'path', id: 'work/synthetic-rollback' }] }, actor)
  t.api.patchRecord(id, { dataPatch: { closedHow: 'agent-said' } }, actor)
  const resources = await import('../src/server/lib/resources.ts')
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' })
  await once(child, 'spawn')
  const exited = once(child, 'exit')
  let gone: ReturnType<typeof resources.registerResource>
  try {
    gone = resources.registerResource({ workspaceId: 'default', sessionRecordId: id, type: 'process', key: String(child.pid!), actor })
  } finally { process.kill(-child.pid!, 'SIGTERM'); await exited }
  const before = t.api.getRecord(id)!.data
  t.client.sqlite.exec("CREATE TRIGGER refuse_claim_end BEFORE UPDATE OF released_at ON work_claims BEGIN SELECT RAISE(ABORT, 'synthetic claim end failure'); END")
  try {
    const response = await close(id)
    expect(response.statusCode, JSON.stringify(response.json())).toBe(409)
    expect(JSON.stringify(response.json())).toContain('synthetic claim end failure')
    expect(t.api.getRecord(id)!.data).toEqual(before)
    expect((t.client.sqlite.prepare('SELECT released_at FROM session_resources WHERE id = ?').get(gone.id) as { released_at: string | null }).released_at).toBeNull()
    expect((t.client.sqlite.prepare('SELECT released_at FROM work_claims WHERE id = ?').get(first.claim.id) as { released_at: string | null }).released_at).toBeNull()
  } finally { t.client.sqlite.exec('DROP TRIGGER refuse_claim_end') }
  const response = await close(id)
  expect(response.statusCode, JSON.stringify(response.json())).toBe(201)
  expect((t.client.sqlite.prepare('SELECT released_at FROM work_claims WHERE id = ?').get(first.claim.id) as { released_at: string | null }).released_at).not.toBeNull()
})

function personActor() { return person }
