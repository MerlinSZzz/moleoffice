// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT `GET /api/access` PUBLISHES AS REFUSED IS WHAT THE SERVER ACTUALLY REFUSES.
 *
 * ---------------------------------------------------------------------------------------
 * THE FAILURE THIS FILE EXISTS AGAINST, IN ONE SENTENCE
 * ---------------------------------------------------------------------------------------
 *
 * `design/round-ten/design/remote-access.md` §9.3's rule is that a control a caller may not use is
 * NOT DRAWN, rather than drawn and then refused, and `docs/UX-CONTRACT.md` forbids the third
 * option. That rule makes the browser act on a list the server publishes. So a list that names an
 * act the server does not refuse hides a control that works, and a list that misses an act the
 * server does refuse draws one that 403s. Both are the browser and the server disagreeing inside
 * the one reading whose whole purpose is to stop them disagreeing.
 *
 * §8.5 asks for exactly this test: *"one test binds the published list to the enforcement, because
 * a list and a rule can still disagree."*
 *
 * ---------------------------------------------------------------------------------------
 * HOW THE GUARD HALF IS BOUND, AND WHY IT IS THE SOURCE AND NOT A LABEL
 * ---------------------------------------------------------------------------------------
 *
 * `GOVERNANCE_GUARDS` holds every exported `assertMay` function under `src/server/lib/` — the sweep
 * in `tests/guard-registry.test.ts` makes that true — and each entry now carries `actKey`, which is
 * non-null exactly when that act is published as refused from another machine.
 *
 * A label nobody checks is worth nothing, so this file READS THE SOURCE of each guard and asks
 * whether its body tests `actor.from`. A key on a guard with no arrival clause fails here; an
 * arrival clause on a guard with no key fails here too. The registry cannot drift from the code in
 * either direction without a red test naming the guard.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE ACTS THEMSELVES ARE DRIVEN, NOT ONLY COUNTED
 * ---------------------------------------------------------------------------------------
 *
 * A source scan proves a clause is written, not that it fires.
 * `tests/governance-from-another-machine.test.ts` drives every one of these acts over a real socket
 * from a real second listener and reads the 403. The last describe below asserts that every
 * published guard act has a case in that file, by name, so an act that gains a key without gaining
 * a case is red on the day the key is written.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { ApiRoute } from '../src/server/api/kinds.ts'
import { actsRefusedFromAnotherMachine } from '../src/server/lib/authority.ts'
import { WHY_REFUSED, WHY_REFUSED_MEANS } from '../src/shared/authority.ts'
import type { GovernanceGuard } from '../src/server/lib/records.ts'

const LIB = fileURLToPath(new URL('../src/server/lib/', import.meta.url))

/**
 * THE CLAUSE, AS IT IS WRITTEN IN THE CODE.
 *
 * One string, matched against a guard's own source. It is `actor.from` and not the whole comparison
 * so that a guard which reads the arrival some other correct way — a helper, a different word — is
 * still found; what is being asked is *does this guard consider which machine asked at all*.
 */
const READS_THE_ARRIVAL = 'actor.from'

/** Every TypeScript file under lib/, including subdirectories. */
function everyFileUnder(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...everyFileUnder(path))
    else if (entry.name.endsWith('.ts')) found.push(path)
  }
  return found.sort()
}

/**
 * The source of one exported function, from its `export function <name>(` to the next top-level
 * `export`, or to the end of the file.
 *
 * Crude on purpose and checked rather than trusted: the test below asserts a body was found for
 * every registered guard and that each one is more than a signature, so a parser that started
 * matching nothing would fail loudly instead of reporting every guard as clean.
 */
function sourceOfExportedFunction(name: string): { where: string; body: string } | null {
  for (const file of everyFileUnder(LIB)) {
    const text = readFileSync(file, 'utf8')
    const start = text.indexOf(`export function ${name}(`)
    if (start === -1) continue
    const after = text.indexOf('\nexport ', start + 1)
    return {
      where: file.slice(file.indexOf('src/') === -1 ? 0 : file.indexOf('src/')),
      body: after === -1 ? text.slice(start) : text.slice(start, after),
    }
  }
  return null
}

let t: TestDb
let app: FastifyInstance
let routes: readonly ApiRoute[]
let registry: readonly GovernanceGuard[]

beforeAll(async () => {
  // A throwaway database first: importing lib/records.ts opens whatever MOLE_OFFICE_DB names.
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  routes = built.listApiRoutes()
  registry = (await import('../src/server/lib/records.ts')).GOVERNANCE_GUARDS
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the guard registry says which acts are refused for where they were asked from', () => {
  it('finds the source of every registered guard, so the scan below is reading something', () => {
    const missing = registry
      .map((entry) => ({ name: entry.guard.name, found: sourceOfExportedFunction(entry.guard.name) }))
      .filter((one) => one.found === null || one.found.body.length < 200)
    expect(missing.map((one) => one.name)).toEqual([])
  })

  it('gives an act key to exactly the guards whose own body asks which machine asked', () => {
    const disagreeing = registry
      .map((entry) => {
        const found = sourceOfExportedFunction(entry.guard.name)
        const reads = found !== null && found.body.includes(READS_THE_ARRIVAL)
        return { name: entry.guard.name, key: entry.actKey, reads }
      })
      .filter((one) => (one.key === null) === one.reads)
    expect(
      disagreeing.map(
        (one) =>
          `${one.name}: actKey ${one.key === null ? 'null' : `"${one.key}"`} but its body ` +
          `${one.reads ? 'DOES' : 'does NOT'} read ${READS_THE_ARRIVAL}`,
      ),
    ).toEqual([])
  })

  it('finds at least one of each, so neither half of the rule above is vacuous', () => {
    expect(registry.filter((one) => one.actKey !== null).length).toBeGreaterThan(0)
    expect(registry.filter((one) => one.actKey === null).length).toBeGreaterThan(0)
  })

  it('gives every act key a route to perform it at', () => {
    const empty = registry.filter((one) => one.actKey !== null && one.route.trim() === '')
    expect(empty.map((one) => one.guard.name)).toEqual([])
  })
})

