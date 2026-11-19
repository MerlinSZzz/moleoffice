// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic receipts and prior-process identity callbacks; the completion door reads the real serving socket, database and checkout. */
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { writeTheBuildStamp } from '../src/config/build-stamp.mjs'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { WHOLE_SUITE_RECEIPT_EXAMPLE } from '../src/shared/whole-suite-receipt.ts'
import { STABLE_UPGRADE_PUBLIC_REASONS, stableUpgradeHistoryPageSchema, stableUpgradeNoticeResultSchema,
  type StableUpgradeNoticeRequest, type StableUpgradeNoticeResult } from '../src/shared/stable-upgrade-notices.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { versionOf } from '../src/server/lib/version.ts'
import type { Actor } from '../src/server/lib/records.ts'

let t: TestDb
let app: FastifyInstance
let lib: typeof import('../src/server/lib/stable-upgrade-notices.ts')
let M: typeof import('../src/server/lib/messages.ts')
let settings: typeof import('../src/config/settings.mjs')
let commit: string
let repository: string
let webDir: string
let run: string
let number = 0
const ids = new Map<string, string>()
const keys = new Map<string, string>()
const runs = new Map<string, string>()
const personKey = randomBytes(32).toString('hex')
const ownerHeaders = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-key': personKey }
function headers(who = 'controller', project = 'default', session = runs.get(who) ?? run) {
  return { 'x-mole-office-workspace': project, 'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': ids.get(who)!, 'x-mole-office-key': keys.get(who)!, 'x-mole-office-session': session }
}
function actor(who = 'controller'): Actor {
  return { type: 'agent', id: ids.get(who)!, keyHolder: ids.get(who)!, provedBy: 'an-agent-key', sessionId: runs.get(who) ?? run }
}
async function ask(method: 'GET' | 'POST', url: string, payload?: unknown, as: Record<string, string> = headers()) {
  return app.inject({ method, url, headers: as, ...(payload === undefined ? {} : { payload: payload as object }) })
}
function reference(id: string, seq = 1) {
  const r = t.client.sqlite.prepare('SELECT content_hash FROM revisions WHERE record_id = ? AND seq = ?').get(id, seq) as { content_hash: string }
  return { id, seq: seq as 1, contentHash: r.content_hash }
}
function announcement(target = 'b'.repeat(40), baseline = commit) {
  const n = ++number
  const notice = `Synthetic upgrade notice ${n}.`
  const note = t.api.createRecord({ kind: 'note', title: `Synthetic approval ${n}`, workspaceId: 'default', data: { body: notice }, actor: actor('secretary') })
  const evidence = t.api.createRecord({ kind: 'whole_suite_receipt', title: `Synthetic original receipt ${n}`, workspaceId: 'default',
    data: { ...WHOLE_SUITE_RECEIPT_EXAMPLE, commit: target }, actor: actor() })
  return { candidateTag: `stable-2026-10-14-fixture-${n}`, baselineTag: `fixture-baseline-${n}`, fromCommit: baseline, toCommit: target,
    tree: WHOLE_SUITE_RECEIPT_EXAMPLE.tree, notice, evidence: reference(evidence.id), noticeApproval: reference(note.id) }
}
function priorBefore() {
  // Simulate the already stopped baseline process. Its callback is explicitly synthetic.
  const a = announcement(commit, 'a'.repeat(40))
  const req: StableUpgradeNoticeRequest = { stage: 'before', sendId: `before-${number}`, announcement: a }
  const result = lib.fileStableUpgradeNotice('default', req, actor(), () => ({ commit: a.fromCommit, repository, database: t.file, port: 12345 }))
  return result
}
function completed(before: StableUpgradeNoticeResult): StableUpgradeNoticeRequest {
  return { stage: 'after', sendId: `after-${number}`, before: before.original, outcome: { state: 'completed', verification: {
    result: 'completed', evidence: before.event.request.stage === 'before' ? before.event.request.announcement.evidence : reference('impossible'),
    serving: { commit, repository, database: t.file, port: (app.server.address() as AddressInfo).port },
  } } }
}
function totalWrites() { return (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions').get() as { n: number }).n }
async function history() {
  const reply = await ask('GET', '/api/office/upgrades?limit=25')
  expect(reply.statusCode, reply.body).toBe(200)
  return stableUpgradeHistoryPageSchema.parse(reply.json())
}
beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({ person: personKey, office: randomBytes(32).toString('hex'), providers: {} }), { mode: 0o600 })
  settings = await import('../src/config/settings.mjs')
  ;({ commit, repository } = settings.theServingInstall())
  webDir = join(dirname(t.file), 'synthetic-web')
  mkdirSync(webDir)
  const { writeTheBuildStamp } = await import('../src/config/build-stamp.mjs')
  writeTheBuildStamp(webDir, { commit })
  const { buildApp } = await import('../src/server/index.ts')
  app = (await buildApp({ production: false, webDir, webAppUrl: 'http://fixture.invalid', logLevel: false })).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  for (const who of ['controller', 'secretary', 'stranger']) {
    const made = await ask('POST', '/api/agents/started', { handle: `notice-${who}`, name: `Synthetic ${who}`, role: who === 'secretary' ? 'secretary' : 'worker' }, ownerHeaders)
    expect(made.statusCode, made.body).toBe(201)
    const data = made.json() as { agent: { id: string }; whatToGiveIt: { key: string } }
    ids.set(who, data.agent.id); keys.set(who, data.whatToGiveIt.key)
  }
  run = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Synthetic controller run', data: { state: 'running', servingAgent: ids.get('controller') }, actor: t.api.HUMAN }).id
  runs.set('controller', run)
  for (const who of ['secretary', 'stranger']) runs.set(who, t.api.createRecord({ workspaceId: 'default', kind: 'session', title: `Synthetic ${who} run`, data: { state: 'running', servingAgent: ids.get(who) }, actor: t.api.HUMAN }).id)
  lib = await import('../src/server/lib/stable-upgrade-notices.ts')
  M = await import('../src/server/lib/messages.ts')
  expect(M.contactsFor({ kind: 'person', id: THE_TEST_OFFICES_OWNER.id }, M.everybodyRegistered(), M.EVERY_PROJECT).some(c => c.who?.id === moleOffice().id)).toBe(false)
})
afterAll(async () => { vi.restoreAllMocks(); await app?.close(); t?.close() })

