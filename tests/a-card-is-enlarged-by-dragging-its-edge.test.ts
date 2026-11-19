// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CARD IS ENLARGED BY DRAGGING ITS EDGE, AND WHAT IT SAYS CLIMBS THE LADDER — CRITERION D13.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ASKED, AND WHY THE OLD PROOF WOULD PASS WITHOUT ANY OF THIS
 * ---------------------------------------------------------------------------------------
 *
 * Section 20 of design/messages/ACCEPTANCE.md:
 *
 *   A card is enlarged by dragging its edge or corner, as the chat box is, and not by a press. As it
 *   grows it goes from level 1 to level 2, then adds level 3, and then stays; only the detail tick at
 *   its bottom right replaces level 3 with level 4 and goes on to level 6. On a phone it is a long
 *   press on the edge.
 *
 * `tests/a-card-says-more-as-it-grows.test.ts` proves the ladder as a function and would pass on a
 * page with no edge to drag. `tests/a-node-says-more-in-the-browser.test.ts` presses a minus and a
 * plus, and would pass on a page where dragging an edge does nothing. This file drags.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   make `keepDragging` in CardFace.tsx return without calling `onChoose` → every section goes red:
 *     the edge is there and dragging it does nothing, which is the page before this pass.
 *   make the long press arm immediately for a touch (drop the timeout) → the phone section still
 *     passes, so the timeout is proved the other way: setting it to thirty seconds turns the phone
 *     section red while the mouse sections stay green.
 *   take the `oneCardChanged` branch out of the layout effect in Canvas.tsx → the section about the
 *     card growing in place goes red: ELK lays the whole drawing out again and the neighbour moves.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { theDrawingHasSettled } from './the-drawing-has-settled.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let app: LiveApp
let page: Page
let richId = ''
let neighbourId = ''

const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** Level 1: a name, not a sentence, and nothing else on the screen produces it. */
const LABEL = 'Marlin wrist pull rig'

/** Level 3: the record's own line, with a rare first word so nothing else could have drawn it. */
const SUMMARY =
  'Quokka three of four printed wrist mounts broke below the load the handover trials need, so only ' +
  'the aluminium one is worth another run this week.'
const HEADING_ONE = 'Gannet the printed mount fails below the trial load'
const SHORT_ONE =
  'Bittern three of four printed mounts broke between fourteen and sixteen newtons, under the twenty the trials need.'
const LONG_ONE =
  'Caribou four printed mounts were pulled on the bench jig and three broke at the thin section behind ' +
  'the bolt circle, below the twenty newtons the handover trials need.'
const HEADING_TWO = 'Kestrel the aluminium mount is still on order'
const SHORT_TWO = 'Aardvark an aluminium mount of the same geometry has been ordered and nothing else waits on it.'
const LONG_TWO =
  'Tapir an aluminium mount of the same geometry has been ordered and is expected next week, and ' +
  'nothing else on the handover work is waiting on it.'

/** A record longer than its own ladder, so it has a level 6 to reach. See the other file's note. */
const BLOCKS = [
  {
    id: 'b-1',
    type: 'finding',
    text:
      'Ostrich four printed wrist mounts were pulled to failure on the bench jig this week, and three of ' +
      'them broke at the thin section behind the bolt circle, at fourteen point two, fifteen point one and ' +
      'fifteen point four newtons, which is below the twenty the transplant trials need, so the printed part ' +
      'cannot be used for them at all. The fourth held to twenty-two newtons and had been printed at half ' +
      'the layer height, which was a mistake in the print queue rather than a decision anybody made, and ' +
      'nobody has repeated it since. One sample is not a finding and the rig is not the question here.',
  },
  {
    id: 'b-2',
    type: 'finding',
    text:
      'Marmot nobody has pulled the aluminium mount yet, because the shop has not cut one: the order went ' +
      'in on Tuesday and the same geometry is expected next week, so the bench is free until then and the ' +
      'jig can stay set up as it is. Nothing else on the handover work is waiting on this, and the trials ' +
      'themselves are held by the gripper calibration rather than by the mount, which is written down on ' +
      'the pipeline and not here. The next run pulls four aluminium mounts and one printed one for comparison.',
  },
]

async function post(path: string, body: unknown): Promise<{ record: { id: string } }> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as { record: { id: string } }
}

