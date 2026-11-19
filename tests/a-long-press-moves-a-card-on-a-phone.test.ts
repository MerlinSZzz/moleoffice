// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ON A PHONE, A LONG PRESS ON A CARD'S EMPTY SPACE DRAGS IT, AND THE DRAWING KEEPS WHERE IT WENT.
 *
 * ---------------------------------------------------------------------------------------
 * THE CRITERION, AND THE RULING THAT MADE THE SECOND HALF POSSIBLE
 * ---------------------------------------------------------------------------------------
 *
 * Section 20 of design/messages/ACCEPTANCE.md: a long press on a card's empty space is a free drag of
 * where it sits. Criterion D19.
 *
 * And a second ruling, which is what makes the drag worth anything:
 *
 * The rule that a position is never stored and is worked out again on every draw is void where it
 * gets in the way. It got in the way here: a place nobody keeps is a drag that undoes itself on the
 * next draw. So the place goes into the drawing's stored arrangement, beside the lane, the order,
 * the role and the emphasis that already live there.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   make `moveTo` in Canvas.tsx do nothing → 1 of 4 red: the card is not picked up.
 *   make `putDown` do nothing → 2 of 4 red: nothing is stored and the card does not come back.
 *   set the long press to thirty seconds → 2 of 4 red, and the case about a finger that does not
 *     hold still stays green, which is what says the half second is doing the work rather than the
 *     drag simply never happening.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { theDrawingHasSettled } from './the-drawing-has-settled.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let app: LiveApp
let page: Page
let firstModuleId = ''

const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

async function post(path: string, body: unknown): Promise<{ record: { id: string } }> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as { record: { id: string } }
}

/** What the drawing's stored arrangement holds for one node, read back from the server. */
async function storedFor(recordId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}/api/presentation/structure`, { headers: HEADERS })
  if (!res.ok) throw new Error(`the stored arrangement could not be read: ${await res.text()}`)
  const body = (await res.json()) as { intent?: { nodes?: Record<string, Record<string, unknown>> } }
  return body.intent?.nodes?.[recordId] ?? {}
}

beforeAll(async () => {
  app = await liveApp({ name: 'long-press-moves', viewport: { width: 390, height: 800 }, hasTouch: true })
  page = app.page

  const first = await post('/api/records', {
    kind: 'module',
    title: 'Wrist mount pull rig',
    summary: 'Three of four printed wrist mounts broke below the load the handover trials need.',
    data: { state: 'active', parts: [] },
  })
  firstModuleId = first.record.id
  const second = await post('/api/records', {
    kind: 'module',
    title: 'Bench jig',
    summary: 'Holds the mount while it is pulled.',
    data: { state: 'active', parts: [] },
  })
  const third = await post('/api/records', {
    kind: 'module',
    title: 'Load cell bench',
    summary: 'Where the pulls are done and the numbers come from.',
    data: { state: 'active', parts: [] },
  })
  for (const toId of [second.record.id, third.record.id]) {
    const linked = await fetch(`${app.api}/api/links`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ fromId: firstModuleId, toId, type: 'relates_to' }),
    })
    if (!linked.ok) throw new Error(`the modules could not be linked: ${await linked.text()}`)
  }
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Open the module drawing on a phone, which opens on the list and draws on one press. */
async function openTheDrawing(): Promise<void> {
  // THE HOME PAGE ONLY WHEN THIS PAGE IS NOT ON THE APP YET. Its storage can be cleared only from a
  // page of the app. A page already on the drawing from the case before is on the app, and the
  // reload below starts it again from the cleared storage.
  if (!page.url().startsWith(app.site)) {
    await page.goto(`${app.site}/#/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  }
  await page.evaluate(() => {
    window.sessionStorage.clear()
    window.localStorage.removeItem('mole-office.detail')
    window.localStorage.removeItem('mole-office.detail.graph')
  })
  await page.goto(`${app.site}/#/pipeline/drawing`, { timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.getByRole('button', { name: 'Graph' }).first().click()
  await page.waitForSelector('.gx-canvas-wrap[data-shows="1"]', { timeout: 60_000 })
  await theDrawingHasSettled(page)
}

/** Wait until the page has drawn one more frame, so the last move of a drag is on the screen. */
async function aFrameIsDrawn(on: Page): Promise<void> {
  await on.evaluate(() => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())))
}

