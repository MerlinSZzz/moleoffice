// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CORNER CHAT BUTTON IS ROUND IN EVERY LOOK. Item 89(a) of wave 13y, round 145: the owner found its yellow
 * plate square in the light look, and asked for it round in every look.
 *
 * The button draws its own round corners and reads no theme corner style name (.px-chat-circle in
 * src/web/components/Chat.tsx), and the picture on it takes the same corners. Every theme, and a theme of the
 * person's own, is read in tests/every-chat-plate-is-round-in-every-theme.test.ts. In a test office of its own,
 * this file opens Home in the light look and the dark look, at 1440, 990, 660 and 390, and reads the corners the
 * browser draws: each must be at least half the button's width, so the button is a circle. The picture on it is
 * read the same way. At 1440 it also reads the third choice, which follows the computer's own light or dark, with
 * the computer set each way; and the two other corner settings, sharp and soft, in both looks, because those change
 * every other corner in the office.
 *
 * Every look and width is read before the file says which are not round, so a failure names all of them.
 *
 * Set W13Y_CHAT_BUTTON_SHOTS to a folder outside the checkout to photograph Home at the four widths in both looks,
 * and the button close up beside each picture. The pictures are taken before the corners are judged, so the same
 * run on the old code shows the square plate. The test office holds no real office data, and each picture says so
 * above the page.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_SHELL_WIDTH } from '../src/web/lib/the-shell-width.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

let app: LiveApp

const shots = process.env['W13Y_CHAT_BUTTON_SHOTS']
const LABEL = 'Made-up data — an invented office, not real office data'
const THE_PAGE_TOP = '#main > *:not([data-made-up-label]):not(style)'
const WIDTHS = [1440, 990, 660, 390] as const

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** File one unread message for the person, so design D draws the corner circle while the chat is shut. */
async function aWaitingMessage(): Promise<void> {
  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title: 'Round Button Keeper', data: { handle: 'round-button-keeper', runtime: 'claude-code', state: 'active' } }),
  })
  expect(made.status, await made.clone().text()).toBe(201)
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'round-button-keeper' },
    body: JSON.stringify({ kind: 'message', title: 'A made-up line for the round button', data: { body: 'A made-up line for the round button.', to: [{ kind: 'person', id: THE_PERSON }] } }),
  })
  expect(said.status, await said.clone().text()).toBe(201)
}

/** The corners drawn on the button and on the picture it carries, in pixels, beside the button's size. */
interface TheShape {
  width: number
  height: number
  smallestCorner: number
  smallestPictureCorner: number | null
  pictureWidth: number | null
}

async function theShapeDrawn(): Promise<TheShape> {
  return app.page.locator('.px-chat-circle').evaluate((button) => {
    const cornersOf = (element: Element): { width: number; smallest: number } => {
      const box = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      const inPixels = (value: string): number => (value.trim().endsWith('%') ? (Number.parseFloat(value) / 100) * box.width : Number.parseFloat(value))
      const corners = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius]
      return { width: box.width, smallest: Math.min(...corners.map(inPixels)) }
    }
    const box = button.getBoundingClientRect()
    const picture = button.querySelector('.px-chat-circle-mark')
    const drawn = picture === null ? null : cornersOf(picture)
    return {
      width: box.width,
      height: box.height,
      smallestCorner: cornersOf(button).smallest,
      smallestPictureCorner: drawn?.smallest ?? null,
      pictureWidth: drawn?.width ?? null,
    }
  })
}

/** What is wrong with a shape, or null when the button and its picture are circles. Half a pixel is rounding. */
function notRound(shape: TheShape): string | null {
  if (Math.abs(shape.width - shape.height) > 0.5) return `the button is ${String(shape.width)} by ${String(shape.height)} pixels`
  if (shape.smallestCorner < shape.width / 2 - 0.5) return `a corner of ${String(shape.smallestCorner)} pixels on a button ${String(shape.width)} wide`
  if (shape.smallestPictureCorner !== null && shape.pictureWidth !== null && shape.smallestPictureCorner < shape.pictureWidth / 2 - 0.5) {
    return `a corner of ${String(shape.smallestPictureCorner)} pixels on a picture ${String(shape.pictureWidth)} wide`
  }
  return null
}

