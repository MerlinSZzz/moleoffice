// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER THE OFFICE IS WRITING A HOST JOB RIGHT NOW. A host job is written only by src/server/lib/host-jobs.ts, and
 * `assertMayWrite` in lib/records/may-write.ts refuses every other write to the kind. The flow run's pattern
 * (./flow-run-door.ts): the database is written synchronously, so nothing else can write between setting the mark and
 * clearing it.
 *
 * ITS OWN FILE, IMPORTING NOTHING, because lib/records.ts reads it and lib/host-jobs.ts, which sets it, imports
 * lib/records.ts.
 */

let writing = false

/** True only while the office is inside one of its own writes to a host job. */
export function theOfficeIsWritingAHostJob(): boolean {
  return writing
}

/** Run one write as the host-job writer. The mark is cleared whether the write succeeds or throws. */
export function asTheHostJobWriter<T>(write: () => T): T {
  if (writing) return write()
  writing = true
  try {
    return write()
  } finally {
    writing = false
  }
}
