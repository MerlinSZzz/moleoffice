// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RE-READ LIGHT ENDS AS THE READ DID.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 * When the person switches project, the shell draws a travelling light round the sidebar's disc while the new
 * project's rows are read. The light ends the way the wait ended: only a read that was answered ends in the whole
 * ring, because the whole ring says the read worked. Three cases at 1440 pixels, each in a browser of its own against
 * one made-up office with two made-up projects. In each, the new project's ideas are held until the test lets them
 * through, and the project is switched with the office's own switcher:
 *
 *   1. The read is answered. The whole ring shows round the disc after the answer, so this file cannot pass by never
 *      drawing one.
 *   2. The read is refused. No frame from the refusal on has the whole ring round the disc.
 *   3. "File it" is pressed on a made-up idea while the read is held. The write is held in turn and then refused, and
 *      the read is let through after it. The press's own light says the write's wait. No frame from the press until the
 *      read is let through has the whole ring round the disc. The write is refused because a filed idea opens its own
 *      page, which would take the list and its read away.
 *
 * Until wave 13y round 171 the light ended as a finished read whenever the re-read marks stopped asking for it: after a
 * refusal, and the moment a foreground wait began while the re-read was still out.
 *
 * ---------------------------------------------------------------------------------------
 * HOW A FRAME IS SEEN
 * ---------------------------------------------------------------------------------------
 *
 * ONE SAMPLE PER PAINTED FRAME, taken in requestAnimationFrame, as
 * tests/the-re-read-light-is-round-the-part-a-person-can-see.test.ts takes its frames.
 *
 * A LIGHT is a canvas the light draws on that is not hidden, is not wholly transparent and overlaps the window. Its
 * image is cut into 16 sectors round its centre, and a sector has ink when a pixel in it is at least 16 of 255
 * opaque. The moving arc has ink in 10 to 12 sectors; THE WHOLE RING has ink in all 16.
 *
 * A LIGHT IS ROUND THE DISC when the disc's box lies inside the canvas's box and the two centres are within 2 pixels.
 */

import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { switchTheProject, waitForTheProjects } from './switch-the-project.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const ALPHA = { id: 'alpha', title: 'Made-up Alpha', idea: 'A made-up idea of Alpha: a quieter gripper' }
const BETA = { id: 'beta', title: 'Made-up Beta', idea: 'A made-up idea of Beta: a second loading bay' }
const WRITTEN = 'A made-up idea, sent while a read is held'
const DESK = { width: 1440, height: 900 }
/** How long the read is held after the switch, and the write after the press. */
const HELD_FOR = 1_200
/** The fewest frames in which the light must be round the disc before the read ends or the press comes. */
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
  app = await liveApp({ name: 're-read-light-ends-as-the-read-did', viewport: DESK })
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

/** One light as one frame drew it: its canvas's box, and how many of its 16 sectors have ink. */
interface Light {
  box: Box
  sectors: number
}

