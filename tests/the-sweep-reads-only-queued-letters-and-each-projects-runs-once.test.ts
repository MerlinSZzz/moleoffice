// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DEAD-LETTER SWEEP READS ONLY AN AGENT'S QUEUED LETTERS, AND EACH PROJECT'S RUNNING RUNS ONCE.
 *
 * Round 163 of wave 13y. The sweep runs on the server's own timer every five minutes and never yields, so the server
 * answers nobody while it runs. A profile of the live office on 12 November 2026 timed one sweep at 23.6 seconds, and
 * two readings made most of it:
 *   · 15.9 seconds went to the queued letters of the agents whose runs take their letters at a checkpoint
 *     (`newCheckpointLetters` in src/server/lib/worker-delivery/letters.ts). The read started from the messages, so
 *     SQLite walked every message written after each such agent's first run, through the index on the kind, and asked
 *     of each one whether it was queued for the agent: 11.1 million messages in all, for 1,173 queued letters. `checkpointPage`
 *     asks in the same way, for its count and for its page.
 *   · 2.7 of the 5.5 seconds the dead-letter reading took went to reading a project's running runs again for every
 *     checkpoint run the sweep keeps (`agentsWhoseRunsMayRead` in src/server/lib/deadletters.ts).
 * On a made-up office shaped like the live one, each sweep after the first took 10.7 to 12.2 seconds before the change.
 *
 * NO PLANNER STATISTICS. The live office has no sqlite_stat1, because nothing in Mole Office runs ANALYZE, so SQLite
 * chooses a plan from the shape of a query alone. Each office here has none either, and cases 3 and 4 check it, so the
 * plans read here are the plans the live office gets.
 *
 * WHAT IS HELD HERE.
 *   1. The queued-letters read of `newCheckpointLetters`, and the count and the page of `checkpointPage`, start from the
 *      delivery rows, through the index on a delivery's recipient, and none walks the messages through the index on the
 *      kind. The statements are the ones the code runs, caught as they are prepared and asked for their plan with the
 *      values they ran with. On the code before the change this fails: all three start from the messages.
 *   2. The answers stay. A letter queued for the agent after its first checkpoint run is found, in the order the
 *      messages were written. A letter written before that run, written in another project, already routed for the
 *      agent, delivered, queued for somebody else or deleted is not. The page holds the same letters, the routed one
 *      too, because the page does not ask whether a letter was routed.
 *   3. The office of cases 1 and 2 holds no planner statistics.
 *   4. One sweep reads a project's running runs once, whether it keeps one checkpoint run there or three, and neither
 *      office holds planner statistics. On the code before the change this fails: the sweep reads them once for every
 *      checkpoint run.
 *
 * Every agent, run and letter here is made up.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { freshDb, type TestDb } from './helpers.ts'

const PROJECT = 'default'
const ELSEWHERE = 'made-up-elsewhere'
// ONE INSTANT FOR THE WHOLE FILE, so every stamp below and the office's own clock read the same moment.
const THE_MOMENT = new Date(2026, 10, 12, 9, 0, 0)
const BY = { type: 'system' as const, id: 'mole-office' }

interface Ran {
  sql: string
  params: unknown[]
}

/**
 * EVERY STATEMENT THE DATABASE RUNS while `during` runs, with the values it ran with. Each statement is wrapped as it is
 * prepared, so a statement that is prepared once and kept is still seen each time it runs.
 */
function watchTheStatements(db: TestDb): { during: (act: () => void) => Ran[] } {
  const sqlite = db.client.sqlite as unknown as { prepare: (sql: string) => unknown }
  const original = sqlite.prepare.bind(sqlite)
  let ran: Ran[] | null = null
  sqlite.prepare = (sql: string): unknown => {
    const statement = original(sql) as object
    const wrapped: unknown = new Proxy(statement, {
      get(target, prop) {
        const value = Reflect.get(target, prop, target) as unknown
        if (typeof value !== 'function') return value
        const call = (...args: unknown[]): unknown => (value as (...a: unknown[]) => unknown).apply(target, args)
        if (prop === 'all' || prop === 'get' || prop === 'run' || prop === 'iterate') {
          return (...args: unknown[]) => {
            // THE VALUES COME AS ARGUMENTS, or as one array of them.
            const params = args.length === 1 && Array.isArray(args[0]) ? (args[0] as unknown[]) : args
            ran?.push({ sql: sql.replace(/\s+/g, ' ').trim(), params })
            return call(...args)
          }
        }
        // THESE GIVE BACK THE STATEMENT ITSELF, and the wrapped one must come back so its runs are seen.
        if (prop === 'raw' || prop === 'pluck' || prop === 'expand' || prop === 'bind' || prop === 'safeIntegers') {
          return (...args: unknown[]) => {
            call(...args)
            return wrapped
          }
        }
        return call
      },
    })
    return wrapped
  }
  return {
    during(act) {
      ran = []
      try {
        act()
        return ran
      } finally {
        ran = null
      }
    },
  }
}

