// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * GET /api/flows — THE READ DOOR OVER THE FLOW REGISTER. Proposal 1LaCQBRYRjls option A.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A NEW DOOR RATHER THAN kind=flow ON THE RECORDS DOOR
 * ---------------------------------------------------------------------------------------
 *
 * GET /api/records?kind=flow already lists the register, and it stays the way to read a flow's own
 * keys. The steward of the three-day inventory asks a different question — which flows have
 * problems — and answering it off the records door would mean walking every link in a caller
 * outside the office, per flow, by hand. The count and the per-flow problem counts assembled in
 * one reply is what this door is; the reading is src/server/lib/flows.ts, and this file adds
 * nothing to the answer and takes nothing away.
 *
 * GET /api/flows is a read and nothing else: it checks nothing against a flow and blocks nothing —
 * the proposal settled the register as a list with no gate, and this door is the one place the
 * inventory reads its count.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIVE WRITES, from wave 13p round 34, by two decisions.
 * ---------------------------------------------------------------------------------------
 *
 *   POST   /api/flows                          flow.create        a new flow in the project it names
 *   POST   /api/flows/<id>/stages              flow.stage.add     a stage at a place
 *   PATCH  /api/flows/<id>/stages/<n>          flow.stage.change  one stage's words, why and sources
 *   POST   /api/flows/<id>/stages/<n>/move     flow.stage.move    one stage to another place
 *   DELETE /api/flows/<id>/stages/<n>          flow.stage.remove  one stage
 *
 * The four stage writes build the flow's data after the write with `buildAFlowStageWrite` in
 * src/shared/flow-step-writes.ts, which the flow editor of round four calls too, so the two refuse the
 * same things. Each writes its own change entry from the request's why and cause; nobody sends one.
 * Each carries `ifVersion`, and a version that is not the flow's is refused with its code before
 * anything else is read, while the gate writes-from-a-stale-copy is at block. The write goes through `patchRecord`, as every other write to a record does,
 * so the revision, the change row and the shared check all happen as they do on the records
 * door. A create goes through `createRecord`, and writes no change entry.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { EVERY_PROJECT, PROJECTS_QUERY } from '@shared/across-projects.ts'
import type { FlowAppliesTo } from '@shared/flow-applies-to.ts'
import {
  DEFAULT_FLOW_SORT,
  FLOW_LIST_WITH,
  FLOW_LIST_WORDS,
  FLOW_PAGE_LIMIT,
  FLOW_PAGE_LIMIT_MOST,
  FLOW_REPLACED_SHOW,
  FLOW_SORTS,
  type FlowFactsAnswer,
  type FlowListPage,
  type FlowMayWrite,
  type FlowRunsPage,
  type FlowWriteAnswer,
} from '@shared/flows.ts'
import { buildAFlowStageWrite, stagesInBrief, type FlowStageWrite } from '@shared/flow-step-writes.ts'
import { idsIn } from '@shared/flow-steps.ts'
import { isAProjectOnAList } from '@shared/workspaces.ts'
import type { PanelRecord } from '@shared/types.ts'
import { kindWord } from '@shared/words.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { getWorkspace } from '../db/get-workspace.ts'
import { route } from '../lib/route.ts'
import { nothingWrittenSentence } from '../lib/records/patching.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { theProjectsAQueryAsks } from '../lib/across-projects.ts'
import { theMessageReader } from '../lib/messages.ts'
import { theRoleCards } from '../lib/roles.ts'
import { aCodedFlowRefusal, checkTheFlowSteps, missingRecords, refuseTheFirstLack, theSecondLevelIsAsked } from '../lib/flow-reasons.ts'
import { SECOND_LEVEL_PARAM } from '@shared/second-level-fold.ts'
import { createRecord, getRecord, patchRecord, recordInWorkspace, whyAnUnregisteredAgentMayNotWrite } from '../lib/records.ts'
import { now } from '@shared/now.ts'
import { PanelError } from '../lib/panel-error.ts'
import { versionOf } from '../lib/version.ts'
import { readAFlowsRuns, readAPageOfFlows, readFlowInventory, readOneFlow, type FlowInventory } from '../lib/flows.ts'
import { gateMet, gateMetOnceTheWriteIsTakenBack } from '../lib/gate-counts.ts'
import { gatePosition } from '../../config/settings.mjs'

