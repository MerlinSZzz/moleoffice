// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RE-MINT'S WRITE STEP GIVES EACH LEGACY AGENT ITS NEW ID, REWRITES THE NINE KEYED COLUMNS TO IT AND FILES THE OLD
 * ID AS AN ALIAS, IN ONE TRANSACTION, OR REFUSES AND WRITES NOTHING. Wave 13s round 157, item 30c part 3.
 *
 * src/server/lib/registry-aliases/remint-write.ts takes a map from planTheRemint. Here a throwaway office holds made-up
 * agents, legacy and minted, and a row naming a legacy one and a row naming the minted one in each of the nine columns
 * with a foreign key to agents.id. Cases:
 *   1. every legacy agent takes its new id; each of the nine columns names it by the new id, and no other column of
 *      those rows changes; each old id is an alias of the new one; the minted agent and its rows are as they were; no
 *      other table changes; the keys hold, and are checked at once again after the step;
 *   2. a legacy agent that is already an alias's target is refused by its id and handle, and nothing is written;
 *   3. a map that whatStopsTheMap stops is refused with its reasons, and nothing is written;
 *   4. a fault after agents.id has changed rolls everything back, and is thrown;
 *   5. a store whose keys to agents.id are already broken before the step is refused, each broken row named by its
 *      table and rowid as foreign_key_check reports it, and nothing is written.
 * The columns were seven until round 192 added agent_renames.agent_id, a new name proposed for an agent (item 42), and
 * eight until wave 13u round 186 added agent_starter_changes.agent_id, a change of who answers for an agent.
 *
 * Three-run proof, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/registry-alias-remint-write.test.ts
 * After a green control, copy src/server/lib/registry-aliases/remint-write.ts, then make one of these changes in it:
 *   1. delete the line `db.pragma('defer_foreign_keys = ON')`: the first change of agents.id breaks a key at once, and
 *      cases 1 and 4 go red;
 *   2. put `[]` in place of `moving.filter((entry) => isATarget.get(entry.oldId) !== undefined)`: the trigger refuses
 *      the change instead of the step, and case 2 goes red;
 *   3. put `theKeys.slice(1)` in place of `theKeys` in `for (const key of theKeys)`: one column keeps the old id, the
 *      check after the writes throws, and case 1 goes red;
 *   4. delete the line that calls fileRegistryAliases: no alias is filed, and case 1 goes red;
 *   5. put `db.exec('BEGIN IMMEDIATE'); const write = { immediate: (): RemintWrite => {` in place of
 *      `const write = db.transaction((): RemintWrite => {`, and `} }` in place of the `})` that closes it: the writes
 *      run in a transaction that nothing commits or rolls back, and cases 1 and 4 go red;
 *   6. put `[]` in place of `theBrokenKeys(db, tables)` in the line that sets `brokenBefore`: the step writes, the check
 *      after the writes finds the same rows and throws, and case 5 goes red.
 * Then copy drizzle/0319_an_agent_is_renamed_on_its_approvers_word.sql and make this change in it:
 *   7. delete the line that declares the foreign key from agent_id to agents.id: agent_renames.agent_id is no longer a
 *      column the step finds, so it rewrites eight columns and case 1 goes red.
 * Restore the file with cp after each, check it with cmp, and run the command again for green.
 * Every id, name and row here is made up, in a throwaway office.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
beforeEach(async () => { t = await freshDb(); madeUpRegistry(); aRowInEachKeyedColumnFor(LEGACY_LIVE); aRowInEachKeyedColumnFor(MINTED_LIVE.id) })
afterEach(() => t?.close())

const write = () => import('../src/server/lib/registry-aliases/remint-write.ts')
const map = () => import('../src/server/lib/registry-aliases/remint-map.ts')
const aliases = () => import('../src/server/lib/registry-aliases/index.ts')
const db = () => t.client.sqlite

// A made-up registry: two legacy agents, one of them retired, a renamed one, and a minted one.
const LEGACY_LIVE = 'legacy-lark'
const LEGACY_RETIRED = 'legacy-wren'
const RENAMED = { id: 'old-heron', handle: 'new-heron' }
const MINTED_LIVE = { id: 'MintedLive_1', handle: 'minted-live' }
const WHEN = '2026-10-30 10:00:00'

