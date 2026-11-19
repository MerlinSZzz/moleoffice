// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Acceptance also preserves its overlap guidance after the no-write sentence; the old acceptance note makes this case red.
/**
 * Each case checks a first write, an identical repeat, and every database row around the repeat.
 * Apply: an unchanged field and a repeated link; dropping the sentence, adding it to a write,
 * or claiming either unchanged operation wrote makes the case fail.
 * Recipient: the chosen recipient and annotation already match; dropping or adding the sentence fails.
 * Organise: the readings and groups already match; dropping or adding the sentence fails.
 * The apply, recipient and organise inputs contain no stamps, so their values pin the choice.
 * Program, progress and go-first: a repeated booking write is empty in one second and writes later.
 * Resolve and accept: repeated work-domain writes are empty in one second and write later.
 * Honour: a repeated reading is empty in one second and writes later.
 * Each timed case fails if its sentence is removed or attached to a write.
 * Where an answer has says, it repeats the empty-write sentence; keeping its old words fails.
 * Apply gives the same sentence in its note when it stores nothing. A paired computer writes a
 * notice even when every operation matches; leaving the no-write answer on that path fails.
 */
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { AddressInfo } from 'node:net'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { AGENT, apiApp, freshDb, type TestDb } from './helpers.ts'

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
let t: TestDb
let app: FastifyInstance
beforeAll(async () => { t = await freshDb(); app = (await apiApp()).app; await app.ready() }, 60_000)
afterAll(async () => { await app?.close(); t?.close() })

async function sentence(): Promise<string> {
  const mod = await import('../src/server/lib/records/patching.ts') as unknown as { nothingWrittenSentence: (reason: { kind: string }) => string }
  const result = mod.nothingWrittenSentence({ kind: 'already-stored' })
  expect(result).toEqual(expect.any(String))
  return result
}

function everyRow(): Record<string, string[]> {
  const tables = t.client.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]
  const result: Record<string, string[]> = {}
  for (const { name } of tables) {
    // Every request updates these bookkeeping tables, including GET; see a-write-can-be-checked-without-writing-it.test.ts.
    if (name === 'api_calls' || name === 'header_only_calls') continue
    result[name] = t.client.sqlite.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all().map((row) => JSON.stringify(row)).sort()
  }
  return result
}

async function repeat(call: () => ReturnType<typeof post>, status = 200, field?: 'says' | 'note') {
  const first = await call()
  expect(first.statusCode, first.body).toBe(status)
  expect(first.json().nothingWritten).toBeUndefined()
  if (field !== undefined) expect(first.json()[field]).not.toBe(await sentence())
  const before = everyRow()
  const second = await call()
  expect(second.statusCode, second.body).toBe(status)
  expect(everyRow()).toEqual(before)
  expect(second.json().nothingWritten).toBe(await sentence())
  if (field !== undefined) expect(second.json()[field]).toBe(second.json().nothingWritten)
  return { first: first.json(), second: second.json() }
}

it('says an applied delta stored nothing when its field and link already match', async () => {
  const { versionOf } = await import('../src/server/lib/records.ts')
  const target = t.api.createRecord({ workspaceId: 'default', kind: 'task', title: 'A task', data: { state: 'todo' }, actor: AGENT })
  const other = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'A note', data: { body: 'A note.' }, actor: AGENT })
  const proposal = t.api.createRecord({ workspaceId: 'default', kind: 'proposal', title: 'Apply a small change', data: { question: 'Apply?', options: ['yes', 'no'], who_settles_it: 'the owner', extra: { delta: { ops: [
    { op: 'set_field', says: 'Keep the task state.', recordId: target.id, field: 'state', value: 'todo', expectVersion: versionOf(target) },
    { op: 'link', says: 'Link the records.', from: target.id, to: other.id, type: 'relates_to' },
  ] } } }, actor: AGENT })
  const decision = t.api.createRecord({ workspaceId: 'default', kind: 'decision', title: 'Apply it', data: { because: 'It is ready.' }, actor: HUMAN })
  t.api.createLink({ fromId: decision.id, toId: proposal.id, type: 'derived_from', actor: HUMAN })
  const { first, second } = await repeat(() => app.inject({ method: 'POST', url: `/api/planning/proposals/${proposal.id}/apply`, headers }), 200, 'note')
  const words = await import('../src/server/lib/apply.ts') as unknown as { alreadySet: (field: string, title: string) => string; alreadyLinked: (type: string) => string }
  expect(words.alreadySet).toEqual(expect.any(Function))
  expect(words.alreadyLinked).toEqual(expect.any(Function))
  expect(first.ops[0].did).toBe(words.alreadySet('state', target.title))
  expect(second.ops[0].did).toBe(words.alreadySet('state', target.title))
  expect(first.ops[1].did).not.toBe(words.alreadyLinked('relates_to'))
  expect(second.ops[1].did).toBe(words.alreadyLinked('relates_to'))
})