/**
 * The sentence GET /api serves for this endpoint, built beside the reply's own words rather than
 * restated, so what the index says and what the door answers cannot drift.
 */
export const FLOWS_NOTE =
  'The flow register: GET /api/flows. One office flow per record elsewhere; this door answers "which flows are there ' +
  'and which of them have problems" in one call: the count of flow records in this project, and per flow its id, ' +
  'its title, where it is declared today, and how many live problem records link to it through an `about` link ' +
  '(with their ids). Zero problems on a flow is a real answer, read as such. IT READS AND WRITES NOTHING: a ' +
  'flow is counted here and judged nowhere — the register has no gate, on the settled proposal. A flow\'s own ' +
  'keys are read through GET /api/kinds/flow and the records door, not here.' +
  ' WITH ANY OF ?limit=, ?offset=, ?q=, ?sort=, ?projects= OR ?with= it answers a page of flows instead (the ' +
  'Flows page): {flows:[{id, project, title, runsBy, trigger, stages, runs30d, lastRunAt}], matched, ' +
  'returned, left, next, projects, sort, runsNamingNoFlow}. limit is 1 to ' + String(FLOW_PAGE_LIMIT_MOST) + ' (' + String(FLOW_PAGE_LIMIT) +
  ' when left out); q is looked for in the title; sort is ' + FLOW_SORTS.join(', ') + ' (' + DEFAULT_FLOW_SORT + ' when left ' +
  'out); projects is all or one project id; with=problems adds problems and problemIds to each row. Runs are counted ' +
  'in whichever project they were filed. runsNamingNoFlow counts the runs filed in the projects read that named no ' +
  'flow at all, whatever q says. THREE GROUPS (wave 13p round 40): flows holds each project\'s own current flows, and ' +
  'is what limit and offset page. A flow a live flow supersedes is replaced: replaced:{matched, flows} counts them in ' +
  'the projects read, and flows is null until replaced=show hands back every one by title, each with replacedBy:[{id, ' +
  'title, project}]. A flow whose applies_to.scope is general stands in general:{flows, matched}, read from every ' +
  'project whichever were asked. Each row carries appliesTo, whom the flow is for, or null when nobody has said. ' +
  'role=<a role card> keeps the current and general flows that reach that role by name or by rung, and notClassified ' +
  'counts the current flows nobody has said whom they are for; it is null when no role is asked.'

const ONE_FLOW_NOTE =
  'One flow: GET /api/flows/<id>. Its main content, its run counts and its latest runs, newest ' +
  'first: {id, project, title, version, runsBy, trigger, leavesBehind, declaredIn, governedBy, reviewedAt, appliesTo, stages:[{n, ' +
  'does, evidence}], runs:{count, runs30d, lastRunAt}, latestRuns:[{id, run, project, at, steps, outcome, ' +
  'stagesRecorded}], handbooks:[{id, title, state, languages, onTheFlow, steps}], secondLevel, narrowedByPermission}. stagesRecorded is null ' +
  'when a run recorded no stage number. handbooks lists every handbook on the flow or on its steps, in any state, that is filed in a ' +
  'project you may read; narrowedByPermission counts the others, without their ids or titles, and is null when there are none. Each stage\'s why and ' +
  'sources and the record of changes are left out until ?secondLevel=show asks. ?projects= ' +
  'finds the flow in those projects instead of the header\'s. An id that is not a flow is refused.'

const FLOW_RUNS_NOTE =
  'A page of one flow\'s runs: GET /api/flows/<id>/runs?limit=&offset=. Newest first, in ' +
  'whichever project each was filed: {flow, runs:[{id, run, project, at, steps, outcome, stagesRecorded}], matched, ' +
  'returned, left, next}. limit is 1 to ' + String(FLOW_PAGE_LIMIT_MOST) + ' (' + String(FLOW_PAGE_LIMIT) + ' when left out).'

