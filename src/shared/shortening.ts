// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW MANY CHARACTERS OF A QUOTED THING A SCREEN SHOWS BEFORE IT IS SHORTENED.
 *
 * Sixty is the number the server already uses when it names a plan line, so a chip and a review row
 * about the same line come out the same length rather than two lengths nobody chose.
 */
export const SHOWN_CHARACTERS = 60

/** The mark a cut quote adds to show that words were left off. */
export const CUT_MARK = ' …'

/** A string a screen shows, and whether words were left off the end of it. */
export interface ShortenedWords {
  words: string
  shortened: boolean
  whole: string
}

/**
 * The first words of a string, cut at a space rather than in the middle of a word.
 *
 * CUTTING MID-WORD IS THE DEFECT THIS EXISTS FOR. A first-time user read `{note: reload test` off a
 * screen on 18 August 2026 and had no way to know that the word was `test one` and that a bracket
 * had been cut off too. A cut on a word boundary reads as a sentence that stops; a cut inside a word
 * reads as a different word.
 *
 * NOTHING IS APPENDED HERE. Whether it was shortened is a fact, and it comes back as a fact so the
 * screen can say it in its own words rather than in a character somebody has to recognise.
 */
export function shortenToWords(text: string, limit: number = SHOWN_CHARACTERS): ShortenedWords {
  const whole = text.trim()
  if (whole.length <= limit) return { words: whole, shortened: false, whole }
  const cut = whole.slice(0, limit)
  const lastSpace = cut.lastIndexOf(' ')
  // A single word longer than the limit has no space to cut at. It is cut where it has to be, and
  // `shortened` still says so, which is the only honest answer for a string with no word boundary.
  const words = lastSpace === -1 ? cut : cut.slice(0, lastSpace)
  return { words: words.trimEnd(), shortened: true, whole }
}
