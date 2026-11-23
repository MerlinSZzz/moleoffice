// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DEVELOPER VIEW NAMES EACH SENTENCE FOR DEVELOPERS BY ITS KEY. Wave 13u round 231, criterion 2.
 *
 * By the decision of 16 November 2026, which the secretary filed from the owner's words, the sentences of a
 * pipeline's page that only a developer needs are said in the developer view only, each named by the word key that
 * writes it. tests/a-pipeline-page-in-the-developer-view.ts says where that section is drawn and lists the keys. This
 * file makes a test office in which most of them are true, opens two pipelines' pages in the developer view, and
 * checks that:
 *
 *   - each sentence the office makes true is a line of the developer section, under its own key;
 *   - every line of that section names the key whose words it says;
 *   - the section comes right after the section of sentences for every reader, or right after the About part when
 *     that section is not drawn;
 *   - the normal view draws no developer section and says none of those lines.
 *
 * THE OFFICE, all made up and stored before the server starts:
 *
 *   - the pipeline "yard" with the steps "dig" and "plant", and the pipeline "mill" with the steps "grind" and "sift";
 *   - the module "memo", which carries no step, so no page draws it;
 *   - plant feeds grind, so yard's page draws grind in an area that mill heads;
 *   - dig relates_to memo, yard relates_to memo, grind relates_to memo, mill relates_to memo and grind feeds sift;
 *   - dig relates_to the module "gone", which is deleted once the server is up, so that link is broken.
 *
 * Once the server is up, yard's arrangement is stored with a direction and three lanes: "Front" holds dig and
 * plant, "Side" holds the module "side card" and "Back" is headed by the module "back head". Both modules are then
 * deleted, so the page does not load them. On mill's page, which lists no lanes, sift is stored in the lane "Front".
 *
 * TWO READS ARE ANSWERED BY THE TEST, not by the office. The restriction read answers that one made-up check could not
 * run, and the work-domain read is held unanswered, so its "reading" line stays. The made-up restriction answer keeps
 * the headers of the office's own answer: the page refuses a reply that does not name the office it came from, and
 * then says only that it is talking to a different Mole Office. The office's own answers to them hold no sentence
 * for developers in an office this small. A page marks itself ready only once no read it asked for
 * is in flight, so with the work-domain read held this file does not wait for that mark: it waits for the project
 * list and for the drawing, as openThePage in tests/a-made-up-office-drawn-in-lanes.ts does after the mark. The normal
 * view's cases then wait until the restriction read of that load has been answered and the page no longer says it is
 * reading what restricts the records, so the check that could not run would be on the page by then.
 *
 * SO, ON YARD'S PAGE, THE LINES ARE: the link not drawn (dig to memo), the pipeline's own link (yard to memo), the
 * broken link (dig to gone), the step of another pipeline (grind to memo), the pipeline heading an area (mill to
 * memo), the link between two steps of another pipeline (grind to sift), the hints not used (the direction), the lane
 * head not loaded ("Back"), the lane card not loaded ("Side"), the check that could not run, and the work-domain read
 * running. ON MILL'S PAGE: the lane stored with no lanes listed (sift in "Front"), the pipeline's own link (mill to
 * memo), the link not drawn (grind to memo), the check that could not run, and the work-domain read running.
 *
 * WHAT IS HELD ELSEWHERE. Four sentences for developers are hard to make true in a browser and are held by other
 * files: a step listed by two pipelines (lanesInput.stepUnderFirst) and a link whose far record the page did not load
 * (lanesInput.linkFarNotLoaded) in tests/the-lanes-input-is-read-from-records.test.ts; the records with a work domain
 * (drawingWithNoMarks.workDomain) in tests/graph-presence-in-the-browser.test.ts; and the drawing's own two sentences
 * (lanes.missingEnd and lanes.noRoute) in tests/the-drawings-own-sentences-are-named-by-their-keys.test.ts.
 *
 * The page is this checkout's page built for production, at 1440 by 1000, light.
 */
