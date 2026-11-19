// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORK SWITCHES PANEL, wave 13q item 17: the four settings that decide whether work moves, each with its value, who
 * changed it last, when and the reason given. It reads them at the read call a host script reads, and the queue-held
 * gate's own row at the gates door, so the hold is drawn and changed exactly as on the Gates panel.
 *
 * Each change goes through its own door, which checks it and keeps who made it and why: the skip lists and the
 * producer's attempt at the settings door, how many checks run at once at its own door. A press needs a reason.
 */
import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useEffect, useState } from 'react'
import { content, t, type WordKey } from '@shared/i18n.ts'
import { THE_WORK_SWITCHES_READ_CALL } from '@shared/work-switches.mjs'
import { errorMessage, faultOf, moleOfficeRequest } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { useInspect } from '../lib/mode.ts'
import { Gate, GATES_CSS } from './GatesPanel.tsx'
import { ErrorNote, Loading, Panel, useAsync } from './ui.tsx'

import type { OneGateReading } from '../../server/api/runtime-settings.ts'
import type { ASkipList, AWorkSwitchsLastChange, TheWorkSwitches } from '../../server/api/work-switches.ts'

interface TheReading { switches: TheWorkSwitches; held: OneGateReading }

// The gate is read by the id the read call names, so the page and a host script mean the same gate.
async function readTheSwitches(): Promise<TheReading> {
  const switches = await moleOfficeRequest<TheWorkSwitches>(THE_WORK_SWITCHES_READ_CALL)
  const held = await moleOfficeRequest<OneGateReading>(`/api/office/gates?gate=${encodeURIComponent(switches.queueHeld.gate)}`)
  return { switches, held }
}

export function WorkSwitchesPanel() {
  useLanguage()
  const inspect = useInspect()
  const [state, readAgain] = useAsync(readTheSwitches, [])
  return <Panel titleIs="label" declares={{ surface: 'settings.workswitches' }} title={t('workSwitches.title')}>
    <style href="gates-panel" precedence="default">{GATES_CSS}</style>
    <style href="work-switches-panel" precedence="default">{WORK_SWITCHES_CSS}</style>
    <div className="gates ws">
      <p>{t('workSwitches.what')}</p>
      {/* An /api/ path is machinery, so only Developer mode names the read call a host script uses. */}
      {inspect && <p>{t('workSwitches.readCall', { call: content(THE_WORK_SWITCHES_READ_CALL) })}</p>}
      {state.status === 'loading' ? <Loading what={t('workSwitches.loading')} />
        : state.status === 'error' ? <><p>{t('workSwitches.readFailed')}</p><ErrorNote message={state.message} fault={state.fault} /><button className="px-btn" onClick={readAgain}>{t(settingsControlWord('settings.workswitches', 'gates.readAgain'))}</button></>
          : <Switches first={state.value} />}
    </div>
  </Panel>
}

function Switches({ first }: { first: TheReading }) {
  const [reading, setReading] = useState(first)
  async function readAgain() { setReading(await readTheSwitches()) }
  const { switches, held } = reading
  return <>
    <article className="gates-row" data-work-switch="own-release-skip" aria-labelledby="ws-own-release-skip">
      <h5 id="ws-own-release-skip">{t('workSwitches.skip.title')}</h5>
      <p>{t('workSwitches.skip.what')}</p>
      <SkipList which="tags" list={switches.ownReleaseSkip.tags} mayChange={held.mayChange} readAgain={readAgain} />
      <SkipList which="runs" list={switches.ownReleaseSkip.runs} mayChange={held.mayChange} readAgain={readAgain} />
    </article>
    <article className="gates-row ws-held" data-work-switch="queue-held" aria-labelledby="ws-queue-held">
      <h5 id="ws-queue-held">{t(settingsControlWord('settings.workswitches', 'workSwitches.held.title'))}</h5>
      <p>{t('workSwitches.held.what')}</p>
      <Gate settingsControlPrefix="workSwitches.held" row={held.row} mayChange={held.row.whoMayChange === 'the-person' ? held.mayChangeThePersonsOwn : held.mayChange} readAgain={readAgain} />
    </article>
    <ChecksAtOnce checks={switches.checksAtOnce} mayChange={held.mayChange} readAgain={readAgain} />
    <Pending pending={switches.receiptProducerPending} mayChange={held.mayChange} readAgain={readAgain} />
  </>
}

