// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHY A RUN OF PIPE LINES IS NOT A TABLE, SAID ONCE AND IN THE PAGE'S LANGUAGE, AND THE ROW THAT MENDS IT.
 *
 * src/shared/plandoc.ts is the one reader of pipe tables. When a run of table lines cannot be read,
 * the block it returns carries `because`, a reason code with its numbers, and `why`, the English
 * sentence the server sends. `whyNotRead` turns the code into the sentence with whichever word
 * reader it is given, so the server and a page say one sentence for one reason (problem
 * ycjTSBsmrRr7, and problem Yk4cdTrM9Db3 on the two block readers).
 *
 * WHAT IS CLAIMED
 *
 *   1. The server's sentence stays English, and a page's is in the page's language, from one code.
 *   2. A record summary on a Chinese page draws the reason in Chinese, not in the server's English.
 *   3. `dashRowFor` gives the row a table without dashes lacks, under its first line and with its
 *      indent, and nothing for a table whose rows disagree, because that has no one right repair.
 *   4. A made-up record's summary gives the same reason in English, Chinese and the test language,
 *      without showing its record id or field name in normal mode.
 *
 * MUTATIONS, EACH AFTER A CONTROL RUN (the commit that added this file names the logs):
 *   - SummaryBlocks.tsx drawing `read.why` again instead of `whyNotRead(read.because, t)`: case 2 goes red;
 *   - `dashRowFor` writing one cell fewer than the first line has: case 3 goes red.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import { createI18n } from '../src/shared/i18n.ts'
import { blocksOf, dashRowFor, linesOfBody, whyNotRead, type PlanDocLine } from '../src/shared/plandoc.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

type SummaryBlocksModule = typeof import('../src/web/components/SummaryBlocks.tsx')
type I18n = typeof import('../src/shared/i18n.ts')

let sb: SummaryBlocksModule
let i18n: I18n
let h: typeof import('react').createElement
let toMarkup: (el: ReactNode) => string
let app: LiveApp
let page: Page
let summaryRecordId = ''

const AS_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

const SUMMARY_WITH_UNREADABLE_TABLE = ['| Sample | Recorded by |', '| seedling 4 | Rowan |'].join('\n')

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage while it is evaluated; the same stand-in
  // tests/summary-markdown.test.ts uses.
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  const react = await import('react')
  const server = await import('react-dom/server')
  h = react.createElement
  toMarkup = (el) => server.renderToStaticMarkup(el as never)
  sb = await import('../src/web/components/SummaryBlocks.tsx')
  i18n = await import('../src/shared/i18n.ts')
})

function linesOf(body: string): PlanDocLine[] {
  return linesOfBody(body).map((text, index) => ({ id: `l${String(index)}`, text }))
}

function summary(md: string): string {
  return toMarkup(h(sb.SummaryBlocks, { blocks: [{ type: 'text', id: 't', text: md }] })).replace(
    /<style[^>]*>[\s\S]*?<\/style>/g,
    '',
  )
}

async function makeSummaryRecord(): Promise<string> {
  const response = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_PERSON,
    body: JSON.stringify({
      kind: 'module',
      title: 'Greenhouse sample log',
      summary: 'A made-up sample record for a display check.',
      data: {
        summaryBlocks: [
          { id: 'samples', type: 'text', heading: 'Recorded samples', text: SUMMARY_WITH_UNREADABLE_TABLE },
        ],
      },
    }),
  })
  if (!response.ok) {
    throw new Error(`creating a made-up summary answered ${String(response.status)}: ${await response.text()}`)
  }
  return ((await response.json()) as { record: { id: string } }).record.id
}

