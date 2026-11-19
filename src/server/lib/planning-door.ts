// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER THE PLANNING DOORS ARE WRITING A MODULE'S `planning` RIGHT NOW, IN WAVE 13J ROUND 49.
 *
 * A module's `planning` is written only by src/server/lib/planning-flow.ts: the plan-step-done door, the submit door
 * and a hand tick of the checklist item the flow put. lib/records.ts refuses every other write that would set, change
 * or drop it unless this says the planning doors are the writer. The checklist doors' pattern (lib/checklist-door.ts):
 * the database is written synchronously, so nothing else can write between setting the mark and clearing it.
 *
 * ITS OWN FILE, IMPORTING NOTHING, because lib/records.ts reads it and lib/planning-flow.ts, which sets it, imports
 * lib/records.ts.
 */

let writing = false

/** True only while a planning door is inside its own write. */
export function thePlanningDoorsAreWriting(): boolean {
  return writing
}

/** Run one write as the planning doors. The mark is put back whether the write succeeds or throws. */
export function asThePlanningDoors<T>(write: () => T): T {
  const before = writing
  writing = true
  try {
    return write()
  } finally {
    writing = before
  }
}
