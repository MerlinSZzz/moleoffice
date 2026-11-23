// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WORK WINDOWS: WHEN SOMEBODY MEANS TO WORK ON SOMETHING.
 *
 * ---------------------------------------------------------------------------------------
 * A WINDOW NEVER CONTRIBUTES HOURS TO ANY TOTAL
 * ---------------------------------------------------------------------------------------
 *
 * A window answers WHEN, not HOW MUCH. "Test tray clamp runs from this Thursday to next Wednesday" says
 * the person means to work on it in those days. It does not say the work fills them, it does not say
 * how long the work takes, and **nothing in this file returns a number of hours**. Hours are the
 * allocation's job: `loadOf`, `fitOf` and every other total in shared/planning.ts read `allocations`
 * and read nothing here, and `tests/work-windows.test.ts` fails if that ever changes.
 *
 * That is the point of the table rather than a limitation of it. The aim is to place a piece of
 * work across a span without first working out how many hours belong on each day, so a window is the
 * coarse answer and an allocation is the fine one. Either may exist without the other.
 *
 * ---------------------------------------------------------------------------------------
 * SEVERAL WINDOWS ON ONE PIECE OF WORK ARE ORDINARY, AND THAT IS NOT THE ALLOCATION RULE
 * ---------------------------------------------------------------------------------------
 *
 * `createAllocation` refuses a second allocation for one record in one period, because two rows of
 * hours cannot say whether they add up or correct each other. Two windows have no such problem: a
 * piece of work touched this week and again in three weeks is two spans, and they say so. So nothing
 * here refuses a second window, and nothing refuses two that overlap.
 *
 * ---------------------------------------------------------------------------------------
 * THE SAME BOUNDARY RULE AS THE REST OF PLANNING
 * ---------------------------------------------------------------------------------------
 *
 * A window names a record that stays in its own project and grants no authority to read it. There is
 * no query here that ranges over a workspace: the only records read are the ones a window already
 * names, fetched by primary key through `resolveAllocated` in lib/planning.ts. A window carries no
 * `workspace_id` for the settled reason written out on `allocations` in db/schema-parts/planning.ts — a person's
 * week holds work from every project.
 */

