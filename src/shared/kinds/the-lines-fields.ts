// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FIELDS A LINE'S FILE ADDS TO A KIND, AND THE JOIN THAT ADDS THEM.
 *
 * FieldsOfALine, the list of the line files and its guard, and withTheLinesFields were moved out of
 * src/shared/kinds.ts. Their comments changed only where they pointed at the central file; the
 * error sentences still name it, because it is the file a kind's fields are joined in.
 *
 * THIS FILE IMPORTS A TYPE FROM ./kind-common.ts, VALUES FROM ../types.ts AND ../zoom.ts, AND THE
 * LINE FILES FROM ../kind-fields/parts.ts. It imports nothing from src/shared/kinds.ts, so it makes
 * no runtime cycle with the central file.
 */
import * as FIELDS_OF_THE_LINES from '../kind-fields/parts.ts'
import { RECORD_KINDS, type RecordKind } from '../types.ts'
import { SHORT_FORMS_FIELD } from '../zoom.ts'
import type { FieldSpec } from './kind-common.ts'

/**
 * WHAT A LINE'S FILE UNDER src/shared/kind-fields EXPORTS: the kind it adds to, and its fields,
 * each one a FieldSpec as every field of a kind is. The head comment of src/shared/kinds.ts says
 * where such a file goes and how it is named.
 */
export interface FieldsOfALine {
  readonly kind: RecordKind
  readonly fields: readonly FieldSpec[]
}

/**
 * THE LINES' FILES, BY THE ORDER OF THEIR NAMES, as src/shared/kind-fields/parts.ts names them. A
 * file that names a kind with no spec stops this file loading, because the join below goes kind by
 * kind and would leave that file's fields out without a word.
 */
const THE_LINES_PARTS_NAMED: Readonly<Record<string, FieldsOfALine>> = FIELDS_OF_THE_LINES
const THE_LINES_PARTS = Object.entries(THE_LINES_PARTS_NAMED).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
for (const [name, { kind }] of THE_LINES_PARTS) {
  if (!(RECORD_KINDS as readonly string[]).includes(kind)) {
    throw new Error(
      `${name} in src/shared/kind-fields/parts.ts adds fields to the kind "${kind}", and no kind has ` +
        `that name. The kinds are: ${RECORD_KINDS.join(', ')}.`,
    )
  }
}

/**
 * ONE KIND'S FIELDS: ITS OWN, AS ITS KIND'S FILE WRITES THEM, AND THEN THE FIELDS EACH LINE'S FILE ADDS TO
 * IT, file by file in the order above and each file's fields in the order it writes them. A key is
 * declared in one place. A line's key that the kind declares, that `shortFormsField` gives every
 * kind, or that another line's file adds stops this file loading, and the error names both places.
 */
export function withTheLinesFields(kind: RecordKind, own: readonly FieldSpec[]): FieldSpec[] {
  const declaredBy = new Map<string, string>(own.map((field) => [field.key, `the ${kind} kind as src/shared/kinds.ts writes it`]))
  declaredBy.set(SHORT_FORMS_FIELD, 'shortFormsField in src/shared/kinds.ts, which gives every kind that field')
  const fields = [...own]
  for (const [name, part] of THE_LINES_PARTS) {
    if (part.kind !== kind) continue
    for (const field of part.fields) {
      const before = declaredBy.get(field.key)
      if (before !== undefined) {
        throw new Error(
          `The ${kind} field "${field.key}" is declared twice: by ${before}, and by ${name} in ` +
            'src/shared/kind-fields/parts.ts. Declare it in one place.',
        )
      }
      declaredBy.set(field.key, `${name} in src/shared/kind-fields/parts.ts`)
      fields.push(field)
    }
  }
  return fields
}
