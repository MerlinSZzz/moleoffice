// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * Shared test harness: a throwaway database per test.
 *
 * src/server/db/client.ts reads process.env.MOLE_OFFICE_DB once, when it is first imported, and
 * opens that file. So to point a test at its own database the environment variable has to be
 * set *before* the import happens. That is why every import below is a dynamic `await import`
 * rather than a normal top-of-file import: normal imports all run before any of our code does.
 *
 * `loadAgainWhatANewTestDatabaseNeeds` empties the runner's memory of client.ts and of every module
 * that imports it, so the next import of client.ts really does run again and opens the new file.
 * Without it, the second test in a file would quietly keep using the first test's database.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { namedWaits } from './a-start-names-its-wait.ts'
import { keepTheSetupWait } from './a-start-keeps-its-waits.ts'
import { whenThisHookOrCaseMustEnd } from './the-time-a-hook-has-left.ts'
import { stopEverythingWhenTheProcessEnds } from './what-a-test-process-takes-with-it.ts'
import type Database from 'better-sqlite3'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import {
  createServer as serveOverHttp,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from 'node:http'
import { createHash } from 'node:crypto'
import { createServer } from 'node:net'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { beforeAll, expect, onTestFinished } from 'vitest'
// The case that is running now, or nothing between cases. vitest does not hand it out itself, and
// `@vitest/runner` is the copy vitest runs every case with (vitest pins it to its own version).
// `watchForADeathDuringACase` below reads it to put a server's death into the case it happened in.
import { getCurrentTest } from '@vitest/runner'
// Type only, and therefore erased before this file runs. Naming playwright here does not load it;
// `liveApp` below imports it when a caller asks, so the two hundred tests that never open a
// browser do not pay for one.
import type { Browser, BrowserContext, BrowserContextOptions, Page, Route } from 'playwright'
// Type only, and therefore erased before this file runs. Naming src/server/index.ts here neither
// imports it nor opens a database; `apiApp` below does the real import when a caller asks.
import type { BuiltServer } from '../src/server/index.ts'
import type { FastifyInstance } from 'fastify'
import { SHAPE_SPECS, type FieldSpec } from '../src/shared/kinds.ts'
import { detailKeyForSurface, type Rung } from '../src/shared/detail.ts'
import { addressForOtherMachinesFrom, databasePathFrom, settings } from '../src/config/settings.mjs'
import { THE_PAGES_ENTRY, newestSourceBuiltFrom } from '../src/config/newest-source.mjs'
import { readTheBuildStamp } from '../src/config/build-stamp.mjs'
import { buildThePage, theCommitOf } from '../tools/build-the-page.mjs'
import { theServerBrowserTestsStart } from './the-server-browser-tests-start.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
// The one reader of the tag this file writes into every page it serves. Naming it here is what
// stops the two spellings of that tag drifting apart.
import { THE_API_PORT_TAG } from '../src/web/lib/the-port-written-into-this-page.ts'

/**
 * WAIT UNTIL A PAGE HAS FINISHED DRAWING, re-exported from the one copy of it.
 *
 * Every browser test in this suite used to navigate with `waitUntil: 'networkidle'`. That waits
 * for the network to go quiet, which is a guess about the page made from outside it: it never
 * comes true for a page holding a connection open, and it is true of a page whose every request
 * failed. The page now says when it has finished drawing the address it is at, and this is the
 * wait for that. `tools/the-page-is-ready.mjs` holds it, because the photographing tools are plain
 * JavaScript and cannot import this file; there is one copy and both sides use it.
 */
export { READY_ATTRIBUTE, READY_TIMEOUT_MS, waitForThePage } from '../tools/the-page-is-ready.mjs'
import { testWorldName } from '../src/shared/worlds.ts'
import { THE_PRESENCE_LOOK_SETTING } from '../src/shared/presence-clock.ts'
import { THE_SLEEP_CLOCK_SETTING } from '../src/shared/sleep-clock.ts'
import { SLEEP_TIME_SHORTEST_MINUTES } from '../src/shared/residents.ts'
import defaultFlows from '../src/config/default-flows.json' with { type: 'json' }

/**
 * A SLEEP TIME A PROPOSAL MAY SEND in a test that is not about sleeping. It opened a minute before this process loaded
 * and lasts the shortest length, so a proposal confirmed now is inside a window that was set after it opened: the office
 * begins no sleep for it today, and no other test's clock reaches tomorrow. Tests that set their own clock send their own.
 */
export const A_SLEEP_TIME: { startsAt: string; minutes: number } = (() => {
  const opened = new Date(Date.now() - 60_000)
  return {
    startsAt: `${String(opened.getHours()).padStart(2, '0')}:${String(opened.getMinutes()).padStart(2, '0')}`,
    minutes: SLEEP_TIME_SHORTEST_MINUTES,
  }
})()

/** Register a test-office agent and give its waiter a private file containing that agent's own key. */
export async function aTestAgentsKeyEnvironment(app: FastifyInstance, handle: string, folder: string, workspace = 'default', runtime = 'claude-code'): Promise<NodeJS.ProcessEnv> {
  const reply = await app.inject({
    method: 'POST', url: '/api/records',
    headers: { 'x-mole-office-workspace': workspace, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
    payload: { kind: 'agent', title: handle, data: { handle, runtime, state: 'active' } },
  })
  if (reply.statusCode !== 201) throw new Error(`Could not register the test agent: ${reply.statusCode} ${reply.body}`)
  const key = (reply.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key
  if (typeof key !== 'string' || key === '') throw new Error('The test agent registration answered no key')
  const path = join(folder, `${handle}.key`)
  writeFileSync(path, `${key}\n`, { mode: 0o600, flag: 'wx' })
  const env: NodeJS.ProcessEnv = { ...withoutInheritedEffort(), MOLE_AGENT_KEY_FILE: path }
  delete env.MOLE_AGENT_KEY
  delete env.MOLE_OFFICE_TOOL_CONFIGURATION
  return env
}

/**
 * WAIT UNTIL THE PAGE HAS DRAWN ITSELF AGAIN AFTER A CHANGE OF WIDTH OR OF LIGHT AND DARK.
 *
 * The four-width sweeps used to wait a fixed 300 milliseconds after each change before measuring.
 * Round 28 of wave 13t measured that wait as 82 of the 118 seconds of
 * tests/the-terminal-pages-in-the-browser.test.ts. The page itself was redrawn long before.
 *
 * What a change of size sets going in this app is a `resize` event, `matchMedia` and
 * `ResizeObserver` callbacks, and the React render they ask for. All of those run inside the next
 * frames. So this waits for at least `FRAMES` animation frames, and until nothing in the document has
 * been added, removed or reworded, and the root element has not changed size, for `QUIET_MS`.
 *
 * WHAT IT CANNOT SEE. A change of an attribute alone, such as a class or a style, and a change of
 * size of any element but the root, are not watched. A change booked on a timer later than
 * `QUIET_MS`, with nothing watched changing before it, is not waited for. The fixed sleeps had the
 * same blind spot from their end on. No component on the
 * pages these sweeps visit books a redraw on a timer after a resize (round 28 read each one that
 * listens for a resize). A page that never stops changing fails after `AT_MOST_MS`, naming what kept changing.
 */
export async function theResizeIsDrawn(page: Page): Promise<void> {
  const FRAMES = 3
  const QUIET_MS = 80
  const AT_MOST_MS = 10_000
  await page.evaluate(
    ({ frames, quietMs, atMostMs }) =>
      new Promise<void>((resolve, reject) => {
        const started = performance.now()
        let lastChange = started
        let lastWhat = 'nothing yet'
        let seenFrames = 0
        const changed = (what: string): void => {
          lastChange = performance.now()
          lastWhat = what
        }
        const words = new MutationObserver(() => changed('the document'))
        words.observe(document, { childList: true, subtree: true, characterData: true })
        let firstSizes = true
        const sizes = new ResizeObserver(() => {
          // AN OBSERVER ANSWERS ONCE AS SOON AS IT IS SET, about the size it found. That is not a change.
          if (firstSizes) firstSizes = false
          else changed('the size of the root element')
        })
        sizes.observe(document.documentElement)
        const finish = (fail: Error | null): void => {
          words.disconnect()
          sizes.disconnect()
          if (fail === null) resolve()
          else reject(fail)
        }
        const frame = (): void => {
          seenFrames += 1
          const now = performance.now()
          if (seenFrames >= frames && now - lastChange >= quietMs) return finish(null)
          if (now - started > atMostMs) {
            return finish(new Error(`The page kept changing for ${String(atMostMs)} ms after a resize; the last change was to ${lastWhat}.`))
          }
          requestAnimationFrame(frame)
        }
        requestAnimationFrame(frame)
      }),
    { frames: FRAMES, quietMs: QUIET_MS, atMostMs: AT_MOST_MS },
  )
}

/**
 * HOLD A PAGE'S READS OF ONE CHECKLIST UNTIL THE PRESS IT OFFERED HAS BEEN ANSWERED.
 *
 * A page that follows a checklist reads it again when an agent changes it, so it draws the change. That is right. A
 * test that needs the press the page offered before that read holds the read until the door has answered the press,
 * instead of racing the page. The checklists page reads the one checklist, and the checklists window reads the lists
 * that carry it, so both reads are held. This changes nothing the page sends or draws, only when the read arrives.
 *
 * THE ROUTE STAYS UNTIL THE CASE ENDS, letting every read go on at once after the release. Removing the last route
 * turns the browser's interception off, and a read the page sent at that moment was never answered: the page's re-read
 * after a refused press goes out at the same moment as the release, so a route removed there left the case red.
 */
export async function holdThePagesReadsOfAChecklist(page: Page, list: string): Promise<{ release: () => Promise<void> }> {
  const aReadOfIt = (url: URL): boolean => url.pathname === `/api/checklists/${list}` || url.pathname === '/api/checklists'
  let released = false
  const waiting: (() => void)[] = []
  const goingOn: Promise<void>[] = []
  const handler = (route: Route): Promise<void> => {
    if (released || route.request().method() !== 'GET') return route.continue()
    const going = new Promise<void>((letGo) => waiting.push(letGo)).then(() => route.continue())
    goingOn.push(going)
    return going
  }
  await page.route(aReadOfIt, handler)
  const release = async (): Promise<void> => {
    released = true
    for (const letGo of waiting.splice(0)) letGo()
    await Promise.allSettled(goingOn)
  }
  onTestFinished(async () => {
    // Let the reads it held finish going on before the route goes, so none is continued twice.
    await release()
    await page.unroute(aReadOfIt, handler)
  })
  return { release }
}

/** The module under test, and the connection underneath it, freshly loaded. */
type RecordsApi = typeof import('../src/server/lib/records.ts')
type BlocksApi = typeof import('../src/server/lib/blocks.ts')
type DbClient = typeof import('../src/server/db/client.ts')

export interface TestDb {
  api: RecordsApi
  /**
   * The four writes that change a pipeline's blocks.
   *
   * ITS OWN MODULE, AND THEREFORE ITS OWN HANDLE. A block is filed through its pipeline rather than
   * through `createRecord`, because its title and its position both belong to that pipeline, so a
   * test that wants a block has to reach the same function a route does rather than writing a
   * record itself.
   */
  blocks: BlocksApi
  /**
   * THE MARK A DOOR SETS WHILE IT WRITES A FIELD ONLY IT MAY WRITE (lib/check-field-doors.ts), loaded after the modules
   * were reset so it is the one the records door reads. `writeAVerdictAsItsDoorWould` below uses it.
   */
  doors: typeof import('../src/server/lib/check-field-doors.ts')
  client: DbClient
  /** Where the throwaway database lives, for the rare test that wants to look at the file. */
  file: string
  /** Close the connection and delete the file. Call this in afterEach. */
  close(): void
}

/**
 * THE LIVE OFFICE ROW'S ID, read by the handle it is stored under. A fresh office's own row no longer has its
 * handle as its id, so a test that typed `mole-office` as the id reads it here instead of guessing.
 */
export function theOfficesOwnId(t: Pick<TestDb, 'client'>): string {
  return theOfficesOwnIdIn(t.client.sqlite)
}

/** The same reading on a connection a test opened itself. */
export function theOfficesOwnIdIn(sqlite: Database.Database): string {
  const row = sqlite.prepare("SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0").get() as
    | { id: string }
    | undefined
  if (row === undefined) throw new Error("This database has no live row for the office's own handle.")
  return row.id
}

// The checkout. Resolved from this file rather than from the working directory, so the tests do
// not depend on where the runner was started.
const REPO = fileURLToPath(new URL('..', import.meta.url))
const MIGRATIONS = join(REPO, 'drizzle')

/**
 * THE ONE PLACE A TEST'S FOLDER IS NAMED, MADE AND REMOVED is tests/a-test-folder.ts (problem `lZ7OSjBOhUIO`).
 * It is named here again for the files that already import these from this one.
 */
export { aTestDatabaseFolder, TEST_DATABASE_PREFIX, whenThisTestFolderWasMade } from './a-test-folder.ts'

/**
 * WHAT A LATER TEST DATABASE LOADS AGAIN: these modules, each with every module that imports it.
 *
 * client.ts opens the file MOLE_OFFICE_DB names when it loads. The other seven read their state from
 * the environment when they load, or hold state that nothing sets back: the settings, the sandbox,
 * worktree and gate-count spool folders, the .env file, the ids made in turn, the idle thresholds and
 * the loop watch's last stall.
 */
const LOADED_AGAIN_WITH_THEIR_IMPORTERS = [
  'src/server/db/client.ts',
  'src/config/settings.mjs',
  'src/config/sandbox-folder.mjs',
  'src/config/gate-count-spool.mjs',
  'src/server/db/env.ts',
  'src/server/db/ids.ts',
  'src/server/lib/adapters/index.ts',
  'src/server/lib/loop-watch.ts',
].map((file) => join(REPO, file))

/**
 * EVERY BROWSER MODULE IS LOADED AGAIN TOO, with its importers. A browser module's state lasts one page
 * load, and a new test database stands for a new office, so none of it is carried into the next one.
 */
const THE_BROWSER_FOLDER = `${join(REPO, 'src', 'web')}${sep}`

/**
 * THE MODULES THAT HOLD STATE AND MAY BE KEPT, each with the call that sets it back to how it loads.
 * A call is made only when its module is loaded and kept. events.ts, roles.ts and worldauthority.ts
 * reach settings.mjs, so they are loaded again today and their calls are not made.
 */
const SET_BACK_WHEN_KEPT: readonly (readonly [file: string, call: string, values: readonly unknown[]])[] = [
  ['src/server/lib/bound-address.ts', 'forgetWhatThisProcessBound', []],
  ['src/server/lib/named-timers.ts', 'forgetTheNamedRuns', []],
  ['src/shared/word-settings.ts', 'installSavedWords', [{}, '']],
  // English is the language i18n.ts starts in.
  ['src/shared/i18n.ts', 'setWordLanguage', ['en']],
  ['src/server/lib/events.ts', 'forgetTheChannel', []],
  ['src/server/lib/roles.ts', 'forgetTheRoleCards', []],
  ['src/server/lib/worldauthority.ts', 'forgetTheWorldsOwnAuthority', []],
]

/** One module in vitest's module map, with the four fields `vi.resetModules()` empties. */
interface AModuleNode {
  evaluated: boolean
  promise: unknown
  exports: unknown
  importers: Set<string>
}

/**
 * A module file outside node_modules: the only kind of module a later test database loads again. Most are this
 * checkout's own. A test may also load a copy of a checkout file from a folder it made, and `vi.resetModules()`
 * emptied such a copy too. A package's module and a builtin are never emptied.
 */
function isAModuleFileOutsideThePackages(id: string): boolean {
  return isAbsolute(id) && !id.includes(`${sep}node_modules${sep}`)
}

/**
 * LOAD AGAIN WHAT A NEW TEST DATABASE NEEDS, AND KEEP THE REST. Until 14 November 2026 freshDb called
 * `vi.resetModules()`, which loads every module again. Measured that day in one file, a later call took
 * a median 272 ms with it and 126 ms with this.
 *
 * It walks up from LOADED_AGAIN_WITH_THEIR_IMPORTERS, every mocked module and every browser module,
 * through the importers vitest's module map records for static and dynamic imports alike, and empties
 * each module it reaches as `vi.resetModules()` does. Every importer of an emptied module is emptied
 * too, so no kept module holds an old copy. A test file's own top imports keep the copies they were
 * given, as they did before. The mocker's own `mock:` nodes are left as `vi.resetModules()` leaves
 * them, so a `vi.mock` factory does not run again.
 *
 * IT FAILS RATHER THAN GUESS. settings.mjs is imported at the top of this file, so when it is not in
 * the map under its path, vitest's ids have changed and every lookup here would find nothing. A package's
 * module that imports one this loads again would keep the old copy. Either throws, by name, before
 * anything is emptied.
 */
async function loadAgainWhatANewTestDatabaseNeeds(): Promise<void> {
  const vitest = globalThis as {
    __vitest_worker__?: { evaluatedModules?: { idToModuleMap?: Map<string, AModuleNode> } }
    __vitest_mocker__?: { resolveMocks?: () => Promise<void>; getMockerRegistry?: () => { registryById?: Map<string, unknown> } }
  }
  const map = vitest.__vitest_worker__?.evaluatedModules?.idToModuleMap
  const mocker = vitest.__vitest_mocker__
  if (map === undefined || mocker?.resolveMocks === undefined || mocker.getMockerRegistry === undefined) {
    throw new Error("freshDb: vitest's module map or its mocker is not where this file reads them, so it cannot tell which modules to load again.")
  }
  const settingsFile = join(REPO, 'src', 'config', 'settings.mjs')
  if (!map.has(settingsFile)) {
    throw new Error(`freshDb: ${settingsFile} is not in vitest's module map under its path, although this file imports it, so no module this loads again could be found.`)
  }
  // A vi.doMock or vi.doUnmock still waiting is taken in first, so the mocks read below are the ones the next import meets.
  await mocker.resolveMocks()
  const mocked = mocker.getMockerRegistry().registryById
  if (mocked === undefined) throw new Error("freshDb: vitest's mocker holds no list of mocked modules where this file reads it.")

  const starts = [...LOADED_AGAIN_WITH_THEIR_IMPORTERS, ...mocked.keys()]
  for (const id of map.keys()) {
    // A module keeps its `mock:` node after a vi.doUnmock, so a module mocked once in a file is loaded again for the rest of it.
    if (id.startsWith('mock:')) starts.push(id.slice('mock:'.length))
    else if (id.startsWith(THE_BROWSER_FOLDER)) starts.push(id)
  }
  const again = new Set<string>()
  const walked = new Set<string>()
  const waiting = starts.filter((id) => map.has(id))
  while (waiting.length > 0) {
    const id = waiting.pop()!
    if (walked.has(id)) continue
    walked.add(id)
    // A mocked package or builtin is not emptied, but its importers are.
    if (isAModuleFileOutsideThePackages(id)) again.add(id)
    for (const importer of map.get(id)!.importers) {
      // A `mock:` node imports the real module when its factory reads it. It is the mocker's, and is left as it is.
      if (!map.has(importer) || importer.startsWith('mock:')) continue
      if (!isAModuleFileOutsideThePackages(importer)) {
        throw new Error(
          `freshDb: ${importer} imports ${id}, which a new test database loads again, and it is not a module file ` +
            'outside node_modules, so it would keep the old copy. Nothing was loaded again.',
        )
      }
      waiting.push(importer)
    }
  }

  for (const [file, call, values] of SET_BACK_WHEN_KEPT) {
    const id = join(REPO, file)
    const node = map.get(id)
    if (node === undefined || !node.evaluated || again.has(id)) continue
    const setBack = (node.exports as Record<string, unknown> | undefined)?.[call]
    if (typeof setBack !== 'function') throw new Error(`freshDb: ${file} is kept and has no function ${call} to set it back with.`)
    setBack(...values)
  }
  for (const id of again) {
    const node = map.get(id)!
    node.promise = undefined
    node.exports = undefined
    node.evaluated = false
    node.importers.clear()
  }
}

/**
 * THE SEARCH THREADS BEING STOPPED IN THIS PROCESS are kept in a set on the global object under this key, by
 * src/server/lib/search-thread.ts, which does not export it. It is written out here and not imported, because importing
 * that module loads the database client. A test of a closed test database's folder proves that this is the key the
 * module uses.
 */
export const SEARCH_THREADS_BEING_STOPPED = Symbol.for('mole-office: the search threads being stopped')

export async function freshDb(): Promise<TestDb> {
  await loadAgainWhatANewTestDatabaseNeeds()

  // REMOVED WHEN THE PROCESS ENDS, however it ends, by tests/a-test-folder.ts: `close()` below is called
  // from `afterEach`, and an ending that skips `afterEach` used to leave the directory behind for good.
  // Counted on 18 August 2026: 4,569 abandoned `panelx-test-` directories under the temporary
  // directory, and 29,651 abandoned transcript directories beside them, 130 MB in all. That count
  // names the prefix these directories carried on the day; it is `mole-office-test-` since the rename.
  const dir = aTestDatabaseFolder('test')
  const file = join(dir, 'panelx.db')
  process.env.MOLE_OFFICE_DB = file
  const started = whatThisProcessStarted()
  // The SQL half of the migrations, already run once in this process: see `theMigratedSchema` below.
  copyFileSync(await theMigratedSchema(started), file)

  const client = await import('../src/server/db/client.ts')
  // THE PRODUCT'S OWN MIGRATION PATH, not drizzle's `migrate` on its own.
  //
  // It was the bare `migrate(...)` until the workspace boundary arrived, and that was a difference
  // nobody could see: `migrateInPlace` runs the SQL migrations AND the four data migrations, and
  // one of those is what declares that the default workspace exists. A test database made by the
  // SQL alone had records whose `workspace_id` said `default` and no workspace of that name, which
  // is a state `npm run db:migrate` cannot produce and every route now refuses. Calling what the
  // command and the server boot both call means a test database is the shape a real one is.
  //
  // It still runs on every test database. On the copy, drizzle's `migrate` inside it reads the journal,
  // finds every SQL migration applied and applies none; every data step, the owner's row, the
  // installation (from this file's path) and the world (from this file's own birth time) are written
  // here, now, exactly as on an empty file.
  const { migrateInPlace } = await import('../src/server/db/migrate.ts')
  migrateInPlace(client.sqlite, MIGRATIONS)
  const api = await import('../src/server/lib/records.ts')
  const blocks = await import('../src/server/lib/blocks.ts')
  const doors = await import('../src/server/lib/check-field-doors.ts')

  return {
    api,
    blocks,
    doors,
    client,
    file,
    close() {
      client.sqlite.close()
      // A SEARCH THREAD STILL BEING STOPPED CAN STILL OPEN THIS DATABASE. A server's close asks its search thread to stop
      // and does not wait for it (src/server/api/search.ts), and a thread that was still loading opens the database file
      // before it looks again whether its server has closed. Removing the folder at that moment failed with ENOTEMPTY.
      // So while a thread is being stopped, the folder is removed once every thread being stopped now has stopped, and
      // this close does not wait for that. A folder still waiting when the process ends is removed with every other
      // test folder (tests/a-test-folder.ts).
      const stops = (globalThis as typeof globalThis & { [SEARCH_THREADS_BEING_STOPPED]?: Set<Promise<void>> })[SEARCH_THREADS_BEING_STOPPED]
      if (stops === undefined || stops.size === 0) {
        removeThisTestFolder(dir)
        return
      }
      void Promise.all(stops).then(() => removeThisTestFolder(dir))
    },
  }
}

/**
 * THE SQL MIGRATIONS, RUN ONCE PER TEST PROCESS AND COPIED, NOT RUN AGAIN FOR EVERY TEST DATABASE.
 *
 * WHAT IT HOLDS. An empty file on which drizzle's `migrate` has run every migration in drizzle/: the
 * same call, on the same folder, that `migrateInPlace` makes at src/server/db/migrate.ts before its
 * data steps. Nothing else has run on it, so it holds the schema, the journal and sqlite_sequence, and
 * no row that depends on a path, a time, an owner or a setting. Every such row is written by the data
 * steps, and `freshDb` still runs `migrateInPlace` on each copy.
 *
 * WHAT IT SAVES. Running the SQL of 113 migrations was about 90 of the 135 ms `migrateInPlace` took on
 * an empty file, measured by r44/start on 9 October 2026 (.scratch/r44/start/probe-split.mts): 136 ms
 * for the whole on an empty file, 45 ms for a copy of this file and `migrateInPlace` on it. About
 * 6,200 `freshDb` calls a run.
 *
 * WHY THE ANSWER STAYS TRUE. A database made from a copy and one made from an empty file hold the
 * same schema and the same rows, with time stamps and the world id (the hash of the file's own path
 * and birth time) set aside; .scratch/r44/start/probe-equivalence.mts compares the two dumps. A
 * migration added to drizzle/ while a process is running is applied to each copy by
 * `migrateInPlace`, which compares the journal, so a stale copy is brought up to date rather than
 * served.
 *
 * ON THE PROCESS RECORD, not in a module variable, because `vi.resetModules()` and a dozen files in
 * one process would each make their own. Removed on the way out with every other test folder.
 */
async function theMigratedSchema(record: StartedByThisProcess): Promise<string> {
  if (record.migratedSchema !== null) return record.migratedSchema
  const dir = aTestDatabaseFolder('migrated-schema')
  const file = join(dir, 'schema.db')
  const { default: Database } = await import('better-sqlite3')
  const { drizzle } = await import('drizzle-orm/better-sqlite3')
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  const sqlite = new Database(file)
  try {
    migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS })
  } finally {
    sqlite.close()
  }
  record.migratedSchema = file
  return file
}

/**
 * The whole served surface, built by the product, not listening on anything.
 *
 * ---------------------------------------------------------------------------------------
 * ASK THE SERVER WHAT IT SERVES; NEVER RETYPE THE LIST
 * ---------------------------------------------------------------------------------------
 *
 * `buildApp()` in src/server/index.ts is the single description of what Mole Office serves: the error
 * handler, the health route, every route group under /api and the 404. This hands it back with the
 * settings a test wants, so a test about the HTTP surface is about the product's surface.
 *
 * It replaced two things at once. Four test files each registered the plugins their author knew
 * about, and "every endpoint is described" was therefore a true statement about each author's idea
 * of Mole Office and said nothing about Mole Office — which is how eight /api/presentation endpoints shipped
 * answering GET /api with `description: null` while four tests promising to prevent that passed.
 * The first repair for that read the `app.register` lines out of src/server/index.ts with a regular
 * expression; the second gave the server a `buildApp()` that does not listen. Both landed. Parsing
 * source was always the stand-in — its own header said so and named this as the destination — so
 * the parser is gone and this is what is left.
 *
 * CALL IT AFTER `freshDb()`. Everything `buildApp` loads opens MOLE_OFFICE_DB at import, so the
 * environment variable has to name a throwaway file first. Importing src/server/index.ts itself is
 * safe at any time: its top-level imports reach no database, which is the point of the dynamic
 * imports inside it.
 *
 * `logLevel: false` because a test that printed a line per request would bury the failures.
 * `production: false` because serving the built browser app needs `dist/web` on disk, and a test
 * that depended on somebody having run `npm run build` is a known fresh-clone failure here.
 * tests/server-wiring.test.ts drives the production branch against a directory it makes itself.
 */
/**
 * THE PERSON'S KEY, from the file the office made beside the test's database, as a header. Never printed. The press
 * that raises a secretary asks for the person's key itself, and a claim to be them with no key does not
 * do it; three test files read the same file with a copy of their own.
 */
export function thePersonsKeyHeader(path = settings().keysPath): Record<string, string> {
  const held = JSON.parse(readFileSync(path, 'utf8')) as { person?: unknown }
  if (typeof held.person !== 'string') throw new Error('the office made no person key beside the database')
  return { 'x-mole-office-key': held.person }
}

/**
 * WHAT A WRITE TO /api/records ANSWERS IN A TEST OFFICE where no session holds any agent's handle. A person's message to
 * an agent answers 409, with the letter stored and routed (decision 60sbc5I-bwKx); every other write answers 201. The
 * agent is named in `to`, or, with no `to`, by the recipient chosen for a comment: an agent, or a run the office reads
 * as one (`theAgentAChoiceNames` in src/server/lib/messages.ts). A request with no actor type is the person's, as the
 * office reads it. A test that holds an agent's handle, or has a run of the agent going, gets 201 for that send, and
 * this answer is then wrong for it.
 */
export function theAnswerToAWriteInATestOffice(headers: Record<string, string> | undefined, body: unknown): 201 | 409 {
  const record = body as { kind?: unknown; data?: { to?: unknown; chosenRecipient?: { kind?: unknown } } }
  const fromAPerson = (headers?.['x-mole-office-actor-type'] ?? 'human') === 'human'
  const toAnAgent = Array.isArray(record.data?.to)
    ? (record.data.to as { kind?: unknown }[]).some((one) => one.kind === 'agent')
    : record.data?.chosenRecipient?.kind === 'agent' || record.data?.chosenRecipient?.kind === 'session'
  return fromAPerson && record.kind === 'message' && toAnAgent ? 409 : 201
}

/** The reason a test's secretary gives when it presses a door for the person under their grant. */
export const A_TESTS_REASON_FOR_THE_PERSON = 'A test presses this for the person.'

/**
 * THAT REASON, AS A BODY CARRIES IT, to spread into the body of a secretary's press under the grant. Every such press
 * gives its reason (lib/for-the-person.ts), and the office takes the field off before the door reads the body.
 */
export const FOR_THE_PERSON = { forThePerson: { reason: A_TESTS_REASON_FOR_THE_PERSON } } as const

/** The same reason in a query, for a press with no body, such as a DELETE. Starts with neither `?` nor `&`. */
export const FOR_THE_PERSON_IN_THE_QUERY = `forThePerson.reason=${encodeURIComponent(A_TESTS_REASON_FOR_THE_PERSON)}`

/**
 * WHAT A TEST'S DECISION GOVERNS WHEN ITS CASE IS ABOUT SOMETHING ELSE: the whole project, alone, to spread into the
 * data of a decision filed at a door. Every door a decision is made through refuses one that names no page, no whole
 * project and nothing in nothingFits (src/server/lib/what-a-record-names.ts). A whole-project decision with no files
 * makes the office say nothing back, so the case reads the answer it read before. A new object at each call, so a case
 * that changes it changes only its own.
 */
export function governsTheWholeProject(): { governs: { wholeProject: true }[] } {
  return { governs: [{ wholeProject: true }] }
}

/**
 * THE PRESS AN AGENT'S ACTOR CARRIES WHEN NO ROUTE MATCHED ITS REQUEST AND IT GAVE NO REASON, as a test that hands
 * `actorFrom` a bare request expects it. Every agent's actor names the door its request presses and the reason it gave
 * for pressing it for the person (`Actor.press` in src/server/lib/records.ts). The check of whether the person's grant
 * reaches a door is asked deep in lib/records.ts, where the actor is all a function is handed, so the actor is where
 * the door has to be. The person's actor carries none.
 */
export const THE_PRESS_OF_AN_UNROUTED_REQUEST = { operation: null, aRead: false, reason: null } as const

/**
 * TRUST THE MACHINE THAT CALLS THROUGH THE OTHER MACHINES' DOOR, in a test office, and say which address that was.
 *
 * WHY A TEST NEEDS THIS. Since two decisions, a request with no key that names
 * nobody, or names the owner, is refused when it comes from a machine the office does not
 * trust. A test that stands for the owner
 * reading the office from their other computer is the person at a machine they trusted while the key window is open, so it
 * trusts that machine first, the way the person's press on the Worlds page does.
 *
 * WHICH ADDRESS. The office trusts the address it SEES, and in a test the "other machine" is this computer reached at a
 * second address: the office sees the connection come from another loopback address (127.0.0.1 for 127.0.0.2). So this
 * does not guess it. It makes one call through `otherApi` to /api/health, which answers anybody, reads back from
 * /api/access which address the office recorded for that call from another machine, and trusts exactly that address
 * through POST /api/office/trusted-machines, with the person's key from the test office's own key file, which is
 * beside its database: `keys.json` in `liveApp`'s directory, or beside the database a test named.
 */
export async function trustTheMachineThatCallsThroughTheOtherDoor(
  office: { api: string; keysFile: string },
  otherApi: string,
): Promise<string> {
  const person = {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
    ...thePersonsKeyHeader(office.keysFile),
  }
  const called = await fetch(`${otherApi}/api/health`)
  if (!called.ok) throw new Error(`the other machines' door did not answer /api/health: ${String(called.status)}`)
  const access = await fetch(`${office.api}/api/access`, { headers: person })
  if (!access.ok) throw new Error(`/api/access answered ${String(access.status)}: ${await access.text()}`)
  // THE NEWEST CALLER FROM ANOTHER MACHINE COMES FIRST, and a caller whose address nobody could read is named by a
  // sentence rather than an address (src/server/lib/access.ts); that is not a machine to trust, so it is refused here.
  const seen = ((await access.json()) as { machine?: { machines?: { name: string }[] } }).machine?.machines ?? []
  const address = seen[0]?.name ?? null
  if (address === null || address.includes(' ')) {
    throw new Error(`the office recorded no address for the call through the other machines' door: ${String(address)}`)
  }
  const trusted = await fetch(`${office.api}/api/office/trusted-machines`, {
    method: 'POST',
    headers: person,
    body: JSON.stringify({ address, note: 'a test trusted the machine it reads the office from' }),
  })
  if (!trusted.ok) throw new Error(`trusting ${address} answered ${String(trusted.status)}: ${await trusted.text()}`)
  return address
}

/**
 * A REAL FOLDER WITH THIS LAST NAME, in a temporary directory of its own, for a conversation a test writes to have run
 * in. Discovery files a conversation into the project that holds its working directory (problem kDKj9iXd4Vft), and a
 * project holds only a folder that exists, so a made-up path like /srv/nowhere is filed nowhere. The last
 * name is kept so anything read from it (the directory's own name) is what it was. The caller removes the parent
 * directory, `dirname` of what this returns, when it is done, and the end of the process removes it if not.
 */
export function aRealFolderNamed(lastName: string): string {
  const folder = join(aTestDatabaseFolder('a-run-folder'), lastName)
  mkdirSync(folder)
  return folder
}

/**
 * REGISTER A FOLDER AS A REPOSITORY ROOT OF A TEST PROJECT, so a conversation that ran there is filed into that project
 * by discovery, the way a project's registered checkout holds the runs made in it (problem kDKj9iXd4Vft). Written
 * through the one door the product uses, `registerRepository`, into the database `freshDb` opened.
 */
export async function theProjectHoldsThisFolder(workspaceId: string, folder: string): Promise<void> {
  const { registerRepository } = await import('../src/server/lib/repositories.ts')
  registerRepository({
    workspaceId,
    name: `a folder a test made, ${folder.split('/').pop() ?? 'unnamed'} ${createHash('sha256').update(folder).digest('hex').slice(0, 8)}`,
    root: folder,
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
  })
}

/** The key the test office gives its worker, read only from that test's key file. */
export function theOfficesKeyHeader(): Record<string, string> {
  const held = JSON.parse(readFileSync(settings().keysPath, 'utf8')) as { office: string }
  return { 'x-mole-office-key': held.office }
}

export async function apiApp(): Promise<BuiltServer> {
  const { buildApp } = await import('../src/server/index.ts')
  return buildApp({
    production: false,
    // Unread while `production` is false, and it is the real path rather than an invented one so
    // that nothing here depends on a directory the test did not create.
    webDir: fileURLToPath(new URL('../dist/web', import.meta.url)),
    // The browser app's address comes from src/config/settings.mjs, the one declaration the server
    // and Vite read. It was written out here, which made this helper a place the port could be
    // wrong without anything failing.
    webAppUrl: settings().webAddress,
    logLevel: false,
  })
}

/**
 * BUILD THIS FILE'S FIRST TEST OFFICE IN A HOOK, SO THAT NO CASE PAYS FOR IT.
 *
 * The first `freshDb()` and the first `apiApp()` in a test process load and transform the server's
 * modules and migrate the schema. Every later one reuses that work. Measured on 11 October 2026 in
 * 23 files, four runs each, at load 5 to 25 (wave 13t, round 33):
 *   - the first `freshDb()`: 2.0 to 5.3 s, median 2.5 s; a later one: 0.12 to 0.26 s;
 *   - the first `apiApp()`: 1.4 to 2.9 s, median 1.7 s; a later one: 0.04 to 1.0 s, median 0.11 s.
 * A case keeps vitest's 5 s (tests/how-long-a-test-may-take.ts). So a case that made the file's first
 * office could time out on a busy machine although nothing it tests was slow (problem xfTXZK2YORok).
 *
 * Call this once, at the top of such a file. The hook makes an office and closes it, under the 60 s
 * every hook that imports the server has. Each case still makes its own database and its own app,
 * so what a case proves does not change. Only the first build's cost moves out of it.
 */
export function buildTheFirstOfficeInAHook(): void {
  beforeAll(async () => {
    const db = await freshDb()
    try {
      const { app } = await apiApp()
      await app.close()
    } finally {
      db.close()
    }
  }, A_HOOK_THAT_IMPORTS_THE_SERVER)
}

/** An agent actor, for the tests about what agents are and are not allowed to do. */
export const AGENT = { type: 'agent', id: 'claude-code', sessionId: 'sess-test' } as const

/**
 * A RECORD'S `data` THAT THE WRITE GATE WOULD NOW REFUSE, written straight into the table.
 *
 * WHY IT EXISTS. `validateData` in src/shared/kinds.ts refuses two objects of one shape in one
 * record sharing an `id`, so a module whose checklist holds one id twice can no longer be MADE
 * through any code path. That is the point of the rule, and it is exactly why the readers still
 * have to defend themselves:
 *
 *   - modules written before the rule existed are in the live corpus and in every archive,
 *   - the import writes `records` with hand-built SQL and never passes through the gate,
 *   - and `data.extra` is a declared open bag that nothing looks inside.
 *
 * `patchChecklistItem` refuses to tick a line when two of them answer to one id, and that refusal
 * is the whole reason the state is worth testing. A test that could no longer build the state would
 * quietly stop proving the refusal, and the day such a module arrived nothing would fail.
 *
 * IT IS DELIBERATELY BLUNT: no revision, no change row and no new `updatedAt`, because an old row
 * is what it is imitating. Use it only to build a state the product refuses to write.
 */
/**
 * A RUN'S VERDICT WRITTEN THE WAY ITS OWN DOOR WRITES IT, for a fixture that needs a run already released, refused or
 * confirmed without building the check that would write it. Problem SeAFAnQ145mV: an ordinary write of `released`,
 * `refused` or `confirmed` on a run is refused (lib/check-field-doors.ts), so this writes each one through the same
 * door mark and the same record door the office's own doors use, as the office, one field at a time. The value is the
 * fixture's own, and the test that uses it says what it stands for.
 */
export function writeAVerdictAsItsDoorWould(
  t: TestDb,
  runId: string,
  fields: Partial<Record<'released' | 'refused' | 'confirmed', unknown>>,
): void {
  for (const [field, value] of Object.entries(fields) as ['released' | 'refused' | 'confirmed', unknown][]) {
    t.doors.asTheDoorOf(field, () => t.api.patchRecord(runId, { dataPatch: { [field]: value } }, { type: 'agent', id: 'mole-office/the-api-server' }))
  }
}

/**
 * A SEAL RE-WRITTEN AS MIGRATION 0154 RE-WROTE THE OLD ONES (src/server/db/seal-copies-to-pointers.ts): the former hash
 * kept under `reduced.was`, and the hash worked out again over the content with `reduced` in it. Written straight into
 * the table, as the migration wrote it, with the seal's own immutability dropped and put back around the one write.
 * The `reduced` block is synthetic and says so.
 */
export function reduceASealAsMigration0154Did(t: TestDb, sealId: string): void {
  const record = t.api.getRecord(sealId)!
  const { hash, ...content } = record.data['seal'] as Record<string, unknown> & { hash: string }
  const reduced = {
    ...content,
    reduced: {
      by: 'drizzle/0154_the_seal_keeps_pointers.sql (synthetic, a test)',
      at: '2026-09-12 09:00:00',
      dropped: ['records.before.row'],
      was: hash,
      says: 'Synthetic: the copies were dropped and the pointers kept.',
    },
  }
  const again = createHash('sha256').update(JSON.stringify(reduced)).digest('hex')
  t.client.sqlite.exec('DROP TRIGGER IF EXISTS sealed_tip_no_update')
  try {
    writeDataBypassingTheGate(t, sealId, { ...record.data, seal: { ...reduced, hash: again } })
  } finally {
    t.client.sqlite.exec(
      "CREATE TRIGGER sealed_tip_no_update BEFORE UPDATE ON records WHEN OLD.kind = 'sealed_tip' " +
        "BEGIN SELECT RAISE(ABORT, 'A sealed tip is immutable'); END",
    )
  }
}

/** The verdicts a fixture's data carries, and the rest of it, apart: the verdicts are written only by their doors. */
export function theVerdictsApart(data: Record<string, unknown>): { verdicts: Partial<Record<'released' | 'refused' | 'confirmed', unknown>>; rest: Record<string, unknown> } {
  const { released, refused, confirmed, ...rest } = data
  const verdicts = Object.fromEntries(Object.entries({ released, refused, confirmed }).filter(([, value]) => value !== undefined))
  return { verdicts, rest }
}

export function writeDataBypassingTheGate(t: TestDb, recordId: string, data: unknown): void {
  const changed = t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), recordId)
  if (changed.changes !== 1) throw new Error(`no record with id ${recordId} to write data into`)
}

