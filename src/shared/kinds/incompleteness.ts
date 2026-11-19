// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A STORED RECORD STILL OWES: the required fields that are absent, the fields needed only in
 * some states, and the one envelope a decision also owes.
 *
 * They were moved out of src/shared/kinds.ts with no change of behaviour: the same declarations,
 * the same comments and the same values. `missingRequired` gained the `export` word, because the
 * checker that stays in kinds.ts reads it.
 *
 * THIS FILE IMPORTS THE `RecordKind` TYPE AND `RECORD_KINDS` FROM ../types.ts, THE `FieldSpec` AND
 * `KindSpec` TYPES FROM ./kind-common.ts, `asExample`, `describeValue`, `isPlainObject` AND THE
 * `Incompleteness` TYPE FROM ./describe-value.ts, `INCOMPLETE_FIELD_SENTENCE` FROM
 * ../record-reader-sentences.ts, `BUILT` AND `PART_OF_THE_OFFICE` FROM ../toolset.ts,
 * `EMERGENCY_PUSH_STATES` FROM ../emergency-push.ts, `DECISION_SUMMARY_BELONGS` FROM
 * ./decision.ts, AND `KIND_SPECS` FROM ../kinds.ts. KIND_SPECS is read only inside a function
 * body, never while this file loads, because ../kinds.ts is what loads this file.
 */
import { RECORD_KINDS, type RecordKind } from '../types.ts'
import type { FieldSpec, KindSpec } from './kind-common.ts'
import { asExample, describeValue, isPlainObject, type Incompleteness } from './describe-value.ts'
import { INCOMPLETE_FIELD_SENTENCE } from '../record-reader-sentences.ts'
import { BUILT, PART_OF_THE_OFFICE } from '../toolset.ts'
import { EMERGENCY_PUSH_STATES } from '../emergency-push.ts'
import { DECISION_SUMMARY_BELONGS } from './decision.ts'
import { KIND_SPECS } from '../kinds.ts'

// ============================================================================ incompleteness
//
// The reporting half of rule 3. A record with a required field missing is stored; these three
// functions are how anybody finds out which fields it still wants.

/**
 * Is this field not filled in?
 *
 * `undefined` is the ordinary case: the key was never sent. `null` and a blank string are here
 * because a record written before this check existed can hold either, and both render as the
 * same gap on the page — reporting them as present would be reporting a lie about a record a
 * reader is looking straight at. (Both are refused outright on the write path, so going forward
 * only the first case can reach storage.)
 *
 * An EMPTY LIST is not missing. `parts: []` is the declared way to say "nothing on the checklist
 * yet", and a checker that nagged about it would be arguing with its own documentation.
 */
function isNotFilledIn(value: unknown): boolean {
  if (value === undefined || value === null) return true
  return typeof value === 'string' && value.trim() === ''
}

/**
 * The sentence shown for a field nobody has filled in yet.
 *
 * It says what is absent, why that matters, and what to do about it — the "why" being the field's
 * own description, which is already written in the voice of somebody explaining the point of the
 * field rather than its type. The alternative, "data.context is required", is a sentence that
 * makes an author who left it out on purpose feel told off and teaches them nothing.
 */
function incompletenessFor(kind: RecordKind, field: FieldSpec): Incompleteness {
  const sentence = INCOMPLETE_FIELD_SENTENCE
    .replace('{field}', `data.${field.key}`)
    .replace('{kind}', kind)
  return {
    path: `data.${field.key}`,
    message:
      `${sentence} ${field.description} ` +
      `The record is kept either way — fill it in when you know it. Example: ${asExample(field.example)}`,
  }
}

/** Every required field of `spec` that `value` does not carry, in the order the spec declares. */
export function missingRequired(spec: KindSpec, value: Record<string, unknown>): Incompleteness[] {
  const out: Incompleteness[] = []
  for (const field of spec.fields) {
    const needed = field.required || NEEDED_WHEN[spec.kind]?.[field.key]?.(value) === true
    if (needed && isNotFilledIn(value[field.key])) out.push(incompletenessFor(spec.kind, field))
  }
  return out
}

/**
 * FIELDS DECLARED `required: false` THAT A RECORD STILL NEEDS IN SOME STATES, by kind and key.
 *
 * A tool's category is needed by a tool and a service, and a "part of the office" entry names none.
 * A tool's location is needed once it is built, and a planned tool may not know it yet. Declaring
 * either `required: true` would call a complete record incomplete. Each rule is written as a
 * sentence in the kind's `rules` as well, because a caller reading GET /api/kinds cannot see this.
 */
