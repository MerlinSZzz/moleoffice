// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE'S RUNTIME CONTROLS, AND THE ONE PART OF THEM THAT REACHES A NORMAL-MODE READER.
 *
 * The Office controls panel is drawn only in Developer mode, on its own page (src/web/pages/OfficeControlsPage.tsx,
 * since wave 13y round 125; before that it was a developer-only panel on Settings). A saved value this release
 * refuses is the person's own data, so RefusedSavedSettings draws that one notice in Normal mode, under the Settings
 * page's title, and the rest of the panel stays in Developer mode. One component, RefusedSavedValue, draws the notice
 * wherever it appears, and one function, saveASetting, sends the write both presses make.
 */
import {OfficePauseControls} from './OfficePauseControls.tsx'
import { useState } from 'react'
import { settingsPath } from '@shared/addresses.ts'
import { WORK_SWITCH_SETTINGS } from '@shared/work-switches.mjs'
import { pathFor, RouteLink, recordPath } from './router.tsx'
import { content, t, type WordKey } from '@shared/i18n.ts'
import { settingsControlWord } from '@shared/settings-declaration.ts'
import { api, errorMessage, faultOf } from '../api.ts'
import { ErrorNote, Loading, Panel, useAsync } from './ui.tsx'
import type { RuntimeSettingsReply } from '../../server/api/runtime-settings.ts'

export function OfficeControls() {
  const [state] = useAsync(() => api.officeSettings(), [])
  if (state.status === 'loading') return <Loading what={t('runtimeSettings.loading')} />
  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault} />
  return <Panel titleIs="label" declares={{ surface: 'settings.officecontrols' }} title={t('runtimeSettings.title')}><OfficeControlStyle /><Controls first={state.value} /></Panel>
}
/**
 * THE LOOK THE PANEL AND THE NORMAL-MODE BLOCK SHARE, WRITTEN ONCE AND DRAWN UNDER EACH ONE'S OWN CLASS
 * (invariant 9 in src/config/rules/USER.md). A change to a rule here reaches both drawings, so the notice, the
 * reason field and the press cannot drift apart. `{prefix}` in each is filled with `.orc` for the panel and
 * `.orc-rss` for the block by withPrefix below.
 */
