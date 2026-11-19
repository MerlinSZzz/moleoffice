// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The shell's routing table: which address shows which page, and where the frame says you are.
 *
 * WHY THIS FILE EXISTS. The set of addresses lives once, in FLAT_ROUTES in router.tsx, and three
 * separate things read it: the shell picks a page from it, the sidebar builds every link from it
 * with `pathFor`, and tools/review.mjs parses it to know what to photograph. A translation
 * anywhere in that chain is the kind of thing that looks right in a screenshot of one page and is
 * wrong on another, so `pageForRoute` is a pure function in App.tsx and it is checked here for
 * every address the app has.
 *
 * WHY IT LOOKS LIKE THIS. The test runner's environment is `node` -- there is no DOM and no jsdom,
 * and adding one would mean a new dependency this project has ruled out. src/web/api.ts reads
 * window.localStorage at module scope to restore who you are acting as, and HomePage.tsx installs
 * a `hashchange` listener when it is imported, so the smallest possible stand-in for a window is
 * installed before App.tsx is imported. Nothing in that stand-in is under test.
 *
 * What the FRAME does with a route -- the destinations, the families, the counts -- is in
 * tests/shell-nav.test.ts, which imports the sidebar alone and needs no page to exist.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { FLAT_ROUTES, parseRoute, pathFor, pipelinePath, recordPath, RECORD_SECTIONS, renamedAddress, RENAMED_ADDRESSES } from '../src/web/components/router.tsx'
// Type-only, so it is erased before this file runs and does not load App.tsx early.
import type { Page } from '../src/web/App.tsx'

type AppModule = typeof import('../src/web/App.tsx')
type SidebarModule = typeof import('../src/web/components/Sidebar.tsx')
let App: AppModule
let Sidebar: SidebarModule

beforeAll(async () => {
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
  App = await import('../src/web/App.tsx')
  Sidebar = await import('../src/web/components/Sidebar.tsx')
})

/** Every address the frame or a row can reach, as the browser hands it to the router. */
/**
 * EVERY ADDRESS THE ROUTER DECLARES, DERIVED FROM THE ROUTER AND NOT WRITTEN OUT BY HAND.
 *
 * IT WAS A HAND LIST OF ELEVEN and the router declared fourteen flat routes, so three of them —
 * `#/agent-use` among them — were outside the collision check below. A page added to the router with
 * an address that collided with an existing one would not have been caught, which is the one thing
 * this list exists to catch.
 *
 * `#/r/x` is added by hand because it is the one route with a path parameter: there is no segment in
 * `FLAT_ROUTES` for it, and a derived list cannot invent an id.
 */
const ADDRESSES: { hash: string; page: Page }[] = [
  { hash: '#/', page: 'home' },
  ...Object.entries(FLAT_ROUTES).map(([segment, page]) => ({ hash: `#/${segment}`, page: page as Page })),
  { hash: '#/r/x', page: 'record' },
]

