// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LEADING ROW KEEPS ITS OFFERS THROUGH A SWITCH OF PROJECT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 * The offers an agent sends the reader are read from the message centre, which belongs to no project:
 * the same offers are waiting whichever project the reader is in. So are the words that brought the
 * reader to a page. Only the words that name a project depend on the project on screen, and those are
 * worked out from it each time they are drawn. The row used to empty itself on every switch of
 * project, as if all of it were the previous project's. Two cases, each in a browser of its own,
 * against one made-up office with two made-up projects and a made-up agent that sends the reader a
 * lead to a made-up report in the second project:
 *
 *   1. A SWITCH WITH AN OFFER ON SCREEN. While the second project's read of the offers is held, the
 *      offer stays on screen in every frame. In the first project it says the report is in the second
 *      project; from the first frame drawn in the second project it names the report alone.
 *   2. A LEAD TAKEN INTO THE OTHER PROJECT. The press moves the page and the project together, and the
 *      words that brought the reader there, and who sent them, are drawn in every frame after the move.
 *
 * Every value compared is one this test made: the agent's name, the report's title, the projects'
 * names and the words of the lead. The row's sentences are built from them by the LEADING functions.
 *
 * HOW A FRAME IS SEEN, and why a hold makes the frames many, is said in
 * tests/a-switch-of-project-reads-again-only-what-belongs-to-a-project.test.ts. This file samples
 * the same way.
 *
 * With TEST_SHOTS set, a third case keeps pictures of Home's offer right after a switch, while the
 * second project's offers are held, and after they come, at 1440, 990, 660 and 390 pixels in both
 * looks. Below the shell's width the switch is made in the drawer, by
 * tests/switch-the-project-at-any-width.ts. The offer's box is fixed at the window's corner and is
 * not in the page's flow, so the made-up label stands above the page's first block instead.
 */

import { join } from 'node:path'
import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LEADING } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { switchTheProject, waitForTheProjects } from './switch-the-project.ts'
import { switchTheProjectAtAnyWidth } from './switch-the-project-at-any-width.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { testShots, TEST_SHOTS } from './where-shots-go.ts'

const ALPHA = { id: 'alpha', title: 'Made-up Alpha' }
const BETA = { id: 'beta', title: 'Made-up Beta' }
const GUIDE = 'made-up-lead-guide'
const GUIDE_NAME = 'Made-up Guide'
const REPORT = 'A made-up report of Beta'
const VIEWPORT = { width: 1440, height: 900 }
const LABEL = 'Made-up office: two made-up projects and a made-up agent, for a test'

const films = process.env[TEST_SHOTS] === undefined || process.env[TEST_SHOTS] === '' ? null : testShots('leading-row-switch')

let app: LiveApp
let person: Record<string, string> = {}
let guideKey = ''
let reportId = ''
let leads = 0

/** The person's own headers in one project. Built when asked, because the person is read after the build. */
function asThePerson(project: string): Record<string, string> {
  return { 'content-type': 'application/json', 'x-mole-office-workspace': project, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, ...person }
}