it('files the approved original notice to the actual owner and refuses secret or unknown input before writes', async () => {
  const a = announcement()
  const beforeWrites = totalWrites()
  const bad = await ask('POST', '/api/office/upgrades/notice', { stage: 'before', sendId: 'bad-secret', announcement: { ...a, notice: 'token=synthetic-private' } })
  expect(bad.statusCode).toBe(400)
  const unknown = await ask('POST', '/api/office/upgrades/notice', { stage: 'before', sendId: 'bad-field', announcement: a, recoveryImagePaths: ['/private/image'] })
  expect(unknown.statusCode).toBe(400)
  expect(totalWrites()).toBe(beforeWrites)
  const reply = await ask('POST', '/api/office/upgrades/notice', { stage: 'before', sendId: `before-${number}`, announcement: a })
  expect(reply.statusCode, reply.body).toBe(201)
  const result = stableUpgradeNoticeResultSchema.parse(reply.json())
  expect(versionOf(result.content)).toBe(result.original.contentHash)
  expect(result.content.data).toMatchObject({ body: a.notice, sentBy: moleOffice(), to: [{ kind: 'person', id: THE_TEST_OFFICES_OWNER.id }], writtenIn: { project: 'default' } })
  expect(result.event.date).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  expect(JSON.stringify(result.content)).not.toContain('recoveryImagePaths')
})

it('uses the pinned secretary revision body and refuses a bad hash or another role without writing', async () => {
  const a = announcement()
  t.api.patchRecord(a.noticeApproval.id, { dataPatch: { body: 'Later synthetic note.' } }, actor('secretary'))
  const good = await ask('POST', '/api/office/upgrades/notice', { stage: 'before', sendId: `before-${number}`, announcement: a })
  expect(good.statusCode, good.body).toBe(201)
  const workerNote = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Synthetic worker approval', data: { body: a.notice }, actor: actor() })
  const beforeWrites = totalWrites()
  for (const noticeApproval of [{ ...a.noticeApproval, contentHash: '0'.repeat(16) }, reference(workerNote.id)]) {
    const bad = await ask('POST', '/api/office/upgrades/notice', { stage: 'before', sendId: `bad-approval-${noticeApproval.id}`, announcement: { ...a, noticeApproval } })
    expect(bad.statusCode, bad.body).toBe(400)
  }
  expect(totalWrites()).toBe(beforeWrites)
})

