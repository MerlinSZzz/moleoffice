// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO MAY READ WHICH MESSAGE: THE LAST GAPS ROUND 8 NAMED, round 9.
 *
 * Rounds 7 and 8 gave the rule to the record doors (tests/who-may-read-which-message*.test.ts). Round 8's
 * report named five places still open, and this file holds them:
 *
 *   1. a run found on disk was filed with its opening request as its title and summary;
 *   2. POST /api/records with links, by id or by title;
 *   3. GET /api/source?module=, whose refusal quoted the title of a record that is not a module;
 *   4. the lists of records already called this, on a create, a rename and a plan line filed as work;
 *   5. GET /api/links.
 *
 * Wave 13j round 10 added a sixth (problem 1NuVfHbwlmIW):
 *
 *   6. the blocked-by report on a write's reply, which named whatever record a `blocked_by` title matched.
 *
 * Made-up agents: ada writes to bo; dee is in no conversation and is the reader every case refuses. The
 * owner or bo is shown the same thing in each case, so a case cannot pass because nothing is ever shown.
 *
 * MUTATIONS, each proved after a control run and restored: removing the check at any one place turns
 * that place's case red. The commit message names every run and its log.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { aRealFolderNamed, apiApp, freshDb, theProjectHoldsThisFolder, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

const HERE = 'default'

let t: TestDb
let app: FastifyInstance
let home = ''
let projects = ''
let previousHome: string | undefined

