// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A COMMENT IS ABOUT, in the words a person reads.
 *
 * THE SHAPE AND THE VOCABULARY ARE `src/shared/targets.ts`, which the browser and the server both
 * import — one declaration of the thirteen things a person can point at, what identifies each and
 * what to call each. This file restates none of it. What it adds is only what a screen needs: the
 * sentence that goes on the chip above the composer, and how much of a quotation to draw.
 *
 * THE FIVE INTENTS AND THE STATE WORDS ARE TOTAL MAPS OVER THE SERVER'S OWN UNIONS. That is the
 * device `PAGE_TITLES` uses in Sidebar.tsx: an intent added on the server stops this file compiling
 * until somebody says what it is called on screen, so the screen cannot quietly go on offering four
 * of five. A list would not do that — it would just be short.
 */

import { parsePlanLine } from '@shared/planline.ts'
// THE FIRST HALF OF `nameOfRegion` as facts, the tree this page derived to draw with, and the type
// of a part's role. The page names all of them from the word lists. `whatKindOfPlace` below says why.
import {
  findRegion,
  namesOfParts,
  partIdOfRegionId,
  whatARegionIdNames,
  type PartWords,
  type Region,
  type RegionRole,
  type WhatARegionIdNames,
} from '@shared/regions.ts'
import type { Rung } from '@shared/detail.ts'
import { content, t, type WordKey } from '@shared/i18n.ts'
import { titleHere } from '../sections.ts'
import { theReportDrawnHere, type ReportDrawn } from '../../lib/drawnreport.ts'
import {
  idsOfTarget,
  nameTarget,
  spanNamedBy,
  targetKey,
  targetSpec,
  withoutIdsOf,
  wordsInNamedSpan,
  wordsNamedBy,
  type Context,
  type Target,
} from '@shared/targets.ts'
import type { Mode } from '@shared/mode.ts'
import { RECORD_KINDS, type RecordKind, type RecordOrigin } from '@shared/types.ts'
import { kindWord, linkWord } from '@shared/words.ts'
import type { MessageIntent, MessageRole, RunState, ThreadMode, ThreadState } from '../../../server/lib/agents.ts'
import type { NothingFiledCode, PickUp, RecipientGround } from '../../../server/lib/recipients.ts'
import { CUT_MARK, SHOWN_CHARACTERS, shortenToWords, type ShortenedWords } from '@shared/shortening.ts'

export { SHOWN_CHARACTERS, shortenToWords }
export type { ShortenedWords }

export type MessageContext = Context
export type { Target }

/** The thing a comment is about. A comment on a few words is a comment on the thing they are in. */
export function objectOf(context: MessageContext): Target {
  return context.target
}

/**
 * A key for one thing, so a page can look up whether it has a comment waiting.
 *
 * IT IS THE SHARED SPELLING, `targetKey`, and that is the fix. GET /api/agent/marks used to send a
 * key of its own while the browser built a second one, which is the defect this repository keeps
 * finding: two spellings of one key, one on each side, failing silently — every mark simply stops
 * being drawn. There is one spelling now and both sides call it.
 */
export function lookupKey(context: MessageContext): string {
  return targetKey(context.target)
}

/**
 * What kind of thing this is, in one word for the chip.
 *
 * A TOTAL MAP OVER THE DECLARATION rather than a list of three: the noun is on the declaration, so a
 * thing added to the vocabulary is named on screen without anybody editing this file, and a thing
 * with no noun is caught by tests/target-vocabulary.test.ts rather than drawing blank.
 */
export function objectWord(context: MessageContext): string {
  return started(targetSpec(context.target.kind).noun)
}

/** A word that opens a chip, with its first letter made a capital. One rule, used by both below. */
const started = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1)

