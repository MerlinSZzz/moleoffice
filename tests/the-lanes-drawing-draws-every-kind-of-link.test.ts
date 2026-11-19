// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DRAWING IN AREAS DRAWS EVERY KIND OF LINK. Wave 13u round 230, PV-2, criterion 1: "each kind of link is drawn".
 * The drawing is the one that PV-2's page decision puts on a pipeline's page; the office and the reading of the drawing are
 * in tests/a-made-up-office-drawn-in-lanes.ts.
 *
 * THE OFFICE: a made-up master of three blocks, with a block pipeline hung on each. The first block's pipeline has
 * areas stored; the second has the same steps, modules and links with no areas stored; the third holds one step that
 * a step of each of the first two waits on. Between the records of each of the first two: a waits-on link through a
 * hard gate, one through a partial gate and one with no gate; a feeds link carrying words, and a feeds link back, so
 * two steps are linked both ways (the office stores a feeds link only between two steps); a consumes link; a measures
 * link; three implements links; a step that waits on a step placed below it, so its line goes up; two steps that wait
 * on each other; and a consumes link to an idea, which no drawing draws.
 *
 * A LOOP IS TWO STEPS. The office refuses a link from a record to itself ("A record cannot link to itself.", in
 * createLink in src/server/lib/records.ts). Case 3 sends one, expects that refusal, and draws the loop the office can
 * hold: two steps, each waiting on the other. The wave's supervisor agreed this for round 230.
 *
 * WHAT IS PROVED, case by case:
 *   1. on the pipeline drawn in areas, every link between drawn records is named in data-drawn-links or in
 *      data-on-selection, each link named at rest has a line of its own type with two points or more, each implements
 *      link is named for a selection of a card at one of its ends, and the words a feeds link carries are on the
 *      drawing;
 *   2. each link named only for a selection, the implements links among them, gets a line of two points or more once a
 *      card at either of its ends is selected, and loses it when Escape clears the selection;
 *   3. the shapes: the office refuses a link from a step to itself; the step that waits on a step placed below it is
 *      drawn above it, with its line; both lines of the two records linked both ways are drawn; both lines of the loop
 *      are drawn; and the step of another pipeline is a card lying inside the rectangle of an area headed by that
 *      pipeline, drawn after every stored area, with its line;
 *   4. the same pipeline with no areas stored names and draws every one of its links in the same way as case 1, and
 *      draws none of the other pipeline's areas;
 *   5. the link to the idea is drawn neither at rest nor for a selection, and the developer view names it with the
 *      idea's title, in a line of lanesInput.linkNotDrawn; the normal view's said section does not (16 November 2026);
 *   6. the master's page opens at its Boxes level, with the Boxes button pressed and every step of every block
 *      pipeline a card; pressing Steps draws the master's three steps and no box, with both waits-on lines.
 *
 * WHAT IT CANNOT PROVE: a link the drawing marks as inferred. The links door stores no `inferred` flag, so every link
 * this office writes is stored as stated, and no line here can carry data-inferred.
 *
 * MUTATIONS, wave 13u round 230, each run after a control run of this file at 12cd2330e in which cases 3-6 were green
 * and cases 1 and 2 red, each file copied first and restored with cp and checked with cmp. Cases 1 and 2 were red at
 * that commit because the page drew no line for the consumes link, a page fault the wave's supervisor sent to a fix
 * of its own. They were red under each mutation below as at the control. At the round's join, 0ae3cb286, which
 * carries the fix worker's two Code commits (209a0a0f6, room for lines across a row; 0ae3cb286, a faster route
 * search), all six cases are green. Their own mutation, each fix put back, was the fix worker's to run, and is not
 * listed here. The line numbers below are as at 12cd2330e.
 *   - src/web/components/graph/lanes/engine.ts:1125, `if (link.type === "measures") continue;` at the top of
 *     linksOf's loop: case 4 red, the measures link not named. Case 3 went red as well, which was not planned: with
 *     the measures link left out, the link to the other pipeline's step got no line either. That is the router's
 *     doing, sent to the wave's supervisor; case 3 is right to fail when a line is missing;
 *   - src/web/components/graph/lanes/engine.ts:1125, linksOf skipping a link whose reverse stands earlier in the
 *     snapshot's links: case 3 red (the feeds link back has no line), and cases 1, 2 and 4 red on the link back of the
 *     loop;
 *   - src/web/components/graph/lanes/from-records.ts:365, the linkNotDrawn sentence given an empty to and far, so the
 *     idea's title is not said: case 5 red, 3, 4 and 6 green;
 *   - src/web/pages/PipelinePage.tsx:553, the level starting at 'steps' instead of 'boxes': case 6 red, 3-5 green.
 *
 * CASE 5 IN THE DEVELOPER VIEW, SINCE 16 NOVEMBER 2026. Until then the body section after the pipeline's own body named
 * the link not drawn, for every reader. The decision of that day, which the secretary filed from the owner's words,
 * moves the drawing's sentences about links it
 * could not draw to the developer view only (tests/a-pipeline-page-in-the-developer-view.ts). So case 5 reads the line
 * there, with its key, and asks that the normal view's said section does not hold the idea's title.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'

