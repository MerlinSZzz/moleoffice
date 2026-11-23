// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MEMORY LIMIT OF THE SANDBOXES, ON THE SETTINGS PAGE.
 * One limit on all sandbox containers together, set by the person's press through the system's
 * own password dialog. The doors are src/server/api/sandbox-memory-cap.ts, and src/config/sandbox-memory-cap.mjs says
 * what runs and why.
 *
 * WHERE IT STANDS IS A SHORT STATE WORD, and a press's outcome is one too, as decided. THE EXACT COMMAND THAT RUNS AS
 * ADMINISTRATOR IS DRAWN IN NORMAL MODE, under a short label, not only in Developer mode as other panels draw theirs,
 * because it runs as root and the person should see it before they give their password.
 *
 * EVERY WORD IS FROM THE WORD LISTS. The command and the reason a program gave are drawn as they are, marked English.
 * An agent the person's grant does not carry here is refused by the door, and the panel draws that refusal by its code.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useState } from 'react'

import { t, type WordKey } from '@shared/i18n.ts'
import type { SandboxCapDone, SandboxCapOutcome, SandboxCapReading } from '@shared/sandbox-memory-cap.ts'
import { ApiError, moleOfficeRequest } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { Btn, ErrorNote, Loading, useAsync } from './ui.tsx'

/** Read where the limit stands. */
function readTheCap(): Promise<SandboxCapReading> {
  return moleOfficeRequest<SandboxCapReading>('/api/office/sandbox-memory-cap')
}

/** Their press: on or off. */
function pressTheCap(on: boolean): Promise<SandboxCapDone> {
  return moleOfficeRequest<SandboxCapDone>('/api/office/sandbox-memory-cap', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ on }),
  })
}

/** Bytes as GB, the way the words say them: whole when whole, else to one place. */
function gb(bytes: number): number {
  return Math.round((bytes / 1024 ** 3) * 10) / 10
}

/** The short word for where it stands. */
function theStateWords(reading: SandboxCapReading): string {
  if (reading.held === 'on') return t('sandboxCap.state.onAt', { cap: gb(reading.capBytes) })
  if (reading.held === 'off') return t('shortcuts.off')
  if (reading.held === 'other' && reading.bytes !== null) return t('sandboxCap.state.setTo', { gb: gb(reading.bytes) })
  return t('settingsState.notRead')
}

const OUTCOME_WORDS: Readonly<Record<Exclude<SandboxCapOutcome, 'done'>, WordKey>> = {
  already: 'settingsState.unchanged',
  cancelled: 'settingsState.cancelled',
  'not authorized': 'settingsState.notPermitted',
  'no dialog': 'sandboxCap.state.noAnswer',
  failed: 'settingsState.failed',
  'not readable': 'settingsState.notRead',
}

/** What their press did, as a short word in their language. */
function whatThePressDid(done: SandboxCapDone, on: boolean): string {
  if (done.outcome === 'done') return t(on ? 'settingsState.turnedOn' : 'settingsState.turnedOff')
  return t(OUTCOME_WORDS[done.outcome])
}

export interface SandboxMemoryCapViewProps {
  reading: SandboxCapReading
  busy: boolean
  /** What the last press did, and which press it was. */
  done: { answer: SandboxCapDone; on: boolean } | null
  onPress: (on: boolean) => void
}

/** THE PANEL ONCE THE READING IS IN: drawn from its props alone, so a test can draw every state. */
export function SandboxMemoryCapView({ reading, busy, done, onPress }: SandboxMemoryCapViewProps): React.ReactElement {
  const mayPress = reading.held !== 'unreadable'
  const busyWhy = busy ? t('sandboxCap.state.waiting') : undefined
  return (
    <>
      <p className="smc-said">{theStateWords(reading)}</p>
      {mayPress ? (
        <>
          <p className="smc-label">{t('sandboxCap.commandOnLabel')}</p>
          <code className="smc-code" lang="en">{reading.onCommand}</code>
          <p className="smc-label">{t('sandboxCap.commandOffLabel')}</p>
          <code className="smc-code" lang="en">{reading.offCommand}</code>
          <div className="smc-presses">
            <Btn onClick={() => onPress(true)} disabled={busy} reason={busyWhy}>
              {t(settingsControlWord('settings.sandboxmemory', 'sandboxCap.turnOn'), { cap: gb(reading.capBytes) })}
            </Btn>
            <Btn onClick={() => onPress(false)} disabled={busy} reason={busyWhy}>
              {t(settingsControlWord('settings.sandboxmemory', 'sandboxCap.turnOff'))}
            </Btn>
          </div>
        </>
      ) : null}
      {busy ? <p className="smc-said" role="status">{t('sandboxCap.state.waiting')}</p> : null}
      {done === null ? null : <p className="smc-said" role="status">{whatThePressDid(done.answer, done.on)}</p>}
      {done !== null && done.answer.outcome !== 'done' && done.answer.reason !== null ? (
        <code className="smc-code" lang="en">{done.answer.reason}</code>
      ) : null}
    </>
  )
}

export function SandboxMemoryCap(): React.ReactElement {
  useLanguage()
  const [state, readAgain] = useAsync(readTheCap, [])
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<ApiError | Error | null>(null)
  const [done, setDone] = useState<{ answer: SandboxCapDone; on: boolean } | null>(null)

  const press = (on: boolean): void => {
    setRefused(null)
    setDone(null)
    setBusy(true)
    void pressTheCap(on)
      .then((answer) => {
        setBusy(false)
        setDone({ answer, on })
        readAgain()
      })
      .catch((err: unknown) => {
        setBusy(false)
        setRefused(err instanceof Error ? err : new Error(String(err)))
        readAgain()
      })
  }

  return (
    <section className="smc" aria-label={t('settingsPanel.title.sandboxmemory')}>
      <style href="mole-office-sandbox-memory-cap" precedence="default">
        {SANDBOX_MEMORY_CAP_CSS}
      </style>
      {state.status === 'loading' ? <Loading what={t('sandboxCap.loading')} rows={1} /> : null}
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault ?? null} label={t('sandboxCap.unread')} retry={readAgain} /> : null}
      {state.status === 'ready' ? <SandboxMemoryCapView reading={state.value} busy={busy} done={done} onPress={press} /> : null}
      {refused === null ? null : <ErrorNote message={refused.message} fault={refused instanceof ApiError ? refused.fault : null} label={t('sandboxCap.notChanged')} />}
    </section>
  )
}

const SANDBOX_MEMORY_CAP_CSS = `
.smc { display: flex; flex-direction: column; align-items: flex-start; gap: 0.5rem; min-width: 0; }
.smc-label, .smc-said {
  margin: 0;
  max-width: var(--measure-in-box);
  font: var(--fs-1)/var(--lh-read) var(--font-ui);
  overflow-wrap: anywhere;
}
.smc-label { color: var(--text-2); }
.smc-said { color: var(--text); }
.smc-code {
  display: block; max-width: 100%;
  padding: 0.25rem 0.5rem;
  border-radius: var(--radius-sm); background: var(--panel-2);
  font: var(--fs-1)/var(--lh-read) var(--font-mono);
  overflow-wrap: anywhere;
}
.smc-presses { display: flex; flex-wrap: wrap; gap: var(--pad); }
`
