// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW FRAME, THE TWO GROUPS, THE CONFIRM AND THE WAY OUT. The ladder is gone (section 3).
 *
 * ---------------------------------------------------------------------------------------
 * THE BAND THIS FILE IS NAMED AFTER IS GONE
 * ---------------------------------------------------------------------------------------
 *
 * The review band at the very top is removed, and the Reviews press in the sidebar opens the right-hand
 * column instead. Problem `Wa-23qH_zbPx`. `ReviewStrip` is `ReviewFrame` and draws the ring
 * and the announcement and no band; the word, the subject and the count are in the head of the
 * review column. Sections 1 and 2 changed with it. The file keeps its name because renaming a test
 * file rewrites a row of design/ground/TEST-AUDIT-2026-09-03.md that is keyed by it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED BEFORE ANY OF THIS
 * ---------------------------------------------------------------------------------------
 *
 * Turning a review on changed 88 of 1,296,000 pixels at 1440 — one dot, ten pixels across, in the
 * rail — and 0 of 351,000 at 390, where the rail is a drawer. The stylesheet described a full-width
 * band as, in its own words, unmissable, and no component drew one. The pane told the owner "2
 * other comments in this project are waiting and are not in this review. They are still stored."
 * with no ids and no way through. Nothing but the irreversible finish ended a review.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE ASSERTS, AND WHAT IT DELIBERATELY DOES NOT
 * ---------------------------------------------------------------------------------------
 *
 * It asserts what is DRAWN and what a person CAN DO, from rendered markup, from a real browser and
 * from the server's own functions. It does not assert that a value is stored: "the review stores a
 * state" is true of every failing case this campaign started from.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT CHANGED HERE, AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * A third of this file used to read source text. It sliced `App.tsx` for the position of the string
 * `<ReviewStrip />` between two other strings, and it searched the stylesheet for declarations such
 * as `position: fixed` and `background-image: none`. Neither could tell whether a person sees
 * anything: a stylesheet holding a rule says nothing about whether the element exists, whether the
 * rule wins, or whether the thing is on the screen at the size a reader needs.
 *
 * Both are now measured in a browser, in section 2. It starts Mole Office on ports of its own,
 * starts a review, and reads the boxes and computed styles the browser ended up with. That costs
 * the file about five seconds and it is the difference between a claim and a measurement.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Page } from 'playwright'
import { freshDb, type LiveApp, liveApp, type TestDb, waitForThePage } from './helpers.ts'
import { REVIEW_STATES as VOCABULARY } from '../src/shared/states.ts'
import type { Context } from '../src/shared/targets.ts'

type Bar = typeof import('../src/web/components/agent/ReviewBar.tsx')
type ReviewsLib = typeof import('../src/server/lib/reviews.ts')

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const WORKSPACE = 'default'

let bar: Bar
let t: TestDb
let reviews: ReviewsLib

/**
 * TWO SETUPS, AND THEY ARE DELIBERATELY DIFFERENT.
 *
 * The browser half needs a stand-in for storage before src/web/api.ts is first imported, because
 * that module reads it at import time. The server half needs a database of its own, which is made
 * once here rather than once per case: every write in this campaign that touches a review goes to a
 * copy, because a review is a governance act and a test filing one in the owner's corpus would be
 * seeded data presented as a real one. Each case makes its own records, so no case reads another's.
 */
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
  t = await freshDb()
  reviews = await import('../src/server/lib/reviews.ts')
}, 60_000)

afterAll(() => {
  t.close()
})

const render = (el: ReactElement): string => renderToStaticMarkup(el)

const onRecord = (recordId: string): Context => ({ target: { kind: 'record', recordId, workspaceId: WORKSPACE } })

function module(title: string): string {
  return t.api.createRecord({ workspaceId: WORKSPACE, kind: 'module', title, data: { context: 'x' }, actor: HUMAN }).id
}

function comment(title: string, context: Context): string {
  return t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'annotation',
    title,
    data: { body: `words about ${title}`, context },
    actor: HUMAN,
  }).id
}

// ============================================================ 1. what the frame draws

