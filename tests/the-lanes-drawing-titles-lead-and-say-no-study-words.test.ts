// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CARD'S TITLE LEADS WHERE PV-2'S PAGE DECISION SAYS, AND NONE OF THE STUDY'S WORDS IS ON THE PAGE. Wave 13u round
 * 230, PV-2, criteria 5 and 6, and a card's title in its card. The made-up office and the reading of the drawing are in
 * tests/a-made-up-office-drawn-in-lanes.ts. Every address is built by pipelinePath and recordPath in
 * src/web/components/router.tsx, the one place each is built.
 *
 * WHERE A TITLE LEADS, from the decision's third point: a box on the master's Boxes level opens the block pipeline
 * whose stored steps hold it; a step that exactly one pipeline is part_of opens that pipeline, so on the master's Steps
 * level each step opens its block pipeline; a card of another pipeline's step opens that pipeline; anything else opens
 * the record's own page.
 *
 * THE STUDY'S WORDS. PV-2's look was drawn first in a study, with sentences about the study itself. Each one is listed
 * here, and the test looks on the page for the pieces of it in brackets, in any case:
 *   - "People, outside parts, area headings, line words and short lines were written for this design from the 13
 *     November diagram." ("written for this design", "13 november diagram"; and no .e-credit or .e-outline-credit,
 *     the two places the study drew it)
 *   - "Not placed: not in the 13 November diagram" ("13 november diagram")
 *   - "Throwaway copy: Desktop window is blocked, Web UI has a hard gate to it, Office-map plugin has no recorded
 *     state, and three Not placed titles omit repeated words. This pass widens People and rearranges the areas and
 *     suite line. Office records are unchanged." ("throwaway", "this pass widens", "office records are unchanged")
 *   - "The same throwaway master, at its Steps level. States and counts come from the read-only round 224 database
 *     copy." ("throwaway", "round 224 database copy")
 *   - "The office's example records, in a throwaway office." ("throwaway")
 *   - "The 13 November diagram has a card “Route groups” inside the API server. It is not drawn here, because no stored
 *     record holds it." ("13 november diagram", "route groups")
 *
 * TEXT SIZE. Every visible piece of text in the drawing is 12 px or more at rest at 1440, measured as it is drawn: its
 * computed font size times the drawing's scale, from the screen matrix of an SVG element and, for an HTML one, from the
 * product of the scales of the computed transforms from it up to the root. Text under a CSS zoom or scale property is
 * named as unmeasured and fails the case. There is no exception: the wave's supervisor said so for round 230. Text
 * that is hidden, or drawn in a box one pixel wide or less, is not visible and is not measured.
 *
 * A TITLE IN ITS CARD, a criterion the wave's supervisor set in round 230. At b3d219e8c the supervisor found the
 * master's Boxes level drawn with cards 132 units wide at 1440, and a box's long title word running on under the
 * card's marks: its block badge and its state mark. A title may shrink below its words, and a long word does not
 * break, so its box held the start of the word and the rest ran out of it. This file stores one more step for it, in
 * the other pipeline, with the one-word title ONE_WORD below, which is made up. On the master's Boxes level that step
 * is a box with its block's badge beside its title. For every card of every drawing this file opens, at 1440 by 1000
 * in light, the title's text lies inside the title's own box: its scrollWidth is at most its clientWidth. And no box
 * of its text, read as the client rects of a Range over the title, overlaps the box of the card's .e-marks by more
 * than half a pixel each way. Each card that fails is named by its title, with its numbers.
 *
 * WHAT IS PROVED, case by case:
 *   1. criterion 5: on the master's Boxes level, the title of a box of each of two block pipelines opens that block
 *      pipeline: the address becomes its address and its drawing draws, with that box among its cards;
 *   2. criterion 5: on the master's Steps level, a step's title opens its block pipeline in the same way;
 *   3. criterion 5: on a block pipeline's page, the title of the card of another pipeline's step opens that pipeline;
 *   4. criterion 5: on a block pipeline's page, the title of a step no pipeline is part_of opens the step's own page;
 *   5. criterion 5: a card's title is an a.e-title with an address, Tab from its card reaches it, and it is underlined
 *      on keyboard focus and on hover (its computed text-decoration-line);
 *   6, 7. criterion 6, at 1440 and at 390: on the master's page and on the page of the pipeline drawn in areas, with
 *      the drawing drawn, the page's text holds none of the pieces above, and no .e-credit or .e-outline-credit is
 *      drawn;
 *   8. criterion 6: on the master at its Boxes level and at its Steps level, and on the pipeline drawn in areas, at
 *      1440, every visible piece of text in the drawing is 12 px or more, and none stands under a CSS zoom or scale
 *      property the measure cannot read;
 *   9. a title in its card: on the master at its Boxes level and at its Steps level, on the pipeline drawn in areas,
 *      on the pipeline with no areas stored and on the other pipeline, at 1440, every card's title stays inside its
 *      own box and clear of the card's marks, as above; and the master's Boxes level draws the box with the one-word
 *      title whole, with a block badge beside it.
 *
 * MUTATIONS, wave 13u round 230, each run after a control run of this file at 12cd2330e in which cases 3-8 were green
 * and cases 1 and 2 red, each file copied first and restored with cp and checked with cmp. Cases 1 and 2 were red at
 * that commit because the master's drawing was still changing after 10 seconds, a page fault the wave's supervisor
 * sent to a fix of its own. They were red under each mutation below as at the control. At the round's join, 0ae3cb286,
 * which carries the fix worker's two Code commits (209a0a0f6, room for lines across a row; 0ae3cb286, a faster route
 * search), and with fa72c4f2e's wait for the drawing a title was pressed on, all eight cases are green. The mutations
 * of criterion 5, each fix put back, were the fix worker's to run, and are not listed here. The line numbers below
 * are as at 12cd2330e.
 *   - src/web/components/graph/lanes/styles.ts:181 and 222, the key's font-size 12px written as 11.5px: case 8 red,
 *     naming the key's nine pieces at 11.50 px; 3-7 green;
 *   - src/web/components/graph/lanes/engine.ts:1491, the drawing's world drawn at scale(zoom * 0.9): case 8 red,
 *     naming 53 pieces at 11.70 px; 3-7 green;
 *   - src/web/components/graph/lanes/engine.ts:1214, a p.e-credit appended to the drawing saying "People were written
 *     for this design from the 13 November diagram.": cases 6 and 7 red, at 1440 and at 390; 3-5 and 8 green.
 *
 * CASE 9, run on 15 November 2026 before it was committed, at b3d219e8c, the trial join of the round's work up to
 * then: case 9 red, cases 1 to 8 green. Eight cards were named, in 16 entries: each once for its text running out of
 * its title's box, and once for its text lying over the card's marks.
 *   - The one-word box on the master's Boxes level, where cards were 340 units wide: its text was 300 units wide in a
 *     title box 279 units wide, and lay over the marks by 17.4 by 18.0 px. The same step on the other pipeline's page,
 *     on a card 340 units wide: 300 units in 291, over the marks by 5.5 by 18.0 px.
 *   - Six steps of the pipeline with no areas stored, drawn with cards 104 units wide: in each, the widest word of the
 *     title was 60 units wide, in a title box 53 or 55 units wide, and lay over the marks by 1.4 or 3.4 px.
 * The master's Steps level, with cards 340 units wide, and the pipeline drawn in areas, with cards 224 units wide, had
 * no card named.
 * MUTATIONS for case 9: none yet. The fix worker's width rule is taken out once its Code is committed.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'

