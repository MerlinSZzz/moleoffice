// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION C7: THE PAGE.
 *
 * `design/messages/ACCEPTANCE.md` section 8: some page of the home world lists the worlds that exist
 * now (the foreign affairs office), and after entering another world one can come back from it.
 *
 * What is proved here:
 *
 *   1. the Worlds page lists the worlds with the facts criterion C2 stores;
 *   2. a world started by a test is hidden until somebody asks, and the count says how many;
 *   3. a world that has ended is drawn with the date and the reason;
 *   4. entering a world sends this page's requests there, and coming home sends them back;
 *   5. the trip survives a reload, because it is written where a reload can read it;
 *   6. the strip says which world, brings the page back in one press, and says when the world being
 *      visited is on a different commit from the one that served this page.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { theAddressToReachAWorldBy, type Visit, type World } from '../src/shared/worlds.ts'
import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

type WorldsPageModule = typeof import('../src/web/pages/WorldsPage.tsx')
type StripModule = typeof import('../src/web/components/VisitingStrip.tsx')
type VisitingModule = typeof import('../src/web/lib/visiting.ts')
type WorldModule = typeof import('../src/web/lib/world.ts')

let page: WorldsPageModule
let strip: StripModule
let visiting: VisitingModule
let world: WorldModule
let store: Map<string, string>