it('refuses generic create, merge, replacement and revision restore forgery of structured events', async () => {
  const first = priorBefore()
  const data = { body: 'Synthetic generic note.', extra: { stableUpgradeNotice: first.event } }
  expect(() => t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Synthetic forged event', data, actor: actor() })).toThrow('Only POST')
  const note = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Synthetic ordinary note', data: { body: 'Synthetic body.' }, actor: actor() })
  const beforeWrites = totalWrites()
  expect(() => t.api.patchRecord(note.id, { dataPatch: { extra: data.extra } }, actor())).toThrow('Only POST')
  expect(() => t.api.patchRecord(note.id, { data: data }, actor())).toThrow('Only POST')
  const { getRevisionRow, restoreRevision } = await import('../src/server/lib/revisions.ts')
  const row = getRevisionRow(note.id, 1)
  t.client.sqlite.prepare('UPDATE revisions SET data = ? WHERE id = ?').run(JSON.stringify(data), row.id)
  expect(() => restoreRevision(note.id, 1, actor())).toThrow('Only POST')
  expect(totalWrites()).toBe(beforeWrites)
})

it('replays exact originals across runs and changed service identity, but rejects payload and writer mismatches', async () => {
  const first = priorBefore(), request = completed(first)
  const saved = await ask('POST', '/api/office/upgrades/notice', request)
  expect(saved.statusCode, saved.body).toBe(201)
  const original = stableUpgradeNoticeResultSchema.parse(saved.json())
  expect(original.content.data['body']).toBe(`Upgrade completed and verified.\n\n${first.content.data['body']}`)
  const nextRun = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Synthetic next controller run', data: { state: 'running', servingAgent: ids.get('controller') }, actor: t.api.HUMAN }).id
  const spy = vi.spyOn(settings, 'theServingInstall').mockReturnValue({ commit: 'f'.repeat(40), repository })
  const beforeWrites = totalWrites()
  try {
    const replay = await ask('POST', '/api/office/upgrades/notice', request, headers('controller', 'default', nextRun))
    expect(replay.statusCode, replay.body).toBe(200)
    expect(replay.json()).toEqual({ ...original, replayed: true })
    const lookup = await ask('GET', `/api/office/upgrades?sendId=${request.sendId}&limit=1`, undefined, headers('controller', 'default', nextRun))
    expect(lookup.statusCode).toBe(200)
    const { narrowedByPermission, ...contentResult } = original
    expect(lookup.json()).toEqual({ notice: { ...contentResult, replayed: true }, narrowedByPermission })
    const wrongPayload = await ask('POST', '/api/office/upgrades/notice', { ...request, outcome: { state: 'refused', reason: STABLE_UPGRADE_PUBLIC_REASONS[0] } })
    expect(wrongPayload.statusCode).toBe(409)
    const wrongWriter = await ask('GET', `/api/office/upgrades?sendId=${request.sendId}`, undefined, headers('stranger'))
    expect(wrongWriter.statusCode).toBe(403)
    const wrongRun = await ask('GET', `/api/office/upgrades?sendId=${request.sendId}`, undefined, headers('controller', 'default', runs.get('stranger')))
    expect(wrongRun.statusCode, wrongRun.body).toBe(403)
    const secretary = await ask('GET', `/api/office/upgrades?sendId=${request.sendId}`, undefined, headers('secretary'))
    expect(secretary.statusCode, secretary.body).toBe(403)
    expect(totalWrites()).toBe(beforeWrites)
  } finally { spy.mockRestore() }
})

it('requires all full serving identities and the original green receipt before completing', async () => {
  const first = priorBefore(), request = completed(first)
  if (request.stage !== 'after' || request.outcome.state !== 'completed') throw new Error('fixture')
  const redAnnouncement = announcement()
  const red = t.api.createRecord({ workspaceId: 'default', kind: 'whole_suite_receipt', title: 'Synthetic red receipt', data: { ...WHOLE_SUITE_RECEIPT_EXAMPLE, commit: redAnnouncement.toCommit, suiteExitCode: 1 }, actor: actor() })
  const beforeWrites = totalWrites()
  const noGreen = await ask('POST', '/api/office/upgrades/notice', { stage: 'before', sendId: 'red-evidence', announcement: { ...redAnnouncement, evidence: reference(red.id) } })
  expect(noGreen.statusCode, noGreen.body).toBe(400)
  const mismatchedEvidence = await ask('POST', '/api/office/upgrades/notice', { ...request, outcome: { ...request.outcome, verification: { ...request.outcome.verification, evidence: redAnnouncement.evidence } } })
  expect(mismatchedEvidence.statusCode, mismatchedEvidence.body).toBe(409)
  for (const change of [{ commit: commit.slice(0, 7) }, { commit: 'c'.repeat(40) }, { repository: '/wrong/repo' }, { database: '/wrong/database' }, { port: 12345 }]) {
    const bad = await ask('POST', '/api/office/upgrades/notice', { ...request, outcome: { ...request.outcome, verification: { ...request.outcome.verification, serving: { ...request.outcome.verification.serving, ...change } } } })
    expect(bad.statusCode, bad.body).toBeGreaterThanOrEqual(400)
  }
  const spy = vi.spyOn(settings, 'readTheBuildStamp').mockReturnValue({ state: 'none' })
  try { expect((await ask('POST', '/api/office/upgrades/notice', request)).statusCode).toBe(409) } finally { spy.mockRestore() }
  expect(totalWrites()).toBe(beforeWrites)
  const good = await ask('POST', '/api/office/upgrades/notice', request)
  expect(good.statusCode, good.body).toBe(201)
  expect((await history()).entries.find(row => row.before.id === first.original.id)?.outcome).toBe('completed')
})

it('preserves dates, notice and completion after original message edits and soft deletes, ignoring forged latest events', async () => {
  const first = priorBefore(), request = completed(first)
  const saved = await ask('POST', '/api/office/upgrades/notice', request)
  expect(saved.statusCode, saved.body).toBe(201)
  const last = stableUpgradeNoticeResultSchema.parse(saved.json())
  const row = (await history()).entries.find(row => row.before.id === first.original.id)!
  t.client.sqlite.prepare('UPDATE records SET data = ?, created_at = ?, deleted_at = ? WHERE id = ?').run(JSON.stringify({ ...first.content.data, body: 'Edited synthetic notice.', extra: { stableUpgradeNotice: { ...first.event, date: '2099-01-01 00:00:00' } } }), '2099-01-01 00:00:00', '2026-10-14 00:00:00', first.original.id)
  t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify({ ...last.content.data, body: 'Edited synthetic outcome.', extra: { stableUpgradeNotice: { ...last.event, request: { ...request, outcome: { state: 'refused', reason: STABLE_UPGRADE_PUBLIC_REASONS[0] } } } } }), last.original.id)
  expect((await history()).entries.find(r => r.before.id === first.original.id)).toEqual({ ...row, notices: { before: 'deleted', after: 'changed' } })
  const plain = t.api.createRecord({ workspaceId: 'default', kind: 'message', title: 'Synthetic plain message', data: { body: 'Synthetic message.', to: [{ kind: 'person', id: THE_TEST_OFFICES_OWNER.id }] }, actor: actor() })
  t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(first.content.data), plain.id)
  expect((await history()).entries.some(r => r.before.id === plain.id)).toBe(false)
})

