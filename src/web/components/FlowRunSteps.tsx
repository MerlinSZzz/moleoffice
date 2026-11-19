// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FLOW RUN'S STEPS, IN WORDS. Wave 13p round 26, on the answer drnyj23dzFpA: in normal mode a flow run's steps are
 * a short list a person reads, never an object left to Inspect. Each step says what it was, who did it, when, and how it
 * ended, in the reader's language. The record page mounts this with one line (the page is wave 13k's).
 *
 * WHAT IS TRANSLATED AND WHAT IS NOT. The office writes its own steps in fixed sentences (OFFICE_STEP_DOES in
 * src/shared/flow-run.ts), how its own steps ended in fixed forms beside them, and one fixed why, for a landing by hand
 * that came with no reason; `how` and `outcome` come from closed lists. Those are drawn in the reader's language. A step
 * somebody wrote by hand, its why and its result are content and are drawn as they were written. A commit inside a fixed
 * form is drawn as it was written. When the verdict door refuses a check's answer, the step's result is a fixed form with
 * the door's status, drawn in the reader's language; the door's own words are English, kept beside the step in
 * `refusal` with its code, and drawn in Developer mode only (wave 13p round 27, piece 1b).
 *
 * WHAT IT SAYS WHEN SOMETHING IS ABSENT. A step with no actor says nobody recorded who; one with no time says nobody
 * recorded when. A flow run that names no flow says so, and one whose flow no record has says that. Nothing is guessed.
 */

import { content, t } from '@shared/i18n.ts'
import {
  ENTERED_STEP_DOES, FLOW_RUN_HOWS, FLOW_RUN_KIND, FLOW_RUN_OUTCOMES, NO_FLOW_NAMED, OFFICE_STEP_DOES, OFFICE_STEP_DONE_BY_HAND_WHY, OFFICE_STEP_ENDED_RESULT, OFFICE_STEP_LANDED_COMMIT, OFFICE_STEP_LANDED_NO_REASON, OFFICE_STEP_SEALED_TIP, OFFICE_STEP_SENTENCES_ONCE_WRITTEN,
  OFFICE_STEP_SUPERSEDED_BY, OFFICE_STEP_VERDICT_REFUSED_STATUS, type FlowRunHow, type FlowRunOutcome,
} from '@shared/flow-run.ts'
import { isMoleOffice } from '@shared/participants.ts'
import { PLANNING_STEP_DOES } from '@shared/planning-flow.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { gapBetween } from '@shared/spacing.ts'
import type { PanelRecord } from '@shared/types.ts'
import { useInspect } from '../lib/mode.ts'
import { storedActorName, type StoredActorParticipants } from './Governance.tsx'
import { RouteLink, recordPath } from './router.tsx'
import { Absence, Panel, StampAfter } from './ui.tsx'

interface Step {
  does?: unknown
  actor?: ParticipantRef
  startedAt?: unknown
  endedAt?: unknown
  how?: unknown
  why?: unknown
  outcome?: unknown
  result?: unknown
  refusal?: unknown
}

type OfficeStep = keyof typeof OFFICE_STEP_DOES
const OFFICE_STEP_OF = new Map([...Object.entries(OFFICE_STEP_DOES), ...Object.entries(OFFICE_STEP_SENTENCES_ONCE_WRITTEN)].map(([key, sentence]) => [sentence as string, key as OfficeStep]))

const HOW_WORD: Record<FlowRunHow, () => string> = {
  'by the office': () => t('flowRunSteps.how.byTheOffice'),
  'by an agent': () => t('flowRunSteps.how.byAnAgent'),
  'by hand': () => t('flowRunSteps.how.byHand'),
}

/** Each outcome a step may record, in the reader's language. The Flows page draws its marks with these words too. */
export const OUTCOME_WORD: Record<FlowRunOutcome, () => string> = {
  done: () => t('flowRunSteps.outcome.done'),
  failed: () => t('flowRunSteps.outcome.failed'),
  'refused by the verdict door': () => t('flowRunSteps.outcome.refusedByTheVerdictDoor'),
  'still open': () => t('flowRunSteps.outcome.stillOpen'),
}

