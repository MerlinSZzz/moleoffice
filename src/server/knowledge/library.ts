// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The knowledge library's read and write operations. It keeps entries in the shared workspace,
 * records their reasons, and sends unsourced changes for review.
 */
import { z } from 'zod'
import { KNOWLEDGE_WORKSPACE } from '@shared/knowledge/constants.ts'
import { KNOWLEDGE_WORDS as w } from '@shared/words/en-wave-13u.ts'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { moleOffice, type ParticipantRef } from '@shared/participants.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { isAProjectOnAList } from '@shared/workspaces.ts'
import { sqlite } from '../db/client.ts'
import { getWorkspace } from '../db/get-workspace.ts'
import { versionOf, type RecordContent } from '../db/version.ts'
import { theApproverOf } from '../lib/agent-renames.ts'
import { writeASystemLineToOne } from '../lib/groups.ts'
import { holdsTheSecretaryCard } from '../lib/holds-the-secretary-card.ts'
import { PanelError } from '../lib/panel-error.ts'
import { createLink, createRecord, getRecord, listRecords, patchRecord, resolveSessionRef, type Actor } from '../lib/records.ts'
import { anAgentItsOwnKeyProves } from '../lib/who-may-act.ts'
import { knowledgeWrite } from './guard.ts'
import { establishKnowledgeWorkspace } from './workspace.ts'

/** Attachments and a low-rating notice are bookkeeping, so neither changes the content a proposal reviews. */
export function contentVersionOf(entry: RecordContent): string {
  const { attachments: _attachments, lowRatingNotice: _lowRatingNotice, ...data } = entry.data
  return versionOf({ ...entry, data })
}

