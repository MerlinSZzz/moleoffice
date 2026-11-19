// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT USE REFUSAL ROW KEEPS ITS PARTS APART (wave 13y round 146, item 83). Under "Where agents are turned away", a
 * row ran its three parts together, as "wrong shape1 timerecord.write (1)". The reason, the count and the operations
 * were three pieces of text with no room between them, where every other row on the page sets its parts apart.
 *
 * In a test office of its own, this file has a made-up agent make calls the office refuses for two reasons, opens Agent
 * use and measures each refusal row's parts.
 *
 * 1. AT 1440 AND 390, EACH ROW'S PARTS ARE APART. The count is on the reason's line with at least 8 pixels between
 *    them, or on a line of its own. The operations start on a line of their own, at the row's left edge.
 *
 * Set W13Y_ITEM_83_SHOTS to a folder outside the checkout, and W13Y_ITEM_83_LOOK to light or dark, to photograph the
 * refusal rows at 1440, 990, 660 and 390 in that look. One run takes one look, so each look is taken in a test office
 * of its own. The ordinary run takes none. Every call here is made up, and every picture says so above the rows.
 *
 * MUTATIONS: the row is drawn without the class that lays its parts out, and 1 goes red.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn, takeTheMadeUpLabelOut } from './the-made-up-label-above-the-page.ts'

let app: LiveApp

const AGENT = { handle: 'ledger-reader', name: 'Ledger Reader' }
const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_THE_AGENT = { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENT.handle }

const shots = process.env['W13Y_ITEM_83_SHOTS']
/** The one look a picture run takes. */
const look = process.env['W13Y_ITEM_83_LOOK']
const MADE_UP = 'Made-up data — an invented office and invented refused calls, not real office data'

/** The calls the office refuses, and the status each was refused with. */
const refused: { call: string; status: number }[] = []

async function call(method: string, path: string, body?: unknown): Promise<number> {
  const res = await fetch(`${app.api}${path}`, { method, headers: AS_THE_AGENT, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  await res.text()
  return res.status
}

beforeAll(async () => {
  app = await liveApp({ name: 'agent-use-refusal-row', viewport: { width: 1440, height: 1000 } })
  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title: AGENT.name, data: { handle: AGENT.handle, runtime: 'claude-code', state: 'active' } }),
  })
  expect(made.status, await made.text()).toBe(201)
  // TWO REASONS, so the band draws two rows: a write of a kind the office does not have, twice, and a read of a
  // record that is not there.
  for (const title of ['Made-up write of an unknown kind', 'Made-up second write of an unknown kind']) {
    refused.push({ call: 'a write of an unknown kind', status: await call('POST', '/api/records', { kind: 'no-such-kind', title }) })
  }
  refused.push({ call: 'a read of a missing record', status: await call('GET', '/api/records/no-such-record-1') })
  for (const one of refused) expect(one.status, `${one.call} was not refused`).toBeGreaterThanOrEqual(400)
  expect(new Set(refused.map((one) => one.status)).size, 'the two kinds of call were refused for one reason').toBe(2)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** The refusal rows: the only rows on the page that draw their operations under them. */
const ROWS = 'li.usage-row:has(> .usage-row-note)'

async function openAgentUse(width: number): Promise<void> {
  await app.page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
  await app.page.goto(`${app.site}/?lang=en#/agent-use`)
  await waitForThePage(app.page, 30_000)
  await expect.poll(() => app.page.locator(ROWS).count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(2)
}

interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

/** Each row's own left edge, and the boxes of the line the reason ends on, the count's first line and the operations' first line. */
async function theRows(): Promise<{ words: string; row: Box; reasonEnds: Box; count: Box; operations: Box }[]> {
  return app.page.locator(ROWS).evaluateAll((rows) => {
    const box = (rect: DOMRect | undefined) => ({ left: rect?.left ?? NaN, right: rect?.right ?? NaN, top: rect?.top ?? NaN, bottom: rect?.bottom ?? NaN })
    const lines = (node: Element | null) => [...(node?.getClientRects() ?? [])]
    return rows.map((row) => {
      const reason = lines(row.querySelector('.usage-row-what'))
      return {
        words: (row as HTMLElement).innerText,
        row: box(row.getBoundingClientRect()),
        reasonEnds: box(reason[reason.length - 1]),
        count: box(lines(row.querySelector('.usage-row-cost'))[0]),
        operations: box(lines(row.querySelector('.usage-row-note'))[0]),
      }
    })
  })
}

/** On one line when the two boxes share most of their height. */
const sameLine = (a: Box, b: Box): boolean => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5 * Math.min(a.bottom - a.top, b.bottom - b.top)

it('1. at 1440 and 390, each refusal row keeps its reason, its count and its operations apart', async () => {
  for (const width of [1440, 390]) {
    await openAgentUse(width)
    for (const one of await theRows()) {
      const where = `at ${String(width)}, the row "${one.words.replace(/\s+/g, ' ')}"`
      if (sameLine(one.reasonEnds, one.count)) {
        expect(one.count.left - one.reasonEnds.right, `${where}: the count touches the reason`).toBeGreaterThanOrEqual(8)
      } else {
        expect(one.count.top, `${where}: the count is neither beside the reason nor under it`).toBeGreaterThanOrEqual(one.reasonEnds.bottom - 1)
      }
      expect(one.operations.top, `${where}: the operations are not on a line of their own`).toBeGreaterThanOrEqual(Math.max(one.reasonEnds.bottom, one.count.bottom) - 1)
      expect(Math.abs(one.operations.left - one.row.left), `${where}: the operations do not start at the row's left edge`).toBeLessThanOrEqual(1)
    }
  }
}, 120_000)

it.runIf(shots)('2. photographs the refusal rows at 1440, 990, 660 and 390 in one look', async () => {
  if (shots === undefined) throw new Error('the pictures need W13Y_ITEM_83_SHOTS')
  if (look !== 'light' && look !== 'dark') throw new Error('the pictures need W13Y_ITEM_83_LOOK, light or dark')
  mkdirSync(shots, { recursive: true })
  await app.page.goto(`${app.site}/`)
  await app.page.evaluate((theme) => localStorage.setItem('mole-office.preset.theme', theme), look)
  for (const width of [1440, 990, 660, 390]) {
    await openAgentUse(width)
    await expect.poll(() => app.page.locator('html').getAttribute('data-theme')).toBe(look)
    const band = app.page.locator(`section.px-panel:has(${ROWS})`).first()
    await putTheMadeUpLabelIn(app.page, MADE_UP, band, `item-83-${look}-${String(width)}`)
    await app.page.waitForTimeout(500)
    await app.page.screenshot({ path: join(shots, `item-83-${look}-${String(width)}.png`) })
    await takeTheMadeUpLabelOut(app.page)
  }
}, 300_000)
