// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * OPENING A CONVERSATION ON THE CHAT PAGE CLEARS ITS UNREAD DOT, WHEREVER THE DOT IS DRAWN.
 *
 * Problem Dh8uuCXTay1x: the owner opened a conversation on the chat page the sidebar opens, and its
 * red unread dot did not go away. It stayed when the owner went to another page, and went only when the owner
 * entered the chat again.
 *
 * WHAT THIS FILE DOES. In a test office, a made-up agent writes to the person, so one message is
 * unread. The test opens Home, goes to the chat page by its own address (#/chat), and opens that
 * agent's conversation there. A moment later it looks for an unread dot on the chat page: on the
 * contact's row and on the list's tab. Then it presses the sidebar's Home and looks on Home for any
 * unread dot, and for a corner button, which must not be drawn because nothing waits. It fails if
 * any unread dot is still drawn, or if a corner button is drawn with nothing waiting.
 *
 * THE WORLD IS ITS OWN. `liveApp` starts an API on a port of its own with a database of its own;
 * nothing here reaches the owner's server.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': 'default',
}

const WRITER = { name: 'Linnet Agent', handle: 'linnet-agent' }
const UNREAD = 'The kiln reached its set point at noon.'

/** How long "a moment later" is: time for the mark to be written and every count read again. */
const A_MOMENT_MS = 2_000

async function file(headers: Record<string, string>, body: unknown): Promise<string> {
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(made.status, await made.clone().text()).toBe(201)
  return ((await made.json()) as { record: { id: string } }).record.id
}

beforeAll(async () => {
  app = await liveApp({ name: 'chat-unread-dot', viewport: { width: 1440, height: 1000 } })
  // This case exercises the explicit unread-only choice.
  const unreadOnly = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
    method: 'PATCH', headers: AS_THE_OWNER, body: JSON.stringify({ chatButtonStays: 'when-unread' }),
  })
  expect(unreadOnly.status, await unreadOnly.clone().text()).toBe(200)
  await file(AS_THE_OWNER, {
    kind: 'agent',
    title: WRITER.name,
    data: { handle: WRITER.handle, runtime: 'claude-code', state: 'active' },
  })
  await file(
    { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': WRITER.handle },
    { kind: 'message', title: UNREAD, data: { body: UNREAD, to: [{ kind: 'person', id: THE_PERSON }] } },
  )
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

/** Every unread dot drawn anywhere on the screen now, named by where it is. */
async function dotsOnTheScreen(): Promise<string[]> {
  return app.page.evaluate(() =>
    [...document.querySelectorAll('.px-chat-unread')].map((one) => {
      const where = one.closest('.px-chat-contact')
        ? `contact row "${one.closest('.px-chat-contact')?.querySelector('.px-chat-name')?.textContent ?? ''}"`
        : one.closest('.px-chat-tab')
          ? 'list tab'
          : one.closest('.px-chat-circle')
            ? 'corner button'
            : one.closest('.shell-side')
              ? 'sidebar'
              : 'elsewhere'
      return `${where}: ${one.textContent ?? ''}`
    }),
  )
}

describe('an unread conversation opened on the chat page', () => {
  it('has no unread dot a moment later, on the page or on the corner button', async () => {
    const { page } = app
    await page.goto(`${app.site}/#/`)
    await waitForThePage(page, 30_000)
    await page.waitForSelector('.px-chat-circle .px-chat-unread', { timeout: 30_000 })
    const before = await dotsOnTheScreen()

    await page.goto(`${app.site}/#/chat`)
    const onThePage = '.px-chat[data-where="page"]'
    const row = `${onThePage} .px-chat-contact:has(.px-chat-name:text-is("${WRITER.name}"))`
    await page.waitForSelector(`${row} .px-chat-unread`, { timeout: 30_000 })
    const onArriving = await dotsOnTheScreen()
    await page.click(row)
    await page.waitForSelector(`${onThePage} .px-chat-words:has-text("${UNREAD}")`, { timeout: 30_000 })
    await page.waitForTimeout(A_MOMENT_MS)
    const onThePageAfter = await dotsOnTheScreen()

    await page.click('.shell-side a.shell-link[href="#/"]')
    await waitForThePage(page, 30_000)
    await page.waitForTimeout(A_MOMENT_MS)
    const onHomeAfter = await dotsOnTheScreen()
    // DESIGN D DRAWS NO CORNER BUTTON WHEN NOTHING WAITS. The conversation was read, so nothing waits,
    // and a corner button drawn now would be a count that did not fall.
    expect(await page.locator('.px-chat-circle').count(), 'the corner button was drawn with nothing waiting').toBe(0)

    console.log(`on Home before: ${before.join(' | ') || 'no dot'}`)
    console.log(`on the chat page, arriving: ${onArriving.join(' | ') || 'no dot'}`)
    console.log(`on the chat page, a moment after opening: ${onThePageAfter.join(' | ') || 'no dot'}`)
    console.log(`back on Home: ${onHomeAfter.join(' | ') || 'no dot'}`)

    // THE DOT WAS THERE TO BEGIN WITH, on the corner button and on the contact's row, so its absence
    // below is the dot going away and not a dot that was never drawn.
    expect(before.some((one) => one.startsWith('corner button'))).toBe(true)
    expect(onArriving.some((one) => one.startsWith(`contact row "${WRITER.name}"`))).toBe(true)
    expect(onThePageAfter, 'an unread dot is still drawn on the chat page').toEqual([])
    expect(onHomeAfter, 'an unread dot is still drawn back on Home').toEqual([])
  }, 240_000)
})