/** What one painted frame showed. */
interface Frame {
  /** Milliseconds since the press on the new project, or null before it. */
  sinceTheSwitch: number | null
  lights: Light[]
  disc: Box | null
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
    const take = (): void => {
      const lights: Light[] = []
      for (const canvas of document.querySelectorAll('canvas[data-wait-light]')) {
        if (!(canvas instanceof HTMLCanvasElement)) continue
        const style = getComputedStyle(canvas)
        const box = boxOf(canvas)
        const onScreen = box[0] + box[2] > 0 && box[1] + box[3] > 0 && box[0] < window.innerWidth && box[1] < window.innerHeight
        if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0 || !onScreen || canvas.width === 0 || canvas.height === 0) continue
        const pixels = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data
        if (pixels === undefined) continue
        const inked = new Set<number>()
        const [cx, cy] = [canvas.width / 2, canvas.height / 2]
        for (let y = 0; y < canvas.height; y += 1) {
          for (let x = 0; x < canvas.width; x += 1) {
            if ((pixels[(y * canvas.width + x) * 4 + 3] ?? 0) < 16) continue
            const turn = (Math.atan2(y + 0.5 - cy, x + 0.5 - cx) + Math.PI) / (2 * Math.PI)
            inked.add(Math.min(15, Math.floor(turn * 16)))
          }
        }
        if (inked.size > 0) lights.push({ box, sectors: inked.size })
      }
      const disc = document.querySelector('.sbp-disc')
      frames.push({ sinceTheSwitch: pressed === null ? null : performance.now() - pressed, lights, disc: disc === null ? null : boxOf(disc) })
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

/** The disc's box lies inside the light's, and their centres are within 2 pixels. */
function isRoundTheDisc(light: Light, disc: Box | null): boolean {
  if (disc === null || disc[2] <= 0 || disc[3] <= 0) return false
  const [x, y, w, h] = disc
  const [lx, ly, lw, lh] = light.box
  const inside = x >= lx - 1 && y >= ly - 1 && x + w <= lx + lw + 1 && y + h <= ly + lh + 1
  const centred = Math.abs(lx + lw / 2 - (x + w / 2)) <= 2 && Math.abs(ly + lh / 2 - (y + h / 2)) <= 2
  return inside && centred
}

const litRoundTheDisc = (frame: Frame): boolean => frame.lights.some((light) => isRoundTheDisc(light, frame.disc))
const wholeRingRoundTheDisc = (frame: Frame): boolean => frame.lights.some((light) => light.sectors === 16 && isRoundTheDisc(light, frame.disc))
const seconds = (frame: Frame): string => (frame.sinceTheSwitch === null ? 'before the switch' : `${(frame.sinceTheSwitch / 1000).toFixed(2)} s after the switch`)

/** No frame of these has the whole ring round the disc. */
function noWholeRing(frames: Frame[], when: string, faults: string[]): void {
  const ringed = frames.filter(wholeRingRoundTheDisc)
  const first = ringed[0]
  if (first !== undefined) faults.push(`${String(ringed.length)} of ${String(frames.length)} frames ${when} drew the whole ring round the disc; the first ${seconds(first)}`)
}

/**
 * Switch to BETA on Ideas at 1440 with its ideas held, and end the read as `how` says. The frames are split where
 * "File it" was pressed and where the read was let through.
 */
async function theLightThroughASwitch(how: 'answered' | 'refused' | 'a foreground press'): Promise<{ frames: Frame[]; atPress: number; atRelease: number; errors: string[] }> {
  const context = await app.browser.newContext({ viewport: DESK })
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
  let answerTheWrite: () => void = () => undefined
  const theWriteIsAnswered = new Promise<void>((resolve) => {
    answerTheWrite = resolve
  })
  let caught = 0
  let writes = 0
  try {
    await page.route(
      (url) => url.pathname === '/api/records' && url.searchParams.get('family') === 'ideas',
      async (route) => {
        if (route.request().method() === 'GET' && route.request().headers()['x-mole-office-workspace'] === BETA.id) {
          caught += 1
          await released
          if (how === 'refused') {
            // A REPLY WRITTEN HERE WOULD BE REFUSED by the browser's own guard, which reads the
            // server's headers (criterion G3), so the server is asked and only its status and body change.
            const response = await route.fetch()
            const headers = response.headers()
            delete headers['content-length']
            await route.fulfill({ status: 500, headers, body: JSON.stringify({ error: 'A made-up refusal for a test.' }) })
            return
          }
        }
        await route.continue()
      },
    )
    if (how === 'a foreground press') {
      await page.route(
        (url) => url.pathname === '/api/records',
        async (route) => {
          if (route.request().method() !== 'POST') return route.fallback()
          writes += 1
          await theWriteIsAnswered
          // THE SERVER'S OWN HEADERS, from a harmless read of the same server: the page reads the world header, and the
          // browser lets it read only what the server's cross-origin headers allow. Nothing is filed.
          const real = await route.fetch({ method: 'GET', url: `${app.api}/api`, postData: '' })
          await route.fulfill({ response: real, status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'A made-up refusal for a test.' }) })
        },
      )
    }
    await page.goto(`${app.site}/?lang=en#/ideas`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await waitForTheProjects(page)
    await page.locator('#main').getByText(ALPHA.idea).first().waitFor({ timeout: 30_000 })
    await expect.poll(() => page.locator('.px-reread .px-reread-what').count(), { timeout: 20_000, message: 'a re-read was still out before the switch' }).toBe(0)
    await page.mouse.move(DESK.width - 2, DESK.height - 2)
    await startTheFrames(page)
    await switchTheProject(page, BETA.id)
    await expect.poll(() => caught, { timeout: 20_000, message: `${BETA.id}'s ideas were never asked for` }).toBeGreaterThan(0)
    let atPress = -1
    if (how === 'a foreground press') {
      await page.locator('#main').getByRole('button', { name: 'Add an idea' }).click()
      await page.locator('#fam-file-idea').fill(WRITTEN)
      await page.mouse.move(DESK.width - 2, DESK.height - 2)
      await page.waitForTimeout(HELD_FOR)
      atPress = await framesSoFar(page)
      await page.locator('.fam-file button[type="submit"]').click()
      await page.mouse.move(DESK.width - 2, DESK.height - 2)
      await expect.poll(() => writes, { timeout: 10_000, message: 'the made-up idea was never sent' }).toBeGreaterThan(0)
      await page.waitForTimeout(HELD_FOR)
      answerTheWrite()
    }
    await page.waitForTimeout(HELD_FOR)
    const atRelease = await framesSoFar(page)
    release()
    if (how === 'refused') {
      // After a switch with no kept answer of the new project, the page says the refusal itself, not the strip.
      await page.locator('.px-reread[data-says="failed"]').or(page.locator('#main').getByText('A failed read, not an empty list.')).first().waitFor({ timeout: 20_000 })
    } else {
      await page.locator('#main').getByText(BETA.idea).first().waitFor({ timeout: 20_000 })
    }
    await expect.poll(() => page.locator('.px-reread .px-reread-what').count(), { timeout: 20_000, message: 'a re-read was still out at the end' }).toBe(0)
    await page.waitForTimeout(500)
    return { frames: await stopTheFrames(page), atPress, atRelease, errors }
  } finally {
    release()
    answerTheWrite()
    await context.close()
  }
}

