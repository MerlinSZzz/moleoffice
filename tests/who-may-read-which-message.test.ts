// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO MAY READ WHICH MESSAGE, option A.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * The live push already went only to a message's parties. The read doors did
 * not: any agent could read any message in any project through GET /api/messages, GET /api/records
 * and their kin. The decision says an agent reads only the messages it is a party to (it sent them,
 * they were addressed to it, or it was in the group they went to when they were sent); a secretary
 * reads every message; the owner reads every message.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE HOLDS
 * ---------------------------------------------------------------------------------------
 *
 * Made-up agents in a made-up project: ada writes, bo is written to, dee is in no conversation, cy
 * and mo are in a group from the start, lu joins it later, sam holds the secretary card. fern is a
 * person who is not the owner.
 *
 *   1. ONE CASE PER KIND OF READER, on GET /api/messages/:id: the sender, the addressee, an agent that
 *      is no party, a group member by delivery and by membership, a member who joined after, a
 *      secretary, the owner, the message worker, and a person who is not the owner.
 *   2. ONE CASE PER DOOR the rule was put on: dee (no party) is refused or left out, and the owner or a
 *      party is shown the same message, so a case cannot pass because nothing is ever shown.
 *
 * MUTATIONS, each proved after a control run and restored: removing the owner, secretary or worker
 * branch of `theMessageReader`, the sender, delivery or membership part of `thePartiesOfMany`, or
 * the check at any one door, turns that case red. The commit message names every run and its log.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { THE_SECRETARY } from '../src/shared/roles.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HERE = 'default'
const ELSEWHERE = 'who-reads-elsewhere'

let t: TestDb
let app: FastifyInstance

const OWNER = { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const WORKER = { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker' }
const FERN = { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': 'fern-visitor' }

function asAgent(handle: string, workspace: string = HERE): Record<string, string> {
  return { 'x-mole-office-workspace': workspace, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}

const THE_REFUSAL = 'No message you may read has the id'

/** An id that names nothing, asked at the same door as a hidden message to compare the two answers. */
const NOTHING = 'NOPEnothere99'

/**
 * A DOOR THAT ANSWERS ABOUT EVERY KIND OF RECORD answers a hidden message exactly as it answers an id that
 * names nothing, word for word (round 8): the same status and the same body, but for the id. Asked at the
 * door `url` builds, for the hidden id and for NOTHING. Hands back the answer about the hidden id.
 */
async function answeredAsNothing(url: (id: string) => string, id: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  const hidden = await get(url(id), headers)
  const nothing = await get(url(NOTHING), headers)
  expect(hidden.status, hidden.body).toBe(404)
  expect(hidden.body.split(id).join('<id>')).toBe(nothing.body.split(NOTHING).join('<id>'))
  return hidden
}

async function get(url: string, headers: Record<string, string>): Promise<{ status: number; body: string; json: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'GET', url, headers })
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, body: reply.body, json }
}

async function post(url: string, payload: unknown, headers: Record<string, string>): Promise<{ status: number; body: string; json: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url, headers: { ...headers, 'content-type': 'application/json' }, payload: payload as never })
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, body: reply.body, json }
}

