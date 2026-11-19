// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BROWSER APP FILES ITS ROW WHERE ITS PAGES CALL, AND ONLY FROM AN OFFICE OF ITS OWN.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `1p-pQxYe0RLB`. The Vite config worked out the API address twice: the page was told
 * `MOLE_OFFICE_PORT`, and the registering plugin took `apiAddressForThisProcess`, which prefers a
 * `MOLE_OFFICE_API` set anywhere it can see. A world that named only `MOLE_OFFICE_API` therefore had
 * the plugin writing into that world while the pages called the operator's office. Worse, a worktree
 * or a check worktree has no `.env` of its own, so `findEnvFile` reads the main checkout's — and the
 * plugin filed an "The browser app" row under the worktree's checkout into the OPERATOR's database,
 * where no later start of that checkout ever comes to close it. Seventeen such rows said running.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE DRIVES, AND WHY BOTH SIDES ARE THE REAL PRODUCT
 * ---------------------------------------------------------------------------------------
 *
 * The real plugin, out of the real `vite.config.ts`, started the way `npm run dev` starts it. Two
 * throwaway databases and the real Fastify app `apiApp()` builds stand behind two addresses, so a
 * row that reaches the wrong one is a row in the wrong database. The socket is the only thing this
 * file invents: `fetch` is routed to the app whose port the URL names.
 *
 * The three cases:
 *
 * 1. The plugin is told API at A while `MOLE_OFFICE_PORT` says B. The port the config tells the PAGE
 *    must be A's, and the row must land in A's database and nowhere in B's. Before the fix the page
 *    followed the port and the plugin followed the address, so the page assertion went red. Since round 50 the row
 *    also carries the receipt in words that every part of the office gets, from theOwnPartUsageReceipt. Mutation: take
 *    `usageReceipt` out of the plugin's filing in vite.config.ts. Red: this case.
 * 2. A checkout with no world of its own — this worktree, with no `.env` and an environment that
 *    names no API — files nothing and says so once. Before the fix it filed into the office the main
 *    checkout's `.env` names.
 * 3. Two starts at once leave exactly one running row. The plugin's guard reads a memory of the row
 *    it filed, and two rounds can both read it before either writes, which is the measured shape of
 *    the two-rows-per-start pairs in the owner's office.
 */

import { EventEmitter } from 'node:events'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveConfig, type Plugin } from 'vite'
import { theOwnPartUsageReceipt } from '../src/config/own-rows.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const THE_BROWSER_APP = 'The browser app'

interface AWorld {
  db: TestDb
  app: FastifyInstance
  port: number
  address: string
}

/** A port nothing is listening on, for a world whose app is driven by `inject` and never binds. */
function freePort(): Promise<number> {
  return new Promise((ok, bad) => {
    const probe = createServer()
    probe.on('error', bad)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') {
        probe.close(() => bad(new Error('the probe socket reported no port')))
        return
      }
      const chosen = address.port
      probe.close(() => ok(chosen))
    })
  })
}

/** One throwaway world: a database migrated the product's way, behind the product's own app. */
async function aWorld(): Promise<AWorld> {
  const db = await freshDb()
  const built = await apiApp()
  const port = await freePort()
  return { db, app: built.app, port, address: `http://127.0.0.1:${String(port)}` }
}

/**
 * The real plugin, out of the real config file, resolved under whatever environment is set now.
 *
 * Also hands back the port the config tells a page the API is on, read out of the module the
 * `serve-the-api-address` plugin serves — the same reading tests/surface-fixes.test.ts uses.
 */
async function theRegisteringPluginAndThePagePort(): Promise<{ plugin: Plugin; pagePort: number }> {
  const resolved = await resolveConfig({ configFile: join(REPO, 'vite.config.ts'), logLevel: 'silent' }, 'serve')
  const plugins = (resolved.plugins as unknown[]).flat(3) as {
    name?: string
    resolveId?: (id: string) => string | null
    load?: (id: string) => string | null
  }[]
  const registering = plugins.find((one) => one.name === 'mole-office:register-this-browser-app')
  if (registering === undefined) throw new Error('vite.config.ts no longer has a plugin that registers the browser app')
  const serving = plugins.find((one) => one.name === 'mole-office:serve-the-api-address')
  if (serving?.resolveId === undefined || serving.load === undefined) {
    throw new Error('the config no longer tells the page where the API is')
  }
  const id = serving.resolveId('virtual:mole-office-api')
  if (id === null) throw new Error('the plugin did not resolve its own module')
  const said = /apiPortInDevelopment = (\d+)/.exec(serving.load(id) ?? '')
  if (said === null) throw new Error('the module the page is served names no port')
  return { plugin: registering as Plugin, pagePort: Number(said[1]) }
}

/** A dev server with nothing in it but the events the plugin listens for. */
function aFakeServer(): { httpServer: EventEmitter } {
  return { httpServer: new EventEmitter() }
}

/** Run the plugin's setup, the way Vite does, and let it listen. */
async function start(plugin: Plugin, server: { httpServer: EventEmitter }): Promise<void> {
  const configure = plugin.configureServer
  const run = typeof configure === 'function' ? configure : configure?.handler
  if (run === undefined) throw new Error('the plugin no longer configures the server')
  await (run as (s: unknown) => unknown)(server)
  server.httpServer.emit('listening')
}

/** Stop the round the plugin left behind. */
function stop(server: { httpServer: EventEmitter }): void {
  server.httpServer.emit('close')
}

