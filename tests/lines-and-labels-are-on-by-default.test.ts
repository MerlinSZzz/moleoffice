// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY LINE CARRIES ITS WORD, AND WHY A BLOCK IS CLOSED OPENS ON A PRESS — CRITERION D16.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE, AND WHAT THE DRAWING ACTUALLY DID
 * ---------------------------------------------------------------------------------------
 *
 * Section 20 of design/messages/ACCEPTANCE.md:
 *
 * Lines and their labels on by default; the explanation of why a block is closed off by default.
 *
 * The drawing drew no word on any line at all. `lineWordsAt` answered false below level 3 and every
 * drawing opened at level 2, so the whole picture was unlabelled arrows — and the gate's own prose,
 * which is the one thing to be held back, came out on every line touching a card the moment
 * one was pressed. Both halves were the wrong way round.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   make `toFlowEdges` answer `words: 'full'` for every line → the section about the explanation
 *     being off by default goes red.
 *   make `askAboutTheGate` do nothing → the section about the press goes red.
 *   drop the label from `LineWords` → the section about every line carrying a word goes red.
 *
 * ---------------------------------------------------------------------------------------
 * ON THE MODULES DRAWING SINCE 15 NOVEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * A filed pipeline's page draws its lanes now, and a lanes line carries no word and no gate mark.
 * The modules drawing still draws the canvas's lines, their words and their gates. So the three
 * records are modules, the two gates are `blocks` links between them, and every case opens the
 * modules drawing. A `blocks` line between two modules carries the link type's own word, not the
 * pipeline's "waits on", so the first case reads that word from `linkWord`.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { theDrawingHasSettled } from './the-drawing-has-settled.ts'
import { linkWord } from '../src/shared/words.ts'

let app: LiveApp
let page: Page

const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/**
 * HOW FAR YOU MAY GO PAST A PARTIAL GATE — the words a gate's explanation carries.
 *
 * A gate holds two things and no more: which kind it is, and, on a partial one, the furthest stage
 * the blocked work may reach (`Gate` in shared/work.ts). So "why this block is closed" on a drawing
 * is `Hard gate` or `Partial gate` and that stage. Rare first word, so nothing else on the screen
 * could have drawn it.
 */
const AS_FAR_AS = 'Pangolin a first pass on half the boards'

async function post(path: string, body: unknown): Promise<{ record: { id: string } }> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as { record: { id: string } }
}

beforeAll(async () => {
  app = await liveApp({ name: 'lines-and-labels', viewport: { width: 1440, height: 1000 } })
  page = app.page

  const modules: string[] = []
  for (const title of ['Collect boards', 'Solve the intrinsics', 'Check the reprojection']) {
    const made = await post('/api/records', { kind: 'module', title, data: { state: 'active', parts: [] } })
    modules.push(made.record.id)
  }
  // ONE HARD GATE AND ONE PARTIAL ONE, so both sentences a gate can carry are on this drawing.
  const gates: { fromId: string; toId: string; gate: Record<string, unknown> }[] = [
    { fromId: modules[1] as string, toId: modules[0] as string, gate: { kind: 'hard' } },
    { fromId: modules[2] as string, toId: modules[1] as string, gate: { kind: 'partial', upTo: AS_FAR_AS } },
  ]
  for (const one of gates) {
    const linked = await fetch(`${app.api}/api/links`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ fromId: one.fromId, toId: one.toId, type: 'blocks', gate: one.gate }),
    })
    if (!linked.ok) throw new Error(`the gate could not be stored: ${await linked.text()}`)
  }
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function openTheDrawing(theme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme })
  await page.goto(`${app.site}/#/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.evaluate(() => {
    window.sessionStorage.clear()
    window.localStorage.removeItem('mole-office.detail')
    window.localStorage.removeItem('mole-office.detail.graph')
  })
  await page.goto(`${app.site}/#/pipeline/drawing`, { timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.gx-canvas-wrap[data-shows="1"]', { timeout: 60_000 })
  await theDrawingHasSettled(page)
}

