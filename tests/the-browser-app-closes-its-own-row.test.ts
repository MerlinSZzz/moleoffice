// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BROWSER APP CLOSES ITS OWN ROW IN THE LEDGER WHEN ITS PAGE SERVER CLOSES, AND SIGNALS NOTHING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `L3hKJEp1Z4cG`. On 4 September 2026 the panelx ledger held 120 rows whose detail is "the
 * browser app": 113 live, and the 7 closed ones were all closed by agents by hand. The Vite plugin
 * `registerThisBrowserApp` sent a plain release when its server closed. The release door will not
 * act on a live process without the confirm phrase, and the process sending the request is the live
 * process the row names, so every answer was a 400 that nothing read.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS DRIVES
 * ---------------------------------------------------------------------------------------
 *
 * The real plugin out of the real `vite.config.ts`, started against an EventEmitter standing in for
 * the HTTP server. Its `fetch` calls go into the real Fastify app on a throwaway database, so the
 * row it files and closes is a row in the product's own ledger. The row names this test's own pid,
 * which is alive, exactly as the browser app's row names a live Vite when it closes.
 */

import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveConfig, type Plugin } from 'vite'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const WEB_PORT = 5199

let t: TestDb
let app: FastifyInstance
let realFetch: typeof fetch
let noWatchWas: string | undefined
let apiWas: string | undefined
let portWas: string | undefined
let webPortWas: string | undefined
let workspaceWas: string | undefined

/**
 * The plugin's real `fetch`, answered by the product's real routes on the real database.
 *
 * The host in the URL is ignored: the plugin was told where to reach the API by `MOLE_OFFICE_API`
 * below, and the only thing that could answer that address in a test is this transport. Everything
 * else — the method, the path, the query, the headers, the body and the reply — is the product's.
 */
function fetchThroughTheApp(instance: FastifyInstance): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const answered = await instance.inject({
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

/** The real plugin, out of the real config file, the way `npm run dev` gets it. */
async function theRegisteringPlugin(): Promise<Plugin> {
  const resolved = await resolveConfig({ configFile: join(REPO, 'vite.config.ts'), logLevel: 'silent' }, 'serve')
  const found = resolved.plugins.find((one) => one.name === 'mole-office:register-this-browser-app')
  if (found === undefined) throw new Error('vite.config.ts no longer has a plugin that registers the browser app')
  return found as Plugin
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

beforeEach(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  realFetch = globalThis.fetch
  globalThis.fetch = fetchThroughTheApp(app)
  noWatchWas = process.env['MOLE_OFFICE_NO_WATCH']
  apiWas = process.env['MOLE_OFFICE_API']
  portWas = process.env['MOLE_OFFICE_PORT']
  webPortWas = process.env['MOLE_OFFICE_WEB_PORT']
  workspaceWas = process.env['MOLE_OFFICE_WORKSPACE']
  // The plugin stands down when a test runner started the Vite, and this test is `npm run dev`.
  delete process.env['MOLE_OFFICE_NO_WATCH']
  // The address the plugin is told to reach. This transport answers it, so no socket is needed, and
  // the port is 9 rather than the live office's port, for the reason problem `f1uCdpMEB1hs`
  // gives: a test's registration must never reach the live corpus.
  process.env['MOLE_OFFICE_API'] = 'http://127.0.0.1:9'
  process.env['MOLE_OFFICE_PORT'] = '9'
  process.env['MOLE_OFFICE_WEB_PORT'] = String(WEB_PORT)
  // The throwaway database holds the default workspace and no other. The checkout's own `.env`
  // names `panelx`, which the fresh database has never heard of, so the plugin's writes would be
  // refused for a project that is not there — the same refusal a real cross-project write gets.
  process.env['MOLE_OFFICE_WORKSPACE'] = 'default'
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('mole-office.what-the-browser-app-has-written-down')]
}, 60_000)

afterEach(async () => {
  globalThis.fetch = realFetch
  if (noWatchWas === undefined) delete process.env['MOLE_OFFICE_NO_WATCH']
  else process.env['MOLE_OFFICE_NO_WATCH'] = noWatchWas
  for (const [name, was] of [
    ['MOLE_OFFICE_API', apiWas],
    ['MOLE_OFFICE_PORT', portWas],
    ['MOLE_OFFICE_WEB_PORT', webPortWas],
    ['MOLE_OFFICE_WORKSPACE', workspaceWas],
  ] as const) {
    if (was === undefined) delete process.env[name]
    else process.env[name] = was
  }
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('mole-office.what-the-browser-app-has-written-down')]
  await app.close()
  t.close()
})


/** The ledger's rows for this process, released ones included, read through the product's own lib. */
async function theBrowserAppRows(): Promise<
  { id: string; key: string; releasedAt: string | null; releasedBy: string | null; releaseNote: string | null }[]
> {
  const { listResources } = await import('../src/server/lib/resources.ts')
  // The ledger keeps the command line as a process row's detail, so the row is found by its pid.
  return listResources({ workspaceId: 'default', includeReleased: true }).filter(
    (row) => row.type === 'process' && row.key === String(process.pid),
  )
}

/** Wait until an asynchronous reading holds, or fail rather than pass on a race. */
async function untilItHolds<T>(what: () => Promise<T | null>, budget = 15_000): Promise<T> {
  const deadline = Date.now() + budget
  for (;;) {
    const got = await what()
    if (got !== null) return got
    if (Date.now() > deadline) throw new Error('the browser app never wrote what this test waits for')
    await new Promise((go) => setTimeout(go, 25))
  }
}

describe('the browser app closes its own row, and signals nothing', () => {
  it('closes the row when its page server closes, as the browser app, and the row says nothing was signalled', async () => {
    const server = aFakeServer()
    await start(await theRegisteringPlugin(), server)
    const filed = await untilItHolds(async () => (await theBrowserAppRows()).find((row) => row.releasedAt === null) ?? null)
    // The row names this very process, which is alive: the case every browser app shutdown is.
    expect(filed.key).toBe(String(process.pid))

    server.httpServer.emit('close')
    const closed = await untilItHolds(async () => {
      const row = (await theBrowserAppRows()).find((one) => one.id === filed.id)
      return row !== undefined && row.releasedAt !== null ? row : null
    })
    expect(closed.releasedBy).toBe('agent:vite/the-browser-app')
    expect(closed.releaseNote ?? '').toContain('the browser app closed its page server')
    expect(closed.releaseNote ?? '').toContain('nothing was signalled')
    // And this process, which the row named, is still here to read it.
    expect(process.kill(process.pid, 0)).toBe(true)
  }, 60_000)

  it('has closed the row by the time Vite\'s own close is done waiting, so an exit after it cannot cut it off', async () => {
    const plugin = await theRegisteringPlugin()
    await start(plugin, aFakeServer())
    const filed = await untilItHolds(async () => (await theBrowserAppRows()).find((row) => row.releasedAt === null) ?? null)

    // Vite awaits the plugins' buildEnd inside server.close(), and only then calls process.exit().
    // Nothing else is waited for here: when buildEnd has returned, the row must already be closed.
    const hook = plugin.buildEnd
    const run = typeof hook === 'function' ? hook : hook?.handler
    if (run === undefined) throw new Error('the plugin has no buildEnd, so nothing holds Vite until the row is closed')
    await (run as () => Promise<void>).call({})
    const row = (await theBrowserAppRows()).find((one) => one.id === filed.id)
    expect(row?.releasedAt, 'the row was still live when Vite would have exited').not.toBeNull()
  }, 60_000)
})
