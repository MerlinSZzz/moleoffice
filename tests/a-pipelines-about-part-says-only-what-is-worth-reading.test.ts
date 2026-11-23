// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PIPELINE'S ABOUT PART SAYS ONLY WHAT IS WORTH READING. Wave 13u round 231, criterion 1.
 *
 * By the decision of 16 November 2026, which the secretary filed from the owner's words, the About part of a pipeline's page holds the pipeline's own
 * description, and the section after it holds only the sentences a reader needs to trust the page. So, in the normal
 * view, on the master's page, on a block pipeline's page and on the reel page:
 *
 *   - "A step is not a module." is said by nobody;
 *   - no sentence for developers is said (the links the drawing could not draw, the hints it does not use, and the
 *     others tests/a-pipeline-page-in-the-developer-view.ts lists by word key): the developer view says those;
 *   - the master's page draws no list of its blocks, since each block is a card or a row in its drawing;
 *   - with nothing written and nothing else to say, the About part says not written, and the section after it is
 *     not drawn;
 *   - with a description, the About part holds the description and nothing else, and the section after it is not
 *     drawn;
 *   - when a sentence for every reader follows, the About part does not also say not written.
 *     That sentence is made here by failing the restriction read: a reader must know no card can show a restriction.
 *
 * CRITERION CHANGE, as decided: the About part's absence is the state word "not written" now, not a sentence. The
 * summary part may draw the same word, so the word is no longer counted over the whole page; the About part's own
 * list holding it once says it once.
 *
 * CRITERION 4 is the last case: a stored arrangement that cannot be read is a sentence for every reader, since the
 * drawing then shows none of its lanes, so the normal view still says it in the section after the About part.
 *
 * THE OFFICE is a test office holding two made-up drawings: the master of 34 boxes in
 * tests/a-made-up-master-at-real-shape.ts, set as the project's master, and the reel page in
 * tests/a-made-up-reel-page-and-a-master-of-54-boxes.ts, with its areas stored once the server is up. Nothing in it
 * is real. The page is this checkout's page built for production, at 1440 by 1000, light.
 *
 * THE BLOCK PIPELINE is block 08, the one of eight boxes, the largest.
 *
 * A READ THIS FILE FAILS is answered with a made-up 500 that keeps the headers of the office's own answer. The page
 * refuses a reply that does not name the office it came from, and then says only that it is talking to a different
 * Mole Office, so it would never see the 500. Each such case checks that the made-up failure's words are on the page.
 *
 * A PAGE IS READ once its drawing has written data-fit and held still, and once neither the restriction read nor the
 * work-domain read still says it is running, so a sentence that comes late is read too.
 */
import { dirname, join } from 'node:path'
import type { Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { pipelinePath } from '../src/web/components/router.tsx'
import { freshDb, liveApp, type LiveApp, type TestDb } from './helpers.ts'
import { DRAWING, SAID, prepareThePage, storeTheAreas, theAreasWereStored, theDrawingHoldsStill, writerFor, type Attempt, type Writer } from './a-made-up-office-drawn-in-lanes.ts'
import { MASTER, storeTheMadeUpMaster } from './a-made-up-master-at-real-shape.ts'
import { storeTheReelPage, type Stored } from './a-made-up-reel-page-and-a-master-of-54-boxes.ts'
import { DEVELOPER, openInTheNormalView, theWordForDevelopersThatWrote } from './a-pipeline-page-in-the-developer-view.ts'

const PROJECT = { id: 'test-about-part', title: 'Example office for the About part (made up)' }
const BLOCK = 'block-08'
const ABOUT = '[data-pipeline-part="context"]'

let db: TestDb
let app: LiveApp
let write: Writer
let master: ReturnType<typeof storeTheMadeUpMaster>
let reel: Stored
let reelAreas: Attempt
let words: Record<string, unknown>
const word = (key: string): string => {
  const one = words[key]
  if (typeof one !== 'string') throw new Error(`the English words have no text for ${key}`)
  return one
}

beforeAll(async () => {
  db = await freshDb()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  const { anOfficeId } = await import('../src/server/db/ids.ts')
  const { englishWords } = await import('../src/shared/words/joined.ts')
  words = englishWords() as unknown as Record<string, unknown>
  createWorkspace(PROJECT)
  master = storeTheMadeUpMaster(db, PROJECT.id)
  reel = storeTheReelPage(db, PROJECT.id, anOfficeId)
  app = await liveApp({ name: 'about-part', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1000 } })
  write = writerFor(app, PROJECT.id, join(dirname(db.file), 'keys.json'))
  await write.call('PUT', `/api/projects/${PROJECT.id}/master-pipeline`, { pipeline: master.master })
  const [areas] = reel.areas
  reelAreas = await storeTheAreas(write, areas!.pipeline, areas!.intent)
  await prepareThePage(app, PROJECT.id)
}, 300_000)
afterAll(async () => {
  await app?.stop()
  db?.close()
}, 120_000)

