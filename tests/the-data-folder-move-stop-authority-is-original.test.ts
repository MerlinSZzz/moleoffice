// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Original warranted move decisions in a fresh database; every owner word here is made up. */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { fixtureBootstrapKeys } from './stable-bootstrap-authority-fixture.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { localStamp } from '../src/shared/time.ts'

let t: TestDb, app: any, writer: any, secretary: any, key: string
let serial = 0
const scope = (target: string) => ({ version: 1, action: 'stop-to-move-the-data-folder', database: '/fixture/checkout/data/invented.db',
  port: 29991, checkout: '/fixture/checkout', targetFolder: target, targetMode: '700',
  backup: { path: '/fixture/backup.db', sha256: Buffer.alloc(32, 7).toString('base64') } })
const pin = (id: string) => ({ id, seq: 1, contentHash: (t.client.sqlite.prepare('SELECT content_hash FROM revisions WHERE record_id=? AND seq=1').get(id) as any).content_hash })
function actor(handle: string, role: string) {
  t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: 'Made-up ' + handle, data: { handle, runtime: 'codex', state: 'active' }, actor: t.api.HUMAN })
  const { id } = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle=?').get(handle) as any
  t.client.sqlite.prepare('UPDATE agents SET role=? WHERE id=?').run(role, id)
  const session = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Made-up move run', data: { state: 'running', servingAgent: id }, actor: t.api.HUMAN })
  return { type: 'agent', id, keyHolder: id, provedBy: 'an-agent-key', sessionId: session.id }
}
function fixture(targetFolder: string | null = null) {
  const n = ++serial, s = scope(targetFolder ?? '/fixture/private-' + n), words = 'Made-up owner approves this exact move: ' + JSON.stringify(s)
  const message = t.api.createRecord({ workspaceId: 'default', kind: 'message', title: 'Made-up move words', data: { body: words, to: [{ kind: 'agent', id: secretary.id }] }, actor: { ...t.api.HUMAN, provedBy: 'the-person-key' } })
  const title = 'Made-up move decision ' + n
  const decision = t.api.createRecord({ workspaceId: 'default', kind: 'decision', title,
    data: { decided_by: THE_TEST_OFFICES_OWNER.id, authority: 'the owner said so', authority_reference: message.id, because: words, extra: { stableBootstrapStop: s } },
    actor: { ...secretary, warrant: { saidBy: THE_TEST_OFFICES_OWNER.id, words, where: 'message:' + message.id, when: localStamp(new Date()), for: [title] } } })
  return { scope: s, decision: pin(decision.id), sendId: 'fixture-move-' + n }
}
const headers = () => ({ 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': writer.id,
  'x-mole-office-session': writer.sessionId, 'x-mole-office-key': key })
const get = (request: any) => app.app.inject({ method: 'GET', url: '/api/office/bootstrap-stop-authority?request=' + encodeURIComponent(JSON.stringify(request)), headers: headers() })
const post = (request: any) => app.app.inject({ method: 'POST', url: '/api/office/bootstrap-stop-authority', payload: request, headers: headers() })
beforeAll(async () => {
  t = await freshDb(); writer = actor('move-writer', 'worker'); secretary = actor('move-secretary', 'secretary')
  key = await fixtureBootstrapKeys(t, writer.id); app = await apiApp(); await app.app.ready()
})
afterAll(async () => { await app?.app.close(); t?.close() })
it('discovers the single pinned act from its target and echoes the full scope', async () => {
  const f = fixture(), reply = await get({ action: f.scope.action, targetFolder: f.scope.targetFolder })
  expect(reply.statusCode, reply.body).toBe(200)
  expect(reply.json()).toMatchObject({ state: 'available', scope: f.scope, decision: f.decision, reservation: null })
  const shape = await app.app.inject({ method: 'GET', url: '/api/kinds/decision', headers: headers() })
  expect(shape.json().shapes.map((s: any) => s.name)).toContain('DataFolderMoveStopScope')
})
it('reserves the original act exactly once through the same keyed authority path', async () => {
  const f = fixture(), first = await post(f)
  expect(first.statusCode, first.body).toBe(201)
  expect(first.json()).toMatchObject({ state: 'reserved', scope: f.scope, decision: f.decision, initiator: { agent: writer.id, run: writer.sessionId } })
  const second = await post({ ...f, sendId: f.sendId + '-second' })
  expect(second.statusCode, second.body).toBe(409); expect(second.json().code ?? second.json().error?.code).toBeTruthy()
  const read = await get(f)
  expect(read.statusCode, read.body).toBe(200); expect(read.json().state).toBe('reserved')
  const ended = await post({ ...f, reservation: first.json().reservation, outcome: 'moved' })
  expect(ended.statusCode, ended.body).toBe(201); expect(ended.json().state).toBe('consumed')
  expect((await get(f)).json().state).toBe('consumed')
})
it('passes over an act a refused ending consumed, and still counts an open act', async () => {
  const folder = '/fixture/one-folder-' + ++serial, first = fixture(folder)
  const reserved = await post(first)
  expect(reserved.statusCode, reserved.body).toBe(201); expect(reserved.json().state).toBe('reserved')
  const ended = await post({ ...first, reservation: reserved.json().reservation, outcome: 'refused' })
  expect(ended.statusCode, ended.body).toBe(201); expect(ended.json().state).toBe('consumed')
  const missing = await get({ action: first.scope.action, targetFolder: folder })
  expect(missing.statusCode, missing.body).toBe(409); expect(missing.json().code).toBe('dataMoveActMissing')
  const second = fixture(folder), found = await get({ action: second.scope.action, targetFolder: folder })
  expect(found.statusCode, found.body).toBe(200)
  expect(found.json()).toMatchObject({ state: 'available', decision: second.decision, reservation: null })
  const secondReserved = await post(second)
  expect(secondReserved.statusCode, secondReserved.body).toBe(201); expect(secondReserved.json().state).toBe('reserved')
  const third = fixture(folder), ambiguous = await get({ action: third.scope.action, targetFolder: folder })
  expect(ambiguous.statusCode, ambiguous.body).toBe(409); expect(ambiguous.json().code).toBe('dataMoveActAmbiguous')
})
it('refuses a different scope, pin, creation sequence, unauthenticated caller and missing act', async () => {
  const f = fixture()
  for (const bad of [{ ...f, scope: { ...f.scope, port: 29992 } }, { ...f, decision: { ...f.decision, contentHash: '0'.repeat(16) } },
    { ...f, decision: { ...f.decision, seq: 2 } }, { action: f.scope.action, targetFolder: '/fixture/no-act' }]) {
    const response = await get(bad); expect(response.statusCode).toBeGreaterThanOrEqual(400); expect(response.json().code ?? response.json().error?.code).toBeTruthy()
  }
  const response = await app.app.inject({ method: 'POST', url: '/api/office/bootstrap-stop-authority', payload: f, headers: { ...headers(), 'x-mole-office-key': 'made-up-invalid' } })
  expect(response.statusCode).toBe(403)
})