import { dirname, join } from 'node:path'
import type { Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { sayInEnglish } from '../src/shared/i18n.ts'
import { pipelineScope } from '../src/shared/presentation.ts'
import { pipelinePath } from '../src/web/components/router.tsx'
import { freshDb, liveApp, type LiveApp, type TestDb } from './helpers.ts'
import { DRAWING, SAID, prepareThePage, storeTheAreas, theAreasWereStored, theDrawingIsDrawn, writerFor, type Attempt, type Writer } from './a-made-up-office-drawn-in-lanes.ts'
import { DEVELOPER, FOR_DEVELOPERS, theDeveloperLines, theUnroutedLinks, theWordForDevelopersThatWrote, type ADeveloperLine } from './a-pipeline-page-in-the-developer-view.ts'
import { waitForTheProjects } from './switch-the-project.ts'

const PROJECT = { id: 'test-developer-view', title: 'Example office for the developer view (made up)' }
const TITLE = {
  yard: 'Example yard (made up)',
  mill: 'Example mill (made up)',
  dig: 'Example dig (made up)',
  plant: 'Example plant (made up)',
  grind: 'Example grind (made up)',
  sift: 'Example sift (made up)',
  memo: 'Example memo (made up)',
  gone: 'Example gone (made up)',
  side: 'Example side card (made up)',
  back: 'Example back head (made up)',
} as const
type Key = keyof typeof TITLE
const CHECK = { what: 'Example check (made up)', because: 'Example reason it could not run (made up)' }

let db: TestDb
let app: LiveApp
let write: Writer
const id = {} as Record<Key, string>
let yardStored: Attempt
let siftStored: Attempt
let deleted: Attempt[] = []
let releaseThePresenceRead: () => void = () => undefined
/** How many times the test has answered the restriction read. */
let restrictionsAnswered = 0

beforeAll(async () => {
  db = await freshDb()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace(PROJECT)
  const person = db.api.HUMAN
  const pipeline = (key: Key): void => {
    id[key] = db.api.createRecord({ kind: 'pipeline', title: TITLE[key], workspaceId: PROJECT.id, actor: person, data: { blockIds: [] } }).id
  }
  const step = (under: Key, key: Key): void => {
    id[key] = db.blocks.addBlock(id[under], { name: TITLE[key], state: 'todo' }, person).block.id
  }
  const module = (key: Key): void => {
    id[key] = db.api.createRecord({ kind: 'module', title: TITLE[key], workspaceId: PROJECT.id, actor: person, data: { context: 'Made up for a test of the developer view.' } }).id
  }
  const link = (from: Key, type: 'feeds' | 'relates_to', to: Key): void => {
    db.api.createLink({ fromId: id[from], toId: id[to], type, actor: person })
  }
  pipeline('yard')
  step('yard', 'dig')
  step('yard', 'plant')
  pipeline('mill')
  step('mill', 'grind')
  step('mill', 'sift')
  for (const key of ['memo', 'gone', 'side', 'back'] as const) module(key)
  link('plant', 'feeds', 'grind')
  link('grind', 'feeds', 'sift')
  link('dig', 'relates_to', 'memo')
  link('yard', 'relates_to', 'memo')
  link('grind', 'relates_to', 'memo')
  link('mill', 'relates_to', 'memo')
  link('dig', 'relates_to', 'gone')

  app = await liveApp({ name: 'developer-view', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1000 } })
  write = writerFor(app, PROJECT.id, join(dirname(db.file), 'keys.json'))
  yardStored = await storeTheAreas(write, id.yard, {
    direction: 'right',
    lanes: [{ name: 'Front', arrange: 'row' }, { name: 'Side', arrange: 'row' }, { name: 'Back', arrange: 'row', head: id.back }],
    nodes: { [id.dig]: { lane: 'Front', order: 0 }, [id.plant]: { lane: 'Front', order: 1 }, [id.side]: { lane: 'Side', order: 0 } },
  })
  siftStored = await write.attempt('PUT', `/api/presentation/${encodeURIComponent(pipelineScope(id.mill))}/nodes/${encodeURIComponent(id.sift)}`, { intent: { lane: 'Front' } })
  deleted = [await write.attempt('DELETE', `/api/records/${id.gone}`), await write.attempt('DELETE', `/api/records/${id.side}`), await write.attempt('DELETE', `/api/records/${id.back}`)]

  // The two reads the test answers: see the head.
  await app.page.route(
    (url) => url.pathname === '/api/restrictions',
    async (route) => {
      const answer = await route.fetch()
      const headers = answer.headers()
      delete headers['content-length']
      await route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({ byRecord: {}, couldNotCheck: [CHECK], note: '' }) })
      restrictionsAnswered += 1
    },
  )
  const held = new Promise<void>((release) => {
    releaseThePresenceRead = release
  })
  await app.page.route(
    (url) => url.pathname === '/api/work-domains/presence',
    async (route) => {
      await held
      await route.abort().catch(() => undefined)
    },
  )
  await prepareThePage(app, PROJECT.id)
}, 300_000)
afterAll(async () => {
  releaseThePresenceRead()
  await app?.stop()
  db?.close()
}, 120_000)

