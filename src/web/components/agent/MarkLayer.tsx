// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { behaviorForJump, washJumpTarget } from '../../lib/motion.ts'
/**
 * WHERE A COMMENT IS WAITING, DRAWN ON THE THING ITSELF.
 *
 * ---------------------------------------------------------------------------------------
 * TWO MARKS, BECAUSE THERE ARE TWO THINGS TO SAY
 * ---------------------------------------------------------------------------------------
 *
 * Both are quiet. For text: a subtle transparent highlight and a
 * very small marker. For cells, nodes and blocks: an equally light mark in context. No enormous
 * comment icons that disturb the document.
 *
 *   THE WORDS a comment quoted get a light transparent highlight, painted on the exact characters.
 *   THE THING it is on gets one small quote mark, and nothing else — no fill, no border, no icon.
 *
 * The mark is a SHAPE and not a colour: the same quote mark that opens the composer everywhere else
 * in the product, drawn small, in ordinary quiet ink. Nothing here spends a hue. design/UX-CONTRACT
 * gives the accent to quantity and to the chosen segment of a control, and gives the one colour
 * that means "waiting on a person" to decisions alone — a second use of it would make it mean
 * "important", and a comment waiting to be sent is not an alarm.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING IS OPTED INTO, AND NOTHING IS WRITTEN INTO ANOTHER COMPONENT'S DOM
 * ---------------------------------------------------------------------------------------
 *
 * A mark has to appear on a report block, a table cell, a plan row and a record row, and none of
 * those components may have to know that comments exist. So this draws no elements inside them.
 *
 * The object's mark is a STYLESHEET THIS BUILDS from the keys the server sent. The key is the same
 * string the element carries as its `data-target`, so a rule can name the element exactly, and any
 * component anywhere that says what it is gets the mark without a line of its own. A re-render
 * cannot lose it, because nothing was added to the element.
 *
 * The highlight on the words is the browser's own highlight registry, which paints a range without
 * changing the document. Wrapping the words in an element instead would edit the inside of a
 * paragraph another component owns, and the next render would throw the wrapper away.
 *
 * ---------------------------------------------------------------------------------------
 * THE WORDS ARE LIT ONLY WHERE THEY REALLY ARE
 * ---------------------------------------------------------------------------------------
 *
 * A comment stores which stored string it quoted and where the words started in it. This lights
 * those characters only when the drawn text can PROVE which characters they are: the quoted words
 * are drawn exactly once in that stored string, and that one place is where the comment said they
 * were. Anything else is lit as nothing at all. That is the owner's rule for anchors said in
 * pixels: *"never silently attach the comment to similar-but-different text."* The comment is still
 * on the object and still carries its words; the conversation says what became of them.
 *
 * ---------------------------------------------------------------------------------------
 * AND WHEN THE WORDS HAVE CHANGED, THE OBJECT SAYS SO
 * ---------------------------------------------------------------------------------------
 *
 * Not lighting the words is only half an answer, and the missing half was measured: 21 characters
 * were added to the front of a report's prose block, and on reload the highlight was simply gone
 * with nothing anywhere saying why. A comment whose words moved has not vanished — it is the one a
 * person most needs to see, because it may now be about something else.
 *
 * So the object carries a second mark, reading *text changed*, whenever the page can PROVE the
 * change: one run of drawn text covers the characters the comment named, and they read as something
 * else. `wordsOnScreen` below is that reading, and its third answer — this page cannot say — is
 * kept apart from both, because a mark that cried "changed" whenever a highlight failed would cry
 * it on every page drawing a shortened preview of the same string.
 *
 * ---------------------------------------------------------------------------------------
 * WHY MATCHING THE CHARACTERS AT THE STORED OFFSET IS NOT ENOUGH
 * ---------------------------------------------------------------------------------------
 *
 * It used to find the run by field, count to the stored offset, and light the characters there if
 * they read the same as the quote. That passes for a DIFFERENT COPY OF THE SAME WORDS, and an edit
 * anywhere earlier in the string is all it takes to slide one into place. Measured in Chromium on
 * 18 August 2026, on a block reading "The gate is met and the gate is not met…": a comment on the
 * SECOND "gate is", at character 24, was lit correctly; twenty characters were then added to the
 * front of the block; on reload the highlight was still drawn at character 24, which is now the
 * FIRST "gate is". The person's own words had moved to 44 and nothing on the screen said so. A
 * highlight that moves is worse than no highlight, because it tells somebody their comment is about
 * text it is not about.
 *
 * THE BROWSER CANNOT ASK WHETHER THE BLOCK CHANGED. `GET /api/agent/marks` sends the quote, the
 * offsets and the field, and no revision — so the only evidence here is the drawn text. Counting
 * every place the words are drawn is what that evidence can carry: one place, at the stored offset,
 * and the highlight is not a guess about which copy was meant, because there is no second copy.
 *
 * WHAT IT COSTS, SAID PLAINLY. A comment on one of two identical phrases loses its highlight even
 * before anybody edits anything, and it is not marked as changed either, because it has not
 * changed. The small mark on the object stays, the conversation still holds the quote, and nothing
 * false is drawn. Absence beats a guess.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import {
  TEXT_FIELD_ATTRIBUTE,
  TEXT_OFFSET_ATTRIBUTE,
  TARGET_ATTRIBUTE,
  targetAttributeValue,
  targetFromAttributeValue,
  targetKey,
  targetSpec,
  spanShownAsCut,
  wordsInNamedSpan,
  type Context,
  type DrawnIn,
  type Place,
  type NamedSpan,
  type Span,
  type Target,
} from '@shared/targets.ts'
import { identityOf, offsetOf, type RegionId } from '@shared/regions.ts'
// THE REGIONS THIS PAGE'S REPORT DERIVED, left there by the drawing that derived them.
import { theReportDrawnHere } from '../../lib/drawnreport.ts'
// WHICH ELEMENT ON THIS PAGE IS WHICH PART. The one answer, which *View original* reads too.
import { elementDrawing, regionsDrawnOn } from '../../lib/drawnhere.ts'
import { PLACE_STATES, fillWord } from '@shared/states.ts'
import { t } from '@shared/i18n.ts'
import type { Mark } from '../../../server/lib/agents.ts'
import { makeBroadcast } from '../../lib/store.ts'
// WHICH ADDRESS THE PAGE HAS FINISHED DRAWING. A lead waits for it, so the last page's row is never flashed.
import { READY_ATTRIBUTE } from '../../lib/ready.ts'
// WHEN THE CHAT MOVES. The page beside it moves with it, and every mark measured over the page has to follow.
import { watchTheSplit } from '../../lib/chat-split.ts'
import { useSentMarks } from '../../lib/sent-marks.ts'
import { AGENT_CSS } from './agent-css.ts'
import { DRAFTS_KEY, draftsFromStored, whyTheWordsMayBeLost } from '../../lib/drafts.ts'
import {
  firstCommentOnEach,
  howItDrawsHere,
  placeNamedBy,
  useMarks,
  whatIsDrawn,
  type DrawnMark,
  type HowItDraws,
} from './marks.ts'
import { CommentCircles, type CircleToDraw } from './CommentCircle.tsx'

/**
 * The name the browser's highlight registry knows these ranges by.
 *
 * EXPORTED FOR ONE TEST, NOT FOR A CALLER. The rule that paints it lives in `agent-css.ts` as
 * `::highlight(mole-office-noted)`, and the two are the same name written in two places with
 * nothing making them agree. Change one and the wash simply stops appearing: no type error, no
 * failing test, no message. tests/marks-at-rest.test.ts reads this and looks for it in the
 * stylesheet, which is what makes the disagreement fail. The pair came within one edit of drifting
 * during the rename on 28 August 2026, which is why the check exists now and did not before.
 */
export const HIGHLIGHT = 'mole-office-noted'

/** The name for the words of the one comment somebody has just asked to be taken to. */
const SHOWING = 'mole-office-showing'

// ============================================================================ the object's mark

