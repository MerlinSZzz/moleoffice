// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SPECIAL CHECKLIST ITEM KEEPS ITS ICON WHILE IT IS UNFINISHED, AND ITS PICKER'S SAVE SENDS NO BLANK WORDS. Wave
 * 14a, from a message of the owner's: an item that needs evidence or a passage the owner writes shows a special
 * icon in its left box. The supervisor's review asked for two things beyond the
 * first test file, and this is the new file that carries them, so the criterion-committed file keeps its own bytes:
 *
 *   1. AN UNFINISHED SPECIAL ITEM KEEPS THE ICON, in progress or waiting on the owner, and a finished one shows its
 *      tick instead. The icon is what tells the reader this box opens the picker rather than ticking the item.
 *   2. A PICKER SAVE WITH A PICKED REPORT AND A WHITESPACE-ONLY WORDS BOX stores the report and no response: a blank
 *      passage is not sent, while a nonblank one is sent exactly as typed.
 *
 * In a real browser, on this test's own office. The browser is the person. Every checklist and report here is made up.
 *
 * MUTATIONS, one at a time, restored: the pencil drawn only for state "open" turns case 1 red; the picker sending
 * `response` whenever its box is non-empty turns case 2 red.
 *
 * Test change (wave 13y round 175): the page draws design E, as decided, so each checklist is a card, and the cases
 * read the card the address `#/checklists/<id>` marks. Before, they read the one opened checklist and waited for its
 * counts line.
 */

import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function send(method: string, url: string, body: object | undefined, headers: Record<string, string> = PERSON): Promise<Record<string, any>> {
  const reply = await fetch(app.api + url, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  expect(reply.status, `${method} ${url}: ${text.slice(0, 600)}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

async function theItem(list: string, words: string): Promise<Record<string, any>> {
  const read = await send('GET', `/api/checklists/${list}`, undefined)
  return (read['checklist'].items as Record<string, any>[]).find((one) => one['words'] === words)!
}

async function openThePage(page: Page, id: string): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#/checklists/${id}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator(`${MARKED} .ckp-item`).first().waitFor({ timeout: 30_000 })
}

/** The card the address `#/checklists/<id>` marks on the page. */
const MARKED = '.cks-card[data-marked="yes"]'
const itemOn = (page: Page, words: string) => page.locator(`${MARKED} .ckp-item`, { hasText: words })

beforeAll(async () => {
  app = await liveApp({ name: 'a-special-item-keeps-its-icon', viewport: { width: 1440, height: 900 }, workspace: 'default' })
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

describe('a special item keeps its icon while unfinished', () => {
  it('1. in progress or waiting on the owner, the special icon is drawn and its box is there; done shows the tick', async () => {
    const page = app.page
    const report = await send('POST', '/api/records', {
      kind: 'report',
      title: 'Made-up shelf report',
      data: { for: 'The owner', date: '2026-10-18', blocks: [{ id: 'b-1', type: 'text', text: 'Made up.' }] },
    })
    const list = (await send('POST', '/api/checklists', {
      title: 'Shelf checklist',
      items: [
        { words: 'Refit the shelf', style: 'evidence-or-words', state: 'in progress' },
        { words: 'Choose the shelf oil', style: 'evidence-or-words', state: 'waiting on the owner' },
        { words: 'Oil the shelf', style: 'evidence-or-words', state: 'done', evidence: [{ kind: 'report', record: report['record'].id as string }] },
        { words: 'Sweep the shelf' },
      ],
    }))['checklist'].id as string
    await openThePage(page, list)
    for (const [words, state] of [
      ['Refit the shelf', 'in progress'],
      ['Choose the shelf oil', 'waiting on the owner'],
    ] as const) {
      const one = itemOn(page, words)
      expect(await one.getAttribute('data-state'), `${state}: its state`).toBe(state)
      expect(await one.locator('.ckp-box').count(), `${state}: its box`).toBe(1)
      expect(await one.locator('.ckp-mark[data-special="yes"]').count(), `${state}: the special icon`).toBe(1)
    }
    await page.locator(`${MARKED} .ckp-fold`).click()
    const done = itemOn(page, 'Oil the shelf')
    await done.waitFor({ timeout: 10_000 })
    expect(await done.locator('.ckp-mark[data-special="yes"]').count(), 'a done item shows its tick, not the pencil').toBe(0)
    expect(await done.locator('.ckp-mark[data-state="done"]').count(), 'its done mark').toBe(1)
    expect(await itemOn(page, 'Sweep the shelf').locator('.ckp-mark[data-special="yes"]').count(), 'a plain item has no icon').toBe(0)
  }, 120_000)

  it('2. a picked report with a whitespace-only words box stores the report and no response', async () => {
    const page = app.page
    const report = await send('POST', '/api/records', {
      kind: 'report',
      title: 'Shelf oil report',
      data: { for: 'The owner', date: '2026-10-18', blocks: [{ id: 'b-1', type: 'text', text: 'Made up.' }] },
    })
    const list = (await send('POST', '/api/checklists', {
      title: 'Oil checklist',
      items: [{ words: 'Oil the shelf edges', style: 'evidence-or-words' }],
    }))['checklist'].id as string
    await openThePage(page, list)
    const item = itemOn(page, 'Oil the shelf edges')
    await item.getByRole('button', { name: 'Mark done with evidence or words: Oil the shelf edges', exact: true }).click({ timeout: 10_000 })
    const picker = item.locator('.ckw-picker')
    await picker.locator('.ckw-choice').first().waitFor({ timeout: 20_000 })
    await picker.locator('input[type="search"]').fill('Shelf oil', { timeout: 10_000 })
    await picker.locator('.ckw-choice', { hasText: 'Shelf oil report' }).click({ timeout: 10_000 })
    await picker.locator('textarea').fill('   ', { timeout: 10_000 })
    await picker.getByRole('button', { name: 'Mark done' }).click({ timeout: 10_000 })
    await expect.poll(async () => (await theItem(list, 'Oil the shelf edges'))['state'], { timeout: 15_000 }).toBe('done')
    const stored = await theItem(list, 'Oil the shelf edges')
    expect(stored['evidence'], 'the picked report is stored').toEqual([{ kind: 'report', record: report['record'].id }])
    expect(stored['response'], 'spaces alone send no words').toBeUndefined()
  }, 120_000)
})
