// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
let writing = false

/** True only while the pack filing function is writing its record. */
export function thePackFilingIsWriting(): boolean { return writing }

/** Set the mark for one synchronous filing and always clear it. */
export function asThePackFiling<T>(write: () => T): T {
  if (writing) return write()
  writing = true
  try { return write() } finally { writing = false }
}
