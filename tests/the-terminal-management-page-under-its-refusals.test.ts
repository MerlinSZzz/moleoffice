// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TERMINAL MANAGEMENT PAGE LEAVES ROOM UNDER ITS REFUSALS.
 *
 * The page at #/terminals draws three parts: the terminal list, the agent tools and start at login.
 * Read as an agent that is not the person, all three draw a refusal with a Retry press. This test
 * proves two things about that page at its end.
 *
 * Case one: at the end of the page, no control inside the page's main element meets the corner chat
 * button. While the page scrolls its rows may pass under the button, but at the end the page leaves
 * the room the button needs. Since design D the controls under the corner button are measured only at
 * 1440, with a window 1000 tall, in the light look. At 390 the case checks that no corner button is
 * drawn, with windows 844 and 1000 tall. A page that cannot scroll at 390 is named rather than counted
 * as a pass.
 *
 * Case two: the room between the bottom of the terminal list's refusal and the top of the Agent tools
 * heading is at least the page's own --pad, less half a pixel. When the list is read its last row
 * ends with that room, so a refusal must end with the same room rather than sitting against the next
 * heading. That is measured at 1440 and 390 wide, in the light look.
 *
 * The dark look and the widths 990 and 660 are not measured: where a box sits does not depend on the
 * colours, and 1440 and 390 are the wide page and the phone.
 *
 * WHAT IS REAL. A throwaway office and its own database come from tests/helpers.ts. A made-up agent
 * is registered in that office as a worker, and the browser acts as that agent and holds no person's
 * key, so every refusal is the real door answering. Nothing is stubbed and no request is rewritten.
 *
 * MUTATION PROOFS. Set theSplitIsWide true in Chat.tsx: the corner circle is then drawn below the width at which the page turns wide (THE_SHELL_WIDTH),
 * and case one goes red at 390. Setting --fab-room to 0px in src/web/tokens.css no longer turns case
 * one red: no circle is drawn below the width at which the page turns wide (THE_SHELL_WIDTH), and at 1440 the page does not scroll and no control reaches
 * the corner. Take the rule that gives the terminal list's refusal its room out of TERMINALS_PAGE_CSS:
 * case two then measures no room at every size and goes red.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { DEVICE_HALF_COOKIE, KEY_COOKIE } from '../src/config/key-header.mjs'
import type { Page } from 'playwright'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_SHELL_WIDTH } from '../src/web/lib/the-shell-width.ts'
import { apiApp, freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import type { BuiltServer } from '../src/server/index.ts'

/** An invented agent of a throwaway office. It is registered as a worker and is not the person. */
const AGENT = { handle: 'a-worker-of-a-throwaway-office', name: 'A worker of a throwaway office' }

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const LIGHT_AND_DARK = ['light', 'dark'] as const
type Look = (typeof LIGHT_AND_DARK)[number]

let database: TestDb
let inProcess: BuiltServer
let live: LiveApp

beforeAll(async () => {
  database = await freshDb()
  inProcess = await apiApp()
  await inProcess.app.ready()
  const reply = await inProcess.app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle: AGENT.handle, name: AGENT.name, role: 'worker' },
  })
  expect(reply.statusCode, `POST /api/agents/started: ${reply.body}`).toBeLessThan(300)
  live = await liveApp({ name: 'terminal-page-under-refusals', viewport: { width: 1440, height: 1000 }, workspace: 'default', database: database.file })
  // THE PAGE ACTS AS THE AGENT. A message addressed to its HANDLE is not counted, so read the
  // registry id first and address the waiting messages to that.
  const agentRow = await fetch(`${live.api}/api/participants/agent/${AGENT.handle}`, { headers: AS_THE_PERSON })
  expect(agentRow.status, await agentRow.clone().text()).toBe(200)
  const agentId = String(((await agentRow.json()) as { participant: { id: string } }).participant.id)
  // DESIGN D DRAWS THE CORNER CIRCLE AT 1440 ONLY WHILE A MESSAGE WAITS, so one waits for this file.
  // IT IS FROM THE PERSON TO THE AGENT, the ordinary way an agent's circle is drawn.
  const waitingFromThePerson = await fetch(`${live.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({ kind: 'message', title: 'A made-up line from the person', data: { body: 'A made-up line from the person to the agent.', to: [{ kind: 'agent', id: agentId }] } }),
  })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(waitingFromThePerson.status, await waitingFromThePerson.clone().text()).toBe(409)
  await live.page.addInitScript((who) => localStorage.setItem('mole-office.actor', JSON.stringify(who)), { type: 'agent', id: AGENT.handle })
  const held = await live.context.cookies()
  expect(held.some((one) => one.name === KEY_COOKIE || one.name === DEVICE_HALF_COOKIE), 'the browser was given the person key or a half of a device key').toBe(false)
}, 240_000)

afterAll(async () => {
  await live?.stop()
  await inProcess?.app.close()
  database?.close()
}, 120_000)

/** The page is opened as the made-up agent, and all three of its parts have drawn their refusal with its press. */
async function openThePage(page: Page, look: Look): Promise<void> {
  await page.addInitScript((theme) => localStorage.setItem('mole-office.preset.theme', theme), look)
  await page.goto(`${live.site}/?lang=en#/terminals`, { timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  expect(await page.locator('html').getAttribute('data-theme'), `the page drew the ${look} look`).toBe(look)
  for (const part of ['main .tm > .px-error', 'main section.ih .px-error', 'main section.sal .px-error']) {
    const refusal = page.locator(part).first()
    await refusal.waitFor({ timeout: 30_000 })
    await refusal.locator('.px-error-act button').first().waitFor({ state: 'visible', timeout: 30_000 })
  }
  expect(await page.locator('main .px-error').count(), 'the page drew three refusals').toBe(3)
}

