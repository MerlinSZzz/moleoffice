// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORKERS A SUPERVISOR'S RUN ASKED FOR, AS A LIST A PERSON READS. Wave 13j round loop-4, item 0.
 *
 * A run keeps the workers it asked the office to start under `workerRuns`, and Normal mode drew none of it: Developer
 * mode showed it only as stored JSON in the stored-fields fold, which stays as it is. This panel draws the server's
 * reading of it (`workers` on the record's answer, read by `theWorkersARunStarted` in src/server/lib/worker-runs.ts), so
 * it works nothing out of its own. For each worker it says who it is, the model, its state, whether its run sealed and
 * the cost on its receipt, and the worker's name opens its own run.
 *
 * WITH A RUN, THE RUN SPEAKS: its own state and its own model, as the run's page draws them. Before there is a run, the
 * state is the ask's, in words, and the model is the one the office gave the launcher, said to be that. A seal and a
 * cost belong to a run, so a worker with no run is not said to have either.
 *
 * It draws nothing on a run that asked for no worker, as TheCheckOnARun draws nothing on a run nobody checked.
 *
 * AND THE OTHER WAY: A WORKER'S RUN NAMES THE RUN THAT ASKED FOR IT. Wave 13j round loop-5, item 2. `TheRunThatAskedForIt`
 * draws `askedForBy` on the record's answer (read by `theRunThatAskedForThisWorker` in the same server file) in words,
 * with a link to the supervisor's run. The server says it only when that run's own `workerRuns` names this run as
 * started, so a continued run, which has a parent too, draws nothing.
 */

import type { ReactNode } from 'react'
import { t } from '@shared/i18n.ts'
import type { AWorkerARunAskedFor, TheRunThatAskedForAWorker, TheWorkersARunStarted } from '@shared/worker-runs.ts'
import { stateWord } from '@shared/words.ts'
import { waitingOnALimitUntil } from '../lib/a-long-wait.ts'
import { RouteLink, recordPath } from './router.tsx'
import { Panel, type PanelProps } from './ui.tsx'

const WORKERS_SHEET = 'mole-office-workers-of-a-run'

const WORKERS_CSS = `
.wr-intro { margin: 0 0 var(--pad) 0; font-size: var(--fs-1); color: var(--text-2); }
.wr-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.wr-one { padding: var(--pad) 0; border-top: 1px solid var(--border); min-width: 0; }
.wr-one:first-child { border-top: none; padding-top: 0; }
.wr-who { margin: 0 0 var(--pad) 0; display: flex; gap: var(--pad); align-items: baseline; flex-wrap: wrap; min-width: 0; }
.wr-name { font-weight: 600; overflow-wrap: anywhere; }
.wr-handle { font-size: var(--fs-1); color: var(--text-2); overflow-wrap: anywhere; }
.wr-facts { margin: 0; display: flex; flex-direction: column; gap: 0.3rem; }
.wr-fact { display: grid; grid-template-columns: 5rem minmax(0, 1fr); column-gap: 0.5rem; align-items: baseline; }
.wr-fact dt { color: var(--text-3); font-size: var(--fs-1); overflow-wrap: anywhere; }
.wr-fact dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.wr-none { color: var(--text-2); }
.wr-more { margin: var(--pad) 0 0 0; font-size: var(--fs-1); color: var(--text-2); }
.wr-asked-says { margin: 0 0 0.3rem 0; overflow-wrap: anywhere; }
.wr-asked-run { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
`

export function TheWorkersOfARun({
  workers,
  titleIs,
}: {
  workers: TheWorkersARunStarted | null | undefined
  titleIs?: PanelProps['titleIs']
}) {
  if (workers === null || workers === undefined) return null
  return (
    <>
      <style href={WORKERS_SHEET} precedence="default">
        {WORKERS_CSS}
      </style>
      <Panel declares={{ surface: null }} title={t('record.section.workerRuns')} titleIs={titleIs}>
        <p className="wr-intro">{t('w13j.workers.intro')}</p>
        <ul className="wr-list">
          {workers.workers.map((worker) => (
            <OneWorker key={worker.agent} worker={worker} />
          ))}
        </ul>
        {workers.unreadable === 0 ? null : <p className="wr-more">{t('w13j.workers.unreadable', { n: workers.unreadable })}</p>}
      </Panel>
    </>
  )
}

/** On a worker's run: who asked the office to start it, and the run it asked from, which the run's title opens. */
export function TheRunThatAskedForIt({
  askedForBy,
  titleIs,
}: {
  askedForBy: TheRunThatAskedForAWorker | null | undefined
  titleIs?: PanelProps['titleIs']
}) {
  if (askedForBy === null || askedForBy === undefined) return null
  return (
    <>
      <style href={WORKERS_SHEET} precedence="default">
        {WORKERS_CSS}
      </style>
      <Panel declares={{ surface: null }} title={t('w13j.askedFor.title')} titleIs={titleIs}>
        <div className="wr-asked">
          <p className="wr-asked-says">
            {askedForBy.askerName === null ? t('w13j.askedFor.saysNoName') : t('w13j.askedFor.says', { name: askedForBy.askerName })}
          </p>
          <p className="wr-asked-run">
            <RouteLink to={recordPath(askedForBy.run, 'session')}>{askedForBy.title}</RouteLink>
          </p>
        </div>
      </Panel>
    </>
  )
}

function OneWorker({ worker }: { worker: AWorkerARunAskedFor }) {
  const { run, runId } = worker
  const name = worker.name ?? worker.handle
  return (
    <li className="wr-one">
      <p className="wr-who">
        {run === null || runId === null ? (
          <span className="wr-name">{name}</span>
        ) : (
          <RouteLink to={recordPath(runId, 'session')} className="wr-name">
            {name}
          </RouteLink>
        )}
        {worker.name === null || worker.name === worker.handle ? null : <span className="wr-handle">{worker.handle}</span>}
      </p>
      <dl className="wr-facts">
        <Fact label={t('record.section.model')}>{theModel(worker)}</Fact>
        <Fact label={t('runPage.state')}>{theState(worker)}</Fact>
        {run === null ? null : <Fact label={t('w13j.workers.seal')}>{run.sealed ? t('w13j.workers.sealed') : t('w13j.workers.notSealed')}</Fact>}
        {run === null ? null : <Fact label={t('w13j.workers.cost')}>{theCost(run.receipt)}</Fact>}
      </dl>
    </li>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="wr-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

const nobodyRecordedOne = () => <span className="wr-none">{t('runPage.notRecorded')}</span>

/** The run's own model; before a run, the model its launcher was given, said to be that. */
function theModel({ run, modelGiven }: AWorkerARunAskedFor): ReactNode {
  if (run !== null) return run.model ?? nobodyRecordedOne()
  return modelGiven === null ? nobodyRecordedOne() : t('w13j.workers.modelGiven', { model: modelGiven })
}

/**
 * The run's own state word, or the wait of a running run whose next try on a usage limit is more than an hour away;
 * before a run, or when its run is not here, the ask's state in words.
 */
function theState({ run, runId, asked, failedSays }: AWorkerARunAskedFor): ReactNode {
  if (run !== null && run.waitsLongUntil !== undefined) return waitingOnALimitUntil(run.waitsLongUntil)
  if (run !== null) return run.state === null ? nobodyRecordedOne() : stateWord(run.state, 'normal', 'session').text
  switch (asked) {
    case 'wanted':
      return t('w13j.workers.wanted')
    case 'starting':
      return t('w13j.workers.starting')
    case 'failed':
      return failedSays === null ? t('w13j.workers.failedNoReason') : t('w13j.workers.failed', { says: failedSays })
    case 'started':
      return runId === null ? t('w13j.workers.noRunNamed') : t('w13j.workers.runNotHere', { id: runId })
  }
}

/** The cost on the run's receipt, or which absence it is: no receipt, or a receipt that gives no cost. */
function theCost(receipt: { costUsd: number | null } | null): ReactNode {
  if (receipt === null) return <span className="wr-none">{t('w13j.workers.noReceipt')}</span>
  if (receipt.costUsd === null) return <span className="wr-none">{t('w13j.workers.receiptNoCost')}</span>
  return t('devWords.receipt.usd', { amount: String(receipt.costUsd) })
}
