// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * OLD: only unequal-commit upgrade events exist.
 * NEW: first handoff has a separate v2 event with exact original approvals and repository identities.
 * Receipt correction: OLD fixture equated clone and development; NEW repository names development
 * and clone remains the separate suite checkout, because both original fields have distinct meanings.
 * WHY: the same commit in another checkout is no feature upgrade or previous stable release.
 * Variable imports keep the criterion checkpoint independently compilable.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { fixtureBootstrapAuthority } from './stable-bootstrap-authority-fixture.ts'
import { WHOLE_SUITE_RECEIPT_EXAMPLE } from '../src/shared/whole-suite-receipt.ts'
import { stableUpgradeAnnouncementSchema, stableUpgradeNoticeEventSchema } from '../src/shared/stable-upgrade-notices.ts'
import { versionOf } from '../src/server/lib/version.ts'

const sharedModule = '../src/shared/stable-bootstrap-notices.ts'
const serverModule = '../src/server/lib/stable-upgrade-notices.ts'
let t: TestDb
let server: any
let shared: any
let writer: any
let secretary: any
let stranger: any
const commit = 'a'.repeat(40), tree = 'b'.repeat(40)
const from = { commit, repository: '/fixture/development', database: '/fixture/data/office.db', port: 29991 }
const to = { ...from, repository: '/fixture/stable' }
let serial = 0
const pin = (id: string, seq = 1) => ({ id, seq, contentHash: (t.client.sqlite.prepare('SELECT content_hash FROM revisions WHERE record_id=? AND seq=?').get(id, seq) as any).content_hash })
function actor(handle: string, role: string) {
  const record = t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: `Made-up ${handle}`, data: { handle, runtime: 'codex', state: 'active' }, actor: t.api.HUMAN })
  const registry = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle=?').get(handle) as any
  t.client.sqlite.prepare('UPDATE agents SET role=? WHERE id=?').run(role, registry.id)
  const run = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Made-up notice run', data: { state: 'running', servingAgent: registry.id }, actor: t.api.HUMAN })
  return { type: 'agent', id: registry.id, keyHolder: registry.id, provedBy: 'an-agent-key', sessionId: run.id }
}
async function announcement(): Promise<any> {
  const n = ++serial
  const texts = { before: `Made-up first handoff ${n}: the stable checkout will serve the same code. No feature will change.`, after: `Made-up first handoff ${n}: the stable checkout now serves the same code. No feature changed.` }
  const notes = Object.fromEntries(Object.entries(texts).map(([stage, text]) => {
    const note = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Made-up secretary approval', data: { body: 'Earlier made-up words.' }, actor: secretary })
    t.api.patchRecord(note.id, { dataPatch: { body: text } }, secretary)
    return [stage, { text, approval: pin(note.id, 2) }]
  }))
  const receipt = t.api.createRecord({ workspaceId: 'default', kind: 'whole_suite_receipt', title: 'Made-up original green receipt',
    data: { ...WHOLE_SUITE_RECEIPT_EXAMPLE, repository: from.repository, clone: '/fixture/cloud-suite', commit, tree }, actor: writer })
  const a = { candidateTag: `stable-2026-10-17-first-${n}`, from, to, tree, evidence: pin(receipt.id), notices: notes }
  return { ...a, authority: (await fixtureBootstrapAuthority(t, a, writer, secretary)).authority }
}
const beforeRequest = (a: any) => ({ kind: 'first-handoff', stage: 'before', sendId: `bootstrap-before-${serial}`, announcement: a })
const afterRequest = (before: any, a: any) => ({ kind: 'first-handoff', stage: 'after', sendId: `bootstrap-after-${serial}`, before: before.original,
  outcome: { state: 'handed-off', verification: { result: 'handed-off', evidence: a.evidence, serving: to } } })
