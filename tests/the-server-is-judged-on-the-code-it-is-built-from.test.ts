// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SERVER IS JUDGED AGAINST THE CODE IT IS BUILT FROM, AND NOT AGAINST THE BROWSER APP'S.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `aI9V57-ZTyv0`, found by the third GROUND verifier on 4 September 2026. The server's
 * freshness was measured against every file under `src/`, the browser app's code included. So
 * saving one file under `src/web`, with the ordinary `npm run dev` stack running and nothing else
 * changed, made the API report itself stale: `GET /api/health` answered ok false with "This server
 * has been running code older than the checkout ... Restart it", and the page was blocked by the
 * red banner about a server that was running exactly the right code.
 *
 * It never cleared. `tsx watch` restarts the server on the files the server imports, and a page
 * file is not one of them, so the count went up for as long as the stack was left alone. Every
 * measuring tool that calls `refuseAStaleWorld` — the zoom sweep, the duplicate-key census, the
 * press census, the browser review — then refused to measure a world that was right.
 *
 * That is criterion G4 broken in the direction the F2 answer forbids. The rule: normally nothing
 * shows, and a red banner appears only when something is wrong. Editing a page file is normal use.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE
 * ---------------------------------------------------------------------------------------
 *
 * 1. A change under `src/web` alone leaves the server as new as the checkout, and healthy.
 * 2. The page's own half of the reading moves to that file, so nothing is lost: the page is still
 *    told its code went old, by the number that is about the page.
 * 3. A change under `src/server` does make the server stale, and health says so — the fix does not
 *    turn the check off, it points it at the right folders.
 * 4. It stays stale until a reload: a server started from the same tree after the change is fresh
 *    while the first one is still behind.
 *
 * ---------------------------------------------------------------------------------------
 * IT DOES NOT TOUCH THIS CHECKOUT, AND THAT IS DELIBERATE
 * ---------------------------------------------------------------------------------------
 *
 * The same reasoning as `tests/staleness-is-counted-from-when-it-started.test.ts`, which this
 * borrows its setup from. A file left newer than the tree for the length of a test would make every
 * other server in the same suite run report itself stale, and twelve test files run at once. So the
 * parts of the checkout a server needs are copied into a temporary directory and the servers are
 * started there. `REPO_ROOT` in src/config/settings.mjs is found from the code's own location, so a
 * server started from the copy reads the copy — its own `src/`, its own newest file, its own
 * freshness. Nothing outside that directory is touched, and no bytes are written even inside it:
 * `utimes` moves a modification time, which is the whole of what the reading looks at.
 */

import { apiServerArguments } from './helpers.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { cpSync, readdirSync, rmSync, symlinkSync, utimesSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { THE_HOLDER_FOLDERS, THE_PAGES_FOLDERS, THE_SERVER_FOLDERS, THE_WINDOW_FOLDERS, THE_WORKER_FOLDERS } from '../src/config/newest-source.mjs'
import type { RuntimeRecord } from '../src/shared/runtime.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { namedWaits } from './a-start-names-its-wait.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))

/** Two seconds, so a stale server crosses the grace inside this test rather than in fifteen. */
const GRACE = 2

/** The two files this test moves the clock on, one on each side of the boundary. */
const EDITED = { page: 'src/web/App.tsx', server: 'src/server/lib/health.ts' }

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

interface Health {
  ok: boolean
  wrong?: string[]
  code: { verdict: string; staleFor: number | null; grace: number }
}

/** One reading of everything this test asks about, or null while the server is not answering. */
interface Reading {
  runtime: RuntimeRecord
  health: Health
  freshnessHeader: string
}

let dir = ''
let first: ChildProcess | null = null
let second: ChildProcess | null = null
let firstApi = ''
let secondApi = ''

