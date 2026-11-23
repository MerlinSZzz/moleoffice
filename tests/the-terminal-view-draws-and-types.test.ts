// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TERMINAL VIEW DRAWS A TERMINAL, AND WHAT A PERSON TYPES IN THE PAGE REACHES IT. Wave 13u, round 2.
 *
 * src/web/components/TerminalView.tsx draws one terminal with @xterm/xterm below the list on the terminal
 * management page (#/terminals). This test starts a real terminal holder and a scratch office on a
 * database of its own, opens a shell through the door as the person, opens it in a real browser, and
 * checks what the person sees and what reaches the shell:
 *
 *   1. Output the shell prints, Chinese included, is drawn in the xterm's rows.
 *   2. Keys typed in the page reach the shell: the shell works out a sum, so the line it prints is its
 *      own output and not the echo of the typing.
 *   3. Chinese typed into the page, as an input method hands it over, reaches the shell.
 *  3b. Chinese composed with an input method (compositionstart, compositionupdate, compositionend, through Chromium's own
 *      input method commands) reaches the shell and comes back on the screen, on the English page and the Chinese page,
 *      and none of the pinyin typed on the way reaches it (wave 13u round 5: design block b-5, "Not verified").
 *   4. Ctrl+Shift+V pastes what the clipboard holds.
 *   5. Fit asks the terminal for a new size, the size shown changes, and stty in the shell reports it.
 *   6. At 390 pixels wide the page does not scroll sideways; the terminal's own box does.
 *   7. In dark, the xterm's background is the page's --panel-2, and it changes from the light one.
 *      Then the page is measured at 1440 and 390 in the light theme, and photographed into
 *      TERMINAL_VIEW_SHOTS when that names a folder.
 *  7c. A view displaced offscreen by preceding content returns on end and draws the final line without new output or a user scroll.
 *   8. Close, pressed twice, closes the terminal: the view goes and the holder no longer lists it.
 *
 * WHERE THE HOLDER IS. liveApp's server does not start a holder (MOLE_OFFICE_TERMINAL_HOLDER is off), but
 * it still reaches one that answers on its database's socket. The socket is found through
 * XDG_CONFIG_HOME, so this test starts a holder in a place of its own (tests/terminal-holder-stand.ts)
 * and gives the server the same XDG_CONFIG_HOME and HOME while liveApp starts it. LANG is C.UTF-8 so
 * the shell reads Chinese as characters. The process's own variables are put back straight after.
 *
 * MUTATION (after a control run; the commit message that added this file has the three runs): the
 * line in TerminalView that hands xterm's onData to the typist is removed, so nothing typed reaches the
 * shell: case 2 goes red. Round 5 (its commit has the runs): TerminalView hands the typist only what is plain ASCII, so
 * composed Chinese never reaches the shell: cases 3 and 3b go red.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { putTheMadeUpLabelIn, takeTheMadeUpLabelOut } from './the-made-up-label-above-the-page.ts'
import { theResizeIsDrawn, liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { AS_THE_PERSON, aPlace, ask, groups, startAHolder, stopEverything, until, type HeldTerminal, type Place } from './terminal-holder-stand.ts'

let app: LiveApp | null = null
let place: Place
let terminal: HeldTerminal
/** A folder to photograph the view into, outside the checkout, only when one is named. */
const SHOTS = process.env['TERMINAL_VIEW_SHOTS']
if (SHOTS !== undefined) mkdirSync(SHOTS, { recursive: true })

/** Start liveApp with the place's XDG_CONFIG_HOME, HOME and a UTF-8 LANG, and put the variables back after. */
async function liveAppBesideTheHolder(): Promise<LiveApp> {
  const names = ['XDG_CONFIG_HOME', 'HOME', 'LANG'] as const
  const was = Object.fromEntries(names.map((name) => [name, process.env[name]]))
  process.env['XDG_CONFIG_HOME'] = place.config
  process.env['HOME'] = place.home
  process.env['LANG'] = 'C.UTF-8'
  try {
    return await liveApp({ name: 'terminal-view', viewport: { width: 1000, height: 800 }, database: place.database })
  } finally {
    for (const name of names) {
      if (was[name] === undefined) delete process.env[name]
      else process.env[name] = was[name]
    }
  }
}

beforeAll(async () => {
  place = aPlace('tv')
  await startAHolder(place)
  app = await liveAppBesideTheHolder()
  const opened = await ask(app.api, '/api/terminals', {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: { folder: place.dir, command: '/bin/bash', args: ['--noprofile', '--norc'] },
  })
  expect(opened.status, JSON.stringify(opened.body)).toBe(201)
  terminal = opened.body['terminal'] as HeldTerminal
  groups.add(terminal.pid)
  await app.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: app.site })
}, 240_000)

