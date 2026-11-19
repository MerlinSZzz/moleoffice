// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHY A ROUND ENDED WITHOUT A SEAL, AND WHAT A RUN'S LAST MESSAGE SAYS ABOUT ITS SEAL. Wave 13j round loop-1; quotations
 * are not read since the round after the window close, and sentences about another run since the launcher-notices round
 * (problem Rg6Wt8oUDYDi). The writer is ./how-a-round-ended.ts, which reads the facts; this
 * file only judges them, and opens no database and no git.
 *
 * Every reason is a fact the office read: the process's exit, the run's commits, the reports linked to it, its last
 * message to its starter, and the folder it was filed in. None is a guess about what the agent meant. When the office
 * finds none of them, it says the run was not sealed and gives the launcher's own words (`not-sealed`). Since 13s round 74,
 * a done round, "the seal follows this message" and "my run seals" are read as sealing, and "before I seal" is not. A done
 * round is read as sealing only when no sentence of its message speaks of the seal in other words.
 */
import type { AReasonForNoSeal } from '@shared/how-the-round-ended.ts'
import { enWave14c } from '@shared/words/en-wave-14c.ts'
import type { SessionState } from '@shared/types.ts'

/** What a run's message to its starter says about its seal. */
export type WhatAMessageSaysAboutTheSeal = 'it-seals' | 'it-will-not-seal' | 'it-does-not-say'

// The writer about itself: "I will not seal", "I won't seal", "I am not sealing", "I do not seal", "I cannot seal".
const I_WILL_NOT_SEAL =
  /\b(?:(?:i|we)(?:'ll|’ll| will| shall| do| am| are|'m|’m)?\s+(?:not|never)\s+(?:be\s+)?seal(?:ing)?|(?:i|we)\s+(?:won't|won’t|don't|don’t|can't|can’t|cannot|will\s+not|shall\s+not|do\s+not|am\s+not|are\s+not)\s+(?:be\s+)?seal(?:ing)?)/iu
// About whichever run the sentence is about: "not sealing", "no seal this round", "without a seal", "stopping before the seal".
// "No seal" right after refuse, block, stop or prevent says what a thing lets through, not that a run stops: "A fault of
// form refuses no seal" held the check of a message that said "I seal next" (the 12 November case).
const NO_SEAL =
  /\b(?:not\s+sealing|(?<!\b(?:refus(?:e|es|ed|ing)|block(?:s|ed|ing)?|stop(?:s|ped|ping)?|prevent(?:s|ed|ing)?)\s+)no\s+seal\b|without\s+(?:a\s+)?seal(?:ing)?\b|stop(?:ping)?\s+before\s+the\s+seal)/iu
// The writer about itself: "I seal next", "I will seal", "I'll seal", "I am sealing", "then I seal".
const I_SEAL = /\b(?:i|we)(?:'ll|’ll| will| shall| now| am| are|'m|’m| am going to| then)?\s+seal(?:ing)?\b/iu
// About whichever run the sentence is about: "sealing now", "seal last".
const SEALING_NOW = /\b(?:sealing\s+(?:now|next|last)\b|seal(?:ing)?\s+(?:now|next|last)\b)/iu
// About the seal rather than the writer: "the git seal follows this message".
const THE_SEAL_FOLLOWS_THIS_MESSAGE = /\bseal\s+follows\s+this\s+message\b/iu
// A run named as this one, sealing after the message: "my run seals right after this message".
const THIS_RUN_SEALS = /\b(?:this|my|our|the)\s+run\s+seals\s+(?:(?:right\s+)?after\s+this\s+message|now|next|last)\b/iu
// A round named and finished: "Round 72 is done", "Round 71 (choice B) is done".
const A_ROUND_IS_DONE = /\bround\s+[\w.-]+(?:\s+\([^)\n]*\))?\s+is\s+done\b/iu
// What comes first, not a seal: "before I seal", "before sealing", "before the seal".
const BEFORE_THE_SEAL = /\bbefore\s+(?:(?:i|we)\s+seal|sealing|the\s+seal)\b/iu
// Any word that holds "seal": seal, seals, sealed, sealing, unsealed.
const A_SEAL_WORD = /seal/iu
// A sentence that says "run", and the words that make that run this one: "That run stopped with no seal" is another run's.
const A_RUN = /\bruns?\b/iu
const THIS_RUN = /\b(?:this|my|our|the)\s+run\b/iu
// A clause that makes what follows a condition: "If main has moved, I will not seal" is not a stop.
const A_CONDITION = /\b(?:if|unless|when|whenever|until|once|in case|should)\b/iu
// Words the agent quotes rather than says: straight or curly double quotes, or backticks, on one line. Since the 12
// November step name a run quoted, straight or curly single quotes within one sentence as well. A straight single quote
// opens a quotation only where no letter or digit stands before it and closes one only where none stands after it, so
// the apostrophes of "I won't seal" and "the tests' check" open none.
const A_QUOTATION = /"[^"\n]*"|“[^”\n]*”|`[^`\n]*`|(?<![\p{L}\p{N}])'(?!\s)[^'\n.!?;]*(?<!\s)'(?![\p{L}\p{N}])|‘[^’\n.!?;]*’(?![\p{L}\p{N}])/gu

