// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The retire rule follows the declared card on the retire door, record PATCH and last-record DELETE.
 * All fixtures are MADE-UP. Card names and displayed words come from GET /api/roles.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, thePersonsKeyHeader, FOR_THE_PERSON, FOR_THE_PERSON_IN_THE_QUERY, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })
type Card = { name: string; rung: number | null; appointedBy: string; whatEndsIt: string; refusedEverythingElse?: true }
type Agent = { id: string; record: string; handle: string }
let cards: Card[]
let worker: Card
let supervisor: Card
let secretary: Card
let inspector: Card
let starter: Agent
let stranger: Agent
let assistant: Agent
let serial = 0
function ask(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown, headers = PERSON) {
  return app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
}
async function register(role: Card, by?: Agent, extra: Record<string, unknown> = {}): Promise<Agent> {
  const handle = `made-up-retire-${++serial}`
  const reply = await ask('POST', '/api/agents/started', { handle, name: `MADE-UP ${handle}`, role: role.name, ...(role.appointedBy === 'the tree' ? { workArea: ['src'] } : {}), ...extra }, by ? asAgent(by.id) : PERSON)
  expect(reply.statusCode, reply.body).toBe(201)
  const held = reply.json()
  return { id: held.agent.id, handle, record: held.record }
}
async function target(card: Card, by = starter): Promise<Agent> {
  const one = await register(worker, by)
  if (card.name !== worker.name) {
    const given = await ask('PATCH', `/api/records/${one.record}`, { dataPatch: { role: card.name, cardChosenBy: { how: 'a-starter', who: { kind: 'person', id: THE_PERSON } } } })
    expect(given.statusCode, given.body).toBe(200)
  }
  return one
}
async function record(one: Agent) {
  const reply = await ask('GET', `/api/records/${one.record}`)
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json().record as { id: string; data: Record<string, unknown>; deletedAt: string | null }
}
async function retired(one: Agent): Promise<boolean> {
  const reply = await ask('GET', `/api/participants/agent/${one.id}`)
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json().participant.retired as boolean
}
async function retire(one: Agent, by?: Agent) {
  return ask('POST', `/api/participants/agent/${one.id}/retire`, { because: 'MADE-UP retirement measurement.', ...(by ? FOR_THE_PERSON : {}) }, by ? asAgent(by.id) : PERSON)
}
async function raise() {
  const reply = await ask('POST', `/api/roles/elevation/${assistant.id}`, { reason: 'MADE-UP retirement measurement.' }, { ...PERSON, ...thePersonsKeyHeader() })
  expect(reply.statusCode, reply.body).toBe(201)
}
async function lower() {
  const reply = await ask('DELETE', `/api/roles/elevation/${assistant.id}`)
  expect(reply.statusCode, reply.body).toBe(200)
}
async function cardRefusal(one: Agent, card: Card, by = starter) {
  const reply = await retire(one, by)
  expect.soft(reply.statusCode, reply.body).toBe(403)
  const said = String(reply.json().error ?? reply.body)
  expect.soft(said).toContain(card.name)
  expect.soft(said).toContain(card.whatEndsIt)
  expect.soft(said).toMatch(/Nothing was written\.$/)
  expect.soft(await retired(one)).toBe(false)
}
async function recordWrite(one: Agent, path: 'dataPatch' | 'data' | 'delete', by?: Agent) {
  if (path === 'delete') return ask('DELETE', `/api/records/${one.record}${by ? `?${FOR_THE_PERSON_IN_THE_QUERY}` : ''}`, undefined, by ? asAgent(by.id) : PERSON)
  const data = path === 'data' ? { ...(await record(one)).data, state: 'retired' } : { state: 'retired' }
  return ask('PATCH', `/api/records/${one.record}`, { [path]: data, ...(by ? FOR_THE_PERSON : {}) }, by ? asAgent(by.id) : PERSON)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const published = await ask('GET', '/api/roles')
  expect(published.statusCode, published.body).toBe(200)
  cards = published.json().cards as Card[]
  const tree = cards.filter(c => c.rung !== null).sort((a, b) => a.rung! - b.rung!)
  worker = tree[0]!
  supervisor = tree[1]!
  secretary = cards.find(c => c.appointedBy === 'the person' && c.rung !== null)!
  inspector = cards.find(c => c.rung === null && c.refusedEverythingElse !== true)!
  expect([worker, supervisor, secretary, inspector].every(Boolean)).toBe(true)
  starter = await register(supervisor)
  stranger = await register(worker)
  assistant = await register(secretary)
})
afterAll(async () => { await app?.close(); t?.close() })