import { pipelinePath, recordPath } from '../src/web/components/router.tsx'
import { liveApp, type LiveApp } from './helpers.ts'
import {
  DRAWING,
  PROJECT,
  buildTheMadeUpOffice,
  cardOf,
  openThePage,
  prepareThePage,
  readTheCards,
  readTheDrawing,
  theAreasWereStored,
  theDrawingHoldsStill,
  theDrawingIsDrawn,
  writerFor,
  type MadeUpOffice,
} from './a-made-up-office-drawn-in-lanes.ts'

/** The pieces of the study's sentences, as the header lists them. */
const STUDY_WORDS = [
  'written for this design',
  '13 november diagram',
  'throwaway',
  'this pass widens',
  'office records are unchanged',
  'round 224 database copy',
  'route groups',
] as const

const SMALLEST = 12

/** The one-word title of case 9's box: one long word, made up, which says so. */
const ONE_WORD = 'Madeupexampleboxtitlewrittenasoneword'

let app: LiveApp
let office: MadeUpOffice
/** The id of the step stored with the one-word title, once it is stored. */
let oneWord = ''

beforeAll(async () => {
  app = await liveApp({ name: 'lanes-titles', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  const write = writerFor(app, PROJECT.id)
  office = await buildTheMadeUpOffice(write)
  const made = (await write.call('POST', `/api/records/${office.id['other']!}/blocks`, { name: ONE_WORD, state: 'todo' })) as { record: { id: string } }
  oneWord = made.record.id
  await prepareThePage(app, PROJECT.id)
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

const titleOf = (key: string) => app.page.locator(`${cardOf(office.id[key]!)} .e-title`)

async function openTheMaster(level: 'boxes' | 'steps'): Promise<void> {
  await openThePage(app, pipelinePath(office.id['master']!))
  await theDrawingIsDrawn(app.page)
  if (level === 'steps') {
    await app.page.locator('[data-level-control] [data-level="steps"]').click()
    await app.page.locator(`${DRAWING}[data-level="steps"]`).waitFor({ timeout: 10_000 })
    await theDrawingHoldsStill(app.page)
  }
}

/**
 * Presses a card's title and waits for the pipeline it opens to be drawn with one of its records as a card. The title
 * changes the address within the same page, and the page draws the new pipeline in a new element and takes the old one
 * away. So the drawing the title was pressed on is waited out first: until it has left the page, it would be read as
 * the new pipeline's drawing.
 */
async function theTitleOpensThePipeline(key: string, pipeline: string, card: string): Promise<void> {
  const before = await app.page.locator(DRAWING).elementHandle()
  await titleOf(key).click()
  await app.page.waitForURL(`**#${pipelinePath(office.id[pipeline]!)}`, { timeout: 30_000 })
  await expect
    .poll(() => before.evaluate((element) => element.isConnected), { message: `the drawing the title of ${key} was pressed on has left the page`, timeout: 30_000 })
    .toBe(false)
  await theDrawingIsDrawn(app.page)
  const ids = (await readTheCards(app.page)).map((one) => one.id)
  expect(ids, `the drawing of ${pipeline}, opened from the title of ${key}, has ${card} among its cards`).toContain(office.id[card])
}

it('criterion 5: on the master’s Boxes level, a box’s title opens its block pipeline', async () => {
  theAreasWereStored(office.areas, 'the pipeline drawn in areas')
  for (const [box, pipeline] of [['start', 'drawn'], ['plain-next', 'plain']] as const) {
    await openTheMaster('boxes')
    await theTitleOpensThePipeline(box, pipeline, box)
  }
}, 120_000)

it('criterion 5: on the master’s Steps level, a step’s title opens its block pipeline', async () => {
  await openTheMaster('steps')
  await theTitleOpensThePipeline('master-second', 'plain', 'plain-start')
}, 120_000)

it('criterion 5: the title of another pipeline’s step opens that pipeline', async () => {
  theAreasWereStored(office.areas, 'the pipeline drawn in areas')
  await openThePage(app, pipelinePath(office.id['drawn']!))
  await theDrawingIsDrawn(app.page)
  await theTitleOpensThePipeline('elsewhere', 'other', 'elsewhere')
}, 120_000)

it('criterion 5: the title of a step that no pipeline is part_of opens the step’s own page', async () => {
  theAreasWereStored(office.areas, 'the pipeline drawn in areas')
  await openThePage(app, pipelinePath(office.id['drawn']!))
  await theDrawingIsDrawn(app.page)
  await titleOf('top').click()
  await app.page.waitForURL(`**#${recordPath(office.id['top']!, 'block')}`, { timeout: 30_000 })
}, 120_000)

it('criterion 5: a title is reached by Tab from its card, and is underlined on keyboard focus and on hover', async () => {
  theAreasWereStored(office.areas, 'the pipeline drawn in areas')
  await openThePage(app, pipelinePath(office.id['drawn']!))
  await theDrawingIsDrawn(app.page)
  const titles = (await readTheDrawing(app.page)).cards.find((card) => card.id === office.id['start'])?.titles ?? []
  expect(titles.map((title) => title.tag), 'the card start has one title, a link').toEqual(['a'])
  expect(titles[0]!.href, 'the title of the card start has an address').toBeTruthy()

  await app.page.locator(cardOf(office.id['start']!)).focus()
  await app.page.keyboard.press('Tab')
  const focus = await app.page.evaluate(
    (selector) => {
      const now = document.activeElement
      return now !== null && now.matches(selector) ? getComputedStyle(now).textDecorationLine : null
    },
    `${cardOf(office.id['start']!)} .e-title`,
  )
  expect(focus, 'Tab from the card start reaches its title').not.toBeNull()
  expect(focus, 'the title is underlined on keyboard focus').toContain('underline')

  await titleOf('next').hover()
  const hover = await titleOf('next').evaluate((title) => getComputedStyle(title).textDecorationLine)
  expect(hover, 'the title is underlined on hover').toContain('underline')
}, 120_000)

for (const size of [
  { width: 1440, height: 1000, outline: false },
  { width: 390, height: 844, outline: true },
] as const) {
  it(`criterion 6: none of the study's words is on the master's page or a block pipeline's page, at ${String(size.width)}`, async () => {
    theAreasWereStored(office.areas, 'the pipeline drawn in areas')
    await app.page.setViewportSize({ width: size.width, height: size.height })
    try {
      for (const pipeline of ['master', 'drawn']) {
        await openThePage(app, pipelinePath(office.id[pipeline]!))
        await theDrawingIsDrawn(app.page, { outline: size.outline })
        const text = (await app.page.locator('body').innerText()).toLowerCase()
        for (const words of STUDY_WORDS) expect(text, `the page of ${pipeline} at ${String(size.width)} says "${words}"`).not.toContain(words)
        expect(await app.page.locator('.e-credit, .e-outline-credit').count(), `a study credit on the page of ${pipeline} at ${String(size.width)}`).toBe(0)
      }
    } finally {
      await app.page.setViewportSize({ width: 1440, height: 1000 })
    }
  }, 120_000)
}

it(`criterion 6: every visible piece of text in the drawing is ${String(SMALLEST)} px or more at rest, at 1440`, async () => {
  theAreasWereStored(office.areas, 'the pipeline drawn in areas')
  const drawings = [
    { where: 'the master at its Boxes level', open: () => openTheMaster('boxes') },
    { where: 'the master at its Steps level', open: () => openTheMaster('steps') },
    {
      where: 'the pipeline drawn in areas',
      open: async () => {
        await openThePage(app, pipelinePath(office.id['drawn']!))
        await theDrawingIsDrawn(app.page)
      },
    },
  ]
  for (const drawing of drawings) {
    await drawing.open()
    const sizes = await app.page.evaluate(({ selector, smallest }) => {
      const root = document.querySelector(selector)
      if (root === null) return null
      const small: string[] = []
      const unseen: string[] = []
      let measured = 0
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const words = (node.textContent ?? '').replace(/\s+/g, ' ').trim()
        const element = node.parentElement
        if (words === '' || element === null) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        if (![...range.getClientRects()].some((box) => box.width > 1 && box.height > 1)) continue
        if (getComputedStyle(element).visibility !== 'visible') continue
        let seen = true
        for (let up: Element | null = element; up !== null; up = up.parentElement) if (Number(getComputedStyle(up).opacity) === 0) seen = false
        if (!seen) continue
        // THE SCALE, WITH NO WHOLE-PIXEL ROUNDING. An SVG element's comes from its screen matrix. An HTML element's is the
        // product of the scale of every computed transform from the element up to the root, each read as Math.hypot(a, b)
        // of its matrix: the drawing scales its world with a transform, and a computed transform is exact. The drawn width
        // over offsetWidth, used before, is not: offsetWidth is a whole number, so a 12 px word in a world at scale 1
        // measured 11.89 to 11.99 when its box's width rounded up. A CSS zoom or scale property on the way up is a scale
        // this product cannot see, so the text under one is named and the case fails.
        let scale = 1
        if (element instanceof SVGGraphicsElement) {
          const matrix = element.getScreenCTM()
          if (matrix !== null) scale = Math.hypot(matrix.a, matrix.b)
        } else {
          for (let up: Element | null = element; up !== null; up = up.parentElement) {
            const style = getComputedStyle(up)
            if (style.transform !== 'none') {
              const matrix = new DOMMatrixReadOnly(style.transform)
              scale *= Math.hypot(matrix.a, matrix.b)
            }
            if ((style.zoom !== '' && style.zoom !== '1' && style.zoom !== 'normal') || (style.scale !== '' && style.scale !== 'none')) {
              unseen.push(`"${words.slice(0, 40)}" under <${up.tagName.toLowerCase()} class="${up.getAttribute('class') ?? ''}"> with zoom ${style.zoom} and scale ${style.scale}`)
            }
          }
        }
        const drawn = Number.parseFloat(getComputedStyle(element).fontSize) * scale
        measured += 1
        if (drawn < smallest - 0.01) small.push(`"${words.slice(0, 40)}" at ${drawn.toFixed(2)} px`)
      }
      return { measured, small, unseen }
    }, { selector: DRAWING, smallest: SMALLEST })
    expect(sizes, `${drawing.where}: a drawing to measure`).not.toBeNull()
    expect(sizes!.measured, `${drawing.where}: pieces of text measured`).toBeGreaterThan(0)
    expect(sizes!.unseen, `${drawing.where}: text under a CSS zoom or scale property, which this measure cannot read`).toEqual([])
    expect(sizes!.small, `${drawing.where}: text drawn under ${String(SMALLEST)} px`).toEqual([])
  }
}, 120_000)

it('a title in its card: on every drawing this file opens, at 1440, each card’s title stays inside its own box and clear of the card’s marks, the one-word box title beside a block badge among them', async () => {
  theAreasWereStored(office.areas, 'the pipeline drawn in areas')
  const opened = (pipeline: string) => async () => {
    await openThePage(app, pipelinePath(office.id[pipeline]!))
    await theDrawingIsDrawn(app.page)
  }
  const drawings = [
    { where: 'the master at its Boxes level', open: () => openTheMaster('boxes') },
    { where: 'the master at its Steps level', open: () => openTheMaster('steps') },
    { where: 'the pipeline drawn in areas', open: opened('drawn') },
    { where: 'the pipeline with no areas stored', open: opened('plain') },
    { where: 'the other pipeline', open: opened('other') },
  ]
  const failing: string[] = []
  let theBox: { badges: number; text: string } | null = null
  for (const drawing of drawings) {
    await drawing.open()
    const cards = await app.page.evaluate((selector) => {
      const read = []
      for (const card of document.querySelectorAll<HTMLElement>(`${selector} .e-card`)) {
        const title = card.querySelector<HTMLElement>('.e-title')
        if (title === null) continue
        const marks = card.querySelector<HTMLElement>('.e-marks')
        // The box of the title's text: one client rect for each line of it, drawn where the text runs, past the title's
        // own box when it runs on.
        const range = document.createRange()
        range.selectNodeContents(title)
        const lines = [...range.getClientRects()].filter((box) => box.width > 0 && box.height > 0)
        const at = marks?.getBoundingClientRect() ?? null
        const over = at === null ? [] : lines
          .map((box) => ({ x: Math.min(box.right, at.right) - Math.max(box.left, at.left), y: Math.min(box.bottom, at.bottom) - Math.max(box.top, at.top) }))
          .filter((both) => both.x > 0.5 && both.y > 0.5)
          .map((both) => `${both.x.toFixed(1)} by ${both.y.toFixed(1)} px`)
        read.push({
          id: card.dataset['id'] ?? '',
          text: (title.textContent ?? '').replace(/\s+/g, ' ').trim(),
          scroll: title.scrollWidth,
          client: title.clientWidth,
          width: card.offsetWidth,
          badges: marks?.querySelectorAll('.e-badge').length ?? 0,
          over,
        })
      }
      return read
    }, DRAWING)
    expect(cards.length, `${drawing.where}: cards with a title`).toBeGreaterThan(0)
    const one = cards.find((card) => card.id === oneWord)
    const widths = [...new Set(cards.map((card) => card.width))].join(', ')
    const box = one === undefined ? '' : `; the one-word title's text ${String(one.scroll)} units wide in a box ${String(one.client)} wide`
    console.log(`${drawing.where}: ${String(cards.length)} cards, ${widths} units wide${box}${one === undefined ? '' : `, ${String(one.badges)} badge(s) beside it`}`)
    if (drawing.where === 'the master at its Boxes level' && one !== undefined) theBox = { badges: one.badges, text: one.text }
    for (const card of cards) {
      if (card.scroll > card.client) {
        failing.push(`${drawing.where}, "${card.text}": its text is ${String(card.scroll)} units wide in a title box ${String(card.client)} units wide, on a card ${String(card.width)} units wide`)
      }
      if (card.over.length > 0) failing.push(`${drawing.where}, "${card.text}": its text lies over the card's marks by ${card.over.join(', ')}`)
    }
  }
  expect(theBox, "the master's Boxes level draws the box with the one-word title").not.toBeNull()
  expect(theBox!.text, 'the box draws the one-word title whole').toBe(ONE_WORD)
  expect(theBox!.badges, "the box's block badge is beside its title").toBeGreaterThan(0)
  expect(failing, 'cards whose title runs out of its own box or under the card’s marks').toEqual([])
}, 180_000)
