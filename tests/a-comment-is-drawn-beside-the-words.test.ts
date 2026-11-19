// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COMMENT IS DRAWN BESIDE THE BLOCK IT IS ABOUT, AND NEVER INSIDE THE BLOCK'S WORDS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, AND WHAT IS WANTED
 * ---------------------------------------------------------------------------------------
 *
 * One comment was left on the decision page of proposal `bftgXUYjlk4m`.
 * The mark layer drew the count as CSS generated content on the element carrying that block's key:
 * `content: "❝ 1" / "1 comment on this part of a record, already sent"` on the summary paragraph.
 * A `::before` on a paragraph is that paragraph's first inline box, so the number was drawn at the
 * start of the summary, and the label "Summary" moved down a line to make room for it. That is not
 * what is wanted:
 *
 *   A comment's count must not be put into the text. It should be a floating circle with the number
 *   of comments in it. And this explains the 1 at the top of the front page.
 *
 * The last clause is the second half of this file: the review strip at the top of every page drew
 * the number of comments in the review that was collecting, with no word beside it, so the front
 * page had a bare `1` on it that nothing explained. Problem `muxtJ4V4HfUj`.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS MEASURED IN A BROWSER AND NOT FROM THE SOURCE
 * ---------------------------------------------------------------------------------------
 *
 * Generated content is not in `textContent`. A test that read the paragraph's text would have
 * passed on the day the owner opened that page and saw a 1 in the middle of the owner's own sentence. What
 * a person sees is `getComputedStyle(el, '::before').content`, and only a browser has that. So this
 * file starts one, and every assertion here is a reading of a page that was drawn.
 *
 * tests/marks-at-rest.test.ts holds the half that needs no browser: what `circlesToDraw` produces.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { liveApp, type LiveApp, waitForThePage } from './helpers.ts'
import { howFarThePageRunsSideways } from './the-page-scroller.ts'
import { en } from '../src/shared/words/en.ts'

let app: LiveApp
let page: Page
let recordId = ''
let workspaceId = ''
let theSummary = ''

/** The record's summary, long enough that a number spliced into it would be plain to see. */
const SUMMARY =
  'The gripper closed on the third trial and held for eleven seconds before the force reading drifted.'

/** Everything one pass over the drawn page measured. */
interface Seen {
  circles: { on: string; number: string; name: string; left: number; right: number; top: number }[]
  /** What the summary paragraph draws before its own text, as the browser computed it. */
  summaryBefore: string
  /** The summary paragraph's text, which has to be the record's summary and nothing else. */
  summaryText: string
  /** Every element on the page that draws generated content, with what it draws. */
  generated: { where: string; drew: string }[]
  /** How far the document scrolls sideways past the window, or the page past the box it scrolls in, whichever is more. */
  overflow: number
}

async function readThePage(): Promise<Seen> {
  const seen = (await page.evaluate(() => {
    const drawnBefore = (el: Element): string => {
      const said = getComputedStyle(el, '::before').content
      return said === 'none' || said === 'normal' ? '' : said
    }
    const summary = document.querySelector('.rp-lede')
    const generated: { where: string; drew: string }[] = []
    for (const el of document.querySelectorAll('#main *')) {
      const drew = drawnBefore(el)
      if (drew === '' || drew === '""') continue
      generated.push({ where: (el.getAttribute('data-target') ?? el.tagName).slice(0, 80), drew })
    }
    return {
      circles: [...document.querySelectorAll('.px-comment-circle')].map((one) => {
        const box = one.getBoundingClientRect()
        return {
          on: one.getAttribute('data-comments-on') ?? '',
          number: (one.textContent ?? '').trim(),
          name: one.getAttribute('aria-label') ?? '',
          left: Math.round(box.left),
          right: Math.round(box.right),
          top: Math.round(box.top + window.scrollY),
        }
      }),
      summaryBefore: summary === null ? 'no summary paragraph' : drawnBefore(summary),
      summaryText: summary === null ? 'no summary paragraph' : (summary.textContent ?? ''),
      generated,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })) as Seen
  return { ...seen, overflow: Math.max(seen.overflow, await howFarThePageRunsSideways(page)) }
}

/** The words in the page that a comment circle is drawn over, each with the circle it is under. */
async function wordsUnderACircle(): Promise<string[]> {
  return page.evaluate(() => {
    const under: string[] = []
    const circles = [...document.querySelectorAll('.px-comment-circle')].map((one) => ({ on: one.getAttribute('data-comments-on') ?? '', box: one.getBoundingClientRect() }))
    const walker = document.createTreeWalker(document.querySelector('#main') ?? document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if ((node.textContent ?? '').trim() === '' || node.parentElement?.closest('.px-comment-circle') != null) continue
      // Text in a shut fold is not drawn, though the browser still gives it a box where it would be.
      if (node.parentElement?.checkVisibility() !== true) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const rect of range.getClientRects()) {
        for (const circle of circles) {
          const across = Math.min(rect.right, circle.box.right) - Math.max(rect.left, circle.box.left)
          const down = Math.min(rect.bottom, circle.box.bottom) - Math.max(rect.top, circle.box.top)
          if (across > 1 && down > 1) under.push(`${circle.on}: ${(node.textContent ?? '').trim().slice(0, 40)}`)
        }
      }
    }
    return [...new Set(under)]
  })
}