beforeAll(async () => {
  store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    // `hostname` as a real browser has it: it is how the page says which machine it is on, and
    // that decides which of a world's two addresses will reach. See `theAddressToReachAWorldBy`.
    location: { hash: '', origin: 'http://127.0.0.1:41600', hostname: '127.0.0.1', reload: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  page = await import('../src/web/pages/WorldsPage.tsx')
  strip = await import('../src/web/components/VisitingStrip.tsx')
  visiting = await import('../src/web/lib/visiting.ts')
  world = await import('../src/web/lib/world.ts')
})

beforeEach(() => {
  store.clear()
  visiting.forgetTheVisitOnThisPage()
})

/** The page's markup with the hoisted stylesheets stripped, which is all a person reads. */
function body(node: React.ReactElement): string {
  return renderToStaticMarkup(node).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/**
 * Only the words on the screen: every tag taken out, so an attribute is not mistaken for text.
 *
 * A ROW CARRIES ITS KIND AS `data-kind`, which is how the stylesheet tells one from another and is
 * not something a person reads. The machine-word gate holds the same line: what may not carry a
 * stored word is DRAWN TEXT, and an attribute is not drawn.
 */
function drawn(node: React.ReactElement): string {
  return body(node).replace(/<[^>]*>/g, ' ')
}

function aWorld(over: Partial<World> = {}): World {
  return {
    id: 'w1',
    name: 'my world',
    kind: 'home',
    startedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
    checkout: `${THE_TEST_FIXTURE_ROOT}/checkout`,
    head: '905d1df',
    databaseIdentity: 'aaaaaaaaaaaaaaaa',
    address: 'http://127.0.0.1:41601',
    addressForOtherMachines: null,
    standing: 'canonical',
    parentWorld: null,
    bornAt: '2026-09-04 09:00:00',
    diedAt: null,
    diedBecause: null,
    installation: 'this-installation',
    ...over,
  }
}

function aVisit(over: Partial<Visit> = {}): Visit {
  return {
    id: 'v1',
    visitor: { kind: 'agent', id: 'builder-au' },
    fromWorld: 'aaaaaaaaaaaaaaaa',
    toWorld: 'bbbbbbbbbbbbbbbb',
    since: '2026-09-04 10:00:00',
    until: null,
    why: 'reading what the agent built',
    registeredLate: false,
    registeredAt: '2026-09-04 10:00:00',
    reportedAt: '2026-09-04 10:00:00',
    ...over,
  }
}

function theOffice(worlds: World[], visits: Visit[] = []): string {
  return body(
    createElement(page.TheOffice, {
      office: {
        worlds,
        from: 'the office' as const,
        mirrorWrittenAt: null,
        mirrorFile: `${THE_TEST_FIXTURE_ROOT}/checkout/data/worlds.json`,
        mirrorNote: 'the main world writes it, and this world is one the office may list',
        theHomeRowBelongsTo: null,
        thisWorld: 'aaaaaaaaaaaaaaaa',
        isTheOffice: true,
        office: 'http://127.0.0.1:41601',
      },
      visits,
      trusts: null, onReadAgain: () => {},
    }),
  )
}

describe('a short list says why it is short', () => {
  /**
   * "read from this world alone" ON ITS OWN IS THREE DIFFERENT FACTS WEARING ONE SENTENCE: a main
   * world that is down, a copy that was never written, and a world that may read no copy at all.
   * The server says which of the three in `mirrorNote`; this is the page drawing it rather than
   * leaving the reader to guess, which is what criterion C2's own note refuses.
   */
  it('draws the reason the server gave when the list came from this world alone', () => {
    const html = body(
      createElement(page.TheOffice, {
        office: {
          worlds: [aWorld()],
          from: 'this world alone' as const,
          mirrorWrittenAt: null,
          mirrorFile: null,
          mirrorNote: 'this server was started by a test runner, and the office the declaration names is the one a person is using.',
          theHomeRowBelongsTo: null,
          thisWorld: 'aaaaaaaaaaaaaaaa',
          isTheOffice: false,
          office: 'http://127.0.0.1:41601',
        },
        visits: [],
        trusts: null, onReadAgain: () => {},
      }),
    )
    expect(html).toContain('read from')
    expect(html).toContain('this world alone')
    expect(html).toContain('started by a test runner')
  })

  it('says nothing extra when the list came from the office itself', () => {
    const html = theOffice([aWorld()])
    expect(html).toContain('the office')
    expect(html).not.toContain('the main world writes it')
  })
})

describe('the office page lists the worlds with the facts the office stores', () => {
  it('draws the name, what it is, its database, address, checkout, commit and who started it', () => {
    const html = theOffice([aWorld()])
    expect(html).toContain('my world')
    expect(html).toContain('aaaaaaaaaaaaaaaa')
    expect(html).toContain('http://127.0.0.1:41601')
    expect(html).toContain(`${THE_TEST_FIXTURE_ROOT}/checkout`)
    expect(html).toContain('905d1df')
    expect(html).toContain(THE_TEST_OFFICES_OWNER.id)
    expect(html).toContain('2026-09-04 09:00:00')
    expect(html).toContain('this-installation')
  })

  it('never draws a stored kind or standing as itself', () => {
    const words = drawn(
      createElement(page.TheOffice, {
        office: {
          worlds: [aWorld({ kind: 'agent-made', standing: 'scratch' })],
          from: 'the office' as const,
          mirrorWrittenAt: null,
          mirrorFile: `${THE_TEST_FIXTURE_ROOT}/checkout/data/worlds.json`,
          mirrorNote: 'the main world writes it, and this world is one the office may list',
          theHomeRowBelongsTo: null,
          thisWorld: 'aaaaaaaaaaaaaaaa',
          isTheOffice: true,
          office: 'http://127.0.0.1:41601',
        },
        visits: [],
        trusts: null, onReadAgain: () => {},
      }),
    )
    expect(words).not.toContain('agent-made')
    expect(words).not.toContain('scratch stack, scratch')
    expect(words).toContain('an agent started it')
    expect(words).toContain('a scratch stack')
  })

  it('hides a world a test started, and says how many are hidden rather than nothing at all', () => {
    const html = theOffice([aWorld(), aWorld({ id: 'w2', name: 'the-office-page', kind: 'test' })])
    expect(html).not.toContain('the-office-page')
    expect(html).toContain('1 started by a test')
  })

  it('draws a world that has ended with the date and the reason, rather than dropping it', () => {
    const html = theOffice([
      aWorld({
        id: 'w3',
        name: "builder-au's citizens",
        kind: 'agent-made',
        diedAt: '2026-09-04 11:00:00',
        diedBecause: 'the supervisor stopped its server',
      }),
    ])
    expect(html).toContain('2026-09-04 11:00:00')
    expect(html).toContain('the supervisor stopped its server')
  })

  it('draws who is away from home, with what they came to do and since when', () => {
    const html = theOffice([aWorld()], [aVisit()])
    expect(html).toContain('builder-au')
    expect(html).toContain('reading what the agent built')
    expect(html).toContain('2026-09-04 10:00:00')
  })

  it('marks a visit the office heard about late, because that is a different fact', () => {
    const html = theOffice([aWorld()], [aVisit({ registeredLate: true })])
    expect(html).toContain('registered late')
  })

  it('offers no way into a world that has ended, because there is nothing there to enter', () => {
    const alive = theOffice([aWorld()])
    expect(alive).toContain('Enter')
    const dead = theOffice([aWorld({ diedAt: '2026-09-04 11:00:00', diedBecause: 'it stopped' })])
    expect(dead).not.toContain('>Enter<')
  })
})

describe('where this page sends its requests', () => {
  it('sends them to its own origin while it is at home, exactly as it always has', () => {
    expect(visiting.whereRequestsGo('/api/records')).toBe('/api/records')
  })

  it('sends them to the world it is visiting, and back home again on return', () => {
    visiting.thisPageIsVisiting({
      worldId: 'w2',
      worldName: "builder-au's citizens",
      databaseIdentity: 'bbbbbbbbbbbbbbbb',
      address: 'http://127.0.0.1:41602',
      head: '91ad217',
      visitId: 'v1',
    })
    expect(visiting.whereRequestsGo('/api/records')).toBe('http://127.0.0.1:41602/api/records')
    visiting.thisPageIsHome()
    expect(visiting.whereRequestsGo('/api/records')).toBe('/api/records')
  })

  it('leaves a whole address alone, so nothing becomes two addresses', () => {
    visiting.thisPageIsVisiting({
      worldId: 'w2',
      worldName: 'somewhere',
      databaseIdentity: 'bbbbbbbbbbbbbbbb',
      address: 'http://127.0.0.1:41602',
      head: null,
      visitId: 'v1',
    })
    expect(visiting.whereRequestsGo('http://127.0.0.1:41603/api/health')).toBe('http://127.0.0.1:41603/api/health')
  })

  it('survives a reload, because the trip is written where a reload can read it', () => {
    visiting.thisPageIsVisiting({
      worldId: 'w2',
      worldName: "builder-au's citizens",
      databaseIdentity: 'bbbbbbbbbbbbbbbb',
      address: 'http://127.0.0.1:41602',
      head: '91ad217',
      visitId: 'v1',
    })
    // WHAT THE PAGE ITSELF WROTE, read back rather than typed here. A test that put the trip into
    // storage itself would pass over a page that never wrote one, which is exactly the fault this is
    // about: the criterion asks for the visit to survive a reload.
    const written = store.get(visiting.VISIT_KEY)
    expect(written, 'the page wrote no trip anywhere a reload could read it').toBeDefined()

    // A reload is a fresh module with the same storage behind it.
    visiting.forgetTheVisitOnThisPage()
    store.set(visiting.VISIT_KEY, written ?? '')
    expect(visiting.theVisitThisPageHolds()?.visitId).toBe('v1')
    expect(visiting.whereRequestsGo('/api/records')).toBe('http://127.0.0.1:41602/api/records')
  })
})

/**
 * EVERY REQUEST THIS APP MAKES GOES WHERE THE PAGE IS POINTED, and this is what proves it.
 *
 * FOUND BY LOOKING AT THE PICTURES. The first photograph of a page that had entered another world
 * showed the wrong-world banner over it: the stream at `/api/events` and the file preview each
 * called `fetch` on the page's own origin, so a second world was answering this page while it was
 * visiting a first. Criterion G3's banner was right; the page was wrong.
 */
describe('every request this app makes goes where the page is pointed', () => {
  it('sends every one of the three through the same function', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const web = fileURLToPath(new URL('../src/web/', import.meta.url))
    for (const file of ['api.ts', 'lib/channel.ts', 'components/SummaryBlocks.tsx']) {
      const lines = readFileSync(`${web}${file}`, 'utf8').split('\n')
      let found = 0
      for (const [at, line] of lines.entries()) {
        if (!/\bfetch\(/.test(line) || line.trim().startsWith('*')) continue
        found += 1
        // THE CALL AND THE EIGHT LINES ABOVE IT, because the address is often worked out into a
        // local one line up. A one-line reading would have called the stream at `/api/events`
        // correct while it was pointed at the wrong world, which is the fault this test is about.
        const around = lines.slice(Math.max(0, at - 8), at + 1).join('\n')
        // THE TWO IN api.ts THAT GO TO ANOTHER WORLD ON PURPOSE — entering one and coming home —
        // are addressed by that world's own address. They are named by the route they call, not by
        // the shape of the line, so renaming a local cannot turn a defect into an exception.
        // AND THE ONE THAT ASKS WHO OWNS THE OFFICE goes to the office that served the page, on
        // purpose: it is how the page learns whom it acts as, and a visited
        // world's owner is not this page's person. It is named by the route on the fetch line itself,
        // because the comment above that call names the route too and must not excuse a changed call.
        const onPurpose = around.includes('/api/office/visits') || line.includes('/api/office/owner')
        expect(
          /whereRequestsGo\(/.test(around) || onPurpose,
          `${file} calls fetch without asking where this page's requests go: ${line.trim()}`,
        ).toBe(true)
      }
      expect(found, `${file} makes no fetch at all any more`).toBeGreaterThan(0)
    }
  })
})

describe('the strip that says this page is away from home', () => {
  it('draws nothing at all while the page is at home', () => {
    expect(body(createElement(strip.VisitingStrip))).toBe('')
  })

  it('says which world, and offers one press back', () => {
    visiting.thisPageIsVisiting({
      worldId: 'w2',
      worldName: "builder-au's citizens",
      databaseIdentity: 'bbbbbbbbbbbbbbbb',
      address: 'http://127.0.0.1:41602',
      head: '905d1df',
      visitId: 'v1',
    })
    const html = body(createElement(strip.VisitingStrip))
    expect(html).toContain('Visiting')
    expect(html).toContain("builder-au&#x27;s citizens")
    expect(html).toContain('Return home')
  })

  it('says so when the world being visited is on a different commit from the one that served it', () => {
    world.rememberTheHomeWorld({
      database: 'aaaaaaaaaaaaaaaa',
      repository: `${THE_TEST_FIXTURE_ROOT}/checkout`,
      port: '41601',
      head: '905d1df',
      standing: 'canonical',
    })
    visiting.thisPageIsVisiting({
      worldId: 'w2',
      worldName: "builder-au's citizens",
      databaseIdentity: 'bbbbbbbbbbbbbbbb',
      address: 'http://127.0.0.1:41602',
      head: '91ad217',
      visitId: 'v1',
    })
    const html = body(createElement(strip.VisitingStrip))
    expect(html).toContain('91ad217')
    expect(html).toContain('905d1df')
  })

  it('says nothing about the commit when the two worlds are on the same one', () => {
    world.rememberTheHomeWorld({
      database: 'aaaaaaaaaaaaaaaa',
      repository: `${THE_TEST_FIXTURE_ROOT}/checkout`,
      port: '41601',
      head: '905d1df',
      standing: 'canonical',
    })
    visiting.thisPageIsVisiting({
      worldId: 'w2',
      worldName: "builder-au's citizens",
      databaseIdentity: 'bbbbbbbbbbbbbbbb',
      address: 'http://127.0.0.1:41602',
      head: '905d1df',
      visitId: 'v1',
    })
    const html = body(createElement(strip.VisitingStrip))
    expect(html).not.toContain('this page')
  })
})

/**
 * ENTERING A WORLD GOES TO THAT WORLD'S API, AND SURVIVES A REPLY THAT IS NOT THIS PRODUCT'S.
 *
 * `IAmVisitingOnPurpose` on the wrong-world banner used to hand `window.location.origin` in as the
 * address. In `npm run dev` that is Vite: the visit was posted to
 * http://127.0.0.1:29845/api/office/visits, Vite answered 404 with `Content-Length: 0`, and
 * `res.json()` threw before any refusal path — so what the reader got was the browser's own
 * *Failed to execute 'json' on 'Response': Unexpected end of JSON input*, no visit was registered,
 * and the banner has no dismissal by design. Problem `nl5t16TMBKbF`.
 */
describe('entering a world talks to that world', () => {
  async function withFetch<T>(
    answer: (where: string, init: RequestInit) => Response,
    run: (api: typeof import('../src/web/api.ts').api) => Promise<T>,
  ): Promise<T> {
    const { api } = await import('../src/web/api.ts')
    const before = globalThis.fetch
    const asked: string[] = []
    globalThis.fetch = ((where: string, init: RequestInit = {}) => {
      asked.push(where)
      return Promise.resolve(answer(where, init))
    }) as unknown as typeof globalThis.fetch
    try {
      return await run(api)
    } finally {
      globalThis.fetch = before
    }
  }

  /** The world this page opened against, so `enterAWorld` knows where it lives. */
  const AT_HOME = {
    database: 'aaaaaaaaaaaaaaaa',
    repository: `${THE_TEST_FIXTURE_ROOT}/checkout`,
    port: '41601',
    head: '905d1df',
    standing: 'canonical',
  }

  const A_WORLD = {
    id: 'a-world',
    name: 'the second world',
    databaseIdentity: 'bbbbbbbbbbbbbbbb',
    address: 'http://127.0.0.1:29843',
    head: '905d1df',
  }

  it('posts the visit to the address it is given, and keeps it on the trip', async () => {
    world.rememberTheHomeWorld(AT_HOME)
    let where = ''
    const trip = await withFetch(
      (asked) => {
        where = asked
        return new Response(JSON.stringify({ visit: { id: 'a-visit' } }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      },
      async (api) => api.enterAWorld(A_WORLD, 'I am visiting on purpose'),
    )
    expect(where).toBe('http://127.0.0.1:29843/api/office/visits')
    expect(where, 'the visit was posted to the page’s own address').not.toContain('41600')
    expect(trip.visitId).toBe('a-visit')
    expect(trip.address).toBe('http://127.0.0.1:29843')
  })

  it('says the address and the status when nothing there answers with a visit', async () => {
    world.rememberTheHomeWorld(AT_HOME)
    // EXACTLY WHAT VITE SENT: 404, and a body of no bytes at all.
    await expect(
      withFetch(
        () => new Response('', { status: 404 }),
        async (api) => api.enterAWorld(A_WORLD, 'I am visiting on purpose'),
      ),
    ).rejects.toThrow(/http:\/\/127\.0\.0\.1:29843\/api\/office\/visits answered 404/)
  })

  it('says the same when the answer is not this product’s at all', async () => {
    world.rememberTheHomeWorld(AT_HOME)
    await expect(
      withFetch(
        () => new Response('<!doctype html><title>not this</title>', { status: 200 }),
        async (api) => api.enterAWorld(A_WORLD, 'I am visiting on purpose'),
      ),
    ).rejects.toThrow(/answered 200 and no visit came back/)
  })

  it('keeps this product’s own refusal when there is one', async () => {
    world.rememberTheHomeWorld(AT_HOME)
    await expect(
      withFetch(
        () =>
          new Response(JSON.stringify({ error: 'A visit says what you came to do.' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          }),
        async (api) => api.enterAWorld(A_WORLD, 'I am visiting on purpose'),
      ),
    ).rejects.toThrow('A visit says what you came to do.')
  })
})

/**
 * COMING HOME IS NEVER A VISIT, AND NEVER REFUSED.
 *
 * The biggest problem: there was no way back, and switching again warned that this is already a
 * citizen of the home world. A human is registered at the foreign affairs office from the start and
 * may enter and leave any world, home too. Measured in a real browser against a second world exactly like the owner's: pressing
 * Enter on the owner's own world's row while away answered 400 — *The world 3c3134816c25a059 is where this
 * citizen lives, so there is nothing to register* — and left the trip exactly where it was. Problem
 * `MvsNyqPIFIvt`.
 */
describe('the home world’s row', () => {
  const HOME = 'aaaaaaaaaaaaaaaa'

  function theOfficeWith(worlds: World[], visits: Visit[] = []) {
    return {
      worlds,
      from: 'the office' as const,
      mirrorWrittenAt: null,
      mirrorFile: `${THE_TEST_FIXTURE_ROOT}/checkout/data/worlds.json`,
      mirrorNote: 'the main world writes it',
      isTheOffice: true,
      theHomeRowBelongsTo: null,
      thisWorld: HOME,
      office: 'http://127.0.0.1:41601',
      visits,
    }
  }

  function drawn(worlds: World[]): string {
    return body(
      createElement(page.TheOffice, {
        office: theOfficeWith(worlds),
        visits: [],
        trusts: null, onReadAgain: () => {},
      }),
    )
  }

  it('offers no visit into the world this page came from, at home or away', () => {
    world.rememberTheHomeWorld({
      database: HOME,
      repository: `${THE_TEST_FIXTURE_ROOT}/checkout`,
      port: '41601',
      head: '905d1df',
      standing: 'canonical',
    })
    const here = aWorld({ databaseIdentity: HOME, name: 'my world' })
    const there = aWorld({ id: 'the-second', databaseIdentity: 'bbbbbbbbbbbbbbbb', name: 'the second world' })

    // AT HOME: the row a person is already on says so, and offers nothing.
    const home = drawn([here, there])
    expect(home).toContain('You are here')
    expect(home).toContain('Enter')

    // AWAY: the same row offers the way back, and it is not an Enter.
    visiting.thisPageIsVisiting({
      worldId: 'the-second',
      worldName: 'the second world',
      databaseIdentity: 'bbbbbbbbbbbbbbbb',
      address: 'http://127.0.0.1:41602',
      head: '905d1df',
      visitId: 'a-visit',
    })
    const away = drawn([here, there])
    expect(away).toContain('Return home')
    // The second world is the one being visited, so it says "You are here"; the home row must not
    // be offering an Enter beside it.
    expect(away.split('Return home')[0], 'the home row offered a visit into the page’s own world').not.toContain(
      '>Enter<',
    )
  })
})

/**
 * A PROJECT IS A THING IN ONE DATABASE, so a trip changes which one the page reads.
 *
 * After a switch the page should be in the new world's default workspace, not keep the old world's
 * workspace. Measured in a real browser against an empty second world: the page carried `panelx`
 * across, the world it arrived in had never heard of it, every read answered 404 and the sidebar
 * drew five sentences about it. Problem `1qgF9RvsUloT`.
 */
describe('the project a trip reads', () => {
  const A_WORLD = {
    id: 'a-world',
    name: 'the second world',
    databaseIdentity: 'bbbbbbbbbbbbbbbb',
    address: 'http://127.0.0.1:29843',
    head: '905d1df',
  }

  async function withFetch<T>(answer: () => Response, run: (api: typeof import('../src/web/api.ts').api) => Promise<T>) {
    const { api } = await import('../src/web/api.ts')
    const before = globalThis.fetch
    globalThis.fetch = (() => Promise.resolve(answer())) as unknown as typeof globalThis.fetch
    try {
      return await run(api)
    } finally {
      globalThis.fetch = before
    }
  }

  const aVisit = () =>
    new Response(JSON.stringify({ visit: { id: 'a-visit' } }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    })

  it('takes the visited world’s default and remembers the one it left', async () => {
    const { currentWorkspace, setWorkspace } = await import('../src/web/lib/workspace.ts')
    world.rememberTheHomeWorld({
      database: 'aaaaaaaaaaaaaaaa',
      repository: `${THE_TEST_FIXTURE_ROOT}/checkout`,
      port: '41601',
      head: '905d1df',
      standing: 'canonical',
    })
    setWorkspace('panelx')
    expect(currentWorkspace()).toBe('panelx')

    const trip = await withFetch(aVisit, async (api) => api.enterAWorld(A_WORLD, 'looking'))
    expect(trip.workspaceAtHome, 'the project the owner was reading at home was not remembered').toBe('panelx')
    expect(currentWorkspace(), 'the page carried the previous world’s project across').toBe('default')
  })

  it('puts back the project it left when the page comes home', async () => {
    const { currentWorkspace, setWorkspace } = await import('../src/web/lib/workspace.ts')
    world.rememberTheHomeWorld({
      database: 'aaaaaaaaaaaaaaaa',
      repository: `${THE_TEST_FIXTURE_ROOT}/checkout`,
      port: '41601',
      head: '905d1df',
      standing: 'canonical',
    })
    setWorkspace('panelx')
    await withFetch(aVisit, async (api) => api.enterAWorld(A_WORLD, 'looking'))
    expect(currentWorkspace()).toBe('default')

    // THROUGH THE BROWSER'S STORE, WHICH IS THE ONLY WAY A REAL PAGE EVER READS A TRIP. Enter
    // writes the trip and reloads, so the page that comes home has read it back from storage. The
    // first version of this test kept it in memory and passed over a reader that dropped the field:
    // in a browser the trip ended, the strip went, and the project stayed the visited world's.
    const asStored = window.localStorage.getItem('mole-office.visiting')
    expect(asStored, 'Enter wrote no trip into the store').not.toBeNull()
    visiting.forgetTheVisitOnThisPage()
    window.localStorage.setItem('mole-office.visiting', asStored ?? '')
    expect(visiting.theVisitThisPageHolds(), 'the trip was not read back from the store').not.toBeNull()
    expect(
      visiting.theVisitThisPageHolds()?.workspaceAtHome,
      'the project the owner was reading at home did not survive the reload',
    ).toBe('panelx')

    await withFetch(() => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }), async (api) =>
      api.returnHome(),
    )
    expect(visiting.theVisitThisPageHolds()).toBeNull()
    expect(currentWorkspace(), 'coming home left the owner in the visited world’s project').toBe('panelx')
  })

  it('leaves the project alone for a trip written before this was remembered', async () => {
    const { currentWorkspace, setWorkspace } = await import('../src/web/lib/workspace.ts')
    setWorkspace('panelx')
    visiting.thisPageIsVisiting({
      worldId: 'a-world',
      worldName: 'the second world',
      databaseIdentity: 'bbbbbbbbbbbbbbbb',
      address: 'http://127.0.0.1:29843',
      head: '905d1df',
      visitId: 'a-visit',
    })
    await withFetch(() => new Response('{}', { status: 200 }), async (api) => api.returnHome())
    expect(currentWorkspace()).toBe('panelx')
  })
})

/**
 * AND THE PAGE SAYS IT, where somebody who started a copy will actually be looking.
 *
 * The office reports the two identities; the words are here. A copy carries the original's rows, so
 * the list it draws is of worlds that are not here — which is exactly the state in which a reader
 * needs telling, because everything else on the page looks ordinary.
 */
describe('a copy of the main world’s database, drawn', () => {
  function withOffice(over: Record<string, unknown>): string {
    return body(
      createElement(page.TheOffice, {
        office: {
          worlds: [aWorld()],
          from: 'the office' as const,
          mirrorWrittenAt: null,
          mirrorFile: `${THE_TEST_FIXTURE_ROOT}/checkout/data/worlds.json`,
          mirrorNote: 'the main world writes it',
          isTheOffice: true,
          theHomeRowBelongsTo: null,
          thisWorld: 'aaaaaaaaaaaaaaaa',
          office: 'http://127.0.0.1:41601',
          ...over,
        },
        visits: [],
        trusts: null, onReadAgain: () => {},
      }),
    )
  }

  it('says a copy is not a second world, and names both databases', () => {
    const html = withOffice({ theHomeRowBelongsTo: 'ffffffffffffffff', thisWorld: 'aaaaaaaaaaaaaaaa' })
    expect(html).toContain('copy of the main world')
    expect(html).toContain('ffffffffffffffff')
    expect(html).toContain('aaaaaaaaaaaaaaaa')
    expect(html, 'a reader is left without the way out').toContain('empty database')
  })

  it('says nothing of the kind on an ordinary world', () => {
    expect(withOffice({})).not.toContain('copy of the main world')
  })
})

/**
 * WHICH ADDRESS A PAGE ENTERS BY, AND WHAT THE ROW SAYS WHEN NEITHER WILL DO.
 *
 * From the owner's other machine, Enter answered "Failed to fetch": the office knew only
 * `http://127.0.0.1:29840`, which on that machine is that machine. The world was also listening on
 * `192.0.2.10:29840` and nobody had told the office. Problem `5mG-KxUAXObJ`.
 */
describe('the address a page reaches a world by', () => {
  const BOTH = { address: 'http://127.0.0.1:29840', addressForOtherMachines: 'http://192.0.2.10:29840' }
  const LOOPBACK_ONLY = { address: 'http://127.0.0.1:29840', addressForOtherMachines: null }

  it('uses loopback for a page on the computer the worlds run on', () => {
    for (const host of ['127.0.0.1', 'localhost', '::1', '[::1]', 'LOCALHOST']) {
      const said = theAddressToReachAWorldBy(BOTH, host)
      expect(said.address, `a page on ${host} was sent somewhere else`).toBe('http://127.0.0.1:29840')
      expect(said.reachable).toBe(true)
    }
  })

  it('uses the other machine’s door for a page that came from one', () => {
    const said = theAddressToReachAWorldBy(BOTH, '192.0.2.10')
    expect(said.address).toBe('http://192.0.2.10:29840')
    expect(said.reachable).toBe(true)
  })

  it('refuses nothing when a world opens no door another machine can reach, and says so', () => {
    const said = theAddressToReachAWorldBy(LOOPBACK_ONLY, '192.0.2.10')
    expect(said.address, 'the control was taken away instead of being tried').toBe('http://127.0.0.1:29840')
    expect(said.reachable).toBe(false)
    expect(said.why).toContain('another machine')
  })

  it('says so the same way when a world recorded no address on this computer', () => {
    const said = theAddressToReachAWorldBy({ address: null, addressForOtherMachines: null }, '127.0.0.1')
    expect(said.address).toBeNull()
    expect(said.reachable).toBe(false)
    expect(said.why).toContain('no address on this computer')
  })

  it('treats a page that cannot say where it is as being on another machine, which is the cautious one', () => {
    // Nothing outside a browser was served by anybody, and a host guessed here would decide a
    // world's address on a guess.
    const said = theAddressToReachAWorldBy(BOTH, '')
    expect(said.address).toBe('http://192.0.2.10:29840')
  })

  it('draws the address this page would use, and the sentence when it will not reach', () => {
    const here = aWorld({ ...LOOPBACK_ONLY, id: 'a-loopback-world', databaseIdentity: 'dddddddddddddddd' })
    const html = body(
      createElement(page.TheOffice, {
        office: {
          worlds: [here],
          from: 'the office' as const,
          mirrorWrittenAt: null,
          mirrorFile: null,
          mirrorNote: 'the main world writes it',
          isTheOffice: true,
          theHomeRowBelongsTo: null,
          thisWorld: 'aaaaaaaaaaaaaaaa',
          office: 'http://127.0.0.1:41601',
        },
        visits: [],
        trusts: null, onReadAgain: () => {},
      }),
    )
    // The fake window this file installs is on 127.0.0.1, so the page reads as being on this
    // computer and the loopback address is the reachable one.
    expect(html).toContain('http://127.0.0.1:29840')
    expect(html).not.toContain('from here')
  })

  /** Render as a page served to another machine, and put the window back however it goes. */
  function asIfTheReaderWereOnAnotherMachine(host: string, draw: () => string): string {
    const here = globalThis as unknown as { window: { location: { hostname: string } } }
    const was = here.window.location.hostname
    here.window.location.hostname = host
    try {
      return draw()
    } finally {
      here.window.location.hostname = was
    }
  }

  it('draws the door another machine can use, for a page that came from one', () => {
    const html = asIfTheReaderWereOnAnotherMachine('192.0.2.10', () =>
      theOffice([aWorld({ ...BOTH, id: 'w2', databaseIdentity: 'cccccccccccccccc' })]),
    )
    expect(html, 'the reader on loquat was handed loquat').not.toContain('http://127.0.0.1:29840')
    expect(html).toContain('http://192.0.2.10:29840')
    expect(html).not.toContain('from here')
  })

  it('says on the row when a world has no address another machine can reach, and still offers Enter', () => {
    const html = asIfTheReaderWereOnAnotherMachine('192.0.2.10', () =>
      theOffice([aWorld({ ...LOOPBACK_ONLY, id: 'w2', databaseIdentity: 'cccccccccccccccc' })]),
    )
    expect(html).toContain('from here')
    expect(html, 'the sentence does not say what is wrong').toContain('another machine')
    expect(html, 'the control was taken away instead of being tried').toContain('Enter')
  })
})
