// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useState, type ReactNode } from 'react'
import type { AChapterPreview, ChapterContent, SelectedChapter } from '@shared/chapter-edit.ts'
import { t } from '@shared/i18n.ts'
import { api, ApiError, errorMessage, faultOf, getActor } from '../api.ts'
import { Btn, ErrorNote, Loading, useAsync } from './ui.tsx'
import { recordPath, RouteLink } from './router.tsx'

/** A new rule takes the first free id in this draft; the other rules keep their ids. */
function nextRuleId(draft: ChapterContent): string {
  const ids = new Set(draft.rules.map(rule => rule.id))
  let n = 1
  while (ids.has(`r-${n}`)) n++
  return `r-${n}`
}

function RuleChanges({ changes }: { changes: AChapterPreview['changes'] }) {
  return <div className="ce-changes">{changes.map((change, i) => <section key={`${change.rule}-${i}`}>
    <h5>{change.rule}</h5>
    <div className="ce-comparison">{(['was', 'becomes'] as const).map(side => <div key={side}>
      <h6>{t(side === 'was' ? 'chapterEdit.was' : 'chapterEdit.becomes')}</h6>
      {change[side] === null ? <p>{t('chapterEdit.absent')}</p> : <><p lang="en"><strong>{change[side].heading}</strong></p><p lang="en">{change[side].text}</p>{change[side].zh === null ? null : <><p>{t('chapterEdit.chinese')}</p><p lang="zh"><strong>{change[side].zh.heading}</strong></p><p lang="zh">{change[side].zh.text}</p></>}</>}
    </div>)}</div>
  </section>)}</div>
}

/** History includes the chapter's name and conclusion as well as the individual rules. */
function Changes({ before, after }: { before: ChapterContent | null; after: ChapterContent }) {
  const ids = [...new Set([...(before?.rules ?? []).map(rule => rule.id), ...after.rules.map(rule => rule.id)])]
  const changes = ids.flatMap(id => {
    const was = before?.rules.find(rule => rule.id === id) ?? null
    const becomes = after.rules.find(rule => rule.id === id) ?? null
    return was?.heading === becomes?.heading && was?.text === becomes?.text && JSON.stringify(was?.zh) === JSON.stringify(becomes?.zh) ? [] : [{ rule: id, was, becomes }]
  })
  return <><ChapterChanges before={before} after={after} /><RuleChanges changes={changes} /></>
}

function ChapterChanges({ before, after }: { before: Omit<ChapterContent, 'rules'> | null; after: Omit<ChapterContent, 'rules'> }) {
  return <>{(['label', 'title', 'conclusion'] as const).filter(key => before?.[key] !== after[key] || before?.zh?.[key] !== after.zh?.[key]).map(key => <section key={key}>
    <h5>{t(`chapterEdit.${key}`)}</h5><div className="ce-comparison">
      {([before, after] as const).map((part, i) => <div key={i}><h6>{t(i === 0 ? 'chapterEdit.was' : 'chapterEdit.becomes')}</h6>
        {part === null ? <p>{t('chapterEdit.absent')}</p> : <><p lang="en">{part[key]}</p>
          {part.zh ? <><p>{t('chapterEdit.chinese')}</p><p lang="zh">{part.zh[key]}</p></> : null}
        </>}
      </div>)}
    </div>
  </section>)}</>
}

