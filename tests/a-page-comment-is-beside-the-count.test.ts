// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COMMENT LEFT ON A PAGE IS DRAWN BESIDE THE COUNT — CRITERION D30, MEASURED IN A BROWSER.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Item 1 of design/messages/ACCEPTANCE.md section 32:
 *
 * The message appeared at the very bottom of the whole module; without the dashed selection box the reader
 * would not have known a comment had been sent at all; it could be moved beside the comment's "1".
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, ON THE OWNER'S OWN PIPELINE
 * ---------------------------------------------------------------------------------------
 *
 * The owner's Handover v2 record page in Robotics, on an isolated copy of the owner's database, with the note the coordinator
 * left on it (message XOXK16BCpR5Q, a target on the record, place surface):
 *
 *   at 1440: the count sat at y=0 and the card at y=2622 — 2,622 pixels apart, with a 229-pixel
 *            bottom margin added to the whole article to make room for the card.
 *   at 390:  the count sat at y=67 and the card at y=5135.
 *
 * THE CAUSE. A comment about the whole record is drawn on the element carrying the record's key, and
 * on a record page that element is the whole article. So the count went to the article's top-right
 * corner and the card hung under the article, which is the bottom of the page.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   make `theRecordsOwnHead` in theblock.ts return null → both placement cases go red: the card goes
 *     back to the foot of the page, thousands of pixels from the count.
 *   drop the right-alignment arm from `whereItIs` in AgentSaidHere.tsx → the case that lines the
 *     card up under the count goes red.
 *   put the `aCardIsAlreadyBeside` guard back in front of `openCommentsOn` in CommentCircle.tsx →
 *     the case about pressing the count goes red: the column never opens.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { thePageScroller } from './the-page-scroller.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp
let recordId = ''

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_AN_AGENT = {
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'lead-bot',
}

/** Long enough that the page is far taller than any window, which is the whole of the fault. */
const PARAGRAPH =
  'Without a warrant, on a fork another agent filed, a close from an agent is refused as the rules ' +
  'say it must be, and the refusal names the sentence it wants. The reply carries the whole of the ' +
  'reason, so nobody has to guess which of the four checks it failed.'

const WHAT_THE_AGENT_SAID = 'This is my note about the whole of this record. Answer me here.'

async function write(headers: Record<string, string>, body: unknown): Promise<Response> {
  return fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
}

