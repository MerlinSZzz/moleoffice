// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `refuseChapterEdit` was moved byte for byte out of src/server/lib/office-regulations.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { PanelError } from './panel-error.ts'

export function refuseChapterEdit(reason: string, status = 400): never {
  throw new PanelError(reason + ' Nothing was changed.', status, undefined, undefined, undefined, { code: 'chapterEditRefused', values: { reason } })
}
