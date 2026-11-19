// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RE-MINT'S READ-ONLY CHECK: THE STORE AFTER THE RE-MINT IS WHAT THE STAGED MAP MAKES OF THE SNAPSHOT, AND NOTHING
 * ELSE. Wave 13s round 161, item 30c part 3. tools/verify-the-remint.mjs runs these checks as a closed stable upgrade's
 * verifier, under the contract of tools/stable/closed-upgrade-verification.mjs. They only read. The caller opens the
 * snapshot taken before the re-mint and the store after it, each read-only and immutable.
 *
 * ---------------------------------------------------------------------------------------
 * THE TARGET PHASE: THE STORE AFTER THE RE-MINT
 * ---------------------------------------------------------------------------------------
 *
 * Each check compares the store after the re-mint with what the staged map makes of the snapshot:
 *   map           the map was staged from the snapshot as it is: the same applied migrations, the same agents table, and
 *                 nothing whatStopsTheMap (lib/registry-aliases/remint-map.ts) stops. The snapshot has no generation row.
 *                 The store after has the same applied migrations and one generation row, of this map's digest, the
 *                 migrations' digest and the number of legacy agents;
 *   registry      each agents row is the snapshot's row under the id the map gives it, wearing the new key of a drawn
 *                 face the re-mint renames, with what the plain rewrite and the stored step give its other columns, every
 *                 other column the same, and there is no other row. Every id after reads as minted;
 *   aliases       every alias of the snapshot is kept, and one is added for each legacy agent, from its old id to its new
 *                 one, and no other;
 *   rows          the schema, and every row of every other table, are what the re-mint makes of the snapshot's. A column
 *                 with a foreign key to agents.id holds the new id where it held a legacy agent's old id. held_keys.whose_id
 *                 holds the new id where the write step moves the key. A drawn face the re-mint renames has the key of its
 *                 agent's new id and keeps in drawn_from the digest it is drawn from, and a column with a foreign key to
 *                 assets.id holds the new key where it held the old one. Each plain column holds what the write step's
 *                 plain rewrite gives it, each row of the history what the pass over the history gives it, and each
 *                 stored value outside the ledgers what the stored step gives it. The kept lists hold the snapshot's
 *                 rows, one agent_id row for each legacy agent and the rows the pass works out, in this map's generation,
 *                 and no other. All of it is worked out from the snapshot by the write step's, the pass's and the stored
 *                 step's own functions (lib/registry-aliases/remint-write.ts, lib/registry-aliases/remint-plain.ts,
 *                 lib/registry-aliases/remint-faces.ts and ./remint-history.ts), by the rule theRemintRule makes from the
 *                 snapshot. The tables SQLite keeps for the text index are not compared, and the line names them;
 *   stamps        each value at a stamp or an actor pair names whom it named before, read by the write step's own check
 *                 (lib/registry-aliases/remint-stamps.ts) across the two stores. A row is matched by its name after the
 *                 re-mint, as registry-ids matches it;
 *   registry-ids  each other identity the census finds (lib/registry-aliases/census.ts) names after the re-mint the agent
 *                 it named before, under its new id, or no agent where it named none. These are the positions the stamp
 *                 check leaves out: participants, registry ids, a map's keys, ids inside a string, and older forms. What
 *                 the census cannot read is the same before and after: the same blocks at the same rows, and the same
 *                 counts that cannot be told. A row of agents is matched by the id the map gives it. Any other row is
 *                 matched by the name the plain rewrite and the stored step give it, worked out from their plans: the
 *                 census names a restart grant by its agent, a notice turn by its recipient and a reading place by its
 *                 reader, and the plain rewrite rewrites each of those;
 *   assets        each agent's and each person's picture is the one it had, under the id the map gives it: the same
 *                 asset id and address, or the new id's key and address for a drawn face the re-mint renames, the asset
 *                 row's other columns as they were but a renamed face's drawn_from, and the same bytes its address sends.
 *                 That is what GET /api/assets/:id sends, worked out by the route's own function, whatAnAssetRowSends
 *                 (lib/avatar-drawing.ts): the drawing or the file, by the SHA-256 and length of its bytes, or why it
 *                 sends nothing. The verifier prints the manifest, each picture before and after, on the line after the
 *                 check's own;
 *   integrity     integrity_check says ok, and foreign_key_check names no row, on the store after.
 *
 * WHAT assets DOES NOT SHOW. A snapshot is a copy of the database alone, and the re-mint writes no file, so an uploaded
 * picture's file is read for both stores from the folder beside the store after, as it is when the check runs. That a
 * file is the same as before the re-mint is not shown here. It is for the Vault's compare of the files' manifests, which
 * the closed upgrade is to run as one of its verifiers, and nothing in this checkout runs it. Every value the manifest is
 * made from is a value registry or rows compares, so assets fails only where one of them fails too. What it adds is the
 * manifest, and the bytes each address sends.
 *
 * A new id is drawn free only of the primary keys, and the re-mint rewrites only a value that held an old id. So a registry
 * id that named no agent can come to name the agent given that id, and only registry-ids sees it.
 *
 * WHAT rows SHOWS, AND WHAT IT DOES NOT. rows works out what the plain rewrite, the pass over the history and the stored
 * step write by their own plans, planThePlainRewrites, planTheHistoryPass and planTheStoredValues, so the re-mint and this
 * check cannot take different rules at a position. It shows that the store after holds what those plans make of the snapshot, and nothing else. A fault in
 * a plan is in the re-mint and in rows alike, so rows cannot see it, and the plan's own tests are what prove it. The pass
 * and the stored step ran after the keys were rewritten, and rows works them out on the snapshot. Where the identity
 * reader reads a value of the snapshot otherwise than it read the same value then, rows fails, and the re-mint is not
 * shown to be at fault.
 * The tables SQLite keeps for the text index change when the pass rewrites a record's data, so rows does not read them,
 * and its line names each one.
 *
 * ---------------------------------------------------------------------------------------
 * THE RECOVERY PHASE: THE STORE RESTORED FROM THE SNAPSHOT
 * ---------------------------------------------------------------------------------------
 *
 * After a rollback the store must be the snapshot, so the map is not read. Each check passes only when the store holds
 * the snapshot's schema and every row of every table, value for value, and its line says that this is what it compared.
 *
 * ---------------------------------------------------------------------------------------
 * HOW ROWS ARE COMPARED
 * ---------------------------------------------------------------------------------------
 *
 * A row is matched by its rowid. A table without one is matched by its primary key. Each value is compared with its type,
 * as SQLite's quote() writes it. A virtual table is not read, because its rows are held in tables that are. A difference
 * names the table, the row and the columns, never a value, because a row can hold a key's hash or a setting. A row of
 * the kept lists is named by its list, which is one of five names, and never by what it holds.
 *
 * How long the checks take on a real store has not been measured. The census reads the whole store twice in stamps and
 * twice in registry-ids, and integrity reads it once. rows reads each store once, and the snapshot again for each plan.
 * registry, stamps and registry-ids each read the snapshot again for the plain rewrite's plan and the stored step's.
 * assets reads every uploaded picture's file twice.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type Database from 'better-sqlite3'
