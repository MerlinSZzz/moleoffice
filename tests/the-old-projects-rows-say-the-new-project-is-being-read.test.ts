// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OLD PROJECT'S ROWS SAY ON THE PAGE THAT THE NEW PROJECT IS BEING READ.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 * Since wave 13y round 170 a page that belongs to a project keeps the rows it shows while the next
 * project's rows are read, rather than drawing loading. The title changes at once, so for as long as
 * the read takes the page says "Made-up Beta › Ideas" over Made-up Alpha's ideas. The only mark was a
 * status for screen readers, which nobody looking at the page sees, so the rows read as Beta's.
 *
 * Now the rows kept from the old project carry a sign on the page itself until the new rows come: the
 * page column is dimmed, and a strip at its foot names the project being read. This file asks that of
 * two pages, Ideas and Records, at 1440 and 390 pixels, in the light look.
 * Each switch is made as a person makes it, with the sidebar's switcher, through the drawer below
 * 1024 pixels, and the new project's records are held in the browser until the test lets them through.
 *
 * FROM THE MOMENT THE PAGE IS IN SIGHT UNDER THE NEW NAME, until the new rows come, every painted frame
 * that shows the old project's idea must show the sign, and the sign must be one a person can see:
 *
 *   - its box is whole inside the window and inside the page column;
 *   - the element at the centre of its box is the sign or inside it, so nothing is drawn over it;
 *   - the browser draws it, its opacity multiplied up its ancestors is at least 0.9, nothing clips
 *     it, its words are not transparent, and it is at least 40 by 10 pixels;
 *   - its words hold the new project's name as the switcher shows it, read from the page in the same
 *     frame;
 *   - the old project's idea is dimmed: its opacity, multiplied up its ancestors from computed style,
 *     is at most 0.6.
 *
 * Below 1024 pixels the switcher is in a drawer, and choosing a project leaves the drawer open. The
 * page is in sight from the first frame with no drawer scrim, and that is the moment the frames are
 * asked from. At 1440 it is the first frame drawn under the new name.
 *
 * WHEN THE NEW ROWS COME, within one second of the release, the sign and the dimming go in the frame
 * that draws them, and they do not come back. No frame before the switch draws the sign.
 *
 * ONE REFUSED READ. Ideas at 1440 in the light look, and the held read is answered with a refusal.
 * Within one second the sign goes, the old rows go, and the page says the failure in the page.
 *
 * ---------------------------------------------------------------------------------------
 * HOW A FRAME IS SEEN
 * ---------------------------------------------------------------------------------------
 *
 * One sample per painted frame, taken in requestAnimationFrame, just before the browser paints, as
 * tests/a-switch-of-project-reads-again-only-what-belongs-to-a-project.test.ts does and for the same
 * reason. Each sample keeps the time, the project the browser has stored, and what the page draws.
 * The time of the release is taken in the page just before the held read is let through, so a frame
 * before it is surely a frame of the held read.
 *
 * With TEST_SHOTS set, one more case keeps a film of a switch held two seconds at 1440 and at 390
 * pixels. The made-up label stands above the page column, outside the part that is dimmed. Without
 * TEST_SHOTS they do not run.
 */

import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserContext, Page, Route } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { switchTheProject, waitForTheProjects } from './switch-the-project.ts'
import { putTheMadeUpLabelIn, THE_MADE_UP_LABEL_MARKER } from './the-made-up-label-above-the-page.ts'
import { testShots, TEST_SHOTS } from './where-shots-go.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const ALPHA = { id: 'alpha', title: 'Made-up Alpha', idea: 'A made-up idea of Alpha: a quieter gripper' }
const BETA = { id: 'beta', title: 'Made-up Beta', idea: 'A made-up idea of Beta: a second loading bay' }
/** The words the held read of the refused case is refused with. */
const REFUSAL = "A made-up refusal of Beta's records"
const LABEL = 'Made-up office: two made-up projects, for a test'