const MAY_WRITE_NOTE =
  'Whether you may write a flow: GET /api/flows/may-i-write. Answers {mayWrite, because} by the rule the five writes ' +
  'apply: every writer except an agent the office has not registered, and a retired agent is registered. because is the ' +
  'sentence a write would be refused with, or null. A name that means two agents is refused 409, as a write would be.'

const FLOW_CREATE_NOTE =
  'A new flow: POST /api/flows {project, title, runsBy, trigger, leavesBehind, declaredIn, stages:[{does, evidence?, why, ' +
  'sources:[id]}]}. It is filed in the project the body names. Each stage ' +
  'needs a why and at least one source that is a record. No cause is asked and no change entry ' +
  'is written. Answers 201 {version, stages:[{n, does}], change, flow, project}.'

const STAGE_ADD_NOTE =
  'Add a stage to a flow: POST /api/flows/<id>/stages {ifVersion, at, does, evidence?, why, sources:[id], standing?, ' +
  'cause}. at is the place it goes, from 1 to one past the last stage; the stages after it move down one. standing true ' +
  'makes it a standing stage, given to every round and worker start the flow applies to. The door writes the change ' +
  'entry itself from why and cause. Answers {version, stages:[{n, does}], change, flow, project}.'

const STAGE_CHANGE_NOTE =
  'Change one stage of a flow: PATCH /api/flows/<id>/stages/<n> {ifVersion, does?, evidence?, why, sources:[id], ' +
  'standing?, cause}. n is the stage\'s place, from 1. why and sources replace the stage\'s own; does and evidence are ' +
  'kept when left out, and an empty evidence takes it off. standing true makes it a standing stage and false makes it ' +
  'not one; left out, it is kept. A change of standing alone still sends the stage\'s why and sources, and a cause. The ' +
  'door writes the change entry from why and cause. Answers {version, ' +
  'stages:[{n, does}], change, was:{n, does, why, sources}, flow, project}, where was is the stage before the change.'

const STAGE_MOVE_NOTE =
  'Move one stage of a flow: POST /api/flows/<id>/stages/<n>/move {ifVersion, to, why, cause}. n and to are places, ' +
  'from 1. A move writes a change entry with its why and cause. Answers {version, stages:[{n, does}], change, flow, project}.'

const STAGE_REMOVE_NOTE =
  'Remove one stage of a flow: DELETE /api/flows/<id>/stages/<n> {ifVersion, why, cause}. n is the stage\'s place, from ' +
  '1; the stages after it move up one. The door writes the change entry from why and cause. Answers {version, ' +
  'stages:[{n, does}], change, was:{n, does, why, sources}, flow, project}, where was is the stage it removed.'

const FACTS_NOTE =
  'Change a flow\'s trigger, who runs it and whom it is for: PATCH /api/flows/<id> {ifVersion, trigger?, runsBy?, ' +
  'appliesTo?}, at least one of the three. Wave 13p round 40. appliesTo is {scope: general or special, roles:[role card], ' +
  'rung?, project?}: a special flow names its project and a general one names none. ?projects= finds the flow in those ' +
  'projects instead of the header\'s. No change entry is written: the steps are not touched. Answers {version, flow, ' +
  'project, trigger, runsBy, appliesTo}. A flow\'s other keys, extra among them, are written through PATCH /api/records/<id>.'

const aCount = (most: number) => z.coerce.number().int().min(0).max(most)

/** The words of a page of flows. Any other word is refused, so a misspelt one is not read as left out. */
const A_PAGE_OF_FLOWS = z
  .object({
    limit: aCount(FLOW_PAGE_LIMIT_MOST).min(1).optional(),
    offset: aCount(Number.MAX_SAFE_INTEGER).optional(),
    q: z.string().optional(),
    sort: z.enum(FLOW_SORTS).optional(),
    [PROJECTS_QUERY]: z.string().optional(),
    with: z.enum(FLOW_LIST_WITH).optional(),
    role: z.string().min(1).optional(),
    replaced: z.literal(FLOW_REPLACED_SHOW).optional(),
  })
  .strict()

const ONE_FLOW_QUERY = z.object({ [SECOND_LEVEL_PARAM]: z.string().optional(), [PROJECTS_QUERY]: z.string().optional() }).strict()

