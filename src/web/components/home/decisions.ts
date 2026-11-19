// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t, content } from '@shared/i18n.ts'
/**
 * WHAT THE DECISION SURFACES ARE DRAWN FROM, READ ONCE — the forks waiting, and what you decided.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS AND WHY IT HOLDS NO JSX
 * ---------------------------------------------------------------------------------------
 *
 * Two surfaces draw these records: the decisions band on Home, and the decisions page. This is the
 * part of both that can be read and tested without a browser, so the sort, the waiting phrase, the
 * option chip and the week-long window are worked out ONCE and proved once rather than looked at
 * twice on two screenshots. Neither surface may sort, count, re-phrase or re-derive any of it.
 *
 * That rule used to be the variant slot's, and it outlives the slot. A decision has to be handled
 * without leaving Home, so the three ways of drawing this band
 * are one way, and the components that lost are deleted.
 *
 * ---------------------------------------------------------------------------------------
 * ABOUT A LINE OF THE FORK IS ON A CLOSED ROW, AND THE WHOLE OF IT IS ONE PRESS AWAY
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/forks` sends BOTH `summary` — the one line the record's author wrote — and `question`,
 * the fork's own text. The question is written for the record page and is routinely six hundred
 * characters of internal detail: measured on 2026-08-13, the first fork in the queue carried a
 * 606-character question naming `recordId`, `actorType`, `sessionId` and `tests/changes.test.ts`.
 *
 * A closed row used to carry neither, because a card at rest was to be its title. The
 * round-eleven brief, section 8, asks for the title and about one to one and a half lines of the
 * question or summary, because a title alone locates a fork only if you already know it. So `lede`
 * below is that line. Nothing is cut here: the row clamps it with CSS, and the whole question, the
 * options and the author's own line are all one press away.
 *
 * `summaryAdds` is the other half of the same change. Four forks in this corpus store a `summary`
 * and a `question` that are the same string, and an open card printed both — one sentence, twice,
 * word for word.
 *
 * ---------------------------------------------------------------------------------------
 * TWO REPLIES, ONE READING ON THE SERVER
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/forks` carries each fork whole — its own stored fields and the work it names — which is
 * what settling one without leaving the page needs. `GET /api/needs-you` carries `decisions`: every
 * decision in every project, which is what the history is drawn from and which no fork reading can
 * see, because most decisions in this corpus answer no proposal. Both answer out of `readForks()`
 * in src/server/lib/forks.ts, so neither can disagree with the other about what is settled.
 */

import { dayPhrase } from '../ui.tsx'
import { parseLocalStamp } from '@shared/time.ts'
import type {
  DecidedRecord,
  ForkBlocked,
  ForkPriority,
  ForkThatLeftTheQueue,
  OpenFork,
  SettledFork,
} from '../../../server/lib/forks.ts'
import type { ActOnTheirWords } from '../../../server/lib/warrants.ts'

/** The whole reply's shape, handed on rather than re-declared. */
export type { DecidedRecord, ForkBlocked, ForkPriority, ForkThatLeftTheQueue, OpenFork, SettledFork }

/**
 * HOW MANY FORKS HOME DRAWS. Home summarises the queue; it is not the queue.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THERE IS A CAP AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * Measured in a browser at 1440 on 27 August 2026: Home's `main` was 5,872 px tall and the waiting
 * panel inside it was 2,318 px of that, drawing all 26 forks in the same order, with the same
 * cards, as the page at `#/governance`. The owner's brief, section 8: *"The Home section should
 * summarize the owner queue, not become the queue's detail page."*
 *
 * FOUR, AND WHY FOUR. The tiles sit two to a row at a desk width, so four is two rows — about one
 * screen — and the way to the other twenty-two is under them. It is a summary, and the line under
 * the cards says exactly how many of how many are drawn, so nobody has to guess whether they are
 * looking at all of them.
 *
 * WHICH FOUR. The first four the server sent, which are the most consequential four: `readForks()`
 * orders by the owner's pin, then safety, then how much work is stuck, then how far that reaches,
 * then whether it is the person's to settle, then age. Nothing here re-orders them — see `readDecisions`.
 */
