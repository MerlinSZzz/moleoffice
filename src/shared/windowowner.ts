// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHOSE WINDOW IT IS: ONE READER OF THE `<type>:<id>` STAMP EVERY PLANNING TABLE CARRIES.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS, AND WHY IT IS THE ONLY PLACE THAT ANSWERS
 * ---------------------------------------------------------------------------------------
 *
 * No planning table has an owner column. Every one of them carries `created_by`, and its spelling
 * is settled: `${actor.type}:${actor.id}`, so "human:owner" or "agent:orbit". Two surfaces need the
 * same fact — the Schedule, which draws one person's hours and now an agent's windows beside them,
 * and the planning page, which says whose window each part carries — and criterion P5 says the
 * second colour must say WHOSE the window is. A second split of the same string in either surface
 * is one fact worked out in two places, which is the ninth invariant of USER.md.
 *
 * So the split lives here, and both surfaces call it. Nothing here opens a database and nothing
 * here reads a file: it is a pure function of the stored string.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES WITH A STAMP IT CANNOT READ
 * ---------------------------------------------------------------------------------------
 *
 * A stamp that is missing, empty or has no colon is a real answer and it is returned as its own
 * kind, `unreadable`, with the words a screen draws. It is NEVER reported as the person's: a window
 * whose writer nobody recorded is not a window the person wrote, and dressing the absence as theirs
 * would be the fifth invariant's whole complaint. The kind is not a guess; it says which of the
 * four cases it read.
 */

/** Which of the four things a `created_by` stamp turned out to be. */
export type WindowOwnerKind = 'person' | 'agent' | 'other' | 'unreadable'

/** Whose window a stamp names, in the form a screen draws. */
export interface WindowOwner {
  kind: WindowOwnerKind
  /**
   * The id after the colon, the whole stamp when it had no colon, or the empty string when it was
   * missing entirely. Present even for an unreadable stamp so a caller can always name the bytes.
   */
  id: string
  /** What a reader is told, in one plain sentence fragment. Never empty, never a bare id. */
  word: string
  /** True only when this is the person's own window. The person's window is what the hours are. */
  isThePerson: boolean
}

/** What a screen says when the stamp is missing or empty. One string, so no surface invents one. */
export const NOBODY_RECORDED_THE_WINDOW_OWNER = 'nobody recorded who placed this window'

/** Split a `${actor.type}:${actor.id}` stamp into the one fact a reader needs. */
export function ownerOfWindow(createdBy: string | null | undefined): WindowOwner {
  if (typeof createdBy !== 'string' || createdBy.trim() === '') {
    return {
      kind: 'unreadable',
      id: '',
      word: NOBODY_RECORDED_THE_WINDOW_OWNER,
      isThePerson: false,
    }
  }
  const stamp = createdBy.trim()
  const colon = stamp.indexOf(':')
  // NO COLON, OR NOTHING AFTER IT, IS A STAMP THIS READER CANNOT READ. It is said rather than
  // guessed at, and the words carry what was stored so somebody can find the row and mend it.
  if (colon <= 0 || colon === stamp.length - 1) {
    return {
      kind: 'unreadable',
      id: stamp,
      word: `this window carries the stamp "${stamp}", which is not a name this reader can read`,
      isThePerson: false,
    }
  }
  const type = stamp.slice(0, colon)
  const id = stamp.slice(colon + 1)
  if (type === 'human') {
    return { kind: 'person', id, word: `${id}'s window`, isThePerson: true }
  }
  if (type === 'agent') {
    return { kind: 'agent', id, word: `${id}'s window`, isThePerson: false }
  }
  // A TYPE THAT IS NEITHER. "system:..." and anything else is reported as it is stored, never
  // folded into the person's own windows and never folded into an agent's.
  return { kind: 'other', id, word: `a window placed by ${stamp}`, isThePerson: false }
}

/** True when this stamp is the person's own. The Schedule draws their hours from the same fact. */
export function isThePersonsWindow(createdBy: string | null | undefined): boolean {
  return ownerOfWindow(createdBy).isThePerson
}
