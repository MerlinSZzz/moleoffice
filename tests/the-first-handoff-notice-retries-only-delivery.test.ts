// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** OLD: delivery understands only upgrades. NEW: first-handoff delivery keeps its own outcome.
 * WHY: a lost reply after publication cannot justify running the transaction or recovery again.
 */
import { afterEach, expect, it } from 'vitest'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { versionOf } from '../src/server/lib/version.ts'
import { theFoldersThisFileMakes } from './stable-bootstrap-test-folder.ts'

const modulePath = '../tools/stable/stable-bootstrap-notices.mjs'
const folders = theFoldersThisFileMakes()
afterEach(() => { folders.removeEveryOne() })

// OLD: no canonical authority echo check. NEW: exact base64 pins survive masking; mismatches fail.
// WHY: an opaque prepared digest must not be replaced with a masked key or another request's answer.
it('verifies the exact authority echo through canonical masking and refuses damaged prepared digests', async () => {
  const lib = await import(modulePath)
  const canonicalPath = '../tools/office-request.mjs'
  const { askTheOffice } = await import(canonicalPath)
  const original = { id: 'fixture-prepared', seq: 1, contentHash: 'a'.repeat(16) }
  const from = { commit: 'b'.repeat(40), repository: '/fixture/development', database: '/fixture/data/office.db', port: 29991 }
  const request = { scope: { version: 1, action: 'stop-serve-dev-for-first-handoff', candidateTag: 'stable-2026-10-17-first',
    tree: 'c'.repeat(40), from, to: { ...from, repository: '/fixture/stable' } }, sendId: 'fixture-before',
    authority: { prepared: original, decision: { ...original, id: 'fixture-decision' }, stateSha256Base64: Buffer.alloc(32, 7).toString('base64') } }
  const caller = { agent: 'fixture-writer', run: 'fixture-run' }
  const response = { ...request, state: 'available', preparedAt: '2026-10-17 01:00:00', warrantWhen: '2026-10-17 01:01:00', reservation: null, outcome: null, caller, initiator: null }
  let returned: any = response
  const officeRequest = async (ask: any) => askTheOffice(ask, { env: { MOLE_OFFICE_API: 'http://fixture.invalid', MOLE_OFFICE_AGENT: 'fixture-writer', MOLE_OFFICE_SESSION: 'fixture-run', MOLE_OFFICE_WORKSPACE: 'default' },
    fetchImpl: async () => new Response(JSON.stringify(returned), { status: 200, headers: { 'content-type': 'application/json' } }) })
  expect((await lib.verifyBootstrapStopAuthority(request, { officeRequest, api: 'http://fixture.invalid' })).authority.stateSha256Base64).toBe(request.authority.stateSha256Base64)
  const expectedBefore = { ...original, id: 'fixture-before-message' }
  returned = { ...response, expectedBefore, state: 'reserved', reservation: expectedBefore, initiator: caller }
  expect((await lib.verifyBootstrapStopAuthority(request, { officeRequest, expectedBefore })).reservation).toEqual(expectedBefore)
  returned = { ...returned, initiator: { ...caller, run: 'another-run' } }
  await expect(lib.verifyBootstrapStopAuthority(request, { officeRequest, expectedBefore })).rejects.toThrow()
  returned = { ...response, sendId: 'another-attempt' }
  await expect(lib.verifyBootstrapStopAuthority(request, { officeRequest })).rejects.toThrow()
  returned = { ...response, authority: { ...request.authority, stateSha256Base64: 'f'.repeat(64) } }
  const masked = await officeRequest({ method: 'GET', path: '/api/office/bootstrap-stop-authority' })
  expect(masked.body).toContain('a key, not shown')
  await expect(lib.verifyBootstrapStopAuthority(request, { officeRequest })).rejects.toThrow()
})

