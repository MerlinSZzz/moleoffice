// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DEV SERVER HAS TO SEE A CHANGE TO A FILE UNDER src/shared.
 *
 * WHAT WENT WRONG. On 2 September 2026 the owner opened http://127.0.0.1:5173 and read "Mole Office
 * did not start". The console named one module: /@fs/.../src/shared/reportrungs.ts does not provide
 * an export named formsWrittenIn. A git merge had changed that file hours after the owner's dev server
 * started. The page file that imports it, src/web/pages/RecordPage.tsx, is inside the Vite root and
 * was refreshed by the same merge; the shared file, which is outside the root, was not. A restart
 * cured it. It happened twice that day. Problem `gdzXYFIK81cf` has the account.
 *
 * WHAT WAS MEASURED ON THE OWNER'S RUNNING SERVER. Vite watches its root, `src/web`, as a directory. It has
 * no directory watch on `src/shared` at all. It reaches a file under src/shared only through
 * `ensureWatchedFile`, which Vite calls after it has read that file off the disk for a transform —
 * one watch per file, added after the fact. Counted from the live server's inotify watches on
 * 2 September 2026: 51 of the 56 files under src/shared were watched, and the five nobody's browser
 * had asked for were not. So the coverage of src/shared was not something the configuration said;
 * it was a side effect of what had been requested.
 *
 * WHY THAT IS THE FAULT AND NOT JUST AN ODDITY. The only thing that adds one of those per-file
 * watches is a transform, and a transform only happens after the module has been invalidated, and
 * an invalidation only happens when the watcher reports a change. So a file that is missing from
 * the watch set stays missing. Nothing heals it, which is why a restart was the only cure.
 *
 * WHAT THIS TEST ASSERTS, AND WHICH CASES FAIL WITHOUT THE FIX. The first case starts the project's
 * real configuration and asks its watcher whether every file now in src/shared and src/config is
 * on its list. With the plugin's folders taken away, 143 of the 144 names in src/shared were not,
 * measured on 29 September 2026, because nothing had asked for them. The second case changes a file and waits for the watcher to report it; it goes red too
 * when the plugin adds no folder. The third is the owner's symptom end to end: replace a file the
 * way git replaces one, then ask for the module again. It passes on the unfixed configuration as
 * well, because there the per-file watch does exist. It is here so that a change to the watching
 * arrangement cannot break the ordinary case unnoticed.
 *
 * NO CASE WRITES INTO src/shared. Until 29 September 2026 the second and third cases wrote a
 * scratch file into the real src/shared. The suite runs several test files at once, and
 * tests/the-machine-word-gate.test.ts, among others, lists every file under src/ and then opens
 * each one. When this file deleted its scratch between those two moments, the gate died on a file
 * that was no longer there (problem F1VMPqnxnhrH). So the two cases that write now write into a
 * folder of this test's own, and hand that folder to the same plugin the configuration uses,
 * `watchTheFoldersOutsideTheRoot` in vite.config.ts. The first case holds the other half: that the
 * real configuration gives that plugin src/shared.
 *
 * IT STARTS VITE IN THIS PROCESS, not through tests/helpers.ts `liveApp`. `liveApp` sets
 * MOLE_OFFICE_NO_WATCH=1 and so starts a Vite with no file watcher at all, which is the right
 * setting for the two hundred tests that only read pages and the wrong one here. Vite's own Node
 * API is also the only way to reach `server.watcher` and ask what it covers.
 */

import { mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer, type ViteDevServer } from 'vite'

import { watchTheFoldersOutsideTheRoot } from '../vite.config.ts'

/** The checkout, resolved from this file rather than from the working directory. */
const REPO = fileURLToPath(new URL('..', import.meta.url))

/** The two folders outside Vite's root that the browser app imports from. */
const OUTSIDE_THE_ROOT = [join(REPO, 'src/shared'), join(REPO, 'src/config')]

let server: ViteDevServer | null = null
/** This test's own folder: Vite's cache, a root, and a folder outside that root. Made per case. */
let own = ''

