// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE COMMENTS COLUMN'S HEADING AND ITS BUTTONS LIE BELOW THE TOP BAR, AT EVERY WIDTH.
 * Backlog item 9.22, wave 13y round 42.
 *
 * Round 41's pictures caught the comments column at 390 with its heading, "Comments here", under the frame's top
 * bar. Pressing the comment circle starts the mark layer's move to the record (MarkLayer's scrollIntoView with
 * block:start), and at 390 the column is a band in the page's own flow above the record, so that move carried the
 * band's heading under the bar or off the window. The column's own answer to a press (ReviewPane) fired a frame
 * after the press, saw the window not yet moved, and returned without answering.
 *
 * WHAT THIS HOLDS, at 1440 and 390, in light, with the comments column open on a record that holds a remark:
 *  - the heading and every button in the column's head have their top at or below the top bar's foot;
 *  - every button is the element at its own centre (document.elementFromPoint), so nothing covers it;
 *  - the page does not scroll sideways (scrollWidth <= innerWidth).
 * The window is waited on until smooth scrolling has ended before anything is measured.
 *
 * BEFORE THE CODE CHANGE: the 390 case is red (the heading ends 263px above the window), and 1440 holds on the
 * old code and on the new.
 *
 * MUTATIONS, each a run of this whole file after a control and before its restore:
 *  1. The press answer's band branch returns at once instead of holding the window on the band: the 390 case is
 *     red at the heading's top, and 1440 stays green.
 *  2. App.tsx: the call to useTheBarIsRoomAtTheTop is taken out, so the window keeps no room for the top bar: the
 *     390 case is red at the heading's top, because the answered scroll stops with the band's top at the window's
 *     top, 70px above the bar's foot.
 *
 * With TEST_SHOTS set, each width case photographs the open column at its width, before it judges, so a width
 * that fails still has its picture.
 *
 * Everything here is made up. A throwaway office, synthetic agents and one synthetic remark.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { thePageAtRest } from './the-page-scroller.ts'
import { testShots } from './where-shots-go.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS = (handle: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })
const WRITER = { name: 'Kiln Keeper', handle: 'head-bar-kiln' }
const REMARK = 'Synthetic remark: the shelf holds, for the person.'
const shots = testShots('comments-column-top-bar')
let app: LiveApp
let pageId = ''

