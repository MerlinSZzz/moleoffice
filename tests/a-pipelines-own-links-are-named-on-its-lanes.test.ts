// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PIPELINE'S OWN LINKS ARE NAMED UNDER ITS LANES. Wave 13u round 230, PV-2, brief item 2: every stored link of the
 * pipeline is drawn, and where one is not drawn, the body says why in words. The drawing and the reading of it are in
 * tests/a-made-up-office-drawn-in-lanes.ts.
 *
 * THE FAULT THIS CRITERION NAMES: the lanes draw the pipeline's steps, not the pipeline record itself, so a link stored
 * on the pipeline record has no card at either end. Such a link was dropped with nothing said: the links loop in
 * src/web/components/graph/lanes/from-records.ts returned early for a link with neither end among the drawing's own
 * records. A link the drawing cannot draw is named in the body today (lanesInput.linkNotDrawn), in one line that
 * names both ends and says why, with "because". These are named the same way, and a line holding the far end's title
 * alone does not say why.
 *
 * THE OFFICE: a made-up project with one pipeline of two steps, the first waiting on the second. A problem blocks the
 * pipeline record itself, and the pipeline record consumes a note. The office stores no record kind called a finding,
 * so a note is the record consumed. Every title is made up and says so, and no record id is written anywhere: ids
 * come from the office's replies.
 *
 * WHAT IS PROVED, case by case:
 *   1. the waits-on link between the two steps is drawn at rest, so the drawing was read; the problem's blocks link is
 *      drawn neither at rest nor for a selection, and has no line; one body line holds the problem's title, and that
 *      same line holds the pipeline's title and says why, with "because";
 *   2. the note's consumes link is drawn neither at rest nor for a selection, and has no line; one body line holds
 *      the note's title, and that same line holds the pipeline's title and says why, with "because".
 *
 * NOT TESTED HERE: a link with neither end among the pipeline's own records nor the pipeline itself, such as a link
 * from a step drawn in another pipeline's area to a sibling that is not drawn. Such a link is named under the drawing
 * as well, and tests/a-link-with-an-end-on-the-lanes-is-drawn-or-named.test.ts holds that, on records and links with
 * no server.
 *
 * RED UNTIL THE CODE: at a build whose from-records.ts returns early for every link with no end among the drawn
 * records, both cases are red, because no body line names the far end. Its two mutations, once the Code is in, each
 * after a green run, the file copied first and restored with cp and checked with cmp:
 *
 *   in src/web/components/graph/lanes/from-records.ts, return early again for every link with neither end among the
 *     drawing's own records, the pipeline's own links included → both cases go red: no body line names the problem
 *     or the note;
 *   keep the far end's title for such a link and drop the rest of its sentence, so the line is the bare title → both
 *     cases go red: the line that names the far end holds neither the pipeline's title nor "because".
 *
 * IN THE DEVELOPER VIEW, SINCE 16 NOVEMBER 2026. The decision of that day, which the secretary filed from the owner's
 * words, moves the drawing's sentences about
 * links it could not draw out of the page's body for every reader: they are shown in the developer view only, each
 * line naming its word key (tests/a-pipeline-page-in-the-developer-view.ts). So both cases read the line there, and ask
 * it to name lanesInput.ownLinkNotDrawn, and the normal view's said section names neither far end. A body line is a
 * line of the developer section now, and "the body" below means that section.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'

import { pipelinePath } from '../src/web/components/router.tsx'
import { liveApp, type LiveApp } from './helpers.ts'
import { SAID, openThePage, prepareThePage, readTheDrawing, theDrawingIsDrawn, writerFor, type TheDrawing } from './a-made-up-office-drawn-in-lanes.ts'
import { openInTheDeveloperView, theDeveloperLines } from './a-pipeline-page-in-the-developer-view.ts'

const PROJECT = { id: 'test-lanes-own-links', title: 'Example office whose pipeline has links of its own (made up)' }

const TITLES = {
  pipeline: 'Example pipeline with links of its own (made up)',
  first: 'Example first step (made up)',
  second: 'Example second step (made up)',
  problem: 'Example problem that holds the pipeline up (made up)',
  note: 'Example note the pipeline reads (made up)',
} as const

let app: LiveApp
const id: Record<string, string> = {}
const link: Record<string, string> = {}

