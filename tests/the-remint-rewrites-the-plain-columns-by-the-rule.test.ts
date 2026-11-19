// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
/**
 * THE RE-MINT REWRITES AN OLD ID IN THE PLAIN COLUMNS WHERE ONE AGENT ANSWERS TO IT BY THAT ID, AND KEEPS EVERY OTHER VALUE
 * AS IT WAS TYPED. Wave 13s round 257, re-mint piece 3a.
 *
 * src/server/lib/registry-aliases/remint-write.ts gives each legacy agent its new id. In the same transaction it rewrites
 * the old id in the plain columns of the stores outside revisions and links, through
 * src/server/lib/registry-aliases/remint-plain.ts, and src/server/db/remint-migration.ts keeps the old-to-new agent ids in
 * the kept lists. Every site is read here from the register in identity-positions.ts; no site is copied. A throwaway office holds made-up agents, each legacy one made with its
 * handle as its id: a live one, one renamed since, a retired one whose handle a minted agent holds now, a live one whose
 * handle a retired minted agent held, and a minted one. Cases:
 *   1. at every registry-id site but the nine keyed ones, and in each form, an old id becomes the new id on a row that
 *      names an agent; and it is kept where the column beside it names a person, where the form says the value is not an
 *      agent's, and where nothing beside it tells;
 *   2. agent_messages.recipient_agent_id keeps an agent record's id and rewrites an old registry id;
 *   3. at every as-sent and mixed site and at changes.actor_id, a legacy agent's id is rewritten, and each of these is
 *      kept: a handle that is not its agent's id, a handle another agent holds now, a handle a retired agent held, a name
 *      of nobody, the office's own writer, a person's value, and a value nothing beside it tells;
 *   4. api_calls.target_id is rewritten on a route whose outer parameter is an agent, and kept on any other route;
 *   6. a staged re-mint keeps exactly one agent-id row for each legacy agent, in its generation;
 *   7. an old id left at a site after the write refuses the whole re-mint, by the site and the row, and nothing is kept;
 * reader_anchors.reader is one of the as-sent sites of case 3. The census names a reading place by its reader, so the
 * re-mint's stamp check finds a rewritten reading place under its new reader.
 *
 * Three-run proof, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/the-remint-rewrites-the-plain-columns-by-the-rule.test.ts
 * After a green control, copy src/server/lib/registry-aliases/remint-plain.ts, identity-positions.ts,
 * src/server/db/registry-aliases/remint-stamps.ts and src/server/db/remint-migration.ts, then make one of these changes:
 *   1. in remint-plain.ts, put `name.becomes` in place of `stored === name.agent ? name.becomes : null` in the rule: case 3's
 *      handle that is not its agent's id and case 4's handle go red;
 *   2. in remint-plain.ts, give a value that more than one agent answers to the new id of the legacy agent whose old id it
 *      is: case 3's two handles another agent holds or held, which the stamp check then refuses, and case 4's name two
 *      agents answer to go red;
 *   3. in remint-plain.ts, delete the line that keeps a row whose pair names no agent: case 1's kept rows and case 3's
 *      person and untold values go red;
 *   4. in remint-plain.ts, delete the check that the type before the colon is an agent's: case 3's person value goes red
 *      at the type:id sites;
 *   5. in remint-plain.ts, delete the line that keeps an agent record's id: case 2 goes red;
 *   6. in remint-plain.ts, read api_calls.target_id on every route: case 4 goes red;
 *   7. in identity-positions.ts, delete one route from the list of agent routes: case 5 goes red. Case 4 plants its rows
 *      on the routes of that same list, so it plants none on the deleted route and stays green;
 *   8. in remint-migration.ts, delete the call that keeps the agent-id list: case 6 goes red;
 *   9. in remint-plain.ts, delete the line that throws when an old id is left after the write: case 7 goes red;
 *  10. in remint-plain.ts, count one row too many at each site: case 8 goes red;
 *  11. in remint-plain.ts, leave reader_anchors.reader out of the plain sites: case 3's legacy agent by its id and renamed
 *      legacy agent by its old id, and case 8, go red;
 *  12. in remint-stamps.ts, give only an agents row its new name in the places each stamp must name: the stamp check
 *      refuses the rewritten reading place, so case 3's legacy agent by its id and renamed legacy agent by its old id,
 *      and case 8, go red.
 * Restore each file with cp after each, check it with cmp, and run the command again for green.
 * Every id, name, key and row here is made up, in a throwaway office.
 */
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'

