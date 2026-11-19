// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SHUTDOWN PRESS AND ITS ONE QUESTION, IN A BROWSER: criteria W5 and W6, piece H8 (wave 13n, round 58).
 *
 * The press is in the sidebar's foot (src/web/components/ShutDown.tsx). With no runs at work it shuts down at
 * once; with runs it lists them, warns and asks once more; a page that cannot prove the owner's key is told it may
 * not press, with the server's own words for the refusal. The window's tray asks through an event, and the page
 * says it took the ask by cancelling it.
 *
 * THE SHUTDOWN ITSELF IS INTERCEPTED here, so the test office keeps running; what it would do is
 * tests/a-shutdown-pauses-the-runs-at-work.test.ts. The runs in the lists are made up, and say so.
 */
import type { Page, Route } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { enWave13n } from '../src/shared/words/en-wave-13n.ts'
import type { ALiveRun, TheLiveRunsReading, TheShutDownAnswer } from '../src/shared/shutting-down.ts'
import { THE_TRAY_ASKS_TO_SHUT_DOWN } from '../src/config/the-window-mark.mjs'
import { WORLD_HEADER } from '../src/config/world-header.mjs'

let app: LiveApp
const word = (key: keyof typeof enWave13n): string => {
  const said = enWave13n[key]
  if (typeof said !== 'string') throw new Error(`${key} is not one sentence`)
  return said
}

beforeAll(async () => {
  app = await liveApp({ name: 'shutdown-question', workspace: 'default', viewport: { width: 1440, height: 900 } })
  // Chromium treats an intercepted answer as outside loopback until this permission is given.
  await app.context.grantPermissions(['local-network-access'], { origin: app.site })
}, 240_000)
afterAll(async () => { await app?.stop() })

/** A made-up run, labelled as one. */
function aMadeUpRun(n: number): ALiveRun {
  return {
    session: `made-up-run-${String(n)}`,
    workspaceId: 'default',
    agent: { id: `made-up-agent-${String(n)}`, handle: `made-up-agent-${String(n)}` },
    message: { id: `made-up-message-${String(n)}`, title: `A made-up message ${String(n)}` },
    since: `2026-10-11 09:0${String(n)}`,
    conversation: null,
    pausable: true,
    says: 'A made-up run, for this test.',
  }
}

const AN_ANSWER: TheShutDownAnswer = { shuttingDown: true, workerStopped: 'made up', paused: [], notPaused: [], notPausable: [], says: 'made up' }

/**
 * An answer from the API's own port, which is another origin than the page's. It carries the headers the server's
 * own answer to this page carries: its CORS headers, and the world header the page checks every answer against.
 */
let theServersHeaders: Record<string, string> | null = null
async function answer(route: Route, status: number, body: unknown): Promise<void> {
  if (theServersHeaders === null) {
    const real = await fetch(`${app.api}/api/health`, { headers: { origin: app.site } })
    theServersHeaders = Object.fromEntries([...real.headers].filter(([name]) => name.startsWith('access-control-') || name === WORLD_HEADER))
  }
  const headers = {
    ...theServersHeaders,
    'access-control-allow-headers': route.request().headers()['access-control-request-headers'] ?? '*',
    'access-control-allow-methods': 'GET, POST',
  }
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
  return route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) })
}

/** Intercept the shutdown POST, and answer the run list with `reading` when it is given. Returns the bodies POSTed. */
async function intercept(page: Page, reading: TheLiveRunsReading | null, reply: (n: number) => { status: number; body: unknown } = () => ({ status: 200, body: AN_ANSWER })): Promise<unknown[]> {
  const posted: unknown[] = []
  await page.unrouteAll()
  if (reading !== null) await page.route('**/api/office/live-runs', (route: Route) => answer(route, 200, reading))
  await page.route('**/api/office/shut-down', (route: Route) => {
    if (route.request().method() === 'OPTIONS') return answer(route, 204, null)
    posted.push(route.request().postDataJSON())
    const { status, body } = reply(posted.length)
    return answer(route, status, body)
  })
  return posted
}

async function openTheOffice(page: Page): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#/`)
  await waitForThePage(page, 30_000)
  await page.locator('.sbp-shut-down').waitFor()
}