/**
 * WHAT KIND OF PLACE ONE PART OF A RECORD IS: *Paragraph*, *Table*, *Gist*, *Section “…”*.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT REPLACES, MEASURED IN A BROWSER ON 1 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * The chip drew *Part of a record* for all thirteen kinds of part — including the stored label the owner's
 * acceptance Act 3 right-clicks, directly above a sentence that already knew the part was a label.
 * That word is the target declaration's noun, which is true of every part and tells a reader
 * nothing they cannot see.
 *
 * ---------------------------------------------------------------------------------------
 * IT ASKS THE TWO HALVES OF `nameOfRegion` AND HOLDS NO OPINION OF ITS OWN
 * ---------------------------------------------------------------------------------------
 *
 * `whatARegionIdNames` answers for a stored short form, a declared section and a list of links, all
 * of which are read off the id, and `idWordsOnThisPage` names its answer in the page language.
 * Everything else is a fact about the derived region, so the region is looked up in the
 * tree the drawing on this page derived — the same tree the mark layer and *View original* read —
 * and its role is named by `roleWordOnThisPage` below, the page's reading of the same words
 * `wordForRegion` gives the server.
 *
 * THE DECLARATION'S OWN NOUN IS THE ANSWER WHEN THIS PAGE IS NOT DRAWING THAT RECORD, which happens
 * on the agents page and anywhere a comment is read away from the record it was left on. It is the
 * general answer and it is true of every part; it is not a guess at which part this is. It is read
 * from the word lists too, so a page in Chinese draws it in Chinese (problem M_Hy9q3iqcW9).
 */
function whatKindOfPlace(target: { recordId: string; regionId: string }, kind: RecordKind | null): string {
  const drawn = theReportDrawnHere()
  // WHAT THIS DRAWING DREW AS ITS FORM, ASKED FIRST, BECAUSE THE ID ALONE CANNOT SAY.
  //
  // Reading lengths 2 and 3 are the record's own title and summary since 3 September 2026, and the
  // same summary is the record's one-line summary in the header of a module page. So one region id
  // is two different things in two places and WHERE it is drawn is what decides. `nameOfRegionId`
  // below reads the id, which is the right answer everywhere the ladder is not drawing it.
  const asForm = whichFormOfTheReport(target, drawn)
  if (asForm !== null) return asForm
  const byId = whatARegionIdNames(target.regionId, kind)
  if (byId !== null) return idWordsOnThisPage(byId)
  // A PART OF THE REPORT, AT ONE OF THE THREE LENGTHS WRITTEN BY PART. Which part it is, of how
  // many, and which length the reader is at are all facts about the drawing rather than about the
  // id, so they are read off what the page announced it drew. A part pressed at level 4 and the
  // same part pressed at level 6 carry ONE id, so the two presses name one thing.
  const asPart = whichPartOfTheReport(target, drawn)
  if (asPart !== null) return asPart
  const region =
    drawn === null || drawn.recordId !== target.recordId ? null : findRegion(drawn.root, target.regionId)
  return region === null ? t('pointWord.partOfARecord') : roleWordOnThisPage(region.role)
}

/**
 * WHICH PART OF A RECORD EACH ONE IS, IN THE PAGE LANGUAGE. Problem t_ox8XMOvu7a.
 *
 * `namesOfParts` in src/shared/regions.ts is the one namer: it works out which parts read alike and
 * how far up each has to go to be told apart. It says it in English for the server. This hands it
 * the page's words instead, so the landing of *View original* and the parts a short form stands for
 * name one part the same way in either language. A part's own words are quoted as they were written.
 */
export function namesOfPartsOnThisPage(root: Region, kind: RecordKind, title: string | null): ReadonlyMap<string, string> {
  return namesOfParts(root, kind, title, PART_WORDS_ON_THIS_PAGE)
}

/**
 * WHAT ONE PART OF A RECORD IS CALLED ON THIS PAGE, naming which one where this page draws the
 * record, and naming only what kind of place it is where it does not (`whatKindOfPlace`).
 */
export function partNameOnThisPage(target: { recordId: string; regionId: string }, kind: RecordKind | null): string {
  const drawn = theReportDrawnHere()
  const named =
    drawn === null || drawn.recordId !== target.recordId
      ? undefined
      : namesOfPartsOnThisPage(drawn.root, drawn.kind, drawn.title).get(target.regionId)
  return named ?? whatKindOfPlace(target, kind)
}

