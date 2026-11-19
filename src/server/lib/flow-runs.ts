// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE'S WRITER AND READER OF FLOW RUNS. Wave 1 of the office flow, M1, on design B: record first, no
 * gates. Report 4IoRUKizcZXb, section 4, is the spec; the words
 * live in src/shared/flow-run.ts.
 *
 * THREE WRITES, AND NONE OF THEM STOPS A RUN.
 *   1. `fileTheFlowRunOf` files one flow run beside a session record, inside the write that files the
 *      session. It runs in a savepoint of its own: when it fails, only the flow run is rolled back, the
 *      session is filed, the answer says the flow run is missing and why, and the office files a problem.
 *   2. `recordTheStepsOfAChange` appends the steps the office sees in one change of a session record: a
 *      seal, a release, a refusal, a confirmation, a close unchecked, a landing by hand, a close as superseded,
 *      an end.
 *   3. `recordAStep` appends one step: a step done by hand from the hand-step door, or the verdict door's
 *      refusal of a check's answer.
 * A failed append is rolled back to its own savepoint and filed as a problem. The run's write goes on.
 *
 * A RUN FILED BEFORE WAVE 1 HAS NO FLOW RUN, and nothing here makes one for it afterwards. An append to such
 * a run writes nothing, which is the truth: nobody recorded its flow when it started.
 */

import type { ParticipantRef } from '@shared/participants.ts'
import type { RecordOrigin } from '@shared/types.ts'
import { readClosedUnchecked, theLandedByHandOn, theSupersededOn, RELEASED, REFUSED, CONFIRMED } from '@shared/releasing.ts'
import {
  BY_HAND,
  FLOW_RUN_KIND,
  FLOW_RUN_TITLE,
  NO_FLOW_NAMED,
  OFFICE_STEP_DOES,
  OFFICE_STEP_DONE_BY_HAND_WHY,
  OFFICE_STEP_ENDED_RESULT,
  OFFICE_STEP_EVIDENCE,
  OFFICE_STEP_LANDED_COMMIT,
  OFFICE_STEP_LANDED_NO_REASON,
  OFFICE_STEP_SEALED_TIP,
  OFFICE_STEP_SUPERSEDED_BY,
  OFFICE_STEP_VERDICT_REFUSED_STATUS,
  noFlowRecordHas,
  type FlowRunHow,
  type FlowRunOutcome,
  type VerdictDoorRefusal,
} from '@shared/flow-run.ts'
import { THE_OFFICE_WRITES_AS } from './the-offices-secretary-run.ts'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db, sqlite } from '../db/client.ts'
import { ONE_KIND_WRITTEN_OUT, STORED_FIELDS, records } from '../db/schema.ts'
import { createRecordWithReport, patchRecord, type Actor } from './records.ts'
import { participantForActor } from './participant-for-actor.ts'
import { asTheFlowRunWriter } from './flow-run-door.ts'
import { PLANNING_FLOW_RUN_MODULE_FIELD } from '@shared/planning-flow.ts'
import { ENTERED_FLOW_FIELD } from '@shared/flow-run.ts'
import { endTheFlowsARunWasIn } from './entered-flows.ts'
import { sendTheHandbooksOfAFlowStart, type HandbooksAtAStart } from './handbooks.ts'
import { theAgentARunServes } from './the-agent-a-run-serves.ts'

/** One step as stored. The declaration in src/shared/kinds/flow-run.ts (`FlowRunStep`) is the authority. */
export interface FlowRunStep {
  n?: number
  does: string
  actor?: ParticipantRef
  startedAt: string
  endedAt?: string
  how: FlowRunHow
  why?: string
  outcome: FlowRunOutcome
  result?: string
  evidence?: string
  refusal?: VerdictDoorRefusal
}

/**
 * STEPS THE OFFICE SAW IN A CHANGE AND COULD NOT WRITE, said in the answer to the request that made the change. The
 * change itself stands; `problem` is the problem the office filed about it (wave 13p round 27, piece 4).
 */
