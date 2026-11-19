// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ON A NARROW SCREEN THE LEAD'S BAR NAMES THE WHOLE GUIDE AND LEAVES EVERY LINE OF THE PAGE READABLE.
 *
 * Round 166's pictures found two faults in the bar a lead leaves while the reader follows an agent. At 660 the bar was
 * drawn over the page's last line, "Last changed just now by …", and the picture could not show whether a scroll would
 * clear it. At 390 it also cut the guide's name to "Following Made-…". Below the lead's narrow line the bar is now a
 * band across the foot of the window: the guide's name wraps instead of being cut, and the page is given the band's
 * height as room at its foot, so its last line can be scrolled clear of the band.
 *
 * WHAT IS MEASURED, in a real browser on a test office of this file's own, in the light and the dark theme. A browser
 * following a made-up guide opens a made-up report, and the guide leads it to the report's fifth paragraph.
 *   1. At 660 and 390, while the paragraph flashes and after the flash: the guide's whole name is drawn on the bar,
 *      nothing of it cut and nothing drawn over it, with the stop press on the bar; the paragraph the lead names is
 *      drawn clear of the bar; with the page scrolled to its end, its last line of text is above the bar; and the page
 *      keeps the band's height as room at its foot, so a taller band leaves that line clear too. Text the browser does
 *      not draw, such as the inside of a closed fold, is not a line.
 *   2. At 660 and 390, once the reader stops following: the bar is gone, and the room the page keeps at its foot is
 *      the height of whatever the lead's box still draws, or none when it draws nothing. This browser follows the guide
 *      before the lead comes, so below the line the bar and its room are there from the start.
 *   3. At 1440 and 990 the lead's note stays as it was: at the window's right, 1rem in and 5rem up, no wider than 22rem,
 *      and the page's room at its foot is what it was before the lead came.
 *
 * MUTATION: remove the line that sets the band's room in src/web/components/Leading.tsx, and the room check of part 1
 * goes red at 660 and 390. Put back `white-space: nowrap` on the narrow `.px-lead-short`, and the name check goes red
 * at 390. On the code before the band, the last-line check is red at 660 and the name check at 390.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { LEADING } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { targetAttributeValue } from '../src/shared/targets.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { FOLLOWING_KEY } from '../src/web/lib/following.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { thePageScroller } from './the-page-scroller.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const GUIDE = { handle: 'made-up-lead-guide', name: 'Made-up lead guide' }
const AS_THE_GUIDE = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': GUIDE.handle }
const WIDTHS = [1440, 990, 660, 390] as const
const THEMES = ['light', 'dark'] as const
/** The width below which the lead draws its narrow bar: 60rem, the lead's own line. */
const NARROW_BELOW = 960

let app: LiveApp
let guideId = ''

async function post(path: string, headers: Record<string, string>, body: unknown): Promise<{ id: string }> {
  const answer = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await answer.text()
  expect(answer.status, text).toBe(201)
  return (JSON.parse(text) as { record: { id: string } }).record
}

beforeAll(async () => {
  app = await liveApp({ name: 'the-lead-bar-leaves-the-page-readable', viewport: { width: 1440, height: 900 } })
  await post('/api/records', AS_THE_PERSON, { kind: 'agent', title: GUIDE.name, data: { handle: GUIDE.handle, runtime: 'claude-code', state: 'active' } })
  const listed = (await (await fetch(`${app.api}/api/participants`, { headers: AS_THE_PERSON })).json()) as { agents: { id: string; handle: string }[] }
  guideId = listed.agents.find((one) => one.handle === GUIDE.handle)?.id ?? ''
  expect(guideId, 'the made-up guide is listed').not.toBe('')
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** A made-up report of eight paragraphs, long enough to scroll at every width. */
async function aReport(name: string): Promise<string> {
  const words = (n: number): string => `Made-up paragraph ${String(n)}. ` + 'These words are made up for a test and say nothing about anything. '.repeat(4)
  const blocks = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: `b${String(n)}`, type: 'text', text: words(n) }))
  return (await post('/api/records', AS_THE_PERSON, { kind: 'report', title: `A made-up report a lead points into: ${name}`, data: { blocks } })).id
}