/** What each step of the run saw. Filled in `beforeAll`; the tests below only read it. */
const seen: {
  atTheStart: Reading | null
  afterThePageChanged: Reading | null
  afterTheServerChanged: Reading | null
  theFirstServerWhileTheSecondWasStarting: Reading | null
  aServerStartedAfterTheChange: Reading | null
} = {
  atTheStart: null,
  afterThePageChanged: null,
  afterTheServerChanged: null,
  theFirstServerWhileTheSecondWasStarting: null,
  aServerStartedAfterTheChange: null,
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
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

/** Start one server from the copy, as its own process group so one signal stops all of it. */
function start(port: number, name: string): ChildProcess {
  return spawn(join(REPO, 'node_modules/.bin/tsx'), apiServerArguments(), {
    cwd: dir,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      MOLE_OFFICE_PORT: String(port),
      MOLE_OFFICE_DB: join(dir, `${name}.db`),
      MOLE_OFFICE_STALE_CODE_GRACE: String(GRACE),
      LOG_LEVEL: 'warn',
      // Not under a test runner as far as the child is concerned: it is a real server, and these
      // would make src/server/db/client.ts refuse a database nobody named.
      VITEST: undefined,
      VITEST_WORKER_ID: undefined,
    } as NodeJS.ProcessEnv,
  })
}

function stop(child: ChildProcess | null): void {
  if (child?.pid === undefined || child.pid === null) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    // Already gone, which is the outcome that was wanted.
  }
}

/** One reading of a server, or null while it is not answering. */
async function read(api: string): Promise<Reading | null> {
  try {
    const answered = await fetch(`${api}/api/health`, { headers: { 'x-mole-office-workspace': 'default' } })
    const freshnessHeader = answered.headers.get('x-mole-office-freshness') ?? ''
    const health = (await answered.json()) as Health
    const record = await fetch(`${api}/api/runtime`, { headers: { 'x-mole-office-workspace': 'default' } })
    if (!record.ok) return null
    return { runtime: (await record.json()) as RuntimeRecord, health, freshnessHeader }
  } catch {
    return null
  }
}

/** Wait until a server answers at all, or say how long it was given. */
async function untilItAnswers(api: string, what: string, within = 90_000): Promise<Reading> {
  // A WAIT OF 30 SECONDS IS NAMED IN THE LOG. tests/a-start-names-its-wait.ts.
  const waits = namedWaits(`the start of ${what}`)
  waits.wait(`its first answer at ${api}/api/health`)
  const stop = Date.now() + within
  try {
    while (Date.now() < stop) {
      const now = await read(api)
      if (now !== null) return now
      await sleep(250)
    }
  } finally {
    waits.done()
  }
  throw new Error(`${what} never answered ${api} within ${String(within / 1000)}s.`)
}

/** Wait until a reading satisfies `test`, and say what the last one was when it does not. */
async function until(api: string, test: (r: Reading) => boolean, what: string, within = 60_000): Promise<Reading> {
  const waits = namedWaits('this test')
  waits.wait(`${api} to give a reading that shows ${what}`)
  const stop = Date.now() + within
  let last: Reading | null = null
  try {
    while (Date.now() < stop) {
      last = await read(api)
      if (last !== null && test(last)) return last
      await sleep(250)
    }
  } finally {
    waits.done()
  }
  throw new Error(
    `${what} did not happen within ${String(within / 1000)}s. The last reading was ` +
      `${last === null ? 'nothing at all' : `${last.runtime.freshness.verdict}, ok ${String(last.health.ok)}, ${last.freshnessHeader}`}.`,
  )
}

