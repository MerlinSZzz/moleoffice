// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STATE IS A TYPE: A WORD, A MARK, AND A SENTENCE ON DEMAND.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office has to say a lot of awkward things. Nothing is there. Nobody looked. This was refused.
 * The words you commented on are not in the record any more. Its own invariants require every one
 * of those to be SAID rather than smoothed over, and the product is better for it.
 *
 * The trouble is how they get said. Three components in the whole browser tree carry an honest
 * state in the right shape — a short word on screen and the full sentence available on demand.
 * `Absence` is one, and it has 90 call sites. Against those 90 there are, measured on 19 August
 * 2026, 759 places under `src/web` that print an English sentence instead, in 68 of 86 files.
 *
 * That is not 68 separate lapses of judgement. There was no shared type saying what a state IS, so
 * every component that met a new honest state reached for the one tool always to hand — a
 * paragraph. One missing declaration, 68 times.
 *
 * Its mirror is just as bad: 17 states in the product are told apart only by which of two nearly
 * identical sentences prints. A reader cannot tell those apart at a glance, and a screenshot of one
 * cannot be told from a screenshot of the other.
 *
 * This file is the missing declaration. `DrawnState` is the shape — a word, a mark, and a
 * sentence. The tables below are the interaction contract's section 8 vocabulary as data, one
 * table per family, so a component picks a state out of a table instead of writing one.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT "WITH HUE REMOVED" MEANS HERE, AND WHY THE MARK IS STRUCTURED
 * ---------------------------------------------------------------------------------------
 *
 * The owner's rule is that no semantic state may be carried by colour alone. A table that cannot
 * say what a state looks like in grey has not answered that rule; it has only repeated it. So
 * `StateMark` holds four channels and not one of them is a colour: the form, the glyph, the edge
 * and where it is drawn. Colour is not in this file at all, and cannot be.
 *
 * That makes the rule checkable rather than merely stated. Two states that differ only by hue are
 * two entries with the same word and the same four channels, and
 * `tests/a-state-is-a-type.test.ts` fails on them. The contract's own hardest pair is the proof:
 * `words only` and `whole thing` are both a dashed frame on the target, so one of them carries a
 * doubled quote glyph, and the test would go red the day somebody took it away.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE DOES NOT DO
 * ---------------------------------------------------------------------------------------
 *
 * NOTHING IS WIRED TO IT YET. Stage 2 of the round-nine plan compiles, emits nothing and writes
 * nothing. No screen changes because this file landed. The steps that rebuild each surface adopt
 * their own family, and each one deletes its own sentences as it goes.
 *
 * It holds no colour, no CSS and no React. It is in `src/shared` and not in `src/web` because the
 * server composes a scoped agent context out of the same words.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE WORDS COME FROM
 * ---------------------------------------------------------------------------------------
 *
 * `design/ROUND-NINE-INTERACTION-CONTRACT.md` section 8, table by table. Each entry names the
 * subsection it was transcribed from, so any entry can be checked against the contract by a
 * person reading one line. Where a family already has a declaration elsewhere in the codebase —
 * the reading union, the five members of `Place`, the nine intent words, the six detail rungs —
 * this file keys its table off that declaration rather than restating it, so the two cannot drift.
 */
import { COMMUNICATION_INTENTS } from './intent.ts'
import { RUNG_SPECS, RUNGS, type Rung } from './detail.ts'
import type { ContextReadingState, PlaceAt } from './targets.ts'
// THE ONE TABLE OF READINGS. `deliveryWordOf` below draws six stored words and reads every one of
// them through `stateWord` rather than writing a seventh copy of the table here — see its header.
import { stateWord } from './words.ts'

// ============================================================================ the type

/**
 * The shape of the mark, with hue removed. Four channels, no colour among them.
 *
 * `form` is the drawing as a whole: what encloses the state, or carries it, or that there is no
 * drawing at all.
 */
export type MarkForm =
  /** Nothing is drawn. The ordinary row, with no mark on it. */
  | 'none'
  /** Bare text with no enclosure at all. */
  | 'text'
  /** A chip with a drawn edge around the word. */
  | 'outline'
  /** An enclosure with a family rail and a family glyph. The artifact chips. */
  | 'pill'
  /** A filled block behind the word. */
  | 'block'
  /** A background laid over the words themselves, on the page. */
  | 'wash'
  /** An edge drawn around the target, not around a word. */
  | 'frame'
  /** A bar in the margin, drawn so nothing reflows. */
  | 'rail'
  /** Generated content on the object: not hit-testable, not focusable, no role. */
  | 'generated'
  /** A real control somebody can press. */
  | 'control'
  /** A strip of its own, above the thing it is about. */
  | 'row'
  /** A heading. */
  | 'heading'
  /** A numeral on a scale. */
  | 'numeral'

/** The glyph beside the word, described by its treatment rather than by its picture. */
export type MarkGlyph =
  | 'none'
  | 'filled'
  | 'hollow'
  | 'broken'
  | 'struck'
  | 'barred'
  /** The same glyph twice. The second channel that tells `words only` from `whole thing`. */
  | 'doubled'
  /** Whichever glyph the record's family has. */
  | 'family'
  | 'dot'
  | 'ring'
  | 'disc'

/** The edge of whatever encloses the state. */
export type MarkEdge = 'none' | 'solid' | 'dashed' | 'hairline' | 'underline'

/** Where it is drawn, for the states that are told apart by position. */
export type MarkPlace =
  | 'inline'
  | 'leftMargin'
  | 'leadingEdge'
  | 'trailingEdge'
  | 'above'
  | 'overTheWords'
  | 'onTheTarget'
  | 'left'
  | 'right'

/** What a state looks like once the colour is gone. */
export interface StateMark {
  form: MarkForm
  glyph: MarkGlyph
  edge: MarkEdge
  where: MarkPlace
}

/**
 * A STATE THE INTERFACE MAY DRAW.
 *
 * Three parts and all three are required, because leaving one out is how the two failures above
 * happen. No word and the state is colour or shape alone. No mark and two states look identical.
 * No sentence and the component writes one itself, in place, where a reader cannot escape it.
 */
export interface DrawnState {
  /**
   * The word on screen. Short: one or two words, sentence case.
   *
   * `null` means nothing is drawn at all, which is a real answer for the ordinary case and is
   * written down rather than left as an empty string.
   *
   * A `{name}` in the word is filled from the state's own numbers by `fillWord`.
   */
  word: string | null
  /** What it looks like with hue removed. */
  mark: StateMark
  /**
   * The whole sentence, for a `title`, an off-screen span or a fold. NEVER drawn beside the word.
   *
   * Contract section 8.10 allows a sentence in exactly those three channels, which is what makes
   * a word on screen honest rather than terse: the reader who needs the sentence can get it.
   */
  detail: string
}

