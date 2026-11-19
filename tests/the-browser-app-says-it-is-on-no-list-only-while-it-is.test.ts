// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BROWSER APP SAYS IT IS ON NO LIST ONLY WHILE IT IS ON NO LIST.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * A defect found by the fourth GROUND verifier on 4 September 2026 on a worktree
 * stack. The browser app registered itself at 05:05:57 and printed *The browser app is in the ledger
 * of what is running*. At 05:11:57 the API half was stopped, and within thirty seconds the browser
 * app printed:
 *
 *     The browser app has been unable to write itself in the ledger of what is running for a
 *     minute (fetch failed). It is serving normally; nothing on any list says this process is
 *     here yet. It keeps trying every 30 seconds.
 *
 * The last sentence was false when it was printed. The row was live the whole time,
 * registered at 05:05:57 and never rewritten, and it was still there when the API came back.
 *
 * TWO THINGS WERE WRONG. The clock behind "for a minute" was set once, when the http server started
 * listening, and never again — so the first failed attempt after a successful registration found a
 * wait already longer than a minute. And the sentence never looked at whether this process holds a
 * row at all.
 *
 * It is a false statement about the ledger, on the terminal a person reads to find out what is
 * running. Truth before convenience is the principle above USER.md's invariants, and the reason
 * this ledger exists is that nobody could tell a process nobody registered from one nobody started.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PROVES
 * ---------------------------------------------------------------------------------------
 *
 * 1. The sentence stops after registration: more than a minute goes by, registered, and nothing is
 *    said.
 * 2. It stays stopped while the API is DOWN, because the row is still in the database and still
 *    what a person reading the list will find. This is the defect, and it is the assertion that
 *    goes red when the fix is taken out.
 * 3. It comes back when this process really is on no list again: the API returns on a different
 *    database, which is a different ledger, and the write into it fails — so the row this process
 *    holds is in a file nobody is reading and it has no other.
 *
 * ---------------------------------------------------------------------------------------
 * THE STAND-IN, AND WHY IT IS NOT A REAL MOLE OFFICE
 * ---------------------------------------------------------------------------------------
 *
 * The same stand-in `tests/the-browser-app-waits-for-the-api-to-answer.test.ts` uses, and for the
 * same reason: what is under test is the browser app's half. A real API cannot be made to go away
 * and come back on another database on cue without doing exactly that, and the world header it
 * answers with is formatted by the one declaration in src/config/world-header.mjs, so what the
 * browser app reads is what a Mole Office really sends.
 *
 * The plugin receives a short test clock. The shipped minute and thirty-second defaults are
 * asserted below, and a real Vite still drives the listening and closing hooks.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer as createHttpServer, type Server } from 'node:http'
import { createServer as createProbe } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { createServer, type ViteDevServer } from 'vite'
import { formatWorldHeader } from '../src/config/world-header.mjs'
import moleOfficeConfig, { HOW_OFTEN, registerThisBrowserApp } from '../vite.config.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TEST_CLOCK = { quickly: 25, slowly: 100, sayNothingHasAnsweredAfter: 200 }

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** The sentence this whole file is about. */
const THE_FALSE_SENTENCE = 'nothing on any list says this process is here yet'

/** The two worlds this test's stand-in answers in, one after the other. */
const WORLDS = {
  first: {
    database: '3333333333333333',
    repository: REPO.replace(/\/$/, ''),
    port: '29998',
    head: 'abc1234',
    standing: 'scratch',
  },
  onAnotherDatabase: {
    database: '4444444444444444',
    repository: REPO.replace(/\/$/, ''),
    port: '29998',
    head: 'abc1234',
    standing: 'scratch',
  },
}

let world = WORLDS.first
/** When true the stand-in refuses every write, so registration cannot finish. */
let refuseWrites = false
let registrations = 0
let standIn: Server | null = null
let vite: ViteDevServer | null = null
let cacheDir = ''
let apiPort = 0

/** Everything the plugin printed, in order, and which call it came from. */
const printed: { level: 'warn' | 'info'; text: string }[] = []