async function write<T>(path: string, body: unknown, method = 'POST', headers = PERSON): Promise<T> {
  const response = await fetch(app.api + path, { method, headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
  expect(response.ok, await response.clone().text()).toBe(true)
  return await response.json() as T
}
async function file(kind: string, title: string, data: unknown, headers = PERSON): Promise<string> {
  return (await write<{ record: { id: string } }>('/api/records', { kind, title, data }, 'POST', headers)).record.id
}
const row = (body: string) => app.page.locator('.px-rev-item').filter({ has: app.page.locator('.px-rev-words', { hasText: body }) })

/** Wait until the window has not moved for five frames in a row, so every smooth scroll has ended. */
async function windowAtRest(): Promise<void> {
  await app.page.evaluate(() => new Promise<void>((resolve) => {
    let last = window.scrollY
    let still = 0
    const look = () => {
      still = window.scrollY === last ? still + 1 : 0
      last = window.scrollY
      if (still >= 5) resolve()
      else requestAnimationFrame(look)
    }
    requestAnimationFrame(look)
  }))
}

beforeAll(async () => {
  app = await liveApp({ name: 'comments-column-top-bar', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  await app.page.addInitScript(() => localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light'))
  await file('agent', WRITER.name, { handle: WRITER.handle, runtime: 'claude-code', state: 'active' })
  pageId = await file('report', 'Synthetic kiln remarks', { for: 'Robin', date: '2026-10-08', blocks: [
    { id: 'b-1', type: 'text', heading: 'Synthetic observations', text: 'Made-up data for this test: a shelf moved and a glaze changed colour.' },
  ] }, AS(WRITER.handle))
  const context = { target: { kind: 'record', recordId: pageId, workspaceId: 'default' } }
  await file('message', 'Synthetic remark to the person', { body: REMARK, target: context, to: [{ kind: 'person', id: THE_PERSON }] }, AS(WRITER.handle))
  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: 'Pair this browser', exact: true }).click()
  await app.page.getByText('This browser is paired.', { exact: true }).waitFor({ timeout: 30_000 })
}, 240_000)
afterAll(async () => { await app?.stop() }, 60_000)

/** The heading, the head's buttons and the bar, each with the numbers the criterion is about. */
interface Seen {
  barBottom: number
  titleTop: number
  buttons: { words: string; top: number; atItsCentre: boolean }[]
  scrollWidth: number
  innerWidth: number
}

async function measure(): Promise<Seen> {
  return app.page.evaluate(() => {
    const bar = document.querySelector('.shell-bar')
    const barBottom = bar === null || getComputedStyle(bar).display === 'none' ? 0 : Math.max(0, bar.getBoundingClientRect().bottom)
    const title = document.querySelector('.px-pane-title')
    if (title === null) throw new Error('the comments column has no heading')
    const head = title.getBoundingClientRect()
    const buttons = [...document.querySelectorAll<HTMLElement>('.px-pane-head button')].map((button) => {
      const box = button.getBoundingClientRect()
      const at = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      return { words: (button.textContent ?? '').trim(), top: box.top, atItsCentre: at !== null && button.contains(at) }
    })
    return { barBottom, titleTop: head.top, buttons, scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }
  })
}

for (const width of [1440, 390] as const) {
  for (const look of ['light'] as const) {
    it(`keeps the heading and its buttons below the top bar at ${String(width)} in ${look}`, async () => {
      const where = `${String(width)} in ${look}`
      await app.page.setViewportSize({ width, height: width === 390 ? 1440 : 1200 })
      await app.page.goto(`${app.site}/?lang=en&look=${look}#/r/${pageId}`)
      await waitForThePage(app.page, 60_000)
      expect(await app.page.locator('html').getAttribute('data-theme')).toBe(look)
      await app.page.locator('.px-comment-circle').first().click()
      await app.page.locator('.px-pane-title').waitFor({ timeout: 30_000 })
      expect(await app.page.locator('.px-pane-title').innerText()).toBe('Comments here')
      await row(REMARK).waitFor({ timeout: 30_000 })
      await thePageAtRest(app.page)
      const seen = await measure()
      // BEFORE THE CASE JUDGES, so a width that fails still has its picture for the before-and-after pair.
      if (process.env['TEST_SHOTS'] !== undefined) {
        await app.page.screenshot({ path: `${shots}/column-${String(width)}-${look}.png` })
      }
      expect(seen.titleTop, `${where}: the heading is above the top bar's foot`).toBeGreaterThanOrEqual(seen.barBottom - 0.5)
      for (const button of seen.buttons) {
        const named = button.words === '' ? 'the fold button' : `the ${button.words} button`
        expect(button.top, `${where}: ${named} is above the top bar's foot`).toBeGreaterThanOrEqual(seen.barBottom - 0.5)
        expect(button.atItsCentre, `${where}: ${named} is covered where it is pressed`).toBe(true)
      }
      expect(seen.scrollWidth, `${where}: the page scrolls sideways`).toBeLessThanOrEqual(seen.innerWidth)
    }, 120_000)
  }
}

/**
 * THE COLUMN LEAVES THE WINDOW WHERE THE READER PUTS IT. After a press has been answered, the reader's own wheel
 * takes the window away from the column, and nothing pulls it back. This holds on the old code too, where nothing
 * answers the press at all.
 *
 * WHAT THIS DOES NOT HOLD: that the reader's move stops an answer that is still running. The answer stops by itself
 * once the window has stayed at the column for three frames, about 90ms after the press, and the wheel waits 200ms
 * after the column opens, because Chromium drops a wheel taken while a smooth scroll is in flight. With the reader's
 * moves not listened to at all, this case stays green.
 */
it('leaves the window where the reader puts it after the press is answered', async () => {
  await app.page.setViewportSize({ width: 390, height: 1440 })
  await app.page.goto(`${app.site}/?lang=en&look=light#/r/${pageId}`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.px-comment-circle').first().click()
  await app.page.locator('.px-pane-title').waitFor({ timeout: 30_000 })
  await app.page.waitForTimeout(200)
  await app.page.mouse.move(195, 900)
  await app.page.mouse.wheel(0, 600)
  await app.page.waitForFunction(() => window.scrollY > 100, undefined, { timeout: 10_000 })
  await windowAtRest()
  const scrollY = await app.page.evaluate(() => window.scrollY)
  expect(scrollY, 'the column pulled the window back after the reader scrolled away').toBeGreaterThan(100)
}, 120_000)
