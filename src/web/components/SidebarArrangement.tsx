// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useState, type ReactNode } from 'react'
import { t } from '@shared/i18n.ts'
import { problemsWithTheArrangement, sidebarName, type SidebarArrangement, type SidebarMove } from '@shared/sidebar-arrangement.ts'
import type { SidebarHistory } from '../../server/api/sidebar.ts'
import type { SidebarSetting } from '../../server/lib/sidebar.ts'
import { ApiError, errorMessage, faultOf, moleOfficeRequest } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { useMode } from '../lib/mode.ts'
import { readSidebarArrangement, useSidebarArrangement } from '../lib/sidebar-arrangement.ts'
import { declaredAttributes } from './declares.ts'
import { DESTINATIONS, railGroups } from './Sidebar.tsx'
import { PinnedPagesPart, usePinWrites } from './SidebarPins.tsx'
import { Btn, ErrorNote, Loading, useAsync } from './ui.tsx'

interface Preview { problems: string[]; reminders: string[]; moves: SidebarMove[] }
interface Reviewed extends Preview { arrangement: SidebarArrangement; version: string; from?: string }
function moved(arrangement: SidebarArrangement, page: string, group: string, place?: number): SidebarArrangement {
  const next = structuredClone(arrangement) as { groups: { key: string; keys: string[] }[] }
  for (const one of next.groups) one.keys = one.keys.filter(key => key !== page)
  const target = next.groups.find(one => one.key === group)!
  target.keys.splice(place ?? target.keys.length, 0, page)
  return next
}
function ordinal(place: number): string {
  const last = place % 100
  return String(place) + (last >= 11 && last <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[place % 10] ?? 'th'))
}
/**
 * A preview fixes both the arrangement and its version, and only a preview that names no problem brings the reason and
 * Apply, in place of the preview press. Editing again requires a new preview. With `reading`, as the
 * page opens: the groups and their pages in order, and the history, with no control that moves a page, because a page
 * opens as a reading (tests/read-before-edit.test.ts). Both views start with the person's own pinned pages, which are
 * kept at once with no reason (SidebarPins.tsx); a page is pinned on All pages, so the groups draw no pin press.
 * `editPress`, the page's press between the two views, is drawn under the pinned pages, above the groups it changes.
 */
