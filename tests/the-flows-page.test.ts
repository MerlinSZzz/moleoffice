// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FLOWS PAGE, THE LIST AND ONE FLOW, AS PROPOSAL 4MWRAEISTEE8 DRAWS THEM. Wave 13p round 35, from two of the
 * owner's decisions. In a real browser, on this test's own office:
 *
 * 1. THE LIST SAYS WHAT IS TRUE OF EACH FLOW, AND WHAT IS TRUE OF THE RUNS THAT NAMED NONE. A flow with no runs says
 *    "never run"; the heading line says how many runs named no flow; "Most runs" puts the busiest flow first.
 *    MUTATION: in src/web/pages/FlowsPage.tsx the heading line drew `page.matched` for the runs that named no flow.
 *    This case went red.
 * 2. ONE FLOW DRAWS ITS RUNS OVER ITS STAGES. Each stage's tally counts the runs that recorded stage numbers; a run
 *    that recorded none says so in one line; each mark is a glyph as well as a colour.
 *    MUTATION: `outcomesOf` kept the first step at a stage number instead of the last. This case went red.
 * 3. THE REASONS ARE ASKED FOR ONLY WHEN THE FOLD IS OPENED. Nothing asks for `secondLevel=show` until the fold
 *    opens; then one request does, and a stage's why is drawn.
 *    MUTATION: `TheReasons` started with `opened` true. This case went red.
 * 4. A FLOW OF THREE STAGES STANDS IN A ROW AT 1440, IN TWO COLUMNS AT 800, AND IN ONE AT 390. Below 40rem the latest
 *    runs are a list and not a grid. Round 37 kept these numbers and changed the rule under them: a row holds as many
 *    16rem boxes as fit, and never more than there are stages. The count waits for the columns, which are set after the
 *    list is measured.
 *    MUTATION (round 35): the 40rem rule of `.flw-stages` was removed, so the boxes stood in one column at 800. Red.
 *    MUTATION (round 37): `STAGE_MIN_REM` was 12, so three boxes stood in a row at 800. Red (with case 5).
 * 5. A FLOW OF 30 STAGES AND ONE OF 60 FIT AT 1440 AND 390. Round 35 put every stage in one row, and the
 *    inspector measured 19, 154 and 472px of sideways scroll on 30 stages. Here the page does not scroll sideways, no
 *    box is narrower than 250px, and each arrow points where the next box actually stands.
 *    MUTATION: `.flw-grid-box` lost `position: relative`, so the 1px words only a screen reader hears escaped the
 *    grid's scroll. Red: 153px at 990 on 30 stages.
 *    MUTATION: `useStageColumns` set one column per stage. Red: 19px at 1440 on 30 stages (and case 4).
 *    MUTATION: `nextOf` pointed a row's last arrow right. Red: "stage 28: right where the next is wrap".
 *
 * CONTROL (round 35): 4 passed (.logs/named-tests-2026-10-11T02-11-14-986.log). Each mutation alone: 1 failed, 3 passed,
 * the case named above (.logs/named-tests-2026-10-11T02-11-33-587.log, -02-11-54-567, -02-12-15-417, -02-12-38-108).
 * RESTORE: 4 passed (.logs/named-tests-2026-10-11T02-12-59-765.log).
 * CONTROL (round 37): 5 passed (.logs/named-tests-2026-10-11T05-19-11-693.log). Mutations, in the order above: case 5
 * red (.logs/named-tests-2026-10-11T05-19-45-638.log); cases 4 and 5 red (-05-20-20-338); case 5 red (-05-20-59-685);
 * cases 4 and 5 red (-05-21-32-070). RESTORE: 5 passed (.logs/named-tests-2026-10-11T05-22-09-710.log).
 *
 * THE OFFICE IS THIS TEST'S OWN. `liveApp` starts its own API and database. Every flow and run here is made up.
 */

import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { createI18n } from '../src/shared/i18n.ts'

