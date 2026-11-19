// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUNNING ROW'S PROCESS MARK STAYS INSIDE ITS ROW, AT EVERY WIDTH, ON THE LIST AND ON THE RUN'S OWN PAGE.
 *
 * Wave 13y round 30 gave a hand-filed running run a mark saying what the office saw of its process (the secretary's decisions
 * 4o6XEDnlZUOd and NWERRgH9KKNV). The third mark is the longest: "by its own word; its process is not shown to be its
 * own", with the reader's sentence after it. The review pictures of that round showed three faults with it:
 *   - at 390 the mark's tag did not wrap, and at about 329 pixels it was wider than the row, so the Agent runs page
 *     scrolled sideways to 465 pixels and the sentence ran past the card;
 *   - at 660 the tag and the sentence were drawn over the age column beside them;
 *   - on the run's own page the mark had no stylesheet, because its styles were in the sessions list's, which that page
 *     does not load. So the sentence was not in the colour the list draws it in, and it touched the tag.
 *
 * THE SENTENCE SITS BESIDE THE TAG ONLY WHILE THE TAG IS ON ONE LINE. Otherwise it goes under it. A box that let the two
 * shrink side by side kept them inside the row at 390, as two narrow columns of two to four words a line.
 *
 * THE OTHER MARK IS CHECKED THE SAME WAY, so the row with no process seen is held to the same edges.
 *
 * Opened at 1440, 660 and 390, light, in a world of its own. The run whose process is not shown to be its
 * own names this test's own process: something runs under that number, and it is node, not the claude program.
 *
 *   node tools/run-named-tests.mjs tests/a-running-rows-process-mark-fits-its-row.test.ts
 *
 * Set MOLE_ITS_PROCESS_MARK_SHOTS to a directory to keep a picture of each row and fact.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { sessionPath } from '../src/web/components/router.tsx'
import { enWave13y } from '../src/shared/words/en-wave-13y.ts'

const NOT_ITS_OWN = enWave13y['sessions.itsProcess.notItsOwn']
const NONE = enWave13y['sessions.itsProcess.none']
const OTHER_TITLE = 'Filed by hand under another program'
const NONE_TITLE = 'Filed by hand with no process'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

let app: LiveApp
let other = ''
let says = ''

/** File a run by hand that says it is running, the way a run is filed when its tool wrote no log. */
async function aRunningRun(title: string, discovered: Record<string, unknown> | null): Promise<string> {
  const response = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_OWNER, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) },
    body: JSON.stringify({
      kind: 'session',
      title,
      data: { state: 'running', runtime: 'claude-code', ...(discovered === null ? {} : { extra: { discovered } }) },
    }),
  })
  expect(response.status, `filing ${title}: ${await response.clone().text()}`).toBe(201)
  return ((await response.json()) as { record: { id: string } }).record.id
}

async function open(address: string, width: number, theme: 'light' | 'dark'): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.emulateMedia({ colorScheme: theme })
  await app.page.goto(`${app.site}/#${address}`, { waitUntil: 'domcontentloaded' })
  await app.page.reload()
  await waitForThePage(app.page)
}

interface Fit {
  scrollWidth: number
  clientWidth: number
  /** Each named box, with the box it must stay inside, in pixels. */
  boxes: { what: string; left: number; right: number; insideLeft: number; insideRight: number }[]
  /** The sentence's colour, and the colour the page draws an inferred word in. */
  sentenceColour: string | null
  inferredColour: string | null
  /** Pixels between the tag's right edge and the sentence's first line, or null when the sentence starts on a line of its own. */
  gap: number | null
  /** How many lines the third mark's words take. */
  tagLines: number | null
}

/** One mark to measure: the row it is on, by words of its title, or null for the only run on the page, and its word. */
interface Mark { row: string | null; word: string }

/**
 * Measure each mark against the box it must stay inside, which `container` names: the tag with the mark's word, and
 * after the third mark the reader's sentence, its colour and its distance from the tag.
 */