import { avatarUrlFor } from '@shared/participants.ts'
import { whatAnAssetRowSends, type NothingIsSent } from './avatar-drawing.ts'
import { takeIdentityCensus, type AnIdentityAt, type IdentityCensus } from './registry-aliases/census.ts'
import { AGENT_REGISTRY_NAMESPACE } from './registry-aliases/index.ts'
import { theAgentsTablesFingerprint, theNewIdOf, whatStopsTheMap, whereEachAgentsIdCameFrom } from './registry-aliases/remint-map.ts'
import { planThePlainRewrites, theRemintRule } from './registry-aliases/remint-plain.ts'
import { thePathAfterTheRemint, theRowsTheRewritesRename, whereAStampNamesAnyoneElse, whomEachStampMustName } from './registry-aliases/remint-stamps.ts'
import { theHeldKeysToMove, theKeysToAnAgentsId } from './registry-aliases/remint-write.ts'
import { theColumnsThatHoldAnAssetsKey, theDrawnFacesToRename } from './registry-aliases/remint-faces.ts'
import { THE_TABLES_THE_PASS_WRITES, planTheHistoryPass, planTheStoredValues } from './remint-history.ts'
import { MANIFEST_EVIDENCE_TABLES, planManifestEvidence, type ManifestEvidence } from './remint-manifest-evidence.ts'
import { THE_GENERATIONS, THE_KEPT_LISTS, theAppliedMigrationsDigest, type AKeptListRow, type StagedRemint } from './remint-migration.ts'

/** The checks, in the order a request may name them. */
export const THE_REMINT_CHECKS = ['map', 'registry', 'aliases', 'rows', 'stamps', 'registry-ids', 'assets', 'integrity'] as const
export type ARemintCheck = (typeof THE_REMINT_CHECKS)[number]

export interface Outcome {
  passed: boolean
  why: string
  /** What the check read, for the verifier to print on the line after the check's own. Only assets gives it. */
  evidence?: unknown
}

/** The two stores, each opened when a check first asks for it, and the staged map, which the recovery phase does not read. */
export interface TheStores {
  snapshot: () => Database.Database
  after: () => Database.Database
  /** The folder an uploaded picture's path is read from, for both stores: the one beside the store after. */
  files: string
}

const THE_REGISTRY = 'agents'
const THE_ALIASES = 'registry_aliases'
/** The parses whose values the stamp check reads. */
const READ_BY_THE_STAMP_CHECK: ReadonlySet<string> = new Set(['actor-pair', 'stamp'])
/** How many differences one line names before it gives only how many more there are. */
const SHOWN = 10

const pass = (why: string): Outcome => ({ passed: true, why })
const fail = (why: string): Outcome => ({ passed: false, why })
const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`
/** A text value as SQLite's quote() writes it. */
const asQuoted = (text: string) => `'${text.replaceAll("'", "''")}'`
const plural = (n: number, one: string, many = `${one}s`) => `${String(n)} ${n === 1 ? one : many}`

/** The first differences, then how many more there are. */
function listed(differences: readonly string[]): string {
  const more = differences.length - SHOWN
  return differences.slice(0, SHOWN).join(' ') + (more > 0 ? ` And ${plural(more, 'difference')} more.` : '')
}

function hasTable(db: Database.Database, table: string): boolean {
  return db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table) !== undefined
}

