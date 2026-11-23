// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ChannelEvent } from '@shared/events.ts'
import type { StableOfficeHistoryPage as StableUpgradeHistoryPage, StableOfficeHistoryRow as StableUpgradeHistoryRow } from '@shared/stable-bootstrap-notices.ts'
import { api, type Fault } from '../api.ts'
import { messagePath, recordPath, RouteLink } from '../components/router.tsx'
import { ErrorNote, type AsyncState } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { currentWorkspace, subscribeWorkspace } from '../lib/workspace.ts'
import { useChannel, whenEventsWereLost, whenTheStreamCameBack } from '../lib/channel.ts'
import { useInspect } from '../lib/mode.ts'
import { t } from '@shared/i18n.ts'

/** The event names the project of the write, regardless of where a message record is stored. */
export function historyMessageEventIsForWorkspace(event: ChannelEvent, workspace: string): boolean {
  return event.name === 'message.new' && event.workspaceId === workspace
}

/** A workspace change or a durable re-read gets a fresh page-local state boundary. */
export function versionHistoryBoundaryKey(workspace: string, generation: number): string {
  return JSON.stringify([workspace, generation])
}

/** The status is read from the event outcome itself. A tag never stands in for one. */
function outcomeWord(row: StableUpgradeHistoryRow): string {
  switch (row.outcome) {
    case 'handed-off':
      return t('versionHistoryPage.handedOff')
    case 'completed':
      return t('w13q.upgrades.completedSentence')
    case 'refused':
      return row.reason ?? t('w13q.upgrades.refused')
    case 'failed-restored':
      return row.reason ?? t('w13q.upgrades.failedRestored')
    case 'not-restored':
      return row.reason ?? t('w13q.upgrades.notRestored')
    case 'unfinished':
      return 'kind' in row && row.kind === 'first-handoff' ? t('w13q.upgrades.handoffUnfinishedSentence') : t('w13q.upgrades.unfinishedSentence')
  }
  return t('w13q.upgrades.unfinishedSentence')
}

function noticeStateWord(state: NonNullable<StableUpgradeHistoryRow['notices']['after']> | null): string {
  if (state === null) return t('w13q.upgrades.noticeUnavailable')
  switch (state) {
    case 'unchanged':
      return t('w13q.upgrades.noticeUnchanged')
    case 'changed':
      return t('versionHistoryPage.noticeChanged')
    case 'deleted':
      return t('versionHistoryPage.noticeDeleted')
    case 'missing':
      return t('versionHistoryPage.noticeMissing')
  }
  return t('w13q.upgrades.noticeUnavailable')
}

/** The link opens the message's current record; the history data keeps the original event details. */
function MessageRecord({ event, label, linkLabel, state }: {
  event: StableUpgradeHistoryRow['before']
  label: string
  linkLabel: string
  state: NonNullable<StableUpgradeHistoryRow['notices']['after']> | null
}) {
  return (
    <li className="vh-event">
      <span className="vh-event-kind">{label}</span>
      <RouteLink to={messagePath(event.id)} className="vh-event-current">
        {linkLabel}
      </RouteLink>
      <dl className="vh-recorded-fields">
        <div><dt>{t('w13q.upgrades.recordId')}</dt><dd><code>{event.id}</code></dd></div>
        <div><dt>{t('w13q.upgrades.originalRevision')}</dt><dd>{t('w13q.upgrades.eventRevision', { seq: String(event.seq) })}</dd></div>
        <div><dt>{t('w13q.upgrades.originalHash')}</dt><dd><code>{event.contentHash}</code></dd></div>
        <div><dt>{t('w13q.upgrades.currentNotice')}</dt><dd>{noticeStateWord(state)}</dd></div>
      </dl>
    </li>
  )
}

type EmergencyFacts = Extract<StableUpgradeHistoryRow, { kind: 'emergency' }>['emergency']

/**
 * What an emergency release owes, in the office's own reading: the follow-up receipt and the report. A release that did
 * not go in owes neither, and the office says so with "not-owed". A filed one is linked from its line, at its record's
 * own address, so its id is in the address and not in the words. Filed is what the office read when this page asked: a
 * record deleted since keeps its link until the page reads the history again, and its page then says it is deleted.
 */
