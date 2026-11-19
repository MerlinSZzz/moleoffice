// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT PANEL IS THE SIZE THE PERSON LEFT IT AT, NOT THE SIZE OF WHAT IS IN IT.
 *
 * The chat panel used to change size with its content. It is to keep a fixed size that a person
 * can change: the left edge sets the width, the top edge the height, and the top-left corner both.
 * Criterion M17 of design/messages/ACCEPTANCE.md section 9, problem `elYmu4bvJ0la`.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A BROWSER TEST AND NOT A RENDER TEST
 * ---------------------------------------------------------------------------------------
 *
 * Every claim here is about a box on a screen: how tall the panel is when three messages arrive
 * instead of one, where it ends up after a pointer is dragged 80 pixels, and whether the handles are
 * there at 390. None of those is answerable from the markup. A test that asserted the component sets
 * a style property would pass on a build where the stylesheet overrides it, which is exactly the
 * failure a fixed size has: `max-height` was doing the sizing before this, and it looked set.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTROL
 * ---------------------------------------------------------------------------------------
 *
 * The first case measures the panel with one message in it and again with many. A panel that failed
 * to open at all would have no box, and `$eval` throws rather than passing; a panel that opened and
 * drew nothing would be caught by the message count the case asserts before it measures.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { CHAT_WORDS } from '../src/shared/messages.ts'
import { sizeFromWhatWasStored, sizeHeldInside } from '../src/web/components/Chat.tsx'
import { openTheChatWindow } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_THE_AGENT = {
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'builder-size',
}

async function say(headers: Record<string, string>, body: string, to: { kind: string; id: string }): Promise<void> {
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ kind: 'message', title: body.slice(0, 30), data: { body, to: [to] } }),
  })
  expect(said.status, await said.clone().text()).toBe(201)
}

/** The panel's box on the screen, in pixels. */
async function theBox(): Promise<{ left: number; top: number; width: number; height: number }> {
  return app.page.$eval('.px-chat', (one) => {
    const at = one.getBoundingClientRect()
    return { left: at.left, top: at.top, width: at.width, height: at.height }
  })
}

async function openThePanel(): Promise<void> {
  await app.page.goto(app.site)
  await waitForThePage(app.page, 30_000)
  const already = await app.page.$('.px-chat')
  await openTheChatWindow(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 15_000 })
}

/** Drag one handle by this much, as a pointer really does it. */
async function drag(edge: 'left' | 'top' | 'corner', by: { x: number; y: number }): Promise<void> {
  const at = await app.page.$eval(`.px-chat-grip[data-edge="${edge}"]`, (one) => {
    const box = one.getBoundingClientRect()
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
  })
  await app.page.mouse.move(at.x, at.y)
  await app.page.mouse.down()
  // IN STEPS, because one jump can be delivered as a single move the panel treats as the whole
  // drag; a real pointer sends many, and a handler that only reads the last one would still pass.
  await app.page.mouse.move(at.x + by.x / 2, at.y + by.y / 2, { steps: 4 })
  await app.page.mouse.move(at.x + by.x, at.y + by.y, { steps: 4 })
  await app.page.mouse.up()
}

