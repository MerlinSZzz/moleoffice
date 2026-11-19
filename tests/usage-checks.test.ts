// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A CONTRADICTION CHECK SAID, AT THE MOMENT IT SAID IT — AND WHAT IT STORES WHEN IT COULD NOT
 * SAY ANYTHING.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS AND WHY IT IS NOT PART OF tests/bootstrap-hides-nothing.test.ts
 * ---------------------------------------------------------------------------------------
 *
 * `design/round-ten/design/telemetry.md` §15 names this file and says what it must hold: *a
 * bootstrap call writes one `usage_checks` row per declared check, carrying the call id and the
 * trace; a check that cannot run stores `passed` null, never 0*, with the mutation *make the
 * unrunnable check store 0*.
 *
 * The file did not exist, and the wave-13 verifier ran that mutation and got nothing red anywhere in
 * the repository. What stood in its place asserted that two checks which DID run store 0 or 1, and
 * that a reading's type is null-or-boolean. Neither of those can fail when an unrunnable check is
 * written as 0, because in that suite no check was ever unrunnable.
 *
 * SO THE WHOLE POINT OF THIS FILE IS THE THIRD CASE: a check that really cannot run. It is made real
 * rather than mocked — the table `commentsWithNoQueue` reads is dropped, so the query throws, so the
 * check returns `passed: null` with a reason, and the row the bootstrap writes has to carry that
 * null the whole way to storage.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A NULL AND A 0 ARE NOT TWO SPELLINGS OF ONE ANSWER
 * ---------------------------------------------------------------------------------------
 *
 * `passed: 0` says the check ran and found something wrong. `passed: 1` says it ran and found
 * nothing wrong. `passed: null` says nobody looked. Storing 0 for a check that could not run turns
 * *nobody looked* into *the check failed*; storing 1 turns it into *nothing was wrong*. Both are the
 * fifth engineering rule broken in the one column written to uphold it, and neither would ever be
 * visible again, because the check cannot be recomputed for a past moment — that is why the row is
 * stored at all.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { sql } from 'drizzle-orm'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { usageChecks } from '../src/server/db/schema.ts'

const WORKSPACE = 'default'
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': WORKSPACE }

let t: TestDb
let app: FastifyInstance
/** Every check row the office held before this case ran. The table is read whole on purpose. */
let rowsAtStart: Set<string> = new Set()
/** The table one case drops, with the SQL that puts it back, so the office is whole for the next case. */
let droppedMessages: { table: string; indexes: string[] } | null = null

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

beforeEach(() => {
  rowsAtStart = new Set(checkRows().map((row) => row.id))
})

afterEach(() => {
  if (droppedMessages !== null) {
    t.client.sqlite.exec(droppedMessages.table)
    for (const index of droppedMessages.indexes) t.client.sqlite.exec(index)
    droppedMessages = null
  }
})

afterAll(async () => {
  await app.close()
  t.close()
})

/** The rows this case added, so the whole-table reading still answers about this case alone. */
function addedRows() {
  return checkRows().filter((row) => !rowsAtStart.has(row.id))
}

/** Make the bootstrap read, which is the only thing that writes into `usage_checks`. */
async function bootstrap(headers: Record<string, string> = PERSON): Promise<void> {
  const res = await app.inject({ method: 'GET', url: '/api/project/bootstrap', headers })
  expect(res.statusCode).toBe(200)
}

/** Every check row stored so far. */
function checkRows() {
  return t.client.db.select().from(usageChecks).all()
}

/**
 * TAKE AWAY WHAT ONE CHECK READS, SO THAT CHECK REALLY CANNOT RUN.
 *
 * `commentsWithNoQueue` counts rows of `agent_messages`. With the table gone the query throws, which
 * is the one path in `contradictionsFor` that produces `passed: null`. Nothing is mocked: the check
 * is the shipped check, the failure is a real failure, and the row that follows is the row a real
 * broken installation would write.
 */
function breakTheQueueCheck(): void {
  // THE TABLE'S OWN DECLARATION, read from the database before it goes, so the office can be put
  // back whole when this case ends. Nothing here retypes its shape.
  const table = t.client.sqlite
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'agent_messages'")
    .get() as { sql: string } | undefined
  if (table === undefined) throw new Error('the office holds no agent_messages table to drop')
  const indexes = (
    t.client.sqlite
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'agent_messages' AND sql IS NOT NULL")
      .all() as { sql: string }[]
  ).map((one) => one.sql)
  droppedMessages = { table: table.sql, indexes }
  t.client.db.run(sql`drop table agent_messages`)
}

