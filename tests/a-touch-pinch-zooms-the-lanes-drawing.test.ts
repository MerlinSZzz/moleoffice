// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Two fingers pinch the drawing in areas. The zoom follows the distance between the fingers, held between 10% and
 * 160%, and the place under their midpoint stays under it. A pinch selects no card, opens no link, and changes no
 * card's detail and not the level. When one finger lifts, the other moves nothing, and a one-finger drag afterwards
 * pans as before. The 1440 x 1000 light page and made-up office are served by the production build, as in
 * tests/the-lanes-drawing-zooms-around-the-pointer.test.ts. The touches go through the page's DevTools session.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { pipelinePath } from '../src/web/components/router.tsx'
import { liveApp, type LiveApp } from './helpers.ts'
import { DRAWING, PROJECT, aPlaceOnTheCard, buildTheMadeUpOffice, openThePage, prepareThePage, theDrawingHoldsStill, theDrawingIsDrawn, writerFor, type MadeUpOffice } from './a-made-up-office-drawn-in-lanes.ts'

type Place = { x: number; y: number }
type Touch = { x: number; y: number; id: number }

let app: LiveApp
let office: MadeUpOffice
beforeAll(async () => {
  app = await liveApp({ name: 'lanes-pinch', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  office = await buildTheMadeUpOffice(writerFor(app, PROJECT.id))
  await prepareThePage(app, PROJECT.id)
}, 240_000)
afterAll(async () => { await app?.stop() }, 120_000)

async function open() {
  await openThePage(app, pipelinePath(office.id.master!))
  await theDrawingIsDrawn(app.page)
  const cdp = await app.page.context().newCDPSession(app.page)
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  return cdp
}
type Session = Awaited<ReturnType<typeof open>>

async function zoom() {
  return app.page.locator('.e-world').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a)
}
const percent = () => app.page.locator('.lanes-controls span').innerText()

/** The place of the drawing under a place in the window, in the drawing's own units, and the zoom it is drawn at. */
async function theDrawingAt(place: Place) {
  return app.page.locator('.e-world').evaluate((el, p) => {
    const r = el.getBoundingClientRect()
    const z = new DOMMatrix(getComputedStyle(el).transform).a
    return { z, x: (p.x - r.x) / z, y: (p.y - r.y) / z }
  }, place)
}

/** Every card drawn, by id, at its place in the window, with its detail rung. */
async function theCards() {
  return app.page.locator(`${DRAWING} .e-card`).evaluateAll(cards => cards.flatMap(card => {
    const r = card.getBoundingClientRect()
    return r.width > 0 ? [{ id: card.getAttribute('data-id') ?? '', x: r.x, y: r.y, rung: card.getAttribute('data-card-rung') }] : []
  }))
}

/** The places among these that a touch would not land on the drawing's frame, or would land on a control there. */
async function offTheFrame(places: readonly Place[]): Promise<string[]> {
  return app.page.evaluate(({ selector, places }) => places.flatMap(p => {
    const hit = document.elementFromPoint(p.x, p.y)
    if (hit === null || hit.closest(`${selector} .e-frame`) === null) return [`${p.x},${p.y} is not on the drawing's frame`]
    if (hit.closest('button, input, select, textarea, .e-key') !== null) return [`${p.x},${p.y} is on a control, which a touch does not drag`]
    return []
  }), { selector: DRAWING, places })
}

/**
 * A place near the middle of the part of the frame inside the window, scrolled to the window's middle first, from
 * which two fingers side by side, up to `half` px either way, land on the frame and on no control there.
 */
async function aMiddleForTwoFingers(half: number): Promise<Place> {
  const middle = await app.page.locator(`${DRAWING} .e-frame`).evaluate(el => {
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
    const r = el.getBoundingClientRect()
    const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, innerHeight)
    const left = Math.max(r.left, 0), right = Math.min(r.right, innerWidth)
    return { x: Math.round((left + right) / 2), y: Math.round((top + bottom) / 2) }
  })
  for (const down of [0, -40, 40, -80, 80, -120, 120]) {
    for (const across of [0, -60, 60]) {
      const at = { x: middle.x + across, y: middle.y + down }
      const ends = [{ x: at.x - half, y: at.y }, { x: at.x + half, y: at.y }, at]
      if ((await offTheFrame(ends)).length === 0) return at
    }
  }
  throw new Error(`no place near the frame's middle (${middle.x},${middle.y}) has room on the frame for two fingers ${half} px either side`)
}

