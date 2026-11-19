// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RE-MINT'S PASS OVER THE HISTORY: EVERY OLD ID THE LEDGER HOLDS, REWRITTEN IN PIN ORDER, AND EVERY PIN AND SEAL
 * OVER WHAT IT CHANGED, REMADE. Wave 13s round 257, pieces 3b and 3c of the re-mint. The staged re-mint calls it inside its
 * own transaction (./remint-migration.ts, applyTheStagedRemint), after its write of the agents.
 *
 * A legacy agent's id is its handle, and the re-mint gives it a new one. The history still holds the old id: in a
 * revision's data, in its writer, in the key that proved the writer, in a link's writer and in the change rows. A
 * revision's content hash is over its content, a pin names a revision by its seq and that hash, a seal pins a revision
 * row and a link row by the sha256 of the row, and a merge entry or a run pins a seal by the seal's own hash. So one
 * rewritten id moves a content hash, every pin to it, every seal over its row, and every pin of that seal's own hash.
 *
 * WHICH RULE A POSITION TAKES. The positions are the identity reader's (lib/registry-aliases/historical-reader.ts), and
 * no second list of them is kept here. A position that always holds a registry id, a participant's id, a map's key, an
 * id written inside a string, an older written form and an actor pair each take the new id of the old id they hold,
 * from `newIds`. A stamp, a position that cannot be told, revisions.actor_id and links.created_by hold what was sent, so
 * each takes `underTheRule`, and only where the column beside it says an agent wrote it. A null from the rule keeps the
 * value as it was typed. An id written inside a string is remade as its writer writes it, by THE_STRINGS_THE_PASS_REMAKES:
 * the dead-letter key and a map's group key take the new id, and the writer of a run request's message takes the rule,
 * because it holds the writer's stamp. whatAPositionTakes decides each position from the reader's parse of it and its
 * site, and it is the one place that says so.
 *
 * THE STORED VALUES. The same reading and the same rules rewrite the JSON columns outside the ledgers that the identity
 * reader reads (STORED_COLUMNS in ./registry-aliases/open-shapes.ts): planTheStoredValues works out each new value, and
 * rewriteTheStoredValues writes them. No seal or pin reads those tables, so nothing else is remade over them.
 *
 * THE PINS are the migration's own readers: thePinsARecordHolds, theContextsPin and thePinsASealHolds. A pin of a seal's
 * own hash is found by walking the declared types for the shape a seal is read by, and by one field listed by hand.
 *
 * THE ORDER. Each revision is remade after every revision it pins, starting from rowid order: a record pin names one by
 * its record and seq, a seal pin by its row id, and a pin of a seal's own hash names the seal's revision that holds that
 * hash. A cycle refuses the whole pass. Every refusal is made before the first write, so a refused pass writes nothing.
 *
 * The pass runs only inside its caller's transaction, with the two guards of a sealed tip lifted by
 * liftTheSealedTipGuards and made again by makeTheGuardsAgain. It files nothing: it returns the kept-list rows without a
 * generation, the ids of the rows it changed, its counts, and two lists of what it kept and why. Its caller files the
 * kept lists under the generation.
 */
import type Database from 'better-sqlite3'
import { pathStep, stepsOfPath } from '../../shared/fielddiff.ts'
import { KIND_SPECS, type DeclaredType } from '../../shared/kinds.ts'
import { aDeadLetterKey } from './dead-letter-key.ts'
import {
  aTypeAndId,
  BLOCK_REASONS,
  readChangeIdentities,
  readRecordIdentities,
  readStoredColumn,
  theKindAChangeIsReadBy,
  type AStampOrActorPair,
  type BlockReason,
  type IdentityReading,
} from './registry-aliases/historical-reader.ts'
import { LEDGER_STAMPS, PLAIN_ID_COLUMNS, thePositionAt, type PositionParse } from './registry-aliases/identity-positions.ts'
import type { TheRemintRule } from './registry-aliases/remint-plain.ts'
import { DATA_OF_A_KIND, OPEN_BAGS, STORED_COLUMNS, theShapeNamed, typeOf } from './registry-aliases/open-shapes.ts'
import {
  sealHash,
  THE_COLUMNS_A_LINK_IS_HASHED_BY,
  THE_LISTS_OF_REVISION_COLUMNS,
  THE_REVISION_COLUMNS_NOW,
  theHashOfARow,
  theListARevisionRowHashesUnder,
} from './the-hash-a-seal-pins-a-row-by.ts'
import { contentOf, partHashOf, versionOf } from './version.ts'
import { wholeRevisionData } from './revision-stored-once.ts'
import { A_REVISIONS_TABLE_THE_LISTS_DO_NOT_NAME_STOPS_THE_REMINT, theContextsPin, thePinsARecordHolds, thePinsASealHolds, type AKeptListRow, type AStoredPin } from './remint-migration.ts'

type Row = Record<string, unknown>
const isPlain = (one: unknown): one is Row => typeof one === 'object' && one !== null && !Array.isArray(one)

/** How the refusal of a pass outside a transaction begins. */
export const THE_PASS_RUNS_ONLY_INSIDE_A_TRANSACTION =
  'The pass over the history runs only inside a transaction its caller opened, so that a refusal part of the way through leaves nothing written.'

/** How the refusal of a missing guard begins. */
export const A_MISSING_GUARD_STOPS_THE_PASS =
  'The pass lifts the two guards of a sealed tip and makes them again from their own text, so it stops when one of them is not there to lift.'

/** How the refusal of revisions that pin each other begins. */
export const A_CYCLE_OF_PINS_STOPS_THE_PASS = 'The pass remakes a revision only after every revision it pins, so it stops on revisions that pin each other in a cycle.'

/** How the refusal of a record whose data is not its newest revision's begins. */
export const A_RECORD_WHOSE_DATA_IS_NOT_ITS_NEWEST_REVISION_STOPS_THE_PASS =
  "The pass makes each record's data its newest revision's data again, so it stops on a record whose data is not its newest revision's now."

/** How the refusal of a content hash or a seal's own hash that was already wrong begins. */
export const A_HASH_ALREADY_WRONG_STOPS_THE_PASS =
  "The pass remakes a content hash or a seal's own hash only over one that was right, so it stops on a hash that is not the hash of what it is stored with."

/** How the refusal of a value whose stored text is not the JSON of what it holds begins. */
export const A_VALUE_THAT_IS_NOT_ITS_OWN_JSON_STOPS_THE_PASS =
  'The pass writes a changed value back as the JSON of what it read, so it stops on a value that must change and whose stored text is not that JSON.'

/** How the refusal of a place that does not hold what the identity reader found there begins. */
export const A_PLACE_THE_PASS_CANNOT_REWRITE_STOPS_THE_PASS =
  'The pass rewrites an id only where the identity reader placed it, so it stops where that place does not hold what the reader found, or where a new key would meet a key already there.'

/** How the refusal of a sealed tip the pass would change with its guard still standing begins. */
export const A_STANDING_GUARD_STOPS_THE_PASS = 'The pass changes a sealed tip only with its guards lifted, so it stops when the guard against an update still stands.'

const NOTHING_WAS_WRITTEN = 'Nothing was written.'

/** The two triggers that keep a sealed tip as it was sealed. The search text triggers are not among them. */
export const THE_SEALED_TIP_GUARDS = ['sealed_tip_no_update', 'sealed_tip_no_delete'] as const

/** A guard as it was lifted: its name and the text that makes it. */
export interface ALiftedGuard {
  name: string
  sql: string
}

/** Read the text of both guards of a sealed tip, drop them, and give the text back. It refuses, lifting neither, when one is missing. */
export function liftTheSealedTipGuards(sqlite: Database.Database): ALiftedGuard[] {
  const read = sqlite.prepare("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?").pluck()
  const held = THE_SEALED_TIP_GUARDS.map((name) => ({ name, sql: read.get(name) as string | null | undefined }))
  const missing = held.filter((one) => typeof one.sql !== 'string').map((one) => one.name)
  if (missing.length > 0) throw new Error(`${A_MISSING_GUARD_STOPS_THE_PASS} This store has no trigger named ${missing.join(' or ')}. Neither guard was lifted.`)
  const lifted = held.map((one) => ({ name: one.name, sql: String(one.sql) }))
  for (const one of lifted) sqlite.exec('DROP TRIGGER ' + one.name)
  return lifted
}

/** Make the lifted guards again from exactly the text they were read with. */
export function makeTheGuardsAgain(sqlite: Database.Database, lifted: readonly ALiftedGuard[]): void {
  for (const one of lifted) sqlite.exec(one.sql)
}

// ---------------------------------------------------------------------------------------------------------------------
// A pin of a seal's own hash
// ---------------------------------------------------------------------------------------------------------------------

/** The shape a run reads a seal by, and its two fields: the seal's record id and the seal's own hash. */
const THE_SHAPE_A_SEAL_IS_READ_BY = 'WhatWasRead'
const BY_THE_SEAL = { id: 'sealId', hash: 'sealHash' } as const
{
  const keys = theShapeNamed(THE_SHAPE_A_SEAL_IS_READ_BY)?.fields.map((one) => one.key) ?? []
  if (!keys.includes(BY_THE_SEAL.id) || !keys.includes(BY_THE_SEAL.hash)) {
    throw new Error(`The re-mint finds a pin of a seal's own hash by the shape ${THE_SHAPE_A_SEAL_IS_READ_BY}, with ${BY_THE_SEAL.id} and ${BY_THE_SEAL.hash}, and kinds.ts no longer declares it so.`)
  }
}

