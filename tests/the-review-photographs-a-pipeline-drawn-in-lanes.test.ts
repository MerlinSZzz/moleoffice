// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW PHOTOGRAPHS A PIPELINE DRAWN IN LANES. Wave 13u round 231.
 *
 * WHAT WENT WRONG. `node tools/review.mjs` takes "the graph behaviour pictures" in photographGraphCases. For the drawing
 * of every module and for one pipeline's page, it waited for a drawn canvas (`.gx-canvas-wrap[data-state="drawn"]`),
 * photographed the canvas at the size it opens, pressed `Fit all` and photographed it again. Since wave 13u round 230
 * (3e6bd72a7) a pipeline's page draws its lanes in place of the canvas. So the pipeline case waited 30 seconds for a
 * canvas that never comes, and every review since then has ended with exit 1 and the line "the graph behaviour pictures
 * — NOT TAKEN — the graph behaviour pictures could not all be taken (2 of them were): page.waitForSelector: Timeout
 * 30000ms exceeded".
 *
 * THE REVIEW'S OWN CODE IS RUN, CUT OUT OF ITS FILE. photographGraphCases is not exported, and it reads the web port,
 * the folder for its pictures and the browsers' fixed instant from its module. So the review's graph section, from
 * pressFitAll to the end of photographGraphCases, is cut out of the source of tools/review.mjs and run in a context that
 * holds the module's exports and those three names, as tests/review-proves-a-derived-layout-by-a-measure.test.ts runs
 * proveLayoutIsDerived. None of it is copied here.
 *
 * THE PAGES ARE REAL. A test office from liveApp, served the built page, holds the made-up office of
 * tests/a-made-up-office-drawn-in-lanes.ts. The review is given the two addresses a real run gives it, worked out the
 * same way: the drawing of every module, and the page of one pipeline, here the one drawn in areas. Its browser is the
 * real one with two things added: each context it makes opens in the made-up project, and the element of each picture
 * is read just before the picture is taken. The pictures go to a folder of the test's own, which is removed at the end.
 * No clock is fixed: the review fixes it from what its reset printed, and this office has no reset.
 *
 * WHAT IS PROVED, in one case, at 1440 by 1000 in the light theme, where the review takes these pictures:
 *   - first, that the pipeline's page draws lanes and no canvas, read on the test's own page as the lanes tests read it;
 *   - the review's line says TAKEN, with four pictures, and names each picture it put on the sheet: two of the modules
 *     and two of the pipeline;
 *   - each of the pipeline's two pictures is of the drawn lanes, not of the page and not of nothing: at the shutter the
 *     element is `[data-drawing="lanes"]` with its data-drawn-links, it is shown, it holds at least one card, and it is
 *     wider and taller than 0. Each file is a picture wider and taller than 0, and the whole page is never photographed;
 *   - each of the modules' two pictures is still of the drawn canvas: at the shutter the element is `.gx-canvas`, inside
 *     a `.gx-canvas-wrap` that says it is drawn.
 * A red line on the first check names every selector the review waited for, and on which address.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import type { Browser, BrowserContext, Locator, Page } from 'playwright'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

import * as review from '../tools/review.mjs'
import { pipelinePath } from '../src/web/components/router.tsx'
import { liveApp, type LiveApp } from './helpers.ts'
import {
  buildTheMadeUpOffice,
  DRAWING,
  openThePage,
  prepareThePage,
  PROJECT,
  theDrawingIsDrawn,
  writerFor,
  type MadeUpOffice,
} from './a-made-up-office-drawn-in-lanes.ts'

const source = readFileSync(new URL('../tools/review.mjs', import.meta.url), 'utf8')
const routerSource = ['../src/shared/addresses.ts', '../src/web/components/router.tsx']
  .map((file) => readFileSync(new URL(file, import.meta.url), 'utf8'))
  .join('\n\n')

