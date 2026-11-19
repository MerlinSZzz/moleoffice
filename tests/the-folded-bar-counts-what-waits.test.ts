// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE THE RAIL IS FOLDED AWAY, THE TOP BAR COUNTS WHAT WAITS ON THE PERSON. Wave 13q, round 39,
 * problem xcNQXR2ZZVm7, decision 1g6FoyxaXDk4.
 *
 * Below 1024px the rail is a drawer and the bar is the only count on the screen. Its urgent pill
 * reads the attention rule, which selects no fork, so it said "1 urgent" while two forks waited.
 * The bar now draws the rail's own Decisions row too, with the rail's word and the rail's count
 * (`railCount`), opening Decisions; and the urgent count as before, opening Home. Each is drawn
 * only when it is above 0. In a test office with made-up records, in a real browser at 390:
 *
 *   1. Nothing waiting and nothing urgent: the bar draws neither.
 *   2. One fork and one problem waiting on the person: the bar draws both, in English and Chinese.
 *      With both counts drawn on the Decisions page, the bar's project and page lines are not cut
 *      ("提议…" was, in round 39's own sweep): the counts go to a second row instead.
 *   3. Two forks and nothing urgent: the bar draws Decisions 2 and no urgent count.
 *
 * MUTATIONS, one per case, in the commit that adds this file:
 *   1. TheDecisionsCount in src/web/App.tsx draws at 0 (its `n === 0` line removed): case 1 fails.
 *   2. The header draws no NeedsSomebodyPill: case 2 fails.
 *   3. The header draws no TheDecisionsCount: case 3 fails.
 *   4. `.shell-bar` in src/web/App.tsx without `flex-wrap: wrap`: case 2 fails on the cut title.
 *
 * Set W13Q_R39_SHOTS to a folder to photograph the bar in case 2 at 1440, 990, 660 and 390, light
 * and dark, in English and Chinese, and on the Decisions page at 390. The ordinary run takes no picture.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { BrowserContext, Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp
const shots = process.env.W13Q_R39_SHOTS
const contexts: BrowserContext[] = []

const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function request(path: string, method = 'GET', body?: unknown): Promise<any> {
  const response = await fetch(`${app.api}${path}`, {
    method,
    headers: HEADERS,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  expect(response.ok, `${path}: ${await response.clone().text()}`).toBe(true)
  return response.json()
}

const file = async (kind: string, title: string, data: Record<string, unknown>): Promise<string> =>
  (await request('/api/records', 'POST', { kind, title, data })).record.id as string

/** A made-up fork waiting on the person to settle it. */
const aFork = (title: string): Promise<string> =>
  file('proposal', title, {
    question: 'Which glaze goes on the spring batch?',
    options: ['The celadon', 'The tenmoku'],
    because: 'The kiln is booked for Friday.',
    who_settles_it: 'the owner',
  })

/** How many rows the attention reading shows, the urgent pill's number. */
async function urgentNow(): Promise<number> {
  return ((await request('/api/attention')) as { visible: unknown[] }).visible.length
}

/** How many things the waiting door says the person can settle now, the rail's number for forks. */
async function settleNow(): Promise<number> {
  return ((await request('/api/waiting')) as { counts: { settle: number } }).counts.settle
}

async function aWindow(width: number, theme: 'light' | 'dark' = 'light'): Promise<Page> {
  const context = await app.browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme })
  contexts.push(context)
  await context.grantPermissions(['local-network-access'], { origin: app.site })
  await context.addInitScript(`localStorage.setItem('mole-office.preset.theme', '${theme}')`)
  return context.newPage()
}

/** The bar at 390, once both of its counts have been read. */
async function theBar(language: 'en' | 'zh'): Promise<Page> {
  const page = await aWindow(390)
  await page.goto(`${app.site}/?lang=${language}#/notes`)
  await waitForThePage(page, 30_000)
  await page.locator('.shell-bar-page').waitFor()
  await expect.poll(() => page.locator('.shell-bar-status[data-tone="checking"]').count(), { timeout: 10_000 }).toBe(0)
  // The rail's own count has been read once its drawer says it is no longer counting.
  await expect.poll(() => page.locator('.shell-counting').count(), { timeout: 10_000 }).toBe(0)
  return page
}

/** What the bar's Decisions count says: its word and its number, each as drawn. */
async function decisionsSays(page: Page): Promise<{ word: string; number: string; href: string | null }> {
  const count = page.locator('.shell-bar a.shell-bar-status[data-count="decisions"]')
  await count.waitFor({ timeout: 10_000 })
  return {
    word: (await count.locator('span').first().innerText()).trim(),
    number: (await count.locator('.num').innerText()).trim(),
    href: await count.getAttribute('href'),
  }
}

beforeAll(async () => {
  app = await liveApp({ name: 'folded-bar', workspace: 'default', viewport: { width: 1440, height: 900 } })
  if (shots) mkdirSync(shots, { recursive: true })
}, 240_000)

afterAll(async () => {
  for (const context of contexts) await context.close()
  await app?.stop()
}, 60_000)

// THE CASES RUN IN ORDER IN ONE OFFICE, each adding to what the one before filed.
describe('where the rail is folded away, the top bar', () => {
  let problem = ''

  it('draws neither count when nothing waits and nothing is urgent', async () => {
    expect(await urgentNow(), 'the made-up office already has something urgent').toBe(0)
    expect(await settleNow(), 'the made-up office already has something to settle').toBe(0)
    const page = await theBar('en')
    expect(await page.locator('.shell-bar .shell-bar-status').count()).toBe(0)
  }, 120_000)

  it('draws both counts when one fork waits and one thing is urgent, in English and Chinese', async () => {
    await aFork('Which glaze for the autumn batch?')
    problem = await file('problem', 'Test kiln door will not latch', { state: 'open', whose_move: 'person' })
    expect(await urgentNow(), 'one open problem waiting on the person is not one urgent row').toBe(1)
    // The rail counts what the waiting door says, so the bar's number is read from the same door
    // and not assumed: the problem may be one to settle as well as the fork.
    const waiting = await settleNow()
    expect(waiting, 'the fork is not waiting to be settled').toBeGreaterThanOrEqual(1)

    for (const language of ['en', 'zh'] as const) {
      const words = createI18n(language)
      const page = await theBar(language)
      expect(await decisionsSays(page)).toEqual({
        word: words.t('nav.decisions'),
        number: words.t('nav.badge', { n: waiting }),
        href: '#/governance',
      })
      const urgent = page.locator('.shell-bar a.shell-bar-status[data-count="urgent"]')
      await urgent.waitFor({ timeout: 10_000 })
      expect((await urgent.innerText()).replace(/\s+/g, ' ').trim()).toBe(words.t('frameWords.pill.urgentCount', { n: 1 }))
      expect(await urgent.getAttribute('href')).toBe('#/')

      // NOTHING IN THE BAR IS CUT on the page with the longest title the counts open.
      await page.goto(`${app.site}/?lang=${language}#/governance`)
      await waitForThePage(page, 30_000)
      await page.locator('.shell-bar a.shell-bar-status[data-count="decisions"]').waitFor({ timeout: 10_000 })
      for (const line of ['.shell-bar-page', '.shell-bar-project']) {
        const box = page.locator(`.shell-bar ${line}`)
        if ((await box.count()) === 0) continue
        const cut = await box.evaluate((element) => ({ text: element.textContent, cut: element.scrollWidth > element.clientWidth }))
        expect(cut, `the bar's ${line} is cut in ${language}`).toEqual({ text: cut.text, cut: false })
      }
    }

    if (shots) {
      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          for (const language of ['en', 'zh'] as const) {
            const page = await aWindow(width, theme)
            await page.goto(`${app.site}/?lang=${language}#/notes`)
            await waitForThePage(page, 30_000)
            await expect.poll(() => page.locator('.shell-counting').count(), { timeout: 10_000 }).toBe(0)
            await page.screenshot({ path: join(shots, `folded-bar-${String(width)}-${theme}-${language}.png`) })
            if (width === 390) {
              // The Decisions page has the longest title the counts sit beside, so it shows the wrap.
              await page.goto(`${app.site}/?lang=${language}#/governance`)
              await waitForThePage(page, 30_000)
              await expect.poll(() => page.locator('.shell-counting').count(), { timeout: 10_000 }).toBe(0)
              await page.screenshot({ path: join(shots, `folded-bar-decisions-390-${theme}-${language}.png`) })
            }
          }
        }
      }
    }
  }, 240_000)

  it('draws Decisions 2 and no urgent count when two forks wait and nothing is urgent', async () => {
    expect(problem, 'the case before this one filed no problem').not.toBe('')
    // THE PROBLEM IS DELETED, the plainest way to leave nothing urgent; the body-less request carries
    // no content type, which the server would read as an empty JSON body.
    const { 'content-type': _, ...withoutABody } = HEADERS
    const gone = await fetch(`${app.api}/api/records/${problem}`, { method: 'DELETE', headers: withoutABody })
    expect(gone.ok, await gone.text()).toBe(true)
    await aFork('Which clay for the summer batch?')
    expect(await urgentNow(), 'something is still urgent').toBe(0)
    expect(await settleNow(), 'the two forks are not the two things to settle').toBe(2)

    const page = await theBar('en')
    expect(await decisionsSays(page)).toEqual({
      word: createI18n('en').t('nav.decisions'),
      number: createI18n('en').t('nav.badge', { n: 2 }),
      href: '#/governance',
    })
    expect(await page.locator('.shell-bar .shell-bar-status[data-count="urgent"]').count()).toBe(0)
  }, 120_000)
})