const writes = () => (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions').get() as any).n
beforeAll(async () => {
  t = await freshDb()
  const { readTheRoleCards } = await import('../src/server/lib/roles.ts')
  readTheRoleCards({ guardActKeys: t.api.GOVERNANCE_GUARDS.flatMap(g => [g.actKey, g.personAct]) })
  writer = actor('bootstrap-writer', 'worker'); secretary = actor('bootstrap-secretary', 'secretary'); stranger = actor('bootstrap-stranger', 'worker')
  shared = await import(sharedModule); server = await import(serverModule)
})
afterAll(() => t?.close())

it('keeps first handoff strict and separate from ordinary upgrade schemas', async () => {
  const a = await announcement(), request = beforeRequest(a)
  expect(shared.stableBootstrapNoticeRequestSchema.safeParse(request).success).toBe(true)
  for (const patch of [{ to: { ...to, commit: 'c'.repeat(40) } }, { to: from }, { to: { ...to, database: '/fixture/other.db' } }, { baselineTag: 'pretend-previous' }]) {
    expect(shared.stableBootstrapNoticeRequestSchema.safeParse({ ...request, announcement: { ...a, ...patch } }).success).toBe(false)
  }
  expect(shared.stableBootstrapNoticeRequestSchema.safeParse({ ...request, surprise: true }).success).toBe(false)
  const ordinary = { candidateTag: a.candidateTag, baselineTag: 'old-baseline', fromCommit: commit, toCommit: commit, tree, evidence: a.evidence, notice: a.notices.before.text, noticeApproval: a.notices.before.approval }
  expect(stableUpgradeAnnouncementSchema.safeParse(ordinary).success).toBe(false)
  const event = { version: 2, project: 'default', date: '2026-10-17 01:00:00', request }
  expect(shared.stableOfficeNoticeEventSchema.safeParse(event).success).toBe(true)
  expect(stableUpgradeNoticeEventSchema.safeParse(event).success).toBe(false)
})

it('requires exact source identity receipt and original secretary revisions before writing first handoff', async () => {
  const a = await announcement(), request = beforeRequest(a)
  t.api.patchRecord(a.notices.before.approval.id, { dataPatch: { body: 'Later edited made-up words.' } }, secretary)
  const count = writes()
  const workerNote = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Made-up worker words', data: { body: a.notices.before.text }, actor: writer })
  const otherReceipt = t.api.createRecord({ workspaceId: 'default', kind: 'whole_suite_receipt', title: 'Another made-up green receipt for the same code',
    data: { ...WHOLE_SUITE_RECEIPT_EXAMPLE, repository: from.repository, clone: '/fixture/another-cloud-suite', commit, tree }, actor: writer })
  const afterNote = writes()
  for (const bad of [
    { ...a, from: { ...from, repository: '/fixture/wrong' } },
    { ...a, tree: 'c'.repeat(40) },
    { ...a, evidence: pin(otherReceipt.id) },
    { ...a, notices: { ...a.notices, before: { ...a.notices.before, approval: { ...a.notices.before.approval, contentHash: '0'.repeat(16) } } } },
    { ...a, notices: { ...a.notices, before: { ...a.notices.before, approval: pin(workerNote.id) } } },
  ]) expect(() => server.fileStableUpgradeNotice('default', { ...request, announcement: bad }, writer, () => from)).toThrow()
  expect(writes()).toBe(afterNote)
  expect(afterNote).toBe(count + 2)
  const saved = server.fileStableUpgradeNotice('default', request, writer, () => from)
  expect(saved.event.version).toBe(2)
  expect(saved.content.data.body).toBe(a.notices.before.text)
  expect(versionOf(saved.content)).toBe(saved.original.contentHash)
  expect(() => t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Made-up forged handoff', data: { body: 'Made-up body.', extra: { stableUpgradeNotice: saved.event } }, actor: writer })).toThrow('Only POST')
})

it('pins one original handoff outcome to the target repository and reconciles unchanged history', async () => {
  const a = await announcement(), request = beforeRequest(a)
  const first = server.fileStableUpgradeNotice('default', request, writer, () => from)
  const after = afterRequest(first, a), count = writes()
  expect(() => server.fileStableUpgradeNotice('default', after, writer, () => from)).toThrow()
  expect(() => server.fileStableUpgradeNotice('default', after, stranger, () => to)).toThrow()
  expect(() => server.fileStableUpgradeNotice('default', { ...after, before: { ...first.original, contentHash: '0'.repeat(16) } }, writer, () => to)).toThrow()
  expect(writes()).toBe(count)
  const saved = server.fileStableUpgradeNotice('default', after, writer, () => to)
  expect(saved.content.data.body).toBe(a.notices.after.text)
  expect(server.fileStableUpgradeNotice('default', after, writer, () => from)).toEqual({ ...saved, replayed: true })
  expect(server.lookupStableUpgradeNotice('default', after.sendId, writer).notice.original).toEqual(saved.original)
  expect(() => server.fileStableUpgradeNotice('default', { ...after, sendId: `${after.sendId}-other` }, writer, () => to)).toThrow()
  t.client.sqlite.prepare('UPDATE records SET deleted_at=? WHERE id=?').run('2026-10-17 02:00:00', first.original.id)
  const page = shared.stableOfficeHistoryPageSchema.parse(server.stableUpgradeHistory('default', 25))
  const row = page.entries.find((r: any) => r.before.id === first.original.id)
  expect(row).toMatchObject({ kind: 'first-handoff', baselineTag: null, fromCommit: commit, toCommit: commit,
    fromRepository: from.repository, toRepository: to.repository, notice: a.notices.before.text, outcome: 'handed-off', before: first.original, after: saved.original,
    notices: { before: 'deleted', after: 'unchanged' } })
})

it('keeps refused and failed handoffs from claiming a successful after notice', async () => {
  for (const [index, state] of ['refused', 'failed-restored', 'not-restored'].entries()) {
    const a = await announcement(), first = server.fileStableUpgradeNotice('default', beforeRequest(a), writer, () => from)
    const request = { kind: 'first-handoff', stage: 'after', sendId: `bootstrap-failure-${serial}`, before: first.original,
      outcome: { state, reason: shared.STABLE_BOOTSTRAP_PUBLIC_REASONS[index] } }
    const saved = server.fileStableUpgradeNotice('default', request, writer, () => from)
    expect(saved.content.data.body).toBe(request.outcome.reason)
    expect(saved.content.data.body).not.toBe(a.notices.after.text)
    const row = server.stableUpgradeHistory('default', 25).entries.find((r: any) => r.before.id === first.original.id)
    expect(row.outcome).toBe(state)
  }
})

it('refuses an uncertain same-send first handoff original before runtime fallback or writes', async () => {
  const a = await announcement(), request = beforeRequest(a)
  const first = server.fileStableUpgradeNotice('default', request, writer, () => from)
  const count = writes()
  t.client.sqlite.prepare("UPDATE revisions SET actor_type='human' WHERE record_id=? AND seq=1").run(first.original.id)
  let identityReads = 0
  try {
    expect(() => server.lookupStableUpgradeNotice('default', request.sendId, writer)).toThrow()
    expect(() => server.fileStableUpgradeNotice('default', request, writer, () => { identityReads++; return from })).toThrow()
    expect(identityReads).toBe(0)
    expect(writes()).toBe(count)
  } finally {
    t.client.sqlite.prepare("UPDATE revisions SET actor_type='agent' WHERE record_id=? AND seq=1").run(first.original.id)
  }
  const held = t.client.sqlite.prepare('SELECT data, content_hash FROM revisions WHERE record_id=? AND seq=1').get(first.original.id) as any
  for (const damage of ['hash', 'version']) {
    if (damage === 'hash') t.client.sqlite.prepare('UPDATE revisions SET content_hash=? WHERE record_id=? AND seq=1').run('0'.repeat(16), first.original.id)
    else t.client.sqlite.prepare("UPDATE revisions SET data=json_set(data, '$.extra.stableUpgradeNotice.version', 99) WHERE record_id=? AND seq=1").run(first.original.id)
    try {
      expect(() => server.lookupStableUpgradeNotice('default', request.sendId, writer)).toThrow()
      expect(() => server.fileStableUpgradeNotice('default', request, writer, () => { identityReads++; return from })).toThrow()
      expect(identityReads).toBe(0)
      expect(writes()).toBe(count)
    } finally {
      t.client.sqlite.prepare('UPDATE revisions SET data=?, content_hash=? WHERE record_id=? AND seq=1').run(held.data, held.content_hash, first.original.id)
    }
  }
})

it('refuses an uncertain prior AFTER instead of filing another first handoff outcome', async () => {
  const a = await announcement(), first = server.fileStableUpgradeNotice('default', beforeRequest(a), writer, () => from)
  const request = afterRequest(first, a)
  const last = server.fileStableUpgradeNotice('default', request, writer, () => to), count = writes()
  t.client.sqlite.prepare("UPDATE revisions SET actor_type='human' WHERE record_id=? AND seq=1").run(last.original.id)
  try {
    expect(() => server.fileStableUpgradeNotice('default', { ...request, sendId: `${request.sendId}-uncertain` }, writer, () => to)).toThrow()
    expect(writes()).toBe(count)
  } finally {
    t.client.sqlite.prepare("UPDATE revisions SET actor_type='agent' WHERE record_id=? AND seq=1").run(last.original.id)
  }
  const held = (t.client.sqlite.prepare('SELECT data FROM revisions WHERE record_id=? AND seq=1').get(last.original.id) as any).data
  t.client.sqlite.prepare("UPDATE revisions SET data=json_set(data, '$.extra.stableUpgradeNotice.request.stage', 'damaged-stage') WHERE record_id=? AND seq=1").run(last.original.id)
  try {
    expect(() => server.fileStableUpgradeNotice('default', { ...request, sendId: `${request.sendId}-damaged-stage` }, writer, () => to)).toThrow()
    expect(writes()).toBe(count)
  } finally {
    t.client.sqlite.prepare('UPDATE revisions SET data=? WHERE record_id=? AND seq=1').run(held, last.original.id)
  }
})