/** The review's graph section: pressFitAll, and everything after it to the end of photographGraphCases. */
const section =
  /^async function pressFitAll\(tab\) \{\n[\s\S]*?^async function photographGraphCases\(browser, shots, addresses\) \{\n[\s\S]*?\n\}\n/m
    .exec(source)

/** One of the cases the review is asked to photograph, and one row it puts on its sheet. */
interface Case { address: string; name: string; what: string }
interface Shot { file: string; address: string }
type PhotographGraphCases = (browser: Browser, shots: Shot[], addresses: Case[]) => Promise<string>

/** The element of one picture, read just before the picture was taken. */
interface AtTheShutter {
  address: string
  lanes: boolean
  canvas: boolean
  shown: boolean
  cards: number
  width: number
  height: number
}

/** What the review's browser saw while the review used it. */
interface Watched {
  shutters: AtTheShutter[]
  /** Each selector the review waited for, with the address it waited on. */
  waits: string[]
  /** The address of each picture of a whole page. */
  pages: string[]
}

/** Runs in the page, on the element about to be photographed. */
function theElement(element: Element, drawing: string) {
  const box = element.getBoundingClientRect()
  return {
    lanes: element.matches(`${drawing}[data-drawn-links]`),
    canvas: element.matches('.gx-canvas') && element.closest('.gx-canvas-wrap')?.getAttribute('data-state') === 'drawn',
    shown: element.checkVisibility(),
    cards: element.querySelectorAll('.e-card').length,
    width: box.width,
    height: box.height,
  }
}

const hereIn = (tab: Page): string => new URL(tab.url()).hash

/** A page of the review's, watched: its waits, its whole-page pictures, and the element of each element picture. */
function watched(tab: Page, seen: Watched): Page {
  const wait = tab.waitForSelector.bind(tab) as (selector: string, options?: object) => Promise<unknown>
  vi.spyOn(tab, 'waitForSelector').mockImplementation(((selector: string, options?: object) => {
    seen.waits.push(`${selector} on ${hereIn(tab)}`)
    return wait(selector, options)
  }) as unknown as Page['waitForSelector'])
  const photograph = tab.screenshot.bind(tab)
  vi.spyOn(tab, 'screenshot').mockImplementation(async (options) => {
    seen.pages.push(hereIn(tab))
    return photograph(options)
  })
  const locate = tab.locator.bind(tab)
  vi.spyOn(tab, 'locator').mockImplementation((selector, options) => {
    const found: Locator = locate(selector, options)
    const shoot = found.screenshot.bind(found)
    vi.spyOn(found, 'screenshot').mockImplementation(async (shotOptions) => {
      seen.shutters.push({ address: hereIn(tab), ...await found.evaluate(theElement, DRAWING) })
      return shoot(shotOptions)
    })
    return found
  })
  return tab
}

/** The real browser, whose contexts open in the made-up project and whose pages are watched. */
function theReviewsBrowser(browser: Browser, seen: Watched): Browser {
  const stand = {
    newContext: async (options?: Parameters<Browser['newContext']>[0]): Promise<BrowserContext> => {
      const context = await browser.newContext(options)
      await context.addInitScript((project) => { localStorage.setItem('mole-office.workspace', project) }, PROJECT.id)
      const open = context.newPage.bind(context)
      vi.spyOn(context, 'newPage').mockImplementation(async () => watched(await open(), seen))
      return context
    },
  }
  return stand as unknown as Browser
}

/** A PNG's width and height, from its header. */
function theSizeOf(file: string): { width: number; height: number } {
  const bytes = readFileSync(file)
  expect(bytes.subarray(1, 4).toString('latin1'), `${file} is a PNG`).toBe('PNG')
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

let app: LiveApp
let office: MadeUpOffice
const directory = mkdtempSync(join(tmpdir(), 'review-lanes-'))

beforeAll(async () => {
  app = await liveApp({ name: 'review-lanes', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  office = await buildTheMadeUpOffice(writerFor(app, PROJECT.id))
  await prepareThePage(app, PROJECT.id)
}, 240_000)

afterAll(async () => {
  await app?.stop()
  rmSync(directory, { recursive: true, force: true })
})

it("the review waits for the drawn lanes on a pipeline's page and photographs them, and photographs the modules' drawn canvas as before", async () => {
  if (section === null) {
    throw new Error('tools/review.mjs has no graph section to cut out: no pressFitAll(tab) followed by photographGraphCases(browser, shots, addresses).')
  }
  const pipeline = office.id['drawn']!
  const pipelineAddress = `#${pipelinePath(pipeline)}`
  const modulesAddress = review.theProjectDrawingAddress(routerSource, `#${pipelinePath()}`)

  await openThePage(app, pipelinePath(pipeline))
  await theDrawingIsDrawn(app.page)
  expect(await app.page.locator('.gx-canvas-wrap').count(), `a canvas on the pipeline's page ${pipelineAddress}, which draws lanes`).toBe(0)

  const seen: Watched = { shutters: [], waits: [], pages: [] }
  const shots: Shot[] = []
  const photographGraphCases = runInNewContext(`${section[0]}\nphotographGraphCases`, {
    ...review,
    theBrowsersFixedInstant: null,
    webPort: app.webPort,
    outDir: directory,
    join,
  }) as PhotographGraphCases
  const line = await photographGraphCases(theReviewsBrowser(app.browser, seen), shots, [
    { address: modulesAddress, name: 'cases-modules', what: 'the modules of the made-up office' },
    { address: pipelineAddress, name: 'cases-pipeline', what: 'the made-up pipeline drawn in areas' },
  ])

  expect(line, `the review's line for its graph pictures, where the pipeline's page draws lanes (${DRAWING}) and no canvas. ` +
    `The review waited for: ${seen.waits.join('; ')}`).toMatch(/^TAKEN — 4 pictures: /)
  const files = (name: string): string[] => shots.map((shot) => shot.file).filter((file) => file.startsWith(`${name}-`))
  expect(files('cases-modules'), "the modules' pictures on the sheet").toHaveLength(2)
  expect(files('cases-pipeline'), "the pipeline's pictures on the sheet").toHaveLength(2)
  for (const file of shots.map((shot) => shot.file)) expect(line, `the line names ${file}`).toContain(file)

  expect(seen.shutters.map((one) => one.address), 'the address of each element photographed').toEqual(
    [modulesAddress, modulesAddress, pipelineAddress, pipelineAddress])
  const [modulesOpen, modulesWhole, pipelineOpen, pipelineWhole] = seen.shutters
  for (const [one, file] of [[pipelineOpen!, files('cases-pipeline')[0]!], [pipelineWhole!, files('cases-pipeline')[1]!]] as const) {
    expect(one, `${file} is of the drawn lanes (${DRAWING} with data-drawn-links), shown: ${JSON.stringify(one)}`)
      .toMatchObject({ lanes: true, canvas: false, shown: true })
    expect(one.cards, `the cards in the element of ${file}`).toBeGreaterThan(0)
    expect(one.width, `the width of the element of ${file}`).toBeGreaterThan(0)
    expect(one.height, `the height of the element of ${file}`).toBeGreaterThan(0)
    const size = theSizeOf(join(directory, file))
    expect(size.width, `the width of ${file}`).toBeGreaterThan(0)
    expect(size.height, `the height of ${file}`).toBeGreaterThan(0)
  }
  for (const one of [modulesOpen!, modulesWhole!]) {
    expect(one, `a picture of the modules is of the drawn canvas: ${JSON.stringify(one)}`)
      .toMatchObject({ canvas: true, lanes: false, shown: true })
  }
  expect(seen.pages, 'the addresses where the review photographed a whole page instead of a drawing').toEqual([])
}, 180_000)
