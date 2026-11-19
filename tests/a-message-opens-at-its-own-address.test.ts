// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE OPENS AT ITS OWN ADDRESS AND DRAWS ITS OWN PAGE.
 * Criterion E2, point 3: a message has a UI entry and a page of its own.
 * The work merged as c8119690 gave a report the address `#/report/<id>`; the decision then
 * named message as the next kind, because it is the commonest kind with no page of its own.
 *
 * THIS FILE PROVES THE FIVE THINGS THE BRIEF NAMES, in a real browser, the way a person meets them:
 *
 *   1. `#/message/<id>` resolves and draws the page: the title, the sender, the letter with its
 *      Markdown, and the delivery marks.
 *   2. The rail does not mark Everything. It has no Messages row to mark since a decision.
 *   3. A list that knows the kind — the records list — links to `#/message/<id>`.
 *   4. A link that knows only the id still opens `#/r/<id>`, and the record page still draws it.
 *   5. The breadcrumb reads All records / Messages / the message's title (the sidebar row's word, nav.records).
 *
 * WHY A BROWSER AND NOT A RENDER. The page reads one message from the server and tells the rail
 * nothing: the rail learns the kind from the ADDRESS, which only exists once the shell has parsed
 * it. renderToStaticMarkup paints no effects and no address, so it cannot see either half.
 *
 * THE WORLD IS ITS OWN. `liveApp` starts an API and Vite on ports of their own, pointed at a
 * database of their own; nothing here touches the live office's port.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, expect, it, describe } from 'vitest'
import { messagePath, parseRoute, recordPath } from '../src/web/components/router.tsx'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

let app: LiveApp
let messageId = ''
let messageTitle = ''
let groupId = ''
let groupMessageId = ''
let groupName = 'The message entry group'
let agentHandle = 'builder-message'