function paragraph(report: string, block: string): string {
  return `[data-target="${targetAttributeValue({ kind: 'region', recordId: report, regionId: `data.blocks[#${block}].text@0` })}"]`
}

/** The page's room at its foot, and the band's room the lead gave it, as the page reads them. */
function theRoom(page: Page): Promise<{ foot: string; leadRoom: string }> {
  return page.evaluate(() => ({
    foot: getComputedStyle(document.querySelector('.shell-main')!).paddingBottom,
    leadRoom: getComputedStyle(document.documentElement).getPropertyValue('--lead-room').trim(),
  }))
}

/** Whether the room the page keeps at its foot is the height of the lead's box, or none when no box is drawn. */
async function theRoomFollowsTheBox(page: Page): Promise<string> {
  const { room, box } = await page.evaluate(() => {
    const drawn = document.querySelector('.px-lead-here')
    return {
      room: getComputedStyle(document.documentElement).getPropertyValue('--lead-room').trim(),
      box: drawn === null ? '' : `${String(Math.ceil(drawn.getBoundingClientRect().height))}px`,
    }
  })
  return room === box ? 'the room is the box' : `the room is ${room === '' ? 'none' : room}, the box ${box === '' ? 'not drawn' : box}`
}

/** Whether the flash of the lead is on the page now. */
function flashing(page: Page): Promise<boolean> {
  return page.evaluate(() => document.querySelector('.px-subject[data-why="shown"] > i') !== null
    || [...document.querySelectorAll<HTMLElement>('[style*="box-shadow"]')].some((one) => one.style.boxShadow.includes('inset'))
    || document.getAnimations().some((one) => String((one.effect as KeyframeEffect | null)?.getKeyframes()[0]?.['boxShadow'] ?? '').includes('inset')))
}

type Bar = {
  /** The words of the bar's one line, how much of them is not drawn, and the lines something is drawn over. */
  short: string
  cutAcross: number
  cutDown: number
  coveredLines: number
  stopDrawn: boolean
  dotInsideLine: boolean
  /** How far below the bar's top the named paragraph ends, in pixels; nought or less is clear of it. */
  targetUnder: number
  /** With the page scrolled to its end, how far below the bar's top its last line of text ends. */
  lastLineUnder: number
  /** The band's height, rounded up to a whole pixel, and the room at its foot the page was given for it. */
  height: string
  room: string
}

/**
 * The narrow bar as drawn, the named paragraph against it, and the page's last line against it once scrolled to the end.
 * The page is scrolled in the box it scrolls in: its own box on a report at 660, the window at 390.
 */
async function theBar(page: Page, target: string): Promise<Bar> {
  const scroller = await thePageScroller(page)
  return page.evaluate(async ({ target, scroller }) => {
    const bar = document.querySelector<HTMLElement>('.px-lead-here')!
    const short = document.querySelector<HTMLElement>('.px-lead-following .px-lead-short')!
    const range = document.createRange()
    range.selectNodeContents(short)
    const lines = [...range.getClientRects()].filter((one) => one.width > 0 && one.height > 0)
    const coveredLines = lines.filter((line) => {
      const over = document.elementFromPoint(line.left + line.width / 2, line.top + line.height / 2)
      return over === null || !short.contains(over)
    }).length
    const stop = document.querySelector<HTMLElement>('.px-lead-stop')
    const top = (): number => bar.getBoundingClientRect().top
    const targetUnder = document.querySelector(target)!.getBoundingClientRect().bottom - top()
    const kept = scroller.scrollTop
    scroller.scrollTo(0, scroller.scrollHeight)
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const main = document.querySelector('#main')!
    // TEXT KEPT FOR A SCREEN READER IS NOT DRAWN: it stands in a clipped box of one pixel, so it is not a line.
    const unseen = (from: Element | null): boolean => {
      for (let one = from; one !== null && one !== main; one = one.parentElement) {
        const look = getComputedStyle(one)
        const box = one.getBoundingClientRect()
        if (look.clip !== 'auto' || look.clipPath !== 'none' || (box.width <= 1 && box.height <= 1)) return true
      }
      return false
    }
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT)
    let lowest = -Infinity
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      // TEXT INSIDE A CLOSED FOLD IS NOT DRAWN either, though the browser still says where it would be.
      if ((node.textContent ?? '').trim() === '' || unseen(node.parentElement) || !node.parentElement!.checkVisibility()) continue
      const words = document.createRange()
      words.selectNodeContents(node)
      // A LINE BELOW THE WINDOW WITH THE PAGE AT ITS END is clipped inside a box of its own, not a line of the page.
      for (const one of words.getClientRects()) if (one.width > 0 && one.height > 0 && one.bottom <= window.innerHeight + 0.5) lowest = Math.max(lowest, one.bottom)
    }
    const lastLineUnder = lowest - top()
    scroller.scrollTo(0, kept)
    return {
      short: (short.textContent ?? '').trim(),
      cutAcross: short.scrollWidth - short.clientWidth,
      cutDown: short.scrollHeight - short.clientHeight,
      coveredLines,
      stopDrawn: stop !== null && stop.checkVisibility(),
      dotInsideLine: (() => {
        const dot = document.querySelector<HTMLElement>('.px-lead-line .px-lead-dot')!
        const press = document.querySelector<HTMLElement>('.px-lead-line .px-lead-fold')!
        if (!dot.checkVisibility()) return true
        const a = dot.getBoundingClientRect()
        const b = press.getBoundingClientRect()
        const before = lines.at(-1)
        return before !== undefined && before.top < a.bottom && a.top < before.bottom && before.right <= a.left + 0.5 && a.top < b.bottom && b.top < a.bottom && a.right <= b.left + 0.5
      })(),
      targetUnder,
      lastLineUnder,
      height: `${String(Math.ceil(bar.getBoundingClientRect().height))}px`,
      room: getComputedStyle(document.documentElement).getPropertyValue('--lead-room').trim(),
    }
  }, { target, scroller }).finally(() => scroller.dispose())
}

