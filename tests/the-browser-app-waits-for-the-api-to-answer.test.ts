// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BROWSER APP KEEPS ASKING UNTIL THE API ANSWERS, AND WRITES ITSELF DOWN WHEN IT DOES.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * A defect found by the third GROUND verifier on 4 September 2026. The plugin in
 * `vite.config.ts` made exactly one attempt to register, on the `listening` event, and `npm run dev`
 * starts both halves at once under `concurrently`. Vite is ready in about 110 ms; the API has a
 * 120 MB SQLite file to open first. So the attempt failed, the plugin printed one line and stopped,
 * and `node tools/listeners.mjs` called the browser app's port UNOWNED for the rest of that
 * process's life — every time the stack was started the way the documentation says to start it.
 *
 * Criterion G5 asks that every process a test, a worktree or an agent starts is registered with its
 * owner session and the world it serves before it is used, and act 1 of section 4 asks for both
 * halves of the canonical stack registered and both saying the same world. Half of it was on no
 * list at all.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PROVES
 * ---------------------------------------------------------------------------------------
 *
 * 1. The real Vite starts and serves while nothing is listening on the API's address, and writes
 *    nothing, because there is nothing to write to.
 * 2. When an API appears — a stand-in that starts late, which is the race, slowed down — the
 *    browser app files a session record and registers its own process, with the world off the API's
 *    own reply, without anybody restarting anything.
 * 3. It does not write a second row while the ledger it wrote into is the one being read. A second
 *    row for one process is what the orphan report reads as two processes.
 * 4. It DOES write itself again when the API comes back on a different database, because the ledger
 *    is a table in that database and a row in the old one is in a list nobody is reading.
 *
 * The watch uses a short test clock and waits for a completed health round on the same database.
 * The real Vite still serves the page, and the shipped thirty-second cadence is asserted below.
 *
 * ---------------------------------------------------------------------------------------
 * THE STAND-IN, AND WHY IT IS NOT A REAL MOLE OFFICE
 * ---------------------------------------------------------------------------------------
 *
 * What is under test is the browser app's half: when it asks, what it sends, and whether it asks
 * again. A real API cannot be made to start late on purpose without being started late, which is
 * the race this is about and is not reproducible in a test. So the API is a plain HTTP server this
 * file controls: it can be absent, it can appear, and it can come back saying it has a different
 * database open. It answers with the real `x-mole-office-world` header, formatted by the one
 * declaration in src/config/world-header.mjs, so what the browser app reads is what a Mole Office
 * really sends.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer as createHttpServer, type Server } from 'node:http'
import { createServer as createProbe } from 'node:net'
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { createServer, type ViteDevServer } from 'vite'
import { formatWorldHeader } from '../src/config/world-header.mjs'
import moleOfficeConfig, { HOW_OFTEN, registerThisBrowserApp } from '../vite.config.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TEST_CLOCK = { ...HOW_OFTEN, slowly: 100 }

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** One request the stand-in API was sent. */
interface Asked {
  method: string
  url: string
  session: string | null
  body: unknown
}

/** The two worlds this test's stand-in answers in, one after the other. */
const WORLDS = {
  first: {
    database: '1111111111111111',
    repository: REPO.replace(/\/$/, ''),
    port: '29999',
    head: 'abc1234',
    standing: 'scratch',
  },
  onAnotherDatabase: {
    database: '2222222222222222',
    repository: REPO.replace(/\/$/, ''),
    port: '29999',
    head: 'abc1234',
    standing: 'scratch',
  },
}