/**
 * WHERE ONE CARD IS ON THE DRAWING, measured against the other cards and not against the window.
 *
 * NOT AGAINST THE WINDOW, and that is what this test is about. Dragging a finger across a drawing
 * pans it, and a card measured against the window moves whenever the picture does — so a test that
 * read the window would call a pan a move and pass on a build where the long press does nothing.
 * Every card's place is added up and taken off, so a pan shifts them all and this number does not.
 */
async function whereIs(recordId: string): Promise<{ x: number; y: number } | null> {
  return page.evaluate((id) => {
    const cards = [...document.querySelectorAll('.gx-card')]
    const el = cards.find((one) => (one.getAttribute('data-target') ?? '').startsWith(`record/${id}/`))
    if (el === undefined || cards.length < 2) return null
    const mine = el.getBoundingClientRect()
    let x = 0
    let y = 0
    for (const other of cards) {
      const box = other.getBoundingClientRect()
      x += box.x
      y += box.y
    }
    return {
      x: Math.round(mine.x - x / cards.length),
      y: Math.round(mine.y - y / cards.length),
    }
  }, recordId)
}

/**
 * A POINT ON THE CARD'S EMPTY SPACE, as far from anything pressable as the card allows.
 *
 * `elementFromPoint` says what a press at a point would hit, and it is the instrument — a test that
 * guessed an offset would go on passing after the card's own controls grew over the spot it guessed.
 *
 * FAR FROM ANYTHING PRESSABLE, AND THAT IS NOT FUSSINESS. A browser moves a TOUCH to a nearby
 * button when there is one within a few pixels — Chrome calls it touch adjustment — so a point that
 * `elementFromPoint` calls empty can still deliver the touch to the card's name. Measured: a point
 * six pixels below the top of the card, which the hit test called the card, arrived at
 * `BUTTON.gx-card-title`. So the point chosen is the one furthest from every button, link and grip
 * on the card, and the test refuses rather than guessing when the card has no such point.
 */
async function emptySpaceOn(recordId: string): Promise<{ x: number; y: number }> {
  await page.locator(`.gx-card[data-target^="record/${recordId}/"]`).first().scrollIntoViewIfNeeded()
  await aFrameIsDrawn(page)
  const where = await page.evaluate((id) => {
    const el = document.querySelector(`.gx-card[data-target^="record/${id}/"]`)
    if (el === null) return null
    const box = el.getBoundingClientRect()
    const pressable = [...el.querySelectorAll('button, a, .gx-grip')].map((one) => one.getBoundingClientRect())
    const away = (x: number, y: number): number => {
      let least = Math.min(x - box.x, box.right - x, y - box.y, box.bottom - y)
      for (const one of pressable) {
        const dx = Math.max(one.x - x, 0, x - one.right)
        const dy = Math.max(one.y - y, 0, y - one.bottom)
        least = Math.min(least, Math.hypot(dx, dy))
      }
      return least
    }
    let best: { x: number; y: number; clear: number } | null = null
    for (let down = 3; down < box.height - 2; down += 2) {
      for (let across = 3; across < box.width - 2; across += 2) {
        const x = Math.round(box.x + across)
        const y = Math.round(box.y + down)
        if (document.elementFromPoint(x, y) !== el) continue
        const clear = away(x, y)
        if (best === null || clear > best.clear) best = { x, y, clear }
      }
    }
    return best
  }, recordId)
  if (where === null) throw new Error(`the card for ${recordId} has no empty space a finger could land on`)
  if (where.clear < 12) {
    throw new Error(
      `the emptiest point on the card for ${recordId} is only ${String(Math.round(where.clear))} pixels from ` +
        `something pressable, and a browser moves a touch that close onto it. This test cannot say what a long ` +
        `press on empty space does on a card with no empty space.`,
    )
  }
  return { x: where.x, y: where.y }
}