/** The draft retains the version opened. A reread is explicit and never discards typed words. */
export function ChapterEditor({ selected, editing = true, onChanged, children }: { selected: SelectedChapter; editing?: boolean; onChanged?: () => void; children: ReactNode }) {
  // A write supplies fresh content and its version before the parent's reread can finish.
  // Keep them together until a new parent reply arrives; opening another form must use both.
  const [held, setHeld] = useState({ read: selected, current: selected })
  const current = held.read === selected ? held.current : selected
  if (held.read !== selected) setHeld({ read: selected, current: selected })
  const person = getActor().type === 'human'
  const [base, setBase] = useState(current)
  const [draft, setDraft] = useState<ChapterContent | null>(null)
  const [from, setFrom] = useState<'shipped' | number | undefined>()
  const [preview, setPreview] = useState<AChapterPreview | null>(null)
  const [because, setBecause] = useState(''), [keep, setKeep] = useState('')
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState<unknown>(null)
  const [dropped, setDropped] = useState<string[]>([])
  const [notice, setNotice] = useState(''), [past, setPast] = useState(false), [offset, setOffset] = useState(0)
  const [history, rereadHistory] = useAsync(() => past ? api.chapterHistory(current.n, offset) : Promise.resolve(null), [past, offset, current.version])
  const historyRecord = history.status === 'ready' && history.value !== null ? history.value.record : null
  const conflict = failure instanceof ApiError && failure.status === 409
  const needsKeep = (base.notUsed?.records.length ?? 0) > 1
  const reasonOK = because.trim().length > 0 && because.trim().length <= 500
  const begin = (chapter: ChapterContent, source?: 'shipped' | number) => {
    setBase(current); setDraft(structuredClone(chapter)); setFrom(source); setPreview(null)
    setBecause(''); setKeep(''); setFailure(null); setNotice(''); setDropped([])
  }
  const edit = (next: ChapterContent) => { setDraft(next); setPreview(null) }
  const check = async () => {
    if (draft === null || (needsKeep && !keep)) return
    setBusy(true); setFailure(null); setPreview(null); setNotice('')
    try { setPreview(from === undefined ? await api.previewChapter(base.n, draft, needsKeep ? keep : undefined) : await api.previewRestoreChapter(base.n, from, needsKeep ? keep : undefined)) }
    catch (error) { setFailure(error) }
    finally { setBusy(false) }
  }
  const apply = async () => {
    if (draft === null || preview === null || preview.problems.length > 0 || !reasonOK || (needsKeep && !keep)) return
    setBusy(true); setFailure(null)
    try {
      const common = { n: base.n, version: base.version, because: because.trim(), ...(needsKeep ? { keep } : {}) }
      const written = from === undefined ? await api.applyChapter({ ...common, chapter: draft }) : await api.restoreChapter({ ...common, from })
      const removedChinese = written.chineseDropped
      setDropped(removedChinese.map(id => id === 'chapter' ? t('chapterEdit.chapterWords') : written.chapter?.rules.find(rule => rule.id === id)?.heading ?? draft.rules.find(rule => rule.id === id)?.heading ?? id))
      setHeld(snapshot => ({ ...snapshot, current: written })); setBase(written); setDraft(null); setPreview(null); setBecause(''); setNotice(written.written ? t('chapterEdit.saved') : t('chapterEdit.unchanged'))
      rereadHistory(); onChanged?.()
    } catch (error) { setFailure(error) }
    finally { setBusy(false) }
  }
  const reread = async () => {
    setBusy(true)
    try {
      const reply = await api.officeChapters()
      const next = reply.chapters.find(chapter => chapter.n === current.n)
      if (!next) throw new Error(t('chapterEdit.missingOnRead'))
      setHeld(snapshot => ({ ...snapshot, current: next })); setBase(next); setKeep(''); setPreview(null); setFailure(null); setNotice(t('chapterEdit.rereadDone')); onChanged?.()
    } catch (error) { setFailure(error) }
    finally { setBusy(false) }
  }
  const recovery = current.inUse !== 'stored'
  const contentToEdit = current.stored ?? current.chapter
  const shippedContent = current.shipped
  // ONE PRESS AT A TIME: the preview until a preview passes, then the reason and Apply. An edit clears the preview, so it comes back.
  const theReviewIsGood = preview !== null && preview.problems.length === 0
  const actions = <div className="ce-actions">
    {person && editing && contentToEdit !== null ? <Btn size="sm" disabled={busy} reason={t('chapterEdit.busy')} onClick={() => begin(contentToEdit)}>{t('chapterEdit.edit')}</Btn> : null}
    {person && editing && recovery && shippedContent !== null ? <Btn size="sm" disabled={busy} reason={t('chapterEdit.busy')} onClick={() => begin(shippedContent, 'shipped')}>{t(current.inUse === 'none' ? 'chapterEdit.fileShipped' : 'chapterEdit.restoreShipped')}</Btn> : null}
    {current.inUse !== 'none' ? <Btn size="sm" variant="ghost" disabled={busy} reason={t('chapterEdit.busy')} onClick={() => setPast(!past)}>{t(past ? 'chapterEdit.closeHistory' : 'chapterEdit.history')}</Btn> : null}
  </div>
  return <div className="ce" data-chapter-editor={current.n}>
    <style href="mole-office-chapter-edit" precedence="default">{CHAPTER_EDIT_CSS}</style>
    {recovery ? <div role="alert" className="ce-alert" data-chapter-recovery="">
      <p>{current.inUse === 'none' ? t('chapterEdit.none') : t('chapterEdit.readingShipped')}</p>
      {current.notUsed === null ? null : <>
        <p>{t('chapterEdit.storedRecords')}</p><ul>{current.notUsed.records.map(id => <li key={id}><RouteLink to={recordPath(id)}>{id}</RouteLink></li>)}</ul>
        <ul>{current.notUsed.problems.map((problem, i) => <li key={i}>{problem}</li>)}</ul>
      </>}
      {actions}
    </div> : null}
    {children}
    {recovery ? null : actions}
    {person && draft !== null && !editing ? <p role="status">{t('regulationsMode.draftKept')}</p> : null}
    {person && draft !== null ? <section hidden={!editing} className="ce-form" data-chapter-form="" aria-label={t('chapterEdit.editing', { n: current.n })}>
      <h4>{t(from === 'shipped' ? 'chapterEdit.restoringShipped' : from === undefined ? 'chapterEdit.editing' : 'chapterEdit.restoringVersion', { n: from === undefined || from === 'shipped' ? current.n : from })}</h4>
      {from === undefined ? <fieldset disabled={busy}>
        {(['label', 'title', 'conclusion'] as const).map(key => <div className="ce-languages" key={key}>
          <label>{t(`chapterEdit.english.${key}`)}<textarea aria-label={t(`chapterEdit.english.${key}`)} lang="en" rows={key === 'conclusion' ? 3 : 2} value={draft[key]} onChange={event => edit({ ...draft, [key]: event.target.value })} /></label>
          <label>{t(`chapterEdit.chinese.${key}`)}<textarea aria-label={t(`chapterEdit.chinese.${key}`)} lang="zh" rows={key === 'conclusion' ? 3 : 2} value={draft.zh?.[key] ?? ''} onChange={event => edit({ ...draft, zh: { label: '', title: '', conclusion: '', ...draft.zh, [key]: event.target.value } })} />
          </label>
        </div>)}
        {draft.rules.map((rule, index) => <fieldset className="ce-rule" key={rule.id}>
          <legend>{t('chapterEdit.rule', { id: rule.id })}</legend>
          {(['heading', 'text'] as const).map(key => <div className="ce-languages" key={key}>
            <label>{t(`chapterEdit.english.${key}`, { id: rule.id })}<textarea aria-label={t(`chapterEdit.english.${key}`, { id: rule.id })} lang="en" rows={key === 'text' ? 4 : 2} value={rule[key]} onChange={event => edit({ ...draft, rules: draft.rules.map((one, i) => i === index ? { ...one, [key]: event.target.value } : one) })} /></label>
            <label>{t(`chapterEdit.chinese.${key}`, { id: rule.id })}<textarea aria-label={t(`chapterEdit.chinese.${key}`, { id: rule.id })} lang="zh" rows={key === 'text' ? 4 : 2} value={rule.zh?.[key] ?? ''} onChange={event => edit({ ...draft, rules: draft.rules.map((one, i) => i === index ? { ...one, zh: { heading: '', text: '', ...one.zh, [key]: event.target.value } } : one) })} />
            </label>
          </div>)}
          <Btn size="sm" disabled={busy} reason={t('chapterEdit.busy')} onClick={() => edit({ ...draft, rules: draft.rules.filter((_, i) => i !== index) })}>{t('chapterEdit.removeRule', { id: rule.id })}</Btn>
        </fieldset>)}
        <Btn size="sm" disabled={busy} reason={t('chapterEdit.busy')} onClick={() => edit({ ...draft, rules: [...draft.rules, { id: nextRuleId(draft), heading: '', text: '', zh: null }] })}>{t('chapterEdit.addRule')}</Btn>
      </fieldset> : null}
      {needsKeep ? <label>{t('chapterEdit.keepRecord')}<select aria-label={t('chapterEdit.keepRecord')} disabled={busy} value={keep} onChange={event => { setKeep(event.target.value); setPreview(null) }}><option value="">{t('chapterEdit.chooseRecord')}</option>{base.notUsed!.records.map(id => <option value={id} key={id}>{id}</option>)}</select></label> : null}
      <div className="ce-actions">{theReviewIsGood ? null : <Btn pending={busy} disabled={needsKeep && !keep} reason={t('chapterEdit.chooseRecord')} onClick={() => void check()}>{t('chapterEdit.preview')}</Btn>}<Btn variant="ghost" disabled={busy} reason={t('chapterEdit.busy')} onClick={() => { setDraft(null); setPreview(null); setFailure(null); setNotice('') }}>{t('chapterEdit.cancel')}</Btn></div>
      {preview === null ? null : <section className="ce-preview" data-chapter-preview="" aria-live="polite">
        <h4>{t('chapterEdit.previewTitle')}</h4>
        {preview.problems.length > 0 ? <div role="alert"><p>{t('chapterEdit.fixProblems')}</p><ul>{preview.problems.map((problem, i) => <li key={i}>{problem}</li>)}</ul></div> : <p>{t('chapterEdit.valid')}</p>}
        <p>{'notMeasured' in preview.rulesFile ? t('chapterEdit.sizeNotMeasured') : t('chapterEdit.size', { bytes: preview.rulesFile.bytes, most: preview.rulesFile.most })}</p>
        <>{preview.ownWords === null ? null : <ChapterChanges before={preview.ownWords.was} after={preview.ownWords.becomes} />}<RuleChanges changes={preview.changes} /></>
      </section>}

      {theReviewIsGood ? <>
        <label>{t('chapterEdit.reason')}<textarea aria-label={t('chapterEdit.reason')} rows={2} maxLength={500} required disabled={busy} value={because} onChange={event => setBecause(event.target.value)} /></label>
        <Btn pending={busy} disabled={!reasonOK || (needsKeep && !keep) || conflict} reason={t('chapterEdit.applyNeeds')} onClick={() => void apply()}>{t(from === undefined ? 'chapterEdit.apply' : 'chapterEdit.restore')}</Btn>
      </> : null}
    </section> : null}
    {failure === null ? null : <><ErrorNote message={errorMessage(failure)} fault={faultOf(failure)} />{conflict ? <div role="alert"><p>{t('chapterEdit.changed')}</p><Btn pending={busy} onClick={() => void reread()}>{t('chapterEdit.readAgain')}</Btn></div> : null}</>}
    {notice ? <p role="status">{notice}</p> : null}
    {dropped.length === 0 ? null : <div role="status"><p>{t('chapterEdit.chineseDropped')}</p><ul>{dropped.map((name, i) => <li key={i}>{name}</li>)}</ul></div>}
    {past ? <section className="ce-history" data-chapter-history=""><h4>{t('chapterEdit.history')}</h4>
      {person && editing && !recovery && shippedContent !== null ? <Btn size="sm" disabled={busy} reason={t('chapterEdit.busy')} onClick={() => begin(shippedContent, 'shipped')}>{t('chapterEdit.restoreShipped')}</Btn> : null}
      {historyRecord === null ? null : <p>{t('chapterEdit.historyRecord')} <RouteLink to={recordPath(historyRecord)}>{historyRecord}</RouteLink></p>}
      {history.status === 'loading' ? <Loading what={t('chapterEdit.history')} /> : null}
      {history.status === 'error' ? <ErrorNote message={history.message} fault={history.fault} /> : null}
      {history.status === 'ready' && history.value !== null ? <>
        {history.value.versions.length === 0 ? <p>{t('chapterEdit.noHistory')}</p> : null}
        {history.value.versions.map(version => <article key={version.seq}>
          <h5>{t('chapterEdit.version', { n: version.seq })}</h5><p>{t('chapterEdit.whoWhen', { who: version.by.id, at: version.at })}</p><p>{version.because}</p>
          <details><summary>{t('chapterEdit.change')}</summary><Changes before={version.before} after={version.after} /></details>
          {person && editing ? <Btn size="sm" disabled={busy} reason={t('chapterEdit.busy')} onClick={() => begin(version.after, version.seq)}>{t('chapterEdit.restoreVersion', { n: version.seq })}</Btn> : null}
        </article>)}
        <div className="ce-actions">{offset > 0 ? <Btn onClick={() => setOffset(Math.max(0, offset - 10))}>{t('chapterEdit.newer')}</Btn> : null}{history.value.next === null ? null : <Btn onClick={() => setOffset(history.value!.next!)}>{t('chapterEdit.older')}</Btn>}</div>
      </> : null}
    </section> : null}
  </div>
}

