// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Each selected door distinguishes a write from a repeat that stores nothing.
 * Close incident: same note in the same second has the sentence, a later second writes again.
 * Removing its sentence, adding one on a write, or choosing the clearing cause turns this case red.
 * Flow: repeating a fact with the current version explains the unchanged values.
 * Notebook: the secretary repeats its own text; that edit adds no timestamp.
 * Duties: creation and an update carry no sentence; repeating that update explains the unchanged record.
 * Role: the same request is repeated after a write.
 * Counter, checklist and checklist item: the same value is repeated after a write.
 * For each door, removing the sentence or adding it to a write turns that case red.
 * Labels and a checklist notice are separate writes: deciding from the record patch alone turns those cases red.
 * A missing person membership is restored by role appointment: ignoring that repair's result turns its case red.
 * Counter and checklist replies use the same sentence in says on a repeat; keeping the old says turns those cases red.
 * Every database table is read before and after the repeat, so a hidden write is visible too.
 */
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { INCIDENT_KIND } from '../src/shared/incident.ts'
import { NOTEBOOK_ENTRY_KIND_KEYS } from '../src/shared/notebook.ts'
import { THE_SECRETARY, THE_WORKER } from '../src/shared/roles.ts'
import { THE_OWNER } from '../src/shared/kinds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { SECRETARIAT_GROUP_KEY } from '../src/shared/groups.ts'
import { apiApp, freshDb, type TestDb, governsTheWholeProject } from './helpers.ts'

const person = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
let t: TestDb
let app: FastifyInstance
beforeAll(async () => { t = await freshDb(); app = (await apiApp()).app; await app.ready() }, 60_000)
afterAll(async () => { await app?.close(); t?.close() })

async function sentence(kind: string): Promise<string> {
  const mod = await import('../src/server/lib/records/patching.ts') as unknown as { nothingWrittenSentence: (reason: { kind: string }) => string }
  const result = mod.nothingWrittenSentence({ kind })
  expect(result).toEqual(expect.any(String))
  return result
}

/** Read every database table and every row, with no guessed list of tables. */
function allRows(): Record<string, string[]> {
  const tables = t.client.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]
  // GET also writes api_calls and header_only_calls: tests/a-write-can-be-checked-without-writing-it.test.ts proves
  // those request bookkeeping tables change regardless of what the door stores.
  return Object.fromEntries(tables.filter(({ name }) => name !== 'api_calls' && name !== 'header_only_calls').map(({ name }) => {
    const quoted = `"${name.replaceAll('"', '""')}"`
    const rows = t.client.sqlite.prepare(`SELECT * FROM ${quoted}`).all().map((row) => JSON.stringify(row)).sort()
    return [name, rows]
  }))
}

it('close incident says when the second close stores nothing', async () => {
  const made = await app.inject({ method: 'POST', url: '/api/records', headers: person, payload: { kind: INCIDENT_KIND, title: 'A test incident', data: { loss: 'A test loss.', timeline: [{ id: 'moment', at: '2026-01-01 12:00', who: 'A witness', what: 'An event.', evidence: 'A note.' }] } } })
  expect(made.statusCode, made.body).toBe(201)
  const id = (made.json() as { record: { id: string } }).record.id
  const close = () => app.inject({ method: 'POST', url: `/api/records/${id}/close-incident`, headers: person, payload: { note: 'The corrective work is complete.' } })
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    const moment = new Date('2026-01-02T12:00:00Z')
    vi.setSystemTime(moment)
    const first = await close()
    expect(first.statusCode, first.body).toBe(200)
    expect(first.json().nothingWritten).toBeUndefined()
    const before = allRows()
    const again = await close()
    expect(again.statusCode, again.body).toBe(200)
    expect(allRows()).toEqual(before)
    expect(again.json().nothingWritten).toBe(await sentence('already-stored'))
    const at = t.api.getRecord(id)!.data['closedWith'] as { at: string }
    vi.setSystemTime(moment.getTime() + 1000)
    const later = await close()
    expect(later.statusCode, later.body).toBe(200)
    expect(later.json().nothingWritten).toBeUndefined()
    const after = t.api.getRecord(id)!.data['closedWith'] as { at: string }
    expect(after.at).not.toBe(at.at)
  } finally {
    vi.useRealTimers()
  }
})

