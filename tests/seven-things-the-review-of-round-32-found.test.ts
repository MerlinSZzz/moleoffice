// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TWO THINGS THE REVIEW OF ROUND 32 FOUND, STILL HELD IN A REAL BROWSER, ON A SCRATCH OFFICE
 * HOLDING MADE-UP RECORDS:
 *   1. in dark mode the missing-detail chip inside its panel reads at 4.5:1 or more against what is
 *      behind it, both by its computed colours and by the pixels the page actually draws;
 *   2. a counter's due line counts calendar days on a fixed clock, at two clocks: one at the edge
 *      where a late-evening start is due on the 22nd day, and one after the clocks go back.
 *
 * The word-pinning cases for the power tree, the decision fields and the due lines were taken out.
 * The two contrast cases and the two clocks are what remain.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp, governsTheWholeProject } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { createI18n } from '../src/shared/i18n.ts'

const english = createI18n('en')
let app: LiveApp
let decisionId = ''
const AS = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const KEEPER = { ...AS, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'test-kite-keeper' }

async function post(path: string, body: unknown, headers: Record<string, string> = AS): Promise<{ record: { id: string } }> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await reply.text()
  expect(reply.status, `${path} ${text}`).toBeLessThan(300)
  return JSON.parse(text) as { record: { id: string } }
}

