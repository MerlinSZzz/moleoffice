// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WIRING: what the running product actually serves.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * `src/server/index.ts` is the file that decides which route groups are attached to the server,
 * and until this file was written nothing checked it. An audit measured the hole rather than
 * asserting it: six of the nine `app.register` lines were commented out, the server then answered
 * 404 for /api/attention, /api/sessions, /api/resources, /api/source, /api/queries and
 * /api/layout — twenty endpoints instead of forty-two — and all 2,065 tests passed. (The layout
 * group has since been deleted on purpose, with the draggable panel grid it served, so it is
 * named here as history and not as something to go looking for.)
 *
 * It had already cost the product. Four test files each built their own server out of the plugins
 * their author knew about, so "every endpoint is described" was a true statement about each
 * author's idea of Mole Office and said nothing about Mole Office. `presentationRoutes` was added, none of
 * the four heard about it, and eight endpoints shipped answering `GET /api` with
 * `description: null` while two tests whose titles promise to prevent that ran green.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE THIS FILE OBEYS: ASK THE APP, NEVER A LIST
 * ---------------------------------------------------------------------------------------
 *
 * Nothing below is a hand-written list of endpoints or of route groups. There are exactly two
 * sources of truth and they are compared against each other:
 *
 *   THE APP — `buildApp()` from src/server/index.ts, built in this process, not listening. What it
 *   SERVES is read back from `GET /api`, which the product builds from its own router.
 *
 *   THE DIRECTORY — every route-group plugin declared in `src/server/api`, found by reading the
 *   directory and importing each file. Each one is registered on a throwaway app of its own to
 *   find out which endpoints it contributes.
 *
 * The two must agree exactly. A registration deleted from `buildApp` leaves the directory
 * unchanged, so the endpoints it contributed go missing from the index, and this file goes red
 * listing them, each with its group's name. That was checked by doing it, on a copy of the
 * repository in /tmp so that nothing
 * in the working tree was mutated: deleting `await app.register(sourceRoutes, …)` turns 27 passing
 * tests here into 5 failures, the first of which is "registers every route group that
 * src/server/api declares" and whose diff is one missing line reading `sourceRoutes`. Putting the
 * registration back makes all 27 pass again.
 *
 * A PLUGIN THE WALK DOES NOT RECOGNISE. `buildApp` may register a plugin that the directory walk
 * below never recognised, because it is named something other than `…Routes`. Its endpoints then
 * show up in the count below as served by the app and declared by no group on disk.
 *
 * The one endpoint that belongs to no plugin is `GET /api/health`, which `buildApp` declares
 * itself. It is named once, below, deliberately and with its behaviour tested — a second inline
 * route added to `buildApp` will fail the arithmetic here until somebody decides whether it
 * belongs in a plugin.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MUST NOT BREAK
 * ---------------------------------------------------------------------------------------
 *
 * `src/server/db/client.ts` reads MOLE_OFFICE_DB the moment it is imported. Importing
 * `src/server/index.ts` does NOT open a database: everything that reaches the client is pulled in
 * with `await import()` inside `buildApp()`, so nothing happens until this file has called
 * `freshDb()` and pointed MOLE_OFFICE_DB at its own throwaway file. That ordering is the reason every
 * import below the vitest ones is dynamic, and it is the same rule tests/helpers.ts explains.
 */

import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
// Four tests below send one request to every endpoint the server lists, so their time grows with
// the API and with the machine's load. Measured 5 October 2026 (problem VeXZP9TPPFMX): the slowest
// took 2.6 s alone and 5.5 to 7.2 s with four busy processes on the same two cores, past the default 5 s;
// and the beforeAll, which imports the server and every route file, ran past its default 10 s.
import { A_HOOK_THAT_STARTS_SOMETHING, A_TEST_THAT_STARTS_SOMETHING } from './how-long-a-test-may-take.ts'
// A value import, and safe: api/kinds.ts imports from src/shared/ and fastify only, so it opens no
// database. `apiIndex` is used below as a control -- the same pure function the server answers
// GET /api with, asked about a route nobody has described.
import { apiIndex, type ApiIndex, type ApiRoute } from '../src/server/api/kinds.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type OsProbe = ResourcesLib['LINUX_PROBE']

const API_DIR = fileURLToPath(new URL('../src/server/api', import.meta.url))
const DIST_WEB = fileURLToPath(new URL('../dist/web', import.meta.url))

/**
 * The one endpoint `buildApp` writes itself rather than taking from a plugin.
 *
 * Named here, once, because the arithmetic below is "the index equals every plugin's endpoints
 * plus this". If a second inline route ever appears in `buildApp`, that sum stops adding up and
 * this file says so — which is the answer this file is for. Do not lengthen this list to make a
 * failure go away; either move the route into a route group or decide, in the open, that
 * `buildApp` owns two endpoints.
 */
