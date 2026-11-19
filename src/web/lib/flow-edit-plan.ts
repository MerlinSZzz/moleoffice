// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE FLOW EDITOR WOULD SEND, AND WHAT IT STILL LACKS. Wave 13p round 36, the fourth of the five rounds of
 * proposal report 4mwraeIStEe8.
 *
 * The editor holds the stages as the person wants them. Saving is a sequence of writes through round 34's doors, each
 * made from the version the last one answered: removals first, then changes, then additions and moves in order. That
 * sequence is worked out here, once, and every write in it is run through `buildAFlowStageWrite`, the builder the doors
 * run (src/shared/flow-step-writes.ts). A new flow is run through `whatTheFlowStepsLack`, the check the create door
 * runs. So what the save bar lists is what the server would refuse, in the same words and the same order (invariant 9).
 *
 * WHAT IS NOT CHECKED HERE: whether a source or a cause is a live record. The page has no list of every record, so it
 * passes no missing ids, and the server's `flowStepRecordNotThere` is the one refusal that can meet a save the bar
 * called complete. It is then placed by its code beside the stage that names the record.
 *
 * NOTHING HERE WRITES.
 */
import { buildAFlowStageWrite, type FlowStageWrite } from '@shared/flow-step-writes.ts'
import { whatTheFlowStepsLack } from '@shared/flow-steps.ts'
import type { FlowRead } from '@shared/flows.ts'

/** One stage as the editor holds it. `from` is its place in the flow as read, or null when it was added here. */
export interface EditorStage {
  key: string
  from: number | null
  does: string
  evidence: string
  why: string
  sources: string[]
  /** Set while the person is taking it out: the one line on why it goes. */
  removing: { why: string } | null
}

/** The facts a new flow is filed with. An edit of a flow changes only its stages, as the doors do. */
export interface NewFlowFacts {
  project: string
  title: string
  trigger: string
  runsBy: string
  leavesBehind: string
  declaredIn: string
}

export const FACT_NAMES = ['project', 'title', 'trigger', 'runsBy', 'leavesBehind', 'declaredIn'] as const satisfies readonly (keyof NewFlowFacts)[]

/** The whole of what the editor holds. `cause` is the record that caused the change; a new flow is not asked for one. */
export interface EditorState {
  cause: string | null
  stages: EditorStage[]
  /** Why the order changes, asked once when a stage that was already there moves. */
  orderWhy: string
  facts: NewFlowFacts | null
}

/**
 * WHERE A LACK IS SHOWN: beside a stage (its key), at the cause, at the order line, or at one fact of a new flow.
 * `what` says which thing it lacks; the codes the shared check and the builder give that the page has no plainer word
 * for are passed through as they are.
 */
export type Place = { stage: string } | { at: 'cause' } | { at: 'order' } | { fact: keyof NewFlowFacts }
export type LackWhat = 'does' | 'why' | 'sources' | 'removeWhy' | 'orderWhy' | 'cause' | 'fact' | 'nothing' | string
export interface Lack {
  place: Place
  what: LackWhat
}

/** One write of the sequence, where its refusal is placed, and the stage keys by place after it is written. */
export interface PlannedWrite {
  write: FlowStageWrite
  place: Place
  after: string[]
}

export interface EditPlan {
  writes: PlannedWrite[]
  lacks: Lack[]
}

const blank = (value: string): boolean => value.trim() === ''

/** The key a stage read from the flow starts with: its place when it was read. It is not renamed when places change. */
export const keyOfPlace = (place: number): string => `p${String(place)}`

/** The editor's state for a flow as read with its reasons: every stage as it is, nothing taken out. */
export function stateOfAFlow(flow: FlowRead): EditorState {
  return {
    cause: null,
    orderWhy: '',
    facts: null,
    stages: flow.stages.map((stage, i) => ({
      key: keyOfPlace(i + 1),
      from: i + 1,
      does: stage.does,
      evidence: stage.evidence ?? '',
      why: stage.why ?? '',
      sources: stage.sources ?? [],
      removing: null,
    })),
  }
}