const A_FIELD = `max-width:100%;width:100%;box-sizing:border-box;min-height:32px;background:var(--panel);color:var(--text);border:1px solid var(--border-strong);padding:4px`
const THE_NOTICE_LOOK = `{prefix} .orc-refused{margin:.6rem 0;padding:var(--pad);border:var(--border-w) solid var(--st-blocked-line);border-left:var(--rail) solid var(--st-blocked);border-radius:var(--radius);background:var(--st-blocked-bg)}{prefix} .orc-refused p{margin:0 0 .4rem}`
const THE_FIELD_AND_PRESS_LOOK = `{prefix} label{display:block;margin:.6rem 0}{prefix} input{${A_FIELD}}{prefix} button{margin:.4rem .6rem .4rem 0;min-height:32px}`
function withPrefix(prefix: string, look: string): string { return look.split('{prefix}').join(prefix) }
function OfficeControlStyle() {return <style href="office-controls" precedence="default">{`.orc{margin-top:1rem;min-width:0}.orc details{border-top:1px solid var(--border);padding:.75rem 0}.orc summary{cursor:pointer;overflow-wrap:anywhere}${withPrefix('.orc', THE_FIELD_AND_PRESS_LOOK)}.orc select{${A_FIELD}}.orc p{overflow-wrap:anywhere}.orc small{display:block;overflow-wrap:anywhere;opacity:.75}.orc .orc-actions{display:flex;flex-wrap:wrap}${withPrefix('.orc', THE_NOTICE_LOOK)}`}</style>}
// THE BLOCK A NORMAL-MODE SETTINGS PAGE DRAWS FOR SAVED VALUES THIS RELEASE REFUSES. It stands beside
// OfficeControlStyle and draws the notice, the reason field and the press from the same rules, written once above
// and filled with this drawing's own class, so the refusal reads and stays dressed the same wherever it is drawn.
function OfficeRefusedSavedStyle() {return <style href="office-refused-saved" precedence="default">{`.orc-rss{margin:0 0 var(--gut);min-width:0;display:flex;flex-direction:column;gap:var(--pad)}.orc-rss h2{margin:0;color:var(--text);font:600 var(--fs-4)/var(--lh-tight) var(--font-ui);overflow-wrap:anywhere}.orc-rss [data-setting]{min-width:0;padding:var(--pad);border:var(--border-w) solid var(--border);border-radius:var(--radius);background:var(--panel-2)}.orc-rss p{margin:.4rem 0;overflow-wrap:anywhere}${withPrefix('.orc-rss', THE_FIELD_AND_PRESS_LOOK)}${withPrefix('.orc-rss', THE_NOTICE_LOOK)}`}</style>}
// THE LINE A SETTING'S ROW DRAWS ABOUT WHEN A CHANGE TO IT IS USED. A setting the office does not use says what reads
// it instead (wave 13r round 16, item A). The development checkout is set only by what starts the stable office, and
// Restart keeps it, so it has its own line (wave 13q round 12). A setting the server gives a place says what that place
// means (round 18, item 2). Exported so a test reads the line the page draws.
export function whenAChangeIsUsed(s: Pick<RuntimeSettingsReply['settings'][number], 'name' | 'restartRequired' | 'usedOutsideTheOffice' | 'place'>): string {
  if (s.name === 'MOLE_OFFICE_WINDOW_DEBUGGING') return t('runtimeSettings.nextWindow')
  if (s.name === 'MOLE_OFFICE_TERMINAL_HOLDER') return t('runtimeSettings.nextService')
  if (s.name === 'MOLE_OFFICE_DEVELOPMENT_CHECKOUT') return t('runtimeSettings.startOfTheStableOffice')
  if (s.usedOutsideTheOffice === 'a tool') return t('runtimeSettings.aTool')
  if (s.usedOutsideTheOffice === 'the web development server') return t('runtimeSettings.webDevelopmentServer')
  if (s.place === "the office's start") return t('runtimeSettings.officeStart')
  if (s.place === 'the first owner') return t('runtimeSettings.firstOwner')
  if (s.place === "the office's starter") return t('runtimeSettings.setByTheStarter')
  if (s.place === "a run's starter") return t('runtimeSettings.setForARun')
  if (s.place === 'the merge tool') return t('runtimeSettings.mergeTool')
  return s.restartRequired ? t('runtimeSettings.restart') : t('runtimeSettings.hot')
}
function faultFromThrown(error: unknown) { return { message: errorMessage(error), fault: faultOf(error) } }
function Controls({ first }: { first: RuntimeSettingsReply }) {
  const [reading, setReading] = useState(first)
  const [query, setQuery] = useState('')
  const [all, setAll] = useState(false)
  // A ROW WHOSE SAVED VALUE THIS RELEASE REFUSES IS OPEN WHEN THE PAGE IS FIRST DRAWN, so its notice is read without a
  // press. The set is kept from the first reading, so the row stays open after the press that puts the value right.
  const [refusedAtFirst] = useState(() => new Set(first.settings.filter((s) => s.storedButRefused !== null).map((s) => s.name)))
  return <section className="orc">
    <label>{t('runtimeSettings.find')}<input value={query} onChange={(e) => setQuery(e.target.value)} /></label>
    <label><input type="checkbox" style={{ width: 'auto' }} checked={all} onChange={(e) => setAll(e.target.checked)} /> {t('runtimeSettings.all')}</label>
    {reading.settings.filter((s) => (all || s.writable) && [t(`settingsWords.${s.name}` as WordKey, s.whatValues), s.name].join(' ').toLowerCase().includes(query.toLowerCase())).map((s) => s.gate !== null ? <p key={s.name} className="orc-gate" data-setting={s.name}><RouteLink to={pathFor('gates')}>{t('gates.moved')}</RouteLink></p> : WORK_SWITCH_SETTINGS.includes(s.name) ? <p key={s.name} className="orc-gate" data-setting={s.name}><RouteLink to={settingsPath('settings.workswitches')}>{t('workSwitches.moved')}</RouteLink></p> : <details key={s.name} className="orc-setting" data-setting={s.name} open={refusedAtFirst.has(s.name) || undefined}>
      <summary><span>{t(`settingsWords.${s.name}` as WordKey, s.whatValues)}</span> <small>{t('runtimeSettings.now', { value: s.currentValue ?? t('runtimeSettings.unset'), source: s.currentSource })}</small></summary>
      <small>{content(s.name)}</small>
      {s.pendingRestart ? <p>{t('runtimeSettings.pending', {value:s.value??t('runtimeSettings.unset'),source:s.source})}</p> : null}
      {s.unreadable ? <ErrorNote message={s.unreadable} /> : null}
      <p>{whenAChangeIsUsed(s)}</p>
      {s.writable ? <SettingControl key={`${s.name}:${s.chosen}`} setting={s} updated={setReading} /> : <p>{t('runtimeSettings.readOnly')}</p>}
    </details>)}
  </section>
}
// A PRESS IN A SETTING ROW WEARS THE SHARED BUTTON LOOK of ui.tsx, so it reads as a press and not as a sentence.
// It stays a native disabled button while it cannot be pressed, and aria-disabled beside it draws that look's unavailable state.
function Press({ off, onPress, children }: { off: boolean; onPress: () => void; children: string }) {
  return <button className="px-btn" disabled={off} aria-disabled={off || undefined} onClick={onPress}>{children}</button>
}
// A SAVED VALUE THIS RELEASE REFUSES, AS ONE NOTICE: the two sentences, and the one press that puts the value
// right. The row in the Office controls panel draws it, and so does RefusedSavedSettings in Normal mode. The press
// is Reset where the setting has a shipped value, and Remove where it has none, and it is off until a reason is
// written. The reason is the notice's own press to send, not the change's own text: both presses send one write.
function RefusedSavedValue({ setting: s, because, busy, putRight }: {
  setting: RuntimeSettingsReply['settings'][number]
  because: string
  busy: boolean
  putRight: (value: string | null) => void
}) {
  const refused = s.storedButRefused
  const shipped = s.shippedValue
  if (refused === null) return null
  return <div role="status" className="orc-refused" data-stored-refused="">
    <p>{t('runtimeSettings.storedRefused', { value: refused.value })} {content(refused.reason)}</p>
    {shipped !== null ? <p>{t('runtimeSettings.storedRefusedShipped', { value: shipped })}</p> : null}
    {shipped !== null
      ? <Press off={busy || !because.trim()} onPress={() => { putRight(shipped) }}>{t('runtimeSettings.reset')}</Press>
      : <Press off={busy || !because.trim()} onPress={() => { putRight(null) }}>{t('runtimeSettings.remove')}</Press>}
  </div>
}
/** THE ONE WRITE A PRESS ON A SETTING MAKES, wherever the press is drawn: the row's own presses, and the notice's. */
function saveASetting(name: string, value: string | null, decision: string | null, because: string): Promise<RuntimeSettingsReply> {
  return api.officeSettings({ changes: [{ name, value, decision }], because })
}
function SettingControl({ setting: s, updated }: { setting: RuntimeSettingsReply['settings'][number]; updated: (next: RuntimeSettingsReply) => void }) {
  const [value, setValue] = useState(s.value ?? '')
  const [because, setBecause] = useState('')
  const [busy, setBusy] = useState(false)
  const [decision, setDecision] = useState(s.decision?.id ?? '')
  const [decisionQuery, setDecisionQuery] = useState('')
  const [decisions, setDecisions] = useState<{id:string;title:string}[]>(s.decision ? [{id:s.decision.id,title:s.decision.title??t('runtimeSettings.unset')}] : [])
  const [fault, setFault] = useState<ReturnType<typeof faultFromThrown> | null>(null)
  async function save(next: string | null) {
    setBusy(true); setFault(null)
    try { updated(await saveASetting(s.name, next, decision||null, because)); setBecause('') }
    catch (error) { setFault(faultFromThrown(error)) }
    finally { setBusy(false) }
  }
  const refused = s.storedButRefused
  // THE PRESS THAT PUTS A REFUSED SAVED VALUE RIGHT is drawn by RefusedSavedValue, and not again in the row of
  // presses: Reset where the setting has a shipped value, and Remove where it has none. inTheNotice names the one
  // the notice holds, so the row leaves that press out.
  const inTheNotice = refused === null ? null : s.shippedValue !== null ? 'reset' : 'remove'
  const reset = s.shippedValue !== null ? <Press off={busy || !because.trim()} onPress={() => { void save(s.shippedValue) }}>{t('runtimeSettings.reset')}</Press> : null
  const remove = <Press off={busy || !because.trim()} onPress={() => { void save(null) }}>{t('runtimeSettings.remove')}</Press>
  const last = s.lastChange
  const previous = last?.from ? JSON.parse(last.from) as { value?: string; effective?: {days:number;count:number} } : null
  const oldValue = previous?.value ?? (previous?.effective ? String(s.name.endsWith('_DAYS') ? previous.effective.days : previous.effective.count) : t('runtimeSettings.unset'))
  return <>
    <p>{s.ownerDecided ? t('runtimeSettings.decided') : t('runtimeSettings.ordinary')}</p>
    {s.decision ? <p><RouteLink to={recordPath(s.decision.id)}>{content(s.decision.title)}</RouteLink></p> : null}
    <label>{t('runtimeSettings.value')}<input value={value} onChange={(e) => setValue(e.target.value)} /></label>
    <label>{t('runtimeSettings.reason')}<input value={because} onChange={(e) => setBecause(e.target.value)} maxLength={500} /></label>
    <details><summary>{t('deadLetterThresholds.decision')}</summary>
      <label>{t(settingsControlWord('settings.restart', 'officeRestart.searchDecision'))}<input value={decisionQuery} onChange={(e)=>setDecisionQuery(e.target.value)} /></label>
      <button onClick={()=>{void api.search(decisionQuery,'decision',10,'all').then((r)=>setDecisions(r.results.map((m)=>({id:m.record.id,title:m.record.title})))).catch((e)=>setFault(faultFromThrown(e)))}}>{t(settingsControlWord('settings.restart', 'officeRestart.findDecision'))}</button>
      <label>{t(settingsControlWord('settings.restart', 'officeRestart.decision'))}<select aria-label={t(settingsControlWord('settings.restart', 'officeRestart.decision'))} value={decision} onChange={(e)=>setDecision(e.target.value)}><option value="">{t('runtimeSettings.unset')}</option>{decisions.map((d)=><option key={d.id} value={d.id}>{content(d.title)}</option>)}</select></label>
    </details>
    {refused !== null ? <RefusedSavedValue setting={s} because={because} busy={busy} putRight={(next) => { void save(next) }} /> : null}
    <div className="orc-actions"><Press off={busy || (!s.allowsEmpty && !value.trim()) || !because.trim()} onPress={() => { void save(value) }}>{t('runtimeSettings.save')}</Press>
    {inTheNotice === 'reset' ? null : reset}
    {inTheNotice === 'remove' ? null : remove}</div>
    {fault ? <ErrorNote message={fault.message} fault={fault.fault} /> : null}
    <p>{last ? t('runtimeSettings.last', { who: last.by.name ?? t('runtimeSettings.unset'), when: last.at, from: oldValue, to: s.value ?? t('runtimeSettings.unset'), because: s.because ?? t('runtimeSettings.unset') }) : t('runtimeSettings.noHistory')}</p>
  </>
}

