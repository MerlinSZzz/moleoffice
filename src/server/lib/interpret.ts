// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE INTERPRETER: MESSY HUMAN WORDS IN, AN ORGANISED READING OUT — AND NEVER A REPLACEMENT.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE THING THIS MAY NEVER DO
 * ---------------------------------------------------------------------------------------
 *
 * It never touches what somebody wrote. A reading is stored BESIDE the words, in the field
 * `annotation.interpretation`, which `GET /api/kinds` declares as *what Mole Office made of the words,
 * shown beside them and never instead of them*. The words themselves go through the ordinary write
 * path, which refuses to change the body of a comment that has gone to anybody.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE RUNTIME IS, AND WHY IT IS NOT IN THIS FILE
 * ---------------------------------------------------------------------------------------
 *
 * NOTHING UNDER `src/` MAY START A PROCESS. That rule is deliberate: a web server that runs
 * arbitrary commands is a different and much more dangerous product. The runtime that answers on
 * this machine is the Claude Code command, which is a process. So the interpreter cannot live
 * inside the server, and no amount of interface design changes that.
 *
 * Mole Office therefore does what it already does for agent work: IT ASKS, PRECISELY, AND IT VALIDATES,
 * STRICTLY. `askedOf` below builds the whole request — the comments, the words a reading may use,
 * and the shape it has to come back in. Something outside `src/` runs it: `tools/agent-worker.mjs`
 * already spawns the Claude Code command for agent runs, and the same command answers this. The
 * answer comes back through `POST /api/reviews/<id>/organise` and `checkAnswer` refuses anything
 * that is not a reading of exactly these comments.
 *
 * This is the eighth rule with nothing added: humans express intent, something translates it, and
 * Mole Office validates and commits. The strict layer is the only way in, for a person and for an agent.
 *
 * ---------------------------------------------------------------------------------------
 * WHEN NOTHING HAS READ THEM, THAT IS THE ANSWER
 * ---------------------------------------------------------------------------------------
 *
 * There is no mechanical fallback here and there must not be one. A guess made by counting words
 * and dressed as an interpretation is worse than an empty space, because a person cannot tell it
 * from a reading somebody actually made. `NOTHING_HAS_READ_THEM` is the sentence, the comments are
 * shown as they were written, and that is a complete answer.
 */