/** One row of the vocabulary: a drawn state, plus where it came from and what it stands for. */
export interface VocabularyEntry extends DrawnState {
  /** The subsection of the interaction contract this was transcribed from, e.g. `8.2`. */
  section: string
  /**
   * The stored value this is the drawn label for, or `null` when it labels nothing stored.
   *
   * This is what stops a drawn word and a stored word drifting apart, and it is what the
   * collision check reads: a word may be a stored word's label, and it may be one thing on
   * screen, and it may not quietly be both.
   */
  labels: string | null
}

/** A family of states: one table, keyed by the engineering name of each state. */
export type Family = Readonly<Record<string, VocabularyEntry>>

// ============================================================================ filling a word

/**
 * Every `{name}` in a word or a sentence.
 *
 * IT WAS CALLED `placeholdersIn` UNTIL ROUND TEN WAVE 8, AND THE WORD NOW MEANS SOMETHING ELSE. A
 * `placeholder` is a record kind: a slot in the WORK that somebody deliberately left unresolved,
 * and what that stops the project claiming. This function is about `{count}` in a string. Somebody
 * grepping for the feature would have found ninety-odd `placeholder=` attributes on input boxes
 * and this one function about text substitution before finding any of it, and the one that reads
 * like the feature is this one. So it is `slotsIn`, which is what it does.
 *
 * THE RULE THAT COMES WITH THE RENAME, for anybody writing code after it: no new code names input
 * hint text a placeholder. The HTML attribute keeps its name because that is HTML's; a variable, a
 * comment or a function of ours that calls hint text a placeholder is a defect.
 */
export function slotsIn(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].flatMap((found) => (found[1] === undefined ? [] : [found[1]]))
}

/**
 * Fill the numbers into a word or a sentence.
 *
 * IT REFUSES RATHER THAN GUESSES. A missing value throws, and so does a value nobody asked for.
 * A word reading `2 blocks` with the 2 missing would read ` blocks`, which is a sentence about
 * nothing presented as a fact — the substitution this repository's second invariant forbids.
 */
export function fillWord(text: string, values: Readonly<Record<string, string | number>>): string {
  const wanted = slotsIn(text)
  for (const name of wanted) {
    if (!(name in values)) throw new Error(`fillWord: "${text}" needs {${name}} and it was not given`)
  }
  for (const name of Object.keys(values)) {
    if (!wanted.includes(name)) throw new Error(`fillWord: "${text}" has no {${name}} to fill`)
  }
  return text.replace(/\{(\w+)\}/g, (_whole, name: string) => String(values[name]))
}

/** The four channels as one string, which is what "the same with the colour gone" compares. */
export function withoutHue(mark: StateMark): string {
  return `${mark.form}/${mark.glyph}/${mark.edge}/${mark.where}`
}

/** A state and every other state, compared on every channel that is not colour. */
export function tellsApart(one: DrawnState, other: DrawnState): boolean {
  return one.word !== other.word || withoutHue(one.mark) !== withoutHue(other.mark)
}

// ============================================================================ 8.1 how a context reads

/** Written once and used by both the pane and the composer, so the two cannot say different things. */
const CHANGED = 'The words moved, doubled or left the field.'
const WORDS_GONE = 'The stored quote is not in the current revision.'

/**
 * HOW A CONTEXT READS. Contract 8.1, over the reading union in `./targets.ts`.
 *
 * SIX WORDS OVER FIVE STORED VALUES, and that is the contract's own arithmetic rather than a
 * mistake here. `CONTEXT_READINGS` has five members; section 8.1 draws six words, because it
 * splits `changed` into "the words moved" and "the stored quote is not there any more". The sixth
 * word, `Words gone`, is written down below with `labels: null` — no stored value produces it —
 * and `READING_STATE_OF` maps the five that do. `tests/a-state-is-a-type.test.ts` names it, so it
 * is a recorded gap and not a silent one. Closing it means adding a member to the union, which
 * belongs to the step that owns `targets.ts`.
 */
export const READING_STATES = {
  there: {
    word: null,
    mark: { form: 'none', glyph: 'none', edge: 'none', where: 'inline' },
    detail: 'The thing is there and the place holds.',
    section: '8.1',
    labels: 'there',
  },
  changed: {
    word: 'Changed',
    mark: { form: 'outline', glyph: 'filled', edge: 'solid', where: 'inline' },
    detail: CHANGED,
    section: '8.1',
    labels: 'changed',
  },
  wordsGone: {
    word: 'Words gone',
    mark: { form: 'outline', glyph: 'broken', edge: 'solid', where: 'inline' },
    detail: WORDS_GONE,
    section: '8.1',
    labels: null,
  },
  gone: {
    word: 'Gone',
    mark: { form: 'text', glyph: 'struck', edge: 'none', where: 'inline' },
    detail: 'The record was deleted, or the surface id is not in the registry.',
    section: '8.1',
    labels: 'gone',
  },
  notOnScreen: {
    word: 'Not on screen',
    mark: { form: 'outline', glyph: 'none', edge: 'dashed', where: 'inline' },
    detail: 'The id is valid and nothing on this screen carries it.',
    section: '8.1',
    labels: 'notDrawn',
  },
  notKnown: {
    word: 'Not known',
    mark: { form: 'outline', glyph: 'hollow', edge: 'dashed', where: 'inline' },
    detail: 'Mole Office has not been taught to look.',
    section: '8.1',
    labels: 'unknown',
  },
} as const satisfies Family

export type ReadingStateName = keyof typeof READING_STATES

/**
 * Which entry each stored reading draws.
 *
 * A total map over the union, so a sixth reading does not compile until somebody says what it
 * looks like.
 */
export const READING_STATE_OF: Readonly<Record<ContextReadingState, ReadingStateName>> = {
  there: 'there',
  changed: 'changed',
  gone: 'gone',
  unknown: 'notKnown',
  notDrawn: 'notOnScreen',
}

// ============================================================================ 8.2 where a comment was made

/**
 * WHERE A COMMENT WAS MADE. Contract 8.2, keyed by the five members of `Place`.
 *
 * THE PAIR THIS TABLE EXISTS FOR is `quote` and `surface`. Both are a dashed frame on the target.
 * One means "your words were kept and Mole Office could not place them"; the other means "no place
 * finer than the thing was recorded". That is invariant five — nothing is there against nobody
 * looked — and the frame alone cannot carry it. The doubled quote glyph is the second channel,
 * and the test asserts the two differ somewhere other than in colour.
 */
