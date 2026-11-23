// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Review the whole interface without hand-starting anything.
 *
 *   node tools/review.mjs
 *
 * It picks two ports nothing is holding, seeds a throwaway database, starts the API and Vite on
 * those ports, photographs every page at 1440, 1200, 990, 660 and 390 in light and dark, writes a sheet,
 * and then SHUTS BOTH DOWN and proves the ports came back.
 *
 * THE EXIT CODE. 0 when the run reached its end, every picture was taken and every check passed.
 * 2 when the run reached its end and one or more pictures could not be taken: it went on past each
 * with a fresh browser, and its last lines list every one with its error. Other failures in the same
 * run are printed above that list, and the code is still 2. 1 when every picture was taken and
 * something else failed (a check that did not hold, a blank page, a page that drew far less than
 * last time without --expected), and 1 when the run stopped before its end. 130 when it was
 * interrupted.
 *
 * WHY IT EXISTS. This project has a standing rule that every screen is looked at before it is
 * called done, and the tool for that was tools/shot.mjs -- which photographs an app someone else
 * already started. So "look at the interface" meant: start the server, start Vite, remember which
 * database they were pointed at, take the shots, and then remember to stop them. That last step is
 * the one that gets skipped, and this project has had FIVE orphaned-process incidents, one of
 * which served stale data out of a database that had already been deleted and cost an afternoon
 * to diagnose. A review tool that leaked a server would be a poor joke, so shutdown here is not a
 * courtesy at the end: it runs from a `finally`, it kills by process GROUP, and it fails the run
 * if the ports are not free afterwards.
 *
 * WHY IT DOES NOT TOUCH ./data/panelx.db. The review runs against a fresh seeded database in the
 * system temp directory, so the pictures always show the same known content and nothing you were
 * working on is disturbed. MOLE_OFFICE_DB is passed in the child environment, which beats .env --
 * src/server/index.ts loads .env with process.loadEnvFile, and that does not overwrite a variable
 * the environment already set.
 *
 * ITS REQUESTS CARRY NO KEY, AND NEED NONE. They go only to the server this tool starts, on this computer, over a
 * database it has just made, and a database nobody has closed the key window on answers this computer's own program
 * that sends no key. It never asks the office.
 *
 * WHY THE PAGE LIST IS PARSED OUT OF router.tsx. The set of pages is written down exactly once, in
 * FLAT_ROUTES in src/web/components/router.tsx, and the comment there says so. A list of pages
 * hand-copied into this file would be a second copy, kept in step by whoever remembers -- and a
 * review tool that silently stops photographing a new page is worse than no review tool. This is a
 * .mjs script, so it cannot import a .tsx module to ask; it reads the source and matches the map.
 * If that match fails it stops with the file named, rather than photographing a shorter app.
 */

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { chromium, errors } from 'playwright'

import { profileSegmentFrom, recordPrefixFrom, segmentFrom, visitorSegmentFrom } from './read-the-router.mjs'
import { askAboutFreshness, whyNotToMeasure } from './freshness.mjs'
import { waitForThePage } from './the-page-is-ready.mjs'
import { whyItDrewNothing } from './the-content-floor.mjs'
import { localStamp } from '../src/shared/time.ts'
import { thePixelsOfAPng } from '../src/server/lib/smallpicture.ts'
import { MODES } from '../src/shared/mode.ts'
import { THE_OFFICES_VARIABLES, takeOutTheOfficesVariables } from './sandbox-common.mjs'
import { fetchAFullList } from './a-full-list-read.mjs'
import { THE_TEST_OFFICES_OWNER } from '../tests/the-test-offices-owner.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const outDir = join(root, 'tools', 'review')
/** What each picture drew on the last run that passed. See `readPreviousRun`. */
const referenceFile = join(outDir, 'what-each-page-drew-last-time.json')
const routerFile = join(root, 'src', 'web', 'components', 'router.tsx')
/* And where the grammar it used to hold now lives: FLAT_ROUTES and the `Route` union moved to
   src/shared/addresses.ts on 9 September 2026 so the write door could read them too (M97). The two
   files are read as one string below, because they are one declaration split by who may import it. */
const addressesFile = join(root, 'src', 'shared', 'addresses.ts')
/* Where the address segment of a participant's page is declared. See `profileSegmentFrom`. */
const profileFile = join(root, 'src', 'shared', 'profile.ts')
/* And where a visiting agent's credential page is declared. See `visitorSegmentFrom`. */
const visitorFile = join(root, 'src', 'shared', 'visitors.ts')
/* The shared table the five family addresses come out of. See `familyKeys`. */
const workFile = join(root, 'src', 'shared', 'work.ts')
/* The corpus the seed writes into this script's office. See `theRunThisReviewPhotographs`. */
const publicCorpusFile = join(root, 'scripts', 'seed-corpus', 'public.json')

/**
 * The five sizes and the two themes.
 *
 * WHY FOUR AND NOT TWO. This paragraph says what held on 25 August 2026. The interface was cut by
 * two `rem` media breakpoints, `max-width: 40rem` (640px) and `max-width: 60rem` (960px). Those two
 * lines made three bands with different layouts, and until that day this tool took 1440 and 390 —
 * the outer two bands and nothing else. The middle band, where the records table turned into one
 * card per record while the planning board was still a board, had never been photographed. 660 sat
 * inside it. 990 sat just past its top edge, which was also the narrowest window the
 * `min-width: 960px` two-column rule fired at and so the tightest the wide layout ever got.
 * `src/web` has held two more `rem` breakpoints since, `min-width: 64rem` (1024px) and
 * `min-width: 80rem` (1280px), and the next paragraph says which width covers the band between them.
 *
 * WHY 1200 AS WELL. The departments page changes at `min-width: 80rem` (1280px): from there a row's
 * "what it does" takes a fourth column. No width here sat between 1024px and 1280px, so the
 * three-column layout of that band was never photographed. 1200 sits inside it. Not 1280, because
 * `min-width: 80rem` already applies at 1280px, so a picture there draws what 1440 draws.
 *
 * 1440, 990, 660 and 390 are also what `design/round-ten/before/` was taken at, so a picture from
 * that set and a picture from a run today are the same width and can be put side by side.
 *
 * `name` is for a person reading this list. Nothing reads it — a picture is named by its width.
 *
 * NOT THE SAME LIST AS tools/shot.mjs, which still takes 1440 and 390. Restated rather than
 * imported, and that is worth one line of explanation because this project has found the same list
 * hand-copied in up to seven files: shot.mjs takes its shots at import time and exports nothing, so
 * there is no way to read the pair out of it without editing a file this change does not own. If a
 * third caller ever wants them, move them into a module both import instead of copying them a third
 * time. `tests/review-covers-four-widths.test.ts` reads this const out of the source and goes red
 * when a band of the layout has no width photographing it.
 */
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'wide desk', width: 1200, height: 1000 },
  { name: 'narrow desk', width: 990, height: 1000 },
  { name: 'tablet', width: 660, height: 900 },
  { name: 'phone', width: 390, height: 844 },
]
const THEMES = ['light', 'dark']
const LOOKS = { light: 'F', dark: 'H' }

/**
 * THE INSTANT EVERY BROWSER OF THIS REVIEW READS (wave 13y round 43, backlog 9.15).
 *
 * WHY. Two reviews of the same code are compared picture by picture, and an age label that turns
 * between them puts their pictures in a "runtime" class that says nothing about the code. An age
 * label turns at the half unit: `relativeTime` in src/web/components/ui.tsx rounds an age under a
 * day to the nearest hour. The seed writes its stamps at midnight (scripts/reset.ts), so a pair
 * that crosses a half hour at which one turns -- 23:30 for the midnight stamps, say -- draws two
 * different labels for one unchanged stamp.
 *
 * The browser's clock is therefore fixed at the reset's own midnight plus sixteen hours. Sixteen
 * hours is away from every half-hour turn for as long as one review runs: measured on the seed of
 * 19 October 2026, no seeded age label changes between 16:00 and 16:25, and a review takes about
 * twelve minutes. The offset is added in milliseconds, so a day on which the clocks change (23 or
 * 25 hours long) does not move the ages.
 *
 * ONE FACT IS WORKED OUT IN ONE PLACE (USER.md invariant 9). The reset prints the instant its own
 * clock reads while it seeds, and `theFixedBrowserInstant` reads that line back; nothing here
 * computes midnight a second way that could disagree with it.
 */
const FIXED_CLOCK_OFFSET_MS = 16 * 60 * 60 * 1000

/**
 * The instant every browser this review opens reads, from what the reset printed.
 *
 * The reset's line is "reset: ids are made in turn, and the clock reads <instant> until the seed
 * and first-start records are done" (scripts/reset.ts). Anything else has no instant to read, and
 * this throws rather than choosing one, naming the whole output so the reason is on screen.
 *
 * @param {string} resetOutput everything scripts/reset.ts printed while it seeded
 * @returns {number} milliseconds since the epoch
 */
export function theFixedBrowserInstant(resetOutput) {
  const said = String(resetOutput)
  const read = /^reset: ids are made in turn, and the clock reads (.+) until the seed and first-start records are done$/m.exec(said)
  if (read === null) {
    throw new Error(
      `review: the reset's output does not say what its clock read, so the instant every browser's clock is ` +
        `fixed at cannot be worked out. Its whole output was:\n${said}`,
    )
  }
  const midnight = new Date(read[1])
  if (Number.isNaN(midnight.getTime())) {
    throw new Error(`review: the reset said its clock read “${read[1]}”, which this tool cannot read as a time.`)
  }
  return midnight.getTime() + FIXED_CLOCK_OFFSET_MS
}

/**
 * The instant every browser context is fixed at; set once, from the reset's output, before the
 * first context is made. Every call of `reviewContext` in this file passes it in.
 * @type {number | null}
 */
let theBrowsersFixedInstant = null

/**
 * Select the stored look before any page loads; matching the browser alone would photograph Auto.
 *
 * This function reads nothing but its arguments and `window`. A test once ran its text alone, outside
 * this module, which is why the fixed instant comes in as an argument, and each caller passes
 * `theBrowsersFixedInstant`, instead of a default that reads the module (wave 13y round 43).
 * @param {import('playwright').Browser} browser
 * @param {{width: number, height: number}} viewport
 * @param {'light' | 'dark'} theme
 * @param {number} [deviceScaleFactor]
 * @param {number | null} [clockTime] the instant this context's clock is installed at; null leaves the browser's real clock
 */
export async function reviewContext(browser, viewport, theme, deviceScaleFactor = 1, clockTime = null) {
  const context = await browser.newContext({ viewport, colorScheme: theme, deviceScaleFactor })
  if (clockTime !== null) {
    // INSTALL, NOT setFixedTime AND NOT pauseAt. `install` starts Date, timers, animation frames,
    // requestIdleCallback and performance at this instant and lets them keep flowing, so a page's
    // settle timers still fire. setFixedTime would freeze Date, and pauseAt would stop every timer
    // with it. The criterion test holds that time flows; if a Playwright upgrade ever stops that,
    // `clock.resume()` after install is the mend.
    await context.clock.install({ time: clockTime })
  }
  await context.addInitScript((look) => {
    window.localStorage.setItem('mole-office.preset.theme', look)
  }, theme)
  return context
}

/**
 * Take every picture in the list, and go on past one that fails.
 *
 * WHY. On 27 September 2026 (problem Xykek3p-dw2q) Chromium could not capture the records page at
 * 1440 and the browser closed under the tool. Every later picture then failed with "Target page,
 * context or browser has been closed", because they all asked the same dead browser. So after a
 * picture fails, this closes that browser by its own handle and starts a fresh one for the next
 * picture. A failure that left the browser alive gets a fresh one too: it costs a second, and the
 * next picture does not depend on what the failed one left behind.
 *
 * `hold.browser` is the browser in use; it is replaced here, so the caller closes whichever one is
 * in it at the end. `takeOne(browser, picture)` takes one picture and throws when it cannot.
 * `say(line)` prints one line. The answer is the list of pictures that could not be taken, each
 * with its error, in the order they were tried.
 *
 * It uses nothing outside its own arguments, because tests/review-goes-on-past-a-failed-picture.test.ts
 * reads it out of this file and runs it with a stand-in browser.
 */
export async function photographEach(hold, pictures, takeOne, launch, say) {
  const lost = []
  for (const picture of pictures) {
    try {
      await takeOne(hold.browser, picture)
    } catch (err) {
      const error = String(err?.message ?? err).split('\n')[0]
      const which = `${picture.page.name} at ${picture.viewport.width}px ${picture.theme}`
      lost.push({ which, error })
      say(`FAILED ${which}: ${error}`)
      say(`closing that browser and starting a fresh one for the next picture`)
      await hold.browser.close()
      hold.browser = await launch()
    }
  }
  return lost
}


/**
 * The owner and then App load asynchronously in src/web/main.tsx; App mounts main.page.
 * vPwqFHH51SuO found review photographing before that mount. Wait here because
 * wFjwXRkS_6r3 belongs to wave 13j and review needs its pictures now. USER.md invariant 2:
 * a ready signal without a drawn main element cannot silently count as a picture of a page.
 * @param {import('playwright').Page} tab
 * @param {number} [timeoutMs]
 */
export async function waitForReviewPage(tab, timeoutMs = 30_000) {
  await waitForThePage(tab, timeoutMs)
  try {
    await tab.waitForSelector('main.page', { state: 'visible', timeout: timeoutMs })
  } catch (err) {
    if (!(err instanceof errors.TimeoutError)) throw err
    throw new Error(`the page's main element was not drawn within ${timeoutMs / 1000} seconds`)
  }
}

/** The lines a page shows where its drawing will be while the drawing is still loading. */
const A_DRAWING_STILL_LOADING = 'main.page .gx-loading'

/**
 * Wave 13y round 77: wait out a drawing that is still loading.
 *
 * The pipeline page says it is ready once its requests have answered, but its drawing engine is a
 * script that comes after them. Until it comes, the page shows a loading line where the drawing will
 * be and has no canvas yet, so settleAnyCanvas found nothing to wait for and the review photographed
 * the loading line. The structure view draws both of its loading lines with the class gx-loading, so
 * this waits until no such line shows. A page with no drawing shows no such line and goes straight on.
 *
 * IT THROWS AT THE BOUND, and names the line, because a drawing that never comes must fail its
 * picture and not be kept as a picture of the page.
 * @param {import('playwright').Page} tab
 * @param {number} timeoutMs
 */
async function waitOutADrawingStillLoading(tab, timeoutMs) {
  const showing = (selector) => [...document.querySelectorAll(selector)].filter((line) => line.checkVisibility())
  try {
    await tab.waitForFunction(`(${showing})(${JSON.stringify(A_DRAWING_STILL_LOADING)}).length === 0`,
      undefined, { timeout: timeoutMs })
  } catch (err) {
    if (!(err instanceof errors.TimeoutError)) throw err
    const said = await tab.evaluate(`(${showing})(${JSON.stringify(A_DRAWING_STILL_LOADING)})` +
      `.map((line) => line.textContent.trim()).join(' / ')`).catch(() => null)
    throw new Error(
      `the drawing on this page was still loading after ${timeoutMs / 1000} seconds: the page still said ` +
        `"${said ?? 'nothing that could be read'}" where the drawing should be, so the picture would have ` +
        'shown the loading line and not the drawing',
    )
  }
}

/**
 * Wave 13y round 41: give each picture up to five seconds for images, fonts and finite motion.
 * Five seconds allows ordinary delayed assets and opening animations without letting one held
 * request stop the review. At the cap we keep the picture and say what has not settled.
 * Lazy images outside the window may never be requested, even by a full-page capture. Asking
 * for them eagerly changes no dimensions, media queries or scroll position. Image decoding is
 * awaited too. A complete decode failure is named immediately instead of consuming the cap.
 * Only document images belong here; canvas art loaded by app code does not.
 * Computed endTime is Infinity for endless motion. The 900ms canvas waits remain: JavaScript
 * fitView and layout work need not appear in document.getAnimations().
 */
export async function waitForReviewSettled(tab, name, capture) {
  const pending = await tab.evaluate((cap) => new Promise((resolve) => {
    const images = new Map()
    let fontPromise
    let fontsReady = false
    const waiting = () => {
      let imageCount = 0
      let pendingImages = 0
      let failedImages = 0
      for (const image of document.images) {
        if (image.loading === 'lazy') image.loading = 'eager'
        const source = image.currentSrc || image.src
        let state = images.get(image)
        if (!state || state.source !== source) {
          state = { source, decoded: false, failed: false }
          images.set(image, state)
          const decoding = state
          image.decode().then(() => { decoding.decoded = true }, () => { decoding.failed = true })
        }
        if (!image.complete || !state.decoded) {
          imageCount += 1
          if (state.failed) failedImages += 1
          if (!image.complete || !state.failed) pendingImages += 1
        }
      }
      if (fontPromise !== document.fonts.ready) {
        fontPromise = document.fonts.ready
        fontsReady = false
        fontPromise.then(() => { fontsReady = true })
      }
      const animations = document.getAnimations().filter((animation) =>
        animation.effect?.getComputedTiming().endTime !== Infinity &&
        animation.playState !== 'finished' && animation.playState !== 'idle',
      ).length
      const parts = []
      if (imageCount) parts.push(`${imageCount} image${imageCount === 1 ? '' : 's'}` +
        (failedImages ? ` (${failedImages} failed to load or decode)` : ''))
      if (!fontsReady || document.fonts.status === 'loading') parts.push('fonts')
      if (animations) parts.push(`${animations} animation${animations === 1 ? '' : 's'}`)
      return { pending: pendingImages + (!fontsReady || document.fonts.status === 'loading' ? 1 : 0) + animations,
        reason: parts.join(', ') || null }
    }
    const finish = (reason) => {
      clearInterval(poll)
      clearTimeout(deadline)
      resolve(reason)
    }
    const poll = setInterval(() => {
      const state = waiting()
      if (state.pending === 0) finish(state.reason)
    }, 25)
    const deadline = setTimeout(() => finish(waiting().reason), cap)
    waiting()
  }), 5_000)
  if (pending !== null) console.log(`review: ${name} — not settled (${pending})`)
  // Playwright otherwise waits for fonts a second time inside screenshot, beyond our cap.
  // Its local screenshot switch lets this wait own the deadline without changing page fonts.
  // Captures in this tool are sequential; restore the caller's setting even if capture fails.
  const fontsWait = process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY
  process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1'
  try { await capture() } finally {
    if (fontsWait === undefined) delete process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY
    else process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = fontsWait
  }
  return pending
}

/** The ordinary page picture, shared with the tests so they exercise what review keeps.
 * @param {import('playwright').Page} tab
 * @param {{width: number, height: number}} viewport
 * @param {{canvas: string | null, height: number | null, file: string | null,
 *   content: ReturnType<typeof contentCensusInPage> | null, blank: string | null, error: string | null,
 *   notSettled?: string | null}} shot
 * @param {string} name
 * @param {string} [directory]
 * @param {number} [timeoutMs]
 */
