// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MIGRATION 0318 GAVE EACH CASTING ROW A WORK GROUP CELL, AND A STORED SOURCE IS READ STRICTLY.
 *
 * Before 0318: the roll found a row's group in a list in src/shared/casting-roll.ts, by the row's program and model. A
 * model the list did not name was in no group, whatever anybody wanted. Migration 0318 made the group the row's
 * `work_group` cell, hard, simple or empty, with where it came from, as every other cell is. Since migration 0349 a row
 * carries labels the person makes instead, and nothing reads `work_group` but the step that gives
 * each row its label. tests/a-casting-label-is-the-persons-own.test.ts proves the labels, the roll that reads them, and
 * an image written before 0349 that still shows its work group. The file keeps its name so its history stays with it.
 *
 * What this file still proves:
 *
 *   1. Migration 0318 sets the rows the old list put in a group, by program and model, and no other row. Each set row
 *      says it was set by the migration, with the words the old list carried for the decision, its last change names
 *      the migration with no authority, and it has one history row whose images differ only in the work group and keep
 *      the native selection. A second run, and a row added after it, change nothing.
 *   2. A source whose decision words are not text, or are empty, is refused when it is read, not shown. No writer can
 *      store one, so this file plants it in its own database.
 *
 * The models are made up where the name says so, and the rest are names the old list held. Every case runs against a
 * throwaway database, through the real routes where a door is asked. No model is called and nothing is started.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { MIGRATIONS, journal, partialMigrations, scratch } from './migration-fixtures.ts'
import { migrateInPlace } from '../src/server/db/migrate.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { readCastingCellSource, type CastingRow, type CastingWritten } from '../src/shared/casting.ts'

const TAG = '0318_a_casting_row_has_a_work_group'
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': 'default' }

let t: TestDb
let app: FastifyInstance
let castings: typeof import('../src/server/lib/casting.ts')

async function call(method: 'GET' | 'POST', url: string, payload?: unknown) {
  return app.inject({ method, url, headers: PERSON, ...(payload === undefined ? {} : { payload: payload as never }) })
}