import { and, eq, gte, lte } from 'drizzle-orm'
import { anOfficeId } from './ids.ts'
import { nowStamp } from '@shared/time.ts'
import { WINDOW_STATES, parsePeriod, type WindowState, type WorkWindow } from '@shared/planning.ts'
import { planHoursRuleOf } from '@shared/work.ts'
import { db } from '../db/client.ts'
import { records as recordsTable, workWindows } from '../db/schema.ts'
import { ALLOCATABLE_KINDS, resolveAllocated, type AllocatedWork } from './planning.ts'
import { type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { toWindow } from '../db/get-window.ts'
import type { WindowRow } from '../db/types/windows.ts'

export type { WindowRow } from '../db/types/windows.ts'

/** A window with the work it names, or `null` where that record is gone. Assembled, never stored. */
export interface WindowWithWork {
  window: WorkWindow
  work: AllocatedWork | null
}

export { toWindow } from '../db/get-window.ts'

/**
 * Refuse anything that is not a day key, naming the shape.
 *
 * THROUGH `parsePeriod`, which is the one reader of a date in this product. A second date reader here
 * is how `2026-02-30` becomes 2 March in one place and a refusal in another.
 */
function checkDay(value: string, what: string): string {
  const parsed = parsePeriod(value)
  if (parsed === null || parsed.horizon !== 'day') {
    throw new PanelError(
      `${what} must be a day, written like 2026-09-07. It is "${value}". A window is a first day and a ` +
        `last day, so a week key or a month key cannot say what it means.`,
    )
  }
  return value
}

/** Refuse a window that ends before it starts, naming both ends. */
function checkOrder(startsOn: string, endsOn: string): void {
  if (endsOn < startsOn) {
    throw new PanelError(
      `This window starts on ${startsOn} and ends on ${endsOn}, which is earlier. A window runs forward: ` +
        `both days are inside it, so the last day is the same as the first or after it.`,
    )
  }
}

/** Refuse a state that is not one of the three, naming them. */
function checkState(state: string): WindowState {
  if ((WINDOW_STATES as readonly string[]).includes(state)) return state as WindowState
  throw new PanelError(`state must be one of: ${WINDOW_STATES.join(', ')}. It is "${state}".`)
}

/**
 * The work exists, is not deleted, and is a kind the schedule can hold.
 *
 * THE KINDS ARE THE SAME KINDS AN ALLOCATION MAY NAME, read from the one declaration in
 * shared/work.ts that `createAllocation` also reads, so the board holds one vocabulary of what can be
 * scheduled. The sentences are this surface's own, because a window gives no hours and a refusal that
 * said it did would be describing a different act.
 *
 * The rule is not restated here and cannot drift: `tests/work-windows.test.ts` checks that the kinds
 * a window accepts are exactly `ALLOCATABLE_KINDS`.
 */
function checkSchedulable(recordId: string): { kind: string; title: string } {
  const row = db.select().from(recordsTable).where(eq(recordsTable.id, recordId)).get()
  if (row === undefined) {
    throw new PanelError(`No record has the id "${recordId}", so there is nothing to put on the schedule.`, 404)
  }
  if (row.deletedAt !== null) {
    throw new PanelError(
      `"${row.title}" has been deleted, so it cannot be put on the schedule. Restore it first if the plan ` +
        `is right.`,
    )
  }
  if (!(ALLOCATABLE_KINDS as readonly string[]).includes(row.kind)) {
    const a = /^[aeiou]/i.test(row.kind) ? 'an' : 'a'
    throw new PanelError(
      `The schedule holds work, and ${a} ${row.kind} is not one of the kinds it can: ` +
        `${ALLOCATABLE_KINDS.join(', ')}. Why not: ${planHoursRuleOf(row.kind).why}`,
    )
  }
  return { kind: row.kind, title: row.title }
}

// ---------------------------------------------------------------------------- reading

/**
 * Every window that touches the days `from` to `to`, both ends included.
 *
 * OVERLAP, NOT CONTAINMENT. A window that started last week and runs into this one is on this week's
 * board, and a board that only showed windows starting inside its own days would lose exactly the
 * spans a window exists for. Compared as strings, which works because `YYYY-MM-DD` sorts as the
 * calendar does.
 */
export function windowsOverlapping(from: string, to: string): WorkWindow[] {
  checkDay(from, 'from')
  checkDay(to, 'to')
  checkOrder(from, to)
  return db
    .select()
    .from(workWindows)
    .where(and(lte(workWindows.startsOn, to), gte(workWindows.endsOn, from)))
    .all()
    .map(toWindow)
    .sort((a, b) => (a.startsOn === b.startsOn ? a.id.localeCompare(b.id) : a.startsOn < b.startsOn ? -1 : 1))
}

/** Every window on one piece of work. The other read there is. */
export function windowsOf(recordId: string): WorkWindow[] {
  return db.select().from(workWindows).where(eq(workWindows.recordId, recordId)).all().map(toWindow)
}

export { getWindow } from '../db/get-window.ts'

/** Windows with the work each names. The work is read by primary key and nothing else. */
export function withWork(windows: readonly WorkWindow[]): WindowWithWork[] {
  const work = resolveAllocated(windows)
  return windows.map((window) => ({ window, work: work.get(window.recordId) ?? null }))
}

// ---------------------------------------------------------------------------- writing

export interface NewWindow {
  recordId: string
  startsOn: string
  endsOn: string
  note?: string | null
}

/** Say when somebody means to work on a piece of work. No hours are written and none are implied. */
export function createWindow(input: NewWindow, actor: Actor): WorkWindow {
  const startsOn = checkDay(input.startsOn, 'startsOn')
  const endsOn = checkDay(input.endsOn, 'endsOn')
  checkOrder(startsOn, endsOn)
  checkSchedulable(input.recordId)

  const stamp = nowStamp()
  const row = {
    id: anOfficeId(),
    recordId: input.recordId,
    startsOn,
    endsOn,
    note: input.note ?? null,
    state: 'planned' as const,
    createdAt: stamp,
    updatedAt: stamp,
    createdBy: `${actor.type}:${actor.id}`,
  }
  db.insert(workWindows).values(row).run()
  return toWindow(row)
}

export interface WindowPatch {
  startsOn?: string
  endsOn?: string
  note?: string | null
  state?: string
}

/**
 * Move a window, stretch it, write its note, or say what became of it.
 *
 * MOVING AND STRETCHING ARE THE SAME WRITE, and that is why there is one function rather than three.
 * Moving sends both days, stretching sends one. Either way the two ends are checked together against
 * what is stored, so a stretch that would drag the end before the start is refused with both dates in
 * the sentence rather than silently accepted because only one field arrived.
 *
 * **Setting `state` to `done` completes THIS WINDOW AND NOTHING ELSE.** It does not touch the record
 * it names. That is the same rule an allocation follows, for the same reason: work larger than a
 * window is the normal case, so a span that closed the task would be wrong most of the time.
 */
export function patchWindow(id: string, patch: WindowPatch, actor: Actor): WorkWindow {
  const existing = db.select().from(workWindows).where(eq(workWindows.id, id)).get()
  if (existing === undefined) throw new PanelError(`No window has the id "${id}".`, 404)

  const startsOn = patch.startsOn === undefined ? existing.startsOn : checkDay(patch.startsOn, 'startsOn')
  const endsOn = patch.endsOn === undefined ? existing.endsOn : checkDay(patch.endsOn, 'endsOn')
  checkOrder(startsOn, endsOn)

  const next: Partial<WindowRow> = { updatedAt: nowStamp(), startsOn, endsOn }
  if ('note' in patch) next.note = patch.note ?? null
  if (patch.state !== undefined) next.state = checkState(patch.state)
  void actor

  db.update(workWindows).set(next).where(eq(workWindows.id, id)).run()
  const after = db.select().from(workWindows).where(eq(workWindows.id, id)).get()
  return toWindow(after as WindowRow)
}

/** Take a window off the schedule. The work is untouched, and so is any time given to it. */
export function deleteWindow(id: string): WorkWindow {
  const existing = db.select().from(workWindows).where(eq(workWindows.id, id)).get()
  if (existing === undefined) throw new PanelError(`No window has the id "${id}".`, 404)
  db.delete(workWindows).where(eq(workWindows.id, id)).run()
  return toWindow(existing)
}
