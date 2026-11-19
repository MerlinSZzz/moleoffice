// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LATER START OF THE BROWSER APP CLOSES THE ROWS AN EARLIER ONE LEFT RUNNING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED ON 12 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * Problem `2G9jNsuJwJf4`. `GET /api/sessions?only=running` on the owner's own office answered ten
 * rows titled "The browser app" on a machine running one. The Vite plugin `registerThisBrowserApp`
 * in `vite.config.ts` filed a fresh row at every start of the dev page server, recorded no pid, and
 * closed none of the earlier ones. The API server and the message worker had just been taught to
 * close theirs (`src/server/lib/own-rows.ts`); the browser app's half was not.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS DRIVES, AND WHY IT IS THE REAL PRODUCT ON BOTH SIDES
 * ---------------------------------------------------------------------------------------
 *
 * The real plugin, taken out of the real `vite.config.ts` exactly as `npm run dev` loads it, is
 * started against an EventEmitter standing in for the HTTP server. The plugin's real `fetch` calls
 * go, through a thin transport, into the real Fastify app `apiApp()` builds on a real throwaway
 * database `freshDb()` made. So the rows the plugin reads, closes and files are rows in a database
 * read back through the product's own records door; the only thing this file invents is the socket.
 *
 * The three rows the rule is about are filed through that same door: two running "The browser app"
 * rows for THIS checkout and one for another checkout. A fourth row, "The API server", is put there
 * to prove the browser app's close does not reach a role that is not its own.
 *
 * The plugin stands down when a test runner started its Vite — `MOLE_OFFICE_NO_WATCH` says so — and
 * this test is about `npm run dev`, so it clears that flag, as the browser app's other plugin tests
 * do.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { resolveConfig, type Plugin } from 'vite'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
/** A checkout that is not this one, so the rule's checkout match has something to refuse. */
const ANOTHER_CHECKOUT = `${THE_TEST_FIXTURE_ROOT}/px-somewhere-else`

const WEB_PORT = 5199
const THE_BROWSER_APP = 'The browser app'
const THE_API_SERVER = 'The API server'

let t: TestDb
let app: FastifyInstance
let realFetch: typeof fetch
let project: string
let caseNumber = 0
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

/** Wait until the close and the filing have both landed, or fail rather than pass on a race. */
async function until<T>(what: () => T | null, budget = 15_000): Promise<T> {
  const deadline = Date.now() + budget
  for (;;) {
    const got = what()
    if (got !== null) return got
    if (Date.now() > deadline) throw new Error('the browser app never wrote what this test waits for')
    await new Promise((go) => setTimeout(go, 25))
  }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  project = `browser-app-case-${caseNumber}`
  const made = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    payload: { id: project, title: 'A project for one case' },
  })
  expect(made.statusCode, made.body).toBe(201)
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
  // Each case files into a project of its own, so one case's running rows cannot be read by the
  // next. The checkout's own `.env` names `panelx`, which this test office has never heard of, so
  // the plugin's writes would be refused for a project that is not there — the same refusal a real
  // cross-project write gets.
  process.env['MOLE_OFFICE_WORKSPACE'] = project
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('mole-office.what-the-browser-app-has-written-down')]
})

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
})

const AS_AN_AGENT = { type: 'agent', id: 'vitest/browser-app-rows' } as const

/** One running row of the office's own parts, filed through the product's own records door. */
function aRunningRow(title: string, checkout: string, startedAt: string): string {
  return t.api.createRecord({
    kind: 'session',
    title,
    workspaceId: project,
    data: {
      state: 'running',
      runtime: 'vite',
      startedAt,
      doing: `a row this test filed to be replaced`,
      workingDirectory: checkout,
    },
    actor: AS_AN_AGENT,
  }).id
}

function sessions(): ReturnType<TestDb['api']['listRecords']> {
  return t.api.listRecords({ workspaceId: project, kind: 'session' })
}

