// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chromium, type BrowserContext, type Page } from 'playwright'
import { build } from 'vite'
import { mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
// @ts-expect-error The database-free screen shell is shared with the JS browser tools.
import { screenWorld } from './fixtures/screen-read-world.mjs'
import { words } from '../src/words.ts'
import { liveShapeViews, liveSizeRoster } from './live-shape-roster.ts'

// On the built page at the live office's size: the frame ends at or above the window's bottom edge,
// after Fit office and on the first view. Fit then fills the frame's usable inner box: the map keeps
// 48 pixels back for its own signs, so the office reaches the inner width or height less that margin.
// The first view opens at native zoom on the first person, so the whole office is not in frame there;
// what must be inside the window is the map's frame and the part of the canvas the frame shows.
type Hooks = { __officeMapScreenTest?: { layout?: { preview?: boolean; ownership?: boolean }; camera?: { zoom: number } } }
type Shell = { configure: (value: unknown) => void; openPlugin: () => void }
const plugin = resolve(import.meta.dirname, '..'), LIMIT_MS = 60000
const CASES = [[1440, 1000], [990, 1000], [660, 900], [390, 844]] as const
let world: { url: string; close: () => Promise<void> }, browser: BrowserContext, profile: string, built: string, page: Page | undefined
beforeAll(async () => {
  built = mkdtempSync('/dev/shm/office-map-fit-window-page-')
  // A production page, as the office builds it (tools/build-a-plugin.mjs), into a folder of its own.
  const callers = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'production'
    await build({ root: plugin, base: './', configFile: false, envDir: false, logLevel: 'warn',
      build: { outDir: built, emptyOutDir: true, rolldownOptions: { input: { main: join(plugin, 'main.html') } } } })
  } finally { if (callers === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = callers }
  world = await screenWorld({ built })
  profile = mkdtempSync('/dev/shm/office-map-fit-window-profile-')
  browser = await chromium.launchPersistentContext(profile, { headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 1000 } })
}, 120000)
afterAll(async () => {
  await browser?.close(); await world?.close()
  for (const folder of [profile, built]) if (folder) rmSync(folder, { recursive: true, force: true })
})