const DECLARED_IN_BUILD_APP = ['GET /api/health']

/** The methods Fastify's router can be asked about. An endpoint outside this list is a mistake. */
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
type HttpMethod = (typeof HTTP_METHODS)[number]

function asMethod(method: string, where: string): HttpMethod {
  const known = HTTP_METHODS.find((m) => m === method)
  if (known === undefined) {
    throw new Error(`${where} is served under the method "${method}", which is not one of ${HTTP_METHODS.join(', ')}.`)
  }
  return known
}

/** "GET /api/records", the way every message in this file writes an endpoint. */
function key(endpoint: { method: string; path: string }): string {
  return `${endpoint.method} ${endpoint.path}`
}

/**
 * A machine with nothing running on it.
 *
 * `GET /api/sessions` and `GET /api/resources` describe what is alive on this computer right now.
 * Left to the real probe they would read this machine's /proc while some other agent's test run is
 * on it, so what they answer would depend on the afternoon. This file is about whether those
 * endpoints are REACHABLE, so the cheapest honest machine is an empty one.
 */
function emptyProbe(): OsProbe {
  return {
    platform: 'fake',
    processById: () => null,
    processesInGroup: () => [],
    listeningPorts: () => [],
    gpu: () => ({ available: true, processes: [] }),
    containers: () => ({ available: true, containers: [] }),
    locks: () => ({ files: [], unreadable: [] }),
    ownProcessGroup: () => 999_999,
    killProcessGroup: () => {
      throw new Error('this file never kills anything')
    },
    stopContainer: () => {
      throw new Error('this file never stops anything')
    },
  }
}

// ---------------------------------------------------------------------------- the two sources

let t: TestDb
let server: typeof import('../src/server/index.ts')
let app: FastifyInstance
let index: ApiIndex
/** Which endpoints each route-group plugin in src/server/api contributes, found by registering it. */
let byPlugin: Map<string, ApiRoute[]>

/**
 * Whether one export of a route module is a Fastify plugin.
 *
 * Ending in `…Routes` is not enough on its own: `trackApiRoutes` in api/kinds.ts has that ending
 * and installs a hook rather than routes. A plugin is either an async function — which every one
 * of them is — or a plain function taking Fastify's `(instance, opts, done)`, so it declares two
 * or more parameters. `trackApiRoutes` is neither: it is synchronous and takes one.
 *
 * This is a reading of the code rather than something the code states, and it is safe only
 * because getting it wrong FAILS a test here. A non-plugin it wrongly includes throws when this
 * file tries to register it. A plugin it MISSES — one named something other than `…Routes` — is
 * not found by this walk, so the endpoints it contributes are served and declared by no group, and
 * the count below goes red.
 */
function looksLikeAPlugin(value: unknown): boolean {
  if (typeof value !== 'function') return false
  return value.constructor.name === 'AsyncFunction' || value.length >= 2
}

/**
 * Build a throwaway app carrying ONE route group, to find out which endpoints it contributes.
 *
 * This is how the expected surface is derived rather than typed. It is deliberately not the app
 * under test: it has no error handler, no CORS and no 404, and nothing is ever injected into it.
 * Only its route table is read.
 */
async function endpointsOf(plugin: unknown): Promise<ApiRoute[]> {
  const Fastify = (await import('fastify')).default
  const { trackApiRoutes } = await import('../src/server/api/kinds.ts')

  const probe = Fastify({ logger: false })
  const listRoutes = trackApiRoutes(probe)
  // `discoveryRoutes` is the one plugin that takes an option, and the option is the route table it
  // is going to serve. On a probe app that is its own table, which is all this needs.
  await probe.register(plugin as Parameters<FastifyInstance['register']>[0], {
    prefix: '/api',
    listRoutes,
  })
  await probe.ready()
  const routes = listRoutes()
  await probe.close()
  return routes
}

