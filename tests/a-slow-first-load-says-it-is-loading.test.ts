// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SLOW FIRST LOAD SAYS IT IS LOADING, AND THE BUILT FILES TRAVEL COMPRESSED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT HAPPENED
 * ---------------------------------------------------------------------------------------
 *
 * Wave 13y round 147, item 101. A friend of the owner opened the office over a slow connection and saw
 * "Mole Office did not start." in a red box while the app's files were still arriving. The office came up
 * after a while, but the box read like a fault, and people reloaded again and again. The box was the notice
 * src/web/index.html carries inside #root. src/web/styles.css showed it after a fixed 2.5 seconds, whether
 * the app had failed or was still downloading, and the first load was about 20 MB with no compressed copy
 * for the office to send.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 * The page the browser tests are built from is served here by the office itself, `buildApp` with
 * `production: true`, as the live office serves it.
 *
 *   1. While the app's first script is still arriving, the page says it is loading, in no failure colour,
 *      and not "did not start". At 1440 by 900 and at 390 by 844 its only words are "Mole Office is loading.",
 *      the mole is centred in the window both ways, the words sit under it, and the page does not scroll.
 *      When the script arrives, the app replaces the words.
 *   2. When the browser's error event names a failure, the page says at once that it did not start, and
 *      says what to do. The file that failed is named under a Details fold, which is closed.
 *   3. After a minute with no failure named, the page says it has not started after a minute, in no failure
 *      colour. It says the files may still be arriving, and says what to do. Before the minute it still says
 *      it is loading. The developer lines (the address the page expected, the world, and where the browser
 *      console is) are under the closed Details fold, and opening it shows them.
 *   3a. (wave 13y round 170.) Once the app's first script has run and main.tsx is waiting for the office's first
 *      read, the page says "Mole Office is starting." in no failure colour, and not "did not start": the files have
 *      arrived, so it is no longer loading, and nothing has failed. When the read answers, the app draws and the
 *      starting words go.
 *   3b. (wave 13y round 170.) When the office cannot be reached at all — the first read is refused at the connection,
 *      not answered with an error — the page says "Mole Office did not start." and what to do, in the failure colour,
 *      instead of the technical sentence about the fetch that used to be drawn.
 *   3c. (wave 13y round 171.) When the app's first script has run and the office takes the connection but never
 *      answers the first read, the page says after a minute that the office has not answered, in no failure colour,
 *      and the starting words are gone. The words for files still arriving are not drawn, because the files have
 *      arrived. The words the test checks are read from the page it was served, not copied into the test.
 *   4. Every script, stylesheet and word file the build writes has a brotli copy and a gzip copy beside it,
 *      and each copy holds the same bytes as the file.
 *   5. The office sends the brotli copy to a browser that accepts it, the gzip copy to one that accepts only
 *      gzip, and the file itself to one that accepts neither. It says the answer depends on what was
 *      accepted, and it keeps the year-long cache. The page itself is still sent whole and never stored.
 *
 * Four more, in round 148, item 101 (c). The first load used to carry the words of every language, about
 * ten of its thirteen megabytes in one file. Now it carries English and Chinese, and the reader's language.
 * A fresh office draws its first-run guide at every address, so the guide is the page these four read. The
 * office here is fresh, owned by nobody named, as in tests/the-first-run-guide.test.ts: the two owner settings
 * are empty while its database is made.
 *
 *   8. A browser that reads English is drawn in English without any file that holds a word of Greek,
 *      Spanish, Italian, Korean, Portuguese or Thai.
 *   9. A browser that reads Greek is drawn in Greek from the first drawing, and brings no other of those
 *      five languages. The Greek words are held back three seconds, so a page that drew before they came would
 *      draw English first.
 *  10. Choosing Thai in the first-run guide brings the Thai words then, and the page is drawn in Thai.
 *  11. When the Thai words do not arrive, the page says so, and stays drawn in English. The notice's
 *      button asks again, and when the words come the page is drawn in Thai and the notice is gone.
 *
 * Set W13Y_FIRST_LOAD_MEASURE to a file outside the checkout to measure first loads on a throttled
 * connection. Each load adds one JSON line: the bytes that crossed the connection, and the times to the
 * first words and to the app. Set W13Y_FIRST_LOAD_SHOTS to a folder outside the checkout to photograph the
 * loading words and the failures, light and dark, at four widths.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { brotliDecompressSync, gunzipSync } from 'node:zlib'
import type { FastifyInstance } from 'fastify'
import type { APIResponse, BrowserContext, Page, Route } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createI18n, LANGUAGES, type Language } from '../src/shared/i18n.ts'
import { THE_OWNER_PLACEHOLDER } from '../src/shared/owner.ts'
import { wordsIn } from '../src/shared/words/joined.ts'
import { STORAGE_PREFIX } from '../src/web/components/PresetBar.tsx'
import { freshDb, theBrowserThisWorkerShares, theBuiltPage, type TestDb } from './helpers.ts'

const OWNER_SETTINGS = ['MOLE_OFFICE_OWNER_ID', 'MOLE_OFFICE_OWNER_NAME'] as const
const measure = process.env['W13Y_FIRST_LOAD_MEASURE']
const shots = process.env['W13Y_FIRST_LOAD_SHOTS']

