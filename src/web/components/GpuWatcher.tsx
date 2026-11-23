// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `The GPU watcher` — ONE AGENT OR NOBODY, CHOSEN HERE OR NAMED BY THE .ENV LINE, ON THE SETTINGS PAGE. Wave 13v
 * round 35b.
 *
 * WHAT IS DRAWN. First, the state: who is the GPU watcher now and where that came from, in short words, or "none". Then the reason given with the newest
 * change, when one was given. Then a picker with "Nobody" first and the registered agents after it, and one press.
 * Last, who changed the setting most recently: a person, an agent, or the office itself at start.
 *
 * THE STATE DRAWN IS THE STORED ONE. After a press the panel reads the door's answer, so the state moves only once the
 * office has stored the change. A refused press leaves the state where it was and draws the refusal under it.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useState } from 'react'

import { content, t } from '@shared/i18n.ts'
import type { OfficeGpuWatcherReply, TheGpuWatcherInForce } from '../api.ts'
import { api, errorMessage, faultOf, type Fault } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { ErrorNote, Loading, Panel, useAsync } from './ui.tsx'
import { SettingChangedLine } from './SettingChangedLine.tsx'
import { AgentPicker } from './agent/AgentPicker.tsx'

export function GpuWatcherPanel() {
  useLanguage()
  const [state] = useAsync(() => api.gpuWatcher(), [])
  if (state.status === 'loading') return <Loading what={t('gpuWatcher.loading')} />
  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault} />
  return (
    <Panel titleIs="label" declares={{ surface: 'settings.gpuwatcher' }} title={t('settingsPanel.title.gpuwatcher')}>
      <style href="mole-office-gpu-watcher" precedence="default">
        {GPU_WATCHER_CSS}
      </style>
      <GpuWatcher first={state.value} />
    </Panel>
  )
}

/** The state in the page's language: the watcher's name, then where it came from or why it cannot watch, in short words. */
function theState(inForce: TheGpuWatcherInForce): string {
  switch (inForce.from) {
    case 'the .env line':
      return inForce.agent === null
        ? `${content(inForce.handle)} · ${t('settingsState.fromEnv')} · ${t('settingsState.notRegistered')}`
        : `${content(inForce.agent.name || inForce.agent.handle)} · ${t('settingsState.fromEnv')}`
    case 'set here':
      return `${content(inForce.agent.name || inForce.agent.handle)} · ${t('settingsState.chosenHere')}`
    case 'set here, cannot watch':
      return `${content(inForce.storedName)} · ${t(inForce.cannotBecause === 'retired' ? 'settingsState.retired' : 'settingsState.notRegistered')}`
    case 'nobody named':
      return t('absence.none')
  }
}

function GpuWatcher({ first }: { first: OfficeGpuWatcherReply }) {
  useLanguage()
  const [reading, setReading] = useState(first)
  const [chosen, setChosen] = useState(first.stored ?? '')
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<{ message: string; fault: Fault | null } | null>(null)
  const [changeNumber, setChangeNumber] = useState(0)

  const save = (): void => {
    setBusy(true)
    setFault(null)
    api
      .setGpuWatcher(chosen === '' ? null : chosen, null)
      .then((now) => {
        setReading(now)
        setChosen(now.stored ?? '')
        setChangeNumber((number) => number + 1)
      })
      .catch((error: unknown) => {
        setFault({ message: errorMessage(error), fault: faultOf(error) })
      })
      .finally(() => {
        setBusy(false)
      })
  }

  const fixed = [
    { value: '', name: t(settingsControlWord('settings.gpuwatcher', 'gpuWatcher.pickNobody')) },
    // THE AGENT CHOSEN HERE, WHEN IT CAN NO LONGER WATCH, stays in the list so the picker shows what is stored.
    ...(reading.inForce.from === 'set here, cannot watch' ? [{ value: reading.inForce.stored, name: reading.inForce.storedName }] : []),
  ]
  // THE AGENTS THE DOOR OFFERS, each by its name, or by its handle where its row holds no name. Every row draws its
  // handle beside its name, so two agents of one name can still be told apart.
  const candidates = reading.mayBeNamed.map((one) => ({ kind: 'agent' as const, id: one.id, name: one.name.trim() === '' ? one.handle : one.name }))
  // NOBODY MAY BE SAVED ON PURPOSE WHILE NOTHING IS SET, so the office does not take a watcher from its readings at the
  // next start. Otherwise the press is for a change.
  const unchanged = reading.everSet && chosen === (reading.stored ?? '')

  return (
    <div className="gpw">
      <p className="gpw-state" data-from={reading.inForce.from}>
        {theState(reading.inForce)}
      </p>
      {reading.because === null ? null : <p className="gpw-because">{t('gpuWatcher.because', { because: content(reading.because) })}</p>}
      <div className="gpw-pick">
        <AgentPicker
          label={t(settingsControlWord('settings.gpuwatcher', 'gpuWatcher.pick'))}
          candidates={candidates}
          chosen={chosen}
          onChoose={setChosen}
          fixed={fixed}
        />
        <button className="gpw-button" type="button" disabled={busy || unchanged} onClick={save}>
          {t(settingsControlWord('settings.gpuwatcher', 'gpuWatcher.save'))}
        </button>
      </div>
      {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
      <SettingChangedLine setting="gpu-watcher" refreshKey={changeNumber} />
    </div>
  )
}

/** The panel's own rules. Every value is a token, so a preset swap re-skins it. No backtick inside. */
const GPU_WATCHER_CSS = `
.gpw { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.gpw-state { margin: 0; max-width: var(--measure-in-box); overflow-wrap: anywhere; font: 600 var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text); }
.gpw-because { margin: 0; max-width: var(--measure-in-box); overflow-wrap: anywhere; font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text-2); }
.gpw-pick { display: flex; flex-wrap: wrap; align-items: end; gap: var(--pad); min-width: 0; }
.gpw-button { min-height: var(--row-h); max-width: 100%; padding: 2px var(--pad); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); background: var(--panel); color: var(--text); box-shadow: var(--button-shadow); font: var(--button-weight) var(--fs-1)/var(--lh-tight) var(--font-ui); cursor: pointer; overflow-wrap: anywhere; }
.gpw-button:hover:not(:disabled) { background: var(--hover); }
.gpw-button:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.gpw-button:disabled { cursor: default; opacity: .6; }
`
