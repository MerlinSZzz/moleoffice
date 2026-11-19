// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FIELDS A DECISION KEEPS IN ONE HALF OR THE OTHER, in a file of their own.
 *
 * The two helpers were moved out of src/shared/kinds.ts with their comments unchanged. They read
 * KIND_SPECS from ../kinds.ts inside the functions only, so the cycle that file and this one make
 * is resolved before either asks the other for a value; ./validation.ts has the same shape.
 */
import { KIND_SPECS } from '../kinds.ts'
import type { DecisionHalf, FieldSpec } from './kind-common.ts'

/**
 * THE FIELDS A DECISION KEEPS IN ONE HALF OR THE OTHER. Criterion P76.
 *
 * The split is declared on the fields themselves, so the guard, the kind's own notes and the page
 * read one answer. A field that carries no `half` is not a decision field and is in neither list.
 */
export function decisionFieldsIn(half: DecisionHalf): FieldSpec[] {
  return KIND_SPECS['decision'].fields.filter((field) => field.half === half)
}

/** The core keys, for the guard that asks whether a write would move the decision itself. */
export function decisionCoreFieldKeys(): string[] {
  return decisionFieldsIn('core').map((field) => field.key)
}