/**
 * WHERE ONE PART OF A RECORD IS, AS A SENTENCE IN THE PAGE LANGUAGE: the server's `whereAPartIs`
 * (src/shared/regions.ts) said with the word lists, so a Chinese page draws no English place sentence
 * under a comment (wave 13r round 16, check LKIg1xz-PjD-). The whole of the record and its body are
 * said as such; any other part is named by `partNameOnThisPage`, which names WHICH part where this
 * page draws the record and what kind of part where it does not.
 */
export function wherePartIsOnThisPage(
  target: { recordId: string; regionId: string },
  kind: string,
  title: string,
): string {
  // A KIND THE OFFICE DOES NOT KNOW is said by `kindWord` as it is, and names no kind of part.
  const known = (RECORD_KINDS as readonly string[]).includes(kind) ? (kind as RecordKind) : null
  const drawn = theReportDrawnHere()
  const region = drawn === null || drawn.recordId !== target.recordId ? null : findRegion(drawn.root, target.regionId)
  const words = { kind: kindWord(kind).text, title }
  if (region?.role === 'recordRoot') return t('review.pane.place.whole', words)
  if (region?.role === 'reportBody') return t('review.pane.place.body', words)
  return t('review.pane.place.part', { ...words, part: partNameOnThisPage(target, known) })
}

/** Which of the four English ordinal endings a number takes: 1st, 2nd, 3rd, 4th. */
const ENGLISH_ORDINAL = new Intl.PluralRules('en', { type: 'ordinal' })

/** The page's words for `namesOfParts`, read through `t()`. */
const PART_WORDS_ON_THIS_PAGE: PartWords = {
  // WHAT THE SERVER'S `nameOfRegion` SAYS, IN THE PAGE LANGUAGE: the id's own answer first (a stored
  // short form, a declared section, a list of links), and otherwise the part's role.
  nameOf: (region, kind) => {
    const byId = whatARegionIdNames(region.id, kind)
    return byId === null ? roleWordOnThisPage(region.role) : idWordsOnThisPage(byId)
  },
  withWords: (name, words) => t('chatEnglish.part.withWords', { name, words: content(words) }),
  inside: (part, holder) => t('chatEnglish.part.inside', { part, holder }),
  nth: (n, name) => {
    const ending = ENGLISH_ORDINAL.select(n)
    const key: WordKey =
      ending === 'one'
        ? 'chatEnglish.part.nth.st'
        : ending === 'two'
          ? 'chatEnglish.part.nth.nd'
          : ending === 'few'
            ? 'chatEnglish.part.nth.rd'
            : 'chatEnglish.part.nth.th'
    return t(key, { n, name })
  },
}

/**
 * WHAT ONE ROLE OF A PART IS CALLED, IN THE PAGE LANGUAGE: *paragraph*, *picture*, *table*.
 *
 * The server names a part with `wordForRegion` in src/shared/regions.ts, which reads the English
 * list directly and stays English. The page reads the same keys through `t()`, in the page
 * language. There is one list of words for both, so the two readings cannot drift (problem
 * M_Hy9q3iqcW9).
 *
 * A NEW ROLE WITH NO WORD STOPS THE BUILD. The key below is typed as a `WordKey`, so a role added to
 * `REGION_ROLES` without a `pointWord.role.` entry in src/shared/words/en.ts is a type error, and
 * zh.ts must hold every key en.ts holds. Nothing here reads the English list directly.
 *
 * A STORED SHORT FORM NEVER REACHES THIS. `wordForRegion` names one by its length rather than its
 * role, but `whatKindOfPlace` asks `whatARegionIdNames` first, and that answers for every short form.
 */
function roleWordOnThisPage(role: RegionRole): string {
  const key: WordKey = `pointWord.role.${role}`
  return t(key)
}

/**
 * WHAT A PART NAMED BY ITS ID IS CALLED, IN THE PAGE LANGUAGE. Problem _n8ae-YG6qmU.
 *
 * The server says the same in English with `nameOfRegionId` in src/shared/regions.ts, from the same
 * keys. Here:
 *
 *   a stored short form   its length's noun, *label*, as `lengthWordOnThisPage` reads it;
 *   a declared section    *section “…”*, with the title the section's own panel draws as its
 *                         heading on this page, from `titleHere`;
 *   a list of links       *links read as “…”*, with the word the rail draws over those rows on
 *                         this page, from `linkWord`.
 */
