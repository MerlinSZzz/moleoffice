// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A GATE MARK COVERS NO CARD, NO LINE'S WORDS AND NO OTHER MARK, AND ITS OPEN WORDS ARE SHOWN WHOLE. Wave 13u round 238.
 *
 * A gate mark is the round control on a waits-on line that carries a hard or partial gate. Its press opens the gate's
 * own words on the drawing, and a second press puts them away (tests/a-gate-mark-opens-its-explanation-on-the-drawing.test.ts).
 *
 * THE FAULT THIS CRITERION NAMES. The drawing asks placePill (src/web/components/graph/lanes/routing-words.ts) for a
 * place for each mark, and draws the mark at the place it gets back even when placePill says that place is not clear.
 * Such a place is the middle of the line's longest run, so the mark is drawn over the line's own words, "waits on". On
 * the made-up master of 54 boxes that happens at 1440 on the line of "Example box 02 (made up)", and at 660 on two of
 * its three gated lines.
 *
 * THE TWO DRAWINGS are tests/a-made-up-reel-page-and-a-master-of-54-boxes.ts, stored by
 * tests/a-made-up-reel-page-and-master-opened-fresh.ts. Each is opened in its own test office of this file: the reel
 * page at its Steps level, the master of 54 boxes at its Boxes level.
 *
 * EACH CASE opens one page at one width by 1000, in light, and waits until it is drawn and no element says it is being
 * drawn. Then:
 *   1. every line drawn at rest (the drawing root's data-drawn-links) that the file gives a hard or partial gate has
 *      exactly one mark (.e-gate-mark with the line's data-link), and no other line has one. The failure also gives
 *      the list of lines data-fit names under gateMarksWithNoPlace, the gated lines for which the engine found no clear
 *      place for a mark, or says that data-fit has no such list;
 *   2. each mark, closed, lies inside the drawing (the natural box of data-fit, in the drawing's own units, to a unit),
 *      and its box on screen covers no card (.e-card), no line's words (.e-pill) and no other mark by more than a pixel;
 *   3. each mark in turn is scrolled into view and pressed with the mouse at its middle. It then says it is open, and
 *      its words (.e-gate-words) are on one line, their box on screen lies inside the frame's box (.e-frame) to a pixel,
 *      and nothing is drawn over them: the element at their middle and at a point near each corner is the words or
 *      inside them. Each corner point steps in from both edges by 0.3 of that corner's radius on screen and a pixel
 *      more, so it lies inside the words' rounded corner. While they are open they may lie over other parts of the
 *      drawing. A second press at the mark's middle puts them away.
 * A failure names the drawing, the width, the mark's line by the titles of its two cards, and each card, line's words
 * and mark it covers, with its box.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pipelinePath } from '../src/web/components/router.tsx'
import { freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { waitForTheProjects } from './switch-the-project.ts'
import { DRAWING, prepareThePage, theAreasWereStored, theDrawingIsDrawn } from './a-made-up-office-drawn-in-lanes.ts'
import { MASTER_OF_54_BOXES, REEL_PAGE, type FileLink, type Stored } from './a-made-up-reel-page-and-a-master-of-54-boxes.ts'
import { setTheMasterAndStoreTheAreas, storeTheTwoDrawings, type Drawing } from './a-made-up-reel-page-and-master-opened-fresh.ts'

const WIDTHS = [1440, 990, 660] as const
const DRAWN_WITHIN = 120_000
const CASE_ALLOWANCE = 240_000
let opens = 0

type Edges = { left: number; right: number; top: number; bottom: number }
const edges = (box: Edges): string => `left ${box.left.toFixed(1)}, right ${box.right.toFixed(1)}, top ${box.top.toFixed(1)}, bottom ${box.bottom.toFixed(1)}`
const covers = (a: Edges, b: Edges): boolean => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1

/** The file's lines that the drawing's page draws, each with its id in the office and its two cards' titles. */
interface FileLine { link: FileLink; named: string }
function theFileLines(one: Stored, links: FileLink[], titles: ReadonlyMap<string, string>): Map<string, FileLine> {
  const title = (key: string) => titles.get(key) ?? key
  return new Map(one.links.map((id, n) => [id, { link: links[n]!, named: `the line between "${title(links[n]!.from)}" and "${title(links[n]!.to)}"` }]))
}

async function openAt(app: LiveApp, one: Stored, level: 'boxes' | 'steps', width: number): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.goto(`${app.site}/?lang=en&theme=light&open=${++opens}#${pipelinePath(one.pipeline)}`, { waitUntil: 'commit', timeout: DRAWN_WITHIN })
  await waitForThePage(app.page, 30_000)
  await waitForTheProjects(app.page)
  await app.page.waitForFunction(({ level, ids }) => {
    const root = document.querySelector(`[data-drawing="lanes"][data-level="${level}"][data-fit]`)
    if (root === null || document.querySelector('[data-being-drawn]') !== null) return false
    return ids.every((id) => [...root.querySelectorAll('.e-card')].some((card) => card.getAttribute('data-id') === id))
  }, { level, ids: one.cards }, { timeout: DRAWN_WITHIN, polling: 100 })
  await theDrawingIsDrawn(app.page)
}

async function theMarksCoverNothing(app: LiveApp, where: string, width: number, lines: ReadonlyMap<string, FileLine>): Promise<void> {
  const at = `${where}, ${width} x 1000`
  expect(await app.page.locator('[data-being-drawn]').count(), `${at}: no element says it is being drawn`).toBe(0)
  const read = await app.page.locator(DRAWING).evaluate((root) => {
    const edgesOf = (element: Element) => {
      const box = element.getBoundingClientRect()
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom }
    }
    return {
      fit: root.getAttribute('data-fit'),
      drawn: root.getAttribute('data-drawn-links'),
      marks: [...root.querySelectorAll<HTMLElement>('.e-gate-mark')].map((mark) => ({
        link: mark.getAttribute('data-link') ?? '',
        local: { left: parseFloat(mark.style.left), top: parseFloat(mark.style.top), width: mark.offsetWidth, height: mark.offsetHeight },
        ...edgesOf(mark),
      })),
      cards: [...root.querySelectorAll('.e-card')].map((card) => ({
        name: card.querySelector('.e-title')?.textContent?.trim() || card.getAttribute('data-id') || '(a card with no title)',
        ...edgesOf(card),
      })),
      pills: [...root.querySelectorAll('.e-pill')].map((pill) => ({
        link: pill.getAttribute('data-link') ?? '',
        words: (pill.textContent ?? '').replace(/\s+/g, ' ').trim(),
        ...edgesOf(pill),
      })),
    }
  })
  const fit = JSON.parse(read.fit ?? 'null') as { natural?: { x: number; y: number; w: number; h: number }; zoom?: number; [more: string]: unknown } | null
  const drawn = JSON.parse(read.drawn ?? 'null') as string[] | null
  expect(fit?.natural, `${at}: the drawing wrote its natural box in data-fit`).toBeTruthy()
  expect(Array.isArray(drawn), `${at}: the drawing wrote the lines it draws at rest in data-drawn-links`).toBe(true)
  const named = (id: string) => lines.get(id)?.named ?? `a line not in the file, ${id}`
  const gated = drawn!.filter((id) => {
    const line = lines.get(id)?.link
    return line?.type === 'blocks' && (line.gate === 'hard' || line.gate === 'partial')
  })
  expect(gated.length, `${at}: the drawing draws at rest at least one line that the file gives a hard or partial gate`).toBeGreaterThan(0)
  const noPlace = fit!.gateMarksWithNoPlace
  const fitSays = Array.isArray(noPlace)
    ? `data-fit's gateMarksWithNoPlace names ${noPlace.length} lines${noPlace.length ? `: ${noPlace.map((id) => named(String(id))).join('; ')}` : ''}`
    : 'data-fit has no gateMarksWithNoPlace list'

  // 1. One mark on each gated line at rest, and none on any other line.
  const marksOn = (id: string) => read.marks.filter((mark) => mark.link === id).length
  const notOne = gated.filter((id) => marksOn(id) !== 1).map((id) => `${named(id)} has ${marksOn(id)} marks`)
  expect.soft(notOne, `${at}: ${notOne.length} of ${gated.length} gated lines at rest do not have exactly one mark (${fitSays}): ${notOne.join('; ')}`).toEqual([])
  const ungated = [...new Set(read.marks.map((mark) => mark.link).filter((id) => !gated.includes(id)))].map(named)
  expect.soft(ungated, `${at}: ${ungated.length} lines that are not gated lines at rest carry a mark: ${ungated.join('; ')}`).toEqual([])

  // 2. Each mark lies inside the drawing and covers no card, no line's words and no other mark.
  const box = fit!.natural!
  console.log(`GATE MARKS ${JSON.stringify({ page: where, width, zoom: fit!.zoom, natural: box, gated: gated.length, marks: read.marks.map((mark) => ({ line: named(mark.link), ...mark.local })) })}`)
  for (const [n, mark] of read.marks.entries()) {
    const line = named(mark.link)
    const local = mark.local
    const inside = local.left >= box.x - 1 && local.top >= box.y - 1 && local.left + local.width <= box.x + box.w + 1 && local.top + local.height <= box.y + box.h + 1
    expect.soft(inside, `${at}: the mark on ${line}, at left ${local.left.toFixed(1)}, top ${local.top.toFixed(1)}, ${local.width} by ${local.height} in the drawing's units, lies inside the drawing, x ${box.x.toFixed(1)} to ${(box.x + box.w).toFixed(1)}, y ${box.y.toFixed(1)} to ${(box.y + box.h).toFixed(1)}`).toBe(true)
    const covered = [
      ...read.cards.filter((card) => covers(mark, card)).map((card) => `card "${card.name}" ${edges(card)}`),
      ...read.pills.filter((pill) => covers(mark, pill)).map((pill) => `words "${pill.words}" of ${named(pill.link)} ${edges(pill)}`),
      ...read.marks.filter((other, m) => m !== n && covers(mark, other)).map((other) => `the mark on ${named(other.link)} ${edges(other)}`),
    ]
    expect.soft(covered, `${at}: the mark on ${line}, ${edges(mark)}, covers ${covered.length} things: ${covered.join('; ')}`).toEqual([])
  }

  // 3. Each mark, pressed, shows its words whole on one line inside the frame, and a second press puts them away.
  for (const id of gated.filter((id) => marksOn(id) === 1)) {
    const line = named(id)
    const mark = app.page.locator(`${DRAWING} .e-gate-mark[data-link="${id}"]`)
    const press = async () => {
      await mark.scrollIntoViewIfNeeded()
      const place = await mark.boundingBox()
      expect(place, `${at}: the mark on ${line} has a box to press`).not.toBeNull()
      await app.page.mouse.click(place!.x + place!.width / 2, place!.y + place!.height / 2)
    }
    await press()
    const open = await mark.evaluate((element) => {
      const edgesOf = (box: DOMRect) => ({ left: box.left, right: box.right, top: box.top, bottom: box.bottom })
      const words = element.querySelector('.e-gate-words')
      const frame = element.closest('.e-frame')
      if (words === null || frame === null) return { expanded: element.getAttribute('aria-expanded'), words: null }
      const box = words.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(words)
      const tops = [...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => rect.top).sort((a, b) => a - b)
      const lines = tops.filter((top, n) => n === 0 || top - tops[n - 1]! > 2).length
      const name = (hit: Element | null) => {
        if (hit === null) return 'nothing, outside the window'
        const classes = (hit.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean).map((one) => `.${one}`).join('')
        const text = (hit.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
        return `${hit.tagName.toLowerCase()}${classes}${text ? ` "${text}"` : ''}`
      }
      // A point a pixel in from both edges lies outside a rounded corner of 4 px, so it reads what is behind the words.
      const style = getComputedStyle(words)
      const scale = box.width / (words as HTMLElement).offsetWidth || 1
      const step = (radius: string) => 0.3 * scale * Math.max(0, ...radius.split(' ').map(parseFloat).filter(Number.isFinite)) + 1
      const [topLeft, topRight, bottomLeft, bottomRight] = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius].map(step) as [number, number, number, number]
      const points: [string, number, number][] = [
        ['middle', (box.left + box.right) / 2, (box.top + box.bottom) / 2],
        ['top left corner', box.left + topLeft, box.top + topLeft],
        ['top right corner', box.right - topRight, box.top + topRight],
        ['bottom left corner', box.left + bottomLeft, box.bottom - bottomLeft],
        ['bottom right corner', box.right - bottomRight, box.bottom - bottomRight],
      ]
      const over = points.flatMap(([where, x, y]) => {
        const hit = document.elementFromPoint(x, y)
        return hit !== null && (hit === words || words.contains(hit)) ? [] : [`at its ${where}, ${name(hit)}`]
      })
      return {
        expanded: element.getAttribute('aria-expanded'),
        words: { text: (words.textContent ?? '').replace(/\s+/g, ' ').trim(), box: edgesOf(box), frame: edgesOf(frame.getBoundingClientRect()), lines, over },
      }
    })
    expect.soft(open.expanded, `${at}: the press opens the mark on ${line}`).toBe('true')
    if (open.words !== null) {
      const { text, box: shown, frame, lines: count, over } = open.words
      const outside = shown.left < frame.left - 1 || shown.right > frame.right + 1 || shown.top < frame.top - 1 || shown.bottom > frame.bottom + 1
      expect.soft(outside, `${at}: the open words "${text}" of the mark on ${line}, ${edges(shown)}, lie inside the frame, ${edges(frame)}`).toBe(false)
      expect.soft(count, `${at}: the open words "${text}" of the mark on ${line} are on one line`).toBe(1)
      expect.soft(over, `${at}: nothing is drawn over the open words "${text}" of the mark on ${line}, ${edges(shown)}: ${over.join('; ')}`).toEqual([])
    } else expect.soft(open.words, `${at}: the press shows the words of the mark on ${line}`).not.toBeNull()
    await press()
    expect.soft(await mark.locator('.e-gate-words').count(), `${at}: a second press on the mark on ${line} puts its words away`).toBe(0)
    expect.soft(await mark.getAttribute('aria-expanded'), `${at}: the mark on ${line} says it is closed again`).toBe('false')
  }
}

describe('the made-up reel page', () => {
  const PROJECT = { id: 'test-lanes-gate-mark-clear-reel', title: 'Example office for the reel page gate marks (made up)' }
  const titles = new Map([...REEL_PAGE.steps, ...REEL_PAGE.modules, ...REEL_PAGE.others.flatMap((other) => other.steps)].map((one) => [one.key, one.title]))
  let db: TestDb
  let app: LiveApp
  let stored: Record<Drawing, Stored>
  let lines: Map<string, FileLine>

  beforeAll(async () => {
    db = await freshDb()
    stored = await storeTheTwoDrawings(db, PROJECT)
    lines = theFileLines(stored.reel, REEL_PAGE.links, titles)
    app = await liveApp({ name: 'lanes-gate-mark-clear-reel', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1000 } })
    const areas = await setTheMasterAndStoreTheAreas(app, db, PROJECT.id, stored)
    theAreasWereStored(areas.reel, 'the made-up reel page')
    await prepareThePage(app, PROJECT.id)
  }, 300_000)
  afterAll(async () => { await app?.stop(); db?.close() }, 120_000)

  for (const width of WIDTHS) {
    it(`the made-up reel page, ${width} x 1000: each gated line has one mark, which covers no card, no line's words and no other mark, and opens its words whole`, async () => {
      await openAt(app, stored.reel, 'steps', width)
      await theMarksCoverNothing(app, 'the made-up reel page', width, lines)
    }, CASE_ALLOWANCE)
  }
})