/** Every table but a virtual one, by name. */
function theTablesOf(db: Database.Database): string[] {
  return (db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND sql NOT LIKE 'CREATE VIRTUAL TABLE%' ORDER BY name").all() as { name: string }[]).map((row) => row.name)
}

const columnsOf = (db: Database.Database, table: string): string[] =>
  (db.prepare('SELECT name FROM pragma_table_info(?) ORDER BY cid').all(table) as { name: string }[]).map((row) => row.name)

/** The columns of a table without a rowid that key its rows, in the key's order, or null for a table with one. */
function theKeyWithoutARowid(db: Database.Database, table: string): string[] | null {
  const listed = db.prepare("SELECT wr FROM pragma_table_list WHERE schema = 'main' AND name = ?").get(table) as { wr: number } | undefined
  if (listed?.wr !== 1) return null
  return (db.prepare('SELECT name FROM pragma_table_info(?) WHERE pk > 0 ORDER BY pk').all(table) as { name: string }[]).map((row) => row.name)
}

/** Each column's value, as quote() writes it, by the column's name. */
type ARow = Record<string, string>
/** What a column is expected to hold after the re-mint, given what it held in the snapshot, each as quote() writes it. */
type Rewrite = (column: string, value: string, row: ARow) => string

interface Compared {
  rows: number
  rewritten: number
  differences: string[]
}

/**
 * ONE TABLE, ROW BY ROW: each row of the snapshot, rewritten, against the row after with the same rowid, or the same key
 * where it has none. Each difference names the row and the columns, never a value.
 */
function compareTheTable(snapshot: Database.Database, after: Database.Database, table: string, rewrite: Rewrite | null): Compared {
  const columns = columnsOf(snapshot, table)
  const there = columnsOf(after, table)
  if (JSON.stringify(columns) !== JSON.stringify(there)) {
    return { rows: 0, rewritten: 0, differences: [`${table} has the columns ${columns.join(', ')} in the snapshot, and ${there.join(', ')} after.`] }
  }
  const key = theKeyWithoutARowid(snapshot, table)
  const read = (db: Database.Database) =>
    db.prepare(`SELECT ${key === null ? 'rowid AS "<rowid>", ' : ''}${columns.map((column) => `quote(${quoted(column)}) AS ${quoted(column)}`).join(', ')} FROM ${quoted(table)}`).all() as ARow[]
  const keyOf = (row: ARow) => (key === null ? String(row['<rowid>']) : JSON.stringify(key.map((column) => row[column])))
  const named = (row: ARow) => (key === null ? `row ${String(row['<rowid>'])} of ${table}` : `a row of ${table}, by its key ${key.join(', ')}`)
  let rewritten = 0
  const expected = new Map<string, ARow>()
  for (const row of read(snapshot)) {
    const image: ARow = { ...row }
    if (rewrite !== null) {
      for (const column of columns) {
        image[column] = rewrite(column, row[column]!, row)
        if (image[column] !== row[column]) rewritten += 1
      }
    }
    expected.set(keyOf(image), image)
  }
  const differences: string[] = []
  const seen = new Set<string>()
  for (const row of read(after)) {
    const at = keyOf(row)
    seen.add(at)
    const image = expected.get(at)
    if (image === undefined) {
      differences.push(`${named(row)} is there after the re-mint and not in the snapshot.`)
      continue
    }
    const differ = columns.filter((column) => row[column] !== image[column])
    if (differ.length > 0) differences.push(`${named(row)} differs in ${differ.join(', ')} from what the snapshot's row should be.`)
  }
  for (const [at, image] of expected) if (!seen.has(at)) differences.push(`${named(image)} is in the snapshot and not after the re-mint.`)
  return { rows: expected.size, rewritten, differences }
}

/** The schema, but the page each table starts on, which a copy of a store may change. */
const theSchemaOf = (db: Database.Database) => JSON.stringify(db.prepare('SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY type, name').all())

/** THE WHOLE STORE IS THE SNAPSHOT: the schema, and every row of every table, value for value. */
function theStoreIsTheSnapshot(stores: TheStores): { same: boolean; tables: number; rows: number; differences: string[] } {
  const [snapshot, after] = [stores.snapshot(), stores.after()]
  const differences: string[] = []
  if (theSchemaOf(snapshot) !== theSchemaOf(after)) differences.push("The schema is not the snapshot's.")
  const tables = theTablesOf(snapshot)
  const missing = theTablesOf(after).filter((table) => !tables.includes(table))
  for (const table of missing) differences.push(`The table ${table} is there and not in the snapshot.`)
  let rows = 0
  for (const table of tables) {
    if (!hasTable(after, table)) {
      differences.push(`The table ${table} is in the snapshot and not there.`)
      continue
    }
    const compared = compareTheTable(snapshot, after, table, null)
    rows += compared.rows
    differences.push(...compared.differences)
  }
  return { same: differences.length === 0, tables: tables.length, rows, differences }
}

/**
 * What the staged map makes of the snapshot: the new id of each legacy agent, the keys to agents.id, the held keys moved,
 * and the drawn faces renamed.
 */
interface TheImage {
  newIds: Map<string, string>
  /** The columns with a key to agents.id, by table. */
  keys: Map<string, Set<string>>
  /** Each held_keys row whose holder the write step moves, by its id as quote() writes it, and its new holder. */
  moves: Map<string, string>
  /** Each drawn face the re-mint renames, by its key as quote() writes it, with its new key and the digest it is drawn from. */
  faces: Map<string, { to: string; drawnFrom: string }>
  /** The columns with a key to assets.id, by table. */
  holders: Map<string, Set<string>>
}

function theImageOf(snapshot: Database.Database, staged: StagedRemint): { image: TheImage } | { refused: string[] } {
  const keys = theKeysToAnAgentsId(snapshot)
  if ('refused' in keys) return keys
  const held = theHeldKeysToMove(snapshot, staged.map)
  if ('refused' in held) return held
  const faces = theDrawnFacesToRename(snapshot, staged.map)
  if ('refused' in faces) return faces
  const byTable = (found: readonly { table: string; column: string }[]) => {
    const them = new Map<string, Set<string>>()
    for (const key of found) them.set(key.table, new Set([...(them.get(key.table) ?? []), key.column]))
    return them
  }
  return {
    image: {
      newIds: new Map(staged.map.entries.filter((entry) => entry.from === 'legacy').map((entry) => [asQuoted(entry.oldId), asQuoted(entry.newId)])),
      keys: byTable(keys.keys),
      moves: new Map(held.moves.map((move) => [asQuoted(move.id), asQuoted(move.to)])),
      faces: new Map(faces.faces.map((face) => [asQuoted(face.from), { to: asQuoted(face.to), drawnFrom: asQuoted(face.drawnFrom) }])),
      holders: byTable(theColumnsThatHoldAnAssetsKey(snapshot)),
    },
  }
}

/**
 * How a row of `table` is rewritten: a key to agents.id and agents.id itself take the new id, a held key moves, and a key
 * to assets.id and assets.id itself take a renamed face's new key, whose row keeps the digest it is drawn from.
 */
function theRewriteOf(image: TheImage, table: string): Rewrite {
  const keyed = image.keys.get(table) ?? new Set<string>()
  const holding = image.holders.get(table) ?? new Set<string>()
  return (column, value, row) => {
    if (keyed.has(column) || (table === THE_REGISTRY && column === 'id')) return image.newIds.get(value) ?? value
    if (table === 'held_keys' && column === 'whose_id') return image.moves.get(row['id']!) ?? value
    if (holding.has(column) || (table === 'assets' && column === 'id')) return image.faces.get(value)?.to ?? value
    if (table === 'assets' && column === 'drawn_from') return image.faces.get(row['id']!)?.drawnFrom ?? value
    return value
  }
}

/** Each legacy agent's old id, to the new id the map gives it. */
const theNewIdsOf = (staged: StagedRemint) => new Map(staged.map.entries.filter((entry) => entry.from === 'legacy').map((entry) => [entry.oldId, entry.newId]))

/** The tables SQLite keeps for the text index, by name. */
const theTextIndexTablesOf = (db: Database.Database) => db.prepare("SELECT name FROM pragma_table_list WHERE schema = 'main' AND type = 'shadow' ORDER BY name").pluck().all() as string[]

/** What the re-mint's plans write, by table, rowid and column, each as quote() writes it, and the name each row has after them. */
interface ThePlans {
  cells: Map<string, Map<string, Map<string, string>>>
  /** The name a row other than an agent's has after the plain rewrite and the stored step (theRowsTheRewritesRename). */
  rowAfter: (table: string, row: string) => string
  /** The kept-list rows the pass works out, and none where the pass is not planned. */
  keptLists: AKeptListRow[]
  manifestEvidence: ManifestEvidence | null
}

/**
 * WHAT THE RE-MINT'S PLANS MAKE OF THE SNAPSHOT: the plain rewrite, the stored step and, where `withThePass` asks for it,
 * the pass over the history, each by its own function, by the rule theRemintRule makes from the snapshot. A cell two
 * plans set is refused. Only rows reads the pass's plan, which no row of agents and no column that names a row is in.
 */
function thePlansOf(snapshot: Database.Database, staged: StagedRemint, image: TheImage, withThePass: boolean): { plans: ThePlans } | { refused: string[] } {
  const rule = theRemintRule(snapshot, staged.map)
  const keyed = new Set([...image.keys].flatMap(([table, columns]) => [...columns].map((column) => `${table}.${column}`)))
  const plain = planThePlainRewrites(snapshot, rule, keyed)
  const stored = planTheStoredValues(snapshot, rule)
  const history = withThePass ? planTheHistoryPass(snapshot, rule) : null
  const cells = new Map<string, Map<string, Map<string, string>>>()
  const refused: string[] = []
  const set = (table: string, rowid: string, column: string, value: unknown) => {
    if (typeof value !== 'string') {
      refused.push(`The re-mint's plan gives ${column} of row ${rowid} of ${table} a value that is not text, which rows cannot compare.`)
      return
    }
    const row = cells.get(table)?.get(rowid) ?? new Map<string, string>()
    if (row.has(column)) refused.push(`Both plans of the re-mint set ${column} of row ${rowid} of ${table}, so what it should hold cannot be worked out.`)
    row.set(column, asQuoted(value))
    cells.set(table, (cells.get(table) ?? new Map<string, Map<string, string>>()).set(rowid, row))
  }
  for (const one of [...plain.rewrites, ...stored.rewrites]) set(one.site.slice(0, one.site.indexOf('.')), String(one.rowid), one.site.slice(one.site.indexOf('.') + 1), one.to)
  for (const table of history === null ? [] : THE_TABLES_THE_PASS_WRITES) {
    const rowidOf = snapshot.prepare(`SELECT rowid FROM ${quoted(table)} WHERE id = ?`).pluck()
    for (const one of history!.writes[table]) {
      const rowid = rowidOf.get(one.id) as number | undefined
      if (rowid === undefined) refused.push(`The pass over the history writes a row of ${table} that the snapshot does not hold.`)
      else for (const [column, value] of Object.entries(one.set)) set(table, String(rowid), column, value)
    }
  }
  if (refused.length > 0) return { refused }
  return { plans: { cells, rowAfter: theRowsTheRewritesRename(snapshot, [...plain.rewrites, ...stored.rewrites]), keptLists: history?.keptLists ?? [], manifestEvidence: history === null ? null : planManifestEvidence(snapshot, rule, history) } }
}

/**
 * A TABLE'S REWRITE WITH WHAT THE PLANS SET IN IT: a cell a plan sets is expected to hold the plan's value, and one the map's
 * keys rewrite too is named in `both`, because what it should hold cannot be worked out.
 */
function withThePlans(rewrite: Rewrite, table: string, cells: Map<string, Map<string, string>> | undefined, both: string[]): Rewrite {
  if (cells === undefined) return rewrite
  return (column, value, row) => {
    const mapped = rewrite(column, value, row)
    const set = cells.get(String(row['<rowid>']))?.get(column)
    if (set === undefined) return mapped
    if (mapped !== value) both.push(`Both the map's keys and the re-mint's plans rewrite ${column} of row ${String(row['<rowid>'])} of ${table}, so what it should hold cannot be worked out.`)
    return set
  }
}

/**
 * THE KEPT LISTS, as a set: the snapshot's rows, and one agent_id row for each legacy agent and each row the pass works
 * out, in the map's generation. A row is named by its list and, after the re-mint, its rowid.
 */
function compareTheKeptLists(snapshot: Database.Database, after: Database.Database, staged: StagedRemint, worked: readonly AKeptListRow[]): Compared {
  const columns = ['generation', 'list', 'record_id', 'seq', 'link_id', 'old', 'new']
  const there = columnsOf(after, THE_KEPT_LISTS)
  if (JSON.stringify(columnsOf(snapshot, THE_KEPT_LISTS)) !== JSON.stringify(columns) || JSON.stringify(there) !== JSON.stringify(columns)) {
    return { rows: 0, rewritten: 0, differences: [`${THE_KEPT_LISTS} has other columns than ${columns.join(', ')} in the snapshot or after.`] }
  }
  const read = (db: Database.Database) =>
    db.prepare(`SELECT rowid AS "<rowid>", ${columns.map((column) => `quote(${quoted(column)}) AS ${quoted(column)}`).join(', ')} FROM ${quoted(THE_KEPT_LISTS)}`).all() as ARow[]
  const added = [...[...theNewIdsOf(staged)].map(([old, now]): AKeptListRow => ({ list: 'agent_id', recordId: null, seq: null, old, new: now })), ...worked]
  const asNull = (value: string | number | null | undefined) => (value === null || value === undefined ? 'NULL' : typeof value === 'number' ? String(value) : asQuoted(value))
  const expected = [
    ...read(snapshot),
    ...added.map((one): ARow => ({ generation: asQuoted(staged.map.digest), list: asQuoted(one.list), record_id: asNull(one.recordId), seq: asNull(one.seq), link_id: asNull(one.linkId), old: asQuoted(one.old), new: asQuoted(one.new) })),
  ]
  const keyOf = (row: ARow) => JSON.stringify(columns.map((column) => row[column]))
  const left = new Map<string, ARow[]>()
  for (const row of expected) left.set(keyOf(row), [...(left.get(keyOf(row)) ?? []), row])
  const differences: string[] = []
  for (const row of read(after)) {
    const same = left.get(keyOf(row))
    if (same !== undefined && same.length > 0) same.pop()
    else differences.push(`row ${String(row['<rowid>'])} of ${THE_KEPT_LISTS}, of the list ${String(row['list'])}, is there after the re-mint, and the re-mint does not work it out.`)
  }
  for (const rows of left.values()) for (const row of rows) differences.push(`a row of ${THE_KEPT_LISTS} of the list ${String(row['list'])} that the re-mint works out is not there after it.`)
  return { rows: expected.length, rewritten: added.length, differences }
}

interface Generation {
  digest: string
  schema_digest: string
  agents: number
}
const theGenerationsOf = (db: Database.Database) => db.prepare(`SELECT digest, schema_digest, agents FROM ${THE_GENERATIONS} ORDER BY digest`).all() as Generation[]

function map(stores: TheStores, staged: StagedRemint): Outcome {
  const [snapshot, after] = [stores.snapshot(), stores.after()]
  const problems: string[] = []
  const stops = whatStopsTheMap(snapshot, staged.map)
  if (stops.length > 0) problems.push(`The snapshot stops the map: ${stops.join(' ')}`)
  if (theAppliedMigrationsDigest(snapshot) !== staged.schema) problems.push('The migrations the snapshot has applied are not the ones the map was staged at.')
  if (theAgentsTablesFingerprint(snapshot) !== staged.agentsTable) problems.push("The snapshot's agents table is not the one the map was staged from.")
  if (theAppliedMigrationsDigest(after) !== staged.schema) problems.push('The migrations applied after the re-mint are not the ones the map was staged at, so the re-mint did not run alone.')
  const before = theGenerationsOf(snapshot)
  if (before.length > 0) problems.push(`The snapshot already holds ${plural(before.length, 'generation row')}, so this run did not re-mint it. This check reads only the run that applies the map.`)
  const legacy = staged.map.entries.filter((entry) => entry.from === 'legacy').length
  const expected: Generation = { digest: staged.map.digest, schema_digest: staged.schema, agents: legacy }
  const now = theGenerationsOf(after)
  if (JSON.stringify(now) !== JSON.stringify([expected])) {
    problems.push(`After the re-mint there should be one generation row, of the map ${staged.map.digest}, its migrations and ${plural(legacy, 'legacy agent')}, and there ${now.length === 1 ? 'is one that differs' : `are ${String(now.length)}`}.`)
  }
  if (problems.length > 0) return fail(problems.join(' '))
  return pass(`The map ${staged.map.digest} was staged from the snapshot as it is, the re-mint ran alone, and the store after holds its one generation row, of ${plural(legacy, 'legacy agent')}.`)
}

function registry(stores: TheStores, staged: StagedRemint): Outcome {
  const [snapshot, after] = [stores.snapshot(), stores.after()]
  if (!hasTable(snapshot, THE_REGISTRY) || !hasTable(after, THE_REGISTRY)) return fail('The snapshot or the store after holds no agents table, so there is no registry to compare.')
  const made = theImageOf(snapshot, staged)
  if ('refused' in made) return fail(`What the map makes of the snapshot cannot be read: ${made.refused.join(' ')}`)
  const planned = thePlansOf(snapshot, staged, made.image, false)
  if ('refused' in planned) return fail(`What the re-mint's plans make of the snapshot cannot be worked out: ${planned.refused.join(' ')}`)
  const both: string[] = []
  const compared = compareTheTable(snapshot, after, THE_REGISTRY, withThePlans(theRewriteOf(made.image, THE_REGISTRY), THE_REGISTRY, planned.plans.cells.get(THE_REGISTRY), both))
  const notMinted = whereEachAgentsIdCameFrom(after).filter((agent) => agent.from !== 'minted')
  const problems = [...both, ...compared.differences, ...notMinted.map((agent) => `The agent ${JSON.stringify(agent.id)} reads as ${agent.from} after the re-mint, because ${agent.because}.`)]
  if (problems.length > 0) return fail(listed(problems))
  return pass(
    `Each of the ${plural(compared.rows, 'agent')} is the snapshot's row under the id the map gives it, ${plural(made.image.newIds.size, 'legacy agent')} under a new id, ` +
      'its other columns as the plain rewrite and the stored step give them, and every id reads as minted.',
  )
}

interface AnAlias {
  namespace: string
  alias_id: string
  canonical_id: string
}
const theAliasesOf = (db: Database.Database) => db.prepare(`SELECT namespace, alias_id, canonical_id FROM ${THE_ALIASES} ORDER BY namespace, alias_id`).all() as AnAlias[]
const anAliasNamed = (alias: AnAlias) => JSON.stringify([alias.namespace, alias.alias_id])

function aliases(stores: TheStores, staged: StagedRemint): Outcome {
  const [snapshot, after] = [stores.snapshot(), stores.after()]
  const kept = theAliasesOf(snapshot)
  const added = staged.map.entries.filter((entry) => entry.from === 'legacy').map((entry): AnAlias => ({ namespace: AGENT_REGISTRY_NAMESPACE, alias_id: entry.oldId, canonical_id: entry.newId }))
  const expected = new Map([...kept, ...added].map((alias) => [anAliasNamed(alias), alias]))
  const now = new Map(theAliasesOf(after).map((alias) => [anAliasNamed(alias), alias]))
  const problems: string[] = []
  for (const [at, alias] of expected) {
    const there = now.get(at)
    if (there === undefined) problems.push(`The alias ${JSON.stringify(alias.alias_id)} is not there after the re-mint.`)
    else if (there.canonical_id !== alias.canonical_id) problems.push(`The alias ${JSON.stringify(alias.alias_id)} names ${JSON.stringify(there.canonical_id)} after the re-mint, and should name ${JSON.stringify(alias.canonical_id)}.`)
  }
  for (const [at, alias] of now) if (!expected.has(at)) problems.push(`The alias ${JSON.stringify(alias.alias_id)}, to ${JSON.stringify(alias.canonical_id)}, is there after the re-mint, and neither the snapshot nor the map has it.`)
  if (problems.length > 0) return fail(listed(problems))
  return pass(
    `${plural(kept.length, 'alias', 'aliases')} of the snapshot ${kept.length === 1 ? 'is' : 'are'} kept, and ${plural(added.length, 'alias', 'aliases')} ${added.length === 1 ? 'was' : 'were'} added, ` +
      `one from each legacy agent's old id to its new one, and no other.`,
  )
}

function rows(stores: TheStores, staged: StagedRemint): Outcome {
  const [snapshot, after] = [stores.snapshot(), stores.after()]
  const made = theImageOf(snapshot, staged)
  if ('refused' in made) return fail(`What the map makes of the snapshot cannot be read: ${made.refused.join(' ')}`)
  const planned = thePlansOf(snapshot, staged, made.image, true)
  if ('refused' in planned) return fail(`What the re-mint's plans make of the snapshot cannot be worked out: ${planned.refused.join(' ')}`)
  const problems: string[] = []
  if (theSchemaOf(snapshot) !== theSchemaOf(after)) problems.push("The schema after the re-mint is not the snapshot's.")
  const index = theTextIndexTablesOf(snapshot)
  const elsewhere = new Set([THE_REGISTRY, THE_ALIASES, THE_GENERATIONS, THE_KEPT_LISTS, ...MANIFEST_EVIDENCE_TABLES, ...index])
  const tables = theTablesOf(snapshot).filter((table) => !elsewhere.has(table))
  for (const table of theTablesOf(after)) if (!elsewhere.has(table) && !tables.includes(table)) problems.push(`The table ${table} is there after the re-mint and not in the snapshot.`)
  let [read, rewritten] = [0, 0]
  for (const table of tables) {
    if (!hasTable(after, table)) {
      problems.push(`The table ${table} is in the snapshot and not after the re-mint.`)
      continue
    }
    const both: string[] = []
    const compared = compareTheTable(snapshot, after, table, withThePlans(theRewriteOf(made.image, table), table, planned.plans.cells.get(table), both))
    read += compared.rows
    rewritten += compared.rewritten
    problems.push(...both, ...compared.differences)
  }
  const kept = compareTheKeptLists(snapshot, after, staged, planned.plans.keptLists)
  problems.push(...kept.differences)
  // Each evidence row is compared by all its columns, including the retained exact bytes.
  const evidence = planned.plans.manifestEvidence
  if (evidence !== null) {
    const additions = [evidence.bodies, evidence.revisions, evidence.changes]
    MANIFEST_EVIDENCE_TABLES.forEach((table, i) => {
      if (!hasTable(snapshot, table) || !hasTable(after, table)) { problems.push(`${table} is missing from the snapshot or after the re-mint.`); return }
      const columns = columnsOf(snapshot, table)
      if (JSON.stringify(columns) !== JSON.stringify(columnsOf(after, table))) { problems.push(`${table} has different columns after the re-mint.`); return }
      const readRows = (db: Database.Database) => db.prepare(`SELECT * FROM ${quoted(table)}`).all() as Record<string, unknown>[]
      const key = (row: Record<string, unknown>) => JSON.stringify(columns.map(column => row[column]))
      const expected = [...readRows(snapshot), ...(additions[i] ?? []).map(one => ({ generation: staged.map.digest, ...one }))].map(key).sort()
      const actual = readRows(after).map(key).sort()
      if (JSON.stringify(expected) !== JSON.stringify(actual)) problems.push(`${table} differs from the manifest evidence worked out from the snapshot.`)
    })
  }
  if (problems.length > 0) return fail(listed(problems))
  return pass(
    `The schema and the ${plural(read, 'row')} of the ${plural(tables.length, 'other table')} are the snapshot's, but for ${plural(rewritten, 'value')} the re-mint rewrites: ` +
      `the keys to agents.id, the holders of the keys it moves, the key and digest of each drawn face it renames, with every key to it, ` +
      `what the plain rewrite gives each plain column, what the pass over the history gives each row of it, and what the stored step gives each stored value outside the ledgers. ` +
      `${THE_KEPT_LISTS} holds the ${plural(kept.rows, 'row')} the re-mint works out, and no other. ` +
      `The ${plural(index.length, 'table')} SQLite keeps for the text index, ${index.join(', ')}, ${index.length === 1 ? 'is' : 'are'} not compared, because the pass changes ${index.length === 1 ? 'it' : 'them'} when it rewrites a record's data.`,
  )
}

function stamps(stores: TheStores, staged: StagedRemint): Outcome {
  const snapshot = stores.snapshot()
  const made = theImageOf(snapshot, staged)
  if ('refused' in made) return fail(`What the map makes of the snapshot cannot be read: ${made.refused.join(' ')}`)
  const planned = thePlansOf(snapshot, staged, made.image, false)
  if ('refused' in planned) return fail(`What the re-mint's plans make of the snapshot cannot be worked out: ${planned.refused.join(' ')}`)
  // A position before is compared by its path after the pass, which renames a key that is an old id, and at its row's name
  // after the plans, which rename a row the census names by a column they rewrite.
  const newIds = theNewIdsOf(staged)
  const must = whomEachStampMustName(snapshot, staged.map, planned.plans.rowAfter).map((one) => ({ ...one, at: { ...one.at, path: thePathAfterTheRemint(one.at.path, newIds) } }))
  const said = whereAStampNamesAnyoneElse(stores.after(), must)
  if (said.length > 0) return fail(listed(said))
  return pass(`Each of the ${plural(must.length, 'value')} at a stamp or an actor pair names after the re-mint whom it named before.`)
}

/** Each identity the census finds, and what it could not read, of one store. */
function theIdentitiesOf(db: Database.Database): { found: AnIdentityAt[]; census: IdentityCensus } {
  const found: AnIdentityAt[] = []
  const census = takeIdentityCensus(db, undefined, undefined, found)
  return { found: found.filter((one) => !READ_BY_THE_STAMP_CHECK.has(one.parse)), census }
}

function registryIds(stores: TheStores, staged: StagedRemint): Outcome {
  const [snapshot, after] = [stores.snapshot(), stores.after()]
  const made = theImageOf(snapshot, staged)
  if ('refused' in made) return fail(`What the map makes of the snapshot cannot be read: ${made.refused.join(' ')}`)
  const planned = thePlansOf(snapshot, staged, made.image, false)
  if ('refused' in planned) return fail(`What the re-mint's plans make of the snapshot cannot be worked out: ${planned.refused.join(' ')}`)
  const newIdOf = new Map(staged.map.entries.map((entry) => [entry.oldId, entry.newId]))
  const newIds = theNewIdsOf(staged)
  // A row of agents is named by the id the map gives it, and any other row by the name the plans give it.
  const theRowAfter = (table: string, row: string) => (table === THE_REGISTRY ? (newIdOf.get(row) ?? row) : planned.plans.rowAfter(table, row))
  const isAnAgent = (db: Database.Database) => {
    const statement = db.prepare(`SELECT 1 FROM ${THE_REGISTRY} WHERE id = ?`)
    return (id: string) => statement.get(id) !== undefined
  }
  const [wasAnAgent, isAnAgentNow] = [isAnAgent(snapshot), isAnAgent(after)]
  const whomItMustName = (one: AnIdentityAt) => (wasAnAgent(one.canonical) ? `the agent ${JSON.stringify(newIdOf.get(one.canonical) ?? one.canonical)}` : 'no agent')
  const whomItNames = (one: AnIdentityAt) => (isAnAgentNow(one.canonical) ? `the agent ${JSON.stringify(one.canonical)}` : 'no agent')
  const positionOf = (one: AnIdentityAt, row: string, path = one.path) => JSON.stringify([one.table, row, path, one.site, one.as])
  const where = (one: AnIdentityAt) => `${one.table} row ${JSON.stringify(one.row)}, ${one.path} (${one.site})`

  const before = theIdentitiesOf(snapshot)
  const now = theIdentitiesOf(after)
  const was = new Map<string, AnIdentityAt[]>()
  // A position before is compared by its path after the pass, which renames a key that is an old id.
  for (const one of before.found) {
    const position = positionOf(one, theRowAfter(one.table, one.row), thePathAfterTheRemint(one.path, newIds))
    was.set(position, [...(was.get(position) ?? []), one])
  }
  const is = new Map<string, AnIdentityAt[]>()
  for (const one of now.found) is.set(positionOf(one, one.row), [...(is.get(positionOf(one, one.row)) ?? []), one])
  const problems: string[] = []
  for (const [position, them] of was) {
    const read = is.get(position) ?? []
    for (const [i, one] of them.entries()) {
      const it = read[i]
      if (it === undefined) problems.push(`${where(one)}: it held ${JSON.stringify(one.stored)}, and nothing is read there after the re-mint.`)
      else if (whomItNames(it) !== whomItMustName(one)) {
        problems.push(`${where(it)}: it held ${JSON.stringify(one.stored)}, so it must name ${whomItMustName(one)}, and it holds ${JSON.stringify(it.stored)}, which names ${whomItNames(it)}.`)
      }
    }
    for (const it of read.slice(them.length)) problems.push(`${where(it)}: it holds ${JSON.stringify(it.stored)}, and nothing was read there before the re-mint.`)
  }
  for (const [position, read] of is) if (!was.has(position)) for (const it of read) problems.push(`${where(it)}: it holds ${JSON.stringify(it.stored)}, and nothing was read there before the re-mint.`)

  const blocksOf = (census: IdentityCensus, mapped: boolean) =>
    JSON.stringify(census.blocks.map((one) => ({ ...one, row: mapped ? theRowAfter(one.table, one.row) : one.row })).sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)))
  if (blocksOf(before.census, true) !== blocksOf(now.census, false)) {
    problems.push(`The census cannot read ${plural(before.census.blocks.length, 'value')} in the snapshot and ${plural(now.census.blocks.length, 'value')} after the re-mint, and they are not the same values at the same rows.`)
  }
  if (JSON.stringify(before.census.untold) !== JSON.stringify(now.census.untold)) problems.push('The counts of values that cannot be told are not the same before and after the re-mint.')
  if (JSON.stringify(before.census.read) !== JSON.stringify(now.census.read)) problems.push('The census read a different number of rows in some table before and after the re-mint.')
  if (problems.length > 0) return fail(listed(problems))
  const untold = Object.values(now.census.untold).reduce((sum, n) => sum + n, 0)
  return pass(
    `Each of the ${plural(before.found.length, 'identity', 'identities')} the stamp check does not read names after the re-mint whom it named before. ` +
      `The census could not read ${plural(now.census.blocks.length, 'value')} and could not tell ${plural(untold, 'value')}, the same before and after.`,
  )
}

