// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER THE KEY ITEM DOORS ARE WRITING A KEY ITEM RIGHT NOW.
 *
 * A key item record is written only by src/server/lib/key-items.ts. `assertMayWrite` in lib/records/may-write.ts
 * refuses every write to the kind unless this says the key item doors are the writer. It is the booking's pattern
 * (lib/booking-door.ts): the database is written synchronously, so nothing else can write between setting the mark and
 * clearing it.
 *
 * ITS OWN FILE, IMPORTING NOTHING, because lib/records.ts reads it and lib/key-items.ts, which sets it, imports
 * lib/records.ts.
 */

let writing = false

/** True only while a key item door is inside its own write. */
export function theKeyItemDoorsAreWriting(): boolean {
  return writing
}

/** Run one write as the key item doors. The mark is cleared whether the write succeeds or throws. */
export function asTheKeyItemDoors<T>(write: () => T): T {
  if (writing) return write()
  writing = true
  try {
    return write()
  } finally {
    writing = false
  }
}
