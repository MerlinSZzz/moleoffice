// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHECK A WRITE GOES THROUGH: the walk over a record's `data` and over one nested shape, the
 * unknown-key refusal, the date grammar, and the two entry points `validateData` and
 * `validateShape`.
 *
 * They were moved out of src/shared/kinds.ts with no change of behaviour: the same declarations,
 * the same comments and the same values. No name changes: `validateData` and `validateShape` were
 * already exported, and every other declaration stays private here.
 *
 * THIS FILE IMPORTS THE `RecordKind` TYPE AND `RECORD_KINDS` FROM ../types.ts, THE `FieldSpec` TYPE
 * FROM ./kind-common.ts, `STAMP_GRAMMAR` FROM ../time.ts, THE KEY SUGGESTIONS FROM
 * ./key-suggestions.ts, THE REFUSAL WORDS FROM ./describe-value.ts, THE TYPE READER FROM
 * ./type-reader.ts, `missingRequired` FROM ./incompleteness.ts, `CROSS_CHECKS` FROM
 * ./cross-checks.ts, `SHAPE_CROSS_CHECKS` FROM ./shape-cross-checks.ts, THE ID CHECK FROM
 * ./ids-used-twice.ts, AND `KIND_SPECS` AND `SHAPE_SPECS` FROM ../kinds.ts. The two tables are read
 * only inside a function body, never while this file loads, because ../kinds.ts is what loads this
 * file.
 */
import { RECORD_KINDS, type RecordKind } from '../types.ts'
import type { FieldSpec } from './kind-common.ts'
import { STAMP_GRAMMAR } from '../time.ts'
import { AMBIGUOUS_WIDTH_KEYS, chooseShareOrMeasure, MOVED_OUT_OF_DATA, normaliseKey, suggestKey } from './key-suggestions.ts'
import { asExample, describeValue, isPlainObject, recordValueType, typeGloss, type ValidationError, type ValidationResult } from './describe-value.ts'
import { parseType, type TypeNode } from './type-reader.ts'
import { missingRequired } from './incompleteness.ts'
import { CROSS_CHECKS } from './cross-checks.ts'
import { SHAPE_CROSS_CHECKS } from './shape-cross-checks.ts'
import { IDS_CHECKED_ELSEWHERE, IDS_THAT_NAME_SOMETHING_ELSE, idsUsedTwice, type IdSeen } from './ids-used-twice.ts'
import { KIND_SPECS, SHAPE_SPECS } from '../kinds.ts'

// ============================================================================ the check

function checkUnknownKeys(
  value: Record<string, unknown>,
  fields: readonly FieldSpec[],
  path: string,
  what: string,
  errors: ValidationError[],
): void {
  const valid = fields.map((f) => f.key)
  for (const key of Object.keys(value)) {
    if (valid.includes(key)) continue
    const where = path === '' ? `data.${key}` : `${path}.${key}`

    // A key that left `data` altogether is answered first and answered differently: there is no
    // field to suggest, and the generic message below would send the author into `extra`, which is
    // the one place this particular key must not go. Skipped when the kind really has a field of
    // that name under another spelling, so a future field cannot be shadowed by this table.
    const moved = valid.some((k) => normaliseKey(k) === normaliseKey(key)) ? undefined : MOVED_OUT_OF_DATA[normaliseKey(key)]
    if (moved !== undefined) {
      errors.push({ path: where, message: `unknown key "${key}" — ${moved}` })
      continue
    }

    // A WIDTH THAT DOES NOT SAY WHOSE, ANSWERED WITH THE QUESTION RATHER THAN A GUESS. Asked before
    // the suggestion below, because the suggestion is exactly the guess this refuses to make. It
    // fires only where one of the two concepts is a real field on this shape, so `width` on a kind
    // that has neither is still answered by the ordinary sentence about a key nobody declared.
    const hasShare = valid.includes('share')
    const hasMeasure = valid.includes('measure')
    // A FILL-IN'S BOX HAS A WIDTH OF ITS OWN (wave 13k round 35). And on that shape
    // it is what a bare `width` most likely meant; `measure` would be refused there, as a fill-in holds no
    // writing. So the author is pointed at the one field that sets it.
    if (AMBIGUOUS_WIDTH_KEYS.includes(normaliseKey(key)) && valid.includes('boxWidth')) {
      errors.push({
        path: where,
        message: `unknown key "${key}" — the width of a fill-in's answer box is "boxWidth": "narrow" or "wide". Left out, a one-line box is narrow and a box of several lines is wide.`,
      })
      continue
    }
    if (AMBIGUOUS_WIDTH_KEYS.includes(normaliseKey(key)) && (hasShare || hasMeasure)) {
      errors.push({ path: where, message: chooseShareOrMeasure(key, hasShare, hasMeasure) })
      continue
    }

    const suggestion = suggestKey(key, valid)
    if (suggestion !== null) {
      errors.push({ path: where, message: `unknown key "${key}" — did you mean "${suggestion}"?` })
    } else {
      const hasExtra = valid.includes('extra')
      errors.push({
        path: where,
        message:
          `unknown key "${key}" — ${what} has no field by that name. It takes: ${valid.join(', ')}.` +
          (hasExtra
            ? ' Anything this kind has no field for goes inside "extra", where it is stored and shown but nothing reads it.'
            : ''),
      })
    }
  }
}