export const PLACE_STATES: Readonly<Record<PlaceAt, VocabularyEntry>> = {
  words: {
    word: null,
    mark: { form: 'wash', glyph: 'none', edge: 'underline', where: 'overTheWords' },
    detail: 'The comment is about these exact characters.',
    section: '8.2',
    labels: 'words',
  },
  across: {
    word: '{parts} {partWord}',
    mark: { form: 'wash', glyph: 'none', edge: 'dashed', where: 'overTheWords' },
    detail: 'The words are the place, and the subject is bigger than they are.',
    section: '8.2',
    labels: 'across',
  },
  quote: {
    word: 'words only',
    mark: { form: 'frame', glyph: 'doubled', edge: 'dashed', where: 'onTheTarget' },
    detail: 'The words were kept. Mole Office cannot say where they are.',
    section: '8.2',
    labels: 'quote',
  },
  run: {
    word: 'this line',
    mark: { form: 'rail', glyph: 'none', edge: 'none', where: 'leftMargin' },
    detail: 'A place with no words. The comment is about this line.',
    section: '8.2',
    labels: 'run',
  },
  surface: {
    word: 'whole thing',
    mark: { form: 'frame', glyph: 'none', edge: 'dashed', where: 'onTheTarget' },
    detail: 'No place finer than the thing was recorded.',
    section: '8.2',
    labels: 'surface',
  },
}

// ============================================================================ 8.3 counts and standing marks

/**
 * COUNTS AND STANDING MARKS. Contract 8.3.
 *
 * THREE OF THESE FOUR ARE DRAWN AND NEVER PRESSED. They are a strip of text: not hit-testable, not
 * focusable, no role, no keyboard route. Three separate cluster designs made the counts controls —
 * press the count to open the filtered pane, press `Changed` for history, a Settings option resting
 * on revealing marks by pressing — and all three were withdrawn.
 *
 * `moreText` was the one exception, because it is a control that reveals text rather than a mark
 * about a state.
 *
 * `comments` JOINED IT ON 4 SEPTEMBER 2026, AND THAT CHANGE WAS ASKED FOR. There used
 * to be two entries here, `comments` (`❝ {n}`) and `drafts` (`✎ {n}`), both drawn as generated
 * content at the leading edge — which put the number inside the words of the block it counted. The
 * whole account is in §8.3 of design/ROUND-NINE-INTERACTION-CONTRACT.md and in
 * problem `muxtJ4V4HfUj`. The two are one circle now, beside the block, carrying both counts as one
 * number, and it is pressed to open what it counts.
 */
export const STANDING_STATES = {
  comments: {
    word: '{n}',
    mark: { form: 'control', glyph: 'none', edge: 'solid', where: 'right' },
    detail: '{n} comments here.',
    section: '8.3',
    labels: null,
  },
  moreText: {
    word: '»',
    mark: { form: 'control', glyph: 'none', edge: 'none', where: 'trailingEdge' },
    detail: 'There is more text. Press to see it.',
    section: '8.3',
    labels: null,
  },
  offScreen: {
    word: '⇥ Off screen',
    mark: { form: 'row', glyph: 'none', edge: 'none', where: 'above' },
    detail: 'There is content outside this box. The parts are named beside it.',
    section: '8.3',
    labels: null,
  },
  leftOut: {
    word: 'Left out',
    mark: { form: 'row', glyph: 'none', edge: 'none', where: 'above' },
    detail: 'The renderer did not draw these columns. Show all is beside it.',
    section: '8.3',
    labels: null,
  },
  allShown: {
    word: 'All shown',
    mark: { form: 'row', glyph: 'none', edge: 'none', where: 'above' },
    detail: 'Drawn only after somebody pressed Show all.',
    section: '8.3',
    labels: null,
  },
} as const satisfies Family

/**
 * The standing marks a person may not press, and there are three of them.
 *
 * `comments` was the fourth until 4 September 2026 and the entry above says why it left.
 */
export const NEVER_PRESSED: readonly (keyof typeof STANDING_STATES)[] = ['offScreen', 'leftOut', 'allShown']

// ============================================================================ 8.4 the composer's marks

/**
 * THE COMPOSER'S MARKS. Contract 8.4, and the three revision marks of 6.29.
 *
 * `changed` and `wordsGone` are the SAME entries the pane draws, referenced rather than copied.
 * The contract writes them twice, in 8.1 and in 8.4; writing them twice here would be the defect
 * this repository names most often — one fact worked out in two places, free to drift.
 */