const A_PAGE_OF_RUNS = z
  .object({
    limit: aCount(FLOW_PAGE_LIMIT_MOST).min(1).optional(),
    offset: aCount(Number.MAX_SAFE_INTEGER).optional(),
    [PROJECTS_QUERY]: z.string().optional(),
  })
  .strict()

const whichFlow = z.object({ id: z.string().min(1) }).strict()
const whichStage = z.object({ id: z.string().min(1), n: z.coerce.number().int() }).strict()
const NO_QUERY = z.object({}).strict()

// A STAGE WRITE TAKES why, sources AND cause AS OPTIONAL HERE, so one left out meets its coded refusal from the shared
// check rather than an uncoded word about the request's shape.
const aText = z.string().min(1)
const someIds = z.array(z.string())

// `appliesTo` is taken as anything here, so a value the office cannot store meets the coded refusal of the shared check.
const THE_FLOWS_FACTS = z
  .object({ ifVersion: aText, trigger: aText.optional(), runsBy: aText.optional(), appliesTo: z.unknown().optional() })
  .strict()
const FACTS_QUERY = z.object({ [PROJECTS_QUERY]: z.string().optional() }).strict()

const A_NEW_FLOW = z
  .object({
    project: aText,
    title: aText,
    runsBy: aText,
    trigger: aText,
    leavesBehind: aText,
    declaredIn: aText,
    stages: z.array(z.object({ does: aText, evidence: z.string().optional(), why: z.string().optional(), sources: someIds.optional() }).strict()),
  })
  .strict()

const A_STAGE_ADDED = z
  .object({ ifVersion: aText, at: z.number().int(), does: aText, evidence: z.string().optional(), why: z.string().optional(), sources: someIds.optional(), standing: z.boolean().optional(), cause: z.string().optional() })
  .strict()

const A_STAGE_CHANGED = z
  .object({ ifVersion: aText, does: aText.optional(), evidence: z.string().optional(), why: z.string().optional(), sources: someIds.optional(), standing: z.boolean().optional(), cause: z.string().optional() })
  .strict()

const A_STAGE_MOVED = z.object({ ifVersion: aText, to: z.number().int(), why: z.string().optional(), cause: z.string().optional() }).strict()

const A_STAGE_REMOVED = z.object({ ifVersion: aText, why: z.string().optional(), cause: z.string().optional() }).strict()

/** The request that asks for these words again, starting at another offset. */
function askedAgain(path: string, words: Record<string, string | number | undefined>, offset: number): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(words)) if (value !== undefined) params.set(key, String(value))
  params.set('offset', String(offset))
  return `GET ${path}?${params.toString()}`
}

/**
 * THE FLOW AN ADDRESS NAMES, in the header's project, or among the projects `?projects=` asks for. Anything that is
 * not a flow is refused: an empty flow would say the record has no stages, which is not what is true.
 */
function theFlow(id: string, query: unknown, req: Parameters<typeof workspaceOf>[0]): PanelRecord {
  const reader = theMessageReader(actorFrom(req))
  const among = theProjectsAQueryAsks(query, reader)
  // AMONG THE PROJECTS ASKED, the flow is looked for in its own project when that is one of them. Otherwise in the
  // first of them, so the refusal is the one `recordInWorkspace` gives for a record that is not there or elsewhere.
  const home = getRecord(id)?.workspaceId
  const where = among === null ? workspaceOf(req) : (among.find((workspace) => workspace.id === home) ?? among[0])?.id ?? workspaceOf(req)
  const record = recordInWorkspace(id, where, reader)
  if (record.kind !== 'flow') {
    throw new PanelError(
      `"${record.title}" is a ${kindWord(record.kind).text}, not a flow, so it has no stages and no runs to read.`,
      404,
      `GET /api/flows/<id> reads flows only. Read this record with GET /api/records/${id}.`,
    )
  }
  return record
}

/** The actor of a write, refused when it is an agent the office has not registered, as on the records door. */
function aWriter(req: Parameters<typeof actorFrom>[0]): ReturnType<typeof actorFrom> {
  const actor = actorFrom(req)
  const no = whyAnUnregisteredAgentMayNotWrite(actor)
  if (no !== null) throw new PanelError(no, 403)
  return actor
}