/**
 * A SETTLING LINK THAT THE WRITE GATE WOULD REFUSE, written straight into the tables.
 *
 * WHICH LINKS THE GATE REFUSES DEPENDS ON THE FORK, since 27 August 2026. `assertMaySettleFork`
 * reads the fork's `who_settles_it` and refuses a `derived_from` link from a decision to a proposal
 * when that field says "the owner" or when nobody has filled it in. On those forks — which is every
 * fork in the owner's queue — an agent-made settling link can no longer be made through any code
 * path. On a fork that says "an agent", "the parent" or "a measurement" an agent may make one, with
 * a decision that carries an `authority`, and it goes through the ordinary route.
 *
 * SO THIS HELPER IS FOR THE FIRST GROUP, and it is exactly why the readers still defend themselves:
 *
 *   - rows written before the gate existed are in the live corpus now,
 *   - and an archive restored tomorrow carries whatever it carried.
 *
 * A test that could no longer build that state would quietly stop proving that `GET /api/needs-you`
 * and the apply route refuse it, and the day a bad row arrived nothing would fail. So this writes
 * the link row and its change row directly, which is the one thing in this file that goes round the
 * product's own write path, and it does it on purpose.
 *
 * The CHANGE ROW is the part that matters: `links.created_by` stores an actor id with no type
 * beside it, so `humanLinked` reads the log instead. A link inserted with no change row would be
 * refused for having no evidence rather than for the evidence it has, and the test would pass
 * without proving anything.
 */