describe('pageForRoute', () => {
  it('puts the home page at the root address, in all the spellings of it', () => {
    for (const hash of ['', '#', '#/']) {
      expect(App.pageForRoute(parseRoute(hash))).toBe('home')
    }
  })

  it('puts the records list at #/records, with or without a trailing slash', () => {
    expect(App.pageForRoute(parseRoute('#/records'))).toBe('records')
    expect(App.pageForRoute(parseRoute('#/records/'))).toBe('records')
  })

  it('gives pipelines an address of their own, which they never had', () => {
    // A pipeline has been a first-class record kind from the start and appeared only as one panel
    // on Home and as a record view. tools/review.mjs reads FLAT_ROUTES to know what to photograph,
    // so a page that is not in that map is also a page nobody ever looks at a picture of.
    expect(App.pageForRoute(parseRoute('#/pipeline'))).toBe('pipeline')
    expect(App.pageForRoute(parseRoute('#/pipeline/'))).toBe('pipeline')
  })

  it('keeps the record, sessions, queries and component sheet addresses working', () => {
    expect(App.pageForRoute(parseRoute('#/r/abc123'))).toBe('record')
    expect(App.pageForRoute(parseRoute('#/sessions'))).toBe('sessions')
    expect(App.pageForRoute(parseRoute('#/queries'))).toBe('queries')
    expect(App.pageForRoute(parseRoute('#/ui'))).toBe('sheet')
    expect(App.pageForRoute(parseRoute('#/ui/'))).toBe('sheet')
  })

  it('sends an address that matches nothing to the not-found page rather than to a guess', () => {
    // The wrong answer here is 'home': a typo that silently lands on a working page is how a
    // broken link survives for months.
    expect(App.pageForRoute(parseRoute('#/recordz'))).toBe('unknown')
    expect(App.pageForRoute(parseRoute('#/records/extra'))).toBe('unknown')
    expect(App.pageForRoute(parseRoute('#/pipelines'))).toBe('unknown')
    expect(App.pageForRoute(parseRoute('#/uix'))).toBe('unknown')
  })

  it('carries which pipeline is drawn in the address, and nothing else does', () => {
    // WHY THIS MATTERS MORE THAN IT LOOKS. Which drawing is open used to be component state, so a
    // drawing could not be linked to, sent, or reloaded back into — and tools/review.mjs, which can
    // photograph an address but cannot press a picker, could only ever photograph whichever drawing
    // the page happened to open on. Nobody had ever seen a picture of a pipeline on that canvas.
    const bare = parseRoute('#/pipeline')
    expect(bare).toEqual({ name: 'pipeline' })
    expect('id' in bare).toBe(false)

    const one = parseRoute('#/pipeline/g1Q-TqSWqPZH')
    expect(one).toEqual({ name: 'pipeline', id: 'g1Q-TqSWqPZH' })
    // Still the same PAGE, so the shell draws one component and the sidebar marks one link.
    expect(App.pageForRoute(one)).toBe('pipeline')
  })

  it('reads back a pipeline id that needs encoding, including a Chinese one', () => {
    // Titles here can be Chinese, such as 倒片台安全护罩, and ids are opaque; an address that cannot survive a
    // round trip is a link that works until the day somebody files a record with a slash in its id.
    for (const id of ['a b', '重印/v3', 'x#y', '夹具标定']) {
      expect(parseRoute(`#${pipelinePath(id)}`)).toEqual({ name: 'pipeline', id })
    }
    expect(pipelinePath()).toBe(pathFor('pipeline'))
  })

  it('refuses a pipeline address with more than one segment after it', () => {
    // Same rule as every other page: a typo goes to the not-found page rather than to a guess.
    expect(App.pageForRoute(parseRoute('#/pipeline/abc/extra'))).toBe('unknown')
  })

  /**
   * WHAT MAY FOLLOW A RECORD'S ID. The rule is decided once, in router.tsx's RECORD_SECTIONS, and
   * these four cases are the whole of it: the plain address, a named section, junk, and a section
   * word on a page that does not take one.
   *
   * The rule this replaces was `parts.length === 2` exactly, and the reason it was there is kept:
   * with no rule, `#/r/abc/extra` quietly opened record abc, so one record had unlimited addresses.
   * A named word out of a closed list is not that rule relaxed.
   */
  it('opens a record at a named section, and refuses any other trailing word', () => {
    expect(parseRoute('#/r/abc123')).toEqual({ name: 'record', id: 'abc123' })
    expect(parseRoute('#/r/abc123/history')).toEqual({ name: 'record', id: 'abc123', section: 'history' })
    // A section is still the record's own page, so the shell draws one page and nothing new.
    expect(App.pageForRoute(parseRoute('#/r/abc123/history'))).toBe('record')
    // The word has to be one somebody built. Junk goes to the not-found page, as it did before.
    expect(App.pageForRoute(parseRoute('#/r/abc123/extra'))).toBe('unknown')
    expect(App.pageForRoute(parseRoute('#/r/abc123/history/other'))).toBe('unknown')
    // A section is a place in a record you are READING. Editing is not a section and does not stack.
    expect(App.pageForRoute(parseRoute('#/r/abc123/history/edit'))).toBe('unknown')
    // The list is closed, and every word in it is a section this build can actually open.
    expect([...RECORD_SECTIONS]).toEqual(['history'])
  })

  it('builds a record section address from the one builder, encoding the id and not the word', () => {
    expect(recordPath('abc123')).toBe('/r/abc123')
    // THE SECOND POSITION NOW CARRIES THE KIND, criterion E2, and the section follows it. The same
    // rule as before otherwise: the id encodes, the section word does not.
    expect(recordPath('abc123', undefined, 'history')).toBe('/r/abc123/history')
    // The id round-trips through the parser even when it needs encoding; the section word never
    // needs encoding, because it is one of the words in the list rather than somebody's text.
    for (const id of ['a b', '重印/v3', 'x#y']) {
      expect(parseRoute(`#${recordPath(id, undefined, 'history')}`)).toEqual({ name: 'record', id, section: 'history' })
    }
  })

  /**
   * ONE REPORT AT ITS OWN ADDRESS, criterion E2. `#/report/<id>` opens the same record
   * page `#/r/<id>` did — no new page — with
   * the kind carried in the route, which is what lets the rail mark the row the report belongs to
   * before the record itself has come back. The two-or-three rule is the rule the `r` branches
   * hold, joined rather than relaxed.
   */
  it('opens a report at #/report/<id>, the same record page with the kind in the route', () => {
    expect(parseRoute('#/report/abc123')).toEqual({ name: 'record', id: 'abc123', kind: 'report' })
    expect(App.pageForRoute(parseRoute('#/report/abc123'))).toBe('record')
    // Writing in it, and a named section, keep the same rule as the generic record address.
    expect(parseRoute('#/report/abc123/edit')).toEqual({ name: 'record', id: 'abc123', edit: true, kind: 'report' })
    expect(parseRoute('#/report/abc123/history')).toEqual({ name: 'record', id: 'abc123', section: 'history', kind: 'report' })
    // Junk is refused, as it is on the generic address, and a malformed id too.
    expect(App.pageForRoute(parseRoute('#/report/abc/extra'))).toBe('unknown')
    expect(App.pageForRoute(parseRoute('#/report/abc/history/edit'))).toBe('unknown')
    expect(parseRoute('#/report/%E4%B8').name).toBe('unknown')
    const built = recordPath('a b', 'report')
    expect(built).toBe('/report/a%20b')
    expect(parseRoute(`#${built}`)).toEqual({ name: 'record', id: 'a b', kind: 'report' })
  })

  /**
   * ONE MESSAGE AT ITS OWN ADDRESS, criterion E2. `#/message/<id>` opens a PAGE OF
   * ITS OWN — not the record page, the way a report
   * does — because it draws the sender, the recipients, the marks, the conversation and what the
   * message is about, none of which the record page draws. `pageForRoute` answers "message", and
   * that is the check that tells the page of its own apart from a fallback to the generic one.
   *
   * The two-segment rule is the one every id-carrying address holds, so a third segment and a
   * malformed id are refused rather than opening a working page.
   */
  it('opens a message at #/message/<id>, a page of its own and not the generic record page', () => {
    expect(parseRoute('#/message/abc123')).toEqual({ name: 'message', id: 'abc123' })
    expect(App.pageForRoute(parseRoute('#/message/abc123'))).toBe('message')
    // Junk is refused, as on every id-carrying address, and a malformed id too.
    expect(App.pageForRoute(parseRoute('#/message/abc/extra'))).toBe('unknown')
    expect(App.pageForRoute(parseRoute('#/message/abc/history'))).toBe('unknown')
    expect(parseRoute('#/message/%E4%B8').name).toBe('unknown')
    // The builder every list that holds the kind uses produces the address the parser reads.
    const built = recordPath('a b', 'message')
    expect(built).toBe('/message/a%20b')
    expect(parseRoute(`#${built}`)).toEqual({ name: 'message', id: 'a b' })
    // AND A CALLER THAT HOLDS ONLY AN ID KEEPS THE GENERIC ADDRESS, which the record page opens.
    expect(recordPath('a b')).toBe('/r/a%20b')
    expect(App.pageForRoute(parseRoute('#/r/abc123'))).toBe('record')
  })

  /**
   * ONE PROBLEM AT ITS OWN ADDRESS, criterion E2. `#/problem/<id>` opens a PAGE OF
   * ITS OWN, like a message's and unlike a report's:
   * it draws the problem's sections with its own breadcrumb and its own row in the rail.
   * `pageForRoute` answers "problem", which is the check that tells the page of its own apart from a
   * fallback to the generic one.
   *
   * WRITING IN IT KEEPS THE RECORD PAGE'S RULE — the address may end in `/edit` — and the two-segment
   * rule is the one every id-carrying address holds, so any other trailing word is refused.
   */
  it('opens a problem at #/problem/<id>, a page of its own and not the generic record page', () => {
    expect(parseRoute('#/problem/abc123')).toEqual({ name: 'problem', id: 'abc123' })
    expect(App.pageForRoute(parseRoute('#/problem/abc123'))).toBe('problem')
    expect(parseRoute('#/problem/abc123/edit')).toEqual({ name: 'problem', id: 'abc123', edit: true })
    // Junk is refused, as on every id-carrying address, and a malformed id too.
    expect(App.pageForRoute(parseRoute('#/problem/abc/extra'))).toBe('unknown')
    expect(App.pageForRoute(parseRoute('#/problem/abc/history'))).toBe('unknown')
    expect(parseRoute('#/problem/%E4%B8').name).toBe('unknown')
    // The builder every list that holds the kind uses produces the address the parser reads.
    const built = recordPath('a b', 'problem')
    expect(built).toBe('/problem/a%20b')
    expect(parseRoute(`#${built}`)).toEqual({ name: 'problem', id: 'a b' })
    // AND A CALLER THAT HOLDS ONLY AN ID KEEPS THE GENERIC ADDRESS, which the record page opens.
    expect(recordPath('a b')).toBe('/r/a%20b')
    expect(App.pageForRoute(parseRoute('#/r/abc123'))).toBe('record')
  })

  /**
   * ONE AGENT RUN AT ITS OWN ADDRESS, criterion E2
   * . `#/session/<id>` opens a page of its own, built after the message page's.
   * The two-segment rule is the one every id-carrying address holds, so a third segment and a
   * malformed id are refused, and a caller that holds only an id keeps `#/r/<id>`.
   */
  it('opens a run at #/session/<id>, a page of its own and not the generic record page', () => {
    expect(parseRoute('#/session/abc123')).toEqual({ name: 'session', id: 'abc123' })
    expect(App.pageForRoute(parseRoute('#/session/abc123'))).toBe('session')
    // Junk is refused, as on every id-carrying address, and a malformed id too.
    expect(App.pageForRoute(parseRoute('#/session/abc/extra'))).toBe('unknown')
    expect(App.pageForRoute(parseRoute('#/session/abc/history'))).toBe('unknown')
    expect(parseRoute('#/session/%E4%B8').name).toBe('unknown')
    // The builder every list that holds the kind uses produces the address the parser reads.
    const built = recordPath('a b', 'session')
    expect(built).toBe('/session/a%20b')
    expect(parseRoute(`#${built}`)).toEqual({ name: 'session', id: 'a b' })
    // AND A CALLER THAT HOLDS ONLY AN ID KEEPS THE GENERIC ADDRESS, which the record page opens.
    expect(recordPath('a b')).toBe('/r/a%20b')
    expect(App.pageForRoute(parseRoute('#/r/abc123'))).toBe('record')
  })

  it('gives every address its own page, so no two addresses collide', () => {
    const pages = ADDRESSES.map((a) => App.pageForRoute(parseRoute(a.hash)))
    expect(pages).toEqual(ADDRESSES.map((a) => a.page))
    expect(new Set(pages).size).toBe(ADDRESSES.length)
  })
})