it('says the review recipient was already stored', async () => {
  const reviews = await import('../src/server/lib/reviews.ts')
  const agent = t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: 'Reader', data: { handle: 'reader-for-review', state: 'active' }, actor: HUMAN })
  const page = t.api.createRecord({ workspaceId: 'default', kind: 'module', title: 'Review page', data: { context: 'A page.' }, actor: HUMAN })
  const entry = { target: { kind: 'record' as const, recordId: page.id, workspaceId: 'default' } }
  const review = reviews.startReview({ workspaceId: 'default', entry }, HUMAN)
  const comment = t.api.createRecord({ workspaceId: 'default', kind: 'annotation', title: 'A comment', data: { body: 'A comment.', context: entry, chosenRecipient: { kind: 'agent', agentId: agent.id } }, actor: HUMAN })
  expect(comment.id).toBeTruthy()
  await repeat(() => app.inject({ method: 'POST', url: `/api/reviews/${review.review.id}/recipient`, headers, payload: { recipient: { kind: 'agent', agentId: agent.id } } }))
})

it('says the same readings and groups were already stored', async () => {
  const reviews = await import('../src/server/lib/reviews.ts')
  const page = t.api.createRecord({ workspaceId: 'default', kind: 'module', title: 'A page to read', data: { context: 'A page.' }, actor: HUMAN })
  const entry = { target: { kind: 'record' as const, recordId: page.id, workspaceId: 'default' } }
  const review = reviews.startReview({ workspaceId: 'default', entry }, HUMAN)
  const comment = t.api.createRecord({ workspaceId: 'default', kind: 'annotation', title: 'Check the number', data: { body: 'Check the number.', context: entry }, actor: HUMAN })
  reviews.finishCollecting(review.review.id, 'default', HUMAN)
  const payload = { comments: [{ commentId: comment.id, reading: 'Asks for a check.', intents: ['verify'], artefacts: ['task'] }], groups: [] }
  await repeat(() => app.inject({ method: 'POST', url: `/api/reviews/${review.review.id}/organise`, headers, payload }), 200, 'says')
  await changedGroups()
})

let domainNumber = 0
function domain(): string {
  domainNumber += 1
  const agent = t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: 'Scope worker', data: { handle: `scope-worker-${String(domainNumber)}`, state: 'active' }, actor: HUMAN })
  const run = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Scope run', data: { doing: 'Work on the scope.' }, actor: HUMAN })
  return t.api.createRecord({ workspaceId: 'default', kind: 'work_domain', title: 'Scope', data: { objective: 'Work on the scope.', agent: agent.id, session: run.id }, actor: HUMAN }).id
}

async function timedRepeat(call: () => ReturnType<typeof post>, status = 200, field?: 'says' | 'note'): Promise<void> {
  const first = await call()
  expect(first.statusCode, first.body).toBe(status)
  expect(first.json().nothingWritten).toBeUndefined()
  if (field !== undefined) expect(first.json()[field]).not.toBe(await sentence())
  const before = everyRow()
  const same = await call()
  expect(same.statusCode, same.body).toBe(status)
  expect(everyRow()).toEqual(before)
  expect(same.json().nothingWritten).toBe(await sentence())
  if (field === 'says') expect(same.json().says).toBe(same.json().nothingWritten)
  if (field === 'note') expect(same.json().note).toBe(same.json().nothingWritten + first.json().note.slice(first.json().note.indexOf('.') + 1))
  vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 1))
  const later = await call()
  expect(later.statusCode, later.body).toBe(status)
  expect(later.json().nothingWritten).toBeUndefined()
  expect(everyRow()).not.toEqual(before)
}

