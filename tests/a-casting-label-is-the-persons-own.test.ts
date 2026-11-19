// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CASTING LABEL NAMES A KIND OF WORK (migration 0349).
 *
 * Before: a row's work group was one of two words, hard or simple, fixed by a CHECK in migration 0318 and by a list in
 * src/shared/casting.ts. A third kind of work needed a change to the code. A probability of 0 also stood for "spent"
 * in the next round's check, so one number meant two things.
 *
 * Now each label is a row of its own, which the person and agents make, rename and remove through the Casting doors,
 * with what it means. A row carries any labels the table holds, and the roll for work of a label draws only the rows
 * that carry it. A row's own `out_until` says until when its program is out, set by hand, and the roll skips it until
 * then. A probability of 0 only means a row is not drawn.
 *
 * What this file proves:
 *
 *   1. The label words: letters are lower-cased, Chinese is kept as it is, spaces become hyphens, and 32 letters is
 *      the most. Anything else is refused with castingNotALabel, writing nothing.
 *   2. The label doors make, rename, describe and remove a label, each with a history row. A name the table holds is
 *      refused with castingLabelTaken, a label nobody made with castingNoSuchLabel, and the removal of a label a row
 *      carries with castingLabelInUse, naming the rows. Each refusal writes nothing.
 *   3. A row's labels cell takes names and stores ids, so a renamed label stays on its rows. A name the table does not
 *      hold is refused with castingNotALabelOfTheTable. The history names each label it shows, a removed one too.
 *   4. A row's Out until takes a time on the office's clock or an instant, and stores the instant. Other words are
 *      refused with castingNotAnOutUntil.
 *   5. A label made through the door and given to a row is drawn for work of that label, and only that row. A label no
 *      row carries is refused by the roll, naming the project, the label and the way out. A row still out is skipped
 *      and one whose time has passed is drawn. A row at 0 is only not drawn.
 *   6. Migration 0349 makes the labels hard and simple, with their meanings read from the data step's own list, and
 *      gives each row of a work group that label, with one history row each. A row in no group gets no label. A
 *      work group no row is in makes no label, so a store with no grouped row gets none. A second run changes nothing.
 *   7. The table's reading carries the fixed rules, each with its English word for the page, and every row carries
 *      what the office's limits say of its program.
 *   8. An image written before 0349 still shows its work group, and a stored one that is not hard, simple or empty is
 *      refused when it is read.
 *
 * Every value here is made up. Every case runs against a throwaway database, through the real routes where a door is
 * asked. No model is called and nothing is started.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { MIGRATIONS, journal, partialMigrations, scratch } from './migration-fixtures.ts'
import { migrateInPlace } from '../src/server/db/migrate.ts'
import {
  THE_FIRST_LABELS, THE_MIGRATION_ID as THE_LABEL_MIGRATION, THE_MIGRATION_TAG as THE_LABEL_MIGRATION_TAG,
} from '../src/server/db/casting-labels-migration.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { clockStamp, theClockZone, uniqueMomentOfStoredStampInZone } from '../src/shared/time.ts'
import {
  CASTING_CELLS, CASTING_LABEL_RULES, normaliseACastingLabel, normaliseCastingOutUntil, readCastingLabelIds, readCastingOutUntil,
  type CastingHistory, type CastingLabel, type CastingReading, type CastingRow, type CastingWritten,
} from '../src/shared/casting.ts'
import { noRowCarriesTheLabel, outsideTheWorkLabelled, outUntil } from '../src/shared/casting-roll.ts'

const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': 'default' }

let t: TestDb
let app: FastifyInstance
let rolls: typeof import('../src/server/lib/casting-roll.ts')
let castings: typeof import('../src/server/lib/casting.ts')

async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) {
  return app.inject({ method, url, headers: PERSON, ...(payload === undefined ? {} : { payload: payload as never }) })
}

async function aLabel(name: string, meaning?: string): Promise<CastingLabel> {
  const reply = await call('POST', '/api/casting/labels', { name, ...(meaning === undefined ? {} : { meaning: { value: meaning } }) })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { label: CastingLabel }).label
}

async function aRow(body: Record<string, unknown>): Promise<CastingRow> {
  const reply = await call('POST', '/api/casting/worker', body)
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as CastingWritten).casting
}