export const COMPOSER_STATES = {
  wholeBlock: {
    word: 'Whole block',
    mark: { form: 'outline', glyph: 'hollow', edge: 'solid', where: 'inline' },
    detail: 'The selection ran across more than one stored string.',
    section: '8.4',
    labels: null,
  },
  wholeInstruction: {
    word: 'Whole instruction',
    mark: { form: 'outline', glyph: 'hollow', edge: 'solid', where: 'inline' },
    detail: 'A phrase was selected in the draft and the right-click landed outside it.',
    section: '8.4',
    labels: null,
  },
  changed: READING_STATES.changed,
  wordsGone: READING_STATES.wordsGone,
  deleted: {
    word: 'Deleted',
    mark: { form: 'outline', glyph: 'barred', edge: 'solid', where: 'inline' },
    detail: 'The record this comment is about was deleted.',
    section: '8.4',
    labels: null,
  },
  notOnThisPage: {
    word: 'Not on this page',
    mark: { form: 'outline', glyph: 'none', edge: 'dashed', where: 'inline' },
    // IT FOLLOWS THE THING AND NOT THE ADDRESS, and this sentence used to say the opposite: *The
    // route changed while the frame stayed open.* A row of the rail is on every page, so a reader
    // who changes page with the composer open on one has left nothing behind, and the word would
    // then be false beside a mark still framing the row.
    detail: 'The thing this box is about is not drawn on the page the reader is on.',
    section: '8.4',
    labels: null,
  },
  outside: {
    word: 'Outside',
    mark: { form: 'outline', glyph: 'none', edge: 'dashed', where: 'inline' },
    detail:
      'A review is collecting and it does not reach this target. What is written here is kept and stays yours, ' +
      'and it does not join that review.',
    section: '8.4',
    labels: null,
  },
  inThisReview: {
    word: 'In this review',
    mark: { form: 'block', glyph: 'filled', edge: 'none', where: 'inline' },
    detail:
      'Nothing has been sent and no recipient had to be named. The comment is in the review that is collecting, ' +
      'and you choose each comment\'s recipient when you finish it.',
    section: '8.4',
    labels: null,
  },
  recordUnchanged: {
    word: 'Record unchanged',
    mark: { form: 'outline', glyph: 'hollow', edge: 'solid', where: 'inline' },
    detail: "The message went and the record's state did not move.",
    section: '8.4',
    labels: null,
  },
  changedSinceDrawn: {
    word: 'Changed since drawn',
    mark: { form: 'outline', glyph: 'filled', edge: 'solid', where: 'inline' },
    detail:
      'This has changed since the page was drawn, so what you are reading is not what is stored. Reload the page ' +
      'to comment on what is there now.',
    section: '8.4',
    labels: null,
  },
  notMade: {
    word: 'Not made',
    mark: { form: 'outline', glyph: 'hollow', edge: 'dashed', where: 'inline' },
    detail:
      'This change has not been made, so it will not go with the instruction. Point at the same words again to ' +
      'finish it.',
    section: '8.4',
    labels: null,
  },
  keptNotSent: {
    word: 'Kept, not sent',
    mark: { form: 'outline', glyph: 'hollow', edge: 'solid', where: 'inline' },
    // IT USED TO END "and a review can send it later", and that was false whenever no review was
    // collecting here. A review takes only what is written from the second it starts (`membersOf` in
    // src/server/lib/reviews.ts, and contract §6.15, where `Earlier` is a reason a comment is not in
    // one). So a review started afterwards listed the comment as `Earlier` and never sent it (problem
    // 342gEXEpJ20R). Whether a review should take earlier comments is open (contract §13.4).
    //
    // PROBLEM H031xonpPSqa ANSWERED IT FOR THE COMMENTS SAVED HERE: once a review was summoned, its right-hand
    // bar could not find these comments, so they could not be sent together. A review still does not take them
    // as members. It lists the ones its starter
    // saved on what it reviews under `Saved, not sent`, and its send carries them (`savedNotSent` in
    // src/server/lib/reviews.ts). A review that finished collecting with this comment already in it keeps it, and a
    // later review leaves it to that one, which is why the sentence says "unless".
    detail:
      'Nothing has been sent and nobody had to be named. It is kept with your reports and notes. A review you start ' +
      'afterwards on what it is about lists it under Saved, not sent, unless another review already holds it, and ' +
      'sending that review sends it once somebody is chosen for it.',
    section: '8.4',
    labels: null,
  },
  wordsCameBack: {
    word: 'Words came back',
    mark: { form: 'outline', glyph: 'none', edge: 'dashed', where: 'inline' },
    detail: 'A kept draft was restored into the box.',
    section: '8.4',
    labels: null,
  },
  startedOn: {
    word: 'Started on {words}',
    mark: { form: 'outline', glyph: 'hollow', edge: 'dashed', where: 'inline' },
    detail: 'The kept draft was begun about different words.',
    section: '8.4',
    labels: null,
  },
  gaps: {
    word: '{n} gaps',
    mark: { form: 'outline', glyph: 'hollow', edge: 'solid', where: 'inline' },
    detail: 'The reading left part of the original uncovered.',
    section: '8.4',
    labels: null,
  },
} as const satisfies Family

// ============================================================================ 8.5 review

/** Said once. Both the group heading and the composer's mark are about the same membership. */
const IN_THIS_REVIEW = COMPOSER_STATES.inThisReview.detail
const ALREADY_SENT = 'This has already been sent.'

/**
 * REVIEW. Contract 8.5.
 *
 * `Review` has ONE meaning on screen and this is it: the collection. The intent a person picks is
 * drawn `Find problems`, never `Review`, which is what keeps that true — and the collision check
 * in the test reads the intent table below to prove it, rather than taking the contract's word.
 */
export const REVIEW_STATES = {
  review: {
    word: 'Review',
    mark: { form: 'text', glyph: 'none', edge: 'none', where: 'inline' },
    detail: 'A review collects comments on several things and sends none of them.',
    section: '8.5',
    labels: null,
  },
  collecting: {
    word: 'Collecting',
    mark: { form: 'text', glyph: 'none', edge: 'none', where: 'inline' },
    detail: 'This review is on. Comments written where it reaches join it.',
    section: '8.5',
    labels: 'collecting',
  },
  check: {
    word: 'Check',
    mark: { form: 'text', glyph: 'none', edge: 'none', where: 'inline' },
    detail: 'Read what is in the review before any of it goes.',
    section: '8.5',
    labels: 'check',
  },
  inThisReview: {
    word: 'In this review',
    mark: { form: 'heading', glyph: 'none', edge: 'hairline', where: 'left' },
    detail: IN_THIS_REVIEW,
    section: '8.5',
    labels: null,
  },
  notInIt: {
    word: 'Not in it',
    mark: { form: 'heading', glyph: 'none', edge: 'dashed', where: 'left' },
    detail: 'These comments are not in the review that is collecting.',
    section: '8.5',
    labels: null,
  },
  earlier: {
    word: 'Earlier',
    mark: { form: 'text', glyph: 'none', edge: 'none', where: 'right' },
    detail: 'Written before this review started collecting.',
    section: '8.5',
    labels: null,
  },
  later: {
    word: 'Later',
    mark: { form: 'text', glyph: 'none', edge: 'none', where: 'right' },
    detail: 'Written after this review finished collecting.',
    section: '8.5',
    labels: null,
  },
  elsewhere: {
    word: 'Elsewhere',
    mark: { form: 'text', glyph: 'none', edge: 'none', where: 'right' },
    detail: 'Written about something this review does not reach.',
    section: '8.5',
    labels: null,
  },
  otherAuthor: {
    word: 'Other author',
    mark: { form: 'text', glyph: 'none', edge: 'none', where: 'right' },
    detail: 'Another writer wrote it.',
    section: '8.5',
    labels: null,
  },
  sent: {
    word: 'Sent',
    mark: { form: 'text', glyph: 'none', edge: 'none', where: 'right' },
    detail: ALREADY_SENT,
    section: '8.5',
    labels: null,
  },
  inAnotherReview: {
    word: 'In another review',
    mark: { form: 'text', glyph: 'none', edge: 'none', where: 'right' },
    detail: 'Another review already collected it.',
    section: '8.5',
    labels: null,
  },
  whyNotKnown: {
    word: 'Not known',
    mark: { form: 'text', glyph: 'none', edge: 'none', where: 'right' },
    detail: 'No reason is recorded for leaving this comment out of the review.',
    section: '8.5',
    labels: null,
  },
  added: {
    word: 'Added',
    mark: { form: 'outline', glyph: 'hollow', edge: 'solid', where: 'right' },
    detail: 'It was included by hand, not worked out from where it was written.',
    section: '8.5',
    labels: null,
  },
  note: {
    word: 'Note',
    mark: { form: 'control', glyph: 'none', edge: 'solid', where: 'inline' },
    detail: 'Write a comment into this review.',
    section: '8.5',
    labels: null,
  },
  chooseAgentFor: {
    word: 'Choose agent · {n}',
    mark: { form: 'control', glyph: 'none', edge: 'solid', where: 'inline' },
    detail: '{n} comments in this review have no recipient, so nothing can be sent yet.',
    section: '8.5',
    labels: null,
  },
  finishCollecting: {
    word: 'Finish collecting',
    mark: { form: 'control', glyph: 'none', edge: 'solid', where: 'inline' },
    detail: 'Write down what is in this review. Nothing is sent, and it cannot be undone.',
    section: '8.5',
    labels: null,
  },
  abandon: {
    word: 'Abandon',
    mark: { form: 'control', glyph: 'none', edge: 'solid', where: 'inline' },
    detail: 'End this review. Nothing more will be sent from it.',
    section: '8.5',
    labels: 'abandoned',
  },
  cancel: {
    word: 'Cancel',
    mark: { form: 'control', glyph: 'none', edge: 'none', where: 'inline' },
    detail: 'Leave the confirm without doing it.',
    section: '8.5',
    labels: null,
  },
  thenNow: {
    word: 'Then / Now',
    mark: { form: 'row', glyph: 'none', edge: 'hairline', where: 'above' },
    detail: 'What this comment was about then, and what is there now.',
    section: '8.5',
    labels: null,
  },
} as const satisfies Family