beforeAll(async () => {
  app = await liveApp({ name: 'lanes-own-links', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  const write = writerFor(app, PROJECT.id)
  await write.call('POST', '/api/workspaces', PROJECT)
  id['pipeline'] = (await write.call('POST', '/api/records', { kind: 'pipeline', title: TITLES.pipeline, data: { blockIds: [] } })).record.id
  id['first'] = (await write.call('POST', `/api/records/${id['pipeline']!}/blocks`, { name: TITLES.first, state: 'todo' })).record.id
  id['second'] = (await write.call('POST', `/api/records/${id['pipeline']!}/blocks`, { name: TITLES.second, state: 'done' })).record.id
  id['problem'] = (await write.call('POST', '/api/records', { kind: 'problem', title: TITLES.problem, data: { symptom: 'Example symptom (made up)', state: 'open' } })).record.id
  id['note'] = (await write.call('POST', '/api/records', { kind: 'note', title: TITLES.note, data: { body: 'Example words of a note (made up)' } })).record.id
  const join = async (key: string, from: string, to: string, type: string): Promise<void> => {
    link[key] = (await write.call('POST', '/api/links', { fromId: id[from]!, toId: id[to]!, type })).id as string
  }
  await join('steps', 'second', 'first', 'blocks')
  await join('problem', 'problem', 'pipeline', 'blocks')
  await join('note', 'pipeline', 'note', 'consumes')
  await prepareThePage(app, PROJECT.id)
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

/** The pipeline's lanes, drawn and read, in the developer view. */
async function theLanes(): Promise<TheDrawing> {
  await openInTheDeveloperView(app, pipelinePath(id['pipeline']!))
  await theDrawingIsDrawn(app.page)
  return readTheDrawing(app.page)
}

/** The developer section's lines, each with its key, and none while it is not on the page. */
async function theBodysLines(): Promise<string[]> {
  return (await theDeveloperLines(app.page)).map((line) => `${line.key} ${line.words}`)
}

/** In the normal view, the said section names no far end of a link of the pipeline record itself. */
async function theNormalViewNamesNeither(): Promise<void> {
  await openThePage(app, pipelinePath(id['pipeline']!))
  await theDrawingIsDrawn(app.page)
  const said = await app.page.locator(`${SAID} p`).allInnerTexts()
  for (const far of [TITLES.problem, TITLES.note]) expect(said.filter((line) => line.includes(far)), `the normal view's said section does not name "${far}"`).toEqual([])
}

/**
 * The one body line that holds a far end's title. That same line holds the pipeline's title, the near end, and says
 * why the link is not drawn, with "because", as lanesInput.linkNotDrawn does.
 */
async function theLineNaming(far: string, what: string): Promise<void> {
  const naming = async (): Promise<string[]> => (await theBodysLines()).filter((line) => line.includes(far))
  await expect.poll(async () => (await naming()).length, { timeout: 10_000, message: `one body line names ${what}, with the title "${far}"` }).toBe(1)
  const [line] = await naming()
  expect(line, `the line that names ${what} names its key first`).toMatch(/^lanesInput\.ownLinkNotDrawn /)
  expect(line, `the line that names ${what} names the pipeline too`).toContain(TITLES.pipeline)
  expect(line, `the line that names ${what} says why it is not drawn`).toContain('because')
}

/** A link of the pipeline record itself has no line at rest, none for a selection of any card, and none on screen. */
function itHasNoLine(drawing: TheDrawing, key: string, what: string): void {
  expect(drawing.drawnLinks, `${what} is not drawn at rest`).not.toContain(link[key])
  expect([...new Set(Object.values(drawing.onSelection).flat())], `${what} is not drawn for a selection`).not.toContain(link[key])
  expect(drawing.paths.map((path) => path.link), `${what} has no line`).not.toContain(link[key])
}

it("brief item 2: the problem that blocks the pipeline itself has no line, and one body line names it with both titles and says why", async () => {
  const drawing = await theLanes()
  for (const step of ['first', 'second']) expect(drawing.cards.map((card) => card.id), `the ${step} step is a card`).toContain(id[step])
  expect(drawing.drawnLinks, 'the waits-on link between the two steps is drawn at rest').toContain(link['steps'])
  itHasNoLine(drawing, 'problem', "the problem's blocks link to the pipeline")
  await theLineNaming(TITLES.problem, "the problem's link to the pipeline")
  await theNormalViewNamesNeither()
}, 120_000)

it("brief item 2: the note the pipeline itself consumes has no line, and one body line names it with both titles and says why", async () => {
  const drawing = await theLanes()
  itHasNoLine(drawing, 'note', "the pipeline's consumes link to the note")
  await theLineNaming(TITLES.note, "the pipeline's link to the note")
  await theNormalViewNamesNeither()
}, 120_000)
