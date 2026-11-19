// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO MAY READ WHICH MESSAGE: THE GAPS ROUND 7 LEFT, round 8.
 *
 * tests/who-may-read-which-message.test.ts and tests/who-may-read-which-message-everywhere-else.test.ts
 * hold the rule and the doors round 7 gave it. This file holds the doors round 7 named as left:
 *
 *   1. the transcript tail GET /api/sessions/:id reads from disk;
 *   2. the prompt a check is given, which lists what the checked run's agent wrote;
 *   3. a run's stored honour reading, whose evidence may name a message;
 *   4. the smaller gaps: a long wait on another agent's queue, the wording of a 404, a name two records
 *      share, the sentence saying what a comment was left on, and the write doors of the person's
 *      conversations with agents.
 *
 * Made-up agents: ada writes to bo; dee is in no conversation and is the reader every case refuses; the
 * owner or a party is shown the same thing in each case, so a case cannot pass because nothing is ever
 * shown. hon-boss started hon-hand, for the honour reading. builder-r8 is a worker whose run is checked
 * by inspector-r8. fay and eve are agents with empty queues, for the long wait.
 *
 * MUTATIONS, each proved after a control run and restored: removing the check at any one door turns
 * that door's case red. The commit message names every run and its log.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { aRealFolderNamed, apiApp, freshDb, theProjectHoldsThisFolder, writeDataBypassingTheGate, type TestDb } from './helpers.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'

const HERE = 'default'
const ELSEWHERE = 'gaps-elsewhere'

let t: TestDb
let app: FastifyInstance
let home = ''
let previousHome: string | undefined

