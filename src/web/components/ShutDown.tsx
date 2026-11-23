// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SHUTDOWN, IN THE WINDOW AND IN THE BROWSER: criteria W5 and W6 of design/window/ACCEPTANCE.md, piece H8 of plan
 * hp7Z-IW9JWSX (wave 13n, round 58).
 *
 * THE PRESS is an icon in the sidebar's foot, beside Settings, on every page. In the standalone window a setting
 * decides what it does (W5): shut Mole Office down, or close only the window and keep the service running. The
 * setting is not a second button, and a browser never draws it, because a browser tab has no service of its own.
 *
 * THE ONE QUESTION is ShutDownQuestion below, and the tray's Shut down asks the same one: the window sends
 * THE_TRAY_ASKS_TO_SHUT_DOWN into this page and the page opens it (src/desktop/main.mjs). It reads the runs at work
 * from the server first. With none, Mole Office shuts down at once. With some, it lists them (which agent, which
 * message, since when), warns, and asks once more; the confirmation sends the runs it showed, and the server
 * refuses with its code when a run is at work that the list did not show, so nothing is paused unseen. The server
 * pauses the runs with their data kept through the door of piece H6 (src/server/api/shutdown.ts), then stops.
 *
 * WHO MAY PRESS is the server's to say, by its one person-only check: the owner, proved by the person's own key,
 * which the window's page holds in its cookie once it is paired. The card keeps it for the owner
 * (src/server/api/shutdown.ts names the decision); a secretary holding the owner's grant may press it only where this
 * office's list of what the grant carries says so. The reading's `mayPress` is that check, asked of this page, so the question says who may before
 * anything is pressed, and the door refuses with the code shutDownOnlyTheOwner whatever a page draws.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'

import { t } from '@shared/i18n.ts'
import type { ALiveRun, TheLiveRunsReading, TheShutDownAnswer } from '@shared/shutting-down.ts'
import { THE_PAGE_SAYS, THE_TRAY_ASKS_TO_SHUT_DOWN, isTheWindow, theSystemOn } from '../../config/the-window-mark.mjs'
import { api, errorMessage, faultOf } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { useLoadingLight } from '../lib/waiting-light.ts'
import { makeBroadcast, readChoice, writeChoice, type StoreFault } from '../lib/store.ts'
import { Btn, ErrorNote, Loading, Panel } from './ui.tsx'

/** Whether this page is drawn inside the standalone window. */
const inTheWindow = (): boolean => typeof navigator !== 'undefined' && isTheWindow(navigator.userAgent)

/** The Settings sentence that names the menu, in the words each system gives it. */
export type TheMenuSentenceKey = 'shutDown.windowOnly.tray' | 'shutDown.windowOnly.trayMenuBar' | 'shutDown.windowOnly.trayNotificationArea'

export function theTraySentenceKey(userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): TheMenuSentenceKey {
  const system = theSystemOn(userAgent)
  if (system === 'darwin') return 'shutDown.windowOnly.trayMenuBar'
  if (system === 'win32' || system === 'linux') return 'shutDown.windowOnly.trayNotificationArea'
  return 'shutDown.windowOnly.tray'
}

// ---------------------------------------------------------------------------- the window's setting (W5)

/** What the window's Shutdown press does: shut Mole Office down, or close only the window. */
const WINDOW_PRESS_DOES = ['whole', 'window'] as const
export type WindowPressDoes = (typeof WINDOW_PRESS_DOES)[number]

/** Where the window keeps the choice, in its own page store. */
export const WINDOW_PRESS_KEY = 'mole-office.window.shutdown'

const windowPressChanged = makeBroadcast()

/** The window's choice, read each time it is drawn, and anything that went wrong reading it. */
function readWindowPress(): { does: WindowPressDoes; fault: string | null } {
  const faults: StoreFault[] = []
  const does = readChoice(WINDOW_PRESS_KEY, WINDOW_PRESS_DOES, 'whole', faults)
  return { does, fault: faults[0]?.message ?? null }
}

let windowPress = readWindowPress()

