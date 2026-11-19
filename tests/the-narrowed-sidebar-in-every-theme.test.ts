// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NARROWED SIDEBAR IN EVERY THEME: ASK AGENT AND REVIEWS ARE DRAWN AS ENTRIES, EVERY ICON IS AN ENTRY'S SIZE, A
 * COUNT STAYS ON ONE LINE, AND THE LOOK SWITCH IS DIVIDED BETWEEN ITS HALVES.
 *
 * Narrowed, an entry is its icon. Four faults were seen under every look Settings offers:
 *
 * 1. Ask agent and Reviews kept the frame and the ground of their open state, so they stood out as two boxes over
 *    a column of bare icons, although the rule that narrows them says they are drawn the same way as the entries.
 * 2. Ask agent's glyph was two small quote marks, 13 units across in a 24-unit icon, and Reviews' ring was 14, while
 *    every other entry's glyph is about 16 or more, so the two read smaller than the icons under them.
 * 3. In Chinese a count carries its measure word ("12 项"). The count stands on the 18-pixel icon's corner, had no
 *    room for two digits and the word, and broke onto a second line, so it covered the Decisions icon whole.
 * 4. The look switch stacks its halves narrowed, but the line between them stayed a left border on the second half:
 *    a bar down one side and nothing between the halves.
 *
 * In a test office of its own with twelve made-up forks for the person to settle, this file opens Home in Chinese at
 * 1440 with the sidebar narrowed, under each look Settings offers (THEME_CHOICES; Auto draws Light or Dark), and at
 * 990, where the sidebar is the menu's drawer, for the count. Every look is read before any case judges, so a failure
 * names every look it holds under.
 */

import type { Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { zh } from '../src/shared/words/zh.ts'
import { THEMES } from '../src/shared/themes.ts'
import { SIDEBAR_KEY } from '../src/web/components/Sidebar.tsx'
import { THE_SHELL_WIDTH } from '../src/web/lib/the-shell-width.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

type Bar = typeof import('../src/web/components/PresetBar.tsx')

let app: LiveApp
let bar: Bar

const FORKS = 12
const AGENT = { name: 'Made-up Narrow Keeper', handle: 'made-up-narrow-keeper' }
const OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

const SIDE = '#shell-side'
const ASK = `${SIDE} .shell-tools > .px-point-switch`
const REVIEWS = `${SIDE} .shell-tools > .px-review-switch`
const ENTRY = `${SIDE} .shell-link, ${ASK}, ${REVIEWS}`
const DECISIONS_COUNT = `${SIDE} [data-target*="rail.decisions"] .shell-badge`

/** How a frame is drawn on one element: each side's width, style and colour, and the ground under it. */
interface Frame {
  sides: { width: number; style: string; colour: string }[]
  ground: string
}

/** What one look drew, read once and judged by each case below. */
interface Drawn {
  quickSearch: Frame
  ask: Frame & { pressed: string | null }
  reviews: Frame & { pressed: string | null }
  askPressed: Frame
  /** Each entry's glyph, by the entry's word, as its larger side in the icon's own units. */
  glyphs: { entry: string; kind: 'ask' | 'reviews' | 'entry'; larger: number }[]
  counts: { where: string; words: string; height: number; lineHeight: number; inEntry: boolean; inColumn: boolean }[]
  look: { second: Frame; frameWidth: number } | null
}

const drawn = new Map<string, Drawn>()

async function frameOf(page: Page, selector: string): Promise<Frame> {
  return page.locator(selector).first().evaluate((element) => {
    const style = getComputedStyle(element)
    const side = (name: 'Top' | 'Right' | 'Bottom' | 'Left') => ({
      width: Number.parseFloat(style.getPropertyValue(`border-${name.toLowerCase()}-width`)),
      style: style.getPropertyValue(`border-${name.toLowerCase()}-style`),
      colour: style.getPropertyValue(`border-${name.toLowerCase()}-color`),
    })
    return { sides: [side('Top'), side('Right'), side('Bottom'), side('Left')], ground: style.backgroundColor }
  })
}

/** True when a side draws nothing: no width, no style, or a colour nobody can see. */
const drawsNothing = (side: Frame['sides'][number]): boolean => side.width === 0 || side.style === 'none' || side.colour === 'rgba(0, 0, 0, 0)' || side.colour === 'transparent'

/** Each count drawn in the sidebar: its words, its height against one line, and whether its entry and column hold it. */
async function theCounts(page: Page, where: string): Promise<Drawn['counts']> {
  const read = await page.locator(`${SIDE} .shell-badge`).evaluateAll((all) => all.filter((one) => one.getClientRects().length > 0).map((one) => {
    const box = one.getBoundingClientRect()
    const entry = one.closest('.shell-link, .px-point-switch, .px-review-switch')?.getBoundingClientRect() ?? null
    const column = document.querySelector('#shell-side .shell-side-inner')?.getBoundingClientRect() ?? null
    const holds = (outer: DOMRect | null) => outer !== null && box.left >= outer.left - 0.5 && box.right <= outer.right + 0.5 && box.top >= outer.top - 0.5 && box.bottom <= outer.bottom + 0.5
    return { words: (one.textContent ?? '').trim(), height: box.height, lineHeight: Number.parseFloat(getComputedStyle(one).lineHeight), inEntry: holds(entry), inColumn: holds(column) }
  }))
  return read.map((one) => ({ where, ...one }))
}

/** Open Home in Chinese under this look, with the sidebar narrowed, at this width. */
async function openHome(look: string, width: number): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await app.browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' })
  await context.addInitScript(({ id, key, theme, store }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id }))
    localStorage.setItem(key, theme)
    localStorage.setItem('mole-office.chat.open', 'no')
    localStorage.setItem(store, 'collapsed')
    localStorage.setItem('mole-office.workspace', 'default')
  }, { id: THE_TEST_OFFICES_OWNER.id, key: `${bar.STORAGE_PREFIX}theme`, theme: look, store: SIDEBAR_KEY })
  const page = await context.newPage()
  await page.goto(`${app.site}/?lang=zh&mode=normal#/`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'the look the page was opened with').toBe(look)
  if (width < THE_SHELL_WIDTH) {
    await page.locator('.shell-menu').click()
    await page.locator(`${SIDE}[data-drawer="open"]`).waitFor()
  } else {
    await page.locator(`${SIDE}[data-state="collapsed"]`).waitFor()
  }
  await page.locator(DECISIONS_COUNT).first().waitFor({ timeout: 30_000 })
  await page.mouse.move(width - 10, 990)
  await page.waitForTimeout(300)
  return { page, close: () => context.close() }
}