function idWordsOnThisPage(named: WhatARegionIdNames): string {
  switch (named.is) {
    case 'shortForm':
      return lengthWordOnThisPage(named.level)
    case 'section':
      return t('pointWords.section', { title: titleHere(named.kind, named.key) })
    case 'links':
      return t('pointWords.linksReadAs', { phrase: linkWord(named.type, named.direction).text })
  }
}

/**
 * WHAT A READING LENGTH IS CALLED, IN THE PAGE LANGUAGE: *label*, *conclusion*, *full text*.
 *
 * A NEW LENGTH WITH NO WORD STOPS THE BUILD. The key is typed as a `WordKey`, so a rung added to
 * src/shared/detail.ts without a `pointWords.length.` entry in src/shared/words/en.ts is a type
 * error, and zh.ts must hold every key en.ts holds. A stored short form is a rung too, so this names
 * both.
 */
function lengthWordOnThisPage(rung: Rung): string {
  const key: WordKey = `pointWords.length.${rung}`
  return t(key)
}

/**
 * THE READING LENGTH THIS PRESS LANDED ON, where the report body drew it as its form, or null.
 *
 * *title*, *conclusion*. The noun is the position's own, from `RUNG_SPECS`, so the composer and the
 * reading control name one ladder.
 *
 * IT IS ASKED OF THE DRAWING AND NOT OF THE ID. `section.summaryLine` is the record's one-line
 * summary in the header of a module and the report's conclusion in the body of a report at length
 * 3 — one string, one id, two places. The drawing says which region it drew as its form and at
 * which length, which is the fact that separates them.
 */
function whichFormOfTheReport(
  target: { recordId: string; regionId: string },
  drawn: ReportDrawn | null,
): string | null {
  if (drawn === null || drawn.recordId !== target.recordId || drawn.form === null) return null
  if (drawn.form.regionId !== target.regionId) return null
  return lengthWordOnThisPage(drawn.form.rung)
}

/**
 * WHICH PART OF THE REPORT THIS PRESS LANDED ON, in words, or null because it is not one.
 *
 * *part 2 of 5 of the report's sketch, each part in 30 words*. The position and the count say where
 * the reader is in the report; the phrase says which length they are reading at, in the plain words
 * the detail control uses for it rather than in the key it is stored under. The whole sentence is
 * one key with values, so a language puts the parts in its own order (problem _n8ae-YG6qmU). The part's own heading is
 * the quotation the chip draws beside this, so it is not repeated inside it.
 */
function whichPartOfTheReport(
  target: { recordId: string; regionId: string },
  drawn: ReportDrawn | null,
): string | null {
  const partId = partIdOfRegionId(target.regionId)
  if (partId === null) return null
  if (drawn === null || drawn.recordId !== target.recordId || drawn.parts === null) return null
  const at = drawn.parts.findIndex((one) => one.id === partId)
  if (at === -1) return null
  return t('pointWords.partOfTheReport', {
    n: at + 1,
    count: drawn.parts.length,
    phrase: t(`settingsPanel.detail.phrase.${drawn.rung}`),
  })
}

/**
 * THE WORD IN FRONT OF THE TITLE ON THE COMPOSER'S CHIP: what kind of thing was pointed at.
 *
 * It is `objectWord` for everything except two, and both exceptions replace a word that is true of
 * everything with a word about this thing. For a whole record it is the KIND OF RECORD — Problem,
 * Report, Module. For a part of a record it is WHAT KIND OF PLACE that part is — Paragraph, Table,
 * Gist — which `whatKindOfPlace` above works out.
 *
 * `kind` IS THE KIND OF THE RECORD THE SUBJECT IS IN, which for a whole record is the record itself
 * and for a part of one is the record holding it. A declared section's title is declared per kind,
 * so the chip cannot name one without it.
 *
 * WHY "RECORD" IS NOT DRAWN. It is the ontology's word used as a label and it tells a reader
 * nothing they cannot see, because the title is right beside it. That was nit 36, on 19 August
 * 2026, and it left a record with no word at all in front of its title.
 *
 * WHY THE KIND GOES THERE NOW. A link row on a report names another record, and the owner's
 * condition for that row is that the composer name *that record, its kind and title*. A comment
 * about a problem and a comment about a report go to different people, so the kind is part of
 * knowing who should receive it. The stored kind alone would not do — `kindWord` is the one table
 * that turns `wanna_try` into *worth a try*, and it is asked here rather than read.
 *
 * NULL WHEN NOBODY HAS SAID WHAT THE RECORD IS, which is the honest answer while the read that
 * asks is still out, and after one that failed. The chip then draws the title with no word in
 * front of it, exactly as it did before this existed.
 */
