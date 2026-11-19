// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { RoleCardDifference } from './RoleCardDifference.tsx'
import { useEffect, useState } from 'react'
import { t, wordLanguage } from '@shared/i18n.ts'
import { APPOINTS, READING_LEVELS, WORK_AREA_GRAINS, type RoleCard, type WhatTheRolesSay } from '@shared/roles.ts'
import type { AddedRoleHistory, AddedRolePreview } from '../../server/api/added-roles.ts'
import { errorMessage, faultOf, moleOfficeRequest, api } from '../api.ts'
import { Btn, ErrorNote, Loading, TextArea, useAsync } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { navigate } from '../components/router.tsx'
import { MoleSilhouette } from '../components/MoleSilhouette.tsx'
import { powerNameHere } from '../components/RoleCard.tsx'
import { useLanguage } from '../lib/language.ts'

interface StoredCard { name: string; card: unknown; version: string; problems: string[] }
interface AddedCards { cards: StoredCard[]; leftOut: StoredCard[]; removed: string[] }
const post = <T,>(path: string, body: unknown) => moleOfficeRequest<T>(path, { method: 'POST', body: JSON.stringify(body) })
const emptyCard = (name = ''): RoleCard => ({ name, rung: null, duties: '', powers: [], appointedBy: 'the person', appoints: 'nobody', mustRead: { chapters: [], andWhatItsStarterNames: null }, reportsTo: '', whatEndsIt: '', workArea: { grain: 'folders', most: 'no limit', says: '' } })

/** A refused row can be malformed. Keep valid fields in the draft; preview shows every repair before it is kept. */
function draftOf(saved: StoredCard | undefined, roles: WhatTheRolesSay): RoleCard {
  const initial = typeof saved?.card === 'object' && saved.card !== null && !Array.isArray(saved.card) ? saved.card as Record<string, unknown> : {}
  const draft = { ...emptyCard(saved?.name), ...initial, name: saved?.name ?? '', rung: null, appointedBy: 'the person' } as RoleCard
  for (const field of ['duties', 'reportsTo', 'whatEndsIt'] as const) if (typeof initial[field] !== 'string') draft[field] = ''
  draft.powers = Array.isArray(initial.powers) ? initial.powers.filter((one): one is string => typeof one === 'string') : []
  if (!APPOINTS.includes(draft.appoints)) draft.appoints = 'nobody'
  const readings = typeof initial.mustRead === 'object' && initial.mustRead !== null ? initial.mustRead as Record<string, unknown> : {}
  draft.mustRead = { chapters: Array.isArray(readings.chapters) ? readings.chapters.filter((one): one is RoleCard['mustRead']['chapters'][number] => typeof one === 'object' && one !== null && roles.chapters.some(chapter => chapter.number === one.chapter) && READING_LEVELS.includes(one.level)) : [], andWhatItsStarterNames: typeof readings.andWhatItsStarterNames === 'string' ? readings.andWhatItsStarterNames : null }
  const area = typeof initial.workArea === 'object' && initial.workArea !== null ? initial.workArea as Record<string, unknown> : {}
  draft.workArea = { grain: WORK_AREA_GRAINS.includes(area.grain as never) ? area.grain as NonNullable<RoleCard['workArea']>['grain'] : 'folders', most: area.most === 'no limit' || typeof area.most === 'number' && Number.isInteger(area.most) && area.most >= 0 ? area.most : 'no limit', says: typeof area.says === 'string' ? area.says : '', ...(area.rootFiles === 'by name' ? { rootFiles: 'by name' as const } : {}) }
  for (const field of ['howItWorks', 'inPractice'] as const) {
    const text = initial[field]
    if (typeof text !== 'object' || text === null || !('en' in text) || !('zh' in text) || typeof text.en !== 'string' || typeof text.zh !== 'string') delete draft[field]
  }
  if (typeof draft.flow !== 'string' || draft.flow.trim() === '') delete draft.flow
  if (draft.refusedEverythingElse !== true) delete draft.refusedEverythingElse
  return draft
}

