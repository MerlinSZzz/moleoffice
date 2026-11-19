// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TERRITORY WRITE READS ONLY THE RUNNING RUNS, ONCE (problem txBj5oTVUtZO).
 *
 * Before this, a territory write listed every session that ever held a territory, read each whole, and asked
 * `howTheRunStands` of each. On the live office that was 1,093 runs and about 26,000 statements for one round start,
 * and the server answered nobody else while it ran. Now the runs are chosen in SQL, only the ones that may still be
 * running are read whole, and the whole reading is made once per write and handed on to the check inside the
 * transaction and to the group opening after it.
 *
 * WHAT THIS FILE PROVES:
 * A. Two running runs of two agents meet at one changed path. Forty ended territory runs, then forty more, make no
 *    difference to the statements one territory PATCH runs or to the overlap it answers: the two counts are equal and
 *    the two replies name the same one overlap.
 * B. In one territory PATCH the statement that lists the runs with a territory runs once, at the default setting and
 *    again at block.
 * C. A run whose state is `finished` but whose ledger holds a live process is still compared, because
 *    `howTheRunStands` calls it running.
 * D. An agent whose only territory run has ended still makes a folder shared, so two running runs that change files
 *    under that folder do not meet there.
 * E. The same as D, for an ended run that names its agent only in data.ranAs, with no servingAgentId and no
 *    servingAgent: the fallback agent reading must still find it, so the light list has to carry ranAs.
 *
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST (each one line of src/server/lib/claims.ts, except
 * mutation 8, one line of src/server/lib/keys.ts):
 * 1. Read each listed row whole again, as the old `.map((row) => getRecord(row.id)!)` did: case A red, as the second
 *    count is larger.
 * 2. Ask `howTheRunStands` of every listed row, not only the flagged ones: case A red, as the second count is larger.
 * 3. Let `theOverlapsForATerritory` make its own reading every time, ignoring the reading kept by the changed paths:
 *    case B red, as the list runs again inside the transaction or after it.
 * 4. Drop the ledger's `EXISTS` from the flag that says a run may be running: case C red, as the finished run is no
 *    longer compared.
 * 5. Let `theTerritoriesThatSayWhatIsShared` keep only the rows of running runs, not each agent's latest: cases D and
 *    E red.
 * 6. Drop the fallback that finds the agent of a row naming no serving agent: case E red. The existing
 *    tests/a-territory-overlap-opens-a-group-and-refuses-nothing.test.ts stays green in its case "uses the same territory
 *    agent for a filer, a serving agent and an ambiguous stored stamp", because the comparison loop names each other
 *    run's agent from its whole record, so only the shared-folder reading uses the light row's agent id.
 * 7. Leave `ranAs` out of the light list, so the fallback reads no agent for a run that names it only there: case E
 *    red. This one was measured at 4696c401b before the field was added, and again on the rebuilt code.
 *
 * 8. Add `'abandoned'` to `RUN_IS_OVER_STATES` in src/server/lib/keys.ts, leaving the four words in
 *    src/server/db/schema.ts alone: case A red, as the runs written as `abandoned` are still flagged as maybe
 *    running and read whole, so the second count is larger. On the file as committed at 0b9e65199 the same mutation
 *    leaves every case green, because that file never writes `abandoned`.
 *
 * The ended states are read from src/server/lib/keys.ts, so a fifth word there is written into the ended runs too.
 *
 * Every worktree is a made-up Git repository in this file's own temporary folder, and every agent, run and path is
 * made up. The office database is this file's own, and nothing reaches the live server.
 */
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aWorktreeOfItsOwn, theRunChanges } from './a-worktree-of-its-own.ts'

