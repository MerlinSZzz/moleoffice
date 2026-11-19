// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Each case compares every table before and after a repeated request.
 * Resume and start-an-agent: the same press within a second stores nothing; removing the sentence
 * or adding it to a write makes the case red. Advancing Date one second makes another write.
 * A repeated raised resume leaves the run alone but writes a ledger row; ignoring that row fails.
 * Start-an-agent repeats its nothing-written sentence under says; retaining its old says fails.
 * Notice rules: the same saved rule or restoration stores nothing; removing the sentence or adding
 * it to a write makes the respective case red. The version and reason pin the choice without a clock.
 * A queued notice can write a batch row even when the rule patch is unchanged; ignoring that write
 * makes the case red. The row's absence pins the choice without a clock.
 * Child sweep: closing a stale child writes; a repeat does not. Removing the sentence, adding it to
 * a write, or choosing the wrong cause makes the case red. An unreadable opening stamp is not judged;
 * dropping that condition adds a sentence and makes its case red. A new stale child and a clock one
 * second later make another write; the stored state pins the other choices.
 * Discovery: the repeat in one second stores nothing and the next second writes a stamp; a padded
 * old session name causes a separate binding write. Dropping or adding a sentence, or ignoring the
 * binding, makes the case red. Date is faked for the discovery stamp.
 * The delivery case proves an unchanged start press can still write; ignoring the delivery does not.
 * Every sentence is read from the product's wording function.
 */
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { REPO_ROOT } from '../src/config/settings.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { apiApp, freshDb, FOR_THE_PERSON, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
const person = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const officeKey = randomBytes(32).toString('hex')
const personKey = randomBytes(32).toString('hex')
beforeAll(async () => { t = await freshDb(); writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({ person: personKey, office: officeKey, providers: {} })); app = (await apiApp()).app; await app.ready() }, 60_000)
afterAll(async () => { await app?.close(); t?.close() })
async function sentence(kind: string) {
  const mod = await import('../src/server/lib/records/patching.ts') as unknown as { nothingWrittenSentence: (reason: { kind: string }) => string }
  const value = mod.nothingWrittenSentence({ kind })
  expect(value).toEqual(expect.any(String))
  return value
}
function tables() {
  const db = t.client.sqlite
  const names = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map(row => row.name)
  // Every request changes these bookkeeping tables; tests/a-write-can-be-checked-without-writing-it.test.ts proves GET does too.
  return Object.fromEntries(names.filter(name => name !== 'api_calls' && name !== 'header_only_calls').map(name => [name, db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all()]))
}
async function agent(handle: string, role = 'worker') {
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: person, payload: { handle, name: handle, role } })
  expect(made.statusCode, made.body).toBe(201)
  const { agentByHandle } = await import('../src/server/lib/participants.ts')
  const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  const who = agentByHandle(handle)!
  return { who, headers: { ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': makeAnAgentKey(who.id, null) } }
}
async function repeat(call: () => Promise<import('light-my-request').Response>, cause: string) {
  const before = tables()
  const response = await call()
  expect(response.statusCode, response.body).toBe(200)
  expect(tables()).toEqual(before)
  expect(response.json().nothingWritten).toBe(await sentence(cause))
  return response
}

it('reports a repeated interrupted-run resume request', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 0))
    const a = await agent('resume-reader')
    const message = t.api.createRecord({ workspaceId: 'default', kind: 'message', title: 'A made-up message', data: { body: 'Made-up words.', to: [{ kind: 'agent', id: a.who.id }] }, actor: t.api.HUMAN })
    const run = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'A made-up interrupted run', data: { state: 'paused', runtime: 'opencode', startedByMoleOffice: true, servingAgent: 'resume-reader', servingAgentId: a.who.id, deliveringMessage: message.id, providerSession: 'made-up-conversation', workingDirectory: REPO_ROOT }, actor: { type: 'agent', id: THE_MESSAGE_WORKER_ID } as never })
    const call = () => app.inject({ method: 'POST', url: `/api/office/interrupted-runs/${run.id}/resume`, headers: person, payload: {} })
    const first = await call(); expect(first.statusCode, first.body).toBe(200); expect(first.json().nothingWritten).toBeUndefined()
    await repeat(call, 'already-stored')
    await raisedResumeAlsoWrites(run.id)
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 1))
    const later = await call(); expect(later.statusCode, later.body).toBe(200); expect(later.json().nothingWritten).toBeUndefined()
  } finally { vi.useRealTimers() }
})

