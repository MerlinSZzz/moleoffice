// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { t } from '@shared/i18n.ts'
import { knowledgeAddress, type Route } from '@shared/addresses.ts'
import { api, errorMessage } from '../api.ts'
import { stampToTheMinute } from '../lib/minute.ts'
import type { KnowledgeCategoryRead, KnowledgeEntry, KnowledgeEntryRead, KnowledgeFields, KnowledgePath, KnowledgeRoots, KnowledgeSource, KnowledgeState, KnowledgeTreeNode } from '../api-parts/knowledge.ts'

type PageRoute = Extract<Route, { name: 'knowledge' }>
type Panel = 'entry' | 'category' | 'move' | null
const blank = (category: string): KnowledgeFields => ({ title: '', opening: '', category, language: '', body: '', resources: [], sources: [], aliases: [], reason: '' })
const categoryHref = (categoryId: string) => knowledgeAddress({ name: 'knowledge', categoryId })
const entryHref = (entryId: string) => knowledgeAddress({ name: 'knowledge', entryId })
const titlePath = (path: KnowledgePath) => [t('knowledge.title'), ...path.map(part => part.title)].join(' › ')
const stateWord = (state: KnowledgeState) => state === 'waiting' ? t('knowledge.waiting') : state === 'refused' ? t('knowledge.refused') : t('knowledge.inForce')
const stringValue = (value: unknown): string => typeof value === 'string' ? value : ''
const languageWord = (value: unknown): string => value === 'en' ? t('knowledge.english') : value === 'zh' ? t('knowledge.chinese') : stringValue(value)
const arrayValue = <T,>(value: unknown): T[] => Array.isArray(value) ? value as T[] : []

