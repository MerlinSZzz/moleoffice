// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SCOPE'S OWN SENTENCE, IN THE COLUMN. Wave 13r round 19, piece 2. Under "What this review collects" the column
 * drew `rule.says`, the server's English with a record id in it, on a Chinese page as well. Round 18 gave the gaps
 * under it codes; this round gives the sentence one (`ScopeSays` in src/server/lib/reviews.ts), and the page draws
 * `review.scopeSays.<code>`, with the server's sentence in Developer mode only (decision z_A0xVMbWOzh).
 *
 * Two things were wrong besides the language. In English the server's sentence said the record had been deleted, and
 * the `recordDeleted` gap under it said so again: the page now says it once, in the gap. And the sentence and the
 * gaps sat with no space between them: they now have the column's own space, the space between the rows under More.
 *
 * The review is started on a module, a comment is written there, and the module is deleted, so the column has a
 * scope sentence and one gap under it. The page stood on is a report, which is not deleted.
 *
 * With TEST_SHOTS set, the last case photographs the review column with More open and the scope open, at 1440, 990,
 * 660 and 390, light and dark, in English and in Chinese, into the folder `r19-column` under it.
 *
 * Three-run proofs (control, mutation, restore) are in round 19's report. The mutations: the pane draws `rule.says`
 * in every mode, as before this round (the first two cases red); the rule spacing the sentence from its gaps taken
 * out (the third red).
 */

import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { setTheReviewTraysList } from './the-review-trays-list.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { testShots } from './where-shots-go.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { join } from 'node:path'

const HUMAN = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

const SHOTS = testShots('r19-column')
const MODULE = 'The made-up gripper'