beforeAll(async () => {
  // First, so MOLE_OFFICE_DB names a throwaway file before anything that opens a database is loaded.
  t = await freshDb()

  const resources = await import('../src/server/lib/resources.ts')
  resources.useOsProbe(emptyProbe())

  server = await import('../src/server/index.ts')
  const built = await server.buildApp({
    production: false,
    // Unread while `production` is false. It is the real path rather than an invented one so that
    // nothing here depends on a directory this test did not create; the production branch is
    // exercised further down against a directory it builds itself.
    webDir: DIST_WEB,
    webAppUrl: 'http://localhost:5173',
    logLevel: false,
  })
  app = built.app
  await app.ready()

  const reply = await app.inject({ method: 'GET', url: '/api' })
  index = JSON.parse(reply.body) as ApiIndex

  byPlugin = new Map()
  for (const entry of readdirSync(API_DIR, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) {
      // This walk is one level deep because the import below is one level deep: the bundler can
      // only rewrite a dynamic import whose variable part is a single path segment. So a route
      // group in a subdirectory would be invisible here, which is the shape of the defect this
      // whole file exists to end. Refusing out loud is the only honest answer — either move the
      // group back up, or teach both the walk and the import to go down.
      throw new Error(
        `src/server/api/${entry.name}/ is a directory, and this file can only see route groups ` +
          `that sit directly in src/server/api. A group inside it would be registered by ` +
          `buildApp() and checked by nothing. Move it up, or teach this walk and its import to recurse.`,
      )
    }
    if (!entry.name.endsWith('.ts')) continue
    // The specifier is built at run time on purpose: a route group added to src/server/api is
    // found here without this file being edited. The ".ts" sits outside the placeholder because
    // Vite can only rewrite a dynamic import whose static part carries the extension.
    const base = entry.name.replace(/\.ts$/, '')
    const module = (await import(`../src/server/api/${base}.ts`)) as Record<string, unknown>
    for (const name of Object.keys(module)) {
      if (!name.endsWith('Routes')) continue
      if (!looksLikeAPlugin(module[name])) continue
      byPlugin.set(name, await endpointsOf(module[name]))
    }
  }
}, A_HOOK_THAT_STARTS_SOMETHING)

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================================ it built at all

describe('the server can be built without being started', () => {
  it('hands back an app that is not listening', () => {
    // The property the whole file rests on. `server.address()` is null until listen() is called,
    // so this is the difference between an app a test can hold and a port a test would have to
    // find, bind and free.
    expect(app.server.listening).toBe(false)
    expect(app.server.address()).toBe(null)
  })

  it('serves an index with a real number of endpoints in it', () => {
    // A guard on everything below: if GET /api came back empty, every "each of these" assertion
    // would pass by iterating nothing. Forty is under the count on the day this was written (42)
    // and well over any accident.
    expect(index.endpoints.length).toBeGreaterThan(40)
  })

})

// ============================================================================ every group is on

describe('every route group in src/server/api is registered and reachable', () => {
  it('serves every endpoint that every route group declares', () => {
    const served = new Set(index.endpoints.map(key))
    const missing: string[] = []
    for (const [name, routes] of byPlugin) {
      for (const route of routes) {
        if (!served.has(key(route))) missing.push(`${key(route)} (${name})`)
      }
    }
    expect(
      missing,
      'these endpoints exist in src/server/api and the server does not serve them, so buildApp() in ' +
        'src/server/index.ts is not registering the route group they belong to. Six registrations were once ' +
        'deleted and the whole suite stayed green; this is the assertion that now notices.',
    ).toEqual([])
  })

  it('has a route in the router for every endpoint it lists', () => {
    // GET /api is built by an onRoute hook. This asks Fastify's router itself, which is a
    // different mechanism, so an endpoint that is listed but never actually mounted shows up here.
    const unmounted = index.endpoints
      .filter((e) => !app.hasRoute({ method: asMethod(e.method, key(e)), url: e.path }))
      .map(key)
    expect(unmounted).toEqual([])
  })

  it('proves that check can fail, by asking about a path nobody mounted', () => {
    // A test that would pass with the feature deleted is not a test. Same call, same router, a
    // path that does not exist.
    expect(app.hasRoute({ method: 'GET', url: '/api/nobody-mounted-this' })).toBe(false)
  })

  it('answers every GET it lists rather than falling through to the 404', async () => {
    // Reachability as behaviour rather than as a router lookup. The reply may be a 400 or a 404
    // about a record that does not exist — those are the endpoint answering. What must not happen
    // is the not-found handler, which is the one reply carrying the whole endpoint list.
    const fellThrough: string[] = []
    for (const endpoint of index.endpoints) {
      if (endpoint.method !== 'GET') continue
      // A ROUTE THE SERVER HOLDS OPEN NEVER FINISHES A REPLY, so injecting one and reading its body
      // would wait for ever. It says so about itself — `waits` on its own declaration — and is
      // reachable in the only way such a route can be: tests/the-channel.test.ts opens it against a
      // real server and reads the events out of it.
      if (endpoint.waits === true) continue
      // Every :param becomes the same nonsense value: this is about which handler receives the
      // request, not about what it finds.
      const url = endpoint.path.replace(/:[^/]+/g, 'wiring-probe')
      const reply = await app.inject({ method: 'GET', url })
      // A BODY THAT IS NOT JSON IS AN ENDPOINT ANSWERING, and that is the whole of what this asks.
      // The not-found handler sends JSON whose sentence begins "No such endpoint", so anything
      // else came from a route: since criterion B29 two of them answer text/plain on purpose, and
      // parsing their bodies threw where the old code assumed every reply was JSON. A route's own
      // 404 — an unknown kind, an unknown family — is an endpoint answering and is not this.
      let body: unknown = null
      try {
        body = JSON.parse(reply.body)
      } catch {
        body = null
      }
      const said = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : undefined
      const isNotFoundHandler = reply.statusCode === 404 && typeof said === 'string' && said.startsWith('No such endpoint')
      if (isNotFoundHandler) fellThrough.push(`${key(endpoint)} → ${url}`)
    }
    expect(fellThrough).toEqual([])
  }, A_TEST_THAT_STARTS_SOMETHING)

  it('proves that check can fail, by asking for a path that is not served', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/records-but-misspelt' })
    expect(reply.statusCode).toBe(404)
    const body = JSON.parse(reply.body) as { error: string; opening: string; families: { name: string; doors: number; line: string }[] }
    // THE 404 CARRIES THE FAMILIES, NOT EVERY DOOR NAME. An audit tried three paths, was refused
    // three times with no alternatives, and read 1,200 lines of source instead; a lost caller is
    // now handed the cheap catalogue and the way to open one family.
    expect(Array.isArray(body.families)).toBe(true)
    expect(body.families.length).toBeGreaterThan(1)
    expect(body.opening).toContain('/api/families/')
    // The first segment here is NOT a family, so the whole door list is not carried.
    expect(body).not.toHaveProperty('endpoints')
    expect(body.error).toContain('/api/records')
  })
})

