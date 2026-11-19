// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE AGENT REVIEW STEP: hand a plan's facts out, take advice back, and let the person commit it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * The owner's loop is: rough thinking, structured breakdown, AGENT REVIEW AND REFINEMENT, selected
 * items become or link to canonical work, global work management, Month/Week/Day, Today. This file
 * is the third step and only the third step. Their sentence about it governs every line here:
 *
 *   "The agent is advising and editing with me, not approving on my behalf."
 *
 * So there are two directions and they are not symmetrical.
 *
 *   OUT: `readPlanContext` — every fact an agent needs to review one plan, and no review. It reads.
 *        It writes nothing. It holds no opinion about the plan.
 *   IN:  `readPlanReviews` — the advice an agent has left about one plan. Reading it changes
 *        nothing either. Advice becomes a change to the project only when the person settles the
 *        fork and then presses apply, and both of those go through machinery that already refuses
 *        every agent.
 *
 * NOTHING IN THIS FILE WRITES. That is the boundary, stated as a property of the code rather than
 * as a promise in a document: there is no `db.insert`, no `db.update` and no `db.delete` below.
 *
 * ---------------------------------------------------------------------------------------
 * DECISION: THE PLAN IS THE STORE FOR ROUGH THINKING. THE DRAFT IS THE LOSER.
 * ---------------------------------------------------------------------------------------
 *
 * There were two stores for rough thinking until migration 0196, and that was the defect this
 * repository keeps producing — the same fact in two places, so the two can disagree:
 *
 *   `planning_drafts`  a title and one plain body. Nothing parsed it, nothing bound to it, and
 *                      `GET /api/planning/drafts/:id/context` was the critique route built on it.
 *   `plans`            the document, stored line by line, where a line can point at a real record,
 *                      carry the writer's own remark, and be given hours.
 *
 * **The plan wins.** Three reasons, in order of weight:
 *
 *   1. Only a plan can carry the next step of the loop. "Selected items become or link to canonical
 *      work" needs a per-line binding, and a draft has no lines to bind. A critique of a draft can
 *      only ever produce a change set about the project; a critique of a plan can also say "this
 *      line is already that record", which is the thing the owner actually wants.
 *   2. The plan is the surface they write on. `#/plans/:id` is the writing box, the table and now
 *      the review. `planning_drafts` had one screen: the Rough planning panel on the schedule page
 *      (`DraftsPanel` in src/web/pages/PlanPage.tsx), which listed, started and saved drafts.
 *   3. The tree comes free. `outlineOf` reads the breakdown out of the Markdown they already type,
 *      so an agent gets the hierarchy without anybody storing one.
 *
 * THE DRAFT IS RETIRED, AS ITEM 6 OF A DECISION SAYS, on report p414QK6jYovv and problem
 * k5FNfdgfxbt2. What this pass wrote down as the way to do it, and what was done:
 *
 *   a. The five `/api/planning/drafts` routes and `GET /api/planning/drafts/:id/context` are gone
 *      from `src/server/api/planning.ts`, with the paragraph about drafts in `PLANNING_ROUTE_NOTE`.
 *      What the context route handed an agent is handed by `readPlanContext` below: the structure
 *      of the projects read, this month's allocations and the two capacities, moved here with the
 *      route's own comments (`readProjectStructure`).
 *   b. `listDrafts`, `getDraft`, `createDraft`, `updateDraft`, `deleteDraft` and `PlanningDraft`
 *      are gone from `src/server/lib/planning.ts`, and `planning_drafts` from
 *      `src/server/db/schema.ts`. Migration 0196 turned each stored draft into a plan first; its
 *      data step is src/server/db/drafts-into-plans-migration.ts and says what it refuses.
 *   c. The Rough planning panel and the browser's draft calls are the web half of the same change.
 *   d. `Delta.fromDraft` in `src/shared/delta.ts` is kept: proposals already filed carry it, and
 *      reading an archived one must not break. `alsoNamesDraft` below shows it, `planOfDraft`
 *      reads the plan it became out of `plans.moved_from_draft`, and `readPlanReviews` lists such a
 *      proposal under that plan.
 *
 * ---------------------------------------------------------------------------------------
 * HOW A PROPOSAL SAYS WHICH PLAN IT IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * A plan is not a record, so no link row can join the two: `links` joins records. The proposal
 * carries the plan id in `data.extra`, which is the declared home for anything a kind has no field
 * for. `PLAN_KEY` below is the only place that key is written down and `planOfProposal` is the only
 * reader of it.
 *
 * NO NEW RECORD KIND AND NO NEW TABLE, for the same reasons `src/shared/delta.ts` gives: a proposal
 * is already the product's word for a fork a person must settle, it already has the governance
 * machinery, and adding a kind would be a governance decision nobody asked the owner for.
 */

