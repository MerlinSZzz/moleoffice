// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TWO LIST DOORS ANSWER ONE PAGE, AND SAY HOW MANY ROWS THERE ARE IN ALL.
 *
 * The Everything page reads `GET /api/records` and the Messages page reads `GET /api/messages`. Both
 * pages now draw one page of rows at a time. So each door takes a page (`limit` and `offset`), and
 * every search, narrowing and order is worked out over every row before the page is cut. A search
 * that only looked at the rows of one page would say "nothing matches" about a row on page two.
 *
 * A RECORDS CALL THAT SENDS NO LIMIT IS STILL ANSWERED EVERY ROW. A MESSAGES CALL THAT SENDS NO PAGE IS
 * ANSWERED ONE PAGE OF POOL_PAGE_DEFAULT, and says so: a caller that needs more follows `next`. Before,
 * the messages door built every message of the office for a call with no page (package SR).
 *
 * MUTATIONS, each red here:
 *   1. In src/server/api/records.ts, cut the page before the search (`searchRecords(page, ...)` in
 *      place of `searchRecords(everyRow, ...)`): the search for the oldest record finds nothing.
 *   2. In src/server/api/records.ts, drop the sort (`const rows = grouped`): the titles on page one
 *      are not the first three in Z-to-A order.
 *   3. In src/server/api/messages.ts, filter the page instead of the pool: the words search for the
 *      oldest message finds nothing.
 *   4. In src/server/api/messages.ts, leave `total` out of the page answer: the count check is red.
 *   5. In src/server/api/messages.ts, count the unread messages on the page (`page.filter`) in place
 *      of every matching message (`kept.filter`): the unread count misses the one on another page.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** Seven notes whose titles are written in the reverse of A-to-Z order, and their ids in the order written. The
 * newest is Alpha jig, so the database's own order (newest change first) is A to Z. */
const TITLES = ['Gamma lathe', 'Foxtrot drill', 'Echo press', 'Delta clamp', 'Charlie vise', 'Bravo saw', 'Alpha jig']
const noteIds: string[] = []
/** The first message written, so the oldest one, and the ids of every message in the order written. */
const OLDEST_WORDS = 'The quartz spindle reads 0.3 mm of runout.'
const messageIds: string[] = []
/** A message to the person, made the oldest in the pool, so it is on the last page and unread. */
let oldestToThePerson = ''
const AS_THE_HELPER = { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'paging-helper' }

async function get(url: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'GET', url, headers: PERSON })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

