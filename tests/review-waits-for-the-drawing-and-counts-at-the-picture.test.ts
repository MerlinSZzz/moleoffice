// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Wave 13y round 77: the review waits for a drawing that is still loading, and counts a page's text
 * at the moment it takes the picture.
 *
 * WHAT WENT WRONG. A page that holds the project drawing shows a loading line while the drawing
 * engine loads, and the page says it is ready before the engine has come, because the engine is a
 * script and not a request. The review looked for a canvas once, found none, and photographed the
 * loading line at every width that draws the canvas. It also counted the page's text after the
 * picture, so the count could describe a later page than the one in the picture.
 *
 * THE STAND-IN PAGES. Each one is invented content in a blank page that says it is ready at once.
 * The loading line is drawn with the element and class the structure view gives it, read out of that
 * file, so this test follows the page if the page changes how it marks the line. The text is counted
 * with the review's own census, read out of tools/review.mjs and run in the page.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, type Browser, type Page, type PageScreenshotOptions } from 'playwright'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { photographEach, takeReviewPicture } from '../tools/review.mjs'

const reviewSource = readFileSync(new URL('../tools/review.mjs', import.meta.url), 'utf8')
const structureView = readFileSync(new URL('../src/web/components/graph/StructureView.tsx', import.meta.url), 'utf8')

/** The line the structure view draws while the engine loads: its element and its class. */
const engineLine =
  /<Suspense\s+fallback=\{<(\w+) className="([^"]+)">\{t\('g7b\.StructureView\.fetching_the_drawing_engine'\)\}/
    .exec(structureView)
if (engineLine === null) {
  throw new Error(
    'src/web/components/graph/StructureView.tsx no longer draws its engine loading line as a Suspense fallback ' +
      'with a class, so the review\'s wait for a drawing has to be looked at again.',
  )
}
const [, lineElement, lineClass] = engineLine
const loadingLine = 'This invented line stands in for the drawing engine loading.'

/** The review's census, the function that runs in the browser, as source text. */
const census = /function contentCensusInPage\(\) \{[^]*?\n\}/.exec(reviewSource)?.[0]
if (census === undefined) throw new Error('tools/review.mjs has no contentCensusInPage to read.')
type Census = { found: boolean, texts: number, words: number, marks: number, boxes: number, height: number }
const countNow = (tab: Page) => tab.evaluate(`(${census})()`) as Promise<Census>

const viewport = { width: 660, height: 800 }
const picture = { page: { name: 'invented drawing page' }, viewport, theme: 'light' }
const directory = mkdtempSync(join(tmpdir(), 'review-drawing-'))
let browser: Browser

beforeAll(async () => { browser = await chromium.launch() })
afterAll(async () => {
  await browser?.close()
  rmSync(directory, { recursive: true, force: true })
})

function emptyShot() {
  return {
    canvas: null as string | null,
    height: null as number | null,
    file: null as string | null,
    content: null as Parameters<typeof takeReviewPicture>[2]['content'],
    blank: null as string | null,
    error: null as string | null,
    notSettled: null as string | null,
  }
}

/** A page that holds a drawing. When `comes`, the canvas arrives after the loading line and lays itself out. */
function drawingPage(comes: boolean): string {
  return `<html data-mole-office-ready=""><body><main class="page">
    <h1>An invented page that holds a drawing</h1>
    <div id="stage"><${lineElement} class="${lineClass}">${loadingLine}</${lineElement}></div>
  </main>${comes ? `<script>
    setTimeout(() => {
      document.getElementById('stage').innerHTML =
        '<div class="gx-canvas-wrap" data-state="laying-out"><div class="gx-canvas" style="height: 160px">' +
        '<p>An invented card on the drawing.</p><p>A second invented card.</p></div></div>'
      setTimeout(() => document.querySelector('.gx-canvas-wrap').setAttribute('data-state', 'drawn'), 300)
    }, 1200)
  </script>` : ''}</body></html>`
}

/** What the page showed when the camera was asked for the picture. */
function watchTheShutter(tab: Page, after?: () => Promise<unknown>) {
  const seen = { loading: null as boolean | null, canvas: null as string | null, census: null as Census | null }
  const capture = tab.screenshot.bind(tab)
  vi.spyOn(tab, 'screenshot').mockImplementation(async (options?: PageScreenshotOptions) => {
    Object.assign(seen, await tab.evaluate((selector) => ({
      loading: [...document.querySelectorAll(selector)].some((line) => line.checkVisibility()),
      canvas: document.querySelector('.gx-canvas-wrap')?.getAttribute('data-state') ?? null,
    }), `main.page .${lineClass}`))
    seen.census = await countNow(tab)
    const bytes = await capture(options)
    await after?.()
    return bytes
  })
  return seen
}

