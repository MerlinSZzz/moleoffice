// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useEffect, useState } from 'react'
import { content, endOfSentence, listJoined, t, type WordKey } from '@shared/i18n.ts'
import { readDayKey } from '@shared/planning.ts'
import { errorMessage, faultOf, moleOfficeRequest } from '../api.ts'
import { CodeRows } from '../lib/code-rows.tsx'
import { useLanguage } from '../lib/language.ts'
import { useInspect } from '../lib/mode.ts'
import { drawnDay, ErrorNote, Loading, Panel, useAsync } from './ui.tsx'

import type { GateCounts, GateRow, GatesReading, GateTally, TheSpoolHandedOver } from '../../server/api/runtime-settings.ts'

const readGates = () => moleOfficeRequest<GatesReading>('/api/office/gates')

/** The gates open for reading; each row can be edited in place. */
export function GatesPanel() {
  useLanguage()
  const [state, readAgain] = useAsync(readGates, [])
  return <Panel titleIs="label" declares={{ surface: 'settings.gates' }} title={t('gates.title')}>
    <style href="gates-panel" precedence="default">{GATES_CSS}</style>
    {state.status === 'loading' ? <Loading what={t('gates.loading')} />
      : state.status === 'error' ? <><p>{t('gates.readFailed')}</p><ErrorNote message={state.message} fault={state.fault} /><button className="px-btn" onClick={readAgain}>{t('gates.readAgain')}</button></>
        : <Gates first={state.value} />}
  </Panel>
}

// A group with many rows is drawn folded, with its count in the heading.
const FOLDED: ReadonlySet<string> = new Set(['who-may-act'])

function Gates({ first }: { first: GatesReading }) {
  const [reading, setReading] = useState(first)
  // What the last press that gave the spool to this office's world did. It stays after the read again, which no longer
  // shows the spool's block once this office owns the spool.
  const [handed, setHanded] = useState<{ done: TheSpoolHandedOver; readFailed: boolean } | null>(null)
  async function readAgain() { setReading(await readGates()) }
  async function afterTheHandOver(done: TheSpoolHandedOver) {
    setHanded({ done, readFailed: false })
    try { await readAgain() } catch { setHanded({ done, readFailed: true }) }
  }
  const rowsOf = (rows: GateRow[]) => rows.map((row) => <Gate key={row.id} row={row} mayChange={row.whoMayChange === 'the-person' ? reading.mayChangeThePersonsOwn : reading.mayChange} readAgain={readAgain} />)
  return <div className="gates">
    <p>{t(reading.office.kind === 'builds-mole-office' ? 'gates.defaults.builds' : 'gates.defaults.ordinary')}</p>
    {handed ? <SpoolHandedOver done={handed.done} readFailed={handed.readFailed} /> : null}
    {reading.spool ? <Spool spool={reading.spool} afterTheHandOver={afterTheHandOver} /> : null}
    {reading.classes.map((section) => <section className="gates-class" key={section.class} data-gate-class={section.class} aria-labelledby={`gates-class-${section.class}`}>
      <h3 id={`gates-class-${section.class}`}>{t(`gates.class.${section.class}` as WordKey)}</h3>
      {section.groups.length === 0 ? <p className="gates-empty">{t('gates.empty')}</p> : section.groups.map((group) => <section className="gates-group" key={group.group} data-gate-group={group.group} aria-labelledby={`gates-group-${section.class}-${group.group}`}>
        <h4 id={`gates-group-${section.class}-${group.group}`}>{FOLDED.has(group.group) ? t('gates.group.counted', { group: t(`gates.group.${group.group}` as WordKey), n: group.rows.length }) : t(`gates.group.${group.group}` as WordKey)}</h4>
        {FOLDED.has(group.group) ? <details className="gates-fold"><summary>{t('gates.fold')}</summary><div className="gates-folded">{rowsOf(group.rows)}</div></details> : rowsOf(group.rows)}
      </section>)}
    </section>)}
  </div>
}

/**
 * THE GATE-COUNT SPOOL ANOTHER WORLD OWNS, shown only while it does: which world owns it, which world this office is
 * in, and the person's press that gives it to this office's world, with the reason it writes in the spool's rejects file.
 */
