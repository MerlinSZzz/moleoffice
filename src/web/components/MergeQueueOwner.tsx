// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `Who owns the merge queue` — ONE SECRETARY THE PERSON NAMES, ON THE SETTINGS PAGE. A decision says so,
 * with the answer EI3_Msuradr7.
 *
 * WHAT IS DRAWN. First, one line saying what the setting allows: the agent named here may move a merge entry to the
 * front of its lane. Then the state: who owns the merge queue now, or that nobody does and why. Then a picker of the
 * secretaries that may be named, with "Nobody" first, and one press. Then who last changed the setting.
 *
 * THE STATE DRAWN IS THE STORED ONE. After a press the panel reads the door's answer, so the state moves only once
 * the office has stored the change. A refused press leaves the state where it was and draws the refusal under it.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useState } from 'react'

import { content, t } from '@shared/i18n.ts'
import type { OfficeMergeQueueOwnerReply } from '../api.ts'
import { api, errorMessage, faultOf, type Fault } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { ErrorNote, Loading, Panel, Select, useAsync } from './ui.tsx'
import { SettingChangedLine } from './SettingChangedLine.tsx'

export function MergeQueueOwnerPanel() {
  useLanguage()
  const [state] = useAsync(() => api.mergeQueueOwner(), [])
  if (state.status === 'loading') return <Loading what={t('mergeQueueOwner.loading')} />
  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault} />
  return (
    <Panel titleIs="label" declares={{ surface: 'settings.mergequeueowner' }} title={t('settingsPanel.title.mergequeueowner')}>
      <style href="mole-office-merge-queue-owner" precedence="default">
        {MERGE_QUEUE_OWNER_CSS}
      </style>
      <MergeQueueOwner first={state.value} />
    </Panel>
  )
}

/** The state in the page's language, built from the same fields the server's English sentence is. */
function theState(reading: OfficeMergeQueueOwnerReply): string {
  const who = content(reading.storedName ?? '')
  switch (reading.nobodyBecause) {
    case null:
      return t('mergeQueueOwner.named', { who: content(reading.named?.name ?? '') })
    case 'nobody chose':
      return t('mergeQueueOwner.nobody.nobodyChose')
    case 'not registered':
      return t('mergeQueueOwner.nobody.notRegistered', { who })
    case 'retired':
      return t('mergeQueueOwner.nobody.retired', { who })
    case 'not a secretary':
      return t('mergeQueueOwner.nobody.notASecretary', { who })
  }
}

function MergeQueueOwner({ first }: { first: OfficeMergeQueueOwnerReply }) {
  useLanguage()
  const [reading, setReading] = useState(first)
  const [chosen, setChosen] = useState(first.named?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<{ message: string; fault: Fault | null } | null>(null)
  const [changeNumber, setChangeNumber] = useState(0)

  const save = (): void => {
    setBusy(true)
    setFault(null)
    api
      .mergeQueueOwner(chosen === '' ? null : chosen)
      .then((now) => {
        setReading(now)
        setChosen(now.named?.id ?? '')
        setChangeNumber((number) => number + 1)
      })
      .catch((error: unknown) => {
        setFault({ message: errorMessage(error), fault: faultOf(error) })
      })
      .finally(() => {
        setBusy(false)
      })
  }

  const options = [
    { value: '', label: t(settingsControlWord('settings.mergequeueowner', 'mergeQueueOwner.pickNobody')) },
    // EACH BY ITS NAME ALONE, or by its handle where its row holds no name, as the dead-letter picker does. The handle
    // is added beside a name only where two of them carry the same name.
    ...reading.mayBeNamed.map((one) => {
      const name = one.name.trim() === '' ? one.handle : one.name
      const shared = reading.mayBeNamed.filter((other) => other.name === one.name).length > 1
      return { value: one.id, label: shared && name !== one.handle ? `${name} (${one.handle})` : name }
    }),
  ]

  return (
    <div className="mqo">
      <p className="mqo-allows">{t('mergeQueueOwner.allows')}</p>
      <p className="mqo-state" data-named={reading.named === null ? 'nobody' : reading.named.id}>
        {theState(reading)}
      </p>
      {reading.mayBeNamed.length === 0 ? <p className="mqo-none">{t('mergeQueueOwner.nobodyQualifies')}</p> : null}
      <div className="mqo-pick">
        <label className="mqo-field">
          <span>{t(settingsControlWord('settings.mergequeueowner', 'mergeQueueOwner.pick'))}</span>
          <Select value={chosen} onChange={setChosen} options={options} aria-label={t(settingsControlWord('settings.mergequeueowner', 'mergeQueueOwner.pick'))} />
        </label>
        <button className="mqo-button" type="button" disabled={busy || chosen === (reading.named?.id ?? '')} onClick={save}>
          {t(settingsControlWord('settings.mergequeueowner', 'mergeQueueOwner.save'))}
        </button>
      </div>
      {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
      <SettingChangedLine setting="merge-queue-owner" refreshKey={changeNumber} />
    </div>
  )
}

/** The panel's own rules. Every value is a token, so a preset swap re-skins it. No backtick inside. */
const MERGE_QUEUE_OWNER_CSS = `
.mqo { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.mqo-allows { margin: 0; max-width: var(--measure-in-box); overflow-wrap: anywhere; font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text-2); text-wrap: pretty; }
.mqo-state { margin: 0; max-width: var(--measure-in-box); overflow-wrap: anywhere; font: 600 var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text); }
.mqo-none { margin: 0; max-width: var(--measure-in-box); overflow-wrap: anywhere; font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text-2); }
.mqo-pick { display: flex; flex-wrap: wrap; align-items: end; gap: var(--pad); min-width: 0; }
.mqo-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; max-width: 100%; color: var(--text-2); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
.mqo-field .px-select { max-width: 100%; }
.mqo-button { min-height: var(--row-h); max-width: 100%; padding: 2px var(--pad); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); background: var(--panel); color: var(--text); box-shadow: var(--button-shadow); font: var(--button-weight) var(--fs-1)/var(--lh-tight) var(--font-ui); cursor: pointer; overflow-wrap: anywhere; }
.mqo-button:hover:not(:disabled) { background: var(--hover); }
.mqo-button:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.mqo-button:disabled { cursor: default; opacity: .6; }
`
