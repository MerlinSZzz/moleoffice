// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER THE DRAFT SEND DOOR IS WRITING RIGHT NOW.
 *
 * `sentAs` and `sentAt` on a draft are written by `sendADraft` in lib/drafts.ts and by nothing else,
 * and a sent draft is not changed after that. The guards in lib/records.ts refuse both unless this
 * says the send door is the writer. It is the merge queue's pattern (lib/merge-entry-door.ts): the
 * database is written synchronously, so nothing else can write between setting the mark and clearing
 * it.
 *
 * ITS OWN FILE, IMPORTING NOTHING, because lib/records.ts reads it and lib/drafts.ts, which sets it,
 * imports lib/records.ts.
 */

let writing = false

/** True only while the send door is inside its own write. */
export function theDraftSendDoorIsWriting(): boolean {
  return writing
}

/** Run one write as the send door. The mark is cleared whether the write succeeds or throws. */
export function asTheDraftSendDoor<T>(write: () => T): T {
  if (writing) return write()
  writing = true
  try {
    return write()
  } finally {
    writing = false
  }
}
