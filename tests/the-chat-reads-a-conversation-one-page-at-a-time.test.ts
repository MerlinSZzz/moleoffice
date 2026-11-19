// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT READS A CONVERSATION ONE PAGE AT A TIME, IN A REAL BROWSER.
 *
 * Entering a conversation again reloaded the whole of it, so leaving and coming back was slow. What
 * is proved here, against a real server with a conversation of 120 messages:
 *
 *   1. A FIRST ENTRY asks for one page, `limit=50` with no cursor, and draws fifty messages.
 *   2. A SECOND ENTRY draws what it held at once and asks only for what came after the newest message
 *      held: `after=` and `since=`, never the newest page again.
 *   3. SCROLLING UP asks for the page before the oldest message held, `before=`, draws it above, and
 *      the message the reader was looking at stays where it was on the screen.
 *
 * THREE-RUN PROOF, in the commit message: CONTROL green; a MUTATION of one line for each case red;
 * RESTORE green, checked with cmp.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const AGENT = 'the-paged-agent'
const AS_THE_PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_THE_AGENT: Record<string, string> = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENT }

let app: LiveApp
/** Every conversation read the page asked for since the last call to `askedSince`. */
let asked: string[] = []

async function post(path: string, headers: Record<string, string>, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await res.text()
  expect(res.status, text.slice(0, 300)).toBe(theAnswerToAWriteInATestOffice(headers, body))
  return JSON.parse(text) as Record<string, unknown>
}

beforeAll(async () => {
  app = await liveApp({ name: 'chat-one-page-at-a-time', viewport: { width: 1440, height: 1000 } })
  const made = await post('/api/agents/started', AS_THE_PERSON, { handle: AGENT, name: AGENT, workArea: ['src'] })
  const agentId = String((made['agent'] as { id?: string } | undefined)?.id ?? AGENT)
  for (let i = 0; i < 120; i += 1) {
    if (i % 2 === 0) {
      await post('/api/records', AS_THE_PERSON, { kind: 'message', title: `line ${String(i)}`, data: { body: `Line ${String(i)} from the person.`, to: [{ kind: 'agent', id: agentId }] } })
    } else {
      await post('/api/records', AS_THE_AGENT, { kind: 'message', title: `line ${String(i)}`, data: { body: `Line ${String(i)} from the agent.`, to: [{ kind: 'person', id: THE_PERSON }] } })
    }
  }
  app.page.on('request', (request) => {
    if (request.url().includes('/api/messages/conversation?')) asked.push(request.url())
  })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** The conversation reads asked for since the last call, and start counting again. */
function askedSince(): URLSearchParams[] {
  const out = asked.map((url) => new URL(url).searchParams)
  asked = []
  return out
}

async function openTheContacts(): Promise<void> {
  const page = app.page
  if ((await page.$('.px-chat')) === null) {
    await page.waitForSelector('.px-chat-circle', { timeout: 20_000 })
    await page.click('.px-chat-circle')
  }
  await page.waitForSelector('.px-chat', { timeout: 20_000 })
  const back = await page.$('.px-chat-back')
  if (back !== null) await back.click()
  await page.waitForSelector('.px-chat-contact', { timeout: 20_000 })
}

async function openTheConversation(): Promise<void> {
  const page = app.page
  await page.locator('.px-chat-contact', { hasText: AGENT }).first().click()
  await page.waitForSelector('.px-chat-write textarea', { timeout: 20_000 })
  await page.locator('.px-chat-bubble', { hasText: 'Line 119 from the agent.' }).first().waitFor({ timeout: 20_000 })
}

describe('the chat, with a conversation of 120 messages', () => {
  it('asks a first entry for one page and draws fifty messages', async () => {
    await app.page.goto(`${app.site}/#/`)
    await waitForThePage(app.page, 60_000)
    askedSince()
    await openTheContacts()
    await openTheConversation()
    await app.page.waitForTimeout(500)
    const reads = askedSince()
    expect(reads.length, 'one read of the conversation').toBeGreaterThan(0)
    for (const one of reads) {
      expect(one.get('limit'), 'every read asks for one page').toBe('50')
      expect(one.get('after')).toBeNull()
      expect(one.get('before')).toBeNull()
    }
    expect(await app.page.locator('.px-chat-bubble').count()).toBe(50)
  }, 120_000)

  it('asks a second entry only for what came after the newest message held', async () => {
    await openTheContacts()
    askedSince()
    await openTheConversation()
    await app.page.waitForTimeout(500)
    const reads = askedSince()
    expect(reads.length, 'one read of the conversation').toBeGreaterThan(0)
    for (const one of reads) {
      expect(one.get('after'), 'a second entry asks only for what came after').not.toBeNull()
      expect(one.get('since')).not.toBeNull()
    }
    expect(await app.page.locator('.px-chat-bubble').count()).toBe(50)
  }, 120_000)

  it('reads the page before when the reader scrolls up, and keeps what they were looking at in place', async () => {
    const page = app.page
    askedSince()
    // THE OLDER PAGE IS HELD BACK until the place is measured, so the measurement is taken before it lands.
    let letItThrough: () => void = () => undefined
    const heldBack = new Promise<void>((resolve) => {
      letItThrough = resolve
    })
    await page.route(
      (url) => url.pathname === '/api/messages/conversation' && url.searchParams.has('before'),
      async (route) => {
        await heldBack
        await route.continue()
      },
    )
    const first = page.locator('.px-chat-bubble', { hasText: 'Line 70 from the person.' }).first()
    await page.locator('.px-chat-said').evaluate((list) => {
      list.scrollTop = 0
      list.dispatchEvent(new Event('scroll'))
    })
    await page.waitForTimeout(300)
    const before = (await first.boundingBox())?.y ?? Number.NaN
    letItThrough()
    await page.locator('.px-chat-bubble', { hasText: 'Line 20 from the person.' }).first().waitFor({ state: 'attached', timeout: 20_000 })
    await page.waitForTimeout(300)
    const after = (await first.boundingBox())?.y ?? Number.NaN
    const reads = askedSince()
    expect(reads.some((one) => one.get('before') !== null), 'the page before was asked for').toBe(true)
    expect(await page.locator('.px-chat-bubble').count()).toBe(100)
    expect(Math.abs(after - before), `the message stayed in place: ${String(before)} then ${String(after)}`).toBeLessThanOrEqual(2)
  }, 120_000)
})