/**
 * THE MESSAGE WITH EVERY QUOTATION BLANKED, so nothing inside one is read as the agent's own words: the 15 October case,
 * where a message that said "I seal next" quoted the office's title "A round ended without a seal" and its check was held.
 * Each quoted character becomes one "…", so a sentence found in the blanked text has the same place in the message.
 */
function withoutQuotations(body: string): string {
  return body.replace(A_QUOTATION, (quoted) => '…'.repeat(quoted.length))
}

/**
 * The message's sentences, split after . ! ? ; and at line ends, never inside a quotation. `said` is the sentence as the
 * agent wrote it; `read` is the same sentence with its quotations blanked, which is the text the office reads.
 */
function sentencesOf(body: string): { said: string; read: string }[] {
  const blanked = withoutQuotations(body)
  const sentences: { said: string; read: string }[] = []
  let from = 0
  for (const end of blanked.matchAll(/(?<=[.!?;])\s+|\n+|$/gu)) {
    const piece = blanked.slice(from, end.index)
    const read = piece.trim()
    if (read !== '') {
      const start = from + piece.length - piece.trimStart().length
      sentences.push({ said: body.slice(start, start + read.length), read })
    }
    from = end.index + end[0].length
  }
  return sentences
}

/**
 * WHETHER A SENTENCE IS ABOUT A RUN THAT IS NOT THIS ONE: it says "run" or "runs", and not "this run", "my run", "our run",
 * "the run" or this run's own id. Only a sentence with no "I" or "we" in its seal words is asked this. A round that
 * continues a stopped run names that run, and "That run stopped at 15:31 on the login's weekly limit (429) with no seal."
 * held the check of a message that also said "I seal next" (the 17 October case, problem Rg6Wt8oUDYDi). "The run" counts
 * as this one: when the words do not say which run, the office reads them as the writer's, which holds the check.
 */
function itIsAboutAnotherRun(read: string, runId: string): boolean {
  return A_RUN.test(read) && !THIS_RUN.test(read) && !read.includes(runId)
}

/** Whether a sentence says this run will not seal: "I will not seal", or "no seal" with no other run named. */
function itSaysThisRunWillNotSeal(read: string, runId: string): boolean {
  return I_WILL_NOT_SEAL.test(read) || (NO_SEAL.test(read) && !itIsAboutAnotherRun(read, runId))
}

/**
 * Whether a sentence says this run seals: "I seal next", "the seal follows this message" or "my run seals" with no other
 * run named. "Before I seal" says what comes first, not that the run seals.
 */
function itSaysThisRunSeals(read: string, runId: string): boolean {
  if (BEFORE_THE_SEAL.test(read)) return false
  return (
    I_SEAL.test(read) ||
    (SEALING_NOW.test(read) && !itIsAboutAnotherRun(read, runId)) ||
    (THE_SEAL_FOLLOWS_THIS_MESSAGE.test(read) && !itIsAboutAnotherRun(read, runId)) ||
    (THIS_RUN_SEALS.test(read) && !itIsAboutAnotherRun(read, runId))
  )
}

/**
 * Whether a sentence says this run's round is done: "Round 72 is done" with no condition, no other run and no refusal to
 * seal. "When round 74 is done, I will write again" is a plan, and "In that run, round 70 is done" is another run's round.
 */
