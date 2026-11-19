// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT CORNER READS ITS CONTACTS A PAGE AT A TIME, AND STILL FINDS, DRAWS AND NAMES THE ONES FURTHER DOWN.
 *
 * Round 20 of wave 13u, on a decision: the chat corner reads the first screen of contacts and their presence, and
 * more as the person scrolls, instead of the whole list. `GET /api/messages/contact-list`
 * answers one page of the list in the order it is drawn, 25 rows to a page when nothing else is asked, with how
 * many are left.
 *
 * THE OFFICE. Twenty-eight made-up agents. Three of them wrote or were written to first, so they are the last rows of
 * the list and on no first page:
 *   - Far Kiln wrote once, in the project Test: Far Shore, and is the only contact there;
 *   - Far Glaze was written to by the person, and nothing is answering as it, so its conversation draws the
 *     "Cannot reach" bar and the line under the waiting message;
 *   - Far Lamp wrote to the person, and its dot is the one whose presence changes.
 * Then twenty-five more agents each wrote one line to the person, filling the first page of 25 so the three far
 * rows need a second page.
 *
 * WHAT THIS FILE HOLDS.
 *   1. The door: 25 rows by default, how many are left and the request for the next page; the pages read one after
 *      another hold every row of `GET /api/messages/contacts` once; a page of 1000 at most; an unknown parameter
 *      refused; ?name= and ?project= find a row that is on no first page.
 *   2. The corner: its first read asks for 25 rows or fewer and never reads the whole list; it draws 25 rows on top;
 *      the three far rows are not drawn.
 *   3. The filter box finds Far Kiln, which the corner has not read, by asking the door; so does the project picker.
 *   4. Scrolled down, the corner reads the next pages until Far Lamp is drawn. Its dot follows a change of its
 *      presence, which the server sends as `presence.changed`; in the seconds before, nothing read its dot again.
 *   5. Found by the filter box and opened, Far Glaze's conversation names Far Glaze in the "Cannot reach" bar, and the
 *      line under the waiting message names its handle.
 *
 * WHAT MAKES IT RED (control first, then each mutation, then the restore; logs in the commit message):
 *   - `howManyToReadAgain` in src/web/lib/the-contact-list-held.ts answering `CONTACT_LIST_MOST`, which is the corner
 *     reading the whole list again: cases 2, 3 and 4, and tests/the-chat-reads-only-the-rows-and-dots-it-draws.test.ts.
 *   - `api.contactList` in src/web/api.ts not sending the words typed: case 3. Case 5 still passes, because the corner
 *     keeps the rows it read between loads (`CHAT_KEPT` in Chat.tsx), and case 4 scrolled Far Glaze in.
 *
 * THE PICTURES, with CORNER_SHOTS=1 and TEST_SHOTS naming a folder to keep them: the corner on Home at 1440, 990, 660
 * and 390 pixels wide, in light and dark, at its first screen and after a scroll has read the next page. Each pair is
 * taken in a browser context of its own, so nothing the corner kept from an earlier load is on the first screen.
 */
import type { Page } from 'playwright'
import { t } from '../src/shared/i18n.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CANNOT_REACH_WORDS } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { openTheChatWindow } from './open-the-chat.ts'

let app: LiveApp

/**
 * The rows on top in one page of the contact list when nothing else is asked. A decision fixed this
 * number.
 */