describe('a browser app start replaces the rows an earlier one left running', () => {
  it('closes the two rows of this checkout, leaves another checkout and the API server alone, and files its own with a pid', async () => {
    const first = aRunningRow(THE_BROWSER_APP, REPO, '2026-09-12 10:00:00')
    const second = aRunningRow(THE_BROWSER_APP, REPO, '2026-09-12 11:00:00')
    const elsewhere = aRunningRow(THE_BROWSER_APP, ANOTHER_CHECKOUT, '2026-09-12 11:30:00')
    // A role the browser app must not touch. The server's own half closes these; this half does not.
    const theApisRow = aRunningRow(THE_API_SERVER, REPO, '2026-09-12 09:00:00')

    await start(await theRegisteringPlugin(), aFakeServer())

    const newest = await until(() => {
      const rows = sessions()
      const closed = (id: string): boolean => rows.find((row) => row.id === id)?.data['state'] === 'finished'
      const fresh = rows.find(
        (row) =>
          row.title === THE_BROWSER_APP &&
          row.data['state'] === 'running' &&
          ![first, second, elsewhere, theApisRow].includes(row.id),
      )
      return closed(first) && closed(second) && fresh !== undefined ? fresh : null
    })

    const rows = sessions()
    const find = (id: string) => rows.find((row) => row.id === id)

    // 1. THE TWO EARLIER ROWS OF THIS CHECKOUT ARE CLOSED, with the one cause this start knows.
    for (const id of [first, second]) {
      const row = find(id)
      expect(row, 'a row filed before the restart is gone rather than closed').toBeDefined()
      expect(row?.data['state'], `${String(row?.title)} does not say it was replaced`).toBe('finished')
      expect(
        String(row?.data['closedBecause']),
        `${String(row?.title)} does not name what replaced it`,
      ).toBe(`replaced by the start of ${String(newest.data['startedAt'])}`)
      expect(row?.data['closedHow']).toBe('went-stale')
      expect(row?.data['closedAt'], 'the row does not say when it was closed').toBe(newest.data['startedAt'])
    }

    // 2. A ROW OF ANOTHER CHECKOUT IS LEFT ALONE. Matching on the title by itself would have closed
    //    it, which is the defect this rule exists against.
    expect(
      find(elsewhere)?.data['state'],
      'a running browser app in another checkout was closed by this checkout\'s start',
    ).toBe('running')

    // 3. AND A ROLE THAT IS NOT THE BROWSER APP IS NOT TOUCHED.
    expect(
      find(theApisRow)?.data['state'],
      "the browser app's close reached the API server's own row",
    ).toBe('running')

    // 4. THE NEW ROW CARRIES WHAT IT STANDS FOR: its pid and its start time.
    expect(newest.data['startedAt'], 'the new row carries no start time').toBeTruthy()
    const extra = newest.data['extra'] as
      | { ownPart?: { role?: string; port?: number; checkout?: string }; discovered?: { pid?: number } }
      | undefined
    expect(extra?.ownPart?.role, 'the new row does not say which part it is').toBe(THE_BROWSER_APP)
    expect(extra?.ownPart?.checkout, 'the new row does not say which checkout it works from').toBe(REPO)
    expect(extra?.ownPart?.port, 'the new row does not say which port it is on').toBe(WEB_PORT)
    expect(extra?.discovered?.pid, 'the new row does not carry the pid of this process').toBe(process.pid)

    // AND EXACTLY ONE ROW OF THIS CHECKOUT IS STILL RUNNING: the one this start filed.
    expect(
      rows.filter(
        (row) =>
          row.title === THE_BROWSER_APP &&
          row.data['state'] === 'running' &&
          String(row.data['workingDirectory']).replace(/\/$/, '') === REPO,
      ),
      'a start left more than one running row for this checkout',
    ).toHaveLength(1)
  }, 60_000)

  /**
   * AND A START THAT OVERLAPS ANOTHER FILES ONE ROW, NOT TWO.
   *
   * Problem `1p-pQxYe0RLB`: the owner's own office held pairs of "The browser app" rows with the
   * SAME pid and the same startedAt. The guard that stops a second row reads this process's memory
   * of the row it filed, and two rounds that read it before either has written both see null and
   * both file. Two Vite dev-server instances in one process do this, and so does a config reload
   * that overlaps the first round. The rounds are serialised now, so the second one finds the row
   * the first wrote.
   */
  it('leaves exactly one running row when two starts configure at the same moment', async () => {
    const first = await theRegisteringPlugin()
    const second = await theRegisteringPlugin()
    await start(first, aFakeServer())
    await start(second, aFakeServer())

    await until(
      () => sessions().find((row) => row.title === THE_BROWSER_APP && row.data['state'] === 'running') ?? null,
    )
    const running = sessions().filter(
      (row) =>
        row.title === THE_BROWSER_APP &&
        row.data['state'] === 'running' &&
        String(row.data['workingDirectory']).replace(/\/$/, '') === REPO,
    )
    expect(running, 'a start left more than one running row for this checkout').toHaveLength(1)
  }, 60_000)
})