// ============================================================================ the count adds up

describe('the endpoints the server lists are exactly the endpoints that are mounted', () => {
  /** Every endpoint the route groups on disk contribute, plus the ones buildApp declares itself. */
  function expected(): string[] {
    const all = new Set(DECLARED_IN_BUILD_APP)
    for (const routes of byPlugin.values()) for (const route of routes) all.add(key(route))
    return [...all].sort()
  }

  it('lists neither more nor fewer than that', () => {
    // Both directions in one assertion, and the diff on failure names the endpoints rather than
    // reporting two numbers. Fewer means a route group is not registered. More means buildApp
    // declares a route of its own that nobody has decided about — see DECLARED_IN_BUILD_APP.
    expect(index.endpoints.map(key).sort()).toEqual(expected())
  })

  it('counts the same either way, so the number in the startup line is the number served', () => {
    // The server prints "N endpoints — GET /api lists them" on every start, and that N comes from
    // the same getter GET /api is built from. This pins the two together.
    expect(index.endpoints.length).toBe(expected().length)
  })

  it('holds no route in its router that GET /api does not list', () => {
    // THE OTHER DIRECTION, AND WHY IT NEEDS A DIFFERENT ORACLE.
    //
    // Everything above compares the index against the route groups on disk, so it catches a group
    // that is not registered. It cannot catch a route registered INSIDE buildApp above the line
    // that installs `trackApiRoutes`: the hook only sees registrations made after it, so such a
    // route would be served by the product and named nowhere — the exact failure GET /api exists
    // to end, one layer further in.
    //
    // Fastify's own router is the only witness to that, and the only way to read it is
    // `printRoutes()`, which is a tree drawn for a person. This does NOT parse the tree — rebuilding
    // paths out of it would be a second definition of the route table, which is what api/kinds.ts
    // rejects it for. It counts one thing: the method labels, which is one per (path, method) the
    // router holds.
    //
    // The expected count is derived, not typed. It is the index, plus one for every endpoint
    // Fastify also holds under a trailing slash — `/api` and `/api/` are one endpoint and two
    // router entries, and `normalisePath` in api/kinds.ts collapses them on purpose.
    //
    // If a future Fastify prints its routes differently this test FAILS rather than passing
    // quietly, and the fix is to re-read the format, not to delete the check.
    const printed = app.printRoutes({ commonPrefix: false })
    const labels = printed.match(/\(([A-Z]+(?:, [A-Z]+)*)\)/g) ?? []
    expect(labels.length, `printRoutes() no longer labels methods the way this test reads them:\n${printed}`)
      .toBeGreaterThan(20)

    const inRouter = labels
      .flatMap((label) => label.slice(1, -1).split(', '))
      // HEAD is added automatically alongside every GET and OPTIONS is the CORS preflight; the
      // index leaves both out because neither is a request a caller decides to make.
      .filter((method) => method !== 'HEAD' && method !== 'OPTIONS').length

    // A PATH ENDING IN A WILDCARD HAS NO TWIN UNDER A SLASH: the wildcard takes any rest, a trailing slash among them,
    // and the router throws when it is asked about a path with anything after its wildcard. The plugin file door,
    // GET /api/plugins/:id/files/*, is the first such path (wave 13x round 15).
    const alsoUnderASlash = index.endpoints.filter(
      (e) => !e.path.endsWith('*') && app.hasRoute({ method: asMethod(e.method, key(e)), url: `${e.path}/` }),
    ).length

    expect(
      inRouter,
      'Fastify is serving routes that GET /api does not list. The usual cause is a route registered in ' +
        'buildApp() above the trackApiRoutes(app) line: the hook only sees what is registered after it, so ' +
        'the endpoint exists and is undiscoverable.',
    ).toBe(index.endpoints.length + alsoUnderASlash)
  })
})

