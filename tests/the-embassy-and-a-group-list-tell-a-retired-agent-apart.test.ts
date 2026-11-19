// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EMBASSY AND A GROUP'S MEMBER LIST TELL A RETIRED AGENT FROM A LIVE ONE. Criterion I4.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * An agent keeps its name when it is retired, and a live agent may bear the same name. The Embassy
 * list draws both once the retired rows are unfolded, and a group's member list draws every member
 * including a retired one, so two rows read identically and a reader could not tell which agent was
 * which. The retired row now carries its retirement date beside its name.
 *
 * THESE THREE SURFACES ARE PROVED IN A BROWSER because their retired rows are drawn only after a
 * press: the Embassy folds the retired rows away and a static render cannot press, a group's member
 * list is inside the panel, and the contacts panel's Retired group is folded shut by default. The
 * one shared function is proved without a browser in
 * tests/a-retired-and-a-live-agent-of-one-name-are-told-apart.test.ts, which also draws the retired
 * group's row statically.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * - Make `theNameBesideItsDate` return the bare name (drop the date): both cases below go red.
 * - Draw the Embassy row name with `row.name` instead of the shared function: the Embassy case goes
 *   red.
 * - Draw a group's member name with the bare registry name: the group case goes red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openTheChatBeside } from './open-the-chat.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp
let groupId = ''

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** One agent record, which registers the registry row and gives it its name. */
async function anAgent(title: string, handle: string): Promise<void> {
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title, data: { handle, runtime: 'claude-code', state: 'active' } }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
}

beforeAll(async () => {
  app = await liveApp({ name: 'i4-one-name', viewport: { width: 1440, height: 1000 } })
  await anAgent('Twin Agent', 'twin-live')
  await anAgent('Twin Agent', 'twin-retired')

  // ONE GROUP HOLDS BOTH, MADE BEFORE THE RETIREMENT SO BOTH ARE MEMBERS OF IT. A group made after
  // might refuse a retired agent; a member is never dropped by retirement.
  const made = await fetch(`${app.api}/api/groups`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      name: 'The twins',
      because: 'Two agents with one name had to be told apart.',
      members: [
        { who: { kind: 'person', id: THE_PERSON }, because: 'the owner opened it' },
        { who: { kind: 'agent', id: 'twin-live' }, because: 'one twin' },
        { who: { kind: 'agent', id: 'twin-retired' }, because: 'the other twin' },
      ],
    }),
  })
  expect(made.status, await made.clone().text()).toBe(201)
  groupId = ((await made.json()) as { group: { id: string } }).group.id
  expect(groupId, 'the group was not filed').not.toBe('')

  const retired = await fetch(`${app.api}/api/participants/agent/twin-retired/retire`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ because: 'a twin, closed for this test' }),
  })
  expect(retired.status, await retired.clone().text()).toBe(200)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Open the chat panel and leave it on the contacts list. */
async function openTheChat(): Promise<void> {
  await app.page.goto(`${app.site}/#/`)
  await waitForThePage(app.page, 30_000)
  await openTheChatBeside(app.page)
  const back = await app.page.$('.px-chat-back')
  if (back !== null) await back.click()
  await app.page.waitForSelector('.px-chat-tabs', { timeout: 20_000 })
}

/** Open the one group's conversation, where its member list is drawn. */
async function openTheGroup(): Promise<void> {
  await openTheChat()
  await app.page.click('.px-chat-tab[data-tab="groups"]')
  await app.page.waitForSelector('.px-chat-under-tabs[data-showing="groups"]', { timeout: 20_000 })
  await app.page.click('.px-chat-contact:has-text("The twins")')
  await app.page.waitForSelector('.px-chat-said .px-chat-system[data-joined="yes"]', { timeout: 20_000 })
}

/** Unfold the retired rows on the Embassy and leave them on screen. */
async function openTheEmbassyRetired(): Promise<void> {
  await app.page.goto(`${app.site}/#/embassy`)
  await waitForThePage(app.page, 30_000)
  await app.page.waitForSelector('.emb-list', { timeout: 20_000 })
  // Widen to everybody first where the press is offered, because a retired agent need not be a
  // contact and the contacts filter would hide the row.
  const everyone = await app.page.$('button.emb-show:has-text("Show everyone")')
  if (everyone !== null) await everyone.click()
  const showRetired = await app.page.$('button.emb-show:has-text("Show the ones you retired")')
  expect(showRetired, 'the press that shows the retired rows is not drawn').not.toBeNull()
  await showRetired?.click()
  await app.page.waitForSelector('.emb-row[data-retired="yes"]', { timeout: 20_000 })
}