describe('one row per declared check, per bootstrap call', () => {
  it('writes one row for each check, carrying the call that ran it', async () => {
    await bootstrap()
    const rows = addedRows()
    expect(rows.length).toBe(2)
    expect(rows.map((r) => r.checkId).sort()).toEqual(['campaign-block-vs-report', 'comments-with-no-queue'])
    // THE CALL ID IS WHAT PUTS THE CHECK INSIDE THE REQUEST THAT RAN IT. Without it a check reading
    // is a number with no request behind it, and the stretch surface cannot place it in time.
    for (const row of rows) expect(row.callId).toBeTypeOf('string')
  })

  it('copies the trace off the call, so a check prunes with the recovery it belongs to', async () => {
    await bootstrap({ ...PERSON, 'x-mole-office-trace': 'recovery-11' })
    expect(addedRows()).toHaveLength(2)
    for (const row of addedRows()) expect(row.traceId).toBe('recovery-11')
  })

  it('leaves the trace null when the caller named none, which is a real answer and not a default', async () => {
    await bootstrap()
    expect(addedRows()).toHaveLength(2)
    for (const row of addedRows()) expect(row.traceId).toBeNull()
  })

  it('writes a second set of rows for a second call, because a check reading is about a moment', async () => {
    await bootstrap()
    await bootstrap()
    expect(addedRows().length).toBe(4)
  })
})

describe('a check that could not run stores null, and never 0', () => {
  it('stores null for the check whose source is gone, and a number for the one that still ran', async () => {
    breakTheQueueCheck()
    await bootstrap()

    const rows = addedRows()
    expect(rows.length).toBe(2)
    const broken = rows.find((r) => r.checkId === 'comments-with-no-queue')
    const ran = rows.find((r) => r.checkId === 'campaign-block-vs-report')

    // THE WHOLE FILE IS THIS ASSERTION. `toBeNull` and not `toBeFalsy`: 0 is falsy, and 0 is the
    // wrong answer this test exists to catch.
    expect(broken?.passed).toBeNull()
    expect(broken?.passed === 0).toBe(false)
    // AND THE TWO NUMBERS IT WOULD HAVE COMPARED ARE NULL TOO, because there are no numbers. A 0
    // here would say it compared two empty sides.
    expect(broken?.leftN).toBeNull()
    expect(broken?.rightN).toBeNull()

    // THE CHECK THAT DID RUN IS UNAFFECTED, which is what makes the null above mean *this check*
    // rather than *the bootstrap fell over*.
    expect(ran?.passed === 0 || ran?.passed === 1).toBe(true)
  })

  it('says in the reply why it could not run, rather than reporting a pass', async () => {
    breakTheQueueCheck()
    const res = await app.inject({ method: 'GET', url: '/api/project/bootstrap', headers: PERSON })
    const reply = res.json() as { checks: { id: string; passed: boolean | null; couldNotRun?: string }[] }
    const broken = reply.checks.find((c) => c.id === 'comments-with-no-queue')
    expect(broken?.passed).toBeNull()
    // A REASON, NOT A SHRUG. The reader is told what failed, so "nobody looked" is actionable
    // rather than mysterious.
    expect(typeof broken?.couldNotRun).toBe('string')
    expect(broken?.couldNotRun).not.toBe('')
  })

  it('still answers the rest of the bootstrap, so one broken check is not a broken read', async () => {
    breakTheQueueCheck()
    const res = await app.inject({ method: 'GET', url: '/api/project/bootstrap', headers: PERSON })
    expect(res.statusCode).toBe(200)
    const reply = res.json() as { open_problems: unknown[]; checks: unknown[] }
    expect(Array.isArray(reply.open_problems)).toBe(true)
    expect(reply.checks.length).toBe(2)
  })
})

describe('what a check reads is never widened to make the answer come out', () => {
  it('carries both sides of a check that ran, so a reader sees the distance and not only the verdict', async () => {
    await bootstrap()
    expect(addedRows()).toHaveLength(2)
    for (const row of addedRows()) {
      expect(row.leftN).toBeTypeOf('number')
      expect(row.rightN).toBeTypeOf('number')
    }
  })
})
