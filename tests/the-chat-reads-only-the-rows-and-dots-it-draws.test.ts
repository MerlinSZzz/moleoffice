// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT READS ONLY THE CONTACT ROWS AND THE PRESENCE DOTS IT DRAWS.
 *
 * Round 9 of wave 13x. On an office of the live size the chat read every participant's
 * presence and every contact row with the whole of its last message, about 1 MB, to draw a list of which a screen shows
 * a few rows. Now:
 *   - the contacts are read a page at a time, `GET /api/messages/contact-list`, 25 rows drawn on top to a page, each
 *     row in the short form of `?shape=page`. This came in round 20 of wave 13u, on a decision.
 *     Until then the chat read every row from `GET /api/messages/contacts?shape=page` and drew 30 rows of a group
 *     at a time;
 *   - the list draws the rows it has read, and reads the next page when the end of them is scrolled to
 *     (`TheRestOfTheList` in src/web/components/ContactChooser.tsx);
 *   - the presence is read as `GET /api/presence?of=...`, for the dots drawn and nobody else (Chat.tsx, `aDotIsDrawn`).
 *
 * WHAT THIS FILE HOLDS. Forty-five agents each wrote to the person, so one group holds more rows than one page.
 * On the chat page:
 *   - the contacts were read from the paged door, no read asking for more than 25 rows, and never from the door that
 *     answers every row;
 *   - the list draws 25 rows on top at first;
 *   - every presence read names whom it asks for, and each one asked for is a drawn row or the reader, whose own control
 *     is drawn at the top of the lists;
 *   - scrolled to its end, the list reads the next page and the group draws the rest of its rows, and their dots are
 *     read with them;
 *   - the contacts answer and each presence answer stay under a byte bound, with one agent's last line 22,000
 *     characters long.
 *
 * WHAT MAKES IT RED: `howManyToReadAgain` in src/web/lib/the-contact-list-held.ts asking for 1000 rows, which is the
 * chat reading the whole list again; `aContactRowForThePage` in src/shared/short-lists.ts sending the whole body;
 * `theDotsOf` in Chat.tsx reading `api.presence()` whole; the chat's read of its list made with
 * `api.contactsForThePage()`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp


const AGENTS = 45
/**
 * The rows drawn on top in one page of the contact list, when nothing else is asked, as one decision put
 * it.
 */
const AT_A_TIME = 25
/** The chat's paged contacts door, and the door that answers every row, which the chat no longer reads. */
const PAGED = '/api/messages/contact-list'
const WHOLE = '/api/messages/contacts'
/**
 * The contacts answer for these rows, and the presence answer for each dot asked for, at most: about twice what they
 * weighed when this was written (14,155 bytes, and 12,396 bytes for 31 dots).
 */