/** Send what the plugin asks for to the app whose port the URL names, and throw if none does. */
function fetchThroughTheRightApp(worlds: AWorld[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const world = worlds.find((one) => one.address === url.origin)
    if (world === undefined) throw new Error(`nothing answers ${url.origin}, which no world of this test holds`)
    const answered = await world.app.inject({
      method: (init?.method ?? 'GET') as 'GET' | 'POST' | 'PATCH',
      url: url.pathname + url.search,
      headers: (init?.headers ?? {}) as Record<string, string>,
      ...(init?.body === undefined ? {} : { payload: String(init.body) }),
    })
    const headers: Record<string, string> = {}
    for (const [name, value] of Object.entries(answered.headers)) {
      if (typeof value === 'string') headers[name] = value
    }
    return new Response(answered.body, { status: answered.statusCode, headers })
  }) as typeof fetch
}

/** Wait until `what` is true, or fail rather than pass on a race. */
async function until(what: () => boolean, budget = 15_000): Promise<void> {
  const deadline = Date.now() + budget
  while (Date.now() < deadline) {
    if (what()) return
    await new Promise((go) => setTimeout(go, 25))
  }
  throw new Error('the browser app never wrote what this test waits for')
}

const saved: Record<string, string | undefined> = {}
const NAMES = [
  'MOLE_OFFICE_NO_WATCH',
  'MOLE_OFFICE_API',
  'MOLE_OFFICE_PORT',
  'MOLE_OFFICE_WEB_PORT',
  'MOLE_OFFICE_WORKSPACE',
] as const

let realFetch: typeof fetch
let worlds: AWorld[] = []

function setEnvironment(env: Partial<Record<(typeof NAMES)[number], string | undefined>>): void {
  for (const name of NAMES) {
    saved[`${name}`] ??= process.env[name]
    if (name in env) {
      const value = env[name]
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    } else {
      delete process.env[name]
    }
  }
}

async function cleanUp(): Promise<void> {
  globalThis.fetch = realFetch
  for (const name of NAMES) {
    const value = saved[name]
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
    delete saved[name]
  }
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('mole-office.what-the-browser-app-has-written-down')]
  for (const world of worlds.splice(0)) {
    await world.app.close()
    world.db.close()
  }
}

afterEach(cleanUp)

describe('the browser app files its row where its pages call', () => {
  it('takes the page and the row to the world the environment names, and leaves the other database alone', async () => {
    const first = await aWorld()
    const second = await aWorld()
    worlds = [first, second]
    realFetch = globalThis.fetch
    globalThis.fetch = fetchThroughTheRightApp(worlds)

    // THE TWO HALVES ARE TOLD DIFFERENT THINGS, which is the world that leaked: the address says A,
    // the port says B. The page must follow the address, because that is the world the plugin files
    // in, and the row and the page must not be in different worlds.
    setEnvironment({
      MOLE_OFFICE_API: first.address,
      MOLE_OFFICE_PORT: String(second.port),
      MOLE_OFFICE_WEB_PORT: '15173',
      MOLE_OFFICE_WORKSPACE: 'default',
    })
    delete process.env['MOLE_OFFICE_NO_WATCH']

    const { plugin, pagePort } = await theRegisteringPluginAndThePagePort()
    expect(pagePort, 'the page was told a port the plugin does not file in').toBe(first.port)

    const server = aFakeServer()
    await start(plugin, server)
    await until(() =>
      first.db.api
        .listRecords({ workspaceId: 'default', kind: 'session' })
        .some((row) => row.title === THE_BROWSER_APP && row.data['state'] === 'running'),
    )
    stop(server)

    const inFirst = first.db.api.listRecords({ workspaceId: 'default', kind: 'session' })
    const inSecond = second.db.api.listRecords({ workspaceId: 'default', kind: 'session' })
    expect(
      inFirst.filter((row) => row.title === THE_BROWSER_APP && row.data['state'] === 'running'),
      'the world the pages call did not get the row',
    ).toHaveLength(1)
    expect(
      inFirst.find((row) => row.title === THE_BROWSER_APP && row.data['state'] === 'running')?.data['usageReceipt'],
      'the browser app filed its row without the receipt that says it runs no model',
    ).toEqual(theOwnPartUsageReceipt(THE_BROWSER_APP, process.env))
    expect(
      inSecond.filter((row) => row.title === THE_BROWSER_APP),
      'a row reached a second database the same Vite was not told about',
    ).toEqual([])
  }, 60_000)

  it('files nothing from a checkout with no world of its own, and says so once', async () => {
    const world = await aWorld()
    worlds = [world]
    realFetch = globalThis.fetch
    const asked: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      asked.push(`${String(init?.method ?? 'GET')} ${new URL(String(input)).pathname}`)
      return new Response('{}', { headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    // THIS CHECKOUT HAS NO `.env` (a worktree does not), AND THE ENVIRONMENT NAMES NO API. Its pages
    // still call the office its main checkout's `.env` names; its row must not be filed there.
    setEnvironment({ MOLE_OFFICE_WEB_PORT: '15173', MOLE_OFFICE_WORKSPACE: 'default' })
    delete process.env['MOLE_OFFICE_NO_WATCH']

    const information: string[] = []
    const realInfo = console.info
    console.info = (...parts: unknown[]): void => {
      information.push(parts.join(' '))
    }
    try {
      const { plugin } = await theRegisteringPluginAndThePagePort()
      await start(plugin, aFakeServer())
      await new Promise((go) => setTimeout(go, 50))
      expect(asked.filter((one) => one.startsWith('POST /api/records')), 'it filed a row anyway').toEqual([])
      expect(asked.filter((one) => one.startsWith('POST /api/resources')), 'it registered a process anyway').toEqual([])
      const said = information.filter((one) => one.includes('not filing a row of its own'))
      expect(said, 'it filed nothing and said nothing').toHaveLength(1)
    } finally {
      console.info = realInfo
    }

    expect(world.db.api.listRecords({ workspaceId: 'default', kind: 'session' })).toEqual([])
  }, 60_000)
})
