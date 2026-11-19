// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KEYBOARD ROUTE INTO A REPORT COSTS ONE TAB STOP, WHATEVER THE REPORT HOLDS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THERE WAS BEFORE THIS, AND WHY IT WAS NOT A ROUTE
 * ---------------------------------------------------------------------------------------
 *
 * Everything focusable inside a report body was a control: a table's column sort buttons, its
 * search box, the control that changes how much the report says, and the scroll box a table gets
 * when it has more to see. No paragraph, heading, bullet, quote or table could be focused at all.
 * `Shift+F10` opens the composer about `document.activeElement`, so a person without a pointer
 * could not comment on a paragraph of a report — only on the whole record.
 *
 * ---------------------------------------------------------------------------------------
 * THE CLAIM THIS FILE MAKES, AND THE ONE IT REFUSES TO MAKE
 * ---------------------------------------------------------------------------------------
 *
 * It does NOT claim that the report body is one tab stop. It never was and this change removes
 * none of the controls above. What it claims is that ADDING THE WALK COSTS ONE: the count of
 * focusable elements inside the writing goes up by exactly one, on a report with three regions and
 * on a report with a hundred, because the tab stop moves between the body and whichever region is
 * current rather than being handed to every region.
 *
 * The mutation the plan names is `remove the roving tabindex`, and it is what these tests are
 * written against: with `tabIndex: -1` gone from `regionMark`, every region becomes a tab stop and
 * the difference is the number of regions rather than one.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS DRIVEN IN A REAL BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * What is focusable is a question about a rendering engine and not about markup. `tabIndex` is
 * read off live elements, `Tab` is pressed for real, and the composer that `Enter` opens is looked
 * for on the screen.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

let app: LiveApp
let apiPort: number
let webPort: number
let page: Page
/** A short report: one paragraph, one heading, one bullet list. */
let smallId: string
/** A long one, so "one" can be told from "one per region". */
let bigId: string

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`http://127.0.0.1:${apiPort}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as Record<string, unknown>
}

/** Open a report and wait until its writing is on the screen. */
async function open(id: string): Promise<void> {
  await page.goto(`http://127.0.0.1:${String(webPort)}/#/r/${id}`)
  await waitForThePage(page)
  await page.locator('.sb').first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(400)
}

/**
 * HOW MANY THINGS INSIDE THE WRITING TAB LANDS ON, counted off the live page.
 *
 * `tabIndex >= 0` is the browser's own answer for the elements this app draws: it is 0 or more for
 * anything in the tab order and -1 for anything reachable only in code. A disabled control is not
 * counted, because Tab does not stop on one.
 */
async function tabStopsInsideTheWriting(): Promise<number> {
  return page.evaluate(() => {
    const body = document.querySelector('.sb')
    if (body === null) return -1
    const inside = [...body.querySelectorAll<HTMLElement>('*')].filter(
      (el) => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled,
    )
    // The report body itself carries the stop while nobody is in the walk, and it is not inside
    // itself, so it is counted here by hand.
    return inside.length + ((body as HTMLElement).tabIndex >= 0 ? 1 : 0)
  })
}

/** How many parts of this report a person could point at. */
async function regionsDrawn(): Promise<number> {
  return page.evaluate(() => document.querySelectorAll('.sb [data-target^="region/"]').length)
}

