// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `/api/plan-graph` — WHAT THIS PERIOD IS WORKING TOWARD, AND WHICH OF IT IS ACTUALLY ALLOCATED.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE QUESTION THIS ANSWERS
 * ---------------------------------------------------------------------------------------
 *
 *     What goal or deadline am I working toward, what work and future branches lead there,
 *     and which parts are actually allocated?
 *
 * Three things are therefore in one reply and nothing else is: the goals (obligations, with their
 * `due` as stored), the work and the future branches around them (task, block, module, problem,
 * direction), and the plan's own allocations laid over the top.
 *
 * WHAT THIS IS NOT, said out loud because three drawings already exist next door and none of them
 * is being rebuilt here. It is NOT the pipeline execution graph (`pipeline:<id>` in
 * web/components/graph) — that answers what waits on what inside one pipeline. It is NOT the module
 * evolution graph — that answers how one module changed. It is NOT a Gantt chart: there is no bar,
 * no length, no position along a time axis, and NOTHING here computes a date. `due` is served
 * exactly as it is stored, and the arithmetic on it belongs to `src/shared/deadlines.ts`, which this
 * file deliberately does not import.
 *
 * ---------------------------------------------------------------------------------------
 * THE PLANNING BOUNDARY, KEPT RATHER THAN RESTATED
 * ---------------------------------------------------------------------------------------
 *
 * `lib/planning.ts` states the rule: **planning reads records only by the ids the plan already
 * names.** There is exactly one record read on the planning side of this file, and it is
 * `withWork()`, which fetches by primary key. No query here ranges over a workspace on behalf of
 * the plan.
 *
 * So the drawing has two halves and they meet without either one crossing:
 *
 *   THE STRUCTURE   is workspace-owned and comes from `lib/records.ts`, through the ordinary gate:
 *                   `workspaceOf(req)` decides it, exactly as every other route.
 *   THE ALLOCATIONS are person-level and span projects, so they are read for the whole period and
 *                   then SPLIT: an allocation naming work in this project becomes a mark on a card,
 *                   and an allocation naming work in another project is NAMED IN `elsewhere` and
 *                   NEVER DRAWN.
 *
 * That split is the boundary made visible rather than a limitation. Drawing the other project's
 * work would mean reading its links, and reading its links is the "planning became a way to read
 * another project" failure the rule exists to prevent. Counting it, naming it and saying which project it
 * belongs to costs nothing, because the plan already named those ids.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH CARDS ARE DRAWN — ONE RULE, STATED ONCE, APPLIED TO EVERY SORT OF ANCHOR
 * ---------------------------------------------------------------------------------------
 *
 * An ANCHOR is drawn because of what it is:
 *
 *   every live `goal` in this project             — what the work below it is for
 *   every live `obligation` in this project        — the deadline being worked toward
 *   every live `direction` in this project         — a future branch, planned and NOT adopted
 *   every record this period allocates time to     — what is actually being spent on
 *
 * and then EVERY RECORD ONE LINK FROM AN ANCHOR is drawn too, when it is work: `task`, `block`,
 * `module`, `problem`. AND THE WORK THAT SERVES A GOAL IS ALWAYS DRAWN, whatever kind it is: a
 * `serves` link may run from a trajectory, which is not one of those four kinds, and a goal whose
 * serving work was counted rather than drawn would read as a goal with nothing under it. That is
 * "what leads there", measured from the stored links rather than assumed from a hierarchy.
 *
 * ONE LINK AND NOT TWO. Two hops from 48 problems is most of the project, and a drawing that holds
 * most of a project answers no question at all — the module graph next door measured that exact
 * failure at 27 nodes. One hop is the smallest depth at which "what leads to this deadline" has an
 * answer, so it is the depth used, and everything the rule leaves out is counted and named in
 * `omitted` rather than quietly dropped.
 *
 * A NEIGHBOUR THAT IS NOT WORK IS NOT DRAWN, with the one exception above: the work that serves a
 * goal is drawn whatever kind it is. The kinds left out are counted by name. A session, a claim, a
 * message or a proposal beside an obligation is real and is not what this question is about.
 *
 * NOTHING IS PROMOTED. A `direction` is drawn as a direction whatever else is true of it. It may be
 * allocated — `ALLOCATABLE_KINDS` includes it on purpose, so that exploring a branch can be planned
 * — and an allocated direction is drawn as an allocated DIRECTION, never as adopted work. It has no
 * `effort_hours` and none is invented for it.
 *
 * ---------------------------------------------------------------------------------------
 * NO LAYOUT LEAVES THIS FILE
 * ---------------------------------------------------------------------------------------
 *
 * No x, no y, no size, no colour, no order-on-screen. `src/shared/presentation.ts` states the rule
 * and `lib/presentation.ts` enforces it with a written refusal; this route stays on the meaning side
 * of it. What comes back is records, links and allocations, and where each card goes is worked out
 * by ELK in the browser on every draw and stored nowhere.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { GRAINS, parsePeriod, type Allocation, type Grain } from '@shared/planning.ts'
