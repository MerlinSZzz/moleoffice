// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DATA FOLDER PANEL ON SETTINGS. Criteria DF18, DF21, DF22 and DF28 of design/window/the-data-folder-move.criteria.md.
 *
 * Where the office keeps its data, who chose that folder, what the last move did, and the presses that move the folder
 * and later remove the old copy. The doors are src/server/api/data-folder.ts, and src/shared/data-folder.ts is the shape
 * of every answer. The words are the data folder block of src/shared/words/en-wave-13t.ts.
 *
 * WHILE THE OFFICE IS STOPPED the panel asks the office again every two seconds, one read at a time, and says in words
 * that it is waiting and how many reads have not been answered. It stops when a read answers a move that is no longer
 * running, and then draws that reading. A read that fails when no move is running is drawn as a refusal, with a retry.
 *
 * THE MOVED OFFICE IS THE PAGE'S NEW HOME. A move gives the office a new identity, because the identity is made from the
 * place of its database. So while it waits the panel tells src/web/lib/world.ts that this page's own move is under way,
 * and a reply from the office at its new home is read as the page's new home, with no banner (DF28). A reply from any
 * other office with another identity ends the wait, because this page reads only the office it was opened against, so
 * the panel offers to load the page again.
 *
 * EVERY WORD IS FROM THE WORD LISTS. A path, the database's file name and the server's own English sentence are the
 * exceptions: those are drawn as they came, and the server's sentence is marked as English. A press refusal is drawn
 * with the door's code, so the page gives it its own language.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { t, type WordKey } from '@shared/i18n.ts'
import type {
  DataFolderConfirmed,
  DataFolderMoveStarted,
  DataFolderReading,
  TheMarkInTheReading,
} from '@shared/data-folder.ts'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { ApiError, faultOf, moleOfficeRequest } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { useInspect } from '../lib/mode.ts'
import {
  subscribeToTheHomeMoved,
  theHomeMovedOnThisPage,
  thisPagesMoveIsOver,
  thisPagesMoveIsUnderWay,
} from '../lib/world.ts'
import { Btn, ErrorNote, Loading, Panel, useAsync } from './ui.tsx'

/** The states in which a move has not finished, so a reading that names one with a live mover keeps the panel waiting. */
export const THE_MOVING_STATES = ['stopping', 'copying', 'checking', 'switching', 'switched'] as const
export type TheMovingState = (typeof THE_MOVING_STATES)[number]

/** Each moving state's own step words, in the order the mover takes the steps. */
export const THE_STEP_WORDS: Readonly<Record<TheMovingState, WordKey>> = {
  stopping: 'dataFolder.step.stopping',
  copying: 'dataFolder.step.copying',
  checking: 'dataFolder.step.checking',
  switching: 'dataFolder.step.switching',
  switched: 'dataFolder.step.switched',
}

/** Whether a reading shows a move that is still running, which is what keeps the panel asking until the office answers. */
export function theReadingKeepsThePanelWaiting(reading: DataFolderReading): boolean {
  return reading.mark.state === 'read' && reading.mark.moverAlive && THE_MOVING_STATES.includes(reading.mark.mark.state as TheMovingState)
}

/** Read where the data is, who chose it, the last move's mark, and whether a move to a place would be refused. */
function readTheDataFolder(to?: string): Promise<DataFolderReading> {
  return moleOfficeRequest<DataFolderReading>(`/api/office/data-folder${to === undefined ? '' : `?to=${encodeURIComponent(to)}`}`)
}

/** Ask the office to move its data folder. The answer names the mover once the mark says it is at work. */
function startTheMove(to: string): Promise<DataFolderMoveStarted> {
  return moleOfficeRequest<DataFolderMoveStarted>('/api/office/data-folder/move', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ to }),
  })
}

/** Remove the old folder's copied files after a move. */
function confirmTheMove(): Promise<DataFolderConfirmed> {
  return moleOfficeRequest<DataFolderConfirmed>('/api/office/data-folder/confirm', { method: 'POST' })
}

/** The word for one of this panel's presses, read from the panel's declaration. */
function pressWord(key: string): WordKey {
  return settingsControlWord('settings.datafolder', key)
}

