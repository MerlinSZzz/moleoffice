// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useState } from 'react'
import { t, type Word, type WordKey } from '@shared/i18n.ts'
import { settingsControlWord } from '@shared/settings-declaration.ts'
import { wordGeneration } from '@shared/word-settings.ts'
import type { AWordNotUsed, WordHistory, WordTableRow } from '../../server/api/word-settings.ts'
import { errorMessage, faultOf, moleOfficeRequest } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { useMode } from '../lib/mode.ts'
import { readPageWords } from '../lib/word-settings.ts'
import { Btn, ErrorNote, Loading, useAsync } from './ui.tsx'

interface TableReply { words: WordTableRow[]; count: number; next: number | null; storedButNotUsed: AWordNotUsed[] }
const standingWords = { matches: 'wordTable.matches', noChinese: 'wordTable.waiting', englishChanged: 'wordTable.englishChanged', nobodyRecorded: 'wordTable.nobodyRecorded' } as const

/** English beside Chinese, with small pages and no change to content somebody authored. */
export function WordTable() {
  useLanguage()
  const [search, setSearch] = useState(''), [offset, setOffset] = useState(0)
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  const [openedHistories, setOpenedHistories] = useState<ReadonlySet<string>>(new Set())
  const [reading, again] = useAsync(() => moleOfficeRequest<TableReply>(`/api/words/table?search=${encodeURIComponent(search)}&offset=${offset}&limit=10`), [search, offset, wordGeneration()])
  return <section className="wt" data-word-table="">
    <style href="mole-office-word-table" precedence="default">{CSS}</style>
    <h3>{t('settings.words.title')}</h3>
    <p>{t('wordTable.explain')}</p>
    <label>{t(settingsControlWord('settings.words', 'wordTable.find'))}<input value={search} onChange={e => { setSearch(e.target.value); setOffset(0) }} /></label>
    {reading.status === 'loading' ? <Loading what={t('wordTable.reading')} /> : null}
    {reading.status === 'error' ? <ErrorNote message={reading.message} fault={reading.fault} /> : null}
    {reading.status === 'ready' ? <>
      {reading.value.storedButNotUsed.length > 0 ? <WordsNotUsed words={reading.value.storedButNotUsed} again={again} /> : null}
      <p>{t('wordTable.count', { n: reading.value.count })}</p>
      {reading.value.words.map(row => <WordRow key={row.key + ':' + row.version} row={row} again={again}
        open={opened.has(row.key)} onOpen={open => setOpened(previous => { if (previous.has(row.key) === open) return previous; const next = new Set(previous); if (open) next.add(row.key); else next.delete(row.key); return next })}
        past={openedHistories.has(row.key)} onPast={open => setOpenedHistories(previous => { if (previous.has(row.key) === open) return previous; const next = new Set(previous); if (open) next.add(row.key); else next.delete(row.key); return next })}
      />)}
      <div className="wt-actions">
        {offset > 0 ? <Btn onClick={() => setOffset(Math.max(0, offset - 10))}>{t(settingsControlWord('settings.words', 'wordTable.previous'))}</Btn> : null}
        {reading.value.next !== null ? <Btn onClick={() => setOffset(reading.value.next!)}>{t(settingsControlWord('settings.words', 'wordTable.more'))}</Btn> : null}
      </div>
    </> : null}
  </section>
}
/** Saved words this release cannot use, each with the press that removes it so the shipped word applies. */
function WordsNotUsed({ words, again }: { words: AWordNotUsed[]; again: () => void }) {
  const [because, setBecause] = useState(''), [busy, setBusy] = useState(false), [fault, setFault] = useState<unknown>(null)
  const remove = async (word: AWordNotUsed) => {
    setBusy(true); setFault(null)
    try {
      await moleOfficeRequest('/api/words/restore', { method: 'POST', body: JSON.stringify({ key: word.key, version: word.version, from: 'shipped', because }) })
      setBecause(''); await readPageWords(); again()
    } catch (error) { setFault(error) }
    finally { setBusy(false) }
  }
  return <div className="wt-not-used" role="status" data-words-not-used="">
    <p>{t('wordTable.notUsed', { n: words.length })} {t('wordTable.notUsedInstead')}</p>
    <ul>{words.map(word => <li key={word.key} data-word-not-used={word.key}>
      <code>{word.key}</code>
      <ul>{word.problems.map((problem, i) => <li key={i}>{problem}</li>)}</ul>
      <Btn disabled={busy || !because.trim()} reason={busy ? t('wordTable.saving') : !because.trim() ? t('wordTable.needReason') : undefined} onClick={() => { void remove(word) }}>{t(settingsControlWord('settings.words', 'wordTable.removeNotUsed'))}</Btn>
    </li>)}</ul>
    <label>{t(settingsControlWord('settings.words', 'wordTable.notUsedReason'))}<input value={because} onChange={e => setBecause(e.target.value)} disabled={busy} /></label>
    {fault === null ? null : <ErrorNote message={errorMessage(fault)} fault={faultOf(fault)} />}
  </div>
}
function WordFields({ label, value, plural, onChange, disabled }: { label: string; value: Word | null; plural: boolean; onChange: (word: Word | null) => void; disabled: boolean }) {
  const forms = value === null ? { other: '' } : typeof value === 'string' ? { other: value } : value
  return <div className="wt-language"><h4>{label}</h4>{Object.entries(forms).map(([form, line]) => <label key={form}>
    {plural ? form : label}
    <textarea aria-label={plural ? `${label} ${form}` : label} value={line} disabled={disabled} rows={3} onChange={e => {
      const next = e.target.value
      onChange(typeof value === 'string' || (!plural && value === null) ? next : { ...forms, [form]: next })
    }} />
  </label>)}</div>
}
function WordRow({ row, again, open, onOpen, past, onPast }: { row: WordTableRow; again: () => void; open: boolean; onOpen: (open: boolean) => void; past: boolean; onPast: (open: boolean) => void }) {
  const inspect = useMode() === 'inspect'
  const [en, setEn] = useState<Word>(row.en), [zh, setZh] = useState<Word | null>(row.zh)
  const [because, setBecause] = useState(''), [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false), [fault, setFault] = useState<unknown>(null), [historyOffset, setHistoryOffset] = useState(0)
  const [history] = useAsync(() => past ? moleOfficeRequest<WordHistory>(`/api/words/history?key=${encodeURIComponent(row.key)}&offset=${historyOffset}`) : Promise.resolve(null), [past, row.version, historyOffset])
  const write = async (from?: string) => {
    setBusy(true); setFault(null)
    try {
      await moleOfficeRequest(`/api/words/${from === undefined ? 'table' : 'restore'}`, { method: 'POST', body: JSON.stringify({ key: row.key, version: row.version, because, ...(from === undefined ? { en, zh, chineseMatchesEnglish: confirmed } : { from }) }) })
      await readPageWords(); again()
    } catch (error) { setFault(error) }
    finally { setBusy(false) }
  }
  const lines = (word: Word | null) => word === null ? t('wordTable.noChinese') : typeof word === 'string' ? word : Object.entries(word).map(([form, line]) => `${form}: ${line}`).join('\n')
  return <details className="wt-row" data-word-key={row.key} open={open} onToggle={e => onOpen(e.currentTarget.open)}>
    <summary><span className="wt-preview"><span lang="en">{lines(row.en)}</span><span lang="zh">{lines(row.zh)}</span></span>{inspect ? <small data-word-key-label="">{row.key}</small> : null}<small>{t(standingWords[row.standing])}</small></summary>
    <p>{row.substitutions.length > 0 ? t('wordTable.values', { values: row.substitutions.map(name => `{${name}}`).join(', ') }) : t('wordTable.noValues')}</p>
    {row.plural ? <p>{t('wordTable.plural')}</p> : null}
    <div className="wt-pair">
      <WordFields label={t(settingsControlWord('settings.words', 'wordTable.english'))} value={en} plural={typeof en !== 'string'} onChange={word => setEn(word!)} disabled={busy} />
      <WordFields label={t(settingsControlWord('settings.words', 'wordTable.chinese'))} value={zh} plural={zh === null ? row.plural : typeof zh !== 'string'} onChange={setZh} disabled={busy} />
    </div>
    <label className="wt-confirm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={busy} />{t(settingsControlWord('settings.words', 'wordTable.confirm'))}</label>
    <label>{t(settingsControlWord('settings.words', 'wordTable.reason'))}<input value={because} onChange={e => setBecause(e.target.value)} disabled={busy} /></label>
    {fault === null ? null : <ErrorNote message={errorMessage(fault)} fault={faultOf(fault)} />}
    <div className="wt-actions"><Btn disabled={busy || !because.trim()} reason={busy ? t('wordTable.saving') : !because.trim() ? t('wordTable.needReason') : undefined} onClick={() => { void write() }}>{t(settingsControlWord('settings.words', 'wordTable.save'))}</Btn><Btn disabled={busy || !because.trim()} reason={busy ? t('wordTable.saving') : !because.trim() ? t('wordTable.needReason') : undefined} onClick={() => { void write('shipped') }}>{t(settingsControlWord('settings.words', 'wordTable.shipped'))}</Btn></div>
    <details><summary>{t(settingsControlWord('settings.words', 'wordTable.shippedLines'))}</summary><div className="wt-pair"><pre>{lines(row.shipped.en)}</pre><pre>{lines(row.shipped.zh)}</pre></div></details>
    <details open={past} onToggle={e => onPast(e.currentTarget.open)}><summary>{t(settingsControlWord('settings.words', 'wordTable.history'))}</summary>
      {history.status === 'loading' ? <Loading what={t(settingsControlWord('settings.words', 'wordTable.history'))} /> : null}
      {history.status === 'error' ? <ErrorNote message={history.message} fault={history.fault} /> : null}
      {history.status === 'ready' && history.value !== null ? history.value.versions.length === 0 ? <p>{t('wordTable.noHistory')}</p> : history.value.versions.map(version => {
        const after = version.after as { choice: { en: Word; zh: Word | null } | null; because: string }
        if (after.choice === null) return <div key={version.id}><p>{t('wordTable.version', { at: version.at, who: version.by.id, because: after.because })}</p><p>{t('wordTable.removedNotUsed')}</p></div>
        return <div key={version.id}><p>{t('wordTable.version', { at: version.at, who: version.by.id, because: after.because })}</p><div className="wt-pair"><pre>{lines(after.choice.en)}</pre><pre>{lines(after.choice.zh)}</pre></div><Btn disabled={busy || !because.trim()} reason={busy ? t('wordTable.saving') : !because.trim() ? t('wordTable.needReason') : undefined} onClick={() => { void write(version.id) }}>{t(settingsControlWord('settings.words', 'wordTable.restore'))}</Btn></div>
      }) : null}
      {historyOffset > 0 ? <Btn onClick={() => setHistoryOffset(Math.max(0, historyOffset - 10))}>{t(settingsControlWord('settings.words', 'wordTable.newerChoices'))}</Btn> : null}
      {history.status === 'ready' && history.value?.next != null ? <Btn onClick={() => setHistoryOffset(history.value!.next!)}>{t(settingsControlWord('settings.words', 'wordTable.olderChoices'))}</Btn> : null}
    </details>
  </details>
}
const CSS = `
.wt { min-width:0; font-size:var(--fs-1); }
.wt p { margin:.6rem 0; }
.wt label { display:grid; gap:.35rem; margin:.6rem 0; min-width:0; }
.wt input:not([type=checkbox]), .wt textarea { box-sizing:border-box; width:100%; min-width:0; font:inherit; color:var(--text); background:var(--panel); border:1px solid var(--border-strong); padding:.5rem; }
.wt textarea { resize:vertical; }
.wt-row { border-top:1px solid var(--border-strong); padding:.7rem 0; }
.wt-row summary { cursor:pointer; overflow-wrap:anywhere; }
.wt-row summary small { display:block; font-size:.8rem; color:var(--text-3); margin:.25rem 0; }
.wt-preview { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:1rem; white-space:pre-wrap; }
.wt-pair { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:1rem; }
.wt h4 { font-size:1rem; margin:.4rem 0; }
.wt .wt-confirm { display:flex; align-items:start; }
.wt-confirm input { flex-shrink:0; }
.wt-actions { display:flex; flex-wrap:wrap; gap:.5rem; margin:.7rem 0; }
.wt-not-used { border-left:3px solid var(--st-broken-line); padding:.2rem 0 .2rem .8rem; margin:.8rem 0; overflow-wrap:anywhere; }
.wt-not-used ul { margin:.4rem 0; padding-left:1.2rem; }
.wt-not-used > ul > li { margin:.6rem 0; }
.wt-not-used li ul { list-style:disc; }
.wt-not-used code { overflow-wrap:anywhere; }
.wt pre { white-space:pre-wrap; overflow-wrap:anywhere; font:inherit; min-width:0; }
@media(max-width:40rem) { .wt-pair, .wt-preview { grid-template-columns:minmax(0,1fr); gap:.2rem; } }
`
