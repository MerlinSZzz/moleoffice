// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLAN A SUPERVISOR SENT WITH AN ALIGNMENT, ON THE PACKAGE'S OWN PAGE.
 *
 * A supervisor plans in outcomes, so the page draws each worker's whole outcome, its points, the files or area it
 * changes, its difficulty and model with their reasons, and the package's waves and what each later wave waits for.
 * There is no place here for a worker's own steps, because those are the worker's business.
 *
 * A plan written before this shape existed is drawn as the words it was, and a value in neither shape says it could
 * not be read rather than being guessed at. The office's hints are computed from the same shared function the align
 * door uses, so the page and the message cannot come to different hints.
 */

import type { PanelRecord } from '@shared/types.ts'
import { content, t } from '@shared/i18n.ts'
import { PLAN_HINT_WORD_KEYS, readAStoredPlan, type PlanHint } from '@shared/delegation.ts'
import { declaredAttributes } from './declares.ts'

const aBag = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * THE HINTS STORED ON THE NEWEST ALIGNMENT, or null because it has none. An absent field is not an empty list: the
 * page says the hints were not stored for that alignment, and never that there was no hint.
 */
const theStoredHints = (value: unknown): PlanHint[] | null => {
  if (!Array.isArray(value)) return null
  return value.filter(
    (one): one is PlanHint =>
      aBag(one) && typeof one['code'] === 'string' && Object.hasOwn(PLAN_HINT_WORD_KEYS, one['code']) && aBag(one['values']),
  )
}

