// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * P7: A COMMENT ABOUT THE PAGE CAN BE FOUND AGAIN, AND FINDING IT DOES NOT MOVE THE RAIL.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE, AND WHY IN A REAL BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * The floor-and-the-frame test, deleted on 12 November 2026, read the source. It could say that
 * the shell spreads a declaration; it could not say that the browser ended up with an element carrying that key, and the
 * whole point of the floor is what the browser ends up with. So this one starts Mole Office, loads a
 * page, and reads the document.
 *
 *   1. THE FLOOR IS ON THE SCREEN. `div.shell` carries `page/<route>`, and the route is the address
 *      the browser is on, not a route somebody typed into a second list.
 *   2. THE TOP BAR SAYS WHAT IT IS. `header.shell-bar` carries `uiSurface/header`.
 *   3. A COMMENT STORED AGAINST THE PAGE IS FILED UNDER THE VERY STRING THE SHELL DREW. The key is
 *      taken off the screen and the target is read out of the corpus, and `targetKey` — the one
 *      function that spells a key — has to turn the second into the first. Before the floor was
 *      emitted the left-hand side of that comparison did not exist, which is why a comment about a
 *      page could never be drawn on the page again.
 *   4. AND THE RAIL DOES NOT MOVE. `.shell` is a flex row, so a `::before` on it — which is how the
 *      mark layer draws every other waiting comment — would become the row's first item and shift
 *      the rail and the whole page sideways. The rail's box is measured with no comment and again
 *      with one, and the two are identical to the pixel. Interaction contract §3.2.
 *
 * THE SECOND HALF OF THE REPAIR: THE PAGE SAYS A COMMENT ABOUT IT EXISTS (problem 2ubMhLXPKUtx).
 *
 * The shell carries the page's key and is a flex row, so nothing may be drawn as part of it: a mark
 * there would move the rail. Contract §3.2 put the page's count in the review strip instead, and the
 * strip was removed on 5 September 2026 (problem Wa-23qH_zbPx). Until 30 September 2026 a comment
 * about the page was therefore drawn nowhere on the page, and the last case here asserted that
 * absence. The count is now a circle beside the page's own heading, placed by `theBlockDrawnFor` in
 * src/web/components/agent/theblock.ts, the same way the count for a comment on a whole record sits
 * beside the record's head (criterion D30).
 *
 * The three cases at the end hold that together: the mark layer really did read the comment, no
 * circle and no generated content is placed on the shell, and one circle carrying the count sits
 * beside the page's heading.
 *
 * The servers come from `liveApp` in tests/helpers.ts. Nothing here touches ./data/panelx.db.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { targetKey, type Target } from '../src/shared/targets.ts'
import { deleteTheCopiedDefaultChapters, type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { FRAME_REGIONS } from './frame-regions.ts'

const ALLOWLIST = fileURLToPath(new URL('./frame-allowlist.json', import.meta.url))

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let app: LiveApp
let page: Page
let apiPort = 0
let webPort = 0

/** The floor's key for one address, through the one function that spells a key. */
const floorKeyFor = (route: string) => targetKey({ kind: 'page', route })

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`http://127.0.0.1:${apiPort}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as Record<string, unknown>
}

/** Where the rail is and how big it is, to the pixel the browser reports. */
async function railBox(): Promise<{ x: number; y: number; width: number; height: number }> {
  return await page.evaluate(() => {
    const rail = document.querySelector('.shell-side')
    if (rail === null) throw new Error('there is no rail on this page')
    const box = rail.getBoundingClientRect()
    return { x: box.x, y: box.y, width: box.width, height: box.height }
  })
}

/** Every element in the document that says what it is, with the key it carries. */
async function declared(): Promise<{ selector: string; target: string }[]> {
  return await page.evaluate(() =>
    [...document.querySelectorAll('[data-target]')].map((el) => ({
      selector: `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').split(' ')[0] ?? ''}`,
      target: el.getAttribute('data-target') ?? '',
    })),
  )
}