// ============================================================================ 8.6 organise and governance

/**
 * ORGANISE AND GOVERNANCE. Contract 8.6, without the artifact chips and the intent words, which
 * have tables of their own below because each of those is keyed off a declaration that exists.
 */
export const ORGANISE_STATES = {
  organise: {
    word: 'Organise',
    mark: { form: 'control', glyph: 'none', edge: 'solid', where: 'inline' },
    detail: 'Group the comments in this review into pieces.',
    section: '8.6',
    labels: null,
  },
  organised: {
    word: 'Organised',
    mark: { form: 'heading', glyph: 'none', edge: 'none', where: 'right' },
    detail: 'What something else made of your comments.',
    section: '8.6',
    labels: null,
  },
  yours: {
    word: 'Yours',
    mark: { form: 'heading', glyph: 'none', edge: 'none', where: 'left' },
    detail: 'Your own words, as you wrote them.',
    section: '8.6',
    labels: null,
  },
  notRead: {
    word: 'Not read',
    mark: { form: 'outline', glyph: 'hollow', edge: 'dashed', where: 'inline' },
    detail: 'Nothing has read these comments yet.',
    section: '8.6',
    labels: 'not_read',
  },
  waiting: {
    word: 'Waiting',
    mark: { form: 'outline', glyph: 'hollow', edge: 'solid', where: 'inline' },
    detail: 'Something has been asked and has not answered yet.',
    section: '8.6',
    labels: 'waiting',
  },
  read: {
    word: 'Read',
    mark: { form: 'outline', glyph: 'filled', edge: 'solid', where: 'inline' },
    detail: 'Something has read these comments and Mole Office kept what it said.',
    section: '8.6',
    labels: 'read',
  },
  outOfDate: {
    word: 'Out of date',
    mark: { form: 'outline', glyph: 'broken', edge: 'solid', where: 'inline' },
    detail: 'The comments changed after they were read.',
    section: '8.6',
    labels: 'out_of_date',
  },
  haveItRead: {
    word: 'Have it read',
    mark: { form: 'control', glyph: 'none', edge: 'solid', where: 'inline' },
    detail: 'Ask something to read these comments and group them.',
    section: '8.6',
    labels: null,
  },
  organiseByHand: {
    word: 'Organise by hand',
    mark: { form: 'control', glyph: 'none', edge: 'solid', where: 'inline' },
    detail: 'Group them yourself, with nothing running.',
    section: '8.6',
    labels: null,
  },
  split: {
    word: 'Split',
    mark: { form: 'control', glyph: 'none', edge: 'solid', where: 'inline' },
    detail: 'Break this piece into two.',
    section: '8.6',
    labels: null,
  },
  addPiece: {
    word: '+ Add',
    mark: { form: 'control', glyph: 'none', edge: 'solid', where: 'inline' },
    detail: 'Add a piece of your own.',
    section: '8.6',
    labels: null,
  },
  readAgain: {
    word: 'Read again',
    mark: { form: 'control', glyph: 'none', edge: 'solid', where: 'inline' },
    detail: 'Ask again. The reading beside your words is written over.',
    section: '8.6',
    labels: null,
  },
  fileAsTask: {
    word: 'File as Task',
    mark: { form: 'control', glyph: 'family', edge: 'solid', where: 'inline' },
    detail: 'Write this piece down as a task.',
    section: '8.6',
    labels: 'task',
  },
  fileAsProblem: {
    word: 'File as Problem',
    mark: { form: 'control', glyph: 'family', edge: 'solid', where: 'inline' },
    detail: 'Write this piece down as a problem.',
    section: '8.6',
    labels: 'problem',
  },
  filed: {
    word: 'Filed · {title}',
    mark: { form: 'text', glyph: 'family', edge: 'none', where: 'inline' },
    detail: 'This piece was written down as a record, and this is its title.',
    section: '8.6',
    labels: null,
  },
  decisionSheet: {
    word: 'Decision',
    mark: { form: 'heading', glyph: 'none', edge: 'none', where: 'inline' },
    detail: 'A decision, recorded by a person and by nobody else.',
    section: '8.6',
    labels: 'decision',
  },
  yourWords: {
    word: 'Your words',
    mark: { form: 'heading', glyph: 'none', edge: 'none', where: 'inline' },
    detail: 'Kept exactly as you typed them.',
    section: '8.6',
    labels: null,
  },
  whatYouAreDeciding: {
    word: 'What you are deciding',
    mark: { form: 'heading', glyph: 'none', edge: 'none', where: 'inline' },
    detail: 'The decision itself, in your words.',
    section: '8.6',
    labels: null,
  },
  why: {
    word: 'Why',
    mark: { form: 'heading', glyph: 'none', edge: 'none', where: 'inline' },
    detail: 'The reason, which is the part somebody later will want.',
    section: '8.6',
    labels: null,
  },
  reopenWhen: {
    word: 'Reopen when',
    mark: { form: 'heading', glyph: 'none', edge: 'none', where: 'inline' },
    detail: 'What would make this worth deciding again.',
    section: '8.6',
    labels: null,
  },
  holdToRecord: {
    word: 'Hold to record',
    mark: { form: 'control', glyph: 'none', edge: 'solid', where: 'inline' },
    detail: 'Hold this down to record the decision.',
    section: '8.6',
    labels: null,
  },
  typeItAgain: {
    word: 'Type it again',
    mark: { form: 'control', glyph: 'none', edge: 'dashed', where: 'inline' },
    detail: 'Type the decision again to record it, if holding is not available to you.',
    section: '8.6',
    labels: null,
  },
  notADecision: {
    word: 'Not a decision',
    mark: { form: 'text', glyph: 'none', edge: 'none', where: 'inline' },
    detail: 'Nothing here will be recorded as a decision.',
    section: '8.6',
    labels: null,
  },
  recordDecision: {
    word: 'Record decision',
    mark: { form: 'control', glyph: 'none', edge: 'solid', where: 'inline' },
    detail: 'Record it.',
    section: '8.6',
    labels: null,
  },
  holding: {
    word: 'Holding',
    mark: { form: 'text', glyph: 'none', edge: 'none', where: 'inline' },
    detail: 'The hold has started and nothing is recorded yet.',
    section: '8.6',
    labels: null,
  },
  recorded: {
    word: 'Recorded',
    mark: { form: 'text', glyph: 'filled', edge: 'none', where: 'inline' },
    detail: 'The decision is recorded.',
    section: '8.6',
    labels: null,
  },
} as const satisfies Family