export function SidebarArrangementPanel({ reading: readOnly = false, editPress }: { reading?: boolean; editPress?: ReactNode }) {
  useLanguage()
  const reading = useSidebarArrangement(), inspect = useMode() === 'inspect'
  const [base, setBase] = useState<SidebarSetting>(reading), [draft, setDraft] = useState<SidebarArrangement>(reading.arrangement)
  const [reviewed, setReviewed] = useState<Reviewed | null>(null), [because, setBecause] = useState('')
  const [busy, setBusy] = useState(false), [fault, setFault] = useState<unknown>(null), [notice, setNotice] = useState('')
  const [past, setPast] = useState(false), [offset, setOffset] = useState(0)
  const pinWrites = usePinWrites()
  const [history] = useAsync(() => past ? moleOfficeRequest<SidebarHistory>('/api/sidebar/history?offset=' + offset) : Promise.resolve(null), [past, offset, reading.version])
  const theReviewIsGood = reviewed !== null && reviewed.problems.length === 0
  const caption = (key: string) => railGroups().find(group => group.key === key)?.caption ?? sidebarName(key)
  const label = (key: string) => DESTINATIONS.find(page => page.key === key)?.label ?? sidebarName(key)
  const edit = (next: SidebarArrangement) => { setDraft(next); setReviewed(null); setFault(null); setNotice('') }
  const preview = async (arrangement = draft, from?: string) => {
    setBusy(true); setFault(null); setNotice(''); setReviewed(null)
    try {
      const choice = structuredClone(arrangement)
      const reply = await moleOfficeRequest<Preview>('/api/sidebar/preview', { method: 'POST', body: JSON.stringify({ arrangement: choice }) })
      setDraft(choice); setReviewed({ ...reply, arrangement: choice, version: base.version, ...(from === undefined ? {} : { from }) })
    } catch (error) { setFault(error) }
    finally { setBusy(false) }
  }
  const apply = async () => {
    if (reviewed === null || reviewed.problems.length > 0 || !because.trim()) return
    setBusy(true); setFault(null)
    try {
      const reply = await moleOfficeRequest<SidebarSetting & { written: boolean }>(reviewed.from === undefined ? '/api/sidebar' : '/api/sidebar/restore', {
        method: 'POST', body: JSON.stringify({ version: reviewed.version, because, ...(reviewed.from === undefined ? { arrangement: reviewed.arrangement } : { from: reviewed.from }) }),
      })
      // The write answers the version it made. A settings event can overtake the read below, so the base is not taken from it.
      const { written, ...after } = reply
      await readSidebarArrangement()
      setBase(after); setDraft(after.arrangement); setReviewed(null); setBecause('')
      setNotice(t(written ? 'sidebarSetting.applied' : 'sidebarSetting.unchanged'))
    } catch (error) {
      setFault(error)
      if (error instanceof ApiError && error.status === 409) {
        try { const now = await readSidebarArrangement(); setBase(now); setDraft(now.arrangement); setReviewed(null) }
        catch (refreshError) { setFault(refreshError) }
      }
    } finally { setBusy(false) }
  }
  return <section className="sa" data-sidebar-arrangement="" {...declaredAttributes({ surface: 'settings.sidebar' })}>
    <style href="mole-office-sidebar-arrangement" precedence="default">{CSS}</style>
    <PinnedPagesPart writes={pinWrites} />
    {editPress === undefined ? null : <div className="sa-edit">{editPress}</div>}
    {reading.storedButNotUsed !== null ? <div role="status" data-sidebar-recovery=""><p>{t('sidebarSetting.storedRefused')}</p><ul>{reading.storedButNotUsed.problems.map((problem, i) => <li key={i}>{problem}</li>)}</ul></div> : null}
    {reading.readFailure !== null ? <p role="status">{t('sidebarSetting.readFailed')} {reading.readFailure}</p> : null}
    {reading.version !== base.version ? <p role="status">{t('sidebarSetting.changed')}</p> : null}
    {draft.groups.filter(group => group.key !== 'developer' || inspect).map(group => <section key={group.key} data-sidebar-group={group.key}>
      <h3>{caption(group.key)}</h3>
      <ol>{group.keys.map((key, index) => <li key={key} data-sidebar-page={key}>
        <span className="sa-page">{label(key)}</span>
        {readOnly ? null : <div className="sa-controls">
          <Btn disabled={busy || index === 0} reason={busy ? t('sidebarSetting.busy') : index === 0 ? t('sidebarSetting.first') : undefined} onClick={() => edit(moved(draft, key, group.key, index - 1))}><span aria-hidden="true">{t('sidebarSetting.up')}</span><span className="sr-only">{t('sidebarSetting.upPage', { page: label(key) })}</span></Btn>
          <Btn disabled={busy || index === group.keys.length - 1} reason={busy ? t('sidebarSetting.busy') : index === group.keys.length - 1 ? t('sidebarSetting.last') : undefined} onClick={() => edit(moved(draft, key, group.key, index + 1))}><span aria-hidden="true">{t('sidebarSetting.down')}</span><span className="sr-only">{t('sidebarSetting.downPage', { page: label(key) })}</span></Btn>
          <label>{t('sidebarSetting.groupFor', { page: label(key) })}<select value={group.key} disabled={busy} onChange={event => edit(moved(draft, key, event.target.value))}>
            {draft.groups.filter(target => (target.key !== 'developer' || inspect) && problemsWithTheArrangement(moved(draft, key, target.key)).problems.length === 0).map(target => <option key={target.key} value={target.key}>{caption(target.key)}</option>)}
          </select></label>
        </div>}
      </li>)}</ol>
    </section>)}
    {readOnly ? null : <><div className="sa-actions">{theReviewIsGood ? null : <Btn disabled={busy} reason={busy ? t('sidebarSetting.busy') : undefined} onClick={() => { void preview() }}>{t('sidebarSetting.preview')}</Btn>}<Btn disabled={busy} reason={busy ? t('sidebarSetting.busy') : undefined} onClick={() => { void preview(base.shipped, 'shipped') }}>{t('sidebarSetting.shipped')}</Btn></div>
    {reviewed === null ? null : <section className="sa-preview" data-sidebar-preview="" aria-live="polite">
      <h3>{t('sidebarSetting.previewTitle')}</h3>
      {reviewed.problems.length > 0 ? <><p>{t('sidebarSetting.refused')}</p><ul>{reviewed.problems.map((line, i) => <li key={i}>{line}</li>)}</ul></> : <p>{t('sidebarSetting.valid')}</p>}
      {reviewed.reminders.length > 0 ? <><h4>{t('sidebarSetting.reminders')}</h4><ul>{reviewed.reminders.map((line, i) => <li key={i}>{line}</li>)}</ul></> : null}
      <h4>{t('sidebarSetting.moves')}</h4>
      <ul>{reviewed.moves.map(move => <li key={move.key}>{t(move.from.group === move.to.group ? 'sidebarSetting.moveWithin' : 'sidebarSetting.moveAcross', { page: label(move.key), before: ordinal(move.from.place), after: ordinal(move.to.place), from: caption(move.from.group), to: caption(move.to.group) })}</li>)}</ul>
      {reviewed.moves.length === 0 && reviewed.problems.length === 0 ? <p>{t('sidebarSetting.noMoves')}</p> : null}
    </section>}
    {theReviewIsGood ? <label className="sa-reason">{t('sidebarSetting.reason')}<input required maxLength={500} value={because} disabled={busy} onChange={event => setBecause(event.target.value)} /></label> : null}
    {fault === null ? null : <ErrorNote message={errorMessage(fault)} fault={faultOf(fault)} />}
    {notice ? <p role="status">{notice}</p> : null}
    {theReviewIsGood ? <Btn disabled={busy || !because.trim()} reason={busy ? t('sidebarSetting.busy') : !because.trim() ? t('sidebarSetting.needReason') : undefined} onClick={() => { void apply() }}>{t('sidebarSetting.apply')}</Btn> : null}</>}
    <details onToggle={event => setPast(event.currentTarget.open)}><summary>{t('sidebarSetting.history')}</summary>
      {history.status === 'loading' ? <Loading what={t('sidebarSetting.history')} /> : null}
      {history.status === 'error' ? <ErrorNote message={history.message} fault={history.fault} /> : null}
      {history.status === 'ready' && history.value !== null ? <>
        {history.value.versions.length === 0 ? <p>{t('sidebarSetting.noHistory')}</p> : null}
        {history.value.versions.map(version => <div className="sa-history" key={version.id}><p>{t('sidebarSetting.historyLine', { at: version.at, who: version.by.id, because: version.because })}</p>
          <details><summary>{t('sidebarSetting.beforeAfter')}</summary>{[version.before, version.after].map((arrangement, i) => <div key={i}><h4>{t(i === 0 ? 'sidebarSetting.before' : 'sidebarSetting.after')}</h4>{arrangement.groups.filter(group => group.key !== 'developer' || inspect).map(group => <p key={group.key}>{caption(group.key)}: {group.keys.map(label).join(', ') || t('sidebarSetting.noPages')}</p>)}</div>)}</details>
          {readOnly ? null : <Btn disabled={busy} reason={busy ? t('sidebarSetting.busy') : undefined} onClick={() => { void preview(version.after, version.id) }}>{t('sidebarSetting.putBack')}</Btn>}
        </div>)}
        <div className="sa-actions">{offset > 0 ? <Btn onClick={() => setOffset(Math.max(0, offset - 10))}>{t('sidebarSetting.newer')}</Btn> : null}{history.value.next !== null ? <Btn onClick={() => setOffset(history.value!.next!)}>{t('sidebarSetting.older')}</Btn> : null}</div>
      </> : null}
    </details>
  </section>
}
const CSS = `
.sa { min-width:0; font-size:var(--fs-1); }
.sa p { margin:.7rem 0; overflow-wrap:anywhere; }
.sa h3 { font-size:1rem; margin:1rem 0 .5rem; }
.sa ol { padding-left:1.6rem; }
.sa li { margin:.6rem 0; min-width:0; }
.sa-page { display:block; margin-bottom:.3rem; }
.sa-controls, .sa-actions { display:flex; flex-wrap:wrap; align-items:end; gap:.5rem; }
.sa-controls label { display:grid; gap:.3rem; flex:1 1 12rem; min-width:0; }
.sa input, .sa select { box-sizing:border-box; max-width:100%; width:100%; min-width:0; font:inherit; padding:.45rem; color:var(--text); background:var(--panel); border:1px solid var(--border-strong); }
.sa-reason { display:grid; gap:.4rem; margin:1rem 0; }
.sa-preview, .sa-history { border-top:1px solid var(--border-strong); margin-top:1rem; padding-top:.5rem; }
.sa summary { cursor:pointer; margin:1rem 0 .5rem; }
.sa-actions { margin:1rem 0; }
.sa-edit { margin:.7rem 0; }
`