function theOfficeWasMade(): void {
  theAreasWereStored(yardStored, 'yard')
  expect(siftStored.ok, `sift was stored in the lane "Front" on mill's page (PUT ${String(siftStored.status)}: ${siftStored.text})`).toBe(true)
  for (const one of deleted) expect(one.ok, `a made-up record was deleted (DELETE ${String(one.status)}: ${one.text})`).toBe(true)
}

/** A line the office makes true: its key, and either its whole words or the titles its words name. */
type Expected = { key: (typeof FOR_DEVELOPERS)[number]; words: string } | { key: (typeof FOR_DEVELOPERS)[number]; names: Key[] }

const theCheck = (): Expected => ({
  key: 'g7b.Canvas.could_not_run',
  words: `1${sayInEnglish('g7b.Canvas.restriction')} ${sayInEnglish('g7b.Canvas.check')}${sayInEnglish('g7b.Canvas.could_not_run')}: ${CHECK.what} — ${CHECK.because}`,
})
const thePresenceRead = (): Expected => ({ key: 'g7b.Canvas.reading_who_is_working_on_these_records', words: sayInEnglish('g7b.Canvas.reading_who_is_working_on_these_records') })

const PAGES: { name: Key; expected: () => Expected[] }[] = [
  {
    name: 'yard',
    expected: () => [
      { key: 'lanesInput.linkNotDrawn', names: ['dig', 'memo'] },
      { key: 'lanesInput.ownLinkNotDrawn', names: ['yard', 'memo'] },
      { key: 'lanesInput.linkBroken', names: ['dig'] },
      { key: 'lanesInput.linkOfAnotherPipelinesStep', names: ['grind', 'memo', 'mill'] },
      { key: 'lanesInput.linkOfAnAreasPipeline', names: ['mill', 'memo'] },
      { key: 'lanesInput.linkOfAnotherPipeline', names: ['grind', 'sift', 'mill'] },
      { key: 'lanesInput.unusedHints', words: sayInEnglish('lanesInput.unusedHints', { which: sayInEnglish('lanesInput.unused.direction') }) },
      { key: 'lanesInput.headNotLoaded', words: sayInEnglish('lanesInput.headNotLoaded', { lane: 'Back' }) },
      { key: 'lanesInput.placedNotLoaded', words: sayInEnglish('lanesInput.placedNotLoaded', { lane: 'Side' }) },
      theCheck(),
      thePresenceRead(),
    ],
  },
  {
    name: 'mill',
    expected: () => [
      { key: 'lanesInput.oldNodeLane', words: sayInEnglish('lanesInput.oldNodeLane', { record: TITLE.sift, lane: 'Front' }) },
      { key: 'lanesInput.ownLinkNotDrawn', names: ['mill', 'memo'] },
      { key: 'lanesInput.linkNotDrawn', names: ['grind', 'memo'] },
      theCheck(),
      thePresenceRead(),
    ],
  },
]

let loads = 0

/** Opens a pipeline's page in the developer view (`?mode=inspect`) or the normal view, and waits for its drawing. */
async function open(key: Key, view: 'developer' | 'normal'): Promise<Page> {
  loads += 1
  await app.page.goto(`${app.site}/?lang=en${view === 'developer' ? '&mode=inspect' : ''}&theme=light&load=sentences-${String(loads)}#${pipelinePath(id[key])}`)
  await waitForTheProjects(app.page)
  await theDrawingIsDrawn(app.page)
  return app.page
}

const fits = (line: ADeveloperLine, expected: Expected): boolean =>
  line.key === expected.key && ('words' in expected ? line.words === expected.words : expected.names.every((key) => line.words.includes(`“${TITLE[key]}”`)))

/** Waits for the developer section to hold every expected line, or for 30 s. */
async function theDeveloperSectionOf(page: Page, expected: Expected[]): Promise<ADeveloperLine[]> {
  let lines: ADeveloperLine[] = []
  const until = Date.now() + 30_000
  do {
    lines = await theDeveloperLines(page)
    if (expected.every((one) => lines.some((line) => fits(line, one)))) break
    await page.waitForTimeout(250)
  } while (Date.now() < until)
  return lines
}

const developerLinesSeen = new Map<Key, ADeveloperLine[]>()