// ============================================================================ 8.6 the artifact chips

/**
 * THE ARTIFACT CHIPS. Contract 8.6.
 *
 * Nine words, and every one of them is drawn on three channels: a 3px family rail, a family glyph
 * and a sentence-case word. Hue is a fourth channel and is not one of the three. Artifacts sit
 * LEFT and are enclosed; intents sit RIGHT and are bare text. Position and enclosure tell the two
 * families apart before any colour does, which is why `where` and `form` are in the mark.
 */
export const ARTIFACT_STATES = {
  task: artifact('Task', 'Work somebody has to do.'),
  problem: artifact('Problem', 'Something that is wrong.'),
  idea: artifact('Idea', 'Something worth trying, that nobody has committed to.'),
  troubleshooting: artifact('Troubleshooting', 'A fault being chased, with what has been tried.'),
  exploration: artifact('Exploration', 'A line of work being looked into.'),
  finding: artifact('Finding', 'Something that was found out.'),
  note: artifact('Note', 'Something written down that is none of the others.'),
  decision: artifact('Decision', 'A decision, recorded by a person and by nobody else.'),
  nothing: {
    word: 'Nothing',
    mark: { form: 'text', glyph: 'none', edge: 'none', where: 'left' },
    detail: 'Nothing durable should exist because of this.',
    section: '8.6',
    labels: null,
  },
} as const satisfies Family

function artifact(word: string, detail: string): VocabularyEntry {
  return {
    word,
    mark: { form: 'pill', glyph: 'family', edge: 'solid', where: 'left' },
    detail,
    section: '8.6',
    labels: word.toLowerCase(),
  }
}

// ============================================================================ 8.6 the intent words

/** The nine words a reading may say somebody wants, taken from the declaration, not restated. */
export type IntentWord = (typeof COMMUNICATION_INTENTS)[number]['word']

/**
 * WHAT EACH INTENT IS DRAWN AS. Contract 8.6.
 *
 * ONE OF THE NINE IS NOT DRAWN AS ITS STORED WORD. The stored word is `review`, and `Review` on
 * screen means the collection — the strip, the pane header, the sidebar destination and nothing
 * else. So the chip reads `Find problems`. That is not a preference: two things on one screen
 * reading `Review` and meaning different things is the collision this whole table exists to stop,
 * and the test reads this map to prove the string is free rather than trusting the contract's
 * sentence about it.
 *
 * Every intent is bare text on the right, with no enclosure, so a reader tells an intent from an
 * artifact by position and enclosure before any colour.
 */
export const INTENT_STATES: Readonly<Record<IntentWord, VocabularyEntry>> = {
  ask: intent('ask', 'Ask', 'They want an answer to a question.'),
  explain: intent('explain', 'Explain', 'They are telling somebody something and want it understood.'),
  discuss: intent('discuss', 'Discuss', 'They want to talk it over, and no single answer is expected.'),
  review: intent('review', 'Find problems', 'They want somebody to look at something and say what is wrong with it.'),
  investigate: intent('investigate', 'Investigate', 'They want somebody to go and find something out.'),
  change: intent('change', 'Change', 'They want something altered.'),
  start: intent('start', 'Start', 'They want work that is not going on yet to begin.'),
  continue: intent('continue', 'Continue', 'They want work already going on to carry on.'),
  verify: intent('verify', 'Verify', 'They want a claim checked against evidence.'),
}

function intent(stored: IntentWord, word: string, detail: string): VocabularyEntry {
  return {
    word,
    mark: { form: 'text', glyph: 'none', edge: 'none', where: 'right' },
    detail,
    section: '8.6',
    labels: stored,
  }
}

// ============================================================================ 8.7 the composer and the picker

/**
 * THE COMPOSER AND THE PICKER. Contract 8.7.
 *
 * `show` is the word `Show` and NOT the glyph for full screen, because that glyph means full
 * screen everywhere else and this is the composer's one promise that the subject exists outside
 * the chip. `more` is the word `More` and not `Detail`, so the fold says what is behind it in one
 * word and the detail axis keeps having no name on any screen.
 */