describe('navMark', () => {
  it('marks the navigation link of the page you are looking at', () => {
    expect(Sidebar.navMark('home', 'home')).toBe('page')
    expect(Sidebar.navMark('records', 'records')).toBe('page')
    expect(Sidebar.navMark('pipeline', 'pipeline')).toBe('page')
    expect(Sidebar.navMark('sessions', 'sessions')).toBe('page')
    expect(Sidebar.navMark('queries', 'queries')).toBe('page')
    expect(Sidebar.navMark('sheet', 'sheet')).toBe('page')
  })

  it('marks Records as the section a single record is in, and not as the page itself', () => {
    // The distinction is not cosmetic: 'page' becomes aria-current="page", which would tell a
    // screen reader that the records list is on screen when a record is.
    expect(Sidebar.navMark('records', 'record')).toBe('section')
    expect(Sidebar.navMark('home', 'record')).toBe(null)
  })

  it('marks nothing when the address matches no page', () => {
    for (const item of ['home', 'records', 'pipeline', 'sessions', 'queries', 'sheet'] as const) {
      expect(Sidebar.navMark(item, 'unknown')).toBe(null)
    }
  })

  it('never marks two links as the page at once', () => {
    const items = ['home', 'records', 'pipeline', 'sessions', 'queries', 'sheet'] as const
    for (const current of [...items, 'record', 'unknown'] as const) {
      const asPage = items.filter((item) => Sidebar.navMark(item, current) === 'page')
      expect(asPage.length).toBeLessThanOrEqual(1)
    }
  })
})

