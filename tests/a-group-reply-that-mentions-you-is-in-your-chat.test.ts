// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * GM2: A GROUP REPLY THAT @S THE PERSON IS IN THEIR OWN CHAT, WITH THE GROUP SAID.
 *
 * On 23 September 2026, criterion GM2 of a decision: a reply in a group that @s the person stays in
 * the group and also appears in the person's own chat with its sender, drawn with one short line
 * saying which group it came from, and pressing that line opens the group at that message. It is
 * one record and not a copy.
 *
 * WHY A BROWSER. The two halves that matter are the panel's own drawing and the press it carries:
 * the line's words, and the group opening at the row the line names. Neither is visible to a server
 * test. The server half — that the one record is in both reads — is measured in
 * tests/a-group-mention-decides-who-is-told.test.ts.
 *
 * THE PICTURES ARE GATED, like every other photographing case here: run it with SF_MENTION_SHOTS set
 * to the directory the pictures go in. It looks at the line in the person's chat at 1440, 990, 660
 * and 390 in both themes.
 *
 * WHAT WOULD MAKE THE MAIN CASE GO RED: dropping the group part of `aGroupReplyThatMentionsTheOtherSide`
 * in src/server/lib/messages.ts, so the reply is not in the chat at all; or dropping the message id
 * from `openTheChatAtGroup`, so the group opens at its newest line and not at the reply.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp
let groupId = ''
let theReplyId = ''
/** The agent's registry id, which the chat keys its contact by. It is not the handle. */
let agentId = ''
const GROUP_NAME = 'The mount group'
const AGENT_HANDLE = 'builder-mention'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_THE_AGENT = {
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': AGENT_HANDLE,
}

beforeAll(async () => {
  app = await liveApp({ name: 'group-reply-in-chat', viewport: { width: 1440, height: 1000 } })

  const agent = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Builder Mention',
      data: { handle: AGENT_HANDLE, runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(agent.status, `creating the agent: ${await agent.clone().text()}`).toBe(201)
  const registry = (await (await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })).json()) as {
    agents: { id: string; handle: string }[]
  }
  agentId = registry.agents.find((one) => one.handle === AGENT_HANDLE)?.id ?? ''
  expect(agentId, 'the registry does not list the agent').not.toBe('')

  const group = await fetch(`${app.api}/api/groups`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      name: GROUP_NAME,
      because: 'A group reply that @s the owner has to reach the owner’s own chat.',
      members: [
        { who: { kind: 'person', id: THE_PERSON }, because: 'the owner is in it' },
        { who: { kind: 'agent', id: AGENT_HANDLE }, because: 'it is doing the work' },
      ],
    }),
  })
  expect(group.status, `creating the group: ${await group.clone().text()}`).toBe(201)
  groupId = ((await group.json()) as { group: { id: string } }).group.id

  // THE REPLY THAT @S THE PERSON, written by the agent in the group.
  const reply = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_AGENT,
    body: JSON.stringify({
      kind: 'message',
      title: 'The mount is printed',
      data: { body: `@${THE_TEST_OFFICES_OWNER.name} the mount is printed.`, toGroup: groupId },
    }),
  })
  expect(reply.status, `creating the group reply: ${await reply.clone().text()}`).toBe(201)
  theReplyId = ((await reply.json()) as { record: { id: string } }).record.id
}, 300_000)

afterAll(async () => {
  await app.stop()
}, 120_000)

/** Open the panel and the person's conversation with the agent. */
async function openTheirChatWithTheAgent(): Promise<void> {
  await app.page.goto(`${app.site}/#/`)
  await waitForThePage(app.page, 30_000)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  const back = await app.page.$('.px-chat-back')
  if (back !== null) await back.click()
  await app.page.waitForSelector(`.px-chat-contact[data-contact="agent:${agentId}"]`, { timeout: 20_000 })
  await app.page.click(`.px-chat-contact[data-contact="agent:${agentId}"]`)
  await app.page.waitForSelector('.px-chat-said', { timeout: 20_000 })
}

