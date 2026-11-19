// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BROWSER APP IS WRITTEN INTO THE LEDGER ONCE PER PROCESS, NOT ONCE PER RESTART.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Criterion G5 asks that every process a test, a worktree or an agent starts be registered with its
 * owner session and the world it serves, and the Vite in `vite.config.ts` does that for itself. The
 * first version did it once per PLUGIN INSTANCE, and Vite builds the plugin again every time it
 * restarts its dev server — which it does whenever a watched file changes, and this plugin watches
 * `src/shared` and `src/config`.
 *
 * On 4 September 2026 a scratch stack was left with FIVE live ledger rows for one Vite pid, each
 * under a session record of its own, so the "one live row per session, type and key" guard never
 * saw a duplicate. The ledger's own words for that state: two rows for one thing would be reported
 * as two orphans.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS TEST DRIVES
 * ---------------------------------------------------------------------------------------
 *
 * The real plugin, taken out of the real config, with a fake server under it: an event emitter
 * standing in for the HTTP server, and `fetch` counting what is sent. No port is taken and no
 * database is opened.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveConfig, type Plugin } from 'vite'

const REPO = fileURLToPath(new URL('..', import.meta.url))

/** Every request the plugin made, as method and path. */
let sent: string[] = []
let realFetch: typeof fetch
let noWatchWas: string | undefined

/** A Mole Office that answers everything the plugin asks, so the whole path runs. */
function anObligingMoleOffice(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const path = new URL(url).pathname
    sent.push(`${String(init?.method ?? 'GET')} ${path}`)
    if (path === '/api/health') {
      return new Response('{"ok":true}', {
        headers: {
          'content-type': 'application/json',
          'x-mole-office-world': `db=ab12cd34ef567890; repo=${THE_TEST_FIXTURE_ROOT}/px-somewhere; port=29601; head=abc1234; standing=scratch`,
        },
      })
    }
    if (path === '/api/records' && (init?.method ?? 'GET') === 'GET') {
      // The plugin reads the session rows before it files its own, to close the ones an earlier
      // start replaced. An empty list is the ordinary answer for a ledger with none.
      return new Response(JSON.stringify({ records: [] }), {
        headers: { 'content-type': 'application/json' },
      })
    }
    if (path === '/api/records') {
      return new Response(JSON.stringify({ record: { id: 'aSessionRecord' } }), {
        headers: { 'content-type': 'application/json' },
      })
    }
    if (path === '/api/resources') {
      return new Response(JSON.stringify({ resource: { id: 'aResourceRow' } }), {
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('{}', { headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
}

/** The real plugin, out of the real config file. */
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

/** Run the plugin's setup and let the requests it makes finish. */
async function start(plugin: Plugin, server: { httpServer: EventEmitter }): Promise<void> {
  const configure = plugin.configureServer
  const run = typeof configure === 'function' ? configure : configure?.handler
  if (run === undefined) throw new Error('the plugin no longer configures the server')
  await (run as (s: unknown) => unknown)(server)
  server.httpServer.emit('listening')
  // The plugin's work is asynchronous and nothing waits for it, which is deliberate: it must never
  // stop Vite from starting. Two turns of the event loop is long enough for four stubbed replies.
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 20))
}

let apiWas: string | undefined
let portWas: string | undefined

beforeEach(() => {
  sent = []
  realFetch = globalThis.fetch
  globalThis.fetch = anObligingMoleOffice()
  noWatchWas = process.env['MOLE_OFFICE_NO_WATCH']
  apiWas = process.env['MOLE_OFFICE_API']
  portWas = process.env['MOLE_OFFICE_PORT']
  // The plugin stands down under a test runner's Vite, because tests/helpers.ts registers that one
  // from the test process. This test is about `npm run dev`, so it clears the flag.
  delete process.env['MOLE_OFFICE_NO_WATCH']
  // AND IT NAMES THE OFFICE THE ROW IS FILED IN. This suite runs in a worktree, which has no `.env`
  // of its own; since problem `1p-pQxYe0RLB` the plugin files nothing from a checkout that has no
  // office of its own, so a test of `npm run dev` says which world it is, as a real one does when
  // the environment names the API. The value is irrelevant: this file answers every address itself.
  process.env['MOLE_OFFICE_API'] = 'http://127.0.0.1:9'
  process.env['MOLE_OFFICE_PORT'] = '9'
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('mole-office.what-the-browser-app-has-written-down')]
})

afterEach(() => {
  globalThis.fetch = realFetch
  if (noWatchWas === undefined) delete process.env['MOLE_OFFICE_NO_WATCH']
  else process.env['MOLE_OFFICE_NO_WATCH'] = noWatchWas
  if (apiWas === undefined) delete process.env['MOLE_OFFICE_API']
  else process.env['MOLE_OFFICE_API'] = apiWas
  if (portWas === undefined) delete process.env['MOLE_OFFICE_PORT']
  else process.env['MOLE_OFFICE_PORT'] = portWas
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('mole-office.what-the-browser-app-has-written-down')]
})

describe('the browser app writes itself down once, however often Vite restarts', () => {
  it('files one session record and one row on the first start', async () => {
    const plugin = await theRegisteringPlugin()
    await start(plugin, aFakeServer())
    expect(sent.filter((one) => one === 'POST /api/records')).toHaveLength(1)
    expect(sent.filter((one) => one === 'POST /api/resources')).toHaveLength(1)
    // It reads the world off a reply from the Mole Office it proxies to, rather than making one up.
    expect(sent[0]).toBe('GET /api/health')
  })

  it('files nothing more when Vite restarts its server in the same process', async () => {
    const plugin = await theRegisteringPlugin()
    await start(plugin, aFakeServer())
    // A restart builds the plugin again and starts a new HTTP server. The process is the same one,
    // so the pid is the same one, and a second row for it is what the orphan report reads as two
    // processes. Three restarts, because five is what was really left behind.
    for (let i = 0; i < 3; i += 1) await start(await theRegisteringPlugin(), aFakeServer())
    expect(sent.filter((one) => one === 'POST /api/records')).toHaveLength(1)
    expect(sent.filter((one) => one === 'POST /api/resources')).toHaveLength(1)
  })

  it('writes itself down again after its row has been released, and reuses the session record', async () => {
    const plugin = await theRegisteringPlugin()
    const server = aFakeServer()
    await start(plugin, server)
    server.httpServer.emit('close')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(sent.some((one) => one.startsWith('POST /api/resources/aResourceRow/release'))).toBe(true)

    await start(await theRegisteringPlugin(), aFakeServer())
    // A second row, because the first was given up. One session record still, because a restart is
    // not a second run of the browser app.
    expect(sent.filter((one) => one === 'POST /api/resources')).toHaveLength(2)
    expect(sent.filter((one) => one === 'POST /api/records')).toHaveLength(1)
  })

  it('does nothing at all when a test runner started this Vite', async () => {
    // tests/helpers.ts registers the Vite it starts from the test process, with the same world off
    // the same header. Two registrations of one process would be two rows.
    process.env['MOLE_OFFICE_NO_WATCH'] = '1'
    await start(await theRegisteringPlugin(), aFakeServer())
    expect(sent).toEqual([])
  })
})
