// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROJECT CHOICE STARTS AT THE PROJECT ON SCREEN, AND FOLLOWS IT UNTIL THE READER CHOOSES.
 *
 * Goals, Counters, Context bundles and All records read across projects, and the project the page was opened from
 * is only the starting choice, as a decision lays down. The first version took that
 * project once, at the page's first render. A fresh visit starts at the default project and then
 * opens the project the office offers, so on a copy of the office's data every one of the four pages
 * opened at "Default" while the frame said "Mole Office", and Counters read an empty project.
 *
 * The same thing happens whenever the project on screen changes after the page has drawn, so the case
 * switches the project with the sidebar's own Switch list: the choice must follow it; and once the
 * reader has chosen in the page's own control, a switch must leave the reader's choice alone.
 * Counters is the page read, because each counter names its project and the list is short.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { switchTheProject } from './switch-the-project.ts'

const HERE = 'default'
const THERE = 'robotics'
const HERE_COUNTER = 'Seed tray waterings'
const THERE_COUNTER = 'Gripper trials since calibration'

let app: LiveApp
let page: Page

const person = (workspace: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': workspace,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
})

async function call(path: string, workspace: string, body: unknown): Promise<void> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers: person(workspace), body: JSON.stringify(body) })
  if (!reply.ok) throw new Error(`POST ${path} answered ${reply.status}: ${await reply.text()}`)
}

beforeAll(async () => {
  app = await liveApp({ name: 'project-choice-follows', workspace: HERE, viewport: { width: 1440, height: 1000 } })
  page = app.page
  await call('/api/workspaces', HERE, { id: THERE, title: 'Robotics' })
  for (const [workspace, title] of [
    [HERE, HERE_COUNTER],
    [THERE, THERE_COUNTER],
  ] as const) {
    await call('/api/counters', workspace, {
      title,
      counts: `Made-up events counted for ${title}.`,
      triggers: [{ kind: 'count', n: 5 }],
      action: { kind: 'task', title: `Look at ${title}` },
    })
  }
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** The value the page's one Project control holds. */
async function theChoice(): Promise<string> {
  return page.locator('.pch-select').inputValue()
}

/** Wait until the card list shows this counter and not that one. */
async function theCardsShow(shown: string, notShown: string): Promise<void> {
  await page.locator('.cnt-entry', { hasText: shown }).first().waitFor({ timeout: 30_000 })
  expect(await page.locator('.cnt-entry', { hasText: notShown }).count(), `the list still shows "${notShown}"`).toBe(0)
}

describe('the project choice follows the project on screen until the reader chooses', () => {
  it('starts at the project on screen, follows a switch, and keeps the reader\'s own choice', async () => {
    await page.goto('about:blank')
    await page.goto(`${app.site}/#/`, { timeout: 60_000 })
    await page.evaluate((workspace) => window.localStorage.setItem('mole-office.workspace', workspace), HERE)
    await page.goto('about:blank')
    await page.goto(`${app.site}/#/counters`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)

    // STARTS WHERE THE PAGE WAS OPENED.
    expect(await theChoice(), 'the choice did not start at the project on screen').toBe(HERE)
    await theCardsShow(HERE_COUNTER, THERE_COUNTER)

    // THE PROJECT ON SCREEN CHANGES AFTER THE PAGE HAS DRAWN: the choice follows it.
    await switchTheProject(page, THERE)
    await expect.poll(theChoice, { timeout: 30_000, message: 'the choice stayed at the project the page first drew' }).toBe(THERE)
    await theCardsShow(THERE_COUNTER, HERE_COUNTER)

    // THE READER CHOOSES in the page's own control; a later switch leaves that choice alone.
    await page.locator('.pch-select').selectOption(HERE)
    await theCardsShow(HERE_COUNTER, THERE_COUNTER)
    await switchTheProject(page, HERE)
    await switchTheProject(page, THERE)
    await expect.poll(theChoice, { timeout: 10_000, message: 'a switch overrode the choice the reader made' }).toBe(HERE)
  }, 180_000)
})