/**
 * THE FRAME WITH NOTHING COLLECTING, READ OFF THE MARKUP IT MAKES.
 *
 * THE BAND ACROSS THE TOP OF EVERY PAGE IS GONE: the Reviews press in the sidebar opens the right-hand
 * column instead. Problem
 * `Wa-23qH_zbPx`. What used to be `ReviewStrip` is `ReviewFrame`, and with nothing collecting it
 * draws nothing a person can see at all: no band, no ring, and an empty announcement.
 *
 * The way into a review is the Reviews control in the sidebar, which was always there beside the
 * band. Section 2 presses it.
 */
describe('the frame a person meets when nothing is collecting', () => {
  // THE STYLESHEET COMES OUT FIRST. The frame carries the whole agent stylesheet in a <style> tag,
  // so every class name in the product appears in the markup whether an element uses it or not.
  const drawn = (): string => render(h(bar.ReviewFrame, {})).replace(/<style[\s\S]*?<\/style>/g, '')

  it('draws no band above the page, which is the whole of what was asked for', () => {
    const html = drawn()
    expect(html, 'the band is still drawn above every page').not.toContain('px-strip')
    expect(html, 'the frame claims a review is collecting when none is').not.toContain(VOCABULARY.collecting.word)
  })

  it('draws no ring either, so a page with nothing collecting is the page it always was', () => {
    expect(drawn(), 'a ring is drawn round the reading with no review collecting').not.toContain('px-strip-ring')
  })

  it('keeps the one announcement, and says nothing in it', () => {
    // A live region is allowed here because this element holds no control and no count: one holding
    // those re-announces every time somebody writes a comment, and this is mounted on every page.
    const html = drawn()
    expect(html).toContain('aria-live="polite"')
    expect(html, 'the announcement says something with no review collecting').toContain('></span>')
  })
})

/** The choices are a closed set, and an unknown stored value is refused rather than obeyed. */
describe('what a person may change about the frame', () => {
  it('offers two edges, four accents, and two of each switch', () => {
    // THERE WERE THREE EDGES. `band` meant "no ring, keep the band across the top of every page",
    // and there is no band to keep, so it and `off` would have been two words for one behaviour.
    expect(bar.REVIEW_EDGES).toEqual(['frame', 'off'])
    expect(bar.REVIEW_ACCENTS.length, 'the brief asks for four hues').toBe(4)
    expect(bar.REVIEW_ACCENTS[0], 'the accent a person never chose is a hue').toBe('neutral')
    expect(bar.REVIEW_MOTIONS).toEqual(['pulse', 'still'])
  })
})

// ============================================================ 2. two channels, measured

/**
 * NO STATE IN THIS PRODUCT IS CARRIED BY HUE ALONE, AND THIS ONE LEAST OF ALL.
 *
 * WHAT CHANGED ON 5 SEPTEMBER 2026. There were three channels — a hatch on the band, a ring round
 * what is being read, and the words in the band. The band was to go, so there are
 * two: the ring, and the lit dot on the sidebar's Reviews control. The words are in the head of the
 * review column, which that control opens, and this section presses it and reads them.
 *
 * ---------------------------------------------------------------------------------------
 * IN A REAL BROWSER, AND WHY IT HAS TO BE
 * ---------------------------------------------------------------------------------------
 *
 * This section used to search the stylesheet for the strings `position: fixed`, `border: 3px solid`
 * and `background-image: none`. A stylesheet holding a declaration is not a person seeing anything.
 * It cannot say whether the element was ever mounted, whether a later rule wins, or whether the
 * words survive the setting that takes the ring away. So this starts Mole Office on ports of its
 * own, starts a review, and measures the document.
 *
 * The servers come from `liveApp` in tests/helpers.ts. Nothing here touches ./data/panelx.db.
 */
