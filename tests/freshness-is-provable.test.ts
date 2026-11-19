// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * FRESHNESS IS PROVABLE — criterion G6 of design/ground/ACCEPTANCE.md.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * From section 2 of the acceptance document:
 *
 * - **Two whole gate runs were invalidated** by a browser serving a seven-hour-old transform of
 *   `src/shared`, and nothing said the code was old.
 * - **A live API served stale code through an entire gate**, reloading only by accident.
 * - **Freshness was never provable** from a process start time; every round proved it functionally,
 *   which means somebody clicked something and formed an opinion about what they saw.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE, AND WHAT IS PROVED ELSEWHERE
 * ---------------------------------------------------------------------------------------
 *
 * Here: a real `tsx watch` picks up a change under `src/shared` and under `src/server` without
 * anybody restarting it, and the runtime record shows the restart — a new process id, a later start
 * time, and a freshness verdict that has gone back to fresh. That is the whole claim, end to end,
 * with a real server and a real edit.
 *
 * Elsewhere: `tests/the-dev-server-watches-the-shared-folder.test.ts` proves the same thing for the
 * BROWSER half, which is Vite's watcher rather than tsx's, and it was written on 2 September when
 * the owner's own page failed to start twice. The arithmetic of the verdict is in
 * `tests/the-product-knows-its-own-runtime.test.ts`, where it needs no server at all.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT CHANGES A FILE IN A COPY OF THE CHECKOUT, AND NEVER IN THE CHECKOUT ITSELF
 * ---------------------------------------------------------------------------------------
 *
 * What was broken is this project's watching: which folders `tsx watch` and `vite.config.ts` cover.
 * So the copy is this checkout's own files, copied when the file starts: its `src`, its
 * `vite.config.ts` and what the two need to start. A tree written by hand would prove only that a
 * watcher works; a copy of the checkout runs the same configuration on the same code.
 *
 * IT USED TO MOVE THE TIME OF src/shared/time.ts IN THE CHECKOUT, and that broke other tests. The
 * browser tests are served one page, built from the checkout into dist/web-for-tests. Moving the
 * time of a file the page is built from made the next browser test in any worker build the page
 * again. The build gives the main script a new name, so a browser test already running asked for a
 * script that was gone, and its app never started. Measured on 25 September 2026: two browser files
 * failed that way beside this one in a load of 376 files, and none failed with this file left out
 * (problems nYa2PbaJXh39 and IUbUVQOyip4k). So nothing here changes a file other tests read.
 *
 * No content is written, only a modification time, because that is what a watcher reads.
 */

import { apiServerArguments, commandThatStopsWithItsOwner } from './helpers.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { cpSync, readFileSync, rmSync, symlinkSync, utimesSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { RuntimeRecord } from '../src/shared/runtime.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

/** The checkout. This file only reads it. */
const REPO = fileURLToPath(new URL('..', import.meta.url))

/** The copy of the checkout every change in this file is made in. `beforeAll` makes it. */
let copy = ''

/**
 * The two files the watcher must cover, one on each side of the boundary that was broken.
 *
 * THE SHARED ONE IS LOADED BY THE PAGE AND BY THE SERVER, AND NOT BY vite.config.ts. Vite restarts
 * its whole server when a file its configuration imports changes, and a request made during that
 * restart fails with "The server is being restarted or closed". vite.config.ts imports one file
 * under src/shared, src/shared/time.ts, which this file used to move. Measured on 25 September
 * 2026: every move of time.ts restarted Vite within 10 ms, and the stamp case below failed in 1 of
 * 10 runs on the checkout and 5 of 10 on the copy. A file the configuration does not import is also
 * what the stamp case's title says: the stamp moves without the configuration being reloaded.
 */
const SHARED_FILE = 'src/shared/addresses.ts'
const watched = (): { shared: string; server: string } => ({
  shared: join(copy, SHARED_FILE),
  server: join(copy, 'src/server/lib/runtime.ts'),
})

let child: ChildProcess | null = null
let api = ''
let dir = ''

