// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RE-MINT'S WRITE STEP: EVERY LEGACY AGENT TAKES THE NEW ID ITS MAP GIVES IT, THE KEYS IT HOLDS ARE HELD UNDER THAT ID,
 * AND ITS OLD ID IS FILED AS AN ALIAS OF THE NEW ONE, IN ONE TRANSACTION. Wave 13s round 157, item 30c part 3, and the keys
 * in round 159. The re-mint step of `npm run db:migrate -- --remint <file>` calls it (src/server/db/remint-migration.ts).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT WRITES
 * ---------------------------------------------------------------------------------------
 *
 * For each legacy entry of a map that planTheRemint made (remint-map.ts), in this order:
 *   1. agents.id, from the old id to the new one;
 *   2. every column whose foreign key ties it to agents.id, on each row that holds the old id, and no other column of
 *      that row. The keys are read from the schema each time, so a key a later migration adds is rewritten with the
 *      rest. Today there are nine: resident_read_grants.resident_id and reader_id, resident_void_marks.resident_id,
 *      resident_space_writes.resident_id, resident_sleeps.agent_id, agent_records.agent_id, handle_holds.agent_id,
 *      agent_renames.agent_id and agent_starter_changes.agent_id;
 *   3. held_keys.whose_id, on each row whose holder is an agent, and no other column of that row. The holder is read as
 *      whomAStoredNameNames (remint-map.ts) reads a stored name: a name that one agent answers to, by its id, an old id or
 *      a handle, becomes the id the map gives that agent. A name no agent answers to, and a person's or the office's
 *      key, stay as they are;
 *   4. an old id in the plain columns of the stores outside the tables a seal pins, through remint-plain.ts, whose
 *      header names the sites and the rule: each value becomes the new id only where one agent answers to it by that id;
 *   5. an alias in the agent registry from the old id to the new one, through fileRegistryAliases (index.ts), after
 *      every agent has its new id, because an alias's old id may not be any agent's id.
 * A minted agent keeps its id, and nothing of it is written but a key held under its handle, which becomes its id.
 * Every other column that holds an agent's id is read through the aliases, and this step does not write it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE KEYS ARE COMPARED BEFORE AND AFTER
 * ---------------------------------------------------------------------------------------
 *
 * A session that holds a key goes on using it after the re-mint, so no key is made again, revoked or brought back. Its
 * row must stay as it was but for the holder: its id, hash, times, revocation and every other column, and its rowid.
 * The step reads the whole of held_keys before it writes and again after, and any other difference is thrown, which
 * rolls the transaction back. The words name the row and the column, and never a key's hash.
 *
 * ---------------------------------------------------------------------------------------
 * WHY WHOM EACH STAMP NAMES IS READ BEFORE AND AFTER
 * ---------------------------------------------------------------------------------------
 *
 * The step keeps the bytes of every stamp and actor pair but a key's holder and an old id the plain rewrite gives the new
 * id, and each must name after the writes whom it named before them: the same agent under the id the map gives it, no
 * agent, the same agents, or one of the office's own writers. Bytes kept can still come to name someone else, because a
 * new id is drawn free only of the primary keys. So
 * the step reads whom each names before it writes and again after, through remint-stamps.ts. A row the plain rewrite
 * renames, such as a reading place named by its reader, is matched by the name the planned rewrite gives it. A value that
 * names anyone else is thrown, with its position and its row, and that rolls the transaction back. Registry ids,
 * participants and values that cannot be told are not read here.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE KEYS ARE DEFERRED
 * ---------------------------------------------------------------------------------------
 *
 * Each of the nine keys is ON UPDATE NO ACTION, which SQLite checks at the end of each statement. So changing
 * agents.id first would fail while the rows that name the old id are still there, and changing them first would fail
 * because no agent has the new id yet. The step sets PRAGMA defer_foreign_keys = ON inside its transaction, so the
 * keys are checked at the commit; SQLite turns it off again when the transaction ends. Before the commit, the step asks
 * foreign_key_check of every table with a key to agents.id, and a row it names stops the whole step.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT REFUSES, WRITING NOTHING
 * ---------------------------------------------------------------------------------------
 *
 *   - a map that whatStopsTheMap stops, asked inside the transaction, so nothing changes between the check and the
 *     writes;
 *   - a key holder that more than one agent answers to, with the agents named, because whose keys they are is not
 *     guessed;
 *   - a legacy agent that is already an alias's target. registry_aliases.canonical_id references agents.id with ON
 *     UPDATE RESTRICT, and the trigger registry_aliases_reserve_update refuses that change. The step names each such
 *     agent and does not work around the trigger;
 *   - a key to a column of agents that is not its id, which the step would not know how to rewrite;
 *   - a store whose keys to agents.id are already broken before it writes, each broken row named.
 * A fault while it writes rolls the whole transaction back and is thrown.
 */
