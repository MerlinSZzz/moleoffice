// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BIG MAP ON THE MASTER PIPELINE'S PAGE, AND A BLOCK OPENS ITS BLOCK PIPELINE. Wave 13u round 216, package BV,
 * point BV-6, as the design picture M1 draws it. Its criterion: "a test shows a block
 * opens its block pipeline". The map is src/web/components/graph/BigMap.tsx, drawn from the reading in
 * src/shared/big-map-reading.ts.
 *
 * WHAT IS PROVED, in a test office with a made-up project: a master of two blocks, a block pipeline hung on each, three
 * steps with a tier and one without, and two `feeds` links between them that say what they carry. Since 15 November
 * 2026 the master's page draws its map on the lanes (`[data-drawing="lanes"]`), at the Boxes level, and no page draws
 * the old map (`[data-big-map]`).
 *   1. the master's page draws each step of each block pipeline as a box card inside its block's row, marked with its
 *      block's place, and a block pipeline's own page draws no box card and no level control;
 *   2. pressing a block's title in the drawing, where it heads its block's row, opens its block pipeline, and so does
 *      pressing a box's title (16 November 2026; until then the block was pressed in a list under the drawing);
 *   3. a `feeds` link between two boxes is drawn as a line with what it carries on a wide screen, and on a narrow one
 *      each box names its lines in words.
 *   4. nothing under a drawing says what the drawing could not show, and the page head draws no counts: on the master's
 *      page, on a block pipeline's page and on the drawing of the modules (round 217). Since 16 November 2026 the
 *      page's body says only what a reader needs to trust the page, and nothing else: no "A step is not a module.",
 *      and the restriction check that could not run is said in the developer view only;
 *   5. a block pipeline's steps are drawn top to bottom in their stored order, 01, 02, 03, at 1440 and at 390
 *      (round 217). In this office the three steps have no line between them, so nothing but that order places them.
 *
 * WHAT CASES 1 AND 2 NO LONGER ASK, SINCE 15 NOVEMBER 2026. Three things the old map drew are gone. That is a change
 * and not a fault, so their checks were taken out:
 *   - the rows by tier: the lanes draw a block's boxes in one row for that block, and a box's badge (M0, M1) is its
 *     block's place, so no row stands for a tier;
 *   - the list of steps not placed: every box is drawn in its block's row, a box with no tier included;
 *   - the line under the map's heading, saying that pressing a box opens its pipeline: pressing a box's card now
 *     selects it, its title is the link that opens the pipeline, and the page draws no line of small print to say so.
 *
 * Pictures are taken only when TEST_SHOTS names a folder: the master's page with its lanes, the lanes alone, and a
 * block pipeline's page, four widths, both themes. Each is taken once the drawing is drawn, and each whole-page picture
 * is checked to reach the page's end. Each picture of the lanes alone is taken in a window tall enough for the drawing
 * and the phone's bar, and is checked to be as tall as the drawing and taken with the whole drawing inside the window
 * (round 217: at 660 the old map's picture had come out with a blank foot since round 216).
 *
 * MUTATIONS OF THE OLD MAP, rounds 216 and 217. No page draws that map since 15 November 2026, so these reach nothing
 * this file runs now. They are kept as the file's history. Each was run after a control run, each file copied first and
 * restored with cp and checked with cmp:
 *   1. in the map, link a box to its own step in place of its block pipeline: case 2 goes red.
 *   2. in the shared reading, read no tier: cases 1 and 3 go red. Every box is then listed as not placed, outside the
 *      drawn map, and no line is drawn to a box outside it, so case 3 waits for its line until its time runs out.
 *   3. in the map, draw no words on a line: case 3 goes red.
 *   4. in the pipeline page, draw the map on every pipeline's page: case 1 goes red.
 * Round 217's, each restored with git checkout and an empty git diff:
 *   5. in the drawing, draw the strip of facts under the drawing again: case 4 goes red.
 *   6. in the structure view, draw the list of what the drawing left out again: case 4 goes red.
 *   7. in the pipeline page, draw the counts line and its sentence in the page head again: case 4 goes red.
 *   8. in the layout, give a step inside a box no position from its stored order: case 5 goes red.
 *   9. in the map, draw no line under its heading: case 2 goes red.
 *  10. in this file, take the map's own picture in the 900px window again: the pictures case goes red at 660, with
 *      TEST_SHOTS set.
 *
 * THE MUTATION ON THE LANES, 15 November 2026, after a control run, the file copied first, restored with cp and checked
 * with cmp:
 *  11. in the lanes' reading of the records (src/web/components/graph/lanes/from-records.ts), link a box's title to its
 *      own step in place of its block pipeline: case 2 goes red.
 *
 * ---------------------------------------------------------------------------------------
 * THE LIST OF BLOCKS COUNTS THE BOXES THE LANES DRAW, SINCE 15 NOVEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 *   6. the list of blocks under the master's drawing gives the first block as many boxes as the lanes draw in that
 *      block's row, and no part saying that a box is not on the map.
 * The master's page draws its boxes on the lanes, one row for each block, and a box with no tier sits in its block's
 * row like the others. The list still counted such a box as not on the map, so under a row of three boxes it said
 * "2 boxes, and 1 not on the map". Case 6 was red when it was written, for that reason, and it goes green when the
 * list counts the boxes the lanes draw. It is proved by mutation once it is green.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT CHANGED ON 16 NOVEMBER 2026, BY THE DECISION, WHICH THE SECRETARY FILED FROM THE OWNER'S WORDS
 * ---------------------------------------------------------------------------------------
 *
 * The page's About part and the section after it hold only what a reader needs to trust the page. The list of blocks
 * under the master's drawing goes, and a block is pressed in the drawing itself, where its title heads its row and
 * leads to its block pipeline. The part_of link from a block pipeline to its block is drawn by that press, so no
 * sentence says it was not drawn. These are changes to what the page must do, not faults, so three cases changed:
 *   - case 2 presses the block's title in the drawing, and no longer an entry of the list;
 *   - case 4 asks for no "A step is not a module." anywhere on the page. On a drawn page in this office nothing is
 *     left for the said section once the reads have answered, so it asks for no said section then, and for the
 *     restriction check that could not run in the developer view (tests/a-pipeline-page-in-the-developer-view.ts) and
 *     not in the normal view. It no longer asks for the said section right after the pipeline's own body;
 *   - case 6 still asks for the first block's three boxes in its row, and now for no list of blocks at all, in place
 *     of that list's count of them. The list's own reading stays in BigMap.tsx, and
 *     tests/the-masters-list-of-blocks-is-its-own-component.test.ts still reads it there.
 */
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { englishWords } from '../src/shared/words/joined.ts'
import { DRAWING, cardOf, theDrawingIsDrawn } from './a-made-up-office-drawn-in-lanes.ts'
import { DEVELOPER } from './a-pipeline-page-in-the-developer-view.ts'
import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { waitForTheProjects } from './switch-the-project.ts'

const PROJECT = { id: 'test-big-map', title: 'Example office with a big map (made up)' }
const UPPER = 'Example pipeline of the first block (made up)'
const LOWER = 'Example pipeline of the second block (made up)'

let app: LiveApp
const id: Record<string, string> = {}

async function call(method: string, path: string, body?: unknown): Promise<any> {
  const headers = {
    'content-type': 'application/json',
    'x-mole-office-workspace': PROJECT.id,
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_PERSON,
    ...thePersonsKeyHeader(join(app.dir, 'keys.json')),
  }
  const reply = await fetch(`${app.api}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  expect(reply.ok, `${method} ${path}: ${text}`).toBe(true)
  return JSON.parse(text) as unknown
}

async function aPipeline(name: string, title: string): Promise<void> {
  id[name] = (await call('POST', '/api/records', { kind: 'pipeline', title, data: { blockIds: [] } })).record.id as string
}

async function aStep(pipeline: string, name: string, tier: string | null): Promise<void> {
  id[name] = (await call('POST', `/api/records/${id[pipeline]!}/blocks`, { name: `Example step ${name} (made up)`, state: 'done' })).record.id as string
  if (tier !== null) await call('PATCH', `/api/records/${id[name]!}`, { dataPatch: { tier } })
}

async function aFeedsLink(from: string, to: string, out: string): Promise<void> {
  id[`${from}-${to}`] = (await call('POST', '/api/links', { fromId: id[from]!, toId: id[to]!, type: 'feeds', carries: [{ out }] })).id as string
}

beforeAll(async () => {
  app = await liveApp({ name: 'big-map', workspace: 'default', viewport: { width: 1440, height: 900 } })
  await call('POST', '/api/workspaces', PROJECT)

  await aPipeline('master', 'Example master pipeline (made up)')
  await aStep('master', 'first block', null)
  await aStep('master', 'second block', null)
  await aPipeline('upper', UPPER)
  await aStep('upper', 'door', 'ways-in')
  await aStep('upper', 'gate', 'gate')
  await aStep('upper', 'unplaced', null)
  await call('POST', '/api/links', { fromId: id['upper']!, toId: id['first block']!, type: 'part_of' })
  await aPipeline('lower', LOWER)
  await aStep('lower', 'store', 'stores')
  await call('POST', '/api/links', { fromId: id['lower']!, toId: id['second block']!, type: 'part_of' })
  await aFeedsLink('door', 'gate', 'example requests')
  await aFeedsLink('gate', 'store', 'example rows')
  await call('PUT', `/api/projects/${PROJECT.id}/master-pipeline`, { pipeline: id['master']! })

  await app.page.addInitScript((project) => {
    localStorage.setItem('mole-office.workspace', project)
    localStorage.setItem('mole-office.preset.theme', new URL(location.href).searchParams.get('theme') ?? 'light')
  }, PROJECT.id)
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

let loads = 0

async function open(path: string, ready: string, theme = 'light', mode = ''): Promise<void> {
  loads += 1
  await app.page.goto(`${app.site}/?lang=en${mode === '' ? '' : `&mode=${mode}`}&theme=${theme}&load=${String(loads)}#${path}`)
  await waitForThePage(app.page, 30_000)
  await waitForTheProjects(app.page)
  await app.page.locator(ready).first().waitFor()
}

/**
 * The rows of the lanes that hold a step's card: the key of each `.e-area` whose frame holds the middle of the card, or
 * null when no such card is drawn. The lanes put a row's frame and its cards side by side in the page, not one inside
 * the other, so their places are compared.
 */
const rowsHolding = (name: string): Promise<string[] | null> =>
  app.page.locator(DRAWING).evaluate((lanes, recordId) => {
    const card = lanes.querySelector(`.e-card[data-id="${CSS.escape(recordId)}"]`)
    if (card === null) return null
    const at = card.getBoundingClientRect()
    const x = at.left + at.width / 2
    const y = at.top + at.height / 2
    return [...lanes.querySelectorAll('.e-area')]
      .filter((area) => {
        const frame = area.getBoundingClientRect()
        return x > frame.left && x < frame.right && y > frame.top && y < frame.bottom
      })
      .map((area) => area.getAttribute('data-key') ?? '')
  }, id[name]!)

const SAID = '[data-pipeline-part="said"]'




describe('the big map', () => {
  it("1. draws each block pipeline's steps as boxes in their block's row on the master's page, and on no other pipeline's page", async () => {
    await open(`/pipeline/${id['master']!}`, DRAWING)
    await theDrawingIsDrawn(app.page)
    const page = app.page
    // NO ROW FOR A TIER, AND NO LIST OF STEPS NOT PLACED. The old map drew a row for each tier, and listed a step with no
    // tier under the map as not placed. The lanes draw one row for each block instead, with every box of that block in
    // it, a box with no tier included, and a box's badge is its block's place. So this case asks for each box in its
    // block's row and for the badges, and no longer for a tier's row or for that list.
    const rows = [['door', 'first block'], ['gate', 'first block'], ['unplaced', 'first block'], ['store', 'second block']] as const
    for (const [name, block] of rows) {
      expect(await rowsHolding(name), `the box of step ${name} is drawn in the row of the ${block}, and in no other`).toEqual([id[block]!])
    }
    expect((await page.locator(`${cardOf(id['door']!)} .e-badge`).textContent())?.trim()).toBe('M0')
    expect((await page.locator(`${cardOf(id['store']!)} .e-badge`).textContent())?.trim()).toBe('M1')

    await open(`/pipeline/${id['upper']!}`, '[data-pipeline-part="summary"]')
    await theDrawingIsDrawn(page)
    expect(await page.locator(cardOf(id['door']!)).getAttribute('data-role'), "a block pipeline's page draws its own step as a step").toBe('step')
    expect(await page.locator(`${DRAWING} .e-card[data-role="box"]`).count(), "a block pipeline's page draws no box").toBe(0)
    expect(await page.locator('[data-level-control]').count(), "a block pipeline's page offers no level of boxes").toBe(0)
  })

  it("2. opens a block pipeline from its block's title in the drawing, and from a box's title", async () => {
    await open(`/pipeline/${id['master']!}`, DRAWING)
    await theDrawingIsDrawn(app.page)
    const page = app.page

    // NO LINE UNDER THE HEADING. The old map said in one line under its heading, before the first box, that pressing a
    // box opens that box's pipeline. On the lanes, pressing a box's card selects the card, the box's title is the link
    // that opens the pipeline, and the page draws no line of small print to say so. So this case no longer asks for that
    // line or for its place before the first box.
    //
    // THE BLOCK IS PRESSED IN THE DRAWING (16 November 2026). Until then this case pressed the block's entry in the list
    // of blocks under the drawing. That list goes. At the Boxes level each block heads its own row, and the heading's
    // title is the link to the block's pipeline.
    const block = page.locator(`${DRAWING} .e-area-head[data-head-of="${id['second block']!}"] a.e-title`)
    expect(await block.count(), "the second block's title heads its row in the drawing").toBe(1)
    expect(await block.getAttribute('href'), "the block's title links to its block pipeline").toBe(`#/pipeline/${id['lower']!}`)
    await block.click()
    await page.waitForURL(`**#/pipeline/${id['lower']!}`)
    await page.locator('[data-pipeline-part="summary"] h2', { hasText: LOWER }).waitFor()

    await open(`/pipeline/${id['master']!}`, DRAWING)
    await theDrawingIsDrawn(page)
    const title = page.locator(`${cardOf(id['door']!)} a.e-title`)
    expect(await title.getAttribute('href'), "the box's title links to its block pipeline").toBe(`#/pipeline/${id['upper']!}`)
    await title.click()
    await page.waitForURL(`**#/pipeline/${id['upper']!}`)
    await page.locator('[data-pipeline-part="summary"] h2', { hasText: UPPER }).waitFor()
  })

  it('3. draws a feeds link as a line with what it carries, and names it in words on a narrow screen', async () => {
    await open(`/pipeline/${id['master']!}`, DRAWING)
    await theDrawingIsDrawn(app.page)
    const page = app.page
    const link = id['door-gate']!
    expect(await page.locator(`${DRAWING} path.e-path[data-link="${link}"]`).count(), 'the line from door to gate is drawn').toBe(1)
    expect((await page.locator(`${DRAWING} .e-pill[data-link="${link}"]`).textContent())?.trim(), 'the line says what it carries').toBe('example requests')

    await page.setViewportSize({ width: 390, height: 900 })
    try {
      // A narrow window draws the lanes as an outline, and each box's card names its lines in words, one to a line.
      await page.locator(`${DRAWING} .e-outline`).waitFor()
      await theDrawingIsDrawn(page, { outline: true })
      const said = async (name: string): Promise<string[]> =>
        (await page.locator(`${cardOf(id[name]!)} .e-said li`).allTextContents()).map((line) => line.trim())
      expect(await said('door'), 'the door names the line it feeds').toContain('feeds Example step gate (made up): example requests')
      expect(await said('gate'), 'the gate names the line it is fed by').toContain('fed by Example step door (made up): example requests')
      expect(await said('gate'), 'the gate names the line it feeds').toContain('feeds Example step store (made up): example rows')
    } finally {
      await page.setViewportSize({ width: 1440, height: 900 })
    }
  })

  // The brief for round 217 asked for no text "on file" anywhere on the page. The "In detail" index still counts the
  // pipelines on file and stays, so "on file" is looked
  // for in the page head only.
  //
  // The restriction read always says that one check could not run: the code dependencies between records, which
  // nobody walks yet. It stands on every drawn page in every office, so it says nothing about this page's records, and
  // since 16 November 2026 it is said in the developer view only. The restriction read's own sentence while it runs is
  // for every reader, so the normal view waits for the read's reply before it asks what the body says. This office has
  // no restriction and no presence on file, and no record the drawing could not read, so once that reply is in, a
  // drawn page here has nothing for the said section at all.
  it('4. says nothing under the drawing or in the page head, and in the body only what a reader needs', async () => {
    const page = app.page
    const pages = [
      { name: "the master's page", path: `/pipeline/${id['master']!}`, ready: DRAWING, drawing: true },
      { name: "a block pipeline's page", path: `/pipeline/${id['upper']!}`, ready: '[data-pipeline-part="summary"]', drawing: true },
      // This office has no module, so the drawing of the modules draws no canvas, only its line saying so.
      { name: 'the drawing of the modules', path: '/pipeline/drawing', ready: '.gx-projection', drawing: false },
    ]
    const said = page.locator(SAID)
    for (const at of pages) {
      const read = at.drawing ? page.waitForResponse((reply) => reply.url().includes('/api/restrictions?'), { timeout: 30_000 }) : null
      await open(at.path, at.ready)
      if (at.drawing) await theDrawingIsDrawn(page)
      else expect(await page.locator('.gx-canvas-wrap').count(), `${at.name}: no canvas in this office`).toBe(0)

      expect(await page.locator('.gx-state-facts').count(), `${at.name}: no strip of facts under the drawing`).toBe(0)
      expect(await page.locator('body').textContent(), `${at.name}: no strip of facts under the drawing`).not.toContain('of the drawing in the window')
      expect(await page.locator('.gx-omitted, .gx-omitted-none').count(), `${at.name}: no list of what was left out`).toBe(0)
      expect(await page.locator('.pp-counts').count(), `${at.name}: no counts line`).toBe(0)
      expect(await page.locator('.pp-head').textContent(), `${at.name}: no counts in the page head`).not.toContain('on file')
      expect(await page.locator('body').textContent(), `${at.name}: the step sentence is said by nobody (16 Nov 2026)`).not.toContain('A step is not a module.')
      expect(await page.locator(DEVELOPER).count(), `${at.name}: the normal view draws no developer section`).toBe(0)

      if (read !== null) {
        expect((await read).ok(), `${at.name}: the restriction read answered`).toBe(true)
        await expect.poll(() => said.count(), { timeout: 20_000, message: `${at.name}: once the reads have answered, no said section` }).toBe(0)
        expect(await page.locator('body').textContent(), `${at.name}: the check that could not run, not in the normal view`).not.toContain('code dependencies between records')
      }
    }

    for (const at of pages.filter((one) => one.drawing)) {
      await open(at.path, at.ready, 'light', 'inspect')
      await theDrawingIsDrawn(page)
      await expect
        .poll(async () => (await page.locator(DEVELOPER).allTextContents()).join(' '), { timeout: 20_000, message: `${at.name}: the check that could not run, in its own words, in the developer view` })
        .toContain('code dependencies between records')
      expect((await said.allTextContents()).join(' '), `${at.name}: the check that could not run, not in the said section`).not.toContain('code dependencies between records')
      expect(await page.locator('body').textContent(), `${at.name}: the step sentence is said by nobody, in the developer view too`).not.toContain('A step is not a module.')
      expect(
        await page.locator('[data-pipeline-part="context"]').evaluate((context) => context.nextElementSibling?.getAttribute('data-pipeline-part') ?? null),
        `${at.name}: with no said section, the developer section right after the pipeline's own body`,
      ).toBe('developer')
    }
  }, 180_000)

  it('5. draws a block pipeline\'s steps top to bottom in their stored order, at 1440 and at 390', async () => {
    const page = app.page
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      try {
        await open(`/pipeline/${id['upper']!}`, '[data-pipeline-part="summary"]')
        // At 390 the lanes are drawn as an outline, whose cards stand one under another, so nothing is pressed.
        await theDrawingIsDrawn(page, { outline: width === 390 })
        const tops: number[] = []
        for (const name of ['door', 'gate', 'unplaced']) {
          const at = await page.locator(cardOf(id[name]!)).boundingBox()
          expect(at, `${String(width)}: the card of step ${name} is drawn`).not.toBeNull()
          tops.push(at!.y)
        }
        expect(tops[0]!, `${String(width)}: 01 above 02 (${tops.join(', ')})`).toBeLessThan(tops[1]!)
        expect(tops[1]!, `${String(width)}: 02 above 03 (${tops.join(', ')})`).toBeLessThan(tops[2]!)
      } finally {
        await page.setViewportSize({ width: 1440, height: 900 })
      }
    }
  }, 120_000)

  // THE BLOCKS' ROWS, AND NO LIST OF THEM. The lanes put a row's frame and its cards side by side in the page, not one
  // inside the other, so a box is counted in the first block's row when its middle is inside the row's frame. Until 16
  // November 2026 this case also asked the list of blocks under the drawing to give the first block that many boxes.
  // The list goes, so the case asks that the page draws no list of blocks, and no entry of one.
  it("6. draws the first block's three boxes in its row, and no list of blocks under the drawing", async () => {
    await open(`/pipeline/${id['master']!}`, DRAWING)
    await theDrawingIsDrawn(app.page)
    const page = app.page
    const inTheRow = await page.locator(DRAWING).evaluate((lanes, row) => {
      const area = lanes.querySelector(`.e-area[data-key="${CSS.escape(row)}"]`)
      if (area === null) return null
      const frame = area.getBoundingClientRect()
      return [...lanes.querySelectorAll('.e-card[data-role="box"]')].filter((card) => {
        const at = card.getBoundingClientRect()
        const x = at.left + at.width / 2
        const y = at.top + at.height / 2
        return x > frame.left && x < frame.right && y > frame.top && y < frame.bottom
      }).length
    }, id['first block']!)
    expect(inTheRow, 'the lanes draw a row for the first block').not.toBeNull()
    expect(inTheRow, "the lanes draw the first block pipeline's three steps as boxes in its row").toBe(3)

    expect(await page.locator('.bm-blocks').count(), 'no list of blocks under the drawing (16 Nov 2026)').toBe(0)
    expect(await page.locator('[data-map-block]').count(), 'no entry of a list of blocks (16 Nov 2026)').toBe(0)
    expect(await page.locator('body').textContent(), 'no heading of a list of blocks (16 Nov 2026)').not.toContain(
      englishWords()['bigMap.blocks'].replace('{n}', '2'),
    )
  }, 60_000)

})
