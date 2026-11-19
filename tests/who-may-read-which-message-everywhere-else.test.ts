// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO MAY READ WHICH MESSAGE, AT EVERY OTHER DOOR, second pass.
 *
 * tests/who-may-read-which-message.test.ts holds the rule itself and the message and record doors.
 * This file holds the doors that hand back a message's words, its title, its id or a count of messages
 * without being about messages: the change log, the attention and open-loop readings, the copies, what
 * an agent or a run wrote, the person's waiting list, the plan drawing, the file door, the link door,
 * the worker's doors, another agent's queue, the dead letters, the honour board, the conversations the
 * person has with agents, the brief and the bootstrap read, and the refusals that used to quote a title.
 *
 * Made-up agents: ada writes to bo; dee is in no conversation and is the reader every case refuses; the
 * owner or a party is shown the same thing in each case, so a case cannot pass because nothing is ever
 * shown. hon-boss started hon-hand, for the honour board.
 *
 * MUTATIONS, each proved after a control run and restored: removing the check at any one door turns
 * that door's case red. The commit message names every run and its log.
 */

import { aMadeUpModuleForPackage, injectedPackageFixture } from './module-package-fixture.ts'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

const HERE = 'default'
const ELSEWHERE = 'who-reads-elsewhere'

let t: TestDb
let app: FastifyInstance