/**
 * THE SAVED VALUES THIS RELEASE REFUSES, DRAWN IN NORMAL MODE. The person's own saved value is the one part of
 * the Office controls panel that must reach them: the panel is drawn only in Developer mode, and a refusal that
 * touches the person's own data must reach the person. It is a plain section rather than a Panel, and it declares
 * no surface: a Normal-mode element naming the developer-only surface would make the Settings page's own
 * four-checks test untrue.
 *
 * While the reading is loading it draws nothing. When no setting has storedButRefused it draws nothing. Otherwise
 * it names each refused setting by its own description, with its own reason field and the shared notice; a
 * setting's part goes when its press succeeds, and when none is left the block goes.
 */
export function RefusedSavedSettings() {
  const [state] = useAsync(() => api.officeSettings(), [])
  if (state.status === 'loading') return null
  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault} />
  return <RefusedSavedSettingsReading first={state.value} />
}
/** The id of the Normal-mode block's title, which its section points at with aria-labelledby. */
const REFUSED_SAVED_TITLE_ID = 'set-refused-saved-title'
function RefusedSavedSettingsReading({ first }: { first: RuntimeSettingsReply }) {
  const [reading, setReading] = useState(first)
  const refused = reading.settings.filter((s) => s.storedButRefused !== null)
  if (refused.length === 0) return null
  return <section className="orc-rss" aria-labelledby={REFUSED_SAVED_TITLE_ID} data-refused-saved-settings="">
    <OfficeRefusedSavedStyle />
    <h2 id={REFUSED_SAVED_TITLE_ID}>{t('runtimeSettings.storedRefusedTitle')}</h2>
    {refused.map((s) => <RefusedSavedSetting key={s.name} setting={s} updated={setReading} />)}
  </section>
}
/** One refused setting in the Normal-mode block: its description, its reason, and the notice whose press puts it right. */
function RefusedSavedSetting({ setting: s, updated }: { setting: RuntimeSettingsReply['settings'][number]; updated: (next: RuntimeSettingsReply) => void }) {
  const [because, setBecause] = useState('')
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<ReturnType<typeof faultFromThrown> | null>(null)
  async function putRight(next: string | null) {
    setBusy(true); setFault(null)
    try { updated(await saveASetting(s.name, next, s.decision?.id ?? null, because)); setBecause('') }
    catch (error) { setFault(faultFromThrown(error)) }
    finally { setBusy(false) }
  }
  return <div data-setting={s.name}>
    <p>{t(`settingsWords.${s.name}` as WordKey, s.whatValues)}</p>
    <label>{t('runtimeSettings.reason')}<input value={because} onChange={(e) => setBecause(e.target.value)} maxLength={500} /></label>
    <RefusedSavedValue setting={s} because={because} busy={busy} putRight={(next) => { void putRight(next) }} />
    {fault ? <ErrorNote message={fault.message} fault={fault.fault} /> : null}
  </div>
}
export function RestartControls() {
  const [state] = useAsync(() => api.restartState(), [])
  const [reading, setReading] = useState<Awaited<ReturnType<typeof api.restartState>> | null>(null)
  const [because, setBecause] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<ReturnType<typeof faultFromThrown> | null>(null)
  const current = reading ?? (state.status === 'ready' ? state.value : null)
  async function restart() {
    setBusy(true); setFault(null)
    try {
      const accepted = await api.restartOffice(because)
      if (typeof accepted.instance !== 'string' || !accepted.instance.trim()) throw new Error(t('officeRestart.noInstance'))
      setStatus(t('officeRestart.waiting'))
      const deadline = Date.now() + 120_000
      // A request was accepted; only a new response after a short gap confirms the office is back.
      await new Promise((resolve) => setTimeout(resolve, 1500))
      for (;;) {
        try { const next = await api.restartState(AbortSignal.timeout(5000)); if (next.instance !== accepted.instance) { setReading(next); setStatus(t('officeRestart.back')); break }; throw new Error('The same server still answers.') }
        catch (error) { if (Date.now() >= deadline) { setStatus(t('officeRestart.notBack')); break }; await new Promise((resolve) => setTimeout(resolve, 1000)) }
      }
    } catch (error) { setFault(faultFromThrown(error)) }
    finally { setBusy(false) }
  }
  return <Panel titleIs="label" declares={{ surface: 'settings.restart' }} title={t('officeRestart.title')}><OfficeControlStyle /><section className="orc orc-restart">
    <p>{current?.mode === 'checkout' ? t('officeRestart.checkout') : current?.mode === 'installed' ? t('officeRestart.installed') : t('officeRestart.unavailable')}</p>
    <label>{t(settingsControlWord('settings.restart', 'officeRestart.reason'))}<input value={because} onChange={(e) => setBecause(e.target.value)} maxLength={500} /></label>
    <button disabled={busy || !because.trim() || !current?.mode} onClick={() => { void restart() }}>{t(settingsControlWord('settings.restart', 'officeRestart.press'))}</button>
    <button disabled={busy} onClick={() => { void api.restartState().then(setReading).catch((e) => setFault(faultFromThrown(e))) }}>{t(settingsControlWord('settings.restart', 'officeRestart.read'))}</button>
    {status ? <p role="status">{content(status)}</p> : null}{fault ? <ErrorNote message={fault.message} fault={fault.fault} /> : null}
    <OfficePauseControls />
    <h4>{t('officeRestart.grants')}</h4>
    {current?.grants.length ? current.grants.map((g) => <p key={g.agent.id}>{t('officeRestart.grant', { agent: g.agent.name ?? t('runtimeSettings.unset'), decision: g.decision.title ?? t('runtimeSettings.unset'), state: g.live ? t('officeRestart.live') : t('officeRestart.expired') })}</p>) : <p>{t('officeRestart.onlyOwner')}</p>}
    <GrantControl updated={() => { void api.restartState().then(setReading).catch((e) => setFault(faultFromThrown(e))) }} />
    <details><summary>{t('officeRestart.history')}</summary>{current?.history.map((h,i)=>{const after=h.to===null?null:JSON.parse(h.to) as {decision?:string|null;because?:string};return <p key={i}>{t('officeRestart.historyLine',{who:h.by??t('runtimeSettings.unset'),agent:h.agent??t('runtimeSettings.unset'),when:h.at,state:after?.decision?t('officeRestart.given'):t('officeRestart.removed'),because:after?.because??t('runtimeSettings.unset')})}</p>})}</details>
  </section></Panel>
}
function GrantControl({ updated }: { updated: () => void }) {
  const [agentQuery, setAgentQuery] = useState(''), [decisionQuery, setDecisionQuery] = useState('')
  const [agents, setAgents] = useState<{id:string;title:string}[]>([]), [decisions, setDecisions] = useState<{id:string;title:string}[]>([])
  const [agent, setAgent] = useState(''), [decision, setDecision] = useState(''), [because, setBecause] = useState('')
  const [fault, setFault] = useState<ReturnType<typeof faultFromThrown> | null>(null)
  async function find(which: 'agent' | 'decision') {
    try {
      if (which === 'agent') { const found = await api.restartAgents(agentQuery); setAgents(found.agents.map((a) => ({id:a.id,title:a.name || a.handle}))) }
      else { const found = await api.search(decisionQuery, 'decision', 10, 'all'); setDecisions(found.results.map((m) => ({id:m.record.id,title:m.record.title}))) }
    } catch (error) { setFault(faultFromThrown(error)) }
  }
  async function save(remove: boolean) { try { await api.restartGrant(agent, remove ? null : decision, because); updated(); setBecause('') } catch (error) { setFault(faultFromThrown(error)) } }
  return <details><summary>{t('officeRestart.grants')}</summary><p>{t('officeRestart.permission')}</p>
    <label>{t(settingsControlWord('settings.restart', 'officeRestart.searchAgent'))}<input value={agentQuery} onChange={(e) => setAgentQuery(e.target.value)} /></label><button onClick={() => { void find('agent') }}>{t(settingsControlWord('settings.restart', 'officeRestart.findAgent'))}</button>
    <label>{t(settingsControlWord('settings.restart', 'officeRestart.agent'))}<select aria-label={t(settingsControlWord('settings.restart', 'officeRestart.agent'))} value={agent} onChange={(e) => setAgent(e.target.value)}><option value="">{t('runtimeSettings.unset')}</option>{agents.map((a) => <option key={a.id} value={a.id}>{content(a.title)}</option>)}</select></label>
    <label>{t(settingsControlWord('settings.restart', 'officeRestart.searchDecision'))}<input value={decisionQuery} onChange={(e) => setDecisionQuery(e.target.value)} /></label><button onClick={() => { void find('decision') }}>{t(settingsControlWord('settings.restart', 'officeRestart.findDecision'))}</button>
    <label>{t(settingsControlWord('settings.restart', 'officeRestart.decision'))}<select aria-label={t(settingsControlWord('settings.restart', 'officeRestart.decision'))} value={decision} onChange={(e) => setDecision(e.target.value)}><option value="">{t('runtimeSettings.unset')}</option>{decisions.map((d) => <option key={d.id} value={d.id}>{content(d.title)}</option>)}</select></label>
    <label>{t(settingsControlWord('settings.restart', 'officeRestart.grantReason'))}<input value={because} onChange={(e) => setBecause(e.target.value)} maxLength={500} /></label>
    <button disabled={!agent || !decision || !because.trim()} onClick={() => { void save(false) }}>{t(settingsControlWord('settings.restart', 'officeRestart.give'))}</button><button disabled={!agent || !because.trim()} onClick={() => { void save(true) }}>{t(settingsControlWord('settings.restart', 'officeRestart.takeBack'))}</button>
    {fault ? <ErrorNote message={fault.message} fault={fault.fault} /> : null}
  </details>
}
