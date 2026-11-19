// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER THE PROJECT RULES' OWN DOORS ARE WRITING RIGHT NOW: a project chapter, a design review, or a design reminder.
 *
 * A project chapter and a design review are written only by src/server/lib/project-rules.ts, and a design reminder
 * only by src/server/lib/design-reminders.ts. `assertMayWrite` in lib/records/may-write.ts refuses every write to these kinds
 * unless this says those doors are the writer. It is the checklist's
 * pattern (lib/checklist-door.ts): the database is written synchronously, so nothing else can write between setting
 * the mark and clearing it.
 *
 * ITS OWN FILE, IMPORTING NOTHING, because lib/records.ts reads it and lib/project-rules.ts and
 * lib/design-reminders.ts, which set it, import lib/records.ts.
 */

let writing = false

/** True only while a project rules door is inside its own write. */
export function theProjectRulesDoorsAreWriting(): boolean {
  return writing
}

/** Run one write as the project rules doors. The mark is cleared whether the write succeeds or throws. */
export function asTheProjectRulesDoors<T>(write: () => T): T {
  if (writing) return write()
  writing = true
  try {
    return write()
  } finally {
    writing = false
  }
}