const WIDTHS = [1440, 390] as const
const HEIGHT = 900
const LOOKS = ['light', 'dark'] as const
type Look = (typeof LOOKS)[number]

/** A page that draws a project's rows, and the address it is opened at. */
interface Place {
  name: string
  route: string
}
const IDEAS: Place = { name: 'Ideas', route: '#/ideas' }
const RECORDS: Place = { name: 'Records', route: '#/records' }

/** The sign this file measures. */
const SIGN = '.px-reread-another'
/** How long the new project's records are held after the page is in sight. */
const HELD_MS = 1_500
/** How long the frames go on after the new rows or the failure are drawn. */
const AFTER_MS = 1_500
/** The time from the release within which the sign and the dimming must be gone. */
const GONE_WITHIN_MS = 1_000
/** The fewest frames of the held read that make the answer mean anything. */
const FEWEST_HELD_FRAMES = 20
/** The old rows are dimmed when their opacity is at most this. */
const DIMMED_AT_MOST = 0.6
/** The sign is drawn at full strength when its opacity is at least this. */
const SIGN_AT_LEAST = 0.9
/** The new rows are drawn undimmed when their opacity is at least this. */
const UNDIMMED_AT_LEAST = 0.99

const films = process.env[TEST_SHOTS] === undefined || process.env[TEST_SHOTS] === '' ? null : testShots('old-rows-say-the-new-project')

let app: LiveApp