/** Register one agent as the owner and give back its registry id. */
async function anAgent(handle: string, role: string | null = null): Promise<string> {
  const made = await post(
    '/api/records',
    { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code', ...(role === null ? {} : { role }) } },
    OWNER,
  )
  expect(made.status, made.body).toBe(201)
  const listed = (await get('/api/participants', OWNER)).json as { agents?: { id: string; handle: string }[] }
  const row = (listed.agents ?? []).find((one) => one.handle === handle)
  if (row === undefined) throw new Error(`the agent ${handle} was registered and is not listed`)
  return row.id
}

/** Write one message in process as this writer, and give back its id. */
function say(writer: { type: string; id: string }, title: string, data: Record<string, unknown>, where: string = HERE): string {
  return t.api.createRecord({ kind: 'message', title, workspaceId: where, data, actor: writer as never }).id
}

// THE WORDS EACH MESSAGE CARRIES, each one found nowhere else, so a reply that holds them holds the message.
const M1_WORDS = 'quillfeather-the-first-private-line'
const M1_TITLE = 'Tidewater ledger for bo'
const M1_LABEL = 'Kelpwrack tally'
const G1_WORDS = 'marrowbone-said-before-lu-joined'
const G2_WORDS = 'saltmarsh-said-after-lu-joined'
const C1_WORDS = 'lanternfish-comment-for-bo'

let ada = ''
let bo = ''
let dee = ''
let cy = ''
let mo = ''
let lu = ''
let group = ''
let m1 = ''
let m3 = ''
let g1 = ''
let g2 = ''
let c1 = ''
let fromTheOwner = ''
let notice = ''
let note = ''
let boSession = ''

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  const made = await post('/api/workspaces', { id: ELSEWHERE, title: 'Somewhere else' }, OWNER)
  expect(made.status, made.body).toBe(201)

  ada = await anAgent('ada-writer')
  bo = await anAgent('bo-reader')
  dee = await anAgent('dee-bystander')
  cy = await anAgent('cy-member')
  mo = await anAgent('mo-member')
  lu = await anAgent('lu-late')
  await anAgent('sam-secretary', THE_SECRETARY)

  // A PERSON WHO IS NOT THE OWNER, written the way tests/a-new-message-reaches-only-its-parties.test.ts writes one.
  const picture = t.client.sqlite.prepare('SELECT id FROM assets LIMIT 1').get() as { id: string }
  t.client.sqlite
    .prepare(
      'INSERT INTO people (id, name, handle, avatar_asset_id, state, state_at, created_at) ' +
        "VALUES ('fern-visitor', 'Fern Visitor', 'fern-visitor', ?, NULL, NULL, '2026-09-27 09:00:00')",
    )
    .run(picture.id)

  // bo'S HANDLE HELD BY A SESSION, before anything is written to it, so bo can be reached and no message to
  // it is routed to the owner as well: the owner is then no party to m1. The hand-over door uses it too.
  const session = await post('/api/records', { kind: 'session', title: 'bo terminal', data: { state: 'running', runtime: 'claude-code', doing: 'holding' } }, OWNER)
  expect(session.status, session.body).toBe(201)
  boSession = (session.json['record'] as { id: string }).id
  const held = await post('/api/handles/bo-reader/hold', { session: boSession, machine: 'a-machine', runtime: 'claude-code' }, OWNER)
  expect(held.status, held.body).toBe(201)

  // ONE PRIVATE MESSAGE BETWEEN TWO AGENTS, and one more like it in another project for search's counts.
  m1 = say({ type: 'agent', id: 'ada-writer' }, M1_TITLE, { body: M1_WORDS, to: [{ kind: 'agent', id: bo }] })
  // NOTHING ANSWERS AS bo IN THIS TEST WORLD, so the office also gave the owner a copy of m1, which makes the owner a
  // party. The owner's case is about a message the owner is NO party to, the
  // state an answering bo leaves, so that one copy is taken out. m1 keeps its addressee and its words.
  t.client.sqlite.prepare("DELETE FROM message_delivery WHERE message_id = ? AND recipient_kind = 'person'").run(m1)
  m3 = say({ type: 'agent', id: 'ada-writer' }, 'Elsewhere for bo', { body: M1_WORDS, to: [{ kind: 'agent', id: bo }] }, ELSEWHERE)

  // A GROUP OF ada, cy AND mo. g1 @s cy alone, so mo is a party by membership and not by delivery.
  const opened = await post(
    '/api/groups',
    {
      name: 'The tide table',
      because: 'A made-up group for this test.',
      members: [
        { who: { kind: 'agent', id: ada }, because: 'writes' },
        { who: { kind: 'agent', id: cy }, because: 'reads' },
        { who: { kind: 'agent', id: mo }, because: 'reads' },
      ],
    },
    OWNER,
  )
  expect(opened.status, opened.body).toBe(201)
  group = (opened.json['group'] as { id: string }).id
  g1 = say({ type: 'agent', id: 'ada-writer' }, 'Before lu', { body: `@cy-member ${G1_WORDS}`, toGroup: group })
  // g1 WAS SENT BEFORE lu JOINED: its moment and the first members' joining are put in the past, so the
  // second-long stamps cannot make lu's joining and g1 fall in the same second.
  t.client.sqlite.prepare("UPDATE records SET created_at = '2026-01-02 10:00:00' WHERE id = ?").run(g1)
  t.client.sqlite.prepare("UPDATE group_members SET joined_at = '2026-01-01 10:00:00' WHERE group_id = ?").run(group)
  const joined = await post(`/api/groups/${group}/members`, { who: { kind: 'agent', id: lu }, because: 'joins late' }, OWNER)
  expect(joined.status, joined.body).toBe(200)
  g2 = say({ type: 'agent', id: 'ada-writer' }, 'After lu', { body: G2_WORDS, toGroup: group })

  // A RECORD TO HANG A COMMENT AND A LINK ON.
  const filed = await post('/api/records', { kind: 'idea', title: 'A made-up idea to point at', data: {} }, OWNER)
  expect(filed.status, filed.body).toBe(201)
  note = (filed.json['record'] as { id: string }).id
  const linked = await post('/api/links', { fromId: note, toId: m1, type: 'about' }, OWNER)
  expect(linked.status, linked.body).toBe(201)
  c1 = say({ type: 'agent', id: 'ada-writer' }, 'A comment for bo', {
    body: C1_WORDS,
    to: [{ kind: 'agent', id: bo }],
    target: { target: { kind: 'record', recordId: note, workspaceId: HERE }, place: { at: 'surface' } },
  })

  // A NOTICE ABOUT A MESSAGE FROM THE OWNER TO bo, addressed to the owner alone. It is drawn in bo's
  // conversation with the owner (criterion M128), and bo is not a party to it.
  fromTheOwner = say({ type: 'human', id: THE_PERSON }, 'From the owner', { body: 'a line from the owner to bo', to: [{ kind: 'agent', id: bo }] })
  const groups = await import('../src/server/lib/groups.ts')
  notice = groups.writeASystemLineToOne(
    { kind: 'person', id: THE_PERSON },
    HERE,
    { line: 'a made-up notice about the owner’s line', said: null, notice: 'aCounterFired' },
    { type: 'human', id: THE_PERSON } as never,
    { message: fromTheOwner },
  ).id

}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('one case per kind of reader, on GET /api/messages/:id', () => {
  it('the sender reads its own message', async () => {
    const read = await get(`/api/messages/${m1}`, asAgent('ada-writer'))
    expect(read.status, read.body).toBe(200)
    expect(read.body).toContain(M1_WORDS)
  })

  it('the addressee reads a message addressed to it', async () => {
    const read = await get(`/api/messages/${m1}`, asAgent('bo-reader'))
    expect(read.status, read.body).toBe(200)
    expect(read.body).toContain(M1_WORDS)
  })

  it('an agent that is no party is refused, with the same words as for a message that is not there', async () => {
    const read = await get(`/api/messages/${m1}`, asAgent('dee-bystander'))
    expect(read.status, read.body).toBe(404)
    expect(read.body).toContain(THE_REFUSAL)
    expect(read.body).not.toContain(M1_WORDS)
    expect(read.body).not.toContain(M1_TITLE)
    const missing = await get('/api/messages/nothing-here1', asAgent('dee-bystander'))
    expect(missing.status, missing.body).toBe(404)
    expect((missing.json['error'] as string).replace('nothing-here1', m1)).toBe(read.json['error'])
  })

  it('a group member reads a group message by delivery, and by membership when it was not @d', async () => {
    const byDelivery = await get(`/api/messages/${g1}`, asAgent('cy-member'))
    expect(byDelivery.status, byDelivery.body).toBe(200)
    const byMembership = await get(`/api/messages/${g1}`, asAgent('mo-member'))
    expect(byMembership.status, byMembership.body).toBe(200)
    expect(byMembership.body).toContain(G1_WORDS)
  })

  it('a member who joined later reads what was sent after it joined and not what was sent before', async () => {
    const before = await get(`/api/messages/${g1}`, asAgent('lu-late'))
    expect(before.status, before.body).toBe(404)
    expect(before.body).not.toContain(G1_WORDS)
    const after = await get(`/api/messages/${g2}`, asAgent('lu-late'))
    expect(after.status, after.body).toBe(200)
  })

  it('a secretary reads every message', async () => {
    const read = await get(`/api/messages/${m1}`, asAgent('sam-secretary'))
    expect(read.status, read.body).toBe(200)
    expect(read.body).toContain(M1_WORDS)
  })

  it('the owner reads every message', async () => {
    const read = await get(`/api/messages/${m1}`, OWNER)
    expect(read.status, read.body).toBe(200)
    expect(read.body).toContain(M1_WORDS)
  })

  it('the message worker reads every message', async () => {
    const read = await get(`/api/messages/${m1}`, WORKER)
    expect(read.status, read.body).toBe(200)
    expect(read.body).toContain(M1_WORDS)
  })

  it('a person who is not the owner reads only what it is a party to', async () => {
    const read = await get(`/api/messages/${m1}`, FERN)
    expect(read.status, read.body).toBe(404)
    expect(read.body).toContain(THE_REFUSAL)
  })
})

