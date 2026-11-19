// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PHONE'S BAR KEEPS THE CHAT PRESS LEVEL WITH THE MENU PRESS WHEN BOTH COUNTS ARE DRAWN.
 *
 * Round 165 made Menu, Decisions and the chat square 44px presses on a phone, because with their words drawn the three
 * took about 380 of the 290 pixels a phone's bar has beside the page's name, and the bar wrapped to two rows. Round 170
 * found the last wrap: with a Decisions count AND the urgent pill drawn ("7 urgent"), the chat's press is left alone on
 * a second row. The bar has room for the three 44px presses and the pill; what pushed the chat down was the page's name
 * column shrinking while the counts sat before the chat press. The bar now stops the page's name from being cut and puts
 * the counts after the chat press, so a bar that cannot hold everything moves the counts to a second row and keeps the
 * chat press on the menu press's row.
 *
 * WHAT THIS MEASURES, in a real browser on a test office of this file's own, at 390 by 844 in both looks:
 *   - the bar really draws the Decisions count and a pill saying "7 urgent" (seven open problems waiting on the person);
 *   - the chat press's top edge is level with the menu press's top edge, within one pixel.
 * The counts may stand on a second row, so the bar's other parts need not share one row with the chat press. An earlier
 * version of this test also required every visible part of the bar to share one row by its middle. That asked for more
 * than the problem says, and it ruled out the second row that the folded bar's own rule needs for the counts.
 *
 * THE PICTURES, only when W13Y_TOP_BAR_PICTURES names a folder: the bar at 1440, 990, 660 and 390, in both looks, with
 * the made-up label above the page and the pointer off the page. At 1440 the phone's bar is not drawn — the sidebar
 * carries the shell there — so that picture is the top of the page, and the other three are the bar itself.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { readStoredWord } from '../src/shared/i18n.ts'
import { pathFor } from '../src/web/components/router.tsx'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

const CALLED = 'the-phone-bar-keeps-the-chat-press-level'
const PICTURES = process.env['W13Y_TOP_BAR_PICTURES']
const LABEL = 'Made-up data — an invented office, not real office data'
const THE_PAGE_TOP = '#main > *:not([data-made-up-label]):not(style)'
const PHONE = { width: 390, height: 844 }
const LOOKS = ['light', 'dark'] as const
const URGENT = 7
const AGENT = { name: 'Made-up Bar Agent', handle: 'made-up-bar-agent' }
const OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
const AS_THE_AGENT = { ...OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENT.handle }

let app: LiveApp

async function file(path: string, body: object, headers: Record<string, string>): Promise<Record<string, any>> {
  const answer = await fetch(app.api + path, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await answer.text()
  expect(answer.status, `${path}: ${text.slice(0, 600)}`).toBe(201)
  return JSON.parse(text) as Record<string, any>
}

beforeAll(async () => {
  app = await liveApp({ name: CALLED, workspace: 'default', viewport: PHONE })
  await file('/api/records', { kind: 'agent', title: AGENT.name, data: { handle: AGENT.handle, runtime: 'claude-code', state: 'active' } }, OWNER)
  // A FORK THE PERSON SETTLES, so the bar draws the Decisions count.
  await file('/api/records', {
    kind: 'proposal',
    title: 'A made-up fork for the bar',
    data: {
      question: 'Which made-up shelf takes the new folders?',
      options: ['a — The top shelf.', 'b — The low shelf.'],
      recommendation: 'Take (a). It is empty.',
      because: 'Made up for the bar test.',
      who_settles_it: 'the owner',
    },
  }, AS_THE_AGENT)
  // SEVEN OPEN PROBLEMS WAITING ON THE PERSON, so the attention list draws the pill saying "7 urgent".
  for (let i = 1; i <= URGENT; i++) {
    await file('/api/records', {
      kind: 'problem',
      title: `Made-up bar problem ${String(i)}`,
      data: { state: 'open', whose_move: 'person' },
    }, OWNER)
  }
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** A fresh window whose stored theme is set before the app runs. */
async function aWindow(width: number, theme: 'light' | 'dark'): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({ viewport: { width, height: width === PHONE.width ? PHONE.height : 900 } })
  await context.addInitScript(({ id, theme }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id }))
    localStorage.setItem('mole-office.preset.theme', theme)
    localStorage.setItem('mole-office.workspace', 'default')
  }, { id: THE_TEST_OFFICES_OWNER.id, theme })
  return { context, page: await context.newPage() }
}

