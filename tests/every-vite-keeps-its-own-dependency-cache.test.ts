// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO VITE STARTED HERE MAY WRITE INTO node_modules/.vite.
 *
 * WHAT WENT WRONG. Vite pre-bundles the project's dependencies and keeps the result in a cache
 * directory. Its default is `node_modules/.vite`, found from the package root. CLAUDE.md's worktree
 * recipe makes a worktree's `node_modules` a symlink to the main checkout's copy, so every checkout
 * on this machine had ONE cache directory. Measured on 2 September 2026:
 * the `node_modules/.vite` of a worktree and the `node_modules/.vite` of the main checkout
 * were the same directory, inode 2136640, and it held three leftover `deps_temp_*` directories from
 * re-optimisations. The person's own dev server on 5173 reads that directory. A Vite whose
 * configuration differs re-bundles it on startup, so their page reloaded for something they had not
 * done. The suite did it fifty-odd times a run, because `liveApp` starts a Vite per browser test
 * file, and the whole thing was invisible: nothing failed and the suite reported green. Problems
 * `7n3NOgXhqux-` and `nGHs0tZ27YKS` have the accounts.
 *
 * WHAT THIS FILE ASSERTS. Three things, and the first two are the two halves of the fix.
 *
 *   1. The cache directory this project's configuration produces, with nothing set, is inside the
 *      checkout and is not under node_modules. Asked of Vite's own `resolveConfig`, which is the
 *      function that works out what a dev server would use.
 *   2. A dev server started the way a worktree's `npm run dev` starts one — Vite's Node API with
 *      this project's config file, which is how tests/the-dev-server-watches-the-shared-folder.test.ts
 *      starts one too — bundles into the directory it was given and leaves node_modules/.vite
 *      exactly as it found it, mtime and listing.
 *   3. A browser test's servers, started through `liveApp`, do the same, into the throwaway
 *      directory `liveApp` deletes when the test stops.
 *
 * WHY THE FIRST ONE ASKS THE CONFIGURATION INSTEAD OF STARTING A SERVER. Starting a Vite with
 * nothing set would write into `.cache/vite` in whichever checkout the suite is running in — and in
 * the main checkout that is the cache the person's own dev server is reading. Rewriting it is the
 * exact act this file exists to prevent, so this test does not commit it to prove it is prevented.
 * The second test then shows that the setting really steers where the bytes land, so the pair says
 * both what the default is and that it is obeyed.
 *
 * WHY NOTHING HERE COMPARES `.cache/vite` BEFORE AND AFTER. Another file in this suite,
 * tests/overlay-host.test.ts, starts a dev stack of its own rather than using `liveApp`, and does
 * not set MOLE_OFFICE_VITE_CACHE, so it bundles into the running checkout's own cache.
 * (tests/seven-surfaces.test.ts did the same until wave 13n round F moved it onto `liveApp`.)
 * It can be doing that while this file runs, and an assertion
 * about that directory would then go red for something this file is not about. Problem
 * `dJ5YEnJo9K_v` has the measurement. The claim is made another way instead: the second test asks
 * the server it started which cache directory it used.
 */

import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer, resolveConfig, type ViteDevServer } from 'vite'
import { liveApp, type LiveApp } from './helpers.ts'

/** The checkout, resolved from this file rather than from the working directory. */
const REPO = fileURLToPath(new URL('..', import.meta.url))

/**
 * THE DIRECTORY NOTHING HERE MAY TOUCH. In a worktree this is a symlink into the main checkout, so
 * it is the person's own cache; in the main checkout it is their cache directly. Either way it is
 * somebody else's, and the assertion is the same one the problem records name: the mtime and the
 * listing do not move.
 */
const NODE_MODULES_CACHE = join(REPO, 'node_modules', '.vite')

/** Where this project's configuration puts the cache when nothing is set. */
const CHECKOUT_CACHE = join(REPO, '.cache', 'vite')

/**
 * How long to wait for a cold bundle before saying none happened. It takes 0.6 seconds in this
 * checkout, so this is generous. The two tests that wait are given a longer timeout than this on
 * purpose: a Vite that bundles somewhere else has to fail saying so, and the default five-second
 * test timeout turned that into `Test timed out in 5000ms`, which names nothing.
 */
const BUNDLE_WITHIN_MS = 30_000

/** Long enough for the wait above, a browser launch and two servers, and no longer. */
const SERVERS_AND_A_BUNDLE_MS = 90_000

let server: ViteDevServer | null = null
let cacheDir = ''

beforeEach(() => {
  cacheDir = mkdtempSync(join(tmpdir(), 'mole-office-cache-proof-'))
  delete process.env.MOLE_OFFICE_VITE_CACHE
})

afterEach(async () => {
  if (server !== null) await server.close()
  server = null
  rmSync(cacheDir, { recursive: true, force: true })
  delete process.env.MOLE_OFFICE_VITE_CACHE
  delete process.env.MOLE_OFFICE_NO_WATCH
})

/**
 * WHAT A DIRECTORY LOOKS LIKE, AS ONE STRING TO COMPARE BEFORE AND AFTER.
 *
 * Its own modification time, then every entry in it with its modification time and size. One level
 * is enough and is the level the fault shows at: the optimiser writes a `deps_temp_<hash>` directory
 * beside `deps` and then moves it over `deps`, so both the directory's own mtime and the listing
 * move when a re-bundle happens. A directory that is not there at all is a state of its own, because
 * "was never created" and "was created and rewritten" are different answers.
 */
