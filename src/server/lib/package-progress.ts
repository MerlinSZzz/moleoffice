// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sayInEnglish } from '@shared/i18n.ts'
import { readAStoredPlan, readAWorkEntry, type PackageWorkEntry } from '@shared/delegation.ts'
import { BLOCK_KIND } from '@shared/blocks.ts'
import type { PanelRecord } from '@shared/types.ts'
import { sqlite } from '../db/client.ts'
import { theOneAgentAStringNames } from './agent-references.ts'
import { packageOf, theStateOfTheActs, type StoredPackage } from './delegation.ts'
import { getRecord, patchChecklistItem, patchRecord, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'

type ChildEntry = Extract<PackageWorkEntry, { package: string }>
type AuditEntry = Extract<PackageWorkEntry, { audit: string }>
type Enrollment = { parent: PanelRecord; pkg: StoredPackage; work: PackageWorkEntry[]; entry: ChildEntry; index: number }
type Revision = { seq: number; contentHash: string }
type Source = { record: string; revision: Revision | null }
type Blocker = Source & { kind: 'child' | 'audit'; id: string; state: 'done' | 'held' | 'unknown'; reason: string; verdict?: 'pass' | 'fail' | 'unknown' | null }
const bag = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const live = (id: string, workspace: string) => { const record = getRecord(id); return record && !record.deletedAt && record.workspaceId === workspace ? record : null }
const isChild = (entry: PackageWorkEntry): entry is ChildEntry => 'package' in entry
const revision = (id: string): Revision | null => (sqlite.prepare('SELECT seq, content_hash AS contentHash FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1').get(id) as Revision | undefined) ?? null

/** Find the newest restatement answered by an aligned answer, using the package act order. */
export function alignedPlanOf(pkg: StoredPackage): { state: 'readable'; work: PackageWorkEntry[] | null } | { state: 'unknown' } {
  const restatements = pkg.alignments ?? []
  const answers = pkg.alignmentAnswers ?? []
  for (let i = answers.length - 1; i >= 0; i--) {
    const answer = answers[i]!
    if (answer.answer !== 'aligned') continue
    // Unnumbered answers predate work lists; do not guess which restatement they answered.
    if (answer.order === undefined) return { state: 'readable', work: null }
    const statement = [...restatements].reverse().find(one => one.order !== undefined && one.order < answer.order!)
    if (!statement) return { state: 'unknown' }
    const plan = readAStoredPlan(statement.plan)
    if (!plan) return { state: 'unknown' }
    return { state: 'readable', work: plan.kind === 'shape' ? plan.plan.work ?? null : null }
  }
  return { state: 'readable', work: null }
}
/** Validate the raw work entries before the shared shape reader, so a refusal identifies the entry. */
export function checkRawWork(value: unknown): void {
  const plan = bag(value)
  if (!Object.hasOwn(plan, 'work')) return
  if (!Array.isArray(plan.work)) throw new PanelError(sayInEnglish('packageProgress.badWorkShape', { entry: 1 }), 400)
  plan.work.forEach((value, index) => {
    if (!readAWorkEntry(value)) {
      throw new PanelError(sayInEnglish('packageProgress.badWorkShape', { entry: index + 1 }), 400)
    }
  })
}

function itemOf(module: PanelRecord, id: string): { state: string } | null {
  const parts = bag(module.data).parts
  if (!Array.isArray(parts)) return null
  const hits: { part: string; item: Record<string, unknown> }[] = []
  for (const raw of parts) {
    const part = bag(raw)
    if (!Array.isArray(part.items)) continue
    for (const rawItem of part.items) {
      const item = bag(rawItem)
      if (item.id === id) hits.push({ part: String(part.id ?? ''), item })
    }
  }
  if (hits.length !== 1 || ['plan', 'requirements'].includes(hits[0]!.part) || typeof hits[0]!.item.state !== 'string') return null
  return { state: hits[0]!.item.state as string }
}

export function checkWorkEntries(parent: PanelRecord, work: PackageWorkEntry[]): { work: PackageWorkEntry[]; inspectors: Map<string, { id: string; handle: string }> } {
  const audits = new Set<string>()
  const children = new Set<string>()
  const inspectors = new Map<string, { id: string; handle: string }>()
  const checked = work.map((entry, index) => {
    const at = { entry: index + 1 }
    if (isChild(entry)) {
      if (children.has(entry.package)) throw new PanelError(sayInEnglish('packageProgress.badRepeatedChild', at), 400)
      children.add(entry.package)
      const child = live(entry.package, parent.workspaceId)
      const pkg = child && child.kind === 'task' ? packageOf(child.data) : null
      if (!pkg || pkg.parent?.kind !== 'task' || pkg.parent.id !== parent.id) throw new PanelError(sayInEnglish('packageProgress.badChild', at), 400)
      const module = live(entry.module, parent.workspaceId)
      if (!module || module.kind !== 'module') throw new PanelError(sayInEnglish('packageProgress.badModule', at), 400)
      if (!itemOf(module, entry.item)) throw new PanelError(sayInEnglish('packageProgress.badItem', at), 400)
      return entry
    } else {
      if (audits.has(entry.audit)) throw new PanelError(sayInEnglish('packageProgress.badAudit', at), 400)
      audits.add(entry.audit)
      const inspector = theOneAgentAStringNames(sqlite, entry.inspector)
      if (!inspector) throw new PanelError(sayInEnglish('packageProgress.badInspector', at), 400)
      inspectors.set(entry.audit, { id: inspector.id, handle: inspector.handle })
      return { ...entry, inspector: inspector.id }
    }
  })
  return { work: checked, inspectors }
}

export function enrollmentReading(child: PanelRecord): { state: 'legacy' } | { state: 'unknown' } | { state: 'enrolled'; enrollment: Enrollment } {
  const pkg = packageOf(child.data)
  if (pkg?.parent?.kind !== 'task') return { state: 'legacy' }
  const parent = live(pkg.parent.id, child.workspaceId)
  if (parent?.kind === 'task' && !Object.hasOwn(bag(parent.data), 'package')) return { state: 'legacy' }
  const parentPackage = parent?.kind === 'task' ? packageOf(parent.data) : null
  if (!parent || !parentPackage) return { state: 'unknown' }
  const plan = alignedPlanOf(parentPackage)
  if (plan.state === 'unknown') return plan
  const work = plan.work
  if (!work) return { state: 'legacy' }
  const index = work.findIndex(entry => isChild(entry) && entry.package === child.id)
  return index < 0 ? { state: 'legacy' } : { state: 'enrolled', enrollment: { parent, pkg: parentPackage, work, entry: work[index] as ChildEntry, index } }
}
function childBlocks(id: string, workspace: string): string[] {
  const rows = sqlite.prepare(`SELECT r.id FROM links l JOIN records r ON r.id = l.to_id
    WHERE l.workspace_id = ? AND l.from_id = ? AND l.type = 'blocks' AND l.inferred = 0 AND r.kind = ? AND r.deleted_at IS NULL`).all(workspace, id, BLOCK_KIND) as { id: string }[]
  return [...new Set(rows.map(row => row.id))].sort()
}
function childBlocker(enrollment: Enrollment): Blocker {
  const child = live(enrollment.entry.package, enrollment.parent.workspaceId)
  const pkg = child?.kind === 'task' ? packageOf(child.data) : null
  const rev = revision(enrollment.entry.package)
  const valid = pkg && pkg.parent?.kind === 'task' && pkg.parent.id === enrollment.parent.id && rev
  const done = valid && pkg && theStateOfTheActs(pkg) === 'done'
  const state = !valid ? 'unknown' : done ? 'done' : 'held'
  return { kind: 'child', id: enrollment.entry.package, record: enrollment.entry.package, revision: rev, state,
    reason: sayInEnglish(state === 'unknown' ? 'packageProgress.childUnknown' : state === 'done' ? 'packageProgress.childDone' : 'packageProgress.childHeld') }
}
function auditBlocker(enrollment: Enrollment, audit: AuditEntry): Blocker {
  const verdict = (enrollment.pkg.auditVerdicts ?? []).filter(one => one.audit === audit.audit).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).at(-1)
  const rev = revision(enrollment.parent.id)
  const state = !rev ? 'unknown' : verdict?.verdict === 'pass' ? 'done' : 'held'
  return { kind: 'audit', id: audit.audit, record: enrollment.parent.id, revision: rev, state, verdict: verdict?.verdict ?? null,
    reason: sayInEnglish(state === 'unknown' ? 'packageProgress.auditUnknown' : state === 'done' ? 'packageProgress.auditPass' : 'packageProgress.auditHeld') }
}
function sourcesOf(blockers: Blocker[]): Source[] {
  return [...new Map(blockers.map(({ record, revision }) => [record, { record, revision }])).values()]
}
function sourceNote(sources: Source[]): string {
  return sayInEnglish('packageProgress.sourceNote', { sources: sources.map(source => sayInEnglish('packageProgress.source', {
    record: source.record, seq: source.revision?.seq ?? '?', hash: source.revision?.contentHash ?? '?',
  })).join('; ') })
}
function blockReading(id: string, workspace: string) {
  const blockers: Blocker[] = []
  const rows = sqlite.prepare(`SELECT DISTINCT l.from_id AS id FROM links l JOIN records r ON r.id = l.from_id
    WHERE l.workspace_id = ? AND l.to_id = ? AND l.type = 'blocks' AND l.inferred = 0 AND r.kind = 'task' AND r.deleted_at IS NULL`).all(workspace, id) as { id: string }[]
  for (const row of rows) {
    const child = live(row.id, workspace)
    if (!child) continue
    if (!packageOf(child.data) && Object.hasOwn(bag(child.data), 'package')) {
      blockers.push({ kind: 'child', id: row.id, record: row.id, revision: revision(row.id), state: 'unknown', reason: sayInEnglish('packageProgress.childUnknown') })
      continue
    }
    const reading = enrollmentReading(child)
    if (reading.state === 'legacy') continue
    if (reading.state === 'unknown') {
      blockers.push({ kind: 'child', id: row.id, record: row.id, revision: revision(row.id), state: 'unknown', reason: sayInEnglish('packageProgress.planUnknown') })
      continue
    }
    const one = reading.enrollment
    blockers.push(childBlocker(one))
    for (const audit of one.work.slice(0, one.index).filter((entry): entry is AuditEntry => !isChild(entry))) blockers.push(auditBlocker(one, audit))
  }
  const state = blockers.some(one => one.state === 'unknown') ? 'unknown' : blockers.some(one => one.state === 'held') ? 'held' : 'done'
  return { id, state, heldState: getRecord(id)?.data['state'] ?? null, blockers, sources: sourcesOf(blockers) }
}
function itemReading(enrollment: Enrollment) {
  const module = live(enrollment.entry.module, enrollment.parent.workspaceId)
  const item = module?.kind === 'module' ? itemOf(module, enrollment.entry.item) : null
  return { child: enrollment.entry.package, module: enrollment.entry.module, item: enrollment.entry.item,
    heldState: item?.state ?? null, state: item ? 'known' : 'unknown', ...(item ? {} : { reason: sayInEnglish('packageProgress.itemUnknown') }), sources: sourcesOf([childBlocker(enrollment)]) }
}

