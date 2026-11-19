// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT'S NOTICES ARE BANNERS AT THE TOP, AND NOTHING UNDER THE COMPOSER MOVES IT.
 *
 * A decision on a message says that the notices the chat draws about its own state — the page not being told about new
 * messages, a failed action, a browser that will not keep a draft — are drawn as banners at the top, the way the
 * cannot-reach notice is, and nothing is drawn under the composer that changes where the composer
 * sits.
 *
 * WHAT IS PROVED HERE, in a real browser against a real server:
 *
 *   1. With the page's event stream cut, the connection notice is drawn at the top: above the
 *      messages, above the composer and inside the panel's own top edge.
 *   2. The composer's box is at the same top with the notice showing and with it gone. The stream is
 *      let back in and the notice disappears, and the composer has not moved by even a pixel.
 *   3. Two notices showing at once stack, and the newer one is drawn above the older one.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH THE CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * CONTROL (unmutated): the three cases below pass.
 *
 * MUTATION — the notices drawn under the composer again. `noticeBanners` was moved from the top of
 * the conversation, before the message list, to the end of the panel after the composer. The first
 * case went red on the composer's own measurement: with the notice showing the composer's top was
 * 802.8, and when the notice went it moved to 878.1, a move of 75.3 pixels where the case allows
 * one. The second case also went red, on the notice being drawn below the messages instead of
 * above them.
 *
 * The file was put back byte-identical: sha256
 * 35319fa1bee528b04e184385119120f91bcf285e202b2e3c2cac8211552a2556, and the control run again
 * green.
 *
 * MUTATION — the notices drawn oldest first, run when the case that stacks two notices was made to
 * refuse only the PATCH (wave 13k round 57's fix). `noticeBanners` drew
 * `[...noticesNewestFirst].reverse()`. That case went red on "the older connection notice was drawn
 * on top of the newer fault", after both notices were drawn, and the other two stayed green. The
 * file was put back byte-identical: sha256
 * 7bf19e26c73cb6934eb27510ba4dcc5069cf98be9e699f17ae40c78a6bba7ddf, and the control run again green.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openTheChat } from './open-the-chat.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { CHANNEL_IS_DOWN } from '../src/shared/events.ts'


let app: LiveApp

const AGENT = 'builder-x'
const AGENT_NAME = 'Builder X'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/**
 * The door the participant change a failed action is made of. The route's handler refuses only the change, a
 * PATCH: the page's start reads the office's own registry row through this same door, and a refused start read
 * is a page that never draws (criterion change, wave 13k round 57's fix).
 */
const theParticipantChange = (url: URL): boolean => url.pathname.startsWith('/api/participants/')

/** True while the event stream is cut, so the connection notice stays on the screen. */
let blockTheStream = true

/** Cut the event stream, or let it back in, on the page looking at this world. */
function streamIsBlocked(blocked: boolean): void {
  blockTheStream = blocked
}

beforeAll(async () => {
  app = await liveApp({ name: 'chat-notice-banner', viewport: { width: 1440, height: 1000 } })
  // THE ONE ROUTE, installed once and toggled by the flag, so a route from an earlier case can
  // never linger and shadow the one this case wants.
  await app.page.route('**/api/events*', (route) =>
    blockTheStream ? route.abort() : route.continue(),
  )
  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title: AGENT_NAME, data: { handle: AGENT, runtime: 'claude-code', state: 'active' } }),
  })
  expect(made.status, await made.clone().text()).toBe(201)
  // ONE MESSAGE FROM THE PERSON, so there is a conversation with a composer to open.
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'message',
      title: 'A line to the builder',
      data: { body: 'Are you there?', to: [{ kind: 'agent', id: AGENT }] },
    }),
  })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(said.status, await said.clone().text()).toBe(409)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

beforeEach(async () => {
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  await app.page.unroute(theParticipantChange).catch(() => undefined)
})

/** Open the panel and come back to the contacts, whatever was open last time. */
async function openTheContacts(): Promise<void> {
  // A FRESH DOCUMENT EVERY TIME. Navigating to the same hash does not reload the page, and the
  // channel is a module-level singleton: without this a case would inherit the connection the
  // earlier case let back in and its own cut stream would never be opened.
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/#/`)
  await waitForThePage(app.page, 30_000)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  const back = await app.page.$('.px-chat-back')
  if (back !== null) await back.click()
  await app.page.waitForSelector('.px-chat-contact', { timeout: 20_000 })
}

/** Press the contact row drawn under one name and wait for its conversation. */
async function openTheConversationWith(name: string): Promise<void> {
  await openTheContacts()
  const rows = await app.page.$$('.px-chat-contact')
  for (const row of rows) {
    const said = await row.evaluate((el) => el.textContent ?? '')
    if (said.includes(name)) {
      await row.click()
      await app.page.waitForSelector('.px-chat-write textarea', { timeout: 20_000 })
      return
    }
  }
  throw new Error(`no contact row named ${name}`)
}