async function send(method: 'POST' | 'PUT' | 'PATCH' | 'GET', url: string, payload?: object, headers = person) {
  return app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
}
async function register(handle: string, role: string) {
  const r = await send('POST', '/api/agents/started', { handle, name: handle, role })
  expect(r.statusCode, r.body).toBe(201)
  return (r.json() as { agent: { id: string } }).agent.id
}
async function unchanged(call: () => ReturnType<typeof send>, status = 200, withSays = false) {
  const before = allRows()
  const r = await call()
  expect(r.statusCode, r.body).toBe(status)
  expect(allRows()).toEqual(before)
  expect(r.json().nothingWritten).toBe(await sentence('already-stored'))
  if (withSays) expect(r.json().says).toBe(r.json().nothingWritten)
}

it('flow facts explain a repeated value', async () => {
  const source = t.api.createRecord({ kind: 'report', title: 'Flow source', data: { blocks: [] }, workspaceId: 'default', actor: t.api.HUMAN })
  const made = await send('POST', '/api/flows', { project: 'default', title: 'A test flow', runsBy: 'A test runner', trigger: 'Before.', leavesBehind: 'A result', declaredIn: 'test/flow', stages: [{ does: 'One step.', why: 'To test.', sources: [source.id] }] })
  expect(made.statusCode, made.body).toBe(201)
  const { flow, version } = made.json() as { flow: string; version: string }
  const first = await send('PATCH', `/api/flows/${flow}`, { ifVersion: version, trigger: 'After.' })
  expect(first.statusCode, first.body).toBe(200)
  expect(first.json().nothingWritten).toBeUndefined()
  // A fresh version is required by the door; the requested fact itself is identical.
  const current = first.json().version as string
  await unchanged(() => send('PATCH', `/api/flows/${flow}`, { ifVersion: current, trigger: 'After.' }))
})