export function progressOf(parent: PanelRecord) {
  const pkg = parent.kind === 'task' ? packageOf(parent.data) : null
  if (!pkg) return { state: 'unknown', reason: sayInEnglish('packageProgress.planUnknown'), blocks: [], children: [] }
  const plan = alignedPlanOf(pkg)
  if (plan.state === 'unknown') return { state: 'unknown', reason: sayInEnglish('packageProgress.planUnknown'), blocks: [], children: [] }
  const work = plan.work ?? []
  const own: Enrollment[] = work.flatMap((entry, index) => isChild(entry) ? [{ parent, pkg, work, entry, index }] : [])
  const ids = [...new Set(own.flatMap(one => childBlocks(one.entry.package, parent.workspaceId)))].sort()
  return { blocks: ids.map(id => blockReading(id, parent.workspaceId)), children: own.map(itemReading) }
}

/** Called inside the same transaction after the child or audit act has been stored. */
export function writeProgress(childId: string, actor: Actor): void {
  const child = getRecord(childId)
  if (!child) return
  const reading = enrollmentReading(child)
  if (reading.state !== 'enrolled') return
  const one = reading.enrollment
  for (const id of childBlocks(childId, child.workspaceId)) {
    const block = blockReading(id, child.workspaceId)
    const state = block.state === 'done' ? 'done' : block.state === 'held' && block.heldState === 'done' ? 'doing' : null
    if (state && state !== block.heldState) patchRecord(id, { dataPatch: { state } }, actor, { op: 'update', note: sourceNote(block.sources) })
  }
  const status = childBlocker(one)
  const target = itemReading(one)
  const state = status.state === 'done' ? 'done' : status.state === 'held' && target.heldState === 'done' ? 'doing' : null
  if (target.state === 'known' && state && state !== target.heldState) patchChecklistItem(target.module, target.item, { state }, actor, undefined, undefined, sourceNote(target.sources))
}