/** The person's own headers in one project. Built when asked, because the person is read after the build. */
function asThePerson(project: string): Record<string, string> {
  return { 'content-type': 'application/json', 'x-mole-office-workspace': project, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
}

async function write(path: string, body: unknown, headers: Record<string, string>): Promise<void> {
  const answer = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await answer.text()
  expect(answer.status, `POST ${path}: ${text}`).toBe(201)
}

/** The bytes of the files under a folder, and how many files went while it was walked. */
function bytesUnder(folder: string): { bytes: number; gone: number } {
  let bytes = 0
  let gone = 0
  for (const entry of readdirSync(folder, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue
    try {
      bytes += statSync(join(entry.parentPath, entry.name)).size
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      gone += 1
    }
  }
  return { bytes, gone }
}

beforeAll(async () => {
  app = await liveApp({ name: 'old-rows-say-the-new-project', viewport: { width: WIDTHS[0], height: HEIGHT } })
  for (const project of [ALPHA, BETA]) {
    await write('/api/workspaces', { id: project.id, title: project.title }, asThePerson('default'))
    await write('/api/records', { kind: 'idea', title: project.idea, data: {} }, asThePerson(project.id))
  }
}, 240_000)

afterAll(async () => {
  if (app !== undefined) {
    // THE MADE-UP OFFICE'S SIZE IS SAID BEFORE IT IS DELETED, so a run can report it.
    const { bytes, gone } = bytesUnder(app.dir)
    console.log(`THE MADE-UP OFFICE: ${String(bytes)} bytes in ${app.dir}, ${String(gone)} files gone while it was measured`)
  }
  await app?.stop()
}, 60_000)

/** What a person could not see of the sign in one frame, each beginning with its kind and a colon. */
interface SignSeen {
  text: string
  unseen: string[]
}

/** What one painted frame showed. */
interface Frame {
  /** performance.now() in the page. */
  t: number
  /** The project the browser has stored. */
  stored: string | null
  /** The drawer's scrim is drawn over the page. */
  covered: boolean
  /** The project's name as the switcher shows it. */
  name: string | null
  /** The old project's idea is drawn in the page, and its opacity multiplied up its ancestors. */
  oldRows: boolean
  oldOpacity: number
  /** The new project's idea is drawn in the page, and its opacity multiplied up its ancestors. */
  newRows: boolean
  newOpacity: number
  /** The sign, or null when it is not in the page. */
  sign: SignSeen | null
  /** The page says a read failed, in the page itself rather than on the re-read strip. */
  failed: boolean
}

interface Watched {
  page: Page
  context: BrowserContext
  errors: string[]
}

/**
 * A browser of its own in one look, reading ALPHA. With `film`, it keeps a film of the window, and the
 * made-up label is in the page from its first frame: an unstyled line at the top until the page column
 * is drawn, then a line above the page column.
 */
async function aBrowser(look: Look, film: { width: number } | null = null): Promise<Watched> {
  const viewport = { width: film?.width ?? WIDTHS[0], height: HEIGHT }
  const context = await app.browser.newContext({ viewport, ...(film === null || films === null ? {} : { recordVideo: { dir: films, size: viewport } }) })
  await context.addInitScript(
    ({ project, look }: { project: string; look: Look }) => {
      // ONLY A NEW BROWSER IS SEEDED: a later load must keep the project the test chose.
      if (window.localStorage.getItem('mole-office.workspace') === null) {
        window.localStorage.setItem('mole-office.workspace', project)
        window.localStorage.setItem('mole-office.preset.theme', look)
        window.localStorage.setItem('mole-office.chat.open', 'no')
      }
    },
    { project: ALPHA.id, look },
  )
  if (film !== null) {
    await context.addInitScript(
      ({ words, marker }: { words: string; marker: string }) => {
        const put = (): void => {
          const body = document.body as HTMLElement | null
          if (body === null) return
          const label = document.querySelector(marker) ?? Object.assign(document.createElement('p'), { textContent: words })
          label.setAttribute('data-made-up-label', '')
          const column = document.querySelector('.shell-main')
          if (column !== null) {
            if (column.previousElementSibling !== label) column.before(label)
          } else if (body.firstElementChild !== label) body.prepend(label)
        }
        new MutationObserver(put).observe(document, { childList: true, subtree: true })
      },
      { words: LABEL, marker: THE_MADE_UP_LABEL_MARKER },
    )
  }
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  return { page, context, errors }
}

/** Open a page with ALPHA stored, loaded afresh, and wait until ALPHA's idea is drawn and nothing is read again. */
async function openWithAlpha(watched: Watched, place: Place, look: Look): Promise<void> {
  const { page } = watched
  await page.goto(`${app.site}/?lang=en${place.route}`, { timeout: 60_000 })
  await page.evaluate((id) => window.localStorage.setItem('mole-office.workspace', id), ALPHA.id)
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await waitForTheProjects(page)
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'the look the browser stored').toBe(look)
  await page.locator('#main').getByText(ALPHA.idea).first().waitFor({ timeout: 30_000 })
  await expect.poll(() => page.locator('.px-reread .px-reread-what').count(), { timeout: 20_000, message: 'the page was still being read again' }).toBe(0)
  await page.mouse.move(-1, -1)
}

interface Held {
  caught: () => number
  answered: () => number
  release: () => void
  /** Release, and take the hold off the page. */
  done: () => Promise<void>
}

/**
 * Hold every GET of BETA's records until `release`. With `fail`, the held read is then refused with
 * those words, in the door's own error shape and the server's headers.
 */
async function hold(page: Page, fail?: string): Promise<Held> {
  let release: () => void = () => undefined
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  let caught = 0
  let answered = 0
  const door = (url: URL): boolean => url.pathname === '/api/records'
  const handler = async (route: Route): Promise<void> => {
    if (route.request().method() !== 'GET' || route.request().headers()['x-mole-office-workspace'] !== BETA.id) return route.continue()
    caught += 1
    await released
    if (fail !== undefined) {
      // A REPLY WRITTEN HERE WOULD BE REFUSED by the browser's own guard, which reads the server's
      // headers, so the server is asked and only its status and body change.
      const response = await route.fetch()
      const headers = response.headers()
      delete headers['content-length']
      await route.fulfill({ status: 500, headers, body: JSON.stringify({ error: fail, reason: 'A made-up refusal for a test.' }) })
      answered += 1
      return
    }
    await route.continue()
    answered += 1
  }
  await page.route(door, handler)
  return {
    caught: () => caught,
    answered: () => answered,
    release,
    done: async () => {
      release()
      // A PLAIN UNROUTE DOES NOT WAIT for a handler still running, so the read it had just let go was
      // continued twice and Playwright threw. This waits for every running handler first.
      await page.unrouteAll({ behavior: 'wait' })
    },
  }
}

/** Choose BETA as a person does: below 1024 pixels through the drawer, which is then closed. */
async function switchAsAPersonDoes(page: Page): Promise<void> {
  const drawer = await page.locator('.shell-menu').isVisible()
  if (drawer) {
    await page.locator('.shell-menu').click()
    await page.locator('#shell-side[data-drawer="open"]').waitFor({ timeout: 10_000 })
  }
  await switchTheProject(page, BETA.id)
  if (drawer && (await page.locator('.shell-close').isVisible())) await page.locator('.shell-close').click()
  await page.mouse.move(-1, -1)
}

/** Start taking one sample per painted frame. */
async function startTheFrames(page: Page): Promise<void> {
  await page.evaluate(
    ({ oldIdea, newIdea, sign, atLeast }: { oldIdea: string; newIdea: string; sign: string; atLeast: number }) => {
      const frames: Frame[] = []
      const held = window as unknown as { __frames: Frame[]; __stopFrames: boolean }
      held.__frames = frames
      held.__stopFrames = false
      const named = (element: Element): string => {
        const id = element.id === '' ? '' : `#${element.id}`
        const classes = [...element.classList].slice(0, 2).map((one) => `.${one}`).join('')
        return `<${element.tagName.toLowerCase()}${id}${classes}>`
      }
      const opacityOf = (element: Element): number => {
        let opacity = 1
        for (let one: Element | null = element; one !== null; one = one.parentElement) opacity *= Number(getComputedStyle(one).opacity)
        return opacity
      }
      /** The element drawn in #main, outside the re-read strip, that holds these words. */
      const holding = (main: Element | null, words: string): Element | null => {
        if (main === null) return null
        const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
          const parent = node.parentElement
          if (parent === null || !(node.textContent ?? '').includes(words) || parent.closest('.px-reread') !== null) continue
          if (parent.checkVisibility({ checkVisibilityCSS: true })) return parent
        }
        return null
      }
      const seen = (element: Element): SignSeen => {
        const unseen: string[] = []
        const box = element.getBoundingClientRect()
        const round = (n: number): string => String(Math.round(n))
        if (box.width < 40 || box.height < 10) unseen.push(`size: its box is ${round(box.width)} by ${round(box.height)} pixels`)
        if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) unseen.push('drawn: the browser says it is not drawn')
        const colour = getComputedStyle(element).color
        if (colour === 'transparent' || /,\s*0\)$/.test(colour)) unseen.push(`colour: its words are drawn in ${colour}`)
        for (let one: Element | null = element; one !== null; one = one.parentElement) {
          const style = getComputedStyle(one)
          if (style.clipPath !== 'none') unseen.push(`clip: ${named(one)} has clip-path ${style.clipPath}`)
          if (style.clip !== 'auto' && style.clip !== '') unseen.push(`clip: ${named(one)} has clip ${style.clip}`)
        }
        const opacity = opacityOf(element)
        if (opacity < atLeast) unseen.push(`opacity: its opacity, multiplied up its ancestors, is ${opacity.toFixed(2)}`)
        const width = document.documentElement.clientWidth
        const height = document.documentElement.clientHeight
        if (box.left < -1 || box.top < -1 || box.right > width + 1 || box.bottom > height + 1) {
          unseen.push(`window: its box from ${round(box.left)},${round(box.top)} to ${round(box.right)},${round(box.bottom)} is not whole inside the ${round(width)} by ${round(height)} window`)
        }
        const column = document.querySelector('.shell-main')?.getBoundingClientRect()
        if (column === undefined) unseen.push('column: no page column is drawn')
        else if (box.left < column.left - 1 || box.right > column.right + 1) {
          unseen.push(`column: its box runs from ${round(box.left)} to ${round(box.right)}, outside the page column from ${round(column.left)} to ${round(column.right)}`)
        }
        const at = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
        if (at === null || !(at === element || element.contains(at))) unseen.push(`covered: the point at its centre shows ${at === null ? 'nothing' : named(at)}`)
        return { text: element.textContent ?? '', unseen }
      }
      const take = (): void => {
        const main = document.querySelector('#main')
        const oldRow = holding(main, oldIdea)
        const newRow = holding(main, newIdea)
        const scrim = document.querySelector('.shell-scrim')
        const shown = document.querySelector(sign)
        frames.push({
          t: performance.now(),
          stored: window.localStorage.getItem('mole-office.workspace'),
          covered: scrim instanceof HTMLElement && scrim.checkVisibility({ checkVisibilityCSS: true }),
          name: document.querySelector('.sbp-name')?.textContent ?? null,
          oldRows: oldRow !== null,
          oldOpacity: oldRow === null ? 1 : opacityOf(oldRow),
          newRows: newRow !== null,
          newOpacity: newRow === null ? 1 : opacityOf(newRow),
          sign: shown === null ? null : seen(shown),
          failed: [...document.querySelectorAll('#main .px-error')].some((one) => one.closest('.px-reread') === null),
        })
        if (!held.__stopFrames) requestAnimationFrame(take)
      }
      requestAnimationFrame(take)
    },
    { oldIdea: ALPHA.idea, newIdea: BETA.idea, sign: SIGN, atLeast: SIGN_AT_LEAST },
  )
  // A few frames of the page as it was, so the first frame after the switch has some before it.
  await expect.poll(() => page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames.length)).toBeGreaterThan(5)
}