const PAGES = [
  { name: 'the master', id: () => master.master },
  { name: 'block pipeline 08', id: () => master.id[BLOCK]! },
  { name: 'the reel page', id: () => reel.pipeline },
] as const

/** Opens a pipeline's page in the normal view and waits until it is drawn and every read has answered. */
async function open(id: string): Promise<Page> {
  await openInTheNormalView(app, pipelinePath(id))
  const page = app.page
  await page.locator(`${DRAWING}[data-fit]`).waitFor({ timeout: 300_000 })
  await theDrawingHoldsStill(page)
  const running = [word('g7b.Canvas.reading_what_restricts_these_records'), word('g7b.Canvas.reading_who_is_working_on_these_records')]
  await expect.poll(async () => {
    const text = await page.locator('.pp').innerText()
    return running.filter((one) => text.includes(one))
  }, { message: 'the restriction and work-domain reads have answered', timeout: 60_000 }).toEqual([])
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
  return page
}

/** What the About part and the section after it say, paragraph by paragraph, with the page's whole text. */
async function readTheBody(page: Page) {
  const paragraphs = (selector: string): Promise<string[]> =>
    page.locator(`${selector} p`).evaluateAll((all) => all.map((p) => (p.textContent ?? '').replace(/\s+/g, ' ').trim()))
  return {
    about: await paragraphs(ABOUT),
    saidDrawn: await page.locator(SAID).count(),
    said: await paragraphs(SAID),
    developerDrawn: await page.locator(DEVELOPER).count(),
    text: (await page.locator('.pp').innerText()).replace(/\s+/g, ' '),
  }
}

/** Each sentence of the About part and the section after it that a reader of the normal view is not to be given. */
async function notWorthReading(body: Awaited<ReturnType<typeof readTheBody>>): Promise<string[]> {
  const out: string[] = []
  for (const sentence of [...body.about, ...body.said]) {
    if (sentence === word('g7b.PipelinePage.a_step_is_not_a_module')) out.push(`the step sentence: ${sentence}`)
    const key = await theWordForDevelopersThatWrote(sentence)
    if (key !== null) out.push(`${key}: ${sentence}`)
  }
  return out
}

const timesIn = (text: string, part: string): number => text.split(part).length - 1

/** Answers the page's GET of one door with a made-up 500 that keeps the headers of the office's own answer: see the head. */
async function failTheRead(theRead: (url: URL) => boolean, error: string): Promise<void> {
  await app.page.route(theRead, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    const answer = await route.fetch()
    const headers = answer.headers()
    delete headers['content-length']
    await route.fulfill({ status: 500, headers, contentType: 'application/json', body: JSON.stringify({ error }) })
  })
}

for (const each of PAGES) {
  it(`${each.name}, with nothing written about it: the About part says not written, and nothing follows it`, async () => {
    if (each.name === 'the reel page') theAreasWereStored(reelAreas, 'the reel page')
    const page = await open(each.id())
    const body = await readTheBody(page)
    console.log(`${each.name}: About ${JSON.stringify(body.about)}; said section ${String(body.saidDrawn)} ${JSON.stringify(body.said)}`)
    expect(await notWorthReading(body), `${each.name}: no sentence for developers and no step sentence in the normal view`).toEqual([])
    expect(body.developerDrawn, `${each.name}: the normal view draws no developer section`).toBe(0)
    expect(body.about, `${each.name}: the About part says only not written`).toEqual([word('moduleView.context.notWritten')])
    expect(body.saidDrawn, `${each.name}: with nothing to say, the section after the About part is not drawn`).toBe(0)
    expect(timesIn(body.text, word('g7b.PipelinePage.a_step_is_not_a_module')), `${each.name}: "A step is not a module." is said by nobody`).toBe(0)
  }, 400_000)
}

it('the master draws no list of its blocks under its drawing', async () => {
  const page = await open(master.master)
  expect(await page.locator('.bm-blocks').count(), 'no list of blocks (.bm-blocks)').toBe(0)
  expect(await page.locator('[data-map-block]').count(), 'no entry of a list of blocks ([data-map-block])').toBe(0)
  const heading = String(word('bigMap.blocks')).replace('{n}', String(MASTER.blockPipelines.length))
  expect((await readTheBody(page)).text, `no "${heading}"`).not.toContain(heading)
}, 400_000)

