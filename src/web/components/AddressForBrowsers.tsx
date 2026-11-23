// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The one address a browser is sent to, so one pairing covers the office. Drawn inside the remote access panel. */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useState } from 'react'

import { content, t } from '@shared/i18n.ts'
import { api, errorMessage, faultOf, type Fault } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { ErrorNote, Loading, useAsync } from './ui.tsx'
import { SettingChangedLine } from './SettingChangedLine.tsx'

export function AddressForBrowsers() {
  useLanguage()
  const [state, readAgain] = useAsync(() => api.addressForBrowsers(), [])
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<{ message: string; fault: Fault | null } | null>(null)
  const [changeNumber, setChangeNumber] = useState(0)
  const [written, setWritten] = useState('')

  if (state.status === 'loading') return <Loading what={t('settingsPanel.addressForBrowsers.title')} rows={1} />
  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault} />
  const reading = state.value

  const save = async (address: string | null): Promise<void> => {
    setBusy(true)
    setFault(null)
    try {
      await api.setAddressForBrowsers(address)
      setChangeNumber((number) => number + 1)
      setWritten('')
      readAgain()
    } catch (error: unknown) {
      setFault({ message: errorMessage(error), fault: faultOf(error) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="afb" aria-label={t('settingsPanel.addressForBrowsers.title')}>
      <style href="mole-office-address-for-browsers" precedence="default">
        {ADDRESS_FOR_BROWSERS_CSS}
      </style>
      <h3 className="afb-title">{t('settingsPanel.addressForBrowsers.title')}</h3>
      <dl className="afb-now">
        <dt>{t('settingsPanel.addressForBrowsers.sentTo')}</dt>
        <dd>
          {reading.inForce === null ? (
            t('absence.none')
          ) : (
            <>
              <code className="afb-address">{content(reading.inForce)}</code>
              {reading.chosen === null && reading.fromTheEnvironment !== null ? <span className="afb-where"> · {t('settingsState.fromEnv')}</span> : null}
            </>
          )}
        </dd>
      </dl>
      <form
        className="afb-form"
        onSubmit={(event) => {
          event.preventDefault()
          void save(written)
        }}
      >
        <label className="afb-field">
          <span>{t(settingsControlWord('settings.access', 'settingsPanel.addressForBrowsers.field'))}</span>
          <input className="afb-input" type="text" value={written} disabled={busy} autoComplete="off" spellCheck={false} onChange={(event) => setWritten(event.target.value)} />
        </label>
        <button className="afb-button" type="submit" disabled={busy}>{t(settingsControlWord('settings.access', 'settingsPanel.addressForBrowsers.save'))}</button>
        {reading.chosen === null ? null : (
          <button className="afb-button" type="button" disabled={busy} onClick={() => { void save(null) }}>
            {reading.fromTheEnvironment === null
              ? t(settingsControlWord('settings.access', 'settingsPanel.addressForBrowsers.takeAwayToNone'))
              : t(settingsControlWord('settings.access', 'settingsPanel.addressForBrowsers.takeAway'))}
          </button>
        )}
      </form>
      {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
      <SettingChangedLine setting="address-for-browsers" refreshKey={changeNumber} />
    </section>
  )
}

const ADDRESS_FOR_BROWSERS_CSS = `
.afb { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; margin-top: calc(var(--pad) * 2); padding-top: var(--pad); border-top: var(--border-w) solid var(--border); }
.afb-title { margin: 0; color: var(--text); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
.afb-where { color: var(--text-3); }
.afb-now { display: flex; flex-wrap: wrap; gap: 4px var(--pad); margin: 0; min-width: 0; font: var(--fs-1)/var(--lh-body) var(--font-ui); }
.afb-now dt { color: var(--text-2); font-weight: 600; }
.afb-now dd { margin: 0; min-width: 0; overflow-wrap: anywhere; color: var(--text); }
.afb-address { font: var(--fs-1)/var(--lh-body) var(--font-mono); overflow-wrap: anywhere; }
.afb-form { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: end; gap: var(--pad); min-width: 0; }
.afb-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; color: var(--text-2); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
.afb-input { box-sizing: border-box; width: 100%; min-width: 0; min-height: var(--row-h); padding: 2px var(--pad); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); background: var(--panel); color: var(--text); font: var(--fs-1)/var(--lh-body) var(--font-mono); }
.afb-input:focus-visible, .afb-button:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.afb-input:disabled, .afb-button:disabled { cursor: default; opacity: .6; }
.afb-button { min-height: var(--row-h); max-width: 100%; padding: 2px var(--pad); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); background: var(--panel); color: var(--text); box-shadow: var(--button-shadow); font: var(--button-weight) var(--fs-1)/var(--lh-tight) var(--font-ui); cursor: pointer; overflow-wrap: anywhere; }
.afb-button:hover:not(:disabled) { background: var(--hover); }
@media (max-width: 40rem) {
  .afb-form { grid-template-columns: minmax(0, 1fr); }
  .afb-form .afb-button { justify-self: start; }
}
`
