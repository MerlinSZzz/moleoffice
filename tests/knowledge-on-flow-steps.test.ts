// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const unique = () => `case-${randomUUID().slice(0, 23)}`
const person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
let db: TestDb
let app: Awaited<ReturnType<typeof apiApp>>['app']
let records: typeof import('../src/server/lib/records.ts')
async function ask(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown, headers: Record<string, string> = person) {
  const response = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  return { status: response.statusCode, body: response.json() as Record<string, any>, text: response.body }
}
async function start(role: string, headers = person) {
  const handle = unique()
  const answer = await ask('POST', '/api/agents/started', { handle, name: handle, role }, headers)
  expect(answer.status, answer.text).toBe(201)
  return { handle, headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': answer.body.whatToGiveIt.key } }
}
beforeAll(async () => { db = await freshDb(); app = (await apiApp()).app; await app.ready(); records = await import('../src/server/lib/records.ts') }, 60_000)
afterAll(async () => { await app.close(); db.close() })

it('attaches knowledge to flow steps and sends and records it at each start', async () => {
  const secretary = await start('secretary')
  const worker = await start('worker', secretary.headers)
  const project = unique()
  const workspaces = await import('../src/server/lib/workspaces.ts')
  workspaces.createWorkspace({ id: project, title: 'A made-up project' })
  const projectHeaders = { ...person, 'x-mole-office-workspace': project }
  const source = records.createRecord({ kind: 'report', title: 'A made-up source', workspaceId: project, actor: { type: 'human', id: THE_PERSON }, origin: 'fixture', data: { blocks: [] } })
  const flow = records.createRecord({ kind: 'flow', title: 'A made-up flow', workspaceId: project, actor: { type: 'human', id: THE_PERSON }, origin: 'fixture', data: {
    declared_in: 'A made-up flow', runs: 'A worker', trigger: 'Work is requested', leaves_behind: 'A result', governed_by: 'This example', reviewed_at: '2026-11-07',
    stages: [1, 2].map(n => ({ n, does: `Step ${n}`, evidence: 'A result', why: 'Needed for the work', sources: [source.id] })),
  } })
  const category = await ask('POST', '/api/knowledge/categories', { title: 'A made-up category' })
  const made = await ask('POST', '/api/knowledge/entries', { title: 'A waiting entry', category: category.body.category.id, opening: 'Begin with this.', body: 'Read the rest.', resources: [], sources: [], aliases: [], language: 'en', reason: 'A made-up reason' })
  expect(made.status, made.text).toBe(202)
  const id = made.body.entry.id as string
  const place = { project, flow: flow.id, step: 2 }
  const door = `/api/knowledge/entries/${id}/attachments`
  const changesBefore = records.listRecords({ workspaceId: 'knowledge', kind: 'knowledge_change' }).length
  const denied = await ask('POST', door, place, worker.headers)
  expect(denied.status).toBe(403); expect(denied.body.error).toMatch(/secretary|person/i)
  for (const bad of [{ ...place, flow: unique() }, { ...place, step: 9 }]) {
    const response = await ask('POST', door, bad, secretary.headers)
    expect(response.status).toBeGreaterThanOrEqual(400); expect(response.body.error).toBeTruthy()
  }
  const attached = await ask('POST', door, place, secretary.headers)
  expect(attached.status, attached.text).toBe(200)
  expect((await ask('POST', door, place, secretary.headers)).body.error).toMatch(/already/i)
  expect(records.getRecord(id)!.data.attachments).toEqual([place])
  expect(records.listRecords({ workspaceId: 'knowledge', kind: 'knowledge_change' })).toHaveLength(changesBefore)
  const run = await ask('POST', '/api/records', { kind: 'session', title: 'A made-up run', data: { state: 'running', servingAgent: worker.handle, flow: flow.id } }, { ...worker.headers, 'x-mole-office-workspace': project })
  expect(run.status, run.text).toBe(201)
  const runId = run.body.record.id as string, flowRun = run.body.flowRun.id as string
  const messages = () => records.listRecords({ workspaceId: project, kind: 'message' }).filter(m => (m.data.extra as any)?.knowledgeForFlowStep?.flowRun === flowRun)
  expect(messages()).toHaveLength(0)
  const step = await ask('POST', `/api/sessions/${runId}/flow-run/steps`, { n: 2, does: 'Start step two', how: 'by an agent', outcome: 'done' }, { ...worker.headers, 'x-mole-office-workspace': project })
  expect(step.status, step.text).toBe(201)
  expect(messages()).toHaveLength(1)
  const message = messages()[0]!
  expect(String(message.data.saidInFull)).toContain('A waiting entry')
  expect(String(message.data.saidInFull)).toContain('Begin with this.')
  expect(String(message.data.saidInFull)).toContain(`GET /api/knowledge/entries/${id}`)
  expect(String(message.data.saidInFull)).toMatch(/wait/i)
  const queries = records.listRecords({ workspaceId: 'knowledge', kind: 'knowledge_query' })
  expect(queries).toHaveLength(1)
  const query = queries[0]!
  expect(query.data).toMatchObject({ way: 'flow step', asked: { flow: flow.id, step: 2, flowRun }, answered: [id], run: runId, project, readAfter: [] })
  const read = await ask('GET', `/api/knowledge/entries/${id}`, undefined, { ...worker.headers, 'x-mole-office-workspace': project, 'x-mole-office-session': runId })
  expect(read.status, read.text).toBe(200)
  expect(records.getRecord(query.id)!.data.readAfter).toEqual([id])
  const detached = await ask('DELETE', `${door}?${new URLSearchParams({ project, flow: flow.id, step: '2' })}`, undefined, secretary.headers)
  expect(detached.status, detached.text).toBe(200)
  expect((await ask('DELETE', `${door}?${new URLSearchParams({ project, flow: flow.id, step: '2' })}`, undefined, secretary.headers)).body.error).toMatch(/not attached/i)
  await ask('POST', `/api/sessions/${runId}/flow-run/steps`, { n: 2, does: 'Start again', how: 'by an agent', outcome: 'done' }, { ...worker.headers, 'x-mole-office-workspace': project })
  expect(messages()).toHaveLength(1)
  expect(records.listRecords({ workspaceId: 'knowledge', kind: 'knowledge_query' })).toHaveLength(1)
  expect((await ask('GET', `/api/knowledge/entries/${id}`, undefined, projectHeaders)).body.entryStatus).toBe('waiting')
  expect(records.listRecords({ workspaceId: 'knowledge', kind: 'knowledge_change' })).toHaveLength(changesBefore)
  expect((await ask('POST', door, { ...place, step: 1 }, secretary.headers)).status).toBe(200)
  const first = await ask('POST', '/api/records', { kind: 'session', title: 'Another made-up run', data: { state: 'running', servingAgent: worker.handle, flow: flow.id } }, { ...worker.headers, 'x-mole-office-workspace': project })
  expect(first.status, first.text).toBe(201)
  const firstMessages = records.listRecords({ workspaceId: project, kind: 'message' }).filter(m => (m.data.extra as any)?.knowledgeForFlowStep?.flowRun === first.body.flowRun.id)
  expect(firstMessages).toHaveLength(1)
  expect(String(firstMessages[0]!.data.saidInFull)).toContain(`GET /api/knowledge/entries/${id}`)
})

it('uses entry status at flow steps and keeps proposals valid across attachment changes', async () => {
  const worker = await start('worker')
  const project = unique()
  const workspaces = await import('../src/server/lib/workspaces.ts')
  workspaces.createWorkspace({ id: project, title: 'A made-up project' })
  const source = records.createRecord({ kind: 'report', title: 'A made-up source', workspaceId: project, actor: { type: 'human', id: THE_PERSON }, origin: 'fixture', data: { blocks: [] } })
  const flow = records.createRecord({ kind: 'flow', title: 'A made-up flow', workspaceId: project, actor: { type: 'human', id: THE_PERSON }, origin: 'fixture', data: {
    declared_in: 'A made-up flow', runs: 'A worker', trigger: 'Work is requested', leaves_behind: 'A result', governed_by: 'This example', reviewed_at: '2026-11-07',
    stages: [{ n: 1, does: 'Start', evidence: 'A result', why: 'Needed for the work', sources: [source.id] }],
  } })
  const place = { project, flow: flow.id, step: 1 }
  const query = new URLSearchParams({ project, flow: flow.id, step: '1' })
  const category = await ask('POST', '/api/knowledge/categories', { title: 'A made-up category' })
  expect(category.status, category.text).toBe(201)
  const fields = { category: category.body.category.id, opening: 'Read this.', body: 'Original.', resources: [], aliases: [], language: 'en', reason: 'A reason' }
  const unsourced = await ask('POST', '/api/knowledge/entries', { ...fields, title: 'A lifted entry', sources: [] })
  expect(unsourced.status, unsourced.text).toBe(202)
  const liftedId = unsourced.body.entry.id as string
  const lifted = await ask('PATCH', `/api/knowledge/entries/${liftedId}`, { sources: [{ record: source.id }], reason: 'A source was found' })
  expect(lifted.status, lifted.text).toBe(200)
  const sourced = await ask('POST', '/api/knowledge/entries', { ...fields, title: 'An in-force entry', sources: [{ record: source.id }] })
  expect(sourced.status, sourced.text).toBe(201)
  const inForceId = sourced.body.entry.id as string
  const proposal = await ask('PATCH', `/api/knowledge/entries/${inForceId}`, { body: 'Proposed after review.', sources: [], reason: 'A proposal' })
  expect(proposal.status, proposal.text).toBe(202)
  for (const id of [liftedId, inForceId]) {
    const read = await ask('GET', `/api/knowledge/entries/${id}`)
    expect(read.body.entryStatus).toBe('in_force')
    expect(read.body.changeWaits).toBe(true)
    const attached = await ask('POST', `/api/knowledge/entries/${id}/attachments`, place)
    expect(attached.status, attached.text).toBe(200)
  }
  const confirmed = await ask('POST', `/api/knowledge/changes/${proposal.body.change.id}/confirm`, { reason: 'Checked' })
  expect(confirmed.status, confirmed.text).toBe(200)
  expect(confirmed.body.entry.data.body).toBe('Proposed after review.')
  expect(confirmed.body.entry.data.attachments).toEqual([place])
  const next = await ask('PATCH', `/api/knowledge/entries/${inForceId}`, { body: 'Proposed before detaching.', sources: [], reason: 'Another proposal' })
  expect(next.status, next.text).toBe(202)
  const detached = await ask('DELETE', `/api/knowledge/entries/${inForceId}/attachments?${query}`)
  expect(detached.status, detached.text).toBe(200)
  const confirmedAfterDetach = await ask('POST', `/api/knowledge/changes/${next.body.change.id}/confirm`, { reason: 'Checked' })
  expect(confirmedAfterDetach.status, confirmedAfterDetach.text).toBe(200)
  expect(confirmedAfterDetach.body.entry.data.body).toBe('Proposed before detaching.')
  expect(confirmedAfterDetach.body.entry.data.attachments).toEqual([])
  const attachedAgain = await ask('POST', `/api/knowledge/entries/${inForceId}/attachments`, place)
  expect(attachedAgain.status, attachedAgain.text).toBe(200)
  const stillWaiting = await ask('PATCH', `/api/knowledge/entries/${inForceId}`, { body: 'Another proposed revision.', sources: [], reason: 'A proposal' })
  expect(stillWaiting.status, stillWaiting.text).toBe(202)
  const run = await ask('POST', '/api/records', { kind: 'session', title: 'A made-up run', data: { state: 'running', servingAgent: worker.handle, flow: flow.id } }, { ...worker.headers, 'x-mole-office-workspace': project })
  expect(run.status, run.text).toBe(201)
  const messages = records.listRecords({ workspaceId: project, kind: 'message' }).filter(m => (m.data.extra as any)?.knowledgeForFlowStep?.flowRun === run.body.flowRun.id)
  expect(messages).toHaveLength(1)
  const text = String(messages[0]!.data.saidInFull)
  expect(text).toContain('A lifted entry')
  expect(text).toContain('An in-force entry')
  expect(text).not.toContain('This entry waits to be checked.')

  const databaseNow = () => {
    const tables = (db.client.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]).map(row => row.name).filter(name => name !== 'api_calls' && name !== 'hourly_calls')
    const counts = tables.map(name => db.client.sqlite.prepare(`SELECT count(*) AS n FROM "${name}"`).get())
    return JSON.stringify([counts, db.client.sqlite.prepare('SELECT * FROM records ORDER BY id').all()])
  }
  const before = databaseNow()
  const invalidDoor = `/api/knowledge/entries/${source.id}/attachments`
  const invalidAttach = await ask('POST', invalidDoor, place)
  expect(invalidAttach.status, invalidAttach.text).toBe(404)
  expect(databaseNow()).toBe(before)
  const invalidDetach = await ask('DELETE', `${invalidDoor}?${query}`)
  expect(invalidDetach.status, invalidDetach.text).toBe(404)
  expect(databaseNow()).toBe(before)
})