let t: TestDb
const db = () => t.client.sqlite

async function theModules() {
  return {
    register: await import('../src/server/lib/registry-aliases/identity-positions.ts'),
    write: await import('../src/server/lib/registry-aliases/remint-write.ts'),
    map: await import('../src/server/lib/registry-aliases/remint-map.ts'),
    migration: await import('../src/server/db/remint-migration.ts'),
    messages: await import('../src/shared/messages.ts'),
    participants: await import('../src/shared/participants.ts'),
  }
}
let m: Awaited<ReturnType<typeof theModules>>
/** Imported in the cases that read it, so a case that does not is not stopped while it is missing. */
const plain = () => import('../src/server/lib/registry-aliases/remint-plain.ts')

// THE MADE-UP REGISTRY. Each legacy agent is made with its handle as its id.
const LARK = 'plain-lark'
const HERON = { id: 'old-heron', handle: 'new-heron' }
const FINCH = 'plain-finch'
const MINTED_FINCH = { id: 'MintedFinch1', handle: FINCH }
const ROBIN = 'plain-robin'
const MINTED_ROBIN = { id: 'MintedRobin1', handle: ROBIN }
const MINTED = { id: 'MintedLive_1', handle: 'minted-live' }
const NOBODY = 'nobody-at-all'
const THE_NOTE = 'made-up-note'
const WHEN = '2026-11-12 01:00:00'
const PROJECT = 'default'

function anAgent(id: string, handle: string, retired = false): void {
  db().prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, created_at, retired) VALUES (?, ?, ?, ?, ?, ?)').run(id, `Made-up ${handle}`, handle, 'made-up-asset', '2026-01-01 00:00:00', retired ? 1 : 0)
}
function madeUpRegistry(): void {
  db().prepare('INSERT INTO assets (id, kind, origin, mime, created_at) VALUES (?, ?, ?, ?, ?)').run('made-up-asset', 'avatar', 'default', 'image/svg+xml', '2026-01-01 00:00:00')
  anAgent(LARK, LARK)
  anAgent(HERON.id, HERON.id)
  db().prepare('UPDATE agents SET handle = ? WHERE id = ?').run(HERON.handle, HERON.id)
  anAgent(FINCH, FINCH, true)
  anAgent(MINTED_FINCH.id, MINTED_FINCH.handle)
  anAgent(ROBIN, ROBIN)
  anAgent(MINTED_ROBIN.id, MINTED_ROBIN.handle, true)
  anAgent(MINTED.id, MINTED.handle)
}
/** The record a planted row names where it must name one, made the first time a row needs it. */
function theNote(): string {
  if (db().prepare('SELECT 1 FROM records WHERE id = ?').get(THE_NOTE) === undefined) {
    db()
      .prepare("INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) VALUES (?, ?, ?, ?, ?, 'session', 'A made-up run', '{}', 'fixture')")
      .run(THE_NOTE, PROJECT, THE_TEST_OFFICES_OWNER.id, WHEN, WHEN)
  }
  return THE_NOTE
}

/** A generator that gives these ids in turn, and fails the test when it runs out. */
function theseIds(...ids: string[]): () => string {
  let next = 0
  return () => {
    const id = ids[next++]
    if (id === undefined) throw new Error('The made-up generator ran out of ids.')
    return id
  }
}
const NEW_IDS = ['NewIdOne_001', 'NewIdTwo_002', 'NewIdThree03', 'NewIdFour_04', 'NewIdFive_05', 'NewIdSix__06', 'NewIdSeven07', 'NewIdEight08', 'NewIdNine_09', 'NewIdTen__10']

function aMap() {
  const plan = m.map.planTheRemint(db(), theseIds(...NEW_IDS))
  if (!('map' in plan)) throw new Error(plan.refused.join(' '))
  const newIdOf = new Map(plan.map.entries.map((entry) => [entry.oldId, entry.newId]))
  return { remint: plan.map, newIdOf: (id: string) => newIdOf.get(id)! }
}

/** The re-mint, which must be written; what it wrote. */
function theRemint() {
  const { remint, newIdOf } = aMap()
  const result = m.write.writeTheRemint(db(), remint)
  if (!('written' in result)) throw new Error(result.refused.join(' '))
  return { written: result.written, remint, newIdOf }
}