export interface FlowRunStepsNotWritten {
  flowRun: string
  steps: string[]
  because: string
  problem: string | null
  problemNotFiled?: string
}

/** What filing a run's flow run came to, said in the answer to the request that filed the run. */
export type FlowRunFiled =
  // `handbooks` is there only when an in-use handbook hangs on the flow or one of its steps (lib/handbooks.ts).
  | { written: true; id: string; handbooks?: HandbooksAtAStart }
  | { written: false; because: string; problem: string | null; problemNotFiled?: string }

const THE_OFFICE: Actor = { type: THE_OFFICE_WRITES_AS.type, id: THE_OFFICE_WRITES_AS.id }

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * A FLOW RUN SOMEBODY ENTERED IS NOT THE RUN'S OWN. One names the run that entered the flow (lib/entered-flows.ts), and
 * a planning flow run names the run its planner was in when the plan step was done, and the module it is about
 * (lib/planning-flow.ts). So the run's own flow run is the one with neither `entered` nor `module`: a planning flow run
 * filed before wave 13j round 52 has no `entered`.
 */
const notAnEnteredFlowRun = sql`json_extract(${records.data}, ${'$.' + PLANNING_FLOW_RUN_MODULE_FIELD}) IS NULL AND json_extract(${records.data}, ${'$.' + ENTERED_FLOW_FIELD}) IS NULL`

/**
 * The run's flow run as stored, or null when it has none. One row by the run's id, never a list.
 *
 * FOUND BY THE INDEX `records_flow_run_run_idx` (migration 0201), so the lookup does not cost more as the office
 * files more runs. SQLite uses the index only for a query that asks the kind and the field in its words, so both
 * come from `ONE_KIND_WRITTEN_OUT` and `STORED_FIELDS`. Asked as before this index, with the kind as a value and a
 * bare json_extract, the lookup read every flow run's data: a median of 10.5 ms at 20,000 runs.
 */
export function theFlowRunOf(runId: string): { id: string; workspaceId: string; steps: FlowRunStep[] } | null {
  const row = db
    .select({ id: records.id, workspaceId: records.workspaceId, data: records.data })
    .from(records)
    .where(and(ONE_KIND_WRITTEN_OUT.flowRun, isNull(records.deletedAt), eq(STORED_FIELDS.flowRunRun(records.data), runId), notAnEnteredFlowRun))
    .orderBy(asc(records.createdAt), asc(records.id))
    .limit(1)
    .get()
  if (row === undefined) return null
  const data = (row.data ?? {}) as Record<string, unknown>
  return { id: row.id, workspaceId: row.workspaceId, steps: Array.isArray(data['stepsTaken']) ? (data['stepsTaken'] as FlowRunStep[]) : [] }
}

/**
 * EACH OF THESE RUNS' OWN FLOW RUN, in one statement, by the conditions and the index of `theFlowRunOf`: of a run's flow
 * runs that nobody entered, the first filed. A run with none is not in the answer. Wave 13y round 111: the chat's status
 * read asked `theFlowRunOf` once for each run, which was most of its time for an agent with many runs.
 */
export function theFlowRunsOf(runIds: readonly string[]): Map<string, { id: string; workspaceId: string; steps: FlowRunStep[] }> {
  const out = new Map<string, { id: string; workspaceId: string; steps: FlowRunStep[] }>()
  if (runIds.length === 0) return out
  const rows = db
    .select({ id: records.id, workspaceId: records.workspaceId, data: records.data })
    .from(records)
    .where(and(ONE_KIND_WRITTEN_OUT.flowRun, isNull(records.deletedAt), inArray(STORED_FIELDS.flowRunRun(records.data), [...runIds]), notAnEnteredFlowRun))
    .orderBy(asc(records.createdAt), asc(records.id))
    .all()
  for (const row of rows) {
    const data = (row.data ?? {}) as Record<string, unknown>
    const run = data['run']
    if (typeof run !== 'string' || out.has(run)) continue
    out.set(run, { id: row.id, workspaceId: row.workspaceId, steps: Array.isArray(data['stepsTaken']) ? (data['stepsTaken'] as FlowRunStep[]) : [] })
  }
  return out
}