/** What one asset's address sends: the drawing or the file, by the SHA-256 and length of its bytes, or why it sends nothing. */
type WhatIsSent = { from: 'drawing' | 'file'; mime: string; cacheControl: string; sha256: string; bytes: number } | { refused: NothingIsSent['refused'] }

function whatIsSent(row: Record<string, unknown> | undefined, asset: string, files: string): WhatIsSent {
  const sent = whatAnAssetRowSends(row, asset, files)
  if ('refused' in sent) return { refused: sent.refused }
  // The route sends a drawing as its text, which is UTF-8, and a file whole.
  const body = 'drawing' in sent ? Buffer.from(sent.drawing, 'utf8') : readFileSync(sent.file)
  return { from: 'drawing' in sent ? 'drawing' : 'file', mime: sent.mime, cacheControl: sent.cacheControl, sha256: createHash('sha256').update(body).digest('hex'), bytes: body.length }
}

/** One participant's picture in one store: its ids before and after the re-mint, the asset its row names, and what that is. */
interface APicture {
  kind: 'agent' | 'person'
  /** Its id in the snapshot, or null for an agent after the re-mint whose id the map gives no agent of the snapshot. */
  oldId: string | null
  newId: string
  asset: string
  url: string
  /** The asset row's columns but its id, as stored, or null where no row has the id. */
  provenance: Record<string, unknown> | null
  sent: WhatIsSent
}