async function open(page: Page, address: string): Promise<void> {
  await page.goto(`${app.site}/?lang=en#${address}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/** Every visible part of the bar: its first class, and where its top, bottom and middle stand. */
async function theBarParts(page: Page): Promise<{ name: string; top: number; bottom: number; middle: number }[]> {
  return page.locator('.shell-bar').evaluate((bar) =>
    [...bar.children]
      .filter((one) => one.getClientRects().length > 0)
      .map((one) => {
        const at = one.getBoundingClientRect()
        return { name: one.className.split(' ')[0] ?? one.tagName, top: at.top, bottom: at.bottom, middle: at.top + at.height / 2 }
      }),
  )
}

it('draws the chat press level with the menu press, with the Decisions count and seven urgent things', async () => {
  for (const theme of LOOKS) {
    const { context, page } = await aWindow(PHONE.width, theme)
    try {
      await open(page, pathFor('records'))
      expect(await page.locator('html').getAttribute('data-theme'), `the ${theme} look is not the look the page is in`).toBe(theme)
      // BOTH COUNTS ARE REALLY DRAWN, or this measures a bar that never had the problem.
      await page.locator('.shell-bar [data-count="decisions"]').waitFor({ timeout: 30_000 })
      const pill = page.locator('.shell-bar-status[data-count="urgent"]')
      await pill.waitFor({ timeout: 30_000 })
      expect((await pill.innerText()).replace(/\s+/g, ' ').trim(), `the ${theme} look's pill`).toBe(readStoredWord('frameWords.pill.urgentCount', { n: URGENT }))
      expect(await page.locator('.shell-bar-status[data-count="urgent"]').isVisible()).toBe(true)

      const parts = await theBarParts(page)
      const menu = parts.find((one) => one.name === 'shell-menu')
      const chat = parts.find((one) => one.name === 'shell-chat-phone')
      expect(menu, `the ${theme} look: the bar draws no menu press`).toBeDefined()
      expect(chat, `the ${theme} look: the bar draws no chat press`).toBeDefined()
      expect(
        Math.abs(chat!.top - menu!.top),
        `the ${theme} look: the chat press's top is ${String(Math.round(chat!.top))} and the menu press's is ${String(Math.round(menu!.top))}; the bar is ${JSON.stringify(parts)}`,
      ).toBeLessThanOrEqual(1)
      // THE COUNTS MAY STAND ON A SECOND ROW: only the chat press's level with the menu press is asked here.
    } finally {
      await context.close()
    }
  }
}, 240_000)

it.skipIf(PICTURES === undefined)('takes the bar at 1440, 990, 660 and 390 in both looks', async () => {
  const folder = PICTURES!
  mkdirSync(folder, { recursive: true })
  // THE NUMBERS IN THE SAME PASS AS THE PICTURES, so a take before and a take after are measured the same way: one line
  // per width and look that draws the bar, with every press's top, bottom and middle.
  const measures: { width: number; theme: string; parts: { name: string; top: number; bottom: number; middle: number }[] }[] = []
  for (const width of [1440, 990, 660, 390]) {
    for (const theme of LOOKS) {
      const { context, page } = await aWindow(width, theme)
      try {
        await open(page, pathFor('records'))
        expect(await page.locator('html').getAttribute('data-theme'), `the ${theme} picture is not in its look`).toBe(theme)
        await page.locator('.shell-bar [data-count="decisions"]').waitFor({ timeout: 30_000 }).catch(() => undefined)
        if (width < 1024) measures.push({ width, theme, parts: await theBarParts(page) })
        await putTheMadeUpLabelIn(page, LABEL, page.locator(THE_PAGE_TOP).first(), CALLED)
        // THE POINTER OFF THE PAGE, so no hover is drawn in the picture.
        await page.mouse.move(width - 2, 900 - 2)
        await page.waitForTimeout(500)
        await page.screenshot({ path: join(folder, `top-bar-${String(width)}-${theme}.png`) })
      } finally {
        await context.close()
      }
    }
  }
  writeFileSync(join(folder, 'bar-measures.json'), JSON.stringify(measures, null, 2))
}, 300_000)
