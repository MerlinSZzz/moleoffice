// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TERMINAL HOLDER'S RESTART IN SETTINGS, IN A REAL BROWSER. Wave 13u round 23; source files are
 * src/web/components/TerminalHolderPanel.tsx, which draws it, and src/server/lib/the-holders-restart.ts, which does
 * it.
 *
 * A real holder and a scratch server with the holder on run in a place of this file's own (tests/terminal-holder-stand.ts),
 * so the live office and its holder are never reached. The built page comes from liveApp, and a browser context of this
 * file's own sends the page's API requests to the scratch server (Playwright's route.continue with its address), as case 4
 * of tests/the-terminal-pages-in-the-browser.test.ts does. Every answer the page draws is that real server's answer.
 *
 * Every terminal is made up: two shells the person opened, one that ended with exit code 3, a sleep, and a shell an
 * agent called "Terminal worker" works in.
 *
 *   1. Settings, Tools, Terminal holder says the holder runs and offers the restart press, and lists nothing yet.
 *   2. The first press lists every terminal by whose it is, says which the restart ends and which have already ended,
 *      and asks again. Nothing is stopped, and the list has the keyboard.
 *   3. Keep it running puts the list away, and nothing is stopped.
 *   4. A terminal opened after the list was shown: the confirming press is refused in the page's words, the panel says
 *      where the holder is now, and nothing is stopped.
 *   5. The confirming press restarts it: the panel says how many running terminals were asked to end and shows the old
 *      holder's last line; the old holder is gone, and a new one runs.
 *   7. With no holder running, the panel says so with the start press, and offers no restart.
 *   Each scene is measured at 1440 and 390, in light, and never scrolls sideways. Each is photographed
 *   in English into the folder TERMINAL_HOLDER_SHOTS names, when it names one: the panel, and the page around it.
 *
 * MUTATIONS (each after a control run; the commit message that added this file has the runs):
 *   - TerminalHolderPanel.tsx: the first press restarts at once, with no confirming step: case 2 goes red.
 *   - TerminalHolderPanel.tsx: a refusal is not drawn: case 4 goes red.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { BrowserContext, Locator, Page } from 'playwright'
import { settingsPath } from '../src/shared/addresses.ts'
import { t } from '../src/shared/i18n.ts'
import { liveApp, theResizeIsDrawn, waitForThePage, type LiveApp } from './helpers.ts'
import {
  AS_THE_PERSON,
  aPlace,
  ask,
  groups,
  holder,
  isAlive,
  startAHolder,
  startAHolderNamingACopy,
  REPO,
  startAServer,
  stopEverything,
  stopTheGroup,
  until,
  type AHolderNamingACopy,
  type HeldTerminal,
  type Place,
  type ScratchServer,
  type StartedHolder,
} from './terminal-holder-stand.ts'

/** A folder to photograph the panel into, outside the checkout, only when one is named. */
const SHOTS = process.env['TERMINAL_HOLDER_SHOTS']
if (SHOTS !== undefined && SHOTS !== '') mkdirSync(SHOTS, { recursive: true })
const SHOOT = SHOTS !== undefined && SHOTS !== ''

let app: LiveApp | null = null
let place: Place
let server: ScratchServer
let anotherHolder: AHolderNamingACopy
let theFirstHolder: StartedHolder
let context: BrowserContext | null = null
let page: Page
/** The terminals made up for the list, each stopped by its group at the end. */
const made: HeldTerminal[] = []

function theApp(): LiveApp {
  if (app === null) throw new Error('No app.')
  return app
}

/** Open a terminal through the scratch server's door, as the person. */
async function openThroughTheDoor(command: string, args: string[]): Promise<HeldTerminal> {
  const opened = await ask(server.api, '/api/terminals', { method: 'POST', headers: AS_THE_PERSON, body: { folder: place.dir, command, args } })
  expect(opened.status, JSON.stringify(opened.body)).toBe(201)
  const terminal = opened.body['terminal'] as HeldTerminal
  groups.add(terminal.pid)
  return terminal
}

/** The holder the scratch server answers about now. */
async function theHolderNow(): Promise<{ state: string; pid?: number }> {
  const listed = await ask(server.api, '/api/terminals')
  expect(listed.status, JSON.stringify(listed.body)).toBe(200)
  return listed.body['holder'] as { state: string; pid?: number }
}

/** Open Settings at the Terminal holder panel, in English and Normal mode, and wait until it has read the holder. */
async function visit(): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${theApp().site}/?lang=en&mode=normal#${settingsPath('settings.terminalholder')}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await thePanel().locator('[data-testid="terminal-holder-now"]').waitFor({ state: 'visible', timeout: 30_000 })
}