/** The page is scrolled to its end, and every control of the page whose box meets the button's box is named. */
async function underTheButtonAtTheEnd(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    await new Promise<void>((done) => {
      scrollTo(0, document.documentElement.scrollHeight)
      requestAnimationFrame(() => requestAnimationFrame(() => done()))
    })
    const button = document.querySelector('.px-chat-circle')
    if (button === null) return ['the corner button is not drawn']
    const circle = button.getBoundingClientRect()
    const under: string[] = []
    const controls = 'main button, main a[href], main [role=button], main summary, main select, main input, main textarea, main .sf-chev'
    for (const control of document.querySelectorAll<HTMLElement>(controls)) {
      if (!control.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
      for (const box of control.getClientRects()) {
        if (box.width === 0 || box.height === 0) continue
        if (box.left < circle.right && box.right > circle.left && box.top < circle.bottom && box.bottom > circle.top) {
          under.push(`${control.tagName.toLowerCase()}.${String(control.className).split(' ')[0]} "${(control.textContent ?? '').trim().slice(0, 40)}"`)
          break
        }
      }
    }
    return under
  })
}

interface AtTheEnd {
  width: number
  height: number
  look: Look
  canScroll: boolean
  under: string[]
}

it('leaves no control under the corner button at the end of the page, at 1440 and 390 wide in the light look', async () => {
  const measured: AtTheEnd[] = []
  {
    const look: Look = 'light'
    for (const size of [
      { width: 390, height: 844 },
      { width: 390, height: 1000 },
      { width: 1440, height: 1000 },
    ]) {
      await live.page.setViewportSize(size)
      await openThePage(live.page, look)
      const canScroll = await live.page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)
      // DESIGN D DRAWS THE CORNER CIRCLE AT THE WIDTH AT WHICH THE PAGE TURNS WIDE (THE_SHELL_WIDTH) AND WIDER. Below it there is no floating chat
      // button, so the rule that a control is clear of one cannot be broken there.
      let under: string[] = []
      if (size.width >= THE_SHELL_WIDTH) {
        // THE CIRCLE IS READ WHEN THE PAGE HAS ANSWERED THE CIRCLE DOOR; wait for it before measuring.
        await live.page.locator('.px-chat-circle').waitFor({ timeout: 30_000 })
        under = await underTheButtonAtTheEnd(live.page)
      } else {
        expect(await live.page.locator('.px-chat-circle').count(), `${String(size.width)}: the corner circle was drawn below ${String(THE_SHELL_WIDTH)}`).toBe(0)
      }
      measured.push({ ...size, look, canScroll, under })
    }
  }
  const shown = JSON.stringify(measured, null, 2)
  console.log(`case one, the end of the page:\n${shown}`)
  expect(
    measured.filter((one) => one.width === 390 && !one.canScroll).map((one) => `${String(one.width)} by ${String(one.height)} ${one.look}`),
    `the page could not scroll at 390, so the button was never reached:\n${shown}`,
  ).toEqual([])
  expect(
    measured.filter((one) => one.under.length > 0),
    `controls under the corner button at the end of the page:\n${shown}`,
  ).toEqual([])
}, 420_000)

interface TheRoom {
  width: number
  look: Look
  found: boolean
  gap: number | null
  pad: number | null
}

it('leaves the page own room under the terminal list refusal, at 1440 and 390 wide in the light look', async () => {
  const measured: TheRoom[] = []
  {
    const look: Look = 'light'
    for (const width of [1440, 390]) {
      await live.page.setViewportSize({ width, height: 1000 })
      await openThePage(live.page, look)
      const room = await live.page.evaluate((): { found: boolean; gap: number | null; pad: number | null } => {
        const pageRoot = document.querySelector('main .tm')
        const refusal = document.querySelector('main .tm > .px-error')
        const heading = document.querySelector('main .tm .ih-heading')
        if (pageRoot === null || refusal === null || heading === null) return { found: false, gap: null, pad: null }
        const pad = Number.parseFloat(getComputedStyle(pageRoot).getPropertyValue('--pad'))
        const gap = heading.getBoundingClientRect().top - refusal.getBoundingClientRect().bottom
        return { found: true, gap, pad }
      })
      measured.push({ width, look, ...room })
    }
  }
  const shown = JSON.stringify(measured, null, 2)
  console.log(`case two, the room under the terminal list refusal:\n${shown}`)
  expect(measured.filter((one) => !one.found), `a part of the page was not drawn:\n${shown}`).toEqual([])
  expect(
    measured.filter((one) => one.found && one.gap !== null && one.pad !== null && one.gap < one.pad - 0.5),
    `the gap under the terminal list refusal is smaller than the page's own room:\n${shown}`,
  ).toEqual([])
}, 360_000)
