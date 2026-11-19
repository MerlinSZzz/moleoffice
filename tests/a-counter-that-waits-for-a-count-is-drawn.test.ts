// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COUNTER THAT WAITS FOR A COUNT DRAWS THE SENTENCE BESIDE ITS NEXT DUE TIME, IN BOTH LANGUAGES.
 *
 * Problem tp7FJQ6oo7IE. A counter with `mayAdd` naming somebody and an every trigger is no timer,
 * so it needs a count of at least 1 before it fires. Its card still drew a next due time as though a
 * firing were coming. The card now says, in the page's own language, that it waits for a count and
 * will not fire while the count is 0.
 *
 * WHAT THIS FILE PROVES:
 *
 *   1. The waiting counter's card draws the sentence, inside the paragraph that names its next due
 *      time.
 *   2. A timer's card, filed beside it, draws no such sentence: a timer really will fire.
 *   3. The sentence is the page's own words in English and in Chinese.
 *
 *
 * MUTATION, after a control run: stop drawing the sentence in src/web/pages/CountersPage.tsx (draw
 * nothing where it draws `.cnt-waits`) and the first claim goes red. Round 28's MUTATION: the typed
 * space put back before the waiting sentence; the fourth claim goes red. The four-width, two-theme
 * pictures are taken when W13J_WAITS_SHOTS names a folder.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { en } from '../src/shared/words/en.ts'
import { zh } from '../src/shared/words/zh.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

/** Where the four-width, two-theme pictures go when a caller asks for them. */
const shots = process.env.W13J_WAITS_SHOTS

const WAITING_TITLE = 'The daily news desk wake-up'
const TIMER_TITLE = 'The hourly look with nobody named'

const AS_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}

let app: LiveApp
let page: Page

beforeAll(async () => {
  app = await liveApp({ name: 'counter-waits-for-a-count', viewport: { width: 1440, height: 1000 } })
  page = app.page
}, 240_000)

beforeAll(async () => {
  await callApi('/api/agents/started', {
    method: 'POST',
    body: { handle: 'counter-waits-keeper', name: 'The counter waits keeper' },
  })
  const asKeeper = {
    'content-type': 'application/json',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': 'counter-waits-keeper',
    'x-mole-office-workspace': 'default',
  }
  for (const counter of [
    {
      title: WAITING_TITLE,
      counts: 'News to send, which nobody has added yet.',
      mayAdd: { anyone: false, who: [{ kind: 'agent', id: 'counter-waits-keeper' }] },
      triggers: [{ kind: 'every', hours: 24 }],
      action: { kind: 'task', title: 'Send the news' },
    },
    {
      title: TIMER_TITLE,
      counts: 'Nothing: it is a timer, and it fires whatever has happened.',
      mayAdd: { anyone: false, who: [] },
      triggers: [{ kind: 'every', hours: 24 }],
      action: { kind: 'task', title: 'The hourly look' },
    },
  ]) {
    await callApi('/api/counters', { method: 'POST', as: asKeeper, body: counter })
  }
}, 120_000)

afterAll(async () => {
  try {
    if (shots) await photograph()
  } finally {
    await app?.stop()
  }
}, 120_000)

async function callApi<T>(
  path: string,
  init: { method?: string; body?: unknown; as?: Record<string, string> } = {},
): Promise<T> {
  const res = await fetch(`${app.api}${path}`, {
    method: init.method ?? 'GET',
    headers: init.as ?? AS_PERSON,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} answered ${res.status}: ${await res.text()}`)
  return (await res.json()) as T
}

/** The page, opened fresh so a previous visit's state is not carried over. */
async function openAddress(address: string): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/${address}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/** The one card whose title is this, proved to be exactly one before it is read. */
function theCard(title: string) {
  return page.locator('.cnt-entry', { hasText: title })
}

describe('the card of a counter that waits for a count', () => {
  it('draws the waiting sentence beside the next due time in English and in Chinese', async () => {
    await openAddress('#/counters')
    const waiting = theCard(WAITING_TITLE)
    expect(await waiting.count(), 'the waiting counter has no card').toBe(1)
    // THE SENTENCE IS BESIDE THE NEXT DUE TIME: it sits inside the next-due paragraph.
    expect(await waiting.locator('.cnt-nextdue .cnt-waits').count()).toBe(1)
    expect(await waiting.locator('.cnt-nextdue').innerText()).toContain(en['g7a.counters.waitsForACount'])
    expect(await waiting.locator('.cnt-waits').innerText()).toBe(en['g7a.counters.waitsForACount'])
    // A TIMER IS NOT TOLD IT WAITS.
    const timer = theCard(TIMER_TITLE)
    expect(await timer.count(), 'the timer has no card').toBe(1)
    expect(await timer.locator('.cnt-nextdue').count()).toBe(1)
    expect(await timer.locator('.cnt-waits').count(), 'a timer was told it waits for a count').toBe(0)

    // AND THE PAGE'S OWN WORDS IN CHINESE.
    await openAddress('?lang=zh#/counters')
    const waitingZh = theCard(WAITING_TITLE)
    expect(await waitingZh.locator('.cnt-waits').innerText()).toBe(zh['g7a.counters.waitsForACount'])
    expect(await waitingZh.locator('.cnt-nextdue').innerText()).toContain(zh['g7a.counters.waitsForACount'])
    expect(await theCard(TIMER_TITLE).locator('.cnt-waits').count()).toBe(0)
  }, 120_000)

})

/**
 * THE PAGE AT FOUR WIDTHS IN BOTH THEMES, when a caller asks for the pictures. The Chinese page is
 * photographed too, because the sentence this round adds is drawn in both languages.
 */
async function photograph(): Promise<void> {
  if (shots === undefined) return
  mkdirSync(shots, { recursive: true })
  for (const width of [1440, 990, 660, 390]) {
    for (const theme of ['light', 'dark']) {
      for (const language of width === 1440 ? ['en', 'zh'] : ['en']) {
        await page.setViewportSize({ width, height: 1000 })
        await openAddress(`${language === 'zh' ? '?lang=zh' : ''}#/counters`)
        await page.evaluate((next) => {
          document.documentElement.dataset.theme = next
        }, theme)
        await page.screenshot({
          path: join(shots, `counter-waits-${String(width)}-${theme}-${language}.png`),
          fullPage: true,
        })
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
}