import { BLOCK_KIND } from '@shared/blocks.ts'
import { LINK_TYPES, type LinkType, type PanelRecord, type RecordKind } from '@shared/types.ts'
import { readFulfilment, type Gate } from '@shared/work.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { onlyTheMessagesThisReaderMayRead, theMessageReader } from '../lib/messages.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { getWorkspace } from '../db/get-workspace.ts'
import { allocationsCovering, withWork } from '../lib/planning.ts'
import { allGatedLinks, listRecords, pipelineTitlesByBlock } from '../lib/records.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'

/**
 * What a card is, in this drawing's own terms. Four answers and they are four different claims.
 *
 *   `goal`       — what the work below it is for. A goal has not happened: it is the aim the work
 *                  serves, and `serves` is drawn in the intent family for that reason. Criterion P1
 *                  of design/planning/ACCEPTANCE.md.
 *   `deadline`   — an obligation. Somebody outside is waiting, and `due` says when, as stored.
 *   `direction`  — a future branch. PLANNED IS NOT ADOPTED, and this word is what keeps them apart.
 *   `work`       — a task, a block, a module or a problem: the current, adopted work.
 *
 * A GOAL IS AN ANCHOR AND WEARS ITS OWN ROLE NOW. Criterion P1 puts a goal at the root of the
 * drawing beside the obligations and directions (see PLAN_ANCHOR_KINDS) and names a goal nothing
 * serves through the omitted path. `roleOf` answers `goal` for it, and the drawing's card, word and
 * colour are its own (`--plan-goal`). The work that serves it is drawn below it through the stored
 * `serves` links, including a trajectory, which the ordinary one-link rule would otherwise count
 * rather than draw.
 */
export type PlanNodeRole = 'goal' | 'deadline' | 'direction' | 'work'

/**
 * The kinds that are drawn as `work`. A neighbour of any other kind is counted rather than drawn —
 * except the work that serves a goal, which is drawn whatever kind it is. See `isDrawnNeighbour`.
 */
export const PLAN_WORK_KINDS: readonly RecordKind[] = ['task', 'block', 'module', 'problem']

/** The kinds that anchor the drawing by being what they are. */
export const PLAN_ANCHOR_KINDS: readonly RecordKind[] = ['goal', 'obligation', 'direction']

