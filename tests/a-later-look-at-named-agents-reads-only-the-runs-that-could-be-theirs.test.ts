// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LATER LOOK AT NAMED AGENTS READS ONLY THE RUNS THAT COULD BE THEIRS, AND ANNOUNCES AND REMEMBERS WHAT IT DID.
 *
 * Round 107 of wave 13y, the third pass over the API's speed. A hold taken or let go, and a run's record written, ask
 * src/server/lib/answering-told.ts for a look at the agents they touched while a person's page is open. That look read
 * every run of the project to read those agents. On the made-up office at the 22 October scale, built by
 * tools/build-a-made-up-office.ts, a hold took 121 ms so, 85 ms of it in that read, and takes 9 ms reading only the runs
 * that could be theirs: the runs migration 0286's indexes find by their ids, their handles and their own records.
 *
 * WHAT IS HELD HERE. In each case below a write made outside the doors, so that no door asks for a look, changes the
 * answering of some named agents and of an agent that is not named. Then:
 *   1. the look at the named agents announces each named agent whose reading changed, and no other. The readings are
 *      worked out here as the look worked them out before the change, from every run of the project;
 *   2. a look at every agent then announces each agent that was not named and whose reading changed, and no other. So
 *      what the look at the named agents remembered of each of them is what the look before the change remembered,
 *      because a look at every agent announces an agent whose remembered reading is not its reading now.
 * The cases: runs that name their agent only by its own record's id, by the handle of a retired agent, or with spaces
 * around a handle; a run that ran as one agent and serves another, each way round; a held agent given a waiting run;
 * and, from round 108, a run stored under an old registry id that is filed as an alias of the agent. A run's record
 * written before an alias was filed keeps the old id, and a look at every agent counts that run as the agent's.
 *
 * Every agent, run, message and hold here is made up.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { apiApp, freshDb, type TestDb, theAnswerToAWriteInATestOffice } from './helpers.ts'

const HERE = 'default'
const OWNER = { 'content-type': 'application/json', 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }


/** The old registry id filed as an alias of the made-up agent `made-up-aliased`. It is no registry id. */
const AN_OLD_ID = 'an-old-registry-id-of-a-made-up-agent'

let t: TestDb
let app: FastifyInstance
let told: typeof import('../src/server/lib/answering-told.ts')
let presence: typeof import('../src/server/lib/presence.ts')
let worker: typeof import('../src/server/lib/worker.ts')
let participants: typeof import('../src/server/lib/participants.ts')
let references: typeof import('../src/server/lib/agent-references.ts')

/** The made-up agents by their handles: registry id and the id of the agent's own record. */
const agents = new Map<string, { id: string; record: string }>()
const idOf = (handle: string): string => agents.get(handle)!.id

/** The made-up runs by what they are for, and the data each was filed with. */
const runs = new Map<string, string>()
const filed = new Map<string, string>()

async function call(method: 'GET' | 'POST', url: string, body?: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method, url, headers: OWNER, ...(body === undefined ? {} : { payload: JSON.stringify(body) }) })
  if (method === 'POST' && url === '/api/records' && theAnswerToAWriteInATestOffice(OWNER, body) === 409) expect(reply.statusCode, `${method} ${url}: ${reply.body}`).toBe(409)
  else expect(reply.statusCode, `${method} ${url}: ${reply.body}`).toBeLessThan(300)
  return reply.json() as Record<string, unknown>
}

async function anAgent(handle: string): Promise<void> {
  const made = await call('POST', '/api/records', { kind: 'agent', title: `Made-up ${handle}`, data: { handle, state: 'active', runtime: 'claude-code' } })
  const listed = (await call('GET', '/api/participants')) as { agents?: { id: string; handle: string }[] }
  const id = (listed.agents ?? []).find((one) => one.handle === handle)?.id ?? ''
  expect(id).not.toBe('')
  agents.set(handle, { id, record: (made['record'] as { id: string }).id })
}

async function aRun(is: string, data: Record<string, unknown>): Promise<string> {
  const made = await call('POST', '/api/records', { kind: 'session', title: `A made-up run: ${is}`, data: { runtime: 'claude-code', ...data } })
  const id = (made['record'] as { id: string }).id
  runs.set(is, id)
  return id
}

/** A run that answers as its agent once it says `running`: its process is this test's own, which is alive. */
async function aRunWithALiveProcess(is: string, data: Record<string, unknown>): Promise<void> {
  const id = await aRun(is, { state: 'crashed', doing: 'made-up', ...data })
  const resources = await import('../src/server/lib/resources.ts')
  resources.registerResource({ workspaceId: HERE, sessionRecordId: id, type: 'process', key: String(process.pid), actor: { type: 'human', id: THE_PERSON } })
}