export async function takeReviewPicture(tab, viewport, shot, name, directory = outDir, timeoutMs = 30_000) {
  try {
    await waitForReviewPage(tab, timeoutMs)
    await waitOutADrawingStillLoading(tab, timeoutMs)
    shot.canvas = await settleAnyCanvas(tab, viewport)
    // Wave 13y round 77: the text is counted just before the shutter, after every wait, so the count
    // and the picture describe the same page. It is kept only once the picture has been taken.
    let content = null
    shot.notSettled = await waitForReviewSettled(tab, name, async () => {
      shot.height = await tab.evaluate(() => document.documentElement.scrollHeight)
      content = await tab.evaluate(contentCensusInPage)
      await tab.screenshot({ path: join(directory, name), fullPage: true })
    })
    shot.file = name
    shot.content = content
    shot.blank = whyItDrewNothing(shot.content)
  } catch (err) {
    shot.error = String(err?.message ?? err).split('\n')[0]
    throw err
  }
}

/** How long each service gets to answer before the run is called failed. */
const READY_TIMEOUT_MS = 60_000
/** How long a killed process group gets to go quietly before it is killed harder. */
const GRACE_MS = 5_000

/* HOW LITTLE THE CONTENT AREA MAY DRAW BEFORE THE RUN IS CALLED FAILED: tools/the-content-floor.mjs,
   which says why the floor exists and why its numbers are what they are. */

/**
 * HOW FAR A PAGE MAY FALL FROM WHAT IT DREW LAST TIME.
 *
 * The floor above catches a page that drew nothing. This catches the more common shape: a page that
 * still draws its heading and lost the list underneath it.
 *
 * WHY 60%. Two clean runs of the same commit were compared on 14 August 2026 and not one of the 80
 * pictures moved by a single text node. The corpus is seeded fresh each run but from the same script,
 * so the counts are exactly repeatable, and any threshold at all would do. It is set at 60% anyway,
 * with a second condition of at least 8 nodes lost, so that a real corpus with one record more or
 * less in it does not make the tool cry wolf. A tool that cries wolf gets read as noise, and then the
 * day it is right it is ignored.
 */
const DROP_RATIO = 0.6
const DROP_MIN_NODES = 8

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------- ports

/**
 * A port nothing is holding, chosen by the operating system.
 *
 * Binding to port 0 and reading back what was assigned is the only way to ask "give me one that
 * is free" -- picking a number and hoping is how you land on the 8787 somebody else is using.
 */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

/** True when nothing is listening on this port. Used to PROVE the shutdown worked. */
function portIsFree(port) {
  return new Promise((resolve) => {
    const probe = createServer()
    probe.on('error', () => resolve(false))
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)))
  })
}

// ---------------------------------------------------------------------------- the page list

/**
 * Every page the app has, with the address that reaches it, read out of the router.
 *
 * `home` and `unknown` are not in FLAT_ROUTES because neither has a segment of its own: home is
 * the empty address, and unknown is what the router answers for an address it does not know. They
 * are both pages the shell draws, so both are photographed; the unknown one gets an address that
 * is deliberately not in the map, which is exactly the condition that produces it.
 */
function pagesFrom(source) {
  const block = source.match(/const FLAT_ROUTES[^=]*=\s*\{([\s\S]*?)\n\}/)
  if (block === null) {
    throw new Error(
      `Could not find the FLAT_ROUTES map in ${addressesFile}. That map is where this script reads ` +
        `the list of pages from. If the router has been restructured, teach this parser the new ` +
        `shape -- do not hand-copy a page list into tools/review.mjs.`,
    )
  }
  const pages = [{ name: 'home', address: '#/' }]
  // A KEY IN QUOTES IS STILL A KEY. `'agent-use'` cannot be written bare — a hyphen is not allowed
  // in a JavaScript identifier — and the pattern used to require a bare one, so the page it names
  // would have been skipped in silence and the review would have photographed a shorter app while
  // reporting success. The coverage check below is what caught it; the quote is now optional here.
  for (const entry of block[1].matchAll(/^\s*'?([A-Za-z0-9_$-]+)'?:\s*'([^']+)'/gm)) {
    pages.push({ name: entry[2], address: `#/${entry[1]}` })
  }
  // A KEY NAMED BY A CONSTANT IS STILL A KEY. Settings' segment became `[SETTINGS_SEGMENT]` when its
  // address learnt to name one panel (settingsPath), and the pattern above reads only a key written
  // out, so Settings dropped out and assertEveryPageCovered stopped every run with "Never reached:
  // settings". The constant is read where it is declared, by the one reader of such declarations,
  // as tools/legibility.mjs does; this photographs #/settings, the whole page with its panels folded.
  for (const entry of block[1].matchAll(/^\s*\[([A-Z][A-Z0-9_]*)\]:\s*'([^']+)'/gm)) {
    pages.push({ name: entry[2], address: `#/${segmentFrom(source, entry[1], addressesFile, `the ${entry[2]} page`)}` })
  }
  if (pages.length === 1) {
    throw new Error(`FLAT_ROUTES in ${addressesFile} was found but read as empty, so no page addresses came out of it.`)
  }
  // THE FAMILY PAGES SHARE ONE ROUTE and are not in FLAT_ROUTES, because their address segment IS
  // the family key -- the router reads it off KIND_FAMILIES so that a family added there gets an
  // address with nothing to keep in step. This script reads the same declaration for the same
  // reason. They are photographed separately because they are different pages to a reader, and
  // `route: 'family'` is what tells the coverage check they are one route.
  //
  // A FAMILY WHOSE KEY IS ALREADY A FLAT ADDRESS, OR A RENAMED ONE, HAS NO PAGE OF ITS OWN, and it
  // is skipped here rather than photographed twice. `decisions` is that family: `#/decisions` is
  // now a renamed address that lands on the governance queue, the router applies the rename before
  // it looks at family keys, and there is no family page behind it to photograph. Without this the
  // sheet would carry the same picture of the queue under two names, one of them claiming to be a
  // page that does not exist.
  //
  // BOTH ARE READ OUT OF THE ROUTER rather than named here, for the reason the whole of this
  // function exists: a page list hand-copied into this script is a second copy of the router's.
  const flatSegments = new Set(pages.map((p) => p.address.replace(/^#\//, '')))
  for (const segment of renamedSegments(source)) flatSegments.add(segment)
  for (const family of familyKeys()) {
    if (flatSegments.has(family)) continue
    pages.push({ name: `family-${family}`, address: `#/${family}`, route: 'family' })
  }
  pages.push({ name: 'unknown', address: '#/no-such-page' })
  return pages
}

/**
 * The addresses that were renamed, read out of RENAMED_ADDRESSES in the router.
 *
 * An old address is not a page: it parses as the page it was renamed to, so photographing it would
 * be the same screen under a second name. Empty is a real answer — a tree with no renames — so this
 * does not fail when it finds none, unlike the page list, which would be a parser that had stopped
 * reading.
 */
function renamedSegments(source) {
  const block = source.match(/export const RENAMED_ADDRESSES[^=]*=\s*\{([\s\S]*?)\n\}/)
  if (block === null) return []
  return [...block[1].matchAll(/^\s*([A-Za-z0-9_$]+):\s*'([^']+)'/gm)].map((entry) => entry[1])
}

/** The family keys, out of the shared table that defines them. Never a copy. */
function familyKeys() {
  const source = readFileSync(workFile, 'utf8')
  const block = source.match(/export const KIND_FAMILIES = \{([\s\S]*?)\n\} as const/)
  if (block === null) {
    throw new Error(
      `Could not find KIND_FAMILIES in ${workFile}. The five family pages take their addresses from ` +
        `it, so this script cannot know what to photograph. Teach this parser the new shape -- do ` +
        `not hand-copy a family list into tools/review.mjs.`,
    )
  }
  const keys = [...block[1].matchAll(/^\s*([a-z]+):\s*\{/gm)].map((m) => m[1])
  if (keys.length === 0) throw new Error(`KIND_FAMILIES in ${workFile} was found but read as empty.`)
  return keys
}

/**
 * Stop if the router knows a page this script found no way to reach.
 *
 * WHY, AND IT IS THE WHOLE REASON THIS FUNCTION EXISTS. Reading FLAT_ROUTES with a pattern has one
 * silent failure: the map is restructured in a way the pattern still matches but no longer reads
 * whole -- a key written as a computed name, an entry on the same line as another -- and the run
 * then photographs a SHORTER app and reports success. Nothing about the contact sheet would look
 * wrong; a page would just be missing, and a missing page reads as a page nobody changed.
 *
 * `Route` in the same file is an independent statement of the same fact: one member per page, and
 * App.tsx's `Page` is that union's `name`. Comparing the two catches the case FLAT_ROUTES alone
 * cannot, and it catches it by name, so the error says which page went unseen.
 */
function assertEveryPageCovered(source, pages) {
  const union = source.match(/export type Route =([\s\S]*?)\n\n/)
  if (union === null) {
    throw new Error(`Could not find the \`Route\` union in ${addressesFile}, which is what proves this script found every page.`)
  }
  const declared = new Set([...union[1].matchAll(/\{\s*name:\s*'([^']+)'/g)].map((m) => m[1]))
  // A page is compared by the ROUTE it exercises, not by the name of its picture. One route can be
  // worth photographing at more than one address -- `#/pipeline` opens on the modules and
  // `#/pipeline/<id>` opens on one pipeline, and they are the same route showing two different
  // drawings. Without this the second address would be reported as a page the router does not have.
  const shot = new Set(pages.map((p) => p.route ?? p.name))
  const missed = [...declared].filter((name) => !shot.has(name))
  const extra = [...shot].filter((name) => !declared.has(name))
  if (missed.length > 0 || extra.length > 0) {
    throw new Error(
      `The pages this script found do not match the \`Route\` union in ${addressesFile}. ` +
        (missed.length > 0 ? `Never reached: ${missed.join(', ')}. ` : '') +
        (extra.length > 0 ? `Photographed but not declared: ${extra.join(', ')}. ` : '') +
        `Teach this script how to reach the new page rather than letting the review quietly skip it.`,
    )
  }
}

// The address prefix of a record page is read by `recordPrefixFrom`, imported at the top of this
// file from tools/read-the-router.mjs. `#/r/` is written down once, in the function the app itself
// navigates with, and the parser that reads it is written down once too — three tools kept a copy
// of it, wave 5 step 3 changed `recordPath`, and all three copies broke on the same day. This one
// threw before it photographed anything, so the four-width review did not run for a whole round.

/**
 * Which pipeline is worth photographing: the one whose steps demonstrate the most.
 *
 * A DRAWING IS ONLY WORTH A PICTURE IF IT SHOWS THE DRAWING DOING SOMETHING. "The first pipeline in
 * the list" would have been one line and would have photographed whichever one happened to be filed
 * first -- which on this seed is a four-step chain with no branch, no rejoin and no partial gate,
 * so a review of it could never show that any of those three are drawn at all. The score below is
 * one point per behaviour the picture would then hold, and the chosen pipeline is named on the sheet
 * with its counts so a reader can check the claim against the picture.
 */
function richestPipeline(records, links) {
  const byId = new Map(records.map((record) => [record.id, record]))
  let best = null
  for (const record of records) {
    if (record.kind !== 'pipeline') continue
    // A PIPELINE IS AN ORDERED LIST OF BLOCK RECORD IDS, and what each block waits on and which
    // modules carry it are stored LINKS. This used to read `data.steps[]` and the `needs` inside
    // each entry; both are rows now, so this reads rows.
    const ids = Array.isArray(record.data?.blockIds) ? record.data.blockIds : []
    if (ids.length === 0) continue
    const held = new Set(ids)
    const blocks = ids.map((id) => byId.get(id)).filter((block) => block !== undefined && block.kind === 'block')
    const dependents = new Map()
    const waitsOn = new Map()
    let hard = 0
    let partial = 0
    for (const link of links) {
      if (link.type !== 'blocks' || !held.has(link.toId) || !held.has(link.fromId)) continue
      dependents.set(link.fromId, (dependents.get(link.fromId) ?? 0) + 1)
      waitsOn.set(link.toId, (waitsOn.get(link.toId) ?? 0) + 1)
      if (link.gate === 'hard') hard++
      if (link.gate === 'partial') partial++
    }
    const carried = new Set(links.filter((l) => l.type === 'implements' && held.has(l.toId)).map((l) => l.toId))
    const facts = {
      record,
      steps: blocks.length,
      branches: [...dependents.values()].filter((n) => n > 1).length,
      joins: [...waitsOn.values()].filter((n) => n > 1).length,
      hard,
      partial,
      stopped: blocks.filter((b) => b.data?.state === 'failed' || b.data?.state === 'blocked').length,
      unowned: blocks.filter((b) => !carried.has(b.id)).length,
    }
    // One point per behaviour PRESENT, so a pipeline with one of each beats a long chain with two
    // of one. The step count breaks a tie, because a bigger drawing tests the layout harder.
    const score =
      [facts.branches, facts.joins, facts.hard, facts.partial, facts.stopped, facts.unowned].filter((n) => n > 0)
        .length *
        100 +
      facts.steps
    if (best === null || score > best.score) best = { ...facts, score }
  }
  return best
}

/**
 * The date a record says it is owed by, or null when it says nothing readable.
 *
 * A DELIBERATELY SMALLER READER THAN THE PRODUCT'S. `readDue` in src/shared/work.ts is the one that
 * decides what a `due` means, and this script is a .mjs file that cannot import a .ts module to ask
 * it. So this reads only the part it needs — is there a date-shaped string here — and it is used for
 * ONE thing: choosing which record to point a camera at. It decides nothing about the product, and a
 * record it misses costs a picture rather than a wrong answer.
 */
function readableDue(record) {
  const due = record?.data?.due
  if (typeof due === 'string') return /^\d{4}-\d{2}-\d{2}/.test(due) ? due.slice(0, 10) : null
  if (due !== null && typeof due === 'object' && typeof due.date === 'string') {
    return /^\d{4}-\d{2}-\d{2}/.test(due.date) ? due.date.slice(0, 10) : null
  }
  return null
}

/**
 * Every link touching a block, in the stored direction, with its gate.
 *
 * `GET /api/records/:id` serves a record's links from BOTH ends with `isBacklink` saying which way
 * round; this undoes that point of view, because a line has one direction whichever end you arrived
 * from. Deduplicated on the link's own id, which is exact.
 */
async function readBlockLinks(apiPort, records) {
  const byId = new Map()
  for (const record of records) {
    if (record.kind !== 'block') continue
    const detail = await fetch(`http://127.0.0.1:${apiPort}/api/records/${encodeURIComponent(record.id)}`)
      .then((r) => (r.ok ? r.json() : { links: [] }))
      .catch(() => ({ links: [] }))
    for (const link of detail.links ?? []) {
      byId.set(link.linkId, {
        type: link.type,
        fromId: link.isBacklink ? link.other.id : record.id,
        toId: link.isBacklink ? record.id : link.other.id,
        gate: link.gate?.kind ?? null,
      })
    }
  }
  return [...byId.values()]
}

// ---------------------------------------------------------------------------- did the page draw?

/**
 * RUNS INSIDE THE BROWSER. What the content area drew, with the furniture left out.
 *
 * `main.page` is the element App.tsx puts every page inside, and it is the only thing counted here.
 * Its absence is itself an answer and a bad one: the shell drew no content area at all.
 *
 * Three numbers rather than one, because each of them can be fooled on its own. Text nodes alone
 * miss a page that is one large drawing; drawn height alone is met by an empty box with padding;
 * words alone are met by a page of icons. A page that drew something clears all three easily.
 */
function contentCensusInPage() {
  const main = document.querySelector('main.page')
  if (main === null) return { found: false, texts: 0, words: 0, marks: 0, boxes: 0, height: 0 }
  const visible = (el) =>
    el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })

  // HOW MANY WORDS ONE PIECE OF TEXT COUNTS AS, IN ENGLISH AND IN CHINESE.
  //
  // English puts a space between words, so it is counted by splitting on spaces and keeping the
  // pieces that hold a letter or a digit. Chinese puts no space between words, so a Chinese
  // sentence split on spaces is one piece, and a short one fell under the four-word floor. So
  // Chinese characters (U+4E00 to U+9FFF, and U+3400 to U+4DBF) are counted by characters instead:
  // two characters count as one word, and a sentence of eight characters counts as four.
  // tests/review-counts-chinese-by-characters.test.ts reads this function out of this file and
  // runs it, so the test and the review use the same code.
  const wordsIn = (text) => {
    const chinese = /[\u4e00-\u9fff\u3400-\u4dbf]+/gu
    const chineseCharacters = (text.match(chinese) ?? []).reduce((n, run) => n + run.length, 0)
    const spacedWords = text.replace(chinese, ' ').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
    return spacedWords + Math.floor(chineseCharacters / 2)
  }

  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT)
  let texts = 0
  let words = 0
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = (node.nodeValue ?? '').replace(/\s+/g, ' ').trim()
    if (text === '') continue
    const el = node.parentElement
    if (el === null || el.closest('script, style') !== null) continue
    if (!visible(el)) continue
    texts++
    words += wordsIn(text)
  }

  // Anything with a box a person could see. The canvas draws its cards as elements, so a drawing
  // with no prose in it still counts here.
  let boxes = 0
  for (const el of main.querySelectorAll('*')) {
    if (!visible(el)) continue
    const rect = el.getBoundingClientRect()
    if (rect.width >= 8 && rect.height >= 8) boxes++
  }
  // THE DESIGN'S SHORT MARK FOR ORDINARY EMPTINESS. Absence in components/ui.tsx draws it as a
  // .px-absent element holding a dash, which has no letters and so no words. A page that is
  // ordinarily empty draws its heading and this mark, and the floor accepts it
  // (tools/the-content-floor.mjs).
  let marks = 0
  for (const el of main.querySelectorAll('.px-absent')) if (visible(el)) marks++
  return { found: true, texts, words, marks, boxes, height: Math.round(main.getBoundingClientRect().height) }
}


/**
 * WHAT EACH PICTURE DREW LAST TIME, so a page that quietly lost most of itself is visible.
 *
 * WHY A STORED EXPECTATION AT ALL, AND WHY THIS ONE IS NOT A LIE. A number checked into the
 * repository saying "Home draws 155 text nodes" would be a fact worked out in two places: the day
 * somebody legitimately adds a panel, the file is wrong and nothing makes it agree, so it gets
 * bumped without being read and stops meaning anything. This file is written by the tool itself,
 * every run, so nobody maintains it and it cannot go stale by neglect.
 *
 * IT IS WRITTEN ONLY BY A RUN THAT PASSED. That is the whole of its honesty. If a run fails, the
 * reference is left as it was, so the next run compares against the last KNOWN-GOOD picture rather
 * than against the broken one — otherwise the second run after a regression would report the
 * regression as the new normal, which is the stored-baseline failure arriving by the back door.
 *
 * IT LIVES IN A DIRECTORY THIS TOOL WIPES, which is deliberate and needs saying. `tools/review` is
 * emptied at the start of every run so a deleted page cannot leave a stale picture on the sheet, so
 * this file is read into memory BEFORE the wipe and written straight back after it. Delete the
 * directory by hand and the reference is gone; the next run then says, in as many words, that it has
 * nothing to compare against. "Nobody has looked" is a real answer and is printed as one — it is
 * never reported as "nothing has changed".
 */
function readPreviousRun() {
  try {
    const held = JSON.parse(readFileSync(referenceFile, 'utf8'))
    if (typeof held?.when !== 'string' || typeof held?.pictures !== 'object' || held.pictures === null) return null
    return held
  } catch {
    // A missing or unreadable reference is the ordinary first-run state, and the report says so.
    return null
  }
}

/** The key one picture is filed under: the same page, width and theme as last time or nothing. */
const pictureKey = (shot) => `${shot.page}|${shot.width}|${shot.theme}`

/**
 * WHY A FALL WAS EXPECTED, IN THE WORDS OF WHOEVER RAN THIS.
 *
 * The picture guard refuses to move its reference after a run where any page drew far less than it
 * used to. That rule is right and it stays: a broken run that wrote its own counts down would make
 * the next run compare a regression against itself and call it normal.
 *
 * IT HAD NO WAY TO SAY "THIS FALL WAS THE POINT". On 21 August 2026 the graph was deliberately
 * rebuilt to draw far less — the closest level of one drawing went from 10,657 characters to 408 —
 * and two pictures fell by 51 per cent. The guard flagged them, correctly, and then could not be
 * told. Every run after that would have flagged the same two pictures for ever, and a check that
 * cries wolf on every run is one people stop reading.
 *
 * So a fall can be accepted, and accepting one COSTS A SENTENCE:
 *
 *     node tools/review.mjs --expected "the graph now draws far less on purpose, see CAF-5"
 *
 * The reason is printed beside every drop and written into referenceFile, the file of what each page
 * drew last time, next to the new counts, so a year later the file itself says who decided the fall
 * was fine and why. An acceptance with no reason is refused, because an empty reason is the same as
 * silence.
 */
function whyTheFallWasExpected() {
  const at = process.argv.indexOf('--expected')
  if (at === -1) return null
  const why = (process.argv[at + 1] ?? '').trim()
  if (why === '' || why.startsWith('--')) {
    console.error(
      'review: --expected needs a reason in words, and it is not optional. The reason is written into ' +
        `${relative(root, referenceFile)} beside the new counts, so that a year from now the file says why a page ` +
        'started drawing less. Try: --expected "the graph draws far less on purpose, see CAF-5".',
    )
    process.exit(1)
  }
  return why
}

/**
 * Every picture that drew far less than the same picture drew last time.
 *
 * Only text nodes are compared. Drawn height moves with the corpus and with the window; the boxes
 * count moves when a component is restructured without losing anything a reader can see. The number
 * of things with words on them is the one that falls when a page stops drawing a part of itself.
 */
function droppedSinceLastRun(shots, previous) {
  if (previous === null) return []
  const dropped = []
  for (const shot of shots) {
    // The proof pictures are of one canvas element rather than of a page, so they have no content
    // census and are not compared. They are named on the sheet under their own headings.
    const content = shot.content ?? null
    if (content === null || !content.found) continue
    const was = previous.pictures[pictureKey(shot)]
    if (typeof was !== 'number') continue
    const now = content.texts
    if (now >= was * DROP_RATIO || was - now < DROP_MIN_NODES) continue
    dropped.push({ shot, was, now })
  }
  return dropped
}

// ---------------------------------------------------------------------------- child processes

/** Everything this script started, so the `finally` can stop all of it whatever went wrong. */
const started = []

/**
 * Start a child in its own process GROUP, keeping its output for the error message.
 *
 * `detached: true` makes the child a group leader, so anything it starts in turn -- and tsx does
 * start a second node process -- lands in the same group and dies with one signal to `-pid`. That
 * is the difference between stopping a service and leaving half of it running.
 */
function start(label, command, args, env) {
  const child = spawn(command, args, { cwd: root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const service = { label, child, log: [], startError: null }
  const keep = (chunk) => {
    for (const line of String(chunk).split('\n')) {
      if (line.trim() !== '') service.log.push(line)
    }
    // Only the last stretch is ever read, and a chatty dev server would otherwise grow forever.
    if (service.log.length > 200) service.log.splice(0, service.log.length - 200)
  }
  child.stdout.on('data', keep)
  child.stderr.on('data', keep)
  // A command that does not exist never exits, so it would otherwise be waited on for the full
  // ready timeout. Recorded here and checked by the waiter, which then says what actually happened.
  child.on('error', (err) => {
    service.startError = `could not start ${command}: ${err.message}`
    service.log.push(service.startError)
  })
  started.push(service)
  return service
}

/** Stop one service by killing its whole process group, and say so if it had to be forced. */
async function stopGroup(service) {
  const { child } = service
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return
  const signal = (sig) => {
    try {
      process.kill(-child.pid, sig)
      return true
    } catch (err) {
      // ESRCH means the group is already gone, which is the outcome we wanted.
      if (err.code === 'ESRCH') return false
      throw err
    }
  }
  if (!signal('SIGTERM')) return
  const exited = await Promise.race([once(child, 'exit').then(() => true), sleep(GRACE_MS).then(() => false)])
  if (exited) return
  console.warn(`review: ${service.label} ignored SIGTERM after ${GRACE_MS}ms, killing the group`)
  signal('SIGKILL')
  await Promise.race([once(child, 'exit'), sleep(GRACE_MS)])
}

/**
 * Wait until a service answers, or fail with what it said while not answering.
 *
 * A child that has already exited is not waited for: the whole timeout would be spent polling a
 * port nobody will ever open, and the log below already says why it died.
 */
async function waitUntilReady(service, url, accept) {
  const deadline = Date.now() + READY_TIMEOUT_MS
  let last = 'nothing has been tried yet'
  while (Date.now() < deadline) {
    if (service.startError !== null) throw new Error(`review: ${service.label} never ran — ${service.startError}`)
    if (service.child.exitCode !== null || service.child.signalCode !== null) {
      throw new Error(
        `review: ${service.label} exited before it was ready ` +
          `(code ${service.child.exitCode}, signal ${service.child.signalCode}).\n${service.log.join('\n')}`,
      )
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2_000) })
      if (await accept(res)) return
      last = `answered ${res.status}`
    } catch (err) {
      last = err.message
    }
    await sleep(250)
  }
  throw new Error(
    `review: ${service.label} did not become ready at ${url} within ${READY_TIMEOUT_MS}ms ` +
      `(last attempt: ${last}).\n${service.log.join('\n')}`,
  )
}

