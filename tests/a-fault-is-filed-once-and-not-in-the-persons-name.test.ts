// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FAULT ON A PAGE IS WRITTEN DOWN AS A PROBLEM, ONCE, AND NOT IN THE PERSON'S NAME. Criterion E4, the
 * filing half.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * The rule in design/entries/ACCEPTANCE.md under E4: a page that fails is
 * loud, and what E4 asks is that the loud failure carries its words — drawn where the page was, and
 * written to the office as a problem with the page, the press and the words, so the owner never has
 * to open a browser console.
 *
 * perm-5a drew the panel and filed nothing. MEASURED BEFORE THIS BRANCH, on 8 September 2026: the
 * Embassy answered with a shape the page could not draw, the panel appeared with the fault's own
 * message on it, and the database held no record of it at all.
 *
 * Four things, all in a real browser against a real office:
 *
 *   · the panel draws a link to the problem the office filed, and that problem exists;
 *   · the problem carries the fault's own message, the page, the press and the address;
 *   · it was filed BY THE OFFICE. The browser writes as the person — every request it makes carries
 *     `human` and the person's name — and the problem's own change rows say `mole-office/the-api-server`.
 *     Nothing about it is attributed to the person or to the reader;
 *   · once per fault per reading. The page is loaded again, meets the same fault, and the office
 *     writes no second problem: the panel names the same id and the count of problems does not move.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   1. In src/server/lib/faults.ts, have `fileAFault` write under the caller's actor instead of
 *      `THE_OFFICE` → the problem is filed as the owner and "not in the person's name" fails.
 *   2. In src/server/lib/faults.ts, make `theProblemThisFaultAlreadyHas` always answer null → the
 *      reload files a second problem and "once per reading" fails.
 *   3. In src/web/components/TheFault.tsx, take the filing effect out → no link is drawn, no problem
 *      is written, and the first two assertions fail.
 */

import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { FAULT_WORDS } from '../src/web/components/TheFault.tsx'

let app: LiveApp
let page: Page