/**
 * Check one value against one declared field, appending to `errors`.
 *
 * `ids` is the list every `id` found on the way down is added to, so that one walk both checks the
 * fields and collects the identities. A second walk to find the ids would be a second reading of
 * the same declarations, which is how the two come to disagree. Null means "do not collect below
 * here": see IDS_CHECKED_ELSEWHERE.
 */
function checkField(value: unknown, spec: FieldSpec, path: string, errors: ValidationError[], ids: IdSeen[] | null): void {
  checkValue(value, parseType(spec.type), spec.type, path, spec, errors, ids)
}

function checkValue(
  value: unknown,
  node: TypeNode,
  expr: string,
  path: string,
  spec: FieldSpec | null,
  errors: ValidationError[],
  ids: IdSeen[] | null,
): void {
  const wrong = (extra?: string) => {
    const example = spec === null ? null : exampleFor(spec, node)
    // THE RULE, WHERE THE FIELD DECLARES ONE, AND LAST. The shape sentence comes first because a
    // caller has to know what to send; the rule comes after the example because it is what stops
    // them sending a different spelling of the same wrong thing. See `FieldSpec.refusal`, which
    // exists because a refusal reading only *must be one of: everyone* sent writers looking for a
    // typo when the real answer was that a quote may not be hidden at all.
    const rule = spec === null ? undefined : spec.refusal
    errors.push({
      path,
      message:
        `${path} must be ${typeGloss(node, expr)}, but it is ${describeValue(value)}.` +
        (extra === undefined ? '' : ` ${extra}`) +
        (example === null ? '' : ` A correct value looks like: ${asExample(example)}`) +
        (rule === undefined ? '' : ` The rule: ${rule}.`),
    })
  }

  switch (node.kind) {
    case 'scalar': {
      if (node.name === 'string' || node.name === 'date') {
        if (typeof value !== 'string') return wrong(value === null ? 'Leave the key out entirely rather than sending null.' : undefined)
        if (value.trim() === '') return wrong('A blank value renders as a gap that reads as missing data; leave the key out instead.')
        if (node.name === 'date' && !isReadableDate(value)) {
          errors.push({
            path,
            message:
              `${path} is "${value}", which is not a date Mole Office can read, so nothing will ever come due from it. ` +
              'Write "2026-08-14" for a whole day, or "2026-08-14 17:00" for a time. A bare date means the END of that day.',
          })
        }
        return
      }
      if (node.name === 'number') {
        if (typeof value !== 'number' || !Number.isFinite(value)) return wrong()
        return
      }
      if (typeof value !== 'boolean') return wrong()
      return
    }

    case 'literals': {
      if (typeof value !== 'string' || !node.values.includes(value)) return wrong()
      return
    }

    case 'null': {
      if (value !== null) return wrong()
      return
    }

    case 'cells': {
      if (!Array.isArray(value)) return wrong()
      value.forEach((cell, i) => {
        if (typeof cell === 'string') return
        if (typeof cell === 'number' && Number.isFinite(cell)) return
        errors.push({
          path: `${path}[${i}]`,
          message: `${path}[${i}] must be a string or a number, but it is ${describeValue(cell)}. Keep "not measured" as a string rather than inventing a number for it.`,
        })
      })
      return
    }

    case 'open': {
      // The declared open bag: it has to BE an object, and what is inside it is the author's
      // business. This is the one place Mole Office stores something it does not understand, and it
      // is a field with a name rather than a hole in the check.
      if (!isPlainObject(value)) return wrong()
      return
    }

    case 'record': {
      if (!isPlainObject(value)) return wrong()
      for (const [key, entry] of Object.entries(value)) {
        checkValue(entry, node.of, recordValueType(expr), `${path}.${key}`, null, errors, ids)
      }
      return
    }

    case 'array': {
      if (!Array.isArray(value)) return wrong()
      value.forEach((entry, i) => checkValue(entry, node.of, expr.slice(0, -2), `${path}[${i}]`, spec, errors, ids))
      return
    }

    case 'either': {
      // REPORT THE FORM THE CALLER WAS NEARLY WRITING, not every way the value is wrong. Somebody
      // who sent an object wants to know what is wrong with their object; being told it could also
      // have been a date buries the answer under a form they did not choose. Which form they meant
      // is not a guess — a string can never satisfy an object shape and an object can never satisfy
      // a date — so when exactly one alternative could take a value of this JSON type, its own
      // errors are the answer, and the empty-`until` sentence and the unreadable-date sentence both
      // survive intact.
      const possible = node.options.filter((option) => couldTake(option.node, value))
      const only = possible.length === 1 ? possible[0] : undefined
      if (only !== undefined) return checkValue(value, only.node, only.expr, path, spec, errors, ids)
      for (const option of node.options) {
        const attempt: ValidationError[] = []
        // Each trial collects into its own list, and only the reading that SUCCEEDS hands its ids
        // on. An id found while trying a form the caller did not write is not in the record.
        const attemptIds: IdSeen[] = []
        checkValue(value, option.node, option.expr, path, spec, attempt, ids === null ? null : attemptIds)
        if (attempt.length === 0) {
          if (ids !== null) ids.push(...attemptIds)
          return
        }
      }
      return wrong()
    }

    case 'shape': {
      const shape = SHAPE_SPECS[node.name]
      if (!shape) throw new Error(`kinds.ts: no shape called "${node.name}"`)
      if (!isPlainObject(value)) return wrong()

      // Below a shape whose ids another checker owns, nothing is collected. Naming the shape is
      // what stops this file and that one both policing the same rule. The second list is a
      // different question and has the same answer: an id that names a row somewhere else is a
      // reference rather than an address, and a record may hold the same reference twice.
      const collect =
        node.name in IDS_CHECKED_ELSEWHERE || node.name in IDS_THAT_NAME_SOMETHING_ELSE ? null : ids

      // A union: read the discriminator, then check the variant it selects. An unrecognised
      // discriminator names the ones that exist, because "invalid block" leaves the writer
      // guessing which of five shapes they were nearly writing.
      if (shape.discriminator) {
        const { key, variants } = shape.discriminator
        const tag = value[key]
        if (typeof tag !== 'string' || !Object.hasOwn(variants, tag)) {
          // A block author often writes `kind` because the record envelope itself uses `kind`.
          // Use that value only to inspect the likely variant and report its other faults. The
          // variant still checks its required `type`, and `kind` remains an unknown key, so this
          // diagnostic does not accept or rewrite the alternate spelling. Both lookups read only the
          // variants' own keys, so a block saying "constructor" is refused rather than crashing here.
          const guess = value['kind']
          const likelyVariant =
            key === 'type' && tag === undefined && typeof guess === 'string' && Object.hasOwn(variants, guess) ? variants[guess] : undefined
          if (likelyVariant !== undefined) {
            return checkValue(value, { kind: 'shape', name: likelyVariant }, likelyVariant, path, null, errors, collect)
          }
          errors.push({
            path: `${path}.${key}`,
            message:
              `${path}.${key} must be one of: ${Object.keys(variants).join(', ')}, but it is ${describeValue(tag)}. ` +
              `That key decides what the rest of the object has to contain.`,
          })
          return
        }
        const variantName = variants[tag]
        if (variantName === undefined) return
        return checkValue(value, { kind: 'shape', name: variantName }, variantName, path, null, errors, collect)
      }

      const before = errors.length
      for (const field of shape.fields) {
        const entry = value[field.key]
        if (entry === undefined) {
          if (field.required) {
            errors.push({
              path: `${path}.${field.key}`,
              message: `${path}.${field.key} is required. ${field.description} Example: ${asExample(field.example)}`,
            })
          }
          continue
        }
        checkField(entry, field, `${path}.${field.key}`, errors, collect)
      }
      checkUnknownKeys(value, shape.fields, path, `a ${shape.name}`, errors)

      // This object's own id, once its keys are known to be sound. A shape that declares `id` as a
      // required string is declaring an identity; `idsUsedTwice` is what holds it to that.
      const idField = shape.fields.find((f) => f.key === 'id')
      const idValue = value['id']
      if (collect !== null && idField !== undefined && idField.required && idField.type === 'string' && typeof idValue === 'string') {
        collect.push({ shape: shape.name, id: idValue, path })
      }

      // Rules that need two keys of this object, run only once its own keys are sound — the same
      // ordering as the per-kind rules, and for the same reason: a rule about `upTo` has nothing
      // useful to say while `gate` is a number.
      if (errors.length === before) {
        const cross = SHAPE_CROSS_CHECKS[shape.name]
        if (cross) errors.push(...cross(value, path))
      }
      return
    }
  }
}

