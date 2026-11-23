// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORDS A WRITE IS REFUSED WITH: the error and incompleteness shapes the checker answers in,
 * and the helpers that describe a wrong value, a field's declared type and a shape's keys.
 *
 * They were moved out of src/shared/kinds.ts with no change of behaviour: the same declarations,
 * the same comments and the same values. `isPlainObject`, `asExample`, `describeValue`,
 * `recordValueType` and `typeGloss` gained the `export` word, because the checker and the later
 * slices read them.
 *
 * THIS FILE IMPORTS THE `TypeNode` TYPE FROM ./type-reader.ts AND `SHAPE_SPECS` FROM ../kinds.ts.
 * SHAPE_SPECS is read only inside a function body, never while this file loads, because
 * ../kinds.ts is what loads this file.
 */
import type { TypeNode } from './type-reader.ts'
import { SHAPE_SPECS } from '../kinds.ts'

// ============================================================================ error wording

export interface ValidationError {
  /** Where it is, as a caller would address it: `data.parts[0].items[1].state`. */
  path: string
  /** One sentence: what is wrong, and what a right value looks like. */
  message: string
}

/**
 * A required field that is not there. This is NOT an error: the record is stored.
 *
 * `path` addresses the field the way a caller would — `data.context` — so the same string works
 * as a UI anchor and as the key of the PATCH that fixes it. `message` is a sentence somebody can
 * act on, written in the voice of the field's own description: "context is required" tells the
 * author nothing they did not already know, and is what this type exists not to say.
 */
export interface Incompleteness {
  path: string
  message: string
}

/**
 * The result of checking one record's `data`.
 *
 * The failed branch carries no `incomplete` list on purpose. Nothing was stored, so there is no
 * record to be incomplete — and offering a half-report next to a refusal invites a caller to act
 * on the wrong half of it.
 */
export type ValidationResult =
  | { ok: true; data: Record<string, unknown>; incomplete: Incompleteness[] }
  | { ok: false; errors: ValidationError[] }

export const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** A value as JSON, short enough to sit inside a sentence. */
export function asExample(value: unknown): string {
  const json = JSON.stringify(value)
  if (json === undefined) return String(value)
  return json.length <= 200 ? json : `${json.slice(0, 197)}...`
}

/** What was actually there, in words, so the message is readable without the payload to hand. */
export function describeValue(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return `a list of ${v.length}`
  switch (typeof v) {
    case 'string':
      return v.trim() === '' ? 'an empty string' : `the string ${asExample(v)}`
    case 'number':
      return `the number ${v}`
    case 'boolean':
      return String(v)
    case 'object': {
      const keys = Object.keys(v as Record<string, unknown>)
      return keys.length === 0 ? 'an empty object' : `an object with the keys ${keys.slice(0, 6).join(', ')}`
    }
    default:
      return `a ${typeof v}`
  }
}

/** The value type inside `Record<string, X>`. */
export const recordValueType = (expr: string): string => expr.replace(/^Record<\s*string\s*,\s*(.+)>$/, '$1')

/** The declared type as a phrase, with the shape's own keys spelled out where there is one. */
export function typeGloss(node: TypeNode, expr: string): string {
  switch (node.kind) {
    case 'scalar': {
      if (node.name === 'string') return 'a non-empty string'
      if (node.name === 'number') return 'a number'
      if (node.name === 'boolean') return 'true or false'
      return 'a date like "2026-08-14", or a date and time like "2026-08-14 17:00"'
    }
    case 'literals':
      return `one of: ${node.values.join(', ')}`
    case 'cells':
      return 'a list whose entries are strings or numbers'
    case 'open':
      return 'a JSON object of your own keys'
    case 'record':
      return `an object whose values are each ${recordValueType(expr)}`
    case 'array': {
      const inner = expr.slice(0, -2)
      if (node.of.kind === 'literals') return `a list, each one of: ${node.of.values.join(', ')}`
      return node.of.kind === 'shape'
        ? `a list of ${inner} objects, each ${shapeGloss(node.of.name)}`
        : `a list of ${inner}`
    }
    case 'shape':
      return `${node.name}, an object ${shapeGloss(node.name)}`
    case 'null':
      return 'null'
    case 'either': {
      // A UNION OF NAMES READS AS ONE LIST OF NAMES. Option by option, `number | 'full' | 'wide' |
      // 'readable' | 'narrow'` came back as "a number, or one of: full, or one of: wide, or one of:
      // readable, or one of: narrow", which is four lists of one thing. Measured on the first field
      // to declare a union of a scalar and a vocabulary, 28 August 2026. A union with no quoted
      // values in it — `date | PauseUntil` is the only other one — reads exactly as it did before.
      const names = node.options.flatMap((option) => (option.node.kind === 'literals' ? option.node.values : []))
      const said = node.options
        .filter((option) => option.node.kind !== 'literals')
        .map((option) => typeGloss(option.node, option.expr))
      if (names.length > 0) said.push(`one of: ${names.join(', ')}`)
      return said.join(', or ')
    }
  }
}

/** `{id, name, items}` — the keys a shape takes, required ones first. */
function shapeGloss(name: string): string {
  const shape = SHAPE_SPECS[name]
  if (!shape) return '(unknown shape)'
  if (shape.discriminator) {
    return `chosen by its "${shape.discriminator.key}", one of: ${Object.keys(shape.discriminator.variants).join(', ')}`
  }
  const required = shape.fields.filter((f) => f.required).map((f) => f.key)
  const optional = shape.fields.filter((f) => !f.required).map((f) => `${f.key}?`)
  return `{${[...required, ...optional].join(', ')}}`
}
