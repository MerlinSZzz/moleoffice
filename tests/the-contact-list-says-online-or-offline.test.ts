// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CONTACT LIST SAYS ONLINE OR OFFLINE AND NOTHING ABOUT STARTING A RUN.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS ASKED FOR
 * ---------------------------------------------------------------------------------------
 *
 * Many offline agents in the contacts carried a Start a new run? line, a message noted. The
 * contacts need show only whether an agent is online, and whether to start a new run is shown once
 * its conversation is opened. Criterion M100.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE LIST DREW BEFORE
 * ---------------------------------------------------------------------------------------
 *
 * Measured at commit 4c77b62a: src/web/components/Chat.tsx drew a Start a new agent? press as a
 * sibling of every contact row whose presence mark was grey. A fresh agent record has no attachment
 * open, so its mark is grey — which on the person's list is most of the agents, and the list read as a
 * column of offers rather than as a list of people.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CHECKED
 * ---------------------------------------------------------------------------------------
 *
 * Both halves of the criterion, because only one of them is about deletion. The row draws the
 * presence mark and no offer; the conversation the row opens draws the offer, with the line saying
 * why a run would be needed. A test that only read the row would pass with the offer gone from the
 * product altogether, which is not what was asked for.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CANNOT_REACH_WORDS } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': 'default',
}

async function anAgent(title: string, handle: string): Promise<void> {
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title, data: { handle, runtime: 'claude-code', state: 'active' } }),
  })
  expect(filed.status, await filed.text()).toBe(201)
}

async function say(handle: string, body: string): Promise<void> {
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle },
    body: JSON.stringify({
      kind: 'message',
      title: body.slice(0, 30),
      data: { body, to: [{ kind: 'person', id: THE_PERSON }] },
    }),
  })
  expect(said.status, await said.clone().text()).toBe(201)
}

async function openTheList(): Promise<void> {
  await app.page.goto(app.site)
  await waitForThePage(app.page, 30_000)
  await openTheChat(app.page)
  const back = await app.page.$('.px-chat-back')
  if (back !== null) await back.click()
  await app.page.waitForSelector('.px-chat-contact', { timeout: 20_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'contacts-presence', viewport: { width: 1440, height: 1000 } })
  await anAgent('Offline Agent', 'offline-agent')
  await say('offline-agent', 'Something to make a conversation.')
  // AND A MESSAGE OF THE PERSON'S WAITING FOR IT, because the conversation offers the press only where
  // the press would carry something (problem hqbovBMnTu-z).
  const asked = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'message', title: 'Are you there?', data: { body: 'Are you there?', to: [{ kind: 'agent', id: 'offline-agent' }] } }),
  })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(asked.status, await asked.clone().text()).toBe(409)
}, 180_000)

afterAll(async () => {
  await app.stop()
})

describe('a row says whether somebody is there, and nothing else', () => {
  it('draws the presence mark on an offline agent’s row and no offer to start a run', async () => {
    await openTheList()
    const row = '.px-chat-contact:has(.px-chat-name:text-is("Offline Agent"))'
    await app.page.waitForSelector(row, { timeout: 20_000 })
    // A DRAWN ROW'S READING IS ASKED FOR ONCE THE ROW IS DRAWN (Chat.tsx, `aDotIsDrawn`), so the mark has none for a moment.
    await app.page.waitForSelector(`${row} .px-chat-dot:not([data-colour="none"])`, { timeout: 20_000 })

    // THE MARK IS THERE, and it is small: one dot with its own reading, criterion M20.
    const mark = await app.page.$eval(`${row} .px-chat-dot`, (one) => ({
      colour: one.getAttribute('data-colour'),
      word: one.getAttribute('aria-label'),
      box: one.getBoundingClientRect().width,
    }))
    expect(mark.colour, 'an agent nothing is answering as is not drawn grey').toBe('grey')
    expect(mark.word ?? '', 'the mark carries no word a reader can hear').not.toBe('')
    expect(mark.box, 'the presence mark is not a small mark').toBeLessThan(20)

    // AND NOTHING ABOUT STARTING A RUN, anywhere in the list.
    const offers = await app.page.$$('.px-chat-list .px-start-agent')
    expect(offers.length, 'the contact list offers to start a run').toBe(0)
    const words = await app.page.$$eval('.px-chat-list', (all) => all.map((one) => one.textContent ?? '').join(' '))
    expect(words, 'the contact list still says the words').not.toContain(CANNOT_REACH_WORDS.startANewAgent)
    expect(words).not.toContain(CANNOT_REACH_WORDS.cannotReach('Offline Agent'))
  }, 180_000)

  it('draws the offer inside the conversation the row opens', async () => {
    await openTheList()
    await app.page.click('.px-chat-contact:has(.px-chat-name:text-is("Offline Agent"))')
    await app.page.waitForSelector('.px-chat-cannot-reach', { timeout: 30_000 })

    const line = await app.page.$eval('.px-chat-cannot-reach', (one) => one.textContent ?? '')
    expect(line).toContain(CANNOT_REACH_WORDS.cannotReach('Offline Agent'))
    expect(
      await app.page.$('.px-start-agent[data-where="the conversation"]'),
      'the conversation carries no offer to start a run',
    ).not.toBeNull()
  }, 180_000)
})