/**
 * Could a value of this JSON type ever satisfy this node? A test of the SHAPE ONLY — a string for a
 * date, an object for a shape — never of whether the value is right.
 *
 * It exists so that a field written in two forms can report the errors of the form the caller
 * actually wrote. It is deliberately coarse: getting it wrong in the loose direction costs nothing,
 * because the alternatives are then all tried and the generic message is the fallback.
 */
function couldTake(node: TypeNode, value: unknown): boolean {
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
      return isPlainObject(value)
    case 'null':
      return value === null
    case 'either':
      return node.options.some((option) => couldTake(option.node, value))
  }
}

/**
 * The example to show for a failure at this node.
 *
 * A failure on `data.parts` shows the whole list; a failure on `data.parts[0]` shows one entry of
 * it, because printing the whole list to explain one bad element buries the answer.
 */
function exampleFor(spec: FieldSpec, node: TypeNode): unknown {
  const insideAList = node.kind !== 'array' && node.kind !== 'cells'
  if (insideAList && Array.isArray(spec.example) && spec.example.length > 0) return spec.example[0]
  return spec.example
}

/**
 * Dates as the rest of Mole Office reads them: "2026-08-14", "2026-08-14 17:00", "2026-08-14 17:00:00"
 * or the ISO "T" form.
 *
 * The grammar comes from `./time.ts`, which is also what `parseLocalStamp` reads with, so a date
 * this ACCEPTS is a date that will PARSE. Those two must agree — a date accepted here that cannot
 * be parsed there is an obligation that never comes due — and until recently they agreed only
 * because a comment here said "matches parseLocalStamp in attention.ts". A comment is not a
 * mechanism. Elsewhere in this codebase the same arrangement let a reader drift to UTC for two
 * months without anything failing.
 *
 * Anchored at BOTH ends here, because this validates a whole value a caller wrote, while the
 * parsers anchor at the start only, because they read a stamp and ignore what follows.
 */
