// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { PanelRecord } from '@shared/types.ts'
import { request } from '../api.ts'

export type KnowledgePath = { id: string; title: string }[]
export type KnowledgeState = 'waiting' | 'in_force' | 'refused'
export type KnowledgeEntry = PanelRecord & { opening: string | null; entryStatus: KnowledgeState }
export type KnowledgeTreeNode = { id: string; title: string; parent: string | null; subcategoryCount: number; entryCount: number }
export type KnowledgeCategory = PanelRecord & { subcategoryCount: number; entryCount: number }
export type KnowledgeRoots = { categories: PanelRecord[]; tree: KnowledgeTreeNode[]; totals: { categories: number; entries: number } }
export type KnowledgeCategoryRead = { category: PanelRecord; path: KnowledgePath; subcategories: KnowledgeCategory[]; entries: KnowledgeEntry[] }
export type KnowledgeEntryRead = { entry: KnowledgeEntry; path: KnowledgePath; entryStatus: KnowledgeState; ratings: { count: number; average: number | null }; projects: { id: string; title: string }[]; changeWaits: boolean; waitingChanges: (PanelRecord & { proposal: Record<string, unknown> })[]; history: { id: string; reason: string; createdAt: string; change: PanelRecord }[] }
export type KnowledgeResource = { what: string; where: string; how: string }
export type KnowledgeSource = { record?: string; url?: string; measurement?: string }
export type KnowledgeFields = { title: string; category: string; opening: string; body: string; resources: KnowledgeResource[]; sources: KnowledgeSource[]; aliases: string[]; language: string; reason: string }
const json = (method: 'POST' | 'PATCH', body: unknown) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const id = (value: string) => encodeURIComponent(value)
export const knowledgeDoors = {
  knowledgeRoots: () => request<KnowledgeRoots>('/api/knowledge/categories'),
  knowledgeCategory: (category: string) => request<KnowledgeCategoryRead>(`/api/knowledge/categories/${id(category)}`),
  knowledgeEntry: (entry: string) => request<KnowledgeEntryRead>(`/api/knowledge/entries/${id(entry)}`),
  knowledgeSearch: (q: string) => request<{ results: { record: { id: string } }[]; levels: unknown; queryId: string }>(`/api/knowledge/search?q=${encodeURIComponent(q)}`),
  knowledgeCreateCategory: (title: string, parent: string | null) => request<{ category: PanelRecord }>('/api/knowledge/categories', json('POST', { title, ...(parent === null ? {} : { parent }) })),
  knowledgeMoveCategory: (category: string, parent: string | null, reason: string) => request<{ category: PanelRecord; path: KnowledgePath }>(`/api/knowledge/categories/${id(category)}/move`, json('POST', { parent, reason })),
  knowledgeCreateEntry: (fields: KnowledgeFields) => request<{ entry: PanelRecord; change: { id: string; state: string }; waiting: boolean }>('/api/knowledge/entries', json('POST', fields)),
  knowledgeEditEntry: (entry: string, fields: KnowledgeFields) => request<{ entry: PanelRecord; change: { id: string; state: string }; waiting: boolean }>(`/api/knowledge/entries/${id(entry)}`, json('PATCH', fields)),
  knowledgeAnswer: (change: string, answer: 'confirm' | 'refuse', reason: string) => request<{ entry: PanelRecord }>(`/api/knowledge/changes/${id(change)}/${answer}`, json('POST', { reason })),
}