/** A port the operating system picks and nothing else is holding. */
async function freePort(): Promise<number> {
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

/** Ask the server what it is, or null while it is not answering yet. */
async function runtime(): Promise<RuntimeRecord | null> {
  try {
    const res = await fetch(`${api}/api/runtime`)
    if (!res.ok) return null
    return (await res.json()) as RuntimeRecord
  } catch {
    return null
  }
}

/** Wait until `test` is happy with the runtime record, or give up and say so. */
async function until(
  test: (r: RuntimeRecord) => boolean,
  what: string,
  within = 60_000,
): Promise<RuntimeRecord> {
  const stop = Date.now() + within
  let last: RuntimeRecord | null = null
  while (Date.now() < stop) {
    last = await runtime()
    if (last !== null && test(last)) return last
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(
    `${what} did not happen within ${String(within / 1000)}s. ` +
      `The last thing the server said was ${last === null ? 'nothing at all' : `pid ${String(last.process.pid)}, ${last.freshness.verdict}`}.`,
  )
}

/**
 * MOVE A FILE'S TIME ONCE A SECOND UNTIL THE SERVER BEGINS TO RESTART, FOR AT MOST A MINUTE.
 *
 * `tsx watch` starts watching a file only after the server reports it loaded it, one file at a
 * time. So for a few seconds after the server first answers, a file may not be watched yet, and a
 * change made then is never seen. Measured on 25 September 2026 on the copy: one move made as soon
 * as the server answered was missed in 9 of 20 runs, and none of 10 was missed when the move came
 * 5 seconds later. A person's change comes long after the start, so each move here is a real change,
 * and the first restart is the proof. A watcher that never covers the file still fails, after a
 * minute of moves.
 */
async function moveUntilItRestarts(
  path: string,
  before: RuntimeRecord,
  what: string,
): Promise<RuntimeRecord> {
  const stop = Date.now() + 60_000
  let last: RuntimeRecord | null = null
  let moves = 0
  while (Date.now() < stop) {
    const now = new Date()
    utimesSync(path, now, now)
    moves += 1
    const next = Date.now() + 1_000
    while (Date.now() < next) {
      last = await runtime()
      if (last !== null && last.process.pid !== before.process.pid) return last
      // NOT ANSWERING MEANS THE RESTART HAS BEGUN. No more moves, because each one would start
      // the restart again before the server is back up. What is left of the minute is spent
      // waiting for the new process.
      if (last === null) return until((one) => one.process.pid !== before.process.pid, what, stop - Date.now())
      await new Promise((r) => setTimeout(r, 250))
    }
  }
  throw new Error(
    `${what} did not happen within 60s, after ${String(moves)} changes to the file. ` +
      `The last thing the server said was ${last === null ? 'nothing at all' : `pid ${String(last.process.pid)}, ${last.freshness.verdict}`}.`,
  )
}

beforeAll(async () => {
  dir = aTestDatabaseFolder('freshness')
  // What the server and Vite need to start, and nothing else. node_modules is linked rather than
  // copied, as tests/the-server-is-judged-on-the-code-it-is-built-from.test.ts does: it is the
  // same tree either way. src/config holds roles.json (copied with src), which the server will not start
  // without; vite.config.ts and public are what the Vite cases below load, and vite.config.ts imports
  // for-agents/a-full-list-read.mjs.
  copy = join(dir, 'checkout')
  const parts = ['src', 'drizzle', 'package.json', 'tsconfig.json', 'vite.config.ts', 'public', 'tools/check-worktrees.mjs', 'tools/live-processes.mjs', 'for-agents/a-full-list-read.mjs']
  for (const part of parts) {
    cpSync(join(REPO, part), join(copy, part), { recursive: true })
  }
  symlinkSync(join(REPO, 'node_modules'), join(copy, 'node_modules'))
  const port = await freePort()
  api = `http://127.0.0.1:${String(port)}`
  // Its own process GROUP, so stopping it stops the whole of it. tsx watch is a supervisor and a
  // child; signalling the leader alone leaves the child holding the port, which is five of this
  // project's orphaned-process incidents.
  const watched = commandThatStopsWithItsOwner(join(REPO, 'node_modules', '.bin', 'tsx'), apiServerArguments(['watch']))
  child = spawn(watched.command, watched.args, {
    cwd: copy,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      MOLE_OFFICE_PORT: String(port),
      MOLE_OFFICE_DB: join(dir, 'panelx.db'),
      MOLE_OFFICE_VITE_CACHE: join(dir, 'vite-cache'),
      LOG_LEVEL: 'warn',
      // Not under a test runner as far as the child is concerned: it is a real server, and these
      // would make src/server/db/client.ts refuse a database nobody named.
      VITEST: undefined,
      VITEST_WORKER_ID: undefined,
    } as NodeJS.ProcessEnv,
  })
  await until(() => true, 'the watched server started answering')
}, 120_000)

afterAll(async () => {
  // Nothing in the checkout was changed, so nothing is put back. The copy goes with `dir` below.
  if (child?.pid !== undefined && child.pid !== null) {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // Already gone.
    }
  }
  await new Promise((r) => setTimeout(r, 500))
  rmSync(dir, { recursive: true, force: true })
})