function EmergencyDebts({ facts }: { facts: EmergencyFacts }) {
  const { followUp, report } = facts
  if (followUp.state === 'not-owed' && report.state === 'not-owed') return <p className="vh-emergency-line">{t('versionHistoryPage.owesNothing')}</p>
  const receiptLine = followUp.state === 'not-owed' ? null
    : followUp.state === 'missing' ? t('w13q.upgrades.followUpMissing')
    : followUp.state === 'unknown' ? t('w13q.upgrades.followUpUnknown')
    : followUp.green ? t('w13q.upgrades.followUpPassed') : t('w13q.upgrades.followUpFailed')
  const reportLine = report.state === 'not-owed' ? null
    : report.state === 'missing' ? t('w13q.upgrades.reportMissing')
    : report.state === 'unknown' ? t('w13q.upgrades.reportUnknown') : t('w13q.upgrades.reportFiled')
  const receiptLink = followUp.state !== 'filed' ? null
    : <RouteLink to={recordPath(followUp.receipt.id, 'whole_suite_receipt')}>{t('w13q.upgrades.openFollowUpReceipt')}</RouteLink>
  const reportLink = report.state !== 'filed' ? null
    : <RouteLink to={recordPath(report.id, 'report')}>{t('w13q.upgrades.openReport')}</RouteLink>
  return <>
    {receiptLine === null ? null : <p className="vh-emergency-line">{receiptLine}{receiptLink === null ? null : <> {receiptLink}</>}</p>}
    {reportLine === null ? null : <p className="vh-emergency-line">{reportLine}{reportLink === null ? null : <> {reportLink}</>}</p>}
  </>
}

/** The emergency release's ids, and the reasons a read failed, for the Developer details. */
function EmergencyRecorded({ facts }: { facts: EmergencyFacts }) {
  const { followUp, report } = facts
  return <>
    <div><dt>{t('w13q.upgrades.emergencyThrow')}</dt><dd><code>{facts.throw.change}</code></dd></div>
    <div><dt>{t('w13q.upgrades.emergencyThrowOrder')}</dt><dd>{String(facts.throw.appendOrder)}</dd></div>
    <div><dt>{t('w13q.upgrades.emergencyMessage')}</dt><dd><code>{facts.message.id}</code></dd></div>
    {followUp.state === 'filed' ? <>
      <div><dt>{t('w13q.upgrades.followUpReceipt')}</dt><dd><code>{followUp.receipt.id}</code></dd></div>
      <div><dt>{t('w13q.upgrades.followUpCommit')}</dt><dd><code>{followUp.commit}</code></dd></div>
    </> : null}
    {followUp.state === 'unknown' ? <div><dt>{t('w13q.upgrades.followUpWhy')}</dt><dd>{followUp.because}</dd></div> : null}
    {report.state === 'filed' ? <div><dt>{t('w13q.upgrades.report')}</dt><dd><code>{report.id}</code></dd></div> : null}
    {report.state === 'unknown' ? <div><dt>{t('w13q.upgrades.reportWhy')}</dt><dd>{report.because}</dd></div> : null}
  </>
}

function UpgradeEntry({ row }: { row: StableUpgradeHistoryRow }) {
  const inspect = useInspect()
  const observedDate = row.date.slice(0, 10)
  const noticeChanged = row.notices.before === 'changed' || row.notices.after === 'changed'
  const handoff = 'kind' in row && row.kind === 'first-handoff' ? row : null
  const emergency = 'kind' in row && row.kind === 'emergency' ? row.emergency : null
  return (
    <article className="vh-entry">
      <header className="vh-entry-heading">
        <h2 className="vh-entry-title">
          <code>{row.tag}</code>
        </h2>
        <time className="vh-date" dateTime={observedDate}>{observedDate}</time>
      </header>

      {emergency === null ? null : (
        <p className="vh-emergency"><strong>{t('w13q.upgrades.emergency')}</strong> {t('w13q.upgrades.emergencyNoReceipt')}</p>
      )}
      <p className="vh-outcome" data-outcome={row.outcome}>{outcomeWord(row)}</p>
      {emergency === null ? null : <EmergencyDebts facts={emergency} />}
      <section className="vh-notice-block" aria-label={t('w13q.upgrades.secretaryNotice')}>
        <h3>{t('w13q.upgrades.secretaryNotice')}</h3>
        <p className="vh-notice">{row.notice}</p>
      </section>
      <p className="vh-commit-range">
        {t('w13q.upgrades.commitRangeShort', {
          from: row.fromCommit.slice(0, 9),
          to: row.toCommit.slice(0, 9),
        })}
      </p>
      {noticeChanged ? <p className="vh-notice-changed">{t('versionHistoryPage.editedLater')}</p> : null}
      <RouteLink to={messagePath(row.before.id)} className="vh-announcement-link">
        {t('w13q.upgrades.openAnnouncement')}
      </RouteLink>

      {inspect ? (
        <details className="vh-recorded-details">
          <summary>{t('w13q.upgrades.recordedDetails')}</summary>
          <dl className="vh-recorded-fields vh-entry-recorded-fields">
            <div><dt>{t('w13q.upgrades.baseline')}</dt><dd>{row.baselineTag === null ? t('w13q.upgrades.noPreviousStable') : <code>{row.baselineTag}</code>}</dd></div>
            {handoff === null ? null : <>
              <div><dt>{t('w13q.upgrades.fromRepository')}</dt><dd><code>{handoff.fromRepository}</code></dd></div>
              <div><dt>{t('w13q.upgrades.toRepository')}</dt><dd><code>{handoff.toRepository}</code></dd></div>
            </>}
            {emergency === null ? null : <EmergencyRecorded facts={emergency} />}
            <div><dt>{t('w13q.upgrades.fullCommitRange')}</dt><dd><code>{row.fromCommit}</code> → <code>{row.toCommit}</code></dd></div>
            <div><dt>{t('w13q.upgrades.tree')}</dt><dd><code>{row.tree}</code></dd></div>
          </dl>
          <ul className="vh-events">
            <MessageRecord
              event={row.before}
              label={t('w13q.upgrades.beforeEvent')}
              linkLabel={t('w13q.upgrades.openAnnouncement')}
              state={row.notices.before}
            />
            {row.after === null ? null : (
              <MessageRecord
                event={row.after}
                label={t('w13q.upgrades.afterEvent')}
                linkLabel={t('w13q.upgrades.openOutcome')}
                state={row.notices.after}
              />
            )}
          </ul>
        </details>
      ) : null}
    </article>
  )
}