it('a secretary repeating its notebook entry explains the unchanged text', async () => {
  const handle = 'test-notebook-secretary'
  await register(handle, THE_SECRETARY)
  const agent = { ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
  const added = await send('POST', `/api/agents/${handle}/notebook/entries`, { entryKind: NOTEBOOK_ENTRY_KIND_KEYS[0], text: 'Before.' }, agent)
  expect(added.statusCode, added.body).toBe(201)
  const entry = (added.json() as { entries: { id: string }[] }).entries[0]!.id
  const call = () => send('PATCH', `/api/agents/${handle}/notebook/entries/${entry}`, { text: 'After.' }, agent)
  const first = await call()
  expect(first.statusCode, first.body).toBe(200)
  expect(first.json().nothingWritten).toBeUndefined()
  await unchanged(call)
})

it('repeating secretary duties explains the unchanged record', async () => {
  const id = await register('test-duties-secretary', THE_SECRETARY)
  const decision = await send('POST', '/api/records', { kind: 'decision', title: 'Duties decision', data: { option_taken: 'A test choice.', because: 'A test reason.', decided_by: THE_OWNER, ...governsTheWholeProject(), replaces: [] } })
  expect(decision.statusCode, decision.body).toBe(201)
  const decisionId = (decision.json() as { record: { id: string } }).record.id
  const first = await send('PUT', `/api/secretaries/${id}/duties`, { area: 'A test area.', restsOn: [decisionId] })
  expect(first.statusCode, first.body).toBe(201)
  expect(first.json().nothingWritten).toBeUndefined()
  const call = () => send('PUT', `/api/secretaries/${id}/duties`, { area: 'Another test area.', restsOn: [decisionId] })
  const changed = await call()
  expect(changed.statusCode, changed.body).toBe(200)
  expect(changed.json().nothingWritten).toBeUndefined()
  await unchanged(call)
})

it('repeating a role appointment explains the unchanged record', async () => {
  const handle = 'test-card-agent'
  await register(handle, THE_WORKER)
  const call = () => send('POST', `/api/roles/card/${handle}`, { role: THE_SECRETARY })
  const first = await call()
  expect(first.statusCode, first.body).toBe(201)
  expect(first.json().nothingWritten).toBeUndefined()
  await unchanged(call, 201)
})

it('repairing the person membership has no sentence when the role patch is unchanged', async () => {
  const handle = 'test-card-repair-agent'
  await register(handle, THE_WORKER)
  const group = t.client.sqlite.prepare('SELECT id FROM groups WHERE about = ?').get(SECRETARIAT_GROUP_KEY) as { id: string }
  const removed = t.client.sqlite.prepare('DELETE FROM group_members WHERE group_id = ? AND member_kind = ? AND member_id = ?').run(group.id, 'person', THE_PERSON)
  expect(removed.changes).toBeGreaterThan(0)
  const result = await send('POST', `/api/roles/card/${handle}`, { role: THE_WORKER })
  expect(result.statusCode, result.body).toBe(201)
  expect(result.json().nothingWritten).toBeUndefined()
  const restored = t.client.sqlite.prepare('SELECT id FROM group_members WHERE group_id = ? AND member_kind = ? AND member_id = ? AND left_at IS NULL').get(group.id, 'person', THE_PERSON)
  expect(restored).toBeDefined()
})

async function counter() {
  const made = await send('POST', '/api/counters', { title: 'Before counter', counts: 'Test events.', triggers: [{ kind: 'count', n: 3 }], action: { kind: 'task', title: 'Review events' } })
  expect(made.statusCode, made.body).toBe(201)
  return (made.json() as { counter: { id: string } }).counter.id
}
it('repeating a counter edit explains the unchanged record', async () => {
  const id = await counter()
  const call = () => send('PATCH', `/api/counters/${id}`, { title: 'After counter', because: 'A test reason.' })
  const first = await call()
  expect(first.statusCode, first.body).toBe(200)
  expect(first.json().nothingWritten).toBeUndefined()
  expect(first.json().says).toEqual(expect.any(String))
  expect(first.json().says).not.toBe(first.json().nothingWritten)
  await unchanged(call, 200, true)
})
it('a counter label write has no sentence when its title patch is unchanged', async () => {
  const id = await counter()
  const before = allRows()
  const result = await send('PATCH', `/api/counters/${id}`, { title: 'Before counter', label: 'Counter label', because: 'A test reason.' })
  expect(result.statusCode, result.body).toBe(200)
  expect(result.json().nothingWritten).toBeUndefined()
  expect(allRows()).not.toEqual(before)
})

async function checklist() {
  const made = await send('POST', '/api/checklists', { title: 'Before checklist' })
  expect(made.statusCode, made.body).toBe(201)
  return (made.json() as { checklist: { id: string } }).checklist.id
}
it('repeating a checklist title explains the unchanged record', async () => {
  const id = await checklist()
  const call = () => send('PATCH', `/api/checklists/${id}`, { title: 'After checklist' })
  const first = await call()
  expect(first.statusCode, first.body).toBe(200)
  expect(first.json().nothingWritten).toBeUndefined()
  expect(first.json().says).toEqual(expect.any(String))
  expect(first.json().says).not.toBe(first.json().nothingWritten)
  await unchanged(call, 200, true)
})
it('a checklist label write has no sentence when its title patch is unchanged', async () => {
  const id = await checklist()
  const before = allRows()
  const result = await send('PATCH', `/api/checklists/${id}`, { title: 'Before checklist', label: 'Checklist label' })
  expect(result.statusCode, result.body).toBe(200)
  expect(result.json().nothingWritten).toBeUndefined()
  expect(allRows()).not.toEqual(before)
})
it('repeating a checklist item edit explains the unchanged record', async () => {
  const id = await checklist()
  const added = await send('POST', `/api/checklists/${id}/items`, { words: 'Before item' })
  expect(added.statusCode, added.body).toBe(201)
  const item = (added.json() as { item: { id: string } }).item.id
  const call = () => send('PATCH', `/api/checklists/${id}/items/${item}`, { words: 'After item' })
  const first = await call()
  expect(first.statusCode, first.body).toBe(200)
  expect(first.json().nothingWritten).toBeUndefined()
  expect(first.json().says).toEqual(expect.any(String))
  expect(first.json().says).not.toBe(first.json().nothingWritten)
  await unchanged(call, 200, true)
})
it('a checklist notice has no sentence when its item patch is unchanged', async () => {
  const id = await checklist()
  const added = await send('POST', `/api/checklists/${id}/items`, { words: 'One item' })
  expect(added.statusCode, added.body).toBe(201)
  const item = (added.json() as { item: { id: string } }).item.id
  const handle = 'test-checklist-agent'
  await register(handle, THE_WORKER)
  const agent = { ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
  const before = allRows()
  const result = await send('PATCH', `/api/checklists/${id}/items/${item}`, { words: 'One item' }, agent)
  expect(result.statusCode, result.body).toBe(200)
  expect(result.json().nothingWritten).toBeUndefined()
  expect(allRows()).not.toEqual(before)
})