beforeAll(async () => {
  app = await liveApp({ name: 'floor', viewport: { width: 1440, height: 1000 } })
  // The default chapters a fresh office copies (wave 13s round 7) would make the records page taller than
  // the window, and the rail would then grow with the page by the comment's own row.
  await deleteTheCopiedDefaultChapters(app.api)
  apiPort = app.apiPort
  webPort = app.webPort
  page = app.page

  await page.goto(`http://127.0.0.1:${webPort}/#/records`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await sleep(900)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the floor is on the screen, not only in the fallback', () => {
  it('puts the page the browser is on onto the shell', async () => {
    const found = await declared()
    const floor = found.filter((one) => one.target.startsWith('page/'))
    expect(floor, 'no element carried a page key').toHaveLength(1)
    expect(floor[0]?.selector).toBe('div.shell')
    expect(floor[0]?.target).toBe(floorKeyFor('/records'))
  })

  it('follows the address bar rather than being written once', async () => {
    await page.goto(`http://127.0.0.1:${webPort}/#/settings`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await sleep(700)
    const found = await declared()
    expect(found.filter((one) => one.target === floorKeyFor('/settings'))).toHaveLength(1)
    await page.goto(`http://127.0.0.1:${webPort}/#/records`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await sleep(700)
  })

  it('says what the top bar is, under the name somebody wrote down', async () => {
    const found = await declared()
    expect(found.filter((one) => one.target === 'uiSurface/header')).toHaveLength(1)
  })

  it('has every region of the frame that is not written down as owed', async () => {
    // THE EXPECTATION COMES OUT OF THE ALLOWLIST, not out of a second list written here. A region
    // taken off that list has to appear on the screen, which is what makes deleting an entry a
    // claim somebody has to make good rather than a line anybody can delete.
    const owed = Object.keys(JSON.parse(readFileSync(ALLOWLIST, 'utf8')) as Record<string, string>)
    const wanted = FRAME_REGIONS.filter((region) => region.id !== 'page' && !owed.includes(region.id))
    const found = await declared()
    for (const region of wanted) {
      expect(
        found.filter((one) => one.target === `uiSurface/${region.id}`),
        `${region.id} is not in tests/frame-allowlist.json and is not on the screen`,
      ).toHaveLength(1)
    }
  })
})

describe('a comment about the page', () => {
  let before: { x: number; y: number; width: number; height: number }

  beforeAll(async () => {
    before = await railBox()
    await post('/api/records', {
      kind: 'annotation',
      title: 'A comment about the whole page',
      data: {
        body: 'This page does not say which project these rows belong to.',
        context: { target: { kind: 'page', route: '/records' } },
      },
    })
    await page.reload({ timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await sleep(1200)
  }, 120_000)

  it('is stored against the very string the shell drew', async () => {
    // ONE SPELLING OF A KEY, CHECKED ACROSS THE TWO SIDES. The browser drew an attribute; the corpus
    // holds a target. `targetKey` is the single function that spells one, and this compares what
    // came off the screen with what came out of the database rather than comparing two hand-written
    // strings. Before the floor was emitted, the left-hand side of this did not exist at all.
    const res = await fetch(`http://127.0.0.1:${apiPort}/api/records?kind=annotation&shape=full`)
    expect(res.ok).toBe(true)
    const reply = (await res.json()) as { records: { data?: { context?: { target?: Target } } }[] }
    const stored = reply.records.map((row) => row.data?.context?.target).filter((one) => one !== undefined)
    expect(stored, 'the comment was not stored').toHaveLength(1)
    const drawn = (await declared()).find((one) => one.target.startsWith('page/'))?.target
    expect(targetKey(stored[0] as Target)).toBe(drawn)
  })

  it('leaves the rail exactly where it was', async () => {
    // The whole reason contract §3.2 refuses a pseudo-element on the shell. A failure here is the
    // rail moving because somebody left a comment.
    expect(await railBox()).toEqual(before)
  })

  it('is a comment this browser really read, about the very key the shell carries', async () => {
    // THE REFUSAL BELOW ONLY MEANS ANYTHING IF THERE WAS SOMETHING TO REFUSE. Without this case, a
    // mark layer that had stopped reading comments entirely would leave the next two green.
    //
    // IT USED TO READ THE STYLESHEET, because the mark was one CSS rule per marked object. There is
    // no such stylesheet since 4 September 2026: a comment is a circle beside the block, in
    // components/agent/CommentCircle.tsx, and there is no rule to look for. So the "something to
    // refuse" is now the comment itself, read back from the same route the mark layer reads.
    const key = floorKeyFor('/records')
    const res = await fetch(`http://127.0.0.1:${apiPort}/api/messages/comments`)
    expect(res.ok, 'the route the mark layer reads answered nothing').toBe(true)
    const reply = (await res.json()) as { comments: { data?: { context?: { target?: Target } } }[] }
    const keys = reply.comments.map((row) =>
      row.data?.context?.target === undefined ? '' : targetKey(row.data.context.target),
    )
    expect(keys, 'the mark layer reads no comment about this page, so the refusal proves nothing').toContain(key)
  })

  it('is refused on the shell, so the rail cannot be moved by leaving a comment', async () => {
    // THE REFUSAL, MEASURED. Nothing draws generated content on the shell, and the circle carrying
    // the page's count is not placed on the shell, which is the whole window. Contract §3.2.
    const drawn = await page.evaluate(() => {
      const shell = document.querySelector('.shell')
      if (shell === null) return { before: 'no shell', onTheShell: -1 }
      const key = shell.getAttribute('data-target') ?? ''
      const edge = shell.getBoundingClientRect()
      const onTheShell = [...document.querySelectorAll<HTMLElement>(`.px-comment-circle[data-comments-on="${key}"]`)].filter(
        (circle) => {
          const box = circle.getBoundingClientRect()
          // THE SHELL'S OWN TOP-RIGHT CORNER, which is where a circle placed on the shell would sit.
          return Math.abs(box.top - edge.top) < 2 && Math.abs(box.right - edge.right) < 40
        },
      ).length
      return { before: window.getComputedStyle(shell, '::before').content, onTheShell }
    })
    expect(drawn.before, 'the shell drew a mark, which is what moves the rail').toBe('none')
    expect(drawn.onTheShell, 'a circle was placed on the shell, which is the whole window').toBe(0)
  })

  it("is drawn beside the page's own heading, where a reader arrives", async () => {
    // PROBLEM 2ubMhLXPKUtx. A comment about the page was stored and nothing on the page said so.
    // Contract §3.2 put the page's count in the review strip; the strip was removed on 5 September
    // 2026 (problem Wa-23qH_zbPx), so the count is drawn as every other count is, as a circle, beside
    // the page's heading at the top of the page. That is where criterion D30 put the count for a
    // comment on a whole record, at one side of the comment.
    //
    // IT USED TO ASSERT THE ABSENCE: "a comment about the page is drawn somewhere after all" had to
    // be an empty list. That wording is replaced in its own commit, before the change that meets it.
    const key = floorKeyFor('/records')
    await page
      .waitForFunction((k) => document.querySelector(`.px-comment-circle[data-comments-on="${k}"]`) !== null, key, {
        timeout: 10_000,
      })
      .catch(() => undefined)
    const seen = await page.evaluate((k) => {
      const heading = document.querySelector('#main h1')
      const circles = [...document.querySelectorAll<HTMLElement>(`.px-comment-circle[data-comments-on="${k}"]`)]
      const box = (el: Element | null) => (el === null ? null : el.getBoundingClientRect().toJSON() as DOMRect)
      let words: DOMRect | null = null
      if (heading !== null) {
        const range = document.createRange()
        range.selectNodeContents(heading)
        words = range.getBoundingClientRect().toJSON() as DOMRect
      }
      // EVERY PRESS ON THE PAGE THE CIRCLE WOULD COVER. Measured at 1440 on 30 September 2026: a
      // circle at the heading's box's right edge covered the first letter of New record.
      const one = circles[0]?.getBoundingClientRect()
      const covered =
        one === undefined
          ? []
          : [...document.querySelectorAll('#main a, #main button')]
              .filter((el) => !el.classList.contains('px-comment-circle'))
              .filter((el) => {
                const b = el.getBoundingClientRect()
                return b.width > 0 && b.left < one.right && b.right > one.left && b.top < one.bottom && b.bottom > one.top
              })
              .map((el) => (el.textContent ?? '').trim())
      return {
        heading: box(heading),
        words,
        covered,
        circles: circles.map((c) => ({ box: box(c), count: (c.textContent ?? '').trim() })),
      }
    }, key)
    expect(seen.heading, 'this page drew no heading, so there is nowhere for the count to go').not.toBeNull()
    expect(seen.circles.length, 'a comment about the page is drawn nowhere on the page').toBe(1)
    const circle = seen.circles[0]?.box
    const heading = seen.heading as DOMRect
    const words = seen.words as DOMRect
    expect(seen.circles[0]?.count, 'the circle does not carry how many comments there are').toBe('1')
    // BESIDE THE HEADING'S WORDS: level with the heading, just after its last word, covering nothing.
    expect(circle?.top ?? -1, 'the circle is above the heading').toBeGreaterThanOrEqual(heading.top - 40)
    expect(circle?.top ?? Infinity, 'the circle is below the heading').toBeLessThanOrEqual(heading.bottom)
    expect(circle?.left ?? -1, 'the circle sits on the heading').toBeGreaterThanOrEqual(words.right - 1)
    expect(circle?.left ?? Infinity, 'the circle is far from the heading').toBeLessThanOrEqual(words.right + 40)
    expect(seen.covered, 'the circle covers a press on the page').toEqual([])
  })
})