it('keeps refusal, restored failure, not-restored and unfinished history distinct and rejects cross-project pins and forged original sender', async () => {
  const pins: StableUpgradeNoticeResult[] = []
  for (const [i, state] of ['refused', 'failed-restored', 'not-restored'].entries()) {
    const first = priorBefore(); pins.push(first)
    const saved = await ask('POST', '/api/office/upgrades/notice', { stage: 'after', sendId: `after-${number}`, before: first.original, outcome: { state, reason: STABLE_UPGRADE_PUBLIC_REASONS[i] } })
    expect(saved.statusCode, saved.body).toBe(201)
  }
  const unfinished = priorBefore()
  const h = await history()
  expect(pins.map(pin => h.entries.find(r => r.before.id === pin.original.id)?.outcome)).toEqual(['refused', 'failed-restored', 'not-restored'])
  expect(h.entries.find(r => r.before.id === unfinished.original.id)?.outcome).toBe('unfinished')
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: 'other-notice-project', title: 'Synthetic other project' })
  const otherRun = t.api.createRecord({ workspaceId: 'other-notice-project', kind: 'session', title: 'Synthetic other-project controller run', data: { state: 'running', servingAgent: ids.get('controller') }, actor: t.api.HUMAN }).id
  const bad = await ask('POST', '/api/office/upgrades/notice', { stage: 'after', sendId: 'cross-project', before: unfinished.original, outcome: { state: 'refused', reason: STABLE_UPGRADE_PUBLIC_REASONS[0] } }, headers('controller', 'other-notice-project', otherRun))
  expect(bad.statusCode, bad.body).toBe(400)
  const forged = { ...unfinished.content.data, sentBy: { kind: 'agent', id: ids.get('controller') } }
  t.client.sqlite.prepare('UPDATE revisions SET data = ? WHERE record_id = ? AND seq = 1').run(JSON.stringify(forged), unfinished.original.id)
  expect((await history()).entries.some(r => r.before.id === unfinished.original.id)).toBe(false)
})

