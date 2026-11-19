// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TYPE LANGUAGE A FIELD SPEC IS WRITTEN IN: the parsed form of a declared type, which field of
 * a record holds its blocks, and the parser that turns one written type into that form.
 *
 * They were moved out of src/shared/kinds.ts with no change of behaviour: the same declarations,
 * the same comments and the same values. `TypeNode` and `parseType` gained the `export` word
 * because the files that still read them are made one slice at a time.
 *
 * THIS FILE IMPORTS THE `FieldSpec` AND `KindSpec` TYPES FROM ./kind-common.ts, THE `RecordKind`
 * TYPE FROM ../types.ts, AND `KIND_SPECS` AND `SHAPE_SPECS` FROM ../kinds.ts. The two tables are
 * read only inside a function body, never while this file loads, because ../kinds.ts is what loads
 * this file.
 */
import type { FieldSpec, KindSpec } from './kind-common.ts'
import type { RecordKind } from '../types.ts'
import { KIND_SPECS, SHAPE_SPECS } from '../kinds.ts'

// ============================================================================ the type language
//
// FieldSpec.type is one string that a person reads and the checker parses. One string rather than
// two fields because a human-readable type and a machine-readable one that can disagree is the
// same class of bug as a stored key nothing reads.

export type TypeNode =
  | { kind: 'scalar'; name: 'string' | 'number' | 'boolean' | 'date' }
  | { kind: 'literals'; values: string[] }
  | { kind: 'array'; of: TypeNode }
  | { kind: 'cells' }
  | { kind: 'record'; of: TypeNode }
  /** `Record<string, unknown>`: the declared open bag. Its values are deliberately unchecked. */
  | { kind: 'open' }
  | { kind: 'shape'; name: string }
  /**
   * One field, two written forms — `date | PauseUntil`. Added for `obligation.due` and for one
   * reason: an obligation comes due on a date or on the thing a pause already describes, and those
   * are ONE fact with two spellings. The alternative was a second field beside `due`, which is two
   * fields for one fact with nothing making them agree — the defect this codebase keeps producing.
   */
  | { kind: 'either'; options: readonly { node: TypeNode; expr: string }[] }
  /**
   * `null`, only as one side of a choice: `string | null`. Added for the three fields where the office stores a null
   * that is an answer and not a gap: the effort it answers a launcher (null when it answers none) and the process row
   * found when a launcher ended (null when none was open). Leaving the key out would say nobody looked. The scoped
   * check iasdX1oUKtfh found the office storing those nulls under a declared `string`, so every later patch of the run
   * was refused.
   */
  | { kind: 'null' }

const SCALARS = ['string', 'number', 'boolean', 'date'] as const

/**
 * The parsed form of a declared type, for a caller that has to DRAW a field rather than check one.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS EXPORTED AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * `FieldSpec.type` is one string that a person reads and the checker parses, and until now only
 * the checker parsed it. A browser that wants to offer a BOX for a field has the same question the
 * checker has — is this a number, a vocabulary, a list, an object — and the only two ways to answer
 * it are this parser or a second one written beside the form. A second one is the defect this
 * codebase keeps producing: it would agree with this file on the day it was written and disagree
 * the first time a field changed shape, and the symptom would be a control that quietly writes the
 * wrong sort of value.
 *
 * So the form is built from the same parse the write is checked against. `parseType` itself stays
 * private — it takes a raw string, and a caller with a raw string has already gone round the
 * declaration.
 */
export type DeclaredType = TypeNode

/**
 * What one declared field really is, parsed from its own `type`.
 *
 * Throws on a type this file cannot read, exactly as the checker does — tests/validate.test.ts
 * parses every declared type, so a spec that would throw here fails the suite rather than a form.
 */
export function declaredTypeOf(field: FieldSpec): DeclaredType {
  return parseType(field.type)
}

/**
 * WHICH FIELD OF A RECORD'S `data` HOLDS ITS BLOCKS, READ OFF THE DECLARATION.
 *
 * A module keeps its curated summary in `summaryBlocks` and a report keeps the report itself in
 * `blocks`. Every other kind holds no blocks at all, and null says exactly that.
 *
 * IT IS FOUND RATHER THAN LISTED, and that is the point. The two field names were written out again
 * in `checkModuleSummary` and again in the server's target readers, so three places knew a fact the
 * declaration above already states, and any one of them could go wrong on its own with nothing
 * failing. This looks for the field whose declared type is `SummaryBlock[]`, so adding a third kind
 * that holds blocks is one field on that kind and nothing else.
 */
/**
 * WHICH KINDS OF RECORD HOLD BLOCKS, in a sentence a person reads: `a report in blocks, a module in
 * summaryBlocks`.
 *
 * Read off the declaration, so a kind given a block field appears here without anybody editing a
 * refusal message. This used to be a two-entry map written out in src/server/lib/targets.ts and the
 * sentence it produced was written out beside it, which is the same fact in two places twice over.
 */