/** The flow's data as the doors read it, rebuilt from the read with its reasons: the stages and the record of changes. */
export function dataOfAFlow(flow: FlowRead): Record<string, unknown> {
  return {
    stages: flow.stages.map((stage, i) => ({
      n: i + 1,
      does: stage.does,
      ...(stage.evidence === null ? {} : { evidence: stage.evidence }),
      ...(stage.why === null || stage.why === undefined ? {} : { why: stage.why }),
      ...(stage.sources === undefined ? {} : { sources: stage.sources }),
    })),
    step_changes: flow.stepChanges ?? [],
  }
}

const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((id, i) => id === b[i])

/** Whether a stage read from the flow has been changed in the editor. */
export function isChanged(stage: EditorStage, flow: FlowRead): boolean {
  if (stage.from === null) return false
  const was = flow.stages[stage.from - 1]
  if (was === undefined) return false
  return stage.does !== was.does || stage.evidence !== (was.evidence ?? '') || stage.why !== (was.why ?? '') || !sameList(stage.sources, was.sources ?? [])
}

/** The parts of a stage a write sends: what it says, with an empty why or empty sources left out so the check asks for them. */
function said(stage: EditorStage): { does: string; evidence: string; why?: string; sources?: string[] } {
  return {
    does: stage.does,
    evidence: stage.evidence,
    ...(blank(stage.why) ? {} : { why: stage.why }),
    ...(stage.sources.length === 0 ? {} : { sources: stage.sources }),
  }
}

function pushOnce(lacks: Lack[], lack: Lack): void {
  const same = JSON.stringify(lack)
  if (!lacks.some((held) => JSON.stringify(held) === same)) lacks.push(lack)
}

/**
 * THE WRITES AN EDIT OF A FLOW COMES TO, and what it lacks. `flow` is the flow as read with its reasons; `today` is the
 * date the change entries carry, as the server writes them.
 */
export function planAnEdit(flow: FlowRead, state: EditorState, today: string): EditPlan {
  const lacks: Lack[] = []
  const writes: PlannedWrite[] = []
  const cause = state.cause ?? undefined
  // THE STAGE KEYS BY PLACE, as the flow will hold them after each write. A stage's key is kept across a save that
  // stopped part-way, so the flow's places are named by the editor stage that points at each.
  let work = flow.stages.map((_, i) => state.stages.find((stage) => stage.from === i + 1)?.key ?? keyOfPlace(i + 1))
  const placeOf = (key: string): number => work.indexOf(key) + 1

  for (const stage of state.stages) {
    if (stage.removing === null || stage.from === null) continue
    const write: FlowStageWrite = { op: 'remove', n: placeOf(stage.key), why: stage.removing.why, ...(cause === undefined ? {} : { cause }) }
    if (blank(stage.removing.why)) delete (write as { why?: string }).why
    work = work.filter((key) => key !== stage.key)
    writes.push({ write, place: { stage: stage.key }, after: work })
  }
  const kept = state.stages.filter((stage) => stage.removing === null)
  for (const stage of kept) {
    if (blank(stage.does)) pushOnce(lacks, { place: { stage: stage.key }, what: 'does' })
    if (!isChanged(stage, flow)) continue
    writes.push({ write: { op: 'change', n: placeOf(stage.key), ...said(stage), ...(cause === undefined ? {} : { cause }) }, place: { stage: stage.key }, after: work })
  }
  kept.forEach((stage, i) => {
    const at = i + 1
    if (stage.from === null) {
      work = [...work.slice(0, i), stage.key, ...work.slice(i)]
      writes.push({ write: { op: 'add', at, ...said(stage), ...(cause === undefined ? {} : { cause }) }, place: { stage: stage.key }, after: work })
    } else if (work[i] !== stage.key) {
      const n = placeOf(stage.key)
      work = work.filter((key) => key !== stage.key)
      work = [...work.slice(0, i), stage.key, ...work.slice(i)]
      const write: FlowStageWrite = { op: 'move', n, to: at, ...(blank(state.orderWhy) ? {} : { why: state.orderWhy }), ...(cause === undefined ? {} : { cause }) }
      writes.push({ write, place: { at: 'order' }, after: work })
    }
  })

  // EVERY WRITE THROUGH THE DOORS' OWN BUILDER, each on the data the one before it leaves.
  let data: unknown = dataOfAFlow(flow)
  for (const planned of writes) {
    const built = buildAFlowStageWrite(data, planned.write, today, () => [])
    for (const lack of built.lacks) {
      switch (lack.code) {
        case 'flowStepNoWhy':
          pushOnce(lacks, { place: planned.place, what: 'why' })
          break
        case 'flowStepNoSources':
          pushOnce(lacks, { place: planned.place, what: 'sources' })
          break
        case 'flowChangeNoWhy':
          pushOnce(lacks, planned.write.op === 'move' ? { place: { at: 'order' }, what: 'orderWhy' } : { place: planned.place, what: 'removeWhy' })
          break
        case 'flowStepChangeNoCause':
        case 'flowStepChangeUnrecorded':
          pushOnce(lacks, { place: { at: 'cause' }, what: 'cause' })
          break
        default:
          pushOnce(lacks, { place: planned.place, what: lack.code })
      }
    }
    data = built.next
  }
  // A MOVE ALONE IS NOT ASKED FOR A CAUSE by the shared check, but the doors write one into its entry, and the editor
  // asks for the cause before anything else, so a save of moves only is asked for it too.
  if (writes.length > 0 && cause === undefined) pushOnce(lacks, { place: { at: 'cause' }, what: 'cause' })
  if (writes.length === 0) pushOnce(lacks, { place: { at: 'cause' }, what: 'nothing' })
  // The cause first, as the editor asks it first.
  lacks.sort((a, b) => Number('at' in b.place && b.place.at === 'cause') - Number('at' in a.place && a.place.at === 'cause'))
  return { writes, lacks }
}

