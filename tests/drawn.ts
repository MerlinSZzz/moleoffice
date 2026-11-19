// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A SCREEN DRAWS, READ OFF THE OUTPUT INSTEAD OF THE SOURCE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS BESIDE THE SOURCE SCANNER
 * ---------------------------------------------------------------------------------------
 *
 * `tests/sentences.ts` reads SOURCE, and it says at length what it cannot see: a sentence that
 * reaches a `title` through a variable, one built by joining two literals, one arriving from the
 * server. It fed the sentence gate, a test deleted on 12 November 2026, and its allowlist, deleted
 * the same day. A list read off the source is not a measurement of how much prose is on a page.
 *
 * This is the other instrument. It takes what a component RENDERED — markup, or the text a browser
 * says is on the screen — and returns the sentences a person actually reads. The two disagree in
 * both directions on purpose: a sentence found in the source may be invisible on the page, and a
 * sentence on the page may be invisible to the source scanner. Neither number is the other's check,
 * and a claim about prose on a screen belongs to this one.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS TAKEN OUT, AND ON WHOSE AUTHORITY
 * ---------------------------------------------------------------------------------------
 *
 * Only what `docs/UX-CONTRACT.md` section 8.10.2 allows a sentence to live in, plus the two things
 * that are not the interface talking at all:
 *
 *   every attribute        `title`, `aria-label`, `alt`, `placeholder`. Attributes leave with their
 *                          tag, which is the point: an attribute is never a text node.
 *   `.px-sr`               the off-screen sentence.
 *   `<details>`, whole     a fold — its label and its body. A reader sees a summary and a press.
 *   `<svg>`                a glyph carries no text.
 *   `<style>`, `<script>`  a stylesheet is not prose. This product ships its CSS inside the
 *                          components, in template literals, and the comments in it are English.
 *   `<textarea>`           what somebody is typing.
 *   the content classes    words a PERSON wrote, or that Mole Office wrote ABOUT one thing: a comment,
 *                          the run of text it quotes, a reading of a comment. Step 37's acceptance
 *                          exempts human-authored content by name.
 *                          They are listed one by one below rather than matched by a pattern, so
 *                          widening the exemption is a line of a diff somebody reads.
 *
 * A REFUSAL AND AN ERROR ARE NOT TAKEN OUT. They are drawn on a press or on a fault, so they are
 * not in the resting state of a surface, and every caller of this measures a surface at rest.
 */

import { readsAsASentence, tidy } from './sentences.ts'

/**
 * Elements whose words are not the interface's own.
 *
 * Each is a place a person's words, or a quotation of them, or Mole Office's reading of one comment, is
 * drawn. None of them is a fixed sentence written into a screen, which is what the gate is about.
 */
export const CONTENT_CLASSES: readonly string[] = [
  // a comment somebody wrote, and the run of words it is about
  'px-review-body',
  'px-review-quote',
  'px-rev-quote',
  'px-rev-words',
  'px-send-body',
  // a comment's own words in shape B's review column (wave 13r round 15), the same words px-rev-words held
  'px-b-body',
  // what Mole Office made of one comment, which arrives per comment and is not a screen's own sentence
  'px-read-with',
  // the machine's own question and answer, shown whole so a person can carry it away
  'px-machine-text',
  /**
   * THE FORK'S OWN QUESTION, ON THE ROW THAT IS NOT OPEN. Added 27 August 2026.
   *
   * WHAT CHANGED, AND WHOSE INSTRUCTION IT WAS. Step 37's acceptance held the decision tiles to
   * drawing no sentence at rest, and a closed card was its title and four short cues. The owner's
   * round-eleven brief, section 8, asks a collapsed governance item to carry *"about 1–1.5 lines
   * of the question/summary"* as well, because a title alone locates a fork only for somebody who
   * already knows it.
   *
   * WHY IT IS AN EXEMPTION AND NOT A HOLE. This class holds the stored `question` a proposal's
   * author wrote, or the author's own `summary` where the record states no question. It is the
   * same category as a quoted comment or an organised draft: words a person wrote, drawn back to
   * them. It is never a sentence written into a screen, which is what this gate is about. A screen
   * that put its OWN prose in this class would be widening the exemption, and that is a line of a
   * diff somebody reads — which is why every entry here is listed one by one.
   */
  'px-fork-words',
  /**
   * THE OWNER'S OWN SENTENCE, DRAWN BESIDE AN ACT AN AGENT MADE ON IT. Added 3 September 2026.
   *
   * An agent may make a governance write it is otherwise refused when it can quote what the owner said,
   * and `design/messages/ACCEPTANCE.md` W2 asks that the words be drawn beside the act. They are
   * words THE OWNER wrote, drawn back to the owner so the owner can say they are not what the owner said — the same category
   * as a quoted comment and as a fork's own question above.
   *
   * IT IS NEVER MOLE OFFICE'S OWN PROSE. The panel's own sentences — who acted, where and when, and
   * what the write did — are built by the server and drawn in `.ohw-said` and `.ohw-what`, which
   * are not in this list and are counted like any other screen text. Putting one of those in this
   * class would be widening the exemption, and that is a line of a diff somebody reads.
   */
  'px-owner-words',
]

