// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * VIEW ORIGINAL, PRESSED ON A REPORT'S CONCLUSION, SAYS WHERE IT WENT.
 *
 * Problem ZSQ8bXde_50E. The composer on the conclusion offers View original. The press puts the
 * page at Full, and Full draws no conclusion. The box that holds the press worked out which reading
 * length was pressed from what the page draws now, so at Full it answered "none" and drew nothing.
 * The sentence the press prints, saying where it went, went with it.
 *
 * tests/view-original-lands-where-it-says.test.ts checks that the press is offered, and
 * tests/a-form-with-no-recorded-parts-stands-for-the-whole-record.test.ts checks where it lands.
 * Neither waited for the sentence after a real click. This file does.
 *
 * It needs a browser because the sentence lives in React state that only a real click fills.
 */

import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { DETAIL_KEY_EVERYWHERE, READER_FLOOR } from '../src/shared/detail.ts'
import { sectionRegionId } from '../src/shared/regions.ts'
import { SUMMARY_LINE_KEY } from '../src/shared/sections.ts'
import { targetAttributeValue } from '../src/shared/targets.ts'

const HUMAN = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': 'robin-okafor',
}

/** Long enough that the report does not fit one screen at Full. */
const BLOCKS = Array.from({ length: 8 }, (_, i) => ({
  id: `b-${String(i + 1)}`,
  type: 'text',
  heading: `What trial ${String(i + 1)} showed`,
  text: Array.from({ length: 10 }, (_, n) => `Sentence ${String(n + 1)} of trial ${String(i + 1)}, long enough to give the block height.`).join(' '),
}))

let app: LiveApp
let page: Page
let reportId: string

beforeAll(async () => {
  app = await liveApp({ name: 'view-original-says-where', viewport: { width: 1440, height: 1000 } })
  page = app.page
  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: HUMAN,
    body: JSON.stringify({
      kind: 'report',
      title: 'How the greenhouse sensors held up over the winter',
      data: { blocks: BLOCKS },
      summary: 'Two of the five humidity sensors drifted by more than the allowed margin, so both are replaced.',
    }),
  })
  if (!made.ok) throw new Error(`seeding the report answered ${String(made.status)}: ${await made.text()}`)
  reportId = ((await made.json()) as { record: { id: string } }).record.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** The sentences inside the composer's stands-for block, in order. */
async function theSentences(): Promise<string[]> {
  return page.evaluate(() => {
    const talk = [...document.querySelectorAll('.px-talk')].find(
      (one) => one.getAttribute('data-target') === 'uiSurface/composer',
    )
    return [...(talk?.querySelectorAll('.px-talk-stands .px-talk-said') ?? [])].map((e) => (e.textContent ?? '').trim())
  })
}

/** Open the report at the conclusion, in one page language, and press View original on it. */
async function pressOnTheConclusion(lang: 'en' | 'zh', press: string): Promise<void> {
  await page.goto(`${app.site}/${lang === 'en' ? '' : `?lang=${lang}`}#/r/${reportId}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.evaluate(
    ([key, length]) => void window.localStorage.setItem(key as string, length as string),
    [DETAIL_KEY_EVERYWHERE, READER_FLOOR],
  )
  await page.evaluate(() => {
    window.localStorage.removeItem('mole-office.detail.reportContent')
    window.sessionStorage.removeItem('mole-office.detail.local.reportContent')
  })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  const where = `[data-target="${targetAttributeValue({
    kind: 'region',
    recordId: reportId,
    regionId: sectionRegionId(SUMMARY_LINE_KEY),
  })}"]`
  await page.locator(where).first().waitFor({ timeout: 30_000 })
  await page.locator(where).first().click({ button: 'right' })
  const talk = page.locator('.px-talk[data-target="uiSurface/composer"]')
  await talk.getByRole('button', { name: press }).waitFor({ timeout: 15_000 })
  await talk.getByRole('button', { name: press }).click({ timeout: 15_000 })
  // The landing waits for the scroll to stop before it answers, so this waits for the second
  // sentence rather than sampling once.
  await page.waitForFunction(
    () => {
      const box = [...document.querySelectorAll('.px-talk')].find(
        (one) => one.getAttribute('data-target') === 'uiSurface/composer',
      )
      return (box?.querySelectorAll('.px-talk-stands .px-talk-said').length ?? 0) >= 2
    },
    undefined,
    { timeout: 20_000 },
  )
}

describe('View original on the conclusion', () => {
  it('keeps the box and prints where the press went, after the page has gone to Full', async () => {
    await pressOnTheConclusion('en', 'View original')
    // The sentence about what the conclusion stands for, and a second one saying where it went.
    const after = await theSentences()
    expect(after).toHaveLength(2)
    expect(after[0]).toBe('Stands for the whole report.')
    // The press lands on the first drawn piece of the whole report, and reads back how much is
    // drawn. Both halves come from viewTheOriginal in src/web/components/agent/original.ts.
    expect(after[1]).toContain('the whole report')
    expect(after[1]).toContain('The whole report is drawn.')
  }, 120_000)
})