/** Each table whose every row names one picture, by the kind of participant a row is, and how a sentence names one. */
const THE_HOLDERS = [
  { kind: 'agent', table: THE_REGISTRY, named: 'The agent' },
  { kind: 'person', table: 'people', named: 'The person' },
] as const
const THE_PARTS: readonly { part: 'asset' | 'url' | 'provenance' | 'sent'; named: string }[] = [
  { part: 'asset', named: 'its asset id' },
  { part: 'url', named: 'its address' },
  { part: 'provenance', named: "its asset row's other columns" },
  { part: 'sent', named: 'what its address sends' },
]

/**
 * EACH PARTICIPANT'S PICTURE IN ONE STORE, the agents and then the people, each in the order of the ids after the re-mint.
 * `ids` gives an agent's ids before and after the re-mint from its id in this store. A person keeps its id.
 */
function thePicturesOf(db: Database.Database, files: string, ids: (agent: string) => { oldId: string | null; newId: string }): APicture[] {
  const theAsset = db.prepare('SELECT * FROM assets WHERE id = ?')
  return THE_HOLDERS.flatMap((holder) =>
    (db.prepare(`SELECT id, avatar_asset_id AS asset FROM ${quoted(holder.table)}`).all() as { id: string; asset: string }[])
      .map((one): APicture => {
        const row = theAsset.get(one.asset) as Record<string, unknown> | undefined
        return {
          kind: holder.kind,
          ...(holder.kind === 'agent' ? ids(one.id) : { oldId: one.id, newId: one.id }),
          asset: one.asset,
          url: avatarUrlFor(one.asset),
          provenance: row === undefined ? null : Object.fromEntries(Object.entries(row).filter(([column]) => column !== 'id')),
          sent: whatIsSent(row, one.asset, files),
        }
      })
      .sort((a, b) => (a.newId < b.newId ? -1 : a.newId > b.newId ? 1 : 0)),
  )
}

