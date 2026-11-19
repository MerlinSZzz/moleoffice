// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * DECISIONS LISTS THE MESSAGES YOU HAVE NOT READ, BESIDE THE DECISIONS, AND EACH ONE OPENS THE CHAT.
 *
 * Question 10 of report n9Mjk3c_sJRu was answered "yes". The width used
 * side by side is under another decision. Task xeqByw_G1JzW.
 *
 * WHICH MESSAGES. No door records whether a message asks a question. The list draws the rows of
 * kind "message" in the asked tier of GET /api/waiting: messages given to the person, not written by
 * them, that they have not read. So "a message that asks nothing" is measured here as the two messages
 * that reading leaves out: one they have read, and one they wrote themselves.
 *
 * WHAT IS MEASURED, in a test office with made-up agents and records:
 *   1. a message waiting on the person is on the list, and is not drawn a second time in the asked band;
 *   2. a message the person has read and a message they wrote are not on the list, and neither is a fork;
 *   3. at 1440 the list stands to the right of the decisions, beside them; at 390 it stands below.
 *      The list's own words are the page language's (?lang=xx marks them), and no id is drawn in
 *      normal mode;
 *   4. a press on the row opens the chat at the conversation with its writer. This case runs last,
 *      because opening the conversation reads the message, and then it leaves the list.
 *
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST:
 *   1. in MessagesYouHaveNotRead.tsx, open the message's own page instead of openTheChatAt → case 4.
 *   2. in src/server/lib/waiting.ts, drop the line that skips a message the person has read → case 2.
 *   3. in GovernancePage.tsx, draw the decisions and the list in a plain div with the class gq-sides
 *      instead of the shared SideBySide element (components/SideBySide.tsx, which since wave 13k's
 *      round 18 holds the switch that was a 56rem container width here) → case 3.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'

import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { RESULT_WILL_BE_USED_TO_KEY } from '../src/shared/sections.ts'

let app: LiveApp
const ids: Record<string, string> = {}