async function readTheLook(look: string): Promise<Drawn> {
  const wide = await openHome(look, 1440)
  const { page } = wide
  try {
    const ask = { ...(await frameOf(page, ASK)), pressed: await page.locator(ASK).getAttribute('aria-pressed') }
    const reviews = { ...(await frameOf(page, REVIEWS)), pressed: await page.locator(REVIEWS).getAttribute('aria-pressed') }
    const quickSearch = await frameOf(page, `${SIDE} .shell-quick-search`)
    const glyphs = await page.locator(ENTRY).evaluateAll((all) => all.filter((one) => one.getClientRects().length > 0).map((one) => {
      const svg = one.querySelector('svg.shell-ico')
      const kind = one.classList.contains('px-point-switch') ? 'ask' as const : one.classList.contains('px-review-switch') ? 'reviews' as const : 'entry' as const
      const entry = (one.getAttribute('data-target') ?? one.className).slice(0, 60)
      if (!(svg instanceof SVGSVGElement)) return { entry, kind, larger: 0 }
      const box = svg.getBBox()
      return { entry, kind, larger: Math.max(box.width, box.height) }
    }))
    const counts = await theCounts(page, '1440 narrowed')
    const second = page.locator(`${SIDE} .sbp-look-press + .sbp-look-press`)
    const lookSwitch = (await second.count()) === 0 ? null : {
      second: await frameOf(page, `${SIDE} .sbp-look-press + .sbp-look-press`),
      frameWidth: (await frameOf(page, `${SIDE} .sbp-look`)).sides[0]?.width ?? 0,
    }
    // Pressed, Ask agent keeps a frame, so a person sees the switch is on. What a press does depends on what the page
    // holds to point at, so no press is made: the button is marked pressed for one reading and put back, and the
    // reading is of the sheet alone.
    const askPressed = await page.locator(ASK).evaluate((button) => {
      const before = button.getAttribute('aria-pressed')
      button.setAttribute('aria-pressed', 'true')
      const style = getComputedStyle(button)
      const side = (name: string) => ({
        width: Number.parseFloat(style.getPropertyValue(`border-${name}-width`)),
        style: style.getPropertyValue(`border-${name}-style`),
        colour: style.getPropertyValue(`border-${name}-color`),
      })
      const read = { sides: [side('top'), side('right'), side('bottom'), side('left')], ground: style.backgroundColor }
      if (before === null) button.removeAttribute('aria-pressed')
      else button.setAttribute('aria-pressed', before)
      return read
    })
    const narrow = await openHome(look, 990)
    try {
      counts.push(...(await theCounts(narrow.page, '990 drawer')))
    } finally {
      await narrow.close()
    }
    return { quickSearch, ask, reviews, askPressed, glyphs, counts, look: lookSwitch }
  } finally {
    await wide.close()
  }
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
  app = await liveApp({ name: 'the-narrowed-sidebar-in-every-theme', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  const agent = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers: OWNER,
    body: JSON.stringify({ kind: 'agent', title: AGENT.name, data: { handle: AGENT.handle, runtime: 'claude-code', state: 'active' } }),
  })
  expect(agent.status, await agent.clone().text()).toBe(201)
  for (let n = 1; n <= FORKS; n += 1) {
    const fork = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: { ...OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENT.handle },
      body: JSON.stringify({
        kind: 'proposal',
        title: `A made-up fork ${String(n)}`,
        data: {
          question: `Which made-up shelf takes folder ${String(n)}?`,
          options: ['a — The top shelf.', 'b — The low shelf.'],
          recommendation: 'Take (a). It is empty.',
          because: 'Made up for the narrowed sidebar.',
          who_settles_it: 'the owner',
        },
      }),
    })
    expect(fork.status, await fork.clone().text()).toBe(201)
  }
  const looks = bar.THEME_CHOICES.filter((choice) => choice !== 'auto')
  expect(looks.length, 'the looks Settings offers, Auto aside').toBe(2 + THEMES.length)
  for (const look of looks) drawn.set(look, await readTheLook(look))
}, 600_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

