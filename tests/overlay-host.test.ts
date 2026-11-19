// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COMPOSER OPENED INSIDE A TABLE IS ON TOP OF THE PAGE, MEASURED IN A BROWSER.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THE OWNER REPORTED, AND WHY NO AMOUNT OF Z-INDEX FIXED IT
 * ---------------------------------------------------------------------------------------
 *
 * Context menus and composers must not be clipped underneath tables or other
 * stacking contexts.
 *
 * The composer was already `position: fixed` and already carried a high z-index. Neither helps. The
 * plan table's Task column is a FROZEN column — every cell in it is `position: sticky` with a
 * z-index, and an element with a z-index is a stacking context. Everything inside a stacking
 * context is ranked against the rest of the page AS ONE THING, by the context's own number, and no
 * number written inside it can lift it out. So the composer opened in row 3's Task cell was ranked
 * at that cell's level and painted UNDER the Task cells of every row below it.
 *
 * The fix is not a bigger number, because there is no big enough number. The composer is drawn
 * somewhere else: one overlay host, mounted by the shell, outside every page. See `OverlayHost` in
 * src/web/components/ui.tsx.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED HERE, AND WHY IT IS THIS AND NOT "IS IT VISIBLE"
 * ---------------------------------------------------------------------------------------
 *
 * Playwright's own idea of visible is about display, visibility, opacity and size. It answers yes
 * for an element that another element is painted on top of, because that element IS displayed — it
 * is simply underneath something. The defect is exactly that case, so asking the question that way
 * would have passed before the fix.
 *
 * What is asked instead is the question a person asks: **at this point on the screen, what would my
 * finger hit?** `document.elementFromPoint` answers with whatever is painted on top there. A grid
 * of points across the composer, every one of them coming back as the composer, is the composer
 * being on top — and it is the same test whatever the reason something else might be over it.
 *
 * The grid deliberately reaches the BOTTOM of the box, because that is the end that overlaps the
 * rows below and the end that was buried.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { commandThatStopsWithItsOwner, apiServerArguments, anApiServerOfItsOwn, waitForItsOwnVite, waitForThePage } from './helpers.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ============================================================================ the servers

function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer()
    probe.on('error', () => resolve(false))
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)))
  })
}

interface Service {
  label: string
  child: ChildProcess
  log: string[]
}

const started: Service[] = []

/** Start a child as its own process GROUP, so everything it starts in turn dies with one signal. */
function start(label: string, command: string, args: string[], env: NodeJS.ProcessEnv): Service {
  const child = spawn(command, args, { cwd: root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const service: Service = { label, child, log: [] }
  const keep = (chunk: unknown) => {
    for (const line of String(chunk).split('\n')) if (line.trim() !== '') service.log.push(line)
    if (service.log.length > 100) service.log.splice(0, service.log.length - 100)
  }
  child.stdout?.on('data', keep)
  child.stderr?.on('data', keep)
  child.on('error', (err) => service.log.push(`could not start ${command}: ${err.message}`))
  started.push(service)
  return service
}

async function stopGroup(service: Service): Promise<void> {
  const { child } = service
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ESRCH') return
    throw err
  }
  const exited = await Promise.race([once(child, 'exit').then(() => true), sleep(5_000).then(() => false)])
  if (exited) return
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    // Already gone between the two signals, which is the outcome that was wanted.
  }
  await Promise.race([once(child, 'exit'), sleep(5_000)])
}

let dir: string
let apiPort: number
let webPort: number
let browser: Browser
let page: Page
let planId: string

/**
 * A LONG PLAN, ON PURPOSE.
 *
 * The composer is about four hundred pixels tall and a row of this table is about twenty-four, so
 * the box opened near the top of the table hangs over roughly sixteen rows below it. Those rows are
 * what used to be painted on top of it. A short plan would have nothing underneath the box and the
 * measurement would pass whether the fix were there or not.
 */
const BODY = ['# Tray clamp rebuild', ...Array.from({ length: 40 }, (_, i) => `- step ${String(i + 1)} of the rebuild`)]
  .join('\n')

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'mole-office-overlay-'))
  // Taken only from itself, and started again on other ports when its port was taken.
  // `anApiServerOfItsOwn` in tests/helpers.ts says why.
  const stack = await anApiServerOfItsOwn('the API server of tests/overlay-host.test.ts', dir, (env) =>
    start('the API server', join(root, 'node_modules', '.bin', 'tsx'), apiServerArguments(), env),
  )
  apiPort = stack.apiPort
  webPort = stack.webPort
  const { env } = stack
  const watched = commandThatStopsWithItsOwner(join(root, 'node_modules', '.bin', 'vite'), ['--strictPort', '--host', '127.0.0.1'])
  const web = start('Vite', watched.command, watched.args, env)
  await waitForItsOwnVite(web, webPort, apiPort)

  const made = await fetch(`http://127.0.0.1:${apiPort}/api/plans`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'The composer must be on top', body: BODY }),
  })
  if (!made.ok) throw new Error(`starting a plan answered ${made.status}: ${await made.text()}`)
  planId = ((await made.json()) as { plan: { id: string } }).plan.id

  browser = await chromium.launch()
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
}, 240_000)