/** The words for who chose the data folder. */
function theChosenByWord(chosenBy: DataFolderReading['chosenBy']): WordKey | null {
  if (chosenBy === 'the default') return 'dataFolder.chosenBy.default'
  if (chosenBy === 'the .env line') return 'dataFolder.chosenBy.envLine'
  if (chosenBy === 'the process environment') return 'dataFolder.chosenBy.processEnvironment'
  return null
}

/** The mark as words: the last move's step, a switch whose mover ended, or why a move did not finish, and its two paths. */
function theMarkWords(mark: Extract<TheMarkInTheReading, { state: 'read' }>, folder: string): React.ReactNode {
  const state = mark.mark.state
  if (state === 'switched' && !mark.moverAlive) {
    return <p className="dfp-said">{t('dataFolder.mark.switchedAndEnded', { from: mark.mark.from, to: mark.mark.to, folder })}</p>
  }
  if (THE_MOVING_STATES.includes(state as TheMovingState)) {
    const step = t(THE_STEP_WORDS[state as TheMovingState])
    if (mark.moverAlive) {
      return (
        <>
          <p className="dfp-said">{t('dataFolder.mark.moving', { from: mark.mark.from, to: mark.mark.to })}</p>
          <p className="dfp-said">{step}</p>
        </>
      )
    }
    return <p className="dfp-said">{t('dataFolder.mark.didNotFinish', { from: mark.mark.from, to: mark.mark.to, step })}</p>
  }
  if (state === 'started') return <p className="dfp-said">{t('dataFolder.mark.started', { from: mark.mark.from, to: mark.mark.to })}</p>
  if (state === 'confirmed') return <p className="dfp-said">{t('dataFolder.mark.confirmed', { from: mark.mark.from, to: mark.mark.to })}</p>
  if (state === 'stopped-before-the-switch') {
    return <p className="dfp-said">{t('dataFolder.mark.stoppedBeforeTheSwitch', { from: mark.mark.from, to: mark.mark.to })}</p>
  }
  if (state === 'switched-back') return <p className="dfp-said">{t('dataFolder.mark.switchedBack', { from: mark.mark.from, to: mark.mark.to })}</p>
  return <p className="dfp-said">{t('dataFolder.mark.unknownState', { state: state as string })}</p>
}

/** The panel's one refusal note, drawn by its code in the page's language. */
function TheRefusal({ refused }: { refused: ApiError | Error | null }): React.ReactElement | null {
  if (refused === null) return null
  return <ErrorNote message={refused.message} fault={refused instanceof ApiError ? refused.fault : null} label={t('dataFolder.notChanged')} />
}