/** The nine columns with a foreign key to agents.id, each by its table, a dot and the column. */
const THE_NINE = [
  'agent_records.agent_id',
  'agent_renames.agent_id',
  'agent_starter_changes.agent_id',
  'handle_holds.agent_id',
  'resident_read_grants.reader_id',
  'resident_read_grants.resident_id',
  'resident_sleeps.agent_id',
  'resident_space_writes.resident_id',
  'resident_void_marks.resident_id',
]
const tableOf = (site: string) => site.split('.')[0]!
const columnOf = (site: string) => site.split('.')[1]!

function anAgent(id: string, handle: string, retired = false): void {
  db().prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, created_at, retired) VALUES (?, ?, ?, ?, ?, ?)').run(id, `Made-up ${handle}`, handle, 'made-up-asset', '2026-01-01 00:00:00', retired ? 1 : 0)
}
function madeUpRegistry(): void {
  db().prepare('INSERT INTO assets (id, kind, origin, mime, created_at) VALUES (?, ?, ?, ?, ?)').run('made-up-asset', 'avatar', 'default', 'image/svg+xml', '2026-01-01 00:00:00')
  anAgent(LEGACY_LIVE, LEGACY_LIVE)
  anAgent(LEGACY_RETIRED, LEGACY_RETIRED, true)
  anAgent(RENAMED.id, RENAMED.handle)
  anAgent(MINTED_LIVE.id, MINTED_LIVE.handle)
}