function useWindowPress(): { does: WindowPressDoes; fault: string | null } {
  return useSyncExternalStore(windowPressChanged.subscribe, () => windowPress, () => windowPress)
}

function chooseWindowPress(does: WindowPressDoes): void {
  const faults: StoreFault[] = []
  writeChoice(WINDOW_PRESS_KEY, does, faults)
  windowPress = { does, fault: faults[0]?.message ?? null }
  windowPressChanged.announce()
}

/** The Settings panel for the window's choice. SettingsPage draws it only in the window. */
export function WindowShutdownPanel(): React.ReactElement {
  useLanguage()
  const chosen = useWindowPress()
  return (
    <Panel titleIs="label" declares={{ surface: 'settings.windowshutdown' }} title={t('settingsPanel.title.windowshutdown')}>
      <style href="mole-office-shut-down" precedence="default">{SHUT_DOWN_CSS}</style>
      <fieldset className="sd-choice">
        <legend className="sd-ask">{t('shutDown.windowOnly.heading')}</legend>
        {WINDOW_PRESS_DOES.map((does) => (
          <label className="sd-one" key={does} data-chosen={chosen.does === does ? 'yes' : 'no'}>
            <input type="radio" name="mole-office-window-shutdown" value={does} checked={chosen.does === does}
              onChange={() => chooseWindowPress(does)} />
            <span>{t(settingsControlWord('settings.windowshutdown', does === 'whole' ? 'shutDown.windowOnly.whole' : 'shutDown.windowOnly.window'))}</span>
          </label>
        ))}
      </fieldset>
      <p className="sd-said">{t(theTraySentenceKey())}</p>
      {chosen.fault === null ? null : <p className="sd-said" role="status">{chosen.fault}</p>}
    </Panel>
  )
}

// ---------------------------------------------------------------------------- the press (W5)

/**
 * THE FOOT'S PRESS. `icon` is the sidebar's own icon, passed in so this file does not import the sidebar. It also
 * opens the question when the window's tray asks, because the foot is drawn once on every office page.
 */
export function ShutDownPress({ icon, className }: { icon: React.ReactNode; className: string }): React.ReactElement {
  useLanguage()
  const [asking, setAsking] = useState(false)
  const chosen = useWindowPress()
  const onlyTheWindow = inTheWindow() && chosen.does === 'window'

  useEffect(() => {
    // The tray always asks to shut Mole Office down, whatever the setting says. preventDefault tells the window
    // that a page took the ask, so it does not fall back to the stop command.
    const fromTheTray = (event: Event): void => {
      event.preventDefault()
      setAsking(true)
    }
    window.addEventListener(THE_TRAY_ASKS_TO_SHUT_DOWN, fromTheTray)
    return () => window.removeEventListener(THE_TRAY_ASKS_TO_SHUT_DOWN, fromTheTray)
  }, [])

  const word = t(onlyTheWindow ? 'shutDown.closeTheWindow' : 'shutDown.press')
  return (
    <>
      <button type="button" className={className} data-shut-down={onlyTheWindow ? 'window' : 'whole'} aria-label={word}
        title={t(onlyTheWindow ? 'shutDown.closeTheWindowTitle' : 'shutDown.pressTitle')}
        onClick={() => {
          // The window closes and the service keeps running, as any quit of the window does.
          if (onlyTheWindow) console.info(THE_PAGE_SAYS.closeOnlyTheWindow)
          else setAsking(true)
        }}>
        {icon}
      </button>
      {asking ? <ShutDownQuestion onClose={() => setAsking(false)} /> : null}
    </>
  )
}

// ---------------------------------------------------------------------------- the one question (W6, H8)

type Asked =
  | { at: 'reading' }
  | { at: 'unread'; message: string; fault: ReturnType<typeof faultOf> }
  | { at: 'not the owner'; reading: TheLiveRunsReading }
  | { at: 'asking'; reading: TheLiveRunsReading; refused: { message: string; fault: ReturnType<typeof faultOf> } | null }
  | { at: 'pressing'; reading: TheLiveRunsReading }
  | { at: 'done'; answer: TheShutDownAnswer }