export function wordOnTheChip(context: MessageContext, kind: RecordKind | null, mode: Mode): string | null {
  if (context.target.kind === 'region') return started(whatKindOfPlace(context.target, kind))
  // WHICH PART OF THE SCREEN, WHERE THE SECOND HALF OF THE CHIP IS TAKEN BY A QUOTE. A part of Mole
  // Office's own screen draws its own words, so a press on a piece of it keeps a quote of them, and
  // `chipWords` draws that quote where the thing's name would have gone. The chip then said only
  // `Part of Mole Office's own screen “Full”`, which is the same line for the level control above a
  // report and the one below it — one page, two surfaces, one sentence. Problem `abpBwHbn-00o`.
  //
  // `nameTarget` IS THE DECLARATION'S OWN NAMER and not a second one: it is the same function the
  // server names a comment's target with, and for this kind it answers with the label declared in
  // src/shared/surfaces.ts. Where nothing was quoted the second half of the chip already IS that
  // label, so the word in front stays the noun and nothing is said twice.
  if (context.target.kind === 'uiSurface' && wordsNamedBy(context) !== null) return nameTarget(context.target)
  // IN THE PAGE LANGUAGE (wave 13q round 17): `objectWord` is the declaration's English noun, which the
  // chip drew on a Chinese page too. The review pane names the same kinds through these words already.
  if (context.target.kind !== 'record') return t(`review.pane.subject.${context.target.kind}`)
  if (kind === null) return null
  const word = kindWord(kind, mode)
  // A STORED VALUE IS PRINTED AS IT IS STORED. In developer mode `kindWord` gives back the word in
  // the database, and capitalising that would draw `Wanna_try` — a value nothing holds, on the one
  // screen whose whole purpose is to show what is held.
  return mode === 'inspect' ? word.text : started(word.text)
}

/**
 * The words on the chip above the composer: what the agent is being pointed at.
 *
 * `about` is what the page already calls the thing — a record's title, a line's words — and it is
 * passed in rather than fetched, because the page drawing the object has it in its hand.
 *
 * THE WORDS THE PLACE HOLDS BEAT THE THING'S NAME, whether they are a span of a stored string or a
 * quote of something Mole Office drew from its own code. Both are the words the person was on, and
 * `wordsNamedBy` is the one function that answers for both. It used to read the span alone, so a
 * quote — the only place words can be kept for a part of Mole Office's own screen — was drawn as the
 * whole panel's name.
 *
 * A LINE OF A PLAN IS SHOWN AS THE WORDS SOMEBODY WROTE, NOT AS THE LINE'S CHARACTERS. A line may
 * carry a run of groups at its end — `{size: 2h} {note: ask Sam}` — and those are how the line
 * records its planning values, not part of what the line is called. `parsePlanLine` in
 * src/shared/planline.ts is the ONE reader of that syntax and it is the one used here; a second
 * reader in this file would be the same rule written twice, free to disagree. It is safe on words
 * that carry no groups: the line comes back whole.
 */
export function chipWords(context: MessageContext, about: string): ShortenedWords {
  const named = spanNamedBy(context)
  if (named !== null) {
    const words = wordsInNamedSpan(named)
    return named.cut === true ? { words, shortened: true, whole: words } : shortenToWords(words)
  }
  if (context.place?.at === 'quote' && context.place.cut === true) {
    return { words: context.place.words, shortened: true, whole: context.place.words }
  }
  const words = wordsNamedBy(context)
  if (words !== null) return shortenToWords(words)
  if (context.target.kind === 'planLine') return shortenToWords(parsePlanLine(about).text)
  return shortenToWords(about)
}

