// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Evidence captured before a re-mint changes the session manifests that supplied round chapters. */
import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import { readRoundChapters, roundChaptersAcknowledgement, RULE_FILES } from '../../shared/round-chapters/manifest.ts'
import { revisionsReaderOf, wholeRevisionData } from './revision-stored-once.ts'
import type { ThePassPlan } from './remint-history.ts'
import type { TheRemintRule } from './registry-aliases/remint-plain.ts'

type ObjectValue = Record<string, unknown>
const object = (value: unknown): value is ObjectValue => value !== null && typeof value === 'object' && !Array.isArray(value)
const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')
const manifestAt = (data: unknown): unknown => object(data) && object(data['extra']) ? data['extra']['roundChapters'] : undefined
function takers(value: unknown): ObjectValue[] {
  if (!object(value) || !object(value['delegations']) || !Array.isArray(value['delegations']['tasks'])) return []
  return value['delegations']['tasks'].flatMap((task: unknown) => object(task) && object(task['inside']) && object(task['inside']['takenBy']) ? [task['inside']['takenBy']] : [])
}

export interface AManifestBody {
  original_digest: string
  original_json: string
  rewritten_digest: string
  rewritten_json: string
  derived_original_ack: string
  derived_rewritten_ack: string
}
type RevisionLink = { record_id: string; seq: number; original_digest: string; old_content_hash: string; new_content_hash: string }
type ChangeSide = { change_id: string; side: 'old_value' | 'new_value'; original_field: string; rewritten_field: string; original_value: string | null; rewritten_value: string | null; original_value_digest: string; rewritten_value_digest: string; original_manifest_digest: string | null }
export interface ManifestEvidence { bodies: AManifestBody[]; revisions: RevisionLink[]; changes: ChangeSide[] }
export const MANIFEST_EVIDENCE_TABLES = ['registry_remint_manifests', 'registry_remint_manifest_revisions', 'registry_remint_manifest_change_sides'] as const

/** Only the declared participant is rewritten. The acknowledgement is derived, never an observed receipt. */
export function planManifestValue(value: unknown, newIds: ReadonlyMap<string, string>): AManifestBody | null {
  if (!takers(value).some(one => one['kind'] === 'agent' && typeof one['id'] === 'string' && newIds.has(one['id']))) return null
  const original = JSON.stringify(value)
  if (original === undefined) throw new Error('A manifest cannot be represented as JSON; nothing was written.')
  const originalAck = roundChaptersAcknowledgement(readRoundChapters(JSON.parse(original) as unknown))
  const rewritten: unknown = JSON.parse(original)
  for (const one of takers(rewritten)) {
    if (one['kind'] !== 'agent' || typeof one['id'] !== 'string') continue
    const next = newIds.get(one['id'])
    if (next !== undefined) one['id'] = next
  }
  const rewrittenJson = JSON.stringify(rewritten)
  return { original_digest: digest(original), original_json: original, rewritten_digest: digest(rewrittenJson), rewritten_json: rewrittenJson, derived_original_ack: originalAck, derived_rewritten_ack: roundChaptersAcknowledgement(readRoundChapters(rewritten)) }
}

function faithful(text: string): unknown {
  const value: unknown = JSON.parse(text)
  if (JSON.stringify(value) !== text) throw new Error('A changed manifest is in JSON that cannot be retained byte for byte; nothing was written.')
  return value
}