it('a drawing still loading when the page says it is ready is waited for, and the picture is of the drawn canvas', async () => {
  const tab = await browser.newPage({ viewport })
  try {
    await tab.setContent(drawingPage(true))
    expect(await tab.locator('.gx-canvas-wrap').count(), 'the stand-in drew its canvas before the review looked').toBe(0)
    const atTheShutter = watchTheShutter(tab)
    const shot = emptyShot()
    await takeReviewPicture(tab, viewport, shot, 'drawn.png', directory, 10_000)
    expect(atTheShutter.loading, 'the camera ran while the loading line still showed').toBe(false)
    expect(atTheShutter.canvas, 'the camera ran before the canvas said it was drawn').toBe('drawn')
    expect(shot.canvas, 'the sheet has no line saying the canvas was settled').not.toBeNull()
    expect(shot.error).toBeNull()
    expect(shot.file).toBe('drawn.png')
  } finally { await tab.close() }
}, 30_000)

it('a drawing that never comes fails its picture within the bound, and the failure names the loading line', async () => {
  const hold = { browser: await chromium.launch() }
  try {
    const tab = await hold.browser.newPage({ viewport })
    await tab.setContent(drawingPage(false))
    const capture = vi.spyOn(tab, 'screenshot')
    const shot = emptyShot()
    const said: string[] = []
    const bound = 1500
    const started = performance.now()
    const lost = await photographEach(hold, [picture],
      async () => takeReviewPicture(tab, viewport, shot, 'never.png', directory, bound),
      () => chromium.launch(), (line: string) => said.push(line))
    expect(performance.now() - started, 'the picture failed before its bound had passed').toBeGreaterThanOrEqual(bound)
    expect(lost, 'a page whose drawing never came was kept as a picture').toHaveLength(1)
    const error = lost[0]?.error
    expect(error).toContain(loadingLine)
    expect(error).toContain(`${bound / 1000} seconds`)
    expect(shot.error).toBe(error)
    expect(said[0]).toContain(error)
    expect(capture).not.toHaveBeenCalled()
    expect(shot.file).toBeNull()
    expect(shot.content).toBeNull()
    expect(existsSync(join(directory, 'never.png'))).toBe(false)
  } finally { await hold.browser.close() }
}, 30_000)

it('a page with no drawing is photographed without waiting for one', async () => {
  const tab = await browser.newPage({ viewport })
  try {
    await tab.setContent(`<html data-mole-office-ready=""><body><main class="page">
      <h1>An invented page with no drawing</h1><p>This is invented content, and no drawing belongs on this page.</p>
    </main></body></html>`)
    const shot = emptyShot()
    const bound = 3000
    const started = performance.now()
    await takeReviewPicture(tab, viewport, shot, 'none.png', directory, bound)
    expect(performance.now() - started, 'a page with no drawing waited out the bound').toBeLessThan(bound)
    expect(shot.error).toBeNull()
    expect(shot.file).toBe('none.png')
    expect(shot.canvas).toBeNull()
  } finally { await tab.close() }
}, 30_000)

it('the text is counted at the picture, not after the page has moved on', async () => {
  const tab = await browser.newPage({ viewport })
  try {
    await tab.setContent(`<html data-mole-office-ready=""><body><main class="page">
      <h1>An invented page that changes after its picture</h1><p>This invented paragraph is there at the picture.</p>
    </main></body></html>`)
    const atTheShutter = watchTheShutter(tab, () => tab.evaluate(() => {
      document.querySelector('main')?.insertAdjacentHTML('beforeend',
        '<p>Invented words written after the picture.</p>'.repeat(3))
    }))
    const shot = emptyShot()
    await takeReviewPicture(tab, viewport, shot, 'moved-on.png', directory, 10_000)
    const afterwards = await countNow(tab)
    expect(afterwards.texts, 'the stand-in did not change after the picture').toBeGreaterThan(atTheShutter.census!.texts)
    expect(shot.content, 'the count describes a later page than the picture').toEqual(atTheShutter.census)
  } finally { await tab.close() }
}, 30_000)

it('the text is counted after the waits for a settled page, not before them', async () => {
  const tab = await browser.newPage({ viewport })
  try {
    await tab.setContent(`<html data-mole-office-ready=""><head><style>
      .late { opacity: 0; animation: arrive 2s steps(1, end) forwards; }
      @keyframes arrive { to { opacity: 1; } }
    </style></head><body><main class="page">
      <h1>An invented page whose last paragraph arrives with its motion</h1>
      <p>This invented paragraph is there from the start.</p>
      <p class="late">This invented paragraph shows when its motion ends.</p>
    </main></body></html>`)
    const atReady = await countNow(tab)
    const atTheShutter = watchTheShutter(tab)
    const shot = emptyShot()
    await takeReviewPicture(tab, viewport, shot, 'arrived.png', directory, 10_000)
    expect(atTheShutter.census!.texts, 'the stand-in did not change while the review waited').toBeGreaterThan(atReady.texts)
    expect(shot.content, 'the count describes an earlier page than the picture').toEqual(atTheShutter.census)
  } finally { await tab.close() }
}, 30_000)