export const HOME_SHOWN = 4

/** One fork waiting on a person, with every phrase this page prints already worked out. */
export interface Decision {
  recordId: string
  title: string
  workspaceId: string
  /** What that project is called. Null when nothing registers a project of that id. */
  workspaceTitle: string | null
  /** The author's own one line, when the record carries one. */
  summary: string | null
  /** The fork's own question text. Null when the record states none. */
  question: string | null
  options: number
  /** Somebody wrote a recommendation on this fork. It does not say which option it points at. */
  recommendationWritten: boolean
  /** Mole Office can tell which option that recommendation points at. This is the one-press case. */
  namesAnOption: boolean
  /**
   * ABOUT A LINE OF THE FORK, FOR THE ROW THAT IS NOT OPEN — section 8 of the round-eleven brief:
   * about one to one and a half lines of the question or summary.
   *
   * The question first, because the question is what a person is being asked; the author's own
   * summary when the record states no question; null when it states neither, which the row says
   * rather than filling in. Nothing is cut here — the row clamps it with CSS and the whole of it
   * is one press away, so no reading of this ever loses a word.
   */
  lede: string | null
  /**
   * THE AUTHOR'S OWN LINE, ONLY WHEN IT SAYS SOMETHING THE QUESTION DOES NOT.
   *
   * Measured in a browser at 1440 on 27 August 2026: an open card printed the same sentence twice,
   * word for word, once as small grey prose and again immediately below as a bold heading. Four of
   * the twenty-six forks in the corpus store a `summary` and a `question` that are the same string.
   *
   * THE TEST IS EXACT AND NEVER A JUDGEMENT. Equal after trimming, or wholly contained in the
   * question. Anything else is two different pieces of writing and both are drawn.
   */
  summaryAdds: string | null
  /** The owner pinned this fork. Their own act, drawn as a star in the corner and never as a colour. */
  pinned: boolean
  /**
   * WHY THIS FORK IS WHERE IT IS IN THE QUEUE, as the server worked it out. Handed on, never redone.
   *
   * Several separate facts and no score — `ForkPriority` in src/server/lib/forks.ts. The row draws
   * the ones that are true of it, and `priority.because` says which of them put it where it is.
   */
  priority: ForkPriority
  /**
   * HOW MANY OTHER QUESTIONS THIS ONE STANDS FOR, and the server's sentence for each.
   *
   * A fork leaves the queue without being answered when something supersedes it or when it is
   * marked a duplicate of another. The one left behind is the one to answer, and it is the only
   * place a reader can learn that it now carries more than its own question. Empty for most forks.
   */
  standsFor: readonly ForkThatLeftTheQueue[]
  /** How much work is waiting on this, counted by the server from its own `blocks` links. */
  blocking: number
  /** That work, by name. What the desk shows beside a fork so the count is not the only thing said. */
  blocks: readonly ForkBlocked[]
  /**
   * The fork's own stored fields, as its author wrote them.
   *
   * The desk hands these straight to the panel that settles a fork, which is the same panel and the
   * same object the record page uses. Nothing here reads or reshapes them.
   */
  fields: Record<string, unknown>
  /** What the server could not read on this fork, in its own words. Empty when everything read. */
  unreadable: readonly string[]
  /** "3 options · recommended" or "3 options · no recommendation". */
  chip: string
  /** "waiting 2 days", measured from `createdAt` against the page's one clock. */
  waited: string
  /** The same age in two or three characters: "< 1d", "2d". See `waitedOf`. */
  waitedShort: string
  createdAt: string
  /** Why this is a person's and not an agent's, in the server's own words. */
  because: string
  /**
   * AN ACT ON THE PERSON'S OWN WORDS THAT STILL STANDS ON THIS FORK, or null, which is almost always.
   *
   * Handed on from the server's reading, never worked out here. The row draws four words and puts
   * the person's sentence on the element; the words themselves are drawn whole on the record's own page,
   * beside the press that takes the act back.
   */
  onThePersonsWords: ActOnTheirWords | null
}