const VERSION_HISTORY_CSS = `
  .vh-list { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gut); min-width: 0; }
  .vh-entry { min-width: 0; border: var(--border-w) solid var(--border); border-radius: var(--radius); background: var(--panel); padding: var(--pad-lg); }
  .vh-entry-heading { min-width: 0; display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--pad) var(--pad-lg); }
  .vh-entry h2 { min-width: 0; margin: 0; font-size: var(--fs-4); line-height: var(--lh-body); overflow-wrap: anywhere; }
  .vh-entry code { white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
  .vh-date { flex: 0 0 auto; color: var(--text-2); font-size: var(--fs-1); }
  .vh-outcome { min-width: 0; margin: var(--pad-lg) 0; overflow-wrap: anywhere; }
  .vh-emergency { min-width: 0; margin: var(--pad-lg) 0 0; overflow-wrap: anywhere; }
  .vh-emergency-line { min-width: 0; margin: 0 0 var(--pad); overflow-wrap: anywhere; }
  .vh-notice-block { min-width: 0; }
  .vh-notice-block h3 { margin: 0 0 var(--pad); color: var(--text-2); font-size: var(--fs-1); }
  .vh-notice { white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
  .vh-commit-range { min-width: 0; margin: var(--pad-lg) 0 0; overflow-wrap: anywhere; }
  .vh-notice-changed { margin: var(--pad-lg) 0 0; color: var(--text-2); overflow-wrap: anywhere; }
  .vh-announcement-link { display: inline-block; max-width: 100%; margin-top: var(--pad-lg); overflow-wrap: anywhere; }
  .vh-recorded-details { min-width: 0; margin-top: var(--pad-lg); border-top: var(--border-w) solid var(--border); padding-top: var(--pad-lg); }
  .vh-recorded-details > summary { width: fit-content; max-width: 100%; cursor: pointer; color: var(--text-2); overflow-wrap: anywhere; }
  .vh-recorded-fields { display: grid; gap: var(--pad-lg); min-width: 0; margin: var(--pad-lg) 0; }
  .vh-recorded-fields > div { min-width: 0; }
  .vh-recorded-fields dt { margin-bottom: var(--pad); color: var(--text-2); font-size: var(--fs-1); font-weight: 600; }
  .vh-recorded-fields dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
  .vh-events { display: grid; gap: var(--pad-lg); margin: var(--pad-lg) 0 0; padding: 0; list-style: none; }
  .vh-event { display: grid; gap: var(--pad); min-width: 0; overflow-wrap: anywhere; }
  .vh-event-kind { color: var(--text-2); font-size: var(--fs-1); font-weight: 600; }
  .vh-event-current { width: fit-content; max-width: 100%; overflow-wrap: anywhere; }
  .vh-empty, .vh-loading { padding: var(--pad-lg) 0; }
  .vh-older { margin-top: var(--pad-lg); min-height: var(--row-h); padding: 0 var(--pad-lg); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius); background: var(--panel); }
  .vh-older:disabled { cursor: wait; opacity: .7; }
  .vh-older-error { margin-top: var(--pad-lg); }
  @media (min-width: 64rem) {
    .vh-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
`

/** A renderable state boundary so loading, failure, empty and filled screens share the same contract. */
type VersionHistoryList = Pick<StableUpgradeHistoryPage, 'entries' | 'older'>
type OlderHistoryError = { message: string; fault: Fault | null }

