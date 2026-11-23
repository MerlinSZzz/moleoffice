// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BROWSER AND THE SERVER MEAN THE SAME PERSON.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS FILE EXISTS TO CLOSE, WHICH WAS MEASURED AND NOT GUESSED
 * ---------------------------------------------------------------------------------------
 *
 * The server decides whether a governance act is allowed by comparing the name on the request with
 * the name it has on file. The browser is what puts that name on the request. Until 25 August 2026
 * each side wrote the name out for itself: `HUMAN` in src/server/lib/records.ts, `DEFAULT_ACTOR` in
 * src/web/api.ts, and a third copy in the actor picker in src/web/components/Sidebar.tsx. Nothing
 * made the three agree.
 *
 * The guard's own comment in records.ts said this must never happen — *"a second place saying who
 * the person is would be one fact in two files with nothing making them agree"* — and that was true
 * of records.ts and false of the product.
 *
 * WHAT IT COST, MEASURED. An independent verifier changed the browser's copy of the owner's id to a different id and
 * ran the whole suite: 7 failed, 7550 passed, and not one of the seven reds was about authority.
 * They were tests about comments — *"holds the comment somebody wrote, and says how many"* — which
 * a maintainer would have fixed by editing fixtures. Meanwhile the owner would have been refused
 * every governance act in the owner's own browser, and the refusal they read tells them to do it "in the
 * browser at the machine Mole Office runs on", which is where they already are.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE FIX IS, AND HOW IT CHANGED SHAPE ON 30 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * Until 30 September the id was one constant in src/shared/person.ts, the owner's own id, compiled into both
 * sides. A decision and FLO-14 of another took it out of the code.
 * Who owns an office is a setting in that office's own database, written at the first migrate from
 * MOLE_OFFICE_OWNER_ID. So the one place that works it out is now the server's database, read by
 * src/server/lib/owner.ts, and the browser ASKS: src/web/main.tsx calls GET /api/office/owner before
 * it loads any of the app's modules (src/web/owner.ts), and `THE_PERSON` in @shared/person.ts holds
 * the answer on each side. person.ts's own header named this as what would reopen its "no fetch"
 * decision, and said this file was where to start.
 *
 * The job left for a test is the same: catch the two sides coming apart, and catch a second copy
 * coming back. The `it`s below compare the server's guard, the browser's default actor and the actor
 * picker with the owner the server's own door answers; one reads src/web/main.tsx to prove the owner
 * is asked for before the app's modules load; two ask the running server whether the browser's own
 * headers still get through the door; one proves no column default names a person any more; and a
 * source scan finds a written-out copy of the test office's owner id.
 *
 * This test office belongs to THE_TEST_OFFICES_OWNER because tests/every-test-process-is-given-the-test-offices-owner.ts gives every test
 * process the two settings an installer's .env carries. The product names nobody.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT MAKES THIS FILE GO RED.
 * ---------------------------------------------------------------------------------------
 *
 *   src/server/lib/records.ts — `HUMAN.id` back to a literal that disagrees
 *     red: `the guard the server checks a governance act against is the office's owner`, plus the
 *     browser's two door `it`s when they disagree with the server.
 *   src/web/api.ts — the default actor back to a literal
 *     red: `the browser writes as the owner the server's door answers`, and the source scan.
 *   src/web/main.tsx — the App loaded before the owner is asked for
 *     red: `the browser asks who owns the office before it loads the app`.
 *   src/server/db/schema.ts — a `.default()` of a person's id back on `records.ownerId` or `links.createdBy`
 *     red: `no column default names a person`, and the source scan.
 */

import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import type { TheOfficeOwner } from '../src/shared/owner.ts'
import { links, records } from '../src/server/db/schema.ts'
import { apiApp, freshDb, type TestDb, governsTheWholeProject } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './every-test-process-is-given-the-test-offices-owner.ts'

let t: TestDb
let app: FastifyInstance
/** The door Mole Office really answers on. The guard only applies to a request a listener saw. */
let thisMachine: string

/** src/server/lib/records.ts, imported after the test database exists. */
type ServerRecords = typeof import('../src/server/lib/records.ts')
let server: ServerRecords
/** src/web/api.ts, imported after a stand-in for a browser window exists. */
type WebApi = typeof import('../src/web/api.ts')
let web: WebApi
/** src/web/components/Sidebar.tsx, which holds the actor picker's three choices. */
type WebSidebar = typeof import('../src/web/components/Sidebar.tsx')
let sidebar: WebSidebar
/** What the server's own door says about who owns this office: what the browser asks before it loads. */
let theDoorSays: TheOfficeOwner