let asked: Asked[] = []
let world = WORLDS.first
let standIn: Server | null = null
let vite: ViteDevServer | null = null
let cacheDir = ''
/** The folder of the file this test changes under Vite. See A FILE VITE.CONFIG.TS IMPORTS CHANGES. */
let movedDir = ''
let apiPort = 0
/** What was asked of the stand-in at each point of the run. Filled in `beforeAll`. */
const seen: {
  whileNothingAnswered: Asked[]
  afterTheApiAppeared: Asked[]
  afterAWholeRoundOnTheSameDatabase: Asked[]
  afterTheDatabaseChanged: Asked[]
  viteServedAPage: boolean
} = {
  whileNothingAnswered: [],
  afterTheApiAppeared: [],
  afterAWholeRoundOnTheSameDatabase: [],
  afterTheDatabaseChanged: [],
  viteServedAPage: false,
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createProbe()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') {
        probe.close(() => { reject(new Error('the probe socket reported no port')) })
        return
      }
      const { port } = address
      probe.close(() => { resolve(port) })
    })
  })
}

/** The stand-in Mole Office: health with a world header, and the two writes the plugin makes. */
function startTheStandIn(port: number): Promise<Server> {
  const server = createHttpServer((req, res) => {
    let raw = ''
    req.on('data', (chunk: Buffer) => { raw += chunk.toString('utf8') })
    req.on('end', () => {
      const url = req.url ?? ''
      asked.push({
        method: req.method ?? '',
        url,
        session: (req.headers['x-mole-office-session'] as string | undefined) ?? null,
        body: raw === '' ? null : JSON.parse(raw),
      })
      res.setHeader('x-mole-office-world', formatWorldHeader(world))
      res.setHeader('content-type', 'application/json')
      if (url.startsWith('/api/records')) {
        if (req.method === 'GET') {
          // The plugin reads the session rows before it files its own, to close the ones an earlier
          // start replaced. This stand-in's ledger holds none.
          res.end(JSON.stringify({ records: [] }))
          return
        }
        res.end(JSON.stringify({ record: { id: `a-session-record-in-${world.database}` } }))
        return
      }
      if (url.startsWith('/api/resources')) {
        res.end(JSON.stringify({ resource: { id: `a-row-in-${world.database}` } }))
        return
      }
      res.end(JSON.stringify({ ok: true }))
    })
  })
  return new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(port, '127.0.0.1', () => { resolve(server) })
  })
}

/** Wait until `test` is happy with what the stand-in has been asked, or say what it was asked. */
async function untilAsked(test: (all: Asked[]) => boolean, what: string, within = 45_000): Promise<void> {
  const stop = Date.now() + within
  while (Date.now() < stop) {
    if (test(asked)) return
    await sleep(250)
  }
  throw new Error(
    `${what} did not happen within ${String(within / 1000)}s. The stand-in was asked: ` +
      `${asked.map((one) => `${one.method} ${one.url}`).join(', ') || 'nothing at all'}.`,
  )
}

/**
 * WHAT THE BROWSER APP HAS WRITTEN DOWN, WHICH IS KEPT ON `globalThis` AND OUTLIVES A TEST FILE.
 *
 * `vite.config.ts` keeps it under a `Symbol.for` on `globalThis` on purpose, so that a Vite restart
 * does not file a second session record for one process. The runner resets the module registry
 * between test files but not `globalThis`, so a file that starts a Vite leaves this behind for
 * whatever runs next in the same worker. `tests/the-browser-app-writes-itself-down-once.test.ts`
 * already clears it for that reason.
 *
 * This file is about what the plugin does FROM NOTHING, so it starts from nothing and leaves
 * nothing. It is not known to be the cause of the duplicate-registration failure — two full suite runs on
 * 4 September 2026, one on this branch and one on main, were both green — but a file whose first
 * assertion is "it registered once" cannot be left reading another file's memory.
 */
const WHAT_THE_BROWSER_APP_WROTE_DOWN = Symbol.for('mole-office.what-the-browser-app-has-written-down')