type Row = Record<string, unknown>
const sorted = (rows: Row[]): Row[] => rows.map((row) => [JSON.stringify(row), row] as const).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, row]) => row)
const theTables = (): string[] =>
  (db().prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name").all() as { name: string }[]).map((one) => one.name)
/** Every row of every table, each table's rows in one order, so two readings can be compared. */
function everyRow(): Record<string, Row[]> {
  return Object.fromEntries(theTables().map((table) => [table, sorted(db().prepare(`SELECT * FROM "${table}"`).all() as Row[])]))
}

// ---------------------------------------------------------------------------------------------------------------------
// THE PLANTER. One row of any table, with the columns given and every other column it must have filled with a made-up
// value that its checks accept. A failure is collected, and the case fails once, naming every table it could not plant.
// ---------------------------------------------------------------------------------------------------------------------

type Value = string | number | null
const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`
const tableOf = (site: string) => site.slice(0, site.indexOf('.'))
const columnOf = (site: string) => site.slice(site.indexOf('.') + 1)

/** What a table's checks ask beyond a made-up value, for the tables whose checks tie one column to another. */
const WHAT_THE_CHECKS_ASK: Record<string, Record<string, Value>> = {
  agent_renames: {
    way: 'proposed', proposed_because: 'A made-up reason.', old_name: 'made-up-old-name', new_name: 'made-up-new-name',
    answer: 'approved', answered_by_kind: 'person', answered_by_id: 'made-up-answerer', answered_at: WHEN, answered_because: 'A made-up answer.',
  },
  agent_starter_changes: { state: 'withdrawn' },
  quick_input_asks: { outcome: 'typed' },
  what_the_grant_carries: { answer: 'kept' },
  provider_changes: { what: 'add', before: null, after: '{}' },
  providers: { programs: '["made-up"]' },
  // plantEach makes the note before any row.
  changes: { record_id: THE_NOTE, op: 'update', workspace_id: PROJECT },
}

let filled = 0
const madeUp = () => `made-up-${String(++filled)}`

interface AColumn { name: string; type: string; notnull: number; dflt_value: unknown; pk: number; hidden: number }
const columnsOf = (table: string) => (db().prepare('SELECT name, type, "notnull", dflt_value, pk, hidden FROM pragma_table_xinfo(?)').all(table) as AColumn[]).filter((one) => one.hidden === 0)
const theSqlOf = (table: string) => (db().prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?").pluck().get(table) as string | undefined) ?? ''

/** The first value a check of the form `column IN (...)` allows, a person's or a human's before any other. */
function theFirstAllowed(sql: string, column: string): Value | undefined {
  const found = new RegExp(`[\`"]?\\b${column}\\b[\`"]?\\s+IN\\s*\\(([^)]*)\\)`, 'i').exec(sql)
  if (found === null) return undefined
  const values = found[1]!.split(',').map((one) => one.trim()).map((one) => (one.startsWith("'") ? one.slice(1, -1) : Number(one)))
  return values.find((one) => one === 'person' || one === 'human') ?? values[0]
}

function aFill(table: string, column: AColumn, sql: string): Value {
  const allowed = theFirstAllowed(sql, column.name)
  if (allowed !== undefined) return allowed
  if (new RegExp(`json_valid\\(\\s*[\`"]?${column.name}[\`"]?\\s*\\)`, 'i').test(sql)) return '{}'
  const type = column.type.toUpperCase()
  if (type.includes('INT') || type.includes('REAL') || type.includes('NUM')) return ++filled
  const form = m.register.PLAIN_ID_COLUMNS.find((one) => one.site === `${table}.${column.name}`)?.form
  if (form === 'type:id') return `human:${madeUp()}`
  if (form === 'kind:id' || form === 'contact') return `person:${madeUp()}`
  if (form === 'side-of-pair') return m.messages.NEITHER_SIDE
  if (column.name === 'actor_type' || column.name.endsWith('_type')) return 'human'
  if (column.name.endsWith('_kind')) return 'person'
  if (column.name === 'day') return '2026-11-12'
  if (column.name === 'at' || column.name.endsWith('_at') || column.name === 'since' || column.name === 'until') return WHEN
  return madeUp()
}