const OWNER = { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

function asAgent(handle: string): Record<string, string> {
  return { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}
const DEE = asAgent('dee-bystander')
const BO = asAgent('bo-reader')

interface Reply {
  status: number
  body: string
  json: Record<string, unknown>
}

async function ask(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown): Promise<Reply> {
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

/** Write one message in process as this writer, and give back its id. */
function say(writer: { type: string; id: string }, title: string, data: Record<string, unknown>): string {
  return t.api.createRecord({ kind: 'message', title, workspaceId: HERE, data, actor: writer as never }).id
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
async function holding(handle: string): Promise<void> {
  const made = await post('/api/records', { kind: 'session', title: `${handle} terminal`, data: { state: 'running', runtime: 'claude-code', doing: 'holding' } }, OWNER)
  expect(made.status, made.body).toBe(201)
  const session = (made.json['record'] as { id: string }).id
  const held = await post(`/api/handles/${handle}/hold`, { session, machine: 'a-machine', runtime: 'claude-code' }, OWNER)
  expect(held.status, held.body).toBe(201)
}

/** Two answers are the same answer when they differ only in the id or name each was asked about. */
function sameAnswer(hidden: Reply, hiddenAsked: string, missing: Reply, missingAsked: string): void {
  expect(hidden.status, hidden.body).toBe(missing.status)
  expect(hidden.body.split(hiddenAsked).join('<asked>')).toBe(missing.body.split(missingAsked).join('<asked>'))
}

/** One made-up Claude Code transcript under this test's own home. */
function aTranscript(id: string, lines: Record<string, unknown>[]): void {
  writeFileSync(join(projects, `${id}.jsonl`), lines.map((one) => JSON.stringify(one)).join('\n') + '\n')
}

// THE WORDS AND TITLES, each found nowhere else.
const M1_WORDS = 'sedgewren-words-for-bo-alone'
const M1_TITLE = 'Shearwater tally for bo'
const SHARED_TITLE = 'Plover shelf both records carry'
const MISSING = 'NOPEnothere98'
const AI_TITLE = 'Oystercatcher summary a model wrote'
const PLAIN_RUN = '77777777-6666-0000-0000-000000000001'
const NAMED_RUN = '77777777-6666-0000-0000-000000000002'
const GIVEN_NAME = 'the-given-name-of-a-run'

let bo = ''
let m1 = ''
let m7 = ''
let sharedIdea = ''
let note = ''
let noteToM1 = ''

/**
 * THE FOLDER THE CONVERSATIONS IN THIS FILE RAN IN: a real one, which the test project holds. Discovery files a
 * conversation into the project that holds its working directory (problem kDKj9iXd4Vft), and a project holds only a
 * folder that exists. Its last name is still `up`, as the made-up /made/up it replaces.
 */
const RUN_FOLDER = aRealFolderNamed('up')

beforeAll(async () => {
  // A HOME OF THIS TEST'S OWN, so discovery reads the transcripts this test wrote and never the machine's.
  previousHome = process.env['HOME']
  home = mkdtempSync(join(tmpdir(), 'mole-office-last-gaps-home-'))
  process.env['HOME'] = home
  projects = join(home, '.claude', 'projects', '-made-up-project')
  mkdirSync(projects, { recursive: true })

  t = await freshDb()
  await theProjectHoldsThisFolder('default', RUN_FOLDER)
  app = (await apiApp()).app
  await app.ready()

  await anAgent('ada-writer')
  bo = await anAgent('bo-reader')
  await anAgent('dee-bystander')
  await holding('bo-reader')

  m1 = say({ type: 'agent', id: 'ada-writer' }, M1_TITLE, { body: M1_WORDS, to: [{ kind: 'agent', id: bo }] })
  onlyTheAddressee(m1, bo)
  // A NAME TWO RECORDS CARRY: an idea anybody may read, and a message only bo may.
  sharedIdea = ((await post('/api/records', { kind: 'idea', title: SHARED_TITLE, data: {} }, OWNER)).json['record'] as { id: string }).id
  m7 = say({ type: 'agent', id: 'ada-writer' }, SHARED_TITLE, { body: 'the same name', to: [{ kind: 'agent', id: bo }] })
  onlyTheAddressee(m7, bo)
  note = ((await post('/api/records', { kind: 'idea', title: 'A made-up idea linked to the tally', data: {} }, OWNER)).json['record'] as { id: string }).id
  const linked = await post('/api/links', { fromId: note, toId: m1, type: 'relates_to' }, OWNER)
  expect(linked.status, linked.body).toBe(201)
  noteToM1 = typeof linked.json['id'] === 'string' ? linked.json['id'] : ''
  expect(noteToM1, linked.body).not.toBe('')

  // TWO RUNS ON DISK, each handed m1's words as its opening request. The first carries a title a model
  // wrote from them; the second a name it was given.
  const at = new Date().toISOString()
  aTranscript(PLAIN_RUN, [
    { type: 'user', message: { role: 'user', content: `You have a message: ${M1_WORDS}` }, timestamp: at, cwd: RUN_FOLDER },
    { type: 'ai-title', aiTitle: AI_TITLE, sessionId: PLAIN_RUN },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'read it' }] }, timestamp: at, cwd: RUN_FOLDER },
  ])
  aTranscript(NAMED_RUN, [
    { type: 'user', message: { role: 'user', content: `You have a message: ${M1_WORDS}` }, timestamp: at, cwd: RUN_FOLDER },
    { type: 'agent-name', agentName: GIVEN_NAME, sessionId: NAMED_RUN },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'read it' }] }, timestamp: at, cwd: RUN_FOLDER },
  ])
  const discovered = await post('/api/sessions/discover', {}, OWNER)
  expect(discovered.status, discovered.body).toBe(200)
}, 180_000)

afterAll(async () => {
  rmSync(dirname(RUN_FOLDER), { recursive: true, force: true })
  await app.close()
  t.close()
  if (previousHome === undefined) delete process.env['HOME']
  else process.env['HOME'] = previousHome
  rmSync(home, { recursive: true, force: true })
})

/** The record discovery filed for one transcript, as the owner reads it. */
async function theRecordFiledFor(externalId: string): Promise<{ id: string; title: string; summary: string | null }> {
  const listed = (await get('/api/sessions', OWNER)).json as { sessions: { id: string; recordId: string | null }[] }
  const found = listed.sessions.find((one) => one.id === `claude-code:${externalId}`)
  if (found?.recordId == null) throw new Error(`no record was filed for ${externalId}: ${JSON.stringify(listed.sessions.map((one) => one.id))}`)
  const read = await get(`/api/records/${found.recordId}`, OWNER)
  expect(read.status, read.body).toBe(200)
  return read.json['record'] as { id: string; title: string; summary: string | null }
}

