// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER THE MERGE QUEUE'S OWN DOORS ARE WRITING A MERGE ENTRY RIGHT NOW.
 *
 * A merge entry is written only by src/server/lib/merge-queue.ts. `assertMayWrite` in lib/records/may-write.ts
 * — the one guard every create, change, kind change, delete, restore and move of a record asks —
 * refuses every write to the kind unless this says the queue is the writer. It is the seal's pattern
 * (`officeIsWritingSeal` in lib/sealed-tip.ts): the database is written synchronously, so nothing else
 * can write between setting the mark and clearing it.
 *
 * ITS OWN FILE, IMPORTING NOTHING, because lib/records.ts reads it and lib/merge-queue.ts, which sets
 * it, imports lib/records.ts. A module with no imports cannot be caught half-loaded in that cycle.
 */

let writing = false

/** True only while a merge queue door is inside its own write. */
export function theMergeQueueIsWriting(): boolean {
  return writing
}

/** Run one write as the merge queue. The mark is cleared whether the write succeeds or throws. */
export function asTheMergeQueue<T>(write: () => T): T {
  if (writing) return write()
  writing = true
  try {
    return write()
  } finally {
    writing = false
  }
}
