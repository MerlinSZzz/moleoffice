// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER THE OFFICE IS WRITING A FLOW RUN RIGHT NOW. Wave 1 of the office flow, M1.
 *
 * A flow run is written only by src/server/lib/flow-runs.ts. `assertMayWrite` in lib/records/may-write.ts — the one
 * guard every create, change, kind change, delete, restore and move of a record asks — refuses every write
 * to the kind unless this says the office is the writer. It is the merge entry's pattern
 * (./merge-entry-door.ts): the database is written synchronously, so nothing else can write between
 * setting the mark and clearing it.
 *
 * ITS OWN FILE, IMPORTING NOTHING, because lib/records.ts reads it and lib/flow-runs.ts, which sets it,
 * imports lib/records.ts.
 */

let writing = false

/** True only while the office is inside one of its own writes to a flow run. */
export function theOfficeIsWritingAFlowRun(): boolean {
  return writing
}

/** Run one write as the office's flow-run writer. The mark is cleared whether the write succeeds or throws. */
export function asTheFlowRunWriter<T>(write: () => T): T {
  if (writing) return write()
  writing = true
  try {
    return write()
  } finally {
    writing = false
  }
}
