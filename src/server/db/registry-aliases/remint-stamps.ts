// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHOM EACH STAMP AND ACTOR PAIR NAMES, READ BEFORE THE RE-MINT WRITES AND AGAIN AFTER, SO A RE-MINT THAT CHANGES WHOM ONE
 * NAMES IS REFUSED WHOLE. Wave 13s round 160, item 30c part 3. writeTheRemint (remint-write.ts) asks it inside its
 * transaction, and the staged re-mint asks it again after its pass over the history (src/server/db/remint-migration.ts),
 * with what it read before the write. It only reads.
 *
 * The re-mint keeps the bytes of every stamp but a key's holder. A stamp that named an agent by its old id names it
 * through the alias after the writes, and one that named it by a handle names it by the same handle. The bytes can still
 * come to name someone else. A new id is drawn free only of the primary keys, so a stamp that named no agent can hold the
 * id an agent is given. A fault in the writes can change any of them.
 *
 * The positions are the register's stamps and actor pairs (identity-positions.ts): each field it reads as a stamp or an
 * actor pair, the stamp inside RunRequestMessage.writtenBy, the writer stamped on each revisions and changes row, and
 * each plain column read as a stamp, which is every id as sent, every mixed column and held_keys.whose_id. A value is
 * taken where the row says an agent wrote it, as the census walks the store (census.ts), before it skips the office's own
 * writers or an empty id. A registry id, a participant and a value that cannot be told are not read here.
 *
 * Before the writes, each value is read as whomAStoredNameNames (remint-map.ts) reads it. What it must name after them
 * comes from the map:
 *   - one agent: that agent under the id the map gives it, and no other agent;
 *   - no agent: no agent;
 *   - more than one agent: those agents, each under the id the map gives it, and no other;
 *   - one of the office's own writers: one of the office's own writers.
 * After the writes, each value is read again, by every agent that answers to it then. The two readings are compared
 * position by position. A position is its table, its row, its path and its register entry. A row of agents is matched by
 * the id the map gives it, because the re-mint changes that row's id. Any other row is matched by the name the planned
 * rewrites give it, because the census names some rows by a column the plain step rewrites: a restart grant by its
 * agent, a notice turn by its recipient and a reading place by its reader (theRowsTheRewritesRename). A position whose
 * value names anyone else is named with its row. So is a position read before the writes and not after, or after and not
 * before.
 *
 * It reads the whole store twice, inside the re-mint's transaction, and how long that takes on a real store has not been
 * measured.
 *
 * AFTER THE PASS, A PATH IS READ WITH ITS OLD-ID KEYS RENAMED. The pass renames a key of a map that is a legacy agent's old
 * id to its new id, so a position under such a key has another path after it. thePathAfterTheRemint gives that path, and
 * the check after the pass compares each position before by it. No record the register accepts can hold a stamp or an
 * actor pair under a key that is an old id: only session.workerRuns and the forest map's assignments
 * (ForestMapState.assignments) read an object's keys as agent ids, no shape reachable from either holds a stamp or an
 * actor pair, and castingRoll is an open bag that is only checked (historical-reader.ts 405-409). So the stamp check's
 * use of the mapping has no case. The re-mint verifier's registry-ids check uses the same mapping, and its test proves it
 * with a session's worker runs keyed by a legacy agent's old id. A key that holds an old id where the pass did not rename
 * it would be named as a position read before and not after, and that stops the re-mint.
 */
import type Database from 'better-sqlite3'
import { isOneOfTheOfficesOwnWriters } from '@shared/participants.ts'
import { IDENTITY_CENSUS_TABLES, takeIdentityCensus, theRowNamed, type AStampAt } from './census.ts'
import { pathStep } from '@shared/fielddiff.ts'
import { everyAgentAStoredNameAnswersTo, theNewIdOf, whomAStoredNameNames, type RemintMap } from './remint-map.ts'

/** How the refusal of a re-mint that changed whom a stamp or an actor pair names begins. */
export const A_STAMP_THAT_NAMES_ANYONE_ELSE_STOPS_THE_REMINT = 'The re-mint changed whom a stamp or an actor pair names, so nothing of it was kept.'

