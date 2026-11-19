// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE LINES A CHECK WRITES WHEN IT ASKS FOR A TEST-BATCHES SEAT, AND THE READER OF THOSE LINES.
 *
 * A check waits for a seat before its model or its standard check of the tests starts, and the wait is not time its
 * model has. tools/the-inspector.mjs writes one line when it begins to ask and one when the question is settled,
 * however it ended: granted, refused, never asked, or the office gone. The worker reads the two lines to leave the
 * wait out of the check's clock.
 *
 * A LINE COUNTS ONLY AS A WHOLE LINE. Its words, an instant and the closing period must be all there is, so the model
 * writing the words in its answer cannot stop a clock. The inspector stamps every line of its output with an instant,
 * so a line may begin with exactly one such stamp and one space before the words; nothing else may come before or
 * after them.
 *
 * AN INSTANT THAT CANNOT BE READ IS NOT READ. Its line is not a seat line, so the time it names counts against the
 * check's clock as it did before these lines existed.
 */

/** What a check says when it begins to ask for a test-batches seat. The instant follows. */
export const THE_CHECK_BEGAN_ASKING = 'The check began asking for a test-batches seat at '

/** What a check says when its question for a test-batches seat is settled. The instant follows. */
export const THE_CHECK_FINISHED_ASKING = 'The check finished asking for a test-batches seat at '

/** An instant the inspector's own clock writes, with its offset, or the `Z` another clock writes. */
const AN_INSTANT = String.raw`\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:Z|[+-]\d{2}:\d{2})`

/** @param {string} text */
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')

/** One whole line, after the optional stamp the inspector puts at the start of every line it writes. */
const A_BEGAN_LINE = new RegExp(`^(?:${AN_INSTANT} )?${escaped(THE_CHECK_BEGAN_ASKING)}(${AN_INSTANT})\\.$`, 'u')
const A_FINISHED_LINE = new RegExp(`^(?:${AN_INSTANT} )?${escaped(THE_CHECK_FINISHED_ASKING)}(${AN_INSTANT})\\.$`, 'u')

/**
 * THE WAIT A CHECK'S OUTPUT HAS SAID SO FAR.
 *
 * `closedMs` is every wait that began and finished, added up. `openSince` is the instant the wait now open began, or
 * null. `readALine` says whether any seat line was read at all, which is how a reader tells a check that waited no
 * time from one whose output never said it asked.
 *
 * @typedef {{ closedMs: number, openSince: string | null, readALine: boolean }} TheSeatWaits
 */

/**
 * READ THE SEAT LINES IN `text`, after what an earlier part of the same output said.
 *
 * A part of an output read later is passed in `soFar`, so a caller can read an output as it grows without reading its
 * earlier bytes again.
 *
 * @param {string} text
 * @param {{ closedMs?: number, openSince?: string | null }} [soFar]
 * @returns {TheSeatWaits}
 */
export function theSeatWaitsIn(text, soFar = {}) {
  let closedMs = soFar.closedMs ?? 0
  /** @type {string | null} */
  let openSince = soFar.openSince ?? null
  let readALine = false
  for (const line of text.split('\n')) {
    const began = theInstantIn(line, A_BEGAN_LINE)
    if (began !== null) {
      readALine = true
      // A second begin before a finish is not a shape this tool writes; the first one is the wait that is open.
      if (openSince === null) openSince = began
      continue
    }
    const finished = theInstantIn(line, A_FINISHED_LINE)
    if (finished === null) continue
    readALine = true
    if (openSince === null) continue
    closedMs += Math.max(0, Date.parse(finished) - Date.parse(openSince))
    openSince = null
  }
  return { closedMs, openSince, readALine }
}

/**
 * The instant a whole line of `pattern` names, or null when the line is not one or its instant cannot be read.
 *
 * @param {string} line
 * @param {RegExp} pattern
 * @returns {string | null}
 */
function theInstantIn(line, pattern) {
  const found = pattern.exec(line)
  const instant = found?.[1]
  if (instant === undefined || !Number.isFinite(Date.parse(instant))) return null
  return instant
}

/**
 * THE LINE A CHECK WRITES WHEN IT BEGINS TO ASK, for `instant`.
 * @param {string} instant
 */
export function theCheckBeganAsking(instant) {
  return `${THE_CHECK_BEGAN_ASKING}${instant}.`
}

/**
 * THE LINE A CHECK WRITES WHEN ITS QUESTION IS SETTLED, for `instant`.
 * @param {string} instant
 */
export function theCheckFinishedAsking(instant) {
  return `${THE_CHECK_FINISHED_ASKING}${instant}.`
}