function assets(stores: TheStores, staged: StagedRemint): Outcome {
  const faces = theDrawnFacesToRename(stores.snapshot(), staged.map)
  if ('refused' in faces) return fail(`The drawn faces the map renames in the snapshot cannot be read: ${faces.refused.join(' ')}`)
  const renamed = new Map(faces.faces.map((face) => [face.from, face]))
  /** A picture before, as it is to be after: a drawn face the re-mint renames has its new key and keeps its digest. */
  const asAfter = (was: APicture): APicture => {
    const face = renamed.get(was.asset)
    if (face === undefined) return was
    return { ...was, asset: face.to, url: avatarUrlFor(face.to), provenance: { ...was.provenance, drawn_from: face.drawnFrom } }
  }
  const oldIdOf = new Map(staged.map.entries.map((entry) => [entry.newId, entry.oldId]))
  const before = thePicturesOf(stores.snapshot(), stores.files, (agent) => ({ oldId: agent, newId: theNewIdOf(staged.map, agent) }))
  const after = thePicturesOf(stores.after(), stores.files, (agent) => ({ oldId: oldIdOf.get(agent) ?? null, newId: agent }))
  const evidence = { before, after }
  const keyOf = (one: APicture) => JSON.stringify([one.kind, one.newId])
  const named = (one: APicture) => {
    // Found outside the sentence, because the machine-word gate reads a kind written inside one as a stored word
    // reaching a person.
    const who = THE_HOLDERS.find((holder) => holder.kind === one.kind)!.named
    return `${who} ${JSON.stringify(one.newId)}${one.oldId !== null && one.oldId !== one.newId ? `, ${JSON.stringify(one.oldId)} before the re-mint,` : ''}`
  }
  const now = new Map(after.map((one) => [keyOf(one), one]))
  const problems: string[] = []
  for (const was of before) {
    const is = now.get(keyOf(was))
    if (is === undefined) {
      problems.push(`${named(was)} is not there after the re-mint.`)
      continue
    }
    const expected = asAfter(was)
    const differ = THE_PARTS.filter(({ part }) => JSON.stringify(is[part]) !== JSON.stringify(expected[part]))
    if (differ.length > 0) problems.push(`${named(was)} differs after the re-mint in ${differ.map((one) => one.named).join(', ')}.`)
  }
  const was = new Set(before.map(keyOf))
  for (const is of after) if (!was.has(keyOf(is))) problems.push(`${named(is)} is there after the re-mint, and nobody in the snapshot has that id under the map's new ids.`)
  if (problems.length > 0) return { ...fail(listed(problems)), evidence }
  const agents = before.filter((one) => one.kind === 'agent').length
  const [drawn, fromAFile] = (['drawing', 'file'] as const).map((from) => before.filter((one) => 'from' in one.sent && one.sent.from === from).length) as [number, number]
  const nothing = before.length - drawn - fromAFile
  const digest = (manifest: APicture[]) => createHash('sha256').update(JSON.stringify(manifest)).digest('hex')
  return {
    ...pass(
      `Each of the ${plural(agents, 'agent')} and ${plural(before.length - agents, 'person', 'people')} has after the re-mint the picture it had, an agent under the id the map ` +
        `gives it: the same asset id and address, or the new id's key and address for each of the ${plural(renamed.size, 'drawn face')} the re-mint renames, ` +
        "the same asset row but a renamed face's drawn_from, which holds the digest it is drawn from, and the same bytes sent, or nothing sent for the same reason. " +
        `${plural(drawn, 'picture')} ${drawn === 1 ? 'is' : 'are'} drawn, ${String(fromAFile)} ${fromAFile === 1 ? 'is' : 'are'} sent from a file, and ${String(nothing)} ` +
        `${nothing === 1 ? 'sends' : 'send'} nothing. A file is read as it is now, from the folder beside the store after, for both stores. ` +
        `The manifest before has the SHA-256 ${digest(before)}, and the one after ${digest(after)}.`,
    ),
    evidence,
  }
}

