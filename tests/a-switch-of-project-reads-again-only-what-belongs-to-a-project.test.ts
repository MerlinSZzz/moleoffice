// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SWITCH OF PROJECT READS AGAIN ONLY WHAT BELONGS TO A PROJECT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 * Until wave 13y round 170 every reading in the app was thrown away when the project changed, and the
 * page drew loading until it was read again. That was right for a project's own rows and wrong for
 * everything else: Settings drew loading in every section, asked the office again for answers that are
 * the same in every project, closed the sections the reader had opened, and lost its place. Now a
 * reading that belongs to a project is read again, and a reading that does not is left alone. Six
 * cases, each in a browser of its own against one made-up office with two made-up projects:
 *
 *   1. SETTINGS, OFFICE SECTIONS ONLY. The tools category: no frame after the switch draws loading in
 *      the page, no door those sections asked on the way in is asked again, the page stays where it
 *      was scrolled to, and the office map's fold stays open.
 *   2. SETTINGS, A SECTION THAT DRAWS THE PROJECT. The visitor ceiling is read from the role cards,
 *      which belong to a project, so it is read again. While the new project's answer is held, the
 *      section keeps what it showed and the page carries the re-read mark in every frame. It never
 *      draws loading, and the mark goes when the answer comes.
 *   3. A PROJECT PAGE, SWITCHED BY THE SWITCHER. Ideas: while the new project's ideas are held, the
 *      previous project's ideas stay, marked as being read again, and then the new ones take their
 *      place.
 *   4. THE SAME PAGE, SWITCHED BY FOLLOWING AN AGENT (criterion M60). The move starts outside any
 *      press, when an offer the browser follows is read. The same frames are asked of it.
 *   5. A FAILED READ AFTER A SWITCH. Ideas again, and the new project's held read is answered with a
 *      refusal. The previous project's ideas stay, marked, only while the read is out. When it fails,
 *      the page says the failure as a failed first read does, and the previous project's ideas go:
 *      they are not the new project's, and no answer is coming to replace them.
 *   6. THE NEW PROJECT'S OWN KEPT ANSWER. The visitor ceiling keeps its answer in the page cache
 *      (src/web/lib/pagecache.ts), which is kept per project. After the browser has read the new
 *      project once, a switch back to it draws that project's kept answer from the first frame,
 *      marked as being read again, and never the previous project's.
 *
 * In every case the first frame drawn after the project changed already carries the new project's
 * name, and no frame shows the previous project's rows under the new name without the re-read mark.
 *
 * ---------------------------------------------------------------------------------------
 * HOW A FRAME IS SEEN
 * ---------------------------------------------------------------------------------------
 *
 * ONE SAMPLE PER PAINTED FRAME, TAKEN IN requestAnimationFrame, which runs just before the browser
 * paints. A MutationObserver is not used: it also runs between two of React's commits inside one task,
 * and could report a page that held the new name and not yet the mark, which no reader ever saw.
 *
 * WHICH PROJECT A FRAME BELONGS TO is the project the browser has stored, read in the same sample.
 * The store is written before any part of the page hears of the change, so a frame that says the new
 * project is a frame drawn after the change.
 *
 * THE HOLD MAKES THE SECOND HALF CERTAIN. The new project's answer to the reading under test is held in
 * the browser until the test lets it through, so the frames between the switch and the answer are
 * many, rather than one nobody can count on.
 *
 * tests/workspace-switch.test.ts holds criterion M61, that a switch reloads nothing.
 *
 * With TEST_SHOTS set, each case keeps a film of its switch at 1440 pixels, labelled as made up, and a
 * seventh case keeps pictures of Ideas while the new project's ideas are held, at 1440, 990, 660 and
 * 390 pixels in both looks. Without TEST_SHOTS the seventh case does not run.
 */

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserContext, Page, Route } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { switchTheProject, waitForTheProjects } from './switch-the-project.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { testShots, TEST_SHOTS } from './where-shots-go.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { FOLLOWING_KEY } from '../src/web/lib/following.ts'
import { SETTINGS_CATEGORY_KEY } from '../src/web/lib/settings-category.ts'

const ALPHA = { id: 'alpha', title: 'Made-up Alpha', idea: 'A made-up idea of Alpha: a quieter gripper' }
const BETA = { id: 'beta', title: 'Made-up Beta', idea: 'A made-up idea of Beta: a second loading bay' }
const GUIDE = 'made-up-guide'
/** The words the held read of case 5 is refused with. */
const REFUSAL = 'A made-up refusal of Beta\'s ideas'
/** The setting name case 6 writes into Beta's first answer, so Beta's kept answer can be told from Alpha's. */
const KEPT_FOR_BETA = 'MADE_UP_SETTING_KEPT_FOR_BETA'
const VIEWPORT = { width: 1440, height: 900 }