/** Each circle that lies over the block it is about, by how far. A circle covering only a border still covers the block. */
async function circlesOverTheirBlock(): Promise<string[]> {
  return page.evaluate(() => {
    const over: string[] = []
    for (const one of document.querySelectorAll('.px-comment-circle')) {
      const on = one.getAttribute('data-comments-on') ?? ''
      const block = [...document.querySelectorAll('[data-target]')].find((el) => el.getAttribute('data-target') === on)
      if (block === undefined) {
        over.push(`${on}: no block carries this key`)
        continue
      }
      const a = one.getBoundingClientRect()
      const b = block.getBoundingClientRect()
      const across = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const down = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (across > 1 && down > 1) over.push(`${on}: ${String(Math.round(across))} by ${String(Math.round(down))}`)
    }
    return over
  })
}

beforeAll(async () => {
  app = await liveApp({ name: 'comment-circle', viewport: { width: 1440, height: 1000 } })
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
  const made = (await post('/api/records', {
    kind: 'module',
    title: 'The gripper',
    summary: SUMMARY,
    data: { context: 'the hand that closes on the part' },
  }))['record'] as { id: string; workspaceId: string; summary: string }
  recordId = made.id
  workspaceId = made.workspaceId
  // THE SUMMARY IS READ BACK FROM THE RECORD, not asserted against the constant above. What has to
  // hold is that the page draws what is STORED, so the stored string is the one to compare with.
  theSummary = made.summary

  const comment = async (regionId: string, body: string): Promise<void> => {
    await post('/api/records', {
      kind: 'message',
      title: body,
      data: {
        body,
        target: { target: { kind: 'region', recordId, regionId }, place: { at: 'surface' } },
        sentBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
      },
    })
  }
  // TWO ON ONE BLOCK AND ONE ON ANOTHER, so a circle drawing the wrong number cannot pass by
  // drawing the same number everywhere.
  await comment('section.summaryLine', 'Which trial is this the third of?')
  await comment('section.summaryLine', 'Eleven seconds by which clock?')
  await comment('section.changes', 'Who changed it last?')

  // AND ONE FROM AN AGENT, on a third block. Criterion M7 says an agent's comment is drawn where a
  // person's is; what has to hold here is that the circle is the same circle and that the card the
  // agent's words go in is still there beside the block.
  await post('/api/records', {
    kind: 'agent',
    title: 'Reader Y',
    data: { handle: 'reader-y', runtime: 'claude-code', state: 'active' },
  })
  const said = await fetch(`http://127.0.0.1:${String(app.apiPort)}/api/records`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': 'reader-y',
    },
    body: JSON.stringify({
      kind: 'message',
      title: 'A remark from an agent',
      data: {
        body: 'The force reading drifted on every trial, not only this one.',
        target: {
          target: { kind: 'region', recordId, regionId: 'section.links' },
          place: { at: 'surface' },
        },
      },
    }),
  })
  if (!said.ok) throw new Error(`the agent's comment answered ${String(said.status)}: ${await said.text()}`)

  await page.goto(`http://127.0.0.1:${String(app.webPort)}/#/r/${recordId}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await new Promise((r) => setTimeout(r, 2000))
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the comments on a block are one circle beside it', () => {
  it('draws one circle per block, carrying how many comments are on that block', async () => {
    const seen = await readThePage()
    const summary = seen.circles.find((one) => one.on === `region/${recordId}/section.summaryLine`)
    const changes = seen.circles.find((one) => one.on === `region/${recordId}/section.changes`)
    expect(summary, 'the block with two comments on it has no circle').toBeDefined()
    expect(changes, 'the block with one comment on it has no circle').toBeDefined()
    expect(summary?.number, 'the circle on the block with two comments does not say two').toBe('2')
    expect(changes?.number, 'the circle on the block with one comment does not say one').toBe('1')
  })

  it('puts nothing into the words of a block, which is the whole of what was asked for', async () => {
    const seen = await readThePage()
    // WHAT THE OWNER SAW. The paragraph drew "❝ 1" before its own first character.
    expect(seen.summaryBefore, 'the summary paragraph draws something before its own words').toBe('')
    // AND THE WORDS ARE THE RECORD'S OWN, character for character. The label the page puts in
    // front of the summary is part of the page's own drawing and is taken off before comparing.
    // It is the word list's own word since plan 7FEOshq3mBGG (G2a), and the look sets its case.
    const label = en['record.summary']
    expect(seen.summaryText.startsWith(label), `the summary paragraph does not start with its label "${label}"`).toBe(true)
    expect(seen.summaryText.slice(label.length)).toBe(theSummary)
    // NOT ONE ELEMENT ON THE PAGE DRAWS A COUNT AS GENERATED CONTENT. A rule that came back on one
    // shape and not on another would pass the two assertions above and still put a number in the
    // middle of a report.
    for (const one of seen.generated) {
      expect(one.drew, `${one.where} draws a comment count inside the page`).not.toMatch(/[❝✎]|\bcomment/)
    }
  })

  it('is a button with a name saying how many comments there are and what they are on', async () => {
    const seen = await readThePage()
    const summary = seen.circles.find((one) => one.on === `region/${recordId}/section.summaryLine`)
    expect(summary?.name, 'the circle does not say how many comments it stands for').toContain('2 comments')
    expect(summary?.name, 'the circle does not say what the comments are on').toContain('on this part of a record')
    const role = await page.evaluate(() => {
      const one = document.querySelector('.px-comment-circle')
      return one === null ? 'no circle' : one.tagName
    })
    expect(role, 'the circle is not a button, so a keyboard cannot reach it').toBe('BUTTON')
  })

  it('sits beside the block and never over the page, at every width', async () => {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await new Promise((r) => setTimeout(r, 700))
      const seen = await readThePage()
      expect(seen.circles.length, `no circle is drawn at ${String(width)}`).toBeGreaterThan(0)
      // A CIRCLE PUSHING THE DOCUMENT SIDEWAYS IS A CIRCLE THAT BROKE EVERY PAGE. Measured at 660
      // and 390 on 4 September 2026, before the placement was held inside the column: 6 and 2
      // pixels of horizontal scroll on a page that had none.
      expect(seen.overflow, `the page scrolls sideways at ${String(width)}`).toBeLessThanOrEqual(0)
      for (const circle of seen.circles) {
        expect(circle.right, `a circle is drawn off the right of the window at ${String(width)}`).toBeLessThanOrEqual(
          width,
        )
        expect(circle.left, `a circle is drawn off the left of the window at ${String(width)}`).toBeGreaterThan(0)
      }
      // AND NO CIRCLE LIES OVER A WORD. At 390 the circle used to straddle a block's top-right corner, and on a
      // report table it covered the first row (problem E73Do6DbqZCH, item 9). Only the corner chat button may
      // cover words, as point 4 of a decision allows.
      expect(await wordsUnderACircle(), `a circle covers words at ${String(width)}`).toEqual([])
      expect(await circlesOverTheirBlock(), `a circle lies over its block at ${String(width)}`).toEqual([])
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
    await new Promise((r) => setTimeout(r, 700))
  })

  it('opens the comments on a press, rather than being a number nobody can act on', async () => {
    const before = await page.evaluate(() => document.querySelectorAll('.px-pane').length)
    expect(before, 'the review column was already open, so this press proves nothing').toBe(0)
    await page.click(`.px-comment-circle[data-comments-on="region/${recordId}/section.summaryLine"]`)
    await new Promise((r) => setTimeout(r, 800))
    const after = await page.evaluate(() => ({
      panes: document.querySelectorAll('.px-pane').length,
      // What Mole Office says it is doing about the comment that was pressed.
      showing: document.body.textContent?.includes('Your reviews') ?? false,
    }))
    expect(after.panes, 'the press opened nothing').toBeGreaterThan(0)
    expect(after.showing, 'the column opened without saying what is in it').toBe(true)
  })
})

/**
 * AN AGENT'S COMMENT IS THE SAME COMMENT. Criterion M7.
 *
 * The card holding an agent's words is drawn beside the block by components/agent/AgentSaidHere.tsx,
 * and it stays. What changed is the count beside it, which is now the same circle a person's own
 * comment gets, so nothing about who wrote a comment changes how many there are said to be.
 */
describe('an agent that comments gets the same circle, and keeps its card', () => {
  it('draws the card beside the block and a circle for the same block', async () => {
    const seen = await readThePage()
    const circle = seen.circles.find((one) => one.on === `region/${recordId}/section.links`)
    expect(circle?.number, 'the block an agent commented on has no circle, or the wrong number').toBe('1')
    const card = await page.evaluate(
      (key) => document.querySelectorAll(`.px-said[data-said-on="${key}"]`).length,
      `region/${recordId}/section.links`,
    )
    // THE CARD IS PLACED FROM THE PAGE, NOT FROM THE PAGE HAPPENING TO CHANGE SIZE. Measured on
    // 4 September 2026: with the mark drawn beside the block instead of inside it, a report shorter
    // than the window stopped growing when a comment arrived, and the card that was waiting on that
    // growth was never placed at all.
    expect(card, 'an agent said something about this block and no card was drawn').toBe(1)
  })
})

/**
 * THE SECOND HALF: WHAT THE 1 AT THE TOP OF THE FRONT PAGE WAS.
 *
 * The review strip was at the top of every page, the front page included. It drew the number of
 * comments in the collecting review and nothing else, so the front page carried a bare number that
 * said what it was nowhere. A number with no word is not a count.
 *
 * THE BAND IS GONE AND THE COUNT MOVED. The extra review strip at the top was to go: pressing Reviews
 * in the left sidebar to open the right-hand column is enough. Problem `Wa-23qH_zbPx`. The count is in
 * the head of the review column now, which the Reviews control in the sidebar opens. The case is
 * the same case and it is asked in the new place: the count still has to say what it counted.
 */
describe('the count of a collecting review says what it counted', () => {
  it('draws no bare number in the review column, and names what it counted instead', async () => {
    const res = await fetch(`http://127.0.0.1:${String(app.apiPort)}/api/reviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entry: { target: { kind: 'record', recordId, workspaceId } } }),
    })
    expect(res.ok, `starting a review answered ${String(res.status)}`).toBe(true)
    // ONE COMMENT WRITTEN AFTER THE REVIEW STARTED, so there is a real 1 to draw. A review collects
    // what was written since it started, and the three comments above were written before it, so
    // without this the column would draw a nought and the singular would go unmeasured.
    const said = await fetch(`http://127.0.0.1:${String(app.apiPort)}/api/records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'message',
        title: 'And what happened on the fourth trial?',
        data: {
          body: 'And what happened on the fourth trial?',
          target: {
            target: { kind: 'region', recordId, regionId: 'section.summaryLine' },
            place: { at: 'surface' },
          },
          sentBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
        },
      }),
    })
    expect(said.ok, `writing a comment answered ${String(said.status)}`).toBe(true)
    await page.goto(`http://127.0.0.1:${String(app.webPort)}/#/`, { timeout: 60_000 })
    // A RELOAD, NOT A HASH CHANGE. Moving the hash keeps the same document, and the frame asks the
    // server which review is collecting when it mounts and when this browser writes to a review.
    // The review above was started through the API, which this browser never heard about.
    await page.reload({ timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await new Promise((r) => setTimeout(r, 2000))

    // THE PRESS THAT OPENS THE COLUMN: Reviews in the left sidebar. Pressed only if the column is
    // shut: a test above this one opens it, the column remembers that it is open in this browser's
    // store, and the store survives the reload — so pressing unconditionally would close it.
    await page.waitForSelector('.px-review-switch', { timeout: 20_000 })
    if ((await page.$('.px-pane')) === null) await page.click('.px-review-switch')
    await page.waitForSelector('.px-pane', { timeout: 20_000 })
    await page.waitForSelector('.px-pane-count', { timeout: 20_000 })
    const head = await page.evaluate(() => (document.querySelector('.px-pane-count')?.textContent ?? '').trim())

    expect(head, 'the review column draws nothing where the count should be').not.toBe('')
    // THE OWNER'S OWN CASE, WORD FOR WORD. One comment in the collecting review drew `1` and nothing said
    // what the 1 was. The count now sits after the state word and the subject, so this reads the
    // end of the line rather than a box of its own.
    // SINCE WAVE 13R ROUND 15 A REVIEW TAKES IN THE COMMENTS KEPT ON ITS PAGE BEFORE IT STARTED (the owner's third
    // detail, record 9BZZVKQxWV9Z), so the three written above are in it with the fourth: the count is 4, not 1.
    expect(head, 'the number is bare, with no word saying what it is').toMatch(/\b4 comments$/)
    expect(head, 'the column does not say what state the review is in').toContain('Collecting')
  })
})