describe('GM2: a group reply that @s the person', () => {
  it('is drawn in the owner’s chat with the group line, and the line opens the group at that message', async () => {
    await openTheirChatWithTheAgent()

    // THE GROUP LINE, NAMING THE GROUP THE REPLY CAME FROM.
    const line = app.page.locator('button.px-chat-from-group')
    await line.waitFor({ state: 'visible', timeout: 20_000 })
    expect(await line.textContent(), 'the line does not name the group').toContain(GROUP_NAME)

    // AND THE SAME ONE RECORD'S WORDS ARE DRAWN UNDER IT.
    const words = await app.page.locator('.px-chat-said .px-chat-words').allTextContents()
    expect(words.some((one) => one.includes(`@${THE_TEST_OFFICES_OWNER.name} the mount is printed.`)), 'the reply is not in the chat').toBe(true)

    // PRESSING IT OPENS THE GROUP, at the message the line names.
    await line.click()
    await app.page
      .locator('.px-chat-them .px-chat-name')
      .filter({ hasText: GROUP_NAME })
      .waitFor({ state: 'visible', timeout: 20_000 })
    const row = app.page.locator(`li[data-message-id="${theReplyId}"]`)
    await row.waitFor({ state: 'visible', timeout: 20_000 })
    const insideTheList = await app.page.evaluate((id) => {
      const list = document.querySelector('.px-chat-said')
      const said = document.querySelector(`li[data-message-id="${id}"]`)
      if (list === null || said === null) return false
      const around = list.getBoundingClientRect()
      const rowBox = said.getBoundingClientRect()
      return rowBox.bottom > around.top && rowBox.top < around.bottom
    }, theReplyId)
    expect(insideTheList, 'the group did not open at the message it was asked for').toBe(true)
  }, 120_000)
})

/**
 * GM4: THE ONE DOOR AN AGENT THAT WAS NOT @'d READS.
 *
 * A group message that @s members reaches only them, and every other member learns what was said by
 * asking this door. The exact read-point arithmetic is measured in
 * tests/a-group-mention-decides-who-is-told.test.ts; this proves the route is served and answers
 * the asking agent about the group it belongs to.
 */
describe('GM4: the door that lists what a group gained', () => {
  it('answers the agent with the group it belongs to and the reply it holds', async () => {
    const answer = await fetch(`${app.api}/api/messages/groups`, { headers: AS_THE_AGENT })
    expect(answer.status, await answer.clone().text()).toBe(200)
    const listed = (await answer.json()) as {
      groups: { group: { id: string }; messages: { id: string }[] }[]
    }
    const mine = listed.groups.find((one) => one.group.id === groupId)
    expect(mine, 'the agent is not in the group it belongs to').toBeDefined()
    expect(mine?.messages.map((one) => one.id)).toContain(theReplyId)
  }, 60_000)
})

/**
 * THE LINE, LOOKED AT — chapter 6: four widths, both themes.
 *
 * A short line that reads cleanly at 1440 is where a phone shows the reader something broken. The
 * panel is opened on the person's chat with the agent, where the line is drawn, and photographed at
 * 1440, 990, 660 and 390 in light and dark.
 */
describe('the group line in the person’s chat is looked at', () => {
  it.skipIf(!process.env['SF_MENTION_SHOTS'])(
    'photographs it at 1440, 990, 660 and 390 in both themes',
    async () => {
      const shots = process.env['SF_MENTION_SHOTS'] as string
      const { mkdirSync } = await import('node:fs')
      mkdirSync(shots, { recursive: true })
      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await app.page.emulateMedia({ colorScheme: 'light' })
      await openTheirChatWithTheAgent()
      // THE LINE IS REALLY THERE, so a picture of an empty panel cannot pass for a look at it.
      await app.page.waitForSelector('button.px-chat-from-group', { timeout: 20_000 })
      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          await app.page.waitForTimeout(150)
          await app.page.screenshot({
            path: `${shots}/group-line-in-chat-${String(width)}-${theme}.png`,
            fullPage: false,
          })
        }
      }
      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await app.page.emulateMedia({ colorScheme: 'light' })
    },
    300_000,
  )
})
