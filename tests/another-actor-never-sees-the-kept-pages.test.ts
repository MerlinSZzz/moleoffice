// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A PAGE KEPT FOR ONE ACTOR IS NEVER DRAWN FOR ANOTHER, AND CHANGING WHO WRITES CLEARS IT.
 *
 * This is round 17 of wave 13w, layer 2 of a decision. src/web/lib/pagecache.ts keys
 * every kept answer by who is looking, deletes what was kept for anyone else when a page loads, and
 * forgets everything, in memory and in IndexedDB, when the page changes who it writes as. This office
 * has no sign-out press: the writer choice on the Settings page, in Developer mode, is how a page
 * becomes somebody else, so it is the press this file uses.
 *
 * WHAT THIS FILE HOLDS.
 *   1. The person opens a record and it is kept. The writer is changed to an agent with the press on the
 *      Settings page: IndexedDB holds nothing kept any more. The record opened again, with its door held
 *      back, does not draw the person's title before the door answers.
 *   2. The person's record is kept again. A new tab whose stored writer is an agent (as a browser that
 *      somebody else uses would be) opens the record with its door held back. The person's title is not
 *      drawn before the door answers, and the person's kept answers are deleted from IndexedDB.
 *
 * MUTATION 1: `whoIsLooking` in src/web/lib/pagecache.ts leaves the actor out of the key. Red on case 2.
 * MUTATION 2: the page cache no longer forgets everything when the writer changes. Red on case 1.
 *
 * THE WORLD IS ITS OWN: `liveApp` starts an API and a database of its own.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openSettingsPanel } from './settings-folds.ts'

let app: LiveApp
let id = ''
const TITLE = 'The quarterly figures only the person has read'
const HELD_BACK_MS = 5_000

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': 'default',
}

/** How many answers IndexedDB holds kept, how many are the person's, and how many are a record's page. */
function keptInIndexedDb(page: Page): Promise<{ all: number; thePersons: number; records: number }> {
  return page.evaluate(
    (person) =>
      new Promise<{ all: number; thePersons: number; records: number }>((resolve) => {
        const asked = indexedDB.open('mole-office-page-cache')
        asked.onupgradeneeded = () => {
          asked.result.createObjectStore('answers', { keyPath: 'key' })
        }
        asked.onsuccess = () => {
          const all = asked.result.transaction('answers').objectStore('answers').getAll()
          all.onsuccess = () => {
            const rows = all.result as { who: string; key: string }[]
            resolve({
              all: rows.length,
              thePersons: rows.filter((one) => one.who.startsWith(`human:${person}:`)).length,
              records: rows.filter((one) => one.key.includes('\nrecord:')).length,
            })
            asked.result.close()
          }
        }
      }),
    THE_PERSON,
  )
}

/** Open the record as the person and wait until IndexedDB holds a copy of it. */
async function keepTheRecordAsThePerson(page: Page): Promise<void> {
  await page.goto(`${app.site}/?lang=en&mode=inspect#/r/${id}`)
  await waitForThePage(page, 60_000)
  await page.locator('.rp-title', { hasText: TITLE }).first().waitFor({ state: 'visible', timeout: 30_000 })
  await expect.poll(async () => (await keptInIndexedDb(page)).records, { timeout: 10_000 }).toBeGreaterThan(0)
}

/** Open the record with its door held back, and say whether the person's title was drawn before it answered. */
async function drawnBeforeTheDoorAnswered(page: Page): Promise<boolean> {
  let answered = false
  await page.route(
    (url) => url.pathname === `/api/records/${id}`,
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, HELD_BACK_MS))
      await route.continue()
      answered = true
    },
  )
  if (page.url().includes(`#/r/${id}`)) await page.reload({ waitUntil: 'commit' })
  else await page.goto(`${app.site}/?lang=en&mode=inspect#/r/${id}`, { waitUntil: 'commit' })
  const seen = await page
    .locator('.rp-title', { hasText: TITLE })
    .first()
    .waitFor({ state: 'visible', timeout: HELD_BACK_MS - 1_500 })
    .then(() => !answered, () => false)
  await page.unroute((url) => url.pathname === `/api/records/${id}`)
  return seen
}

beforeAll(async () => {
  app = await liveApp({ name: 'another-actor-kept', viewport: { width: 1440, height: 1000 } })
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers: AS_THE_OWNER, body: JSON.stringify({ kind: 'note', title: TITLE }) })
  expect(made.status, await made.clone().text()).toBe(201)
  id = ((await made.json()) as { record: { id: string } }).record.id
}, 600_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the page cache and who is looking', () => {
  it('forgets everything when the writer is changed on the Settings page', async () => {
    const page = app.page
    await keepTheRecordAsThePerson(page)
    await page.evaluate(() => {
      window.location.hash = '#/settings'
    })
    await waitForThePage(page, 30_000)
    await openSettingsPanel(page, 'settings.writer')
    await page.selectOption('#settings-writer', 'agent')
    try {
      await expect.poll(async () => (await keptInIndexedDb(page)).thePersons, { timeout: 5_000 }).toBe(0)
      expect(await drawnBeforeTheDoorAnswered(page), 'the person\'s title was drawn for the agent before the door answered').toBe(false)
    } finally {
      await page.goto(`${app.site}/?lang=en&mode=inspect#/settings`)
      await waitForThePage(page, 30_000)
      await openSettingsPanel(page, 'settings.writer')
      await page.selectOption('#settings-writer', 'human')
    }
  }, 120_000)

  it('draws nothing kept for the person in a tab that writes as somebody else', async () => {
    await keepTheRecordAsThePerson(app.page)
    // THE PERSON'S TAB IS LEFT, so nothing open goes on keeping answers for them while the other tab loads.
    await app.page.goto('about:blank')
    const other = await app.context.newPage()
    await other.addInitScript(() => {
      localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'agent', id: 'claude' }))
    })
    try {
      expect(await drawnBeforeTheDoorAnswered(other), 'the person\'s title was drawn for the agent before the door answered').toBe(false)
      await waitForThePage(other, 60_000)
      expect((await keptInIndexedDb(other)).thePersons, 'the person\'s kept answers are deleted when another actor loads').toBe(0)
    } finally {
      await other.close()
    }
  }, 120_000)
})
