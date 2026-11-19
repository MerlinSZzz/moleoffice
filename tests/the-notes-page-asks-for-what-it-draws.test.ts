// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NOTES PAGE ASKS FOR WHAT IT DRAWS, AND THE POOL DOOR HAS THE NARROWING IT NEEDS.
 *
 * MEASURED FIRST, 11 September 2026, on the idle copy (problem RcrvxsbgqWqr): the Reports and
 * notes page read the WHOLE pool — 1,517 messages, 2.5 MB — to draw the reader's board, of which
 * 438 messages are addressed to the person and the rest are conversations between agents that the
 * page never drew on purpose since problem `mHW14kZljlHR`. The page then asked for
 * `?only=addressed-to-me-or-nobody`, the third narrowing on `GET /api/messages`: the messages
 * addressed to the reader, or to nobody at all, in every read state. Neither of the two read-state
 * narrowings covers it — `waiting-for-me` drops what has been read, and the board drew the whole
 * board — so the value is named for what a person means by it, not for how the store tells the
 * rows apart.
 *
 * 15 SEPTEMBER 2026: THE PAGE NO LONGER READS THE POOL AT ALL. Criterion E1 took `message` out of
 * the Reports and notes family, and the board and its pool read went with it. The narrowing is
 * KEPT on the door — this file still proves it answers what its name says, because a reader of the
 * pool is a real thing to ask for and the library and its narrowings are not this change's to
 * remove — but the last test now pins that the notes page does NOT ask for it.
 *
 * HOW IT IS PROVED. The door is mounted over a corpus with one message in each place a person's
 * board had to tell apart: addressed to the reader and unread, addressed to the reader and read,
 * addressed to nobody, addressed to an agent, and addressed to another person. The narrowed call
 * keeps the first three and leaves out the last two, whatever their read state; the whole pool
 * still answers with all five; and the same narrowing asked by an agent keeps that agent's own.
 *
 * MUTATION: answer the whole pool whatever `only` says, and the kept-and-left-out test is red.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string) => ({ 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

/** The messages waiting for one agent, through the door the waiter uses. */
async function waitingIdsFor(handle: string): Promise<string[]> {
  const reply = await app.inject({ method: 'GET', url: `/api/handles/${handle}/waiting`, headers: PERSON })
  const body = reply.json() as { waiting?: { messageId: string }[] }
  return (body.waiting ?? []).map((one) => one.messageId)
}

async function post(path: string, body: unknown, headers: Record<string, string>): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as object })
  return reply.json() as Record<string, unknown>
}
async function pool(query: string, headers: Record<string, string>): Promise<{ status: number; ids: string[]; only?: string }> {
  const reply = await app.inject({ method: 'GET', url: `/api/messages${query}`, headers })
  const body = reply.json() as { messages?: { id: string }[]; only?: string }
  return { status: reply.statusCode, ids: (body.messages ?? []).map((one) => one.id), only: body.only }
}

let unreadForMe = ''
let readForMe = ''
let toNobody = ''
let toAnAgent = ''
/** The card message the registration writes to its new agent, as one decision provides. */
let cardToNotesOne = ''

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle: 'notes-one', name: 'notes-one', workArea: ['src'] } })
  expect(made.statusCode, made.body).toBe(201)
  const notesCards = await waitingIdsFor('notes-one')
  expect(notesCards.length, 'the registration wrote notes-one no card message').toBe(1)
  cardToNotesOne = notesCards[0]!
  const id = (filed: Record<string, unknown>) => {
    expect(filed['record'], JSON.stringify(filed).slice(0, 300)).toBeDefined()
    return (filed['record'] as { id: string }).id
  }
  unreadForMe = id(await post('/api/records', { kind: 'message', title: 'to the person, unread', data: { body: 'for the person, not yet read', to: [{ kind: 'person', id: THE_PERSON }] } }, asAgent('notes-one')))
  readForMe = id(await post('/api/records', { kind: 'message', title: 'to the person, read', data: { body: 'for the person, read', to: [{ kind: 'person', id: THE_PERSON }] } }, asAgent('notes-one')))
  const marked = await post(`/api/messages/${readForMe}/mark`, { mark: 'seen' }, PERSON)
  expect(marked['error'], JSON.stringify(marked).slice(0, 200)).toBeUndefined()
  // A comment somebody left on a page for nobody in particular: `to` is absent and a `target`
  // is present, which is the one write the gate allows without an addressee, and the shape the
  // corpus's own no-delivery rows have. It gets no delivery rows at all.
  toNobody = id(await post('/api/records', { kind: 'message', title: 'on the board, addressed to nobody', data: { body: 'a note for the open board', target: { target: { kind: 'record', recordId: unreadForMe, workspaceId: 'default' } } } }, asAgent('notes-one')))
  // A message addressed only to somebody else. A second PERSON cannot be registered by an agent,
  // so the "somebody else" here is an agent — which is the case the board has to tell apart from
  // the reader's own rows, and the one a conversation between two agents is made of.
  toAnAgent = id(await post('/api/records', { kind: 'message', title: 'to an agent', data: { body: 'for notes-one, queued', to: [{ kind: 'agent', id: 'notes-one' }] } }, PERSON))
})
afterAll(async () => {
  await app.close()
  t.close()
})

describe('GET /api/messages narrowed with ?only=addressed-to-me-or-nobody', () => {
  it('keeps what is the reader’s or the open board’s, in every read state, and leaves out the rest', async () => {
    const board = await pool('?only=addressed-to-me-or-nobody', PERSON)
    expect(board.status).toBe(200)
    expect(board.only).toBe('addressed-to-me-or-nobody')
    // READ as well as unread: this page draws the whole board, so a read state filter would drop
    // half of it.
    expect(new Set(board.ids)).toEqual(new Set([unreadForMe, readForMe, toNobody]))
  })

  it('answers the whole pool with no narrowing, exactly as before', async () => {
    const whole = await pool('', PERSON)
    expect(whole.status).toBe(200)
    expect(whole.only).toBeUndefined()
    expect(new Set(whole.ids)).toEqual(new Set([unreadForMe, readForMe, toNobody, toAnAgent, cardToNotesOne]))
  })

  it('answers the reader it is asked by: an agent asking reads its own and the open board', async () => {
    const agent = await pool('?only=addressed-to-me-or-nobody', asAgent('notes-one'))
    expect(agent.status).toBe(200)
    // THE CARD MESSAGE THE REGISTRATION WROTE IS ADDRESSED TO THAT AGENT, so it is its own too.
    expect(new Set(agent.ids)).toEqual(new Set([toAnAgent, toNobody, cardToNotesOne]))
  })

  it('marks that the page does NOT ask for the pool, so a return of the board is caught in the source', async () => {
    // A SOURCE ASSERTION, the way tests/family-pages.test.ts proves what a page reads. Before
    // criterion E1 this asserted the page DID ask for the narrowing; the board is gone, so the
    // assertion is reversed. Without it, adding the pool read back — and with it the inbox on the
    // Reports and notes page — would pass every test that only renders the page.
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const dir = fileURLToPath(new URL('../src/web/pages/family/', import.meta.url))
    const page = readFileSync(`${dir}NotesPage.tsx`, 'utf8')
    expect(page).not.toContain('api.messagePool')
    expect(page).not.toContain('addressed-to-me-or-nobody')
    // CRITERION CHANGE, 28 September 2026: the page no longer says where messages are. Its count
    // sentence ("Read messages in the chat or on the record they are about") went with the redesign of report
    // n9Mjk3c_sJRu, block b-5, that a decision approved. The sidebar's Messages row, beside
    // this page's row, is where a reader finds them.
  })
})