/** One card. Nothing here restates a layout and nothing here is computed from a clock. */
export interface PlanGraphNode {
  recordId: string
  kind: RecordKind
  role: PlanNodeRole
  /** The canonical title, whatever it is. */
  title: string
  /**
   * What to CALL it on a card, which for a block is not its title.
   *
   * The same problem `AllocatedWork.name` solves in `lib/planning.ts`: three blocks of one pipeline
   * drawn with their qualified titles are three records reading identically down their visible half.
   * Split with `splitBlockTitle`, which is shared/blocks.ts's own splitter.
   */
  name: string
  /** For a block, the pipeline its name belongs to. Null for everything else. */
  within: string | null
  /** Its own state word, whatever its kind uses. Null when it has none — never invented. */
  state: string | null
  /** A direction's place on the depth ladder. Null on every other kind, and null when unrecorded. */
  depth: string | null
  /** The estimate on the WORK in total. Null when nobody estimated it; a direction never has one. */
  effortHours: number | null
  /**
   * An obligation's `due`, EXACTLY AS STORED, and null when the record holds none.
   *
   * It is `unknown` because the stored shape is `date | PauseUntil` — a string, or an object saying
   * what has to happen first. Nothing here parses it, compares it or decides whether it has passed:
   * that arithmetic lives in `src/shared/deadlines.ts` and is another agent's. An obligation with no
   * `due` at all is a real state of this corpus and comes back as null rather than as a guess.
   */
  due: unknown
  /**
   * Whether an obligation has been DISCHARGED, and what settled it. Null on every other kind.
   *
   * WHY A CARD HAS TO SAY THIS. A drawing that answers "what am I working toward" put a kept promise
   * on the canvas with a date that had gone, and it read as late — `Trial report: depth-error figures`,
   * `state: fulfilled`, due 2026-08-05. Dropping it silently would have been worse in the other
   * direction: a reader who expects that deadline must not find it absent with nothing said. So it
   * is drawn and it says it is settled.
   *
   * Read with `readFulfilment`, which is the one reader of the three fields that record a discharge,
   * rather than by testing state words here — `fulfilled`, `cancelled` and a bare `done: true` all
   * mean discharged, and a second opinion about which words count is how two surfaces come to
   * disagree about whether a promise was kept.
   */
  settled: { at: string | null; note: string | null } | null
  /** How this card got into the drawing. See the header's one rule. */
  drawn: 'anchor' | 'one link from an anchor'
  /** The anchors it is one link from, by record id. Empty on an anchor. */
  oneLinkFrom: string[]
  /**
   * THE RECORD ITSELF, so the drawing can read what it has written at each level.
   *
   * WHY THE ROUTE SENDS IT. A card on the plan drawing is the same card as a card on the module
   * drawing, and that card's ladder is read from the record — `wordsOf` and `levelsOf`, the two
   * readers in src/web/lib/nodewords.ts. The module drawing has the whole project's records in the
   * browser and calls them there. This route decides on the server which records a period reaches,
   * so without this the browser would have these nodes and nothing to read a level from, and the
   * plan drawing would need a card of its own again.
   *
   * THE RECORD AND NOT THE ANSWER, and that is the choice rather than an accident. Reading the
   * levels here would put `reportAt` into the API server, and through it `src/shared/pictures.ts`,
   * which is one of the seven files only the browser loads — measured with the repository's own
   * import walk, and `tests/a-program-is-judged-on-the-files-it-is-built-from.test.ts` is the
   * measurement. Sending the record costs bytes this reply was going to spend on the parts anyway
   * and adds nothing to what the server is built from.
   *
   * THE FIELDS ABOVE ARE NOT A SECOND COPY OF IT. They are the PLAN's reading of the record — what
   * to call it on a card, what the period gives it, how it got onto the drawing — and none of them
   * is derivable from the record alone.
   */
  record: PanelRecord
  /**
   * Every allocation covering this period that names this record, at ANY horizon.
   *
   * A LIST AND NEVER A SUM. `shared/planning.ts` states that hours are never added across horizons:
   * a week planning 8 hours with 3 of them on a Monday is 8 hours of work, not 11. So the rows come
   * back as rows, each saying its own horizon and period, and whoever draws them prints them one per
   * line. Empty means this period's plan gives it no time — which is a distinction this drawing
   * exists to show, not an absence to hide.
   */
  allocations: Allocation[]
}

/** One line between two records. The stored link, and how hard it blocks when it says. */
export interface PlanGraphEdge {
  id: string
  from: string
  to: string
  type: LinkType
  /** The link type's forward label, from LINK_TYPES. Not a second vocabulary. */
  label: string
  /** How much this dependency blocks, in the shared contract's words. Null when it does not say. */
  gateLabel: string | null
  /** True when the row stores a gate word Mole Office cannot read. Reported, never treated as "hard". */
  gateProblem: string | null
  broken: boolean
  /**
   * The gate itself, as the row stores it, so the drawing has the thing and not only its label.
   *
   * The label above is what a person reads on the line; this is what the drawing needs to draw the
   * arrowhead — a filled head is a hard gate, a notched one is partial. Null where the row states
   * no gate, and null where it states one Mole Office cannot read, which `gateProblem` says.
   */
  gate: Gate | null
}

/**
 * Work this period allocates time to that belongs to ANOTHER project.
 *
 * NAMED, COUNTED, AND NOT DRAWN. See the header: the plan already names these ids, so saying what
 * they are costs nothing; reading their links would be this route ranging over a project the caller
 * did not ask about. A reader who wants the picture switches project — and the sentence says so.
 */
