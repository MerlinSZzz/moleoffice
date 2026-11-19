// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `noRecordHasThisId` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * `NO_SUCH_RECORD` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { PanelError } from './panel-error.ts'

/**
 * THE REFUSAL FOR AN ID THAT NAMES NO RECORD, at every door that goes through `recordInWorkspace`. A
 * message the reader may not read is refused with it too, so the two cannot be told apart.
 */
export function noRecordHasThisId(id: string): PanelError {
  return new PanelError(NO_SUCH_RECORD, 404, `No record with id ${id}.`, undefined, undefined, { code: 'recordNotFound', values: {} })
}
/**
 * WHAT A PERSON READS WHEN THE ID IN THE ADDRESS NAMES NOTHING.
 *
 * It used to be `No record with id NOPEnothere99` — the stored word `id` as a bare noun, the raw id
 * as the subject, and no full stop. A person meets this by pasting a link somebody sent them or by
 * following one that has gone stale, so the two things worth saying are that there is nothing here
 * and why there might not be. The id is still in `detail`, for an agent and for Developer mode.
 *
 * ONE STRING, because the same answer is thrown from a dozen readers here and in blocks.ts.
 */
export const NO_SUCH_RECORD =
  'There is no record at this address. It may have been deleted, or the link may be wrong.'
