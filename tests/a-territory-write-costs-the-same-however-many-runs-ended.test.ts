// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TERRITORY WRITE COSTS THE SAME HOWEVER MANY RUNS HAVE ENDED (problem txBj5oTVUtZO).
 *
 * A territory write lists every run that ever held a territory, and the shared-folder reading needs the agent of each
 * one. A run that names its agent by servingAgentId or servingAgent was answered from every agent's identity read
 * once. A run that names it only in ranAs, or only as the agent that filed it, was answered by the one-row reader, at
 * about eight or nine statements a run. On a made-up office at the cut 60569dce6, with the ended runs shared among
 * eight agents, a territory PATCH ran 732 statements with 110 ended runs and 4,948 with 1,100; a seal ran 892 and 5,091.
 *
 * WHAT THIS FILE PROVES. The ended runs are written straight into the records table, a quarter of each of the four
 * ways an ended run on the live office names its agent: servingAgentId, servingAgent (a handle), ranAs, and only the
 * agent of the record's create row. The first 110 ended runs are shared among eight agents, and the runs added to make
 * 1,100 bring eight agents those 110 did not have. On the live office almost every worker run registers an agent of its
 * own, so a cost for each agent name is a cost for each run there, and here it shows as a larger second count.
 * A. Two running runs of two agents meet at one changed path. With 110 and then 1,100 ended runs, one territory PATCH
 *    runs the same number of statements, the statement that lists the territory runs runs once in each, and the two
 *    replies name the same one overlap.
 * B. The same for one seal, the first finished send of a running run: the same number of statements with 110 and with
 *    1,100 ended runs, the list statement once in each, and each reply names its own pair's one overlap.
 * C. For each of the four ways, an agent whose only territory run has ended still makes a folder shared, so two
 *    running runs that change files under that folder do not meet there.
 * D. The light reading of the territory runs (`theRunsWithATerritory` in src/server/lib/claims.ts) names, for each
 *    run, the agent `theAgentOfATerritoryRun` names when it is asked alone with no lookups: for the four ways, a handle
 *    two agents answer to in ranAs, in servingAgent and as the filer, a retired handle in ranAs and as the filer, an
 *    agent record id in servingAgent and in ranAs, a live hold, a lapsed hold, and a run filed in the message centre
 *    whose create row is filed under the project. Each answer is also the one this file meant, so no comparison is of
 *    two nulls by accident, and the lapsed hold is released by the light reading, as the one-row reader releases it.
 *
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST (each one line of src/server/lib/claims.ts):
 * 1. Work out the agent of a run that names none by the one-row reader again, for each such run: cases A and B red, as
 *    the second count is larger.
 * 2. Keep only the agent a run names by servingAgentId or servingAgent: cases C ranAs, C filer and D red, as the ended
 *    run's agent is no longer counted and the folder is no longer shared.
 * 3. Let the live-hold lookup answer null for every session, without asking theLiveHoldOnSession: case D red, at the
 *    lapsed hold, which the light reading then does not release. Variant 3b asks theLiveHoldOnSession and then
 *    answers null for every session: case D red, at the run with a live hold.
 * 4. Let the filer lookup read a run filed in the message centre by its project as well: case D red, at that run.
 * 5. Hand the lookups the identities without the stored spellings read once
 *    (`identityOf: (id: string) => identityOf(id),`): cases A and B red, as each agent name a run names in ranAs or as
 *    its filer is read again.
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
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
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

/** The four ways an ended run on the live office names its agent. */
const SHAPES = ['servingAgentId', 'servingAgent', 'ranAs', 'filer'] as const
type AShape = (typeof SHAPES)[number]

const FEW_ENDED_RUNS = 110
const MANY_ENDED_RUNS = 1_100

/**
 * THE TIME A CASE THAT WRITES 1,100 ENDED RUNS IS GIVEN. Such a case writes the rows and makes four or five writes
 * through the server in itself, which took about one second at load 9 to 12 at the cut, and a case keeps five seconds
 * otherwise. Nothing is started outside the test process, so it gets the hooks' budget for a file that imports the
 * server, not the long one.
 */
const A_CASE_THAT_WRITES_THE_ENDED_RUNS = A_HOOK_THAT_IMPORTS_THE_SERVER

/** The state words that end a run, read from the code, used in turn for the ended runs. */
let endedStates: readonly string[]

let t: TestDb, app: FastifyInstance, home: string
let participants: typeof import('../src/server/lib/participants.ts')
let claims: typeof import('../src/server/lib/claims.ts')
let theAgentOfATerritoryRun: typeof import('../src/server/lib/records.ts').theAgentOfATerritoryRun
/** How many made-up ended runs this file has written, so each has an id and a later time of its own. */
let endedRunsWritten = 0

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'territory-costs-the-same-'))
  vi.stubEnv('HOME', home)
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  participants = await import('../src/server/lib/participants.ts')
  claims = await import('../src/server/lib/claims.ts')
  theAgentOfATerritoryRun = (await import('../src/server/lib/records.ts')).theAgentOfATerritoryRun
  endedStates = (await import('../src/shared/run-has-ended.ts')).RUN_IS_OVER_STATES
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

