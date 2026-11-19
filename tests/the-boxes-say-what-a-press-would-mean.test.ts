// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A READER CAN SEE WHICH PART OF A REPORT A PRESS WOULD BE ABOUT, BEFORE MAKING IT.
 *
 * ---------------------------------------------------------------------------------------
 * THE QUESTION A READER ASKS
 * ---------------------------------------------------------------------------------------
 *
 * What will Mole Office take a right-click here to mean? Since wave 5 step 7 a report
 * is made of parts a person can point at — one per paragraph, bullet, heading, table and fenced
 * block — and which one a press lands on is decided by which box the pointer is inside. The boxes
 * were invisible.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS RUNS IN A BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * Every assertion is about what is drawn. The rule is a CSS selector and the thing it selects is
 * decided by where the pointer is; nothing but a browser that has resolved both can say whether the
 * outline is on the paragraph the pointer is in. `outlineStyle` is read off the computed style, so
 * a rule that stopped matching would read `none` here rather than passing quietly.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTROL
 * ---------------------------------------------------------------------------------------
 *
 * The first case asserts that with the control OFF and the pointer over the same paragraph, nothing
 * is outlined at all. Without it, a stylesheet that outlined everything always would pass every
 * case below.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY WAIT ASKS THE CASE'S OWN CLOCK
 * ---------------------------------------------------------------------------------------
 *
 * Problem `cvqJcoA0Kowa`. In a whole suite on a busy machine, one case ran out of its 30 s while it
 * was still inside openReport, whose waits allowed 60 s, 60 s and 30 s. The next case then found no
 * solid box. A case that times out is not stopped, and its late press on the Regions control may
 * have turned the boxes off under the next case. That is possible, not proved. So each wait now
 * takes only what is left of its own case's time, from `theTimeLeftIn`, and ends 2 s before the
 * case does. A wait that runs out is then reported by Playwright, at its own line, and the case has
 * ended before the next one starts.
 *
 * The fixed sleeps after the Regions press and after a pointer move are now waits for the state the
 * next line reads: `data-regions` on the page, and the paragraph matching `:hover`. A busy page that
 * took longer than the old 200 ms no longer reads as no boxes.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { theTimeLeftIn, type TheTimeLeft } from './how-long-a-test-may-take.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let app: LiveApp
let page: Page
let reportId = ''

const PROSE =
  'The shell cracked on the third print, at the same corner each time.\n\n' +
  'A second paragraph, so the first one is not the only one on the page.\n\n' +
  '- the first bullet\n' +
  '- the second bullet\n'

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as Record<string, unknown>
}

/** Open the report, with the boxes off and nothing else on. */
async function openReport(time: TheTimeLeft, mode: '' | '?mode=inspect' = ''): Promise<void> {
  // A BLANK PAGE FIRST, so this really is a fresh load. Going to the address the browser is already
  // at leaves the app mounted and its state with it, and a case that then pressed the control was
  // turning the boxes OFF. Measured while writing this file: the third case saw `data-regions=null`
  // after a press that read as a press to turn them on.
  await page.goto('about:blank', { timeout: time.forAWait('a blank page') })
  await page.goto(`${app.site}/${mode}#/r/${reportId}`, { timeout: time.forAWait('the report to load') })
  await waitForThePage(page, time.forAWait('the report to finish drawing'))
  await page.waitForSelector('.sb-regions', { timeout: time.forAWait('the Regions control') })
  await page.waitForSelector('.sb p.sb-p', { timeout: time.forAWait("the report's first paragraph") })
}

/** Press the Regions control, and wait until the page says the boxes are on. */
async function turnTheBoxesOn(time: TheTimeLeft): Promise<void> {
  await page.locator('.sb-regions').click({ timeout: time.forAWait('the Regions control to take a press') })
  await page.waitForFunction(() => document.documentElement.getAttribute('data-regions') !== null, undefined, {
    timeout: time.forAWait('the page to say the boxes are on'),
  })
}

/** The middle of the first element matching, in page coordinates. */
async function middleOf(selector: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).first().boundingBox()
  if (box === null) throw new Error(`nothing is drawn for ${selector}`)
  return { x: box.x + box.width / 2, y: box.y + Math.min(8, box.height / 2) }
}

/**
 * Put the pointer over a thing, having first put it somewhere else.
 *
 * A MOVE TO WHERE THE POINTER ALREADY IS RAISES NOTHING, so a case that ran after another case
 * which left the pointer on the same paragraph measured a page with no hover on it at all. Two
 * cases in this file were doing exactly that.
 */
async function pointAt(time: TheTimeLeft, selector: string): Promise<void> {
  await page.mouse.move(2, 2)
  await page.waitForFunction((one) => document.querySelector(`${one}:hover`) === null, selector, {
    timeout: time.forAWait(`the pointer to leave ${selector}`),
  })
  const at = await middleOf(selector)
  await page.mouse.move(at.x, at.y)
  await page.waitForFunction((one) => document.querySelector(`${one}:hover`) !== null, selector, {
    timeout: time.forAWait(`the pointer to be over ${selector}`),
  })
}