export function settleLinkBypassingTheGate(
  t: TestDb,
  input: { fromId: string; toId: string; actorType: 'human' | 'agent'; actorId: string },
): string {
  const id = `legacy-${input.fromId}-${input.toId}`.slice(0, 12)
  const stamp = t.api.localStamp(new Date())
  t.client.sqlite
    .prepare(
      'INSERT INTO links (owner_id, id, workspace_id, from_id, to_id, type, created_by, created_at, updated_at) ' +
        `VALUES ('${THE_TEST_OFFICES_OWNER.id}', ?, 'default', ?, ?, 'derived_from', ?, ?, ?)`,
    )
    .run(id, input.fromId, input.toId, input.actorId, stamp, stamp)
  t.client.sqlite
    .prepare(
      'INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, field, new_value, at) ' +
        "VALUES (?, ?, 'default', 'link', ?, ?, 'derived_from', ?, ?)",
    )
    .run(`c-${id}`, input.fromId, input.actorType, input.actorId, input.toId, stamp)
  return id
}

// -------------------------------------------------------------------------- small assertions

/**
 * The one element of an array, or a clear failure.
 *
 * TypeScript is configured with noUncheckedIndexedAccess, which means `xs[0]` is typed as
 * possibly missing. Rather than assert it away in every test, this checks it once and fails
 * with a message that says what was expected.
 */
export function one<T>(xs: readonly T[], what: string): T {
  const [first, ...rest] = xs
  if (first === undefined || rest.length > 0) {
    throw new Error(`expected exactly one ${what}, got ${xs.length}`)
  }
  return first
}

/** The element at `i`, or a clear failure. Same reason as `one`. */
export function at<T>(xs: readonly T[], i: number, what: string): T {
  const v = xs[i]
  if (v === undefined) throw new Error(`expected a ${what} at index ${i}, got ${xs.length} in total`)
  return v
}

/**
 * Run something that must fail with a PanelError carrying a particular HTTP status, and hand
 * back the error so the test can also check what the message says. A test that merely asserted
 * "it threw" would pass if the code threw a TypeError from a typo.
 */
export function expectPanelError(t: TestDb, fn: () => unknown, status: number): Error {
  let result: unknown
  try {
    result = fn()
  } catch (err) {
    if (!(err instanceof t.api.PanelError)) {
      throw new Error(`expected a PanelError, got ${String(err)}`)
    }
    if (err.status !== status) {
      throw new Error(`expected status ${status}, got ${err.status} — "${err.message}"`)
    }
    return err
  }
  throw new Error(`expected a PanelError with status ${status}, but the call returned ${String(result)}`)
}


/**
 * A REAL TRANSCRIPT FOR A RUN A TEST WANTS TO ADDRESS A COMMENT TO.
 *
 * Since 18 August 2026, dispatching a comment to an existing agent asks `pickUpOf` whether that run
 * can really be picked up again — the same reading the recipient list shows a person before they
 * press Send — and that reading looks for the run's transcript on disk. A stamp pointing at a path
 * nothing ever wrote is a run Mole Office refuses to address, which is correct and is proved in
 * tests/agent-dispatch.test.ts.
 *
 * So a test that wants the SENT case needs a file to exist. Three test files each grew their own
 * temp directory for this within an hour of the rule landing, which is the defect this repository
 * names as its own — the same fact worked out in several places. This is the one place.
 *
 * The contents do not matter to any reading under test; what is checked is that a file is there and
 * can be read. Everything is removed when the process ends.
 */
export function fakeTranscript(externalId: string, project = 'x'): string {
  const started = whatThisProcessStarted()
  started.transcripts ??= aTestDatabaseFolder('transcripts')
  const at = join(started.transcripts, project, externalId + '.jsonl')
  mkdirSync(dirname(at), { recursive: true })
  writeFileSync(at, '{"type":"user","message":{"role":"user","content":"hello"}}\n')
  return at
}

// ======================================================== a real Mole Office, in a real browser

/**
 * STARTING AND STOPPING A TEST SERVER IS WRITTEN DOWN HERE, ONCE.
 *
 * Eight test files need a real API server, a real Vite and a real browser, because what they
 * measure is what happens on a screen after a press. Each of the eight carried its own copy of the
 * same eighty-four lines: pick a free port, spawn a child in its own process group, wait until it
 * answers, kill the group afterwards. Eight copies of one lifecycle is the defect this repository
 * names as its own — the same fact worked out in several places — and on 18 August 2026 it cost a
 * running machine. Eleven orphaned servers were left on it in a day, each holding a port and a
 * database.
 *
 * WHY A CHILD OUTLIVED ITS PARENT. Every child is spawned `detached`, which puts it in a process
 * GROUP of its own so that one signal takes the child and everything the child starts. That is
 * right, and it has a second effect: the child is no longer in the parent's group, so when the
 * parent dies the child is sent nothing at all. The only thing that stopped one was `stopGroup`
 * called from `afterAll`, and a worker killed on a timeout, an interrupted run and a shell torn
 * down when an agent finishes all skip `afterAll`.
 *
 * SO THERE ARE THREE LAYERS, AND EACH CATCHES WHAT THE ONE BEFORE IT CANNOT.
 *
 *   1. `stop()`, called from `afterAll`. The ordinary ending: signal the group, wait for it, then
 *      prove the ports came back rather than assuming the signal worked.
 *   2. `exit`, `SIGINT` and `SIGTERM` handlers, registered ONCE per worker process. They cover
 *      every ending Node can see, including the ones that skip `afterAll`. There is no
 *      `uncaughtException` handler: under vitest the runner reports the exception and the process
 *      goes on until `afterAll` or its end; outside vitest Node ends the process, and the `exit`
 *      handler runs.
 *   3. A watchdog inside each child. Nothing outside a child survives a parent that was SIGKILLed,
 *      so the child has to be able to notice on its own. The API server is told which pid started
 *      it, with `--stop-with-pid`, and stops when that pid is gone; src/server/index.ts holds that
 *      half. Vite is not ours and can be told nothing, so the shell that starts it watches the same
 *      pid and takes the group down.
 *
 * Layer 3 is the only one that makes the leak impossible rather than merely unlikely.
 */

/** One child process, with the last hundred lines it printed for when it has to be explained. */
interface Service {
  label: string
  child: ChildProcess
  log: string[]
  /** Set by `stopGroup` before it signals, so an exit after that is one this helper asked for. */
  stopping: boolean
  /** Set once a case's failure has said how this child died, so `stop()` does not say it again. */
  deathReported: boolean
}

/**
 * EVERYTHING THIS WORKER PROCESS STARTED, AND HAS TO TAKE WITH IT.
 *
 * It hangs off `process` rather than off a module variable because the test runner gives each test
 * FILE a fresh module registry inside a SHARED process, so a module variable here is one per file
 * and there may be a dozen files in one process. `process` is the thing all of them share.
 *
 * That is not a detail. It is why the suite printed `MaxListenersExceededWarning: 11 exit listeners
 * added` before this existed: the transcript directory below registered one `exit` listener per
 * file. Registering the teardown against this record instead means four listeners for a whole
 * worker process however many files run in it.
 */
interface StartedByThisProcess {
  /** Process group ids. Signalling minus one of these takes the child and its whole tree. */
  groups: Set<number>
  /** Where `fakeTranscript` writes. Made on first use, so a file that never asks pays nothing. */
  transcripts: string | null
  /** The one Chromium every browser test in this worker takes a context from. */
  browser: Browser | null
  /** That browser while it is still starting, so two tests in one worker do not start two. */
  browserComing: Promise<Browser> | null
  /** The built page, once this worker has seen that it is there and as new as the source. */
  builtPage: string | null
  /** How many times this worker has built the page. The test that says "once" reads it. */
  builds: number
  /** The file `theMigratedSchema` made, once this process has made it. */
  migratedSchema: string | null
}

interface ProcessWithRecord {
  __moleOfficeStartedByThisProcess?: StartedByThisProcess
}

function whatThisProcessStarted(): StartedByThisProcess {
  const carrier = process as unknown as ProcessWithRecord
  let record = carrier.__moleOfficeStartedByThisProcess
  if (record === undefined) {
    record = {
      groups: new Set<number>(),
      transcripts: null,
      browser: null,
      browserComing: null,
      builtPage: null,
      builds: 0,
      migratedSchema: null,
    }
    carrier.__moleOfficeStartedByThisProcess = record
    stopEverythingWhenTheProcessEnds(record)
  }
  return record
}

// AT IMPORT, before any test folder is made. tests/a-test-folder.ts adds its own handlers when the first
// folder is made, and handlers run in the order they were added. So these run first, kill the servers,
// and then remove the folders; no server is still writing into a folder while it goes.
whatThisProcessStarted()

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * A port nothing else can take until the caller says so.
 *
 * WHY IT HOLDS THE SOCKET. The obvious version asks the operating system for a free port, closes
 * the socket, and hands the number back — and between the close and the child binding it, anything
 * else on the machine may take it. Measured on 18 August 2026 with fourteen test files running at
 * once: `Vite exited before it answered: Port 39399 is already in use`. The web port was chosen
 * five seconds before Vite bound it, because the API server starts in between.
 *
 * So the probe keeps listening, which is what stops anybody else binding it, and `release()` is
 * called immediately before the child is spawned. The gap is a millisecond rather than five
 * seconds. It is not nothing, and it cannot be: the child cannot bind a port this process is
 * holding.
 */
interface ReservedPort {
  port: number
  release(): Promise<void>
  /**
   * Whether this helper chose the number itself, and may therefore choose another.
   *
   * `retryWhenAPortWasTaken` below turns on this. A port this helper picked is one it is free to
   * pick again; a port a test was TOLD to use is that test's subject, and quietly moving it would
   * run the test against something other than what was asked for. Every port this file hands out
   * today is its own — `reservePort` is the only producer — and the rule is written down anyway,
   * because the thing it forbids is silent.
   */
  ours: boolean
}

function reservePort(): Promise<ReservedPort> {
  return new Promise((resolve, reject) => {
    // A CONNECTION TO THE PROBE IS ENDED AT ONCE. Closing a server waits for every connection it took, and a program
    // that reaches this port while it is held, and sends nothing, would make `release()` wait with no limit; a start
    // then ran out of its hook's time with no stage to name (problem 91djRwgQaS_z).
    const probe = createServer((socket) => {
      socket.destroy()
    })
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') {
        probe.close(() => { reject(new Error('the probe socket reported no port')) })
        return
      }
      const { port } = address
      resolve({
        port,
        release: () => new Promise<void>((done) => probe.close(() => { done() })),
        ours: true,
      })
    })
  })
}

/**
 * A START THAT FAILED BECAUSE SOMETHING ELSE HAD THE PORT.
 *
 * Its own kind of failure so `retryWhenAPortWasTaken` can tell it from every other reason a server
 * does not come up. Anything else is thrown straight through: retrying a real fault three times
 * would turn one clear failure into three slow ones.
 */
export class ThePortWasTaken extends Error {
  constructor(
    readonly port: number,
    /** Whether this helper chose the port. See `ReservedPort.ours`. */
    readonly ours: boolean,
    readonly said: string,
  ) {
    super(said)
    this.name = 'ThePortWasTaken'
  }
}

/**
 * Does this failure say the port was already taken?
 *
 * Two spellings, because two programs fail here. The API server's own refusal carries Node's
 * EADDRINUSE; Vite, started with `--strictPort`, says "Port N is already in use" and exits.
 */
export function saysThePortWasTaken(said: string, port: number): boolean {
  return said.includes('EADDRINUSE') || said.includes(`Port ${String(port)} is already in use`)
}

/**
 * RUN AN ATTEMPT, AND RUN IT AGAIN ON ANOTHER PORT WHEN THE PORT WAS TAKEN.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `VQLi291nASe1`. `reservePort` holds the socket until the moment before the child is
 * spawned, which makes the window a millisecond rather than five seconds — and a millisecond is not
 * nothing. On 4 September 2026, with three suites running on this machine at once, two browser test
 * files failed in one run: `MOLE_OFFICE_PORT is 44815 and something else is already listening on
 * 127.0.0.1:44815`. Both files pass alone. A green build turned red for a reason that had nothing to
 * do with the code, and the next builder spent a rerun finding that out.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT WILL NOT DO
 * ---------------------------------------------------------------------------------------
 *
 * A port the test was TOLD to use is never retried, and the refusal says so. Choosing another
 * number for a test whose subject is that number would run it against something else and report a
 * pass. `ReservedPort.ours` is the flag, and `reservePort` is the only thing that sets it today.
 *
 * The failure after the last try says that it retried and how many times, so a reader can tell
 * "the machine is busy" from "this server cannot start at all".
 *
 * @param what the thing being started, for the failure message
 * @param attempt one whole attempt: choose ports, start, wait. It throws `ThePortWasTaken` when a
 *   port went to somebody else, and anything else for any other reason.
 * @param tries how many attempts in total
 */
export async function retryWhenAPortWasTaken<T>(what: string, attempt: () => Promise<T>, tries = 3): Promise<T> {
  const lost: ThePortWasTaken[] = []
  for (let n = 1; n <= tries; n += 1) {
    try {
      return await attempt()
    } catch (err) {
      if (!(err instanceof ThePortWasTaken)) throw err
      if (!err.ours) {
        throw new Error(
          `${what} could not take port ${String(err.port)}, and that port was not this helper\'s to change: the ` +
            'environment named it, so it is what this test is about. Nothing was retried.\n\n' +
            err.said,
        )
      }
      lost.push(err)
    }
  }
  const last = lost[lost.length - 1]
  throw new Error(
    `${what} could not take a port. It retried ${String(tries - 1)} time${tries - 1 === 1 ? '' : 's'} — ` +
      `${String(tries)} attempts in all, on ports ${lost.map((one) => String(one.port)).join(', ')} — and each one ` +
      'was taken by something else between this helper choosing it and the server binding it. That is a busy ' +
      'machine rather than a server that cannot start.\n\n' +
      (last?.said ?? 'nothing was recorded about the last attempt'),
  )
}

function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer()
    probe.on('error', () => { resolve(false) })
    probe.listen(port, '127.0.0.1', () => probe.close(() => { resolve(true) }))
  })
}