const human = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const agent = (id: string): Record<string, string> => ({ ...human, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<Record<string, any>> {
  const reply = await fetch(`${app.api}${url}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await reply.text()
  expect(reply.status, `${url}: ${text}`).toBe(
    url.startsWith('/api/records') ? theAnswerToAWriteInATestOffice(headers, body) : url.endsWith('/mark') ? 200 : 201,
  )
  return JSON.parse(text) as Record<string, any>
}

const WAITING = 'Should the lamps stay on overnight?'
const WAITING_BODY = 'The lamps in the north room: should they stay on overnight, or go off at ten?'
const READ = 'The paint arrived'
const THEIR_OWN = 'Please order more paint'
const FORK = 'Which reading room opens first'

const LIST = '[data-target="uiSurface/governance.messages"]'
const SETTLE = '[data-target="uiSurface/decisions.waiting"]'
const ASKED = '[data-target="uiSurface/governance.asked"]'

beforeAll(async () => {
  app = await liveApp({ name: 'decisions-messages', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  for (const [handle, name] of [['reed-example', 'Reed Example'], ['quill-sample', 'Quill Sample']]) {
    await post('/api/agents/started', human, { handle, name, role: 'worker' })
  }
  await post('/api/records', agent('reed-example'), {
    kind: 'proposal',
    title: FORK,
    data: {
      question: 'Which reading room opens first?',
      options: ['a — Open the north room.', 'b — Open the south room.'],
      recommendation: 'Take (a).',
      [RESULT_WILL_BE_USED_TO_KEY]: 'Made-up use: choose the room.',
      because: 'Made-up reason.',
      evidence: ['Made-up evidence.'],
      revisit_when: 'Made-up condition.',
      who_settles_it: 'the owner',
    },
  })
  const them = [{ kind: 'person', id: THE_PERSON }]
  ids.waiting = (await post('/api/records', agent('reed-example'), {
    kind: 'message', title: WAITING, data: { body: WAITING_BODY, to: them },
  })).record.id
  ids.read = (await post('/api/records', agent('quill-sample'), {
    kind: 'message', title: READ, data: { body: 'The paint arrived this morning.', to: them },
  })).record.id
  await post(`/api/messages/${ids.read}/mark`, human, { mark: 'seen' })
  ids.theirOwn = (await post('/api/records', human, {
    kind: 'message', title: THEIR_OWN, data: { body: 'Please order two more tins.', to: [{ kind: 'agent', id: 'quill-sample' }] },
  })).record.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function openDecisions(width: number, language = 'en'): Promise<Page> {
  const page = app.page
  await page.setViewportSize({ width, height: 1000 })
  await page.goto(`${app.site}/?lang=${language}#/governance`)
  await waitForThePage(page)
  await page.locator(`${LIST} .da-open`).first().waitFor({ timeout: 15_000 })
  return page
}

it('lists a message waiting on the person, once', async () => {
  const page = await openDecisions(1440)
  const list = page.locator(LIST)
  expect(await list.locator('.da-open').allTextContents()).toEqual([WAITING])
  expect(await list.innerText()).toContain('From Reed Example')
  // DRAWN ONCE: the asked band does not draw it again. Here it held only the message, so it is gone.
  expect(await page.locator(ASKED).count()).toBe(0)
  // NO ID IN NORMAL MODE.
  expect(await list.innerText()).not.toContain(ids.waiting!)
}, 180_000)

it('leaves out a message the person has read, a message the person wrote, and every fork', async () => {
  const page = await openDecisions(1440)
  const drawn = await page.locator(LIST).innerText()
  expect(drawn).not.toContain(READ)
  expect(drawn).not.toContain(THEIR_OWN)
  expect(drawn).not.toContain(FORK)
  // The fork is still on the page, in its own band.
  expect(await page.locator(SETTLE).innerText()).toContain(FORK)
}, 180_000)

it('stands the list beside the decisions at 1440 and below them at 390, in the page language', async () => {
  let page = await openDecisions(1440)
  const decisions = (await page.locator(SETTLE).boundingBox())!
  const list = (await page.locator(LIST).boundingBox())!
  expect(list.x, 'the list starts right of where the decisions end').toBeGreaterThanOrEqual(decisions.x + decisions.width)
  expect(Math.abs(list.y - decisions.y), 'the two start on one line').toBeLessThan(8)

  page = await openDecisions(390)
  const narrowDecisions = (await page.locator(SETTLE).boundingBox())!
  const narrowList = (await page.locator(LIST).boundingBox())!
  expect(narrowList.y).toBeGreaterThanOrEqual(narrowDecisions.y + narrowDecisions.height)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

  // THE TEST LANGUAGE MARKS EVERY WORD THE LIST WROTE; the message's title is content and is not.
  page = await openDecisions(1440, 'xx')
  const heading = await page.locator(`${LIST} .px-panel-title`).innerText()
  const from = await page.locator(`${LIST} .da-from`).innerText()
  expect(heading.startsWith('⟦')).toBe(true)
  expect(from.startsWith('⟦')).toBe(true)
  expect(await page.locator(`${LIST} .da-open`).innerText()).toBe(WAITING)
}, 180_000)

// LAST, BECAUSE OPENING THE CONVERSATION READS THE MESSAGE, and a message the person has read leaves the list.
it('opens the chat at the conversation with its writer when the row is pressed', async () => {
  const page = await openDecisions(1440)
  const list = page.locator(LIST)
  await list.locator('.da-open', { hasText: WAITING }).click()
  const chat = page.locator('.px-chat[data-conversation="open"]')
  await chat.waitFor({ timeout: 15_000 })
  await expect.poll(() => chat.innerText(), { timeout: 15_000 }).toContain(WAITING_BODY)
  expect(await chat.innerText()).toContain('Reed Example')
}, 180_000)