/** The new, edit, history and remove presses all lead through the same preview and Apply. */
export function AddedRoleEditor({ name, action }: { name?: string; action?: 'history' | 'remove' }) {
  useLanguage()
  const [reading] = useProjectAsync(async () => ({ roles: await api.roles(), added: await moleOfficeRequest<AddedCards>('/api/roles/added') }), [name])
  if (reading.status === 'loading') return <Loading what={t('addedRoles.reading')} />
  if (reading.status === 'error') return <ErrorNote message={reading.message} fault={reading.fault} />
  const saved = [...reading.value.added.cards, ...reading.value.added.leftOut].find(row => row.name === name)
  const historicalName = name !== undefined && action === 'history' && reading.value.added.removed.includes(name) ? name : undefined
  if (name !== undefined && saved === undefined && historicalName === undefined) return <ErrorNote message={t('addedRoles.notFound')} />
  return <AddedRoleForm key={name ?? 'new'} roles={reading.value.roles} saved={saved} historicalName={historicalName} action={action} />
}

export function AddedRoleForm({ roles, saved, historicalName, action }: { roles: WhatTheRolesSay; saved?: StoredCard; historicalName?: string; action?: 'history' | 'remove' }) {
  useLanguage()
  const knownName = saved?.name ?? historicalName
  const [card, setCard] = useState<RoleCard>(() => ({ ...draftOf(saved, roles), ...(historicalName === undefined ? {} : { name: historicalName }) }))
  const [preview, setPreview] = useState<AddedRolePreview | null>(null), [from, setFrom] = useState<string | null>(null)
  const [because, setBecause] = useState(''), [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const [showHistory, setShowHistory] = useState(action === 'history'), [offset, setOffset] = useState(0)
  const [history, readHistory] = useAsync(() => knownName === undefined || !showHistory ? Promise.resolve<AddedRoleHistory>({ versions: [], next: null }) : moleOfficeRequest<AddedRoleHistory>(`/api/roles/added/history?name=${encodeURIComponent(knownName!)}&offset=${offset}`), [knownName, showHistory, offset])
  const change = (patch: Partial<RoleCard>) => { setCard(held => ({ ...held, ...patch })); setPreview(null); setFrom(null) }
  async function look(restoring?: string) {
    setBusy(true); setFault(null); setPreview(null)
    try {
      const checked = await post<AddedRolePreview>('/api/roles/added/preview', { card: restoring === 'shipped' ? null : card, ...(knownName === undefined ? {} : { name: knownName }), ...(restoring === undefined ? {} : { from: restoring }) })
      setPreview(checked); setFrom(restoring ?? null)
    } catch (error) { setFault({ message: errorMessage(error), fault: faultOf(error) }) }
    finally { setBusy(false) }
  }
  useEffect(() => { if (action === 'remove') void look('shipped') }, [])
  async function apply() {
    if (preview === null || preview.problems.length > 0) return
    setBusy(true); setFault(null)
    try {
      await post(from === null ? '/api/roles/added' : '/api/roles/added/restore', { version: preview.version, because, ...(from === null ? { card: preview.card, ...(knownName === undefined ? {} : { name: knownName }) } : { name: preview.name, from }) })
      setPreview(null); readHistory(); navigate('/roles')
    } catch (error) { setFault({ message: errorMessage(error), fault: faultOf(error) }) }
    finally { setBusy(false) }
  }
  const text = (field: 'duties' | 'reportsTo' | 'whatEndsIt' | 'flow', label: string) => <label>{label}<TextArea rows={3} aria-label={label} value={typeof card[field] === 'string' ? card[field]! : ''} onChange={value => { if (field === 'flow' && value === '') { const next = { ...card }; delete next.flow; setCard(next); setPreview(null); setFrom(null) } else change({ [field]: value }) }} /></label>
  return <div className="added-role" data-added-role="">
    <style href="mole-office-added-role" precedence="default">{CSS}</style>
    <div className="rnc-pic-none added-silhouette" aria-hidden="true"><MoleSilhouette /></div>
    <p>{t('addedRoles.explain')}</p>
    {historicalName !== undefined ? <p>{t('addedRoles.removed')}</p> : null}
    {saved && saved.problems.length > 0 ? <div role="alert"><p>{t('addedRoles.leftOut')}</p><ul>{saved.problems.map(problem => <li key={problem}>{problem}</li>)}</ul></div> : null}
    <fieldset disabled={busy}>
      <label>{t('pageWords.RoleCardNewPage.002')}<input className="px-input" aria-label={t('pageWords.RoleCardNewPage.002')} value={card.name} disabled={knownName !== undefined} onChange={e => change({ name: e.target.value })} /></label>
      {knownName !== undefined ? <p>{t('addedRoles.nameFixed')}</p> : null}
      {text('duties', t('roleCard.part.duties'))}
      <fieldset><legend>{t('g6b.roles.powers')}</legend>{roles.powers.filter(power => power.name !== "The person's own acts").map(power => <label className="added-choice" key={power.name}><input type="checkbox" checked={Array.isArray(card.powers) && card.powers.includes(power.name)} onChange={e => change({ powers: e.target.checked ? [...(card.powers ?? []), power.name] : (card.powers ?? []).filter(name => name !== power.name) })} /><span>{powerNameHere(power.name)}</span></label>)}{(card.powers ?? []).filter(name => !roles.powers.some(power => power.name === name) || name === "The person's own acts").map(name => <label className="added-choice" key={name}><input type="checkbox" checked onChange={() => change({ powers: (card.powers ?? []).filter(one => one !== name) })} /><span>{name}</span></label>)}</fieldset>
      <label className="added-choice"><input type="checkbox" checked={card.refusedEverythingElse === true} onChange={e => { if (e.target.checked) change({ refusedEverythingElse: true }); else { const next = { ...card }; delete next.refusedEverythingElse; setCard(next); setPreview(null); setFrom(null) } }} /><span>{t('addedRoles.onlyNamedActs')}</span></label>
      <p>{t('addedRoles.giver')}</p>
      <label>{t('roleCard.part.appoints')}<select aria-label={t('roleCard.part.appoints')} className="px-select" value={card.appoints} onChange={e => change({ appoints: e.target.value as RoleCard['appoints'] })}>{APPOINTS.map(one => <option key={one}>{one}</option>)}</select></label>
      <fieldset><legend>{t('roleCard.part.mustRead')}</legend><ul className="rnc-chapters">{roles.chapters.map(chapter => {
        const held = card.mustRead?.chapters?.find(one => one.chapter === chapter.number)
        return <li key={chapter.number}><label className="rnc-chapter"><input type="checkbox" checked={held !== undefined} onChange={e => change({ mustRead: { ...card.mustRead, chapters: e.target.checked ? [...(card.mustRead?.chapters ?? []), { chapter: chapter.number, level: 'full' }] : (card.mustRead?.chapters ?? []).filter(one => one.chapter !== chapter.number) } })} /><span>{`${chapter.number}. ${wordLanguage() === 'zh' && chapter.zh !== null ? chapter.zh : chapter.name}`}</span></label>{held ? <select aria-label={t('addedRoles.readingLevel', { chapter: chapter.number })} value={held.level} onChange={e => change({ mustRead: { ...card.mustRead, chapters: card.mustRead.chapters.map(one => one.chapter === chapter.number ? { ...one, level: e.target.value as typeof held.level } : one) } })}>{READING_LEVELS.map(level => <option key={level}>{level}</option>)}</select> : null}</li>
      })}</ul><label>{t('addedRoles.starterReading')}<TextArea rows={3} value={card.mustRead?.andWhatItsStarterNames ?? ''} onChange={value => change({ mustRead: { ...card.mustRead, andWhatItsStarterNames: value || null } })} /></label></fieldset>
      {text('reportsTo', t('roleCard.part.reportsTo'))}{text('whatEndsIt', t('roleCard.part.whatEndsIt'))}
      <fieldset><legend>{t('addedRoles.workArea')}</legend>
        <label>{t('addedRoles.grain')}<select aria-label={t('addedRoles.grain')} value={card.workArea?.grain ?? 'folders'} onChange={e => change({ workArea: { ...card.workArea!, grain: e.target.value as NonNullable<RoleCard['workArea']>['grain'] } })}>{WORK_AREA_GRAINS.map(grain => <option key={grain}>{grain}</option>)}</select></label>
        <label>{t('addedRoles.most')}<input className="px-input" aria-label={t('addedRoles.most')} value={card.workArea?.most ?? ''} onChange={e => change({ workArea: { ...card.workArea!, most: e.target.value === 'no limit' ? 'no limit' : Number(e.target.value) } })} /></label>
        <label>{t('addedRoles.areaWords')}<TextArea rows={3} aria-label={t('addedRoles.areaWords')} value={card.workArea?.says ?? ''} onChange={value => change({ workArea: { ...card.workArea!, says: value } })} /></label>
        <label className="added-choice"><input type="checkbox" checked={card.workArea?.rootFiles === 'by name'} onChange={e => { const { rootFiles: _old, ...area } = card.workArea!; change({ workArea: { ...area, ...(e.target.checked ? { rootFiles: 'by name' as const } : {}) } }) }} /><span>{t('addedRoles.rootFiles')}</span></label>
      </fieldset>
      <details><summary>{t('addedRoles.handbook')}</summary>{text('flow', t('g6b.roles.flow'))}{(['howItWorks', 'inPractice'] as const).map(field => <fieldset key={field}><legend>{t(field === 'howItWorks' ? 'addedRoles.howItWorks' : 'addedRoles.inPractice')}</legend>{(['en', 'zh'] as const).map(language => <label key={language}>{language}<TextArea rows={3} value={card[field]?.[language] ?? ''} onChange={value => { const both = { en: card[field]?.en ?? '', zh: card[field]?.zh ?? '', [language]: value }; if (both.en === '' && both.zh === '') { const next = { ...card }; delete next[field]; setCard(next); setPreview(null); setFrom(null) } else change({ [field]: both }) }} /></label>)}</fieldset>)}</details>
    </fieldset>
    <div className="added-actions"><Btn disabled={busy} reason={t('addedRoles.wait')} onClick={() => { void look() }}>{t('addedRoles.preview')}</Btn>{saved ? <><Btn disabled={busy} reason={t('addedRoles.wait')} onClick={() => setShowHistory(!showHistory)}>{t('addedRoles.history')}</Btn><Btn disabled={busy} reason={t('addedRoles.wait')} onClick={() => { void look('shipped') }}>{t('addedRoles.remove')}</Btn></> : null}</div>
    {fault ? <ErrorNote message={fault.message} fault={fault.fault} /> : null}
    {preview ? <section data-role-preview="" className="added-preview">
      <h2>{t('addedRoles.preview')}</h2>
      {preview.problems.length > 0 ? <div role="alert"><h3>{t('addedRoles.problems')}</h3><ul>{preview.problems.map(problem => <li key={problem}>{problem}</li>)}</ul></div> : null}
      <h3>{t('addedRoles.reminders')}</h3><ul>{preview.reminders.map(reminder => <li key={reminder}>{reminder}</li>)}</ul>
      <p>{t('addedRoles.whoGiven', { who: preview.mayBeGivenTo })}</p>
      <h3>{t('addedRoles.effects')}</h3>{preview.acts.length === 0 ? <p>{t('addedRoles.none')}</p> : <ul>{preview.acts.map(act => <li key={act.act}>{act.inWords}</li>)}</ul>}
      <h3>{t('addedRoles.gained')}</h3>{preview.gained.length === 0 ? <p>{t('addedRoles.none')}</p> : <ul>{preview.gained.map(act => <li key={act.act}>{act.inWords}</li>)}</ul>}
      <h3>{t('addedRoles.lost')}</h3>{preview.lost.length === 0 ? <p>{t('addedRoles.none')}</p> : <ul>{preview.lost.map(act => <li key={act.act}>{act.inWords}</li>)}</ul>}
      <h3>{t('addedRoles.difference')}</h3><RoleCardDifference before={preview.before} after={preview.card} changes={preview.difference} roles={roles} />
      <label>{t('addedRoles.reason')}<TextArea rows={3} aria-label={t('addedRoles.reason')} value={because} onChange={setBecause} /></label>
      <Btn disabled={busy || !because.trim() || preview.problems.length > 0} reason={busy ? t('addedRoles.wait') : !because.trim() ? t('addedRoles.needReason') : preview.problems.length > 0 ? t('addedRoles.fixProblems') : undefined} onClick={() => { void apply() }}>{t('addedRoles.apply')}</Btn>
    </section> : null}
    {showHistory ? <section data-role-history=""><h2>{t('addedRoles.history')}</h2>{history.status === 'loading' ? <Loading what={t('addedRoles.reading')} /> : history.status === 'error' ? <ErrorNote message={history.message} fault={history.fault} /> : <>
      {history.value.versions.length === 0 ? <p>{t('addedRoles.none')}</p> : null}
      {history.value.versions.map(version => <article key={version.id}><p>{version.at} · {version.by.name}</p><p>{version.after.because}</p><RoleCardDifference before={version.before.card} after={version.after.card} roles={roles} /><Btn disabled={busy} reason={t('addedRoles.wait')} onClick={() => { void look(version.id) }}>{t('addedRoles.putBack')}</Btn></article>)}
      <div className="added-actions"><Btn disabled={offset === 0} reason={t('addedRoles.firstHistory')} onClick={() => setOffset(Math.max(0, offset - 10))}>{t('addedRoles.previous')}</Btn><Btn disabled={history.value.next === null} reason={t('addedRoles.lastHistory')} onClick={() => setOffset(history.value.next!)}>{t('addedRoles.next')}</Btn></div>
    </> }</section> : null}
  </div>
}
const CSS = `
.added-role { max-width: var(--measure-in-box); min-width: 0; display: grid; gap: var(--pad); }
.added-silhouette { width: 96px; height: 96px; color: var(--text); }
.added-role fieldset { min-width: 0; margin: 0; border: var(--border-w) solid var(--border); padding: var(--pad); display: grid; gap: var(--pad); }
.added-role label { display: grid; gap: 6px; min-width: 0; }
.added-role input:not([type=checkbox]), .added-role textarea, .added-role select { width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; }
.added-role .added-choice, .added-role .rnc-chapter { display: flex; align-items: baseline; gap: 8px; }
.added-actions { display: flex; flex-wrap: wrap; gap: var(--pad); }
.added-preview, .added-role article { border-top: var(--border-w) solid var(--border); padding-top: var(--pad); overflow-wrap: anywhere; }
.added-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--pad); }
.added-difference h4 { margin: var(--pad) 0; }
.added-difference h5 { margin: 0; color: var(--text-3); }
.added-difference section { border-top: var(--border-w) solid var(--border); padding-top: var(--pad); }
.added-difference p { white-space: pre-wrap; margin: 4px 0; }
.added-difference dl { margin: 0; }
.added-difference dd { margin: 0 0 var(--pad); }
@media (max-width: 40rem) { .added-pair { grid-template-columns: minmax(0, 1fr); } }
`