beforeAll(async () => {
  delete (globalThis as Record<symbol, unknown>)[WHAT_THE_BROWSER_APP_WROTE_DOWN]
  apiPort = await freePort()
  cacheDir = mkdtempSync(join(tmpdir(), 'mole-office-late-api-'))
  /**
   * THE ADDRESS THE BROWSER APP WILL PROXY TO, AND NOTHING IS LISTENING ON IT YET.
   *
   * Its own cache directory for the same reason `tests/the-dev-server-watches-the-shared-folder.ts`
   * has one: a worktree's node_modules is a link to the main checkout's, and a Vite started here
   * would otherwise rewrite the dependency cache the owner's own dev server is reading.
   */
  process.env.MOLE_OFFICE_API = `http://127.0.0.1:${String(apiPort)}`
  process.env.MOLE_OFFICE_VITE_CACHE = cacheDir
  // The plugin stands down when a test started the Vite, and this test is about the plugin.
  delete process.env.MOLE_OFFICE_NO_WATCH

  const config = await moleOfficeConfig({ command: 'serve', mode: 'test' })
  const clocked = registerThisBrowserApp(process.env.MOLE_OFFICE_API, 'panelx', 0, null, TEST_CLOCK)
  vite = await createServer({
    ...config,
    configFile: false,
    plugins: config.plugins?.map((plugin) =>
      plugin && typeof plugin === 'object' && 'name' in plugin && plugin.name === clocked.name ? clocked : plugin,
    ),
    logLevel: 'silent',
    /**
     * A WATCHER THAT LOOKS AT NO FILE. The plugin acts only when MOLE_OFFICE_NO_WATCH is unset, and
     * that same setting is what turns Vite's watcher on, so this Vite would watch the checkout. A
     * watching Vite restarts when a file vite.config.ts imports changes, and a restart closes its page
     * server: the plugin gives its row up and files a new one from this same process. In the recorded
     * failure, on 4 September 2026 tests/freshness-is-provable.test.ts moved src/shared/time.ts
     * in the checkout, and the count here came out at seven. This test is about the rounds, not about
     * hot reload, so it watches nothing. `watch: null` would not do it: Vite's merge skips a null.
     *
     * MUTATION PROOF: take `watch: { ignored: () => true }` out of this line, and the two cases after
     * A FILE VITE.CONFIG.TS IMPORTS CHANGES go red. Put it back for green.
     */
    server: { host: '127.0.0.1', port: 0, strictPort: false, watch: { ignored: () => true } },
  })
  await vite.listen()

  // A few rounds of the quick cadence with nothing to talk to. Vite is serving all the same.
  await sleep(3_000)
  seen.whileNothingAnswered = [...asked]
  const address = vite.httpServer?.address()
  if (address !== null && address !== undefined && typeof address !== 'string') {
    const page = await fetch(`http://127.0.0.1:${String(address.port)}/`)
    seen.viteServedAPage = page.ok
  }

  // NOW THE API APPEARS, which is the race that lost.
  standIn = await startTheStandIn(apiPort)
  await untilAsked(
    (all) => all.some((one) => one.url.startsWith('/api/resources') && one.method === 'POST'),
    'the browser app registered itself once an API answered',
  )
  seen.afterTheApiAppeared = [...asked]

  /**
   * A FILE VITE.CONFIG.TS IMPORTS CHANGES, as when tests/freshness-is-provable.test.ts moved
   * src/shared/time.ts. Here a file in this test's own folder is declared one of those files and its
   * time is changed, so nothing in the checkout is touched. A Vite that watched it would restart,
   * and the browser app would give up its row and file a second one before the count below.
   */
  movedDir = aTestDatabaseFolder('late-api-moved')
  const moved = join(movedDir, 'a-file-vite-config-imports.mjs')
  writeFileSync(moved, 'export {}\n', 'utf8')
  vite.config.configFileDependencies.push(moved)
  vite.watcher.add(moved)
  await sleep(1_500)
  const later = new Date(Date.now() + 2_000)
  utimesSync(moved, later, later)

  /**
   * A completed health round after the file change, on the short test clock. Await the write
   * chain too, so a duplicate registration triggered by that health read is included in the snapshot.
   */
  const healthBefore = asked.filter((one) => one.url.startsWith('/api/health')).length
  await untilAsked(
    (all) => all.filter((one) => one.url.startsWith('/api/health')).length > healthBefore,
    'the browser app read health again on the same database',
  )
  await ((globalThis as Record<symbol, unknown>)[WHAT_THE_BROWSER_APP_WROTE_DOWN] as {
    writing: Promise<unknown> | null
  }).writing
  seen.afterAWholeRoundOnTheSameDatabase = [...asked]

  // AND NOW THE API IS ANSWERING OUT OF A DIFFERENT DATABASE, which is a different ledger.
  world = WORLDS.onAnotherDatabase
  await untilAsked(
    (all) => all.filter((one) => one.url.startsWith('/api/resources') && one.method === 'POST').length >= 2,
    'the browser app wrote itself into the new ledger',
  )
  seen.afterTheDatabaseChanged = [...asked]
}, 240_000)

