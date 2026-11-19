// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHAT DRAFT AS THIS BROWSER'S STORE KEEPS IT: as the person typed it.
 *
 * The chat writes each draft to session storage at every key press (src/web/components/Chat.tsx, `writeADraft`), so a
 * draft survives a reload. Rounds 40 and 41 of wave 13n and round 7 of wave 13w left out of the stored copy every piece
 * that looked like a key, and every word still being written, since the shapes cannot know half a key. That
 * leaving-out was redundant: the office does not manage what its users do, and a person is asked once before a send
 * instead. So the stored copy is the draft, whole, and a reload loses nothing.
 */

/** One draft as the store keeps it, and the words of it that are still being written. */
export interface AKeptDraft {
  kept: string
  writing: string[]
}

/**
 * The copy of `next` the store keeps. `was` and `writing` are what the chat already passes, and are no longer read: no word
 * is left out any more, so none is still being written.
 */
export function theDraftAsTheStoreKeepsIt(_was: string, next: string, _writing: readonly string[]): AKeptDraft {
  return { kept: next, writing: [] }
}
