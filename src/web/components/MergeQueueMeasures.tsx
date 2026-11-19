// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE QUEUE'S MEASURES ON ITS PAGE: the last days as one small table, one column a day and one row a figure, read
 * from GET /api/merge-queue/measures (src/server/lib/merge-queue-measures.ts). The table's last row is the stable office
 * against main at each day's end. Below the table, the stable office against main as read now, where each figure comes
 * from, and what the measures do not give. An estimate says so in its row.
 * The section reads its own door, so the queue's reply stays as it is.
 */
import { listJoined, t } from '@shared/i18n.ts'
import { MEASURED_FIGURES, MEASURES_DAYS, type MeasuredDay, type MeasuredFigure, type MeasuredWait, type QueueMeasures } from '@shared/merge-queue-measures.ts'
import { BOUNCE_REASONS, type BounceReason } from '@shared/merge-queue.ts'
import { Fragment, type ReactNode } from 'react'
import { api } from '../api.ts'
import { InReach } from './InReach.tsx'
import { recordPath } from './router.tsx'
import { ErrorNote, Loading, Panel } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'

export const MEASURES_CSS = `
.mq-measures { min-width: 0; }
.mq-measures-body { display: grid; gap: var(--pad); min-width: 0; }
.mq-measures-what, .mq-measures-stable, .mq-measures-left { margin: 0; max-width: 70ch; color: var(--text-2); font: var(--fs-1)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.mq-measures-scroll { overflow-x: auto; min-width: 0; }
.mq-measures-table { border-collapse: collapse; font: var(--fs-1)/var(--lh-read) var(--font-ui); color: var(--text); }
.mq-measures-table th, .mq-measures-table td { padding: 4px 8px; border-bottom: var(--border-w) solid var(--border); text-align: left; vertical-align: top; }
.mq-measures-table thead th { color: var(--text-3); font-weight: 600; white-space: nowrap; }
.mq-measures-table th[scope='row'] { min-width: 10em; max-width: 14em; color: var(--text); font-weight: 600; }
.mq-measures-table td { min-width: 8em; max-width: 16em; overflow-wrap: anywhere; }
.mq-measures-table td[data-figure='landed'], .mq-measures-table td[data-figure='handBacks'], .mq-measures-table td[data-figure='takeBacks'] { min-width: 3em; }
.mq-measures-line { display: block; }
.mq-measures-line + .mq-measures-line { margin-top: 2px; color: var(--text-2); }
.mq-measures-from { display: grid; grid-template-columns: minmax(8em, max-content) minmax(0, 1fr); gap: 4px 12px; margin: 0; max-width: 90ch; font: var(--fs-1)/var(--lh-read) var(--font-ui); }
.mq-measures-from dt { color: var(--text); font-weight: 600; }
.mq-measures-from dd { margin: 0; color: var(--text-2); overflow-wrap: anywhere; }
.mq-measures-heading { margin: 0; color: var(--text); font: 600 var(--fs-1)/var(--lh-read) var(--font-ui); }
.mq-measures-not { margin: 0; padding-left: 1.2em; max-width: 70ch; color: var(--text-2); font: var(--fs-1)/var(--lh-read) var(--font-ui); }
@media (max-width: 480px) {
  .mq-measures-from { grid-template-columns: minmax(0, 1fr); }
  .mq-measures-from dd { margin-bottom: 4px; }
}
`

/** The figures the table draws, a row each. The stable office as read now is said below the table. */
const ROWS = MEASURED_FIGURES.filter((figure): figure is Exclude<MeasuredFigure, 'stable'> => figure !== 'stable')

/** A wait in minutes, as a person reads it: minutes under an hour, hours and minutes over it. */
function aDuration(minutes: number): string {
  if (minutes < 60) return t('mergeQueueMeasures.minutes', { minutes: String(minutes) })
  const whole = Math.round(minutes)
  const hours = Math.floor(whole / 60)
  const rest = whole % 60
  if (rest === 0) return t('mergeQueueMeasures.hours', { hours: String(hours) })
  return t('mergeQueueMeasures.hoursMinutes', { hours: String(hours), minutes: String(rest) })
}

