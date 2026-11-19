// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROPOSED CHANGE TO THE PROJECT, WRITTEN DOWN SO A PERSON CAN INSPECT IT BEFORE IT HAPPENS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * An agent reads a rough planning draft and works out what it would mean as project structure:
 * create this task, reuse that block, add this dependency, estimate that at six hours, put four of
 * those hours in next week. The person then has to be able to look at that and say yes.
 *
 * The requirement is explicit that this must not be one opaque paragraph — **each proposed change
 * has to be individually understandable** — which is the whole reason this file exists. A delta is a
 * list of small, typed operations, each of which reads as one sentence.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE IT LIVES, AND WHY THERE IS NO NEW RECORD KIND AND NO NEW TABLE
 * ---------------------------------------------------------------------------------------
 *
 * On a `proposal`, in `data.extra`. A proposal is already the product's word for *a fork an agent
 * reached that a person must settle*, it already has the governance machinery — human-only to
 * promote, refused to every agent — and `extra` is already the declared home for what a kind has no
 * field for. Adding a kind would be a governance decision the owner has not been asked; adding a
 * table would put an approval queue outside the one this product already has.
 *
 * So the flow the requirement describes is the flow that already exists:
 *
 *     draft -> agent critique -> proposal carrying a delta -> HUMAN promotes it -> apply
 *
 * ---------------------------------------------------------------------------------------
 * THE RULES EVERY OPERATION OBEYS
 * ---------------------------------------------------------------------------------------
 *
 * REUSE BEATS CREATE. An operation that creates a record when one already means that thing is how a
 * corpus grows two records for one piece of work. `reuse` exists so that "this is already here" is
 * something the delta can SAY, and a reader can see that it was considered.
 *
 * AMBIGUITY IS NAMED, NEVER GUESSED. `unresolved` is a first-class operation. An agent that cannot
 * tell which module a task belongs to says so and the person answers it; it does not pick one. That
 * is the same rule the rest of this product runs on — absence beats a guess.
 *
 * EVERY OPERATION THAT TOUCHES AN EXISTING RECORD CARRIES THE VERSION IT READ. An approved delta
 * applied a week later must not overwrite work done in the meantime. See `expectVersion`.
 */

import type { RecordKind } from './types.ts'

/** What kinds of change a delta may propose. One word each, so a row reads as a sentence. */
export const DELTA_OPS = [
  'create_record',
  'reuse_record',
  'set_field',
  'link',
  'allocate',
  'unresolved',
] as const
export type DeltaOpKind = (typeof DELTA_OPS)[number]

interface Base {
  /** One line a person can read without opening anything. Required on every operation. */
  says: string
}

/** Make a record that does not exist yet. */
export interface CreateRecordOp extends Base {
  op: 'create_record'
  kind: RecordKind
  title: string
  /** Which project it belongs to. Stated, never inferred — a plan may span several. */
  workspaceId: string
  summary?: string | null
  data?: Record<string, unknown>
}

/**
 * Name a record that already means this, so the delta says the duplicate was considered.
 *
 * It writes NOTHING on apply. It is here to be read: a delta that creates five tasks without a
 * single `reuse` beside them is one nobody checked for duplicates, and a reader can see that.
 */
export interface ReuseRecordOp extends Base {
  op: 'reuse_record'
  recordId: string
}

/** Set one field on an existing record — an estimate, a state, a due date. */
export interface SetFieldOp extends Base {
  op: 'set_field'
  recordId: string
  /** A path into `data`, one level. `effort_hours`, `state`, `due`. */
  field: string
  value: unknown
  /** The record's version when this was proposed. Apply refuses if it has moved. */
  expectVersion: string
}

/** Join two records that already exist, or that this delta creates. */
export interface LinkOp extends Base {
  op: 'link'
  /** An existing record id, or `new:<index>` naming a `create_record` earlier in this delta. */
  from: string
  to: string
  type: string
}

/** Give a piece of work time in a period. The planning layer, not the record graph. */
export interface AllocateOp extends Base {
  op: 'allocate'
  /** An existing record id, or `new:<index>`. */
  recordId: string
  horizon: 'month' | 'week' | 'day'
  period: string
  /** Null means committed without saying how long — never filled in from an estimate. */
  plannedHours?: number | null
}

/**
 * Something the agent could not work out, written down instead of guessed.
 *
 * IT IS NOT A COMMENT. An unresolved operation makes the delta incomplete, and a person applying one
 * is told how many there were and what they said — because the alternative is an agent quietly
 * picking a module and a corpus that disagrees with itself six months later.
 */
export interface UnresolvedOp extends Base {
  op: 'unresolved'
  /** What could not be decided, and what would decide it. */
  why: string
}

export type DeltaOp =
  | CreateRecordOp
  | ReuseRecordOp
  | SetFieldOp
  | LinkOp
  | AllocateOp
  | UnresolvedOp

/** A whole proposed change set, as it sits on a proposal's `data.extra.delta`. */
export interface Delta {
  /** The draft this came from, when it came from one. */
  fromDraft?: string | null
  ops: DeltaOp[]
}

/** How a delta reads at a glance: what it would do, and what nobody has answered. */
export interface DeltaSummary {
  creates: number
  reuses: number
  fields: number
  links: number
  allocations: number
  unresolved: number
  /** Total operations that would WRITE something. `reuse` and `unresolved` write nothing. */
  writes: number
}

export function summariseDelta(delta: Delta): DeltaSummary {
  const count = (op: DeltaOpKind): number => delta.ops.filter((o) => o.op === op).length
  const creates = count('create_record')
  const fields = count('set_field')
  const links = count('link')
  const allocations = count('allocate')
  return {
    creates,
    reuses: count('reuse_record'),
    fields,
    links,
    allocations,
    unresolved: count('unresolved'),
    writes: creates + fields + links + allocations,
  }
}

/**
 * Read a delta off a proposal's stored data, or `null` when there is not one.
 *
 * DELIBERATELY FORGIVING ABOUT SHAPE AND STRICT ABOUT PRESENCE. Anything can be written into
 * `extra`, so this returns null rather than throwing when the value is not a delta — a proposal
 * without one is the ordinary case, not an error. What it does NOT do is repair a half-written
 * delta: an `ops` that is not an array is not a delta, and applying half of one is the failure the
 * apply path exists to prevent.
 */
export function deltaIn(data: unknown): Delta | null {
  if (typeof data !== 'object' || data === null) return null
  const extra = (data as Record<string, unknown>)['extra']
  if (typeof extra !== 'object' || extra === null) return null
  const delta = (extra as Record<string, unknown>)['delta']
  if (typeof delta !== 'object' || delta === null) return null
  const ops = (delta as Record<string, unknown>)['ops']
  if (!Array.isArray(ops)) return null
  const fromDraft = (delta as Record<string, unknown>)['fromDraft']
  return {
    ops: ops as DeltaOp[],
    fromDraft: typeof fromDraft === 'string' ? fromDraft : null,
  }
}

/** `new:<index>` names a record this delta creates. Returns the index, or null. */
export function newRef(value: string): number | null {
  const match = /^new:(\d+)$/.exec(value)
  return match === null ? null : Number(match[1])
}