/**
 * HOW LONG THIS HAS BEEN SITTING, in two lengths, from ONE reading of the stamp.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THERE ARE TWO, AND WHY ONE FUNCTION MAKES BOTH
 * ---------------------------------------------------------------------------------------
 *
 * The owner, on the phone picture: *"for the waiting under a day, change to < 1d and resettle the
 * place"*. "waiting under a day" is five words and eleven characters wide standing beside a title
 * that is the whole point of the tile, and it was winning. So the tile prints `short` and the whole
 * phrase is what a screen reader and a tooltip get.
 *
 * BOTH COME OUT OF ONE BRANCH ON PURPOSE. A short form worked out somewhere else would be a second
 * opinion about the same number, and the day it disagreed — "< 1d" beside "waiting 2 days" — nothing
 * would fail. That is this repository's recurring defect, so the two forms are returned together.
 *
 * `createdAt` is a local wall-clock stamp — see src/shared/time.ts, one reader and one writer — and
 * an unreadable one says so rather than being drawn as "waiting under a day", which is what an
 * invented zero would look like on the tile.
 */
export interface Waited {
  /** "< 1d", "2d". Two or three characters, so it never competes with a title. */
  short: string
  /**
   * The age with no verb on it: "2 days", "under a day". Null when there is no age — which is what
   * stops a caller writing "settled filed with a date in the future ago".
   */
  age: string | null
  /** "waiting 2 days". The whole phrase, for the tooltip and the screen reader. */
  long: string
}

export function waitedOf(createdAt: string, now: number): Waited {
  const filed = parseLocalStamp(createdAt)
  if (filed === null) return { short: t('home.noDate'), age: null, long: t('home.unreadableDate') }
  const ms = now - filed
  // A stamp in the future is not an age. It is a clock disagreement, and saying "waiting under a
  // day" about it would report the disagreement as an age.
  if (ms < 0) return { short: t('home.ahead'), age: null, long: t('home.futureDate') }
  const days = Math.floor(ms / (24 * 60 * 60 * 1000))
  const age = days === 0 ? t('home.underDay') : t('home.days', { n: days })
  return { short: days === 0 ? t('home.underDayShort') : t('home.dayShort', { n: days }), age, long: t('home.waited', { days: age }) }
}

/** The whole phrase on its own, for the callers and tests that only want the words. */
export function waitedPhrase(createdAt: string, now: number): string {
  return waitedOf(createdAt, now).long
}

/**
 * THE ONE FACT THAT SAYS WHICH DECISION IS EASIEST, as one phrase.
 *
 * "a recommendation" and "no recommendation" used to be 13px grey beside the project tag, the same
 * size and colour as everything else on the row, so the cheapest decision in the queue looked
 * exactly like the most expensive one. The phrase is the same words; what changed is that it is now
 * ONE chip carrying both halves — how many ways there are to go, and whether somebody already
 * suggested one — and that the recommended ones are drawn filled and sorted first.
 */
export function optionChip(options: number, recommendation: { written: boolean; namesAnOption: boolean }): string {
  // Never "0 options". A fork with no options recorded is a fork nobody can settle from this
  // screen, and saying so is more use than printing a zero as though it were a count of choices.
  const ways = options === 0 ? t('home.noOptions') : t('home.options', { n: options })
  // THREE STATES, NOT TWO, and the middle one is the common one. "no recommendation" used to be
  // printed on 25 of the owner's 27 forks, 26 of which carried a written recommendation, because
  // one field carried both facts. The words say which of the three this is, in plain language:
  // somebody wrote a view and Mole Office can act on it; somebody wrote a view and it cannot; nobody
  // wrote one.
  const view = !recommendation.written
    ? t('home.noRecommendation')
    : recommendation.namesAnOption
      ? t('home.namedRecommendation')
      : t('home.wordRecommendation')
  return `${ways} · ${view}`
}