describe('1. a run found on disk', () => {
  it('is filed under its tool and id, with no summary, when it was given no name', async () => {
    const record = await theRecordFiledFor(PLAIN_RUN)
    expect(record.title).toBe(`claude-code ${PLAIN_RUN.slice(0, 8)}`)
    expect(record.summary).toBeNull()
    const dees = await get(`/api/records/${record.id}`, DEE)
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(M1_WORDS)
    expect(dees.body).not.toContain(AI_TITLE)
  })

  it('is filed under the name it was given, and nothing of its opening request', async () => {
    const record = await theRecordFiledFor(NAMED_RUN)
    expect(record.title).toBe(GIVEN_NAME)
    expect(record.summary).toBeNull()
    expect((await get(`/api/records/${record.id}`, DEE)).body).not.toContain(M1_WORDS)
  })

  it('reads the given name from the transcript only for those who may read the transcript', async () => {
    type Row = { id: string; givenName?: string | null }
    const row = async (headers: Record<string, string>): Promise<Row | undefined> =>
      ((await get('/api/sessions', headers)).json as { sessions: Row[] }).sessions.find((one) => one.id === `claude-code:${NAMED_RUN}`)
    expect((await row(OWNER))?.givenName).toBe(GIVEN_NAME)
    expect((await row(DEE))?.givenName ?? null).toBeNull()
  })

  it('still shows the owner its opening request, read from the transcript', async () => {
    const listed = (await get('/api/sessions', OWNER)).json as { sessions: { id: string; purpose: string | null }[] }
    expect(listed.sessions.find((one) => one.id === `claude-code:${PLAIN_RUN}`)?.purpose).toContain(M1_WORDS)
  })
})

describe('2. POST /api/records with links', () => {
  it('answers a hidden message named by id as an id that names no record', async () => {
    const hidden = await post('/api/records', { kind: 'idea', title: 'Linked by id to the tally', data: {}, links: [{ toId: m1 }] }, DEE)
    const missing = await post('/api/records', { kind: 'idea', title: 'Linked by id to the tally', data: {}, links: [{ toId: MISSING }] }, DEE)
    expect(hidden.status, hidden.body).toBe(404)
    sameAnswer(hidden, m1, missing, MISSING)
    expect(hidden.body).not.toContain(M1_TITLE)
  })

  it('answers a name only a hidden message carries as a name nothing carries', async () => {
    const hidden = await post('/api/records', { kind: 'idea', title: 'Linked by name to the tally', data: {}, links: [{ toTitle: M1_TITLE }] }, DEE)
    const nothing = await post('/api/records', { kind: 'idea', title: 'Linked by name to the tally', data: {}, links: [{ toTitle: 'Nothing carries this made-up name' }] }, DEE)
    expect(hidden.status, hidden.body).toBe(404)
    sameAnswer(hidden, M1_TITLE, nothing, 'Nothing carries this made-up name')
    expect(hidden.body).not.toContain(m1)
  })

  it('takes a name a hidden message shares with one readable record to mean that record', async () => {
    const made = await post('/api/records', { kind: 'idea', title: 'Linked by the shared name', data: {}, links: [{ toTitle: SHARED_TITLE }] }, DEE)
    expect(made.status, made.body).toBe(201)
    expect((made.json['links'] as { to: { id: string } }[])[0]?.to.id).toBe(sharedIdea)
    expect(made.body).not.toContain(m7)
  })

  it('lets a party to the message link to it by id', async () => {
    const made = await post('/api/records', { kind: 'idea', title: 'bo links to its own message', data: {}, links: [{ toId: m1 }] }, BO)
    expect(made.status, made.body).toBe(201)
  })
})

