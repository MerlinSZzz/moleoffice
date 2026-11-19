// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * READ EVERY AGENT IDENTITY A STORED RECORD HOLDS, BY ITS DECLARED TYPES, AND CHANGE NOTHING.
 *
 * The reader walks a record's data down the types kinds.ts declares for it. It reports each position the
 * register in ./identity-positions.ts names, with the path, the spelling stored there byte for byte, the
 * canonical id the alias relation gives, and the register entry that typed it.
 *
 * Where the declared types cannot say what a value is, the reader returns a block with the path and
 * a reason code and a sentence, and reads nothing there. That covers an unknown kind, an undeclared field, an unknown
 * variant of a union, a value that is not of its declared type, an open bag with something in it and
 * no reader of its own, and a change row whose field cannot be typed. It never looks for strings or
 * for objects with `kind` and `id` outside the declared types.
 *
 * An open bag is read by the type its writer writes into it, as ./open-shapes.ts declares it, or by the writer's own
 * reader. A key that type does not declare blocks at its own path, and a bag with no reader blocks whole.
 *
 * The writer stamped on a ledger row is read apart, because nothing declares its type. It is read only where
 * exactly one agent answers to the stamp, and it blocks where none or more than one does. A stamp a writer keeps inside
 * its own JSON is read the same way.
 *
 * A column outside the records table is read by the adapter its writer's type is written in, as ./open-shapes.ts lists
 * it in STORED_COLUMNS, and a field that holds a record's data is read by the kind its holder names.
 *
 * Given a teller, it tells it each value it comes to at a stamp or an actor pair, where the row says an agent wrote it,
 * with its path and its register entry, before it skips the office's own writers or an empty id. Where a value fits more
 * than one declared form, only the form it is read by tells; in today's register no stamp or actor pair lies under such a
 * value. The re-mint reads whom each names (./remint-stamps.ts).
 *
 * It only reads. The alias lookup is a SELECT, and no value it is given is changed.
 */
import type Database from 'better-sqlite3'
import { KIND_SPECS, type DeclaredType } from '@shared/kinds.ts'
import { pathStep, stepsOfPath } from '@shared/fielddiff.ts'
import { NEITHER_SIDE, UNREGISTERED_PREFIX, participantFromKey } from '@shared/messages.ts'
import { PARTICIPANT_KINDS, isOneOfTheOfficesOwnWriters } from '@shared/participants.ts'
import { THE_SECRETARY } from '@shared/roles.ts'
import { ACTOR_TYPES, type ActorType } from '@shared/types.ts'
import { PAIR_SEPARATOR, pairFrom } from '../message-pairs.ts'
import { AGENT_REGISTRY_NAMESPACE, registryAliasTarget } from './index.ts'
import { PARTICIPANT_SHAPE, thePositionAt, type LedgerStamp, type PlainIdColumn, type PositionParse } from './identity-positions.ts'
import { DATA_OF_A_KIND, FOREST_ZONES, OPEN_BAGS, STORED_COLUMNS, theShapeNamed, typeOf, type AdapterField, type DataOfAKind } from './open-shapes.ts'
import { theAgentsAStampCouldName } from './stamps.ts'

export interface IdentityFound {
  path: string
  /** The value is the key itself, the whole string, or the agent's part of an encoded string. */
  as: 'key' | 'value' | 'part'
  /** Exactly as stored. */
  stored: string
  canonical: string
  /** The register entry that typed it. */
  site: string
  parse: PositionParse
}

/** Why a block was returned. A caller tells blocks apart by the code and shows the sentence beside it. */
export const BLOCK_REASONS = [
  'unknown-kind', // the record's kind is not one kinds.ts declares
  'undeclared-field', // a key its owner does not declare
  'unknown-variant', // a union's tag names none of its variants
  'wrong-type', // the value is not of its declared type
  'no-form-reads', // the value fits more than one declared form and every one of them blocks
  'ambiguous', // more than one reading is possible and they disagree
  'open-bag', // an open bag with something in it and no reader, or a key in it that no reader declares
  'cannot-tell', // nothing stored says whether it names an agent
  'no-writer-kind', // an actor id with no writer's kind beside it
  'empty-id', // an id position holding the empty string
  'untyped-change', // a change row's field that cannot be typed to its end
  'no-kind', // a change row with no record or revision stored to give its kind
  'kind-changed', // a change row whose record has been more than one kind
  'not-json', // stored text that should be JSON and is not
  'names-no-agent', // an agent's stamp that no agent answers to, by id, old id or handle
  'untold', // a value that may name a person or an agent, with no kind stored beside it to say which
] as const
export type BlockReason = (typeof BLOCK_REASONS)[number]

export interface IdentityBlock {
  path: string
  reason: BlockReason
  why: string
}

export interface IdentityReading {
  found: IdentityFound[]
  blocks: IdentityBlock[]
}

/** A value at a stamp or an actor pair, where the row says an agent wrote it, exactly as stored. */
export interface AStampOrActorPair {
  path: string
  /** The register entry that typed it. */
  site: string
  stored: string
}

