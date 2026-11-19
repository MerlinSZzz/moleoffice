// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RE-READ LIGHT IS ROUND THE PART A PERSON CAN SEE, AT EVERY WIDTH.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 * When the person switches project, a page keeps the previous project's rows while the new project's are read, and
 * the shell draws a travelling light round the part that says a reading is under way. That part is the disc in the
 * sidebar's foot at the desk and in the open drawer, and the Menu press in the bar below 1024 pixels while the drawer
 * is closed. Five cases, each in a browser of its own against one made-up office with two made-up projects. In each,
 * the new project's ideas are held until the test lets them through, and the project is switched with the office's
 * own switcher:
 *
 *   1. 1440 pixels. The light is round the disc.
 *   2. 990 pixels. The Menu press opens the drawer before the switch, and the drawer is closed with its close press
 *      while the read is held. The light is round the disc while the drawer is open, and round the Menu press after
 *      it has closed.
 *   3. 660 pixels, as 990.
 *   4. 390 pixels, as 990.
 *   5. 1440 pixels narrowed to 990 after the light has started. The light is round the disc, then round the Menu
 *      press.
 *
 * In every painted frame until the read is let through, every light drawn on the page stands round the disc or the
 * Menu press, whichever a person can see in that frame, and the light is shown round each part the case expects.
 * Until wave 13y round 171 a light whose part changed while the read was out was ended as a finished read: the whole
 * ring was drawn where the disc had been, or the last moving arc was left there, and it faded there for about 0.3 s
 * while the read was still held.
 *
 * ---------------------------------------------------------------------------------------
 * HOW A FRAME IS SEEN
 * ---------------------------------------------------------------------------------------
 *
 * ONE SAMPLE PER PAINTED FRAME, taken in requestAnimationFrame, which runs just before the browser paints, as
 * tests/a-switch-of-project-reads-again-only-what-belongs-to-a-project.test.ts takes its frames.
 *
 * A LIGHT is a canvas the light draws on that is not hidden, is not wholly transparent, overlaps the window and has
 * drawn pixels, counted from its own image.
 *
 * A PART A PERSON CAN SEE has a box with room in it and its centre inside the window, and the element the browser
 * finds at that centre is the part or inside it. The browser's finding passes through anything that takes no
 * pointer, as the drawer and its scrim do while they close. So the Menu press under the open drawer's scrim is not
 * seen, the disc in a drawer that is closing or closed is not seen, and the Menu press is seen as the drawer closes.
 *
 * A LIGHT IS ROUND A PART when the part's box lies inside the canvas's box and the two centres are within 2 pixels.
 */

import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { switchTheProject, waitForTheProjects } from './switch-the-project.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const ALPHA = { id: 'alpha', title: 'Made-up Alpha', idea: 'A made-up idea of Alpha: a quieter gripper' }
const BETA = { id: 'beta', title: 'Made-up Beta', idea: 'A made-up idea of Beta: a second loading bay' }
const DESK = { width: 1440, height: 900 }
/** How long the read is held after the switch, and again after the drawer closes or the window narrows. */
const HELD_FOR = 1_200
/** The fewest frames in which the light must be round each part the case expects. */
const FEWEST_LIT = 10

let app: LiveApp