export const PICKER_STATES = {
  message: {
    word: 'Message',
    mark: { form: 'text', glyph: 'none', edge: 'none', where: 'inline' },
    detail: 'This frame writes a message, which goes to an agent.',
    section: '8.7',
    labels: 'message',
  },
  noteMode: {
    word: '⌗ Note',
    mark: { form: 'text', glyph: 'hollow', edge: 'none', where: 'inline' },
    detail: 'This frame writes a note, which is kept and sent by nobody.',
    section: '8.7',
    labels: 'note',
  },
  chooseAgent: {
    word: 'Choose agent',
    mark: { form: 'control', glyph: 'none', edge: 'dashed', where: 'inline' },
    detail: 'Nobody has been chosen to receive this yet.',
    section: '8.7',
    labels: null,
  },
  chooseAnAgent: {
    word: 'Choose an agent',
    mark: { form: 'text', glyph: 'none', edge: 'none', where: 'inline' },
    detail: 'Send was pressed and there is no recipient. Focus has moved to the To control.',
    section: '8.7',
    labels: null,
  },
  connected: {
    word: 'Connected · {n}',
    mark: { form: 'heading', glyph: 'none', edge: 'hairline', where: 'inline' },
    detail: '{n} agents connect to what you pointed at.',
    section: '8.7',
    labels: null,
  },
  notConnected: {
    word: 'Not connected · {n}',
    mark: { form: 'heading', glyph: 'none', edge: 'dashed', where: 'inline' },
    detail: '{n} agents were active in this project and nothing connects them to what you pointed at.',
    section: '8.7',
    labels: null,
  },
  notListed: {
    word: '+{n} not listed',
    mark: { form: 'text', glyph: 'none', edge: 'none', where: 'inline' },
    detail: '{n} more agents were active in this project and are not on this list.',
    section: '8.7',
    labels: null,
  },
  needsANewRun: {
    word: 'Needs a new run',
    mark: { form: 'outline', glyph: 'hollow', edge: 'dashed', where: 'inline' },
    detail: 'That agent cannot be picked up where it left off.',
    section: '8.7',
    labels: null,
  },
  couldNotRead: {
    word: 'Could not read',
    mark: { form: 'outline', glyph: 'broken', edge: 'solid', where: 'inline' },
    detail: 'Mole Office could not read who this could go to.',
    section: '8.7',
    labels: null,
  },
  send: {
    word: 'Send',
    mark: { form: 'control', glyph: 'none', edge: 'solid', where: 'inline' },
    detail: 'Send it to the agent it is for.',
    section: '8.7',
    labels: null,
  },
  save: {
    word: 'Save',
    mark: { form: 'control', glyph: 'none', edge: 'solid', where: 'inline' },
    detail: 'Write it down. Nothing is sent.',
    section: '8.7',
    labels: null,
  },
  add: {
    word: 'Add',
    mark: { form: 'control', glyph: 'none', edge: 'solid', where: 'inline' },
    detail: 'Put this comment in the review that is collecting.',
    section: '8.7',
    labels: null,
  },
  keep: {
    word: 'Keep',
    mark: { form: 'control', glyph: 'none', edge: 'solid', where: 'inline' },
    detail: 'Keep the draft where it is. Nothing is sent.',
    section: '8.7',
    labels: null,
  },
  more: {
    word: 'More',
    mark: { form: 'control', glyph: 'none', edge: 'none', where: 'inline' },
    detail: 'Open the fold that says where this goes.',
    section: '8.7',
    labels: null,
  },
  saved: {
    word: 'Saved',
    mark: { form: 'heading', glyph: 'filled', edge: 'none', where: 'inline' },
    detail: 'It was written down.',
    section: '8.7',
    labels: null,
  },
  sent: {
    word: 'Sent',
    mark: { form: 'heading', glyph: 'filled', edge: 'none', where: 'inline' },
    detail: ALREADY_SENT,
    section: '8.7',
    labels: null,
  },
  show: {
    word: 'Show',
    mark: { form: 'control', glyph: 'none', edge: 'none', where: 'inline' },
    detail: 'Scroll the subject into view and pulse it.',
    section: '8.7',
    labels: null,
  },
} as const satisfies Family

// ============================================================================ 8.8 detail

/**
 * THE DETAIL LADDER. Contract 8.8, DERIVED from `./detail.ts` rather than transcribed.
 *
 * The six accessible phrases already exist, once, as `RUNG_SPECS[rung].phrase`, and they are
 * already the only screen text that file holds. Copying them here would be one fact in two places
 * with nothing making them agree — the defect this repository names most often. So this table
 * reads them.
 *
 * The control draws `1 2 3 4 5 Full` and no word on any screen names the axis.
 */
export const DETAIL_STATES: Readonly<Record<Rung, VocabularyEntry>> = Object.fromEntries(
  RUNGS.map((rung): [Rung, VocabularyEntry] => {
    const spec = RUNG_SPECS[rung]
    return [
      rung,
      {
        word: rung === 'full' ? 'Full' : String(spec.position),
        mark: {
          form: rung === 'full' ? 'text' : 'numeral',
          glyph: spec.position <= 2 ? 'dot' : spec.position <= 4 ? 'ring' : 'disc',
          edge: 'none',
          where: 'inline',
        },
        detail: spec.phrase,
        section: '8.8',
        labels: rung,
      },
    ]
  }),
) as Record<Rung, VocabularyEntry>

// ============================================================================ every family

/** The ten tables, by the name the interaction contract gives each family. */
export const VOCABULARY: Readonly<Record<string, Family>> = {
  reading: READING_STATES,
  place: PLACE_STATES,
  standing: STANDING_STATES,
  composer: COMPOSER_STATES,
  review: REVIEW_STATES,
  organise: ORGANISE_STATES,
  artifact: ARTIFACT_STATES,
  intent: INTENT_STATES,
  picker: PICKER_STATES,
  detail: DETAIL_STATES,
}

/** Every entry, with the family it came from and the key it sits under. */
export function everyState(): { family: string; name: string; entry: VocabularyEntry }[] {
  const out: { family: string; name: string; entry: VocabularyEntry }[] = []
  for (const [family, table] of Object.entries(VOCABULARY)) {
    for (const [name, entry] of Object.entries(table)) out.push({ family, name, entry })
  }
  return out
}

/**
 * WORDS THAT HAVE TWO MEANINGS TODAY, EACH WITH THE PLACES THE CONTRACT WRITES IT.
 *
 * A drawn word is supposed to mean one thing. These two do not, and they are written down rather
 * than quietly resolved, because resolving one is a decision about what the product says and that
 * belongs to the person whose product it is. `tests/a-state-is-a-type.test.ts` asserts that this
 * list is EXACTLY the set of words carrying more than one sentence, so a third one fails the build
 * and these two do not.
 *
 * A word used in more than one family is NOT on this list when both uses carry the same sentence.
 * `Changed`, `Words gone`, `In this review`, `Sent` and `Decision` are each drawn in two places and
 * mean one thing in both, which is the whole point of a shared table.
 */
export const KNOWN_COLLISIONS: readonly { word: string; sections: readonly string[]; why: string }[] = [
  {
    word: 'Not known',
    sections: ['8.1', '8.5'],
    why: 'In the pane it means Mole Office has not been taught to look. On an excluded row it means nobody has said why the comment is out. Two absences, one word.',
  },
  {
    word: 'Note',
    sections: ['8.5', '8.6'],
    why: 'The pane header press writes a comment into the review. The artifact chip names a kind of record. The composer avoids the clash by drawing a glyph in front of it, and the other two do not.',
  },
]

/**
 * PAIRS OF WORDS THAT A READER WILL HAVE TROUBLE TELLING APART.
 *
 * The mirror of the sentence problem: 17 states in the product today are told apart only by which
 * of two nearly identical sentences prints. These four pairs are the same hazard inside the
 * contract's own vocabulary. Nothing is changed here; they are recorded so the steps that draw
 * them meet the list rather than discover it.
 */
export const NEARLY_THE_SAME: readonly { one: string; other: string; why: string }[] = [
  {
    one: 'Not on screen',
    other: 'Not on this page',
    why: 'The pane says a comment names a thing this screen does not carry; the composer says the thing it is open about is not drawn on the page the reader is on. Two words, one letter apart in the reading.',
  },
  {
    one: 'Choose agent',
    other: 'Choose an agent',
    why: 'One is the To control at rest, the other is what a refused Send says. They differ by one word.',
  },
  {
    one: 'Gone',
    other: 'Deleted',
    why: 'The pane draws Gone for a deleted record; the composer draws Deleted for the same fact.',
  },
  {
    one: '+ Add',
    other: 'Add',
    why: 'One adds a piece in Organise, the other puts a comment in the collecting review.',
  },
]

