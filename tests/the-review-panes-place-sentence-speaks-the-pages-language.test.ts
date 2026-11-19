// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SENTENCE UNDER A COMMENT THAT SAYS WHERE IT WAS WRITTEN IS IN THE PAGE LANGUAGE. Wave 13r round 16, piece 1,
 * item 3 (check LKIg1xz-PjD-): on a Chinese page the review pane drew a comment on a part of a report with the
 * server's English sentence, "the paragraph “…” in the report “…”". It is now said from the word lists
 * (`wherePartIsOnThisPage` in src/web/components/agent/context.ts).
 *
 * Three comments, on three kinds of place: the whole report, its body, and one paragraph. Words quoted from the
 * report (its title, the paragraph's own words) are taken out first, since they are the author's words in the
 * language the author wrote them. What is left must hold no Latin letter, and each place is said its own way.
 *
 * The English page keeps its sentences: tests/the-review-pane-names-which-part.test.ts and
 * tests/the-review-pane-names-the-place.test.ts read them, and both pass with this change.
 *
 * With TEST_SHOTS set, the last case photographs the sentences at 1440, 990, 660 and 390, light and dark, in English
 * and in Chinese, into the folder `r16-place-sentence` under it.
 *
 * Three-run proof (control, mutation, restore) is in round 16's report. The mutation: `whereItWasWritten` in
 * ReviewBar.tsx hands a comment on a part the server's sentence again.
 */

import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { setTheReviewTraysList } from './the-review-trays-list.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { recordRegionsOf, type Region } from '../src/shared/regions.ts'
import { testShots } from './where-shots-go.ts'
import { join } from 'node:path'

const HUMAN = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

const TITLE = 'What the kiln log said about the second firing'
const BLOCKS = [
  { id: 'b-1', type: 'text', text: 'The left shelf sagged by two millimetres between the firings.' },
  { id: 'b-2', type: 'text', heading: 'What moved', text: 'The kiln held its temperature for the whole hour.' },
]

let app: LiveApp
let page: Page
let reportId: string

async function post<T>(path: string, body: unknown): Promise<T> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers: HUMAN, body: JSON.stringify(body) })
  if (!reply.ok) throw new Error(`${path} answered ${String(reply.status)}: ${await reply.text()}`)
  return (await reply.json()) as T
}

function everyPart(root: Region): Region[] {
  const all: Region[] = [root]
  for (const child of root.children) all.push(...everyPart(child))
  return all
}

beforeAll(async () => {
  app = await liveApp({ name: 'pane-place-in-the-pages-language', viewport: { width: 1440, height: 1200 } })
  page = app.page
  reportId = (await post<{ record: { id: string } }>('/api/records', { kind: 'report', title: TITLE, data: { blocks: BLOCKS } })).record.id

  const read = (await (await fetch(`${app.api}/api/records/${reportId}`, { headers: HUMAN })).json()) as {
    record: { kind: string; data: Record<string, unknown>; title: string; summary: string | null }
  }
  const all = everyPart(
    recordRegionsOf({ kind: read.record.kind as never, data: read.record.data, title: read.record.title, summary: read.record.summary, relations: [] }),
  )
  const one = (role: string): Region => {
    const found = all.find((region) => region.role === role && region.declared !== true)
    if (found === undefined) throw new Error(`the report has no ${role} to comment on`)
    return found
  }

  const review = await post<{ review: { id: string } }>('/api/reviews', {
    entry: { target: { kind: 'record', recordId: reportId, workspaceId: 'default' } },
  })
  for (const region of [one('recordRoot'), one('reportBody'), one('paragraph')]) {
    await post('/api/records', {
      kind: 'annotation',
      title: `on the ${region.role}`,
      data: { body: `A remark on the ${region.role}.`, context: { target: { kind: 'region', recordId: reportId, regionId: region.id } } },
    })
  }

  await page.goto(`${app.site}/?lang=zh#/r/${reportId}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.evaluate(([id]) => {
    window.localStorage.setItem('mole-office.review', `open|${String(id)}|default||`)
  }, [review.review.id])
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  // THE TRAY'S LIST IS SHUT AT FIRST, so Show comments opens it before the pane's own rows are read.
  await setTheReviewTraysList(page, 'open')
  const more = page.locator('details.px-b-more')
  await more.waitFor({ timeout: 30_000 })
  if (!(await more.evaluate((el) => (el as HTMLDetailsElement).open))) await more.locator('summary').click()
  await page.locator('.px-rev-item').first().waitFor({ timeout: 30_000 })
  await new Promise((r) => setTimeout(r, 1500))
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Every place sentence the pane drew: the ones naming the report. */
async function placeSentences(): Promise<string[]> {
  return page.evaluate((title) => {
    const out: string[] = []
    for (const one of document.querySelectorAll('.px-rev-where')) {
      const text = (one.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (text.includes(title as string)) out.push(text)
    }
    return out
  }, TITLE)
}

describe('on a Chinese page, the pane says where each comment was written in Chinese', () => {
  it('draws one place sentence for each of the three comments', async () => {
    expect(await placeSentences()).toHaveLength(3)
  })


  it('says the whole report, its body and a paragraph each its own way', async () => {
    const said = await placeSentences()
    expect(said.some((one) => one.startsWith('整个')), said.join(' | ')).toBe(true)
    expect(said.some((one) => one.endsWith('的正文')), said.join(' | ')).toBe(true)
    expect(said.some((one) => one.includes('”中的')), said.join(' | ')).toBe(true)
  })
})

it.skipIf(!process.env['TEST_SHOTS'])('photographs the place sentences at four widths, in both looks and both languages', async () => {
  const shots = testShots('r16-place-sentence')
  for (const lang of ['en', 'zh'] as const) {
    for (const look of ['light', 'dark']) {
      for (const width of [1440, 990, 660, 390]) {
        await page.setViewportSize({ width, height: 900 })
        await page.evaluate((one) => localStorage.setItem('mole-office.preset.theme', one), look)
        await page.goto('about:blank')
        await page.goto(`${app.site}/?lang=${lang}#/r/${reportId}`, { timeout: 60_000 })
        await waitForThePage(page, 60_000)
        await setTheReviewTraysList(page, 'open')
        const more = page.locator('details.px-b-more')
        await more.waitFor({ timeout: 30_000 })
        if (!(await more.evaluate((el) => (el as HTMLDetailsElement).open))) await more.locator('summary').click()
        const where = page.locator('.px-rev-where').first()
        await where.waitFor({ timeout: 30_000 })
        await where.evaluate((el) => el.scrollIntoView({ block: 'center' }))
        await new Promise((r) => setTimeout(r, 500))
        await page.screenshot({ path: join(shots, `place-${String(width)}-${look}-${lang}.png`) })
      }
    }
  }
}, 300_000)