/** Run a command to completion, failing loudly with its output. Used for the seed. */
async function run(label, command, args, env) {
  const child = spawn(command, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
  const out = []
  child.stdout.on('data', (c) => out.push(String(c)))
  child.stderr.on('data', (c) => out.push(String(c)))
  // A command that cannot be started never emits `exit`, so waiting only for that would hang
  // until somebody noticed. `error` is the other way this ends and it is waited for too.
  const ended = await Promise.race([
    once(child, 'exit').then(([code]) => ({ code })),
    once(child, 'error').then(([err]) => ({ err })),
  ])
  if (ended.err !== undefined) throw new Error(`review: ${label} could not be started: ${ended.err.message}`)
  if (ended.code !== 0) throw new Error(`review: ${label} failed with exit code ${ended.code}.\n${out.join('')}`)
  return out.join('')
}

// ---------------------------------------------------------------------------- photographing a canvas

/**
 * Make a page that holds a canvas safe to photograph, and say what was done.
 *
 * WHY THIS EXISTS, AND IT IS NOT A TIDINESS. Every picture this tool took of the pipeline drawing
 * showed the same thing: three cards heaped on top of each other in the top-left corner, at 100%,
 * under the words "Working out where 17 cards go…". Read as a review of the product that is a
 * damning picture — the drawing does not work. It was the CAMERA. The page had drawn correctly in
 * 73ms and was sitting there finished; the act of taking a full-page screenshot broke it.
 *
 * The mechanism, measured rather than guessed. A full-page screenshot in Chromium is taken by
 * overriding the device metrics so the whole scroll height is "the viewport", capturing, and putting
 * them back. During that override the page's media queries are re-evaluated, and
 * `(max-width: 480px)` matches for an instant even though `innerWidth` never leaves 1440.
 * `StructureView` reads that query to decide whether a phone gets the reading layer instead of the
 * canvas, so for that instant the canvas is UNMOUNTED — and when the query flips back it is built
 * again from nothing: measure the cards, ask ELK, place them. The shutter opens partway through
 * that rebuild. The modules drawing survived it only because its layout takes 7ms and it beat the
 * shutter; the pipeline drawing takes 73ms and never did.
 *
 * The fix is to leave the camera nothing to resize: make the viewport as tall as the page BEFORE
 * the capture, so `fullPage` is already a plain viewport shot and no override happens. Then wait
 * for the canvas to say `drawn` in its own attribute, which is the page's own word for "finished"
 * and the same one the derived-layout check waits on.
 *
 * ONLY FOR PAGES THAT HOLD A CANVAS. Every other page is photographed exactly as before. Resizing
 * the window is not free — `.gx-canvas` falls back to `min(72vh, 760px)` until ELK answers — so it
 * is done where it buys a true picture and nowhere else.
 *
 * IT THROWS IF THE CANVAS NEVER SETTLES. A drawing that is genuinely stuck must fail this run and
 * be named, not be quietly photographed mid-flight and left for a person to misread as a design
 * fault. That is the same mistake, once removed.
 */
async function settleAnyCanvas(tab, viewport) {
  const has = await tab.evaluate(() => document.querySelector('.gx-canvas-wrap') !== null)
  if (!has) return null

  const drawn = '.gx-canvas-wrap[data-state="drawn"]'
  await tab.waitForSelector(drawn, { timeout: 30_000 })
  const tall = await tab.evaluate(() => document.documentElement.scrollHeight)
  // Only ever grow, and only when there is something to grow into. A page shorter than the window
  // needs no override in the first place.
  if (tall > viewport.height) {
    await tab.setViewportSize({ width: viewport.width, height: tall })
    // The taller window re-lays the page out, which can change the height again; the canvas is what
    // has to be settled, so it is what is waited on.
    await tab.waitForSelector(drawn, { timeout: 30_000 })
  }
  // Past the opening-view animation, with room to spare.
  await tab.waitForTimeout(900)
  const state = await tab.evaluate(() => document.querySelector('.gx-canvas-wrap')?.getAttribute('data-state'))
  if (state !== 'drawn') {
    throw new Error(
      `the canvas on this page said "${state}" rather than "drawn" when the picture was taken, so the ` +
        `photograph would have shown a drawing mid-layout rather than the drawing.`,
    )
  }
  return `canvas settled, window grown to ${viewport.width}×${tall} so the capture had nothing to resize`
}

// ---------------------------------------------------------------------------- derived, not stored

/**
 * PROVE THE SESSIONS PANEL ACTUALLY LOADS, on both surfaces that draw it.
 *
 * WHY A SCREENSHOT WAS NOT ENOUGH, AND THIS IS. The sessions panel sat in its loading skeleton for
 * ever, on Home and on /sessions, and this review photographed the skeleton without complaint: a
 * picture of a skeleton is a valid picture. Every request answered 200 in under 70 ms, there was no
 * page error and nothing in the console. The cause was a `live` ref that StrictMode left false, so
 * every reply was discarded as one that had arrived after the reader navigated away — see
 * `armMounted` in src/web/components/ui.tsx.
 *
 * Nothing in the vitest suite could see it: the environment is `node`, and the browser components
 * are rendered with `renderToStaticMarkup`, which never runs an effect. tests/mounted-flag.test.ts
 * covers the mechanism; only a real browser can say whether the panel on the page left its skeleton.
 *
 * So this loads both addresses, waits, and asserts the panel is NOT still loading and that rows
 * really arrived. Then it fails `GET /api/sessions` on purpose and asserts the panel says so and
 * offers a retry — because "cannot read sessions" becoming either an eternal skeleton or an empty
 * list are the two failures this panel must never have.
 *
 * Reported rather than thrown, like the other proofs here: the run still produces its pictures.
 */
/**
 * THE PHONE DRAWER KEEPS THE KEYBOARD, AND GIVES IT BACK.
 *
 * At 390px the sidebar is a drawer over a scrim, and a thing covering the page owes a keyboard two
 * behaviours: while it is open, Tab stays inside it; when it closes, focus returns to whatever
 * opened it. An independent accessibility review found both missing by counting key presses --
 * **Tab 21 walked out of the drawer** into content the scrim had already declared unavailable, and
 * Escape dropped focus on the body so the next Tab restarted at the top of the document.
 *
 * It is proved here rather than in a unit test because it is not a property of the markup: it is a
 * property of what a real browser does with a real Tab press, and `.focus()` in a test would move
 * focus without ever exercising the thing that was broken.
 */
async function proveDrawerKeepsTheKeyboard(browser) {
  const context = await reviewContext(browser, { width: 390, height: 844 }, 'light', 1, theBrowsersFixedInstant)
  const tab = await context.newPage()
  const problems = []
  try {
    await tab.goto(`http://127.0.0.1:${webPort}/#/`)
    await waitForReviewPage(tab)
    await tab.waitForTimeout(1500)
    const menu = tab.locator('.shell-menu')
    if ((await menu.count()) === 0) return 'NOT PROVED -- there is no menu button at 390px, so no drawer was opened.'
    await menu.click()
    await tab.waitForTimeout(400)

    const outside = async () =>
      tab.evaluate(() => {
        const drawer = document.getElementById('shell-side')
        return drawer === null || !drawer.contains(document.activeElement)
      })

    // Forty presses is about twice round the rail, which is enough to reach whatever the browser
    // thinks the last stop is however the disclosures happen to be sitting.
    let escapes = 0
    for (let i = 0; i < 40; i += 1) {
      await tab.keyboard.press('Tab')
      if (await outside()) escapes += 1
    }
    if (escapes > 0) problems.push(`focus left the drawer on ${escapes} of 40 Tab presses`)

    await tab.keyboard.press('Escape')
    await tab.waitForTimeout(400)
    const back = await tab.evaluate(() => {
      const el = document.activeElement
      return { onBody: el === document.body, text: (el?.textContent ?? '').trim().slice(0, 20) }
    })
    if (back.onBody) problems.push('Escape left focus on the body instead of returning it to the menu button')
    else if (!/menu/i.test(back.text)) problems.push(`Escape returned focus to "${back.text}" rather than to the menu button`)
  } finally {
    await context.close()
  }
  return problems.length === 0
    ? 'PROVED -- Tab stays inside the open drawer over 40 presses, and Escape gives focus back to the menu button.'
    : `NOT PROVED -- ${problems.join('; ')}.`
}

/**
 * WHERE THE CANVAS PROOFS AND THE MODULES' CASE PICTURE LOOK: the project drawing, at its own address.
 *
 * Since 29 September 2026 (904d459a8, wave 13j's round 11, "The family lists draw one design")
 * `#/pipeline` is the list of pipelines, with a card that links to the drawing, and the drawing of
 * every module is the pipelines page's address with PIPELINE_DRAWING_SEGMENT after it. The two
 * canvas proofs and the modules' case picture still opened `#/pipeline`, waited 30 seconds for a
 * canvas that page no longer draws, and answered NOT PROVED on every run since (problem
 * OEt2jBpK3Glq, which wave 13j measured in round 27b). Read out of src/shared/addresses.ts, as the
 * other segments are, so the next move of the drawing breaks this loudly instead of quietly.
 *
 * @param {string} routerSource addresses.ts and router.tsx, as main() reads them.
 * @param {string} pipelineAddress the pipelines page's own address, from FLAT_ROUTES.
 * @returns {string}
 */
export function theProjectDrawingAddress(routerSource, pipelineAddress) {
  return `${pipelineAddress}/${segmentFrom(routerSource, 'PIPELINE_DRAWING_SEGMENT', addressesFile, 'the project drawing')}`
}

/**
 * THE MODE A DEVELOPER READS IN, as the address names it. `inspect` is the stored word that
 * `?mode=inspect` carries (src/shared/mode.ts says screenshots and tests name it, and that it does
 * not change); the switch says "Developer". Checked against MODES, so a renamed word stops this
 * tool rather than photographing the normal page in its place.
 */
export const DEVELOPER_MODE = 'inspect'

/**
 * WHERE THE SESSIONS PROOF READS THE SESSIONS: the sessions page, and nowhere else.
 *
 * From 29 September 2026 (c42764f0a) Home drew a sessions block for a developer, and this proof read it there. On
 * 10 October Home stopped drawing sessions at all (c2414ce9d), as a decision says. The proof
 * failed on every run after, looking for rows that had been taken away on purpose (wave 13t round 34).
 *
 * @returns {{address: string, label: string}[]}
 */
export function theSessionsProofAddresses() {
  return [{ address: '#/sessions', label: 'the sessions page' }]
}

/**
 * WHERE THE PROOF READS A FAILING SESSIONS API: the sessions page as a developer sees it. Since decision z_A0xVMbWOzh
 * (55368cc68, 5 October 2026) the server's own words about a fault are drawn only in Developer mode, and in normal mode
 * the page says the general sentence instead. `?mode=inspect` before the hash is read for one page load and not saved
 * (src/web/lib/mode.ts). Checked against MODES, so a renamed word stops this tool rather than reading the normal page.
 *
 * @returns {string}
 */
export function theSessionsFailureAddress() {
  if (!MODES.includes(DEVELOPER_MODE)) {
    throw new Error(
      `review: src/shared/mode.ts no longer has the mode "${DEVELOPER_MODE}" (it has ${MODES.join(', ')}), so ` +
        'the sessions page cannot be opened as a developer sees it. Say the new word here.',
    )
  }
  return `?mode=${DEVELOPER_MODE}#/sessions`
}

async function proveSessionsLoad(browser, addresses, failureAddress) {
  const context = await reviewContext(browser, { width: 1440, height: 1000 }, 'light', 1, theBrowsersFixedInstant)
  const tab = await context.newPage()
  const problems = []

  /** Load an address, let it settle, and say what the sessions panel is showing. */
  const readPanel = async (address) => {
    await tab.goto(`http://127.0.0.1:${webPort}/`, { waitUntil: 'load' })
    await tab.goto(`http://127.0.0.1:${webPort}/${address}`)
    await waitForReviewPage(tab)
    // The panel re-reads on its own; four seconds is far longer than a loopback read needs and
    // still short enough that a genuinely stuck panel is reported rather than waited out.
    await tab.waitForTimeout(4000)
    const text = await tab.evaluate(() => document.body.innerText)
    // THE READING'S STAMP, found by its place on the page and not by its words. The words it was found by, "read at",
    // became "Last checked at", and a state word was no proof either: "0 orphaned" is drawn before any row arrives.
    const stamped = await tab.evaluate(() => document.querySelector('.sx-read-at') !== null)
    return {
      stuck: /loading sessions/i.test(text),
      loaded: stamped,
      text,
    }
  }

  for (const { address, label } of addresses) {
    const seen = await readPanel(address)
    if (seen.stuck) problems.push(`${label} is still showing the loading skeleton`)
    else if (!seen.loaded) problems.push(`${label} left the skeleton but shows no session rows and no reading stamp`)
  }

  // AND THE FAILURE PATH. A panel that cannot report a failure will report the next one as silence.
  await tab.route('**/api/sessions*', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'the sessions store is unavailable (review check)' }),
    }),
  )
  const failed = await readPanel(failureAddress)
  const retry = await tab.evaluate(() =>
    [...document.querySelectorAll('button')].some((b) => /again|retry/i.test(b.textContent ?? '')),
  )
  if (failed.stuck) problems.push('a failing sessions API leaves the panel loading for ever')
  if (!/unavailable \(review check\)/.test(failed.text)) {
    problems.push("a failing sessions API does not show the server's own words to a developer")
  }
  if (!retry) problems.push('a failing sessions API offers no way to try again')

  await context.close()
  return problems.length === 0
    ? "PROVED — sessions load on /sessions with the reading's stamp, and a failing API shows a developer the server's own words and a retry rather than loading for ever."
    : `NOT PROVED — ${problems.join('; ')}.`
}

