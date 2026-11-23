// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const officeKey = randomBytes(32).toString('hex')
const personKey = randomBytes(32).toString('hex')
const handle = `test-${randomBytes(8).toString('hex')}`
const person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': 'default' }
const office = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': THE_MESSAGE_WORKER_ID, 'x-mole-office-key': officeKey, 'x-mole-office-workspace': 'default' }
let t: TestDb
let app: FastifyInstance
let agentId: string
let runId: string
let runKey: string

const blocks = [
  { id: 'first', type: 'text', text: 'The first specimen failed during the initial pull. The fixture remained intact and the measuring equipment recorded the load throughout the attempt. A second operator checked the connections before the next specimen entered the same fixture.' },
  { id: 'second', type: 'text', text: 'The second specimen reached a higher load before it failed. The difference does not establish a reliable improvement because only two specimens have been examined. Further trials will use a larger set and the same equipment.' },
]
const parts = [
  { id: 'one', heading: 'The first specimen broke', text30: 'The first specimen failed while the fixture and instruments remained sound.', text120: 'The first specimen failed during a pull; the measuring equipment and fixture remained intact.', covers: ['first'] },
  { id: 'two', heading: 'More trials are needed', text30: 'A second result cannot establish a reliable improvement.', text120: 'The second result was higher, but a larger set is needed before drawing a conclusion.', covers: ['second'] },
]
const forms = { forms: { label: 'Specimens need further trials', parts } }
const report = (title: string) => ({ kind: 'report', title, data: { blocks }, shortForms: forms })

async function ask(method: 'GET' | 'POST', url: string, payload?: object, headers = person) {
  const response = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  return { status: response.statusCode, body: response.json() as any, text: response.body }
}
async function revisions(id: string) {
  const result = await ask('GET', `/api/records/${id}/revisions`)
  expect(result.status, result.text).toBe(200)
  return (result.body.revisions as { seq: number; contentHash: string }[]).sort((a, b) => a.seq - b.seq)
}
async function reading(id: string) {
  const result = await ask('GET', `/api/records/${id}/short-forms`)
  expect(result.status, result.text).toBe(200)
  return result.body.levels as { rung: string; state: string }[]
}
async function absent(title: string) {
  const result = await ask('GET', `/api/records?limit=25&q=${encodeURIComponent(title)}`)
  expect(result.status, result.text).toBe(200)
  expect((result.body.records as { title: string }[]).some((row) => row.title === title)).toBe(false)
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({ person: personKey, office: officeKey, providers: {} }), { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  const registered = await ask('POST', '/api/agents/started', { handle, name: handle, runtime: 'claude-code', role: 'supervisor' })
  expect(registered.status, registered.text).toBe(201)
  const participants = await ask('GET', '/api/participants')
  agentId = (participants.body.agents as { id: string; handle: string }[]).find((a) => a.handle === handle)!.id
  const run = await ask('POST', '/api/records', { kind: 'session', title: 'A running test session', data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: agentId, doing: 'writing' } }, office)
  expect(run.status, run.text).toBe(201)
  runId = run.body.record.id
  runKey = run.body.runKey.key
}, 60_000)
afterAll(async () => { await app.close(); t.close() })

it('stores a report and all its forms from the create revision', async () => {
  const made = await ask('POST', '/api/records', report('Specimen pull results for review'))
  expect(made.status, made.text).toBe(201)
  const id = made.body.record.id as string
  const ledger = await revisions(id)
  expect(ledger.map((row) => row.seq)).toEqual([1, 2])
  expect(made.body.version).toBe(ledger[1]!.contentHash)
  expect(made.body.shortForms).toBeUndefined()
  const stored = (await ask('GET', `/api/records/${id}`)).body.record.data.shortForms
  for (const key of ['label', 'parts']) {
    expect(stored[key].madeFrom).toEqual({ seq: ledger[0]!.seq, contentHash: ledger[0]!.contentHash })
    expect(stored[key].writtenBy).toBe('human')
  }
  expect(stored.parts.parts.map((part: { covers: string[] }) => part.covers)).toEqual([['first'], ['second']])
  const levels = await reading(id)
  for (const rung of ['label', 'outline', 'sketch', 'digest']) expect(levels.find((level) => level.rung === rung)?.state).toBe('current')
})

it('stores a label for a kind without blocks', async () => {
  const made = await ask('POST', '/api/records', { kind: 'problem', title: 'A sensor intermittently loses its signal', data: { symptom: 'The signal drops.', state: 'open' }, shortForms: { forms: { label: 'Intermittent sensor signal' } } })
  expect(made.status, made.text).toBe(201)
  expect((await reading(made.body.record.id)).find((level) => level.rung === 'label')?.state).toBe('current')
  expect(made.body.shortForms).toBeUndefined()
})