/** The value a row's parent is named by, for the parents every case has. */
const THE_KNOWN_PARENTS: Record<string, () => Value> = { workspaces: () => PROJECT, agents: () => MINTED.id, assets: () => 'made-up-asset', records: theNote }

/** Plant one row of `table` and give its rowid. An only-row table's row, and the minted agent's row, are updated in place. */
function aRow(table: string, values: Record<string, Value>, depth = 0): number {
  if (depth > 4) throw new Error(`Planting ${table} went more than four parents deep.`)
  const columns = columnsOf(table)
  const sql = theSqlOf(table)
  const given: Record<string, Value> = { ...WHAT_THE_CHECKS_ASK[table], ...values }
  const names = Object.keys(given)
  if (table === 'agents' || columns.some((one) => one.name === 'only_row')) {
    const where = table === 'agents' ? { column: 'id', value: MINTED.id } : { column: 'only_row', value: 1 }
    const rowid = db().prepare(`SELECT rowid FROM ${quoted(table)} WHERE ${quoted(where.column)} = ?`).pluck().get(where.value) as number | undefined
    if (rowid !== undefined) {
      db().prepare(`UPDATE ${quoted(table)} SET ${names.map((name) => `${quoted(name)} = ?`).join(', ')} WHERE rowid = ?`).run(...names.map((name) => given[name]), rowid)
      return rowid
    }
    given[where.column] = where.value
  }
  const required = (column: AColumn) => (column.notnull === 1 || column.pk > 0) && column.dflt_value === null
  const theRowid = columns.filter((one) => one.pk > 0).length === 1 ? columns.find((one) => one.pk === 1 && one.type.toUpperCase() === 'INTEGER') : undefined
  const keys = db().prepare('SELECT id, "table" AS parent, "from" AS child, "to" AS target FROM pragma_foreign_key_list(?) ORDER BY id, seq').all(table) as { id: number; parent: string; child: string; target: string | null }[]
  for (const id of new Set(keys.map((key) => key.id))) {
    const key = keys.filter((one) => one.id === id)
    if (key.every((one) => one.child in given) || !key.some((one) => required(columns.find((column) => column.name === one.child)!))) continue
    const known = THE_KNOWN_PARENTS[key[0]!.parent]
    if (known !== undefined && key.length === 1) {
      given[key[0]!.child] ??= known()
      continue
    }
    const parent = key[0]!.parent
    const targets = key.map((one) => one.target ?? (db().prepare('SELECT name FROM pragma_table_info(?) WHERE pk > 0 ORDER BY pk').pluck().all(parent) as string[])[0]!)
    const row = db().prepare(`SELECT ${targets.map(quoted).join(', ')} FROM ${quoted(parent)} WHERE rowid = ?`).raw().get(aRow(parent, {}, depth + 1)) as Value[]
    key.forEach((one, at) => (given[one.child] ??= row[at]!))
  }
  for (const column of columns) {
    if (column.name in given || column === theRowid || !required(column)) continue
    given[column.name] = aFill(table, column, sql)
  }
  const all = Object.keys(given)
  return Number(db().prepare(`INSERT INTO ${quoted(table)} (${all.map(quoted).join(', ')}) VALUES (${all.map(() => '?').join(', ')})`).run(...all.map((name) => given[name])).lastInsertRowid)
}

/** A row planted at a site, the value it was planted with, and the value it must hold after the re-mint. */
interface APlanted { label: string; site: string; rowid: number; planted: Value; after: Value }

/** Plant each row, and fail once, naming every table that could not be planted and why. */
function plantEach(rows: readonly { label: string; site: string; values: Record<string, Value>; after: Value }[]): APlanted[] {
  const planted: APlanted[] = []
  const failed: string[] = []
  theNote()
  for (const row of rows) {
    try {
      planted.push({ label: row.label, site: row.site, rowid: aRow(tableOf(row.site), row.values), planted: row.values[columnOf(row.site)]!, after: row.after })
    } catch (error) {
      failed.push(`${row.label}: ${(error as Error).message}`)
    }
  }
  if (failed.length > 0) throw new Error(`The made-up rows could not all be planted. ${failed.join(' | ')}`)
  return planted
}