const lines = (...said: (string | ReactNode | null)[]): ReactNode =>
  said
    .filter((one) => one !== null)
    .map((one, i) => (
      <span key={i} className="mq-measures-line">
        {one}
      </span>
    ))

function aWait(wait: MeasuredWait): ReactNode {
  if (wait.measured === 0 && wait.unmeasured === 0) return t('mergeQueueMeasures.noWait')
  return lines(
    wait.medianMinutes === null || wait.p90Minutes === null ? null : t('mergeQueueMeasures.wait', { median: aDuration(wait.medianMinutes), p90: aDuration(wait.p90Minutes) }),
    wait.unmeasured > 0 ? t('mergeQueueMeasures.unmeasured', { n: wait.unmeasured }) : null,
  )
}

const short = (commit: string): string => commit.slice(0, 7)

/** What one day's cell says for one figure. */
function theCell(day: MeasuredDay, figure: (typeof ROWS)[number]): ReactNode {
  switch (figure) {
    case 'landed':
      return String(day.landed)
    case 'submittedToLanded':
    case 'judgedToLanded':
      return aWait(day[figure])
    case 'tested': {
      const { relatedOnly, wholeSuite, wholeSuiteCases, noChoiceRecorded } = day.tested
      if (relatedOnly + wholeSuite + noChoiceRecorded === 0) return t('mergeQueueMeasures.none')
      const cases = Object.keys(wholeSuiteCases)
        .sort((a, b) => Number(a) - Number(b))
        .map((one) => t('mergeQueueMeasures.case', { case: one, n: String(wholeSuiteCases[one]) }))
      return lines(
        t('mergeQueueMeasures.tests', { related: String(relatedOnly), whole: String(wholeSuite) }),
        cases.length > 0 ? t('mergeQueueMeasures.cases', { cases: listJoined(cases) }) : null,
        noChoiceRecorded > 0 ? t('mergeQueueMeasures.noChoice', { n: noChoiceRecorded }) : null,
      )
    }
    case 'handBacks':
      return String(day.handBacks)
    case 'fixRounds':
      return day.fixRounds.total === 0
        ? '0'
        : lines(String(day.fixRounds.total), t('mergeQueueMeasures.fixRoundsBy', { line: String(day.fixRounds.line), sheriff: String(day.fixRounds.sheriff) }))
    case 'takeBacks':
      return String(day.takeBacks)
    case 'bounced': {
      const { total, byCause, noCause } = day.bounced
      const causes = Object.keys(byCause)
        .sort()
        .map((cause) => t('mergeQueueMeasures.byCause', { cause: causeWord(cause), n: String(byCause[cause]) }))
      return lines(String(total), causes.length > 0 ? listJoined(causes) : null, noCause > 0 ? t('mergeQueueMeasures.noCause', { n: noCause }) : null)
    }
    case 'receipts':
      if (day.receipts.length === 0) return t('mergeQueueMeasures.none')
      return lines(
        ...day.receipts.map((receipt) => (
          <>
            <a href={recordPath(receipt.id)}>
              {t(receipt.green ? 'mergeQueueMeasures.receiptGreen' : 'mergeQueueMeasures.receiptRed', { commit: short(receipt.commit) })}
            </a>
            {receipt.failedFiles.length > 0 ? <> {t('mergeQueueMeasures.redFiles', { files: listJoined(receipt.failedFiles) })}</> : null}
            {receipt.redAlone !== null && receipt.redAlone.length > 0 ? <> {t('mergeQueueMeasures.redAlone', { files: listJoined(receipt.redAlone) })}</> : null}
          </>
        )),
      )
    case 'mainRed':
      return lines(
        t('mergeQueueMeasures.mainRed', { red: String(day.mainRed.red), hours: String(day.hours) }),
        day.mainRed.unknown > 0 ? t('mergeQueueMeasures.mainUnknown', { unknown: String(day.mainRed.unknown) }) : null,
      )
    case 'stableAtDayEnd': {
      const stable = day.stableAtDayEnd
      if (stable.state === 'unknown') return stable.why
      return lines(
        t('mergeQueueMeasures.stableDayBehind', { n: stable.behind, behind: String(stable.behind) }),
        t('mergeQueueMeasures.stableDayCommits', { serving: short(stable.serving), main: short(stable.main) }),
      )
    }
  }
}

