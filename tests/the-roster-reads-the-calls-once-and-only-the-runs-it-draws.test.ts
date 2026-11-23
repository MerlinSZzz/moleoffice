// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Criterion change (wave 13s round 281, decision srwXywF1oYIs): case 3 holds that each roster reads whole only the
// runs that could serve an active agent: the whole roster reads every run but the retired agent's, and Home's roster
// the open ones of those. Before, case 3 held the whole roster to a read of every run of the project, and Home's
// roster to a read of every open run.
// Criterion change (wave 13s round 281, decisions OQR0WDVq0FkP and M1ngfatGQcwn, H9): case 5 is new. Both rosters
// draw only the agent whose state is active, and count four agents, one active and three retired, when the other
// three are retired, have no state, or have the state "Active". Before, no case here held an agent with no state or
// with the state "Active", or held the counts.
// Criterion change (wave 13s round 281, decisions OQR0WDVq0FkP and M1ngfatGQcwn, F2): case 4 also holds that each
// row of Home's roster names the run serving its agent, the whole roster's doingFrom for the same agent.
// Home reads the serving run from its roster's rows, so the run a bar counts as stuck is read there.
// Before, case 4 held only Home's doing lines to the whole roster's.
/**
 * THE ROSTER ASKS THE CALLS ONCE FOR EVERY OPEN RUN, READS THE PROJECT'S RUNS WHOLE ONLY IN THE LISTS OF THEM IT DRAWS
 * FROM, AND DRAWS EVERY ROW AS IT DID.
 *
 * Wave 13y round 114, item 47, the fourth pass over the API's speed. MEASURED FIRST, 31 October 2026, on the made-up
 * office shaped to the live counts of that morning: the largest project holds 16,548 runs in 102 MB, 974 active agents
 * and 7,053 open runs of theirs, and the office holds 1,824,980 calls. GET /api/working answered 2.8 MB in 6.8 s, and
 * Home's roster answered in 5.0 s, at a load of 50 to 57 on 20 cores from other work. Of their SQLite time in a traced
 * take, 4.2 of 5.8 s and 4.6 of 5.4 s went to the newest request of each open run: it was asked in pieces of 500 runs,
 * and the calls are not indexed by run, so each of the 15 pieces read all of the calls. The roster also read every
 * run's record a third time, whole, to draw the doing line of the runs that serve an agent, and for each of the 974
 * agents it went through all 16,548 runs to find its own. Home's roster read every run of the project and drew nothing
 * from the closed ones.
 *
 * WHAT IS HELD HERE:
 *   1. The whole roster and Home's roster each ask the calls in one statement, for more open runs than two pieces hold.
 *   2. That one statement gives each run, and every run together, what `newestRequestFor` gives them.
 *   3. The whole roster reads the records of the runs that could serve an active agent once, for its last progress and
 *      the open runs together, and the records of the runs that serve an agent besides. Home's roster reads them only
 *      in the list of the open ones.
 *   4. Each row's doing line, the run it comes from, the run serving it and its last progress are what they are worked
 *      out to be here from the stored rows, as the roster worked them out before this round, and Home's doing lines are
 *      the whole roster's. So is the run serving each agent that Home's roster names.
 *   5. Both rosters draw only an agent whose state is `active`, and count every live agent record, the others as
 *      retired: an agent with no state and one whose state is `Active` are not active.
 *
 * Every row is made up. Most runs are copies of one run the store opened, so each carries what the store writes.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

let WORKSPACE = 'default'
const PERSON = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const AN_AGENT_PROCESS = { type: 'agent', id: 'claude-code' } as const
/** More open runs than two pieces of `IDS_AT_ONCE` (500) hold. */
const BUSY_RUNS = 1_100

let t: TestDb
let attachments: typeof import('../src/server/lib/attachments.ts')
let arrivals: typeof import('../src/server/lib/arrivals.ts')
let working: typeof import('../src/server/lib/working.ts')
let createWorkspace: typeof import('../src/server/lib/workspaces.ts').createWorkspace
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  attachments = await import('../src/server/lib/attachments.ts')
  arrivals = await import('../src/server/lib/arrivals.ts')
  working = await import('../src/server/lib/working.ts')
  ;({ createWorkspace } = await import('../src/server/lib/workspaces.ts'))
}, 60_000)

afterAll(() => {
  t.close()
})

beforeEach(() => {
  // A project of this case's own, so the roster a case reads sees only the agents it made.
  caseNumber += 1
  WORKSPACE = `roster-reads-case-${String(caseNumber)}`
  createWorkspace({ id: WORKSPACE, title: `Roster reads case ${String(caseNumber)}` })
})