describe('a running server says how old its code is, and a change reaches it without a restart', () => {
  it('starts fresh, and says so with both times and the file that carries the newer one', async () => {
    const r = await until((one) => one.freshness.verdict !== 'unknown', 'the server worked out its freshness')
    expect(r.freshness.verdict).toBe('as new as the checkout')
    expect(r.freshness.newestLoaded).toMatch(/^\d{4}-\d{2}-\d{2} /)
    expect(r.freshness.newestOnDisk).toBe(r.freshness.newestLoaded)
    expect(r.freshness.newestOnDiskFile).toMatch(/^src\//)
    expect(r.freshness.staleSince).toBeNull()
    expect(r.process.startedAt, 'a server that cannot say when it started cannot prove a restart').not.toBeNull()
  })

  it('restarts on a change under src/shared, and the runtime record shows it', async () => {
    // THE CASE THAT WAS BROKEN. src/shared is outside Vite's root and outside the server's own
    // directory; on 2 September a git merge changed src/shared/reportrungs.ts twice and the
    // running server never noticed.
    const before = await until(() => true, 'the server answered before the change')
    const after = await moveUntilItRestarts(
      watched().shared,
      before,
      'the server restarted after src/shared changed',
    )
    expect(after.process.pid).not.toBe(before.process.pid)
    // A LATER START TIME, not just a different pid: the record has to show WHEN it reloaded.
    expect(after.process.startedAt).not.toBeNull()
    expect(String(after.process.startedAt) >= String(before.process.startedAt)).toBe(true)
    // And it is serving the change, rather than merely having restarted.
    const settled = await until(
      (one) => one.freshness.verdict === 'as new as the checkout',
      'the restarted server reported itself as new as the checkout',
    )
    expect(settled.freshness.verdict).toBe('as new as the checkout')
  }, 120_000)

  it('restarts on a change under src/server too', async () => {
    const before = await until(() => true, 'the server answered before the second change')
    const after = await moveUntilItRestarts(
      watched().server,
      before,
      'the server restarted after src/server changed',
    )
    expect(after.process.pid).not.toBe(before.process.pid)
  }, 120_000)

  it('answers the same freshness on its own route, which is what the tools ask', async () => {
    const res = await fetch(`${api}/api/runtime/freshness`)
    expect(res.status).toBe(200)
    const reply = (await res.json()) as {
      freshness: RuntimeRecord['freshness']
      world: { repository: string; database: string; port: number | null; standing: { kind: string } }
      startedAt: string | null
    }
    const record = await until(() => true, 'the server answered its full record')
    expect(reply.freshness.verdict).toBe(record.freshness.verdict)
    // The refusal a tool prints names the world it is refusing, not only that it said no.
    expect(reply.world.database).toBe(record.database.path)
    expect(reply.world.repository).toBe(record.repository.path)
    expect(reply.world.standing.kind).toBe('scratch')
    expect(reply.startedAt).toBe(record.process.startedAt)
  })

  it('calls itself scratch, because it is on a temporary database', async () => {
    const r = await until(() => true, 'the server answered')
    expect(r.standing.kind).toBe('scratch')
    expect(r.standing.because.join(' ')).toContain(r.database.path)
    expect(r.process.underTestRunner).toBe(false)
  })
})

/**
 * THE BROWSER HALF: Vite stamps the app with the newest source it served.
 *
 * The server can read its own disk; a page cannot. So `vite.config.ts` serves a module with the
 * answer in it, and `src/web/lib/served.ts` puts it where a reader can find it. This starts the
 * project's real Vite — the same configuration `npm run dev` uses — and asks for that module the
 * way the page asks for one.
 *
 * The walk behind the number is `src/config/newest-source.mjs`, the same one the API reports from.
 * Two walks would be two answers and the comparison between the two programs is the whole point.
 */
/**
 * NO DEPENDENCY SCAN IN THE TWO VITES BELOW, so nothing is written into their cache after close.
 *
 * Both cases only ask for the stamp module, which needs no bundled dependency. With bundling on,
 * Vite scans for dependencies as the server starts, and when the scan ends its code starts a
 * bundling run without asking whether the server has closed. `close()` in Vite 8 takes its note of
 * the bundling run when it is called, while there is none yet, so it neither cancels that run nor
 * waits for it. The run then writes `deps_temp_<hash>` into the cache folder after the case has
 * removed it. Each run of this file left one `mole-office-served-` and one
 * `mole-office-stamp-moves-` folder behind that way, measured on 29 September 2026 (problem
 * ToxCUBqVhdPI).
 *
 * With `noDiscovery`, Vite makes no scan. It bundles only the dependencies the configuration names
 * (the React plugin in vite.config.ts names four), and `createServer` does not return until that
 * bundling has finished. So nothing is still writing when `close()` is called. `include` adds
 * nothing of this file's own.
 */
const NO_DEPENDENCY_SCAN = { noDiscovery: true, include: [] }

describe('the browser app is served a stamp saying how new its code is', () => {
  it('serves a module with the newest source in it, and the same walk the server uses', async () => {
    const { createServer } = await import('vite')
    const cache = aTestDatabaseFolder('served')
    // Port 0 and a cache of its own: the owner's own dev server holds the configured port and reads
    // the configured cache, and a test may take neither.
    process.env.MOLE_OFFICE_VITE_CACHE = cache
    const vite = await createServer({
      configFile: join(copy, 'vite.config.ts'),
      logLevel: 'silent',
      server: { port: 0, strictPort: false, middlewareMode: true },
      optimizeDeps: NO_DEPENDENCY_SCAN,
    })
    try {
      const served = await vite.transformRequest('virtual:mole-office-served')
      expect(served, 'Vite served nothing for the stamp module').not.toBeNull()
      const code = served?.code ?? ''
      expect(code).toContain('servedAt')
      expect(code).toContain('newestSourceFile')
      expect(code).toContain('fromABuild')

      /**
       * The number is the copy's, not an invention: the same walk, asked here of the copy — and
       * over the FILES THE PAGE IS BUILT FROM rather than the whole of `src/` or a list of folders.
       * A change under `src/server` does not make the page's code old, and measuring it against
       * everything put a red sheet over the owner's live page after a server-only merge, problem
       * `2hadqssN_rc4`; measuring the SERVER against a folder did the same for seven files under
       * `src/shared` that only the page imports, problem `TMy3C0ydoYYR`.
       */
      const { THE_PAGES_ENTRY, newestSourceBuiltFrom } = await import('../src/config/newest-source.mjs')
      const { localStamp } = await import('../src/shared/time.ts')
      const newest = newestSourceBuiltFrom(THE_PAGES_ENTRY, copy)
      expect(newest, 'the page is built from no files at all, which cannot be').not.toBeNull()
      expect(code).toContain(JSON.stringify(localStamp(newest?.at ?? new Date())))
      expect(code).toContain(JSON.stringify(newest?.file))
      expect(code).toContain('export const fromABuild = false')
      // And the file it names is one the page really imports, never one of src/server's.
      expect(newest?.file).toMatch(/^src\/(web|shared|config)\//)
    } finally {
      await vite.close()
      rmSync(cache, { recursive: true, force: true })
      delete process.env.MOLE_OFFICE_VITE_CACHE
    }
  }, 60_000)

  /**
   * AND THE STAMP IS THROWN AWAY WHEN THE PAGE'S CODE CHANGES.
   *
   * Problem `2hadqssN_rc4`. Vite caches what a virtual module's `load` hook returns until the module
   * is invalidated, and nothing invalidated this one — so the stamp was whatever the newest file had
   * been when Vite last loaded its configuration, and every later save left it behind. On the
   * owner's live stack on 4 September 2026 a page opened a minute after a merge said *THIS PAGE
   * served as it was at 2026-09-04 01:19:07, which is 36 seconds behind* and the red sheet blocked
   * it. The page's modules were fresh; only the stamp was old.
   *
   * The time is moved in the copy of the checkout, as everywhere in this file; the top of the file
   * says why never in the checkout itself.
   */
  it('serves a new stamp after a file under src/shared changes, without reloading its configuration', async () => {
    const { createServer } = await import('vite')
    const cache = aTestDatabaseFolder('stamp-moves')
    process.env.MOLE_OFFICE_VITE_CACHE = cache
    const vite = await createServer({
      configFile: join(copy, 'vite.config.ts'),
      logLevel: 'silent',
      server: { port: 0, strictPort: false, middlewareMode: true },
      optimizeDeps: NO_DEPENDENCY_SCAN,
    })
    try {
      const before = (await vite.transformRequest('virtual:mole-office-served'))?.code ?? ''
      expect(before).toContain('servedAt')

      /**
       * WHAT IS WATCHED IS THE CACHE, NOT THE ANSWER TO `transformRequest`.
       *
       * A browser asks for this module by its URL and is served whatever Vite has cached for it,
       * which is `transformResult` on the module graph. `transformRequest` called from a test runs
       * the load hook again whether or not the cache is there, so it cannot tell a stale cache from
       * a fresh one — measured here on 4 September 2026 with the invalidation removed: the code
       * came back changed and the browser would still have had the old stamp.
       */
      const held = vite.moduleGraph.getModuleById('\0virtual:mole-office-served')
      expect(held, 'the stamp module is not in the module graph after being asked for').toBeDefined()
      expect(held?.transformResult, 'the stamp was not cached, so there is nothing to invalidate').not.toBeNull()

      // A SAVE UNDER src/shared, which is one of the folders the page is built from.
      const now = new Date()
      utimesSync(watched().shared, now, now)

      // The watcher takes a moment. What is being waited for is the cached stamp being thrown away.
      const stop = Date.now() + 20_000
      while (Date.now() < stop && held?.transformResult != null) {
        await new Promise((r) => setTimeout(r, 200))
      }
      expect(
        held?.transformResult,
        'the cached stamp was still there after a file under src/shared changed, so a page would be served the old one',
      ).toBeNull()

      // AND WHAT IS SERVED NEXT IS THE NEW TIME, not merely something different.
      const after = (await vite.transformRequest('virtual:mole-office-served'))?.code ?? ''
      const { localStamp } = await import('../src/shared/time.ts')
      expect(after).toContain(JSON.stringify(localStamp(now)))
      expect(after).toContain(JSON.stringify(SHARED_FILE))
    } finally {
      await vite.close()
      rmSync(cache, { recursive: true, force: true })
      delete process.env.MOLE_OFFICE_VITE_CACHE
    }
  }, 90_000)

  it('lets an open page take the new stamp, rather than only a page opened afterwards', () => {
    // Read as source: what can go wrong cheaply is the acceptance being written and never wired up,
    // and driving hot module replacement in a real browser to prove one assignment would be a test
    // of Vite. `import.meta.hot.accept` is written out in full because that is what Vite's own
    // analysis looks for; a call through a variable is not registered and the update becomes a
    // whole-page reload.
    const served = readFileSync(join(REPO, 'src/web/lib/served.ts'), 'utf8')
    expect(served).toContain("import.meta.hot.accept('virtual:mole-office-served'")
    expect(served).toContain('window.moleOfficeServedCode = {')
  })
})

/**
 * THE INSTRUMENTS REFUSE TO MEASURE A STALE WORLD.
 *
 * A sweep of a stale world is worse than no sweep: it produces numbers, the numbers look like
 * measurements, and they are measurements of code nobody has any more. Two whole gate runs were
 * invalidated by exactly that.
 */
describe('the measuring tools stop before they measure a stale world', () => {
  it('refuses on stale, refuses on unknown, and only lets fresh through', async () => {
    const { whyNotToMeasure } = await import('../tools/freshness.mjs')
    expect(
      whyNotToMeasure({
        freshness: { verdict: 'as new as the checkout', says: 'fine' },
        couldNotRead: [],
        world: { repository: '/x', standing: { kind: 'canonical' } },
        startedAt: '2026-09-03 10:00:00',
      }),
    ).toBeNull()

    const stale = whyNotToMeasure({
      freshness: { verdict: 'older than the checkout', says: 'it loaded src/ as it was at 09:00' },
      couldNotRead: [],
      world: { repository: '/x', standing: { kind: 'canonical' } },
      startedAt: '2026-09-03 10:00:00',
    })
    expect(stale).toContain('serving older code')
    expect(stale).toContain('it loaded src/ as it was at 09:00')

    // UNKNOWN IS NOT FRESH, which is the whole of invariant 5 of USER.md applied here.
    const unknown = whyNotToMeasure({
      freshness: { verdict: 'unknown', says: 'could not tell' },
      couldNotRead: [{ what: 'the newest source on disk', why: 'src/ could not be walked' }],
      world: { repository: '/x', standing: { kind: 'canonical' } },
      startedAt: null,
    })
    expect(unknown).toContain('unknown is not fresh')
    expect(unknown).toContain('src/ could not be walked')
  })
})