/** The person's own headers in one project. Built when asked, because the person is read after the build. */
function asThePerson(project: string): Record<string, string> {
  return { 'content-type': 'application/json', 'x-mole-office-workspace': project, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
}

async function write(path: string, body: unknown, headers: Record<string, string>): Promise<void> {
  const answer = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(answer.status, `POST ${path}: ${await answer.text()}`).toBe(201)
}

beforeAll(async () => {
  app = await liveApp({ name: 're-read-light-round-what-is-seen', viewport: DESK })
  for (const project of [ALPHA, BETA]) {
    await write('/api/workspaces', { id: project.id, title: project.title }, asThePerson('default'))
    await write('/api/records', { kind: 'idea', title: project.idea, data: {} }, asThePerson(project.id))
  }
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** left, top, width, height, in the window's pixels. */
type Box = [number, number, number, number]

/** One of the two parts the light may stand round, as one frame drew it. */
interface Part {
  box: Box
  /** A person can see it: it has room, its centre is in the window, and nothing covers that centre. */
  seen: boolean
}

/** What one painted frame showed. */
interface Frame {
  /** Milliseconds since the press on the new project, or null before it. */
  sinceTheSwitch: number | null
  /** Each light drawn in this frame, by its canvas's box. */
  lights: Box[]
  disc: Part | null
  menu: Part | null
}

/** Start taking one sample per painted frame. */
async function startTheFrames(page: Page): Promise<void> {
  await page.evaluate((project: string) => {
    const frames: Frame[] = []
    const held = window as unknown as { __frames: Frame[]; __stopFrames: boolean }
    held.__frames = frames
    held.__stopFrames = false
    let pressed: number | null = null
    document.addEventListener('click', (event) => {
      if (pressed === null && event.target instanceof Element && event.target.closest(`.sbp-choice[data-project="${project}"]`) !== null) pressed = performance.now()
    }, true)
    const boxOf = (element: Element): Box => {
      const r = element.getBoundingClientRect()
      return [r.left, r.top, r.width, r.height]
    }
    const part = (selector: string): Part | null => {
      const element = document.querySelector(selector)
      if (element === null) return null
      const box = boxOf(element)
      const [x, y] = [box[0] + box[2] / 2, box[1] + box[3] / 2]
      const roomy = box[2] > 0 && box[3] > 0 && x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight
      const found = roomy ? document.elementFromPoint(x, y) : null
      return { box, seen: found !== null && element.contains(found) }
    }
    const take = (): void => {
      const lights: Box[] = []
      for (const canvas of document.querySelectorAll('canvas[data-wait-light]')) {
        if (!(canvas instanceof HTMLCanvasElement)) continue
        const style = getComputedStyle(canvas)
        const box = boxOf(canvas)
        const onScreen = box[0] + box[2] > 0 && box[1] + box[3] > 0 && box[0] < window.innerWidth && box[1] < window.innerHeight
        if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0 || !onScreen || canvas.width === 0 || canvas.height === 0) continue
        const pixels = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data
        let drawn = false
        if (pixels !== undefined) for (let i = 3; i < pixels.length && !drawn; i += 4) drawn = pixels[i] !== 0
        if (drawn) lights.push(box)
      }
      frames.push({ sinceTheSwitch: pressed === null ? null : performance.now() - pressed, lights, disc: part('.sbp-disc'), menu: part('.shell-menu') })
      if (!held.__stopFrames) requestAnimationFrame(take)
    }
    requestAnimationFrame(take)
  }, BETA.id)
}

async function framesSoFar(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames.length)
}

async function stopTheFrames(page: Page): Promise<Frame[]> {
  return page.evaluate(() => {
    const held = window as unknown as { __frames: Frame[]; __stopFrames: boolean }
    held.__stopFrames = true
    return held.__frames
  })
}

/** The part's box lies inside the light's, and their centres are within 2 pixels. */
function isRound(light: Box, part: Part | null): boolean {
  if (part === null || part.box[2] <= 0 || part.box[3] <= 0) return false
  const [x, y, w, h] = part.box
  const inside = x >= light[0] - 1 && y >= light[1] - 1 && x + w <= light[0] + light[2] + 1 && y + h <= light[1] + light[3] + 1
  const centred = Math.abs(light[0] + light[2] / 2 - (x + w / 2)) <= 2 && Math.abs(light[1] + light[3] / 2 - (y + h / 2)) <= 2
  return inside && centred
}

const said = (box: Box): string => box.map((n) => n.toFixed(0)).join(',')
const saidPart = (part: Part | null): string => (part === null ? 'not in the page' : `at ${said(part.box)}, ${part.seen ? 'seen' : 'not seen'}`)
const seconds = (frame: Frame): string => (frame.sinceTheSwitch === null ? 'before the switch' : `${(frame.sinceTheSwitch / 1000).toFixed(2)} s after the switch`)

/** Lit: how many frames have a light round this part while a person can see it. */
function framesLitRound(frames: Frame[], which: 'disc' | 'menu'): number {
  return frames.filter((frame) => frame[which]?.seen === true && frame.lights.some((light) => isRound(light, frame[which]))).length
}

/** Every light in every held frame stands round a part a person can see in that frame. */
function everyLightRoundWhatIsSeen(held: Frame[], faults: string[]): void {
  const astray = held.filter((frame) => frame.lights.some((light) => !(frame.disc?.seen === true && isRound(light, frame.disc)) && !(frame.menu?.seen === true && isRound(light, frame.menu))))
  const first = astray[0]
  if (first === undefined) return
  const light = first.lights.find((one) => !(first.disc?.seen === true && isRound(one, first.disc)) && !(first.menu?.seen === true && isRound(one, first.menu))) as Box
  faults.push(
    `${String(astray.length)} of ${String(held.length)} frames before the answer drew a light round no part a person could see; ` +
      `the first ${seconds(first)}: a light at ${said(light)}, the disc ${saidPart(first.disc)}, the Menu press ${saidPart(first.menu)}`,
  )
}

/** Ideas in a browser of its own, reading ALPHA at this size, with BETA's ideas held. */
async function aBrowserOnIdeas(view: { width: number; height: number }): Promise<{ context: BrowserContext; page: Page; errors: string[]; caught: () => number; release: () => void }> {
  const context = await app.browser.newContext({ viewport: view })
  await context.addInitScript((project: string) => {
    if (window.localStorage.getItem('mole-office.workspace') === null) {
      window.localStorage.setItem('mole-office.workspace', project)
      window.localStorage.setItem('mole-office.preset.theme', 'light')
      window.localStorage.setItem('mole-office.chat.open', 'no')
    }
  }, ALPHA.id)
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  let release: () => void = () => undefined
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  let caught = 0
  await page.route(
    (url) => url.pathname === '/api/records' && url.searchParams.get('family') === 'ideas',
    async (route) => {
      if (route.request().method() === 'GET' && route.request().headers()['x-mole-office-workspace'] === BETA.id) {
        caught += 1
        await released
      }
      await route.continue()
    },
  )
  await page.goto(`${app.site}/?lang=en#/ideas`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await waitForTheProjects(page)
  await page.locator('#main').getByText(ALPHA.idea).first().waitFor({ timeout: 30_000 })
  await expect.poll(() => page.locator('.px-reread .px-reread-what').count(), { timeout: 20_000, message: 'a re-read was still out before the switch' }).toBe(0)
  await page.mouse.move(view.width - 2, view.height - 2)
  return { context, page, errors, caught: () => caught, release }
}

/**
 * Switch to BETA with its ideas held, and do `change` once the light has been shown for a while. The frames are
 * split where the change was made and where the read was let through.
 */
async function theLightThroughASwitch(
  view: { width: number; height: number },
  change: 'nothing' | 'close the drawer' | 'narrow the window',
): Promise<{ frames: Frame[]; atChange: number; atRelease: number; errors: string[] }> {
  const { context, page, errors, caught, release } = await aBrowserOnIdeas(view)
  try {
    if (change === 'close the drawer') {
      await page.locator('.shell-menu').click()
      await page.locator('#shell-side[data-drawer="open"]:not([data-motion-closing])').waitFor({ timeout: 10_000 })
      await page.waitForTimeout(600)
    }
    await startTheFrames(page)
    await switchTheProject(page, BETA.id)
    await expect.poll(caught, { timeout: 20_000, message: `${BETA.id}'s ideas were never asked for` }).toBeGreaterThan(0)
    await page.waitForTimeout(HELD_FOR)
    const atChange = await framesSoFar(page)
    if (change === 'close the drawer') await page.locator('.shell-close').click()
    if (change === 'narrow the window') await page.setViewportSize({ width: 990, height: view.height })
    if (change !== 'nothing') await page.waitForTimeout(HELD_FOR)
    const atRelease = await framesSoFar(page)
    release()
    await page.locator('#main').getByText(BETA.idea).first().waitFor({ timeout: 20_000 })
    await page.waitForTimeout(500)
    return { frames: await stopTheFrames(page), atChange, atRelease, errors }
  } finally {
    release()
    await context.close()
  }
}

describe('the re-read light is round the part a person can see', () => {
  it('1. at 1440 pixels the light is round the disc until the answer comes', async () => {
    const { frames, atRelease, errors } = await theLightThroughASwitch(DESK, 'nothing')
    const held = frames.slice(0, atRelease)
    if (held.filter((frame) => frame.sinceTheSwitch !== null).length < 30) throw new Error('fewer than 30 frames were taken while the read was held')
    const faults: string[] = []
    everyLightRoundWhatIsSeen(held, faults)
    const lit = framesLitRound(held, 'disc')
    if (lit < FEWEST_LIT) faults.push(`the light was round the disc in ${String(lit)} frames while the read was held`)
    expect(errors, 'the page threw').toEqual([])
    expect(faults).toEqual([])
  }, 180_000)

  for (const [n, width, height] of [[2, 990, 900], [3, 660, 900], [4, 390, 844]] as const) {
    it(`${String(n)}. at ${String(width)} pixels the light is round the disc in the open drawer, then round the Menu press once the drawer is closed`, async () => {
      const { frames, atChange, atRelease, errors } = await theLightThroughASwitch({ width, height }, 'close the drawer')
      const open = frames.slice(0, atChange)
      const closed = frames.slice(atChange, atRelease)
      if (closed.length < 30) throw new Error(`only ${String(closed.length)} frames were taken after the drawer was closed`)
      const faults: string[] = []
      everyLightRoundWhatIsSeen(frames.slice(0, atRelease), faults)
      const litDisc = framesLitRound(open, 'disc')
      if (litDisc < FEWEST_LIT) faults.push(`the light was round the disc in the open drawer in ${String(litDisc)} frames`)
      const litMenu = framesLitRound(closed, 'menu')
      if (litMenu < FEWEST_LIT) faults.push(`the light was round the Menu press after the drawer closed in ${String(litMenu)} frames`)
      expect(errors, 'the page threw').toEqual([])
      expect(faults).toEqual([])
    }, 180_000)
  }

  it('5. narrowed from 1440 to 990 pixels after the light has started, the light goes from the disc to the Menu press', async () => {
    const { frames, atChange, atRelease, errors } = await theLightThroughASwitch(DESK, 'narrow the window')
    const wide = frames.slice(0, atChange)
    const narrow = frames.slice(atChange, atRelease)
    if (narrow.length < 30) throw new Error(`only ${String(narrow.length)} frames were taken after the window was narrowed`)
    const faults: string[] = []
    everyLightRoundWhatIsSeen(frames.slice(0, atRelease), faults)
    const litDisc = framesLitRound(wide, 'disc')
    if (litDisc < FEWEST_LIT) faults.push(`the light was round the disc before the narrowing in ${String(litDisc)} frames`)
    const litMenu = framesLitRound(narrow, 'menu')
    if (litMenu < FEWEST_LIT) faults.push(`the light was round the Menu press after the narrowing in ${String(litMenu)} frames`)
    expect(errors, 'the page threw').toEqual([])
    expect(faults).toEqual([])
  }, 180_000)
})