beforeAll(async () => {
  app = await liveApp({ name: 'drag-an-edge', viewport: { width: 1440, height: 1000 } })
  page = app.page

  const rich = await post('/api/records', {
    kind: 'module',
    title: 'Wrist mount pull rig',
    summary: SUMMARY,
    data: { state: 'active', parts: [], summaryBlocks: BLOCKS },
  })
  richId = rich.record.id
  const neighbour = await post('/api/records', {
    kind: 'module',
    title: 'Bench jig',
    summary: 'Holds the mount while it is pulled.',
    data: { state: 'active', parts: [] },
  })
  neighbourId = neighbour.record.id
  const third = await post('/api/records', {
    kind: 'module',
    title: 'Load cell bench',
    summary: 'Where the pulls are done and the numbers come from.',
    data: { state: 'active', parts: [] },
  })
  for (const toId of [neighbourId, third.record.id]) {
    const linked = await fetch(`${app.api}/api/links`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ fromId: richId, toId, type: 'relates_to' }),
    })
    if (!linked.ok) throw new Error(`the modules could not be linked: ${await linked.text()}`)
  }

  const revisions = await fetch(`${app.api}/api/records/${richId}/revisions`, { headers: HEADERS })
  const list = (await revisions.json()) as { revisions: { seq: number; contentHash: string }[] }
  const newest = [...list.revisions].sort((a, b) => b.seq - a.seq)[0]
  if (newest === undefined) throw new Error('the module has no revision for a by-part summary to name')
  const wrote = await fetch(`${app.api}/api/records/${richId}/short-forms`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      madeFrom: { seq: newest.seq, contentHash: newest.contentHash },
      forms: {
        // LEVEL 1, WRITTEN. Nothing in this corpus has a label of its own, and without one the
        // smallest size lands on level 2 — which is the rule about a level nobody wrote, and
        // would leave the first step, from level 1 to level 2, with nothing to be seen on.
        label: LABEL,
        parts: [
          { id: 'p-one', heading: HEADING_ONE, text30: SHORT_ONE, text120: LONG_ONE, covers: ['b-1'] },
          { id: 'p-two', heading: HEADING_TWO, text30: SHORT_TWO, text120: LONG_TWO, covers: ['b-2'] },
        ],
      },
    }),
  })
  if (!wrote.ok) throw new Error(`the parts were not stored: ${await wrote.text()}`)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/**
 * FORGET WHERE THE LAST DRAG LEFT THIS CARD, so every case starts from the layout's own answer.
 *
 * ADDED 6 SEPTEMBER 2026 WITH CRITERION D29, openly. Dragging the LEFT edge now grows the card
 * leftwards and takes its stored place with it, which is what was asked for,
 * and a stored place outlives the visit. Two of the cases above drag the left edge, so by the time
 * the phone case opened the drawing the card had been carried far enough that its right grip was at
 * x=457 in a 390-pixel window and the touch landed on nothing at all. Nothing about what this file
 * checks has changed; what changed is that it now clears up after itself between cases.
 */
async function forgetWhereItWasLeft(): Promise<void> {
  const gone = await fetch(`${app.api}/api/presentation/structure/nodes/${richId}`, {
    method: 'DELETE',
    headers: HEADERS,
  })
  if (!gone.ok) throw new Error(`the card's stored place could not be forgotten: ${await gone.text()}`)
}

async function openTheDrawing(on: Page, theme: 'light' | 'dark'): Promise<void> {
  await forgetWhereItWasLeft()
  await on.emulateMedia({ colorScheme: theme })
  // THE HOME PAGE ONLY WHEN THIS PAGE IS NOT ON THE APP YET. Its storage can be cleared only from a
  // page of the app. A page already on the drawing from the case before is on the app, and the
  // reload below starts it again from the cleared storage.
  if (!on.url().startsWith(app.site)) {
    await on.goto(`${app.site}/#/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  }
  await on.evaluate(() => {
    window.sessionStorage.clear()
    window.localStorage.removeItem('mole-office.detail')
    window.localStorage.removeItem('mole-office.detail.graph')
  })
  await on.goto(`${app.site}/#/pipeline/drawing`, { timeout: 60_000 })
  await on.reload({ timeout: 60_000 })
  await waitForThePage(on, 60_000)
  // A NARROW SCREEN OPENS ON THE LIST AND NOT ON THE DRAWING, which is the page's own rule; the
  // drawing is one press away. A phone test that skipped this would be testing the list.
  if ((on.viewportSize()?.width ?? 1440) < 660) {
    await on.getByRole('button', { name: 'Graph' }).first().click()
  }
  await on.waitForSelector('.gx-canvas-wrap[data-shows="1"]', { timeout: 60_000 })
  await theDrawingHasSettled(on)
}

/** Wait until the page has drawn one more frame, so the last move of a drag is on the screen. */
async function aFrameIsDrawn(on: Page): Promise<void> {
  await on.evaluate(() => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())))
}