/**
 * WHAT A NOTE SOMEBODY LEFT IS CALLED IN A LIST: the first words of what they wrote.
 *
 * A record needs a title and an annotation has no field for one, so the title is DERIVED from the
 * body rather than being a second thing to write. This is the one place that derivation lives, and
 * every write of the body writes the title through it, so the two cannot drift into saying
 * different things — see `writeAnnotation` and `rewriteAnnotation` in src/web/api.ts.
 *
 * The cut is `shortenToWords`, the same rule the chip above the composer uses, so a note's name and
 * the chip stop at the same kind of place. The ellipsis is added here because a title has nowhere
 * to say "shortened" beside it.
 */
export function annotationTitle(body: string): string {
  if (body.trim() === '') return 'A note with nothing written in it yet'
  return shortName(body, SHOWN_CHARACTERS)
}

/**
 * A NAME SHORT ENOUGH FOR ONE LINE, with the cut said in the one way a name can say it.
 *
 * A chip has room to put the word *shortened* beside what it drew. A name on a control, in a row or
 * in a title has nowhere to put it, so the cut is marked with an ellipsis instead — and this is the
 * one place that decides which, so a note's name in a list and an agent's name on the composer's
 * control stop the same way. The whole string belongs under the pointer wherever this is drawn.
 */
export function shortName(text: string, limit: number = LABEL_CHARACTERS): string {
  const short = shortenToWords(text, limit)
  return short.shortened ? `${short.words}${CUT_MARK}` : short.words
}

/** Every id a context names. Used to keep ids off the screen in Normal, and nowhere else. */
export function idsOf(context: MessageContext | null): string[] {
  return context === null ? [] : idsOfTarget(context.target)
}

/**
 * The server's sentence about what a comment points at, with the ids taken out for Normal.
 *
 * The sentence is the server's and is never rewritten — this only removes the exact id strings the
 * context already names, and only when the reader has not asked to see the machinery. A record id
 * belongs in Developer detail, which is where `design/UX-CONTRACT.md` puts it, and the sentence
 * reads perfectly without it: *the block "4B.2 probe pipeline, delete me"*. The rule itself is
 * `withoutIdsOf` in src/shared/targets.ts, which the server's review message uses too.
 */
export function withoutIds(sentence: string, context: MessageContext | null): string {
  return withoutIdsOf(sentence, context === null ? null : context.target)
}

/**
 * The five things a person can mean, and what each one is, in their words and the page language.
 * Each is read when it is drawn, so a page that changes language draws the new words.
 */
export const INTENT_WORDS: Readonly<Record<MessageIntent, { label: string; what: string }>> = {
  ask: { get label() { return t('agentWords.intent.ask') }, get what() { return t('agentWords.intent.ask.what') } },
  discuss: { get label() { return t('agentWords.intent.discuss') }, get what() { return t('agentWords.intent.discuss.what') } },
  review: { get label() { return t('agentWords.intent.review') }, get what() { return t('agentWords.intent.review.what') } },
  change: { get label() { return t('agentWords.intent.change') }, get what() { return t('agentWords.intent.change.what') } },
  start: { get label() { return t('agentWords.intent.start') }, get what() { return t('agentWords.intent.start.what') } },
}

/** The order the five are drawn in: a question first, work last. */
export const INTENTS: readonly MessageIntent[] = ['ask', 'discuss', 'review', 'change', 'start']

/** What a conversation is, in a word: the two dispatch times, said as a person would say them. */
export const MODE_WORDS: Readonly<Record<ThreadMode, string>> = {
  direct: 'Sent as written',
  review: 'Review',
}

/** Where a conversation stands. */
export const THREAD_STATE_WORDS: Readonly<Record<ThreadState, string>> = {
  open: 'Open',
  dispatched: 'Sent',
  answered: 'Answered',
  abandoned: 'Dropped',
}