it('retains publication while reconciling the exact first handoff after a lost delivery reply', async () => {
  const lib = await import(modulePath)
  const folder = folders.make('notice-delivery')
  mkdirSync(join(folder, 'private'), { mode: 0o700 })
  const path = join(folder, 'private', 'notice.jsonl')
  const original = { id: 'fixture-receipt', seq: 1, contentHash: 'a'.repeat(16) }
  const commit = 'b'.repeat(40), tree = 'c'.repeat(40)
  const from = { commit, repository: '/fixture/development', database: '/fixture/data/office.db', port: 29991 }
  const serving = { ...from, repository: '/fixture/stable' }
  const c = { candidateTag: 'stable-2026-10-17-first', targetCommit: commit, targetTree: tree,
    developmentRepository: from.repository, stableCheckout: serving.repository, database: serving.database, servicePort: serving.port,
    prepared: { path: '/fixture/private/prepared.json', sha256Base64: Buffer.alloc(32, 7).toString('base64'), event: { id: 'fixture-prepared', seq: 1, contentHash: 'f'.repeat(16) } },
    stopAuthority: { kind: 'owner-decision', decision: { id: 'fixture-decision', seq: 1, contentHash: '1'.repeat(16) } },
    evidence: { recordId: original.id, seq: 1, contentHash: original.contentHash }, noticeSendIds: { before: 'fixture-before', after: 'fixture-after' },
    notices: { before: { text: 'Made-up first handoff will serve the same code. No feature will change.', approval: { id: 'fixture-before-approval', seq: 2, contentHash: 'd'.repeat(16) } },
      after: { text: 'Made-up first handoff now serves the same code. No feature changed.', approval: { id: 'fixture-after-approval', seq: 3, contentHash: 'e'.repeat(16) } } } }
  const posted: any[] = [], saved = new Map<string, any>()
  let verifies = 0, lost = false
  const officeRequest = Object.assign(async (ask: any) => {
    // The office's registry row, whose id the notice tools compare each notice's sender with.
    if (ask.method === 'GET' && ask.path === '/api/participants/agent/mole-office') return { status: 200, body: JSON.stringify({ participant: { id: 'mole-office', handle: 'mole-office', retired: false } }), cut: false, location: null }
    if (ask.method === 'GET') return { status: 200, body: JSON.stringify({ notice: saved.has(c.noticeSendIds.after) ? { ...saved.get(c.noticeSendIds.after), replayed: true } : null }), cut: false, location: null }
    posted.push(structuredClone(ask.body))
    const request = ask.body
    const event = { version: 2, project: 'default', date: '2026-10-17 01:00:00', request }
    const content = { kind: 'message' as const, title: 'Made-up first handoff', summary: null, data: { body: c.notices[request.stage as 'before' | 'after'].text,
      sentBy: { kind: 'agent', id: 'mole-office' }, to: [{ kind: 'person', id: 'fixture-owner' }], notice: 'stableUpgradeNotice', writtenIn: { project: 'default' }, extra: { stableUpgradeNotice: event } }, deletedAt: null }
    const value = { original: { id: `fixture-${request.stage}-message`, seq: 1, contentHash: versionOf(content) }, content, event, replayed: false }
    saved.set(request.sendId, value)
    if (request.stage === 'after' && !lost) { lost = true; throw new Error('Made-up connection lost after filing.') }
    return { status: 201, body: JSON.stringify(value), cut: false, location: null }
  }, { identity: { agent: 'fixture-writer', session: 'fixture-run', project: 'default' } })
  const options = { officeRequest, verifyService: async (seen: any) => { verifies++; expect(seen).toEqual(serving) } }
  lib.validateBootstrapNoticeConfig(c)
  const request = lib.beforeBootstrapRequest(c, from, tree)
  expect(request.announcement.to.port).toBe(c.servicePort)
  const before = await lib.announceBootstrap({ path, api: 'http://fixture.invalid', request, serving, afterSendId: c.noticeSendIds.after, timeoutMs: 1000 }, options)
  const result = { state: 'published', firstHandoff: true }
  const pending = await lib.finishBootstrapNotice({ path, before, result, evidence: original, serving, sendId: c.noticeSendIds.after }, options)
  expect(pending.state).toBe('published'); expect(pending.notices.state).toBe('pending')
  const reconciled = await lib.retryBootstrapNotice(path, options)
  expect(reconciled.state).toBe('published'); expect(reconciled.notices.state).toBe('filed')
  expect(verifies).toBe(1)
  expect(posted.filter(p => p.stage === 'after')).toHaveLength(1)
  expect(posted[1].outcome.state).toBe('handed-off')
  expect(lib.bootstrapNoticeRetryTimeout(path)).toBe(1000)
  const rows = readFileSync(path, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  expect(JSON.parse(rows.find(r => r.step === 'after-ready').payload)).toEqual(posted[1])
  expect(rows.at(-1).reconciled).toBe(true)
})
