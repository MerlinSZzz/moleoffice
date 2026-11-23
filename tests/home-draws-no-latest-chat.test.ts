// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOME DRAWS NO "LATEST IN THE CHAT" CARD, AND MAKES NO READ FOR ONE.
 *
 * The card came off the top of Home because what it meant was unclear. The
 * card showed the newest direct message and read the whole contact list for it
 * (GET /api/messages/contacts). A closed chat panel reads only GET /api/messages/circle
 * (tests/a-closed-chat-reads-only-its-circle.test.ts), so on Home with the panel closed nothing
 * else asks the contact list.
 *
 * WHAT THIS FILE PROVES, in a real browser against an office of its own. A made-up agent has
 * written to the person, so a card would have something to show. Home then:
 *   1. draws its key items first, and does not show the message's words anywhere on the page;
 *   2. asks GET /api/messages/contacts zero times while the chat panel is closed.
 * THE CONTROLS: the chat panel really is closed, the page did read the circle door (so requests are
 * being counted), and the message really is in the contact list.
 *
 * MUTATION: put `<LatestChat reloadKey={now} />` back at the top of the page in HomePage.tsx, with
 * its file. Both checks go red.
 */

import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'
import { createI18n } from '../src/shared/i18n.ts'

let app: LiveApp
const asked: string[] = []
const SAID = 'The copper kettle is back on the shelf.'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function file(headers: Record<string, string>, body: unknown): Promise<void> {
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(made.status, await made.clone().text()).toBe(201)
}

beforeAll(async () => {
  app = await liveApp({ name: 'home-no-latest', viewport: { width: 1440, height: 1000 } })
  await file(AS_THE_PERSON, { kind: 'agent', title: 'Tobin', data: { handle: 'kettle-tobin', runtime: 'claude-code', state: 'active' } })
  await file(
    { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'kettle-tobin' },
    { kind: 'message', title: 'Kettle', data: { body: SAID, to: [{ kind: 'person', id: THE_PERSON }] } },
  )
  app.page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/api/')) asked.push(url.pathname)
  })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

it('draws no latest-chat card and never reads the contact list', async () => {
  await app.page.goto(`${app.site}/?lang=en#/`)
  await app.page.reload()
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.hp-page [data-home-section="needs"]').waitFor({ timeout: 60_000 })
  await app.page.waitForFunction(
    () => Number(document.querySelector('.px-chat-circle .px-chat-unread')?.textContent ?? '0') > 0,
    undefined,
    { timeout: 30_000 },
  )

  // THE CONTROLS.
  expect(await app.page.$('.px-chat')).toBeNull()
  expect(asked.filter((one) => one === '/api/messages/circle').length, asked.join('\n')).toBeGreaterThan(0)
  const contacts = await fetch(`${app.api}/api/messages/contacts`, { headers: AS_THE_PERSON })
  expect(JSON.stringify(await contacts.json())).toContain(SAID)

  // THE TWO CHECKS ARE SOFT, so a mutation shows each one failing, not only the first.
  // 1. NO CARD.
  expect.soft(await app.page.locator('.hp-page [data-home-section] h2').first().textContent()).toContain(createI18n('en').t('home.keyItems.title'))
  expect.soft(await app.page.locator('.hp-page').innerText()).not.toContain(SAID)

  // 2. NO READ FOR IT.
  expect.soft(asked.filter((one) => one === '/api/messages/contacts').length, asked.join('\n')).toBe(0)
}, 120_000)