afterAll(async () => {
  try {
    await app?.stop()
  } finally {
    await stopEverything()
  }
}, 90_000)

/** The text of the xterm's drawn rows, one line each. */
async function theRows(): Promise<string> {
  if (app === null) throw new Error('No page.')
  return app.page.locator('.tm-view .xterm-rows').innerText()
}

/** How many times the xterm's rows show `text`. */
const timesShown = (rows: string, text: string): number => rows.split(text).length - 1

/** Wait until the xterm's rows show `text`, at least `times` times; answer what they showed last. */
async function untilTheRowsShow(text: string, ms = 15_000, times = 1): Promise<string> {
  return until(() => theRows().catch(() => ''), (rows) => timesShown(rows, text) >= times, ms)
}

/** Type into the shell through the door, as another viewer could. */
async function typeThroughTheDoor(data: string): Promise<void> {
  if (app === null) throw new Error('No app.')
  const typed = await ask(app.api, `/api/terminals/${terminal.id}/input`, { method: 'POST', body: { data } })
  expect(typed.status, JSON.stringify(typed.body)).toBe(200)
}

describe('the terminal view', () => {
  it('1. draws what the shell prints, Chinese included', async () => {
    if (app === null) throw new Error('No app.')
    await typeThroughTheDoor("printf '%s\\n' \"中文终端测试 hello-$((6*7))\"\r")
    await app.page.goto(`${app.site}/?mode=inspect#/terminals`, { waitUntil: 'domcontentloaded' })
    await waitForThePage(app.page)
    await app.page.locator('.tm-row-press').first().click()
    await app.page.locator('.tm-view .xterm-rows').waitFor({ state: 'visible' })
    const rows = await untilTheRowsShow('中文终端测试 hello-42')
    expect(rows).toContain('中文终端测试 hello-42')
    expect(await app.page.getByRole('group', { name: t('terminals.view.label') }).count()).toBe(1)
    expect(await app.page.locator('.tm-view-size').innerText()).toBe(t('terminals.view.size', { cols: terminal.cols, rows: terminal.rows }))
  }, 60_000)

  it('2. sends what is typed in the page to the shell', async () => {
    if (app === null) throw new Error('No app.')
    await app.page.locator('.tm-view-screen').click()
    await app.page.keyboard.type('echo typed-$((6*7))-here\r')
    const rows = await untilTheRowsShow('typed-42-here')
    expect(rows).toContain('typed-42-here')
  }, 60_000)

  it('3. sends Chinese typed as an input method hands it over', async () => {
    if (app === null) throw new Error('No app.')
    await app.page.locator('.tm-view-screen').click()
    await app.page.keyboard.type('echo ')
    await app.page.keyboard.insertText('输入中文')
    await app.page.keyboard.type('-$((6*7))\r')
    const rows = await untilTheRowsShow('输入中文-42')
    expect(rows).toContain('输入中文-42')
  }, 60_000)

  it('3b. composes Chinese with an input method, on the Chinese page and the English page, and the shell answers it', async () => {
    if (app === null) throw new Error('No app.')
    const { page } = app
    // CHROMIUM'S OWN INPUT METHOD COMMANDS: imeSetComposition fires compositionstart and compositionupdate in xterm's
    // textarea as a pinyin input method does, and insertText commits the composed text with compositionend.
    const cdp = await page.context().newCDPSession(page)
    // CHINESE FIRST, so the cases after this one find the English page with the view open, as case 3 left it.
    for (const lang of ['zh', 'en'] as const) {
      await page.goto('about:blank')
      await page.goto(`${app.site}/?mode=inspect${lang === 'zh' ? '&lang=zh' : ''}#/terminals`, { waitUntil: 'domcontentloaded' })
      await waitForThePage(page)
      await page.locator('.tm-row-press').first().click()
      await page.locator('.tm-view .xterm-rows').waitFor({ state: 'visible' })
      expect(await page.evaluate(() => document.documentElement.lang)).toBe(lang)
      await page.locator('.tm-view-screen').click()
      await page.evaluate(() => {
        const seen: string[] = []
        const box = document.querySelector('.tm-view .xterm-helper-textarea')
        for (const name of ['compositionstart', 'compositionupdate', 'compositionend']) box?.addEventListener(name, () => seen.push(name))
        ;(window as unknown as { seenComposing: string[] }).seenComposing = seen
      })
      // THE SCREEN STILL SHOWS THE CHINESE PAGE'S LINES on the English page, so the wait below counts one echo more.
      const echoesBefore = timesShown(await theRows(), 'echo 中文')
      await page.keyboard.type('echo ')
      for (const text of ['z', 'zh', 'zhong', 'zhong w', 'zhong wen', '中文']) {
        await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length })
      }
      await cdp.send('Input.insertText', { text: '中文' })
      // THE CHARACTERS REACH THE SHELL AND COME BACK: its line editor echoes them before anything else is typed. A key
      // pressed in the same moment as the commit lost the committed text in 1 of 10 tries, measured on 4 October 2026
      // (wave 13u round 5's report); waiting for the echo lost it in none of 10. Waiting for an echo the Chinese pass
      // had left on the screen did not wait at all, and lost it once in a whole-tree run.
      await untilTheRowsShow('echo 中文', 15_000, echoesBefore + 1)
      await page.keyboard.type(`-$((6*7))-${lang}\r`)
      // THE SHELL'S OWN ANSWER: it worked out the sum, so the line is its output and not the echo of the typing.
      const rows = await untilTheRowsShow(`中文-42-${lang}`)
      expect(rows).toContain(`中文-42-${lang}`)
      expect(rows).toContain(`echo 中文-$((6*7))-${lang}`)
      expect(rows).not.toContain('zhong')
      const seen = await page.evaluate(() => (window as unknown as { seenComposing: string[] }).seenComposing)
      expect(seen[0]).toBe('compositionstart')
      expect(seen).toContain('compositionupdate')
      expect(seen.at(-1)).toBe('compositionend')
    }
    await cdp.detach()
  }, 90_000)

  it('4. pastes the clipboard with Ctrl+Shift+V', async () => {
    if (app === null) throw new Error('No app.')
    await app.page.evaluate(() => navigator.clipboard.writeText('echo pasted-$((6*7))'))
    await app.page.locator('.tm-view-screen').click()
    await app.page.keyboard.press('Control+Shift+V')
    await untilTheRowsShow('echo pasted-$((6*7))')
    await app.page.keyboard.press('Enter')
    const rows = await untilTheRowsShow('pasted-42')
    expect(rows).toContain('pasted-42')
  }, 60_000)

  it('5. fits the terminal to the view, and the shell sees the new size', async () => {
    if (app === null) throw new Error('No app.')
    const before = await app.page.locator('.tm-view-size').innerText()
    await app.page.getByRole('button', { name: t('terminals.view.fit') }).click()
    const after = await until(
      () => app?.page.locator('.tm-view-size').innerText() ?? Promise.resolve(before),
      (said) => said !== before,
    )
    expect(after).not.toBe(before)
    const listed = await ask(app.api, '/api/terminals')
    const now = ((listed.body['terminals'] ?? []) as HeldTerminal[]).find((one) => one.id === terminal.id)
    expect(now, JSON.stringify(listed.body)).toBeDefined()
    expect(after).toBe(t('terminals.view.size', { cols: now?.cols ?? 0, rows: now?.rows ?? 0 }))
    expect(now?.cols ?? 0).toBeGreaterThanOrEqual(20)
    expect(now?.rows ?? 0).toBeGreaterThanOrEqual(5)
    await app.page.locator('.tm-view-screen').click()
    await app.page.keyboard.type('stty size\r')
    const rows = await untilTheRowsShow(`${String(now?.rows)} ${String(now?.cols)}`)
    expect(rows).toContain(`${String(now?.rows)} ${String(now?.cols)}`)
  }, 60_000)

  it('6. at 390 wide, the page does not scroll sideways and the terminal box does', async () => {
    if (app === null) throw new Error('No app.')
    await app.page.setViewportSize({ width: 390, height: 844 })
    await theResizeIsDrawn(app.page)
    const measured = await app.page.evaluate(() => {
      const box = document.querySelector('.tm-view-screen')
      return {
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        boxScrolls: box === null ? null : box.scrollWidth - box.clientWidth,
      }
    })
    expect(measured.page, JSON.stringify(measured)).toBeLessThanOrEqual(1)
    expect(measured.boxScrolls, JSON.stringify(measured)).toBeGreaterThan(0)
    await app.page.setViewportSize({ width: 1000, height: 800 })
  }, 60_000)

  it("7. draws the xterm on the page's --panel-2, in light and in dark", async () => {
    if (app === null) throw new Error('No app.')
    const theColours = (): Promise<{ xterm: string; panel: string }> =>
      app!.page.evaluate(() => {
        const probe = document.createElement('div')
        probe.style.background = 'var(--panel-2)'
        document.body.append(probe)
        const panel = getComputedStyle(probe).backgroundColor
        probe.remove()
        // xterm 6 paints the theme's background on its scrollable element.
        const painted = document.querySelector('.tm-view .xterm-scrollable-element')
        return { xterm: painted === null ? '' : getComputedStyle(painted).backgroundColor, panel }
      })
    await app.page.emulateMedia({ colorScheme: 'light' })
    const light = await until(theColours, (c) => c.xterm === c.panel, 5_000)
    expect(light.xterm, JSON.stringify(light)).toBe(light.panel)
    await app.page.emulateMedia({ colorScheme: 'dark' })
    const dark = await until(theColours, (c) => c.xterm === c.panel && c.panel !== light.panel, 5_000)
    expect(dark.xterm, JSON.stringify(dark)).toBe(dark.panel)
    expect(dark.panel).not.toBe(light.panel)
  }, 60_000)

  it('7b. leaves the page unscrolled sideways at 1440 and 390 in the light theme, and photographs it when asked', async () => {
    if (app === null) throw new Error('No app.')
    const themes: readonly ('light' | 'dark')[] = SHOTS === undefined ? ['light'] : ['light', 'dark']
    const widths = SHOTS === undefined ? [1440, 390] : [1440, 990, 660, 390]
    for (const theme of themes) {
      await app.page.emulateMedia({ colorScheme: theme })
      for (const width of widths) {
        await app.page.setViewportSize({ width, height: 900 })
        await theResizeIsDrawn(app.page)
        const over = await app.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(over, `${theme} ${String(width)}`).toBeLessThanOrEqual(1)
        if (SHOTS !== undefined) {
          await app.page.locator('.tm-view').scrollIntoViewIfNeeded()
          await putTheMadeUpLabelIn(app.page, 'Made-up data: a test terminal and shell output.', app.page.locator('.tm-view'), 'the terminal view')
          await app.page.screenshot({ path: join(SHOTS, `terminal-view-${String(width)}-${theme}.png`), fullPage: true })
          await takeTheMadeUpLabelOut(app.page)
        }
      }
    }
    await app.page.emulateMedia({ colorScheme: 'light' })
    await app.page.setViewportSize({ width: 1000, height: 800 })
  }, 120_000)

  it('7c. brings the ended view back onscreen and draws its final line without more output or a user scroll', async () => {
    if (app === null) throw new Error('No app.')
    const { page } = app
    // A LIST REFRESH ABOVE THE VIEW can move a just-opened screen out of the viewport.
    await page.locator('.tm-view-screen').scrollIntoViewIfNeeded()
    await page.evaluate(() => {
      const view = document.querySelector('.tm-view')
      if (view === null) throw new Error('No terminal view.')
      const placement = document.createElement('style')
      placement.id = 'terminal-tail-placement'
      placement.textContent = '* { overflow-anchor: none !important; }'
      document.head.appendChild(placement)
      const growth = document.createElement('div')
      growth.id = 'terminal-tail-preceding-growth'
      growth.style.height = `${window.innerHeight * 2}px`
      view.before(growth)
    })
    const top = await page.locator('.tm-view-screen').evaluate((screen) => screen.getBoundingClientRect().top)
    expect(top).toBeGreaterThan(page.viewportSize()?.height ?? 0)
    await page.locator('.tm-view-screen').evaluate((screen) => new Promise<void>((resolve) => {
      const observer = new IntersectionObserver(([entry]) => {
        if (entry !== undefined && !entry.isIntersecting) {
          observer.disconnect()
          resolve()
        }
      })
      observer.observe(screen)
    }))
    try {
      // The shell computes the expected tail; its echoed command cannot satisfy the assertion.
      await typeThroughTheDoor("printf 'final-line-%s\\n' \"$((6*7))\"; exit\r")
      await page.locator('.tm-view-state[data-state="ended"]').waitFor({ state: 'visible' })
      // No scroll, input, resize or new output follows the end event.
      const view = await page.locator('.tm-view-screen').evaluate((screen) => {
        const rect = screen.getBoundingClientRect()
        return { top: rect.top, bottom: rect.bottom, height: window.innerHeight }
      })
      console.log('Terminal tail after end:', JSON.stringify({ ...view, rows: await theRows() }))
      expect(view.top, JSON.stringify(view)).toBeLessThan(view.height)
      expect(view.bottom, JSON.stringify(view)).toBeGreaterThan(0)
      const rows = await untilTheRowsShow('final-line-42')
      expect(rows).toContain('final-line-42')
      const tail = await page.locator('.tm-view .xterm-rows > div').filter({ hasText: 'final-line-42' }).last().evaluate((line) => {
        const rect = line.getBoundingClientRect()
        const screen = document.querySelector('.tm-view-screen')?.getBoundingClientRect()
        return { top: rect.top, bottom: rect.bottom, screenTop: screen?.top ?? 0, screenBottom: screen?.bottom ?? 0, height: window.innerHeight }
      })
      expect(tail.top, JSON.stringify(tail)).toBeGreaterThanOrEqual(Math.max(0, tail.screenTop))
      expect(tail.bottom, JSON.stringify(tail)).toBeLessThanOrEqual(Math.min(tail.height, tail.screenBottom))
    } finally {
      await page.locator('#terminal-tail-preceding-growth').evaluate((growth) => growth.remove())
      await page.locator('#terminal-tail-placement').evaluate((style) => style.remove())
    }
  }, 60_000)

  it('8. closes the terminal on the second press of Close', async () => {
    if (app === null) throw new Error('No app.')
    // At 390 wide, the longer words of the second press still fit the page.
    await app.page.setViewportSize({ width: 390, height: 844 })
    await app.page.getByRole('button', { name: t('terminals.view.close') }).click()
    const again = app.page.getByRole('button', { name: t('terminals.view.closeAgain') })
    await again.waitFor({ state: 'visible' })
    expect(await app.page.locator('.tm-view').count(), 'one press closed it').toBe(1)
    const over = await app.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(over, 'the second press widened the page').toBeLessThanOrEqual(1)
    if (SHOTS !== undefined) await app.page.screenshot({ path: join(SHOTS, 'terminal-view-390-light-close-again.png'), fullPage: true })
    await again.click()
    await app.page.locator('.tm-view').waitFor({ state: 'detached' })
    const listed = await until(
      () => ask(app!.api, '/api/terminals'),
      (read) => !((read.body['terminals'] ?? []) as HeldTerminal[]).some((one) => one.id === terminal.id),
    )
    expect(((listed.body['terminals'] ?? []) as HeldTerminal[]).map((one) => one.id)).not.toContain(terminal.id)
    await app.page.getByText(t('terminals.noneOpen')).waitFor({ state: 'visible' })
  }, 60_000)
})