import { eq } from 'drizzle-orm'
import { parentOf } from '@shared/containment.ts'
import { checkSubtraction, type LeftOutCounts, type LeftOutGroup, type WorkListBucket } from '@shared/disclosure.ts'
import { blocksOf } from '@shared/plandoc.ts'
import { deltaIn, summariseDelta, type Delta, type DeltaSummary } from '@shared/delta.ts'
import { effortOf, whatWasNotRead } from '@shared/envelope.ts'
import { flattenOutline, outlineOf, type OutlineItemKind } from '@shared/planoutline.ts'
import { parsePeriod, periodKey } from '@shared/planning.ts'
import type { PanelRecord } from '@shared/types.ts'
import { db } from '../db/client.ts'
import { plans as plansTable } from '../db/schema.ts'
import { allocationsCovering, capacityOf, withWork, type AllocationWithWork, type Capacity } from './planning.ts'
import { linesWithWork, mustGetPlan, type Plan, type PlanLineWithWork } from './plans.ts'
import {
  ACROSS_WORKSPACES,
  allLinks,
  getRecord,
  listRecords,
  proposalResolution,
  type ResolvingDecision,
} from './records.ts'
import { PanelError } from './panel-error.ts'
import { MAX_WORK_ROWS, readWorkList, type WorkRow } from './worklist.ts'
import { requireWorkspace } from './require-workspace.ts'

// ============================================================================ which plan a proposal is about

/**
 * The key inside a proposal's `data.extra` that names the plan it reviews.
 *
 * Written once. The route note quotes this constant, `planOfProposal` reads it, and the sentence an
 * agent is handed is built from it — so what Mole Office tells an agent to write and what Mole Office looks
 * for cannot come apart.
 */
export const PLAN_KEY = 'plan'

/**
 * Which plan a proposal is about, or null because it does not say.
 *
 * Deliberately forgiving about shape and strict about presence, the same way `deltaIn` is: anything
 * may be written into `extra`, so a value that is not a string is "it does not say" rather than an
 * error. A proposal about no plan is the ordinary case — most proposals in this corpus are about
 * the project rather than about a piece of writing.
 */
export function planOfProposal(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null
  const extra = (data as Record<string, unknown>)['extra']
  if (typeof extra !== 'object' || extra === null) return null
  const plan = (extra as Record<string, unknown>)[PLAN_KEY]
  return typeof plan === 'string' && plan.trim() !== '' ? plan : null
}

/**
 * THE PLAN A ROUGH DRAFT BECAME, or null because this database never moved a draft with that id.
 *
 * THE ONE READER OF `plans.moved_from_draft`. Migration 0196 kept a draft's id as its plan's id when no plan held
 * it, and gave the plan a new id when one did; the column says which in both cases. So an old draft id is never
 * read as a plan id directly: when the ids collided, the plan holding the draft's id is a different plan.
 * `Delta.fromDraft` on a proposal filed before the move is the reference this resolves, and the stored proposal is
 * left as it was written (the report's words: "Keep existing `Delta.fromDraft` data as history").
 */
export function planOfDraft(draftId: string): string | null {
  const row = db.select({ id: plansTable.id }).from(plansTable).where(eq(plansTable.movedFromDraft, draftId)).get()
  return row?.id ?? null
}

// ============================================================================ the facts, going out

/** One item of the plan's tree, as the context route sends it. */
export interface ContextItem {
  /** Which kind of line it was written as: a heading, a bullet, a tick box, a numbered item. */
  kind: OutlineItemKind
  /** How deep it sits. A top-level item is 0. Worked out from the words — see planoutline.ts. */
  depth: number
  /** The words, with the hashes, the bullet or the number taken off. */
  text: string
  /** The plan lines this item was made from, in the order they are stored. */
  lineIds: readonly string[]
  /** The items above it, outermost first, by their words. Empty means it is top level. */
  under: readonly string[]
  /**
   * The record the item's line points at, or null because it points at nothing.
   *
   * THIS ONE FIELD IS STORED AND THE REST OF THE ITEM IS WORKED OUT. It is carried here so that an
   * agent does not have to join items to lines by hand, and the reply's own note says which half is
   * which. An item made from more than one line takes the first binding it finds.
   */
  recordId: string | null
}

/** Which projects the context read, and why each one is in the list. */
export interface ProjectRead {
  workspaceId: string
  /** Why this project is here: the plan already names it, or the caller asked for it. */
  because: string
}

