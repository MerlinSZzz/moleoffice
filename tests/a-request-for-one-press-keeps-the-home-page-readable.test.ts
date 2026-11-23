// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REQUEST FOR ONE PRESS DOES NOT COVER THE HOME PAGE'S OWN WORDS.
 *
 * The request is a fixed card at the bottom right, above the corner chat button. It is drawn on
 * every page, and the page kept no room for it: at 390 the home page's last line sat under its top,
 * and at 1440 and 990 the page could not scroll at all while the card covered what was there.
 *
 * This browser files one made-up request and opens Home at 1440 and 390 in the light look. The request
 * and its presses must stay, and every line of the page must be reachable above it: at the end of
 * the page the lowest line of Home's own words sits above the card's top edge.
 */
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const

let app: LiveApp

beforeAll(async () => {
  app = await liveApp({ name: 'one-press-home-room', viewport: { width: 1440, height: 900 } })
  const person = thePersonsKeyHeader(join(app.dir, 'keys.json'))
  const started = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': THE_PERSON,
      ...person,
    },
    body: JSON.stringify({ handle: 'made-up-one-press', name: 'A made-up agent asking for one press', role: 'worker', runtime: 'claude-code' }),
  })
  const text = await started.text()
  expect(started.status, `agent start: ${text}`).toBe(201)
  const key = (JSON.parse(text) as { whatToGiveIt: { key: string } }).whatToGiveIt.key
  const filed = await fetch(`${app.api}/api/one-press`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': 'made-up-one-press',
      'x-mole-office-key': key,
    },
    body: JSON.stringify({
      act: 'change-a-setting',
      inputs: { panel: 'settings.whatiskept', setting: 'keepBackups', value: 14 },
      because: 'Made-up: the backups folder has room for this.',
    }),
  })
  expect(filed.status, `one-press: ${await filed.text()}`).toBe(201)
}, 240_000)

afterAll(async () => { await app?.stop() }, 60_000)

for (const theme of ['light'] as const) for (const viewport of VIEWPORTS) {
  it(`keeps Home readable under the request, at ${String(viewport.width)} in the ${theme} look`, async () => {
    const context = await app.browser.newContext({ viewport })
    await context.addInitScript((look: string) => {
      localStorage.setItem('mole-office.preset.theme', look)
      localStorage.setItem('mole-office.chat.open', 'no')
    }, theme)
    const page = await context.newPage()
    try {
      await page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      await page.locator('.one-press').waitFor({ timeout: 30_000 })
      await page.mouse.move(0, 0)
      await page.waitForTimeout(500)
      const measured = await measureHome(page)
      expect(measured.asks, 'the request lost its press').toContain('Agree')
      expect(measured.asks, 'the request lost its press').toContain('Refuse')
      expect(measured.asks, 'the request lost its press').toContain('Not now')
      expect(measured.popupTop, 'the request is not drawn').not.toBeNull()
      expect(measured.lowestAtEnd, `Home's last line is under the request: ${JSON.stringify(measured)}`).toBeLessThanOrEqual(measured.popupTop!)
    } finally {
      await context.close()
    }
  }, 120_000)
}

interface HomeMeasurement {
  asks: string[]
  popupTop: number | null
  lowestAtEnd: number
  scrollable: number
  padding: string
}

function measureHome(page: import('playwright').Page): Promise<HomeMeasurement> {
  return page.evaluate(() => {
    const popup = document.querySelector<HTMLElement>('.one-press')
    const popupTop = popup?.getBoundingClientRect().top ?? null
    const main = document.querySelector('#main')!
    const scrollers = [document.scrollingElement, ...document.querySelectorAll<HTMLElement>('.shell-main, .shell-body, #main')]
    const tops = scrollers.map((one) => one?.scrollTop ?? 0)
    for (const one of scrollers) if (one !== null) one.scrollTop = one.scrollHeight
    let lowest = -Infinity
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = (node.textContent ?? '').trim()
      const parent = node.parentElement
      if (text === '' || parent === null || !parent.checkVisibility() || parent.closest('.one-press') !== null) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const rect of range.getClientRects()) if (rect.width > 0 && rect.height > 0 && rect.bottom > lowest) lowest = rect.bottom
    }
    const scrollable = Math.max(...scrollers.map((one) => one === null ? 0 : one.scrollHeight - (one === document.scrollingElement ? window.innerHeight : one.clientHeight)))
    scrollers.forEach((one, i) => { if (one !== null) one.scrollTop = tops[i] ?? 0 })
    return {
      asks: [...document.querySelectorAll<HTMLElement>('.one-press button')].map((one) => (one.textContent ?? '').trim()),
      popupTop,
      lowestAtEnd: lowest,
      scrollable,
      padding: getComputedStyle(document.querySelector('.shell-main')!).paddingBottom,
    }
  })
}
