// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TAP ON A THIN BAR, ON A PHONE, CHOOSES IT AS THE THING TO ASK ABOUT. Problem hj-gfm7qV5Uw.
 *
 * THE FILE KEEPS ITS OLD NAME. It was written against Home's week bar, which left Home
 * by a decision. Measured on 10 October 2026 at 390 with touch: Chromium moves a tap only onto something that
 * answers a press, such as a link or a fold's summary. A tap 1 pixel under a link one line high on Home was
 * moved 5.5 pixels up onto it. A tap 1 pixel under the plan page's week bar or a pipeline's small bar was not
 * moved at all (0.25 pixels, the finger's rounding), because neither bar answers a press, so a case on either
 * would prove nothing. Home's press to the Projects page names no record, so Ask agent follows it rather than
 * choosing it. The target is now the link of a row of Needs you, which names its record, and the row is a
 * made-up proposal this file files.
 *
 * With Ask agent armed, the next press chooses what to talk about, and a press that moved more than
 * four pixels was read as a drag across words and chose nothing (src/web/components/agent/open.ts).
 * A finger is not a mouse: Chromium moves the click of a tap on a thin target, such as the old week bar
 * on Home, by about five pixels from where the finger came down. So a tap there chose nothing, on
 * the one kind of screen where tapping is the only way in. A touch press now has a larger allowance
 * than a mouse press; a mouse keeps its four pixels, and tests/one-way-into-the-composer.test.ts holds
 * both numbers.
 *
 * IT USES REAL TOUCH EVENTS on a phone-sized page with touch (liveApp's hasTouch), because a click
 * would pass with every touch path deleted.
 *
 * MUTATION: give a touch press the mouse's four pixels again (TOUCH_SLOP_PX = 4 in open.ts); the tap
 * beside the row opens nothing and this case goes red (run and restored again on 10 October 2026).
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const AN_AGENT = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code' }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let app: LiveApp

/** The link of a row of Needs you, which a tap just under it is moved onto. */
const TARGET = '[data-home-section="needs"] a.hm-needs-link'

beforeAll(async () => {
  app = await liveApp({ name: 'week-bar-tap', workspace: 'default', viewport: { width: 390, height: 844 }, hasTouch: true })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AN_AGENT,
    body: JSON.stringify({ kind: 'proposal', title: 'A made-up question to tap beside', data: { question: 'Which of the two made-up ways?', options: ['a — the first way', 'b — the second way'], recommendation: 'Take (a).', because: 'It is made up.', who_settles_it: 'the owner' } }),
  })
  if (!filed.ok) throw new Error(`the proposal was refused: ${await filed.text()}`)
  await app.page.goto(`${app.site}/#/`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.locator(TARGET).waitFor({ timeout: 30_000 })
  await sleep(600)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

const composerSays = () =>
  app.page.evaluate(() => {
    const chip = document.querySelector('.px-talk-quote')
    if (chip === null) return null
    const kind = chip.querySelector('.px-talk-chip-kind')?.textContent?.trim() ?? ''
    const what = chip.querySelector('.px-talk-chip-what')?.textContent?.trim() ?? ''
    return `${kind} ${what}`.trim()
  })

it('opens the composer when a tap beside a thin press is moved onto it', async () => {
  // ON A PHONE ASK AGENT IS IN THE RAIL'S DRAWER, behind the Menu press in the top bar.
  await app.page.getByRole('button', { name: 'Menu' }).tap()
  await sleep(600)
  await app.page.tap('.px-point-switch')
  await sleep(600)
  expect(await app.page.evaluate(() => document.documentElement.getAttribute('data-pointing')), 'the tap did not arm Ask agent').toBe('1')
  // WHERE A FINGER LANDS JUST BESIDE THE PRESS: one pixel under its lower edge. Measured on 10 October
  // 2026, Chromium moves the click of that tap onto the press, about five pixels up. The press and the
  // click are both written down, so the case says so if the browser stops moving the click and the case
  // would prove nothing.
  const at = await app.page.evaluate(() => {
    const bar = document.querySelector('[data-home-section="needs"] a.hm-needs-link')
    if (bar === null) return null
    bar.scrollIntoView({ block: 'center' })
    const box = bar.getBoundingClientRect()
    const w = window as unknown as { seen: number[][] }
    w.seen = []
    document.addEventListener('pointerdown', (e) => w.seen.push([e.clientX, e.clientY]), { capture: true, once: true })
    document.addEventListener('click', (e) => w.seen.push([e.clientX, e.clientY]), { capture: true, once: true })
    return { x: Math.round(box.left + Math.min(box.width / 2, 60)), y: box.bottom + 1 }
  })
  expect(at, 'Home drew no row of Needs you').not.toBeNull()
  await app.page.touchscreen.tap(at!.x, at!.y)
  await sleep(600)
  const seen = await app.page.evaluate(() => (window as unknown as { seen: number[][] }).seen)
  expect(seen.length, 'the tap raised no press and click').toBe(2)
  const moved = Math.max(Math.abs(seen[1]![0]! - seen[0]![0]!), Math.abs(seen[1]![1]! - seen[0]![1]!))
  expect(moved, 'the browser did not move this tap past the mouse allowance, so the case proves nothing').toBeGreaterThan(4)
  const says = await composerSays()
  expect(says, 'the tap beside the row was read as a drag and chose nothing').not.toBeNull()
  expect(says).not.toBe('')
}, 120_000)