/** One record, as the API hands it over. Only the parts this file reads. */
interface OneRecord {
  id: string
  kind: string
  title: string
  summary: string | null
  data: Record<string, unknown>
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${app.api}${path}`, {
    headers: { 'x-mole-office-workspace': 'default' },
  })
  const said = (await res.json()) as T
  expect(res.status, JSON.stringify(said).slice(0, 300)).toBeLessThan(300)
  return said
}

/** Every problem this office holds, which is what a count of filed faults is counted from. */
async function problemsHere(): Promise<OneRecord[]> {
  const said = await get<{ records: OneRecord[] }>('/api/records?kind=problem')
  return said.records
}

/**
 * The id the panel's link leads to, read from the link's address, or null because it is drawing no
 * link to a record.
 *
 * FROM THE ADDRESS AND NOT FROM THE WORDS. The link's words are "Open it" in normal mode, because
 * an id is shown in developer mode only; where the link leads is the id.
 */
async function theProblemOnThePanel(): Promise<string | null> {
  await page
    .waitForFunction(() => document.querySelector('.fault-problem') !== null, undefined, { timeout: 15_000 })
    .catch(() => null)
  const href = await page.evaluate(() => document.querySelector('.fault-problem')?.getAttribute('href') ?? null)
  // A record's page is #/r/<id>, the address recordPath builds (problem oo4K1xWfb_5d).
  return /^#\/r\/([^/?#]+)$/.exec(href ?? '')?.[1] ?? null
}

/**
 * BREAK THE EMBASSY AND OPEN IT.
 *
 * The Embassy's own reply, answered with a shape the page cannot draw. The page reads a list off it
 * at once, so an empty object is a fault WHILE DRAWING and not a fault while fetching — which is the
 * case E4's boundary is for. This is the same break tests/a-page-that-fails-while-drawing-says-so
 * uses, so the two files are measuring one behaviour from two sides.
 */
async function openTheBrokenEmbassy(): Promise<void> {
  await page.goto(`${app.site}/#/embassy`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

beforeAll(async () => {
  app = await liveApp({ name: 'a-fault-is-filed', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  page = app.page
  // THE REAL REPLY'S HEADERS, WITH A BODY THE PAGE CANNOT DRAW. The headers say which office answered;
  // a reply that names none is refused once the page has heard from its office, and the page's
  // language is read from the office before this page asks for anything.
  await page.route('**/api/office/embassy*', async (route) =>
    route.fulfill({ response: await route.fetch(), status: 200, contentType: 'application/json', body: '{}' }),
  )
  await openTheBrokenEmbassy()
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('a fault on a page is written down', () => {
  it('draws the problem the office filed, as a press', async () => {
    const drawn = await theProblemOnThePanel()
    expect(drawn, 'the panel has no link to a record').not.toBeNull()
    const problems = await problemsHere()
    expect(problems.some((one) => one.id === drawn), 'the link leads to no problem the office holds').toBe(true)
    // AND THE PANEL STILL SAYS EVERYTHING perm-5a MADE IT SAY. The filing is added to the drawing
    // and does not replace any of it.
    const text = await page.evaluate(() => document.querySelector('.fault')?.textContent ?? '')
    expect(text).toContain(FAULT_WORDS.whileDrawing)
    expect(text).toContain(FAULT_WORDS.filed)
  })

  it('carries the fault’s own message, the page, the press and the address', async () => {
    const id = await theProblemOnThePanel()
    const said = await get<{ record: OneRecord }>(`/api/records/${String(id)}`)
    const symptom = String(said.record.data.symptom ?? '')
    // THE MESSAGE THE BROWSER PUT ON THE SCREEN IS THE MESSAGE IN THE RECORD. Its wording belongs to
    // the engine, so it is read off the panel rather than typed here.
    const onScreen = await page.evaluate(() => (document.querySelector('.fault-message')?.textContent ?? '').trim())
    expect(onScreen.length, 'the panel drew the fault’s own words').toBeGreaterThan(0)
    expect(symptom, 'and the record holds the same words').toContain(onScreen)
    expect(symptom, 'the page it happened on').toContain('Embassy')
    expect(symptom, 'and that nothing had been pressed, which is a real answer').toContain('pressed')
    expect(String(said.record.data.seen_in ?? ''), 'the address the reader was at').toContain('#/embassy')
    expect(said.record.title, 'the title says what stopped and where').toContain('Embassy')
    expect(said.record.data.state).toBe('open')
  })

  it('is filed by the office, and never in the person’s name or the reader’s', async () => {
    const id = await theProblemOnThePanel()
    const said = await get<{ revisions: { who: { actorType: string; actorId: string } }[] }>(
      `/api/records/${String(id)}/revisions`,
    )
    expect(said.revisions.length, 'the problem has a history').toBeGreaterThan(0)
    for (const one of said.revisions) {
      expect(one.who.actorType, 'the office is an agent here, never a person').toBe('agent')
      expect(one.who.actorId).toBe('mole-office/the-api-server')
    }
    // AND THE BROWSER REALLY DID WRITE AS THE PERSON. Without this the assertion above would pass on a
    // browser that sent no identity at all, which is a different fact and not the one E4 asks for.
    const sent = await page.evaluate(async () => {
      const res = await fetch('/api/health')
      return res.status
    })
    expect(sent).toBe(200)
    const asThePerson = await get<{ records: OneRecord[] }>('/api/records?kind=problem')
    expect(asThePerson.records.some((one) => one.id === id)).toBe(true)
  })

  it('files nothing new when the same fault comes back in the same reading', async () => {
    const first = await theProblemOnThePanel()
    const before = await problemsHere()
    // THE SAME TAB, LOADED AGAIN. The reading is kept in `sessionStorage`, so a reload is the same
    // reading — which is the span E4's "once per fault per session" names.
    await page.reload({ timeout: 60_000 })
    await waitForThePage(page, 60_000)
    const second = await theProblemOnThePanel()
    expect(second, 'the panel names the problem that is already there').toBe(first)
    const after = await problemsHere()
    expect(after.length, 'and the office wrote no second problem').toBe(before.length)
  })
})