/**
 * WAIT FOR A PORT TO COME BACK, AND SAY SO IF IT DOES NOT.
 *
 * `stopGroup` signals the whole process group and waits for the CHILD to exit. The child of the API
 * service is `tsx`, and the process actually holding the listening socket is its own child: the two
 * do not close in one instant, and the gap grows with how busy the machine is. Asking whether the
 * port is free the moment the parent exits is asking a question a moment too early.
 *
 * MEASURED, 31 August 2026: `tests/organising-is-reachable.test.ts` failed one full run in five with
 * `port 39025 is still held after the test`, all 9,831 of its own assertions having passed, and
 * passed 28 of 28 when run alone. It was the last thing the file did.
 *
 * THIS DOES NOT WEAKEN THE CHECK. A port still held at the end of the wait still fails the test, and
 * a leaked server is exactly as visible as it was. What changes is that "still held" now means ten
 * seconds rather than zero.
 */
async function portComesBack(port: number, within = 10_000): Promise<boolean> {
  const deadline = Date.now() + within
  for (;;) {
    if (await portIsFree(port)) return true
    if (Date.now() >= deadline) return false
    await sleep(100)
  }
}

/**
 * Reuse Vite's owner watchdog for detached test children (problem EcbOPrFc-tCD). afterAll and
 * exit handlers cannot run after SIGKILL, so the group's own shell loop watches its owner.
 * Double fork so the watchdog is reparented away from the command, rather than counted as its
 * child. Give it /dev/null for all three streams so it cannot hold the command's pipes open.
 * Stop quietly when the command ($$ after exec) ends, so its group does not outlive the command.
 * Use only with detached: true: in the caller's own group, kill -TERM 0 reaches its siblings too.
 * exec preserves the child's pid and exit status. Arguments go through $0/$@, never shell text.
 */
export function commandThatStopsWithItsOwner(
  command: string,
  args: string[],
  ownerPid = process.pid,
): { command: string; args: string[] } {
  if (!Number.isSafeInteger(ownerPid) || ownerPid <= 0) throw new Error('The child needs a positive owner pid.')
  const watch = `((while kill -0 $$ 2>/dev/null; do
    if ! kill -0 ${String(ownerPid)} 2>/dev/null; then kill -TERM 0; exit; fi
    sleep 1
  done) &) </dev/null >/dev/null 2>&1; exec "$0" "$@"`
  return { command: '/bin/sh', args: ['-c', watch, command, ...args] }
}

/** Keep the API's own owner watch on plain tsx, tsx watch and Node --import launches alike.
 * Prefix arguments belong to the runner; the owner flag belongs after the server's path.
 * The executable, pid, process group and exit status stay exactly as the caller started them.
 */
export function apiServerArguments(prefix: string[] = [], server = 'src/server/index.ts'): string[] {
  return [...prefix, server, `--stop-with-pid=${String(process.pid)}`]
}

/** Start a child as its own process GROUP, so everything it starts in turn dies with one signal. */
function startDetached(
  label: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  record: StartedByThisProcess,
): Service {
  const child = spawn(command, args, { cwd: REPO, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  if (child.pid !== undefined) record.groups.add(child.pid)
  const service: Service = { label, child, log: [], stopping: false, deathReported: false }
  const keep = (chunk: unknown): void => {
    for (const line of String(chunk).split('\n')) if (line.trim() !== '') service.log.push(line)
    if (service.log.length > 100) service.log.splice(0, service.log.length - 100)
  }
  child.stdout?.on('data', keep)
  child.stderr?.on('data', keep)
  child.on('error', (err) => service.log.push(`could not start ${command}: ${err.message}`))
  return service
}

/** How long `stopGroup` waits for a server to end after each of its two signals. */
const A_SIGNAL_IS_GIVEN_MS = 5_000
/** The longest `stopGroup` takes to stop one server: both of its waits. */
const A_SERVER_STOPS_WITHIN_MS = 2 * A_SIGNAL_IS_GIVEN_MS

/**
 * HOW MUCH OF ITS HOOK'S OR CASE'S LIMIT A START KEEPS BACK, TO CLEAR UP WHEN IT HAS TO STOP. The API server takes at
 * most `A_SERVER_STOPS_WITHIN_MS` to stop. 5 seconds more, which nobody has measured, is for the rest: the ports, the
 * page server, the browser context and the folder. A start with a dev server has a second server to stop, and keeps
 * back `A_SERVER_STOPS_WITHIN_MS` more.
 */
export const A_START_THAT_STOPS_CLEARS_UP_WITHIN_MS = A_SERVER_STOPS_WITHIN_MS + 5_000

/** What a journal row begins with when a stage stops waiting, before the stage's own words. */
export const THE_GIVE_UP_PREFIX = 'gave up waiting for '

/** The wait named when a failed start begins to clear up. */
export const THE_CLEARING_UP_AFTER_A_FAILED_START = 'cleanup after the browser stack failed to start'

/** What a journal row says when the clearing up after a failed start has ended. */
export const THE_CLEARING_UP_AFTER_A_FAILED_START_ENDED = 'the clearing up after the failed start ended'

async function stopGroup(service: Service, record: StartedByThisProcess): Promise<void> {
  const { child } = service
  if (child.pid === undefined) return
  record.groups.delete(child.pid)
  if (child.exitCode !== null || child.signalCode !== null) return
  service.stopping = true
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ESRCH') return
    throw err
  }
  const exited = await Promise.race([once(child, 'exit').then(() => true), sleep(A_SIGNAL_IS_GIVEN_MS).then(() => false)])
  if (exited) return
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    // Already gone between the two signals, which is the outcome that was wanted.
  }
  await Promise.race([once(child, 'exit'), sleep(A_SIGNAL_IS_GIVEN_MS)])
}

/** Has this child ended? Node sets one of the two when it sees the exit, and the other stays null. */
function hasEnded(service: Service): boolean {
  return service.child.exitCode !== null || service.child.signalCode !== null
}

/**
 * WHAT A TEST'S SERVER SAID BEFORE IT STOPPED ON ITS OWN: HOW IT ENDED, AND ITS LAST LINES.
 *
 * Problem `tiiuVJkCrNjs`. A browser test once failed in the merge queue with ECONNREFUSED and
 * nothing else, because the test's own API server had stopped during the case. The server's last
 * lines were kept in `service.log` and shown only when a server failed to START. This is the
 * sentence for a server that stopped after it had started.
 *
 * Exported so the test of it can name the parts it looks for.
 */
export function whatAStoppedServerSaid(label: string, pid: number | undefined, code: number | null, signal: string | null, log: readonly string[]): string {
  const how = signal !== null ? `was ended by the signal ${signal}` : `exited with code ${String(code)}`
  const lines = log.length === 0
    ? 'It printed nothing before it stopped.'
    : `Its last ${String(log.length)} line${log.length === 1 ? '' : 's'}:\n${log.join('\n')}`
  return `${label} (pid ${String(pid)}) stopped while the test was running, and the test's own ` +
    `teardown did not stop it. It ${how}. ${lines}`
}

function whatThisServiceSaid(service: Service): string {
  const { child } = service
  return whatAStoppedServerSaid(service.label, child.pid, child.exitCode, child.signalCode, service.log)
}

/**
 * PUT A SERVER'S DEATH INTO THE FAILURE OF THE CASE IT DIED IN.
 *
 * Armed once the server has answered, so a server that fails to start is reported by
 * `waitUntilReady` alone, and a start that loses its port and is tried again adds nothing to the case.
 *
 * When the server exits and this helper did not ask it to, and a case is running, the case gets one
 * more error after it ends: the exit code or the signal, and the server's last lines. The case
 * fails even if it did not notice, because a test whose server died did not test what it says.
 * An exit between cases is said by `stop()` instead, in the hook that calls it.
 */
function watchForADeathDuringACase(service: Service): void {
  service.child.once('exit', () => {
    if (service.stopping) return
    // `onTestFinished` refuses outright when no case is running, so that is asked first.
    if (getCurrentTest() === undefined) return
    onTestFinished(() => {
      // Read when the case ends rather than when the exit is seen, so lines that were still on
      // their way through the pipe are in it.
      service.deathReported = true
      throw new Error(whatThisServiceSaid(service))
    })
  })
}

async function waitUntilReady(
  service: Service,
  url: string,
  someoneElse: (res: Response) => Promise<string | null> = () => Promise.resolve(null),
): Promise<void> {
  // Ninety seconds because a cold Vite on a busy machine has taken more than sixty. The number only
  // matters when something is broken, and then it is how long the failure takes to arrive.
  const deadline = Date.now() + 90_000
  let last = 'nothing has been tried yet'
  while (Date.now() < deadline) {
    if (service.child.exitCode !== null || service.child.signalCode !== null) {
      throw new Error(`${service.label} exited before it answered:\n${service.log.join('\n')}`)
    }
    try {
      // EACH REQUEST GIVES UP AFTER 5 S, because the exit check above and the deadline run only
      // between requests. Node's fetch waits 300 s for headers, and something that takes the
      // connection and never answers (the probe of a port another file reserved, say) once held this
      // wait for 285 s with not a line from the server. tests/a-health-wait-gives-up-a-port-that-never-answers.test.ts
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) })
      if (res.ok) {
        const instead = await someoneElse(res)
        if (instead === null) return
        last = instead
      } else {
        last = `HTTP ${String(res.status)}`
      }
    } catch (err) {
      last = err instanceof Error ? err.message : String(err)
    }
    await sleep(200)
  }
  throw new Error(`${service.label} never answered ${url} (${last}):\n${service.log.join('\n')}`)
}

/**
 * Wait for a service, and say WHY when the reason is that its port went to something else.
 *
 * `waitUntilReady` reports a child that exited with everything it said, which is the right report
 * for every other failure and the wrong shape for this one: the caller has to be able to tell "the
 * port was taken" from "this server is broken", and only the child's own words say which.
 */
export async function readyOrSayThePortWentElsewhere(
  service: Service,
  url: string,
  port: number,
  ours: boolean,
  someoneElse?: (res: Response) => Promise<string | null>,
): Promise<void> {
  try {
    await waitUntilReady(service, url, someoneElse)
  } catch (err) {
    const said = err instanceof Error ? err.message : String(err)
    if (saysThePortWasTaken(said, port)) throw new ThePortWasTaken(port, ours, said)
    throw err
  }
}

/**
 * DID THE TEST'S OWN API SERVER ANSWER, OR SOMETHING ELSE ON ITS PORT? (wave 13y round 58)
 *
 * The port is let go just before the server starts, and the server binds it only once it has
 * loaded. In a whole run of the suite on 21 October 2026, something else took the port in that gap
 * and answered `GET /api/health` with a success. The wait took that for the test's server. The
 * session filing then got a success with no record in it, and the chat test failed on `record.id`.
 * Run alone, it passed.
 *
 * So an answer is taken only when it names the database this test gave its server: the health
 * answer always says, as `path`, which file the server has open. Any other answer is not taken. The
 * wait goes on, the test's server fails on the taken port, and `retryWhenAPortWasTaken` starts
 * again on another port.
 *
 * @returns null when the test's own server answered, or what answered instead, in words
 */
export async function anotherServerAnswered(res: Response, database: string): Promise<string | null> {
  const said: unknown = await res.json().catch(() => null)
  const path = typeof said === 'object' && said !== null ? (said as { path?: unknown }).path : undefined
  if (typeof path === 'string' && resolve(path) === resolve(database)) return null
  return `something other than this test's server answered ${res.url}: it named ` +
    `${typeof path === 'string' ? `the database ${path}` : 'no database'}, and this test's server has ${database}`
}

/**
 * THE API SERVER OF A TEST FILE THAT STARTS ITS OWN, TAKEN ONLY FROM ITSELF (wave 13y round 59).
 *
 * Four browser test files start their own API server and Vite rather than calling `liveApp` (a fifth,
 * tests/seven-surfaces.test.ts, did until wave 13n round F). Each had its own copy of the start: a probe that let go of the port at once, and a wait that took any
 * success on `/api/health` as its server. A scratch that put a stranger on one file's API port in
 * that gap made the wait return while the file's own server was still loading, and the file failed
 * on the stranger's empty answer to its first write.
 *
 * So this is `liveApp`'s rule for them, in one place. Both ports are held until the server is
 * started. An answer is taken only when it names this attempt's database (`anotherServerAnswered`).
 * A port taken in the gap is tried again on others (`retryWhenAPortWasTaken`). Each attempt has its
 * own folder inside `dir`, so a second attempt does not open a database the first one migrated; the
 * file removes `dir` with every attempt in it.
 *
 * The web port is let go when this returns, because each file starts its own Vite, one of them only
 * after it has written its records. Each file waits for its Vite with `waitForItsOwnVite`, below.
 *
 * @param start starts the API server with this environment. The file keeps what it returns and
 *   stops it, as it stops everything else it started.
 * @returns the two ports, and the environment the server was started with, for Vite and the file's
 *   own calls
 */
export async function anApiServerOfItsOwn(
  what: string,
  dir: string,
  start: (env: NodeJS.ProcessEnv) => { label: string; child: ChildProcess; log: string[] },
): Promise<{ apiPort: number; webPort: number; env: NodeJS.ProcessEnv }> {
  let attempts = 0
  return retryWhenAPortWasTaken(what, async () => {
    attempts += 1
    const folder = join(dir, `attempt-${String(attempts)}`)
    mkdirSync(folder)
    const held = { api: await reservePort(), web: await reservePort() }
    const env = devStackEnvironment(folder, held.api.port, held.web.port)
    // The database is read as the server reads it, through the declaration's own reader.
    const database = databasePathFrom(env)
    try {
      await held.api.release()
      const service = start(env)
      await readyOrSayThePortWentElsewhere(
        { ...service, stopping: false, deathReported: false },
        `http://127.0.0.1:${String(held.api.port)}/api/health`,
        held.api.port,
        held.api.ours,
        (res) => anotherServerAnswered(res, database),
      )
    } finally {
      // Closing a probe that is already closed does nothing, so both are closed whatever happened.
      await held.api.release()
      await held.web.release()
    }
    return { apiPort: held.api.port, webPort: held.web.port, env }
  })
}

/** The path at which Vite serves `virtual:mole-office-api`, the module that tells the page its API port. */
const THE_API_MODULE_AS_VITE_SERVES_IT = '/@id/__x00__virtual:mole-office-api'

/**
 * DID THE TEST FILE'S OWN VITE ANSWER, OR SOMETHING ELSE ON ITS PORT? (wave 13y round 61)
 *
 * vite.config.ts writes the API port from Vite's environment into `virtual:mole-office-api`. A page
 * from anything else does not have that module, and another test's Vite names another port. So an
 * answer is taken only when the module names this test's API port.
 *
 * @returns null when the test's own Vite answered, or what answered instead, in words
 */
export async function anotherViteAnswered(res: Response, apiPort: number): Promise<string | null> {
  const said = await res.text().catch(() => '')
  const named = /apiPortInDevelopment = (\S+)/.exec(said)?.[1]
  if (named === String(apiPort)) return null
  return `something other than this test's Vite answered ${res.url}: it named ` +
    `${named === undefined ? 'no API port' : `the API port ${named}`}, and this test's API server is on ${String(apiPort)}`
}

/**
 * WAIT FOR THE VITE A TEST FILE STARTED, TAKEN ONLY FROM ITSELF (wave 13y round 61).
 *
 * The five files that call `anApiServerOfItsOwn` start Vite on the web port it lets go. Each waited
 * with a copy of its own that took any success on `/` as its Vite. A scratch that put a stranger on
 * the web port of tests/overlay-host.test.ts in that gap made the wait take the stranger's page on
 * its first ask. Every case of the file then waited 60 seconds for a page that never ran, and Vite's
 * own words about the taken port were never shown.
 *
 * This wait takes only an answer that `anotherViteAnswered` takes. Vite is started with
 * `--strictPort`, so on a taken port it ends, and this wait fails with what Vite said. Nothing starts
 * Vite again on another port. The API server was started with this web port in its environment, so a
 * retry would have to start both, and that is not built until a run needs it.
 */
export async function waitForItsOwnVite(
  vite: { label: string; child: ChildProcess; log: string[] },
  webPort: number,
  apiPort: number,
): Promise<void> {
  await waitUntilReady(
    { ...vite, stopping: false, deathReported: false },
    `http://127.0.0.1:${String(webPort)}${THE_API_MODULE_AS_VITE_SERVES_IT}`,
    (res) => anotherViteAnswered(res, apiPort),
  )
}

/**
 * ---------------------------------------------------------------------------------------
 * THE PAGE EVERY BROWSER TEST IS SERVED, BUILT ONCE FOR A WHOLE RUN
 * ---------------------------------------------------------------------------------------
 *
 * WHAT THIS REPLACED, AND WHAT IT COST. Until 23 September 2026 every `liveApp` started a Vite dev
 * server of its own: a dependency pre-bundle, a module graph and a transform of every file the page
 * imports, once per test file. At the landing of that morning the 268 files that call `liveApp`
 * were 21% of the suite's files and 59% of its time — 58.8 summed minutes of 99.1. A build of this
 * page takes about a second, and one build serves every test in the run.
 *
 * WHERE IT GOES, AND WHY NOT `dist/web`. `dist/web` is what `npm start` serves and what the
 * freshness door reads out of its build stamp. A test harness that quietly wrote over it would be
 * deciding what the owner's own build is, and the next person to run `npm start` would be served a
 * page a test made. This build is its own folder and nothing else reads it.
 *
 * BUILT FOR PRODUCTION, AS `npm run build` BUILDS THE OWNER'S PAGE. The test runner sets NODE_ENV to
 * `test` in its own process, and a build started from here would inherit it. Vite keeps a NODE_ENV it
 * inherits, whatever `--mode` says, and with anything but `production` React is built in development
 * mode: the page calls `jsxDEV`, runs React's development checks and prints its development warnings.
 * That is a page the owner never runs. With no NODE_ENV at all, `vite build` picks `production`
 * itself, which is what `npm run build` gets. This build sets it to `production` by name, so that a
 * NODE_ENV in whoever's shell starts the tests cannot change it.
 *
 * WHAT THE BROWSER TESTS NO LONGER RUN: React's development warnings and checks. Among them are the
 * warnings React prints to the console, such as a list item without a key, and StrictMode's second
 * run of every effect when a component mounts (src/web/main.tsx wraps the page in StrictMode, which
 * does nothing in production). An error the page throws and nothing catches is still thrown, and a
 * test listening for `pageerror` still hears it. Measured by wave 13i's supervisor on 25 September
 * 2026, 7 browser test files at 2 workers: 85.7 CPU-seconds on the development build and 78.4 on this
 * one; the browsers' page processes alone went from 29.0 to 22.1. Measured again by
 * wave 13i's page-production work the same day, 10 other browser test files at 2 workers, two runs each: 83.7
 * CPU-seconds on the development build and 74.8 on this one.
 *
 * WHEN IT IS BUILT AGAIN. When the newest of the files the page is built from has moved since the
 * build. That is `newestSourceBuiltFrom`, the same walk the API server reports from and the same one
 * the dev server stamps a page with, so there is ONE idea of how new the page's code is rather than
 * a second one here. A stale page would be a test passing against code nobody wrote, which is the
 * fault criterion G6 exists for. Also when the note beside the build does not say it was built for
 * production, which is every note written before 25 September 2026: a worktree holding a development
 * build from then builds the page again rather than serving it.
 */