let t: TestDb | undefined
let office: FastifyInstance | undefined
let origin = ''
let folder = ''
/** The app's first script, as the built page names it. */
let entry = ''

/** What the office sent for each built file, read off its own replies. */
const sent: { url: string; accepted: string; encoding: string }[] = []

beforeAll(async () => {
  // EMPTY AND NOT DELETED: a setting left out is read from the .env the checkout holds, as the first-run guide's test says.
  // Only the migration reads the two (src/server/db/owner-setting.ts), and freshDb runs it.
  const saved = OWNER_SETTINGS.map((key) => [key, process.env[key]] as const)
  for (const key of OWNER_SETTINGS) process.env[key] = ''
  try {
    // First, so the office below opens a database of this test's own.
    t = await freshDb()
    folder = await theBuiltPage()
    const html = readFileSync(join(folder, 'index.html'), 'utf8')
    entry = /<script type="module" crossorigin src="([^"]+)"/.exec(html)?.[1] ?? ''
    expect(entry, 'the built page names no first script').toMatch(/^\/assets\/index-.+\.js$/)
    const { buildApp } = await import('../src/server/index.ts')
    office = (await buildApp({ production: true, webDir: folder, webAppUrl: 'http://localhost:5173', logLevel: false })).app
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
  office.addHook('onSend', async (request, reply, payload) => {
    if (request.url.startsWith('/assets/')) {
      sent.push({
        url: request.url,
        accepted: String(request.headers['accept-encoding'] ?? ''),
        encoding: String(reply.getHeader('content-encoding') ?? 'none'),
      })
    }
    return payload
  })
  await office.listen({ port: 0, host: '127.0.0.1' })
  const address = office.server.address()
  if (address === null || typeof address === 'string') throw new Error('the office is not listening on a port')
  origin = `http://127.0.0.1:${String(address.port)}`
}, 240_000)

afterAll(async () => {
  await office?.close()
  t?.close()
}, 60_000)

/** A page in a context of its own, in one look and at one width, in a browser that reads English unless told otherwise. */
async function aPage(look: 'light' | 'dark', width: number, locale = 'en-GB'): Promise<{ context: BrowserContext; page: Page }> {
  const browser = await theBrowserThisWorkerShares()
  const context = await browser.newContext({ colorScheme: look, locale, viewport: { width, height: width <= 390 ? 844 : 900 } })
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: `${STORAGE_PREFIX}theme`, value: look })
  return { context, page: await context.newPage() }
}

/** The fold the developer lines are under. */
const DETAILS = '#root details > summary'

/** Hold the app's first script until `let go` is called, so the page stays where a slow connection leaves it. */
async function holdTheFirstScript(page: Page): Promise<{ letGo: () => Promise<void> }> {
  let held: Route | null = null
  await page.route(`${origin}${entry}`, (route) => {
    held = route
  })
  return {
    letGo: async () => {
      if (held === null) throw new Error('the page never asked for its first script')
      await (held as Route).continue()
    },
  }
}

/** The words #root shows, and every colour a shown part of it is drawn in that is one of the failure colours. */
async function whatTheNoticeShows(page: Page): Promise<{ text: string; failureColours: string[] }> {
  return page.evaluate(() => {
    const probe = document.createElement('div')
    document.body.append(probe)
    const failure = new Set<string>()
    for (const name of ['--st-failed', '--st-failed-row', '--st-failed-line']) {
      probe.style.color = `var(${name})`
      failure.add(getComputedStyle(probe).color)
    }
    probe.remove()
    const root = document.getElementById('root')
    const found: string[] = []
    for (const part of root === null ? [] : [root, ...root.querySelectorAll('*')]) {
      const style = getComputedStyle(part)
      const box = part.getBoundingClientRect()
      // A part inside a closed fold keeps its box, so it is asked whether it is drawn as well.
      if (style.visibility !== 'visible' || box.width === 0 || box.height === 0 || !part.checkVisibility()) continue
      const drawn = [style.color, style.backgroundColor]
      for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
        if (parseFloat(style[`border${side}Width`]) > 0) drawn.push(style[`border${side}Color`])
      }
      for (const colour of drawn) if (failure.has(colour)) found.push(`${part.className || part.id || part.tagName}: ${colour}`)
    }
    return { text: root?.innerText ?? '', failureColours: found }
  })
}