function thePanel(): Locator {
  return page.locator('.set [data-settings-panel="settings.terminalholder"]')
}

/** How far the page scrolls sideways. */
function sideways(): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
}

/**
 * MEASURE A SCENE at 1440 and 390, in light: it never scrolls sideways, and when TERMINAL_HOLDER_SHOTS
 * names a folder it is photographed twice, the panel alone and the window with the panel's top just under the row.
 */
async function sweep(scene: string): Promise<void> {
  for (const theme of ['light'] as const) {
    await page.emulateMedia({ colorScheme: theme })
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await theResizeIsDrawn(page)
      expect(await sideways(), `${scene} ${String(width)} ${theme}`).toBeLessThanOrEqual(1)
      if (!SHOOT) continue
      // THE PANEL ALONE, without the categories' row, which sticks over a panel taller than the window. The page shot
      // below shows the row as a person sees it.
      await thePanel().screenshot({ path: join(SHOTS as string, `${scene}-${String(width)}-${theme}-panel.png`), style: '.sf-row { visibility: hidden; }' })
      // Twice, because the categories' row sticks only once the page has scrolled under it.
      for (let i = 0; i < 2; i += 1) {
        await thePanel().evaluate((element) => {
          const row = document.querySelector('.sf-row')?.getBoundingClientRect().bottom ?? 0
          window.scrollBy(0, element.getBoundingClientRect().top - row - 8)
        })
      }
      await page.screenshot({ path: join(SHOTS as string, `${scene}-${String(width)}-${theme}-page.png`) })
    }
  }
  await page.emulateMedia({ colorScheme: 'light' })
  await page.setViewportSize({ width: 1440, height: 900 })
}

beforeAll(async () => {
  place = aPlace('thb')
  // ITS OUTPUT GOES TO ITS LOG, as the service command sends it, so the panel can show its last line after it stops.
  theFirstHolder = await startAHolder(place, { toTheLog: true })
  // THE PAGE FIRST, SO THE SCRATCH SERVER CAN BE TOLD ITS PORT. The page is on the liveApp's web port and its calls
  // go to the scratch server, which refuses a page on a loopback port that is not its own unless it is told that
  // port is its dev page's.
  app = await liveApp({ name: 'terminal-holder-restart', viewport: { width: 1440, height: 900 } })
  server = await startAServer(place, undefined, { MOLE_OFFICE_TERMINAL_HOLDER: 'on', MOLE_OFFICE_WEB_PORT: String(app.webPort) })

  made.push(await openThroughTheDoor('/bin/bash', ['--noprofile', '--norc']))
  const ended = await openThroughTheDoor('/bin/bash', ['--noprofile', '--norc'])
  made.push(ended)
  const typed = await ask(server.api, `/api/terminals/${ended.id}/input`, { method: 'POST', headers: AS_THE_PERSON, body: { data: 'exit 3\r' } })
  expect(typed.status, JSON.stringify(typed.body)).toBe(200)
  made.push(await openThroughTheDoor('/bin/sleep', ['300']))

  // AN AGENT'S TERMINAL, opened straight through the holder's socket naming the agent, as the terminal pages' test does.
  const started = await ask(server.api, '/api/agents/started', { method: 'POST', headers: AS_THE_PERSON, body: { handle: 'thb-worker', name: 'Terminal worker' } })
  expect(started.status, JSON.stringify(started.body)).toBe(201)
  const worker = String((started.body['agent'] as { id?: unknown } | undefined)?.id ?? '')
  expect(worker).not.toBe('')
  const opened = await holder(place, {
    op: 'open',
    who: { kind: 'agent', id: worker },
    agent: { kind: 'agent', id: worker },
    project: 'default',
    command: '/bin/bash',
    args: ['--noprofile', '--norc'],
    folder: place.dir,
    env: { PATH: process.env['PATH'] ?? '/usr/bin:/bin', HOME: place.home, TERM: 'xterm-256color', HISTFILE: '/dev/null', LANG: 'C.UTF-8' },
    cols: 80,
    rows: 24,
    keeping: false,
  })
  const agents = opened['terminal'] as HeldTerminal
  groups.add(agents.pid)
  made.push(agents)

  // The ended shell reads as ended before the page is opened.
  await until(
    () => ask(server.api, '/api/terminals'),
    (read) => ((read.body['terminals'] ?? []) as HeldTerminal[]).some((one) => one.id === ended.id && one.state === 'ended'),
  )

  context = await app.browser.newContext({ viewport: { width: 1440, height: 900 } })
  const theScratchApi = new URL(server.api)
  const thePagesApiPort = String(app.apiPort)
  await context.route(
    (url) => url.hostname === '127.0.0.1' && url.port === thePagesApiPort,
    (route) => {
      const to = new URL(route.request().url())
      to.port = theScratchApi.port
      return route.continue({ url: to.toString() })
    },
  )
  page = await context.newPage()
}, 300_000)