const source = z.strictObject({ record: z.string().min(1).optional(), url: z.string().min(1).optional(), measurement: z.string().min(1).optional() })
const resource = z.strictObject({ what: z.string().min(1), where: z.string().min(1), how: z.string().min(1) })
const fields = {
  title: z.string().min(1), category: z.string().min(1), opening: z.string(), body: z.string(),
  resources: z.array(resource), sources: z.array(source), aliases: z.array(z.string()), language: z.string().min(1),
}
const entrySchema = z.strictObject({ ...fields, reason: z.string() })
const changeSchema = z.strictObject(fields).partial().extend({ reason: z.string() })
const categorySchema = z.strictObject({ title: z.string().min(1), parent: z.string().min(1).optional() })
const moveSchema = z.strictObject({ parent: z.string().min(1).nullable(), reason: z.string() })
const reasonSchema = z.strictObject({ reason: z.string() })
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) throw new PanelError(w.invalid, 400)
  return result.data
}
function reason(s: string): void { if (!s.trim()) throw new PanelError(w.reason, 400) }
function one(id: string, kind: 'knowledge_entry' | 'knowledge_category' | 'knowledge_change') {
  const record = getRecord(id)
  if (record === null || record.deletedAt !== null || record.workspaceId !== KNOWLEDGE_WORKSPACE || record.kind !== kind) throw new PanelError(w.missing, 404)
  return record
}
function checkOpening(opening: string | undefined): void { if (opening !== undefined && Array.from(opening).length > 200) throw new PanelError(w.opening, 400) }
function checkSources(sources: z.infer<typeof source>[]): void {
  for (const s of sources) {
    if (Object.values(s).filter(Boolean).length !== 1) throw new PanelError(w.source, 400)
    if (s.record) {
      const record = getRecord(s.record)
      if (!record || record.deletedAt !== null || !['decision', 'report'].includes(record.kind)) throw new PanelError(w.source, 400)
    } else if (s.url) {
      try { if (!['http:', 'https:'].includes(new URL(s.url).protocol)) throw new Error() } catch { throw new PanelError(w.source, 400) }
    } else if (!s.measurement?.trim()) throw new PanelError(w.source, 400)
  }
}
function writer(actor: Actor): string | null {
  if (thePersonIsProved(actor)) return null
  const id = anAgentItsOwnKeyProves(actor)
  if (id === null) throw new PanelError(w.invalid, 403)
  return id
}
function changeData(entry: string, reasonText: string, patch: unknown, base: string, state: 'waiting' | 'applied', offeredTo?: ParticipantRef) {
  return { entry, reason: reasonText, patch: JSON.stringify(patch), base, state, ...(offeredTo ? { offeredKind: offeredTo.kind, offeredId: offeredTo.id } : {}) }
}
/** Create a category, optionally beneath an existing category. */
export function createCategory(input: unknown, actor: Actor) {
  writer(actor)
  const data = parse(categorySchema, input)
  if (data.parent) one(data.parent, 'knowledge_category')
  return sqlite.transaction(() => knowledgeWrite(() => {
    establishKnowledgeWorkspace()
    return { category: createRecord({ kind: 'knowledge_category', title: data.title, data: data.parent ? { parent: data.parent } : {}, workspaceId: KNOWLEDGE_WORKSPACE, actor }) }
  }))()
}
/** The path is read from the stored parents, with a cycle refused rather than followed forever. */
export function pathOf(categoryId: string): { id: string; title: string }[] {
  const seen = new Set<string>()
  const path: { id: string; title: string }[] = []
  let id: string | null = categoryId
  while (id !== null) {
    if (seen.has(id)) throw new PanelError(w.treeLoop, 500)
    seen.add(id)
    const category = one(id, 'knowledge_category')
    path.unshift({ id: category.id, title: category.title })
    id = typeof category.data['parent'] === 'string' ? category.data['parent'] : null
  }
  return path
}
/** Move one category, preserving the ids of everything below it. */
export function moveCategory(id: string, input: unknown, actor: Actor) {
  writer(actor)
  const data = parse(moveSchema, input)
  reason(data.reason)
  const category = one(id, 'knowledge_category')
  if (data.parent !== null) {
    one(data.parent, 'knowledge_category')
    if (pathOf(data.parent).some(part => part.id === id)) throw new PanelError(w.moveInside, 400)
  }
  if ((category.data['parent'] ?? null) === data.parent) throw new PanelError(w.moveSame, 400)
  return sqlite.transaction(() => knowledgeWrite(() => {
    const moved = patchRecord(id, { dataPatch: { parent: data.parent } }, actor, { op: 'update', note: data.reason }).record
    return { category: moved, path: pathOf(id) }
  }))()
}
/** List the roots, and direct counts for the complete live category tree. */
export function rootCategories() {
  const categories = listRecords({ workspaceId: KNOWLEDGE_WORKSPACE, kind: 'knowledge_category' })
  const entries = listRecords({ workspaceId: KNOWLEDGE_WORKSPACE, kind: 'knowledge_entry' })
  return {
    categories: categories.filter(c => !c.data['parent']),
    tree: categories.map(c => ({ id: c.id, title: c.title, parent: typeof c.data['parent'] === 'string' ? c.data['parent'] : null,
      subcategoryCount: categories.filter(child => child.data['parent'] === c.id).length,
      entryCount: entries.filter(entry => entry.data['category'] === c.id).length })),
    totals: { categories: categories.length, entries: entries.length },
  }
}
export function entryStatus(id: string, changes: ReturnType<typeof listRecords>): 'waiting' | 'in_force' | 'refused' {
  const creation = changes.find(c => c.data['entry'] === id && c.data['creation'] === true)
  if (creation?.data['state'] === 'refused') return 'refused'
  const sourcedChange = changes.some(c => {
    if (c.data['entry'] !== id || c.data['creation'] === true || c.data['state'] !== 'applied') return false
    const patch = JSON.parse(String(c.data['patch'])) as { sources?: unknown }
    return Array.isArray(patch.sources) && patch.sources.length > 0
  })
  if (creation?.data['state'] === 'waiting' && !sourcedChange) return 'waiting'
  return 'in_force'
}
/** Knowledge doors expose the opening while its only stored copy remains the summary. */
export function withOpening<T extends { summary: string | null }>(entry: T) { return { ...entry, opening: entry.summary } }
/** Read a category with its direct children and entries, including each entry’s review state. */
export function readCategory(id: string) {
  const category = one(id, 'knowledge_category')
  const categories = listRecords({ workspaceId: KNOWLEDGE_WORKSPACE, kind: 'knowledge_category' })
  const entries = listRecords({ workspaceId: KNOWLEDGE_WORKSPACE, kind: 'knowledge_entry' })
  const changes = listRecords({ workspaceId: KNOWLEDGE_WORKSPACE, kind: 'knowledge_change' })
  return { category, path: pathOf(id), subcategories: categories.filter(c => c.data['parent'] === id).map(c => ({ ...c, subcategoryCount: categories.filter(child => child.data['parent'] === c.id).length, entryCount: entries.filter(entry => entry.data['category'] === c.id).length })), entries: entries.filter(e => e.data['category'] === id).map(e => ({ ...withOpening(e), entryStatus: entryStatus(e.id, changes) })) }
}
/** Store an entry and its creation change; an unsourced creation is offered to the writer’s direct secretary. */
export function createEntry(input: unknown, actor: Actor, project: string) {
  const writerId = writer(actor)
  const data = parse(entrySchema, input)
  reason(data.reason); checkOpening(data.opening); checkSources(data.sources); one(data.category, 'knowledge_category')
  const sourced = data.sources.length > 0
  const offeredTo = !sourced && writerId !== null ? theApproverOf(writerId) : undefined
  return sqlite.transaction(() => knowledgeWrite(() => {
    const { title, opening, reason: why, ...contents } = data
    const entry = createRecord({ kind: 'knowledge_entry', title, summary: opening, data: contents, workspaceId: KNOWLEDGE_WORKSPACE, actor })
    const change = createRecord({ kind: 'knowledge_change', title, data: { ...changeData(entry.id, why, { title, opening, ...contents }, contentVersionOf(entry), sourced ? 'applied' : 'waiting', offeredTo), creation: true }, workspaceId: KNOWLEDGE_WORKSPACE, actor })
    if (offeredTo) writeASystemLineToOne(offeredTo, project, SYSTEM_LINES.aKnowledgeChangeWaits(change.id, why), { type: 'system', id: moleOffice().id })
    return { entry: withOpening(entry), change: { id: change.id, state: sourced ? 'applied' : 'waiting', offeredTo: offeredTo ?? null }, waiting: !sourced }
  }))()
}
/** Read an entry with its review state, projects, waiting changes, and applied history. */
export function readEntry(id: string, actor?: Actor, project?: string) {
  const entry = one(id, 'knowledge_entry')
  const changes = listRecords({ workspaceId: KNOWLEDGE_WORKSPACE, kind: 'knowledge_change' }).filter(c => c.data['entry'] === id)
  const rows = sqlite.prepare(`SELECT DISTINCT w.id, w.title FROM links l JOIN records b ON b.id = l.from_id JOIN workspaces w ON w.id = b.workspace_id WHERE l.to_id = ? AND l.type = 'relates_to' AND b.kind = 'knowledge_bookmark' AND b.deleted_at IS NULL`).all(id) as { id: string; title: string }[]
  if (actor?.sessionId && project) recordEntryRead(id, actor, project)
  const queryProjects = listRecords({ workspaceId: KNOWLEDGE_WORKSPACE, kind: 'knowledge_query' })
    .filter(q => (Array.isArray(q.data['answered']) && q.data['answered'].includes(id)) || (Array.isArray(q.data['readAfter']) && q.data['readAfter'].includes(id)))
    .map(q => typeof q.data['project'] === 'string' ? getWorkspace(q.data['project']) : null)
    .filter((p): p is NonNullable<typeof p> => p !== null && isAProjectOnAList(p.id))
    .map(p => ({ id: p.id, title: p.title }))
  const projects = [...new Map([...rows.filter(p => isAProjectOnAList(p.id)), ...queryProjects].map(p => [p.id, p])).values()]
  const scores = listRecords({ workspaceId: KNOWLEDGE_WORKSPACE, kind: 'knowledge_rating' }).filter(r => r.data['entry'] === id).map(r => Number(r.data['score']))
  const ratings = { count: scores.length, average: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null }
  return { entry: withOpening(entry), path: pathOf(String(entry.data['category'])), ratings, entryStatus: entryStatus(id, changes), projects, changeWaits: changes.some(c => c.data['state'] === 'waiting'), waitingChanges: changes.filter(c => c.data['state'] === 'waiting').map(c => ({ ...c, proposal: JSON.parse(String(c.data['patch'])) })), history: changes.filter(c => c.data['state'] === 'applied').map(c => ({ id: c.id, reason: c.data['reason'], createdAt: c.createdAt, change: c })) }
}
/**
 * Apply a sourced change immediately; an unsourced change waits and is offered to the writer’s
 * direct secretary. The entry stays readable with its current contents while the change waits.
 */