it('1. while the first script is still arriving, the page says it is loading, in no failure colour', async () => {
  for (const width of [1440, 390] as const) {
    const { context, page } = await aPage('light', width)
    try {
      const script = await holdTheFirstScript(page)
      await page.goto(`${origin}/`, { waitUntil: 'commit' })
      // Longer than the 2.5 seconds after which the old notice showed itself, whatever the reason.
      await page.waitForTimeout(4_000)
      const shown = await whatTheNoticeShows(page)
      expect(shown.text.trim(), `at ${String(width)} pixels wide the loading notice says more than its one sentence`).toBe('Mole Office is loading.')
      expect(shown.text, 'the page says it did not start while its first script is still arriving').not.toContain('did not start')
      expect(shown.failureColours, 'the loading words are drawn in a failure colour').toEqual([])
      const placed = await page.evaluate(() => {
        const mole = document.querySelector('[data-boot-mole]')
        const words = document.querySelector('.boot-loading strong')
        if (mole === null || words === null) throw new Error('the loading mole or its words are not in the page')
        const box = (element: Element) => {
          const rect = element.getBoundingClientRect()
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, across: rect.left + rect.width / 2, down: rect.top + rect.height / 2 }
        }
        return { mole: box(mole), words: box(words), window: { across: innerWidth / 2, down: innerHeight / 2, height: innerHeight }, scrollHeight: document.documentElement.scrollHeight }
      })
      expect(Math.abs(placed.mole.across - placed.window.across), `at ${String(width)} pixels wide the mole's centre is ${String(placed.mole.across)} pixels across and the window's centre is ${String(placed.window.across)}`).toBeLessThanOrEqual(1)
      expect(Math.abs(placed.mole.down - placed.window.down), `at ${String(width)} pixels wide the mole's centre is ${String(placed.mole.down)} pixels down and the window's centre is ${String(placed.window.down)}`).toBeLessThanOrEqual(1)
      expect(Math.abs(placed.words.across - placed.mole.across), `at ${String(width)} pixels wide the loading words' centre is ${String(placed.words.across)} pixels across and the mole's centre is ${String(placed.mole.across)}`).toBeLessThanOrEqual(1)
      expect(placed.words.top, `at ${String(width)} pixels wide the loading words start at ${String(placed.words.top)} pixels and the mole's bottom is ${String(placed.mole.bottom)}`).toBeGreaterThanOrEqual(placed.mole.bottom)
      expect(placed.scrollHeight, `at ${String(width)} pixels wide the page is ${String(placed.scrollHeight)} pixels tall and the window is ${String(placed.window.height)}`).toBeLessThanOrEqual(placed.window.height)
      await script.letGo()
      await page.waitForFunction(() => document.getElementById('boot-module') === null, null, { timeout: 30_000 })
      expect(await page.locator('#root').innerText(), 'the loading words stayed after the app started').not.toContain('Mole Office is loading.')
    } finally {
      await context.close()
    }
  }
}, 120_000)

it('2. when the browser names a failure, the page says at once that it did not start, and what to do, and names the file under Details', async () => {
  const { context, page } = await aPage('light', 1440)
  try {
    await page.route(`${origin}${entry}`, (route) => route.abort())
    await page.goto(`${origin}/`, { waitUntil: 'commit' })
    await page.locator('.boot-failure').waitFor({ state: 'visible', timeout: 2_000 })
    const shown = await whatTheNoticeShows(page)
    expect(shown.text).toContain('Mole Office did not start.')
    expect(shown.text).toContain('To try again, reload the page.')
    expect(shown.text).not.toContain('Mole Office is loading.')
    expect(shown.text, 'the failed file is drawn before Details is opened').not.toContain('The module that failed is')
    expect(shown.text, 'the address the page expected is drawn before Details is opened').not.toContain(`${origin}/api`)
    await page.locator(DETAILS, { hasText: /^Details$/ }).click()
    const opened = await whatTheNoticeShows(page)
    expect(opened.text).toContain(`The module that failed is ${origin}${entry}`)
    expect(opened.text).toContain(`This page expected its Mole Office at ${origin}/api.`)
  } finally {
    await context.close()
  }
}, 60_000)

it('3. after a minute with no failure named, the page says it has not started, in no failure colour, that the files may still be arriving, and what to do', async () => {
  const { context, page } = await aPage('light', 1440)
  try {
    await page.clock.install()
    await holdTheFirstScript(page)
    await page.goto(`${origin}/`, { waitUntil: 'commit' })
    await page.locator('.boot-loading').waitFor({ state: 'visible', timeout: 10_000 })
    await page.clock.runFor(59_000)
    const before = await whatTheNoticeShows(page)
    expect(before.text).toContain('Mole Office is loading.')
    expect(before.text).not.toContain('has not started')
    await page.clock.runFor(2_000)
    const after = await whatTheNoticeShows(page)
    expect(after.text).toContain('Mole Office has not started after a minute.')
    expect(after.text, 'the page says it did not start when no failure was named').not.toContain('did not start')
    expect(after.failureColours, 'the words after a minute are drawn in a failure colour').toEqual([])
    expect(after.text).toContain('the app\'s files may still be arriving')
    expect(after.text).toContain('To try again, reload the page.')
    expect(after.text).not.toContain('Mole Office is loading.')
    for (const line of ['This page expected its Mole Office at', 'no world to name', 'The browser console knows']) {
      expect(after.text, `"${line}" is drawn before Details is opened`).not.toContain(line)
    }
    await page.locator(DETAILS, { hasText: /^Details$/ }).click()
    const opened = await whatTheNoticeShows(page)
    expect(opened.text).toContain(`This page expected its Mole Office at ${origin}/api.`)
    expect(opened.text).toContain('This tab has not read a reply from any Mole Office, so there is no world to name.')
    expect(opened.text).toContain('The browser console knows')
    expect(opened.failureColours, 'the opened Details are drawn in a failure colour').toEqual([])
  } finally {
    await context.close()
  }
}, 60_000)

/**
 * Hold the office's first read (who owns it) until `letGo` is called, so the app's script has run and the page is
 * waiting on the office rather than on its files.
 */
