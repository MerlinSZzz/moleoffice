// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MARKING WORDS IN THE WRITING BOX (wave 14d, DB-2).
 *
 * A message carries either marked parts or one flag on the whole, and one character is in at most one part. These are
 * the two places that rule is carried out while the person writes: a new mark cuts the parts it overlaps and splits a
 * part it lands inside, and a typed change moves a part wholly before or after the change and drops a part the change
 * touches. Every kept part is then asked `whereTheChangeIs`, so a part whose words are no longer at its place is
 * dropped too.
 *
 * NOTHING HERE TOUCHES THE OFFICE OR THE PAGE. It is arithmetic over a body, offsets and parts, so the same answer can
 * be proved without a browser, and the composer has no second opinion about where a part goes.
 */

import { trimmed, type CharacterRun } from '@shared/intent.ts'
import type { AMarkedPart, AnIntentThatAsks } from '@shared/intent-mark.ts'
import type { MessageLabel } from '@shared/message-label.ts'

import { whereTheChangeIs } from './drafts.ts'

/** The one flag a new part is marked with: an asking mark, or a label of the person's own. */
export interface AFlagToMarkWith {
  intent?: AnIntentThatAsks
  label?: MessageLabel
}

/** A part a typed change took out, and whether its words are still in the message somewhere else. */
export interface ADroppedPart {
  part: AMarkedPart
  why: 'moved' | 'gone'
}

/** A part with its run trimmed of the spaces at either end, or nothing when no word is left. */
function theTrimmedPart(body: string, part: AMarkedPart, from: number, to: number): AMarkedPart | null {
  const held = trimmed(body, Math.max(0, from), Math.min(body.length, to))
  if (held === null) return null
  return { ...part, from: held.from, to: held.to, quote: body.slice(held.from, held.to) }
}

/**
 * MARK THE SELECTED WORDS WITH ONE FLAG, cutting back every part the new run overlaps and splitting a part the run
 * lands inside. The new part is the selected run trimmed of the spaces at either end. Null when the selection holds no
 * word a person can see, which is what a selection of spaces is.
 */
export function markedPartsOverTheChosenWords(
  body: string,
  from: number,
  to: number,
  parts: readonly AMarkedPart[],
  flag: AFlagToMarkWith,
  mintId: () => string,
): AMarkedPart[] | null {
  const held = trimmed(body, Math.max(0, Math.min(from, to)), Math.min(body.length, Math.max(from, to)))
  if (held === null) return null
  const kept: AMarkedPart[] = []
  for (const part of parts) {
    if (part.to <= held.from || part.from >= held.to) {
      kept.push(part)
      continue
    }
    const before = theTrimmedPart(body, part, part.from, Math.min(part.to, held.from))
    const after = theTrimmedPart(body, part, Math.max(part.from, held.to), part.to)
    if (before !== null) kept.push(before)
    // A PART SPLIT IN TWO KEEPS ITS FLAG ON BOTH HALVES.
    if (after !== null) kept.push(after)
  }
  kept.push({ from: held.from, to: held.to, quote: body.slice(held.from, held.to), ...flag })
  // THE MINT IS KEPT IN THE SIGNATURE because a new part is a new part; this writer has no id to give it today, and a
  // caller that later needs one can have it without a second function.
  void mintId
  return kept.sort((a, b) => a.from - b.from)
}

/**
 * TAKE THE MARKS OFF THE SELECTED WORDS and leave every part beside them. A part the run lands inside is cut back on
 * both sides; a part left holding nothing is gone.
 */
export function unmarkedOverTheChosenWords(
  body: string,
  from: number,
  to: number,
  parts: readonly AMarkedPart[],
): AMarkedPart[] {
  const held = trimmed(body, Math.max(0, Math.min(from, to)), Math.min(body.length, Math.max(from, to)))
  if (held === null) return [...parts]
  const kept: AMarkedPart[] = []
  for (const part of parts) {
    if (part.to <= held.from || part.from >= held.to) {
      kept.push(part)
      continue
    }
    const before = theTrimmedPart(body, part, part.from, Math.min(part.to, held.from))
    const after = theTrimmedPart(body, part, Math.max(part.from, held.to), part.to)
    if (before !== null) kept.push(before)
    if (after !== null) kept.push(after)
  }
  return kept
}

/** One run of the body, holding either a part or no part, in order and covering every character. */
export interface AMarkedRun extends CharacterRun {
  quote: string
  part: AMarkedPart | null
}

/** EVERY CHARACTER OF THE BODY IN EXACTLY ONE RUN, so the box and the bubble draw the same marks. */
export function runsOfMarkedWords(body: string, parts: readonly AMarkedPart[]): AMarkedRun[] {
  const inOrder = [...parts].filter((one) => one.to > one.from).sort((a, b) => a.from - b.from)
  const runs: AMarkedRun[] = []
  let at = 0
  for (const part of inOrder) {
    if (part.from < at) continue
    if (part.from > at) runs.push({ from: at, to: part.from, quote: body.slice(at, part.from), part: null })
    runs.push({ from: part.from, to: part.to, quote: body.slice(part.from, part.to), part })
    at = part.to
  }
  if (at < body.length) runs.push({ from: at, to: body.length, quote: body.slice(at), part: null })
  return runs
}

/**
 * A PART WHOSE WORDS THE CHANGE TOUCHED IS DROPPED. The changed run is the characters between the common start and
 * the common end of the two bodies, so a part wholly before it keeps its place, a part wholly after it moves by the
 * change's length, and a part whose words overlap it goes. Every kept part is then asked `whereTheChangeIs`, because a
 * change elsewhere can still take a part's quoted words out of the message altogether.
 */
export function markedPartsAfterATypedChange(
  oldBody: string,
  newBody: string,
  parts: readonly AMarkedPart[],
): { kept: AMarkedPart[]; dropped: ADroppedPart[] } {
  if (oldBody === newBody) return { kept: [...parts], dropped: [] }
  let start = 0
  const least = Math.min(oldBody.length, newBody.length)
  while (start < least && oldBody[start] === newBody[start]) start += 1
  let oldEnd = oldBody.length
  let newEnd = newBody.length
  while (oldEnd > start && newEnd > start && oldBody[oldEnd - 1] === newBody[newEnd - 1]) {
    oldEnd -= 1
    newEnd -= 1
  }
  const delta = newEnd - oldEnd
  const kept: AMarkedPart[] = []
  const dropped: ADroppedPart[] = []
  for (const part of parts) {
    let from: number
    let to: number
    if (part.to <= start) {
      from = part.from
      to = part.to
    } else if (part.from >= oldEnd) {
      from = part.from + delta
      to = part.to + delta
    } else {
      dropped.push({ part, why: newBody.includes(part.quote) ? 'moved' : 'gone' })
      continue
    }
    const quote = newBody.slice(from, to)
    const where = whereTheChangeIs(newBody, { quote: part.quote, from, to })
    if (where === 'there') kept.push({ ...part, from, to, quote })
    else dropped.push({ part, why: where })
  }
  return { kept, dropped }
}