const READABLE_DATE = new RegExp(`^${STAMP_GRAMMAR}\\s*$`)

function isReadableDate(value: string): boolean {
  const m = READABLE_DATE.exec(value.trim())
  if (!m) return false
  const [, y, mo, d, hh, mm, ss] = m
  const year = Number(y)
  const month = Number(mo)
  const day = Number(d)
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  // Reject a day that does not exist in that month: "2026-02-31" parses as 3 March otherwise,
  // and an obligation quietly due three days later than written is worse than a refused write.
  const probe = new Date(year, month - 1, day)
  if (probe.getMonth() !== month - 1 || probe.getDate() !== day) return false
  if (hh !== undefined && Number(hh) > 23) return false
  if (mm !== undefined && Number(mm) > 59) return false
  if (ss !== undefined && Number(ss) > 59) return false
  return true
}

/**
 * Check a record's `data` against the spec for its kind.
 *
 * Returns every problem it finds rather than the first, because a caller fixing one field at a
 * time round-trips five times to learn what a module needs. Nothing is normalised: `data` comes
 * back exactly as it went in.
 *
 * TWO KINDS OF ANSWER, and the difference is rule 3 at the top of this file. Anything WRONG —
 * an unknown key, a wrong type, a value outside a vocabulary, a half-written nested object —
 * comes back as `ok: false` and the record is not stored. Anything MISSING comes back as
 * `ok: true` with an entry in `incomplete`: the record is stored and says what it still wants.
 *
 * `undefined` and `null` `data` are treated as an empty object, so a POST with no body is a
 * legitimate stub. It is stored, and it reports every required field as not filled in — an
 * obligation with no `due` will say, on every read, that it can never come due. That report is
 * the thing that was missing when this was a silent 201; refusing the write is not the only way,
 * and it is the way that stops you filing what you know now and finishing it later.
 */
