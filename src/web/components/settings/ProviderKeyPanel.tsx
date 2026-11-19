// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useState } from 'react'
import { t } from '@shared/i18n.ts'
import { providerGuideWord } from '@shared/provider-guide.ts'
import { settingsControlWord } from '@shared/settings-declaration.ts'
import { ApiError, moleOfficeRequest, errorMessage } from '../../api.ts'
import { useLanguage } from '../../lib/language.ts'
import { ErrorNote, Loading, Panel, useAsync } from '../ui.tsx'

type Provider = {
  id: string; name: string; page: string; documentation: string; instructions: string; scopes?: string
  permissions?: Record<string, string[]>; otherPermissionsOff?: string; expiry?: string; trialDescription?: string
}
const word = (key: string) => t(settingsControlWord('settings.providerkeys', key))

export function ProviderKeyPanel() {
  const language = useLanguage().language
  const [state] = useAsync(() => moleOfficeRequest<{ providers: Provider[]; savingAvailable: boolean }>('/api/settings/provider-keys'), [])
  const [provider, setProvider] = useState('')
  const [name, setName] = useState('')
  const [prefix, setPrefix] = useState('')
  const [minimum, setMinimum] = useState(1)
  const [value, setValue] = useState('')
  const [replace, setReplace] = useState(false)
  // Set only when the office refused a save because a key is already saved there, or a trial found one too broad; the replace box is drawn only then.
  const [exists, setExists] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [fault, setFault] = useState('')
  const [trialAvailable, setTrialAvailable] = useState(false)
  const rows = state.status === 'ready' ? state.value.providers : []
  const selected = provider || rows[0]?.id || ''
  const row = rows.find((entry) => entry.id === selected)
  const save = async () => {
    setBusy(true); setNotice(''); setFault('')
    try {
      const result = await moleOfficeRequest<{ saved: boolean; trialAvailable: boolean }>('/api/settings/provider-keys', {
        method: 'POST', body: JSON.stringify({ provider: selected, value, replace, lang: language === 'zh' ? 'zh' : 'en',
          ...(selected === 'custom' ? { customName: name, prefix, min: minimum } : {}) }),
      })
      setValue(''); setReplace(false); setExists(false); setTrialAvailable(result.trialAvailable)
      setNotice(result.trialAvailable ? t('providerSetup.saved') : t('providerSetup.local'))
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) setExists(true)
      setFault(errorMessage(error))
    } finally { setBusy(false) }
  }
  const trial = async () => {
    setBusy(true); setNotice(''); setFault('')
    try {
      const result = await moleOfficeRequest<{ outcome: string; says: string }>('/api/settings/provider-keys/trial', { method: 'POST', body: JSON.stringify({ provider: selected }) })
      if (result.outcome === 'passed') setNotice(t('providerSetup.savedTrial'))
      // A too-broad answer proves a key is saved here, so the replacement is offered at once.
      else if (result.outcome === 'too-broad') { setFault(t('providerSetup.tooBroad')); setExists(true) }
      // Any other answer, such as not-tested for a provider with no trial, is not a pass: the office's own words say what it is.
      else setFault(result.says)
    } catch (error) { setFault(errorMessage(error)) } finally { setBusy(false) }
  }
  return <Panel titleIs="label" declares={{ surface: 'settings.providerkeys' }} title={t('providerSetup.title')}>
    <style href="provider-key-setup" precedence="default">{CSS}</style>
    {state.status === 'loading' ? <Loading what={t('providerSetup.loading')} /> : state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault} /> :
      <div className="pks">
        <p>{t('providerSetup.lead')}</p>{state.value.savingAvailable === false ? <p>{t('providerSetup.windows')}</p> : null}
        <label>{word('providerSetup.provider')}<select value={selected} onChange={(event) => { setProvider(event.target.value); setValue(''); setReplace(false); setExists(false); setNotice(''); setFault(''); setTrialAvailable(false) }}>
          {rows.map((entry) => <option key={entry.id} value={entry.id}>{t(providerGuideWord(entry.id, 'name'))}</option>)}<option value="custom">{t('providerSetup.custom')}</option>
        </select></label>
        {/* The office's reply says which parts a guide has; their words come from the lists. */}
        {row ? <div className="pks-guide"><p>{t(providerGuideWord(row.id, 'instructions'))}</p>{row.scopes ? <p>{t(providerGuideWord(row.id, 'scopes'))}</p> : null}
          {row.permissions ? <ul>{Object.keys(row.permissions).map((resource) => <li key={resource}>{t(providerGuideWord(row.id, `permission.${resource}`))}</li>)}</ul> : null}
          {row.otherPermissionsOff ? <p>{t(providerGuideWord(row.id, 'otherPermissionsOff'))}</p> : null}{row.expiry ? <p>{t(providerGuideWord(row.id, 'expiry'))}</p> : null}
          <p><a href={row.page} target="_blank" rel="noreferrer">{t(providerGuideWord(row.id, 'name'))}</a>{' · '}<a href={row.documentation} target="_blank" rel="noreferrer">{t('providerSetup.documentation')}</a></p></div> : null}
        {selected === 'custom' ? <><label>{word('providerSetup.name')}<input value={name} onChange={(event) => { setName(event.target.value); setReplace(false); setExists(false) }} /></label>
          <label>{word('providerSetup.prefix')}<input value={prefix} onChange={(event) => setPrefix(event.target.value)} /></label>
          <label>{word('providerSetup.minimum')}<input type="number" min={1} max={4096} value={minimum} onChange={(event) => setMinimum(Number(event.target.value))} /></label></> : null}
        <label>{word('providerSetup.key')}<input type="password" autoComplete="off" spellCheck={false} value={value} onChange={(event) => setValue(event.target.value)} /></label>
        {exists ? <label className="pks-check"><input type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} />{word('providerSetup.replace')}</label> : null}
        {/* The trial paragraph says what the trial button does, so it is drawn only beside that button. */}
        {trialAvailable && row?.trialDescription ? <p>{t(providerGuideWord(row.id, 'trialDescription'))}</p> : null}
        <div className="pks-actions"><button type="button" disabled={busy || !value || !selected} onClick={() => void save()}>{word('providerSetup.save')}</button>
          {trialAvailable ? <button type="button" disabled={busy} onClick={() => void trial()}>{word('providerSetup.test')}</button> : null}</div>
        {notice ? <p role="status">{notice}</p> : null}{fault ? <p role="alert">{fault}</p> : null}
      </div>}
  </Panel>
}
const CSS = `
.pks { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; max-width: 48rem; }
.pks p { margin: 0; }
.pks label { display: flex; flex-direction: column; gap: 4px; }
.pks input:not([type=checkbox]), .pks select { min-height: 32px; max-width: 28rem; width: 100%; }
.pks .pks-check { flex-direction: row; align-items: center; }
.pks-guide { display: flex; flex-direction: column; gap: var(--pad); overflow-wrap: anywhere; }
.pks-guide ul { margin: 0; }
.pks-actions { display: flex; flex-wrap: wrap; gap: var(--pad); }
.pks-actions button { min-height: 32px; padding: 0 var(--pad); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); background: var(--panel); color: var(--text); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); cursor: pointer; }
.pks-actions button:hover:not(:disabled) { background: var(--hover); }
.pks-actions button:disabled { color: var(--text-3); cursor: default; }
`