it('shuts down at once with no runs at work, reading the runs from the server', async () => {
  const posted = await intercept(app.page, null)
  await openTheOffice(app.page)
  // In a browser the press always shuts Mole Office down; closing only the window is the window's setting.
  expect(await app.page.locator('.sbp-shut-down').getAttribute('data-shut-down')).toBe('whole')
  await app.page.locator('.sbp-shut-down').click()
  const question = app.page.locator('dialog.sd-question')
  await question.locator('[data-at="done"], .sd-said[role="status"]').first().waitFor()
  expect(await question.getAttribute('data-at')).toBe('done')
  expect(posted).toEqual([{ seen: [] }])
  expect(await question.innerText()).toContain(word('shutDown.shuttingDown'))
}, 120_000)

it('lists the runs at work, warns, and shuts down only on the second press with the runs it showed', async () => {
  const runs = [aMadeUpRun(1), aMadeUpRun(2)]
  const posted = await intercept(app.page, { pausable: runs, notPausable: [], mayPress: true, says: 'made up' })
  await openTheOffice(app.page)
  await app.page.locator('.sbp-shut-down').click()
  const question = app.page.locator('dialog.sd-question[data-at="asking"]')
  await question.waitFor()
  expect(await question.locator('.sd-run').count()).toBe(2)
  const first = question.locator('.sd-run').first()
  expect(await first.locator('.sd-run-agent').innerText()).toBe('made-up-agent-1')
  expect(await first.locator('.sd-run-message').innerText()).toBe('A made-up message 1')
  expect(await first.locator('.sd-run-since').innerText()).toContain('2026-10-11 09:01')
  expect(await question.locator('.sd-warn').innerText()).toBe(word('shutDown.warning'))
  expect(posted, 'nothing is pressed before the second question is answered').toEqual([])

  await question.getByRole('button', { name: word('shutDown.confirm') }).click()
  await app.page.locator('dialog.sd-question[data-at="done"]').waitFor()
  expect(posted).toEqual([{ seen: ['made-up-run-1', 'made-up-run-2'] }])
}, 120_000)

it('asks again about a run that started after the list was read, and presses nothing unseen', async () => {
  const posted = await intercept(app.page, { pausable: [aMadeUpRun(1)], notPausable: [], mayPress: true, says: 'made up' }, (n) =>
    n === 1 ? { status: 409, body: { error: 'made up', code: 'shutDownRunsChanged', values: { count: 1 } } } : { status: 200, body: AN_ANSWER })
  await openTheOffice(app.page)
  await app.page.locator('.sbp-shut-down').click()
  await app.page.locator('dialog.sd-question[data-at="asking"]').waitFor()
  await app.page.getByRole('button', { name: word('shutDown.confirm') }).click()
  // The refusal reads the list again and asks once more, with the refusal drawn; it does not press on its own.
  const again = app.page.locator('dialog.sd-question[data-at="asking"]')
  await again.locator('.sd-warn').waitFor()
  await app.page.waitForTimeout(300)
  expect(posted).toHaveLength(1)
  expect(await again.getAttribute('data-at')).toBe('asking')
}, 120_000)

it('tells a page without the owner\'s key that it may not press, in the server\'s words, and presses nothing', async () => {
  const posted = await intercept(app.page, { pausable: [aMadeUpRun(1)], notPausable: [], mayPress: false, says: 'made up' })
  await openTheOffice(app.page)
  await app.page.locator('.sbp-shut-down').click()
  const question = app.page.locator('dialog.sd-question[data-at="not the owner"]')
  await question.waitFor()
  const said = await question.innerText()
  expect(said).toContain(word('shutDown.notTheOwner'))
  expect(said).toContain(word('server.shutDownOnlyTheOwner'))
  expect(await question.locator('.sd-run').count()).toBe(0)
  expect(await question.getByRole('button', { name: word('shutDown.confirm') }).count()).toBe(0)
  expect(posted).toEqual([])
}, 120_000)

it('opens the same question when the window\'s tray asks, and says it took the ask', async () => {
  await intercept(app.page, { pausable: [aMadeUpRun(1)], notPausable: [], mayPress: true, says: 'made up' })
  await openTheOffice(app.page)
  const taken = await app.page.evaluate((name) => !window.dispatchEvent(new CustomEvent(name, { cancelable: true })), THE_TRAY_ASKS_TO_SHUT_DOWN)
  expect(taken, 'the page did not cancel the tray\'s ask, so the window would fall back to the stop command').toBe(true)
  await app.page.locator('dialog.sd-question[data-at="asking"]').waitFor()
}, 120_000)