export const CHAPTER_EDIT_CSS = `
.ce { min-width:0; color:var(--text); font:var(--fs-1)/var(--lh-read) var(--font-ui); }
.ce p, .ce li, .ce h4, .ce h5 { overflow-wrap:anywhere; }
.ce p { margin:.5rem 0; white-space:pre-wrap; }
.ce h4 { font-size:var(--fs-2); margin:.7rem 0; }
.ce h5, .ce h6 { font-size:inherit; margin:.6rem 0; }
.ce-actions { display:flex; flex-wrap:wrap; gap:.5rem; margin:.75rem 0; }
.ce-alert { border-top:3px solid var(--accent); padding:.5rem 0; margin-bottom:1rem; background:var(--panel); }
.ce a { color:var(--accent); overflow-wrap:anywhere; }
.ce-form, .ce-preview, .ce-history { border-top:1px solid var(--border); margin:1rem 0; padding-top:.5rem; }
.ce fieldset { min-width:0; border:0; margin:0; padding:0; }
.ce .ce-rule { border-top:1px solid var(--border); margin:1rem 0; padding-top:.5rem; }
.ce legend { padding:0 .4rem 0 0; }
.ce label { display:grid; gap:.3rem; min-width:0; margin:.8rem 0; }
.ce textarea, .ce select { box-sizing:border-box; width:100%; min-width:0; max-width:100%; padding:.55rem; font:inherit; color:var(--text); background:var(--panel); border:1px solid var(--border-strong); border-radius:var(--radius); }
.ce textarea { resize:vertical; }
.ce-languages, .ce-comparison { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem; }
.ce-comparison > div { min-width:0; }
.ce-changes > section, .ce-history article { border-top:1px solid var(--border); padding:.6rem 0; }
.ce summary { cursor:pointer; color:var(--accent); margin:.5rem 0; }
@media (max-width:40rem) { .ce-languages, .ce-comparison { grid-template-columns:minmax(0,1fr); gap:.3rem; } }
`