/** The lines on screen, and the word each one carries. */
async function theLines(): Promise<{ lines: number; labels: string[]; words: string[] }> {
  return page.evaluate(() => ({
    lines: document.querySelectorAll('.gx-canvas .gx-edge-line').length,
    labels: [...document.querySelectorAll('.react-flow__edgelabel-renderer .gx-edge-label')].map((el) =>
      (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
    ),
    words: [...document.querySelectorAll('.react-flow__edgelabel-renderer .gx-line-word')].map((el) =>
      (el.textContent ?? '').trim(),
    ),
  }))
}

/** Everything the drawing is saying, as one string, for asking whether a sentence is on it. */
async function whatTheDrawingSays(): Promise<string> {
  return page.evaluate(() => (document.querySelector('.gx-canvas')?.textContent ?? '').replace(/\s+/g, ' ').trim())
}

/**
 * WAIT UNTIL THE DRAWING SAYS A SENTENCE, for ten seconds at most, and until it has stopped moving.
 *
 * A gate's explanation is drawn in its line's label, which the settle wait does not read, so the
 * sentence itself is looked for on every animation frame. IT DOES NOT THROW WHEN THE SENTENCE NEVER
 * COMES: the assertion after this is what says so, in its own words.
 */
async function untilTheDrawingSays(words: string): Promise<void> {
  const until = Date.now() + 10_000
  while (Date.now() < until && !(await whatTheDrawingSays()).includes(words)) {
    await page.evaluate(() => new Promise<void>((done) => window.requestAnimationFrame(() => done())))
  }
  await theDrawingHasSettled(page)
}

// LIGHT ONLY. The labels, the gates and the closed-block reason do not depend on the colour scheme.
for (const theme of ['light'] as const) {
  describe(`every line on the drawing carries its word, in ${theme}`, () => {
    it('draws a label on every line, with nothing pressed and nothing chosen', async () => {
      await openTheDrawing(theme)
      const seen = await theLines()
      expect(seen.lines, 'the drawing has no lines on it at all').toBeGreaterThan(0)
      expect(
        seen.words.length,
        `${String(seen.lines)} lines are drawn and ${String(seen.words.length)} carry a word. The owner's sentence is ` +
          `连线默认显示，gate，hard gate，carry等这种标签也默认显示.`,
      ).toBe(seen.lines)
      expect(seen.words.every((one) => one.length > 0), 'a line carries an empty word').toBe(true)
      // THE WORD IS THE LINK'S OWN. A `blocks` line between two modules says what it means.
      expect(seen.words, 'no line says what it means').toContain(linkWord('blocks', 'forward').text)
    }, 180_000)

    it('says nothing about why a block is closed until it is asked', async () => {
      await openTheDrawing(theme)
      const said = await whatTheDrawingSays()
      expect(said, 'a partial gate’s stage is on the drawing before anybody asked').not.toContain(AS_FAR_AS)
      expect(said, 'the gate is named in words before anybody asked').not.toContain('Hard gate')
      // THE GATE IS STILL THERE, AS A MARK. Held back is not absent: the line says it is gated.
      expect(
        await page.locator('.gx-gate-shape').count(),
        'the gate is not even a mark, so a reader cannot tell the line is gated',
      ).toBeGreaterThan(0)
    }, 180_000)

    it('opens why the block is closed on one press of its mark, and puts it away on the next', async () => {
      await openTheDrawing(theme)
      const mark = page.locator('.gx-gate-open').first()
      expect(await mark.count(), 'the gate’s mark is not a control').toBe(1)
      await mark.click()
      await untilTheDrawingSays('Hard gate')
      const opened = await whatTheDrawingSays()
      expect(opened, 'pressing the gate’s mark did not say why the block is closed').toContain('Hard gate')
      await page.locator('.gx-gate-open').first().click()
      await theDrawingHasSettled(page)
      expect(
        await whatTheDrawingSays(),
        'pressing the gate’s mark again did not put the explanation away',
      ).not.toContain('Hard gate')
    }, 180_000)

    it('opens one line’s gate and leaves every other line alone', async () => {
      await openTheDrawing(theme)
      const marks = page.locator('.gx-gate-open')
      expect(await marks.count(), 'this drawing has fewer than two gates, so this proves nothing').toBeGreaterThan(1)
      await marks.first().click()
      await theDrawingHasSettled(page)
      const said = await whatTheDrawingSays()
      // ONE OF THE TWO, AND NOT BOTH. A press on a card used to open the prose on every line
      // touching it, which is what criterion D16 replaces.
      const both = said.includes('Hard gate') && said.includes('Partial gate')
      expect(both, 'asking about one line’s gate opened another line’s as well').toBe(false)
    }, 180_000)
  })
}
