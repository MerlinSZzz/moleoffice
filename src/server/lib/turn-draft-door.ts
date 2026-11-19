// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER MOLE OFFICE IS WRITING A TURN DRAFT RIGHT NOW.
 *
 * A turn draft holds what an agent's run wrote to one set of readers in one turn, and Mole Office sends it
 * (lib/turn-drafts.ts). Its `turn` field holds the message's other fields as the record door checked them, so a caller
 * that could write that field, or change a turn draft, could have Mole Office send words no door checked. The guards
 * in lib/records.ts refuse both unless this says lib/turn-drafts.ts is the writer. It is the draft send door's pattern
 * (lib/draft-door.ts): the database is written synchronously, so nothing else can write between setting the mark and
 * clearing it.
 *
 * ITS OWN FILE, IMPORTING NOTHING, because lib/records.ts reads it and lib/turn-drafts.ts, which sets it, imports
 * lib/records.ts.
 */

let writing = false

/** True only while lib/turn-drafts.ts is inside its own write. */
export function theTurnDraftsAreWriting(): boolean {
  return writing
}

/** Run one write as lib/turn-drafts.ts. The mark is cleared whether the write succeeds or throws. */
export function asTheTurnDrafts<T>(write: () => T): T {
  if (writing) return write()
  writing = true
  try {
    return write()
  } finally {
    writing = false
  }
}