describe('the collecting state is drawn two ways, and the words are in the column', () => {
  let app: LiveApp
  let page: Page

  /** Everything this section measures, taken in one pass so the page is in one state throughout. */
  interface Seen {
    strips: number
    ring: DOMRect | null
    shellBody: DOMRect
    rail: DOMRect
    on: { ringDisplay: string; ringPosition: string; ringEdges: string[] }
    off: { ringDisplay: string }
    accents: Record<string, { rev: string; family: string }>
  }
  let seen: Seen
  /** What the review column's head says once the Reviews control in the sidebar has been pressed. */
  let paneHead: { title: string | null; count: string | null }
  /** Whether the dot on the Reviews control was lit while the ring was taken away. */
  let dotWithTheRingTaken = 'unread'

  beforeAll(async () => {
    app = await liveApp({ name: 'review-frame', viewport: { width: 1440, height: 1000 } })
  // THE DRAWER'S CLOSING IS A 240 MS ANIMATION. These cases read whether it has got out of the
  // way, so the animation is off and the measurement is of where it ends, not of the first frame.
  await app.page.emulateMedia({ reducedMotion: 'reduce' })
    page = app.page
    const post = async (path: string, body: unknown): Promise<Record<string, unknown>> => {
      const res = await fetch(`http://127.0.0.1:${String(app.apiPort)}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
      return (await res.json()) as Record<string, unknown>
    }
    const made = (await post('/api/records', { kind: 'module', title: 'The gripper', data: { context: 'x' } }))[
      'record'
    ] as { id: string; workspaceId: string }
    await post('/api/reviews', {
      entry: { target: { kind: 'record', recordId: made.id, workspaceId: made.workspaceId } },
    })
    await page.goto(`http://127.0.0.1:${String(app.webPort)}/#/records`, {
      timeout: 60_000,
    })
    await waitForThePage(page, 60_000)
    await new Promise((r) => setTimeout(r, 1500))

    seen = (await page.evaluate(() => {
      const box = (el: Element | null): DOMRect | null => (el === null ? null : el.getBoundingClientRect().toJSON())
      const root = document.documentElement
      const styleOf = (selector: string): CSSStyleDeclaration | null => {
        const el = document.querySelector(selector)
        return el === null ? null : getComputedStyle(el)
      }
      const snap = () => {
        const ring = styleOf('.px-strip-ring')
        return {
          ringDisplay: ring?.display ?? 'no ring',
          ringPosition: ring?.position ?? 'no ring',
          ringEdges: [
            ring?.borderTopWidth ?? '',
            ring?.borderRightWidth ?? '',
            ring?.borderBottomWidth ?? '',
            ring?.borderLeftWidth ?? '',
          ],
        }
      }
      root.setAttribute('data-review-edge', 'frame')
      const on = snap()
      root.setAttribute('data-review-edge', 'off')
      const off = snap()
      root.setAttribute('data-review-edge', 'frame')

      const forAccent: Record<string, { rev: string; family: string }> = {}
      const familyOf: Record<string, string> = {
        neutral: '',
        blue: '--family-structure',
        green: '--family-work',
        plum: '--family-decisions',
      }
      for (const [accent, token] of Object.entries(familyOf)) {
        root.setAttribute('data-review-accent', accent)
        const now = getComputedStyle(root)
        forAccent[accent] = {
          rev: now.getPropertyValue('--rev').trim(),
          family: token === '' ? '' : now.getPropertyValue(token).trim(),
        }
      }
      root.setAttribute('data-review-accent', 'neutral')

      return {
        // ANY ELEMENT WHOSE CLASS STARTS px-strip THAT IS NOT THE RING. The band and every part of
        // it are gone; searching for the prefix catches a band put back under another name.
        strips: [...document.querySelectorAll('[class*="px-strip"]')].filter(
          (el) => !el.classList.contains('px-strip-ring'),
        ).length,
        ring: box(document.querySelector('.px-strip-ring')),
        shellBody: box(document.querySelector('.shell-body')),
        rail: box(document.querySelector('.shell-side')),
        on,
        off,
        accents: forAccent,
      }
    })) as Seen

    // THE DOT ON THE SIDEBAR'S REVIEWS CONTROL, with the ring taken away. This browser's store is
    // empty: the review was started through the API, so only Mole Office knows it is collecting
    // (problems 38r1U3Cu6lxc and VsCAN2HSUQS1). The dot's read is its own request, so it is waited
    // for rather than read once.
    await page.evaluate(() => document.documentElement.setAttribute('data-review-edge', 'off'))
    dotWithTheRingTaken = await page
      .waitForFunction(
        () =>
          getComputedStyle(document.querySelector('.px-strip-ring') ?? document.body).display === 'none' &&
          document.querySelector('.px-review-switch .px-review-dot')?.getAttribute('data-on') === '1',
        undefined,
        { timeout: 10_000 },
      )
      .then(
        () => 'lit',
        () => 'not lit',
      )
    await page.evaluate(() => document.documentElement.setAttribute('data-review-edge', 'frame'))

    // AND THEN THE PRESS: the Reviews press in the sidebar opens the right-hand column.
    await page.click('.px-review-switch')
    await page.waitForSelector('.px-pane', { timeout: 20_000 })
    // WAITING FOR THE COUNT AND NOT ONLY FOR THE ELEMENT. The state word and the subject are on the
    // list this column already fetched; the count is a second request, so the head is drawn without
    // it for a moment and a read taken then is a read of a half-arrived answer.
    await page.waitForFunction(
      () => (document.querySelector('.px-pane-count')?.textContent ?? '').includes('comment'),
      undefined,
      { timeout: 20_000 },
    )
    // AND FOR THE NAME OF THE THING, which is a third request (problem viFpIR398ecU). A head that
    // never names it is what the case below goes red on, so a timeout here is not a failure.
    await page
      .waitForFunction(() => (document.querySelector('.px-pane-count')?.textContent ?? '').includes('“'), undefined, {
        timeout: 10_000,
      })
      .catch(() => undefined)
    paneHead = (await page.evaluate(() => ({
      title: document.querySelector('.px-pane-title')?.textContent ?? null,
      count: document.querySelector('.px-pane-count')?.textContent ?? null,
    }))) as { title: string | null; count: string | null }
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  it('draws no band above the page at all, at the width the band was widest', () => {
    expect(seen.strips, 'a band is still drawn above the page').toBe(0)
  })

  it('draws the ring on four edges of what is being read, outside the rail', () => {
    // FIXED TO THE WINDOW, NOT TO THE DOCUMENT. A report in this corpus is seventeen thousand
    // pixels tall, and an edge on the box the page is in is one a reader sees the top of once.
    expect(seen.on.ringPosition, 'the ring scrolls with the document').toBe('fixed')
    expect(seen.on.ringDisplay, 'the ring is not drawn').not.toBe('none')
    for (const width of seen.on.ringEdges) {
      expect(Number.parseFloat(width), 'the ring is missing an edge').toBeGreaterThan(0)
    }
    expect(seen.ring, 'the ring is not in the document').not.toBeNull()
    expect(Math.round(seen.ring?.left ?? -1), 'the ring does not start where the content does').toBe(
      Math.round(seen.shellBody.left),
    )
    expect(Math.round(seen.ring?.width ?? -1), 'the ring is not as wide as the content').toBe(
      Math.round(seen.shellBody.width),
    )
    expect(seen.ring?.left ?? -1, 'the ring is drawn over the rail').toBeGreaterThanOrEqual(seen.rail.right)
  })

  /**
   * EDGE=OFF TAKES THE RING. The band used to leave the word and the glyph behind; there is no
   * band, so what is left is the lit dot on the sidebar's Reviews control. The test after the head
   * of the column measures that dot lit with the ring taken (problem `VsCAN2HSUQS1`).
   *
   * NOTHING IN THE PRODUCT CAN SET THIS TODAY. `setReviewLook` has no caller, so no reader can
   * reach the state.
   */
  it('lets the weakest setting take the ring', () => {
    expect(seen.off.ringDisplay, 'Edge=Off does not take the ring').toBe('none')
  })

  it('says what is collecting in the column the sidebar opens, which is where the band said it', () => {
    // THE REVIEWS PRESS IN THE SIDEBAR OPENS THE RIGHT-HAND COLUMN. The word, the subject and the count were the
    // three things the band carried. All three are here, and the count says what it counted rather
    // than being a bare number — the front page once had a lone 1 on it that did not say what it counted.
    expect(paneHead.title, 'the column has no head').toBe('Your reviews')
    expect(paneHead.count, 'the column does not say a review is collecting').toContain(VOCABULARY.collecting.word)
    // IT NAMES THE THING, NOT ITS KIND (problem viFpIR398ecU). It used to read "Collecting · Record ·
    // 0 comments" for a review of a module called The gripper, so a person with two reviews could
    // not tell which one was collecting. The kind of record and its title are both said.
    expect(paneHead.count, 'the column does not say which thing the review is of').toContain('Module “The gripper”')
    expect(paneHead.count, 'the column says a bare number instead of what it counted').toContain('0 comments')
  })

  /**
   * THE DOT ASKS MOLE OFFICE, NOT THIS BROWSER (problems 38r1U3Cu6lxc and VsCAN2HSUQS1).
   *
   * The dot used to read this browser's own store. So a review started anywhere else left it hollow
   * under a ring saying a review was collecting, and with `Edge: off` nothing on the screen said so
   * at all. The review here was started through the API and this browser remembered nothing.
   */
  it('lights the dot on the Reviews control for a review this browser did not start, with the ring taken', () => {
    expect(dotWithTheRingTaken, 'with the ring taken, nothing on the screen says a review is collecting').toBe('lit')
  })

  /**
   * AND THE OTHER WAY ROUND: A REVIEW THAT ENDED ELSEWHERE DOES NOT LEAVE THE DOT LIT.
   *
   * Collecting is finished through the API, as another browser would finish it, and this browser is
   * then told to remember that review as collecting. After a reload the dot must say what Mole
   * Office says. It changes what Mole Office holds, so it comes after every test that reads the
   * collecting review, and before the phone test, which does not need one.
   */
  it('does not light the dot for a review this browser remembers but Mole Office says has finished', async () => {
    const api = `http://127.0.0.1:${String(app.apiPort)}`
    const listed = (await (await fetch(`${api}/api/reviews?state=collecting`)).json()) as { reviews: { id: string }[] }
    const id = listed.reviews[0]?.id
    if (id === undefined) throw new Error('no review is collecting, so this test would prove nothing')
    const finished = await fetch(`${api}/api/reviews/${encodeURIComponent(id)}/finish-collecting`, { method: 'POST' })
    expect(finished.ok, await finished.text()).toBe(true)
    await page.evaluate((reviewId) => {
      window.localStorage.setItem('mole-office.review', `shut|||${reviewId}|default`)
    }, id)
    const answered = page.waitForResponse((reply) => reply.url().includes('/api/reviews?state=collecting'), {
      timeout: 30_000,
    })
    await page.reload({ timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await answered
    await new Promise((r) => setTimeout(r, 1000))
    const remembered = await page.evaluate(() => window.localStorage.getItem('mole-office.review'))
    expect(remembered, 'the browser does not remember the review, so this test would prove nothing').toContain(id)
    const dot = await page.evaluate(
      () => document.querySelector('.px-review-switch .px-review-dot')?.getAttribute('data-on') ?? null,
    )
    expect(dot, 'the dot says a review is collecting after Mole Office said it finished').toBeNull()
  }, 120_000)

  /**
   * ON A PHONE THE MENU HAS TO GET OUT OF THE WAY, and until the band was removed it did not have
   * to. Below 1024px the sidebar is a drawer over the page, so the only way to reach the Reviews
   * control is to open the menu — and the menu then covers the column the press just opened.
   *
   * There used to be a way in outside the drawer: the band across the top of every page carried a
   * button. The band was to go, so this is the only way in there is, and the rule that the Reviews
   * press in the sidebar opens the right-hand column is only true at 390 if the drawer closes.
   *
   * IT IS LAST IN THIS SECTION because it changes the window. Everything above reads the snapshot
   * taken at 1440 in `beforeAll`, so nothing above it is affected.
   */
  it('closes the phone menu on the press, so the column it opened is not behind it', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload({ timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await new Promise((r) => setTimeout(r, 1200))

    // Start from a shut column, whatever this browser remembered.
    if ((await page.$('.px-pane')) !== null) {
      await page.click('.shell-menu')
      await page.waitForSelector('#shell-side', { timeout: 20_000 })
      await page.click('.px-review-switch')
      await new Promise((r) => setTimeout(r, 800))
    }
    expect(await page.$('.px-pane'), 'the column was already open, so this press proves nothing').toBeNull()

    await page.click('.shell-menu')
    await page.waitForSelector('.px-review-switch', { timeout: 20_000 })
    await page.click('.px-review-switch')
    await page.waitForSelector('.px-pane', { timeout: 20_000 })

    // THE DRAWER IS SHUT. It is drawn either way at this width, so what is measured is whether it
    // is over the page — the same question the scrim answers for a reader.
    const drawer = await page.evaluate(() => {
      const side = document.querySelector('#shell-side')
      if (side === null) return { there: false, covering: false }
      const box = side.getBoundingClientRect()
      return { there: true, covering: box.width > 0 && box.right > 0 && getComputedStyle(side).visibility !== 'hidden' }
    })
    expect(drawer.there, 'there is no sidebar at 390 at all').toBe(true)
    expect(drawer.covering, 'the menu is still over the page, covering the column the press opened').toBe(false)
  }, 120_000)

  it('has an accent that is a token this product already measures, and never a hue of its own', () => {
    // EVERY ACCENT IS A FAMILY RAIL, and those are the tokens held to a measured contrast. A hex
    // written into the review stylesheet would be a colour nothing measures. Read from the browser:
    // the value `--rev` ends up with under each accent is the family token's own value.
    for (const [accent, both] of Object.entries(seen.accents)) {
      expect(both.rev.length, `${accent} leaves the ring with no colour at all`).toBeGreaterThan(0)
      if (accent === 'neutral') continue
      expect(both.family.length, `${accent} names a family token this palette does not have`).toBeGreaterThan(0)
      expect(both.rev, `${accent} draws a hue of its own instead of the family rail`).toBe(both.family)
    }
    const chosen = Object.entries(seen.accents)
      .filter(([accent]) => accent !== 'neutral')
      .map(([, both]) => both.rev)
    expect(new Set(chosen).size, 'two accents leave the ring the same colour').toBe(chosen.length)
  })
})

// ============================================================ 3. the ladder, taken out

/*
 * THE ROW OF FOUR STEPS IS GONE. The owner took it out of the review column on 6 October 2026, by answer B of a
 * decision. The five cases that were here went with it.
 * A test deleted on 13 November 2026 held it out, in English and in Chinese. The section keeps its number so
 * that sections 4 onward keep theirs.
 */

// ============================================================ 4. why a comment is not in it

/**
 * SEVEN REASONS, CLOSED, AND EVERY ONE OF THEM HAS A WORD.
 *
 * The map is total over the server's own union, so a reason that reaches a screen without a word
 * fails the build rather than drawing blank, and an eighth cannot be invented in the browser.
 */
describe('the word an excluded row draws', () => {
  it('has one for every reason the server can send, and no more', () => {
    for (const reason of reviews.NOT_IN_IT_REASONS) {
      const drawn = bar.WHY_NOT_IN_IT[reason]
      expect(drawn, `${reason} has no word`).toBeDefined()
      expect(drawn.word.length, `${reason} draws nothing`).toBeGreaterThan(0)
      expect(drawn.detail.length, `${reason} has no sentence for its title`).toBeGreaterThan(0)
    }
    expect(Object.keys(bar.WHY_NOT_IN_IT).length, 'the browser invented a reason').toBe(
      reviews.NOT_IN_IT_REASONS.length,
    )
  })

  it('tells the seven apart, so two reasons are never one word', () => {
    const words = reviews.NOT_IN_IT_REASONS.map((reason) => bar.WHY_NOT_IN_IT[reason].word)
    expect(new Set(words).size, 'two reasons answer to the same word').toBe(words.length)
  })
})

// ============================================================ 5. the way out

/**
 * ABANDONING A REVIEW. The server half, driven through the library rather than a browser, because
 * what has to hold is what happens to the rows: the review ends, nothing is sent, and the comments
 * are untouched.
 *
 * IT RUNS AGAINST THE FILE'S TEST DATABASE. Every write in this campaign that touches a review goes
 * to a copy — a review is a governance act and a test filing one in the owner's corpus would be
 * seeded data presented as a real one. Each case makes its own records there.
 */
describe('a review that is abandoned', () => {
  it('is a fifth state that every total map over the states has a value for', () => {
    expect(reviews.REVIEW_STATES).toContain('abandoned')
    expect(bar.REVIEW_STATE_WORDS.abandoned.length).toBeGreaterThan(0)
  })

  it('stops collecting, sends nothing, and leaves every comment where it was', () => {
    const gripper = module('The gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    const wrote = comment('the fiducial path', onRecord(gripper))
    expect(reviews.readReview(started.review.id, WORKSPACE).members.map((m) => m.id)).toContain(wrote)

    const after = reviews.abandonReview(started.review.id, WORKSPACE, HUMAN)

    expect(after.review.state, 'the review is not ended').toBe('abandoned')
    expect(after.review.sentAt, 'abandoning sent something').toBe(null)
    expect(after.review.threadId, 'abandoning started a conversation').toBe(null)
    expect(after.review.membershipFrozen, 'what it held can still change').toBe(true)
    // THE COMMENT IS UNTOUCHED. Not deleted, not marked, not moved: an abandoned review is a review
    // nobody wants and it is not a retraction of what somebody wrote.
    const stillThere = t.api.listRecords({ workspaceId: WORKSPACE, kind: 'annotation' }).find((r) => r.id === wrote)
    expect(stillThere, 'the comment was deleted by ending the review').toBeDefined()
    // ITS WORDS ARE WHAT IS CHECKED, not a `state` key: window B took that field off the annotation
    // kind, and it was the field that could be read as "this review did something to my comment".
    expect(stillThere?.data['state'], 'the comment gained a key no kind declares').toBeUndefined()
    expect(stillThere?.data['body'], 'the comment was changed by ending the review').toBe('words about the fiducial path')
    // AND IT IS STILL LISTED. A review that vanished would be a delete wearing another word.
    expect(reviews.listReviews({ workspaceId: WORKSPACE }).reviews.map((r) => r.id)).toContain(started.review.id)
  })

  it('gives the comments of an abandoned review back to the next review, under their own reason', () => {
    // CONTRACT 6.18: the annotations are untouched and appear in the next review's `Not in it` with
    // the reason `Earlier`. That only holds if an abandoned review is not read as "another review"
    // — and it holds a written-down membership, which is exactly what that reading looks at.
    const gripper = module('The gripper')
    const first = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    const wrote = comment('the fiducial path', onRecord(gripper))
    // STAMPED INTO THE PAST ON PURPOSE. Everything in this test happens inside one second, and a
    // comment written in the same second as a review's press is a case Mole Office refuses to guess
    // about — it says so in the review's own gaps. The fact under test is what happens to a comment
    // written plainly before the second review, so it is stamped there.
    t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run('2020-01-01 09:00:00', wrote)
    reviews.abandonReview(first.review.id, WORKSPACE, HUMAN)

    const second = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    const out = reviews.commentsNotIn(second.review.id, WORKSPACE)
    const row = out.rows.find((one) => one.id === wrote)
    expect(row, 'the comment of an abandoned review is not offered to the next one at all').toBeDefined()
    expect(row?.inAnotherReview, 'an ended review is claiming the comments it never sent').toBe(null)
    expect(row?.reason).toBe('earlier')
    expect(bar.WHY_NOT_IN_IT[row?.reason ?? 'not-known'].word).toBe('Earlier')
  })

  it('is refused by name on a review that is not collecting', () => {
    const gripper = module('The gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    reviews.abandonReview(started.review.id, WORKSPACE, HUMAN)
    let said = ''
    try {
      reviews.abandonReview(started.review.id, WORKSPACE, HUMAN)
    } catch (err) {
      said = err instanceof Error ? err.message : String(err)
    }
    expect(said, 'ending an ended review was not refused').toContain('abandoned')
    expect(said, 'the refusal does not say nothing changed').toContain('Nothing has been changed')
  })

  it('is refused by name if anybody tries to set the word instead of doing the act', () => {
    const gripper = module('The gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    let said = ''
    try {
      reviews.setState(started.review.id, WORKSPACE, 'abandoned')
    } catch (err) {
      said = err instanceof Error ? err.message : String(err)
    }
    expect(said, 'setting the word was not refused').toContain('abandon')
    expect(said, 'the refusal does not say which act does the work').toContain('/abandon')
  })

  it('refuses to organise or to send one, by name', () => {
    const gripper = module('The gripper')
    const started = reviews.startReview({ workspaceId: WORKSPACE, entry: onRecord(gripper) }, HUMAN)
    comment('the fiducial path', onRecord(gripper))
    reviews.abandonReview(started.review.id, WORKSPACE, HUMAN)
    expect(() => reviews.organiseRequest(started.review.id, WORKSPACE)).toThrow(/abandoned/)
    expect(() => reviews.sendReview(started.review.id, WORKSPACE, [], HUMAN)).toThrow(/abandoned/)
    // AND THE PREVIEW, WHICH WRITES NOTHING AND IS ALLOWED TO ANSWER, SAYS SO BEFORE ANYBODY TRIES.
    expect(reviews.whereTheCommentsWouldGo(started.review.id, WORKSPACE).says).toContain('abandoned')
  })
})