/**
 * Prove in three pictures that nobody positions anything.
 *
 * THE CLAIM THE GRAPH MAKES. Every coordinate on the canvas is worked out on each draw from the
 * records alone, and no field anywhere holds an x or a y. A claim like that is cheap to write in a
 * comment and it decays quietly: the day somebody adds a "position" column to make one picture
 * tidier, every sentence about the split is still there and every one of them is wrong.
 *
 * So this measures it. Photograph the drawing; add a real `blocks` link between two modules through
 * the ordinary API, exactly as an agent would; photograph it again; delete the link; photograph it a
 * third time. The layout is derived if and only if the middle picture DIFFERS from the first and the
 * last is THE SAME as it. Both are counted by `theCanvasesDiffer` (wave 13y round 53), so an edge
 * blend drawn differently is not a change in either half. Nothing was pressed to move a card and
 * nothing was saved to put one back.
 *
 * The verdict is reported rather than thrown. This script's job is pictures, and a run that produced
 * thirty-two good ones should not end with no contact sheet because a canvas settled a frame late —
 * the sheet says what happened either way, and all three pictures are on it to be looked at.
 */
async function proveLayoutIsDerived(browser, records, shots, pageAddress) {
  const modules = records.filter((r) => r.kind === 'module')
  if (modules.length < 2) {
    return 'NOT PROVED — fewer than two modules are on file, so no link could be added and the claim was never tested.'
  }
  // Two ends chosen by sorted id, so the same seed always exercises the same pair and two runs of
  // this script can be compared with each other.
  const sorted = [...modules].sort((a, b) => (a.id < b.id ? -1 : 1))
  const from = sorted[0]
  const to = sorted[sorted.length - 1]

  const context = await reviewContext(browser, { width: 1440, height: 1000 }, 'light', 1, theBrowsersFixedInstant)
  const tab = await context.newPage()
  const url = `http://127.0.0.1:${webPort}/${pageAddress}`

  /** Load the page, wait for ELK to have answered, and photograph the canvas ALONE. */
  const shoot = async (name, caption) => {
    name = name.replace(/\.png$/, '-light-F.png')
    // A REAL RELOAD, and the blank page in front of it is what makes it one. Every address in this
    // app is a hash address, and a browser told to go to a URL that differs from the current one
    // only after the `#` does a same-document navigation: no fetch, no re-mount, nothing re-read.
    // The first version of this check went straight to the same URL three times, photographed the
    // same never-reloaded page three times, and reported that adding a link had changed nothing.
    await tab.goto('about:blank')
    await tab.goto(url, { timeout: 30_000 })
    await waitForReviewPage(tab, 30_000)
    // The canvas says what it is doing in its own attribute. Waiting on the words rather than on a
    // timeout is what makes the three pictures comparable: a shot taken while ELK was still working
    // would differ from the others for a reason that has nothing to do with the link.
    await tab.waitForSelector('.gx-canvas-wrap[data-state="drawn"]', { timeout: 30_000 })
    // Past the 220ms fitView animation, with room to spare.
    await tab.waitForTimeout(900)
    // The canvas element only. The line under it prints how many milliseconds the layout took, and
    // that number is different every run — including it would make every comparison fail for a
    // reason that is not the layout.
    await waitForReviewPage(tab)
    const notSettled = await waitForReviewSettled(tab, name, () =>
      tab.locator('.gx-canvas').screenshot({ path: join(outDir, name) }))
    const bytes = readFileSync(join(outDir, name))
    shots.push({
      page: 'the layout is derived, not stored',
      address: `${pageAddress} — ${caption}`,
      theme: caption,
      look: 'light',
      width: 1440,
      viewportHeight: 1000,
      height: null,
      file: name,
      notSettled,
      error: null,
      console: [],
    })
    return { file: name, png: bytes, hash: createHash('sha256').update(bytes).digest('hex').slice(0, 12) }
  }
  // Two of the pictures above, measured against each other.
  const compare = (one, two) => ({ one, two, ...theCanvasesDiffer(one.png, two.png) })

  try {
    const before = await shoot('derived-1-before.png', 'before')
    const created = await fetch(`http://127.0.0.1:${apiPort}/api/links`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fromId: from.id, toId: to.id, type: 'blocks', gate: { kind: 'hard' } }),
    })
    if (!created.ok) return `NOT PROVED — the link could not be added (${created.status}), so the claim was never tested.`
    const { id: linkId } = await created.json()

    const withLink = await shoot('derived-2-with-a-new-link.png', 'with one more stored link')
    const removed = await fetch(`http://127.0.0.1:${apiPort}/api/links/${encodeURIComponent(linkId)}`, {
      method: 'DELETE',
      headers: { 'x-mole-office-workspace': 'default' },
    })
    if (!removed.ok) {
      return `NOT PROVED — the link was added and could not be removed again (${removed.status}), so the third picture is missing and the claim is only half tested. The database is a throwaway, so nothing real was left behind.`
    }
    const after = await shoot('derived-3-link-removed.png', 'after removing it')

    const linkAdded = compare(before, withLink)
    const linkRemoved = compare(before, after)
    const unmeasured = [linkAdded, linkRemoved].find((both) => !both.compared)
    const moved = linkAdded.compared && linkAdded.differ
    const returned = linkRemoved.compared && !linkRemoved.differ
    const verdict = unmeasured !== undefined
      ? `NOT PROVED — the canvases could not be compared: ${unmeasured.one.file} against ${unmeasured.two.file}: ${unmeasured.why}.`
      : moved && returned
        ? 'PROVED — adding one stored `blocks` link redrew the canvas, and removing it gave back the same canvas by the measure below. No position was set by hand and none was saved.'
        : !moved
          ? 'NOT PROVED — adding a stored link changed nothing on the canvas, which means either the drawing did not re-read the records or the link was not drawn.'
          : 'NOT PROVED — the canvas came back different after the link was removed, so the picture is not a pure function of the records.'
    console.log(`review: derived layout — ${verdict}`)
    return (
      `${verdict} Link: “${from.title}” blocks “${to.title}”, hard. ` +
      `Canvas fingerprints ${before.hash} → ${withLink.hash} → ${after.hash}. ` +
      `Canvases compared, ${CANVAS_MEASURE_SAID}: before against with the link, ${theComparisonSaid(linkAdded)}; ` +
      `before against after removing it, ${theComparisonSaid(linkRemoved)}.`
    )
  } catch (err) {
    return `NOT PROVED — the check could not be run: ${err.message.split('\n')[0]}`
  } finally {
    await context.close()
  }
}

/**
 * PRESS `Fit all`, OR SAY WHY THERE WAS NOTHING TO PRESS — and never hang on it.
 *
 * WHY THIS EXISTS. `Fit all` is a `DrawingControl`, and a DrawingControl REFUSES when the drawing is
 * already in the state the press would set. It refuses in place: it keeps the button, keeps its
 * words, and marks it `aria-disabled="true"` (src/web/components/graph/controls.tsx, the `plain`
 * branch). Playwright counts `aria-disabled="true"` as not enabled — `getAriaDisabled()` is
 * `isNativelyDisabled() || hasExplicitAriaDisabled()`, and `.click()` waits for the enabled state —
 * so an unconditional click waits for a button that will never become clickable and throws at the
 * 30-second default.
 *
 * That one wait was the whole of why this tool exited 1 twice over on 14 September 2026, on a run
 * that had taken all 342 of its pictures: the graph cases answered `NOT TAKEN … locator.click:
 * Timeout 30000ms exceeded` and the presentation-intent proof answered `NOT PROVED — the check could
 * not be run: locator.click: Timeout 30000ms exceeded`. Two red lines, one cause. Problem
 * olLWy6VcA-QD. THE PAGE WAS RIGHT AND THIS TOOL WAS WRONG: it pressed a control that had already
 * done the thing it is for, and read the refusal as a failure.
 *
 * A REFUSAL HERE LOSES NO EVIDENCE, which is why this does not skip the picture. When `Fit all`
 * refuses on a drawn canvas, that canvas IS already showing the whole drawing, so the picture taken
 * next is the whole shape. What changes is the sentence under it, and the caller writes it: "the
 * whole shape, after pressing Fit all" and "the whole shape, which is where this drawing opens" are
 * two different facts about a drawing and must not be photographed under one caption.
 *
 * THE CALLER MUST ALREADY HAVE WAITED for the drawing to be drawn, and every caller does: for
 * `.gx-canvas-wrap[data-state="drawn"]`, or for the lanes a pipeline's page draws in place of the
 * canvas, shown, with their `data-drawn-links`. That is load-bearing: a DrawingControl has a second
 * way to refuse — the drawing not being laid out yet, which is a missing prerequisite and not a state
 * already reached — and waiting for `drawn` rules it out. The lanes' `Fit all` has no such second
 * way: until the lanes are first drawn it says it is already there. The page sets the lanes' size and
 * their fit as it shows them, and the caller waits 900 ms after they are shown. So a refusal reaching
 * this function means "already showing the whole drawing" and nothing else. If that ever stops being
 * true, this comment is the thing that is wrong.
 *
 * MEASURED, 15 September 2026, two runs of this tool on a quiet machine, kept under
 * ~/.cache/mole-office/handback-shots/testing/. Without this function: exit 1, one graph picture of
 * four taken, both proofs dead on `locator.click: Timeout 30000ms exceeded`. With it: all four graph
 * pictures taken, 349 of 349 pictures, and the sheet says which drawing refused — "1 of these
 * drawings were already showing their whole shape … : cases-modules". So the refusal is real and it
 * happens on an ordinary corpus; this is not a guard against something imagined.
 */
async function pressFitAll(tab) {
  const button = tab.getByRole('button', { name: 'Fit all' })
  await button.waitFor({ state: 'visible', timeout: 30_000 })
  if ((await button.getAttribute('aria-disabled')) === 'true') {
    return {
      pressed: false,
      why: 'this drawing already showed its whole shape at the size it opens, so `Fit all` refused and there was nothing to press',
    }
  }
  await button.click()
  await tab.waitForTimeout(600)
  return { pressed: true, why: null }
}

// ---------------------------------------------------------------------------- the graph behaviours

/**
 * The two drawings the graph pictures can be of: what says each one is drawn, the element that is
 * the drawing, and the name of its picture as it opens. The drawing of every module is a canvas. A
 * pipeline's page has drawn lanes in place of the canvas since wave 13u round 230. The lanes are
 * marked drawn while they are still hidden, and the wait is for a shown element, so it holds until
 * they are on the page. They open at the size the page fits them to, which need not be reading
 * size, so that picture is named for the size it opens at.
 */
const GRAPH_DRAWINGS = {
  canvas: { drawn: '.gx-canvas-wrap[data-state="drawn"]', element: '.gx-canvas', opens: 'reading-size' },
  lanes: { drawn: '[data-drawing="lanes"][data-drawn-links]', element: '[data-drawing="lanes"]', opens: 'as-it-opens' },
}

/**
 * One picture per thing the drawing is supposed to be able to do.
 *
 * WHY IT IS NOT ENOUGH TO PHOTOGRAPH THE PAGE. The canvas opens at READING SIZE and shows about a
 * fifth of a twelve-step pipeline, so the branch is on screen and the rejoin three screens to the
 * right. A page shot proves a card can be read and proves nothing about the shape of the graph. So
 * the shape gets its own picture, taken with `Fit all` pressed — small type on purpose, because what
 * is being checked there is whether two lines leave one card and three arrive at another, not
 * whether a word can be read.
 *
 * Both are wanted and neither replaces the other, which is why this takes two of each drawing rather
 * than picking one. The drawing's own element alone is photographed, not the page, so the picture is
 * the drawing: the canvas, or the lanes a pipeline's page draws in its place. See `GRAPH_DRAWINGS`.
 */
async function photographGraphCases(browser, shots, addresses) {
  const context = await reviewContext(browser, { width: 1440, height: 1000 }, 'light', 2, theBrowsersFixedInstant)
  const tab = await context.newPage()
  const taken = []
  const alreadyWhole = []
  try {
    for (const { address, name, what } of addresses) {
      await tab.goto('about:blank')
      await tab.goto(`http://127.0.0.1:${webPort}/${address}`, { timeout: 30_000 })
      await waitForReviewPage(tab, 30_000)
      const { canvas, lanes } = GRAPH_DRAWINGS
      await tab.waitForSelector(`${canvas.drawn}, ${lanes.drawn}`, { timeout: 30_000 })
      const drawing = (await tab.locator(lanes.drawn).count()) > 0 ? lanes : canvas
      await tab.waitForTimeout(900)

      const add = async (file, caption) => {
        file = file.replace(/\.png$/, '-light-F.png')
        await waitForReviewPage(tab)
        const notSettled = await waitForReviewSettled(tab, file, () =>
          tab.locator(drawing.element).screenshot({ path: join(outDir, file) }))
        shots.push({
          page: 'what the drawing can do',
          address: `${address} — ${caption}`,
          theme: caption,
          look: 'light',
          width: 1440,
          viewportHeight: 1000,
          height: null,
          file,
          notSettled,
          error: null,
          console: [],
          canvas: what,
        })
        taken.push(file)
      }

      await add(`${name}-${drawing.opens}.png`, `${what}, at the size it opens`)
      // `Fit all` is a named button rather than a state the page lands in, so pressing it is the
      // only way to see the whole shape — and the whole shape is what half of these cases ARE.
      // Unless the drawing is already showing all of it, in which case the button refuses and
      // there is nothing to press. See `pressFitAll`.
      const fit = await pressFitAll(tab)
      if (!fit.pressed) alreadyWhole.push(name)
      await add(`${name}-fit-all.png`, fit.pressed ? `${what}, whole shape` : `${what}, whole shape — ${fit.why}`)
    }
    return (
      `TAKEN — ${taken.length} pictures: ${taken.join(', ')}` +
      (alreadyWhole.length === 0
        ? ''
        : `. ${alreadyWhole.length} of these drawings were already showing their whole shape, so \`Fit all\` refused and was not pressed: ${alreadyWhole.join(', ')}. Those whole-shape pictures are the drawing as the page opens it, which is the same picture and not the same fact.`)
    )
  } catch (err) {
    return `NOT TAKEN — the graph behaviour pictures could not all be taken (${taken.length} of them were): ${err.message.split('\n')[0]}`
  } finally {
    await context.close()
  }
}

// ---------------------------------------------------------------------------- presentation intent

/** A pixel differs when a channel differs by more than this many levels (wave 13y round 52). */
export const CANVAS_LEVELS = 8
/** Two canvases differ when more than one pixel in this many differs: 0.5%. */
export const CANVAS_ONE_IN = 200

/**
 * WHETHER TWO CANVASES DIFFER, MEASURED, with the counts (wave 13y round 52).
 *
 * A fingerprint of the file calls two canvases different when one pixel moved by one level. Round
 * 43 measured one arrangement drawn twice: an edge blend changed 426 pixels by 1 level. A real
 * change of arrangement changed 111,616 pixels by up to 228 levels. So two canvases differ here when
 * more than 0.5% of their pixels differ by more than 8 levels. A pixel's difference is the largest
 * of its channels', and a picture without opacity is opaque. Canvases of two sizes differ, and a
 * picture that cannot be read is not compared, and the answer says which and why.
 */
export function theCanvasesDiffer(first, second) {
  const pictures = [thePixelsOfAPng(first), thePixelsOfAPng(second)]
  const unread = pictures.findIndex((one) => !one.read)
  if (unread !== -1) {
    return { compared: false, why: `the ${unread === 0 ? 'first' : 'second'} picture could not be read: ${pictures[unread].why}` }
  }
  const [a, b] = pictures
  if (a.width !== b.width || a.height !== b.height) {
    return { compared: true, differ: true, said: `the two canvases are ${a.width} by ${a.height} and ${b.width} by ${b.height} pixels` }
  }
  const pixels = a.width * a.height
  let differing = 0
  let overLevels = 0
  let largest = 0
  for (let at = 0; at < pixels; at += 1) {
    let most = 0
    for (let channel = 0; channel < 4; channel += 1) {
      const one = channel < a.channels ? a.pixels[at * a.channels + channel] : 255
      const two = channel < b.channels ? b.pixels[at * b.channels + channel] : 255
      most = Math.max(most, Math.abs(one - two))
    }
    if (most > 0) differing += 1
    if (most > CANVAS_LEVELS) overLevels += 1
    largest = Math.max(largest, most)
  }
  return {
    compared: true,
    differ: overLevels * CANVAS_ONE_IN > pixels,
    pixels,
    differing,
    overLevels,
    largest,
    said: `${differing} of ${pixels} pixels differ, ${overLevels} by more than ${CANVAS_LEVELS} levels, the largest by ${largest}`,
  }
}

/** The measure in words, as both canvas proofs print it before their counts (wave 13y round 53). */
export const CANVAS_MEASURE_SAID = `counting two as different when more than ${100 / CANVAS_ONE_IN}% of their pixels differ by more than ${CANVAS_LEVELS} levels`

/** What a line says of one answer of `theCanvasesDiffer`: the counts and the answer, or why there was none. */
export function theComparisonSaid(both) {
  return both.compared ? `${both.said}, so ${both.differ ? 'different' : 'the same'}` : `not compared: ${both.why}`
}