it('reports a repeated request to start an agent', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 0))
    const message = t.api.createRecord({ workspaceId: 'default', kind: 'message', title: 'A made-up press', data: { body: 'Made-up words.', to: [{ kind: 'person', id: THE_PERSON }] }, actor: t.api.HUMAN })
    const call = () => app.inject({ method: 'POST', url: `/api/messages/${message.id}/start-an-agent`, headers: person, payload: {} })
    const first = await call(); expect(first.statusCode, first.body).toBe(200); expect(first.json().nothingWritten).toBeUndefined()
    expect(first.json().says).not.toBe(await sentence('already-stored'))
    const same = await repeat(call, 'already-stored')
    expect(same.json().says).toBe(same.json().nothingWritten)
    await deliveryAlsoWrites()
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 1))
    const later = await call(); expect(later.statusCode, later.body).toBe(200); expect(later.json().nothingWritten).toBeUndefined()
  } finally { vi.useRealTimers() }
})

it('reports repeated notice rules', async () => {
  const a = await agent('rules-reader')
  const send = (ifVersion: string | null) => app.inject({ method: 'PUT', url: '/api/messages/notice-rules', headers: a.headers, payload: { mutedKinds: [], because: 'Made-up choice', ifVersion } })
  const first = await send(null); expect(first.statusCode, first.body).toBe(200); expect(first.json().nothingWritten).toBeUndefined()
  await repeat(() => send(first.json().version), 'already-stored')
  await batchAlsoWrites()
  const changed = await app.inject({ method: 'PUT', url: '/api/messages/notice-rules', headers: a.headers, payload: { mutedKinds: [], because: 'Another made-up choice', ifVersion: first.json().version } })
  expect(changed.statusCode, changed.body).toBe(200); expect(changed.json().nothingWritten).toBeUndefined()
})

it('reports a repeated restoration of notice rules', async () => {
  const a = await agent('restore-reader')
  const initial = await app.inject({ method: 'PUT', url: '/api/messages/notice-rules', headers: a.headers, payload: { mutedKinds: [], because: 'Made-up choice', ifVersion: null } })
  expect(initial.statusCode, initial.body).toBe(200)
  const restore = (ifVersion: string) => app.inject({ method: 'POST', url: '/api/messages/notice-rules/restore', headers: a.headers, payload: { seq: 1, because: 'Made-up restoration', ifVersion } })
  const first = await restore(initial.json().version); expect(first.statusCode, first.body).toBe(200); expect(first.json().nothingWritten).toBeUndefined()
  await repeat(() => restore(first.json().version), 'already-stored')
})

it('reports a sweep that has no child left to close', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 0))
    const { openAttachment } = await import('../src/server/lib/attachments.ts')
    const a = t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: 'Made-up lifecycle agent', data: { handle: 'sweep-lifecycle', state: 'active' }, actor: t.api.HUMAN })
    const actor = { type: 'agent', id: 'sweep-lifecycle' } as const
    const parent = openAttachment({ workspaceId: 'default', actor, title: 'Made-up parent', agentId: a.id }).attachment.id
    const child = openAttachment({ workspaceId: 'default', actor, title: 'Made-up child', parentAttachment: parent }).attachment.id
    const call = () => app.inject({ method: 'POST', url: '/api/attachments/sweep-children', headers: person, payload: {} })
    vi.setSystemTime(new Date(2026, 10, 16, 13, 0, 0))
    const first = await call(); expect(first.statusCode, first.body).toBe(200); expect(first.json().closed.map((row: { attachment: { id: string } }) => row.attachment.id)).toContain(child); expect(first.json().nothingWritten).toBeUndefined()
    await repeat(call, 'no-child-to-close')
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 0))
    const nextChild = openAttachment({ workspaceId: 'default', actor, title: 'Another made-up child', parentAttachment: parent }).attachment.id
    vi.setSystemTime(new Date(2026, 10, 16, 13, 0, 1))
    const later = await call(); expect(later.statusCode, later.body).toBe(200); expect(later.json().closed.map((row: { attachment: { id: string } }) => row.attachment.id)).toContain(nextChild); expect(later.json().nothingWritten).toBeUndefined()
    await unreadableChildTime()
  } finally { vi.useRealTimers() }
})