/** The table whose rows are named by the id the re-mint changes. */
const THE_REGISTRY = 'agents'

/** Whom a value names: one of the office's own writers, or each agent that answers to it, by its id, in order. */
export type Whom = { office: true } | { agents: string[] }

export interface WhomItMustName {
  /** The value and its position, as the census read them before the writes, with its row named as it is after them. */
  at: AStampAt
  /** Whom it must name after the writes. */
  must: Whom
}

/** Every value at a stamp or an actor pair, with its position, as the census reads the store now. */
function everyStampAndActorPair(db: Database.Database): AStampAt[] {
  const stamps: AStampAt[] = []
  takeIdentityCensus(db, undefined, stamps)
  return stamps
}

function whomItMustName(db: Database.Database, map: RemintMap, stored: string): Whom {
  const name = whomAStoredNameNames(db, map, stored)
  if (name.names === "one of the office's own writers") return { office: true }
  if (name.names === 'no agent') return { agents: [] }
  if (name.names === 'one agent') return { agents: [name.becomes] }
  return { agents: name.agents.map((agent) => theNewIdOf(map, agent)).sort() }
}

function whomItNamesNow(db: Database.Database, stored: string): Whom {
  if (isOneOfTheOfficesOwnWriters({ actorType: 'agent', actorId: stored })) return { office: true }
  return { agents: [...everyAgentAStoredNameAnswersTo(db, stored).keys()].sort() }
}

const inWords = (whom: Whom): string =>
  'office' in whom ? "one of the office's own writers" : whom.agents.length === 0 ? 'no agent' : whom.agents.map((agent) => `the agent ${JSON.stringify(agent)}`).join(' or ')

const where = (at: AStampAt): string => `${at.table} row ${JSON.stringify(at.row)}, ${at.path} (${at.site})`
const positionOf = (at: AStampAt): string => JSON.stringify([at.table, at.row, at.path, at.site])

/** The items of a list by the position each names, in the list's order. */
function byPosition<T>(items: readonly T[], at: (item: T) => AStampAt): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  for (const item of items) {
    const position = positionOf(at(item))
    const held = grouped.get(position)
    if (held === undefined) grouped.set(position, [item])
    else held.push(item)
  }
  return grouped
}