it('returns bounded older pages without client corpus reads and exposes only the owner upgrade contact', async () => {
  const all = (await history()).entries
  const first = await ask('GET', '/api/office/upgrades?limit=2')
  const page = stableUpgradeHistoryPageSchema.parse(first.json())
  expect(page.entries).toEqual(all.slice(0, 2))
  expect(page.older).not.toBeNull()
  expect(page.subtraction).toEqual({ candidates: 3, carried: 2, leftOut: 1, shortened: 0 })
  expect(page.leftOutGroups).toEqual([{ cause: 'budget', bucket: 'older', count: 1, ids: [all[2]!.before.id] }])
  const second = await ask('GET', `/api/office/upgrades?limit=2&before=${page.older}`)
  expect(stableUpgradeHistoryPageSchema.parse(second.json()).entries).toEqual(all.slice(2, 4))
  expect((await ask('GET', '/api/office/upgrades?limit=26')).statusCode).toBe(400)
  expect((await ask('GET', '/api/office/upgrades?sendId=x&before=x')).statusCode).toBe(400)
  expect(M.contactsFor({ kind: 'person', id: THE_TEST_OFFICES_OWNER.id }, M.everybodyRegistered(), M.EVERY_PROJECT).some(c => c.who?.id === moleOffice().id)).toBe(true)
  expect(M.contactsFor({ kind: 'agent', id: ids.get('controller')! }, M.everybodyRegistered(), M.EVERY_PROJECT).some(c => c.who?.id === moleOffice().id)).toBe(false)
})

it('orders pages by original append order when local clocks tie or move backward, using original observation dates', async () => {
  const pins = [priorBefore(), priorBefore(), priorBefore()]
  const { getRevisionRow } = await import('../src/server/lib/revisions.ts')
  for (const [i, pin] of pins.entries()) {
    const row = getRevisionRow(pin.original.id, 1)
    const date = `2026-10-${String(14 - i).padStart(2, '0')} 00:00:00`
    const data = { ...row.data, extra: { stableUpgradeNotice: { ...pin.event, date } } }
    t.client.sqlite.prepare('UPDATE revisions SET at = ?, data = ?, content_hash = ? WHERE id = ?')
      .run('2026-10-01 00:00:00', JSON.stringify(data), versionOf({ ...row, kind: 'message', data }), row.id)
  }
  const first = stableUpgradeHistoryPageSchema.parse((await ask('GET', '/api/office/upgrades?limit=1')).json())
  expect(first.entries[0]?.before.id).toBe(pins[2]!.original.id)
  expect(first.entries[0]?.date).toBe('2026-10-12 00:00:00')
  const second = stableUpgradeHistoryPageSchema.parse((await ask('GET', `/api/office/upgrades?limit=1&before=${first.older}`)).json())
  expect(second.entries[0]?.before.id).toBe(pins[1]!.original.id)
  expect(second.entries[0]?.date).toBe('2026-10-13 00:00:00')
  const third = stableUpgradeHistoryPageSchema.parse((await ask('GET', `/api/office/upgrades?limit=1&before=${second.older}`)).json())
  expect(third.entries[0]?.before.id).toBe(pins[0]!.original.id)
})

