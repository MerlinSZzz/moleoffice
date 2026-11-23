// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PACKAGE'S WORKERS, ON THE PACKAGE'S OWN PAGE. Round FQ, point OP-3.
 *
 * The server reads every worker's run and the task's own package into `GET /api/delegation/<task>/workers`
 * (`theWorkersOfAPackage` in src/server/lib/package-workers.ts); this panel draws that reading and works nothing out of
 * its own. For each worker: its name and handle, the ask's state, its run, the model, the points it was given, the
 * difficulty and why, its tokens, its minutes and how many hand-backs name its run. A worker whose run was never filed
 * is drawn too, with the reason its numbers are absent.
 *
 * A MISSING RECEIPT IS NEVER ZERO. The server says which absence it is, and this panel repeats that sentence rather
 * than drawing a zero. Minutes a running run has not finished are absent for the same reason.
 */

import type { ReactNode } from 'react'
import type { PanelRecord } from '@shared/types.ts'
import { t } from '@shared/i18n.ts'
import { stateWord } from '@shared/words.ts'
import type { AWorkerOfAPackage, TheWorkersOfAPackage } from '@shared/package-workers.ts'
import { api } from '../api.ts'
import { RouteLink, recordPath } from './router.tsx'
import { ErrorNote, Loading, Panel, ServerNote, useAsync } from './ui.tsx'
import { taskHasAPackage } from './TaskPackagePanel.tsx'

const PACKAGE_WORKERS_SHEET = 'mole-office-package-workers'

export const PACKAGE_WORKERS_CSS = `
.pw-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.pw-one { padding: var(--pad) 0; border-top: 1px solid var(--border); min-width: 0; }
.pw-one:first-child { border-top: none; padding-top: 0; }
.pw-who { margin: 0 0 var(--pad) 0; display: flex; gap: var(--pad); align-items: baseline; flex-wrap: wrap; min-width: 0; }
.pw-name { font-weight: 600; overflow-wrap: anywhere; }
.pw-handle { font-size: var(--fs-1); color: var(--text-2); overflow-wrap: anywhere; }
.pw-facts { margin: 0; display: flex; flex-direction: column; gap: 0.3rem; }
.pw-fact { display: grid; grid-template-columns: 6rem minmax(0, 1fr); column-gap: 0.5rem; align-items: baseline; }
.pw-fact dt { color: var(--text-3); font-size: var(--fs-1); overflow-wrap: anywhere; }
.pw-fact dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.pw-says { display: block; margin: 0.2rem 0 0 0; font-size: var(--fs-1); color: var(--text-2); overflow-wrap: anywhere; }
.pw-none { color: var(--text-2); }
.pw-more { margin: var(--pad) 0 0 0; font-size: var(--fs-1); color: var(--text-2); }
`

export function PackageWorkers({ record }: { record: PanelRecord }) {
  const [state] = useAsync(() => api.packageWorkers(record.id), [record.id])
  if (!taskHasAPackage(record.data)) return null
  return (
    <>
      <style href={PACKAGE_WORKERS_SHEET} precedence="default">
        {PACKAGE_WORKERS_CSS}
      </style>
      <Panel titleIs="label" declares={{ surface: null }} title={t('packageWorkers.title')}>
        {state.status === 'loading' ? <Loading what={t('packageWorkers.title')} rows={1} /> : null}
        {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault} /> : null}
        {state.status === 'ready' ? <TheWorkersOfAPackagePanel reading={state.value} /> : null}
      </Panel>
    </>
  )
}

/** The fetched reading, as a pure drawing a test can render without a server. */
export function TheWorkersOfAPackagePanel({ reading }: { reading: TheWorkersOfAPackage }) {
  return (
    <>
      {reading.workers.length === 0 ? <p className="pw-none">{t('absence.none')}</p> : null}
      <ul className="pw-list">
        {reading.workers.map((worker, index) => (
          <OneWorker key={`${worker.agent ?? 'no-agent'}:${String(index)}`} worker={worker} />
        ))}
      </ul>
      <p className="pw-more">
        {t('packageWorkers.handbacks', {
          total: String(reading.handbacks.total),
          byWorkers: String(reading.handbacks.byWorkers),
          notNaming: String(reading.handbacks.notNamingAWorker),
        })}
      </p>
    </>
  )
}

