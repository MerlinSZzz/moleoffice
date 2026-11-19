// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theKeyWindowIsClosed` was moved byte for byte out of src/server/lib/keywindow.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { theKeyWindowSays } from './the-key-window-says.ts'

/**
 * WHETHER THE WINDOW IS CLOSED. The one question `theHeaderWindowCovers` asks.
 *
 * It reads the cache, so a listener-carried caller with no key pays one map lookup and not a
 * database read.
 */
export function theKeyWindowIsClosed(): boolean {
  return !theKeyWindowSays().open
}