beforeEach(() => {
  observed.capturing = false
  observed.statements = []
  t.client.sqlite.prepare('DELETE FROM runtime_settings WHERE name = ?').run(settingName)
  vi.stubEnv(settingName, undefined)
  // A RUN AN EARLIER CASE LEFT RUNNING IS ENDED, and every territory an earlier case stored is taken off, so a case is
  // compared with its own runs only.
  t.client.sqlite
    .prepare("UPDATE records SET data = json_set(data, '$.state', 'crashed') WHERE kind = 'session' AND json_extract(data, '$.state') = 'running'")
    .run()
  t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.territory') WHERE kind = 'session'").run()
})

afterEach(() => {
  vi.stubEnv(settingName, undefined)
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
function run(who: Agent, territory: string[], changed: readonly string[]): string {
  const at = aWorktreeOfItsOwn(home)
  theRunChanges(at.workingDirectory, changed)
  return t.api.createRecord({
    workspaceId: 'default', kind: 'session', title: 'A made-up territory run',
    actor: { type: 'agent', id: who.id, provedBy: 'an-agent-key', keyHolder: who.id },
    data: { state: 'running', runtime: 'claude-code', servingAgentId: who.id, ...at, territory },
  }).id
}

function patch(id: string, dataPatch: Record<string, unknown>, by: Agent) {
  return app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: by.headers, payload: { dataPatch } })
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
 * ONE ENDED TERRITORY RUN WRITTEN STRAIGHT INTO THE RECORDS TABLE, in this project, with these names in its data. A
 * `filer` gets the create row the record door writes, with that string as its agent actor, filed in that project.
 */
function anEndedRunWith(
  names: Record<string, unknown>,
  filer: { actorId: string; filedIn: string } | null,
  territory: readonly string[],
  workspaceId = 'default',
): string {
  const at = endedRunsWritten++
  const id = `made-up-ended-territory-run-${String(at)}`
  const stamp = `2026-11-12 ${String(Math.floor(at / 3600) % 24).padStart(2, '0')}:${String(Math.floor(at / 60) % 60).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`
  t.client.sqlite.prepare(
    `insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
     values (?, ?, 'owner', ?, ?, 'session', 'An ended territory run', null, ?, null, 'fixture')`,
  ).run(id, workspaceId, stamp, stamp, JSON.stringify({ state: endedStates[at % endedStates.length]!, ...names, territory }))
  if (filer !== null) {
    t.client.sqlite.prepare(
      `insert into changes (id, record_id, workspace_id, op, actor_type, actor_id, at) values (?, ?, ?, 'create', 'agent', ?, ?)`,
    ).run(`made-up-create-row-${String(at)}`, id, filer.filedIn, filer.actorId, stamp)
  }
  return id
}

/** One ended territory run naming its agent in one of the four ways. */
function anEndedRun(shape: AShape, who: Agent, territory: readonly string[]): string {
  const names = shape === 'servingAgentId' ? { servingAgentId: who.id }
    : shape === 'servingAgent' ? { servingAgent: who.handle }
      : shape === 'ranAs' ? { ranAs: [{ workspaceId: 'default', agentId: who.id }] }
        : {}
  return anEndedRunWith(names, shape === 'filer' ? { actorId: who.id, filedIn: 'default' } : null, territory)
}

/** A local wall-clock stamp this many seconds from now, as a hold row stores it. */
function aStampFromNow(seconds: number): string {
  const at = new Date(Date.now() + seconds * 1000)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${String(at.getFullYear())}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
}

/** A hold on this agent's handle by this session, last heard this many seconds ago. */
function aHold(id: string, who: Agent, session: string, heardSecondsAgo: number): void {
  t.client.sqlite
    .prepare('INSERT INTO handle_holds (id, agent_id, session_record_id, machine, runtime, claimed_at, last_heard_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, who.id, session, 'made-up-machine', 'claude-code', aStampFromNow(-heardSecondsAgo - 60), aStampFromNow(-heardSecondsAgo))
}

/** Ended territory runs, the four shapes in turn, shared among these agents, in one transaction. */
function addEndedRuns(agents: readonly Agent[], count: number, from: number): void {
  t.client.sqlite.transaction(() => {
    for (let i = from; i < from + count; i++) anEndedRun(SHAPES[i % SHAPES.length]!, agents[i % agents.length]!, ['made-up/'])
  })()
}

async function theEndedAgents(): Promise<Agent[]> {
  const out: Agent[] = []
  for (let i = 0; i < 8; i++) out.push(await agent())
  return out
}

it('A. one territory PATCH with 110 and with 1,100 ended runs', async () => {
  const first = await agent(), second = await agent()
  const mine = run(first, ['src/made-up-before.ts'], ['work/meet.ts'])
  const theirs = run(second, ['work/**'], ['work/meet.ts'])
  const ended = await theEndedAgents()
  addEndedRuns(ended, FEW_ENDED_RUNS, 0)
  // THE GROUP IS OPENED HERE, so a counted write does not open it.
  const opened = await patch(mine, { territory: ['work/meet.ts'] }, first)
  expect(opened.statusCode, opened.body).toBe(200)
  expect(opened.json().territoryOverlaps.overlaps).toHaveLength(1)

  const few = await watching(() => patch(mine, { territory: ['work/meet.ts', 'tests/made-up-one.txt'] }, first))
  expect(few.answer.statusCode, few.answer.body).toBe(200)
  addEndedRuns(await theEndedAgents(), MANY_ENDED_RUNS - FEW_ENDED_RUNS, FEW_ENDED_RUNS)
  const many = await watching(() => patch(mine, { territory: ['work/meet.ts', 'tests/made-up-one.txt', 'tests/made-up-two.txt'] }, first))
  expect(many.answer.statusCode, many.answer.body).toBe(200)

  expect(theTerritoryListStatements(few.statements)).toHaveLength(1)
  expect(theTerritoryListStatements(many.statements)).toHaveLength(1)
  const one = few.answer.json().territoryOverlaps
  expect(many.answer.json().territoryOverlaps).toEqual(one)
  expect(one).toEqual({ compared: true, overlaps: [{ run: theirs, agent: second.id, paths: ['work/meet.ts'], group: expect.any(String) }] })
  expect(many.statements.length, 'a territory PATCH runs more statements with ten times the ended runs').toBe(few.statements.length)
}, A_CASE_THAT_WRITES_THE_ENDED_RUNS)

it('B. one seal with 110 and with 1,100 ended runs', async () => {
  const ended = await theEndedAgents()
  /** Two running runs of two new agents that meet at one changed path, the group opened: the second one is sealed. */
  const aPairToSeal = async () => {
    const first = await agent(), second = await agent()
    const mine = run(first, ['work/**'], ['work/meet.ts'])
    const theirs = run(second, ['src/made-up-before.ts'], ['work/meet.ts'])
    const opened = await patch(mine, { territory: ['work/**', 'src/made-up-one.ts'] }, first)
    expect(opened.statusCode, opened.body).toBe(200)
    expect(opened.json().territoryOverlaps.overlaps).toHaveLength(1)
    return { first, second, mine, theirs }
  }
  addEndedRuns(ended, FEW_ENDED_RUNS, 0)
  const before = await aPairToSeal()
  const few = await watching(() => patch(before.theirs, { state: 'finished' }, before.second))
  expect(few.answer.statusCode, few.answer.body).toBe(200)
  // THE FIRST PAIR'S RUNS END, as the earlier runs of an office do, so the second seal is compared with two running runs too.
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'crashed') WHERE id IN (?, ?)").run(before.mine, before.theirs)
  addEndedRuns(await theEndedAgents(), MANY_ENDED_RUNS - FEW_ENDED_RUNS - 2, FEW_ENDED_RUNS)
  const after = await aPairToSeal()
  const many = await watching(() => patch(after.theirs, { state: 'finished' }, after.second))
  expect(many.answer.statusCode, many.answer.body).toBe(200)

  expect(theTerritoryListStatements(few.statements)).toHaveLength(1)
  expect(theTerritoryListStatements(many.statements)).toHaveLength(1)
  expect(few.answer.json().territoryOverlaps).toEqual({ compared: true, overlaps: [{ run: before.mine, agent: before.first.id, paths: ['work/meet.ts'], group: expect.any(String) }] })
  expect(many.answer.json().territoryOverlaps).toEqual({ compared: true, overlaps: [{ run: after.mine, agent: after.first.id, paths: ['work/meet.ts'], group: expect.any(String) }] })
  expect(many.statements.length, 'a seal runs more statements with ten times the ended runs').toBe(few.statements.length)
}, A_CASE_THAT_WRITES_THE_ENDED_RUNS)

for (const shape of SHAPES) {
  it(`C. an agent whose only territory run has ended, named by ${shape}, still makes a folder shared`, async () => {
    const endedAgent = await agent(), first = await agent(), second = await agent()
    anEndedRun(shape, endedAgent, ['tools/**'])
    const mine = run(first, ['tools/**'], ['tools/made-up-one.ts'])
    run(second, ['src/made-up-index.ts'], ['tools/made-up-two.ts'])
    const reply = await patch(mine, { territory: ['tools/**', 'src/made-up-shared.ts'] }, first)
    expect(reply.statusCode, reply.body).toBe(200)
    expect(reply.json().territoryOverlaps).toEqual({ compared: true, overlaps: [] })
  }, 5_000)
}

it('D. the light reading names the agent the one-row reader names, for every way an ended run names it', async () => {
  const theLightReading = Reflect.get(claims, 'theRunsWithATerritory') as unknown
  expect(typeof theLightReading, 'src/server/lib/claims.ts exports no theRunsWithATerritory, so its reading cannot be compared').toBe('function')
  const read = theLightReading as (workspaceId: string) => { runs: readonly { id: string; workspaceId: string; agentId: string | null }[] }
  const a = await agent(), live = await agent(), retired = await agent(), lone = await agent()
  const recorded = await agent(), holding = await agent(), lapsing = await agent()
  // A HANDLE TWO AGENTS ANSWER TO, one live and one retired, and a handle only a retired agent answers to.
  t.client.sqlite.prepare("UPDATE agents SET retired = 1, retired_at = '2026-11-12 09:00:00', handle = ? WHERE id = ?").run(live.handle, retired.id)
  t.client.sqlite.prepare("UPDATE agents SET retired = 1, retired_at = '2026-11-12 09:00:00' WHERE id = ?").run(lone.id)
  const itsRecord = (t.client.sqlite.prepare('SELECT record_id AS id FROM agent_records WHERE agent_id = ?').get(recorded.id) as { id: string } | undefined)?.id
  expect(itsRecord, 'the made-up agent has no agent record').toBeDefined()
  const territory = ['made-up-d/']
  const byA = { actorId: a.id, filedIn: 'default' }
  const ranAs = (agentId: string) => ({ ranAs: [{ workspaceId: 'default', agentId }] })
  const meant = new Map<string, { said: string; agent: string | null }>()
  const add = (said: string, agentId: string | null, id: string) => meant.set(id, { said, agent: agentId })
  for (const shape of SHAPES) add(`named by ${shape}`, a.id, anEndedRun(shape, a, territory))
  add('ranAs a handle two agents answer to, filed by a', a.id, anEndedRunWith(ranAs(live.handle), byA, territory))
  add('filed under a handle two agents answer to', null, anEndedRunWith({}, { actorId: live.handle, filedIn: 'default' }, territory))
  add('servingAgent a handle two agents answer to, filed by a', a.id, anEndedRunWith({ servingAgent: live.handle }, byA, territory))
  add('ranAs a retired handle', lone.id, anEndedRunWith(ranAs(lone.handle), null, territory))
  add('filed under a retired handle', lone.id, anEndedRunWith({}, { actorId: lone.handle, filedIn: 'default' }, territory))
  add('servingAgent an agent record id', recorded.id, anEndedRunWith({ servingAgent: itsRecord }, null, territory))
  add('ranAs an agent record id', recorded.id, anEndedRunWith(ranAs(itsRecord!), null, territory))
  const heldRun = anEndedRunWith(ranAs(a.id), null, territory)
  aHold('made-up-live-hold', holding, heldRun, 0)
  add('ranAs a, with a live hold of another agent', holding.id, heldRun)
  const lapsedRun = anEndedRunWith({}, byA, territory)
  aHold('made-up-lapsed-hold', lapsing, lapsedRun, 3 * 24 * 3600)
  add('filed by a, with a lapsed hold of another agent', a.id, lapsedRun)
  // A RUN FILED IN THE MESSAGE CENTRE, whose create row is filed under the project: the one-row reader finds it there.
  add('filed in the message centre, its create row under the project', a.id, anEndedRunWith({}, byA, territory, 'message-centre'))

  const listed = [...read('default').runs, ...read('message-centre').runs]
  const released = t.client.sqlite.prepare("SELECT released_at AS at FROM handle_holds WHERE id = 'made-up-lapsed-hold'").get() as { at: string | null }
  expect(released.at, 'the light reading did not release the lapsed hold').not.toBeNull()
  expect(listed.map((one) => one.id).sort()).toEqual([...meant.keys()].sort())
  for (const one of listed) {
    const stored = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(one.id) as { data: string }
    const alone = theAgentOfATerritoryRun({ id: one.id, workspaceId: one.workspaceId, data: JSON.parse(stored.data) as Record<string, unknown> })
    expect(one.agentId, `the light reading of the run ${meant.get(one.id)!.said}`).toBe(alone?.id ?? null)
    expect(one.agentId, `the run ${meant.get(one.id)!.said}`).toBe(meant.get(one.id)!.agent)
  }
}, 5_000)