export interface PlanGraphElsewhere {
  recordId: string
  kind: RecordKind
  title: string
  name: string
  within: string | null
  workspaceId: string
  /** Null when the record the allocation names is gone entirely. The row is kept and says so. */
  gone: boolean
  allocations: Allocation[]
}

/** Something this drawing leaves out, counted and with the reason in words. */
export interface PlanGraphOmission {
  count: number
  what: string
  why: string
}

export interface PlanGraphReply {
  horizon: Grain
  period: string
  /** The local days this period covers, both ends included. Computed by parsePeriod, never stored. */
  from: string
  to: string
  /** Which project's structure was drawn. A plan is not workspace-owned; a structure is. */
  workspaceId: string
  /**
   * What that project is CALLED, so the browser does not have to print its id.
   *
   * The browser names every project through one function, `projectName(id, title)`, and that
   * function falls back to the id when nobody hands it a title. Without this field the drawing read
   * "only panelx is drawn" while the rail four inches away read "PanelX" — one project with two
   * spellings, and nothing failing when they disagreed. The registry is the only place a project's
   * title is stored, and this is it, sent once.
   */
  workspaceTitle: string
  nodes: PlanGraphNode[]
  edges: PlanGraphEdge[]
  elsewhere: PlanGraphElsewhere[]
  omitted: PlanGraphOmission[]
  /** What this reply is, in words, including every case that is not "here is a drawing". */
  note: string
}

const params = z.strictObject({
  horizon: z.enum(GRAINS, { error: `horizon must be one of: ${GRAINS.join(', ')}` }),
  period: z.string().min(1),
})

export const PLAN_GRAPH_ROUTE_NOTE =
  'What a planning period is working toward, drawn: GET /api/plan-graph/<month|week|day>/<period>. It answers one ' +
  'question — what goal or deadline am I working toward, what work and future branches lead there, and which parts ' +
  'are actually allocated. The records are every goal, every obligation and every direction in THIS project, every ' +
  'record this period allocates time to, and everything one stored link from those that is a task, block, module or ' +
  'problem, plus the work that serves a goal through a `serves` link, which may be a trajectory; ' +
  `everything the rule leaves out is counted and named in \`omitted\`. UNLIKE THE REST OF /api/planning THIS ROUTE ` +
  'TAKES A WORKSPACE, because a structure is workspace-owned even though a plan is not: allocations naming work in ' +
  'another project come back in `elsewhere`, named and counted but not drawn, because drawing them would mean ' +
  'reading a project the caller did not ask about. `due` is served EXACTLY AS STORED and nothing here compares it ' +
  'to a clock — an obligation with no due comes back null rather than as a guess. Allocations ride on each card as ' +
  'a LIST, one row per horizon, and are never added together: a week planning 8 hours with 3 on a Monday is 8 ' +
  'hours of work. Nothing in the reply is a position, a size or a colour: the layout is derived in the browser on ' +
  'every draw and stored nowhere.'

/**
 * What to call a record on a card, and which pipeline a block is in.
 *
 * A BLOCK'S NAME IS ITS TITLE, since a decision. This used to cut the pipeline off the
 * front of the title; the pipeline is now read from its own order, by `pipelineTitlesByBlock`,
 * because that is where the fact lives. A block no pipeline lists has no `within`.
 */
function nameOf(
  record: Pick<PanelRecord, 'id' | 'kind' | 'title'>,
  within: Map<string, string>,
): { name: string; within: string | null } {
  if (record.kind !== BLOCK_KIND) return { name: record.title, within: null }
  return { name: record.title, within: within.get(record.id) ?? null }
}