// THE PLANNING FLOW'S OWN STEPS ARE FIXED SENTENCES TOO (wave 13j round 49), written by src/server/lib/planning-flow.ts.
type PlanningStep = keyof typeof PLANNING_STEP_DOES
const PLANNING_STEP_OF = new Map(Object.entries(PLANNING_STEP_DOES).map(([key, sentence]) => [sentence as string, key as PlanningStep]))
// AND THE STEPS OF A FLOW SOMEBODY ENTERED (wave 13j round 52), written by src/server/lib/entered-flows.ts.
type EnteredStep = keyof typeof ENTERED_STEP_DOES
const ENTERED_STEP_OF = new Map(Object.entries(ENTERED_STEP_DOES).map(([key, sentence]) => [sentence as string, key as EnteredStep]))

/** What the step was: the office's own sentences in the reader's language, anything else as it was written. */
function whatItWas(does: unknown): string {
  if (typeof does !== 'string' || does === '') return t('flowRunSteps.nothingSaid')
  const office = OFFICE_STEP_OF.get(does)
  if (office !== undefined) return t(`flowRunSteps.does.${office}`)
  const planning = PLANNING_STEP_OF.get(does)
  if (planning !== undefined) return t(`w13j.planning.step.${planning}`)
  const entered = ENTERED_STEP_OF.get(does)
  return entered === undefined ? content(does) : t(`w13j.flowEntered.step.${entered}`)
}

export { whatItWas as recordedFlowStepWords }

type OfficeEnded = keyof typeof OFFICE_STEP_ENDED_RESULT
const OFFICE_ENDED_OF = new Map(Object.entries(OFFICE_STEP_ENDED_RESULT).map(([key, sentence]) => [sentence as string, key as OfficeEnded]))

/** How the step ended: the office's own fixed forms in the reader's language, anything else as it was written. */
function whatCameOfIt(result: string): string {
  const ended = OFFICE_ENDED_OF.get(result)
  if (ended !== undefined) return t(`flowRunSteps.endedAs.${ended}`)
  if (result.startsWith(OFFICE_STEP_SEALED_TIP)) return t('flowRunSteps.sealedTip', { tip: content(result.slice(OFFICE_STEP_SEALED_TIP.length)) })
  if (result.startsWith(OFFICE_STEP_LANDED_COMMIT)) return t('flowRunSteps.landedCommit', { commit: content(result.slice(OFFICE_STEP_LANDED_COMMIT.length)) })
  if (result.startsWith(OFFICE_STEP_SUPERSEDED_BY)) return t('flowRunSteps.supersededBy', { run: content(result.slice(OFFICE_STEP_SUPERSEDED_BY.length)) })
  if (result.startsWith(OFFICE_STEP_VERDICT_REFUSED_STATUS)) return t('flowRunSteps.verdictRefusedStatus', { status: content(result.slice(OFFICE_STEP_VERDICT_REFUSED_STATUS.length)) })
  return content(result)
}

/** Why it was done by hand: the office's own fixed why in the reader's language, anyone else's as it was written. */
function whyByHand(why: string): string {
  if (why === OFFICE_STEP_DONE_BY_HAND_WHY) return t('flowRunSteps.doneByHandWhy')
  return why === OFFICE_STEP_LANDED_NO_REASON ? t('flowRunSteps.landedNoReason') : content(why)
}

/** The verdict door's own English words and its code, for Developer mode. Null when the step keeps none. */
function whatTheDoorSaid(refusal: unknown): string | null {
  if (typeof refusal !== 'object' || refusal === null) return null
  const { said, code } = refusal as { said?: unknown; code?: unknown }
  if (typeof said !== 'string' || said === '') return null
  return typeof code === 'string' && code !== ''
    ? t('flowRunSteps.doorSaidWithCode', { said: content(said), code: content(code) })
    : t('flowRunSteps.doorSaid', { said: content(said) })
}

/** Who did it. A step the office did by itself is the office's, whatever id it was written under. */
function whoDidIt(step: Step, participants: StoredActorParticipants | undefined): string {
  const actor = step.actor
  if (step.how === 'by the office' || (actor !== undefined && isMoleOffice(actor))) return t('flowRunSteps.theOffice')
  if (actor === undefined) return t('flowRunSteps.nobodyRecordedWho')
  return content(storedActorName(actor.id, participants, actor.kind) ?? actor.id)
}