/** The stage a change or a remove replaced, as its answer quotes it: its place, what it did, its why and its sources. */
function theOldStage(n: number, step: Record<string, unknown>): NonNullable<FlowWriteAnswer['was']> {
  const why = step['why']
  return { n, does: String(step['does'] ?? ''), why: typeof why === 'string' && why.trim() !== '' ? why : null, sources: idsIn(step['sources']) }
}

/**
 * A write whose `ifVersion` is not the flow's is refused with its code before anything else is read. The refusal is the
 * gate `writes-from-a-stale-copy`. At off the version goes on to `patchRecord`, which counts it there, so it is not
 * counted here as well (wave 13r round O).
 */
function refuseAStaleVersion(flow: PanelRecord, ifVersion: string): void {
  const version = versionOf(flow)
  if (ifVersion === version || gatePosition('writes-from-a-stale-copy') !== 'block') return
  throw gateMetOnceTheWriteIsTakenBack(aCodedFlowRefusal(
    'flowVersionStale',
    `The flow "${flow.title}" has changed since you read it, so nothing was written. You sent ifVersion "${ifVersion}"; ` +
      `it is now "${version}". Read it again with GET /api/flows/${flow.id}, and send your write again from what it holds now.`,
    409,
  ), () => gateMet('writes-from-a-stale-copy', 'block'))
}

/**
 * ONE WRITE TO A FLOW'S STAGES: the flow in the header's project, its version, what the write lacks, and then the write.
 * Nothing is written unless every check passes.
 */
function writeAStage(req: Parameters<typeof actorFrom>[0], id: string, ifVersion: string, write: FlowStageWrite): FlowWriteAnswer {
  const actor = aWriter(req)
  const flow = theFlow(id, {}, req)
  refuseAStaleVersion(flow, ifVersion)
  const built = buildAFlowStageWrite(flow.data, write, now().slice(0, 10), missingRecords)
  refuseTheFirstLack(built.lacks, built.gone)
  const result = patchRecord(id, { dataPatch: { stages: built.next['stages'], step_changes: built.next['step_changes'] }, ifVersion }, actor)
  const held = (built.next['step_changes'] as unknown[]).length
  // A change or a remove quotes the stage it replaced; an add and a move leave none behind.
  const was = built.was !== null && (write.op === 'change' || write.op === 'remove') ? { was: theOldStage(write.n, built.was) } : {}
  return {
    version: versionOf(result.record),
    stages: stagesInBrief(result.record.data),
    change: `Change entry ${String(held)} was written: ${built.what}`,
    ...was,
    flow: id,
    project: result.record.workspaceId,
  }
}

