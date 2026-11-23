// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TWO PAGE CONTROLS ARE CALLED GRAPH AND LIST — CRITERION D26, MEASURED IN A BROWSER.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------------------
 *
 * Section 23 of design/messages/ACCEPTANCE.md:
 *
 * Change Draw it and Read it to Graph and List, because Draw it and Read it do not say what they
 * mean. That is chapter 6 rule 4 of the office regulations: a control is
 * named after what it is to the reader.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS WORTH A TEST AND NOT JUST A RENAME
 * ---------------------------------------------------------------------------------------
 *
 * The two words were spelled in four files: the module and pipeline drawings, the plan drawing, and
 * every sentence on either page that named a control. Eleven strings. This file presses each control
 * by the name it must now have, so a rename that misses the button cannot be pressed.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   set `THE_TWO_READINGS` in model.ts back to `Draw it` and `Read it` → every case goes red.
 *
 * ---------------------------------------------------------------------------------------
 * A PIPELINE'S PAGE DRAWS ITS LANES, SINCE 15 NOVEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * A filed pipeline's page draws its lanes for Graph, not the canvas. So the pipeline drawing's case
 * presses List and finds the printed list in place of the lanes, then presses Graph and finds the
 * lanes with their cards, and the list gone. The module drawing's case is as it was. Its own
 * mutation, after a control run:
 *
 *   in src/web/components/graph/StructureView.tsx, draw a page's own lanes whatever was asked for
 *     (`showing === 'canvas' || lanes !== undefined`) → the pipeline drawing's case goes red: List
 *     leaves the lanes on screen. The module drawing's case stays green.
 *
 * Its first run, on 16 November 2026, went red only as a 30-second wait for the printed list,
 * which did not say that the lanes stayed. So the case now waits for the list at most 30 seconds
 * and then reads both, and the same mutation is red at "the lanes are gone when List is pressed".
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { DRAWING, theDrawingIsDrawn } from './a-made-up-office-drawn-in-lanes.ts'

let app: LiveApp
let page: Page
let pipelineId = ''

const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

async function post(path: string, body: unknown): Promise<{ record: { id: string } }> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as { record: { id: string } }
}

beforeAll(async () => {
  app = await liveApp({ name: 'graph-and-list', viewport: { width: 1440, height: 1000 } })
  page = app.page

  const pipeline = await post('/api/records', {
    kind: 'pipeline',
    title: 'Wrist calibration sweep',
    summary: 'Does the wrist camera hold its calibration across a working day?',
    data: { blockIds: [] },
  })
  pipelineId = pipeline.record.id
  for (const name of ['Collect boards', 'Solve the intrinsics']) {
    await post(`/api/records/${pipelineId}/blocks`, { name, state: 'done' })
  }
  // TWO LINKED MODULES, so the module drawing has something to draw and is not the empty page.
  const first = await post('/api/records', {
    kind: 'module',
    title: 'Wrist camera',
    summary: 'The camera whose calibration this sweep is about.',
    data: { state: 'active', parts: [] },
  })
  const second = await post('/api/records', {
    kind: 'module',
    title: 'Bench jig',
    summary: 'Holds the mount while it is pulled.',
    data: { state: 'active', parts: [] },
  })
  const linked = await fetch(`${app.api}/api/links`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ fromId: first.record.id, toId: second.record.id, type: 'relates_to' }),
  })
  if (!linked.ok) throw new Error(`the modules could not be linked: ${await linked.text()}`)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function open(hash: string, theme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme })
  await page.goto(`${app.site}/#/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.evaluate(() => {
    window.sessionStorage.clear()
    window.localStorage.removeItem('mole-office.detail')
    window.localStorage.removeItem('mole-office.detail.graph')
  })
  await page.goto(`${app.site}/#/${hash}`, { timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  // The page has drawn something: the module drawing's canvas or a pipeline's lanes.
  await page.locator(`.gx-canvas-wrap[data-shows="1"], ${DRAWING}`).first().waitFor({ timeout: 60_000 })
}

for (const theme of ['light'] as const) {
  describe(`the two page controls on the module drawing, in ${theme}`, () => {
    it('still do what they did: one draws the canvas and the other prints the list', async () => {
      await open('pipeline/drawing', theme)
      await page.getByRole('button', { name: 'List', exact: true }).first().click()
      await page.waitForTimeout(1500)
      expect(await page.locator('.gx-canvas-wrap').count(), 'the canvas is gone when List is pressed').toBe(0)
      await page.getByRole('button', { name: 'Graph', exact: true }).first().click()
      await page.waitForSelector('.gx-canvas-wrap[data-shows="1"]', { timeout: 60_000 })
      await page.locator('.gx-card').first().waitFor({ timeout: 30_000 }).catch(() => undefined)
      expect(await page.locator('.gx-card').count(), 'Graph brings the cards back').toBeGreaterThan(0)
    }, 180_000)
  })

  // A FILED PIPELINE'S PAGE DRAWS ITS LANES, so Graph brings those back and not the canvas.
  describe(`the two page controls on a pipeline drawing, in ${theme}`, () => {
    it("still do what they did: one draws the pipeline's lanes and the other prints the list", async () => {
      await open(`pipeline/${pipelineId}`, theme)
      await theDrawingIsDrawn(page)
      await page.getByRole('button', { name: 'List', exact: true }).first().click()
      // The list is waited for at most 30 seconds, and then both are read, so a List that leaves the lanes says so.
      await page.locator('.gx-outline').first().waitFor({ timeout: 30_000 }).catch(() => undefined)
      expect(await page.locator(DRAWING).count(), 'the lanes are gone when List is pressed').toBe(0)
      expect(await page.locator('.gx-outline').count(), 'List prints the list (.gx-outline)').toBeGreaterThan(0)
      await page.getByRole('button', { name: 'Graph', exact: true }).first().click()
      await theDrawingIsDrawn(page)
      expect(await page.locator(`${DRAWING} .e-card`).count(), 'Graph brings the cards back').toBeGreaterThan(0)
      expect(await page.locator('.gx-outline').count(), 'the list is gone when Graph is pressed').toBe(0)
    }, 180_000)
  })
}
