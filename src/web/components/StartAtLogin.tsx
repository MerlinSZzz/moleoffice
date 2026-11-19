// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * START AT LOGIN, ON TERMINAL MANAGEMENT AND ON SETTINGS. Wave 13u, round 3, piece H9.
 *
 * Whether a systemd user unit starts the office when the person logs in, one press to turn it on or off, and the
 * sentence that says a start at login is not a start at boot. The doors are src/server/api/start-at-login.ts, and
 * src/config/start-at-login.mjs says what the unit is.
 *
 * LINGERING IS SHOWN, NOT PRESSED. Whether their user lingers decides whether the office starts at boot and outlives their
 * logout. It is a setting of their login on the whole computer, and turning it on can ask for an administrator, so the
 * panel says in plain words whether the office outlives their logout.
 *
 * IN PLAIN WORDS (wave 13u, round 7): what it does, and what pressing changes, with no systemd, unit or lingering. Every
 * command and the name of every setting are drawn in Developer mode only, because nothing a person must do is a command.
 * Where the last start failed or the office stops at logout, the plain view says the next step: that Developer mode
 * shows how (round 7b). What happens at logout is said as a fact only while it is on (round 7b).
 *
 * ON A MAC (round 10): only where to set it, the "Open at login" item of the menu-bar menu. Never on or off.
 *
 * ON WINDOWS (wave 13t, round W12): where to set it, the same item of the menu of the icon in the notification area,
 * and that signing out of Windows stops the office. Never on or off.
 *
 * ON SETTINGS TOO (wave 13t, round W18c): Terminal management is a developer page, and Normal mode does not show it, so
 * on Linux a person in Normal mode had no way to the press. StartAtLoginPanel draws the same card in a Settings panel
 * that Normal mode draws. The panel's fold draws the title, so the card there draws no heading and no frame of its own.
 *
 * EVERY WORD IS FROM THE WORD LISTS. The state and what the press did are drawn from the reply's fields. The server's
 * own English sentence is drawn as well in Developer mode, marked as English. An agent the person's grant does not carry
 * here is refused by the door, and the panel draws that refusal by its code.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useState } from 'react'

import { t, type WordKey } from '@shared/i18n.ts'
import type { StartAtLoginDone, StartAtLoginReading } from '@shared/start-at-login.ts'
import { ApiError, moleOfficeRequest } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { useInspect } from '../lib/mode.ts'
import { Btn, ErrorNote, Loading, Panel, useAsync } from './ui.tsx'

/** Read whether the office starts at login. */
function readStartAtLogin(): Promise<StartAtLoginReading> {
  return moleOfficeRequest<StartAtLoginReading>('/api/office/start-at-login')
}

/** Their press: on or off. */
function pressStartAtLogin(on: boolean): Promise<StartAtLoginDone> {
  return moleOfficeRequest<StartAtLoginDone>('/api/office/start-at-login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ on }),
  })
}

/** The one sentence for where things stand. */
function theStateWords(reading: StartAtLoginReading): string {
  if (reading.systemd === 'not linux') return t('startAtLogin.state.notLinux')
  if (reading.unit === 'not ours') return t('startAtLogin.state.notOurs')
  if (reading.systemd === 'no answer') return t('startAtLogin.state.noSystemd')
  if (reading.startsAtLogin === true) return t(reading.unit === 'out of date' ? 'startAtLogin.state.onOutOfDate' : 'startAtLogin.state.on')
  if (reading.startsAtLogin === false) return t('startAtLogin.state.off')
  return t('startAtLogin.state.unknown')
}

/** What happens at logout. Said as a fact only while it is on; while it is off or not known, said as what "on" would do. */
function theAfterLogoutWords(reading: StartAtLoginReading): WordKey {
  if (reading.linger === null) return 'startAtLogin.afterLogout.unknown'
  const on = reading.startsAtLogin === true
  if (reading.linger === 'yes') return on ? 'startAtLogin.afterLogout.keeps' : 'startAtLogin.afterLogout.keepsIfOn'
  return on ? 'startAtLogin.afterLogout.stops' : 'startAtLogin.afterLogout.stopsIfOn'
}

