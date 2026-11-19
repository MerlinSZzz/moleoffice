// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NUMBER THE SERVER REFUSED IS SAID WHERE THE PERSON IS LOOKING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, MEASURED RATHER THAN GUESSED
 * ---------------------------------------------------------------------------------------
 *
 * On 16 August 2026 a tester driving the schedule typed `-3` into an hours box on the week's edit
 * view and pressed Tab. The server answered 400, the box went on showing `-3`, the totals above
 * went on saying what they had said, and the tester reported that nothing on the page said no.
 *
 * Driving the same page with this harness showed what was really happening. The sentence WAS drawn
 * — and it was drawn at the foot of the row, on the row's left edge under the work's title, about a
 * thousand pixels from the box that had just been typed into, and it opened with the word
 * `plannedHours`. On a 1440 screen that is a refusal a person has to go looking for, and the first
 * three words of it are the name of a storage field. So the fix is placement and words: the box
 * itself is marked, the sentence sits under that box at that end of the row, and it starts by
 * saying plainly that nothing was saved and what the period still gives this work. The server's own
 * sentence follows it whole, because that sentence is the authority on why.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A REAL BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * Every part of this only exists after a refused write: the state that holds the message, the mark
 * on the box, and above all WHERE the sentence lands, which is a question about layout that only a
 * browser can answer. Rendering the component to markup would prove none of it — the row draws no
 * refusal until one has happened, and markup has no geometry. tests/read-before-edit.test.ts makes
 * the same argument. Both use `liveApp` in tests/helpers.ts, which is the one place the lifecycle
 * of a test server is written down.
 *
 * WHAT IS ASSERTED, AND WHY EACH ONE WOULD HAVE CAUGHT THE DEFECT
 *
 *   the refusal is on the page                 it was, so this alone proves nothing — it is here to
 *                                              stop the rest passing because nothing was refused
 *   it starts in plain words                   it started with `plannedHours`
 *   it names what the week still gives         nothing did, so two numbers stood with no account
 *   it sits under the box, not across the row  it was ~1000px away at the other end of the row
 *   the box is marked as refused               it was not marked at all
 *   the typed number is still in the box       it was, and it must stay: losing it loses the work
 */

import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { periodKey } from '../src/shared/planning.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** The week this test plans in: the one the schedule opens on, so no address has to be invented. */
const THIS_WEEK = periodKey('week', new Date())
/** The hours the seeded allocation holds. The refusal has to be able to name it. */
const GIVEN = 4

// ------------------------------------------------------------------- the servers and the page

let app: LiveApp
let apiPort: number
let webPort: number
let page: Page

beforeAll(async () => {
  app = await liveApp({ name: 'refusal', viewport: { width: 1440, height: 1000 } })
  apiPort = app.apiPort
  webPort = app.webPort
  page = app.page

  const post = async (path: string, body: unknown): Promise<unknown> => {
    const res = await fetch(`http://127.0.0.1:${apiPort}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`POST ${path} answered ${res.status}: ${await res.text()}`)
    return res.json()
  }

  const made = (await post('/api/records', {
    kind: 'task',
    title: 'Fit the reading view to the week',
    data: { state: 'doing' },
  })) as { record: { id: string } }
  await post('/api/planning/allocations', {
    horizon: 'week',
    period: THIS_WEEK,
    recordId: made.record.id,
    plannedHours: GIVEN,
  })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** What one refused write left on the screen. */
interface Refused {
  /** Every response the page got while the write was in flight, as `<status> <method> <path>`. */
  answers: string[]
  /** The whole page as a person reads it. */
  pageText: string
  /** The refusal's own words, or null when nothing on the page carries one. */
  said: string | null
  /** Where the refusal is, and where the box is, so "beside it" can be measured. */
  where: { refusal: { left: number; right: number; top: number }; box: { left: number; right: number; bottom: number }; row: { left: number; right: number } } | null
  /** What the box shows now, and whether it says it holds something that was refused. */
  box: { value: string; invalid: boolean; describedBy: string | null }
}

/** Type something into the first hours box on the week's edit view and press Tab. */
async function typeIntoHours(what: string): Promise<Refused> {
  const answers: string[] = []
  const listen = (res: { status(): number; url(): string; request(): { method(): string } }) => {
    if (res.url().includes('/api/')) answers.push(`${res.status()} ${res.request().method()} ${new URL(res.url()).pathname}`)
  }
  page.on('response', listen)
  await page.goto(`http://127.0.0.1:${webPort}/#/plan/${THIS_WEEK}/edit`, {
    timeout: 60_000,
  })
  await waitForThePage(page, 60_000)
  await sleep(700)
  const box = page.locator('input.px-pl-hin').first()
  await box.click()
  await box.fill(what)
  await page.keyboard.press('Tab')
  // The write, its refusal and the re-render. Long enough that a slow reply is not read as silence.
  await sleep(2_000)
  page.off('response', listen)

  const measured = await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('input.px-pl-hin')
    const row = input?.closest('li') ?? null
    // EVERY CANDIDATE, not just the one this fix draws: a message under any other name still
    // counts as the page having said no, and this test must not go red for a different fix.
    const carriers = [...(row?.querySelectorAll('p, span') ?? [])].filter((node) => {
      const text = (node.textContent ?? '').trim()
      return text.length > 20 && /not saved|zero or more|refus|could not|cannot|was not/i.test(text)
    })
    const carrier = carriers[0] ?? null
    const rects = (node: Element) => node.getBoundingClientRect()
    return {
      pageText: document.body.innerText,
      said: carrier === null ? null : (carrier.textContent ?? '').replace(/\s+/g, ' ').trim(),
      where:
        carrier === null || input === null || row === null
          ? null
          : {
              refusal: { left: rects(carrier).left, right: rects(carrier).right, top: rects(carrier).top },
              box: { left: rects(input).left, right: rects(input).right, bottom: rects(input).bottom },
              row: { left: rects(row).left, right: rects(row).right },
            },
      box: {
        value: input?.value ?? '(no hours box on the page at all)',
        invalid: input?.getAttribute('aria-invalid') === 'true',
        describedBy: input?.getAttribute('aria-describedby') ?? null,
      },
    }
  })
  return { answers, ...measured }
}