/** Everything an agent needs to review one plan, and no review. */
export interface PlanContext {
  /**
   * WHAT IS STORED. Every field below is a row as it sits in the database.
   */
  facts: {
    plan: Plan
    /**
     * Every line, in the order written, exactly as typed — blank lines included — each with the
     * record it points at when it points at one, and the writer's own remark.
     */
    lines: PlanLineWithWork[]
    /**
     * The work this plan's lines already point at, as `GET /api/work` describes it: what state each
     * is in, how big it is, everything it is part of, and EVERY PERIOD IT HAS HOURS IN.
     *
     * Read through `readWorkList`, which is the one reader of that shape, so this cannot disagree
     * with the work list, the schedule or the table about what a piece of work says.
     */
    work: WorkRow[]
    /**
     * Work this plan does NOT point at, in the projects it names. What the projects hold that this
     * plan might mean, so an agent can say "that is already filed" instead of proposing a duplicate.
     */
    nearby: WorkRow[]
    /**
     * WHAT THE PROJECTS READ HOLD, BY KIND: every module, pipeline, block, problem, direction, task and obligation
     * in them, with its state, its stated size and, for an obligation, its deadline exactly as stored.
     *
     * This is what `GET /api/planning/drafts/:id/context` handed an agent as `structure`, moved here when migration
     * 0196 made every draft a plan and that route went (problem k5FNfdgfxbt2). `nearby` is the work a plan might
     * mean; this is the shape of the project around it, the modules and pipelines included, which are not work and
     * so are not in `nearby`. Empty when no project is read.
     */
    structure: Record<StructureKind, StructureRow[]>
    /** Every allocation that covers this month, with the work each names. The draft context called it `plan`. */
    allocatedThisMonth: AllocationWithWork[]
    /** How many hours this week and this month hold, or null for one nobody has said. Null is not a full week. */
    capacity: { week: Capacity | null; month: Capacity | null }
  }
  /**
   * WHAT WAS WORKED OUT HERE, from the facts above, deterministically. Nothing here is stored and
   * nothing here is an opinion.
   */
  calculated: {
    /** The plan's tree, flat, in the order it is written. Read out of the Markdown every time. */
    outline: ContextItem[]
    items: number
    itemsAlreadyWork: number
    itemsNotWork: number
    /**
     * Hours over `facts.work`, and how much of it that total could not see.
     *
     * A PARENT'S ESTIMATE IS AN ENVELOPE AND ITS PARTS ARE THE BREAKDOWN. If this plan points at a
     * piece of work and at a part of that same work, the part is inside the whole and is never
     * added to it. That is `effortOf` in shared/envelope.ts, which is the only place in Mole Office
     * effort is added over a tree. Before 17 August 2026 this was a plain sum, so a plan pointing
     * at a module and its tasks handed an agent a total that counted them twice.
     *
     * `estimatedHours` is null when nobody has sized any of the work, which is not nought hours.
     * `withoutEstimate` is the count nobody has sized. A total that ignored them would be a floor
     * pretending to be a whole, which is the same refusal the drafts context made.
     */
    estimatedHours: number | null
    /**
     * The honest floor: what the work takes AT LEAST, for arithmetic about capacity.
     *
     * Different from `estimatedHours` only where the parts inside a piece of work add up to more
     * than the piece itself says. Trusted capacity arithmetic must
     * not pretend 18 fits inside 15 merely to preserve the envelope, so both numbers are here and
     * a reader picks the one their question is about.
     */
    estimatedAtLeastHours: number | null
    /**
     * Every estimate added up with nesting ignored, or null when nobody stated one.
     *
     * NOT A TOTAL TO ACT ON. It is here so a reply can explain why `estimatedHours` is smaller —
     * the same job `rowHours` does on a `Load` in shared/planning.ts.
     */
    everyEstimateAdded: number | null
    /** How many records carried an estimate at all. */
    estimatedFrom: number
    /** How many of them the total added, which is the outermost ones only. */
    countedAtTop: number
    withoutEstimate: number
    /**
     * What the nesting reading could not do, in one sentence, or null when it read everything.
     *
     * A row whose chain above stopped short — a loop in the stored data, two parents, or more
     * levels than the containment reader walks — may really sit inside another row of this plan,
     * and this total could not see it. Then the total may be too high and this says so.
     */
    nestingNotRead: string | null
    projectsRead: ProjectRead[]
    /** The week and the month `capacity` and `allocatedThisMonth` are about, by the server's own clock. */
    thisWeek: string
    thisMonth: string
    /**
     * HOURS OVER `facts.structure`, worked out the way the draft context worked them out, with the same envelope
     * rule: a part's hours are inside its whole and are not added to it. Null totals when nobody sized any of it,
     * which is not nought hours. See `readProjectStructure`.
     */
    projects: StructureEstimate
    /**
     * How complete the work list behind `work` and `nearby` is.
     *
     * `leftOut` above zero means `GET /api/work`'s cut fell inside this corpus, so `nearby` is not
     * all of it. `boundNotListed` names any record a line points at that the list did not carry —
     * which is what a deleted record looks like from here.
     */
    workList: {
      counted: number
      returned: number
      cap: number
      leftOut: number
      subtraction: LeftOutCounts
      leftOutGroups: LeftOutGroup<WorkListBucket>[]
    }
    boundNotListed: string[]
  }
  /**
   * THE WORDS TO HAND AN AGENT. One string, written by the server, copied by the browser.
   *
   * It lives here rather than in the browser because a sentence written in two places is the defect
   * this repository keeps producing: the browser would say "file a proposal with extra.plan" and
   * this file would look for something else, and nothing would fail.
   */
  ask: string
  note: string
}

/**
 * What one review of a plan looks like: the proposal, whether a person has settled it, and what it
 * would change.
 */