/**
 * WHAT THE OFFICE GAVE BACK OF AN ARRANGEMENT, CARD BY CARD (wave 13y round 52). The lane, the
 * order and the emphasis of each card sent are compared with the ones read back, and a value not
 * there is nothing. `said` names each card and value that did not come back as sent.
 */
export function theArrangementReadBack(sent, back) {
  const show = (value) => (value === null ? 'nothing' : JSON.stringify(value))
  const cards = Object.entries(sent).map(([id, asked]) => {
    const kept = back?.[id] ?? null
    const fields = ['lane', 'order', 'emphasis'].map((field) => ({ field, sent: asked[field] ?? null, back: kept?.[field] ?? null }))
    return { id, fields, same: fields.every((one) => one.sent === one.back) }
  })
  const wrong = cards.filter((card) => !card.same)
  return {
    same: wrong.length === 0,
    cards,
    said:
      wrong.length === 0
        ? `the store gave back the lane, order and emphasis sent for all ${cards.length} cards`
        : wrong
            .map((card) => `${card.id}: ${card.fields.filter((one) => one.sent !== one.back).map((one) => `${one.field} ${show(one.sent)} was sent and ${show(one.back)} came back`).join(', ')}`)
            .join('; '),
  }
}

/**
 * Prove that stored presentation intent reaches the drawing, survives a reload, and stops at the
 * boundary — in pictures and in the server's own words.
 *
 * FOUR CLAIMS AND ONE PICTURE FOR EACH. The middle layer of this product says an agent can write
 * how a structure should be shown, in meaning rather than in geometry, and that Mole Office will honour
 * what it can and SAY what it could not. All four halves of that are cheap to assert in a comment:
 *
 *   1. an intent set through the API CHANGES THE DRAWING — photographed as TWO arrangements that
 *      differ from each other, rather than as one arrangement against whatever the corpus started
 *      as. See the note further down on why that distinction is the whole of this proof's honesty.
 *      The two canvases are counted as different by `theCanvasesDiffer`, not by a fingerprint;
 *   2. it SURVIVES A RELOAD: what the office gives back after the reload is the lane, order and
 *      emphasis sent, so it was stored and not held in a tab (`theArrangementReadBack`);
 *   3. drawing geometry is REFUSED BY NAME, with the explanation, rather than being quietly ignored
 *      or quietly kept — and the ONE place a node may keep, an x and a y together, is stored and
 *      read back. The owner lifted the ban on a node's position on 6 September 2026 (criterion D19;
 *      src/shared/presentation.ts quotes them), so a proof that asked for a 4xx on x and y would
 *      assert the rule they voided and could never pass against correct code;
 *   4. an arrangement the canvas CANNOT show is said out loud under the drawing, naming the card.
 *
 * The requests are the ordinary ones an agent would send. Nothing here presses a control except
 * `Fit all`: what is sent is a lane, an order and an emphasis, a geometry key the door refuses, and
 * a place it keeps.
 */