it('retains a typed history refusal for invalid options, cursors and unverifiable originals, keeping lookup technical', async () => {
  const beforeWrites = totalWrites()
  for (const url of ['/api/office/upgrades?limit=26', '/api/office/upgrades?before=invalid!', '/api/office/upgrades?before=eA', '/api/office/upgrades?unknown=1']) {
    const reply = await ask('GET', url)
    expect(reply.statusCode, reply.body).toBe(400)
    expect(reply.json()).toMatchObject({ code: 'upgradeHistoryReadRefused', values: {}, error: expect.any(String) })
  }
  expect(totalWrites()).toBe(beforeWrites)
  const one = priorBefore()
  t.client.sqlite.prepare('UPDATE records SET origin = NULL WHERE id = ?').run(one.original.id)
  try {
    const reply = await ask('GET', '/api/office/upgrades?limit=1')
    expect(reply.statusCode, reply.body).toBe(400)
    expect(reply.json()).toMatchObject({ code: 'upgradeHistoryReadRefused', values: {}, error: 'A matched original upgrade announcement could not be verified.' })
  } finally { t.client.sqlite.prepare("UPDATE records SET origin = 'authored' WHERE id = ?").run(one.original.id) }
  const lookup = await ask('GET', '/api/office/upgrades?sendId=x&before=x')
  expect(lookup.statusCode).toBe(400)
  expect(lookup.json().code).toBeUndefined()
})


it('serves the stored authentication kind and holder id beside each exact revision without inferring old proof', async () => {
  const keyed = await ask('POST', '/api/records', { kind: 'note', title: 'Synthetic keyed revision', data: { body: 'Made-up authority fixture.' } })
  expect(keyed.statusCode, keyed.body).toBe(201)
  const keyedId = keyed.json().record.id as string
  const displaced = await ask('POST', '/api/records', { kind: 'note', title: 'Synthetic normalized holder', data: { body: 'Made-up attribution fixture.' } },
    { ...ownerHeaders, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': ids.get('controller')! })
  expect(displaced.statusCode, displaced.body).toBe(201)
  const displacedId = displaced.json().record.id as string
  const legacy = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Synthetic unproved old revision', data: { body: 'Made-up legacy fixture.' },
    actor: { type: 'agent', id: ids.get('controller')!, sessionId: run } })
  for (const [id, proof, holder] of [[keyedId, 'an-agent-key', null], [displacedId, 'the-person-key', THE_TEST_OFFICES_OWNER.id], [legacy.id, null, null]] as const) {
    const stored = t.client.sqlite.prepare('SELECT proved_by, proved_holder FROM revisions WHERE record_id = ? AND seq = 1').get(id) as { proved_by: string | null; proved_holder: string | null }
    expect(stored.proved_by).toBe(proof)
    expect(stored.proved_holder === null ? null : JSON.parse(stored.proved_holder).id).toBe(holder)
    const whole = await ask('GET', `/api/records/${id}/revisions/1`)
    const list = await ask('GET', `/api/records/${id}/revisions`)
    const pair = await ask('GET', `/api/records/${id}/revisions/1/compare/1`)
    for (const reply of [whole, list, pair]) expect(reply.statusCode, reply.body).toBe(200)
    for (const header of [whole.json(), list.json().revisions[0], pair.json().from, pair.json().to]) {
      expect(header).toMatchObject({ provedBy: proof, provedHolder: holder })
      expect(header.who.actorType).toBe(proof === 'the-person-key' ? 'human' : 'agent')
      expect(JSON.stringify(header)).not.toContain(keys.get('controller')!)
      expect(JSON.stringify(header)).not.toContain(personKey)
      expect(header.provedHolder === null || typeof header.provedHolder === 'string').toBe(true)
    }
  }
})

