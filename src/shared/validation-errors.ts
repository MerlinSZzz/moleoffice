// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MESSAGE A CALLER SEES WHEN A RECORD'S DATA IS WRONG.
 * `formatValidationErrors` was moved byte for byte out of src/server/lib/validate.ts, with no change of
 * behaviour. That file imports it back and re-exports it.
 */

import type { RecordKind } from '@shared/types.ts'
import type { ValidationError } from '@shared/kinds.ts'

/**
 * Turn the errors into the message a caller sees.
 *
 * One problem per line, prefixed with a count, because a validator that reports only the first
 * failure makes the writer round-trip once per field. Every line names the path, what was wrong
 * and what a right value looks like, so an agent that cannot read this source can still fix it.
 */
export function formatValidationErrors(kind: RecordKind, errors: readonly ValidationError[]): string {
  const head =
    errors.length === 1
      ? `This ${kind} record was not stored, because one field is wrong:`
      : `This ${kind} record was not stored, because ${errors.length} fields are wrong:`
  const schema = `Every field a ${kind} takes is listed at GET /api/kinds/${kind}, with an example of each.`
  const lines = errors.map((e, index) => `  - ${e.message}${index === 0 ? ` ${schema}` : ''}`)
  return [head, ...lines].join('\n')
}
