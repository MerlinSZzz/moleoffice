// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13q, the stable office and its tools. The browser's doors to plans and their lines. Wave 13y's round
// 68 moved them here out of the one `api` object in src/web/api.ts; a line adds its new doors to its own part, and
// src/web/api-parts/join.ts joins every part into `api`.
import { type PlanBlocksReply, type PlanSinceReadReply, type PlansReply, json, request } from '../api.ts'
import type { LineBound, LineFiled, Plan, PlanLine, PlanLineRevision } from '../../server/lib/plans.ts'
import type { PlanContext, PlanReviewsReply } from '../../server/lib/planreview.ts'
import type { PlanState } from '@shared/plandoc.ts'
import type { Grain } from '@shared/planning.ts'
import { projectsQuery } from '@shared/across-projects.ts'
import type { RecordKind } from '@shared/types.ts'

export const plansDoors = {

  // -------------------------------------------------------------------------- plans
  /**
   * THE PLANS: WRITING, BEFORE ANYTHING HAS AN HOUR ON IT.
   *
   * These calls take no project, like the planning calls above and for the same settled reason: a
   * plan spans projects, so it belongs to none of them. Nothing here writes a record, a link or a
   * change row. The two calls at the bottom are the only ones that cross into the project.
   */
  plans: (state?: PlanState | 'every') =>
    request<PlansReply>(state === undefined ? '/api/plans' : `/api/plans?state=${encodeURIComponent(state)}`),

  /**
   * One plan read for display: the plan, its lines turned into blocks, and the record each filed
   * line names.
   *
   * ONE CALL AND NOT TWO, because the blocks and the lines have to be the same moment. The blocks
   * say how to draw the document and the lines carry the live record beside each one, and a page
   * that fetched them separately could draw a line as filed in one and unfiled in the other.
   */
  planBlocks: (id: string) => request<PlanBlocksReply>(`/api/plans/${encodeURIComponent(id)}/blocks`),

  /** What was written to this plan since you last said you had read it. */
  planSinceRead: (id: string) => request<PlanSinceReadReply>(`/api/plans/${encodeURIComponent(id)}/since-read`),

  /**
   * THE FACTS AN AGENT NEEDS TO REVIEW ONE PLAN, and no review. It changes nothing.
   *
   * The browser calls this for ONE FIELD — `ask`, the words a person hands to an agent — and takes
   * the whole reply because that is this file's rule. `ask` is written by the server on purpose:
   * the sentence telling an agent to write `extra.plan` and the code looking for `extra.plan` have
   * to be one sentence, and a copy of it in a component would drift the first time either changed.
   *
   * `projects` names projects to read BESIDES the ones this plan already points work at, and a
   * project nobody has is refused rather than read as one holding nothing.
   */
  planContext: (id: string, projects: readonly string[] = []) =>
    request<PlanContext>(
      `/api/plans/${encodeURIComponent(id)}/context` +
        (projects.length === 0 ? '' : `?${projectsQuery(projects.join(','))}`),
    ),

  /**
   * WHAT AN AGENT HAS ADVISED ABOUT THIS PLAN, from every project, newest first.
   *
   * Reading it changes nothing and neither has any of it: a proposal is advice until a person
   * settles the fork and then presses apply, and both of those refuse every agent except the
   * secretary carrying the person's authorization. `waiting` is how
   * many nobody has settled — the ones the plan page counts on its own button.
   */
  planReviews: (id: string) => request<PlanReviewsReply>(`/api/plans/${encodeURIComponent(id)}/reviews`),

  /** Say that you have read this plan, now. It changes no line. */
  markPlanRead: (id: string) =>
    request<{ plan: Plan; note: string }>(`/api/plans/${encodeURIComponent(id)}/read`, { method: 'POST' }),

  /** Start a plan. A whole document may arrive as `body`, split into lines on the newline. */
  newPlan: (title: string, body?: string) =>
    request<{ plan: Plan; lines: PlanLine[]; note: string }>('/api/plans', {
      method: 'POST',
      body: json({ title, ...(body === undefined ? {} : { body }) }),
    }),

  /**
   * Change a plan's name, or say that it has ended. Neither touches a line.
   *
   * THIS IS ALSO HOW A PLAN IS CLOSED, and until wave B nothing in the browser called it that way.
   * A plan is `open` while it is being written; `done` means the writing is finished and `dropped`
   * means it was abandoned. Both leave the list of plans being written, both keep every line, and
   * both leave the records those lines were filed as exactly as they are.
   *
   * The shelf's "Show closed plans" reads `plans('every')`, and `PlansReply.closed` says how many
   * there are to show. Nothing in the product could reach the closed state before this, so the owner
   * deleted their scratch plan from outside the product instead.
   */
  savePlan: (id: string, patch: { title?: string; state?: PlanState }, ifVersion: string | null) =>
    request<{
      plan: Plan
      /** What the plan holds after this write. Carry it into the next write as `ifVersion`. */
      version: string
      note: string
    }>(`/api/plans/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      // THE VERSION IS A REQUIRED ARGUMENT, AND NULL SAYS ON PURPOSE THAT THE CALLER HAS NONE (problem GR4LcaNI-XZk).
      // An optional one let every caller forget it, and a forgotten one wrote over a newer name with nothing said. A
      // write that carries it is answered 409 with the code planChangedSinceRead when somebody wrote since.
      body: json(ifVersion === null ? patch : { ...patch, ifVersion }),
    }),

  /**
   * Delete a plan and every line in it. NOTHING CANONICAL GOES WITH IT.
   *
   * Records that lines were filed as stay, because they are project truth and were never the plan's
   * to remove, and hours given from those lines stay, because the hours were still given. The reply
   * says so in `note` and says how many lines went, and a screen that offers this press should say
   * the same thing BEFORE it is pressed rather than after.
   *
   * There is no undo. A deleted plan is gone from the database, unlike a record, which is only
   * marked as deleted and can be restored.
   */
  deletePlan: (id: string) =>
    request<{ plan: Plan; lines: number; note: string }>(`/api/plans/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  /**
   * Write the whole document: afterwards the plan holds exactly the lines sent, in the order sent.
   *
   * A line sent WITH its id is the line you already have and keeps the record it was filed as. A
   * line with no id is a new line. A line that is not sent is deleted. One transaction, so a save
   * cannot half happen.
   */
  writePlanLines: (id: string, lines: { id?: string; text: string; remark?: string | null }[]) =>
    request<{ lines: PlanLine[]; note: string }>(`/api/plans/${encodeURIComponent(id)}/lines`, {
      method: 'PUT',
      body: json({ lines }),
    }),

  /**
   * WRITE ONE NEW LINE, directly after a line the plan already has. Nothing else moves.
   *
   * This is what the planning table's plus writes. It is not `writePlanLines`: that sends the whole
   * document and anything left out of it is deleted, so adding one line that way would mean sending
   * every other line back exactly as it was and hoping.
   *
   * `afterLineId` NULL MEANS THE END OF THE PLAN, which is the route's own rule and is how the first
   * item of a plan that has none is written. The field is then left out of the body rather than sent
   * as null.
   *
   * `reason` IS REQUIRED BY THE SERVER. Criterion P3: a line added is a revision with a reason, so
   * the box that adds one asks for it and the server refuses the add without it.
   */
  addLineAfter: (planId: string, text: string, afterLineId: string | null, reason: string, ifVersion: string | null) =>
    request<{ line: PlanLine; version: string; note: string }>(`/api/plans/${encodeURIComponent(planId)}/lines`, {
      method: 'POST',
      // REQUIRED FOR THE SAME REASON AS ON `savePlan`: null says on purpose that the caller has no version.
      body: json({
        text,
        reason,
        ...(afterLineId === null ? {} : { afterLineId }),
        ...(ifVersion === null ? {} : { ifVersion }),
      }),
    }),

  /**
   * WRITE THE WHOLE DOCUMENT AS ONE PIECE OF TEXT. This is what the writing page saves.
   *
   * The stored rows are matched to the new text by their exact characters, so a line whose words
   * did not change keeps its row, the record it was filed as and its remark. A line whose words
   * changed is a removal and an addition, because guessing that one line "is" another would move a
   * binding onto a line nobody bound. `removedBindings` names the records whose lines are gone; the
   * records themselves are never touched.
   */
  writePlanBody: (id: string, body: string, ifVersion?: string) =>
    request<{
      lines: PlanLine[]
      removedBindings: { text: string; recordId: string; title: string | null }[]
      kept: number
      added: number
      removed: number
      /** What the plan holds after this write. Carry it into the next save as `ifVersion`. */
      version: string
      note: string
    }>(`/api/plans/${encodeURIComponent(id)}/body`, {
      method: 'PUT',
      // `ifVersion` NAMES THE COPY THIS SAVE WAS BUILT ON, and it is left out rather than sent empty
      // when the caller does not know it: the server refuses an empty one, and a precondition that
      // is quietly dropped is worse than none because the caller believes it is protected. A save
      // that carries it is answered 409 — nothing written — when somebody else has written since.
      body: json(ifVersion === undefined ? { body } : { body, ifVersion }),
    }),

  /**
   * CHANGE ONE LINE: its words, or the writer's own note about it.
   *
   * `remark` is the line's own note — the one thing on a plan row that is about the line rather than
   * about the record it names. Sending null clears it. A line's words and the title of the record it
   * was filed as are two separate facts, so writing either one here leaves the other exactly as it is.
   *
   * SAVING THE WHOLE DOCUMENT IS `writePlanBody`, NOT THIS. This is for a single cell edited in the
   * table, where nothing else in the document moved. Sending words through here for a line the
   * document has also changed would be two writers for one document.
   *
   * The server refuses an empty patch, and refuses words and a record in one request — pointing a
   * line at work is `pointLineAtWork` below, and the two are separate writes so that neither can half
   * happen. Those refusals arrive as an ApiError carrying the server's own sentence.
   */
  saveLine: (planId: string, lineId: string, patch: { text?: string; remark?: string | null }, ifVersion: string | null) =>
    request<{
      line: PlanLine
      /** What the plan holds after this write. Carry it into the next write as `ifVersion`. */
      version: string
      note: string
    }>(
      `/api/plans/${encodeURIComponent(planId)}/lines/${encodeURIComponent(lineId)}`,
      // REQUIRED FOR THE SAME REASON AS ON `savePlan`: null says on purpose that the caller has no version.
      { method: 'PATCH', body: json(ifVersion === null ? patch : { ...patch, ifVersion }) },
    ),

  /**
   * ONE LINE'S CHANGES, OLDEST FIRST, EACH WITH ITS REASON. Criterion P3.
   *
   * This is the read-back the revision table exists for. Each entry carries `op` (`added`,
   * `reordered` or `dropped`), `reason` in the writer's own words, `at` and `changedBy`. A line that
   * predates the table answers with an empty list AND a sentence saying the ledger starts when it
   * starts, so an empty list is never drawn as "nothing ever happened".
   */
  lineRevisions: (planId: string, lineId: string) =>
    request<{ lineId: string; revisions: PlanLineRevision[]; note: string }>(
      `/api/plans/${encodeURIComponent(planId)}/lines/${encodeURIComponent(lineId)}/revisions`,
    ),

  /**
   * POINT A LINE AT WORK THAT ALREADY EXISTS. Nothing is created and no record is changed.
   *
   * This is the other half of `fileLineAsWork`, and the repair for the one thing editing a plan
   * destroys: saving the document matches stored rows to the new text character for character, so
   * changing a line's words deletes its row and the record it was pointed at with it. Until this
   * call nothing in the browser could put that back.
   *
   * `replacing` IS THE ID THE LINE POINTS AT NOW. A line that already points somewhere is refused,
   * and the refusal names the record it points at; sending that id back as `replacing` is how Mole Office
   * knows the reader was looking at the same line it has. It is not a "yes, overwrite" flag — a flag
   * would only prove somebody pressed something.
   *
   * THE OTHER REFUSALS, each naming what is wrong: no record with that id, the record has been
   * deleted, and the record is a kind a plan cannot give time to. Show the server's sentence; every
   * one of them says what to do instead.
   *
   * `was` on the reply is what the line pointed at before. When it equals `work.id` the line already
   * pointed there and NOTHING WAS WRITTEN — the note says so, and a screen that reports "saved" for
   * that write is reporting a write that did not happen.
   */
  pointLineAtWork: (planId: string, lineId: string, input: { recordId: string; replacing?: string }) =>
    request<LineBound & { note: string }>(
      `/api/plans/${encodeURIComponent(planId)}/lines/${encodeURIComponent(lineId)}`,
      { method: 'PATCH', body: json(input) },
    ),

  /**
   * FILE ONE LINE AS WORK: create the record and bind the line to it, in one transaction.
   *
   * THE LINE'S WORDS SEED THE RECORD'S TITLE ONCE. After that they are two facts and nothing
   * derives one from the other; where they disagree the plan shows both. `workspaceId` says which
   * project the new record goes in and is required, because a record belongs to exactly one
   * project and a plan belongs to none.
   *
   * `under` ON THE REPLY IS THE HALF THAT MUST BE SHOWN. Filing a line also writes one "part of"
   * link to the item written above it in the plan — but only when that item is itself filed as work.
   * When it is not, NO LINK IS WRITTEN and no parent is invented, and `under.why` is the sentence
   * saying which of the reasons it was. A caller cannot see the absence of a link for itself, so a
   * screen that drops this tells the reader their item was placed under something when it was not.
   *
   * This wrapper used to declare four fields and `under` was not among them, so the bytes arrived and
   * nothing in the browser could name them. It is now the server's own `LineFiled` type.
   *
   * `data` goes on the new record as it is filed — `{effort_hours: 3}` sizes it in the same request.
   * Left out, the record is filed with nothing in it, which is the honest state of work nobody has
   * sized.
   */
  fileLineAsWork: (
    planId: string,
    lineId: string,
    input: {
      kind: RecordKind
      workspaceId: string
      summary?: string | null
      data?: Record<string, unknown>
    },
  ) =>
    request<LineFiled & { note: string }>(
      `/api/plans/${encodeURIComponent(planId)}/lines/${encodeURIComponent(lineId)}/file-as-work`,
      { method: 'POST', body: json(input) },
    ),

  /**
   * GIVE ONE LINE TIME: write one ordinary allocation, through the same rules every other surface
   * uses, recording which line it came from. The line must be filed as work first.
   *
   * `plannedHours` LEFT OUT MEANS SOMEBODY COMMITTED TO THIS WORK HERE WITHOUT SAYING FOR HOW LONG,
   * and nothing fills it in from the record's estimate. That is a real answer and it is not zero.
   *
   * TWO REFUSALS THIS PRESS WILL MEET, both carrying a sentence that names the row in the way:
   * hours cannot be given to a piece of work and to its parts in the same period, and one piece of
   * work has at most one allocation per period. Show the server's sentence — it names the record and
   * the period, which is everything the reader needs to fix it. Flattening it into "that did not
   * work" throws away the only useful half.
   */
  giveLineTime: (
    planId: string,
    lineId: string,
    input: { horizon: Grain; period: string; plannedHours?: number | null; note?: string | null },
  ) =>
    request<{ line: PlanLine; allocationId: string; note: string }>(
      `/api/plans/${encodeURIComponent(planId)}/lines/${encodeURIComponent(lineId)}/give-time`,
      { method: 'POST', body: json(input) },
    ),
}