export function PackageAlignmentPlan({ record }: { record: PanelRecord }) {
  const held = aBag(record.data) ? record.data['package'] : undefined
  if (!aBag(held) || !Object.hasOwn(held, 'parent')) return null
  const alignments = Array.isArray(held['alignments']) ? held['alignments'].filter(aBag) : []
  const newest = alignments.at(-1)
  const plan = newest === undefined ? null : readAStoredPlan(newest['plan'])
  const restated = newest !== undefined && typeof newest['restated'] === 'string' ? newest['restated'].trim() : ''
  const goOnWhy = newest !== undefined && typeof newest['goOnWhy'] === 'string' ? newest['goOnWhy'].trim() : ''
  const hints = newest === undefined ? null : theStoredHints(newest['hints'])
  return (
    <section className="pap" {...declaredAttributes({ surface: 'package.plan' })}>
      <style href="mole-office-package-alignment-plan" precedence="default">
        {PAP_CSS}
      </style>
      <h3 className="pap-title">{t('planShape.title')}</h3>
      {newest === undefined ? <p className="pap-quiet">{t('absence.none')}</p> : null}
      {newest === undefined ? null : (
        <>
          {restated === '' ? null : (
            <p className="pap-restated">
              <span className="pap-key">{t('planShape.restated')}</span>
              {content(restated)}
            </p>
          )}
          {plan === null ? <p className="pap-quiet">{t('planning.notReadable')}</p> : null}
          {plan !== null && plan.kind === 'text' ? (
            <pre className="pap-text">{plan.text}</pre>
          ) : null}
          {plan !== null && plan.kind === 'shape' ? (
            <>
              <div className="pap-workers">
                {plan.plan.workers.map((worker, index) => (
                  <div className="pap-worker" key={`${worker.worker}-${String(index)}`}>
                    <p className="pap-worker-name">
                      <span className="pap-key">{t('planShape.worker')}</span>
                      {content(worker.worker)}
                    </p>
                    <dl className="pap-facts">
                      <dt>{t('planShape.outcome')}</dt>
                      <dd>{content(worker.outcome)}</dd>
                      <dt>{t('planShape.points')}</dt>
                      <dd>{content(worker.points.join(', '))}</dd>
                      <dt>{t('planShape.files')}</dt>
                      <dd>{content(worker.files.join(', '))}</dd>
                      <dt>{t('planShape.difficulty')}</dt>
                      <dd>{worker.difficulty.trim() === '' ? t('planShape.notGiven') : content(worker.difficulty)}</dd>
                      <dt>{t('planShape.difficultyWhy')}</dt>
                      <dd>{worker.difficultyWhy === '' ? t('planShape.notGiven') : content(worker.difficultyWhy)}</dd>
                      <dt>{t('planShape.model')}</dt>
                      <dd>{content(worker.model)}</dd>
                      <dt>{t('planShape.modelWhy')}</dt>
                      <dd>{worker.modelWhy === '' ? t('planShape.notGiven') : content(worker.modelWhy)}</dd>
                    </dl>
                  </div>
                ))}
              </div>
              <p className="pap-waves">
                <span className="pap-key">{t('planShape.waves', { n: plan.plan.waves })}</span>
                {plan.plan.waves <= 1 ? null : (
                  <span className="pap-waits">
                    {Array.from({ length: plan.plan.waves - 1 }, (_, index) => {
                      const wave = index + 2
                      const why = plan.plan.waits[index] ?? ''
                      return (
                        <span className="pap-wait" key={wave}>
                          <span className="pap-wave-name">{t('planShape.wave', { n: wave })}</span>
                          <span className="pap-key">{t('planShape.waitsFor')}</span>
                          {why === '' ? t('planShape.notGiven') : content(why)}
                        </span>
                      )
                    })}
                  </span>
                )}
              </p>
              {goOnWhy === '' ? null : (
                <p className="pap-goon">
                  <span className="pap-key">{t('planShape.goOnWhy')}</span>
                  {content(goOnWhy)}
                </p>
              )}
            </>
          ) : null}
              {hints === null ? (
                <div className="pap-hints">
                  <p className="pap-key">{t('planShape.hints')}</p>
                  <p className="pap-quiet">{t('word.notRecorded')}</p>
                </div>
              ) : (
                <div className="pap-hints">
                  <p className="pap-key">{t('planShape.hints')}</p>
                  {hints.length === 0 ? (
                    <p className="pap-quiet">{t('absence.none')}</p>
                  ) : (
                    <ul className="pap-hint-list">
                      {hints.map((hint, index) => (
                        <li key={`${hint.code}-${String(index)}`}>{t(PLAN_HINT_WORD_KEYS[hint.code], hint.values)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
        </>
      )}
    </section>
  )
}

const PAP_CSS = `
.pap { margin-top: var(--gut); padding-top: var(--pad-lg); border-top: 1px solid var(--border); min-width: 0; }
.pap-title { font-size: var(--fs-2); margin: 0 0 var(--pad-lg); }
.pap-key { display: block; color: var(--text-3); font-size: var(--fs-1); }
.pap-quiet { margin: 0 0 var(--pad-lg); color: var(--text-2); overflow-wrap: anywhere; }
.pap-restated { margin: 0 0 var(--pad-lg); overflow-wrap: anywhere; }
.pap-text { margin: 0 0 var(--pad-lg); white-space: pre-wrap; overflow-wrap: anywhere; font-size: var(--fs-1); }
.pap-workers { display: grid; gap: var(--gut); min-width: 0; }
.pap-worker { min-width: 0; }
.pap-worker-name { margin: 0 0 4px; font-weight: 600; overflow-wrap: anywhere; }
.pap-facts { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 2px var(--pad-lg); margin: 0; font-size: var(--fs-1); }
.pap-facts dt { color: var(--text-3); }
.pap-facts dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.pap-waves { margin: var(--gut) 0 0; overflow-wrap: anywhere; }
.pap-waits { display: grid; gap: 4px; margin-top: 4px; }
.pap-wait { display: block; font-size: var(--fs-1); overflow-wrap: anywhere; }
.pap-wave-name { display: block; color: var(--text-3); }
.pap-hints { margin-top: var(--gut); }
.pap-hint-list { display: grid; gap: 4px; list-style: disc outside; margin: 4px 0 0; padding-left: var(--pad-lg); color: var(--text-2); font-size: var(--fs-1); overflow-wrap: anywhere; }
.pap-goon { margin: var(--gut) 0 0; overflow-wrap: anywhere; }
@media (max-width: 40rem) {
  .pap-facts { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .pap-facts dt { margin-top: 4px; }
}
`