describe('the message doors', () => {
  it('GET /api/messages leaves the message out, and counts only what the reader may see', async () => {
    const seen = await get('/api/messages?limit=100&full=1', asAgent('dee-bystander'))
    expect(seen.status, seen.body).toBe(200)
    expect(seen.body).not.toContain(M1_WORDS)
    expect(seen.json['total']).toBe((seen.json['messages'] as unknown[]).length)
    const owner = await get('/api/messages?limit=100&full=1', OWNER)
    expect(owner.body).toContain(M1_WORDS)
  })

  it('GET /api/messages/conversation leaves out a notice addressed to the other side', async () => {
    const bos = await get(`/api/messages/conversation?kind=person&id=${THE_PERSON}`, asAgent('bo-reader'))
    expect(bos.status, bos.body).toBe(200)
    const ids = (bos.json['messages'] as { id: string }[]).map((one) => one.id)
    expect(ids).toContain(fromTheOwner)
    expect(ids).not.toContain(notice)
    const owners = await get(`/api/messages/conversation?kind=agent&id=${bo}`, OWNER)
    expect((owners.json['messages'] as { id: string }[]).map((one) => one.id)).toContain(notice)
  })

  it('GET /api/messages/contacts never makes such a notice a row’s last line', async () => {
    const contacts = await get('/api/messages/contacts', asAgent('bo-reader'))
    expect(contacts.status, contacts.body).toBe(200)
    const row = (contacts.json['contacts'] as { who: { kind: string; id: string } | null; last: { id: string } | null }[]).find(
      (one) => one.who?.kind === 'person' && one.who.id === THE_PERSON,
    )
    expect(row?.last?.id).toBe(fromTheOwner)
  })

  it('GET /api/messages/comments leaves out a comment the reader is no party to', async () => {
    const dees = await get('/api/messages/comments', asAgent('dee-bystander'))
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(C1_WORDS)
    const bos = await get('/api/messages/comments', asAgent('bo-reader'))
    expect(bos.body).toContain(C1_WORDS)
  })

  it('GET /api/messages/groups shows a late member only what came after it joined', async () => {
    const gained = await get('/api/messages/groups', asAgent('lu-late'))
    expect(gained.status, gained.body).toBe(200)
    expect(gained.body).toContain(G2_WORDS)
    expect(gained.body).not.toContain(G1_WORDS)
  })

  it('GET /api/groups/:id shows a late member only what came after it joined', async () => {
    const lus = await get(`/api/groups/${group}`, asAgent('lu-late'))
    expect(lus.status, lus.body).toBe(200)
    const ids = (lus.json['messages'] as { id: string }[]).map((one) => one.id)
    expect(ids).toContain(g2)
    expect(ids).not.toContain(g1)
    const mos = await get(`/api/groups/${group}`, asAgent('mo-member'))
    expect((mos.json['messages'] as { id: string }[]).map((one) => one.id)).toContain(g1)
  })

  it('POST /api/handles/:handle/took refuses a caller who may not read the message, and writes nothing', async () => {
    const took = await post('/api/handles/bo-reader/took', { session: boSession, message: m1 }, asAgent('dee-bystander'))
    expect(took.status, took.body).toBe(404)
    expect(took.body).toContain(THE_REFUSAL)
    expect(took.body).not.toContain(M1_WORDS)
    const read = await get(`/api/messages/${m1}`, OWNER)
    const mark = (read.json['message'] as { deliveries: { to: { id: string }; mark: string }[] }).deliveries.find((one) => one.to.id === bo)?.mark
    expect(mark).toBe('queued')
  })

  it('the worker doors refuse a caller who may not read the message, before anything is written', async () => {
    const to = { kind: 'agent', id: bo }
    const asked: [string, unknown][] = [
      [`/api/worker/messages/${m1}/taken`, { to, session: boSession, runtime: 'claude-code', because: 'a made-up take' }],
      [`/api/worker/messages/${notice}/needs-no-run`, { to: { kind: 'person', id: THE_PERSON } }],
      [`/api/worker/messages/${m1}/held`, { to, because: 'a made-up hold' }],
      [`/api/worker/messages/${m1}/answered`, { to, agent: to, fromRun: boSession, body: 'a made-up answer', because: 'a made-up answer' }],
    ]
    for (const [url, body] of asked) {
      const said = await post(url, body, asAgent('dee-bystander'))
      expect(said.status, `${url}: ${said.body}`).toBe(404)
      expect(said.body, url).toContain(THE_REFUSAL)
    }
  })

  it('GET /api/annotations/:id refuses a comment message the reader is no party to', async () => {
    await answeredAsNothing((id) => `/api/annotations/${id}`, c1, asAgent('dee-bystander'))
    const bos = await get(`/api/annotations/${c1}`, asAgent('bo-reader'))
    expect(bos.status, bos.body).toBe(200)
  })
})