/**
 * The built page every browser test is served from.
 *
 * Exported because the test that asserts it is built once, and not once per stack, has to look at
 * the folder itself.
 */
export const THE_PAGE_BROWSER_TESTS_ARE_SERVED = join(REPO, 'dist', 'web-for-tests')

/**
 * What the build took in, written beside the build after it finished.
 *
 * AFTER, NEVER BEFORE, and the old note is removed before the build starts. A build that failed
 * half way leaves a folder with some of a page in it, and the absence of this note is what says so:
 * the next test rebuilds rather than serving whatever is there.
 */
const WHAT_THE_BUILT_PAGE_WAS_BUILT_FROM = join(REPO, 'dist', 'web-for-tests-built-from.json')

/**
 * The directory one worker makes while it builds, so that the others wait instead of building too.
 *
 * A DIRECTORY BECAUSE `mkdir` EITHER MAKES IT OR SAYS IT IS THERE, in one step nothing can get
 * between. The runner gives each worker its own process, so a variable in this module is one per
 * worker and cannot be the thing four workers agree on.
 */
const WHILE_THE_PAGE_IS_BEING_BUILT = join(REPO, 'dist', 'web-for-tests-lock')

/** The file inside the lock naming the process that holds it. */
const WHO_IS_BUILDING = join(WHILE_THE_PAGE_IS_BEING_BUILT, 'who.txt')

/**
 * THE PROCESS HOLDING THE LOCK, or null because the lock says nothing readable yet.
 *
 * Null covers the instant between one worker making the directory and writing its name into it. A
 * waiter that reads null waits rather than taking the lock over, which is what keeps that instant
 * from being a race.
 */
function whoIsBuildingThePage(who = WHO_IS_BUILDING): number | null {
  let said: string
  try {
    said = readFileSync(who, 'utf8')
  } catch {
    return null
  }
  const found = /^process (\d+)$/m.exec(said.trim())
  if (found === null) return null
  return Number(found[1])
}