/** One card: how wide it is drawn, which level it says, and the words on it. */
async function theCard(on: Page, recordId: string): Promise<{ width: number; level: string | null; words: string }> {
  return on.evaluate((id) => {
    const el = document.querySelector(`.gx-card[data-target^="record/${id}/"]`)
    if (el === null) return { width: 0, level: null, words: 'no card' }
    const box = el.getBoundingClientRect()
    return {
      width: Math.round(box.width),
      level: el.getAttribute('data-rung'),
      words: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
    }
  }, recordId)
}

/**
 * WHERE ONE CARD'S NAMED GRIP IS ON THE SCREEN, at its middle, with the drawing scrolled into view.
 *
 * THE SCROLL IS NOT TIDINESS. On a phone the drawing sits below a page of words, so a grip can be
 * hundreds of pixels below the bottom of the window — and a touch dispatched there lands on nothing
 * at all, which the browser reads as the start of a page scroll and cancels. Measured: the right
 * grip was at y=877 in an 800-pixel window and `elementFromPoint` answered nothing.
 */
async function theGrip(on: Page, recordId: string, at: string): Promise<{ x: number; y: number }> {
  await on.locator(`.gx-card[data-target^="record/${recordId}/"]`).first().scrollIntoViewIfNeeded()
  await aFrameIsDrawn(on)
  const where = await on.evaluate(
    ([id, grip]) => {
      const el = document.querySelector(`.gx-card[data-target^="record/${id}/"] .gx-grip[data-grip="${grip}"]`)
      if (el === null) return null
      const box = el.getBoundingClientRect()
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    },
    [recordId, at] as const,
  )
  if (where === null) throw new Error(`the card for ${recordId} has no ${at} grip on screen`)
  return where
}

/** Drag one card's edge by this many pixels, with the mouse, the way a person does. */
async function dragTheEdge(on: Page, recordId: string, at: string, by: number): Promise<void> {
  const grip = await theGrip(on, recordId, at)
  // WHICH WAY THE EDGE GOES. Sideways for the left and right edges, down the page for the top and
  // bottom ones. It used to drag sideways whatever edge it was handed, which was enough while only
  // the width could grow a card — criterion D33 gave the height the same power.
  const downwards = at === 'top' || at === 'bottom'
  await on.mouse.move(grip.x, grip.y)
  await on.mouse.down()
  for (let step = 1; step <= 8; step += 1) {
    const moved = (by * step) / 8
    await on.mouse.move(downwards ? grip.x : grip.x + moved, downwards ? grip.y + moved : grip.y, { steps: 2 })
    await aFrameIsDrawn(on)
  }
  await on.mouse.up()
  await theDrawingHasSettled(on)
}

/** Press a card at its top-left corner, which is the card itself rather than its name or a grip. */
async function pressTheCard(on: Page, recordId: string): Promise<void> {
  await on.locator(`[data-target^="record/${recordId}/"]`).first().click({ position: { x: 3, y: 3 } })
  await theDrawingHasSettled(on)
}

