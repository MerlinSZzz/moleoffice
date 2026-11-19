// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TYPING SOURCES' HEADING AND ITS SENTENCE ARE TWO PIECES, THE SENTENCE BELOW THE HEADING. Wave 13u round 31,
 * item 11.
 *
 * THE OLD WORDING. TypedFromPanel drew both inside one paragraph:
 * `<p class="tm-typed-from-head"><strong>{heading}</strong> <span>{onlyYou}</span></p>`. So "Typed from" and "Only
 * you type here, with one exception..." read as one line of text, and a reader that reads the panel in order gets
 * one piece rather than a heading and a sentence.
 *
 * THE NEW WORDING. The heading is an element of its own and the sentence is a paragraph of its own, so the sentence
 * starts below the heading at every width and the two are separate pieces in reading order. The words are unchanged;
 * the section's aria-label is unchanged.
 *
 * WHAT IS DRAWN. The panel itself, with made-up typing sources, rendered to markup and measured in a real browser at
 * the four widths. The panel is drawn under a terminal's view; the claim here is about the panel's own layout and
 * reading order, which is what a person meets under the terminal, so no terminal is started. The panel's other
 * words, its run rows, are the same markup as under a real terminal: `TypedFrom` is the shape the stream sends
 * (tests/a-terminal-is-typed-into-from-another-computer.test.ts).
 *
 * MUTATIONS (each after a control run; the report has the runs and the logs):
 *   - the heading and the sentence drawn inside one paragraph again: every case goes red, because there is then one
 *     element holding both pieces and no sentence element below the heading.
 */

import { readFileSync } from 'node:fs'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, describe, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import type { TypedFrom } from '../src/shared/terminals.ts'
import { TypedFromPanel } from '../src/web/components/TypedFromPanel.tsx'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { drawInABrowser, type Drawn } from './what-the-browser-draws.ts'
import { testShots } from './where-shots-go.ts'

const shots = testShots('typed-from-panel')
const keepTheShots = (process.env['TEST_SHOTS'] ?? '') !== ''
const en = createI18n('en')
const WIDTHS = [1440, 990, 660, 390] as const

/** The office's own page stylesheet, so a picture is drawn on the office's page background, less its imports. */
const PAGE_CSS = readFileSync(new URL('../src/web/styles.css', import.meta.url), 'utf8').replace(/@import[^;]+;/g, '')

/** Three made-up typing sources, one of each level, as the stream sends them. */
const MADE_UP: TypedFrom = {
  since: '2026-10-19 04:00:00',
  forgotten: 2,
  runs: [
    { level: 'this computer', machine: 'study-laptop', how: 'this machine', program: 'Chrome', account: { id: THE_TEST_OFFICES_OWNER.id, proof: "the person's key", device: null }, firstAt: '2026-10-19 04:01:00', lastAt: '2026-10-19 04:02:37', inputs: 3 },
    { level: 'another computer', machine: 'made-up-laptop', how: 'an address', program: 'Safari', account: { id: THE_TEST_OFFICES_OWNER.id, proof: "a device's key", device: 'the made-up laptop' }, firstAt: '2026-10-19 04:03:00', lastAt: '2026-10-19 04:03:00', inputs: 1 },
    { level: "an agent's ask", machine: null, how: "an agent's ask", program: null, account: { id: 'made-up-willow', proof: "the run's key", device: null }, agentHandle: 'willow', firstAt: '2026-10-19 04:04:00', lastAt: '2026-10-19 04:04:00', inputs: 1 },
  ],
}

/** The panel as markup, with the office's page stylesheet round it, for a real browser. */
function theMarkup(): string {
  return `<style>${PAGE_CSS}</style><main style="max-width: 44rem; margin: 0 auto; padding: 16px">${renderToStaticMarkup(h(TypedFromPanel, { typedFrom: MADE_UP }))}</main>`
}

let drawn: Drawn | null = null
afterAll(async () => {
  await drawn?.close()
})

async function open(): Promise<Drawn> {
  drawn ??= await drawInABrowser(theMarkup(), { width: 1440, height: 900 })
  return drawn
}

/** The heading's and the sentence's boxes, as the browser laid them out. */
async function theTwoBoxes(page: Awaited<ReturnType<typeof open>>['page']): Promise<{ heading: { x: number; y: number; width: number; height: number }; sentence: { x: number; y: number; width: number; height: number }; headingFirst: boolean }> {
  return page.evaluate(() => {
    const heading = document.querySelector('.tm-typed-from-head')!
    const sentence = document.querySelector('.tm-typed-from-only-you')!
    const one = heading.getBoundingClientRect()
    const two = sentence.getBoundingClientRect()
    const box = (at: DOMRect) => ({ x: at.x, y: at.y, width: at.width, height: at.height })
    return {
      heading: box(one),
      sentence: box(two),
      headingFirst: (heading.compareDocumentPosition(sentence) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    }
  })
}

describe('the heading and the sentence are two pieces', () => {
  it('reads the heading and the sentence as separate pieces, the sentence below the heading at each of the four widths', async () => {
    const kept = await open()
    const page = kept.page
    expect(await page.locator('.tm-typed-from').getAttribute('aria-label')).toBe(en.t('terminals.typedFrom.heading'))
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.locator('.tm-typed-from-head').count(), `${String(width)}: one heading`).toBe(1)
      expect(await page.locator('.tm-typed-from-only-you').count(), `${String(width)}: one sentence`).toBe(1)
      // ONE PIECE EACH: the heading's own text is the heading alone, and the sentence's own text is the sentence alone.
      expect((await page.locator('.tm-typed-from-head').innerText()).trim(), String(width)).toBe(en.t('terminals.typedFrom.heading'))
      expect((await page.locator('.tm-typed-from-only-you').innerText()).trim(), String(width)).toBe(en.t('terminals.typedFrom.onlyYou'))
      const { heading, sentence, headingFirst } = await theTwoBoxes(page)
      expect(headingFirst, `${String(width)}: the heading comes first in reading order`).toBe(true)
      expect(sentence.y, `${String(width)}: the sentence starts below the heading`).toBeGreaterThanOrEqual(heading.y + heading.height - 1)
    }
  }, 60_000)
})

describe('the typing sources as pictures', () => {
  it('draws the panel at four widths in both themes', async () => {
    if (!keepTheShots) return
    const kept = await open()
    for (const width of WIDTHS) {
      for (const theme of ['light', 'dark'] as const) {
        await kept.page.setViewportSize({ width, height: 900 })
        await kept.palette(theme)
        expect(await kept.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${String(width)} ${theme}`).toBe(true)
        await kept.page.screenshot({ path: `${shots}/typing-sources-${String(width)}-${theme}.png`, fullPage: true })
      }
    }
  }, 120_000)
})
