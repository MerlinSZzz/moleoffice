// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION R2: THE WORLD FACTS AND THE MISMATCH BANNER HOLD OVER THE TAILNET.
 *
 * `design/ground/ACCEPTANCE.md` section 7: *every reply to a remote page carries the world header;
 * the API exposes the headers a page on another origin must read; a remote page in the wrong world
 * draws the same red banner with the same facts, and a remote page in the right world draws
 * nothing.*
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, AND IT WAS QUIETER THAN THE RECORD SAID
 * ---------------------------------------------------------------------------------------
 *
 * Problem `a36N9Ivqf46H`. `@fastify/cors` named no `exposedHeaders`, so a browser hid
 * `x-mole-office-world` from every page on another origin. The record predicted a false red banner:
 * *`src/web/lib/world.ts` treats a reply that has stopped saying which world it came from as a change
 * of world, so such a page would draw the red banner over a stack that is perfectly healthy.*
 *
 * Measured here, the behaviour is the other one and it is worse. `theWorldThatAnswered` returns null
 * for an unreadable header while no world is yet known (`src/web/lib/world.ts`, the `firstWorld ===
 * null` line), and a page whose replies NEVER carry a readable header never learns a first world. So
 * the check does not shout: it never runs, on every reply, for ever, and an absent check looks
 * exactly like a passing one. That is invariant 5 of USER.md — *distinguish nothing is there from
 * nobody has looked* — and it is why the exposure matters rather than being tidiness.
 *
 * ---------------------------------------------------------------------------------------
 * HOW TWO ORIGINS ARE MADE WITHOUT A SECOND MACHINE
 * ---------------------------------------------------------------------------------------
 *
 * One server, told `127.0.0.2` is the address other machines reach this computer at, serving the
 * built app itself. It then answers on two addresses, and a browser calls those two different
 * ORIGINS because the host text differs — which is the whole of what a cross-origin page is, as far
 * as a browser is concerned. So the page is opened on one and fetches the other, and the fetch is
 * subject to exactly the rules a page on the owner's second machine would meet.
 *
 * The one thing this cannot show is a machine that is not this one reaching this one. The human act
 * under R5 is where that is closed.
 */
import { apiServerArguments, storeNormalModeWhereNothingIsStored } from './helpers.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { chromium, type Browser } from 'playwright'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { originsAPageMayBeOn, settingsFrom } from '../src/config/settings.mjs'
import { WORLD_HEADER } from '../src/config/world-header.mjs'
import { HEADERS_A_PAGE_MAY_READ, METHODS_A_PAGE_MAY_USE } from '../src/config/what-a-page-may-read.mjs'
import { THE_BUILT_PAGE, missingWebBuild } from '../src/config/the-built-page.mjs'

const REPO = fileURLToPath(new URL('../', import.meta.url))
const THE_SETTING = 'MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES'
const SECOND_ADDRESS = '127.0.0.2'
// A port this test picks for MOLE_OFFICE_PORT, neither the default nor a live office's: the origins are
// seen to follow the setting.
const AN_API_PORT = '39017'
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms))


describe('the declared origins are the only ones a page may be on', () => {
  it('names both spellings of this computer for both ports, because a browser calls them different', () => {
    const origins = originsAPageMayBeOn(settingsFrom({ MOLE_OFFICE_PORT: AN_API_PORT, MOLE_OFFICE_WEB_PORT: '5173' }))
    expect(origins).toEqual([
      'http://127.0.0.1:5173',
      'http://localhost:5173',
      `http://127.0.0.1:${AN_API_PORT}`,
      `http://localhost:${AN_API_PORT}`,
    ])
  })

  it('adds the two addresses for other machines, and only when one is declared', () => {
    const off = originsAPageMayBeOn(settingsFrom({ MOLE_OFFICE_PORT: AN_API_PORT, MOLE_OFFICE_WEB_PORT: '5173' }))
    expect(off.some((one: string) => one.includes('100.'))).toBe(false)
    const on = originsAPageMayBeOn(
      settingsFrom({ MOLE_OFFICE_PORT: AN_API_PORT, MOLE_OFFICE_WEB_PORT: '5173', [THE_SETTING]: '192.0.2.10' }),
    )
    expect(on).toContain('http://192.0.2.10:5173')
    expect(on).toContain(`http://192.0.2.10:${AN_API_PORT}`)
  })
})