/** Where the wide note stands against the window's right and foot, and how wide it is. */
function theNote(page: Page): Promise<{ fromTheRight: number; fromTheFoot: number; width: number; rem: number; window: number }> {
  return page.evaluate(() => {
    const box = document.querySelector('.px-lead-here')!.getBoundingClientRect()
    return {
      fromTheRight: window.innerWidth - box.right,
      fromTheFoot: window.innerHeight - box.bottom,
      width: box.width,
      rem: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
      window: window.innerWidth,
    }
  })
}

for (const theme of THEMES) for (const width of WIDTHS) {
  const narrow = width < NARROW_BELOW
  it(`${narrow ? 'names the whole guide and leaves every line readable' : 'leaves the note where it was'} at ${width} in the ${theme} theme`, async () => {
    const report = await aReport(`${String(width)}, ${theme}`)
    const target = paragraph(report, 'b5')
    const context = await app.browser.newContext({ viewport: { width, height: width <= 390 ? 844 : 900 } })
    await context.addInitScript(([key, who, look]) => {
      localStorage.setItem(key as string, who as string)
      localStorage.setItem('mole-office.preset.theme', look as string)
      localStorage.setItem('mole-office.chat.open', 'no')
    }, [FOLLOWING_KEY, `agent:${guideId}`, theme])
    const page = await context.newPage()
    let message = ''
    try {
      await page.goto(`${app.site}/?lang=en#${recordPath(report)}`, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      expect(await page.evaluate(() => document.documentElement.dataset['theme']), 'the theme drawn').toBe(theme)
      await page.locator(target).waitFor({ timeout: 30_000 })
      await page.mouse.move(0, 0)
      await page.waitForTimeout(800)
      const before = await theRoom(page)
      if (!narrow) expect(before.leadRoom, 'the room before any lead').toBe('')

      message = (await post('/api/records', AS_THE_GUIDE, {
        kind: 'message',
        title: 'Look at paragraph five',
        data: { body: 'Made-up: look at paragraph five.', to: [{ kind: 'person', id: THE_PERSON }], lead: { target: { kind: 'region', recordId: report, regionId: 'data.blocks[#b5]' }, place: { at: 'surface' } } },
      })).id
      await page.locator('.px-lead-following').waitFor({ timeout: 30_000 })
      await expect.poll(() => flashing(page), { timeout: 20_000, interval: 50 }).toBe(true)

      for (const when of ['during the flash', 'after the flash'] as const) {
        if (when === 'after the flash') await expect.poll(() => flashing(page), { timeout: 20_000 }).toBe(false)
        const where = `${when}, at ${String(width)} in ${theme}`
        if (narrow) {
          const bar = await theBar(page, target)
          expect(bar.short, `${where}: the bar's line`).toBe(LEADING.following(GUIDE.name))
          expect({ cutAcross: bar.cutAcross, cutDown: bar.cutDown, coveredLines: bar.coveredLines, stopDrawn: bar.stopDrawn }, `${where}: the guide's name on the bar`)
            .toEqual({ cutAcross: 0, cutDown: 0, coveredLines: 0, stopDrawn: true })
          expect(bar.dotInsideLine, `${where}: the dot is at a line edge`).toBe(true)
          expect(bar.targetUnder, `${where}: the paragraph the lead names runs under the bar`).toBeLessThanOrEqual(0.5)
          expect(bar.lastLineUnder, `${where}: the page's last line cannot be scrolled clear of the bar`).toBeLessThanOrEqual(0.5)
          expect(bar.room, `${where}: the room the page keeps at its foot for the band`).toBe(bar.height)
        } else {
          const note = await theNote(page)
          expect(Math.abs(note.fromTheRight - note.rem), `${where}: the note's place from the right`).toBeLessThanOrEqual(0.5)
          expect(Math.abs(note.fromTheFoot - 5 * note.rem), `${where}: the note's place from the foot`).toBeLessThanOrEqual(0.5)
          expect(note.width, `${where}: the note's width`).toBeLessThanOrEqual(Math.min(22 * note.rem, note.window - 2 * note.rem) + 0.5)
          expect(await theRoom(page), `${where}: the page's room at its foot`).toEqual(before)
        }
      }

      if (narrow) {
        await page.locator('.px-lead-stop').click({ timeout: 5_000 })
        await page.locator('.px-lead-following').waitFor({ state: 'detached', timeout: 15_000 })
        await expect.poll(() => theRoomFollowsTheBox(page), { timeout: 10_000, message: 'the room after the bar went' }).toBe('the room is the box')
      }
    } finally {
      // THE LEAD IS MARKED READ WHATEVER HAPPENED, so the next case's browser cannot take it when it opens.
      if (message !== '') await fetch(`${app.api}/api/messages/${message}/mark`, { method: 'POST', headers: AS_THE_PERSON, body: JSON.stringify({ mark: 'seen' }) })
      await context.close()
    }
  }, 180_000)
}