/** The page is in sight under the new name: a frame stored BETA and the drawer's scrim was gone. */
async function inSightUnderTheNewName(page: Page): Promise<boolean> {
  return page.evaluate((beta) => (window as unknown as { __frames: Frame[] }).__frames.some((frame) => frame.stored === beta && !frame.covered), BETA.id)
}

async function stopTheFrames(page: Page): Promise<Frame[]> {
  return page.evaluate(() => {
    const held = window as unknown as { __frames: Frame[]; __stopFrames: boolean }
    held.__stopFrames = true
    return held.__frames
  })
}

/**
 * Open a page with ALPHA, hold BETA's records, switch to BETA as a person does, hold for HELD_MS after
 * the page is in sight, then release. Answers every frame and the page's time of the release.
 */
async function theSwitchSeen(watched: Watched, place: Place, look: Look, fail?: string): Promise<{ frames: Frame[]; releasedAt: number }> {
  const { page } = watched
  await openWithAlpha(watched, place, look)
  const held = await hold(page, fail)
  try {
    await startTheFrames(page)
    await switchAsAPersonDoes(page)
    await expect.poll(() => held.caught(), { timeout: 20_000, message: `${BETA.id}'s records were never asked for` }).toBeGreaterThan(0)
    await expect.poll(() => inSightUnderTheNewName(page), { timeout: 20_000, message: 'the page never came into sight under the new name' }).toBe(true)
    await page.waitForTimeout(HELD_MS)
    const releasedAt = await page.evaluate(() => performance.now())
    held.release()
    if (fail === undefined) await page.locator('#main').getByText(BETA.idea).first().waitFor({ timeout: 20_000 })
    else await expect.poll(() => held.answered(), { timeout: 20_000, message: `${BETA.id}'s held records were never refused` }).toBeGreaterThan(0)
    // NOTHING MORE ON THE PAGE IS WAITED FOR: what the page draws after the release is the question.
    await page.waitForTimeout(AFTER_MS)
    return { frames: await stopTheFrames(page), releasedAt }
  } finally {
    await held.done()
  }
}