import { pipelinePath } from '../src/web/components/router.tsx'
import { liveApp, type LiveApp } from './helpers.ts'
import {
  AREAS,
  CARRIED,
  DRAWING,
  LINKS,
  MODULES,
  PROJECT,
  SAID,
  STEPS,
  TITLES,
  UNDRAWABLE,
  aPlaceOnTheCard,
  buildTheMadeUpOffice,
  cardOf,
  openThePage,
  prepareThePage,
  readTheDrawing,
  theAreasWereStored,
  theDrawingHoldsStill,
  theDrawingIsDrawn,
  writerFor,
  type DrawnPath,
  type MadeUpOffice,
  type TheDrawing,
} from './a-made-up-office-drawn-in-lanes.ts'
import { DEVELOPER, openInTheDeveloperView, theDeveloperLines } from './a-pipeline-page-in-the-developer-view.ts'

let app: LiveApp
let office: MadeUpOffice

beforeAll(async () => {
  app = await liveApp({ name: 'lanes-every-link', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  office = await buildTheMadeUpOffice(writerFor(app, PROJECT.id))
  await prepareThePage(app, PROJECT.id)
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

/** The lines drawn for one link, each of two points or more. */
function theLinesOf(drawing: TheDrawing, linkId: string, what: string): DrawnPath[] {
  const lines = drawing.paths.filter((path) => path.link === linkId)
  expect(lines.length, `${what} has a line on the drawing`).toBeGreaterThan(0)
  for (const line of lines) expect(line.points.length, `${what}: its line has two points or more`).toBeGreaterThanOrEqual(2)
  return lines
}

const namedForASelection = (drawing: TheDrawing): Set<string> => new Set(Object.values(drawing.onSelection).flat())

/** Cases 1 and 4: every link of one made-up pipeline, by the prefix its keys carry. */
function everyLinkIsNamedAndDrawn(drawing: TheDrawing, prefix: string): void {
  const forASelection = namedForASelection(drawing)
  for (const one of LINKS) {
    const key = `${prefix}${one.key}`
    const linkId = office.link[key]!
    const what = `${one.shows} (${key}, ${one.type})`
    const atRest = drawing.drawnLinks.includes(linkId)
    expect(atRest || forASelection.has(linkId), `${what} is named in data-drawn-links or data-on-selection`).toBe(true)
    if (atRest) for (const line of theLinesOf(drawing, linkId, what)) expect(line.type, `${what}: the type its line says`).toBe(one.type)
    if (one.type === 'implements') {
      const ends = [office.ends[key]!.from, office.ends[key]!.to].map((end) => office.id[end]!)
      expect(
        ends.some((end) => drawing.onSelection[end]?.includes(linkId) === true),
        `${what} is named in data-on-selection under a card at one of its ends`,
      ).toBe(true)
    }
  }
  expect(drawing.text, `the words the feeds link carries ("${CARRIED}") are on the drawing`).toContain(CARRIED)
}

it('criterion 1: on the pipeline drawn in areas, every link between drawn records is named, each named at rest has its line, and a feeds line has its words', async () => {
  theAreasWereStored(office.areas, 'the pipeline drawn in areas')
  await openThePage(app, pipelinePath(office.id['drawn']!))
  await theDrawingIsDrawn(app.page)
  const drawing = await readTheDrawing(app.page)
  expect(drawing.level, 'a pipeline that is not the master is drawn at its Steps level').toBe('steps')
  everyLinkIsNamedAndDrawn(drawing, '')
}, 120_000)

it('criterion 1: a link named only for a selection, implements among them, gets its line once a card at either end is selected', async () => {
  theAreasWereStored(office.areas, 'the pipeline drawn in areas')
  await openThePage(app, pipelinePath(office.id['drawn']!))
  await theDrawingIsDrawn(app.page)
  const atRest = await readTheDrawing(app.page)
  const onlyForASelection = LINKS.filter((one) => !atRest.drawnLinks.includes(office.link[one.key]!))
  expect(onlyForASelection.map((one) => one.key), 'the implements links are among the links drawn only for a selection').toEqual(
    expect.arrayContaining(['implements', 'implements-writer', 'implements-counter']),
  )
  for (const one of onlyForASelection) {
    const linkId = office.link[one.key]!
    for (const end of [one.from, one.to]) {
      const card = office.id[end]!
      const place = await aPlaceOnTheCard(app.page, card)
      await app.page.mouse.click(place.x, place.y)
      await app.page.locator(`${DRAWING}[data-selected="${card}"]`).waitFor({ timeout: 10_000 })
      await theDrawingHoldsStill(app.page)
      theLinesOf(await readTheDrawing(app.page), linkId, `${one.shows} (${one.key}), with the card ${end} selected`)
      await app.page.keyboard.press('Escape')
      await app.page.locator(`${DRAWING}:not([data-selected])`).waitFor({ timeout: 10_000 })
      await theDrawingHoldsStill(app.page)
      const cleared = await readTheDrawing(app.page)
      expect(cleared.paths.some((path) => path.link === linkId), `${one.key} has no line once Escape clears the selection`).toBe(false)
    }
  }
}, 120_000)

it('criterion 1: the shapes: no link to itself, an upward line, two records linked both ways, a loop, and a step of another pipeline', async () => {
  expect(office.selfLink.ok, `a link from a step to itself is refused: ${office.selfLink.text}`).toBe(false)
  expect(office.selfLink.text, 'the refusal of a link from a step to itself says why').toContain('cannot link to itself')
  theAreasWereStored(office.areas, 'the pipeline drawn in areas')
  await openThePage(app, pipelinePath(office.id['drawn']!))
  await theDrawingIsDrawn(app.page)
  const drawing = await readTheDrawing(app.page)
  const lineOf = (key: string): DrawnPath[] => theLinesOf(drawing, office.link[key]!, key)

  const top = await app.page.locator(cardOf(office.id['top']!)).boundingBox()
  const bottom = await app.page.locator(cardOf(office.id['bottom']!)).boundingBox()
  expect(top !== null && bottom !== null, 'the cards of the steps top and bottom are drawn').toBe(true)
  expect(top!.y + top!.height, 'the step that waits (top) is drawn above the step it waits on (bottom)').toBeLessThanOrEqual(bottom!.y)
  lineOf('upward')

  lineOf('feeds')
  lineOf('feeds-back')
  lineOf('loop-there')
  lineOf('loop-back')

  const keys = drawing.areas.map((area) => area.key)
  for (const area of AREAS) expect(keys, `the stored area "${area.name}" is drawn`).toContain(area.name)
  const elsewhere = drawing.areas.findIndex((area) => area.cards.includes(office.id['elsewhere']!) && area.head === office.id['other'])
  expect(elsewhere, 'the step of another pipeline is a card in an area whose data-head is that pipeline').toBeGreaterThanOrEqual(0)
  const lastStored = Math.max(...AREAS.map((area) => keys.indexOf(area.name)))
  expect(elsewhere, 'the area of the other pipeline is drawn after every stored area').toBeGreaterThan(lastStored)
  lineOf('elsewhere')
}, 120_000)

it('criterion 1: the same pipeline with no areas stored names and draws every kind of link too', async () => {
  await openThePage(app, pipelinePath(office.id['plain']!))
  await theDrawingIsDrawn(app.page)
  const drawing = await readTheDrawing(app.page)
  expect(drawing.level, 'a pipeline that is not the master is drawn at its Steps level').toBe('steps')
  const ids = drawing.cards.map((card) => card.id)
  for (const step of STEPS) expect(ids, `the step plain-${step.name} is a card`).toContain(office.id[`plain-${step.name}`])
  for (const name of MODULES) expect(ids, `the module plain-${name} is a card`).toContain(office.id[`plain-${name}`])
  for (const area of AREAS) expect(drawing.areas.map((one) => one.key), `"${area.name}" is stored for the other pipeline only`).not.toContain(area.name)
  everyLinkIsNamedAndDrawn(drawing, 'plain-')
}, 120_000)

it('criterion 1: the link the drawing cannot draw is named in the developer view with its far end’s title', async () => {
  await openInTheDeveloperView(app, pipelinePath(office.id['drawn']!))
  await theDrawingIsDrawn(app.page)
  const drawing = await readTheDrawing(app.page)
  const linkId = office.link[UNDRAWABLE.key]!
  expect(drawing.drawnLinks, 'the link to the idea is not drawn at rest').not.toContain(linkId)
  expect([...namedForASelection(drawing)], 'the link to the idea is not drawn for a selection').not.toContain(linkId)
  expect(drawing.paths.map((path) => path.link), 'the link to the idea has no line').not.toContain(linkId)
  await app.page.locator(DEVELOPER).first().waitFor({ timeout: 10_000 })
  const naming = (await theDeveloperLines(app.page)).filter((line) => line.words.includes(TITLES.idea))
  expect(naming.map((line) => line.key), 'the developer view names the link not drawn, with its far end’s title, once').toEqual(['lanesInput.linkNotDrawn'])

  await openThePage(app, pipelinePath(office.id['drawn']!))
  await theDrawingIsDrawn(app.page)
  expect((await app.page.locator(SAID).allInnerTexts()).join(' '), 'the normal view’s said section does not name it').not.toContain(TITLES.idea)
}, 120_000)

it('criterion 1: the master opens at Boxes, and pressing Steps draws its steps with their waits-on lines', async () => {
  await openThePage(app, pipelinePath(office.id['master']!))
  await theDrawingIsDrawn(app.page)
  const boxes = await readTheDrawing(app.page)
  expect(boxes.level, 'the master opens at its Boxes level').toBe('boxes')
  const button = (level: string) => app.page.locator(`[data-level-control] [data-level="${level}"]`)
  expect(await button('boxes').getAttribute('aria-pressed'), 'the Boxes button is pressed').toBe('true')
  expect(await button('steps').getAttribute('aria-pressed'), 'the Steps button is not pressed').toBe('false')
  const boxIds = boxes.cards.map((card) => card.id)
  for (const key of [...STEPS.flatMap((step) => [step.name, `plain-${step.name}`]), 'elsewhere']) {
    expect(boxIds, `the step ${key} of a block pipeline is a box on the master`).toContain(office.id[key])
  }

  await button('steps').click()
  await app.page.locator(`${DRAWING}[data-level="steps"]`).waitFor({ timeout: 10_000 })
  await theDrawingHoldsStill(app.page)
  const steps = await readTheDrawing(app.page)
  expect(await button('steps').getAttribute('aria-pressed'), 'the Steps button is pressed').toBe('true')
  expect(await button('boxes').getAttribute('aria-pressed'), 'the Boxes button is no longer pressed').toBe('false')
  const stepIds = steps.cards.map((card) => card.id)
  for (const key of ['master-first', 'master-second', 'master-third']) expect(stepIds, `the master's step ${key} is a card`).toContain(office.id[key])
  expect(stepIds, 'no box is drawn at the Steps level').not.toContain(office.id['start'])
  for (const key of ['master-hard', 'master-plain']) {
    expect(steps.drawnLinks, `the waits-on link ${key} is drawn at rest`).toContain(office.link[key])
    for (const line of theLinesOf(steps, office.link[key]!, key)) expect(line.type, `${key}: the type its line says`).toBe('blocks')
  }
}, 120_000)