import type Database from 'better-sqlite3'
import { AGENT_REGISTRY_NAMESPACE, fileRegistryAliases } from './index.ts'
import { whatStopsTheMap, whomAStoredNameNames, type AStoredName, type RemintMap } from './remint-map.ts'
import { planThePlainRewrites, refuseAnOldIdLeftInAPlainColumn, theRemintRule, writeThePlainRewrites, type TheRemintRule } from './remint-plain.ts'
import { A_STAMP_THAT_NAMES_ANYONE_ELSE_STOPS_THE_REMINT, theRowsTheRewritesRename, whereAStampNamesAnyoneElse, whomEachStampMustName, type WhomItMustName } from './remint-stamps.ts'

/** The table whose id the keys follow, and the alias table, whose key to it the step never rewrites. */
const THE_REGISTRY = 'agents'
const THE_ALIASES = 'registry_aliases'

export interface RemintWritten {
  /** The agents whose id changed. */
  agents: number
  /** The rows rewritten in each column with a key to agents.id, by its table, a dot and the column. */
  columns: Record<string, number>
  /** The held_keys rows whose holder became the id the map gives its agent. */
  heldKeys: number
  /** The rows rewritten at each plain site remint-plain.ts reads, by its table, a dot and the column. */
  plain: Record<string, number>
  /** The aliases filed. */
  aliases: number
}

/**
 * What it wrote, or why it refused. Beside what it wrote, it gives what it read before the writes for the checks that
 * come after it: whom each stamp must name, and the rule it decided, so the pass over the history reads a value by the
 * same decisions.
 */
export type RemintWrite = { written: RemintWritten; stamps: WhomItMustName[]; rule: TheRemintRule } | { refused: string[] }

export interface AKey {
  table: string
  column: string
}