describe('the made-up master of 54 boxes', () => {
  const PROJECT = { id: 'test-lanes-gate-mark-clear-master-54', title: 'Example office for the 54-box master gate marks (made up)' }
  const titles = new Map([...MASTER_OF_54_BOXES.steps, ...MASTER_OF_54_BOXES.records].map((one) => [one.key, one.title]))
  let db: TestDb
  let app: LiveApp
  let stored: Record<Drawing, Stored>
  let lines: Map<string, FileLine>

  beforeAll(async () => {
    db = await freshDb()
    stored = await storeTheTwoDrawings(db, PROJECT)
    lines = theFileLines(stored.master, MASTER_OF_54_BOXES.links, titles)
    app = await liveApp({ name: 'lanes-gate-mark-clear-master-54', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1000 } })
    const areas = await setTheMasterAndStoreTheAreas(app, db, PROJECT.id, stored)
    theAreasWereStored(areas.master, 'the made-up master of 54 boxes')
    await prepareThePage(app, PROJECT.id)
  }, 300_000)
  afterAll(async () => { await app?.stop(); db?.close() }, 120_000)

  for (const width of WIDTHS) {
    it(`the made-up master of 54 boxes, ${width} x 1000: each gated line has one mark, which covers no card, no line's words and no other mark, and opens its words whole`, async () => {
      await openAt(app, stored.master, 'boxes', width)
      await theMarksCoverNothing(app, 'the made-up master of 54 boxes', width, lines)
    }, CASE_ALLOWANCE)
  }
})
