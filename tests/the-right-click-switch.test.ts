// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SWITCH ON A TERMINAL CHOOSES WHAT A RIGHT-CLICK INSIDE IT DOES. Wave 13y.
 *
 * src/web/components/RightClickSwitch.tsx is drawn in the terminal view's row of presses. In one state a
 * right-click inside the terminal is the terminal's own: the browser keeps its menu, and that menu's Copy and
 * Paste act on xterm's own text box. In the other state it is Mole Office's right-click, about the words
 * selected in the terminal. This test starts a real terminal holder and a scratch office on a database of its
 * own, as tests/the-terminal-view-draws-and-types.test.ts does, opens a shell as the person, and checks:
 *
 *   1. The switch is drawn and starts in the terminal's own state. Its state is read by its words and by
 *      aria-checked, not by a colour.
 *   2. In the terminal's own state, a right-click on a selected line leaves the browser its menu and opens no
 *      box. xterm's text box is focused and holds the line, selected. A copy there gives the line, and a
 *      paste there reaches the shell.
 *   3. In the terminal's own state with nothing selected, the browser keeps its menu and opens no box, and
 *      xterm's text box holds nothing to copy.
 *   4. Pressed, the switch says Mole Office's state. A right-click on a selected line then opens the box,
 *      and its quote is exactly the selected words.
 *   5. In Mole Office's state with nothing selected, a right-click on a line opens the box about that line,
 *      as a right-click on any of Mole Office's own words does.
 *   6. Space and Enter turn the switch from the keyboard, and the state chosen there is what a right-click
 *      does next.
 *   7. In Mole Office's state, words dragged over in the terminal are more than the box's quote keeps and fewer
 *      than the terminal draws. The box's Copy press puts exactly those words on the clipboard, whole, and not
 *      the quote's opening or the text of the page.
 *
 * THE CLIPBOARD IS ASKED FOR in case 7, as tests/the-right-click-box-copies.test.ts asks for it. The terminal's
 * own Copy press is pressed first, so a drag that selected other words is told apart from a box that copied other
 * words.
 *
 * THE BROWSER'S OWN MENU CANNOT BE PRESSED FROM A TEST. Case 2 sends the copy event and the paste event that
 * its Copy and Paste send, to the box the menu acts on, which is the focused one.
 *
 * WHERE THE HOLDER IS. As in tests/the-terminal-view-draws-and-types.test.ts: the holder is started in a
 * place of its own, and the server is given the same XDG_CONFIG_HOME and HOME while liveApp starts it.
 */

