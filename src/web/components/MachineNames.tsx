// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The person's table of addresses and the names messages should use for them. */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useState } from 'react'

import { t } from '@shared/i18n.ts'
import type { OfficeMachineName } from '../api.ts'
import { api, errorMessage, faultOf, type Fault } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { ErrorNote, Loading, Panel, useAsync } from './ui.tsx'
import { SettingChangedLine } from './SettingChangedLine.tsx'

export function MachineNamesPanel() {
  useLanguage()
  const [state, readAgain] = useAsync(() => api.machineNames(), [])
  const [busy, setBusy] = useState(false)
  // THE REFUSAL AS THE DOOR SENT IT, code and all, so ErrorNote says a coded refusal in the page's language.
  const [fault, setFault] = useState<{ message: string; fault: Fault | null } | null>(null)
  const [stored, setStored] = useState<{ address: string; name: string | null } | null>(null)
  const [changeNumber, setChangeNumber] = useState(0)
  const [address, setAddress] = useState('')
  const [name, setName] = useState('')

  if (state.status === 'loading') return <Loading what={t('settingsPanel.machineNames.loading')} />
  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault} />

  const save = async (nextAddress: string, nextName: string | null): Promise<void> => {
    setBusy(true)
    setFault(null)
    try {
      const reply = await api.setMachineName({ address: nextAddress, name: nextName })
      setStored(reply.stored)
      setChangeNumber((number) => number + 1)
      readAgain()
      if (nextName !== null) {
        setAddress('')
        setName('')
      }
    } catch (error: unknown) {
      setFault({ message: errorMessage(error), fault: faultOf(error) })
    } finally {
      setBusy(false)
    }
  }

  const saved = stored === null
    ? null
    : stored.name === null
      ? t('settingsPanel.machineNames.savedUnnamed', { address: stored.address })
      : t('settingsPanel.machineNames.savedNamed', { address: stored.address, name: stored.name })

  return (
    <Panel titleIs="label" declares={{ surface: 'settings.machinenames' }} title={t('settingsPanel.title.machinenames')}>
      <style href="mole-office-machine-names" precedence="default">
        {MACHINE_NAMES_CSS}
      </style>
      <div className="mn">
        {state.value.machines.length === 0 ? (
          <p className="mn-empty">{t('settingsPanel.machineNames.empty')}</p>
        ) : (
          <div className="mn-list" role="list" aria-label={t('settingsPanel.machineNames.list')}>
            {state.value.machines.map((machine) => (
              <MachineNameRow key={`${machine.address}:${machine.name}`} machine={machine} busy={busy} save={save} />
            ))}
          </div>
        )}

        <p className="mn-purpose">{t('settingsPanel.machineNames.purpose')}</p>
        <p className="mn-history">{t('settingsPanel.machineNames.history')}</p>

        <form
          className="mn-add"
          onSubmit={(event) => {
            event.preventDefault()
            void save(address, name)
          }}
        >
          <label className="mn-field">
            <span>{t(settingsControlWord('settings.machinenames', 'settingsPanel.machineNames.address'))}</span>
            <input className="mn-input" type="text" value={address} disabled={busy} autoComplete="off" onChange={(event) => setAddress(event.target.value)} />
          </label>
          <label className="mn-field">
            <span>{t(settingsControlWord('settings.machinenames', 'settingsPanel.machineNames.name'))}</span>
            <input className="mn-input" type="text" value={name} disabled={busy} autoComplete="off" onChange={(event) => setName(event.target.value)} />
          </label>
          <button className="mn-button" type="submit" disabled={busy}>{t(settingsControlWord('settings.machinenames', 'settingsPanel.machineNames.add'))}</button>
        </form>

        {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
        {saved === null ? null : <p className="mn-saved" role="status">{saved}</p>}
        <SettingChangedLine setting="machine-names" refreshKey={changeNumber} />
      </div>
    </Panel>
  )
}

function MachineNameRow({ machine, busy, save }: {
  machine: OfficeMachineName
  busy: boolean
  save: (address: string, name: string | null) => Promise<void>
}) {
  useLanguage()
  const [name, setName] = useState(machine.name)

  return (
    <div className="mn-row" role="listitem" data-machine-address={machine.address}>
      <code className="mn-address">{machine.address}</code>
      <label className="mn-field">
        <span>{t(settingsControlWord('settings.machinenames', 'settingsPanel.machineNames.name'))}</span>
        <input className="mn-input" type="text" value={name} disabled={busy} autoComplete="off" onChange={(event) => setName(event.target.value)} />
      </label>
      <button className="mn-button" type="button" disabled={busy} onClick={() => { void save(machine.address, name) }}>
        {t(settingsControlWord('settings.machinenames', 'settingsPanel.machineNames.save'))}
      </button>
      <button className="mn-button mn-remove" type="button" disabled={busy} onClick={() => { void save(machine.address, null) }}>
        {t(settingsControlWord('settings.machinenames', 'settingsPanel.machineNames.remove'))}
      </button>
    </div>
  )
}

const MACHINE_NAMES_CSS = `
.mn { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.mn-purpose, .mn-history, .mn-empty, .mn-saved { margin: 0; max-width: var(--measure-in-box); overflow-wrap: anywhere; font: var(--fs-1)/var(--lh-body) var(--font-ui); }
.mn-purpose, .mn-empty { color: var(--text-2); }
.mn-history { color: var(--text-3); }
.mn-list { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.mn-row { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr) auto auto; align-items: end; gap: var(--pad); min-width: 0; padding-bottom: var(--pad); border-bottom: var(--border-w) solid var(--border); }
.mn-address { min-width: 0; overflow-wrap: anywhere; color: var(--text-2); font: var(--fs-1)/var(--lh-body) var(--font-mono); }
.mn-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; color: var(--text-2); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
.mn-input { box-sizing: border-box; width: 100%; min-width: 0; min-height: var(--row-h); padding: 2px var(--pad); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); background: var(--panel); color: var(--text); font: var(--fs-1)/var(--lh-body) var(--font-ui); }
.mn-input:focus-visible, .mn-button:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.mn-input:disabled, .mn-button:disabled { cursor: default; opacity: .6; }
.mn-button { min-height: var(--row-h); max-width: 100%; padding: 2px var(--pad); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); background: var(--panel); color: var(--text); box-shadow: var(--button-shadow); font: var(--button-weight) var(--fs-1)/var(--lh-tight) var(--font-ui); cursor: pointer; overflow-wrap: anywhere; }
.mn-button:hover:not(:disabled) { background: var(--hover); }
.mn-remove { color: var(--st-failed); }
.mn-add { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; align-items: end; gap: var(--pad); min-width: 0; padding-top: var(--pad); }
.mn-saved { color: var(--text-2); }
@media (max-width: 40rem) {
  .mn-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: end; }
  .mn-address { grid-column: 1 / -1; }
  .mn-add { grid-template-columns: minmax(0, 1fr); }
  .mn-add .mn-button { justify-self: start; }
}
`
