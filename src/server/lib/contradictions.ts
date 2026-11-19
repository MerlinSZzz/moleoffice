// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT MOLE OFFICE HOLDS THAT CONTRADICTS SOMETHING ELSE MOLE OFFICE HOLDS, AND EVERY PROBLEM NOBODY HAS FIXED.
 *
 * ---------------------------------------------------------------------------------------
 * TWO MECHANISMS, ONE COMPUTED AND ONE STRUCTURAL, AND THE SECOND IS THE ONE THAT MATTERS
 * ---------------------------------------------------------------------------------------
 *
 * COMPUTED — the declared checks below. Each compares two durable sources inside Mole Office and answers
 * with both sides' numbers, so a reader sees how far apart they were rather than only that they
 * differed. A CHECK THAT COULD NOT RUN SAYS SO: it returns `passed: null`, never `true`, because
 * "nothing was wrong" and "nobody looked" are different facts.
 *
 * STRUCTURAL — no unfixed problem may be dropped. THE RULE IS *every problem whose state is not
 * `fixed`*, and it is not the narrower *open, or with no state*. Measured in the owner's own corpus
 * on 24 August 2026: of 132 problems, 42 were open, 82 fixed, 2 accepted, 1 worked around, and 5 had
 * no state at all. A section filtering on `state = 'open'` would have dropped every one of the five
 * — four of which are the contradictions this design names by id. A section filtering on *open or
 * absent* would still have dropped the two accepted and the one worked around. Each problem carries
 * its shared state reading, including null when nobody has said. Authoritative main-suite repair
 * outcomes are read by stateOfWork; ordinary absence is never turned into `open`.
 */
import { stateOfWork } from '@shared/work.ts'
import { messagesCarrying } from './dispatch.ts'
import { EVERY_PROJECT } from '@shared/which-projects.ts'
import { listRecords } from './records.ts'
import { sqlite } from '../db/client.ts'
import { commentRecordsIn } from './messages.ts'

/** One check: what it compares, in one plain sentence, and what it answered. */
export interface CheckReading {
  id: string
  says: string
  /** `true`, `false`, or NULL BECAUSE THE CHECK COULD NOT RUN. Never `true` for want of looking. */
  passed: boolean | null
  /** The two numbers it compared, so a reader sees the distance and not only the disagreement. */
  leftN: number | null
  rightN: number | null
  /** Present only when `passed` is null: why nothing could be compared. */
  couldNotRun?: string
}

/** One problem nobody has fixed, with its state exactly as stored. */
export interface UnfixedProblem {
  id: string
  title: string
  /** As stored. NULL means nobody has said, which is not the same as open. */
  state: string | null
}

/** What `contradictionsFor` answers: the checks, and everything not fixed. */
export interface Contradictions {
  checks: CheckReading[]
  problems: UnfixedProblem[]
  /** How many problems the corpus holds in total, so the list's share is readable beside it. */
  ofProblems: number
}

/**
 * A PIPELINE BLOCK WHOSE STATE IS NOT DONE, AGAINST A REPORT LINKED TO IT AND NEWER THAN ITS LAST
 * CHANGE.
 *
 * Found by the recovery that started this campaign, and filed as problem `Bhy7KCOaCxY5`. If a report
 * about a block is newer than the block's own last change, one of the two is out of date and Mole Office
 * holds both as true.
 */
