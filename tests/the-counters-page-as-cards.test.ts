// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE COUNTERS PAGE AS CARDS, AND ITS LABELS READ AS ONE SENTENCE. Criterion CT8 of
 * design/counters/ACCEPTANCE.md, and problem Q4Tei3luPVtT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES
 * ---------------------------------------------------------------------------------------
 *
 * The counters page draws each counter as a card: the counter's title, its state word beside the
 * title, its count as the big number, and what the count counts in words under it. The cards use
 * the width at 1440 and are one column on a phone.
 *
 * A LABEL AND ITS TIME ARE ONE SENTENCE. The words "Last fired {when}" and "Next due {when}" live
 * in the word lists, so the space between a label and its time is part of the sentence and cannot
 * be lost again. The time itself is still a real time element. This is read in English and in
 * Chinese, because the bug this file guards against was "Last fired4m ago" in both languages.
 *
 * NO NEEDS YOU GROUP. A counter that a held firing is waiting on fires by itself later, so nothing
 * on this page is the reader's move and the page draws no group of what needs them.
 *
 * THE FIXTURE FIRES. A counter with a count trigger of three and a twelve-hour timer is filed, and
 * five additions are made: the third fires it and resets the count, and the fourth and fifth leave
 * it standing at two. So the card has a standing count, a last firing and a next due moment all at
 * once, which is what the three claims above need.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { en } from '../src/shared/words/en.ts'
import { zh } from '../src/shared/words/zh.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

/** Where the four-width, two-theme pictures go when a caller asks for them. */
const shots = process.env.W13J_COUNTERS_SHOTS

const AS_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}

let app: LiveApp
let page: Page
let theCounter = ''

beforeAll(async () => {
  app = await liveApp({ name: 'counters-page-as-cards', viewport: { width: 1440, height: 1000 } })
  page = app.page
}, 240_000)

/**
 * FILE A COUNTER THAT HAS FIRED AND IS COUNTING AGAIN.
 *
 * A registered agent files it, because the door keeps who filed it and refuses a caller no registry
 * holds. The count trigger fires on the third addition; the fourth and fifth then stand the count at
 * two, and the twelve-hour timer gives the card a next due moment.
 */