/** The fields that pin a seal's own hash and that no walk of the declared types finds, each with why. */
const SEAL_HASH_PINS_LISTED_BY_HAND: readonly { kind: string; field: string; id: string; hash: string; because: string }[] = [
  {
    kind: 'merge_entry',
    field: 'seal',
    id: 'id',
    hash: 'hash',
    because: 'kinds.ts declares the seal of a merge entry as Record<string, unknown> (line 9315), so no walk of the declared types finds it.',
  },
]

/** An object that pins a seal's own hash, and the keys it holds the seal's id and hash in. */
interface ASealHashPin {
  holder: Row
  id: string
  hash: string
}

/** Every object in one record's data, of `kind`, that pins a seal's own hash: by the declared types, and by the list above. */
function theSealHashPinsIn(kind: string, data: unknown): ASealHashPin[] {
  const found = new Map<Row, ASealHashPin>()
  const walkAKind = (of: string, value: unknown) => {
    const spec = Object.hasOwn(KIND_SPECS, of) ? KIND_SPECS[of as keyof typeof KIND_SPECS] : undefined
    if (spec === undefined || !isPlain(value)) return
    for (const field of spec.fields) {
      if (Object.hasOwn(value, field.key)) walk(typeOf(field.type), value[field.key], of + '.' + field.key)
    }
  }
  const walkAShape = (name: string, value: unknown) => {
    if (!isPlain(value)) return
    if (name === THE_SHAPE_A_SEAL_IS_READ_BY) {
      found.set(value, { holder: value, ...BY_THE_SEAL })
      return
    }
    const shape = theShapeNamed(name)
    if (shape === undefined) throw new Error(`A declared type names ${name}, and neither kinds.ts nor open-shapes.ts declares a shape by that name.`)
    if (shape.discriminator) {
      const tag = value[shape.discriminator.key]
      const variant = typeof tag === 'string' && Object.hasOwn(shape.discriminator.variants, tag) ? shape.discriminator.variants[tag] : undefined
      if (variant !== undefined) walkAShape(variant, value)
      return
    }
    for (const field of shape.fields) {
      if (!Object.hasOwn(value, field.key)) continue
      const site = name + '.' + field.key
      const held = DATA_OF_A_KIND[site]
      if (held === undefined) walk(typeOf(field.type), value[field.key], site)
      else if (typeof value[held.kindIn] === 'string') walkAKind(String(value[held.kindIn]), value[field.key])
    }
  }
  const walk = (node: DeclaredType, value: unknown, site: string): void => {
    switch (node.kind) {
      case 'array':
        if (Array.isArray(value)) for (const one of value) walk(node.of, one, site)
        return
      case 'record':
        if (isPlain(value)) for (const one of Object.values(value)) walk(node.of, one, site)
        return
      case 'open': {
        const bag = OPEN_BAGS[site]
        if (isPlain(value) && bag?.reads === 'type') walk(typeOf(bag.type), value, site)
        return
      }
      case 'shape':
        return walkAShape(node.name, value)
      case 'either':
        for (const option of node.options) walk(option.node, value, site)
        return
      default:
        return
    }
  }
  walkAKind(kind, data)
  if (isPlain(data)) {
    for (const one of SEAL_HASH_PINS_LISTED_BY_HAND) {
      const holder = one.kind === kind ? data[one.field] : undefined
      if (isPlain(holder)) found.set(holder, { holder, id: one.id, hash: one.hash })
    }
  }
  return [...found.values()]
}

/** Every object below `value` that pins a seal's own hash by either pair of keys, for a value the pass cannot place. */
function everySealHashPinBelow(value: unknown, path: string, out: { path: string; pin: ASealHashPin }[] = []): { path: string; pin: ASealHashPin }[] {
  if (Array.isArray(value)) value.forEach((one, at) => everySealHashPinBelow(one, `${path}[${String(at)}]`, out))
  if (!isPlain(value)) return out
  for (const keys of [BY_THE_SEAL, ...SEAL_HASH_PINS_LISTED_BY_HAND]) {
    if (typeof value[keys.id] === 'string' && typeof value[keys.hash] === 'string') out.push({ path, pin: { holder: value, id: keys.id, hash: keys.hash } })
  }
  for (const [key, one] of Object.entries(value)) everySealHashPinBelow(one, pathStep(path, key), out)
  return out
}

// ---------------------------------------------------------------------------------------------------------------------
// Rewriting the ids in one value, where the identity reader found them
// ---------------------------------------------------------------------------------------------------------------------

/** What a position takes: the new id of the old id it holds, what the rule gives what it holds, or nothing. */
export type WhatAPositionTakes = 'the-new-id' | 'the-rule' | 'as-typed'

/**
 * An id written inside a string, as its writer writes it: the rule it takes, the id the string holds, and the string
 * with another id in that id's place, or null when the string is not written as its writer writes it.
 */
interface AStringThePassRemakes {
  takes: 'the-new-id' | 'the-rule'
  idIn: (value: string) => string | null
  withId: (value: string, id: string) => string | null
}