import { sqlite } from '../db/client.ts'
import {
  ARTEFACTS,
  COMMUNICATION_INTENTS,
  checkOrganised,
  keptSentence,
  type Organised,
  type OrganisedComment,
  type WhatWasHandedOver,
} from '@shared/intent.ts'
import { getRecord, patchRecord, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
// WHERE A COMMENT'S WORDS LIVE, in the one vocabulary that already says it. A type import, so
// nothing is loaded at run time and there is no cycle: lib/reviews.ts calls the functions here.
import type { MemberSource } from './reviews.ts'
// THE ONE TABLE BETWEEN WHAT MOLE OFFICE STORES AND WHAT A PERSON READS. These sentences are drawn under a
// comment in the review pane, so a stored kind may not reach one of them as itself.
import { kindWord } from '@shared/words.ts'
import { sayWhyNotKept, type NotKeptReason } from '@shared/send-plan-words.ts'

/**
 * WHAT MOLE OFFICE SAYS WHEN NOTHING HAS READ A SET OF COMMENTS. It is a complete answer.
 *
 * ONE DECLARATION, because two surfaces say it: the review's own sentence and anything else that
 * has to report an absent reading. Written out twice, the two would drift, and the way that shows
 * up is one screen saying nothing has read them while another shows a reading.
 */
export const NOTHING_HAS_READ_THEM =
  'Nothing has organised these comments yet, so there is no reading of them to show. These are the comments as ' +
  'they were written.'

// ============================================================================ what is handed over

/** One comment, as an interpreter is given it. The words are exactly as they were written. */
export interface CommentToRead {
  id: string
  /** Whether these words are a record of their own or a row of a conversation. */
  source: MemberSource
  /** WHAT THE PERSON WROTE, exactly. */
  body: string
  /** What it was left on, in a sentence a person reads. */
  about: string
  /** The words they had selected, or null when they selected none. */
  quote: string | null
  /**
   * WHO THEY SAID IT WAS FOR, IN THEIR OWN WORDS, or null because they said nothing.
   *
   * HANDED OVER BECAUSE THEY WROTE IT. It was left out of the request at first, and leaving it out
   * meant the interpreter read less than the person had actually written — while being asked who
   * the comment seems to be for. That is discarding information at the one step whose whole purpose
   * is not to. It stays a hint on both sides: nothing routes anything from it.
   */
  theySaidItWasFor: string | null
}

/** Everything an interpreter is asked, ready to hand to a runtime unchanged. */
export interface InterpreterRequest {
  reviewId: string
  workspaceId: string
  /** How many comments are in it. */
  count: number
  /** The comments, in the order they were written. */
  comments: CommentToRead[]
  /** Comments in the review whose words could not be read, so nothing was handed over for them. */
  unreadable: { id: string; says: string }[]
  /** The whole request as one piece of text, which is what a runtime is given. */
  asked: string
  /** What has to come back, as one line of JSON. */
  answerShape: string
  says: string
}

/** The two dimensions, written out from the declarations so the ask cannot drift from the check. */
function vocabulary(): string {
  const intents = COMMUNICATION_INTENTS.map((one) => `  ${one.word} — ${one.means}`).join('\n')
  const artefacts = ARTEFACTS.map((one) => `  ${one.word} — ${one.means}`).join('\n')
  return (
    `WHAT SOMEBODY WANTS TO HAPPEN. Use these words and no others. A comment may carry several.\n${intents}\n\n` +
    `WHAT COULD EXIST AFTERWARDS. Use these words and no others. A comment may carry several.\n${artefacts}\n`
  )
}

/**
 * THE ANSWER SHAPE, written from the same declaration the check reads.
 *
 * One line, because a runtime is asked to end with one line of JSON and a shape spread over ten
 * lines invites something that looks like the shape and is not it.
 */
export const ANSWER_SHAPE =
  '{"comments":[{"commentId":"<the id given above>","reading":"<a sentence or two in plain language>",' +
  '"intents":["<from the first list>"],"artefacts":["<from the second list>"],' +
  '"recipient":"<who it seems to be for, in words — leave this key out when nobody in particular is meant>"}],' +
  '"groups":[{"says":"<what is true of several of them at once>","commentIds":["<id>","<id>"]}]}'

/**
 * WHAT AN INTERPRETER IS ASKED, for a whole collected set at once.
 *
 * THE WHOLE SET AND NOT ONE COMMENT AT A TIME, because the useful things about a review are between
 * the comments: the same complaint written twice, three symptoms of one cause, two comments meant
 * for different people. A reader given one comment at a time cannot see any of them.
 *
 * EVERY COMMENT CARRIES ITS OWN ID INTO THE REQUEST, and the answer has to name them. That is what
 * makes a reading traceable back to the words it came from; a reading that cannot be traced back is
 * the thing this whole phase exists to prevent.
 */
export function askedOf(input: {
  reviewId: string
  workspaceId: string
  comments: readonly CommentToRead[]
  unreadable: readonly { id: string; says: string }[]
}): InterpreterRequest {
  const { reviewId, workspaceId, comments, unreadable } = input
  const lines: string[] = []
  lines.push(
    `Somebody read this project's work and left ${String(comments.length)} comment${comments.length === 1 ? '' : 's'}, ` +
      `each one pointing at a particular thing. They have finished collecting them. Organise what they said.`,
  )
  lines.push('')
  lines.push('THREE RULES, AND THE FIRST ONE MATTERS MOST.')
  lines.push('')
  lines.push(
    '1. Never rewrite what they wrote. Their words are kept exactly as they are and your reading is shown beside ' +
      'them, never instead of them. A person can change your reading, refuse it, or ignore it.',
  )
  lines.push(
    '2. Answer about every comment, once each, using the id given with it. A reading that leaves a comment out ' +
      'loses it at the moment somebody is meant to be reading it.',
  )
  lines.push(
    '3. Say what you cannot work out rather than guessing it. An empty list is a real answer and it means you ' +
      'did not work it out. It is not the same as saying "nothing", which means you looked and there is none.',
  )
  lines.push('')
  lines.push(vocabulary())
  lines.push(
    'NAMING A DECISION IS NOT TAKING ONE. You may say that a comment names a decision somebody has to make. ' +
      'Nothing you say here writes anything: no task is filed, no problem is filed, and Mole Office never writes a ' +
      'decision at all.',
  )
  lines.push('')
  lines.push('WHAT THEY SAID, AND WHAT EACH COMMENT WAS ABOUT:')
  lines.push('')
  for (const [n, comment] of comments.entries()) {
    lines.push(`--- comment ${String(n + 1)} of ${String(comments.length)}, id ${comment.id} ---`)
    lines.push(`It was left on: ${comment.about}`)
    if (comment.quote !== null) lines.push(`They had selected these words: ${comment.quote}`)
    if (comment.theySaidItWasFor !== null) lines.push(`They said it was for: ${comment.theySaidItWasFor}`)
    lines.push('They wrote:')
    lines.push(
      comment.body
        .split('\n')
        .map((line) => `  ${line}`)
        .join('\n'),
    )
    lines.push('')
  }
  if (unreadable.length > 0) {
    lines.push(
      `${String(unreadable.length)} comment${unreadable.length === 1 ? ' is' : 's are'} in this review and could ` +
        `not be read, so ${unreadable.length === 1 ? 'it is' : 'they are'} not above. Do not answer about ` +
        `${unreadable.length === 1 ? 'it' : 'them'}: ${unreadable.map((one) => one.id).join(', ')}.`,
    )
    lines.push('')
  }
  lines.push('Answer with one line of JSON and nothing else, in this shape:')
  lines.push(ANSWER_SHAPE)

  return {
    reviewId,
    workspaceId,
    count: comments.length,
    comments: [...comments],
    unreadable: [...unreadable],
    asked: lines.join('\n'),
    answerShape: ANSWER_SHAPE,
    says:
      `This is what an interpreter is asked about the ${String(comments.length)} comment` +
      `${comments.length === 1 ? '' : 's'} in this review. Nothing here has read them: Mole Office cannot run a ` +
      `runtime itself, because nothing in the server may start a process. Hand \`asked\` to one, and send what ` +
      `comes back to POST /api/reviews/${reviewId}/organise, which refuses anything that is not a reading of ` +
      `exactly these comments.` +
      (unreadable.length === 0
        ? ''
        : ` ${String(unreadable.length)} comment${unreadable.length === 1 ? '' : 's'} in this review could not be ` +
          `read and ${unreadable.length === 1 ? 'was' : 'were'} not handed over.`),
  }
}

// ============================================================================ reading the answer

export type AnswerCheck = { organised: Organised } | { problem: string }

/**
 * IS THIS A READING OF THESE COMMENTS? The check itself is pure and lives in src/shared/intent.ts.
 *
 * This wrapper exists for one reason: the request is what says which comments were handed over, so
 * the caller cannot get that list from anywhere else and cannot disagree with it.
 *
 * `hidden` is the comments the caller may not read. The check still covers them; a refusal does not
 * name them.
 */
export function checkAnswer(raw: unknown, request: InterpreterRequest, hidden: ReadonlySet<string>): AnswerCheck {
  const handedOver: WhatWasHandedOver = {
    ids: request.comments.map((one) => one.id),
    unreadable: request.unreadable.map((one) => one.id),
    hidden: [...hidden],
  }
  return checkOrganised(raw, handedOver)
}

// ============================================================================ keeping it

/** What happened to one comment's reading. */
export interface KeptReading {
  id: string
  /** True when the sentence is now stored beside the words. */
  kept: boolean
  /** The sentence, whether or not it could be stored. */
  sentence: string
  /** Why it could not be stored, or null because it was. */
  says: string | null
  /** The same reason as a code and its values, so a page says it in its own language; null because it was stored. */
  why: NotKeptReason | null
}

export interface KeptReadings {
  readings: KeptReading[]
  /** How many are now stored beside the words they are about. */
  kept: number
  /** How many could not be, which is not the same as how many were not made. */
  notKept: number
}

/**
 * WHERE A READING CAN BE KEPT, AND WHERE IT CANNOT, ASKED OF EACH COMMENT.
 *
 * A comment is a record of kind `annotation` and that record has a field for exactly this. A review
 * carried forward from round seven reads its comments out of `agent_messages` instead, and that
 * table has no such column — so for those comments the reading is made, shown, and NOT stored.
 *
 * MOLE OFFICE SAYS SO PER COMMENT RATHER THAN AVERAGING IT. "Four of five readings were kept" tells a
 * person the count; the row that says which one was not is what tells them whether the one they
 * cared about is coming back tomorrow.
 */
function whereItGoes(id: string, source: MemberSource, workspaceId: string): { keep: true } | { keep: false; says: string; why: NotKeptReason } {
  // THE ENGLISH IS THE COMPOSER'S (src/shared/send-plan-words.ts), so the sentence sent here and the one a page draws in
  // its own language from `why` are one sentence.
  const refused = (why: NotKeptReason): { keep: false; says: string; why: NotKeptReason } => ({ keep: false, says: sayWhyNotKept(why), why })
  if (source === 'conversation') return refused({ key: 'conversation', values: { who: id } })
  const record = getRecord(id)
  if (record === null) return refused({ key: 'noRecord', values: { who: id } })
  if (record.workspaceId !== workspaceId) {
    return refused({ key: 'elsewhere', values: { who: id, where: record.workspaceId, here: workspaceId } })
  }
  if (record.deletedAt !== null) return refused({ key: 'deleted', values: { who: id, at: record.deletedAt } })
  if (record.kind !== 'annotation') return refused({ key: 'notAComment', values: { who: id }, kind: record.kind })
  return { keep: true }
}

/**
 * STORE THE READING BESIDE THE WORDS, IN ONE TRANSACTION.
 *
 * EVERY WRITE IS AN ORDINARY PATCH, with the actor the request carried, so the change log names who
 * put this reading there in the same words as every other edit. There is no second write path here
 * and nothing goes round the validation: `interpretation` is a declared field of the `annotation`
 * kind, and `patchRecord` refuses everything it always refuses.
 *
 * ONE TRANSACTION, because a reading is of a SET. Half a reading stored, with the rest refused,
 * would leave a review where some comments carry a sentence from an answer nobody accepted whole.
 *
 * IT ALSO NEVER TOUCHES `body`, `context` OR `state`. The patch carries one key.
 */
export function keepReadings(
  organised: Organised,
  where: ReadonlyMap<string, MemberSource>,
  workspaceId: string,
  actor: Actor,
): KeptReadings & { wrote: boolean } {
  const planned = organised.comments.map((comment: OrganisedComment) => {
    // ONE COMMENT'S SENTENCE, ABOUT ONE COMMENT. What the reading said about several comments at
    // once is stored on the review by `keepOrganised`, not written into each member here.
    const sentence = keptSentence(comment)
    // NO DEFAULT HERE. `checkAnswer` has already refused any reading naming a comment that was not
    // handed over, so a missing entry means the two calls disagree about which comments those were.
    // Guessing "annotation" would then write a reading onto whatever record happened to share the
    // id, which is the one mistake this whole path exists to make impossible.
    const source = where.get(comment.commentId)
    if (source === undefined) {
      throw new PanelError(
        `Mole Office was asked to keep a reading of ${comment.commentId}, and that comment is not one of the ones it ` +
          `handed over. Nothing has been stored. This is a fault in Mole Office rather than in the reading: the check ` +
          `that accepted it and the list of comments it was checked against have come apart.`,
        500,
      )
    }
    const place = whereItGoes(comment.commentId, source, workspaceId)
    return { comment, sentence, place }
  })

  return sqlite.transaction((): KeptReadings & { wrote: boolean } => {
    let wrote = false
    const readings: KeptReading[] = []
    for (const one of planned) {
      if (!one.place.keep) {
        readings.push({ id: one.comment.commentId, kept: false, sentence: one.sentence, says: one.place.says, why: one.place.why })
        continue
      }
      const result = patchRecord(one.comment.commentId, { dataPatch: { interpretation: one.sentence } }, actor)
      wrote = wrote || result.newSeq !== null
      readings.push({ id: one.comment.commentId, kept: true, sentence: one.sentence, says: null, why: null })
    }
    const kept = readings.filter((r) => r.kept).length
    return { readings, kept, notKept: readings.length - kept, wrote }
  })()
}
