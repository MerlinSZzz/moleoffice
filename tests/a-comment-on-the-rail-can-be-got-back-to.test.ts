// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COMMENT LEFT ON A PART OF PANELX'S OWN SCREEN CAN BE GOT BACK TO — AS WHERE IT WAS SEEN.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * The owner's line 2149 asks for one thing by name: *"Preserve enough route + semantic target
 * context to return to the meaningful source."* Three of the owner’s comments cannot be returned to. Read
 * off the corpus copy on 25 August 2026, every `annotation` record: seven comments, three of them
 * pointing at a `uiSurface` — `structure.view` once and `plan.board` twice — and not one of the
 * three carries a `seen`. Press `Go to it` on any of them and Mole Office answers with the sentence the owner
 * quoted back at it: *"…is part of every page, so there is no one page to open."*
 *
 * The reason was not that nobody had thought about it. `Seen` was declared in src/shared/targets.ts,
 * `checkSeen` in src/server/lib/targets.ts had been ready to validate one since round nine, and
 * `seenRuleFor` said a target with no stored text REQUIRES one. Two things were missing and each on
 * its own was fatal:
 *
 *   1. NOTHING IN THE BROWSER MEASURED ONE. Nothing under src/web wrote a `seen` at all.
 *   2. NOTHING COULD HAVE STORED ONE IF IT HAD. `SHAPE_SPECS.Context` in src/shared/kinds.ts did not
 *      declare `seen`, and the write door refuses an undeclared key by name. Measured against a
 *      running server that day, a context carrying one came back *"unknown key \"seen\" — a Context
 *      has no field by that name. It takes: target, span, place, revision."* So `checkSeen` was
 *      unreachable, and the declaration in `targets.ts` was a promise the product could not keep —
 *      the shape this campaign keeps finding, here spread over three files at once.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE HOLDS, AND WHAT TURNS EACH CASE RED
 * ---------------------------------------------------------------------------------------
 *
 *   the door takes a `seen`, and the shape says       take `seen` off SHAPE_SPECS.Context, or take
 *   what it takes                                     a field off SHAPE_SPECS.Seen
 *
 *   `cut` is only ever true                           drop that refusal from `checkSeen`
 *
 *   a press lands on the route it was seen on, in     have the `uiSurface` arm answer `{ path }`
 *   an arm of its own                                 instead of `{ seenOn }`
 *
 *   and a comment nothing measured a screen for       have that arm invent a route when `seen` is
 *   still gets the owner’s sentence                           absent — THE OTHER DIRECTION, and what stops
 *                                                     the fix inventing evidence for the owner’s three
 *
 *   a right-click on a part of the screen measures    make `theScreenThisWasSeenOn` return undefined
 *   one, and one on a report block does not
 *
 * The refusals that were already enforced — a `seen` on a thing whose words are in the corpus, and
 * a blank route or build — are pinned in tests/where-a-comment-was-made.test.ts and are not
 * restated here. Two files asserting one rule is how the two come to disagree.
 *
 * The last two cases need a browser and use `liveApp` from tests/helpers.ts, each its own: a throwaway
 * database on two free ports, proved free again at the end. Nothing here touches ./data/panelx.db.
 */

import type { Page } from 'playwright'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { expectPanelError, freshDb, type LiveApp, liveApp, type TestDb, waitForThePage } from './helpers.ts'
import { SHAPE_SPECS } from '../src/shared/kinds.ts'
import type { Context, Seen, Target } from '../src/shared/targets.ts'

/**
 * THE PANE IS IMPORTED AFTER A STAND-IN WINDOW, not at the top of the file.
 *
 * src/web/api.ts reads storage the moment it is first imported and this runner's environment is
 * `node`, so a plain import at module scope takes the whole file down before a case runs. The
 * stand-in is the same one tests/the-review-pane.test.ts installs and nothing in it is under test.
 */
type Bar = typeof import('../src/web/components/agent/ReviewBar.tsx')
let bar: Bar

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
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  bar = await import('../src/web/components/agent/ReviewBar.tsx')
})

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const WORKSPACE = 'panelx'
const HUMAN = { type: 'human', id: 'owner' } as const

/** The sentence the owner was given, kept as a string so a test can watch for it coming back. */
const THE_SENTENCE_THEY_QUOTED = 'is part of every page, so there is no one page to open'

const A_SEEN: Seen = { route: '/plan', quote: 'Find work below and choose a day for it.', build: 'unknown' }
const A_SURFACE: Target = { kind: 'uiSurface', surfaceId: 'rail.modules' }

// ============================================================ the door