it('rolls back a refused part or cut label and their links', async () => {
  const target = await ask('POST', '/api/records', { kind: 'problem', title: 'A target for the attempted links' })
  expect(target.status, target.text).toBe(201)
  const targetId = target.body.record.id as string
  const before = await ask('GET', `/api/records/${targetId}`)
  for (const [title, shortForms, words] of [
    ['Uncovered specimen report', { forms: { label: 'Missing trial coverage', parts: [parts[0]] } }, 'covered by no part'],
    ['Opening words copied from title', { forms: { label: 'Opening words copied' } }, 'opening of'],
  ] as const) {
    const refused = await ask('POST', '/api/records', { ...report(title), shortForms, links: [{ type: 'about', toId: targetId }] })
    expect(refused.status, refused.text).toBe(400)
    expect(refused.body.error).toContain(words)
    await absent(title)
    const after = await ask('GET', `/api/records/${targetId}`)
    expect(after.body.links).toEqual(before.body.links)
    const check = await ask('POST', '/api/records/check', { ...report(title), shortForms })
    expect(check.status, check.text).toBe(400)
    expect(check.body.error).toContain(words)
  }
})

it('refuses a supplied source revision before storing anything', async () => {
  const title = 'A source supplied too soon'
  const refused = await ask('POST', '/api/records', { ...report(title), shortForms: { ...forms, madeFrom: { seq: 1, contentHash: 'anything' } } })
  expect(refused.status, refused.text).toBe(400)
  expect(refused.body.error).toContain('madeFrom')
  expect(refused.body.error).toContain('Nothing was stored')
  await absent(title)
})

it('checks the same create and rolls all of it back', async () => {
  const title = 'A checked specimen report'
  const checked = await ask('POST', '/api/records/check', report(title))
  expect(checked.status, checked.text).toBe(200)
  expect(checked.body.wouldBeAccepted).toBe(true)
  expect(checked.body.wroteNothing).toBe(true)
  await absent(title)
})

it('files a message with its label even during a held turn', async () => {
  const actor = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-session': runId, 'x-mole-office-key': runKey, 'x-mole-office-workspace': 'default' }
  const turn = await ask('POST', '/api/drafts/turn', { turn: 'started' }, actor)
  expect(turn.status, turn.text).toBe(200)
  const made = await ask('POST', '/api/records', { kind: 'message', title: 'A message concerning the trials', data: { body: 'The trials need more specimens.', to: [{ kind: 'person', id: THE_PERSON }] }, shortForms: { forms: { label: 'Further specimens needed' } } }, actor)
  expect(made.status, made.text).toBe(201)
  expect((await reading(made.body.record.id)).find((level) => level.rung === 'label')?.state).toBe('current')
  expect(made.body.record.data.shortForms.label).toMatchObject({ writtenBy: 'agent', by: agentId })
  const end = await ask('POST', '/api/drafts/turn', { turn: 'ended' }, actor)
  expect(end.status, end.text).toBe(200)
})

it('names the key binding revision on a running session', async () => {
  const made = await ask('POST', '/api/records', { kind: 'session', title: 'A second running test session', data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: agentId, doing: 'writing' }, shortForms: { forms: { label: 'Another active session' } } }, office)
  expect(made.status, made.text).toBe(201)
  expect(typeof made.body.runKey.key).toBe('string')
  const ledger = await revisions(made.body.record.id)
  expect(ledger.map((row) => row.seq)).toEqual([1, 2, 3])
  expect(made.body.record.data.shortForms.label.madeFrom).toEqual({ seq: 2, contentHash: ledger[1]!.contentHash })
  expect(made.body.version).toBe(ledger[2]!.contentHash)
  expect((await reading(made.body.record.id)).find((level) => level.rung === 'label')?.state).toBe('current')
})

it('leaves a repeated send unchanged when the repeat carries a label', async () => {
  const payload = { kind: 'message', title: 'A message sent only once', data: { body: 'This sentence is sent once.', to: [{ kind: 'person', id: THE_PERSON }], sendId: randomBytes(12).toString('hex') } }
  const first = await ask('POST', '/api/records', payload)
  expect(first.status, first.text).toBe(201)
  const again = await ask('POST', '/api/records', { ...payload, shortForms: { forms: { label: 'Repeated send remains unchanged' } } })
  expect(again.status, again.text).toBe(200)
  expect(again.body.alreadySent).toBeDefined()
  expect(again.body.record.id).toBe(first.body.record.id)
  expect(await revisions(first.body.record.id)).toHaveLength(1)
  expect((await ask('GET', `/api/records/${first.body.record.id}`)).body.record.data.shortForms).toBeUndefined()
})

it('still writes forms through the separate door after an ordinary create', async () => {
  const { shortForms: _omitted, ...body } = report('Separate filing of specimen results')
  const made = await ask('POST', '/api/records', body)
  expect(made.status, made.text).toBe(201)
  expect(made.body.shortForms).toBeDefined()
  const ledger = await revisions(made.body.record.id)
  const wrote = await ask('POST', `/api/records/${made.body.record.id}/short-forms`, { ...forms, madeFrom: { seq: ledger[0]!.seq, contentHash: ledger[0]!.contentHash } })
  expect(wrote.status, wrote.text).toBe(200)
  expect((await reading(made.body.record.id)).find((level) => level.rung === 'label')?.state).toBe('current')
})