// ============================================================================ every one says why

describe('every endpoint the server serves says what it is for', () => {
  it('leaves none of them describing itself as nothing', () => {
    const undescribed = index.endpoints.filter((e) => e.description === null).map(key)
    expect(
      undescribed,
      'these endpoints are registered by buildApp() in src/server/index.ts and nobody has said what they are for. ' +
        "Declare the sentence beside the route as config: { note: '…' }, the way src/server/api/presentation.ts " +
        'does. The README tells agents to read GET /api INSTEAD of the source, so an endpoint with no sentence is ' +
        'an endpoint that cannot be found by the route the product tells its callers to use.',
    ).toEqual([])
  })

  it('gives each of them a sentence rather than a label', () => {
    // `description: "Removes it."` would pass a null check and leave a caller guessing at the
    // body. Forty characters is not a quality bar; it is the floor under a placeholder.
    const tooShort = index.endpoints
      .filter((e) => e.description !== null && e.description.trim().length < 40)
      .map((e) => `${key(e)} — ${String(e.description)}`)
    expect(tooShort).toEqual([])
  })

  it('describes every route group, not only the ones written before the newest', () => {
    // The eight nulls were all one group, added in one commit, in a file none of the four existing
    // tests had heard of. This asserts the property per group so a whole group cannot go dark
    // again while the totals still look healthy.
    const undescribedByGroup: string[] = []
    const described = new Map(index.endpoints.map((e) => [key(e), e.description]))
    for (const [name, routes] of byPlugin) {
      for (const route of routes) {
        if (described.get(key(route)) == null) undescribedByGroup.push(`${key(route)} (${name})`)
      }
    }
    expect(undescribedByGroup).toEqual([])
  })

  it('proves those checks can fail, by asking about a route nobody described', () => {
    // A test that would pass with the feature deleted is not a test. `apiIndex` is the function
    // the server answers GET /api with, so this is the same code path the three assertions above
    // run, given a route that has no sentence beside it and no line in ROUTE_NOTES. If this ever
    // comes back with a description, those three have stopped checking anything.
    const invented = apiIndex(
      [{ method: 'GET', path: '/api/nobody-wrote-a-line-for-this', operation: 'project.index', reach: 'remote' }],
      { current: 'default', stated: false },
    )
    expect(invented.endpoints.map((e) => e.description)).toEqual([null])
  })
})

// ============================================================================ an empty body

/**
 * A request that names a JSON body and does not carry one.
 *
 * TEN endpoints take no body, and this comment used to say five and name the wrong ones. Measured
 * 2026-08-12: `reindex` and `discover` DO parse bodies, there are three presentation DELETEs rather
 * than two, and `POST /api/import` and the two exports were missing from a list they belong at the
 * top of. The endpoints that really take none are the two exports, the import, three presentation
 * DELETEs, `DELETE /api/links/:id`, `DELETE /api/records/:id`, `POST /api/records/:id/restore` and
 * `DELETE /api/records/:id/blocks/:blockId` — and the block below no longer types that list either:
 * it derives it from what `GET /api` publishes. `GET /api` describes each of them as taking none.
 * Fastify's built-in parser answered all of them with
 * "Body cannot be empty when content-type is set to 'application/json'" — a 400 naming neither
 * Mole Office nor the endpoint nor what to do — because the caller had set a header describing a body
 * there was nothing to describe.
 *
 * A `fetch` wrapper with one shared headers object sends exactly that, and so does
 * `curl -H 'content-type: application/json' -X DELETE`. Mole Office's own `tools/review.mjs` sends it,
 * and the contact sheet of 2026-08-10 recorded "The arrangement could NOT be removed again (400)".
 *
 * THIS BLOCK IS DERIVED, NOT TYPED. It asks the app for every endpoint that takes a body, sends
 * each of them a JSON content type with nothing after it, and requires that none is refused with
 * the empty-body message. A sixth no-body endpoint added later is covered without this file being
 * edited — which is the property the four hand-written registration lists never had.
 */