for (const [width, height] of CASES) it(`keeps the office inside the window at ${width}x${height}, after Fit office and on the first view`, async () => {
  await page?.close(); page = await browser.newPage(); await page.setViewportSize({ width, height })
  const thrown: string[] = []
  page.on('pageerror', error => thrown.push(error.message))
  await page.goto(world.url)
  // The plugin is the window under test, so its frame is the height the browser window has.
  await page.addStyleTag({ content: `iframe{height:${height}px!important}` })
  await page.evaluate(fixture => { const shell = window as unknown as Shell; shell.configure({ fixture }); shell.openPlugin() }, { synthetic: true, views: liveShapeViews(liveSizeRoster()) })
  await page.waitForFunction(() => document.querySelector('iframe')?.contentWindow !== null)
  const frame = page.frames().find(one => one.url().endsWith('/plugin/main.html'))!
  expect(await frame.evaluate(() => innerHeight)).toBe(height)
  // The first view: the whole layout has arrived, and its first seats are drawn at native zoom.
  await frame.waitForFunction(() => {
    const layout = (window as unknown as Hooks).__officeMapScreenTest?.layout, canvas = document.querySelector<HTMLCanvasElement>('.map-plane canvas')
    return layout !== undefined && !layout.preview && canvas?.dataset['paintReady'] === 'true' && canvas.dataset['mode'] !== 'overview'
  }, undefined, { timeout: 90000, polling: 100 })
  const first = await frame.evaluate(() => {
    const rect = (box: DOMRect) => ({ left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height })
    const node = document.querySelector<HTMLElement>('.map-viewport')!, view = node.getBoundingClientRect()
    const canvas = document.querySelector<HTMLCanvasElement>('.map-plane canvas')!.getBoundingClientRect()
    // The frame's inner box: its box less its border, the size of clientWidth and clientHeight.
    const style = getComputedStyle(node), borderLeft = parseFloat(style.borderLeftWidth), borderTop = parseFloat(style.borderTopWidth)
    const inner = { left: view.left + borderLeft, top: view.top + borderTop, right: view.left + borderLeft + node.clientWidth, bottom: view.top + borderTop + node.clientHeight }
    // The canvas is larger than the frame, which cuts it off: a person sees only this part.
    const shown = { left: Math.max(canvas.left, inner.left), top: Math.max(canvas.top, inner.top), right: Math.min(canvas.right, inner.right), bottom: Math.min(canvas.bottom, inner.bottom) }
    return { windowHeight: innerHeight, windowWidth: innerWidth, view: rect(view), canvas: rect(canvas), inner, shown, clientWidth: node.clientWidth, clientHeight: node.clientHeight, scrollY }
  })
  expect(first.view.top, 'the first view shows the frame top in the window').toBeGreaterThanOrEqual(0)
  expect(first.view.top).toBeLessThan(first.windowHeight)
  expect(first.view.bottom, 'the frame ends at or above the window bottom on the first view').toBeLessThanOrEqual(first.windowHeight + 2)
  expect(first.shown.top, 'the visible part of the drawn map starts in the window').toBeGreaterThanOrEqual(-2)
  expect(first.shown.bottom, 'the visible part of the drawn map ends at or above the window bottom on the first view').toBeLessThanOrEqual(first.windowHeight + 2)
  const covers = first.canvas.left <= first.inner.left + 2 && first.canvas.top <= first.inner.top + 2 && first.canvas.right >= first.inner.right - 2 && first.canvas.bottom >= first.inner.bottom - 2
  expect(covers, 'the drawn map covers the frame on the first view').toBe(true)

  const took = await frame.evaluate(async ([label, limit]) => {
    const fitButton = [...document.querySelectorAll('button')].find(button => button.textContent === label)!
    const start = performance.now(); fitButton.click()
    while (document.querySelector<HTMLCanvasElement>('.map-plane canvas')!.dataset['paintReady'] !== 'true') {
      if (performance.now() - start > limit) return null
      await new Promise(done => setTimeout(done, 20))
    }
    return performance.now() - start
  }, [words.en.fit, LIMIT_MS] as const)
  expect(took, 'milliseconds from the press to the finished paint').not.toBeNull()
  const fitted = await frame.evaluate(() => {
    const rect = (box: DOMRect) => ({ left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height })
    const viewNode = document.querySelector<HTMLElement>('.map-viewport')!, planeNode = document.querySelector<HTMLElement>('.map-plane')!
    const view = viewNode.getBoundingClientRect(), plane = planeNode.getBoundingClientRect()
    const padX = Number(planeNode.dataset['paddingX']), padY = Number(planeNode.dataset['paddingY'])
    const left = plane.left + padX, top = plane.top + padY, right = plane.right - padX, bottom = plane.bottom - padY
    const office = { left, top, right, bottom, width: right - left, height: bottom - top }
    const layout = (window as unknown as Hooks).__officeMapScreenTest!.layout!
    return { windowHeight: innerHeight, windowWidth: innerWidth, view: rect(view), office, clientWidth: viewNode.clientWidth, clientHeight: viewNode.clientHeight, gutter: layout.ownership ? 48 : 0, zoom: (window as unknown as Hooks).__officeMapScreenTest!.camera!.zoom }
  })
  expect(fitted.view.top, 'the frame top stays in the window after Fit office').toBeGreaterThanOrEqual(0)
  expect(fitted.view.bottom, 'the frame ends at or above the window bottom after Fit office').toBeLessThanOrEqual(fitted.windowHeight + 2)
  expect(fitted.office.top, 'the office starts in the window after Fit office').toBeGreaterThanOrEqual(-2)
  expect(fitted.office.left, 'the office starts in the window after Fit office').toBeGreaterThanOrEqual(-2)
  expect(fitted.office.bottom, 'no part of the office lies below the window bottom after Fit office').toBeLessThanOrEqual(fitted.windowHeight + 2)
  expect(fitted.office.right, 'no part of the office lies outside the window to the right after Fit office').toBeLessThanOrEqual(fitted.windowWidth + 2)
  const reachesWidth = Math.abs(fitted.office.width - (fitted.clientWidth - fitted.gutter)) <= 2
  const reachesHeight = Math.abs(fitted.office.height - (fitted.clientHeight - fitted.gutter)) <= 2
  expect(reachesWidth || reachesHeight, `the office reaches the frame's usable inner width or height (office ${fitted.office.width}x${fitted.office.height}, frame ${fitted.clientWidth}x${fitted.clientHeight}, margin ${fitted.gutter}, zoom ${fitted.zoom})`).toBe(true)
  expect(thrown).toEqual([])
}, 240000)