/** Told each value at a stamp or an actor pair as the reader comes to it. */
export type TellAStamp = (one: AStampOrActorPair) => void

interface Walk {
  db: Database.Database
  found: IdentityFound[]
  blocks: IdentityBlock[]
  tell?: TellAStamp | undefined
}

const isPlain = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function block(w: Walk, path: string, reason: BlockReason, why: string): void {
  w.blocks.push({ path, reason, why })
}

function add(w: Walk, path: string, as: IdentityFound['as'], stored: string, site: string): void {
  const entry = thePositionAt(site)
  if (entry === null) throw new Error(`The identity reader found an id at ${path} under ${site}, which the register does not list.`)
  addTheId(w, path, as, stored, site, entry.parse)
}

/** An id the register says is at `site`, with its canonical id. An empty one blocks. */
function addTheId(w: Walk, path: string, as: IdentityFound['as'], stored: string, site: string, parse: PositionParse): void {
  if (stored === '') return block(w, path, 'empty-id', 'is an empty id, which names nobody')
  const canonical = registryAliasTarget(w.db, { namespace: AGENT_REGISTRY_NAMESPACE, id: stored }) ?? stored
  w.found.push({ path, as, stored, canonical, site, parse })
}

/**
 * What one JSON value could be, by its JSON type alone. The same question `couldTake` in
 * shared/kinds/validation.ts asks before trying a choice.
 */
function jsonFits(node: DeclaredType, value: unknown): boolean {
  switch (node.kind) {
    case 'scalar':
      if (node.name === 'number') return typeof value === 'number'
      if (node.name === 'boolean') return typeof value === 'boolean'
      return typeof value === 'string'
    case 'literals':
      return typeof value === 'string'
    case 'array':
    case 'cells':
      return Array.isArray(value)
    case 'record':
    case 'open':
    case 'shape':
      return isPlain(value)
    case 'null':
      return value === null
    case 'either':
      return node.options.some((option) => jsonFits(option.node, value))
  }
}

function readValue(w: Walk, node: DeclaredType, value: unknown, path: string, site: string): void {
  switch (node.kind) {
    case 'scalar': {
      const fits = node.name === 'number' ? typeof value === 'number' && Number.isFinite(value) : node.name === 'boolean' ? typeof value === 'boolean' : typeof value === 'string'
      if (!fits) block(w, path, 'wrong-type', `is not a ${node.name}, which is its declared type`)
      return
    }
    case 'literals':
      if (typeof value !== 'string' || !node.values.includes(value)) block(w, path, 'wrong-type', `is not one of its declared values: ${node.values.join(', ')}`)
      return
    case 'null':
      if (value !== null) block(w, path, 'wrong-type', 'is not null, which is its declared type here')
      return
    case 'cells':
      if (!Array.isArray(value) || value.some((cell) => typeof cell !== 'string' && typeof cell !== 'number')) block(w, path, 'wrong-type', 'is not a list of strings and numbers, which is its declared type')
      return
    case 'open':
      return readOpenBag(w, value, path, site)
    case 'record': {
      if (!isPlain(value)) return block(w, path, 'wrong-type', 'is not an object, which is its declared type')
      const keyed = thePositionAt(site)?.parse === 'map-key'
      for (const [key, entry] of Object.entries(value)) {
        const at = pathStep(path, key)
        if (keyed) add(w, at, 'key', key, site)
        readValue(w, node.of, entry, at, site)
      }
      return
    }
    case 'array':
      if (!Array.isArray(value)) return block(w, path, 'wrong-type', 'is not a list, which is its declared type')
      value.forEach((entry, i) => readValue(w, node.of, entry, `${path}[${i}]`, site))
      return
    case 'shape':
      return readShape(w, node.name, value, path, site)
    case 'either':
      return readEither(w, node, value, path, site)
  }
}

function readEither(w: Walk, node: Extract<DeclaredType, { kind: 'either' }>, value: unknown, path: string, site: string): void {
  const fits = node.options.filter((option) => jsonFits(option.node, value))
  const only = fits.length === 1 ? fits[0] : undefined
  if (only !== undefined) return readValue(w, only.node, value, path, site)
  if (fits.length === 0) return block(w, path, 'wrong-type', `fits none of its declared forms: ${node.options.map((option) => option.expr).join(' | ')}`)
  const trials = fits.map((option) => {
    const told: AStampOrActorPair[] = []
    const trial: Walk = { db: w.db, found: [], blocks: [], tell: (one) => told.push(one) }
    readValue(trial, option.node, value, path, site)
    return { option, trial, told }
  })
  const clean = trials.filter((one) => one.trial.blocks.length === 0)
  const first = clean[0]
  if (first !== undefined && clean.every((one) => JSON.stringify(one.trial.found) === JSON.stringify(first.trial.found))) {
    w.found.push(...first.trial.found)
    for (const one of first.told) w.tell?.(one)
    return
  }
  if (first !== undefined) return block(w, path, 'ambiguous', `reads as more than one of its declared forms, and they find different identities`)
  block(w, path, 'no-form-reads', `reads as none of its declared forms: ${trials.map((one) => `as ${one.option.expr}, ${one.trial.blocks[0]?.path ?? path} ${one.trial.blocks[0]?.why ?? ''}`).join('; ')}`)
}

