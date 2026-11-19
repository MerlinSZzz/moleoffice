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

// On the built page, at the live office's size: Fit office puts every room on screen and the paint
// finishes. At that zoom no area name fits at ten pixels, so the page says the names are left out,
// and nothing is thrown. Before, the paint stopped at the first name and never finished. The limit
// only tells finished from stopped: a time under load is not a merge gate (tests/the-timing-tests.ts).
type Box = { x: number; y: number; width: number; height: number }
type Camera = { left: number; top: number; width: number; height: number }
type Hooks = { __officeMapScreenTest?: { layout?: { preview?: boolean; rooms: Box[] }; camera?: { zoom: number; actual: Camera } } }
type Shell = { configure: (value: unknown) => void; openPlugin: () => void }
const plugin = resolve(import.meta.dirname, '..'), LIMIT_MS = 60000
let world: { url: string; close: () => Promise<void> }, browser: BrowserContext, profile: string, built: string, page: Page | undefined
beforeAll(async () => {
  built = mkdtempSync('/dev/shm/office-map-fit-page-')
  // A production page, as the office builds it (tools/build-a-plugin.mjs), into a folder of its own.
  const callers = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'production'
    await build({ root: plugin, base: './', configFile: false, envDir: false, logLevel: 'warn',
      build: { outDir: built, emptyOutDir: true, rolldownOptions: { input: { main: join(plugin, 'main.html') } } } })
  } finally { if (callers === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = callers }
  world = await screenWorld({ built })
  profile = mkdtempSync('/dev/shm/office-map-fit-page-profile-')
  browser = await chromium.launchPersistentContext(profile, { headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 1000 } })
}, 120000)
afterAll(async () => {
  await browser?.close(); await world?.close()
  for (const folder of [profile, built]) if (folder) rmSync(folder, { recursive: true, force: true })
})

for (const [width, height] of [[1440, 1000], [390, 844]] as const) it(`finishes painting every room at ${width} wide after Fit office, and says the area names are left out`, async () => {
  await page?.close(); page = await browser.newPage(); await page.setViewportSize({ width, height })
  const thrown: string[] = []
  page.on('pageerror', error => thrown.push(error.message))
  await page.goto(world.url)
  expect(await page.evaluate(() => innerWidth)).toBe(width)
  await page.evaluate(fixture => { const shell = window as unknown as Shell; shell.configure({ fixture }); shell.openPlugin() }, { synthetic: true, views: liveShapeViews(liveSizeRoster()) })
  await page.waitForFunction(() => document.querySelector('iframe')?.contentWindow !== null)
  const frame = page.frames().find(one => one.url().endsWith('/plugin/main.html'))!
  // The first view: the whole layout has arrived, and its first seats are drawn.
  await frame.waitForFunction(() => {
    const layout = (window as unknown as Hooks).__officeMapScreenTest?.layout, canvas = document.querySelector<HTMLCanvasElement>('.map-plane canvas')
    return layout !== undefined && !layout.preview && canvas?.dataset['paintReady'] === 'true' && canvas.dataset['mode'] !== 'overview'
  }, undefined, { timeout: 90000, polling: 100 })
  const took = await frame.evaluate(async ([label, limit]) => {
    const fit = [...document.querySelectorAll('button')].find(button => button.textContent === label)!
    const start = performance.now(); fit.click()
    while (document.querySelector<HTMLCanvasElement>('.map-plane canvas')!.dataset['paintReady'] !== 'true') {
      if (performance.now() - start > limit) return null
      await new Promise(done => setTimeout(done, 20))
    }
    return performance.now() - start
  }, [words.en.fit, LIMIT_MS] as const)
  expect(took, 'milliseconds from the press to the finished paint').not.toBeNull()
  const seen = await frame.evaluate(() => {
    const view = document.querySelector('.map-viewport')!.getBoundingClientRect(), planeNode = document.querySelector<HTMLElement>('.map-plane')!, plane = planeNode.getBoundingClientRect()
    const canvas = document.querySelector('.map-plane canvas')!.getBoundingClientRect(), hooks = (window as unknown as Hooks).__officeMapScreenTest!
    // The plane centres a small office in the view with an empty margin; the paint covers the office.
    const x = Number(planeNode.dataset['paddingX']), y = Number(planeNode.dataset['paddingY'])
    const shown = { left: Math.max(view.left, plane.left + x), top: Math.max(view.top, plane.top + y), right: Math.min(view.right, plane.right - x), bottom: Math.min(view.bottom, plane.bottom - y) }
    const camera = hooks.camera!.actual, outside = hooks.layout!.rooms.filter(room => room.x < camera.left - .5 || room.y < camera.top - .5 ||
      room.x + room.width > camera.left + camera.width + .5 || room.y + room.height > camera.top + camera.height + .5).length
    return { rooms: hooks.layout!.rooms.length, outside, covered: canvas.left <= shown.left + .5 && canvas.top <= shown.top + .5 && canvas.right >= shown.right - .5 && canvas.bottom >= shown.bottom - .5 }
  })
  expect(seen.rooms).toBeGreaterThan(40)
  expect(seen.outside, 'rooms outside the view').toBe(0)
  expect(seen.covered, 'the finished paint covers what the view shows').toBe(true)
  expect(await frame.isVisible(`p:text-is("${words.en.namesLeftOut}")`)).toBe(true)
  expect(thrown).toEqual([])
}, 240000)
