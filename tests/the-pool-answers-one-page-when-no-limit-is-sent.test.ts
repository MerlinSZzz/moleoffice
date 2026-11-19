// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE POOL ANSWERS ONE PAGE WHEN A CALL NAMES NO `limit` (package SR, round 2 of line 14c).
 *
 * Before this case, `GET /api/messages` with no page built every message of the office and answered
 * them all: 11,228,946 B and 2,224.9 ms cold on the made-up office, with a PATCH beside it held for
 * 2,053.8 to 2,251.2 ms. `GET /api/messages?full=1` was 280,280,798 B and 3,742.2 ms cold, with a
 * PATCH beside it held for 4,138 to 4,324 ms. The route already knows how to answer a page: the
 * Messages page asks one in 106,828 B and 188.4 ms cold. This case is the no-page call taking that
 * same path.
 *
 * WHAT IT PROVES:
 *   - A no-page call answers `POOL_PAGE_DEFAULT` messages, not every message. The office here has
 *     `POOL_PAGE_DEFAULT + 5`, so the answer cannot be the whole pool by accident.
 *   - The answer says `left` and `next`, and following `next` reads the rest: the oldest message,
 *     which is not on page one, is on the next page. A caller that needs every message can walk.
 *   - The no-page answer is the same ids and numbers as `?limit=POOL_PAGE_DEFAULT&offset=0`, so it is
 *     the route's existing page and not a second rule.
 *   - `?full=1` with no page answers one page with the words on every entry, and the same numbers.
 *   - A PATCH made beside either read stores its value: the record is read back and compared.
 *   - The dsh hooks, the one production caller that needs every unseen message, names a limit and
 *     follows `next`. A message that arrives between two pages (the same id comes again) is read once;
 *     an empty page stops the walk; a page that contradicts itself fails the whole read with a sentence
 *     saying which; a walk that has collected more than the first page's `matched` stops; and a failed
 *     second page fails the whole read.
 *   - The sentence a hook prints for a failed read carries the hook's own reason: a hand-over whose later
 *     page fails counts the messages the earlier pages marked delivered and did not show, and a page the
 *     hook judged a fault prints why.
 *
 * THE NUMBER IS READ FROM THE CODE, ALONE. `POOL_PAGE_DEFAULT` is the page this test expects and there is
 * no fallback: on the cut before the door change this module exports no such number, so the typeof check
 * in beforeAll is the control red, with that sentence and not a page of the wrong length. The same
 * beforeAll checks that the default is the largest page a caller may ask for.
 *
 * MUTATION: make the no-page read cut with `asked.limit` (undefined) instead of the default and this
 * file is red on page one; make the dsh hook ignore `next` and the two-page case is red.
 */
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import * as theHooks from '../tools/dsh-hooks/office.mjs'

let t: TestDb
let app: FastifyInstance
/** How many messages belong on the page a call with no `limit` answers. */
let pageSize: number
/** How many messages this office holds, so the last page can be checked exactly. */
let held: number
/** The oldest message written here, so it is on the last page and not on page one. */
let oldest = ''
const ids: string[] = []

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function get(url: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'GET', url, headers: PERSON })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

