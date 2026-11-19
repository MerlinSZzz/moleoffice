// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RE-MINT MOVES EACH KEY AN AGENT HOLDS TO THE AGENT'S NEW ID, CHANGING ONLY held_keys.whose_id, OR REFUSES AND
 * WRITES NOTHING. Wave 13s round 159, item 30c part 3.
 *
 * src/server/lib/registry-aliases/remint-write.ts takes a map from planTheRemint. Here a throwaway office holds made-up
 * agents, legacy and minted, and made-up key rows: a legacy agent's live key and its revoked one, a retired legacy
 * agent's key, a renamed agent's key under its id and another under its handle, a minted agent's key, a key held under a
 * name no agent has, and a person's and the office's key under names that a legacy agent also has. Cases:
 *   1. each key whose holder names one agent is held under that agent's new id, and no other column of any key row
 *      changes; the minted agent's key, the key no agent holds, the person's and the office's keys are as they were;
 *      the live key is found by the agent's new id, and a key kept under a handle is found with the others; no other
 *      table changes but agents and the aliases;
 *   2. a key holder that names two agents, one by its id and one by its handle, is refused by its name and the two
 *      agents, and nothing is written;
 *   3. a write that changes any other column of a key row rolls everything back, and the thrown words name the row and
 *      the column and no key's hash;
 *   4. the re-mint's line in the command's report counts the key rows it moved, and so does the rows it wrote;
 *   5. that line names each table of the history whose rows the pass rewrote, with its count, and leaves out a table
 *      with none; the rows it wrote count them;
 *   6. that line names each stored column outside the ledgers whose rows the re-mint rewrote, with its count, and leaves
 *      out a column with none; the rows it wrote count them.
 *
 * Three-run proof, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/the-remint-moves-each-agents-held-keys.test.ts
 * After a green control, copy src/server/lib/registry-aliases/remint-write.ts and src/server/db/remint-migration.ts,
 * then make one of these changes:
 *   1. in remint-write.ts, put `[]` in place of `held.moves` in `for (const move of held.moves)`: no key moves, and cases
 *      1 and 3 go red;
 *   2. in remint-write.ts, delete ` WHERE whose_kind = 'agent'` from the read of the key holders: the person's key moves
 *      with the agent's, and case 1 goes red;
 *   3. in remint-write.ts, put `false` in place of `name.names === 'more than one agent'`: the holder that names two
 *      agents is not refused, and case 2 goes red;
 *   4. in remint-write.ts, put `[]` in place of `whatElseChangedInTheHeldKeys(heldBefore, everyHeldKey(db), held.moves)`:
 *      the other column's change is kept, and case 3 goes red;
 *   5. in remint-write.ts, put `name.names === 'one agent' && name.by.includes('id')` in place of
 *      `name.names === 'one agent'`: the key kept under a handle stays there, and case 1 goes red;
 *   6. in remint-migration.ts, delete ` + report.heldKeys` from rowsTheRemintWrote: case 4 goes red;
 *   7. in remint-migration.ts, delete the line that says how many held_keys rows moved: case 4 goes red;
 *   8. in remint-migration.ts, delete the history's rows from rowsTheRemintWrote: case 5 goes red;
 *   9. in remint-migration.ts, name every table of the history in the line, a table with no row too: case 5 goes red;
 *  10. in remint-migration.ts, delete the part of the line that names the history's tables: case 5 goes red;
 *  11. in remint-migration.ts, delete the stored values' rows from rowsTheRemintWrote: case 6 goes red;
 *  12. in remint-migration.ts, delete the part of the line that names the stored columns: case 6 goes red.
 * Restore each file with cp after each, check it with cmp, and run the command again for green.
 * Every id, name, key hash and row here is made up, in a throwaway office.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
beforeEach(async () => { t = await freshDb(); madeUpRegistry(); madeUpKeys() })
afterEach(() => t?.close())

const write = () => import('../src/server/lib/registry-aliases/remint-write.ts')
const map = () => import('../src/server/lib/registry-aliases/remint-map.ts')
const keys = () => import('../src/server/lib/keys.ts')
const migration = () => import('../src/server/db/remint-migration.ts')
const db = () => t.client.sqlite

// A made-up registry: two legacy agents, one of them retired, a renamed one, and a minted one.
const LEGACY_LIVE = 'legacy-lark'
const LEGACY_RETIRED = 'legacy-wren'
const RENAMED = { id: 'old-heron', handle: 'new-heron' }
const MINTED_LIVE = { id: 'MintedLive_1', handle: 'minted-live' }
const NO_AGENT = 'made-up-visitor'
const WHEN = '2026-10-30 10:00:00'

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

