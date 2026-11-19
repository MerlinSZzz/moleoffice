// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CASTING IN FORCE IS READ WITH ONE PREPARED STATEMENT, AND IT IS THE SAME ANSWER, AS FRESH AS THE TABLE.
 *
 * Round 40 of wave 13y divided GET /api/worker/queue into its parts on a made-up database of the live office's size and
 * shape (tools/build-a-made-up-office.ts). The second part it took on was `theModelARunGets`, which the queue asks once
 * for every agent it reads: 961 times in one ask, about 69 ms an ask, on that made-up database. A CPU profile of three
 * asks put the largest share of it in one place: `rowsOfRole` in src/server/lib/casting.ts prepared its statement again
 * on every call, 52.9 ms of the 193 ms under `theModelARunGets`, on that made-up database. It now prepares it once for
 * each database handle, the way `theRuntimeForAgentStatement` in src/server/lib/participants.ts already does.
 *
 * Two cases:
 *
 * 1. THE ANSWER. `theCastingInForce` gives the row the tools take, with its cells and their sources as stored, and it
 *    gives the new answer after the table is changed: a cell changed, and the mark moved to the other row. A statement
 *    prepared once still reads the table as it is when it runs. MUTATION: keep the rows a role read the first time, and
 *    this case is red.
 * 2. THE COST. Fifty reads of two roles prepare the statement that reads a role's castings at most once. This case was
 *    red on the code before round 40. MUTATION: prepare the statement inside `rowsOfRole` again, and this case is red.
 *
 * HOW THE PREPARING IS COUNTED: the database's `prepare` is replaced before the casting reader is loaded, so every
 * statement prepared while `counting` is set is written down by its text.
 *
 * The rows are written straight into `casting_rows`, so this file holds the reader and nothing the writers check.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

/** A role card of this file's own, so no row the office starts with is read with these. */
const ROLE = 'a-role-of-this-test'
const OTHER_ROLE = 'another-role-of-this-test'
const readsARolesCastings = (sql: string) => /\bFROM\s+casting_rows\s+WHERE\s+role\s*=\s*\?/i.test(sql)
const AT = '2026-10-18 19:00:00'
const SOURCE = JSON.stringify({ at: AT, by: { kind: 'human', id: THE_PERSON }, decision: null, moved: false })
const READ_SOURCE = { at: AT, by: { kind: 'human', id: THE_PERSON }, decision: null, moved: false, copied: false }

let t: TestDb
// THE SERVER'S OWN READER, loaded after the test database is open: loading it opens a database.
let casting: typeof import('../src/server/lib/casting.ts')
/** The text of every statement prepared while `counting` is set. */
let counting = false
const prepared: string[] = []
let sawTheRolesRead = false
/** The ids of the two rows of `ROLE`, the first carrying the mark. */
let first = 0
let second = 0

beforeAll(async () => {
  t = await freshDb()
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => unknown }
  const prepare = sqlite.prepare
  // THE COUNTER GOES IN BEFORE THE READER IS LOADED, so no statement it prepares is prepared without it.
  sqlite.prepare = function (this: unknown, text: string) {
    if(readsARolesCastings(text)) sawTheRolesRead = true
    if (counting) prepared.push(text)
    return prepare.call(this, text)
  }
  casting = await import('../src/server/lib/casting.ts')
  const add = t.client.sqlite.prepare(
    `insert into casting_rows (role, project, marked, program, program_from, model, model_from, changed_at, changed_by_kind, changed_by_id)
     values (?, '', ?, 'opencode', ?, ?, ?, ?, 'human', ?)`,
  )
  first = Number(add.run(ROLE, 1, SOURCE, 'opencode-go/the-first-model', SOURCE, AT, THE_PERSON).lastInsertRowid)
  second = Number(add.run(ROLE, 0, SOURCE, 'opencode-go/the-second-model', SOURCE, AT, THE_PERSON).lastInsertRowid)
  add.run(OTHER_ROLE, 1, SOURCE, 'opencode-go/the-other-roles-model', SOURCE, AT, THE_PERSON)
}, 120_000)

afterAll(() => {
  t.close()
})

/** The cells `theCastingInForce` gives for a row that names a program and a model, and nothing else. */
function cellsNaming(model: string): Record<string, { value: string | null; from: typeof READ_SOURCE | null }> {
  const empty = { value: null, from: null }
  return {
    program: { value: 'opencode', from: READ_SOURCE },
    model: { value: model, from: READ_SOURCE },
    effort: empty,
    difficulty: empty,
    quota: empty,
    cost: empty,
    labels: empty,
    probability: empty,
    out_until: empty,
    why: empty,
  }
}

it('gives the row the tools take as stored, and the new answer after the table changes', () => {
  expect(casting.theCastingInForce(ROLE, null)).toEqual({ id: first, scope: 'every project', cells: cellsNaming('opencode-go/the-first-model') })
  // A CELL CHANGED after the first read is read.
  t.client.sqlite.prepare(`update casting_rows set model = ? where id = ?`).run('opencode-go/the-first-model-changed', first)
  expect(casting.theCastingInForce(ROLE, null)).toEqual({ id: first, scope: 'every project', cells: cellsNaming('opencode-go/the-first-model-changed') })
  // THE MARK MOVED to the other row is read.
  t.client.sqlite.prepare(`update casting_rows set marked = 0 where id = ?`).run(first)
  t.client.sqlite.prepare(`update casting_rows set marked = 1 where id = ?`).run(second)
  expect(casting.theCastingInForce(ROLE, null)).toEqual({ id: second, scope: 'every project', cells: cellsNaming('opencode-go/the-second-model') })
  expect(casting.theCastingInForce(OTHER_ROLE, null)?.cells.model.value).toBe('opencode-go/the-other-roles-model')
}, 60_000)

it("prepares the statement that reads a role's castings at most once for fifty reads of two roles", () => {
  prepared.length = 0
  counting = true
  try {
    for (let i = 0; i < 25; i++) {
      casting.theCastingInForce(ROLE, null)
      casting.theCastingInForce(OTHER_ROLE, null)
    }
  } finally {
    counting = false
  }
  expect(sawTheRolesRead,'the counter must recognize the production role-row statement').toBe(true)
  expect(prepared.filter(readsARolesCastings).length).toBeLessThanOrEqual(1)
}, 60_000)
