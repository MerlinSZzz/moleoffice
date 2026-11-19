// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SESSIONS PAGE STAYS AS WIDE AS THE WINDOW WHEN AN ENTRY CANNOT BE READ.
 *
 * A malformed session entry is printed with its own JSON in the not-readable panel. The JSON is one
 * unbroken string, and the span that carries it had nothing to let it break, so at 660 and 390 the
 * page scrolled sideways and the sentence about the fault was cut. The fault is the same in every
 * language; English and Korean are both measured because the panel was first seen in Korean.
 *
 * The same style carries the JSON from the unclaimed sweep and the orphans list, so this file draws
 * those two as well, and checks that their ordinary Latin words break only between words. Korean
 * breaks at syllable boundaries by the browser's own rule, so the check holds Latin words only.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const SHOTS = process.env['SESSIONS_BROKEN_ENTRY_SHOTS']

const MALFORMED_SESSIONS = {
  sessions: [
    {
      id: 'malformed-session-entry',
      state: 'running',
      someLongField: 'x'.repeat(200),
    },
  ],
  searched: [],
  counts: { running: 1 },
  unreadable: [],
}

const MALFORMED_ORPHANS = {
  orphans: [
    { someLongField: 'x'.repeat(200) },
    { id: 'orphan-with-no-age', describe: 'A made-up orphan with only ordinary words in its sentence', kind: 'process' },
  ],
  unclaimed: {
    summary: 'A made-up sweep',
    resources: [
      { type: 'process', someLongField: 'x'.repeat(200) },
      { type: 'process', key: 'made-up-1' },
    ],
    searched: [],
    unchecked: [],
  },
  searched: [],
}

let app: LiveApp

beforeAll(async () => {
  app = await liveApp({ name: 'sessions-broken-entry', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  await app.context.addInitScript(({ person, fixed }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
    Date.now = () => fixed
  }, { person: THE_TEST_OFFICES_OWNER.id, fixed: Date.parse('2026-10-31T23:00:00Z') })
  await app.page.route('**/api/sessions', async (route) =>
    route.fulfill({
      response: await route.fetch(),
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MALFORMED_SESSIONS),
    }),
  )
  await app.page.route('**/api/resources/orphans', async (route) =>
    route.fulfill({
      response: await route.fetch(),
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MALFORMED_ORPHANS),
    }),
  )
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

async function open(language: string, look: string): Promise<void> {
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${language}&look=${look}&mode=inspect#/sessions`)
  await waitForThePage(app.page, 45_000)
  await app.page.waitForSelector('main.page .sx-problem:has-text("malformed-session-entry")', { state: 'visible', timeout: 30_000 })
}

async function measure(): Promise<{ page: number; window: number; said: string; broken: string[]; theme: string | null }> {
  return await app.page.evaluate(() => {
    const broken: string[] = []
    for (const span of document.querySelectorAll('.sx-problem span')) {
      const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const text = node.textContent ?? ''
        const words = /\S+/g
        for (let found = words.exec(text); found !== null; found = words.exec(text)) {
          const word = found[0]
          if (word.length > 30 || !/^[A-Za-z][A-Za-z'’]*$/.test(word)) continue
          const range = document.createRange()
          range.setStart(node, found.index)
          range.setEnd(node, found.index + word.length)
          const lines = new Set([...range.getClientRects()].map((one) => Math.round(one.top)))
          if (lines.size > 1) broken.push(word)
        }
      }
    }
    return {
      page: document.documentElement.scrollWidth,
      window: document.documentElement.clientWidth,
      said: [...document.querySelectorAll('.sx-problem')].map((one) => one.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim(),
      broken,
      theme: document.documentElement.getAttribute('data-theme'),
    }
  })
}

it('keeps the page as wide as the window with a malformed entry, at every width in both themes', async () => {
  if (SHOTS !== undefined) mkdirSync(SHOTS, { recursive: true })
  const measuredAll: { language: string; look: string; width: number; page: number; window: number; said: string; broken: string[]; theme: string | null; shot: Buffer }[] = []
  for (const language of ['en', 'ko']) {
    for (const look of ['light', 'dark']) {
      for (const width of [1440, 990, 660, 390]) {
        await app.page.setViewportSize({ width, height: 1000 })
        await open(language, look)
        const measured = await measure()
        const shot = await app.page.screenshot({ path: SHOTS === undefined ? undefined : join(SHOTS, `sessions-broken-entry-${language}-${String(width)}-${look}.png`), fullPage: true })
        measuredAll.push({ language, look, width, ...measured, shot })
      }
    }
  }
  for (const language of ['en', 'ko']) {
    for (const width of [1440, 990, 660, 390]) {
      const light = measuredAll.find((one) => one.language === language && one.look === 'light' && one.width === width)
      const dark = measuredAll.find((one) => one.language === language && one.look === 'dark' && one.width === width)
      expect(light !== undefined && dark !== undefined, `${language} ${String(width)}: a picture pass is missing`).toBe(true)
      expect(dark!.shot.equals(light!.shot), `${language} ${String(width)}: the dark picture is the light picture`).toBe(false)
    }
  }
  for (const one of measuredAll) {
    const where = `${one.language} ${one.look} ${String(one.width)}`
    expect(one.theme, `${where}: the page is not in the theme asked`).toBe(one.look)
    expect(one.said, `${where}: the not-readable panel drew no problem`).toContain('malformed-session-entry')
    expect(one.broken, `${where}: an ordinary word broke in the middle: ${one.broken.join(', ')}`).toEqual([])
    expect(one.page, `${where}: the Sessions page is wider than the window`).toBeLessThanOrEqual(one.window + 1)
  }
}, 300_000)

it('photographs the unclaimed and orphan problem lines at every width in both themes', async () => {
  if (SHOTS === undefined) return
  const taken: { language: string; look: string; width: number; shot: Buffer; theme: string | null }[] = []
  for (const language of ['en', 'ko']) {
    for (const look of ['light', 'dark']) {
      for (const width of [1440, 990, 660, 390]) {
        await app.page.setViewportSize({ width, height: 1000 })
        await open(language, look)
        const theme = await app.page.locator('html').getAttribute('data-theme')
        const shot = await app.page.locator('.sx-problems').first().screenshot({ path: join(SHOTS, `sessions-other-problem-places-${language}-${String(width)}-${look}.png`) })
        taken.push({ language, look, width, shot, theme })
      }
    }
  }
  for (const language of ['en', 'ko']) {
    for (const width of [1440, 990, 660, 390]) {
      const light = taken.find((one) => one.language === language && one.look === 'light' && one.width === width)
      const dark = taken.find((one) => one.language === language && one.look === 'dark' && one.width === width)
      expect(light !== undefined && dark !== undefined, `${language} ${String(width)}: a picture pass is missing`).toBe(true)
      expect(dark!.shot.equals(light!.shot), `${language} ${String(width)}: the dark picture is the light picture`).toBe(false)
    }
  }
  for (const one of taken) {
    expect(one.theme, `${one.language} ${one.look} ${String(one.width)}: the page is not in the theme asked`).toBe(one.look)
  }
}, 240_000)