it('names the pinned release authorization on AFTER and preserves that original through edits and retries', async () => {
  const a = announcement(commit, 'a'.repeat(40))
  const authorization = {
    version: 1, mode: 'spacing', reason: 'Made-up release policy for notice provenance.',
    candidateTag: a.candidateTag, baselineTag: a.baselineTag, fromCommit: a.fromCommit, toCommit: a.toCommit,
    tree: a.tree, evidence: a.evidence,
    serving: { commit: a.fromCommit, repository, database: t.file, port: 12345 },
    timeZone: 'UTC', validFrom: '2026-10-15T00:00:00Z', validUntil: '2026-10-15T00:15:00Z',
    baselineSource: { kind: 'bootstrap', note: { id: 'synthetic-baseline-note', seq: 1, contentHash: '0'.repeat(16) } },
  }
  t.api.patchRecord(a.noticeApproval.id, { dataPatch: { extra: { stableReleaseAuthorization: authorization } } }, actor('secretary'))
  const approval = { ...reference(a.noticeApproval.id, 2), seq: 2 }
  const first = lib.fileStableUpgradeNotice('default', { stage: 'before', sendId: `before-${number}`, announcement: { ...a, noticeApproval: approval } }, actor(),
    () => ({ commit: a.fromCommit, repository, database: t.file, port: 12345 }))
  t.api.patchRecord(a.noticeApproval.id, { dataPatch: { extra: { stableReleaseAuthorization: null }, body: 'Later made-up edit.' } }, actor('secretary'))
  const request = completed(first)
  const saved = await ask('POST', '/api/office/upgrades/notice', request)
  expect(saved.statusCode, saved.body).toBe(201)
  const original = stableUpgradeNoticeResultSchema.parse(saved.json())
  expect(original.content.data['body']).toBe(`Upgrade completed and verified.\n\n${a.notice}\n\nRelease authorization: note ${approval.id}, version ${approval.seq}.`)
  const replay = await ask('POST', '/api/office/upgrades/notice', request)
  expect(replay.statusCode, replay.body).toBe(200)
  expect(replay.json()).toEqual({ ...original, replayed: true })
  const rows = await history()
  expect(rows.entries.some(row => row.before.id === first.original.id && row.outcome === 'completed')).toBe(true)
})


it('reads the current registry interpretation of stored authors and refuses ambiguous handles', async () => {
  const made = await ask('POST', '/api/agents/started', { handle: 'synthetic-stored-author', name: 'Made-up stored author', role: 'worker' }, ownerHeaders)
  expect(made.statusCode, made.body).toBe(201)
  const author = made.json() as { agent: { id: string }; whatToGiveIt: { key: string } }
  const asAuthor = { ...ownerHeaders, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'synthetic-stored-author', 'x-mole-office-key': author.whatToGiveIt.key }
  const started = await ask('POST', '/api/records', { kind: 'session', title: 'Made-up handle writer run', data: { state: 'running', servingAgent: author.agent.id } }, asAuthor)
  expect(started.statusCode, started.body).toBe(201)
  const written = await ask('POST', '/api/records', { kind: 'note', title: 'Made-up keyed handle revision', data: { body: 'Synthetic stored handle provenance.' } }, { ...asAuthor, 'x-mole-office-session': started.json().record.id })
  expect(written.statusCode, written.body).toBe(201)
  const noteId = written.json().record.id as string
  const read = async () => {
    const reply = await ask('GET', `/api/records/${noteId}/revisions/1`)
    expect(reply.statusCode, reply.body).toBe(200)
    return reply.json() as { who: { actorType: string; actorId: string; resolvedAgentId: string | null }; provedBy: string }
  }
  expect(await read()).toMatchObject({ who: { actorType: 'agent', actorId: 'synthetic-stored-author', resolvedAgentId: author.agent.id }, provedBy: 'an-agent-key' })
  // Artificial registry history: only the note above is a real normalized keyed write in this test office.
  t.client.sqlite.prepare('UPDATE agents SET retired = 1 WHERE id = ?').run(author.agent.id)
  expect((await read()).who.resolvedAgentId).toBe(author.agent.id)
  const replacements: string[] = []
  for (const suffix of ['retired', 'live']) {
    const next = await ask('POST', '/api/agents/started', { handle: `synthetic-replacement-${suffix}`, name: `Made-up ${suffix} replacement`, role: 'worker' }, ownerHeaders)
    expect(next.statusCode, next.body).toBe(201)
    const id = next.json().agent.id as string; replacements.push(id)
    t.client.sqlite.prepare('UPDATE agents SET retired = ?, handle = ? WHERE id = ?').run(suffix === 'retired' ? 1 : 0, 'synthetic-stored-author', id)
  }
  // Two retired agents plus a live third must not be mistaken for one live author.
  expect((await read()).who).toMatchObject({ actorId: 'synthetic-stored-author', resolvedAgentId: null })
  t.client.sqlite.prepare('UPDATE revisions SET actor_id = ? WHERE record_id = ? AND seq = 1').run(author.agent.id, noteId)
  expect((await read()).who).toMatchObject({ actorId: author.agent.id, resolvedAgentId: author.agent.id })
  t.client.sqlite.prepare('UPDATE revisions SET actor_id = ? WHERE record_id = ? AND seq = 1').run('synthetic-missing-writer', noteId)
  expect((await read()).who).toMatchObject({ actorId: 'synthetic-missing-writer', resolvedAgentId: null })
  expect(replacements).toHaveLength(2)
})