async function holdTheFirstRead(page: Page): Promise<{ letGo: () => Promise<void> }> {
  let held: Route | null = null
  await page.route(`${origin}/api/office/owner**`, (route) => {
    held = route
  })
  return {
    letGo: async () => {
      // THE REQUEST LEAVES ONE TASK AFTER THE STARTING WORDS ARE SET, so a caller that reads the words can arrive before the
      // route has caught the request. Wait for it rather than call that a page that never asked.
      await expect
        .poll(() => held !== null, { timeout: 15_000, message: 'the app never asked the office who owns it' })
        .toBe(true)
      await (held as Route).continue()
    },
  }
}

it('3a. while the office answers but has not finished its first load, the page says it is starting, in no failure colour, and not "did not start"', async () => {
  for (const width of [1440, 390] as const) {
    const { context, page } = await aPage('light', width)
    try {
      const read = await holdTheFirstRead(page)
      await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' })
      // THE FIRST SCRIPT HAS RUN, so this is the window main.tsx is in while it waits for the office.
      await expect
        .poll(() => page.locator('.boot-loading strong').innerText(), {
          timeout: 15_000,
          message: `at ${String(width)} pixels wide the page never said the office is starting`,
        })
        .toBe('Mole Office is starting.')
      const shown = await whatTheNoticeShows(page)
      expect(shown.text, 'the page says it did not start while the office has only not answered yet').not.toContain('did not start')
      expect(shown.text, 'the minute notice is drawn before the office has had a minute').not.toContain('has not started after a minute')
      expect(shown.failureColours, 'the starting words are drawn in a failure colour').toEqual([])
      expect(shown.text).not.toContain('Mole Office is loading.')

      // AND WHEN THE OFFICE ANSWERS, THE APP DRAWS: the starting words are a window, not the page's new home.
      await read.letGo()
      await page.waitForFunction(() => document.getElementById('boot-module') === null, null, { timeout: 30_000 })
      expect(await page.locator('#root').innerText(), 'the starting words stayed after the app started').not.toContain('Mole Office is starting.')
    } finally {
      await context.close()
    }
  }
}, 120_000)

it('3b. when the office truly cannot be reached, the page says it did not start, and what to do, and not the technical fetch sentence', async () => {
  const { context, page } = await aPage('light', 1440)
  try {
    await page.route(`${origin}/api/office/owner**`, (route) => route.abort('connectionrefused'))
    await page.goto(`${origin}/`)
    await page.locator('.boot-failure').waitFor({ state: 'visible', timeout: 15_000 })
    const shown = await whatTheNoticeShows(page)
    expect(shown.text).toContain('Mole Office did not start.')
    expect(shown.text).toContain('To try again, reload the page.')
    expect(shown.text, 'the page says it is starting or loading after the office could not be reached').not.toContain('Mole Office is starting.')
    expect(shown.text).not.toContain('Mole Office is loading.')
    expect(shown.text, 'the technical sentence about the failed fetch is drawn as the page').not.toContain('could not ask its server who owns this office')
    expect(shown.text, 'the failed file is drawn before Details is opened').not.toContain('The module that failed is')
    // IT IS A FAILURE, so the box and its sentence are drawn in the failure colour.
    expect(shown.failureColours.length, 'the did-not-start sentence is drawn in no failure colour').toBeGreaterThan(0)
  } finally {
    await context.close()
  }
}, 60_000)

it('3c. after a minute of starting with no answer from the office, the page says the office has not answered, in no failure colour', async () => {
  const { context, page } = await aPage('light', 1440)
  try {
    // THE FILE'S OWN WAY PAST THE MINUTE, from case 3: the clock is installed before the page is, and moved by hand.
    await page.clock.install()
    await holdTheFirstRead(page)
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' })
    // THE APP'S FIRST SCRIPT HAS RUN, so the page is waiting on the office rather than on its files.
    await expect
      .poll(() => page.evaluate(() => document.querySelector('.boot-notice')?.getAttribute('data-boot') ?? null), {
        timeout: 15_000,
        message: 'the page never said the office is starting',
      })
      .toBe('starting')
    const starting = await page.locator('.boot-loading strong').innerText()
    expect(starting, 'the starting state draws no words').not.toBe('')
    const words = await page.evaluate(() => {
      const read = (which: string): string => {
        const block = document.querySelector<HTMLElement>(`[data-boot-slow="${which}"]`)
        if (block === null) throw new Error(`the page declares no ${which} words for a page after a minute`)
        return (block.textContent ?? '').replace(/\s+/g, ' ').trim()
      }
      return {
        office: read('office'),
        files: read('files'),
        officeShown: document.querySelector<HTMLElement>('[data-boot-slow="office"]')?.checkVisibility() ?? true,
      }
    })
    // THE PAGE ITSELF DECLARES THE WORDS this test asks for, and says which case each set belongs to.
    expect(words.office, 'the page declares no words for an office that has not answered').not.toBe('')
    expect(words.files, 'the page declares no words for files that may still be arriving').not.toBe('')
    expect(words.office, 'the words for an office that has not answered are drawn before the minute').not.toBe(words.files)
    expect(words.officeShown, 'the words for an office that has not answered are drawn before the minute').toBe(false)

    await page.clock.runFor(59_000)
    const before = await whatTheNoticeShows(page)
    const beforeSaid = before.text.replace(/\s+/g, ' ').trim()
    expect(beforeSaid).toContain(starting)
    expect(beforeSaid, 'the words for an office that has not answered are drawn before the minute').not.toContain(words.office)

    await page.clock.runFor(2_000)
    const after = await whatTheNoticeShows(page)
    const said = after.text.replace(/\s+/g, ' ').trim()
    expect(said, 'the page does not say what it declares for an office that has not answered').toContain(words.office)
    expect(said, 'the page still says it is starting after a minute').not.toContain(starting)
    expect(said, 'the page says the files may still be arriving after they have arrived').not.toContain(words.files)
    expect(after.failureColours, 'the words after a minute of starting are drawn in a failure colour').toEqual([])
    const drawn = await page.evaluate(() => ({
      office: document.querySelector<HTMLElement>('[data-boot-slow="office"]')?.checkVisibility() ?? false,
      files: document.querySelector<HTMLElement>('[data-boot-slow="files"]')?.checkVisibility() ?? true,
    }))
    expect(drawn.office, 'the words for an office that has not answered are not drawn after the minute').toBe(true)
    expect(drawn.files, 'the words for files still arriving are drawn after the files have arrived').toBe(false)
    // THE DEVELOPER LINES ARE STILL UNDER A CLOSED FOLD, as in the other states that show no failure.
    for (const line of ['This page expected its Mole Office at', 'no world to name', 'The browser console knows']) {
      expect(after.text, `"${line}" is drawn before Details is opened`).not.toContain(line)
    }
  } finally {
    await context.close()
  }
}, 60_000)