describe('the write door takes evidence about a screen, and takes exactly what Seen declares', () => {
  let t: TestDb

  beforeEach(async () => {
    t = await freshDb()
  })
  afterEach(() => {
    t.close()
  })

  /** A comment carrying whatever context this case is about, through the door a browser uses. */
  const write = (context: Context) =>
    t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'annotation',
      title: 'a comment',
      data: { body: 'a comment', context },
      actor: HUMAN,
    })

  it('stores a seen, which no caller could do at all before', () => {
    const made = write({ target: A_SURFACE, place: { at: 'surface' }, seen: A_SEEN })
    const back = t.api.getRecord(made.id)
    const stored = (back?.data as { context: Context }).context
    expect(stored.seen, 'the evidence did not survive the write').toEqual(A_SEEN)
  })

  it('declares the four fields the type declares, and refuses a fifth', () => {
    // ONE LIST AND NOT TWO. What a caller may send is `SHAPE_SPECS.Seen`; what this repository's own
    // code may build is `interface Seen`. They were different for three rounds — the type declared
    // five fields and the door declared none of them — and that is what made every one of the
    // checks below unreachable.
    const shape = SHAPE_SPECS['Seen']
    expect(shape, 'the write door does not know what a Seen is').toBeDefined()
    expect(shape?.fields.map((f) => f.key)).toEqual(['route', 'quote', 'cut', 'build'])
    const err = expectPanelError(
      t,
      () => write({ target: A_SURFACE, seen: { ...A_SEEN, inside: 'r1' } as unknown as Seen }),
      400,
    )
    expect(err.message).toContain('unknown key "inside"')
  })

  it('refuses a cut that is not true, because the flag exists only to say the words were cut', () => {
    const err = expectPanelError(
      t,
      () => write({ target: A_SURFACE, seen: { ...A_SEEN, cut: false as unknown as true } }),
      400,
    )
    expect(err.message).toMatch(/only ever true/i)
    // And the true one goes through, so the refusal above is about the value and not about the key.
    expect(() => write({ target: A_SURFACE, seen: { ...A_SEEN, cut: true } })).not.toThrow()
  })
})

// ============================================================ what a press on the comment does

describe('where a press on a comment about a part of the screen goes', () => {
  it('lands on the route it was seen on, in its own arm so it cannot be drawn as identity', () => {
    const answer = bar.pageHolding({ target: A_SURFACE, seen: A_SEEN })
    expect(answer).toEqual({ seenOn: '/plan' })
    // THE ARM IS THE POINT. `{ path }` and `{ seenOn }` are two claims and the type keeps them
    // apart, so no screen can draw "where you were standing" as "what this is about".
    expect('path' in answer, 'the route it was seen on came back as the page holding it').toBe(false)
  })

  it('says it is where the comment was seen and not what it is about', () => {
    const said = bar.seenOnWords('/plan')
    expect(said).toContain('/plan')
    expect(said).toMatch(/seen on/i)
    expect(said).toMatch(/not what it is about/i)
  })

  it('still gives the owner’s sentence for a comment nothing measured a screen for', () => {
    // THE OTHER DIRECTION. Three of the owner’s comments carry no `seen` and nothing can work one out after
    // the event. Guessing a page for those would be inventing the evidence this whole change exists
    // to keep honest, so the refusal stays and it is the same refusal, with what is missing added.
    const answer = bar.pageHolding({ target: A_SURFACE })
    expect('cannot' in answer, 'a comment with no evidence was given a page anyway').toBe(true)
    if ('cannot' in answer) {
      expect(answer.cannot).toContain(THE_SENTENCE_THEY_QUOTED)
      expect(answer.cannot, 'the refusal does not say what is missing').toMatch(/nothing recorded which page/i)
    }
  })

  it('leaves the twelve rows that hold a real page alone', () => {
    expect(bar.pageHolding({ target: { kind: 'record', recordId: 'r1', workspaceId: WORKSPACE } })).toEqual({ path: '/r/r1' })
    expect(bar.pageHolding({ target: { kind: 'page', route: '/records' } })).toEqual({ path: '/records' })
  })
})

// ============================================================ what a right-click measures

/**
 * THE WHOLE GESTURE, ON A REAL SCREEN: right-click the rail, write a comment, read it back.
 *
 * IT IS THE GESTURE AND NOT THE FUNCTION. `pointedAt` could be called through the page and asked
 * what it answers, and that would prove the capture and nothing else. What is asked for is
 * that a comment left there can be got back to, and between the capture and the comment sit the
 * composer, the write door and `checkSeen` — the two of which were, until this change, the reason
 * nothing could be stored at all. So the assertion is made on the row that came out of the server.
 */