afterAll(async () => {
  await browser?.close()
  for (const service of started) await stopGroup(service)
  // The servers are stopped, so the folder goes now. After the port checks, a failed check would leave it behind.
  if (dir !== undefined) rmSync(dir, { recursive: true, force: true })
  // PROVE the ports came back rather than assuming a signal worked.
  for (const port of [apiPort, webPort]) {
    if (port !== undefined) {
      expect(await portIsFree(port), `port ${port} is still held after the test`).toBe(true)
    }
  }
}, 60_000)

/** Open the plan, in the layout that is all table, from a clean start. */
async function openTheTable(): Promise<void> {
  await page.goto(`http://127.0.0.1:${webPort}/#/plans/${planId}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  // The layout and the column widths are remembered per person in the browser's own store, so a
  // previous measurement would otherwise decide what this one opens with.
  await page.evaluate(() => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('mole-office.plan.')) window.localStorage.removeItem(key)
    }
  })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.getByRole('button', { name: 'Table', exact: true }).click()
  await page.waitForSelector('.pt-table tbody tr', { timeout: 30_000 })
  await sleep(600)
}

/**
 * Open the plan table and open the composer from its fourth row.
 *
 * EVERY CASE OPENS ITS OWN, rather than using the one an earlier case left open. A case that failed
 * because the page did not start used to take the next case down with it, in milliseconds, although
 * the next case tests something else. Now a failure shows only in the case where it happened.
 *
 * A row near the TOP, so the box hangs over the rows below it — which is the arrangement the defect
 * needed. Row four rather than row one, so there is a frozen cell above it as well.
 *
 * A RIGHT-CLICK ON THE ROW, because the row IS the line: it carries the attribute that says so and
 * one listener at the document reads it. Round seven put a press in the cell and this test clicked
 * it; there is no press in the cell now, and the frozen Task cell the box is opened from is exactly
 * the stacking context that used to bury it.
 */
async function openTheComposerInTheTable(): Promise<void> {
  await openTheTable()
  const row = page.locator('.pt-table tbody tr').nth(3)
  expect(
    await row.getAttribute('data-target'),
    'the plan table draws a row that does not say which line it is',
  ).toContain('planLine/')
  // THE FIRST CELL, which is the frozen pick column. The Task cell beside it holds the box the
  // line's words are typed into, and a right-click inside a box a person types in is left to the
  // browser on purpose: paste, undo and spelling live there and Mole Office has none of them.
  await row.locator('td').first().click({ button: 'right' })
  await page.waitForSelector('.px-talk', { timeout: 15_000 })
  await sleep(200)
}

/**
 * Open the component sheet with nothing else open on it, and wait for its first state chip.
 *
 * START WITH NOTHING ELSE OPEN. A composer is fixed to the window, so a hash navigation does not
 * close one left open by the block above. Whether it reaches down as far as the chip depends on how
 * tall it happens to be — a press added to it on 26 August 2026 made it one row taller and it began
 * swallowing the click on the chip. That is incidental to what the menu cases are about, which is
 * where the MENU is drawn, so the sheet is opened as a new page rather than the composer being kept
 * a particular height for a test that is not about it. Leaving for an empty page first makes the
 * next address a new page and not a hash change, so it is one load instead of a load and a reload.
 *
 * Each menu case calls this itself, for the reason `openTheComposerInTheTable` gives.
 */
async function openTheComponentSheet(): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`http://127.0.0.1:${webPort}/#/ui`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.px-chip-btn', { timeout: 30_000 })
}

/**
 * What a finger would hit at points across the composer.
 *
 * It samples the four corners, inset far enough to be past the border radius, and the middle of
 * each edge and of the box — with the BOTTOM row of points weighted, because the bottom is the end
 * that hangs over the rows below and the end that was buried.
 */
function whatIsOnTop(
  selector = '.px-talk',
): Promise<{ points: number; covered: string[]; box: { x: number; y: number; w: number; h: number } }> {
  return page.evaluate((which) => {
    const talk = document.querySelector(which)
    if (talk === null) throw new Error(`${which} is not on the page`)
    const r = talk.getBoundingClientRect()
    const inset = 12
    const xs = [r.left + inset, r.left + r.width / 2, r.right - inset]
    const ys = [r.top + inset, r.top + r.height / 2, r.bottom - inset, r.bottom - r.height / 6]
    const covered: string[] = []
    let points = 0
    for (const x of xs) {
      for (const y of ys) {
        points += 1
        const hit = document.elementFromPoint(x, y)
        if (hit === null) {
          covered.push(`(${String(Math.round(x))},${String(Math.round(y))}) nothing at all`)
          continue
        }
        if (talk.contains(hit)) continue
        const what = `${hit.tagName.toLowerCase()}.${hit.className.toString().split(' ').join('.')}`
        covered.push(`(${String(Math.round(x))},${String(Math.round(y))}) ${what}`)
      }
    }
    return {
      points,
      covered,
      box: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
    }
  }, selector)
}

// ============================================================================ what a person sees

describe('the composer opened inside the plan table is on top of the page', () => {
  it('is drawn in the overlay host and nothing is painted over it', async () => {
    await openTheComposerInTheTable()

    // WHERE IT IS DRAWN. This is the fix itself, and it is checked so that a failure below says
    // which half is wrong: gone from the host, or in the host and still covered.
    expect(
      await page.evaluate(() => document.querySelector('.px-overlays')?.querySelector('.px-talk') !== null),
      'the composer is not inside the overlay host',
    ).toBe(true)

    const seen = await whatIsOnTop()

    // THE MEASUREMENT HAS TO HAVE SOMETHING TO MEASURE. A box of no size would report nothing
    // covered and prove nothing at all.
    expect(seen.box.w, `the composer measured ${JSON.stringify(seen.box)}`).toBeGreaterThan(200)
    expect(seen.box.h, `the composer measured ${JSON.stringify(seen.box)}`).toBeGreaterThan(150)
    expect(seen.points).toBeGreaterThan(8)

    expect(seen.covered, `the composer is at ${JSON.stringify(seen.box)} and something is painted over it`)
      .toEqual([])

    // IT IS WHOLLY ON THE SCREEN. Being on top is no use to somebody who cannot see the bottom of
    // it, and this box carries the Send press at its foot.
    const window = await page.evaluate(() => ({ w: globalThis.innerWidth, h: globalThis.innerHeight }))
    expect(seen.box.x, 'the composer starts off the left of the window').toBeGreaterThanOrEqual(0)
    expect(seen.box.y, 'the composer starts above the top of the window').toBeGreaterThanOrEqual(0)
    expect(seen.box.x + seen.box.w, 'the composer runs off the right of the window').toBeLessThanOrEqual(window.w)
    expect(seen.box.y + seen.box.h, 'the composer runs off the bottom of the window').toBeLessThanOrEqual(window.h)

    // AND THE PAGE STILL DOES NOT SCROLL SIDEWAYS. A popup placed against the window is the classic
    // way to break that, and this product breaks it nowhere.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
      'the page scrolled sideways once the composer was open',
    ).toBe(false)
  }, 120_000)

  /**
   * THE PICKER RIDES IN THE SAME BOX.
   *
   * The owner's list names the recipient picker beside the composer and the menus. It is drawn
   * inside the composer rather than as a popup of its own, so it is in the overlay host by being in
   * the box — and that is checked here rather than assumed, because "it is inside the box" is the
   * only reason it does not need a host of its own.
   */
  it('opens the contact chooser inside the same box', async () => {
    await openTheComposerInTheTable()
    await page.getByRole('button', { name: 'Choose a contact' }).click()
    await page.waitForSelector('.px-talk-chooser', { timeout: 15_000 })
    expect(
      await page.evaluate(() => document.querySelector('.px-talk')?.querySelector('.px-talk-chooser') !== null),
      'the contact chooser is drawn outside the composer, so it needs a host of its own',
    ).toBe(true)

    /**
     * THE BOX IS PUT BACK INSIDE THE WINDOW AFTER THE LIST HAS GROWN IT, and this waits for that.
     *
     * The chooser draws nothing until its list has arrived, and that is the chooser's own change,
     * so the box is not placed again at that moment. It is placed again at the box's next drawing.
     * Measured on 25 September 2026 under load: in 1 run of 28 the points were read in between,
     * with the bottom of the box below the window, and they read as "nothing at all". A box that is
     * never put back fails here, with a sentence that says so.
     */
    try {
      await page.waitForFunction(
        () => {
          const box = document.querySelector('.px-talk')?.getBoundingClientRect()
          return box !== undefined && box.bottom <= globalThis.innerHeight
        },
        undefined,
        { timeout: 10_000 },
      )
    } catch {
      const box = await page.evaluate(() => document.querySelector('.px-talk')?.getBoundingClientRect().bottom ?? null)
      throw new Error(
        `The composer grew past the bottom of the window when the contact list arrived, and was not put ` +
          `back inside within 10 s: its bottom is at ${String(box)}px in a window 900px tall.`,
      )
    }
    const seen = await whatIsOnTop()
    expect(seen.covered, 'something is painted over the composer once the picker has grown it').toEqual([])
  }, 120_000)
})