/** The JSON list a string holds, or null. */
function aListIn(value: string): unknown[] | null {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** A map's group key: the JSON list of the project, the zone and the team's registry id, as the map's writer writes it. */
const A_GROUP_KEY: AStringThePassRemakes = {
  takes: 'the-new-id',
  idIn: (value) => {
    const team = aListIn(value)?.[2]
    return typeof team === 'string' ? team : null
  },
  withId: (value, id) => {
    const parsed = aListIn(value)
    return parsed !== null && JSON.stringify(parsed) === value ? JSON.stringify([parsed[0], parsed[1], id]) : null
  },
}

/**
 * EVERY ID WRITTEN INSIDE A STRING THAT THE PASS REMAKES, by its site. The dead-letter key and a map's group key hold a
 * registry id, so each takes the new id. A run request's writer holds the writer's stamp, so it takes the rule.
 */
const THE_STRINGS_THE_PASS_REMAKES: Readonly<Record<string, AStringThePassRemakes>> = {
  'message.deadLetterSweep': {
    takes: 'the-new-id',
    idIn: (value) => {
      const parts = value.split('~')
      return parts.length === 2 ? parts[1]! : null
    },
    withId: (value, id) => aDeadLetterKey(value.split('~')[0]!, id),
  },
  'RunRequestMessage.writtenBy': {
    takes: 'the-rule',
    idIn: (value) => {
      const writer = aTypeAndId(value)
      return writer?.type === 'agent' ? writer.id : null
    },
    withId: (value, id) => {
      const writer = aTypeAndId(value)
      return writer === null ? null : `${writer.type}:${id}`
    },
  },
  'ForestRegion.groupKey': A_GROUP_KEY,
  'ForestAssignment.groupKey': A_GROUP_KEY,
}
const theStringRemadeAt = (site: string): AStringThePassRemakes | null => (Object.hasOwn(THE_STRINGS_THE_PASS_REMAKES, site) ? THE_STRINGS_THE_PASS_REMAKES[site]! : null)

/**
 * WHICH RULE A POSITION TAKES, by the identity reader's parse of it and its site. A stamp and a position that cannot be
 * told hold what was sent, so each takes the rule. An id written inside a string takes the rule its writer's entry in
 * THE_STRINGS_THE_PASS_REMAKES names, and one that has no entry there is kept as it was typed. Every other position takes
 * the new id. The pass decides each position by it, and the re-mint verifier's rows check works out the history by the
 * pass's own plan (./remint-verification.ts), so the two cannot take different rules.
 */
export function whatAPositionTakes(parse: PositionParse, site: string): WhatAPositionTakes {
  if (parse === 'stamp' || parse === 'cannot-tell') return 'the-rule'
  if (parse === 'encoded') return theStringRemadeAt(site)?.takes ?? 'as-typed'
  return 'the-new-id'
}

/** Where one value sits: the object or list that holds it, and its key there. */
interface APlace {
  holder: Row | unknown[]
  key: string | number
}
const valueAt = (place: APlace): unknown => (place.holder as Record<string | number, unknown>)[place.key]
const putAt = (place: APlace, value: unknown): void => {
  ;(place.holder as Record<string | number, unknown>)[place.key] = value
}

/** What the pass counted in the values of one table. */
interface ATally {
  rewritten: number
  keptAsTyped: number
  namingNoOldId: number
  partsLeft: number
  blocks: Record<BlockReason, number>
}
const aCountOfEachReason = (): Record<BlockReason, number> => Object.fromEntries(BLOCK_REASONS.map((reason) => [reason, 0])) as Record<BlockReason, number>

/**
 * Rewrite every id the identity reader found in `box[key]`, whose path is `root`, by the rule each position takes, and
 * count each one. A key is renamed last, in its place among the keys around it. `where` names the row in a refusal.
 */
function rewriteTheIds(box: Row, key: string, root: string, reading: IdentityReading, told: readonly AStampOrActorPair[], rule: TheRemintRule, tally: ATally, where: string): void {
  const places = new Map<string, APlace>()
  const cannot = (what: string): Error => new Error(`${A_PLACE_THE_PASS_CANNOT_REWRITE_STOPS_THE_PASS} ${where}: ${what}. ${NOTHING_WAS_WRITTEN}`)
  const put = (path: string, place: APlace) => {
    if (places.has(path)) throw cannot(`two places in one value are both written ${path}`)
    places.set(path, place)
  }
  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((one, at) => {
        put(`${path}[${String(at)}]`, { holder: value, key: at })
        walk(one, `${path}[${String(at)}]`)
      })
    } else if (isPlain(value)) {
      for (const [name, one] of Object.entries(value)) {
        put(pathStep(path, name), { holder: value, key: name })
        walk(one, pathStep(path, name))
      }
    }
  }
  put(root, { holder: box, key })
  walk(box[key], root)
  const placeOf = (path: string): APlace => {
    const place = places.get(path)
    if (place === undefined) throw cannot(`nothing is at ${path}, where the identity reader read a value`)
    return place
  }
  const takeTheRule = (place: APlace, stored: string, written = (next: string): string => next) => {
    const next = rule.underTheRule(stored)
    if (next === null || next === stored) {
      tally.keptAsTyped += 1
      return
    }
    putAt(place, written(next))
    tally.rewritten += 1
  }
  /** The string at `path` with `id` in place of the id inside it, written as its writer writes it, or a refusal. */
  const theStringWith = (remade: AStringThePassRemakes, value: string, id: string, path: string): string => {
    const next = remade.withId(value, id)
    if (next === null) throw cannot(`${path} is not written as its writer writes it, so the pass cannot write it again`)
    return next
  }

  // A stamp holds what was sent. It takes the rule once, whether or not one agent answers to it.
  const stamps = new Map<string, { stored: string; site: string }>()
  const encoded = new Set<string>()
  const aStamp = (path: string, stored: string, site: string) => {
    if (stamps.has(path) && stamps.get(path)?.stored !== stored) throw cannot(`the identity reader read two stamps at ${path}`)
    stamps.set(path, { stored, site })
  }
  for (const one of told) {
    const parse = thePositionAt(one.site)?.parse
    const takes = parse === undefined ? null : whatAPositionTakes(parse, one.site)
    if (takes === 'the-rule') aStamp(one.path, one.stored, one.site)
    else if (takes === 'as-typed') encoded.add(one.path)
  }
  for (const one of reading.found) if (whatAPositionTakes(one.parse, one.site) === 'the-rule') aStamp(one.path, one.stored, one.site)
  for (const [path, { stored, site }] of stamps) {
    const place = placeOf(path)
    const value = valueAt(place)
    // A stamp written inside a string, a run request's writer, is the id inside it, and is written back as its writer writes it.
    const remade = thePositionAt(site)?.parse === 'encoded' ? theStringRemadeAt(site) : null
    if (remade === null) {
      if (value !== stored) throw cannot(`${path} does not hold the stamp the identity reader read there`)
      takeTheRule(place, stored)
      continue
    }
    if (typeof value !== 'string' || remade.idIn(value) !== stored) throw cannot(`${path} does not hold, written as its writer writes it, the stamp the identity reader read there`)
    takeTheRule(place, stored, (next) => theStringWith(remade, value, next, path))
  }

  const renames = new Map<Row, Map<string, string>>()
  const seen = new Map<string, string>()
  for (const one of reading.found) {
    const takes = whatAPositionTakes(one.parse, one.site)
    if (takes === 'the-rule') continue
    const again = JSON.stringify([one.as, one.stored, one.site])
    if (seen.has(one.path)) {
      if (seen.get(one.path) !== again) throw cannot(`the identity reader found two different ids at ${one.path}`)
      continue
    }
    seen.set(one.path, again)
    const place = placeOf(one.path)
    if (takes === 'as-typed') {
      tally.partsLeft += 1
      continue
    }
    const next = rule.newIds.get(one.stored)
    if (one.as === 'key') {
      if (!isPlain(place.holder) || place.key !== one.stored) throw cannot(`${one.path} is not the key the identity reader found`)
      if (next === undefined) {
        tally.namingNoOldId += 1
        continue
      }
      const held = renames.get(place.holder) ?? new Map<string, string>()
      held.set(one.stored, next)
      renames.set(place.holder, held)
      continue
    }
    if (one.as === 'part') {
      const value = valueAt(place)
      const remade = theStringRemadeAt(one.site)
      if (remade === null || typeof value !== 'string' || remade.idIn(value) !== one.stored) throw cannot(`${one.path} does not hold, written as its writer writes it, the id the identity reader found there`)
      if (next === undefined) {
        tally.namingNoOldId += 1
        continue
      }
      putAt(place, theStringWith(remade, value, next, one.path))
      tally.rewritten += 1
      continue
    }
    if (valueAt(place) !== one.stored) throw cannot(`${one.path} does not hold the id the identity reader found there`)
    if (next === undefined) {
      tally.namingNoOldId += 1
      continue
    }
    putAt(place, next)
    tally.rewritten += 1
  }

  // A position that cannot be told holds what was sent, so it takes the rule. Every other block is only counted.
  const toldOnce = new Set<string>()
  for (const one of reading.blocks) {
    tally.blocks[one.reason] += 1
    if (one.reason !== 'cannot-tell' || stamps.has(one.path) || toldOnce.has(one.path)) continue
    toldOnce.add(one.path)
    if (encoded.has(one.path)) {
      tally.partsLeft += 1
      continue
    }
    const place = placeOf(one.path)
    const value = valueAt(place)
    if (typeof value !== 'string') throw cannot(`${one.path} cannot be told and is not a string`)
    takeTheRule(place, value)
  }

  // A key is renamed in its place: every key of its object is put back in the order it had.
  for (const [holder, names] of renames) {
    const entries = Object.entries(holder).map(([name, value]) => ({ name: names.get(name) ?? name, value }))
    if (new Set(entries.map((one) => one.name)).size !== entries.length) throw cannot(`a renamed key would meet a key already there, among ${Object.keys(holder).join(', ')}`)
    for (const name of Object.keys(holder)) delete holder[name]
    for (const one of entries) holder[one.name] = one.value
    if (JSON.stringify(Object.keys(holder)) !== JSON.stringify(entries.map((one) => one.name))) throw cannot(`the keys ${entries.map((one) => one.name).join(', ')} do not keep their order`)
  }
}

/** The parse of a stored JSON text, or a refusal naming the row. */
function parseTheText(text: string, where: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error(`${A_VALUE_THAT_IS_NOT_ITS_OWN_JSON_STOPS_THE_PASS} ${where} is not JSON. ${NOTHING_WAS_WRITTEN}`)
  }
}

/** The text a changed value is written back as: the JSON of the value, where the stored text was the JSON of what was read. */
function theTextOf(value: unknown, read: unknown, stored: string, where: string): string {
  if (JSON.stringify(read) !== stored) throw new Error(`${A_VALUE_THAT_IS_NOT_ITS_OWN_JSON_STOPS_THE_PASS} ${where} must change, and its stored text is not the JSON of what it holds. ${NOTHING_WAS_WRITTEN}`)
  return JSON.stringify(value)
}

/** Every object in a value by the path the pin readers write: `[i]` for a list's entry and `.key` for an object's. */
function theObjectsByPinPath(value: unknown, path: string, out = new Map<string, Row[]>()): Map<string, Row[]> {
  if (Array.isArray(value)) value.forEach((one, at) => theObjectsByPinPath(one, `${path}[${String(at)}]`, out))
  if (!isPlain(value)) return out
  out.set(path, [...(out.get(path) ?? []), value])
  for (const [key, one] of Object.entries(value)) theObjectsByPinPath(one, `${path}.${key}`, out)
  return out
}

// ---------------------------------------------------------------------------------------------------------------------
// The pass
// ---------------------------------------------------------------------------------------------------------------------

/** A change row's field the pass kept as it was, and why. */
export interface AKeptChangeField {
  changeId: string
  field: string
  why: string
}

/** A pin of a seal's own hash in a change value the pass could not place from the change's field, kept as it was. */
export interface AKeptSealHashPin {
  changeId: string
  field: string | null
  column: 'old_value' | 'new_value'
  path: string
  sealId: string
  hash: string
  why: string
}

/** What the pass counted. */
export interface WhatThePassCounted {
  linksRewritten: number
  revisionsRewritten: number
  recordsRewritten: number
  recordsWithNoRevision: number
  changesRewritten: number
  agentMessagesRewritten: number
  reviewsRewritten: number
  /** In revisions and links: values rewritten, kept as typed by the rule, holding an id that is not an old one, and ids inside strings left. */
  positionsRewritten: number
  positionsKeptAsTyped: number
  positionsNamingNoOldId: number
  partsLeft: number
  /** Every block the identity reader returned in revisions, by its reason. */
  blocks: Record<BlockReason, number>
  /** Record pins in revisions, thread messages and reviews: remade, and those that did not hold, which are kept. */
  pinsRemade: number
  pinsThatDidNotHold: number
  sealPinsRemade: number
  sealPinsThatDidNotHold: number
  linkPinsRemade: number
  linkPinsThatDidNotHold: number
  sealsRemade: number
  /** Pins of a seal's own hash, in revisions and change values: remade, and kept. */
  sealHashPinsRemade: number
  sealHashPinsKept: number
  changePositionsRewritten: number
  changePositionsKeptAsTyped: number
  changePositionsNamingNoOldId: number
  changePartsLeft: number
  changeFieldsRewritten: number
  changePinsRemade: number
  changePinsThatDidNotHold: number
  /** Change values the pass could not place from their field, so that no pin in them was read. */
  changeValuesNotPlaced: number
  /** Every block the identity reader returned in change rows, by its reason. */
  changeBlocks: Record<BlockReason, number>
}

