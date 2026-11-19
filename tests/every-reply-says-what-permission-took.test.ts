// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY ANSWER SAYS WHETHER PERMISSION NARROWED IT, AND TODAY EVERY ONE OF THEM SAYS `null`.
 *
 * ---------------------------------------------------------------------------------------
 * THE CLAIM, AND IT IS NARROWER THAN IT SOUNDS
 * ---------------------------------------------------------------------------------------
 *
 * `design/round-ten/design/projections.md` §7.2: *a reply may be narrowed by what the caller asked
 * for, by a size budget, or by permission — and by nothing else. Every narrowing is declared in the
 * same reply, as structure.* Selection and budget already have somewhere to be declared. Permission
 * did not, because until a caller can have less permission than another nothing narrows.
 *
 * So what is claimed here is NOT that anything is narrowed by permission. Nothing is: context scope
 * in this phase has one value — another machine may work in every project — and every reply in the
 * product says `null`. What is claimed is that the FIELD IS THERE, on every answer, from this
 * commit, so a reader that has learnt to check it finds it everywhere on the day one route starts
 * saying something else. A field added route by route later is the same promise with one hundred and
 * forty-four chances to forget and nothing that notices.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS DRIVEN AND NOT READ OFF THE HOOK
 * ---------------------------------------------------------------------------------------
 *
 * A hook that adds a key proves nothing on its own: Fastify strips properties a route's response
 * schema does not declare, so a hook can add a field that never reaches the wire. These cases drive
 * the REGISTERED ROUTE TABLE — every GET route that takes no path parameter — through `app.inject`
 * and read the bytes that came back.
 *
 * MUTATION: take `sayWhetherPermissionNarrowedIt(app)` out of `buildApp`. The first case goes red
 * and names every route that stopped saying.
 *
 * ---------------------------------------------------------------------------------------
 * THE SWEEP ASKS NOTHING OUTSIDE THIS PROCESS THAT IT DOES NOT NEED
 * ---------------------------------------------------------------------------------------
 *
 * Problem: this case was the file named red most often in the merge queue. It went red 22 times in
 * three days with "Test timed out in 5000ms", and it went red alone at load average 13 on
 * 9 October 2026. The sweep makes 164 requests in one case. Measured that day, three of them did
 * most of the work outside the process:
 *   - GET /api/office/keys ran `codex login status` and `opencode auth list` with spawnSync.
 *     That took about 780 ms every time and blocked the event loop.
 *   - GET /api/harnesses ran each agent tool with `--version` and fetched npmjs.org and pypi.org.
 *     The fetch timeout is 5 s, which is the whole budget of this case.
 *   - GET /api/where-you-stand ran `systemctl show`, about 650 ms. That call has no seam, so it stays.
 * What this file claims is that the field reaches the bytes. It does not claim anything about what an
 * agent tool says or which version a registry publishes. So the first two routes are answered here
 * without starting a program or reaching the network:
 *   - The probe is the real Linux probe without its two optional reads that start a program. The
 *     product then answers "nobody has looked" for itself, as it does for any probe without them.
 *   - The registry is the stand-in in tests/harness-stand-ins.ts, as src/config/settings.mjs asks
 *     of every test. Starting that server is a starter word in tests/how-long-a-test-may-take.ts,
 *     so this file now has the long budget, because it really does start a server.
 * Each route still runs through its real handler, its response schema and the real hook. The set of
 * paths is the registered table, as before.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { aStandInRegistry, type StandInRegistry } from './harness-stand-ins.ts'
import type { ApiRoute } from '../src/server/api/kinds.ts'
import { NARROWED_BY_PERMISSION, checkSubtraction, type LeftOutGroup } from '../src/shared/disclosure.ts'
import { route } from '../src/server/lib/route.ts'

let t: TestDb
let app: FastifyInstance
let routes: readonly ApiRoute[]
let registry: StandInRegistry
let resources: typeof import('../src/server/lib/resources.ts')
const registryWas = process.env['MOLE_OFFICE_HARNESS_REGISTRY']

beforeAll(async () => {
  t = await freshDb()
  // After freshDb, which resets the modules, so this is the instance the app reads.
  resources = await import('../src/server/lib/resources.ts')
  const quiet = Object.create(resources.LINUX_PROBE) as typeof resources.LINUX_PROBE
  Object.assign(quiet, { whatAnAgentToolSaysAboutItsKey: undefined, theVersionOfAProgram: undefined })
  resources.useOsProbe(quiet)
  registry = await aStandInRegistry()
  process.env['MOLE_OFFICE_HARNESS_REGISTRY'] = registry.at
  const built = await apiApp()
  app = built.app
  await app.ready()
  routes = built.listApiRoutes()
})

afterAll(async () => {
  await app.close()
  await registry.close()
  if (registryWas === undefined) delete process.env['MOLE_OFFICE_HARNESS_REGISTRY']
  else process.env['MOLE_OFFICE_HARNESS_REGISTRY'] = registryWas
  resources.useOsProbe(resources.LINUX_PROBE)
  t.close()
})

/**
 * Every GET route that can be called with no path parameter and no set-up.
 *
 * A route with `:id` in it needs a record that exists, and inventing one per route would be a
 * fixture the size of the product. What is left is a broad sweep over the reads a browser makes on
 * arrival, which is the population this claim is about.
 */