async function file(body: unknown): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers: PERSON, payload: body as object })
  expect(reply.statusCode, reply.body).toBe(theAnswerToAWriteInATestOffice(PERSON, body))
  return (reply.json() as { record: { id: string } }).record.id
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: PERSON,
    payload: { handle: 'paging-helper', name: 'Paging Helper', workArea: ['src'] },
  })
  expect(made.statusCode, made.body).toBe(201)
  for (const title of TITLES) noteIds.push(await file({ kind: 'note', title, data: { body: `A note about the ${title}.` } }))
  const words = [OLDEST_WORDS, 'The belt is tight.', 'The guard is back on.', 'The coolant is topped up.', 'The chuck is clean.']
  for (const body of words) {
    messageIds.push(await file({ kind: 'message', title: body.slice(0, 30), data: { body, to: [{ kind: 'agent', id: 'paging-helper' }] } }))
  }
  const toThePerson = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_HELPER,
    payload: { kind: 'message', title: 'The dial indicator', data: { body: 'The dial indicator is back in its case.', to: [{ kind: 'person', id: THE_PERSON }] } },
  })
  expect(toThePerson.statusCode, toThePerson.body).toBe(201)
  oldestToThePerson = (toThePerson.json() as { record: { id: string } }).record.id
  t.client.sqlite.prepare('UPDATE records SET created_at = ?, updated_at = ? WHERE id = ?').run('2025-12-31 09:00:00', '2025-12-31 09:00:00', oldestToThePerson)
  // THE OLDEST MESSAGE IS OLDEST ON THE CLOCK TOO. Messages written in one second have the same
  // stamp, so the pool's newest-first order is set here rather than left to the second they landed in.
  const stamp = t.client.sqlite.prepare('UPDATE records SET created_at = ?, updated_at = ? WHERE id = ?')
  messageIds.forEach((id, i) => stamp.run(`2026-01-0${String(i + 1)} 09:00:00`, `2026-01-0${String(i + 1)} 09:00:00`, id))
  noteIds.forEach((id, i) => stamp.run(`2026-02-0${String(i + 1)} 09:00:00`, `2026-02-0${String(i + 1)} 09:00:00`, id))
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('GET /api/records answers one page over every row', () => {
  it('answers exactly as before when no new parameter is sent', async () => {
    const plain = await get('/api/records?kind=note')
    expect(plain.status).toBe(200)
    expect(Object.keys(plain.body).sort()).toEqual(['left', 'matched', 'narrowedByPermission', 'next', 'records', 'returned', 'truncated'].sort())
    expect(plain.body['matched']).toBe(TITLES.length)
    expect('tally' in plain.body, 'a plain call gained the group counts').toBe(false)
  })

  it('sorts every row before it cuts the page, and the next page carries on where this one ended', async () => {
    // Z TO A, which is the opposite of the order the notes were written in, so an answer left in the
    // order the database keeps (newest change first) would be A to Z and red here.
    const first = await get('/api/records?kind=note&shape=light&sort=title&direction=desc&limit=3&offset=0')
    expect(first.status, JSON.stringify(first.body).slice(0, 300)).toBe(200)
    const titles = (first.body['records'] as { title: string }[]).map((r) => r.title)
    expect(titles, 'page one is not the first three titles of the whole list').toEqual(['Gamma lathe', 'Foxtrot drill', 'Echo press'])
    expect(first.body['matched'], 'the answer does not say how many rows there are in all').toBe(TITLES.length)
    expect(first.body['returned']).toBe(3)
    expect(first.body['left']).toBe(TITLES.length - 3)
    const next = String(first.body['next']).replace(/^GET /, '')
    const second = await get(next)
    expect((second.body['records'] as { title: string }[]).map((r) => r.title)).toEqual(['Delta clamp', 'Charlie vise', 'Bravo saw'])
  })

  it('searches every row, so a record that would be on another page is found', async () => {
    // Newest first, three to a page: the oldest note, the Gamma lathe, is on the last page.
    const byDate = await get('/api/records?kind=note&sort=updated&direction=desc&limit=3&offset=0')
    const onPageOne = (byDate.body['records'] as { title: string }[]).map((r) => r.title)
    expect(onPageOne, 'the fixture is wrong: the record searched for is already on page one').not.toContain('Gamma lathe')
    const searched = await get('/api/records?kind=note&q=lathe&sort=updated&direction=desc&limit=3&offset=0')
    expect(searched.status).toBe(200)
    expect((searched.body['records'] as { title: string }[]).map((r) => r.title)).toEqual(['Gamma lathe'])
    expect(searched.body['matched']).toBe(1)
  })

  it('narrows to one group over every row and counts every group before that narrowing', async () => {
    const all = await get('/api/records?tally=family&family=notes&limit=2')
    expect(all.status).toBe(200)
    const tally = all.body['tally'] as { everything: number; families: Record<string, number> }
    expect(tally.families['notes'], 'the notes group count is not over every row').toBeGreaterThanOrEqual(TITLES.length)
    expect(all.body['matched'], 'the group narrowing and its count disagree').toBe(tally.families['notes'])
    expect(tally.everything).toBeGreaterThanOrEqual(TITLES.length + messageIds.length)
    expect((all.body['records'] as unknown[]).length).toBe(2)
  })

  it('refuses a direction with no column to order by', async () => {
    const asked = await get('/api/records?direction=asc')
    expect(asked.status).toBe(400)
    expect(String(asked.body['error'])).toContain('direction needs sort')
  })
})

