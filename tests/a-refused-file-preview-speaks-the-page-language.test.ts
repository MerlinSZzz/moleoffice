// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FILE PREVIEW THE OFFICE REFUSED SAYS SO IN THE PAGE'S LANGUAGE. Problem op63gTnYuhKB.
 *
 * The box drawn where a refused picture would be said "REFUSED", "Mole Office will not serve this file
 * (HTTP …)." and "Why" in English on a page set to Chinese: `previewStand` in
 * src/web/components/SummaryBlocks.tsx wrote them itself. They are word-list words now.
 *
 * WHAT THIS PROVES, IN A REAL BROWSER:
 *   - in Chinese, the refused picture's tag, the page's own sentence in front of the door's reason, and
 *     the fold's summary are the Chinese words, and their English is not in the box;
 *   - in the test language the tag, the sentence and the summary are marked.
 *
 * WHAT IS LEFT IN ENGLISH, ON PURPOSE: the door's own reason and its whole account, which the server
 * writes (GET /api/file). The box draws them after the page's sentence, as they came.
 *
 * THE PICTURE IS MADE UP AND IS NEVER MADE. Its path is outside every preview root, so the door refuses
 * it before it opens anything; the same path tests/media-shows-from-another-machine.test.ts uses.
 *
 * THE MUTATION THIS IS WRITTEN AGAINST, after a control run: in `previewStand`, give the refused case its
 * English tag back (`tag: 'refused'`). The Chinese case goes red on the tag, and the test-language case
 * goes red on the unmarked tag. Restored, green again.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { join } from 'node:path'
import { liveApp, type LiveApp, waitForThePage } from './helpers.ts'
import { testShots } from './where-shots-go.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { createI18n } from '../src/shared/i18n.ts'

const SHOTS = testShots('refused-preview')

const AS_THE_PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** A path outside every preview root. The door refuses it by its name alone; it is never created. */
const OUTSIDE = '/__mole_office_preview_fixture__/words-outside/lantern.png'

let app: LiveApp
let page: Page
let recordId = ''

async function open(lang: 'zh' | 'xx'): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto(`${app.site}/?lang=${lang}#/r/${recordId}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('.sb-image-stand[data-preview="refused"]').waitFor({ timeout: 30_000 })
}

/** The refused box: its tag, its first sentence, the fold's summary and all its text. */
async function theBox(): Promise<{ tag: string; said: string; why: string | null; text: string }> {
  return page.$eval('.sb-image-stand[data-preview="refused"]', (box) => ({
    tag: (box.querySelector('.sb-image-tag')?.textContent ?? '').trim(),
    said: (box.querySelector(':scope > p')?.textContent ?? '').trim(),
    why: box.querySelector('.sb-image-more summary')?.textContent?.trim() ?? null,
    text: box.textContent ?? '',
  }))
}

beforeAll(async () => {
  app = await liveApp({ name: 'refused-preview-words', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  page = app.page
  const res = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({
      kind: 'module',
      title: 'The lantern archive scanner',
      summary: 'A made-up module with one picture nobody said Mole Office may read.',
      data: {
        context: 'Stands in for a module whose picture is outside every preview root.',
        parts: [],
        summaryBlocks: [{ id: 'outside', type: 'image', path: OUTSIDE, alt: 'A picture outside every root.' }],
      },
    }),
  })
  expect(res.status, await res.clone().text()).toBe(201)
  recordId = ((await res.json()) as { record: { id: string } }).record.id
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('a refused file preview', () => {
  it('says it was refused in Chinese, before the door\'s own reason', async () => {
    const zh = createI18n('zh')
    const en = createI18n('en')
    await open('zh')
    const box = page.locator('.sb-image-stand[data-preview="refused"]')
    await box.scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(SHOTS, 'refused-preview-1440-zh-light.png') })
    const seen = await theBox()
    expect(seen.tag).toBe(zh.t('sb.stand.tag.refused'))
    const [before] = zh.t('sb.stand.refused', { status: '\u0000', why: '' }).split('\u0000')
    expect(seen.said.startsWith(before!), seen.said).toBe(true)
    if (seen.why !== null) expect(seen.why).toBe(zh.t('sb.stand.why'))
    const [englishBefore] = en.t('sb.stand.refused', { status: '\u0000', why: '' }).split('\u0000')
    expect(seen.text).not.toContain(englishBefore!.trim())
  })

  it('marks the tag, the sentence and the summary in the test language', async () => {
    await open('xx')
    const seen = await theBox()
    expect(seen.tag).toMatch(/^⟦/)
    expect(seen.said).toMatch(/^⟦/)
    if (seen.why !== null) expect(seen.why).toMatch(/^⟦/)
  })
})