import type { Locator, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { SHOWN_CHARACTERS, shortenToWords } from '../src/shared/shortening.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { AS_THE_PERSON, aPlace, ask, groups, sleep, startAHolder, stopEverything, until, type HeldTerminal, type Place } from './terminal-holder-stand.ts'

let app: LiveApp | null = null
let place: Place
let terminal: HeldTerminal

/** Start liveApp with the place's XDG_CONFIG_HOME, HOME and a UTF-8 LANG, and put the variables back after. */
async function liveAppBesideTheHolder(): Promise<LiveApp> {
  const names = ['XDG_CONFIG_HOME', 'HOME', 'LANG'] as const
  const was = Object.fromEntries(names.map((name) => [name, process.env[name]]))
  process.env['XDG_CONFIG_HOME'] = place.config
  process.env['HOME'] = place.home
  process.env['LANG'] = 'C.UTF-8'
  try {
    return await liveApp({ name: 'right-click-switch', viewport: { width: 1000, height: 800 }, database: place.database })
  } finally {
    for (const name of names) {
      if (was[name] === undefined) delete process.env[name]
      else process.env[name] = was[name]
    }
  }
}

beforeAll(async () => {
  place = aPlace('rcs')
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
}, 240_000)

afterAll(async () => {
  try {
    await app?.stop()
  } finally {
    await stopEverything()
  }
}, 90_000)

/** The page, once the app has started. */
function thePage(): Page {
  if (app === null) throw new Error('No app.')
  return app.page
}

/** The words of each state, read from the code. */
const THE_TERMINALS_OWN = (): string => t('terminals.view.rightClickOwn')
const MOLE_OFFICES = (): string => t('rightClick.switch.office', { box: t('talk.panelName') })

/** The switch in the open terminal view, found by its role and its name. */
function theSwitch(): Locator {
  return thePage().locator('.tm-view').getByRole('switch', { name: t('rightClick.switch.name', { box: t('talk.panelName') }), exact: true })
}

/** What the switch says: its accessible state and its words. */
async function whatTheSwitchSays(): Promise<{ checked: string | null; words: string }> {
  const press = theSwitch()
  return { checked: await press.getAttribute('aria-checked'), words: (await press.innerText()).trim() }
}

/** The text of the xterm's drawn rows, one line each. */
async function theRows(): Promise<string> {
  return thePage().locator('.tm-view .xterm-rows').innerText()
}

/** Wait until the xterm's rows show `text`; answer what they showed last. */
async function untilTheRowsShow(text: string, ms = 15_000): Promise<string> {
  return until(() => theRows().catch(() => ''), (rows) => rows.includes(text), ms)
}

/** Type into the shell through the door, as another viewer could. */
async function typeThroughTheDoor(data: string): Promise<void> {
  if (app === null) throw new Error('No app.')
  const typed = await ask(app.api, `/api/terminals/${terminal.id}/input`, { method: 'POST', body: { data } })
  expect(typed.status, JSON.stringify(typed.body)).toBe(200)
}

/**
 * Have the shell print `words` and a sum it works out, and answer the line it printed. The line holds 42
 * and the typed command holds the sum, so the row found by the line is the shell's own output.
 */
async function printALine(words: string): Promise<string> {
  const line = `${words} 42`
  await typeThroughTheDoor(`printf '%s\\n' "${words} $((6*7))"\r`)
  await untilTheRowsShow(line)
  return line
}

/** A point inside the drawn words of the row that shows `line`. */
async function aPointOn(line: string): Promise<{ x: number; y: number }> {
  const row = thePage().locator('.tm-view .xterm-rows > div').filter({ hasText: line }).last()
  await row.scrollIntoViewIfNeeded()
  return row.evaluate((element) => {
    const words = document.createRange()
    words.selectNodeContents(element)
    const box = words.getBoundingClientRect()
    return { x: Math.round(box.left + Math.min(box.width / 2, 60)), y: Math.round(box.top + box.height / 2) }
  })
}

/** Select the whole line at `at`, as a person does with three clicks. */
async function selectTheLine(at: { x: number; y: number }): Promise<void> {
  await thePage().mouse.click(at.x, at.y, { clickCount: 3 })
}

/**
 * Select by a drag, as a person does with the mouse, the words of the row that shows `line` from the first `from`
 * to the end of the line. Answer the words the drag covers and a point on them.
 *
 * The drag starts one pixel inside the left edge of the first character and ends one pixel inside the right edge
 * of the last. xterm rounds a point to the nearest edge between two characters, so an end one pixel from an edge
 * is rounded to that edge.
 */
async function dragAcross(line: string, from: string): Promise<{ words: string; at: { x: number; y: number } }> {
  const page = thePage()
  const row = page.locator('.tm-view .xterm-rows > div').filter({ hasText: line }).last()
  await row.scrollIntoViewIfNeeded()
  const ends = await row.evaluate((element, { line, from }) => {
    const text = element.textContent ?? ''
    if (!text.includes(line)) throw new Error(`The row does not hold the line: ${text}`)
    /** The box of the character at `at` in the row's text. */
    const boxOf = (at: number): DOMRect => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      let before = 0
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const length = node.textContent?.length ?? 0
        if (at < before + length) {
          const one = document.createRange()
          one.setStart(node, at - before)
          one.setEnd(node, at - before + 1)
          return one.getBoundingClientRect()
        }
        before += length
      }
      throw new Error(`The row has no character ${at}.`)
    }
    const first = boxOf(text.indexOf(line) + line.indexOf(from))
    const last = boxOf(text.indexOf(line) + line.length - 1)
    const screen = element.closest('.tm-view-screen')?.getBoundingClientRect() ?? null
    return {
      left: first.left + 1,
      right: last.right - 1,
      y: (first.top + first.bottom) / 2,
      shown: screen !== null && first.left >= screen.left && last.right <= screen.right,
    }
  }, { line, from })
  expect(ends.shown, 'the words to drag over are not all inside the terminal\'s shown box').toBe(true)
  await page.mouse.move(ends.left, ends.y)
  await page.mouse.down()
  await page.mouse.move(ends.right, ends.y, { steps: 8 })
  await page.mouse.up()
  return { words: line.slice(line.indexOf(from)), at: { x: Math.round((ends.left + ends.right) / 2), y: Math.round(ends.y) } }
}

/** What the clipboard is set to before a press, so a press that writes nothing is told apart from one that does. */
const NOTHING_COPIED_YET = 'nothing has been copied yet'

/** What the clipboard holds now, read through the page. */
async function theClipboard(): Promise<string> {
  return thePage().evaluate(async () => navigator.clipboard.readText())
}