function readShape(w: Walk, name: string, value: unknown, path: string, site: string): void {
  const shape = theShapeNamed(name)
  if (shape === undefined) throw new Error(`A declared type names ${name}, and neither kinds.ts nor open-shapes.ts declares a shape by that name.`)
  if (!isPlain(value)) return block(w, path, 'wrong-type', `is not an object, so it is not the ${name} its type declares`)
  if (shape.discriminator) {
    const { key, variants } = shape.discriminator
    const tag = value[key]
    const variant = typeof tag === 'string' && Object.hasOwn(variants, tag) ? variants[tag] : undefined
    if (variant === undefined) return block(w, pathStep(path, key), 'unknown-variant', `is not a known variant of ${name}: ${Object.keys(variants).join(', ')}`)
    return readShape(w, variant, value, path, site)
  }
  const before = w.blocks.length
  readFields(w, name, shape.fields, value, path, shape.open)
  if (name === PARTICIPANT_SHAPE && w.blocks.length === before && value['kind'] === 'agent' && typeof value['id'] === 'string') {
    add(w, pathStep(path, 'id'), 'value', value['id'], site)
  }
}

function readFields(w: Walk, owner: string, fields: readonly AdapterField[], value: Record<string, unknown>, path: string, open = false): void {
  for (const [key, entry] of Object.entries(value)) {
    const at = pathStep(path, key)
    const field = fields.find((one) => one.key === key)
    if (field === undefined) {
      if (open) block(w, at, 'open-bag', `is a key of an open bag that ${owner} does not declare, so nothing reads it`)
      else block(w, at, 'undeclared-field', `is not a field ${owner} declares`)
      continue
    }
    readField(w, owner, field, entry, at, value)
  }
}

/**
 * One declared field's value. `holder` is the object the field sits in, or null when only the field's own
 * value is known, as in a change row.
 */
function readField(w: Walk, owner: string, field: AdapterField, value: unknown, at: string, holder: Record<string, unknown> | null): void {
  const site = `${owner}.${field.key}`
  const entry = thePositionAt(site)
  if (entry?.parse === 'historical') return readHistorical(w, site, value, at, holder)
  const data = DATA_OF_A_KIND[site]
  if (data !== undefined) return readDataOfAKind(w, site, data, value, at, holder)
  const before = w.blocks.length
  readValue(w, typeOf(field.type), value, at, site)
  if (entry === null || w.blocks.length !== before) return
  if (entry.parse === 'registry-id' && entry.present !== undefined) {
    if (holder === null) return block(w, at, 'no-writer-kind', `is read without ${entry.present} beside it, which says whether it names an agent`)
    if (holder[entry.present] === undefined) return
  }
  if (entry.parse === 'registry-id' && typeof value === 'string') return add(w, at, 'value', value, site)
  if (entry.parse === 'registry-id' && Array.isArray(value)) {
    value.forEach((one, i) => typeof one === 'string' && add(w, `${at}[${i}]`, 'value', one, site))
    return
  }
  if (entry.parse === 'cannot-tell') {
    if (typeof value === 'string') block(w, at, 'cannot-tell', `may name a person or an agent: ${entry.gate}`)
    return
  }
  if (entry.pair !== undefined) {
    if (holder === null) return block(w, at, 'no-writer-kind', `is read without ${entry.pair.field} beside it, which says whether an agent wrote it`)
    const kind = holder[entry.pair.field]
    if (kind === undefined) return block(w, at, 'no-writer-kind', `has no ${entry.pair.field} beside it to say whether an agent wrote it`)
    if (kind !== entry.pair.agent || typeof value !== 'string') return
    if (entry.parse === 'stamp') return readAStamp(w, at, 'value', value, site)
    if (entry.parse === 'actor-pair') w.tell?.({ path: at, site, stored: value })
    return add(w, at, 'value', value, site)
  }
  if (entry.parse === 'stamp' && typeof value === 'string') return readAStamp(w, at, 'value', value, site)
  if (entry.parse === 'encoded' && entry.below === undefined && typeof value === 'string') return readAnEncodedString(w, value, at, site)
}