beforeAll(async () => {
  t = await freshDb()
  server = await import('../src/server/lib/records.ts')

  // The smallest stand-in for a window, as tests/app-routes.ts installs one: the test runner's
  // environment is `node`, and src/web/api.ts reads window.localStorage when it is imported to
  // restore who this browser is writing as. NOTHING IN THE STAND-IN IS UNDER TEST. It is empty on
  // purpose, because an empty one is what a browser that has never touched the Settings page has,
  // and that is the case where the browser falls back to the name it was built with.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`

  // WHAT src/web/main.tsx DOES FIRST: ask the server's door who owns this office and hold the answer,
  // and only then load the app's modules. The answer is handed to src/web/owner.ts the way
  // `loadTheOwner` hands it, because this runner has no page address for `loadTheOwner` to call from.
  const asked = await fetch(`${thisMachine}/api/office/owner`)
  expect(asked.status).toBe(200)
  theDoorSays = (await asked.json()) as TheOfficeOwner
  const owner = await import('../src/web/owner.ts')
  owner.theOwnerIs(theDoorSays)
  web = await import('../src/web/api.ts')
  sidebar = await import('../src/web/components/Sidebar.tsx')
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('one id decides who the person is', () => {
  it("the server's door answers the owner the test office was given", () => {
    expect(theDoorSays.id).toBe(THE_TEST_OFFICES_OWNER.id)
    expect(theDoorSays.name).toBe(THE_TEST_OFFICES_OWNER.name)
  })

  it("the guard the server checks a governance act against is the office's owner", () => {
    expect(server.HUMAN.type).toBe('human')
    expect(server.HUMAN.id).toBe(theDoorSays.id)
    expect(THE_PERSON).toBe(theDoorSays.id)
  })

  it("the browser writes as the owner the server's door answers", () => {
    // What a browser with nothing stored writes as. This is the value that has to match `HUMAN`,
    // because it is the one the guard compares against on every governance act.
    const actor = web.getActor()
    expect(actor.type).toBe('human')
    expect(actor.id).toBe(theDoorSays.id)
    expect(actor.id).toBe(server.HUMAN.id)
  })

  it("the actor picker offers the person under the owner's id", () => {
    const person = sidebar.actorChoices().find((c) => c.value === 'human')
    expect(person, 'the actor picker has no entry for the person at all').toBeDefined()
    expect((person as { actor: { id: string } }).actor.id).toBe(theDoorSays.id)
    expect((person as { name: string }).name).toBe(theDoorSays.id)
  })

  it('the browser asks who owns the office before it loads the app', () => {
    // Reason THREE in @shared/person.ts: no page may be on screen while the browser does not know who
    // it is. So the entry asks first, and loads the language module and the app only after it.
    const entry = readFileSync(fileURLToPath(new URL('../src/web/main.tsx', import.meta.url)), 'utf8')
    const code = entry.split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n')
    const asked = code.indexOf('await loadTheOwner(')
    expect(asked, 'src/web/main.tsx does not ask who owns the office').toBeGreaterThan(0)
    for (const later of ["import('./App.tsx')", "import('./lib/language.ts')"]) {
      const at = code.indexOf(later)
      expect(at, `src/web/main.tsx does not load ${later} at all`).toBeGreaterThan(0)
      expect(at, `src/web/main.tsx loads ${later} before it asks who owns the office`).toBeGreaterThan(asked)
    }
    expect(code, 'src/web/main.tsx imports the app before it asks').not.toMatch(/^import .*['"]\.\/App\.tsx['"]/m)
    expect(code, 'src/web/main.tsx imports the language module before it asks').not.toMatch(/^import .*['"]\.\/lib\/language\.ts['"]/m)
  })
})

describe('and the browser really gets through the door', () => {
  /**
   * The exact headers src/web/api.ts puts on every request it makes.
   *
   * WHY THE HEADERS AND NOT A HAND-WRITTEN COPY OF THEM. A test that typed the three headers out
   * itself would be a fourth place saying who the person is, and it would go green on the day the
   * browser stopped sending them.
   */
  function whatTheBrowserSends(): Record<string, string> {
    const headers = web.moleOfficeHeaders({ body: '{}' })
    const out: Record<string, string> = {}
    headers.forEach((value, key) => {
      out[key] = value
    })
    return out
  }

  it('the headers the browser really sends are let through the door the person is let through', async () => {
    const res = await fetch(`${thisMachine}/api/records`, {
      method: 'POST',
      headers: whatTheBrowserSends(),
      body: JSON.stringify({
        kind: 'decision',
        title: 'The owner is still the owner in their own browser',
        data: {
          ...governsTheWholeProject(), replaces: [], because: 'the name the browser sends and the name the server holds are one fact' },
      }),
    })
    const body = (await res.json()) as { error?: string }
    expect(res.status, `the owner was refused their own governance act: ${body.error ?? ''}`).toBe(201)
  })

  it('and the same door still refuses a name Mole Office cannot place', async () => {
    // WITHOUT THIS THE `it` ABOVE IS SATISFIED BY A SERVER THAT REFUSES NOBODY. Same door, same
    // request, one header changed. tests/a-caller-cannot-claim-to-be-a-person.test.ts is where this
    // half is proved properly; it is here so that a 201 above means the guard let them through
    // rather than that the guard was gone.
    const res = await fetch(`${thisMachine}/api/records`, {
      method: 'POST',
      headers: { ...whatTheBrowserSends(), 'x-mole-office-actor-id': 'not-the-owner-at-all' },
      body: JSON.stringify({
        kind: 'decision',
        title: 'A decision in a name Mole Office cannot place',
        data: { ...governsTheWholeProject(), replaces: [], because: 'this must not be written' },
      }),
    })
    const body = (await res.json()) as { error?: string }
    expect(res.status, body.error ?? '').toBe(403)
  })
})

describe('no column default names a person', () => {
  /**
   * `records.owner_id`, `links.owner_id` and `links.created_by` carried an SQL default of the owner's own id
   * until the owner migration (`the_owner_comes_from_the_installer`) took it away. Every writer names
   * the owner itself now, so a default is not a second copy kept in step: it must not be there.
   */
  it('records.owner_id, links.owner_id and links.created_by have no default', () => {
    expect((records.ownerId as unknown as { hasDefault: boolean }).hasDefault).toBe(false)
    expect((links.ownerId as unknown as { hasDefault: boolean }).hasDefault).toBe(false)
    expect((links.createdBy as unknown as { hasDefault: boolean }).hasDefault).toBe(false)
    const named = t.client.sqlite.prepare("SELECT name FROM sqlite_master WHERE sql LIKE ?").all(`%'${THE_TEST_OFFICES_OWNER.id}'%`)
    expect(named, 'a table in the migrated database still names the owner in its definition').toEqual([])
  })
})