/** A press that sends one change with its reason, then reads the switches again, as a gate row does. */
function useASave(readAgain: () => Promise<void>) {
  const [because, setBecause] = useState('')
  const [busy, setBusy] = useState(false)
  const [savedButUnread, setSavedButUnread] = useState(false)
  const [fault, setFault] = useState<{ kind: 'save' | 'read'; message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  async function readAfterSaving() {
    setBusy(true); setFault(null)
    try { await readAgain(); setSavedButUnread(false) }
    catch (error) { const fault = faultOf(error); setFault({ kind: 'read', message: fault?.said ?? errorMessage(error), fault }) }
    finally { setBusy(false) }
  }
  async function save(send: (because: string) => Promise<unknown>) {
    if (busy || savedButUnread || !because.trim()) return
    setBusy(true); setFault(null)
    try { await send(because.trim()) } catch (error) {
      setFault({ kind: 'save', message: errorMessage(error), fault: faultOf(error) })
      setBusy(false)
      return
    }
    setBecause(''); setSavedButUnread(true)
    await readAfterSaving()
  }
  return { because, setBecause, busy, savedButUnread, fault, save, readAfterSaving }
}
type ASave = ReturnType<typeof useASave>

const throughTheSettingsDoor = (name: string, value: string | null) => (because: string) =>
  moleOfficeRequest('/api/office/settings', { method: 'POST', body: JSON.stringify({ changes: [{ name, value }], because }) })

/** What is in force, or, after a change, that the switches are being read again. */
function InForce({ save, children }: { save: ASave; children: string }) {
  return save.savedButUnread
    ? <p role="status">{t(save.fault?.kind === 'read' ? 'workSwitches.savedReadFailed' : 'workSwitches.savedReading')}</p>
    : <p className="gates-position">{children}</p>
}

function TheReason({ save, control }: { save: ASave; control: string }) {
  return <label>{t(settingsControlWord('settings.workswitches', control))}<input value={save.because} required maxLength={500} onChange={(event) => save.setBecause(event.target.value)} /></label>
}

/** The door's refusal, and the press that reads again after a change the page could not read back. */
function AfterTheSave({ save, mayChange }: { save: ASave; mayChange: boolean }) {
  return <>
    {save.fault ? <ErrorNote message={save.fault.message} fault={save.fault.kind === 'save' ? save.fault.fault : null} /> : null}
    {save.savedButUnread ? <button type="button" className="px-btn" disabled={!mayChange || save.busy} onClick={() => { void save.readAfterSaving() }}>{t(settingsControlWord('settings.workswitches', 'gates.readAgain'))}</button> : null}
  </>
}

// Nothing outside the office writes a change row, so a value from .env or the environment says who set it and why are
// not known, and is not drawn as a value nobody changed.
function outsideWords(source: string | null): WordKey | null {
  return source === '.env' ? 'workSwitches.outside.envFile' : source === 'the environment' ? 'workSwitches.outside.environment' : null
}

function TheLastChange({ save, last, source }: { save: ASave; last: AWorkSwitchsLastChange | null; source: string | null }) {
  if (save.savedButUnread) return null
  const outside = outsideWords(source)
  return <div className="gates-history">
    {last === null && outside !== null ? null : <p>{last === null ? t('workSwitches.noHistory')
      : t('workSwitches.last', { who: content(last.by.name ?? last.by.id), at: last.at, because: content(last.because ?? t('gates.noReason')) })}</p>}
    {outside === null ? null : <p>{t(outside)}</p>}
  </div>
}

function SkipList({ which, list, mayChange, readAgain }: { which: 'tags' | 'runs'; list: ASkipList; mayChange: boolean; readAgain: () => Promise<void> }) {
  const stored = list.entries.join('\n')
  const [value, setValue] = useState(stored)
  useEffect(() => { setValue(stored) }, [stored])
  const save = useASave(readAgain)
  // A last line break, or a box of spaces, is taken as what it plainly means: the list as written, or no list.
  const next = value.trim()
  const box = `ws-skip-${which}`
  return <section className="ws-list" data-skip-list={which}>
    <InForce save={save}>{list.entries.length === 0 ? t('workSwitches.skip.empty') : t('workSwitches.skip.count', { n: list.entries.length })}</InForce>
    <fieldset disabled={!mayChange || save.busy || save.savedButUnread}>
      <div className="ws-field">
        <label htmlFor={box}>{t(settingsControlWord('settings.workswitches', which === 'tags' ? 'workSwitches.skip.tags' : 'workSwitches.skip.runs'))}</label>
        <textarea id={box} rows={Math.min(Math.max(list.entries.length, 3), 12)} spellCheck={false} value={value} onChange={(event) => setValue(event.target.value)} />
      </div>
      <TheReason save={save} control={`workSwitches.${which}.reason`} />
      <div className="gates-actions">
        <button type="button" className="px-btn" disabled={!save.because.trim()} onClick={() => { void save.save(throughTheSettingsDoor(list.setting, next === '' ? null : next)) }}>{t(settingsControlWord('settings.workswitches', `workSwitches.${which}.save`))}</button>
      </div>
    </fieldset>
    <AfterTheSave save={save} mayChange={mayChange} />
    <TheLastChange save={save} last={list.lastChange} source={list.source} />
    <small className="gates-setting">{content(list.setting)}</small>
  </section>
}

function ChecksAtOnce({ checks, mayChange, readAgain }: { checks: TheWorkSwitches['checksAtOnce']; mayChange: boolean; readAgain: () => Promise<void> }) {
  const [value, setValue] = useState(String(checks.value))
  useEffect(() => { setValue(String(checks.value)) }, [checks.value])
  const save = useASave(readAgain)
  // The door checks the number against the bounds, so a number outside them is sent and its refusal drawn.
  const send = (checksAtOnce: number | null) => (because: string) =>
    moleOfficeRequest('/api/office/checks-in-merges-only', { method: 'POST', body: JSON.stringify({ checksAtOnce, because }) })
  return <article className="gates-row" data-work-switch="checks-at-once" aria-labelledby="ws-checks-at-once">
    <h5 id="ws-checks-at-once">{t(settingsControlWord('settings.workswitches', 'workSwitches.checks.title'))}</h5>
    <p>{t('workSwitches.checks.what')}</p>
    <InForce save={save}>{t('gates.inForce', { value: content(String(checks.value)), source: t(checks.from === 'set here' ? 'workSwitches.from.setHere' : 'workSwitches.from.default') })}</InForce>
    <fieldset disabled={!mayChange || save.busy || save.savedButUnread}>
      <label>{t(settingsControlWord('settings.workswitches', 'workSwitches.checks.bounds'), { fewest: checks.fewest, most: checks.most })}<input type="number" min={checks.fewest} max={checks.most} step={1} value={value} onChange={(event) => setValue(event.target.value)} /></label>
      <TheReason save={save} control="workSwitches.checks.reason" />
      <div className="gates-actions">
        <button type="button" className="px-btn" disabled={!save.because.trim() || !value.trim()} onClick={() => { void save.save(send(Number(value))) }}>{t(settingsControlWord('settings.workswitches', 'workSwitches.checks.save'))}</button>
        <button type="button" className="px-btn" disabled={!save.because.trim()} onClick={() => { void save.save(send(null)) }}>{t(settingsControlWord('settings.workswitches', 'workSwitches.checks.putBack'))}</button>
      </div>
    </fieldset>
    <AfterTheSave save={save} mayChange={mayChange} />
    <TheLastChange save={save} last={checks.lastChange} source={null} />
  </article>
}

function Pending({ pending, mayChange, readAgain }: { pending: TheWorkSwitches['receiptProducerPending']; mayChange: boolean; readAgain: () => Promise<void> }) {
  const save = useASave(readAgain)
  return <article className="gates-row" data-work-switch="receipt-producer-pending" aria-labelledby="ws-receipt-producer-pending">
    <h5 id="ws-receipt-producer-pending">{t('workSwitches.pending.title')}</h5>
    <p>{t('workSwitches.pending.what')}</p>
    <InForce save={save}>{pending.attempt === null ? t('workSwitches.pending.none')
      : pending.since === null ? t('workSwitches.pending.sinceUnknown', { attempt: content(pending.attempt) })
        : t('workSwitches.pending.set', { attempt: content(pending.attempt), since: pending.since })}</InForce>
    <fieldset disabled={!mayChange || save.busy || save.savedButUnread}>
      <TheReason save={save} control="workSwitches.pending.reason" />
      <div className="gates-actions">
        <button type="button" className="px-btn" disabled={!save.because.trim() || pending.attempt === null} onClick={() => { void save.save(throughTheSettingsDoor(pending.setting, null)) }}>{t(settingsControlWord('settings.workswitches', 'workSwitches.pending.clear'))}</button>
      </div>
    </fieldset>
    <AfterTheSave save={save} mayChange={mayChange} />
    <TheLastChange save={save} last={pending.lastChange} source={pending.source} />
    <small className="gates-setting">{content(pending.setting)}</small>
  </article>
}

const WORK_SWITCHES_CSS = `
.ws-list { min-width:0; display:flex; flex-direction:column; gap:var(--pad); padding-top:var(--pad); border-top:var(--border-w) solid var(--border); }
.ws-field { display:flex; flex-direction:column; gap:4px; min-width:0; max-width:36rem; }
.ws textarea { box-sizing:border-box; width:100%; min-width:0; padding:4px 8px; border:1px solid var(--border-strong); border-radius:var(--radius-sm); background:var(--panel); color:var(--text); font:var(--fs-1)/var(--lh-read) var(--font-mono); resize:vertical; }
.ws-held > .gates-row { padding:0; border:0; background:none; }
`