let app: LiveApp
const en = createI18n('en')

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function send(url: string, body: object): Promise<Record<string, any>> {
  const reply = await fetch(app.api + url, { method: 'POST', headers: PERSON, body: JSON.stringify(body) })
  const text = await reply.text()
  expect(reply.status, `POST ${url}: ${text}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

const aFlow = async (title: string, stages: number, source: string): Promise<string> =>
  (
    await send('/api/records', {
      kind: 'flow',
      title,
      data: {
        declared_in: 'tools/test-pottery.mjs',
        runs: 'the test potter',
        trigger: `A test order for ${title}.`,
        leaves_behind: 'a test pot',
        stages: Array.from({ length: stages }, (_, k) => ({ n: k + 1, does: `Test stage ${k + 1}.`, evidence: 'A test note.', why: `Test why ${k + 1}.`, sources: [source] })),
      },
    })
  )['record'].id as string

const step = (n: number | undefined, outcome: string) => ({ ...(n === undefined ? {} : { n }), does: 'A test step.', startedAt: '2026-10-01 10:00:00', how: 'by the office', outcome })

let busy = ''
let quiet = ''
let source = ''
/**
 * HOW MANY RUNS NAMED NO FLOW, COUNTED IN THE TABLE BY THIS TEST'S OWN QUERY. The office files a run of its own for each
 * session it starts, and those name no flow either, so the number is read rather than assumed.
 */
let namingNoFlow = 0

beforeAll(async () => {
  app = await liveApp({ name: 'the-flows-page', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  source = (await send('/api/records', { kind: 'report', title: 'Test: how a pot is thrown', data: { for: 'The owner', date: '2026-10-11', blocks: [{ id: 'b-1', type: 'text', text: 'Made up.' }] } }))['record'].id as string
  busy = await aFlow('Test: throwing a pot', 3, source)
  quiet = await aFlow('Test: a flow nobody ran', 2, source)
  // ONLY THE OFFICE FILES A FLOW RUN, so the runs are written into the table, the way tests/flows-page-reads.test.ts does.
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    const like = db.prepare("SELECT * FROM records WHERE kind = 'flow' LIMIT 1").get() as Record<string, unknown>
    const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString().replace('T', ' ').slice(0, 19)
    const runs: [string | null, Record<string, unknown>[], number][] = [
      // The newest run recorded no stage numbers.
      [busy, [step(undefined, 'done')], 1],
      // Stage 2 failed and was done again: the last step at a stage counts.
      [busy, [step(1, 'done'), step(2, 'failed'), step(2, 'done'), step(3, 'still open')], 2],
      [busy, [step(1, 'done'), step(2, 'failed')], 3],
      [null, [step(undefined, 'done')], 4],
    ]
    runs.forEach(([flow, steps, minutesAgo], i) => {
      const data = flow === null ? { run: `test-session-${i}`, noFlow: 'This run named no flow.', stepsTaken: steps } : { run: `test-session-${i}`, flow, stepsTaken: steps }
      const row = { ...like, id: `test-run-${i}`, kind: 'flow_run', title: 'Flow run', data: JSON.stringify(data), created_at: at(minutesAgo), updated_at: at(minutesAgo) }
      const columns = Object.keys(row)
      db.prepare(`INSERT INTO records (${columns.map((c) => `"${c}"`).join(',')}) VALUES (${columns.map((c) => `@${c}`).join(',')})`).run(row)
    })
    namingNoFlow = (db.prepare("SELECT count(*) AS n FROM records WHERE kind = 'flow_run' AND deleted_at IS NULL AND json_extract(data, '$.flow') IS NULL").get() as { n: number }).n
  } finally {
    db.close()
  }
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

async function open(page: Page, hash: string, waitFor: string): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#${hash}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector(waitFor, { timeout: 30_000 })
}

it('1. lists each flow with what is true of it, and says how many runs named no flow', async () => {
  const page = app.page
  await page.setViewportSize({ width: 1440, height: 1000 })
  await open(page, '/flows', '.flw-row')
  // At least the one this test filed, and the number is not the number of flows.
  expect(namingNoFlow).toBeGreaterThanOrEqual(1)
  expect(namingNoFlow).not.toBe(2)
  expect(await page.locator('.flw-count').textContent()).toBe(`${en.t('flows.count', { n: 2 })} · ${en.t('flows.noFlowRuns', { n: namingNoFlow })}`)
  const rows = page.locator('.flw-row')
  // By name, the order a page of flows takes when none is asked.
  expect(await rows.locator('.flw-row-title').allTextContents()).toEqual(['Test: a flow nobody ran', 'Test: throwing a pot'])
  const nobody = rows.filter({ hasText: 'Test: a flow nobody ran' })
  expect(await nobody.textContent()).toContain(en.t('flows.neverRun'))
  expect(await nobody.textContent()).toContain(en.t('flows.stages', { n: 2 }))
  expect(await nobody.textContent()).toContain(en.t('flows.runs30d', { n: 0 }))
  const thrown = rows.filter({ hasText: 'Test: throwing a pot' })
  expect(await thrown.textContent()).toContain(en.t('flows.runs30d', { n: 3 }))
  expect(await thrown.textContent()).toContain('A test order for Test: throwing a pot.')
  expect(await thrown.textContent()).toContain('the test potter')
  expect(await thrown.textContent()).not.toContain(en.t('flows.neverRun'))
  await page.getByRole('button', { name: en.t('flows.sort.runs') }).click()
  await page.waitForFunction(() => document.querySelector('.flw-row-title')?.textContent === 'Test: throwing a pot', null, { timeout: 15_000 })
  expect(await page.getByRole('button', { name: en.t('flows.sort.runs') }).getAttribute('aria-pressed')).toBe('true')
  // Search looks in titles.
  await page.getByRole('searchbox', { name: en.t('flows.search') }).fill('nobody')
  await page.getByRole('button', { name: en.t('flows.searchPress'), exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.flw-row').length === 1, null, { timeout: 15_000 })
  expect(await page.locator('.flw-row-title').allTextContents()).toEqual(['Test: a flow nobody ran'])
  await page.getByRole('searchbox', { name: en.t('flows.search') }).fill('')
  await page.getByRole('button', { name: en.t('flows.searchPress'), exact: true }).click()
  await page.getByRole('button', { name: en.t('flows.sort.name') }).click()
}, 120_000)

it('2. draws one flow’s runs over its stages, with a tally per stage and one line for a run with no stage numbers', async () => {
  const page = app.page
  await page.setViewportSize({ width: 1440, height: 1000 })
  await open(page, `/flows/${busy}`, '.flw-stage')
  expect(await page.locator('h1').textContent()).toBe('Test: throwing a pot')
  expect(await page.locator('.flw-facts').textContent()).toContain('tools/test-pottery.mjs')
  expect(await page.locator('.flw-note').first().textContent()).toBe(en.t('flows.tally.from', { n: 2 }))
  const tallies = await page.locator('.flw-stage .flw-tally').allTextContents()
  // EACH MARK OF A TALLY IS ITS GLYPH AND THE WORD OF ITS COUNT, done, failed and open in that order.
  const tally = (done: number, failed: number, open: number) =>
    `✓ ${en.t('flows.tally.done', { n: done })}✕ ${en.t('flows.tally.failed', { n: failed })}○ ${en.t('flows.tally.open', { n: open })}`
  expect(tallies).toEqual([tally(2, 0, 0), tally(1, 1, 0), tally(0, 0, 1)])
  const grid = page.locator('.flw-grid tbody tr')
  expect(await grid.count()).toBe(3)
  expect(await grid.nth(0).locator('.flw-grid-none').textContent()).toBe(en.t('flows.runs.noStageNumbers'))
  expect(await grid.nth(1).locator('.flw-mark [aria-hidden="true"]').allTextContents()).toEqual(['✓', '✓', '○'])
  expect(await grid.nth(2).locator('.flw-mark [aria-hidden="true"]').allTextContents()).toEqual(['✓', '✕', '·'])
  expect(await grid.nth(2).locator('.flw-mark .px-sr').allTextContents()).toContain(en.t('flows.runs.notReached'))
  // A flow nobody ran says so under its latest runs, and draws no tally. The line is read in the runs section, found by
  // its heading, because the Handbooks section above it draws a line of its own in the same style.
  await open(page, `/flows/${quiet}`, '.flw-stage')
  const theRuns = page.locator('section', { has: page.locator('h2', { hasText: en.t('flows.runsHeading') }) })
  expect(await theRuns.locator('.flw-says').textContent()).toBe(en.t('flows.runs.none'))
  expect(await page.locator('.flw-tally').count()).toBe(0)
}, 120_000)

it('3. asks for the reasons only when the fold is opened', async () => {
  const page = app.page
  const asked: string[] = []
  const listen = (request: { url(): string }) => {
    if (request.url().includes('secondLevel=show')) asked.push(request.url())
  }
  page.on('request', listen)
  try {
    await open(page, `/flows/${busy}`, '.flw-reasons')
    await page.waitForTimeout(500)
    expect(asked).toEqual([])
    expect(await page.locator('.flw-reasons').getAttribute('open')).toBeNull()
    await page.locator('.flw-reasons > summary').click()
    await page.waitForSelector('.flw-reasons-stages', { timeout: 15_000 })
    expect(asked.length).toBe(1)
    expect(await page.locator('.flw-reasons-stages').textContent()).toContain('Test why 2.')
    expect(await page.locator('.flw-reasons .flw-source').first().getAttribute('href')).toContain(source)
  } finally {
    page.off('request', listen)
  }
}, 120_000)

it('4. stands the stages in a row, in two columns or in one, and draws the runs as a list below 40rem', async () => {
  const page = app.page
  const columns = async (): Promise<number> =>
    page.evaluate(() => new Set([...document.querySelectorAll('.flw-stage')].map((box) => Math.round(box.getBoundingClientRect().left))).size)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await open(page, `/flows/${busy}`, '.flw-stage')
  await expect.poll(columns, { timeout: 10_000 }).toBe(3)
  expect(await page.locator('.flw-grid').isVisible()).toBe(true)
  // THE COLUMNS ARE SET AFTER THE LIST IS MEASURED, so a count straight after a resize can read the old layout.
  await page.setViewportSize({ width: 800, height: 1000 })
  await expect.poll(columns, { timeout: 10_000 }).toBe(2)
  await page.setViewportSize({ width: 390, height: 900 })
  await expect.poll(columns, { timeout: 10_000 }).toBe(1)
  expect(await page.locator('.flw-grid').isVisible()).toBe(false)
  expect(await page.locator('.flw-runlist').isVisible()).toBe(true)
  expect(await page.locator('.flw-runlist-none').textContent()).toBe(en.t('flows.runs.noStageNumbers'))
}, 120_000)

it('5. fits a flow of 30 stages and one of 60 at every width, with no sideways scroll and every box readable', async () => {
  const page = app.page
  const long: [number, string][] = []
  for (const n of [30, 60]) long.push([n, await aFlow(`Test: a pot of ${n} stages`, n, source)])
  // Runs at every stage, so the grid of latest runs is as wide as the flow is long.
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    const like = db.prepare("SELECT * FROM records WHERE kind = 'flow' LIMIT 1").get() as Record<string, unknown>
    for (const [n, flow] of long) {
      const data = { run: `test-session-long-${n}`, flow, stepsTaken: Array.from({ length: n }, (_, k) => step(k + 1, k === n - 1 ? 'failed' : 'done')) }
      const row = { ...like, id: `test-run-long-${n}`, kind: 'flow_run', title: 'Flow run', data: JSON.stringify(data) }
      const columns = Object.keys(row)
      db.prepare(`INSERT INTO records (${columns.map((c) => `"${c}"`).join(',')}) VALUES (${columns.map((c) => `@${c}`).join(',')})`).run(row)
    }
  } finally {
    db.close()
  }
  for (const [n, flow] of long) {
    // THE TWO EXTREMES: a wide screen and the narrowest one.
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await open(page, `/flows/${flow}`, '.flw-stage')
      await page.waitForSelector(width > 640 ? '.flw-grid' : '.flw-runlist', { timeout: 30_000 })
      const seen = await page.evaluate(() => {
        const boxes = [...document.querySelectorAll('.flw-stage')] as HTMLElement[]
        const at = boxes.map((box) => box.getBoundingClientRect())
        // Where the next box actually stands, against where the arrow says it is.
        const wrong = boxes.flatMap((box, i) => {
          const here = at[i]!
          const there = at[i + 1]
          const truth = there === undefined ? 'none' : Math.abs(there.top - here.top) < 2 ? 'right' : Math.abs(there.left - here.left) < 2 ? 'down' : 'wrap'
          return box.dataset['next'] === truth ? [] : [`stage ${i + 1}: ${String(box.dataset['next'])} where the next is ${truth}`]
        })
        return { over: document.documentElement.scrollWidth - innerWidth, boxes: boxes.length, narrowest: Math.min(...at.map((r) => r.width)), wrong }
      })
      expect(seen.boxes, `${n} stages at ${width}`).toBe(n)
      expect(seen.over, `${n} stages at ${width}: the page scrolls sideways`).toBeLessThanOrEqual(0)
      // 16rem less a rounding; the words of a stage break a letter to a line well before this.
      expect(seen.narrowest, `${n} stages at ${width}: the narrowest box`).toBeGreaterThanOrEqual(250)
      expect(seen.wrong, `${n} stages at ${width}`).toEqual([])
    }
  }
}, 300_000)