it('says an identical work-domain resolution was already stored', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 0))
    const id = domain()
    await timedRepeat(() => app.inject({ method: 'POST', url: `/api/work-domains/${id}/resolve`, headers, payload: {} }))
  } finally { vi.useRealTimers() }
})

it('says an identical work-domain acceptance was already stored', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 0))
    const id = domain()
    const resolved = await app.inject({ method: 'POST', url: `/api/work-domains/${id}/resolve`, headers, payload: {} })
    expect(resolved.statusCode, resolved.body).toBe(200)
    await timedRepeat(() => app.inject({ method: 'POST', url: `/api/work-domains/${id}/accept`, headers, payload: { responses: [], accepted: {} } }), 200, 'note')
  } finally { vi.useRealTimers() }
})

it('says an identical honour reading was already stored', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 0))
    const run = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'A run to read', data: { doing: 'A task.', state: 'running' }, actor: HUMAN })
    await timedRepeat(() => app.inject({ method: 'POST', url: `/api/honour-board/runs/${run.id}/read`, headers }), 201, 'says')
  } finally { vi.useRealTimers() }
})

type Resources = typeof import('../src/server/lib/resources.ts')
type Probe = Resources['LINUX_PROBE']
const processes = new Map<number, NonNullable<ReturnType<Probe['processById']>>>()
let resources: Resources
const asAgent = (id: string) => ({ ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })
async function post(url: string, who: Record<string, string>, payload: object) {
  return app.inject({ method: 'POST', url, headers: who, payload })
}
async function registered(handle: string, role: string, by: Record<string, string>) {
  const answer = await post('/api/agents/started', by, { handle, name: handle, runtime: 'claude-code', role, workArea: [`src/${handle}`] })
  expect(answer.statusCode, answer.body).toBe(201)
}
function fakeProbe(): Probe {
  return {
    platform: 'fake', processById: (pid) => processes.get(pid) ?? null,
    processesInGroup: (pgid) => [...processes.values()].filter((p) => p.pgid === pgid),
    listeningPorts: () => [], gpu: () => ({ available: true, processes: [] }),
    containers: () => ({ available: true, containers: [] }), locks: () => ({ files: [], unreadable: [] }),
    ownProcessGroup: () => 999_999, killProcessGroup: () => { throw new Error('No process is stopped.') },
    stopContainer: () => { throw new Error('No container is stopped.') },
  }
}
beforeAll(async () => {
  process.env.MOLE_OFFICE_GPU_WATCHER = 'test-card-reader'
  resources = await import('../src/server/lib/resources.ts')
  resources.useOsProbe(fakeProbe())
  await registered('test-secretary-a', 'supervisor', headers)
  expect((await post('/api/roles/card/test-secretary-a', headers, { role: 'secretary' })).statusCode).toBe(201)
  await registered('test-secretary-b', 'supervisor', headers)
  expect((await post('/api/roles/card/test-secretary-b', headers, { role: 'secretary' })).statusCode).toBe(201)
  await registered('test-worker-a', 'worker', asAgent('test-secretary-a'))
  await registered('test-worker-b', 'worker', asAgent('test-secretary-b'))
  await registered('test-card-reader', 'worker', headers)
  const card = await post('/api/resources/gpu/reading', asAgent('test-card-reader'), { readAt: '2026-11-16 12:00:00', totalMiB: 16303, usedMiB: 0, processes: [] })
  expect(card.statusCode, card.body).toBe(200)
}, 300_000)
afterAll(() => { resources?.useOsProbe(resources.LINUX_PROBE); delete process.env.MOLE_OFFICE_GPU_WATCHER })
async function booking(who: Record<string, string>, extra: object = {}): Promise<string> {
  const made = await post('/api/bookings', who, { resource: 'gpu', gib: 10, minutes: 60, purpose: 'Test work', start: 'now', ...extra })
  expect(made.statusCode, made.body).toBe(201)
  return made.json().booking.id as string
}
function start(pid: number) {
  processes.set(pid, { pid, pgid: pid, ppid: 1, command: 'test-program', startedAt: '2026-11-16 11:00:00' })
}