function anAgent(handle: string, state = 'active'): string {
  return t.api.createRecord({ kind: 'agent', title: `the ${handle} agent`, workspaceId: WORKSPACE, data: { handle, state }, actor: PERSON }).id
}

function aRunFor(agentId: string, title: string, doing?: string): string {
  return attachments.openAttachment({ workspaceId: WORKSPACE, actor: PERSON, title, agentId, ...(doing === undefined ? {} : { doing }) }).attachment.id
}

function closeRun(runId: string): void {
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(runId)
  attachments.closeAttachment(runId, { workspaceId: WORKSPACE, actor: AN_AGENT_PROCESS, because: 'The run ended and said so.', how: 'agent-said' })
}

/** A stored stamp moved back by some seconds, in the stamp's own form. */
function earlier(stamp: string, seconds: number): string {
  const moved = new Date(Date.parse(`${stamp.replace(' ', 'T')}Z`) - seconds * 1000)
  return moved.toISOString().replace('T', ' ').slice(0, 19)
}

/** `n` copies of a stored run, each opened a second before the last, with ids of this case. The newest copy is the first. */
function copiesOf(runId: string, n: number): string[] {
  const { created_at: at } = t.client.sqlite.prepare('SELECT created_at FROM records WHERE id = ?').get(runId) as { created_at: string }
  expect(at, 'a run is stamped in the form this fixture moves').toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  const copy = t.client.sqlite.prepare(
    'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin) ' +
      'SELECT ?, workspace_id, owner_id, ?, ?, kind, title, summary, data, deleted_at, origin FROM records WHERE id = ?',
  )
  const ids: string[] = []
  for (let i = 1; i <= n; i += 1) {
    const id = `rc${String(caseNumber)}x${String(i).padStart(5, '0')}`
    copy.run(id, earlier(at, i), earlier(at, i), runId)
    ids.push(id)
  }
  return ids
}

/** One `api_calls` row carrying a run as its session, written straight into the table. */
function aRequestFrom(runId: string | null, minutesAgo: number): void {
  const when = Date.now() - minutesAgo * 60_000
  t.client.sqlite
    .prepare('INSERT INTO api_calls (id, at_ms, ms, method, waits, status, session_id, identity_source) VALUES (?, ?, 1.0, ?, 0, 200, ?, ?)')
    .run(`call-${String(when)}-${String(runId)}-${String(Math.random())}`, when, 'GET', runId, 'header')
}

/** One `changes` row written by a run, at a stamp of its own. */
function aChangeBy(runId: string, at: string): void {
  t.client.sqlite
    .prepare(
      'INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, session_id, field, new_value, at) ' +
        "VALUES (?, ?, ?, 'update', 'agent', 'claude-code', ?, 'title', 'made up', ?)",
    )
    .run(`ch-${runId}-${at}`, runId, WORKSPACE, runId, at)
}

/**
 * One busy agent with more open runs than two pieces hold, some of which sent requests and wrote changes, and whose
 * newest open run says what it is doing in other words than the rest; a quiet agent with two open runs and a closed
 * one; an idle agent with no run; and a retired agent with runs the roster does not draw.
 */
function aBusyOffice(): { busy: string; quiet: string; runs: string[]; retiredRuns: string[] } {
  const busy = anAgent('busy')
  const first = aRunFor(busy, 'the busy run', 'made up: the line every copy carries')
  const copies = copiesOf(first, BUSY_RUNS - 1)
  // The newest open run is `first`; its line is changed, so a line from any other run is told apart from it.
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.doing', 'made up: the newest run''s line') WHERE id = ?").run(first)
  for (const [i, run] of copies.entries()) {
    if (i % 7 === 0) aRequestFrom(run, 1 + (i % 50))
    if (i % 11 === 0) aChangeBy(run, earlier('2026-10-30 12:00:00', i))
  }
  aRequestFrom(first, 30)
  const quiet = anAgent('quiet')
  const quietOne = aRunFor(quiet, 'a quiet run')
  const quietTwo = aRunFor(quiet, 'another quiet run', 'made up: the quiet line')
  // The two open runs are opened apart, so which is newer is not left to the order the rows are read in.
  t.client.sqlite.prepare("UPDATE records SET created_at = ? WHERE id = ?").run(earlier('2026-10-30 09:00:00', 0), quietOne)
  const quietClosed = aRunFor(quiet, 'a closed quiet run')
  aChangeBy(quietClosed, '2026-10-30 18:00:00')
  aRequestFrom(quietClosed, 1)
  closeRun(quietClosed)
  anAgent('idle')
  const retired = anAgent('retired', 'retired')
  const retiredRuns = [aRunFor(retired, 'a retired agent run'), aRunFor(retired, 'another retired agent run')]
  for (const run of retiredRuns) aRequestFrom(run, 2)
  aRequestFrom(null, 0)
  return { busy, quiet, runs: [first, ...copies, quietOne, quietTwo, quietClosed, ...retiredRuns], retiredRuns }
}