export interface PlanReview {
  /** The proposal itself, as stored. The fork, its options, the reasoning and the evidence. */
  proposal: {
    id: string
    title: string
    summary: string | null
    workspaceId: string
    data: Record<string, unknown>
    /**
     * WHEN IT WAS FILED. Not WHO filed it: a record carries no author, and who wrote it is in the
     * change log rather than on the row. A field here saying "an agent" would be a guess, and this
     * pane exists to draw what an agent left rather than to assert who left it.
     */
    createdAt: string
    updatedAt: string
  }
  /** True when a decision that is not deleted links to it. Read off the links, stored nowhere. */
  resolved: boolean
  /** Every decision that links here, deleted ones included, oldest link first. */
  settledBy: ResolvingDecision[]
  /** What each settling decision stores, by its id, so a reader can see which option was taken. */
  decisions: Record<string, Record<string, unknown>>
  /** The change set it carries, or null because it is advice with nothing to apply. */
  delta: Delta | null
  /** What that change set would do, counted. Null when there is no change set. */
  summary: DeltaSummary | null
  /**
   * The draft this proposal ALSO names, when its change set carries one.
   *
   * Shown rather than dropped. Two stores for rough thinking existed until migration 0196, so a
   * proposal filed before it can name a plan and a draft at once, and a reader who is told only about
   * the plan would not know that the agent was reading something else as well. See the decision at
   * the top of this file, and `draftBecamePlan` below for the plan that draft is now.
   */
  alsoNamesDraft: string | null
  /**
   * THE PLAN THE DRAFT IN `alsoNamesDraft` BECAME, or null.
   *
   * Migration 0196 moved every draft into a plan, keeping the draft's id when it was free and recording the
   * mapping in `plans.moved_from_draft` either way. `planOfDraft` reads it, so a proposal that named a draft whose
   * id was taken by another plan still finds the right one. Null when the proposal names no draft, or names one this
   * database never moved, which `alsoNamesDraft` tells apart.
   */
  draftBecamePlan: string | null
}

export interface PlanReviewsReply {
  plan: Plan
  reviews: PlanReview[]
  /**
   * How many of them nobody has settled yet.
   *
   * IT IS NOT "HOW MANY STILL WANT A PRESS", and the difference is worth stating. A fork a person
   * has settled may still be carrying a change set nobody has applied — but nothing stamps a
   * proposal when its change set is applied, so Mole Office cannot tell an applied one from an unapplied
   * one and does not guess. This counts the one thing it can read off the links: whether a decision
   * settles it.
   */
  waiting: number
  note: string
}

// ---------------------------------------------------------------------------- what the projects hold

/** The kinds the structure reads, in the order the draft context read them. */
export const STRUCTURE_KINDS = ['module', 'pipeline', 'block', 'problem', 'direction', 'task', 'obligation'] as const
export type StructureKind = (typeof STRUCTURE_KINDS)[number]

/** One record of the structure, as stored. */
export interface StructureRow {
  id: string
  workspaceId: string
  title: string
  summary: string | null
  state: unknown
  effortHours: unknown
  /** An obligation's deadline exactly as stored; absent on every other kind. */
  due?: unknown
  origin: string | null
}

/** Hours over the structure, and how much of it the total could not see. */
export interface StructureEstimate {
  estimated: number | null
  estimatedAtLeast: number | null
  everyEstimateAdded: number | null
  estimatedFrom: number
  countedAtTop: number
  withoutEstimate: number
  nestingNotRead: string | null
}

/**
 * WHAT THESE PROJECTS HOLD, by kind, and the hours over it.
 *
 * MOVED HERE FROM `GET /api/planning/drafts/:id/context` when migration 0196 made every draft a plan and that route
 * went, so a moved plan's context hands an agent everything the draft's did. The comments below are the route's
 * own, moved with the code.
 *
 * Read only for the projects the plan context already reads — the ones its lines point into and the ones the caller
 * named — never for every project, for the reason the draft route was workspace-scoped: handing over every
 * project's contents because a plan mentions two of them would be a way to read a project through the planning
 * door.
 */