describe('GET /api/messages answers one page over every message', () => {
  it('answers one page of POOL_PAGE_DEFAULT when no page is sent, and says nothing is left', async () => {
    const plain = await get('/api/messages')
    expect(plain.status).toBe(200)
    expect(Object.keys(plain.body).sort()).toEqual(
      ['messages', 'narrowedByPermission', 'workspaceId', 'total', 'matched', 'returned', 'left', 'truncated', 'next', 'unreadForYou'].sort(),
    )
    expect(plain.body['returned']).toBe((plain.body['messages'] as unknown[]).length)
    expect(plain.body['left']).toBe(0)
    expect(plain.body['next']).toBeNull()
  })

  it('cuts a page and says how many messages there are in all', async () => {
    const first = await get('/api/messages?limit=2&offset=0')
    expect(first.status, JSON.stringify(first.body).slice(0, 300)).toBe(200)
    const total = first.body['total'] as number
    expect(total, 'the answer does not say how many messages the pool holds').toBeGreaterThanOrEqual(messageIds.length)
    expect(first.body['matched']).toBe(total)
    expect((first.body['messages'] as unknown[]).length).toBe(2)
    expect(first.body['left']).toBe(total - 2)
    expect(String(first.body['next'])).toContain('offset=2')
  })

  it('looks for words in every message, so the oldest one is found on the first page', async () => {
    const pageOne = await get('/api/messages?limit=2&offset=0')
    const ids = (pageOne.body['messages'] as { id: string }[]).map((m) => m.id)
    expect(ids, 'the fixture is wrong: the oldest message is already on page one').not.toContain(messageIds[0])
    const found = await get('/api/messages?limit=2&offset=0&words=QUARTZ%20spindle')
    expect(found.status).toBe(200)
    expect((found.body['messages'] as { id: string }[]).map((m) => m.id)).toEqual([messageIds[0]])
    expect(found.body['matched']).toBe(1)
    expect(found.body['total'], 'the pool count moved with the narrowing').toBe(pageOne.body['total'])
  })

  it('counts what the reader has not read on every page, not only on the page it answers', async () => {
    const pageOne = await get('/api/messages?limit=1&offset=0')
    const onPageOne = (pageOne.body['messages'] as { id: string }[]).map((m) => m.id)
    expect(onPageOne, 'the fixture is wrong: the unread message is on page one').not.toContain(oldestToThePerson)
    // THE SAME RULE THE DOOR ALREADY KEEPS for ?only=waiting-for-me: a delivery to the reader not seen.
    const waiting = await get('/api/messages?only=waiting-for-me')
    const waitingIds = (waiting.body['messages'] as { id: string }[]).map((m) => m.id)
    expect(waitingIds, 'the message to the person is not waiting for them').toContain(oldestToThePerson)
    expect(pageOne.body['unreadForYou'], 'the unread count is not over every page').toBe(waitingIds.length)
    const unreadOnPageOne = onPageOne.filter((id) => waitingIds.includes(id)).length
    expect(unreadOnPageOne, 'every unread message is on page one, so this case proves nothing').toBeLessThan(waitingIds.length)
    // AND UNDER A NARROWING, over the messages it keeps: only the one to the person says these words.
    const narrowed = await get('/api/messages?limit=1&offset=0&words=dial%20indicator')
    expect(narrowed.body['unreadForYou']).toBe(1)
    const none = await get('/api/messages?limit=1&offset=0&words=quartz')
    expect(none.body['unreadForYou'], 'a message to the agent counts as unread for the person').toBe(0)
  })

  it('narrows by how far a message got, over every message', async () => {
    const queued = await get('/api/messages?state=queued&limit=50')
    const ids = (queued.body['messages'] as { id: string }[]).map((m) => m.id)
    for (const id of messageIds) expect(ids, `message ${id} to an agent is not queued`).toContain(id)
    const nowhere = await get('/api/messages?state=nowhere&limit=50')
    expect((nowhere.body['messages'] as { id: string }[]).map((m) => m.id)).not.toContain(messageIds[0])
  })
})
