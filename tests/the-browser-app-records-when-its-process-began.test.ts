// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BROWSER APP RECORDS WHEN ITS PROCESS BEGAN, SO ITS OWN ROW CAN BE SHOWN TO BE ITS OWN.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Wave 13y round 30 marked a running row by what the office can see of its process (decisions 4o6XEDnlZUOd
 * and NWERRgH9KKNV). The office's own rows are read by their recorded pid and start time. The API server and the
 * terminal holder record both. The browser app recorded its pid and no start time: `vite.config.ts` called
 * `theOwnPartBlock(..., process.pid, null)`. So its row could only ever say "running, by its own word; its process
 * is not shown to be its own", although the process under that pid was the browser app's own (IYNy_DHq3khI).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS DRIVES
 * ---------------------------------------------------------------------------------------
 *
 * The real plugin out of the real `vite.config.ts`, as tests/the-browser-app-closes-its-own-row.test.ts drives it:
 * its `fetch` goes into the real Fastify app on a throwaway database. The row it files names this test's own process,
 * which stands in for the Vite process. The row is then read through the sessions door over an empty machine, the
 * way round 30's tests/a-running-row-filed-by-hand-is-marked-by-its-evidence.test.ts reads an own row.
 */

import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { resolveConfig, type Plugin } from 'vite'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { wholeRows } from '@shared/sessions-said-once.ts'
import { THE_BROWSER_APP } from '../src/config/own-rows.mjs'
import type { AdapterEnv } from '../src/server/lib/adapters/types.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const WEB_PORT = 5199
const NOW = new Date('2026-10-14T09:00:00Z')

let t: TestDb
let app: FastifyInstance
let door: FastifyInstance | null = null
let home: string
let realFetch: typeof fetch
const was = new Map<string, string | undefined>()
const THE_VARIABLES = ['MOLE_OFFICE_NO_WATCH', 'MOLE_OFFICE_API', 'MOLE_OFFICE_PORT', 'MOLE_OFFICE_WEB_PORT', 'MOLE_OFFICE_WORKSPACE']
const WRITTEN_DOWN = Symbol.for('mole-office.what-the-browser-app-has-written-down')

/** The plugin's real `fetch`, answered by the product's real routes on the real database. The host is ignored. */
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

/** Run the plugin's setup the way Vite does, against a server with nothing in it but the events it listens for. */
async function start(plugin: Plugin): Promise<void> {
  const server = { httpServer: new EventEmitter() }
  const configure = plugin.configureServer
  const run = typeof configure === 'function' ? configure : configure?.handler
  if (run === undefined) throw new Error('the plugin no longer configures the server')
  await (run as (s: unknown) => unknown)(server)
  server.httpServer.emit('listening')
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'mole-office-home-'))
  realFetch = globalThis.fetch
  globalThis.fetch = fetchThroughTheApp(app)
  for (const name of THE_VARIABLES) was.set(name, process.env[name])
  // The plugin stands down when a test runner started the Vite, and this test is `npm run dev`.
  delete process.env['MOLE_OFFICE_NO_WATCH']
  // An address this transport answers, never the live office's port (problem `f1uCdpMEB1hs`).
  process.env['MOLE_OFFICE_API'] = 'http://127.0.0.1:9'
  process.env['MOLE_OFFICE_PORT'] = '9'
  process.env['MOLE_OFFICE_WEB_PORT'] = String(WEB_PORT)
  // The throwaway database holds the default workspace and no other.
  process.env['MOLE_OFFICE_WORKSPACE'] = 'default'
  delete (globalThis as Record<symbol, unknown>)[WRITTEN_DOWN]
})

afterEach(async () => {
  globalThis.fetch = realFetch
  for (const [name, value] of was) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  delete (globalThis as Record<symbol, unknown>)[WRITTEN_DOWN]
  if (door) await door.close()
  door = null
  // The row this case filed is the only thing it wrote, so the next case starts from no row.
  for (const one of t.api.listRecords({ workspaceId: 'default', kind: 'session' })) {
    if (one.title === THE_BROWSER_APP) t.api.deleteRecord(one.id, t.api.HUMAN)
  }
  rmSync(home, { recursive: true, force: true })
})

/** The browser app's session record, once the plugin has filed it. */
async function theFiledRow(): Promise<{ id: string; data: Record<string, unknown> }> {
  const deadline = Date.now() + 15_000
  for (;;) {
    const found = t.api.listRecords({ workspaceId: 'default', kind: 'session' }).find((one) => one.title === THE_BROWSER_APP)
    if (found !== undefined) return found
    if (Date.now() > deadline) throw new Error('the browser app never filed its session record')
    await new Promise((go) => setTimeout(go, 25))
  }
}

/** The sessions door over an empty machine, so the browser app's row is read as a run filed by hand. */
async function theRunningList(): Promise<Map<string, { state: string; itsProcess?: unknown }>> {
  const { sessionRoutes } = await import('../src/server/api/sessions.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  const env = (): AdapterEnv => ({ homeDir: home, now: NOW, scanProcesses: () => ({ ok: true, processes: [] }), runningWithinSeconds: 5 * 60, orphanAfterSeconds: 6 * 60 * 60 })
  door = Fastify()
  installErrorHandling(door)
  await door.register(sessionRoutes, { prefix: '/api', env })
  await door.ready()
  const res = await door.inject({ method: 'GET', url: '/api/sessions?only=running' })
  expect(res.statusCode, res.body).toBe(200)
  const body = JSON.parse(res.body) as Record<string, unknown>
  const rows = wholeRows(body['sessions'] as unknown[], body['saidOnce']) as { recordId: string | null; state: string; itsProcess?: unknown }[]
  return new Map(rows.map((row) => [row.recordId ?? '', row]))
}

describe('the browser app records when its process began', () => {
  it('writes the start time the operating system gives its process beside its pid', async () => {
    await start(await theRegisteringPlugin())
    const filed = await theFiledRow()
    const { osProbe } = await import('../src/server/lib/resources.ts')
    const live = osProbe().processById(process.pid)
    expect(live, 'the probe cannot read this test’s own process').not.toBeNull()
    const extra = filed.data['extra'] as { discovered?: { pid?: unknown; pidStartedAt?: unknown } }
    expect(extra.discovered).toEqual({ pid: process.pid, pidStartedAt: live!.startedAt })
  }, 60_000)

  it('so its row draws "its process is running", and not the third mark', async () => {
    await start(await theRegisteringPlugin())
    const filed = await theFiledRow()
    const row = (await theRunningList()).get(filed.id)
    expect(row, 'the browser app’s row left the running list').toBeDefined()
    expect(row!.state).toBe('running')
    expect(row!.itsProcess).toEqual({
      seen: 'running',
      says: `its recorded process ${String(process.pid)} is running, and began at the time that was recorded`,
    })
  }, 60_000)
})