it('1. narrowed, Ask agent and Reviews at rest draw no frame and the ground Quick search has, and pressed, Ask agent draws a frame', () => {
  const wrong: string[] = []
  for (const [look, seen] of drawn) {
    for (const [name, frame] of [['Ask agent', seen.ask], ['Reviews', seen.reviews]] as const) {
      if (frame.pressed === 'true') wrong.push(`${look} ${name}: it was pressed when the page opened`)
      if (!frame.sides.every(drawsNothing)) wrong.push(`${look} ${name}: it draws a frame, ${frame.sides.map((side) => `${String(side.width)}px ${side.style} ${side.colour}`).join(', ')}`)
      if (frame.ground !== seen.quickSearch.ground) wrong.push(`${look} ${name}: its ground is ${frame.ground}, Quick search's ${seen.quickSearch.ground}`)
    }
    if (seen.askPressed.sides.every(drawsNothing)) wrong.push(`${look} Ask agent: pressed, it draws no frame`)
  }
  expect(wrong, 'where Ask agent or Reviews is not drawn as an entry').toEqual([])
})

it("2. narrowed, Ask agent's and Reviews' glyphs are no smaller than the smallest glyph of the other entries", () => {
  const wrong: string[] = []
  for (const [look, seen] of drawn) {
    // An entry that draws a picture and no glyph (larger 0) is not a glyph to measure against.
    const others = seen.glyphs.filter((one) => one.kind === 'entry' && one.larger > 0)
    expect(others.length, `${look}: the other entries measured`).toBeGreaterThan(5)
    const smallest = Math.min(...others.map((one) => one.larger))
    for (const kind of ['ask', 'reviews'] as const) {
      const glyph = seen.glyphs.find((one) => one.kind === kind)
      if (glyph === undefined) wrong.push(`${look} ${kind}: no glyph drawn`)
      else if (glyph.larger < smallest - 0.01) wrong.push(`${look} ${kind}: its glyph is ${glyph.larger.toFixed(1)} units across, the smallest other entry's ${smallest.toFixed(1)}`)
    }
  }
  expect(wrong, 'where Ask agent or Reviews draws a glyph smaller than the entries').toEqual([])
})

it(`3. in Chinese, the count of ${String(FORKS)} forks stays on one line, inside its entry and the sidebar, narrowed at 1440 and in the drawer at 990`, () => {
  const wrong: string[] = []
  const words = zh['nav.badge'].replace('{n}', String(FORKS))
  for (const [look, seen] of drawn) {
    for (const where of ['1440 narrowed', '990 drawer']) {
      const count = seen.counts.find((one) => one.where === where && one.words === words)
      if (count === undefined) {
        wrong.push(`${look} ${where}: no count reads "${words}"; drawn: ${seen.counts.filter((one) => one.where === where).map((one) => one.words).join(', ')}`)
        continue
      }
      if (count.height > count.lineHeight + 1) wrong.push(`${look} ${where}: the count is ${count.height.toFixed(1)}px high, one line ${count.lineHeight.toFixed(1)}px`)
      if (!count.inEntry) wrong.push(`${look} ${where}: the count reaches out of its entry`)
      if (!count.inColumn) wrong.push(`${look} ${where}: the count reaches out of the sidebar`)
    }
  }
  expect(wrong, 'where a count does not stay on one line inside its entry').toEqual([])
})

it('4. narrowed, the look switch draws its dividing line across, between its halves, and none down the side', () => {
  const wrong: string[] = []
  for (const [look, seen] of drawn) {
    if (seen.look === null) {
      wrong.push(`${look}: the look switch has no second half`)
      continue
    }
    const [top, , , left] = seen.look.second.sides
    if (top === undefined || left === undefined) throw new Error('A frame has four sides.')
    if (!drawsNothing(left)) wrong.push(`${look}: the second half draws a ${String(left.width)}px line down its left side`)
    if (drawsNothing(top) || Math.abs(top.width - seen.look.frameWidth) > 0.01) wrong.push(`${look}: the second half's top line is ${String(top.width)}px ${top.style}, the switch's frame ${String(seen.look.frameWidth)}px`)
  }
  expect(wrong, 'where the narrowed look switch is not divided between its halves').toEqual([])
})