// ============================================================================ where a comment got to

/**
 * WHERE ONE COMMENT HAS GOT TO, PROJECTED INTO THE WORDS THE OWNER READS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS HERE AND NOT A SEVENTH ROW IN A COMPONENT
 * ---------------------------------------------------------------------------------------
 *
 * `agent_messages.state` holds six stored words — `queued`, `sent`, `delivered`, `picked_up`,
 * `handled`, `failed`. Every one of them is a machine word, and three of them read badly to a
 * person: a queue is the mechanism and waiting is what somebody sees; `picked_up` has an underscore
 * in it; `handled` is a word about a process rather than about the work.
 *
 * THE READINGS ARE NOT WRITTEN AGAIN HERE. `STATE_WORDS` in `src/shared/words.ts` is the one table
 * of readings and it has been right for months, so this reads THAT — through `stateWord`, the same
 * call every other reader makes. What this file adds is the other two thirds of a drawn state: the
 * mark, so the six tell apart with the colour gone, and the sentence, so the reader who needs one
 * can get it. That is what `DrawnState` is for and why a bare word was never enough.
 *
 * ---------------------------------------------------------------------------------------
 * A WORD NOBODY HAS A READING FOR COMES BACK NAMED OUT LOUD
 * ---------------------------------------------------------------------------------------
 *
 * `stateWord` answers `unknown state: <the word>` for anything its table does not know, and this
 * hands that straight through rather than falling back to the stored token. A reading function that
 * hands back what it was given is the fall-through the machine-word gate exists to catch: a screen
 * gets the stored word without asking, and no site can be found to fix because there is no site.
 */

/**
 * THE OTHER TWO THIRDS OF EACH OF THE SIX: the mark, and the sentence behind the word.
 *
 * ONE ROW PER WORD CARRYING BOTH, and not two tables side by side. Two parallel tables keyed by the
 * same six words are two places one fact is written down — the defect this repository keeps finding
 * — and a word that gained a mark in one and no sentence in the other would draw a state with no
 * way to ask what it means.
 *
 * IT IS NOT A FAMILY IN `VOCABULARY` and it carries no `section`, because these label a stored
 * column of `agent_messages` rather than a subsection of the interaction contract. The WORD for each
 * of them is not here at all: `STATE_WORDS` in src/shared/words.ts is the one table of readings, and
 * `deliveryWordOf` reads it.
 */
const DELIVERY_DRAWN: Readonly<Record<string, { mark: StateMark; detail: string }>> = {
  queued: {
    mark: { form: 'outline', glyph: 'ring', edge: 'dashed', where: 'right' },
    detail: 'Written down and waiting. Nobody has been given it.',
  },
  sent: {
    mark: { form: 'outline', glyph: 'hollow', edge: 'solid', where: 'right' },
    detail: 'It has gone out. Nothing has come back.',
  },
  delivered: {
    mark: { form: 'outline', glyph: 'dot', edge: 'solid', where: 'right' },
    detail: 'A listening agent or a claiming worker has been handed it.',
  },
  picked_up: {
    mark: { form: 'outline', glyph: 'disc', edge: 'underline', where: 'right' },
    detail: 'The agent it went to said, by its own id, that it has it.',
  },
  handled: {
    mark: { form: 'outline', glyph: 'filled', edge: 'solid', where: 'right' },
    detail: 'The agent it went to said what it did about it.',
  },
  failed: {
    mark: { form: 'outline', glyph: 'struck', edge: 'solid', where: 'right' },
    detail: 'It did not get there. Nobody has been given it.',
  },
}

/**
 * The drawn state for one stored delivery word.
 *
 * `stored` is what the database holds. A word this build has no reading for comes back with the
 * word `stateWord` gives it — which names the word out loud — and the mark of a state nobody has
 * heard of, so it is visibly not one of the six rather than quietly drawn as one.
 */
export function deliveryWordOf(stored: unknown): DrawnState {
  const read = stateWord(stored)
  const key = read.stored
  const drawn = DELIVERY_DRAWN[key]
  if (drawn === undefined) {
    return {
      word: read.text,
      mark: { form: 'outline', glyph: 'none', edge: 'hairline', where: 'right' },
      detail:
        read.standing === 'absent'
          ? 'Nothing is recorded about where this comment has got to.'
          : `Mole Office has no reading for the word "${key}", so nothing is claimed about where this comment has got to.`,
    }
  }
  return { word: read.text, mark: drawn.mark, detail: drawn.detail }
}

/**
 * HOW MANY OF THE MESSAGES CARRYING ONE COMMENT'S WORDS HAVE BEEN DEALT WITH, AS `1 / 2 dealt with`.
 *
 * ---------------------------------------------------------------------------------------
 * ONE COMMENT CAN GO TO TWO AGENTS, AND A SINGLE WORD CANNOT SAY WHAT HAPPENED TO IT
 * ---------------------------------------------------------------------------------------
 *
 * A review's send writes each comment into one conversation as a message carrying who it is for,
 * and dispatch groups those messages by recipient. So a comment somebody sent to two agents is TWO
 * rows of `agent_messages`, and they move independently: one agent deals with it this afternoon and
 * the other is offline all week.
 *
 * Drawing the worst of the two would say a comment is still waiting when half of it is answered.
 * Drawing the best would say it is dealt with when nobody has read it. Drawing one and dropping the
 * other is the defect this repository keeps finding. So both numbers are drawn, and the word under
 * them is the reading of the word they are counting rather than a seventh word invented here.
 *
 * `of` IS NEVER ZERO IN A DRAWN ANSWER: a comment nothing carries answers `null`, because "0 / 0"
 * is a number about nothing standing where a fact goes.
 */
export interface HowManyDealtWith {
  /** How many of them have been dealt with. */
  done: number
  /** How many messages carry these words. Never zero. */
  of: number
  /** `1 / 2 dealt with`, ready to draw. */
  says: string
  /** True when every one of them has. */
  all: boolean
}

/**
 * The count, over the stored words of every message carrying one comment.
 *
 * `handled` IS THE ONE THAT COUNTS, and it is asked as the stored word rather than as its reading,
 * because what is being counted is a fact in a column. The SENTENCE uses the reading.
 */
export function howManyDealtWith(states: readonly unknown[]): HowManyDealtWith | null {
  if (states.length === 0) return null
  const words = states.map((one) => stateWord(one).stored)
  const done = words.filter((word) => word === 'handled').length
  const reading = stateWord('handled').text
  return {
    done,
    of: words.length,
    says: `${String(done)} / ${String(words.length)} ${reading}`,
    all: done === words.length,
  }
}