describe('a comment on a report table at 390', () => {
  it('sits in room above the table, and covers none of its words, in English and in Chinese', async () => {
    // PROBLEM E73Do6DbqZCH, ITEM 9. At 390 a circle straddled a report table's top-right corner and covered the row
    // under it. A fresh browser, so the review column a test above opened is shut, as a reader arriving would find it.
    // Mutation: the circle's top put back to `block.top - size / 2` (straddling the corner) turns this case and the
    // every-width case red.
    const post = async (body: unknown): Promise<string> => {
      const res = await fetch(`http://127.0.0.1:${String(app.apiPort)}/api/records`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`POST /api/records answered ${String(res.status)}: ${await res.text()}`)
      return ((await res.json()) as { record: { id: string } }).record.id
    }
    const report = await post({
      kind: 'report',
      title: 'Test: the trials, by state',
      data: {
        for: THE_TEST_OFFICES_OWNER.name,
        date: '2026-10-06',
        blocks: [
          { id: 'b-1', type: 'text', heading: 'What ran', text: 'Three trials ran this week.' },
          {
            id: 'b-2',
            type: 'table',
            columns: [{ label: 'Trial and where it ran' }, { label: 'State and its number' }],
            rows: [{ cells: ['The gripper, on the bench by the window', '进行中 1923-B, and still going'] }],
          },
        ],
      },
    })
    await post({
      kind: 'message',
      title: 'Which bench?',
      data: {
        body: 'Which bench?',
        target: { target: { kind: 'region', recordId: report, regionId: 'data.blocks[#b-2]' }, place: { at: 'surface' } },
        sentBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
      },
    })
    const context = await app.browser.newContext({ viewport: { width: 390, height: 1000 } })
    const was = page
    try {
      page = await context.newPage()
      for (const lang of ['en', 'zh']) {
        await page.goto(`http://127.0.0.1:${String(app.webPort)}/?lang=${lang}#/r/${report}`, { timeout: 60_000 })
        await waitForThePage(page, 60_000)
        await page.waitForSelector('.px-comment-circle', { timeout: 20_000 })
        await new Promise((r) => setTimeout(r, 700))
        expect(await page.locator('[data-comment-room]').count(), `no block was given room at 390 in ${lang}, so this case proves nothing`).toBeGreaterThan(0)
        expect(await wordsUnderACircle(), `a circle covers words of the report at 390 in ${lang}`).toEqual([])
        expect(await circlesOverTheirBlock(), `a circle lies over the table at 390 in ${lang}`).toEqual([])
      }
    } finally {
      page = was
      await context.close()
    }
  }, 120_000)
})
