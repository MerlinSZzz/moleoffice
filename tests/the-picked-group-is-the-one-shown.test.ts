// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AFTER A GROUP'S MESSAGES ARE SHOWN, THE CONVERSATION THE PERSON PICKS IS THE ONE SHOWN.
 *
 * The chat holds the open group's reply apart from which group is picked. Until this file, picking a second group
 * kept the first group's reply on screen, under the second group's pick, until the second one's read answered: its
 * name in the header, its members' faces and its messages. And a read of a group answered whenever it answered, so a
 * read of the first group that landed after the second one's drew the first group again, with the second one picked.
 *
 * WHAT THIS FILE HOLDS, on the chat page at 1440, where the list and the conversation stand side by side:
 *   1. The first group is opened and its messages are shown.
 *   2. The second group is picked while the test holds its read at the door. The header names the second group, and
 *      nothing of the first group is shown: not its name and not its messages.
 *   3. The read is let through. The second group's name and its messages are shown, and the first group's are not.
 *
 * WHAT MAKES IT RED: on the old code, case 2 finds the first group's name in the header and its words in the
 * conversation, because the view draws the reply it holds whichever group is picked.
 *
 * Every row here is made up, in this file's own test office from `liveApp` in tests/helpers.ts.
 */
import type { Route } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp

const AS_THE_OWNER: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AGENT = 'picked-group-agent'
const AS_THE_AGENT: Record<string, string> = { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENT }

const FIRST = { name: 'Test: the group opened first', words: 'Words said only in the group opened first.', id: '' }
const SECOND = { name: 'Test: the group picked second', words: 'Words said only in the group picked second.', id: '' }

/**
 * THE SECOND GROUP'S READ. While `held` is set, a read of that one group waits at its door until the test lets it
 * through. `arrived` counts the reads of it that reached the door.
 */
const door = { held: null as Promise<void> | null, release: () => {}, arrived: 0 }

function holdTheDoor(): void {
  door.held = new Promise<void>((resolve) => {
    door.release = () => {
      door.held = null
      resolve()
    }
  })
}

async function atTheSecondGroupsDoor(route: Route): Promise<void> {
  if (route.request().method() !== 'GET') return route.continue()
  door.arrived += 1
  if (door.held !== null) await door.held
  return route.continue()
}

async function aGroup(name: string): Promise<string> {
  const made = await fetch(`${app.api}/api/groups`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      name,
      because: 'Test: a group to pick in the chat.',
      members: [
        { who: { kind: 'person', id: THE_PERSON }, because: 'Test: the person reads it.' },
        { who: { kind: 'agent', id: AGENT }, because: 'Test: the agent writes in it.' },
      ],
    }),
  })
  expect(made.status, await made.clone().text()).toBe(201)
  return ((await made.json()) as { group: { id: string } }).group.id
}

async function sayInTheGroup(group: string, body: string): Promise<void> {
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_AGENT,
    body: JSON.stringify({ kind: 'message', title: body.slice(0, 30), data: { body, toGroup: group } }),
  })
  expect(said.status, await said.clone().text()).toBe(201)
}

/** What the conversation side of the page shows: the name in its header, and the words of every message drawn. */
async function whatIsShown(): Promise<{ name: string; words: string[] }> {
  return app.page.$eval('.px-chat-page-talk', (talk) => ({
    name: talk.querySelector('.px-chat-them .px-chat-name')?.textContent ?? '',
    words: [...talk.querySelectorAll('.px-chat-words')].map((one) => one.textContent ?? ''),
  }))
}

const theGroupRow = (name: string) => app.page.locator('.px-chat-page-lists .px-chat-contact', { hasText: name })

beforeAll(async () => {
  app = await liveApp({ name: 'picked-group-shown', viewport: { width: 1440, height: 1000 } })
  const agent = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title: 'Test Picked Agent', data: { handle: AGENT, runtime: 'claude-code', state: 'active' } }),
  })
  expect(agent.status, await agent.clone().text()).toBe(201)
  FIRST.id = await aGroup(FIRST.name)
  SECOND.id = await aGroup(SECOND.name)
  await sayInTheGroup(FIRST.id, FIRST.words)
  await sayInTheGroup(SECOND.id, SECOND.words)
  await app.page.route(`**/api/groups/${SECOND.id}`, atTheSecondGroupsDoor)
}, 240_000)

afterAll(async () => {
  door.release()
  await app?.stop()
})

describe('after a group is shown, the conversation picked next', () => {
  it('is the one shown, and the first group is not drawn under it', async () => {
    await app.page.goto(`${app.site}/?lang=en#/chat`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await app.page.click('.px-chat-page-lists .px-chat-tab[data-tab="groups"]')

    // 1. THE FIRST GROUP IS OPENED, AND ITS MESSAGES ARE SHOWN.
    await theGroupRow(FIRST.name).click()
    await expect.poll(async () => (await whatIsShown()).words.some((one) => one.includes(FIRST.words)), { timeout: 30_000 }).toBe(true)
    expect((await whatIsShown()).name).toBe(FIRST.name)
    await waitForThePage(app.page, 60_000)

    // 2. THE SECOND GROUP IS PICKED WHILE ITS READ IS HELD. Nothing of the first group is shown under it.
    holdTheDoor()
    const before = door.arrived
    await theGroupRow(SECOND.name).click()
    await expect.poll(() => door.arrived, { timeout: 30_000 }).toBeGreaterThan(before)
    // A FRAME OR TWO FOR THE PICK TO BE DRAWN, so a view that keeps the first group has drawn it by now.
    await app.page.waitForTimeout(500)
    const whileHeld = await whatIsShown()
    expect(whileHeld.name, 'the header names the group picked, while its read is out').toBe(SECOND.name)
    expect(whileHeld.words.filter((one) => one.includes(FIRST.words)), 'the first group\'s messages are shown under the second pick').toEqual([])

    // 3. THE READ IS LET THROUGH. The second group is shown, and the first is not.
    door.release()
    await expect.poll(async () => (await whatIsShown()).words.some((one) => one.includes(SECOND.words)), { timeout: 30_000 }).toBe(true)
    await waitForThePage(app.page, 60_000)
    const shown = await whatIsShown()
    expect(shown.name).toBe(SECOND.name)
    expect(shown.words.filter((one) => one.includes(FIRST.words))).toEqual([])
  }, 180_000)
})
