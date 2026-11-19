// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY MARK DRAWN OVER A REPORT SITS ON THE THING IT MARKS, WHEREVER THE CHAT IS.
 *
 * The chat can stand beside the page on the right or on the left, or float in its own window. Moving it
 * moves the page sideways or widens it, and that move is not a scroll, not a resize of the window and
 * not a change to the document. A mark drawn in the window's coordinates that is measured again only
 * after one of those three is left where the page used to be: a dashed frame beside the paragraph it
 * named, a thick line down the margin instead of beside a run of text.
 *
 * WHERE THE CHAT IS IN EACH CASE. At 1440: on the left from the start, on the left after a swap from
 * the right, on the right after a swap back from the left, and in its own window after it stood beside
 * the page. At 990 an open chat never stands beside the page, because below 1024 pixels it covers the
 * screen, so the case there is the chat in its own window.
 *
 * WHAT EACH CASE DRAWS AND CHECKS, after the chat has moved:
 *   1. The mark of a comment the reader pressed, which stays until the reader asks for something else.
 *      A comment on a whole block is a dashed frame on the block's own rectangle. A comment on a run
 *      of text is a rail 3 pixels wide, 8 pixels left of the run, as tall as the run.
 *   2. The comment circles, each beside or just above the block its comment is about.
 *   3. The Regions box, round the paragraph under the pointer and no other.
 *   4. Point mode's outline, round the paragraph under the pointer.
 *   5. A lead's flash, when the chat moves while the flash is on: everything the flash draws is on
 *      the block the lead names.
 *
 * PICTURES. With W13Y_MARK_PICTURES naming a folder, each step is photographed into it after the chat
 * has moved, in the theme W13Y_MARK_THEME names (light unless it says dark). The report and its words
 * say they are made up.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { THE_PERSON } from '../src/shared/person.ts'
import { targetAttributeValue } from '../src/shared/targets.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { FOLLOWING_KEY } from '../src/web/lib/following.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AGENT = 'marks-beside-the-chat-agent'
const AS_THE_AGENT = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENT }

/** How long the chat's move is given to finish before the marks are read. */
const AFTER_THE_MOVE_MS = 600
/**
 * HOW LONG THE PAGE IS LEFT TO STOP CHANGING BEFORE THE CHAT IS MOVED UNDER A PRESSED COMMENT'S MARK, as it had when
 * the owner moved it. Any change to the document measures the marks again, so a move made while the page is still
 * drawing would be answered by that change and not by the move. A lead's flash is short, so the chat is moved under
 * it at once, on a page left to settle before the lead was sent.
 */
const BEFORE_THE_MOVE_MS = 1500
/** How far a mark may be from where it belongs, in pixels: rounding, never a page's width. */
const NEAR = 1

let app: LiveApp
let folder = ''
let previousRoots: string | undefined
let agentId = ''

async function post(path: string, headers: Record<string, string>, body: unknown): Promise<{ id: string }> {
  const answer = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await answer.text()
  expect(answer.status, text).toBe(201)
  return (JSON.parse(text) as { record: { id: string } }).record
}

beforeAll(async () => {
  folder = aTestDatabaseFolder('every-mark-sits-on-its-target')
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = folder
  app = await liveApp({ name: 'every-mark-sits-on-its-target', database: join(folder, 'panelx.db'), viewport: { width: 1440, height: 900 } })
  await post('/api/records', AS_THE_PERSON, { kind: 'agent', title: 'A made-up guide', data: { handle: AGENT, runtime: 'claude-code', state: 'active' } })
  const listed = (await (await fetch(`${app.api}/api/participants`, { headers: AS_THE_PERSON })).json()) as { agents: { id: string; handle: string }[] }
  agentId = listed.agents.find((one) => one.handle === AGENT)?.id ?? ''
  expect(agentId, 'the made-up agent is listed').not.toBe('')
}, 240_000)

