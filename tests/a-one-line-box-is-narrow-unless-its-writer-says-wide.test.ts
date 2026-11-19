// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPORT'S ONE-LINE FILL-IN BOX IS NARROW, UNLESS THE AGENT WRITING THE REPORT SAYS WIDE. Wave 13k round 35.
 *
 * The width is narrow by default, and the agent writing a report may choose.
 * A one-line box for a short answer was 1,160 px wide at 1440, the same stretched look the choices had before
 * round 32 made them narrow. Now:
 *   - a fill-in block may carry `boxWidth`, "narrow" or "wide", which the writing agent sets. Not `width`: a
 *     report already has two widths (a part's `share` and a block's `measure`), and the write door refuses a
 *     bare `width` rather than guess; on a fill-in it now names `boxWidth`. Not `measure`: a fill-in holds no
 *     writing of its own (src/shared/regions.ts), so the door refuses a measure on one;
 *   - left out, a one-line box is narrow: the 36rem measure the choices and the own-words box keep;
 *   - left out, a box of several lines stays wide, as it was (the secretary's review of round 32 kept it);
 *   - any other width is refused when the report is written.
 *
 * MADE-UP RECORDS: one report, filed as the test office's person, with three fill-in boxes about a kiln.
 *
 * PICTURES: only when TEST_SHOTS names a folder, at 1440, 990, 660 and 390, light and dark, English and Chinese.
 *
 * MUTATIONS, proved on 4 October 2026 after a control run (5 passed), each red for the reason its case states,
 * then restored green (5 passed):
 *   - src/web/components/ReportQuestions.tsx: the narrow rule emptied. Case 1 goes red: the box is 1,160 px.
 *   - src/shared/kinds.ts: the pointer from a bare width to boxWidth taken out. Case 3 goes red.
 */
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp, waitForThePage } from './helpers.ts'
import { testShots, TEST_SHOTS } from './where-shots-go.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { recordPath } from '../src/web/components/router.tsx'

const KEEP = (process.env[TEST_SHOTS] ?? '') !== ''
const SHOTS = testShots('one-line-box')

const AS_THE_PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** 36rem at the page's base size, the measure the choices keep. */
const MEASURE = 576

const BOXES = [
  { id: 'b-intro', type: 'text', text: 'Three questions about the second kiln.' },
  { id: 'q-cone', type: 'fillin', asks: 'Which cone did the last firing reach?' },
  { id: 'q-route', type: 'fillin', asks: 'Which road should the clay delivery take?', boxWidth: 'wide' },
  { id: 'q-notes', type: 'fillin', asks: 'Anything the glazer should know?', lines: 'many' },
]

let app: LiveApp
let reportId = ''

async function file(blocks: unknown[]): Promise<Response> {
  return fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({ kind: 'report', title: 'The second kiln, three questions', summary: 'Questions about the second kiln.', data: { date: '2026-10-04', blocks } }),
  })
}

async function open(lang: string, width: number, look = 'light'): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${lang}&look=${look}#${recordPath(reportId)}`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.rq-fillin').first().waitFor({ timeout: 30_000 })
}

/** The width of each box's input, and of the block it sits in. */
async function widths(): Promise<{ id: string; input: number; block: number }[]> {
  return app.page.locator('.rq-fillin').evaluateAll((all) =>
    all.map((one) => ({
      id: one.getAttribute('data-target') ?? one.textContent ?? '',
      input: (one.querySelector('input, textarea') as HTMLElement).getBoundingClientRect().width,
      block: (one as HTMLElement).getBoundingClientRect().width,
    })),
  )
}

beforeAll(async () => {
  app = await liveApp({ name: 'one-line-box', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  // THE PAGE TAKES ITS LOOK FROM THE ADDRESS'S look, which the office itself does not read: it keeps the theme in
  // local storage. Without this every dark picture was the light one.
  await app.page.addInitScript(() => {
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
  })
  const filed = await file(BOXES)
  expect(filed.status, await filed.clone().text()).toBe(201)
  reportId = ((await filed.json()) as { record: { id: string } }).record.id
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('a one-line fill-in box', () => {
  it('1. is narrow when its writer says nothing, wide when the writer says wide, and a box of several lines stays wide', async () => {
    for (const lang of ['en', 'zh']) {
      await open(lang, 1440)
      const [cone, route, notes] = await widths()
      expect(cone!.input, `${lang}: the one-line box with no width is wider than the choices' measure`).toBeLessThanOrEqual(MEASURE + 1)
      expect(route!.input / route!.block, `${lang}: the box its writer made wide is not wide`).toBeGreaterThan(0.9)
      expect(notes!.input / notes!.block, `${lang}: the box of several lines stopped being wide`).toBeGreaterThan(0.9)
    }
  }, 300_000)

  it('2. keeps the narrow box inside the page at 390', async () => {
    await open('en', 390)
    const [cone] = await widths()
    expect(cone!.input).toBeLessThanOrEqual(cone!.block + 1)
    expect(await app.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  }, 120_000)

  it('3. refuses a box width that is neither narrow nor wide, and points a bare width at boxWidth', async () => {
    const medium = await file([{ id: 'q-x', type: 'fillin', asks: 'How wide?', boxWidth: 'medium' }])
    expect(medium.status).toBe(400)
    expect(await medium.text()).toMatch(/boxWidth/)
    const bare = await file([{ id: 'q-y', type: 'fillin', asks: 'How wide?', width: 'wide' }])
    expect(bare.status).toBe(400)
    expect(await bare.text(), 'a bare width on a fill-in is not pointed at boxWidth').toMatch(/boxWidth/)
  })

  it('5. photographs the report at four widths', async () => {
    if (!KEEP) return
    for (const lang of ['en', 'zh']) {
      for (const look of ['light', 'dark']) {
        for (const width of [1440, 990, 660, 390]) {
          await open(lang, width, look)
          await app.page.screenshot({ path: join(SHOTS, `one-line-box-${lang}-${width}-${look}.png`), fullPage: true })
        }
      }
    }
  }, 900_000)
})