/** The tables the pass writes, in the order it writes them. */
export const THE_TABLES_THE_PASS_WRITES = ['links', 'revisions', 'records', 'changes', 'agent_messages', 'reviews'] as const

/** One row the pass writes: its id, and each column it sets with the value it sets there. */
export interface ARowThePassWrites {
  id: string
  set: Row
}

/** What the pass works out before it writes, from the store as it reads it. */
export interface ThePassPlan {
  /** Each row it writes, by its table, with only the columns that change. */
  writes: Record<(typeof THE_TABLES_THE_PASS_WRITES)[number], ARowThePassWrites[]>
  /** The content-hash, seal-hash, link-hash and seal-own-hash rows of the kept lists, without a generation. */
  keptLists: AKeptListRow[]
  counts: WhatThePassCounted
  keptChangeFields: AKeptChangeField[]
  keptSealHashPins: AKeptSealHashPin[]
  /** The sealed tips whose data it changes. */
  sealsChanged: string[]
}

/** What the pass did, for its caller to file. */
export interface WhatThePassDid {
  /** The content-hash, seal-hash, link-hash and seal-own-hash rows of the kept lists, without a generation. */
  keptLists: AKeptListRow[]
  /** The id of every row the pass changed, by its table. */
  changed: { links: string[]; records: string[]; revisions: string[]; changes: string[]; agent_messages: string[]; reviews: string[] }
  counts: WhatThePassCounted
  keptChangeFields: AKeptChangeField[]
  keptSealHashPins: AKeptSealHashPin[]
}

/** One revision as the pass holds it. */
interface ARevision {
  position: number
  row: Row
  id: string
  recordId: string
  seq: number
  /** The stored fragment and the separately rebuilt whole data, both from the pre-write snapshot. */
  storedData: unknown
  data: unknown
  /** Paths and the earlier revisions that hold them whole. */
  parts: Record<string, number> | null
  /** Whole data after this revision has been planned, kept only when a later row or the record needs it. */
  wholeNow: unknown
  keepWhole: boolean
  wholeChanged: boolean
  /** The revisions it pins, by position. */
  pins: Set<number>
  /** The row as the pass will write it, or null when nothing in it changes. */
  now: Row | null
  /** Its new content hash, or null when its content does not change. */
  newHash: string | null
}

/** A column that holds what was sent, and the column beside it that says when an agent wrote it, from the register. */
const theColumnAndItsPair = (sites: readonly { site: string; pair: { field: string; agent: string } }[], site: string): { column: string; pair: { field: string; agent: string } } => {
  const entry = sites.find((one) => one.site === site)
  if (entry === undefined) throw new Error(`The re-mint rewrites ${site} by the rule, and the register no longer lists it with the column beside it.`)
  return { column: site.slice(site.indexOf('.') + 1), pair: entry.pair }
}

/**
 * WORK OUT THE PASS, AND WRITE NOTHING: every old id the history holds, rewritten in pin order, and every pin and seal
 * over what changed, remade. It makes every refusal of the pass but the standing guard's. rewriteTheHistory writes what it
 * gives, and the re-mint verifier's rows check works it out again from the snapshot (./remint-verification.ts).
 */
