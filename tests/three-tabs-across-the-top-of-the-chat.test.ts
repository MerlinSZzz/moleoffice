// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CONTACTS, GROUPS AND BETWEEN AGENTS ARE THREE TABS IN ONE ROW, NOT THREE HEADINGS IN ONE COLUMN.
 *
 * THE RULE: contact, group and between agents can be three categories side by side at the top, not
 * one column. Criterion M18 of design/messages/ACCEPTANCE.md section 9; problem `lRgQ0_LLyhZM`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS MEASURES, AND WHY IT IS A BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * "Across the top" and "in one row" are claims about boxes on a screen. Three buttons in the markup
 * satisfy neither on their own: a build that stacked them would still have three buttons, and a
 * build that put them below the list would still have them in the panel. So the row is measured —
 * same top, side by side, above the list — rather than counted.
 *
 * THE OTHER HALF IS THAT ONLY ONE LIST IS UNDER THEM. A build that drew all three lists and merely
 * added a row of buttons would look right in a photograph of the first tab and be the old column
 * underneath. Each case therefore asserts what is drawn AND what is not.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTROL
 * ---------------------------------------------------------------------------------------
 *
 * The first case asserts the three tabs exist, side by side on one line above the list. Without it,
 * every "the other two lists are not drawn" assertion below would pass on a panel that drew
 * nothing at all.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_THE_AGENT = {
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'builder-tabs',
}

async function openThePanel(): Promise<void> {
  await app.page.goto(app.site)
  await waitForThePage(app.page, 30_000)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat-tabs', { timeout: 20_000 })
  if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
}

async function press(tab: 'contacts' | 'groups' | 'between'): Promise<void> {
  await app.page.click(`.px-chat-tab[data-tab="${tab}"]`)
  await app.page.waitForSelector(`.px-chat-under-tabs[data-showing="${tab}"]`, { timeout: 20_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'chat-tabs', viewport: { width: 1440, height: 1000 } })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Builder Tabs',
      data: { handle: 'builder-tabs', runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(filed.status, await filed.text()).toBe(201)
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_AGENT,
    body: JSON.stringify({
      kind: 'message',
      title: 'the last thing said',
      data: { body: 'The clamp holds at 11.8 N.', to: [{ kind: 'person', id: THE_PERSON }] },
    }),
  })
  expect(said.status, await said.text()).toBe(201)
  const group = await fetch(`${app.api}/api/groups`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      name: 'The wrist camera',
      because: 'so that the groups tab has a group under it',
      members: [
        { who: { kind: 'person', id: THE_PERSON }, because: 'the owner opened it' },
        { who: { kind: 'agent', id: 'builder-tabs' }, because: 'it is doing the work' },
      ],
    }),
  })
  expect(group.status, await group.text()).toBe(201)
}, 180_000)

afterAll(async () => {
  await app.stop()
})

describe('three tabs in one row at the top', () => {
  it('puts them side by side on one line, above the list', async () => {
    await openThePanel()
    const boxes = await app.page.$$eval('.px-chat-tab', (all) =>
      all.map((one) => {
        const at = one.getBoundingClientRect()
        return { left: at.left, top: at.top, right: at.right, bottom: at.bottom }
      }),
    )
    expect(boxes).toHaveLength(3)
    const first = boxes[0]
    const second = boxes[1]
    const third = boxes[2]
    if (first === undefined || second === undefined || third === undefined) throw new Error('three tabs expected')
    // ONE ROW: the same top, and each one starts where the one before it ended.
    expect(second.top).toBeCloseTo(first.top, 0)
    expect(third.top).toBeCloseTo(first.top, 0)
    expect(second.left).toBeGreaterThanOrEqual(first.right - 1)
    expect(third.left).toBeGreaterThanOrEqual(second.right - 1)
    // ACROSS THE TOP: the list they choose between starts below all three.
    const list = await app.page.$eval('.px-chat-under-tabs', (one) => one.getBoundingClientRect().top)
    expect(list).toBeGreaterThanOrEqual(third.bottom - 1)
  }, 120_000)

  it('says which one is chosen, so the panel is readable with no colour', async () => {
    await openThePanel()
    await press('groups')
    const chosen = await app.page.$$eval('.px-chat-tab', (all) =>
      all.filter((one) => one.getAttribute('aria-selected') === 'true').map((one) => one.getAttribute('data-tab')),
    )
    expect(chosen).toEqual(['groups'])
  }, 120_000)
})

describe('one list under each tab and never two at once', () => {
  it('shows the contacts, with the last thing said on each, and no groups', async () => {
    await openThePanel()
    await press('contacts')
    const names = await app.page.$$eval('.px-chat-contact .px-chat-name', (all) => all.map((one) => one.textContent))
    expect(names).toContain('Builder Tabs')
    expect(names, 'the groups list is drawn under the contacts tab').not.toContain('The wrist camera')
    // THE LAST MESSAGE LINE STAYS ON EACH CONTACT. M18 asks for it by name.
    const last = await app.page.textContent('.px-chat-contact .px-chat-last')
    expect(last).toBe('The clamp holds at 11.8 N.')
  }, 120_000)

  it('shows the groups and no contacts when the groups tab is pressed', async () => {
    await openThePanel()
    await press('groups')
    const names = await app.page.$$eval('.px-chat-contact .px-chat-name', (all) => all.map((one) => one.textContent))
    expect(names).toContain('The wrist camera')
    expect(names, 'the contacts are still drawn under the groups tab').not.toContain('Builder Tabs')
  }, 120_000)

  it('shows the between-agents list without an empty notice', async () => {
    await openThePanel()
    await press('between')
    const names = await app.page.$$eval('.px-chat-contact .px-chat-name', (all) => all.map((one) => one.textContent))
    expect(names, 'the contacts are still drawn under the between-agents tab').not.toContain('Builder Tabs')
    expect(names, 'the groups are still drawn under the between-agents tab').not.toContain('The wrist camera')
    await expect.poll(()=>app.page.locator('.px-chat-under-tabs .px-chat-empty').count(),{timeout:30_000}).toBe(0)
  }, 120_000)
})

describe('at 390 the three tabs still fit across the panel', () => {
  it('keeps them on one line and nothing scrolls sideways', async () => {
    await app.page.setViewportSize({ width: 390, height: 844 })
    await openThePanel()
    const boxes = await app.page.$$eval('.px-chat-tab', (all) =>
      all.map((one) => {
        const at = one.getBoundingClientRect()
        return { top: at.top, right: at.right }
      }),
    )
    expect(boxes).toHaveLength(3)
    const first = boxes[0]
    if (first === undefined) throw new Error('three tabs expected')
    for (const box of boxes) expect(box.top).toBeCloseTo(first.top, 0)
    const width = await app.page.evaluate(() => document.documentElement.scrollWidth)
    expect(width).toBeLessThanOrEqual(391)
    await app.page.setViewportSize({ width: 1440, height: 1000 })
  }, 120_000)
})
