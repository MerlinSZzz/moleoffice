// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Knowledge's three read queries and their per-run record of what was returned. */
import { KNOWLEDGE_WORKSPACE } from '@shared/knowledge/constants.ts'
import { KNOWLEDGE_WORDS as w } from '@shared/words/en-wave-13u.ts'
import { searchRecords } from '@shared/search.ts'
import { resultsAtTheirLevels } from '@shared/results-at-a-level.ts'
import type { Rung } from '@shared/detail.ts'
import type { PanelRecord } from '@shared/types.ts'
import { sqlite } from '../db/client.ts'
import { wholeNumberSetting } from '../db/env.ts'
import { PanelError } from '../lib/panel-error.ts'
import { createRecord, listRecords, type Actor } from '../lib/records.ts'
import { theLevelSettings } from '../lib/result-levels.ts'
import { knowledgeWrite } from './guard.ts'
import { entryStatus, runForQuery } from './library.ts'
import { establishKnowledgeWorkspace } from './workspace.ts'

const limitSetting = 'MOLE_OFFICE_KNOWLEDGE_QUERY_LIMIT'
type Way = 'first' | 'categories' | 'words' | 'flow step'
function library() {
  return {
    categories: listRecords({ workspaceId: KNOWLEDGE_WORKSPACE, kind: 'knowledge_category' }),
    entries: listRecords({ workspaceId: KNOWLEDGE_WORKSPACE, kind: 'knowledge_entry' }),
    changes: listRecords({ workspaceId: KNOWLEDGE_WORKSPACE, kind: 'knowledge_change' }),
  }
}
export function logQuery(way: Way, asked: object, answered: string[], actor: Actor, project: string, run = runForQuery(actor, project)): string {
  return sqlite.transaction(() => knowledgeWrite(() => {
    establishKnowledgeWorkspace()
    return createRecord({ kind: 'knowledge_query', title: w.queryTitle, workspaceId: KNOWLEDGE_WORKSPACE, actor,
      data: { way, asked, answered, run, project, readAfter: [] } }).id
  }))()
}
function entryAtLevel<T extends { id: string; summary?: string | null }>(entry: T, changes: PanelRecord[]) {
  return { ...entry, ...('summary' in entry ? { opening: entry.summary } : {}), entryStatus: entryStatus(entry.id, changes) }
}
interface CategoryNode {
  id: string
  title: string
  opened: boolean
  entries: { id: string; title: string; opening: string | null; entryStatus: 'waiting' | 'in_force' | 'refused' }[]
  subcategories: CategoryNode[]
  entryCount?: number
}
/** Open a breadth of categories only when its entire contents fit; roots are always shown. */
export function firstQuery(actor: Actor, project: string) {
  const { categories, entries, changes } = library()
  const children = new Map<string | null, PanelRecord[]>()
  for (const category of categories) {
    const parent = typeof category.data['parent'] === 'string' ? category.data['parent'] : null
    children.set(parent, [...(children.get(parent) ?? []), category])
  }
  const byCategory = new Map<string, PanelRecord[]>()
  for (const entry of entries) {
    const category = String(entry.data['category'])
    byCategory.set(category, [...(byCategory.get(category) ?? []), entry])
  }
  const roots = children.get(null) ?? []
  const opened = new Set<string>()
  const limit = wholeNumberSetting(limitSetting)
  let count = roots.length
  let level = roots
  while (level.length) {
    const next = level.flatMap(c => children.get(c.id) ?? [])
    const levelEntries = level.flatMap(c => byCategory.get(c.id) ?? [])
    const added = next.length + levelEntries.length
    if (count + added > limit) break
    for (const category of level) opened.add(category.id)
    count += added
    level = next
  }
  function below(id: string): number {
    return (byCategory.get(id)?.length ?? 0) + (children.get(id) ?? []).reduce((n, c) => n + below(c.id), 0)
  }
  const answered: string[] = []
  function node(category: PanelRecord): CategoryNode {
    answered.push(category.id)
    if (!opened.has(category.id)) return { id: category.id, title: category.title, opened: false, entries: [], subcategories: [], entryCount: below(category.id) }
    const direct = (byCategory.get(category.id) ?? []).map(entry => {
      answered.push(entry.id)
      return { id: entry.id, title: entry.title, opening: entry.summary, entryStatus: entryStatus(entry.id, changes) }
    })
    return { id: category.id, title: category.title, opened: true, entries: direct, subcategories: (children.get(category.id) ?? []).map(node) }
  }
  const tree = roots.map(node)
  return { categories: tree, limit, queryId: logQuery('first', {}, answered, actor, project) }
}
/** Answer every entry below each requested category using the common semantic-level rule. */
export function categoryQuery(ids: string[], actor: Actor, project: string) {
  const { categories, entries, changes } = library()
  if (ids.some(id => !categories.some(c => c.id === id))) throw new PanelError(w.missing, 404)
  const children = new Map<string, string[]>()
  for (const category of categories) {
    const parent = category.data['parent']
    if (typeof parent === 'string') children.set(parent, [...(children.get(parent) ?? []), category.id])
  }
  const included = new Set(ids)
  const pending = [...included]
  for (const id of pending) {
    for (const child of children.get(id) ?? []) {
      if (!included.has(child)) { included.add(child); pending.push(child) }
    }
  }
  const selected = entries.filter(entry => included.has(String(entry.data['category'])))
  const result = resultsAtTheirLevels(selected, null, theLevelSettings())
  return { entries: result.rows.map(row => entryAtLevel(row, changes)), levels: result.levels,
    queryId: logQuery('categories', { ids }, selected.map(e => e.id), actor, project) }
}
/** Apply the office word rule to the entry fields that belong to the knowledge search. */
export function wordSearch(q: string, level: Rung | null, levelWord: string | undefined, actor: Actor, project: string) {
  const { entries, changes } = library()
  const selected = entries.map(entry => ({ ...entry, data: { body: entry.data['body'], resources: entry.data['resources'], aliases: entry.data['aliases'] } }))
  const found = searchRecords(selected, q)
  const originals = new Map(entries.map(entry => [entry.id, entry]))
  const matches = found.map(hit => originals.get(hit.record.id)!)
  const result = resultsAtTheirLevels(matches, level, theLevelSettings())
  const results = found.map((hit, i) => ({ ...hit, record: entryAtLevel(result.rows[i]!, changes) }))
  return { results, levels: result.levels, queryId: logQuery('words', { q, ...(levelWord === undefined ? {} : { level: levelWord }) }, matches.map(e => e.id), actor, project) }
}
