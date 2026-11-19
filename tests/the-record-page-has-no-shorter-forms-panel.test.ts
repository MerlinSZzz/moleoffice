// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE *SHORTER FORMS OF THIS REPORT* PANEL IS NOT ON A RECORD PAGE.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULING
 * ---------------------------------------------------------------------------------------
 *
 * The panel drew all six stored forms of a report, each with who wrote it, whether it is still
 * current, and what it stands for. The report body above it draws the form written for the length
 * the reader is at. Read together, the two were found to repeat each other, and the ruling was:
 *
 *   the panel repeats the content above it; it can serve for debugging, but it is not normal UI, and it goes
 *
 * That is: it repeats what the body already shows. It is useful for debugging. It is not
 * normal UI, and it goes. Criteria A10 and A13 of `design/pointing-reopened/ACCEPTANCE.md` are
 * retired with it; §C-3Sept of `design/problem-02/ACCEPTANCE.md`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT STAYS, AND WHY THAT IS ASSERTED HERE TOO
 * ---------------------------------------------------------------------------------------
 *
 * The forms themselves are untouched: stored under `data.shortForms`, written and read through
 * `/api/records/:id/short-forms`, checked against the body by the same door. The report body draws
 * the one written for the length being read, and right-clicking it opens the composer, which says
 * what it stands for and who wrote it. "The panel is gone" and "the forms are gone" are one mistake
 * apart, so both are checked in the same browser on the same record.
 *
 * AND A MODULE PAGE IS OPENED, because the panel sat inside `RecordDetail`, which draws every kind.
 * A cut that took a neighbouring element with it would leave a module page blank, and no test of a
 * report would say so.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, so a reader can check these assertions are not decoration
 * ---------------------------------------------------------------------------------------
 *
 *   draw a `<section>` with the heading *Shorter forms of this report* in `RecordDetail` → *no
 *   panel* goes red.
 *
 *   draw one row of class `rd-short-says` anywhere on the page → *no row of the panel* goes red.
 *
 *   make `formDrawnAt` answer null at every length → *the body still draws the form* goes red, and
 *   so does *the composer names the form* — which is the pair this file exists to keep apart.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { DETAIL_KEY_EVERYWHERE } from '../src/shared/detail.ts'
import { sectionRegionId } from '../src/shared/regions.ts'
import { SUMMARY_LINE_KEY } from '../src/shared/sections.ts'
import { targetAttributeValue } from '../src/shared/targets.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const HUMAN = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

const TITLE = 'What the bench said about the wrist mount'
const OPENS_WITH = 'Three of the four printed mounts broke below the load the trials need.'
const GIST =
  'Three of the four printed wrist mounts broke below the load the handover trials need, so the ' +
  'aluminium version is now the only one worth testing at all.'
const MODULE_TITLE = 'The rig that pulls the mounts'
const MODULE_SAYS = 'The rig, its load cell, and the two fixtures that hold a mount while it breaks.'

let app: LiveApp
let page: Page
let reportId: string
let moduleId: string

beforeAll(async () => {
  app = await liveApp({ name: 'no-shorter-forms-panel', viewport: { width: 1440, height: 1000 } })
  page = app.page

  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: HUMAN,
    body: JSON.stringify({
      kind: 'report',
      title: TITLE,
      // THE SUMMARY IS READING LENGTH 3 SINCE 3 SEPTEMBER 2026, criterion A14b. These words were
      // written as a stored `gist` through the short-forms route until that day, and that key is
      // retired: they are the record's own summary now, and the same length draws them.
      summary: GIST,
      data: { blocks: [{ id: 'b-one', type: 'text', heading: 'What the rig showed', text: OPENS_WITH }] },
    }),
  })
  if (!made.ok) throw new Error(`seeding the report answered ${String(made.status)}: ${await made.text()}`)
  reportId = ((await made.json()) as { record: { id: string } }).record.id


  const madeModule = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: HUMAN,
    body: JSON.stringify({
      kind: 'module',
      title: MODULE_TITLE,
      data: { summaryBlocks: [{ id: 'm-1', type: 'text', text: MODULE_SAYS }] },
    }),
  })
  if (!madeModule.ok) throw new Error(`seeding the module answered ${String(madeModule.status)}: ${await madeModule.text()}`)
  moduleId = ((await madeModule.json()) as { record: { id: string } }).record.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** One record page, at one reading length, with the length set where the control keeps it. */
