// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE A MODULE'S PLAN STANDS IN THE PLANNING FLOW, ON THE MODULE'S PAGE. Wave 13j round 49.
 * The office writes `module.planning` at two doors and when its checklist item is ticked by hand; this panel
 * only reads it. It says who the planner is, when the plan step was done, which message asked the four questions and
 * which checklist item waits, and then either that the plan was questioned (when, and the four answers) or that the
 * item was ticked by hand, so the plan was not questioned through the door.
 *
 * WHAT IT DRAWS WHEN SOMETHING IS ABSENT. No planner named, and no plan step done, are ordinary emptiness on a module,
 * so each draws the ordinary mark the module's other fields draw. The sentence saying why stays as the mark's tooltip
 * and is read out to a screen reader. Nothing is guessed: an answer is drawn as the planner wrote it.
 */

import { content, t } from '@shared/i18n.ts'
import { PLAN_QUESTION_KEYS, type ModulePlanning } from '@shared/planning-flow.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import type { PanelRecord } from '@shared/types.ts'
import type { ParticipantsReply } from '../api.ts'
import { declaredAttributes, type Declares } from './declares.ts'
import { storedActorName } from './Governance.tsx'
import { RouteLink, recordPath } from './router.tsx'
import { Absence, Panel, WordsAroundAStamp } from './ui.tsx'

function nameOf(who: ParticipantRef | undefined, participants: ParticipantsReply | undefined): string {
  if (who === undefined) return t('w13j.planning.nobodyRecordedWho')
  return content(storedActorName(who.id, participants, who.kind) ?? who.id)
}

function isARef(value: unknown): value is ParticipantRef {
  return typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string'
}

/** One line naming a record by its id, with a link to it. */
function RecordLine({ label, id }: { label: string; id: string }) {
  return (
    <li>
      {label} <RouteLink to={recordPath(id)}><code>{id}</code></RouteLink>
    </li>
  )
}

export function ModulePlanningPanel({ record, participants, declares, plannerDeclares }: {
  record: PanelRecord
  participants: ParticipantsReply | undefined
  declares: Declares
  plannerDeclares: Declares
}) {
  const planner = isARef(record.data['planner']) ? record.data['planner'] : null
  const raw = record.data['planning']
  const planning = typeof raw === 'object' && raw !== null ? (raw as ModulePlanning) : null
  return (
    <Panel declares={declares} title={t('w13j.planning.title')}>
      <div data-testid="module-planning" style={{ overflowWrap: 'anywhere', display: 'grid', gap: '.5rem' }}>
        <p className="rd-sub" {...declaredAttributes(plannerDeclares)}>
          {planner === null
            ? <>{t('w13j.planning.plannerLabel')} <Absence tier="ordinary" title={t('w13j.planning.noPlanner')} /></>
            : t('w13j.planning.planner', { who: nameOf(planner, participants) })}
        </p>
        {planning === null ? (
          <p className="rd-none"><Absence tier="ordinary" title={t('w13j.planning.noStep')} /></p>
        ) : (
          <>
            <p>
              <WordsAroundAStamp
                at={planning.planStepDoneAt}
                words={(when) => t('w13j.planning.stepDone', { who: nameOf(planning.planStepDoneBy, participants), when })}
              />
            </p>
            <ul style={{ margin: 0, paddingInlineStart: '1.25rem' }} className="rd-sub">
              <RecordLine label={t('w13j.planning.pipeline')} id={planning.pipeline} />
              <RecordLine label={t('w13j.planning.prompt')} id={planning.prompt} />
              <RecordLine label={t('w13j.planning.checklist')} id={planning.checklistItem.checklist} />
              <RecordLine label={t('w13j.planning.flowRun')} id={planning.flowRun} />
            </ul>
            {planning.questioned !== undefined ? (
              <>
                <p>
                  <WordsAroundAStamp
                    at={planning.questioned.at}
                    words={(when) => t('w13j.planning.questioned', { who: nameOf(planning.questioned?.by, participants), when })}
                  />
                </p>
                <dl data-testid="module-planning-answers" style={{ margin: 0, display: 'grid', gap: '.5rem' }}>
                  {PLAN_QUESTION_KEYS.map((key) => (
                    <div key={key}>
                      <dt className="rd-sub">{t(`w13j.planning.question.${key}`)}</dt>
                      <dd style={{ margin: 0 }}>{content(planning.questioned?.answers[key] ?? '')}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : planning.ended?.how === 'ticked by hand' ? (
              <p>
                <WordsAroundAStamp
                  at={planning.ended.at}
                  words={(when) => t('w13j.planning.tickedByHand', { who: nameOf(planning.ended?.by, participants), when })}
                />
              </p>
            ) : (
              <p className="rd-sub">{t('w13j.planning.waiting')}</p>
            )}
          </>
        )}
      </div>
    </Panel>
  )
}