/** The text a reader sees in rendered markup, with every allowed channel taken out. */
export function drawnText(html: string): string {
  let left = html
  left = left.replace(/<style\b[\s\S]*?<\/style>/g, ' ')
  left = left.replace(/<script\b[\s\S]*?<\/script>/g, ' ')
  left = left.replace(/<textarea\b[\s\S]*?<\/textarea>/g, ' ')
  left = left.replace(/<details\b[\s\S]*?<\/details>/g, ' ')
  left = left.replace(/<svg\b[\s\S]*?<\/svg>/g, ' ')
  left = left.replace(/<(span|p|div|li|section)\s[^>]*class="[^"]*\bpx-sr\b[^"]*"[^>]*>[\s\S]*?<\/\1>/g, ' ')
  for (const name of CONTENT_CLASSES) {
    const holder = new RegExp(`<(span|p|div|li|section|blockquote)\\s[^>]*class="[^"]*\\b${name}\\b[^"]*"[^>]*>[\\s\\S]*?</\\1>`, 'g')
    left = left.replace(holder, ' ')
  }
  // Every remaining tag, with every attribute on it.
  return left.replace(/<[^>]+>/g, '\n')
}

/**
 * WHAT A FOLD HOLDS: the other half of the page, which `drawnText` deletes on purpose.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS, AND WHAT WENT THROUGH THE GAP
 * ---------------------------------------------------------------------------------------
 *
 * `drawnText` above takes out `<details>` whole — the label and the body — because a reader at rest
 * sees a summary and a press, and every caller of it measures a surface AT REST. That is the right
 * rule for counting prose, and it means NOTHING BEHIND A FOLD IS EVER SCANNED BY ANY GATE BUILT ON
 * IT. Every gate in this suite that reads a screen is built on it.
 *
 * Wave 10 put two raw nanoids behind a closed fold and every gate stayed green. That is the shape of
 * it: a fold is one press away, not a wall, and a stored word behind one still reaches a person.
 *
 * So this returns the OPPOSITE selection: only what folds hold, with the same channels taken out
 * inside them — attributes, the off-screen sentence, glyphs, stylesheets, and a person's own words.
 * A gate can then ask of a fold exactly what it asks of the page.
 *
 * IT IS NOT A SECOND `drawnText` AND MUST NEVER BECOME ONE. `drawnText` answers *what does a reader
 * meet without pressing anything*, and a claim about how much prose a screen carries belongs to it.
 * This answers *what is one press away*, and a claim that a machine word or an id never reaches a
 * person belongs here as well as there.
 */
export function foldedText(html: string): string {
  const folds = html.match(/<details\b[\s\S]*?<\/details>/g) ?? []
  if (folds.length === 0) return ''
  // Each fold goes through the same reader, with its own `<details>` tags removed first so that
  // `drawnText` does not delete the very thing being asked about. A fold inside a fold survives,
  // because the inner one's tags are removed by the same replace.
  return folds.map((fold) => drawnText(fold.replace(/<\/?details\b[^>]*>/g, ' '))).join('\n')
}

/** Every sentence a rendered surface draws, by the gate's own rule for what a sentence is. */
export function sentencesDrawnIn(html: string): string[] {
  return sentencesInText(drawnText(html))
}

/**
 * The same, over plain text that is already split into the runs a reader meets.
 *
 * NOT FOR A BROWSER'S `innerText`, and that is worth saying because it is the obvious thing to try.
 * `innerText` collapses a dialog into one run, so the whole box comes back as one very long
 * sentence, and it INCLUDES an off-screen span, because `.px-sr` is clipped rather than hidden.
 * Take the element's markup and use `sentencesDrawnIn` instead.
 */
export function sentencesInText(text: string): string[] {
  return text
    .split('\n')
    .map(tidy)
    .filter((run) => run !== '' && readsAsASentence(run))
}
