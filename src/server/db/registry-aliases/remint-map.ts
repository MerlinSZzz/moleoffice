// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RE-MINT MAP: WHICH AGENTS KEEP THEIR REGISTRY ID, AND THE NEW ID EACH OTHER AGENT GETS. It only reads.
 *
 * Every agents row is read, live and retired, and its id was made in one of two ways. The mint (src/server/lib/ids.ts)
 * draws 12 of nanoid's characters. Before the registration door minted ids, every row was given its handle as its id,
 * and a handle holds only lowercase letters, digits and dashes (whyHandleIsRefused). So a row is read as:
 * - legacy, when its id is its handle;
 * - legacy, when its id could be a handle and is not 12 characters long, so the mint did not make it: the agent was
 *   renamed after its id was made;
 * - minted, when its id is 12 of the mint's characters and holds one that a handle may not hold;
 * - uncertain, otherwise. An uncertain row stops the whole map, and the refusal names it, until a person classifies it.
 * The office's own row is legacy in an office made before this change, because its id is its handle; an office made since
 * gives it an id from the mint like any other new row.
 *
 * The map keeps each minted row's id and draws a new id for each legacy row. A new id is drawn again when it could be a
 * handle, so no agent's or person's handle, live or retired, is ever given as an id, and a later reading of the registry
 * reads it as minted. It is drawn again when it is taken: when another row was given it, or when the primary key of any
 * table holds it, which covers every agent's id, every alias and every person's, record's and asset's id. Every other
 * fault refuses the whole map: a drawn id the mint could not have made, or too many taken draws for one row.
 *
 * Each entry keeps the row's handle and retired state, and a fingerprint of the whole row, so a row that changes before
 * the map is used is found. The map's digest is the digest of its entries.
 *
 * A LEGACY RESIDENT STOPS THE WHOLE MAP. A permanent resident's personal space is the folder named by its id, made when
 * it was confirmed (theSpaceOf in lib/residents.ts), and the re-mint moves no folder. So after it nothing would find a
 * legacy resident's space by the new id. Until a space is found by something the re-mint keeps, a legacy agent with
 * `resident_since` set, live or retired, is named and the map is not made, and a map made before it became a resident
 * is stopped. A minted resident keeps its id, and its space with it.
 */
import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import { urlAlphabet } from 'nanoid'
import { couldBeAHandle, isOneOfTheOfficesOwnWriters } from '@shared/participants.ts'
import { everyAgentAReferenceCouldName } from '../agent-references.ts'
import { anIdForAnAgent, beginsAsAnOfficeId } from '../ids.ts'

/** How many characters the mint draws: anOfficeId in src/server/lib/ids.ts, which a test holds this to. */
const THE_MINTS_LENGTH = 12

/** How many ids one row may be drawn before the map is refused. A random draw is taken almost never, so this is a broken generator. */
export const DRAWS_FOR_ONE_ROW = 8

export type WhereAnIdCameFrom = 'minted' | 'legacy' | 'uncertain'

export interface AnAgentsId {
  id: string
  handle: string
  retired: boolean
  from: WhereAnIdCameFrom
  because: string
}

/** Whether a string is 12 of the mint's characters. */
export function hasTheMintsCharacters(id: string): boolean {
  return id.length === THE_MINTS_LENGTH && [...id].every((character) => urlAlphabet.includes(character))
}

function whereTheIdCameFrom(id: string, handle: string): { from: WhereAnIdCameFrom; because: string } {
  if (id === handle) return { from: 'legacy', because: 'its id is its handle' }
  const handleShaped = couldBeAHandle(id)
  const mintShaped = hasTheMintsCharacters(id)
  if (mintShaped && !handleShaped) return { from: 'minted', because: "its id is 12 of the mint's characters, and a handle may not hold one of them" }
  if (handleShaped && !mintShaped) return { from: 'legacy', because: `its id could be a handle, and it is ${String(id.length)} characters long, so the mint did not make it` }
  if (handleShaped) return { from: 'uncertain', because: "its id is 12 characters that a handle may also hold, and it is not its handle, so the mint or an older handle could have made it" }
  return { from: 'uncertain', because: 'its id could not have been made by the mint or be a handle' }
}

interface AgentsRow extends Record<string, unknown> {
  id: string
  handle: string
  retired: number
}

function everyAgentsRow(db: Database.Database): AgentsRow[] {
  return db.prepare('SELECT * FROM agents ORDER BY id').all() as AgentsRow[]
}

/** The SHA-256 of the whole agents table: each row's fingerprint, in the order of the ids. */
export function theAgentsTablesFingerprint(db: Database.Database): string {
  return sha256(JSON.stringify(everyAgentsRow(db).map(fingerprintOf)))
}

/** Why a legacy resident stops the re-mint, in the words each refusal gives after the agent's id and handle. */
export const A_RESIDENT_STOPS_THE_REMINT =
  "it is a permanent resident, and its personal space is the folder named by its id, which the re-mint does not move, " +
  'so after it nothing would find the space. The re-mint waits until a resident\'s space is found by something it keeps.'