const A_PAGE = 25
const MORE_AGENTS = 25
const PROJECT = 'far-shore'
const PAGED = '/api/messages/contact-list'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string, project = 'default'): Record<string, string> => ({
  ...AS_THE_OWNER,
  'x-mole-office-workspace': project,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

const CORNER = ".px-chat[data-where='corner']"
const TOP_ROWS = `${CORNER} .px-chat-group-of ul.px-chat-list > li > .px-chat-contact`
const rowOf = (name: string): string => `${CORNER} .px-chat-contact:has(.px-chat-name:text-is("${name}"))`

let lampId = ''
let kilnId = ''
const asked: URL[] = []

async function post(path: string, headers: Record<string, string>, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await res.text()
  if (path === '/api/records' && theAnswerToAWriteInATestOffice(headers, body) === 409) expect(res.status, `${path}: ${text}`).toBe(409)
  else expect(res.status, `${path}: ${text}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, unknown>
}

async function get(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${app.api}${path}`, { headers: AS_THE_OWNER })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

async function anAgent(handle: string, title: string): Promise<void> {
  await post('/api/records', AS_THE_OWNER, { kind: 'agent', title, data: { handle, runtime: 'claude-code', state: 'active' } })
}

async function says(handle: string, body: string, project = 'default'): Promise<void> {
  await post('/api/records', asAgent(handle, project), { kind: 'message', title: body.slice(0, 30), data: { body, to: [{ kind: 'person', id: THE_PERSON }] } })
}

/** The names of the rows the corner draws, in order. */
async function theNamesDrawn(): Promise<string[]> {
  return app.page.$$eval(`${CORNER} .px-chat-contact .px-chat-name`, (all) => all.map((one) => (one.textContent ?? '').trim()))
}

/** The reads of the paged door the page asked from `from` on. */
const pagedReads = (from = 0): URL[] => asked.slice(from).filter((one) => one.pathname === PAGED)

/** What the door says Far Lamp's dot is called, as the person is told it. */
async function theLampsWord(): Promise<string> {
  const { body } = await get(`/api/presence?of=${encodeURIComponent(`agent:${lampId}`)}`)
  return (body['presence'] as { word: string }[])[0]?.word ?? 'none'
}

/** Home loaded afresh with the corner open. A blank page first, because a move to the same address with a hash would
 *  not load the page again, and the corner would keep what the case before typed in its filter box. */
async function openTheCorner(page: Page = app.page): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await openTheChatWindow(page)
  if ((await page.$(`${CORNER} .px-chat-back`)) !== null) await page.click(`${CORNER} .px-chat-back`)
  await page.locator(TOP_ROWS).first().waitFor({ state: 'visible', timeout: 30_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'chat-corner-pages', viewport: { width: 1440, height: 1000 } })
  await post('/api/workspaces', AS_THE_OWNER, { id: PROJECT, title: 'Test: Far Shore' })
  await anAgent('far-kiln', 'Far Kiln')
  await anAgent('far-glaze', 'Far Glaze')
  await anAgent('far-lamp', 'Far Lamp')
  await post('/api/records', { ...AS_THE_OWNER, 'x-mole-office-workspace': PROJECT }, {
    kind: 'agent', title: 'Far Kiln', data: { handle: 'far-kiln', runtime: 'claude-code', state: 'active' },
  })
  await says('far-kiln', 'Test: the kiln is cooling.', PROJECT)
  await post('/api/records', AS_THE_OWNER, { kind: 'message', title: 'Is the glaze dry?', data: { body: 'Is the glaze dry?', to: [{ kind: 'agent', id: 'far-glaze' }] } })
  await says('far-lamp', 'Test: the lamp is lit.')
  for (let n = 0; n < MORE_AGENTS; n++) {
    const handle = `near-${String(n).padStart(2, '0')}`
    await anAgent(handle, `Near ${String(n).padStart(2, '0')}`)
    await says(handle, `Test: a line from ${handle}.`)
  }
  const registry = (await get('/api/participants')).body as { agents: { id: string; handle: string }[] }
  lampId = registry.agents.find((one) => one.handle === 'far-lamp')?.id ?? ''
  kilnId = registry.agents.find((one) => one.handle === 'far-kiln')?.id ?? ''
  expect(lampId, 'the fixture: Far Lamp is registered').not.toBe('')
  expect(kilnId, 'the fixture: Far Kiln is registered').not.toBe('')
  app.page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/api/')) asked.push(url)
  })
  await app.page.addInitScript(() => {
    localStorage.setItem('mole-office.chat.open', 'yes')
  })
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

describe('the paged door', () => {
  it('answers 25 rows, how many are left and the next page, and its pages hold every row once', async () => {
    const whole = (await get('/api/messages/contacts')).body as { contacts: { key: string }[] }
    const first = await get(PAGED)
    expect(first.status).toBe(200)
    const one = first.body as { contacts: { key: string }[]; folded: { key: string }[]; returned: number; left: number; matched: number; total: number; next: string | null }
    expect(one.contacts).toHaveLength(A_PAGE)
    expect(one.returned).toBe(A_PAGE)
    expect(one.total).toBe(whole.contacts.length)
    expect(one.left).toBe(one.matched - A_PAGE)
    expect(one.left).toBeGreaterThan(0)
    expect(one.next).toBe(`GET ${PAGED}?offset=${String(A_PAGE)}`)

    const rest = await get(`${PAGED}?offset=${String(A_PAGE)}&limit=1000`)
    expect(rest.status).toBe(200)
    const two = rest.body as typeof one
    expect(two.left).toBe(0)
    expect(two.next).toBeNull()
    const keys = [...one.contacts, ...one.folded, ...two.contacts, ...two.folded].map((row) => row.key)
    expect(new Set(keys).size, 'a row came on two pages').toBe(keys.length)
    expect([...keys].sort()).toEqual(whole.contacts.map((row) => row.key).sort())
  }, 60_000)

  it('refuses a page over 1000, and a parameter it does not know', async () => {
    expect((await get(`${PAGED}?limit=1000`)).status).toBe(200)
    expect((await get(`${PAGED}?limit=1001`)).status).toBe(400)
    expect((await get(`${PAGED}?limit=0`)).status).toBe(400)
    expect((await get(`${PAGED}?shape=page`)).status).toBe(400)
    expect((await get(`${PAGED}?name=${'x'.repeat(201)}`)).status).toBe(400)
  }, 60_000)

  it('finds a row on no first page by its name, and by its project', async () => {
    const named = (await get(`${PAGED}?name=kiln`)).body as { contacts: { who: { id: string } | null }[]; matched: number; name: string | null }
    expect(named.name).toBe('kiln')
    expect(named.matched).toBe(1)
    expect(named.contacts.map((row) => row.who?.id)).toEqual([kilnId])
    const placed = (await get(`${PAGED}?project=${PROJECT}`)).body as { contacts: { who: { id: string } | null }[]; inTheProject: number }
    expect(placed.inTheProject).toBe(1)
    expect(placed.contacts.map((row) => row.who?.id)).toEqual([kilnId])
  }, 60_000)
})

describe('the chat corner', () => {
  it('reads one page of 25 rows at first, and draws them', async () => {
    const from = asked.length
    await openTheCorner()
    await expect.poll(async () => app.page.locator(TOP_ROWS).count(), { timeout: 15_000 }).toBe(A_PAGE)
    const reads = pagedReads(from)
    expect(reads.length, 'the corner did not read the paged door').toBeGreaterThan(0)
    expect(reads.map((one) => Number(one.searchParams.get('limit') ?? A_PAGE)).filter((limit) => limit > A_PAGE), 'the corner read more than one page').toEqual([])
    expect(asked.slice(from).filter((one) => one.pathname === '/api/messages/contacts').map(String), 'the corner read the whole list').toEqual([])
    expect(await app.page.locator(TOP_ROWS).count()).toBe(A_PAGE)
    expect(await app.page.locator(`${CORNER} .px-chat-more-rows`).count(), 'nothing offers the rest of the list').toBe(1)
    const names = await theNamesDrawn()
    expect(names.filter((one) => one.startsWith('Far '))).toEqual([])
  }, 120_000)

  it('finds a contact it has not read with the filter box, by asking the door', async () => {
    await openTheCorner()
    const from = asked.length
    await app.page.fill(`${CORNER} .px-chat-filter`, 'kiln')
    await app.page.waitForSelector(rowOf('Far Kiln'), { timeout: 15_000 })
    expect(pagedReads(from).map((one) => one.searchParams.get('name'))).toContain('kiln')
    expect(await theNamesDrawn()).toEqual(['Far Kiln'])
    await app.page.fill(`${CORNER} .px-chat-filter`, '')
    await expect.poll(async () => app.page.locator(TOP_ROWS).count(), { timeout: 15_000 }).toBe(A_PAGE)
  }, 120_000)

  it('finds a contact it has not read with the project picker', async () => {
    await openTheCorner()
    await app.page.waitForSelector(`${CORNER} .px-chat-project-filter option[value="${PROJECT}"]`, { state: 'attached', timeout: 20_000 })
    const from = asked.length
    try {
      await app.page.selectOption(`${CORNER} .px-chat-project-filter`, PROJECT)
      await app.page.waitForSelector(rowOf('Far Kiln'), { timeout: 15_000 })
      expect(pagedReads(from).map((one) => one.searchParams.get('project'))).toContain(PROJECT)
      expect(await theNamesDrawn()).toEqual(['Far Kiln'])
    } finally {
      await app.page.selectOption(`${CORNER} .px-chat-project-filter`, '')
    }
    await expect.poll(async () => app.page.locator(TOP_ROWS).count(), { timeout: 15_000 }).toBe(A_PAGE)
  }, 120_000)

  it('reads more as it is scrolled, and a dot drawn then follows presence.changed with no read of its own', async () => {
    await openTheCorner()
    const from = asked.length
    for (let turn = 0; turn < 6 && (await app.page.$(rowOf('Far Lamp'))) === null; turn += 1) {
      const held = await app.page.locator(TOP_ROWS).count()
      await app.page.locator(`${CORNER} .px-chat-more-rows`).first().scrollIntoViewIfNeeded()
      await expect
        .poll(async () => (await app.page.$(rowOf('Far Lamp'))) !== null || (await app.page.locator(TOP_ROWS).count()) > held, { timeout: 15_000 })
        .toBe(true)
    }
    await app.page.waitForSelector(rowOf('Far Lamp'), { timeout: 15_000 })
    const offsets = pagedReads(from).map((one) => Number(one.searchParams.get('offset')))
    expect(offsets.filter((offset) => offset > 0).length, 'the corner drew Far Lamp without reading a next page').toBeGreaterThan(0)
    expect(asked.slice(from).filter((one) => one.pathname === '/api/messages/contacts').map(String), 'the corner read the whole list').toEqual([])

    // THE DOT IS READ ONCE IT IS DRAWN, and then nothing reads it again until something changes.
    const dot = `${rowOf('Far Lamp')} .px-chat-dot`
    await app.page.waitForSelector(`${dot}:not([data-colour="none"])`, { timeout: 15_000 })
    const before = await theLampsWord()
    expect(await app.page.getAttribute(dot, 'aria-label')).toBe(before)
    const quiet = asked.length
    await app.page.waitForTimeout(2_000)
    const namesTheLamp = (url: URL): boolean => url.pathname === '/api/presence' && (url.searchParams.get('of') ?? '').split(',').includes(`agent:${lampId}`)
    expect(asked.slice(quiet).filter(namesTheLamp).map(String), 'the corner read the dot again with nothing changed').toEqual([])

    // FAR LAMP OPENS A STREAM, which changes what its dot says; the server sends `presence.changed`.
    const stop = new AbortController()
    const stream = await fetch(`${app.api}/api/events`, { headers: { ...asAgent('far-lamp'), accept: 'text/event-stream' }, signal: stop.signal })
    expect(stream.status).toBe(200)
    try {
      await expect.poll(theLampsWord, { timeout: 10_000 }).not.toBe(before)
      const after = await theLampsWord()
      await expect.poll(async () => app.page.getAttribute(dot, 'aria-label'), { timeout: 15_000 }).toBe(after)
    } finally {
      stop.abort()
    }
  }, 180_000)

  it('names the agent a conversation found by the filter box is with, in the "Cannot reach" bar and the waiting line', async () => {
    await openTheCorner()
    await app.page.fill(`${CORNER} .px-chat-filter`, 'glaze')
    await app.page.waitForSelector(rowOf('Far Glaze'), { timeout: 15_000 })
    await app.page.click(rowOf('Far Glaze'))
    await app.page.waitForSelector(`${CORNER} .px-chat-cannot-reach`, { timeout: 30_000 })
    expect(await app.page.textContent(`${CORNER} .px-chat-cannot-reach`)).toContain(CANNOT_REACH_WORDS.cannotReach('Far Glaze'))
    // ROUND 168: the long nobody-answering sentence is behind the short mark now, so the waiting line
    // says only that the message was not delivered.
    await app.page.waitForSelector(`${CORNER} .px-chat-not-delivered`, { timeout: 15_000 })
    expect((await app.page.textContent(`${CORNER} .px-chat-not-delivered`))?.trim()).toBe(t('chat.notDelivered'))
    expect(await app.page.locator(`${CORNER} .px-chat-next`).count(), 'the long sentence is still drawn').toBe(0)
    await app.page.click(`${CORNER} .px-chat-back`)
    await app.page.fill(`${CORNER} .px-chat-filter`, '')
  }, 120_000)

})