/**
 * A FOLDER OF THIS TEST'S OWN, AND VITE'S CACHE INSIDE IT.
 *
 * WHY THE CACHE NEEDS ONE. Vite's own default cache directory is inside node_modules, and the
 * worktree recipe in CLAUDE.md symlinks a worktree's node_modules to the main checkout's. Without
 * this, starting a Vite here rewrites the cache the owner's own dev server is reading, and the owner's page
 * reloads for no reason the owner can see. The real configuration reads it from MOLE_OFFICE_VITE_CACHE,
 * through `cacheDirFrom` in vite.config.ts, as `liveApp` in tests/helpers.ts does.
 */
beforeEach(() => {
  own = mkdtempSync(join(tmpdir(), 'mole-office-watch-test-'))
  process.env.MOLE_OFFICE_VITE_CACHE = join(own, 'cache')
})

afterEach(async () => {
  if (server !== null) await server.close()
  server = null
  rmSync(own, { recursive: true, force: true })
  delete process.env.MOLE_OFFICE_VITE_CACHE
})

/**
 * The project's real dev server, with its file watcher on, not listening.
 *
 * It is not started on a port because the first case asks only its watcher. Vite adds the plugins'
 * folders to the watcher when the server is created, and it starts serving and pre-bundling only
 * on `listen()`.
 */
async function theRealConfiguration(): Promise<ViteDevServer> {
  return createServer({
    configFile: join(REPO, 'vite.config.ts'),
    logLevel: 'silent',
  })
}

/**
 * A dev server whose root is a folder of this test's own and which watches `outside`, a folder
 * beside that root, through the plugin the real configuration uses. It listens on a port the
 * operating system picks: the owner's own server holds 5173 and a test may never take a port
 * somebody is using.
 */
async function aServerWatching(outside: string): Promise<ViteDevServer> {
  const root = join(own, 'web')
  mkdirSync(root, { recursive: true })
  const started = await createServer({
    configFile: false,
    root,
    cacheDir: join(own, 'cache'),
    logLevel: 'silent',
    plugins: [watchTheFoldersOutsideTheRoot([outside])],
    // 127.0.0.1 is the address addressOf asks. Vite's own default is localhost, which may name ::1 first,
    // and then nothing listens on 127.0.0.1.
    server: { host: '127.0.0.1', port: 0, strictPort: false, fs: { allow: [own] } },
  })
  await started.listen()
  return started
}

/** A folder beside the root, like src/shared beside src/web, holding one file. */
function aFolderOutsideTheRoot(file: string, content: string): string {
  const outside = join(own, 'shared')
  mkdirSync(outside, { recursive: true })
  writeFileSync(join(outside, file), content)
  return join(outside, file)
}

/** Where that server answers, e.g. http://127.0.0.1:41731 */
function addressOf(started: ViteDevServer): string {
  const address = started.httpServer?.address()
  expect(address, 'the dev server has to be listening for this test to ask it anything').toBeTruthy()
  if (address === null || address === undefined || typeof address === 'string') {
    throw new Error('the dev server reported no port')
  }
  return `http://127.0.0.1:${String(address.port)}`
}

/**
 * REPLACE THE FILE THE WAY GIT REPLACES ONE: write the whole new content, then move it into place.
 * A merge does not edit a file in place, it puts a different file there, and the new file has a
 * different inode. That is the difference that matters to a watcher holding one watch per file.
 */
function replaceLikeGit(path: string, content: string): void {
  const written = `${path}.written-by-git`
  writeFileSync(written, content)
  renameSync(written, path)
}

/** Wait for one event about `path` from the server's watcher, or say that none came. */
function watcherReports(started: ViteDevServer, path: string, within: number): Promise<string | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      started.watcher.off('all', heard)
      resolve(null)
    }, within)
    function heard(event: string, changed: string): void {
      if (changed !== path) return
      clearTimeout(timer)
      started.watcher.off('all', heard)
      resolve(event)
    }
    started.watcher.on('all', heard)
  })
}