/**
 * AND EVERY METHOD A ROUTE ANSWERS IS ONE A PAGE ON ANOTHER ORIGIN MAY USE.
 *
 * A browser asks before sending anything but a plain GET or POST, and a method the reply does not
 * allow is refused before the request leaves — the page sees a failure with no status and no body,
 * and the server never hears about it.
 *
 * WHAT THIS FOUND. `PUT` was missing from the list while every page call went through a proxy on the
 * page's own origin, where CORS never applies, so nothing failed. The day the page began calling the
 * API's own door, every write through `PUT` was refused by the browser: seventeen tests across five
 * files, all about saving something a person had typed, and not one of them naming CORS.
 *
 * The list cannot be derived from the routes, because the CORS plugin is registered before any route
 * exists. So the two are held together here instead.
 */
describe('every method a route answers is one a page on another origin may use', () => {
  it('allows each of them, and allows nothing the API does not answer', async () => {
    const { freshDb, apiApp } = await import('./helpers.ts')
    const t = await freshDb()
    const built = await apiApp()
    try {
      await built.app.ready()
      const answered = new Set(built.listApiRoutes().map((one) => one.method.toUpperCase()))
      expect(answered.size, 'no routes were registered at all, so this proves nothing').toBeGreaterThan(3)
      const allowed = new Set(METHODS_A_PAGE_MAY_USE)
      for (const method of answered) {
        expect(
          allowed.has(method),
          `a route answers ${method}, which a page on another origin may not send: add it to ` +
            'METHODS_A_PAGE_MAY_USE in src/config/what-a-page-may-read.mjs',
        ).toBe(true)
      }
      // AND NOTHING BEYOND WHAT IS ANSWERED, apart from the two Fastify answers for itself and no
      // route declares: OPTIONS, which is the preflight, and HEAD, which it adds beside every GET.
      // A method allowed that nothing answers at all is a door opened for nobody.
      const answeredByTheFramework = new Set(['OPTIONS', 'HEAD'])
      for (const method of allowed) {
        if (answeredByTheFramework.has(method)) continue
        expect(answered.has(method), `${method} is allowed across origins and no route answers it`).toBe(true)
      }
    } finally {
      await built.app.close()
      t.close()
    }
  })
})

