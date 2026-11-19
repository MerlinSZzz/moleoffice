// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
/** A page selection keeps a readable opening and says when the rest was left off. */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Context } from '../src/shared/targets.ts'
import { SHOWN_CHARACTERS, shortenToWords } from '../src/shared/shortening.ts'
import { goKeeping, keepTheCommentInAReview, liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const REPORT_TITLE = 'A long report about the mast'
const REPORT_WORDS = 'The mast moved through the trial and stayed under observation.'
const LONG_BLOCK = Array.from({ length: 62 }, () => REPORT_WORDS).join(' ')
const LONG_BLOCKS = Array.from({ length: 60 }, (_, at) => ({
  id: `b-${String(at + 1)}`,
  type: 'text',
  heading: `What happened ${String(at + 1)}`,
  text: LONG_BLOCK,
}))
const SHORT_QUOTE = 'The mast moved'

let app: LiveApp
let page: Page
let reportId = ''
let cutSpanCommentId = ''

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
      'x-mole-office-workspace': 'default',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as Record<string, unknown>
}

async function openReport(): Promise<void> {
  await page.keyboard.press('Escape')
  // KEEP IS ANSWERED IF ASKED: a comment kept with Start review leaves a review not sent behind it.
  await goKeeping(page, `${app.site}/#/r/${reportId}`)
  await waitForThePage(page, 60_000)
  // THE FIRST PARAGRAPH IS WHAT BOTH CASES SELECT FROM, so its drawing is the moment the old
  // fixed 500 ms stood in for.
  await page.locator('[data-text-field="data.blocks[#b-1].text"]').first().waitFor({ timeout: 30_000 })
}