function look(dir: string): string {
  if (!existsSync(dir)) return 'not there'
  const lines = [`the directory itself, modified ${String(statSync(dir).mtimeMs)}`]
  for (const name of readdirSync(dir).sort()) {
    const entry = statSync(join(dir, name))
    lines.push(`${name} modified ${String(entry.mtimeMs)} size ${String(entry.size)}`)
  }
  return lines.join('\n')
}

/**
 * Wait for a cold bundle to finish in `dir`, or say that none did. `_metadata.json` is the file the
 * optimiser writes last, so its presence is the bundle being complete rather than under way.
 */
async function bundled(dir: string): Promise<boolean> {
  const deadline = Date.now() + BUNDLE_WITHIN_MS
  while (Date.now() < deadline) {
    if (existsSync(join(dir, 'deps', '_metadata.json'))) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return false
}

describe('every Vite keeps its dependency cache to itself', () => {
  it('this project puts the cache inside the checkout, so a worktree cannot write into the main one', async () => {
    // Nothing set: exactly what `npm run dev` in a fresh worktree gets.
    const resolved = await resolveConfig(
      { configFile: join(REPO, 'vite.config.ts'), logLevel: 'silent' },
      'serve',
    )
    expect(
      resolved.cacheDir,
      'the dependency cache has to sit inside the checkout that owns this config file',
    ).toBe(CHECKOUT_CACHE)
    expect(
      resolved.cacheDir.includes('node_modules'),
      `the cache is at ${resolved.cacheDir}, which is inside node_modules — in a worktree that is a ` +
        `symlink to the main checkout's copy, and the person's own dev server on 5173 reads it`,
    ).toBe(false)
  })

  it('a dev server started from this config bundles where it was told and nowhere else', async () => {
    const beforeNodeModules = look(NODE_MODULES_CACHE)

    process.env.MOLE_OFFICE_VITE_CACHE = cacheDir
    // Port 0, because the person's own server holds 5173 and a test may never take a port somebody
    // is using. No watcher, because this test changes no file and a watching Vite costs one of the
    // 128 inotify instances Linux gives this user — see vitest.config.ts.
    process.env.MOLE_OFFICE_NO_WATCH = '1'
    server = await createServer({
      configFile: join(REPO, 'vite.config.ts'),
      logLevel: 'silent',
      server: { port: 0, strictPort: false },
    })
    await server.listen()

    expect(
      await bundled(cacheDir),
      `no dependency bundle appeared in ${cacheDir} within ${String(BUNDLE_WITHIN_MS)}ms, so this ` +
        `test watched a Vite that never optimised anything and proves nothing`,
    ).toBe(true)

    expect(
      look(NODE_MODULES_CACHE),
      'starting a dev server rewrote node_modules/.vite, which in a worktree is the cache the ' +
        "person's own dev server on 5173 is reading",
    ).toBe(beforeNodeModules)
    // And the setting was what steered it, said by the server about itself rather than worked out
    // from what changed on the disk.
    expect(
      server.config.cacheDir,
      'the dev server used a cache directory other than the one it was given',
    ).toBe(cacheDir)
  }, SERVERS_AND_A_BUNDLE_MS)

  it('a browser test bundles into the directory it throws away afterwards', async () => {
    const beforeNodeModules = look(NODE_MODULES_CACHE)

    const app: LiveApp = await liveApp({
      name: 'own-dependency-cache',
      viewport: { width: 1440, height: 1000 },
      // THE DEV SERVER, because a dependency cache is a thing only a dev server has. Since 23
      // September 2026 a browser test is served a page built once for the run and starts no Vite at
      // all, so the rule this file pins is about the Vite a test asks for by name — which is this
      // one. A test that starts no Vite cannot bundle into the person's cache, which is the fault
      // problem `nGHs0tZ27YKS` was, so the rule holds for every other file by there being nothing.
      theDevServerBecause: 'a dependency cache is something only a dev server has, and this file is about that cache',
    })
    try {
      // Ask for the page, which is what makes the browser pull the pre-bundled dependencies.
      await app.page.goto(app.site)
      const own = join(app.dir, 'vite-cache')
      expect(
        await bundled(own),
        `no dependency bundle appeared in ${own} within ${String(BUNDLE_WITHIN_MS)}ms, so liveApp's ` +
          `Vite bundled somewhere else`,
      ).toBe(true)
      expect(readdirSync(join(own, 'deps')).length).toBeGreaterThan(1)

      expect(
        look(NODE_MODULES_CACHE),
        "a browser test rewrote node_modules/.vite, which in a worktree is the person's own cache",
      ).toBe(beforeNodeModules)

      const dir = app.dir
      await app.stop()
      expect(existsSync(dir), 'liveApp has to remove the directory it bundled into').toBe(false)
    } finally {
      // stop() above is the ordinary path; this catches a failure part of the way through, and
      // stopping an already-stopped app throws rather than hanging, so it is guarded.
      if (existsSync(app.dir)) await app.stop()
    }
  }, SERVERS_AND_A_BUNDLE_MS)
})