/** One step of a path as the identity reader writes it: its first name, `.key`, `["key"]` or `[index]`. */
const A_STEP = /^(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[("(?:[^"\\]|\\.)*")\]|\[(\d+)\])/u

/**
 * THE PATH A POSITION HAS AFTER THE PASS: `path` with each key that is a legacy agent's old id, a key of `newIds`, renamed
 * to its new id, written back by pathStep as the reader writes it. An index of a list is not a key and is kept. It throws
 * on a path the reader does not write, rather than compare it as it is.
 */
export function thePathAfterTheRemint(path: string, newIds: ReadonlyMap<string, string>): string {
  const first = /^[^.[]+/u.exec(path)?.[0] ?? ''
  let after = first
  let rest = path.slice(first.length)
  while (rest.length > 0) {
    const step = A_STEP.exec(rest)
    if (step === null) throw new Error(`The path ${JSON.stringify(path)} is not one the identity reader writes, so the position after the re-mint cannot be read from it.`)
    const key = step[1] ?? (step[2] === undefined ? undefined : (JSON.parse(step[2]) as string))
    after = key === undefined ? `${after}[${step[3]!}]` : pathStep(after, newIds.get(key) ?? key)
    rest = rest.slice(step[0].length)
  }
  return after
}

/** One value a planned rewrite gives a column: its table, a dot and the column, its row by rowid, and the value. */
export interface ARowRewrite {
  site: string
  rowid: number
  to: string
}

/**
 * THE NAME EACH ROW HAS AFTER THE WRITES, read in `db` before them. The census names a row by the columns that key it
 * (census.ts). Where `rewrites` gives one of those columns a new value, the row's name after is worked out from them;
 * every other row keeps its name. A row of agents is not named here: its id is the map's.
 */
export function theRowsTheRewritesRename(db: Database.Database, rewrites: readonly ARowRewrite[]): (table: string, row: string) => string {
  const keys = new Map(IDENTITY_CENSUS_TABLES.map((one) => [one.table, one.key]))
  const rows = new Map<string, { table: string; rowid: number; given: Map<string, string> }>()
  for (const one of rewrites) {
    const dot = one.site.indexOf('.')
    const table = one.site.slice(0, dot)
    const column = one.site.slice(dot + 1)
    if (!(keys.get(table) ?? []).includes(column)) continue
    const at = JSON.stringify([table, one.rowid])
    const row = rows.get(at) ?? { table, rowid: one.rowid, given: new Map<string, string>() }
    row.given.set(column, one.to)
    rows.set(at, row)
  }
  const renamed = new Map<string, string>()
  for (const { table, rowid, given } of rows.values()) {
    const key = keys.get(table)!
    const before = db.prepare(`SELECT ${key.map((column) => `"${column}"`).join(', ')} FROM "${table}" WHERE rowid = ?`).raw().get(rowid) as unknown[] | undefined
    if (before === undefined) throw new Error(`A planned rewrite names the row of ${table} with rowid ${String(rowid)}, and no such row is there.`)
    renamed.set(JSON.stringify([table, theRowNamed(before)]), theRowNamed(key.map((column, i) => given.get(column) ?? before[i])))
  }
  return (table, row) => renamed.get(JSON.stringify([table, row])) ?? row
}

/**
 * BEFORE THE WRITES: each value at a stamp or an actor pair, and whom it must name after them. `rowAfter` gives the name a
 * row other than an agent's has after the writes (theRowsTheRewritesRename). Given none, each such row keeps its name,
 * which holds only where no planned rewrite changes a column the census names a row by; where one does, the check after
 * the writes names that row.
 */
export function whomEachStampMustName(db: Database.Database, map: RemintMap, rowAfter = (_table: string, row: string): string => row): WhomItMustName[] {
  const must = new Map<string, Whom>()
  return everyStampAndActorPair(db).map((at) => {
    const whom = must.get(at.stored) ?? whomItMustName(db, map, at.stored)
    must.set(at.stored, whom)
    return { at: at.table === THE_REGISTRY ? { ...at, row: theNewIdOf(map, at.row) } : { ...at, row: rowAfter(at.table, at.row) }, must: whom }
  })
}

/**
 * AFTER THE WRITES: each value at a stamp or an actor pair that names anyone but whom it must, in words, with its position
 * and its row, and each position read before the writes and not after, or after and not before. Empty when there is none.
 * Given `newIds`, after the pass over the history, a position before is compared by its path after the pass.
 */
export function whereAStampNamesAnyoneElse(db: Database.Database, before: readonly WhomItMustName[], newIds?: ReadonlyMap<string, string>): string[] {
  const was = byPosition(before, (one) => (newIds === undefined ? one.at : { ...one.at, path: thePathAfterTheRemint(one.at.path, newIds) }))
  const now = byPosition(everyStampAndActorPair(db), (at) => at)
  const names = new Map<string, Whom>()
  const said: string[] = []
  for (const [position, them] of was) {
    const read = now.get(position) ?? []
    for (const [i, one] of them.entries()) {
      const it = read[i]
      if (it === undefined) {
        said.push(`${where(one.at)}: it held ${JSON.stringify(one.at.stored)}, and nothing is read there now.`)
        continue
      }
      const whom = names.get(it.stored) ?? whomItNamesNow(db, it.stored)
      names.set(it.stored, whom)
      if (JSON.stringify(whom) !== JSON.stringify(one.must)) {
        said.push(`${where(it)}: it held ${JSON.stringify(one.at.stored)}, so it must name ${inWords(one.must)}, and it holds ${JSON.stringify(it.stored)}, which names ${inWords(whom)}.`)
      }
    }
    for (const it of read.slice(them.length)) said.push(`${where(it)}: it holds ${JSON.stringify(it.stored)}, and nothing was read there before the writes.`)
  }
  for (const [position, read] of now) {
    if (!was.has(position)) for (const it of read) said.push(`${where(it)}: it holds ${JSON.stringify(it.stored)}, and nothing was read there before the writes.`)
  }
  return said
}