beforeAll(async () => {
  app = await liveApp({ name: 'chat-size', viewport: { width: 1440, height: 1000 } })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Builder Size',
      data: { handle: 'builder-size', runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(filed.status, await filed.text()).toBe(201)
  await say(AS_THE_AGENT, 'The first thing said.', { kind: 'person', id: THE_PERSON })
}, 180_000)

afterAll(async () => {
  await app.stop()
})

describe('the panel does not change size with what is in it', () => {
  it('is the same box with one message in the conversation and with twenty', async () => {
    await openThePanel()
    await app.page.click('.px-chat-contact')
    await app.page.waitForSelector('.px-chat-words', { timeout: 15_000 })
    const before = await theBox()
    expect(before.height).toBeGreaterThan(100)

    for (let i = 0; i < 20; i += 1) {
      await say(AS_THE_AGENT, `A line long enough to wrap more than once in a narrow bubble, number ${String(i)}.`, {
        kind: 'person',
        id: THE_PERSON,
      })
    }
    await app.page.waitForFunction(
      () => document.querySelectorAll('.px-chat-said .px-chat-one').length >= 20,
      undefined,
      { timeout: 20_000 },
    )
    const after = await theBox()
    expect(after.height, 'the panel grew taller when messages arrived').toBeCloseTo(before.height, 0)
    expect(after.width, 'the panel grew wider when messages arrived').toBeCloseTo(before.width, 0)
  }, 180_000)
})

describe('the person drags the size they want', () => {
  it('widens from the left edge without changing the height', async () => {
    await openThePanel()
    const before = await theBox()
    await drag('left', { x: -80, y: 0 })
    const after = await theBox()
    expect(after.width - before.width).toBeGreaterThan(60)
    expect(after.height).toBeCloseTo(before.height, 0)
  }, 120_000)

  it('heightens from the top edge without changing the width', async () => {
    await openThePanel()
    const before = await theBox()
    await drag('top', { x: 0, y: -70 })
    const after = await theBox()
    expect(after.height - before.height).toBeGreaterThan(50)
    expect(after.width).toBeCloseTo(before.width, 0)
  }, 120_000)

  it('changes both from the top-left corner', async () => {
    await openThePanel()
    const before = await theBox()
    await drag('corner', { x: -60, y: -60 })
    const after = await theBox()
    expect(after.width - before.width).toBeGreaterThan(40)
    expect(after.height - before.height).toBeGreaterThan(40)
  }, 120_000)

  it('says what each handle changes, in words and not by its edge', async () => {
    await openThePanel()
    for (const edge of ['left', 'top', 'corner'] as const) {
      const said = await app.page.getAttribute(`.px-chat-grip[data-edge="${edge}"]`, 'aria-label')
      expect(said).toBe(CHAT_WORDS.dragging[edge])
    }
  }, 120_000)
})

describe('the size survives a reload', () => {
  it('opens at the size it was dragged to, and the panel stays inside the window', async () => {
    await openThePanel()
    await drag('corner', { x: -120, y: -100 })
    const dragged = await theBox()
    await app.page.reload()
    await waitForThePage(app.page, 30_000)
    await app.page.waitForSelector('.px-chat', { timeout: 15_000 })
    const after = await theBox()
    expect(after.width, 'the width was not remembered').toBeCloseTo(dragged.width, 0)
    expect(after.height, 'the height was not remembered').toBeCloseTo(dragged.height, 0)
    expect(after.left).toBeGreaterThanOrEqual(0)
    expect(after.top).toBeGreaterThanOrEqual(0)
  }, 180_000)

  it('reads two numbers out of what was stored and refuses anything else', () => {
    expect(sizeFromWhatWasStored('420x300')).toEqual({ width: 420, height: 300 })
    expect(sizeFromWhatWasStored(null), 'nothing stored is not a size').toBeNull()
    expect(sizeFromWhatWasStored('as wide as you like'), 'words are not a size').toBeNull()
    expect(sizeFromWhatWasStored('420'), 'one number is not a size').toBeNull()
    expect(sizeFromWhatWasStored('420x300x9'), 'three numbers are not a size').toBeNull()
    expect(sizeFromWhatWasStored('-420x300'), 'a negative width is not a size').toBeNull()
    expect(sizeFromWhatWasStored('420xNaN'), 'a width that is not a number is not a size').toBeNull()
  })

  it('holds a size inside the window it has to be drawn in', () => {
    const window = { width: 1440, height: 1000 }
    expect(sizeHeldInside({ width: 3000, height: 3000 }, window).width).toBeLessThanOrEqual(1440)
    expect(sizeHeldInside({ width: 3000, height: 3000 }, window).height).toBeLessThanOrEqual(1000)
    expect(sizeHeldInside({ width: 10, height: 10 }, window).width).toBeGreaterThan(100)
    expect(sizeHeldInside({ width: 10, height: 10 }, window).height).toBeGreaterThan(100)
    expect(sizeHeldInside({ width: 400, height: 500 }, window)).toEqual({ width: 400, height: 500 })
  })

  it('is not thrown by a stored size this build cannot read', async () => {
    await app.page.evaluate(() => {
      window.localStorage.setItem('mole-office.chat.size', 'as wide as you like')
    })
    await app.page.reload()
    await waitForThePage(app.page, 30_000)
    await app.page.waitForSelector('.px-chat', { timeout: 15_000 })
    const after = await theBox()
    expect(after.width).toBeGreaterThan(200)
    expect(after.height).toBeGreaterThan(200)
  }, 180_000)
})

describe('at 390 the panel is the whole width and there is nothing to drag', () => {
  it('fills the width and draws no handles', async () => {
    await app.page.setViewportSize({ width: 390, height: 844 })
    await openThePanel()
    const box = await app.page.$eval('.px-chat', (one) => {
      const at = one.getBoundingClientRect()
      return { left: at.left, right: at.right, width: window.innerWidth, scroll: document.documentElement.scrollWidth }
    })
    expect(box.left).toBeLessThanOrEqual(1)
    expect(box.right).toBeGreaterThanOrEqual(box.width - 1)
    expect(box.scroll, 'the page scrolls sideways with the panel open').toBeLessThanOrEqual(box.width + 1)
    expect(await app.page.locator('.px-chat-grip').count(), 'a drag handle is drawn on a phone').toBe(0)
    await app.page.setViewportSize({ width: 1440, height: 1000 })
  }, 120_000)
})

/**
 * THE HEADER STAYS PUT, THE PANEL HAS NO CROSS, AND THE LINE EDITOR HAS ONE OF ITS OWN.
 *
 * After the panel half landed, pressing the working line moved the picture on the left and the
 * cross on the right with it, and pressing that cross to stop editing shut the whole chat. So:
 *
 *   1. the two stay fixed at the top, and the panel needs no close cross, because pressing the
 *      circle at the bottom right folds it;
 *   2. once the working line is open, it does need a cross that cancels the editing.
 *
 * Criterion M17 refined, problem `RNpZdXjpMxC_`.
 */
/**
 * These three need the FIRST screen, where the person's own row is. `openThePanel` above leaves the panel
 * wherever the last case left it, which by here is inside a conversation.
 */
async function openTheirOwnRow(): Promise<void> {
  await openThePanel()
  if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
  await app.page.waitForSelector('.px-chat-me', { timeout: 20_000 })
}

describe('the header is fixed, and the cross belongs to the line and not to the panel', () => {
  it('keeps the cross out of the header, and the circle still collapses the panel', async () => {
    // THE FAULT WAS THE CROSS IN THE HEADER ROW, beside the line being edited: pressing it to stop
    // editing shut the whole chat. That
    // cross is still gone, and nothing in a header closes the panel.
    await openTheirOwnRow()
    expect(
      await app.page.locator('.px-chat-me .px-chat-close, .px-chat-them .px-chat-close').count(),
      'a header still draws a cross that closes the panel, which is what shut the panel the person was working in',
    ).toBe(0)
    // THE PANEL'S OWN CLOSE PRESS IS AT THE TOP RIGHT, in a row of its own above every header, on
    // a later request: criterion M104, a close press at the top right again that folds the panel. Its own test is
    // tests/the-chat-fills-the-window-and-folds.test.ts.
    expect(await app.page.locator('.px-chat-chrome .px-chat-close').count()).toBe(1)
    // AND THE CLOSE PRESS STILL COLLAPSES IT, the job M17 gave the circle. Design D draws the
    // circle only while the chat is shut and a message waits, so the sidebar opens it again.
    await app.page.click('.px-chat-close')
    await app.page.waitForFunction(() => document.querySelector('.px-chat') === null, undefined, { timeout: 20_000 })
    await openTheChatWindow(app.page)
  }, 120_000)

  it('leaves the avatar exactly where it was when the line is opened for editing', async () => {
    await openTheirOwnRow()
    const where = async (): Promise<{ x: number; y: number }> => {
      const box = await app.page.locator('.px-chat-me img, .px-chat-me .px-avatar').first().boundingBox()
      expect(box, 'no picture is drawn beside the person\'s name').not.toBeNull()
      return { x: Math.round(box?.x ?? 0), y: Math.round(box?.y ?? 0) }
    }
    const before = await where()
    await app.page.click('.px-chat-state')
    await app.page.waitForSelector('.px-chat-state-box', { timeout: 20_000 })
    expect(await where(), 'the picture moved when the line under it was opened for editing').toEqual(before)
  }, 120_000)

  it('cancels the edit from its own cross and leaves the line as it was', async () => {
    await openTheirOwnRow()
    const said = (await app.page.textContent('.px-chat-state')) ?? ''
    await app.page.click('.px-chat-state')
    await app.page.waitForSelector('.px-chat-state-box', { timeout: 20_000 })
    await app.page.fill('.px-chat-state-box', 'Something the person decided not to say.')

    await app.page.click('.px-chat-stop-editing')
    await app.page.waitForSelector('.px-chat-state', { timeout: 20_000 })
    // THE PANEL IS STILL OPEN. Pressing the only cross there used to be closed the whole thing.
    expect(await app.page.locator('.px-chat').count(), 'cancelling the edit closed the panel').toBe(1)
    expect(await app.page.textContent('.px-chat-state'), 'cancelling the edit changed the line').toBe(said)

    // AND THE SERVER WAS NEVER TOLD, so nothing was written by a press that says cancel.
    const read = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { headers: AS_THE_OWNER })
    expect(read.status, await read.clone().text()).toBe(200)
    const held = ((await read.json()) as { participant: { state: string | null } }).participant
    expect(held.state ?? '', 'the line the person cancelled was written down anyway').not.toBe(
      'Something the person decided not to say.',
    )
  }, 120_000)
})
