// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A filed pipeline's lanes drawing at 1440 x 1000, light, served from the production build.
 * A movement of more than 4 CSS pixels is a drag; a shorter movement is a press.
 * The full-screen frame is smaller than the zoomed made-up drawing in both directions.
 * A drag moves the view, including when it starts on a card. An empty-space press clears
 * selection, whereas an empty-space drag keeps it. A card press selects, Escape clears,
 * and a title remains a link to its record.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { pipelinePath, recordPath } from '../src/web/components/router.tsx'
import { liveApp, type LiveApp } from './helpers.ts'
import { DRAWING, PROJECT, aPlaceOnTheCard, buildTheMadeUpOffice, openThePage, openTheWholeScreen, prepareThePage, theDrawingIsDrawn, writerFor, type MadeUpOffice } from './a-made-up-office-drawn-in-lanes.ts'

let app: LiveApp
let office: MadeUpOffice
beforeAll(async () => {
  app = await liveApp({ name: 'lanes-pan', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  office = await buildTheMadeUpOffice(writerFor(app, PROJECT.id))
  await prepareThePage(app, PROJECT.id)
}, 240_000)
afterAll(async () => { await app?.stop() }, 120_000)

async function open() {
  await openThePage(app, pipelinePath(office.id.master!))
  await theDrawingIsDrawn(app.page)
  await openTheWholeScreen(app.page)
  const bigger = app.page.getByRole('button', { name: 'Bigger', exact: true })
  for (let i = 0; i < 5 && await bigger.getAttribute('aria-disabled') !== 'true'; i++) await bigger.click()
  await app.page.waitForTimeout(150)
}
async function points() {
  return app.page.locator(`${DRAWING} .e-card`).evaluateAll(cards => cards.map(card => {
    const box = card.getBoundingClientRect()
    return { id: (card as HTMLElement).dataset.id, x: box.x, y: box.y }
  }))
}
async function empty() {
  const p = await app.page.evaluate(() => {
    const frame = document.querySelector('.e-frame')!.getBoundingClientRect()
    for (let y = Math.max(10, frame.top + 15); y < Math.min(innerHeight - 100, frame.bottom - 100); y += 12) {
      for (let x = Math.max(10, frame.left + 15); x < Math.min(innerWidth - 140, frame.right - 140); x += 12) {
        const el = document.elementFromPoint(x, y)
        if (el && el.closest('.e-frame') && !el.closest('.e-card, a, button, .e-key, .e-path, .e-pill')) return { x, y }
      }
    }
    return null
  })
  expect(p, 'an empty place in the frame').not.toBeNull()
  return p!
}
async function drag(p: { x: number; y: number }) {
  await app.page.mouse.move(p.x, p.y)
  await app.page.mouse.down()
  await app.page.mouse.move(p.x + 120, p.y + 80, { steps: 8 })
  await app.page.mouse.up()
}
async function movedAll(before: Awaited<ReturnType<typeof points>>) {
  const after = await points()
  expect(after.length).toBe(before.length)
  for (let i = 0; i < before.length; i++) {
    expect(after[i]!.id).toBe(before[i]!.id)
    expect(Math.abs(after[i]!.x - before[i]!.x - 120), `${before[i]!.id} horizontal`).toBeLessThanOrEqual(2)
    expect(Math.abs(after[i]!.y - before[i]!.y - 80), `${before[i]!.id} vertical`).toBeLessThanOrEqual(2)
  }
}
it('dragging empty space moves every card, preserves selection, and a press clears it', async () => {
  await open()
  const card = await aPlaceOnTheCard(app.page, office.id.start!)
  await app.page.mouse.click(card.x, card.y)
  expect(await app.page.locator(DRAWING).getAttribute('data-selected')).toBe(office.id.start)
  const p = await empty()
  const before = await points()
  await drag(p)
  await movedAll(before)
  expect(await app.page.locator(DRAWING).getAttribute('data-selected')).toBe(office.id.start)
  const clear = await empty()
  await app.page.mouse.click(clear.x, clear.y)
  expect(await app.page.locator(DRAWING).getAttribute('data-selected')).toBeNull()
}, 180_000)
it('dragging empty space with nothing selected moves every card and selects nothing', async () => {
  await open()
  expect(await app.page.locator(DRAWING).getAttribute('data-selected')).toBeNull()
  const before = await points()
  await drag(await empty())
  await movedAll(before)
  expect(await app.page.locator(DRAWING).getAttribute('data-selected')).toBeNull()
}, 180_000)
it('dragging a card moves every card without selecting, and a press and Escape still work', async () => {
  await open()
  const p = await aPlaceOnTheCard(app.page, office.id.start!)
  const before = await points()
  await drag(p)
  await movedAll(before)
  expect(await app.page.locator(DRAWING).getAttribute('data-selected')).toBeNull()
  const again = await aPlaceOnTheCard(app.page, office.id.start!)
  await app.page.mouse.click(again.x, again.y)
  expect(await app.page.locator(DRAWING).getAttribute('data-selected')).toBe(office.id.start)
  await app.page.keyboard.press('Escape')
  expect(await app.page.locator(DRAWING).getAttribute('data-selected')).toBeNull()
}, 180_000)
it('pressing a card title opens the record', async () => {
  await open()
  await openThePage(app, pipelinePath(office.id.drawn!))
  await theDrawingIsDrawn(app.page)
  const title = app.page.locator(`${DRAWING} .e-card[data-id="${office.id.top!}"] .e-title`)
  await title.click()
  await expect.poll(() => app.page.url()).toContain(recordPath(office.id.top!, 'block'))
}, 180_000)