export function planTheHistoryPass(sqlite: Database.Database, rule: TheRemintRule): ThePassPlan {
  const columns = sqlite.prepare("SELECT name FROM pragma_table_info('revisions') ORDER BY cid").pluck().all() as string[]
  if (JSON.stringify(columns) !== JSON.stringify(THE_REVISION_COLUMNS_NOW)) {
    throw new Error(
      `${A_REVISIONS_TABLE_THE_LISTS_DO_NOT_NAME_STOPS_THE_REMINT} This store's revisions table has ${columns.join(', ')}, and the last list is ${THE_REVISION_COLUMNS_NOW.join(', ')}. ${NOTHING_WAS_WRITTEN}`,
    )
  }
  const counts: WhatThePassCounted = {
    linksRewritten: 0,
    revisionsRewritten: 0,
    recordsRewritten: 0,
    recordsWithNoRevision: 0,
    changesRewritten: 0,
    agentMessagesRewritten: 0,
    reviewsRewritten: 0,
    positionsRewritten: 0,
    positionsKeptAsTyped: 0,
    positionsNamingNoOldId: 0,
    partsLeft: 0,
    blocks: aCountOfEachReason(),
    pinsRemade: 0,
    pinsThatDidNotHold: 0,
    sealPinsRemade: 0,
    sealPinsThatDidNotHold: 0,
    linkPinsRemade: 0,
    linkPinsThatDidNotHold: 0,
    sealsRemade: 0,
    sealHashPinsRemade: 0,
    sealHashPinsKept: 0,
    changePositionsRewritten: 0,
    changePositionsKeptAsTyped: 0,
    changePositionsNamingNoOldId: 0,
    changePartsLeft: 0,
    changeFieldsRewritten: 0,
    changePinsRemade: 0,
    changePinsThatDidNotHold: 0,
    changeValuesNotPlaced: 0,
    changeBlocks: aCountOfEachReason(),
  }
  const inRevisions: ATally = { rewritten: 0, keptAsTyped: 0, namingNoOldId: 0, partsLeft: 0, blocks: counts.blocks }
  const takeTheRule = (stored: string, tally: ATally): string | null => {
    const next = rule.underTheRule(stored)
    if (next === null || next === stored) {
      tally.keptAsTyped += 1
      return null
    }
    tally.rewritten += 1
    return next
  }

  // ----- Every revision, and each record's data checked against its newest one, before anything is worked out.
  const sealedTip = 'sealed_tip'
  const revisions: ARevision[] = (sqlite.prepare('SELECT * FROM revisions ORDER BY rowid').all() as Row[]).map((row, position) => ({
    position,
    row,
    id: String(row['id']),
    recordId: String(row['record_id']),
    seq: Number(row['seq']),
    storedData: row['data'] === null ? null : parseTheText(String(row['data']), `The data of revision ${String(row['id'])}`),
    data: null,
    parts: null,
    wholeNow: null,
    keepWhole: false,
    wholeChanged: false,
    pins: new Set<number>(),
    now: null,
    newHash: null,
  }))
  const bySeq = new Map<string, ARevision>(revisions.map((one) => [JSON.stringify([one.recordId, one.seq]), one]))
  // Rebuild and validate every original before any rewrite; a reader sees only stored snapshot fragments.
  const readStored = (recordId: string, seq: number) => {
    const found = bySeq.get(JSON.stringify([recordId, seq]))
    return found === undefined ? undefined : { data: found.storedData as Row | null, parts: found.row['parts'] }
  }
  const rebuild = (one: ARevision): unknown => {
    const rawParts = one.row['parts']
    const whole = wholeRevisionData({ recordId: one.recordId, seq: one.seq, data: one.storedData as Row | null, parts: rawParts }, readStored)
    return one.storedData === null && (rawParts === null || rawParts === undefined) ? null : whole
  }
  for (const one of revisions) {
    const rawParts = one.row['parts']
    rebuild(one) // Validate every original against the immutable snapshot before planning any rewrite.
    one.parts = rawParts === null || rawParts === undefined ? null : JSON.parse(String(rawParts)) as Record<string, number>
    for (const seq of Object.values(one.parts ?? {})) {
      const holder = bySeq.get(JSON.stringify([one.recordId, seq]))
      if (holder === undefined) throw new Error(`A stored-once holder is missing in revision ${one.id}. ${NOTHING_WAS_WRITTEN}`)
      one.pins.add(holder.position)
      holder.keepWhole = true
    }
  }
  const byId = new Map<string, ARevision>(revisions.map((one) => [one.id, one]))
  const newest = new Map<string, ARevision>()
  for (const one of revisions) if ((newest.get(one.recordId)?.seq ?? -Infinity) < one.seq) newest.set(one.recordId, one)
  const records = sqlite.prepare('SELECT id, kind, data FROM records ORDER BY rowid').all() as { id: string; kind: string; data: string }[]
  const notItsNewest = records.filter((one) => {
    const latest = newest.get(one.id)
    if (latest === undefined) return false
    const data = latest.parts === null ? latest.row['data'] : JSON.stringify(rebuild(latest))
    return one.data !== data
  }).map((one) => one.id)
  if (notItsNewest.length > 0) {
    const more = notItsNewest.length > 10 ? `, and ${String(notItsNewest.length - 10)} more` : ''
    throw new Error(`${A_RECORD_WHOSE_DATA_IS_NOT_ITS_NEWEST_REVISION_STOPS_THE_PASS} These records hold other data than their newest revision: ${notItsNewest.slice(0, 10).join(', ')}${more}. ${NOTHING_WAS_WRITTEN}`)
  }
  counts.recordsWithNoRevision = records.filter((one) => !newest.has(one.id)).length

  // ----- The seals' own hashes, and the order: each revision after every revision it pins.
  const theSealOf = (one: ARevision): Row | null => (one.row['kind'] === sealedTip && isPlain(one.data) && isPlain(one.data['seal']) ? one.data['seal'] : null)
  const sealsByHash = new Map<string, Map<string, ARevision[]>>()
  for (const one of revisions) {
    one.data = rebuild(one)
    const hash = theSealOf(one)?.['hash']
    one.data = null
    if (typeof hash !== 'string') continue
    const ofTheRecord = sealsByHash.get(one.recordId) ?? new Map<string, ARevision[]>()
    ofTheRecord.set(hash, [...(ofTheRecord.get(hash) ?? []), one])
    sealsByHash.set(one.recordId, ofTheRecord)
  }
  for (const one of revisions) {
    one.data = rebuild(one)
    if (!isPlain(one.data)) { one.data = null; continue }
    const kind = String(one.row['kind'])
    for (const pin of thePinsARecordHolds(one.recordId, kind, one.data)) {
      const pinned = typeof pin.recordId === 'string' && typeof pin.seq === 'number' ? bySeq.get(JSON.stringify([pin.recordId, pin.seq])) : undefined
      if (pinned !== undefined) one.pins.add(pinned.position)
    }
    const seal = theSealOf(one)
    for (const { pin } of thePinsASealHolds(seal?.['records'])) {
      const pinned = isPlain(pin) && typeof pin['id'] === 'string' ? byId.get(pin['id']) : undefined
      if (pinned !== undefined) one.pins.add(pinned.position)
    }
    for (const { holder, id, hash } of theSealHashPinsIn(kind, one.data)) {
      const named = typeof holder[id] === 'string' && typeof holder[hash] === 'string' ? sealsByHash.get(String(holder[id]))?.get(String(holder[hash])) : undefined
      for (const pinned of named ?? []) one.pins.add(pinned.position)
    }
    one.data = null
  }
  const order = thePinOrder(revisions)

  // ----- Links, before the revisions: a link's writer by the rule. Its from_id and to_id hold record ids.
  const createdBy = theColumnAndItsPair(PLAIN_ID_COLUMNS.flatMap((one) => (one.pair === undefined ? [] : [{ site: one.site, pair: one.pair }])), 'links.created_by')
  const links = (sqlite.prepare('SELECT ' + THE_COLUMNS_A_LINK_IS_HASHED_BY + ' FROM links ORDER BY rowid').all() as Row[]).map((row) => ({
    row,
    id: String(row['id']),
    hash: theHashOfARow(row),
    now: null as Row | null,
    newHash: null as string | null,
  }))
  const linkTally: ATally = { rewritten: 0, keptAsTyped: 0, namingNoOldId: 0, partsLeft: 0, blocks: counts.blocks }
  for (const link of links) {
    const stored = link.row[createdBy.column]
    if (link.row[createdBy.pair.field] !== createdBy.pair.agent || typeof stored !== 'string') continue
    const next = takeTheRule(stored, linkTally)
    if (next === null) continue
    link.now = { ...link.row, [createdBy.column]: next }
    link.newHash = theHashOfARow(link.now)
  }
  const linksById = new Map(links.map((one) => [one.id, one]))

  // ----- The revisions, in pin order.
  const actorId = theColumnAndItsPair(LEDGER_STAMPS, 'revisions.actor_id')
  const revisionColumns = Object.keys(STORED_COLUMNS).filter((site) => site.startsWith('revisions.'))
  const remadeSeals = new Map<string, Map<string, string>>()
  const contentHashes: AKeptListRow[] = []
  const sealHashes = new Map<string, AKeptListRow>()
  const linkHashes = new Map<string, AKeptListRow>()
  const ownHashes: AKeptListRow[] = []

  /**
   * Remake the record pins of one value, each to the new hash of the revision it names, where it held. `objects` are the
   * value's objects by the paths the pins were read at, taken before a key was renamed.
   */
  const remakeThePins = (pins: readonly AStoredPin[], objects: ReadonlyMap<string, Row[]>, where: string, tally: { remade: number; notHeld: number }) => {
    const done = new Set<string>()
    for (const pin of pins) {
      if (done.has(pin.path)) continue
      done.add(pin.path)
      const pinned = typeof pin.recordId === 'string' && typeof pin.seq === 'number' ? bySeq.get(JSON.stringify([pin.recordId, pin.seq])) : undefined
      if (pinned === undefined || pin.contentHash !== pinned.row['content_hash']) {
        tally.notHeld += 1
        continue
      }
      if (pinned.newHash === null) continue
      const held = objects.get(pin.path) ?? []
      const object = held.length === 1 ? held[0] : undefined
      if (object === undefined) throw new Error(`${A_PLACE_THE_PASS_CANNOT_REWRITE_STOPS_THE_PASS} ${where}: ${String(held.length)} objects are at ${pin.path}, where one pin was read. ${NOTHING_WAS_WRITTEN}`)
      object['contentHash'] = pinned.newHash
      tally.remade += 1
    }
  }
  /** Remake each pin of a seal's own hash where it names a seal the pass remade, by that seal's old hash. */
  const remakeTheSealHashPins = (pins: readonly ASealHashPin[]) => {
    for (const { holder, id, hash } of pins) {
      const now = typeof holder[id] === 'string' && typeof holder[hash] === 'string' ? remadeSeals.get(String(holder[id]))?.get(String(holder[hash])) : undefined
      if (now === undefined) {
        counts.sealHashPinsKept += 1
        continue
      }
      holder[hash] = now
      counts.sealHashPinsRemade += 1
    }
  }

  for (const one of order) {
    one.data = rebuild(one)
    const where = `Revision ${one.id}`
    const kind = String(one.row['kind'])
    const now: Row = { ...one.row }
    const box: Row = { data: one.data === null ? null : JSON.parse(JSON.stringify(one.data)) as unknown }
    const read = box['data']
    if (isPlain(read)) {
      // What pins what is read before any id is rewritten, and the objects it names are the ones edited after.
      const pins = thePinsARecordHolds(one.recordId, kind, read)
      const objects = theObjectsByPinPath(read, 'data')
      const sealHashPins = theSealHashPinsIn(kind, read)
      const seal = kind === sealedTip && isPlain(read['seal']) ? read['seal'] : null
      const sealPins = thePinsASealHolds(seal?.['records'])
      const told: AStampOrActorPair[] = []
      const reading = readRecordIdentities(sqlite, kind, read, 'data', (said) => told.push(said))
      rewriteTheIds(box, 'data', 'data', reading, told, rule, inRevisions, where)
      const pinTally = { remade: 0, notHeld: 0 }
      remakeThePins(pins, objects, where, pinTally)
      counts.pinsRemade += pinTally.remade
      counts.pinsThatDidNotHold += pinTally.notHeld
      for (const { pin } of sealPins) {
        const pinned = isPlain(pin) && typeof pin['id'] === 'string' ? byId.get(pin['id']) : undefined
        if (!isPlain(pin) || pinned === undefined || pinned.now === null) continue
        const hash = pin['hash']
        const under = typeof hash === 'string' ? theListARevisionRowHashesUnder(pinned.row, hash) : null
        const list = THE_LISTS_OF_REVISION_COLUMNS.find((each) => each.after === under)
        if (typeof hash !== 'string' || list === undefined) {
          counts.sealPinsThatDidNotHold += 1
          continue
        }
        const remade = theHashOfARow(Object.fromEntries(list.columns.map((column) => [column, pinned.now?.[column]])))
        if (remade === hash) continue
        pin['hash'] = remade
        counts.sealPinsRemade += 1
        if (!sealHashes.has(hash)) sealHashes.set(hash, { list: 'seal_hash', recordId: pinned.recordId, seq: pinned.seq, old: hash, new: remade })
      }
      const sealedLinks = seal !== null && isPlain(seal['records']) && Array.isArray(seal['records']['links']) ? (seal['records']['links'] as unknown[]) : []
      for (const pin of sealedLinks) {
        const link = isPlain(pin) && typeof pin['id'] === 'string' ? linksById.get(pin['id']) : undefined
        if (!isPlain(pin) || link === undefined || pin['hash'] !== link.hash) {
          counts.linkPinsThatDidNotHold += 1
          continue
        }
        if (link.newHash === null) continue
        pin['hash'] = link.newHash
        counts.linkPinsRemade += 1
        if (!linkHashes.has(link.hash)) linkHashes.set(link.hash, { list: 'link_hash', recordId: null, seq: null, linkId: link.id, old: link.hash, new: link.newHash })
      }
      remakeTheSealHashPins(sealHashPins)
      if (seal !== null && typeof seal['hash'] === 'string') {
        const { hash: was, ...content } = seal
        const { hash: _was, ...contentBefore } = theSealOf(one) ?? ({} as Row)
        if (JSON.stringify(content) !== JSON.stringify(contentBefore)) {
          if (sealHash(JSON.stringify(contentBefore)) !== was) throw new Error(`${A_HASH_ALREADY_WRONG_STOPS_THE_PASS} The seal in ${where} is not the hash of its content. ${NOTHING_WAS_WRITTEN}`)
          const remade = sealHash(JSON.stringify(content))
          seal['hash'] = remade
          ownHashes.push({ list: 'seal_own_hash', recordId: one.recordId, seq: one.seq, old: String(was), new: remade })
          const ofTheRecord = remadeSeals.get(one.recordId) ?? new Map<string, string>()
          ofTheRecord.set(String(was), remade)
          remadeSeals.set(one.recordId, ofTheRecord)
          counts.sealsRemade += 1
        }
      }
    }
    // Whole content and stored representation are distinct. Preserve each named holder and its reference.
    // If the rewritten value no longer agrees with its holder, refuse rather than materializing it silently.
    if (one.keepWhole) one.wholeNow = box['data']
    let storedData: unknown = box['data']
    const atPath = (value: unknown, path: readonly string[]): unknown => path.reduce<unknown>((held, key) => isPlain(held) ? held[key] : undefined, value)
    const withPath = (value: Row, path: readonly string[], next: unknown): Row => {
      const [key, ...rest] = path
      if (key === undefined || (rest.length > 0 && !isPlain(value[key]))) throw new Error(`A stored-once path moved in ${where}. ${NOTHING_WAS_WRITTEN}`)
      return { ...value, [key]: rest.length === 0 ? next : withPath(value[key] as Row, rest, next) }
    }
    for (const [path, seq] of Object.entries(one.parts ?? {})) {
      const holder = bySeq.get(JSON.stringify([one.recordId, seq]))
      if (holder === undefined || !isPlain(holder.wholeNow) || !isPlain(storedData)) throw new Error(`A stored-once holder is unavailable in ${where}. ${NOTHING_WAS_WRITTEN}`)
      const steps = path.split('.')
      const value = atPath(box['data'], steps)
      const held = atPath(holder.wholeNow, steps)
      const text = JSON.stringify(value)
      if (text === undefined || text !== JSON.stringify(held)) {
        throw new Error(`The rewritten stored-once value differs from its named holder in ${where}. ${NOTHING_WAS_WRITTEN}`)
      }
      storedData = withPath(storedData, steps, partHashOf(text))
    }
    if (JSON.stringify(storedData) !== JSON.stringify(one.storedData)) {
      now['data'] = theTextOf(storedData, one.storedData, String(one.row['data']), `The data of ${where}`)
    }

    const stored = one.row[actorId.column]
    if (one.row[actorId.pair.field] === actorId.pair.agent && typeof stored === 'string') {
      const next = takeTheRule(stored, inRevisions)
      if (next !== null) now[actorId.column] = next
    }
    for (const site of revisionColumns) {
      const column = site.slice(site.indexOf('.') + 1)
      const text = one.row[column]
      if (typeof text !== 'string') continue
      const value = parseTheText(text, `The ${column} of ${where}`)
      const held: Row = { [column]: parseTheText(text, `The ${column} of ${where}`) }
      const told: AStampOrActorPair[] = []
      const reading = readStoredColumn(sqlite, site, value, null, (said) => told.push(said))
      rewriteTheIds(held, column, column, reading, told, rule, inRevisions, `The ${column} of ${where}`)
      if (JSON.stringify(held[column]) !== JSON.stringify(value)) now[column] = theTextOf(held[column], value, text, `The ${column} of ${where}`)
    }

    one.wholeChanged = JSON.stringify(box['data']) !== JSON.stringify(one.data)
    if (one.wholeChanged) {
      const content = (data: unknown) => contentOf({ kind, title: String(one.row['title']), summary: one.row['summary'] as string | null, data: data as Row | null, deletedAt: one.row['deleted_at'] as string | null })
      if (versionOf(content(one.data)) !== one.row['content_hash']) {
        throw new Error(`${A_HASH_ALREADY_WRONG_STOPS_THE_PASS} The content hash of ${where} is not the hash of its content. ${NOTHING_WAS_WRITTEN}`)
      }
      one.newHash = versionOf(content(box['data']))
      now['content_hash'] = one.newHash
      if (one.newHash !== one.row['content_hash']) contentHashes.push({ list: 'content_hash', recordId: one.recordId, seq: one.seq, old: String(one.row['content_hash']), new: one.newHash })
      else one.newHash = null
    }
    if (THE_REVISION_COLUMNS_NOW.some((column) => now[column] !== one.row[column])) {
      one.now = now
      if (one.wholeChanged && newest.get(one.recordId) === one) one.wholeNow = box['data']
    }
    one.data = null
  }
  counts.positionsRewritten = inRevisions.rewritten + linkTally.rewritten
  counts.positionsKeptAsTyped = inRevisions.keptAsTyped + linkTally.keptAsTyped
  counts.positionsNamingNoOldId = inRevisions.namingNoOldId
  counts.partsLeft = inRevisions.partsLeft

  // ----- Each record's data, from its newest revision.
  const recordData = records.flatMap((one) => {
    const latest = newest.get(one.id)
    if (latest === undefined || !latest.wholeChanged) return []
    const remade = JSON.stringify(latest.wholeNow)
    return remade === one.data ? [] : [{ id: one.id, kind: one.kind, data: remade }]
  })

  // ----- The change rows: their values by the positions, their field's key, and their pins through the content-hash pairs.
  const kindsOf = new Map<string, Set<string>>()
  const aKind = (recordId: string, kind: string) => kindsOf.set(recordId, (kindsOf.get(recordId) ?? new Set<string>()).add(kind))
  for (const one of records) aKind(one.id, one.kind)
  for (const one of revisions) aKind(one.recordId, String(one.row['kind']))
  const changeColumns = Object.keys(STORED_COLUMNS).filter((site) => site.startsWith('changes.'))
  const keptChangeFields: AKeptChangeField[] = []
  const keptSealHashPins: AKeptSealHashPin[] = []
  const changes: { id: string; set: Row }[] = []
  const changeRows = sqlite.prepare('SELECT * FROM changes ORDER BY rowid').all() as Row[]
  for (const row of changeRows) {
    const id = String(row['id'])
    const where = `Change row ${id}`
    const recordId = String(row['record_id'])
    const field = typeof row['field'] === 'string' ? row['field'] : null
    const kind = theKindAChangeIsReadBy(kindsOf.get(recordId))
    const set: Row = {}
    const told: AStampOrActorPair[] = []
    const reading = readChangeIdentities(sqlite, kind, { field, oldValue: row['old_value'] as string | null, newValue: row['new_value'] as string | null }, (said) => told.push(said))
    const onTheField = reading.found.filter((one) => one.path === 'field:' + String(field))
    const onASide = (path: string) => path.startsWith('old_value:') || path.startsWith('new_value:')
    const bare = new Set(reading.blocks.filter((one) => !onASide(one.path)).map((one) => one.path))
    for (const one of reading.blocks) if (!onASide(one.path)) counts.changeBlocks[one.reason] += 1

    // The field: a map key on its path, rebuilt from its own steps, and kept where the steps do not give it back.
    const steps = field === null ? [] : stepsOfPath(field)
    const theField = (of: readonly string[]) => of.reduce((path, step) => pathStep(path, step), '')
    const placed = field !== null && theField(steps) === field
    if (field !== null && onTheField.some((one) => rule.newIds.has(one.stored))) {
      const renamed = [...steps]
      let why: string | null = placed ? null : `its steps ${JSON.stringify(steps)} do not give it back in the form the change log writes, so the pass cannot tell which part of it is the key`
      for (const one of onTheField) {
        const next = rule.newIds.get(one.stored)
        if (next === undefined || why !== null) continue
        const at = steps.flatMap((step, i) => (i >= 1 && step === one.stored ? [i] : []))
        if (at.length !== 1 || at[0] === undefined) why = `${one.stored} is ${String(at.length)} of its steps, so the pass cannot tell which one is the key`
        else renamed[at[0]] = next
      }
      if (why === null) {
        set['field'] = theField(renamed)
        counts.changeFieldsRewritten += 1
      } else keptChangeFields.push({ changeId: id, field, why })
    }

    for (const column of ['old_value', 'new_value'] as const) {
      const text = row[column]
      if (typeof text !== 'string') continue
      const prefix = column + ':'
      const sideReading: IdentityReading = {
        found: reading.found.filter((one) => one.path.startsWith(prefix)),
        blocks: reading.blocks.filter((one) => one.path.startsWith(prefix)),
      }
      const sideTold = told.filter((one) => one.path.startsWith(prefix))
      const root = prefix + String(field)
      let parsed: unknown
      try {
        parsed = JSON.parse(text) as unknown
      } catch {
        parsed = undefined
      }
      // The reader reads a value as the text it is stored as where its declared type takes text, and as its JSON otherwise.
      const asText =
        parsed === undefined ||
        [...sideReading.found, ...sideTold].some((one) => one.path === root && one.stored === text) ||
        sideReading.blocks.some((one) => one.path === root && one.reason === 'cannot-tell')
      // A second parse, so that what is edited is not what it is compared with.
      const box: Row = { value: asText ? text : (JSON.parse(text) as unknown) }
      if (sideReading.found.length > 0 || sideReading.blocks.length > 0 || sideTold.length > 0) {
        const tally: ATally = { rewritten: 0, keptAsTyped: 0, namingNoOldId: 0, partsLeft: 0, blocks: counts.changeBlocks }
        rewriteTheIds(box, 'value', root, sideReading, sideTold, rule, tally, `The ${column} of ${where}`)
        counts.changePositionsRewritten += tally.rewritten
        counts.changePositionsKeptAsTyped += tally.keptAsTyped
        counts.changePositionsNamingNoOldId += tally.namingNoOldId
        counts.changePartsLeft += tally.partsLeft
      }
      if (!asText) {
        const value = box['value']
        const canPlace = placed && 'kind' in kind && !bare.has(column) && !bare.has('field')
        if (!isPlain(value) && !Array.isArray(value)) {
          // A number, a boolean, null or a string holds no pin.
        } else if (canPlace) {
          // The value sits at the field's path in a record's data, so its pins are read where the record's would be.
          const data: Row = {}
          let into: Row = data
          const below = steps.slice(1)
          below.forEach((step, i) => {
            if (i === below.length - 1) into[step] = value
            else {
              const next: Row = {}
              into[step] = next
              into = next
            }
          })
          const skeleton = below.length === 0 ? value : data
          if (isPlain(skeleton)) {
            const pinTally = { remade: 0, notHeld: 0 }
            remakeThePins(thePinsARecordHolds(recordId, kind.kind, skeleton), theObjectsByPinPath(skeleton, 'data'), `The ${column} of ${where}`, pinTally)
            counts.changePinsRemade += pinTally.remade
            counts.changePinsThatDidNotHold += pinTally.notHeld
            remakeTheSealHashPins(theSealHashPinsIn(kind.kind, skeleton))
          }
        } else {
          counts.changeValuesNotPlaced += 1
          const why = !placed
            ? 'its field is not written in the form the change log writes, so the pass cannot tell where in the record the value sits'
            : 'kind' in kind
              ? 'the identity reader could not read its field or this value, so the pass cannot tell what the value is'
              : `its record ${kind.why}`
          for (const { path, pin } of everySealHashPinBelow(value, root)) {
            const sealId = String(pin.holder[pin.id])
            const hash = String(pin.holder[pin.hash])
            if (remadeSeals.get(sealId)?.get(hash) === undefined) continue
            keptSealHashPins.push({ changeId: id, field, column, path, sealId, hash, why })
            counts.sealHashPinsKept += 1
          }
        }
        if (JSON.stringify(box['value']) !== JSON.stringify(parsed)) set[column] = theTextOf(box['value'], parsed, text, `The ${column} of ${where}`)
      } else if (box['value'] !== text) {
        if (typeof box['value'] !== 'string') throw new Error(`${A_PLACE_THE_PASS_CANNOT_REWRITE_STOPS_THE_PASS} The ${column} of ${where} is text and was given something else. ${NOTHING_WAS_WRITTEN}`)
        set[column] = box['value']
      }
    }

    for (const site of changeColumns) {
      const column = site.slice(site.indexOf('.') + 1)
      const text = row[column]
      if (typeof text !== 'string') continue
      const value = parseTheText(text, `The ${column} of ${where}`)
      const held: Row = { [column]: parseTheText(text, `The ${column} of ${where}`) }
      const columnTold: AStampOrActorPair[] = []
      const columnReading = readStoredColumn(sqlite, site, value, null, (said) => columnTold.push(said))
      const tally: ATally = { rewritten: 0, keptAsTyped: 0, namingNoOldId: 0, partsLeft: 0, blocks: counts.changeBlocks }
      rewriteTheIds(held, column, column, columnReading, columnTold, rule, tally, `The ${column} of ${where}`)
      counts.changePositionsRewritten += tally.rewritten
      counts.changePositionsKeptAsTyped += tally.keptAsTyped
      counts.changePositionsNamingNoOldId += tally.namingNoOldId
      if (JSON.stringify(held[column]) !== JSON.stringify(value)) set[column] = theTextOf(held[column], value, text, `The ${column} of ${where}`)
    }
    if (Object.keys(set).length > 0) changes.push({ id, set })
  }

  // ----- The pins in thread messages and reviews.
  const pinTally = { remade: 0, notHeld: 0 }
  const remadeContexts = (text: string | null, where: string, root: string, pinsOf: (value: unknown) => AStoredPin[]): string | null => {
    if (text === null) return null
    const value = parseTheText(text, where)
    const read = parseTheText(text, where)
    remakeThePins(pinsOf(read), theObjectsByPinPath(read, root), where, pinTally)
    return JSON.stringify(read) === JSON.stringify(value) ? null : theTextOf(read, value, text, where)
  }
  const messages = (sqlite.prepare('SELECT id, context, carries FROM agent_messages ORDER BY rowid').all() as { id: string; context: string | null; carries: string | null }[]).flatMap((one) => {
    const set: Row = {}
    const context = remadeContexts(one.context, `The context of thread message ${one.id}`, 'context', (value) => theContextsPin(value, 'context'))
    if (context !== null) set['context'] = context
    const carries = remadeContexts(one.carries, `What thread message ${one.id} carries`, 'carries', (value) =>
      Array.isArray(value) ? value.flatMap((each, at) => theContextsPin(isPlain(each) ? each['quote'] : undefined, `carries[${String(at)}].quote`)) : [],
    )
    if (carries !== null) set['carries'] = carries
    return Object.keys(set).length === 0 ? [] : [{ id: one.id, set }]
  })
  const reviews = (sqlite.prepare('SELECT id, entry FROM reviews ORDER BY rowid').all() as { id: string; entry: string }[]).flatMap((one) => {
    const entry = remadeContexts(one.entry, `The entry of review ${one.id}`, 'entry', (value) => theContextsPin(value, 'entry'))
    return entry === null ? [] : [{ id: one.id, set: { entry } as Row }]
  })
  counts.pinsRemade += pinTally.remade
  counts.pinsThatDidNotHold += pinTally.notHeld

  // ----- What the pass writes: only the changed columns of the changed rows.
  const writes: ThePassPlan['writes'] = {
    links: links.flatMap((link) => (link.now === null ? [] : [{ id: link.id, set: { [createdBy.column]: link.now[createdBy.column] } }])),
    revisions: revisions.flatMap((one) => {
      const now = one.now
      return now === null ? [] : [{ id: one.id, set: Object.fromEntries(THE_REVISION_COLUMNS_NOW.filter((column) => now[column] !== one.row[column]).map((column) => [column, now[column]])) }]
    }),
    records: recordData.map((one) => ({ id: one.id, set: { data: one.data } })),
    changes,
    agent_messages: messages,
    reviews,
  }
  counts.linksRewritten = writes.links.length
  counts.revisionsRewritten = writes.revisions.length
  counts.recordsRewritten = writes.records.length
  counts.changesRewritten = writes.changes.length
  counts.agentMessagesRewritten = writes.agent_messages.length
  counts.reviewsRewritten = writes.reviews.length
  return {
    writes,
    keptLists: [...contentHashes, ...sealHashes.values(), ...linkHashes.values(), ...ownHashes],
    counts,
    keptChangeFields,
    keptSealHashPins,
    sealsChanged: recordData.filter((one) => one.kind === sealedTip).map((one) => one.id),
  }
}