/**
 * THE NAMES IN `folder` THAT THE WATCHER HAS NOT LISTED, once it has listed them all or `within`
 * has passed, whichever comes first.
 *
 * WHY IT WAITS. The watcher opens its watches in a first look at each folder it was given, and that
 * first look is still going on when `createServer()` or `listen()` returns. A file replaced before
 * the first look reaches it is found as it already is, and no event is ever sent for it. On a busy
 * machine the first look takes longer, and the event case went red in the merge queue's
 * whole-suite runs of 25 September 2026. Measured the same day: when the change was missed, no
 * event came even 30 seconds later, so it was lost and not late. A merge on the owner's server comes long
 * after that first look has ended, so waiting for it is the situation the owner met, not an
 * easier one.
 *
 * A FILE'S NAME IS IN `getWatched()` FROM THE MOMENT ITS WATCH IS OPEN. The watcher adds the name
 * and opens the watch in the same step (`_watchWithNodeFs` in the watcher Vite carries).
 *
 * IT DOES NOT THROW. On a configuration that does not watch the folder, the names never appear, and
 * the case goes on to fail at the assertion that names the fault.
 */
async function namesNotWatched(started: ViteDevServer, folder: string, names: string[], within: number): Promise<string[]> {
  const deadline = Date.now() + within
  let missing = names
  for (;;) {
    const listed = new Set(started.watcher.getWatched()[folder] ?? [])
    missing = names.filter((name) => !listed.has(name))
    if (missing.length === 0 || Date.now() >= deadline) return missing
    await new Promise((r) => setTimeout(r, 20))
  }
}

/** Ask for a module the way the page asks for one, and hand back what the server served. */
async function moduleText(site: string, path: string): Promise<string> {
  const res = await fetch(`${site}/@fs${path}`)
  expect(res.status, `the dev server should serve ${path}`).toBe(200)
  return res.text()
}

describe('a change to a file under src/shared reaches the page without a restart', () => {
  it('the real configuration watches every file in src/shared and src/config, not only the ones it has served', async () => {
    server = await theRealConfiguration()

    // Nothing has asked this server for a module, so Vite has had no reason to add a watch of its
    // own to any of these files. Whether they are on the list is therefore a question about what the
    // CONFIGURATION watches, which is the whole point: a merge changes files whether or not a browser
    // asked for them first. The folders are only listed here, never written.
    for (const folder of OUTSIDE_THE_ROOT) {
      const names = readdirSync(folder).sort()
      expect(names.length, `${folder} should hold files for this case to ask about`).toBeGreaterThan(0)
      expect(
        await namesNotWatched(server, folder, names, 10_000),
        `these files in ${folder} are not watched after 10 seconds, so a merge that changes one of them ` +
          'invalidates nothing and the page keeps the copy the server already has',
      ).toEqual([])
    }
  }, 60_000)

  it('the watcher reports a file outside the root that is replaced the way git replaces it', async () => {
    const file = aFolderOutsideTheRoot('a-watched-shared-file.ts', 'export const beforeTheMerge = 1\n')
    server = await aServerWatching(dirname(file))

    const missing = await namesNotWatched(server, dirname(file), [basename(file)], 10_000)
    const heard = watcherReports(server, file, 10_000)
    replaceLikeGit(file, 'export const afterTheMerge = 2\n')

    expect(
      await heard,
      'the dev server saw nothing when a file outside its root changed, so nothing will invalidate ' +
        'the module and the page will keep the copy the server already has' +
        (missing.length === 0 ? '' : '. Its watcher had not listed the file among the files it watches after 10 seconds'),
    ).not.toBeNull()
  }, 60_000)

  it('a file outside the root replaced the way git replaces it is served fresh', async () => {
    const file = aFolderOutsideTheRoot('a-watched-shared-file.ts', 'export const beforeTheMerge = 1\n')
    server = await aServerWatching(dirname(file))
    const site = addressOf(server)

    expect(await moduleText(site, file)).toContain('beforeTheMerge')

    replaceLikeGit(file, 'export const afterTheMerge = 2\n')

    // A bounded wait, because a file watcher is not instant and a busy machine is slower than a
    // quiet one. Ten seconds is long enough that a pass means the change arrived and a failure
    // means it never will.
    const deadline = Date.now() + 10_000
    let served = ''
    while (Date.now() < deadline) {
      served = await moduleText(site, file)
      if (served.includes('afterTheMerge')) break
      await new Promise((r) => setTimeout(r, 200))
    }

    expect(
      served,
      'the server kept serving the copy it had before the file was replaced, which is what made ' +
        'the page fail to start: it imported a name the old copy does not export',
    ).toContain('afterTheMerge')
    expect(served).not.toContain('beforeTheMerge')
  }, 60_000)
})