export function editEntry(id: string, input: unknown, actor: Actor, project: string) {
  const writerId = writer(actor)
  const data = parse(changeSchema, input)
  reason(data.reason); checkOpening(data.opening)
  if (data.sources !== undefined) checkSources(data.sources)
  if (data.category !== undefined) one(data.category, 'knowledge_category')
  const { reason: why, ...changes } = data
  if (Object.keys(changes).length === 0) throw new PanelError(w.invalid, 400)
  const entry = one(id, 'knowledge_entry')
  const base = contentVersionOf(entry)
  const prospective = { ...entry, title: changes.title ?? entry.title, summary: changes.opening ?? entry.summary, data: { ...entry.data, ...Object.fromEntries(Object.entries(changes).filter(([key]) => key !== 'title' && key !== 'opening')) } }
  if (contentVersionOf(prospective) === base) throw new PanelError(w.unchanged, 400)
  const sourced = (data.sources?.length ?? 0) > 0
  const offeredTo = !sourced && writerId !== null ? theApproverOf(writerId) : undefined
  return sqlite.transaction(() => knowledgeWrite(() => {
    const change = createRecord({ kind: 'knowledge_change', title: entry.title, data: changeData(id, why, changes, base, sourced ? 'applied' : 'waiting', offeredTo), workspaceId: KNOWLEDGE_WORKSPACE, actor })
    if (sourced) {
      const { title, opening, ...rest } = changes
      const updated = patchRecord(id, { ...(title === undefined ? {} : { title }), ...(opening === undefined ? {} : { summary: opening }), dataPatch: { ...rest, lowRatingNotice: null } }, actor, { op: 'update', note: why }).record
      return { entry: withOpening(updated), change: { id: change.id, state: 'applied' }, waiting: false }
    }
    if (offeredTo) writeASystemLineToOne(offeredTo, project, SYSTEM_LINES.aKnowledgeChangeWaits(change.id, why), { type: 'system', id: moleOffice().id })
    return { entry: withOpening(entry), change: { id: change.id, state: 'waiting', offeredTo: offeredTo ?? null }, waiting: true }
  }))()
}
/**
 * Let the person or a secretary answer a waiting creation or edit. Confirmation is refused if
 * the entry changed since the proposal, so an old review cannot overwrite newer work.
 */