function everyPlainGet(): string[] {
  return routes
    .filter((one) => one.method === 'GET' && !one.path.includes(':'))
    // A ROUTE THE SERVER HOLDS OPEN NEVER FINISHES A REPLY, so injecting one and reading its body
    // would wait for ever. It says so about itself — `waits` on its own declaration, published on
    // GET /api — and it answers a stream of events rather than an object, which is outside what this
    // claim is about. tests/the-channel.test.ts is where such a route is exercised.
    .filter((one) => one.waits !== true)
    .map((one) => one.path)
    .sort()
}

describe('the field is on the bytes, not only in a hook', () => {
  it('answers a broad sweep of reads, so the assertion below is over something', () => {
    expect(everyPlainGet().length).toBeGreaterThan(15)
  })

  it('says whether permission narrowed it, on every plain read that answers an object', async () => {
    const silent: string[] = []
    for (const path of everyPlainGet()) {
      const res = await app.inject({ method: 'GET', url: path, headers: { 'x-mole-office-workspace': 'default' } })
      if (res.statusCode >= 400) continue
      let body: unknown
      try {
        body = res.json()
      } catch {
        // Not JSON at all — a route that answers bytes or text is outside this claim.
        continue
      }
      if (body === null || typeof body !== 'object' || Array.isArray(body)) continue
      if (!(NARROWED_BY_PERMISSION in body)) silent.push(`GET ${path}`)
    }
    expect(silent).toEqual([])
    // THE STAND-IN WAS THE REGISTRY ASKED. If the setting stopped reaching the route, the sweep
    // would go back to npmjs.org and pypi.org without a word, so this says so.
    expect(registry.asked, 'GET /api/harnesses did not ask the stand-in registry').not.toEqual([])
  })

  it('says null, which means Mole Office looked and permission took nothing off it', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.json()).toMatchObject({ [NARROWED_BY_PERMISSION]: null })
  })

  it('leaves an array reply as an array, because an array has nowhere to say', async () => {
    // There is nowhere on an array to put a field, and wrapping one would change that route's shape
    // for a value that is null. Absence on an array is honest: a reader concludes nothing from it.
    //
    // THE CASE BRINGS ITS OWN ROUTE, BECAUSE THE SWEEP ABOVE FINDS NO ARRAY REPLY. Measured on
    // 3 September 2026: every plain GET in the registered table answers an object, so a version of
    // this written as "find one and check it" was a loop over an empty list and could not fail —
    // which is what it was, and what this replaces. The route below is registered on a throwaway
    // app so the REAL hook runs over it, the same way the last case in this file does it.
    //
    // IT IS READ OFF THE BYTES THAT WENT OUT. A property written onto an array object never
    // survives `JSON.stringify`, so a hook that did that would be invisible on the wire. What would
    // not be invisible is the hook WRAPPING the array — `{rows: [...]}` with the field beside it —
    // because every caller of that route would then read an object with no rows in it.
    const built = await apiApp()
    const spare = built.app
    spare.get('/api/a-reply-that-is-a-list', route('record.list', 'remote'), async () => ['a', 'b', 'c'])
    await spare.ready()
    const res = await spare.inject({ method: 'GET', url: '/api/a-reply-that-is-a-list' })
    expect(res.statusCode).toBe(200)
    expect(res.body.trimStart().startsWith('['), `the array reply came back as ${res.body}`).toBe(true)
    expect(res.body, 'the field was put on a reply that has nowhere to carry it').not.toContain(
      NARROWED_BY_PERMISSION,
    )
    expect(res.json()).toEqual(['a', 'b', 'c'])
    await spare.close()
  })
})

describe('what it deliberately does not say it about', () => {
  it('leaves a refusal alone, because no answer was narrowed when there was no answer', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/records/there-is-no-such-record' })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(NARROWED_BY_PERMISSION in (res.json() as object)).toBe(false)
  })

  it('leaves a reply that already said alone, so the day a real narrowing lands the handler wins', async () => {
    // A route of this test's own, registered on a throwaway app, that computes its own narrowing.
    // The hook fills in absence and never overwrites: a handler that has done the arithmetic is the
    // one that knows what was withheld.
    const withheld: LeftOutGroup<'not_yours'>[] = [
      { cause: 'permission', bucket: 'not_yours', count: 2, ids: null },
    ]
    // The shape is the one every subtraction in the product uses, and it passes the one check they
    // all call -- so a narrowed reply is not a second shape invented here.
    checkSubtraction('this test', { candidates: 5, carried: 3, leftOut: 2, shortened: 0 }, withheld)

    const built = await apiApp()
    const spare = built.app
    spare.get('/api/a-reply-that-already-said', route('record.list', 'remote'), async () => ({
      rows: ['a', 'b', 'c'],
      [NARROWED_BY_PERMISSION]: withheld,
    }))
    await spare.ready()
    const res = await spare.inject({ method: 'GET', url: '/api/a-reply-that-already-said' })
    expect(res.json()).toMatchObject({
      [NARROWED_BY_PERMISSION]: [{ cause: 'permission', bucket: 'not_yours', count: 2, ids: null }],
    })
    await spare.close()
  })
})
