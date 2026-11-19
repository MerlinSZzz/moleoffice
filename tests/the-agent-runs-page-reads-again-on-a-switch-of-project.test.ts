// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE AGENT RUNS PAGE READS AGAIN WHEN THE READER SWITCHES PROJECT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 * The page reads the runs, the processes nobody claims and the session records, and the server cuts
 * all three to the project the request names. The page read once when it opened and again only on a
 * press, so after a switch it showed the previous project's runs under the new project's name until
 * somebody pressed "Check again". A switch is the reader's own act, so it reads again now, as every
 * other page that shows one project's rows does. Three cases, each in a browser of its own, against
 * one made-up office with two made-up projects, each holding one made-up run:
 *
 *   1. A SWITCH. While the new project's runs are held, the previous project's run stays while the
 *      shell's hidden re-read status says a read is out, and loading is never drawn. When the answer
 *      comes, the new project's run takes its place. What a person sees on the page during the hold
 *      is another test's question.
 *   2. A SWITCH WHOSE READ FAILS. The new project's held read is refused. The previous project's run
 *      goes, and the page says the failure in the place of the list. The refusal is a server fault, a
 *      500, so the error panel says the words a page says for a fault on the office's side. The
 *      server's own sentence is shown there only in developer mode.
 *   3. A "CHECK AGAIN" THAT FAILS, WITH NO SWITCH. The run on screen stays, the line under the stamp
 *      says the failure with the reading's own time, and no error panel takes the list's place.
 *
 * Every value compared is one this test made: the runs' titles, the projects' names and the words of
 * the refusal, which the line under the stamp says in case 3. The page's sentences are built from the
 * word keys with t().
 *
 * HOW A FRAME IS SEEN, and why a hold makes the frames many, is said in
 * tests/a-switch-of-project-reads-again-only-what-belongs-to-a-project.test.ts. This file samples
 * the same way.
 *
 * With TEST_SHOTS set, a fourth case keeps pictures of the page right after a switch, while the new
 * project's runs are held, and after they come, at 1440, 990, 660 and 390 pixels in both looks.
 * Below the shell's width the switch is made in the drawer, by tests/switch-the-project-at-any-width.ts.
 */

import { join } from 'node:path'
import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import type { WordKey } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { pathFor } from '../src/web/components/router.tsx'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { switchTheProject, waitForTheProjects } from './switch-the-project.ts'
import { switchTheProjectAtAnyWidth } from './switch-the-project-at-any-width.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { testShots, TEST_SHOTS } from './where-shots-go.ts'

const ALPHA = { id: 'alpha', title: 'Made-up Alpha', run: 'A made-up run of Alpha: the gripper trial' }
const BETA = { id: 'beta', title: 'Made-up Beta', run: 'A made-up run of Beta: the loading bay count' }
/** The words each held read is refused with. */
const REFUSAL = 'A made-up refusal of the runs, for a test.'
const VIEWPORT = { width: 1440, height: 900 }
const LABEL = 'Made-up office: two made-up projects, each with a made-up run, for a test'

const films = process.env[TEST_SHOTS] === undefined || process.env[TEST_SHOTS] === '' ? null : testShots('agent-runs-switch')

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