export function answerChange(id: string, input: unknown, actor: Actor, answer: 'confirm' | 'refuse') {
  const person = thePersonIsProved(actor)
  const agentId = person ? null : anAgentItsOwnKeyProves(actor)
  if (!person && (agentId === null || !holdsTheSecretaryCard({ kind: 'agent', id: agentId }))) throw new PanelError(w.secretary, 403)
  const body = parse(reasonSchema, input); reason(body.reason)
  return sqlite.transaction(() => knowledgeWrite(() => {
    const change = one(id, 'knowledge_change')
    if (change.data['state'] !== 'waiting') throw new PanelError(w.answered, 409)
    const entry = one(String(change.data['entry']), 'knowledge_entry')
    if (answer === 'confirm' && contentVersionOf(entry) !== change.data['base']) throw new PanelError(w.stale, 409)
    let updated = entry
    if (answer === 'confirm' && change.data['creation'] !== true) {
      const { title, opening, ...rest } = JSON.parse(String(change.data['patch'])) as Record<string, unknown>
      updated = patchRecord(entry.id, { ...(typeof title === 'string' ? { title } : {}), ...(typeof opening === 'string' ? { summary: opening } : {}), dataPatch: { ...rest, lowRatingNotice: null } }, actor, { op: 'update', note: String(change.data['reason']) }).record
    }
    if (answer === 'confirm' && change.data['creation'] === true && entry.data['lowRatingNotice'] !== undefined) {
      updated = patchRecord(entry.id, { dataPatch: { lowRatingNotice: null } }, actor).record
    }
    patchRecord(id, { dataPatch: { state: answer === 'confirm' ? 'applied' : 'refused', answerReason: body.reason } }, actor)
    return { entry: withOpening(updated) }
  }))()
}
/**
 * Keep the bookmark in the project’s own workspace so the project owns its use of the entry.
 * The decision to share knowledge across projects permits its link into the knowledge workspace.
 */