/** The doors the tools category's sections ask on the way in. Each reads no project. */
const TOOLS_OFFICE_DOORS = [
  '/api/office/mail-tool',
  '/api/settings/provider-keys',
  '/api/office/sandbox-memory-cap',
  '/api/office/gpu-watcher',
  '/api/plugins',
  '/api/office/scene-settings',
  '/api/office/quick-inputs',
  '/api/terminals',
]
/** The doors the machines category's office sections ask on the way in. */
const MACHINES_OFFICE_DOORS = ['/api/office/trusted-machines', '/api/office/header-only-calls', '/api/office/address-for-browsers', '/api/access']

const PLUGINS = aTestDatabaseFolder('switch-reads-only-the-project')
const PLUGINS_BEFORE = process.env['MOLE_OFFICE_PLUGINS']
const films = process.env[TEST_SHOTS] === undefined || process.env[TEST_SHOTS] === '' ? null : testShots('switch-reads-only-the-project')

let app: LiveApp
let guideId = ''

/** The person's own headers in one project. Built when asked, because the person is read after the build. */
function asThePerson(project: string): Record<string, string> {
  return { 'content-type': 'application/json', 'x-mole-office-workspace': project, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
}

async function write(path: string, body: unknown, headers: Record<string, string>): Promise<unknown> {
  const answer = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await answer.text()
  expect(answer.status, `POST ${path}: ${text}`).toBe(201)
  return JSON.parse(text) as unknown
}

beforeAll(async () => {
  // THE OFFICE MAP'S MANIFEST, so the tools category has a fold to open (its row folds open to its one
  // setting). Its page is a made-up stand-in; nothing here opens it.
  const folder = join(PLUGINS, 'plugins', 'office-map')
  mkdirSync(join(folder, 'dist'), { recursive: true })
  copyFileSync(join(process.cwd(), 'plugins', 'office-map', 'plugin.json'), join(folder, 'plugin.json'))
  writeFileSync(join(folder, 'dist', 'main.html'), '<!doctype html><title>Made-up stand-in</title><p>A made-up stand-in page for a test.</p>')
  process.env['MOLE_OFFICE_PLUGINS'] = join(PLUGINS, 'plugins')
  app = await liveApp({ name: 'switch-reads-only-the-project', viewport: VIEWPORT })
  for (const project of [ALPHA, BETA]) {
    await write('/api/workspaces', { id: project.id, title: project.title }, asThePerson('default'))
    await write('/api/records', { kind: 'idea', title: project.idea, data: {} }, asThePerson(project.id))
  }
  await write('/api/records', { kind: 'agent', title: 'A made-up guide', data: { handle: GUIDE, runtime: 'claude-code', state: 'active' } }, asThePerson('default'))
  const listed = (await (await fetch(`${app.api}/api/participants`, { headers: asThePerson('default') })).json()) as { agents: { id: string; handle: string }[] }
  guideId = listed.agents.find((one) => one.handle === GUIDE)?.id ?? ''
  expect(guideId, 'the made-up guide is listed').not.toBe('')
}, 240_000)

afterAll(async () => {
  await app?.stop()
  if (PLUGINS_BEFORE === undefined) delete process.env['MOLE_OFFICE_PLUGINS']
  else process.env['MOLE_OFFICE_PLUGINS'] = PLUGINS_BEFORE
  removeThisTestFolder(PLUGINS)
}, 60_000)

/** What one painted frame showed. */
interface Frame {
  /** The project the browser has stored. */
  stored: string | null
  /** The project's name in the sidebar. */
  name: string | null
  /** The previous project's idea is in the page. */
  oldRows: boolean
  /** The new project's idea is in the page. */
  newRows: boolean
  /** The page says a reading is being read again. */
  mark: boolean
  /** The page draws loading. */
  loading: boolean
  /** The page says a read failed, in the page itself rather than on the re-read strip. */
  failed: boolean
  /** Whether the office map's fold is open; null when it is not drawn. */
  fold: boolean | null
  /** The words of the section under test; null when it is not drawn. */
  section: string | null
  scrollY: number
  mainTop: number
}

interface Watched {
  page: Page
  context: BrowserContext
  /** Every API request the page made: its path, its project and whether the switch had begun. */
  asked: { path: string; project: string | undefined; afterTheSwitch: boolean }[]
  errors: string[]
  /** Set just before the switch is started. */
  switching: () => void
  /**
   * Hold the new project's answer to the doors this names, until `release`. With `fail`, the held
   * read is then refused with those words, in the door's own error shape and the server's headers.
   */
  hold: (door: (url: URL) => boolean, fail?: string) => Promise<{ caught: () => number; answered: () => number; release: () => void }>
  releaseAll: () => void
}

/** A browser of its own, reading ALPHA, with what it stored before its first page. */
async function aBrowser(stored: Record<string, string>): Promise<Watched> {
  const context = await app.browser.newContext({ viewport: VIEWPORT, ...(films === null ? {} : { recordVideo: { dir: films, size: VIEWPORT } }) })
  await context.addInitScript(
    ({ project, more }: { project: string; more: Record<string, string> }) => {
      // ONLY A NEW BROWSER IS SEEDED: a later load must keep the project the switch chose.
      if (window.localStorage.getItem('mole-office.workspace') === null) {
        window.localStorage.setItem('mole-office.workspace', project)
        for (const [key, value] of Object.entries(more)) window.localStorage.setItem(key, value)
      }
    },
    { project: ALPHA.id, more: { 'mole-office.preset.theme': 'light', 'mole-office.chat.open': 'no', ...stored } },
  )
  const page = await context.newPage()
  const asked: Watched['asked'] = []
  const errors: string[] = []
  const releases: (() => void)[] = []
  let afterTheSwitch = false
  page.on('pageerror', (err) => errors.push(err.message))
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/api/')) asked.push({ path: url.pathname, project: request.headers()['x-mole-office-workspace'], afterTheSwitch })
  })
  return {
    page,
    context,
    asked,
    errors,
    switching: () => {
      afterTheSwitch = true
    },
    hold: async (door, fail) => {
      let release: () => void = () => undefined
      const released = new Promise<void>((resolve) => {
        release = resolve
      })
      releases.push(release)
      let caught = 0
      let answered = 0
      await page.route(door, async (route) => {
        if (route.request().method() === 'GET' && route.request().headers()['x-mole-office-workspace'] === BETA.id) {
          caught += 1
          await released
          if (fail !== undefined) {
            // A REPLY WRITTEN HERE WOULD BE REFUSED by the browser's own guard, which reads the
            // server's headers (criterion G3), so the server is asked and only its status and body change.
            const response = await route.fetch()
            const headers = response.headers()
            delete headers['content-length']
            await route.fulfill({ status: 500, headers, body: JSON.stringify({ error: fail, reason: 'A made-up refusal for a test.' }) })
            answered += 1
            return
          }
          await route.continue()
          answered += 1
          return
        }
        await route.continue()
      })
      return { caught: () => caught, answered: () => answered, release }
    },
    releaseAll: () => {
      for (const release of releases) release()
    },
  }
}