describe('the re-read light ends as the read did', () => {
  it('1. a read that is answered ends in the whole ring round the disc', async () => {
    const { frames, atRelease, errors } = await theLightThroughASwitch('answered')
    const faults: string[] = []
    const lit = frames.slice(0, atRelease).filter(litRoundTheDisc).length
    if (lit < FEWEST_LIT) faults.push(`the light was round the disc in ${String(lit)} frames while the read was held`)
    const after = frames.slice(atRelease)
    if (!after.some(wholeRingRoundTheDisc)) faults.push(`none of the ${String(after.length)} frames after the answer drew the whole ring round the disc`)
    expect(errors, 'the page threw').toEqual([])
    expect(faults).toEqual([])
  }, 180_000)

  it('2. a read that is refused does not end in the whole ring', async () => {
    const { frames, atRelease, errors } = await theLightThroughASwitch('refused')
    const faults: string[] = []
    const lit = frames.slice(0, atRelease).filter(litRoundTheDisc).length
    if (lit < FEWEST_LIT) faults.push(`the light was round the disc in ${String(lit)} frames while the read was held`)
    noWholeRing(frames.slice(atRelease), 'from the refusal on', faults)
    expect(errors, 'the page threw').toEqual([])
    expect(faults).toEqual([])
  }, 180_000)

  it('3. a foreground press while the read is held does not end the light in the whole ring', async () => {
    const { frames, atPress, atRelease, errors } = await theLightThroughASwitch('a foreground press')
    const faults: string[] = []
    const lit = frames.slice(0, atPress).filter(litRoundTheDisc).length
    if (lit < FEWEST_LIT) faults.push(`the light was round the disc in ${String(lit)} frames before the press`)
    const between = frames.slice(atPress, atRelease)
    if (between.length < 30) throw new Error(`only ${String(between.length)} frames were taken between the press and the answer`)
    noWholeRing(between, 'from the press until the read was let through', faults)
    expect(errors, 'the page threw').toEqual([])
    expect(faults).toEqual([])
  }, 180_000)
})