describe('the published list, over the real route table and the real registry', () => {
  it('names one act per local route and one per keyed guard, and nothing else', () => {
    const published = actsRefusedFromAnotherMachine({ routes, guards: registry })
    const fromRoutes = new Set(routes.filter((one) => one.reach === 'local').map((one) => one.operation))
    const fromGuards = new Set(
      registry.flatMap((one) => (one.actKey === null ? [] : [one.actKey])),
    )
    const expected = [...new Set([...fromRoutes, ...fromGuards])].sort()
    expect(published.map((one) => one.act).sort()).toEqual(expected)
  })

  it('never names an act only remote routes perform', () => {
    const published = actsRefusedFromAnotherMachine({ routes, guards: registry })
    // Every route an entry names must really exist, and must really be local or a guard's own.
    const live = new Set(routes.map((one) => `${one.method} ${one.path}`))
    const unknown = published.flatMap((one) => one.routes.filter((r) => !live.has(r)))
    expect(unknown).toEqual([])
  })

  it('carries the routes for the one operation that is local on some routes and remote on others', () => {
    // MEASURED, and it is the reason an entry names its routes at all. `plan.write` is declared on
    // two local routes -- committing an intent, applying a proposal -- and on every ordinary plan
    // write besides. An entry publishing the operation alone would have a remote browser hide all
    // of them.
    const shared = routes.filter((one) => one.operation === 'plan.write')
    expect(shared.filter((one) => one.reach === 'local').length).toBeGreaterThan(0)
    expect(shared.filter((one) => one.reach === 'remote').length).toBeGreaterThan(0)

    const published = actsRefusedFromAnotherMachine({ routes, guards: registry })
    const entry = published.find((one) => one.act === 'plan.write')
    expect(entry, 'plan.write is not published at all').toBeDefined()
    expect(entry?.routes.sort()).toEqual(
      shared
        .filter((one) => one.reach === 'local')
        .map((one) => `${one.method} ${one.path}`)
        .sort(),
    )
  })

  it('gives every published act one of the three reasons, and a sentence for it', () => {
    const published = actsRefusedFromAnotherMachine({ routes, guards: registry })
    expect(published.length).toBeGreaterThan(0)
    for (const one of published) {
      expect(WHY_REFUSED, `${one.act} has reason ${one.because}`).toContain(one.because)
      expect(WHY_REFUSED_MEANS[one.because].length).toBeGreaterThan(20)
      expect(one.routes.length, `${one.act} names no route`).toBeGreaterThan(0)
      // AND WORDS A PERSON COULD READ, because the refusal a caller meets starts with them and
      // `plan.write` is not what anybody was trying to do.
      expect(one.inWords.trim().length, `${one.act} has no words`).toBeGreaterThan(8)
      expect(one.inWords, `${one.act} published its key as its words`).not.toBe(one.act)
    }
  })

  it('calls an act the person’s own when both sources reach it, rather than the smaller truth', () => {
    // `plan.commit` is a guard entry AND its route is local. The two mechanisms cover it twice on
    // purpose, and a reader told only "this works on the computer Mole Office runs on" about an act
    // reserved to them has been told the weaker of the two facts.
    const published = actsRefusedFromAnotherMachine({
      routes: [
        {
          method: 'POST',
          path: '/api/planning/intents/:id/commit',
          operation: 'plan.write',
          reach: 'local',
          keptHere: { because: 'acts-on-this-machine', act: 'Writing something onto the calendar' },
        },
      ],
      guards: [
        {
          actKey: 'plan.write',
          act: 'turn words about time into hours on the calendar',
          route: 'POST /api/planning/intents/:id/commit',
        },
      ],
    })
    expect(published).toEqual([
      {
        act: 'plan.write',
        // The registry's words go with the registry's reason: taking one and not the other would
        // leave a sentence that argued with itself.
        inWords: 'turn words about time into hours on the calendar',
        because: 'reserved-to-the-owner',
        routes: ['POST /api/planning/intents/:id/commit'],
      },
    ])
  })

  it('refuses to publish a local route that carries no reason, rather than guessing one', () => {
    expect(() =>
      actsRefusedFromAnotherMachine({
        routes: [{ method: 'POST', path: '/api/nowhere', operation: 'record.list', reach: 'local' }],
        guards: [],
      }),
    ).toThrow(/says neither why nor what the act is/)
  })
})