/** The refusal for a legacy row that is a resident, or null when the row is not one. The caller has read the row as legacy. */
function whyAResidentStopsTheRemint(row: AgentsRow): string | null {
  if (row['resident_since'] === null) return null
  return `The agent with id ${JSON.stringify(row.id)} and handle ${JSON.stringify(row.handle)} cannot take a new id: ${A_RESIDENT_STOPS_THE_REMINT}`
}

/** Where each agents row's id came from, in the order of the ids. */
export function whereEachAgentsIdCameFrom(db: Database.Database): AnAgentsId[] {
  return everyAgentsRow(db).map((row) => ({ id: row.id, handle: row.handle, retired: row.retired === 1, ...whereTheIdCameFrom(row.id, row.handle) }))
}

export interface RemintEntry {
  oldId: string
  newId: string
  handle: string
  retired: boolean
  from: 'minted' | 'legacy'
  /** The SHA-256 of the whole agents row, every column in the table's order. */
  fingerprint: string
}

export interface RemintMap {
  entries: RemintEntry[]
  /** The SHA-256 of the entries, in the order of their old ids. */
  digest: string
}

export type RemintPlan = { map: RemintMap } | { refused: string[] }

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')
const fingerprintOf = (row: AgentsRow) => sha256(JSON.stringify(row))
const digestOf = (entries: readonly RemintEntry[]) => sha256(JSON.stringify([...entries].sort((a, b) => (a.oldId < b.oldId ? -1 : a.oldId > b.oldId ? 1 : 0))))

/**
 * WHETHER AN ID IS TAKEN ANYWHERE IN THE STORE. Every table's primary key columns are read from the schema each time
 * this is made, so a table added later is asked with nothing edited here.
 */
function theTakenTest(db: Database.Database): (id: string) => boolean {
  const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name").all() as { name: string }[]
  const keys = tables.flatMap(({ name }) =>
    (db.prepare('SELECT name FROM pragma_table_info(?) WHERE pk > 0 ORDER BY pk').all(name) as { name: string }[]).map((column) =>
      db.prepare(`SELECT 1 FROM "${name.replaceAll('"', '""')}" WHERE "${column.name.replaceAll('"', '""')}" = ? LIMIT 1`),
    ),
  )
  return (id) => keys.some((statement) => statement.get(id) !== undefined)
}

/**
 * THE MAP, OR EVERY REASON IT CANNOT BE MADE. `draw` makes one new id; it is the mint unless a test gives another. Nothing
 * is written: the map is returned, and the caller keeps it.
 */
export function planTheRemint(db: Database.Database, draw: () => string = anIdForAnAgent): RemintPlan {
  const rows = everyAgentsRow(db)
  const uncertain = rows.flatMap((row) => {
    const read = whereTheIdCameFrom(row.id, row.handle)
    return read.from === 'uncertain' ? [`The agent with id ${JSON.stringify(row.id)} and handle ${JSON.stringify(row.handle)} cannot be classified: ${read.because}.`] : []
  })
  const residents = rows.flatMap((row) => {
    const stop = whereTheIdCameFrom(row.id, row.handle).from === 'legacy' ? whyAResidentStopsTheRemint(row) : null
    return stop === null ? [] : [stop]
  })
  const refused = [...uncertain, ...residents]
  if (refused.length > 0) return { refused }
  const taken = theTakenTest(db)
  const given = new Set<string>()
  const entries: RemintEntry[] = []
  for (const row of rows) {
    const from = whereTheIdCameFrom(row.id, row.handle).from as 'minted' | 'legacy'
    const kept = { oldId: row.id, handle: row.handle, retired: row.retired === 1, from, fingerprint: fingerprintOf(row) }
    if (from === 'minted') {
      entries.push({ ...kept, newId: row.id })
      continue
    }
    let newId: string | null = null
    for (let draws = 0; draws < DRAWS_FOR_ONE_ROW && newId === null; draws++) {
      const drawn = draw()
      if (!hasTheMintsCharacters(drawn) || !beginsAsAnOfficeId(drawn)) {
        return { refused: [`The id generator gave ${JSON.stringify(drawn)}, which is not 12 of the mint's characters beginning with a letter or a digit.`] }
      }
      if (!couldBeAHandle(drawn) && !given.has(drawn) && !taken(drawn)) newId = drawn
    }
    if (newId === null) return { refused: [`The id generator gave ${String(DRAWS_FOR_ONE_ROW)} ids for the agent with id ${JSON.stringify(row.id)}, and each was taken or could be a handle.`] }
    given.add(newId)
    entries.push({ ...kept, newId })
  }
  return { map: { entries, digest: digestOf(entries) } }
}

/**
 * EVERYTHING THAT STOPS A MAP FROM BEING USED ON THIS STORE NOW, or an empty list. A map is refused when its digest is not
 * its entries' digest, when an old or a new id appears twice, when a row was added, removed or changed since the map was
 * made, when a row is read differently now, when a legacy row is a resident, when a minted row would change or a legacy
 * row would not, or when a legacy row's new id could not have come from the mint, could be a handle, is another row's
 * old id or is taken in the store.
 */
