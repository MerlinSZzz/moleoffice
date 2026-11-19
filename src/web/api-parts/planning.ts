// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13s, the person's authority. The browser's doors to planning: the plan, capacity, allocation and work
// windows. Wave 13y's round 68 moved them here out of the one `api` object in src/web/api.ts; a line adds its new
// doors to its own part, and src/web/api-parts/join.ts joins every part into `api`.
import { type ReviewReply, type TodayReply, request } from '../api.ts'
import type { DeadlineReply, PlanReply } from '../../server/api/planning.ts'
import type { WindowWithWork } from '../../server/lib/windows.ts'
import { type Allocation, type AllocationState, type Grain, type WorkWindow, parsePeriod } from '@shared/planning.ts'
import { type ProjectChoice, projectsQuery } from '@shared/across-projects.ts'

export const planningDoors = {

  /**
   * THE PLAN. No workspace header on any of these, and that is not an oversight: a plan is a
   * person-level overlay across work that each stay in their own project, so a week legitimately
   * holds several. `moleOfficeRequest` adds the header from the current project on every other call;
   * these routes refuse to answer a question about one project because they have no answer to it.
   */
  plan: (period: string) => {
    const horizon = parsePeriod(period)?.horizon
    if (horizon === undefined) {
      // Refused here rather than sent, so a typed address fails in the page that can say so rather
      // than as a 400 from a route the reader never asked for.
      return Promise.reject(new Error(`"${period}" is not a period. A month is 2026-09, a week 2026-W36, a day 2026-09-07.`))
    }
    return request<PlanReply>(`/api/planning/${horizon}/${period}`)
  },
  /**
   * THE PERIOD THAT IS NOW, without the caller having to work out which one it is.
   *
   * THE HOME PAGE USED TO ASK FOR TODAY FIRST AND ONLY THEN ASK FOR THE WEEK TODAY IS IN, so the
   * week's read could not start until today had answered and had to join a later wave of requests.
   * The browser must not work the week out from its own clock — that is the same fact computed in
   * two places, and the two part on a timezone, on a Sunday, or on the first week of a year — so the
   * DOOR takes the date: `current` is resolved to the server's own period. The plan page asks for it;
   * Home has not since a decision, as `loadDay` in HomePage.tsx shows.
   *
   * ONE ARGUMENT, like `plan`: the horizon and the word `current`. `GET /api/planning/week/current`
   * and `GET /api/planning/today` answer from the same clock and are read in the same breath.
   */
  currentPlan: (horizon: Grain) => request<PlanReply>(`/api/planning/${horizon}/current`),
  /**
   * Today, WHOLE — see TodayReply.
   *
   * THE TYPE ON THIS LINE USED TO BE `{ day, week, month }`, and it is the drift this file's own
   * header warns about, one wrapper later: the route grew `allocations`, `capacity`, `recurring`
   * and `note`, the bytes have been arriving ever since, and no code in the browser could name
   * them. Widened rather than joined by a second wrapper, because two functions for one route is
   * how the two ends come apart again. Nothing called this before the widening, so nothing broke.
   */
  today: () => request<TodayReply>('/api/planning/today'),

  /**
   * The facts of a period that has been: what finished, what was dropped, what was left as
   * planned, what carries, and planned against actual where anybody recorded it.
   *
   * ONE ARGUMENT, NOT TWO. The route takes a horizon and a period and refuses a pair that
   * disagree; asking for the horizon here as well would be a second chance to send `week` with a
   * month key. It is read off the period itself, so the two cannot disagree.
   */
  review: (period: string) => {
    const horizon = parsePeriod(period)?.horizon
    if (horizon === undefined) {
      return Promise.reject(
        new Error(`"${period}" is not a period. A month is 2026-09, a week 2026-W36, a day 2026-09-07.`),
      )
    }
    return request<ReviewReply>(`/api/planning/review/${horizon}/${period}`)
  },
  /**
   * WHAT ONE DEADLINE LOOKS LIKE: time remaining, the size of the work, what the plan gives it,
   * what the window holds, the buffer that leaves — and every input that could not be counted.
   *
   * `work` IS THE CALLER'S ANSWER AND THERE IS NO DEFAULT FOR IT. The route will not read which
   * records a deadline depends on off the corpus — `blocked_by` is free text and a rule that read
   * prose to decide would be a rule prose can fool — so an empty list is a real request and comes
   * back with the `no-work-named` gap rather than with a guess. Sent joined by commas, which is
   * the spelling the route publishes.
   *
   * NO WORKSPACE, like the other planning calls: which project owns a piece of work is a different
   * question from when this person will spend time on it, and one deadline's work can span two.
   */
  deadline: (id: string, work: readonly string[], horizon: Grain) => {
    const params = new URLSearchParams({ horizon })
    if (work.length > 0) params.set('work', work.join(','))
    return request<DeadlineReply>(`/api/planning/deadline/${encodeURIComponent(id)}?${params.toString()}`)
  },

  /**
   * Apply an approved change set. The person may, or a secretary holding the person's grant where
   * this office's list of what the grant carries says so; the server refuses every other actor.
   */
  applyProposal: (id: string) =>
    request<{ applied: true; ops: { op: string; says: string; did: string; id: string | null }[]; created: string[]; note: string }>(
      `/api/planning/proposals/${id}/apply`,
      { method: 'POST' },
    ),

  allocate: (body: { horizon: Grain; period: string; recordId: string; plannedHours?: number | null; note?: string | null }) =>
    request<{ allocation: Allocation; note: string }>('/api/planning/allocations', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  changeAllocation: (
    id: string,
    body: { plannedHours?: number | null; actualHours?: number | null; state?: AllocationState; note?: string | null },
  ) =>
    request<{ allocation: Allocation; note: string }>(`/api/planning/allocations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  unallocate: (id: string) =>
    request<{ allocation: Allocation; note: string }>(`/api/planning/allocations/${id}`, { method: 'DELETE' }),
  clearCapacity: (horizon: Grain, period: string) =>
    request<{ removed: boolean; note: string }>(`/api/planning/capacity/${horizon}/${period}`, { method: 'DELETE' }),
  setCapacity: (horizon: Grain, period: string, hours: number, note?: string | null) =>
    request<{ capacity: { hours: number }; note: string }>(`/api/planning/capacity/${horizon}/${period}`, {
      method: 'PUT',
      body: JSON.stringify({ hours, ...(note === undefined ? {} : { note }) }),
    }),

  // -------------------------------------------------------------------------- when, not how much

  /**
   * WHEN SOMEBODY MEANS TO WORK ON SOMETHING: a first day and a last day, both included.
   *
   * **A WINDOW CARRIES NO HOURS AND ENTERS NO TOTAL.** It answers *when*, and an allocation answers
   * *how much*. Nothing in these four calls returns a number of hours, and no surface may add one
   * into a week — the route's own note and `src/server/lib/windows.ts` both say so in capitals, and
   * `tests/work-windows.test.ts` fails if it ever stops being true.
   *
   * NO WORKSPACE, like every other planning call and for the same settled reason: a person's week
   * holds work from every project (§35).
   */
  windows: (from: string, to: string, projects?: ProjectChoice) =>
    request<{
      from: string
      to: string
      windows: WindowWithWork[]
      /**
       * WHOSE WINDOW EACH ONE IS, keyed by window id: the stored `${actor.type}:${actor.id}` stamp.
       * `WorkWindow` deliberately carries no owner, so this is the one extra fact criterion P5
       * needs. `ownerOfWindow` in @shared/windowowner.ts is the one reader of a stamp.
       *
       * OPTIONAL because a caller that only counts windows — `placedOnTheBoard` in
       * components/Planning.tsx, and the tests that call it with a hand-built reply — has no owner
       * to give and must not be forced to invent one. The route always sends it.
       */
      owners?: Record<string, string | null>
      note: string
    }>(`/api/planning/windows?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${projects === undefined ? '' : `&${projectsQuery(projects)}`}`),

  /**
   * THE LINES OF THE PLAN SOMEBODY DROPPED, in a span of days.
   *
   * A dropped allocation is the plan's half of planned against actual: `shared/planning.ts` says
   * `dropped` is the one word for a line that did not happen. The sentence a person reads is
   * composed by `againstActual` in @shared/horizons.ts, so the page and its test read the same
   * words from the same rows.
   */
  droppedLines: (from: string, to: string, projects?: ProjectChoice) =>
    request<{
      from: string
      to: string
      lines: {
        id: string
        recordId: string
        workTitle: string | null
        horizon: Grain
        period: string
        plannedHours: number | null
        note: string | null
        createdBy: string | null
        /** The project of the line's work, sent only when `projects` was asked; null when the work is gone. */
        workspaceId?: string | null
      }[]
      note: string
    }>(`/api/planning/dropped-lines?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${projects === undefined ? '' : `&${projectsQuery(projects)}`}`),

  /** Put a piece of work across a span of days. No hours are written and none are implied. */
  placeWindow: (body: { recordId: string; startsOn: string; endsOn: string; note?: string | null }) =>
    request<{ window: WorkWindow; note: string }>('/api/planning/windows', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /**
   * Move a window, stretch it, write its note, or say what became of it.
   *
   * ONE CALL FOR MOVING AND STRETCHING, because the route is one write: sending both days moves the
   * span, sending one day stretches it, and either way the server checks the two ends together. A
   * second wrapper per gesture would be this file deciding which fields a gesture may send, which is
   * the rule living in two places.
   */
  changeWindow: (
    id: string,
    body: { startsOn?: string; endsOn?: string; note?: string | null; state?: string },
  ) =>
    request<{ window: WorkWindow; note: string }>(`/api/planning/windows/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  /** Take a window off the board. The work is untouched, and so is any time given to it. */
  unplaceWindow: (id: string) =>
    request<{ window: WorkWindow; note: string }>(`/api/planning/windows/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
}
