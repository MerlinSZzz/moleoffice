// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COMMENT CIRCLE ON A PAGE OF TWO COLUMNS COVERS NO WORDS.
 *
 * A message about a record counts as a comment on it, and its circle is drawn beside the record's block: in the margin
 * to the right of the block when there is room, above the block's top-right corner when there is not. The room was
 * measured up to the page's right edge. On Home at 1440 the page sets two columns side by side, so the space to the
 * right of a row in the first column holds the second column. The circle was put there, in the narrow gap between the
 * columns, and covered the first characters of the second column's note. The room is now measured up to the edge of
 * the block's own column when two columns stand side by side. On Home the gap is narrower than the circle, so the
 * circle goes above the row's corner, as it already did at 990.
 *
 * A problem's page sets two columns side by side as well: the problem itself, and who made it and whose move it is. A
 * comment on a section of the problem is drawn beside that section, in the first column, so the same holds there.
 *
 * The Decisions page sets its first column side by side with the messages not read on a wide screen. Before the change,
 * the circle beside the panel of what is asked stood in the gap there and covered that list's heading. On a narrower
 * screen that column gives its parts to the page's one column and draws no box of its own (display: contents), so its
 * right edge reads as 0. A first column with no box is not beside anything: counted as one, it sent the circle beside
 * the panel of what is asked of the person to the left of the window, where nobody sees it.
 *
 * WHAT IS MEASURED, in a browser on a test office of this file's own (liveApp). A session nobody started registers
 * itself, so Home's second column draws a note under its agents. An agent the person started asks for a card, which
 * sends the person a message about the ask, so the ask's row on Home carries a circle. The person reads that message,
 * so the two asks are the only rows under Needs you, and Home draws both. The person comments on the
 * cause of a problem, and on the Decisions page's panel of what is asked of them. At 1440 and at 390 wide, the widest
 * and the narrowest, in the light look:
 *   1 and 2. on Home, in English and in Chinese, the ask's row is drawn, at least one circle is drawn, no circle covers
 *      any of the page's words, no circle stands in the gap between two columns set side by side, every circle is
 *      inside the window, and the page is no wider than the window;
 *   5 and 6. on the problem's page, in English, the same;
 *   9 and 10. on the Decisions page, in English, the same.
 * Words under a circle are the harm a person meets, but whether a circle lands on them depends on which row it marks
 * and where the other column's lines fall. Home's two rows here do not always come in the same order: before the
 * change, one run put the ask's row first and its circle covered the start of "Agents at work". While the message about
 * the ask was a third row, some runs put the ask's row third, where Home draws no row, and no circle was drawn at all.
 * The gap does not depend on the order, so a circle drawn there is a fault whatever the other column says.
 * A picture of each is kept in the folder TEST_SHOTS names.
 *
 * MUTATIONS, after a control run, in src/web/components/agent/CommentCircle.tsx:
 *   the room is measured to the page's right edge again. Cases 1, 5 and 9 go red;
 *   a first column with no box counts as beside the second. Case 10 goes red.
 */

import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { SIDE_BY_SIDE } from '../src/web/components/SideBySide.tsx'
import { governancePath } from '../src/web/components/router.tsx'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { testShots } from './where-shots-go.ts'

let app: LiveApp
let problem = ''
/** The target of the ask's row on Home, the row the message about the ask is a comment on. */
let theAsksRow = ''

const shots = testShots('a-comment-circle-beside-two-columns')