export function readProjectStructure(workspaceIds: readonly string[]): {
  structure: Record<StructureKind, StructureRow[]>
  estimate: StructureEstimate
} {
  const loaded = STRUCTURE_KINDS.map(
    (kind) => [kind, workspaceIds.flatMap((workspaceId) => listRecords({ workspaceId, kind }))] as const,
  )
  const structure = Object.fromEntries(
    loaded.map(([kind, records]) => [
      kind,
      records.map((r): StructureRow => ({
        id: r.id,
        workspaceId: r.workspaceId,
        title: r.title,
        summary: r.summary,
        state: (r.data as { state?: unknown }).state ?? null,
        effortHours: (r.data as { effort_hours?: unknown }).effort_hours ?? null,
        // The deadline as STORED. It may be a date, a condition in words, or another record —
        // and it is handed over unread, because turning "mid September" into a date would be the
        // fabrication this whole surface exists to avoid.
        ...(kind === 'obligation' ? { due: (r.data as { due?: unknown }).due ?? null } : {}),
        origin: r.origin ?? null,
      })),
    ]),
  ) as Record<StructureKind, StructureRow[]>

  // THE SEVEN KINDS ARE ONE FLAT LIST AND FOUR OF THEM HOLD EACH OTHER. A pipeline holds its
  // blocks and a module holds its tasks, so adding every row was counting a piece of work and a
  // part of that same work. Until 17 August 2026 the draft context did exactly that, and an agent was
  // handed the doubled number as a fact.
  //
  // `parentOf` is the one containment reader — the same one the work list and the schedule use —
  // and `effortOf` is the one hierarchical effort arithmetic. Neither is repeated here. The
  // records are already loaded, so the only new cost is reading these projects' links once.
  const everyRecord = loaded.flatMap(([, records]) => records)
  const context = {
    records: everyRecord,
    links: workspaceIds.flatMap((workspaceId) =>
      allLinks(workspaceId).map((link) => ({ id: link.id, fromId: link.fromId, toId: link.toId, type: link.type })),
    ),
  }
  /** What somebody said this record takes, or null when what is stored is not a number of hours. */
  const sizeOf = (record: PanelRecord): number | null => {
    const stated = (record.data as { effort_hours?: unknown }).effort_hours
    return typeof stated === 'number' ? stated : null
  }
  const parents = new Map(everyRecord.map((record) => [record.id, parentOf(record, context)]))
  const effort = effortOf(
    everyRecord.map((record) => ({
      id: record.id,
      parentId: parents.get(record.id)?.parent?.id ?? null,
      ownHours: sizeOf(record),
    })),
  )
  // TWO THINGS SAY THEY HOLD THE SAME RECORD. `parentOf` will not choose between them, so the
  // record is counted on its own here and could be sitting inside one of them. Named rather than
  // hidden, because a total that quietly picked one would be a guess wearing a number.
  const twoParents = everyRecord.filter((record) => parents.get(record.id)?.conflict != null)
  const nestingNotRead =
    [
      whatWasNotRead(effort),
      twoParents.length === 0
        ? null
        : `${String(twoParents.length)} record${twoParents.length === 1 ? '' : 's'} here ${
            twoParents.length === 1 ? 'is' : 'are'
          } claimed by more than one thing, and Mole Office will not choose between them, so ` +
          `${twoParents.length === 1 ? 'it is' : 'they are'} counted on their own: ` +
          `${twoParents.map((record) => `"${record.title}"`).join(', ')}`,
    ]
      .filter((said): said is string => said !== null)
      .join(' ') || null

  return {
    structure,
    estimate: {
      // A PARENT'S ESTIMATE IS AN ENVELOPE AND ITS PARTS ARE THE BREAKDOWN. A block's hours are
      // inside its pipeline's, a task's inside its module's, and neither is added to it.
      estimated: effort.total,
      /** The honest floor, for anything about capacity. Larger where parts exceed their whole. */
      estimatedAtLeast: effort.atLeastTotal,
      /** Every estimate added on its own, nesting ignored. Here only to explain the difference. */
      everyEstimateAdded: effort.ownHoursAdded,
      estimatedFrom: effort.items.length - effort.withoutOwn,
      /** How many of them the total added, which is the outermost ones only. */
      countedAtTop: effort.totalFrom,
      withoutEstimate: effort.withoutOwn,
      nestingNotRead,
    },
  }
}

// ---------------------------------------------------------------------------- the facts

/**
 * Everything an agent needs to review one plan.
 *
 * `projects` are extra projects the caller wants read, on top of the ones the plan already names
 * through the records its lines point at. A project id nobody has is refused rather than skipped:
 * silently reading nothing for a name somebody typed would answer "there is no work like that
 * there" about a project that does not exist.
 */
