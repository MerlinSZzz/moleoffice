// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The criticism record and its independent filing step. All work here is made up. */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance
let workspace = ''
let caseNumber = 0
const human = (inThis: string = workspace): Record<string, string> => ({ 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': inThis })
const asAgent = (handle: string, inThis: string = workspace): Record<string, string> => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-workspace': inThis })
const facts = { tried: 'File the result', got_in_the_way: 'The door hid the field', did_instead: 'Kept a note', wants_changed: 'Show the field', evidence: ['The field was absent'] }

beforeAll(async () => { t = await freshDb(); app = (await apiApp()).app; await app.ready() }, 60_000)
afterAll(async () => { await app.close(); t.close() })
beforeEach(async () => {
  workspace = `criticism-case-${++caseNumber}`
  const res = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: workspace, title: 'Criticism' } })
  expect(res.statusCode, res.body).toBe(201)
})
async function register(handle: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/agents/started', headers: human(), payload: { handle, name: handle } })
  expect(res.statusCode, res.body).toBe(201)
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }
  return row.id
}
async function setup() {
  const author = `author-${caseNumber}`, critic = `critic-${caseNumber}`
  const authorId = await register(author), criticId = await register(critic)
  const made = await app.inject({ method: 'POST', url: '/api/records', headers: asAgent(author), payload: { kind: 'note', title: 'The work', data: { body: 'The work.' } } })
  expect(made.statusCode, made.body).toBe(201)
  return { author, critic, authorId, criticId, work: made.json().record.id as string }
}
async function file(work: string, critic: string) {
  return app.inject({ method: 'POST', url: `/api/records/${work}/criticisms`, headers: asAgent(critic), payload: { title: 'A criticism', data: facts } })
}
async function list(work: string, inThis: string = workspace, headers: Record<string, string> = human(inThis)) {
  const res = await app.inject({ method: 'GET', url: `/api/records/${work}/criticisms`, headers })
  expect(res.statusCode, res.body).toBe(200)
  return res.json()
}
describe('the criticism record', () => {
  it('1. files another agent’s work and reads all five facts back', async () => {
    const { work, critic } = await setup()
    const res = await file(work, critic)
    expect(res.statusCode, res.body).toBe(201)
    const made = res.json()
    expect(made.record).toMatchObject({ kind: 'criticism', title: 'A criticism', data: facts })
    expect(made.incomplete).toEqual([])
    const read = await list(work)
    expect(read.criticisms).toHaveLength(1)
    expect(read.criticisms[0].record).toEqual(made.record)
  })
  it('2. refuses the author and writes no criticism', async () => {
    const { work, author, critic } = await setup()
    expect((await file(work, critic)).statusCode).toBe(201)
    const before = await list(work)
    const res = await file(work, author)
    expect(res.statusCode, res.body).toBe(403)
    expect(res.body).toContain(author)
    expect(res.body).toMatch(/other registered agent/i)
    expect(res.body).toMatch(/person/i)
    expect((await list(work)).criticisms).toHaveLength(before.criticisms.length)
  })
  it('3. links the criticism about the work and finds it there', async () => {
    const { work, critic } = await setup()
    const made = await file(work, critic)
    expect(made.statusCode, made.body).toBe(201)
    const id = made.json().record.id as string
    const read = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: human() })
    expect(read.statusCode, read.body).toBe(200)
    expect(read.json().links).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'about', other: expect.objectContaining({ id: work }) })]))
    expect((await list(work)).criticisms.map((one: { record: { id: string } }) => one.record.id)).toContain(id)
  })
  it('4. writes the independent mark only through the criticism door', async () => {
    const { work, author, critic, authorId, criticId } = await setup()
    const made = await file(work, critic)
    expect(made.statusCode, made.body).toBe(201)
    expect(made.json().record.data.independent).toMatchObject({ critic: { kind: 'agent', id: criticId }, author: { kind: 'agent', id: authorId }, at: expect.any(String) })
    const plain = await app.inject({ method: 'POST', url: '/api/records', headers: asAgent(author), payload: { kind: 'criticism', title: 'Plain criticism', data: facts, links: [{ type: 'about', toId: work }] } })
    expect(plain.statusCode, plain.body).toBe(201)
    const before = await list(work)
    expect(before.criticisms).toHaveLength(2)
    // THE OLD WORDING WAS "trueFacts ordinary filing reads true": an ordinary POST carrying the true critic,
    // author and time was read as through the step. The mark is now the office's alone, so this POST is refused.
    const claimed = { critic: { kind: 'agent', id: criticId }, author: { kind: 'agent', id: authorId }, at: '2026-11-09 12:00' }
    const filed = await app.inject({ method: 'POST', url: '/api/records', headers: asAgent(author), payload: { kind: 'criticism', title: 'True facts', data: { ...facts, independent: claimed }, links: [{ type: 'about', toId: work }] } })
    expect(filed.statusCode, filed.body).toBe(403)
    expect(filed.body).toMatch(/Only the criticism door writes the independent mark/i)
    expect((await list(work)).criticisms).toHaveLength(before.criticisms.length)
    const patched = await app.inject({ method: 'PATCH', url: `/api/records/${plain.json().record.id}`, headers: asAgent(author), payload: { dataPatch: { independent: claimed } } })
    expect(patched.statusCode, patched.body).toBe(403)
    expect(patched.body).toMatch(/Only the criticism door writes the independent mark/i)
    const stored = await app.inject({ method: 'GET', url: `/api/records/${plain.json().record.id}`, headers: asAgent(author) })
    expect(stored.statusCode, stored.body).toBe(200)
    expect(stored.json().record.data).not.toHaveProperty('independent')
    const read = await list(work)
    expect(read.criticisms).toEqual(expect.arrayContaining([
      expect.objectContaining({ record: expect.objectContaining({ id: made.json().record.id }), independent: true, filedThroughTheStep: true, author: { kind: 'agent', id: authorId }, critic: { kind: 'agent', id: criticId }, at: expect.any(String) }),
      expect.objectContaining({ record: expect.objectContaining({ id: plain.json().record.id }), filedThroughTheStep: false, at: null }),
    ]))
  })
  it('5. answers nothing about a message to a caller who is not a party to it', async () => {
    const sender = `sender-${caseNumber}`, addressee = `addressee-${caseNumber}`, outsider = `outsider-${caseNumber}`
    const addresseeId = await register(addressee)
    await register(sender)
    await register(outsider)
    const title = 'A private message title'
    const sent = await app.inject({ method: 'POST', url: '/api/records', headers: asAgent(sender), payload: { kind: 'message', title, data: { body: 'The words only the sender and the addressee may read.', to: [{ kind: 'agent', id: addresseeId }] } } })
    // NOTHING HOLDS THE ADDRESSEE IN THE TEST OFFICE, so the office stores the message, routes it and answers 409. The
    // message is stored all the same, and the reads below are about it.
    expect(sent.statusCode, sent.body).toBe(409)
    const message = sent.json().record.id as string
    const missing = await app.inject({ method: 'GET', url: '/api/records/no-record-has-this-id/criticisms', headers: asAgent(outsider, 'message-centre') })
    expect(missing.statusCode, missing.body).toBe(404)
    // THE OUTSIDER GETS THE SAME ANSWER AS AN ID THAT NAMES NOTHING, and it never holds the title.
    const refused = await app.inject({ method: 'GET', url: `/api/records/${message}/criticisms`, headers: asAgent(outsider, 'message-centre') })
    expect(refused.statusCode, refused.body).toBe(404)
    expect(refused.json().error).toBe(missing.json().error)
    expect(refused.json().code).toBe(missing.json().code)
    expect(refused.body).not.toContain(title)
    const before = await list(message, 'message-centre', asAgent(addressee, 'message-centre'))
    expect(before.criticisms).toHaveLength(0)
    const forged = await app.inject({ method: 'POST', url: `/api/records/${message}/criticisms`, headers: asAgent(outsider, 'message-centre'), payload: { title: 'A forged criticism', data: facts } })
    expect(forged.statusCode, forged.body).toBe(404)
    expect(forged.json().error).toBe(missing.json().error)
    expect(forged.body).not.toContain(title)
    const after = await list(message, 'message-centre', asAgent(addressee, 'message-centre'))
    expect(after.criticisms).toHaveLength(before.criticisms.length)
    expect(after.about).toMatchObject({ id: message, title })
    // THE PERSON READS EVERY MESSAGE, so the same read answers for them.
    const theirs = await list(message, 'message-centre', human('message-centre'))
    expect(theirs.criticisms).toHaveLength(0)
    expect(theirs.about).toMatchObject({ id: message, title })
  })
  it('6. offers the person no alternative when the person authored the work', async () => {
    const made = await app.inject({ method: 'POST', url: '/api/records', headers: human(), payload: { kind: 'note', title: 'The person’s work', data: { body: 'The person wrote this.' } } })
    expect(made.statusCode, made.body).toBe(201)
    const work = made.json().record.id as string
    const res = await app.inject({ method: 'POST', url: `/api/records/${work}/criticisms`, headers: human(), payload: { title: 'A criticism', data: facts } })
    expect(res.statusCode, res.body).toBe(403)
    expect(res.body).toContain(THE_TEST_OFFICES_OWNER.id)
    expect(res.body).toMatch(/registered agent other than the author/i)
    expect(res.body).not.toMatch(/the person/i)
    expect((await list(work)).criticisms).toHaveLength(0)
  })
})