async function selectAndOpen(selection: 'page' | 'short'): Promise<string> {
  const selected = await page.evaluate(({ which, short }) => {
    const main = document.getElementById('main')
    const run = document.querySelector<HTMLElement>('[data-text-field="data.blocks[#b-1].text"]')
    if (main === null || run === null) throw new Error('the report page or its text is not drawn')

    const range = document.createRange()
    if (which === 'page') {
      range.selectNodeContents(main)
    } else {
      const walker = document.createTreeWalker(run, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode() as Text | null
      while (node !== null && !node.textContent?.includes(short)) node = walker.nextNode() as Text | null
      if (node === null) throw new Error('the short words are not in one text run')
      const from = node.data.indexOf(short)
      range.setStart(node, from)
      range.setEnd(node, from + short.length)
    }
    const words = range.toString().trim()
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    run.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    return words
  }, { which: selection, short: SHORT_QUOTE })
  await page.waitForSelector('.px-talk textarea', { timeout: 20_000 })
  const cutMark = page.locator('.px-talk-chip-cut')
  if (selection === 'page') {
    await cutMark.first().waitFor({ state: 'visible', timeout: 20_000 })
    expect((await cutMark.first().innerText()).trim()).toBe('…')
  } else {
    expect(await cutMark.count()).toBe(0)
  }
  return selected
}

/**
 * Keep a comment and read back the place it was stored with.
 *
 * START REVIEW IS THE KEEPING PRESS IN SHAPE B, which replaced Save without sending. It writes the
 * comment first and then starts the report's review; the stored place is what this file reads. Since
 * wave 13x round 22, once that review collects here, the keeping press is Add to review in its place
 * (`keepTheCommentInAReview`).
 */
async function saveComment(body: string): Promise<{ id: string; context: Context }> {
  await page.locator('.px-talk textarea').first().fill(body)
  await keepTheCommentInAReview(page)
  await page.waitForSelector('.px-talk-said', { timeout: 20_000 })
  const res = await fetch(`${app.api}/api/messages/comments`, {
    headers: { 'x-mole-office-workspace': 'default' },
  })
  const reply = (await res.json()) as {
    comments?: { kind: string; id?: string; data?: { body?: string; context?: Context; target?: Context } }[]
  }
  const found = reply.comments?.find((one) => one.data?.body === body)
  if (found === undefined) throw new Error(`the saved comment is missing: ${JSON.stringify(reply).slice(0, 300)}`)
  const context = (found.kind === 'annotation' ? found.data?.context : found.data?.target) ?? null
  if (context === null) throw new Error('the saved comment has no context')
  return { id: found.id ?? '', context }
}

beforeAll(async () => {
  app = await liveApp({ name: 'long-place-quote', viewport: { width: 1440, height: 1000 }, opensAt: 'full' })
  page = app.page
  const made = await post('/api/records', {
    kind: 'report',
    title: REPORT_TITLE,
    data: {
      for: `${THE_TEST_OFFICES_OWNER.name}, who asked for the report`,
      date: '2026-09-30',
      blocks: LONG_BLOCKS,
    },
  })
  reportId = ((made['record'] as { id: string }).id)
  const shortened = shortenToWords(LONG_BLOCK)
  const cutComment = await post('/api/records', {
    kind: 'annotation',
    title: 'The opening of a long paragraph',
    data: {
      body: 'The opening of this long paragraph is enough to find it.',
      context: {
        target: { kind: 'reportBlock', recordId: reportId, blockId: 'b-1' },
        place: {
          at: 'words',
          span: { quote: shortened.words, from: 0, to: LONG_BLOCK.length, field: 'data.blocks[#b-1].text' },
          cut: true,
        },
      },
    },
  })
  cutSpanCommentId = ((cutComment['record'] as { id: string }).id)
  await openReport()
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('a comment on a long page keeps only the opening words', () => {
  it('stores a bounded quote when the whole page is selected', async () => {
    await openReport()
    const selected = await selectAndOpen('page')
    expect(selected.length).toBeGreaterThan(200_010)
    const shortened = shortenToWords(selected)
    expect(shortened.shortened).toBe(true)
    expect(shortened.words.length).toBeLessThanOrEqual(SHOWN_CHARACTERS)

    const saved = await saveComment('The whole-page selection is too much to quote.')
    expect(saved.context.target.kind).toBe('page')
    expect(saved.context.place).toEqual({ at: 'quote', words: shortened.words, cut: true })
  }, 120_000)

  it('keeps a short selected quote unchanged and leaves off the cut flag', async () => {
    await openReport()
    const selected = await selectAndOpen('short')
    expect(selected).toBe(SHORT_QUOTE)

    const saved = await saveComment('This short passage is the one I mean.')
    expect(saved.context.place).toMatchObject({ at: 'words', span: { quote: SHORT_QUOTE } })
    expect(saved.context.place).not.toHaveProperty('cut')
  }, 120_000)

  it.skipIf(!process.env['W13R_CX_QUOTE_SHOTS'])('photographs the stored cut quote at the requested widths and looks', async () => {
    const folder = process.env['W13R_CX_QUOTE_SHOTS'] as string
    mkdirSync(folder, { recursive: true })
    const takes = [
      ...[1440, 990, 660, 390].flatMap((width) =>
        (['light', 'dark'] as const).map((theme) => ({ width, theme, lang: 'en' })),
      ),
      { width: 1440, theme: 'light' as const, lang: 'zh' },
    ]
    for (const take of takes) {
      await page.setViewportSize({ width: take.width, height: 1000 })
      await goKeeping(page, `${app.site}/?lang=${take.lang}#/r/${cutSpanCommentId}`)
      await page.evaluate((theme) => localStorage.setItem('mole-office.preset.theme', theme), take.theme)
      await page.reload({ timeout: 60_000 })
      await waitForThePage(page, 60_000)
      await page.locator('.rd-quote').waitFor({ timeout: 20_000 })
      expect(await page.locator('.rd-quote').innerText()).toContain('…')
      expect(await page.locator('html').getAttribute('lang')).toBe(take.lang)
      expect(await page.locator('html').getAttribute('data-theme')).toBe(take.theme)
      await page.screenshot({
        path: join(folder, `long-place-quote-${String(take.width)}-${take.theme}-${take.lang}.png`),
        fullPage: true,
      })
      await goKeeping(page, `${app.site}/?lang=${take.lang}#/r/${reportId}`)
      await page.evaluate((theme) => localStorage.setItem('mole-office.preset.theme', theme), take.theme)
      await page.reload({ timeout: 60_000 })
      await waitForThePage(page, 60_000)
      await selectAndOpen('page')
      await page.screenshot({ path: join(folder, `talk-box-cut-mark-${String(take.width)}-${take.theme}-${take.lang}.png`) })
    }
  }, 240_000)
})