describe('3. GET /api/source?module=', () => {
  // THE CASE'S REINDEX READS THE WHOLE REPOSITORY: about five seconds alone and longer under a whole suite's load, so the case has its own minute.
  it('answers a hidden message as an id that names nothing, and does not quote its title', async () => {
    const built = await post('/api/source/reindex', {}, OWNER)
    expect(built.status, built.body).toBeLessThan(300)
    const hidden = await get(`/api/source?module=${m1}`, DEE)
    const missing = await get(`/api/source?module=${MISSING}`, DEE)
    expect(hidden.status, hidden.body).toBe(404)
    sameAnswer(hidden, m1, missing, MISSING)
    expect(hidden.body).not.toContain(M1_TITLE)
    // THE OWNER IS ANSWERED AS FOR AN ID THIS PROJECT DOES NOT HOLD: a message belongs to no project since a decision,
    // so it is not one of this project's records to be told it is not a module. Until then the
    // owner was told so.
    const owners = await get(`/api/source?module=${m1}`, OWNER)
    expect(owners.status, owners.body).toBe(404)
  }, 60_000)
})

describe('4. the lists of records already called this', () => {
  it('a create lists no hidden message as already called this', async () => {
    const dees = await post('/api/records', { kind: 'idea', title: SHARED_TITLE, data: {} }, DEE)
    expect(dees.status, dees.body).toBe(201)
    expect((dees.json['sameTitle'] as { id: string }[]).map((one) => one.id)).toContain(sharedIdea)
    expect(dees.body).not.toContain(m7)
    // SINCE A DECISION, A MESSAGE BELONGS TO NO PROJECT: a project's titles and ids name its own records only, so
    // the owner is not shown the message here either. Until then they were.
    const bos = await post('/api/records', { kind: 'idea', title: SHARED_TITLE, data: {} }, BO)
    expect((bos.json['sameTitle'] as { id: string }[]).map((one) => one.id)).not.toContain(m7)
  })

  it('a create lists no hidden message among the similar titles', async () => {
    const close = `${M1_TITLE} again`
    const dees = await post('/api/records', { kind: 'idea', title: close, data: {} }, DEE)
    expect(dees.status, dees.body).toBe(201)
    expect(dees.body).not.toContain(m1)
    expect(dees.body).not.toContain(M1_TITLE + '"')
    // SINCE A DECISION, A MESSAGE BELONGS TO NO PROJECT: a project's titles and ids name its own records only, so
    // the owner is not shown the message here either. Until then they were.
    const owners = await post('/api/records', { kind: 'idea', title: close, data: {} }, OWNER)
    expect(((owners.json['similar'] ?? []) as { id: string }[]).map((one) => one.id)).not.toContain(m1)
  })

  it('a rename lists no hidden message as already called this', async () => {
    const made = await post('/api/records', { kind: 'idea', title: 'dee will rename this', data: {} }, DEE)
    const id = (made.json['record'] as { id: string }).id
    const renamed = await ask('PATCH', `/api/records/${id}`, DEE, { title: SHARED_TITLE })
    expect(renamed.status, renamed.body).toBe(200)
    expect((renamed.json['sameTitle'] as { id: string }[]).map((one) => one.id)).toContain(sharedIdea)
    expect(renamed.body).not.toContain(m7)
    // SINCE A DECISION, A MESSAGE BELONGS TO NO PROJECT: a project's titles and ids name its own records only, so
    // the owner is not shown the message here either. Until then they were.
    const back = await ask('PATCH', `/api/records/${id}`, OWNER, { title: SHARED_TITLE })
    expect((back.json['sameTitle'] as { id: string }[]).map((one) => one.id)).not.toContain(m7)
  })

  it('a plan line filed as work lists no hidden message as already called this', async () => {
    // A SUPERVISOR, because filing a plan line is not a worker's to do, and one who is no party to m7.
    expect((await post('/api/agents/started', { handle: 'sue-planner', name: 'Made-up planner', role: 'supervisor' }, OWNER)).status).toBe(201)
    const plan = await post('/api/plans', { title: 'A made-up plan', body: `- ${SHARED_TITLE}\n- ${SHARED_TITLE}` }, OWNER)
    expect(plan.status, plan.body).toBe(201)
    const planId = (plan.json['plan'] as { id: string }).id
    const [first, second] = plan.json['lines'] as { id: string }[]
    const sues = await post(`/api/plans/${planId}/lines/${first!.id}/file-as-work`, { kind: 'task', workspaceId: HERE }, asAgent('sue-planner'))
    expect(sues.status, sues.body).toBe(201)
    expect(sues.body).toContain(sharedIdea)
    expect(sues.body).not.toContain(m7)
    // SINCE A DECISION, A MESSAGE BELONGS TO NO PROJECT: a project's titles and ids name its own records only, so
    // the owner is not shown the message here either. Until then they were.
    const owners = await post(`/api/plans/${planId}/lines/${second!.id}/file-as-work`, { kind: 'task', workspaceId: HERE }, OWNER)
    expect(owners.status, owners.body).toBe(201)
    expect(owners.body).not.toContain(m7)
  })
})

