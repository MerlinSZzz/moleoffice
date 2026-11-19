// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ATTENTION RULE FINDS A PROJECT'S MESSAGES THROUGH THE INDEX OF EACH WAY INTO ITS VIEW, AND ITS READING DOES NOT
 * CHANGE.
 *
 * Round 65 of wave 13y. Every reading of GET /api/attention reads every record of the project and every message in
 * the project's view (`listRecordsForTheAttentionRule` in src/server/lib/records.ts). It found the messages through the
 * index of every record of a kind, so it read every message of the office to keep the few in the view. On a made-up
 * office at the scale of 22 October 2026, built by tools/build-a-made-up-office.ts, that read took a median of 109 ms.
 * The same rows read as the records of the project and, one way at a time, the messages that come into its view took
 * 29.5 ms there.
 *
 * WHAT IS HELD HERE:
 *   - The read gives the records the read before the change gave, in the same order, for a project, for a second
 *     project and for the message centre. The read before the change is written out here as it was. The office holds
 *     one made-up message for each way into a project's view and each way out of it, a withdrawn message, and a
 *     deleted record of the project, which the rule reads as well.
 *   - The read goes through an index of each way into the view: the project a message is written in, the project it is
 *     about, and what it is on. None of it goes through the index of every record of a kind.
 *   - The reading does not change. `attentionNow` is asked for the person, a secretary and an agent, with the clock at
 *     `THE_MEASURED_NOW`, and each reading's SHA-256 is compared with the one taken at the code before the change
 *     (tip ff75a5590).
 *
 * TWO VALUES IN THE OFFICE ARE MADE AT RANDOM by the migrations: the id of the Secretariat group and the id of this
 * machine's world. Each is replaced by a fixed word before the hash is taken, as
 * tests/where-you-stand-reads-an-agents-messages-by-index-and-once.test.ts does.
 *
 * The office is tests/the-office-with-every-way-into-a-view.ts.
 */
import { createHash } from 'node:crypto'
import { and, asc, desc, eq, getTableColumns, or } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { MESSAGE_CENTRE } from '../src/shared/workspaces.ts'
import { THE_MEASURED_NOW } from './the-office-of-the-slowest-reads.ts'
import { buildTheOfficeWithEveryWayIntoAView, ELSEWHERE } from './the-office-with-every-way-into-a-view.ts'

type Reader = 'person' | 'secretary' | 'agent'

/**
 * The hash of each reading at the code of tip ff75a5590, before the read was changed. The office is made in the same way
 * each time, so the hashes are a fact about the code. The person and a secretary each read every message, so their
 * readings are the same.
 */
const BEFORE: Record<Reader, string> = {
  person: '133740e8df45d930005c51d9e9144b699be3a75c7296f80c978a9ae1a6a2d4f6',
  secretary: '133740e8df45d930005c51d9e9144b699be3a75c7296f80c978a9ae1a6a2d4f6',
  agent: '0ccc3613d0bd6dc1653bca124a0566fe973b81ecd50934bf57632c5935602537',
}

let t: TestDb
let R: typeof import('../src/server/lib/records.ts')
const actorOf = {} as Record<Reader, { type: string; id: string }>
const random = new Map<string, string>()

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: THE_MEASURED_NOW })
  vi.stubEnv('MOLE_OFFICE_MESSAGE_EDIT_WINDOW_SECONDS', '120')
  t = await freshDb()
  R = await import('../src/server/lib/records.ts')
  // THE CARDS ON DISK, read as the server reads them at start, so the office can say who holds the secretary card.
  const { readTheRoleCards } = await import('../src/server/lib/roles.ts')
  readTheRoleCards({ guardActKeys: R.GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
  const db = t.client.sqlite
  const { office, secretary } = await buildTheOfficeWithEveryWayIntoAView(db)
  // A DELETED RECORD OF THE PROJECT: the rule reads deleted records too, and says what it makes of them.
  db.prepare(
    `insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
     values ('made-up-gone-task', 'default', 'owner', '2026-10-01 09:30:00', '2026-10-01 09:30:00', 'task', 'A made-up deleted task', null, ?, '2026-10-01 09:31:00', 'fixture')`,
  ).run(JSON.stringify({ state: 'todo' }))
  const handle = (db.prepare('select handle from agents where id = ?').get(office.theAgent) as { handle: string }).handle
  actorOf.person = { type: 'human', id: THE_PERSON }
  actorOf.secretary = { type: 'agent', id: secretary.handle }
  actorOf.agent = { type: 'agent', id: handle }
  for (const one of db.prepare(`select id from groups where opened_because <> 'made up for a measurement'`).all() as { id: string }[]) random.set(one.id, `group-made-by-a-migration-${String(random.size)}`)
  for (const one of db.prepare(`select home_world as world from people union select home_world from agents`).all() as { world: string | null }[]) {
    if (one.world !== null) random.set(one.world, `world-made-by-a-migration-${String(random.size)}`)
  }
}, 300_000)