/**
 * Where one attempt stands.
 *
 * `queued` IS "Not picked up yet" AND IS NEVER A SPINNER. Nothing is running, nobody is on it, and a
 * turning circle would say the opposite. The server's sentence beside it says "Waiting for a worker.",
 * in other words, so that one run does not say the same thing twice (round 132).
 */
export const RUN_STATE_WORDS: Readonly<Record<RunState, string>> = {
  queued: 'Not picked up yet',
  claimed: 'Taken, not finished',
  running: 'Running now',
  finished: 'Answered',
  failed: 'Failed',
  declined: 'A worker could not serve it',
  crashed: 'Its worker stopped without answering',
  withdrawn: 'Withdrawn, not tried',
}

/**
 * WHO SAID ONE THING IN A CONVERSATION, in the words a reader would use.
 *
 * A person's message is labelled by WHAT THEY MEANT — ask, discuss, review, change, start work —
 * because that is a field they filled in and it is the more useful of the two. So `human` is null
 * here, and null means "this one is named from what it means, not from who said it". An agent's
 * answer and a sentence from Mole Office have no such field, so they are named by who said them.
 *
 * IT IS A TOTAL MAP OVER `MESSAGE_ROLES`, so a fourth role added on the server stops this file
 * compiling until somebody says what it is called on screen.
 */
export const ROLE_WORDS: Readonly<Record<MessageRole, string | null>> = {
  human: null,
  agent: 'The agent answered',
  system: 'Mole Office said',
}

// ---------------------------------------------------------------------------- the short reading

/**
 * A SHORT FORM IS A LEVEL OF ITS OWN. IT IS NEVER A LONG ONE WITH THE END CUT OFF.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS AND WHY IT IS HERE
 * ---------------------------------------------------------------------------------------
 * The composer's recipient and routing lines were too verbose: by default they showed several
 * paragraphs on where the recipient came from and on the resume state. The default is now three
 * lines:
 *
 *     Round 7 agent
 *     Worked on this Plan · 18 Aug
 *     ○ new run required
 *
 * The server sends a full sentence for each of those facts, and the sentences are right — they are
 * read carefully once. What was missing was a SHORT form to draw by default, with the sentence one
 * press away.
 *
 * THE SHORT FORM IS BUILT FROM THE SAME STRUCTURED FIELD THE SENTENCE IS BUILT FROM, never by
 * cutting the sentence. `ground`, `origin` and `pickUp.answer` are enumerations the server sends
 * beside its prose, so a label per value is a second LENGTH of one fact rather than a second
 * reading of it. Cutting the prose would be the thing `design/ROUND-EIGHT.md` names in Phase 11:
 * *where truncation is today, a level goes instead*.
 *
 * THE THREE MAPS ARE TOTAL OVER THE SERVER'S OWN UNIONS, the same device `INTENT_WORDS` and
 * `RUN_STATE_WORDS` above use: a value added on the server stops this file compiling until somebody
 * says what it is called on screen. `tests/the-composer-is-short.test.ts` pins the keys against the
 * server's arrays as well, so the two cannot come to hold different sets without a test going red.
 *
 * NOTHING HERE DECIDES WHETHER A THING IS SAID, only how short it is when it is said. Whether a
 * candidate needs an origin warning at all is the server's answer and is read from `originNote`.
 */

/** Why an agent is on the ranked list, in two to six words. The sentence is `candidate.why`. */
export const GROUND_LABELS: Readonly<Record<RecipientGround, string>> = {
  'filed-this-record': 'Created this',
  'said-it-was-on-this-work': 'Said it was on this work',
  'wrote-to-this-record': 'Changed this',
  'filed-under-the-same-work': 'Filed under the same work',
  'wrote-to-something-this-is-linked-to': 'Changed something linked to this',
}

/**
 * What a run with no ground is doing on the list: nothing connects it, and it is offered by recency
 * alone. Said on the row as well as in the heading, because a row read on its own must not look
 * ranked.
 */
export const NOT_CONNECTED_LABEL = 'Not connected to this'