it('the reel page, with a description: the About part holds the description and nothing else, and nothing follows it', async () => {
  theAreasWereStored(reelAreas, 'the reel page')
  const description = ['Example first paragraph about the reel page (made up).', 'Example second paragraph about the reel page (made up).']
  await write.call('PATCH', `/api/records/${reel.pipeline}`, { dataPatch: { context: description.join('\n\n') } })
  const body = await readTheBody(await open(reel.pipeline))
  console.log(`the reel page with a description: About ${JSON.stringify(body.about)}; said section ${String(body.saidDrawn)} ${JSON.stringify(body.said)}`)
  expect(body.about, 'the About part holds the two paragraphs written, in order, and nothing else').toEqual(description)
  expect(body.about, 'the About part does not say not written').not.toContain(word('moduleView.context.notWritten'))
  expect(body.saidDrawn, 'with nothing to say, the section after the About part is not drawn').toBe(0)
  expect(await notWorthReading(body), 'no sentence for developers and no step sentence').toEqual([])
}, 400_000)

it('the master, with nothing written and a sentence for every reader after it: the About part does not say not written', async () => {
  const each = PAGES[0]
  // The restriction read answers with a failure, so the page must say that no card can show a restriction.
  const theRead = (url: URL): boolean => url.pathname === '/api/restrictions'
  const failure = 'Example failure of the restriction read (made up).'
  await failTheRead(theRead, failure)
  try {
    const page = await open(each.id())
    const body = await readTheBody(page)
    console.log(`${each.name}, restriction read failed: About ${JSON.stringify(body.about)}; said section ${String(body.saidDrawn)} ${JSON.stringify(body.said)}`)
    const failed = word('g7b.Canvas.what_restricts_these_records_could_not_be')
    expect(body.saidDrawn, `${each.name}: the section after the About part is drawn`).toBe(1)
    expect(body.said.filter((sentence) => sentence.startsWith(failed)), `${each.name}: it says the restriction read failed, once`).toHaveLength(1)
    expect(body.said.filter((sentence) => sentence.startsWith(failed) && sentence.endsWith(failure)), `${each.name}: that sentence says the made-up failure, so the 500 reached the page`).toHaveLength(1)
    expect(timesIn(body.text, word('frameFiles.api.otherWorld')), `${each.name}: the page does not say it is talking to a different Mole Office`).toBe(0)
    expect(await notWorthReading(body), `${each.name}: no sentence for developers and no step sentence`).toEqual([])
    expect(body.about, `${each.name}: the About part does not also say not written`).not.toContain(word('moduleView.context.notWritten'))
  } finally {
    await app.page.unroute(theRead)
  }
}, 400_000)


// CRITERION 4. An arrangement that cannot be read is a sentence for every reader: the drawing then shows none of the
// lanes stored for the pipeline, and a reader must know why. So the normal view still says it, in the section after
// the About part. The page's read of the reel page's stored arrangement is answered with a failure here.
it('the reel page, whose stored arrangement cannot be read: the normal view says so after the About part', async () => {
  theAreasWereStored(reelAreas, 'the reel page')
  const { pipelineScope } = await import('../src/shared/presentation.ts')
  const theRead = (url: URL): boolean => decodeURIComponent(url.pathname) === `/api/presentation/${pipelineScope(reel.pipeline)}`
  const failure = 'Example failure of the arrangement read (made up).'
  await failTheRead(theRead, failure)
  try {
    const body = await readTheBody(await open(reel.pipeline))
    console.log(`the reel page, arrangement read failed: said section ${String(body.saidDrawn)} ${JSON.stringify(body.said)}`)
    const failed = word('lanesInput.intentFailed').split('{problem}')[0]!
    expect(body.saidDrawn, 'the section after the About part is drawn').toBe(1)
    expect(body.said.filter((sentence) => sentence.startsWith(failed)), 'it says the stored arrangement could not be read, once').toHaveLength(1)
    expect(body.said.filter((sentence) => sentence.startsWith(failed) && sentence.endsWith(failure)), 'that sentence says the made-up failure, so the 500 reached the page').toHaveLength(1)
    expect(timesIn(body.text, word('frameFiles.api.otherWorld')), 'the page does not say it is talking to a different Mole Office').toBe(0)
    expect(body.developerDrawn, 'the normal view draws no developer section').toBe(0)
  } finally {
    await app.page.unroute(theRead)
  }
}, 400_000)