describe('the record doors', () => {
  it('GET /api/records/:id refuses the message', async () => {
    const dees = await answeredAsNothing((id) => `/api/records/${id}`, m1, asAgent('dee-bystander'))
    expect(dees.body).not.toContain(M1_TITLE)
    const bos = await get(`/api/records/${m1}`, asAgent('bo-reader'))
    expect(bos.status, bos.body).toBe(200)
  })

  it('GET /api/records leaves the message out and counts only what the reader may see', async () => {
    const dees = await get('/api/records?kind=message&shape=full', asAgent('dee-bystander'))
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(M1_TITLE)
    expect(dees.json['matched']).toBe((dees.json['records'] as unknown[]).length)
    const owner = await get('/api/records?kind=message&shape=full', OWNER)
    expect(owner.body).toContain(M1_TITLE)
  })

  it('GET /api/records/created-between leaves the message out of the list and the count', async () => {
    const url = '/api/records/created-between?from=2000-01-01&to=2100-01-01'
    const dees = await get(url, asAgent('dee-bystander'))
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(M1_TITLE)
    expect(dees.json['matched']).toBe((dees.json['records'] as unknown[]).length)
    expect((await get(url, OWNER)).body).toContain(M1_TITLE)
  })

  it('GET /api/records/title-options does not offer the message', async () => {
    const dees = await get('/api/records/title-options', asAgent('dee-bystander'))
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(M1_TITLE)
    expect((await get('/api/records/title-options', OWNER)).body).toContain(M1_TITLE)
  })

  it('GET /api/records/:id/around refuses the message, and lists neither it nor its link around another record', async () => {
    const itself = await get(`/api/records/${m1}/around`, asAgent('dee-bystander'))
    expect(itself.status, itself.body).toBe(404)
    const dees = await get(`/api/records/${note}/around`, asAgent('dee-bystander'))
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(m1)
    expect((await get(`/api/records/${note}/around`, OWNER)).body).toContain(m1)
  })

  it('GET /api/records/:id/context refuses the message', async () => {
    await answeredAsNothing((id) => `/api/records/${id}/context`, m1, asAgent('dee-bystander'))
    // AND ONE IN ANOTHER PROJECT, whose title the project boundary's refusal would otherwise quote.
    const elsewhere = await answeredAsNothing((id) => `/api/records/${id}/context`, m3, asAgent('dee-bystander'))
    expect(elsewhere.body).not.toContain('Elsewhere for bo')
    expect((await get(`/api/records/${m1}/context`, OWNER)).status).toBe(200)
  })

  it('GET /api/records/:id/layout refuses the message', async () => {
    await answeredAsNothing((id) => `/api/records/${id}/layout`, m1, asAgent('dee-bystander'))
    // THE OWNER IS NOT REFUSED AS FOR A MESSAGE THEY MAY NOT READ: the door answers them about the record.
    expect((await get(`/api/records/${m1}/layout`, OWNER)).status).not.toBe(404)
  })

  it('GET /api/records/:id/revisions refuses the message', async () => {
    await answeredAsNothing((id) => `/api/records/${id}/revisions`, m1, asAgent('dee-bystander'))
    expect((await get(`/api/records/${m1}/revisions`, OWNER)).status).toBe(200)
  })

  it('GET /api/records/:id/revisions/:seq refuses the message', async () => {
    await answeredAsNothing((id) => `/api/records/${id}/revisions/1`, m1, asAgent('dee-bystander'))
    expect((await get(`/api/records/${m1}/revisions/1`, OWNER)).status).toBe(200)
  })

  it('GET /api/records/:id/revisions/:seq/compare/:otherSeq refuses the message', async () => {
    await answeredAsNothing((id) => `/api/records/${id}/revisions/1/compare/1`, m1, asAgent('dee-bystander'))
    expect((await get(`/api/records/${m1}/revisions/1/compare/1`, OWNER)).status).toBe(200)
  })

  it('GET /api/records/:id/history refuses the message', async () => {
    await answeredAsNothing((id) => `/api/records/${id}/history`, m1, asAgent('dee-bystander'))
    expect((await get(`/api/records/${m1}/history`, OWNER)).status).toBe(200)
  })

  it('GET /api/records/:id/short-forms refuses the message', async () => {
    await answeredAsNothing((id) => `/api/records/${id}/short-forms`, m1, asAgent('dee-bystander'))
    expect((await get(`/api/records/${m1}/short-forms`, OWNER)).status).toBe(200)
  })

  it('POST /api/short-forms/rows leaves the message out', async () => {
    const dees = await post('/api/short-forms/rows', { recordIds: [m1, note], level: 'title' }, asAgent('dee-bystander'))
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(M1_TITLE)
    expect(dees.body).toContain('or name a message you may not read')
    expect((await post('/api/short-forms/rows', { recordIds: [m1, note], level: 'title' }, OWNER)).body).toContain(M1_TITLE)
  })

  it('POST /api/short-forms/rows at the label level gives no label and no title of the message', async () => {
    // A LABEL ON m1, written by its writer through the door, so the answer has a label to leave out. Each
    // row also carries the record's title, which a reader who may not read the message must not get either.
    const ledger = await get(`/api/records/${m1}/revisions`, OWNER)
    const newest = (ledger.json['revisions'] as { seq: number; contentHash: string }[]).sort((a, b) => b.seq - a.seq)[0]
    if (newest === undefined) throw new Error('the message has no revision to write a label from')
    const labelled = await post(`/api/records/${m1}/short-forms`, { madeFrom: { seq: newest.seq, contentHash: newest.contentHash }, forms: { label: M1_LABEL } }, asAgent('ada-writer'))
    expect(labelled.status, labelled.body).toBe(200)

    const dees = await post('/api/short-forms/rows', { recordIds: [m1, note], level: 'label' }, asAgent('dee-bystander'))
    expect(dees.status, dees.body).toBe(200)
    expect(dees.body).not.toContain(M1_LABEL)
    expect(dees.body).not.toContain(M1_TITLE)
    expect(dees.body).not.toContain(m1)
    const owners = await post('/api/short-forms/rows', { recordIds: [m1, note], level: 'label' }, OWNER)
    expect(owners.body).toContain(M1_LABEL)
    expect(owners.body).toContain(M1_TITLE)
  })

  it('GET /api/search finds nothing of the message, here or elsewhere, and does not name its id', async () => {
    const dees = await get(`/api/search?q=${M1_WORDS}`, asAgent('dee-bystander'))
    expect(dees.status, dees.body).toBe(200)
    expect((dees.json['counts'] as { matched: number }).matched).toBe(0)
    expect(dees.json['elsewhere']).toEqual([])
    const byId = await get(`/api/search?q=${m1}`, asAgent('dee-bystander'))
    expect(byId.json['exact']).toBeNull()
    const owner = await get(`/api/search?q=${M1_WORDS}`, OWNER)
    expect((owner.json['counts'] as { matched: number }).matched).toBe(1)
    expect((owner.json['elsewhere'] as { workspaceId: string }[]).map((one) => one.workspaceId)).toEqual([ELSEWHERE])
    expect((await get(`/api/search?q=${m1}`, OWNER)).json['exact']).not.toBeNull()
  })
})