let app: LiveApp
let page: Page
let reportId: string
let moduleId: string
let reviewId: string

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const reply = await fetch(`${app.api}${path}`, { method, headers: HUMAN, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  if (!reply.ok) throw new Error(`${method} ${path} answered ${String(reply.status)}: ${await reply.text()}`)
  return (await reply.json()) as T
}

/** The report page, with the review open in the column, More open and the scope open. */
async function open(lang: 'en' | 'zh', mode: 'normal' | 'inspect', look = 'light'): Promise<void> {
  await page.goto(`${app.site}/?lang=${lang}#/r/${reportId}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.evaluate(
    ([id, how, theme]) => {
      window.localStorage.setItem('mole-office.review', `open|${String(id)}|default||`)
      window.localStorage.setItem('mole-office.mode', String(how))
      window.localStorage.setItem('mole-office.preset.theme', String(theme))
    },
    [reviewId, mode, look],
  )
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  // THE TRAY'S LIST IS SHUT AT FIRST, at every width, so Show comments opens it before the pane's rows are read.
  await setTheReviewTraysList(page, 'open')
  const more = page.locator('details.px-b-more')
  await more.waitFor({ timeout: 30_000 })
  if (!(await more.evaluate((el) => (el as HTMLDetailsElement).open))) await more.locator('summary').click()
  const scope = page.locator('details.px-pane-scope')
  await scope.waitFor({ timeout: 30_000 })
  if (!(await scope.evaluate((el) => (el as HTMLDetailsElement).open))) await scope.locator('summary').click()
  await page.locator('[data-part="scope-says"]').waitFor({ timeout: 30_000 })
}

/** What the scope said, and the gaps under it, as text. */
async function scope(): Promise<{ says: string; gaps: string[] }> {
  return page.evaluate(() => {
    const text = (el: Element | null): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
    return {
      says: text(document.querySelector('[data-part="scope-says"]')),
      gaps: [...document.querySelectorAll('[data-part="scope-gap"]')].map(text),
    }
  })
}

beforeAll(async () => {
  app = await liveApp({ name: 'review-scope-sentence-in-the-column', viewport: { width: 1440, height: 1000 } })
  page = app.page
  reportId = (
    await call<{ record: { id: string } }>('POST', '/api/records', {
      kind: 'report',
      title: 'Where the made-up review is read from',
      data: { blocks: [{ id: 'b-1', type: 'text', text: 'A page to stand on while the review is open.' }] },
    })
  ).record.id
  moduleId = (
    await call<{ record: { id: string } }>('POST', '/api/records', {
      kind: 'module',
      title: MODULE,
      data: { context: 'x', summaryBlocks: [{ id: 'b-1', type: 'text', text: 'What this made-up module is for.' }] },
    })
  ).record.id
  const on = { target: { kind: 'record', recordId: moduleId, workspaceId: 'default' } }
  reviewId = (await call<{ review: { id: string } }>('POST', '/api/reviews', { entry: on })).review.id
  await call('POST', '/api/records', { kind: 'annotation', title: 'a remark', data: { body: 'The made-up grip slips.', context: on } })
  await call('DELETE', `/api/records/${moduleId}`)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe("the review's scope, under What this review collects", () => {
  it.each(['en', 'zh'] as const)('%s: says what it holds in the page’s language, with no id', async (lang) => {
    await open(lang, 'normal')
    const t = createI18n(lang).t
    const { says, gaps } = await scope()
    expect(says).toBe(t('review.scopeSays.recordAlone', { title: MODULE }))
    expect(gaps).toEqual([t('review.scopeGap.recordDeleted')])
    expect(says, 'the server’s sentence is drawn outside Developer mode').not.toContain(moduleId)
    // THE MODULE'S TITLE IS ITS WRITER'S WORDS, in English here, and is drawn as written.
    if (lang === 'zh') expect(says.replace(MODULE, ''), 'English on the Chinese page').not.toMatch(/[A-Za-z]{4,}/)
  }, 120_000)

  it.each([
    ['en', /deleted/gi],
    ['zh', /删除/g],
  ] as const)('%s: says once that the record was deleted', async (lang, deleted) => {
    await open(lang, 'normal')
    const { says, gaps } = await scope()
    expect([says, ...gaps].join(' ').match(deleted) ?? [], `${says} | ${gaps.join(' | ')}`).toHaveLength(1)
  }, 120_000)

  it.each(['en', 'zh'] as const)('%s: stands the sentence apart from its gap by the column’s own space', async (lang) => {
    await open(lang, 'normal')
    const measured = await page.evaluate(() => {
      const says = document.querySelector('[data-part="scope-says"]')?.getBoundingClientRect()
      const gap = document.querySelector('[data-part="scope-gap"]')?.getBoundingClientRect()
      const more = document.querySelector('.px-b-more-body')
      return {
        space: says === undefined || gap === undefined ? null : gap.top - says.bottom,
        column: more === null ? null : parseFloat(getComputedStyle(more).rowGap),
      }
    })
    expect(measured.column, 'the space between the rows under More could not be read').toBeGreaterThan(0)
    expect(measured.space, JSON.stringify(measured)).toBeCloseTo(measured.column ?? -1, 0)
  }, 120_000)

  it('in Developer mode, draws the server’s own sentence, which names the record', async () => {
    await open('zh', 'inspect')
    const { says } = await scope()
    expect(says).toContain(moduleId)
  }, 120_000)
})

it.skipIf(!process.env['TEST_SHOTS'])('photographs the column at four widths, in both looks and both languages', async () => {
  for (const lang of ['en', 'zh'] as const) {
    for (const look of ['light', 'dark']) {
      for (const width of [1440, 990, 660, 390]) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto('about:blank')
        await open(lang, 'normal', look)
        // THE COLUMN'S OWN BOX IS SCROLLED, AND NOT THE PAGE, so More's heading is at the top of the column and the
        // column still starts under the bar above the page. At 390 the sheet's head stays put as it scrolls, so the
        // heading is brought to the foot of that head and not under it.
        await page.locator('details.px-b-more > summary').evaluate((el) => {
          let box = el.parentElement
          while (box !== null && !(/(auto|scroll)/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight)) {
            box = box.parentElement
          }
          if (box === null) return
          const stuck = [...box.querySelectorAll('*')].filter((s) => getComputedStyle(s).position === 'sticky' && !s.contains(el))
          const top = Math.max(box.getBoundingClientRect().top, ...stuck.map((s) => s.getBoundingClientRect().bottom))
          box.scrollTop += el.getBoundingClientRect().top - top - 8
        })
        await new Promise((r) => setTimeout(r, 500))
        await page.screenshot({ path: join(SHOTS, `column-${String(width)}-${look}-${lang}.png`) })
      }
    }
  }
}, 600_000)