describe('the page name in the phone bar', () => {
  it('names every page the router can produce, so the bar is never blank', () => {
    for (const { hash } of ADDRESSES) {
      expect(Sidebar.pageTitle(App.pageForRoute(parseRoute(hash))).length).toBeGreaterThan(0)
    }
    // Including the one nobody navigates to on purpose.
    expect(Sidebar.pageTitle('unknown')).toBe('No such page')
  })
})

// ---------------------------------------------------------------------------- renamed addresses

/**
 * An address is a label too — it is what a person pastes to a colleague.
 *
 * So a page whose name changed had its address changed with it, and both halves of that are
 * needed. The old address goes on parsing, so nobody's bookmark breaks. And the shell rewrites the
 * bar afterwards, so the next time that person copies the address they copy the new one — a
 * redirect that leaves the old address on screen teaches the old address for ever.
 */
describe('an address that was renamed still parses, and then corrects itself', () => {
  it('lands an old address on the same page as the new one', () => {
    expect(parseRoute('#/queries').name).toBe('queries')
    expect(parseRoute('#/missing').name).toBe('queries')
    expect(parseRoute('#/queries')).toEqual(parseRoute('#/missing'))
  })

  it('builds every link from the new address, so nothing in the product points at the old one', () => {
    expect(pathFor('queries')).toBe('/missing')
    for (const destination of Sidebar.DESTINATIONS) {
      expect(destination.to, `${destination.label} still points at an address that was renamed`).not.toMatch(
        /^\/queries/,
      )
    }
  })

  it('lands #/decisions on the queue that absorbed it', () => {
    // The choices waiting on you are one of the three things GET /api/waiting reads, so they are
    // drawn on the governance queue with the other two rather than on a page of their own. The old
    // address goes on parsing, and the shell rewrites the bar afterwards.
    expect(App.pageForRoute(parseRoute('#/decisions'))).toBe('governance')
    expect(parseRoute('#/decisions')).toEqual(parseRoute('#/governance'))
    expect(renamedAddress('#/decisions')).toBe('/governance')
  })

  it('says which address an old one has become, and says nothing about one that has not moved', () => {
    expect(renamedAddress('#/queries')).toBe('/missing')
    // Everything after the first segment is carried across untouched: a rename changes which
    // place an address names, never what it says about the thing inside that place.
    expect(renamedAddress('#/queries/unmet')).toBe('/missing/unmet')
    expect(renamedAddress('#/missing')).toBe(null)
    expect(renamedAddress('#/records')).toBe(null)
    expect(renamedAddress('#/')).toBe(null)
  })

  it('refuses a rename whose destination is itself renamed, rather than looping', () => {
    // A reader sent round a loop would watch the address bar flicker and never settle. It is a
    // mistake in the table, not something a reader can cause, so it says so.
    for (const to of Object.values(RENAMED_ADDRESSES)) {
      expect(RENAMED_ADDRESSES[to], `"${to}" is both a rename target and a renamed address`).toBeUndefined()
    }
  })
})
