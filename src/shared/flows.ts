// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FLOWS PAGE'S READS: their query words and the shapes they answer. By one decision the Flows page is a page of its
 * own, fast with many flows. Another puts it under All projects.
 * This was wave 13p round 33, the first of the five rounds of proposal report 4mwraeIStEe8.
 *
 *   GET /api/flows?limit=&offset=&q=&sort=&projects=&with=&role=&replaced=   a page of flows, with each flow's run counts
 *   GET /api/flows/<id>                                       one flow's main content and its latest runs
 *   GET /api/flows/<id>/runs?limit=&offset=                   a page of one flow's runs, newest first
 *
 * GET /api/flows ANSWERS ITS OLD REPLY WHEN NONE OF `FLOW_LIST_WORDS` IS SENT: the steward's inventory of proposal
 * 1LaCQBRYRjls option A, `{count, flows:[{id, title, declared_in, problems, problemIds}]}`, read in the header's project
 * as before. Any one of the words asks for the page instead. This is the way src/shared/across-projects.ts keeps the
 * old reading for a door that learns to read across projects.
 *
 * The server and the page read these names from here, so a word cannot drift between them.
 */
import { PROJECTS_QUERY } from './across-projects.ts'
import type { FlowAppliesTo } from './flow-applies-to.ts'
import type { FlowRetired } from './flow-retired.ts'
import type { FlowHandbookRead } from './handbooks.ts'

/** How a page of flows is ordered: by runs in the last 30 days, by the newest run, or by title. */
export const FLOW_SORTS = ['runs', 'last', 'name'] as const
export type FlowSort = (typeof FLOW_SORTS)[number]

/** The order a page of flows takes when `sort` is not sent. By title, so the order does not move while runs are filed. */
export const DEFAULT_FLOW_SORT: FlowSort = 'name'

/** What `?with=` may add to a page of flows: each flow's problems, counted for that page's flows only. */
export const FLOW_LIST_WITH = ['problems'] as const

/** The words that ask GET /api/flows for a page. Without any of them it answers its old reply. */
export const FLOW_LIST_WORDS = ['limit', 'offset', 'q', 'sort', PROJECTS_QUERY, 'with', 'role', 'replaced'] as const

/** The one value of `?replaced=`: it hands back the replaced flows, which a page otherwise only counts (round 40). */
export const FLOW_REPLACED_SHOW = 'show'

/** How many rows a page holds when `limit` is not sent, and the most it may hold. */
export const FLOW_PAGE_LIMIT = 25
export const FLOW_PAGE_LIMIT_MOST = 100

/** How many of a flow's latest runs GET /api/flows/<id> hands back. The rest are paged by GET /api/flows/<id>/runs. */
export const LATEST_FLOW_RUNS = 20

/** The days `runs30d` counts back from now. */
export const FLOW_RUN_DAYS = 30

/** One flow on a page of flows. */
export interface FlowListRow {
  id: string
  /** The project the flow is filed in. */
  project: string
  title: string
  /** Who runs the flow, the flow's `data.runs`. Null when the record holds none. */
  runsBy: string | null
  trigger: string | null
  /** How many stages the flow has. */
  stages: number
  /** How many runs named this flow in the last 30 days, in any project. Zero is a real answer. */
  runs30d: number
  /** When the newest run that named this flow was filed, in any project; null when no run ever named it. */
  lastRunAt: string | null
  /** Only with `?with=problems`: how many live problems in the flow's project link to it with `about`, and which. */
  problems?: number
  problemIds?: string[]
  /** Whom the flow is for, its `data.applies_to`; null when nobody has said. */
  appliesTo: FlowAppliesTo | null
}

/**
 * A FOLDED FLOW on a page of flows: with the live flows that replace it, by title, and its retired mark when it carries
 * one (round 40b). A retired flow that nothing replaces has an empty `replacedBy`.
 */
export interface FlowReplacedRow extends FlowListRow {
  replacedBy: { id: string; title: string; project: string }[]
  retired: FlowRetired | null
}