/** Open Home afresh in this look and with these corners, with the computer set to this light or dark. */
async function openHome(look: 'light' | 'dark' | 'auto', corners: 'default' | 'sharp' | 'soft', computer: 'light' | 'dark' = 'light'): Promise<void> {
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  await app.page.emulateMedia({ colorScheme: computer })
  await app.page.goto(`${app.site}/`)
  await app.page.evaluate(
    ([theme, radius]) => {
      localStorage.setItem('mole-office.preset.theme', theme ?? 'light')
      localStorage.setItem('mole-office.preset.radius', radius ?? 'default')
    },
    [look, corners],
  )
  await app.page.goto(`${app.site}/?lang=en&mode=normal#/`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.waitForSelector('.px-chat-circle', { timeout: 30_000 })
  const drawnAs = await app.page.evaluate(() => [document.documentElement.dataset['theme'], document.documentElement.dataset['radius']])
  expect(drawnAs, 'the look and the corners the page was opened with').toEqual([look === 'auto' ? undefined : look, corners])
}

beforeAll(async () => {
  app = await liveApp({ name: 'the-chat-button-is-round', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  // This case exercises the explicit unread-only choice.
  const unreadOnly = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
    method: 'PATCH', headers: AS_THE_OWNER, body: JSON.stringify({ chatButtonStays: 'when-unread' }),
  })
  expect(unreadOnly.status, await unreadOnly.clone().text()).toBe(200)
  await aWaitingMessage()
  if (shots !== undefined) mkdirSync(shots, { recursive: true })
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

it(`draws the corner chat button as a circle in every look where design D draws it, and the top bar chat press below ${String(THE_SHELL_WIDTH)}, with sharp and soft corners: with 8-pixel corners in the light look it was a square plate`, async () => {
  const wrong: string[] = []
  for (const look of ['light', 'dark'] as const) {
    await openHome(look, 'default')
    for (const width of WIDTHS) {
      await app.page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      await app.page.waitForTimeout(300)
      const theCornerIsDrawn = width >= THE_SHELL_WIDTH
      if (shots !== undefined) {
        const name = `chat-button-${look}-${String(width)}`
        await putTheMadeUpLabelIn(app.page, LABEL, app.page.locator(THE_PAGE_TOP).first(), name)
        await app.page.screenshot({ path: join(shots, `${name}.png`) })
        if (theCornerIsDrawn) {
          const box = await app.page.locator('.px-chat-circle').boundingBox()
          if (box === null) throw new Error(`the chat button has no box at ${String(width)} in the ${look} look`)
          const room = 20
          await app.page.screenshot({
            path: join(shots, `${name}-close.png`),
            clip: { x: box.x - room, y: box.y - room, width: box.width + 2 * room, height: box.height + 2 * room },
          })
        }
      }
      if (theCornerIsDrawn) {
        const why = notRound(await theShapeDrawn())
        if (why !== null) wrong.push(`${look}, default corners, ${String(width)}: ${why}`)
      } else {
        // DESIGN D DRAWS NO CORNER CIRCLE BELOW THE WIDTH AT WHICH THE PAGE TURNS WIDE (THE_SHELL_WIDTH); THE TOP BAR'S CHAT PRESS IS THE DRAWN WAY.
        expect(await app.page.locator('.px-chat-circle').count(), `${look} ${String(width)}: the corner circle was drawn below ${String(THE_SHELL_WIDTH)}`).toBe(0)
        expect(await app.page.locator('.shell-bar .shell-chat-phone').count(), `${look} ${String(width)}: the top bar's chat press was not drawn`).toBe(1)
      }
    }
    for (const corners of ['sharp', 'soft'] as const) {
      await openHome(look, corners)
      const why = notRound(await theShapeDrawn())
      if (why !== null) wrong.push(`${look}, ${corners} corners, 1440: ${why}`)
    }
  }
  for (const computer of ['light', 'dark'] as const) {
    await openHome('auto', 'default', computer)
    const why = notRound(await theShapeDrawn())
    if (why !== null) wrong.push(`following a ${computer} computer, default corners, 1440: ${why}`)
  }
  await app.page.emulateMedia({ colorScheme: null })
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  expect(wrong, 'where the chat button is not a circle').toEqual([])
}, 300_000)