/** Every script, stylesheet and word file the build wrote, by name. */
function theBuiltFiles(): string[] {
  return readdirSync(join(folder, 'assets')).filter((name) => /\.(js|css|json)$/.test(name))
}

it('4. every script, stylesheet and word file the build writes has a brotli and a gzip copy beside it, with the same bytes', () => {
  const files = theBuiltFiles()
  expect(files.length, 'the build wrote no script or stylesheet').toBeGreaterThan(0)
  const wrong: string[] = []
  for (const name of files) {
    const bytes = readFileSync(join(folder, 'assets', name))
    for (const [ending, open] of [['br', brotliDecompressSync], ['gz', gunzipSync]] as const) {
      const copy = join(folder, 'assets', `${name}.${ending}`)
      if (!existsSync(copy)) wrong.push(`${name}.${ending} is not there`)
      else if (!open(readFileSync(copy)).equals(bytes)) wrong.push(`${name}.${ending} holds other bytes`)
    }
  }
  expect(wrong).toEqual([])
}, 60_000)

it('5. the office sends the copy the browser accepts, the file itself to one that accepts neither, and the page whole', async () => {
  if (office === undefined) throw new Error('the office did not start')
  const biggest = theBuiltFiles()
    .filter((name) => name.endsWith('.js'))
    .sort((a, b) => statSync(join(folder, 'assets', b)).size - statSync(join(folder, 'assets', a)).size)[0]
  if (biggest === undefined) throw new Error('the build wrote no script')
  const asked: { accepted: string | null; encoding: string | undefined; file: string }[] = [
    { accepted: 'gzip, deflate, br', encoding: 'br', file: `${biggest}.br` },
    { accepted: 'gzip, deflate', encoding: 'gzip', file: `${biggest}.gz` },
    { accepted: null, encoding: undefined, file: biggest },
  ]
  for (const one of asked) {
    const reply = await office.inject({ method: 'GET', url: `/assets/${biggest}`, headers: one.accepted === null ? {} : { 'accept-encoding': one.accepted } })
    const said = `asked accepting ${one.accepted ?? 'nothing named'}`
    expect(reply.statusCode, said).toBe(200)
    expect(reply.headers['content-encoding'], said).toBe(one.encoding)
    expect(reply.headers['content-type'], said).toContain('javascript')
    expect(reply.headers['cache-control'], said).toBe('public, max-age=31536000, immutable')
    expect(String(reply.headers['vary']), said).toMatch(/accept-encoding/i)
    expect(reply.rawPayload.equals(readFileSync(join(folder, 'assets', one.file))), `${said}, the office did not send ${one.file}`).toBe(true)
  }
  const page = await office.inject({ method: 'GET', url: '/', headers: { 'accept-encoding': 'gzip, deflate, br' } })
  expect(page.statusCode).toBe(200)
  expect(page.headers['content-encoding']).toBeUndefined()
  expect(page.headers['cache-control']).toBe('no-store')
}, 60_000)

/** Two made-up connections, slow and middling. Neither is the friend's: nobody measured that one. */
const CONNECTIONS = [
  { name: '5 Mbit/s down, 1 Mbit/s up, 100 ms', down: 5_000_000, up: 1_000_000, latency: 100 },
  { name: '20 Mbit/s down, 5 Mbit/s up, 40 ms', down: 20_000_000, up: 5_000_000, latency: 40 },
] as const