const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`

/** Every column whose foreign key ties it to agents.id, except the alias table's, or every key the step cannot rewrite. */
export function theKeysToAnAgentsId(db: Database.Database): { keys: AKey[] } | { refused: string[] } {
  const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name").all() as { name: string }[]
  const keys: AKey[] = []
  const refused: string[] = []
  for (const { name } of tables) {
    const toTheRegistry = (db.prepare('SELECT "from" AS column, "to" AS target FROM pragma_foreign_key_list(?) WHERE "table" = ?').all(name, THE_REGISTRY) as {
      column: string
      target: string | null
    }[])
    for (const key of toTheRegistry) {
      // A key that names no column of agents is a key to its primary key, which is its id.
      if (key.target !== null && key.target !== 'id') refused.push(`${name}.${key.column} has a foreign key to agents.${key.target}, which the re-mint does not rewrite.`)
      else if (name !== THE_ALIASES) keys.push({ table: name, column: key.column })
    }
  }
  return refused.length > 0 ? { refused } : { keys }
}

/** Every row that breaks a key in these tables, as foreign_key_check names it. */
function theBrokenKeys(db: Database.Database, tables: readonly string[]): string[] {
  return tables.flatMap((table) =>
    (db.prepare(`PRAGMA foreign_key_check(${quoted(table)})`).all() as { table: string; rowid: number | null; parent: string }[]).map(
      (row) => `The row ${String(row.rowid)} of ${row.table} names a row of ${row.parent} that is not there.`,
    ),
  )
}

/** A held_keys row whose holder is an agent, by the row's id, and the id the map gives that agent. */
export interface AKeyToMove {
  id: string
  to: string
}

/**
 * Each held_keys row whose holder one agent answers to, with the id the map gives that agent where it is not already the
 * holder, or every holder that more than one agent answers to.
 */
export function theHeldKeysToMove(db: Database.Database, map: RemintMap): { moves: AKeyToMove[] } | { refused: string[] } {
  const rows = db.prepare("SELECT id, whose_id AS holder FROM held_keys WHERE whose_kind = 'agent' ORDER BY rowid").all() as { id: string; holder: string }[]
  const named = new Map<string, AStoredName>()
  const moves: AKeyToMove[] = []
  const refused = new Map<string, string>()
  for (const row of rows) {
    const name = named.get(row.holder) ?? whomAStoredNameNames(db, map, row.holder)
    named.set(row.holder, name)
    if (name.names === 'more than one agent') {
      refused.set(
        row.holder,
        `The keys held under ${JSON.stringify(row.holder)} could be the keys of the agent ${name.agents.map((agent) => JSON.stringify(agent)).join(' or of the agent ')}, ` +
          'so the re-mint cannot tell under which new id to hold them.',
      )
    } else if (name.names === 'one agent' && name.becomes !== row.holder) moves.push({ id: row.id, to: name.becomes })
  }
  return refused.size > 0 ? { refused: [...refused.values()] } : { moves }
}

type AKeyRow = Record<string, unknown>

/** Every row of held_keys with its rowid, in the rowid's order. */
const everyHeldKey = (db: Database.Database): AKeyRow[] => db.prepare('SELECT rowid AS "rowid", * FROM held_keys ORDER BY rowid').all() as AKeyRow[]

/** Each row of held_keys that is not as it was but for the holder each move gives it, with the columns that differ. */
function whatElseChangedInTheHeldKeys(before: readonly AKeyRow[], after: readonly AKeyRow[], moves: readonly AKeyToMove[]): string[] {
  if (after.length !== before.length) return [`held_keys had ${String(before.length)} rows, and has ${String(after.length)}.`]
  const to = new Map(moves.map((move) => [move.id, move.to]))
  return before.flatMap((row, at) => {
    const expected: AKeyRow = { ...row, whose_id: to.get(row['id'] as string) ?? row['whose_id'] }
    const differ = Object.keys(expected).filter((column) => after[at]![column] !== expected[column])
    return differ.length === 0 ? [] : [`The row ${JSON.stringify(row['id'])} of held_keys changed in ${differ.join(', ')}.`]
  })
}

/**
 * GIVE EACH LEGACY AGENT OF THE MAP ITS NEW ID, REWRITE THE KEYS THAT NAME IT, HOLD THE KEYS IT HOLDS UNDER THE NEW ID,
 * REWRITE ITS OLD ID IN THE PLAIN COLUMNS BY THE RULE, AND FILE ITS OLD ID AS AN ALIAS, or every reason it cannot be done,
 * with nothing written.
 */
export function writeTheRemint(db: Database.Database, map: RemintMap): RemintWrite {
  const write = db.transaction((): RemintWrite => {
    const stops = whatStopsTheMap(db, map)
    if (stops.length > 0) return { refused: stops }
    const owners = db.prepare('SELECT owner_kind AS kind, owner_id AS id FROM agents').all() as { kind: unknown; id: unknown }[]
    const brokenOwners = owners.filter(({ kind, id }) => !(
      (kind === null && id === null) ||
      ((kind === 'agent' || kind === 'person') && typeof id === 'string' && id.trim() !== '')
    )).length
    if (brokenOwners > 0) return { refused: [`${String(brokenOwners)} agent owner pair(s) are incomplete or invalid; nothing was written.`] }
    const moving = map.entries.filter((entry) => entry.from === 'legacy')
    const isATarget = db.prepare('SELECT 1 FROM registry_aliases WHERE canonical_id = ? LIMIT 1')
    const targets = moving.filter((entry) => isATarget.get(entry.oldId) !== undefined)
    if (targets.length > 0) {
      return {
        refused: targets.map(
          (entry) =>
            `The agent with id ${JSON.stringify(entry.oldId)} and handle ${JSON.stringify(entry.handle)} is already the target of an alias, so its id cannot change: ` +
            'registry_aliases.canonical_id is ON UPDATE RESTRICT, and the trigger registry_aliases_reserve_update refuses it.',
        ),
      }
    }
    const found = theKeysToAnAgentsId(db)
    if ('refused' in found) return found
    const tables = [...new Set([...found.keys.map((key) => key.table), THE_ALIASES])]
    const brokenBefore = theBrokenKeys(db, tables)
    if (brokenBefore.length > 0) return { refused: brokenBefore }
    // Read while every agent still has the id the map was made from.
    const held = theHeldKeysToMove(db, map)
    if ('refused' in held) return held
    const heldBefore = everyHeldKey(db)
    const rule = theRemintRule(db, map)
    const plain = planThePlainRewrites(db, rule, new Set(found.keys.map((key) => `${key.table}.${key.column}`)))
    const stamps = whomEachStampMustName(db, map, theRowsTheRewritesRename(db, plain.rewrites))

    db.pragma('defer_foreign_keys = ON')
    const written: RemintWritten = { agents: 0, columns: Object.fromEntries(found.keys.map((key) => [`${key.table}.${key.column}`, 0])), heldKeys: 0, plain: {}, aliases: 0 }
    const theAgent = db.prepare('UPDATE agents SET id = ? WHERE id = ?')
    const theKeys = found.keys.map((key) => ({
      site: `${key.table}.${key.column}`,
      statement: db.prepare(`UPDATE ${quoted(key.table)} SET ${quoted(key.column)} = ? WHERE ${quoted(key.column)} = ?`),
    }))
    for (const entry of moving) {
      const changed = theAgent.run(entry.newId, entry.oldId).changes
      if (changed !== 1) throw new Error(`The re-mint changed ${String(changed)} agents rows with the id ${JSON.stringify(entry.oldId)}, and expected one.`)
      written.agents += 1
    }
    for (const entry of moving) {
      for (const key of theKeys) written.columns[key.site]! += key.statement.run(entry.newId, entry.oldId).changes
    }
    const theHolder = db.prepare('UPDATE held_keys SET whose_id = ? WHERE id = ?')
    for (const move of held.moves) written.heldKeys += theHolder.run(move.to, move.id).changes
    const heldChanged = whatElseChangedInTheHeldKeys(heldBefore, everyHeldKey(db), held.moves)
    if (heldChanged.length > 0) throw new Error(`The re-mint changed held_keys beyond the holder of each key it moved, so nothing of it was kept. ${heldChanged.join(' ')}`)
    written.plain = writeThePlainRewrites(db, plain)
    fileRegistryAliases(db, moving.map((entry) => ({ namespace: AGENT_REGISTRY_NAMESPACE, aliasId: entry.oldId, canonicalId: entry.newId })))
    written.aliases = moving.length
    const brokenAfter = theBrokenKeys(db, tables)
    if (brokenAfter.length > 0) throw new Error(`The re-mint left keys that name no row, so nothing of it was kept. ${brokenAfter.join(' ')}`)
    refuseAnOldIdLeftInAPlainColumn(db, plain)
    const named = whereAStampNamesAnyoneElse(db, stamps)
    if (named.length > 0) throw new Error(`${A_STAMP_THAT_NAMES_ANYONE_ELSE_STOPS_THE_REMINT} ${named.join(' ')}`)
    return { written, stamps, rule }
  })
  return write.immediate()
}