/** Open the contacts list and unfold its Retired group. */
async function openTheRetiredGroup(): Promise<void> {
  await openTheChat()
  await app.page.click('.px-chat-tab[data-tab="contacts"]')
  await app.page.waitForSelector('.px-chat-under-tabs[data-showing="contacts"]', { timeout: 20_000 })
  // THE AGENT SIDE FOLDS WITH IT, so open that first where it is closed.
  const agentFold = await app.page.$('button.px-chat-fold[aria-label="Agent"][aria-expanded="false"]')
  if (agentFold !== null) await agentFold.click()
  const retiredFold = await app.page.$('button.px-chat-fold[aria-label="Retired"]')
  expect(retiredFold, 'the Retired group is not drawn').not.toBeNull()
  await retiredFold?.click()
  await app.page.waitForSelector('.px-chat-group-of[data-group="retired"] .px-chat-contact', { timeout: 20_000 })
}

describe("the Embassy tells the retired twin from the live one", () => {
  it('draws the retired row with its retirement date beside the name', async () => {
    await openTheEmbassyRetired()
    const retiredName = await app.page.$eval('.emb-row[data-retired="yes"] .emb-name', (one) => one.textContent ?? '')
    // THE CONTROL: the row is the one this test made, and it is named at all.
    expect(retiredName, 'the retired row is not the twin').toContain('Twin Agent')
    // THE EMBASSY DRAWS THE DATE TO THE MINUTE, with drawnStamp in src/shared/time.ts (shared rule R7).
    expect(retiredName, 'the retired row carries no retirement date').toMatch(/retired \d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/)
  })
})

describe("a group's member list tells the retired twin from the live one", () => {
  it('draws the retired member with its retirement date beside the name', async () => {
    await openTheGroup()
    const members = await app.page.$$eval('.px-chat-said .px-chat-system[data-joined="yes"] .px-chat-system-block', (all) =>
      all.map((one) => one.textContent ?? ''),
    )
    // THE CONTROL: both members are drawn. One row alone would prove nothing about telling them apart.
    expect(members.filter((one) => one.includes('Twin Agent')).length, 'both twins are not listed').toBe(2)
    const retiredRow = members.find((one) => one.includes('retired'))
    expect(retiredRow, 'the retired member carries no retirement date').toMatch(/retired \d{4}-\d{2}-\d{2}/)
  })
})

describe("the contacts panel's Retired group tells the retired twin from the live one", () => {
  it('draws the retired contact with its retirement date beside the name', async () => {
    await openTheRetiredGroup()
    const retiredName = await app.page.$eval(
      '.px-chat-group-of[data-group="retired"] .px-chat-contact .px-chat-name',
      (one) => one.textContent ?? '',
    )
    // THE CONTROL: the row is the twin, and it is named at all.
    expect(retiredName, 'the retired contact is not the twin').toContain('Twin Agent')
    expect(retiredName, 'the retired contact carries no retirement date').toMatch(/retired \d{4}-\d{2}-\d{2}/)
  })
})

/**
 * THE PICTURES. Chapter 6 rule 1: the Embassy with the retired rows unfolded, a group's member list
 * and the contacts panel's Retired group, at 1440, 990, 660 and 390 in light and dark.
 *
 * IT IS GATED, like every other photographing case here: taking pictures is not a check, so the
 * suite only does it when I4_NAMES_SHOTS names the directory the pictures go in.
 */
describe('the three lists are looked at', () => {
  it.skipIf(!process.env['I4_NAMES_SHOTS'])(
    'photographs the Embassy, the member list and the Retired group at four widths in both themes',
    async () => {
      const shots = process.env['I4_NAMES_SHOTS'] as string
      const { mkdirSync } = await import('node:fs')
      mkdirSync(shots, { recursive: true })
      const widths = [1440, 990, 660, 390]
      const themes = ['light', 'dark'] as const

      await openTheEmbassyRetired()
      for (const width of widths) {
        for (const theme of themes) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          await app.page.waitForTimeout(150)
          await app.page.screenshot({ path: `${shots}/embassy-retired-${String(width)}-${theme}.png`, fullPage: true })
        }
      }

      await openTheGroup()
      for (const width of widths) {
        for (const theme of themes) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          await app.page.waitForTimeout(150)
          await app.page.screenshot({ path: `${shots}/group-members-${String(width)}-${theme}.png`, fullPage: false })
        }
      }

      await openTheRetiredGroup()
      for (const width of widths) {
        for (const theme of themes) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          // THE GROUP SITS AT THE FOOT OF THE PANEL, so scroll it into view before each shutter.
          await app.page.$eval('.px-chat-group-of[data-group="retired"]', (one) => one.scrollIntoView({ block: 'center' }))
          await app.page.waitForTimeout(150)
          await app.page.screenshot({ path: `${shots}/retired-group-${String(width)}-${theme}.png`, fullPage: false })
        }
      }
      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await app.page.emulateMedia({ colorScheme: 'light' })
    },
    300_000,
  )
})
