// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { randomBytes, randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { moleOffice, THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { ACROSS_WORKSPACES } from '../src/shared/across-workspaces.ts'
import { KNOWLEDGE_WORKSPACE } from '../src/shared/knowledge/constants.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const unique = () => `case-${randomUUID().slice(0, 23)}`
const officeKey = randomBytes(32).toString('hex')
const person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
let db: TestDb
let app: Awaited<ReturnType<typeof apiApp>>['app']
let records: typeof import('../src/server/lib/records.ts')
let library: typeof import('../src/server/knowledge/library.ts')
let project: string, worker: string, workerKey: string, secretaryId: string, category: string
const settings = ['MOLE_OFFICE_KNOWLEDGE_RATING_ASK', 'MOLE_OFFICE_KNOWLEDGE_LOW_RATING_NOTICE', 'MOLE_OFFICE_KNOWLEDGE_FEWEST_RATINGS'] as const
const agent = (run?: string) => ({ 'x-mole-office-workspace': project, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': worker, 'x-mole-office-key': workerKey, ...(run ? { 'x-mole-office-session': run } : {}) })
async function ask(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown, headers: Record<string, string> = person) {
  const response = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  return { status: response.statusCode, body: response.json() as Record<string, any>, text: response.body }
}
async function posted(url: string, payload: unknown, headers: Record<string, string> = person) {
  const response = await ask('POST', url, payload, headers)
  expect(response.status, response.text).toBe(201)
  return response.body
}
function entry(title: string) {
  return library.createEntry({ title, category, opening: 'Start here.', body: 'A procedure.', resources: [], sources: [{ url: 'https://example.invalid/source' }], aliases: [], language: 'en', reason: 'A reason.' }, { type: 'human', id: THE_PERSON }, project).entry
}
function run() {
  return records.createRecord({ kind: 'session', title: 'A made-up run', workspaceId: project, actor: { type: 'human', id: THE_PERSON }, origin: 'fixture', data: { state: 'running', servingAgent: worker } }).id
}
async function read(runId: string, entryId: string, query = '/api/knowledge/query') {
  const q = await ask('GET', query, undefined, agent(runId)); expect(q.status, q.text).toBe(200)
  const r = await ask('GET', `/api/knowledge/entries/${entryId}`, undefined, agent(runId)); expect(r.status, r.text).toBe(200)
  return q.body.queryId as string
}
const rating = (runId: string, id: string, score: number, text = 'Useful.', suggestion = 'Add an example.') =>
  ask('POST', `/api/knowledge/entries/${id}/ratings`, { score, text, suggestion }, agent(runId))
function notices() {
  return records.listRecords({ workspaceId: ACROSS_WORKSPACES, kind: 'message' }).filter(row => String(row.data['body']).includes('file a package'))
}

beforeEach(async () => {
  db = await freshDb()
  writeFileSync(join(dirname(db.file), 'keys.json'), JSON.stringify({ person: randomBytes(32).toString('hex'), office: officeKey, providers: {} }), { mode: 0o600 })
  app = (await apiApp()).app; await app.ready()
  records = await import('../src/server/lib/records.ts'); library = await import('../src/server/knowledge/library.ts')
  project = unique(); (await import('../src/server/lib/workspaces.ts')).createWorkspace({ id: project, title: 'A project' })
  const secretary = unique()
  const s = await posted('/api/agents/started', { handle: secretary, name: secretary, role: 'secretary' })
  secretaryId = s.agent.id
  const workerName = unique()
  const a = await posted('/api/agents/started', { handle: workerName, name: workerName, role: 'worker' }, { ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': secretary, 'x-mole-office-key': s.whatToGiveIt.key })
  worker = workerName; workerKey = a.whatToGiveIt.key
  const inspector = unique()
  await posted('/api/agents/started', { handle: inspector, name: inspector, role: 'inspector' })
  category = library.createCategory({ title: 'A category' }, { type: 'human', id: THE_PERSON }).category.id
}, 60_000)
afterEach(async () => { for (const name of settings) delete process.env[name]; await app.close(); db.close() })

describe('knowledge after use', () => {
  it('records the office as the writer of the notice mark, with no entry revision by the rater', async () => {
    const e = entry('Needs a notice')
    process.env.MOLE_OFFICE_KNOWLEDGE_FEWEST_RATINGS = '1'
    const r = run()
    await read(r, e.id)
    const result = await rating(r, e.id, 1)
    expect(result.status, result.text).toBe(201)
    expect(notices()).toHaveLength(1)
    const revisions = db.client.sqlite.prepare('SELECT data, actor_type, actor_id FROM revisions WHERE record_id = ? ORDER BY seq').all(e.id) as { data: string; actor_type: string; actor_id: string }[]
    const marked = revisions.filter(revision => JSON.parse(revision.data).lowRatingNotice)
    expect(marked).toHaveLength(1)
    expect(marked[0]).toMatchObject({ actor_type: 'system', actor_id: moleOffice().id })
    expect(revisions.some(revision => revision.actor_type === 'agent' && revision.actor_id === worker)).toBe(false)
  })

  it('takes the whole scale once per reading run, refuses other scores and leaves the entry unchanged', async () => {
    process.env.MOLE_OFFICE_KNOWLEDGE_LOW_RATING_NOTICE = '0'
    const e = entry('Scale')
    const before = records.getRecord(e.id)
    const runs = Array.from({ length: 5 }, run)
    for (const [i, r] of runs.entries()) {
      await read(r, e.id)
      const result = await rating(r, e.id, i + 1)
      expect(result.status, result.text).toBe(201)
    }
    expect(records.getRecord(e.id)).toEqual(before)
    const unread = run()
    const missing = await rating(unread, e.id, 3)
    expect(missing.status).toBe(403); expect(missing.body.error).toMatch(/read/i)
    const noRun = await ask('POST', `/api/knowledge/entries/${e.id}/ratings`, { score: 3, text: 'A', suggestion: 'B' }, agent())
    expect(noRun.status).toBe(400); expect(noRun.body.error).toMatch(/run/i)
    const another = run(); await read(another, e.id)
    for (const score of [0, 6, 2.5]) {
      const denied = await rating(another, e.id, score)
      expect(denied.status).toBe(400); expect(denied.body.error).toMatch(/1.*5|score/i)
    }
    for (const [text, suggestion] of [['', 'B'], ['A', ''], ['a'.repeat(501), 'B'], ['A', 'b'.repeat(501)]]) expect((await rating(another, e.id, 3, text, suggestion)).status).toBe(400)
    const again = await rating(runs[0]!, e.id, 1)
    expect(again.status).toBe(409); expect(again.body.error).toMatch(/already|once/i)
    expect((await ask('POST', '/api/records', { kind: 'knowledge_rating', title: 'Wrong door', data: {} })).status).toBe(403)
    const projectRecord = records.createRecord({ kind: 'note', title: 'A project record', workspaceId: project, actor: { type: 'human', id: THE_PERSON }, data: {} })
    const snapshot = () => ['records', 'links', 'changes', 'revisions'].map(table => db.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())
    const beforeRows = snapshot()
    const wrongKind = await rating(another, projectRecord.id, 3)
    expect(wrongKind.status).toBe(404)
    expect(snapshot()).toEqual(beforeRows)
    expect(records.getRecord(projectRecord.id)).toEqual(projectRecord)
  })

  it('averages ratings, sends one notice, clears the mark on applied changes, and observes the threshold and switch', async () => {
    const e = entry('Needs work')
    process.env.MOLE_OFFICE_KNOWLEDGE_FEWEST_RATINGS = '2'
    const a = run(), b = run(), c = run(), d = run(), f = run(), g = run()
    for (const r of [a, b, c, d, f, g]) await read(r, e.id)
    const first = await rating(a, e.id, 2); expect(first.body.average).toBe(2); expect(notices()).toHaveLength(0)
    const second = await rating(b, e.id, 4); expect(second.body.average).toBe(3)
    expect(notices()).toHaveLength(1)
    expect(notices()[0]!.data['to']).toEqual([{ kind: 'agent', id: secretaryId }])
    expect(String(notices()[0]!.data['body'])).toContain(`/api/knowledge/entries/${e.id}`)
    const third = await rating(c, e.id, 2); expect(third.body.average).toBeCloseTo(8 / 3); expect(notices()).toHaveLength(1)
    const edit = await ask('PATCH', `/api/knowledge/entries/${e.id}`, { body: 'Revised.', sources: [{ url: 'https://example.invalid/changed' }], reason: 'Changed.' }, agent())
    expect(edit.status, edit.text).toBe(200)
    const waiting = await ask('PATCH', `/api/knowledge/entries/${e.id}`, { body: 'Another revision.', reason: 'Proposed.' }, agent())
    expect(waiting.status).toBe(202)
    await rating(d, e.id, 2); expect(notices()).toHaveLength(2)
    const confirm = await ask('POST', `/api/knowledge/changes/${waiting.body.change.id}/confirm`, { reason: 'Checked.' })
    expect(confirm.status, confirm.text).toBe(200)
    await rating(f, e.id, 2); expect(notices()).toHaveLength(3)
    process.env.MOLE_OFFICE_KNOWLEDGE_LOW_RATING_NOTICE = '0'
    const last = await rating(g, e.id, 2); expect(last.status).toBe(201); expect(notices()).toHaveLength(3)
  })

  it('rounds a fractional average in the low-rating notice', async () => {
    process.env.MOLE_OFFICE_KNOWLEDGE_FEWEST_RATINGS = '3'
    const e = entry('Needs a clearer average')
    const runs = [run(), run(), run()]
    for (const r of runs) await read(r, e.id)
    for (const [i, score] of [4, 3, 3].entries()) {
      const result = await rating(runs[i]!, e.id, score)
      expect(result.status, result.text).toBe(201)
    }
    expect(notices()).toHaveLength(1)
    expect(String(notices()[0]!.data['body'])).toContain('averages 3.3 over 3 ratings')
  })

  it('reminds only about unread ratings without blocking the self seal, and the ask switch removes the line', async () => {
    const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts'); copyTheDefaultRegulationsOnce()
    const makeRun = async () => {
      const note = records.createRecord({ kind: 'note', title: 'Made-up work', workspaceId: project, actor: { type: 'human', id: THE_PERSON }, data: { body: 'A result.' } })
      const response = await ask('POST', '/api/records', { kind: 'session', title: 'A run to seal', data: { state: 'running', servingAgent: worker, startedByMoleOffice: true, submission: { kind: 'records', records: [note.id] } } }, { 'x-mole-office-workspace': project, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': THE_MESSAGE_WORKER_ID, 'x-mole-office-key': officeKey })
      expect(response.status, response.text).toBe(201)
      return { id: response.body.record.id as string, key: response.body.runKey.key as string }
    }
    const done = entry('Already rated'), pending = entry('Still to rate')
    const one = await makeRun()
    await read(one.id, done.id); await read(one.id, pending.id); await rating(one.id, done.id, 5)
    const headers = { ...agent(one.id), 'x-mole-office-key': one.key }
    const finish = () => ask('PATCH', `/api/records/${one.id}`, { dataPatch: { state: 'finished' } }, headers)
    const reminded = await finish(); expect(reminded.status, reminded.text).toBe(200)
    expect(JSON.stringify(reminded.body)).toContain('Still to rate')
    expect(JSON.stringify(reminded.body)).toContain(`/api/knowledge/entries/${pending.id}/ratings`)
    expect(JSON.stringify(reminded.body)).not.toContain('Already rated')
    const sealed = await finish(); expect(sealed.status, sealed.text).toBe(200)
    expect(records.getRecord(one.id)!.data['sealedTip']).toBeTruthy()
    const two = await makeRun(); await read(two.id, pending.id); await read(two.id, done.id)
    process.env.MOLE_OFFICE_KNOWLEDGE_RATING_ASK = '0'
    expect((await rating(two.id, done.id, 5)).status).toBe(201)
    const off = await ask('PATCH', `/api/records/${two.id}`, { dataPatch: { state: 'finished' } }, { ...agent(two.id), 'x-mole-office-key': two.key })
    expect(off.status, off.text).toBe(200); expect(JSON.stringify(off.body)).not.toContain(`/api/knowledge/entries/${pending.id}/ratings`)
  })

  it('counts each row and each way, and refuses a span missing an end', async () => {
    process.env.MOLE_OFFICE_KNOWLEDGE_LOW_RATING_NOTICE = '0'
    const first = entry('First'), second = entry('Second')
    const a = run(), b = run()
    await read(a, first.id, '/api/knowledge/search?q=first')
    await read(a, second.id, '/api/knowledge/query')
    await rating(a, first.id, 2)
    await read(b, second.id, `/api/knowledge/query/categories?ids=${category}`)
    await ask('GET', '/api/knowledge/search?q=absent', undefined, agent(b))
    const { knowledgeWrite } = await import('../src/server/knowledge/guard.ts')
    knowledgeWrite(() => records.createRecord({ kind: 'knowledge_query', title: 'A flow step query', workspaceId: KNOWLEDGE_WORKSPACE, actor: { type: 'human', id: THE_PERSON }, data: { way: 'flow step', asked: {}, answered: [], run: b, project, readAfter: [] } }))
    // A real seal is made by the case above; the rows here represent a self seal and a seal by somebody else.
    const actor = { type: 'agent' as const, id: worker, sessionId: a, provedBy: 'an-agent-key' as const }
    const seal = records.createRecord({ kind: 'note', title: 'A seal fixture', workspaceId: project, actor, origin: 'fixture', data: {} })
    db.client.sqlite.prepare("UPDATE records SET kind = 'sealed_tip', data = ? WHERE id = ?").run(JSON.stringify({ seal: { run: a, sealedAt: seal.createdAt } }), seal.id)
    const otherSeal = records.createRecord({ kind: 'note', title: 'Another seal fixture', workspaceId: project, actor: { type: 'human', id: THE_PERSON }, origin: 'fixture', data: {} })
    db.client.sqlite.prepare("UPDATE records SET kind = 'sealed_tip', data = ? WHERE id = ?").run(JSON.stringify({ seal: { run: b, sealedAt: otherSeal.createdAt } }), otherSeal.id)
    expect((await rating(a, second.id, 5)).status).toBe(201)
    const answer = await ask('GET', '/api/knowledge/counts?from=2000-01-01T00:00:00Z&to=2100-01-01T00:00:00Z')
    expect(answer.status, answer.text).toBe(200)
    expect(answer.body).toMatchObject({ runsQueried: 2, queriesByWay: { first: 1, categories: 1, words: 2, 'flow step': 1 }, entriesRead: { reads: 3, distinct: 2 }, ratings: { given: 2, byScore: { '1': 0, '2': 1, '3': 0, '4': 0, '5': 1 } }, entriesUnderFour: 1, wordSearchesWithoutReads: 1, misses: { runs: 1, pairs: 1 } })
    expect((await ask('GET', '/api/knowledge/counts?from=2000-01-01')).status).toBe(400)
    expect((await ask('GET', '/api/knowledge/counts?to=2100-01-01')).status).toBe(400)
  })
})
