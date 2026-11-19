// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER THE ANSWER DOOR IS WRITING RIGHT NOW, by two
 * decisions.
 *
 * A report's `answers` holds the person's answers to the questions in it, and it is written by
 * `keepAnAnswer` and `sendAnswers` in lib/answers.ts and by nothing else. The guard in lib/records.ts
 * refuses every other write of it unless this says the answer door is the writer. It is the draft send
 * door's pattern (lib/draft-door.ts): the database is written synchronously, so nothing else can write
 * between setting the mark and clearing it.
 *
 * ITS OWN FILE, IMPORTING NOTHING, because lib/records.ts reads it and lib/answers.ts, which sets it,
 * imports lib/records.ts.
 */

let writing = false

/** True only while the answer door is inside its own write. */
export function theAnswerDoorIsWriting(): boolean {
  return writing
}

/** Run one write as the answer door. The mark is cleared whether the write succeeds or throws. */
export function asTheAnswerDoor<T>(write: () => T): T {
  if (writing) return write()
  writing = true
  try {
    return write()
  } finally {
    writing = false
  }
}