async function unreadableChildTime() {
  const { openAttachment } = await import('../src/server/lib/attachments.ts')
  const a = t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: 'Another made-up lifecycle agent', data: { handle: 'sweep-unknown', state: 'active' }, actor: t.api.HUMAN })
  const actor = { type: 'agent', id: 'sweep-unknown' } as const
  const parent = openAttachment({ workspaceId: 'default', actor, title: 'Another made-up parent', agentId: a.id }).attachment.id
  const child = openAttachment({ workspaceId: 'default', actor, title: 'Another made-up child', parentAttachment: parent }).attachment.id
  t.client.sqlite.prepare('UPDATE records SET created_at=? WHERE id=?').run('unreadable', child)
  const before = tables()
  const response = await app.inject({ method: 'POST', url: '/api/attachments/sweep-children', headers: person, payload: {} })
  expect(response.statusCode, response.body).toBe(200)
  expect(response.json().looked.some((row: { attachment: { id: string }, closed: boolean }) => row.attachment.id === child && !row.closed)).toBe(true)
  expect(response.json().nothingWritten).toBeUndefined()
  expect(tables()).toEqual(before)
}

async function batchAlsoWrites() {
  const a = await agent('batch-reader')
  const body = { mutedKinds: [], batchedKinds: ['theBroadcastIsDue'], because: 'Made-up batch choice' }
  const first = await app.inject({ method: 'PUT', url: '/api/messages/notice-rules', headers: a.headers, payload: { ...body, ifVersion: null } })
  expect(first.statusCode, first.body).toBe(200)
  const { SYSTEM_LINES } = await import('../src/shared/groups.ts')
  const { moleOffice } = await import('../src/shared/participants.ts')
  const { writeASystemLineToOne } = await import('../src/server/lib/groups.ts')
  const sent = writeASystemLineToOne({ kind: 'agent', id: a.who.id }, 'default', SYSTEM_LINES.theBroadcastIsDue('Made-up time'), { type: 'system', id: moleOffice().id })
  // Simulate a queued notice that predates batch holding: the next save has to hold it.
  t.client.sqlite.prepare('DELETE FROM notice_batch_deliveries WHERE delivery_id IN (SELECT id FROM message_delivery WHERE message_id=?)').run(sent.id)
  const before = tables()
  const response = await app.inject({ method: 'PUT', url: '/api/messages/notice-rules', headers: a.headers, payload: { ...body, ifVersion: first.json().version } })
  expect(response.statusCode, response.body).toBe(200)
  expect(response.json().nothingWritten).toBeUndefined()
  expect(tables()).not.toEqual(before)
}

it('reports a repeated discovery but counts a new session-name binding', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join, dirname } = await import('node:path')
  const { default: Fastify } = await import('fastify')
  const { aRealFolderNamed, theProjectHoldsThisFolder } = await import('./helpers.ts')
  const home = mkdtempSync(join(tmpdir(), 'discovery-home-'))
  const folder = aRealFolderNamed('discovery-case')
  let server: FastifyInstance | undefined
  try {
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 0))
    await theProjectHoldsThisFolder('default', folder)
    const dir = join(home, '.claude', 'projects', '-made-up')
    mkdirSync(dir, { recursive: true })
    const conversation = { parentUuid: null, isSidechain: false, type: 'user', message: { role: 'user', content: 'Made-up words.' }, timestamp: new Date().toISOString(), userType: 'external', entrypoint: 'cli', cwd: folder, version: '2.1.223' }
    writeFileSync(join(dir, '11111111-0000-0000-0000-000000000001.jsonl'), JSON.stringify(conversation) + '\n')
    const { sessionRoutes } = await import('../src/server/api/sessions.ts')
    const { installErrorHandling } = await import('../src/server/lib/http.ts')
    server = Fastify(); installErrorHandling(server)
    await server.register(sessionRoutes, { prefix: '/api', env: () => ({ homeDir: home, now: new Date(), scanProcesses: () => ({ ok: true, processes: [] }), runningWithinSeconds: 300, orphanAfterSeconds: 21600 }) })
    await server.ready()
    const call = () => server!.inject({ method: 'POST', url: '/api/sessions/discover', headers: person, payload: {} })
    const first = await call(); expect(first.statusCode, first.body).toBe(200); expect(first.json().nothingWritten).toBeUndefined()
    await repeat(call, 'already-stored')
    const old = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Old made-up run', data: { state: 'finished' }, actor: t.api.HUMAN })
    const note = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Made-up history', data: { body: 'Made-up words.' }, actor: t.api.HUMAN })
    // An old row with a padded name is made directly; the case checks whether the new binding writes.
    t.client.sqlite.prepare('UPDATE changes SET session_id=? WHERE record_id=?').run(' Old made-up run ', note.id)
    const before = tables()
    const binding = await call(); expect(binding.statusCode, binding.body).toBe(200); expect(binding.json().nothingWritten).toBeUndefined(); expect(tables()).not.toEqual(before)
    expect(t.api.getRecord(old.id)).toBeDefined()
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 1))
    const later = await call(); expect(later.statusCode, later.body).toBe(200); expect(later.json().nothingWritten).toBeUndefined()
  } finally { await server?.close(); rmSync(home, { recursive: true, force: true }); rmSync(dirname(folder), { recursive: true, force: true }); vi.useRealTimers() }
})