beforeAll(async () => {
  app = await liveApp({
    name: 'message-entry',
    viewport: { width: 1440, height: 1000 },
    workspace: 'default',
  })

  // AN AGENT TO ADDRESS, so the message has a registered recipient and a delivery row with a mark.
  const agent = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Builder Message',
      data: { handle: agentHandle, runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(agent.status, `creating the agent: ${await agent.clone().text()}`).toBe(201)

  messageTitle = 'The message with a page of its own'
  const sent = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'message',
      title: messageTitle,
      data: {
        body: '**The bold letter** and a plain line under it.',
        to: [{ kind: 'agent', id: agentHandle }],
      },
    }),
  })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(sent.status, `creating the message: ${await sent.clone().text()}`).toBe(409)
  messageId = ((await sent.json()) as { record: { id: string } }).record.id

  // A GROUP WITH THE AGENT IN IT, so the page's press onto a group has somewhere to go. The owner
  // opens the group, so the owner is a member and may write to it.
  const group = await fetch(`${app.api}/api/groups`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      name: groupName,
      because: 'So the message page can open a group conversation in one press.',
      members: [
        { who: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }, because: 'The owner writes to the group.' },
        { who: { kind: 'agent', id: agentHandle }, because: 'The group needs somebody in it.' },
      ],
    }),
  })
  expect(group.status, `creating the group: ${await group.clone().text()}`).toBe(201)
  groupId = ((await group.json()) as { group: { id: string } }).group.id

  const toGroup = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'message',
      title: 'A message written to a group',
      data: { body: 'A line to the whole group.', toGroup: groupId },
    }),
  })
  expect(toGroup.status, `creating the group message: ${await toGroup.clone().text()}`).toBe(201)
  groupMessageId = ((await toGroup.json()) as { record: { id: string } }).record.id
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('a message at #/message/<id>', () => {
  it('resolves to its own page and draws the title, the sender, the letter and the marks', async () => {
    const { page } = app
    await page.goto(`${app.site}/#${messagePath(messageId)}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)

    // THE ADDRESS NAMES THE KIND, and the parser's own branch answers with a page of its own.
    expect(page.url()).toContain(`#/message/${messageId}`)
    expect(parseRoute(page.url().slice(page.url().indexOf('#')))).toEqual({ name: 'message', id: messageId })

    // THE TITLE IS THE HEADING, and who sent it is named rather than left as an id.
    await page.locator('h1.mp-title').waitFor({ timeout: 30_000 })
    expect(await page.locator('h1.mp-title').textContent()).toContain(messageTitle)
    const writer = (await page.locator('.mp-writer').first().textContent()) ?? ''
    expect(writer.trim().length, 'the sender was drawn as nothing').toBeGreaterThan(0)

    // THE LETTER IS DRAWN THE WAY THE CHAT DRAWS IT: Markdown becomes markup, not asterisks.
    await page.locator('.mp-body strong').waitFor({ timeout: 30_000 })
    expect(await page.locator('.mp-body strong').first().textContent()).toBe('The bold letter')
    expect(await page.locator('.mp-body').textContent()).not.toContain('**')

    // WHERE IT WENT: the recipient is named and the delivery carries one of the three mark words.
    const went = (await page.locator('.mp-went').textContent()) ?? ''
    expect(went).toContain('Builder Message')
    expect(['Waiting', 'Delivered', 'Read'].some((word) => went.includes(word)), `the mark drawn was: ${went}`).toBe(true)

    // ONE PRESS OPENS THE CHAT THERE, on the conversation the message belongs to.
    await page.locator('button.mp-open').first().waitFor({ timeout: 10_000 })
  })

  // Criterion change in wave 13q round 44. The Messages row in the project block
  // marked a message page as the part being read. Messages now stands in no group of the sidebar, so
  // there is no such row. Everything still does not mark a message page.
  // Test change (wave 13y round 165): Everything is listed on All pages now, so the All pages entry,
  // which lights for every page it lists, is what must not light.
  it('does not mark Everything, and has no Messages row to mark', async () => {
    const { page } = app
    await page.goto(`${app.site}/#${messagePath(messageId)}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)

    // Control: the sidebar is drawn, with the All pages entry that leads to Everything.
    await page.locator('nav.shell-nav a.shell-all-pages').waitFor({ timeout: 10_000 })
    const everythingMarked = await page
      .locator('nav.shell-nav a.shell-all-pages[aria-current]')
      .count()
    expect(everythingMarked, 'Everything marking a message page').toBe(0)
    const messagesRows = await page.locator('#shell-side a.shell-link[href="#/messages"]').count()
    expect(messagesRows, 'a Messages row in the sidebar').toBe(0)
  })

  it('reads All records / Messages / the message title in the breadcrumb', async () => {
    const { page } = app
    await page.goto(`${app.site}/#${messagePath(messageId)}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    const crumbs = page.locator('nav[aria-label="Breadcrumb"]')
    await crumbs.waitFor({ timeout: 10_000 })
    const said = (await crumbs.textContent()) ?? ''
    expect(said).toContain('All records')
    expect(said).toContain('Messages')
    expect(said).toContain(messageTitle)
  })

  it('is linked to from the records list, which knows the message kind', async () => {
    const { page } = app
    await page.goto(`${app.site}/#/records`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.locator(`a[href="#/message/${messageId}"]`).first().waitFor({ state: 'visible', timeout: 30_000 })
  })

  it('still opens at the old generic record address, which the record page draws', async () => {
    const { page } = app
    await page.goto(`${app.site}/#${recordPath(messageId)}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    expect(page.url()).toContain(`#/r/${messageId}`)
    // The record page draws the message's own title, and it is not the message's own page.
    await page.getByText(messageTitle).first().waitFor({ timeout: 30_000 })
    expect(await page.locator('h1.mp-title').count()).toBe(0)
  })

  it('opens the conversation it belongs to in one press', async () => {
    const { page } = app
    await page.goto(`${app.site}/#${messagePath(messageId)}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.locator('button.mp-open').first().click()
    // THE CHAT PANEL OPENS AT THE OTHER SIDE, which is the agent this message reached.
    const chat = page.locator('aside.px-chat')
    await chat.waitFor({ state: 'visible', timeout: 30_000 })
    expect(await chat.textContent()).toContain('Builder Message')
  })

  it('names the group and opens the group conversation in one press', async () => {
    const { page } = app
    await page.goto(`${app.site}/#${messagePath(groupMessageId)}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    // THE MESSAGE'S OWN PAGE NAMES THE GROUP, not its id.
    expect(await page.locator('.mp-to-group').textContent()).toContain(groupName)
    const button = page.locator('button.mp-open').first()
    expect(await button.textContent()).toContain(groupName)
    await button.click()
    // THE GROUP CHAT OPENS, because the door carries a group rather than a participant. The group's
    // own name is drawn in the panel once its detail read has answered.
    const chat = page.locator('aside.px-chat')
    await chat.waitFor({ state: 'visible', timeout: 30_000 })
    await chat.locator('.px-chat-name').filter({ hasText: groupName }).waitFor({ timeout: 30_000 })
  })
})