function asTheGuide(project: string): Record<string, string> {
  return { ...asThePerson(project), 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': GUIDE, 'x-mole-office-key': guideKey }
}

async function call(path: string, body: unknown, headers: Record<string, string>): Promise<Record<string, any>> {
  const answer = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await answer.text()
  if (!answer.ok) throw new Error(`POST ${path} answered ${String(answer.status)}: ${text}`)
  return text === '' ? {} : (JSON.parse(text) as Record<string, any>)
}

/** A new lead from the guide to the report in BETA, with words of its own. Its message id. */
async function aLead(): Promise<{ id: string; words: string }> {
  leads += 1
  const words = `Made-up words of lead ${String(leads)}: Beta's report is here.`
  const sent = await call(
    '/api/records',
    { kind: 'message', title: `A made-up lead to Beta's report, number ${String(leads)}`, data: { body: words, to: [{ kind: 'person', id: THE_PERSON }], lead: { target: { kind: 'record', recordId: reportId, workspaceId: BETA.id } } } },
    asTheGuide(BETA.id),
  )
  return { id: String(sent['record'].id), words }
}

/** Mark a lead read whatever happened, so no later browser in this office is offered it. */
async function markRead(lead: string): Promise<void> {
  if (lead !== '') await fetch(`${app.api}/api/messages/${lead}/mark`, { method: 'POST', headers: asThePerson(ALPHA.id), body: JSON.stringify({ mark: 'seen' }) })
}

beforeAll(async () => {
  app = await liveApp({ name: 'leading-row-switch', viewport: VIEWPORT })
  person = thePersonsKeyHeader(join(app.dir, 'keys.json'))
  for (const project of [ALPHA, BETA]) await call('/api/workspaces', { id: project.id, title: project.title }, asThePerson('default'))
  const started = await call('/api/agents/started', { handle: GUIDE, name: GUIDE_NAME, role: 'worker', runtime: 'claude-code' }, asThePerson('default'))
  guideKey = String(started['whatToGiveIt']?.key)
  const blocks = [{ id: 'b-1', type: 'text', text: 'Made-up words of a made-up report.' }]
  reportId = String((await call('/api/records', { kind: 'report', title: REPORT, data: { blocks } }, asThePerson(BETA.id)))['record'].id)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** What one painted frame showed. */
interface Frame {
  /** The project the browser has stored. */
  stored: string | null
  /** The project's name in the sidebar. */
  name: string | null
  /** The sentence of the offer under test, with the wrapping taken out; null when the offer is not drawn. */
  offer: string | null
  /** The sentence saying who brought the reader here; null when it is not drawn. */
  brought: string | null
  /** The words that brought the reader here; null when they are not drawn. */
  said: string | null
}

interface Watched {
  page: Page
  context: BrowserContext
  errors: string[]
  /** Hold BETA's read of the offers until `release`. */
  hold: () => Promise<{ caught: () => number; release: () => void }>
  releaseAll: () => void
}

/** A browser of its own, reading ALPHA, in the look `theme`. */
async function aBrowser(theme: 'light' | 'dark' = 'light', viewport = VIEWPORT): Promise<Watched> {
  const context = await app.browser.newContext({ viewport })
  await context.addInitScript(
    ({ project, theme }: { project: string; theme: string }) => {
      // ONLY A NEW BROWSER IS SEEDED: a later load must keep the project the switch chose.
      if (window.localStorage.getItem('mole-office.workspace') === null) {
        window.localStorage.setItem('mole-office.workspace', project)
        window.localStorage.setItem('mole-office.preset.theme', theme)
        window.localStorage.setItem('mole-office.chat.open', 'no')
      }
    },
    { project: ALPHA.id, theme },
  )
  const page = await context.newPage()
  const errors: string[] = []
  const releases: (() => void)[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  return {
    page,
    context,
    errors,
    hold: async () => {
      let release: () => void = () => undefined
      const released = new Promise<void>((resolve) => {
        release = resolve
      })
      releases.push(release)
      let caught = 0
      await page.route(
        (url) => url.pathname === '/api/messages' && url.searchParams.get('leads') === '1',
        async (route) => {
          if (route.request().method() !== 'GET' || route.request().headers()['x-mole-office-workspace'] !== BETA.id) return route.continue()
          caught += 1
          await released
          await route.continue()
        },
      )
      return { caught: () => caught, release }
    },
    releaseAll: () => {
      for (const release of releases) release()
    },
  }
}

async function closeThe(watched: Watched): Promise<void> {
  watched.releaseAll()
  await watched.context.close()
}

const cardOf = (id: string): string => `.px-lead-offer[data-lead-message="${id}"]`
const oneLine = (words: string): string => words.replace(/\s+/g, ' ').trim()

/** The offer's sentence in ALPHA, which names the project the report is in. */
const inAlpha = (): string => LEADING.offer(GUIDE_NAME, LEADING.inAnotherProject(REPORT, BETA.title))
/** The offer's sentence in BETA, which names the report alone. */
const inBeta = (): string => LEADING.offer(GUIDE_NAME, REPORT)

/** Open Home in this browser and wait until the offer of `lead` is drawn with ALPHA's sentence. */
async function openHome(watched: Watched, lead: string): Promise<void> {
  await watched.page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000 })
  await waitForThePage(watched.page, 60_000)
  await waitForTheProjects(watched.page)
  await expect
    .poll(async () => oneLine((await watched.page.locator(`${cardOf(lead)} .px-lead-words`).first().textContent({ timeout: 1_000 }).catch(() => '')) ?? ''), { timeout: 30_000, message: 'the offer was never drawn with the first project\'s sentence' })
    .toBe(inAlpha())
}

/** Start taking one sample per painted frame. */
async function startTheFrames(page: Page, lead: string): Promise<void> {
  await page.evaluate(
    ({ card }: { card: string }) => {
      const frames: Frame[] = []
      const held = window as unknown as { __frames: Frame[]; __stopFrames: boolean }
      held.__frames = frames
      held.__stopFrames = false
      const words = (selector: string): string | null => {
        const one = document.querySelector(selector)
        return one === null ? null : (one.textContent ?? '').replace(/\s+/g, ' ').trim()
      }
      const take = (): void => {
        frames.push({
          stored: window.localStorage.getItem('mole-office.workspace'),
          name: document.querySelector('.sbp-name')?.textContent ?? null,
          offer: words(`${card} .px-lead-words`),
          brought: words('.px-lead-brought .px-lead-words'),
          said: words('.px-lead-brought .px-lead-said'),
        })
        if (!held.__stopFrames) requestAnimationFrame(take)
      }
      requestAnimationFrame(take)
    },
    { card: cardOf(lead) },
  )
  // A few frames of the page as it was, so the first frame after the switch has one before it.
  await expect.poll(() => page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames.length)).toBeGreaterThan(5)
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

/** The frames split at the first one drawn after the project changed to BETA. */
function splitAtTheSwitch(frames: Frame[], faults: string[]): { before: Frame[]; after: Frame[] } {
  const firstAfter = frames.findIndex((frame) => frame.stored === BETA.id)
  if (firstAfter === -1) throw new Error(`no frame was drawn after the switch to ${BETA.id}, in ${String(frames.length)} frames`)
  const before = frames.slice(0, firstAfter)
  const after = frames.slice(firstAfter)
  if (before.length < 3) throw new Error(`only ${String(before.length)} frames were taken before the switch`)
  if (after.some((frame) => frame.stored !== BETA.id)) throw new Error('the stored project went back after the switch')
  const misnamed = after.filter((frame) => frame.name !== BETA.title).length
  if (misnamed > 0) faults.push(`${String(misnamed)} of ${String(after.length)} frames after the switch did not name "${BETA.title}"`)
  return { before, after }
}

describe('the Leading row keeps its offers through a switch of project', () => {
  it('1. an offer stays on screen through a switch, and names the project only while the reader is in the other one', async () => {
    const watched = await aBrowser()
    let lead = ''
    try {
      const { page } = watched
      lead = (await aLead()).id
      await openHome(watched, lead)
      await page.mouse.move(VIEWPORT.width - 2, VIEWPORT.height - 2)
      const offers = await watched.hold()
      await startTheFrames(page, lead)

      await switchTheProject(page, BETA.id)
      await expect.poll(() => offers.caught(), { timeout: 20_000, message: `the offers were never read again in ${BETA.id}` }).toBeGreaterThan(0)
      await page.waitForTimeout(1_500)
      const atRelease = await framesSoFar(page)
      offers.release()
      await page.waitForTimeout(1_500)
      const frames = await stopTheFrames(page)

      const faults: string[] = []
      const { before, after } = splitAtTheSwitch(frames, faults)
      if (!before.every((frame) => frame.offer === inAlpha())) throw new Error(`a frame before the switch did not draw the offer as "${inAlpha()}"`)
      if (frames.length - atRelease < 20) throw new Error(`only ${String(frames.length - atRelease)} frames were taken after the held read was let through`)
      const gone = after.filter((frame) => frame.offer === null).length
      if (gone > 0) faults.push(`${String(gone)} of ${String(after.length)} frames after the switch did not draw the offer`)
      const wrong = after.filter((frame) => frame.offer !== null && frame.offer !== inBeta()).length
      if (wrong > 0) faults.push(`${String(wrong)} of ${String(after.length)} frames after the switch drew the offer other than "${inBeta()}"`)
      expect(faults).toEqual([])
      expect(watched.errors, 'the page threw').toEqual([])
    } finally {
      await closeThe(watched)
      await markRead(lead)
    }
  }, 180_000)

  it('2. a lead taken into the other project keeps the words that brought the reader there', async () => {
    const watched = await aBrowser()
    let lead = ''
    try {
      const { page } = watched
      const sent = await aLead()
      lead = sent.id
      await openHome(watched, lead)
      await startTheFrames(page, lead)

      await page.locator(`${cardOf(lead)} .px-lead-go`).click()
      await expect.poll(() => page.evaluate(() => window.localStorage.getItem('mole-office.workspace')), { timeout: 30_000, message: `the press never moved the reader to ${BETA.id}` }).toBe(BETA.id)
      await expect.poll(() => page.evaluate(() => window.location.hash), { timeout: 30_000, message: 'the press never opened the report' }).toContain(reportId)
      await page.waitForTimeout(1_500)
      const frames = await stopTheFrames(page)

      const faults: string[] = []
      const { after } = splitAtTheSwitch(frames, faults)
      if (after.length < 20) throw new Error(`only ${String(after.length)} frames were taken after the move`)
      const unsaid = after.filter((frame) => frame.brought !== LEADING.broughtYouHere(GUIDE_NAME) || frame.said !== sent.words).length
      if (unsaid > 0) faults.push(`${String(unsaid)} of ${String(after.length)} frames after the move did not draw "${LEADING.broughtYouHere(GUIDE_NAME)}" with "${sent.words}"`)
      expect(faults).toEqual([])
      expect(watched.errors, 'the page threw').toEqual([])
    } finally {
      await closeThe(watched)
      await markRead(lead)
    }
  }, 180_000)

  it.runIf(films !== null)('3. pictures of the offer right after a switch and after the new reading, at four widths in both looks', async () => {
    const folder = films as string
    for (const theme of ['light', 'dark'] as const) {
      for (const width of [1440, 990, 660, 390]) {
        const watched = await aBrowser(theme, { width, height: VIEWPORT.height })
        let lead = ''
        try {
          const { page } = watched
          lead = (await aLead()).id
          await openHome(watched, lead)
          expect(await page.evaluate(() => document.documentElement.dataset['theme']), 'the look the browser stored').toBe(theme)
          const offers = await watched.hold()
          await switchTheProjectAtAnyWidth(page, BETA.id)
          await expect.poll(() => offers.caught(), { timeout: 20_000, message: `the offers were never read again in ${BETA.id}` }).toBeGreaterThan(0)
          await expect.poll(() => page.locator(`${cardOf(lead)} .px-lead-words`).first().textContent().then((words) => oneLine(words ?? '')), { timeout: 20_000 }).toBe(inBeta())
          await putTheMadeUpLabelIn(page, LABEL, page.locator('#main > *:not([data-made-up-label]):not(style)').first(), `the offer after a switch at ${String(width)}`)
          await page.mouse.move(-1, -1)
          await page.screenshot({ path: join(folder, `offer-after-a-switch-${String(width)}-${theme}.png`) })
          offers.release()
          await page.waitForTimeout(1_500)
          await page.locator(cardOf(lead)).first().waitFor({ timeout: 20_000 })
          await putTheMadeUpLabelIn(page, LABEL, page.locator('#main > *:not([data-made-up-label]):not(style)').first(), `the offer after the new reading at ${String(width)}`)
          await page.mouse.move(-1, -1)
          await page.screenshot({ path: join(folder, `offer-after-the-new-reading-${String(width)}-${theme}.png`) })
        } finally {
          await closeThe(watched)
          await markRead(lead)
        }
      }
    }
  }, 590_000)
})