/** Two fingers that go from one pair of places to another in `steps` moves, and lift together unless told to stay. */
async function pinch(cdp: Session, from: readonly [Place, Place], to: readonly [Place, Place], { steps = 10, lift = true } = {}) {
  const at = (step: number): Touch[] => [0, 1].map(i => ({
    x: from[i]!.x + (to[i]!.x - from[i]!.x) * step / steps,
    y: from[i]!.y + (to[i]!.y - from[i]!.y) * step / steps,
    id: i + 1,
  }))
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) })
  for (let step = 1; step <= steps; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(step) })
    await app.page.waitForTimeout(16)
  }
  if (lift) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  // Time for a click the pinch might be followed by, and for the drawing to answer one.
  await app.page.waitForTimeout(300)
}

/** One finger that goes down at a place, moves by `by` in `steps` moves, and lifts. */
async function drag(cdp: Session, from: Place, by: Place, steps = 10) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 1 }] })
  for (let step = 1; step <= steps; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + by.x * step / steps, y: from.y + by.y * step / steps, id: 1 }] })
    await app.page.waitForTimeout(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await app.page.waitForTimeout(300)
}

it('fingers that go from 100 to 200 px apart double the zoom and keep the place under their midpoint', async () => {
  const cdp = await open()
  // Below 0.8, so that twice the zoom is under the largest, 1.6.
  for (let press = 0; press < 10 && await zoom() >= 0.8; press += 1) {
    await app.page.getByRole('button', { name: 'Smaller', exact: true }).click()
    await app.page.waitForTimeout(100)
  }
  const z0 = await zoom()
  expect(z0, 'the zoom after pressing Smaller is below 0.8').toBeLessThan(0.8)
  const middle = await aMiddleForTwoFingers(100)
  const level = await app.page.locator(DRAWING).getAttribute('data-level')
  const rungs = (await theCards()).map(card => [card.id, card.rung])
  const before = await theDrawingAt(middle)
  await pinch(cdp, [{ x: middle.x - 50, y: middle.y }, { x: middle.x + 50, y: middle.y }], [{ x: middle.x - 100, y: middle.y }, { x: middle.x + 100, y: middle.y }])
  const after = await theDrawingAt(middle)
  expect(Math.abs(after.z - 2 * z0), `the zoom ${after.z} is twice ${z0}, within 1%`).toBeLessThanOrEqual(0.01 * 2 * z0)
  await expect.poll(percent, { timeout: 5_000 }).toBe(`${Math.round(after.z * 100)}%`)
  expect(Math.abs((after.x - before.x) * after.z), 'the place under the midpoint moved across by at most 2 px').toBeLessThanOrEqual(2)
  expect(Math.abs((after.y - before.y) * after.z), 'the place under the midpoint moved down by at most 2 px').toBeLessThanOrEqual(2)
  await theDrawingHoldsStill(app.page)
  expect(await app.page.locator(DRAWING).getAttribute('data-level'), 'the level after the pinch').toBe(level)
  expect((await theCards()).map(card => [card.id, card.rung]), 'every card keeps its detail rung').toEqual(rungs)
}, 180_000)