it('says the same booking program was already stored', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 0))
    const id = await booking(headers)
    start(9101)
    await timedRepeat(() => post(`/api/bookings/${id}/program`, headers, { pid: 9101 }), 200, 'says')
    await settlementWrites(() => post(`/api/bookings/${id}/program`, headers, { pid: 9101 }))
    await post(`/api/bookings/${id}/cancel`, headers, {})
  } finally { processes.clear(); vi.useRealTimers() }
})

it('says the same booking progress was already stored', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 0))
    const id = await booking(headers)
    start(9102)
    const program = await post(`/api/bookings/${id}/program`, headers, { pid: 9102 })
    expect(program.statusCode, program.body).toBe(200)
    await timedRepeat(() => post(`/api/bookings/${id}/progress`, headers, { done: 1, of: 2 }), 200, 'says')
    await settlementWrites(() => post(`/api/bookings/${id}/progress`, headers, { done: 1, of: 2 }))
    await post(`/api/bookings/${id}/cancel`, headers, {})
  } finally { processes.clear(); vi.useRealTimers() }
})

it('says the same pending go-first answer was already stored', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 0))
    const ahead = await booking(asAgent('test-worker-b'))
    const id = await booking(asAgent('test-worker-a'), { start: 'when-free' })
    const asked = await post(`/api/bookings/${id}/go-first`, asAgent('test-worker-a'), { ahead })
    expect(asked.statusCode, asked.body).toBe(200)
    await timedRepeat(() => post(`/api/bookings/${id}/go-first/answer`, asAgent('test-secretary-a'), { grant: true }), 200, 'says')
    await settlementWrites(() => post(`/api/bookings/${id}/go-first/answer`, asAgent('test-secretary-a'), { grant: true }))
    await post(`/api/bookings/${id}/cancel`, headers, {})
    await post(`/api/bookings/${ahead}/cancel`, headers, {})
  } finally { processes.clear(); vi.useRealTimers() }
})

async function changedGroups(): Promise<void> {
  const reviews = await import('../src/server/lib/reviews.ts')
  const page = t.api.createRecord({ workspaceId: 'default', kind: 'module', title: 'A page with two comments', data: { context: 'A page.' }, actor: HUMAN })
  const entry = { target: { kind: 'record' as const, recordId: page.id, workspaceId: 'default' } }
  const review = reviews.startReview({ workspaceId: 'default', entry }, HUMAN)
  const comments = ['First comment', 'Second comment'].map((body) => t.api.createRecord({ workspaceId: 'default', kind: 'annotation', title: body, data: { body, context: entry }, actor: HUMAN }).id)
  reviews.finishCollecting(review.review.id, 'default', HUMAN)
  const readings = comments.map((commentId) => ({ commentId, reading: 'Asks for a check.', intents: ['verify'], artefacts: ['task'] }))
  const url = `/api/reviews/${review.review.id}/organise`
  const first = await post(url, headers, { comments: readings, groups: [] })
  expect(first.statusCode, first.body).toBe(200)
  const before = everyRow()
  const changed = await post(url, headers, { comments: readings, groups: [{ says: 'Both ask for a check.', commentIds: comments }] })
  expect(changed.statusCode, changed.body).toBe(200)
  expect(everyRow()).not.toEqual(before)
  expect(changed.json().nothingWritten).toBeUndefined()
}

async function settlementWrites(call: () => ReturnType<typeof post>): Promise<void> {
  const other = await booking(headers)
  start(9200)
  const named = await post(`/api/bookings/${other}/program`, headers, { pid: 9200 })
  expect(named.statusCode, named.body).toBe(200)
  processes.delete(9200)
  const before = everyRow()
  const answer = await call()
  expect(answer.statusCode, answer.body).toBe(200)
  expect(everyRow()).not.toEqual(before)
  expect(answer.json().nothingWritten).toBeUndefined()
}

