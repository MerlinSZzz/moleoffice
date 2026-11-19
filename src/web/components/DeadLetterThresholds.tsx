// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useState } from 'react'
import { content, t } from '@shared/i18n.ts'
import { settingsControlWord } from '@shared/settings-declaration.ts'
import type { DeadLetterThresholds } from '@shared/dead-letter-thresholds.ts'
import { api, errorMessage, faultOf, type Fault } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { RouteLink, recordPath } from './router.tsx'
import { ErrorNote, Loading, useAsync } from './ui.tsx'

export function DeadLetterThresholdsControl() {
  useLanguage()
  const [state] = useAsync(() => api.deadLetterThresholds(), [])
  if (state.status === 'loading') return <Loading what={t('deadLetterThresholds.loading')} />
  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault} />
  return <Thresholds first={state.value} />
}

function sourceInWords(source: string): string {
  switch (source) {
    case 'the office database': return t('deadLetterThresholds.database')
    case 'the environment': return t('deadLetterThresholds.environment')
    case '.env': return t('deadLetterThresholds.file')
    case 'the built-in default': return t('deadLetterThresholds.default')
    default: return content(source)
  }
}

function changeValues(snapshot: string | null): { days: string; count: string } {
  const values = snapshot === null ? undefined : (JSON.parse(snapshot) as { effective?: { days?: number; count?: number } }).effective
  return {
    days: values?.days === undefined ? t('deadLetterThresholds.notRecorded') : String(values.days),
    count: values?.count === undefined ? t('deadLetterThresholds.notRecorded') : String(values.count),
  }
}

