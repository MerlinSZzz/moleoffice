// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `parse` was moved byte for byte out of src/server/lib/http.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { z } from 'zod'
import { explain } from '@shared/zod-words.ts'
import { PanelError } from './panel-error.ts'

/**
 * Check `value` against `schema`, or fail with a 400 the caller can read.
 *
 * `subject` is the start of the sentence, e.g. "The request body is not usable:".
 */
export function parse<S extends z.ZodType>(schema: S, value: unknown, subject: string): z.output<S> {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  throw new PanelError(`${subject} ${explain(result.error)}`)
}