afterAll(async () => {
  await app?.stop()
  if (previousRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = previousRoots
  if (folder !== '') removeThisTestFolder(folder)
}, 60_000)

/** A made-up report of seven paragraphs, and two comments on it: one on block b5, one on the text of b6. */
async function aReportWithComments(name: string): Promise<{ report: string; onTheBlock: string; onTheWords: string }> {
  const words = (n: number): string => `Made-up paragraph ${String(n)}. ` + 'These words are made up for a test and say nothing about anything. '.repeat(4)
  const blocks = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: `b${String(n)}`, type: 'text', text: words(n) }))
  const report = (await post('/api/records', AS_THE_PERSON, { kind: 'report', title: `A made-up report: ${name}`, data: { blocks } })).id
  const comment = async (regionId: string, said: string): Promise<string> =>
    (
      await post('/api/records', AS_THE_PERSON, {
        kind: 'annotation',
        title: said,
        data: { body: said, context: { target: { kind: 'region', recordId: report, regionId }, place: { at: 'surface' } } },
      })
    ).id
  return { report, onTheBlock: await comment('data.blocks[#b5]', 'A made-up comment on a block.'), onTheWords: await comment('data.blocks[#b6].text@0', 'A made-up comment on some words.') }
}

/** The element drawing one block of a report. */
function block(report: string, id: string): string {
  return `[data-target="${targetAttributeValue({ kind: 'reportBlock', recordId: report, blockId: id })}"]`
}