async function theReading(): Promise<CastingReading> {
  const reply = await call('GET', '/api/casting')
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as CastingReading
}

async function theRow(id: number): Promise<CastingRow> {
  const row = (await theReading()).roles.flatMap((card) => card.scopes).flatMap((scope) => scope.castings).find((one) => one.id === id)
  if (row === undefined) throw new Error(`no Casting row ${String(id)}`)
  return row
}

async function theLabelNamed(name: string): Promise<CastingLabel | undefined> {
  return (await theReading()).labels.find((one) => one.name === name)
}

/** Every Casting table, whole, to prove a refused write changed nothing. */
function stored(): string {
  return JSON.stringify(['casting_rows', 'casting_row_changes', 'casting_labels', 'casting_label_changes']
    .map((table) => t.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all()))
}

/** A refusal the door answers: its status, its code and values, and that nothing was written. */
async function refused(ask: () => Promise<Awaited<ReturnType<typeof call>>>, status: number, code: string, values: Record<string, unknown>): Promise<void> {
  const before = stored()
  const reply = await ask()
  expect(reply.statusCode, reply.body).toBe(status)
  expect(reply.json(), reply.body).toMatchObject({ code, values })
  expect(reply.json().error, reply.body).toBe(sayInEnglish(`server.${code}` as Parameters<typeof sayInEnglish>[0], values as never))
  expect(stored(), code).toBe(before)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  rolls = await import('../src/server/lib/casting-roll.ts')
  castings = await import('../src/server/lib/casting.ts')
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('1. the label words', () => {
  // Mutation L1: letters are not lower-cased. Red: "Big Job" is stored as "Big-Job".
  it('lower-cases letters, keeps Chinese as it is, and turns spaces into hyphens', () => {
    expect(normaliseACastingLabel('  Big   Job ')).toBe('big-job')
    expect(normaliseACastingLabel('困难 任务')).toBe('困难-任务')
    expect(normaliseACastingLabel('Größere Arbeit')).toBe('größere-arbeit')
    expect(normaliseACastingLabel('step-2')).toBe('step-2')
    expect(normaliseACastingLabel('长'.repeat(32))).toBe('长'.repeat(32))
  })

  // Mutation L3: the limit counts UTF-16 units. Red: 32 Chinese letters in four-byte forms are refused.
  // Mutation L4: the limit is taken out. Red: 33 letters are kept.
  it('refuses an empty name, a name over 32 letters, and any mark that is not a letter, a digit or a hyphen', () => {
    expect(normaliseACastingLabel('𠀀'.repeat(32))).toBe('𠀀'.repeat(32))
    for (const bad of ['', '   ', 'a'.repeat(33), 'a/b', 'a.b', 'a,b', 'every row!', '"hard"']) {
      expect(normaliseACastingLabel(bad), bad).toBeNull()
    }
  })
})

describe('2. the label doors', () => {
  // Mutation L5: the add door stores the name as given. Red: the stored name is "  Made Up Work ".
  it('makes a label with its normalised name, no meaning, no rows, and an add in its history', async () => {
    const before = (await theReading()).labels.length
    const label = await aLabel('  Made Up Work ')
    expect(label).toMatchObject({ name: 'made-up-work', meaning: { value: null, from: null }, rows: [], lastChange: { by: { kind: 'human', id: THE_PERSON }, authority: null } })
    expect((await theReading()).labels).toHaveLength(before + 1)
    const history = await call('GET', `/api/casting/labels/${String(label.id)}/history`)
    expect(history.statusCode, history.body).toBe(200)
    expect(history.json()).toMatchObject({ label: label.id, changes: [{ what: 'add', by: { kind: 'human', id: THE_PERSON }, before: null, after: { name: 'made-up-work', meaning: { value: null, from: null } } }] })
  })

  // Mutation L6: the rename door writes no history row. Red: the history has one change.
  it('renames a label and writes what it meant, each with a history row', async () => {
    const label = await aLabel('made-up-before')
    const renamed = await call('PATCH', `/api/casting/labels/${String(label.id)}`, { name: 'Made Up After' })
    expect(renamed.statusCode, renamed.body).toBe(200)
    expect(renamed.json().label).toMatchObject({ id: label.id, name: 'made-up-after' })
    const described = await call('PATCH', `/api/casting/labels/${String(label.id)}`, { meaning: { value: '  Made-up work that needs a long plan. ' } })
    expect(described.statusCode, described.body).toBe(200)
    const after = described.json().label as CastingLabel
    expect(after.meaning).toEqual({ value: 'Made-up work that needs a long plan.', from: { at: after.lastChange.at, by: { kind: 'human', id: THE_PERSON }, decision: null, moved: false, copied: false } })
    const history = (await call('GET', `/api/casting/labels/${String(label.id)}/history`)).json() as { changes: { what: string; before: unknown; after: unknown }[] }
    expect(history.changes.map((one) => one.what)).toEqual(['change', 'rename', 'add'])
    expect(history.changes[1]).toMatchObject({ before: { name: 'made-up-before' }, after: { name: 'made-up-after' } })
    expect(history.changes[0]).toMatchObject({ before: { meaning: { value: null } }, after: { meaning: after.meaning } })
    // AN EMPTY MEANING EMPTIES THE CELL, so the table says again that nobody has written it.
    const emptied = await call('PATCH', `/api/casting/labels/${String(label.id)}`, { meaning: { value: '' } })
    expect(emptied.json().label.meaning).toEqual({ value: null, from: null })
  })

  // Mutation L7: the add door does not look for the name first. Red: the unique index answers 500.
  it('refuses a name the table holds, in any letter case, and a word that is not a label', async () => {
    const label = await aLabel('made-up-taken')
    const other = await aLabel('made-up-other')
    await refused(() => call('POST', '/api/casting/labels', { name: 'Made Up TAKEN' }), 409, 'castingLabelTaken', { label: 'made-up-taken' })
    await refused(() => call('PATCH', `/api/casting/labels/${String(other.id)}`, { name: 'made-up-taken' }), 409, 'castingLabelTaken', { label: 'made-up-taken' })
    await refused(() => call('POST', '/api/casting/labels', { name: 'made/up' }), 400, 'castingNotALabel', { label: 'made/up' })
    await refused(() => call('PATCH', `/api/casting/labels/${String(label.id)}`, { name: 'x'.repeat(33) }), 400, 'castingNotALabel', { label: 'x'.repeat(33) })
  })

  // Mutation L8: the remove door does not look at the rows. Red: a row keeps the id of a label that is gone.
  it('removes a label no row carries, keeps its history, and refuses one a row carries, naming the rows', async () => {
    const label = await aLabel('made-up-on-two-rows')
    const first = await aRow({ model: { value: 'made-up-model-one' }, labels: { value: 'made-up-on-two-rows' } })
    const second = await aRow({ model: { value: 'made-up-model-two' }, labels: { value: 'made-up-on-two-rows' } })
    expect((await theLabelNamed('made-up-on-two-rows'))?.rows).toEqual([first.id, second.id])
    await refused(() => call('DELETE', `/api/casting/labels/${String(label.id)}`), 409, 'castingLabelInUse', { label: 'made-up-on-two-rows', rows: `${String(first.id)}, ${String(second.id)}` })
    for (const row of [first, second]) {
      const off = await call('PATCH', `/api/casting/rows/${String(row.id)}`, { labels: { value: '' } })
      expect(off.statusCode, off.body).toBe(200)
    }
    const gone = await call('DELETE', `/api/casting/labels/${String(label.id)}`)
    expect(gone.statusCode, gone.body).toBe(200)
    expect(await theLabelNamed('made-up-on-two-rows')).toBeUndefined()
    const history = (await call('GET', `/api/casting/labels/${String(label.id)}/history`)).json() as { changes: { what: string; after: unknown }[] }
    expect(history.changes.map((one) => one.what)).toEqual(['remove', 'add'])
    expect(history.changes[0]!.after).toBeNull()
    // THE ROWS' HISTORY STILL NAMES THE LABEL they carried, by its last name.
    const rowHistory = (await call('GET', `/api/casting/worker/history?casting=${String(first.id)}`)).json() as CastingHistory
    expect(rowHistory.labelNames[String(label.id)]).toBe('made-up-on-two-rows')
  })

  // Mutation L9: the label doors take any id. Red: a removed label is renamed with 200.
  it('answers a label nobody made, or one that is removed, with castingNoSuchLabel', async () => {
    const label = await aLabel('made-up-removed-at-once')
    expect((await call('DELETE', `/api/casting/labels/${String(label.id)}`)).statusCode).toBe(200)
    for (const id of ['999999', String(label.id)]) {
      await refused(() => call('PATCH', `/api/casting/labels/${id}`, { name: 'made-up-anything' }), 404, 'castingNoSuchLabel', { label: id })
      await refused(() => call('DELETE', `/api/casting/labels/${id}`), 404, 'castingNoSuchLabel', { label: id })
    }
  })
})

describe("3. a row's labels", () => {
  // Mutation L10: the labels cell stores the names. Red: the cell holds "made-up-first" and the rename leaves it.
  it('takes names, stores ids, and keeps them through a rename', async () => {
    const first = await aLabel('made-up-first')
    const second = await aLabel('长任务')
    const row = await aRow({ model: { value: 'made-up-model-with-labels' }, labels: { value: ' 长任务 , Made Up First,made-up-first ' } })
    expect(readCastingLabelIds(row.cells.labels.value, 'the test row')).toEqual([first.id, second.id].sort((a, b) => a - b))
    expect(row.cells.labels.from).toMatchObject({ by: { kind: 'human', id: THE_PERSON }, decision: null })
    expect((await call('PATCH', `/api/casting/labels/${String(first.id)}`, { name: 'made-up-renamed' })).statusCode).toBe(200)
    expect((await theRow(row.id)).cells.labels).toEqual(row.cells.labels)
    expect((await theLabelNamed('made-up-renamed'))?.rows).toEqual([row.id])
  })

  // Mutation L11: the row writer drops a name it does not know. Red: the row is added with one label.
  it('refuses a name the table does not hold, and writes nothing', async () => {
    await aLabel('made-up-known')
    await refused(() => call('POST', '/api/casting/worker', { model: { value: 'made-up-never-added' }, labels: { value: 'made-up-known, made-up-unknown' } }), 400, 'castingNotALabelOfTheTable', { label: 'made-up-unknown' })
    const row = await aRow({ model: { value: 'made-up-model-kept' } })
    await refused(() => call('PATCH', `/api/casting/rows/${String(row.id)}`, { labels: { value: 'made-up-unknown' } }), 400, 'castingNotALabelOfTheTable', { label: 'made-up-unknown' })
  })
})

describe("4. a row's Out until", () => {
  // Mutation L12: the writer stores the words as given. Red: the cell holds "2099-01-02 09:30".
  it('takes a time on the office clock or an instant, and stores the instant', async () => {
    const zone = theClockZone()
    const ms = uniqueMomentOfStoredStampInZone('2099-01-02 09:30:00', zone)!
    const instant = clockStamp(() => new Date(ms)).instant
    expect(normaliseCastingOutUntil('2099-01-02 09:30', zone)).toBe(instant)
    expect(normaliseCastingOutUntil(' 2099-01-02 09:30:00 ', zone)).toBe(instant)
    expect(normaliseCastingOutUntil(instant, zone)).toBe(instant)
    for (const bad of ['tomorrow', '2099-13-02 09:30', '2099-01-02', '9:30']) expect(normaliseCastingOutUntil(bad, zone), bad).toBeNull()
    const row = await aRow({ model: { value: 'made-up-model-out' }, out_until: { value: '2099-01-02 09:30' } })
    expect(row.cells.out_until.value).toBe(instant)
    expect(readCastingOutUntil(row.cells.out_until.value, 'the test row')).toBe(ms)
    await refused(() => call('PATCH', `/api/casting/rows/${String(row.id)}`, { out_until: { value: 'tomorrow' } }), 400, 'castingNotAnOutUntil', { value: 'tomorrow' })
    const cleared = await call('PATCH', `/api/casting/rows/${String(row.id)}`, { out_until: { value: '' } })
    expect(cleared.json().casting.cells.out_until).toEqual({ value: null, from: null })
  })
})

describe('5. the roll reads labels and Out until', () => {
  /** The worker card's default roll in the default project, with no earlier roll, for work of this label. */
  const ask = (difficulty: string | null) => rolls.theDefaultCasting({ role: 'worker', project: 'default', agentId: 'casting-label-test-agent', difficulty })
  const skipReasons = (answer: ReturnType<typeof ask>, rowId: number): string[] => answer.record.skipped.find((row) => row.rowId === rowId)?.reasons ?? []

  // Mutation L13: the roll reads a row's first label only. Red: the row whose new label is second is outside. A row
  // keeps its label ids in the order of the ids, so the drawn label is made second, to be second in the row as well.
  // Mutation L14: theDefaultCasting reads no labels. Red: no row carries the label.
  it('draws a row given a label made through the door for work of that label, and only that row', async () => {
    await aLabel('made-up-first-of-two')
    await aLabel('made-up-drawn-label')
    const carries = await aRow({ program: { value: 'claude-code' }, model: { value: 'made-up-model-carries' }, probability: { value: '1' }, labels: { value: 'made-up-first-of-two, made-up-drawn-label' } })
    const without = await aRow({ program: { value: 'claude-code' }, model: { value: 'made-up-model-without' }, probability: { value: '1' } })
    const answer = ask('made-up-drawn-label')
    expect(answer).toMatchObject({ rowId: carries.id, record: { choice: 'rolled', group: 'made-up-drawn-label' } })
    expect(answer.record.candidates.map((one) => one.rowId)).toEqual([carries.id])
    expect(skipReasons(answer, without.id)).toContain(outsideTheWorkLabelled('made-up-drawn-label'))
  })

  // Mutation L15: the roll takes the marked row when no row carries the label. Red: the choice is marked.
  it('refuses work of a label no row carries, naming the project, the label and the way out', async () => {
    await aLabel('made-up-nobody-carries')
    const answer = ask('made-up-nobody-carries')
    expect(answer).toMatchObject({ rowId: null, runtime: null, record: { choice: 'none', group: 'made-up-nobody-carries', selected: null } })
    expect(answer.says).toBe(noRowCarriesTheLabel('worker', 'default', 'made-up-nobody-carries'))
  })

  // Mutation L16: theDefaultCasting reads no Out until. Red: the row still out is drawn.
  // Mutation L17: a row is out whatever its time. Red: the row whose time has passed is skipped.
  it('skips a row still out, names its time, and draws one whose time has passed', async () => {
    await aLabel('made-up-out-label')
    const out = await aRow({ program: { value: 'claude-code' }, model: { value: 'made-up-model-still-out' }, probability: { value: '1' }, labels: { value: 'made-up-out-label' }, out_until: { value: '2099-01-02 09:30' } })
    const back = await aRow({ program: { value: 'claude-code' }, model: { value: 'made-up-model-back' }, probability: { value: '1' }, labels: { value: 'made-up-out-label' }, out_until: { value: '2020-01-02 09:30' } })
    const answer = ask('made-up-out-label')
    expect(answer).toMatchObject({ rowId: back.id, record: { choice: 'rolled' } })
    expect(skipReasons(answer, out.id)).toContain(outUntil(out.cells.out_until.value!))
    expect(answer.record.candidates.map((one) => one.rowId)).toEqual([back.id])
  })

  // Mutation L18: a row at 0 is skipped as spent. Red: the row at 0 is not among the candidates.
  it('keeps a row at 0 among the candidates with no share, and never calls it out', async () => {
    await aLabel('made-up-zero-label')
    const zero = await aRow({ program: { value: 'claude-code' }, model: { value: 'made-up-model-at-zero' }, probability: { value: '0' }, labels: { value: 'made-up-zero-label' } })
    const drawn = await aRow({ program: { value: 'claude-code' }, model: { value: 'made-up-model-drawn' }, probability: { value: '0.5' }, labels: { value: 'made-up-zero-label' } })
    const answer = ask('made-up-zero-label')
    expect(answer).toMatchObject({ rowId: drawn.id, record: { choice: 'rolled' } })
    expect(answer.record.candidates).toEqual([
      expect.objectContaining({ rowId: zero.id, probability: 0, share: 0 }),
      expect.objectContaining({ rowId: drawn.id, probability: 0.5, share: 1 }),
    ])
    expect(skipReasons(answer, zero.id)).toEqual([])
  })
})

describe('6. migration 0349', () => {
  const AT = '2026-10-30 10:00:00'
  const by = { kind: 'human', id: 'casting-label-migration-test' }
  const source = (extra: Record<string, unknown> = {}) => ({ at: AT, by, decision: null, moved: false, copied: false, ...extra })
  const WORDS = 'A made-up decision on a work group.'
  const GROUPS = [
    { model: 'made-up-model-hard-one', group: 'hard', from: source({ decisionWords: WORDS }) },
    { model: 'made-up-model-simple-one', group: 'simple', from: source() },
    { model: 'made-up-model-hard-two', group: 'hard', from: source() },
    { model: 'made-up-model-in-no-group', group: null, from: null },
  ] as const
  const NATIVE = { model: 'made-up-native-model', provider: 'openai', variant: null }

  // Mutation L19: the step gives every row the hard label. Red: the simple row's labels.
  // Mutation L20: the step writes no row history. Red: the history rows.
  // Mutation L21: the step writes the labels with no meaning. Red: the labels' meanings and their changes.
  it('makes hard and simple with their meanings, gives each grouped row its label, and writes one history row each', () => {
    const index = journal(MIGRATIONS).findIndex((entry) => entry.tag === THE_LABEL_MIGRATION_TAG)
    if (index <= 0) throw new Error(`drizzle/meta/_journal.json has no migration tagged ${THE_LABEL_MIGRATION_TAG}`)
    const s = scratch('0349-casting-labels')
    migrateInPlace(s.db, partialMigrations(index))
    const insert = s.db.prepare(
      'INSERT INTO casting_rows (role, project, marked, model, model_from, work_group, work_group_from, changed_at, changed_by_kind, changed_by_id, authority) ' +
        "VALUES ('worker', '', 0, ?, ?, ?, ?, ?, 'human', 'casting-label-migration-test', 'casting-label-migration-test-authority')",
    )
    const ids = GROUPS.map((row) => Number(insert.run(row.model, JSON.stringify(source()), row.group, row.from === null ? null : JSON.stringify(row.from), AT).lastInsertRowid))
    const empty = { value: null, from: null }
    const oldImage = {
      program: empty, model: { value: GROUPS[0].model, from: source() }, effort: empty, difficulty: empty, quota: empty, cost: empty,
      work_group: { value: 'hard', from: GROUPS[0].from }, probability: empty, why: empty, marked: false,
      native: NATIVE, selectionRevision: 'casting-label-migration-test-revision', hold: null,
    }
    s.db.prepare("INSERT INTO casting_row_changes (casting_id, role, project, what, at, by_kind, by_id, decisions, before, after) VALUES (?, 'worker', '', 'add', ?, 'human', 'casting-label-migration-test', '[]', NULL, ?)")
      .run(ids[0], AT, JSON.stringify(oldImage))
    const rowsBefore = s.db.prepare('SELECT * FROM casting_rows ORDER BY id').all() as Record<string, unknown>[]
    const changesBefore = s.db.prepare('SELECT * FROM casting_row_changes ORDER BY id').all()

    const outcome = migrateInPlace(s.db, partialMigrations(index + 1))
    expect(outcome.castingLabels).toEqual({ ran: true, labels: 2, hard: 2, simple: 1, rowsWritten: 2 * 2 + 2 * 3 })

    // THE TWO LABELS, with the meanings the data step's own list holds, said to come from the migration.
    const labels = s.db.prepare('SELECT * FROM casting_labels ORDER BY id').all() as Record<string, unknown>[]
    expect(labels.map((one) => one['name'])).toEqual(THE_FIRST_LABELS.map((one) => one.name))
    expect(THE_FIRST_LABELS.map((one) => one.name)).toEqual(['hard', 'simple'])
    const labelOf = new Map(labels.map((one) => [one['name'] as string, one['id'] as number]))
    for (const [n, label] of labels.entries()) {
      const first = THE_FIRST_LABELS[n]!
      expect(label['meaning']).toBe(first.meaning)
      const from = JSON.parse(label['meaning_from'] as string) as Record<string, unknown>
      expect(from).toEqual({ at: expect.any(String), by: { kind: 'migration', id: THE_LABEL_MIGRATION }, decision: null, decisionWords: first.words, moved: false, copied: false })
      expect([label['changed_at'], label['changed_by_kind'], label['changed_by_id'], label['authority']]).toEqual([from['at'], 'migration', THE_LABEL_MIGRATION, null])
    }
    const labelChanges = s.db.prepare('SELECT * FROM casting_label_changes ORDER BY id').all() as Record<string, unknown>[]
    expect(labelChanges.map((one) => [one['label_id'], one['what'], one['by_kind'], one['by_id'], one['before']])).toEqual(
      labels.map((one) => [one['id'], 'migrate', 'migration', THE_LABEL_MIGRATION, null]))
    expect(labelChanges.map((one) => JSON.parse(one['after'] as string) as unknown)).toEqual(
      labels.map((one) => ({ name: one['name'], meaning: { value: one['meaning'], from: JSON.parse(one['meaning_from'] as string) as unknown } })))

    // EACH GROUPED ROW CARRIES ITS LABEL, with the source of its work group carried over; nothing else of it changed.
    const rowsAfter = s.db.prepare('SELECT * FROM casting_rows ORDER BY id').all() as Record<string, unknown>[]
    const STAMPED = ['labels', 'labels_from', 'out_until', 'out_until_from', 'changed_at', 'changed_by_kind', 'changed_by_id', 'authority']
    const without = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).filter(([column]) => !STAMPED.includes(column)))
    expect(rowsAfter.map(without)).toEqual(rowsBefore.map(without))
    const history = s.db.prepare("SELECT * FROM casting_row_changes WHERE what = 'migrate' ORDER BY id").all() as Record<string, unknown>[]
    expect(history.map((one) => one['casting_id'])).toEqual(ids.slice(0, 3))
    expect(s.db.prepare('SELECT * FROM casting_row_changes ORDER BY id').all().slice(0, changesBefore.length)).toEqual(changesBefore)
    for (const [n, row] of GROUPS.entries()) {
      const after = rowsAfter[n]!
      expect(after['out_until'], row.model).toBeNull()
      if (row.group === null) {
        expect([after['labels'], after['labels_from'], after['changed_by_id']], row.model).toEqual([null, null, 'casting-label-migration-test'])
        continue
      }
      expect(after['labels'], row.model).toBe(JSON.stringify([labelOf.get(row.group)]))
      const from = JSON.parse(after['labels_from'] as string) as Record<string, unknown>
      expect(from, row.model).toEqual({ ...row.from, at: expect.any(String), by: { kind: 'migration', id: THE_LABEL_MIGRATION } })
      expect([after['changed_at'], after['changed_by_kind'], after['changed_by_id'], after['authority']], row.model).toEqual([from['at'], 'migration', THE_LABEL_MIGRATION, null])
      const change = history[n]!
      expect(change, row.model).toMatchObject({ by_kind: 'migration', by_id: THE_LABEL_MIGRATION, authority: null, decisions: '[]', at: from['at'] })
      const beforeImage = JSON.parse(change['before'] as string) as Record<string, unknown>
      const afterImage = JSON.parse(change['after'] as string) as Record<string, unknown>
      expect(beforeImage['work_group'], row.model).toEqual({ value: row.group, from: row.from })
      expect(afterImage['labels'], row.model).toEqual({ value: after['labels'], from })
      expect(afterImage['out_until'], row.model).toEqual(empty)
      expect(Object.keys(afterImage).filter((key) => (CASTING_CELLS as readonly string[]).includes(key)), row.model).toEqual([...CASTING_CELLS])
      const { work_group: _group, ...beforeRest } = beforeImage
      const { labels: _labels, out_until: _out, ...afterRest } = afterImage
      expect(afterRest, row.model).toEqual(beforeRest)
    }
    // THE NATIVE SELECTION IS CARRIED into the image that is now the row's newest.
    expect(JSON.parse(history[0]!['after'] as string)).toMatchObject({ native: NATIVE, selectionRevision: 'casting-label-migration-test-revision', hold: null })

    const everything = () => JSON.stringify(['casting_rows', 'casting_row_changes', 'casting_labels', 'casting_label_changes'].map((table) => s.db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()))
    const settled = everything()
    expect(migrateInPlace(s.db, partialMigrations(index + 1)).castingLabels).toEqual({ ran: false, labels: 0, hard: 0, simple: 0, rowsWritten: 0 })
    expect(everything()).toBe(settled)
  })

  // Mutation L24: the step makes both labels whatever the rows are. Red: the empty store, and the store whose only
  // grouped row is simple.
  it('makes a label only for a work group a row is in, and none on a store with no row', () => {
    const index = journal(MIGRATIONS).findIndex((entry) => entry.tag === THE_LABEL_MIGRATION_TAG)
    if (index <= 0) throw new Error(`drizzle/meta/_journal.json has no migration tagged ${THE_LABEL_MIGRATION_TAG}`)
    const none = scratch('0349-no-row')
    migrateInPlace(none.db, partialMigrations(index))
    expect(migrateInPlace(none.db, partialMigrations(index + 1)).castingLabels).toEqual({ ran: true, labels: 0, hard: 0, simple: 0, rowsWritten: 0 })
    expect(none.db.prepare('SELECT count(*) FROM casting_labels').pluck().get()).toBe(0)
    expect(none.db.prepare('SELECT count(*) FROM casting_label_changes').pluck().get()).toBe(0)
    const s = scratch('0349-one-group')
    migrateInPlace(s.db, partialMigrations(index))
    s.db.prepare(
      'INSERT INTO casting_rows (role, project, marked, model, model_from, work_group, work_group_from, changed_at, changed_by_kind, changed_by_id) ' +
        "VALUES ('worker', '', 0, 'made-up-model-simple-only', ?, 'simple', ?, ?, 'human', 'casting-label-migration-test')",
    ).run(JSON.stringify(source()), JSON.stringify(source()), AT)
    expect(migrateInPlace(s.db, partialMigrations(index + 1)).castingLabels).toEqual({ ran: true, labels: 1, hard: 0, simple: 1, rowsWritten: 2 * 1 + 2 * 1 })
    expect(s.db.prepare('SELECT name FROM casting_labels ORDER BY id').pluck().all()).toEqual(['simple'])
  })

  it('gives hard and simple their recorded meanings', () => {
    // The words are the data step's own; this case only pins which label each one is.
    const [hard, simple] = THE_FIRST_LABELS
    expect(hard.meaning).toMatch(/^Handling a lot of connected context or planning/)
    expect(simple.meaning).toMatch(/^Mechanical work/)
  })
})