/** Keep the ErrorNote metadata when an older-cursor GET fails. */
export function versionHistoryOlderReadError(error: unknown): OlderHistoryError {
  const candidate = error !== null && typeof error === 'object' && 'fault' in error
    ? error.fault
    : null
  const fault = candidate !== null
    && typeof candidate === 'object'
    && 'kind' in candidate
    && 'message' in candidate
    ? candidate as Fault
    : null
  return {
    message: error instanceof Error ? error.message : String(error),
    fault,
  }
}

export function VersionHistoryContent({
  state,
  onOlder,
  loadingOlder = false,
  olderError = null,
}: {
  state: AsyncState<VersionHistoryList>
  onOlder?: () => void
  loadingOlder?: boolean
  olderError?: OlderHistoryError | null
}) {
  return (
    <>
      <style>{VERSION_HISTORY_CSS}</style>
      {state.status === 'loading' ? (
        <p className="vh-loading" role="status">{t('w13q.upgrades.loading')}</p>
      ) : null}
      {state.status === 'error' ? (
        <ErrorNote message={state.message} label={t('w13q.upgrades.error')} fault={state.fault ?? null} />
      ) : null}
      {state.status === 'ready' ? (
        state.value.entries.length === 0 ? (
          <p className="vh-empty">{t('absence.none')}</p>
        ) : (
          <>
            <section className="vh-list" aria-label={t('nav.versionHistory')}>
              {state.value.entries.map((row) => <UpgradeEntry key={row.before.id} row={row} />)}
            </section>
            {state.value.older === null ? null : (
              <button className="vh-older" type="button" disabled={loadingOlder} onClick={onOlder}>
                {loadingOlder ? t('w13q.upgrades.loadingOlder') : t('w13q.upgrades.older')}
              </button>
            )}
          </>
        )
      ) : null}
      {olderError === null ? null : (
        <div className="vh-older-error">
        <ErrorNote message={olderError.message} label={t('w13q.upgrades.olderError')} fault={olderError.fault} />
        </div>
      )}
    </>
  )
}

function VersionHistoryReader() {
  const [initial] = useProjectAsync(() => api.upgradeHistory(), [])
  const [history, setHistory] = useState<VersionHistoryList | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [olderError, setOlderError] = useState<OlderHistoryError | null>(null)
  const loadingMore = useRef(false)

  useEffect(() => {
    if (initial.status === 'ready') setHistory((current) => current ?? initial.value)
  }, [initial])

  const current = history ?? (initial.status === 'ready' ? initial.value : null)
  const state: AsyncState<VersionHistoryList> = current === null
    ? initial
    : { status: 'ready', value: current }

  async function loadOlder() {
    const page = history ?? (initial.status === 'ready' ? initial.value : null)
    if (page === null || page.older === null || loadingMore.current) return
    loadingMore.current = true
    setLoadingOlder(true)
    setOlderError(null)
    try {
      const next = await api.upgradeHistory(page.older)
      setHistory((held) => {
        const previous = held ?? page
        const seen = new Set(previous.entries.map((row) => row.before.id))
        return {
          entries: [...previous.entries, ...next.entries.filter((row) => !seen.has(row.before.id))],
          older: next.older,
        }
      })
    } catch (error) {
      setOlderError(versionHistoryOlderReadError(error))
    } finally {
      loadingMore.current = false
      setLoadingOlder(false)
    }
  }

  return (
    <div className="page version-history-page">
      <h1>{t('nav.versionHistory')}</h1>
      <VersionHistoryContent
        state={state}
        onOlder={loadOlder}
        loadingOlder={loadingOlder}
        olderError={olderError}
      />
    </div>
  )
}

/**
 * DURABLE HISTORY IS RE-READ WHEN THE OFFICE SAYS A MESSAGE ARRIVED OR THE EVENT STREAM LOST TIME.
 *
 * The page-local boundary includes the workspace and refresh generation. A project switch or a
 * message/reconnect signal therefore gives the new read a fresh cursor and drops any old-page rows
 * in the same React commit. A reply to a reader that has unmounted cannot append to the new project.
 */
export function VersionHistoryPage() {
  const workspace = useSyncExternalStore(subscribeWorkspace, currentWorkspace, currentWorkspace)
  const [generation, setGeneration] = useState(0)
  const readAgain = useCallback(() => setGeneration((was) => was + 1), [])
  const hearMessage = useCallback((event: ChannelEvent) => {
    if (historyMessageEventIsForWorkspace(event, workspace)) readAgain()
  }, [readAgain, workspace])

  useChannel(hearMessage, ['message.new'])
  useEffect(() => {
    const stopOnLostEvents = whenEventsWereLost(readAgain)
    const stopOnStreamReturn = whenTheStreamCameBack(readAgain)
    return () => {
      stopOnLostEvents()
      stopOnStreamReturn()
    }
  }, [readAgain])

  return <VersionHistoryReader key={versionHistoryBoundaryKey(workspace, generation)} />
}