export function validateData(kind: RecordKind, data: unknown): ValidationResult {
  const spec = KIND_SPECS[kind]
  if (spec === undefined) {
    return {
      ok: false,
      errors: [{ path: 'kind', message: `"${String(kind)}" is not a record kind. The kinds are: ${RECORD_KINDS.join(', ')}.` }],
    }
  }

  const value = data === undefined || data === null ? {} : data
  if (!isPlainObject(value)) {
    return {
      ok: false,
      errors: [
        {
          path: 'data',
          message: `data must be a JSON object, but it is ${describeValue(value)}. For a ${kind} it looks like: ${asExample(spec.example)}`,
        },
      ],
    }
  }

  const errors: ValidationError[] = []
  // Every id found on the way down, so that "no two of one shape share an id" is answered from the
  // same walk that checked the fields rather than from a second reading of the same declarations.
  const ids: IdSeen[] = []
  for (const field of spec.fields) {
    const entry = value[field.key]
    // Absent is not an error, whatever `required` says: it is reported below, after the record
    // is known to be otherwise sound. A `null` is NOT absent and falls through to checkField,
    // which refuses it — sending null is a decision to store a value nothing can read, and it is
    // the one shape of "missing" that arrives by mistake rather than on purpose.
    if (entry === undefined) continue
    checkField(entry, field, `data.${field.key}`, errors, ids)
  }
  checkUnknownKeys(value, spec.fields, '', `a ${kind} record`, errors)

  // Cross-field rules only run once the fields themselves are sound. A rule about `cost` and
  // `currency` has nothing useful to say while `cost` is a string.
  //
  // These stay HARD failures even though some of them are about something absent: they fire on
  // a contradiction between values that ARE there. A direction saying `depth: "measured"` with
  // no evidence is not an unfinished record, it is a record making a claim it cannot support,
  // and the honest fix is to write a shallower depth rather than to enrich it later.
  //
  // A repeated id waits for the same all-clear and for the same reason: while a part is not an
  // array or an item is not an object, the ids gathered are a partial reading of a record nobody
  // can store anyway, and naming a duplicate from a half-read checklist would point at the wrong
  // line.
  if (errors.length === 0) {
    errors.push(...idsUsedTwice(ids))
    const cross = CROSS_CHECKS[kind]
    if (cross) errors.push(...cross(value))
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, data: value, incomplete: missingRequired(spec, value) }
}

/**
 * Check one nested shape on its own — a single checklist item, one summary block, one path.
 *
 * The record path is the one that matters, but an editor that is changing one item inside a
 * module should be able to ask about that item rather than rebuilding the whole record to find
 * out, and the tests use it to prove that every example in SHAPE_SPECS is itself valid.
 */
export function validateShape(shape: string, value: unknown, path = 'value'): ValidationResult {
  if (!(shape in SHAPE_SPECS)) {
    return {
      ok: false,
      errors: [{ path, message: `"${shape}" is not a shape Mole Office knows. They are: ${Object.keys(SHAPE_SPECS).join(', ')}.` }],
    }
  }
  const errors: ValidationError[] = []
  // The same collection as validateData's, because a shape can hold an array of shapes: one
  // ModulePart carries the module's checklist lines, and two of those sharing an id is the same
  // fault whether it is asked about through the record or through the part.
  const ids: IdSeen[] = []
  checkValue(value, { kind: 'shape', name: shape }, shape, path, null, errors, ids)
  if (errors.length === 0) errors.push(...idsUsedTwice(ids))
  if (errors.length > 0) return { ok: false, errors }
  // Anything that is not an object has already failed above. Saying so out loud rather than
  // substituting {} — a validator that quietly returns an empty result on a case it thought was
  // impossible is how "it validated fine" comes to mean nothing.
  if (!isPlainObject(value)) throw new Error(`kinds.ts: a ${shape} passed validation without being an object`)
  // Always empty, and it has to be: a nested shape you have written at all must be written whole
  // (rule 3), so a missing key inside one is already an error above. The field is here because
  // the caller reads one ValidationResult type, not two.
  return { ok: true, data: value, incomplete: [] }
}