function itSaysItsRoundIsDone(read: string, runId: string): boolean {
  return (
    A_ROUND_IS_DONE.test(read) &&
    !A_CONDITION.test(read) &&
    !itIsAboutAnotherRun(read, runId) &&
    !itSaysThisRunWillNotSeal(read, runId)
  )
}

/**
 * THE SENTENCE IN WHICH RUN `runId`'S MESSAGE SAYS IT WILL NOT SEAL, as the agent wrote it, or null. A negation inside a
 * sentence that carries a condition (if, unless, when, until, once, in case, should) is a condition and not a stop, so "If
 * main has moved, I will not seal" says nothing alone (the 8 October case, 13s round 30b). Words in a quotation are not
 * read. Only what the run says about itself is read: a sentence about another run's seal is not this run stopping.
 */
export function theSentenceThatSaysItWillNotSeal(body: string, runId: string): string | null {
  return sentencesOf(body).find((one) => itSaysThisRunWillNotSeal(one.read, runId) && !A_CONDITION.test(one.read))?.said ?? null
}

/**
 * WHAT RUN `runId`'S MESSAGE SAYS ABOUT ITS SEAL. A sentence that says this run will not seal anywhere wins: the agent said
 * it stops. Otherwise a sentence that says this run seals ("I seal next", "the seal follows this message", "my run seals"),
 * and does not also say it will not, is the message saying it seals. A message that asks nothing and has a sentence saying
 * its round is done also says it seals, unless any of its sentences speaks of the seal: no sentence was read as sealing, so
 * that one says something else about the seal, such as "The seal does not follow this message" or "Before I seal, the check
 * must pass". The office does not try to tell which, and does not read it as sealing. A message that asks a question is
 * waiting for an answer. Quotations and sentences about another run are read in neither case.
 */
export function whatAMessageSaysAboutTheSeal(body: string, runId: string): WhatAMessageSaysAboutTheSeal {
  if (theSentenceThatSaysItWillNotSeal(body, runId) !== null) return 'it-will-not-seal'
  if (sentencesOf(body).some((one) => itSaysThisRunSeals(one.read, runId) && !itSaysThisRunWillNotSeal(one.read, runId))) return 'it-seals'
  if (
    !itAsksSomething(body) &&
    !sentencesOf(body).some((one) => A_SEAL_WORD.test(one.read)) &&
    sentencesOf(body).some((one) => itSaysItsRoundIsDone(one.read, runId))
  )
    return 'it-seals'
  return 'it-does-not-say'
}

/** Whether a message asks its reader something: a question mark outside a quotation or a path. */
export function itAsksSomething(body: string): boolean {
  return /\?(?:\s|$)/u.test(withoutQuotations(body))
}

/** The words that give back the sentence the office read as a stop, so the starter sees at once what was read. */
export function whereTheOfficeReadAStop(sentence: string): string {
  return `The office read it from this sentence: "${sentence}"`
}

/** The words a run writes on a line of its own when its seal is not for a check. */
export const NOT_FOR_A_CHECK = 'not for a check'
/** The words that begin the line in which a run says its whole feature is done, so its seal asks for a check. */
export const FEATURE_READY = 'FEATURE READY:'
// The line alone, in any case: bare or in backticks, with or without a full stop.
const A_NOT_FOR_A_CHECK_LINE = new RegExp(`^(?:\`${NOT_FOR_A_CHECK}\\.?\`|\`${NOT_FOR_A_CHECK}\`\\.|${NOT_FOR_A_CHECK}\\.?)$`, 'iu')

/** What a run's last message to its starter says that decides its seal, read before the run's packages and repairs. */
export type WhatAMessageSaysAtTheSeal =
  | { says: 'it-will-not-seal'; sentence: string }
  | { says: 'not-for-a-check'; line: string }
  | { says: 'feature-ready' }
  | { says: 'nothing' }

/**
 * WHAT RUN `runId`'S MESSAGE SAYS THAT DECIDES ITS SEAL, in this order. A sentence that says it will not seal wins, whatever
 * else the message says. Then a line whose words are exactly "not for a check", in any case, with or without backticks and
 * a full stop. Then a line that begins with "FEATURE READY:", in capitals, bare or after a backtick, as a brief writes it.
 * Each line is read trimmed, and a line that only quotes the words, in quotation marks or after >, is not one of them.
 */