/**
 * Rewrite every old id the history holds, in pin order, and remake every pin and seal over what changed. It runs only
 * inside its caller's transaction, refuses before the first write, and files nothing.
 */
export function rewriteTheHistory(sqlite: Database.Database, rule: TheRemintRule): WhatThePassDid {
  if (!sqlite.inTransaction) throw new Error(`${THE_PASS_RUNS_ONLY_INSIDE_A_TRANSACTION} ${NOTHING_WAS_WRITTEN}`)
  const plan = planTheHistoryPass(sqlite, rule)

  // ----- Every refusal has been made. A sealed tip is changed only with its guard lifted.
  const guard = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = ?").pluck().get(THE_SEALED_TIP_GUARDS[0]) as string | undefined
  if (plan.sealsChanged.length > 0 && guard !== undefined) {
    throw new Error(`${A_STANDING_GUARD_STOPS_THE_PASS} The pass would change ${plan.sealsChanged.join(', ')}, and ${guard} still stands. Lift it with liftTheSealedTipGuards first. ${NOTHING_WAS_WRITTEN}`)
  }

  // ----- The writes, table by table.
  const statements = new Map<string, Database.Statement>()
  const update = (table: string, id: string, set: Row) => {
    const names = Object.keys(set)
    const sql = 'UPDATE ' + table + ' SET ' + names.map((name) => name + ' = ?').join(', ') + ' WHERE id = ?'
    const statement = statements.get(sql) ?? sqlite.prepare(sql)
    statements.set(sql, statement)
    statement.run(...names.map((name) => set[name]), id)
  }
  const changed: WhatThePassDid['changed'] = { links: [], records: [], revisions: [], changes: [], agent_messages: [], reviews: [] }
  for (const table of THE_TABLES_THE_PASS_WRITES) {
    for (const one of plan.writes[table]) {
      update(table, one.id, one.set)
      changed[table].push(one.id)
    }
  }
  return { keptLists: plan.keptLists, changed, counts: plan.counts, keptChangeFields: plan.keptChangeFields, keptSealHashPins: plan.keptSealHashPins }
}

