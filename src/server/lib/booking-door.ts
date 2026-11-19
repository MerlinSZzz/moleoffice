// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER THE BOOKING DOORS ARE WRITING A BOOKING RIGHT NOW.
 *
 * A booking record is written only by src/server/lib/bookings.ts. `assertMayWrite` in lib/records/may-write.ts
 * refuses every write to the kind unless this says the booking doors are the writer. It is the
 * checklist's pattern (lib/checklist-door.ts): the database is written synchronously, so nothing else
 * can write between setting the mark and clearing it.
 *
 * ITS OWN FILE, IMPORTING NOTHING, because lib/records.ts reads it and lib/bookings.ts, which sets it,
 * imports lib/records.ts.
 */

let writing = false

/** True only while a booking door is inside its own write. */
export function theBookingDoorsAreWriting(): boolean {
  return writing
}

/** Run one write as the booking doors. The mark is cleared whether the write succeeds or throws. */
export function asTheBookingDoors<T>(write: () => T): T {
  if (writing) return write()
  writing = true
  try {
    return write()
  } finally {
    writing = false
  }
}