export function whatAMessageSaysAtTheSeal(body: string, runId: string): WhatAMessageSaysAtTheSeal {
  const sentence = theSentenceThatSaysItWillNotSeal(body, runId)
  if (sentence !== null) return { says: 'it-will-not-seal', sentence }
  const lines = body.split('\n').map((line) => line.trim())
  const line = lines.find((one) => A_NOT_FOR_A_CHECK_LINE.test(one))
  if (line !== undefined) return { says: 'not-for-a-check', line }
  if (lines.some((one) => one.startsWith(FEATURE_READY) || one.startsWith(`\`${FEATURE_READY}`))) return { says: 'feature-ready' }
  return { says: 'nothing' }
}

/**
 * THE WORDS OF A HOLD FOR A ROUND THAT MET NONE OF THE CASES THAT ASK FOR A CHECK. They name each case, so the starter
 * reads what the round would have needed. `starter` is false when nobody is recorded as the run's starter.
 */
export function theHoldOfARoundWithNoCaseSays(starter: boolean): string {
  return (
    `The run handed back no package, wrote no line beginning ${FEATURE_READY}, was not started as a repair, and wrote no line saying ${NOT_FOR_A_CHECK}. ` +
    'So the office asked for no check. ' +
    (starter ? 'The starter can release the check.' : "Nobody is recorded as the run's starter, so the person or a secretary can release it.")
  )
}

/** The words of the account of round `runId`, whose last message `message` says not for a check on its line `line`. */
export function theRoundNotForACheckSays(runId: string, message: string, line: string): string {
  return (
    `Run ${runId}'s last message to its starter, ${message}, has a line of its own that says ${NOT_FOR_A_CHECK}: "${line}". ` +
    'So the office asked for no check, and it did not put the round in the merge queue. The next round is still asked for, as at any seal.'
  )
}

/** Every fact the office reads about a run whose round ended without a seal. */
export interface TheFactsAtTheEnd {
  runId: string
  /** The run's state now: running, crashed, orphaned or paused, or `unknown` when the run holds no state word. */
  state: SessionState
  /** The launcher's account of how the command ended, or null when nothing recorded it. */
  commandEnded: { code: number | null; signal: string | null } | null
  /** How many commits the run made since it started, or why git could not be read. */
  commits: number | { couldNotRead: string }
  /** Reports linked `about` the run. */
  reportsAboutTheRun: string[]
  /** Reports this run filed that are not linked about it, each with the record it is linked to instead, if any. */
  reportsElsewhere: { report: string; linkedTo: string | null }[]
  /** The run's newest message to its starter, or null when it wrote none. */
  lastMessage: { id: string; body: string } | null
  /** The folder the run was filed in, and the folder it names now. */
  folder: { filedIn: string | null; now: string | null }
  /** The fork base the run's branch was read at, and the bases the office lists as stale. */
  forkBase: string | null
  staleBases: string[]
  /** The run's own `detail` now, which the launcher writes when it ends a run. */
  detail: string | null
}

