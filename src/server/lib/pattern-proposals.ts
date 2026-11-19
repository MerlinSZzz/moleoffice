// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CROSSED PATTERN BECOMES A PROPOSAL FOR THE PERSON, NEVER A CHANGE, AND NEVER TWICE.
 *
 * Criterion I5. The usage layer already sees when something crosses a threshold — an operation
 * called five times inside one stretch, a read whose median reply is 100 KB, ten refusals of the
 * same operation in a week, the same question met outside Mole Office in three separate traces,
 * something polling with nothing changing. What it did not do is anything about it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A PROPOSAL AND NOT A ROUTE
 * ---------------------------------------------------------------------------------------
 *
 * Because a crossed threshold is evidence that a route might be worth building, not evidence that
 * it should exist. The skill's rule is *you propose; the human decides*, and a measurement layer
 * that quietly added an endpoint because a counter passed five would be that rule broken by the
 * one part of the product built to watch it.
 *
 * ---------------------------------------------------------------------------------------
 * ONCE PER CROSSING, AND THE MARK IS THE PROPOSAL ITSELF
 * ---------------------------------------------------------------------------------------
 *
 * There is no table of "patterns already proposed". The proposal carries `source` set to
 * `patternFoundBy(key)`, which is the one declaration of what a record filed from a pattern says
 * it came from, and this reader looks for that before filing anything. So the mark and the thing
 * marked are the same row: a proposal cannot exist without its mark, and a mark cannot outlive the
 * proposal it stands for. A second table would be a second place the same fact is kept.
 *
 * A DELETED PROPOSAL STILL COUNTS AS PROPOSED. Somebody removing one is somebody saying they have
 * seen it; filing it again would be nagging. Deleted rows are looked at, and a crossing whose only
 * proposal is deleted is reported as already proposed with the deletion said out loud.
 */
import { and, eq, sql } from 'drizzle-orm'

import { patternFoundBy } from '@shared/ops.ts'
import { db } from '../db/client.ts'
import { records } from '../db/schema.ts'
import { createRecord, type Actor } from './records.ts'

/** The shape this reader needs of a pattern. The usage layer's `PatternReading` satisfies it. */
export interface CrossedPattern {
  key: string
  crossed: boolean
  saw: number
  needs: number
  traces: number
  needsTraces: number
  says: string
}

/** One proposal this call filed. */
export interface Filed {
  key: string
  recordId: string
  question: string
}

/** One crossing that already had a proposal, so nothing was filed for it. */
export interface AlreadyProposed {
  key: string
  recordId: string
  /** True when the only proposal for this crossing has been deleted. It still counts. */
  deleted: boolean
}

/** What one call did. */
export interface ProposalsFromPatterns {
  filed: Filed[]
  alreadyProposed: AlreadyProposed[]
  /** How many patterns were read and had not crossed. Nothing is filed for those. */
  notCrossed: number
  note: string
}

/** The question one kind of crossing puts to the person, and the answers worth defending. */
function theFork(pattern: CrossedPattern): { question: string; options: string[]; subject: string } | null {
  const [kind, ...rest] = pattern.key.split(':')
  const subject = rest.join(':')
  if (subject === '') return null
  switch (kind) {
    case 'chain':
      return {
        subject,
        question: `Agents call ${subject} many times in a row inside one piece of work. Should Mole Office let them ask for all of it at once?`,
        options: [
          `Add a way to ask ${subject} for many things in one request. It costs a new shape to design, document and keep, and it is one more thing an agent has to find.`,
          `Leave it. The repeated calls are cheap and the reply is already small; the cost is that every agent keeps paying a round trip per thing.`,
        ],
      }
    case 'cost':
      return {
        subject,
        question: `The middle reply from ${subject} is large. Should its default reply be smaller?`,
        options: [
          `Make the default reply shorter and let a caller ask for the whole of it. It costs a second shape, and a caller that needed the whole thing now makes two requests.`,
          `Leave it. The reply is big because the thing is big; cutting it would make agents ask twice for what they already have.`,
        ],
      }
    case 'refused':
      return {
        subject,
        question: `${subject} is refused often, and always for the same kind of reason. Is the shape wrong, or is the sentence describing it wrong?`,
        options: [
          `Change what the operation accepts, so the thing agents keep sending is allowed. It costs a change to a live shape and to whatever already depends on it.`,
          `Change the sentence and the refusal, so an agent is told the right thing the first time. Cheaper, and it does nothing if the shape really is the problem.`,
        ],
      }
    case 'gap':
      return {
        subject,
        question: `Agents keep going outside Mole Office to find out ${subject.replace(/-/g, ' ')}. Should Mole Office answer it?`,
        options: [
          `Build the read. It costs a new operation to design and keep, and it has to stay true as the thing it reads about changes.`,
          `Leave it outside. Agents go on using the shell for it, and Mole Office holds nothing it would have to keep true.`,
        ],
      }
    case 'poll':
      return {
        subject,
        question: `Something calls ${subject} over and over and the reply does not change. Should it be told when nothing has changed?`,
        options: [
          `Give the operation a way to say "nothing since you last asked". It costs a version or a stamp on the reply and on the caller.`,
          `Leave it. The calls are cheap; the cost is the noise they put in every measurement of what agents actually do.`,
        ],
      }
    default:
      return null
  }
}