/** The made-up key rows, by row id: whose kind, whose id, and whether it was revoked. */
const KEYS: { id: string; whoseKind: string; whoseId: string; revoked?: true }[] = [
  { id: 'key-of-lark', whoseKind: 'agent', whoseId: LEGACY_LIVE },
  { id: 'revoked-of-lark', whoseKind: 'agent', whoseId: LEGACY_LIVE, revoked: true },
  { id: 'key-of-wren', whoseKind: 'agent', whoseId: LEGACY_RETIRED },
  { id: 'key-of-heron-by-id', whoseKind: 'agent', whoseId: RENAMED.id },
  { id: 'key-of-heron-by-handle', whoseKind: 'agent', whoseId: RENAMED.handle },
  { id: 'key-of-minted', whoseKind: 'agent', whoseId: MINTED_LIVE.id },
  { id: 'key-of-no-agent', whoseKind: 'agent', whoseId: NO_AGENT },
  { id: 'key-of-a-person', whoseKind: 'person', whoseId: LEGACY_LIVE },
  { id: 'key-of-the-office', whoseKind: 'office', whoseId: LEGACY_LIVE },
]
const hashOf = (id: string) => `made-up-hash-of-${id}`
function madeUpKeys(): void {
  const insert = db().prepare(
    'INSERT INTO held_keys (id, whose_kind, whose_id, key_hash, made_at, last_used_at, revoked_at, revoked_because, mint_proved_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
  for (const key of KEYS) {
    insert.run(key.id, key.whoseKind, key.whoseId, hashOf(key.id), WHEN, WHEN, key.revoked ? WHEN : null, key.revoked ? 'A made-up reason' : null, null)
  }
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
/** Every key row with its rowid, in rowid order. */
const theKeyRows = (): Row[] => db().prepare('SELECT rowid AS "rowid", * FROM held_keys ORDER BY rowid').all() as Row[]

async function aMap() {
  const { planTheRemint } = await map()
  const plan = planTheRemint(db(), theseIds(...NEW_IDS))
  if (!('map' in plan)) throw new Error(plan.refused.join(' '))
  return plan.map
}

describe("the re-mint moves the keys an agent holds", () => {
  it("holds each key whose holder names one agent under that agent's new id, and changes nothing else of any key", async () => {
    const { writeTheRemint } = await write()
    const { theLiveKeyOfTheAgentWithThisId, everyLiveKeyHeldBy } = await keys()
    const remint = await aMap()
    const newIdOf = new Map(remint.entries.map((entry) => [entry.oldId, entry.newId]))
    const lark = newIdOf.get(LEGACY_LIVE)!
    const heron = newIdOf.get(RENAMED.id)!
    // THE FIXTURE HAS WHAT THE CASE NEEDS: the three made-up legacy agents get new ids, and the minted one keeps its own.
    for (const legacy of [LEGACY_LIVE, LEGACY_RETIRED, RENAMED.id]) expect(newIdOf.get(legacy), legacy).not.toBe(legacy)
    expect(newIdOf.get(MINTED_LIVE.id)).toBe(MINTED_LIVE.id)
    // Before: the renamed agent's key kept under its handle is not one of the keys read for it, which are kept under its id.
    expect(everyLiveKeyHeldBy('agent', RENAMED.handle).map((one) => one.id)).toEqual(['key-of-heron-by-id'])
    const before = everyRow()
    const keysBefore = theKeyRows()

    const result = writeTheRemint(db(), remint)
    if (!('written' in result)) throw new Error(result.refused.join(' '))

    // THE KEYS: each row as it was, with the new id in whose_id where its holder names a legacy agent by its id or its
    // handle, and the renamed agent's two keys under its one new id. Nothing else moved, and no row was added or lost.
    const moved: Record<string, string> = {
      'key-of-lark': lark,
      'revoked-of-lark': lark,
      'key-of-wren': newIdOf.get(LEGACY_RETIRED)!,
      'key-of-heron-by-id': heron,
      'key-of-heron-by-handle': heron,
    }
    expect(theKeyRows()).toEqual(keysBefore.map((row) => ({ ...row, whose_id: moved[row['id'] as string] ?? row['whose_id'] })))
    expect(result.written.heldKeys).toBe(Object.keys(moved).length)
    // THE KEYS ARE FOUND BY THE AGENT'S NEW ID: the live one, and not the revoked one; and by the renamed agent's handle,
    // both of its keys.
    expect(theLiveKeyOfTheAgentWithThisId(lark)?.id).toBe('key-of-lark')
    expect(everyLiveKeyHeldBy('agent', RENAMED.handle).map((one) => one.id).sort()).toEqual(['key-of-heron-by-handle', 'key-of-heron-by-id'])
    // EVERY OTHER TABLE is as it was, but agents and the aliases, which the write step's own test reads.
    const after = everyRow()
    for (const table of Object.keys(before)) if (!['agents', 'registry_aliases', 'held_keys'].includes(table)) expect(after[table], table).toEqual(before[table])
  })

  it('refuses a key holder that names two agents, by its name and the two agents, and writes nothing', async () => {
    const { writeTheRemint } = await write()
    // A minted agent takes the retired legacy agent's handle, so the name its key is held under is one agent's id and
    // the other's handle.
    const theOther = 'MintedWren_2'
    anAgent(theOther, LEGACY_RETIRED)
    const remint = await aMap()
    const before = everyRow()
    const result = writeTheRemint(db(), remint)
    expect(result).toEqual({ refused: [expect.stringContaining(`"${LEGACY_RETIRED}"`)] })
    expect(JSON.stringify(result)).toContain(theOther)
    expect(everyRow()).toEqual(before)
  })

  it('rolls everything back when a write changes another column of a key row, and names the row and not its hash', async () => {
    const { writeTheRemint } = await write()
    const remint = await aMap()
    // A MADE-UP FAULT in this throwaway office: moving a key's holder also changes when it was last used.
    db().exec("CREATE TRIGGER a_made_up_fault AFTER UPDATE OF whose_id ON held_keys BEGIN UPDATE held_keys SET last_used_at = '2026-10-30 23:59:59' WHERE id = NEW.id; END")
    const before = everyRow()
    let thrown: unknown
    try {
      writeTheRemint(db(), remint)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(Error)
    const said = (thrown as Error).message
    expect(said).toContain('"key-of-lark"')
    expect(said).toContain('last_used_at')
    expect(said).not.toContain('made-up-hash')
    expect(db().inTransaction).toBe(false)
    expect(everyRow()).toEqual(before)
  })

  it("counts the key rows it moved in the command's report", async () => {
    const { rowsTheRemintWrote, whatTheRemintDid } = await migration()
    const report = { digest: 'a-made-up-digest', alreadyDone: false, agents: 2, columns: { 'agent_records.agent_id': 1 }, heldKeys: 3, plain: {}, aliases: 2, faces: 0, generations: 1, keptLists: 0, history: {}, stored: {} }
    expect(rowsTheRemintWrote(report)).toBe(9)
    expect(whatTheRemintDid(report)).toContain('moved 3 held_keys row(s) to them')
  })

  it("counts the rows of the history the pass rewrote, by table, in the command's report", async () => {
    const { rowsTheRemintWrote, whatTheRemintDid } = await migration()
    const report = { digest: 'a-made-up-digest', alreadyDone: false, agents: 2, columns: {}, heldKeys: 0, plain: {}, aliases: 2, faces: 0, generations: 1, keptLists: 5, history: {}, stored: {} }
    const history = { revisions: 3, records: 2, links: 1, changes: 0 }
    expect(rowsTheRemintWrote({ ...report, history })).toBe(rowsTheRemintWrote(report) + 6)
    const said = whatTheRemintDid({ ...report, history })
    for (const [table, rows] of Object.entries(history)) if (rows > 0) expect(said).toContain(`${table} ${String(rows)}`)
    expect(said).not.toContain('changes 0')
  })

  it("counts the stored values outside the ledgers it rewrote, by column, in the command's report", async () => {
    const { rowsTheRemintWrote, whatTheRemintDid } = await migration()
    const report = { digest: 'a-made-up-digest', alreadyDone: false, agents: 2, columns: {}, heldKeys: 0, plain: {}, aliases: 2, faces: 0, generations: 1, keptLists: 0, history: {}, stored: {} }
    const stored = { 'agent_runs.request': 4, 'office_map_layouts.data': 1, 'agents.elevation': 0 }
    expect(rowsTheRemintWrote({ ...report, stored })).toBe(rowsTheRemintWrote(report) + 5)
    const said = whatTheRemintDid({ ...report, stored })
    for (const [site, rows] of Object.entries(stored)) if (rows > 0) expect(said).toContain(`${site} ${String(rows)}`)
    expect(said).not.toContain('agents.elevation')
    expect(whatTheRemintDid(report)).not.toContain('agent_runs.request')
  })
})