/** A throwaway page checkout: commit A is built, B changes a server file, C changes a page source. */
function aPageRepository(): { root: string; A: string; B: string; C: string } {
  const root = mkdtempSync(join(tmpdir(), 'mole-notice-page-inputs-'))
  const git = (...args: string[]): string => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  const write = (name: string, text: string): void => {
    const path = join(root, name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
  }
  git('init', '-q')
  git('config', 'user.name', 'Notice Fixture')
  git('config', 'user.email', 'notice-fixture@example.invalid')
  write('src/web/index.html', '<script type="module" src="./main.ts"></script>\n')
  write('src/web/main.ts', "export const page = 'first'\n")
  write('vite.config.ts', 'export default {}\n')
  write('package.json', '{"name":"notice-fixture"}\n')
  write('package-lock.json', '{}\n')
  write('tsconfig.json', '{}\n')
  write('public/icon.txt', 'first\n')
  write('src/server/x.ts', "export const x = 'first'\n")
  git('add', '-A')
  git('commit', '-q', '-m', 'A')
  const A = git('rev-parse', 'HEAD')
  write('src/server/x.ts', "export const x = 'second'\n")
  git('add', '-A')
  git('commit', '-q', '-m', 'B')
  const B = git('rev-parse', 'HEAD')
  write('src/web/main.ts', "export const page = 'second'\n")
  git('add', '-A')
  git('commit', '-q', '-m', 'C')
  const C = git('rev-parse', 'HEAD')
  return { root, A, B, C }
}

/** Build a second real app whose startup identity is the throwaway repository at one commit. */
async function theNoticeDoorOf(root: string, builtAt: string, serving: string, sendId: string) {
  const webDir = mkdtempSync(join(tmpdir(), 'mole-notice-page-web-'))
  writeTheBuildStamp(webDir, { commit: builtAt })
  const spy = vi.spyOn(settings, 'theServingInstall').mockReturnValue({ commit: serving, repository: root })
  let own: FastifyInstance | null = null
  try {
    const { buildApp } = await import('../src/server/index.ts')
    own = (await buildApp({ production: false, webDir, webAppUrl: 'http://fixture.invalid', logLevel: false })).app
    await own.ready()
    await own.listen({ host: '127.0.0.1', port: 0 })
    return await own.inject({ method: 'POST', url: '/api/office/upgrades/notice', headers: headers(),
      payload: { stage: 'before', sendId, announcement: announcement('b'.repeat(40), serving) } })
  } finally {
    spy.mockRestore()
    await own?.close()
    rmSync(webDir, { recursive: true, force: true })
  }
}

it('accepts a notice for a page built at an earlier commit when only a server file changed since', async () => {
  const repo = aPageRepository()
  try {
    const reply = await theNoticeDoorOf(repo.root, repo.A, repo.B, 'page-built-at-server-only')
    expect(reply.statusCode, reply.body).toBe(201)
  } finally { rmSync(repo.root, { recursive: true, force: true }) }
})

it('refuses a notice for a page built at an earlier commit when a page source changed since', async () => {
  const repo = aPageRepository()
  try {
    const reply = await theNoticeDoorOf(repo.root, repo.A, repo.C, 'page-built-before-page-change')
    expect(reply.statusCode, reply.body).toBe(409)
    expect(reply.json()).toMatchObject({ error: expect.stringContaining('The built page is not shown to be the page of the serving commit:') })
    expect((reply.json() as { error: string }).error).toContain("The page's inputs changed after it was built: src/web/main.ts")
  } finally { rmSync(repo.root, { recursive: true, force: true }) }
})