function integrity(stores: TheStores): Outcome {
  const after = stores.after()
  const said = (after.prepare('PRAGMA integrity_check').all() as { integrity_check: string }[]).map((row) => row.integrity_check)
  const broken = after.prepare('PRAGMA foreign_key_check').all() as { table: string; rowid: number | null; parent: string }[]
  const problems: string[] = []
  if (JSON.stringify(said) !== JSON.stringify(['ok'])) problems.push(`integrity_check found ${plural(said.length, 'problem')}.`)
  for (const row of broken) problems.push(`The row ${String(row.rowid)} of ${row.table} names a row of ${row.parent} that is not there.`)
  if (problems.length > 0) return fail(listed(problems))
  return pass('integrity_check says ok, and foreign_key_check names no row.')
}

const IN_THE_TARGET_PHASE: Record<ARemintCheck, (stores: TheStores, staged: StagedRemint) => Outcome> = {
  map,
  registry,
  aliases,
  rows,
  stamps,
  'registry-ids': registryIds,
  assets,
  integrity,
}

/**
 * EACH CHECK OF ONE PHASE, to be run one at a time. In the target phase it compares the store after with what `staged`
 * makes of the snapshot. In the recovery phase `staged` is not read, and each check compares the store with the snapshot.
 */
export function theRemintChecks(phase: 'target' | 'recovery', stores: TheStores, staged: StagedRemint | null): Record<ARemintCheck, () => Outcome> {
  if (phase === 'recovery') {
    let compared: ReturnType<typeof theStoreIsTheSnapshot> | undefined
    const recovered = (): Outcome => {
      compared ??= theStoreIsTheSnapshot(stores)
      const what = `the store must be the snapshot, so this compared the schema and the ${plural(compared.rows, 'row')} of the ${plural(compared.tables, 'table')}, value for value`
      return compared.same ? pass(`After a rollback ${what}, and they are the snapshot's.`) : fail(`After a rollback ${what}, and they are not: ${listed(compared.differences)}`)
    }
    return Object.fromEntries(THE_REMINT_CHECKS.map((name) => [name, recovered])) as Record<ARemintCheck, () => Outcome>
  }
  if (staged === null) throw new Error('The target phase compares the store with what a staged map makes of the snapshot, and it was given no map.')
  return Object.fromEntries(THE_REMINT_CHECKS.map((name) => [name, () => IN_THE_TARGET_PHASE[name](stores, staged)])) as Record<ARemintCheck, () => Outcome>
}