export function readPlanContext(
  planId: string,
  opts: { projects?: readonly string[]; origin: string | null },
): PlanContext {
  const plan = mustGetPlan(planId)
  const lines = linesWithWork(planId)

  // The tree, read out of the words every time. `blocksOf` decides how a line is drawn and
  // `outlineOf` reads the levels out of that; both are the product's own single readers and neither
  // is repeated here.
  const flat = flattenOutline(outlineOf(blocksOf(lines.map(({ line }) => ({ id: line.id, text: line.text })))))
  const bindingOf = new Map(lines.map(({ line }) => [line.id, line.recordId]))
  const outline: ContextItem[] = flat.map(({ item, path }) => ({
    kind: item.kind,
    depth: item.depth,
    text: item.text,
    lineIds: item.lineIds,
    under: path.map((step) => step.text),
    recordId: item.lineIds.map((id) => bindingOf.get(id) ?? null).find((id) => id !== null) ?? null,
  }))

  const bound = new Set(lines.map(({ line }) => line.recordId).filter((id): id is string => id !== null))

  // ONE READER FOR THE WORK. `readWorkList` is what GET /api/work answers with, so the state, the
  // estimate, the containment chain and the hours an agent is handed here are the same numbers the
  // work page and the schedule show. Working them out again here is how the two come apart.
  const listed = readWorkList(MAX_WORK_ROWS)
  const byId = new Map(listed.rows.map((row) => [row.id, row]))
  const work = [...bound].map((id) => byId.get(id)).filter((row): row is WorkRow => row !== undefined)
  const boundNotListed = [...bound].filter((id) => !byId.has(id)).sort()

  // Which projects to read. The plan names the ones its own work sits in — the same argument the
  // planning routes make for taking no workspace header: the only projects read are the ones the
  // plan already names, by id, and every row says which project owns it.
  const named = new Map<string, ProjectRead>()
  for (const row of work) {
    if (!named.has(row.workspaceId)) {
      named.set(row.workspaceId, {
        workspaceId: row.workspaceId,
        because: 'a line of this plan points at work in it',
      })
    }
  }
  for (const asked of opts.projects ?? []) {
    // Refused loudly. `requireWorkspace` says what exists when the name is not one of them.
    requireWorkspace(asked, true)
    if (!named.has(asked)) {
      named.set(asked, { workspaceId: asked, because: 'the request asked for it' })
    }
  }
  const projectsRead = [...named.values()].sort((a, b) => a.workspaceId.localeCompare(b.workspaceId))
  const readingIds = new Set(projectsRead.map((entry) => entry.workspaceId))
  const nearby = listed.rows.filter((row) => readingIds.has(row.workspaceId) && !bound.has(row.id))

  const sized = work.filter((row) => typeof row.estimateHours === 'number')
  const itemsAlreadyWork = outline.filter((item) => item.recordId !== null).length

  // HOURS ARE ADDED IN ONE PLACE AND IT IS NOT HERE. This file's job is to say who holds whom;
  // `effortOf` does the arithmetic. A row's parent is the INNERMOST thing above it that this plan
  // also points at: `above` is the whole chain, outermost first, so reading it from the inside out
  // finds the nearest one. A row whose whole chain sits outside this plan has no parent here and is
  // counted on its own, which is right — nothing in this reply is counting the thing that holds it.
  const inThePlan = new Set(work.map((row) => row.id))
  const effort = effortOf(
    work.map((row) => ({
      id: row.id,
      parentId: [...row.above].reverse().find((step) => inThePlan.has(step.id))?.id ?? null,
      ownHours: row.estimateHours,
    })),
  )
  // A row whose chain above stopped short may really sit inside another row of this plan, unread.
  // Then the total is too high and nothing else here would say so.
  const chainStopped = work.filter((row) => row.aboveStopped !== null)
  const nestingNotRead =
    [
      whatWasNotRead(effort),
      chainStopped.length === 0
        ? null
        : `Mole Office could not read the whole chain above ${String(chainStopped.length)} of these records, so a ` +
          `part may have been counted beside the whole rather than inside it and this total may be too high: ` +
          `${chainStopped.map((row) => `"${row.title}" — ${row.aboveStopped ?? ''}`).join('; ')}`,
    ]
      .filter((said): said is string => said !== null)
      .join(' ') || null

  checkSubtraction('readPlanContext workList', listed.subtraction, listed.leftOutGroups)

  // WHAT THE DRAFT CONTEXT ALSO HANDED OVER, so a plan that was a draft is reviewed with no less than the draft
  // was: the structure of the projects read, this month's allocations and the two capacities. Worked out by the
  // server's clock, as that route did.
  const projectStructure = readProjectStructure(projectsRead.map((entry) => entry.workspaceId))
  const now = new Date()
  const thisWeek = periodKey('week', now)
  const thisMonth = periodKey('month', now)
  const monthPeriod = parsePeriod(thisMonth)
  const inMonth = monthPeriod === null ? [] : allocationsCovering(monthPeriod.from, monthPeriod.to)

  return {
    facts: {
      plan,
      lines,
      work,
      nearby,
      structure: projectStructure.structure,
      allocatedThisMonth: withWork(inMonth),
      capacity: { week: capacityOf('week', thisWeek), month: capacityOf('month', thisMonth) },
    },
    calculated: {
      outline,
      items: outline.length,
      itemsAlreadyWork,
      itemsNotWork: outline.length - itemsAlreadyWork,
      estimatedHours: effort.total,
      estimatedAtLeastHours: effort.atLeastTotal,
      everyEstimateAdded: effort.ownHoursAdded,
      estimatedFrom: sized.length,
      countedAtTop: effort.totalFrom,
      withoutEstimate: work.length - sized.length,
      nestingNotRead,
      projectsRead,
      thisWeek,
      thisMonth,
      projects: projectStructure.estimate,
      workList: {
        counted: listed.counted,
        returned: listed.returned,
        cap: listed.cap,
        leftOut: listed.leftOut,
        subtraction: listed.subtraction,
        leftOutGroups: listed.leftOutGroups,
      },
      boundNotListed,
    },
    ask: askForReview(plan, opts.origin),
    note: contextNote({
      items: outline.length,
      itemsAlreadyWork,
      withoutEstimate: work.length - sized.length,
      projects: projectsRead.length,
      leftOut: listed.leftOut,
      boundNotListed,
      nestingNotRead,
    }),
  }
}

/**
 * The sentence the context route answers with.
 *
 * Its whole job is to keep the two halves apart in the reader's head, and to say what the numbers
 * could not count. Every clause is about something a reader would otherwise get wrong.
 */