const OWNER = { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

function asAgent(handle: string): Record<string, string> {
  return { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}
const DEE = asAgent('dee-bystander')

interface Reply {
  status: number
  body: string
  json: Record<string, unknown>
}

async function ask(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown): Promise<Reply> {
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

async function anAgent(handle: string): Promise<string> {
  const made = await post('/api/records', { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' } }, OWNER)
  expect(made.status, made.body).toBe(201)
  const listed = (await get('/api/participants', OWNER)).json as { agents?: { id: string; handle: string }[] }
  const row = (listed.agents ?? []).find((one) => one.handle === handle)
  if (row === undefined) throw new Error(`the agent ${handle} was registered and is not listed`)
  return row.id
}

function agentRecordOf(registryId: string): string {
  return (t.client.sqlite.prepare('SELECT record_id AS record FROM agent_records WHERE agent_id = ?').get(registryId) as { record: string }).record
}

/** Write one message in process as this writer, and give back its id. */
function say(writer: { type: string; id: string }, title: string, data: Record<string, unknown>, where: string = HERE): string {
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

/** A session record holding this agent's handle, so messages to it are delivered to it alone. */
async function holding(handle: string): Promise<string> {
  const made = await post('/api/records', { kind: 'session', title: `${handle} terminal`, data: { state: 'running', runtime: 'claude-code', doing: 'holding' } }, OWNER)
  expect(made.status, made.body).toBe(201)
  const session = (made.json['record'] as { id: string }).id
  const held = await post(`/api/handles/${handle}/hold`, { session, machine: 'a-machine', runtime: 'claude-code' }, OWNER)
  expect(held.status, held.body).toBe(201)
  return session
}

/** Two answers are the same answer when they differ only in the id each was asked about. */
function sameAnswer(hidden: Reply, hiddenId: string, missing: Reply, missingId: string): void {
  expect(hidden.status, hidden.body).toBe(missing.status)
  expect(hidden.body.split(hiddenId).join('<id>')).toBe(missing.body.split(missingId).join('<id>'))
}

// THE WORDS AND TITLES, each found nowhere else.
const M1_WORDS = 'larchbark-words-for-bo-alone'
const M1_TITLE = 'Heronry ledger for bo'
const ELSEWHERE_TITLE = 'Kittiwake ledger in another project'
const SHARED_TITLE = 'Gannet shelf both records carry'
const BUILDER_TITLE = 'Puffin burrow note the builder sent'
const HON_WORDS = 'The brief was wrong about the order of the made-up clamp and the fixture.'
const QUOTE = 'a made-up quote in the thread'
const MISSING = 'NOPEnothere99'
const TRANSCRIPT_ID = '99999999-8888-0000-0000-000000000001'

let ada = ''
let bo = ''
let m1 = ''
let mElsewhere = ''
let m7 = ''
let sharedIdea = ''
let note = ''
let builderMessage = ''
let builderRun = ''
let honRun = ''
let honMessage = ''
let thread = ''
let threadMessage = ''
let comment = ''
let adaTranscriptRun = ''
let fay = ''
let eve = ''

/**
 * THE FOLDER THE CONVERSATIONS IN THIS FILE RAN IN: a real one, which the test project holds. Discovery files a
 * conversation into the project that holds its working directory (problem kDKj9iXd4Vft), and a project holds only a
 * folder that exists. Its last name is still `up`, as the made-up /made/up it replaces.
 */
const RUN_FOLDER = aRealFolderNamed('up')

beforeAll(async () => {
  // A HOME OF THIS TEST'S OWN, holding one made-up transcript, so the session door reads a file the test
  // wrote and never the machine's own.
  previousHome = process.env['HOME']
  home = mkdtempSync(join(tmpdir(), 'mole-office-gaps-home-'))
  process.env['HOME'] = home
  const projects = join(home, '.claude', 'projects', '-made-up-project')
  mkdirSync(projects, { recursive: true })

  t = await freshDb()
  // THE DEFAULT SET, COPIED AS A NEW OFFICE DOES AT ITS FIRST START: a registration's chapters line is read against the
  // office's own chapter records (wave 13w). Imported after freshDb, which resets the modules.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  await theProjectHoldsThisFolder('default', RUN_FOLDER)
  app = (await apiApp()).app
  await app.ready()

  ada = await anAgent('ada-writer')
  bo = await anAgent('bo-reader')
  await anAgent('dee-bystander')
  fay = await anAgent('fay-quiet')
  eve = await anAgent('eve-quiet')
  await holding('bo-reader')
  await holding('fay-quiet')
  await holding('eve-quiet')

  m1 = say({ type: 'agent', id: 'ada-writer' }, M1_TITLE, { body: M1_WORDS, to: [{ kind: 'agent', id: bo }] })
  onlyTheAddressee(m1, bo)
  // ONE IN ANOTHER PROJECT, whose title the project boundary's refusal would otherwise quote.
  expect((await post('/api/workspaces', { id: ELSEWHERE, title: 'Somewhere else' }, OWNER)).status).toBe(201)
  mElsewhere = say({ type: 'agent', id: 'ada-writer' }, ELSEWHERE_TITLE, { body: 'elsewhere', to: [{ kind: 'agent', id: bo }] }, ELSEWHERE)
  onlyTheAddressee(mElsewhere, bo)
  // A NAME TWO RECORDS CARRY: an idea anybody may read, and a message only bo may.
  sharedIdea = ((await post('/api/records', { kind: 'idea', title: SHARED_TITLE, data: {} }, OWNER)).json['record'] as { id: string }).id
  m7 = say({ type: 'agent', id: 'ada-writer' }, SHARED_TITLE, { body: 'the same name', to: [{ kind: 'agent', id: bo }] })
  onlyTheAddressee(m7, bo)
  note = ((await post('/api/records', { kind: 'idea', title: 'A made-up idea to link from', data: {} }, OWNER)).json['record'] as { id: string }).id

  // A COMMENT dee LEFT ON m1, which dee may read and whose message dee may not.
  const commented = await post('/api/records', {
    kind: 'annotation',
    title: 'On the heronry',
    data: { body: 'a made-up remark', context: { target: { kind: 'record', recordId: m1, workspaceId: HERE } } },
  }, DEE)
  expect(commented.status, commented.body).toBe(201)
  comment = (commented.json['record'] as { id: string }).id

  // A CONVERSATION THE OWNER HAS WITH bo, with one comment still waiting in it.
  const opened = await post('/api/agent/threads', { title: 'Made-up conversation with bo', mode: 'review' }, OWNER)
  expect(opened.status, opened.body).toBe(201)
  thread = (opened.json['thread'] as { id: string }).id
  const inIt = await post(`/api/agent/threads/${thread}/messages`, {
    intent: 'ask',
    body: 'a made-up question for bo',
    context: { target: { kind: 'record', recordId: note, workspaceId: HERE }, span: { quote: QUOTE, from: 0, to: QUOTE.length } },
    recipient: { kind: 'agent', agentId: agentRecordOf(bo) },
  }, OWNER)
  expect(inIt.status, inIt.body).toBe(201)
  threadMessage = (inIt.json['message'] as { id: string }).id

  // THE HONOUR READING: hon-hand, started by hon-boss, tells hon-boss its brief was wrong, and the office
  // stores the reading on hon-hand's run with that message as evidence.
  expect((await post('/api/agents/started', { handle: 'hon-boss', name: 'Made-up boss', role: 'supervisor' }, OWNER)).status).toBe(201)
  expect((await post('/api/agents/started', { handle: 'hon-hand', name: 'Made-up hand', role: 'worker' }, asAgent('hon-boss'))).status).toBe(201)
  const honOpened = await post('/api/records', { kind: 'session', title: 'hon-hand at work', data: { state: 'running', runtime: 'claude-code', servingAgent: 'hon-hand' } }, asAgent('hon-hand'))
  expect(honOpened.status, honOpened.body).toBe(201)
  honRun = (honOpened.json['record'] as { id: string }).id
  const honSaid = await post('/api/records', { kind: 'message', title: 'The brief was wrong', data: { to: [{ kind: 'agent', id: 'hon-boss' }], aboutRun: honRun, body: HON_WORDS } }, asAgent('hon-hand'))
  // NOTHING HOLDS hon-boss IN THE TEST OFFICE, so the office stores hon-hand's message, routes it and answers 409. The
  // message is stored all the same, and the honour reading below names it.
  expect(honSaid.status, honSaid.body).toBe(409)
  honMessage = (honSaid.json['record'] as { id: string }).id
  const stored = await post(`/api/honour-board/runs/${honRun}/read`, {}, OWNER)
  expect(stored.status, stored.body).toBe(201)
  expect(stored.body).toContain(honMessage)

  // A RUN TO CHECK: builder-r8, started by the secretary, sent bo a message; inspector-r8 checks the run.
  expect((await post('/api/agents/started', { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' }, OWNER)).status).toBe(201)
  expect((await post('/api/agents/started', { handle: 'inspector-r8', name: 'Inspector', role: 'inspector' }, OWNER)).status).toBe(201)
  expect((await post('/api/agents/started', { handle: 'builder-r8', name: 'Builder', role: 'worker', chapters: ['5:full'], workArea: ['src/server/lib'] }, asAgent(THE_TEST_OFFICES_SECRETARY.handle))).status).toBe(201)
  builderMessage = say({ type: 'agent', id: 'builder-r8' }, BUILDER_TITLE, { body: 'words for bo', to: [{ kind: 'agent', id: bo }] })
  onlyTheAddressee(builderMessage, bo)
  const tip = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  builderRun = historicalSession(t, { workspaceId: HERE, kind: 'session', title: 'builder-r8 at work', actor: { type: 'agent', id: 'builder-r8' }, data: { state: 'finished', servingAgent: 'builder-r8', cutFrom: 'main', tip, doing: 'building' } }).id

  // A TRANSCRIPT ON DISK holding m1's words, as bo's run was handed them, filed and held by ada's handle.
  writeFileSync(
    join(projects, `${TRANSCRIPT_ID}.jsonl`),
    [
      { type: 'user', message: { role: 'user', content: `You have a message: ${M1_WORDS}` }, timestamp: new Date().toISOString(), cwd: RUN_FOLDER },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'read it' }] }, timestamp: new Date().toISOString(), cwd: RUN_FOLDER },
    ].map((one) => JSON.stringify(one)).join('\n') + '\n',
  )
  const discovered = await post('/api/sessions/discover', {}, OWNER)
  expect(discovered.status, discovered.body).toBe(200)
  const listed = (await get('/api/sessions', OWNER)).json as { sessions: { id: string; recordId: string | null }[] }
  const found = listed.sessions.find((one) => one.id === `claude-code:${TRANSCRIPT_ID}`)
  expect(found?.recordId, JSON.stringify(listed.sessions.map((one) => one.id))).toBeTruthy()
  adaTranscriptRun = found!.recordId!
  // THE RECORD IS RENAMED, so what it stores says nothing of the transcript and only what is read from
  // disk on each request could carry m1's words.
  const renamed = await ask('PATCH', `/api/records/${adaTranscriptRun}`, OWNER, { title: 'ada transcript run', summary: 'a made-up run' })
  expect(renamed.status, renamed.body).toBe(200)
  expect((await post('/api/handles/ada-writer/hold', { session: adaTranscriptRun, machine: 'a-machine', runtime: 'claude-code' }, OWNER)).status).toBe(201)
}, 180_000)

afterAll(async () => {
  rmSync(dirname(RUN_FOLDER), { recursive: true, force: true })
  await app.close()
  t.close()
  if (previousHome === undefined) delete process.env['HOME']
  else process.env['HOME'] = previousHome
  rmSync(home, { recursive: true, force: true })
})

describe('1. the transcript tail', () => {
  const url = `/api/sessions/claude-code:${TRANSCRIPT_ID}`

  it('gives another agent no line of a run\'s transcript, and says why', async () => {
    const dees = await get(url, DEE)
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(M1_WORDS)
    const tail = dees.json['tail'] as { lines: unknown[]; available: boolean; reason: string }
    expect(tail.lines).toEqual([])
    expect(tail.available).toBe(false)
    expect(tail.reason).toContain('only to the agent the run answers as')
  })

  it('gives the run\'s own agent and the owner every line', async () => {
    const adas = await get(url, asAgent('ada-writer'))
    expect((adas.json['tail'] as { lines: unknown[] }).lines.length).toBeGreaterThan(0)
    expect(adas.body).toContain(M1_WORDS)
    expect((await get(url, OWNER)).body).toContain(M1_WORDS)
  })

  it('GET /api/sessions gives another agent none of the words a row read from a transcript', async () => {
    const dees = await get('/api/sessions', DEE)
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(M1_WORDS)
    const row = (dees.json['sessions'] as { id: string; name: string }[]).find((one) => one.id === `claude-code:${TRANSCRIPT_ID}`)
    expect(row?.name).toBe('ada transcript run')
    expect((await get('/api/sessions', asAgent('ada-writer'))).body).toContain(M1_WORDS)
    expect((await get('/api/sessions', OWNER)).body).toContain(M1_WORDS)
  })
})

describe('2. the prompt a check is given', () => {
  it('lists no message the caller may not read among what the run\'s agent wrote', async () => {
    const inspectors = await post(`/api/checks/${builderRun}/prompt`, { changes: [] }, asAgent('inspector-r8'))
    expect(inspectors.status, inspectors.body).toBe(200)
    expect(String(inspectors.json['prompt'])).not.toContain(BUILDER_TITLE)
    const owners = await post(`/api/checks/${builderRun}/prompt`, { changes: [] }, OWNER)
    expect(String(owners.json['prompt'])).toContain(BUILDER_TITLE)
  })

  it('refuses a message the caller may not read as an id that names no run', async () => {
    sameAnswer(await post(`/api/checks/${m1}/prompt`, { changes: [] }, DEE), m1, await post(`/api/checks/${MISSING}/prompt`, { changes: [] }, DEE), MISSING)
    sameAnswer(await get(`/api/checks/${m1}`, DEE), m1, await get(`/api/checks/${MISSING}`, DEE), MISSING)
  })
})

describe('3. a run\'s stored honour reading', () => {
  it('GET /api/records/:id gives no hidden message as evidence, and the version is the stored one', async () => {
    const dees = await get(`/api/records/${honRun}`, DEE)
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(honMessage)
    const owners = await get(`/api/records/${honRun}`, OWNER)
    expect(owners.body).toContain(honMessage)
    expect(dees.json['version']).toBe(owners.json['version'])
    // THE SIGNAL STAYS: only the id is taken out.
    expect(dees.body).toContain('corrected its brief')
  })

  it('GET /api/records lists no hidden message as evidence', async () => {
    expect((await get('/api/records?kind=session&shape=full', DEE)).body).not.toContain(honMessage)
    expect((await get('/api/records?kind=session&shape=full', OWNER)).body).toContain(honMessage)
  })

  it('the revision doors give no hidden message as evidence', async () => {
    const listing = await get(`/api/records/${honRun}/revisions`, DEE)
    expect(listing.status, listing.body).toBe(200)
    expect(listing.body).not.toContain(honMessage)
    expect((await get(`/api/records/${honRun}/revisions`, OWNER)).body).toContain(honMessage)
    const count = listing.json['count'] as number
    const one = await get(`/api/records/${honRun}/revisions/${String(count)}`, DEE)
    expect(one.status, one.body).toBe(200)
    expect(one.body).not.toContain(honMessage)
    expect((await get(`/api/records/${honRun}/revisions/${String(count)}`, OWNER)).body).toContain(honMessage)
    const compared = await get(`/api/records/${honRun}/revisions/1/compare/${String(count)}`, DEE)
    expect(compared.status, compared.body).toBe(200)
    expect(compared.body).not.toContain(honMessage)
    expect((await get(`/api/records/${honRun}/revisions/1/compare/${String(count)}`, OWNER)).body).toContain(honMessage)
  })

  it('the change log gives no hidden message as evidence', async () => {
    expect((await get(`/api/changes?recordId=${honRun}`, DEE)).body).not.toContain(honMessage)
    expect((await get(`/api/changes?recordId=${honRun}`, OWNER)).body).toContain(honMessage)
    expect((await get('/api/changes?limit=1000', DEE)).body).not.toContain(honMessage)
  })

  it('every other door that hands back a run, or searches in one, gives no hidden message as evidence', async () => {
    const bad: string[] = []
    for (const url of [
      `/api/search?q=${encodeURIComponent('hon-hand at work')}`,
      `/api/bundles/preview?scope=${honRun}&preset=continue`,
      `/api/records/${honRun}/around`,
      `/api/records/${honRun}/context`,
      `/api/records/${honRun}/history`,
      `/api/sessions/${honRun}`,
      `/api/sessions/${honRun}/timeline`,
      `/api/records/created-between?from=2000-01-01&to=2100-01-01`,
      `/api/project/bootstrap`,
      `/api/attention`,
      `/api/open-loops?about=${honRun}`,
      `/api/honour-board/runs/${honRun}`,
    ]) {
      const dees = await get(url, DEE)
      expect(dees.status, `${url}: ${dees.body}`).toBeLessThan(300)
      if (dees.body.includes(honMessage)) bad.push(url)
    }
    expect(bad).toEqual([])
    // THE OWNER IS SHOWN IT AT THE TWO DOORS THAT HAND BACK THE WHOLE RECORD.
    expect((await get(`/api/search?q=${encodeURIComponent('hon-hand at work')}`, OWNER)).body).toContain(honMessage)
    expect((await get(`/api/records/${honRun}/around`, OWNER)).body).toContain(honMessage)
    // AND A SEARCH FOR THE ID ITSELF DOES NOT FIND THE RUN THAT GIVES IT AS EVIDENCE.
    expect((await get(`/api/search?q=${honMessage}`, DEE)).body).not.toContain(honRun)
    expect((await get(`/api/search?q=${honMessage}`, OWNER)).body).toContain(honRun)
  })

  it('POST /api/honour-board/runs/:run/read hands back no hidden message as evidence', async () => {
    const dees = await post(`/api/honour-board/runs/${honRun}/read`, {}, DEE)
    expect(dees.status, dees.body).toBe(201)
    expect(dees.body).not.toContain(honMessage)
    expect((await post(`/api/honour-board/runs/${honRun}/read`, {}, asAgent('hon-boss'))).body).toContain(honMessage)
  })
})

describe('4a. a long wait on another agent\'s queue', () => {
  it('does not end when a message the waiter may not read arrives', async () => {
    const waiting = get('/api/handles/fay-quiet/waiting?wait=2', DEE)
    await new Promise((done) => setTimeout(done, 300))
    const sent = say({ type: 'agent', id: 'ada-writer' }, 'A made-up line for fay', { body: 'for fay', to: [{ kind: 'agent', id: fay }] })
    onlyTheAddressee(sent, fay)
    const answered = await waiting
    expect(answered.status, answered.body).toBe(200)
    expect(answered.json['endedBecause']).toBe('the cap passed')
    expect(answered.json['waiting']).toEqual([])
  })

  it('ends for the agent whose queue it is when its message arrives', async () => {
    const waiting = get('/api/handles/eve-quiet/waiting?wait=5', asAgent('eve-quiet'))
    await new Promise((done) => setTimeout(done, 300))
    const sent = say({ type: 'agent', id: 'ada-writer' }, 'A made-up line for eve', { body: 'for eve', to: [{ kind: 'agent', id: eve }] })
    onlyTheAddressee(sent, eve)
    const answered = await waiting
    expect(answered.json['endedBecause']).toBe('a message arrived')
  })
})

describe('4b. one refusal for a hidden message and for an id naming nothing', () => {
  it('the record doors answer a hidden message as they answer an id naming nothing', async () => {
    for (const door of [
      (id: string) => `/api/records/${id}`,
      (id: string) => `/api/records/${id}/revisions`,
      (id: string) => `/api/records/${id}/short-forms`,
      (id: string) => `/api/implementation/record/${id}`,
      (id: string) => `/api/planning/deadline/${id}`,
      (id: string) => `/api/open-loops?about=${id}`,
      (id: string) => `/api/changes?recordId=${id}`,
      (id: string) => `/api/sessions/${id}`,
    ]) {
      sameAnswer(await get(door(m1), DEE), m1, await get(door(MISSING), DEE), MISSING)
    }
  })

  it('a hidden message in another project is answered as an id naming nothing, and its title is not quoted', async () => {
    for (const door of [(id: string) => `/api/records/${id}`, (id: string) => `/api/sessions/${id}`]) {
      const hidden = await get(door(mElsewhere), DEE)
      sameAnswer(hidden, mElsewhere, await get(door(MISSING), DEE), MISSING)
      expect(hidden.body).not.toContain(ELSEWHERE_TITLE)
    }
  })

  it('the link doors answer a hidden message at either end as a record that is not there', async () => {
    sameAnswer(
      await post('/api/links', { fromId: note, toId: m1, type: 'about' }, DEE), m1,
      await post('/api/links', { fromId: note, toId: MISSING, type: 'about' }, DEE), MISSING,
    )
    sameAnswer(
      await post('/api/links', { fromId: m1, toId: note, type: 'about' }, DEE), m1,
      await post('/api/links', { fromId: MISSING, toId: note, type: 'about' }, DEE), MISSING,
    )
    sameAnswer(
      await post(`/api/sessions/${honRun}/link`, { toId: m1, type: 'about' }, DEE), m1,
      await post(`/api/sessions/${honRun}/link`, { toId: MISSING, type: 'about' }, DEE), MISSING,
    )
  })

  it('a conversation the reader is not part of is answered as one that is not there', async () => {
    sameAnswer(await get(`/api/agent/threads/${thread}`, DEE), thread, await get(`/api/agent/threads/${MISSING}`, DEE), MISSING)
  })
})

describe('4c. a name two records share', () => {
  it('a name only a hidden message carries is answered as a name nothing carries', async () => {
    const hidden = await post('/api/links', { fromId: note, toTitle: M1_TITLE, type: 'about' }, DEE)
    const nothing = await post('/api/links', { fromId: note, toTitle: 'Nothing is called this made-up name', type: 'about' }, DEE)
    expect(hidden.status, hidden.body).toBe(404)
    expect(hidden.body.split(M1_TITLE).join('<name>')).toBe(nothing.body.split('Nothing is called this made-up name').join('<name>'))
    expect(hidden.body).not.toContain(m1)
  })

  it('a name a hidden message shares with one record the reader may read means that record', async () => {
    const dees = await post('/api/links', { fromId: note, toTitle: SHARED_TITLE, type: 'relates_to' }, DEE)
    expect(dees.status, dees.body).toBe(201)
    expect(dees.body).toContain(sharedIdea)
    expect(dees.body).not.toContain(m7)
    // AND FOR THE OWNER TOO, THE NAME MEANS THE RECORD: a title names the records of one project, and a message is kept in
    // the message centre and belongs to no project, so it is not one of the two any more. Until
    // that decision the owner, who reads both, was refused and shown both.
    const owners = await post('/api/links', { fromId: note, toTitle: SHARED_TITLE, type: 'about' }, OWNER)
    expect(owners.status, owners.body).toBe(201)
    expect(owners.body).toContain(sharedIdea)
    expect(owners.body).not.toContain(m7)
  })
})

describe('4d. what a comment was left on', () => {
  it('GET /api/annotations/:id does not quote the title of a message the reader may not read', async () => {
    const dees = await get(`/api/annotations/${comment}`, DEE)
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(M1_TITLE)
    expect(dees.body).not.toContain(M1_WORDS)
    expect((await get(`/api/annotations/${comment}`, OWNER)).body).toContain(M1_TITLE)
  })

  it('POST /api/annotations/readings says nothing about such a message either', async () => {
    const dees = await post('/api/annotations/readings', { ids: [comment] }, DEE)
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(M1_TITLE)
    expect((await post('/api/annotations/readings', { ids: [comment] }, OWNER)).body).toContain(M1_TITLE)
  })
})

describe('4e. the write doors of the person\'s conversations with agents', () => {
  it('refuse a conversation the caller is not part of as one that is not there', async () => {
    sameAnswer(
      await ask('PATCH', `/api/agent/threads/${thread}`, DEE, { title: 'renamed by dee' }), thread,
      await ask('PATCH', `/api/agent/threads/${MISSING}`, DEE, { title: 'renamed by dee' }), MISSING,
    )
    sameAnswer(
      await post(`/api/agent/threads/${thread}/messages`, { intent: 'ask', body: 'dee butts in' }, DEE), thread,
      await post(`/api/agent/threads/${MISSING}/messages`, { intent: 'ask', body: 'dee butts in' }, DEE), MISSING,
    )
    sameAnswer(
      await ask('PATCH', `/api/agent/messages/${threadMessage}`, DEE, { body: 'changed by dee' }), threadMessage,
      await ask('PATCH', `/api/agent/messages/${MISSING}`, DEE, { body: 'changed by dee' }), MISSING,
    )
    sameAnswer(
      await ask('DELETE', `/api/agent/messages/${threadMessage}`, DEE), threadMessage,
      await ask('DELETE', `/api/agent/messages/${MISSING}`, DEE), MISSING,
    )
    // NOTHING WAS CHANGED: the owner still reads the comment as it was.
    const owners = await get(`/api/agent/threads/${thread}`, OWNER)
    expect(owners.body).toContain('a made-up question for bo')
    expect(owners.body).not.toContain('dee butts in')
  })

  it('let an agent read and write a conversation it started under its handle', async () => {
    const opened = await post('/api/agent/threads', { title: 'Made-up conversation ada started', mode: 'review' }, asAgent('ada-writer'))
    expect(opened.status, opened.body).toBe(201)
    const own = (opened.json['thread'] as { id: string }).id
    expect((await get(`/api/agent/threads/${own}`, asAgent('ada-writer'))).status).toBe(200)
    const said = await post(`/api/agent/threads/${own}/messages`, { intent: 'ask', body: 'ada asks in its own conversation' }, asAgent('ada-writer'))
    expect(said.status, said.body).toBe(201)
    expect((await get(`/api/agent/threads/${own}`, DEE)).status).toBe(404)
  })

  it('let a party to the conversation write to it', async () => {
    const renamed = await ask('PATCH', `/api/agent/threads/${thread}`, asAgent('bo-reader'), { title: 'Renamed by bo' })
    expect(renamed.status, renamed.body).toBe(200)
  })

  it('GET /api/agent/marks marks only the conversations the caller is part of', async () => {
    expect((await get('/api/agent/marks', DEE)).body).not.toContain(QUOTE)
    expect((await get('/api/agent/marks', OWNER)).body).toContain(QUOTE)
  })
})