beforeAll(async () => {
  app = await liveApp({ name: 'r33-seven-things', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  await post('/api/agents/started', { handle: 'test-kite-keeper', name: 'Test kite keeper' })
  decisionId = (await post('/api/records', { kind: 'decision', title: 'Test: mend the tail with tape', data: { option_taken: 'Test: tape', because: 'A made-up reason.', ...governsTheWholeProject(), replaces: [] } })).record.id
  await post('/api/counters', { title: 'Test kite flights', counts: 'Flights of the test kite.', mayAdd: { anyone: false, who: [{ kind: 'agent', id: 'test-kite-keeper' }] }, triggers: [{ kind: 'every', hours: 552 }], action: { kind: 'task', title: 'Test look at the flights' } }, KEEPER)
  // A COUNTER THAT IS DUE WITH ONE TRIGGER: a count of 1, so no reason to wait follows its due
  // time, and nothing else ends that sentence.
  const due = (await post('/api/counters', { title: 'Test kite repairs', counts: 'Repairs of the test kite.', mayAdd: { anyone: false, who: [{ kind: 'agent', id: 'test-kite-keeper' }] }, triggers: [{ kind: 'every', hours: 552 }], action: { kind: 'task', title: 'Test look at the repairs' } }, KEEPER)) as unknown as { counter: { id: string } }
  await post(`/api/counters/${encodeURIComponent(due.counter.id)}/add`, { by: 1, because: 'A made-up repair of the test kite.' }, KEEPER)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

// THE COUNTERS' DUE LINES READ A FIXED CLOCK, never the machine's date. The server sets an "every 552 hours" counter
// due 552 hours after the moment it was filed, and the page counts calendar days from its own clock to that moment. On
// the real clock, a counter filed between midnight and one o'clock in the 23 days before the clocks go back is due
// before midnight of the 22nd day, and the page rightly says 22, so a fixed "23" was red then. A case with a clock
// fixes the page's clock and reads the two kite counters' due moment as the server answers at that clock: the clock
// and 552 hours. Nothing else in the server's answer is changed.
const EVERY = 552 * 3_600_000
const DUE_AT_THE_CLOCK = new Set(['Test kite flights', 'Test kite repairs'])

async function open(language: 'en' | 'zh', address: string, ready: string, look: 'light' | 'dark' = 'light', clock?: string): Promise<Page> {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addInitScript((l) => localStorage.setItem('mole-office.preset.theme', l), look)
  if (clock !== undefined) {
    const now = new Date(clock).getTime() // no offset, so local time, as the product keeps it
    await context.clock.setFixedTime(now)
    await context.route((url) => url.pathname === '/api/counters', async (route) => {
      const reply = await route.fetch()
      const body = await reply.json() as unknown
      const due = (one: unknown): void => {
        if (one === null || typeof one !== 'object') return
        const held = one as Record<string, unknown>
        const next = held['nextDue'] as { at?: unknown } | null | undefined
        if (typeof held['title'] === 'string' && DUE_AT_THE_CLOCK.has(held['title']) && next && typeof next.at === 'string') next.at = localStamp(new Date(now + EVERY))
        for (const value of Object.values(held)) due(value)
      }
      due(body)
      await route.fulfill({ response: reply, json: body })
    })
  }
  const page = await context.newPage()
  await page.goto(`${app.site}/?lang=${language}#${address}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator(ready).first().waitFor({ timeout: 30_000 })
  return page
}
// The two counters' due lines: the one that waits for a count, and the one that is due with one trigger.
const WAITS = '.cnt-entry:has-text("Test kite flights") .cnt-nextdue'
const DUE = '.cnt-entry:has-text("Test kite repairs") .cnt-nextdue'
const text = async (page: Page, selector: string) => ((await page.locator(selector).first().innerText()) ?? '').replace(/\s+/g, ' ').trim()

// Each clock with the calendar days from it to 552 hours later. The clocks go back at 02:00 on Sunday 25 October 2026.
const CLOCKS: ReadonlyArray<readonly [string, string, number]> = [
  ['Monday 5 October 2026, ten past midnight: due at 23:10 on Tuesday 27 October, the 22nd day', '2026-10-05T00:10:00', 22],
  ['Saturday 31 October 2026, a month end after the clock change, half past midnight', '2026-10-31T00:30:00', 23],
]

it.each(CLOCKS)('5. counts the days to a counter\'s due moment by the calendar, and ends a lone trigger\'s line with a full stop, at %s', async (_when, clock, days) => {
  const en = await open('en', '/counters', DUE, 'light', clock)
  expect(await text(en, DUE)).toBe(`Next due in ${days} days.`)
  expect(await text(en, WAITS)).toBe(`Next due in ${days} days. ${english.t('g7a.counters.waitsForACount')}`)
  await en.context().close()
  const zh = await open('zh', '/counters', DUE, 'light', clock)
  expect(await text(zh, DUE)).toBe(`${days} 天后下次触发。`)
  await zh.context().close()
})

it('6. draws every missing-detail chip, the one inside its panel too, at 4.5:1 or more in dark mode', async () => {
  const page = await open('en', `/r/${decisionId}`, '.px-inc .px-inc-mark', 'dark')
  const ratios = await page.locator('.px-inc-mark').evaluateAll((chips) => chips.map((chip) => {
    const parse = (c: string) => { const m = c.match(/[\d.]+/g)!.map(Number); return { r: m[0]!, g: m[1]!, b: m[2]!, a: m[3] ?? 1 } }
    // WHAT IS BEHIND THE CHIP: its own ground over every ground below it, blended from the page up.
    const grounds: string[] = []
    for (let el: Element | null = chip; el !== null; el = el.parentElement) grounds.push(getComputedStyle(el).backgroundColor)
    let under = { r: 255, g: 255, b: 255 }
    for (const ground of grounds.reverse()) {
      const c = parse(ground)
      under = { r: c.r * c.a + under.r * (1 - c.a), g: c.g * c.a + under.g * (1 - c.a), b: c.b * c.a + under.b * (1 - c.a) }
    }
    const ink = parse(getComputedStyle(chip).color)
    const fore = { r: ink.r * ink.a + under.r * (1 - ink.a), g: ink.g * ink.a + under.g * (1 - ink.a), b: ink.b * ink.a + under.b * (1 - ink.a) }
    const lum = (c: { r: number; g: number; b: number }) => [c.r, c.g, c.b].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0)
    const [hi, lo] = [lum(fore), lum(under)].sort((a, b) => b - a)
    return { ratio: (hi! + 0.05) / (lo! + 0.05), inPanel: chip.closest('.px-inc') !== null, ink: getComputedStyle(chip).color, grounds: grounds.join(' | '), size: getComputedStyle(chip).fontSize, weight: getComputedStyle(chip).fontWeight }
  }))
  // EVERY CHIP, the head's and the one inside the panel, by their computed colours: both rgb(152, 160, 175) on
  // rgb(44, 47, 55), 5.09:1. Computed colours cannot see a shadow another element paints over the chip; in round 33
  // the decision band's shadow did, and the drawn chip read about 4.2:1 (off the pictures' pixels). The next
  // case reads the drawn pixels.
  expect(ratios.some((one) => one.inPanel), 'no chip inside the missing-detail panel').toBe(true)
  const ratio = Math.min(...ratios.map((one) => one.ratio))
  expect(ratio, `the chip reads at ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
  await page.context().close()
})

it('6. draws the chip inside its panel at 4.5:1 or more in dark mode, read from the drawn pixels (round 33b)', async () => {
  // THE PICTURE'S PIXELS, NOT THE COMPUTED COLOURS. Another element's shadow painted over the chip is invisible to
  // getComputedStyle: in round 33 the decision band's dark shadow fell over the missing-detail panel and drew the chip
  // at about 4.2:1 while the case above read 5.09:1 (the review of round 33's pictures, report jsUTdQgZEsnU).
  for (const language of ['en', 'zh'] as const) {
    for (const width of [1440, 390]) {
      const context = await app.browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 2 })
      await context.addInitScript(() => localStorage.setItem('mole-office.preset.theme', 'dark'))
      const page = await context.newPage()
      await page.goto(`${app.site}/?lang=${language}#/r/${decisionId}`, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      const chip = page.locator('.px-inc .px-inc-mark').first()
      await chip.waitFor({ timeout: 30_000 })
      await chip.scrollIntoViewIfNeeded()
      const png = (await chip.screenshot()).toString('base64')
      const read = await page.evaluate(async (data) => {
        const picture = new Image()
        picture.src = `data:image/png;base64,${data}`
        await picture.decode()
        const canvas = document.createElement('canvas')
        canvas.width = picture.width
        canvas.height = picture.height
        const drawing = canvas.getContext('2d')!
        drawing.drawImage(picture, 0, 0)
        const pixels = drawing.getImageData(0, 0, canvas.width, canvas.height).data
        // THE GROUND is the colour most pixels hold; THE INK is the pixel furthest from it in contrast.
        const counts = new Map<string, number>()
        for (let at = 0; at < pixels.length; at += 4) {
          const key = `${pixels[at]},${pixels[at + 1]},${pixels[at + 2]}`
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
        const ground = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0].split(',').map(Number)
        const lum = (c: number[]) => c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0)
        const ratio = (a: number[], b: number[]) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi! + 0.05) / (lo! + 0.05) }
        let ink = ground
        for (let at = 0; at < pixels.length; at += 4) {
          const one = [pixels[at]!, pixels[at + 1]!, pixels[at + 2]!]
          if (ratio(one, ground) > ratio(ink, ground)) ink = one
        }
        return { ratio: ratio(ink, ground), ink: ink.join(','), ground: ground.join(',') }
      }, png)
      expect.soft(read.ratio, `${language} ${width}: rgb(${read.ink}) on rgb(${read.ground}) reads at ${read.ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
      await context.close()
    }
  }
})