function contextNote(n: {
  items: number
  itemsAlreadyWork: number
  withoutEstimate: number
  projects: number
  leftOut: number
  boundNotListed: string[]
  nestingNotRead: string | null
}): string {
  return (
    'Everything an agent needs to review this plan, in one request, and no review. `facts` is what is ' +
    'STORED and `calculated` is what Mole Office worked out from it — keep them apart in anything you write ' +
    'back, and keep both apart from your own recommendation and from what you are uncertain about. THE ' +
    'TREE IS WORKED OUT FROM THE WORDS EVERY TIME and nothing stores a level: `calculated.outline` reads ' +
    'the headings, bullets, tick boxes and numbered items the person already typed. The one stored thing ' +
    'on an item is `recordId`, which is the line\'s own binding. ' +
    `${n.items} item${n.items === 1 ? '' : 's'}, ${n.itemsAlreadyWork} of which ` +
    `${n.itemsAlreadyWork === 1 ? 'is' : 'are'} already filed as work. ` +
    (n.withoutEstimate === 0
      ? ''
      : `ESTIMATES ARE INCOMPLETE ON PURPOSE: ${n.withoutEstimate} of the records this plan points at ` +
        'have no size on them, and a total that ignored them would be a floor pretending to be a whole. ') +
    'A PARENT\'S ESTIMATE IS AN ENVELOPE AND ITS PARTS ARE THE BREAKDOWN: where this plan points at a ' +
    'piece of work and at a part of that same work, the part is counted inside the whole and never added ' +
    'to it. So `calculated.estimatedHours` is normally smaller than `calculated.everyEstimateAdded`, ' +
    'which adds every row on its own and is there only to explain the difference. Use ' +
    '`calculated.estimatedAtLeastHours` for anything about capacity: where the parts inside a piece of ' +
    'work add up to more than the piece itself says, it is the larger number. ' +
    (n.nestingNotRead === null ? '' : `${n.nestingNotRead} `) +
    (n.projects === 0
      ? 'NO PROJECT WAS READ. No line of this plan points at work yet, so nothing here says what the ' +
        'projects already hold — which is not the same as their holding nothing. Ask again with ' +
        '?projects=<id>,<id> to have them read. '
      : `${n.projects} project${n.projects === 1 ? '' : 's'} read; ` +
        '`calculated.projectsRead` says which and why each one is in the list. ') +
    (n.leftOut === 0
      ? ''
      : `THE WORK LIST WAS CUT: ${n.leftOut} pieces of work are missing from it, so \`facts.nearby\` is ` +
        'not all of what the projects hold. ') +
    (n.boundNotListed.length === 0
      ? ''
      : `${n.boundNotListed.length} record${n.boundNotListed.length === 1 ? '' : 's'} a line points at ` +
        `could not be read back: ${n.boundNotListed.join(', ')}. A deleted record looks like this. ` +
        '`facts.lines` says which line points at each. ') +
    'THIS ROUTE CHANGES NOTHING and no review may: read `ask` for the one way advice reaches this plan.'
  )
}

/**
 * THE WORDS HANDED TO AN AGENT WHEN A PERSON ASKS FOR A REVIEW.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS AN ADDRESS AND NOT A COPY OF THE FACTS
 * ---------------------------------------------------------------------------------------
 *
 * The press on the plan page copies this string. It names the route rather than carrying the reply,
 * for one measurable reason: the person goes on writing. A snapshot pasted into an agent is a copy
 * of the plan as it was at the moment of the press, and it goes stale in the seconds it takes to
 * switch windows. An address is read when it is read.
 *
 * ---------------------------------------------------------------------------------------
 * WHY COPYING AND NOT FILING THE ASK AS A RECORD
 * ---------------------------------------------------------------------------------------
 *
 * The other honest option was to file the request where an agent would find it — a record saying
 * "review this plan". It was rejected and this is the reason, so that nobody has to work it out
 * again:
 *
 *   1. NOTHING POLLS MOLE OFFICE. No agent watches this database, so a filed ask would sit unread until
 *      a person told an agent about it anyway — one more record and the same conversation.
 *   2. A RECORD BELONGS TO EXACTLY ONE PROJECT AND A PLAN BELONGS TO NONE. Filing the ask would
 *      make the person choose a project for a request that is not about one.
 *   3. IT WOULD BE A WRITE THIS STEP DOES NOT NEED. Asking for advice is not a fact about the
 *      project.
 *
 * Copying changes nothing, needs no project, and puts the exact words in the person's hands. What
 * it costs is that the person has to paste them somewhere, which is what they were going to do.
 *
 * `origin` is where Mole Office answered the request that produced this text — the address the reader
 * actually reached it at. Null when the request carried no host, and then the path is given on its
 * own and says so, rather than a made-up host being printed as if it were known.
 */
