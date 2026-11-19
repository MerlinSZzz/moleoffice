// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY CHAT PLATE IS ROUND IN EVERY THEME, AND IN A THEME OF THE PERSON'S OWN THAT SETS EVERY CORNER TO 0.
 *
 * A chat plate is the ground a chat icon is drawn on. There are two: the corner chat button, drawn at the desk
 * while the chat is shut and a message waits, and the top bar's chat press, drawn below THE_SHELL_WIDTH. Both took
 * their corners from a theme's corner style names, so High contrast drew the corner button square, Neutral grey
 * drew it with 8-pixel corners, and the top bar's press was an oblong with small corners in every look. A person's
 * own theme may set the corner style names to anything, so a plate is round only if it reads none of them.
 *
 * In a test office of its own, this file opens Home under each look the Settings page offers (THEME_CHOICES; Auto
 * draws Light or Dark, so it adds no look of its own), and under a made-up theme of the person's own: a copy of a
 * theme from the data with every corner style name set to 0, passed through readThemes and drawn with themeRule in
 * a style element before the stylesheets, as the page draws the themes it ships. At 1440 it reads the corner button
 * and the picture on it, and at 990, 660 and 390 the top bar's press. Each must be as wide as it is high, with every
 * corner at least half its width.
 *
 * Every look and width is read before the file says which are not round, so a failure names all of them.
 */

import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { STYLE_NAMES } from '../src/shared/theme-style-names.ts'
import { readThemes, THEMES, themeRule, type Theme } from '../src/shared/themes.ts'
import { THE_SHELL_WIDTH } from '../src/web/lib/the-shell-width.ts'

type Bar = typeof import('../src/web/components/PresetBar.tsx')

let app: LiveApp
let bar: Bar

const WIDTHS = [1440, 990, 660, 390] as const

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The corner style names a theme sets: every name on the list with "radius" in it. */
const CORNER_NAMES = STYLE_NAMES.filter((name) => name.includes('radius'))

/** A copy of the first theme from the data, under an id of its own, with every corner style name set to 0. */
function anOwnTheme(): Theme {
  const shipped = THEMES[0]
  if (shipped === undefined) throw new Error('There is no theme in the data to copy.')
  const values: Record<string, string> = { ...shipped.values }
  for (const name of CORNER_NAMES) values[name] = '0'
  const [own] = readThemes([{ id: 'my-own-square-corners', name: { en: 'My own square corners', zh: '我自己的方角' }, values }])
  if (own === undefined) throw new Error('The reader handed back no theme.')
  return own
}

/** File one unread message for the person, so the corner chat button is drawn while the chat is shut. */
async function aWaitingMessage(): Promise<void> {
  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title: 'Round Plate Keeper', data: { handle: 'round-plate-keeper', runtime: 'claude-code', state: 'active' } }),
  })
  expect(made.status, await made.clone().text()).toBe(201)
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'round-plate-keeper' },
    body: JSON.stringify({ kind: 'message', title: 'A made-up line for the round plate', data: { body: 'A made-up line for the round plate.', to: [{ kind: 'person', id: THE_PERSON }] } }),
  })
  expect(said.status, await said.clone().text()).toBe(201)
}

/** The size of a plate and its smallest corner, in pixels, and the same for a picture inside it. */
interface ThePlate {
  width: number
  height: number
  smallestCorner: number
  picture: { width: number; smallestCorner: number } | null
}

async function thePlateDrawn(selector: string): Promise<ThePlate> {
  return app.page.locator(selector).evaluate((plate) => {
    const cornersOf = (element: Element): { width: number; height: number; smallestCorner: number } => {
      const box = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      const inPixels = (value: string): number => (value.trim().endsWith('%') ? (Number.parseFloat(value) / 100) * box.width : Number.parseFloat(value))
      const corners = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius]
      return { width: box.width, height: box.height, smallestCorner: Math.min(...corners.map(inPixels)) }
    }
    const picture = plate.querySelector('.px-chat-circle-mark')
    return { ...cornersOf(plate), picture: picture === null ? null : cornersOf(picture) }
  })
}

/** What is wrong with a plate, or null when it and its picture are circles. Half a pixel is rounding. */
function notRound(plate: ThePlate): string | null {
  if (Math.abs(plate.width - plate.height) > 0.5) return `it is ${String(plate.width)} by ${String(plate.height)} pixels`
  if (plate.smallestCorner < plate.width / 2 - 0.5) return `it has a corner of ${String(plate.smallestCorner)} pixels and is ${String(plate.width)} wide`
  if (plate.picture !== null && plate.picture.smallestCorner < plate.picture.width / 2 - 0.5) {
    return `its picture has a corner of ${String(plate.picture.smallestCorner)} pixels and is ${String(plate.picture.width)} wide`
  }
  return null
}