beforeAll(async () => {
  dir = aTestDatabaseFolder('server-folders')
  // What a server needs and nothing else: its code, its migrations, and the two files that say how
  // to load them. node_modules is linked rather than copied — it is the same tree either way.
  // src/config holds roles.json (copied with src), which the server reads before it serves and does not
  // start without (P3, P4): a copy of the program without it is not a program that starts.
  for (const part of ['src', 'drizzle', 'package.json', 'tsconfig.json', 'tools/check-worktrees.mjs', 'tools/live-processes.mjs']) {
    cpSync(join(REPO, part), join(dir, part), { recursive: true })
  }
  symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'))

  const port = await freePort()
  firstApi = `http://127.0.0.1:${String(port)}`
  first = start(port, 'first')
  await untilItAnswers(firstApi, 'the server')
  seen.atTheStart = await until(
    firstApi,
    (r) => r.runtime.freshness.verdict === 'as new as the checkout',
    'the server settled as new as the checkout before anything was changed',
  )

  /**
   * STEP ONE: A PAGE FILE, AND NOTHING ELSE. Then wait past the grace and past the second that
   * `isBehindTheCheckout` rounds to, so that a server which counted this as its own change has had
   * every chance to say so.
   */
  const pageChangedAt = new Date()
  utimesSync(join(dir, EDITED.page), pageChangedAt, pageChangedAt)
  await sleep((GRACE + 3) * 1000)
  seen.afterThePageChanged = await untilItAnswers(firstApi, 'the server after the page file changed')

  /** STEP TWO: A FILE THE SERVER REALLY IS BUILT FROM. This one must be noticed. */
  const serverChangedAt = new Date()
  utimesSync(join(dir, EDITED.server), serverChangedAt, serverChangedAt)
  seen.afterTheServerChanged = await until(
    firstApi,
    (r) => r.runtime.freshness.verdict === 'older than the checkout' && !r.health.ok,
    'the server reported itself older than the checkout, and unhealthy, after a change under src/server',
  )

  /**
   * STEP THREE: A SECOND SERVER FROM THE SAME TREE, STARTED AFTER THE CHANGE. It loaded the changed
   * file, so it is fresh — which is what "stale until it reloads" means, measured rather than
   * asserted. The first one is read again at the same time, so the two readings are of one tree.
   */
  const otherPort = await freePort()
  secondApi = `http://127.0.0.1:${String(otherPort)}`
  second = start(otherPort, 'second')
  seen.aServerStartedAfterTheChange = await until(
    secondApi,
    (r) => r.runtime.freshness.verdict !== 'unknown',
    'the second server worked out its own freshness',
    90_000,
  )
  seen.theFirstServerWhileTheSecondWasStarting = await untilItAnswers(firstApi, 'the first server, read again')
}, 240_000)

afterAll(async () => {
  stop(first)
  stop(second)
  await sleep(500)
  rmSync(dir, { recursive: true, force: true })
})