describe('the retire rule follows the card', () => {
  it('1: refuses the starter of an inspector row and quotes the published card', async () => {
    await cardRefusal(await target(inspector), inspector)
  })
  it('2: lets the person retire that inspector row', async () => {
    const one = await target(inspector)
    const reply = await retire(one)
    expect(reply.statusCode, reply.body).toBe(200)
    expect(await retired(one)).toBe(true)
    expect((await record(one)).data.state).toBe('retired')
  })
  it('3: refuses the starter of a secretary row and lets the person retire it', async () => {
    const one = await target(secretary)
    await cardRefusal(one, secretary)
    expect((await retire(one)).statusCode).toBe(200)
    expect(await retired(one)).toBe(true)
  })
  it('4: lets a raised secretary retire both cards and refuses the same starter without its raise', async () => {
    await raise()
    try {
      for (const card of [secretary, inspector]) {
        const one = await target(card, assistant)
        const reply = await retire(one, assistant)
        expect(reply.statusCode, reply.body).toBe(200)
        expect(await retired(one)).toBe(true)
      }
    } finally { await lower() }
    for (const card of [secretary, inspector]) await cardRefusal(await target(card, assistant), card, assistant)
  })
  it('5: keeps the starter’s retirement of worker and supervisor rows', async () => {
    for (const card of [worker, supervisor]) {
      const one = await target(card)
      const reply = await retire(one, starter)
      expect(reply.statusCode, reply.body).toBe(200)
      expect(await retired(one)).toBe(true)
    }
  })
  it('6: quotes changed office words without giving those words a power', async () => {
    const words = 'MADE-UP any starter retires this card.'
    const filed = await ask('POST', '/api/records', { kind: 'role_card_words', title: 'MADE-UP changed retirement words', data: { roleName: inspector.name, whatEndsIt: words } })
    expect(filed.statusCode, filed.body).toBe(201)
    try {
      const published = (await ask('GET', '/api/roles')).json().cards as Card[]
      const shown = published.find(c => c.name === inspector.name)!
      expect(shown.whatEndsIt).toBe(words)
      await cardRefusal(await target(inspector), shown)
    } finally {
      expect((await ask('DELETE', `/api/records/${filed.json().record.id}`)).statusCode).toBe(200)
    }
  })
  it('7: asks the same rule for both PATCH bodies before changing a record or its row', async () => {
    for (const path of ['dataPatch', 'data'] as const) for (const card of [inspector, secretary, worker]) {
      const one = await target(card)
      const before = await record(one)
      const reply = await recordWrite(one, path, stranger)
      expect.soft(reply.statusCode, `${path} ${card.name}: ${reply.body}`).toBe(403)
      expect.soft(await record(one)).toEqual(before)
      expect.soft(await retired(one)).toBe(false)
      const yes = await recordWrite(one, path)
      expect(yes.statusCode, yes.body).toBe(200)
      expect(await retired(one)).toBe(true)
      expect((await record(one)).data.state).toBe('retired')
    }
  })
  it('8: asks the same rule before deleting the last live agent record', async () => {
    const one = await target(inspector)
    const before = await record(one)
    const reply = await recordWrite(one, 'delete', stranger)
    expect.soft(reply.statusCode, reply.body).toBe(403)
    expect.soft(await record(one)).toEqual(before)
    expect.soft(await retired(one)).toBe(false)
    const yes = await recordWrite(one, 'delete')
    expect(yes.statusCode, yes.body).toBe(200)
    expect((await record(one)).deletedAt).not.toBeNull()
    expect(await retired(one)).toBe(true)
  })
  it('9: checks the starter, person and raised or ordinary secretary on both record paths', async () => {
    for (const path of ['dataPatch', 'data', 'delete'] as const) {
      for (const by of [starter, assistant]) {
        const one = await target(inspector, by)
        const before = await record(one)
        const no = await recordWrite(one, path, by)
        expect.soft(no.statusCode, `${path}: ${no.body}`).toBe(403)
        expect.soft(await record(one)).toEqual(before)
        expect.soft(await retired(one)).toBe(false)
      }
      const personal = await target(inspector)
      expect((await recordWrite(personal, path)).statusCode).toBe(200)
      expect(await retired(personal)).toBe(true)
      const one = await target(inspector)
      await raise()
      try {
        const yes = await recordWrite(one, path, assistant)
        expect(yes.statusCode, yes.body).toBe(200)
        expect(await retired(one)).toBe(true)
      } finally { await lower() }
    }
  })
  it('10: keeps the office writers working through a release, a dispatch and the retire door', async () => {
    // Existing coverage for all four writers:
    // mailtool: the-mail-tool-is-installed-by-the-persons-press, case 20: moves the live mail-tool agent…
    // dispatch: a-dispatched-agent-retires-and-needs-a-proved-key: retires a new recipient when its run is finished…
    // door: retiring-an-agent-kills-its-key: names the agent before retirement and stops naming it after, and the decision is refused.
    // release: a-finished-worker-is-retired-on-the-release-of-its-work: is retired, with the reason, when…
    const work = t.api.createRecord({ workspaceId: 'default', kind: 'module', title: 'MADE-UP released work', data: {}, actor: { type: 'human', id: THE_PERSON } }).id
    const one = await register(worker, starter, { startedFor: work })
    const actor = { type: 'agent', id: one.id } as const
    const claimant = { kind: 'agent', id: one.id } as const
    const run = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'MADE-UP work run', data: { state: 'running', runtime: 'claude-code' }, actor }).id
    const claims = await import('../src/server/lib/claims.ts')
    const claim = claims.fileAClaim({ workspaceId: 'default', claimant, run, things: [{ what: 'record', id: work }] }, actor)
    claims.releaseAClaim(claim.claim.id, 'default', claimant, 'MADE-UP checked release.')
    expect((await record(one)).data.state).toBe('retired')
    expect(await retired(one)).toBe(true)

    const proved = { ...PERSON, ...thePersonsKeyHeader() }
    const thread = await ask('POST', '/api/agent/threads', { title: 'MADE-UP dispatched work', mode: 'direct' }, proved)
    expect(thread.statusCode, thread.body).toBe(201)
    const tid = thread.json().thread.id
    expect((await ask('POST', `/api/agent/threads/${tid}/messages`, { intent: 'discuss', body: 'MADE-UP dispatched words.', recipient: { kind: 'new' } }, proved)).statusCode).toBe(201)
    const sent = await ask('POST', `/api/agent/threads/${tid}/dispatch`, undefined, proved)
    expect(sent.statusCode, sent.body).toBe(201)
    const dispatched = sent.json().runs[0].id as string
    const held = t.client.sqlite.prepare('SELECT agent_id FROM agent_runs WHERE id = ?').get(dispatched) as { agent_id: string }
    const ended = await ask('POST', `/api/agent/runs/${dispatched}/result`, { result: { answer: 'MADE-UP completed work.' } }, proved)
    expect(ended.statusCode, ended.body).toBe(200)
    expect((await ask('GET', `/api/records/${held.agent_id}`)).json().record.data.state).toBe('retired')
    const last = await target(worker)
    expect((await retire(last, starter)).statusCode).toBe(200)
    expect((await record(last)).data.state).toBe('retired')
  })
  it('12: refuses deleting the last agent record when another mapped record became a note', async () => {
    const one = await target(inspector)
    const workspace = 'made-up-converted-agent-record'
    const made = await ask('POST', '/api/workspaces', { id: workspace, title: 'MADE-UP converted agent record' })
    expect(made.statusCode, made.body).toBe(201)
    const there = { ...PERSON, 'x-mole-office-workspace': workspace }
    const second = await ask('POST', '/api/records', {
      kind: 'agent', title: 'MADE-UP second inspector record',
      data: { handle: one.handle, role: inspector.name, state: 'active' },
    }, there)
    expect(second.statusCode, second.body).toBe(201)
    const secondId = second.json().record.id as string
    const mapping = t.client.sqlite.prepare('SELECT agent_id FROM agent_records WHERE record_id = ?').get(secondId) as { agent_id: string }
    expect(mapping.agent_id).toBe(one.id)
    const changed = await ask('PATCH', `/api/records/${secondId}`, { kind: 'note' }, there)
    expect(changed.statusCode, changed.body).toBe(200)
    expect(changed.json().record.kind).toBe('note')
    const before = await record(one)
    const refused = await recordWrite(one, 'delete', stranger)
    expect.soft(refused.statusCode, refused.body).toBe(403)
    expect.soft(refused.body).toContain(inspector.name)
    expect.soft(refused.body).toContain(inspector.whatEndsIt)
    const after = await record(one)
    expect.soft(after.deletedAt).toBeNull()
    expect.soft(after).toEqual(before)
    expect.soft(await retired(one)).toBe(false)
  })

})