afterAll(async () => {
  if (vite !== null) await vite.close()
  vite = null
  if (standIn !== null) await new Promise<void>((done) => { standIn?.close(() => { done() }) })
  standIn = null
  rmSync(cacheDir, { recursive: true, force: true })
  if (movedDir !== '') removeThisTestFolder(movedDir)
  delete process.env.MOLE_OFFICE_API
  delete process.env.MOLE_OFFICE_VITE_CACHE
  delete (globalThis as Record<symbol, unknown>)[WHAT_THE_BROWSER_APP_WROTE_DOWN]
  asked = []
})

/**
 * EVERY POST THE PLUGIN MADE TO REGISTER A PROCESS, IN ORDER.
 *
 * `/api/resources` EXACTLY, not everything under it. `POST /api/resources/<id>/release` is what the
 * plugin sends when Vite shuts down, and it is the opposite act: it gives a row up. Counted as a
 * registration it would make "how many times did this write itself down" grow every time a Vite
 * closed. The recorded failure counted seven when it should have been two, and
 * this is one of the two ways that number could be wrong that anybody has been able to name.
 */
function registrations(all: Asked[]): Asked[] {
  return all.filter((one) => one.method === 'POST' && one.url.replace(/\?.*$/, '') === '/api/resources')
}

/**
 * WHAT THE STAND-IN WAS ASKED, IN ONE LINE, FOR A FAILING ASSERTION TO CARRY.
 *
 * A count on its own cannot be acted on. The duplicate-registration report was open for a day on
 * "expected 2, got 7" with nothing saying what the seven were or who sent them.
 *
 * THE SENDER'S PID, NOT ONLY ITS SESSION. The stand-in hands every caller the same session id, so
 * the session cannot tell this process from another one that reached the same port. A registration
 * carries its sender's pid as `key`, and this test's own pid is printed beside it. The port is chosen
 * and released three seconds before the stand-in listens on it, so another test's process can be
 * given it in between; whether that is what made the seven has not been shown.
 */
function whatItWasAsked(all: Asked[]): string {
  const sender = (one: Asked): string => {
    const key = (one.body as { key?: unknown } | null)?.key
    return typeof key === 'string' ? `, key ${key}` : ''
  }
  return `this test's pid is ${String(process.pid)}: ` +
    all.map((one) => `${one.method} ${one.url} (session ${one.session ?? 'none'}${sender(one)})`).join(' | ')
}

