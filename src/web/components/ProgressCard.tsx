// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13s. The project's progress card on Home, drawn from the progress read.
import { useMemo } from 'react'
import { t } from '@shared/i18n.ts'
import { api } from '../api.ts'
import { Counted } from './home/Counted.tsx'
import { ErrorNote } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { PROGRESS_ASK_FLOOR_MS, READ_COST_FACTOR, oneAsk } from '../lib/oneask.ts'
import { currentWorkspace } from '../lib/workspace.ts'
import type { ProjectProgress } from '../../shared/progress.ts'

/**
 * THE PROJECT'S PROGRESS, ON HOME. Wave 13s round 235, from the design report of round 234.
 *
 * READ, NEVER STORED. The card asks `GET /api/backlog/progress` each time Home's minute ticks, and the answer is
 * counted from the project's live backlog points and its inside briefs when the page is read. Nothing here sets a
 * number, and the card has no press.
 *
 * A GAP IS NOT A ZERO. A point whose stored state is missing is counted in `noState`, never in `todo`, and the card
 * says so where somebody must act on it. The counts are neutral: the attention rail is only on a sentence that names
 * something to do.
 *
 * THE WHOLE ANSWER IS DRAWN, zeros included, because a zero is a fact here. A reading that answered with no backlog
 * point, no brief and no brief it could not read draws no card at all. While the card is read, and when the reading
 * failed, the card is drawn and says so, so a reading that did not answer is never shown as an empty project.
 */
export function ProgressCard({ tick }: { tick: number }) {
  // ONE ASK AT A TIME, PACED BY ITS LAST ANSWER (src/web/lib/oneask.ts). The card is asked on the
  // page's minute, but an answer took 15 s on the live office on 18 November 2026, so asking on
  // every tick put two asks of this door on the server. Keyed by the project, so a delayed ask reads
  // the project the card was asked about, and a switch of project is not held by the old one's bound.
  const askProgress = useMemo(
    () => oneAsk((project) => api.projectProgress(undefined, project), { key: currentWorkspace, floorMs: PROGRESS_ASK_FLOOR_MS, factor: READ_COST_FACTOR }),
    [],
  )
  const [reading, readAgain] = useProjectAsync(() => askProgress(), [tick])
  if (reading.status === 'ready' && holdsNothing(reading.value)) return null
  return (
    <section className="hm-section pg-card" data-progress-card="project">
      <style href="mole-office-progress-card" precedence="default">{PG_CARD_CSS}</style>
      <h2 className="hm-section-title">{t('progressCard.title')}</h2>
      {reading.status === 'loading' ? <p className="pg-reading">{t('progressCard.reading')}</p> : null}
      {reading.status === 'error' ? (
        <ErrorNote message={t('progressCard.failed')} fault={reading.fault ?? null} retry={readAgain} />
      ) : null}
      {reading.status === 'ready' ? <TheProgress reading={reading.value} /> : null}
    </section>
  )
}

/** No backlog point, no brief and no brief that could not be read: the project holds nothing for this card. */
function holdsNothing({ points, briefs, couldNotRead }: ProjectProgress): boolean {
  return points.total === 0 && briefs.total === 0 && couldNotRead.length === 0
}

