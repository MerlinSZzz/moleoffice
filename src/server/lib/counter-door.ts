// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER A COUNTER'S OWN DOORS ARE WRITING A COUNTER RIGHT NOW.
 *
 * A counter record is written only by src/server/lib/counters.ts. `assertMayWrite` in lib/records/may-write.ts
 * — the one guard every create, change, kind change, delete, restore and move of a record asks —
 * refuses every write to the kind unless this says the counter's own doors are the writer. It is the
 * merge entry's pattern (`theMergeQueueIsWriting` in lib/merge-entry-door.ts), which is the seal's:
 * the database is written synchronously, so nothing else can write between setting the mark and
 * clearing it.
 *
 * ITS OWN FILE, IMPORTING NOTHING, because lib/records.ts reads it and lib/counters.ts, which sets
 * it, imports lib/records.ts. A module with no imports cannot be caught half-loaded in that cycle.
 */

let writing = false

/** True only while a counter door is inside its own write. */
export function theCounterDoorsAreWriting(): boolean {
  return writing
}

/** Run one write as the counter doors. The mark is cleared whether the write succeeds or throws. */
export function asTheCounterDoors<T>(write: () => T): T {
  if (writing) return write()
  writing = true
  try {
    return write()
  } finally {
    writing = false
  }
}