/**
 * THE PICKER'S OWN HEADINGS AND LABELS, WHICH USED TO ARRIVE FROM THE SERVER AS FINISHED ENGLISH.
 *
 * Owner finding 18, and step 14 §3.1 measured it: `GET /api/recipients` carried `connectedHeading`,
 * `recentHeading`, `context.sentence`, `context.nothingFiled`, `context.runsInAnotherProject` and a
 * `note` no screen drew. The reply now carries the facts — the record, a code, a count, a list of
 * project ids — and the words a reader sees are here, where the rest of this file's words are.
 *
 * `RECENT_HEADING` IS THE ONE TO READ TWICE. The server's was *"Other agents, recently active.
 * Nothing connects these to what you pointed at."* Both halves are kept: `Not connected` is the
 * half that stops recency being read as relevance, and it is the same wording as
 * `NOT_CONNECTED_LABEL` on the rows underneath, so the heading and the row cannot drift apart.
 */

/** The heading over the ranked list. */
export const CONNECTED_HEADING = 'Connected to what you pointed at'

/** The heading over the rest. Separate on purpose: recency is not relevance. */
export const RECENT_HEADING = 'Not connected · recently active'

/** What the ranked list was ranked against, before the kind and the title of it. */
export const RANKED_AGAINST_LABEL = 'Ranked against'

/** The ranking cannot be asked about this kind of thing at all. */
export const NOTHING_RANKED_LABEL = 'Nothing ranked'

/** No context was sent, so the list below is the whole project by recency. */
export const NOTHING_POINTED_AT_LABEL = 'Nothing pointed at'

/** Said after the title, when the record it names has been deleted. */
export const DELETED_LABEL = '· deleted'

/** Runs that wrote to what you pointed at and are filed in another project. */
export const ELSEWHERE_LABEL = 'Wrote to this, filed in another project'

/**
 * Why there is no record behind what was pointed at, in three to six words.
 *
 * Total over the server's `NothingFiledCode`, the same device `GROUND_LABELS` uses: a case added on
 * the server stops this file compiling until somebody says what it is called on screen. The
 * sentence behind each is `nothingFiled.detail`, which the server sends and the screen puts under
 * the pointer.
 */
export const NOTHING_FILED_LABELS: Readonly<Record<NothingFiledCode, string>> = {
  'line-not-tracked': 'Not tracked as work yet',
  'record-gone': 'The record it named is gone',
}

/** How a session record got here, in three to five words. The sentence is `candidate.originNote`. */
export const ORIGIN_MARKS: Readonly<Record<RecordOrigin, string>> = {
  authored: 'Filed as real work',
  fixture: 'Not a real run',
}

/** The same, for a record nobody stamped. Absence is a real answer and it is said, not left blank. */
export const NO_ORIGIN_MARK = 'Nobody said where this record came from'

/**
 * Whether a run can be picked up where it left off, in three to seven words.
 *
 * `yes` IS NULL BECAUSE THERE IS NOTHING TO SAY. A mark on every row marks nothing, and "it can be
 * picked up" is the ordinary case.
 *
 * `unknown` IS NOT `no` AND IS NOT WORDED LIKE IT. "Mole Office looked and there is nothing to pick up"
 * and "Mole Office could not find out" are opposite findings, and the second one must not send somebody
 * off to start a new agent.
 */
export const PICK_UP_MARKS: Readonly<Record<PickUp['answer'], string | null>> = {
  yes: null,
  no: 'Needs a new run',
  unknown: 'Not known whether it can be picked up',
}

/**
 * HOW MANY CHARACTERS OF A NAME A COMPACT CONTROL SHOWS.
 *
 * It is shorter than `SHOWN_CHARACTERS` above, and the two are different numbers because they
 * answer different questions. Sixty is how much of a QUOTED THING a chip shows, and a chip may
 * wrap onto a second line. This is a name on one line of a 24rem box beside a label and a mark, and
 * a name that wraps there costs the very line this was meant to get back.
 *
 * The names it cuts are the titles agent runs are given, which are sentences: *Round seven build
 * run — Plan and Schedule corrections, then the first Agent Interaction Foundation*. Cut at a word
 * boundary by `shortenToWords`, which also reports that it cut, and the whole title stays under the
 * pointer.
 */
export const LABEL_CHARACTERS = 34