/**
 * One run, in the words the question lists it in: which agent, which message, since when. A run whose state the server
 * could not tell carries the state word "not known" beside it, in the weight of the line's other parts, because it may
 * still be running and the pause treats it like the others.
 */
function RunLine({ run }: { run: ALiveRun }): React.ReactElement {
  return (
    <li className="sd-run" data-session={run.session}>
      <span className="sd-run-agent">{run.agent === null ? t('shutDown.agentNotNamed') : run.agent.handle}</span>
      <span className="sd-run-message">{run.message === null ? t('shutDown.noMessage') : run.message.title}</span>
      <span className="sd-run-since">{t('shutDown.since', { since: run.since })}</span>
      {run.state === 'not known' ? <span className="sd-run-state">{t('shutDown.stateNotKnown')}</span> : null}
    </li>
  )
}

/**
 * THE QUESTION, used by the foot's press and the tray alike. It reads first; with no runs at work it presses at
 * once, so a shutdown with nothing at work closes at once; with some, it asks once more.
 */
export function ShutDownQuestion({ onClose }: { onClose: () => void }): React.ReactElement {
  useLanguage()
  const [asked, setAsked] = useState<Asked>({ at: 'reading' })
  const dialog = useRef<HTMLDialogElement>(null)
  useLoadingLight(dialog, asked.at === 'reading' ? 'loading' : asked.at === 'unread' ? 'error' : 'ready', 6)
  const questionId = useId()
  const window_ = inTheWindow()

  const press = (reading: TheLiveRunsReading): void => {
    setAsked({ at: 'pressing', reading })
    api.shutDown(reading.pausable.map((run) => run.session)).then(
      (answer) => {
        setAsked({ at: 'done', answer })
        // The window asks the office itself, and closes once it no longer answers (src/desktop/main.mjs).
        if (window_) console.info(THE_PAGE_SAYS.shuttingDown)
      },
      (err: unknown) => {
        const refused = { message: errorMessage(err), fault: faultOf(err) }
        // A run started after the list was read: read the list again, and ask about the new one.
        if (refused.fault?.code === 'shutDownRunsChanged') read(refused)
        else setAsked({ at: 'asking', reading, refused })
      },
    )
  }

  const read = (refused: { message: string; fault: ReturnType<typeof faultOf> } | null = null): void => {
    setAsked({ at: 'reading' })
    api.liveRuns().then(
      (reading) => {
        if (!reading.mayPress) setAsked({ at: 'not the owner', reading })
        else if (reading.pausable.length === 0 && refused === null) press(reading)
        else setAsked({ at: 'asking', reading, refused })
      },
      (err: unknown) => setAsked({ at: 'unread', message: errorMessage(err), fault: faultOf(err) }),
    )
  }

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    read()
    return () => element?.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once, when the question opens
  }, [])

  const busy = asked.at === 'reading' || asked.at === 'pressing' || asked.at === 'done'
  return (
    <dialog ref={dialog} className="sd-question" aria-labelledby={questionId} data-at={asked.at}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}>
      <style href="mole-office-shut-down" precedence="default">{SHUT_DOWN_CSS}</style>
      <h2 id={questionId}>{t('shutDown.question')}</h2>
      {asked.at === 'reading' ? <Loading what={t('shutDown.reading')} rows={2} light={false} /> : null}
      {asked.at === 'unread' ? (
        <>
          <ErrorNote message={asked.message} fault={asked.fault} label={t('shutDown.couldNotRead')} retry={() => read()} />
          <div className="sd-acts"><Btn onClick={onClose}>{t('shutDown.close')}</Btn></div>
        </>
      ) : null}
      {asked.at === 'not the owner' ? (
        <>
          <p className="sd-said">{t('shutDown.notTheOwner')}</p>
          <p className="sd-said" role="status">{t('server.shutDownOnlyTheOwner')}</p>
          <div className="sd-acts"><Btn onClick={onClose}>{t('shutDown.close')}</Btn></div>
        </>
      ) : null}
      {asked.at === 'asking' || asked.at === 'pressing' ? (
        <>
          <p className="sd-said">{t('shutDown.atWork', { count: asked.reading.pausable.length })}</p>
          {asked.reading.pausable.length === 0 ? null : (
            <ul className="sd-runs">{asked.reading.pausable.map((run) => <RunLine key={run.session} run={run} />)}</ul>
          )}
          {asked.reading.pausable.length === 0 ? null : <p className="sd-warn">{t('shutDown.warning')}</p>}
          {asked.reading.notPausable.length === 0 ? null : (
            <p className="sd-said">{t('shutDown.terminals', { count: asked.reading.notPausable.length })}</p>
          )}
          {asked.at === 'asking' && asked.refused !== null ? <ErrorNote message={asked.refused.message} fault={asked.refused.fault} /> : null}
          <div className="sd-acts">
            <Btn onClick={onClose} disabled={asked.at === 'pressing'} reason={t('shutDown.busy')}>{t('shutDown.cancel')}</Btn>
            <Btn variant="danger" onClick={() => press(asked.reading)} disabled={asked.at === 'pressing'} reason={t('shutDown.busy')}
              pending={asked.at === 'pressing'}>
              {t(asked.reading.pausable.length === 0 ? 'shutDown.press' : 'shutDown.confirm')}
            </Btn>
          </div>
        </>
      ) : null}
      {asked.at === 'done' ? (
        <>
          <p className="sd-said" role="status">{t(window_ ? 'shutDown.shuttingDownWindow' : 'shutDown.shuttingDown')}</p>
          {asked.answer.paused.length === 0 ? null : <p className="sd-said">{t('shutDown.paused', { count: asked.answer.paused.length })}</p>}
          {asked.answer.notPaused.length === 0 ? null : (
            <p className="sd-warn">{t('shutDown.notPaused', { count: asked.answer.notPaused.length })}</p>
          )}
        </>
      ) : null}
    </dialog>
  )
}