/** Every statement run while `run` runs, with the rows it handed back. */
function theStatementsOf(run: () => unknown): { sql: string; rows: number }[] {
  type Run = (this: { source: string }, ...params: unknown[]) => unknown
  // THE STATEMENTS' OWN PROTOTYPE, so a statement prepared before this runs and kept is counted too.
  const prototype = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<string, Run>
  const ran: { sql: string; rows: number }[] = []
  const originals = new Map<string, Run>()
  for (const method of ['all', 'get', 'run', 'iterate']) {
    const call = prototype[method]!
    originals.set(method, call)
    prototype[method] = function (...params: unknown[]) {
      const got = call.apply(this, params)
      ran.push({ sql: this.source, rows: method === 'all' ? (got as unknown[]).length : method === 'get' ? Number(got !== undefined) : 0 })
      return got
    }
  }
  try {
    run()
  } finally {
    for (const [method, call] of originals) prototype[method] = call
  }
  return ran
}

const theCalls = (ran: { sql: string }[]): { sql: string }[] => ran.filter((one) => /\bapi_calls\b/.test(one.sql) && /\bmax\(/i.test(one.sql))
/** The statements that read a run's whole record: its data, from the records table, for at least `atLeast` rows. */
const theWholeRuns = (ran: { sql: string; rows: number }[], atLeast: number): { sql: string; rows: number }[] =>
  ran.filter((one) => /from\s+"?records"?/i.test(one.sql) && /"data"/.test(one.sql) && one.rows >= atLeast)

describe('the roster', () => {
  it('1. asks the calls in one statement for more open runs than two pieces hold, whole and as Home draws it', () => {
    aBusyOffice()
    const whole = theStatementsOf(() => working.whoIsWorking(WORKSPACE))
    const home = theStatementsOf(() => working.theRosterHomeDraws(WORKSPACE))
    expect(theCalls(whole), 'the statements of the whole roster that ask the calls').toHaveLength(1)
    expect(theCalls(home), "the statements of Home's roster that ask the calls").toHaveLength(1)
  })

  it('2. finds in that one statement the newest request newestRequestFor finds, for each run and for every run together', () => {
    const { runs } = aBusyOffice()
    const ran = theStatementsOf(() => arrivals.newestRequestOfEachRun(runs))
    expect(theCalls(ran), 'the statements that ask the calls').toHaveLength(1)
    const read = arrivals.newestRequestOfEachRun(runs)
    let nulls = 0
    let answered = 0
    for (const run of runs) {
      const expected = arrivals.newestRequestFor([run])
      if (expected === null) nulls += 1
      else answered += 1
      expect(arrivals.newestRequestAmong([run], read), `run ${run}`).toBe(expected)
    }
    expect(nulls, 'no run that sent nothing was compared').toBeGreaterThan(500)
    expect(answered, 'no run that sent a request was compared').toBeGreaterThan(150)
    expect(arrivals.newestRequestAmong(runs, read)).toBe(arrivals.newestRequestFor(runs))
  })

  it("3. reads the runs that could serve an active agent whole only in the lists it draws from, and the whole roster the serving runs' besides", () => {
    const { runs, retiredRuns } = aBusyOffice()
    // THE RUNS THAT COULD SERVE AN ACTIVE AGENT are every run but the retired agent's. Every one of them is open but the
    // quiet agent's closed run.
    const couldServe = runs.length - retiredRuns.length
    const openCouldServe = runs.length - 1 - retiredRuns.length
    const whole = theStatementsOf(() => working.whoIsWorking(WORKSPACE))
    const home = theStatementsOf(() => working.theRosterHomeDraws(WORKSPACE))
    // THE LISTS: the runs that could serve an active agent once, which the whole roster reads its last progress and the
    // open runs from together. Home draws no closed run, so its list is the open ones of those and stays a read of its
    // own. A read of every run of the project, or of every open one, is at least as long as the shorter list, so it is
    // counted here and fails.
    const rowsOf = (ran: { rows: number }[]): number[] => ran.map((one) => one.rows).sort((a, b) => a - b)
    expect(
      rowsOf(theWholeRuns(whole, openCouldServe)),
      'the whole roster: the reads of the runs that could serve an active agent, whole',
    ).toEqual([couldServe])
    expect(
      rowsOf(theWholeRuns(home, openCouldServe)),
      "Home's roster: the reads of the open runs that could serve an active agent, whole",
    ).toEqual([openCouldServe])
    // THE SERVING RUNS: one for each of the two agents a run serves.
    const serving = whole.filter((one) => /from\s+"?records"?/i.test(one.sql) && /"data"/.test(one.sql) && one.rows > 0 && one.rows < openCouldServe)
    expect(serving.map((one) => one.rows).filter((rows) => rows === 2), "the read of the serving runs' records").toHaveLength(1)
  })

  it("4. draws each row's doing line, the run it comes from, the run serving it and its last progress as before", () => {
    const { busy, quiet } = aBusyOffice()
    const roster = working.whoIsWorking(WORKSPACE)
    expect(roster.rows.map((row) => row.handle).sort(), 'the agents drawn').toEqual(['busy', 'idle', 'quiet'])
    // AS BEFORE, worked out here from the stored rows: an agent's runs are the project's runs whose `ranAs` names it here;
    // the run serving it is the newest of them with no `closedAt`; its line is that run's `doing`; and its last progress
    // is the newest change any of its runs wrote.
    type Stored = { id: string; createdAt: string; data: { ranAs?: { workspaceId: string; agentId: string }[]; closedAt?: string; doing?: string } }
    const stored = (
      t.client.sqlite
        .prepare("SELECT id, created_at AS createdAt, data FROM records WHERE kind = 'session' AND workspace_id = ? AND deleted_at IS NULL")
        .all(WORKSPACE) as { id: string; createdAt: string; data: string }[]
    ).map((row): Stored => ({ ...row, data: JSON.parse(row.data) as Stored['data'] }))
    const newestChange = t.client.sqlite.prepare('SELECT max(at) AS at FROM changes WHERE session_id IN (SELECT value FROM json_each(?))')
    for (const row of roster.rows) {
      const mine = stored.filter((run) => (run.data.ranAs ?? []).some((one) => one.workspaceId === WORKSPACE && one.agentId === row.agentId))
      const open = mine.filter((run) => run.data.closedAt === undefined).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      expect(open.length < 2 || open[0]!.createdAt !== open[1]!.createdAt, `no two open runs of ${row.handle} were opened in one second`).toBe(true)
      const serving = open[0] ?? null
      expect(row.attachment?.id ?? null, `the run serving ${row.handle}`).toBe(serving?.id ?? null)
      expect(row.doingFrom, `the run ${row.handle}'s line comes from`).toBe(serving?.id ?? null)
      expect(row.doing, `the doing line of ${row.handle}`).toBe(serving?.data.doing ?? null)
      const progress = (newestChange.get(JSON.stringify(mine.map((run) => run.id))) as { at: string | null }).at
      expect(row.lastProgress.at, `the last progress of ${row.handle}`).toBe(progress)
    }
    const byId = new Map(roster.rows.map((row) => [row.agentId, row]))
    expect(byId.get(busy)?.doing, 'the busy agent is drawn with its newest run, which proves the order was read').toBe("made up: the newest run's line")
    expect(byId.get(quiet)?.doing).toBe('made up: the quiet line')
    expect(byId.get(busy)?.lastProgress.at).toBe('2026-10-30 12:00:00')
    expect(byId.get(quiet)?.lastProgress.at, 'a closed run counts for the last progress').toBe('2026-10-30 18:00:00')
    const home = working.theDoingLinesHomeDraws(WORKSPACE, roster.rows.map((row) => row.agentId))
    expect(home.rows, "Home's doing lines").toEqual(roster.rows.map((row) => ({ agentId: row.agentId, doing: row.doing, doingFrom: row.doingFrom })))
    const homeRoster = working.theRosterHomeDraws(WORKSPACE)
    const servedBy = (rows: { agentId: string; doingFrom: string | null }[]) => rows.map((row) => ({ agentId: row.agentId, doingFrom: row.doingFrom }))
    expect(servedBy(homeRoster.rows), "the run serving each agent of Home's roster").toEqual(servedBy(roster.rows))
  })

  it('5. draws only the agents whose state is active, and counts every other agent as retired, whole and as Home draws it', () => {
    const active = anAgent('active')
    anAgent('retired', 'retired')
    const noState = anAgent('no-state')
    const capital = anAgent('capital')
    // THE KIND TAKES NEITHER OF THESE, so they are written round it, straight into the stored data.
    t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.state') WHERE id = ?").run(noState)
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'Active') WHERE id = ?").run(capital)
    const rosters = [['the whole roster', working.whoIsWorking(WORKSPACE)], ["Home's roster", working.theRosterHomeDraws(WORKSPACE)]] as const
    for (const [name, roster] of rosters) {
      expect(roster.rows.map((row) => row.agentId), `the agents ${name} draws`).toEqual([active])
      expect(roster.counts, `the agents ${name} counts`).toMatchObject({ agents: 4, active: 1, retired: 3 })
    }
  })
})
