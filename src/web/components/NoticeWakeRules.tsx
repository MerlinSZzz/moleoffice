// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { RouteLink, recordPath } from './router.tsx'
import { useState } from 'react'
import { api, errorMessage, faultOf } from '../api.ts'
import { content, t, type WordKey } from '@shared/i18n.ts'
import { ErrorNote, Loading, useAsync } from './ui.tsx'
import { declaredAttributes } from './declares.ts'
import type { NoticeRulesReply } from '../../server/api/notice-rules.ts'

export function NoticeWakeRules() {
  const [state] = useAsync(() => api.noticeRules(), [])
  const [next, setNext] = useState<NoticeRulesReply | null>(null)
  const [chosen, setChosen] = useState<{muted:string[];batched:string[]} | null>(null)
  const [query, setQuery] = useState(''), [because, setBecause] = useState(''), [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<{message:string;fault:ReturnType<typeof faultOf>} | null>(null)
  const reading = next ?? (state.status === 'ready' ? state.value : null)
  const muted = chosen?.muted ?? reading?.mutedKinds ?? []
  const batched = chosen?.batched ?? reading?.batchedKinds ?? []
  async function save(kinds: string[], batches: string[], seq?: number) {
    if (reading === null) return
    setBusy(true); setFault(null)
    try { setNext(await api.noticeRules({mutedKinds:kinds,batchedKinds:batches,because,ifVersion:reading.version},seq)); setChosen(null); setBecause('') }
    catch (e) { setFault({message:errorMessage(e),fault:faultOf(e)}) }
    finally { setBusy(false) }
  }
  return <details className="px-notice-rules" {...declaredAttributes({ surface: 'messages.noticerules' })}>
    <summary>{t('noticeRules.title')}</summary>
    <style>{`.px-notice-rules{border:1px solid var(--border);padding:.8rem;margin:1rem 0}.px-notice-rules label{display:block;margin:.7rem 0;overflow-wrap:anywhere}.px-notice-rules input[type=text]{width:100%;max-width:35rem;box-sizing:border-box;background:var(--panel);color:var(--text);border:1px solid var(--border-strong);padding:.4rem}.px-notice-rules button{margin:.4rem .6rem .4rem 0;min-height:32px;border:1px solid var(--border-strong);padding:.4rem .6rem;background:var(--panel);color:var(--text)}.px-notice-rules select{display:block;width:100%;max-width:26rem;box-sizing:border-box;min-height:36px;margin-top:.3rem;padding:.3rem;color:var(--text);background:var(--panel);border:1px solid var(--border-strong)}.px-notice-rules-list{max-height:20rem;overflow-y:auto;overflow-x:hidden}.px-notice-rules-not-used{border-left:3px solid var(--st-broken-line);padding:.2rem 0 .2rem .8rem;margin:.8rem 0;overflow-wrap:anywhere}.px-notice-rules-not-used ul{margin:.4rem 0;padding-left:1.2rem;list-style:disc}`}</style>
    <p>{t('noticeRules.deliveryChoice')}</p>
    {state.status === 'loading' ? <Loading what={t('noticeRules.title')} /> : state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault} /> : null}
    {reading ? <>
      <p>{t('noticeRules.acting',{name:reading.name})}</p>
      <p data-batch-boundary=''>{t('noticeRules.batchBoundary',{name:t('noticeRules.batchLimitName'),minutes:String(reading.batchMaxMinutes)})}</p>
      <p>{t('noticeRules.batchKept')}</p>
      {reading.pendingBatches.length === 0 ? <p>{t('noticeRules.batchNone')}</p> : <ul className='px-notice-batch-pending'>{reading.pendingBatches.map(one=><li key={one.kind}>{t(('noticeWords.'+one.kind) as WordKey)} {t('noticeRules.pendingBatch',{count:String(one.count),oldest:one.oldest})} <RouteLink to={recordPath(one.messageId)}>{t('noticeRules.readPending')}</RouteLink></li>)}</ul>}
      {reading.storedButNotUsed ? <div className="px-notice-rules-not-used" role="status" data-notice-rules-not-used="">
        <p>{t('noticeRules.notUsed')}</p>
        <ul>{reading.storedButNotUsed.problems.map((problem)=><li key={problem}>{problem}</li>)}</ul>
        {reading.mutedKinds.length + reading.batchedKinds.length > 0 ? <><p>{t('noticeRules.usable')}</p><ul>{[...reading.mutedKinds,...reading.batchedKinds].map((kind)=><li key={kind}>{t(('noticeWords.' + kind) as WordKey)}</li>)}</ul></> : <p>{t('noticeRules.noneUsable')}</p>}
        <p>{t('noticeRules.putBatchRight',{save:t('noticeRules.save'),defaults:t('noticeRules.defaults')})}</p>
      </div> : null}
      <label>{t('noticeRules.find')}<input type="text" value={query} onChange={(e)=>setQuery(e.target.value)} /></label>
      <div className="px-notice-rules-list">{reading.choices.filter((c)=>[c.kind, t(('noticeWords.' + c.kind) as WordKey)].join(' ').toLowerCase().includes(query.toLowerCase())).map((c)=><label key={c.kind}>
        {t(('noticeWords.' + c.kind) as WordKey)}
        <select data-notice-kind={c.kind} value={muted.includes(c.kind) ? 'mute' : batched.includes(c.kind) ? 'batch' : 'default'} onChange={(e)=>setChosen({muted:[...muted.filter(k=>k!==c.kind),...(e.target.value==='mute' ? [c.kind] : [])],batched:[...batched.filter(k=>k!==c.kind),...(e.target.value==='batch' ? [c.kind] : [])]})}>
          <option value="default">{t('noticeRules.officeDefault')}</option><option value="mute">{t('noticeRules.mute')}</option><option value="batch">{t('noticeRules.batch')}</option>
        </select>
      </label>)}</div>
      {reading.choices.some((c)=>c.wakes && muted.includes(c.kind)) ? <p>{t('noticeRules.warning')}</p> : null}
      <label>{t('noticeRules.reason')}<input type="text" value={because} maxLength={500} onChange={(e)=>setBecause(e.target.value)} /></label>
      <button disabled={busy || !because.trim()} onClick={()=>{void save(muted,batched)}}>{t('noticeRules.save')}</button>
      <button disabled={busy || !because.trim()} onClick={()=>{void save([],[])}}>{t('noticeRules.defaults')}</button>
      <details><summary>{t('noticeRules.history')}</summary>{reading.history.map((h)=><p key={h.seq}>{t('noticeRules.version',{at:h.at,who:h.by})} <span data-restore-effect=''>{t('noticeRules.restoreEffect',{muted:String(Array.isArray(h.mutedKinds) ? h.mutedKinds.length : 0),batched:String(Array.isArray(h.batchedKinds) ? h.batchedKinds.length : 0)})}</span> <button disabled={busy || !because.trim()} onClick={()=>{void save([],[],h.seq)}}>{t('noticeRules.restore')}</button></p>)}{reading.historySays ? <p>{content(reading.historySays)} {reading.recordId ? <RouteLink to={recordPath(reading.recordId)}>{t('noticeRules.fullHistory')}</RouteLink> : null}</p> : null}</details>
    </> : null}
    {fault ? <ErrorNote message={fault.message} fault={fault.fault} /> : null}
  </details>
}
