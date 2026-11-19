// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A plain Playwright wheel over a filed pipeline's drawing scrolls the page, not the drawing. */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { pipelinePath } from '../src/web/components/router.tsx'
import { liveApp, type LiveApp } from './helpers.ts'
import { PROJECT, aPlaceOnTheCard, buildTheMadeUpOffice, openThePage, prepareThePage, theDrawingIsDrawn, writerFor, type MadeUpOffice } from './a-made-up-office-drawn-in-lanes.ts'
let app: LiveApp
let office: MadeUpOffice
beforeAll(async () => {
  app = await liveApp({ name: 'lanes-plain-wheel', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  office = await buildTheMadeUpOffice(writerFor(app, PROJECT.id))
  await prepareThePage(app, PROJECT.id)
}, 240_000)
afterAll(async () => { await app?.stop() }, 120_000)
it('the plain wheel scrolls the page by its distance and keeps the drawing view', async () => {
  await openThePage(app, pipelinePath(office.id.master!))
  await theDrawingIsDrawn(app.page)
  const p = await aPlaceOnTheCard(app.page, office.id.start!)
  const before = await app.page.evaluate(() => ({ y: scrollY, transform: getComputedStyle(document.querySelector('.e-world')!).transform, x: document.querySelector('.e-frame')!.scrollLeft, frameY: document.querySelector('.e-frame')!.scrollTop }))
  await app.page.mouse.move(p.x, p.y)
  await app.page.mouse.wheel(0, 180)
  await expect.poll(() => app.page.evaluate(() => scrollY)).toBeGreaterThan(before.y)
  const after = await app.page.evaluate(() => ({ y: scrollY, transform: getComputedStyle(document.querySelector('.e-world')!).transform, x: document.querySelector('.e-frame')!.scrollLeft, frameY: document.querySelector('.e-frame')!.scrollTop }))
  expect(Math.abs(after.y - before.y - 180)).toBeLessThanOrEqual(2)
  expect(after.transform).toBe(before.transform)
  expect(after.x).toBe(before.x)
  expect(after.frameY).toBe(before.frameY)
}, 180_000)