/** Every proposal already filed from a crossing, by the crossing's key. Deleted ones included. */
function alreadyFiled(workspaceId: string): Map<string, { id: string; deleted: boolean }> {
  const rows = db
    .select({ id: records.id, data: records.data, deletedAt: records.deletedAt })
    .from(records)
    .where(and(eq(records.workspaceId, workspaceId), eq(records.kind, 'proposal')))
    .all()
  const out = new Map<string, { id: string; deleted: boolean }>()
  for (const row of rows) {
    const source = (row.data as { source?: unknown } | null)?.source
    if (typeof source !== 'string') continue
    if (out.has(source)) continue
    out.set(source, { id: row.id, deleted: row.deletedAt !== null })
  }
  return out
}

/**
 * File one proposal for each crossing that has none, and nothing at all for the rest.
 *
 * It writes proposals and nothing else. No route is added, no shape is changed, and no existing
 * record is touched.
 */
export function proposeFromPatterns(
  workspaceId: string,
  actor: Actor,
  patterns: readonly CrossedPattern[],
): ProposalsFromPatterns {
  const already = alreadyFiled(workspaceId)
  const filed: Filed[] = []
  const alreadyProposed: AlreadyProposed[] = []
  let notCrossed = 0

  for (const pattern of patterns) {
    if (!pattern.crossed) {
      notCrossed += 1
      continue
    }
    const source = patternFoundBy(pattern.key)
    const seen = already.get(source)
    if (seen !== undefined) {
      alreadyProposed.push({ key: pattern.key, recordId: seen.id, deleted: seen.deleted })
      continue
    }
    const fork = theFork(pattern)
    if (fork === null) {
      // A pattern kind nothing here has a question for. It is left alone and said out loud rather
      // than filed as a proposal with an invented question.
      alreadyProposed.push({ key: pattern.key, recordId: '', deleted: false })
      continue
    }
    const record = createRecord({
      kind: 'proposal',
      title: `${fork.subject}: ${pattern.says}`,
      summary: fork.question,
      workspaceId,
      actor,
      data: {
        question: fork.question,
        options: fork.options,
        because:
          `Mole Office's own measurement of what agents do crossed a threshold here. ${pattern.says}. ` +
          'That is evidence that this might be worth building, not evidence that it should exist, which is ' +
          'why this is a fork rather than a change.',
        evidence: [
          `The measurement saw ${String(pattern.saw)} where the threshold is ${String(pattern.needs)}.`,
          pattern.needsTraces === 0
            ? `It was seen in ${String(pattern.traces)} separate pieces of work; this pattern has no threshold on that.`
            : `It was seen in ${String(pattern.traces)} separate pieces of work, where the threshold is ${String(pattern.needsTraces)}.`,
          `Read it back with GET /api/usage/patterns and look for the key ${pattern.key}.`,
        ],
        revisit_when:
          'The numbers behind it change. GET /api/usage/patterns recounts them on every read, so a ' +
          'crossing that stops crossing is visible there straight away.',
        who_settles_it: 'the owner',
        source,
      },
    })
    filed.push({ key: pattern.key, recordId: record.id, question: fork.question })
    already.set(source, { id: record.id, deleted: false })
  }

  return {
    filed,
    alreadyProposed,
    notCrossed,
    note:
      'A crossing is proposed once. The mark is the proposal itself: it carries `source` set to ' +
      "Mole Office's own name for that crossing, and this read looks for that before filing anything. " +
      'A proposal somebody has deleted still counts as proposed, because deleting one is having seen it.',
  }
}

/** How many proposals stand for a crossing in this project. Read by the test and by nothing else. */
export function howManyProposalsForCrossings(workspaceId: string): number {
  const rows = db
    .select({ n: sql<number>`count(*)` })
    .from(records)
    .where(
      and(
        eq(records.workspaceId, workspaceId),
        eq(records.kind, 'proposal'),
        sql`json_extract(${records.data}, '$.source') like 'mole office usage · %'`,
      ),
    )
    .get()
  return rows?.n ?? 0
}