describe("7. the table's reading", () => {
  // Mutation L22: the reading leaves a rule out. Red: the rules differ from the code's list.
  it('carries the fixed rules, each with an English word equal to it, and every row the office limits on its program', async () => {
    const reading = await theReading()
    expect(reading.rules).toEqual(CASTING_LABEL_RULES)
    expect(reading.rules.length).toBeGreaterThan(0)
    for (const rule of reading.rules) expect(sayInEnglish(`casting.rule.${rule.id}` as Parameters<typeof sayInEnglish>[0]), rule.id).toBe(rule.says)
    const rows = reading.roles.flatMap((card) => card.scopes).flatMap((scope) => scope.castings)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(row.officeOut, String(row.id)).toEqual([])
  })
})

describe('8. an image written before 0349', () => {
  // Mutation L23: readAnImage drops the old work group. Red: the image has no work group.
  it('shows its work group, and refuses one that is not hard, simple or empty', async () => {
    const row = await aRow({ model: { value: 'made-up-model-with-an-old-image' } })
    const sqlite = t.client.sqlite
    const newest = sqlite.prepare('SELECT id, "after" FROM casting_row_changes WHERE casting_id = ? ORDER BY id DESC LIMIT 1').get(row.id) as { id: number; after: string }
    const image = JSON.parse(newest.after) as Record<string, unknown>
    const { labels: _labels, out_until: _out, ...old } = image
    const from = { at: '2026-10-30 10:00:00', by: { kind: 'human', id: THE_PERSON }, decision: null, moved: false, copied: false }
    const plant = (group: string) => sqlite.prepare('UPDATE casting_row_changes SET "after" = ? WHERE id = ?').run(JSON.stringify({ ...old, work_group: { value: group, from } }), newest.id)
    try {
      plant('hard')
      const history = (await call('GET', `/api/casting/worker/history?casting=${String(row.id)}`)).json() as CastingHistory
      expect(history.changes[0]!.after?.workGroup).toEqual({ value: 'hard', from })
      expect(history.changes[0]!.after?.cells.labels).toEqual({ value: null, from: null })
      plant('medium')
      expect((await call('GET', `/api/casting/worker/history?casting=${String(row.id)}`)).statusCode).toBe(500)
      expect(() => castings.castingHistory('worker', row.id)).toThrow('work group "medium"')
    } finally {
      sqlite.prepare('UPDATE casting_row_changes SET "after" = ? WHERE id = ?').run(newest.after, newest.id)
    }
  })
})