async function provePresentationIntent(browser, records, shots, pageAddress) {
  const modules = records.filter((r) => r.kind === 'module')
  if (modules.length < 3) {
    return 'NOT PROVED — fewer than three modules are on file, so no arrangement was worth storing and the claim was never tested.'
  }

  const context = await reviewContext(browser, { width: 1440, height: 1000 }, 'light', 1, theBrowsersFixedInstant)
  const tab = await context.newPage()
  const url = `http://127.0.0.1:${webPort}/${pageAddress}`
  const api = `http://127.0.0.1:${apiPort}/api/presentation/structure`

  const shoot = async (file, caption) => {
    file = file.replace(/\.png$/, '-light-F.png')
    await tab.goto('about:blank')
    await tab.goto(url, { timeout: 30_000 })
    await waitForReviewPage(tab, 30_000)
    await tab.waitForSelector('.gx-canvas-wrap[data-state="drawn"]', { timeout: 30_000 })
    await tab.waitForTimeout(900)
    await waitForReviewPage(tab)
    const notSettled = await waitForReviewSettled(tab, file, () =>
      tab.locator('.gx-canvas').screenshot({ path: join(outDir, file) }))
    shots.push({
      page: 'presentation intent reaches the drawing',
      address: `${pageAddress} — ${caption}`,
      theme: caption,
      look: 'light',
      width: 1440,
      viewportHeight: 1000,
      height: null,
      file,
      notSettled,
      error: null,
      console: [],
      canvas: null,
    })
    const png = readFileSync(join(outDir, file))
    return { file, png, hash: createHash('sha256').update(png).digest('hex').slice(0, 12) }
  }
  // Two of the pictures above, measured against each other.
  const compare = (one, two) => ({ one, two, ...theCanvasesDiffer(one.png, two.png) })

  const send = async (method, path, body) => {
    const res = await fetch(`${api}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return { status: res.status, body: await res.json() }
  }

  try {
    const before = await shoot('intent-1-nothing-arranged.png', 'nothing arranged')

    /**
     * WHICH CARDS TO ARRANGE: THE ONES THIS CANVAS IS DRAWING, READ OFF THE CANVAS.
     *
     * THE BUG THIS EXISTS TO STOP, and it is the one that got past the last fix. The three modules
     * used to be "the first three by sorted record id", and the seed gives every record a random id,
     * so which three that picked was random per run. The structure canvas draws only the cards a
     * line touches — six of the seed's twelve — so on the runs where all three happened to be cards
     * no line touched, both arrangements applied to nothing that was on screen, both pictures came
     * back identical to the unarranged one, and this proof reported that a stored lane and order
     * reach nothing. It reported that eight times in ninety-five runs between 13 and 19 August 2026,
     * which is the 9% that C(6,3)/C(12,3) predicts, and every one of those eight was a working
     * feature called broken.
     *
     * That is the SAME defect the last fix was written for — a verdict that depends on what the seed
     * happened to produce rather than on the mechanism — surviving in a second place. So the cards
     * are read from the drawing itself now, and nothing in this proof guesses at which they are.
     *
     * The card the canvas is NOT drawing is not thrown away either: claim 4 below stores an
     * arrangement for one and photographs the drawing saying so.
     */
    const drawnIds = new Set(
      (await tab.evaluate(() => [...document.querySelectorAll('.react-flow__node')].map((n) => n.getAttribute('data-id'))))
        .filter((id) => typeof id === 'string' && id.startsWith('mod:'))
        .map((id) => id.slice('mod:'.length)),
    )
    const onCanvas = modules.filter((r) => drawnIds.has(r.id)).sort((a, b) => (a.id < b.id ? -1 : 1))
    const offCanvas = modules.filter((r) => !drawnIds.has(r.id)).sort((a, b) => (a.id < b.id ? -1 : 1))
    if (onCanvas.length < 3) {
      return (
        `NOT PROVED — this canvas is drawing ${onCanvas.length} of the ${modules.length} modules on file, and an ` +
        `arrangement can only move a card that is drawn, so three cards to arrange could not be found and the claim ` +
        `was never tested.`
      )
    }
    const [one, two, three] = onCanvas

    // A lane, an order and an emphasis — the three an agent would write from what it knows about the
    // work. No coordinate, no colour.
    const arrangement = {
      intent: {
        nodes: {
          [one.id]: { lane: 'the arm', order: 1, emphasis: 'safety' },
          [two.id]: { lane: 'the arm', order: 2 },
          [three.id]: { lane: 'perception', order: 1, role: 'compact' },
        },
      },
    }
    const written = await send('PUT', '', arrangement)
    console.log(`review: intent PUT -> ${written.status} ${JSON.stringify(written.body).slice(0, 400)}`)
    if (written.status !== 200) return `NOT PROVED — the arrangement could not be stored (${written.status}), so the claim was never tested.`

    const after = await shoot('intent-2-lane-order-emphasis.png', 'a lane, an order and an emphasis stored')
    // The whole shape as well as the reading window: two lanes are a fact about the WHOLE drawing,
    // and a window onto a fifth of it cannot show one. `Fit all` refuses when the drawing is already
    // whole on screen, and a refusal is not a failure of this proof: none of its four claims rests
    // on the press. See `pressFitAll`.
    const intentFit = await pressFitAll(tab)
    await waitForReviewPage(tab)
    const notSettled = await waitForReviewSettled(tab, 'intent-2b-the-whole-arrangement-light-F.png', () =>
      tab.locator('.gx-canvas').screenshot({ path: join(outDir, 'intent-2b-the-whole-arrangement-light-F.png') }))
    shots.push({
      page: 'presentation intent reaches the drawing',
      address: `${pageAddress} — the same arrangement, whole shape`,
      look: 'light',
      theme: intentFit.pressed ? 'the same arrangement, whole shape' : `the same arrangement, whole shape — ${intentFit.why}`,
      width: 1440,
      viewportHeight: 1000,
      height: null,
      file: 'intent-2b-the-whole-arrangement-light-F.png',
      notSettled,
      error: null,
      console: [],
      canvas: null,
    })
    // A SECOND load of the same address, with a real reload in front of it. If the picture were held
    // in the tab this is where it would come back unarranged.
    const reloaded = await shoot('intent-3-after-a-reload.png', 'the same, after a reload')
    const read = await send('GET', '')

    // A SECOND ARRANGEMENT, CHOSEN SO IT CANNOT BE THE FIRST ONE — and the reason this exists.
    //
    // The verdict used to rest on `after !== before`: store an arrangement, and the picture must
    // move. That is true of the mechanism and NOT true of every corpus. This tool seeds a throwaway
    // database whose record ids are random per run, so which three modules get picked varies, and
    // when the chosen three ALREADY sit in the lanes and order the arrangement asks for, storing it
    // changes no pixel and a working feature is reported broken. Measured 2026-08-12: two runs of
    // one commit, one PROVED and one NOT PROVED. Mole Office holds it as problem 9EDAq1GHyWGK, and this
    // is the fix that record asks for.
    //
    // A verdict that flips at random is worse than no verdict, because it teaches a reader to
    // ignore the line — and then the day it fails for a real reason it reads as the flake.
    //
    // So the claim is now made between TWO arrangements rather than against the starting layout.
    // The lanes are swapped and the orders reversed, so the second differs from the first by
    // construction whatever the corpus looks like. If both draw the same canvas, the lane and the
    // order genuinely reach nothing. The before/after comparison is still taken and still reported,
    // but it is evidence rather than the verdict.
    //
    // THAT FIX WAS HALF OF IT, and the other half is above: two arrangements of cards nobody is
    // drawing also draw the same canvas. See the note beside `onCanvas`.
    const otherArrangement = {
      intent: {
        nodes: {
          [one.id]: { lane: 'perception', order: 2 },
          [two.id]: { lane: 'perception', order: 1, emphasis: 'safety' },
          [three.id]: { lane: 'the arm', order: 1 },
        },
      },
    }
    const rewritten = await send('PUT', '', otherArrangement)
    if (rewritten.status !== 200) return `NOT PROVED — the second arrangement could not be stored (${rewritten.status}), so the claim was never tested.`
    const other = await shoot('intent-4-a-different-arrangement.png', 'a different lane and order stored')

    // The boundary. Sent to the same endpoint, by the same caller, one field different.
    //
    // THE KEY IS NOW ONE THE DOOR REALLY REFUSES. It used to send x and y and ask for a 4xx, which
    // asserted the rule the owner voided on 6 September 2026 (criterion D19) and could never pass
    // against correct code. `width` is drawing geometry and is refused by name with the reason. The
    // positive half sits beside it: an x and a y together are the one place a node may keep, so they
    // are stored and read back rather than refused.
    const refusedGeometry = await send('PUT', `/nodes/${encodeURIComponent(one.id)}`, { intent: { width: 420 } })
    const refusedColour = await send('PUT', `/nodes/${encodeURIComponent(one.id)}`, { intent: { colour: '#c0392b' } })
    const storedPlace = await send('PUT', `/nodes/${encodeURIComponent(one.id)}`, { intent: { x: 420, y: 180 } })
    const placeBack = await send('GET', '')
    console.log(`review: width  PUT -> ${refusedGeometry.status} ${JSON.stringify(refusedGeometry.body)}`)
    console.log(`review: colour PUT -> ${refusedColour.status} ${JSON.stringify(refusedColour.body)}`)
    console.log(`review: x,y    PUT -> ${storedPlace.status} ${JSON.stringify(storedPlace.body)}`)

    /**
     * THE REFUSAL HAS TO NAME THE KEY AND GIVE THE REASON, not merely answer 4xx. "invalid field"
     * teaches nothing, and this half of the proof is that the boundary explains itself. The place
     * has to come back, or the door took a position it did not keep.
     */
    const geometrySaid = String(refusedGeometry.body?.error ?? refusedGeometry.body?.message ?? '')
    const refusedKeyNamed =
      refusedGeometry.status >= 400 && geometrySaid.includes('width') && geometrySaid.includes('is never stored')
    const storedPlaceBack = placeBack.body?.intent?.nodes?.[one.id] ?? null
    const placeKept = storedPlace.status === 200 && storedPlaceBack?.x === 420 && storedPlaceBack?.y === 180

    /**
     * CLAIM 4: AN ARRANGEMENT THIS CANVAS CANNOT SHOW IS SAID OUT LOUD, NAMING THE CARD.
     *
     * A structure canvas draws the cards a line touches and leaves the rest to the reading layer,
     * which is a settled decision — design/wave3/11-canvas-projection.md. So a lane stored for a
     * card no line touches can never move that canvas, and for a week the product's answer to that
     * was silence: the write was accepted, the read came back with it, the model applied it, and the
     * picture was identical to the picture with nothing stored. This is the case photographed.
     *
     * The whole scope is replaced by the one card, so the drawing here IS the unarranged drawing.
     * The evidence is the sentence under it, not the layout: the picture is expected to come back
     * identical to the first one, and the point is that the page now says why.
     */
    let saidSo = null
    let offCanvasNote = 'every module on file is on this canvas, so there was no card to store an unshowable arrangement for'
    if (offCanvas.length > 0) {
      const [absent] = offCanvas
      const storedForAbsent = await send('PUT', '', {
        intent: { nodes: { [absent.id]: { lane: 'the arm', order: 1, emphasis: 'safety' } } },
      })
      if (storedForAbsent.status !== 200) {
        return `NOT PROVED — an arrangement for a card the canvas is not drawing could not be stored (${storedForAbsent.status}), so the fourth claim was never tested.`
      }
      const unshowable = await shoot('intent-5-arranged-but-not-drawn.png', 'a card this canvas is not drawing, arranged')
      const said = await tab.evaluate(() => document.querySelector('.gx-report')?.textContent ?? '')
      saidSo = said.includes(absent.id) || said.includes(absent.title)
      const againstNothing = compare(before, unshowable)
      offCanvasNote =
        `“${absent.title}” (${absent.id}) is one of the ${offCanvas.length} modules no line on this canvas touches. ` +
        `With a lane, an order and an emphasis stored for it the canvas drew ${unshowable.hash}` +
        `${!againstNothing.compared ? ', which could not be compared with the unarranged picture, ' : againstNothing.differ ? ', which is not the unarranged picture, ' : ', which is the unarranged picture by the measure above — as it has to be — '}` +
        `(${theComparisonSaid(againstNothing)}) ` +
        `and the drawing ${saidSo ? 'named the card and said it could not apply the hints' : 'said NOTHING about it'}.`
    }

    // Two arrangements that differ must draw two canvases that differ. This is the claim, and unlike
    // `after !== before` it does not depend on what the corpus happened to look like at the start.
    // Wave 13y round 52: the two are counted as different by `theCanvasesDiffer`, so an edge blend is
    // not a change. What survived the reload is what the office gave back after it, not a picture:
    // a picture can come back the same from a tab that holds what the office dropped. The other two
    // comparisons are evidence, and the line prints the counts of all three.
    const firstAgainstSecond = compare(after, other)
    const firstAgainstReload = compare(after, reloaded)
    const nothingAgainstFirst = compare(before, after)
    const cameBack = theArrangementReadBack(arrangement.intent.nodes, read.status === 200 ? read.body?.intent?.nodes : null)
    const changed = firstAgainstSecond.compared && firstAgainstSecond.differ
    const survived = cameBack.same
    const storedBack = JSON.stringify(read.body?.intent?.nodes?.[one.id] ?? null)
    const refused = refusedKeyNamed && refusedColour.status >= 400
    const verdict = !firstAgainstSecond.compared
      ? `NOT PROVED — the canvases could not be compared: ${after.file} against ${other.file}: ${firstAgainstSecond.why}.`
      : changed && survived && refused && placeKept && saidSo !== false
        ? 'PROVED — two different stored arrangements of cards this canvas draws drew two different canvases, the office gave back the first one’s lanes, orders and emphasis after a reload, a geometry key (`width`) and a colour were refused by name with the reason, a node’s x and y were stored and read back, and an arrangement the canvas cannot show was named under the drawing rather than ignored.'
        : !changed
          ? 'NOT PROVED — two arrangements with the lanes swapped and the orders reversed drew the SAME canvas, so a stored lane and order reach nothing.'
          : !survived
            ? 'NOT PROVED — the arrangement did not survive a reload: the office gave back a lane, an order or an emphasis other than the one sent.'
            : !refused
              ? 'NOT PROVED — a geometry key or a colour was ACCEPTED, or the refusal did not name the key and say why, so the boundary is not being kept.'
              : !placeKept
                ? 'NOT PROVED — a node with an x and a y was not stored and read back, so the one place the owner allows is not being kept.'
                : 'NOT PROVED — an arrangement stored for a card this canvas is not drawing changed nothing and the drawing said nothing about it, so a stored hint was dropped in silence.'
    // Wave 13y round 53: the console line carries the counts too, after the verdict.
    const counts =
      `first arrangement against the second, ${theComparisonSaid(firstAgainstSecond)}; ` +
      `first arrangement against after a reload, ${theComparisonSaid(firstAgainstReload)}; ` +
      `nothing arranged against the first arrangement, ${theComparisonSaid(nothingAgainstFirst)}`
    console.log(`review: presentation intent — ${verdict} Canvases compared: ${counts}.`)
    // Put it back, and SAY SO IF IT DID NOT GO. The database is a throwaway, so this is not about
    // the data — it is about the sentence below being true of the workspace the other pictures show.
    const cleared = await send('DELETE', '')
    const clearNote = cleared.status === 200 ? '' : ` The arrangement could NOT be removed again (${cleared.status}).`
    return (
      `${verdict} The three cards arranged are three this canvas is drawing, read off the canvas: ` +
      `“${one.title}”, “${two.title}” and “${three.title}” — ${onCanvas.length} of the ${modules.length} modules on ` +
      `file are drawn here and the other ${offCanvas.length} join nothing. Stored on “${one.title}”: ${storedBack}. ` +
      `Refusal for {"width":420} was ` +
      `${refusedGeometry.status}: ${geometrySaid.slice(0, 300)} ` +
      `The node’s stored place read back as ${JSON.stringify(storedPlaceBack)}. ` +
      `Read back after the reload${read.status === 200 ? '' : ` (the read answered ${read.status})`}: ${cameBack.said}. ` +
      `Canvas fingerprints: nothing arranged ${before.hash}, first arrangement ${after.hash}, after a reload ` +
      `${reloaded.hash}, second arrangement ${other.hash}. ` +
      `Canvases compared, ${CANVAS_MEASURE_SAID}: ${counts}. ` +
      `The verdict rests on the first of these and on what the office gave back; ` +
      `${!nothingAgainstFirst.compared ? 'whether the first arrangement moved the drawing from the starting layout is not known' : nothingAgainstFirst.differ ? 'the first arrangement also moved the drawing away from the starting layout' : 'the first arrangement happened to match the starting layout, which is the coincidence this proof no longer rests on'}. ` +
      `${offCanvasNote}${clearNote}`
    )
  } catch (err) {
    return `NOT PROVED — the check could not be run: ${err.message.split('\n')[0]}`
  } finally {
    await context.close()
  }
}

// ---------------------------------------------------------------------------- the contact sheet

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The contact sheet. Every shot, grouped by page, with what went wrong beside the ones it went
 * wrong on -- a page that failed to load appears as a stated failure rather than as a gap, so a
 * missing picture can never be read as a page that had nothing on it.
 */
function contactSheet(shots, facts) {
  const pages = [...new Set(shots.map((s) => s.page))]
  const failures = shots.filter((s) => s.error !== null)
  const blank = shots.filter((s) => (s.blank ?? null) !== null)
  const sections = pages
    .map((page) => {
      const mine = shots.filter((s) => s.page === page)
      const cells = mine
        .map((shot) => {
          const content = shot.content ?? null
          const drew =
            content === null
              ? ''
              : `<br>content area: ${content.texts} text nodes, ${content.words} words, ${content.boxes} boxes, ${content.height}px tall`
          const caption =
            shot.error !== null
              ? `<p class="bad">did not load: ${esc(shot.error)}</p>`
              : `<p class="dim">${shot.width}&times;${shot.height} full page, viewport ${shot.viewportHeight}px tall` +
                (shot.canvas == null ? '' : `<br>${esc(shot.canvas)}`) +
                (shot.notSettled == null ? '' : `<br>not settled: ${esc(shot.notSettled)}`) +
                drew +
                `</p>` +
                ((shot.blank ?? null) === null ? '' : `<p class="bad">EMPTY PAGE: ${esc(shot.blank)}</p>`)
          const console_ =
            shot.console.length === 0
              ? ''
              : `<ul class="bad">${shot.console.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`
          const picture =
            shot.file === null
              ? '<div class="missing">no picture</div>'
              : `<a href="${esc(shot.file)}"><img src="${esc(shot.file)}" alt="${esc(page)} at ${shot.width}px, ${shot.theme} (${LOOKS[shot.look ?? shot.theme]})" loading="lazy"></a>`
          return `<figure class="shot ${esc(shot.theme)}">
            <figcaption><b>${shot.width}px</b> ${esc(shot.theme)}${shot.look ? ' · ' + shot.look : ''} (${LOOKS[shot.look ?? shot.theme]})</figcaption>
            ${picture}
            ${caption}
            ${console_}
          </figure>`
        })
        .join('\n')
      return `<section>
        <h2>${esc(page)} <code>${esc(mine[0].address)}</code></h2>
        <div class="row">${cells}</div>
      </section>`
    })
    .join('\n')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mole Office interface review</title>
<style>
  :root { color-scheme: light dark; --bg: #fbfbfa; --fg: #1a1a19; --dim: #6b6b68; --line: #dededa; --bad: #a4262c; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #17181a; --fg: #e8e8e6; --dim: #9a9a97; --line: #33353a; --bad: #ff8e8e; }
  }
  body { margin: 0; padding: 2rem; background: var(--bg); color: var(--fg);
         font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  h1 { margin: 0 0 .25rem; font-size: 1.5rem; }
  h2 { margin: 2.5rem 0 .75rem; font-size: 1.1rem; border-top: 1px solid var(--line); padding-top: 1rem; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--dim); font-weight: normal; }
  .facts { color: var(--dim); font-size: .9rem; margin: 0 0 1.5rem; }
  .facts li { margin: .15rem 0; }
  .row { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 1.25rem; align-items: start; }
  figure { margin: 0; }
  figcaption { font-size: .85rem; margin-bottom: .4rem; }
  /* Every thumbnail gets the same box and the whole page is fitted inside it. A full-page shot of
     a phone can be forty times taller than a desktop one, and letting each picture take its own
     natural height puts them on wildly different scales -- the narrowest page ends up the biggest
     thing on the sheet. Fitted, the shapes are comparable at a glance, which is what a contact
     sheet is for; click one to read it. */
  img { width: 100%; height: 70vh; display: block; object-fit: contain; object-position: top center;
        border: 1px solid var(--line); border-radius: 6px; background: #fff; }
  figure.dark img { background: #111; }
  .dim { color: var(--dim); font-size: .8rem; margin: .35rem 0 0; }
  .bad { color: var(--bad); font-size: .8rem; margin: .35rem 0 0; }
  ul.bad { padding-left: 1.1rem; }
  .missing { border: 1px dashed var(--bad); border-radius: 6px; padding: 2rem; text-align: center; color: var(--bad); }
</style>
</head>
<body>
<h1>Mole Office interface review</h1>
<ul class="facts">
  <li>Taken ${esc(facts.when)}</li>
  <li>${esc(facts.clock)}</li>
  <li>${shots.length} shots &mdash; ${pages.length} pages &times; ${VIEWPORTS.length} widths &times; ${THEMES.length} themes${failures.length > 0 ? `, <span class="bad">${failures.length} failed to load</span>` : ''}${blank.length > 0 ? `, <span class="bad">${blank.length} show an EMPTY content area</span>` : ''}</li>
  <li>What each page drew: ${esc(facts.comparison)}</li>
  <li>Seeded database ${esc(facts.db)}, thrown away after the run</li>
  <li>API on port ${facts.apiPort}, Vite on port ${facts.webPort}; both stopped, both ports verified free</li>
  <li>Record page shot: ${esc(facts.record)}</li>
  <li>Deadline panel shot: ${esc(facts.deadline)}</li>
  <li>Profile pages shot: ${esc(facts.profiles)}</li>
  <li>Credential page shot: ${esc(facts.credential)}</li>
  <li>Run page shot: ${esc(facts.run)}</li>
  <li>Incident page shot: ${esc(facts.incident)}</li>
  <li>Pipeline drawing shot: ${esc(facts.pipeline)}</li>
  <li>Plan page shot: ${esc(facts.plan)}</li>
  <li>Handbook page shot: ${esc(facts.handbook)}</li>
  <li>Plugin page shot: ${esc(facts.plugin)}</li>
  <li>Derived layout: ${esc(facts.derived)}</li>
  <li>Presentation intent: ${esc(facts.intent)}</li>
  <li>Graph behaviours: ${esc(facts.cases)}</li>
  <li>Pictures are full page, so the height below is the whole scroll, not the window</li>
</ul>
${sections}
</body>
</html>
`
}

// ---------------------------------------------------------------------------- the run

/**
 * A new, empty folder for one review, and the throwaway database it names in that folder. The API server writes more
 * beside its database than the database: keys.json, its lock or its end note, and the folders avatars and
 * portrait-copies. In a folder of the review's own, all of that is removed with the folder, and two reviews share no path.
 * @param {string} [under] the folder to make it in; the temporary folder unless a caller names another
 */
export function aFolderForTheReview(under = tmpdir()) {
  const folder = mkdtempSync(join(under, 'mole-office-review-'))
  return { folder, db: join(folder, 'review.db') }
}

/** The review's own folder and its database, made in main and removed by the shutdown; null until main makes them. */
let runFolder = null
let dbFile = null
let apiPort = null
let webPort = null

/**
 * KhJ4yOsbhgkR; inspector W-3T9Pba2iPF: blanket removal silently changed what review drew.
 * USER.md invariant 2 requires keeping the caller's choices for this throwaway office.
 * This explicit list restores only local behaviour settings declared in src/config/settings.mjs.
 * Addresses, ports, paths, workspace/session/agent/commit identity, keys and reach permissions
 * still go through the shared removal rule. Every THE_OFFICES_VARIABLES name stays removed.
 * Each entry says why it can be kept; an unknown MOLE_OFFICE_ name is never passed through.
 */
const REVIEW_LOCAL_SETTINGS = Object.freeze([
  'MOLE_OFFICE_PICTURES', // shows the local picture button.
  'MOLE_OFFICE_MESSAGE_WORKER', // chooses whether the local delivery worker runs.
  'MOLE_OFFICE_AGENT_MODEL', // chooses the default builder model.
  'MOLE_OFFICE_CHORE_RUNTIME', // chooses the runtime for local chores.
  'MOLE_OFFICE_CHORE_MODEL', // chooses the model for local chores.
  'MOLE_OFFICE_CHORE_VARIANT', // chooses the reasoning effort for local chores.
  'MOLE_OFFICE_INSPECTION_MODEL', // chooses the local inspection model.
  'MOLE_OFFICE_INSPECTION_MINUTES', // bounds a local inspection.
  'MOLE_OFFICE_INSPECTION_API_SECONDS', // bounds each inspection response wait.
  'MOLE_OFFICE_INSPECTION_OFFICE_BACK_SECONDS', // bounds a local inspection's wait for the office to return.
  'MOLE_OFFICE_REGISTER_TIMEOUT_SECONDS', // bounds a local registration wait.
  'MOLE_OFFICE_MERGE_WORKERS', // limits local merge test concurrency.
  'MOLE_OFFICE_WORKER_RUNS', // limits local worker concurrency.
  'MOLE_OFFICE_AGENT_HOPS', // bounds local agent reply chains.
  'MOLE_OFFICE_RUN_MESSAGES', // bounds messages per local run.
  'MOLE_OFFICE_RUN_WAITS_MINUTES', // bounds how long local conversations wait.
  'MOLE_OFFICE_IDLE_REMINDER_HOURS', // chooses when local idle reminders appear.
  'MOLE_OFFICE_BROADCAST_TIMES', // chooses local broadcast times.
  'MOLE_OFFICE_BROADCAST_LEAD_MINUTES', // chooses when local broadcast reminders appear.
  'MOLE_OFFICE_BROADCAST_UNANSWERED_LIMIT', // bounds unanswered local broadcasts.
  'MOLE_OFFICE_BROADCAST_BACKUP_REMINDER', // chooses the local backup reminder text.
  'MOLE_OFFICE_HANDLE_BEAT_SECONDS', // chooses the local handle heartbeat interval.
  'MOLE_OFFICE_MAIN_WORLD_SUPERVISORS', // chooses the local supervisor count reminder threshold.
  'MOLE_OFFICE_MAIN_WORLD_WORKERS', // chooses the local worker count reminder threshold.
  'MOLE_OFFICE_HANDLE_LAPSES_AFTER_SECONDS', // chooses when local handles read as unanswered.
  'MOLE_OFFICE_HANDLE_GRACE_SECONDS', // chooses how long local handles keep a stopped session.
  'MOLE_OFFICE_HANDLE_UNREAD_AFTER_SECONDS', // chooses when unread local handles lapse.
  'MOLE_OFFICE_MESSAGE_EDIT_WINDOW_SECONDS', // bounds edits to local messages.
  'MOLE_OFFICE_IDLE_AFTER', // chooses when local sessions read as idle.
  'MOLE_OFFICE_ORPHAN_AFTER', // chooses when local sessions read as orphaned.
  'MOLE_OFFICE_EXPENSIVE_AFTER', // chooses when resuming a local run reads as expensive.
  'MOLE_OFFICE_LARGE_LAST_TURN_TOKENS', // chooses the local large turn threshold.
  'MOLE_OFFICE_BROWSER_TEST_SLOTS', // limits local browser test concurrency.
  'MOLE_OFFICE_AVATAR_MAX_BYTES', // bounds local avatar uploads.
  'MOLE_OFFICE_MESSAGE_PICTURE_MAX_BYTES', // bounds local message picture uploads.
  'MOLE_OFFICE_RETURNED_FILE_MAX_BYTES', // bounds files stored in the local office.
  'MOLE_OFFICE_EVENT_RING', // bounds local event history.
  'MOLE_OFFICE_ALIVE_WITHIN_MINUTES', // chooses when local agents read as online.
  'MOLE_OFFICE_PERSON_ALIVE_WITHIN_SECONDS', // chooses when the local person reads as online.
  'MOLE_OFFICE_REFUSE_MESSAGE_TO_AGENT_WITH_NO_SESSION_AND_NO_RUN', // chooses the local message refusal policy.
  'MOLE_OFFICE_DEAD_LETTER_AFTER_DAYS', // chooses the local dead letter age reminder threshold.
  'MOLE_OFFICE_DEAD_LETTER_AFTER_COUNT', // chooses the local dead letter count reminder threshold.
  'MOLE_OFFICE_STRAY_GRACE', // chooses when a local stray server is reported.
  'MOLE_OFFICE_STALE_CODE_GRACE', // chooses when the local stale code banner appears.
  'MOLE_OFFICE_NO_WATCH', // chooses whether the local file watcher runs.
  'MOLE_OFFICE_CHECK_FOR_MISSED_CHANGES', // chooses the local change check interval.
  'MOLE_OFFICE_FAILED_STARTS_BEFORE_SAYING', // chooses when local failed starts are reported.
])

/**
 * Review gives all three programs the same throwaway office. The caller's address won over our
 * port in Vite, sending its pages and registration to another office (wPqnA92Ta8Kb;
 * GB5jW-UGbDA0). Use the sandbox's shared removal rule so addresses, keys and identity cannot drift.
 * @param {Record<string, string | undefined>} caller
 * @param {number} apiPort
 * @param {number} webPort
 * @param {string} dbFile
 * @param {(line: string) => void} [say]
 * @returns {Record<string, string | undefined>}
 */
export function theReviewEnvironment(caller, apiPort, webPort, dbFile, say = console.log) {
  const env = { ...caller }
  const others = takeOutTheOfficesVariables(env)
  for (const name of REVIEW_LOCAL_SETTINGS) {
    if (!THE_OFFICES_VARIABLES.includes(name) && Object.hasOwn(caller, name)) env[name] = caller[name]
  }
  const removed = [...THE_OFFICES_VARIABLES.filter((name) => Object.hasOwn(caller, name)), ...others]
    .filter((name) => !Object.hasOwn(env, name)).sort()
  say(`review: caller's office variables taken out: ${removed.length > 0 ? removed.join(', ') : 'none'}.`)
  return {
    ...env,
    MOLE_OFFICE_PORT: String(apiPort),
    MOLE_OFFICE_WEB_PORT: String(webPort),
    MOLE_OFFICE_DB: dbFile,
    // ITS OWN VITE CACHE, in the folder of its database, so that it goes with that folder. With none named here, Vite
    // kept its dependency cache in the checkout the review ran from, at .cache/vite.
    MOLE_OFFICE_VITE_CACHE: join(dirname(dbFile), 'vite-cache'),
    // Round 16 draws the first-run guide on every page until the owner is named. Give this
    // throwaway office a made-up owner so review photographs the pages (wPqnA92Ta8Kb; GB5jW-UGbDA0).
    // It is the test offices' invented owner, read from the one place it is written, and never the
    // caller's or the owner's office's. The seed writes whatever owner it is given wherever its corpus
    // names the owner, so any id keeps the links of the seeded messages valid.
    MOLE_OFFICE_OWNER_ID: THE_TEST_OFFICES_OWNER.id,
    MOLE_OFFICE_OWNER_NAME: THE_TEST_OFFICES_OWNER.name,
    // The dev server is noisy at info level and none of it is read unless the run fails.
    LOG_LEVEL: caller.LOG_LEVEL ?? 'warn',
  }
}

/** The key, in the public corpus, of the run whose own page this script photographs. A running run, so its page draws its processes too. */
export const THE_PHOTOGRAPHED_RUN = 'ses-ocr-1931'

/**
 * THE RUN WHOSE OWN PAGE IS PHOTOGRAPHED, by a fixed rule: the seeded run with the title the public corpus gives
 * `THE_PHOTOGRAPHED_RUN`. Wave 13y round 35, item 9.15 (a).
 *
 * WHY NOT THE FIRST RUN OF THE LIST. The list is newest change first, and this script's own three processes each file a
 * run when they start, after the seed: the API server, the message worker and the browser app. So the first run was
 * always one of those, and which one changed from one review to the next (round 34's report, block "915").
 *
 * The seed writes the public corpus, because `theReviewEnvironment` passes on no `MOLE_OFFICE_SEED_CORPUS`. No seeded
 * run of that title, or more than one, stops the review rather than photograph another run's page.
 * @template {{ id: string, kind: string, title: string, origin: string | null }} Row
 * @param {readonly Row[]} records GET /api/records' rows
 * @returns {Row} the one seeded run of that title; it throws rather than give none
 */
export function theRunThisReviewPhotographs(records) {
  const spec = JSON.parse(readFileSync(publicCorpusFile, 'utf8')).records.find((one) => one.key === THE_PHOTOGRAPHED_RUN)
  if (spec === undefined || spec.kind !== 'session') {
    throw new Error(`review: ${publicCorpusFile} files no run under the key ${THE_PHOTOGRAPHED_RUN}, the run whose page this script photographs.`)
  }
  const found = records.filter((record) => record.kind === 'session' && record.origin === 'fixture' && record.title === spec.title)
  if (found.length !== 1) {
    throw new Error(
      `review: the freshly seeded office holds ${found.length === 0 ? 'no seeded run' : `${found.length} seeded runs`} titled “${spec.title}”, ` +
        `the run the public corpus files under ${THE_PHOTOGRAPHED_RUN}. This script photographs that run's page and no other, so it stops here.`,
    )
  }
  return found[0]
}

/**
 * Whether the API this review started serves the checkout's code: the reply when it does, and a throw when it does not
 * or nothing answers. It throws rather than end the process as refuseAStaleWorld in tools/freshness.mjs does, because
 * the process's end would skip the `finally` that stops the two servers this review started.
 * @param {string} api the address of the API
 */
export async function theWorldIsFreshOrThrow(api) {
  const what = 'tools/review.mjs'
  const reply = await askAboutFreshness(api).catch((err) => {
    throw new Error(`${what} did not measure anything.\n${err.message}`)
  })
  const why = whyNotToMeasure(reply)
  if (why !== null) throw new Error(`${what} did not measure anything, because the world it would have measured is stale.\n${why}`)
  return reply
}

async function main() {
  // READ THE ARGUMENT BEFORE SPENDING THREE MINUTES. `--expected` with no reason is refused, and
  // finding that out after 101 screenshots have been taken is a waste of somebody's afternoon. The
  // reader is pure, so asking it twice costs nothing.
  whyTheFallWasExpected()
  const routerSource = [addressesFile, routerFile].map((file) => readFileSync(file, 'utf8')).join('\n\n')
  const pages = pagesFrom(routerSource)
  const recordPrefix = recordPrefixFrom(routerSource, routerFile)
  const messageSegment = segmentFrom(routerSource, 'MESSAGE_SEGMENT', addressesFile, "a message's own page")
  const problemSegment = segmentFrom(routerSource, 'PROBLEM_SEGMENT', addressesFile, "a problem's own page")
  const sessionSegment = segmentFrom(routerSource, 'SESSION_SEGMENT', addressesFile, "an agent run's own page")
  const handbookSegment = segmentFrom(routerSource, 'HANDBOOK_SEGMENT', addressesFile, "a handbook's own page")
  // WHERE A PARTICIPANT'S PAGE LIVES, read rather than typed here. `whoPath` in the router builds
  // the shape and `PROFILE_SEGMENT` in src/shared/profile.ts holds the word, because the server's
  // own sentences name the page too and the server may not import the browser.
  const profileSegment = profileSegmentFrom(readFileSync(profileFile, 'utf8'), profileFile)
  // WHERE A CREDENTIAL'S PAGE LIVES, read out of the shared declaration rather than spelled here.
  // Same rule as the profile segment above: two spellings would agree until the first id that needs
  // escaping.
  const visitorSegment = visitorSegmentFrom(readFileSync(visitorFile, 'utf8'), visitorFile)

  const made = aFolderForTheReview()
  runFolder = made.folder
  dbFile = made.db
  apiPort = await freePort()
  webPort = await freePort()
  const env = theReviewEnvironment(process.env, apiPort, webPort, dbFile)
  const tsx = join(root, 'node_modules', '.bin', 'tsx')
  const vite = join(root, 'node_modules', '.bin', 'vite')

  console.log(`review: seeding a throwaway database at ${dbFile}`)
  const resetOutput = await run('the seed (scripts/reset.ts)', tsx, ['scripts/reset.ts'], env)
  // THE BROWSER'S CLOCK IS FIXED AT THE RESET'S OWN MIDNIGHT PLUS SIXTEEN HOURS (wave 13y round
  // 43). The reset printed the instant its clock read while it seeded; that line is the one place
  // the midnight is worked out, and this reads it back. A picture whose ages are read against a
  // fixed clock must say so where it appears: the console says it once here, and the contact sheet
  // carries the same sentence once among its facts.
  theBrowsersFixedInstant = theFixedBrowserInstant(resetOutput)
  const clockFact =
    `The browser's clock is fixed at ${localStamp(new Date(theBrowsersFixedInstant))} ` +
    `(the reset's midnight plus sixteen hours), so every age in these pictures reads from that instant`
  console.log(`review: ${clockFact}.`)

  console.log(`review: starting the API on ${apiPort} and Vite on ${webPort}`)
  const api = start('the API server', tsx, ['src/server/index.ts'], env)
  // --strictPort so Vite fails rather than quietly moving to the next port, which would leave this
  // script photographing an address nothing is serving and calling it a broken app.
  const web = start('Vite', vite, ['--strictPort', '--host', '127.0.0.1'], env)

  await waitUntilReady(api, `http://127.0.0.1:${apiPort}/api/health`, async (res) => res.ok)
  await waitUntilReady(web, `http://127.0.0.1:${webPort}/`, async (res) => res.ok)

  // REFUSE TO PHOTOGRAPH A STALE WORLD. Criterion G6 of design/ground/ACCEPTANCE.md. This script
  // starts its own server a moment ago, so it is almost always fresh — and that is exactly why the
  // check is cheap to keep: the one time it is not, the pictures are of code nobody has any more,
  // and two whole gate runs were invalidated by exactly that on 2 September 2026. Asking the server
  // is the only honest way: only it knows what it loaded.
  await theWorldIsFreshOrThrow(`http://127.0.0.1:${apiPort}`)

  // A real record id, so the record page is a page and not a not-found.
  //
  // WHICH record matters. A module has the most page to look at -- context, curated summary,
  // parts, paths, claimed source, links both ways, history -- so a module is preferred. Among
  // them the MOST COMPLETE one is taken, because the seed deliberately contains one stub, and
  // "the first module in the list" picked exactly that stub: a record page made almost entirely
  // of empty states, which is the least informative page a review could be handed. Whichever
  // record is used is named on the contact sheet, so nobody has to guess what they are looking at.
  const listed = await fetchAFullList(fetch, `http://127.0.0.1:${apiPort}/api/records?shape=full`).then((r) => r.json())
  if (!Array.isArray(listed.records) || listed.records.length === 0) {
    throw new Error('review: the freshly seeded database has no records, so there is no record page to photograph.')
  }
  // A NARROW LIST HAS NO `data.due` AND NO `origin`. The record and deadline choices below need both,
  // so a cut answer is refused by name rather than picking a page from rows that cannot name it.
  if (listed.records.some((one) => typeof one?.incompleteCount !== 'number')) {
    throw new Error('review: the office answered the narrow record rows and not the whole ones this review picks its pages from.')
  }
  // ONE PERSON'S PAGE AND ONE AGENT'S, which are only reachable with a kind and an id.
  //
  // WHY THIS IS HERE. The profile page (criterion M51) landed with no way for this script to reach
  // it, so the whole review stopped with "Never reached: who" -- which is the coverage check doing
  // its job, and which meant nothing was photographed at all until somebody taught this script the
  // address. tools/legibility.mjs was taught it and this was not.
  //
  // FOUND RATHER THAN WRITTEN: the ids come from the read API of the server this script just
  // started, so nothing here holds a copy of who is registered. A registry that is empty is named
  // on the sheet rather than left quietly unphotographed.
  const registered = await fetch(`http://127.0.0.1:${apiPort}/api/participants`).then((r) => r.json())
  const profiles = [
    ['person', Array.isArray(registered.people) ? registered.people[0] : undefined],
    ['agent', Array.isArray(registered.agents) ? registered.agents[0] : undefined],
  ]
  for (const [kind, one] of profiles) {
    if (one === undefined) continue
    pages.push({
      name: `profile-${kind}`,
      route: 'who',
      address: `#/${profileSegment}/${kind}/${encodeURIComponent(one.id)}`,
    })
  }
  // ONE SECRETARY'S NOTEBOOK, criteria N1 to N4. Photographed like every other page: it hangs off an
  // agent's own address, and it draws whether or not a notebook has been written.
  const anAgent = Array.isArray(registered.agents) ? registered.agents[0] : undefined
  if (anAgent !== undefined) {
    pages.push({
      name: 'notebook',
      route: 'notebook',
      address: `#/${profileSegment}/agent/${encodeURIComponent(anAgent.id)}/notebook`,
    })
  }

  const profileFact =
    profiles.every(([, one]) => one === undefined)
      ? 'neither registry holds anybody, so no profile page was photographed'
      : profiles
          .filter(([, one]) => one !== undefined)
          .map(([kind, one]) => `${kind} ${one.name} (${one.id})`)
          .join(' and ')

  /*
   * ONE VISITING AGENT'S CREDENTIAL PAGE, which is only reachable with a credential id.
   *
   * WHY IT IS ASKED FOR RATHER THAN FOUND. The credential page (criteria P24 to P29) landed with no
   * way for this script to reach it, so the whole review stopped with "Never reached: visitor" --
   * the coverage check doing its job, and meaning nothing was photographed at all. The profile page
   * had the same history, six lines above, and was mended the same way.
   *
   * The seed writes no credentials on purpose: a seeded one would be a visiting agent nobody let in.
   * So this ASKS THE DOOR for one, on the throwaway database this script seeded a moment ago and
   * deletes when it stops. It stays PENDING, which is the state that matters most on that page: it
   * is the one waiting on the owner. Nothing is confirmed here, because confirming is their press.
   */
  const askedForOne = await fetch(`http://127.0.0.1:${apiPort}/api/office/visitors`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default' },
    body: JSON.stringify({
      handle: 'a-visiting-run',
      name: 'A visiting run',
      role: 'worker',
      startDirectory: '/srv/a-visiting-run',
    }),
  })
  const issued = askedForOne.ok ? await askedForOne.json() : null
  const credentialId = issued?.credential?.id ?? null
  if (credentialId !== null) {
    pages.push({ name: 'credential', route: 'visitor', address: `#/${visitorSegment}/${encodeURIComponent(credentialId)}` })
  }
  const credentialFact =
    credentialId === null
      ? `the credential door answered ${String(askedForOne.status)}, so no credential page was photographed`
      : `credential ${credentialId}, asked for by this script and still waiting to be confirmed`

  const modules = listed.records.filter((r) => r.kind === 'module')
  const [chosen] = [...(modules.length > 0 ? modules : listed.records)].sort(
    (a, b) => a.incompleteCount - b.incompleteCount,
  )
  pages.push({ name: 'record', address: `#${recordPrefix}${encodeURIComponent(chosen.id)}` })

  // ONE MESSAGE, ONE PROBLEM AND ONE RUN. Their pages need an id, so read each id from the seeded
  // database rather than inventing an address that would land on the not-found page. The segments
  // come from addresses.ts above; these pages are separate Route members from their record pages.
  // The run is named, by `theRunThisReviewPhotographs`; the message and the problem are the first of their kind.
  const forOwnPage = (kind) => {
    const found = listed.records.find((record) => record.kind === kind)
    if (found === undefined) {
      throw new Error(
        `review: the freshly seeded database has no ${kind} record, so there is no ${kind} page to photograph. ` +
          `The seed is where the review gets its records; an instance with none leaves this page unlooked-at.`,
      )
    }
    return found
  }
  const message = forOwnPage('message')
  const problem = forOwnPage('problem')
  const session = theRunThisReviewPhotographs(listed.records)
  const runFact = `run “${session.title}” (${session.id}), the seeded run the public corpus files under ${THE_PHOTOGRAPHED_RUN}`
  pages.push({ name: 'message', route: 'message', address: `#/${messageSegment}/${encodeURIComponent(message.id)}` })
  pages.push({ name: 'problem', route: 'problem', address: `#/${problemSegment}/${encodeURIComponent(problem.id)}` })
  pages.push({ name: 'session', route: 'session', address: `#/${sessionSegment}/${encodeURIComponent(session.id)}` })

  /*
   * ONE INCIDENT'S SCENE, criterion I3. `#/incident/<id>` is only reachable with an incident's id.
   *
   * FOUND RATHER THAN WRITTEN, and this block has had both shapes. It used to ASK THE DOOR for the
   * fixture — POST /api/records with an agent actor — and round one proved the door refuses it:
   * filing is the secretary's or the person's, criterion I4 (`checkWhoMayFileAnIncident` in
   * src/server/lib/records/who-files-an-incident.ts), and this script holds neither card. The refusal was honest and
   * final, so nobody should ask the door for this again. The seed writes one incident now, through
   * `createRecord` with origin `fixture` and a title that says it is the review's, and this reads
   * its id off the read API of the instance it just started. That is the same fix the profile page
   * above and the credential page above it already have.
   *
   * FOUND RATHER THAN DEFAULTED. The id comes from GET /api/records?kind=incident on this script's
   * own throwaway server, so nothing here holds a copy of what the seed wrote. A corpus with no
   * incident is refused loudly rather than skipped, because a review that quietly leaves a page
   * unphotographed is the exact fault this file exists to catch.
   */
  const incidentList = await fetch(`http://127.0.0.1:${apiPort}/api/records?kind=incident`).then((r) => r.json())
  const seededIncident = Array.isArray(incidentList.records) ? incidentList.records[0] : undefined
  if (seededIncident === undefined) {
    throw new Error(
      'review: the freshly seeded database holds no incident, so there is no incident page to photograph. The seed ' +
        'is where the review gets one (scripts/seed.ts); an instance with no incident means the page this part of ' +
        'the walk exists for is left unlooked-at.',
    )
  }
  pages.push({ name: 'incident', route: 'incident', address: `#/incident/${encodeURIComponent(seededIncident.id)}` })
  const incidentFact = `${seededIncident.kind} “${seededIncident.title}” (${seededIncident.id}) — found in the seeded database`

  // A RECORD THAT SAYS WHEN IT IS OWED, which is the same route at a second address.
  //
  // WHY THIS IS HERE. The record page grew a deadline panel — how long is left, how big the named
  // work is, what the plan gives it, the capacity in between and the buffer — and it is drawn only
  // for a record whose `due` says something. The record chosen above is a MODULE, because a module
  // has the most page to look at, and a module has no `due`. So every picture this tool took of the
  // record page showed a page the panel is not on, and a review that never photographs a feature is
  // a review that cannot find anything wrong with it.
  //
  // A FUTURE date is preferred over a past one, because a deadline still ahead is the case with the
  // most on screen: it has a window, so it has periods, a capacity and a buffer. A date that has
  // gone reports none of those and says why, which is worth seeing but is the smaller picture.
  // Whichever record is used is named on the contact sheet, and if the seed holds none, the sheet
  // says that instead of a page quietly going missing.
  const datedRecords = listed.records.filter((r) => readableDue(r) !== null)
  // TODAY IS THE OPERATOR'S DAY, not UTC's (chapter 4 rule 8; acceptance finding 63): between midnight and one o'clock in
  // summer the UTC date is still yesterday, and a record due today read as still ahead.
  const today = localStamp(new Date()).slice(0, 10)
  const dated =
    datedRecords.find((r) => (readableDue(r) ?? '') > today) ?? datedRecords[0]
  let deadlineFact = 'no record in the seeded database says when it is owed, so the deadline panel was not photographed'
  if (dated !== undefined) {
    pages.push({
      name: 'record-deadline',
      route: 'record',
      address: `#${recordPrefix}${encodeURIComponent(dated.id)}`,
    })
    deadlineFact =
      `${dated.kind} “${dated.title}” (${dated.id}) — due ${readableDue(dated)}, which is ` +
      `${(readableDue(dated) ?? '') > today ? 'still ahead, so the panel has a window' : 'in the past, so the panel reports no window and says why'}`
  }

  // A pipeline DRAWING, which is the same route as the pipelines page at a second address.
  //
  // WHY THIS IS HERE AT ALL. The pipelines page opens on the modules, so until this line the only
  // canvas ever photographed was twelve module cards with five lines between them -- and every
  // behaviour the drawing exists to show (a step that leads to two, two that lead into one, a hard
  // wall against a partial one, a step nobody owns) lives inside a pipeline and was reachable only
  // by pressing the picker, which this script cannot do. A review that never photographs a feature
  // is a review that cannot find anything wrong with it.
  //
  // WHICH pipeline is chosen by what it DEMONSTRATES, not by its position in the list, and the
  // choice is named on the contact sheet so nobody has to guess what they are looking at.
  // The links, because a pipeline's shape is made of them now: what each block waits on and which
  // modules carry it were fields on a nested step and are stored rows now.
  //
  // ONE REQUEST PER BLOCK, because there is no GET /api/links — the read API has never had a link
  // list endpoint, which the stages audit recorded as a gap the durable export will have to close.
  // Sixty-one requests to a local server is a second, and this is a screenshot tool.
  const blockLinks = await readBlockLinks(apiPort, listed.records)
  const pipeline = richestPipeline(listed.records, blockLinks)
  // The drawing's address is the pipelines page's own address with an id after it. Taken from the
  // page this script already found in FLAT_ROUTES rather than written out again here, so there is
  // still exactly one place that says where that page lives.
  const pipelinePage = pages.find((p) => p.name === 'pipeline')
  let pipelineFact = 'no pipeline on file has any readable step, so no drawing was photographed'
  if (pipelinePage === undefined) {
    throw new Error(`FLAT_ROUTES in ${routerFile} no longer has a "pipeline" page, so no drawing can be photographed.`)
  }
  const pipelinePrefix = `${pipelinePage.address.replace(/^#/, '')}/`
  // The project drawing has its own address, and the canvas proofs below look there (problem
  // OEt2jBpK3Glq). It is photographed as a page too: since 29 September nothing else here drew it.
  const drawingAddress = theProjectDrawingAddress(routerSource, pipelinePage.address)
  pages.push({ name: 'pipeline-drawing', route: 'pipeline', address: drawingAddress })
  if (pipeline !== null) {
    pages.push({
      name: 'pipeline-drawn',
      route: 'pipeline',
      address: `#${pipelinePrefix}${encodeURIComponent(pipeline.record.id)}`,
    })
    pipelineFact =
      `“${pipeline.record.title}” (${pipeline.record.id}) — ${pipeline.steps} steps, ` +
      `${pipeline.branches} branch, ${pipeline.joins} rejoin, ${pipeline.partial} partial and ` +
      `${pipeline.hard} hard step gates, ${pipeline.stopped} stopped short, ${pipeline.unowned} carried by nobody`
  }

  // ONE PLAN, which is a page of its own and is only reachable with an id after `#/plans`.
  //
  // WHY IT IS WRITTEN RATHER THAN FOUND. The seed deliberately holds no plan — scripts/reset.ts
  // leaves the planning tables with one draft and no documents — so there is no id to photograph
  // and the coverage check below would stop the whole run naming `onePlan` as a page never reached.
  // That is what it is for, and the answer is to give the review something to look at rather than
  // to teach the check to skip a page. Writing goes to the throwaway database this run seeded and
  // nowhere else, and what was written is named on the contact sheet.
  const planReply = await fetch(`http://127.0.0.1:${apiPort}/api/plans`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Getting a pot from the rig to a person',
      body: [
        'Measure how far off the clamp is at the transplant pose.',
        'Decide whether the moisture loop or the planner owns the release.',
        'Write the safety check that refuses a transplant with nobody there.',
      ].join('\n'),
    }),
  }).then((r) => r.json())
  const planId = planReply?.plan?.id
  if (typeof planId !== 'string' || planId === '') {
    throw new Error(`review: could not write a plan to photograph. The API answered ${JSON.stringify(planReply)}`)
  }
  const plansPage = pages.find((p) => p.name === 'plans')
  if (plansPage === undefined) {
    throw new Error(`FLAT_ROUTES in ${routerFile} no longer has a "plans" page, so no plan can be photographed.`)
  }
  pages.push({
    name: 'plan-written',
    route: 'onePlan',
    address: `#${plansPage.address.replace(/^#/, '')}/${encodeURIComponent(planId)}`,
  })
  const planFact = `“${planReply.plan.title}” (${planId}) — ${planReply.plan.lines?.length ?? 0} lines, written by this run`

  // ONE HANDBOOK, which is a page of its own and is only reachable with an id after `#/handbook`.
  //
  // WRITTEN RATHER THAN FOUND, for the plan's reason above. The seed holds no handbook, so the
  // coverage check below stopped every run with "Never reached: handbook". It hangs on nothing: a
  // role card would need a decision of the person's, and the page has a sentence for a handbook
  // that hangs nowhere. Writing goes to the throwaway database this run seeded and nowhere else.
  const handbookReply = await fetch(`http://127.0.0.1:${apiPort}/api/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default' },
    body: JSON.stringify({
      kind: 'handbook',
      title: 'Before the first transplant of the day',
      data: {
        for: 'The agent that runs the morning transplant.',
        state: 'in use',
        text: { en: { opening: 'Check the clamp at the transplant pose first.', rest: 'Write down how far off it is.' } },
        hangs_on: [],
        text_changes: [{ languages: ['en'], why: 'Written by tools/review.mjs so the handbook page has one to show.' }],
      },
    }),
  })
  const handbookAnswer = await handbookReply.text()
  const handbook = handbookReply.ok ? JSON.parse(handbookAnswer).record : undefined
  if (typeof handbook?.id !== 'string' || handbook.id === '') {
    throw new Error(`review: could not write a handbook to photograph. The API answered ${handbookReply.status}: ${handbookAnswer.slice(0, 400)}`)
  }
  pages.push({ name: 'handbook', route: 'handbook', address: `#/${handbookSegment}/${encodeURIComponent(handbook.id)}` })
  const handbookFact = `“${handbook.title}” (${handbook.id}) — in use, in English, hanging nowhere, written by this run`

  // A NEW ROLE CARD, BEING FILLED IN. Criterion P51. It is two segments — `#/roles/new` — so it is
  // not in FLAT_ROUTES, and a page nobody photographs is a page nobody looks at. It needs nothing
  // written first: it is the empty form, which is what there is to look at.
  pages.push({ name: 'a new role card', route: 'roleNew', address: '#/roles/new' })

  // THE ROLE CENSUS. `#/roles/who-holds-them`, two segments, reached from the Roles page's own
  // press. It needs nothing written first: an empty census is what there is to look at, and the
  // router's union has named this page since the address grammar moved to src/shared.
  pages.push({ name: 'the role census', route: 'roleCensus', address: '#/roles/who-holds-them' })

  /*
   * ONE PLUGIN'S PAGE, `#/plugin/<id>/<page>`, wave 13x round 15. Photographed as this office has it and never switched
   * on here, because switching a plugin on is the person's press, as confirming the credential above is. A plugin that
   * is on draws its frame and one that is off draws why it has no page. A checkout's plugins/ folder holds none, and
   * then the address names a plugin nobody installed, the page draws the sentence saying so, and the sheet says which.
   */
  const pluginsAnswer = await fetch(`http://127.0.0.1:${apiPort}/api/plugins`)
  if (!pluginsAnswer.ok) {
    throw new Error(`review: GET /api/plugins answered ${pluginsAnswer.status}, so this script cannot tell which plugin page to photograph.`)
  }
  const pluginsRead = await pluginsAnswer.json()
  const withAPage = (pluginsRead.plugins ?? []).filter((one) => (one.manifest?.pages?.length ?? 0) > 0)
  const aPlugin = withAPage.find((one) => one.state === 'on') ?? withAPage[0]
  const pluginId = aPlugin?.id ?? 'no-plugin-installed'
  const pluginSlug = aPlugin?.manifest.pages[0].slug ?? 'page'
  const pluginSegment = segmentFrom(routerSource, 'PLUGIN_SEGMENT', addressesFile, "a plugin's page")
  pages.push({
    name: 'plugin',
    route: 'plugin',
    address: `#/${pluginSegment}/${encodeURIComponent(pluginId)}/${encodeURIComponent(pluginSlug)}`,
  })
  const pluginFact =
    aPlugin === undefined
      ? `${pluginsRead.folderFound === true ? 'no plugin with a page is installed' : 'this install has no plugins folder'}, ` +
        `so the address is ${pluginId}/${pluginSlug}, which is made up, and the page draws why there is no page`
      : `${pluginId}/${pluginSlug}, ` +
        (aPlugin.state === 'on'
          ? 'switched on, so its frame is drawn'
          : `${aPlugin.state} and not switched on by this script, so the page draws why there is no page`)

  // Every page is now accounted for, so this is the moment the list can be checked against the
  // router's own union. Before this line the record page is legitimately missing.
  assertEveryPageCovered(routerSource, pages)
  const recordFact =
    `${chosen.kind} “${chosen.title}” (${chosen.id}) — ` +
    `${chosen.incompleteCount === 0 ? 'complete' : `${chosen.incompleteCount} fields still to fill in`}` +
    (modules.length > 0 ? '' : '; no module record was seeded, so this kind was used instead')

  // READ BEFORE THE WIPE. The record of what each page drew last time lives in the directory the
  // next line empties, so it is taken into memory first and written straight back below.
  const previousRun = readPreviousRun()

  // Start from an empty directory so a page deleted since the last run cannot leave a stale
  // picture on the sheet, which would be a review of an interface that no longer exists.
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })
  // The pictures are regenerable output and do not belong in git. This keeps them out without
  // touching the repository's own .gitignore, which is not this tool's file to edit.
  writeFileSync(join(outDir, '.gitignore'), '*\n')
  // Put the reference straight back, so a run that dies halfway does not cost the comparison.
  if (previousRun !== null) writeFileSync(referenceFile, `${JSON.stringify(previousRun, null, 2)}\n`)

  // `hold.browser` is the browser in use now. `photographEach` swaps it for a fresh one after a
  // picture fails, so everything after the walk reads it from here rather than keeping its own copy.
  const hold = { browser: await chromium.launch() }
  const shots = []
  let lost = []
  let derivedFact = 'NOT PROVED — the check did not run.'
  let intentFact = 'NOT PROVED — the check did not run.'
  let casesFact = 'NOT TAKEN — the pictures were not taken.'
  try {
    const pictures = pages.flatMap((page) =>
      VIEWPORTS.flatMap((viewport) => THEMES.map((theme) => ({ page, viewport, theme }))),
    )
    lost = await photographEach(
      hold,
      pictures,
      async (browser, { page, viewport, theme }) => {
        const name = `${page.name}-${viewport.width}-${theme}-${LOOKS[theme]}.png`
        const problems = []
        const shot = {
          page: page.name,
          address: page.address,
          theme,
          width: viewport.width,
          viewportHeight: viewport.height,
          height: null,
          file: null,
          error: null,
          console: problems,
          /** What was done to make a canvas on this page photographable, or null if it holds none. */
          canvas: null,
          /** What the content area drew, or null when the page never loaded. */
          content: null,
          /** Why this is not a picture of a page, or null when it is one. */
          blank: null,
        }
        // On the sheet whether or not the picture is taken: a failed picture is named there too.
        shots.push(shot)
        try {
          const context = await reviewContext(browser, { width: viewport.width, height: viewport.height }, theme, 1, theBrowsersFixedInstant)
          const tab = await context.newPage()
          tab.on('console', (m) => m.type() === 'error' && problems.push(m.text()))
          tab.on('pageerror', (e) => problems.push(String(e)))
          const url = `http://127.0.0.1:${webPort}/${page.address}`
          await tab.goto(url, { timeout: 30_000 })
          await takeReviewPicture(tab, viewport, shot, name)
          if (shot.blank !== null) {
            console.error(`review: NOTHING DREW — ${page.name} at ${viewport.width}px ${theme}: ${shot.blank}`)
          }
          await context.close()
        } catch (err) {
          shot.error = String(err?.message ?? err).split('\n')[0]
          throw err
        }
      },
      () => chromium.launch(),
      (line) => console.error(`review: ${line}`),
    )
    const browser = hold.browser
    derivedFact = await proveLayoutIsDerived(browser, listed.records, shots, drawingAddress)
    // THE CASE PICTURES COME BEFORE THE INTENT CHECK, and the order is not arbitrary. That check
    // stores a real arrangement and puts it back afterwards; taken second, these were photographed
    // through whatever it had left behind, and one module came out as a narrow title-only card
    // because the check had marked it `compact`. A picture of the ordinary drawing has to be taken
    // while the workspace is ordinary.
    casesFact = await photographGraphCases(browser, shots, [
      { address: drawingAddress, name: 'cases-modules', what: 'the modules: disconnected cards, attached problems' },
      ...(pipeline === null
        ? []
        : [
            {
              address: `#${pipelinePrefix}${encodeURIComponent(pipeline.record.id)}`,
              name: 'cases-pipeline',
              what: 'one pipeline: branches, rejoins, hard and partial gates',
            },
          ]),
    ])
    intentFact = await provePresentationIntent(browser, listed.records, shots, drawingAddress)
    const sessionsFact = await proveSessionsLoad(browser, theSessionsProofAddresses(), theSessionsFailureAddress())
    console.log(`review: sessions — ${sessionsFact}`)
    const drawerFact = await proveDrawerKeepsTheKeyboard(browser)
    console.log(`review: the phone drawer — ${drawerFact}`)

    /**
     * A PROOF THAT DID NOT HOLD MUST NOT BE READABLE AS A RUN THAT PASSED, and there are two ways
     * that used to happen here.
     *
     * ONE: TWO OF THE FOUR DID NOT FAIL THE RUN. The layout and intent proofs printed NOT PROVED
     * into the middle of a hundred lines and the script exited 0, so anyone reading the tail — which
     * is what a digest shows — saw success. The reason given for the exemption was that the intent
     * proof's verdict depended on which three modules the random seed happened to sort first. That
     * reason was retired by the fix in `provePresentationIntent` itself, which now compares TWO
     * stored arrangements against each other rather than one against the starting layout, so the
     * verdict no longer depends on the corpus. The exemption outlived its reason by one commit.
     * All four fail the run now.
     *
     * TWO, AND WORSE: A PROOF THAT COULD NOT BE RUN WAS COUNTED AS A PROOF THAT HELD. The filter
     * asked whether the answer started with "NOT PROVED", and both canvas proofs have paths that
     * answer neither word — "the check could not be run: …", "fewer than two modules are on file",
     * "the link could not be added (500)". Any of those and the run printed "all four proofs held".
     * A check that threw was indistinguishable from a check that passed, which is the same defect
     * this tool exists to catch, one level up. So every path now answers PROVED or NOT PROVED, and
     * an answer that is neither stops the run rather than being read as either.
     */
    const proofs = [
      ['derived layout', derivedFact],
      ['presentation intent', intentFact],
      ['sessions', sessionsFact],
      ['the phone drawer', drawerFact],
    ]
    for (const [name, fact] of proofs) {
      if (typeof fact !== 'string' || !/^(PROVED|NOT PROVED)\b/.test(fact)) {
        throw new Error(
          `review: the "${name}" check answered "${String(fact).slice(0, 120)}", which is neither PROVED nor ` +
            `NOT PROVED. A verdict this script cannot read is a verdict it would have counted as held. ` +
            `Every path out of a proof has to say one of the two words first.`,
        )
      }
    }
    const unproved = proofs.filter(([, fact]) => !fact.startsWith('PROVED'))
    console.log(
      unproved.length === 0
        ? 'review: all four proofs held'
        : `review: ${unproved.length} of 4 proofs DID NOT HOLD — ${unproved.map(([name]) => name).join(', ')}`,
    )
    if (unproved.length > 0) process.exitCode = 1
    // The case pictures are not a proof and do not claim to be, but a run that could not take them
    // must not read as one that did. The function says which it was in its first words.
    if (casesFact.startsWith('NOT TAKEN')) {
      console.error(`review: the graph behaviour pictures — ${casesFact}`)
      process.exitCode = 1
    }
  } finally {
    await hold.browser.close()
  }

  /**
   * DID EVERY PAGE ACTUALLY DRAW SOMETHING, AND DID ANY PAGE LOSE MOST OF ITSELF.
   *
   * This is the check whose absence made every picture above worthless. It is deliberately after the
   * pictures and the proofs, so a blank page is photographed, named, and put on the sheet — the
   * evidence and the verdict arrive together.
   */
  const blank = shots.filter((s) => (s.blank ?? null) !== null)
  for (const s of blank) {
    console.error(`review: BLANK PAGE — ${s.page} at ${s.width}px ${s.theme} (${s.address}): ${s.blank}`)
  }
  const dropped = droppedSinceLastRun(shots, previousRun)
  const accepted = whyTheFallWasExpected()
  for (const d of dropped) {
    console.error(
      `review: MUCH LESS DREW — ${d.shot.page} at ${d.shot.width}px ${d.shot.theme} (${d.shot.address}) drew ` +
        `${d.now} visible text nodes in its content area; the same picture drew ${d.was} on the run of ` +
        `${previousRun.when}. That is a fall of ${Math.round((1 - d.now / d.was) * 100)}%.` +
        (accepted === null ? '' : ` ACCEPTED ON PURPOSE: ${accepted}`),
    )
  }
  const comparison =
    previousRun === null
      ? 'nothing to compare against — no previous passing run is on file, so no page could be checked for a fall. This is the first run, or tools/review was deleted.'
      : `compared against the passing run of ${previousRun.when}: ${dropped.length === 0 ? 'no picture drew less than 60% of what it drew then' : `${dropped.length} pictures drew far less than they did then`}`
  console.log(`review: ${comparison}`)

  const sheet = join(outDir, 'index.html')
  writeFileSync(
    sheet,
    contactSheet(shots, {
      when: new Date().toLocaleString(),
      clock: clockFact,
      db: dbFile,
      apiPort,
      webPort,
      record: recordFact,
      deadline: deadlineFact,
      profiles: profileFact,
      credential: credentialFact,
      run: runFact,
      incident: incidentFact,
      pipeline: pipelineFact,
      plan: planFact,
      handbook: handbookFact,
      plugin: pluginFact,
      derived: derivedFact,
      intent: intentFact,
      cases: casesFact,
      comparison,
    }),
  )

  const failed = shots.filter((s) => s.error !== null).length
  const noisy = shots.filter((s) => s.console.length > 0).length
  const pageShots = shots.filter((s) => (s.content ?? null) !== null).length
  const notSettled = shots.filter((s) => s.file !== null && s.notSettled != null)
  console.log(`review: ${shots.length - failed} of ${shots.length} pictures taken` + (failed > 0 ? `, ${failed} FAILED` : '') +
    `, ${notSettled.length} not settled`)
  for (const shot of notSettled) console.log(`review: not settled — ${shot.file}: ${shot.notSettled}`)
  console.log(
    blank.length === 0
      ? `review: all ${pageShots} page pictures show a content area that drew something`
      : `review: ${blank.length} of ${pageShots} page pictures show an EMPTY CONTENT AREA — ${[...new Set(blank.map((s) => s.page))].join(', ')}`,
  )
  if (noisy > 0) console.warn(`review: ${noisy} of ${shots.length} pages logged a console error — they are on the sheet`)

  // ONLY A RUN THAT PASSED MAY MOVE THE REFERENCE. See `readPreviousRun`: if a broken run wrote its
  // own counts down, the next run would compare the regression against itself and call it normal.
  const fallsAreAccounted = dropped.length === 0 || accepted !== null
  const good = failed === 0 && blank.length === 0 && fallsAreAccounted && process.exitCode !== 1
  if (good) {
    const pictures = {}
    for (const shot of shots) {
      const content = shot.content ?? null
      if (content !== null && content.found) pictures[pictureKey(shot)] = content.texts
    }
    const fell = dropped.map((d) => `${d.shot.page} at ${d.shot.width}px ${d.shot.theme}: ${d.was} -> ${d.now}`)
    writeFileSync(
      referenceFile,
      `${JSON.stringify(
        accepted === null
          ? { when: new Date().toLocaleString(), pictures }
          : { when: new Date().toLocaleString(), acceptedFall: { why: accepted, pictures: fell }, pictures },
        null,
        2,
      )}\n`,
    )
    if (accepted !== null) {
      console.log(
        `review: ${dropped.length} falls were accepted on purpose and the reason is written into ` +
          `${relative(root, referenceFile)} beside the new counts, so the next run compares against these.`,
      )
    }
  } else if (previousRun !== null) {
    console.warn(
      `review: this run did not pass, so what each page drew last time is LEFT AS IT WAS (the run of ` +
        `${previousRun.when}). The next run compares against that, not against this.`,
    )
  }
  return { sheet, failed, lost, blank: blank.length, dropped: dropped.length, unacceptedDrops: accepted === null ? dropped.length : 0 }
}