/** Open Home afresh at 1440 with this look stored, as the Settings page stores it. */
async function openHome(look: string): Promise<void> {
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  await app.page.goto(`${app.site}/`)
  await app.page.evaluate(
    ([key, theme]) => {
      localStorage.setItem(key ?? '', theme ?? '')
      localStorage.setItem('mole-office.shell.sidebar', 'expanded')
    },
    [`${bar.STORAGE_PREFIX}theme`, look],
  )
  await app.page.goto(`${app.site}/?lang=en&mode=normal#/`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.waitForSelector('.px-chat-circle', { timeout: 30_000 })
}

/** Put the own theme's rule in the page before the stylesheets and draw the page under it. */
async function wearTheOwnTheme(own: Theme): Promise<void> {
  await app.page.evaluate(
    ([id, rule, aStylesheet]) => {
      const style = document.createElement('style')
      style.textContent = rule ?? ''
      document.head.insertBefore(style, document.head.querySelector(aStylesheet ?? ''))
      document.documentElement.setAttribute('data-theme', id ?? '')
      document.documentElement.setAttribute('data-theme-from', 'data')
    },
    [own.id, themeRule(own), bar.A_STYLESHEET],
  )
  const drawn = await app.page.evaluate(() => {
    const style = getComputedStyle(document.documentElement)
    return { fab: style.getPropertyValue('--fab-radius').trim(), small: style.getPropertyValue('--look-radius-sm').trim() }
  })
  expect(drawn, 'the own theme is not what the page is drawn under').toEqual({ fab: '0', small: '0' })
}

/** Read the plate at each width under the look the page is drawn in, and say what is not round. */
async function readEveryWidth(look: string): Promise<string[]> {
  const wrong: string[] = []
  for (const width of WIDTHS) {
    await app.page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
    await app.page.waitForTimeout(300)
    const plate = width >= THE_SHELL_WIDTH ? '.px-chat-circle' : '.shell-bar .shell-chat-phone'
    expect(await app.page.locator(plate).count(), `${look} ${String(width)}: the chat plate ${plate} is not drawn`).toBe(1)
    const why = notRound(await thePlateDrawn(plate))
    if (why !== null) wrong.push(`${look}, ${String(width)}, ${plate}: ${why}`)
  }
  return wrong
}

beforeAll(async () => {
  // The bar's import graph reads localStorage at module scope, so Node is given the smallest stand-in for a window
  // first, as in tests/a-theme-from-the-data-marks-the-root.test.ts, and it is taken away once the bar is read.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage, sessionStorage: storage, location: { hash: '', search: '' },
    addEventListener: () => {}, removeEventListener: () => {},
  }
  bar = await import('../src/web/components/PresetBar.tsx')
  delete (globalThis as unknown as { window?: unknown }).window
  app = await liveApp({ name: 'every-chat-plate-is-round', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  await aWaitingMessage()
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

it('reads the corner names it sets to 0 from the style list, and the two names the plates read today are among them', () => {
  expect(CORNER_NAMES).toContain('--fab-radius')
  expect(CORNER_NAMES).toContain('--look-radius-sm')
})

it(`draws the corner chat button at 1440 and the top bar's chat press below ${String(THE_SHELL_WIDTH)} as circles under every look Settings offers, and under an own theme whose corners are all 0: High contrast drew the button square and the press was an oblong`, async () => {
  const looks = bar.THEME_CHOICES.filter((choice) => choice !== 'auto')
  expect(looks.length, 'the looks Settings offers, Auto aside').toBe(2 + THEMES.length)
  const wrong: string[] = []
  for (const look of looks) {
    await openHome(look)
    const drawnAs = await app.page.evaluate(() => document.documentElement.getAttribute('data-theme'))
    expect(drawnAs, 'the look the page was opened with').toBe(look)
    wrong.push(...(await readEveryWidth(look)))
  }
  const own = anOwnTheme()
  await openHome('light')
  await wearTheOwnTheme(own)
  wrong.push(...(await readEveryWidth(`the own theme ${own.id}`)))
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  expect(wrong, 'where a chat plate is not a circle').toEqual([])
}, 600_000)