async function added(body: unknown): Promise<CastingRow> {
  const reply = await call('POST', '/api/casting/worker', body)
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as CastingWritten).casting
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  castings = await import('../src/server/lib/casting.ts')
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('migration 0318', () => {
  /** The rows the old list put in a group, one for each of its names, with the words its entry carried. */
  const IN_A_GROUP = [
    { program: 'claude-code', model: 'claude-opus-5-5', project: '', group: 'hard', words: 'A decision of the owner: Opus for hard work.' },
    { program: 'codex', model: 'gpt-6.1-sol', project: '', group: 'hard', words: 'A decision of the owner: Sol for hard work.' },
    { program: 'codex', model: 'gpt-6-astra', project: '', group: 'hard', words: 'A decision of the owner: Astra joins hard work.' },
    { program: 'dsh', model: 'deepseek-v4.1-flash', project: '', group: 'simple', words: 'A decision of the owner: DeepSeek belongs to simple work.' },
    { program: 'opencode', model: 'opencode-go/deepseek-v4.1-flash', project: '', group: 'simple', words: 'A decision of the owner: DeepSeek belongs to simple work.' },
    { program: 'codex', model: 'gpt-6-luna', project: 'sample-project', group: 'simple', words: 'Two decisions of the owner: Luna for simple work, on Codex first.' },
    { program: 'codex', model: 'openai/gpt-6-luna', project: '', group: 'simple', words: 'Two decisions of the owner: Luna for simple work, on Codex first.' },
  ] as const
  /** Rows the old list put in no group: another model with a hard difficulty, no model, a Luna on OpenCode, another
   * Claude model, the Opus name in capitals, and a list name on the wrong program. */
  const IN_NO_GROUP = [
    { program: 'codex', model: 'gpt-6.1-terra', project: '', difficulty: 'hard' },
    { program: 'claude-code', model: null, project: '' },
    { program: 'opencode', model: 'opencode-go/gpt-6-luna', project: '' },
    { program: 'claude-code', model: 'claude-sonnet-5', project: '' },
    { program: 'claude-code', model: 'Claude-Opus-5-5', project: '' },
    { program: 'opencode', model: 'deepseek-v4.1-flash', project: '' },
  ] as const
  const AT = '2026-10-30 10:00:00'
  const SOURCE = JSON.stringify({ at: AT, by: { kind: 'human', id: 'work-group-migration-test' }, decision: null, moved: false, copied: false })
  const NATIVE = { model: 'gpt-6-luna', provider: 'openai', variant: null }

  // Mutation M2: the step sets the dsh entry's rows to hard. Red: the dsh row's group.
  // Mutation M2b: the step writes no history row. Red: the history rows.
  // Mutation M2c: the step's UPDATE sets only the work group cell. Red: a set row's last change still names the writer
  // that added it, with its authority.
  it('sets the rows the old list put in a group, says the migration did it, and writes one history row for each', () => {
    const index = journal(MIGRATIONS).findIndex((entry) => entry.tag === TAG)
    if (index <= 0) throw new Error(`drizzle/meta/_journal.json has no migration tagged ${TAG}`)
    const s = scratch('0318-casting-work-groups')
    migrateInPlace(s.db, partialMigrations(index))

    const insert = s.db.prepare(
      'INSERT INTO casting_rows (role, project, marked, program, program_from, model, model_from, difficulty, difficulty_from, changed_at, changed_by_kind, changed_by_id, authority) ' +
        "VALUES ('worker', ?, 0, ?, ?, ?, ?, ?, ?, ?, 'human', 'work-group-migration-test', 'work-group-migration-test-authority')",
    )
    const ids = new Map<string, number>()
    for (const row of [...IN_A_GROUP, ...IN_NO_GROUP]) {
      const difficulty = 'difficulty' in row ? row.difficulty : null
      const id = Number(insert.run(row.project, row.program, SOURCE, row.model, row.model === null ? null : SOURCE, difficulty, difficulty === null ? null : SOURCE, AT).lastInsertRowid)
      ids.set(`${row.program} ${String(row.model)}`, id)
    }
    // ONE ROW HAS A NATIVE SELECTION IN ITS NEWEST IMAGE, which is the only place a row's native selection is kept.
    const luna = ids.get('codex gpt-6-luna')!
    const empty = { value: null, from: null }
    const lunaImage = JSON.stringify({
      program: { value: 'codex', from: JSON.parse(SOURCE) as unknown }, model: { value: 'gpt-6-luna', from: JSON.parse(SOURCE) as unknown },
      effort: empty, difficulty: empty, quota: empty, cost: empty, probability: empty, why: empty, marked: false,
      native: NATIVE, selectionRevision: 'work-group-migration-test-revision', hold: null,
    })
    s.db.prepare(
      'INSERT INTO casting_row_changes (casting_id, role, project, what, at, by_kind, by_id, decisions, before, after) ' +
        "VALUES (?, 'worker', 'sample-project', 'add', ?, 'human', 'work-group-migration-test', '[]', NULL, ?)",
    ).run(luna, AT, lunaImage)
    const rowsBefore = s.db.prepare('SELECT * FROM casting_rows ORDER BY id').all() as Record<string, unknown>[]
    const changesBefore = s.db.prepare('SELECT * FROM casting_row_changes ORDER BY id').all()

    const outcome = migrateInPlace(s.db, partialMigrations(index + 1))
    expect(outcome.castingWorkGroups).toEqual({ ran: true, hard: 3, simple: 4, rowsWritten: 14 })

    const rowsAfter = s.db.prepare('SELECT * FROM casting_rows ORDER BY id').all() as Record<string, unknown>[]
    // EVERY OTHER COLUMN OF EVERY ROW IS AS IT WAS: a row the step set differs only in its work group and its last
    // change, and a row it did not set differs in nothing but the two columns 0318 added, which are read below.
    const theStepSet = new Set(IN_A_GROUP.map((row) => ids.get(`${row.program} ${row.model}`)))
    const ADDED = ['work_group', 'work_group_from']
    const STAMPED = [...ADDED, 'changed_at', 'changed_by_kind', 'changed_by_id', 'authority']
    const without = (row: Record<string, unknown>) => {
      const columns = theStepSet.has(row['id'] as number) ? STAMPED : ADDED
      return Object.fromEntries(Object.entries(row).filter(([column]) => !columns.includes(column)))
    }
    expect(rowsAfter.map(without)).toEqual(rowsBefore.map(without))
    const byId = new Map(rowsAfter.map((row) => [row['id'] as number, row]))
    const history = s.db.prepare("SELECT * FROM casting_row_changes WHERE what = 'migrate' ORDER BY id").all() as Record<string, unknown>[]
    expect(history.map((change) => change['casting_id'])).toEqual(IN_A_GROUP.map((row) => ids.get(`${row.program} ${row.model}`)))
    // NO OTHER HISTORY ROW WAS WRITTEN, and the one written before is as it was.
    expect((s.db.prepare('SELECT * FROM casting_row_changes ORDER BY id').all()).slice(0, changesBefore.length)).toEqual(changesBefore)
    expect(s.db.prepare('SELECT COUNT(*) AS n FROM casting_row_changes').get()).toEqual({ n: changesBefore.length + IN_A_GROUP.length })

    for (const [n, row] of IN_A_GROUP.entries()) {
      const where = `${row.program} ${row.model}`
      const stored = byId.get(ids.get(where)!)!
      expect(stored['work_group'], where).toBe(row.group)
      const from = JSON.parse(stored['work_group_from'] as string) as Record<string, unknown>
      expect(from, where).toEqual({ at: expect.any(String), by: { kind: 'migration', id: '0318' }, decision: null, decisionWords: row.words, moved: false, copied: false })
      // THE STRICT READER KEEPS THE WORDS, so the page can show them.
      expect(readCastingCellSource(from, where)?.decisionWords, where).toBe(row.words)
      // THE ROW'S LAST CHANGE IS THE MIGRATION'S, at the time of the value, with no authority.
      expect([stored['changed_at'], stored['changed_by_kind'], stored['changed_by_id'], stored['authority']], where).toEqual([from['at'], 'migration', '0318', null])

      const change = history[n]!
      expect(change, where).toMatchObject({ role: 'worker', project: row.project, by_kind: 'migration', by_id: '0318', authority: null, decisions: '[]', at: from['at'] })
      expect(change['note'], where).toContain(`set the work group to ${row.group}`)
      const before = JSON.parse(change['before'] as string) as Record<string, unknown>
      const after = JSON.parse(change['after'] as string) as Record<string, unknown>
      expect(before['work_group'], where).toEqual(empty)
      expect(after['work_group'], where).toEqual({ value: row.group, from })
      expect({ ...after, work_group: null }, where).toEqual({ ...before, work_group: null })
      expect(before['model'], where).toEqual({ value: row.model, from: JSON.parse(SOURCE) as unknown })
    }
    // THE NATIVE SELECTION IS CARRIED into the image that is now the row's newest.
    const lunaChange = history.find((change) => change['casting_id'] === luna)!
    expect(JSON.parse(lunaChange['after'] as string)).toMatchObject({ native: NATIVE, selectionRevision: 'work-group-migration-test-revision', hold: null })
    for (const row of IN_NO_GROUP) {
      const stored = byId.get(ids.get(`${row.program} ${String(row.model)}`)!)!
      expect([stored['work_group'], stored['work_group_from']], `${row.program} ${String(row.model)}`).toEqual([null, null])
    }

    // A SECOND RUN, AND A ROW ADDED AFTER 0318, CHANGE NOTHING: the later row is in no group until its cell is set.
    insert.run('', 'claude-code', SOURCE, 'claude-opus-5-5', SOURCE, null, null, AT)
    const everything = () => JSON.stringify([s.db.prepare('SELECT * FROM casting_rows ORDER BY id').all(), s.db.prepare('SELECT * FROM casting_row_changes ORDER BY id').all()])
    const settled = everything()
    const again = migrateInPlace(s.db, partialMigrations(index + 1))
    expect(again.castingWorkGroups).toEqual({ ran: false, hard: 0, simple: 0, rowsWritten: 0 })
    expect(everything()).toBe(settled)
  })
})