export function bookmark(id: string, project: string, actor: Actor) {
  writer(actor)
  if (!isAProjectOnAList(project) || getWorkspace(project) === null) throw new PanelError(w.onlyProject, 400)
  const entry = one(id, 'knowledge_entry')
  return sqlite.transaction(() => knowledgeWrite(() => {
    const exists = sqlite.prepare(`SELECT b.id FROM records b JOIN links l ON l.from_id = b.id WHERE b.workspace_id = ? AND b.kind = 'knowledge_bookmark' AND b.deleted_at IS NULL AND l.to_id = ? AND l.type = 'relates_to'`).get(project, id)
    if (exists) throw new PanelError(w.already, 409)
    const record = createRecord({ kind: 'knowledge_bookmark', title: entry.title, data: { entry: id }, workspaceId: project, actor })
    createLink({ fromId: record.id, toId: id, type: 'relates_to', actor })
    return { bookmark: record, entry: withOpening(entry), entryStatus: entryStatus(id, listRecords({ workspaceId: KNOWLEDGE_WORKSPACE, kind: 'knowledge_change' })) }
  }))()
}

/** Match a session name and its record id to the same run when the office can resolve it. */
export function runForQuery(actor: Actor, project: string): string | null {
  const run = actor.sessionId?.trim()
  return run ? (resolveSessionRef(run, project).recordId ?? run) : null
}
/** Add a read only to this run's newest query, preserving its history through the record door. */
function recordEntryRead(id: string, actor: Actor, project: string): void {
  const row = sqlite.prepare(`SELECT id FROM records WHERE workspace_id = ? AND kind = 'knowledge_query' AND deleted_at IS NULL AND json_extract(data, '$.run') = ? ORDER BY rowid DESC LIMIT 1`).get(KNOWLEDGE_WORKSPACE, runForQuery(actor, project)) as { id: string } | undefined
  if (!row) return
  const query = getRecord(row.id)
  if (!query) return
  const read = Array.isArray(query.data['readAfter']) ? query.data['readAfter'] as string[] : []
  if (read.includes(id)) return
  knowledgeWrite(() => patchRecord(query.id, { dataPatch: { readAfter: [...read, id] } }, actor))
}