it.runIf(measure)('6. measures a first load on a throttled connection, as the browser asks and accepting gzip only', async () => {
  if (measure === undefined) throw new Error('the measurement needs W13Y_FIRST_LOAD_MEASURE')
  const copies = existsSync(join(folder, `${entry}.br`))
  for (const connection of CONNECTIONS) {
    for (const gzipOnly of [false, true]) {
      const { context, page } = await aPage('light', 1440)
      try {
        const cdp = await context.newCDPSession(page)
        await cdp.send('Network.enable')
        await cdp.send('Network.emulateNetworkConditions', {
          offline: false,
          latency: connection.latency,
          downloadThroughput: connection.down / 8,
          uploadThroughput: connection.up / 8,
        })
        if (gzipOnly) await cdp.send('Network.setExtraHTTPHeaders', { headers: { 'Accept-Encoding': 'gzip, deflate' } })
        let bytes = 0
        let requests = 0
        cdp.on('Network.loadingFinished', (event) => {
          bytes += event.encodedDataLength
          requests += 1
        })
        const from = sent.length
        const start = Date.now()
        const said: { at: number; words: string }[] = []
        await page.goto(`${origin}/`, { waitUntil: 'commit', timeout: 120_000 })
        // The notice is in the page itself, so it is there before the app can be. Until it is parsed, its
        // absence says nothing about the app.
        await page.waitForSelector('#boot-module', { state: 'attached', timeout: 120_000 })
        let started = false
        while (!started && Date.now() - start < 240_000) {
          const now = await page.evaluate(() => ({
            started: document.getElementById('boot-module') === null,
            // Nothing is drawn before the stylesheet has arrived, so words read before then are words nobody saw.
            styled: document.querySelector<HTMLLinkElement>('link[rel="stylesheet"]')?.sheet != null,
            words: (document.getElementById('root')?.innerText ?? '').split('\n')[0]?.trim() ?? '',
          }))
          started = now.started
          const words = started ? '(the app)' : now.styled ? now.words : '(nothing drawn yet: the stylesheet has not arrived)'
          if (said.at(-1)?.words !== words) said.push({ at: Date.now() - start, words })
          if (!started) await page.waitForTimeout(100)
        }
        const startedAt = Date.now() - start
        const bytesWhenStarted = bytes
        const requestsWhenStarted = requests
        const encodings: Record<string, number> = {}
        for (const one of sent.slice(from)) encodings[one.encoding] = (encodings[one.encoding] ?? 0) + 1
        appendFileSync(
          measure,
          `${JSON.stringify({
            build: copies ? 'with compressed copies' : 'without compressed copies',
            connection: connection.name,
            browserAsked: gzipOnly ? 'gzip and deflate only' : 'as Chromium asks',
            acceptedSeen: [...new Set(sent.slice(from).map((one) => one.accepted))],
            encodingsSent: encodings,
            started,
            msToTheApp: startedAt,
            bytesToTheApp: bytesWhenStarted,
            requestsToTheApp: requestsWhenStarted,
            said,
          })}\n`,
        )
        expect(started, `the app did not start within four minutes on ${connection.name}`).toBe(true)
      } finally {
        await context.close()
      }
    }
  }
}, 590_000)

it.runIf(shots)('7. photographs the loading words, the failures and the words that did not come, light and dark, at four widths', async () => {
  if (shots === undefined) throw new Error('the pictures need W13Y_FIRST_LOAD_SHOTS')
  mkdirSync(shots, { recursive: true })
  for (const look of ['light', 'dark'] as const) {
    for (const width of [1440, 990, 660, 390]) {
      {
        const { context, page } = await aPage(look, width)
        try {
          await holdTheFirstScript(page)
          await page.goto(`${origin}/`, { waitUntil: 'commit' })
          // Three seconds, past the 2.5 at which the old notice showed itself.
          await page.waitForTimeout(3_000)
          await page.screenshot({ path: join(shots, `first-load-loading-${look}-${String(width)}.png`) })
        } finally {
          await context.close()
        }
      }
      {
        const { context, page } = await aPage(look, width)
        try {
          await page.route(`${origin}${entry}`, (route) => route.abort())
          await page.goto(`${origin}/`, { waitUntil: 'commit' })
          await page.waitForTimeout(3_000)
          await page.screenshot({ path: join(shots, `first-load-failed-${look}-${String(width)}.png`) })
        } finally {
          await context.close()
        }
      }
      {
        // THE STARTING WINDOW: the app's script has run and main.tsx is waiting for the office's first read.
        const { context, page } = await aPage(look, width)
        try {
          await holdTheFirstRead(page)
          await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' })
          await page.waitForTimeout(3_000)
          await page.screenshot({ path: join(shots, `first-load-starting-${look}-${String(width)}.png`) })
        } finally {
          await context.close()
        }
      }
      {
        // THE OFFICE THE PAGE CANNOT REACH AT ALL: the first read is refused at the connection.
        const { context, page } = await aPage(look, width)
        try {
          await page.route(`${origin}/api/office/owner**`, (route) => route.abort('connectionrefused'))
          await page.goto(`${origin}/`, { waitUntil: 'commit' })
          await page.waitForTimeout(3_000)
          await page.screenshot({ path: join(shots, `first-load-unreachable-${look}-${String(width)}.png`) })
        } finally {
          await context.close()
        }
      }
      if (width === 1440 || width === 390) {
        const { context, page } = await aPage(look, width)
        try {
          await page.clock.install()
          await holdTheFirstScript(page)
          await page.goto(`${origin}/`, { waitUntil: 'commit' })
          await page.waitForTimeout(3_000)
          await page.clock.runFor(61_000)
          await page.screenshot({ path: join(shots, `first-load-a-minute-${look}-${String(width)}.png`) })
          await page.locator(DETAILS).click()
          await page.screenshot({ path: join(shots, `first-load-a-minute-details-${look}-${String(width)}.png`) })
        } finally {
          await context.close()
        }
      }
      if (width === 1440 || width === 390) {
        const { context, page } = await aPage(look, width)
        try {
          await page.route(`${origin}${entry}`, (route) => route.abort())
          await page.goto(`${origin}/`, { waitUntil: 'commit' })
          await page.locator(DETAILS).click()
          await page.screenshot({ path: join(shots, `first-load-failed-details-${look}-${String(width)}.png`) })
        } finally {
          await context.close()
        }
      }
      {
        const { context, page } = await aPage(look, width)
        try {
          await page.route(/\/assets\//, async (route) => {
            const reply = await route.fetch()
            if ((await reply.text()).includes(aWordOnlyIn('th'))) return route.abort()
            return passOn(route, reply)
          })
          await page.goto(`${origin}/`)
          await theAppHasStarted(page)
          await page.locator('.wlc-languages input[value="th"]').click()
          await page.getByRole('alert').filter({ hasText: missingWordsNotice('th') }).waitFor()
          expect(await page.locator('html').getAttribute('data-theme')).toBe(look)
          await page.screenshot({ path: join(shots, `first-load-words-did-not-come-${look}-${String(width)}.png`) })
        } finally {
          await context.close()
        }
      }
    }
  }
  for (const darkName of readdirSync(shots).filter((name) => name.includes('-dark-') && name.endsWith('.png'))) {
    const light = readFileSync(join(shots, darkName.replace('-dark-', '-light-')))
    const dark = readFileSync(join(shots, darkName))
    expect(dark.equals(light), `${darkName} is identical to its light picture`).toBe(false)
  }
}, 590_000)

