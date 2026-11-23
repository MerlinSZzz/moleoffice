// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PRESSES THAT PUT A PERMANENT RESIDENT TO SLEEP, WAKE IT, AND POSTPONE ITS SLEEP. They stand beside "last slept",
 * on the resident's profile only, for those who may press them, by a decision of wave 13k,
 * round 47. The chat draws none of them.
 *
 * WHO MAY PRESS WHICH, as the doors in src/server/api/residents.ts allow and no further, so no press is drawn that the
 * door would always refuse:
 *
 *   · Sleep and Wake: the person, or the resident itself with its own key. The same two set a resident's sleep time,
 *     which ResidentSleep.tsx draws beside these presses.
 *   · Postpone a sleep: the resident itself only, with a reason it writes, while it is awake, or while the sleep the
 *     office began at its sleep time goes on, a time each resident sets for itself. A sleep begun
 *     by a press is ended by waking.
 *
 * ITS OWN FILE, drawn by the profile's Sleep place (ResidentSleep.tsx) and by nothing else.
 */
import { t } from '@shared/i18n.ts'
import { useState } from 'react'
import { api, errorMessage, faultOf, type Fault } from '../api.ts'
import type { TheSleepReading } from '../lib/residents.ts'
import { Btn, ErrorNote, TextArea } from './ui.tsx'

/** Which presses this reader may have, read from who is looking. */
export interface WhoMayPress {
  /** The person, or the resident itself: Sleep and Wake, and a resident's sleep time. */
  sleepAndWake: boolean
  /** The resident itself: Postpone a sleep. */
  postpone: boolean
}

/** The presses for one reader, from who is looking and whose sleep it is. */
export function whoMayPress(looking: { type: string; id: string }, thePerson: boolean, agentId: string): WhoMayPress {
  const itself = looking.type === 'agent' && looking.id === agentId
  return { sleepAndWake: thePerson || itself, postpone: itself }
}

/** The longest reason the postpone door takes. */
const BECAUSE_MAX = 500

/**
 * THE PRESSES. `asleep` is whether it sleeps now, as the page last read it, and `byTheOffice` whether that sleep is one
 * the office began at the sleep time. `onDone` is handed the sleep the door answered with, so the page draws the new
 * state before its next read.
 */
export function SleepPresses({
  agentId,
  asleep,
  byTheOffice = false,
  may,
  onDone,
}: {
  agentId: string
  asleep: boolean
  /** Left out, false: the chat never offers Postpone, so it does not say who began the sleep. */
  byTheOffice?: boolean
  may: WhoMayPress
  onDone: (sleep: TheSleepReading) => void
}) {
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<{ message: string; fault: Fault | null } | null>(null)
  const [postponing, setPostponing] = useState(false)
  const [because, setBecause] = useState('')
  if (!may.sleepAndWake && !may.postpone) return null

  const press = (ask: () => Promise<{ sleep: TheSleepReading }>): void => {
    setFault(null)
    setBusy(true)
    ask()
      .then((done) => {
        setBusy(false)
        setPostponing(false)
        setBecause('')
        onDone(done.sleep)
      })
      .catch((err: unknown) => {
        setBusy(false)
        setFault({ message: errorMessage(err), fault: faultOf(err) })
      })
  }
  const working = busy ? t('resident.working') : undefined
  const mayPostpone = may.postpone && (!asleep || byTheOffice)

  return (
    <div className="sleep-presses" data-sleep-presses={asleep ? 'asleep' : 'awake'}>
      <style href="mole-office-sleep-presses" precedence="default">
        {SLEEP_PRESSES_CSS}
      </style>
      <div className="sleep-presses-row">
        {may.sleepAndWake ? (
          asleep ? (
            <Btn size="sm" onClick={() => press(() => api.residentWake(agentId))} disabled={busy} reason={working}>
              {t('resident.sleep.press.wake')}
            </Btn>
          ) : (
            <Btn size="sm" onClick={() => press(() => api.residentSleep(agentId))} disabled={busy} reason={working}>
              {t('resident.sleep.press.sleep')}
            </Btn>
          )
        ) : null}
        {mayPostpone && !postponing ? (
          <Btn
            size="sm"
            onClick={() => {
              setPostponing(true)
            }}
            disabled={busy}
            reason={working}
          >
            {t('resident.sleep.press.postpone')}
          </Btn>
        ) : null}
      </div>
      {mayPostpone && postponing ? (
        <div className="sleep-presses-postpone">
          <TextArea
            value={because}
            onChange={(next) => {
              setBecause(next.slice(0, BECAUSE_MAX))
            }}
            rows={2}
            aria-label={t('resident.sleep.press.because')}
            placeholder={t('resident.sleep.press.because')}
          />
          <div className="sleep-presses-row">
            <Btn
              size="sm"
              variant="primary"
              onClick={() => press(() => api.residentPostpone(agentId, because.trim()))}
              disabled={busy || because.trim() === ''}
              reason={busy ? t('resident.working') : t('resident.sleep.press.becauseFirst')}
            >
              {t('resident.sleep.press.postponeNow')}
            </Btn>
            <Btn
              size="sm"
              variant="ghost"
              onClick={() => {
                setPostponing(false)
                setBecause('')
              }}
              disabled={busy}
              reason={working}
            >
              {t('resident.sleep.press.cancel')}
            </Btn>
          </div>
        </div>
      ) : null}
      {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
    </div>
  )
}

const SLEEP_PRESSES_CSS = `
.sleep-presses { display: flex; flex-direction: column; gap: 6px; min-width: 0; margin-top: 6px; }
.sleep-presses-row { display: flex; flex-wrap: wrap; gap: var(--pad); min-width: 0; }
.sleep-presses-postpone { display: flex; flex-direction: column; gap: 6px; min-width: 0; max-width: var(--measure-in-box); }
`