/** What each planted row holds now, and what it must, by its label, so one comparison shows every row that differs. */
function expectEachAsItMustBe(planted: readonly APlanted[]): void {
  const now = Object.fromEntries(planted.map((one) => [one.label, db().prepare(`SELECT ${quoted(columnOf(one.site))} FROM ${quoted(tableOf(one.site))} WHERE rowid = ?`).pluck().get(one.rowid)]))
  expect(now).toEqual(Object.fromEntries(planted.map((one) => [one.label, one.after])))
}

/** The value beside a site that names a person, by what the column beside it holds. */
const aPersonFor = (field: string) => (field === 'actor_type' || field.endsWith('_type') ? 'human' : 'person')

/** The columns beside a site that make a row name an agent, or a person, or nothing. */
function beside(site: { pair?: { field: string; agent: string } }, who: 'agent' | 'person' | 'untold'): Record<string, Value> {
  if (site.pair === undefined) return {}
  return { [site.pair.field]: who === 'agent' ? site.pair.agent : who === 'person' ? aPersonFor(site.pair.field) : null }
}

/** The plain sites a case reads: every site of the register that holds an id, as the brief's steps name them. */
async function theSites() {
  const { THE_TABLES_SEALS_PIN } = await plain()
  const found = m.write.theKeysToAnAgentsId(db())
  if (!('keys' in found)) throw new Error(found.refused.join(' '))
  const keyed = new Set(found.keys.map((key) => `${key.table}.${key.column}`))
  const sealed = new Set<string>(THE_TABLES_SEALS_PIN)
  const read = (site: string) => !keyed.has(site) && !sealed.has(tableOf(site))
  const registry = m.register.PLAIN_ID_COLUMNS.filter((one) => (one.holds === 'registry-id' || one.holds === 'record-or-registry-id') && read(one.site))
  const byTheRule = [
    ...m.register.PLAIN_ID_COLUMNS.filter((one) => (one.holds === 'as-sent' || one.holds === 'mixed') && read(one.site)),
    ...m.register.LEDGER_STAMPS.filter((one) => read(one.site)),
  ]
  return { registry, byTheRule, route: m.register.AN_AGENTS_ROUTE_TARGET }
}

