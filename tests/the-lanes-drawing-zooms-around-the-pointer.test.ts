// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Ctrl-wheel zooms the drawing around the pointer, with the same browser wheel event a trackpad
 * pinch sends. The 1440 x 1000 light page and made-up office are served by the production build.
 * The test uses Playwright mouse and keyboard events; 10% and 160% are the drawing's zoom limits.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { pipelinePath } from '../src/web/components/router.tsx'
import { liveApp, type LiveApp } from './helpers.ts'
import { DRAWING, PROJECT, aPlaceOnTheCard, buildTheMadeUpOffice, openThePage, prepareThePage, theDrawingIsDrawn, writerFor, type MadeUpOffice } from './a-made-up-office-drawn-in-lanes.ts'

let app: LiveApp
let office: MadeUpOffice
beforeAll(async () => {
  app = await liveApp({ name: 'lanes-wheel', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  office = await buildTheMadeUpOffice(writerFor(app, PROJECT.id))
  await prepareThePage(app, PROJECT.id)
}, 240_000)
afterAll(async () => { await app?.stop() }, 120_000)
async function open() {
  await openThePage(app, pipelinePath(office.id.master!))
  await theDrawingIsDrawn(app.page)
}
async function zoom() {
  return app.page.locator('.e-world').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a)
}
async function wheelAt(p: {x: number; y: number}, dy: number) {
  await app.page.mouse.move(p.x, p.y)
  await app.page.keyboard.down('Control')
  await app.page.mouse.wheel(0, dy)
  await app.page.keyboard.up('Control')
  await app.page.waitForTimeout(100)
}
it('Ctrl-wheel zooms over a card without moving the point under the pointer', async () => {
  await open()
  const p = await aPlaceOnTheCard(app.page, office.id.start!)
  const before = await app.page.locator('.e-world').evaluate((el, point) => {
    const r = el.getBoundingClientRect()
    const z = new DOMMatrix(getComputedStyle(el).transform).a
    return { z, x: (point.x - r.x) / z, y: (point.y - r.y) / z }
  }, p)
  await wheelAt(p, -100)
  const after = await app.page.locator('.e-world').evaluate((el, point) => {
    const r = el.getBoundingClientRect()
    const z = new DOMMatrix(getComputedStyle(el).transform).a
    return { z, x: (point.x - r.x) / z, y: (point.y - r.y) / z }
  }, p)
  expect(after.z).toBeGreaterThan(before.z)
  expect(Math.abs((after.x - before.x) * after.z)).toBeLessThanOrEqual(2)
  expect(Math.abs((after.y - before.y) * after.z)).toBeLessThanOrEqual(2)
}, 180_000)
it('Ctrl-wheel stops at the smallest and largest zoom', async () => {
  await open()
  const p = await aPlaceOnTheCard(app.page, office.id.start!)
  for (let i = 0; i < 20; i++) await wheelAt(p, -500)
  expect(await zoom()).toBeCloseTo(1.6, 2)
  for (let i = 0; i < 30; i++) await wheelAt(p, 500)
  expect(await zoom()).toBeCloseTo(0.1, 2)
}, 180_000)
