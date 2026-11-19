// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A WRITE TO A FLOW'S STEPS LACKS, worked out in one place for the server and the page. This follows a decision,
 * and the Flows page of another, in wave 13p round 33.
 *
 * The server refuses the first thing this finds, in src/server/lib/flow-reasons.ts, with its code and its English
 * sentence. The flow editor of round four asks the same function while the person types, so it can mark each stage
 * that lacks something before the save, and the save is not refused after the fact. There is one check, so the two
 * cannot come apart (invariant 9).
 *
 * Six things are lacked, in the order the server refuses them:
 *   - flowStepNoWhy             a step added or changed with no `why`;
 *   - flowStepNoSources         a step added or changed with no `sources`;
 *   - flowStepChangesRewritten  a write that changes or removes earlier `step_changes` entries;
 *   - flowStepChangeUnrecorded  a write that adds, changes or removes a step and adds no `step_changes` entry;
 *   - flowStepChangeNoCause     a new `step_changes` entry that names no cause;
 *   - flowStepRecordNotThere    a source or a cause that names no live record.
 * A step nobody has touched is never asked for a why: the flows filed before the decision have none. A step that only
 * moved is not a changed step, because a step is compared without its number.
 *
 * Whether a record is there is a question for the database, so the caller hands in `missing`, which answers it. The
 * page, which cannot ask the database for every id, hands in what it knows and leaves the server to refuse the rest.
 */
import type { FlowStepRefusalCode } from './refusal-codes.ts'

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value)

/** The steps of a flow's data, as objects. Anything else in the list is left out. */
export const stepsOf = (data: unknown): Json[] =>
  isObject(data) && Array.isArray(data['stages']) ? (data['stages'] as unknown[]).filter(isObject) : []

const changesOf = (data: unknown): unknown[] => (isObject(data) && Array.isArray(data['step_changes']) ? (data['step_changes'] as unknown[]) : [])

/** The ids in a list, trimmed, with blanks and anything that is not text left out. */
export const idsIn = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string' && one.trim() !== '').map((one) => one.trim()) : []

/** A step as it is compared: everything but its number, so a step that only moved is not a changed step. */
function sameStep(a: Json, b: Json): boolean {
  const { n: _a, ...restA } = a
  const { n: _b, ...restB } = b
  return canonical(restA) === canonical(restB)
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

/** One thing a write lacks, with the steps, entries or ids it is about. */
export type FlowStepsLack =
  | { code: 'flowStepNoWhy'; steps: Json[] }
  | { code: 'flowStepNoSources'; steps: Json[] }
  | { code: 'flowStepChangesRewritten'; earlier: number }
  | { code: 'flowStepChangeUnrecorded' }
  | { code: 'flowStepChangeNoCause'; entries: number }
  | { code: 'flowStepRecordNotThere'; ids: string[] }

/** What a write to a flow's steps comes to: what it lacks, in the order the server refuses, and the steps it changes or removes. */
export interface FlowStepsReading {
  lacks: FlowStepsLack[]
  /** The old steps this write changes or removes. Whoever does that is shown what they said first. */
  gone: Json[]
}

// A compile-time check that every lack has a refusal code and every flow-step refusal code has a lack.
type LackCodes = FlowStepsLack['code']
const _everyCodeIsALack: [LackCodes] extends [FlowStepRefusalCode] ? ([FlowStepRefusalCode] extends [LackCodes] ? true : never) : never = true
void _everyCodeIsALack

/**
 * WHAT THIS WRITE LACKS, against what the flow held before it (`before` is null on a create, and on a write that makes
 * a record a flow). `missing` answers which of some ids name no live record; the sources and causes are asked of it
 * only when nothing else is lacking, so a write is never refused for a record when it is also missing a reason.
 */
export function whatTheFlowStepsLack(next: unknown, before: unknown, missing: (ids: readonly string[]) => string[]): FlowStepsReading {
  const newSteps = stepsOf(next)
  const oldSteps = before === null ? [] : stepsOf(before)
  const touched = newSteps.filter((step) => !oldSteps.some((old) => sameStep(old, step)))
  const gone = oldSteps.filter((old) => !newSteps.some((step) => sameStep(old, step)))
  const lacks: FlowStepsLack[] = []

  const noWhy = touched.filter((step) => typeof step['why'] !== 'string' || step['why'].trim() === '')
  if (noWhy.length > 0) lacks.push({ code: 'flowStepNoWhy', steps: noWhy })
  const noSources = touched.filter((step) => idsIn(step['sources']).length === 0)
  if (noSources.length > 0) lacks.push({ code: 'flowStepNoSources', steps: noSources })

  const oldChanges = before === null ? [] : changesOf(before)
  const newChanges = changesOf(next)
  const kept = oldChanges.length <= newChanges.length && oldChanges.every((entry, i) => canonical(entry) === canonical(newChanges[i]))
  if (!kept) lacks.push({ code: 'flowStepChangesRewritten', earlier: oldChanges.length })
  const added = kept ? newChanges.slice(oldChanges.length).filter(isObject) : []
  const stepsChanged = before !== null && (touched.length > 0 || gone.length > 0)
  if (kept && stepsChanged && added.length === 0) lacks.push({ code: 'flowStepChangeUnrecorded' })
  const noCause = added.filter((entry) => typeof entry['cause'] !== 'string' || entry['cause'].trim() === '')
  if (noCause.length > 0) lacks.push({ code: 'flowStepChangeNoCause', entries: noCause.length })

  if (lacks.length === 0) {
    const named = [...touched.flatMap((step) => idsIn(step['sources'])), ...added.flatMap((entry) => idsIn([entry['cause']]))]
    const notThere = named.length === 0 ? [] : missing([...new Set(named)])
    if (notThere.length > 0) lacks.push({ code: 'flowStepRecordNotThere', ids: notThere })
  }
  return { lacks, gone }
}