export function whatHoldsBlocks(): string {
  const held = Object.keys(KIND_SPECS)
    .map((kind) => ({ kind, field: blocksFieldOf(kind) }))
    .filter((one): one is { kind: string; field: string } => one.field !== null)
    .map((one) => `a ${one.kind} in \`${one.field}\``)
  return held.length === 0 ? 'no kind of record holds blocks' : held.join(', ')
}

export function blocksFieldOf(kind: string): string | null {
  const spec = KIND_SPECS[kind as RecordKind] as KindSpec | undefined
  if (spec === undefined) return null
  return spec.fields.find((field) => field.type === 'SummaryBlock[]')?.key ?? null
}

const typeCache = new Map<string, TypeNode>()

/**
 * Parse a declared type. Throws on anything it does not understand, because a type in this file
 * that the checker cannot read would mean a field that is silently never checked — and a check
 * that quietly does nothing is worse than no check, since everybody believes it ran.
 * tests/validate.test.ts parses every declared type, so a typo here fails the suite, not a write.
 */
export function parseType(expr: string): TypeNode {
  const cached = typeCache.get(expr)
  if (cached) return cached
  const node = parseTypeUncached(expr.trim(), parseType, (name) => name in SHAPE_SPECS)
  typeCache.set(expr, node)
  return node
}

/**
 * A READER OF THIS FILE'S TYPE LANGUAGE THAT ALSO KNOWS SHAPES DECLARED OUTSIDE IT.
 *
 * The registry alias reader reads an open bag that this file declares as `Record<string, unknown>` by the type its
 * writer writes into it (src/server/lib/registry-aliases/open-shapes.ts). Those shapes are not shapes a caller may
 * write, so they are not in SHAPE_SPECS. Their types are still read by this one grammar, so a type written there means
 * what it means here. A name that SHAPE_SPECS already holds is refused, because one name would then be two shapes.
 */
export function aTypeReaderWith(shapes: ReadonlySet<string>): (expr: string) => DeclaredType {
  const twice = [...shapes].filter((name) => name in SHAPE_SPECS)
  if (twice.length > 0) throw new Error(`kinds.ts already declares the shapes ${twice.join(', ')}, so they cannot be declared again outside it.`)
  const cache = new Map<string, TypeNode>()
  const read = (expr: string): TypeNode => {
    const cached = cache.get(expr)
    if (cached) return cached
    const node = parseTypeUncached(expr.trim(), read, (name) => name in SHAPE_SPECS || shapes.has(name))
    cache.set(expr, node)
    return node
  }
  return read
}

function parseTypeUncached(expr: string, again: (expr: string) => TypeNode, isAShape: (name: string) => boolean): TypeNode {
  // The one hand-written type, because a union inside an array is the only place the grammar
  // would need brackets and one table cell is not worth a grammar.
  if (expr === '(string | number)[]') return { kind: 'cells' }

  // A quoted value, alone or in a union. `'text'` on its own is how a discriminator key is
  // declared, and it is a union of one rather than a special case.
  if (expr.startsWith("'")) {
    const values = expr.split('|').map((part) => {
      const m = /^\s*'([^']*)'\s*$/.exec(part)
      if (!m || m[1] === undefined) throw new Error(`kinds.ts: "${expr}" is not a union of quoted values, so nothing can check it`)
      return m[1]
    })
    return { kind: 'literals', values }
  }

  // A choice between two written FORMS, e.g. `date | PauseUntil`. It is tried after the quoted
  // union above, so a vocabulary is still a vocabulary and not a union of one-word forms, and it is
  // deliberately not recursive into arrays: `A[] | B` would need brackets and a grammar, and no
  // field wants one. Each alternative is parsed by the ordinary rules, so a typo in either half
  // still throws here rather than becoming a field nothing checks.
  if (expr.includes('|')) {
    const parts = expr.split('|').map((part) => part.trim())
    if (parts.length < 2 || parts.some((part) => part === '')) {
      throw new Error(`kinds.ts: "${expr}" is not a choice between two written forms, so nothing can check it`)
    }
    // `null` IS READ ONLY HERE, as one side of a choice. On its own it is still a type nothing can check, and throws below.
    return { kind: 'either', options: parts.map((part) => ({ node: part === 'null' ? { kind: 'null' } : again(part), expr: part })) }
  }

  if (expr.endsWith('[]')) return { kind: 'array', of: again(expr.slice(0, -2)) }

  const rec = /^Record<\s*string\s*,\s*(.+)>$/.exec(expr)
  if (rec && rec[1] !== undefined) {
    const inner = rec[1].trim()
    // `unknown` is legal only as the value type of a Record: that is the declared open bag.
    return inner === 'unknown' ? { kind: 'open' } : { kind: 'record', of: again(inner) }
  }

  if ((SCALARS as readonly string[]).includes(expr)) return { kind: 'scalar', name: expr as (typeof SCALARS)[number] }
  if (isAShape(expr)) return { kind: 'shape', name: expr }
  throw new Error(`kinds.ts: the type "${expr}" is not one this file can check. Add it to parseTypeUncached or use a declared shape.`)
}
