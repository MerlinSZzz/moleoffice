// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FOUR WRITES TO ONE FLOW'S STAGES, built in one place for the server and the page. One decision is the Flows page,
 * and the other is that a step keeps its reasons, and each change its cause.
 * This was wave 13p round 34, the second of the five rounds of proposal report 4mwraeIStEe8.
 *
 *   add      a stage at a place, with what it does, why, its sources, whether it is standing, and the cause of the change;
 *   change   one stage's words, why and sources, whether it is standing, and the cause;
 *   move     one stage to another place, why, and the cause;
 *   remove   one stage, why, and the cause.
 *
 * `buildAFlowStageWrite` turns one of them and the flow's data before it into the flow's data after it: the stages
 * renumbered 1, 2, 3 … by place, and one entry added to the end of `step_changes` from the write's why and cause. It then
 * asks `whatTheFlowStepsLack` in ./flow-steps.ts, the check every write to a flow meets, so the server's doors and the
 * flow editor of round four refuse the same things in the same order (invariant 9).
 *
 * A STAGE IS NAMED BY ITS PLACE, counting from 1, and so are `at` and `to`. The flows filed so far store `n` equal to
 * the place, and a write renumbers them all, so after one write the two cannot differ.
 *
 * A STANDING STAGE is given to every round and worker start its flow applies to (src/shared/round-chapters/standing.ts).
 * It is stored as `standing: true`, and a stage that is not standing has no `standing` key. A change that leaves
 * `standing` out keeps the stage's mark, so the flow editor, which does not show it, cannot take it off. A change of the
 * mark alone is a change like any other: it sends the stage's why and sources and a cause, and is refused without them
 * (wave 13u round 185; REQUIREMENTS.md, 8 November 2026 14:3x).
 *
 * WHAT THIS ADDS TO THE CHECK OF A DECISION. That check asks for a change entry only when
 * a step's words are added, changed or removed. A step that only moved is not a changed step to it. Here a move writes
 * an entry too, with its why and its cause, so the record of changes says when the order changed and what caused it.
 * The shared check itself is not changed: a write through the records door that only reorders the stages is still not
 * asked for an entry.
 */
import { stepsOf, whatTheFlowStepsLack, type FlowStepsLack } from './flow-steps.ts'
import type { FlowWriteRefusalCode } from './refusal-codes.ts'

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value)

const blank = (value: unknown): boolean => typeof value !== 'string' || value.trim() === ''

/** One write to a flow's stages, as a door or the editor sends it. Every place counts from 1. */
export type FlowStageWrite =
  | { op: 'add'; at: number; does: string; evidence?: string; why?: string; sources?: string[]; standing?: boolean; cause?: string }
  | { op: 'change'; n: number; does?: string; evidence?: string; why?: string; sources?: string[]; standing?: boolean; cause?: string }
  | { op: 'move'; n: number; to: number; why?: string; cause?: string }
  | { op: 'remove'; n: number; why?: string; cause?: string }

/** One thing a write to a stage lacks that the shared check does not ask: a place that is not there, or a reason. */
export type FlowWriteLack =
  | { code: 'flowStageNotThere'; n: number; count: number }
  | { code: 'flowStagePlaceNotThere'; place: number; most: number }
  | { code: 'flowStageAlreadyThere'; n: number }
  | { code: 'flowStageUnchanged'; n: number }
  | { code: 'flowChangeNoWhy' }

// A compile-time check that every lack here has a refusal code. The stale version and the missing project are the
// doors' own, because neither is a question about the stages.
type _EveryLackHasACode = FlowWriteLack['code'] extends FlowWriteRefusalCode ? true : never
const _everyLackHasACode: _EveryLackHasACode = true
void _everyLackHasACode

/** What one write comes to: the data to store, what it lacks in the order it is refused, and what the old stage said. */
export interface FlowStageWriteBuilt {
  next: Json
  lacks: (FlowWriteLack | FlowStepsLack)[]
  /** The old steps this write changes or removes, as the shared check reads them. */
  gone: Json[]
  /** The stage as it was before a change or a remove, at its place; null on an add or a move. */
  was: Json | null
  /** The sentence written into the change entry's `what`. */
  what: string
}

const quoted = (step: Json): string => `"${String(step['does'] ?? '')}"`

/** The fields of a stage a change can move, in the order a sentence names them. */
const CHANGEABLE = ['does', 'evidence', 'why', 'sources'] as const

/**
 * THE FLOW'S DATA AFTER ONE WRITE TO ITS STAGES, and what the write lacks. `today` is the date the change entry is
 * written on; `missing` answers which of some ids name no live record, as in `whatTheFlowStepsLack`. Nothing here
 * writes: the caller stores `next` only when `lacks` is empty.
 */