export function KnowledgePage({ route }: { route: PageRoute }) {
  const [roots, setRoots] = useState<KnowledgeRoots | null>(null)
  const [paths, setPaths] = useState<Record<string, KnowledgePath>>({})
  const [category, setCategory] = useState<KnowledgeCategoryRead | null>(null)
  const [entry, setEntry] = useState<KnowledgeEntryRead | null>(null)
  const [search, setSearch] = useState('')
  const [searched, setSearched] = useState<string | null>(null)
  const [results, setResults] = useState<{ entry: KnowledgeEntry; path: KnowledgePath }[]>([])
  const [failure, setFailure] = useState('')
  const [panelFailure, setPanelFailure] = useState('')
  const [panel, setPanel] = useState<Panel>(null)
  const [editing, setEditing] = useState(false)
  const [aliasText, setAliasText] = useState('')
  const [fields, setFields] = useState<KnowledgeFields>(blank(''))
  const [categoryTitle, setCategoryTitle] = useState('')
  const [place, setPlace] = useState<string | null>(null)
  const [moveReason, setMoveReason] = useState('')
  const [answerReason, setAnswerReason] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  const [reload, setReload] = useState(0)
  const [contentsOpen, setContentsOpen] = useState(false)
  const refresh = () => setReload(n => n + 1)
  useEffect(() => {
    let active = true
    setFailure(''); setRoots(null); setCategory(null); setEntry(null)
    async function read() {
      try {
        const all = await api.knowledgeRoots()
        const categoryReads = await Promise.all(all.tree.map(node => api.knowledgeCategory(node.id)))
        const byId = Object.fromEntries(categoryReads.map(item => [item.category.id, item]))
        const currentEntry = route.entryId ? await api.knowledgeEntry(route.entryId) : null
        const currentCategory = currentEntry ? byId[stringValue(currentEntry.entry.data['category'])] : route.categoryId ? byId[route.categoryId] : null
        if (route.categoryId && !currentCategory) await api.knowledgeCategory(route.categoryId)
        if (!active) return
        setRoots(all); setPaths(Object.fromEntries(categoryReads.map(item => [item.category.id, item.path])))
        setEntry(currentEntry); setCategory(currentCategory ?? null)
      } catch (error) { if (active) setFailure(errorMessage(error)) }
    }
    void read()
    return () => { active = false }
  }, [route.categoryId, route.entryId, reload])
  useEffect(() => { setSearched(null); setSearch(''); setContentsOpen(false) }, [route.categoryId, route.entryId])
  const currentPath = entry?.path ?? category?.path ?? []
  const currentCategoryId = category?.category.id ?? null
  const openEntry = (edit: boolean) => {
    setEditing(edit)
    const data = edit ? entry?.entry.data : undefined
    setFields(data && entry ? { title: entry.entry.title, opening: entry.entry.opening ?? '', category: stringValue(data['category']), language: stringValue(data['language']), body: stringValue(data['body']), resources: arrayValue(data['resources']), sources: arrayValue(data['sources']), aliases: arrayValue(data['aliases']), reason: '' } : blank(currentCategoryId ?? ''))
    setAliasText(data ? arrayValue<string>(data['aliases']).join(', ') : '')
    setPanelFailure(''); setPanel('entry')
  }
  const openCategory = () => { setCategoryTitle(''); setPlace(currentCategoryId); setPanelFailure(''); setPanel('category') }
  const openMove = () => { setPlace(typeof category?.category.data['parent'] === 'string' ? category.category.data['parent'] : null); setMoveReason(''); setPanelFailure(''); setPanel('move') }
  async function runSearch(event: FormEvent) {
    event.preventDefault(); setFailure('')
    try {
      const reply = await api.knowledgeSearch(search)
      const latest = await api.knowledgeRoots()
      const categories = await Promise.all(latest.tree.map(node => api.knowledgeCategory(node.id)))
      const entries = new Map(categories.flatMap(category => category.entries.map(entry => [entry.id, { entry, path: category.path }] as const)))
      const found = reply.results.map(hit => entries.get(hit.record.id))
      if (found.some(item => item === undefined)) throw new Error(t('knowledge.resultsChanged'))
      setSearched(search); setResults(found.filter((item): item is { entry: KnowledgeEntry; path: KnowledgePath } => item !== undefined))
    } catch (error) { setFailure(errorMessage(error)) }
  }
  async function saveEntry(event: FormEvent) {
    event.preventDefault(); setPanelFailure('')
    try {
      const payload = { ...fields, aliases: aliasText.split(',').map(value => value.trim()).filter(Boolean) }
      const result = editing && entry ? await api.knowledgeEditEntry(entry.entry.id, payload) : await api.knowledgeCreateEntry(payload)
      setNotice(result.waiting ? t('knowledge.waiting') : t('knowledge.applied')); setPanel(null); refresh()
      if (!editing) window.location.hash = entryHref(result.entry.id)
    } catch (error) { setPanelFailure(errorMessage(error)) }
  }
  async function saveCategory(event: FormEvent) {
    event.preventDefault(); setPanelFailure('')
    try { const result = await api.knowledgeCreateCategory(categoryTitle, place); setPanel(null); refresh(); window.location.hash = categoryHref(result.category.id) }
    catch (error) { setPanelFailure(errorMessage(error)) }
  }
  async function saveMove(event: FormEvent) {
    event.preventDefault(); if (!currentCategoryId) return; setPanelFailure('')
    try { await api.knowledgeMoveCategory(currentCategoryId, place, moveReason); setPanel(null); refresh() }
    catch (error) { setPanelFailure(errorMessage(error)) }
  }
  async function answer(id: string, action: 'confirm' | 'refuse') {
    setFailure('')
    try { await api.knowledgeAnswer(id, action, answerReason[id] ?? ''); refresh() }
    catch (error) { setFailure(errorMessage(error)) }
  }
  const tree = roots?.tree ?? []
  const descendants = new Set<string>()
  if (currentCategoryId) {
    descendants.add(currentCategoryId)
    const queue = [currentCategoryId]
    for (const id of queue) for (const child of tree.filter(node => node.parent === id)) if (!descendants.has(child.id)) { descendants.add(child.id); queue.push(child.id) }
  }
  const movingNodes = tree.filter(node => descendants.has(node.id))
  const movingEntries = movingNodes.reduce((sum, node) => sum + node.entryCount, 0)
  const currentParent = typeof category?.category.data['parent'] === 'string' ? category.category.data['parent'] : null
  const placePath = place === null ? [] : paths[place] ?? []
  return <div className="page kn">
    <style href="mole-office-knowledge" precedence="default">{KNOWLEDGE_CSS}</style>
    <header className="kn-head"><div><h1>{t('knowledge.title')}</h1><p>{t('knowledge.intro')} {roots && t('knowledge.totals', { entries: t('knowledge.entryCount', { n: roots.totals.entries }), categories: t('knowledge.categoryCount', { n: roots.totals.categories }) })}</p></div>
      <form onSubmit={event => void runSearch(event)}><input aria-label={t('knowledge.search')} placeholder={t('knowledge.search')} value={search} onChange={event => setSearch(event.target.value)} /></form>
      <button className="kn-primary" onClick={() => openEntry(false)}>{t('knowledge.newEntry')}</button><button onClick={openCategory}>{t('knowledge.newCategory')}</button>
    </header>
    {failure && <p role="alert" className="kn-error">{failure}</p>}{notice && <p role="status">{notice}</p>}
    {!roots && !failure && <p>{t('knowledge.loading')}</p>}
    {roots && <div className="kn-layout">
      <aside className="kn-contents"><button className="kn-fold" onClick={() => setContentsOpen(!contentsOpen)} aria-expanded={contentsOpen}>{titlePath(currentPath)}{entry ? ` › ${entry.entry.title}` : ''} <span>▾</span></button>
        <div className={`kn-contents-body ${contentsOpen ? 'kn-open' : ''}`}><div className="kn-contents-heading"><strong>{t('knowledge.contents')}</strong><small>{t('knowledge.oneLevel')}</small></div>
          <a className={!currentPath.length && !searched ? 'kn-selected' : ''} href={knowledgeAddress({ name: 'knowledge' })}>▾ &nbsp;{t('knowledge.title')}</a>
          <TreeRows nodes={tree} parent={null} path={currentPath} entries={category?.entries ?? []} {...(entry ? { entryId: entry.entry.id } : {})} depth={0} />
        </div></aside>
      <main className="kn-main"><nav className="kn-path"><a href={knowledgeAddress({ name: 'knowledge' })}>{t('knowledge.title')}</a>{currentPath.map(part => <span key={part.id}> › <a href={categoryHref(part.id)}>{part.title}</a></span>)}{entry && <span> › {entry.entry.title}</span>}</nav>
        {searched !== null ? <section><h2>{t('knowledge.searchResults', { query: searched })}</h2>{results.length ? results.map(item => <a className="kn-card" href={entryHref(item.entry.id)} key={item.entry.id}><strong>{item.entry.title}</strong><span>{item.entry.opening}</span><small>{titlePath(item.path)}</small></a>) : <p>{t('knowledge.none')}</p>}</section>
          : entry ? <section><div className="kn-line"><h2>{entry.entry.title}</h2><button onClick={() => openEntry(true)}>{t('knowledge.edit')}</button></div>
            {entry.waitingChanges.map(change => <div className="kn-waiting" key={change.id}><strong>{t('knowledge.changeWaiting')}</strong><Proposal proposal={change.proposal} paths={paths} /><p>{t('knowledge.reason')}: {stringValue(change.data['reason'])}</p><label>{t('knowledge.answerReason')}<input required value={answerReason[change.id] ?? ''} onChange={event => setAnswerReason({ ...answerReason, [change.id]: event.target.value })} /></label><div><button onClick={() => void answer(change.id, 'confirm')}>{t('knowledge.confirm')}</button> <button onClick={() => void answer(change.id, 'refuse')}>{t('knowledge.refuse')}</button></div></div>)}
            <p className="kn-muted">{languageWord(entry.entry.data['language'])} · {stateWord(entry.entryStatus)} · {t('knowledge.written', { at: stampToTheMinute(entry.entry.createdAt) })} · {t('knowledge.changed', { n: entry.history.filter(item => item.change.data['creation'] !== true).length })}</p>
            <div className="kn-reading"><article><p className="kn-opening">{entry.entry.opening}</p><div className="kn-body">{stringValue(entry.entry.data['body'])}</div></article><aside className="kn-facts">
              <Fact title={t('knowledge.resources')}>{arrayValue<{ what: string; where: string; how: string }>(entry.entry.data['resources']).length ? arrayValue<{ what: string; where: string; how: string }>(entry.entry.data['resources']).map((r, index) => <p key={index}>{r.what} · {r.where} · {r.how}</p>) : t('knowledge.none')}</Fact>
              <Fact title={t('knowledge.sourcesCount', { count: arrayValue(entry.entry.data['sources']).length })}>{arrayValue<KnowledgeSource>(entry.entry.data['sources']).length ? arrayValue<KnowledgeSource>(entry.entry.data['sources']).map((source, index) => <p key={index}>{source.url ? <a href={source.url}>{source.url}</a> : source.record ? <a href={`#/r/${encodeURIComponent(source.record)}`}>{source.record}</a> : source.measurement}</p>) : t('knowledge.none')}</Fact>
              <Fact title={t('knowledge.aliases')}>{arrayValue<string>(entry.entry.data['aliases']).join(', ') || t('knowledge.none')}</Fact>
              <Fact title={t('knowledge.projects')}>{entry.projects.length ? entry.projects.map(project => <p key={project.id}>{project.title}</p>) : t('knowledge.none')}</Fact>
              <Fact title={t('knowledge.ratings')}>{entry.ratings.count ? t('knowledge.ratingAverage', { ratings: t('knowledge.ratingCount', { n: entry.ratings.count }), average: (entry.ratings.average ?? 0).toFixed(1) }) : t('knowledge.notYet')}</Fact>
              <Fact title={t('knowledge.history')}>{entry.history.length ? entry.history.map(item => <p key={item.id}>{stampToTheMinute(item.createdAt)} · {item.reason}</p>) : t('knowledge.none')}</Fact>
            </aside></div></section>
          : <section><div className="kn-line"><h2>{category?.category.title ?? t('knowledge.top')}</h2>{category && <div><button onClick={openCategory}>{t('knowledge.newSubcategory')}</button> <button onClick={openMove}>{t('knowledge.moveCategory')}</button></div>}</div>
            {!category && <p className="kn-muted">{t('knowledge.topDescription')}</p>}
            <h3>{category ? t('knowledge.subcategoriesCount', { count: category.subcategories.length }) : t('knowledge.categoriesCount', { count: roots.categories.length })}</h3>
            {(category ? category.subcategories : tree.filter(node => node.parent === null)).length ? (category ? category.subcategories : tree.filter(node => node.parent === null)).map(node => <CategoryCard key={node.id} node={node} />) : <p>{t('knowledge.none')}</p>}
            {category && <><h3>{t('knowledge.entries')}</h3>{category.entries.length ? category.entries.map(item => <a href={entryHref(item.id)} className="kn-card" key={item.id}><strong>{item.title}</strong><span>{item.opening}</span><small>{stateWord(item.entryStatus)}</small></a>) : <p>{t('knowledge.none')}</p>}</>}
          </section>}
      </main></div>}
    {panel && <div className="kn-overlay"><div className="kn-scrim" onClick={() => setPanel(null)} /><aside className="kn-panel" role="dialog" aria-modal="true" aria-label={panel === 'entry' ? editing ? t('knowledge.editEntry') : t('knowledge.newEntry') : panel === 'move' ? t('knowledge.moveCategory') : t('knowledge.newCategory')}>
      <div className="kn-line"><h2>{panel === 'entry' ? editing ? t('knowledge.editEntry') : t('knowledge.newEntry') : panel === 'move' ? t('knowledge.moveCategory') : t('knowledge.newCategory')}</h2><button type="button" onClick={() => setPanel(null)} aria-label={t('knowledge.cancel')}>×</button></div>
      {panelFailure && <p className="kn-error" role="alert">{panelFailure}</p>}
      {panel === 'entry' && <form className="kn-form" onSubmit={event => void saveEntry(event)}>
        <p>{t('knowledge.editHelp')}</p>
        <label>{t('knowledge.fieldTitle')}<input required value={fields.title} onChange={event => setFields({ ...fields, title: event.target.value })} /></label>
        <label>{t('knowledge.opening')} <small>{Array.from(fields.opening).length}/200</small><textarea value={fields.opening} onChange={event => setFields({ ...fields, opening: Array.from(event.target.value).slice(0, 200).join('') })} /></label>
        <label>{t('knowledge.category')}<select required value={fields.category} onChange={event => setFields({ ...fields, category: event.target.value })}><option value="">{t('knowledge.chooseCategory')}</option>{tree.map(node => <option key={node.id} value={node.id}>{titlePath(paths[node.id] ?? [])}</option>)}</select></label>
        <label>{t('knowledge.language')}<input required value={fields.language} onChange={event => setFields({ ...fields, language: event.target.value })} /></label>
        <label>{t('knowledge.body')}<textarea rows={10} value={fields.body} onChange={event => setFields({ ...fields, body: event.target.value })} /></label>
        <fieldset><legend>{t('knowledge.resources')}</legend>{fields.resources.map((resource, i) => <div className="kn-form-group" key={i}>{(['what', 'where', 'how'] as const).map(key => <label key={key}>{t(key === 'what' ? 'knowledge.what' : key === 'where' ? 'knowledge.where' : 'knowledge.how')}<input required value={resource[key]} onChange={event => setFields({ ...fields, resources: fields.resources.map((r, index) => index === i ? { ...r, [key]: event.target.value } : r) })} /></label>)}<button type="button" onClick={() => setFields({ ...fields, resources: fields.resources.filter((_, index) => index !== i) })}>{t('knowledge.remove')}</button></div>)}<button type="button" onClick={() => setFields({ ...fields, resources: [...fields.resources, { what: '', where: '', how: '' }] })}>+ {t('knowledge.addResource')}</button></fieldset>
        <fieldset><legend>{t('knowledge.sources')}</legend>{fields.sources.map((source, i) => { const key = source.record !== undefined ? 'record' : source.measurement !== undefined ? 'measurement' : 'url'; return <div className="kn-form-group" key={i}><label>{t('knowledge.sourceType')}<select value={key} onChange={event => setFields({ ...fields, sources: fields.sources.map((s, index) => index === i ? { [event.target.value]: '' } : s) })}><option value="record">{t('knowledge.record')}</option><option value="url">{t('knowledge.link')}</option><option value="measurement">{t('knowledge.measurement')}</option></select></label><input aria-label={t('knowledge.sourceValue')} required value={source[key] ?? ''} onChange={event => setFields({ ...fields, sources: fields.sources.map((s, index) => index === i ? { [key]: event.target.value } : s) })} /><button type="button" onClick={() => setFields({ ...fields, sources: fields.sources.filter((_, index) => index !== i) })}>{t('knowledge.remove')}</button></div> })}<button type="button" onClick={() => setFields({ ...fields, sources: [...fields.sources, { record: '' }] })}>+ {t('knowledge.addSource')}</button></fieldset>
        <label>{t('knowledge.aliases')}<input value={aliasText} onChange={event => setAliasText(event.target.value)} /></label>
        <label>{t('knowledge.reason')}<textarea required value={fields.reason} onChange={event => setFields({ ...fields, reason: event.target.value })} /></label><div><button className="kn-primary" type="submit">{t('knowledge.save')}</button> <button type="button" onClick={() => setPanel(null)}>{t('knowledge.cancel')}</button></div>
      </form>}
      {panel === 'category' && <form className="kn-form" onSubmit={event => void saveCategory(event)}><label>{t('knowledge.fieldTitle')}<input required value={categoryTitle} onChange={event => setCategoryTitle(event.target.value)} /></label><label>{t('knowledge.place')}<select value={place ?? ''} onChange={event => setPlace(event.target.value || null)}><option value="">{t('knowledge.top')}</option>{tree.map(node => <option key={node.id} value={node.id}>{titlePath(paths[node.id] ?? [])}</option>)}</select></label><div><button className="kn-primary" type="submit">{t('knowledge.create')}</button> <button type="button" onClick={() => setPanel(null)}>{t('knowledge.cancel')}</button></div></form>}
      {panel === 'move' && <form className="kn-form" onSubmit={event => void saveMove(event)}><p>{t('knowledge.currentPlace')}: {titlePath(currentPath)}</p><fieldset><legend>{t('knowledge.choosePlace')}</legend>{[{ id: null, title: t('knowledge.topPlace') }, ...tree.map(node => ({ id: node.id, title: titlePath(paths[node.id] ?? []) }))].map(option => <label className="kn-place" key={option.id ?? 'root'}><input type="radio" name="place" checked={place === option.id} disabled={option.id !== null && descendants.has(option.id)} onChange={() => setPlace(option.id)} /><span>{option.title} {option.id === currentParent && <small>{t('knowledge.currentHere')}</small>} {option.id === currentCategoryId && <small>{t('knowledge.itself')}</small>} {option.id !== null && option.id !== currentCategoryId && descendants.has(option.id) && <small>{t('knowledge.inside')}</small>}</span></label>)}</fieldset><p>{t('knowledge.moveWith', { categories: t('knowledge.subcategoryCount', { n: Math.max(0, movingNodes.length - 1) }), entries: t('knowledge.entryCount', { n: movingEntries }) })}</p><p>{t('knowledge.afterMove')}: {titlePath([...placePath, ...(category ? [{ id: category.category.id, title: category.category.title }] : [])])}</p><label>{t('knowledge.reason')}<textarea required value={moveReason} onChange={event => setMoveReason(event.target.value)} /></label><div><button className="kn-primary" type="submit">{t('knowledge.move')}</button> <button type="button" onClick={() => setPanel(null)}>{t('knowledge.cancel')}</button></div></form>}
    </aside></div>}
  </div>
}
function Proposal({ proposal, paths }: { proposal: Record<string, unknown>; paths: Record<string, KnowledgePath> }) {
  const labels = {
    title: t('knowledge.fieldTitle'), opening: t('knowledge.opening'), category: t('knowledge.category'),
    language: t('knowledge.language'), body: t('knowledge.body'), resources: t('knowledge.resources'),
    sources: t('knowledge.sources'), aliases: t('knowledge.aliases'),
  }
  return <dl>{Object.entries(labels).filter(([key]) => Object.hasOwn(proposal, key)).map(([key, label]) => {
    const value = proposal[key]
    const text = key === 'category' && typeof value === 'string' ? titlePath(paths[value] ?? [])
      : Array.isArray(value) ? value.map(item => typeof item === 'object' && item !== null ? Object.values(item).join(' · ') : String(item)).join('; ')
      : stringValue(value)
    return <div key={key}><dt>{label}</dt><dd className="kn-body">{text || t('knowledge.none')}</dd></div>
  })}</dl>
}
function Fact({ title, children }: { title: string; children: ReactNode }) { return <section><h3>{title}</h3><div>{children}</div></section> }
function CategoryCard({ node }: { node: { id: string; title: string; subcategoryCount: number; entryCount: number } }) { return <a href={categoryHref(node.id)} className="kn-card"><strong>▸ &nbsp;{node.title}</strong><small>{t('knowledge.counts', { categories: t('knowledge.subcategoryCount', { n: node.subcategoryCount }), entries: t('knowledge.entryCount', { n: node.entryCount }) })}</small><span className="kn-enter">{t('knowledge.enter')} ›</span></a> }
function TreeRows({ nodes, parent, path, entries, entryId, depth }: { nodes: KnowledgeTreeNode[]; parent: string | null; path: KnowledgePath; entries: KnowledgeCategoryRead['entries']; entryId?: string; depth: number }) {
  return <div className="kn-tree">{nodes.filter(node => node.parent === parent).map(node => { const opened = path.some(part => part.id === node.id), current = path[path.length - 1]?.id === node.id; return <div key={node.id}><a className={current && !entryId ? 'kn-selected' : ''} href={categoryHref(node.id)}><span>{opened ? '▾' : '▸'} &nbsp;{node.title}</span>{node.entryCount > 0 && <small>{t('knowledge.entryCount', { n: node.entryCount })}</small>}</a>{opened && <TreeRows nodes={nodes} parent={node.id} path={path} entries={entries} {...(entryId ? { entryId } : {})} depth={depth + 1} />}{current && entries.map(item => <a className={entryId === item.id ? 'kn-selected' : ''} key={item.id} href={entryHref(item.id)}>{item.title}</a>)}</div> })}</div>
}
const KNOWLEDGE_CSS = `
.kn { color: var(--text); }
.kn-head { display: flex; align-items: flex-start; flex-wrap: wrap; gap: var(--gut); margin-bottom: var(--pad-lg); }
.kn-head > div { flex: 1 1 24rem; } .kn h1, .kn h2, .kn h3, .kn p { margin-top: 0; }
.kn-head h1 { margin-bottom: var(--pad); } .kn-head p, .kn-muted, .kn small { color: var(--text-2); }
.kn button, .kn input, .kn select, .kn textarea { font: inherit; color: var(--text); background: var(--panel); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); padding: var(--pad); }
.kn button { cursor: pointer; } .kn button.kn-primary { background: var(--accent); color: var(--accent-text); }
.kn-layout { display: grid; grid-template-columns: minmax(14rem, 19rem) minmax(0, 1fr); gap: var(--pad-lg); align-items: start; }
.kn-contents, .kn-card, .kn-facts, .kn-waiting { background: var(--panel); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); padding: var(--pad-lg); }
.kn-contents-heading, .kn-line { display: flex; justify-content: space-between; align-items: center; gap: var(--gut); } .kn-line h2 { margin: 0; }
.kn-contents-heading { margin-bottom: var(--pad); } .kn-contents a { display: flex; justify-content: space-between; gap: var(--gut); text-decoration: none; color: var(--text); padding: var(--pad); overflow-wrap: anywhere; }
.kn-tree { padding-left: var(--pad-lg); } .kn-contents a.kn-selected { color: var(--accent); outline: var(--border-w) solid var(--accent); border-radius: var(--radius-sm); }
.kn-fold { display: none; } .kn-path { margin-bottom: var(--pad-lg); } .kn a { color: var(--accent); } .kn-main h3 { margin: var(--pad-lg) 0 var(--pad); }
.kn-card { display: grid; grid-template-columns: 1fr auto; gap: var(--pad); margin-bottom: var(--gut); text-decoration: none; color: var(--text) !important; } .kn-card strong, .kn-card small, .kn-card > span:not(.kn-enter) { grid-column: 1; } .kn-card .kn-enter { grid-column: 2; grid-row: 1 / 3; align-self: center; color: var(--accent); }
.kn-reading { display: grid; grid-template-columns: minmax(0, 1fr) minmax(13rem, 19rem); gap: var(--pad-lg); } .kn-opening { font-weight: 600; } .kn-body, .kn-waiting pre { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; } .kn-facts section + section { border-top: var(--border-w) solid var(--border); } .kn-facts p { margin: var(--pad) 0; overflow-wrap: anywhere; }
.kn-waiting { margin: var(--pad-lg) 0; } .kn-waiting label, .kn-form label { display: grid; gap: var(--pad); } .kn-waiting input { width: 100%; box-sizing: border-box; }
.kn-overlay { position: fixed; inset: 0; z-index: var(--z-overlay); display: flex; justify-content: flex-end; } .kn-scrim { position: absolute; inset: 0; background: var(--text); opacity: 0.3; } .kn-panel { position: relative; width: min(38rem, 100%); height: 100%; overflow: auto; box-sizing: border-box; background: var(--panel); color: var(--text); padding: var(--pad-lg); border-left: var(--border-w) solid var(--border-strong); }
.kn-form { display: grid; gap: var(--pad-lg); margin-top: var(--pad-lg); } .kn-form input, .kn-form textarea, .kn-form select { box-sizing: border-box; width: 100%; } .kn-form fieldset { border: var(--border-w) solid var(--border); } .kn-form-group { display: grid; gap: var(--pad); padding: var(--pad); } .kn-form label.kn-place { display: flex; align-items: baseline; padding: var(--pad); } .kn-place input { width: auto; } .kn-error { color: var(--st-failed); }
@media (max-width: 60rem) { .kn-layout, .kn-reading { grid-template-columns: 1fr; } .kn-fold { display: flex; width: 100%; justify-content: space-between; } .kn-contents-body { display: none; } .kn-contents-body.kn-open { display: block; margin-top: var(--pad); } }
`
