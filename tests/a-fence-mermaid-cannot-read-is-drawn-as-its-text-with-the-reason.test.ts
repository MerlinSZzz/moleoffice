// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DIAGRAM THE PARSER REFUSES IS THE WRITER'S OWN CHARACTERS, PLUS THE PARSER'S OWN WORDS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS THE CLAUSE MOST DESIGNS LEAVE OUT
 * ---------------------------------------------------------------------------------------
 *
 * Invariant 2: if the method asked for cannot run, fail loudly. A page that draws a picture when
 * mermaid can read the text has three ways of behaving when it cannot, and two of them are lies:
 *
 *   a blank box            the reader is told nothing at all, and the words the writer typed are
 *                          gone from the page;
 *   the text as prose      the fence quietly stops being a fence and its characters are reflowed
 *                          into paragraphs, so a reader cannot tell a broken diagram from a
 *                          paragraph somebody wrote;
 *   the text, with why     what this file holds the page to.
 *
 * ---------------------------------------------------------------------------------------
 * THE MESSAGE IS MERMAID'S AND NOT THIS PRODUCT'S
 * ---------------------------------------------------------------------------------------
 *
 * `SummaryBlocks.tsx` never writes a sentence about what is wrong with somebody's diagram. It draws
 * the string the library threw. A sentence written here would be this product's guess at a fault in
 * a grammar it does not own, which is exactly the fake-confidence this repository keeps finding.
 * So this file checks that the words on the page came from the parser: it asserts they name what
 * mermaid names, and not a wording chosen in the component.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp
let page: Page

/** A fence that says mermaid and holds something mermaid has no grammar for. */
const BROKEN = ['```mermaid', 'flowchart TD', '  A --> ((( ', '  %% and the rest of it', '```'].join('\n')

/** A fence beside it that mermaid reads perfectly, so a green run cannot be an empty page. */
const GOOD = ['```mermaid', 'flowchart TD', '  A[The worker] --> B[The check]', '```'].join('\n')

/** The prose around them, which must stay prose and must not swallow the fence. */
const AROUND = 'What the round did, in one paragraph, so the fence has something on either side of it.'

interface Seen {
  /** Every diagram box on the page, with what state it says it is in. */
  states: string[]
  /** The parser's own words, per refused box. */
  said: string[]
  /** The label beside them, which is this product's own and stays short. */
  what: string[]
  /** The characters in every code box on the page. */
  code: string[]
  /** How many pictures were drawn. */
  pictures: number
  /** Every paragraph on the page, so a fence turned into prose would show up here. */
  paragraphs: string[]
}

async function readThePage(): Promise<Seen> {
  return (await page.evaluate(() => ({
    states: [...document.querySelectorAll('figure.sb-diagram-fig')].map(
      (one) => one.getAttribute('data-diagram') ?? 'drawn',
    ),
    said: [...document.querySelectorAll('.sb-diagram-refused-said')].map((one) => one.textContent ?? ''),
    what: [...document.querySelectorAll('.sb-diagram-refused-what')].map((one) => one.textContent ?? ''),
    code: [...document.querySelectorAll('pre.sb-code')].map((one) => one.textContent ?? ''),
    pictures: document.querySelectorAll('.sb-diagram svg').length,
    paragraphs: [...document.querySelectorAll('.sb-p')].map((one) => one.textContent ?? ''),
  }))) as Seen
}

beforeAll(async () => {
  // THIS FILE IS ABOUT WHAT IS INSIDE A REPORT'S BODY, SO IT SAYS WHICH LEVEL IT READS AT.
  // The owner's act 3a of 15 September 2026 made a record page open at the
  // conclusion, where the body holds the summary and nothing else, so a test that measures a
  // diagram, a picture, a mark, a tab stop or a panel inside the writing found an empty body and
  // waited for a selector that would never appear. `opensAt` writes the reader's own stored
  // choice before the page loads, so this file is about its own subject again and not about the
  // level a page opens at. That level has its own test in
  // tests/a-reader-goes-no-lower-than-conclusion.test.ts, which stores nothing.
  app = await liveApp({ opensAt: 'full', name: 'fence-mermaid-cannot-read', viewport: { width: 1440, height: 1000 } })
  page = app.page
  const res = await fetch(`http://127.0.0.1:${String(app.apiPort)}/api/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind: 'report',
      title: 'One diagram mermaid can read and one it cannot',
      summary: 'Two mermaid fences, side by side, so a page that draws neither cannot pass this file.',
      data: {
        blocks: [
          { id: 'b-1', type: 'text', heading: 'The two fences', text: `${AROUND}\n\n${GOOD}\n\n${BROKEN}\n\n${AROUND}` },
        ],
      },
    }),
  })
  if (!res.ok) throw new Error(`filing the report answered ${String(res.status)}: ${await res.text()}`)
  const id = ((await res.json()) as { record: { id: string } }).record.id
  await page.goto(`http://127.0.0.1:${String(app.webPort)}/#/r/${id}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  // Both fences have settled when neither box is still reading the library.
  await page.waitForFunction(
    () =>
      document.querySelectorAll('figure.sb-diagram-fig').length === 2 &&
      document.querySelectorAll('figure.sb-diagram-fig[data-diagram="reading"]').length === 0,
    undefined,
    { timeout: 60_000 },
  )
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('a fence mermaid cannot read', () => {
  it('is one refused box beside one that was drawn, so neither answer is the only one on the page', async () => {
    const seen = await readThePage()
    expect(seen.states.filter((s) => s === 'refused').length, 'the broken fence').toBe(1)
    expect(seen.states.filter((s) => s === 'drawn').length, 'the fence beside it').toBe(1)
    expect(seen.pictures, 'the good one really did draw a picture').toBe(1)
  })

  it('draws the characters the writer typed, in a code box, never as prose', async () => {
    const seen = await readThePage()
    const broken = BROKEN.split('\n').slice(1, -1).join('\n')
    expect(
      seen.code.some((held) => held.includes(broken)),
      'the broken fence characters are not in any code box on the page',
    ).toBe(true)
    // AND NOT AS PROSE. A fence that quietly became paragraphs would put its characters here.
    for (const paragraph of seen.paragraphs) {
      expect(paragraph, 'a fence was reflowed into a paragraph').not.toContain('flowchart TD')
    }
  })

  it('draws the parser own words beside them, and never a blank box', async () => {
    const seen = await readThePage()
    expect(seen.said.length, 'one message, on the one refused box').toBe(1)
    const message = seen.said[0] ?? ''
    expect(message.trim(), 'the box is refused and says nothing, which is a blank box').not.toBe('')
    // MERMAID'S OWN WORDS. Its parse failures name the parse and the line, and none of those words
    // is written in SummaryBlocks.tsx — so a component that invented its own sentence fails here.
    expect(message.toLowerCase()).toMatch(/parse|expecting|lexical|syntax|error/)
    expect(message.length, 'a one-word message is not the parser explaining itself').toBeGreaterThan(20)
  })

  it('says whose refusal it is, in a label short enough to be a label', async () => {
    const seen = await readThePage()
    expect(seen.what).toEqual(['Mermaid could not read this'])
  })
})
