// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EACH MODEL LOGIN'S USE, ON A SECRETARY'S PAGE IN DEVELOPER MODE. Wave 13p round 29, and round E for the sandboxes'
 * Claude login.
 *
 * THE SERVER DECIDES EVERYTHING AND THIS DRAWS IT (src/server/lib/logins-week.ts). The sandboxes' Claude login draws
 * the reading's own fields: each window with its use and reset, when it was read and from which round, what the login
 * said about its requests, and a newer reading round that gave no event. A window the reading does not give is said to
 * be not given, never drawn as 0%. A reading of nobody draws no figure. An unreadable reading names its round and time
 * and draws no figure. Each other login draws what it used over the last seven days by the runs' receipts, and what
 * could not be counted.
 */
import { t } from '@shared/i18n.ts'
import { aUseInPercent, minute, type AWindowRead, type LoginsWeek, type LoginWeekReading, type OwnEventReading } from '@shared/logins-week.ts'
import { momentOfStampInZone } from '@shared/time.ts'
import { CodeRows } from '../lib/code-rows.tsx'
import { Panel } from './ui.tsx'

/** A sum of US dollars with two decimals and its thousands grouped, as the server's sentence writes it. */
function dollars(usd: number): string {
  return usd.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** A stamp as a reader reads it: to the minute, with the reading's zone. */
function atAStamp(stamp: string, zone: string): string {
  return `${minute(stamp)}, ${zone} time`
}

/** Whether a window's reset is at or before the moment of the reading that carries it. */
function resetHasPassed(stamp: string, at: string, zone: string): boolean {
  const reset = momentOfStampInZone(stamp, zone)
  const read = momentOfStampInZone(at, zone)
  return reset !== null && read !== null && reset <= read
}

/** One window's line: its use and reset, a reset that has passed, or that the reading did not give it. */
function WindowLine({ label, window, at, zone }: { label: string; window: AWindowRead | null; at: string; zone: string }) {
  if (window === null) return <p className="prof-run-says" data-testid="logins-week-window">{t('loginsWeek.windowNotGiven', { window: label })}</p>
  const used = aUseInPercent(window.used)
  const reset = atAStamp(window.resetsAt, zone)
  return (
    <p className="prof-run-says" data-testid="logins-week-window">
      {resetHasPassed(window.resetsAt, at, zone)
        ? t('loginsWeek.windowReset', { window: label, used, reset })
        : t('loginsWeek.window', { window: label, used, reset })}
    </p>
  )
}

/** The newer reading round that gave no rate-limit event, when the reading names one. */
function TheNewerRound({ one }: { one: OwnEventReading }) {
  const newer = one.newerRoundWithNoEvent
  if (newer === null) return null
  return (
    <CodeRows
      rows={[
        { label: 'loginsWeek.row.newerRound', value: `${newer.sandbox}/${newer.folder}`, state: 'loginsWeek.row.noEvent' },
        { label: 'loginsWeek.row.lastWritten', value: `${minute(newer.at)} ${one.zone}` },
      ]}
    />
  )
}

/** What the login itself said about its requests, when it said anything but that they were allowed. */
function TheStatusLine({ one }: { one: OwnEventReading }) {
  if (one.status === 'allowed_warning') return <p className="prof-run-says" data-testid="logins-week-status">{t('loginsWeek.status.allowedWarning')}</p>
  if (one.status === 'rejected') return <p className="prof-run-says" data-testid="logins-week-status">{t('loginsWeek.status.rejected')}</p>
  return null
}

/** The sandboxes' Claude login, drawn from what its own rate-limit event said. */
function TheOwnEventReading({ one, at }: { one: OwnEventReading; at: string }) {
  if (one.state === 'none') {
    return (
      <>
        <p className="prof-run-says" data-testid="logins-week-state">{t('loginsWeek.none')}</p>
        <TheNewerRound one={one} />
      </>
    )
  }
  if (one.state === 'unreadable') {
    return (
      <>
        <CodeRows
          rows={[
            { label: 'loginsWeek.row.readAt', value: one.readAt === null ? '' : `${minute(one.readAt)} ${one.zone}` },
            {
              label: 'loginsWeek.row.round',
              value: one.round === null ? '' : `${one.round.sandbox}/${one.round.folder}`,
              state: 'loginsWeek.row.shapeNotKnown',
            },
          ]}
        />
        <TheNewerRound one={one} />
      </>
    )
  }
  return (
    <>
      {one.state === 'stale' && one.readAt !== null ? (
        <p className="prof-run-says" data-testid="logins-week-state">{t('loginsWeek.stale', { at: minute(one.readAt), zone: one.zone })}</p>
      ) : null}
      <WindowLine label={t('loginsWeek.sevenDays')} window={one.sevenDays} at={at} zone={one.zone} />
      <WindowLine label={t('loginsWeek.fiveHours')} window={one.fiveHours} at={at} zone={one.zone} />
      {one.readAt === null || one.round === null ? null : (
        <CodeRows
          rows={[
            { label: 'loginsWeek.row.readAt', value: `${minute(one.readAt)} ${one.zone}` },
            { label: 'loginsWeek.row.round', value: `${one.round.sandbox}/${one.round.folder}` },
          ]}
        />
      )}
      <TheStatusLine one={one} />
      <TheNewerRound one={one} />
    </>
  )
}

function OneLogin({ one, at }: { one: LoginWeekReading; at: string }) {
  return (
    <li className="prof-run" data-testid="logins-week-login" data-login={one.login}>
      <p className="prof-run-head">
        <span className="prof-run-title">{t(one.name)}</span>
      </p>
      {one.readFrom === 'own-event' ? (
        <TheOwnEventReading one={one} at={at} />
      ) : (
        <>
          <p className="prof-run-says">{one.usd === null ? t('loginsWeek.noFigure') : t('loginsWeek.used', { usd: dollars(one.usd) })}</p>
          <p className="prof-run-says">{t('loginsWeek.noMark')}</p>
          <p className="prof-run-says">{t('loginsWeek.lastSevenDays')}</p>
          <p className="prof-run-says">{t('loginsWeek.runs', { runs: one.receipts.runs, missing: one.receipts.runsWithNoReceipt })}</p>
        </>
      )}
    </li>
  )
}

export function TheLoginsWeek({ reading }: { reading: LoginsWeek }) {
  return (
    <Panel declares={{ surface: 'profile.week' }} titleIs="label" title={t('loginsWeek.title')}>
      <ul className="prof-runs" data-testid="logins-week">
        {reading.logins.map((one) => (
          <OneLogin key={one.login} one={one} at={reading.at} />
        ))}
      </ul>
      <p className="prof-says">{t('loginsWeek.noTool', { count: reading.runsThatDeclaredNoTool })}</p>
    </Panel>
  )
}