beforeAll(async () => {
  // THIS FILE IS ABOUT WHAT IS INSIDE A REPORT'S BODY, SO IT SAYS WHICH LEVEL IT READS AT.
  // The person's act 3a of 15 September 2026 made a record page open at the conclusion, where the body holds
  // the summary and nothing else. So a test that measures a diagram, a picture, a
  // mark, a tab stop or a panel inside the writing found an empty body and waited for a selector that would
  // never appear. `opensAt` writes the reader's own stored choice before the page loads, so this file is
  // about its own subject again and not about the level a page opens at. That level has its own test in
  // tests/a-reader-goes-no-lower-than-conclusion.test.ts, which stores nothing.
  app = await liveApp({ opensAt: 'full', name: 'onetabstop', viewport: { width: 1440, height: 1000 } })
  apiPort = app.apiPort
  webPort = app.webPort
  page = app.page

  const small = (await post('/api/records', {
    kind: 'report',
    title: 'Three parts and no more',
    summary: 'A report short enough to count by hand.',
    data: {
      date: '2026-08-25',
      blocks: [
        { id: 'b-1', type: 'heading', text: 'What was measured' },
        { id: 'b-2', type: 'text', text: 'The gripper let go of the part on every run.' },
        { id: 'b-3', type: 'text', text: 'The shell cracked at the same corner each time.' },
        { id: 'b-4', type: 'text', text: 'Nothing about the printer changed between the runs.' },
      ],
    },
  })) as { record: { id: string } }
  smallId = small.record.id

  const paragraphs = Array.from({ length: 24 }, (_, i) => ({
    id: `b-${String(i)}`,
    type: 'text',
    text: `Run ${String(i + 1)} dropped the part, and the shell cracked at the same corner each time.`,
  }))
  const big = (await post('/api/records', {
    kind: 'report',
    title: 'Twenty-four runs',
    summary: 'A report long enough that one per region would show.',
    data: { date: '2026-08-25', blocks: paragraphs },
  })) as { record: { id: string } }
  bigId = big.record.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

describe('the region walk is one tab stop, whatever the report holds', () => {
  it('really draws regions, so a count of nothing cannot pass quietly', async () => {
    await open(smallId)
    expect(await regionsDrawn(), 'no part of this report can be pointed at').toBeGreaterThan(1)
    await open(bigId)
    expect(await regionsDrawn(), 'the long report draws no more regions than the short one')
      .toBeGreaterThan(20)
  })

  /**
   * THE MEASUREMENT THE CLAIM IS MADE OF. Two reports whose region counts differ by an order of
   * magnitude have the SAME number of tab stops added by the walk, and it is one.
   */
  it('costs the same one tab stop on a report of 24 paragraphs as on a report of 2 blocks', async () => {
    await open(smallId)
    const smallRegions = await regionsDrawn()
    const smallStops = await tabStopsInsideTheWriting()
    await open(bigId)
    const bigRegions = await regionsDrawn()
    const bigStops = await tabStopsInsideTheWriting()

    // Neither report holds a table, so the only controls inside the writing are the ones that
    // change how it is read — the same ones on both. Any difference in stops is the walk.
    expect(bigRegions - smallRegions, 'the two reports hold the same number of regions')
      .toBeGreaterThan(20)
    expect(bigStops, 'the walk added a tab stop per region rather than one').toBe(smallStops)
  })

  /** And exactly one element carries it at a time, which is what "roving" means. */
  it('gives exactly one thing inside the writing a tab stop at a time', async () => {
    await open(bigId)
    const before = await page.evaluate(() => {
      const body = document.querySelector('.sb') as HTMLElement | null
      const regions = [...document.querySelectorAll<HTMLElement>('.sb [data-target^="region/"]')]
      return {
        bodyStop: body === null ? -1 : body.tabIndex,
        regionsWithAStop: regions.filter((el) => el.tabIndex >= 0).length,
        regionsReachable: regions.filter((el) => el.tabIndex === -1).length,
      }
    })
    expect(before.bodyStop, 'the report body is not a tab stop before anybody steps in').toBe(0)
    expect(before.regionsWithAStop, 'a region is a tab stop while nobody is in the walk').toBe(0)
    expect(before.regionsReachable, 'the regions cannot be reached from the keyboard at all')
      .toBeGreaterThan(20)

    await page.locator('.sb').first().focus()
    await page.keyboard.press('ArrowDown')
    const after = await page.evaluate(() => {
      const body = document.querySelector('.sb') as HTMLElement | null
      const regions = [...document.querySelectorAll<HTMLElement>('.sb [data-target^="region/"]')]
      const focused = document.activeElement as HTMLElement | null
      return {
        bodyStop: body === null ? -1 : body.tabIndex,
        regionsWithAStop: regions.filter((el) => el.tabIndex >= 0).length,
        focusedIsARegion: focused !== null && focused.hasAttribute('data-target'),
      }
    })
    expect(after.focusedIsARegion, 'stepping into the walk did not focus a part of the report').toBe(true)
    expect(after.regionsWithAStop, 'more than one region carries the tab stop at once').toBe(1)
    expect(after.bodyStop, 'the body kept its tab stop as well, so the walk cost two').toBe(-1)
  })

  /** Escape puts the one stop back where it started, so the walk can be left. */
  it('gives the tab stop back to the report body when somebody leaves the walk', async () => {
    await open(bigId)
    await page.locator('.sb').first().focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Escape')
    const back = await page.evaluate(() => {
      const body = document.querySelector('.sb') as HTMLElement | null
      const regions = [...document.querySelectorAll<HTMLElement>('.sb [data-target^="region/"]')]
      return {
        bodyStop: body === null ? -1 : body.tabIndex,
        regionsWithAStop: regions.filter((el) => el.tabIndex >= 0).length,
        focusedIsTheBody: document.activeElement === body,
      }
    })
    expect(back.bodyStop, 'the report body did not take its tab stop back').toBe(0)
    expect(back.regionsWithAStop, 'a region kept the tab stop after the walk was left').toBe(0)
    expect(back.focusedIsTheBody, 'focus was left inside the writing with no stop on it').toBe(true)
  })

  /** Down and Up walk the report in the order it is drawn, and stop at the ends. */
  it('steps to the next part and back, and does not fall off either end', async () => {
    await open(smallId)
    await page.locator('.sb').first().focus()
    await page.keyboard.press('ArrowDown')
    const first = await page.evaluate(() => document.activeElement?.getAttribute('data-target') ?? null)
    await page.keyboard.press('ArrowDown')
    const second = await page.evaluate(() => document.activeElement?.getAttribute('data-target') ?? null)
    expect(first, 'stepping in landed on nothing').not.toBeNull()
    expect(second, 'the second press did not move').not.toBe(first)
    await page.keyboard.press('ArrowUp')
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-target') ?? null)).toBe(first)
    await page.keyboard.press('ArrowUp')
    expect(
      await page.evaluate(() => document.activeElement?.getAttribute('data-target') ?? null),
      'walking up past the first part left the writing',
    ).toBe(first)
  })

  /**
   * AND THE WALK IS FOR SOMETHING. A person who reaches a paragraph without a pointer can talk
   * about that paragraph, which is the whole reason the route exists.
   */
  it('opens the composer about the part somebody is standing on, from the keyboard alone', async () => {
    await open(smallId)
    await page.locator('.sb').first().focus()
    await page.keyboard.press('ArrowDown')
    const standingOn = await page.evaluate(() => document.activeElement?.getAttribute('data-target') ?? null)
    expect(standingOn, 'nothing was focused to talk about').not.toBeNull()
    await page.keyboard.press('Enter')
    await page.waitForTimeout(600)
    // The composer says what it is through the surface registry, the same way every other part of
    // Mole Office's own screen does, so this looks for the thing rather than for a class name.
    const composerIsOpen = await page.evaluate(
      () => document.querySelectorAll('[data-target="uiSurface/composer"]').length > 0,
    )
    expect(composerIsOpen, 'Enter on a part of a report opened no composer').toBe(true)
  })
})