/**
 * THE STATE MENU IS THE OTHER THING THAT MOVED, AND MORE OF IT CHANGED.
 *
 * The composer was already fixed to the window and only had to be drawn somewhere else. The menu
 * was `position: absolute` under its own control — it hung there by being a child of it — and a
 * menu drawn in the overlay host has no such parent. So three things are new and all three are the
 * kind of thing that breaks quietly:
 *
 *   it is placed by measuring the control rather than by being inside it;
 *   pressing the control while the menu is open must still CLOSE it, not close and reopen it in one
 *     gesture, and the rule that decides that now has to count two elements as inside instead of
 *     one, because the menu is no longer inside the control;
 *   Escape must still close it and give focus back.
 *
 * The component sheet is used because it draws the product's real chip with a real handler and
 * needs no corpus. It is the same component every list row draws.
 */
describe('the state menu opens under its chip, on top, and still closes the two ways it did', () => {
  it('hangs under the chip, in the overlay host, with nothing painted over it', async () => {
    await openTheComponentSheet()

    const chip = page.locator('.px-chip-btn').first()
    await chip.click()
    await page.waitForSelector('.px-menu', { timeout: 15_000 })

    expect(
      await page.evaluate(() => document.querySelector('.px-overlays')?.querySelector('.px-menu') !== null),
      'the menu is not inside the overlay host',
    ).toBe(true)

    // WHERE IT SITS. Under its chip and lined up with its left edge, which is what it did when it
    // was a child of the chip and had to be worked out once it was not.
    const placed = await page.evaluate(() => {
      const menu = document.querySelector('.px-menu')?.getBoundingClientRect()
      const button = document.querySelector('.px-chip-btn')?.getBoundingClientRect()
      if (menu === undefined || button === undefined) throw new Error('the chip or its menu is missing')
      return { below: Math.round(menu.top - button.bottom), lined: Math.round(menu.left - button.left) }
    })
    expect(placed.below, `the menu sits ${String(placed.below)}px below its chip`).toBeGreaterThanOrEqual(0)
    expect(placed.below, `the menu sits ${String(placed.below)}px below its chip`).toBeLessThan(24)
    expect(Math.abs(placed.lined), `the menu is ${String(placed.lined)}px off its chip's left edge`).toBeLessThan(4)

    const seen = await whatIsOnTop('.px-menu')
    expect(seen.covered, `the menu is at ${JSON.stringify(seen.box)} and something is painted over it`).toEqual([])
  }, 120_000)

  it('closes when the chip that opened it is pressed again', async () => {
    await openTheComponentSheet()
    const chip = page.locator('.px-chip-btn').first()
    await chip.click()
    await page.waitForSelector('.px-menu', { timeout: 15_000 })
    expect(await page.locator('.px-menu').count(), 'the menu was not open to begin with').toBe(1)
    await chip.click()
    await sleep(200)
    expect(
      await page.locator('.px-menu').count(),
      'pressing the chip closed the menu and opened it again in the same gesture',
    ).toBe(0)
  }, 120_000)

  it('sets the state when a line is chosen, and Escape gives focus back to the chip', async () => {
    await openTheComponentSheet()
    const chip = page.locator('.px-chip-btn').first()
    await chip.click()
    await page.waitForSelector('.px-menu', { timeout: 15_000 })
    await page.locator('.px-menu-item').filter({ hasText: 'blocked' }).first().click()
    await sleep(200)
    expect(await page.locator('.px-menu').count(), 'choosing a line left the menu open').toBe(0)
    // The chip's word is drawn through the stylesheet, which decides the capital letter, so the
    // comparison is on the word and not on how it is set.
    expect((await chip.innerText()).toLowerCase(), 'choosing a line did not set the state').toContain('blocked')

    await chip.click()
    await page.waitForSelector('.px-menu', { timeout: 15_000 })
    await page.keyboard.press('Escape')
    await sleep(200)
    expect(await page.locator('.px-menu').count(), 'Escape did not close the menu').toBe(0)
    expect(
      await page.evaluate(() => document.activeElement?.className ?? ''),
      'Escape closed the menu and left focus nowhere',
    ).toContain('px-chip-btn')
  }, 120_000)
})