/** A field that holds a record's data: read by the kind its holder names, after the marks its writer adds. */
function readDataOfAKind(w: Walk, site: string, data: DataOfAKind, value: unknown, at: string, holder: Record<string, unknown> | null): void {
  const kind = holder?.[data.kindIn]
  const spec = typeof kind === 'string' && Object.hasOwn(KIND_SPECS, kind) ? KIND_SPECS[kind as keyof typeof KIND_SPECS] : undefined
  if (spec === undefined) return block(w, at, 'unknown-kind', `is the data of a ${JSON.stringify(kind ?? null)}, which kinds.ts does not declare as a kind`)
  if (!isPlain(value)) return block(w, at, 'wrong-type', 'is not an object, so it is not the data of a record')
  const fields: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    const mark = Object.hasOwn(data.marks, key) ? data.marks[key] : undefined
    if (mark === undefined) fields[key] = entry
    else readValue(w, typeOf(mark), entry, pathStep(at, key), site)
  }
  readFields(w, kind as string, spec.fields, fields, at)
}

/**
 * A stamp: the handle a request named or the registry id its key proved. It is read only where exactly one agent answers
 * to it, and the office's own writers are not read at all. Nor is the value the register says names the person there.
 */
function readAStamp(w: Walk, path: string, as: IdentityFound['as'], stored: string, site: string): void {
  const entry = thePositionAt(site)
  if (entry === null) throw new Error(`The identity reader found a stamp at ${path} under ${site}, which the register does not list.`)
  if (entry.whenThePerson !== undefined && stored === entry.whenThePerson) return
  w.tell?.({ path, site, stored })
  if (isOneOfTheOfficesOwnWriters({ actorType: 'agent', actorId: stored })) return
  const reading = theStampRead(w.db, path, stored, site, entry.parse)
  w.found.push(...reading.found.map((one) => ({ ...one, as })))
  w.blocks.push(...reading.blocks)
}

const NOT_TYPE_AND_ID = `is not a writer's kind, ${ACTOR_TYPES.join(', ')}, and its id joined by a colon`
const NOT_KIND_AND_ID = `is not a participant's kind, ${PARTICIPANT_KINDS.join(', ')}, and its id joined by a colon`

/** A writer's type and its id, from the string that joins them with a colon, or null when it is not one. The re-mint reads a plain column's by it too (remint-plain.ts). */
export function aTypeAndId(value: string): { type: ActorType; id: string } | null {
  const colon = value.indexOf(':')
  const type = ACTOR_TYPES.find((one) => one === value.slice(0, colon))
  if (colon < 1 || type === undefined) return null
  return { type, id: value.slice(colon + 1) }
}

/** The fields that hold an id written inside a string of their own, each read by its writer's spelling. */
const ENCODED_STRINGS: Record<string, (w: Walk, value: string, path: string, site: string) => void> = {
  'RunRequestMessage.writtenBy': (w, value, path, site) => {
    const writer = aTypeAndId(value)
    if (writer === null) return block(w, path, 'wrong-type', NOT_TYPE_AND_ID)
    if (writer.type === 'agent') readAStamp(w, path, 'part', writer.id, site)
  },
  'ForestRegion.groupKey': (w, value, path, site) => readAGroupKey(w, value, path, site),
  'ForestAssignment.groupKey': (w, value, path, site) => readAGroupKey(w, value, path, site),
}

/** A map's group key: THE_SECRETARY, or the JSON list of the project or null, the zone, and the team's registry id or null. */
function readAGroupKey(w: Walk, value: string, path: string, site: string): void {
  if (value === THE_SECRETARY) return
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    parsed = undefined
  }
  const nullOrText = (one: unknown) => one === null || typeof one === 'string'
  if (!Array.isArray(parsed) || parsed.length !== 3 || !nullOrText(parsed[0]) || typeof parsed[1] !== 'string' || !FOREST_ZONES.includes(parsed[1]) || !nullOrText(parsed[2])) {
    return block(w, path, 'wrong-type', `is neither '${THE_SECRETARY}' nor the JSON list of a project or null, one of the zones ${FOREST_ZONES.join(', ')}, and a team or null`)
  }
  if (typeof parsed[2] === 'string') add(w, path, 'part', parsed[2], site)
}

function readAnEncodedString(w: Walk, value: string, path: string, site: string): void {
  const reader = ENCODED_STRINGS[site]
  if (reader === undefined) throw new Error(`The register lists ${site} as an id written inside a string, and nothing here reads it.`)
  reader(w, value, path, site)
}

/** The two fields with an older written form beside today's declared one. */
function readHistorical(w: Walk, site: string, value: unknown, at: string, holder: Record<string, unknown> | null): void {
  if (site === 'message.from') {
    if (typeof value === 'string') return
    if (!isPlain(value)) return block(w, at, 'wrong-type', 'is neither the words it is declared as nor the old {kind, id} form')
    const keys = Object.keys(value).sort().join(',')
    const kind = value['kind']
    const id = value['id']
    if (keys !== 'id,kind' || (kind !== 'person' && kind !== 'agent') || typeof id !== 'string') {
      return block(w, at, 'wrong-type', 'is an object but not the old {kind, id} form of a participant')
    }
    if (kind === 'agent') add(w, pathStep(at, 'id'), 'value', id, site)
    return
  }
  if (site === 'session.servingAgent') {
    if (typeof value !== 'string') return block(w, at, 'wrong-type', 'is not a string, which is its declared type')
    if (holder !== null && typeof holder['servingAgentId'] === 'string') return
    return block(w, at, 'cannot-tell', 'has no servingAgentId beside it, so it may be a handle or, on a run filed before 23 September 2026, a registry id, and nothing stored says which')
  }
  throw new Error(`The register lists ${site} as historical, and the reader has no reading of it.`)
}