/** A page of flows, as GET /api/flows answers when one of `FLOW_LIST_WORDS` is sent. */
export interface FlowListPage {
  /**
   * EACH PROJECT'S OWN CURRENT FLOWS (wave 13p round 40). A flow is left out of them when a live flow supersedes it or
   * it carries a retired mark, which is `replaced`, or when its `applies_to.scope` is general, which is `general`. The page's paging covers these.
   */
  flows: FlowListRow[]
  /** How many of each project's own current flows match the search and the role in the projects read. */
  matched: number
  returned: number
  left: number
  /** The request for the next page, or null when this is the last one. */
  next: string | null
  /** The projects read, by id. */
  projects: string[]
  sort: FlowSort
  /**
   * How many runs filed in the projects read named no flow at all, ever. Not narrowed by the search, which looks in
   * flow titles. A run that named a flow id no flow record has is not counted here: it named one.
   */
  runsNamingNoFlow: number
  /**
   * THE GENERAL FLOWS: current flows whose `applies_to.scope` is general, read from every project the reader may read,
   * whichever projects were asked, narrowed by the search and the role, in the page's order. Not paged.
   */
  general: { flows: FlowListRow[]; matched: number }
  /**
   * THE FOLDED FLOWS IN THE PROJECTS READ: flows a live flow supersedes, and flows with a retired mark (round 40b),
   * matched by the search but not by the role. `matched` counts them all, each once; `retired` counts those of them that
   * carry a retired mark. `flows` is null until `?replaced=show` asks; then every one, by title.
   */
  replaced: { matched: number; retired: number; flows: FlowReplacedRow[] | null }
  /** Only when `?role=` is asked: how many of each project's own current flows nobody has said whom they are for. */
  notClassified: number | null
}

/** One stage of a flow as the Flows page reads it. `why` and `sources` are there only when the second level is asked. */
export interface FlowStageRead {
  n: number | null
  does: string
  evidence: string | null
  why?: string | null
  sources?: string[]
}

/** One run of a flow, as the Flows page draws it over the flow's stages. */
export interface FlowRunRead {
  /** The flow run record. */
  id: string
  /** The run it records, the session record's id; null when the flow run names none. */
  run: string | null
  /** The project the run was filed in. */
  project: string
  /** When the flow run was filed. */
  at: string
  /** How many steps it recorded. */
  steps: number
  /** The outcome of the last step it recorded, or null when it recorded none. */
  outcome: string | null
  /**
   * The outcome at each stage number a step recorded, in the order the steps were taken. NULL WHEN NO STEP RECORDED A
   * STAGE NUMBER, which today is nearly every run: the office's own steps carry none.
   */
  stagesRecorded: { n: number; outcome: string }[] | null
}

/** A page of one flow's runs, newest first. */
export interface FlowRunsPage {
  flow: string
  runs: FlowRunRead[]
  matched: number
  returned: number
  left: number
  next: string | null
}

/** One flow, as GET /api/flows/<id> answers. */
export interface FlowRead {
  id: string
  project: string
  title: string
  /** The version a write to the flow sends as `ifVersion`. */
  version: string
  runsBy: string | null
  trigger: string | null
  leavesBehind: string | null
  declaredIn: string | null
  governedBy: string | null
  reviewedAt: string | null
  /** Whom the flow is for, its `data.applies_to`; null when nobody has said. */
  appliesTo: FlowAppliesTo | null
  stages: FlowStageRead[]
  /** The flow's record of changes, only when the second level is asked. */
  stepChanges?: unknown[]
  /** Every run that named this flow, in any project, and how many of them in the last 30 days. */
  runs: { count: number; runs30d: number; lastRunAt: string | null }
  latestRuns: FlowRunRead[]
  /** Every live handbook on the flow or on one of its steps, in any state, in the order they were filed. */
  handbooks: FlowHandbookRead[]
  /** What was left out and how to ask for it, or null when the second level was asked. */
  secondLevel: { held: string[]; ask: string } | null
}

/**
 * WHETHER THE ASKER MAY WRITE A FLOW, by the rule the five writes apply (wave 13p round 37). `because` is the sentence a
 * write would be refused with, or null when it would not be refused for who is asking.
 */
export interface FlowMayWrite {
  mayWrite: boolean
  because: string | null
}

/**
 * WHAT A WRITE TO A FLOW ANSWERS (wave 13p round 34). Small, main content first: the new version,
 * the stages by place and what each does, and one line on the change entry written. A change or a remove also quotes the
 * stage as it was, its why and its sources, so whoever changed it sees what they replaced.
 */
export interface FlowWriteAnswer {
  /** The version the next write to the flow sends as `ifVersion`. */
  version: string
  stages: { n: number; does: string }[]
  /** One line on the change entry this write added, or on why it added none. */
  change: string
  /** The stage before a change or a remove. `why` is null when the stage had none written. */
  was?: { n: number; does: string; why: string | null; sources: string[] }
  /** The flow written, and the project it is filed in. */
  flow: string
  project: string
}

/**
 * WHAT PATCH /api/flows/<id> ANSWERS (wave 13p round 40): the new version, and the flow's trigger, who runs it and whom it
 * is for as they now stand.
 */
export interface FlowFactsAnswer {
  nothingWritten?: string
  version: string
  flow: string
  project: string
  trigger: string | null
  runsBy: string | null
  appliesTo: FlowAppliesTo | null
}