const OWNER = { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const WORKER = { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker' }

function asAgent(handle: string, workspace: string = HERE): Record<string, string> {
  return { 'x-mole-office-workspace': workspace, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}
const DEE = asAgent('dee-bystander')

const THE_REFUSAL = 'No message you may read has the id'

/** An id that names nothing, asked at the same door as a hidden message to compare the two answers. */
const NOTHING = 'NOPEnothere99'

interface Reply {
  status: number
  body: string
  json: Record<string, unknown>
}

async function ask(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown): Promise<Reply> {
  const reply = await app.inject({
    method,
    url,
    headers: payload === undefined ? headers : { ...headers, 'content-type': 'application/json' },
    ...(payload === undefined ? {} : { payload: payload as never }),
  })
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, body: reply.body, json }
}
const get = (url: string, headers: Record<string, string>): Promise<Reply> => ask('GET', url, headers)
const post = (url: string, payload: unknown, headers: Record<string, string>): Promise<Reply> => ask('POST', url, headers, payload)

/**
 * A DOOR THAT ANSWERS ABOUT EVERY KIND OF RECORD answers a hidden message exactly as it answers an id that
 * names nothing, word for word (round 8): the same status and the same body, but for the id. `asked` makes
 * the request about one id; it is made for the hidden id and for NOTHING. Hands back the hidden answer.
 */
async function answeredAsNothing(asked: (id: string) => Promise<Reply>, id: string): Promise<Reply> {
  const hidden = await asked(id)
  const nothing = await asked(NOTHING)
  expect(hidden.status, hidden.body).toBe(nothing.status)
  expect(hidden.body.split(id).join('<id>')).toBe(nothing.body.split(NOTHING).join('<id>'))
  return hidden
}

/** Register one agent as the owner and give back its registry id. */
async function anAgent(handle: string): Promise<string> {
  const made = await post('/api/records', { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' } }, OWNER)
  expect(made.status, made.body).toBe(201)
  return registryIdOf(handle)
}

async function registryIdOf(handle: string): Promise<string> {
  const listed = (await get('/api/participants', OWNER)).json as { agents?: { id: string; handle: string }[] }
  const row = (listed.agents ?? []).find((one) => one.handle === handle)
  if (row === undefined) throw new Error(`the agent ${handle} was registered and is not listed`)
  return row.id
}

function agentRecordOf(registryId: string): string {
  return (t.client.sqlite.prepare('SELECT record_id AS record FROM agent_records WHERE agent_id = ?').get(registryId) as { record: string }).record
}

/** Write one message in process as this writer, and give back its id. */
function say(writer: { type: string; id: string; sessionId?: string }, title: string, data: Record<string, unknown>, where: string = HERE): string {
  return t.api.createRecord({ kind: 'message', title, workspaceId: where, data, actor: writer as never }).id
}

/** Take away the copies the office routed to somebody up the chain, so only the addressee is a party. */
function onlyTheAddressee(messageId: string, addressee: string): void {
  t.client.sqlite.prepare('DELETE FROM message_delivery WHERE message_id = ? AND recipient_id != ?').run(messageId, addressee)
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(messageId) as { data: string }
  const data = JSON.parse(row.data) as Record<string, unknown>
  delete data['routed']
  writeDataBypassingTheGate(t, messageId, data)
}

// THE WORDS AND TITLES, each found nowhere else.
const M1_WORDS = 'quillfeather-words-for-bo-alone'
const M1_TITLE = 'Tidewater ledger for bo'
const M4_TITLE = 'Saltpan note that was deleted'
const TO_OWNER_TITLE = 'Driftwood line for the owner'
const OWNERS_WORDS = 'kelpbed-words-the-owner-gave-bo'
const DEAD_TITLE = 'Cormorant letter nobody takes'
const HON_WORDS = 'The brief was wrong about the order of the fixture and the clamp.'
const PICTURE_ALT = 'a made-up picture for bo'

let ada = ''
let bo = ''
let hand = ''
let adaSession = ''
let boSession = ''
let m1 = ''
let m3 = ''
let m4 = ''
let toOwner = ''
let dead = ''
let honMessage = ''
let honRun = ''
let note = ''
let task = ''
let goal = ''
let run = ''
/** A run for m1 whose wait for the next message is over, and one a restart cut off. */
let waitedRun = ''
let cutRun = ''
let picturePath = ''
let thread = ''
let m6 = ''
const M6_TITLE = 'Brackwater last words for bo'

// A PNG of one pixel, so the picture door stores a real picture.
const ONE_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
let previousRoots: string | undefined

beforeAll(async () => {
  t = await freshDb()
  // THE DATABASE'S OWN FOLDER IS A PREVIEW ROOT, because that is where a picture sent in a message is
  // stored, as tests/a-picture-is-sent-in-a-message.test.ts names it; the checkout stays one.
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = `${CHECKOUT}:${dirname(t.file)}`
  const built = await apiApp()
  app = built.app
  await app.ready()
  expect((await post('/api/workspaces', { id: ELSEWHERE, title: 'Somewhere else' }, OWNER)).status).toBe(201)

  ada = await anAgent('ada-writer')
  bo = await anAgent('bo-reader')
  await anAgent('dee-bystander')
  await anAgent('cy-nobody-answers')
  const cy = await registryIdOf('cy-nobody-answers')

  // bo'S HANDLE HELD BY A SESSION, so bo can be reached and no message to it is routed elsewhere.
  const boTerminal = await post('/api/records', { kind: 'session', title: 'bo terminal', data: { state: 'running', runtime: 'claude-code', doing: 'holding' } }, OWNER)
  boSession = (boTerminal.json['record'] as { id: string }).id
  expect((await post('/api/handles/bo-reader/hold', { session: boSession, machine: 'a-machine', runtime: 'claude-code' }, OWNER)).status).toBe(201)
  // ada'S OWN RUN, so what ada writes is filed under a session a reader can ask about.
  const adaTerminal = await post('/api/records', { kind: 'session', title: 'ada terminal', data: { state: 'running', runtime: 'claude-code', doing: 'writing' } }, OWNER)
  adaSession = (adaTerminal.json['record'] as { id: string }).id

  m1 = say({ type: 'agent', id: 'ada-writer', sessionId: adaSession }, M1_TITLE, { body: M1_WORDS, to: [{ kind: 'agent', id: bo }] })
  onlyTheAddressee(m1, bo)
  m3 = say({ type: 'agent', id: 'ada-writer' }, 'Tidewater ledger elsewhere', { body: M1_WORDS, to: [{ kind: 'agent', id: bo }] }, ELSEWHERE)
  onlyTheAddressee(m3, bo)
  toOwner = say({ type: 'agent', id: 'ada-writer' }, TO_OWNER_TITLE, { body: 'a line from ada to the owner', to: [{ kind: 'person', id: THE_PERSON }] })
  say({ type: 'human', id: THE_PERSON }, 'From the owner to bo', { body: OWNERS_WORDS, to: [{ kind: 'agent', id: bo }] })

  // A NOTE ABOUT m1, A TASK ABOUT m1, AND A GOAL ABOUT m1.
  note = (await post('/api/records', { kind: 'idea', title: 'A made-up idea to point at', data: {} }, OWNER)).json['record'] as never
  note = (note as unknown as { id: string }).id
  expect((await post('/api/links', { fromId: note, toId: m1, type: 'about' }, OWNER)).status).toBe(201)
  task = ((await post('/api/records', { kind: 'task', title: 'Fit the made-up wrist camera', data: {} }, OWNER)).json['record'] as { id: string }).id
  expect((await post('/api/links', { fromId: task, toId: m1, type: 'about' }, OWNER)).status).toBe(201)
  goal = ((await post('/api/records', { kind: 'goal', title: 'A made-up goal', data: {} }, OWNER)).json['record'] as { id: string }).id
  expect((await post('/api/links', { fromId: m1, toId: goal, type: 'about' }, OWNER)).status).toBe(201)

  // A DELETED MESSAGE THE NOTE CONSUMES, for the unmet dependencies.
  m4 = say({ type: 'agent', id: 'ada-writer' }, M4_TITLE, { body: 'soon gone', to: [{ kind: 'agent', id: bo }] })
  onlyTheAddressee(m4, bo)
  const consumes = await post('/api/links', { fromId: note, toId: m4, type: 'consumes' }, OWNER)
  expect(consumes.status, consumes.body).toBe(201)
  // ITS WRITER DELETES IT, because only the writer may delete a message.
  expect((await ask('DELETE', `/api/records/${m4}`, asAgent('ada-writer'))).status).toBe(200)

  // A LETTER TO AN AGENT NOTHING ANSWERS AS, with no copy routed on, so it is a dead letter.
  dead = say({ type: 'agent', id: 'ada-writer' }, DEAD_TITLE, { body: 'nobody takes this', to: [{ kind: 'agent', id: cy }] })
  onlyTheAddressee(dead, cy)

  // A PICTURE SENT TO bo.
  const stored = await post('/api/messages/pictures', { bytes: ONE_PIXEL_PNG }, asAgent('ada-writer'))
  expect(stored.status, stored.body).toBe(201)
  picturePath = (stored.json['picture'] as { path: string }).path
  const withPicture = say({ type: 'agent', id: 'ada-writer' }, 'A picture for bo', {
    body: 'see the picture',
    to: [{ kind: 'agent', id: bo }],
    pictures: [{ id: 'p-1', type: 'image', path: picturePath, alt: PICTURE_ALT }],
  })
  onlyTheAddressee(withPicture, bo)

  // A RUN THE OFFICE STARTED FOR m1, serving bo, with a live process row.
  run = t.api.createRecord({
    workspaceId: HERE,
    kind: 'session',
    title: 'bo answering m1',
    data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, deliveringMessage: m1, servingAgent: 'bo-reader', servingAgentId: bo },
    actor: { type: 'human', id: THE_PERSON } as never,
  }).id
  const row = await post('/api/resources', { sessionRecordId: run, type: 'process', key: String(process.pid), detail: 'this test process', startedByTheProduct: true, adopting: 'this test process started before the session the test filed for it' }, OWNER)
  expect(row.status, row.body).toBe(201)
  // A RUN WHOSE WAIT IS OVER AND ONE A RESTART CUT OFF, each really in that state, so the doors about
  // them reach the point where they would write, and the message check is what refuses.
  waitedRun = t.api.createRecord({
    workspaceId: HERE,
    kind: 'session',
    title: 'bo waited after m1',
    data: {
      state: 'running', runtime: 'claude-code', startedByMoleOffice: true, deliveringMessage: m1, servingAgent: 'bo-reader', servingAgentId: bo,
      providerSession: 'made-up-provider-1', waitsUntil: localStamp(new Date(Date.now() - 60_000)),
    },
    actor: { type: 'human', id: THE_PERSON } as never,
  }).id
  cutRun = t.api.createRecord({
    workspaceId: HERE,
    kind: 'session',
    title: 'bo cut off answering m1',
    data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, deliveringMessage: m1, servingAgent: 'bo-reader', servingAgentId: bo },
    actor: { type: 'human', id: THE_PERSON } as never,
  }).id
  t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run('2000-01-01 00:00:00', cutRun)

  // THE HONOUR BOARD: hon-hand, started by hon-boss, tells hon-boss its brief was wrong.
  const boss = await post('/api/agents/started', { handle: 'hon-boss', name: 'Made-up boss', role: 'supervisor' }, OWNER)
  expect(boss.status, boss.body).toBe(201)
  const handMade = await post('/api/agents/started', { handle: 'hon-hand', name: 'Made-up hand', role: 'worker' }, asAgent('hon-boss'))
  expect(handMade.status, handMade.body).toBe(201)
  hand = (handMade.json['agent'] as { id: string }).id
  const honOpened = await post('/api/records', { kind: 'session', title: 'hon-hand at work', data: { state: 'running', runtime: 'claude-code', servingAgent: 'hon-hand' } }, asAgent('hon-hand'))
  expect(honOpened.status, honOpened.body).toBe(201)
  honRun = (honOpened.json['record'] as { id: string }).id
  const honSaid = await post('/api/records', { kind: 'message', title: 'The brief was wrong', data: { to: [{ kind: 'agent', id: 'hon-boss' }], aboutRun: honRun, body: HON_WORDS } }, asAgent('hon-hand'))
  // NOTHING HOLDS hon-boss IN THE TEST OFFICE, so the office stores hon-hand's message, routes it and answers 409. The
  // message is stored all the same, and the honour board reads it.
  expect(honSaid.status, honSaid.body).toBe(409)
  honMessage = (honSaid.json['record'] as { id: string }).id

  // A CONVERSATION THE OWNER HAS WITH bo.
  const opened = await post('/api/agent/threads', { title: 'Made-up conversation with bo', mode: 'direct' }, OWNER)
  expect(opened.status, opened.body).toBe(201)
  thread = (opened.json['thread'] as { id: string }).id
  const inIt = await post(`/api/agent/threads/${thread}/messages`, { intent: 'ask', body: 'a made-up question for bo', recipient: { kind: 'agent', agentId: agentRecordOf(bo) } }, OWNER)
  expect(inIt.status, inIt.body).toBeLessThan(300)

  // ada READS m1 UNDER ITS OWN RUN, so the run's timeline holds a call aimed at m1.
  expect((await get(`/api/records/${m1}`, { ...asAgent('ada-writer'), 'x-mole-office-session': adaSession })).status).toBe(200)

  // THE TASK PACKAGED FOR AN OUTSIDE CHAT.
  const packaged = await post(`/api/delegation/${task}/package`, { moduleIds: [await aMadeUpModuleForPackage(injectedPackageFixture(app, HERE))], forTheOutside: 'A made-up package.', suits: 'own_module', acceptance: 'It works.', acceptanceSource: { file: 'a-made-up-file.md', criterion: 'made up', commit: '0000000' } }, OWNER)
  expect(packaged.status, packaged.body).toBe(201)

  // THE LAST THING WRITTEN IS A MESSAGE TO bo, so it is the newest change and heads the recent changes.
  m6 = say({ type: 'agent', id: 'ada-writer' }, M6_TITLE, { body: 'the last words', to: [{ kind: 'agent', id: bo }] })
  onlyTheAddressee(m6, bo)
}, 180_000)

afterAll(async () => {
  await app.close()
  t.close()
  if (previousRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = previousRoots
})

describe('the change log', () => {
  it('GET /api/changes names no hidden message and counts only what the reader may see', async () => {
    const dees = await get('/api/changes?limit=1000', DEE)
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(m1)
    expect(dees.body).not.toContain(M1_TITLE)
    expect(dees.json['matched']).toBe((dees.json['changes'] as unknown[]).length)
    expect((await get('/api/changes?limit=1000', OWNER)).body).toContain(m1)
    // ASKED FOR BY ID, IT IS A RECORD WITH NO CHANGE ROWS, as an id naming nothing is.
    const byId = await answeredAsNothing((id) => get(`/api/changes?recordId=${id}`, DEE), m1)
    expect(byId.json['changes']).toEqual([])
  })

  it('GET /api/anchor counts no row naming a hidden message', async () => {
    const dees = await get('/api/anchor', DEE)
    const owners = await get('/api/anchor', OWNER)
    expect(dees.status, dees.body).toBe(200)
    const count = (reply: Reply): number => (reply.json['counts'] as { everything: number }).everything
    expect(count(dees)).toBe((await get('/api/changes?limit=1000', DEE)).json['matched'])
    expect(count(owners)).toBeGreaterThan(count(dees))
  })
})

describe('the readings of the project', () => {
  it('GET /api/attention holds no hidden message', async () => {
    const dees = await get('/api/attention?shape=full', DEE)
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(m1)
    const owners = await get('/api/attention?shape=full', OWNER)
    expect(owners.body).toContain(m1)
    // AND NO LINK OR CHANGE ROW NAMING ONE IS IN WHAT THE RULE WAS WORKED OUT FROM.
    const read = (reply: Reply): { links: number; changes: number } => reply.json['read'] as { links: number; changes: number }
    expect(read(owners).links).toBeGreaterThan(read(dees).links)
    expect(read(owners).changes).toBeGreaterThan(read(dees).changes)
  })

  it('GET /api/open-loops refuses a hidden message to stand at, and does not count it', async () => {
    const at = await answeredAsNothing((id) => get(`/api/open-loops?about=${id}`, DEE), m1)
    expect(at.status, at.body).toBe(404)
    const outside = (reply: Reply): number => (reply.json['counts'] as { outsideThePopulation: number }).outsideThePopulation
    const dees = await get('/api/open-loops', DEE)
    const owners = await get('/api/open-loops', OWNER)
    expect(outside(owners)).toBeGreaterThan(outside(dees))
  })

  it('GET /api/queries/unmet never shows a hidden message as the missing title', async () => {
    const dees = await get('/api/queries/unmet', DEE)
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(M4_TITLE)
    expect((await get('/api/queries/unmet', OWNER)).body).toContain(M4_TITLE)
  })

  it('GET /api/project/bootstrap counts no hidden message', async () => {
    const messages = (reply: Reply): number => ((reply.json['project'] as { byKind: Record<string, number> }).byKind['message'] ?? 0)
    const dees = await get('/api/project/bootstrap', DEE)
    expect(dees.status, dees.body).toBe(200)
    const owners = await get('/api/project/bootstrap', OWNER)
    expect(messages(owners)).toBeGreaterThan(messages(dees))
    const newest = (reply: Reply): string | null =>
      ((reply.json['project'] as { newestChange: { recordId: string } | null }).newestChange ?? { recordId: null }).recordId
    expect(newest(owners)).toBe(m6)
    expect(newest(dees)).not.toBe(m6)
  })

  it('GET /api/plan-graph draws and counts no hidden message beside a goal', async () => {
    const week = '2026-W39'
    const dees = await get(`/api/plan-graph/week/${week}`, DEE)
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain('message record')
    expect((await get(`/api/plan-graph/week/${week}`, OWNER)).body).toContain('message record')
  })
})

describe('the copies', () => {
  it('GET /api/bundles/preview refuses a hidden message as the subject and names none linked to it', async () => {
    // ONE PART THAT IS NOT THE OPEN LOOPS, so the refusal met is the copy's own and not the loops' reading.
    const subject = await answeredAsNothing((id) => get(`/api/bundles/preview?scope=${id}&preset=custom&slots=importantContext`, DEE), m1)
    expect(subject.status, subject.body).toBe(404)
    const around = await get(`/api/bundles/preview?scope=${note}&preset=continue`, DEE)
    expect(around.status, around.body).toBe(200)
    expect(around.body).not.toContain(M1_TITLE)
    expect((await get(`/api/bundles/preview?scope=${note}&preset=continue`, OWNER)).body).toContain(M1_TITLE)
    // AND NONE IN THE RECENT CHANGES OF THE WHOLE PROJECT.
    const recent = '/api/bundles/preview?preset=custom&slots=recentChanges'
    const deesRecent = await get(recent, DEE)
    expect(deesRecent.status, deesRecent.body).toBe(200)
    expect(deesRecent.body).not.toContain(M6_TITLE)
    expect((await get(recent, OWNER)).body).toContain(M6_TITLE)
  })

  it('GET /api/delegation/as-text names no hidden message linked to the task', async () => {
    const url = `/api/delegation/as-text?workspace=${HERE}&task=${task}`
    const dees = await get(url, DEE)
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(M1_TITLE)
    expect((await get(url, OWNER)).body).toContain(M1_TITLE)
  })

  it('GET /api/brief carries the owner’s words to bo for bo and not for another agent', async () => {
    const dees = await get('/api/brief', DEE)
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(OWNERS_WORDS)
    expect((await get('/api/brief', asAgent('bo-reader'))).body).toContain(OWNERS_WORDS)
  })
})

describe('what an agent or a run wrote', () => {
  it('GET /api/handles/:handle/knows lists no hidden message among what ada wrote', async () => {
    const dees = await get('/api/handles/ada-writer/knows', DEE)
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(M1_TITLE)
    expect((await get('/api/handles/ada-writer/knows', OWNER)).body).toContain(M1_TITLE)
  })

  it('GET /api/participants/agent/:id/profile lists no hidden message as filed lately', async () => {
    const url = `/api/participants/agent/${ada}/profile`
    const dees = await get(url, DEE)
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(M1_TITLE)
    expect((await get(url, OWNER)).body).toContain(M1_TITLE)
  })

  it('GET /api/sessions/:id shows no hidden message among what the run wrote', async () => {
    const dees = await get(`/api/sessions/${adaSession}`, DEE)
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(M1_TITLE)
    expect((await get(`/api/sessions/${adaSession}`, OWNER)).body).toContain(M1_TITLE)
  })

  it('GET /api/sessions/:id/timeline shows no change row naming a hidden message', async () => {
    const dees = await get(`/api/sessions/${adaSession}/timeline`, DEE)
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(m1)
    expect((await get(`/api/sessions/${adaSession}/timeline`, OWNER)).body).toContain(m1)
    // AND NO CALL AIMED AT ONE: ada's read of m1 is on the owner's timeline and not on dee's.
    const calls = (reply: Reply): number => JSON.stringify(reply.json['entries'] ?? []).split(m1).length - 1
    const owners = await get(`/api/sessions/${adaSession}/timeline`, OWNER)
    expect(calls(owners)).toBeGreaterThan(0)
    expect(calls(dees)).toBe(0)
  })

  it('GET /api/checks/:run lists no hidden message among what the run’s agent wrote', async () => {
    const dees = await get(`/api/checks/${honRun}`, DEE)
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(honMessage)
    expect((await get(`/api/checks/${honRun}`, OWNER)).body).toContain(honMessage)
  })

  it('GET /api/honour-board/runs/:run gives no hidden message as evidence', async () => {
    const dees = await get(`/api/honour-board/runs/${honRun}`, DEE)
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(honMessage)
    expect((await get(`/api/honour-board/runs/${honRun}`, asAgent('hon-boss'))).body).toContain(honMessage)
    void hand
  })
})

describe('the person’s lists and the conversations with agents', () => {
  it('GET /api/waiting shows the person’s unread messages only to a reader who may read them', async () => {
    const dees = await get('/api/waiting', DEE)
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(toOwner)
    expect((await get('/api/waiting', OWNER)).body).toContain(toOwner)
  })

  it('GET /api/agent/inbox refuses another agent’s inbox', async () => {
    const dees = await get('/api/agent/inbox?handle=bo-reader', DEE)
    expect(dees.status, dees.body).toBe(403)
    expect(dees.body).toContain('An agent reads only its own inbox')
    expect((await get('/api/agent/inbox?handle=bo-reader', asAgent('bo-reader'))).status).toBe(200)
  })

  it('GET /api/agent/threads lists only the conversations the reader is part of', async () => {
    const dees = await get('/api/agent/threads', DEE)
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(thread)
    expect((await get('/api/agent/threads', asAgent('bo-reader'))).body).toContain(thread)
  })

  it('GET /api/agent/threads/:id refuses a conversation the reader is not part of', async () => {
    const dees = await answeredAsNothing((id) => get(`/api/agent/threads/${id}`, DEE), thread)
    expect(dees.status, dees.body).toBe(404)
    expect((await get(`/api/agent/threads/${thread}`, asAgent('bo-reader'))).status).toBe(200)
    // THE AGENT WORKER RUNS THE PERSON'S CONVERSATIONS, and reads each one it runs.
    expect((await get(`/api/agent/threads/${thread}`, asAgent('mole-office-agent-worker'))).status).toBe(200)
  })
})

describe('the doors that take a record id', () => {
  it('GET /api/planning/deadline/:id refuses a hidden message', async () => {
    const dees = await answeredAsNothing((id) => get(`/api/planning/deadline/${id}`, DEE), m1)
    expect(dees.status, dees.body).toBe(404)
    // NAMED AS WORK BESIDE IT, IT IS COUNTED AMONG THE IDS NOTHING ANSWERS TO.
    const work = await answeredAsNothing((id) => get(`/api/planning/deadline/${note}?work=${id}`, DEE), m1)
    expect(work.body).not.toContain(M1_TITLE)
  })

  it('GET /api/implementation/record/:id refuses a hidden message', async () => {
    const dees = await answeredAsNothing((id) => get(`/api/implementation/record/${id}`, DEE), m1)
    expect(dees.status, dees.body).toBe(404)
  })

  it('a door reading a record by id refuses a hidden message in another project without quoting its title', async () => {
    const dees = await answeredAsNothing((id) => get(`/api/records/${id}`, DEE), m3)
    expect(dees.status, dees.body).toBe(404)
    expect(dees.body).not.toContain('Tidewater ledger elsewhere')
  })

  it('a write to a hidden message is refused before anything is written', async () => {
    const patched = await answeredAsNothing((id) => ask('PATCH', `/api/records/${id}`, DEE, { title: 'renamed by a stranger' }), m1)
    expect(patched.status, patched.body).toBe(404)
    expect((await get(`/api/records/${m1}`, OWNER)).body).toContain(M1_TITLE)
  })

  it('a refusal about the wrong kind of record does not quote a message’s title', async () => {
    const wrong = await post(`/api/agents/${m1}/wakes`, { because: 'a made-up wake', policy: 'owner-press' }, OWNER)
    expect(wrong.status, wrong.body).toBeGreaterThanOrEqual(400)
    expect(wrong.body).toContain('is a message')
    expect(wrong.body).not.toContain(M1_TITLE)
  })

  it('POST /api/links refuses a hidden message at either end, by id or by name, and writes nothing', async () => {
    const byId = await answeredAsNothing((id) => post('/api/links', { fromId: note, toId: id, type: 'relates_to' }, DEE), m1)
    expect(byId.status, byId.body).toBe(404)
    // BY NAME, A NAME ONLY A HIDDEN MESSAGE CARRIES IS A NAME NOTHING CARRIES.
    const byName = await answeredAsNothing((title) => post('/api/links', { fromId: note, toTitle: title, type: 'relates_to' }, DEE), M1_TITLE)
    expect(byName.status, byName.body).toBe(404)
    expect(byName.body).not.toContain(m1)
    // THE NARROWEST WORD THE LINK DOOR ACCEPTS, and one that keeps a `relates_to` link from the note.
    const links = await get('/api/links?type=relates_to', OWNER)
    expect(links.status, links.body).toBe(200)
    expect(links.body).not.toContain('relates_to')
  })

  it('GET /api/file does not serve a picture sent in a hidden message', async () => {
    const url = `/api/file?path=${encodeURIComponent(picturePath)}`
    const dees = await get(url, DEE)
    expect(dees.status, dees.body).toBeGreaterThanOrEqual(400)
    expect((await get(url, asAgent('bo-reader'))).status).toBe(200)
  })
})

describe('the worker’s doors and the queues', () => {
  it('GET /api/worker/queue lists no hidden message', async () => {
    const dees = await get('/api/worker/queue', DEE)
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(m1)
    expect((await get('/api/worker/queue', WORKER)).body).toContain(m1)
  })

  it('GET /api/worker/runs lists no run for a hidden message', async () => {
    const dees = await get('/api/worker/runs', DEE)
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(run)
    expect((await get('/api/worker/runs', WORKER)).body).toContain(run)
  })

  it('POST /api/worker/waits/:session/over and /api/worker/runs/:session/cut-off refuse a hidden message first', async () => {
    for (const url of [`/api/worker/waits/${waitedRun}/over`, `/api/worker/runs/${cutRun}/cut-off`]) {
      const said = await post(url, {}, DEE)
      expect(said.status, `${url}: ${said.body}`).toBe(404)
      expect(said.body, url).toContain(THE_REFUSAL)
      // AND NOTHING WAS WRITTEN: the run's record is as it was.
      const id = url.includes('/over') ? waitedRun : cutRun
      expect((t.api.getRecord(id)?.data as Record<string, unknown>)['state'], url).toBe('running')
    }
  })

  it('GET /api/handles/:handle/waiting shows another agent none of that queue', async () => {
    const dees = await get('/api/handles/bo-reader/waiting', DEE)
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(m1)
    expect((await get('/api/handles/bo-reader/waiting', asAgent('bo-reader'))).body).toContain(m1)
  })

  it('GET /api/dead-letters lists no hidden letter', async () => {
    const dees = await get('/api/dead-letters', DEE)
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(dead)
    expect((await get('/api/dead-letters', OWNER)).body).toContain(dead)
  })
})