function Thresholds({ first }: { first: DeadLetterThresholds }) {
  const [reading, setReading] = useState(first)
  const [days, setDays] = useState(String(first.days.value))
  const [count, setCount] = useState(String(first.count.value))
  const [because, setBecause] = useState('')
  const [decision, setDecision] = useState(first.decision?.id ?? '')
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<{ id: string; title: string }[]>([])
  const [searchNote, setSearchNote] = useState<string | null>(null)
  async function findDecision(): Promise<void> {
    setBusy(true)
    setFault(null)
    try {
      const reply = await api.search(query, 'decision', 10, 'all')
      setFound(reply.results.map((item) => ({ id: item.record.id, title: item.record.title })))
      setSearchNote(reply.note)
    } catch (error) { setFault({ message: errorMessage(error), fault: faultOf(error) }) }
    finally { setBusy(false) }
  }
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<{ message: string; fault: Fault | null } | null>(null)
  const valid = [days, count].every((value) => value.trim() !== '' && Number.isInteger(Number(value)) && Number(value) > 0)
  const reasonValid = because.trim().length > 0 && because.trim().length <= 500
  async function save(remove: boolean): Promise<void> {
    setBusy(true)
    setFault(null)
    try {
      const now = await api.deadLetterThresholds({ days: remove ? null : Number(days), count: remove ? null : Number(count), because, decision: decision || null })
      setReading(now)
      setBecause('')
      setDays(String(now.days.value))
      setCount(String(now.count.value))
    } catch (error) {
      setFault({ message: errorMessage(error), fault: faultOf(error) })
    } finally { setBusy(false) }
  }
  const changed = reading.lastChange
  const before = changeValues(changed?.from ?? null)
  const after = changeValues(changed?.to ?? null)
  const who = changed?.by.name ?? t('deadLetterThresholds.writerUnknown')
  return <section className="dlt" aria-label={t('deadLetterThresholds.title')}>
    <style href="mole-office-dead-letter-thresholds" precedence="default">{CSS}</style>
    <h3>{t('deadLetterThresholds.title')}</h3>
    <p>{t('deadLetterThresholds.rule')}</p>
    <div className="dlt-fields">
      <label><span>{t(settingsControlWord('settings.deadletters', 'deadLetterThresholds.days'))}</span><input type="number" min="1" step="1" value={days} onChange={(event) => setDays(event.target.value)} />
        <small>{t('deadLetterThresholds.source', { value: reading.days.value, source: sourceInWords(reading.days.source) })}</small></label>
      <label><span>{t(settingsControlWord('settings.deadletters', 'deadLetterThresholds.count'))}</span><input type="number" min="1" step="1" value={count} onChange={(event) => setCount(event.target.value)} />
        <small>{t('deadLetterThresholds.source', { value: reading.count.value, source: sourceInWords(reading.count.source) })}</small></label>
    </div>
    <label className="dlt-reason"><span>{t(settingsControlWord('settings.deadletters', 'deadLetterThresholds.reason'))}</span><textarea value={because} maxLength={500} onChange={(event) => setBecause(event.target.value)} /></label>
    <details>
      <summary>{t('deadLetterThresholds.decision')}</summary>
      <label className="dlt-reason"><span>{t(settingsControlWord('settings.deadletters', 'deadLetterThresholds.searchDecision'))}</span><input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <button className="dlt-button" type="button" disabled={busy || query.trim() === ''} onClick={() => { void findDecision() }}>{t(settingsControlWord('settings.deadletters', 'deadLetterThresholds.findDecision'))}</button>
      <label className="dlt-reason"><span>{t(settingsControlWord('settings.deadletters', 'deadLetterThresholds.chosenDecision'))}</span><select value={decision} onChange={(event) => setDecision(event.target.value)}>
        <option value="">{t('deadLetterThresholds.notRecorded')}</option>
        {first.decision !== null && !found.some((item) => item.id === first.decision?.id) ? <option value={first.decision.id}>{content(first.decision.title ?? t('deadLetterThresholds.notRecorded'))}</option> : null}
        {found.map((item) => <option key={item.id} value={item.id}>{content(item.title)}</option>)}
      </select></label>
      {searchNote === null ? null : <p>{content(searchNote)}</p>}
    </details>
    <div className="dlt-actions">
      <button type="button" className="dlt-button" disabled={busy || !valid || !reasonValid} onClick={() => { void save(false) }}>{t(settingsControlWord('settings.deadletters', 'deadLetterThresholds.save'))}</button>
      <button type="button" className="dlt-button" disabled={busy || !reasonValid || (reading.days.chosen === null && reading.count.chosen === null)} onClick={() => { void save(true) }}>{t(settingsControlWord('settings.deadletters', 'deadLetterThresholds.remove'))}</button>
    </div>
    <p className="dlt-changed">{changed === null ? t('deadLetterThresholds.unchanged') : t('deadLetterThresholds.changed', { who: content(who), when: content(changed.at) })}</p>
    {changed === null ? null : <p>{t('deadLetterThresholds.values', { fromDays: before.days, toDays: after.days, fromCount: before.count, toCount: after.count })}</p>}
    <p>{t('deadLetterThresholds.lastReason', { reason: content(reading.because ?? t('deadLetterThresholds.notRecorded')) })}</p>
    <p>{t('deadLetterThresholds.decision')}: {reading.decision === null ? t('deadLetterThresholds.notRecorded') : <RouteLink to={recordPath(reading.decision.id)}>{content(reading.decision.title ?? t('deadLetterThresholds.notRecorded'))}</RouteLink>}</p>
    {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
  </section>
}

const CSS = `
.dlt { min-width: 0; border-top: var(--border-w) solid var(--border); padding-top: var(--pad); display: flex; flex-direction: column; gap: var(--pad); }
.dlt h3, .dlt p { margin: 0; max-width: var(--measure-in-box); overflow-wrap: anywhere; }
.dlt h3 { font: 600 var(--fs-1)/var(--lh-body) var(--font-ui); }
.dlt p, .dlt small { color: var(--text-2); font: var(--fs-1)/var(--lh-body) var(--font-ui); }
.dlt-fields, .dlt-actions { display: flex; flex-wrap: wrap; gap: var(--pad); }
.dlt-fields label { display: flex; flex-direction: column; gap: 4px; flex: 1 1 180px; min-width: 0; }
.dlt-reason { display: flex; flex-direction: column; gap: 4px; }
.dlt-fields input, .dlt-reason input, .dlt-reason textarea, .dlt-reason select { box-sizing: border-box; width: 100%; min-width: 0; min-height: var(--row-h); background: var(--panel); color: var(--text); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); padding: 2px var(--pad); font: var(--fs-1)/var(--lh-body) var(--font-ui); }
.dlt-fields input:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.dlt .dlt-changed { color: var(--text-3); }
`