/** A `data-target` value, safe to put inside a CSS attribute selector. */
function quoted(key: string): string {
  return key.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * WHAT ONE OBJECT DRAWS AT REST: how many comments are on it, and how many unsent instructions.
 *
 * Two counts and one flag, worked out once, so the rule builder below never reasons about where a
 * number came from. `comments` is waiting PLUS sent, which is what the drawn number means: "n
 * comments here". The split is kept because the words beside the mark say it.
 */
export interface AtRest {
  key: string
  /**
   * WHAT THIS THING IS, IN THE WORD THE TARGET DECLARATION ALREADY HOLDS — `record`, `block of a
   * report`, `cell of a table`. It is what makes the announced count say which thing it counted.
   *
   * Null when the only thing known about this key is that an instruction was started on it: a kept
   * draft is a key in this browser's own store and carries no target, so there is no noun to read
   * and none is invented. A comment always brings one, because the server sends its target.
   */
  noun: string | null
  /** Every comment on this thing, sent or not. This is the number `❝` draws. */
  comments: number
  waiting: number
  sent: number
  /** Unsent instructions kept in this browser about this thing. The number `✎` draws. */
  drafts: number
  /** The text around the words one of the comments quoted has changed. */
  textChanged: boolean
}

/**
 * EVERY OBJECT THAT DRAWS SOMETHING AT REST, from the two places the facts live.
 *
 * THE UNION MATTERS AND IS THE POINT OF THIS FUNCTION. Comments come from the server and drafts
 * from this browser, and a thing can have one without the other. Building the list from the
 * server's marks alone is why twenty kept instructions were invisible: measured 19 August 2026,
 * zero elements matched `[data-target^="draft/"]` on every page with no composer open, so an
 * instruction somebody started and did not send could only be found by pointing at the same thing
 * again and hoping.
 *
 * Exported so a test can read what would be drawn without a browser.
 */
export function atRest(
  marks: readonly DrawnMark[],
  changed: readonly string[] = [],
  drafts: readonly { key: string; kept: number }[] = [],
): AtRest[] {
  const moved = new Set(changed)
  const byKey = new Map<string, AtRest>()
  const forKey = (key: string): AtRest => {
    const held = byKey.get(key)
    if (held !== undefined) return held
    const made: AtRest = { key, noun: null, comments: 0, waiting: 0, sent: 0, drafts: 0, textChanged: moved.has(key) }
    byKey.set(key, made)
    return made
  }
  for (const mark of marks) {
    const one = forKey(mark.key)
    // THE NOUN COMES OFF THE TARGET AND IS NEVER PARSED OUT OF THE KEY. The key is a string built
    // for a CSS selector; reading its first segment back would be a second way of saying what a
    // target is, free to disagree with the declaration the first was built from.
    one.noun = targetSpec(mark.target.kind).noun
    one.waiting += mark.waiting
    one.sent += mark.sent
    one.comments = one.waiting + one.sent
  }
  for (const draft of drafts) {
    if (draft.kept <= 0) continue
    forKey(draft.key).drafts += draft.kept
  }
  return [...byKey.values()]
}

/**
 * THE WORDS ONE OBJECT'S MARK SAYS OUT LOUD, for a reader who cannot see the glyphs.
 *
 * WHAT IT MAY NOT SAY. It used to read "the words one of them quoted are not here any more", and
 * that is a claim this side cannot support: a mark carries the key, the target and a count, and NOT
 * whether the quoted words are still findable somewhere in the text. The server knows — its reading
 * answers whether the quote is still there and where it moved to — and it is not on this route. So
 * the mark says the one thing that is true in both cases, that the text around the words changed,
 * and sends the reader to the comment, which has the server's answer. A missing statement is a gap;
 * a false one is worse, and this was a false one.
 */
export function markSaid(one: AtRest): string {
  const parts: string[] = []
  /**
   * THE COUNT IS OF THIS THING AND NOT OF WHAT IS INSIDE IT, AND THE WORDS NOW SAY WHICH.
   *
   * Measured on 20 August 2026 on a report holding five waiting comments: the record drew `❝ 2` and
   * announced "2 comments waiting, not sent" while a block inside it drew `❝ 3`, and nothing
   * anywhere said the two numbers were counting different things. Problem caRjFXgjwNb4.
   *
   * THE DECISION IS THAT A CONTAINER DOES NOT ADD UP WHAT IS INSIDE IT, and the reason is on the
   * screen rather than in the arithmetic: the record's mark and the block's mark are both in view
   * at once, so a container total would show the block's three twice and a reader could not tell
   * which of the two numbers to believe. §8.3 says the mark means "n comments here", and here is
   * this thing. So the count stays where it is and the sentence names the thing it counted.
   */
  // A SENT COMMENT IS STILL SAID. It used to be left out entirely, so a thing with three comments on
  // it drew "3 comments waiting" and then, once they went, drew nothing — the mark disappeared at
  // the moment its result started to matter. Both numbers are said, and neither is said when it is
  // nought, so a thing with only sent comments does not read as having none.
  //
  // EACH PHRASE IS ONE ENTRY OF THE WORD LISTS, here and on a named thing apart, because another
  // language puts the place and the count in another order. The thing's noun is the target's own
  // declared noun from src/shared/targets.ts, which the word lists do not hold yet.
  const thing = one.noun
  if (one.comments > 0) {
    const n = one.comments
    if (one.sent === 0) {
      parts.push(thing === null ? t('agentWords.mark.here.waiting', { n }) : t('agentWords.mark.on.waiting', { n, thing }))
    } else if (one.waiting === 0) {
      parts.push(thing === null ? t('agentWords.mark.here.sent', { n }) : t('agentWords.mark.on.sent', { n, thing }))
    } else {
      const counts = { n, waiting: one.waiting, sent: one.sent }
      parts.push(thing === null ? t('agentWords.mark.here.both', counts) : t('agentWords.mark.on.both', { ...counts, thing }))
    }
  }
  // A PHRASE, LIKE THE ONES ABOVE IT, AND NOT A SENTENCE. The list's own join below turns the
  // phrases into one sentence, and the pencil's phrase says the whole of what the pencil means.
  if (one.drafts > 0) parts.push(t('agentWords.mark.drafts', { n: one.drafts }))
  const waiting = parts.length === 0
    ? t('agentWords.mark.aComment')
    : parts.reduce((said, next) => t('agentWords.mark.andThen', { first: said, second: next }))
  return one.textChanged ? t('agentWords.mark.textChanged', { said: waiting }) : waiting
}

/**
 * EVERY CIRCLE THIS PAGE DRAWS: one per object holding comments, with its number and its name.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS REPLACED
 * ---------------------------------------------------------------------------------------
 *
 * A stylesheet. Each object got `content: "❝ 3" / "3 comments on this block…"` in a `::before` on
 * the element carrying its key, and a `::before` on a paragraph is that paragraph's first inline
 * box — so on a record page the number was drawn at the start of the summary's own prose. The
 * fault and the fix are at the top of
 * `CommentCircle.tsx`, and §8.3 of the interaction contract was changed before this was written.
 *
 * ---------------------------------------------------------------------------------------
 * WHY ONE NUMBER COVERS WHAT HAS NOT GONE
 * ---------------------------------------------------------------------------------------
 *
 * There is one circle per place, so there is one number in it. The number counts what has not
 * gone: the comments waiting, and the instructions somebody has begun writing about that place
 * and has not sent. A sent comment is not in that number while anything there is unsent, because
 * the mark is about what still needs somebody's attention. Where a place holds only sent comments
 * and the person has chosen to show their marks, the number counts those and the name says they
 * have gone. Two numbers in one circle would be a reader guessing which of them is the count.
 *
 * A MARK WITH NEITHER COUNT IS STILL A MARK, and it draws a circle carrying nought. The server
 * sends a mark for a thing it holds a comment about, so a mark with no count is Mole Office knowing
 * a comment is there and not knowing how many; the circle's name says what it says.
 *
 * Exported so a test can read what would be drawn without a browser.
 */
export function circlesToDraw(
  marks: readonly DrawnMark[],
  changed: readonly string[] = [],
  drafts: readonly { key: string; kept: number }[] = [],
  /**
   * WHICH KEY THE PAGE ACTUALLY DREW EACH OF THESE ON, for the ones whose own key is not on the
   * page. `whereEachIsDrawn` above is what fills it in, and it is empty for every mark whose own key
   * is the answer — which is every mark on a page holding no report.
   */
  drawnAs: ReadonlyMap<string, string> = new Map(),
  /** The comment each place's press goes to, from `firstCommentOnEach`. */
  opensAt: ReadonlyMap<string, { context: Context; annotationId: string }> = new Map(),
): CircleToDraw[] {
  return atRest(marks, changed, drafts).map((one) => {
    const unsent = one.waiting + one.drafts
    // THE NUMBER AND THE NAME ARE ABOUT WHAT HAS NOT GONE, unless this place holds only sent
    // comments and the person has chosen to show them. `markSaid` is handed only the counts this
    // circle draws, so a place holding both never says a sent comment's number beside an unsent one.
    const counted = unsent > 0
      ? { ...one, comments: one.waiting, sent: 0 }
      : { ...one, comments: one.sent, waiting: 0, sent: one.sent }
    return {
      key: drawnAs.get(one.key) ?? one.key,
      count: unsent > 0 ? unsent : one.sent,
      unsent,
      name: markSaid(counted),
      // THE PRESS IS LOOKED UP UNDER THE MARK'S OWN KEY, not under the key the page drew it on. Where
      // a page draws a block under an older spelling of its region, the comment is still stored
      // against the mark's key, and looking it up under the drawn one would find nothing.
      opensAt: opensAt.get(one.key) ?? null,
    }
  })
}

/** The kept counts as one string, so React can tell two equal readings apart from two different ones. */
function sayDrafts(list: readonly { key: string; kept: number }[]): string {
  return list
    .map((one) => `${one.key}\t${String(one.kept)}`)
    .sort()
    .join('\n')
}

/** The same string read back. The only reader of what `sayDrafts` writes. */
function readDrafts(said: string): { key: string; kept: number }[] {
  if (said === '') return []
  const out: { key: string; kept: number }[] = []
  for (const line of said.split('\n')) {
    const cut = line.lastIndexOf('\t')
    if (cut < 0) continue
    out.push({ key: line.slice(0, cut), kept: Number(line.slice(cut + 1)) })
  }
  return out
}

/**
 * EVERY UNSENT INSTRUCTION THIS BROWSER IS KEEPING, COUNTED BY THE THING IT IS ABOUT.
 *
 * IT READS THE STORE WITH THE STORE'S OWN PARSER. `draftsFromStored` is the one function that turns
 * the kept text into drafts, so there is no second reading of that shape to drift from the first;
 * `DRAFTS_KEY` is exported for exactly this. Every write goes through `keepDraft`, which saves
 * before it returns, so what is in the store is what the composer last had.
 *
 * NOTHING IS DRAWN WHEN THE STORE CANNOT BE READ, and that is deliberate rather than a fallback.
 * `whyTheWordsMayBeLost` is the product's answer to that question and the composer says it in
 * words; a pencil counting nought would be this layer claiming there are no kept instructions when
 * what is true is that nobody could look.
 */
export function keptDrafts(): { key: string; kept: number }[] {
  if (typeof window === 'undefined') return []
  if (whyTheWordsMayBeLost() !== null) return []
  let stored: string | null
  try {
    stored = window.localStorage.getItem(DRAFTS_KEY)
  } catch {
    // A browser that refuses the store at all. `whyTheWordsMayBeLost` is what says so to a person;
    // this layer's only honest move is to draw no pencil.
    return []
  }
  if (stored === null) return []
  const found = draftsFromStored(stored)
  if (found === null) return []
  const byKey = new Map<string, number>()
  for (const draft of found) {
    // AN EMPTY INSTRUCTION IS NOT ONE. `keepDraft` keeps a draft holding only a change somebody is
    // still writing, and that is words a person typed, so it counts.
    if (draft.body === '' && draft.changes.length === 0 && (draft.beingWritten ?? []).length === 0) continue
    byKey.set(draft.key, (byKey.get(draft.key) ?? 0) + 1)
  }
  return [...byKey.entries()].map(([key, kept]) => ({ key, kept }))
}

// ============================================================================ the words

/**
 * One run of drawn text and the stored characters it says it is.
 *
 * A run promises that the stored string named by `field` holds exactly `text` starting at `offset`.
 * SummaryBlocks checks that promise against the stored string before it writes the two attributes,
 * so a run either carries both and is true or carries neither.
 */
export interface DrawnRun {
  /** Which stored string it came out of, as a field path from the record down. */
  field: string
  /** Where its first character sits in that string, counted from 0. */
  offset: number
  /** What it draws. */
  text: string
}

/** Which run holds the quoted words, and where in that run's drawn text they start and end. */
export interface Lit {
  /** The position of the run in the list it was found in. */
  run: number
  from: number
  to: number
}

/**
 * WHERE THE QUOTED WORDS ARE, or null when the drawn text cannot prove where they are.
 *
 * Three things have to hold, and each of them is a way the highlight would otherwise lie.
 *
 *   THE SPAN NAMES A STORED STRING AND A STRETCH OF IT. Without `cut`, its range has the quote's
 *   length. With `cut`, the range stays whole and its quote names only the opening words that can
 *   still be lit. A span with no field names no string.
 *
 *   THE WORDS ARE DRAWN EXACTLY ONCE IN THAT STORED STRING. Twice, and the stored offset is the
 *   only thing separating the copies — and an offset is a hint that an edit elsewhere in the string
 *   silently slides onto the wrong copy. This is the check that stops the highlight moving.
 *
 *   THAT ONE PLACE IS WHERE THE COMMENT SAID IT WAS. Offsets are evidence and are never repaired:
 *   words that are somewhere else now are words that moved, and moving the highlight after them is
 *   the guess this whole file refuses to make.
 *
 * Exported so a test can put the same question without a browser: it is arithmetic over strings.
 */
export function whereTheWordsAre(runs: readonly DrawnRun[], span: NamedSpan): Lit | null {
  if (span.field === undefined) return null
  const quote = wordsInNamedSpan(span)
  if (quote === '') return null
  if (span.cut === true ? span.to - span.from < quote.length : span.to - span.from !== quote.length) return null

  const found: (Lit & { at: number })[] = []
  runs.forEach((run, index) => {
    if (run.field !== span.field) return
    if (!Number.isInteger(run.offset) || run.offset < 0) return
    for (let at = run.text.indexOf(quote); at !== -1; at = run.text.indexOf(quote, at + 1)) {
      found.push({ run: index, from: at, to: at + quote.length, at: run.offset + at })
    }
  })

  const only = found.length === 1 ? found[0] : undefined
  if (only === undefined) return null
  if (only.at !== span.from) return null
  return { run: only.run, from: only.from, to: only.to }
}

/**
 * WHAT THE DRAWN TEXT CAN PROVE ABOUT ONE COMMENT'S WORDS. Three answers, and the third is real.
 *
 * `lit`        — the words are drawn, exactly where the comment said they were. Light them.
 * `moved`      — the stretch of the stored string this comment named is drawn, AND IT READS AS
 *                SOMETHING ELSE. The words have changed. Say so on the object.
 * `cannot say` — this page does not draw that stored string, or draws it in pieces that do not
 *                cover the comment's own range, or draws the words twice with nothing to separate
 *                the copies. Nothing is lit and nothing is claimed.
 *
 * THE THIRD ANSWER IS NOT A FAILURE, it is the fifth engineering rule: "nothing is there" and
 * "nobody has looked" may never draw the same. A mark that said "text changed" whenever a highlight
 * failed would say it on every page that draws a shortened preview of the same string.
 */
export type WordsOnScreen = { drawn: 'lit'; where: Lit } | { drawn: 'moved' } | { drawn: 'cannot say' }

/**
 * Whether the quoted words are drawn, moved, or beyond what this page can say.
 *
 * `whereTheWordsAre` above answers the first question and is left exactly as it was, because it is
 * what stops a highlight moving onto a different copy of the same words and tests/the-highlight-
 * never-moves.test.ts holds it to that. This asks the SECOND question, and only when the first
 * answered no: is there a single run of drawn text that covers the characters this comment named?
 * If there is, and those characters do not read as the quote, the text under the comment changed
 * and the page can say so without guessing anything.
 *
 * A RUN THAT IS TOO SHORT COUNTS ONLY WHEN IT IS THE WHOLE STORED STRING. One run starting at
 * character 0 is what every plain paragraph, note body, plan line and table cell draws as, so when
 * that one run ends before the comment's range, the string is simply shorter than it was and the
 * words cannot be there. Several runs — which is what Markdown with a bold word in it draws as —
 * may leave gaps, so a range that no single run covers is left unanswered.
 */
export function wordsOnScreen(runs: readonly DrawnRun[], span: NamedSpan): WordsOnScreen {
  const lit = whereTheWordsAre(runs, span)
  if (lit !== null) return { drawn: 'lit', where: lit }
  const quote = wordsInNamedSpan(span)
  if (span.field === undefined || quote === '') return { drawn: 'cannot say' }
  if (span.cut === true ? span.to - span.from < quote.length : span.to - span.from !== quote.length) {
    return { drawn: 'cannot say' }
  }

  const mine = runs.filter(
    (run) => run.field === span.field && Number.isInteger(run.offset) && run.offset >= 0,
  )
  if (mine.length === 0) return { drawn: 'cannot say' }

  const covering = mine.find((run) => run.offset <= span.from && run.offset + run.text.length >= span.to)
  if (covering !== undefined) {
    const there = covering.text.slice(span.from - covering.offset, span.to - covering.offset)
    // THE WORDS ARE WHERE THE COMMENT SAID AND STILL NOTHING WAS LIT. The only way that happens is
    // a second copy of them drawn elsewhere in the same stored string, and which copy this comment
    // was about is exactly what nothing recorded. Not a change; nothing to report.
    return (span.cut === true ? there.startsWith(quote) : there === quote)
      ? { drawn: 'cannot say' }
      : { drawn: 'moved' }
  }

  const whole = mine.length === 1 ? mine[0] : undefined
  if (whole !== undefined && whole.offset === 0) return { drawn: 'moved' }
  return { drawn: 'cannot say' }
}

/** What one element says about itself, or null when it does not say both halves of it. */
function runOf(element: Element): DrawnRun | null {
  const field = element.getAttribute(TEXT_FIELD_ATTRIBUTE)
  const offset = Number(element.getAttribute(TEXT_OFFSET_ATTRIBUTE))
  if (field === null || field === '') return null
  if (!Number.isInteger(offset) || offset < 0) return null
  return { field, offset, text: element.textContent ?? '' }
}

/** A range over characters `from` to `to` of an element's text, counted across its text nodes. */
function rangeOverText(run: Element, from: number, to: number): Range | null {
  const walker = document.createTreeWalker(run, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let seen = 0
  let started = false
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0
    if (!started && seen + length > from) {
      range.setStart(node, from - seen)
      started = true
    }
    if (started && seen + length >= to) {
      range.setEnd(node, to - seen)
      return range
    }
    seen += length
  }
  return null
}

/**
 * FOR EVERY MARK WHOSE OWN KEY NO ELEMENT ON THIS PAGE CARRIES, THE KEY OF THE ELEMENT THAT DRAWS
 * IT. Every other mark is left out, because its own key is the answer.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A MARK'S KEY CAN BE A KEY NOTHING ON THE PAGE CARRIES
 * ---------------------------------------------------------------------------------------
 *
 * A comment on a block, a row or a cell of a report is STORED as the region it names: the write
 * path spells it that way so that a stored context cannot stop the server coming up — the whole
 * argument is on `theRegionItNames` in src/server/lib/targets.ts. The ELEMENT drawing that block
 * still carries `reportBlock/<record>/<block>`, which is a different string. So the two selectors
 * this file writes — the wash on the quoted words, and the `❝` on the object — would each find
 * nothing, and both would fail the silent way: no error, no warning, just a page with no marks on
 * its blocks and no highlight in its tables.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS THE BRIDGE THE FRAME ALREADY USES, AND NOT A SECOND ONE
 * ---------------------------------------------------------------------------------------
 *
 * `regionsDrawnOn` in src/web/lib/drawnhere.ts reads every addressable element on the page and keys
 * it by the region it is, converting the older spellings through `regionIdOfLegacyTarget` — the one
 * converter, which the server resolves both spellings with. This asks that map which element draws
 * the region, and
 * then reads the key off the element rather than working one out. So there is no reverse grammar
 * anywhere: nothing here can spell a `tableCell` key, and nothing needs to.
 *
 * IT IS READ ONCE PER PASS AND ONLY WHEN SOMETHING NEEDS IT, because it walks the whole page.
 */
function whereEachIsDrawn(marks: readonly Mark[], drafts: readonly { key: string }[] = []): Map<string, string> {
  const out = new Map<string, string>()
  if (typeof document === 'undefined') return out
  const answer = (key: string, target: Target): void => {
    if (document.querySelector(`[${TARGET_ATTRIBUTE}="${quoted(key)}"]`) !== null) return
    const drawn = elementDrawing(target)?.getAttribute(TARGET_ATTRIBUTE)
    // THE KEY IS READ OFF THE ELEMENT rather than worked out, so nothing here has to know how a
    // `tableCell` key is spelled — and nothing can spell one wrongly.
    if (drawn !== null && drawn !== undefined && drawn !== '') out.set(key, drawn)
  }
  for (const mark of marks) answer(mark.key, mark.target)
  /**
   * AN UNSENT INSTRUCTION IS RE-SPELLED TOO — CRITERION D23.
   *
   * A comment saved and not sent is kept in this browser, not on the server, so it arrives here as a
   * key and nothing else. It used to be drawn only where an element carried that exact key, and on a
   * drawing that meant it appeared with the card's detail tick and vanished without it. A comment must not
   * appear or vanish with the detail tick.
   *
   * A DRAFT'S KEY IS A TARGET KEY, so it is read back with `targetFromAttributeValue` — the one
   * reader of the attribute grammar, which is also what turns every element's attribute into a
   * target. There is no second grammar here and nothing is parsed by hand.
   */
  for (const draft of drafts) {
    const read = targetFromAttributeValue(draft.key)
    if ('problem' in read) continue
    answer(draft.key, read.target)
  }
  return out
}

/** The pairs above as one string, so React can tell two equal readings from two different ones. */
function sayDrawnAs(pairs: ReadonlyMap<string, string>): string {
  return [...pairs].map(([key, drawn]) => `${key}\t${drawn}`).sort().join('\n')
}

/** The same string read back. The only reader of what `sayDrawnAs` writes. */
export function readDrawnAs(said: string): Map<string, string> {
  const out = new Map<string, string>()
  if (said === '') return out
  for (const line of said.split('\n')) {
    const cut = line.lastIndexOf('\t')
    if (cut < 0) continue
    out.set(line.slice(0, cut), line.slice(cut + 1))
  }
  return out
}

/**
 * Light the quoted words of every waiting comment, and say which objects hold a comment whose words
 * have changed.
 *
 * It walks the marks rather than the document, so the work is one lookup per comment waiting rather
 * than a scan of the page. Nothing is lit for a comment whose words are no longer where it said —
 * and that comment's object is named in what comes back, so the layer can mark it. A comment whose
 * words moved is the one a person most needs to see, because it is the one that may now be about
 * something else.
 *
 * It answers with KEYS, sorted, so the caller can compare one reading with the next by value.
 */
function lightTheWords(marks: readonly Mark[], drawnAs: ReadonlyMap<string, string>): string[] {
  const changed = new Set<string>()
  const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
  const HighlightClass = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight

  const ranges: Range[] = []
  for (const mark of marks) {
    if (mark.spans.length === 0) continue
    // THE SAME QUOTING THE STYLESHEET USES, from the same function. Two spellings of one selector
    // is the defect this repository keeps finding, and this one would fail silently.
    //
    // AND THE KEY IS THE ONE THE PAGE ACTUALLY DREW. `whereEachIsDrawn` above answers that, and it
    // is the mark's own key for everything except a block, a row and a cell — see its note.
    const holders = document.querySelectorAll(`[${TARGET_ATTRIBUTE}="${quoted(drawnAs.get(mark.key) ?? mark.key)}"]`)
    for (const holder of holders) {
      // EVERY RUN OF THE THING, TOGETHER, because the question is where in the whole stored string
      // the words are drawn — asking one run at a time cannot see a second copy in the next one.
      const drawn: { element: Element; run: DrawnRun }[] = []
      for (const element of holder.querySelectorAll(`[${TEXT_OFFSET_ATTRIBUTE}]`)) {
        const run = runOf(element)
        if (run !== null) drawn.push({ element, run })
      }
      const runs = drawn.map((one) => one.run)
      for (const span of mark.spans) {
        const found = wordsOnScreen(runs, span)
        if (found.drawn === 'moved') {
          changed.add(mark.key)
          continue
        }
        if (found.drawn !== 'lit') continue
        const where = drawn[found.where.run]
        if (where === undefined) continue
        const range = rangeOverText(where.element, found.where.from, found.where.to)
        if (range === null) continue
        ranges.push(range)
      }
    }
  }

  // A browser with no highlight registry draws no highlight. The small mark on the object is still
  // drawn, the mark still says when the words have changed, and the conversation still holds the
  // words, so nothing is lost but the tint. The reading above is done either way, which is why this
  // is here and not at the top: the words that changed are the half that does not need the registry.
  if (registry !== undefined && HighlightClass !== undefined) {
    if (ranges.length === 0) registry.delete(HIGHLIGHT)
    else registry.set(HIGHLIGHT, new HighlightClass(...ranges))
  }
  return [...changed].sort()
}

// ============================================================================ take me to that one

/**
 * GO TO THE THING A COMMENT IS ABOUT, SCROLL TO IT, AND LIGHT THE EXACT WORDS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS HERE AND NOT IN THE PANE
 * ---------------------------------------------------------------------------------------
 *
 * The pane knows which comment. This file knows how a stored quote becomes characters on the
 * screen — `wordsOnScreen` above is that reading, and it is the reading that refuses to light words
 * it cannot prove are the right ones. A second copy of it in the pane would light a different copy
 * of the same phrase, which is the exact defect the top of this file exists to prevent.
 *
 * ---------------------------------------------------------------------------------------
 * THE PAGE IS NOT THERE YET WHEN THE ASK ARRIVES, AND THAT IS THE ORDINARY CASE
 * ---------------------------------------------------------------------------------------
 *
 * Pressing a comment changes the address, and a page fetches after it mounts. So the element is
 * looked for, then looked for again on every change to the document, until it appears or until the
 * deadline. WHAT HAPPENS WHEN IT NEVER APPEARS IS SAID rather than left as a press that did
 * nothing: `notHere` is a real answer, and the pane draws it.
 *
 * NOTHING IS WRITTEN INTO ANOTHER COMPONENT'S DOM, for the reason the top of this file gives. The
 * wash on the words is the browser's own highlight registry, and the rail and the frame are
 * rectangles measured from the document and drawn in a layer of their own.
 */
export type Showing =
  | { state: 'none' }
  /** Somebody pressed a comment, the address has changed, and the thing has not appeared yet. */
  | { state: 'looking'; key: string; annotationId: string }
  /** It is on the screen. `drawn` says which of §8.2's marks the page could put on it. */
  | { state: 'found'; key: string; annotationId: string; words: boolean; drawn: DrawnMarkKind; place: Place | null }
  /** The deadline passed and nothing on this page says it is that thing. */
  | { state: 'notHere'; key: string; annotationId: string }
  /**
   * THE PART THIS COMMENT IS ABOUT IS NOT DRAWN AS ITSELF AT THE READING LENGTH ON SCREEN.
   *
   * A report drawn at a shorter length puts fewer of its parts on the page, so a comment written at
   * "All of it" is often about characters this drawing has not drawn on their own. That is not the
   * same fact as `notHere`, which says nothing on this page is that thing, and until 30 August 2026
   * both were drawn with the same three words. `says` is `howItDrawsHere`'s own sentence — the one
   * place that decided which of the five cases this is — and `drawing` is the word it decided.
   *
   * `marked` SAYS WHETHER ANYTHING WAS DRAWN ROUND. It is true when this drawing put something on
   * the page that holds the comment's part and the frame went round that; it is false when nothing
   * on the page holds it and the sentence is the whole of the answer. Both are honest and they are
   * different, so the state carries which one it is rather than leaving a reader of the pane to
   * infer it from words.
   */
  | {
      state: 'notDrawnAsItself'
      key: string
      annotationId: string
      drawing: HowItDraws['drawing']
      says: string
      marked: boolean
    }

/**
 * WHICH OF THE FIVE MARKS OF §8.2 WAS PUT ON THE PAGE, AND `none` WHEN NONE OF THEM COULD BE.
 *
 * `words` is the wash on the exact characters, `rail` the bar beside one line, `frame` the dashed
 * edge round the whole thing. `none` is not a failure to draw: it is the answer for a comment whose
 * context recorded no place at all, where drawing any of the other four would be Mole Office inventing a
 * place nobody stored. The pane says which case it is.
 */
export type DrawnMarkKind = 'words' | 'rail' | 'frame' | 'none'

/** How long Mole Office waits for the thing to appear after the address changes. */
const WAIT_FOR_MS = 6000

/**
 * How long it goes on hoping for a drawing that can light the exact words, after finding one that
 * cannot.
 *
 * The page being left usually lists the thing, so the first element carrying the key draws its
 * title and nothing else. The page being opened draws the words a moment later.
 */
const STILL_HOPING_MS = 4000

/**
 * HOW LONG THE MARK STAYS: UNTIL THE READER ASKS FOR SOMETHING ELSE. There is no clock.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE 2,600 ms TIMER IS GONE
 * ---------------------------------------------------------------------------------------
 *
 * It was `LIT_FOR_MS = 2600`, and nobody had decided it. Measured on 20 August 2026 by an auditor
 * who read the screen at seven moments after a press: everything the press drew — the wash on the
 * words, the rail, the frame — was gone by 2,800 ms and never came back. So *a saved comment is
 * visibly anchored at its source* was true for two and a half seconds and false afterwards, and the
 * proof that says it passes read at about 1,400 ms. A reader who glances away has missed it.
 *
 * Contract §6.16 already says who ends it, and it is never a timer. The durable state is *the
 * current row until the next press*, and *`Esc` clears the lighting*. So three gestures put the mark
 * out and nothing else does:
 *
 *   pressing another comment    `showMeThat` lights null before it asks for the new one
 *   `Esc`                       the listener in this file's component
 *   asking for no comment       `stopShowing`, which the pane and the record page both call
 *   opening the composer        `setSubject`, because a new subject is a new question
 *
 * The layer going away takes the mark with it, and a reload does not restore it — §6.16 again.
 *
 * WHAT THIS IS NOT: a mark that stays on screen with no way to remove it. That is the same defect
 * from the other end, which is why the `Esc` listener lands in the same change as the deletion.
 */

let showing: Showing = { state: 'none' }
const showBroadcast = makeBroadcast()

function readShowing(): Showing {
  return showing
}

function announceShowing(next: Showing): void {
  showing = next
  showBroadcast.announce()
}

/**
 * WHAT WAS ASKED FOR, KEPT APART FROM HOW IT WENT — and they have to be two values.
 *
 * They were one, and the walk below stopped after the first thing it found. The reason is exact:
 * the walk runs in an effect, saying how it went CHANGES that value, and a changed value tears the
 * effect down and builds it again — which disconnects the watcher on the document a moment before
 * the page being opened draws anything. So the first element carrying the key was always the last
 * one considered, and on a press from a list that element is the row being left behind. Measured in
 * Chromium on 18 August 2026: every press answered "no highlight".
 *
 * The ask changes only when somebody presses a comment. The outcome changes as often as it likes.
 */
interface Ask {
  key: string
  /**
   * THE WHOLE STORED CONTEXT OF THE COMMENT, because two different questions are asked of it.
   *
   * The mark is drawn from the PLACE, which is the field below. What the page says when the thing
   * is not on it is answered from the TARGET and the VIEW as well: a part of a report that this
   * reading length does not draw on its own is not missing, and saying "not on that page" about it
   * is false. `howItDrawsHere` is what tells the two apart and it needs the context entire.
   */
  context: Context
  /**
   * WHERE THE COMMENT WAS MADE, WHICH IS THE WHOLE OF WHAT THE MARK IS DRAWN FROM.
   *
   * It was a `Span`, and a span is `null` for four of the five places a comment can be made — so
   * the page could tell "these exact characters" from everything else and nothing else apart at
   * all. A comment on one line and a comment on a whole record arrived here as the same value and
   * were drawn the same way. `null` here is a fifth answer and not a sixth: it means the stored
   * context named no place, which §8.1 calls `Not known`.
   */
  place: Place | null
  annotationId: string
  /** Which press this is. Pressing the same comment twice is two asks, and both are answered. */
  nth: number
  /**
   * WHETHER THIS IS A LEAD, which is shown once and then left. A comment the reader pressed keeps its mark until
   * the reader asks for something else (§6.16). A lead flashes the thing once and draws nothing that stays, so
   * nothing is left on the page for a click, a scroll or a right click to clear.
   */
  lead: boolean
}

let asked: Ask | null = null
const askBroadcast = makeBroadcast()

function readAsk(): Ask | null {
  return asked
}

/**
 * TAKE ME TO THAT ONE. Called by the pane after it has changed the address.
 *
 * The address is the pane's business — the browser owns its routes — and this is the half that
 * happens on the page once it is there.
 */
export function showMeThat(request: { key: string; context: Context; annotationId: string; lead?: boolean }): void {
  // NOTHING OF THE LAST ONE IS LEFT LIT. It used to be: the ask changed, the outline and the wash
  // for the previous comment stayed on the screen until a clock took them off, so pressing a second
  // comment showed two. `light` puts out the registry entry and the rectangles together.
  light(null)
  // THE PLACE IS READ OFF THE CONTEXT HERE AND NOWHERE ELSE. Both callers used to read it for
  // themselves and hand it over beside the key, which is one fact worked out in two places; the
  // one accessor that understands both stored shapes is `placeNamedBy` and this is the one call.
  asked = { ...request, lead: request.lead === true, place: placeNamedBy(request.context), nth: (asked?.nth ?? 0) + 1 }
  announceShowing({ state: 'looking', key: request.key, annotationId: request.annotationId })
  askBroadcast.announce()
}

/** Stop showing it. Called by the pane when the reader asks for a different one. */
export function stopShowing(): void {
  asked = null
  announceShowing({ state: 'none' })
  // THE LIGHT GOES OUT IN THE SAME STATEMENT. These were two values in two places — this one at
  // module scope and `lit` inside the component — so stopping the ask left the wash painted and the
  // outline drawn until a 2,600 ms clock happened to fire. Two facts about one thing, free to
  // disagree, which is the defect this repository keeps finding.
  light(null)
  askBroadcast.announce()
}

/** Whether Mole Office is taking somebody to a comment's source, and how that went. */
export function useShowing(): Showing {
  return useSyncExternalStore(showBroadcast.subscribe, readShowing, readShowing)
}

/** What was asked for, for the layer that answers it. */
function useAsk(): Ask | null {
  return useSyncExternalStore(askBroadcast.subscribe, readAsk, readAsk)
}

/**
 * WHAT IS DRAWN FOR THE COMMENT BEING SHOWN. One value, and the five marks of §8.2 come out of it.
 *
 * `at` is the element the rectangles are measured from — the run for a rail, the thing for a frame,
 * and null when nothing is drawn at all. It is kept beside the rest because they are set together
 * in one function and read together in one measurement; splitting them made the drawing and the
 * state two facts about one thing, which is the defect this repository keeps finding.
 */
export interface Shown {
  key: string
  place: Place | null
  drawn: DrawnMarkKind
}

/**
 * The stylesheet the shown mark needs. Two rules, and neither of them draws a shape.
 *
 * THE WASH IS THE BROWSER'S OWN HIGHLIGHT REGISTRY, because a wash follows the text it is painted
 * on for nothing: no re-measuring on a scroll, and no element written into a paragraph another
 * component owns. Solid says these exact characters; dashed says the words are the place and the
 * subject is bigger, which is §8.2's first two rows and the one difference between them.
 *
 * THE OTHER RULE IS ROOM TO SCROLL INTO, not a mark. `scroll-margin` keeps the thing off the very
 * top edge of the window when it is scrolled to; it draws nothing and says nothing.
 *
 * IT NO LONGER OUTLINES THE THING. A solid outline on the element carrying the key was the one
 * drawing available to every place that is not exact characters, so a comment on one line, a
 * comment whose words could not be placed and a comment on a whole record were all drawn the same
 * way — and on a record page that outline is a 2 px edge down both sides of a nineteen-screen
 * document. §8.2 gives those three their own marks and `measureShown` draws them.
 *
 * Exported so a test can read what would be drawn without a browser.
 */
export function showingRule(lit: Shown | null): string {
  if (lit === null) return ''
  const room = `[${TARGET_ATTRIBUTE}="${quoted(lit.key)}"] {\n  scroll-margin: 25vh;\n}\n`
  if (lit.drawn !== 'words') return room
  const dashed = lit.place !== null && lit.place.at === 'across'
  return (
    room +
    `::highlight(${SHOWING}) {\n` +
    `  background-color: color-mix(in srgb, var(--text) 28%, transparent);\n` +
    `  text-decoration: underline;\n` +
    `  text-decoration-thickness: 2px;\n` +
    `  text-decoration-style: ${dashed ? 'dashed' : 'solid'};\n` +
    `}\n`
  )
}

/**
 * PUT §8.2'S MARK FOR THIS PLACE ON THIS DRAWING OF THE THING, or answer null because it cannot yet.
 *
 * ---------------------------------------------------------------------------------------
 * ONE PLACE IN, ONE MARK OUT, AND NOTHING IN BETWEEN IS GUESSED
 * ---------------------------------------------------------------------------------------
 *
 *   a place naming words          the wash on exactly those characters
 *   a place naming two ends       the wash on each end that can be found, dashed
 *   a place naming a run          the rail beside that run
 *   a place that quotes words     the frame on the thing, with the doubled glyph: the words were
 *                                 kept and Mole Office cannot say where they are
 *   a place saying only the thing the frame on the thing
 *
 * NULL IS "NOT YET", NOT "NEVER". A page fetches after it mounts, so the paragraph a comment quoted
 * is usually not drawn when the first look happens. The caller keeps looking and settles on the
 * frame when the grace period is up, which is the honest end for words that never appeared.
 *
 * THE ELEMENT COMES BACK BECAUSE IT IS WHAT THE CALLER SCROLLS TO. The thing a comment is on is
 * often the whole record page, and scrolling THAT to the middle of the window puts its first
 * paragraph above the top edge. Measured in Chromium at 1440 on 19 August 2026: the words were lit
 * and were off the screen. A run of text is a line or two, so centring it puts the words where the
 * eye is.
 */
function showThePlace(holder: Element, place: Place): { drawn: DrawnMarkKind; at: Element } | null {
  const wants = markForPlace(place)
  if (wants === 'frame') {
    // A PART OF A REPORT THAT NAMES CHARACTERS IS A RUN, AND A RUN'S MARK IS THE RAIL.
    //
    // The fact did not disappear; it moved. A right-click with nothing selected used to store
    // `{at:'run', field, offset}` beside a `reportBlock` target, and the rail was drawn from it.
    // A region target already says the field and the offset — `…text@530` — so storing the run as
    // well is one fact in two fields of one context, and `checkPlace` refuses that pair. The place
    // is now `surface` and WHERE THE PERSON WAS is read off the target instead.
    //
    // Reading it off the element's own `data-target` keeps this function taking one place and one
    // element, and finds the run through the same `runHolding` a run place uses, so the mark drawn
    // is the same mark in the same position as before.
    const asRun = place.at === 'surface' ? runNamedByRegion(holder) : null
    const inside = asRun === null ? null : runHolding(holder, asRun.field, asRun.offset)
    if (inside !== null) return { drawn: 'rail', at: inside }
    return { drawn: 'frame', at: holder }
  }
  if (wants === 'rail') {
    const run = place.at === 'run' ? runHolding(holder, place.field, place.offset) : null
    return run === null ? null : { drawn: 'rail', at: run }
  }
  if (wants !== 'words') return null
  const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
  const HighlightClass = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight
  if (registry === undefined || HighlightClass === undefined) return null

  // BOTH ENDS, EACH FOUND ON ITS OWN, for the same reason the composer's own mark does it: the
  // characters between two runs were never drawn as one stretch, so there is no third range to find
  // and none is invented.
  const wanted = place.at === 'words' ? [place.span] : place.at === 'across' ? [place.from, place.to] : []
  const found = wanted.map((span) => runAndRange(holder, span)).filter((one) => one !== null)
  const first = found[0]
  if (first === undefined) return null
  registry.set(SHOWING, new HighlightClass(...found.map((one) => one.range)))
  return { drawn: 'words', at: first.element }
}

/**
 * The stored string and offset a region target names, or null when the element names no region.
 *
 * Null for every other kind of target and for a region named by an id with no character offset — a
 * whole block, a table row, a table cell. Those name a thing rather than a run, and the frame is
 * their mark.
 */
function runNamedByRegion(holder: Element): { field: string; offset: number } | null {
  const value = holder.getAttribute(TARGET_ATTRIBUTE)
  if (value === null) return null
  const read = targetFromAttributeValue(value)
  if ('problem' in read || read.target.kind !== 'region') return null
  const offset = offsetOf(read.target.regionId)
  return offset === null ? null : { field: identityOf(read.target.regionId), offset }
}

/**
 * WHICH OF §8.2'S MARKS A PLACE ASKS FOR, read off the vocabulary table and never written here.
 *
 * The table already says what each place looks like — a wash, a rail, a frame — so this turns that
 * one word into the one this layer draws with and adds nothing. A second statement of the mapping
 * in the drawing code is the defect this repository keeps finding: change the table and the drawing
 * would go on drawing what the table used to say, with nothing failing.
 *
 * A SHAPE THIS LAYER CANNOT DRAW ANSWERS `none` RATHER THAN THE NEAREST ONE. If the vocabulary ever
 * gives a place a shape that is not a wash, a rail or a frame, nothing is drawn and the pane says
 * so, because drawing the nearest available mark would be Mole Office saying something about a place
 * that its own table does not say.
 *
 * Exported so a test can compare it with the table without a browser.
 */
export function markForPlace(place: Place | null): DrawnMarkKind {
  if (place === null) return 'none'
  const form = PLACE_STATES[place.at].mark.form
  if (form === 'wash') return 'words'
  if (form === 'rail') return 'rail'
  if (form === 'frame') return 'frame'
  return 'none'
}

/**
 * Put the brief light out.
 *
 * AN ENGINE WITH NO HIGHLIGHT REGISTRY HAS NOTHING TO PUT OUT, and this module is loaded in one:
 * the tests around `openAbout` run with no `CSS` global at all, and reading it there raises rather
 * than answering undefined. `showThePlace` already answers null in the same engine, so nothing was
 * ever lit there to delete. This is not a mark quietly skipped — it is a mark that cannot exist.
 */
function stopLighting(): void {
  if (typeof CSS === 'undefined') return
  const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
  registry?.delete(SHOWING)
}

/**
 * WHAT IS LIT RIGHT NOW, AND THE CLOCK THAT PUTS IT OUT, IN ONE PLACE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS AT MODULE SCOPE AND NOT COMPONENT STATE
 * ---------------------------------------------------------------------------------------
 *
 * It was component state, and `stopShowing` — which is module scope, and which the review pane and
 * the record page both call — could not reach it. So asking for a different comment cleared the ask
 * and left the previous one's outline drawn and its wash painted, until a 2,600 ms timer that had
 * been re-armed by an unrelated render happened to fire. The state and the drawing were two facts
 * about one thing with nothing making them agree.
 *
 * NOW ONE FUNCTION OWNS BOTH. `light(x)` sets the value and paints or unpaints the registry in that
 * one call. There is no other way to change either of them, and there is no longer a clock that can
 * change one of them behind the other's back.
 */
let lit: (Shown & { at: Element | null }) | null = null
const litChanged = makeBroadcast()

function readLit(): Shown | null {
  return lit
}

/**
 * Light this, or put the light out. Idempotent, and nothing here is on a clock.
 *
 * CALLING IT TWICE IS ORDINARY: the thing is usually found first and the exact words a moment
 * later, and the second call replaces the first mark with the better one. While there was a timer,
 * the second call also had to restart it, or the words went out before they had finished being
 * drawn. Nothing expires now, so the second call has one job.
 */
function light(next: (Shown & { at: Element | null }) | null): void {
  if (next === null) stopLighting()
  lit = next
  // THE RECTANGLES ARE MEASURED IN THE SAME STATEMENT AS THE VALUE IS SET, for the reason this
  // whole section exists: the state and the drawing were two facts about one thing and drifted.
  shownPieces = measureShown()
  litChanged.announce()
}

/** What is lit, for the layer that draws the rule for it. */
function useLit(): Shown | null {
  return useSyncExternalStore(litChanged.subscribe, readLit, readLit)
}

// ============================================================================ the source, while the composer is open

/**
 * THE THING THE COMPOSER IS OPEN ABOUT, DRAWN ON THE PAGE WHILE IT IS OPEN.
 *
 * ---------------------------------------------------------------------------------------
 * WHY MOLE OFFICE DRAWS ITS OWN MARK INSTEAD OF LEAVING THE BROWSER'S
 * ---------------------------------------------------------------------------------------
 *
 * Focus moving into a text box DESTROYS the document selection. Measured in Chromium, Firefox and
 * WebKit alike on 20 August 2026, claim `wKR0jkvl_7sz`, on a plain page with no Mole Office code:
 * a selection reading sixteen characters with one rectangle became zero characters and no
 * rectangles the moment `focus()` was called on a textarea. So the moment the composer opens, the
 * words it says it is about stop being visible — which is owner finding 6.
 *
 * The second measured fact is what this is built on: A RANGE CLONED BEFORE FOCUS MOVED STILL
 * RETURNS ITS RECTANGLES AFTERWARDS, in all three engines. `pointedAt` clones it while the gesture
 * is still live and hands it over as `Pointed.kept`.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS DRAWN BECAUSE A RIGHT-CLICK HAPPENED, NEVER BECAUSE A SELECTION HAPPENED
 * ---------------------------------------------------------------------------------------
 *
 * `setSubject` is called by `openAbout` and by nothing else. There is no code path in the product
 * from a selection event to this file: nothing here listens for `selectionchange`, `pointerup` or
 * `keyup`. Selecting words still draws nothing at all, which is the first half of the owner's
 * invariant, and `tests/…selection-is-passive` and proof P1 hold it there.
 *
 * ---------------------------------------------------------------------------------------
 * ONE IMPLEMENTATION: RECTANGLES, MEASURED, IN ONE LAYER
 * ---------------------------------------------------------------------------------------
 *
 * Everything this draws is a rectangle in window coordinates, measured from the document and drawn
 * in one fixed layer that takes no space and no presses. The wash comes from a `Range`, the rail
 * and the frame from an element's own box. There is ONE measuring function and ONE drawing, so
 * there is no second way of painting the same thing to drift from the first.
 *
 * The browser's own highlight registry is deliberately NOT used for this. It exists in all three
 * engines and it is what the saved comments above are painted with — but a `Highlight` holding a
 * collapsed range satisfies "a highlight exists" and paints nothing, and the acceptance for this
 * step is about rectangles on a screen. Rectangles are the thing being asserted, so rectangles are
 * the thing being drawn. The saved-comment wash is not touched by this step, and consolidating the
 * two is written down in design/round-nine/step19-place-and-paint.md rather than half-done here.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING IS KEPT THAT COULD GO STALE
 * ---------------------------------------------------------------------------------------
 *
 * The rectangles are re-measured on every document change, every scroll and every resize, from the
 * same function that measured them the first time. No clock owns any of it: the mark goes when the
 * composer closes and not one millisecond before or after.
 */

/** One rectangle of the source mark, in window coordinates. */
export interface Piece {
  /** The wash over chosen words, the rail beside a line, or the frame round a whole thing. */
  mark: 'wash' | 'rail' | 'frame'
  /** Solid says these exact characters. Dashed says something weaker, and says it without a hue. */
  edge: 'solid' | 'dashed'
  /** The doubled quote glyph, which is what tells `words only` from `whole thing`. */
  doubled?: true
  left: number
  top: number
  width: number
  height: number
}

/** What the composer is open about, as much of it as the paint needs. */
export interface Subject {
  /** The `data-target` value of the thing, which is how its element is found again. */
  key: string
  /** Where the person was inside it. */
  place: Place
  /** The range they had selected, cloned before focus moved, or null when there was none. */
  kept: Range | null
  /** The browser selection itself marks the words while its touch handles remain live. */
  keepSelection?: boolean
  /**
   * THE ELEMENT THE PERSON PRESSED. Null only when the caller genuinely had none.
   *
   * IT IS HERE BECAUSE A KEY DOES NOT NAME A PLACE ON THE PAGE. A record's key names the record,
   * and the foot of a record page draws the same record up to four times: as a sentence under a
   * relation, as a row in the links fold, as a row under Last changed and as a row under What is
   * still open around this. Finding the element again by key alone takes the FIRST of those, so
   * right-clicking the fourth drew the frame round the first — the composer naming one row and the
   * frame drawn round another 330 px away. The owner found it by hand on 2 September 2026.
   *
   * IT IS NOT A SECOND WAY OF SAYING WHAT THE SUBJECT IS. `key` says what the comment is about and
   * is what is sent; this says which drawing of it was under the mouse, and it is never sent. When
   * the element leaves the page the key is still the truth, and the lookup by key is what answers.
   */
  pressed: Element | null
}

let subject: Subject | null = null
let pieces: readonly Piece[] = []
/** The layer the subject's mark is drawn in. Null is the page. */
let subjectLayer: Element | null = null
const subjectChanged = makeBroadcast()

/**
 * WHETHER THE THING THE COMPOSER IS OPEN ABOUT IS DRAWN ON THIS PAGE RIGHT NOW.
 *
 * It is read in the same pass that measures the mark, off the same one lookup, so the mark and the
 * word the composer draws cannot disagree about whether the thing is here. False while nothing is
 * open, because a question about a subject that does not exist has no true answer.
 *
 * IT FOLLOWS THE THING AND NOT THE ADDRESS. A row of the rail is on every page, so a reader who
 * changes page with the composer open on one has not left it behind; saying they had would be a
 * false statement drawn beside a mark still framing the row.
 */
let subjectIsHere = false

function readPieces(): readonly Piece[] {
  return pieces
}

function readSubjectIsHere(): boolean {
  return subjectIsHere
}

/** Nothing to draw, held as one value so two readers cannot disagree about which nothing it is. */
const NOTHING: readonly Piece[] = []

/**
 * The rail or the frame for the comment somebody pressed, kept apart from the composer's own mark.
 *
 * TWO MARKS CAN BE ON THE SCREEN AT ONCE and they are about different things: one says what the
 * composer is open about, the other says where the comment you pressed was made. They are measured
 * by the same two functions and drawn in the same layer, so there is one appearance and one
 * measurement; holding them in one list would make the composer closing take the other one with it.
 */
let shownPieces: readonly Piece[] = NOTHING
/** The layer the shown comment's mark is drawn in. Null is the page. */
let shownLayer: Element | null = null

function readShownPieces(): readonly Piece[] {
  return shownPieces
}

function readShownLayer(): Element | null {
  return shownLayer
}

function readSubjectLayer(): Element | null {
  return subjectLayer
}

/**
 * How many rectangles a wash may draw before Mole Office stops claiming it drew all of them.
 *
 * A selection of the whole page — `Ctrl/⌘+A` and a right-click — has thousands of client
 * rectangles, and a wash that drew a few hundred of them would be a mark saying "these words" over
 * a fraction of the words. Above this the frame on the thing is drawn instead: one drawing replaces
 * another, and nothing false is claimed about which characters were chosen.
 */
const MOST_RECTANGLES = 400

/** The rectangles a range covers, as pieces. Empty when the range is not in the document any more. */
function washOf(range: Range, edge: 'solid' | 'dashed'): Piece[] {
  if (!range.startContainer.isConnected || !range.endContainer.isConnected) return []
  const out: Piece[] = []
  for (const box of range.getClientRects()) {
    if (box.width <= 0 || box.height <= 0) continue
    out.push({ mark: 'wash', edge, left: box.left, top: box.top, width: box.width, height: box.height })
  }
  return out
}

/** The frame round a whole thing. */
function frameOf(element: Element, doubled: boolean): Piece[] {
  const box = element.getBoundingClientRect()
  if (box.width <= 0 && box.height <= 0) return []
  const piece: Piece = { mark: 'frame', edge: 'dashed', left: box.left, top: box.top, width: box.width, height: box.height }
  return [doubled ? { ...piece, doubled: true } : piece]
}

/** The 3px bar in the left margin that says a place with no words. */
function railOf(element: Element): Piece[] {
  const box = element.getBoundingClientRect()
  if (box.height <= 0) return []
  return [{ mark: 'rail', edge: 'solid', left: box.left - 8, top: box.top, width: 3, height: box.height }]
}

/** Every element inside a holder that says which stored string it draws, with what it says. */
function runsOf(holder: Element): { element: Element; run: DrawnRun }[] {
  const drawn: { element: Element; run: DrawnRun }[] = []
  for (const element of holder.querySelectorAll(`[${TEXT_OFFSET_ATTRIBUTE}]`)) {
    const run = runOf(element)
    if (run !== null) drawn.push({ element, run })
  }
  return drawn
}

/**
 * The characters one span names, re-found in the document: the range, and the run drawing it.
 *
 * ONE FINDER, TWO CALLERS. The composer's mark wants the range; the shown comment wants the range
 * to light and the run to scroll to. Two finders would be two answers to "where are those words",
 * free to disagree about the same comment on the same page.
 */
function runAndRange(holder: Element, span: NamedSpan): { element: Element; range: Range } | null {
  const drawn = runsOf(holder)
  const found = wordsOnScreen(
    drawn.map((one) => one.run),
    span,
  )
  if (found.drawn !== 'lit') return null
  const where = drawn[found.where.run]
  if (where === undefined) return null
  const range = rangeOverText(where.element, found.where.from, found.where.to)
  return range === null ? null : { element: where.element, range }
}

/** A range over the characters one span names, re-found in the document. Null when it cannot be. */
function rangeForSpan(holder: Element, span: NamedSpan): Range | null {
  return runAndRange(holder, span)?.range ?? null
}

/** Keep a full selected range while marking only the stored opening words. */
function spanAtPlace(place: Place, span: Span): NamedSpan {
  return 'cut' in place && place.cut === true && span.to - span.from > span.quote.length
    ? spanShownAsCut(span)
    : span
}

/**
 * THE RUN A `run` PLACE NAMES, FOUND BY CONTAINMENT AND NEVER BY EQUALITY.
 *
 * The run whose own stretch of the stored string contains the recorded offset is the run. A block
 * that has since been drawn in different pieces — one paragraph re-chunked around a bold word —
 * still finds it, where asking for a run starting at exactly that offset would silently find none.
 */
function runHolding(holder: Element, field: string, offset: number): Element | null {
  for (const one of runsOf(holder)) {
    if (one.run.field !== field) continue
    if (one.run.offset <= offset && offset < one.run.offset + one.run.text.length) return one.element
  }
  return null
}

/** A box in window coordinates, by its four edges. */
interface Edges {
  left: number
  top: number
  right: number
  bottom: number
}

/** Whether an element with this overflow value scrolls its contents. */
function scrollsBy(overflow: string): boolean {
  return overflow === 'auto' || overflow === 'scroll'
}

/**
 * THE PART OF THE WINDOW WHERE THIS ELEMENT CAN BE SEEN: the window, cut by every box around it that
 * scrolls. Problem DowO7yEioWp0.
 *
 * A mark is drawn in window coordinates, so a message scrolled half out of the chat's list had its
 * frame drawn over the chat's header and its typing box. Each box that scrolls is cut at its inner
 * edge, which is where its contents stop being drawn. The page itself scrolls the window, which the
 * window's own box already covers, so the root and the body are not asked.
 */
function whereItCanBeSeen(element: Element): Edges {
  let seen: Edges = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
  for (let at = element.parentElement; at !== null; at = at.parentElement) {
    if (at === document.documentElement || at === document.body) break
    const style = getComputedStyle(at)
    if (!scrollsBy(style.overflowX) && !scrollsBy(style.overflowY)) continue
    const outer = at.getBoundingClientRect()
    const left = outer.left + at.clientLeft
    const top = outer.top + at.clientTop
    seen = {
      left: Math.max(seen.left, left),
      top: Math.max(seen.top, top),
      right: Math.min(seen.right, left + at.clientWidth),
      bottom: Math.min(seen.bottom, top + at.clientHeight),
    }
  }
  return seen
}

/**
 * THE PIECES CUT TO WHERE THE THING CAN BE SEEN. A piece wholly outside is not drawn, and a piece
 * partly outside is drawn up to the edge, so a mark never lies over something the thing is not in.
 */
function cutToWhatCanBeSeen(drawn: readonly Piece[], thing: Element | null): readonly Piece[] {
  if (thing === null || drawn.length === 0) return drawn
  const seen = whereItCanBeSeen(thing)
  const cut = drawn.flatMap((piece) => {
    const left = Math.max(piece.left, seen.left)
    const top = Math.max(piece.top, seen.top)
    const right = Math.min(piece.left + piece.width, seen.right)
    const bottom = Math.min(piece.top + piece.height, seen.bottom)
    if (right <= left || bottom <= top) return []
    return [{ ...piece, left, top, width: right - left, height: bottom - top }]
  })
  return cut.length === 0 ? NOTHING : cut
}

/**
 * THE LAYER A THING IS DRAWN IN, WHICH IS WHERE ITS MARK IS DRAWN. Problem DowO7yEioWp0.
 *
 * A panel fixed over the page, like the corner chat, is a layer above the page. The mark used to be
 * drawn on the page body under every such panel, so a frame round a message lay under the chat that
 * held it. The nearest fixed element around the thing is its layer. Null means the page itself.
 */
function layerOf(thing: Element | null): Element | null {
  for (let at = thing?.parentElement ?? null; at !== null; at = at.parentElement) {
    if (at === document.body) return null
    if (getComputedStyle(at).position === 'fixed') return at
  }
  return null
}

/**
 * WHAT THE MARK IS, MEASURED FROM THE DOCUMENT AS IT IS RIGHT NOW.
 *
 * ---------------------------------------------------------------------------------------
 * THE ORDER THE WASH IS FOUND IN, WHICH IS THE WHOLE OF HOW IT SURVIVES A RE-RENDER
 * ---------------------------------------------------------------------------------------
 *
 * THE KEPT RANGE FIRST, while it is still in the document. It is exactly what the person selected,
 * so the rectangles are exactly the rectangles the browser drew before focus took them away.
 *
 * THE STORED NUMBERS SECOND, when the kept range's own nodes have been replaced — which is what a
 * re-render of the block does. `words` and `across` name positions in a stored string, so they can
 * be found again; `quote` cannot, by definition, and its wash goes while its frame stays. That is
 * the honest ladder rather than a guess: a place that never named a position does not acquire one
 * because the page redrew.
 *
 * THE HOLDER IS HANDED IN RATHER THAN LOOKED UP HERE, because the composer asks the same question
 * — is the thing on this page — and one lookup answering both is one answer. Looking it up twice
 * would let the mark and the composer's own word disagree about the same page.
 */
function measureSubject(now: Subject | null, holder: Element | null): readonly Piece[] {
  if (now === null || holder === null || typeof document === 'undefined') return NOTHING
  if (now.keepSelection) return NOTHING
  const place = now.place
  const edge: 'solid' | 'dashed' = place.at === 'words' ? 'solid' : 'dashed'

  if (place.at === 'surface') {
    // WHERE THE PERSON WAS, READ OFF THE TARGET WHEN THE PLACE NO LONGER CARRIES IT. A region
    // target names a stored string and a character — `…text@530` — so a press inside one stores
    // `surface` rather than repeating those two numbers in the place. The rail is still the mark:
    // the fact moved, it did not go. See `runNamedByRegion`.
    const asRun = runNamedByRegion(holder)
    const inside = asRun === null ? null : runHolding(holder, asRun.field, asRun.offset)
    return inside === null ? frameOf(holder, false) : railOf(inside)
  }
  if (place.at === 'run') {
    const run = runHolding(holder, place.field, place.offset)
    return run === null ? frameOf(holder, false) : railOf(run)
  }

  const kept = now.kept === null ? [] : washOf(now.kept, edge)
  if (place.at === 'quote') {
    // THE FRAME IS ALWAYS DRAWN AND THE WASH IS DRAWN WHILE IT CAN BE. The frame with its doubled
    // glyph is this place's own mark — the words were kept and Mole Office cannot say where they are —
    // and the wash is the person's own selection, which the invariant says stays visible.
    const frame = frameOf(holder, true)
    return kept.length === 0 || kept.length > MOST_RECTANGLES ? frame : [...frame, ...kept]
  }
  if (kept.length > 0 && kept.length <= MOST_RECTANGLES) return kept

  const ranges: Range[] = []
  if (place.at === 'words') {
    const one = rangeForSpan(holder, spanAtPlace(place, place.span))
    if (one !== null) ranges.push(one)
  } else {
    // BOTH ENDS, EACH FOUND ON ITS OWN. The characters between two runs were never drawn, so there
    // is no third range to find and none is invented: the two ends are what was recorded and the
    // two ends are what is drawn.
    const from = rangeForSpan(holder, spanAtPlace(place, place.from))
    const to = rangeForSpan(holder, spanAtPlace(place, place.to))
    if (from !== null) ranges.push(from)
    if (to !== null) ranges.push(to)
  }
  const found = ranges.flatMap((range) => washOf(range, edge))
  // THE WORDS COULD NOT BE FOUND AGAIN, so the frame says the thing and nothing claims the words.
  return found.length === 0 || found.length > MOST_RECTANGLES ? frameOf(holder, false) : found
}

/**
 * THE RAIL OR THE FRAME FOR THE COMMENT BEING SHOWN, measured from the document as it is now.
 *
 * The wash is not here: it is painted by the browser's highlight registry, which follows the text
 * without being measured again. A rail and a frame are boxes in window coordinates, so they are
 * measured by the same pass — and by the same two functions — as the composer's own mark.
 */
function measureShown(): readonly Piece[] {
  const now = lit
  if (now === null || now.at === null || typeof document === 'undefined') return NOTHING
  if (!now.at.isConnected) return NOTHING
  shownLayer = layerOf(now.at)
  if (now.drawn === 'rail') return cutToWhatCanBeSeen(railOf(now.at), now.at)
  // THE DOUBLED GLYPH IS THE SECOND CHANNEL AND NOT DECORATION. §8.2: `words only` and `whole thing`
  // must not be told apart by the frame alone, because one means the words were kept and could not
  // be placed and the other means no place finer than the thing was recorded.
  if (now.drawn === 'frame') return cutToWhatCanBeSeen(frameOf(now.at, now.place !== null && now.place.at === 'quote'), now.at)
  return NOTHING
}

/**
 * THE ELEMENT ON THIS PAGE CARRYING A KEY, or null when nothing on this page carries it.
 *
 * One rule, two readers: the mark measured below, and the word the composer draws when the thing it
 * is about is somewhere else.
 */
function holderOf(key: string): Element | null {
  return holdersDrawing(key)[0] ?? null
}

/**
 * THE PRESSED ELEMENT, WHILE IT IS STILL ON THE PAGE AND STILL THE THING THE SUBJECT IS ABOUT.
 *
 * Two questions, and both have to be yes. `isConnected` is whether it is still in the document at
 * all: a row re-rendered by a fetch is a different element and the old one is nowhere. The
 * attribute is whether it still draws the same thing: React reuses an element and changes what it
 * says, so an element still in the document can have become a row about another record.
 *
 * Null means the caller has to look the key up, which is the honest answer — the drawing that was
 * pressed has gone, and the first drawing of the same thing is the best the page can offer.
 */
function stillTheOnePressed(pressed: Element | null, key: string): Element | null {
  if (pressed === null || !pressed.isConnected) return null
  return pressed.getAttribute(TARGET_ATTRIBUTE) === key ? pressed : null
}

/**
 * WHERE TO DRAW THE MARK FOR THE OPEN COMPOSER: the pressed element, or the lookup when it is gone.
 *
 * One rule, two readers — `setSubject` when the composer opens and `remeasure` on every scroll and
 * resize. They used to hold two copies of this and both read the key alone, so a mark that had
 * landed correctly jumped to the first drawing on the reader's next scroll.
 */
function whereTheSubjectDraws(now: Subject | null): Element | null {
  if (now === null) return null
  return stillTheOnePressed(now.pressed, now.key) ?? holderOf(now.key)
}

/**
 * THE ELEMENTS DRAWING A STORED COMMENT'S THING, THE ONE IT WAS WRITTEN ON FIRST.
 *
 * A comment records the region it was met in when it was met on another record's page — `drawnIn`,
 * *Met under "What is still open around this"*. The page can draw that record in four places, so
 * taking the first is taking a guess where the comment already says which one. The region's own
 * element is found by key, and the drawings inside it come first.
 *
 * WHEN NOTHING IS INSIDE IT the order is left exactly as it was. The region may not be drawn at
 * this reading length, or on this page at all, and a comment that cannot be put back where it was
 * made is still a comment about the same record — so the first drawing is still shown, rather than
 * nothing.
 */
function holdersDrawnIn(key: string, drawnIn: DrawnIn | undefined): Element[] {
  const holders = holdersDrawing(key)
  if (drawnIn === undefined || holders.length < 2 || typeof document === 'undefined') return holders
  // THE REGION KEY IS SPELLED BY THE ONE SPELLER. `targetAttributeValue` writes every key this
  // product puts on an element, so the string looked for here cannot drift from the string written.
  const regionKey = targetAttributeValue({ kind: 'region', recordId: drawnIn.recordId, regionId: drawnIn.regionId })
  return theOnesDrawnInsideFirst<Element>(holders, document.querySelector(`[${TARGET_ATTRIBUTE}="${quoted(regionKey)}"]`))
}

/**
 * PUT THE DRAWINGS INSIDE THE REGION FIRST, and leave the order alone when there are none.
 *
 * THE RULE ON ITS OWN, WITH NO PAGE IN IT. `holdersDrawnIn` above does the two lookups — which
 * elements draw the thing, and which element is the region — and this decides what to do with the
 * answers. It is separate so that it can be checked without a browser: this repository has no DOM
 * outside a real one, and the rule is the part that can be got wrong.
 *
 * NULL MEANS THE PAGE DOES NOT DRAW THAT REGION, which is an ordinary answer rather than a failure.
 * A comment made under *What is still open around this* can be read back on a page that has no such
 * section, and the first drawing of the thing is still the honest place to show it.
 *
 * EXPORTED FOR ONE TEST, NOT FOR A CALLER.
 */
export function theOnesDrawnInsideFirst<T>(
  holders: readonly T[],
  region: { contains(one: T): boolean } | null,
): T[] {
  if (region === null) return [...holders]
  const inside = holders.filter((one) => region.contains(one))
  return inside.length === 0 ? [...holders] : [...inside, ...holders.filter((one) => !region.contains(one))]
}

/**
 * EVERY ELEMENT ON THIS PAGE THAT DRAWS THE THING A KEY NAMES, in document order, or an empty list.
 *
 * The elements carrying the key, and — when nothing carries it — the one element drawing it under
 * its older word. See `elementDrawing` in src/web/lib/drawnhere.ts for why a stored key can be a key
 * nothing carries. The
 * key is read back with the one reader of the attribute grammar, so nothing here spells a key of
 * its own.
 */
function holdersDrawing(key: string): Element[] {
  if (typeof document === 'undefined') return []
  const exact = [...document.querySelectorAll(`[${TARGET_ATTRIBUTE}="${quoted(key)}"]`)]
  if (exact.length > 0) return exact
  const read = targetFromAttributeValue(key)
  const instead = 'problem' in read ? null : elementDrawing(read.target)
  return instead === null ? [] : [instead]
}

/**
 * WHERE A COMMENT'S PART IS DRAWN WHEN NOTHING ON THIS PAGE IS THAT PART, or null because it is
 * nowhere.
 *
 * ---------------------------------------------------------------------------------------
 * THIS IS THE CALLER OF `howItDrawsHere`
 * ---------------------------------------------------------------------------------------
 *
 * It asks the two things that function needs and neither of them is worked out here. The tree is
 * the one the report's own drawing derived, left in `src/web/lib/drawnreport.ts`; the drawn set is
 * read off the document, which is the same reading `look` above makes to find a mark's holder.
 *
 * NULL IS RETURNED FOR EVERY CASE WHERE THE HONEST ANSWER IS THE OLD ONE. No report drawn on this
 * page, a comment about a different record, a comment that is not about a part of a report, a part
 * this version of the report no longer has, or a holder whose element has gone between the reading
 * and the query. The caller then says "not on that page", which is what it always said.
 */
function whereItIsInstead(
  context: Context,
): { key: string | null; at: Element | null; how: HowItDraws } | null {
  if (typeof document === 'undefined') return null
  if (context.target.kind !== 'region') return null
  const drawn = theReportDrawnHere()
  if (drawn === null || drawn.recordId !== context.target.recordId) return null
  // ONE READING OF THE PAGE, AND THE ELEMENT IS KEPT BESIDE THE ID. `howItDrawsHere` answers with
  // an id; the element carrying it is what this layer has to draw on. Searching the document a
  // second time for that id would be a second reading free to disagree with the first — and it did
  // disagree, for every block drawn under its `reportBlock` word, which no `region/` search finds.
  const here = regionsDrawnOn(drawn.recordId, drawn.blocksField)
  const how = howItDrawsHere(context, drawn.root, new Set(here.keys()))
  // NOTHING ON THE PAGE HOLDS IT, AND THAT IS AN ANSWER RATHER THAN A FAILURE TO ANSWER. This
  // reading length draws neither the part nor anything containing it, so there is no frame to draw
  // — and `how.says` is still the true sentence about why, which is more than the three words the
  // page said before. Measured over the eighteen reports in the corpus on 30 August 2026: 1,225 of
  // the parts drawn at "All of it" have nothing holding them at "The conclusion", so this is the
  // common answer going down the ladder, not the rare one.
  if (how.on === null) return { key: null, at: null, how }
  const at = here.get(how.on)
  // THE ID CAME OUT OF THIS MAP, so the element is in it. `undefined` here would mean the two
  // readings of one page disagreed, and the honest thing then is the sentence without a frame.
  if (at === undefined) return { key: null, at: null, how }
  return { key: targetKey({ kind: 'region', recordId: drawn.recordId, regionId: how.on }), at, how }
}

/** Measure again and tell anybody drawing. Called by the pass, by scrolling, and by resizing. */
function remeasure(): void {
  const holder = whereTheSubjectDraws(subject)
  noteWhetherTheSubjectIsHere(holder)
  const next = cutToWhatCanBeSeen(measureSubject(subject, holder), holder)
  const layer = layerOf(holder)
  if (!sameRectangles(next, pieces) || layer !== subjectLayer) {
    pieces = next
    subjectLayer = layer
    subjectChanged.announce()
  }
  const wasIn = shownLayer
  const alsoNext = measureShown()
  if (!sameRectangles(alsoNext, shownPieces) || wasIn !== shownLayer) {
    shownPieces = alsoNext
    litChanged.announce()
  }
}

/** Whether two measurements would draw identically, so an unchanged one does not re-render. */
function sameRectangles(one: readonly Piece[], other: readonly Piece[]): boolean {
  return one.length === other.length && one.every((piece, at) => sameRectangle(piece, other[at]))
}

/** Whether two pieces would draw identically, so an unchanged measurement does not re-render. */
function sameRectangle(one: Piece, other: Piece | undefined): boolean {
  if (other === undefined) return false
  return (
    one.mark === other.mark &&
    one.edge === other.edge &&
    one.doubled === other.doubled &&
    Math.abs(one.left - other.left) < 0.5 &&
    Math.abs(one.top - other.top) < 0.5 &&
    Math.abs(one.width - other.width) < 0.5 &&
    Math.abs(one.height - other.height) < 0.5
  )
}

/** Write down what the one lookup found, and tell the composer when the answer moved. */
function noteWhetherTheSubjectIsHere(holder: Element | null): void {
  const now = holder !== null
  if (now === subjectIsHere) return
  subjectIsHere = now
  subjectChanged.announce()
}

/**
 * MARK THE THING THE COMPOSER HAS JUST BEEN OPENED ABOUT. Called by `openAbout` and by nothing else.
 *
 * It answers whether a WASH was drawn, and the caller uses that one answer to decide whether to
 * take the browser's selection away. A rail or a frame buys nothing: they mean *a place with no
 * words* and *no place finer than the thing*, and replacing somebody's selection with the mark for
 * "no words were chosen" is the silent substitution this repository's second invariant forbids.
 *
 * IT MEASURES SYNCHRONOUSLY, inside the gesture. The drawing lands in the same commit as the
 * composer, so there is never a frame where the box is open and the source is unmarked.
 */
export function setSubject(next: Subject): boolean {
  // OPENING THE COMPOSER ABOUT SOMETHING IS ASKING FOR SOMETHING ELSE, so the comment somebody was
  // being shown stops being shown. Measured on 20 August 2026, with the mark's clock newly gone:
  // press a saved comment, then right-click a paragraph at the other end of the record, and the
  // page draws both — the wash on the old comment's words and the rail for the new subject. Two
  // marks saying two different things, with nothing telling the reader which is which. The clock
  // used to hide this after 2,600 ms, and hid it badly: inside that window the same two marks were
  // on screen together.
  stopShowing()
  subject = next
  const holder = whereTheSubjectDraws(next)
  subjectIsHere = holder !== null
  pieces = cutToWhatCanBeSeen(measureSubject(next, holder), holder)
  subjectLayer = layerOf(holder)
  subjectChanged.announce()
  return pieces.some((piece) => piece.mark === 'wash')
}

/**
 * THE ELEMENT THE OPEN COMPOSER'S THING IS DRAWN IN, or null when nothing is open or the thing is not
 * on this page. The same one lookup the mark is drawn from. Read by the talk box on a phone, which opens
 * as a sheet from the bottom and moves the thing into the room above it (wave 13s round 13).
 */
export function whereTheOpenSubjectIsDrawn(): Element | null {
  return whereTheSubjectDraws(subject)
}

/** The mark goes. Called when the composer closes, and by nothing on a clock. */
export function clearSubject(): void {
  if (subject === null && pieces.length === 0 && !subjectIsHere) return
  subject = null
  pieces = NOTHING
  subjectLayer = null
  subjectIsHere = false
  subjectChanged.announce()
}

/**
 * WHETHER THE THING THE COMPOSER IS OPEN ABOUT IS ON THIS PAGE, for the composer's own subject row.
 *
 * The answer comes from the pass that measures the mark, so the two are one reading: the page that
 * draws no mark is the page the composer says the thing is not on.
 */
export function useTheSubjectIsHere(): boolean {
  return useSyncExternalStore(subjectChanged.subscribe, readSubjectIsHere, readSubjectIsHere)
}

/** The rectangles of the source mark, for the layer that draws them. */
function useSubjectPieces(): readonly Piece[] {
  return useSyncExternalStore(subjectChanged.subscribe, readPieces, readPieces)
}

/** The rectangles of the mark on the comment somebody pressed, for the same layer. */
function useShownPieces(): readonly Piece[] {
  return useSyncExternalStore(litChanged.subscribe, readShownPieces, readShownPieces)
}

/**
 * The source mark's own appearance. Neutral ink at low alpha, and every state told apart by shape.
 *
 * NO HUE CARRIES ANY OF IT. Solid against dashed is the state channel, the rail is told by its
 * position, and the doubled glyph is what separates "your words were kept and could not be placed"
 * from "no place finer than the thing was recorded" — which is the pair the state vocabulary exists
 * for. design/UX-CONTRACT.md gives the accent to quantity and to a chosen segment, and this is
 * neither.
 *
 * IT SITS AT THE POPOVER LAYER, which is above the page and below the drawer, the scrim and the
 * composer. A layer of its own would be a seventh entry in the scale in tokens.css, and this step
 * was given that file to read and not to write; the one-line addition is handed over in
 * design/round-nine/step19-token-for-the-mark.patch.
 */
const SUBJECT_CSS = `
.px-subject { position: fixed; inset: 0; pointer-events: none; z-index: var(--z-mark); }
/* THE TALK BOX'S PICKED OUTLINE HAS ITS OWN LAYER, under the phone's top bar (wave 13s round 13c). The comment a
   reader pressed keeps --z-mark with the review ring, over the bar. The comment circles went under it (wave 13t round 34). */
.px-subject[data-why="subject"] { z-index: var(--z-picked); }
.px-subject > i { position: fixed; display: block; }
.px-subject-wash {
  background: color-mix(in srgb, var(--text) 16%, transparent);
  border-bottom: 2px solid var(--text);
}
.px-subject-wash[data-edge="dashed"] { border-bottom-style: dashed; }
.px-subject-rail { background: var(--text-2); }
.px-subject-frame {
  outline: var(--focus-w) dashed var(--text-2);
  outline-offset: 3px;
}
.px-subject-glyph {
  position: fixed;
  font-size: var(--fs-1);
  line-height: 1;
  color: var(--text-2);
  font-style: normal;
}
`

/**
 * The rectangles, drawn in the layer their thing is in: on the page body, or inside a panel fixed
 * over the page. They are fixed to the window, so no box inside a panel clips them; each is cut to
 * where its thing can be seen before it gets here (`cutToWhatCanBeSeen`).
 *
 * IT IS NOT HIT-TESTABLE AND HAS NO ROLE. A mark is drawn and never pressed; the way to the thing
 * is the gesture, and the words for the place are said by the composer's own row.
 */
function SourceMark() {
  const subjectDrawn = useSubjectPieces()
  const shownDrawn = useShownPieces()
  const subjectIn = useSyncExternalStore(subjectChanged.subscribe, readSubjectLayer, readSubjectLayer)
  const shownIn = useSyncExternalStore(litChanged.subscribe, readShownLayer, readShownLayer)
  if (typeof document === 'undefined') return null
  // WHY EACH RECTANGLE SAYS WHICH MARK IT BELONGS TO. The two are drawn identically on purpose —
  // one appearance for one meaning — so a reader of the document, and the acceptance harness, would
  // otherwise have no way to tell "the composer is open about this" from "this is the comment you
  // pressed". It is an attribute and not a hue, and nothing on screen changes with it.
  //
  // EACH MARK IS DRAWN IN THE LAYER ITS THING IS IN, which `layerOf` says, and each mark in a drawing of its
  // own: the talk box's picked outline sits under the phone's top bar and the pressed comment's mark over it
  // (wave 13s round 13c), so they cannot share one stacking layer.
  const groups: { layer: Element; why: string; drawn: { piece: Piece; why: string }[] }[] = []
  const add = (layer: Element | null, pieces: readonly Piece[], why: string) => {
    if (pieces.length === 0) return
    const into = layer !== null && layer.isConnected ? layer : document.body
    groups.push({ layer: into, why, drawn: pieces.map((piece) => ({ piece, why })) })
  }
  add(subjectIn, subjectDrawn, 'subject')
  add(shownIn, shownDrawn, 'shown')
  if (groups.length === 0) return null
  return (
    <>
      {groups.map(({ layer, why: whose, drawn }, n) =>
        createPortal(
          <div className="px-subject" data-why={whose} aria-hidden="true">
            {drawn.map(({ piece, why }, at) => (
              <i
                key={`${why}-${piece.mark}-${String(at)}`}
                className={`px-subject-${piece.mark}`}
                data-edge={piece.edge}
                data-why={why}
                style={{ left: piece.left, top: piece.top, width: piece.width, height: piece.height }}
              >
                {piece.doubled === true ? (
                  <i className="px-subject-glyph" style={{ left: piece.left, top: piece.top - 16 }}>
                    {'❝❝'}
                  </i>
                ) : null}
              </i>
            ))}
          </div>,
          layer,
          `layer-${String(n)}`,
        ),
      )}
    </>
  )
}

/**
 * THE WORD FOR A PLACE, READ OFF THE ONE TABLE THAT HOLDS EVERY STATE IN THE PRODUCT.
 *
 * It is here so that this file cannot invent a sixth word for a place, and so that a reader of the
 * paint can see which drawn state each rectangle belongs to. `PLACE_STATES` is the contract's own
 * table in code; this never writes a word of its own.
 */
export function wordForPlace(place: Place): string | null {
  const state = PLACE_STATES[place.at]
  if (state.word === null) return null
  // `fillWord` is the one filler and it REFUSES a missing or a spare number, so a word that gained
  // a second placeholder cannot quietly draw with a gap in it.
  return place.at === 'across' ? fillWord(state.word, { parts: place.parts, partWord: place.partWord }) : state.word
}

// ============================================================================ the layer

/**
 * The marks for the whole product, drawn once, from one reading of what is waiting.
 *
 * IT RE-LIGHTS THE WORDS WHEN THE PAGE CHANGES. A page fetches after it mounts, so the paragraph a
 * comment quoted is usually not in the document when the marks arrive. Watching the document for
 * new elements is what makes the highlight appear on the first visit rather than on the second, and
 * the work is coalesced into one pass per frame so a page building itself row by row does not run
 * this once per row.
 */
export function MarkLayer() {
  const marks = useMarks()
  /**
   * WHAT IS DRAWN, WITH OR WITHOUT THE COMMENTS ALREADY SENT, as Settings' Review marks panel says (wave 13y round
   * 146, item 73a). The default hides them: a sent comment then draws no circle and lights no words. Showing them
   * keeps the read's own marks, so a sent comment draws its circle and lights the words it quoted too.
   */
  const sentMarks = useSentMarks().choice
  const drawn = useMemo(
    () => (marks.state !== 'read' ? null : sentMarks === 'show' ? { marks: marks.marks, notes: marks.notes } : whatIsDrawn(marks.reply, marks.notes, sentMarks)),
    [marks, sentMarks],
  )
  const list = useMemo(() => drawn?.marks ?? [], [drawn])
  /** The comment each circle's press goes to, from the same read the counts come from. */
  const opensAt = useMemo(() => firstCommentOnEach(drawn?.notes ?? []), [drawn])
  const want = useAsk()
  /** The one thing being lit right now, or null. See `light`, which owns it and its clock. */
  const shown = useLit()
  /**
   * The objects holding a comment whose quoted words have changed, as one string.
   *
   * ONE STRING RATHER THAN A LIST, because this is set from a reading of the document and the
   * document changes when the rules built from it change. React stops a re-render when the new
   * state EQUALS the old one, and two lists with the same contents are not equal while two strings
   * are. Without that the mark, the stylesheet, the document change and the reading chase each other
   * for ever.
   */
  const [changed, setChanged] = useState('')
  /**
   * The unsent instructions this browser is keeping, as one string, for the reason `changed` above
   * gives: a new array every render would re-run the memo, rewrite the stylesheet, change the
   * document and start again.
   */
  const [kept, setKept] = useState(() => sayDrafts(keptDrafts()))
  /**
   * WHICH KEY THE PAGE DREW EACH MARK ON, when it is not the mark's own key. One string, for the
   * reason `changed` above gives. `whereEachIsDrawn` measures it in the same pass that lights the
   * words, because both are readings of the same document at the same moment.
   */
  const [drawnAs, setDrawnAs] = useState('')
  const circles = useMemo(
    () =>
      circlesToDraw(list, changed === '' ? [] : changed.split('\n'), readDrafts(kept), readDrawnAs(drawnAs), opensAt),
    [list, changed, kept, drawnAs, opensAt],
  )

  /**
   * RE-READ THE KEPT INSTRUCTIONS WHEN THE COMPOSER OPENS OR CLOSES, AND WHEN ANOTHER TAB WRITES.
   *
   * Those are the two moments the count can change and be seen. While somebody is typing, the thing
   * the pencil would be drawn on is behind the composer, so a count that lagged by one keystroke
   * would be a mark nobody can see being wrong; the moment the composer closes, `clearSubject`
   * broadcasts and this reads the store the composer has already written to. `storage` is the other
   * tab, which the composer here never hears about any other way.
   */
  useEffect(() => {
    const read = () => {
      setKept(sayDrafts(keptDrafts()))
    }
    read()
    const stop = subjectChanged.subscribe(read)
    if (typeof window === 'undefined') return stop
    window.addEventListener('storage', read)
    return () => {
      stop()
      window.removeEventListener('storage', read)
    }
  }, [list])

  useEffect(() => {
    if (typeof document === 'undefined') return
    let asked = 0
    const paint = () => {
      asked = 0
      const drawn = whereEachIsDrawn(list, readDrafts(kept))
      setDrawnAs(sayDrawnAs(drawn))
      const moved = lightTheWords(list, drawn)
      setChanged(moved.join('\n'))
      // THE SOURCE MARK JOINS THE PASS THAT ALREADY EXISTS. A re-render of the block, a fetch that
      // replaces the whole report, a reading style that redraws every paragraph — all of them are a
      // change to the document, and all of them are answered by measuring again from the same
      // function that measured the first time.
      remeasure()
    }
    const soon = () => {
      if (asked !== 0) return
      asked = window.requestAnimationFrame(paint)
    }
    soon()
    const watching = new MutationObserver(soon)
    watching.observe(document.body, { childList: true, subtree: true, characterData: true })
    // SCROLLING AND RESIZING MOVE THE RECTANGLES WITHOUT CHANGING THE DOCUMENT, so neither reaches
    // the observer above. They are the two events the source mark needs and the saved marks do not:
    // a highlight in the registry is painted with the text and follows it for nothing, while a
    // rectangle in window coordinates has to be measured again. Both are listened for in the
    // capture phase so a box that scrolls inside the page is heard as well as the window.
    window.addEventListener('scroll', remeasure, true)
    window.addEventListener('resize', remeasure)
    // A MOVE OF THE CHAT IS NOT A SCROLL, A RESIZE OR A CHANGE TO THE DOCUMENT. Swapping its side only
    // changes the root's attributes, and the page beside it moves over by the chat's width, so a mark
    // measured before the swap was left where the page had been. The store says so before the chat
    // has redrawn, so this asks for the next frame, when the page is where it is going.
    const stopWatchingTheSplit = watchTheSplit(soon)
    return () => {
      watching.disconnect()
      window.removeEventListener('scroll', remeasure, true)
      window.removeEventListener('resize', remeasure)
      stopWatchingTheSplit()
      if (asked !== 0) window.cancelAnimationFrame(asked)
      const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
      registry?.delete(HIGHLIGHT)
    }
    // `kept` IS IN THE LIST BECAUSE `paint` READS IT. It is called from the observer on every change
    // to the document, so without this it would keep re-reading the drafts this browser held when
    // the server's list last changed — and a comment somebody started after that would never be
    // re-spelled onto the card drawing it. Criterion D23.
  }, [list, kept])

  /**
   * TAKE SOMEBODY TO THE THING A COMMENT IS ABOUT.
   *
   * It waits for the element, because the address has just changed and a page fetches after it
   * mounts. When it arrives: scroll it to the middle of the window, light the quoted words if the
   * drawn text can prove which characters they are, and draw §8.2's mark for the place either way.
   * The mark stays until the reader asks for something else — see the note above `light`.
   *
   * A LEAD IS SHOWN ONCE. It waits for the page its address names to finish drawing, flashes the thing
   * with the jump wash and then ends the ask, so nothing it drew stays on the page. Waiting matters
   * most for a lead to a whole record sent from a list: the list's row carries the same key and is still
   * in the document for a moment, and a flash on it is a flash on a row that is leaving the page.
   */
  useEffect(() => {
    if (want === null || typeof document === 'undefined') return

    /**
     * THREE STATES, AND THE MIDDLE ONE IS WHY THIS IS NOT TWO LINES.
     *
     * The first element carrying the key is usually NOT the one that draws the words. Pressing a
     * comment from a list leaves a page that lists the record: the row on that page carries the
     * record's key and draws its title, and it is still in the document while the record's own
     * page is fetching. Settling for it means the exact words are never lit — measured in Chromium
     * on 18 August 2026, where every press answered "no highlight".
     *
     * So the walk takes the first thing it finds — a person pressed something and must see it move
     * — and goes on looking for a drawing that can prove where the quoted words are, until it finds
     * one or until the grace period is up. Then it says which of the two happened.
     */
    let phase: 'looking' | 'shown' | 'settled' = 'looking'

    /** Say it is on the screen, and which of §8.2's marks the page could put on it. */
    const settle = (drawn: DrawnMarkKind, at: Element | null) => {
      phase = 'settled'
      // THE FLASH IS ALL A LEAD DRAWS. It is already on the thing, and ending the ask here puts out
      // anything `showThePlace` lit on the way, the highlighted words included.
      if (want.lead) {
        stopShowing()
        return
      }
      light({ key: want.key, place: want.place, drawn, at })
      announceShowing({
        state: 'found',
        key: want.key,
        annotationId: want.annotationId,
        words: drawn === 'words',
        drawn,
        place: want.place,
      })
    }

    /** True once the page has finished drawing the address it is at, or always for a comment. */
    const drawnHere = () => !want.lead || document.documentElement.getAttribute(READY_ATTRIBUTE) === window.location.hash

    const look = () => {
      if (phase === 'settled' || !drawnHere()) return
      const holders = holdersDrawnIn(want.key, want.context.drawnIn)
      if (holders.length === 0) return

      // NOTHING WAS RECORDED ABOUT WHERE, so nothing is drawn about where. A frame here would say
      // `whole thing` — no place finer than the thing was recorded — about a comment Mole Office has
      // simply never been taught to place, and those are the two answers invariant 5 keeps apart.
      // The thing is still scrolled to, and the pane says which case it is.
      if (want.place === null) {
        holders[0]?.scrollIntoView({ block: 'start', behavior: behaviorForJump() })
        if (holders[0] instanceof HTMLElement) washJumpTarget(holders[0])
        settle('none', null)
        return
      }

      for (const holder of holders) {
        const put = showThePlace(holder, want.place)
        if (put === null) continue
        // THE RUN, NOT THE HOLDER, wherever there is a run: the holder is often the whole record
        // page. A frame is the thing itself, and a thing taller than the window has no middle to
        // put on screen, so it is scrolled to from the top.
        put.at.scrollIntoView({ block: put.drawn === 'frame' ? 'start' : 'center', behavior: behaviorForJump() })
        if (put.at instanceof HTMLElement) washJumpTarget(put.at)
        settle(put.drawn, put.at)
        return
      }

      // THE FIRST ELEMENT CARRYING THE KEY IS NOT USUALLY THE ONE THAT DRAWS THE WORDS, so this is
      // not settling: a person pressed something and must see it move, and the walk goes on hoping
      // for a drawing that can carry the place. Nothing is announced, so the pane still says it is
      // looking rather than claiming a mark it has not managed to draw.
      if (phase === 'looking') {
        phase = 'shown'
        holders[0]?.scrollIntoView({ block: 'start', behavior: behaviorForJump() })
      }
    }

    look()
    const watching = new MutationObserver(look)
    watching.observe(document.body, { childList: true, subtree: true, characterData: true })
    // THE PAGE SAYS IT HAS FINISHED ON THE ROOT, AFTER IT HAS STOPPED CHANGING, so a lead also listens
    // there. The watcher above has heard the last change by then.
    if (want.lead) watching.observe(document.documentElement, { attributes: true, attributeFilter: [READY_ATTRIBUTE] })
    // THE WORDS NEVER APPEARED. The frame says the thing and nothing claims the words — the same
    // honest end the composer's own mark takes. It is a clock and not a document change because a
    // page that has finished building sends no more changes, and a walk that only ever ran on one
    // would hope for ever with nothing on the screen.
    const stopHoping = window.setTimeout(() => {
      if (phase !== 'shown') return
      const holder = holdersDrawnIn(want.key, want.context.drawnIn)[0] ?? null
      // A LEAD STILL FLASHES THE THING, since the frame it would otherwise get is not drawn for a lead.
      if (want.lead && holder instanceof HTMLElement) washJumpTarget(holder)
      settle('frame', holder)
    }, STILL_HOPING_MS)
    // THE DEADLINE IS WHAT MAKES "IT IS NOT ON THIS PAGE" SAYABLE. Without it a press that found
    // nothing would look exactly like a press that had not happened.
    //
    // AND IT IS NOT THE ONLY THING THE DEADLINE CAN MEAN. A part of a report that THIS reading
    // length draws inside something larger is on the page, in a way a reader can see, and nothing
    // on the page carries its key. Saying "not on that page" about it is false, so the page is
    // asked which of the five it is before those three words are used.
    const gaveUp = window.setTimeout(() => {
      if (phase !== 'looking') return
      phase = 'settled'
      const instead = whereItIsInstead(want.context)
      if (instead === null) {
        if (want.lead) stopShowing()
        else announceShowing({ state: 'notHere', key: want.key, annotationId: want.annotationId })
        return
      }
      // THE FRAME GOES ON THE THING THAT HOLDS IT, and the sentence says it is not the thing itself.
      // A frame with no sentence would be this layer claiming the comment is about what it is drawn
      // round, which is the first of the two false answers `howItDrawsHere` exists to replace.
      if (instead.at !== null && instead.key !== null) {
        instead.at.scrollIntoView({ block: 'start', behavior: behaviorForJump() })
        if (instead.at instanceof HTMLElement) washJumpTarget(instead.at)
        if (!want.lead) light({ key: instead.key, place: null, drawn: 'frame', at: instead.at })
      }
      if (want.lead) {
        stopShowing()
        return
      }
      announceShowing({
        state: 'notDrawnAsItself',
        key: want.key,
        annotationId: want.annotationId,
        drawing: instead.how.drawing,
        says: instead.how.says,
        marked: instead.at !== null,
      })
    }, WAIT_FOR_MS)
    return () => {
      watching.disconnect()
      window.clearTimeout(stopHoping)
      window.clearTimeout(gaveUp)
    }
  }, [want])

  /**
   * ESCAPE PUTS THE MARK OUT, because something has to and it is no longer a timer.
   *
   * Contract §6.16: *`Esc` clears the lighting and the current row*. It is bound only while Mole Office
   * is showing somebody a comment, so nothing here listens to the whole document at rest, and it
   * does not consume the key: a composer or a confirm open at the same time still hears it.
   *
   * `stopShowing` and not `light(null)`: the ask and the drawing are one fact, and clearing the
   * drawing while the pane still believed it was showing something is the two-values defect this
   * file's own history is about.
   */
  useEffect(() => {
    if (want === null || typeof document === 'undefined') return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stopShowing()
    }
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('keydown', key)
    }
  }, [want])

  /**
   * A layer that goes takes both of its marks with it, however it went.
   *
   * THE CLOCK IS NOT IN HERE ANY MORE. Putting the light out used to be an effect keyed on the lit
   * value, and that effect's own cleanup ran whenever the value changed — which is exactly when the
   * words are lit a moment after the thing was found, so the second lighting was deleted by the
   * first one's cleanup and every press answered "no highlight". Measured in Chromium on 19 August
   * 2026. There is no clock at all now: `light` owns the value and the paint, and three gestures own
   * when they end.
   */
  useEffect(
    () => () => {
      light(null)
      clearSubject()
    },
    [],
  )

  return (
    <>
      <style href="mole-office-agent" precedence="default">
        {AGENT_CSS}
      </style>
      {/* BUILT FROM WHAT THE SERVER SENT, so it changes when the answer does. It carries no href:
          React de-duplicates a style element by href, and this one's content is the answer. */}
      <style>{showingRule(shown) + SUBJECT_CSS}</style>
      {/* THE COUNT OF COMMENTS ON EACH BLOCK, drawn beside the block and never inside its words.
          This used to be part of the stylesheet above, as generated content on the block itself.
          See `circlesToDraw` and components/agent/CommentCircle.tsx. */}
      <CommentCircles circles={circles} read={marks.state === 'read'} showMe={showMeThat} />
      <SourceMark />
    </>
  )
}