beforeAll(async () => {
  app = await liveApp({ name: 'agent-runs-switch', viewport: VIEWPORT })
  for (const project of [ALPHA, BETA]) {
    await write('/api/workspaces', { id: project.id, title: project.title }, asThePerson('default'))
    // A RUN SOMEBODY FILED BY HAND, paused, so the page draws it in a band that is open.
    await write('/api/records', { kind: 'session', title: project.run, data: { state: 'paused', runtime: 'claude-code' } }, asThePerson(project.id))
  }
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** What one painted frame showed. */
interface Frame {
  /** The project the browser has stored. */
  stored: string | null
  /** The project's name in the sidebar. */
  name: string | null
  /** The previous project's run is drawn in the page. */
  oldRows: boolean
  /** The new project's run is drawn in the page. */
  newRows: boolean
  /** The shell's hidden re-read status says a read is out. A person does not see it. */
  mark: boolean
  /** The page draws loading. */
  loading: boolean
  /** The words of a failure the page says in the page itself, not on the re-read strip; null when none. */
  failed: string | null
}

interface Watched {
  page: Page
  context: BrowserContext
  errors: string[]
  /**
   * Hold one project's answer to GET /api/sessions until `release`. With `fail`, the held read is
   * then refused with those words, in the door's own error shape and the server's headers.
   */
  hold: (project: string, fail?: string) => Promise<{ caught: () => number; answered: () => number; release: () => void }>
  releaseAll: () => void
}

/** A browser of its own, reading ALPHA, in the look `theme`. */
async function aBrowser(theme: 'light' | 'dark' = 'light'): Promise<Watched> {
  const context = await app.browser.newContext({ viewport: VIEWPORT })
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
    hold: async (project, fail) => {
      let release: () => void = () => undefined
      const released = new Promise<void>((resolve) => {
        release = resolve
      })
      releases.push(release)
      let caught = 0
      let answered = 0
      await page.route(
        (url) => url.pathname === '/api/sessions',
        async (route) => {
          if (route.request().method() !== 'GET' || route.request().headers()['x-mole-office-workspace'] !== project) return route.continue()
          caught += 1
          await released
          if (fail !== undefined) {
            // A REPLY WRITTEN HERE WOULD BE REFUSED by the browser's own guard, which reads the
            // server's headers, so the server is asked and only its status and body change.
            const response = await route.fetch()
            const headers = response.headers()
            delete headers['content-length']
            await route.fulfill({ status: 500, headers, body: JSON.stringify({ error: fail, reason: 'A made-up refusal for a test.' }) })
          } else {
            await route.continue()
          }
          answered += 1
        },
      )
      return { caught: () => caught, answered: () => answered, release }
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

/** Open the Agent runs page in this browser and wait until ALPHA's run is drawn and nothing is read again. */
async function openTheRuns(watched: Watched): Promise<void> {
  await watched.page.goto(`${app.site}/?lang=en#${pathFor('sessions')}`, { timeout: 60_000 })
  await waitForThePage(watched.page, 60_000)
  await waitForTheProjects(watched.page)
  await watched.page.locator('#main').getByText(ALPHA.run).first().waitFor({ timeout: 30_000 })
  await untilNothingIsReadAgain(watched.page)
}

/** Wait until the shell's hidden re-read status says nothing is being read again. */
async function untilNothingIsReadAgain(page: Page): Promise<void> {
  await expect.poll(() => page.locator('.px-reread .px-reread-what').count(), { timeout: 20_000, message: 'the hidden re-read status never went' }).toBe(0)
}

/** Start taking one sample per painted frame. */
async function startTheFrames(page: Page): Promise<void> {
  await page.evaluate(
    ({ oldRun, newRun }: { oldRun: string; newRun: string }) => {
      const frames: Frame[] = []
      const held = window as unknown as { __frames: Frame[]; __stopFrames: boolean }
      held.__frames = frames
      held.__stopFrames = false
      const take = (): void => {
        const main = document.querySelector('#main')
        const text = main instanceof HTMLElement ? main.innerText : ''
        const failure = [...document.querySelectorAll('#main .px-error')].find((one) => one.closest('.px-reread') === null)
        frames.push({
          stored: window.localStorage.getItem('mole-office.workspace'),
          name: document.querySelector('.sbp-name')?.textContent ?? null,
          oldRows: text.includes(oldRun),
          newRows: text.includes(newRun),
          mark: document.querySelector('.px-reread .px-reread-what') !== null,
          loading: document.querySelector('#main .px-loading') !== null,
          failed: failure instanceof HTMLElement ? failure.innerText : null,
        })
        if (!held.__stopFrames) requestAnimationFrame(take)
      }
      requestAnimationFrame(take)
    },
    { oldRun: ALPHA.run, newRun: BETA.run },
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

/**
 * The frames of the switch while BETA's runs are held, and after. The previous run stays while the
 * shell's hidden re-read status says a read is out, until the new one takes its place; loading is
 * never drawn over it. When BETA's read is refused instead, the previous run is gone from the last
 * frame, and its error panel, outside the strip, says the words for a fault on the office's side.
 * What a person sees on the page during the hold is another test's question.
 */
function theFramesOfTheSwitch(frames: Frame[], atRelease: number, ending: 'the new run' | 'the failure'): string[] {
  const faults: string[] = []
  const firstAfter = frames.findIndex((frame) => frame.stored === BETA.id)
  if (firstAfter === -1) throw new Error(`no frame was drawn after the switch to ${BETA.id}, in ${String(frames.length)} frames`)
  const before = frames.slice(0, firstAfter)
  if (before.length < 3) throw new Error(`only ${String(before.length)} frames were taken before the switch`)
  if (!before.every((frame) => frame.oldRows && frame.name === ALPHA.title)) throw new Error(`a frame before the switch did not show "${ALPHA.run}" under "${ALPHA.title}"`)
  const after = frames.slice(firstAfter)
  if (after.some((frame) => frame.stored !== BETA.id)) throw new Error('the stored project went back after the switch')
  const misnamed = after.filter((frame) => frame.name !== BETA.title).length
  if (misnamed > 0) faults.push(`${String(misnamed)} of ${String(after.length)} frames after the switch did not name "${BETA.title}"`)
  const unmarked = after.filter((frame) => frame.oldRows && !frame.mark).length
  if (unmarked > 0) faults.push(`${String(unmarked)} frames after the switch showed "${ALPHA.run}" under "${BETA.title}" with no hidden re-read status`)
  const held = frames.slice(firstAfter, atRelease)
  if (held.length < 20) throw new Error(`only ${String(held.length)} frames were taken while ${BETA.id}'s runs were held`)
  const dropped = held.filter((frame) => !frame.oldRows).length
  if (dropped > 0) faults.push(`${String(dropped)} of ${String(held.length)} frames while ${BETA.id}'s runs were held did not keep "${ALPHA.run}"`)
  const loading = after.filter((frame) => frame.loading).length
  if (loading > 0) faults.push(`${String(loading)} frames after the switch drew loading in the page`)
  const last = frames.at(-1) as Frame
  if (ending === 'the new run') {
    if (!last.newRows || last.oldRows) faults.push(`the last frame showed ${last.newRows ? '' : 'no '}"${BETA.run}" and ${last.oldRows ? '' : 'no '}"${ALPHA.run}"`)
  } else {
    if (last.oldRows) faults.push(`the last frame, after ${BETA.id}'s runs were refused, still showed "${ALPHA.run}" under "${BETA.title}"`)
    const said = oneLine(t('error.brokenSays'))
    if (last.failed === null || !oneLine(last.failed).includes(said)) faults.push(`the last frame, after ${BETA.id}'s runs were refused, did not say "${said}" in an error panel of the page`)
  }
  return faults
}

/**
 * A sentence of the page as a pattern. Each value given as null is a part the test cannot know, such
 * as a time, and is caught under its own name; every other part is the word key's own words.
 */
function theSentence(key: WordKey, values: Record<string, string | null>): RegExp {
  const marks: Record<string, string> = {}
  for (const [name, value] of Object.entries(values)) marks[name] = value ?? `\u0001${name}\u0001`
  let pattern = t(key, marks).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  for (const [name, value] of Object.entries(values)) if (value === null) pattern = pattern.replace(`\u0001${name}\u0001`, `(?<${name}>.+?)`)
  return new RegExp(`^${pattern}$`)
}

const oneLine = (words: string): string => words.replace(/\s+/g, ' ').trim()

describe('the Agent runs page reads again when the reader switches project', () => {
  it('1. a switch keeps the previous project\'s run, while the hidden re-read status says a read is out, until the new project\'s run comes', async () => {
    const watched = await aBrowser()
    try {
      const { page } = watched
      await openTheRuns(watched)
      await page.mouse.move(VIEWPORT.width - 2, VIEWPORT.height - 2)
      const runs = await watched.hold(BETA.id)
      await startTheFrames(page)

      await switchTheProject(page, BETA.id)
      await expect.poll(() => runs.caught(), { timeout: 20_000, message: `${BETA.id}'s runs were never asked for` }).toBeGreaterThan(0)
      await page.waitForTimeout(1_500)
      const atRelease = await framesSoFar(page)
      runs.release()
      await page.locator('#main').getByText(BETA.run).first().waitFor({ timeout: 20_000 })
      await untilNothingIsReadAgain(page)
      await page.waitForTimeout(500)
      const frames = await stopTheFrames(page)

      expect(theFramesOfTheSwitch(frames, atRelease, 'the new run')).toEqual([])
      expect(watched.errors, 'the page threw').toEqual([])
    } finally {
      await closeThe(watched)
    }
  }, 180_000)

  it('2. a switch whose read fails says the failure, and the previous project\'s run goes', async () => {
    const watched = await aBrowser()
    try {
      const { page } = watched
      await openTheRuns(watched)
      await page.mouse.move(VIEWPORT.width - 2, VIEWPORT.height - 2)
      const runs = await watched.hold(BETA.id, REFUSAL)
      await startTheFrames(page)

      await switchTheProject(page, BETA.id)
      await expect.poll(() => runs.caught(), { timeout: 20_000, message: `${BETA.id}'s runs were never asked for` }).toBeGreaterThan(0)
      await page.waitForTimeout(1_500)
      const atRelease = await framesSoFar(page)
      runs.release()
      await expect.poll(() => runs.answered(), { timeout: 20_000, message: `${BETA.id}'s held runs were never refused` }).toBeGreaterThan(0)
      // NOTHING ON THE PAGE IS WAITED FOR HERE: what the page draws after the refusal is the question.
      await page.waitForTimeout(1_500)
      const frames = await stopTheFrames(page)

      expect(theFramesOfTheSwitch(frames, atRelease, 'the failure')).toEqual([])
      expect(watched.errors, 'the page threw').toEqual([])
    } finally {
      await closeThe(watched)
    }
  }, 180_000)

  it('3. a "Check again" that fails keeps the run on screen and says the failure with the reading\'s time', async () => {
    const watched = await aBrowser()
    try {
      const { page } = watched
      await openTheRuns(watched)
      const stamp = page.locator('#main .sx-read-at').first()
      const checked = theSentence('g6a.sessions.checked', { at: null }).exec(oneLine(await stamp.innerText()))
      if (checked === null) throw new Error(`the stamp did not read as the sentence of g6a.sessions.checked: "${await stamp.innerText()}"`)
      const takenAt = checked.groups?.['at'] as string
      const runs = await watched.hold(ALPHA.id, REFUSAL)
      await page.locator('#main .sx-read-act .px-btn').first().click()
      await expect.poll(() => runs.caught(), { timeout: 20_000, message: `the press never asked for ${ALPHA.id}'s runs` }).toBeGreaterThan(0)
      runs.release()
      await expect.poll(() => runs.answered(), { timeout: 20_000, message: `${ALPHA.id}'s held runs were never refused` }).toBeGreaterThan(0)
      const failedLine = page.locator('#main .sx-read-failed').first()
      await failedLine.waitFor({ timeout: 20_000 })

      const said = theSentence('g6a.sessions.unreadNewer', { failedAt: null, message: REFUSAL, at: takenAt }).exec(oneLine(await failedLine.innerText()))
      expect(said, `the failure line "${oneLine(await failedLine.innerText())}" is not the sentence of g6a.sessions.unreadNewer for "${REFUSAL}" and the reading of ${takenAt}`).not.toBeNull()
      expect(oneLine(await stamp.innerText()), 'the stamp still says the time of the reading on screen').toBe(checked[0])
      expect(await page.locator('#main').innerText(), `"${ALPHA.run}" went from the page when a read of the same project failed`).toContain(ALPHA.run)
      const panels = await page.locator('#main .px-error').evaluateAll((all) => all.filter((one) => one.closest('.px-reread') === null).length)
      expect(panels, 'an error panel took the place of the list').toBe(0)
      expect(watched.errors, 'the page threw').toEqual([])
    } finally {
      await closeThe(watched)
    }
  }, 180_000)

  it.runIf(films !== null)('4. pictures of the page right after a switch and after the new reading, at four widths in both looks', async () => {
    const folder = films as string
    for (const theme of ['light', 'dark'] as const) {
      for (const width of [1440, 990, 660, 390]) {
        const watched = await aBrowser(theme)
        try {
          const { page } = watched
          await page.setViewportSize({ width, height: VIEWPORT.height })
          await openTheRuns(watched)
          expect(await page.evaluate(() => document.documentElement.dataset['theme']), 'the look the browser stored').toBe(theme)
          const runs = await watched.hold(BETA.id)
          await switchTheProjectAtAnyWidth(page, BETA.id)
          await expect.poll(() => runs.caught(), { timeout: 20_000, message: `${BETA.id}'s runs were never asked for` }).toBeGreaterThan(0)
          await page.locator('.px-reread .px-reread-what').first().waitFor({ state: 'attached', timeout: 20_000 })
          await putTheMadeUpLabelIn(page, LABEL, page.locator('#main .sx-read'), `the runs after a switch at ${String(width)}`)
          await page.mouse.move(-1, -1)
          await page.screenshot({ path: join(folder, `runs-after-a-switch-${String(width)}-${theme}.png`) })
          runs.release()
          await page.locator('#main').getByText(BETA.run).first().waitFor({ timeout: 20_000 })
          await untilNothingIsReadAgain(page)
          await putTheMadeUpLabelIn(page, LABEL, page.locator('#main .sx-read'), `the runs after the new reading at ${String(width)}`)
          await page.mouse.move(-1, -1)
          await page.screenshot({ path: join(folder, `runs-after-the-new-reading-${String(width)}-${theme}.png`) })
        } finally {
          await closeThe(watched)
        }
      }
    }
  }, 590_000)
})