/** The readers of the open bags that hold an id written inside a string. Only the dead-letter sweep has one, from its writer's shape. */
const ENCODED_READERS: Record<string, (w: Walk, value: Record<string, unknown>, path: string, site: string) => void> = {
  'message.deadLetterSweep': (w, value, path, site) => {
    for (const [key, entry] of Object.entries(value)) {
      const at = pathStep(path, key)
      if (key !== 'waiting') {
        block(w, at, 'open-bag', 'is part of the dead-letter sweep that nothing reads yet')
        continue
      }
      if (!Array.isArray(entry)) {
        block(w, at, 'wrong-type', 'is not a list of "<message id>~<agent id>" strings')
        continue
      }
      entry.forEach((one, i) => {
        const parts = typeof one === 'string' ? one.split('~') : []
        const agent = parts[1]
        if (parts.length !== 2 || parts[0] === '' || agent === undefined) return block(w, `${at}[${i}]`, 'wrong-type', 'is not one "<message id>~<agent id>" string')
        add(w, `${at}[${i}]`, 'part', agent, site)
      })
    }
  },
}

/** One open bag, by the way ./open-shapes.ts says it is read. */
function readOpenBag(w: Walk, value: unknown, path: string, site: string): void {
  if (!isPlain(value)) return block(w, path, 'wrong-type', 'is not an object, which is its declared type')
  if (Object.keys(value).length === 0) return
  const bag = OPEN_BAGS[site]
  if (bag === undefined) throw new Error(`kinds.ts declares an open bag at ${site}, and open-shapes.ts does not say how it is read.`)
  if (bag.reads === 'type') return readValue(w, typeOf(bag.type), value, path, site)
  if (bag.reads === 'check') {
    const refused = bag.check(value)
    if (refused !== null) block(w, path, 'wrong-type', `is not what its writer writes, as the writer's own reader says: ${refused}`)
    return
  }
  if (bag.reads === 'nothing') return block(w, path, 'open-bag', `is an open bag with something in it, and nothing reads it yet: ${bag.because}`)
  const reader = ENCODED_READERS[site]
  if (reader === undefined) throw new Error(`open-shapes.ts says ${site} holds ids written inside strings, and nothing here reads them.`)
  reader(w, value, path, site)
}

/** Every agent identity in one record's data, read by its kind. */
export function readRecordIdentities(db: Database.Database, kind: string, data: unknown, path = 'data', tell?: TellAStamp): IdentityReading {
  const w: Walk = { db, found: [], blocks: [], tell }
  const spec = Object.hasOwn(KIND_SPECS, kind) ? KIND_SPECS[kind as keyof typeof KIND_SPECS] : undefined
  if (spec === undefined) block(w, path, 'unknown-kind', `belongs to a record of kind ${JSON.stringify(kind)}, which kinds.ts does not declare`)
  else if (!isPlain(data)) block(w, path, 'wrong-type', 'is not an object')
  else readFields(w, kind, spec.fields, data, path)
  return { found: w.found, blocks: w.blocks }
}

export interface AChangeRow {
  field: string | null
  oldValue: string | null
  newValue: string | null
}

/** The change fields that hold no data: a title, a summary, a kind's name, a time or a project. */
const ENVELOPE_FIELDS: ReadonlySet<string> = new Set(['title', 'summary', 'kind', 'deletedAt', 'workspaceId'])

const takesText = (node: DeclaredType): boolean =>
  node.kind === 'either' ? node.options.some((option) => takesText(option.node)) : (node.kind === 'scalar' && (node.name === 'string' || node.name === 'date')) || node.kind === 'literals'

const takesJson = (node: DeclaredType): boolean =>
  node.kind === 'either' ? node.options.some((option) => takesJson(option.node)) : node.kind !== 'null' && !takesText(node)

/**
 * A change row's stored text read back as the value it was. The change log keeps a string as it is and
 * anything else as JSON, and keeps null as no text at all.
 */
function decodeChange(node: DeclaredType, text: string): { value: unknown } | { reason: BlockReason; why: string } {
  if (!takesJson(node)) return { value: text }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return takesText(node) ? { value: text } : { reason: 'not-json', why: 'is not JSON, and its declared type is not a string' }
  }
  if (!takesText(node) || typeof parsed === 'string') return takesText(node) ? { value: text } : { value: parsed }
  return { reason: 'ambiguous', why: 'could be the text as written or the JSON it spells, and its declared type takes both' }
}

/** The kind a change row is read by, or the reason no single kind is known for it. */
export type AChangesKind = { kind: string } | { reason: 'no-kind' | 'kind-changed'; why: string }