beforeAll(async () => {
  app = await liveApp({ name: 'page-comment-beside-count', viewport: { width: 1440, height: 972 } })

  const agent = await write(AS_THE_OWNER, {
    kind: 'agent',
    title: 'Lead Bot',
    data: { handle: 'lead-bot', runtime: 'claude-code', state: 'active' },
  })
  expect(agent.status, await agent.text()).toBe(201)

  const report = await write(AS_THE_OWNER, {
    kind: 'report',
    title: 'An independent check of the warrant: could an agent forge authority?',
    summary: 'What was checked, what was refused, and what is still the human act.',
    data: {
      for: `${THE_TEST_OFFICES_OWNER.name}, who asked whether the warrant can be forged`,
      date: '2026-09-04',
      blocks: [
        { id: 'b-what', type: 'text', heading: 'What was checked', text: PARAGRAPH },
        { id: 'b-refusals', type: 'text', heading: 'The refusals', text: PARAGRAPH },
        { id: 'b-forgery', type: 'text', heading: 'Forgery', text: PARAGRAPH },
        { id: 'b-act', type: 'text', heading: 'The human act', text: PARAGRAPH },
        { id: 'b-next', type: 'text', heading: 'What is next', text: PARAGRAPH },
      ],
    },
  })
  const written = (await report.json()) as { record?: { id: string } }
  expect(report.status, JSON.stringify(written)).toBe(201)
  recordId = written.record?.id ?? ''

  // THE COMMENT THE OWNER LEFT: a target on the RECORD, at the page's surface. Not a region of it — that is
  // the other shape, and it is the one that already worked.
  const said = await write(AS_AN_AGENT, {
    kind: 'message',
    title: 'A note about the whole record',
    data: {
      body: WHAT_THE_AGENT_SAID,
      to: [{ kind: 'person', id: THE_PERSON }],
      target: { target: { kind: 'record', recordId, workspaceId: 'default' }, place: { at: 'surface' } },
    },
  })
  expect(said.status, await said.text()).toBe(201)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Where the count, the card and the page's own head are, in the coordinates of the page that scrolls. */
async function whatIsDrawn(width: number, theme: 'light' | 'dark') {
  await app.page.setViewportSize({ width, height: 972 })
  await app.page.emulateMedia({ colorScheme: theme })
  await app.page.goto(`${app.site}/#/r/${recordId}`, { timeout: 60_000 })
  await app.page.reload({ timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.waitForSelector('.px-said', { timeout: 30_000 })
  await app.page.waitForSelector('.px-comment-circle', { timeout: 30_000 })
  // THE CARD IS PLACED TWICE: once with no width to line it up by, and again as soon as it has
  // been drawn and measured. This waits for the second placement to have settled.
  await app.page.waitForFunction(
    () => {
      const card = document.querySelector('.px-said')
      const head = document.querySelector('header.rp-head')
      if (!(card instanceof HTMLElement) || !(head instanceof HTMLElement)) return false
      const box = card.getBoundingClientRect()
      if (box.height === 0) return false
      return Math.abs(box.right - head.getBoundingClientRect().right) <= 2
    },
    undefined,
    { timeout: 30_000 },
  )
  // THE PAGE'S OWN POSITIONS, read on the box the page scrolls in: the window's, or the report's own box.
  const scroller = await thePageScroller(app.page)
  try {
    return await app.page.evaluate((scroller) => {
      const box = (el: Element | null) => {
        if (el === null) return null
        const at = el.getBoundingClientRect()
        return {
          left: Math.round(at.left + scroller.scrollLeft),
          top: Math.round(at.top + scroller.scrollTop),
          right: Math.round(at.right + scroller.scrollLeft),
          bottom: Math.round(at.bottom + scroller.scrollTop),
        }
      }
      return {
        page: scroller.scrollHeight,
        circle: box(document.querySelector('.px-comment-circle')),
        card: box(document.querySelector('.px-said')),
        head: box(document.querySelector('header.rp-head')),
        article: box(document.querySelector('article.rp')),
      }
    }, scroller)
  } finally {
    await scroller.dispose()
  }
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1440, 390] as const) {
    describe(`a comment on the page, at ${String(width)} in ${theme}`, () => {
      it('is drawn beside the count and not at the foot of the page', async () => {
        const at = await whatIsDrawn(width, theme)
        expect(at.circle, 'the count is drawn').not.toBeNull()
        expect(at.card, "the agent's words are drawn").not.toBeNull()
        expect(at.head, 'the page has a head').not.toBeNull()
        const circle = at.circle as NonNullable<typeof at.circle>
        const card = at.card as NonNullable<typeof at.card>
        const head = at.head as NonNullable<typeof at.head>
        const article = at.article as NonNullable<typeof at.article>

        // BESIDE THE COUNT: the card hangs off the same block the count is drawn on, so it starts
        // within that block's own height of it rather than a page away.
        expect(
          card.top - circle.bottom,
          `the card starts ${String(card.top - circle.bottom)} pixels below the count`,
        ).toBeLessThan(head.bottom - head.top + 40)

        // AND ITS RIGHT EDGE IS UNDER THE COUNT, which is what moving it beside the "1" asks.
        expect(Math.abs(card.right - head.right), 'the card is lined up with the block the count sits on').toBeLessThanOrEqual(2)
        expect(Math.abs(card.right - circle.right), 'so it is under the count').toBeLessThan(40)

        // NOT AT THE FOOT OF THE PAGE. This is the measurement of what the owner met: on the owner's own record the
        // card was 2,622 pixels below the count with the whole report between them.
        expect(article.bottom - article.top, 'the page under test is a long one').toBeGreaterThan(900)
        expect(card.bottom, 'the card is nowhere near the bottom of the page').toBeLessThan(at.page - 400)
      }, 180_000)

      it('makes its room on the head, so the record below starts under the card', async () => {
        const at = await whatIsDrawn(width, theme)
        const card = at.card as NonNullable<typeof at.card>
        const room = await app.page.evaluate(() => {
          const head = document.querySelector('header.rp-head')
          const article = document.querySelector('article.rp')
          return {
            onTheHead: head instanceof HTMLElement ? head.style.marginBottom : 'no head',
            onThePage: article instanceof HTMLElement ? article.style.marginBottom : 'no article',
          }
        })
        expect(room.onTheHead, 'the head makes the room').not.toBe('')
        expect(room.onThePage, 'the page does not').toBe('')
        expect(Number.parseFloat(room.onTheHead), 'the room is at least as tall as the card').toBeGreaterThan(
          card.bottom - card.top,
        )
      }, 180_000)
    })
  }
}

describe('pressing the count shows the comment with the others', () => {
  it('opens the comments on that block, with the agent’s words in the list', async () => {
    await whatIsDrawn(1440, 'light')
    await app.page.locator('.px-comment-circle').first().click()
    await app.page.waitForSelector('.px-pane-title', { timeout: 30_000 })
    // THE LIST IS READ FROM THE SERVER after the column opens, so the pane is on the page before
    // the rows are. Waiting for the pane alone measured an empty list that was still loading.
    await app.page.waitForSelector('.px-rev-words', { timeout: 30_000 })
    const shown = await app.page.evaluate(() => ({
      pane: document.querySelector('.px-pane-title')?.textContent ?? null,
      words: [...document.querySelectorAll('.px-rev-words')].map((one) => one.textContent ?? ''),
    }))
    expect(shown.pane, 'the column opened on the comments here').toBe('Comments here')
    expect(shown.words.join(' | '), 'and the words are in it').toContain(WHAT_THE_AGENT_SAID)
  }, 180_000)
})