/** Where the window's own login item sets it, on a Mac and on Windows, in the words drawn; null where the press here sets it. */
function whereTheWindowSetsIt(reading: StartAtLoginReading): WordKey[] | null {
  if (reading.setInTheMenuBar) return ['startAtLogin.mac.where']
  if (reading.setInTheTray) return ['startAtLogin.windows.where', 'startAtLogin.windows.signOut']
  return null
}

/** What their press did, in their language. */
function whatThePressDid(done: StartAtLoginDone): WordKey {
  if (done.turned === 'on') return 'startAtLogin.done.on'
  if (done.turned === 'already on') return done.wrote.length > 0 ? 'startAtLogin.done.rewritten' : 'startAtLogin.done.alreadyOn'
  if (done.turned === 'off') return 'startAtLogin.done.off'
  return 'startAtLogin.done.alreadyOff'
}

/** The card on Settings, in the panel Normal mode draws. */
export function StartAtLoginPanel(): React.ReactElement {
  return (
    <Panel titleIs="label" declares={{ surface: 'settings.startatlogin' }} title={t('startAtLogin.heading')}>
      <StartAtLogin inAPanel />
    </Panel>
  )
}

/** The card. On Terminal management it draws its own heading and frame; in a Settings panel the panel draws them. */
export function StartAtLogin({ inAPanel = false }: { inAPanel?: boolean }): React.ReactElement {
  useLanguage()
  const developer = useInspect()
  const [state, readAgain] = useAsync(readStartAtLogin, [])
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<ApiError | Error | null>(null)
  const [done, setDone] = useState<StartAtLoginDone | null>(null)

  const press = (on: boolean): void => {
    setRefused(null)
    setDone(null)
    setBusy(true)
    void pressStartAtLogin(on)
      .then((answer) => {
        setBusy(false)
        setDone(answer)
        readAgain()
      })
      .catch((err: unknown) => {
        setBusy(false)
        setRefused(err instanceof Error ? err : new Error(String(err)))
        readAgain()
      })
  }

  const reading = state.status === 'ready' ? state.value : null
  const where = reading === null ? null : whereTheWindowSetsIt(reading)
  const mayPress = reading !== null && reading.systemd === 'answers' && reading.unit !== 'not ours'
  const busyWhy = busy ? t('startAtLogin.busy') : undefined
  return (
    <section className={inAPanel ? 'sal sal-in-a-panel' : 'sal'} aria-labelledby={inAPanel ? undefined : 'sal-heading'}>
      <style href="mole-office-start-at-login" precedence="default">
        {START_AT_LOGIN_CSS}
      </style>
      {inAPanel ? null : <h2 className="sal-heading" id="sal-heading">{t('startAtLogin.heading')}</h2>}
      {where === null ? <p className="sal-what">{t('startAtLogin.loginNotBoot')}</p> : null}
      {state.status === 'loading' ? <Loading what={t('startAtLogin.loading')} rows={1} /> : null}
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault ?? null} label={t('startAtLogin.unread')} retry={readAgain} /> : null}
      {/* ON A MAC AND ON WINDOWS, WHERE AND NOTHING ELSE (round 10, wave 13u's condition in message Ux__34vHQle1;
          on Windows, round W12, with the sign-out sentence): the window's own login item sets it and the server does
          not read it, so the card never says on or off and has no press. */}
      {where !== null && reading !== null ? (
        <>
          {where.map((key) => (
            <p key={key} className="sal-said">
              {t(key)}
            </p>
          ))}
          {developer ? (
            <p className="sal-said" lang="en">
              {reading.says}
            </p>
          ) : null}
        </>
      ) : reading === null ? null : (
        <>
          <p className="sal-said">{theStateWords(reading)}</p>
          {reading.activeWord === 'failed' ? <p className="sal-said">{t('startAtLogin.failed')}</p> : null}
          {reading.activeWord === 'failed' && !developer ? <p className="sal-what">{t('startAtLogin.next.failed')}</p> : null}
          {reading.systemd !== 'answers' ? null : <p className="sal-said">{t(theAfterLogoutWords(reading))}</p>}
          {reading.systemd === 'answers' && reading.linger === 'no' && !developer ? <p className="sal-what">{t('startAtLogin.next.stops')}</p> : null}
          {/* THE OFFICE'S OWN SENTENCE, THE SETTINGS BY NAME AND THE COMMANDS, for developers, behind their fold as on the
              rest of Terminal management. */}
          {developer ? (
            <details className="sal-dev">
              <summary>{t('terminals.developers')}</summary>
              <p className="sal-said" lang="en">
                {reading.says}
              </p>
              {reading.activeWord === 'failed' ? (
                <p className="sal-said">
                  {t('startAtLogin.dev.failedWhy')} <code className="sal-code">journalctl --user -u mole-office</code>
                </p>
              ) : null}
              {reading.systemd !== 'answers' ? null : reading.linger === 'yes' ? (
                <p className="sal-said">{t('startAtLogin.linger.yes', { user: reading.user })}</p>
              ) : reading.linger === 'no' ? (
                <p className="sal-said">
                  {t('startAtLogin.linger.no', { user: reading.user })} <code className="sal-code">{reading.lingerCommand}</code>
                </p>
              ) : (
                <p className="sal-said">{t('startAtLogin.linger.unknown', { user: reading.user })}</p>
              )}
            </details>
          ) : null}
          {mayPress ? (
            <p className="sal-what">{t(reading.startsAtLogin === true ? 'startAtLogin.press.whenOn' : 'startAtLogin.press.whenOff')}</p>
          ) : null}
          {mayPress ? (
            <div className="sal-presses">
              {reading.startsAtLogin !== true || reading.unit === 'out of date' ? (
                <Btn onClick={() => press(true)} disabled={busy} reason={busyWhy}>
                  {t(settingsControlWord('settings.startatlogin', reading.startsAtLogin === true ? 'startAtLogin.rewrite' : 'startAtLogin.turnOn'))}
                </Btn>
              ) : null}
              {reading.unit !== 'none' && reading.startsAtLogin !== false ? (
                <Btn onClick={() => press(false)} disabled={busy} reason={busyWhy}>
                  {t(settingsControlWord('settings.startatlogin', 'startAtLogin.turnOff'))}
                </Btn>
              ) : null}
            </div>
          ) : null}
        </>
      )}
      {refused === null ? null : (
        <ErrorNote message={refused.message} fault={refused instanceof ApiError ? refused.fault : null} label={t('startAtLogin.notChanged')} />
      )}
      {refused instanceof ApiError && refused.fault?.code !== undefined && developer ? (
        <p className="sal-said" lang="en">
          {refused.message}
        </p>
      ) : null}
      {done === null ? null : <p className="sal-said">{t(whatThePressDid(done))}</p>}
      {done !== null && developer ? (
        <p className="sal-said" lang="en">
          {done.says}
        </p>
      ) : null}
    </section>
  )
}

const START_AT_LOGIN_CSS = `
.sal {
  display: flex; flex-direction: column; align-items: flex-start; gap: 0.5rem; min-width: 0;
  margin: var(--pad) 0 0 0; padding: var(--pad);
  border: var(--border-w, 1px) solid var(--border); border-radius: var(--radius-sm); background: var(--panel);
}
.sal-in-a-panel { margin: 0; padding: 0; border: 0; background: none; }
.sal-heading { margin: 0; font-size: var(--fs-2); }
.sal-what, .sal-said {
  margin: 0;
  max-width: var(--measure-in-box);
  font: var(--fs-1)/var(--lh-read) var(--font-ui);
  overflow-wrap: anywhere;
}
.sal-what { color: var(--text-2); }
.sal-said { color: var(--text); }
.sal-dev { color: var(--text-2); }
.sal-dev > summary { cursor: pointer; font-size: 0.9em; }
.sal-code { font-family: var(--font-mono); overflow-wrap: anywhere; }
.sal-presses { display: flex; flex-wrap: wrap; gap: var(--pad); }
`