export function buildAFlowStageWrite(
  before: unknown,
  write: FlowStageWrite,
  today: string,
  missing: (ids: readonly string[]) => string[],
): FlowStageWriteBuilt {
  const old = stepsOf(before)
  const count = old.length
  const lacks: (FlowWriteLack | FlowStepsLack)[] = []
  let stages = [...old]
  let was: Json | null = null
  let what = ''

  const thereIs = (n: number): boolean => {
    if (Number.isInteger(n) && n >= 1 && n <= count) return true
    lacks.push({ code: 'flowStageNotThere', n, count })
    return false
  }
  const placeIn = (place: number, most: number): boolean => {
    if (Number.isInteger(place) && place >= 1 && place <= most) return true
    lacks.push({ code: 'flowStagePlaceNotThere', place, most })
    return false
  }

  switch (write.op) {
    case 'add': {
      if (!placeIn(write.at, count + 1)) break
      const step: Json = { n: write.at, does: write.does }
      if (!blank(write.evidence)) step['evidence'] = write.evidence
      if (write.why !== undefined) step['why'] = write.why
      if (write.sources !== undefined) step['sources'] = write.sources
      if (write.standing === true) step['standing'] = true
      stages.splice(write.at - 1, 0, step)
      what = `Stage ${String(write.at)} was added: ${quoted(step)}.${write.standing === true ? ' It is standing.' : ''}`
      break
    }
    case 'change': {
      if (!thereIs(write.n)) break
      const before = old[write.n - 1] as Json
      was = before
      const step: Json = { ...before, does: write.does ?? before['does'] }
      if (write.evidence !== undefined) {
        if (blank(write.evidence)) delete step['evidence']
        else step['evidence'] = write.evidence
      }
      // A change sends the stage's why and sources whole, so what is stored is what this write says.
      if (write.why === undefined) delete step['why']
      else step['why'] = write.why
      if (write.sources === undefined) delete step['sources']
      else step['sources'] = write.sources
      // The mark is kept when it is left out, and only `true` is stored.
      if (write.standing === true) step['standing'] = true
      else if (write.standing === false) delete step['standing']
      const moved = CHANGEABLE.filter((key) => JSON.stringify(step[key] ?? null) !== JSON.stringify(before[key] ?? null))
      const marked = (step['standing'] === true) === (before['standing'] === true) ? null : step['standing'] === true ? 'made standing' : 'made not standing'
      if (moved.length === 0 && marked === null) {
        lacks.push({ code: 'flowStageUnchanged', n: write.n })
        break
      }
      stages[write.n - 1] = step
      const changed =
        moved.length === 0
          ? null
          : step['does'] === before['does']
            ? `Stage ${String(write.n)} (${quoted(before)}) was changed: its ${moved.join(', ')}.`
            : `Stage ${String(write.n)} was changed from ${quoted(before)} to ${quoted(step)}.`
      what = changed === null ? `Stage ${String(write.n)} (${quoted(before)}) was ${String(marked)}.` : marked === null ? changed : `${changed} It was ${marked}.`
      break
    }
    case 'move': {
      if (!thereIs(write.n) || !placeIn(write.to, count)) break
      if (write.to === write.n) {
        lacks.push({ code: 'flowStageAlreadyThere', n: write.n })
        break
      }
      const [step] = stages.splice(write.n - 1, 1) as [Json]
      stages.splice(write.to - 1, 0, step)
      what = `Stage ${String(write.n)} (${quoted(step)}) was moved to place ${String(write.to)}.`
      break
    }
    case 'remove': {
      if (!thereIs(write.n)) break
      was = old[write.n - 1] as Json
      stages = stages.filter((_, i) => i !== write.n - 1)
      what = `Stage ${String(write.n)} (${quoted(was)}) was removed.`
      break
    }
  }

  // A MOVE AND A REMOVE carry no step whose why the shared check reads, so the change entry's why is asked here. On an
  // add or a change the why is the stage's own, and the shared check asks for it.
  if (lacks.length === 0 && (write.op === 'move' || write.op === 'remove') && blank(write.why)) lacks.push({ code: 'flowChangeNoWhy' })

  const entry: Json = { at: today, what }
  if (write.why !== undefined) entry['why'] = write.why
  if (write.cause !== undefined) entry['cause'] = write.cause
  const held = isObject(before) && Array.isArray(before['step_changes']) ? (before['step_changes'] as unknown[]) : []
  const next: Json = {
    ...(isObject(before) ? before : {}),
    stages: stages.map((step, i) => ({ ...step, n: i + 1 })),
    step_changes: [...held, entry],
  }

  // The shared check runs either way, for the steps it finds changed or removed; it asks after records only when this
  // write lacks nothing of its own, as it asks only when it finds nothing else lacking.
  const shared = whatTheFlowStepsLack(next, before, lacks.length > 0 ? () => [] : missing)
  return { next, lacks: lacks.length > 0 ? lacks : shared.lacks, gone: shared.gone, was, what }
}

/** The stages as a write's answer gives them: each one's place and what it does, and nothing else. */
export const stagesInBrief = (data: unknown): { n: number; does: string }[] =>
  stepsOf(data).map((step, i) => ({ n: i + 1, does: String(step['does'] ?? '') }))