/**
 * THE KIND A CHANGE ROW IS READ BY, given every kind its record's row and its revisions hold: the one kind they share.
 * When they hold none, or more than one, the row has no kind to be read by, and the answer says which. The census and
 * the re-mint's history pass both read a change row by this rule.
 */
export function theKindAChangeIsReadBy(held: ReadonlySet<string> | undefined): AChangesKind {
  const kinds = [...(held ?? [])]
  const only = kinds.length === 1 ? kinds[0] : undefined
  if (only !== undefined) return { kind: only }
  if (kinds.length === 0) return { reason: 'no-kind', why: 'has no record or revision that says which kind it is' }
  return { reason: 'kind-changed', why: `belongs to a record that has been more than one kind: ${kinds.sort().join(', ')}` }
}

/**
 * Every agent identity in one change row. `kind` is the kind of the row's record, or the reason no single
 * kind is known for it, as theKindAChangeIsReadBy gives it.
 */
export function readChangeIdentities(
  db: Database.Database,
  kind: AChangesKind,
  row: AChangeRow,
  tell?: TellAStamp,
): IdentityReading {
  const w: Walk = { db, found: [], blocks: [], tell }
  const field = row.field
  if (field === null || ENVELOPE_FIELDS.has(field)) return { found: [], blocks: [] }
  if (field !== 'data' && !field.startsWith('data.') && !field.startsWith('data[')) {
    block(w, 'field', 'untyped-change', `is ${JSON.stringify(field)}, which no declared type covers`)
    return { found: w.found, blocks: w.blocks }
  }
  if ('why' in kind) {
    block(w, 'field', kind.reason, kind.why)
    return { found: w.found, blocks: w.blocks }
  }
  const sides = [['old_value', row.oldValue], ['new_value', row.newValue]] as const
  if (field === 'data') {
    for (const [column, text] of sides) {
      if (text === null) continue
      let value: unknown
      try {
        value = JSON.parse(text)
      } catch {
        block(w, column, 'not-json', 'is not JSON, and a whole record\'s data is stored as JSON')
        continue
      }
      const reading = readRecordIdentities(db, kind.kind, value, `${column}:data`, tell)
      w.found.push(...reading.found)
      w.blocks.push(...reading.blocks)
    }
    return { found: w.found, blocks: w.blocks }
  }
  const end = theTypeAtAChangePath(w, kind.kind, field)
  if (end === null) return { found: w.found, blocks: w.blocks }
  for (const [column, text] of sides) {
    if (text === null) continue
    const decoded = decodeChange(end.node, text)
    if ('why' in decoded) {
      block(w, column, decoded.reason, decoded.why)
      continue
    }
    const at = `${column}:${field}`
    if (end.field !== null) readField(w, end.owner, end.field, decoded.value, at, null)
    else readValue(w, end.node, decoded.value, at, end.site)
  }
  return { found: w.found, blocks: w.blocks }
}

/**
 * The declared type at a change row's path, walked from the kind. A map key on the way that the register
 * names is reported as found. An open bag on the way is walked by its adapter type. Null, with a block, when
 * the path cannot be typed.
 */
function theTypeAtAChangePath(w: Walk, kind: string, field: string): { node: DeclaredType; site: string; owner: string; field: AdapterField | null } | null {
  const steps = stepsOfPath(field)
  const spec = KIND_SPECS[kind as keyof typeof KIND_SPECS] as { fields: readonly AdapterField[] } | undefined
  if (spec === undefined || steps[0] !== 'data') {
    if (spec === undefined) block(w, 'field', 'unknown-kind', `belongs to a record of kind ${JSON.stringify(kind)}, which kinds.ts does not declare`)
    else block(w, 'field', 'untyped-change', 'does not start at data')
    return null
  }
  let level: { owner: string; fields: readonly AdapterField[]; open: boolean } | null = { owner: kind, fields: spec.fields, open: false }
  let node: DeclaredType | null = null
  let site = ''
  let i = 1
  while (true) {
    if (level !== null) {
      const step = steps[i]
      const found = step === undefined ? undefined : level.fields.find((one) => one.key === step)
      if (found === undefined) {
        if (level.open) block(w, 'field', 'open-bag', `goes through ${JSON.stringify(step ?? '')}, a key of an open bag that ${level.owner} does not declare`)
        else block(w, 'field', 'undeclared-field', `goes through ${JSON.stringify(step ?? '')}, which ${level.owner} does not declare`)
        return null
      }
      i += 1
      node = typeOf(found.type)
      site = `${level.owner}.${found.key}`
      if (i === steps.length) return { node, site, owner: level.owner, field: found }
      level = null
      continue
    }
    if (node === null) throw new Error('The change path walk lost its place.')
    if (i === steps.length) return { node, site, owner: '', field: null }
    const step = steps[i] as string
    if (node.kind === 'either') {
      const options: DeclaredType[] = node.options.map((option) => option.node).filter((one) => one.kind !== 'null')
      const only = options.length === 1 ? options[0] : undefined
      if (only === undefined) {
        block(w, 'field', 'untyped-change', `goes through ${site}, which has more than one declared form, and the row does not say which`)
        return null
      }
      node = only
      continue
    }
    if (node.kind === 'array') {
      node = node.of
      i += 1
      continue
    }
    if (node.kind === 'record') {
      if (thePositionAt(site)?.parse === 'map-key') add(w, `field:${field}`, 'key', step, site)
      node = node.of
      i += 1
      continue
    }
    if (node.kind === 'shape') {
      const shape = theShapeNamed(node.name)
      if (shape === undefined) throw new Error(`A declared type names ${node.name}, and neither kinds.ts nor open-shapes.ts declares a shape by that name.`)
      if (shape.discriminator) {
        block(w, 'field', 'untyped-change', `goes through ${node.name}, a union, and the row does not say which variant`)
        return null
      }
      level = { owner: node.name, fields: shape.fields, open: shape.open }
      continue
    }
    if (node.kind === 'open') {
      const bag = OPEN_BAGS[site]
      if (bag?.reads === 'type') {
        node = typeOf(bag.type)
        continue
      }
      if (bag?.reads === 'check') block(w, 'field', 'untyped-change', `goes into ${site}, an open bag that only its writer's own reader reads whole`)
      else block(w, 'field', 'open-bag', `goes into ${site}, an open bag that nothing reads yet`)
      return null
    }
    block(w, 'field', 'untyped-change', `goes below ${site}, which has no fields`)
    return null
  }
}