/** Every outlined element inside the writing, with its line style and what it holds. */
async function outlined(): Promise<{ key: string; style: string; holdsHovered: boolean; named: string }[]> {
  return await page.evaluate(() => {
    const out: { key: string; style: string; holdsHovered: boolean; named: string }[] = []
    for (const el of document.querySelectorAll<HTMLElement>('.sb [data-target]')) {
      const style = getComputedStyle(el)
      if (style.outlineStyle === 'none' || style.outlineWidth === '0px') continue
      out.push({
        key: el.getAttribute('data-target') ?? '',
        style: style.outlineStyle,
        holdsHovered: el.querySelector('[data-target]:hover') !== null,
        named: getComputedStyle(el, '::after').content,
      })
    }
    return out
  })
}

beforeAll(async () => {
  app = await liveApp({ opensAt: 'full', name: 'regions-overlay', viewport: { width: 1440, height: 1000 } })
  page = app.page
  const written = await post('/api/records', {
    kind: 'report',
    title: 'A report with parts',
    data: { blocks: [{ id: 'b-1', type: 'text', heading: 'What was measured', text: PROSE }] },
  })
  reportId = String((written['record'] as { id: string }).id)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the Regions control shows the boxes and takes no presses', () => {
  it('draws nothing while it is off, with the pointer over a paragraph', async ({ task }) => {
    const time = theTimeLeftIn(task)
    await openReport(time)
    await pointAt(time, '.sb p.sb-p')
    expect(await page.locator('.sb-regions').getAttribute('aria-pressed'), 'it starts on').toBe('false')
    expect((await outlined()).map((one) => one.key), 'boxes were drawn with the control off').toEqual([])
  })

  it('outlines the paragraph under the pointer, and its holders dashed', async ({ task }) => {
    const time = theTimeLeftIn(task)
    await openReport(time)
    await turnTheBoxesOn(time)
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-regions'))).toBe('boxes')
    await pointAt(time, '.sb p.sb-p')

    const drawn = await outlined()
    const solid = drawn.filter((one) => one.style === 'solid')
    const dashed = drawn.filter((one) => one.style === 'dashed')
    expect(drawn.length, 'the control is on and nothing was outlined').toBeGreaterThan(0)
    expect(solid.length, 'more than one part was drawn as the one a press would be about').toBe(1)
    expect(solid[0]?.key ?? '', 'the solid box is not on a part of the report').toMatch(/^region\//)
    expect(drawn.length - solid.length - dashed.length, 'something was drawn in a third channel').toBe(0)
    expect(
      dashed.filter((one) => !one.holdsHovered).map((one) => one.key),
      'these were drawn as holding the part under the pointer and do not hold it',
    ).toEqual([])
  })

  it('says nothing about a stored path to a reader in Normal mode', async ({ task }) => {
    const time = theTimeLeftIn(task)
    await openReport(time)
    await turnTheBoxesOn(time)
    await pointAt(time, '.sb p.sb-p')
    const solid = (await outlined()).filter((one) => one.style === 'solid')
    expect(solid.length).toBe(1)
    // `content: none` or `""` — either is nothing drawn. A region id is machinery and the contract
    // keeps machinery out of Normal mode.
    expect(['none', '""', 'normal'], `a path was drawn in Normal mode: ${solid[0]?.named ?? ''}`).toContain(
      solid[0]?.named ?? '',
    )
  })

  it('names the part for a reader in Developer mode', async ({ task }) => {
    const time = theTimeLeftIn(task)
    await openReport(time, '?mode=inspect')
    await turnTheBoxesOn(time)
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-regions'))).toBe('named')
    await pointAt(time, '.sb p.sb-p')
    const solid = (await outlined()).filter((one) => one.style === 'solid')
    expect(solid.length).toBe(1)
    // THE ADDRESS AS IT WILL BE STORED, which is what a developer is asking for and is what the
    // element carries. It is percent-encoded because a region id holds brackets and a hash, and
    // `targetAttributeValue` encodes every identifier so a value holding a slash cannot break the
    // shape. Decoding it for the label would be a second spelling of the same string.
    expect(solid[0]?.named ?? '', 'the box is not named for a developer').toContain('region/')
    expect(solid[0]?.named ?? '', 'the name does not say which stored string').toContain('data.blocks')
  })


  it('lets a link still be followed, because this mode takes no presses', async ({ task }) => {
    const time = theTimeLeftIn(task)
    await openReport(time)
    await turnTheBoxesOn(time)
    const before = await page.evaluate(() => location.hash)
    const at = await middleOf('.sb p.sb-p')
    await page.mouse.click(at.x, at.y)
    // A FIXED HALF SECOND, because this waits for something NOT to happen, and no state on the page
    // says that a press has had all the effect it is going to have.
    await sleep(500)
    expect(await page.evaluate(() => location.hash), 'a press moved the page').toBe(before)
    expect(await page.locator('.px-talk').count(), 'a plain press opened the composer').toBe(0)
  })
})