function OneWorker({ worker }: { worker: AWorkerOfAPackage }) {
  const name = worker.name ?? worker.handle
  return (
    <li className="pw-one">
      <p className="pw-who">
        {worker.runId === null ? (
          <span className="pw-name">{name}</span>
        ) : (
          <RouteLink to={recordPath(worker.runId, 'session')} className="pw-name">
            {name}
          </RouteLink>
        )}
        {worker.name === null || worker.name === worker.handle ? null : <span className="pw-handle">{worker.handle}</span>}
      </p>
      <dl className="pw-facts">
        <Fact label={t('packageWorkers.worker')}>{worker.handle}</Fact>
        <Fact label={t('packageWorkers.asked')}>
          {theAskWord(worker.asked)}
          {worker.askedOn === null ? (
            <span className="pw-none">{t('word.notRecorded')}</span>
          ) : (
            <span className="pw-says">
              {t('packageWorkers.askedOn', { title: worker.askedOn.title ?? worker.askedOn.run })}
            </span>
          )}
        </Fact>
        <Fact label={t('packageWorkers.state')}>{theRunState(worker)}</Fact>
        <Fact label={t('packageWorkers.model')}>{worker.model ?? <Absent />}</Fact>
        <Fact label={t('packageWorkers.points')}>{worker.points.length === 0 ? <Absent /> : worker.points.join(', ')}</Fact>
        <Fact label={t('packageWorkers.difficulty')}>{theDifficulty(worker.difficulty)}</Fact>
        <Fact label={t('packageWorkers.why')}>{worker.why ?? <Absent />}</Fact>
        <Fact label={t('packageWorkers.tokens')}>{theTokens(worker)}</Fact>
        <Fact label={t('packageWorkers.minutes')}>{theMinutes(worker)}</Fact>
        <Fact label={t('packageWorkers.wentBack')}>
          {String(worker.wentBack)}
        </Fact>
      </dl>
    </li>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="pw-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

const Absent = () => <span className="pw-none">{t('packageWorkers.noneRecorded')}</span>

function theAskWord(asked: AWorkerOfAPackage['asked']): string {
  switch (asked) {
    case 'wanted':
      return t('packageWorkers.wanted')
    case 'starting':
      return t('packageWorkers.starting')
    case 'started':
      return t('packageWorkers.started')
    case 'failed':
      return t('packageWorkers.failed')
  }
}

function theRunState(worker: AWorkerOfAPackage): ReactNode {
  const state = worker.state === null ? (worker.runId === null ? <span className="pw-none">{t('packageWorkers.noRun')}</span> : <Absent />) : stateWord(worker.state, 'normal', 'session').text
  if (worker.runId === null) return state
  return (
    <>
      <RouteLink to={recordPath(worker.runId, 'session')}>{worker.runTitle ?? worker.runId}</RouteLink> · {state}
    </>
  )
}

/**
 * THE DIFFICULTY AS THE SUPERVISOR WROTE IT. A label the page has no word for is still the supervisor's answer, so it is
 * drawn as stored rather than as absent or as a word picked from the page's own list.
 */
function theDifficulty(difficulty: AWorkerOfAPackage['difficulty']): ReactNode {
  return difficulty === null || difficulty.trim() === '' ? <Absent /> : difficulty
}

function theTokens(worker: AWorkerOfAPackage): ReactNode {
  const { input, output, total, notRead } = worker.tokens
  return (
    <>
      {total === null ? (
        <span className="pw-none">{t('packageWorkers.notRead')}</span>
      ) : (
        t('packageWorkers.tokenCount', { total: String(total), input: String(input ?? 0), output: String(output ?? 0) })
      )}
      {notRead === null ? null : <ServerNote text={notRead} />}
    </>
  )
}

function theMinutes(worker: AWorkerOfAPackage): ReactNode {
  const { minutes, running } = worker.minutes
  return (
    <>
      {minutes === null ? (
        <span className="pw-none">{running ? t('packageWorkers.running') : t('packageWorkers.notRead')}</span>
      ) : (
        t('packageWorkers.minuteCount', { n: String(minutes) })
      )}
    </>
  )
}