async function measure(container: string, marks: Mark[], sentence: string): Promise<Fit> {
  return app.page.evaluate(({ container, marks, sentence }) => {
    const boxes: Fit['boxes'] = []
    let sentenceColour: string | null = null
    let inferredColour: string | null = null
    let gap: number | null = null
    let tagLines: number | null = null
    for (const { row, word } of marks) {
      const scope = row === null ? document.body
        : [...document.querySelectorAll('.sx-line')].find((one) => (one.querySelector('.px-scan-title')?.textContent ?? '').includes(row))
      if (scope === undefined) throw new Error(`no row is titled "${row ?? ''}"`)
      const tag = [...scope.querySelectorAll('.px-tag')].find((one) => one.textContent === word)
      if (tag === undefined) throw new Error(`no mark says "${word}" on ${row ?? 'the page'}`)
      const holder = tag.closest(container)
      if (holder === null) throw new Error(`the mark "${word}" is not inside ${container}`)
      const inside = holder.getBoundingClientRect()
      const box = tag.getBoundingClientRect()
      boxes.push({ what: `the mark "${word}"`, left: box.left, right: box.right, insideLeft: inside.left, insideRight: inside.right })
      if (!word.includes('not shown')) continue
      const said = [...holder.querySelectorAll('span')].find((one) => one.textContent === sentence)
      if (said === undefined) throw new Error(`the sentence "${sentence}" is not written beside the mark`)
      const line = said.getBoundingClientRect()
      boxes.push({ what: 'the sentence', left: line.left, right: line.right, insideLeft: inside.left, insideRight: inside.right })
      sentenceColour = getComputedStyle(said).color
      const probe = document.createElement('span')
      probe.style.color = 'var(--st-inferred)'
      holder.appendChild(probe)
      inferredColour = getComputedStyle(probe).color
      probe.remove()
      const first = said.getClientRects()[0]!
      gap = first.top >= box.bottom - 1 ? null : first.left - box.right
      const words = document.createRange()
      words.selectNodeContents(tag)
      tagLines = new Set([...words.getClientRects()].map((one) => Math.round(one.top))).size
    }
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      boxes,
      sentenceColour,
      inferredColour,
      gap,
      tagLines,
    }
  }, { container, marks, sentence })
}

function expectItFits(fit: Fit, where: string): void {
  expect(fit.scrollWidth, `${where}: the page is ${fit.scrollWidth}px wide in a ${fit.clientWidth}px window`).toBeLessThanOrEqual(fit.clientWidth)
  for (const box of fit.boxes) {
    const said = `${where}: ${box.what} runs from ${Math.round(box.left)} to ${Math.round(box.right)}, and its row from ${Math.round(box.insideLeft)} to ${Math.round(box.insideRight)}`
    expect(box.left, said).toBeGreaterThanOrEqual(box.insideLeft - 0.5)
    expect(box.right, said).toBeLessThanOrEqual(box.insideRight + 0.5)
  }
  expect(fit.sentenceColour, `${where}: the sentence is not in the colour of an inferred word`).toBe(fit.inferredColour)
  if (fit.gap !== null) expect(fit.gap, `${where}: the sentence starts ${fit.gap}px after the mark`).toBeGreaterThanOrEqual(4)
  if (fit.gap !== null) expect(fit.tagLines, `${where}: the sentence is beside a mark broken over ${fit.tagLines ?? 0} lines`).toBe(1)
}

async function keep(locator: string, name: string): Promise<void> {
  const shots = process.env['MOLE_ITS_PROCESS_MARK_SHOTS']
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  await app.page.locator(locator).first().screenshot({ path: join(shots, `${name}.png`) })
}

beforeAll(async () => {
  app = await liveApp({ name: 'its-process-mark', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  // THE START TIME IS NOT READ for a program that is not the claude program, so any stamp gives the same reading.
  other = await aRunningRun(OTHER_TITLE, { pid: process.pid, pidStartedAt: '2026-10-14 08:00:00' })
  await aRunningRun(NONE_TITLE, null)
  says = `its recorded process ${String(process.pid)} is not the claude program`
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('a running row’s process mark', () => {
  for (const width of [1440, 660, 390]) for (const theme of ['light'] as const) {
    it(`stays inside its row on Agent runs at ${width}px in ${theme}`, async () => {
      await open('/sessions', width, theme)
      await app.page.locator('.sx-line', { hasText: OTHER_TITLE }).first().waitFor({ timeout: 30_000 })
      await app.page.locator('.sx-line', { hasText: NONE_TITLE }).first().waitFor({ timeout: 30_000 })
      await keep(`.sx-line:has-text("${OTHER_TITLE}")`, `sessions-${width}-${theme}`)
      const marks = [{ row: OTHER_TITLE, word: NOT_ITS_OWN }, { row: NONE_TITLE, word: NONE }]
      expectItFits(await measure('.px-scan-main', marks, says), `Agent runs at ${width}px in ${theme}`)
    })

    it(`stays inside its fact on the run’s own page at ${width}px in ${theme}`, async () => {
      await open(sessionPath(other), width, theme)
      await app.page.locator('.px-tag', { hasText: NOT_ITS_OWN }).first().waitFor({ timeout: 30_000 })
      await keep(`.sp-fact:has-text("${NOT_ITS_OWN}")`, `session-${width}-${theme}`)
      expectItFits(await measure('dd', [{ row: null, word: NOT_ITS_OWN }], says), `the run’s page at ${width}px in ${theme}`)
    })
  }
})
