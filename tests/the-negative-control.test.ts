// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION G7: THE NEGATIVE CONTROL.
 *
 * design/ground/ACCEPTANCE.md: *a wrong-world stack (a server on another database, a browser
 * pointed at the wrong API, a stale transform) launched on purpose is detected by G3 and G4 and
 * reported as a mismatch, never as a green health check.*
 *
 * Problem 21 asks for the same under owner acceptance: as a negative control, a wrong-world
 * server and database are launched on purpose, and the diagnostics must detect the mismatch
 * instead of declaring a healthy success.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A NEGATIVE CONTROL IS THE TEST THAT MATTERS HERE
 * ---------------------------------------------------------------------------------------
 *
 * Everything else in this cluster proves that a right answer is given when things are right. That
 * is the easy half, and it is the half a broken check passes as well: a banner that is never drawn
 * passes every test that says the page is quiet. This file drives a REAL second server, on a REAL
 * copy of the database, on another port, and requires the page to notice.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS REAL HERE AND WHAT IS STOOD IN FOR, SAID PLAINLY
 * ---------------------------------------------------------------------------------------
 *
 * REAL: the second server, its database, its port, its world header, and every reply the page reads
 * from it.
 *
 * STOOD IN FOR, in the one case that needs it: WHICH ADDRESS COUNTS AS THE CANONICAL ONE. A page
 * only shouts about a scratch database when it was opened on the address this checkout calls the
 * real one — a scratch stack on its own port is nobody's mistake — and a test's browser app is on
 * a port the operating system handed out a second ago. So in that one case the reply's
 * `addresses.canonicalWeb` is rewritten to this test's own address, which is what a server would
 * report to a page opened on 5173 on the owner's own machine. The mismatch itself is not stood in
 * for; only the question of whether this address is the one somebody meant.
 *
 * `tools/negative-control.mjs` does the same thing on a person's own stack, where nothing has to be
 * stood in for, and prints what the page said.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { spawn, type ChildProcess } from 'node:child_process'
import { copyFileSync, statSync, utimesSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { Page, Route } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WORLD_HEADER, parseWorldHeader } from '../src/config/world-header.mjs'
import { apiServerArguments, type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const repo = fileURLToPath(new URL('..', import.meta.url))
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** A port nobody is on. The same trick tests/helpers.ts uses: bind zero, read it, let it go. */
async function freePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const probe = createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') {
        reject(new Error('the probe socket took no port'))
        return
      }
      const { port } = address
      probe.close(() => {
        resolve(port)
      })
    })
  })
}