/** Stop everything, delete the throwaway database, and prove the ports came back. */
async function shutdown() {
  for (const service of [...started].reverse()) await stopGroup(service)

  // THE WHOLE FOLDER GOES. Beside the database, SQLite keeps two journal files and the API server writes keys.json, its
  // lock or end note and two folders. Removing only the database and its journals left the rest in the temporary folder.
  if (runFolder !== null) rmSync(runFolder, { recursive: true, force: true })

  const stuck = []
  for (const [label, port] of [
    ['the API server', apiPort],
    ['Vite', webPort],
  ]) {
    if (port === null) continue
    // A port takes a moment to come back after the process holding it exits.
    let free = false
    for (let attempt = 0; attempt < 20 && !free; attempt++) {
      free = await portIsFree(port)
      if (!free) await sleep(250)
    }
    if (!free) stuck.push(`${label} is still holding port ${port}`)
  }
  if (stuck.length > 0) {
    throw new Error(
      `review: SHUTDOWN INCOMPLETE — ${stuck.join('; ')}. Something is still running. Find it with ` +
        `\`ss -ltnp | grep -E ':(${[apiPort, webPort].filter((p) => p !== null).join('|')}) '\` and kill it by process group.`,
    )
  }
  console.log(`review: stopped, ports ${apiPort} and ${webPort} are free again`)
}