/** The plan SQLite makes for one statement that ran, one line for each step, asked with the values it ran with. */
function thePlanOf(db: TestDb, one: Ran): string[] {
  return (db.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${one.sql}`).all(...one.params) as { detail: string }[]).map((row) => row.detail)
}

/** The table a plan walks first: the outer loop, which every other step is asked once for each row of. */
function theFirstWalk(plan: readonly string[]): string | undefined {
  return plan.find((step) => /^(SEARCH|SCAN) /.test(step))
}

/** A statement that reads the delivery rows. */
const readsTheDeliveries = (one: Ran): boolean => /\bmessage_delivery\b/.test(one.sql)

/** How many planner statistics tables the office holds. */
function theStatisticsTables(db: TestDb): number {
  return (db.client.sqlite.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE 'sqlite_stat%'").get() as { n: number }).n
}

/** A made-up office, opened with the office's clock held at THE_MOMENT and the role cards read as the server reads them. */
async function aMadeUpOffice(): Promise<TestDb> {
  const db = await freshDb()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(THE_MOMENT)
  const roles = await import('../src/server/lib/roles.ts')
  roles.readTheRoleCards({ guardActKeys: db.api.GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
  return db
}

/** An agent of the made-up office, by handle, and its registry id. */
function anAgent(db: TestDb, handle: string): string {
  db.api.createRecord({ workspaceId: PROJECT, kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' }, actor: db.api.HUMAN })
  return (db.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
}

/** A running run of the agent that takes its letters at a checkpoint. */
function aCheckpointRun(db: TestDb, agent: string, handle: string): string {
  return db.api.createRecord({
    workspaceId: PROJECT,
    kind: 'session',
    title: `A made-up checkpoint run of ${handle}`,
    origin: 'fixture',
    data: { state: 'running', runtime: 'claude-code', servingAgentId: agent, servingAgent: handle, extra: { officeCheckpoint: true } },
    actor: db.api.HUMAN,
  }).id
}

/**
 * A LETTER, PUT IN AS A MESSAGE ROW, the shape the record door stores: kept in the message centre with the project it
 * was written in, or kept in the project itself. Its delivery rows are put in apart, so their order can differ.
 */
function aLetter(db: TestDb, id: string, to: string, from: string, how: { keptIn?: string; writtenIn?: string; routedFor?: string; deleted?: boolean } = {}): string {
  const now = localStamp(THE_MOMENT)
  const keptIn = how.keptIn ?? 'message-centre'
  const data = {
    body: 'A made-up letter.',
    to: [{ kind: 'agent', id: to }],
    sentBy: { kind: 'agent', id: from },
    ...(keptIn === 'message-centre' ? { writtenIn: { project: how.writtenIn ?? PROJECT } } : {}),
    ...(how.routedFor === undefined
      ? {}
      : { routed: [{ for: { kind: 'agent', id: how.routedFor }, to: null, because: 'A made-up reason.', line: 'A made-up line.', passedOver: [] }] }),
  }
  db.client.sqlite
    .prepare(
      'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin) ' +
        "VALUES (?, ?, ?, ?, ?, 'message', 'A made-up letter', NULL, ?, ?, 'authored')",
    )
    .run(id, keptIn, THE_PERSON, now, now, JSON.stringify(data), how.deleted === true ? now : null)
  return id
}

/** A delivery row of a letter to one agent, queued unless it says delivered. */
function aDelivery(db: TestDb, message: string, to: string, mark: 'queued' | 'delivered' = 'queued'): void {
  db.client.sqlite
    .prepare("INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, 'agent', ?, ?, ?)")
    .run(`delivery-of-${message}-to-${to}`, message, to, mark, localStamp(THE_MOMENT))
}

/** A record's row number, the order the records were written in. */
function theRowidOf(db: TestDb, id: string): number {
  return (db.client.sqlite.prepare('SELECT rowid AS n FROM records WHERE id = ?').get(id) as { n: number }).n
}

/**
 * ONE SWEEP OF A MADE-UP OFFICE WHOSE PROJECT HOLDS `runs` RUNNING CHECKPOINT RUNS, each of an agent of its own, and how
 * many times the sweep read the project's running runs. One letter waits for another agent, which has no run, so the
 * sweep goes on to ask whose runs may still read their mail; with no letter queued for an agent it stops before that.
 * The read is known by the statement the reader of a project's running runs runs (`runningRunRowsIn`), with the project
 * among its values.
 */
async function theRunningRunReadsOfOneSweep(runs: number): Promise<{ reads: number; statistics: number }> {
  const db = await aMadeUpOffice()
  try {
    const reader = anAgent(db, 'made-up-reader')
    const writer = anAgent(db, 'made-up-writer')
    aDelivery(db, aLetter(db, 'madeUpLetterToTheReader', reader, writer), reader)
    for (let n = 0; n < runs; n++) {
      const handle = `made-up-checkpoint-agent-${n}`
      aCheckpointRun(db, anAgent(db, handle), handle)
    }
    const watcher = watchTheStatements(db)
    const worker = await import('../src/server/lib/worker.ts')
    const { sweepDeadLetters } = await import('../src/server/lib/deadletters.ts')
    const theReader = watcher.during(() => worker.runningRunRowsIn(PROJECT))
    expect(theReader.map((one) => one.sql), 'the statements the reader of the running runs runs').toHaveLength(1)
    const ran = watcher.during(() => sweepDeadLetters(BY))
    const reads = ran.filter((one) => one.sql === theReader[0]!.sql && one.params.includes(PROJECT)).length
    return { reads, statistics: theStatisticsTables(db) }
  } finally {
    vi.useRealTimers()
    db.close()
  }
}

beforeAll(() => {
  vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'off')
})

afterAll(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('the queued letters of an agent whose run takes them at a checkpoint', () => {
  let t: TestDb
  let watcher: ReturnType<typeof watchTheStatements>
  let worker = ''
  let writer = ''
  let run = ''
  const letters: Record<'past' | 'routed' | 'pastToo' | 'inTheProject', string> = { past: '', routed: '', pastToo: '', inTheProject: '' }

  beforeAll(async () => {
    t = await aMadeUpOffice()
    worker = anAgent(t, 'made-up-checkpoint-worker')
    writer = anAgent(t, 'made-up-writer')
    const somebodyElse = anAgent(t, 'made-up-somebody-else')
    // BEFORE THE RUN: the letter that opens no checkpoint. No letter can sit at the boundary itself, because the
    // boundary is the run's own row number, so the letter just before the run is the nearest one left out.
    const before = aLetter(t, 'madeUpLetterBefore', worker, writer)
    run = aCheckpointRun(t, worker, 'made-up-checkpoint-worker')
    // THE RUN'S OWN PROCESS IS THIS ONE, so the page counts the run as alive. The row is released before the office
    // closes, without stopping anything.
    const { registerResource } = await import('../src/server/lib/resources.ts')
    registerResource({ workspaceId: PROJECT, sessionRecordId: run, type: 'process', key: String(process.pid), startedByTheProduct: true, actor: t.api.HUMAN })
    letters.past = aLetter(t, 'madeUpLetterPast', worker, writer)
    letters.routed = aLetter(t, 'madeUpLetterRouted', worker, writer, { routedFor: worker })
    letters.pastToo = aLetter(t, 'madeUpLetterPastToo', worker, writer)
    const elsewhere = aLetter(t, 'madeUpLetterElsewhere', worker, writer, { writtenIn: ELSEWHERE })
    const delivered = aLetter(t, 'madeUpLetterDelivered', worker, writer)
    const forSomebodyElse = aLetter(t, 'madeUpLetterForSomebodyElse', somebodyElse, writer)
    const deleted = aLetter(t, 'madeUpLetterDeleted', worker, writer, { deleted: true })
    letters.inTheProject = aLetter(t, 'madeUpLetterInTheProject', worker, writer, { keptIn: PROJECT })
    expect(theRowidOf(t, before)).toBeLessThan(theRowidOf(t, run))
    expect(theRowidOf(t, run)).toBeLessThan(theRowidOf(t, letters.past))
    // THE DELIVERY ROWS GO IN NEWEST LETTER FIRST, so the order of the delivery rows is not the order of the messages,
    // and an answer in the order of the messages is put in that order by the read.
    aDelivery(t, letters.inTheProject, worker)
    aDelivery(t, deleted, worker)
    aDelivery(t, forSomebodyElse, somebodyElse)
    aDelivery(t, delivered, worker, 'delivered')
    aDelivery(t, elsewhere, worker)
    aDelivery(t, letters.pastToo, worker)
    aDelivery(t, letters.routed, worker)
    aDelivery(t, letters.past, worker)
    aDelivery(t, before, worker)
    watcher = watchTheStatements(t)
  }, 60_000)

  afterAll(() => {
    if (t === undefined) return
    t.client.sqlite.prepare('UPDATE session_resources SET released_at = ? WHERE released_at IS NULL').run('2000-01-01 00:00:00')
    vi.useRealTimers()
    t.close()
  })

  it("1. reads them from the agent's delivery rows, through the index on the recipient, and walks no message by its kind", async () => {
    const { newCheckpointLetters, checkpointPage } = await import('../src/server/lib/worker-delivery/letters.ts')
    const found = watcher.during(() => newCheckpointLetters()).filter(readsTheDeliveries)
    const page = watcher.during(() => checkpointPage(run, { kind: 'agent', id: worker }, PROJECT)).filter(readsTheDeliveries)
    // ONE READ FOR THE ONE AGENT WITH A CHECKPOINT RUN, and two for the page, its count and its letters, so each is seen.
    expect(found, 'the reads of delivery rows in the new checkpoint letters').toHaveLength(1)
    expect(page, 'the reads of delivery rows in the checkpoint page').toHaveLength(2)
    const plans = [...found, ...page].map((one) => thePlanOf(t, one))
    // EVERY READ'S FIRST STEP IN ONE ANSWER, so a failure names all three and not only the first.
    expect(plans.map(theFirstWalk), 'the first step of each read: the new checkpoint letters, the page\'s count, its letters').toEqual(
      plans.map(() => expect.stringMatching(/^SEARCH \w+ USING (COVERING )?INDEX message_delivery_recipient_idx \(recipient_kind=\? AND recipient_id=\?\)$/)),
    )
    expect(plans.flat().filter((step) => step.includes('records_kind_idx')), 'the steps that walk the messages by their kind').toEqual([])
  })

  it('2. finds the letters queued for the agent after its first checkpoint run, in the order they were written, and no other', async () => {
    const { newCheckpointLetters, checkpointPage } = await import('../src/server/lib/worker-delivery/letters.ts')
    const to = { kind: 'agent' as const, id: worker }
    expect(newCheckpointLetters().map((one) => ({ messageId: one.messageId, workspaceId: one.workspaceId, to: one.to, sentBy: one.sentBy }))).toEqual(
      [letters.past, letters.pastToo, letters.inTheProject].map((messageId) => ({ messageId, workspaceId: PROJECT, to, sentBy: { kind: 'agent', id: writer } })),
    )
    // THE PAGE DOES NOT ASK WHETHER A LETTER WAS ROUTED, so the routed letter is on it in its place.
    const every = [letters.past, letters.routed, letters.pastToo, letters.inTheProject]
    expect(checkpointPage(run, to, PROJECT)).toEqual({ ids: every, left: 0, checkpoint: { run, agent: worker, oversize: [] } })
    expect(checkpointPage(run, to, PROJECT, 2)).toEqual({ ids: every.slice(0, 2), left: 2, checkpoint: { run, agent: worker, oversize: [] } })
  })

  it('3. is read from an office with no planner statistics', () => {
    expect(theStatisticsTables(t)).toBe(0)
  })
})

it("4. one sweep reads a project's running runs once, whether it keeps one checkpoint run there or three", async () => {
  const one = await theRunningRunReadsOfOneSweep(1)
  const three = await theRunningRunReadsOfOneSweep(3)
  expect({ one: one.reads, three: three.reads }, 'the reads of the running runs of the project in one sweep').toEqual({ one: 1, three: 1 })
  // NO PLANNER STATISTICS in either office, as in the live office.
  expect([one.statistics, three.statistics]).toEqual([0, 0])
}, 60_000)