it('fingers that come together zoom out, and the zoom stops at 0.1', async () => {
  const cdp = await open()
  const z0 = await zoom()
  const middle = await aMiddleForTwoFingers(150)
  const level = await app.page.locator(DRAWING).getAttribute('data-level')
  const rungs = (await theCards()).map(card => [card.id, card.rung])
  const apart = (half: number) => [{ x: middle.x - half, y: middle.y }, { x: middle.x + half, y: middle.y }] as const
  await pinch(cdp, apart(150), apart(120), { lift: false })
  const partWay = await zoom()
  expect(partWay, `fingers from 300 to 240 px apart zoom out from ${z0}`).toBeLessThan(z0)
  expect(Math.abs(partWay - Math.max(0.1, z0 * 0.8)), `the zoom ${partWay} follows the fingers, to 0.8 of ${z0}`).toBeLessThanOrEqual(0.01 * z0)
  for (let step = 1; step <= 10; step += 1) {
    const half = 120 - 11 * step
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: apart(half).map((p, i) => ({ ...p, id: i + 1 })) })
    await app.page.waitForTimeout(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await app.page.waitForTimeout(300)
  expect(await zoom(), 'fingers 20 px apart hold the zoom at the smallest').toBeCloseTo(0.1, 2)
  await expect.poll(percent, { timeout: 5_000 }).toBe('10%')
  await theDrawingHoldsStill(app.page)
  expect(await app.page.locator(DRAWING).getAttribute('data-level'), 'the level after the pinch').toBe(level)
  expect((await theCards()).map(card => [card.id, card.rung]), 'every card keeps its detail rung').toEqual(rungs)
}, 180_000)

it('a pinch on a card selects nothing, and afterwards one finger moves nothing until a new touch pans', async () => {
  const cdp = await open()
  const onTheCard = await aPlaceOnTheCard(app.page, office.id.start!)
  const frame = await app.page.locator(`${DRAWING} .e-frame`).boundingBox()
  expect(frame, 'the drawing has a frame').not.toBeNull()
  const side = onTheCard.x + 160 < frame!.x + frame!.width ? 1 : -1
  const from = [onTheCard, { x: onTheCard.x + side * 100, y: onTheCard.y }] as const
  const to = [{ x: onTheCard.x - side * 50, y: onTheCard.y }, { x: onTheCard.x + side * 150, y: onTheCard.y }] as const
  expect(await offTheFrame([...from, ...to]), 'every finger lands on the frame').toEqual([])
  const selected = await app.page.locator(DRAWING).getAttribute('data-selected')
  const address = app.page.url()
  const z0 = await zoom()
  await pinch(cdp, from, to, { lift: false })
  expect(await zoom(), 'the pinch on the card zoomed').not.toBeCloseTo(z0, 3)

  // One finger lifts. The other moves 100 px, and nothing on the drawing moves with it. DevTools lifts the fingers a
  // touchEnd lists, and a touchMove that leaves a finger out does not lift it, so finger 1 is lifted by a touchEnd that
  // names it. Had finger 2 been lifted instead, its next move would press a new finger beside finger 1, which pinches,
  // and the cards would move.
  const resting = await theCards()
  const left = to[1]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ ...to[0], id: 1 }] })
  for (let step = 1; step <= 10; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: left.x - side * 10 * step, y: left.y + 4 * step, id: 2 }] })
    await app.page.waitForTimeout(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await app.page.waitForTimeout(300)
  const still = await theCards()
  expect(still.map(card => card.id), 'the same cards are drawn').toEqual(resting.map(card => card.id))
  for (const [i, card] of still.entries()) {
    expect(Math.hypot(card.x - resting[i]!.x, card.y - resting[i]!.y), `card ${card.id} stays where the pinch left it`).toBeLessThanOrEqual(1)
  }
  await theDrawingHoldsStill(app.page)
  expect(await app.page.locator(DRAWING).getAttribute('data-selected'), 'the pinch on a card selects no card').toBe(selected)
  expect(app.page.url(), 'the pinch on a card leaves the address as it was').toBe(address)

  // A new touch with one finger pans the drawing by as much as the finger moves.
  const start = await aMiddleForTwoFingers(0)
  expect(await offTheFrame([{ x: start.x + 150, y: start.y }]), 'the drag ends on the frame').toEqual([])
  const panned = await theCards()
  await drag(cdp, start, { x: 150, y: 0 })
  const moved = await theCards()
  expect(moved.map(card => card.id), 'the same cards are drawn').toEqual(panned.map(card => card.id))
  for (const [i, card] of moved.entries()) {
    expect(Math.abs(card.x - panned[i]!.x - 150), `card ${card.id} moved 150 px across`).toBeLessThanOrEqual(2)
    expect(Math.abs(card.y - panned[i]!.y), `card ${card.id} did not move down`).toBeLessThanOrEqual(2)
  }
  expect(await app.page.locator(DRAWING).getAttribute('data-selected'), 'the drag selects no card').toBe(selected)
}, 180_000)