/** What had been printed at each point of the run. Filled in `beforeAll`. */
const seen: {
  aMinuteAfterRegistering: string[]
  whileTheApiWasDownAndTheRowWasLive: string[]
  afterTheLedgerMovedAndTheWriteFailed: string[]
} = {
  aMinuteAfterRegistering: [],
  whileTheApiWasDownAndTheRowWasLive: [],
  afterTheLedgerMovedAndTheWriteFailed: [],
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
    req.on('data', () => {})
    req.on('end', () => {
      const url = req.url ?? ''
      res.setHeader('x-mole-office-world', formatWorldHeader(world))
      res.setHeader('content-type', 'application/json')
      if (refuseWrites && req.method === 'POST') {
        res.statusCode = 500
        res.end(JSON.stringify({ error: 'this stand-in is refusing writes on purpose' }))
        return
      }
      if (url.startsWith('/api/records')) {
        if (req.method === 'GET') {
          // THE PLUGIN READS THE SESSION ROWS BEFORE IT FILES ITS OWN, to close the ones an earlier
          // start replaced. This stand-in's ledger holds none, so the honest answer is an empty
          // list. Answering it as though it were a new record made the browser app warn about a
          // ledger that had answered perfectly well.
          res.end(JSON.stringify({ records: [] }))
          return
        }
        res.end(JSON.stringify({ record: { id: `a-session-record-in-${world.database}` } }))
        return
      }
      if (url.startsWith('/api/resources')) {
        registrations += 1
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

function stopTheStandIn(): Promise<void> {
  const held = standIn
  standIn = null
  if (held === null) return Promise.resolve()
  return new Promise<void>((done) => { held.close(() => { done() }) })
}

/** Wait until `test` is happy with what has been printed, or say what was printed. */
async function untilPrinted(test: () => boolean, what: string, within = 90_000): Promise<void> {
  const stopAt = Date.now() + within
  while (Date.now() < stopAt) {
    if (test()) return
    await sleep(25)
  }
  throw new Error(
    `${what} did not happen within ${String(within / 1000)}s. What was printed: ` +
      `${printed.map((one) => `${one.level}: ${one.text}`).join(' | ') || 'nothing at all'}.`,
  )
}

const warnings = (): string[] => printed.filter((one) => one.level === 'warn').map((one) => one.text)

let realWarn: typeof console.warn
let realInfo: typeof console.info

beforeAll(async () => {
  apiPort = await freePort()
  cacheDir = mkdtempSync(join(tmpdir(), 'mole-office-on-no-list-'))
  process.env.MOLE_OFFICE_API = `http://127.0.0.1:${String(apiPort)}`
  // Its own cache directory: a worktree's node_modules is a link to the main checkout's, and a Vite
  // started here would otherwise rewrite the dependency cache the owner's own dev server reads.
  process.env.MOLE_OFFICE_VITE_CACHE = cacheDir
  // The plugin stands down when a test started the Vite, and this test is about the plugin.
  delete process.env.MOLE_OFFICE_NO_WATCH

  realWarn = console.warn
  realInfo = console.info
  console.warn = (...parts: unknown[]): void => { printed.push({ level: 'warn', text: parts.join(' ') }) }
  console.info = (...parts: unknown[]): void => { printed.push({ level: 'info', text: parts.join(' ') }) }

  // THE API IS THERE FROM THE START, so the browser app gets in at once. The race this file is
  // about is not the first registration; it is everything after it.
  standIn = await startTheStandIn(apiPort)
  const config = await moleOfficeConfig({ command: 'serve', mode: 'test' })
  const clocked = registerThisBrowserApp(process.env.MOLE_OFFICE_API, 'panelx', 0, null, TEST_CLOCK)
  vite = await createServer({
    ...config,
    configFile: false,
    plugins: config.plugins?.map((plugin) =>
      plugin && typeof plugin === 'object' && 'name' in plugin && plugin.name === clocked.name ? clocked : plugin,
    ),
    logLevel: 'silent',
    server: { port: 0, strictPort: false },
  })
  await vite.listen()

  await untilPrinted(
    () => registrations >= 1,
    'the browser app registered itself with a stand-in that was already answering',
    45_000,
  )

  /**
   * PAST THE WARNING THRESHOLD, ON THE SHORT TEST CLOCK.
   *
   * Waiting after registration also passes the threshold measured from listening, which is the
   * clock the fault used. Its first failed attempt would then print the sentence.
   */
  await sleep(TEST_CLOCK.sayNothingHasAnsweredAfter * 2)
  seen.aMinuteAfterRegistering = warnings()

  /**
   * NOW THE API GOES AWAY, AND THE ROW STAYS WHERE IT IS. This is the state the verifier measured:
   * the row is live in the database, and the only thing that has failed is asking about it.
   *
   * The quiet window covers several watch rounds and the warning threshold on the test clock,
   * so a plugin that says anything here has had its chance to.
   */
  await stopTheStandIn()
  await sleep(TEST_CLOCK.sayNothingHasAnsweredAfter + TEST_CLOCK.slowly * 3)
  seen.whileTheApiWasDownAndTheRowWasLive = warnings()

  /**
   * AND NOW IT REALLY IS ON NO LIST. The API comes back on another database — a different ledger,
   * so the row this process holds is in a file nobody is reading — and it refuses the write, so
   * this process cannot get into the new one either.
   */
  world = WORLDS.onAnotherDatabase
  refuseWrites = true
  standIn = await startTheStandIn(apiPort)
  await untilPrinted(
    () => warnings().some((text) => text.includes(THE_FALSE_SENTENCE)),
    'the browser app said it is on no list once it really was on no list',
    120_000,
  )
  seen.afterTheLedgerMovedAndTheWriteFailed = warnings()
}, 300_000)

afterAll(async () => {
  console.warn = realWarn
  console.info = realInfo
  if (vite !== null) await vite.close()
  vite = null
  await stopTheStandIn()
  rmSync(cacheDir, { recursive: true, force: true })
  delete process.env.MOLE_OFFICE_API
  delete process.env.MOLE_OFFICE_VITE_CACHE
})

describe('the sentence stops once the browser app is on the list', () => {
  it('got in, which is the control', () => {
    // Without this a run where the plugin never started would look exactly like a run where it
    // stayed quiet, and the two mean opposite things.
    expect(HOW_OFTEN).toEqual({ quickly: 1_000, slowly: 30_000, sayNothingHasAnsweredAfter: 60_000 })
    expect(registrations).toBeGreaterThanOrEqual(1)
    expect(printed.some((one) => one.level === 'info' && one.text.includes('is in the ledger of what is running'))).toBe(
      true,
    )
  })

  it('says nothing for the whole minute after registering', () => {
    expect(seen.aMinuteAfterRegistering.filter((text) => text.includes(THE_FALSE_SENTENCE))).toEqual([])
  })
})

describe('it says nothing while the API is down and its row is still live', () => {
  /**
   * THE WHOLE OF THE FIX. Before it, this is where the false sentence appeared: the API had gone,
   * the clock behind "for a minute" had been running since the process started, and nothing asked
   * whether this process holds a row. It does. The row is live, in the database, and it is what a
   * person reading the list will find.
   */
  it('does not say it is on no list, because it is on one', () => {
    expect(
      seen.whileTheApiWasDownAndTheRowWasLive.filter((text) => text.includes(THE_FALSE_SENTENCE)),
      'the browser app said nothing has it while its own row was live',
    ).toEqual([])
  })

  it('and said nothing else about the ledger either', () => {
    // The fix is not silence about a real fault. Nothing had gone wrong that this process could
    // report truthfully, so nothing was reported.
    expect(seen.whileTheApiWasDownAndTheRowWasLive).toEqual([])
  })
})

describe('it says it again when it really is on no list', () => {
  it('says it once the ledger has moved and the write into the new one failed', () => {
    const said = seen.afterTheLedgerMovedAndTheWriteFailed.filter((text) => text.includes(THE_FALSE_SENTENCE))
    expect(said, 'the sentence never came back when it became true again').toHaveLength(1)
    expect(said[0]).toContain('It is serving normally')
    expect(said[0]).toContain('It keeps trying every 30 seconds.')
    expect(said[0]).toBe(
      'The browser app has been unable to write itself in the ledger of what is running for a ' +
        'minute (filing the session record answered 500). It is serving normally; nothing on any list says this process ' +
        'is here yet. It keeps trying every 30 seconds.',
    )
  })

  it('says it once per stretch of being on no list, not once per attempt', () => {
    // It keeps trying every second while it is out, so a sentence per attempt would be a wall of
    // them. One is the whole point of the flag behind it.
    expect(seen.afterTheLedgerMovedAndTheWriteFailed.filter((text) => text.includes(THE_FALSE_SENTENCE))).toHaveLength(1)
  })
})