describe('5. GET /api/links', () => {
  it('leaves out every link with a hidden message at either end', async () => {
    const dees = await get('/api/links', DEE)
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(m1)
    expect(dees.body).not.toContain(noteToM1)
    const bos = (await get('/api/links', BO)).json as { links: { id: string }[] }
    expect(bos.links.map((one) => one.id)).toContain(noteToM1)
    const owners = (await get('/api/links', OWNER)).json as { links: { id: string }[] }
    expect(owners.links.map((one) => one.id)).toContain(noteToM1)
  })
})

describe('6. the blocked-by report on a write reply', () => {
  type Named = { id: string }
  type Report = { blocker: Named | null; candidates?: Named[] }
  const blockedBy = (reply: Reply): Report | undefined => reply.json['blockedBy'] as Report | undefined
  const waitingOn = (title: string, headers: Record<string, string>): Promise<Reply> =>
    post('/api/records', { kind: 'obligation', title: 'A made-up obligation waiting on a name', data: { blocked_by: title } }, headers)

  it('names no hidden message, and answers as for a name no record carries', async () => {
    const hidden = await waitingOn(M1_TITLE, DEE)
    const nothing = await waitingOn('Nothing carries this made-up name', DEE)
    expect(hidden.status, hidden.body).toBe(201)
    expect(hidden.body).not.toContain(m1)
    expect(blockedBy(hidden)).toBeUndefined()
    expect(blockedBy(nothing)).toBeUndefined()
  })

  it('names no message to the owner either, because a message is in no project', async () => {
    // SINCE A DECISION, A MESSAGE BELONGS TO NO PROJECT: a project's titles and ids name its own records only, so
    // the owner is not shown the message here either. Until then they were.
    const owners = await waitingOn(M1_TITLE, OWNER)
    expect(owners.status, owners.body).toBe(201)
    expect(blockedBy(owners)).toBeUndefined()
  })

  it('takes a name a hidden message shares with one readable record to mean that record', async () => {
    // A NAME ONLY THESE TWO CARRY, since the cases above file more records under SHARED_TITLE.
    const both = 'Turnstone ledger one idea and one message carry'
    const idea = ((await post('/api/records', { kind: 'idea', title: both, data: {} }, OWNER)).json['record'] as { id: string }).id
    const message = say({ type: 'agent', id: 'ada-writer' }, both, { body: 'the same name again', to: [{ kind: 'agent', id: bo }] })
    onlyTheAddressee(message, bo)
    const dees = await waitingOn(both, DEE)
    expect(dees.status, dees.body).toBe(201)
    expect(blockedBy(dees)?.blocker?.id).toBe(idea)
    expect(dees.body).not.toContain(message)
    // SINCE A DECISION, A MESSAGE BELONGS TO NO PROJECT: a project's titles and ids name its own records only, so
    // the owner is not shown the message here either. Until then they were.
    const owners = await waitingOn(both, OWNER)
    expect(blockedBy(owners)?.blocker?.id).toBe(idea)
  })
})