export function askForReview(plan: Plan, origin: string | null): string {
  const path = `/api/plans/${encodeURIComponent(plan.id)}/context`
  const where =
    origin === null
      ? `${path} — on whichever address Mole Office is serving; this request did not say which one it came in on`
      : `${origin}${path}`
  return [
    `Please review my plan "${plan.title}" and tell me what you think.`,
    '',
    `Read the facts here first: GET ${where}`,
    '',
    'That reply holds the document as written, its tree, which items are already filed as real work,',
    'what those records say, what hours they have, and what the projects already hold. It separates',
    'what is STORED from what Mole Office WORKED OUT. Keep those apart in what you write back, and keep',
    'both apart from your own recommendation.',
    '',
    'Then file what you think as a proposal:',
    '',
    '  POST /api/records',
    '  {',
    '    "kind": "proposal",',
    '    "title": "<one line>",',
    '    "data": {',
    '      "question": "<what I have to decide>",',
    '      "options": ["<one>", "<another>"],',
    '      "recommendation": "<which one you would take, or leave it out>",',
    '      "because": "<your reasoning>",',
    '      "evidence": ["<what you actually observed>"],',
    `      "extra": { "${PLAN_KEY}": "${plan.id}" }`,
    '    }',
    '  }',
    '',
    `The "${PLAN_KEY}" line is what puts your advice on this plan's page. Without it I will not see it.`,
    '',
    'If you want to propose actual changes — new records, an estimate, a link, hours — put a change',
    'set in "extra"."delta" as well, one typed operation per change, each with a "says" line I can',
    'read on its own. Anything you could not work out goes in as an "unresolved" operation with the',
    'reason. Do not guess.',
    '',
    'YOU MAY NOT MAKE ANY OF IT HAPPEN. You are advising and editing with me, not approving on my behalf.',
    'Nothing you file changes the plan or files work by itself: I settle the fork and I press apply, and',
    'the server refuses both to an agent. Do not write a decision, do not promote the proposal, and do not',
    'apply the change set.',
  ].join('\n')
}

// ---------------------------------------------------------------------------- the advice

/**
 * Every piece of advice an agent has left about one plan, newest first.
 *
 * ACROSS EVERY PROJECT, because a plan belongs to none. A proposal about this plan may have been
 * filed in whichever project the agent was working in, and one that only looked in the project on
 * screen would hide advice depending on which switch the reader had last touched.
 */
export function readPlanReviews(planId: string): PlanReviewsReply {
  const plan = mustGetPlan(planId)

  // A PROPOSAL ABOUT THE DRAFT THIS PLAN WAS IS ADVICE ABOUT THESE WORDS. It was filed through the draft context
  // before migration 0196 and names the draft in `Delta.fromDraft`, not the plan in `extra.plan`, so it is found
  // through the mapping and never by reading the draft id as a plan id. See `planOfDraft`.
  const becameThisPlan = (record: { data: unknown }): boolean => {
    const draft = deltaIn(record.data)?.fromDraft
    return typeof draft === 'string' && draft !== '' && planOfDraft(draft) === planId
  }
  const reviews = listRecords({ workspaceId: ACROSS_WORKSPACES, kind: 'proposal' })
    .filter((record) => planOfProposal(record.data) === planId || becameThisPlan(record))
    .map((record): PlanReview => {
      const resolution = proposalResolution(record)
      if (resolution === null) {
        // `listRecords` was asked for proposals and `proposalResolution` answers null for anything
        // that is not one. Reaching this means those two disagree about what a proposal is, which
        // is a broken assumption rather than a state to draw.
        throw new PanelError(
          `Record ${record.id} came back from a query for proposals and then was not read as one. ` +
            'Nothing can honestly be said about whether it has been settled, so this list is not ' +
            'answered at all rather than answered with a hole in it.',
          500,
        )
      }
      const delta = deltaIn(record.data)
      // What each settling decision stores, so the panel can say WHICH option was taken rather than
      // only that something was decided. Read by primary key, deleted ones included, because a
      // withdrawn decision is still what settled the fork at the time and the panel draws that.
      const decisions: Record<string, Record<string, unknown>> = {}
      for (const decision of resolution.by) {
        const found = getRecord(decision.id)
        if (found !== null) decisions[decision.id] = found.data
      }
      return {
        proposal: {
          id: record.id,
          title: record.title,
          summary: record.summary,
          workspaceId: record.workspaceId,
          data: record.data,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        },
        resolved: resolution.resolved,
        settledBy: resolution.by,
        decisions,
        delta,
        summary: delta === null ? null : summariseDelta(delta),
        alsoNamesDraft: delta?.fromDraft ?? null,
        draftBecamePlan: delta?.fromDraft == null || delta.fromDraft === '' ? null : planOfDraft(delta.fromDraft),
      }
    })

  const waiting = reviews.filter((review) => !review.resolved).length

  return {
    plan,
    reviews,
    waiting,
    note:
      reviews.length === 0
        ? 'No agent has filed anything about this plan. THAT IS NOT A REVIEW SAYING THE PLAN IS FINE — ' +
          'it means nobody has left one. `ask` on GET /api/plans/' +
          `${plan.id}/context is the words to hand an agent.`
        : `${reviews.length} piece${reviews.length === 1 ? '' : 's'} of advice about this plan, newest ` +
          `first, from every project. ${waiting === 0 ? 'Every one of them has been settled by a person.' : `${waiting} ${waiting === 1 ? 'is' : 'are'} waiting on a person to settle.`} ` +
          'NONE OF IT HAS CHANGED ANYTHING. A proposal is advice: it becomes a change to the project only ' +
          'when a person settles the fork and then applies the change set, and both of those refuse every ' +
          'agent.',
  }
}