function Spool({ spool, afterTheHandOver }: { spool: NonNullable<GatesReading['spool']>; afterTheHandOver: (done: TheSpoolHandedOver) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [because, setBecause] = useState('')
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  async function give() {
    if (!spool.mayPress || busy || !because.trim()) return
    setBusy(true); setFault(null)
    let done: TheSpoolHandedOver
    try {
      done = await moleOfficeRequest<TheSpoolHandedOver>('/api/office/gate-count-spool/hand-over', { method: 'POST', body: JSON.stringify({ saw: spool.itsWorld, because: because.trim() }) })
    } catch (error) {
      setFault({ message: errorMessage(error), fault: faultOf(error) })
      setBusy(false)
      return
    }
    setBecause(''); setEditing(false)
    await afterTheHandOver(done)
    setBusy(false)
  }
  return <section className="gates-spool" data-gate-spool aria-labelledby="gates-spool-title">
    <h3 id="gates-spool-title">{t('gates.spool.title')}</h3>
    <CodeRows rows={[{ label: 'gates.spool.row.folder', value: spool.folder }, { label: 'gates.spool.row.belongsTo', value: spool.itsWorld }, { label: 'gates.spool.row.thisOffice', value: spool.thisWorld }]} />
    <p>{t('gates.spool.what')}</p>
    <p>{t('gates.spool.who')}</p>
    {!editing ? <button type="button" className="px-btn" disabled={!spool.mayPress} onClick={() => setEditing(true)}>{t('pagesFromSettings.edit')}</button> : <fieldset disabled={!spool.mayPress || busy}>
      <label>{t('gates.spool.reason')}<input value={because} required maxLength={500} onChange={(event) => setBecause(event.target.value)} /></label>
      <div className="gates-actions">
        <button type="button" className="px-btn" disabled={!because.trim()} onClick={() => { void give() }}>{t('gates.spool.give')}</button>
        <button type="button" className="px-btn" onClick={() => { setEditing(false); setBecause(''); setFault(null) }}>{t('pagesFromSettings.stopEditing')}</button>
      </div>
    </fieldset>}
    {fault ? <ErrorNote message={fault.message} fault={fault.fault} /> : null}
  </section>
}

/** What the press did, in the page's words: who reads the spool now, and from where this office counts each day file. */
function SpoolHandedOver({ done, readFailed }: { done: TheSpoolHandedOver; readFailed: boolean }) {
  const files = (way: TheSpoolHandedOver['countingFrom'][number]['way']) => done.countingFrom.filter((one) => one.way === way).map((one) => content(one.file))
  const fromThePress = files('starts at the press'), fromARow = files('continues from this office\'s row')
  return <div className="gates-spool-done" role="status" data-gate-spool-handed-over>
    <p>{done.readsItNow ? t('gates.spool.given', { ours: content(done.givenTo) }) : t('gates.spool.takenBack')}</p>
    {fromThePress.length > 0 ? <p>{t('gates.spool.startsAtThePress', { files: listJoined(fromThePress) })}</p> : null}
    {fromARow.length > 0 ? <p data-gate-spool-read-before>{t('gates.spool.readBefore', { files: listJoined(fromARow) })}</p> : null}
    {readFailed ? <p>{t('gates.spool.givenButUnread')}</p> : null}
  </div>
}

const POSITION_WORDS: Readonly<Record<string, WordKey>> = { block: 'gates.positions.block', remind: 'gates.positions.remind', off: 'gates.positions.off' }

const NUMBER_LABELS: Readonly<Record<string, WordKey>> = {
  'test-batch-disk-limit': 'gates.gigabytesFree',
  'release-spacing': 'dev.runtime.minutes',
  'counter-spacing': 'dev.runtime.minutes',
  'conflict-minutes': 'dev.runtime.minutes',
  'a-new-server-has-to-answer-within': 'dev.usage.secondsLabel',
  'migrations-have-to-finish-within': 'dev.usage.secondsLabel',
}

function position(row: GateRow, value: string | null): string {
  if (value === null) return t('gates.unknown')
  if (row.positions.kind === 'switch' && (value === '1' || value === '0')) return t(value === '1' ? 'gates.on' : 'gates.off')
  if (row.positions.kind === 'block-remind-off' && row.positions.allowed.some((one) => one === value)) return t(POSITION_WORDS[value]!)
  return content(value)
}

export function sourceWords(source: string): string {
  switch (source) {
    case 'the built-in default': return t('gates.source.default')
    case '.env': return t('gates.source.envFile')
    case 'the environment': return t('gates.source.environment')
    case 'nothing set it': return t('gates.source.unset')
    case 'not read': return t('gates.source.notRead')
    case 'unreadable': return t('gates.source.unreadable')
    case 'the office database': return t('gates.source.saved')
    default: return content(source)
  }
}

// Nothing outside the office writes a change row, so a position from .env or the environment says who set it and why
// are not known, and is not drawn as a gate nobody changed.
function outsideWords(source: string): WordKey | null {
  return source === '.env' ? 'gates.outside.envFile' : source === 'the environment' ? 'gates.outside.environment' : null
}

/** A day the reading gives as YYYY-MM-DD, in the page's own words. */
function theDay(day: string): string {
  const when = readDayKey(day)
  return when === null ? content(day) : drawnDay(when)
}

/** The clauses a row with three positions counted, in the row's own terms. */
function theTally(row: GateRow, tally: GateTally): string {
  const parts = [t('gates.count.wouldStop', { n: tally.wouldStop })]
  if (row.positions.kind === 'block-remind-off' && row.positions.allowed.some((one) => one === 'block')) parts.push(t('gates.count.stopped', { n: tally.stopped }))
  parts.push(t('gates.count.reminded', { n: tally.reminded }))
  return listJoined(parts) + endOfSentence()
}

function onePeriod(label: WordKey, row: GateRow, tally: GateTally): string {
  const parts = row.positions.kind === 'block-remind-off' ? theTally(row, tally) : t(`gates.count.${row.id}` as WordKey, { n: tally.wouldStop })
  return t(label, { parts })
}

function GateCounts({ row }: { row: GateRow }) {
  const counts: GateCounts | null = row.counts
  // A spool row the spool waits for says it is not counted, in place of the spool's sentence (wave 13r round AG). The
  // reason after it was taken out in wave 13y's round 121.
  const waits = row.notCountedBecause
  return <>
    {waits !== null ? <p>{t('gates.count.notCounted')}</p> : null}
    {counts === null ? (waits !== null ? null : <p>{t(row.countedBy === 'nobody' ? 'gates.count.nobody' : 'gates.notCounted')}</p>) : <>
      <p>{t('gates.countedSince', { day: theDay(counts.began) })}</p>
      <p>{onePeriod('gates.count.lastThirtyDays', row, counts.lastThirtyDays)}</p>
      <p>{onePeriod('gates.count.sinceCountingBegan', row, counts.sinceCountingBegan)}</p>
      {row.positions.kind === 'block-remind-off' ? (row.looksAgain === 'at-the-seal' ? <>
        <p>{t('gates.count.lastThirtyDays', { parts: t('gates.count.atTheSeal', { stillFound: counts.lastThirtyDays.ignored, gone: counts.lastThirtyDays.heeded }) })}</p>
        <p>{t('gates.count.sinceCountingBegan', { parts: t('gates.count.atTheSeal', { stillFound: counts.sinceCountingBegan.ignored, gone: counts.sinceCountingBegan.heeded }) })}</p>
        <p>{t('gates.count.atTheSealMeaning')}</p>
      </> : <p>{t('gates.count.ignoredUnknown')}</p>) : null}
    </>}
    {row.countedBy === 'the-merge-tool' ? <p>{t('gates.count.mergeTool')}</p> : null}
    {row.countedBy === 'the-release-tool' ? <p>{t('gates.count.releaseTool')}</p> : null}
    {row.countedBy === 'the-sandbox-spool' && waits === null ? <p>{t('gates.count.sandboxSpool')}</p> : null}
  </>
}

/** One gate's row opens for reading and edits only itself. */
export function Gate({ row, mayChange, readAgain, settingsControlPrefix }: { row: GateRow; mayChange: boolean; readAgain: () => Promise<void>; settingsControlPrefix?: 'workSwitches.held' }) {
  const controlWord = (part: string, fallback: WordKey): WordKey => settingsControlPrefix === undefined ? fallback : settingsControlWord('settings.workswitches', `${settingsControlPrefix}.${part}`)
  const [editing, setEditing] = useState(false)
  // The setting's name is machinery, so only a developer sees it (wave 13y round 121).
  const developer = useInspect()
  const [value, setValue] = useState(row.value ?? '')
  useEffect(() => { setValue(row.value ?? '') }, [row.value])
  const [because, setBecause] = useState('')
  const [until, setUntil] = useState('')
  const [busy, setBusy] = useState(false)
  const [savedButUnread, setSavedButUnread] = useState(false)
  const [fault, setFault] = useState<{ kind: 'save' | 'read'; message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  async function readAfterSaving() {
    setBusy(true); setFault(null)
    try { await readAgain(); setSavedButUnread(false) }
    catch (error) { const fault = faultOf(error); setFault({ kind: 'read', message: fault?.said ?? errorMessage(error), fault }) }
    finally { setBusy(false) }
  }
  async function save(next: string | null) {
    if (!mayChange || busy || savedButUnread || !because.trim()) return
    setBusy(true); setFault(null)
    try {
      await moleOfficeRequest('/api/office/settings', { method: 'POST', body: JSON.stringify({ changes: [{ name: row.setting, value: next, ...(until.trim() ? { until: until.trim() } : {}) }], because: because.trim() }) })
    } catch (error) {
      setFault({ kind: 'save', message: errorMessage(error), fault: faultOf(error) })
      setBusy(false)
      return
    }
    setBecause(''); setUntil(''); setSavedButUnread(true); setEditing(false)
    await readAfterSaving()
  }
  const last = row.lastChange
  const outside = outsideWords(row.source)
  const untilHelp = `gates-until-help-${row.id}`
  return <article className="gates-row" data-gate={row.id} aria-labelledby={`gates-row-${row.id}`}>
    <h5 id={`gates-row-${row.id}`}>{t(`gates.row.${row.id}` as WordKey)}</h5>
    {savedButUnread ? <p role="status">{t(fault?.kind === 'read' ? 'gates.savedReadFailed' : 'gates.savedReading')}</p> : <p className="gates-position">{t('gates.inForce', { value: position(row, row.value), source: sourceWords(row.source) })}</p>}
    {!savedButUnread && row.unreadable ? <ErrorNote message={row.unreadable} /> : null}
    <p>{t(row.whoMayChange === 'the-person' ? 'gates.whoThePerson' : 'gates.who')}</p>
    {row.ownerDecided ? <p>{t('runtimeSettings.decided')}</p> : null}
    {!editing && !savedButUnread ? <button type="button" className="px-btn" aria-describedby={`gates-row-${row.id}`} disabled={!mayChange} onClick={() => setEditing(true)}>{t(controlWord('edit', 'pagesFromSettings.edit'))}</button> : null}
    {editing ? <fieldset disabled={!mayChange || busy || savedButUnread}>
      <legend>{t(row.positions.kind === 'number' ? (NUMBER_LABELS[row.id] ?? 'gates.value') : controlWord('position', 'gates.position'))}</legend>
      {row.positions.kind === 'number' ? <label>{t('gates.bounds', { fewest: row.positions.fewest, most: row.positions.most })}<input type="number" min={row.positions.fewest} max={row.positions.most} step={1} value={value} onChange={(event) => setValue(event.target.value)} /></label>
        : <div className="gates-actions">{(row.positions.kind === 'switch' ? ['1', '0'] : row.positions.allowed).map((next) => <button type="button" className="px-btn" key={next} aria-pressed={value === next} onClick={() => setValue(next)}>{settingsControlPrefix !== undefined && row.positions.kind === 'switch' ? t(controlWord(next === '1' ? 'on' : 'off', next === '1' ? 'gates.on' : 'gates.off')) : position(row, next)}</button>)}</div>}
      <label>{t(controlWord('reason', 'gates.reason'))}<input value={because} required maxLength={500} onChange={(event) => setBecause(event.target.value)} /></label>
      <label>{t(controlWord('until', 'gates.until'))}<input value={until} placeholder="YYYY-MM-DD HH:MM" aria-describedby={untilHelp} onChange={(event) => setUntil(event.target.value)} /></label>
      <p className="gates-help" id={untilHelp}>{t('gates.untilHelp')}</p>
      <div className="gates-actions">
        <button type="button" className="px-btn" disabled={!because.trim() || !value.trim()} onClick={() => { void save(value) }}>{t(controlWord('save', 'gates.save'))}</button>
        <button type="button" className="px-btn" disabled={!because.trim()} onClick={() => { void save(null) }}>{t(controlWord('putBack', 'gates.putBack'))}</button>
        <button type="button" className="px-btn" onClick={() => { setEditing(false); setValue(row.value ?? ''); setBecause(''); setUntil(''); setFault(null) }}>{t(controlWord('stopEditing', 'pagesFromSettings.stopEditing'))}</button>
      </div>
    </fieldset> : null}
    {fault ? <ErrorNote message={fault.message} fault={fault.kind === 'save' ? fault.fault : null} /> : null}
    {savedButUnread ? <button type="button" className="px-btn" disabled={!mayChange || busy} onClick={() => { void readAfterSaving() }}>{t(settingsControlPrefix === undefined ? 'gates.readAgain' : settingsControlWord('settings.workswitches', 'gates.readAgain'))}</button> : null}
    {savedButUnread ? null : <div className="gates-history">
      <GateCounts row={row} />
      {last === null && outside !== null ? null : <p>{last === null ? t(row.source === 'the built-in default' ? 'gates.noHistory' : 'gates.noHistoryOther') : last.ranOut
        ? t('gates.officePutBack', { to: position(row, last.to), at: last.at, until: last.until ?? t('gates.unknown') })
        : t('gates.last', { who: content(last.by.name ?? last.by.id), at: last.at, from: position(row, last.from), to: position(row, last.to), because: content(last.because ?? t('gates.noReason')) })}</p>}
      {last !== null && !last.ranOut && last.until !== null ? <p>{t('gates.untilWas', { until: last.until })}</p> : null}
      {row.ranOut ? <p>{t('gates.ranOut', { until: row.ranOut.until, value: position(row, row.value), source: sourceWords(row.source) })}</p> : null}
      {outside === null ? null : <p>{t(outside)}</p>}
    </div>}
    {developer ? <small className="gates-setting">{content(row.setting)}</small> : null}
  </article>
}

export const GATES_CSS = `
.gates { min-width:0; display:flex; flex-direction:column; gap:var(--gut); }
.gates p { margin:0; overflow-wrap:anywhere; }
.gates-class,.gates-group { min-width:0; display:flex; flex-direction:column; gap:var(--pad); }
.gates h3,.gates h4,.gates h5 { margin:0; color:var(--text); overflow-wrap:anywhere; }
.gates h3 { font:600 var(--fs-4)/var(--lh-tight) var(--font-ui); }
.gates h4 { font:600 var(--fs-3)/var(--lh-tight) var(--font-ui); }
.gates h5 { font:600 var(--fs-2)/var(--lh-read) var(--font-ui); }
.gates-row { min-width:0; padding:var(--gut); border:var(--border-w) solid var(--border); border-radius:var(--radius); background:var(--panel-2); display:flex; flex-direction:column; gap:var(--pad); }
.gates fieldset { border:0; padding:0; margin:0; min-width:0; display:flex; flex-direction:column; gap:var(--pad); }
.gates legend { padding:0; margin-bottom:var(--pad); }
.gates label { display:flex; flex-direction:column; gap:4px; min-width:0; max-width:36rem; overflow-wrap:anywhere; }
.gates input { box-sizing:border-box; width:100%; min-width:0; min-height:36px; padding:4px 8px; border:1px solid var(--border-strong); border-radius:var(--radius-sm); background:var(--panel); color:var(--text); font:inherit; }
.gates input[type=number] { max-width:8rem; }
.gates-actions { display:flex; flex-wrap:wrap; gap:var(--pad); }
.gates .px-btn { min-height:36px; white-space:normal; }
.gates-row > .px-btn, .gates-spool > .px-btn { align-self:start; }
.gates .px-btn[aria-pressed=true] { border-color:var(--chosen-edge); color:var(--chosen-ink); background:var(--chosen-bg); box-shadow:var(--chosen-shadow); }
.gates-empty,.gates-help,.gates-history,.gates-setting { color:var(--text-2); font-size:var(--fs-1); line-height:var(--lh-read); }
.gates-history { display:flex; flex-direction:column; gap:4px; }
.gates-fold > summary { cursor:pointer; width:fit-content; min-height:36px; display:flex; align-items:center; color:var(--text-2); }
.gates-fold > summary::before { content:"▸"; display:inline-block; width:1.1rem; color:var(--text-3); }
.gates-fold[open] > summary::before { content:"▾"; }
.gates-fold > summary:hover { color:var(--text); }
.gates-fold > summary:focus-visible { outline:var(--focus-w) solid var(--focus); outline-offset:var(--focus-offset); }
.gates-folded { min-width:0; display:flex; flex-direction:column; gap:var(--pad); margin-top:var(--pad); }
.gates-setting { overflow-wrap:anywhere; }
.gates-spool,.gates-spool-done { min-width:0; padding:var(--gut); border:var(--border-w) solid var(--border-strong); border-radius:var(--radius); background:var(--panel-2); display:flex; flex-direction:column; gap:var(--pad); }
`