// ---------------------------------------------------------------------------------------------------------------------
// The stored values outside the ledgers
// ---------------------------------------------------------------------------------------------------------------------

/** One stored value the stored step rewrites: its site, its row by rowid, and the text it is given. */
export interface AStoredValueRewritten {
  site: string
  rowid: number
  to: string
}

/** What the stored step works out: each value it rewrites, and the rows it rewrites at each site. */
export interface TheStoredPlan {
  rewrites: AStoredValueRewritten[]
  rows: Record<string, number>
}

/**
 * THE STORED STEP'S PLAN: the new text of each value in the stored columns outside the ledgers that names a legacy agent
 * by its old id, read by the identity reader and rewritten by the pass's own rules. Each value is read as the census reads
 * it (./registry-aliases/census.ts): one that holds nothing or is not JSON is not read. It writes nothing.
 */
export function planTheStoredValues(sqlite: Database.Database, rule: TheRemintRule): TheStoredPlan {
  const plan: TheStoredPlan = { rewrites: [], rows: {} }
  const tally: ATally = { rewritten: 0, keptAsTyped: 0, namingNoOldId: 0, partsLeft: 0, blocks: aCountOfEachReason() }
  const tables = new Map<string, string[]>()
  for (const [site, column] of Object.entries(STORED_COLUMNS)) {
    // The plain planner has already planned columns explicitly marked for it.
    if ('remint' in column) continue
    const table = site.slice(0, site.indexOf('.'))
    if (table === 'revisions' || table === 'changes') continue
    tables.set(table, [...(tables.get(table) ?? []), site.slice(site.indexOf('.') + 1)])
  }
  for (const [table, columns] of tables) {
    const byAct = columns.some((column) => STORED_COLUMNS[`${table}.${column}`]?.reads === 'by-act')
    const selected = ['rowid AS "<rowid>"', ...(byAct ? ['"act"'] : []), ...columns.map((column) => `"${column}"`)].join(', ')
    for (const row of sqlite.prepare(`SELECT ${selected} FROM "${table}" ORDER BY rowid`).all() as Row[]) {
      const rowid = Number(row['<rowid>'])
      for (const column of columns) {
        if (row[column] === null) continue
        const site = `${table}.${column}`
        const text = String(row[column])
        let value: unknown
        try {
          value = JSON.parse(text) as unknown
        } catch {
          continue
        }
        const where = `${site} of row ${String(rowid)}`
        const held: Row = { [column]: JSON.parse(text) as unknown }
        const told: AStampOrActorPair[] = []
        const reading = readStoredColumn(sqlite, site, value, byAct ? String(row['act']) : null, (said) => told.push(said))
        rewriteTheIds(held, column, column, reading, told, rule, tally, where)
        if (JSON.stringify(held[column]) === JSON.stringify(value)) continue
        plan.rewrites.push({ site, rowid, to: theTextOf(held[column], value, text, where) })
        plan.rows[site] = (plan.rows[site] ?? 0) + 1
      }
    }
  }
  return plan
}