/** Count the frames that `fault` names, and say how many of how many, with the first example. */
function counted(frames: Frame[], fault: (frame: Frame) => string | null, of: number, faults: string[]): void {
  const said = frames.map(fault).filter((one): one is string => one !== null)
  if (said.length > 0) faults.push(`${String(said.length)} of ${String(of)} frames: ${said[0] as string}`)
}

/**
 * WHAT A SWITCH'S FRAMES OWE A PERSON. A broken split of the frames throws rather than letting an
 * answer pass on nothing.
 */
function whatTheFramesShow(frames: Frame[], releasedAt: number, ending: 'the new rows' | 'the failure'): string[] {
  const faults: string[] = []
  const switched = frames.findIndex((frame) => frame.stored === BETA.id)
  if (switched === -1) throw new Error(`no frame was drawn after the switch to ${BETA.id}, in ${String(frames.length)} frames`)
  const before = frames.slice(0, switched)
  if (before.length < 3) throw new Error(`only ${String(before.length)} frames were taken before the switch`)
  if (!before.every((frame) => frame.stored === ALPHA.id && frame.oldRows)) throw new Error(`a frame before the switch did not show "${ALPHA.idea}" with ${ALPHA.id} stored`)
  if (frames.slice(switched).some((frame) => frame.stored !== BETA.id)) throw new Error('the stored project went back after the switch')
  counted(before, (frame) => (frame.sign === null ? null : `before the switch, the sign was drawn, saying "${frame.sign.text}"`), before.length, faults)

  const inSight = frames.findIndex((frame, at) => at >= switched && !frame.covered)
  if (inSight === -1) throw new Error('the drawer never closed after the switch')
  const held = frames.filter((frame, at) => at >= inSight && frame.t < releasedAt)
  if (held.length < FEWEST_HELD_FRAMES) throw new Error(`only ${String(held.length)} frames were taken while ${BETA.id}'s records were held`)
  const ended = frames.findIndex((frame, at) => at >= inSight && frame.t >= releasedAt && (ending === 'the new rows' ? frame.newRows : frame.failed))

  // FROM THE MOMENT THE PAGE IS IN SIGHT UNTIL THE NEW ROWS OR THE FAILURE: the old rows carry the sign.
  const kept = frames.slice(inSight, ended === -1 ? frames.length : ended)
  counted(held, (frame) => (frame.oldRows ? null : `while ${BETA.id}'s records were held, "${ALPHA.idea}" was not drawn, so no kept row was there to sign`), held.length, faults)
  const withOld = kept.filter((frame) => frame.oldRows)
  counted(withOld, (frame) => (frame.sign === null ? `"${ALPHA.idea}" was drawn under "${String(frame.name)}" with no sign` : null), withOld.length, faults)
  const signed = withOld.filter((frame) => frame.sign !== null)
  const kinds = new Map<string, string[]>()
  for (const frame of signed) {
    for (const one of new Set((frame.sign as SignSeen).unseen)) {
      const kind = one.slice(0, one.indexOf(':'))
      kinds.set(kind, [...(kinds.get(kind) ?? []), one])
    }
  }
  for (const [, said] of kinds) faults.push(`${String(said.length)} of ${String(signed.length)} frames: the sign could not be seen, because ${said[0] as string}`)
  counted(signed, (frame) => (frame.name !== BETA.title ? `the switcher showed "${String(frame.name)}", not "${BETA.title}"` : null), signed.length, faults)
  counted(signed, (frame) => (frame.name !== null && !(frame.sign as SignSeen).text.includes(frame.name) ? `the sign said "${(frame.sign as SignSeen).text}", which does not hold "${frame.name}"` : null), signed.length, faults)
  counted(withOld, (frame) => (frame.oldOpacity > DIMMED_AT_MOST ? `"${ALPHA.idea}" was drawn at opacity ${frame.oldOpacity.toFixed(2)}, not dimmed to ${String(DIMMED_AT_MOST)} or less` : null), withOld.length, faults)

  // WITHIN A SECOND OF THE RELEASE the sign and the dimming go, and they do not come back.
  if (ended === -1) {
    faults.push(`${ending} never came after the release`)
    return faults
  }
  const late = (frames[ended] as Frame).t - releasedAt
  if (late > GONE_WITHIN_MS) faults.push(`${ending} came ${late.toFixed(0)} ms after the release, not within ${String(GONE_WITHIN_MS)} ms`)
  const after = frames.slice(ended)
  counted(after, (frame) => (frame.sign === null ? null : `from ${ending} on, the sign was still drawn, saying "${frame.sign.text}"`), after.length, faults)
  counted(after, (frame) => (frame.oldRows ? `from ${ending} on, "${ALPHA.idea}" was still drawn` : null), after.length, faults)
  if (ending === 'the new rows') {
    counted(after, (frame) => (frame.newRows && frame.newOpacity < UNDIMMED_AT_LEAST ? `"${BETA.idea}" was drawn at opacity ${frame.newOpacity.toFixed(2)}` : null), after.length, faults)
  } else if (!(frames.at(-1) as Frame).failed) {
    faults.push('the last frame, after the refusal, did not say the failure in the page')
  }
  return faults
}