/** A run the office started, waiting for the next message once its wait is moved into the future. */
async function aWaitingRun(is: string, agent: string, n: number): Promise<void> {
  const message = await call('POST', '/api/records', { kind: 'message', title: 'A made-up line', data: { body: 'A made-up line.', to: [{ kind: 'agent', id: agent }] } })
  await aRun(is, {
    state: 'running',
    startedByMoleOffice: true,
    servingAgentId: agent,
    deliveringMessage: (message['record'] as { id: string }).id,
    providerSession: `6f1c1d2e-0000-4000-8000-00000000010${n}`,
    waitsUntil: localStamp(new Date(Date.now() - 60 * 60_000)),
  })
}

/** Change a run's data with a write that bypasses the doors, so no door asks for a look. */
function rewrite(is: string, change: Record<string, unknown>): void {
  const id = runs.get(is)!
  const data = JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }).data) as Record<string, unknown>
  t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify({ ...data, ...change }), id)
}

/**
 * WHAT THE LOOK WORKED OUT OF EACH AGENT BEFORE THE CHANGE, written out as it was: the same reading of each, from every
 * run of the project. `answeringLookNow` remembers and compares the JSON of the three parts.
 */
function theReadingsBeforeTheChange(at: number): Map<string, string> {
  const sqlite = t.client.sqlite
  let registry: ReturnType<typeof participants.listParticipants>['agents'] | null = null
  const registered = () => (registry ??= participants.listParticipants().agents)
  const identityOf = references.everyAgentsIdentityReadOnce(sqlite)
  const shared = presence.thePresenceReadingsOf(HERE, undefined, identityOf, undefined, true)
  const facts = presence.theAgentFactsReadOnce(new Date(at), true, registered, identityOf, () => shared.waiting().map((one) => one.session))
  const out = new Map<string, string>()
  for (const { id } of registered()) {
    const reading = worker.theAnsweringReading(id, HERE, shared.sessions(), shared.waiting(), {
      machine: shared.machine,
      readOnly: true,
      at,
      runningRows: shared.runningRows,
      messageRows: shared.messageRows,
      hold: facts.hold(id),
      cardOf: facts.cardOf,
      runOrigin: facts.runOrigin,
      identityOf,
    })
    const couldNotTell = worker.whatAReadingSaysOfReach(reading)?.was === 'could not tell'
    out.set(id, JSON.stringify([reading.answering.how, reading.answering.session, couldNotTell]))
  }
  return out
}

const key = (id: string): string => `${HERE}#${id}`

/**
 * ONE CASE: every made-up run as it was filed, the pages told what is true then, `write`, and a look at `named`, then a
 * look at every agent. Gives the agents whose reading the write changed, and what each look announced, sorted.
 */
function aLookAfter(named: readonly string[], write: () => void): { changed: string[]; announced: string[]; afterwards: string[] } {
  for (const [is, id] of runs) t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(filed.get(is)!, id)
  const at = Date.now()
  told.answeringLookNow('every agent', at)
  const before = theReadingsBeforeTheChange(at)
  write()
  const after = theReadingsBeforeTheChange(at)
  const changed = [...after].filter(([id, reading]) => before.get(id) !== reading).map(([id]) => id).sort()
  const announced = told.answeringLookNow(named, at).sort()
  const afterwards = told.answeringLookNow('every agent', at).sort()
  return { changed, announced, afterwards }
}

/** What the two looks should have announced, from the agents whose reading changed. */
function asTheLookBeforeTheChange(named: readonly string[], changed: readonly string[]): { announced: string[]; afterwards: string[] } {
  return {
    announced: changed.filter((id) => named.includes(id)).map(key).sort(),
    afterwards: changed.filter((id) => !named.includes(id)).map(key).sort(),
  }
}


beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  told = await import('../src/server/lib/answering-told.ts')
  presence = await import('../src/server/lib/presence.ts')
  worker = await import('../src/server/lib/worker.ts')
  participants = await import('../src/server/lib/participants.ts')
  references = await import('../src/server/lib/agent-references.ts')
  for (const handle of ['made-up-named-one', 'made-up-named-two', 'made-up-not-named', 'made-up-retired', 'made-up-aliased']) await anAgent(handle)
  t.client.sqlite.prepare('UPDATE agents SET retired = 1 WHERE id = ?').run(idOf('made-up-retired'))
  // THE ALIAS, filed by the store's own filing: no door files one.
  const { fileRegistryAliases } = await import('../src/server/lib/registry-aliases/index.ts')
  fileRegistryAliases(t.client.sqlite, [{ namespace: 'agent-registry', aliasId: AN_OLD_ID, canonicalId: idOf('made-up-aliased') }])
  // THE RUNS, filed while no person's page is open, so their writes ask for no look that counts here.
  await aRunWithALiveProcess('by its own record', { servingAgent: agents.get('made-up-named-one')!.record })
  await aRunWithALiveProcess('by a retired handle', { servingAgent: 'made-up-retired' })
  await aRunWithALiveProcess('with spaces', { servingAgent: ' made-up-named-two ' })
  await aRunWithALiveProcess('of the one not named', { servingAgentId: idOf('made-up-not-named') })
  await aRunWithALiveProcess('ran as one, serves two', { servingAgentId: idOf('made-up-named-two'), ranAs: [{ workspaceId: HERE, agentId: idOf('made-up-named-one') }] })
  await aRunWithALiveProcess('ran as two, serves one', { servingAgentId: idOf('made-up-named-one'), ranAs: [{ workspaceId: HERE, agentId: idOf('made-up-named-two') }] })
  await aWaitingRun('waiting for one', idOf('made-up-named-one'), 1)
  await aWaitingRun('waiting for the one not named', idOf('made-up-not-named'), 2)
  for (let n = 1; n <= 3; n += 1) await aRun(`ended ${n} of the one not named`, { state: 'crashed', servingAgentId: idOf('made-up-not-named') })
  // THE OLD ID, written into the run's row past the door, as a run filed before the alias holds it: the door stores the
  // canonical id for an id filed as an alias.
  await aRunWithALiveProcess('under an old id', { servingAgentId: idOf('made-up-aliased') })
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.servingAgentId', ?) WHERE id = ?").run(AN_OLD_ID, runs.get('under an old id')!)
  for (const [is, id] of runs) filed.set(is,(t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }).data)
  // A PERSON'S PAGE, and the first look in the project, which only remembers.
  const events = await import('../src/server/lib/events.ts')
  events.pageOpened({ workspaceId: HERE, who: { kind: 'person', id: THE_PERSON }, send: () => undefined })
  told.forgetWhatPagesWereToldOfAnswering()
  expect(told.answeringLookNow([])).toEqual([])
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a later look at named agents', () => {
  it('1 and 2. finds runs that name their agent by its own record, by a retired handle and with spaces', () => {
    const named = [idOf('made-up-named-one'), idOf('made-up-named-two'), idOf('made-up-retired')]
    const seen = aLookAfter(named, () => {
      for (const is of ['by its own record', 'by a retired handle', 'with spaces', 'of the one not named']) rewrite(is, { state: 'running' })
    })
    expect(seen.changed).toEqual(expect.arrayContaining([idOf('made-up-named-one'), idOf('made-up-retired'), idOf('made-up-not-named')]))
    expect({ announced: seen.announced, afterwards: seen.afterwards }).toEqual(asTheLookBeforeTheChange(named, seen.changed))
  })

  it('1 and 2. does not take a run that ran as a named agent and serves another for the named one', () => {
    const named = [idOf('made-up-named-one')]
    const seen = aLookAfter(named, () => rewrite('ran as one, serves two', { state: 'running' }))
    expect(seen.changed).toEqual([idOf('made-up-named-two')])
    expect({ announced: seen.announced, afterwards: seen.afterwards }).toEqual(asTheLookBeforeTheChange(named, seen.changed))
  })

  it('1 and 2. finds a run that serves a named agent and ran as another', () => {
    const named = [idOf('made-up-named-one')]
    const seen = aLookAfter(named, () => rewrite('ran as two, serves one', { state: 'running' }))
    expect(seen.changed).toEqual([idOf('made-up-named-one')])
    expect({ announced: seen.announced, afterwards: seen.afterwards }).toEqual(asTheLookBeforeTheChange(named, seen.changed))
  })

  it('1 and 2. finds a run stored under an old id that is filed as an alias of the named agent', () => {
    const named = [idOf('made-up-aliased')]
    const seen = aLookAfter(named, () => rewrite('under an old id', { state: 'running' }))
    expect(seen.changed).toEqual([idOf('made-up-aliased')])
    expect({ announced: seen.announced, afterwards: seen.afterwards }).toEqual(asTheLookBeforeTheChange(named, seen.changed))
  })

  it('1 and 2. reads a held agent, and the hold, with a waiting run given to it and to an agent not named', async () => {
    // THE HOLD, taken through its door, whose own look at the agent is checked by the look at every agent after it.
    // ITS SESSION NAMES A PROCESS OF ITS OWN THAT NO LONGER RUNS, and has no transcript, so the hold does not answer
    // and the waiting run given to the agent changes its reading. A hold that still beats is the session's answer
    // unless what is read of the session says it is gone, and an ended process is that sign. The number is above
    // any pid the system hands out, so nothing runs under it.
    const session = await aRun('behind the hold', {
      state: 'running',
      doing: 'made-up',
      extra: { discovered: { pid: 2147483014, pidStartedAt: '2026-01-01 00:00:00' } },
    })
    filed.set('behind the hold', (t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(session) as { data: string }).data)
    await call('POST', '/api/handles/made-up-named-one/hold', { session, machine: 'a-made-up-machine', runtime: 'claude-code' })
    expect(told.answeringLookNow('every agent')).toEqual([])
    const named = [idOf('made-up-named-one')]
    const seen = aLookAfter(named, () => {
      for (const is of ['waiting for one', 'waiting for the one not named']) rewrite(is, { waitsUntil: localStamp(new Date(Date.now() + 10 * 60_000)) })
    })
    expect(seen.changed).toEqual([idOf('made-up-named-one'), idOf('made-up-not-named')].sort())
    expect({ announced: seen.announced, afterwards: seen.afterwards }).toEqual(asTheLookBeforeTheChange(named, seen.changed))
  })

})