afterAll(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  t.close()
})

/** The rule's records as the read gave them before the change, through drizzle's own mapping. */
async function theReadBeforeTheChange(workspaceId: string) {
  const { db } = await import('../src/server/db/client.ts')
  const { records } = await import('../src/server/db/schema.ts')
  const { messagesInTheViewOf } = await import('../src/server/lib/message-centre.ts')
  const { justThisProject } = await import('../src/shared/which-projects.ts')
  const kept = R.onlyTheseFieldsOf(R.THE_FIELDS_THE_ATTENTION_RULE_READS, ['blocks'])
  return db
    .select({ ...getTableColumns(records), data: kept })
    .from(records)
    .where(or(eq(records.workspaceId, workspaceId), and(eq(records.kind, 'message'), messagesInTheViewOf(justThisProject(workspaceId)))))
    .orderBy(desc(records.updatedAt), asc(records.id))
    .all()
    .map((row) => R.toRecord({ ...row, data: JSON.parse(row.data) as Record<string, unknown> } as typeof records.$inferSelect))
}

/** Every statement `listRecordsForTheAttentionRule` runs for a project, with what it was asked with. */
function theStatementsOfTheRead(workspaceId: string): { sql: string; params: unknown[] }[] {
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const prepare = sqlite.prepare
  const ran: { sql: string; params: unknown[] }[] = []
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = prepare.call(this, text)
    for (const method of ['all', 'get', 'iterate'] as const) {
      const run = statement[method] as (...args: unknown[]) => unknown
      statement[method] = function (this: unknown, ...args: unknown[]) {
        ran.push({ sql: text, params: args })
        return run.apply(this, args)
      }
    }
    return statement
  }
  try {
    R.listRecordsForTheAttentionRule(workspaceId)
  } finally {
    sqlite.prepare = prepare
  }
  return ran
}

/** The reading's hash, with the random values replaced. */
function hashOf(reading: unknown): string {
  let text = JSON.stringify(reading)
  for (const [value, word] of random) text = text.split(value).join(word)
  return createHash('sha256').update(text).digest('hex')
}

describe("the attention rule's read of a project", () => {
  for (const project of ['default', ELSEWHERE, MESSAGE_CENTRE]) {
    it(`gives the records it gave before the change, in the same order, for ${project}`, async () => {
      const before = await theReadBeforeTheChange(project)
      const now = R.listRecordsForTheAttentionRule(project)
      expect(now.map((one) => one.id)).toEqual(before.map((one) => one.id))
      expect(now).toEqual(before)
    })
  }

  it('holds each way into the view and leaves out each way out of it, and holds the deleted records', () => {
    const ids = new Set(R.listRecordsForTheAttentionRule('default').map((one) => one.id))
    // The ways into the view of default, the withdrawn message written there among them, and the ways out of it.
    expect([0, 1, 2, 3, 6, 8, 9, 10].map((i) => ids.has(`made-up-way-${String(i).padStart(2, '0')}`))).toEqual([true, true, true, true, true, true, true, true])
    expect([4, 5, 7].map((i) => ids.has(`made-up-way-${String(i).padStart(2, '0')}`))).toEqual([false, false, false])
    expect(ids.has('made-up-gone-task')).toBe(true)
  })

  it("finds the project's messages through the index of each way into its view, and not through the index of a kind", () => {
    const reads = theStatementsOfTheRead('default').filter((one) => /from\s+"?records"?/i.test(one.sql))
    expect(reads.length).toBeGreaterThan(0)
    const plan = reads
      .map((one) => {
        const params = one.params.length === 1 && Array.isArray(one.params[0]) ? (one.params[0] as unknown[]) : one.params
        return (t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${one.sql}`).all(...params) as { detail: string }[]).map((row) => row.detail).join('\n')
      })
      .join('\n')
    expect(plan, plan).toContain('records_message_written_in_project_idx')
    expect(plan, plan).toContain('records_message_about_project_idx')
    expect(plan, plan).toContain('records_message_target_idx')
    expect(plan, plan).not.toContain('records_kind_idx')
  })

  for (const reader of ['person', 'secretary', 'agent'] as const) {
    it(`gives the ${reader} the reading it gave before the change`, async () => {
      const { theMessageReader } = await import('../src/server/lib/messages.ts')
      const reading = R.attentionNow({ workspaceId: 'default', resources: [], now: THE_MEASURED_NOW.getTime(), reader: theMessageReader(actorOf[reader]) })
      expect(reading.read.records, 'the reading read the office').toBeGreaterThan(0)
      const hash = hashOf(reading)
      expect(hash, `the reading's whole hash is ${hash}`).toBe(BEFORE[reader])
    })
  }
})