/**
 * A reader of the writer stamped on ledger rows, for one pass over a store. A stamp is the handle the request named or
 * the registry id its key proved, so it is read only where exactly one agent answers to it, by its id, an old id or a
 * handle. Each stamp is looked up once.
 */
export function aLedgerStampReader(db: Database.Database): (entry: LedgerStamp, row: Record<string, unknown>, tell?: TellAStamp) => IdentityReading {
  const asked = new Map<string, IdentityReading>()
  return (entry, row, tell) => {
    const path = entry.site.slice(entry.site.indexOf('.') + 1)
    const stored = row[path]
    if (row[entry.pair.field] !== entry.pair.agent) return { found: [], blocks: [] }
    if (typeof stored !== 'string') return { found: [], blocks: [{ path, reason: 'wrong-type', why: 'is not a string' }] }
    tell?.({ path, site: entry.site, stored })
    if (isOneOfTheOfficesOwnWriters({ actorType: entry.pair.agent, actorId: stored })) return { found: [], blocks: [] }
    const known = asked.get(stored)
    if (known !== undefined) return { found: known.found.map(one => ({ ...one, site: entry.site })), blocks: known.blocks }
    const reading = theStampRead(db, path, stored, entry.site, 'actor-pair')
    asked.set(stored, reading)
    return reading
  }
}

function theStampRead(db: Database.Database, path: string, stored: string, site: string, parse: PositionParse): IdentityReading {
  if (stored === '') return { found: [], blocks: [{ path, reason: 'empty-id', why: 'is an empty id, which names nobody' }] }
  const agents = theAgentsAStampCouldName(db, stored)
  if (agents.size === 0) return { found: [], blocks: [{ path, reason: 'names-no-agent', why: 'is an agent stamp that no agent answers to, by its id, an old id or a handle' }] }
  if (agents.size > 1) return { found: [], blocks: [{ path, reason: 'cannot-tell', why: 'is answered to by more than one agent, by an id, an old id or a handle, and nothing stored says which one wrote the row' }] }
  const canonical = registryAliasTarget(db, { namespace: AGENT_REGISTRY_NAMESPACE, id: stored }) ?? stored
  return { found: [{ path, as: 'value', stored, canonical, site, parse }], blocks: [] }
}

/**
 * Every agent identity in one stored column outside the records table, by the adapter STORED_COLUMNS gives it. `act` is
 * the act the row names, for a column read by its act. The path starts at the column's name.
 */
export function readStoredColumn(db: Database.Database, site: string, value: unknown, act: string | null = null, tell?: TellAStamp): IdentityReading {
  const column = Object.hasOwn(STORED_COLUMNS, site) ? STORED_COLUMNS[site] : undefined
  if (column === undefined) throw new Error(`The identity reader was asked to read ${site}, and open-shapes.ts does not list that column.`)
  const w: Walk = { db, found: [], blocks: [], tell }
  const path = site.slice(site.indexOf('.') + 1)
  if (column.reads === 'type') readValue(w, typeOf(column.type), value, path, site)
  else if (act !== null && Object.hasOwn(column.types, act)) readValue(w, typeOf(column.types[act as keyof typeof column.types]), value, path, site)
  else block(w, 'act', 'unknown-variant', `is ${JSON.stringify(act)}, which is not one of the acts the office knows: ${Object.keys(column.types).join(', ')}`)
  return { found: w.found, blocks: w.blocks }
}