afterAll(async () => {
  try {
    await context?.close()
    await app?.stop()
  } finally {
    // The holders, the scratch server and every terminal, each by its process group.
    await stopEverything()
  }
}, 120_000)

describe('the terminal holder in Settings', () => {
  it('1. says the holder runs and offers the restart press, listing nothing yet', async () => {
    await visit()
    const now = thePanel().locator('[data-testid="terminal-holder-now"]')
    expect(await now.innerText()).toContain(t('terminals.holder.running'))
    await thePanel().getByRole('button', { name: t('terminalHolder.restart') }).waitFor()
    expect(await thePanel().locator('[data-testid="terminal-holder-confirm"]').count()).toBe(0)
    await sweep('at-rest')
  }, 120_000)

  it('2. lists every terminal by whose it is and asks again, and stops nothing', async () => {
    await thePanel().getByRole('button', { name: t('terminalHolder.restart') }).click()
    const theAsk = thePanel().locator('[data-testid="terminal-holder-confirm"]')
    await theAsk.waitFor({ state: 'visible', timeout: 30_000 })
    expect(await theAsk.locator('.th-key').first().innerText()).toBe(t('terminalHolder.willEnd', { n: 4 }))
    const titles = await theAsk.locator('.th-row-title').allInnerTexts()
    expect(titles.sort()).toEqual(
      [t('terminals.title.agents', { name: 'Terminal worker' }), t('terminals.title.yours'), t('terminals.title.yours'), t('terminals.title.yours')].sort(),
    )
    const states = await theAsk.locator('.th-row-state').allInnerTexts()
    expect(states.filter((one) => one === t('terminalHolder.rowState.running')).length).toBe(3)
    expect(states.filter((one) => one === t('terminalHolder.rowState.ended')).length).toBe(1)
    expect(await theAsk.innerText()).toContain('/bin/sleep 300')
    await theAsk.getByRole('button', { name: t('terminalHolder.confirm', { n: 3 }) }).waitFor()
    // THE LIST HAS THE KEYBOARD, because it is what the confirming press is about.
    expect(await page.evaluate(() => document.activeElement?.className ?? '')).toContain('th-key')
    expect(isAlive(theFirstHolder.pid)).toBe(true)
    for (const one of made) if (one.state === 'running' && one !== made[1]) expect(isAlive(one.pid), one.id).toBe(true)
    await sweep('confirm')
  }, 120_000)

  it('3. Keep it running puts the list away, and stops nothing', async () => {
    await thePanel().getByRole('button', { name: t('terminalHolder.cancel') }).click()
    await thePanel().getByRole('button', { name: t('terminalHolder.restart') }).waitFor()
    expect(await thePanel().locator('[data-testid="terminal-holder-confirm"]').count()).toBe(0)
    expect(isAlive(theFirstHolder.pid)).toBe(true)
  }, 60_000)

  it('4. refuses a terminal opened after the list was shown, in the page\'s words, and says where the holder is', async () => {
    await thePanel().getByRole('button', { name: t('terminalHolder.restart') }).click()
    const theAsk = thePanel().locator('[data-testid="terminal-holder-confirm"]')
    await theAsk.waitFor({ state: 'visible', timeout: 30_000 })
    // A TERMINAL OPENED BEHIND THE PAGE'S BACK, after the list was drawn.
    made.push(await openThroughTheDoor('/bin/bash', ['--noprofile', '--norc']))
    await theAsk.getByRole('button', { name: t('terminalHolder.confirm', { n: 3 }) }).click()
    const refused = thePanel().locator('[data-testid="terminal-holder-refused"]')
    await refused.waitFor({ state: 'visible', timeout: 30_000 })
    expect(await refused.innerText()).toContain(t('server.terminalHolderRestartChanged'))
    const now = thePanel().locator('[data-testid="terminal-holder-now"]')
    expect(await now.innerText()).toContain(t('terminalHolder.now'))
    expect(await now.innerText()).toContain(t('terminals.holder.running'))
    expect(isAlive(theFirstHolder.pid)).toBe(true)
    expect((await theHolderNow()).pid).toBe(theFirstHolder.pid)
    await sweep('refused')
  }, 120_000)

  it('5. restarts it on the confirming press, says how many were asked to end, and shows the old holder\'s last line', async () => {
    await thePanel().getByRole('button', { name: t('terminalHolder.restart') }).click()
    const theAsk = thePanel().locator('[data-testid="terminal-holder-confirm"]')
    await theAsk.waitFor({ state: 'visible', timeout: 30_000 })
    expect(await theAsk.locator('.th-row').count()).toBe(5)
    await theAsk.getByRole('button', { name: t('terminalHolder.confirm', { n: 4 }) }).click()
    const done = thePanel().locator('[data-testid="terminal-holder-restarted"]')
    await done.waitFor({ state: 'visible', timeout: 60_000 })
    const now = await theHolderNow()
    if (typeof now.pid === 'number') groups.add(now.pid)
    expect(now.state).toBe('running')
    expect(now.pid).not.toBe(theFirstHolder.pid)
    expect(isAlive(theFirstHolder.pid), 'the old holder still runs').toBe(false)
    expect(await done.innerText()).toContain(t('terminalHolder.restartedEnded', { n: 4 }))
    expect(await done.innerText()).toContain(t('terminalHolder.oldLastWord'))
    expect(await done.innerText()).toContain('stopped;')
    // THE PROCESS NUMBERS ARE BEHIND THE DEVELOPERS' FOLD.
    expect(await done.innerText()).not.toContain(String(theFirstHolder.pid))
    await done.locator('.tm-dev > summary').click()
    expect(await done.locator('.tm-dev').innerText()).toContain(String(theFirstHolder.pid))
    expect(await done.locator('.tm-dev').innerText()).toContain(String(now.pid))
    await done.locator('.tm-dev > summary').click()
    await thePanel().getByRole('button', { name: t('terminalHolder.restart') }).waitFor()
    await sweep('restarted')
  }, 180_000)

  it('6. names another copy and offers a confirming list of its terminals', async () => {
    const current = await theHolderNow()
    await stopTheGroup(current.pid!)
    anotherHolder = await startAHolderNamingACopy(place)
    expect((await theHolderNow()).state).toBe('running')
    await openThroughTheDoor('/bin/sleep', ['300'])
    anotherHolder.names({ from: 'bundle', root: REPO, build: { version: 'beta.1', commit: 'a-made-up-commit', builtAt: '2026-11-04 10:00' } })
    const read = await ask(server.api, '/api/terminals')
    const copy = (read.body['holder'] as { anotherCopy: { copy: string } }).anotherCopy.copy
    await visit()
    const heldBy = thePanel().locator('[data-testid="terminal-holder-another-copy"]')
    expect(await heldBy.innerText()).toBe(t('terminalHolder.heldByCopy', { copy }))
    await thePanel().getByRole('button', { name: t('terminalHolder.restart') }).click()
    const confirmation = thePanel().locator('[data-testid="terminal-holder-confirm"]')
    await confirmation.waitFor({ state: 'visible', timeout: 30_000 })
    expect(await confirmation.innerText()).toContain('/bin/sleep 300')
    await confirmation.getByRole('button', { name: t('terminalHolder.cancel') }).click()
    await sweep('another-copy')
  }, 120_000)

  it('7. says no holder runs, with the start press, and offers no restart', async () => {
    await stopTheGroup(anotherHolder.holder.pid)
    await anotherHolder.close()
    await visit()
    const said = thePanel().locator('[data-testid="terminal-holder-now"]')
    expect(await said.innerText()).toContain(t('terminals.holder.notRunning'))
    await said.getByRole('button', { name: t('terminals.holder.start') }).waitFor()
    expect(await thePanel().getByRole('button', { name: t('terminalHolder.restart') }).count()).toBe(0)
    await sweep('not-running')
  }, 120_000)
})
