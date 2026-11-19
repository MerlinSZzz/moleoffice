// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PAGE OPENED A SECOND TIME SHOWS WHAT IT SHOWED LAST, BEFORE THE NETWORK HAS ANSWERED.
 *
 * This is round 17 of wave 13w, layer 2 of a decision. src/web/lib/pagecache.ts keeps
 * each page's last answer in memory and in the browser's IndexedDB, and `useAsync`'s `keep` option
 * draws it at once, marked "Refreshing…", while the door is asked again.
 *
 * WHAT THIS FILE HOLDS. A record's page is opened once and read in full. It is then opened again, in a
 * new tab of the same browser (nothing in memory: only IndexedDB carries it), with the record's own door
 * held back for several seconds. The record's title is drawn while that request has still not answered,
 * and the re-read strip says "Refreshing…" beside it. When the door answers, the title is still there.
 *
 * MUTATION: in `useAsync` (src/web/components/ui.tsx) the kept answer is never looked up. Red: the
 * second open draws the title only after the held-back door answers.
 *
 * THE WORLD IS ITS OWN: `liveApp` starts an API and a database of its own.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp
let id = ''
const TITLE = 'Conveyor belt tension readings, kept from the last open'
/** How long the record's own door is held back on the second open. */
const HELD_BACK_MS = 6_000

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': 'default',
}

beforeAll(async () => {
  app = await liveApp({ name: 'second-open-kept', viewport: { width: 1440, height: 1000 } })
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers: AS_THE_OWNER, body: JSON.stringify({ kind: 'note', title: TITLE }) })
  expect(made.status, await made.clone().text()).toBe(201)
  id = ((await made.json()) as { record: { id: string } }).record.id
}, 600_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('a second open of a page', () => {
  it('draws what the page showed last before the network answers, marked as being read again', async () => {
    await app.page.goto(`${app.site}/?lang=en#/r/${id}`)
    await waitForThePage(app.page, 60_000)
    await expect.poll(() => app.page.locator('.rp-title').first().textContent()).toContain(TITLE)
    // THE COPY INTO INDEXEDDB is written shortly after the last answer; wait until it is there.
    await expect
      .poll(
        () =>
          app.page.evaluate(
            () =>
              new Promise<number>((resolve) => {
                const asked = indexedDB.open('mole-office-page-cache')
                asked.onsuccess = () => {
                  const all = asked.result.transaction('answers').objectStore('answers').getAllKeys()
                  all.onsuccess = () => resolve(all.result.filter((key) => String(key).includes('record:')).length)
                  all.onerror = () => resolve(-1)
                }
                asked.onerror = () => resolve(-1)
              }),
          ),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0)

    const second = await app.context.newPage()
    let answered = false
    await second.route(
      (url) => url.pathname === `/api/records/${id}`,
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, HELD_BACK_MS))
        await route.continue()
        answered = true
      },
    )
    const started = Date.now()
    await second.goto(`${app.site}/?lang=en#/r/${id}`, { waitUntil: 'commit' })
    await second.locator('.rp-title', { hasText: TITLE }).first().waitFor({ state: 'visible', timeout: HELD_BACK_MS - 1_000 })
    const drawnAfter = Date.now() - started
    expect(answered, `the title was drawn ${String(drawnAfter)} ms after the open, before the record's door answered`).toBe(false)
    expect(await second.locator('.px-reread-what').first().textContent({ timeout: 2_000 })).toBe(t('frameFiles.reread.refreshing'))

    await waitForThePage(second, 60_000)
    expect(answered).toBe(true)
    expect(await second.locator('.rp-title').first().textContent()).toContain(TITLE)
    await second.close()
  }, 180_000)
})