describe('a right-click on the rail keeps the page it was seen on', () => {
  let app: LiveApp
  let page: Page

  // EACH CASE STARTS IN AN OFFICE OF ITS OWN, AND WRITES THE COMMENT IT READS. Wave 13n round Q, item 2j: the second
  // case read the comment the first case wrote, so in a shuffled order (seed 3) it ran first and found none. A shared
  // office would still carry one case's comment, and the review its Start review press began, into the other.
  beforeEach(async () => {
    app = await liveApp({ name: 'seen-at-capture', viewport: { width: 1440, height: 1000 } })
    page = app.page
    await page.goto(`${app.site}/#/plan`)
    await waitForThePage(page)
    await sleep(1500)
  }, 180_000)

  afterEach(async () => {
    await app.stop()
  })

  /**
   * Every comment this database holds, with its stored context, read from the server.
   *
   * READ FROM NODE AND NOT THROUGH THE PAGE, because what is being checked is what the server
   * stored, and a read taken inside the browser under test could be answered by the browser's own
   * memory of what it just wrote.
   */
  const commentsHere = async (): Promise<{ body: string; context: Context | null }[]> => {
    const reply = (await (
      await fetch(`${app.api}/api/messages/comments`, { headers: { 'x-mole-office-workspace': 'default' } })
    ).json()) as { comments?: { kind: string; data?: { body?: string; context?: Context; target?: Context } }[] }
    expect(reply.comments, `the server did not list any comments: ${JSON.stringify(reply).slice(0, 300)}`).toBeDefined()
    // WHICHEVER KEY THE KIND KEEPS IT UNDER: a comment written before comments and messages became
    // one thing keeps it in `context`, and one written since is a message and keeps it in `target`.
    return (reply.comments ?? []).map((row) => ({
      body: row.data?.body ?? '',
      context: (row.kind === 'annotation' ? row.data?.context : row.data?.target) ?? null,
    }))
  }

  /** Right-click an element the way tests/seven-surfaces.test.ts does, and write a comment on it. */
  const commentOn = async (selector: string, words: string): Promise<void> => {
    await page.evaluate((which) => {
      const el = document.querySelector(which)
      if (el === null) throw new Error(`${which} is not on the page`)
      const at = el.getBoundingClientRect()
      el.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: Math.round(at.left + 8),
          clientY: Math.round(at.top + 8),
        }),
      )
    }, selector)
    await page.waitForSelector('.px-talk', { timeout: 15_000 })
    await page.locator('.px-talk textarea').first().fill(words)
    // START REVIEW, THE KEEPING PRESS IN SHAPE B, which replaced Save without sending. It writes the
    // comment first and then starts this page's review; what this file reads is the comment's stored
    // context, and the review it lands in is not under test here.
    await page.getByRole('button', { name: 'Start review', exact: true }).click()
    await page.waitForSelector('.px-talk-said', { timeout: 15_000 })
    await page.getByRole('button', { name: 'Back to reading', exact: true }).click()
    await sleep(300)
  }

  it('stores the route, the words the rail drew, and a build that says unknown', async () => {
    await commentOn('[data-target^="uiSurface/"]', 'this rail row is the one I mean')
    const rows = await commentsHere()
    const written = rows.find((row) => row.body === 'this rail row is the one I mean')
    expect(written, 'the comment was not written at all').toBeDefined()
    const seen = written?.context?.seen
    expect(seen, 'nothing recorded which page this was seen on').toBeDefined()
    expect(seen?.route, 'the address the browser was on was not the one stored').toBe('/plan')
    // "unknown" IS AN ANSWER AND IT IS THE HONEST ONE. Nothing in this build hands the client a
    // commit, so a value here would be one the browser made up. A blank one the server refuses.
    expect(seen?.build).toBe('unknown')
    expect(typeof seen?.quote, 'the words the rail drew were not kept').toBe('string')
  }, 180_000)

  it('and a press on it lands back on that page, said as where it was seen', async () => {
    await commentOn('[data-target^="uiSurface/"]', 'this rail row is the one I press')
    const rows = await commentsHere()
    const written = rows.find((row) => row.body === 'this rail row is the one I press')
    const context = written?.context
    expect(context, 'the comment this case wrote is not there').toBeDefined()
    // The two surfaces that open a comment both read `pageHolding`, so this is the answer both of
    // them act on. The pane's own press is exercised by hand in the wave's dogfood pictures.
    expect(context === undefined || context === null ? null : bar.pageHolding(context)).toEqual({ seenOn: '/plan' })
  }, 180_000)
})