describe('the browser app starts before the API and writes itself down anyway', () => {
  it('serves normally while nothing is answering on the API address', () => {
    expect(HOW_OFTEN).toEqual({ quickly: 1_000, slowly: 30_000, sayNothingHasAnsweredAfter: 60_000 })
    expect(seen.viteServedAPage, 'the browser app has to serve whether or not the ledger is up').toBe(true)
    expect(registrations(seen.whileNothingAnswered)).toHaveLength(0)
  })

  it('files a session record and registers itself once an API answers, with nothing restarted', () => {
    const rows = registrations(seen.afterTheApiAppeared)
    expect(rows, 'the browser app never registered after the API appeared').toHaveLength(1)
    const record = seen.afterTheApiAppeared.find((one) => one.method === 'POST' && one.url.startsWith('/api/records'))
    expect(record, 'it registered without filing a session record to own the row').toBeTruthy()
    expect((record?.body as { kind: string; title: string }).kind).toBe('session')
    expect((record?.body as { kind: string; title: string }).title).toBe('The browser app')
  })

  it('registers this very process, with the world the API answered in', () => {
    const row = registrations(seen.afterTheApiAppeared)[0]
    const body = row?.body as { type: string; key: string; detail: string; world?: string }
    expect(body.type).toBe('process')
    expect(body.key).toBe(String(process.pid))
    expect(body.detail).toBe('the browser app')
    // THE WORLD OFF THE API'S OWN REPLY, not one the browser app worked out. A Vite has no checkout
    // facts of its own; what matters about it is which Mole Office its proxy points at.
    expect(body.world).toBe(formatWorldHeader(WORLDS.first))
    // And the row is owned by the session record it just filed.
    expect(row?.session).toBe(`a-session-record-in-${WORLDS.first.database}`)
  })

  it('and it asked the API which world it is in before writing anything', () => {
    const health = seen.afterTheApiAppeared.findIndex((one) => one.url.startsWith('/api/health'))
    const firstWrite = seen.afterTheApiAppeared.findIndex((one) => one.method === 'POST')
    expect(health).toBeGreaterThanOrEqual(0)
    expect(health).toBeLessThan(firstWrite)
  })
})

describe('what counts as a registration', () => {
  /**
   * The helper the two counting assertions rest on. A release is a POST whose path STARTS WITH
   * /api/resources and is not a registration, and counting it would make those assertions grow with
   * every Vite that closed in this worker.
   */
  it('counts a registration and not the release that gives the row up', () => {
    const asRow = (method: string, url: string): Asked => ({ method, url, session: null, body: null })
    expect(
      registrations([
        asRow('POST', '/api/resources'),
        asRow('POST', '/api/resources/a-row-in-1111111111111111/release'),
        asRow('GET', '/api/resources'),
        asRow('POST', '/api/records'),
      ]),
    ).toHaveLength(1)
  })
})

describe('it writes one row while the ledger it wrote into is the one being read', () => {
  it('writes nothing more on a later round against the same database', () => {
    // A WHOLE ROUND OF THE WATCH WENT BY. The row is still live and still true, so nothing is
    // written: two rows for one process are what the orphan report reads as two processes.
    expect(
      registrations(seen.afterAWholeRoundOnTheSameDatabase),
      whatItWasAsked(seen.afterAWholeRoundOnTheSameDatabase),
    ).toHaveLength(1)
    // It did keep looking, which is what makes the round above a measurement rather than a wait.
    expect(
      seen.afterAWholeRoundOnTheSameDatabase.filter((one) => one.url.startsWith('/api/health')).length,
    ).toBeGreaterThan(seen.afterTheApiAppeared.filter((one) => one.url.startsWith('/api/health')).length)
  })
})

describe('it writes itself down again when the API comes back on another database', () => {
  it('registers a second time, in the new ledger and under a session record filed there', () => {
    const rows = registrations(seen.afterTheDatabaseChanged)
    expect(rows, whatItWasAsked(seen.afterTheDatabaseChanged)).toHaveLength(2)
    const second = rows[1]
    const body = second?.body as { type: string; key: string; world?: string }
    expect(body.type).toBe('process')
    expect(body.key).toBe(String(process.pid))
    expect(body.world).toBe(formatWorldHeader(WORLDS.onAnotherDatabase))
    /**
     * A SESSION RECORD IN THE NEW DATABASE. The one it filed before is a row in the old file, and a
     * resource is owned by a session record: a row pointing at a record that is not in the same
     * database is a row whose owner nobody can read.
     */
    expect(second?.session).toBe(`a-session-record-in-${WORLDS.onAnotherDatabase.database}`)
  })
})