/** The reasons, in the order a starter would act on them: the process first, then the work, then the words. */
export function whyTheRoundEndedWithoutASeal(facts: TheFactsAtTheEnd): AReasonForNoSeal[] {
  const reasons: AReasonForNoSeal[] = []
  const ended = facts.commandEnded
  const cleanExit = ended !== null && ended.code === 0 && ended.signal === null
  if ((!cleanExit && facts.state === 'crashed') || (ended !== null && (ended.signal !== null || (ended.code !== null && ended.code !== 0)))) {
    reasons.push({
      why: 'the-process-died',
      says:
        ended === null
          ? 'The run was written crashed, and nothing recorded how its command ended.'
          : ended.signal !== null
            ? `Its command was ended by signal ${ended.signal}.`
            : `Its command exited ${String(ended.code)}.`,
    })
  } else if (facts.state === 'orphaned' && ended === null) {
    reasons.push({ why: 'the-process-died', says: 'The run was written orphaned, and nothing recorded how its command ended: its process was gone.' })
  }
  if (typeof facts.commits === 'number') {
    if (facts.commits === 0) reasons.push({ why: 'no-commits', says: 'The run made no commits after it started.' })
  } else {
    reasons.push({ why: 'commits-not-known', says: `Whether the run made commits is not known: ${facts.commits.couldNotRead}` })
  }
  if (facts.reportsAboutTheRun.length === 0) {
    const elsewhere = facts.reportsElsewhere[0]
    reasons.push(
      elsewhere === undefined
        ? { why: 'no-report', says: 'No report is linked about the run.' }
        : {
            why: 'no-report',
            says:
              `No report is linked about the run. It filed report ${elsewhere.report}, which is linked ` +
              `${elsewhere.linkedTo === null ? 'to nothing' : `to ${elsewhere.linkedTo}`} instead, so nothing waiting on the run sees it.`,
            names: elsewhere.report,
          },
    )
  }
  const message = facts.lastMessage
  if (message !== null) {
    const stop = theSentenceThatSaysItWillNotSeal(message.body, facts.runId)
    if (whatAMessageSaysAboutTheSeal(message.body, facts.runId) !== 'it-seals') {
      reasons.push({
        why: 'stopped-to-ask',
        says:
          stop !== null
            ? `Its last message to its starter, ${message.id}, says it will not seal. ${whereTheOfficeReadAStop(stop)}`
            : itAsksSomething(message.body)
              ? `Its last message to its starter, ${message.id}, asks something and does not say it seals.`
              : `Its last message to its starter, ${message.id}, does not say it seals.`,
        names: message.id,
      })
    }
  }
  if (facts.folder.filedIn !== null && facts.folder.now !== null && facts.folder.filedIn !== facts.folder.now) {
    reasons.push({ why: 'another-folder', says: `The run was filed in ${facts.folder.filedIn}, and it now names ${facts.folder.now}.` })
  }
  if (facts.forkBase !== null && facts.staleBases.includes(facts.forkBase)) {
    reasons.push({ why: 'a-stale-base', says: `Its branch starts from ${facts.forkBase}, which the office lists as a stale base.` })
  }
  if (cleanExit && facts.state === 'crashed' && facts.detail !== null) {
    reasons.push({ why: 'not-sealed', says: `Its command ended and nothing sealed it. The launcher wrote: ${facts.detail}` })
  }
  if (reasons.length === 0) {
    reasons.push({
      why: 'not-sealed',
      says: `Its command ended and nothing sealed it.${facts.detail === null ? '' : ` The launcher wrote: ${facts.detail}`}`,
    })
  }
  return reasons
}

/** What the starter can do, one sentence for each kind of reason found, in the same order. */
export function whatToDoAfterTheseReasons(runId: string, reasons: readonly AReasonForNoSeal[]): string {
  const said = new Set<string>()
  for (const reason of reasons) {
    switch (reason.why) {
      case 'git-being-read':
        said.add(enWave14c['roundEnd.waitForGit'])
        break
      case 'the-process-died':
      case 'commits-not-known':
        said.add(`Read run ${runId}'s finish.log and its worktree, then start the round again or finish it by hand.`)
        break
      case 'no-commits':
        said.add('If the round was meant to change code, start it again; if its work was records, file the report and finish it with a records submission.')
        break
      case 'no-report':
        said.add(
          reason.names === undefined
            ? `File the report and link it with POST /api/links {"fromId":"<report>","toId":"${runId}","type":"about"}.`
            : `Link report ${reason.names} to the run with POST /api/links {"fromId":"${reason.names}","toId":"${runId}","type":"about"}.`,
        )
        break
      case 'stopped-to-ask':
        said.add(`Answer message ${reason.names ?? 'the run wrote'}, then start the round again with the answer.`)
        break
      case 'another-folder':
      case 'a-stale-base':
        said.add("Rebase the round's branch onto the current main in the round's own worktree, then seal it there.")
        break
      case 'not-sealed':
        said.add(`Read run ${runId}'s record and finish.log, then seal it with its tip or start the round again.`)
        break
    }
  }
  return [...said].join(' ')
}

/** The office's one sentence for the starter: the run, and its reasons in one line. */
export function whatTheEndSays(runId: string, title: string, reasons: readonly AReasonForNoSeal[]): string {
  return `Run ${runId} ("${title}") ended without a seal. ${reasons.map((one) => one.says).join(' ')}`
}