/**
 * WHAT THE FORK ROWS ARE DRAWN FROM. Every phrase, worked out once, for both surfaces.
 *
 * ---------------------------------------------------------------------------------------
 * THE SERVER'S ORDER IS KEPT. NOTHING HERE RE-SORTS ANYTHING
 * ---------------------------------------------------------------------------------------
 *
 * `readForks()` in src/server/lib/forks.ts orders the queue by the owner's pin, then whether
 * somebody could be hurt, then how much work is stuck, then how far that reaches, then whether the
 * fork says only the person may settle it, then how long it has waited, then whether it can be settled in
 * one press. Those are `ForkPriority`, every one of them a fact a reader can check against the
 * record, and `priority.because` says which of them put this fork where it is.
 *
 * THIS USED TO SORT AGAIN, ON TWO OF ITS OWN KEYS, and that is now deleted. Two reasons, and the
 * second is the one that matters. The first is the brief, section 7: the default order puts the
 * most consequential items first. A browser re-sort by whether a recommendation parses put
 * convenience above consequence. The second is that the order was worked out in two places, so the
 * two could disagree — and they already had: the comment here described the server as sorting "by
 * how much work each is holding up and then by age", which stopped being true when the priority
 * model landed, and nothing failed.
 *
 * Home now draws only the first `HOME_SHOWN` of these, so which order they arrive in decides which
 * forks the owner sees at all. A second opinion about that is not a presentation choice.
 *
 * `leftTheQueue` IS ASKED FOR RATHER THAN DEFAULTED. It is the same reply's third list, and a
 * caller that has it must pass it: a row that quietly said a fork stands for nothing, when nobody
 * had looked, is the guess this product has words for instead.
 */
export function readDecisions(
  forks: readonly OpenFork[],
  now: number,
  leftTheQueue: readonly ForkThatLeftTheQueue[],
): Decision[] {
  return forks.map((fork): Decision => {
    const waited = waitedOf(fork.createdAt, now)
    return {
      recordId: fork.recordId,
      title: fork.title,
      workspaceId: fork.workspaceId,
      workspaceTitle: fork.workspaceTitle,
      summary: fork.summary,
      question: fork.question,
      lede: ledeOf(fork.question, fork.summary),
      summaryAdds: summaryAdds(fork.question, fork.summary),
      options: fork.options,
      recommendationWritten: fork.recommendationWritten,
      namesAnOption: fork.namesAnOption,
      pinned: fork.priority.pinned,
      priority: fork.priority,
      onThePersonsWords: fork.onThePersonsWords,
      // The questions this one now stands for. The server states each of them in a sentence naming
      // both records; nothing here works out a second account of why they were joined.
      standsFor: leftTheQueue.filter((gone) => gone.insteadId === fork.recordId),
      // Counted from the work itself, so the number and the list under it cannot disagree.
      blocking: fork.blocks.length,
      blocks: fork.blocks,
      fields: fork.fields,
      unreadable: fork.unreadable,
      chip: optionChip(fork.options, { written: fork.recommendationWritten, namesAnOption: fork.namesAnOption }),
      waited: waited.long,
      waitedShort: waited.short,
      createdAt: fork.createdAt,
      because: fork.because,
    }
  })
}