function campaignBlockVsReport(workspaceId: string): CheckReading {
  const blocks = listRecords({ workspaceId, kind: 'block' }).filter((record) => stateOf(record) !== 'done')
  const reports = new Map(listRecords({ workspaceId, kind: 'report' }).map((report) => [report.id, report]))
  // ONLY A REPORT LINKED TO THE BLOCK, by a link in either direction. Until 5 October 2026 this
  // compared each block with every report in the project, so any unfinished block older than the
  // newest report anywhere failed the check, and on a busy office it was always red.
  const linkedTo = sqlite.prepare(
    'SELECT from_id AS other FROM links WHERE to_id = ? UNION SELECT to_id AS other FROM links WHERE from_id = ?',
  )
  const newer = blocks.filter((block) =>
    (linkedTo.all(block.id, block.id) as { other: string }[]).some((row) => {
      const report = reports.get(row.other)
      return report !== undefined && report.updatedAt > block.updatedAt
    }),
  ).length
  return {
    id: 'campaign-block-vs-report',
    says: 'a step that is not finished has a report about it that is newer than the step itself',
    passed: newer === 0,
    leftN: blocks.length,
    rightN: newer,
  }
}

/**
 * ANNOTATION RECORDS MARKED QUEUED, AGAINST THE MESSAGES THAT WERE SUPPOSED TO CARRY THEM.
 *
 * Found by the same recovery, filed as problem `iFHhsB98G-o7`. A comment marked queued with no
 * message built from it is a comment that will never arrive anywhere.
 */
function commentsWithNoQueue(workspaceId: string): CheckReading {
  // BOTH KINDS OF COMMENT: a record of kind `annotation`, and a message that says where it points.
  const queued = commentRecordsIn(workspaceId).filter((record) => stateOf(record) === 'queued')
  // EVERY COMMENT ANY MESSAGE CARRIES, in any project and any state, whether the message carries one
  // comment or several. `messagesCarrying` in lib/dispatch.ts is the one reader of that question.
  const carried = new Set(
    messagesCarrying({ comments: null, which: EVERY_PROJECT, pastQueued: false }).map((row) => row.commentId),
  )
  const orphans = queued.filter((record) => !carried.has(record.id)).length
  return {
    id: 'comments-with-no-queue',
    says: 'a comment is marked as queued to be sent and no message was ever built from it',
    passed: orphans === 0,
    leftN: queued.length,
    rightN: carried.size,
  }
}

/** Every check Mole Office can run today, in the order they were written. */
export const CHECK_IDS = ['campaign-block-vs-report', 'comments-with-no-queue'] as const

/**
 * THE CHECKS, AND EVERY PROBLEM THAT IS NOT FIXED.
 *
 * ONE FUNCTION AND ONE CALL. The bootstrap draws both halves; a scoped continuation read draws the
 * problems only. Two projections of one call, never two computations of one fact.
 *
 * TWO KNOWN CONTRADICTIONS ARE DELIBERATELY NOT CHECKS. A stale repository file and a number written
 * into a report's prose would need the server to read the checkout and to parse English. They stay
 * filed problems and they arrive through the second half of this function, which is exactly why the
 * second half may not filter.
 */
export function contradictionsFor(workspaceId: string): Contradictions {
  const checks: CheckReading[] = []
  for (const id of CHECK_IDS) {
    try {
      checks.push(id === 'campaign-block-vs-report' ? campaignBlockVsReport(workspaceId) : commentsWithNoQueue(workspaceId))
    } catch (err) {
      // A CHECK THAT THREW IS A CHECK THAT COULD NOT RUN, and it says so rather than passing. This
      // is the fifth invariant as an API field: `passed: null` means nobody looked.
      checks.push({
        id,
        says: 'this check could not be run',
        passed: null,
        leftN: null,
        rightN: null,
        couldNotRun: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const all = listRecords({ workspaceId, kind: 'problem' })
  const problems = all
    .filter((record) => stateOf(record) !== 'fixed')
    .map((record) => ({ id: record.id, title: record.title, state: stateOf(record) }))
  return { checks, problems, ofProblems: all.length }
}

/**
 * A problem's shared state reading, or null when no word can be read.
 * Ordinary absence stays absent; the authoritative main-suite namespace supplies its own reading.
 */
function stateOf(record: { data?: unknown }): string | null {
  const state = stateOfWork(record.data)
  return typeof state === 'string' && state !== '' ? state : null
}