export async function flowRoutes(app: FastifyInstance): Promise<void> {
  app.get('/flows', route('project.flows', 'remote', FLOWS_NOTE), async (req): Promise<FlowInventory | FlowListPage> => {
    // A REQUEST WITHOUT ANY OF THE PAGE'S WORDS takes exactly the old path, before anything else is read, so the
    // steward's inventory answers as it always has.
    const query = (req.query ?? {}) as Record<string, unknown>
    if (FLOW_LIST_WORDS.every((word) => query[word] === undefined)) return readFlowInventory(workspaceOf(req))
    const asked = parse(A_PAGE_OF_FLOWS, query, 'The query string')
    const reader = theMessageReader(actorFrom(req))
    // WITHOUT `projects`, THE HEADER'S PROJECT, as the old reply reads it.
    const header = getWorkspace(workspaceOf(req))
    const projects = theProjectsAQueryAsks(query, reader) ?? (header === null ? [] : [header])
    const limit = asked.limit ?? FLOW_PAGE_LIMIT
    const cards = theRoleCards().cards
    const role = asked.role === undefined ? null : (cards.find((card) => card.name === asked.role) ?? null)
    if (asked.role !== undefined && role === null) {
      throw new PanelError(`"${asked.role}" is not a role card, so no flow could be kept for it. The role cards are: ${cards.map((card) => card.name).join(', ')}.`, 400)
    }
    return readAPageOfFlows({
      projects,
      // THE GENERAL FLOWS ARE READ FROM EVERY PROJECT THE READER MAY READ, so the group stands in each project's view.
      everyProject: theProjectsAQueryAsks({ [PROJECTS_QUERY]: EVERY_PROJECT }, reader) ?? [],
      role: role === null ? null : { name: role.name, rung: role.rung },
      showReplaced: asked.replaced === FLOW_REPLACED_SHOW,
      q: asked.q ?? '',
      sort: asked.sort ?? DEFAULT_FLOW_SORT,
      limit,
      offset: asked.offset ?? 0,
      withProblems: asked.with === 'problems',
      nextAt: (offset) =>
        askedAgain(
          '/api/flows',
          { limit, q: asked.q, sort: asked.sort, [PROJECTS_QUERY]: asked[PROJECTS_QUERY], with: asked.with, role: asked.role, replaced: asked.replaced },
          offset,
        ),
    })
  })

  // THE PAGE ASKS THIS BEFORE IT DRAWS EDIT, so the page and the doors answer from the one rule (`aWriter` above).
  app.get('/flows/may-i-write', route('flow.may-write', 'remote', MAY_WRITE_NOTE), async (req): Promise<FlowMayWrite> => {
    const because = whyAnUnregisteredAgentMayNotWrite(actorFrom(req))
    return { mayWrite: because === null, because }
  })

  app.get('/flows/:id', route('flow.read', 'remote', ONE_FLOW_NOTE), async (req): Promise<ReturnType<typeof readOneFlow>> => {
    const { id } = parse(whichFlow, req.params, 'The address')
    const asked = parse(ONE_FLOW_QUERY, req.query ?? {}, 'The query string')
    const show = theSecondLevelIsAsked(asked)
    const flow = theFlow(id, asked, req)
    const projects = asked[PROJECTS_QUERY]
    const askPath = `GET /api/flows/${id}${projects === undefined ? '' : `?${new URLSearchParams({ [PROJECTS_QUERY]: projects }).toString()}`}`
    return readOneFlow(flow, show, askPath, theMessageReader(actorFrom(req)))
  })

  app.patch('/flows/:id', route('flow.facts.change', 'remote', FACTS_NOTE), async (req): Promise<FlowFactsAnswer> => {
    const { id } = parse(whichFlow, req.params, 'The address')
    const query = parse(FACTS_QUERY, req.query ?? {}, 'The query string')
    const said = parse(THE_FLOWS_FACTS, req.body ?? {}, 'The body')
    if (said.trigger === undefined && said.runsBy === undefined && said.appliesTo === undefined) {
      throw new PanelError('Nothing was written: send at least one of trigger, runsBy and appliesTo beside ifVersion.', 400)
    }
    const actor = aWriter(req)
    const flow = theFlow(id, query, req)
    refuseAStaleVersion(flow, said.ifVersion)
    const dataPatch: Record<string, unknown> = {}
    if (said.trigger !== undefined) dataPatch['trigger'] = said.trigger
    if (said.runsBy !== undefined) dataPatch['runs'] = said.runsBy
    if (said.appliesTo !== undefined) dataPatch['applies_to'] = said.appliesTo
    // THROUGH patchRecord, as every write to a record goes, so the revision, the change row and the flow's own check run
    // as on the records door: the check of whom the flow is for among them (`checkWhomTheFlowIsFor`).
    const { record, nothingWritten } = patchRecord(id, { dataPatch, ifVersion: said.ifVersion }, actor)
    const text = (key: string): string | null => (typeof record.data[key] === 'string' ? (record.data[key] as string) : null)
    const appliesTo = record.data['applies_to']
    return {
      version: versionOf(record),
      flow: id,
      project: record.workspaceId,
      trigger: text('trigger'),
      runsBy: text('runs'),
      appliesTo: appliesTo !== null && typeof appliesTo === 'object' && !Array.isArray(appliesTo) ? (appliesTo as FlowAppliesTo) : null,
      ...(nothingWritten === undefined ? {} : { nothingWritten: nothingWrittenSentence({ kind: 'already-stored' }) }),
    }
  })

  app.get('/flows/:id/runs', route('flow.runs', 'remote', FLOW_RUNS_NOTE), async (req): Promise<FlowRunsPage> => {
    const { id } = parse(whichFlow, req.params, 'The address')
    const asked = parse(A_PAGE_OF_RUNS, req.query ?? {}, 'The query string')
    const flow = theFlow(id, asked, req)
    const limit = asked.limit ?? FLOW_PAGE_LIMIT
    return readAFlowsRuns(flow.id, limit, asked.offset ?? 0, (offset) =>
      askedAgain(`/api/flows/${id}/runs`, { limit, [PROJECTS_QUERY]: asked[PROJECTS_QUERY] }, offset),
    )
  })

  app.post('/flows', route('flow.create', 'remote', FLOW_CREATE_NOTE), async (req, reply): Promise<FlowWriteAnswer> => {
    parse(NO_QUERY, req.query ?? {}, 'The query string')
    const said = parse(A_NEW_FLOW, req.body ?? {}, 'The body')
    const actor = aWriter(req)
    // THE PROJECT IS THE BODY'S, NOT THE HEADER'S: the Flows page stands under All projects, and
    // a flow made there is filed where the person said.
    if (getWorkspace(said.project) === null || !isAProjectOnAList(said.project)) {
      throw aCodedFlowRefusal(
        'flowProjectNotThere',
        `No project is called "${said.project}", so the flow was not filed. Name the id of a project GET /api/workspaces lists.`,
        400,
      )
    }
    const data = {
      declared_in: said.declaredIn,
      runs: said.runsBy,
      trigger: said.trigger,
      leaves_behind: said.leavesBehind,
      stages: said.stages.map((stage, i) => ({ n: i + 1, ...stage })),
    }
    // The same check the records door runs inside createRecord, asked first so its refusal is the coded one.
    checkTheFlowSteps(data, null)
    const record = createRecord({ kind: 'flow', title: said.title, data, workspaceId: said.project, actor })
    reply.code(201)
    return {
      version: versionOf(record),
      stages: stagesInBrief(record.data),
      change: 'No change entry was written: a new flow has no earlier stages to change.',
      flow: record.id,
      project: record.workspaceId,
    }
  })

  app.post('/flows/:id/stages', route('flow.stage.add', 'remote', STAGE_ADD_NOTE), async (req): Promise<FlowWriteAnswer> => {
    const { id } = parse(whichFlow, req.params, 'The address')
    parse(NO_QUERY, req.query ?? {}, 'The query string')
    const { ifVersion, ...said } = parse(A_STAGE_ADDED, req.body ?? {}, 'The body')
    return writeAStage(req, id, ifVersion, { op: 'add', ...said })
  })

  app.patch('/flows/:id/stages/:n', route('flow.stage.change', 'remote', STAGE_CHANGE_NOTE), async (req): Promise<FlowWriteAnswer> => {
    const { id, n } = parse(whichStage, req.params, 'The address')
    parse(NO_QUERY, req.query ?? {}, 'The query string')
    const { ifVersion, ...said } = parse(A_STAGE_CHANGED, req.body ?? {}, 'The body')
    return writeAStage(req, id, ifVersion, { op: 'change', n, ...said })
  })

  app.post('/flows/:id/stages/:n/move', route('flow.stage.move', 'remote', STAGE_MOVE_NOTE), async (req): Promise<FlowWriteAnswer> => {
    const { id, n } = parse(whichStage, req.params, 'The address')
    parse(NO_QUERY, req.query ?? {}, 'The query string')
    const { ifVersion, ...said } = parse(A_STAGE_MOVED, req.body ?? {}, 'The body')
    return writeAStage(req, id, ifVersion, { op: 'move', n, ...said })
  })

  app.delete('/flows/:id/stages/:n', route('flow.stage.remove', 'remote', STAGE_REMOVE_NOTE), async (req): Promise<FlowWriteAnswer> => {
    const { id, n } = parse(whichStage, req.params, 'The address')
    parse(NO_QUERY, req.query ?? {}, 'The query string')
    const { ifVersion, ...said } = parse(A_STAGE_REMOVED, req.body ?? {}, 'The body')
    return writeAStage(req, id, ifVersion, { op: 'remove', n, ...said })
  })
}