/** Set the clipboard to the marker. */
async function clearTheClipboard(): Promise<void> {
  await thePage().evaluate(async (marker) => navigator.clipboard.writeText(marker), NOTHING_COPIED_YET)
}

/** Leave nothing selected in the terminal: one click on a line clears xterm's selection. */
async function selectNothing(at: { x: number; y: number }): Promise<void> {
  await thePage().mouse.click(at.x, at.y)
}

/** Right-click at `at` and say whether the browser kept its menu, read after the app's own listener. */
async function rightClickAt(at: { x: number; y: number }): Promise<boolean | null> {
  const page = thePage()
  await page.evaluate(() => {
    const seen = window as unknown as { theMenu: boolean | null }
    seen.theMenu = null
    document.addEventListener('contextmenu', (e) => {
      seen.theMenu = !e.defaultPrevented
    }, { once: true })
  })
  await page.mouse.click(at.x, at.y, { button: 'right' })
  await sleep(400)
  return page.evaluate(() => (window as unknown as { theMenu: boolean | null }).theMenu)
}

/** The focused box, when it is xterm's own text box in the terminal view, and the words selected in it. */
async function xtermsOwnBox(): Promise<{ value: string; selected: string } | null> {
  return thePage().evaluate(() => {
    const box = document.activeElement
    if (!(box instanceof HTMLTextAreaElement) || !box.classList.contains('xterm-helper-textarea')) return null
    if (box.closest('.tm-view') === null) return null
    return { value: box.value, selected: box.value.slice(box.selectionStart, box.selectionEnd) }
  })
}

/** How many of Mole Office's right-click boxes are open. */
async function boxesOpen(): Promise<number> {
  return thePage().locator('.px-talk').count()
}

/** The open box's quote: the whole words it keeps, and the words it shows. */
async function theQuote(): Promise<{ whole: string | null; shown: string }> {
  const page = thePage()
  await page.locator('.px-talk').waitFor({ timeout: 15_000 })
  const what = page.locator('.px-talk .px-talk-quote .px-talk-chip-what').first()
  return { whole: await what.getAttribute('title'), shown: ((await what.textContent()) ?? '').trim() }
}

/** Close the open box with its own press, and wait until it has gone. */
async function closeTheBox(): Promise<void> {
  const page = thePage()
  await page.locator('.px-talk .px-talk-close').first().click()
  await until(() => boxesOpen(), (open) => open === 0, 10_000)
  expect(await boxesOpen()).toBe(0)
}

