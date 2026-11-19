// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SENTENCES OF A REVIEW'S SEND PLAN, IN THE PAGE'S LANGUAGE, WORKED OUT IN ONE PLACE.
 *
 * Wave 13n's round 33 found them English on Chinese pages (report GMFtAC2grPQg, block b-3): the line under each
 * comment in "Have them read" ("This goes to the run …", "Nobody has been chosen for this comment yet.") and, in
 * developer mode, the plan's own sentence ("Nothing here can be sent as it stands. …"). The server wrote them as
 * English text, so no page could say them in its own language.
 *
 * NOW THE SERVER SENDS WHAT IT FOUND, AS A CODE AND ITS VALUES, beside the English it always sent. Both the English
 * and the page's sentence come from these functions and the word lists: `readStoredWord` reads English under Node,
 * so the server's `says` is the English it always was, and the page's language in a browser, so the review panel
 * draws the same sentence in Chinese on a Chinese page.
 *
 * AND WHAT HAPPENED AFTER A PRESS, wave 13r round 12: the sentence the panel draws after Send (`sayTheSend`, with
 * dispatch's own part, `sayTheDispatch`, which src/server/lib/agents.ts also writes its `note` with) and after a reading
 * is kept (`sayTheKeptReading`). The server sends the facts beside the English, as above. These take a reader of
 * words, `say`, which is `readStoredWord` unless a caller hands another one.
 *
 * WHAT STAYS IN ITS WRITER'S LANGUAGE, said here so nobody takes it for a fault of this file: the titles and names
 * of records, the words a person typed, a path and an error the system reported, and two sentences other readers
 * write that a line quotes whole: why a recipient could not be worked out (the recipient resolver), and why a comment
 * that was deleted is gone (the membership reader). Why a comment is the person's to answer is said from the word for
 * its kind (`THE_REASON_IS_THE_PERSONS`), whose English is the kind declaration's own reason.
 */
import { readStoredWord, type Say, type WordKey } from './i18n.ts'
import { CANNOT_REACH_WORDS } from './messages.ts'
import { A_SAVED_COMMENT_WITH_NOBODY_CHOSEN } from './review-pane-words.ts'
import { kindWord, stateWord } from './words.ts'

/** Why a run can or cannot be picked up again. `why` is `PickUp.why` in src/server/lib/recipients.ts. */
export type PickUpReason =
  | { why: 'never-observed' }
  | { why: 'runtime-unknown'; tool: string }
  | { why: 'transcript-gone'; path: string }
  | { why: 'transcript-unreadable'; error: string }
  | { why: 'transcript-not-a-file'; path: string }
  | { why: 'yes'; tool: string }

/** The reason a run can or cannot be picked up, as one sentence. */
export function sayThePickUp(reason: PickUpReason): string {
  switch (reason.why) {
    case 'never-observed':
      return readStoredWord('sendPlan.pickUp.neverObserved')
    case 'runtime-unknown':
      return readStoredWord('sendPlan.pickUp.runtimeUnknown', { tool: reason.tool })
    case 'transcript-gone':
      return readStoredWord('sendPlan.pickUp.transcriptGone', { path: reason.path })
    case 'transcript-unreadable':
      return readStoredWord('sendPlan.pickUp.transcriptUnreadable', { error: reason.error })
    case 'transcript-not-a-file':
      return readStoredWord('sendPlan.pickUp.notAFile', { path: reason.path })
    case 'yes':
      return readStoredWord('sendPlan.pickUp.yes', { tool: reason.tool })
  }
}

/** Every line a comment's place in the send plan can say. Each is `sendPlan.line.<key>` in the word lists. */
export const SEND_PLAN_LINES = [
  'anAnswer',
  'nobodyChosen',
  'unresolvedWhy',
  'unresolvedNothingKept',
  'unresolvedSaid',
  'unresolvedSaidWhy',
  'agentNotSaid',
  'agentGone',
  'agentElsewhere',
  'agentInAnotherProject',
  'agentNotAnAgent',
  'cannotReach',
  'goesToAgent',
  'goesToNew',
  'runNotSaid',
  'runGone',
  'runElsewhere',
  'runInAnotherProject',
  'runNotARun',
  'runCannotBePickedUp',
  'goesToRun',
  'notAskedForOne',
  'notAskedForMany',
  'alreadyGone',
  'sentWithThisReview',
  'sentWithThisReviewTo',
  'sentWithThisReviewToNew',
  'notReadableInConversation',
  'savedWithNobody',
  'alreadyReached',
  'yoursToAnswer',
  'answeredByThePerson',
  'removedFromTheReview',
] as const

export type SendPlanLineKey = (typeof SEND_PLAN_LINES)[number]

/**
 * ONE LINE OF THE SEND PLAN, AS FOUND: which line, and the values it is said with. `kind` is a record kind and `state`
 * a stored comment state, said in the reader's own words for them; `pickUp` is the reason a run can or cannot be
 * picked up, said by `sayThePickUp`.
 */
export interface SendPlanSentence {
  key: SendPlanLineKey
  values?: Record<string, string | number>
  kind?: string
  state?: string
  pickUp?: PickUpReason
}

/**
 * THE WORD FOR WHY A COMMENT IS THE PERSON'S TO ANSWER, by the kind of record only a person may write. One entry for
 * each artefact whose declaration in src/shared/intent.ts refuses it; a test holds the two to each other.
 */
const THE_REASON_IS_THE_PERSONS: Readonly<Record<string, WordKey>> = {
  decision: 'sendPlan.why.decision',
}

/** One line of the send plan as a sentence, in English on the server and in the page's language on a page. */
export function sayTheLine(line: SendPlanSentence, say: Say = readStoredWord): string {
  const values: Record<string, string | number> = { ...(line.values ?? {}) }
  // THE ONE SENTENCE WAVE 13N'S ROUND 33 ALREADY MOVED TO THE WORD LISTS, read from its key rather than given a second home.
  if (line.key === 'savedWithNobody') return say(A_SAVED_COMMENT_WITH_NOBODY_CHOSEN)
  if (line.key === 'cannotReach') {
    const who = String(values['who'] ?? '')
    return say('sendPlan.line.cannotReach', {
      cannotReach: CANNOT_REACH_WORDS.cannotReach(who),
      ifNobody: CANNOT_REACH_WORDS.whatHappensIfNobodyPresses,
      startNew: CANNOT_REACH_WORDS.startANewAgent,
    })
  }
  // THE REASON A COMMENT IS THE PERSON'S TO ANSWER, said from the word for its kind rather than the English the server
  // put in `why`. The English word reads the artefact's own declaration (src/shared/intent.ts), so the English line is
  // what it always was; a Chinese page says the reason in Chinese.
  if (line.key === 'yoursToAnswer' && line.kind !== undefined) {
    const why = THE_REASON_IS_THE_PERSONS[line.kind]
    if (why === undefined) throw new Error("Nothing says in words why a record of this kind is the person's to answer.")
    values['why'] = say(why)
  }
  if (line.kind !== undefined) values['kind'] = kindWord(line.kind).text
  if (line.state !== undefined) values['state'] = stateWord(line.state).text
  if (line.pickUp !== undefined) values['because'] = sayThePickUp(line.pickUp)
  return say(`sendPlan.line.${line.key}` as WordKey, values)
}

/** What a message to a new agent is addressed to, as a name: "a new agent". */
export function sayANewAgent(): string {
  return readStoredWord('sendPlan.aNewAgent')
}

/** What the whole send plan found, counted, for its one sentence. */
export interface SendPlanFacts {
  state: 'collecting' | 'collected' | 'organised' | 'sent' | 'abandoned'
  going: number
  total: number
  yours: number
  unread: number
  /** Present, and true, on a review stored as sent that still has a comment pressing Send can send. */
  recovery?: true
}

/** The send plan's own sentence: what pressing Send would do, counted, and that asking sent nothing. */
export function sayThePlan(facts: SendPlanFacts): string {
  const staying = facts.total - facts.going
  const parts: string[] = []
  if (facts.state === 'collecting') parts.push(readStoredWord('sendPlan.plan.collecting'))
  if (facts.state === 'sent') parts.push(readStoredWord(facts.recovery === true ? 'sendPlan.plan.sentSomeLeft' : 'sendPlan.plan.sent'))
  if (facts.state === 'abandoned') parts.push(readStoredWord('sendPlan.plan.abandoned'))
  parts.push(
    facts.going === 0
      ? readStoredWord('sendPlan.plan.nothingCanGo')
      : readStoredWord('sendPlan.plan.wouldGo', { going: facts.going, total: facts.total, n: facts.total }),
  )
  if (staying > 0) parts.push(readStoredWord('sendPlan.plan.wouldStay', { n: staying }))
  if (facts.yours > 0) parts.push(readStoredWord('sendPlan.plan.yours', { n: facts.yours }))
  if (facts.unread > 0) parts.push(readStoredWord('sendPlan.plan.unread', { n: facts.unread }))
  parts.push(readStoredWord('sendPlan.plan.nothingSent'))
  return parts.join('')
}

// ============================================================================ what happened after a press

/** Who one share of a sent review went to: a new agent, or a run by its title. */
export type SentTo = { newAgent: true } | { run: string }

/** What dispatch did, counted, for its sentence. */
export interface DispatchFacts {
  /** How many comments the press carried. */
  total: number
  /** How many of them had already reached their agent before this press. */
  alreadyGone: number
  /** How many agents the comments were grouped for, counting a group whose comments had all gone already. */
  agents: number
  /** Who got how many new comments, in the order dispatch wrote them; a group with none new is left out. */
  shares: { to: SentTo; comments: number }[]
  /** Every comment that stayed behind, and why, as the line under it says. */
  held: { quotedBody: string; messageId: string; sentence: SendPlanSentence }[]
}

/** What dispatch did, as one sentence, then a line for each comment that stayed behind. */
export function sayTheDispatch(facts: DispatchFacts, say: Say = readStoredWord): string {
  const nothingNew = facts.alreadyGone === facts.total
  const shares = facts.shares
    .map((share) =>
      say('sendPlan.sent.share', {
        n: share.comments,
        who: 'newAgent' in share.to ? say('sendPlan.aNewAgent') : say('sendPlan.sent.run', { title: share.to.run }),
      }),
    )
    .join(say('sendPlan.sent.between'))
  const before = facts.alreadyGone === 0 ? '' : say('sendPlan.sent.alreadyGone', { n: facts.alreadyGone })
  const went = facts.held.length > 0 && facts.shares.length === 0 && facts.alreadyGone === 0
    ? say('review.delivery.noneSent')
    : nothingNew
    ? say('sendPlan.sent.nothingNew', { n: facts.total })
    : facts.agents === 1
      ? say('sendPlan.sent.toOne', { shares }) + before
      : say('sendPlan.sent.toMany', { agents: facts.agents, shares }) + before
  if (facts.held.length === 0) return went
  const lines = facts.held.map((one) =>
    say('sendPlan.sent.heldLine', { quoted: one.quotedBody, id: one.messageId, why: sayTheLine(one.sentence, say) }),
  )
  return `${went}${say('sendPlan.sent.held', { n: facts.held.length })}\n${lines.join('\n')}`
}

/** What a review's Send did: dispatch's part, the comments that are the person's to answer, and where the review stands. */
export interface SendFacts {
  dispatch: DispatchFacts
  /**
   * The comments held back because they are the person's to answer. `takenOut` marks one the person took out of what
   * the review waits for, with "I answer this myself": it stays here, and the review does not wait for it.
   */
  yours: { quotedBody: string; id: string; takenOut?: true }[]
  /** How many comments the press asked for by name, or null when it sent the whole review. */
  askedFor: number | null
  /** How many comments in the review the press did not ask for. */
  notAskedFor: number
  /** Whether the review is marked sent now. */
  reviewSent: boolean
}

/** The sentence after Send, in English on the server and in the page's language on a page. */
export function sayTheSend(facts: SendFacts, say: Say = readStoredWord): string {
  const parts = [sayTheDispatch(facts.dispatch, say)]
  if (facts.yours.length > 0) {
    const list = facts.yours
      .map((one) => say('sendPlan.sent.yoursItem', { quoted: one.quotedBody, id: one.id }))
      .join(say('sendPlan.sent.between'))
    parts.push(`\n${say('sendPlan.sent.yours', { n: facts.yours.length, list })}`)
  }
  if (facts.notAskedFor > 0) {
    parts.push(
      `\n${
        facts.askedFor === 1
          ? say('sendPlan.sent.notAskedForAfterOne', { n: facts.notAskedFor })
          : say('sendPlan.sent.notAskedForAfterMany', { n: facts.notAskedFor, asked: facts.askedFor ?? 0 })
      }`,
    )
  }
  // A COMMENT THE PERSON TOOK FOR THEMSELVES IS NOT WAITED FOR, so a review sent with only those left says it is sent
  // and that they stayed here.
  parts.push(
    facts.dispatch.held.length > 0 || facts.yours.some((one) => one.takenOut !== true)
      ? say('review.delivery.stillWaiting')
      : facts.reviewSent
      ? facts.yours.length === 0
        ? say('sendPlan.sent.reviewSent')
        : say('sendPlan.sent.reviewSentYoursStayed', { n: facts.yours.length })
      : say('sendPlan.sent.reviewNotSent'),
  )
  return parts.join('')
}

/** What a press that took a comment out of a review did: which press, and how many comments the review still waits for. */
export interface TakeOutFacts {
  press: 'answered' | 'removed'
  waiting: number
}

/** The sentence after "I answer this myself" or "Remove from this review", in English on the server and in the page's language on a page. */
export function sayTheTakeOut(facts: TakeOutFacts, say: Say = readStoredWord): string {
  return (
    say(facts.press === 'answered' ? 'review.takeOut.answered' : 'review.takeOut.removed') +
    (facts.waiting === 0 ? say('review.takeOut.nothingWaits') : say('review.takeOut.stillWaits', { n: facts.waiting }))
  )
}

/**
 * WHY ONE READING COULD NOT BE STORED BESIDE ITS COMMENT, as found: which reason, and the values it is said with. `who`
 * names the comment: its id on the server, its own words on a page. `kind` is a record kind, said in the reader's words.
 */
export const NOT_KEPT_REASONS = ['conversation', 'noRecord', 'elsewhere', 'deleted', 'notAComment'] as const
export interface NotKeptReason {
  key: (typeof NOT_KEPT_REASONS)[number]
  values: Record<string, string>
  kind?: string
}

/** Why one reading could not be stored, in English on the server and in the page's language on a page. */
export function sayWhyNotKept(why: NotKeptReason, say: Say = readStoredWord): string {
  const values: Record<string, string> = { ...why.values }
  if (why.kind !== undefined) values['kind'] = kindWord(why.kind).text
  return say(`sendPlan.notKept.${why.key}` as WordKey, values)
}

/** What keeping a reading did, counted, for its sentence. */
export interface KeptReadingFacts {
  /** How many comments the reading was about. */
  comments: number
  /** How many things it found true of several comments at once. */
  groups: number
  /** How many readings are now stored beside their words. */
  kept: number
  /** How many could not be stored. */
  notKept: number
}

/** The sentence after a reading is kept, in English on the server and in the page's language on a page. */
export function sayTheKeptReading(facts: KeptReadingFacts, say: Say = readStoredWord): string {
  return (
    say('sendPlan.kept.accepted', { n: facts.comments }) +
    // NOTHING ABOUT "SEVERAL" FOR ONE COMMENT: one comment has nothing in common with others (report cu3k8UH1DiRT).
    (facts.comments < 2 ? '' : facts.groups === 0 ? say('sendPlan.kept.noGroups') : say('sendPlan.kept.groups', { n: facts.groups })) +
    // WHEN NONE COULD BE STORED, ONE SENTENCE SAYS SO AND SAYS WHERE THE REASONS ARE, rather than a second sentence
    // counting the same failures again.
    (facts.kept > 0
      ? say('sendPlan.kept.stored', { n: facts.kept }) + (facts.notKept === 0 ? '' : say('sendPlan.kept.notKept', { n: facts.notKept }))
      : say('sendPlan.kept.noneStored')) +
    say('sendPlan.kept.nothingFiled')
  )
}