/** Plan from the immutable snapshot, before the first registry write. */
export function planManifestEvidence(sqlite: Database.Database, rule: TheRemintRule, history: ThePassPlan): ManifestEvidence {
  const bodies = new Map<string, AManifestBody>()
  const rewrittenBodies = new Map<string, string>()
  const add = (body: AManifestBody) => {
    const previous = bodies.get(body.original_digest)
    if (previous !== undefined && JSON.stringify(previous) !== JSON.stringify(body)) throw new Error('Two different manifests have the same digest; nothing was written.')
    const rewritten = rewrittenBodies.get(body.rewritten_digest)
    if (rewritten !== undefined && rewritten !== body.rewritten_json) throw new Error('Two different rewritten manifests have the same digest; nothing was written.')
    bodies.set(body.original_digest, body)
    rewrittenBodies.set(body.rewritten_digest, body.rewritten_json)
  }
  const columns = sqlite.prepare('PRAGMA table_info(revisions)').all() as { name: string }[]
  const parts = columns.some(one => one.name === 'parts')
  type Revision = { id: string; record_id: string; seq: number; data: string | null; content_hash: string; parts: string | null }
  const revisions = sqlite.prepare(`SELECT r.id, r.record_id, r.seq, r.data, r.content_hash, ${parts ? 'r.parts' : 'NULL AS parts'} FROM revisions r JOIN records d ON d.id = r.record_id WHERE d.kind = 'session' ORDER BY r.record_id, r.seq`).all() as Revision[]
  const byNumber = new Map(revisions.map(one => [JSON.stringify([one.record_id, one.seq]), one]))
  const read = (recordId: string, seq: number) => {
    const row = byNumber.get(JSON.stringify([recordId, seq]))
    return row === undefined ? undefined : { data: row.data === null ? null : JSON.parse(row.data) as ObjectValue, parts: row.parts }
  }
  const newest = new Map<string, Revision>()
  for (const row of revisions) if ((newest.get(row.record_id)?.seq ?? 0) < row.seq) newest.set(row.record_id, row)
  const records = sqlite.prepare("SELECT id, data FROM records WHERE kind = 'session'").all() as { id: string; data: string | null }[]
  for (const row of records) {
    if (row.data === null) continue
    const current: unknown = JSON.parse(row.data)
    if (planManifestValue(manifestAt(current), rule.newIds) === null) continue
    faithful(row.data)
    const latest = newest.get(row.id)
    if (latest === undefined) throw new Error('A record with an affected manifest has no revision; nothing was written.')
    const whole = wholeRevisionData({ recordId: latest.record_id, seq: latest.seq, data: latest.data === null ? null : JSON.parse(latest.data) as ObjectValue, parts: latest.parts }, read)
    if (JSON.stringify(whole) !== row.data) throw new Error('A record with an affected manifest differs from its newest whole revision; nothing was written.')
  }
  const writes = new Map(history.writes.revisions.map(one => [one.id, one.set]))
  const plannedRead = (recordId: string, seq: number) => {
    const row = byNumber.get(JSON.stringify([recordId, seq]))
    if (row === undefined) return undefined
    const set = writes.get(row.id)
    const data = set?.['data'] === undefined ? row.data : set['data']
    const named = set?.['parts'] === undefined ? row.parts : set['parts']
    return { data: data === null ? null : JSON.parse(String(data)) as ObjectValue, parts: named }
  }
  const links: RevisionLink[] = []
  for (const row of revisions) {
    const whole = wholeRevisionData({ recordId: row.record_id, seq: row.seq, data: row.data === null ? null : JSON.parse(row.data) as ObjectValue, parts: row.parts }, read)
    const body = planManifestValue(manifestAt(whole), rule.newIds)
    if (body === null) continue
    if (row.data !== null) faithful(row.data)
    if (row.parts !== null) {
      const named = JSON.parse(row.parts) as Record<string, number>
      for (const seq of Object.values(named)) {
        const holder = byNumber.get(JSON.stringify([row.record_id, seq]))
        if (holder?.data !== null && holder?.data !== undefined) faithful(holder.data)
      }
    }
    const write = writes.get(row.id)
    if (typeof write?.['content_hash'] !== 'string') throw new Error('The history plan did not rewrite an affected manifest revision; nothing was written.')
    const planned = plannedRead(row.record_id, row.seq)
    if (planned === undefined || JSON.stringify(manifestAt(wholeRevisionData({ recordId: row.record_id, seq: row.seq, ...planned }, plannedRead))) !== body.rewritten_json) {
      throw new Error('The planned revision does not contain the declared manifest rewrite; nothing was written.')
    }
    add(body)
    links.push({ record_id: row.record_id, seq: row.seq, original_digest: body.original_digest, old_content_hash: row.content_hash, new_content_hash: write['content_hash'] })
  }
  const changeWrites = new Map(history.writes.changes.map(one => [one.id, one.set]))
  const changes = sqlite.prepare("SELECT c.id, c.field, c.old_value, c.new_value FROM changes c JOIN records r ON r.id = c.record_id WHERE r.kind = 'session' ORDER BY c.rowid").all() as { id: string; field: string | null; old_value: string | null; new_value: string | null }[]
  const sides: ChangeSide[] = []
  for (const row of changes) {
    const field = row.field
    if (field === null || !(field === 'data' || field === 'data.extra' || field.startsWith('data.extra.roundChapters'))) continue
    const set = changeWrites.get(row.id)
    // A naked id or kind does not carry the discriminator needed to distinguish a person from an agent.
    if (/\.takenBy\.(id|kind)(?:$|[.\[])/.test(field) && rule.newIds.size > 0) {
      throw new Error('A change to a manifest participant component has no discriminator; nothing was written.')
    }
    for (const side of ['old_value', 'new_value'] as const) {
      const original = row[side]
      const next = set?.[side]
      if (typeof original !== 'string' || typeof next !== 'string' || original === next) continue
      const parsed = faithful(original)
      const changed = faithful(next)
      const beforeManifest = field === 'data' ? manifestAt(parsed) : field === 'data.extra' && object(parsed) ? parsed['roundChapters'] : field === 'data.extra.roundChapters' ? parsed : undefined
      const afterManifest = field === 'data' ? manifestAt(changed) : field === 'data.extra' && object(changed) ? changed['roundChapters'] : field === 'data.extra.roundChapters' ? changed : undefined
      const body = planManifestValue(beforeManifest, rule.newIds)
      if ((field === 'data' || field === 'data.extra' || field === 'data.extra.roundChapters') && body === null) continue
      if (body !== null) {
        if (JSON.stringify(afterManifest) !== body.rewritten_json) throw new Error('A manifest change does not match the declared participant rewrite; nothing was written.')
        add(body)
      }
      const isWhole = body !== null && field === 'data.extra.roundChapters' && original === body.original_json && next === body.rewritten_json
      sides.push({ change_id: row.id, side, original_field: field, rewritten_field: typeof set?.['field'] === 'string' ? set['field'] : field, original_value: isWhole ? null : original, rewritten_value: isWhole ? null : next, original_value_digest: digest(original), rewritten_value_digest: digest(next), original_manifest_digest: body?.original_digest ?? null })
    }
  }
  return { bodies: [...bodies.values()], revisions: links, changes: sides }
}

/** File only the pre-write plan, and confirm the planned values were actually written. */
export function fileManifestEvidence(sqlite: Database.Database, generation: string, evidence: ManifestEvidence): void {
  const body = sqlite.prepare('INSERT INTO registry_remint_manifests VALUES (@generation, @original_digest, @original_json, @rewritten_digest, @rewritten_json, @derived_original_ack, @derived_rewritten_ack)')
  const rev = sqlite.prepare('INSERT INTO registry_remint_manifest_revisions VALUES (@generation, @record_id, @seq, @original_digest, @old_content_hash, @new_content_hash)')
  const side = sqlite.prepare('INSERT INTO registry_remint_manifest_change_sides VALUES (@generation, @change_id, @side, @original_field, @rewritten_field, @original_value, @rewritten_value, @original_value_digest, @rewritten_value_digest, @original_manifest_digest)')
  const revision = sqlite.prepare('SELECT content_hash, data, parts FROM revisions WHERE record_id = ? AND seq = ?')
  const readRevision = revisionsReaderOf(sqlite)
  const bodies = new Map(evidence.bodies.map(one => [one.original_digest, one]))
  const change = sqlite.prepare('SELECT field, old_value, new_value FROM changes WHERE id = ?')
  for (const one of evidence.bodies) body.run({ generation, ...one })
  for (const one of evidence.revisions) {
    const row = revision.get(one.record_id, one.seq) as { content_hash: string; data: string | null; parts: string | null } | undefined
    const expected = bodies.get(one.original_digest)
    if (row === undefined || expected === undefined || row.content_hash !== one.new_content_hash) throw new Error('A manifest revision differs from its pre-write plan; nothing was written.')
    const data = row.data === null ? null : JSON.parse(row.data) as ObjectValue
    const whole = wholeRevisionData({ recordId: one.record_id, seq: one.seq, data, parts: row.parts }, readRevision)
    if (JSON.stringify(manifestAt(whole)) !== expected.rewritten_json) throw new Error('A manifest revision has different content from its pre-write plan; nothing was written.')
    rev.run({ generation, ...one })
  }
  for (const one of evidence.changes) {
    const row = change.get(one.change_id) as { field: string; old_value: string | null; new_value: string | null } | undefined
    if (row === undefined || row.field !== one.rewritten_field || typeof row[one.side] !== 'string' || digest(row[one.side]!) !== one.rewritten_value_digest) throw new Error('A manifest change differs from its pre-write plan; nothing was written.')
    side.run({ generation, ...one })
  }
}

/** Only the synthetic restore corpus calls this. */
export async function fillManifestEvidenceProof(): Promise<string> {
  const { sqlite } = await import('./client.ts')
  const { fileTheRemintGeneration, theAppliedMigrationsDigest } = await import('./remint-migration.ts')
  const generation = digest('a made-up manifest evidence generation for the restore proof')
  if (sqlite.prepare('SELECT 1 FROM registry_remint_generations WHERE digest = ?').get(generation) === undefined) {
    fileTheRemintGeneration(sqlite, { digest: generation, schema: theAppliedMigrationsDigest(sqlite), agents: 0 })
    const empty = digest('')
    const manifest = {
      version: 1, kind: 'synthetic', territory: null, fallback: false, notice: null,
      policy: { path: 'synthetic', sha256: empty }, brief: { path: 'synthetic', sha256: empty, text: '', bytes: 0 },
      sources: RULE_FILES.map(name => ({ name, path: 'synthetic', sha256: empty, sourceBytes: 0, fullFile: true, sections: [], text: '', bytes: 0 })), chapters: [],
      delegations: { line: 'synthetic', named: ['synthetic'], tasks: [{ task: 'synthetic', title: 'synthetic', parent: { kind: 'task', id: 'synthetic' }, lines: ['synthetic'], inside: { taken: true, takenBy: { kind: 'agent', id: 'synthetic-old' }, takenAt: 'synthetic', alignment: 'aligned' }, points: [{ id: 'synthetic', number: '1', line: 'synthetic', why: 'synthetic' }], materials: [] }] },
    }
    const body = planManifestValue(manifest, new Map([['synthetic-old', 'synthetic-new']]))!
    const original = body.original_json
    const rewritten = body.rewritten_json
    sqlite.prepare('INSERT INTO registry_remint_manifests VALUES (?, ?, ?, ?, ?, ?, ?)').run(generation, body.original_digest, original, body.rewritten_digest, rewritten, body.derived_original_ack, body.derived_rewritten_ack)
    sqlite.prepare('INSERT INTO registry_remint_manifest_revisions VALUES (?, ?, ?, ?, ?, ?)').run(generation, 'synthetic-record', 1, body.original_digest, '0123456789abcdef', 'fedcba9876543210')
    sqlite.prepare('INSERT INTO registry_remint_manifest_change_sides VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(generation, 'synthetic-change', 'new_value', 'data.extra.roundChapters', 'data.extra.roundChapters', null, null, body.original_digest, body.rewritten_digest, body.original_digest)
  }
  return 'one synthetic manifest evidence body with a revision and change side'
}