/** WHAT A NEW FLOW LACKS: an empty fact, a stage that says nothing, and what the create door's check asks. */
export function planANewFlow(state: EditorState): Lack[] {
  const lacks: Lack[] = []
  const facts = state.facts
  if (facts !== null) for (const name of FACT_NAMES) if (blank(facts[name])) lacks.push({ place: { fact: name }, what: 'fact' })
  const stages = state.stages.filter((stage) => stage.removing === null)
  for (const stage of stages) if (blank(stage.does)) lacks.push({ place: { stage: stage.key }, what: 'does' })
  const next = { stages: stages.map((stage, i) => ({ n: i + 1, ...said(stage) })) }
  const { lacks: shared } = whatTheFlowStepsLack(next, null, () => [])
  for (const lack of shared) {
    if (lack.code !== 'flowStepNoWhy' && lack.code !== 'flowStepNoSources') {
      pushOnce(lacks, { place: { at: 'cause' }, what: lack.code })
      continue
    }
    for (const step of lack.steps) {
      const stage = stages[Number(step['n']) - 1]
      if (stage !== undefined) pushOnce(lacks, { place: { stage: stage.key }, what: lack.code === 'flowStepNoWhy' ? 'why' : 'sources' })
    }
  }
  return lacks
}

/**
 * THE EDITOR AFTER A SAVE THAT STOPPED PART-WAY. `done` writes of `plan` were saved; `flow` is the flow read again. Every
 * typed word is kept. A stage already taken out is gone; every other stage read from the flow points at its place now,
 * so a change that was saved now reads as unchanged and one that was not is still a change.
 */
export function stateAfterAPartSave(state: EditorState, plan: EditPlan, done: number, flow: FlowRead): EditorState {
  if (done === 0) return state
  const work = plan.writes[done - 1]!.after
  const removed = new Set(plan.writes.slice(0, done).flatMap((planned) => (planned.write.op === 'remove' && 'stage' in planned.place ? [planned.place.stage] : [])))
  const stages = state.stages
    .filter((stage) => !removed.has(stage.key))
    .map((stage) => {
      const at = work.indexOf(stage.key)
      return { ...stage, from: at < 0 || flow.stages[at] === undefined ? null : at + 1 }
    })
  return { ...state, stages }
}