export function whatStopsTheMap(db: Database.Database, map: RemintMap): string[] {
  const stops: string[] = []
  if (digestOf(map.entries) !== map.digest) stops.push("The map's digest is not the digest of its entries.")
  const byOld = new Map<string, RemintEntry>()
  const newIds = new Set<string>()
  for (const entry of map.entries) {
    if (byOld.has(entry.oldId)) stops.push(`The map holds the old id ${JSON.stringify(entry.oldId)} more than once.`)
    if (newIds.has(entry.newId)) stops.push(`The map gives the new id ${JSON.stringify(entry.newId)} more than once.`)
    byOld.set(entry.oldId, entry)
    newIds.add(entry.newId)
  }
  const rows = everyAgentsRow(db)
  const ids = new Set(rows.map((row) => row.id))
  const taken = theTakenTest(db)
  for (const row of rows) {
    const entry = byOld.get(row.id)
    if (entry === undefined) {
      stops.push(`The agent with id ${JSON.stringify(row.id)} is not in the map.`)
      continue
    }
    if (entry.fingerprint !== fingerprintOf(row)) stops.push(`The agent with id ${JSON.stringify(row.id)} has changed since the map was made.`)
    const from = whereTheIdCameFrom(row.id, row.handle).from
    if (from !== entry.from) stops.push(`The agent with id ${JSON.stringify(row.id)} is read as ${from} now, and the map has it as ${entry.from}.`)
    if (from === 'legacy') { const stop = whyAResidentStopsTheRemint(row); if (stop !== null) stops.push(stop) }
  }
  for (const entry of map.entries) {
    if (!ids.has(entry.oldId)) stops.push(`The map holds the old id ${JSON.stringify(entry.oldId)}, and no agent has it now.`)
    if (entry.from === 'minted' && entry.newId !== entry.oldId) stops.push(`The map gives the minted agent ${JSON.stringify(entry.oldId)} a new id.`)
    if (entry.from === 'legacy' && (!hasTheMintsCharacters(entry.newId) || !beginsAsAnOfficeId(entry.newId) || couldBeAHandle(entry.newId))) {
      stops.push(`The new id ${JSON.stringify(entry.newId)} for the agent with id ${JSON.stringify(entry.oldId)} could not have come from the mint, or could be a handle.`)
    }
    if (entry.from === 'legacy' && (entry.newId === entry.oldId || ids.has(entry.newId) || taken(entry.newId))) {
      stops.push(`The new id ${JSON.stringify(entry.newId)} for the agent with id ${JSON.stringify(entry.oldId)} is that agent's id, another agent's id, or taken in the store.`)
    }
  }
  return stops
}

/** How a stored name names its agent. A legacy agent's handle is also its id, so one name can be both. */
export type NamedBy = 'id' | 'old id' | 'live handle' | 'retired handle'

export type AStoredName =
  | { names: 'one agent'; agent: string; by: NamedBy[]; becomes: string }
  | { names: "one of the office's own writers" }
  | { names: 'no agent' }
  | { names: 'more than one agent'; agents: string[] }

/** Each agent that answers to a stored name now, by its id, an old id, its live handle or a retired handle, with how. */
export function everyAgentAStoredNameAnswersTo(db: Database.Database, stored: string): Map<string, NamedBy[]> {
  const could = everyAgentAReferenceCouldName(db, stored)
  const by = new Map<string, NamedBy[]>()
  const add = (id: string, how: NamedBy) => by.set(id, [...(by.get(id) ?? []), how])
  if (could.byId !== null) add(could.byId.id, could.byId.id === stored ? 'id' : 'old id')
  if (could.liveByHandle !== null) add(could.liveByHandle.id, 'live handle')
  for (const one of could.everyRetiredByHandle) add(one.id, 'retired handle')
  return by
}

/** The id the map gives an agent. The map must cover the registry; one that does not is a broken assumption, and it is thrown. */
export function theNewIdOf(map: RemintMap, agent: string): string {
  const entry = map.entries.find((one) => one.oldId === agent)
  if (entry === undefined) throw new Error(`The re-mint map holds no entry for the agent with id ${JSON.stringify(agent)}, so it does not cover this registry.`)
  return entry.newId
}

/**
 * WHOM ONE STORED NAME NAMES, read before the map is used: a handle or a registry id written where an agent's writing is
 * stamped or where its handle is kept. It is read by the agent's id, an old id, its live handle and every retired handle,
 * as the census reads a stamp, and it names an agent only where exactly one answers to it. `becomes` is the id the map
 * gives that agent, through theNewIdOf.
 */
export function whomAStoredNameNames(db: Database.Database, map: RemintMap, stored: string): AStoredName {
  if (isOneOfTheOfficesOwnWriters({ actorType: 'agent', actorId: stored })) return { names: "one of the office's own writers" }
  const by = everyAgentAStoredNameAnswersTo(db, stored)
  if (by.size === 0) return { names: 'no agent' }
  if (by.size > 1) return { names: 'more than one agent', agents: [...by.keys()].sort() }
  const [agent, how] = [...by][0]!
  return { names: 'one agent', agent, by: how, becomes: theNewIdOf(map, agent) }
}