/** A string field out of a record's data bag, or null. Never a default and never a guess. */
function word(record: PanelRecord, key: string): string | null {
  const value = record.data[key]
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/**
 * Whether an obligation has been discharged, and what settled it.
 *
 * `readFulfilment` is the one reader of the three fields that record a discharge, and it is called
 * rather than tested here: `fulfilled`, `cancelled` and a bare `done: true` all mean discharged, and
 * a second opinion about which words count is how two surfaces come to disagree about whether a
 * promise was kept.
 */
function settlementOf(record: PanelRecord): { at: string | null; note: string | null } | null {
  if (record.kind !== 'obligation') return null
  const fulfilment = readFulfilment(record.data)
  return fulfilment.done ? { at: fulfilment.at, note: fulfilment.note } : null
}

/**
 * The horizons the drawn allocations are actually AT, in coarse-to-fine order, as words.
 *
 * A card is allocated when any period covering this window gives it time, so a day's drawing shows
 * records whose hours are on the week. Saying "3 records have time in 2026-08-10" was therefore false
 * about the day, while the plan panel beside it correctly said the day held nothing.
 */
function allocatedGrains(reply: Pick<PlanGraphReply, 'nodes'>): string[] {
  const seen = new Set<string>()
  for (const node of reply.nodes) for (const a of node.allocations) seen.add(a.horizon)
  const order: Grain[] = ['month', 'week', 'day']
  const words: Record<Grain, string> = { month: 'the month', week: 'the week', day: 'the day' }
  return order.filter((h) => seen.has(h)).map((h) => words[h])
}

/** Which of the four a kind is drawn as. */
function roleOf(kind: RecordKind): PlanNodeRole {
  if (kind === 'goal') return 'goal'
  if (kind === 'obligation') return 'deadline'
  if (kind === 'direction') return 'direction'
  return 'work'
}

/**
 * Whether a record one link from an anchor is drawn rather than counted.
 *
 * THE ORDINARY RULE IS `PLAN_WORK_KINDS`. The one addition is the work that serves a goal: a
 * `serves` link may run from a trajectory, which is not one of those kinds, and a goal whose
 * serving work was counted rather than drawn would read as a goal with nothing under it. The link
 * guard already limits the serving end to a trajectory, an obligation, a task or a module, so this
 * draws the end the link really has rather than naming the allowed kinds a second time.
 */
function isDrawnNeighbour(kind: RecordKind, servesAGoal: boolean): boolean {
  return (PLAN_WORK_KINDS as readonly string[]).includes(kind) || servesAGoal
}

/**
 * The note's sentence for a drawing on which nothing has time in the period. Exported so the test
 * reads the sentence from here rather than writing it out a second time.
 */
export function nothingHereHasTimeIn(period: string): string {
  return (
    `Nothing on this drawing has any of ${period} allocated to it, which is different from a period ` +
    `with no plan: the plan for ${period} is where work is given time, and none of it is here.`
  )
}

/**
 * The whole answer in one sentence, built from the arrays it describes.
 *
 * IT READS THE REPLY RATHER THAN THE WORKINGS, which is the point: every count in it is a
 * `.length` of something the caller also received, so the sentence and the drawing cannot say
 * different numbers. Exported because the test calls it on hand-built replies, which is how the
 * empty cases are proved without a corpus that happens to have them.
 */
export function describePlanGraph(reply: Omit<PlanGraphReply, 'note'>): string {
  const deadlines = reply.nodes.filter((n) => n.role === 'deadline')
  const dated = deadlines.filter((n) => n.due !== null)
  const directions = reply.nodes.filter((n) => n.role === 'direction')
  const allocated = reply.nodes.filter((n) => n.allocations.length > 0)
  const elsewhereRows = reply.elsewhere.reduce((total, row) => total + row.allocations.length, 0)

  if (reply.nodes.length === 0) {
    const nothing =
      `Nothing in "${reply.workspaceId}" is a goal, an obligation, a future branch or work this period gives time ` +
      `to, so there is no drawing for ${reply.period}. That is an answer about the records, not a failure to ` +
      `draw: a deadline here is an obligation and a future branch is a direction, and this project has none.`
    return elsewhereRows === 0
      ? nothing
      : `${nothing} ${elsewhereRows} allocation${elsewhereRows === 1 ? '' : 's'} in ${reply.period} ` +
          `give${elsewhereRows === 1 ? 's' : ''} time to work in ${
            reply.elsewhere.length === 1 ? `the ${reply.elsewhere[0]?.workspaceId} project` : 'other projects'
          }, listed below with the project each belongs to. ${elsewhereRows === 1 ? 'It is' : 'They are'} not ` +
          `drawn here, because drawing ${elsewhereRows === 1 ? 'it' : 'them'} would mean reading a project this ` +
          `page did not ask about — switch project to see ${elsewhereRows === 1 ? 'it' : 'them'}.`
  }

  const goal =
    deadlines.length === 0
      ? `Nothing in "${reply.workspaceId}" is an obligation, so this drawing has no deadline in it and the ` +
        `question "what am I working toward" has no recorded answer here.`
      : `${deadlines.length} deadline${deadlines.length === 1 ? '' : 's'}, ` +
        (dated.length === deadlines.length
          ? `${deadlines.length === 1 ? 'and it says' : 'and each says'} when it is owed.`
          : dated.length === 0
            ? deadlines.length === 1
              ? 'and it does not record when it is owed, so nothing here can say when it is due.'
              : 'and not one of them records when it is owed, so nothing here can say what is due first.'
            : `${dated.length} of which record when they are owed; the other ${deadlines.length - dated.length} ` +
              `${deadlines.length - dated.length === 1 ? 'does' : 'do'} not.`)

  const branches =
    directions.length === 0
      ? 'No direction is on file, so there is no future branch to distinguish from adopted work.'
      : `${directions.length} future ${directions.length === 1 ? 'direction' : 'directions'}, drawn as directions ` +
        `and not as work: a direction may be planned without ever being adopted into a pipeline, and nothing ` +
        `here promotes one.`

  // THE GOALS AT THE ROOT, when there are any. Read by role, which is now the goal's own. Not a
  // restatement of the omitted entry: this counts every goal on the drawing, and the omitted entry
  // names the ones nothing serves. Criterion P1.
  const goals = reply.nodes.filter((n) => n.role === 'goal')
  const goalsSaid =
    goals.length === 0
      ? ''
      : `${goals.length} goal${goals.length === 1 ? '' : 's'} on this drawing, and the work that serves ${
          goals.length === 1 ? 'it' : 'them'
        } hangs below. `

  const plan =
    allocated.length === 0
      ? nothingHereHasTimeIn(reply.period)
      : `${allocated.length} of the ${reply.nodes.length} records ${allocated.length === 1 ? 'has' : 'have'} time in ` +
        `a period covering ${reply.period}; the other ${reply.nodes.length - allocated.length} do not. ` +
        // NAMING THE GRAINS IS THE POINT, not decoration. A card is drawn as allocated when ANY
        // period covering this window gives it time, so on a day the three records allocated are
        // usually allocated to the WEEK — and the plan page beside it, which counts the day alone,
        // says "nothing is planned, 0h". Both were true and together they read as a contradiction.
        // An independent reviewer hit it on 2026-08-10 and reported the drawing as saying something
        // false. Each card prints its own rows; this says which grains are in play at all.
        `Those hours sit on ${allocatedGrains(reply).join(' and ')}, and hours are printed one row per horizon ` +
        `and never added across them.`

  const across =
    elsewhereRows === 0
      ? ''
      : ` ${elsewhereRows} allocation${elsewhereRows === 1 ? '' : 's'} in this period name work in another ` +
        `project and ${elsewhereRows === 1 ? 'is' : 'are'} in \`elsewhere\` rather than on the drawing.`

  return `${goalsSaid}${goal} ${branches} ${plan}${across}`
}

export async function planGraphRoutes(app: FastifyInstance): Promise<void> {
  app.get('/plan-graph/:horizon/:period', route('plan.week', 'remote', PLAN_GRAPH_ROUTE_NOTE),
    async (req): Promise<PlanGraphReply> => {
    const { horizon, period } = parse(params, req.params, 'That is not a period this can draw:')
    const parsed = parsePeriod(period)
    if (parsed === null || parsed.horizon !== horizon) {
      throw new PanelError(
        `"${period}" is not a ${horizon}. A month is 2026-09, a week is 2026-W36 (ISO-8601, Monday first), ` +
          `a day is 2026-09-07.`,
      )
    }
    const workspaceId = workspaceOf(req)
    // THE PROJECT'S NAME, READ FROM THE REGISTRY, so the browser can print it instead of the id.
    // `workspaceOf` has already refused an id the registry does not hold, so a miss here is not a
    // caller's mistake — it is the registry changing under one request, and it is said out loud
    // rather than turned into an id printed where a name belongs.
    const workspace = getWorkspace(workspaceId)
    if (workspace === null) {
      throw new Error(`unreachable: the project "${workspaceId}" passed the gate and is not in the registry`)
    }

    // ---- the plan, read for the whole period, at every horizon ------------------------------
    //
    // `allocationsCovering` touches the allocations table and nothing else; `withWork` is the one
    // record read on this side and it is by primary key. Grouped by record, NOT summed: see the
    // field docstring on `PlanGraphNode.allocations`.
    const entries = withWork(allocationsCovering(parsed.from, parsed.to))
    const planned = new Map<string, Allocation[]>()
    for (const entry of entries) {
      const list = planned.get(entry.allocation.recordId)
      if (list === undefined) planned.set(entry.allocation.recordId, [entry.allocation])
      else list.push(entry.allocation)
    }

    // ---- the structure, through the ordinary workspace gate -----------------------------------
    // NO MESSAGE THE CALLER MAY NOT READ is drawn, counted or joined by a line.
    const reader = theMessageReader(actorFrom(req))
    const every = listRecords({ workspaceId })
    const records = onlyTheMessagesThisReaderMayRead(reader, every)
    const kept = new Set(records.map((one) => one.id))
    const hidden = new Set(every.filter((one) => !kept.has(one.id)).map((one) => one.id))
    const byId = new Map(records.map((record) => [record.id, record]))
    const links = allGatedLinks(workspaceId).filter((link) => !hidden.has(link.fromId) && !hidden.has(link.toId))

    // ---- the anchors --------------------------------------------------------------------------
    const anchors = new Map<string, PanelRecord>()
    for (const record of records) {
      if ((PLAN_ANCHOR_KINDS as readonly string[]).includes(record.kind)) anchors.set(record.id, record)
    }
    for (const recordId of planned.keys()) {
      const record = byId.get(recordId)
      // A record the plan names that is not in this project is not an anchor here. It is not
      // dropped either — it comes back in `elsewhere`, below.
      if (record !== undefined) anchors.set(record.id, record)
    }

    // ---- one link out from every anchor -------------------------------------------------------
    const neighbours = new Map<string, string[]>()
    const skippedKinds = new Map<string, number>()
    const see = (anchor: PanelRecord, otherId: string, type: LinkType): void => {
      const other = byId.get(otherId)
      if (other === undefined) return
      if (anchors.has(other.id)) return
      // A `serves` LINK INTO A GOAL DRAWS WHATEVER SERVES IT, including a trajectory. The ordinary
      // rule would count a trajectory rather than draw it, and a goal whose serving work was
      // counted would read as a goal with nothing under it. Criterion P1.
      const servesThisGoal = type === 'serves' && anchor.kind === 'goal'
      if (!isDrawnNeighbour(other.kind, servesThisGoal)) {
        skippedKinds.set(other.kind, (skippedKinds.get(other.kind) ?? 0) + 1)
        return
      }
      const from = neighbours.get(other.id)
      if (from === undefined) neighbours.set(other.id, [anchor.id])
      else if (!from.includes(anchor.id)) from.push(anchor.id)
    }
    for (const link of links) {
      const from = anchors.get(link.fromId)
      if (from !== undefined) see(from, link.toId, link.type)
      const to = anchors.get(link.toId)
      if (to !== undefined) see(to, link.fromId, link.type)
    }

    // ---- the records ----------------------------------------------------------------------------
    //
    // WHICH PIPELINE EACH BLOCK IS IN, asked once for the whole drawing rather than per card.
    const inAPipeline = pipelineTitlesByBlock(
      [...byId.values()].filter((record) => record.kind === BLOCK_KIND).map((record) => record.id),
    )
    const build = (record: PanelRecord, drawn: PlanGraphNode['drawn'], oneLinkFrom: string[]): PlanGraphNode => {
      const effort = record.data['effort_hours']
      const { name, within } = nameOf(record, inAPipeline)
      return {
        recordId: record.id,
        kind: record.kind,
        role: roleOf(record.kind),
        title: record.title,
        name,
        within,
        state: word(record, 'state'),
        depth: record.kind === 'direction' ? word(record, 'depth') : null,
        effortHours: typeof effort === 'number' ? effort : null,
        // Served as it sits in the bag. `undefined` would vanish through JSON, and "the key is not
        // there" and "the key holds null" are the same answer here: nobody recorded when it is owed.
        due: record.kind === 'obligation' ? (record.data['due'] ?? null) : null,
        settled: settlementOf(record),
        record,
        drawn,
        oneLinkFrom,
        allocations: planned.get(record.id) ?? [],
      }
    }
    const nodes: PlanGraphNode[] = [
      ...[...anchors.values()].map((record) => build(record, 'anchor', [])),
      ...[...neighbours.entries()].map(([recordId, from]) =>
        build(byId.get(recordId) as PanelRecord, 'one link from an anchor', from),
      ),
    ]

    // ---- the lines: every stored link with both ends on the drawing ---------------------------
    const drawnIds = new Set(nodes.map((node) => node.recordId))
    const edges: PlanGraphEdge[] = links
      .filter((link) => drawnIds.has(link.fromId) && drawnIds.has(link.toId))
      .map((link) => ({
        id: link.id,
        from: link.fromId,
        to: link.toId,
        type: link.type,
        label: LINK_TYPES[link.type].forward,
        gateLabel: link.gateLabel,
        gateProblem: link.gateProblem,
        broken: link.broken,
        gate: link.gate,
      }))

    // ---- what the plan names that this project does not hold ----------------------------------
    const elsewhere: PlanGraphElsewhere[] = []
    for (const [recordId, allocations] of planned) {
      if (drawnIds.has(recordId)) continue
      const work = entries.find((entry) => entry.allocation.recordId === recordId)?.work ?? null
      elsewhere.push(
        work === null
          ? {
              recordId,
              // The record the allocation names is gone entirely. The row is kept, because a period
              // that quietly lost an allocation would be worse than one that says so — the same
              // rule `AllocationWithWork.work` is null for.
              kind: 'note' as RecordKind,
              title: recordId,
              name: recordId,
              within: null,
              workspaceId: '(no record)',
              gone: true,
              allocations,
            }
          : {
              recordId,
              kind: work.kind,
              title: work.title,
              name: work.name,
              within: work.within,
              workspaceId: work.workspaceId,
              gone: work.deleted,
              allocations,
            },
      )
    }

    // ---- what is left out, counted and named --------------------------------------------------
    const omitted: PlanGraphOmission[] = []
    for (const [kind, count] of [...skippedKinds].sort((a, b) => b[1] - a[1])) {
      omitted.push({
        count,
        what: `${kind} record${count === 1 ? '' : 's'} beside something drawn here`,
        why:
          `A ${kind} is not one of the kinds this drawing calls work (${PLAN_WORK_KINDS.join(', ')}), so it is ` +
          `counted rather than drawn. It is on its own record page in full.`,
      })
    }
    // A GOAL NOTHING SERVES IS NAMED, NOT LEFT AS A LONE CARD WITH NOTHING SAID. Criterion P1. Read
    // from the stored links rather than from `edges`, so a trajectory that serves a goal counts even
    // though a trajectory is not one of the kinds this drawing calls work.
    const goalsDrawn = nodes.filter((node) => node.kind === 'goal')
    if (goalsDrawn.length > 0) {
      const goalIds = new Set(goalsDrawn.map((node) => node.recordId))
      const served = new Set<string>()
      for (const link of links) {
        if (link.type !== 'serves') continue
        if (goalIds.has(link.fromId)) served.add(link.fromId)
        if (goalIds.has(link.toId)) served.add(link.toId)
      }
      const unserved = goalsDrawn.filter((node) => !served.has(node.recordId)).length
      if (unserved > 0) {
        omitted.push({
          count: unserved,
          what: `goal${unserved === 1 ? '' : 's'} nothing serves`,
          why:
            'A goal is what the work below it is for. Nothing joins this one to any work with a `serves` link ' +
            'yet, so it is drawn as an aim with nothing under it rather than as an empty part of the drawing.',
        })
      }
    }

    const rest = records.length - nodes.length
    if (rest > 0) {
      omitted.push({
        count: rest,
        what: `other records in "${workspaceId}"`,
        why:
          'Nothing joins them to this question: none is a goal, an obligation, a direction or allocated in this ' +
          'period, and none is one stored link from anything that is.',
      })
    }

    const reply = {
      horizon,
      period,
      from: parsed.from,
      to: parsed.to,
      workspaceId,
      workspaceTitle: workspace.title,
      nodes,
      edges,
      elsewhere,
      omitted,
    }
    return { ...reply, note: describePlanGraph(reply) }
  })
}