/** The person's headers, and an agent's in the person's workspace. */
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({ ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

/** Every key in a reply replaced, so no failure message carries one. */
const hidden = (text: string): string => text.replace(/[0-9a-f]{64}/g, '<a key>')

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}${url}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await res.text()
  expect(res.status, `${url}: ${hidden(text)}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, unknown>
}

/** Opens a page and waits until its circles are placed. */
async function open(path: string, query: string): Promise<void> {
  await app.page.goto(`${app.site}/${query}#${path}`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await expect
    .poll(async () => app.page.evaluate(() => document.documentElement.getAttribute('data-comment-circles')), { timeout: 30_000, message: 'the circles were never placed' })
    .toBe('placed')
}

/**
 * Waits for Home to draw the ask's row, the row the message about the ask is a comment on, and then for the circles to
 * be placed again. False when the row is not drawn within 30 seconds.
 */
async function theAsksRowIsDrawn(): Promise<boolean> {
  try {
    await app.page.locator(`[data-target="${theAsksRow}"]`).first().waitFor({ state: 'attached', timeout: 30_000 })
  } catch {
    return false
  }
  await expect
    .poll(async () => app.page.evaluate(() => document.documentElement.getAttribute('data-comment-circles')), { timeout: 30_000, message: 'the circles were never placed' })
    .toBe('placed')
  return true
}

/**
 * Every place where a circle covers words, stands in a gap or is outside the window: the circle's count, what it covers
 * and where. A word is a run of drawn text outside every circle, measured as the browser lays its lines out. A gap is
 * the space between two columns set side by side, from the first's right edge to the second's left, as tall as the
 * two; two columns are side by side only when both have a box. One pixel at each edge is not counted, so a rounding of
 * the two boxes is not read as covering.
 */
async function whatTheCirclesCover(): Promise<{ circles: number; covered: string[] }> {
  return app.page.evaluate((sideBySide) => {
    const circles = [...document.querySelectorAll('.px-comment-circle')].map((circle) => ({ said: circle.textContent ?? '', box: circle.getBoundingClientRect() }))
    const covered: string[] = []
    for (const columns of document.querySelectorAll(`.${sideBySide}`)) {
      const first = columns.querySelector(':scope > [data-column="start"]')?.getBoundingClientRect()
      const second = columns.querySelector(':scope > [data-column="end"]')?.getBoundingClientRect()
      if (first === undefined || second === undefined || first.width === 0 || second.width === 0 || second.left < first.right) continue
      const top = Math.min(first.top, second.top)
      const bottom = Math.max(first.bottom, second.bottom)
      for (const circle of circles) {
        const box = circle.box
        if (box.left < second.left - 1 && box.right > first.right + 1 && box.top < bottom - 1 && box.bottom > top + 1) {
          covered.push(`the circle "${circle.said}" at ${String(Math.round(box.left))},${String(Math.round(box.top))} stands in the gap between two columns, from ${String(Math.round(first.right))} to ${String(Math.round(second.left))}`)
        }
      }
    }
    const window = document.documentElement.clientWidth
    for (const circle of circles) {
      const box = circle.box
      if (box.left < -1 || box.right > window + 1) {
        covered.push(`the circle "${circle.said}" at ${String(Math.round(box.left))},${String(Math.round(box.top))} is outside the window, which is ${String(window)} wide`)
      }
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const words = (node.textContent ?? '').trim()
      const holder = node.parentElement
      if (words === '' || holder === null || holder.closest('.px-comment-circle, style, script, noscript, template') !== null) continue
      if (!holder.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
      const held = holder.getBoundingClientRect()
      if (held.width <= 1 || held.height <= 1) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const line of range.getClientRects()) {
        for (const circle of circles) {
          const box = circle.box
          if (line.left < box.right - 1 && line.right > box.left + 1 && line.top < box.bottom - 1 && line.bottom > box.top + 1) {
            covered.push(`the circle "${circle.said}" at ${String(Math.round(box.left))},${String(Math.round(box.top))} covers "${words.slice(0, 40)}"`)
          }
        }
      }
    }
    return { circles: circles.length, covered }
  }, SIDE_BY_SIDE)
}

beforeAll(async () => {
  app = await liveApp({ name: 'a-comment-circle-beside-two-columns', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  // THE LOOK COMES FROM THE ADDRESS, so each picture names its own and a later load does not inherit it.
  await app.context.addInitScript(() => {
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
  })
  // A SESSION NOBODY STARTED REGISTERS ITSELF, so Home's second column says that one thing under Needs you does not
  // record which agent it came from: words beside the rows for a circle to cover.
  await post('/api/agents/register-myself', asAgent('newcomer'), { handle: 'newcomer', name: 'Newcomer', workingDirectory: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`, requestedRole: 'worker' })
  // AN AGENT THE PERSON STARTED ASKS THE PERSON FOR A CARD, and the person is sent a message about the ask. Its key is
  // not kept: it is never needed here.
  await post('/api/agents/started', { ...AS_THE_PERSON, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) }, { handle: 'asks-for-a-card', name: 'Asks for a card', role: 'worker', workArea: ['work'] })
  const asked = await post('/api/roles/requests', asAgent('asks-for-a-card'), { asking: 'supervisor', because: 'Test: to lead a wave' })
  theAsksRow = `record/${String(asked['request'])}/default`
  // THE PERSON READS THE MESSAGE ABOUT THE ASK, so it is not a third row under Needs you. Home draws two rows, in an order
  // the second each was written in and their ids decide. With the message as a third row, the ask's row came third in
  // some runs, Home drew no row for the circle to mark, and no circle was drawn. A message the person has read is still
  // a comment on the ask, so its circle is still drawn.
  await post(`/api/messages/${String(asked['message'])}/mark`, { ...AS_THE_PERSON, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) }, { mark: 'seen' })
  // A PROBLEM, AND THE PERSON'S COMMENT ON ITS CAUSE, which its page draws in the first column.
  const made = await post('/api/records', AS_THE_PERSON, {
    kind: 'problem',
    title: 'Two test stacks trade the ports between them',
    data: { symptom: 'The test server answers on one port and then on another.', cause: 'Two test stacks were started from one tree.' },
  })
  problem = String((made['record'] as { id: string }).id)
  // THE PERSON'S COMMENT ON THE DECISIONS PAGE'S PANEL OF WHAT IS ASKED OF THEM, which the page draws in its first
  // column. A part of the screen holds no stored words, so the comment says what the screen showed.
  await post('/api/records', AS_THE_PERSON, {
    kind: 'message',
    title: 'Why is this here?',
    data: {
      body: 'Why is this here?',
      target: {
        target: { kind: 'uiSurface', surfaceId: 'governance.asked' },
        place: { at: 'surface' },
        seen: { route: `#${governancePath()}`, quote: 'Asked of you', build: 'unknown' },
      },
      sentBy: { kind: 'person', id: THE_PERSON },
    },
  })
  await post('/api/records', AS_THE_PERSON, {
    kind: 'message',
    title: 'Which tree?',
    data: {
      body: 'Which tree?',
      target: { target: { kind: 'region', recordId: problem, regionId: 'section.cause' }, place: { at: 'surface' } },
      sentBy: { kind: 'person', id: THE_PERSON },
    },
  })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

const WIDTHS = [1440, 390] as const

describe('a comment circle on a page of two columns', () => {
  for (const [first, name, picture, path, languages] of [
    [1, 'Home', 'home', () => '/', ['en', 'zh']],
    [5, "a problem's page", 'problem', () => `/r/${problem}`, ['en']],
    [9, 'the Decisions page', 'decisions', () => governancePath(), ['en']],
  ] as const) {
    WIDTHS.forEach((width, n) => {
      // MUTATIONS: red at 1440 on each page; red at 390 on the Decisions page.
      it(`${String(first + n)}. on ${name} at ${String(width)}, in the light look, no circle covers words`, async () => {
        const faults: string[] = []
        for (const look of ['light'] as const) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: look })
          for (const lang of languages) {
            await open(path(), `?lang=${lang}&look=${look}`)
            const at = `${lang} in the ${look} look`
            if (first === 1 && !(await theAsksRowIsDrawn())) faults.push(`${at}: the ask's row, which the circle marks, is not drawn`)
            const read = await whatTheCirclesCover()
            if (read.circles === 0) faults.push(`${at}: no circle is drawn`)
            for (const one of read.covered) faults.push(`${at}: ${one}`)
            const wide = await app.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
            if (wide > 0) faults.push(`${at}: the page is ${String(wide)} px wider than the window`)
            if (read.circles > 0) await app.page.locator('.px-comment-circle').first().scrollIntoViewIfNeeded()
            await app.page.screenshot({ path: join(shots, `${picture}-${lang}-${String(width)}-${look}.png`), fullPage: false })
          }
        }
        expect(faults, 'a circle covers words, stands in a gap or outside the window, or none is drawn').toEqual([])
      }, 300_000)
    })
  }
})