// THE DOOR ANSWERS AN ERROR THAT IS NOT A REFUSAL AS AN INTERNAL ERROR, 500 with no sentence, so the case below reads the
// door's 500 and then asks the reader the door calls, in this process, for the sentence it stopped with.
describe('a stored source no writer could have made', () => {
  /** A source as the door writes one, so that only the planted part is wrong. */
  const sourceWith = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({ at: '2026-10-30 10:00:00', by: { kind: 'human', id: THE_PERSON }, decision: null, moved: false, copied: false, ...extra })

  // Mutation M7: readCastingCellSource does not check the decision words. Red: the table answers 200 with them in it.
  it.each([['the number 3', 3], ['an empty text', '']] as const)('refuses to read the table when a source holds %s as its decision words', async (_name, words) => {
    const row = await added({ model: { value: 'made-up-model-with-planted-words' } })
    const sqlite = t.client.sqlite
    const kept = sqlite.prepare('SELECT model_from FROM casting_rows WHERE id = ?').pluck().get(row.id) as string
    sqlite.prepare('UPDATE casting_rows SET model_from = ? WHERE id = ?').run(sourceWith({ decisionWords: words }), row.id)
    try {
      const reply = await call('GET', '/api/casting')
      expect(reply.statusCode, reply.body).toBe(500)
      expect(() => castings.theCastingTable()).toThrow('holds decision words that are blank or not text')
    } finally {
      sqlite.prepare('UPDATE casting_rows SET model_from = ? WHERE id = ?').run(kept, row.id)
    }
  })
})