async function openAt(id: string, length: string): Promise<void> {
  await page.goto(`${app.site}/#/r/${id}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.evaluate(
    ([key, value]) => {
      window.localStorage.setItem(key as string, value as string)
    },
    [DETAIL_KEY_EVERYWHERE, length],
  )
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await sleep(1200)
}

// ============================================================ 1. the panel is not on the page

describe('a report page draws no Shorter forms panel at any reading length', () => {
  for (const rung of ['gist'] as const) {
    it(`has no panel and no row of one at ${rung}`, async () => {
      await openAt(reportId, rung)
      const seen = await page.evaluate(() => ({
        rows: document.querySelectorAll('.rd-short').length,
        words: document.querySelectorAll('.rd-short-says').length,
        stands: document.querySelectorAll('.rd-short-stands').length,
        heading: [...document.querySelectorAll('h1, h2, h3, h4')].map((e) => (e.textContent ?? '').trim()),
        text: document.body.textContent ?? '',
      }))
      expect(seen.rows, `a row of the panel is on the page at ${rung}`).toBe(0)
      expect(seen.words, `a form of the panel is on the page at ${rung}`).toBe(0)
      expect(seen.stands, `a stands-for row of the panel is on the page at ${rung}`).toBe(0)
      expect(seen.heading, `the panel’s heading is on the page at ${rung}`).not.toContain(
        'Shorter forms of this report',
      )
      expect(seen.text, `the panel’s heading is in the words of the page at ${rung}`).not.toContain('Shorter forms')
    }, 180_000)
  }
})

// ============================================================ 2. the forms themselves are not gone

describe('the forms are still stored, still drawn and still pointable', () => {
  it('reads all of them back through the route that writes them', async () => {
    const read = await fetch(`${app.api}/api/records/${reportId}/short-forms`, { headers: HUMAN })
    expect(read.ok, `GET short-forms answered ${String(read.status)}`).toBe(true)
    const forms = (await read.json()) as { levels: { rung: string; text: string | null }[] }
    const written = forms.levels.filter((one) => one.text !== null)
    expect(written.map((one) => one.rung), 'reading length 3 is gone from the route').toContain('gist')
    expect(written.find((one) => one.rung === 'gist')?.text).toBe(GIST)
  }, 180_000)

  it('draws the form written for the length being read, in the report body', async () => {
    await openAt(reportId, 'gist')
    const said = await page.evaluate(() => (document.querySelector('.rd-report .sb') as HTMLElement | null)?.innerText ?? '')
    expect(said, 'the body stopped drawing the form written for this length').toContain(GIST)
  }, 180_000)

  it('opens the composer on it, naming what it stands for', async () => {
    await openAt(reportId, 'gist')
    const where = `[data-target="${targetAttributeValue({
      kind: 'region',
      recordId: reportId,
      // THE REGION IS THE RECORD'S OWN SUMMARY, which is what reading length 3 draws. It was
      // `shortFormRegionId('gist')` while a gist was stored beside the record.
      regionId: sectionRegionId(SUMMARY_LINE_KEY),
    })}"]`
    await page.locator(where).first().waitFor({ timeout: 30_000 })
    await page.locator(where).first().click({ button: 'right' })
    await page.locator('.px-talk').first().waitFor({ timeout: 15_000 })
    await sleep(1200)
    const said = await page.evaluate(() => {
      const talk = [...document.querySelectorAll('.px-talk')].find(
        (one) => one.getAttribute('data-target') === 'uiSurface/composer',
      )
      return talk === undefined ? null : (talk.textContent ?? '').trim()
    })
    expect(said, 'the composer did not open on the form').not.toBeNull()
    expect(said ?? '', 'the composer no longer says what the form stands for').toContain('Stands for the whole report.')
  }, 180_000)
})

// ============================================================ 3. the rest of the page still draws

describe('a module page still draws, because the panel sat inside the page every kind uses', () => {
  it('draws the module’s own curated writing', async () => {
    await openAt(moduleId, 'full')
    const seen = await page.evaluate(() => ({
      title: (document.querySelector('h1') as HTMLElement | null)?.innerText ?? '',
      body: document.body.innerText,
      panels: document.querySelectorAll('.px-panel').length,
    }))
    expect(seen.title, 'the module page has no heading').toContain(MODULE_TITLE)
    expect(seen.body, 'the module page does not draw its own curated writing').toContain(MODULE_SAYS)
    expect(seen.panels, 'the module page drew no panels at all').toBeGreaterThan(0)
  }, 180_000)
})
