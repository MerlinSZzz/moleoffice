// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PIPELINE'S RECORD PAGE HAS A WAY INTO ITS DRAWING — item 2 of design/messages/ACCEPTANCE.md section 32.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * A person was taken to the Handover v2 RECORD page rather than into the drawing at
 * http://…/#/pipeline/TEoKg5mV7egP, looked for a long time, and found no way into that drawing at all.
 *
 * MEASURED before this was built, on the owner's own Handover v2 record page at 1440 on an isolated copy of
 * the owner's database: nought links or buttons on the whole page led to `#/pipeline/<its id>`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PROVES
 * ---------------------------------------------------------------------------------------
 *
 * One press, in the page's head, that opens the drawing — and only on a pipeline, because on every
 * other kind of record it would be a control leading to a page that is not about that record.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   delete the RouteLink to `pipelinePath(record.id)` from `RecordHead` in RecordPage.tsx → the
 *     first two cases go red: there is no way in, which is exactly what the owner met.
 *   drop the `record.kind === 'pipeline'` guard → the third case goes red: a module's page grows a
 *     press to a drawing that is not about it.
 *
 * ---------------------------------------------------------------------------------------
 * THE DRAWING IT OPENS IS THE PIPELINE'S LANES SINCE 15 NOVEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * A filed pipeline's address draws its lanes and not the old canvas. So the press is proved to have
 * opened a drawing when the lanes draw the pipeline's two steps as cards, and no longer by the canvas.
 *
 * A MUTATION THAT TURNS IT RED: make the `lanes` memo in src/web/pages/PipelinePage.tsx return null.
 * The address changes and the page draws no card, and the second case goes red in both themes.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { DRAWING } from './a-made-up-office-drawn-in-lanes.ts'

let app: LiveApp
let pipelineId = ''
let moduleId = ''

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
  app = await liveApp({ name: 'pipeline-page-drawing', viewport: { width: 1440, height: 1000 } })

  const pipeline = await post('/api/records', {
    kind: 'pipeline',
    title: 'Handover trial run',
    summary: 'The steps from seeing the cube to letting go of it.',
    data: { blockIds: [] },
  })
  pipelineId = pipeline.record.id
  for (const name of ['Sense the cube', 'Close and hold']) {
    await post(`/api/records/${pipelineId}/blocks`, { name, state: 'done' })
  }

  const module = await post('/api/records', {
    kind: 'module',
    title: 'Wrist mount pull rig',
    summary: 'Holds the mount while it is pulled.',
    data: { state: 'active', parts: [] },
  })
  moduleId = module.record.id
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Every control on the page that leads to this pipeline's drawing, and whether it is in the head. */
async function theWaysIn(id: string): Promise<{ words: string; inTheHead: boolean }[]> {
  return app.page.evaluate((pipeline) => {
    const wanted = `#/pipeline/${pipeline}`
    return [...document.querySelectorAll('a[href]')]
      .filter((one) => (one.getAttribute('href') ?? '').endsWith(wanted))
      .map((one) => ({
        words: (one.textContent ?? '').trim(),
        inTheHead: one.closest('header.rp-head') !== null,
      }))
  }, id)
}

for (const theme of ['light', 'dark'] as const) {
  describe(`a pipeline's record page, in ${theme}`, () => {
    it('carries one press to its drawing, in the head', async () => {
      await app.page.emulateMedia({ colorScheme: theme })
      await app.page.goto(`${app.site}/#/r/${pipelineId}`, { timeout: 60_000 })
      await app.page.reload({ timeout: 60_000 })
      await waitForThePage(app.page, 60_000)
      const ways = await theWaysIn(pipelineId)
      expect(ways.length, `the ways into the drawing: ${JSON.stringify(ways)}`).toBe(1)
      expect(ways[0]?.inTheHead, 'and it is in the head, where the owner looked').toBe(true)
      expect(ways[0]?.words, 'named with the product’s own word for a drawing').toBe('Graph')
    }, 180_000)

    it('opens the drawing when it is pressed', async () => {
      await app.page.emulateMedia({ colorScheme: theme })
      await app.page.goto(`${app.site}/#/r/${pipelineId}`, { timeout: 60_000 })
      await app.page.reload({ timeout: 60_000 })
      await waitForThePage(app.page, 60_000)
      await app.page.locator('header.rp-head a.rp-mode-drawing').click()
      await waitForThePage(app.page, 60_000)
      expect(new URL(app.page.url()).hash, 'the address is that pipeline’s drawing').toBe(
        `#/pipeline/${pipelineId}`,
      )
      // AND THE DRAWING IS REALLY THERE. An address that changes and a page that draws nothing is
      // the same dead end the owner met, one press further on. The pipeline's lanes draw its two steps.
      await app.page.waitForSelector(`${DRAWING} .e-card`, { timeout: 60_000 })
      expect(
        await app.page.locator(`${DRAWING} .e-card[data-role="step"]`).count(),
        'the drawing draws the pipeline’s two steps as cards',
      ).toBe(2)
    }, 180_000)
  })
}

describe('a record that is not a pipeline', () => {
  it('has no such press, because it has no drawing of its own', async () => {
    await app.page.goto(`${app.site}/#/r/${moduleId}`, { timeout: 60_000 })
    await app.page.reload({ timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    const any = await app.page.evaluate(() =>
      [...document.querySelectorAll('a[href]')].filter((one) => (one.getAttribute('href') ?? '').includes('#/pipeline/'))
        .length,
    )
    expect(any, 'a module page offers no way into a pipeline drawing').toBe(0)
  }, 180_000)
})