/** NO BACKTICK ANYWHERE IN HERE: this is a template literal inside a .tsx file. */
const SHUT_DOWN_CSS = `
.sd-question { width: min(34rem, calc(100% - 2 * var(--gut))); max-height: calc(100dvh - 2 * var(--gut));
  overflow-y: auto; padding: var(--pad-lg); background: var(--panel); color: var(--text);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius); box-shadow: var(--elev-2); }
.sd-question::backdrop { background: color-mix(in srgb, var(--bg), transparent 25%); }
.sd-question h2 { margin: 0 0 var(--pad); font-size: var(--fs-4); }
.sd-said, .sd-warn { margin: var(--pad) 0 0; font: var(--fs-1)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.sd-warn { padding: var(--pad) var(--pad-lg); border-left: var(--rail) solid var(--st-failed-line); background: var(--st-failed-bg); }
.sd-runs { display: flex; flex-direction: column; gap: var(--pad); margin: var(--pad) 0 0; padding: 0; list-style: none; }
.sd-run { display: grid; grid-template-columns: minmax(6rem, auto) 1fr; gap: 2px var(--pad); min-width: 0;
  padding: var(--pad); border: var(--border-w) solid var(--border); border-radius: var(--radius-sm); }
.sd-run-agent { font-weight: 600; overflow-wrap: anywhere; }
.sd-run-message { overflow-wrap: anywhere; }
.sd-run-since, .sd-run-state { grid-column: 2; color: var(--text-2); font-size: var(--fs-1); }
@media (max-width: 40rem) {
  .sd-run { grid-template-columns: 1fr; }
  .sd-run-since, .sd-run-state { grid-column: 1; }
}
.sd-acts { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--pad); margin-top: var(--gut); }
.sd-choice { margin: 0; padding: 0; border: 0; display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); min-width: 0; }
.sd-ask { padding: 0; margin-bottom: var(--pad); color: var(--text-2); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
.sd-one { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); background: var(--panel); color: var(--text);
  font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); cursor: pointer; }
.sd-one[data-chosen="yes"] { border-color: var(--chosen-edge); color: var(--chosen-ink); background: var(--chosen-bg); }
`