// Importing the environment builder must not start servers or install shutdown handlers.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // If this script is interrupted, the children still have to go. Without this a Ctrl-C during the
  // screenshot loop is exactly the orphan incident this tool was written not to cause.
  let interrupted = false
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      if (interrupted) return
      interrupted = true
      console.warn(`\nreview: ${signal} — shutting down before exit`)
      shutdown().finally(() => process.exit(130))
    })
  }

  let result = null
  let failure = null
  try {
    result = await main()
  } catch (err) {
    failure = err
  } finally {
    await shutdown()
  }

  if (failure !== null) {
    console.error(failure.message)
    process.exitCode = 1
  } else {
    console.log(`\ncontact sheet: ${result.sheet}`)
    console.log(`open it with:  xdg-open ${result.sheet}`)
    // A picture that could not be taken, a picture of an empty page, and a page that lost most of
    // itself are all failures of the same thing: this tool claiming to have looked at a screen.
    if (result.failed > 0 || result.blank > 0 || result.unacceptedDrops > 0) process.exitCode = 1
    // A RUN WITH A PICTURE MISSING IS INCOMPLETE, and it exits 2 so a caller can tell it from a run
    // that took every picture and failed for another reason (exit 1). Printed last, so the tail of the
    // output names every picture nobody looked at.
    if (result.lost.length > 0) {
      console.error(`\nreview: INCOMPLETE — ${result.lost.length} pictures could not be taken:`)
      for (const { which, error } of result.lost) console.error(`  ${which}: ${error}`)
      process.exitCode = 2
    }
  }
}