/** Write the stored step's plan, inside its caller's transaction, and give the rows it rewrote at each site. */
export function rewriteTheStoredValues(sqlite: Database.Database, rule: TheRemintRule): Record<string, number> {
  if (!sqlite.inTransaction) throw new Error(`${THE_PASS_RUNS_ONLY_INSIDE_A_TRANSACTION} ${NOTHING_WAS_WRITTEN}`)
  const plan = planTheStoredValues(sqlite, rule)
  for (const one of plan.rewrites) {
    const dot = one.site.indexOf('.')
    const changed = sqlite.prepare(`UPDATE "${one.site.slice(0, dot)}" SET "${one.site.slice(dot + 1)}" = ? WHERE rowid = ?`).run(one.to, one.rowid).changes
    if (changed !== 1) throw new Error(`The stored step changed ${String(changed)} rows writing ${one.site} of row ${String(one.rowid)}, and expected one.`)
  }
  return plan.rows
}

/**
 * The revisions in the order the pass remakes them: each after every revision it pins, and otherwise in rowid order. It
 * refuses revisions that pin each other in a cycle, naming them.
 */
function thePinOrder(revisions: readonly ARevision[]): ARevision[] {
  const waitingOn = revisions.map((one) => one.pins.size)
  const pinnedBy: number[][] = revisions.map(() => [])
  for (const one of revisions) for (const pinned of one.pins) pinnedBy[pinned]?.push(one.position)
  const ready = new TheSmallestFirst()
  revisions.forEach((one) => one.pins.size === 0 && ready.push(one.position))
  const order: ARevision[] = []
  for (let next = ready.pop(); next !== undefined; next = ready.pop()) {
    const one = revisions[next]
    if (one === undefined) throw new Error('The pin order lost a revision.')
    order.push(one)
    for (const after of pinnedBy[next] ?? []) {
      waitingOn[after] = (waitingOn[after] ?? 0) - 1
      if (waitingOn[after] === 0) ready.push(after)
    }
  }
  if (order.length === revisions.length) return order
  const left = new Set(revisions.filter((one) => (waitingOn[one.position] ?? 0) > 0).map((one) => one.position))
  const cycles = theCyclesAmong(revisions, left)
  const named = cycles.slice(0, 5).map((cycle) => cycle.map((at) => revisions[at]?.id ?? String(at)).join(', '))
  const more = cycles.length > named.length ? `; and ${String(cycles.length - named.length)} more` : ''
  throw new Error(`${A_CYCLE_OF_PINS_STOPS_THE_PASS} ${String(cycles.length)} cycle(s) of revisions pin each other: ${named.join('; ')}${more}. ${NOTHING_WAS_WRITTEN}`)
}

/** Every cycle among the revisions at `left`: each strongly connected group of more than one, or one that pins itself. */
function theCyclesAmong(revisions: readonly ARevision[], left: ReadonlySet<number>): number[][] {
  const index = new Map<number, number>()
  const low = new Map<number, number>()
  const onStack = new Set<number>()
  const stack: number[] = []
  const cycles: number[][] = []
  let counter = 0
  const pinsOf = (at: number) => [...(revisions[at]?.pins ?? [])].filter((one) => left.has(one))
  for (const start of left) {
    if (index.has(start)) continue
    const frames: { at: number; pins: number[]; next: number }[] = []
    const enter = (at: number) => {
      index.set(at, counter)
      low.set(at, counter)
      counter += 1
      stack.push(at)
      onStack.add(at)
      frames.push({ at, pins: pinsOf(at), next: 0 })
    }
    enter(start)
    while (frames.length > 0) {
      const frame = frames[frames.length - 1]
      if (frame === undefined) break
      const pinned = frame.pins[frame.next]
      if (pinned !== undefined) {
        frame.next += 1
        if (!index.has(pinned)) enter(pinned)
        else if (onStack.has(pinned)) low.set(frame.at, Math.min(low.get(frame.at) ?? 0, index.get(pinned) ?? 0))
        continue
      }
      frames.pop()
      const parent = frames[frames.length - 1]
      if (parent !== undefined) low.set(parent.at, Math.min(low.get(parent.at) ?? 0, low.get(frame.at) ?? 0))
      if (low.get(frame.at) !== index.get(frame.at)) continue
      const group: number[] = []
      for (let one = stack.pop(); one !== undefined; one = stack.pop()) {
        onStack.delete(one)
        group.push(one)
        if (one === frame.at) break
      }
      if (group.length > 1 || revisions[frame.at]?.pins.has(frame.at) === true) cycles.push(group.sort((a, b) => a - b))
    }
  }
  return cycles.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0))
}

/** A heap of positions that gives the smallest first, so that the pin order keeps rowid order wherever the pins allow. */
class TheSmallestFirst {
  private readonly held: number[] = []
  push(one: number): void {
    const held = this.held
    held.push(one)
    for (let at = held.length - 1; at > 0; ) {
      const up = (at - 1) >> 1
      if ((held[up] ?? 0) <= (held[at] ?? 0)) break
      ;[held[up], held[at]] = [held[at] ?? 0, held[up] ?? 0]
      at = up
    }
  }
  pop(): number | undefined {
    const held = this.held
    const top = held[0]
    const last = held.pop()
    if (held.length === 0 || last === undefined) return top
    held[0] = last
    for (let at = 0; ; ) {
      const left = 2 * at + 1
      const right = left + 1
      let least = at
      if (left < held.length && (held[left] ?? 0) < (held[least] ?? 0)) least = left
      if (right < held.length && (held[right] ?? 0) < (held[least] ?? 0)) least = right
      if (least === at) break
      ;[held[least], held[at]] = [held[at] ?? 0, held[least] ?? 0]
      at = least
    }
    return top
  }
}

/** A link pin of a seal that does not hold: the seal, where in its data, the link it names, the hash, and whether the link is there. */
export interface ALinkPinThatDoesNotHold {
  seal: string
  path: string
  link: unknown
  hash: unknown
  found: boolean
}

/** Every link pin of a seal that does not hold, in seal id order. A pin holds when its link's row hashes to it. It writes nothing. */
export function theLinkPinsThatDoNotHold(sqlite: Database.Database): ALinkPinThatDoesNotHold[] {
  const theLink = sqlite.prepare('SELECT ' + THE_COLUMNS_A_LINK_IS_HASHED_BY + ' FROM links WHERE id = ?')
  const notHeld: ALinkPinThatDoesNotHold[] = []
  const seals = sqlite.prepare("SELECT id, data FROM records WHERE kind = 'sealed_tip' ORDER BY id").all() as { id: string; data: string }[]
  for (const seal of seals) {
    const data = JSON.parse(seal.data) as unknown
    const records = isPlain(data) && isPlain(data['seal']) ? data['seal']['records'] : undefined
    const pins = isPlain(records) && Array.isArray(records['links']) ? (records['links'] as unknown[]) : []
    pins.forEach((pin, at) => {
      const held = isPlain(pin) ? pin : {}
      const row = typeof held['id'] === 'string' ? (theLink.get(held['id']) as Row | undefined) : undefined
      if (row !== undefined && held['hash'] === theHashOfARow(row)) return
      notHeld.push({ seal: seal.id, path: `data.seal.records.links[${String(at)}]`, link: held['id'], hash: held['hash'], found: row !== undefined })
    })
  }
  return notHeld
}
