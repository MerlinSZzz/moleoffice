// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT'S CONTACT FILTER FINDS AN AGENT BY ITS HANDLE AS WELL AS BY THE NAME A ROW DRAWS.
 *
 * The agent pickers point asks that every list where a person chooses an agent finds it by its office name or its
 * handle as the person types. The chat's contact list is one of those lists. Its filter box found a row by the name the
 * row draws, and the contact list door found the same rows by the same name, so an agent whose name does not hold its
 * handle could not be found by the handle at all.
 *
 * THE OFFICE. Two made-up agents, each of which wrote one line to the person, so both are contacts on the first page:
 *   - "Made-up Potter", handle `kiln-keeper-7`: its drawn name does not hold "keeper";
 *   - "Made-up Painter", handle `glaze-hand`: neither its name nor its handle holds "keeper".
 *
 * WHAT THIS FILE HOLDS.
 *   1. The door: `GET /api/messages/contact-list?name=keeper` keeps the Potter alone, by its handle. The name still finds
 *      it, and words in neither the name nor the handle find nothing.
 *   2. The chat corner: "keeper" typed in the filter box draws the Potter alone. The corner narrows the rows it holds at
 *      once and asks the door a moment later, so both have to find by the handle for the row to stay drawn.
 *
 * Both read one rule, so the panel and the door cannot find different rows for the same words.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { openTheChatWindow } from './open-the-chat.ts'

let app: LiveApp

const PAGED = '/api/messages/contact-list'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

const POTTER = { handle: 'kiln-keeper-7', name: 'Made-up Potter' }
const PAINTER = { handle: 'glaze-hand', name: 'Made-up Painter' }
/** Words in the Potter's handle and in neither agent's name. */
const HANDLE_WORDS = 'keeper'

const CORNER = ".px-chat[data-where='corner']"
const TOP_ROWS = `${CORNER} .px-chat-group-of ul.px-chat-list > li > .px-chat-contact`
const rowOf = (name: string): string => `${CORNER} .px-chat-contact:has(.px-chat-name:text-is("${name}"))`

let potterId = ''
let painterId = ''

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

async function anAgentWhoWrites(agent: { handle: string; name: string }): Promise<void> {
  await post('/api/records', AS_THE_OWNER, { kind: 'agent', title: agent.name, data: { handle: agent.handle, runtime: 'claude-code', state: 'active' } })
  const body = `Test: a line from ${agent.name}.`
  await post('/api/records', asAgent(agent.handle), { kind: 'message', title: body.slice(0, 30), data: { body, to: [{ kind: 'person', id: THE_PERSON }] } })
}

/** The registry ids of the rows one page of the door keeps for the words typed. */
async function theDoorKeeps(typed: string): Promise<{ ids: (string | undefined)[]; matched: number }> {
  const { status, body } = await get(`${PAGED}?name=${encodeURIComponent(typed)}`)
  expect(status).toBe(200)
  const page = body as { contacts: { who: { id: string } | null }[]; matched: number }
  return { ids: page.contacts.map((row) => row.who?.id), matched: page.matched }
}

/** The names of the rows the corner draws, in order. */
async function theNamesDrawn(): Promise<string[]> {
  return app.page.$$eval(`${CORNER} .px-chat-contact .px-chat-name`, (all) => all.map((one) => (one.textContent ?? '').trim()))
}

/** Home loaded afresh with the corner open, on its contact list. */
async function openTheCorner(page: Page = app.page): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await openTheChatWindow(page)
  if ((await page.$(`${CORNER} .px-chat-back`)) !== null) await page.click(`${CORNER} .px-chat-back`)
  await page.locator(TOP_ROWS).first().waitFor({ state: 'visible', timeout: 30_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'contact-filter-by-handle', viewport: { width: 1440, height: 1000 } })
  await anAgentWhoWrites(POTTER)
  await anAgentWhoWrites(PAINTER)
  const registry = (await get('/api/participants')).body as { agents: { id: string; handle: string }[] }
  potterId = registry.agents.find((one) => one.handle === POTTER.handle)?.id ?? ''
  painterId = registry.agents.find((one) => one.handle === PAINTER.handle)?.id ?? ''
  expect(potterId, 'the fixture: the Potter is registered').not.toBe('')
  expect(painterId, 'the fixture: the Painter is registered').not.toBe('')
  expect(POTTER.name.toLowerCase(), 'the fixture: the Potter’s name holds the handle words').not.toContain(HANDLE_WORDS)
  expect(PAINTER.name.toLowerCase(), 'the fixture: the Painter’s name holds the handle words').not.toContain(HANDLE_WORDS)
  expect(PAINTER.handle, 'the fixture: the Painter’s handle holds the handle words').not.toContain(HANDLE_WORDS)
  await app.page.addInitScript(() => {
    localStorage.setItem('mole-office.chat.open', 'yes')
  })
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

describe('the contact list door', () => {
  it('keeps the agent whose handle holds the words typed, though its name does not', async () => {
    const byHandle = await theDoorKeeps(HANDLE_WORDS)
    expect(byHandle.ids, 'the door did not find the agent by its handle').toEqual([potterId])
    expect(byHandle.matched).toBe(1)
  }, 60_000)

  it('still keeps a row by its name, and keeps nothing for words in neither', async () => {
    expect((await theDoorKeeps('potter')).ids).toEqual([potterId])
    expect((await theDoorKeeps('painter')).ids).toEqual([painterId])
    const neither = await theDoorKeeps('no-such-words')
    expect(neither.ids).toEqual([])
    expect(neither.matched).toBe(0)
  }, 60_000)
})

describe('the chat corner', () => {
  it('draws the agent whose handle holds the words typed in the filter box, and no other', async () => {
    await openTheCorner()
    await app.page.waitForSelector(rowOf(PAINTER.name), { timeout: 15_000 })
    const asked = app.page.waitForResponse(
      (answer) => new URL(answer.url()).pathname === PAGED && new URL(answer.url()).searchParams.get('name') === HANDLE_WORDS,
      { timeout: 15_000 },
    )
    await app.page.fill(`${CORNER} .px-chat-filter`, HANDLE_WORDS)
    await expect.poll(theNamesDrawn, { timeout: 15_000 }).toEqual([POTTER.name])
    // IT STAYS DRAWN once the door has answered for the same words, which a filter by name alone would hide again.
    await asked
    await expect.poll(theNamesDrawn, { timeout: 15_000 }).toEqual([POTTER.name])
    await app.page.waitForTimeout(500)
    expect(await theNamesDrawn(), 'the row found by its handle was not kept').toEqual([POTTER.name])
    await app.page.fill(`${CORNER} .px-chat-filter`, '')
    await app.page.waitForSelector(rowOf(PAINTER.name), { timeout: 15_000 })
  }, 120_000)
})