/** The counts and the sentences that need a hand, once the reading is in. */
function TheProgress({ reading }: { reading: ProjectProgress }) {
  const { points, briefs, couldNotRead } = reading
  return (
    <>
      {/* WHICH POINTS ARE WHERE, and the three gaps that are somebody's to close. */}
      <div className="pg-group" data-progress-group="points">
        <h3 className="pg-group-title">{t('progressCard.points')}</h3>
        <dl className="pg-counts">
          <OneCount name="todo" label={t('progressCard.todo')} n={points.todo} />
          <OneCount name="doing" label={t('progressCard.doing')} n={points.doing} />
          <OneCount name="done" label={t('progressCard.done')} n={points.done} />
          <OneCount name="dropped" label={t('progressCard.dropped')} n={points.dropped} />
        </dl>
        {points.noState > 0 ? (
          <p className="pg-attention">
            <Counted
              text={t(points.noState === 1 ? 'progressCard.noStateOne' : 'progressCard.noState', {
                n: points.noState,
              })}
            />
          </p>
        ) : null}
        {points.inNoBrief > 0 ? (
          <p className="pg-attention">
            <Counted
              text={t(points.inNoBrief === 1 ? 'progressCard.inNoBriefOne' : 'progressCard.inNoBrief', {
                n: points.inNoBrief,
              })}
            />
          </p>
        ) : null}
        {points.carriedThreeBriefs > 0 ? (
          <p className="pg-attention">
            <Counted
              text={t(points.carriedThreeBriefs === 1 ? 'progressCard.carriedOne' : 'progressCard.carried', {
                n: points.carriedThreeBriefs,
              })}
            />
          </p>
        ) : null}
      </div>

      {/* WHERE THE BRIEFS STAND, and the two things to go and look at. */}
      <div className="pg-group" data-progress-group="briefs">
        <h3 className="pg-group-title">{t('progressCard.briefs')}</h3>
        <dl className="pg-counts">
          <OneCount name="waiting" label={t('progressCard.waiting')} n={briefs.waiting} />
          <OneCount name="taken" label={t('progressCard.taken')} n={briefs.taken} />
          <OneCount name="aligned" label={t('progressCard.aligned')} n={briefs.aligned} />
          <OneCount name="handedBack" label={t('progressCard.handedBack')} n={briefs.handedBack} />
          <OneCount name="returned" label={t('progressCard.returned')} n={briefs.returned} />
          <OneCount name="briefsDone" label={t('progressCard.done')} n={briefs.done} />
        </dl>
        {briefs.checkedRefused > 0 ? (
          <p className="pg-attention">
            <Counted
              text={t(
                briefs.checkedRefused === 1 ? 'progressCard.checkRefusedOne' : 'progressCard.checkRefused',
                { n: briefs.checkedRefused },
              )}
            />
          </p>
        ) : null}
        {couldNotRead.length > 0 ? (
          <p className="pg-attention">
            <Counted
              text={t(couldNotRead.length === 1 ? 'progressCard.couldNotReadOne' : 'progressCard.couldNotRead', {
                n: couldNotRead.length,
              })}
            />
          </p>
        ) : null}
      </div>
    </>
  )
}

/** One label and one number. The number is always drawn, a zero included. */
function OneCount({ name, label, n }: { name: string; label: string; n: number }) {
  return (
    <div className="pg-count">
      <dt>{label}</dt>
      <dd data-progress-count={name}>{n}</dd>
    </div>
  )
}

/**
 * THE CARD'S OWN SHEET. The counts wrap rather than taking a fixed column width, so the card is no wider than a
 * phone at 390 and the page does not scroll sideways. Every colour and size is a page token.
 */
const PG_CARD_CSS = `
/* The card: a quiet section of Home, ruled off from the band above it. */
.pg-card { min-width: 0; border-top: var(--border-w) solid var(--border-strong); padding-top: var(--gut); }
/* Reading: the page's quiet ink. */
.pg-reading { margin: 0 0 var(--gut); color: var(--text-3); font: var(--fs-2)/var(--lh-body) var(--font-ui); }
/* One group of counts. Groups never share a fixed track. */
.pg-group { min-width: 0; }
.pg-group + .pg-group { margin-top: var(--gut); }
/* The group's heading, in the page's own body type. */
.pg-group-title { margin: 0 0 var(--pad); color: var(--text); font: var(--fs-2)/var(--lh-tight) var(--font-ui); }
/* The counts wrap. There is no fixed column width, so 390 is as safe as 1440. */
.pg-counts { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--pad) var(--gut); min-width: 0; margin: 0; padding: 0; }
/* One count: its label above its number. */
.pg-count { display: flex; flex-direction: column; gap: 2px; min-width: 0; margin: 0; }
.pg-count dt { color: var(--text-3); font: var(--fs-1)/var(--lh-tight) var(--font-ui); }
.pg-count dd { margin: 0; color: var(--text); font: var(--fs-3)/var(--lh-tight) var(--font-ui); font-variant-numeric: tabular-nums; }
/* A gap or a refusal: a neutral sentence with the page's attention rail, because somebody must act on it. */
.pg-attention { margin: var(--pad) 0 0; border-left: var(--rail) solid var(--ask); padding-left: var(--pad); color: var(--text); font: var(--fs-2)/var(--lh-body) var(--font-ui); }
@media (max-width: 560px) {
  /* Two counts to a row at the phone's width, so nothing needs a sideways scroll. */
  .pg-count { flex: 1 1 40%; }
}
`
