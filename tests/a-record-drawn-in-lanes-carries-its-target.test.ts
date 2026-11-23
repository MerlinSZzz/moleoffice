// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY ELEMENT OF THE DRAWING IN AREAS THAT DRAWS ONE RECORD CARRIES THAT RECORD'S TARGET. Wave 13u round 230, step 4.
 * The drawing is the one PV-2's page decision puts on a pipeline's page; the made-up office and the reading of the
 * drawing are in tests/a-made-up-office-drawn-in-lanes.ts.
 *
 * WHAT WAS WRONG. At 55c6646fa no lanes card carried a `data-target`. The old graph's cards carry one: `cardTarget` in
 * src/web/components/graph/CardFace.tsx calls `targetAttributes` in src/shared/targets.ts. Without it two things fail,
 * and nothing says so:
 *   - a comment right-clicked onto a lanes card walks past the card, and is filed against the page;
 *   - a step's stored comments draw no comment circle beside its lanes card.
 * At 834f12c03 the cards and heads carried it, but in the outline at 390 the list of words under a heading, which says
 * the heading's record's links, did not. It is the heading's sibling, not its child, so the heading's target does not
 * reach it.
 *
 * THE VALUE IS THE ONE `targetAttributes` GIVES, for the record and the project the page is in. The page's project is
 * the made-up office's, which `prepareThePage` stores, so each expected value is
 * `targetAttributes({ kind: 'record', recordId, workspaceId: PROJECT.id })`. No value is spelled here by hand.
 *
 * WHAT IS PROVED, case by case, on the made-up office, served the built page:
 *   (a) at 1440, on the pipeline drawn in areas and on the master: every card carries its record's target, and every
 *       area's head carries the target of the record that heads the area and no target when no record does. The
 *       pipeline drawn in areas has one area headed by a record: the other pipeline, which holds the step that a link
 *       reaches. The master has one for each block.
 *   (a) at 390, where the drawing is an outline: the same for every card, and for every area's heading, read by the
 *       title the heading draws. The list of words under a heading carries the same target as the heading: its
 *       record's when a record heads the area, and none when no record does. At least one such list is read.
 *   (b) at 1440: a comment stored on a step's block, at its surface, in the shape
 *       tests/a-comment-on-the-drawing-is-one-comment-everywhere.test.ts writes, draws its circle inside that step's
 *       lanes card. The circle is inside the card's box. It is in the card's top-right corner: its right edge and its
 *       top edge are each less than half its width from the card's. It overlaps no other card of the drawing. The owner
 *       chose the corner inside the card, and the drawing's layout does not change for it. Pressing the circle opens the
 *       comment's own words.
 *   (c) at 1440: a right-click on the card, away from its title, opens the composer about the card's record. The
 *       composer's quote names that record's title, and no other drawn record's title or the pipeline's.
 *
 * MUTATION, after a green run: take out the line in src/web/components/graph/lanes/engine.ts that gives a card its
 * target, `carryTarget(card, record);` in `cardElement`, build, and all four cases go red. Both (a) cases fail at the
 * first card they read, whose target is null. (b) fails because no circle is drawn for the step's comment. (c) fails
 * because the composer's quote names the page's surface, "The project structure", and not the step: the right-click
 * walks past the card. Put back with cp, checked with cmp and built again, the file is green.
 *
 * SECOND MUTATION, after a green run: take out `carryTarget(words, record);` in the outline's `areaBlock`, in the same
 * file, build, and (a) at 390 goes red at the master's first heading: the list of words under it carries no target.
 * The other three cases stay green. Put back with cp, checked with cmp and built again, the file is green.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'

import { THE_PERSON } from '../src/shared/person.ts'
import { TARGET_ATTRIBUTE, targetAttributes } from '../src/shared/targets.ts'
import { pipelinePath } from '../src/web/components/router.tsx'
import { liveApp, theAnswerToAWriteInATestOffice, type LiveApp } from './helpers.ts'
import {
  DRAWING,
  PROJECT,
  STEPS,
  TITLES,
  aPlaceOnTheCard,
  buildTheMadeUpOffice,
  cardOf,
  openThePage,
  prepareThePage,
  theAreasWereStored,
  theDrawingIsDrawn,
  writerFor,
  type MadeUpOffice,
} from './a-made-up-office-drawn-in-lanes.ts'

let app: LiveApp
let office: MadeUpOffice

/** The step the comment is on, and the words of the comment. Both are made up. */
const COMMENTED = 'start'
const WORDS = 'An example comment on a step drawn in areas (made up).'