for (const each of PAGES) {
  it(`${each.name}'s page, in the developer view: each sentence for developers is a line under its own key`, async () => {
    theOfficeWasMade()
    const page = await open(each.name, 'developer')
    const expected = each.expected()
    const lines = await theDeveloperSectionOf(page, expected)
    developerLinesSeen.set(each.name, lines)
    console.log(`${each.name}, developer view:\n${lines.map((line) => `  ${line.key} | ${line.words}`).join('\n')}`)
    expect(expected.filter((one) => !lines.some((line) => fits(line, one))), `${each.name}: the lines the office makes true, each under its key`).toEqual([])
    const misnamed: string[] = []
    for (const line of lines) {
      const wrote = await theWordForDevelopersThatWrote(line.words)
      if (wrote !== line.key) misnamed.push(`${line.key} names "${line.words}", which ${wrote ?? 'no word for developers'} writes`)
    }
    expect(misnamed, `${each.name}: every line names the key whose words it says`).toEqual([])
    expect(await app.page.locator(DEVELOPER).count(), 'no developer section is drawn').toBe(0)
    expect(await app.page.locator(`${DRAWING}[data-to-developers]`).count()).toBe(1)
    expect(lines.some((line) => line.key === 'lanes.noRoute')).toBe(false)
    expect(await theUnroutedLinks(page)).toEqual(JSON.parse((await page.locator(DRAWING).getAttribute('data-not-drawn'))!))
    expect(await app.page.locator(DRAWING).count(), `${each.name}: the developer view still draws the drawing`).toBe(1)
  }, 120_000)
}

for (const each of PAGES) {
  it(`${each.name}'s page, in the normal view: no developer section, and none of its lines`, async () => {
    theOfficeWasMade()
    const seen = developerLinesSeen.get(each.name)
    expect(seen, `${each.name}'s developer view was read first`).toBeDefined()
    const answeredBefore = restrictionsAnswered
    const page = await open(each.name, 'normal')
    await expect.poll(() => restrictionsAnswered, { message: `${each.name}: the restriction read of this load was answered`, timeout: 60_000 }).toBeGreaterThan(answeredBefore)
    const reading = sayInEnglish('g7b.Canvas.reading_what_restricts_these_records')
    await expect
      .poll(async () => (await page.locator('.pp').innerText()).includes(reading), { message: `${each.name}: the page no longer says it is reading what restricts its records`, timeout: 30_000 })
      .toBe(false)
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
    expect(await page.locator(DEVELOPER).count(), `${each.name}: the normal view draws no developer section`).toBe(0)
    expect(await theDeveloperLines(page)).toEqual(seen)
    const text = (await page.locator('.pp').innerText()).replace(/\s+/g, ' ')
    expect(seen!.filter((line) => text.includes(line.words)).map((line) => line.key), `${each.name}: the normal view says no line of the developer section`).toEqual([])
    const said = await page.locator(`${SAID} p`).evaluateAll((all) => all.map((p) => (p.textContent ?? '').replace(/\s+/g, ' ').trim()))
    const forDevelopers: string[] = []
    for (const sentence of said) {
      const key = await theWordForDevelopersThatWrote(sentence)
      if (key !== null) forDevelopers.push(`${key}: ${sentence}`)
    }
    expect(forDevelopers, `${each.name}: the said section of the normal view holds no sentence for developers`).toEqual([])
  }, 120_000)
}

it('keeps developer lines on both empty drawing states in both views', async () => {
  const empty = await write.call('POST', '/api/records', { kind: 'pipeline', title: 'Empty pipeline (made up)', data: { blockIds: [] } }) as { record: { id: string } }
  const emptyMaster = await write.call('POST', '/api/records', { kind: 'pipeline', title: 'Empty master (made up)', data: { blockIds: [] } }) as { record: { id: string } }
  for (const one of [empty, emptyMaster]) await write.call('POST', '/api/links', { fromId: one.record.id, toId: id.memo, type: 'relates_to' })
  await write.call('PUT', `/api/projects/${PROJECT.id}/master-pipeline`, { pipeline: emptyMaster.record.id })
  for (const [record, selector] of [[empty, '.gx-projection'], [emptyMaster, '.pp-no-boxes']] as const) {
    for (const mode of ['', '&mode=inspect']) {
      await app.page.goto(`${app.site}/?lang=en${mode}#${pipelinePath(record.record.id)}`)
      const element = app.page.locator(`${selector}[data-to-developers]`)
      await element.waitFor({ timeout: 60_000 })
      await expect.poll(async () => (await theDeveloperLines(app.page)).some((line) => line.key === 'lanesInput.ownLinkNotDrawn')).toBe(true)
      expect(await app.page.locator(DEVELOPER).count()).toBe(0)
    }
  }
}, 240_000)