beforeAll(async () => {
  await callApi('/api/agents/started', {
    method: 'POST',
    body: { handle: 'counters-cards-keeper', name: 'The counters cards keeper' },
  })
  const asKeeper = {
    'content-type': 'application/json',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': 'counters-cards-keeper',
    'x-mole-office-workspace': 'default',
  }
  const made = await callApi<{ counter: { id: string } }>('/api/counters', {
    method: 'POST',
    as: asKeeper,
    body: {
      title: 'Gripper trials for the cards page',
      counts: 'Trials run on the gripper while the cards page is read.',
      triggers: [
        { kind: 'count', n: 3 },
        { kind: 'every', hours: 12 },
      ],
      action: { kind: 'task', title: 'Look at the gripper numbers' },
    },
  })
  theCounter = made.counter.id
  for (const because of ['One trial.', 'Two trials.', 'Three trials.', 'Four trials.', 'Five trials.']) {
    await callApi(`/api/counters/${encodeURIComponent(theCounter)}/add`, {
      method: 'POST',
      as: asKeeper,
      body: { by: 1, because },
    })
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

/** The one counter's card, proved to be exactly one before it is read. */
async function theCard() {
  const cards = page.locator('.cnt-entry')
  expect(await cards.count(), 'the page did not draw exactly one card').toBe(1)
  return cards.first()
}

describe('the counters page draws each counter as a card', () => {
  it('draws the count as the big number, with the state word beside the title', async () => {
    await openAddress('#/counters')
    const card = await theCard()
    // The count is the number the counter stands at: two additions after the firing reset it.
    expect(await card.locator('.cnt-count').innerText()).toBe('2')
    // It is drawn bigger than the card's own title, which is what the big number means.
    const countPx = Number.parseFloat(
      await card.locator('.cnt-count').evaluate((el) => getComputedStyle(el).fontSize),
    )
    const namePx = Number.parseFloat(
      await card.locator('.cnt-name').evaluate((el) => getComputedStyle(el).fontSize),
    )
    expect(countPx, `the count is ${String(countPx)}px and the title is ${String(namePx)}px`).toBeGreaterThan(namePx)
    // What the count counts is said in words under it.
    expect(await card.locator('.cnt-counts').innerText()).toContain('Trials run on the gripper')
    // The state word comes from the counter's own state: it is running, so it says Active.
    expect(await card.locator('.cnt-state').innerText()).toBe('Active')
  }, 120_000)

  it('reads a label and its time as one sentence, in English and in Chinese', async () => {
    await openAddress('#/counters')
    let card = await theCard()
    const last = await card.locator('.cnt-last').innerText()
    expect(last, `an English card read "${last}"`).toMatch(/^Last fired \S/)
    expect(last, `an English card read "${last}"`).not.toMatch(/^Last fired\S/)
    expect(await card.locator('.cnt-last time').getAttribute('dateTime')).toBeTruthy()
    const next = await card.locator('.cnt-nextdue').innerText()
    expect(next, `an English card read "${next}"`).toMatch(/^Next due \S/)
    expect(next, `an English card read "${next}"`).not.toMatch(/^Next due\S/)
    expect(await card.locator('.cnt-nextdue time').getAttribute('dateTime')).toBeTruthy()

    await openAddress('?lang=zh#/counters')
    card = await theCard()
    const lastZh = await card.locator('.cnt-last').innerText()
    expect(lastZh, `a Chinese card read "${lastZh}"`).toContain(zh['g7a.counters.lastWhen'].replace('{when}', ''))
    expect(lastZh, `a Chinese card read "${lastZh}"`).toMatch(/^上次触发\s/)
    const nextZh = await card.locator('.cnt-nextdue').innerText()
    // The Chinese due line puts the time first and joins it to 下次触发 with no space: "12 小时后下次触发" (round 33c).
    expect(nextZh, `a Chinese card read "${nextZh}"`).toContain(zh['g7a.counters.nextWhen'].replace('{when}', ''))
    expect(nextZh, `a Chinese card read "${nextZh}"`).toMatch(/^\S.*后下次触发/)
    expect(nextZh, `a Chinese card read "${nextZh}"`).not.toMatch(/\s下次触发/)
    expect(await card.locator('.cnt-state').innerText()).toBe(zh['g7a.counters.active'])
  }, 120_000)

  it('uses the width side by side at 1440 and one column on a phone', async () => {
    await openAddress('#/counters')
    const wide = await page.locator('.cnt-list').evaluate((el) => getComputedStyle(el).gridTemplateColumns)
    expect(wide.trim().split(/\s+/).length, `the 1440 grid was "${wide}"`).toBeGreaterThan(1)
    await page.setViewportSize({ width: 390, height: 900 })
    const narrow = await page.locator('.cnt-list').evaluate((el) => getComputedStyle(el).gridTemplateColumns)
    expect(narrow.trim().split(/\s+/).length, `the 390 grid was "${narrow}"`).toBe(1)
    await page.setViewportSize({ width: 1440, height: 1000 })
  }, 120_000)

  it('draws no Needs you group and no Nothing needs you line', async () => {
    await openAddress('#/counters')
    const text = await page.locator('.cnt').innerText()
    expect(text).not.toContain(en['reports.needsYou'])
    expect(text).not.toContain(en['reports.nothingNeedsYou'])
    expect(await page.locator('[data-group="needs-you"]').count()).toBe(0)

    await openAddress('?lang=zh#/counters')
    const zhText = await page.locator('.cnt').innerText()
    expect(zhText).not.toContain(zh['reports.needsYou'])
    expect(zhText).not.toContain(zh['reports.nothingNeedsYou'])
    expect(await page.locator('[data-group="needs-you"]').count()).toBe(0)
  }, 120_000)

  // Rule R10 of report n9Mjk3c_sJRu, which a decision adopted: a box never holds a box. The
  // card is the box, so nothing between it and the page may draw a border of its own.
  it('draws each card one box deep: nothing around a card draws a border', async () => {
    await openAddress('#/counters')
    const card = await theCard()
    const boxes = await card.evaluate((element) => {
      const found: string[] = []
      for (let at = element.parentElement; at !== null && !at.classList.contains('cnt'); at = at.parentElement) {
        const style = getComputedStyle(at)
        const widths = [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth]
        if (widths.some((width) => parseFloat(width) > 0)) found.push(`${at.tagName.toLowerCase()}.${at.className}`)
      }
      return found
    })
    expect(boxes, `a card sits inside a box: ${boxes.join(', ')}`).toEqual([])
  }, 120_000)
})

/**
 * THE PAGE AT FOUR WIDTHS IN BOTH THEMES, when a caller asks for the pictures.
 *
 * The four widths are the ones chapter 6 names: the breakpoints at 40rem and 60rem cut the range
 * into three bands, and 1440 and 390 alone leave the middle band unphotographed. The Chinese page
 * is photographed at 1440 because the sentence this round fixed is drawn in both languages.
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
          path: join(shots, `counters-cards-${String(width)}-${theme}-${language}.png`),
          fullPage: true,
        })
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
}