beforeAll(async () => {
  app = await liveApp({ name: 'lanes-target', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  const write = writerFor(app, PROJECT.id)
  office = await buildTheMadeUpOffice(write)
  await prepareThePage(app, PROJECT.id)

  // AN AGENT TO SEND THE COMMENT TO, and the comment, in the shape the comment test writes. A person's message to an
  // agent is answered as theAnswerToAWriteInATestOffice says, and the record is in the answer either way.
  await write.call('POST', '/api/records', {
    kind: 'agent',
    title: 'Example reader (made up)',
    data: { handle: 'made-up-reader', runtime: 'claude-code', state: 'active' },
  })
  const comment = {
    kind: 'message',
    title: WORDS,
    data: {
      body: WORDS,
      target: { target: { kind: 'record', recordId: office.id[COMMENTED]!, workspaceId: PROJECT.id }, place: { at: 'surface' } },
      to: [{ kind: 'agent', id: 'made-up-reader' }],
      sentBy: { kind: 'person', id: THE_PERSON },
    },
  }
  const written = await write.attempt('POST', '/api/records', comment)
  expect(written.status, written.text).toBe(theAnswerToAWriteInATestOffice({ 'x-mole-office-actor-type': 'human' }, comment))
  expect((JSON.parse(written.text) as { record?: { id?: unknown } }).record?.id, `the comment is stored: ${written.text}`).toEqual(expect.any(String))
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

/** The target `targetAttributes` gives a record of the made-up office, in the project the page is in. */
function targetOf(recordId: string): string {
  return targetAttributes({ kind: 'record', recordId, workspaceId: PROJECT.id })[TARGET_ATTRIBUTE]!
}

interface Carried {
  cards: { id: string; target: string | null }[]
  /** Each area's head at 1440: the record that heads the area, or null, and the target its head carries. */
  heads: { key: string; record: string | null; target: string | null }[]
  /**
   * Each area's heading in the outline at 390: the words it draws and the target it carries, and the target carried by
   * the list drawn under it that says its record's links, or no list.
   */
  headings: { text: string; target: string | null; words: { target: string | null } | null }[]
}

async function theTargetsCarried(page: Page): Promise<Carried> {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector)
    if (root === null) return { cards: [], heads: [], headings: [] }
    const heads = [...root.querySelectorAll('[data-head-of]')]
    return {
      cards: [...root.querySelectorAll('.e-card')].map((card) => ({ id: card.getAttribute('data-id') ?? '', target: card.getAttribute('data-target') })),
      heads: [...root.querySelectorAll('.e-area')].flatMap((area) => {
        const key = area.getAttribute('data-key') ?? ''
        const head = heads.find((one) => one.getAttribute('data-head-of') === key)
        return head === undefined ? [] : [{ key, record: area.getAttribute('data-head'), target: head.getAttribute('data-target') }]
      }),
      headings: [...root.querySelectorAll('.e-outline-area > h3, .e-outline-area > h4')].map((heading) => {
        const words = heading.parentElement?.querySelector(':scope > .e-said') ?? null
        return {
          text: (heading.textContent ?? '').replace(/\s+/g, ' ').trim(),
          target: heading.getAttribute('data-target'),
          words: words === null ? null : { target: words.getAttribute('data-target') },
        }
      }),
    }
  }, DRAWING)
}

function everyCardCarriesItsTarget(carried: Carried, where: string): void {
  expect(carried.cards.length, `${where}: cards to read`).toBeGreaterThan(0)
  for (const card of carried.cards) expect(card.target, `${where}: the card of ${card.id} carries its record's target`).toBe(targetOf(card.id))
}

/** The pages read, with the records whose titles head an area on each. */
const PAGES = [
  { what: 'the pipeline drawn in areas', page: 'drawn', heads: ['other'] },
  { what: 'the master', page: 'master', heads: ['master-first', 'master-second', 'master-third'] },
] as const

// ========================================================================================================== (a)

it('(a) at 1440: every card and every area head that draws one record carries that record\'s target', async () => {
  theAreasWereStored(office.areas, 'the pipeline drawn in areas')
  for (const one of PAGES) {
    await openThePage(app, pipelinePath(office.id[one.page]!))
    await theDrawingIsDrawn(app.page)
    const carried = await theTargetsCarried(app.page)
    const headed = carried.heads.filter((head) => head.record !== null).map((head) => head.record)
    expect(headed.sort(), `${one.what} at 1440: the areas headed by a record`).toEqual(one.heads.map((key) => office.id[key]!).sort())
    everyCardCarriesItsTarget(carried, `${one.what} at 1440`)
    for (const head of carried.heads) {
      expect(head.target, `${one.what} at 1440: the head of the area "${head.key}"`).toBe(head.record === null ? null : targetOf(head.record))
    }
  }
}, 120_000)

it('(a) at 390: every card and every heading of the outline that draws one record carries that record\'s target', async () => {
  theAreasWereStored(office.areas, 'the pipeline drawn in areas')
  await app.page.setViewportSize({ width: 390, height: 844 })
  try {
    let wordsRead = 0
    for (const one of PAGES) {
      await openThePage(app, pipelinePath(office.id[one.page]!))
      await theDrawingIsDrawn(app.page, { outline: true })
      const carried = await theTargetsCarried(app.page)
      const byTitle = new Map<string, string>(one.heads.map((key) => [TITLES[key], office.id[key]!]))
      expect(carried.headings.map((heading) => heading.text), `${one.what} at 390: the headings`).toEqual(expect.arrayContaining([...byTitle.keys()]))
      everyCardCarriesItsTarget(carried, `${one.what} at 390`)
      for (const heading of carried.headings) {
        const record = byTitle.get(heading.text)
        expect(heading.target, `${one.what} at 390: the heading "${heading.text}"`).toBe(record === undefined ? null : targetOf(record))
        if (heading.words === null) continue
        wordsRead += 1
        expect(heading.words.target, `${one.what} at 390: the words under the heading "${heading.text}"`).toBe(record === undefined ? null : targetOf(record))
      }
    }
    // The master's blocks are joined by blocks links, so its headings have words under them to read.
    expect(wordsRead, 'the lists of words under a heading, read at 390').toBeGreaterThan(0)
  } finally {
    await app.page.setViewportSize({ width: 1440, height: 1000 })
  }
}, 120_000)

// ========================================================================================================== (b)

it('(b) at 1440: a comment on a step draws its circle inside the top-right corner of the step\'s card, on no other card, and the circle opens the comment\'s words', async () => {
  theAreasWereStored(office.areas, 'the pipeline drawn in areas')
  await openThePage(app, pipelinePath(office.id['drawn']!))
  await theDrawingIsDrawn(app.page)
  const circle = `.px-comment-circle[data-comments-on="${targetOf(office.id[COMMENTED]!)}"]`
  const drawn = await app.page.locator(circle).waitFor({ timeout: 30_000 }).then(() => true, () => false)
  expect(drawn, `the comment on the step "${COMMENTED}" draws a circle (${circle})`).toBe(true)
  await app.page.waitForFunction(() => document.documentElement.getAttribute('data-comment-circles') === 'placed', undefined, { timeout: 30_000 })

  const at = await app.page.evaluate(({ drawing, card, circle }) => {
    const box = (element: Element) => {
      const r = element.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width }
    }
    const commented = document.querySelector(card)!
    const others = [...document.querySelectorAll(`${drawing} .e-card`)].filter((one) => one !== commented)
    return {
      card: box(commented),
      circle: box(document.querySelector(circle)!),
      others: others.map((one) => ({ id: one.getAttribute('data-id') ?? '', ...box(one) })),
    }
  }, { drawing: DRAWING, card: cardOf(office.id[COMMENTED]!), circle })
  const said = `the circle ${JSON.stringify(at.circle)} on the card ${JSON.stringify(at.card)}`
  expect(at.circle.left, `${said}: inside the card, by its left edge`).toBeGreaterThanOrEqual(at.card.left - 0.5)
  expect(at.circle.right, `${said}: inside the card, by its right edge`).toBeLessThanOrEqual(at.card.right + 0.5)
  expect(at.circle.top, `${said}: inside the card, by its top edge`).toBeGreaterThanOrEqual(at.card.top - 0.5)
  expect(at.circle.bottom, `${said}: inside the card, by its bottom edge`).toBeLessThanOrEqual(at.card.bottom + 0.5)
  expect(at.card.right - at.circle.right, `${said}: in the card's top-right corner, by the right edge`).toBeLessThan(at.circle.width / 2)
  expect(at.circle.top - at.card.top, `${said}: in the card's top-right corner, by the top edge`).toBeLessThan(at.circle.width / 2)
  expect(at.others.length, `${said}: the other cards of the drawing, to read`).toBeGreaterThan(0)
  for (const other of at.others) {
    const overlaps = at.circle.left < other.right && other.left < at.circle.right && at.circle.top < other.bottom && other.top < at.circle.bottom
    expect(overlaps, `${said}: on no other card, so not on the card of ${other.id} ${JSON.stringify(other)}`).toBe(false)
  }

  await app.page.click(circle)
  const opened = await app.page
    .waitForFunction((words) => (document.querySelector('.px-pane')?.textContent ?? '').includes(words), WORDS, { timeout: 30_000 })
    .then(() => true, () => false)
  expect(opened, `pressing the circle opens the comment's own words; the pane says: ${(await app.page.locator('.px-pane').first().textContent().catch(() => null)) ?? '(no pane)'}`).toBe(true)
}, 120_000)

// ========================================================================================================== (c)

it('(c) at 1440: a right-click on a card opens the composer about the card\'s record', async () => {
  theAreasWereStored(office.areas, 'the pipeline drawn in areas')
  await openThePage(app, pipelinePath(office.id['drawn']!))
  await theDrawingIsDrawn(app.page)
  const place = await aPlaceOnTheCard(app.page, office.id[COMMENTED]!)
  await app.page.mouse.click(place.x, place.y, { button: 'right' })
  const quote = '.px-talk .px-talk-quote .px-talk-chip-what'
  await app.page.locator(quote).first().waitFor({ timeout: 30_000 })
  const named = (await app.page.locator(quote).first().getAttribute('title')) ?? (await app.page.locator(quote).first().textContent()) ?? ''
  try {
    expect(named, 'the composer names the card\'s record').toContain(`Example step ${COMMENTED} (made up)`)
    for (const step of STEPS.filter((one) => one.name !== COMMENTED)) expect(named, 'and no other step').not.toContain(`Example step ${step.name} (made up)`)
    expect(named, 'and not the pipeline').not.toContain(TITLES.drawn)
  } finally {
    await app.page.keyboard.press('Escape')
  }
}, 120_000)