const NEEDED_WHEN: Partial<Record<RecordKind, Readonly<Record<string, (value: Record<string, unknown>) => boolean>>>> = {
  tool: {
    // Only a tool and a service: an entry that has not said what it is yet is incomplete for
    // `entry` itself, and asking for a category as well would be a guess about which it will be.
    category: (value) => value['entry'] !== undefined && value['entry'] !== PART_OF_THE_OFFICE,
    location: (value) => value['state'] === BUILT,
  },
  // A push has an end only once it has ended, so `ended` is needed by a pushed or stopped push and not by one pushing.
  emergency_push: {
    ended: (value) => EMERGENCY_PUSH_STATES.some((state) => state !== 'pushing' && state === value['state']),
  },
}

/**
 * What a record still needs, computed from the specs. THE READ PATH. It never throws.
 *
 * Call it on anything that came out of the database, including a record written before any of
 * this existed and one whose `data` is not even an object. A read that can throw takes down a
 * whole page because one stored record is bad, which is strictly worse than drawing the bad
 * record and saying what is wrong with it — the page is where somebody would notice and fix it.
 *
 * Nothing is stored or cached. Completeness is derived here, every time, from KIND_SPECS: a
 * column holding the answer would be stale the moment a spec changed, and stale silently.
 */
export function completenessOf(kind: RecordKind, data: unknown): Incompleteness[] {
  const spec = KIND_SPECS[kind]
  if (spec === undefined) {
    // Not reachable through the API, which checks the kind on the way in — but this function
    // promises never to throw on stored data, and saying so out loud beats returning [] and
    // letting a record of an unknown kind read as complete.
    return [
      {
        path: 'kind',
        message:
          `This record's kind is "${String(kind)}", which is not one Mole Office knows, so there is nothing to check it ` +
          `against. The kinds are: ${RECORD_KINDS.join(', ')}.`,
      },
    ]
  }

  // Missing and null are the same thing here: no data at all means every required field is
  // absent, which is exactly what a caller wants to be told.
  const value = data === undefined || data === null ? {} : data
  if (!isPlainObject(value)) {
    return [
      {
        path: 'data',
        message:
          `This ${kind}'s data is ${describeValue(value)} rather than an object, so none of the fields a ${kind} ` +
          `takes can be read off it. Replace it with an object: ${asExample(spec.example)}`,
      },
    ]
  }
  return missingRequired(spec, value)
}

/**
 * WHAT A RECORD'S ENVELOPE STILL OWES, when a kind asks for something beside its `data`.
 *
 * A DECISION IS THE ONE KIND THAT DOES. Its level-3 context is the envelope `summary`, and a
 * decision filed without one is incomplete rather than refused (criterion DC2). The path is
 * `summary` and not `data.summary`, because `summary` is the key a PATCH uses to fill it in and it
 * is not a key of `data`.
 *
 * EVERY OTHER KIND OWES NOTHING HERE. A report with no summary has no level 3 and says so, and that
 * is not incompleteness: the report kind's own rule says a length nobody wrote is a different
 * question from whether the record is complete.
 *
 * ABSENT, NULL AND BLANK ARE ALL "NOBODY WROTE ONE". Blank cannot be sent through the API — the
 * route refuses it — but a row written before that check existed can hold it, and it renders on the
 * page as the same gap as an absent one.
 */
export function envelopeIncompleteness(kind: RecordKind, summary: unknown): Incompleteness[] {
  if (kind !== 'decision') return []
  const written = typeof summary === 'string' && summary.trim() !== ''
  if (summary !== undefined && summary !== null && written) return []
  return [
    {
      path: 'summary',
      message:
        `summary is not filled in, so this decision is incomplete. A decision's level-3 context is ` +
        `${DECISION_SUMMARY_BELONGS}. The record is kept either way — write it when you know it.`,
    },
  ]
}

/**
 * What a stored record still needs: the fields in its `data` AND the envelope a kind also requires.
 *
 * THIS IS THE ONE PLACE THAT COMBINES THE TWO, so the server's reply and the browser's badge cannot
 * disagree about a decision with no summary. `completenessOf` stays the data-only reading; anything
 * holding a whole record asks here instead.
 */
export function recordIncompleteness(kind: RecordKind, data: unknown, summary: unknown): Incompleteness[] {
  return [...completenessOf(kind, data), ...envelopeIncompleteness(kind, summary)]
}