describe('an hours box the server said no to', () => {
  let refused: Refused

  beforeAll(async () => {
    refused = await typeIntoHours('-3')
  }, 120_000)

  it('really was refused, so nothing below passes because the write quietly succeeded', () => {
    expect(refused.answers.some((a) => a.startsWith('400 PATCH'))).toBe(true)
  })

  it('says so somewhere a person reading the page would find it', () => {
    expect(refused.said, `the row said nothing. The page read:\n${refused.pageText}`).not.toBeNull()
  })

  it('opens in plain words and not with the name of a stored field', () => {
    const said = refused.said ?? ''
    expect(said.slice(0, 40)).toMatch(/^Not saved\./)
    expect(said.toLowerCase().indexOf('plannedhours')).toBeGreaterThan(0)
  })

  it('names what this week still gives the work, so the two numbers on screen are accounted for', () => {
    expect(refused.said).toContain(`This week is still ${GIVEN}h`)
  })

  it('keeps the server’s own sentence whole, because that is the authority on why', () => {
    expect(refused.said).toContain('must be a number of hours, zero or more. It is -3.')
  })

  it('sits under the box it is about, at that end of the row', () => {
    const where = refused.where
    expect(where).not.toBeNull()
    if (where === null) return
    // BELOW THE BOX, not beside it: the box keeps its place and its column width.
    expect(where.refusal.top).toBeGreaterThanOrEqual(where.box.bottom - 1)
    // AND AT THE BOX'S END OF THE ROW, pinned from both sides.
    //
    // It used to span the row from edge to edge — 1146px wide on a 1440 screen — so it ENDED under
    // the row menu and BEGAN under the work's title, about eight hundred pixels from the box. Both
    // of these were true of it and neither is true now.
    expect(Math.abs(where.refusal.right - where.box.right)).toBeLessThan(120)
    expect(where.refusal.left - where.row.left).toBeGreaterThan(300)
  })

  it('marks the box, so what is in it does not read as what Mole Office kept', () => {
    expect(refused.box.invalid).toBe(true)
    expect(refused.box.describedBy).not.toBeNull()
  })

  it('leaves the typed number where it was typed, because losing it would lose the work', () => {
    expect(refused.box.value).toBe('-3')
  })

  it('never says it saved anything', () => {
    expect(refused.pageText).not.toContain('Saved')
  })
})

describe('an hours box the server accepted', () => {
  it('draws no refusal, and no mark on the box', async () => {
    // THE OTHER HALF. A row that marked every box, or drew a refusal whatever happened, would pass
    // every test above and be a worse product than the one that said nothing.
    const accepted = await typeIntoHours('6')
    expect(accepted.answers.some((a) => a.startsWith('200 PATCH'))).toBe(true)
    expect(accepted.said).toBeNull()
    expect(accepted.box.invalid).toBe(false)
    expect(accepted.box.value).toBe('6')
  }, 120_000)
})