/**
 * A reader of the agent identity in each plain column that PLAIN_ID_COLUMNS lists, from its row, for one pass over a
 * store. The text is not JSON. A column with a pair is read only when the pair's column in the same row says agent;
 * otherwise it names the person or another writer, and nothing is found. A row whose pair column holds nothing, where
 * the register marks the pair `untoldWithoutIt`, blocks as one that cannot be told. A "type:id" column is read only when
 * its type is agent, and a "kind:id" column or a contact only when its kind is agent. A pair of agents is read on both
 * sides, and the side it was read as only when it is one of them; a group's member is read as it is, and a read as
 * neither side names nobody. A registry id is read as it is. An id as sent, or a handle, is read only where exactly one
 * agent answers to it, and the office's own writers are not read; each of those is looked up once. The path is the
 * column's name.
 */
export function aPlainIdReader(db: Database.Database): (entry: PlainIdColumn, row: Record<string, unknown>, tell?: TellAStamp) => IdentityReading {
  const asked = new Map<string, IdentityReading>()
  const anAgentRecord = db.prepare("SELECT 1 FROM records WHERE id = ? AND kind = 'agent'")
  const anAgent = db.prepare('SELECT 1 FROM agents WHERE id = ?')
  const nothing = (): IdentityReading => ({ found: [], blocks: [] })
  const blocked = (path: string, reason: BlockReason, why: string): IdentityReading => ({ found: [], blocks: [{ path, reason, why }] })
  const theRegistryIds = (path: string, as: IdentityFound['as'], ids: string[], site: string): IdentityReading => {
    const w: Walk = { db, found: [], blocks: [] }
    for (const id of ids) addTheId(w, path, as, id, site, 'registry-id')
    return { found: w.found, blocks: w.blocks }
  }
  return (entry, row, tell) => {
    const path = entry.site.slice(entry.site.indexOf('.') + 1)
    const text = row[path]
    if (entry.form === 'side-of-pair' && text === NEITHER_SIDE) return nothing()
    if (entry.pair !== undefined && row[entry.pair.field] !== entry.pair.agent) {
      if (entry.pair.untoldWithoutIt === true && (row[entry.pair.field] ?? null) === null && typeof text === 'string') {
        return blocked(path, 'untold', `has nothing in ${entry.pair.field} beside it, so it may name a person or an agent: ${entry.gate}`)
      }
      return nothing()
    }
    if (typeof text !== 'string') return blocked(path, 'wrong-type', 'is not a string')
    let stored = text
    let as: IdentityFound['as'] = 'value'
    if (entry.form === 'type:id') {
      const writer = aTypeAndId(text)
      if (writer === null) return blocked(path, 'wrong-type', NOT_TYPE_AND_ID)
      if (writer.type !== 'agent') return nothing()
      stored = writer.id
      as = 'part'
    }
    if (entry.form === 'contact' && text.startsWith(UNREGISTERED_PREFIX)) return nothing()
    if (entry.form === 'kind:id' || entry.form === 'contact') {
      const who = participantFromKey(text)
      if (who === null) return blocked(path, 'wrong-type', NOT_KIND_AND_ID)
      if (who.kind !== 'agent') return nothing()
      stored = who.id
      as = 'part'
    }
    if (entry.form === 'pair') {
      if (!text.includes(PAIR_SEPARATOR)) return nothing()
      const pair = pairFrom(text)
      if (pair === null) return blocked(path, 'wrong-type', `is neither a group's id nor two agents' ids joined by ${PAIR_SEPARATOR}`)
      return theRegistryIds(path, 'part', pair.map(one => one.id), entry.site)
    }
    if (entry.form === 'side-of-pair') {
      // A group's id holds no tilde, and the member whose side it was is read as it is.
      const pair = row['pair']
      if (typeof pair !== 'string') return blocked(path, 'wrong-type', 'has no conversation in pair beside it')
      if (pair.includes(PAIR_SEPARATOR) && !(pairFrom(pair) ?? []).some(one => one.id === text)) return blocked(path, 'wrong-type', 'is neither side of the conversation in pair beside it')
    }
    if (entry.holds === 'record-or-registry-id') {
      if (anAgentRecord.get(stored) !== undefined) {
        if (anAgent.get(stored) === undefined) return nothing()
        return blocked(path, 'cannot-tell', "is the id of an agent record and an agent's registry id, and nothing stored says which it names")
      }
      return theRegistryIds(path, as, [stored], entry.site)
    }
    if (entry.holds === 'registry-id') return theRegistryIds(path, as, [stored], entry.site)
    tell?.({ path, site: entry.site, stored })
    if (isOneOfTheOfficesOwnWriters({ actorType: 'agent', actorId: stored })) return nothing()
    const known = asked.get(stored) ?? theStampRead(db, path, stored, entry.site, 'stamp')
    asked.set(stored, known)
    return { found: known.found.map(one => ({ ...one, path, as, site: entry.site })), blocks: known.blocks.map(one => ({ ...one, path })) }
  }
}