describe('a wrong world launched on purpose is caught, not called healthy', () => {
  let app: LiveApp
  let page: Page
  let wrongWorld: ChildProcess | null = null
  let wrongApi = ''
  let wrongDatabase = ''

  beforeAll(async () => {
    app = await liveApp({
      name: 'negative-control',
      viewport: { width: 1440, height: 900 },
      // THE DEV SERVER, because one of the wrong worlds this file builds is a page served an old
      // stamp, and it builds it by rewriting the served-stamp module. Only a dev server serves that
      // module as a file a test can intercept.
      theDevServerBecause:
        'one of the wrong worlds here is an old served stamp, made by rewriting the module a dev server serves',
    })
    page = app.page

    // THE WRONG WORLD: a copy of this test's database, served by a second server on another port.
    // A copy and not a second empty database, because a copy is the case that fools a person —
    // every page of it looks exactly right.
    wrongDatabase = join(app.dir, 'a-copy-of-the-database.db')
    copyFileSync(join(app.dir, 'panelx.db'), wrongDatabase)
    const port = await freePort()
    wrongApi = `http://127.0.0.1:${String(port)}`
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      MOLE_OFFICE_DB: wrongDatabase,
      MOLE_OFFICE_PORT: String(port),
      /**
       * THE SAME BROWSER APP PORT AS THE STACK IT IS STANDING IN FOR, because that is what decides
       * which origins it lets a page read its replies from.
       *
       * In the human act of design/ground/ACCEPTANCE.md section 7 the wrong world is started from
       * the same checkout with one variable changed, so it inherits the same `.env` and allows the
       * same origins as the server it replaces. Here the two ports come from `liveApp`, which picks
       * them, so the wrong world has to be told. Without this it declares whatever the checkout's
       * `.env` says, the page's origin is not on that list, and the browser throws its replies away
       * before the page can see which world sent them — so the banner under test never appears and
       * the failure looks like the check being broken rather than the stand-in being wrong.
       */
      MOLE_OFFICE_WEB_PORT: String(app.webPort),
      // A SCRATCH STACK SERVES NOBODY ELSE. The same declaration every test stack makes; see
      // `addressForOtherMachines` in tests/helpers.ts.
      MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES: 'none',
      LOG_LEVEL: 'warn',
    }
    // The runner's own variables have to go, or the server refuses a database nobody named.
    delete env['VITEST']
    delete env['VITEST_WORKER_ID']
    wrongWorld = spawn(join(repo, 'node_modules/.bin/tsx'), apiServerArguments(), {
      cwd: repo,
      env,
      detached: true,
      stdio: 'ignore',
    })
    wrongWorld.unref()
    for (let tries = 0; tries < 120; tries += 1) {
      try {
        const res = await fetch(`${wrongApi}/api/health`, { headers: { 'x-mole-office-workspace': 'default' } })
        if (res.ok) break
      } catch {
        // not up yet
      }
      await sleep(500)
    }
  }, 240_000)

  afterAll(async () => {
    // BY GROUP, because `tsx` is a supervisor with a child under it and signalling the supervisor
    // alone leaves the server holding the port. Five orphaned-process incidents in this repository.
    if (wrongWorld?.pid !== undefined) {
      try {
        process.kill(-wrongWorld.pid, 'SIGTERM')
      } catch {
        // already gone, which is the state this was trying to reach
      }
    }
    await app?.stop()
  }, 60_000)

  it('the two worlds really are two, and each says so on every reply', async () => {
    const right = await fetch(`${app.api}/api/health`, { headers: { 'x-mole-office-workspace': 'default' } })
    const wrong = await fetch(`${wrongApi}/api/health`, { headers: { 'x-mole-office-workspace': 'default' } })
    expect(right.status, 'the canonical stack answers').toBe(200)
    expect(wrong.status, 'the wrong-world stack answers').toBe(200)

    const a = parseWorldHeader(right.headers.get(WORLD_HEADER))
    const b = parseWorldHeader(wrong.headers.get(WORLD_HEADER))
    if (!a.ok) throw new Error(a.why)
    if (!b.ok) throw new Error(b.why)
    // Both answer 200, and both are healthy, because both are scratch stacks on ports of their own
    // and a throwaway server working properly is not a fault. What tells them apart is the world:
    // on the header, which is criterion G3's argument, AND on the body of the health reply, which
    // is new on 4 September 2026. Until then the header was the only thing, so a page and the
    // session hook were protected and a shell check was not. Problem `ZTDmG8IcF5wY`.
    expect(a.world.database).not.toBe(b.world.database)
    expect(a.world.port).not.toBe(b.world.port)
    expect(a.world.repository).toBe(b.world.repository)

    const rightBody = (await right.json()) as { ok: boolean; world: { database: string | null; standing: { kind: string } } }
    const wrongBody = (await wrong.json()) as { ok: boolean; world: { database: string | null; standing: { kind: string } } }
    expect(rightBody.world.database).not.toBe(wrongBody.world.database)
    expect(rightBody.world.standing.kind).toBe('scratch')
    expect(wrongBody.world.standing.kind).toBe('scratch')
  }, 60_000)

  /**
   * HEALTH IS NEVER GREEN ON A WRONG WORLD, AND THE THREE CASES ARE NOT THE SAME CASE.
   *
   * G7's words are *reported as a mismatch, never as a green health check*. Until 4 September 2026
   * `GET /api/health` answered `{"ok":true}` on a server serving a copy of the database from the
   * real address, and the only thing on the reply that said otherwise was the world header.
   *
   * WHY THE CANONICAL-ADDRESS CASE IS PROVED AGAINST THE FUNCTION AND NOT BY BINDING THE PORT.
   * "The address this checkout calls canonical" is `.env`'s port, and in the live checkout that is
   * the live office's port. A test that bound it would either fail on the person's machine or fight the person's server
   * for the socket, and neither is a thing a test may do. So the rule is exercised with worlds built
   * for it, using the real declared port read from the declaration, and the route is proved to
   * report what the rule says by the stale case below, which goes over real HTTP.
   */
  it('says nothing is wrong with either scratch stack, because a throwaway on its own port is fine', async () => {
    for (const api of [app.api, wrongApi]) {
      const body = (await (await fetch(`${api}/api/health`, { headers: { 'x-mole-office-workspace': 'default' } })).json()) as {
        ok: boolean
        wrong?: string[]
      }
      expect(body.ok, `${api} should be healthy: ${JSON.stringify(body.wrong)}`).toBe(true)
      expect(body.wrong).toBeUndefined()
    }
  }, 60_000)

  it('answers ok false when the world answering on the declared address is not the one declared', async () => {
    const { whatIsWrongWithThisServer } = await import('../src/server/lib/health.ts')
    const { settings, canonicalDatabasePath, REPO_ROOT, ENV_FILE } = await import('../src/config/settings.mjs')
    const declaredPort = settings({}, ENV_FILE).apiPort
    const fresh = { verdict: 'fresh', staleFor: null, grace: 15 } as const

    /** What this checkout declares: its own port, its own database, its own directory. */
    const asDeclared = {
      repository: String(REPO_ROOT).replace(/\/$/, ''),
      database: canonicalDatabasePath(ENV_FILE),
      databaseIdentity: 'ab12cd34ef567890',
      port: declaredPort,
      head: 'abc1234',
      standing: { kind: 'canonical' as const, because: [] },
      readAt: '2026-09-04 00:00:00',
      saidBy: 'a test',
    }

    // A COPY OF THE DATABASE ON THE REAL ADDRESS. Bound the port as well as configured with it,
    // which is what makes somebody able to reach it.
    const otherDatabase = {
      ...asDeclared,
      database: '/tmp/a-copy.db',
      standing: { kind: 'scratch' as const, because: ['its database is /tmp/a-copy.db, and the canonical one is elsewhere'] },
    }
    const wrong = whatIsWrongWithThisServer(otherDatabase, fresh, declaredPort, null)
    expect(wrong.length).toBeGreaterThan(0)
    expect(wrong[0]).toContain(String(declaredPort))
    expect(wrong.join(' ')).toContain('/tmp/a-copy.db')
    // AND IT SAYS WHY, in the same sentences GET /api/runtime gives, rather than a second set.
    expect(wrong.join(' ')).toContain('and the canonical one is elsewhere')

    // ANOTHER CHECKOUT'S SERVER ON THE REAL ADDRESS is the same fault by the other half of the rule.
    const otherCheckout = { ...asDeclared, repository: `${THE_TEST_FIXTURE_ROOT}/px-somewhere` }
    const alsoWrong = whatIsWrongWithThisServer(otherCheckout, fresh, declaredPort, null)
    expect(alsoWrong.length).toBeGreaterThan(0)
    expect(alsoWrong.join(' ')).toContain(`${THE_TEST_FIXTURE_ROOT}/px-somewhere`)

    // The same runtime on a port of its own is a deliberate scratch stack and nothing is wrong.
    const onItsOwnPort = { ...otherDatabase, port: declaredPort + 1 }
    expect(whatIsWrongWithThisServer(onItsOwnPort, fresh, declaredPort + 1, null)).toEqual([])

    // And the world this checkout declares, on the address this checkout declares, is healthy.
    expect(whatIsWrongWithThisServer(asDeclared, fresh, declaredPort, null)).toEqual([])

    // A SERVER THAT BOUND NOTHING IS NOT ANSWERING ON ANY ADDRESS, whatever its settings say. Every
    // `inject` test in this repository is in that state, and reading the configured port instead
    // made all of them answer unhealthy.
    expect(whatIsWrongWithThisServer(otherDatabase, fresh, null, null)).toEqual([])
  })

  /**
   * A WORKTREE'S OWN SERVER, ON THE PORT ITS OWN .env DECLARES, IS HEALTHY.
   *
   * Problem `tBDA20NnDWBx`. The rule used to be "the bound port is the declared one AND the standing
   * is scratch". A worktree declares its own port in its own `.env`, and a worktree is always
   * scratch, so the only server that could ever answer on a worktree's own port was called
   * unhealthy — and every builder and every verifier works in a worktree, because CLAUDE.md says
   * to. `node tools/negative-control.mjs` therefore exited 1 on its own control case wherever it
   * was meant to be run, and a real failure of any of its other four cases arrived inside a run
   * that was already exiting 1.
   *
   * THE LIVE CHECKOUT'S CASE IS PROVED HERE AND NOT BY BINDING ITS PORT. Nothing in this suite may
   * take the live office's port: the live office's server is on it. What the rule is about is a pair of readings and
   * the declaration, so it is asked directly, with the readings written out.
   */
  it('calls a worktree healthy on the port its own declaration names, and the live checkout too', async () => {
    const { whatIsWrongWithThisServer } = await import('../src/server/lib/health.ts')
    const { settings, canonicalDatabasePath, REPO_ROOT, ENV_FILE } = await import('../src/config/settings.mjs')
    const declaredPort = settings({}, ENV_FILE).apiPort
    const fresh = { verdict: 'fresh', staleFor: null, grace: 15 } as const
    const here = String(REPO_ROOT).replace(/\/$/, '')

    // A WORKTREE'S OWN SERVER: this checkout, this checkout's database, this checkout's port. It is
    // scratch, and every reason it is scratch is a reason its own declaration chose.
    const theWorktreesOwn = {
      repository: here,
      database: canonicalDatabasePath(ENV_FILE),
      databaseIdentity: 'ab12cd34ef567890',
      port: declaredPort,
      head: 'abc1234',
      standing: {
        kind: 'scratch' as const,
        because: [`it is running from a git worktree at ${here}, not the main checkout`],
      },
      readAt: '2026-09-04 00:00:00',
      saidBy: 'a test',
    }
    expect(whatIsWrongWithThisServer(theWorktreesOwn, fresh, declaredPort, null)).toEqual([])

    // AND UNDER A TEST RUNNER, which is the other reason a runtime reads as scratch without
    // contradicting anything: a test that binds this checkout's own port on this checkout's own
    // database is answering exactly where its declaration says.
    const underTheRunner = {
      ...theWorktreesOwn,
      standing: { kind: 'scratch' as const, because: ['it was started by a test runner'] },
    }
    expect(whatIsWrongWithThisServer(underTheRunner, fresh, declaredPort, null)).toEqual([])
  })

  it('answers ok false over real HTTP when the server has been serving old code longer than the grace', async () => {
    // A SERVER STARTED WITH NO GRACE AT ALL, so this does not have to wait fifteen seconds, and a
    // file touched under src/ after it loaded. Nothing is edited: `touch` moves a modification time
    // and leaves the bytes alone, which is what the freshness reading is about.
    const port = await freePort()
    const api = `http://127.0.0.1:${String(port)}`
    // A DATABASE OF ITS OWN. The wrong world started above already serves `wrongDatabase`, and since
    // 1 October 2026 a second server on a database another server serves is refused by the service
    // lock (src/config/the-service-lock.mjs). This case is about old code, not about which database.
    const staleDatabase = join(app.dir, 'a-copy-for-the-stale-server.db')
    copyFileSync(join(app.dir, 'panelx.db'), staleDatabase)
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      MOLE_OFFICE_DB: staleDatabase,
      MOLE_OFFICE_PORT: String(port),
      MOLE_OFFICE_STALE_CODE_GRACE: '0',
      LOG_LEVEL: 'warn',
    }
    delete env['VITEST']
    delete env['VITEST_WORKER_ID']
    const old = spawn(join(repo, 'node_modules/.bin/tsx'), apiServerArguments(), {
      cwd: repo,
      env,
      detached: true,
      stdio: 'ignore',
    })
    old.unref()
    try {
      for (let tries = 0; tries < 120; tries += 1) {
        try {
          if ((await fetch(`${api}/api/health`, { headers: { 'x-mole-office-workspace': 'default' } })).ok) break
        } catch {
          // not up yet
        }
        await sleep(500)
      }
      const before = (await (await fetch(`${api}/api/health`, { headers: { 'x-mole-office-workspace': 'default' } })).json()) as {
        ok: boolean
      }
      expect(before.ok, 'it is healthy before anything changes under src/').toBe(true)

      /**
       * A FILE THIS SERVER IS BUILT FROM. Nothing restarts, because this server was started with
       * plain `tsx` and no watcher, so the checkout simply moves ahead of it.
       *
       * IT USED TO TOUCH `src/web/index.html`, and that was this check asserting a defect: a page
       * file is not the server's code, the server cannot pick one up, and judging it against one
       * made a page-only edit report the API as stale for ever. Problem `aI9V57-ZTyv0`. The file
       * has to be one the server really is built from for the reading to mean anything.
       */
      const untouched = join(repo, 'src/server/lib/health.ts')
      const was = statSync(untouched).mtime
      utimesSync(untouched, new Date(), new Date())
      try {
        /**
         * ASKED UNTIL IT SHOUTS, RATHER THAN ONCE AFTER A SLEEP.
         *
         * How long a server has been behind is counted from the moment it was first FOUND behind,
         * which is the first reply after the change — so the first health check is what starts the
         * clock and the one after it is what can exceed the grace. Problem `PxJuVufHG6A2` is why it
         * is counted that way: it used to be counted from the newest file's modification time, so
         * every save restarted it and a server an hour behind reported three seconds.
         */
        let after = { ok: true } as { ok: boolean; wrong?: string[]; code: { verdict: string } }
        for (let tries = 0; tries < 40; tries += 1) {
          after = (await (await fetch(`${api}/api/health`, { headers: { 'x-mole-office-workspace': 'default' } })).json()) as {
            ok: boolean
            wrong?: string[]
            code: { verdict: string }
          }
          if (!after.ok) break
          await sleep(500)
        }
        expect(after.ok).toBe(false)
        expect(after.code.verdict).toBe('stale')
        expect(after.wrong?.join(' ')).toContain('older than the checkout')
      } finally {
        utimesSync(untouched, was, was)
      }
    } finally {
      if (old.pid !== undefined) {
        try {
          process.kill(-old.pid, 'SIGTERM')
        } catch {
          // already gone
        }
      }
    }
  }, 180_000)

  it('draws no banner while the page is talking to the server it opened against', async () => {
    await page.goto(`${app.site}/#/`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await sleep(1500)
    const quiet = await page.evaluate(() => ({
      banner: document.querySelector('.px-ww') !== null,
      blocked: document.querySelector('.px-ww-block') !== null,
    }))
    expect(quiet).toEqual({ banner: false, blocked: false })
  }, 60_000)

  it('names the database when the API is switched under an open page', async () => {
    await page.goto(`${app.site}/#/`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await sleep(1000)
    // THE SWITCH. Every request the page makes from here goes to the other server, which answers it
    // perfectly well, out of a copy of the database, with its own world on the reply.
    // THE STREAM IS REFUSED, IN ALL THREE ROUTES OF THIS FILE, as tools/negative-control.mjs refuses
    // it and for the same reasons (problem ew8aIrRksYaS): `route.fetch` on `GET /api/events` never
    // settles, because the stream never ends. Since problem _PEG8drs25w1 the page's ready mark waits
    // until the stream has opened or failed, so a stream left hanging would hold the mark off for ever.
    await page.route('**/api/**', async (route: Route) => {
      try {
        const request = route.request()
        const moved = new URL(request.url())
        if (moved.pathname.endsWith('/api/events')) {
          await route.abort()
          return
        }
        const response = await route.fetch({ url: `${wrongApi}${moved.pathname}${moved.search}` })
        await route.fulfill({ response })
      } catch {
        // A request can still be in flight when this route is taken off at the end of the test, and
        // Playwright then refuses the fulfil. The page keeps asking while the banner is up — that is
        // how it recovers when the right world comes back — so this is ordinary rather than a fault.
      }
    })
    await page.goto(`${app.site}/#/records`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.waitForSelector('.px-ww', { timeout: 30_000 })
    const said = await page.evaluate(
      () => document.querySelector('.px-ww')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    )
    await page.unroute('**/api/**')

    expect(said).toContain('the database')
    // Both identities, so the reader is not sent to find out which two things differ.
    const right = await fetch(`${app.api}/api/health`, { headers: { 'x-mole-office-workspace': 'default' } })
    const wrong = await fetch(`${wrongApi}/api/health`, { headers: { 'x-mole-office-workspace': 'default' } })
    const a = parseWorldHeader(right.headers.get(WORLD_HEADER))
    const b = parseWorldHeader(wrong.headers.get(WORLD_HEADER))
    if (!a.ok || !b.ok) throw new Error('a world header could not be read')
    expect(said).toContain(a.world.database)
    expect(said).toContain(b.world.database)
  }, 60_000)

  it('names the database when a page opened on the canonical address is answered by a copy', async () => {
    // The page's whole life is against the second server this time, so nothing changes world under
    // it: what is wrong is that a scratch database is answering somebody who went to the real
    // address. The file header says which half of that is stood in for and why.
    await page.route('**/api/**', async (route: Route) => {
      try {
        const request = route.request()
        const moved = new URL(request.url())
        if (moved.pathname.endsWith('/api/events')) {
          await route.abort()
          return
        }
        const response = await route.fetch({ url: `${wrongApi}${moved.pathname}${moved.search}` })
        if (!moved.pathname.endsWith('/api/runtime')) {
          await route.fulfill({ response })
          return
        }
        const body = JSON.parse(await response.text()) as { addresses: { canonicalWeb: string } }
        // THE PAGE'S OWN ORIGIN, NOT THE REQUEST'S. The page calls the API on its own host at the
        // API's port, so a request's origin is the API's and not the page's; before that change the
        // two were the same and `request.url()` stood in for both.
        body.addresses.canonicalWeb = new URL(app.site).origin
        await route.fulfill({ response, body: JSON.stringify(body) })
      } catch {
        // See the note on the route above: an in-flight request when the route is taken off.
      }
    })
    // A LOAD AND NOT A HASH CHANGE. `#/` from `#/records` never leaves the document, so the page
    // would still be holding the world it read in the test above and would report that instead.
    // A different query string is a different address, so the browser really loads the page again.
    await page.goto(`${app.site}/?negative-control=copy#/`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.waitForSelector('.px-ww', { timeout: 30_000 })
    const said = await page.evaluate(
      () => document.querySelector('.px-ww')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    )
    await page.unroute('**/api/**')
    expect(said).toContain('the database behind this page')
    expect(said).toContain(wrongDatabase)
  }, 60_000)

  /**
   * AND THE SAME THING FOR A PAGE THAT CAME IN ON THE ADDRESS FOR OTHER MACHINES. Criterion R4.
   *
   * The address is stood in for the same way the test above stands in for the canonical one: the
   * runtime reply is rewritten so that the address for other machines is the one this page was
   * opened on, and the loopback canonical address is left as something else. So the ONLY reason a
   * banner can appear here is the second address being honoured.
   *
   * WHAT THIS FOUND. Until 4 September 2026 only `canonicalWeb` was compared, and this case drew
   * nothing: a page opened over the tailnet, answered end to end by a copy of the database, said the
   * stack was fine. The negative control's own remote case is what found it, the first time it ran.
   */
  it('names the database for a page opened on the address other machines reach the real one at', async () => {
    await page.route('**/api/**', async (route: Route) => {
      try {
        const request = route.request()
        const moved = new URL(request.url())
        if (moved.pathname.endsWith('/api/events')) {
          await route.abort()
          return
        }
        const response = await route.fetch({ url: `${wrongApi}${moved.pathname}${moved.search}` })
        if (!moved.pathname.endsWith('/api/runtime')) {
          await route.fulfill({ response })
          return
        }
        const body = JSON.parse(await response.text()) as {
          addresses: { canonicalWeb: string; canonicalWebForOtherMachines: string | null }
        }
        // The loopback canonical address is somewhere else entirely, so it cannot be what matches.
        body.addresses.canonicalWeb = 'http://127.0.0.1:1'
        // The page's own origin, for the reason given on the test above.
        body.addresses.canonicalWebForOtherMachines = new URL(app.site).origin
        await route.fulfill({ response, body: JSON.stringify(body) })
      } catch {
        // An in-flight request when the route is taken off. See the note on the route above.
      }
    })
    await page.goto(`${app.site}/?negative-control=copy-for-other-machines#/`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.waitForSelector('.px-ww', { timeout: 30_000 })
    const said = await page.evaluate(
      () => document.querySelector('.px-ww')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    )
    const blocked = await page.evaluate(() => document.querySelector('.px-ww-block') !== null)
    await page.unroute('**/api/**')
    expect(said).toContain('the database behind this page')
    expect(said).toContain(wrongDatabase)
    expect(blocked, 'the page was told it was on the wrong world and left usable').toBe(true)
  }, 60_000)

  it('names the code when the page is served a stamp older than the checkout', async () => {
    // A STALE STAMP, SERVED. The module Vite builds to tell the page how new its code is comes back
    // rewritten to an hour earlier, which is exactly the shape of the fault that threw away two
    // whole gate runs: a browser running a transform of `src/` from hours ago, with nothing on
    // screen to say so.
    // MATCHED BY A PREDICATE AND NOT A PATTERN. Vite serves this module at
    // `/@id/__x00__virtual:mole-office-served`, and a glob with a colon in it does not match it.
    const theStampModule = (url: URL) => url.pathname.includes('virtual:mole-office-served')
    // AN HOUR OLDER THAN THE CHECKOUT, NOT AN HOUR OLDER THAN THE CLOCK. The page calls itself
    // behind when its stamp is older than the newest file it is built from, so a stamp taken from
    // the clock is only stale while somebody has touched `src/web` in the last hour. On a checkout
    // nobody had touched for two hours the case timed out with nothing wrong (problem Cuo49qBFtaN2).
    // The server says which file that is and when it changed; the stamp is an hour before that.
    const freshness = (await (
      await fetch(`${app.api}/api/runtime/freshness`, { headers: { 'x-mole-office-workspace': 'default' } })
    ).json()) as { freshness?: { newestForThePage?: string | null } }
    const newestForThePage = freshness.freshness?.newestForThePage ?? null
    if (newestForThePage === null) {
      throw new Error('the server did not say when the newest file the page is built from changed, so no stamp can be older than it')
    }
    const anHourBeforeTheCheckout = new Date(new Date(newestForThePage.replace(' ', 'T')).getTime() - 60 * 60 * 1000)
    const pad = (n: number) => String(n).padStart(2, '0')
    const stamp =
      `${String(anHourBeforeTheCheckout.getFullYear())}-${pad(anHourBeforeTheCheckout.getMonth() + 1)}-${pad(anHourBeforeTheCheckout.getDate())} ` +
      `${pad(anHourBeforeTheCheckout.getHours())}:${pad(anHourBeforeTheCheckout.getMinutes())}:${pad(anHourBeforeTheCheckout.getSeconds())}`
    await page.route(theStampModule, async (route: Route) => {
      const response = await route.fetch()
      const original = await response.text()
      await route.fulfill({
        response,
        body: original.replace(/export const servedAt = "[^"]*"/, `export const servedAt = ${JSON.stringify(stamp)}`),
      })
    })
    await page.goto(`${app.site}/?negative-control=stamp#/`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    // THE ONE-LINE WARNING, NOT THE BLOCKING BANNER. Both directions of the old-code reading are
    // drawn by `components/BehindTheCheckout.tsx` now, and the page goes on working under them. This
    // test used to wait for `.px-ww`, the blocking banner.
    await page.waitForSelector('.px-btc', { timeout: 30_000 })
    const said = await page.evaluate(() => {
      const line = document.querySelector('.px-btc')
      return {
        text: line?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        red: line?.classList.contains('px-btc-server') ?? false,
        blocked: document.querySelector('.px-ww-block') !== null,
        stamp: window.moleOfficeServedCode?.servedAt ?? null,
      }
    })
    await page.unroute(theStampModule)
    // The page really was served the old stamp, rather than the test asserting against its own idea
    // of what it served.
    expect(said.stamp).toBe(stamp)
    // The one line is the same in both directions, and direction 1 — this page's own old code — is
    // the quiet form a refresh cures, not the office's red one.
    expect(said.text).toContain('This page is behind the checkout; refresh to get the new code.')
    expect(said.red, 'this page being behind is not the office’s fault and is not drawn red').toBe(false)
    expect(said.blocked, 'the page was left unusable under the freshness line').toBe(false)
  }, 60_000)
})