describe('the two folder lists are the two halves of src/, and neither is the whole of it', () => {
  it('judges the server on src/server and never on src/web', () => {
    expect(THE_SERVER_FOLDERS).toContain('src/server')
    expect(THE_SERVER_FOLDERS).not.toContain('src/web')
    // The two folders outside its own directory that the server imports from.
    expect(THE_SERVER_FOLDERS).toContain('src/shared')
    expect(THE_SERVER_FOLDERS).toContain('src/config')
  })

  it('judges the page on src/web and never on src/server, which is the same rule mirrored', () => {
    expect(THE_PAGES_FOLDERS).toContain('src/web')
    expect(THE_PAGES_FOLDERS).not.toContain('src/server')
  })

  /**
   * AND BETWEEN THEM THEY COVER EVERYTHING. A new folder under `src/` that neither list names would
   * be code nobody's freshness reading covers: a change there would make no server and no page
   * report itself old, silently. This is the check that would fail the day somebody adds one.
   */
  it('leaves no folder under src/ that no list is judged against', () => {
    // The worker is the third half: its own process, its own list, since part 2d of the messages cluster.
    // The standalone window is the fourth, since cluster H's round 8; no freshness reading covers it yet.
    // The terminal holder is the fifth, since wave 13u; no freshness reading covers it, on purpose.
    const named = new Set([...THE_SERVER_FOLDERS, ...THE_PAGES_FOLDERS, ...THE_WORKER_FOLDERS, ...THE_WINDOW_FOLDERS, ...THE_HOLDER_FOLDERS])
    const present = readdirSync(join(REPO, 'src'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `src/${entry.name}`)
    expect(present.length).toBeGreaterThan(0)
    for (const folder of present) {
      expect(Array.from(named), `${folder} is under src/ and no list names it`).toContain(folder)
    }
  })
})

describe('a change to a page file alone leaves the server as new as the checkout', () => {
  it('starts fresh, which is the control', () => {
    expect(seen.atTheStart?.runtime.freshness.verdict).toBe('as new as the checkout')
    expect(seen.atTheStart?.health.ok).toBe(true)
  })

  it('is still as new as the checkout after a src/web file changed, and still healthy', () => {
    const after = seen.afterThePageChanged
    expect(after, 'the server said nothing after the page file changed').not.toBeNull()
    /**
     * THE WHOLE OF THE FIX. Before it, this reading was "older than the checkout", ok false, and a
     * red banner over the page — about a server running exactly the right code, for ever.
     */
    expect(after?.runtime.freshness.verdict).toBe('as new as the checkout')
    expect(after?.health.ok).toBe(true)
    expect(after?.health.wrong).toBeUndefined()
    expect(after?.health.code.verdict).toBe('fresh')
    // And the header every reply carries says the same, because that is what the page reads.
    expect(after?.freshnessHeader).toContain('verdict=fresh')
    /**
     * AND THE FILE IT NAMES IS NOT THE PAGE FILE THAT JUST CHANGED.
     *
     * This used to say "and it is not under `src/web` at all", which was an assertion about the
     * folder rule rather than about the fix. The folder rule is gone: each program is now judged
     * against the files it imports (`src/config/import-graph.mjs`), and the API server really does
     * import a file out of `src/web` — `lib/attention.ts`, through `lib/records.ts` and
     * `lib/waiting.ts`. `tsx watch` restarts on it,
     * so it belongs in the server's reading, and the old assertion was measuring the mechanism
     * instead of the rule. Problem `TMy3C0ydoYYR`.
     */
    expect(after?.runtime.freshness.newestOnDiskFile).not.toBe(EDITED.page)
  })

  it('and the page is still told, by the number that is about the page', () => {
    const after = seen.afterThePageChanged
    // THE PAGE'S HALF MOVED. Nothing is lost by narrowing the server's half: the page's own reading
    // names the file that changed, which is what src/web/lib/world.ts compares the page against.
    expect(after?.runtime.freshness.newestFileForThePage).toBe(EDITED.page)
    expect(after?.runtime.freshness.newestForThePage).not.toBeNull()
    // The two halves really are different readings now, which is the point of there being two.
    expect(after?.runtime.freshness.newestForThePage).not.toBe(after?.runtime.freshness.newestOnDisk)
  })
})

describe('a change to a file the server is built from still makes it stale', () => {
  it('says older than the checkout, and names the file that changed', () => {
    const after = seen.afterTheServerChanged
    expect(after?.runtime.freshness.verdict).toBe('older than the checkout')
    expect(after?.runtime.freshness.newestOnDiskFile).toBe(EDITED.server)
    expect(after?.runtime.freshness.says).toContain('serving older code')
  })

  it('answers ok false once it has been stale for longer than the grace, and says what to do', () => {
    const after = seen.afterTheServerChanged
    expect(after?.health.ok).toBe(false)
    expect((after?.health.wrong ?? []).join(' ')).toContain('running code older than the checkout')
    expect(after?.health.code.verdict).toBe('stale')
  })

  it('stays stale until it reloads: a server started from the same tree afterwards is fresh', () => {
    // The first server, read at the same moment as the second: still behind, because nothing
    // restarted it.
    expect(seen.theFirstServerWhileTheSecondWasStarting?.runtime.freshness.verdict).toBe('older than the checkout')
    // The second, from the same directory and the same code, having loaded the changed file.
    expect(seen.aServerStartedAfterTheChange?.runtime.freshness.verdict).toBe('as new as the checkout')
    expect(seen.aServerStartedAfterTheChange?.health.ok).toBe(true)
  })
})
