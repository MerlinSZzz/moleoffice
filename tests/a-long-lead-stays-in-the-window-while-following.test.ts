// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LONG LEAD STAYS INSIDE THE WINDOW WHILE THE READER FOLLOWS ITS AGENT.
 *
 * Problem PVQI-FTYDRNG. tests/the-pane-a-lead-opens-can-be-closed.test.ts holds the case where the
 * reader is not following: the pane is capped and its words scroll. While the reader follows an
 * agent, the words sit in a second card inside the following card, and the rules that let a card be
 * shorter than its words did not reach it. Measured on main 94270d12 before the fix: the words
 * grew past the capped pane, and the line with the stop press went below the bottom of the window.
 *
 * So this follows an agent, takes an eighty-line lead, and checks at 1440 and at 390 that:
 *   the pane is inside the window;
 *   the stop press is inside the window, because criterion M8 keeps it on screen the whole time;
 *   the first line and the last line can each be scrolled to and selected with a real pointer.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { LEADING } from '../src/shared/messages.ts'
import { FOLLOWING_KEY } from '../src/web/lib/following.ts'

let app: LiveApp
let recordId = ''
let agentId = ''

const LINES = Array.from({ length: 80 }, (_, i) => `row ${String(i + 1).padStart(2, '0')}  a measurement to copy, number ${String(i + 1)}`)
const WORDS = LINES.join('\n')
const FIRST = LINES[0] as string
const LAST = LINES[LINES.length - 1] as string

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_THE_GUIDE = {
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'pathfinder',
}

async function write(headers: Record<string, string>, body: unknown): Promise<Response> {
  return fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
}

beforeAll(async () => {
  app = await liveApp({ name: 'long-lead-following', viewport: { width: 1440, height: 900 } })
  const agent = await write(AS_THE_OWNER, {
    kind: 'agent',
    title: 'Pathfinder',
    data: { handle: 'pathfinder', runtime: 'claude-code', state: 'active' },
  })
  expect(agent.status, await agent.text()).toBe(201)
  // A MESSAGE NAMES THE REGISTRY'S ID, so following is written with that id and not the record's.
  const registry = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  const listed = (await registry.json()) as { agents: { id: string; handle: string }[] }
  agentId = listed.agents.find((one) => one.handle === 'pathfinder')?.id ?? ''
  expect(agentId, JSON.stringify(listed.agents)).not.toBe('')
  const note = await write(AS_THE_OWNER, {
    kind: 'note',
    title: 'The seed trays in the east bed',
    data: { date: '2026-09-29', body: 'A note the guide leads the reader to.' },
  })
  const made = (await note.json()) as { record?: { id: string } }
  expect(note.status, JSON.stringify(made)).toBe(201)
  recordId = made.record?.id ?? ''
  // THIS BROWSER IS ALREADY FOLLOWING, written where the product keeps it. Starting to follow is
  // walked by tests/leading-with-consent.test.ts; this file is about the pane once somebody is.
  await app.page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key as string, value as string)
    },
    [FOLLOWING_KEY, `agent:${agentId}`],
  )
  const said = await write(AS_THE_GUIDE, {
    kind: 'message',
    title: 'The numbers to copy',
    data: {
      body: WORDS,
      to: [{ kind: 'person', id: THE_PERSON }],
      lead: { target: { kind: 'record', recordId, workspaceId: 'default' } },
    },
  })
  expect(said.status, await said.text()).toBe(201)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

interface Box {
  top: number
  bottom: number
  left: number
  height: number
}

/**
 * Scroll every box between the words and the pane to its top or its bottom, then measure one line
 * with a Range over its own characters, the pane, and the stop press.
 */
async function measure(line: string, end: 'top' | 'bottom'): Promise<{ pane: Box; stop: Box; line: Box | null; windowHeight: number }> {
  return app.page.evaluate(
    ({ line, end }) => {
      const pane = document.querySelector('.px-lead-here') as HTMLElement
      const said = document.querySelector('.px-lead-following .px-lead-said')
      let up: HTMLElement | null = said instanceof HTMLElement ? said : null
      while (up !== null && up !== pane.parentElement) {
        up.scrollTop = end === 'top' ? 0 : up.scrollHeight
        up = up.parentElement
      }
      const box = (r: DOMRect) => ({ top: r.top, bottom: r.bottom, left: r.left, height: r.height })
      const stop = document.querySelector('.px-lead-stop') as HTMLElement
      let found: Box | null = null
      const text = said?.firstChild ?? null
      if (text !== null && said instanceof HTMLElement && said.checkVisibility()) {
        const at = (text.textContent ?? '').indexOf(line)
        if (at >= 0) {
          const range = document.createRange()
          range.setStart(text, at)
          range.setEnd(text, at + line.length)
          found = box(range.getBoundingClientRect())
        }
      }
      return { pane: box(pane.getBoundingClientRect()), stop: box(stop.getBoundingClientRect()), line: found, windowHeight: window.innerHeight }
    },
    { line, end },
  )
}

describe('an eighty-line lead while following', () => {
  for (const width of [1440, 390]) {
    it(`keeps the pane, the stop press and both ends of the words in reach at ${String(width)}`, async () => {
      await app.page.setViewportSize({ width, height: 900 })
      await app.page.goto(`${app.site}/#/records`, { timeout: 60_000 })
      await waitForThePage(app.page, 60_000)
      await app.page.waitForSelector('.px-lead-following .px-lead-brought', { state: 'attached', timeout: 30_000 })
      // A NARROW SCREEN FOLDS THE WORDS AWAY until the reader asks for them.
      const words = app.page.locator('.px-lead-following .px-lead-said').first()
      if (!(await words.isVisible())) {
        await app.page.getByRole('button', { name: LEADING.whatItSaid }).first().click()
        await words.waitFor({ state: 'visible', timeout: 15_000 })
      }

      for (const [line, end] of [
        [FIRST, 'top'],
        [LAST, 'bottom'],
      ] as const) {
        const seen = await measure(line, end)
        expect(seen.pane.top, `at ${String(width)} the pane's top is above the window`).toBeGreaterThanOrEqual(0)
        expect(seen.pane.bottom, `at ${String(width)} the pane runs below the window`).toBeLessThanOrEqual(seen.windowHeight)
        expect(
          seen.stop.bottom,
          `at ${String(width)} the stop press is at ${String(Math.round(seen.stop.top))} in a window ${String(seen.windowHeight)} tall`,
        ).toBeLessThanOrEqual(seen.windowHeight)
        expect(seen.stop.height, 'the stop press is not drawn').toBeGreaterThan(0)
        expect(seen.line, `at ${String(width)} "${line}" is not on the page`).not.toBeNull()
        const at = seen.line as Box
        expect(at.top, `at ${String(width)} "${line}" is above the pane`).toBeGreaterThanOrEqual(seen.pane.top - 1)
        expect(at.bottom, `at ${String(width)} "${line}" is below the pane`).toBeLessThanOrEqual(seen.pane.bottom + 1)
        // A triple press selects the line under the pointer.
        await app.page.mouse.click(at.left + 8, at.top + at.height / 2, { clickCount: 3 })
        const selected = await app.page.evaluate(() => window.getSelection()?.toString() ?? '')
        expect(selected, `at ${String(width)} selecting "${line}" gave back "${selected.trim()}"`).toContain(line.slice(0, 6))
      }
    }, 180_000)
  }
})