/** Close the browser, keeping its film when films are asked for. */
async function closeThe(watched: Watched, film: string): Promise<void> {
  watched.releaseAll()
  const video = watched.page.video()
  await watched.context.close()
  if (films !== null && video !== null) await video.saveAs(join(films, `${film}.webm`))
}

/** Start taking one sample per painted frame. `section` names the part whose words are kept. */
async function startTheFrames(page: Page, section: string | null): Promise<void> {
  await page.evaluate(
    ({ oldIdea, newIdea, section }: { oldIdea: string; newIdea: string; section: string | null }) => {
      const frames: Frame[] = []
      const held = window as unknown as { __frames: Frame[]; __stopFrames: boolean }
      held.__frames = frames
      held.__stopFrames = false
      const take = (): void => {
        const main = document.querySelector('#main')
        const text = main instanceof HTMLElement ? main.innerText : ''
        const fold = document.querySelector('details.plgs-settings')
        const part = section === null ? null : document.querySelector(section)
        frames.push({
          stored: window.localStorage.getItem('mole-office.workspace'),
          name: document.querySelector('.sbp-name')?.textContent ?? null,
          oldRows: text.includes(oldIdea),
          newRows: text.includes(newIdea),
          mark: document.querySelector('.px-reread .px-reread-what') !== null,
          loading: document.querySelector('#main .px-loading') !== null,
          failed: [...document.querySelectorAll('#main .px-error')].some((one) => one.closest('.px-reread') === null),
          fold: fold instanceof HTMLDetailsElement ? fold.open : null,
          section: part instanceof HTMLElement ? part.innerText : null,
          scrollY: window.scrollY,
          mainTop: main?.scrollTop ?? 0,
        })
        if (!held.__stopFrames) requestAnimationFrame(take)
      }
      requestAnimationFrame(take)
    },
    { oldIdea: ALPHA.idea, newIdea: BETA.idea, section },
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

/** Wait until the page says nothing is being read again. */
async function untilNothingIsReadAgain(page: Page): Promise<void> {
  await expect.poll(() => page.locator('.px-reread .px-reread-what').count(), { timeout: 20_000, message: 'the re-read mark never went' }).toBe(0)
}

/**
 * WHAT EVERY SWITCH OWES ITS FRAMES. The frames are split at the first one drawn after the project
 * changed; a broken split fails here rather than letting a later assertion pass on nothing.
 */
function theFramesOfTheSwitch(frames: Frame[], faults: string[]): { before: Frame[]; after: Frame[]; firstAfter: number } {
  const firstAfter = frames.findIndex((frame) => frame.stored === BETA.id)
  if (firstAfter === -1) throw new Error(`no frame was drawn after the switch to ${BETA.id}, in ${String(frames.length)} frames`)
  const before = frames.slice(0, firstAfter)
  const after = frames.slice(firstAfter)
  if (before.length < 3) throw new Error(`only ${String(before.length)} frames were taken before the switch`)
  if (frames.slice(firstAfter).some((frame) => frame.stored !== BETA.id)) throw new Error('the stored project went back after the switch')
  const first = after[0] as Frame
  if (first.name !== BETA.title) faults.push(`the first frame after the switch named "${String(first.name)}", not "${BETA.title}"`)
  const misnamed = after.filter((frame) => frame.name !== BETA.title).length
  if (misnamed > 0) faults.push(`${String(misnamed)} of ${String(after.length)} frames after the switch did not name "${BETA.title}"`)
  const unmarked = after.filter((frame) => frame.oldRows && !frame.mark).length
  if (unmarked > 0) faults.push(`${String(unmarked)} frames after the switch showed "${ALPHA.idea}" under "${BETA.title}" with no re-read mark`)
  return { before, after, firstAfter }
}

/** The doors in `doors` asked again after the switch, and those never asked before it. */
function theOfficeDoorsAskedAgain(asked: Watched['asked'], doors: readonly string[], faults: string[]): void {
  for (const door of doors) {
    const before = asked.filter((one) => one.path === door && !one.afterTheSwitch).length
    const after = asked.filter((one) => one.path === door && one.afterTheSwitch)
    if (before === 0) throw new Error(`the page never asked ${door} before the switch, so not asking it after would prove nothing`)
    if (after.length > 0) faults.push(`${door} was asked again after the switch, ${after.length === 1 ? 'once' : `${String(after.length)} times`} (in ${after.map((one) => String(one.project)).join(', ')})`)
  }
}

/** Open a Settings category in this browser and wait until the named part is drawn. */
async function openSettings(watched: Watched, mode: 'normal' | 'inspect', part: string): Promise<void> {
  await watched.page.goto(`${app.site}/?lang=en&mode=${mode}#/settings`, { timeout: 60_000 })
  await waitForThePage(watched.page, 60_000)
  await waitForTheProjects(watched.page)
  await watched.page.locator(part).first().waitFor({ timeout: 30_000 })
  await untilNothingIsReadAgain(watched.page)
}

/** Open Ideas in this browser and wait until ALPHA's idea is drawn and nothing is being read again. */
async function openIdeas(watched: Watched): Promise<void> {
  await watched.page.goto(`${app.site}/?lang=en#/ideas`, { timeout: 60_000 })
  await waitForThePage(watched.page, 60_000)
  await waitForTheProjects(watched.page)
  await watched.page.locator('#main').getByText(ALPHA.idea).first().waitFor({ timeout: 30_000 })
  await untilNothingIsReadAgain(watched.page)
}

/** BETA's ideas, which cases 3 and 4 hold. */
const betasIdeas = (url: URL): boolean => url.pathname === '/api/records' && url.searchParams.get('family') === 'ideas'

/**
 * The frames of a project page while BETA's ideas are held, and after they come. The previous rows
 * stay, marked, until the new ones take their place; loading is never drawn over them. When BETA's
 * read is refused instead, the last frame says the failure and the previous rows are gone.
 */
function theProjectPageFrames(frames: Frame[], atRelease: number, faults: string[], ending: 'the new rows' | 'the failure' = 'the new rows'): void {
  const { firstAfter } = theFramesOfTheSwitch(frames, faults)
  const before = frames.slice(0, firstAfter)
  if (!before.every((frame) => frame.oldRows && frame.name === ALPHA.title)) throw new Error(`a frame before the switch did not show "${ALPHA.idea}" under "${ALPHA.title}"`)
  const held = frames.slice(firstAfter, atRelease)
  if (held.length < 20) throw new Error(`only ${String(held.length)} frames were taken while ${BETA.id}'s ideas were held`)
  const dropped = held.filter((frame) => !frame.oldRows).length
  if (dropped > 0) faults.push(`${String(dropped)} of ${String(held.length)} frames while ${BETA.id}'s ideas were held did not keep "${ALPHA.idea}"`)
  const unmarked = held.filter((frame) => !frame.mark).length
  if (unmarked > 0) faults.push(`${String(unmarked)} of ${String(held.length)} frames while ${BETA.id}'s ideas were held carried no re-read mark`)
  const loading = frames.slice(firstAfter).filter((frame) => frame.loading).length
  if (loading > 0) faults.push(`${String(loading)} frames after the switch drew loading in the page`)
  const last = frames.at(-1) as Frame
  if (ending === 'the new rows') {
    if (!last.newRows || last.oldRows) faults.push(`the last frame showed ${last.newRows ? '' : 'no '}"${BETA.idea}" and ${last.oldRows ? '' : 'no '}"${ALPHA.idea}"`)
  } else {
    if (last.oldRows) faults.push(`the last frame, after ${BETA.id}'s ideas were refused, still showed "${ALPHA.idea}" under "${BETA.title}"`)
    if (!last.failed) faults.push(`the last frame, after ${BETA.id}'s ideas were refused, did not say the failure in the page`)
  }
}

describe('a switch of project reads again only what belongs to a project', () => {
  it('1. Settings: the office sections keep what they show, ask nothing again, and keep the place and the open fold', async () => {
    const watched = await aBrowser({ [SETTINGS_CATEGORY_KEY]: 'tools' })
    try {
      const { page } = watched
      const plugins = '[data-target="uiSurface/settings.plugins"]'
      await openSettings(watched, 'normal', `${plugins} details.plgs-settings`)
      if (films !== null) await putTheMadeUpLabelIn(page, 'Made-up office: two made-up projects, for a test', page.locator(plugins), 'Settings, tools')
      await page.locator(`${plugins} details.plgs-settings > summary`).click()
      await page.locator(plugins).evaluate((panel) => panel.scrollIntoView({ block: 'center' }))
      await page.mouse.move(VIEWPORT.width - 2, VIEWPORT.height - 2)
      await startTheFrames(page, null)

      watched.switching()
      await switchTheProject(page, BETA.id)
      await expect.poll(() => page.locator('.sbp-name').textContent(), { timeout: 20_000 }).toBe(BETA.title)
      await untilNothingIsReadAgain(page)
      await page.waitForTimeout(1_000)
      const frames = await stopTheFrames(page)

      const faults: string[] = []
      const { before, after } = theFramesOfTheSwitch(frames, faults)
      const was = before.at(-1) as Frame
      if (was.fold !== true) throw new Error('the office map fold was not open before the switch')
      if (was.scrollY + was.mainTop === 0) throw new Error('the tools category was not scrolled before the switch, so keeping the place would prove nothing')
      const loading = after.filter((frame) => frame.loading).length
      if (loading > 0) faults.push(`${String(loading)} of ${String(after.length)} frames after the switch drew loading in the page`)
      const closed = after.filter((frame) => frame.fold !== true).length
      if (closed > 0) faults.push(`${String(closed)} frames after the switch did not show the office map fold open`)
      const moved = after.filter((frame) => frame.scrollY !== was.scrollY || frame.mainTop !== was.mainTop).length
      if (moved > 0) faults.push(`${String(moved)} frames after the switch were not at the place the page was scrolled to`)
      theOfficeDoorsAskedAgain(watched.asked, TOOLS_OFFICE_DOORS, faults)
      expect(watched.errors, 'the page threw').toEqual([])
      expect(faults).toEqual([])
    } finally {
      await closeThe(watched, 'settings-tools')
    }
  }, 180_000)

  it('2. Settings: a section that draws the project keeps its answer, marked, while the new one is read', async () => {
    const watched = await aBrowser({ [SETTINGS_CATEGORY_KEY]: 'devMachines' })
    try {
      const { page } = watched
      const ceiling = '[data-target="uiSurface/settings.visitorceiling"]'
      await openSettings(watched, 'inspect', `${ceiling} .set-say`)
      if (films !== null) await putTheMadeUpLabelIn(page, 'Made-up office: two made-up projects, for a test', page.locator(ceiling), 'Settings, machines')
      await page.locator(ceiling).evaluate((panel) => panel.scrollIntoView({ block: 'center' }))
      await page.mouse.move(VIEWPORT.width - 2, VIEWPORT.height - 2)
      const roles = await watched.hold((url) => url.pathname === '/api/roles')
      await startTheFrames(page, ceiling)

      watched.switching()
      await switchTheProject(page, BETA.id)
      await expect.poll(() => roles.caught(), { timeout: 20_000, message: `${BETA.id}'s role cards were never asked for` }).toBeGreaterThan(0)
      await page.waitForTimeout(1_500)
      const atRelease = await framesSoFar(page)
      roles.release()
      await untilNothingIsReadAgain(page)
      await page.waitForTimeout(500)
      const frames = await stopTheFrames(page)

      const faults: string[] = []
      const { before, firstAfter } = theFramesOfTheSwitch(frames, faults)
      const shown = (before.at(-1) as Frame).section
      if (shown === null || shown.trim() === '') throw new Error('the visitor ceiling showed nothing before the switch')
      const held = frames.slice(firstAfter, atRelease)
      if (held.length < 20) throw new Error(`only ${String(held.length)} frames were taken while ${BETA.id}'s role cards were held`)
      const changed = held.filter((frame) => frame.section !== shown).length
      if (changed > 0) faults.push(`${String(changed)} of ${String(held.length)} frames while the role cards were held did not show what the visitor ceiling showed`)
      const unmarked = held.filter((frame) => !frame.mark).length
      if (unmarked > 0) faults.push(`${String(unmarked)} of ${String(held.length)} frames while the role cards were held carried no re-read mark`)
      const loading = frames.slice(firstAfter).filter((frame) => frame.loading).length
      if (loading > 0) faults.push(`${String(loading)} frames after the switch drew loading in the page`)
      theOfficeDoorsAskedAgain(watched.asked, MACHINES_OFFICE_DOORS, faults)
      expect(watched.errors, 'the page threw').toEqual([])
      expect(faults).toEqual([])
    } finally {
      await closeThe(watched, 'settings-machines')
    }
  }, 180_000)

  it('3. a project page switched by the switcher keeps its rows, marked, until the new ones come', async () => {
    const watched = await aBrowser({})
    try {
      const { page } = watched
      await openIdeas(watched)
      if (films !== null) await putTheMadeUpLabelIn(page, 'Made-up office: two made-up projects, for a test', page.locator('#main .fam'), 'Ideas')
      await page.mouse.move(VIEWPORT.width - 2, VIEWPORT.height - 2)
      const ideas = await watched.hold(betasIdeas)
      await startTheFrames(page, null)

      watched.switching()
      await switchTheProject(page, BETA.id)
      await expect.poll(() => ideas.caught(), { timeout: 20_000, message: `${BETA.id}'s ideas were never asked for` }).toBeGreaterThan(0)
      await page.waitForTimeout(1_500)
      const atRelease = await framesSoFar(page)
      ideas.release()
      await page.locator('#main').getByText(BETA.idea).first().waitFor({ timeout: 20_000 })
      await untilNothingIsReadAgain(page)
      await page.waitForTimeout(500)
      const frames = await stopTheFrames(page)

      const faults: string[] = []
      theProjectPageFrames(frames, atRelease, faults)
      expect(watched.errors, 'the page threw').toEqual([])
      expect(faults).toEqual([])
    } finally {
      await closeThe(watched, 'ideas-by-the-switcher')
    }
  }, 180_000)

  it('4. the same page switched by following an agent to the other project marks its kept rows in the same frame', async () => {
    const watched = await aBrowser({ [FOLLOWING_KEY]: `agent:${guideId}` })
    let lead = ''
    try {
      const { page } = watched
      await openIdeas(watched)
      await page.locator('.px-lead-stop').first().waitFor({ timeout: 30_000 })
      // THE OFFERS READ OF THIS LOAD HAS ANSWERED, so the lead below is learnt of from the office's news.
      await page.waitForTimeout(1_000)
      if (films !== null) await putTheMadeUpLabelIn(page, 'Made-up office: two made-up projects, for a test', page.locator('#main .fam'), 'Ideas, following')
      await page.mouse.move(VIEWPORT.width - 2, VIEWPORT.height - 2)
      const ideas = await watched.hold(betasIdeas)
      await startTheFrames(page, null)

      watched.switching()
      const sent = (await write(
        '/api/records',
        {
          kind: 'message',
          title: "A made-up lead to Beta's ideas",
          data: {
            body: "Made-up: look at Beta's ideas.",
            to: [{ kind: 'person', id: THE_PERSON }],
            lead: { target: { kind: 'page', route: '/ideas', workspaceId: BETA.id }, place: { at: 'surface' } },
          },
        },
        { ...asThePerson(ALPHA.id), 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': GUIDE },
      )) as { record: { id: string } }
      lead = sent.record.id
      await expect.poll(() => ideas.caught(), { timeout: 30_000, message: `following never took the browser to ${BETA.id}'s ideas` }).toBeGreaterThan(0)
      await page.waitForTimeout(1_500)
      const atRelease = await framesSoFar(page)
      ideas.release()
      await page.locator('#main').getByText(BETA.idea).first().waitFor({ timeout: 20_000 })
      await untilNothingIsReadAgain(page)
      await page.waitForTimeout(500)
      const frames = await stopTheFrames(page)

      const faults: string[] = []
      theProjectPageFrames(frames, atRelease, faults)
      expect(watched.errors, 'the page threw').toEqual([])
      expect(faults).toEqual([])
    } finally {
      await closeThe(watched, 'ideas-by-following')
      // THE LEAD IS MARKED READ WHATEVER HAPPENED, so no later browser in this office is taken by it.
      if (lead !== '') await fetch(`${app.api}/api/messages/${lead}/mark`, { method: 'POST', headers: asThePerson(ALPHA.id), body: JSON.stringify({ mark: 'seen' }) })
    }
  }, 180_000)
  it('5. a read that fails after a switch says the failure, and the previous project\'s rows go', async () => {
    const watched = await aBrowser({})
    try {
      const { page } = watched
      await openIdeas(watched)
      if (films !== null) await putTheMadeUpLabelIn(page, 'Made-up office: two made-up projects, for a test', page.locator('#main .fam'), 'Ideas, a refused read')
      await page.mouse.move(VIEWPORT.width - 2, VIEWPORT.height - 2)
      const ideas = await watched.hold(betasIdeas, REFUSAL)
      await startTheFrames(page, null)

      watched.switching()
      await switchTheProject(page, BETA.id)
      await expect.poll(() => ideas.caught(), { timeout: 20_000, message: `${BETA.id}'s ideas were never asked for` }).toBeGreaterThan(0)
      await page.waitForTimeout(1_500)
      const atRelease = await framesSoFar(page)
      ideas.release()
      await expect.poll(() => ideas.answered(), { timeout: 20_000, message: `${BETA.id}'s held ideas were never refused` }).toBeGreaterThan(0)
      // NOTHING ON THE PAGE IS WAITED FOR HERE: what the page draws after the refusal is the question.
      await page.waitForTimeout(1_500)
      const frames = await stopTheFrames(page)

      const faults: string[] = []
      theProjectPageFrames(frames, atRelease, faults, 'the failure')
      expect(watched.errors, 'the page threw').toEqual([])
      expect(faults).toEqual([])
    } finally {
      await closeThe(watched, 'ideas-a-refused-read')
    }
  }, 180_000)

  it("6. a switch to a project whose answer the page cache keeps draws that answer from the first frame, marked", async () => {
    const watched = await aBrowser({ [SETTINGS_CATEGORY_KEY]: 'devMachines' })
    try {
      const { page } = watched
      const ceiling = '[data-target="uiSurface/settings.visitorceiling"]'
      const roleCards = (url: URL): boolean => url.pathname === '/api/roles'
      await openSettings(watched, 'inspect', `${ceiling} .set-say`)
      if (films !== null) await putTheMadeUpLabelIn(page, 'Made-up office: two made-up projects, for a test', page.locator(ceiling), 'Settings, a kept answer')
      // BETA'S FIRST ANSWER IS MADE RECOGNISABLE. The two made-up projects have the same role cards, so
      // the answer Beta's first read keeps carries a made-up setting name, which the ceiling draws.
      const recognisable = async (route: Route): Promise<void> => {
        if (route.request().method() !== 'GET' || route.request().headers()['x-mole-office-workspace'] !== BETA.id) return route.continue()
        const response = await route.fetch()
        const headers = response.headers()
        delete headers['content-length']
        const body = (await response.json()) as { visitorCardCeiling: { setting: string } }
        body.visitorCardCeiling.setting = KEPT_FOR_BETA
        await route.fulfill({ status: response.status(), headers, body: JSON.stringify(body) })
      }
      await page.route(roleCards, recognisable)
      await switchTheProject(page, BETA.id)
      await expect.poll(() => page.locator(ceiling).innerText(), { timeout: 20_000, message: `${BETA.id}'s first answer was never drawn` }).toContain(KEPT_FOR_BETA)
      await untilNothingIsReadAgain(page)
      await page.unroute(roleCards, recognisable)
      await switchTheProject(page, ALPHA.id)
      await expect.poll(() => page.locator(ceiling).innerText(), { timeout: 20_000, message: `${ALPHA.id}'s answer never came back` }).not.toContain(KEPT_FOR_BETA)
      await untilNothingIsReadAgain(page)
      await page.locator(ceiling).evaluate((panel) => panel.scrollIntoView({ block: 'center' }))
      await page.mouse.move(VIEWPORT.width - 2, VIEWPORT.height - 2)
      const roles = await watched.hold(roleCards)
      await startTheFrames(page, ceiling)

      watched.switching()
      await switchTheProject(page, BETA.id)
      await expect.poll(() => roles.caught(), { timeout: 20_000, message: `${BETA.id}'s role cards were never asked for again` }).toBeGreaterThan(0)
      await page.waitForTimeout(1_500)
      const atRelease = await framesSoFar(page)
      roles.release()
      await untilNothingIsReadAgain(page)
      await page.waitForTimeout(500)
      const frames = await stopTheFrames(page)

      const faults: string[] = []
      const { before, firstAfter } = theFramesOfTheSwitch(frames, faults)
      if (before.some((frame) => frame.section === null || frame.section.includes(KEPT_FOR_BETA))) throw new Error(`a frame before the switch did not show ${ALPHA.id}'s visitor ceiling`)
      const held = frames.slice(firstAfter, atRelease)
      if (held.length < 20) throw new Error(`only ${String(held.length)} frames were taken while ${BETA.id}'s role cards were held`)
      const notKept = held.filter((frame) => frame.section === null || !frame.section.includes(KEPT_FOR_BETA)).length
      if (notKept > 0) faults.push(`${String(notKept)} of ${String(held.length)} frames while ${BETA.id}'s role cards were held did not show ${BETA.id}'s kept answer`)
      const unmarked = held.filter((frame) => !frame.mark).length
      if (unmarked > 0) faults.push(`${String(unmarked)} of ${String(held.length)} frames while ${BETA.id}'s role cards were held carried no re-read mark`)
      const loading = frames.slice(firstAfter).filter((frame) => frame.loading).length
      if (loading > 0) faults.push(`${String(loading)} frames after the switch drew loading in the page`)
      const last = frames.at(-1) as Frame
      if (last.section === null || last.section.includes(KEPT_FOR_BETA)) faults.push(`the last frame did not show the answer just read for ${BETA.id} in place of the kept one`)
      expect(watched.errors, 'the page threw').toEqual([])
      expect(faults).toEqual([])
    } finally {
      await closeThe(watched, 'settings-a-kept-answer')
    }
  }, 180_000)

  it.runIf(films !== null)('7. pictures of a project page while it is read again, at four widths in both looks', async () => {
    const folder = films as string
    for (const theme of ['light', 'dark'] as const) {
      const watched = await aBrowser({ 'mole-office.preset.theme': theme })
      try {
        const { page } = watched
        await openIdeas(watched)
        expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'the look the browser stored').toBe(theme)
        const ideas = await watched.hold(betasIdeas)
        await switchTheProject(page, BETA.id)
        await expect.poll(() => ideas.caught(), { timeout: 20_000, message: `${BETA.id}'s ideas were never asked for` }).toBeGreaterThan(0)
        for (const width of [1440, 990, 660, 390]) {
          await page.setViewportSize({ width, height: VIEWPORT.height })
          await page.locator('.px-reread .px-reread-what').first().waitFor({ timeout: 20_000 })
          await page.locator('#main').getByText(ALPHA.idea).first().waitFor({ timeout: 20_000 })
          await putTheMadeUpLabelIn(page, 'Made-up office: two made-up projects, for a test', page.locator('#main .fam'), `Ideas at ${String(width)}`)
          await page.mouse.move(-1, -1)
          await page.screenshot({ path: join(folder, `ideas-read-again-${String(width)}-${theme}.png`) })
        }
      } finally {
        await closeThe(watched, `ideas-read-again-${theme}`)
      }
    }
  }, 240_000)
})