it('refits a changed frame until the person zooms the map', async () => {
  await page?.close(); page = await browser.newPage(); await page.setViewportSize({ width: 660, height: 900 })
  await page.goto(world.url)
  await page.addStyleTag({ content: 'iframe{height:900px!important}' })
  await page.evaluate(fixture => { const shell = window as unknown as Shell; shell.configure({ fixture }); shell.openPlugin() }, { synthetic: true, views: liveShapeViews(liveSizeRoster()) })
  await page.waitForFunction(() => document.querySelector('iframe')?.contentWindow !== null)
  const frame = page.frames().find(one => one.url().endsWith('/plugin/main.html'))!
  await frame.waitForFunction(() => {
    const layout = (window as unknown as Hooks).__officeMapScreenTest?.layout, canvas = document.querySelector<HTMLCanvasElement>('.map-plane canvas')
    return layout !== undefined && !layout.preview && canvas?.dataset['paintReady'] === 'true' && canvas.dataset['mode'] !== 'overview'
  }, undefined, { timeout: 90000, polling: 100 })
  await frame.getByRole('button', { name: words.en.fit, exact: true }).click()
  await frame.waitForFunction(() => document.querySelector<HTMLCanvasElement>('.map-plane canvas')?.dataset['paintReady'] === 'true')
  const before = await frame.evaluate(() => ({ height: document.querySelector<HTMLElement>('.map-viewport')!.clientHeight, zoom: (window as unknown as Hooks).__officeMapScreenTest!.camera!.zoom }))
  // Model a line above the frame growing by one row, then shrinking back.
  await frame.locator('.map-tools').evaluate(node => { (node as HTMLElement).style.paddingBottom = '52px' })
  await frame.waitForFunction(old => {
    const view = document.querySelector<HTMLElement>('.map-viewport')!, hooks = (window as unknown as Hooks).__officeMapScreenTest
    return view.clientHeight <= old.height - 50 && !!hooks?.camera && hooks.camera.zoom < old.zoom && document.querySelector<HTMLCanvasElement>('.map-plane canvas')?.dataset['paintReady'] === 'true'
  }, before, { timeout: 60000 })
  const smallerZoom = await frame.evaluate(() => (window as unknown as Hooks).__officeMapScreenTest!.camera!.zoom)
  await frame.getByRole('button', { name: words.en.zoomIn, exact: true }).click()
  await frame.waitForFunction(old => {
    const zoom = (window as unknown as Hooks).__officeMapScreenTest?.camera?.zoom
    return zoom !== undefined && zoom > old && document.querySelector<HTMLCanvasElement>('.map-plane canvas')?.dataset['paintReady'] === 'true'
  }, smallerZoom, { timeout: 60000 })
  const manualZoom = await frame.evaluate(() => (window as unknown as Hooks).__officeMapScreenTest!.camera!.zoom)
  await frame.locator('.map-tools').evaluate(node => { (node as HTMLElement).style.paddingBottom = '' })
  await frame.waitForFunction(old => document.querySelector<HTMLElement>('.map-viewport')!.clientHeight >= old - 2, before.height, { timeout: 60000 })
  await page.waitForTimeout(200)
  await frame.waitForFunction(() => document.querySelector<HTMLCanvasElement>('.map-plane canvas')?.dataset['paintReady'] === 'true', undefined, { timeout: 60000 })
  expect(await frame.evaluate(() => (window as unknown as Hooks).__officeMapScreenTest!.camera!.zoom), 'a later frame change keeps the person’s zoom').toBeCloseTo(manualZoom, 6)
}, 240000)