/** Every statement a door runs, kept as its text, while `capturing` is true. */
const observed = vi.hoisted(() => ({ capturing: false, statements: [] as string[] }))
vi.mock('better-sqlite3', async importOriginal => {
  const actual = await importOriginal<{ default: typeof import('better-sqlite3') }>()
  return {
    default: new Proxy(actual.default, {
      construct(target, args) {
        const options = args[1] as { verbose?: (statement: string) => void } | undefined
        return Reflect.construct(target, [args[0], {
          ...options,
          verbose(statement: string) {
            if (observed.capturing) observed.statements.push(statement)
            options?.verbose?.(statement)
          },
        }])
      },
    }),
  }
})

const settingName = 'MOLE_OFFICE_GATE_TERRITORIES'
const owner = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
type Agent = { id: string; handle: string; headers: Record<string, string> }
/**
 * THE ENDED RUNS ONE CASE ADDS AT A TIME: forty, so a count that grows with the runs that ever held a territory is
 * plainly larger, while the setup stays well inside a case's five seconds.
 */
const ENDED_RUNS_ADDED = 40
/** The state words that end a run, read from src/server/lib/keys.ts, used in turn for the runs written straight into the records table. */
let endedStates: readonly string[]

let t: TestDb, app: FastifyInstance, home: string
let participants: typeof import('../src/server/lib/participants.ts')
let ledger: typeof import('../src/server/lib/resources.ts')
let theProbeAtTheStart: ReturnType<typeof import('../src/server/lib/resources.ts').osProbe>

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'territory-runs-once-'))
  vi.stubEnv('HOME', home)
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  participants = await import('../src/server/lib/participants.ts')
  ledger = await import('../src/server/lib/resources.ts')
  endedStates = (await import('../src/shared/run-has-ended.ts')).RUN_IS_OVER_STATES
  theProbeAtTheStart = ledger.osProbe()
}, 60_000)

beforeEach(() => {
  observed.capturing = false
  observed.statements = []
  t.client.sqlite.prepare('DELETE FROM gate_counts').run()
  t.client.sqlite.prepare('DELETE FROM runtime_settings WHERE name = ?').run(settingName)
  vi.stubEnv(settingName, undefined)
  // A RUN AN EARLIER CASE LEFT RUNNING IS ENDED, and a territory it stored is taken off, so a case is compared with
  // its own runs only.
  t.client.sqlite
    .prepare("UPDATE records SET data = json_set(data, '$.state', 'crashed') WHERE kind = 'session' AND json_extract(data, '$.state') = 'running'")
    .run()
  t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.territory') WHERE kind = 'session'").run()
})

afterEach(async () => {
  ledger.useOsProbe(theProbeAtTheStart)
  const reply = await app.inject({
    method: 'POST', url: '/api/office/settings', headers: owner,
    payload: { changes: [{ name: settingName, value: null }], because: 'Put the territory gate back after the case.' },
  })
  expect(reply.statusCode, reply.body).toBe(200)
})

afterAll(async () => {
  await app?.close()
  t?.close()
  vi.unstubAllEnvs()
  rmSync(home, { recursive: true, force: true })
})

