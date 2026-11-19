// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN WAITING DAYS ON A USAGE LIMIT FITS ITS ROW, ON AGENT RUNS AND ON ALL RECORDS, AT EVERY WIDTH.
 *
 * Wave 13q round 55 drew a running run whose next try on a usage limit is more than an hour away as "Waiting on a usage
 * limit until <time>", in place of "running". Those are the longest words a state chip holds, and the round's pictures
 * showed two faults with them:
 *   - on Agent runs at 390 the chip's column is as wide as the chip, so it took the row and left the run's title one
 *     letter wide, and the row ran past the window;
 *   - on All records every word in the state column is kept on one line, so the chip ran past the card at 390 and past
 *     the edge of the table's box at 660.
 *
 * Here each chip is measured against its row, or its cell, and against the box that scrolls it, and on Agent runs the
 * title must keep at least a third of the row. Opened at 1440, 990, 660 and 390, light, in a test office of its own.
 *
 *   node tools/run-named-tests.mjs tests/a-long-wait-fits-its-row.test.ts
 *
 * Set MOLE_LONG_WAIT_FIT_SHOTS to a directory to keep a picture of each row.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { enWave13q } from '../src/shared/words/en-wave-13q.ts'

const WAITS = enWave13q['w13q.longWait.until'].split('{time}')[0]!.trim()
const TITLE = 'Made-up run waiting days on a usage limit'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** When the launcher read the retry, and the next try three days on, which OpenCode named with its reset. */
const SEEN_AT = '2026-11-06T09:00:00.000+00:00'
const DAYS_ON = '2026-11-09T09:00:00.000+00:00'

let app: LiveApp

async function asTheOwner(method: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${app.api}${path}`, { method, headers: { ...AS_THE_OWNER, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) }, body: JSON.stringify(body) })
}

async function open(address: string, width: number): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.emulateMedia({ colorScheme: 'light' })
  await app.page.goto(`${app.site}/?lang=en#${address}`, { waitUntil: 'domcontentloaded' })
  await app.page.reload()
  await waitForThePage(app.page)
}

interface Fit {
  scrollWidth: number
  clientWidth: number
  /** The chip and its words, each with the box it must stay inside, in pixels. */
  boxes: { what: string; right: number; insideRight: number }[]
  /** The title's width and the row's, on Agent runs. */
  title: number | null
  row: number | null
}

/**
 * Measure the chip that says the wait, and its words, against the row or cell `inside` names and against the box that
 * scrolls it, if any. On Agent runs, `title` names the title's cell.
 */
async function measure(row: string, inside: string, title: string | null): Promise<Fit> {
  return app.page.evaluate(({ row, inside, title, words, titled }) => {
    const scope = [...document.querySelectorAll(row)].find((one) => (one.textContent ?? '').includes(titled))
    if (scope === undefined) throw new Error(`no row is titled "${titled}"`)
    const chip = [...scope.querySelectorAll('.px-chip')].find((one) => (one.textContent ?? '').includes(words))
    if (chip === undefined) throw new Error(`no chip in the row says "${words}"`)
    const word = chip.querySelector('.px-chip-word')
    const holder = chip.closest(inside)
    if (word === null || holder === null) throw new Error(`the chip has no words, or is not inside ${inside}`)
    const boxes: Fit['boxes'] = []
    const edges: { what: string; right: number }[] = [{ what: inside, right: holder.getBoundingClientRect().right }]
    let scroller = holder.parentElement
    while (scroller !== null && !['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(scroller).overflowX)) scroller = scroller.parentElement
    if (scroller !== null && scroller !== document.documentElement && scroller !== document.body) {
      edges.push({ what: 'the box that scrolls it', right: scroller.getBoundingClientRect().right })
    }
    for (const [what, element] of [['the chip', chip], ['its words', word]] as const) {
      for (const edge of edges) boxes.push({ what: `${what} against ${edge.what}`, right: element.getBoundingClientRect().right, insideRight: edge.right })
    }
    const titleCell = title === null ? null : scope.querySelector(title)
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      boxes,
      title: titleCell === null ? null : titleCell.getBoundingClientRect().width,
      row: title === null ? null : holder.getBoundingClientRect().width,
    }
  }, { row, inside, title, words: WAITS, titled: TITLE })
}

function expectItFits(fit: Fit, where: string): void {
  expect(fit.scrollWidth, `${where}: the page is ${fit.scrollWidth}px wide in a ${fit.clientWidth}px window`).toBeLessThanOrEqual(fit.clientWidth)
  for (const box of fit.boxes) {
    expect(box.right, `${where}: ${box.what}: it ends at ${Math.round(box.right)}, and the box at ${Math.round(box.insideRight)}`).toBeLessThanOrEqual(box.insideRight + 0.5)
  }
  if (fit.title !== null && fit.row !== null) {
    expect(fit.title, `${where}: the title is ${Math.round(fit.title)}px of a ${Math.round(fit.row)}px row`).toBeGreaterThanOrEqual(fit.row / 3)
  }
}

async function keep(locator: string, name: string): Promise<void> {
  const shots = process.env['MOLE_LONG_WAIT_FIT_SHOTS']
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  await app.page.locator(locator, { hasText: TITLE }).first().screenshot({ path: join(shots, `${name}.png`) })
}

beforeAll(async () => {
  app = await liveApp({ name: 'long-wait-fit', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  // A RUN FILED BY HAND THAT SAYS IT IS RUNNING, marked through the record door as the launcher marks a long wait.
  const filed = await asTheOwner('POST', '/api/records', { kind: 'session', title: TITLE, data: { state: 'running', runtime: 'opencode' } })
  expect(filed.status, `filing the run: ${await filed.clone().text()}`).toBe(201)
  const id = ((await filed.json()) as { record: { id: string } }).record.id
  const mark = {
    provider: 'opencode-go', said: 'Synthetic: Go usage limit reached.', attempt: 1, seenAt: SEEN_AT, resetsAt: DAYS_ON,
    resetFrom: 'named by the error, as OpenCode\'s retry read it: "It will reset in 3 days"', key: 'opencode-login', nextTryAt: DAYS_ON,
  }
  const marked = await asTheOwner('PATCH', `/api/records/${id}`, { dataPatch: { waitingOnALimit: mark } })
  expect(marked.status, `marking the run: ${await marked.clone().text()}`).toBe(200)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('a run waiting days on a usage limit', () => {
  for (const width of [1440, 990, 660, 390]) {
    it(`fits its row on Agent runs at ${width}px, and leaves its title a third of the row`, async () => {
      await open('/sessions', width)
      await app.page.locator('.sx-line', { hasText: TITLE }).first().waitFor({ timeout: 30_000 })
      await keep('.sx-line', `sessions-${width}`)
      expectItFits(await measure('.sx-line', '.px-scan-sum', '.px-scan-main'), `Agent runs at ${width}px`)
    })

    it(`fits its cell on All records at ${width}px, and the box the table scrolls in`, async () => {
      await open('/records', width)
      await app.page.locator('tbody tr', { hasText: TITLE }).first().waitFor({ timeout: 30_000 })
      await keep('tbody tr', `records-${width}`)
      expectItFits(await measure('tbody tr', 'td', null), `All records at ${width}px`)
    })
  }
})