/** Blank counts as nothing written. A field holding three spaces is not a line somebody wrote. */
function said(text: string | null): string | null {
  if (text === null) return null
  const trimmed = text.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * ABOUT A LINE OF THE FORK, FOR A ROW THAT IS NOT OPEN.
 *
 * The question is what the person is being asked, so it goes first. The author's summary stands in
 * when the record states no question. Neither is cut: the row clamps what it draws with CSS and the
 * whole of it is one press away.
 */
export function ledeOf(question: string | null, summary: string | null): string | null {
  return said(question) ?? said(summary)
}

/**
 * THE AUTHOR'S OWN LINE, ONLY WHERE IT SAYS SOMETHING THE QUESTION DOES NOT.
 *
 * Equal after trimming, or wholly inside the question, means one sentence printed twice — which is
 * what an open card did, word for word, measured at 1440 on 27 August 2026. Anything else is two
 * pieces of writing and both are kept.
 */
export function summaryAdds(question: string | null, summary: string | null): string | null {
  const line = said(summary)
  const ask = said(question)
  if (line === null) return null
  if (ask === null) return line
  return ask === line || ask.includes(line) ? null : line
}

/** The counts the head line prints. Counted once here, so two variants cannot disagree. */
export interface DecisionTally {
  total: number
  /** How many carry a written recommendation. Somebody had a view on this many. */
  recommended: number
  /** How many of those name an option Mole Office can act on. Always at most `recommended`. */
  namingAnOption: number
  /** How many are holding other work up. The server's own count, summed. */
  blocking: number
  /** Which projects these span. The queue is deliberately not scoped to one. */
  projects: string[]
}

export function tallyDecisions(rows: readonly Decision[]): DecisionTally {
  return {
    total: rows.length,
    recommended: rows.filter((row) => row.recommendationWritten).length,
    namingAnOption: rows.filter((row) => row.namesAnOption).length,
    blocking: rows.filter((row) => row.blocking > 0).length,
    projects: [...new Set(rows.map((row) => row.workspaceId))],
  }
}

// ============================================================================ what you decided

/**
 * HOW LONG A DECISION STAYS ON HOME, in days.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THERE IS A WINDOW AT ALL, WHICH IS THE OWNER'S OWN COMPLAINT AND ITS OPPOSITE
 * ---------------------------------------------------------------------------------------
 *
 * The owner settled their first fork and then could not find it: *"it just disappeared and it is
 * difficult to review it or change my mind"*. A fork leaving the queue the moment it is settled is
 * right — nothing is waiting on anybody — and leaving no trace on the one page they were looking at
 * is not.
 *
 * The opposite mistake is a band that grows a permanent list of everything ever decided, on the page
 * whose whole job is what needs you NOW. So a decision is drawn here for a week, and the way to all
 * of them — the decisions page — is on the band whether anything is inside the window or not.
 */
export const DECIDED_WINDOW_DAYS = 7

/** How many decisions the band draws. What the cap cuts is stated under them, exactly. */
export const DECIDED_SHOWN = 3

/**
 * ONE DECISION A PERSON HAS MADE, with the phrases a card prints already worked out.
 *
 * It is the server's `DecidedRecord` — every decision in every project, not only the ones filed
 * against a fork. Five of the eight in this corpus answer no proposal at all, and until the
 * projection carried the second kind they were on no Home surface.
 */
export interface Decided extends DecidedRecord {
  /** "2d", "< 1d" — the same short form the waiting cards carry. */
  agoShort: string
  /** "Filed 2 days ago". The whole phrase, for the tooltip and the screen reader. */
  ago: string
  /**
   * WHAT WAS TAKEN, in one line, or null when the decision does not say.
   *
   * The record's own `option_taken`. It is not worked out from anything and it is never matched
   * back against the fork's options — see `whatWasTaken` in Governance.tsx for why the words are
   * shown and never used to identify an option.
   */
  taken: string | null
  /** True when the decision took none of the fork's recorded options and wrote its own answer. */
  ownAnswer: boolean
}

/** What the band draws about what you have decided, and what it deliberately leaves out. */
export interface DecidedRead {
  /** What the band draws: inside the window, newest first, at most `DECIDED_SHOWN`. */
  shown: Decided[]
  /** How many are inside the window. */
  recent: number
  /** Every decision the server sent, however old. */
  total: number
}

/**
 * The decisions worth drawing on Home, and the count of every one there is.
 *
 * `total` is not decoration: a band that showed two of nine with nothing saying so is a band a
 * reader has no reason to distrust and every reason to. It is what the way-out line is counted from.
 */
export function readDecided(decisions: readonly DecidedRecord[], now: number): DecidedRead {
  const cut = DECIDED_WINDOW_DAYS * 24 * 60 * 60 * 1000
  const recent = readEveryDecided(decisions, now).filter((decision) => {
    const at = parseLocalStamp(decision.createdAt)
    // A stamp Mole Office cannot read is NOT quietly dropped: it is kept, and the age beside it says it
    // cannot be dated. Dropping it would make "6 decided, 1 recent" arithmetic about a row nobody
    // can see.
    return at === null || now - at <= cut
  })
  return { shown: recent.slice(0, DECIDED_SHOWN), recent: recent.length, total: decisions.length }
}

/**
 * NEWEST FIRST, BY WHEN THE DECISION WAS FILED.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE ORDER IS SETTLED HERE AND NOT LEFT TO THE ORDER THE SERVER SENT
 * ---------------------------------------------------------------------------------------
 *
 * The newest fork was at the bottom of the list. `readForks` on the server does sort these newest
 * first, and this reading kept whatever order it was handed. So the page was right only because
 * something else happened to be right, and a change to that sort would have turned the page round
 * with nothing failing. The surface that draws the list now says what its order is.
 *
 * ---------------------------------------------------------------------------------------
 * BY THE FILING STAMP, WHICH EVERY DECISION HAS
 * ---------------------------------------------------------------------------------------
 *
 * `createdAt` is the day the decision was filed and is on every record. `decidedOn` is the day the
 * person says the choice was made, it is optional, and it is often a day or two earlier — so
 * ordering by it would sort half the list by one fact and half by another. The card draws
 * `decidedOn` where it exists, so nothing is hidden by ordering on the other one. This is the same
 * rule `readForks` states, for the same reason.
 *
 * A STAMP MOLE OFFICE CANNOT READ IS NOT GIVEN A DATE. It goes last, and it is kept: the card beside
 * it already says it cannot be dated, and dropping it would make the count above the list
 * arithmetic about a row nobody can see.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING IS PINNED ABOVE THE REST, BECAUSE A DECISION CARRIES NO PIN
 * ---------------------------------------------------------------------------------------
 *
 * `pinned` is the owner's own mark and it is declared on the `proposal` kind alone — a fork the owner
 * says matters more than its other facts say. A decision has no such field and `DecidedRecord`
 * carries none, so there is nothing to put above the rest and this orders by time only. The owner's pin
 * does order the queue of forks still waiting on the owner, which is where it is declared.
 */
export function newestFirst(a: Decided, b: Decided): number {
  const at = parseLocalStamp(a.createdAt)
  const bt = parseLocalStamp(b.createdAt)
  if (at === null && bt === null) return a.recordId.localeCompare(b.recordId)
  if (at === null) return 1
  if (bt === null) return -1
  // The id last, so two decisions filed in the same second cannot swap places between two draws.
  return bt - at || a.recordId.localeCompare(b.recordId)
}

/**
 * EVERY DECISION, WHATEVER ITS AGE, with the same phrases on it — what the decisions page draws.
 *
 * The window and the cap above are Home's, because Home is about what needs you now. The page whose
 * whole job is the history has neither. What both surfaces share is THIS: how a stored decision
 * becomes the words on a card, and the order they are drawn in. Working either out twice is how one
 * surface comes to say "None of the options" about a decision the other draws as an ordinary one,
 * with nothing failing.
 */
export function readEveryDecided(decisions: readonly DecidedRecord[], now: number): Decided[] {
  return decisions
    .map((decision) => {
      const aged = waitedOf(decision.createdAt, now)
      return {
        ...decision,
        agoShort: aged.short,
        ago: aged.age === null ? aged.long : t('home.filedAgo', { days: aged.age }),
        taken: decision.optionTaken === null || decision.optionTaken.trim() === '' ? null : decision.optionTaken,
        // NONE OF THE RECORDED OPTIONS, which is a real stored answer and not a gap: words with no
        // position are how §38 says "I took none of these, here is what I am doing instead".
        ownAnswer: decision.optionIndex === null && decision.optionTaken !== null && decision.question !== null,
      }
    })
    .sort(newestFirst)
}

/**
 * The props the waiting cards are handed, identically, by Home and by the decisions page.
 *
 * There is no second shape. A surface that needed a field this does not carry would be reading
 * these records a second way, and the two readings would answer differently the day one changed.
 */
export interface DecisionsViewProps {
  rows: readonly Decision[]
  tally: DecisionTally
  /** The project the browser is looking at, so a card can say when a fork is somewhere else. */
  here: string
  /** Open the fork's whole record. The parent carries the reader across the project boundary. */
  onOpen: (row: Decision) => void
  /**
   * Read the band again, after something about it has changed.
   *
   * A settled fork has to leave the waiting cards and appear under what you decided, and that is
   * the server's reading rather than the browser's: a browser that crossed a fork off its own list
   * would be a second answer to a governance question.
   */
  onSettled: () => void
  /** True in Inspect. Ids, the project key and the server's own sentence appear only then. */
  inspect: boolean
}
