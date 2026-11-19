// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHAT IN ONE RUN OF VISIBLE TEXT IS THE MACHINE TALKING, for tools/read-the-screen.mjs (problem LDFm8FKJURox).
 *
 * The prose audit of round eleven found four real leaks by a person looking, and the instrument found none of them:
 * `couldNotCheck` on Placeholders, `2026-W35` on the Schedule, `vh-1r_wPPZDF` in the review pane's error box, and
 * `data.blocks[#b-56].blocks[#b-52].text` in a report's history fold. It looked only for stored words with an
 * underscore, and it found 44 of those, every one inside a sentence somebody wrote. So this looks for two things:
 *
 *   - SHAPES, wherever they stand: an internal camelCase name, an ISO week, a record id, a path into a record's data.
 *     None of them is a word a person writes in a sentence for another person.
 *   - STORED WORDS (the five vocabularies, the ones with an underscore), but only in a run that is not a sentence:
 *     a stored word standing as a label is the interface talking; the same word inside a sentence is somebody's
 *     prose about it (tests/sentences.ts readsAsASentence, the gate's own reading of a sentence).
 *
 * It is pure: it reads the text it is given and nothing else, so it is tested without a browser.
 */

/** The shapes, each with the words a finding says it in. */
export const LEAK_SHAPES = Object.freeze([
  // couldNotCheck, theRunEndedBeforeItsCommand: a lowercase start, then capitals inside, no space.
  { kind: 'an internal name', pattern: /(?<![A-Za-z0-9_$.-])[a-z]+(?:[A-Z][a-z0-9]+){1,}(?![A-Za-z0-9_$-])/g },
  // 2026-W35
  { kind: 'an ISO week', pattern: /(?<![A-Za-z0-9-])\d{4}-W\d{2}(?![A-Za-z0-9])/g },
  // vh-1r_wPPZDF, -WZ40nNgHnTR: twelve of the office's id characters with both cases and a digit, - or _.
  { kind: 'a record id', pattern: /(?<![A-Za-z0-9_-])(?=[A-Za-z0-9_-]{12}(?![A-Za-z0-9_-]))(?=[A-Za-z0-9_-]*[A-Z])(?=[A-Za-z0-9_-]*[a-z])(?=[A-Za-z0-9_-]*[0-9_-])[A-Za-z0-9_-]{12}/g },
  // data.blocks[#b-56].blocks[#b-52].text: a dotted name with an index in brackets.
  { kind: 'a path into a record', pattern: /(?<![A-Za-z0-9_$.])[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\[[^\]\s]+\](?:\.[A-Za-z_$][\w$]*|\[[^\]\s]+\])*/g },
])

/**
 * The leaks in one run of visible text.
 * @param {string} run the run, as the page draws it
 * @param {ReadonlySet<string>} words the stored words to look for
 * @param {(text: string) => boolean} isASentence whether the run reads as a sentence
 * @returns {{ kind: string, piece: string }[]}
 */
export function leaksIn(run, words, isASentence) {
  /** @type {{ kind: string, piece: string }[]} */
  const found = []
  for (const shape of LEAK_SHAPES) {
    for (const hit of run.matchAll(shape.pattern)) found.push({ kind: shape.kind, piece: hit[0] })
  }
  if (!isASentence(run)) {
    for (const word of words) {
      if (new RegExp(`(^|[^a-z0-9_])${word}([^a-z0-9_]|$)`).test(run)) found.push({ kind: 'a stored word', piece: word })
    }
  }
  return found
}