/** The composer's top edge, the notices drawn, and where the first notice sits in the flow. */
async function whatIsDrawn(): Promise<{
  composerTop: number
  panelTop: number
  noticeTop: number
  noticeCount: number
  firstNotice: string
  beforeTheMessages: boolean
  beforeTheComposer: boolean
} | null> {
  return app.page.evaluate(() => {
    const panel = document.querySelector('.px-chat')
    const composer = document.querySelector('.px-chat-write')
    const list = document.querySelector('.px-chat-said')
    const notices = [...document.querySelectorAll('.px-chat-notice')]
    if (panel === null || composer === null || list === null || notices.length === 0) return null
    const before = (a: Node, b: Node): boolean =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    return {
      composerTop: composer.getBoundingClientRect().top,
      panelTop: panel.getBoundingClientRect().top,
      noticeTop: notices[0]!.getBoundingClientRect().top,
      noticeCount: notices.length,
      firstNotice: notices[0]!.textContent ?? '',
      beforeTheMessages: before(notices[0]!, list),
      beforeTheComposer: before(notices[0]!, composer),
    }
  })
}

describe('the chat draws its notices as banners at the top', () => {
  it('draws the connection notice above the messages and the composer, and never moves the composer', async () => {
    streamIsBlocked(true)
    try {
      await openTheConversationWith(AGENT_NAME)
      await app.page.waitForSelector('.px-chat-notice', { timeout: 30_000 })

      const withNotice = await whatIsDrawn()
      expect(withNotice, 'the conversation drew no notice, composer or message list').not.toBeNull()
      expect(withNotice?.noticeCount, 'more than the connection notice was drawn').toBe(1)
      expect(withNotice?.firstNotice, 'the notice is not the connection notice').toContain(CHANNEL_IS_DOWN)

      // THE COMPOSER IS WHERE IT IS WITH THE NOTICE AS IT IS WITHOUT ONE. Let the stream back in;
      // the channel reconnects on its own and the notice goes.
      streamIsBlocked(false)
      await app.page.waitForFunction(() => document.querySelector('.px-chat-notice') === null, undefined, {
        timeout: 60_000,
      })
      const withoutNotice = await app.page.evaluate(() => {
        const composer = document.querySelector('.px-chat-write')
        return composer === null ? null : composer.getBoundingClientRect().top
      })
      expect(withoutNotice, 'the composer vanished with the notice').not.toBeNull()
      expect(
        Math.abs((withoutNotice ?? 0) - (withNotice?.composerTop ?? 0)),
        `the composer moved from ${String(withNotice?.composerTop)} to ${String(withoutNotice)} when the notice went`,
      ).toBeLessThanOrEqual(1)

      // AND THE NOTICE IS AT THE TOP, above the messages and above the composer.
      expect(withNotice?.beforeTheMessages, 'the notice is below the messages, not above them').toBe(true)
      expect(withNotice?.beforeTheComposer, 'the notice is below the composer, not above it').toBe(true)
      expect(withNotice?.noticeTop, 'the notice is above the top of the panel').toBeGreaterThanOrEqual(
        withNotice?.panelTop ?? 0,
      )
      expect(withNotice?.noticeTop, 'the notice is not above the composer').toBeLessThan(
        withNotice?.composerTop ?? 0,
      )
    } finally {
      streamIsBlocked(false)
    }
  }, 180_000)

  it('stacks two notices, with the newer one above the older one', async () => {
    streamIsBlocked(true)
    await app.page.route(theParticipantChange, (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'no' }) })
        : route.continue(),
    )
    try {
      await openTheConversationWith(AGENT_NAME)
      await app.page.waitForSelector('.px-chat-notice', { timeout: 30_000 })

      // A FAILED ACTION IS THE NEWER NOTICE. The agent's line is written and the server refuses it. The agent has no
      // line, so since round 102 of wave 13y the heading draws none, and the press that opens its editor is the one
      // beside the agent's name.
      await app.page.click('.px-chat-edit-personal')
      await app.page.waitForSelector('.px-chat-state-edit .px-chat-preset', { timeout: 20_000 })
      await app.page.click('.px-chat-state-edit .px-chat-preset')
      await app.page.waitForFunction(() => document.querySelectorAll('.px-chat-notice').length === 2, undefined, {
        timeout: 30_000,
      })

      const drawn = await whatIsDrawn()
      expect(drawn?.noticeCount, 'the two notices did not stack').toBe(2)
      expect(drawn?.firstNotice, 'the older connection notice was drawn on top of the newer fault').not.toContain(
        CHANNEL_IS_DOWN,
      )
      const all = await app.page.$$eval('.px-chat-notice', (each) => each.map((el) => el.textContent ?? ''))
      expect(all[1], 'the older connection notice is not the second one').toContain(CHANNEL_IS_DOWN)
      expect(drawn?.beforeTheMessages, 'the stacked notices are below the messages').toBe(true)
      expect(drawn?.beforeTheComposer, 'the stacked notices are below the composer').toBe(true)
    } finally {
      streamIsBlocked(false)
      await app.page.unroute(theParticipantChange).catch(() => undefined)
    }
  }, 180_000)
})