/** One row naming this agent in each of the nine columns. Every other agent such a row names is the minted one. */
function aRowInEachKeyedColumnFor(agent: string): void {
  const other = MINTED_LIVE.id
  const s = db()
  s.prepare('INSERT INTO agent_records (record_id, agent_id) VALUES (?, ?)').run(`made-up-record-of-${agent}`, agent)
  s.prepare('INSERT INTO agent_renames (id, agent_id, way, old_name, new_name, proposed_by_kind, proposed_by_id, proposed_because, proposed_at, approver_kind, approver_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(`made-up-rename-of-${agent}`, agent, 'proposed', 'Made-up old name', 'Made-up new name', 'agent', other, 'Made-up reason', WHEN, 'agent', other)
  s.prepare('INSERT INTO agent_starter_changes (id, agent_id, from_kind, from_id, to_kind, to_id, asked_by_kind, asked_by_id, because, asked_at, state, applied_at, runs_not_ended) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(`made-up-starter-change-of-${agent}`, agent, 'agent', other, 'person', 'made-up-person', 'person', 'made-up-person', 'Made-up reason', WHEN, 'applied', WHEN, '[]')
  s.prepare('INSERT INTO handle_holds (id, agent_id, session_record_id, machine, runtime, claimed_at, last_heard_at, released_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(`made-up-hold-of-${agent}`, agent, 'made-up-session', 'made-up-machine', 'claude-code', WHEN, WHEN, WHEN)
  s.prepare('INSERT INTO resident_sleeps (id, agent_id, what, began_at, by_kind, by_id) VALUES (?, ?, ?, ?, ?, ?)').run(`made-up-sleep-of-${agent}`, agent, 'slept', WHEN, 'agent', other)
  s.prepare('INSERT INTO resident_read_grants (id, resident_id, reader_id, until, given_at, given_by_kind, given_by_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`made-up-grant-to-${agent}`, other, agent, '2026-11-30', WHEN, 'agent', other)
  s.prepare('INSERT INTO resident_read_grants (id, resident_id, reader_id, until, given_at, given_by_kind, given_by_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`made-up-grant-of-${agent}`, agent, other, '2026-11-30', WHEN, 'agent', other)
  s.prepare('INSERT INTO resident_void_marks (id, resident_id, path, because, marked_at, marked_by_kind, marked_by_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`made-up-mark-of-${agent}`, agent, `made-up-path-of-${agent}`, 'Made-up reason', WHEN, 'agent', other)
  s.prepare('INSERT INTO resident_space_writes (id, resident_id, path, bytes, sha256, written_at, written_by_kind, written_by_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(`made-up-write-of-${agent}`, agent, 'made-up-path', 1, 'made-up-hash', WHEN, 'agent', other)
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
const NEW_IDS = ['NewIdOne_001', 'NewIdTwo_002', 'NewIdThree03', 'NewIdFour_04', 'NewIdFive_05', 'NewIdSix__06']

type Row = Record<string, unknown>
const sorted = (rows: Row[]): Row[] => rows.map((row) => [JSON.stringify(row), row] as const).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, row]) => row)
const theTables = (): string[] =>
  (db().prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name").all() as { name: string }[]).map((one) => one.name)
/** Every row of every table, each table's rows in one order, so two readings can be compared. */
function everyRow(): Record<string, Row[]> {
  return Object.fromEntries(theTables().map((table) => [table, sorted(db().prepare(`SELECT * FROM "${table}"`).all() as Row[])]))
}
const theAliases = () => db().prepare('SELECT namespace, alias_id AS aliasId, canonical_id AS canonicalId FROM registry_aliases ORDER BY alias_id').all()

async function aMap() {
  const { planTheRemint } = await map()
  const plan = planTheRemint(db(), theseIds(...NEW_IDS))
  if (!('map' in plan)) throw new Error(plan.refused.join(' '))
  return plan.map
}

describe('the re-mint write step', () => {
  it('gives each legacy agent its new id, rewrites the nine keyed columns to it, files the old id as an alias, and changes nothing else', async () => {
    const { writeTheRemint } = await write()
    const { AGENT_REGISTRY_NAMESPACE } = await aliases()
    const remint = await aMap()
    const legacy = remint.entries.filter((entry) => entry.from === 'legacy')
    const newIds = new Map(legacy.map((entry) => [entry.oldId, entry.newId]))
    const newIdOf = (value: unknown) => (typeof value === 'string' ? (newIds.get(value) ?? value) : value)
    // THE FIXTURE HAS WHAT THE CASE NEEDS: the made-up legacy agents are legacy, the minted one keeps its id, and each of
    // the nine columns names a legacy agent and the minted one.
    expect([...newIds.keys()]).toEqual(expect.arrayContaining([LEGACY_LIVE, LEGACY_RETIRED, RENAMED.id]))
    expect(remint.entries.find((entry) => entry.oldId === MINTED_LIVE.id)).toMatchObject({ from: 'minted', newId: MINTED_LIVE.id })
    const before = everyRow()
    const named = (rows: Row[], column: string, ids: (id: unknown) => boolean) => rows.filter((row) => ids(row[column])).length
    for (const site of THE_NINE) {
      expect(named(before[tableOf(site)]!, columnOf(site), (id) => id === LEGACY_LIVE), site).toBeGreaterThan(0)
      expect(named(before[tableOf(site)]!, columnOf(site), (id) => id === MINTED_LIVE.id), site).toBeGreaterThan(0)
    }

    const result = writeTheRemint(db(), remint)
    if (!('written' in result)) throw new Error(result.refused.join(' '))

    // THE COUNTS: one change of agents.id and one alias for each legacy agent, and in each of the nine columns the rows
    // that named one. The columns it rewrote are the nine, read from the schema.
    expect(result.written.agents).toBe(legacy.length)
    expect(result.written.aliases).toBe(legacy.length)
    expect(Object.keys(result.written.columns).sort()).toEqual(THE_NINE)
    for (const site of THE_NINE) expect(result.written.columns[site], site).toBe(named(before[tableOf(site)]!, columnOf(site), (id) => newIds.has(id as string)))

    const after = everyRow()
    // AGENTS, AND THE TABLES OF THE EIGHT COLUMNS: each row as it was, but with a legacy agent's new id in place of its
    // old one in agents.id and in each of the nine columns, and in no other column.
    const rewritten = new Map<string, string[]>([['agents', ['id']]])
    for (const site of THE_NINE) rewritten.set(tableOf(site), [...(rewritten.get(tableOf(site)) ?? []), columnOf(site)])
    for (const [table, columns] of rewritten) {
      expect(after[table], table).toEqual(sorted(before[table]!.map((row) => ({ ...row, ...Object.fromEntries(columns.map((column) => [column, newIdOf(row[column])])) }))))
    }
    // THE ALIASES: each old id, to its new id, in the agent registry, and none for the minted agent.
    expect(before['registry_aliases']).toEqual([])
    expect(theAliases()).toEqual(
      legacy.map((entry) => ({ namespace: AGENT_REGISTRY_NAMESPACE, aliasId: entry.oldId, canonicalId: entry.newId })).sort((a, b) => (a.aliasId < b.aliasId ? -1 : 1)),
    )
    // EVERY OTHER TABLE is as it was.
    for (const table of Object.keys(before)) if (!rewritten.has(table) && table !== 'registry_aliases') expect(after[table], table).toEqual(before[table])
    // THE KEYS HOLD, and they are checked at once again: defer_foreign_keys ended with the transaction.
    expect(db().prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect(db().pragma('foreign_keys', { simple: true })).toBe(1)
    expect(db().pragma('defer_foreign_keys', { simple: true })).toBe(0)
    expect(() => db().prepare('INSERT INTO agent_records (record_id, agent_id) VALUES (?, ?)').run('made-up-record-after', LEGACY_LIVE)).toThrow(
      expect.objectContaining({ code: 'SQLITE_CONSTRAINT_FOREIGNKEY' }),
    )
  })

  it('refuses a legacy agent that is already the target of an alias, by its id and handle, and writes nothing', async () => {
    const { writeTheRemint } = await write()
    const { fileRegistryAliases, AGENT_REGISTRY_NAMESPACE } = await aliases()
    fileRegistryAliases(db(), [{ namespace: AGENT_REGISTRY_NAMESPACE, aliasId: 'an-older-made-up-lark-id', canonicalId: LEGACY_LIVE }])
    const remint = await aMap()
    const before = everyRow()
    const result = writeTheRemint(db(), remint)
    expect(result).toEqual({ refused: [expect.stringContaining(`id "${LEGACY_LIVE}" and handle "${LEGACY_LIVE}"`)] })
    expect(JSON.stringify(result)).toContain('registry_aliases_reserve_update')
    expect(everyRow()).toEqual(before)
  })

  it('refuses a map that no longer fits the registry, with the reasons whatStopsTheMap gives, and writes nothing', async () => {
    const { writeTheRemint } = await write()
    const { whatStopsTheMap } = await map()
    const remint = await aMap()
    db().prepare('UPDATE agents SET name = ? WHERE id = ?').run('A made-up new name', LEGACY_LIVE)
    const stops = whatStopsTheMap(db(), remint)
    expect(stops).toEqual([expect.stringContaining(`"${LEGACY_LIVE}" has changed`)])
    const before = everyRow()
    expect(writeTheRemint(db(), remint)).toEqual({ refused: stops })
    expect(everyRow()).toEqual(before)
  })

  it('rolls everything back when a write fails after agents.id has changed, and throws', async () => {
    const { writeTheRemint } = await write()
    const remint = await aMap()
    // A MADE-UP FAULT in this throwaway office: the rewrite of one of the nine columns is refused.
    db().exec("CREATE TRIGGER a_made_up_fault BEFORE UPDATE OF agent_id ON resident_sleeps BEGIN SELECT RAISE(ABORT, 'a made-up fault'); END")
    const before = everyRow()
    expect(() => writeTheRemint(db(), remint)).toThrow(/a made-up fault/)
    expect(db().inTransaction).toBe(false)
    expect(everyRow()).toEqual(before)
  })

  it('refuses a store whose keys to agents.id are already broken, naming each broken row, and writes nothing', async () => {
    const { writeTheRemint } = await write()
    const remint = await aMap()
    // TWO MADE-UP BROKEN KEYS in this throwaway office: a row of agent_records and a row of handle_holds name an agent
    // that is not there. The keys are switched off only to plant them, and on again before the step.
    db().pragma('foreign_keys = OFF')
    db().prepare('INSERT INTO agent_records (record_id, agent_id) VALUES (?, ?)').run('made-up-record-of-nobody', 'made-up-nobody')
    db().prepare('INSERT INTO handle_holds (id, agent_id, session_record_id, machine, runtime, claimed_at, last_heard_at, released_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('made-up-hold-of-nobody', 'made-up-nobody', 'made-up-session', 'made-up-machine', 'claude-code', WHEN, WHEN, WHEN)
    db().pragma('foreign_keys = ON')
    // THE FIXTURE HAS WHAT THE CASE NEEDS: SQLite itself reports the two rows, and no other.
    const broken = db().prepare('PRAGMA foreign_key_check').all() as { table: string; rowid: number }[]
    expect(broken.map((row) => row.table).sort()).toEqual(['agent_records', 'handle_holds'])
    const before = everyRow()
    const result = writeTheRemint(db(), remint)
    if (!('refused' in result)) throw new Error('The step wrote on a store whose keys were already broken.')
    // One reason for each broken row, naming its table and its rowid.
    expect(result.refused).toHaveLength(broken.length)
    for (const row of broken) {
      expect(result.refused.filter((reason) => reason.includes(row.table) && new RegExp(`\\b${String(row.rowid)}\\b`).test(reason)), row.table).toHaveLength(1)
    }
    expect(everyRow()).toEqual(before)
  })
})
