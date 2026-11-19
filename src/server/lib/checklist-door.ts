// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER A CHECKLIST'S OWN DOORS ARE WRITING A CHECKLIST RIGHT NOW.
 *
 * A checklist record is written only by src/server/lib/checklists.ts. `assertMayWrite` in lib/records/may-write.ts
 * refuses every write to the kind unless this says the checklist doors are the writer. It is the
 * counter's pattern (lib/counter-door.ts): the database is written synchronously, so nothing else can
 * write between setting the mark and clearing it.
 *
 * ITS OWN FILE, IMPORTING NOTHING, because lib/records.ts reads it and lib/checklists.ts, which sets
 * it, imports lib/records.ts.
 */

let writing = false

/** True only while a checklist door is inside its own write. */
export function theChecklistDoorsAreWriting(): boolean {
  return writing
}

/** Run one write as the checklist doors. The mark is cleared whether the write succeeds or throws. */
export function asTheChecklistDoors<T>(write: () => T): T {
  if (writing) return write()
  writing = true
  try {
    return write()
  } finally {
    writing = false
  }
}