async function deliveryAlsoWrites() {
    const a = await agent('press-reader')
    const message = t.api.createRecord({ workspaceId: 'default', kind: 'message', title: 'A made-up delivery', data: { body: 'Made-up words.', to: [{ kind: 'agent', id: a.who.id }] }, actor: t.api.HUMAN })
    const call = () => app.inject({ method: 'POST', url: `/api/messages/${message.id}/start-an-agent`, headers: person, payload: {} })
    const first = await call(); expect(first.statusCode, first.body).toBe(200)
    t.client.sqlite.prepare('UPDATE message_delivery SET because=? WHERE message_id=?').run('A made-up earlier reason.', message.id)
    const before = tables()
    const second = await call(); expect(second.statusCode, second.body).toBe(200); expect(second.json().nothingWritten).toBeUndefined(); expect(tables()).not.toEqual(before)
}

/** The repeated raised press keeps the run unchanged but writes a ledger row each time. */
async function raisedResumeAlsoWrites(run: string) {
  const secretary = await agent('raised-resumer', 'secretary')
  const proved = { ...person, 'x-mole-office-key': personKey }
  const raised = await app.inject({ method: 'POST', url: '/api/roles/elevation/raised-resumer', headers: proved, payload: { reason: 'A made-up raise.' } })
  expect(raised.statusCode, raised.body).toBe(201)
  const { setThisOfficesAnswer } = await import('../src/server/lib/what-the-grant-carries.ts')
  const { GATES } = await import('../src/config/gates.mjs')
  const gate = GATES.find((row: { id: string }) => row.id === 'who-resumes-a-run')!
  const saved = await app.inject({ method: 'POST', url: '/api/office/settings', headers: proved, payload: { changes: [{ name: gate.setting, value: 'block' }], because: 'A made-up choice.' } })
  expect(saved.statusCode, saved.body).toBe(200)
  setThisOfficesAnswer('office.resume-a-run', 'may-press', { type: 'human', id: THE_PERSON } as never)
  try {
    const call = () => app.inject({ method: 'POST', url: `/api/office/interrupted-runs/${run}/resume`, headers: secretary.headers, payload: { ...FOR_THE_PERSON } })
    const first = await call(); expect(first.statusCode, first.body).toBe(200)
    const before = t.api.getRecord(run)
    const count = (t.client.sqlite.prepare('SELECT count(*) AS n FROM changes').get() as { n: number }).n
    const again = await call(); expect(again.statusCode, again.body).toBe(200)
    expect(again.json().nothingWritten).toBeUndefined()
    expect(t.api.getRecord(run)).toEqual(before)
    expect((t.client.sqlite.prepare('SELECT count(*) AS n FROM changes').get() as { n: number }).n).toBeGreaterThan(count)
  } finally {
    setThisOfficesAnswer('office.resume-a-run', 'default', { type: 'human', id: THE_PERSON } as never)
    await app.inject({ method: 'POST', url: '/api/office/settings', headers: proved, payload: { changes: [{ name: gate.setting, value: null }], because: 'Made-up cleanup.' } })
  }
}