/** The element drawing the text of one block of a report. */
function words(report: string, id: string): string {
  return `[data-target="${targetAttributeValue({ kind: 'region', recordId: report, regionId: `data.blocks[#${id}].text@0` })}"]`
}

interface Box {
  left: number
  top: number
  width: number
  height: number
}

/** Where the chat starts, what moves it, and where it is after. */
interface ChatPlace {
  name: string
  width: number
  open: 'split' | 'yes'
  side: 'left' | 'right'
  move: 'swap' | 'window' | null
  /** The root's `data-chat-split` after the move, or null when no chat stands beside the page. */
  after: 'left' | 'right' | null
}

const PLACES: ChatPlace[] = [
  { name: 'on the left from the start', width: 1440, open: 'split', side: 'left', move: null, after: 'left' },
  { name: 'on the left after a swap from the right', width: 1440, open: 'split', side: 'right', move: 'swap', after: 'left' },
  { name: 'on the right after a swap from the left', width: 1440, open: 'split', side: 'left', move: 'swap', after: 'right' },
  { name: 'in its own window after it stood beside the page', width: 1440, open: 'split', side: 'right', move: 'window', after: null },
  { name: 'in its own window at 990', width: 990, open: 'yes', side: 'right', move: null, after: null },
]

/** Go to an address afresh, so the chat starts where the case says. A blank page first, or the start script does not run. */
async function openAfresh(page: Page, route: string): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/#${route}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/** Move the chat as the case says, give the move its time, and check the chat is where the case says. */
async function moveTheChat(page: Page, place: ChatPlace): Promise<void> {
  if (place.move === 'swap') await page.locator('.px-chat-seam-swap').first().click()
  if (place.move === 'window') await page.locator('.px-chat-seam-window').first().click()
  await page.waitForTimeout(AFTER_THE_MOVE_MS)
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-chat-split')), 'the chat is where the case says').toBe(place.after)
}

/** The pieces of the shown mark and the rectangle of an element, as drawn now. */
function theShownMark(page: Page, on: string): Promise<{ pieces: (Box & { mark: string })[]; target: Box | null }> {
  return page.evaluate((selector) => {
    const box = (el: Element): Box => {
      const r = el.getBoundingClientRect()
      return { left: r.left, top: r.top, width: r.width, height: r.height }
    }
    const target = document.querySelector(selector)
    return {
      pieces: [...document.querySelectorAll('.px-subject[data-why="shown"] > i')].map((piece) => ({ mark: piece.className.replace('px-subject-', ''), ...box(piece) })),
      target: target === null ? null : box(target),
    }
  }, on)
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= NEAR
}

/** Whether the frame is drawn on the element's own rectangle. */
function aFrameOn(piece: Box, target: Box): boolean {
  return near(piece.left, target.left) && near(piece.top, target.top) && near(piece.width, target.width) && near(piece.height, target.height)
}

/** Whether the rail stands 8 pixels left of the run, 3 wide and as tall as it. */
function aRailBeside(piece: Box, run: Box): boolean {
  return near(piece.left, run.left - 8) && near(piece.top, run.top) && near(piece.width, 3) && near(piece.height, run.height)
}

/**
 * Every comment circle and the element it is drawn beside, as drawn now. A circle carries the key of the element the
 * page drew its comment's place on: the block for a comment on a whole block, the paragraph for one on its words.
 */
function theCircles(page: Page): Promise<{ on: string; circle: Box; block: Box | null }[]> {
  return page.evaluate(() => {
    const box = (el: Element): Box => {
      const r = el.getBoundingClientRect()
      return { left: r.left, top: r.top, width: r.width, height: r.height }
    }
    return [...document.querySelectorAll('.px-comment-circle')].map((circle) => {
      const on = circle.getAttribute('data-comments-on') ?? ''
      const owner = document.querySelector(`#main [data-target="${CSS.escape(on)}"]`)
      return { on, circle: box(circle), block: owner === null ? null : box(owner) }
    })
  })
}

/** Whether a circle is beside its block's top right corner, in the margin or just above it, within one gap. */
function besideItsBlock(circle: Box, owner: Box): boolean {
  const right = owner.left + owner.width
  const inTheMargin = near(circle.top, owner.top) && circle.left >= right && circle.left <= right + 12
  const aboveTheCorner = circle.top + circle.height <= owner.top && circle.top + circle.height >= owner.top - 12 && circle.left + circle.width <= right && circle.left + circle.width >= right - 12
  return inTheMargin || aboveTheCorner
}

/** Put the pointer in the middle of an element, having first put it somewhere else. */
async function pointAt(page: Page, selector: string): Promise<{ x: number; y: number }> {
  await page.mouse.move(2, 2)
  const at = await page.locator(selector).first().boundingBox()
  if (at === null) throw new Error(`nothing is drawn for ${selector}`)
  const middle = { x: at.x + Math.min(60, at.width / 2), y: at.y + at.height / 2 }
  await page.mouse.move(middle.x, middle.y)
  await page.waitForFunction((one) => document.querySelector(`${one}:hover`) !== null, selector, { timeout: 15_000 })
  return middle
}

/** Every element inside the page drawn with a solid outline, and whether it holds a point. */
function solidOutlines(page: Page, at: { x: number; y: number }): Promise<{ key: string; holdsThePoint: boolean }[]> {
  return page.evaluate((point) => {
    const main = document.getElementById('main')
    const out: { key: string; holdsThePoint: boolean }[] = []
    for (const el of document.querySelectorAll<HTMLElement>('[data-target]')) {
      if (main === null || !main.contains(el) || el === main) continue
      const style = getComputedStyle(el)
      if (style.outlineStyle !== 'solid' || style.outlineWidth === '0px') continue
      const r = el.getBoundingClientRect()
      out.push({ key: el.getAttribute('data-target') ?? '', holdsThePoint: point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom })
    }
    return out
  }, at)
}

/** Photograph the step, when pictures are asked for. */
async function photograph(page: Page, name: string): Promise<void> {
  const into = process.env['W13Y_MARK_PICTURES']
  if (into === undefined || into === '') return
  mkdirSync(into, { recursive: true })
  await page.screenshot({ path: join(into, `${name}.png`) })
}

for (const place of PLACES)
  it(`with the chat ${place.name}, every mark sits on the thing it marks`, async () => {
    const { report, onTheBlock, onTheWords } = await aReportWithComments(place.name)
    const theme = process.env['W13Y_MARK_THEME'] === 'dark' ? 'dark' : 'light'
    const named = `${place.width === 990 ? '990' : '1440'}-${place.name.replace(/[^a-z0-9]+/g, '-')}-${theme}`
    const context = await app.browser.newContext({ viewport: { width: place.width, height: 900 } })
    await context.addInitScript(
      ([key, who, open, side, look]) => {
        localStorage.setItem(key as string, who as string)
        localStorage.setItem('mole-office.chat.open', open as string)
        localStorage.setItem('mole-office.chat.split-side', side as string)
        localStorage.setItem('mole-office.preset.theme', look as string)
      },
      [FOLLOWING_KEY, `agent:${agentId}`, place.open, place.side, theme],
    )
    const page = await context.newPage()
    let lead = ''
    try {
      // 1. A COMMENT ON A WHOLE BLOCK, PRESSED FROM ITS OWN PAGE: a dashed frame on the block.
      await openAfresh(page, recordPath(onTheBlock))
      await page.locator('.rd-change').getByRole('button', { name: 'Go to it' }).click()
      await page.waitForSelector('.px-subject[data-why="shown"] > i.px-subject-frame', { timeout: 20_000 })
      expect(page.url(), 'the press took the page to the report').toContain(`#${recordPath(report)}`)
      await page.waitForTimeout(BEFORE_THE_MOVE_MS)
      await moveTheChat(page, place)
      await photograph(page, `${named}-1-frame`)
      const frame = await theShownMark(page, block(report, 'b5'))
      expect(frame.target, 'block b5 is drawn').not.toBeNull()
      expect(frame.pieces.map((one) => one.mark), 'the comment on a block is shown as one frame').toEqual(['frame'])
      expect(aFrameOn(frame.pieces[0]!, frame.target!), `the frame ${JSON.stringify(frame.pieces[0])} is on block b5 at ${JSON.stringify(frame.target)}`).toBe(true)

      // 2. THE COMMENT CIRCLES, one for each comment, each beside its own block.
      const circles = await theCircles(page)
      expect(circles.length, `one circle for each comment: ${JSON.stringify(circles)}`).toBe(2)
      for (const one of circles) {
        expect(one.block, `the block of ${one.on} is drawn`).not.toBeNull()
        expect(besideItsBlock(one.circle, one.block!), `the circle ${JSON.stringify(one.circle)} is beside its block ${JSON.stringify(one.block)}`).toBe(true)
      }

      // 3. THE REGIONS BOX, round the paragraph under the pointer.
      await page.locator('.sb-regions').first().click()
      await page.waitForFunction(() => document.documentElement.getAttribute('data-regions') !== null, undefined, { timeout: 15_000 })
      const boxed = await solidOutlines(page, await pointAt(page, words(report, 'b4')))
      expect(boxed, 'the Regions box is round paragraph b4, under the pointer, and nothing else').toEqual([
        { key: targetAttributeValue({ kind: 'region', recordId: report, regionId: 'data.blocks[#b4].text@0' }), holdsThePoint: true },
      ])
      await page.locator('.sb-regions').first().click()
      await page.waitForFunction(() => document.documentElement.getAttribute('data-regions') === null, undefined, { timeout: 15_000 })

      // 4. POINT MODE'S OUTLINE, round the paragraph under the pointer. Below 1024 pixels its switch is in the menu.
      if (!(await page.locator('.px-point-switch').first().isVisible())) await page.getByRole('button', { name: 'Menu' }).click()
      await page.locator('.px-point-switch').first().click()
      await page.waitForFunction(() => document.documentElement.getAttribute('data-pointing') === '1', undefined, { timeout: 15_000 })
      const pointed = await solidOutlines(page, await pointAt(page, words(report, 'b3')))
      expect(pointed.filter((one) => one.holdsThePoint).map((one) => one.key), 'point mode outlines paragraph b3, under the pointer').toContain(
        targetAttributeValue({ kind: 'region', recordId: report, regionId: 'data.blocks[#b3].text@0' }),
      )
      expect(pointed.filter((one) => !one.holdsThePoint), 'point mode outlines nothing away from the pointer').toEqual([])
      await page.keyboard.press('Escape')

      // 5. A COMMENT ON A RUN OF TEXT, PRESSED FROM ITS OWN PAGE: a rail beside the run.
      await openAfresh(page, recordPath(onTheWords))
      await page.locator('.rd-change').getByRole('button', { name: 'Go to it' }).click()
      await page.waitForSelector('.px-subject[data-why="shown"] > i.px-subject-rail', { timeout: 20_000 })
      await page.waitForTimeout(BEFORE_THE_MOVE_MS)
      await moveTheChat(page, place)
      await photograph(page, `${named}-2-rail`)
      // THE RAIL IS MEASURED FROM THE RUN OF TEXT INSIDE THE PARAGRAPH, the element holding its first character.
      const rail = await theShownMark(page, `${words(report, 'b6')} [data-text-offset="0"]`)
      expect(rail.target, 'the text of block b6 is drawn').not.toBeNull()
      expect(rail.pieces.map((one) => one.mark), 'the comment on some words is shown as one rail').toEqual(['rail'])
      expect(aRailBeside(rail.pieces[0]!, rail.target!), `the rail ${JSON.stringify(rail.pieces[0])} is beside the text of b6 at ${JSON.stringify(rail.target)}`).toBe(true)

      // 6. A LEAD'S FLASH, with the chat moved while the flash is on.
      await openAfresh(page, recordPath(report))
      await page.waitForTimeout(1000)
      lead = (
        await post('/api/records', AS_THE_AGENT, {
          kind: 'message',
          title: 'Look at block four',
          data: { body: 'Look at made-up block four.', to: [{ kind: 'person', id: THE_PERSON }], lead: { target: { kind: 'region', recordId: report, regionId: 'data.blocks[#b4]' }, place: { at: 'surface' } } },
        })
      ).id
      await page.waitForFunction(
        () =>
          document.querySelector('.px-subject[data-why="shown"] > i') !== null ||
          [...document.querySelectorAll<HTMLElement>('[style*="box-shadow"]')].some((one) => one.style.boxShadow.includes('inset')) ||
          document.getAnimations().some((one) => String((one.effect as KeyframeEffect | null)?.getKeyframes()[0]?.boxShadow ?? '').includes('inset')),
        undefined,
        { timeout: 20_000, polling: 'raf' },
      )
      await moveTheChat(page, place)
      await photograph(page, `${named}-3-lead`)
      const flashed = await page.evaluate(
        ({ on, inside, beside }) => {
          const box = (el: Element): Box => {
            const r = el.getBoundingClientRect()
            return { left: r.left, top: r.top, width: r.width, height: r.height }
          }
          const target = document.querySelector(on)
          const washed = new Set<Element>()
          for (const one of document.querySelectorAll<HTMLElement>('[style*="box-shadow"]')) if (one.style.boxShadow.includes('inset')) washed.add(one)
          for (const one of document.getAnimations()) {
            const effect = one.effect as KeyframeEffect | null
            if (effect?.target != null && String(effect.getKeyframes()[0]?.boxShadow ?? '').includes('inset')) washed.add(effect.target)
          }
          const holds = (el: Element, selector: string): boolean => {
            const one = document.querySelector(selector)
            return one !== null && (one === el || el.contains(one))
          }
          return {
            target: target === null ? null : box(target),
            pieces: [...document.querySelectorAll('.px-subject[data-why="shown"] > i')].map((piece) => ({ mark: piece.className.replace('px-subject-', ''), ...box(piece) })),
            washes: [...washed].map((el) => ({ holdsTheBlock: holds(el, inside), sparesTheOthers: beside.every((selector) => !holds(el, selector)) })),
          }
        },
        { on: block(report, 'b4'), inside: words(report, 'b4'), beside: [words(report, 'b3'), words(report, 'b5')] },
      )
      expect(flashed.target, 'block b4 is drawn').not.toBeNull()
      expect(flashed.pieces.length + flashed.washes.length, `the lead's flash is still on after the move: ${JSON.stringify(flashed)}`).toBeGreaterThan(0)
      for (const piece of flashed.pieces) expect(aFrameOn(piece, flashed.target!), `the lead's ${piece.mark} ${JSON.stringify(piece)} is on block b4 at ${JSON.stringify(flashed.target)}`).toBe(true)
      for (const wash of flashed.washes) expect(wash, "the lead's flash is on block b4 and on no other").toEqual({ holdsTheBlock: true, sparesTheOthers: true })
    } finally {
      if (lead !== '') await fetch(`${app.api}/api/messages/${lead}/mark`, { method: 'POST', headers: AS_THE_PERSON, body: JSON.stringify({ mark: 'seen' }) })
      await context.close()
    }
  }, 180_000)