describe('the right-click switch on a terminal', () => {
  it('1. is drawn, starts in the terminal\'s own state, and says its state in words and in aria-checked', async () => {
    if (app === null) throw new Error('No app.')
    const page = app.page
    await page.goto(`${app.site}/?mode=inspect#/terminals`, { waitUntil: 'domcontentloaded' })
    await waitForThePage(page)
    await page.locator('.tm-row-press').first().click()
    await page.locator('.tm-view .xterm-rows').waitFor({ state: 'visible' })
    expect(await theSwitch().count()).toBe(1)
    expect(await theSwitch().isVisible()).toBe(true)
    expect(await whatTheSwitchSays()).toEqual({ checked: 'false', words: THE_TERMINALS_OWN() })
    expect(THE_TERMINALS_OWN()).not.toBe(MOLE_OFFICES())
  }, 60_000)

  it('2. in the terminal\'s own state, a right-click on selected words gives the terminal\'s copy and paste, and no box', async () => {
    const line = await printALine('three chosen words')
    const at = await aPointOn(line)
    await selectTheLine(at)
    expect(await rightClickAt(at), 'Mole Office took the right-click in the terminal\'s own state').toBe(true)
    expect(await boxesOpen(), 'the right-click opened Mole Office\'s box').toBe(0)
    expect(await xtermsOwnBox(), 'the browser\'s menu would not act on xterm\'s box and the selected line').toEqual({ value: line, selected: line })

    const copied = await thePage().evaluate(() => {
      const data = new DataTransfer()
      document.activeElement?.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }))
      return data.getData('text/plain')
    })
    expect(copied).toBe(line)

    await thePage().evaluate((words) => {
      const data = new DataTransfer()
      data.setData('text/plain', words)
      document.activeElement?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    }, 'echo pasted-by-the-menu-$((6*7))')
    await untilTheRowsShow('echo pasted-by-the-menu-$((6*7))')
    await typeThroughTheDoor('\r')
    expect(await untilTheRowsShow('pasted-by-the-menu-42')).toContain('pasted-by-the-menu-42')
  }, 60_000)

  it('3. in the terminal\'s own state with nothing selected, the browser keeps its menu over an empty box', async () => {
    const before = await aPointOn('pasted-by-the-menu-42')
    await selectNothing(before)
    const line = await printALine('nothing chosen here')
    const at = await aPointOn(line)
    expect(await rightClickAt(at)).toBe(true)
    expect(await boxesOpen()).toBe(0)
    expect(await xtermsOwnBox()).toEqual({ value: '', selected: '' })
  }, 60_000)

  it('4. pressed, it says Mole Office\'s state, and a right-click on selected words opens the box about exactly those words', async () => {
    await theSwitch().click()
    expect(await whatTheSwitchSays()).toEqual({ checked: 'true', words: MOLE_OFFICES() })
    const line = await printALine('four words chosen here')
    const at = await aPointOn(line)
    await selectTheLine(at)
    expect(await rightClickAt(at), 'the browser kept its menu in Mole Office\'s state').toBe(false)
    const quote = await theQuote()
    expect(quote.whole).toBe(line)
    expect(quote.shown).toContain(line)
    await closeTheBox()
  }, 60_000)

  it('5. in Mole Office\'s state with nothing selected, a right-click on a line opens the box about that line', async () => {
    const before = await aPointOn('four words chosen here 42')
    await selectNothing(before)
    const line = await printALine('no words chosen')
    const at = await aPointOn(line)
    expect(await rightClickAt(at)).toBe(false)
    const quote = await theQuote()
    expect(quote.whole).toBe(line)
    await closeTheBox()
  }, 60_000)

  it('6. Space and Enter turn it from the keyboard, and the state chosen there is what a right-click does', async () => {
    const page = thePage()
    expect(await theSwitch().evaluate((element) => (element as HTMLElement).tabIndex)).toBe(0)
    await theSwitch().focus()
    expect(await page.evaluate(() => document.activeElement?.getAttribute('role'))).toBe('switch')
    await page.keyboard.press('Space')
    expect(await whatTheSwitchSays()).toEqual({ checked: 'false', words: THE_TERMINALS_OWN() })
    await page.keyboard.press('Enter')
    expect(await whatTheSwitchSays()).toEqual({ checked: 'true', words: MOLE_OFFICES() })
    await page.keyboard.press('Space')
    expect(await whatTheSwitchSays()).toEqual({ checked: 'false', words: THE_TERMINALS_OWN() })

    const line = await printALine('chosen by the keyboard')
    const at = await aPointOn(line)
    await selectTheLine(at)
    expect(await rightClickAt(at)).toBe(true)
    expect(await boxesOpen()).toBe(0)
    expect(await xtermsOwnBox()).toEqual({ value: line, selected: line })
  }, 60_000)

  it('7. in Mole Office\'s state, Copy in the box puts the words selected in the terminal on the clipboard, whole', async () => {
    if (app === null) throw new Error('No app.')
    const page = app.page
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: app.site })
    await theSwitch().click()
    expect(await whatTheSwitchSays()).toEqual({ checked: 'true', words: MOLE_OFFICES() })

    const line = await printALine('skip: every word from here to the end of this line is copied whole')
    const { words, at } = await dragAcross(line, 'every')
    // MORE THAN THE QUOTE KEEPS, AND FEWER THAN THE TERMINAL DRAWS: not even the whole line.
    expect(words.length).toBeGreaterThan(SHOWN_CHARACTERS)
    expect(shortenToWords(words).shortened).toBe(true)
    expect(words).not.toBe(line)
    expect((await theRows()).length).toBeGreaterThan(words.length)

    await clearTheClipboard()
    await page.locator('.tm-view .tm-view-tools').getByRole('button', { name: t('terminals.view.copy'), exact: true }).click()
    await expect.poll(theClipboard, { timeout: 15_000 }).not.toBe(NOTHING_COPIED_YET)
    expect(await theClipboard(), 'the drag selected other words in the terminal').toBe(words)

    await clearTheClipboard()
    expect(await rightClickAt(at), 'the browser kept its menu in Mole Office\'s state').toBe(false)
    expect((await theQuote()).whole, 'the box\'s quote is not the opening of the selected words').toBe(shortenToWords(words).words)
    await page.locator('.px-talk').getByRole('button', { name: t('talk.copy'), exact: true }).click()
    await expect.poll(theClipboard, { timeout: 15_000 }).not.toBe(NOTHING_COPIED_YET)
    expect(await theClipboard(), 'Copy did not put the selected words on the clipboard, whole').toBe(words)
    await page.locator('.px-talk').getByText(t('talk.copied'), { exact: true }).waitFor({ timeout: 10_000 })
    await closeTheBox()
  }, 60_000)
})