/**
 * WHAT THE OFFICE SENT, PASSED ON. route.fetch() hands back the bytes unpacked, so the copy's encoding and length are
 * not passed on with them, or the browser would try to unpack them again.
 */
async function passOn(route: Route, reply: APIResponse): Promise<void> {
  const headers = { ...reply.headers() }
  delete headers['content-encoding']
  delete headers['content-length']
  await route.fulfill({ status: reply.status(), headers, body: await reply.body() })
}

/** The six languages the first load no longer carries. */
const LATER = (Object.keys(LANGUAGES) as Language[]).filter((language) => language !== 'en' && language !== 'zh')

function missingWordsNotice(language: Language): string {
  return createI18n('en').t('language.wordsDidNotCome', { language: LANGUAGES[language], shown: LANGUAGES.en })
}

/** Every line of one language's list, a plural's forms as lines of their own. */
function theLinesOf(language: Language): string[] {
  return Object.values(wordsIn(language)).flatMap((word) => (typeof word === 'string' ? [word] : Object.values(word)))
}

const onlyIn = new Map<Language, string>()
/**
 * A LINE ONLY THIS LANGUAGE'S LIST HOLDS, so finding it in a file says the file carries that language. It is the
 * longest such line, so it is no name or number another list shares, and it holds no quote, backslash, dollar or line
 * break, which a build might write another way.
 */
function aWordOnlyIn(language: Language): string {
  const known = onlyIn.get(language)
  if (known !== undefined) return known
  const others = new Set((Object.keys(LANGUAGES) as Language[]).filter((one) => one !== language).flatMap(theLinesOf))
  const found = theLinesOf(language)
    .filter((line) => line.length >= 24 && !/["'`\\$\n]/.test(line) && !others.has(line))
    .sort((a, b) => b.length - a.length)[0]
  if (found === undefined) throw new Error(`the ${language} list holds no line of its own`)
  onlyIn.set(language, found)
  return found
}

/** The first-run guide's heading as one language's list holds it, which a page drawn in that language shows. */
function theGuidesHeadingIn(language: Language): string {
  const heading = wordsIn(language)['welcomeGuide.title']
  if (typeof heading !== 'string') throw new Error(`the ${language} list holds no heading for the first-run guide`)
  if (language !== 'en' && heading === wordsIn('en')['welcomeGuide.title']) throw new Error(`the ${language} heading of the first-run guide is the English one`)
  return heading
}

/** Every script and every other file the page fetches from the built assets, as the browser received it. */
function theFilesItFetches(page: Page): { read: () => Promise<string[]> } {
  const files: Promise<string>[] = []
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.startsWith('/assets/') && !/\.(css|png|svg|woff2?)$/.test(response.url())) {
      files.push(response.text().catch((error: unknown) => `(not read: ${String(error)})`))
    }
  })
  return { read: () => Promise.all(files) }
}

/** Which of the given languages any of the files carries a line of. */
function whichLanguagesCame(files: readonly string[], languages: readonly Language[]): Language[] {
  return languages.filter((language) => files.some((file) => file.includes(aWordOnlyIn(language))))
}

/** Until the app has replaced the notice, and three seconds more, so a file asked late is asked before anything is read. */
async function theAppHasStarted(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getElementById('boot-module') === null, null, { timeout: 60_000 })
  await page.waitForTimeout(3_000)
}