/** A bounce's cause in words, or the stored word itself for a cause the queue does not list. */
function causeWord(cause: string): string {
  return (BOUNCE_REASONS as readonly string[]).includes(cause) ? t(`mergeQueueMeasures.cause.${cause as BounceReason}`) : cause
}

/** A figure's name in its row, with "estimate" beside it when it is one. */
function figureName(measures: QueueMeasures, figure: MeasuredFigure): string {
  const name = t(`mergeQueueMeasures.row.${figure}`)
  return measures.estimated.includes(figure) ? t('mergeQueueMeasures.isEstimate', { figure: name }) : name
}

/** The table and what goes with it, drawn from one answer. Exported so a test can draw it with no server. */
export function TheMeasuresTable({ measures }: { measures: QueueMeasures }) {
  const { stable } = measures
  return (
    <div className="mq-measures-body">
      <p className="mq-measures-what">{t('mergeQueueMeasures.what')}</p>
      <InReach box="mq-measures-scroll" name={t('mergeQueueMeasures.heading', { days: String(measures.days) })} shape={measures.measures.map((one) => one.day).join(',')}>
        <table className="mq-measures-table">
          <thead>
            <tr>
              <th scope="col">{t('mergeQueueMeasures.figure')}</th>
              {measures.measures.map((day) => (
                <th scope="col" data-day={day.day} key={day.day}>
                  {day.day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((figure) => (
              <tr key={figure}>
                <th scope="row">{figureName(measures, figure)}</th>
                {measures.measures.map((day) => (
                  <td data-day={day.day} data-figure={figure} key={day.day}>
                    {theCell(day, figure)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </InReach>
      <p className="mq-measures-stable" data-figure="stable">
        {stable.state === 'read'
          ? t('mergeQueueMeasures.stableBehind', { n: stable.behind, behind: String(stable.behind), serving: short(stable.serving), main: short(stable.main) })
          : stable.why}
      </p>
      {measures.receiptsNotPlaced.length > 0 ? <p className="mq-measures-left">{t('mergeQueueMeasures.notPlaced', { n: measures.receiptsNotPlaced.length })}</p> : null}
      {measures.undated > 0 ? <p className="mq-measures-left">{t('mergeQueueMeasures.undated', { n: measures.undated })}</p> : null}
      <h3 className="mq-measures-heading">{t('mergeQueueMeasures.fromHeading')}</h3>
      <dl className="mq-measures-from">
        {MEASURED_FIGURES.map((figure) => (
          <Fragment key={figure}>
            <dt>{figureName(measures, figure)}</dt>
            <dd>{measures.sources[figure]}</dd>
          </Fragment>
        ))}
      </dl>
      <h3 className="mq-measures-heading">{t('mergeQueueMeasures.notGivenHeading')}</h3>
      <ul className="mq-measures-not">
        {measures.notGiven.map((words) => (
          <li key={words}>{words}</li>
        ))}
      </ul>
    </div>
  )
}

/** The section on the merge queue page: the last days, read from the measures door. */
export function MergeQueueMeasures() {
  const [state, reload] = useProjectAsync(() => api.mergeQueueMeasures(MEASURES_DAYS.default), [])
  const heading = t('mergeQueueMeasures.heading', { days: String(MEASURES_DAYS.default) })
  return (
    <div className="mq-measures">
      <Panel declares={{ surface: 'mergequeue.measures' }} title={heading}>
        {state.status === 'loading' ? <Loading label={t('mergeQueueMeasures.loading')} rows={3} /> : null}
        {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault ?? null} retry={reload} /> : null}
        {state.status === 'ready' ? <TheMeasuresTable measures={state.value} /> : null}
      </Panel>
    </div>
  )
}