/** The panel Normal mode draws, and Developer mode draws more of. */
export function DataFolderPanel(): React.ReactElement {
  useLanguage()
  const developer = useInspect()
  const [state, readAgain] = useAsync(readTheDataFolder, [])
  const [later, setLater] = useState<DataFolderReading | null>(null)
  const [waiting, setWaiting] = useState(false)
  const [otherIdentity, setOtherIdentity] = useState(false)
  const [failedReads, setFailedReads] = useState(0)
  const [started, setStarted] = useState<DataFolderMoveStarted | null>(null)
  const [to, setTo] = useState('')
  const [checked, setChecked] = useState<{ to: string; why: string | null } | null>(null)
  const [warning, setWarning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<ApiError | Error | null>(null)
  const [confirmed, setConfirmed] = useState<DataFolderConfirmed | null>(null)
  const readForWaiting = useRef<DataFolderReading | null>(null)

  /**
   * THE HEADER ARRIVED WHILE THE PANEL WAS SAYING ANOTHER OFFICE ANSWERED. The page has now taken the moved office as its
   * home without a reload, so the panel asks again from the new home: the wait starts again and draws the office's own
   * reading when it answers, or keeps waiting if the move is still running. Without this the panel would go on saying
   * "another identity" after the page had stopped believing it.
   */
  const homeMoved = useSyncExternalStore(subscribeToTheHomeMoved, theHomeMovedOnThisPage, theHomeMovedOnThisPage)
  useEffect(() => {
    if (!homeMoved || !otherIdentity) return
    setOtherIdentity(false)
    thisPagesMoveIsUnderWay()
    setWaiting(true)
  }, [homeMoved, otherIdentity])

  // A READING THAT NAMES A MOVE STILL RUNNING STARTS THE WAIT, as a 202 does. The reading is remembered, so the end of
  // a wait that started here does not start it again.
  useEffect(() => {
    if (waiting || state.status !== 'ready') return
    if (readForWaiting.current === state.value) return
    readForWaiting.current = state.value
    if (theReadingKeepsThePanelWaiting(state.value)) {
      setLater(null)
      setStarted(null)
      setFailedReads(0)
      thisPagesMoveIsUnderWay()
      setWaiting(true)
    }
  }, [state, waiting])

  // ONE READ AT A TIME, TWO SECONDS APART, until a reading answers a move that is no longer running. A failed read keeps
  // the wait and adds to the count the panel says; it is not drawn as a refusal while the panel is waiting. A read
  // refused because the office answered under another identity ends the wait, because the page can read only the office
  // it was opened against and asking again cannot change that.
  useEffect(() => {
    if (!waiting) return
    let live = true
    let timer: number | null = null
    const ask = (): void => {
      timer = null
      readTheDataFolder().then(
        (reading) => {
          if (!live) return
          if (theReadingKeepsThePanelWaiting(reading)) {
            timer = window.setTimeout(ask, 2000)
          } else {
            thisPagesMoveIsOver()
            setLater(reading)
            setWaiting(false)
          }
        },
        (err: unknown) => {
          if (!live) return
          if (faultOf(err)?.kind === 'wrong-world') {
            setOtherIdentity(true)
            setLater(null)
            setWaiting(false)
            return
          }
          setFailedReads((count) => count + 1)
          timer = window.setTimeout(ask, 2000)
        },
      )
    }
    timer = window.setTimeout(ask, 2000)
    // THE MOVE IS NOT SAID TO BE OVER WHEN THE PANEL GOES. The move goes on when the person leaves Settings, and the
    // office that answers after it is still the page's new home; only a reading says the move is over.
    return () => {
      live = false
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [waiting])

  const reading = later ?? (state.status === 'ready' ? state.value : null)

  const pressCheck = (): void => {
    setRefused(null)
    setChecked(null)
    setBusy(true)
    readTheDataFolder(to).then(
      (answer) => {
        setBusy(false)
        setChecked(answer.wouldRefuse ?? { to, why: null })
      },
      (err: unknown) => {
        setBusy(false)
        setRefused(err instanceof Error ? err : new Error(String(err)))
      },
    )
  }

  const pressMove = (): void => {
    setRefused(null)
    setConfirmed(null)
    setChecked(null)
    setWarning(true)
  }

  const pressSure = (): void => {
    setBusy(true)
    startTheMove(to).then(
      (answer) => {
        setBusy(false)
        setWarning(false)
        setStarted(answer)
        setLater(null)
        setOtherIdentity(false)
        setFailedReads(0)
        thisPagesMoveIsUnderWay()
        setWaiting(true)
      },
      (err: unknown) => {
        setBusy(false)
        setWarning(false)
        setRefused(err instanceof Error ? err : new Error(String(err)))
      },
    )
  }

  const pressCancel = (): void => {
    setWarning(false)
  }

  const pressConfirm = (): void => {
    setRefused(null)
    setConfirmed(null)
    setBusy(true)
    confirmTheMove().then(
      (answer) => {
        setBusy(false)
        setConfirmed(answer)
        // THE MARK NOW SAYS CONFIRMED, so the panel reads it again and draws the reading rather than the old mark.
        setLater(null)
        readAgain()
      },
      (err: unknown) => {
        setBusy(false)
        setRefused(err instanceof Error ? err : new Error(String(err)))
      },
    )
  }

  /** The field and its presses, drawn only for the person when a move may start from here. */
  const theMoveField = (): React.ReactElement => (
    <>
      <div className="dfp-field">
        <label className="dfp-label" htmlFor="dfp-to">
          {t('dataFolder.to')}
        </label>
        <input
          className="dfp-input"
          id="dfp-to"
          type="text"
          value={to}
          aria-describedby="dfp-to-hint"
          onChange={(event) => {
            setTo(event.target.value)
            setChecked(null)
          }}
        />
        <p className="dfp-hint" id="dfp-to-hint">
          {t('dataFolder.toHint')}
        </p>
      </div>
      <div className="dfp-presses">
        {/* A PRESS IN FLIGHT IS WHY BOTH ARE OFF while it is, whatever the field holds; an empty field is why otherwise. */}
        <Btn onClick={pressCheck} disabled={busy || to.trim() === ''} reason={busy ? t('dataFolder.busy') : t('dataFolder.toHint')}>
          {t(pressWord('dataFolder.check'))}
        </Btn>
        <Btn onClick={pressMove} disabled={busy || to.trim() === ''} reason={busy ? t('dataFolder.busy') : t('dataFolder.toHint')}>
          {t(pressWord('dataFolder.move'))}
        </Btn>
      </div>
      {checked === null ? null : checked.why === null ? (
        <p className="dfp-said">{t('dataFolder.check.fine', { to: checked.to })}</p>
      ) : (
        <>
          <p className="dfp-said">{t('dataFolder.check.refused', { to: checked.to })}</p>
          {/* THE SERVER'S OWN SENTENCE IS THE ONLY REASON THE PERSON HAS, so it is drawn in both modes, as English. */}
          <p className="dfp-why" lang="en">
            {checked.why}
          </p>
        </>
      )}
      {warning ? (
        <>
          <p className="dfp-said">{t('dataFolder.move.warn')}</p>
          <div className="dfp-presses">
            <Btn variant="primary" onClick={pressSure} disabled={busy} reason={t('dataFolder.busy')}>
              {t(pressWord('dataFolder.move.sure'))}
            </Btn>
            <Btn onClick={pressCancel} disabled={busy} reason={t('dataFolder.busy')}>
              {t(pressWord('dataFolder.move.cancel'))}
            </Btn>
          </div>
        </>
      ) : null}
    </>
  )

  /** What may be pressed, in the order the checks decide it. */
  const thePresses = (): React.ReactNode => {
    if (reading === null) return null
    if (!reading.fromABundle) return <p className="dfp-what">{t('dataFolder.notABundle')}</p>
    // THE PROCESS ENVIRONMENT DECIDES THE FOLDER, so a .env line would not, and the words above say so.
    if (reading.chosenBy === 'the process environment') return null
    // THE PANEL TAKES NO REASON, so a caller who may press only under the grant reads that a secretary presses through
    // the door with its reason. The presses themselves are drawn only for the person.
    const theGrantPressesThese = !reading.theCallerIsThePerson && (reading.mayMove || reading.mayConfirm)
    const theNoPressWords = (): React.ReactElement => (
      <p className="dfp-what">{t(theGrantPressesThese ? 'dataFolder.throughTheDoor' : 'dataFolder.onlyThePerson')}</p>
    )
    const anEndedSwitch =
      reading.mark.state === 'read' && reading.mark.mark.state === 'switched' && !reading.mark.moverAlive
    if (reading.mark.state === 'read' && (reading.mark.mark.state === 'started' || anEndedSwitch)) {
      return (
        <>
          <p className="dfp-said">{t('dataFolder.confirm.what', { from: reading.mark.mark.from })}</p>
          {reading.theCallerIsThePerson && reading.mayConfirm ? (
            <div className="dfp-presses">
              <Btn variant="primary" onClick={pressConfirm} disabled={busy} reason={t('dataFolder.busy')}>
                {t(pressWord('dataFolder.confirm'))}
              </Btn>
            </div>
          ) : (
            theNoPressWords()
          )}
          <p className="dfp-what">{t('dataFolder.confirmFirst')}</p>
        </>
      )
    }
    // A SWITCHED MARK WHOSE MOVER LIVES, OR A MOVE STILL RUNNING, has nothing to press: the mover may yet switch back, or
    // the office is starting again.
    if (reading.mark.state === 'read' && (reading.mark.mark.state === 'switched' || theReadingKeepsThePanelWaiting(reading))) return null
    if (!(reading.theCallerIsThePerson && reading.mayMove)) return theNoPressWords()
    return theMoveField()
  }

  return (
    <Panel titleIs="label" declares={{ surface: 'settings.datafolder' }} title={t('settingsPanel.title.datafolder')}>
      <style href="mole-office-data-folder" precedence="default">
        {DATA_FOLDER_CSS}
      </style>
      <section className="dfp">
        {state.status === 'loading' ? <Loading what={t('dataFolder.loading')} rows={1} /> : null}
        {state.status === 'error' && !waiting ? (
          <ErrorNote message={state.message} fault={state.fault ?? null} label={t('dataFolder.unread')} retry={readAgain} />
        ) : null}
        {otherIdentity ? (
          <>
            <p className="dfp-said">{t('dataFolder.waiting.otherIdentity')}</p>
            <div className="dfp-presses">
              <Btn onClick={() => window.location.reload()}>{t('dataFolder.loadAgain')}</Btn>
            </div>
          </>
        ) : waiting ? (
          <>
            <p className="dfp-said">{t('dataFolder.waiting')}</p>
            {failedReads > 0 ? <p className="dfp-said">{t('dataFolder.waiting.asked', { n: failedReads })}</p> : null}
            {developer && started !== null ? (
              <p className="dfp-dev" lang="en">
                {started.says}
              </p>
            ) : null}
          </>
        ) : reading === null ? null : (
          <>
            {/* A CHECKOUT'S FOLDER IS A DEVELOPER'S, and Normal mode draws no path. So an office that does not run
                from a bundle says only that, and Developer mode still draws the reading around it. */}
            {reading.fromABundle || developer ? (
              <>
                <p className="dfp-said">{t('dataFolder.where', { folder: reading.folder })}</p>
                {developer ? (
                  <>
                    <p className="dfp-dev" lang="en">
                      {reading.database}
                    </p>
                    <p className="dfp-dev" lang="en">
                      {reading.chosenBySays}
                    </p>
                  </>
                ) : null}
                {theChosenByWord(reading.chosenBy) === null ? null : <p className="dfp-what">{t(theChosenByWord(reading.chosenBy) as WordKey)}</p>}
                {reading.mark.state === 'absent' ? <p className="dfp-said">{t('dataFolder.mark.absent')}</p> : null}
                {reading.mark.state === 'unreadable' ? (
                  <>
                    <p className="dfp-said">{t('dataFolder.mark.unreadable')}</p>
                    {developer ? (
                      <p className="dfp-dev" lang="en">
                        {reading.mark.why}
                      </p>
                    ) : null}
                  </>
                ) : null}
                {reading.mark.state === 'read' ? (
                  <>
                    {theMarkWords(reading.mark, reading.folder)}
                    {reading.mark.mark.earlier.length === 0 ? null : (
                      <>
                        <p className="dfp-said">{t('dataFolder.earlier')}</p>
                        <ul className="dfp-paths">
                          {reading.mark.mark.earlier.map((folder) => (
                            <li key={folder}>{folder}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {developer && reading.mark.mark.says !== null ? (
                      <p className="dfp-dev" lang="en">
                        {reading.mark.mark.says}
                      </p>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}
            {thePresses()}
            {confirmed === null ? null : (
              <>
                <p className="dfp-said">{t('dataFolder.confirmed.removed', { n: confirmed.removed.length })}</p>
                {confirmed.kept.length === 0 ? null : (
                  <>
                    <p className="dfp-said">{t('dataFolder.confirmed.kept')}</p>
                    <ul className="dfp-paths">
                      {confirmed.kept.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </>
        )}
        <TheRefusal refused={refused} />
      </section>
    </Panel>
  )
}

const DATA_FOLDER_CSS = `
.dfp { display: flex; flex-direction: column; align-items: stretch; gap: 0.5rem; min-width: 0; }
.dfp-said, .dfp-what, .dfp-dev, .dfp-why, .dfp-hint, .dfp-label {
  margin: 0;
  max-width: var(--measure-in-box);
  font: var(--fs-1)/var(--lh-read) var(--font-ui);
  overflow-wrap: anywhere;
}
.dfp-said { color: var(--text); }
.dfp-what, .dfp-hint, .dfp-label { color: var(--text-2); }
.dfp-dev, .dfp-why { color: var(--text-2); font-family: var(--font-mono); }
.dfp-paths { margin: 0; padding-left: 1.25rem; max-width: var(--measure-in-box); }
.dfp-paths li { font: var(--fs-1)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.dfp-field { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; max-width: var(--measure-in-box); }
.dfp-input {
  width: 100%; min-width: 0; box-sizing: border-box;
  padding: 0.35rem 0.5rem;
  border: var(--border-w, 1px) solid var(--border); border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text);
  font: var(--fs-1)/var(--lh-read) var(--font-mono);
}
.dfp-presses { display: flex; flex-wrap: wrap; gap: var(--pad); }
`