const CONTACTS_BYTES_AT_MOST = 28_000
const PRESENCE_BYTES_A_DOT = 800

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({ ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

async function write(headers: Record<string, string>, body: unknown): Promise<void> {
  const res = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await res.text()
  expect(res.status, text).toBe(201)
}

beforeAll(async () => {
  app = await liveApp({ name: 'rows-and-dots-drawn', viewport: { width: 1440, height: 1000 } })
  for (let n = 0; n < AGENTS; n++) {
    const handle = `many-${String(n).padStart(2, '0')}`
    await write(AS_THE_OWNER, { kind: 'agent', title: handle, data: { handle, runtime: 'claude-code', state: 'active' } })
    // ONE LONG LINE, so a row that carried the whole of its last message would be seen in the bytes.
    const body = n === 0 ? `A long line from ${handle}. ${'The bracket is loose. '.repeat(1000)}` : `A line from ${handle}.`
    await write(asAgent(handle), { kind: 'message', title: handle, data: { body, to: [{ kind: 'person', id: THE_PERSON }] } })
  }
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

/** Each `kind:id` one presence read asked for, or null for a read that named nobody and so asked for everybody. */
function askedFor(url: URL): string[] | null {
  const of = url.searchParams.get('of')
  return of === null ? null : of.split(',')
}

describe('the chat page', () => {
  it('reads the contacts a page of 25 at a time, and asks only for the dots it draws', async () => {
    const asked: URL[] = []
    app.page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.pathname.startsWith('/api/')) asked.push(url)
    })
    const bytes: { path: string; bytes: number }[] = []
    app.page.on('response', (response) => {
      const path = new URL(response.url()).pathname
      if (path === PAGED || path === '/api/presence') void response.body().then((body) => bytes.push({ path, bytes: body.length }), () => {})
    })
    await app.page.goto(`${app.site}/?lang=en#/chat`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    // THE CONTACTS' READ is looked at before the rows are waited for, so a read of the whole list fails here and says so.
    await expect.poll(() => asked.filter((one) => one.pathname === PAGED).length, { timeout: 30_000 }).toBeGreaterThan(0)
    const pageSizes = (): number[] => asked.filter((one) => one.pathname === PAGED).map((one) => Number(one.searchParams.get('limit') ?? AT_A_TIME))
    expect(pageSizes().filter((one) => one > AT_A_TIME), 'a read of the contacts asked for more than one page').toEqual([])
    expect(asked.filter((one) => one.pathname === WHOLE).map(String), 'the chat read every contact row').toEqual([])

    const rows = app.page.locator('.px-chat-page-lists .px-chat-contact')
    await rows.first().waitFor({ state: 'visible', timeout: 30_000 })
    await app.page.waitForTimeout(1_500)
    expect(pageSizes().filter((one) => one > AT_A_TIME), 'a read of the contacts asked for more than one page').toEqual([])
    expect(asked.filter((one) => one.pathname === WHOLE).map(String), 'the chat read every contact row').toEqual([])

    const perGroup = async (): Promise<number[]> =>
      app.page.locator('.px-chat-page-lists .px-chat-group-of').evaluateAll((groups) => groups.map((one) => one.querySelectorAll('ul.px-chat-list > li > .px-chat-contact').length))
    const drawnAtFirst = await perGroup()
    expect(drawnAtFirst.reduce((sum, one) => sum + one, 0), JSON.stringify(drawnAtFirst)).toBe(AT_A_TIME)

    // EACH PRESENCE READ names whom it asks for, and they are drawn. A refresh may read the drawn dots again, so each read
    // is bounded and not their sum.
    const theReads = (from: number): string[][] => {
      const reads = asked.slice(from).filter((one) => one.pathname === '/api/presence').map(askedFor)
      expect(reads, 'a presence read asked for everybody').not.toContain(null)
      return reads.map((one) => one ?? [])
    }
    const drawnKeys = async (): Promise<string[]> => rows.evaluateAll((all) => all.map((one) => one.getAttribute('data-contact') ?? ''))
    const allowed = new Set([...(await drawnKeys()), `person:${THE_PERSON}`])
    const atFirst = theReads(0)
    expect(atFirst.length, 'the dots drawn were read').toBeGreaterThan(0)
    expect(atFirst.flat().filter((one) => !allowed.has(one)), 'a dot nobody draws was read').toEqual([])
    expect(Math.max(...atFirst.map((one) => one.length)), 'one read asked for more dots than are drawn').toBeLessThanOrEqual(allowed.size)

    // THE BYTES, under the bounds above. The long line alone is 22,000 characters, so a row that carried it whole is over.
    const largest = (path: string): number => Math.max(0, ...bytes.filter((one) => one.path === path).map((one) => one.bytes))
    expect(largest(PAGED), 'the contacts answer is over its bound').toBeLessThan(CONTACTS_BYTES_AT_MOST)
    expect(largest('/api/presence'), 'a presence answer is over its bound').toBeLessThan(PRESENCE_BYTES_A_DOT * allowed.size)

    // SCROLLED TO THE END OF THE ROWS DRAWN, the list reads the next page and the group draws the rest of its rows, and
    // their dots are read.
    const from = asked.length
    await app.page.locator('.px-chat-page-lists .px-chat-more-rows').first().scrollIntoViewIfNeeded()
    await expect.poll(async () => Math.max(...(await perGroup())), { timeout: 20_000 }).toBe(AGENTS)
    // THE DOTS OF THE ROWS DRAWN AFTER THE SCROLL are read after the rows arrive; wait for those reads.
    await expect
      .poll(
        async () => {
          const read = theReads(from).flat()
          return (await drawnKeys()).filter((one) => !allowed.has(one)).every((one) => read.includes(one))
        },
        { timeout: 20_000 },
      )
      .toBe(true)
    const nowAllowed = new Set([...(await drawnKeys()), `person:${THE_PERSON}`])
    const newOnes = [...nowAllowed].filter((one) => !allowed.has(one))
    expect(newOnes.length).toBe(AGENTS - Math.max(...drawnAtFirst))
    const later = theReads(from)
    expect(later.flat().filter((one) => !nowAllowed.has(one)), 'a dot nobody draws was read').toEqual([])
    expect(newOnes.filter((one) => !later.flat().includes(one)), 'a row drawn after the scroll had its dot left unread').toEqual([])
  }, 180_000)

})