/** Who did a thing, as a step stores it. The office is named as itself; a caller no registry holds is absent. */
function whoDid(actor: Actor): ParticipantRef | undefined {
  if (actor.type === THE_OFFICE.type && actor.id === THE_OFFICE.id) return { kind: 'agent', id: THE_OFFICE.id }
  return participantForActor(actor) ?? undefined
}

/** How a step was done, from who did it. Only a person's own act is by hand, and it then says why. */
function howOf(actor: ParticipantRef | undefined): { how: FlowRunHow; why?: string } {
  if (actor === undefined) return { how: 'by an agent' }
  if (actor.kind === 'person') return { how: BY_HAND, why: OFFICE_STEP_DONE_BY_HAND_WHY }
  return actor.id === THE_OFFICE.id ? { how: 'by the office' } : { how: 'by an agent' }
}

/** The flow a session names, read once at its filing, with its newest revision or the sentence for why there is none. */
function theFlowItNamed(data: Record<string, unknown>): Record<string, unknown> {
  const named = typeof data['flow'] === 'string' ? data['flow'].trim() : ''
  if (named === '') return { noFlow: NO_FLOW_NAMED }
  const revision = sqlite
    .prepare(
      "SELECT v.seq AS seq, v.content_hash AS contentHash FROM records r JOIN revisions v ON v.record_id = r.id WHERE r.id = ? AND r.kind = 'flow' AND r.deleted_at IS NULL ORDER BY v.seq DESC LIMIT 1",
    )
    .get(named) as { seq: number; contentHash: string } | undefined
  if (revision === undefined) return { flow: named, noFlow: noFlowRecordHas(named) }
  return { flow: named, flowRevision: { seq: revision.seq, contentHash: revision.contentHash } }
}

/**
 * FILE THE PROBLEM THAT SAYS A FLOW RUN, OR A STEP OF ONE, WAS NOT WRITTEN. In its own savepoint, so a
 * problem that cannot be filed either leaves the run's write standing; the caller is told that too.
 */