// LIGHT ONLY. A drag does not change with the colour scheme, so the light half is the one kept.
for (const theme of ['light'] as const) {
  describe(`dragging a card's edge gives it more room, in ${theme}`, () => {
    it('widens the card as the pointer moves, and shrinks it again on the way back', async () => {
      await openTheDrawing(page, theme)
      const before = await theCard(page, richId)
      expect(before.width, 'the card is drawn before anything is dragged').toBeGreaterThan(0)
      await dragTheEdge(page, richId, 'right', 150)
      const wider = await theCard(page, richId)
      expect(wider.width, 'the drag gave the card more room').toBeGreaterThan(before.width + 40)
      await dragTheEdge(page, richId, 'right', -150)
      const back = await theCard(page, richId)
      expect(back.width, 'dragging the other way takes the room back').toBeLessThan(wider.width - 40)
    }, 180_000)

    it('climbs level 1, level 2, level 3 and then stops, with the detail tick off', async () => {
      await openTheDrawing(page, theme)
      // ALL THE WAY DOWN FIRST, so the walk starts at the smallest a card goes.
      await dragTheEdge(page, richId, 'left', 400)
      const seen: (string | null)[] = [(await theCard(page, richId)).level]
      for (let step = 0; step < 6; step += 1) {
        await dragTheEdge(page, richId, 'right', 90)
        seen.push((await theCard(page, richId)).level)
      }
      expect(seen[0], 'the smallest a card goes is its written label, level 1').toBe('label')
      expect(seen, 'the ladder climbs to the record’s own line and stops there').toContain('title')
      expect(seen, 'the level-3 line arrives as the card grows').toContain('gist')
      expect(seen, 'nothing above level 3 is reached while the tick is off').not.toContain('outline')
      expect(seen, 'nothing above level 3 is reached while the tick is off').not.toContain('sketch')
      const last = await theCard(page, richId)
      expect(last.words, 'the record’s own line is on the card at level 3').toContain('Quokka')
    }, 240_000)

    it('reaches levels 4, 5 and 6 only once the tick at the card’s bottom-right corner is on', async () => {
      await openTheDrawing(page, theme)
      await pressTheCard(page, richId)
      await page.locator('.gx-card-corner .gx-card-tick').first().click()
      await theDrawingHasSettled(page)
      await dragTheEdge(page, richId, 'left', 400)
      const seen: (string | null)[] = []
      // THE WIDTH AND THEN THE HEIGHT, since criterion D33. The size is read from the card's AREA
      // now, so the climb is made of both sides — and a card widened past about seven hundred
      // pixels has its right grip off the window, where a drag lands on nothing. Growing it
      // downwards afterwards is how the last two levels are reached, and it is the criterion's own
      // point: the height counts.
      for (let step = 0; step < 5; step += 1) {
        await dragTheEdge(page, richId, 'right', 110)
        seen.push((await theCard(page, richId)).level)
      }
      for (let step = 0; step < 5; step += 1) {
        await dragTheEdge(page, richId, 'bottom', 90)
        seen.push((await theCard(page, richId)).level)
      }
      expect(seen, 'the step that showed level 3 shows level 4 with the tick on').toContain('outline')
      expect(seen, 'growing further reaches level 5').toContain('sketch')
      expect(seen, 'growing further still reaches level 6').toContain('digest')
      const last = await theCard(page, richId)
      expect(last.words, 'level 6 is each part’s long text').toContain('Caribou')
    }, 240_000)
  })
}

describe('on a phone, a long press on the edge starts the drag', () => {
  it('does nothing when a finger touches the edge and moves straight away', async () => {
    const phone = await app.browser.newPage({ viewport: { width: 390, height: 800 }, hasTouch: true })
    try {
      await openTheDrawing(phone, 'light')
      const before = await theCard(phone, richId)
      const grip = await theGrip(phone, richId, 'right')
      const cdp = await phone.context().newCDPSession(phone)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: grip.x, y: grip.y }] })
      for (let step = 1; step <= 6; step += 1) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: grip.x + step * 15, y: grip.y }],
        })
        await aFrameIsDrawn(phone)
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await theDrawingHasSettled(phone)
      const after = await theCard(phone, richId)
      expect(after.width, 'a finger that does not hold still is a person scrolling past').toBe(before.width)
    } finally {
      await phone.close()
    }
  }, 240_000)

  it('gives the card more room when the finger holds the edge first', async () => {
    const phone = await app.browser.newPage({ viewport: { width: 390, height: 800 }, hasTouch: true })
    try {
      await openTheDrawing(phone, 'light')
      const before = await theCard(phone, richId)
      const grip = await theGrip(phone, richId, 'right')
      const cdp = await phone.context().newCDPSession(phone)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: grip.x, y: grip.y }] })
      // THE LONG PRESS. Half a second is what the code asks for; this holds for longer than that so
      // a machine under load does not read as a finger that moved too soon. It stays a fixed time
      // because the page sets no mark when a finger's hold on an edge has taken (`A_LONG_PRESS` in
      // CardFace.tsx), and the file's own mutation of that timeout is proved on this hold.
      await phone.waitForTimeout(900)
      for (let step = 1; step <= 6; step += 1) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: grip.x + step * 15, y: grip.y }],
        })
        await aFrameIsDrawn(phone)
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await theDrawingHasSettled(phone)
      const after = await theCard(phone, richId)
      expect(after.width, 'the long press armed the drag and the card grew').toBeGreaterThan(before.width + 20)
    } finally {
      await phone.close()
    }
  }, 240_000)
})
