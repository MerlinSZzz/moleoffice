// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FLOOR UNDER WHAT A PAGE PICTURE MUST SHOW, used by tools/review.mjs.
 *
 * It is a file of its own so a test can run it: tools/review.mjs starts its whole run when it is
 * loaded. The census it reads is contentCensusInPage in tools/review.mjs, which runs in the browser.
 */

/**
 * HOW LITTLE THE CONTENT AREA MAY DRAW BEFORE THE RUN IS CALLED FAILED.
 *
 * WHY THIS EXISTS, AND IT IS THE WORST THING THIS TOOL HAS EVER DONE. Until this check, a page that
 * drew NOTHING was photographed and reported as a picture taken. On 14 August 2026 a hostile check
 * made the "Missing and unused" page render no heading, no lists and no text at all — the rail and
 * nothing else — and this tool printed "92 of 92 pictures taken" and "all four proofs held" and
 * exited 0. The picture on disk was a blank page. This repository's rule that every screen is looked
 * at was being discharged by a tool that had never once looked.
 *
 * WHAT IS MEASURED IS `main.page` AND NOTHING ELSE. The rail (`.shell-side`) and the phone's header
 * bar (`.shell-bar`) are drawn on every page whatever the page itself does, so a floor counted over
 * the whole document is cleared by the furniture alone. That is not a hypothetical: it is exactly
 * how tools/legibility.mjs's whole-document floor read the same blank page as a page that had merely
 * got smaller.
 *
 * WHY THESE NUMBERS, AND THEY ARE MEASURED RATHER THAN CHOSEN. They sit below the emptiest page this
 * app can legitimately draw and above what a blank content area can produce, which is zero of
 * everything. Every one of the 80 page pictures in a clean run was measured on 14 August 2026. The
 * three smallest were:
 *
 *   the plans page, with no plan written    3 visible text nodes,   9 words,  149px of drawn height
 *   the not-found page                      4 visible text nodes,  11 words,   68px
 *   the decisions page                     28 visible text nodes, 125 words,  356px
 *
 * — and everything else drew between 49 and 2,260 text nodes. So the floor is set below the smallest
 * of those: 2 text nodes, 4 words, 16px. A page that drew anything at all clears it, and a page that
 * drew nothing produces 0 of all three and cannot reach it however the corpus is shaped that day.
 * The first two are the empty states, which is the right place to set a floor from: they are the
 * least a real page ever draws.
 *
 * ALL THREE HAVE TO BE MET, because each is defeated on its own: text nodes miss a page that is one
 * large drawing, drawn height is met by an empty box with padding, words are met by a page of icons.
 *
 * A FLOOR IS NOT A REGRESSION TEST. It only catches a page that drew NOTHING. A page that drew a
 * fifth of what it drew yesterday clears this easily, and that case is `readPreviousRun` in tools/review.mjs.
 *
 * THE SHORT MARK COUNTS IN PLACE OF THE WORDS. The design draws an ordinarily empty page as its
 * heading and the short mark (plan 7FEOshq3mBGG, block b-6, check 4): Absence in
 * components/ui.tsx draws a .px-absent element holding a dash, and a dash is not a word. Such a
 * page draws fewer than four words, so the words floor alone called it blank; wave 13k's round 11
 * found it calling the empty Shelved page blank that way. So a page that drew at least one visible
 * short mark (`marks`, counted in tools/review.mjs) meets the words floor. The text-node and height
 * floors still apply to it, and a page that drew nothing has no mark, so it is still caught.
 */
export const CONTENT_FLOOR = { texts: 2, words: 4, height: 16 }

/**
 * Why this picture is not a picture of a page, or null when it is one.
 *
 * Named in the reader's words, because this sentence is what a person is handed when a run fails.
 */
export function whyItDrewNothing(content) {
  if (content === null) return null
  if (!content.found) {
    return 'the shell drew no content area at all — there is no `main.page` on this page, so what was photographed is the rail and the empty space beside it'
  }
  const short = []
  if (content.texts < CONTENT_FLOOR.texts) short.push(`${content.texts} visible text nodes (floor ${CONTENT_FLOOR.texts})`)
  if (content.words < CONTENT_FLOOR.words && !(content.marks > 0)) {
    short.push(`${content.words} words and no short mark for an empty page (floor ${CONTENT_FLOOR.words} words)`)
  }
  if (content.height < CONTENT_FLOOR.height) short.push(`${content.height}px of drawn height (floor ${CONTENT_FLOOR.height})`)
  if (short.length === 0) return null
  return `the content area drew ${short.join(', ')} — this picture shows an empty page`
}