/**
 * TOUCH THE CARD, HOLD IT UNTIL IT IS PICKED UP OR NOT AT ALL, THEN DRAG IT THERE. Pixels.
 *
 * With `holdUntilPickedUp`, the finger stays still until the card says it has been picked up
 * (`data-picked-up`, set half a second into a still press), for at most five seconds. If nothing is
 * picked up by then the drag goes on anyway, and the case's own assertions say what happened.
 *
 * `between` IS HOW LONG THE DRAG ITSELF TAKES, and it matters as much as the hold. A drag that
 * holds for a tenth of a second and then takes half a second to travel has still had the finger
 * down for longer than the long press, and the card is picked up part way through. The case about a
 * finger that does not hold still therefore sends its whole drag inside the half second.
 */
async function touchAndDrag(
  from: { x: number; y: number },
  holdUntilPickedUp: boolean,
  by: { x: number; y: number },
  between = 50,
): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] })
  if (holdUntilPickedUp) {
    await page.waitForSelector('[data-picked-up="1"]', { state: 'attached', timeout: 5_000 }).catch(() => undefined)
  }
  for (let step = 1; step <= 4; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + (by.x * step) / 4, y: from.y + (by.y * step) / 4 }],
    })
    // A FIXED PACE, because how long the drag takes is part of what the cases hold (see above).
    if (between > 0) await page.waitForTimeout(between)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await theDrawingHasSettled(page)
}

describe('a long press on a card’s empty space drags it, on a phone', () => {
  it('does nothing when a finger touches the card and moves straight away', async () => {
    await openTheDrawing()
    const before = await whereIs(firstModuleId)
    expect(before, 'the card is not on the drawing').not.toBeNull()
    await touchAndDrag(await emptySpaceOn(firstModuleId), false, { x: 70, y: 90 }, 0)
    expect(await whereIs(firstModuleId), 'a finger that did not hold still moved the card').toEqual(before)
    expect(await storedFor(firstModuleId), 'a place was stored for a drag nobody started').toEqual({})
  }, 240_000)

  it('moves the card when the finger holds its empty space first', async () => {
    await openTheDrawing()
    const before = await whereIs(firstModuleId)
    await touchAndDrag(await emptySpaceOn(firstModuleId), true, { x: 70, y: 90 })
    const after = await whereIs(firstModuleId)
    expect(after, 'the card is not on the drawing any more').not.toBeNull()
    const moved = Math.abs((after?.x ?? 0) - (before?.x ?? 0)) + Math.abs((after?.y ?? 0) - (before?.y ?? 0))
    expect(moved, 'the long press did not pick the card up').toBeGreaterThan(60)
  }, 240_000)

  it('stores where it was put, in the drawing’s own arrangement', async () => {
    const stored = await storedFor(firstModuleId)
    expect(
      Object.keys(stored).sort(),
      'where the card was put was not written into the drawing’s stored arrangement',
    ).toEqual(['x', 'y'])
    expect(typeof stored['x'], 'the stored place is not a number').toBe('number')
    expect(typeof stored['y'], 'the stored place is not a number').toBe('number')
  }, 120_000)

  it('draws the card where it was put when the drawing is opened again from cold', async () => {
    const put = await whereIs(firstModuleId)
    await openTheDrawing()
    const again = await whereIs(firstModuleId)
    expect(again, 'the card is not on the drawing').not.toBeNull()
    // FOUR PIXELS is the rounding of a stored whole number and a transform, not a move a reader can
    // see. Before the place was stored the card went back to wherever the layout put it.
    expect(Math.abs((again?.x ?? 0) - (put?.x ?? 0)), 'the card did not come back where it was put').toBeLessThan(5)
    expect(Math.abs((again?.y ?? 0) - (put?.y ?? 0)), 'the card did not come back where it was put').toBeLessThan(5)
  }, 240_000)

})
