// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { chromium, type BrowserContext, type Page } from 'playwright'
import { build } from 'esbuild'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { CanvasFixture } from './canvas-browser-fixture.ts'

declare global { interface Window { fixture: CanvasFixture } }
let browser: BrowserContext, page: Page, profile: string, script: string
beforeAll(async () => {
  script = (await build({ stdin: { contents: "import {installCanvasFixture} from './canvas-browser-fixture.ts'; window.fixture=installCanvasFixture()", resolveDir: import.meta.dirname }, loader: { '.png': 'dataurl' }, bundle: true, write: false, format: 'iife', platform: 'browser' })).outputFiles[0]!.text
  profile = mkdtempSync('/dev/shm/office-map-input-')
  browser = await chromium.launchPersistentContext(profile, { headless: true, args: ['--no-sandbox'], viewport: { width: 990, height: 900 } })
}, 30000)
afterAll(async () => { await browser?.close(); if (profile) rmSync(profile, { recursive: true, force: true }) })
afterEach(async () => { await page?.close() })
async function open() {
  page = await browser.newPage()
  await page.setContent('<div class="map-viewport" tabindex="0" style="width:640px;height:400px"></div>')
  await page.addStyleTag({ content: readFileSync(new URL('../src/page.css', import.meta.url), 'utf8') })
  await page.addScriptTag({ content: script })
  await page.waitForFunction(() => document.querySelector<HTMLCanvasElement>('.map-plane canvas')?.dataset['paintReady'] === 'true')
}
async function settled() {
  await page.waitForFunction(() => document.querySelector<HTMLCanvasElement>('.map-plane canvas')?.dataset['paintReady'] === 'true')
}
const sample = () => page.evaluate(() => window.fixture.sample())
async function frame() { await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))) }

it('F2: real wheel zooms both directions and consumes default scroll', async () => {
  await open()
  const before = await page.locator('.map-plane').getAttribute('data-zoom')
  await page.mouse.move(320, 220); await page.mouse.wheel(0, -120)
  await page.waitForTimeout(60); await settled()
  const zoomed = Number(await page.locator('.map-plane').getAttribute('data-zoom'))
  expect(zoomed).toBeGreaterThan(Number(before))
  await page.mouse.wheel(0, 120); await page.waitForTimeout(60); await settled()
  expect(Number(await page.locator('.map-plane').getAttribute('data-zoom'))).toBeLessThan(zoomed)
  expect(await page.evaluate(() => scrollY)).toBe(0)
}, 30000)

it('F3: left drag starts on person and block overlays; click still selects; release outside stops drag', async () => {
  await open()
  const person = page.locator('.map-person'), box = (await person.boundingBox())!
  await person.click(); expect(await page.evaluate(() => window.fixture.selected.length)).toBe(1)
  const before = await page.evaluate(() => window.fixture.view.scrollLeft)
  await page.mouse.move(box.x + 30, box.y + 30); await page.mouse.down(); await page.mouse.move(box.x + 130, box.y + 30, { steps: 5 }); await page.mouse.up()
  expect(await page.evaluate(() => window.fixture.view.scrollLeft)).toBeLessThan(before - 50)
  expect(await page.evaluate(() => window.fixture.selected.length)).toBe(1)
  await settled()
  await page.evaluate(() => { const b = document.createElement('button'); b.className = 'map-block'; b.style.cssText = `left:${window.fixture.view.scrollLeft + 100}px;top:${window.fixture.view.scrollTop + 100}px;width:180px;height:120px`; window.fixture.view.append(b) })
  const block = (await page.locator('.map-block').boundingBox())!, blockBefore = await page.evaluate(() => window.fixture.view.scrollTop)
  await page.mouse.move(block.x + 20, block.y + 20); await page.mouse.down(); await page.mouse.move(block.x + 20, block.y - 100, { steps: 4 }); await page.mouse.up()
  expect(await page.evaluate(() => window.fixture.view.scrollTop)).toBeGreaterThan(blockBefore + 50)
  const released = await page.evaluate(() => [window.fixture.view.scrollLeft, window.fixture.view.scrollTop])
  await page.mouse.move(900, 850); expect(await page.evaluate(() => [window.fixture.view.scrollLeft, window.fixture.view.scrollTop])).toEqual(released)
}, 30000)

it('F1: scroll keeps the completed frame through sliced repaint and a superseding scroll', async () => {
  const visibleSample = () => page.evaluate(() => {
    const canvas = window.fixture.view.querySelector('canvas')!
    return { ...window.fixture.sample(), screenTop: canvas.getBoundingClientRect().top - window.fixture.view.getBoundingClientRect().top }
  })
  await open(); const before = await visibleSample(); expect(before.clear).toBe(0)
  await page.evaluate(() => { window.fixture.hold(); window.fixture.view.scrollTop += 400 })
  await page.waitForFunction(() => window.fixture.pending() > 0)
  const during = []
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => window.fixture.advance(10)); await frame(); during.push(await visibleSample())
    if (i === 4) { await page.evaluate(() => { window.fixture.view.scrollTop += 100 }); await page.waitForTimeout(20) }
  }
  expect(during.every(s => s.clear === 0 && s.hash === before.hash && s.width === before.width && s.screenTop === before.screenTop)).toBe(true)
  await page.evaluate(() => window.fixture.flush()); await frame()
  const after = await sample(); expect(after.clear).toBe(0); expect(after.top).not.toBe(before.top)
}, 30000)

it('F1/F3: dynamic restoration never presents its cleared or partially copied pixels', async () => {
  await open(); const before = await sample()
  await page.evaluate(() => { window.fixture.hold(); window.fixture.change() })
  const during = []
  for (let i = 0; i < 12; i++) { await page.evaluate(() => window.fixture.advance(4)); await frame(); during.push(await sample()) }
  expect(during.every(s => s.clear === 0 && s.hash === before.hash)).toBe(true)
  await page.evaluate(() => window.fixture.flush()); await frame(); expect(await sample()).toEqual(before)
}, 30000)

it('selectFacts asks for no heavy facts when homes contain more than 160 visible seats', async () => {
  await open(); await page.evaluate(() => window.fixture.dense(161)); await settled()
  await page.waitForFunction(() => document.querySelector<HTMLCanvasElement>('.map-plane canvas')?.dataset['mode'] === 'counts')
  expect(await page.evaluate(() => window.fixture.facts.at(-1))).toEqual([])
  await page.evaluate(() => window.fixture.map.fit()); await settled()
  expect(await page.evaluate(() => window.fixture.facts.at(-1))).toEqual([])
}, 30000)