it('8. a browser that reads English is drawn in English, and no file it fetches holds a word of the six later languages', async () => {
  const { context, page } = await aPage('light', 1440)
  try {
    const files = theFilesItFetches(page)
    await page.goto(`${origin}/`)
    await theAppHasStarted(page)
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('en')
    expect(await page.locator('#root').innerText()).toContain(theGuidesHeadingIn('en'))
    const read = await files.read()
    // The control: the search finds the English words, which are in the first load.
    expect(whichLanguagesCame(read, ['en']), 'the English words were not found in any file, so the search finds nothing').toEqual(['en'])
    expect(whichLanguagesCame(read, LATER), 'an English page brought the words of another language').toEqual([])
  } finally {
    await context.close()
  }
}, 120_000)

it('9. a browser that reads Greek is drawn in Greek from the first drawing, and brings no other later language', async () => {
  const { context, page } = await aPage('light', 1440, 'el-GR')
  try {
    // The first time #root shows the app's words, before anything else changes it.
    await page.addInitScript(() => {
      const look = (): void => {
        const held = window as unknown as { firstDrawing?: { lang: string; text: string } }
        if (held.firstDrawing !== undefined || document.getElementById('boot-module') !== null) return
        const text = document.getElementById('root')?.innerText.trim() ?? ''
        if (text !== '') held.firstDrawing = { lang: document.documentElement.lang, text }
      }
      new MutationObserver(look).observe(document, { childList: true, subtree: true, characterData: true, attributes: true })
    })
    // THE GREEK WORDS COME THREE SECONDS LATE, longer than the rest of the start takes, so a page that drew before
    // its words were here would draw English first.
    let heldBack = 0
    await page.route(/\/assets\//, async (route) => {
      const reply = await route.fetch()
      if ((await reply.text()).includes(aWordOnlyIn('el'))) {
        heldBack += 1
        await new Promise((done) => setTimeout(done, 3_000))
      }
      return passOn(route, reply)
    })
    const files = theFilesItFetches(page)
    await page.goto(`${origin}/`)
    await theAppHasStarted(page)
    expect(heldBack, 'no file with the Greek words was asked for').toBeGreaterThan(0)
    const first = await page.evaluate(() => (window as unknown as { firstDrawing?: { lang: string; text: string } }).firstDrawing ?? null)
    expect(first, 'nothing was drawn').not.toBeNull()
    expect(first?.lang, 'the first drawing was not in Greek').toBe('el')
    expect(first?.text, 'the first drawing was not in Greek').toContain(theGuidesHeadingIn('el'))
    expect(first?.text, 'the first drawing was in English').not.toContain(theGuidesHeadingIn('en'))
    expect(whichLanguagesCame(await files.read(), LATER), 'a Greek page brought another language, or not Greek').toEqual(['el'])
  } finally {
    await context.close()
  }
}, 120_000)

it('10. choosing Thai in the first-run guide brings the Thai words then, and the page is drawn in Thai', async () => {
  const { context, page } = await aPage('light', 1440)
  try {
    const files = theFilesItFetches(page)
    await page.goto(`${origin}/#/welcome`)
    await theAppHasStarted(page)
    expect(await page.locator('#root').innerText()).toContain(theGuidesHeadingIn('en'))
    expect(whichLanguagesCame(await files.read(), LATER), 'the Thai words came before Thai was chosen').toEqual([])
    // A press, not check(): the guide's radio is drawn from the page's language, so it changes only when the words do.
    await page.locator('.wlc-languages input[value="th"]').click()
    await page.waitForFunction(() => document.documentElement.lang === 'th', null, { timeout: 30_000 })
    await expect.poll(() => page.locator('#root').innerText()).toContain(theGuidesHeadingIn('th'))
    expect(whichLanguagesCame(await files.read(), LATER), 'choosing Thai brought another language, or not Thai').toEqual(['th'])
  } finally {
    await context.close()
  }
}, 120_000)

it('11. when the Thai words do not arrive the page says so and stays in English, and asking again draws it in Thai', async () => {
  const { context, page } = await aPage('light', 1440)
  try {
    let refusing = true
    let refused = 0
    await page.route(/\/assets\//, async (route) => {
      const reply = await route.fetch()
      if (refusing && (await reply.text()).includes(aWordOnlyIn('th'))) {
        refused += 1
        return route.abort()
      }
      return passOn(route, reply)
    })
    await page.goto(`${origin}/#/welcome`)
    await theAppHasStarted(page)
    await page.locator('.wlc-languages input[value="th"]').click()
    const notice = page.getByRole('alert').filter({ hasText: missingWordsNotice('th') })
    await notice.waitFor({ timeout: 30_000 })
    expect(refused, 'no file with the Thai words was asked for').toBeGreaterThan(0)
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('en')
    expect(await page.locator('#root').innerText()).toContain(theGuidesHeadingIn('en'))
    expect(await page.locator('.wlc-input').inputValue()).toBe(THE_OWNER_PLACEHOLDER.en)
    refusing = false
    await notice.getByRole('button').click()
    await page.waitForFunction(() => document.documentElement.lang === 'th', null, { timeout: 30_000 })
    await expect.poll(() => page.locator('#root').innerText()).toContain(theGuidesHeadingIn('th'))
    await expect.poll(() => page.locator('.wlc-input').inputValue()).toBe(THE_OWNER_PLACEHOLDER.th)
    await expect.poll(() => page.getByRole('alert').filter({ hasText: missingWordsNotice('th') }).count()).toBe(0)
  } finally {
    await context.close()
  }
}, 120_000)