beforeAll(async () => {
  t = await freshDb()
  // THE MESSAGES MODULE OPENS THE TEST DATABASE WHEN IT IS IMPORTED, so it is loaded after freshDb names it.
  // A static import here asked for the operator's file before freshDb named the test database; the guard
  // refused, and the suite never ran.
  const theMessageDoor = await import('../src/server/api/messages.ts')
  app = (await apiApp()).app
  await app.ready()
  const declaredPage = (theMessageDoor as unknown as { POOL_PAGE_DEFAULT?: unknown }).POOL_PAGE_DEFAULT
  expect(typeof declaredPage, 'messages.ts exports no POOL_PAGE_DEFAULT').toBe('number')
  pageSize = declaredPage as number
  expect(pageSize, 'the default page is not the largest page a caller may ask for').toBe(theMessageDoor.POOL_PAGE_MAX_LIMIT)
  // ONE PAGE AND FIVE MORE, so the oldest cannot be on the first page and the last page can be counted.
  for (let i = 0; i < pageSize + 5; i += 1) {
    const made = t.api.createRecord({
      workspaceId: 'default',
      kind: 'message',
      title: `Page message ${String(i).padStart(5, '0')}`,
      data: { body: `The words of page message ${String(i)}.`, to: [{ kind: 'person', id: THE_PERSON }] },
      actor: t.api.HUMAN,
    })
    ids.push(made.id)
  }
  oldest = ids[0]!
  // A MESSAGE WRITTEN IN THE SAME SECOND AS ANOTHER HAS NO ORDER OF ITS OWN, so the fixture gives each
  // one a different second. The first written is the oldest, which is the last the pool answers.
  const stamp = t.client.sqlite.prepare('UPDATE records SET created_at = ?, updated_at = ? WHERE id = ?')
  const write = t.client.sqlite.transaction(() => {
    ids.forEach((id, i) => {
      const at = new Date(Date.UTC(2026, 5, 1, 9, 0, 0) + i * 1000).toISOString().replace('T', ' ').slice(0, 19)
      stamp.run(at, at, id)
    })
  })
  write()
  const counted = await get('/api/messages?limit=1&offset=0')
  expect(counted.status, JSON.stringify(counted.body).slice(0, 300)).toBe(200)
  held = counted.body['total'] as number
  expect(held, 'the fixture is not more than one page, so page one cannot be told from the whole pool').toBeGreaterThan(pageSize)
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('GET /api/messages with no limit', () => {
  it('answers one page, says how many are left, and the next page reads the oldest', async () => {
    const plain = await get('/api/messages')
    expect(plain.status, JSON.stringify(plain.body).slice(0, 300)).toBe(200)
    const messages = plain.body['messages'] as { id: string }[]
    expect(messages).toHaveLength(pageSize)
    expect(plain.body['matched']).toBe(held)
    expect(plain.body['returned']).toBe(pageSize)
    expect(plain.body['left']).toBe(held - pageSize)
    expect(plain.body['truncated']).toBe(true)
    expect(String(plain.body['next'])).toContain(`offset=${String(pageSize)}`)
    expect(messages.map((one) => one.id), 'the oldest message is already on page one, so this proves nothing').not.toContain(oldest)

    const next = String(plain.body['next']).replace(/^GET /, '')
    const second = await get(next)
    expect(second.status, JSON.stringify(second.body).slice(0, 300)).toBe(200)
    const rest = second.body['messages'] as { id: string }[]
    expect(rest.length).toBe(held - pageSize)
    expect(rest.map((one) => one.id), 'the oldest message is not on the page the reply named').toContain(oldest)
    expect(second.body['left']).toBe(0)
    expect(second.body['next']).toBeNull()
  })

  it('answers the same page as asking for that limit, so it is the existing page and not a second rule', async () => {
    const plain = await get('/api/messages')
    const asked = await get(`/api/messages?limit=${String(pageSize)}&offset=0`)
    const idsOf = (body: Record<string, unknown>) => (body['messages'] as { id: string }[]).map((one) => one.id)
    expect(idsOf(plain.body)).toEqual(idsOf(asked.body))
    for (const key of ['total', 'matched', 'returned', 'left', 'truncated', 'next', 'unreadForYou']) {
      expect(plain.body[key], `the no-page answer's ${key} is not the page's`).toEqual(asked.body[key])
    }
  })

  it('asks full=1 for one page of words, not the whole pool, and names the rest', async () => {
    const full = await get('/api/messages?full=1')
    expect(full.status, JSON.stringify(full.body).slice(0, 300)).toBe(200)
    const messages = full.body['messages'] as { id: string; body?: unknown }[]
    expect(messages).toHaveLength(pageSize)
    expect(messages.every((one) => typeof one.body === 'string')).toBe(true)
    expect(full.body['left']).toBe(held - pageSize)
    expect(full.body['truncated']).toBe(true)
    expect(String(full.body['next'])).toContain(`offset=${String(pageSize)}`)
  })

  it('stores the PATCH made beside each whole-pool read', async () => {
    for (const url of ['/api/messages', '/api/messages?full=1']) {
      const target = t.api.createRecord({
        workspaceId: 'default',
        kind: 'note',
        title: `A note patched beside ${url}`,
        data: { body: 'The value before the patch.' },
        actor: t.api.HUMAN,
      })
      const [read, patched] = await Promise.all([
        app.inject({ method: 'GET', url, headers: PERSON }),
        app.inject({
          method: 'PATCH',
          url: `/api/records/${target.id}`,
          headers: PERSON,
          payload: { dataPatch: { body: `The value stored beside ${url}.` } },
        }),
      ])
      expect(read.statusCode, `the read ${url} did not answer`).toBe(200)
      expect(patched.statusCode, `the PATCH beside ${url} did not answer: ${patched.body}`).toBe(200)
      const stored = await get(`/api/records/${target.id}`)
      const record = (stored.body as { record?: { data?: { body?: unknown } } }).record
      expect(record?.data?.body, `the PATCH beside ${url} did not store its value`).toBe(`The value stored beside ${url}.`)
    }
  })
})

describe('the dsh hooks name a page and walk the rest', () => {
  /** The hook's page size, read from the code alone: on the cut the typeof check is the red with its own sentence. */
  function theHookPage(): number {
    const declared = (theHooks as unknown as { UNSEEN_MESSAGES_PER_PAGE?: unknown }).UNSEEN_MESSAGES_PER_PAGE
    expect(typeof declared, 'office.mjs exports no UNSEEN_MESSAGES_PER_PAGE').toBe('number')
    return declared as number
  }

  /** A made-up office that answers the pool's pages from `answer`, so a walk longer than one page is proved. */
  async function withAMadeUpOffice(
    answer: (asked: URL, calls: URL[]) => { status: number; body: unknown },
    read: (base: string, calls: URL[]) => Promise<{ failed?: unknown; messages?: { id: string }[] }>,
  ): Promise<{ got: { failed?: unknown; messages?: { id: string }[] }; calls: URL[] }> {
    const calls: URL[] = []
    const server = createServer((request, response) => {
      const asked = new URL(request.url ?? '/', 'http://made-up-office')
      calls.push(asked)
      const { status, body } = answer(asked, calls)
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(body))
    })
    await new Promise<void>((go) => server.listen(0, '127.0.0.1', () => go()))
    const address = server.address() as AddressInfo
    try {
      const got = await read(`http://127.0.0.1:${String(address.port)}`, calls)
      return { got, calls }
    } finally {
      server.closeAllConnections()
      await new Promise<void>((go) => server.close(() => go()))
    }
  }

  const aPage = (body: unknown) => ({ status: 200, body })
  const aNext = (offset: number, perPage: number) => `GET /api/messages?only=waiting-for-me&full=1&limit=${String(perPage)}&offset=${String(offset)}`

  it('asks for one page, follows next, and reads a message that shifted across the page boundary once', async () => {
    const perPage = theHookPage()
    const { got, calls } = await withAMadeUpOffice(
      (asked) => {
        if (asked.searchParams.get('offset') === null) {
          return aPage({
            messages: [{ id: 'first', body: 'The first message.' }, { id: 'second', body: 'The second message.' }],
            matched: 3,
            returned: 2,
            left: 1,
            truncated: true,
            next: aNext(2, perPage),
          })
        }
        return aPage({
          // A message arrived between the pages, so the offset moved by one and `second` comes again.
          messages: [{ id: 'second', body: 'The second message.' }, { id: 'third', body: 'The third message.' }],
          matched: 3,
          returned: 2,
          left: 0,
          truncated: false,
          next: null,
        })
      },
      (base) => theHooks.unseenMessages(base, { handle: 'agent', workspace: 'default', session: 'a-run' }),
    )
    expect(got.failed).toBeUndefined()
    expect(got.messages?.map((one) => one.id), 'the walk did not read the whole list once each').toEqual(['first', 'second', 'third'])
    expect(calls).toHaveLength(2)
    expect(calls[0]!.searchParams.get('limit')).toBe(String(perPage))
    expect(calls[1]!.pathname).toBe('/api/messages')
    expect(calls[1]!.searchParams.get('offset')).toBe('2')
  })

  it('stops on an empty page even when the door names a next one', async () => {
    const perPage = theHookPage()
    const { got, calls } = await withAMadeUpOffice(
      (asked) => {
        if (asked.searchParams.get('offset') === null) {
          return aPage({
            messages: [{ id: 'first', body: 'The first message.' }],
            matched: 2,
            returned: 1,
            left: 1,
            truncated: true,
            next: aNext(1, perPage),
          })
        }
        return aPage({ messages: [], matched: 2, returned: 0, left: 1, truncated: true, next: aNext(2, perPage) })
      },
      (base) => theHooks.unseenMessages(base, { handle: 'agent', workspace: 'default', session: 'a-run' }),
    )
    expect(got.failed).toBeUndefined()
    expect(got.messages?.map((one) => one.id)).toEqual(['first'])
    expect(calls, 'the walk asked again after an empty page').toHaveLength(2)
  })

  it('fails the whole read when a first page says left 0 and still names a next', async () => {
    const perPage = theHookPage()
    const { got, calls } = await withAMadeUpOffice(
      () =>
        aPage({
          messages: [{ id: 'first', body: 'The first message.' }],
          matched: 1,
          returned: 1,
          left: 0,
          truncated: false,
          next: aNext(1, perPage),
        }),
      (base) => theHooks.unseenMessages(base, { handle: 'agent', workspace: 'default', session: 'a-run' }),
    )
    expect(got.messages, 'a contradicting page was read past').toBeUndefined()
    const because = (got.failed as { because?: unknown } | undefined)?.because
    expect(typeof because, 'a contradicting page did not carry its sentence').toBe('string')
    expect(because).toContain('left 0')
    expect(because).toContain('named a next')
    expect(calls, 'the walk asked again after a contradicting first page').toHaveLength(1)
  })

  it('fails the whole read when a page says left above 0 and names no next', async () => {
    const { got, calls } = await withAMadeUpOffice(
      () =>
        aPage({
          messages: [{ id: 'first', body: 'The first message.' }],
          matched: 2,
          returned: 1,
          left: 1,
          truncated: true,
          next: null,
        }),
      (base) => theHooks.unseenMessages(base, { handle: 'agent', workspace: 'default', session: 'a-run' }),
    )
    expect(got.messages, 'a page with left above 0 and no next was read past').toBeUndefined()
    const because = (got.failed as { because?: unknown } | undefined)?.because
    expect(typeof because, 'a page with left above 0 and no next did not carry its sentence').toBe('string')
    expect(because).toContain('left above 0')
    expect(because).toContain('named no next')
    expect(calls, 'the walk asked again after a page with no next').toHaveLength(1)
  })

  it('fails the whole read when a page names a next this hook cannot follow', async () => {
    const { got, calls } = await withAMadeUpOffice(
      () =>
        aPage({
          messages: [{ id: 'first', body: 'The first message.' }],
          matched: 2,
          returned: 1,
          left: 1,
          truncated: true,
          next: 'GET /api/records?offset=1',
        }),
      (base) => theHooks.unseenMessages(base, { handle: 'agent', workspace: 'default', session: 'a-run' }),
    )
    expect(got.messages, 'a next this hook could not follow was read as the end of the list').toBeUndefined()
    const because = (got.failed as { because?: unknown } | undefined)?.because
    expect(typeof because, 'an unfollowable next did not carry its sentence').toBe('string')
    expect(because).toContain('could not follow')
    expect(because).toContain('GET /api/records?offset=1')
    expect(calls, 'the walk asked again after an unfollowable next').toHaveLength(1)
  })

  it('stops once it has collected more than the first page said matched', async () => {
    const perPage = theHookPage()
    const { got, calls } = await withAMadeUpOffice(
      (asked) => {
        if (asked.searchParams.get('offset') === null) {
          return aPage({
            messages: [{ id: 'first', body: 'The first message.' }, { id: 'second', body: 'The second message.' }],
            matched: 3,
            returned: 2,
            left: 1,
            truncated: true,
            next: aNext(2, perPage),
          })
        }
        return aPage({
          messages: [
            { id: 'third', body: 'The third message.' },
            { id: 'fourth', body: 'The fourth message.' },
            { id: 'fifth', body: 'The fifth message.' },
          ],
          matched: 7,
          returned: 3,
          left: 2,
          truncated: true,
          next: aNext(5, perPage),
        })
      },
      (base) => theHooks.unseenMessages(base, { handle: 'agent', workspace: 'default', session: 'a-run' }),
    )
    expect(got.failed).toBeUndefined()
    expect(got.messages?.map((one) => one.id), 'the walk did not stop after the first page matched grew').toEqual([
      'first',
      'second',
      'third',
      'fourth',
      'fifth',
    ])
    expect(calls, 'the walk kept going after it had more than the first page matched').toHaveLength(2)
  })

  it('fails the whole read when the second page fails', async () => {
    const perPage = theHookPage()
    const { got } = await withAMadeUpOffice(
      (asked) => {
        if (asked.searchParams.get('offset') === null) {
          return aPage({
            messages: [{ id: 'first', body: 'The first message.' }],
            matched: 2,
            returned: 1,
            left: 1,
            truncated: true,
            next: aNext(1, perPage),
          })
        }
        return { status: 500, body: { error: 'The made-up office refused the second page.' } }
      },
      (base) => theHooks.unseenMessages(base, { handle: 'agent', workspace: 'default', session: 'a-run' }),
    )
    expect(got.failed, 'a failed second page did not fail the whole read').toBeDefined()
    expect(got.messages).toBeUndefined()
  })

  // A HAND-OVER THAT FAILS ON A LATER PAGE SAYS WHAT THE EARLIER PAGES MARKED (line 13n, at the join). The door marks
  // each page's messages delivered as it answers that page, and a failed walk prints none of them, so the sentence a
  // hook prints counts the messages this read marked and did not show.
  it('says in the printed failure how many messages it marked delivered before a later page failed', async () => {
    const perPage = theHookPage()
    const { got, calls } = await withAMadeUpOffice(
      (asked) => {
        if (asked.searchParams.get('offset') === null) {
          return aPage({
            messages: [{ id: 'first', body: 'The first message.' }, { id: 'second', body: 'The second message.' }],
            markedDelivered: ['first', 'second'],
            matched: 3,
            returned: 2,
            left: 1,
            truncated: true,
            next: `${aNext(2, perPage)}&markDelivered=1`,
          })
        }
        return { status: 500, body: { error: 'The made-up office refused the second page.' } }
      },
      (base) => theHooks.unseenMessages(base, { handle: 'agent', workspace: 'default', session: 'a-run' }, true),
    )
    expect(calls[0]?.searchParams.get('markDelivered'), 'the hand-over did not ask the door to mark').toBe('1')
    expect(got.messages).toBeUndefined()
    const printed = theHooks.whatTheOfficeSaid('http://made-up-office', got.failed as never)
    expect(printed).toContain('Mole Office answered 500')
    expect(printed, 'the printed failure does not say what the earlier page marked').toContain(
      'This read marked 2 messages delivered before it failed and showed none of them',
    )
  })

  it('prints the sentence that says why a page that contradicts itself failed the read', async () => {
    const perPage = theHookPage()
    const { got } = await withAMadeUpOffice(
      () => aPage({ messages: [{ id: 'first', body: 'The first message.' }], matched: 1, returned: 1, left: 0, truncated: false, next: aNext(1, perPage) }),
      (base) => theHooks.unseenMessages(base, { handle: 'agent', workspace: 'default', session: 'a-run' }),
    )
    const printed = theHooks.whatTheOfficeSaid('http://made-up-office', got.failed as never)
    expect(printed, 'the hook judged the page a fault and printed only the 200').toContain('a page that contradicts itself is a fault')
  })
})