describe("the old project's rows say on the page that the new project is being read", () => {
  let n = 0
  {
    const look: Look = 'light'
    for (const place of [IDEAS, RECORDS]) {
      n += 1
      it(`${String(n)}. ${place.name} in the ${look} look, at ${WIDTHS.join(', ')} pixels: the kept rows are dimmed under a sign a person can see, until the new rows come`, async () => {
        const watched = await aBrowser(look)
        const faults: string[] = []
        try {
          for (const width of WIDTHS) {
            await watched.page.setViewportSize({ width, height: HEIGHT })
            const { frames, releasedAt } = await theSwitchSeen(watched, place, look)
            faults.push(...whatTheFramesShow(frames, releasedAt, 'the new rows').map((fault) => `${place.name} at ${String(width)} in ${look}: ${fault}`))
          }
          expect(watched.errors, 'the page threw').toEqual([])
          expect(faults).toEqual([])
        } finally {
          await watched.context.close()
        }
      }, 300_000)
    }
  }

  it(`${String(n + 1)}. a refused read after a switch takes the sign and the old rows away, and the page says the failure`, async () => {
    const watched = await aBrowser('light')
    try {
      const { frames, releasedAt } = await theSwitchSeen(watched, IDEAS, 'light', REFUSAL)
      const faults = whatTheFramesShow(frames, releasedAt, 'the failure')
      expect(watched.errors, 'the page threw').toEqual([])
      expect(faults).toEqual([])
    } finally {
      await watched.context.close()
    }
  }, 180_000)

  it.runIf(films !== null)(`${String(n + 2)}. a film of a switch held two seconds, at 1440 and at 390 pixels`, async () => {
    const folder = films as string
    for (const width of [1440, 390]) {
      const watched = await aBrowser('light', { width })
      const { page } = watched
      try {
        await openWithAlpha(watched, IDEAS, 'light')
        await putTheMadeUpLabelIn(page, LABEL, page.locator('.shell-main'), `the film at ${String(width)}`)
        const held = await hold(page)
        try {
          await startTheFrames(page)
          await switchAsAPersonDoes(page)
          await expect.poll(() => held.caught(), { timeout: 20_000, message: `${BETA.id}'s records were never asked for` }).toBeGreaterThan(0)
          await expect.poll(() => inSightUnderTheNewName(page), { timeout: 20_000, message: 'the page never came into sight under the new name' }).toBe(true)
          await page.waitForTimeout(2_000)
          held.release()
          await page.locator('#main').getByText(BETA.idea).first().waitFor({ timeout: 20_000 })
          await page.waitForTimeout(AFTER_MS)
          await stopTheFrames(page)
        } finally {
          await held.done()
        }
        expect(watched.errors, 'the page threw').toEqual([])
      } finally {
        const video = page.video()
        await watched.context.close()
        if (video !== null) {
          await video.saveAs(join(folder, `switch-held-two-seconds-${String(width)}.webm`))
          await video.delete()
        }
      }
    }
  }, 300_000)
})