// No clock is faked: the proposal's field and link are pinned by their values, and the notice is a new row.
it('counts the notice written when a repeated proposal is applied from another computer', async () => {
  resources.useOsProbe(resources.LINUX_PROBE)
  await app.listen({ host: '127.0.0.1', port: 0 })
  const here = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const { listenForOtherMachines } = await import('../src/server/index.ts')
  const other = await listenForOtherMachines(app, 0, '127.0.0.1')
  const there = `http://127.0.0.1:${String((other.address() as AddressInfo).port)}`
  try {
    const ask = (where: string, path: string, who: Record<string, string>, payload?: object) =>
      fetch(`${where}${path}`, { method: 'POST', headers: who, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) })
    const asked = await ask(here, '/api/office/visitors', headers, { device: 'A test computer' })
    expect(asked.status).toBe(201)
    const credential = await asked.json() as { token: string; credential: { id: string } }
    const confirmed = await ask(here, `/api/office/visitors/${credential.credential.id}/confirm`, headers, {})
    expect(confirmed.status, await confirmed.text()).toBe(200)
    const remoteHeaders = { ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'a-test-computer', 'x-mole-office-key': credential.token }
    const { versionOf } = await import('../src/server/lib/records.ts')
    const { SYSTEM_LINES } = await import('../src/shared/groups.ts')
    const words = await import('../src/server/lib/apply.ts')
    const target = t.api.createRecord({ workspaceId: 'default', kind: 'task', title: 'A remote task', data: { state: 'todo' }, actor: AGENT })
    const otherRecord = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'A remote note', data: { body: 'A note.' }, actor: AGENT })
    const proposal = t.api.createRecord({ workspaceId: 'default', kind: 'proposal', title: 'Apply a remote change', data: { question: 'Apply?', options: ['yes', 'no'], who_settles_it: 'the owner', extra: { delta: { ops: [
      { op: 'set_field', says: 'Keep the task state.', recordId: target.id, field: 'state', value: 'todo', expectVersion: versionOf(target) },
      { op: 'link', says: 'Link the records.', from: target.id, to: otherRecord.id, type: 'relates_to' },
    ] } } }, actor: AGENT })
    const decision = t.api.createRecord({ workspaceId: 'default', kind: 'decision', title: 'Apply it remotely', data: { because: 'It is ready.' }, actor: HUMAN })
    t.api.createLink({ fromId: decision.id, toId: proposal.id, type: 'derived_from', actor: HUMAN })
    const notice = SYSTEM_LINES.anActWasMadeFromAnotherComputer('').line
    const count = () => (t.client.sqlite.prepare(`SELECT count(*) AS n FROM records WHERE kind = 'message' AND json_extract(data, '$.body') = ? AND EXISTS (SELECT 1 FROM json_each(data, '$.to') WHERE json_extract(value, '$.kind') = 'person' AND json_extract(value, '$.id') = ?)`).get(notice, THE_TEST_OFFICES_OWNER.id) as { n: number }).n
    const path = `/api/planning/proposals/${proposal.id}/apply`
    const beforeFirst = count()
    const first = await ask(there, path, remoteHeaders)
    expect(first.status).toBe(200)
    const firstBody = await first.json() as { note: string; nothingWritten?: string }
    expect(firstBody.nothingWritten).toBeUndefined()
    expect(count()).toBe(beforeFirst + 1)
    const local = await app.inject({ method: 'POST', url: path, headers })
    expect(local.statusCode, local.body).toBe(200)
    expect(local.json().nothingWritten).toBe(await sentence())
    const beforeRepeat = count()
    const repeated = await ask(there, path, remoteHeaders)
    expect(repeated.status).toBe(local.statusCode)
    const answer = await repeated.json() as { applied: boolean; ops: { did: string }[]; created: string[]; note: string; nothingWritten?: string }
    expect(count()).toBe(beforeRepeat + 1)
    expect(answer.nothingWritten).toBeUndefined()
    expect(answer.note).toBe(firstBody.note)
    expect(answer.note).not.toBe(await sentence())
    expect(answer.applied).toBe(local.json().applied)
    expect(answer.created).toEqual(local.json().created)
    expect(answer.ops).toEqual(local.json().ops)
    expect(answer.ops[0]?.did).toBe(words.alreadySet('state', target.title))
    expect(answer.ops[1]?.did).toBe(words.alreadyLinked('relates_to'))
  } finally {
    await new Promise<void>((resolve, reject) => other.close((error) => error ? reject(error) : resolve()))
    resources.useOsProbe(fakeProbe())
  }
}, 60_000)