describe('the re-mint rewrites an old id in the plain columns by the per-value rule', () => {
  beforeEach(async () => {
    t = await freshDb()
    m = await theModules()
    madeUpRegistry()
  }, A_HOOK_THAT_IMPORTS_THE_SERVER)
  afterEach(() => t?.close())

  describe('the registry-id sites and their forms', () => {
    let pairKey: (a: { kind: 'agent'; id: string }, b: { kind: 'agent'; id: string }) => string
    beforeEach(async () => {
      pairKey = (await import('../src/server/lib/messages.ts')).pairKey
    }, A_HOOK_THAT_IMPORTS_THE_SERVER)
    const agent = (id: string) => ({ kind: 'agent' as const, id })

    it('gives an old id at every registry-id site and in each form the new id, on each row that names an agent', () => {
      const found = m.write.theKeysToAnAgentsId(db())
      if (!('keys' in found)) throw new Error(found.refused.join(' '))
      const keyed = new Set(found.keys.map((key) => `${key.table}.${key.column}`))
      const sites = m.register.PLAIN_ID_COLUMNS.filter((one) => one.holds === 'registry-id' && !keyed.has(one.site))
      const { newIdOf } = aMap()
      const [lark, heron] = [newIdOf(LARK), newIdOf(HERON.id)]
      expect(sites.length).toBeGreaterThan(0)
      const rows: { label: string; site: string; values: Record<string, Value>; after: Value }[] = []
      for (const site of sites.filter((one) => one.form === undefined)) {
        const column = columnOf(site.site)
        rows.push({ label: `${site.site} ${LARK}`, site: site.site, values: { ...beside(site, 'agent'), [column]: LARK }, after: lark })
        const oneRow = tableOf(site.site) === 'agents' || columnsOf(tableOf(site.site)).some((one) => one.name === 'only_row')
        if (!oneRow) rows.push({ label: `${site.site} ${HERON.id}`, site: site.site, values: { ...beside(site, 'agent'), [column]: HERON.id }, after: heron })
      }
      // EACH FORM, written back as the product writes it.
      const form = (name: string) => sites.find((one) => one.form === name)!.site
      const theirPair = pairKey(agent(LARK), agent('made-up-other-side'))
      rows.push(
        { label: 'kind:id', site: form('kind:id'), values: { [columnOf(form('kind:id'))]: m.messages.participantKey(agent(LARK)) }, after: m.messages.participantKey(agent(lark)) },
        { label: 'contact', site: form('contact'), values: { [columnOf(form('contact'))]: m.messages.participantKey(agent(LARK)) }, after: m.messages.participantKey(agent(lark)) },
        { label: 'pair', site: form('pair'), values: { [columnOf(form('pair'))]: pairKey(agent(LARK), agent(HERON.id)) }, after: pairKey(agent(lark), agent(heron)) },
        {
          label: 'side-of-pair of two agents',
          site: form('side-of-pair'),
          values: { ...beside(sites.find((one) => one.form === 'side-of-pair')!, 'agent'), [columnOf(form('side-of-pair'))]: LARK, [columnOf(form('pair'))]: theirPair },
          after: lark,
        },
        {
          label: "side-of-pair of a group's",
          site: form('side-of-pair'),
          values: { ...beside(sites.find((one) => one.form === 'side-of-pair')!, 'agent'), [columnOf(form('side-of-pair'))]: LARK, [columnOf(form('pair'))]: 'made-up-group' },
          after: lark,
        },
      )
      const planted = plantEach(rows)
      theRemint()
      expectEachAsItMustBe(planted)
    })

    it('keeps an old id where the column beside it names a person, where the form says it is not an agent, and where nothing tells', () => {
      const found = m.write.theKeysToAnAgentsId(db())
      if (!('keys' in found)) throw new Error(found.refused.join(' '))
      const keyed = new Set(found.keys.map((key) => `${key.table}.${key.column}`))
      const sites = m.register.PLAIN_ID_COLUMNS.filter((one) => one.holds === 'registry-id' && !keyed.has(one.site))
      const form = (name: string) => sites.find((one) => one.form === name)!
      const side = form('side-of-pair')
      const sideColumn = columnOf(side.site)
      const pairColumn = columnOf(form('pair').site)
      const rows: { label: string; site: string; values: Record<string, Value>; after: Value }[] = []
      for (const site of sites.filter((one) => one.pair !== undefined && one.form === undefined)) {
        rows.push({ label: `${site.site} a person's`, site: site.site, values: { ...beside(site, 'person'), [columnOf(site.site)]: LARK }, after: LARK })
      }
      const kindAndId = form('kind:id').site
      const contact = form('contact').site
      const unregistered = m.messages.unregisteredKey({ typed: null, said: agent(LARK) })
      rows.push(
        { label: 'kind:id of a person', site: kindAndId, values: { [columnOf(kindAndId)]: m.messages.participantKey({ kind: 'person', id: LARK }) }, after: m.messages.participantKey({ kind: 'person', id: LARK }) },
        { label: 'contact of a writer no registry held', site: contact, values: { [columnOf(contact)]: unregistered }, after: unregistered },
        { label: "pair that is a group's id", site: form('pair').site, values: { [pairColumn]: LARK }, after: LARK },
        { label: 'side-of-pair with nothing beside it', site: side.site, values: { ...beside(side, 'untold'), [sideColumn]: LARK, [pairColumn]: 'made-up-group' }, after: LARK },
        { label: "side-of-pair of a person's", site: side.site, values: { ...beside(side, 'person'), [sideColumn]: LARK, [pairColumn]: 'made-up-group' }, after: LARK },
        {
          label: 'side-of-pair that is neither side of its pair',
          site: side.site,
          values: { ...beside(side, 'agent'), [sideColumn]: LARK, [pairColumn]: pairKey(agent('made-up-one'), agent('made-up-two')) },
          after: LARK,
        },
        { label: 'side-of-pair read as neither side', site: side.site, values: { ...beside(side, 'agent'), [sideColumn]: m.messages.NEITHER_SIDE, [pairColumn]: pairKey(agent(LARK), agent('made-up-two')) }, after: m.messages.NEITHER_SIDE },
      )
      const planted = plantEach(rows)
      theRemint()
      expectEachAsItMustBe(planted)
      // THE RE-MINT RAN: the legacy agent has its new id, so a value kept above was kept by the rule.
      expect(db().prepare('SELECT 1 FROM agents WHERE id = ?').get(LARK)).toBeUndefined()
    })
  })

  it("keeps an agent record's id in agent_messages.recipient_agent_id and gives an old registry id the new id", () => {
    const site = m.register.PLAIN_ID_COLUMNS.find((one) => one.holds === 'record-or-registry-id')!
    db()
      .prepare("INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) VALUES (?, ?, ?, ?, ?, 'agent', 'A made-up agent', '{}', 'fixture')")
      .run(LARK, PROJECT, THE_TEST_OFFICES_OWNER.id, WHEN, WHEN)
    const { newIdOf } = aMap()
    const planted = plantEach([
      { label: "an agent record's id", site: site.site, values: { [columnOf(site.site)]: LARK }, after: LARK },
      { label: 'an old registry id', site: site.site, values: { [columnOf(site.site)]: HERON.id }, after: newIdOf(HERON.id) },
    ])
    theRemint()
    expectEachAsItMustBe(planted)
  })

  // A value at a site the rule reads, what it is planted as, and whether the rule gives it the new id.
  const theValues: { said: string; value: () => string; who: 'agent' | 'person' | 'untold'; rewritten: boolean; only?: 'paired' | 'untold' }[] = [
    { said: 'a legacy agent by its id', value: () => LARK, who: 'agent', rewritten: true },
    { said: 'a renamed legacy agent by its old id', value: () => HERON.id, who: 'agent', rewritten: true },
    { said: 'a renamed legacy agent by its handle, which is not its id', value: () => HERON.handle, who: 'agent', rewritten: false },
    { said: 'a retired legacy agent whose handle another agent holds now', value: () => FINCH, who: 'agent', rewritten: false },
    { said: 'a legacy agent whose handle a retired agent held', value: () => ROBIN, who: 'agent', rewritten: false },
    { said: 'a name no agent has', value: () => NOBODY, who: 'agent', rewritten: false },
    { said: "the office's own writer", value: () => m.participants.THE_OFFICE_WRITER_ID, who: 'agent', rewritten: false },
    { said: "a person's value", value: () => LARK, who: 'person', rewritten: false, only: 'paired' },
    { said: 'a value nothing beside it tells', value: () => LARK, who: 'untold', rewritten: false, only: 'untold' },
  ]

  it.each(theValues)('at every as-sent and mixed site and changes.actor_id, $said is rewritten: $rewritten', async (one) => {
    const { byTheRule } = await theSites()
    const { newIdOf } = aMap()
    const sites = byTheRule.filter((site) =>
      one.only === 'paired' ? site.pair !== undefined || ('form' in site && site.form === 'type:id') : one.only === 'untold' ? 'pair' in site && site.pair !== undefined && 'untoldWithoutIt' in site.pair && site.pair.untoldWithoutIt === true : true,
    )
    expect(sites.length).toBeGreaterThan(0)
    const value = one.value()
    const planted = plantEach(
      sites.map((site) => {
        const typed = 'form' in site && site.form === 'type:id'
        const type = one.who === 'person' ? 'human' : 'agent'
        const id = (of: string) => (typed ? `${type}:${of}` : of)
        return {
          label: site.site,
          site: site.site,
          values: { ...(typed ? {} : beside(site, one.who)), [columnOf(site.site)]: id(value) },
          after: one.rewritten ? id(newIdOf(value)) : id(value),
        }
      }),
    )
    theRemint()
    expectEachAsItMustBe(planted)
  })

  it('rewrites an agent owner when the owner receives a new registry id', () => {
    setFixtureOwner(db(), LARK, MINTED.id, 'id')
    const { newIdOf } = theRemint()
    const row = db().prepare('SELECT owner_id FROM agents WHERE id = ?').get(MINTED.id) as { owner_id: string }
    expect(row.owner_id).toBe(newIdOf(LARK))
  })

  it('keeps a person owner even when that id also names an agent', () => {
    db().prepare("UPDATE agents SET owner_kind = 'person', owner_id = ? WHERE id = ?").run(LARK, MINTED.id)
    theRemint()
    const row = db().prepare('SELECT owner_kind, owner_id FROM agents WHERE id = ?').get(MINTED.id) as { owner_kind: string; owner_id: string }
    expect(row).toEqual({ owner_kind: 'person', owner_id: LARK })
  })

  it('keeps an absent owner absent', () => {
    db().prepare('UPDATE agents SET owner_kind = NULL, owner_id = NULL WHERE id = ?').run(MINTED.id)
    theRemint()
    expect(db().prepare('SELECT owner_kind, owner_id FROM agents WHERE id = ?').get(MINTED.id)).toEqual({ owner_kind: null, owner_id: null })
  })

  it('refuses incomplete owner pairs before changing an agent id', () => {
    const { remint } = aMap()
    db().exec("CREATE TRIGGER made_up_owner_write BEFORE UPDATE OF id ON agents BEGIN SELECT RAISE(ABORT, 'made-up write reached'); END")
    for (const [kind, id] of [['agent', null], [null, LARK], ['unknown', LARK], ['agent', '  ']] as const) {
      db().prepare('UPDATE agents SET owner_kind = ?, owner_id = ? WHERE id = ?').run(kind, id, MINTED.id)
      const before = everyRow()
      const result = m.write.writeTheRemint(db(), remint)
      expect('refused' in result).toBe(true)
      expect(everyRow()).toEqual(before)
    }
  })

  it('rewrites api_calls.target_id on a route whose outer parameter is an agent, and keeps it on any other route', () => {
    const { site, routes } = m.register.AN_AGENTS_ROUTE_TARGET
    expect(routes.length).toBeGreaterThan(0)
    const { newIdOf } = aMap()
    const [lark, heron] = [newIdOf(LARK), newIdOf(HERON.id)]
    const target = columnOf(site)
    const call = (label: string, route: string | null, value: string, after: string) => ({ label, site, values: { route, [target]: value }, after })
    const planted = plantEach([
      ...routes.flatMap((route) => [call(route, route, LARK, lark), call(`${route}/made-up`, `${route}/made-up`, LARK, lark)]),
      call('an old id that is not a handle', routes[0]!, HERON.id, heron),
      call('a handle that is not its agent id', routes[0]!, HERON.handle, HERON.handle),
      call('a name two agents answer to', routes[0]!, FINCH, FINCH),
      call('a name no agent has', routes[0]!, NOBODY, NOBODY),
      call('a record route', '/api/records/:id', LARK, LARK),
      call("an agent's run route", '/api/agent/runs/:id', LARK, LARK),
      call('no route', null, LARK, LARK),
    ])
    theRemint()
    expectEachAsItMustBe(planted)
  })

  it('keeps exactly one agent-id row for each legacy agent, in the generation of the staged map', () => {
    const staged = m.migration.stageTheRemint(db(), join(dirname(t.file), 'staged.json'), [], theseIds(...NEW_IDS))
    const legacy = staged.map.entries.filter((entry) => entry.from === 'legacy')
    expect(legacy.map((entry) => entry.oldId)).toEqual(expect.arrayContaining([LARK, HERON.id, FINCH, ROBIN]))
    db().transaction(() => m.migration.applyTheStagedRemint(db(), staged, [], []))()
    const kept = db().prepare(`SELECT generation, list, record_id, seq, old, new FROM ${m.migration.THE_KEPT_LISTS} ORDER BY old`).all()
    const want = [...legacy]
      .sort((a, b) => (a.oldId < b.oldId ? -1 : a.oldId > b.oldId ? 1 : 0))
      .map((entry) => ({ generation: staged.map.digest, list: 'agent_id', record_id: null, seq: null, old: entry.oldId, new: entry.newId }))
    expect(kept).toEqual(want)
  })

  it('refuses the whole re-mint when an old id is left at a site after the write, by the site and the row, and keeps nothing', () => {
    const site = m.register.PLAIN_ID_COLUMNS.find((one) => one.site === 'handovers.agent_id')!
    const [row] = plantEach([{ label: site.site, site: site.site, values: { agent_id: LARK }, after: LARK }])
    // A MADE-UP FAULT in this throwaway office: the site's row is put back as it was after the write.
    db().exec('CREATE TRIGGER a_made_up_fault AFTER UPDATE OF agent_id ON handovers BEGIN UPDATE handovers SET agent_id = OLD.agent_id WHERE rowid = NEW.rowid; END')
    const { remint } = aMap()
    const before = everyRow()
    let thrown: unknown
    try {
      m.write.writeTheRemint(db(), remint)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(Error)
    const said = (thrown as Error).message
    expect(said).toContain(site.site)
    expect(said).toContain(JSON.stringify(LARK))
    expect(said).toContain(`rowid ${String(row!.rowid)}`)
    expect(db().inTransaction).toBe(false)
    expect(everyRow()).toEqual(before)
  })

})