async function agent(): Promise<Agent> {
  const handle = randomUUID()
  const reply = await app.inject({
    method: 'POST', url: '/api/agents/started', headers: owner,
    payload: { handle, name: 'A made-up participant', role: 'supervisor', runtime: 'claude-code', workArea: [`tests/${randomUUID()}`] },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const row = participants.agentByHandle(handle)!
  const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  return { id: row.id, handle, headers: { ...owner, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': row.id, 'x-mole-office-key': makeAnAgentKey(row.id, null) } }
}

/** A running run of this agent in a worktree of its own, which changed these paths since its cut. */
function run(who: Agent, state = 'running', territory?: string[], changed: readonly string[] = []): string {
  const at = aWorktreeOfItsOwn(home)
  theRunChanges(at.workingDirectory, changed)
  return t.api.createRecord({
    workspaceId: 'default', kind: 'session', title: 'A made-up territory run',
    actor: { type: 'agent', id: who.id, provedBy: 'an-agent-key', keyHolder: who.id },
    data: { state, runtime: 'claude-code', servingAgentId: who.id, ...at, ...(territory === undefined ? {} : { territory }) },
  }).id
}

function patch(id: string, dataPatch: Record<string, unknown>, by: Agent) {
  return app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: by.headers, payload: { dataPatch } })
}

function set(value: string) {
  return app.inject({
    method: 'POST', url: '/api/office/settings', headers: owner,
    payload: { changes: [{ name: settingName, value }], because: 'Measure the territory setting.' },
  })
}

/** Every statement the work runs, with each statement's text, once it has finished. */
async function watching<T>(work: () => Promise<T>): Promise<{ answer: T; statements: string[] }> {
  observed.statements = []
  observed.capturing = true
  try {
    const answer = await work()
    return { answer, statements: [...observed.statements] }
  } finally {
    observed.capturing = false
  }
}

/** The one statement that lists the project's runs holding a territory, found by its own text. */
function theTerritoryListStatements(statements: readonly string[]): string[] {
  return statements.filter((one) => one.includes("'$.territory'") && one.includes('deleted_at') && one.includes('created_at'))
}

/**
 * THE ENDED TERRITORY RUNS WRITTEN STRAIGHT INTO THE RECORDS TABLE, as an office of many earlier rounds holds them.
 * They need no worktree: no comparison reads an ended run whole. The runs share four agents, so each agent has one
 * latest territory run and several older ones.
 */
function addEndedRuns(agents: readonly Agent[], count: number, firstAt: number): number {
  const addRecord = t.client.sqlite.prepare(
    `insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
     values (?, 'default', 'owner', ?, ?, 'session', 'An ended territory run', null, ?, null, 'fixture')`,
  )
  let at = firstAt
  for (let i = 0; i < count; i++) {
    const id = `made-up-ended-territory-run-${String(at)}`
    const stamp = `2026-11-12 02:${String(Math.floor(at / 60) % 60).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`
    const data = JSON.stringify({
      state: endedStates[i % endedStates.length]!,
      servingAgentId: agents[i % agents.length]!.id,
      territory: ['made-up/'],
    })
    addRecord.run(id, stamp, stamp, data)
    at += 1
  }
  return at
}

it('A. two running runs meet once, and forty then eighty ended runs change neither the statements nor the answer', async () => {
  const first = await agent(), second = await agent()
  const mine = run(first, 'running', ['src/made-up-before.ts'], ['work/meet.ts'])
  const theirs = run(second, 'running', ['work/**'], ['work/meet.ts'])
  const endedAgents = [await agent(), await agent(), await agent(), await agent()]
  let next = addEndedRuns(endedAgents, ENDED_RUNS_ADDED, 0)
  // THE GROUP IS OPENED HERE, so a counted write does not open it.
  const opened = await patch(mine, { territory: ['work/meet.ts'] }, first)
  expect(opened.statusCode, opened.body).toBe(200)
  expect(opened.json().territoryOverlaps.overlaps).toHaveLength(1)

  const firstCount = await watching(() => patch(mine, { territory: ['work/meet.ts', 'tests/made-up-one.txt'] }, first))
  expect(firstCount.answer.statusCode, firstCount.answer.body).toBe(200)
  next = addEndedRuns(endedAgents, ENDED_RUNS_ADDED, next)
  const secondCount = await watching(() => patch(mine, { territory: ['work/meet.ts', 'tests/made-up-one.txt', 'tests/made-up-two.txt'] }, first))
  expect(secondCount.answer.statusCode, secondCount.answer.body).toBe(200)

  expect(secondCount.statements.length, 'a territory PATCH runs more statements once forty more ended runs exist').toBe(firstCount.statements.length)
  const one = firstCount.answer.json().territoryOverlaps
  expect(secondCount.answer.json().territoryOverlaps).toEqual(one)
  expect(one).toEqual({
    compared: true,
    overlaps: [{ run: theirs, agent: second.id, paths: ['work/meet.ts'], group: expect.any(String) }],
  })
}, 5_000)

it('B. one territory PATCH runs the statement that lists the territory runs once, at the default and at block', async () => {
  const who = await agent()
  const id = run(who, 'running', ['src/made-up-before.ts'], ['work/a.ts'])
  const atTheDefault = await watching(() => patch(id, { territory: ['work/a.ts'] }, who))
  expect(atTheDefault.answer.statusCode, atTheDefault.answer.body).toBe(200)
  expect(theTerritoryListStatements(atTheDefault.statements)).toHaveLength(1)

  const other = await agent()
  const otherRun = run(other, 'running', ['src/made-up-elsewhere.ts'], ['work/b.ts'])
  expect((await set('block')).statusCode).toBe(200)
  const atBlock = await watching(() => patch(otherRun, { territory: ['work/b.ts'] }, other))
  expect(atBlock.answer.statusCode, atBlock.answer.body).toBe(200)
  expect(theTerritoryListStatements(atBlock.statements)).toHaveLength(1)
}, 5_000)

it('C. a finished run whose ledger holds a live process is still compared', async () => {
  const first = await agent(), second = await agent()
  const ended = run(first, 'finished', ['work/**'], ['work/meet.ts'])
  const probe: typeof ledger.LINUX_PROBE = Object.create(ledger.LINUX_PROBE)
  probe.processById = (pid) => pid === 505
    ? { pid, pgid: pid, ppid: 1, command: 'synthetic territory process', startedAt: '2026-09-30 11:00:00' }
    : null
  ledger.useOsProbe(probe)
  ledger.registerResource({ workspaceId: 'default', sessionRecordId: ended, type: 'process', key: '505', actor: { type: 'agent', id: first.id } })
  const mine = run(second, 'running', ['src/made-up-before.ts'], ['work/meet.ts'])
  const reply = await patch(mine, { territory: ['work/meet.ts'] }, second)
  expect(reply.statusCode, reply.body).toBe(200)
  expect(reply.json().territoryOverlaps.overlaps).toEqual([
    { run: ended, agent: first.id, paths: ['work/meet.ts'], group: expect.any(String) },
  ])
}, 5_000)

it('D. an ended run\'s latest territory still makes a folder shared, so two running runs do not meet there', async () => {
  const endedAgent = await agent(), first = await agent(), second = await agent()
  run(endedAgent, 'finished', ['tools/**'])
  const mine = run(first, 'running', ['tools/**'], ['tools/made-up-one.ts'])
  run(second, 'running', ['src/made-up-index.ts'], ['tools/made-up-two.ts'])
  const reply = await patch(mine, { territory: ['tools/**', 'src/made-up-shared.ts'] }, first)
  expect(reply.statusCode, reply.body).toBe(200)
  expect(reply.json().territoryOverlaps).toEqual({ compared: true, overlaps: [] })
}, 5_000)

it('E. an ended run that names its agent only in data.ranAs still makes a folder shared', async () => {
  const endedAgent = await agent(), first = await agent(), second = await agent()
  // NO servingAgentId AND NO servingAgent, AND NO CHANGE ROW NAMING AN ACTOR EITHER: the only name this run gives
  // for its agent is its ranAs entry.
  t.client.sqlite.prepare(
    `insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
     values ('made-up-run-naming-its-agent-in-ran-as', 'default', 'owner', ?, ?, 'session',
       'An ended run that names its agent in ranAs', null, ?, null, 'fixture')`,
  ).run('2026-11-12 03:00:00', '2026-11-12 03:00:00', JSON.stringify({
    state: 'finished', ranAs: [{ workspaceId: 'default', agentId: endedAgent.id }], territory: ['tools/**'],
  }))
  const mine = run(first, 'running', ['tools/**'], ['tools/made-up-one.ts'])
  run(second, 'running', ['src/made-up-index.ts'], ['tools/made-up-two.ts'])
  const reply = await patch(mine, { territory: ['tools/**', 'src/made-up-shared.ts'] }, first)
  expect(reply.statusCode, reply.body).toBe(200)
  expect(reply.json().territoryOverlaps).toEqual({ compared: true, overlaps: [] })
}, 5_000)