/** Is that process still there? `signal 0` asks without sending anything. */
function thatProcessIsStillThere(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    // ESRCH is the answer wanted: no such process. EPERM means it is there and belongs to somebody
    // else, which is still there.
    return (err as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

/** Vite's pre-bundled dependencies for this build, kept between runs so a rebuild stays cheap. */
const THE_BUILDS_OWN_CACHE = join(REPO, 'dist', 'web-for-tests-cache')

/**
 * What the build took in, as the note beside the build records it: the newest of the files the page
 * is built from, and the NODE_ENV the build ran with.
 *
 * Exported, with the two functions below, because the test that asserts a development build is built
 * again has to hand the comparison a note of its own.
 */
export interface WhatTheBuildTookIn {
  newestSourceFile: string | null
  newestSourceAt: string | null
  /** Always `production`: see "BUILT FOR PRODUCTION" above. A note from before 25 September 2026 has none. */
  nodeEnv: 'production'
}

export function whatThePageWouldBeBuiltFrom(): WhatTheBuildTookIn {
  const newest = newestSourceBuiltFrom(THE_PAGES_ENTRY, REPO)
  return {
    newestSourceFile: newest === null ? null : newest.file,
    newestSourceAt: newest === null ? null : newest.at.toISOString(),
    nodeEnv: 'production',
  }
}

/**
 * Does a note read from beside a build say it is the build wanted?
 *
 * The note is read loosely, because it may come from an older version of this file: a field it does
 * not have is a field that does not match, so the page is built again.
 */
export function theNoteSaysItIsTheBuildWanted(
  said: Partial<Record<keyof WhatTheBuildTookIn, unknown>>,
  wanted: WhatTheBuildTookIn,
): boolean {
  return (
    said.newestSourceFile === wanted.newestSourceFile &&
    said.newestSourceAt === wanted.newestSourceAt &&
    said.nodeEnv === wanted.nodeEnv
  )
}

/** Is the build that is there the build of the source that is there, built for production? */
function theBuiltPageIsAsNewAsTheSource(wanted: WhatTheBuildTookIn): boolean {
  if (!existsSync(join(THE_PAGE_BROWSER_TESTS_ARE_SERVED, 'index.html'))) return false
  let said: Partial<Record<keyof WhatTheBuildTookIn, unknown>>
  try {
    said = JSON.parse(readFileSync(WHAT_THE_BUILT_PAGE_WAS_BUILT_FROM, 'utf8')) as typeof said
  } catch {
    // No note beside the build, or one this code cannot read. Either way nothing here knows what
    // that build took in, and a build of unknown age is one to do again.
    return false
  }
  return theNoteSaysItIsTheBuildWanted(said, wanted)
}

/**
 * HOW LONG EITHER WAIT FOR A PAGE MAY LAST, in milliseconds: four minutes (240 seconds).
 *
 * THE CALLERS' LIMITS ARE FIVE MINUTES, AND THE REFUSAL MUST PRINT BEFORE THEM. The callers' limits
 * are 300 seconds: tests/a-report-page-says-what-is-missing-in-words.test.ts gives its beforeAll 300
 * seconds at line 94 and one case 300 seconds at line 164; tests/a-pipeline-reads-in-tiers.test.ts:262
 * gives a case that starts liveApp inside itself 300 seconds; and the three tests that call
 * `theCheckoutsPageBuiltAtThisCommit` give its hook 300 seconds:
 * tests/the-mole-office-command-starts-the-paired-office.test.ts:322,
 * tests/the-mole-office-command-starts-the-stable-office.test.ts:193 and
 * tests/the-mole-office-command-stops-the-supervisor.test.ts:300. A wait that ended at the same five
 * minutes would be ended by vitest's own timer first, and its refusal, which names the lock and the
 * holder, would never print.
 */
export const HOW_LONG_A_PAGE_WAIT_MAY_LAST = 240_000

/** The most of a stopped build's output a refusal repeats, in bytes. */
const THE_MOST_OF_A_STOPPED_BUILDS_OUTPUT = 2 * 1024

/** How long a build gets to end after SIGTERM before it is sent SIGKILL. */
const THE_TIME_A_BUILD_GETS_TO_END_AFTER_SIGTERM = 5_000

/** A measured time in whole seconds, never below zero. */
function wholeSecondsOf(ms: number): number {
  return Math.max(0, Math.round(ms / 1000))
}

/** The last of what a stopped build printed, at most 2 KB, or that it printed nothing. */
function theLastLinesOfABuildsOutput(output: string): string {
  const bytes = Buffer.from(output, 'utf8')
  const kept =
    bytes.length > THE_MOST_OF_A_STOPPED_BUILDS_OUTPUT
      ? bytes.subarray(bytes.length - THE_MOST_OF_A_STOPPED_BUILDS_OUTPUT)
      : bytes
  const said = kept.toString('utf8').trim()
  return said === '' ? '(the build printed nothing)' : said
}

/** What a wait saw when it gave up, for the words it refuses with. */
export interface WhatTheWaitSaw {
  /** How long this process waited, in whole seconds. */
  waitedSeconds: number
  /** The directory a builder makes, and the file inside it naming the holder. */
  lock: string
  who: string
  /** What who.txt says, and whether the process it names is still running; or that it cannot be read. */
  holder: string
  /** The build this wait stopped at its limit, when it stopped one. */
  stoppedAtTheLimit: { signal: 'SIGTERM' | 'SIGKILL'; seconds: number; output: string } | null
}

/** A build of a page that has started, and can be stopped while it is still running. */
export interface ABuildOfThePage {
  /** Resolves when it ended by itself, refusing with the build's own words when it ended badly. */
  ended: Promise<void>
  /** What it has printed so far, for the refusal when it is stopped. */
  output: () => string
  /**
   * SIGTERM or SIGKILL the child it started, and say whether it was still running. A build with no
   * `stop` is one this file cannot give a limit or stop, so its wait only gives up between builds.
   */
  stop?: (signal: 'SIGTERM' | 'SIGKILL') => boolean
}

/** A page to wait for: where its lock is, how to tell it is there, and how to build it. */
export interface APageWaitedFor {
  /** The directory a builder makes while it builds. */
  lock: string
  /** The file inside the lock naming the process that holds it. */
  who: string
  /** How long this process may wait, in milliseconds. */
  limit: number
  /** Is the page this wait is for there and as wanted? */
  ready: () => boolean
  /** Start building it. The wait gives it the time left before the wait gives up, and stops it then. */
  build: () => ABuildOfThePage
  /** How many builds this process has made. The words say it, and a caller's cap reads it. */
  builds: () => number
  /** More than this many builds ends the wait too, when the caller wants it. */
  moreThanThisManyBuilds?: number
  /** The whole sentence refusing, given what the wait saw. */
  refusal: (seen: WhatTheWaitSaw) => string
}

/**
 * WHAT THE LOCK'S who.txt SAYS, IN WORDS THAT NEVER GUESS A HOLDER.
 *
 * It opens the file at the path it is given. A file it cannot open, and a file whose words are not
 * `process <n>`, are both said as such: a waiter that guessed a holder could take a lock from nobody.
 */
function whatTheLockSays(who: string): string {
  try {
    readFileSync(who, 'utf8')
  } catch {
    return `${who} could not be read, so this does not know who holds the lock`
  }
  const holder = whoIsBuildingThePage(who)
  if (holder === null) return `${who} says nothing readable, so this does not know who holds the lock`
  if (holder === process.pid) return `${who} says process ${String(holder)}, which is this process`
  return thatProcessIsStillThere(holder)
    ? `${who} says process ${String(holder)}, and that process is still running`
    : `${who} says process ${String(holder)}, and that process is no longer running`
}

/**
 * THE WORDS A WAIT FOR A PAGE SAYS WHEN IT GIVES UP.
 *
 * Both waits share them so the two refusals cannot drift apart. They name how long this process
 * waited, the lock directory, and what who.txt says about its holder. A build this wait stopped at
 * its limit is said as stopped, with how long it ran and the last of what it printed.
 */
export function theWordsWhenAPageWaitGivesUp(
  page: 'the page a browser test is served' | 'dist/web',
  seen: WhatTheWaitSaw,
  builds: number,
): string {
  const stopped =
    seen.stoppedAtTheLimit === null
      ? ''
      : ' Its build was still running when the wait gave up, so it was stopped with ' +
        (seen.stoppedAtTheLimit.signal === 'SIGKILL'
          ? 'SIGKILL after it did not end 5 seconds after SIGTERM'
          : 'SIGTERM') +
        ` at the limit after ${String(seen.stoppedAtTheLimit.seconds)} seconds. The last lines it printed were:\n` +
        theLastLinesOfABuildsOutput(seen.stoppedAtTheLimit.output)
  if (page === 'dist/web') {
    return (
      `dist/web is not built at this commit after ${String(seen.waitedSeconds)} seconds of waiting. ` +
      `${seen.lock} is the lock. ${seen.holder}.${stopped}`
    )
  }
  return (
    `The page a browser test is served is not ready after ${String(seen.waitedSeconds)} seconds of waiting and ` +
    `${String(builds)} builds, which is a build of about a second. Either the build keeps failing, or what it ` +
    `takes in keeps moving. ${seen.lock} is the lock. ${seen.holder}.${stopped}`
  )
}

/**
 * WAIT FOR A PAGE TO BE THERE, BUILDING IT UNDER A LOCK IF NOBODY IS BUILDING IT ALREADY.
 *
 * The worker that makes the lock directory builds; every other waits for `ready` to say the page is
 * there, and then uses it. The paths, the limit, the readiness check and the build are arguments so
 * that a test can drive this with a lock of its own and a short limit, never the checkout's dist/.
 */
export async function waitForAPage(asked: APageWaitedFor): Promise<void> {
  const startedAt = Date.now()
  const deadline = startedAt + asked.limit
  // Who took the lock, let it go, waited for it and removed it goes in the test file's startup
  // journal, in the words the server build's lock uses (tests/the-server-browser-tests-start.ts),
  // because who.txt is gone by the time anybody reads a red run.
  const me = `process ${String(process.pid)}`
  const named = relative(REPO, asked.lock)
  let waitedFor: number | null = null
  for (;;) {
    if (asked.ready()) return
    /**
     * THE DEADLINE IS ASKED ABOUT ON EVERY TURN OF THIS LOOP, not only while waiting for somebody
     * else. Measured on 23 September 2026, with `theBuiltPageIsAsNewAsTheSource` broken on purpose
     * to prove the test below it: this worker built the page, found it still not up to date, built
     * it again, and would have gone on doing that for ever. A harness that cannot finish and says
     * nothing is worse than one that fails, so the number of builds is what ends it.
     */
    if (
      Date.now() >= deadline ||
      (asked.moreThanThisManyBuilds !== undefined && asked.builds() > asked.moreThanThisManyBuilds)
    ) {
      throw new Error(
        asked.refusal({
          waitedSeconds: wholeSecondsOf(Date.now() - startedAt),
          lock: asked.lock,
          who: asked.who,
          holder: whatTheLockSays(asked.who),
          stoppedAtTheLimit: null,
        }),
      )
    }
    mkdirSync(dirname(asked.lock), { recursive: true })
    let mine = false
    try {
      mkdirSync(asked.lock)
      mine = true
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    }
    if (mine) {
      try {
        writeFileSync(asked.who, `process ${String(process.pid)}\n`)
        keepTheSetupWait(me, `took ${named}`)
        // Read again under the lock: the file that held it before may have built this page.
        if (asked.ready()) return
        const startedBuilding = Date.now()
        const running = asked.build()
        let stoppedWith: 'SIGTERM' | 'SIGKILL' | null = null
        const stop = running.stop
        let killTimer: NodeJS.Timeout | undefined
        const limitTimer =
          stop === undefined
            ? undefined
            : setTimeout(() => {
                if (!stop('SIGTERM')) return
                stoppedWith = 'SIGTERM'
                killTimer = setTimeout(() => {
                  if (stop('SIGKILL')) stoppedWith = 'SIGKILL'
                }, THE_TIME_A_BUILD_GETS_TO_END_AFTER_SIGTERM)
              }, Math.max(0, deadline - Date.now()))
        try {
          await running.ended
        } catch (err) {
          if (stoppedWith === null) throw err
        } finally {
          if (limitTimer !== undefined) clearTimeout(limitTimer)
          if (killTimer !== undefined) clearTimeout(killTimer)
        }
        if (stoppedWith !== null) {
          throw new Error(
            asked.refusal({
              waitedSeconds: wholeSecondsOf(Date.now() - startedAt),
              lock: asked.lock,
              who: asked.who,
              holder: whatTheLockSays(asked.who),
              stoppedAtTheLimit: {
                signal: stoppedWith,
                seconds: wholeSecondsOf(Date.now() - startedBuilding),
                output: running.output(),
              },
            }),
          )
        }
      } finally {
        rmSync(asked.lock, { recursive: true, force: true })
        keepTheSetupWait(me, `let go of ${named}`)
      }
      continue
    }
    /**
     * A LOCK NOBODY HOLDS IS TAKEN OVER, rather than waited out.
     *
     * Measured on 23 September 2026: a worker was killed in the middle of a build, its `finally`
     * never ran, and the directory it had made stopped every later test in the checkout — each one
     * waiting five minutes for a process that was not there. The row inside the lock says which
     * process made it, so a waiter can ask the operating system whether that process is still
     * running, and a lock held by nobody is removed. `mkdir` is what decides who then gets it, so
     * two waiters removing it in the same instant still end with one builder.
     */
    const holder = whoIsBuildingThePage(asked.who)
    if (holder !== null && !thatProcessIsStillThere(holder)) {
      rmSync(asked.lock, { recursive: true, force: true })
      keepTheSetupWait(me, `removed ${named}, which process ${String(holder)} held and has ended`)
      continue
    }
    if (holder !== null && holder !== waitedFor) {
      waitedFor = holder
      keepTheSetupWait(me, `waits for ${named}, which process ${String(holder)} holds`)
    }
    await sleep(200)
  }
}

/** Run `vite build` into the folder above, and write the note beside it when it finished. */
function buildThePageForTests(wanted: WhatTheBuildTookIn): ABuildOfThePage {
  rmSync(WHAT_THE_BUILT_PAGE_WAS_BUILT_FROM, { force: true })
  const child = spawn(
    join(REPO, 'node_modules', '.bin', 'vite'),
    ['build', '--outDir', THE_PAGE_BROWSER_TESTS_ARE_SERVED, '--emptyOutDir'],
    {
      cwd: REPO,
      // A CACHE OF THIS BUILD'S OWN. Without it the build writes into the checkout's cache, which in
      // a worktree used to be the main checkout's — the directory the owner's dev server reads.
      // Problem `nGHs0tZ27YKS` has the account of the owner's page reloading because a suite started.
      // NODE_ENV COMES FROM THE NOTE, so the note cannot say one mode while the build runs another.
      // Without it the build inherits the test runner's `test`; see "BUILT FOR PRODUCTION" above.
      env: { ...process.env, MOLE_OFFICE_VITE_CACHE: THE_BUILDS_OWN_CACHE, NODE_ENV: wanted.nodeEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let said = ''
  let ended = false
  const keep = (chunk: unknown): void => {
    said += String(chunk)
  }
  child.stdout?.on('data', keep)
  child.stderr?.on('data', keep)
  const finished = (async (): Promise<void> => {
    const [code] = (await once(child, 'exit')) as [number | null, NodeJS.Signals | null]
    ended = true
    if (code !== 0) {
      throw new Error(
        `The page the browser tests are served could not be built (vite build exited ${String(code)}):\n${said}`,
      )
    }
    writeFileSync(WHAT_THE_BUILT_PAGE_WAS_BUILT_FROM, `${JSON.stringify(wanted, null, 2)}\n`)
    // Counted, because "built once" is the whole of what this change was for and a count is the only
    // way to say it. `howManyTimesThisWorkerBuiltThePage` below hands it to the test that asserts it,
    // and `theBuiltPage` uses it to stop rather than build for ever.
    whatThisProcessStarted().builds += 1
  })()
  return {
    ended: finished,
    output: () => said,
    stop: (signal) => {
      if (ended) return false
      return child.kill(signal)
    },
  }
}

/**
 * THE BUILT PAGE, BUILT ONCE HOWEVER MANY WORKERS ASK AT THE SAME MOMENT.
 *
 * The worker that makes the lock directory builds; the others wait for the note beside the build to
 * say the build they want is there, and then use it.
 *
 * FOUR MINUTES AND THEN A REFUSAL, before the five minutes of the hooks and cases that call this.
 * A build of this page takes about a second, so anything near four minutes is a build that is not
 * going to finish. The refusal says how long this process waited, names the lock directory, and says
 * what the note inside it says about the holder and whether that process is still running. A build
 * still running when the wait gives up is stopped at the limit, and the refusal says so with the
 * last of what it printed.
 */
export async function theBuiltPage(): Promise<string> {
  const record = whatThisProcessStarted()
  if (record.builtPage !== null) return record.builtPage
  const wanted = whatThePageWouldBeBuiltFrom()
  await waitForAPage({
    lock: WHILE_THE_PAGE_IS_BEING_BUILT,
    who: WHO_IS_BUILDING,
    limit: HOW_LONG_A_PAGE_WAIT_MAY_LAST,
    ready: () => theBuiltPageIsAsNewAsTheSource(wanted),
    build: () => buildThePageForTests(wanted),
    builds: () => record.builds,
    moreThanThisManyBuilds: 20,
    refusal: (seen) => theWordsWhenAPageWaitGivesUp('the page a browser test is served', seen, record.builds),
  })
  record.builtPage = THE_PAGE_BROWSER_TESTS_ARE_SERVED
  return THE_PAGE_BROWSER_TESTS_ARE_SERVED
}

/**
 * ---------------------------------------------------------------------------------------
 * THE CHECKOUT'S OWN PAGE IN dist/web, BUILT ONCE AT THIS COMMIT HOWEVER MANY FILES ASK
 * ---------------------------------------------------------------------------------------
 *
 * Three files start serve-dev with --prepared, which serves the page in dist/web and refuses when
 * its build stamp does not name this checkout's commit. `npm run build` writes the page but no
 * stamp, so each of those files builds dist/web with the product's own builder whenever the stamp
 * does not name HEAD. That builder writes every build through one staging folder, dist/web-next, so
 * two builds at once empty each other's output.
 *
 * MEASURED, 2 November 2026. The merge queue ran the three files side by side after `npm run build`.
 * One of them copied dist/web with no index.html in it, and the office of another, which serves
 * dist/web, never answered. Three builds started 0.7 seconds apart in one checkout: the first
 * failed, because its output was emptied while it was being written.
 *
 * So the build is taken with a lock directory, as `theBuiltPage` above takes its own, and the stamp
 * is read again once the lock is held. A file that waited for another file's build finds the page
 * built at this commit and builds nothing. So dist/web is written once at a commit, and not again
 * while another file copies it or serves it.
 */
const THE_CHECKOUTS_PAGE = join(REPO, 'dist', 'web')

/** The directory a file makes while it builds dist/web, so that the others wait instead of building too. */
const WHILE_THE_CHECKOUTS_PAGE_IS_BEING_BUILT = join(REPO, 'dist', 'web-build-lock')

/** Is dist/web this commit's page: its index.html there, and its stamp naming the commit? */
function theCheckoutsPageIsAtThisCommit(): boolean {
  if (!existsSync(join(THE_CHECKOUTS_PAGE, 'index.html'))) return false
  const stamp = readTheBuildStamp(THE_CHECKOUTS_PAGE)
  const commit = theCommitOf(REPO)
  return stamp.state === 'read' && commit !== null && stamp.commit === commit
}

/**
 * BUILD dist/web AT THIS COMMIT UNLESS IT IS BUILT THERE ALREADY, one file at a time.
 *
 * Four minutes and then a refusal, before the five minutes of the hooks that call it. A lock whose
 * process has ended is taken over, for the reason given in `theBuiltPage`.
 *
 * ITS BUILD CANNOT BE GIVEN A LIMIT OR STOPPED. `buildThePage` in tools/build-the-page.mjs starts
 * the vite child itself and waits for it, and this file may not change that tool. So this wait gives
 * the build no `stop`, and its refusal is made only between builds: it still says how long this
 * process waited and what who.txt says about the holder, but a build already running cannot be
 * stopped at the limit from here.
 */
export async function theCheckoutsPageBuiltAtThisCommit(): Promise<void> {
  const who = join(WHILE_THE_CHECKOUTS_PAGE_IS_BEING_BUILT, 'who.txt')
  await waitForAPage({
    lock: WHILE_THE_CHECKOUTS_PAGE_IS_BEING_BUILT,
    who,
    limit: HOW_LONG_A_PAGE_WAIT_MAY_LAST,
    ready: theCheckoutsPageIsAtThisCommit,
    build: () => {
      const finished = (async (): Promise<void> => {
        const built = await buildThePage({ root: REPO })
        if (!built.ok) throw new Error(`the page serve-dev must serve could not be built:\n${built.output}`)
      })()
      return { ended: finished, output: () => '' }
    },
    builds: () => 0,
    refusal: (seen) => theWordsWhenAPageWaitGivesUp('dist/web', seen, 0),
  })
}

/**
 * ---------------------------------------------------------------------------------------
 * HANDING THE BUILT PAGE TO ONE TEST'S BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * It is an HTTP server inside the test process rather than a child, because there is nothing for a
 * child to do: the files are already built and this reads them off the disk. A child would be a
 * process to start, to watch and to stop for every one of 268 test files.
 *
 * WHAT IT STILL HAS TO DO THAT VITE DID. It tells the page which API to call. The page takes the
 * host out of its own address bar and the port from whoever served it, so a page built once cannot
 * know a port chosen minutes later; this writes it in. `src/web/lib/the-port-written-into-this-page.ts`
 * is the one reader and says why it is a tag in the page rather than anything else.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE THING BEING INSIDE THE TEST PROCESS COSTS, WRITTEN DOWN BECAUSE IT IS NOT OBVIOUS
 * ---------------------------------------------------------------------------------------
 *
 * IT CANNOT ANSWER WHILE THE TEST BLOCKS ITS OWN EVENT LOOP. A test that calls `execFileSync`,
 * `spawnSync` or anything else that stops this process stops this server with it, and a browser
 * asking for the page in the meantime is simply not answered. The failure reads
 * `page.goto: Timeout 60000ms exceeded` against an address that is up, which names nothing.
 *
 * MEASURED, 23 September 2026: `tests/one-part-of-a-report-is-one-part-at-every-level.test.ts` ran
 * `tools/zoom-sweep.mjs` with `execFileSync`, that tool opened a browser on this server, and it
 * waited sixty seconds for a page nothing was there to serve. The cure in that file is one word —
 * `execFile` awaited waits exactly as long without stopping the loop — and it is written down at
 * the call as well as here.
 *
 * A file that really must block, or that needs a page served by another process for a reason of its
 * own, asks for the dev server by name. `theDevServerBecause` on the options below is that ask.
 */

/**
 * WHAT EACH KIND OF FILE IS SENT AS.
 *
 * A kind that is not here is refused rather than sent as bytes of no kind. A stylesheet or a module
 * a browser will not run because it arrived unlabelled is a page that fails with nothing on it
 * saying why, and a refusal naming the extension is one line to fix. The list is every kind
 * `vite build` writes into this page, read off a build on 23 September 2026.
 */
const WHAT_A_FILE_IS_SENT_AS: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  // THE PDF READER'S WORKER. Vite writes the pdfjs-dist worker under its own name, which ends .mjs,
  // and the PDF tests need it sent as a script.
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

/**
 * THE BUILT PAGE, WITH THIS TEST'S API PORT WRITTEN INTO IT.
 *
 * IT REFUSES A PAGE WITH NO HEAD rather than serving one it wrote nothing into. A page served
 * without the port calls whoever served it — this server — and every request the test makes would
 * come back 404 with nothing saying why.
 */
function theBuiltPageWithTheApiPortInIt(folder: string, apiPort: number): string {
  const file = join(folder, 'index.html')
  const html = readFileSync(file, 'utf8')
  const head = '<head>'
  const at = html.indexOf(head)
  if (at === -1) {
    throw new Error(`${file} has no <head>, so there is nowhere to write this test's API port into the page`)
  }
  const tag = `\n    <meta name="${THE_API_PORT_TAG}" content="${String(apiPort)}" />`
  return html.slice(0, at + head.length) + tag + html.slice(at + head.length)
}

/**
 * Answer one request for the built page.
 *
 * A FILE THAT IS THERE IS THE FILE; EVERY OTHER PATH IS THE PAGE, WITH NO EXCEPTION.
 *
 * That is not a guess about what a caller wanted. It is what BOTH of the other two servers do, and
 * this one has to answer as they do or the tests it serves are measuring something nothing ships.
 * Vite answers its index for an unknown path, whatever the path looks like and whatever the caller
 * said it would accept — `tests/an-avatar-draws-in-development.test.ts` asserts exactly that,
 * because the whole point of that file is that a picture CANNOT be fetched off the web port. The
 * API server does the same for a built page, in `setNotFoundHandler` in src/server/index.ts: an
 * address that is not an API endpoint returns the app, because the app keeps its state in the URL
 * and a reload on `/records/abc` must return the app rather than a 404.
 *
 * IT WAS THE ACCEPT HEADER FOR AN AFTERNOON, and that was this file inventing a rule. Two tests
 * went red saying so: a page's own plain `fetch` says it accepts anything at all, so it got a 404
 * where both real servers answer 200.
 */
function answerFromTheBuiltPage(folder: string, page: string) {
  return (request: IncomingMessage, reply: ServerResponse): void => {
    const asked = new URL(request.url ?? '/', 'http://the-page')
    const wanted = resolve(folder, `.${decodeURIComponent(asked.pathname)}`)
    const inside = wanted.startsWith(`${folder}${sep}`)
    if (inside && existsSync(wanted) && statSync(wanted).isFile()) {
      const kind = WHAT_A_FILE_IS_SENT_AS[extname(wanted).toLowerCase()]
      if (kind === undefined) {
        reply.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
        reply.end(
          `The test harness does not know what kind of file ${extname(wanted)} is, so it will not send ` +
            `${asked.pathname} as bytes of no kind. WHAT_A_FILE_IS_SENT_AS in tests/helpers.ts is the list.`,
        )
        return
      }
      reply.writeHead(200, { 'content-type': kind, 'cache-control': 'no-store' })
      reply.end(readFileSync(wanted))
      return
    }
    reply.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    reply.end(page)
  }
}

/** The built page, being served to one test on one port. */
interface ThePageServed {
  /** Stop answering, and let go of the port. */
  close(): Promise<void>
}

/**
 * Serve the built page on this test's web port, and on the address for other machines when the test
 * asked for one.
 *
 * TWO DOORS, ONE PAGE, which is the shape the dev server and the API both have: a browser on the
 * address for other machines gets the same page, reads that address out of its own address bar, and
 * calls this test's API on the door that address opens. `serveTheAddressForOtherMachines` in
 * vite.config.ts is the same thing for a dev server and says why it is a second listener rather than
 * a host setting.
 */
async function serveTheBuiltPage(
  folder: string,
  apiPort: number,
  webPort: number,
  forOtherMachines: string | null,
): Promise<ThePageServed> {
  const answer = answerFromTheBuiltPage(folder, theBuiltPageWithTheApiPortInIt(folder, apiPort))
  const doors: HttpServer[] = []
  const openADoorOn = async (host: string): Promise<void> => {
    const door = serveOverHttp(answer)
    doors.push(door)
    await new Promise<void>((open, refuse) => {
      door.once('error', refuse)
      door.listen(webPort, host, () => {
        door.off('error', refuse)
        open()
      })
    })
  }
  try {
    await openADoorOn('127.0.0.1')
    if (forOtherMachines !== null) await openADoorOn(forOtherMachines)
  } catch (err) {
    for (const door of doors) door.close()
    const said = err instanceof Error ? err.message : String(err)
    // The port going to something else is its own failure, so the whole start is tried again on
    // another one. `retryWhenAPortWasTaken` above says why, with the measurement.
    if (saysThePortWasTaken(said, webPort)) throw new ThePortWasTaken(webPort, true, said)
    throw err
  }
  return {
    async close(): Promise<void> {
      for (const door of doors) {
        // THE OPEN CONNECTIONS TOO. A browser keeps its connection to a page open, and `close` on
        // its own waits for every one of them to go quiet before it lets the port go — which is the
        // port still held when the test asks whether it came back.
        door.closeAllConnections()
        await new Promise<void>((done) => {
          door.close(() => {
            done()
          })
        })
      }
    },
  }
}

/**
 * THE ONE CHROMIUM THIS WORKER PROCESS SHARES.
 *
 * ---------------------------------------------------------------------------------------
 * WHY ONE, AND NOT ONE PER TEST
 * ---------------------------------------------------------------------------------------
 *
 * A Chromium costs about a second to start and holds two inotify instances while it runs, and the
 * runner runs one test file at a time in a worker. So a worker starts one browser and every test in
 * it takes a CONTEXT from it. A context has its own cookies, its own storage and its own
 * permissions, which is the whole of the isolation a fresh browser was buying, and it costs
 * milliseconds rather than a second.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT ENDS
 * ---------------------------------------------------------------------------------------
 *
 * With the worker. Playwright starts Chromium holding a pipe to it, and Chromium exits when that
 * pipe closes, which is what the end of this process does however it ends. `stopEverythingNow`,
 * in tests/what-a-test-process-takes-with-it.ts, cannot be the one to close it: that runs in an
 * `exit` handler, and Node does not wait for a promise in one.
 *
 * Exported for tests/a-shared-test-process-gives-each-file-a-clean-start.test.ts, whose canary files
 * take a browser here and ask it for its time zone. tests/how-long-a-test-may-take.ts knows `liveApp`
 * and not this word, so a test that calls it gives its case the time a launch takes itself.
 */
export async function theBrowserThisWorkerShares(): Promise<Browser> {
  const record = whatThisProcessStarted()
  // A browser that has gone is not a browser. It is forgotten here rather than handed back, so the
  // next test starts one instead of driving something that is not there.
  if (record.browser !== null && !record.browser.isConnected()) {
    record.browser = null
    record.browserComing = null
  }
  if (record.browser !== null) return record.browser
  if (record.browserComing === null) {
    const coming = (async () => {
      const { chromium } = await import('playwright')
      const launched = await chromium.launch()
      storeNormalModeInEveryContextOf(launched)
      return launched
    })()
    // A start that failed is not remembered, so the next test tries again rather than waiting on a
    // promise that has already been refused.
    coming.catch(() => {
      record.browserComing = null
    })
    record.browserComing = coming
  }
  const browser = await record.browserComing
  record.browser = browser
  return browser
}

/**
 * CLOSE THE BROWSER THIS WORKER SHARES, so that the next test that needs a browser launches one. For a
 * test about the launch itself. The browser an earlier case of the same file started is still here, and
 * `liveApp` takes it without launching anything. When test files share a process
 * (MOLE_OFFICE_TEST_FILES_SHARE_A_PROCESS), tests/a-file-in-a-shared-process-starts-clean.ts closes it
 * between files.
 */
export async function closeTheBrowserThisWorkerShares(): Promise<void> {
  const record = whatThisProcessStarted()
  const browser = record.browser
  record.browser = null
  record.browserComing = null
  await browser?.close()
}

/**
 * EVERY TEST BROWSER STORES NORMAL MODE BEFORE ITS FIRST PAGE, where nothing is stored, as decided.
 *
 * A person the office makes starts in Developer mode, and a test world's person is made by the office. So a browser
 * with nothing stored would open in Developer mode once the page had read that person. The tests were written for what
 * Normal mode draws, so they still say Normal, here, in one place: every context the shared browser makes stores
 * `normal` under the key src/web/lib/mode.ts reads, on each document before it loads, unless a mode is stored already.
 * A mode a test stores itself is kept, and `?mode=` in the address still decides one load.
 *
 * A test of what the page does with nothing stored takes its context from `aContextThatStoresNoMode`, or asks `liveApp`
 * for `modeStored: 'nothing'`. A test that launches a Chromium of its own calls `storeNormalModeWhereNothingIsStored`
 * on its context.
 */
export async function storeNormalModeWhereNothingIsStored(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    // A document with no origin of its own, such as about:blank or a sandboxed frame, refuses storage and has no mode.
    try {
      if (window.localStorage.getItem('mole-office.mode') === null) window.localStorage.setItem('mole-office.mode', 'normal')
    } catch {
      return
    }
  })
}

/**
 * Playwright's own `newContext` of a shared browser, kept on the browser itself so that a test file evaluating this
 * module again finds it.
 */
const PLAYWRIGHTS_OWN_NEW_CONTEXT = Symbol.for('mole-office.tests.playwrights-own-new-context')

type ASharedBrowser = Browser & { [PLAYWRIGHTS_OWN_NEW_CONTEXT]?: Browser['newContext'] }

function storeNormalModeInEveryContextOf(browser: Browser): void {
  const shared = browser as ASharedBrowser
  const make = browser.newContext.bind(browser)
  shared[PLAYWRIGHTS_OWN_NEW_CONTEXT] = make
  // `newPage` on the browser makes its context through this same method, so a page taken that way stores it too.
  browser.newContext = async (options?: BrowserContextOptions) => {
    const context = await make(options)
    await storeNormalModeWhereNothingIsStored(context)
    return context
  }
}

/** A context of the shared browser that stores no mode, for a test of what the page does with nothing stored. */
export async function aContextThatStoresNoMode(browser: Browser, options?: BrowserContextOptions): Promise<BrowserContext> {
  const make = (browser as ASharedBrowser)[PLAYWRIGHTS_OWN_NEW_CONTEXT]
  if (make === undefined) {
    throw new Error('This browser is not the one this worker shares, so it stores no mode by itself. Take its context with newContext.')
  }
  return make(options)
}


/**
 * How many times this worker process has built the page.
 *
 * It is here for one assertion: that a worker running several browser tests builds the page at most
 * once, which is the whole of what this change was for.
 */
export function howManyTimesThisWorkerBuiltThePage(): number {
  return whatThisProcessStarted().builds
}

/** A running Mole Office of this test's own, with a browser looking at it. */
export interface LiveApp {
  apiLog(): readonly string[]
  /** The temporary directory holding this test's database. */
  dir: string
  apiPort: number
  webPort: number
  /** Where the API answers, e.g. http://127.0.0.1:41731 */
  api: string
  /** Where the browser app is served, e.g. http://127.0.0.1:41732 */
  site: string
  /**
   * THE ONE CHROMIUM THIS WORKER SHARES, not one this test started.
   *
   * A test that wants a second window of its own opens one on it, which is what eight files here
   * do. Never close it: the next test in this file is holding the same one. `stop()` below closes
   * this test's context, and the browser goes when the worker does.
   */
  browser: Browser
  /** This test's own cookies, storage and permissions. Closed by `stop()`. */
  context: BrowserContext
  page: Page
  /** Close this test's context, stop its servers, prove the ports came back, remove the database. */
  stop(): Promise<void>
}

export interface LiveAppOptions {
  /** Name each startup wait for a caller's deadline diagnostic. */
  onSetupWait?: (what: string) => void
  /**
   * A word for this test, used in the temporary directory's name so that a leftover directory says
   * which test made it.
   */
  name: string
  /** How big the browser window is. The screens under test are measured at this size. */
  viewport: { width: number; height: number }
  /**
   * Send touch events as well as mouse ones. A test of a path that only exists on a touch screen
   * has to send what a finger sends: a `click()` passes on a build where every touch handler has
   * been deleted, and `page.tap` without this throws rather than passing quietly.
   */
  hasTouch?: boolean
  /**
   * ALSO SERVE THIS STACK ON A SECOND ADDRESS, the way MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES does.
   *
   * `127.0.0.2` is the one to use: every Linux machine has the whole of `127.0.0.0/8`, so it is a
   * second address on this machine and it needs no network and no second machine.
   *
   * LEAVING IT OUT IS `none`, NOT SILENCE. Without a value here the child is told `none`, which is
   * the word that turns the setting off in an environment. Deleting the name instead would leave the
   * checkout's own `.env` to answer — and after step 1 of the human act in
   * design/ground/ACCEPTANCE.md section 7 that file names the owner's tailnet address, so every test
   * stack would open a door on it. Criterion R3's last clause says a scratch stack is never
   * reachable from off the machine unless its declaration says so; this is where a test stack
   * declares it.
   */
  addressForOtherMachines?: string
  /**
   * WHICH PROJECT THE SERVER FILES ITS OWN ROWS IN, as `MOLE_OFFICE_WORKSPACE` names it.
   *
   * Left out, the child inherits whatever the runner has, which in a checkout with no `.env` is the
   * built-in name — and a fresh test database holds only `default`, so the server's own session
   * record cannot be written and the start steps over it. A test that measures those rows says
   * `default` here. Nothing else needs it.
   */
  workspace?: string
  /**
   * THE DATABASE FILE TO SERVE, when it has to outlive one stack.
   *
   * Left out, each stack gets a fresh file inside the temporary directory it makes and deletes,
   * which is what every test wants. A test that measures what a SECOND start makes of what a first
   * start left behind names one file here and both stacks serve it. The file is the caller's to
   * make and to remove; `stop()` still deletes only the directory this helper made.
   */
  database?: string
  /**
   * THE READING LEVEL THIS WORLD OPENS A RECORD PAGE AT, where the test needs a position other than
   * the product's own opening level.
   *
   * THE OWNER'S ACT 3a OF 15 SEPTEMBER 2026 makes a record
   * page open at its summary. A test about pointing at a report's blocks, or about a diagram drawn
   * at Full, is about that level and not about the opening level, so it says so here rather than
   * inheriting a default that moved under it. The opening default has its own test in
   * tests/a-reader-goes-no-lower-than-conclusion.test.ts, which stores nothing.
   *
   * It is written before every document, so it is the reader's own stored choice and wins over the
   * default by the ordinary precedence. A test that manages the level itself leaves this out.
   */
  opensAt?: Rung
  /**
   * SERVE THIS TEST FROM A VITE DEV SERVER, AND SAY WHY.
   *
   * Every other browser test is served the page built once for the whole run, which is what the
   * page is in a build: minified, with no module graph, no file watcher, no hot reload and no
   * address that only a dev server answers. A few tests are ABOUT one of those things and cannot be
   * about it from a build.
   *
   * THE REASON IS THE OPTION, rather than a bare yes. A file that asks for a dev server is paying a
   * dependency pre-bundle, a process and a file watcher for something, and the next person to read
   * the file has to be able to see what. It is written where the asking is, so it cannot be a list
   * somewhere else that goes stale.
   *
   * NO LIST OF THE FILES THAT ASK IS KEPT HERE, because a list here would be a second copy of what
   * those files say and would go stale the first time one of them changed. The files themselves are
   * the list: `grep -l theDevServerBecause tests/*.test.ts` names them, and each one says its own
   * reason at the call.
   *
   * IT IS ALSO THE WAY OUT of the one thing the page server inside this process cannot do, which is
   * answer while the test blocks its own event loop. `serveTheBuiltPage` above has the measurement.
   */
  theDevServerBecause?: string
  /**
   * HOW OFTEN THIS OFFICE'S REMIND ME LATER TIMER LOOKS, in seconds. Absent keeps the product's minute. A test
   * that moves a put-off message's time into the past and waits for it to come back sets 1, so it waits about
   * a second rather than up to a minute. src/server/lib/remind-me-later.ts reads it.
   */
  remindMeLaterEverySeconds?: number
  /**
   * HOW OFTEN THIS OFFICE'S SERVER LOOKS AGAIN AT EVERYBODY'S PRESENCE, in milliseconds. Absent keeps the product's
   * minute. A test that waits for a presence change to reach an open page sets a few seconds, so it waits one short
   * look rather than up to a minute. `startTheClock` in src/server/api/events.ts reads it.
   */
  lookAtPresenceAgainEveryMs?: number
  /**
   * HOW OFTEN THIS OFFICE'S SERVER RUNS ITS SLEEP CLOCK, in milliseconds. Absent keeps the product's minute. A test that
   * waits for the office to begin a sleep whose time is a whole minute sets a second, so the wait is the wait for that
   * minute to open rather than up to a minute more. `startTheSleepClock` in src/server/lib/sleep-windows.ts reads it.
   */
  runTheSleepClockEveryMs?: number
  /**
   * WHAT THE BROWSER HAS STORED AS ITS MODE BEFORE THE FIRST PAGE. Left out, `normal`, where nothing is stored yet, as
   * `storeNormalModeWhereNothingIsStored` says. `nothing` stores nothing, for a test of what the page does then.
   */
  modeStored?: 'normal' | 'nothing'
}

/**
 * MAKE THIS BROWSER PAGE OPEN ITS RECORD PAGES AT ONE READING LEVEL.
 *
 * A test about pointing at a report's blocks, or about a diagram drawn at Full, is about that level
 * and not about the opening level the owner's act 3a of 15 September 2026 set. The level is written as the
 * reader's own stored choice on every document before it loads, so it wins by the ordinary
 * precedence. Exported because two test files build their own browser rather than asking `liveApp`.
 *
 * A CONTEXT OR A PAGE. `liveApp` sets it on the context, so every page a test opens inside its own
 * context opens at that level rather than only the first one. A caller holding a page still hands
 * in a page, and both carry the same `addInitScript`.
 */
export async function openRecordPagesAt(page: Page | BrowserContext, rung: Rung): Promise<void> {
  const key = detailKeyForSurface('reportContent')
  await page.addInitScript(
    ([where, level]) => {
      window.localStorage.setItem(where as string, level as string)
    },
    [key, rung] as const,
  )
}

/**
 * Start a Mole Office of this test's own and hand back the pieces.
 *
 * WHAT IS THIS TEST'S OWN AND WHAT IS SHARED. Its own: an API server on its own port, a database in
 * its own temporary directory, the row in its own ledger, and a browser context with its own
 * cookies and storage. Shared with the rest of the run: the page, built once; shared with the rest
 * of this worker: the Chromium the context comes from. Everything shared is read-only to a test, so
 * nothing one test does can reach another.
 *
 * SEED AFTER THIS RETURNS, not inside it. Everything a test wants in the database it can write
 * through `api` before it opens a page, and doing it in the test file keeps the seeding beside the
 * assertions it is for.
 */
/**
 * TAKE THE COPIED DEFAULT CHAPTERS OUT OF A TEST OFFICE. A fresh office copies the default
 * regulations into its own chapter records at its first start (src/server/lib/default-regulations.ts,
 * wave 13s round 7). A test about a project that holds only the chapters it files itself, or about
 * the words a page draws around its own content, deletes them first, as the person would. Answers
 * how many it deleted. The person id is read from the shared module, as every test reads it.
 */
export async function deleteTheCopiedDefaultChapters(api: string): Promise<number> {
  const { THE_PERSON } = await import('../src/shared/person.ts')
  const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
  const read = await fetch(`${api}/api/office-regulations`, { headers })
  if (!read.ok) throw new Error(`GET /api/office-regulations answered ${String(read.status)}: ${await read.text()}`)
  const held = (await read.json()) as { chapters: { id: string }[]; copiedFromTheDefaults: unknown }
  if (held.copiedFromTheDefaults === null) return 0
  for (const chapter of held.chapters) {
    const gone = await fetch(`${api}/api/records/${chapter.id}`, { method: 'DELETE', headers })
    if (!gone.ok) throw new Error(`DELETE of the copied chapter ${chapter.id} answered ${String(gone.status)}: ${await gone.text()}`)
  }
  return held.chapters.length
}

/**
 * TAKE THE COPIED DEFAULT FLOWS OUT OF A TEST OFFICE. A fresh office copies the ten general
 * office flows into its own flow records at its first start (src/server/lib/default-flows.ts,
 * wave 13r). A test about a project that holds only the flows it files itself deletes them first,
 * as the person would. Answers how many it deleted. The sentence every copied flow carries is read
 * from src/config/default-flows.json, as the code reads it. The person id is read from the shared
 * module, as every test reads it.
 */
export async function deleteTheCopiedDefaultFlows(api: string): Promise<number> {
  const { THE_PERSON } = await import('../src/shared/person.ts')
  const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
  const read = await fetch(`${api}/api/records?kind=flow&limit=50&shape=full`, { headers })
  if (!read.ok) throw new Error(`GET /api/records?kind=flow&limit=50 answered ${String(read.status)}: ${await read.text()}`)
  const held = (await read.json()) as { records: { id: string; data: { declared_in?: unknown } }[] }
  const copiedSentence = defaultFlows.flows[0]!.declared_in
  const copied = held.records.filter((flow) => flow.data.declared_in === copiedSentence)
  for (const flow of copied) {
    const gone = await fetch(`${api}/api/records/${flow.id}`, { method: 'DELETE', headers })
    if (!gone.ok) throw new Error(`DELETE of the copied flow ${flow.id} answered ${String(gone.status)}: ${await gone.text()}`)
  }
  return copied.length
}

/**
 * TAKE THE ROLE CARD TEXT RECORDS OUT OF A TEST OFFICE. A fresh office files one `role_card_words`
 * record per role card in the default project at its first start (src/server/lib/card-words.ts, wave
 * 13w round 3). A test that counts the records of the default project deletes them first, as the
 * person would, and as it deletes the copied chapters. A deleted one is not filed again, and its card
 * shows the declaration's words. The record ids are read from GET /api/roles, which names each card's
 * record. Answers how many it deleted.
 */
export async function deleteTheFiledCardWords(api: string): Promise<number> {
  const { THE_PERSON } = await import('../src/shared/person.ts')
  const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
  const read = await fetch(`${api}/api/roles`, { headers })
  if (!read.ok) throw new Error(`GET /api/roles answered ${String(read.status)}: ${await read.text()}`)
  const held = (await read.json()) as { words: { role: string; record: string | null }[] }
  const filed = held.words.flatMap((one) => (one.record === null ? [] : [one.record]))
  for (const id of filed) {
    const gone = await fetch(`${api}/api/records/${id}`, { method: 'DELETE', headers })
    if (!gone.ok) throw new Error(`DELETE of the role card text ${id} answered ${String(gone.status)}: ${await gone.text()}`)
  }
  return filed.length
}

export async function liveApp(options: LiveAppOptions): Promise<LiveApp> {
  /**
   * THE WHOLE START IS ONE ATTEMPT, AND ANOTHER PORT IS ANOTHER ATTEMPT.
   *
   * `retryWhenAPortWasTaken` says why, with the measurement. Each attempt takes its own ports and
   * its own temporary directory and clears up after itself, so a second attempt starts from
   * nothing rather than from half of a first one.
   */
  return retryWhenAPortWasTaken(theStackFor(options), () =>
    startTheStack(options),
  )
}

/** Who starts, in what a start says. */
function theStackFor(options: LiveAppOptions): string {
  return `the stack for the browser test ${options.name}`
}

/**
 * One environment for every test dev stack (problem dJ5YEnJo9K_v). Hand-written copies missed
 * the no-watch setting and the test's own dependency cache, consuming inotify instances and
 * writing into the checkout's cache (problems 7n3NOgXhqux- and nGHs0tZ27YKS).
 */
export function devStackEnvironment(
  dir: string,
  apiPort: number,
  webPort: number,
  options: Pick<LiveAppOptions, 'database' | 'addressForOtherMachines' | 'workspace' | 'remindMeLaterEverySeconds' | 'lookAtPresenceAgainEveryMs' | 'runTheSleepClockEveryMs'> = {},
): NodeJS.ProcessEnv {
  return {
    ...withoutInheritedEffort(),
    MOLE_OFFICE_PORT: String(apiPort),
    MOLE_OFFICE_WEB_PORT: String(webPort),
    // THE ADDRESSES TOO, NOT ONLY THE PORTS, so that anything in this stack that asks for the API's
    // address (`apiAddressFrom`) gets this stack's and not the one the checkout's `.env` names.
    // Problem `f1uCdpMEB1hs` is the account of a Vite that registered with the owner's live API.
    MOLE_OFFICE_API: `http://127.0.0.1:${String(apiPort)}`,
    MOLE_OFFICE_WEB: `http://127.0.0.1:${String(webPort)}`,
    MOLE_OFFICE_DB: options.database ?? join(dir, 'panelx.db'),
    LOG_LEVEL: 'warn',
    // NO FILE WATCHER IN A VITE A TEST ASKED FOR BY NAME. Nothing edits a source file while a test
    // runs, so there is nothing for hot reload to carry, and a watching Vite costs one inotify
    // instance. Linux gives a user 128 of those in total; the reason and the measurement are in
    // vite.config.ts beside `noWatch`. Every other test is served the built page and starts no Vite.
    MOLE_OFFICE_NO_WATCH: '1',
    // NO TERMINAL HOLDER. `mole-office start` starts one, and it outlives the server by design, so a test that
    // starts and stops a scratch office would leave a holder running. A test about the holder sets on itself.
    MOLE_OFFICE_TERMINAL_HOLDER: 'off',
    // A DEPENDENCY CACHE OF THIS TEST'S OWN, for the same Vite, inside the directory this function
    // already makes and deletes. Without it a dev server bundles into the checkout's own cache,
    // which in a worktree is the main checkout's — the directory the owner's dev server on 5173 is
    // reading. Measured on 2 September 2026: that directory's mtime moved the second a suite
    // started in a worktree, and the owner's page reloaded. Problem `nGHs0tZ27YKS` has the account.
    MOLE_OFFICE_VITE_CACHE: join(dir, 'vite-cache'),
    // SAID OUT LOUD EITHER WAY. See `addressForOtherMachines` on the options for why silence is not
    // an option here.
    MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES: options.addressForOtherMachines ?? 'none',
    // See `workspace` on the options. Absent keeps whatever the runner has, which is what every
    // test but the one measuring the server's own session rows wants.
    ...(options.workspace === undefined ? {} : { MOLE_OFFICE_WORKSPACE: options.workspace }),
    ...(options.remindMeLaterEverySeconds === undefined
      ? {}
      : { MOLE_OFFICE_REMIND_ME_LATER_EVERY_SECONDS: String(options.remindMeLaterEverySeconds) }),
    ...(options.lookAtPresenceAgainEveryMs === undefined
      ? {}
      : { [THE_PRESENCE_LOOK_SETTING]: String(options.lookAtPresenceAgainEveryMs) }),
    ...(options.runTheSleepClockEveryMs === undefined
      ? {}
      : { [THE_SLEEP_CLOCK_SETTING]: String(options.runTheSleepClockEveryMs) }),
  }
}

/**
 * One wait of a start: named as it begins, and given up when the start must stop. `late` clears up what the wait brings
 * if it brings it after it was given up.
 */
type Stage = <T>(what: string, work: () => Promise<T>, late?: (value: T) => Promise<void>) => Promise<T>

/** Seconds, whole, for a time this measured. */
const wholeSeconds = (ms: number): string => String(Math.max(0, Math.round(ms / 1000)))

/** One attempt: a directory, two ports, the API, the page, the registration and a browser context. */
async function startTheStack(options: LiveAppOptions): Promise<LiveApp> {
  const who = theStackFor(options)
  // EACH STAGE STOPS WAITING WHEN ALL THAT IS LEFT OF THE HOOK'S OR CASE'S LIMIT IS THE TIME A START THAT STOPS NEEDS TO
  // CLEAR UP. The start then clears up and refuses, naming the wait it was in, before vitest says the hook timed out,
  // which names nothing. The end is the hook's or case's, so a second attempt after a taken port stops at the same time.
  // tests/the-time-a-hook-has-left.ts reads it.
  const end = whenThisHookOrCaseMustEnd()
  const keptBack = A_START_THAT_STOPS_CLEARS_UP_WITHIN_MS + (options.theDevServerBecause === undefined ? 0 : A_SERVER_STOPS_WITHIN_MS)
  const stopsAt = end === null ? Number.POSITIVE_INFINITY : end.at - keptBack
  if (end !== null && Date.now() >= stopsAt) {
    throw new Error(
      `${who} did not start: its ${end.of} had ${wholeSeconds(end.at - Date.now())} s left, less than the ` +
        `${String(keptBack / 1000)} s a start that stops needs to clear up.`,
    )
  }
  // EACH STAGE IS A NAMED WAIT, so one that has lasted 30 seconds says so in the log, and none outlasts the attempt,
  // however it ends. tests/a-start-names-its-wait.ts.
  const waits = namedWaits(who)
  const waitFor = (what: string): void => {
    keepTheSetupWait(who, what)
    options.onSetupWait?.(what)
    waits.wait(what)
  }
  const stage: Stage = async (what, work, late) => {
    waitFor(what)
    if (end === null || !Number.isFinite(stopsAt)) return work()
    const stopped = (): Error => new Error(
      `${who} stopped waiting for ${what} ${wholeSeconds(Date.now() - (end.at - end.limitMs))} s into its ${end.of}, ` +
        `because its ${end.of} may take ${String(end.limitMs / 1000)} s, and a start that stops needs ` +
        `${String(keptBack / 1000)} s of that to clear up.`,
    )
    if (Date.now() >= stopsAt) {
      keepTheSetupWait(who, THE_GIVE_UP_PREFIX + what)
      throw stopped()
    }
    const given = work()
    let timer: ReturnType<typeof setTimeout> | undefined
    const givenUp = new Promise<'given up'>((resolve) => {
      timer = setTimeout(() => resolve('given up'), stopsAt - Date.now())
    })
    try {
      const first = await Promise.race([given.then((value) => ({ value })), givenUp])
      if (first !== 'given up') return first.value
    } finally {
      clearTimeout(timer)
    }
    // WHAT IT STOPPED WAITING FOR MAY STILL END. What it brings then is cleared up, and a failure is said in one line,
    // because nothing is left to throw it to.
    given.then(
      async (value) => {
        try {
          await late?.(value)
        } catch (error) {
          console.warn(`${who}: what ${what} brought after the start had stopped waiting for it could not be cleared up: ${error instanceof Error ? error.message : String(error)}`)
        }
      },
      (error: unknown) => {
        console.warn(`${who}: ${what} failed after the start had stopped waiting for it: ${error instanceof Error ? error.message : String(error)}`)
      },
    )
    keepTheSetupWait(who, THE_GIVE_UP_PREFIX + what)
    throw stopped()
  }
  try {
    return await theStagesOfTheStack(options, who, waitFor, stage)
  } finally {
    waits.done()
  }
}

/**
 * The stages of one attempt, each through `stage`, which names it and gives it up when the start must stop. The clean-up
 * after a failure is named with `waitFor` and is never given up.
 */
async function theStagesOfTheStack(options: LiveAppOptions, who: string, waitFor: (what: string) => void, stage: Stage): Promise<LiveApp> {
  const record = whatThisProcessStarted()
  const held = await stage(
    'reserving the API and page ports',
    async () => ({ api: await reservePort(), web: await reservePort() }),
    async (late) => {
      await late.api.release()
      await late.web.release()
    },
  )
  const dir = aTestDatabaseFolder(options.name)
  const apiPort = held.api.port
  const webPort = held.web.port
  const api = `http://127.0.0.1:${String(apiPort)}`
  const site = `http://127.0.0.1:${String(webPort)}`
  const env = devStackEnvironment(dir, apiPort, webPort, options)
  // Read through the one function that decides what the setting means, rather than asking here
  // whether the option was left out: `none` is off and this is the only reader of that rule.
  const forOtherMachines = addressForOtherMachinesFrom(env)

  const services: Service[] = []
  let served: ThePageServed | null = null
  let context: BrowserContext | null = null
  try {
    // THE API SERVER FROM ITS BUILD, made once for the run and never older than the checkout's
    // sources; tests/the-server-browser-tests-start.ts says how, and what it saves over tsx.
    const theServer = await stage('the API server build or its lock', () => theServerBrowserTestsStart())
    // LAYER 3, HALF ONE: the server watches the pid that started it. src/server/index.ts holds it.
    await held.api.release()
    services.push(
      startDetached(
        'the API server',
        process.execPath,
        apiServerArguments([], theServer),
        env,
        record,
      ),
    )
    // The database is read as the server reads it, through the declaration's own reader.
    const database = databasePathFrom(env)
    await stage('the API server to answer /api/health', () =>
      readyOrSayThePortWentElsewhere(services[0] as Service, `${api}/api/health`, apiPort, held.api.ours, (res) =>
        anotherServerAnswered(res, database),
      ),
    )

    /**
     * THE PAGE. Built once for the whole run and handed out from inside this process, unless this
     * test asked for a dev server by name and said why.
     *
     * WHAT IS WRITTEN IN THE LEDGER FOR IT. Whichever of the two serves the page, the process
     * holding the web port is registered with this test's own API. For the built page that process
     * is this test worker itself, and the row says so; for a dev server it is the Vite.
     */
    let thePagesProcess: number | null
    let whatServesThePage: string
    if (options.theDevServerBecause === undefined) {
      const folder = await stage('the browser page build or its lock', () => theBuiltPage())
      await held.web.release()
      served = await stage(
        'the page server to take its port',
        () => serveTheBuiltPage(folder, apiPort, webPort, forOtherMachines),
        (late) => late.close(),
      )
      thePagesProcess = process.pid
      whatServesThePage = `the browser app a browser test served for ${options.name}, out of the page built once ` +
        'for this run, from inside the test process'
    } else {
      const watched = commandThatStopsWithItsOwner(join(REPO, 'node_modules', '.bin', 'vite'),
        ['--strictPort', '--host', '127.0.0.1'])
      await held.web.release()
      services.push(
        startDetached(
          'Vite',
          watched.command,
          watched.args,
          env,
          record,
        ),
      )
      await stage('Vite to answer on the page port', () =>
        readyOrSayThePortWentElsewhere(services[1] as Service, `${site}/`, webPort, held.web.ours),
      )
      thePagesProcess = services[1]?.child.pid ?? null
      whatServesThePage = `the browser app a browser test started for ${options.name}, a dev server because ` +
        options.theDevServerBecause
    }

    // EVERY SERVER THIS TEST STARTED IS WRITTEN INTO THE LEDGER, THROUGH THE SAME ROUTE ANYTHING
    // ELSE WOULD USE. Criterion G5 of design/ground/ACCEPTANCE.md. On 1 September 2026 an
    // unregistered test stack held ports 29601 and 29602 on a temporary database for a day and a
    // half and nobody's list had it; the fix is that a test's own servers are as registered as
    // anything else, with the world they serve on the row.
    //
    // It registers against ITS OWN API, not the owner's: the server that answers is the one that
    // can honestly read its own checkout, database and commit, and this test's rows belong in this
    // test's database.
    await stage('the test office to record its servers', () =>
      registerThisTestsServers(api, options.name, thePagesProcess, whatServesThePage),
    )

    const browser = await stage('Chromium to launch', () => theBrowserThisWorkerShares())
    const asked: BrowserContextOptions = {
      viewport: options.viewport,
      ...(options.hasTouch === true ? { hasTouch: true } : {}),
    }
    const made = await stage(
      'Chromium to create the browser context',
      () => (options.modeStored === 'nothing' ? aContextThatStoresNoMode(browser, asked) : browser.newContext(asked)),
      (late) => late.close(),
    )
    context = made
    // THE READING LEVEL THIS WORLD OPENS AT, where the test asked for one. See `opensAt`. It is set
    // on the context rather than on the one page, so every page this test opens in it opens there.
    const opensAt = options.opensAt
    if (opensAt !== undefined) {
      await stage('Chromium to set the opening reading level', () => openRecordPagesAt(made, opensAt))
    }
    // A page that comes after the start stopped waiting for it closes with the context, which the clean-up closes.
    const page = await stage('Chromium to open the page', () => made.newPage())

    const started = browser
    const thisTestsContext = context
    const thePage = served
    // FROM HERE ON, A SERVER THAT STOPS ON ITS OWN IS A FAILURE OF THE CASE IT STOPPED IN, with
    // its exit code and its last lines. Problem `tiiuVJkCrNjs`; `watchForADeathDuringACase` says how.
    for (const service of services) watchForADeathDuringACase(service)
    return {
      apiLog: () => [...(services[0]?.log ?? [])],
      dir,
      apiPort,
      webPort,
      api,
      site,
      browser: started,
      context: thisTestsContext,
      page,
      async stop(): Promise<void> {
        // THE CONTEXT, NOT THE BROWSER. The browser is this worker's and the next test in this file
        // wants it; the context is this test's and everything it stored goes with it.
        await thisTestsContext.close()
        // Asked before anything is signalled, so it names only the servers that stopped by themselves.
        const stoppedOnTheirOwn = services.filter(hasEnded)
        for (const service of services) await stopGroup(service, record)
        if (thePage !== null) await thePage.close()
        // PROVE the ports came back rather than assuming a signal worked. `portComesBack` waits ten
        // seconds for each; the process holding the socket is a child of the child that was
        // signalled, and it does not always close in the same instant.
        for (const port of [apiPort, webPort]) {
          expect(
            await portComesBack(port),
            `port ${String(port)} is still held ten seconds after the test stopped its servers`,
          ).toBe(true)
        }
        removeThisTestFolder(dir)
        // A SERVER THAT STOPPED AND NO CASE SAID SO, for example one that stopped between cases, is
        // said here, after everything above has been cleared up, in the hook that called `stop()`.
        // One that a case's failure already named is not said again.
        const unsaid = stoppedOnTheirOwn.filter((service) => !service.deathReported)
        if (unsaid.length > 0) throw new Error(unsaid.map(whatThisServiceSaid).join('\n\n'))
      },
    }
  } catch (err) {
    waitFor(THE_CLEARING_UP_AFTER_A_FAILED_START)
    // Whichever probes are still listening have to be closed, or this process holds the ports it
    // failed to hand over. Closing one that is already closed does nothing.
    await held.api.release()
    await held.web.release()
    // A failure part of the way through leaves a server running and a port held for the rest of the
    // suite. The handlers above would take it at the end; this takes it now, so the next test file
    // is not slowed down by something that has already failed.
    if (context !== null) await context.close()
    if (served !== null) await served.close()
    for (const service of services) await stopGroup(service, record)
    removeThisTestFolder(dir)
    keepTheSetupWait(who, THE_CLEARING_UP_AFTER_A_FAILED_START_ENDED)
    throw err
  }
}

/**
 * Write this test's servers into its own ledger, through POST /api/runtime/register.
 *
 * A session record first, because a resource is owned by the session that started it and a fresh
 * test database has none. The record says which test made it, so a row left behind in a leftover
 * database names its author.
 *
 * A WRITE THAT DOES NOT GO THROUGH FAILS THE TEST. The test's own office answers a refused write
 * with the reason it refused, and this throws with that answer rather than warning and carrying on.
 * A browser test whose servers are on no list is the defect (criterion G5), and one warning inside
 * a passing run hides it. tests/a-browser-tests-servers-are-in-its-own-ledger.test.ts is what
 * asserts the registration really happens, and it asserts it through `liveApp`.
 */
async function registerThisTestsServers(
  api: string,
  name: string,
  thePagesProcess: number | null,
  whatServesThePage: string,
): Promise<void> {
  const headers = {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': 'vitest/liveApp',
  }

  /**
   * THE OFFICE'S OWN ANSWER TO A WRITE THAT DID NOT GO THROUGH.
   *
   * A refusal carries its reason in the JSON body, and the reason names what to do about it. The
   * status alone would lose that. A body that is not JSON is returned as it is, so nothing is
   * invented.
   */
  const theAnswerToAWrite = async (res: Response, what: string): Promise<Error> => {
    const body = await res.text()
    let why = body
    try {
      const said = JSON.parse(body) as { error?: unknown }
      if (typeof said.error === 'string' && said.error !== '') why = said.error
    } catch {
      // Not JSON, so the body itself is the answer.
    }
    return new Error(`liveApp could not ${what} (the office answered ${String(res.status)}): ${why}`)
  }

  const filed = await fetch(`${api}/api/records`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      kind: 'session',
      title: `liveApp — ${name}`,
      data: { state: 'running', runtime: 'vitest', doing: `the browser test ${name}` },
    }),
  })
  if (!filed.ok) throw await theAnswerToAWrite(filed, 'file its session record')
  const { record } = (await filed.json()) as { record: { id: string } }
  const registered = await fetch(`${api}/api/runtime/register`, {
    method: 'POST',
    headers: { ...headers, 'x-mole-office-session': record.id },
    body: JSON.stringify({ detail: `the API a browser test started for ${name}` }),
  })
  if (!registered.ok) throw await theAnswerToAWrite(registered, 'register the API server')

  /**
   * WHATEVER IS SERVING THE PAGE TOO, WITH THE WORLD OF THE API IT CALLS.
   *
   * Act 1 of section 4 asks for both halves registered and both saying the same world, and for a
   * while the browser app was the one thing `liveApp` started and did not write down. The world
   * comes off the header of a reply from this test's own API, because whatever serves a page has
   * no checkout facts of its own to report and what matters about it is which Mole Office the
   * pages it hands out are told to call.
   *
   * WHICH PROCESS IT IS depends on what is serving. A test served the page built once for the run
   * is served it from inside this test worker, so the process holding the web port IS this
   * worker and the row says so. A test that asked for a dev server by name is served by a Vite,
   * and that Vite is the process. Either way it is the process really holding the port, read from
   * the start itself rather than guessed.
   *
   * The plugin in vite.config.ts stands down under a test, so there is one row and not two.
   */
  if (thePagesProcess !== null) {
    const world = (await fetch(`${api}/api/health`, { headers })).headers.get('x-mole-office-world')
    const web = await fetch(`${api}/api/resources`, {
      method: 'POST',
      headers: { ...headers, 'x-mole-office-session': record.id },
      body: JSON.stringify({
        type: 'process',
        key: String(thePagesProcess),
        detail: whatServesThePage,
        ...(world === null ? {} : { world }),
        // The page's process started before this session was filed just above (decision AOwsOHMVq6Ce).
        adopting: 'liveApp files its session after the process serving the page has started',
      }),
    })
    if (!web.ok) throw await theAnswerToAWrite(web, 'register the browser app')
  }

  /**
   * AND THE WORLD THIS TEST'S SERVER SERVES IS NAMED AFTER THE TEST. Criteria C3 and C5.
   *
   * The server registered its own world on the way up and knows it is a test world, because it is
   * running under the test runner — that is criterion C3's *registers as ephemeral*, and the
   * office page hides those by default. What it does not know is WHICH test, so the name it gave
   * itself is the generic one. This says the test's own name, which is what C5 asks for.
   *
   * A WORLD THAT CANNOT BE NAMED FAILS THE TEST TOO. Everything this function writes goes into the
   * test's own ledger, so a write that did not go through is said out loud rather than skipped.
   */
  const listed = await fetch(`${api}/api/office/worlds`, { headers })
  if (!listed.ok) throw await theAnswerToAWrite(listed, 'read the worlds it may name')
  const said = (await listed.json()) as { worlds: { id: string; diedAt: string | null; kind: string }[] }
  const live = said.worlds.find((one) => one.diedAt === null)
  if (live !== undefined) {
    const named = await fetch(`${api}/api/office/worlds/${encodeURIComponent(live.id)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ name: testWorldName(name) }),
    })
    if (!named.ok) throw await theAnswerToAWrite(named, 'name this world after the test')
  }
}

/**
 * A DAY ON WHICH "before Friday" IS STILL A WINDOW AND NOT A DATE.
 *
 * Several tests use the words "before Friday" as an example of something a plan line keeps rather
 * than schedules. That is true on six days out of seven and false on the seventh. "before Friday"
 * is read as a deadline: a window that starts today and ends on the coming Friday. Said on a
 * Wednesday that window is three days long, which is not one day, one week or one month, so no
 * period comes out of it and the words are kept. Said ON a Friday the window is today to today —
 * exactly one day — so it reads as a date and the line is scheduled.
 *
 * The product is right in both cases. The tests were wrong, and they were wrong invisibly: the
 * suite went red for the first time on Friday 21 August 2026, five tests at once, on code nobody
 * had touched. Problem `-p8tUewN3Fb9` in Mole Office records the measurement.
 *
 * So a test whose subject is "words we keep" asks for a day that is not a Friday, and says so.
 * This shifts the server's own day forward by one when it lands on a Friday, which keeps the one
 * clock the scheduling tests insist on and stays inside the same ISO week (Friday to Saturday).
 */
export function aDayThatIsNotFriday(day: Date | null): Date | null {
  if (day === null || day.getDay() !== 5) return day
  const next = new Date(day)
  next.setDate(next.getDate() + 1)
  return next
}

/**
 * ONE BLOCK OF A GIVEN TYPE, BUILT FROM THE EXAMPLES `GET /api/kinds` PUBLISHES FOR IT.
 *
 * IT LIVES HERE BECAUSE TWO TEST FILES NEED IT AND A SECOND COPY WOULD DRIFT. `tests/audience.test.ts`
 * wrote it first; `tests/a-block-addressed-to-the-owner.test.ts` needs the same builder for the same
 * reason, and copying twenty-five lines to get it is the defect at the top of CLAUDE.md — the same
 * fact worked out in two places, with nothing making them agree.
 *
 * WHY IT IS BUILT FROM THE PUBLISHED EXAMPLES AND NOT WRITTEN OUT. A block written out here would
 * be a third opinion about what a block of that type has to carry, and it would go stale the day a
 * required field is added. Building from what the product publishes means a test that fails when
 * the published example stops being a valid block, which is a fault worth hearing about.
 */
export function shapeNameFor(type: string): string {
  const variants = SHAPE_SPECS.SummaryBlock?.discriminator?.variants
  expect(variants, 'SummaryBlock must be served as a discriminated union').toBeDefined()
  const name = variants?.[type]
  expect(name, `SummaryBlock's discriminator must name a shape for "${type}"`).toBeDefined()
  return String(name)
}

/**
 * A FIELD PUBLISHED ON EVERY BLOCK THAT ONLY SOME BLOCKS MAY CARRY, so a block built from every
 * published example is refused for a reason that has nothing to do with what is being tested.
 *
 * `measure` is how wide the writing inside a block reads, and the write door accepts it only on a
 * block that holds writing — so the published example, `narrow`, is a 400 on a metrics block. It
 * is published on every block so that an agent reading `GET /api/kinds` for one block type can
 * learn the key exists.
 *
 * `forOwner` IS NOT IN THIS SET, and that is the difference between the two fields. A block of any
 * type may be addressed to the owner, including a quote, so the published example is valid
 * everywhere and building it in is what `tests/a-block-addressed-to-the-owner.test.ts` reads.
 *
 * `audience` IS NOT IN IT EITHER, on purpose: `tests/audience.test.ts` either writes it explicitly
 * or takes it back out, so leaving it in the built block is what those tests read.
 */
export const PUBLISHED_ON_EVERY_BLOCK_BUT_NOT_VALID_ON_EVERY_BLOCK = new Set(['measure'])

/** One block of the given type, built from the examples the product publishes for it. */
export function exampleBlock(type: string): Record<string, unknown> {
  const shape = SHAPE_SPECS[shapeNameFor(type)]
  expect(shape, `${type} must have a shape`).toBeDefined()
  const out: Record<string, unknown> = {}
  for (const f of (shape?.fields ?? []) as readonly FieldSpec[]) {
    if (PUBLISHED_ON_EVERY_BLOCK_BUT_NOT_VALID_ON_EVERY_BLOCK.has(f.key)) continue
    out[f.key] = f.example
  }
  return out
}

/**
 * THE VERSION ANSWER FOR A PLAN TABLE, OR ONE OF ITS CELLS, THAT A TEST ONLY DRAWS (problem GR4LcaNI-XZk).
 *
 * Every write from the table carries the version its rows were read with, so PlanTable and ItemActs require a way to
 * get one. A test that renders a table to read it makes no write, and says so with this. A write it did make would be
 * refused with this sentence, never sent with no version.
 */
export const THIS_TEST_ONLY_DRAWS_THE_TABLE = async (): Promise<{ ok: false; why: string }> => ({
  ok: false,
  why: 'This test only draws the table, so it writes nothing from it.',
})

/**
 * GO TO AN ADDRESS IN THE APP, AND ANSWER KEEP IF THE PAGE ASKS WHAT TO DO WITH A REVIEW NOT SENT.
 *
 * Shape B asks before a person leaves a page whose collecting review holds comments not sent
 * (`LeaveQuestion` in src/web/components/agent/ReviewBar.tsx). The question puts the address back at once, inside the
 * hash change, so a `page.goto` that only changes the hash stays on the old page and says nothing.
 * A test that wrote a comment with Start review and then goes elsewhere answers Keep, which leaves
 * the review and its comments as they were. Keep is 保留 when the address asks for Chinese.
 *
 * WHEN NO QUESTION IS ASKED, this is a plain `page.goto`. The address is compared after the page
 * has had 100 ms to put it back, so a question that did not come is not waited for.
 */
export async function goKeeping(page: Page, url: string, options: { waitUntil?: 'load' | 'domcontentloaded' } = {}): Promise<void> {
  await page.goto(url, { timeout: 60_000, ...options })
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)))
  const wanted = new URL(url).hash
  if ((await page.evaluate(() => window.location.hash)) === wanted) return
  const question = page.locator('[data-part="leave-question"]')
  await question.waitFor({ timeout: 30_000 })
  const keep = new URL(url).search.includes('lang=zh') ? '保留' : 'Keep'
  await question.getByRole('button', { name: keep, exact: true }).click()
  await question.waitFor({ state: 'detached' })
  await page.waitForFunction((hash) => window.location.hash === hash, wanted, { timeout: 30_000 })
}

/**
 * PRESS THE COMMENT BOX'S WRITING PRESS THAT SENDS NOTHING, whichever of the two it offers.
 *
 * Since wave 13x round 22 (problem 6yMD5gal_oXz, the secretary's y_Vqv-Kab1Ga), while a review collects what the comment is
 * about, the box's first press is Add to review, and Start review is not drawn. Where no review collects, the press is
 * Start review, which starts this page's review. Both write the comment and send nothing. Which one a page offers can
 * depend on what an earlier case started, so a test that only needs the comment kept presses whichever is there. It
 * waits first until the box has read which press comes first (`aria-busy` is gone from the presses), because the
 * presses change when that answer comes.
 */
export async function keepTheCommentInAReview(page: Page): Promise<void> {
  await page.waitForSelector('.px-talk .px-talk-do:not([aria-busy="true"])', { timeout: 15_000 })
  const add = page.locator('.px-talk').getByRole('button', { name: 'Add to review', exact: true })
  await ((await add.count()) > 0 ? add : page.locator('.px-talk').getByRole('button', { name: 'Start review', exact: true })).click()
}