describe('a page on one origin can read the world off an API on another', () => {
  let dir = ''
  let port = 0
  let child: ChildProcess | undefined
  let browser: Browser | undefined
  const here = (): string => `http://127.0.0.1:${String(port)}`
  const there = (): string => `http://${SECOND_ADDRESS}:${String(port)}`

  function freePort(): Promise<number> {
    return new Promise((ok, fail) => {
      const probe = createServer()
      probe.on('error', fail)
      probe.listen(0, '127.0.0.1', () => {
        const at = probe.address()
        if (at === null || typeof at === 'string') {
          probe.close(() => fail(new Error('the probe socket reported no port')))
          return
        }
        const chosen = at.port
        probe.close(() => ok(chosen))
      })
    })
  }

  beforeAll(async () => {
    // NO BUILT PAGE, NO SERVER: in production the server refuses to start without dist/web, so this
    // says so in the server's own sentence before anything is started (problem mKdpnm2WVu5k).
    const missing = missingWebBuild(THE_BUILT_PAGE)
    if (missing !== null) throw new Error(`This file starts the API in production, which serves dist/web. ${missing}`)
    dir = mkdtempSync(join(tmpdir(), 'mole-office-another-origin-'))
    port = await freePort()
    child = spawn(join(REPO, 'node_modules/.bin/tsx'), apiServerArguments(), {
      cwd: REPO,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // Production, so this one process serves the built browser app as well as the API. That is
        // what lets one server be two origins without a second thing to start.
        NODE_ENV: 'production',
        MOLE_OFFICE_PORT: String(port),
        MOLE_OFFICE_DB: join(dir, 'two-origins.db'),
        MOLE_OFFICE_WORKSPACE: 'default',
        [THE_SETTING]: SECOND_ADDRESS,
        LOG_LEVEL: 'warn',
        VITEST: undefined,
        VITEST_WORKER_ID: undefined,
      } as NodeJS.ProcessEnv,
    })
    // What the server prints is kept, so a start that fails says why.
    let said = ''
    const keep = (chunk: unknown): void => {
      said += String(chunk)
    }
    child.stdout?.on('data', keep)
    child.stderr?.on('data', keep)
    let answered = false
    for (let tries = 0; tries < 180 && child.exitCode === null && child.signalCode === null; tries += 1) {
      try {
        if ((await fetch(`${here()}/api/health`, { headers: { 'x-mole-office-workspace': 'default' } })).ok) {
          answered = true
          break
        }
      } catch {
        // not answering yet
      }
      await sleep(500)
    }
    // AND NOTHING GOES ON WITHOUT IT. Every case below talks to this server; without this line each
    // failed with a bare ECONNREFUSED that did not say the server had never started.
    if (!answered) {
      const how = child.exitCode === null && child.signalCode === null
        ? 'It was still running after 90 seconds'
        : `It ended with exit code ${String(child.exitCode)} and signal ${String(child.signalCode)}`
      throw new Error(`The API server this file started never answered ${here()}/api/health. ${how}. It printed:\n${said}`)
    }
    browser = await chromium.launch()
  }, 200_000)

  afterAll(async () => {
    await browser?.close()
    if (child?.pid !== undefined && child.pid !== null) {
      // By the group id written down when it was started. Chapter 2 rule 1 of the office
      // regulations.
      try {
        process.kill(-child.pid, 'SIGTERM')
      } catch {
        // already gone
      }
    }
    rmSync(dir, { recursive: true, force: true })
  })

  it('says which headers a page on another origin may read', async () => {
    const reply = await fetch(`${there()}/api/health`, {
      headers: { 'x-mole-office-workspace': 'default', origin: here() },
    })
    const allowed = (reply.headers.get('access-control-expose-headers') ?? '').toLowerCase()
    for (const name of HEADERS_A_PAGE_MAY_READ) {
      expect(allowed, `${name} is not exposed, so no page on another origin can read it`).toContain(name.toLowerCase())
    }
  })

  /**
   * AND NOT A PAGE SERVED BY SOMETHING ELSE ON THIS MACHINE, since SEC-2.
   *
   * From 4 September 2026 until SEC-2, `aPageOnThisMachine` answered a page on 127.0.0.1 or localhost
   * on any port at all, with leave to send the cookie. It was there so a page that had entered
   * another world could call that world's own port. A cookie goes to every port of its host, so any
   * program on this machine that served a page could then act through the person's browser.
   *
   * Now a page on any other port of this machine is another program's page, and it is refused before
   * any door, with the coded refusal and no leave to read. A visit goes the other way: from this
   * office's page out to the other world, which takes this office's exact origin and nothing else.
   * tests/a-visiting-page-carries-no-half.test.ts holds that.
   */
  it('refuses a page served by anything else on this machine, on a port that is not this office\'s', async () => {
    const head = { 'x-mole-office-workspace': 'default' }
    const others = [29845, 41999].map((one) => (one === port ? one + 1 : one))
    for (const origin of [`http://127.0.0.1:${String(others[0])}`, `http://localhost:${String(others[1])}`]) {
      const answered = await fetch(`${there()}/api/health`, { headers: { ...head, origin } })
      expect(answered.status, `a page on ${origin} was answered`).toBe(403)
      expect(((await answered.json()) as { code?: unknown }).code).toBe('originIsNotThisOffice')
      expect(answered.headers.get('access-control-allow-origin'), `a page on ${origin} could read this reply`).toBe(null)
    }
  })

  it('still refuses an origin that is not a page on this machine', async () => {
    const head = { 'x-mole-office-workspace': 'default' }
    for (const origin of [
      // A name somebody else controls that merely starts the same way.
      'http://127.0.0.1.example.com:8080',
      // A scheme this product never serves a page on.
      'https://localhost:5173',
      // Loopback with no port is not a page this installation serves either.
      'http://127.0.0.1',
    ]) {
      const answered = await fetch(`${there()}/api/health`, { headers: { ...head, origin } })
      expect(answered.headers.get('access-control-allow-origin'), `${origin} was allowed`).toBe(null)
      expect(answered.status, `${origin} was answered`).toBe(403)
      expect(((await answered.json()) as { code?: unknown }).code).toBe('originIsNotThisOffice')
    }
  })

  /**
   * THE LIVE CHANNEL AND AN ORDINARY REPLY GIVE THE SAME ANSWER, FOR THE SAME ORIGIN.
   *
   * `GET /api/events` calls `reply.hijack()`, which takes the reply out of Fastify's hands so that
   * no hook of any kind runs on it — the CORS plugin included — and writes its own headers. Until 4
   * September the two decisions were written twice: the plugin allowed a page anywhere on this
   * machine and the stream allowed only the declared origins. So a page that had walked into
   * another world could read every record and lost its live channel, and nothing on screen said
   * why. Problem `PjlpSf-hizZA`. They are one function now, and this holds them together.
   *
   * Since SEC-2 the origins are this office's own only: the page on either address, and loopback by name.
   */
  it('gives a page on one of this office\'s own origins the same answer on the live channel as on any other reply', async () => {
    const head = { 'x-mole-office-workspace': 'default' }
    for (const origin of [here(), `http://localhost:${String(port)}`, there()]) {
      const ordinary = await fetch(`${there()}/api/health`, { headers: { ...head, origin } })
      // The stream is held open, so it is opened and dropped the moment the headers are in.
      const stop = new AbortController()
      const stream = await fetch(`${there()}/api/events`, { headers: { ...head, origin }, signal: stop.signal })
      const said = stream.headers.get('access-control-allow-origin')
      stop.abort()
      expect(said, `the live channel refused ${origin} while every other reply allowed it`).toBe(
        ordinary.headers.get('access-control-allow-origin'),
      )
      expect(said).toBe(origin)
      expect(stream.headers.get('access-control-expose-headers')).toBe(
        ordinary.headers.get('access-control-expose-headers'),
      )
    }
  })

  it('refuses an origin on the live channel exactly as it refuses it anywhere else', async () => {
    const head = { 'x-mole-office-workspace': 'default' }
    const stop = new AbortController()
    const stream = await fetch(`${there()}/api/events`, {
      headers: { ...head, origin: 'https://evil.example.com' },
      signal: stop.signal,
    })
    const said = stream.headers.get('access-control-allow-origin')
    const status = stream.status
    stop.abort()
    expect(said).toBeNull()
    expect(status, 'the live channel was opened for a page on another site').toBe(403)
  })

  it('allows a declared origin and refuses one nobody declared', async () => {
    const head = { 'x-mole-office-workspace': 'default' }
    const declared = await fetch(`${there()}/api/health`, { headers: { ...head, origin: here() } })
    expect(declared.headers.get('access-control-allow-origin')).toBe(here())

    const nobody = await fetch(`${there()}/api/health`, { headers: { ...head, origin: 'http://somewhere.example' } })
    expect(
      nobody.headers.get('access-control-allow-origin'),
      'an origin nobody declared was allowed, which is the "reflect anything" this replaced',
    ).toBe(null)
    // AND THE REQUEST ITSELF IS REFUSED, since SEC-2. Until then it was answered, because CORS only
    // keeps a reply from the page. But a page on another site may send a plain POST with no
    // preflight, and the office then did it before the browser hid the answer. A caller that sends no
    // Origin, such as curl or an agent, is not a page and goes on as before.
    expect(nobody.status).toBe(403)
    expect(((await nobody.json()) as { code?: unknown }).code).toBe('originIsNotThisOffice')
  })

  it('lets a real browser on one address read the world off the other', async () => {
    const context = await browser!.newContext()
    await storeNormalModeWhereNothingIsStored(context)
    const tab = await context.newPage()
    await tab.goto(`${there()}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    // The page is on the address for other machines; the fetch goes to 127.0.0.1, which the browser
    // treats as another origin. This is the measurement problem a36N9Ivqf46H is about.
    const read = await tab.evaluate(
      async ([at, header]) => {
        const res = await fetch(`${String(at)}/api/health`, { headers: { 'x-mole-office-workspace': 'default' } })
        return { ok: res.ok, world: res.headers.get(String(header)) }
      },
      [here(), WORLD_HEADER],
    )
    expect(read.ok).toBe(true)
    expect(read.world, 'the browser could not read the world header across origins').toBeTruthy()
    expect(read.world).toContain('db=')
    expect(read.world).toContain('standing=')
    await tab.context().close()
  })

  it('draws nothing on a page served on the address for other machines, because that world is right', async () => {
    const context = await browser!.newContext()
    await storeNormalModeWhereNothingIsStored(context)
    const tab = await context.newPage()
    await tab.goto(`${there()}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await tab.waitForTimeout(6000)
    expect(await tab.locator('.px-ww').count(), 'a healthy remote page drew the red banner').toBe(0)
    expect(await tab.locator('.px-ww-block').count(), 'a healthy remote page was blocked').toBe(0)
    await tab.context().close()
  })
})