async function openSummary(lang: 'en' | 'zh' | 'xx', look: 'light' | 'dark'): Promise<void> {
  await page.addInitScript((theme) => {
    localStorage.setItem('mole-office.preset.theme', theme)
  }, look)
  const query = lang === 'en' ? '' : `?lang=${lang}`
  await page.goto(`${app.site}/${query}#/r/${encodeURIComponent(summaryRecordId)}`, { timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('.sb-astyped').waitFor({ timeout: 30_000 })
  expect(await page.locator('html').getAttribute('data-theme')).toBe(look)
}

const NO_DASHES = ['| Sample | Owner |', '| beaker 3 | Rowan |'].join('\n')
const DISAGREE = ['| Sample | Owner |', '| --- | --- |', '| beaker 3 |'].join('\n')

describe('1: one reason, one sentence, in the language of whoever reads it', () => {
  it('keeps the English sentence for the server and says the same reason in Chinese on a page', () => {
    const zh = createI18n('zh')
    for (const [body, code] of [[NO_DASHES, 'noDashRow'], [DISAGREE, 'cellsDisagree']] as const) {
      const block = blocksOf(linesOf(body))[0]!
      if (block.kind !== 'notUnderstood') throw new Error(`${code}: the run was read as ${block.kind}`)
      expect(block.because.code).toBe(code)
      expect(block.why).toBe(whyNotRead(block.because))
      expect(block.why).toMatch(/^[\x20-\x7e]+$/)
      const inChinese = whyNotRead(block.because, zh.t)
      expect(inChinese).toMatch(/[一-鿿]/)
      expect(zh.check().fallbacks).toEqual([])
    }
    const disagree = blocksOf(linesOf(DISAGREE))[0]!
    if (disagree.kind !== 'notUnderstood') throw new Error('the run was read as a table')
    expect(disagree.because).toEqual({ code: 'cellsDisagree', headings: 2, cells: 1 })
    expect(disagree.why).toContain('has 1 cell where its heading row has 2')
  })
})

describe('2: a record summary on a Chinese page says the reason in Chinese', () => {
  it('draws the plan reader\'s reason in the page language, and the lines exactly as typed', () => {
    i18n.setWordLanguage('zh')
    try {
      const out = summary(NO_DASHES)
      expect(out).toContain(createI18n('zh').t('planDoc.notRead.noDashRow'))
      expect(out).not.toContain('no row of dashes')
      expect(out).toContain('| beaker 3 | Rowan |')
    } finally {
      i18n.setWordLanguage('en')
    }
    expect(summary(NO_DASHES)).toContain('no row of dashes')
  })
})

describe('3: the row of dashes a table lacks', () => {
  it('is one cell of dashes per heading cell, under the first line, with its indent', () => {
    const block = blocksOf(linesOf(['  | Sample | Owner | Due |', '  | beaker 3 | Rowan | Friday |'].join('\n')))[0]!
    const offer = dashRowFor(block)
    expect(offer).toEqual({ under: { id: 'l0', text: '  | Sample | Owner | Due |' }, text: '  | --- | --- | --- |' })
    // With the row in place, the same lines read as a table.
    const mended = blocksOf(linesOf(['  | Sample | Owner | Due |', offer!.text, '  | beaker 3 | Rowan | Friday |'].join('\n')))
    expect(mended).toHaveLength(1)
    expect(mended[0]).toMatchObject({ kind: 'table', heading: ['Sample', 'Owner', 'Due'], rows: [['beaker 3', 'Rowan', 'Friday']] })
  })

  it('offers nothing for rows that disagree, nor for anything that was read', () => {
    expect(dashRowFor(blocksOf(linesOf(DISAGREE))[0]!)).toBeNull()
    for (const block of blocksOf(linesOf(['# Week', '- a bullet', '| a |', '| --- |', '| 1 |'].join('\n')))) {
      expect(dashRowFor(block)).toBeNull()
    }
  })
})

describe('4: the pipe reader shared by plan and record pages', () => {
  it('reads a pipe table through plandoc in both', () => {
    const body = ['| Sample | Owner |', '| --- | --- |', '| beaker 3 | Rowan |'].join('\n')
    expect(blocksOf(linesOf(body))[0]).toMatchObject({ kind: 'table' })
    expect(summary(body)).toContain('<table')
  })
})

describe('5: the reason on a record summary', () => {
  beforeAll(async () => {
    app = await liveApp({ name: 'unreadable-summary-table', viewport: { width: 1440, height: 1000 } })
    page = app.page
    summaryRecordId = await makeSummaryRecord()
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  it('keeps the reason in the page language and hides record machinery in normal mode', async () => {
    for (const [lang, expected] of [
      ['en', 'no row of dashes'],
      ['zh', '没有一行短横线'],
    ] as const) {
      await openSummary(lang, 'light')
      const body = await page.locator('body').innerText()
      expect(await page.locator('.sb-astyped .sb-note').innerText()).toContain(expected)
      expect(body).not.toContain(summaryRecordId)
      expect(body).not.toContain('summaryBlocks')
    }

    await openSummary('xx', 'light')
    const testLanguage = await page.locator('.sb-astyped .sb-note').innerText()
    expect(testLanguage).toMatch(/^⟦.*⟧$/)

    const shots = process.env['TEST_SHOTS']
    if (shots === undefined) return
    mkdirSync(shots, { recursive: true })
    const snap = async (name: string): Promise<void> => {
      await page.locator('.sb-astyped').scrollIntoViewIfNeeded()
      await page.screenshot({ path: join(shots, `${name}.png`), fullPage: false })
    }
    for (const look of ['light', 'dark'] as const) {
      for (const width of [1440, 990, 660, 390]) {
        await page.setViewportSize({ width, height: 1000 })
        await openSummary('en', look)
        await snap(`summary-${String(width)}-${look}`)
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
    await openSummary('zh', 'light')
    await snap('summary-1440-light-zh')
    await openSummary('xx', 'light')
    await snap('summary-1440-light-xx')
  }, 300_000)
})