function word<T extends string>(value: unknown, list: readonly T[], words: Record<T, () => string>): string {
  return (list as readonly unknown[]).includes(value) ? words[value as T]() : typeof value === 'string' && value !== '' ? content(value) : t('flowRunSteps.notRecorded')
}

function FlowLine({ data }: { data: Record<string, unknown> }) {
  const flow = typeof data['flow'] === 'string' ? data['flow'] : null
  const revision = data['flowRevision'] as { seq?: unknown } | undefined
  if (flow !== null && revision !== undefined && typeof revision.seq === 'number') {
    const followed = t('flowRunSteps.followed', { seq: String(revision.seq) })
    const open = t('flowRunSteps.openTheFlow')
    return (
      <p className="rd-sub">
        {followed}{gapBetween(followed, open)}
        {/* THE LINK'S WORDS STAY ON ONE LINE: the panel breaks anywhere, and at 390 that cut 打开流程 after 打. */}
        <span style={{ whiteSpace: 'nowrap' }}><RouteLink to={recordPath(flow)}>{open}</RouteLink></span>
      </p>
    )
  }
  if (data['noFlow'] === NO_FLOW_NAMED || flow === null) return <p className="rd-sub">{t('flowRunSteps.noFlowNamed')}</p>
  return <p className="rd-sub">{t('flowRunSteps.noSuchFlow', { id: content(flow) })}</p>
}

/**
 * Draws nothing on a record that is not a flow run, so the record page mounts it with one line. `title` is for a page
 * where "this run" names nothing, such as a resident's profile, and draws the title as that page's other panels draw
 * theirs, as a label.
 */
export function FlowRunSteps({ record, participants, title }: { record: PanelRecord; participants: StoredActorParticipants | undefined; title?: string }) {
  if (record.kind !== FLOW_RUN_KIND) return null
  const data = record.data
  const steps = data['stepsTaken']
  const developer = useInspect()
  return (
    <Panel declares={{ surface: null }} {...(title === undefined ? { title: t('flowRunSteps.title'), rank: 1 as const } : { title, titleIs: 'label' as const })}>
      <div data-testid="flow-run-steps" style={{ overflowWrap: 'anywhere' }}>
        <FlowLine data={data} />
        {!Array.isArray(steps) ? (
          <p className="rd-none"><Absence tier="ordinary" title={t('flowRunSteps.noList')} /></p>
        ) : steps.length === 0 ? (
          <p className="rd-none"><Absence tier="ordinary" title={t('flowRunSteps.noneYet')} /></p>
        ) : (
          <ol style={{ margin: 0, paddingInlineStart: '1.5rem', display: 'grid', gap: '.5rem' }}>
            {(steps as Step[]).map((step, at) => {
              const ended = typeof step.endedAt === 'string' ? step.endedAt : null
              const started = typeof step.startedAt === 'string' ? step.startedAt : null
              const doorSaid = developer ? whatTheDoorSaid(step.refusal) : null
              const line = t('flowRunSteps.line', {
                who: whoDidIt(step, participants),
                how: word(step.how, FLOW_RUN_HOWS, HOW_WORD),
                outcome: word(step.outcome, FLOW_RUN_OUTCOMES, OUTCOME_WORD),
              })
              const when = ended !== null ? t('flowRunSteps.ended') : started !== null ? t('flowRunSteps.started') : t('flowRunSteps.nobodyRecordedWhen')
              return (
                <li key={at} data-testid="flow-run-step">
                  <div>{whatItWas(step.does)}</div>
                  <div className="rd-sub">
                    {/* NO TYPED SPACE: after a Chinese 。 there is none, after an English full stop there is one. */}
                    {line}{gapBetween(line, when)}
                    {ended !== null ? <StampAfter label={when} at={ended} />
                      : started !== null ? <StampAfter label={when} at={started} />
                      : when}
                  </div>
                  {typeof step.why === 'string' && step.why !== '' ? <div className="rd-sub">{t('flowRunSteps.why', { why: whyByHand(step.why) })}</div> : null}
                  {typeof step.result === 'string' && step.result !== '' ? <div className="rd-sub">{t('flowRunSteps.result', { result: whatCameOfIt(step.result) })}</div> : null}
                  {doorSaid !== null ? <div className="rd-sub" data-testid="flow-run-step-door-said">{doorSaid}</div> : null}
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </Panel>
  )
}