describe('a request that names a JSON body and does not carry one', () => {
  /** The message Fastify's built-in parser gives, which is the one that must never come back. */
  const FASTIFY_EMPTY = 'Body cannot be empty'

  /** Every endpoint a body could be sent to. GET and DELETE-with-params included; see below. */
  function bodyBearing(): { method: HttpMethod; path: string }[] {
    return index.endpoints
      .filter((e) => e.method !== 'GET')
      .map((e) => ({ method: asMethod(e.method, key(e)), path: e.path }))
  }

  it('is never refused for being empty, on any endpoint that takes one', async () => {
    // Every :param becomes the same nonsense value. What the handler then says — 404 about a
    // record, 400 about a missing field — is its business. What must not happen is the body
    // parser refusing before the handler is reached, because that refusal is about the header
    // rather than about the request.
    const refusedForBeingEmpty: string[] = []
    for (const endpoint of bodyBearing()) {
      const url = endpoint.path.replace(/:[^/]+/g, 'empty-body-probe')
      const reply = await app.inject({
        method: endpoint.method,
        url,
        headers: { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
        payload: '',
      })
      if (reply.body.includes(FASTIFY_EMPTY)) refusedForBeingEmpty.push(`${endpoint.method} ${url}`)
    }
    expect(
      refusedForBeingEmpty,
      'these endpoints refused a request because it named a JSON body and carried none. An empty body means ' +
        '"there is no body"; the endpoints that take none say so at GET /api, and a caller that sets one headers ' +
        'object for every request cannot reach them.',
    ).toEqual([])
    // And the loop had something to iterate: an empty list would make the assertion vacuous.
    expect(bodyBearing().length).toBeGreaterThan(10)
  }, A_TEST_THAT_STARTS_SOMETHING)

  it('reaches the handler on the endpoints that take no body at all', async () => {
    // The endpoints above are checked as a set, which cannot tell "the parser let it through" from
    // "the route does not exist". These are the ones whose whole request IS the empty body, driven
    // to a real 200 against real seeded-free data, so the parser is shown to be passing work on.
    const restorable = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
      payload: JSON.stringify({ kind: 'note', title: 'a note for the empty-body probe' }),
    })
    const id = (JSON.parse(restorable.body) as { record: { id: string } }).record.id

    for (const [method, url] of [
      ['POST', `/api/records/${id}/restore`],
      ['DELETE', '/api/presentation/structure'],
      ['DELETE', '/api/presentation/structure/direction'],
    ] as const) {
      const reply = await app.inject({
        method,
        url,
        headers: { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
        payload: '',
      })
      expect(reply.statusCode, `${method} ${url} → ${reply.body.slice(0, 200)}`).toBe(200)
    }
  })

  /**
   * EVERY ENDPOINT THAT PUBLISHES "takes no body" REFUSES ONE, AND ONLY THOSE DO.
   *
   * ---------------------------------------------------------------------------------------
   * WHY THIS IS DERIVED FROM THE INDEX AND NOT A LIST
   * ---------------------------------------------------------------------------------------
   *
   * This server declares no route-level schemas at all: Fastify parses a JSON body and hands it to
   * the handler, and a route is guarded only if its author remembered to call `parse`. Measured
   * 2026-08-12 by sending `{"totalNonsense":42}` to all 31 non-GET routes — 21 refused it and TEN
   * took it, and three of those ten publish "Takes NO BODY" in the sentence `GET /api` serves.
   *
   * The one that matters: `POST /api/import` answered `{"dryRun":true}` with 200, `applied: true`,
   * and a row overwritten. A destructive import ran under a request whose entire content asked it
   * not to. `POST /api/export` was handed a `destination` and wrote 452 files to the configured
   * root without it.
   *
   * A list of ten route names here would be a second declaration of the contract with nothing
   * making the two agree — the defect this repository keeps finding, and the reason the comment
   * above was wrong about five endpoints for months. So the sentence `GET /api` publishes IS the
   * list, in both directions: what says it takes no body must refuse one, and what refuses one must
   * say so. A route added later is covered without this file being edited.
   */
  describe('the sentence about a body and the behaviour agree, in both directions', () => {
    /**
     * Endpoints whose published description says, in words, that they take no body.
     *
     * "TAKES NO BODY", NOT "NO BODY". The looser pattern also matched `PUT /api/anchor`, whose
     * sentence is "No body NEEDED" — it takes an optional one — and that route passed only because
     * its schema happens to reject unknown keys anyway. A pin that is right by accident is not a pin,
     * and the next optional-body route to publish a similar phrase would have been asserted to
     * refuse what it is built to accept.
     */
    function saysNoBody(): { method: HttpMethod; path: string }[] {
      return index.endpoints
        .filter((e) => e.method !== 'GET' && /takes no body/i.test(e.description ?? ''))
        .map((e) => ({ method: asMethod(e.method, key(e)), path: e.path }))
    }

    /**
     * Send a key no endpoint declares — in the BODY and in the QUERY STRING — and say whether both
     * were refused naming it.
     *
     * BOTH, BECAUSE THE FIRST VERSION OF THIS TEST CHECKED ONE AND THE INCIDENT SURVIVED IN THE
     * OTHER. Hours after the body half shipped, an agent asked to break it sent
     * `POST /api/import?dryRun=true` and got a 200 with `applied: true` — the destructive import
     * running under a request whose entire content asked it not to, which is word for word the thing
     * the body fix was written to stop. A guard on one of two doors, with a note saying the door is
     * shut, is worse than no guard: the next person reads the note.
     */
    async function refusesNonsense(endpoint: { method: HttpMethod; path: string }): Promise<boolean> {
      const url = endpoint.path.replace(/:[^/]+/g, 'no-body-probe')
      const headers = { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
      const inBody = await app.inject({ method: endpoint.method, url, headers, payload: JSON.stringify({ totalNonsense: 42 }) })
      const inQuery = await app.inject({ method: endpoint.method, url: `${url}?totalNonsense=42`, headers })
      const refused = (r: { statusCode: number; body: string }) => r.statusCode === 400 && r.body.includes('totalNonsense')
      return refused(inBody) && refused(inQuery)
    }

    it('refuses a body on every endpoint that publishes that it takes none', async () => {
      const took: string[] = []
      for (const endpoint of saysNoBody()) {
        if (!(await refusesNonsense(endpoint))) took.push(`${endpoint.method} ${endpoint.path}`)
      }
      expect(
        took,
        'these endpoints publish that they take no body and accepted one, in the body or in the query string. ' +
          'A key an endpoint does not read is a caller believing something about it that is not true, and ' +
          'answering 200 confirms it — which is how a destructive import ran under {"dryRun":true}, and then ' +
          'again under ?dryRun=true after the body half was fixed.',
      ).toEqual([])
      // The loop had something to iterate. An empty list would make the assertion vacuous. ELEVEN is
      // what was measured on 2026-08-12 — the first count said ten and missed
      // `POST /api/source/reindex`, which publishes the sentence and had been refusing bodies longer
      // than any of them. It is a floor rather than the count, so a twelfth needs no edit here.
      expect(saysNoBody().length).toBeGreaterThanOrEqual(11)
    }, A_TEST_THAT_STARTS_SOMETHING)

    it('does not refuse a body on an endpoint that never said it would', async () => {
      // The other direction, which is what stops the fix being applied by reflex to a route that
      // takes a body: a caller reading GET /api must be able to trust the sentence either way.
      const quiet = index.endpoints
        .filter((e) => e.method !== 'GET' && !/takes no body/i.test(e.description ?? ''))
        .map((e) => ({ method: asMethod(e.method, key(e)), path: e.path }))
      const surprising: string[] = []
      for (const endpoint of quiet) {
        const reply = await app.inject({
          method: endpoint.method,
          url: endpoint.path.replace(/:[^/]+/g, 'no-body-probe'),
          headers: { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
          payload: JSON.stringify({ totalNonsense: 42 }),
        })
        if (reply.body.includes('takes no body')) surprising.push(`${endpoint.method} ${endpoint.path}`)
      }
      expect(surprising, 'these endpoints refused a body with "takes no body" and do not publish that').toEqual([])
    }, A_TEST_THAT_STARTS_SOMETHING)
  })

  it('still refuses a body that IS there and is broken, which is a different answer', async () => {
    // The half this must not lose. "There is no body" and "there is a body and it is not JSON" are
    // different facts about the request, and collapsing them would turn a typo into a silence.
    const reply = await app.inject({
      method: 'PUT',
      url: '/api/presentation/structure',
      headers: { 'content-type': 'application/json' },
      payload: '{"intent": ',
    })
    expect(reply.statusCode).toBe(400)
    expect(reply.body).not.toContain(FASTIFY_EMPTY)
  })

  it('treats a body of nothing but whitespace as no body, not as broken JSON', () => {
    // A proxy or a shell that appends a newline has still sent nothing. Telling that caller its
    // JSON is malformed would send it hunting for a typo it did not make.
    return app
      .inject({
        method: 'DELETE',
        url: '/api/presentation/structure',
        headers: { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
        payload: '\n  \n',
      })
      .then((reply) => {
        expect(reply.statusCode).toBe(200)
      })
  })
})

// ============================================================================ the health route

/**
 * `GET /api/health` is the one endpoint buildApp declares itself, and its interesting half had
 * never been tested through a server: four test files each wrote their own one-line stand-in
 * returning `{ ok: true, records: N }`, so deleting the deleted-database warning from the real
 * route failed nothing.
 *
 * That warning is the top entry in troubleshooting.md. An orphaned server holding a deleted
 * database answers every other request perfectly, which is how it once produced a written-down
 * diagnosis that was wrong.
 */
describe('the health route', () => {
  it('says the database is reachable and how much is in it', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/health' })
    expect(reply.statusCode).toBe(200)
    const body = JSON.parse(reply.body) as { ok: boolean; records: number; database?: string }
    expect(body.ok).toBe(true)
    expect(typeof body.records).toBe('number')
    // Absent while everything is normal, so a caller only ever sees it when it means something.
    expect('database' in body).toBe(false)
  })

  it('says so when the file it is serving has been deleted out from under it', async () => {
    // The database this app is holding is t.file. Removing it leaves the server answering out of
    // an inode nobody else can reach — which is exactly the incident, reproduced.
    rmSync(t.file, { force: true })
    try {
      const reply = await app.inject({ method: 'GET', url: '/api/health' })
      expect(reply.statusCode).toBe(200)
      const body = JSON.parse(reply.body) as { ok: boolean; records: number; database?: string }
      expect(body.ok).toBe(true)
      expect(String(body.database)).toContain('DELETED')
      // It has to say what to do, not only that something is wrong.
      expect(String(body.database)).toContain('process GROUP')
    } finally {
      // Put the file back so afterAll's close() and the temp-directory removal behave normally.
      // SQLite is still holding the old inode either way; this is tidiness, not repair.
      writeFileSync(t.file, '')
    }
  })
})

// ============================================================================ the browser app

/**
 * The production branch, which nothing had ever run.
 *
 * In production this process also serves the built browser app, and any address that is not an
 * /api path has to come back as the app itself so that reloading on /r/abc123 works. In
 * development it must NOT do that: Vite serves the app, and a lost caller has to be told where.
 *
 * Both are built against a directory this test creates, so neither depends on `npm run build`
 * having been run on this machine. A test that asserted `dist/` exists is already a known
 * fresh-clone failure in this repository.
 */
describe('what a non-API address gets', () => {
  it('in development, is told where the browser app actually is', async () => {
    const reply = await app.inject({ method: 'GET', url: '/r/abc123' })
    expect(reply.statusCode).toBe(404)
    const body = JSON.parse(reply.body) as { error: string }
    // The port comes from the setting, not from a number typed into the sentence: somebody who
    // moved Vite off 5173 used to be sent to a dead address by the only process that knew better.
    expect(body.error).toContain('http://localhost:5173')
  })

  it('in production, is the browser app, while an unknown /api path stays a listed 404', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mole-office-web-'))
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Mole Office</title>')
    const built = await server.buildApp({
      production: true,
      webDir: dir,
      webAppUrl: 'http://localhost:5173',
      logLevel: false,
    })
    try {
      await built.app.ready()

      const page = await built.app.inject({ method: 'GET', url: '/r/abc123' })
      expect(page.statusCode).toBe(200)
      expect(page.headers['content-type']).toContain('text/html')
      expect(page.body).toContain('Mole Office')

      // The catch-all must not swallow the API's own 404, or a mistyped endpoint would come back
      // as a web page and the family list — the thing that turns three dead ends into one
      // request — would never be seen.
      const api = await built.app.inject({ method: 'GET', url: '/api/records-but-misspelt' })
      expect(api.statusCode).toBe(404)
      expect((JSON.parse(api.body) as { families: unknown[] }).families.length).toBeGreaterThan(1)
    } finally {
      await built.app.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('refuses to start in production with no built app, rather than serving an empty site', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mole-office-web-empty-'))
    try {
      await expect(
        server.buildApp({
          production: true,
          webDir: dir,
          webAppUrl: 'http://localhost:5173',
          logLevel: false,
        }),
      ).rejects.toThrow('npm run build')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