export function fileTheProblem(runId: string, workspaceId: string, what: string, because: string, origin?: RecordOrigin): { problem: string | null; problemNotFiled?: string } {
  try {
    const made = sqlite.transaction(() =>
      createRecordWithReport({
        kind: 'problem',
        title: `${what} for run ${runId}`,
        workspaceId,
        data: {
          symptom: `${what} for run ${runId}. The write failed with: ${because} The run's own write was not stopped.`,
          state: 'open',
          whose_move: 'agent',
          found_by: 'the office, while it recorded the run\'s flow run',
        },
        links: [{ type: 'about', toId: runId }],
        actor: THE_OFFICE,
        bindCallerSession: false,
        ...(origin === undefined ? {} : { origin }),
        // NEITHER LIST OF TITLES ALREADY FILED. Only the problem's id is kept.
        namesWhatIsAlreadyFiled: false,
      }),
    )()
    return { problem: made.record.id }
  } catch (error) {
    return { problem: null, problemNotFiled: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * FILE THE FLOW RUN OF A SESSION THAT HAS JUST BEEN WRITTEN. Called by `createRecordWithReport` inside its
 * own transaction, after the session row, its seal and its revision. Its first step is the filing, and a
 * session filed already finished gets the steps that its data already shows, by the same reading a change
 * gets (`stepsOfAChange` from nothing to what was filed).
 */
export function fileTheFlowRunOf(
  // `origin` is the run's own: a run the seed files as fixture gets a flow run stamped fixture too.
  session: { id: string; workspaceId: string; createdAt: string; data: Record<string, unknown>; origin: RecordOrigin },
  actor: Actor,
): FlowRunFiled {
  try {
    const filer = whoDid(actor)
    const started: FlowRunStep = {
      does: OFFICE_STEP_DOES.started,
      ...(filer === undefined ? {} : { actor: filer }),
      startedAt: session.createdAt,
      endedAt: session.createdAt,
      ...howOf(filer),
      outcome: 'done',
      evidence: OFFICE_STEP_EVIDENCE.started,
    }
    const steps = [started, ...stepsOfAChange({}, session.data, actor, session.createdAt)]
    const named = theFlowItNamed(session.data)
    const made = sqlite.transaction(() =>
      asTheFlowRunWriter(() =>
        createRecordWithReport({
          kind: FLOW_RUN_KIND,
          title: FLOW_RUN_TITLE,
          workspaceId: session.workspaceId,
          data: { run: session.id, ...named, stepsTaken: steps },
          links: [{ type: 'about', toId: session.id }],
          actor: THE_OFFICE,
          bindCallerSession: false,
          origin: session.origin,
          // NEITHER LIST OF TITLES ALREADY FILED. Only the flow run's id is kept. Every flow run has this title, so the
          // first list would be every flow run of the project.
          namesWhatIsAlreadyFiled: false,
        }),
      ),
    )()
    // THE HANDBOOKS ON THE FLOW IT NAMED go to the agent the run serves, once, as the flow run is filed. The send never
    // throws, so the flow run filed above is never said to be missing.
    const handbooks =
      named['flowRevision'] === undefined
        ? null
        : sendTheHandbooksOfAFlowStart({
            flow: String(named['flow']),
            flowRun: made.record.id,
            run: session.id,
            workspaceId: session.workspaceId,
            to: () => {
              const served = theAgentARunServes(session.data)
              return served === null ? null : { kind: 'agent', id: served.id }
            },
            origin: session.origin,
          })
    return handbooks === null ? { written: true, id: made.record.id } : { written: true, id: made.record.id, handbooks }
  } catch (error) {
    const because = error instanceof Error ? error.message : String(error)
    return { written: false, because, ...fileTheProblem(session.id, session.workspaceId, 'No flow run was written', because, session.origin) }
  }
}

/** The moment a verdict field says it was written, or null when the field holds none. */
function stampOf(value: unknown): string | null {
  return isObject(value) && typeof value['at'] === 'string' ? value['at'] : null
}

/** The participant a verdict field names as its `by`, or undefined. */
function byOf(value: unknown): ParticipantRef | undefined {
  if (!isObject(value) || !isObject(value['by'])) return undefined
  const { kind, id } = value['by']
  return (kind === 'person' || kind === 'agent') && typeof id === 'string' ? { kind, id } : undefined
}

/** The states a run ends in, each with the sentence its "ended" step carries as its result, in words. */
const ENDED_RESULT: Readonly<Record<string, string>> = OFFICE_STEP_ENDED_RESULT

/**
 * THE STEPS ONE CHANGE OF A SESSION RECORD SHOWS, read from what it held before and after. One reading for
 * the filing and for every later change, so a run filed already finished and a run that finishes later get
 * the same steps. A field read here is written only by its own door, so a new value is that door's act.
 */
export function stepsOfAChange(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  actor: Actor,
  at: string,
): FlowRunStep[] {
  const steps: FlowRunStep[] = []
  const writer = whoDid(actor)
  const event = (does: string, who: ParticipantRef | undefined, when: string, evidence: string, extra: Partial<FlowRunStep> = {}): void => {
    const { how: givenHow, why: givenWhy, ...rest } = extra
    const usual = howOf(who)
    const how = givenHow ?? usual.how
    const why = givenWhy ?? usual.why
    steps.push({
      does,
      ...(who === undefined ? {} : { actor: who }),
      startedAt: when,
      endedAt: when,
      how,
      ...(how === BY_HAND && why !== undefined ? { why } : {}),
      outcome: 'done',
      evidence,
      ...rest,
    })
  }
  const sealed = after['sealedTip']
  if (typeof sealed === 'string' && sealed !== before['sealedTip']) {
    event(OFFICE_STEP_DOES.sealed, writer, at, OFFICE_STEP_EVIDENCE.sealed, { how: 'by the office', result: `${OFFICE_STEP_SEALED_TIP}${sealed}` })
  }
  for (const [field, does, evidence] of [
    [RELEASED, OFFICE_STEP_DOES.released, OFFICE_STEP_EVIDENCE.released],
    [REFUSED, OFFICE_STEP_DOES.refused, OFFICE_STEP_EVIDENCE.refused],
    [CONFIRMED, OFFICE_STEP_DOES.confirmed, OFFICE_STEP_EVIDENCE.confirmed],
  ] as const) {
    const when = stampOf(after[field])
    if (when !== null && when !== stampOf(before[field])) event(does, byOf(after[field]), when, evidence)
  }
  const closed = readClosedUnchecked(after['closedUnchecked'])
  if (closed !== null && closed.at !== stampOf(before['closedUnchecked'])) {
    event(OFFICE_STEP_DOES.closedUnchecked, closed.by, closed.at, OFFICE_STEP_EVIDENCE.closedUnchecked, { how: BY_HAND, why: closed.because })
  }
  const landed = theLandedByHandOn(after)
  if (landed !== null && landed.commit !== theLandedByHandOn(before)?.commit) {
    event(OFFICE_STEP_DOES.landedByHand, landed.by, landed.at === '' ? at : landed.at, OFFICE_STEP_EVIDENCE.landedByHand, {
      how: BY_HAND,
      why: landed.because.trim() === '' ? OFFICE_STEP_LANDED_NO_REASON : landed.because,
      result: `${OFFICE_STEP_LANDED_COMMIT}${landed.commit}`,
    })
  }
  // A CLOSE AS SUPERSEDED, read from either place the superseded door writes it (`theSupersededOn`). The because is
  // the closer's own words, kept as the why when the closer is a person (wave 13p round 27, piece 4).
  const superseded = theSupersededOn(after)
  if (superseded !== null && superseded.at !== '' && superseded.at !== theSupersededOn(before)?.at) {
    event(OFFICE_STEP_DOES.superseded, superseded.byWhom, superseded.at, OFFICE_STEP_EVIDENCE.superseded, {
      ...(superseded.byWhom.kind === 'person' && superseded.because.trim() !== '' ? { why: superseded.because } : {}),
      result: `${OFFICE_STEP_SUPERSEDED_BY}${superseded.by}`,
    })
  }
  const state = after['state']
  if (typeof state === 'string' && ENDED_RESULT[state] !== undefined && state !== before['state']) {
    event(OFFICE_STEP_DOES.ended, writer, at, OFFICE_STEP_EVIDENCE.ended, {
      result: ENDED_RESULT[state],
      ...(state === 'finished' ? {} : { outcome: 'failed' }),
    })
  }
  return steps
}

/**
 * APPEND STEPS TO A RUN'S FLOW RUN, written as `actor`. A run with no flow run gets nothing. A failed append is
 * rolled back to its own savepoint and filed as a problem; it never throws into the run's write.
 */
export function appendSteps(
  runId: string,
  steps: readonly FlowRunStep[],
  actor: Actor = THE_OFFICE,
): { written: boolean; flowRun: string | null; because?: string; problem?: string | null; problemNotFiled?: string } {
  if (steps.length === 0) return { written: false, flowRun: null }
  const held = theFlowRunOf(runId)
  if (held === null) return { written: false, flowRun: null }
  try {
    sqlite.transaction(() =>
      asTheFlowRunWriter(() => patchRecord(held.id, { dataPatch: { stepsTaken: [...held.steps, ...steps] } }, actor)),
    )()
    return { written: true, flowRun: held.id }
  } catch (error) {
    const because = error instanceof Error ? error.message : String(error)
    return { written: false, flowRun: held.id, because, ...fileTheProblem(runId, held.workspaceId, 'A step of a flow run was not written', because) }
  }
}

/**
 * The steps one change of a session record shows, appended to its flow run. Called by `patchRecord`, which says in its
 * answer what this returns: null when every step was written or there was none to write, or the steps that were not.
 */
export function recordTheStepsOfAChange(runId: string, before: Record<string, unknown>, after: Record<string, unknown>, actor: Actor, at: string): FlowRunStepsNotWritten | null {
  const steps = stepsOfAChange(before, after, actor, at)
  const appended = appendSteps(runId, steps)
  // THE FLOWS THE RUN ENTERED THAT END ON ONE OF THESE STEPS END NOW, in wave 13j round 52. Each in
  // its own savepoint; one that fails is filed as a problem, and neither this write nor the run's own steps stop.
  endTheFlowsARunWasIn(runId, steps, at, (what, because, workspaceId) => {
    fileTheProblem(runId, workspaceId, what, because)
  })
  if (appended.written || appended.flowRun === null) return null
  return {
    flowRun: appended.flowRun,
    steps: steps.map((step) => step.does),
    because: appended.because ?? '',
    problem: appended.problem ?? null,
    ...(appended.problemNotFiled === undefined ? {} : { problemNotFiled: appended.problemNotFiled }),
  }
}

/**
 * THE VERDICT DOOR REFUSED A CHECK'S ANSWER. Its own outcome, never `failed`: the check was done and the door
 * would not take what it said. Called by POST /api/checks/<run> before it answers with the refusal.
 *
 * THE RESULT IS A FIXED FORM WITH THE DOOR'S STATUS, so the page says it in the reader's language. The door's own
 * words are English; they are kept whole in `refusal` beside it, with the refusal's code when it has one (wave 13p
 * round 27, piece 1b).
 */
export function recordAVerdictRefused(runId: string, actor: Actor, refusal: VerdictDoorRefusal, at: string): { written: boolean; flowRun: string | null } {
  const who = whoDid(actor)
  return appendSteps(runId, [
    {
      does: OFFICE_STEP_DOES.verdictRefused,
      ...(who === undefined ? {} : { actor: who }),
      startedAt: at,
      endedAt: at,
      ...howOf(who),
      outcome: 'refused by the verdict door',
      result: `${OFFICE_STEP_VERDICT_REFUSED_STATUS}${refusal.status}`,
      evidence: OFFICE_STEP_EVIDENCE.verdictRefused,
      refusal,
    },
  ])
}

/**
 * ADD ONE STEP TO A RUN'S FLOW RUN, FROM THE HAND-STEP DOOR, written as whoever asked. Unlike the office's own
 * appends this throws: the caller is there to be told, and a step it sent that was not stored must not read
 * as stored. A step done by hand with no why is refused by the `FlowRunStep` rule in src/shared/kinds/flow-run.ts.
 * Null when the run has no flow run.
 */
export function addAStep(runId: string, step: FlowRunStep, actor: Actor): { flowRun: string; position: number } | null {
  const held = theFlowRunOf(runId)
  if (held === null) return null
  sqlite.transaction(() => asTheFlowRunWriter(() => patchRecord(held.id, { dataPatch: { stepsTaken: [...held.steps, step] } }, actor)))()
  return { flowRun: held.id, position: held.steps.length + 1 }
}

/** Who did a step a caller recorded: the actor it named, or the caller itself. */
export function theStepsActor(named: ParticipantRef | undefined, caller: Actor): ParticipantRef | undefined {
  return named ?? whoDid(caller)
}
