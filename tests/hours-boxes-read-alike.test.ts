// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE STRING, EVERY HOURS BOX IN THE PRODUCT: `5h`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED IN A BROWSER RATHER THAN READ OFF THE SOURCE
 * ---------------------------------------------------------------------------------------
 *
 * The box that gives a plan line time was fixed on 16 August 2026 so that `5h` means five hours
 * instead of writing an allocation with no hours at all. Driving the rest of the product with the
 * same string on the same day showed that it was the only box that had been:
 *
 *   the hours cell on a week          “5h” is not a number of hours. Nothing was written.
 *   the week's capacity               “5h” is not a number of hours. Nothing was written.
 *   the hours each press commits      “5h” is not a number of hours.
 *   the box beside "put on this day"  nothing at all — the press quietly would not go
 *   the How big cell on a plan        "5h" is not a number of hours.
 *
 * One question — what number of hours did this person type — answered in three places, which is the
 * defect this repository keeps producing, and the eighth rule broken in five: a human-facing box is
 * not where strictness is enforced by refusal. `readHoursBox` in `src/shared/planning.ts` is now the
 * one reader and every box calls it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A REAL BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * The question this file answers is not "what does the reader return" — `tests/give-it-time-words`
 * asks that of the reader directly. It is "what does each box WRITE", and each box writes through
 * its own component, its own commit path and its own request. A unit test of the reader would have
 * passed on the day every one of those boxes refused `5h`.
 *
 * WHAT IS ASSERTED, AND WHY EACH ONE WOULD HAVE CAUGHT THE DEFECT
 *
 *   every box writes 5 from `5h`             four of the five wrote nothing, and said so
 *   the box says what it read                a box that silently changed 5h to 5 would be an
 *                                            interpretation nobody was shown — the eighth rule
 *   unreadable words write NOTHING           the control: a box that had become `Number(...)` with
 *                                            a wider net would pass every assertion above
 *   and they say why, before the press       the day row said nothing until somebody pressed
 */

import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { periodKey } from '../src/shared/planning.ts'

/** The week and the day the schedule opens on, so no address has to be invented. */
const THIS_WEEK = periodKey('week', new Date())
const TODAY = periodKey('day', new Date())

// ------------------------------------------------------------------- the servers and the page

let app: LiveApp
let apiPort: number
let webPort: number
let page: Page
let site: string
let planId: string
let workId: string

/** Talk to the API the way the browser does, with a human's headers on every write. */
async function call(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`http://127.0.0.1:${apiPort}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': 'the hours test',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} answered ${res.status}: ${text}`)
  return text === '' ? null : JSON.parse(text)
}

beforeAll(async () => {
  app = await liveApp({ name: 'hours', viewport: { width: 1600, height: 1200 } })
  apiPort = app.apiPort
  webPort = app.webPort
  page = app.page

  const made = await call('POST', '/api/records', {
    kind: 'task',
    title: 'Fit the reading view to the week',
    data: { state: 'doing' },
  })
  workId = made.record.id
  await call('POST', '/api/planning/allocations', { horizon: 'week', period: THIS_WEEK, recordId: workId })

  // A plan whose second line is already filed as this work, so the How big cell is drawn on it.
  const plan = await call('POST', '/api/plans', { title: 'A week with hours in it' })
  planId = plan.plan.id
  await call('PUT', `/api/plans/${planId}/body`, {
    body: ['# The week', '- Fit the reading view to the week', '- Write the report'].join('\n'),
  })
  const read = await call('GET', `/api/plans/${planId}`)
  const line = (read.lines as any[]).find((one) => one.line.text.includes('Fit the reading view'))
  await call('PATCH', `/api/plans/${planId}/lines/${line.line.id}`, { recordId: workId })

  site = `http://127.0.0.1:${webPort}`
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** The hours the week's one allocation holds, straight from the server. */
async function weekHours(): Promise<number | null> {
  const reply = await call('GET', `/api/planning/week/${THIS_WEEK}`)
  return reply.entries[0].allocation.plannedHours
}

/** Wait until a reading answers what was wanted. `expect.poll` cannot be used outside a case. */
async function until<T>(what: string, read: () => T | Promise<T>, wanted: T, timeout = 30_000): Promise<void> {
  const deadline = Date.now() + timeout
  for (;;) {
    if ((await read()) === wanted) return
    if (Date.now() > deadline) throw new Error(`waited ${String(timeout)} ms for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

/** Everything a box said after it was typed into: what it holds, and every sentence near it. */
async function boxSaid(selector: string): Promise<{ value: string; near: string }> {
  return page.evaluate((sel) => {
    const input = document.querySelector<HTMLInputElement>(sel)
    const around = input?.closest('li, .px-pl-capline, .pi-words-box, div') ?? null
    return {
      value: input?.value ?? '(no box of that name on the page)',
      near: (around?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    }
  }, selector)
}

describe('the hours cell on a week', () => {
  let live: { value: string; near: string }
  let after: { value: string; near: string }
  let wrote: number | null

  beforeAll(async () => {
    await page.goto(`${site}/#/plan/${THIS_WEEK}/edit`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    const box = page.locator('input.px-pl-hin').first()
    await box.waitFor({ timeout: 30_000 })
    await box.click()
    await box.fill('5h')
    // WHAT IT SAYS WHILE THE TYPO CAN STILL BE FIXED, which is the moment that matters.
    await page.waitForFunction(() => document.body.innerText.includes('Read “5h” as 5h.'), undefined, {
      timeout: 30_000,
    })
    live = await boxSaid('input.px-pl-hin')
    await page.keyboard.press('Tab')
    // THE STORED HOURS AND THE BOX'S OWN READING, rather than a timer.
    await until('the week to hold five hours', weekHours, 5)
    await until('the hours box to show what it wrote', async () => (await boxSaid('input.px-pl-hin')).value, '5')
    after = await boxSaid('input.px-pl-hin')
    wrote = await weekHours()
  }, 120_000)

  it('writes five hours', () => {
    expect(wrote).toBe(5)
  })

  it('says what it read before anything is written, so the interpretation is not silent', () => {
    expect(live.near).toContain('Read “5h” as 5h.')
  })

  it('shows the number it wrote, not the characters it did not keep', () => {
    expect(after.value).toBe('5')
  })
})

describe('the box that says how many hours a week holds', () => {
  let said: { value: string; near: string }
  let capacity: number | null

  beforeAll(async () => {
    await page.goto(`${site}/#/plan/${THIS_WEEK}/edit`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.waitForFunction(
      () =>
        document.querySelector('input.px-pl-caph') !== null ||
        [...document.querySelectorAll('button')].some((one) => /Set week capacity/i.test(one.textContent ?? '')),
      undefined,
      { timeout: 30_000 },
    )
    const open = page.getByRole('button', { name: /Set week capacity/i })
    if ((await open.count()) > 0) await open.first().click()
    const box = page.locator('input.px-pl-caph').first()
    await box.waitFor({ timeout: 30_000 })
    await box.click()
    await box.fill('5h')
    await page.waitForFunction(() => document.body.innerText.includes('Read “5h” as 5h.'), undefined, {
      timeout: 30_000,
    })
    said = await boxSaid('input.px-pl-caph')
    await page.keyboard.press('Tab')
    await until(
      'the week capacity to hold five hours',
      async () => (await call('GET', `/api/planning/week/${THIS_WEEK}`)).capacity?.hours ?? null,
      5,
    )
    const reply = await call('GET', `/api/planning/week/${THIS_WEEK}`)
    capacity = reply.capacity?.hours ?? null
  }, 120_000)

  it('writes five hours', () => {
    expect(capacity).toBe(5)
  })

  it('says what it read before anything is written', () => {
    expect(said.near).toContain('Read “5h” as 5h.')
  })
})

describe('the box beside "put on this day"', () => {
  let onTheDay: number | null
  let unreadable: string
  let blockedOnWords: string | null
  let blockedOnHours: string | null

  beforeAll(async () => {
    await page.goto(`${site}/#/plan/${TODAY}/edit`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    const box = page.locator('input.px-pl-hin').first()
    const press = page.getByRole('button', { name: /put on this day/i }).first()
    await box.waitFor({ timeout: 30_000 })
    await press.waitFor({ timeout: 30_000 })

    // FIRST THE CONTROL: words this product cannot read say so where they were typed, BEFORE any
    // press. This row used to draw nothing at all and disable the press without a word.
    await box.click()
    await box.fill('90m')
    await page.waitForFunction(() => document.body.innerText.includes('It reads 5h, 5 hours and 2.5 hrs'), undefined, {
      timeout: 30_000,
    })
    unreadable = (await boxSaid('input.px-pl-hin')).near
    blockedOnWords = await press.getAttribute('aria-disabled')

    await box.fill('5h')
    // THE PRESS COMES BACK WHEN THE BOX READS, which is the page's own answer to the typing.
    await until('the day press to come back', async () => press.getAttribute('aria-disabled'), null)
    blockedOnHours = await press.getAttribute('aria-disabled')
    // FORCED, so that a press this test believes is live is really pressed rather than waited on.
    // The component's own guard is what decides whether anything is written, and a press that will
    // not go leaves the day empty — which is what the assertion below reads.
    await press.click({ force: true })
    await until(
      'the day to hold five hours',
      async () => {
        const read = await call('GET', `/api/planning/day/${TODAY}`)
        return read.entries.length === 0 ? null : read.entries[0].allocation.plannedHours
      },
      5,
    )
    const reply = await call('GET', `/api/planning/day/${TODAY}`)
    onTheDay = reply.entries.length === 0 ? null : reply.entries[0].allocation.plannedHours
  }, 120_000)

  it('puts five hours on the day', () => {
    expect(onTheDay).toBe(5)
  })

  it('offers the press when the box reads, and holds it back when it does not', () => {
    expect(blockedOnHours).toBeNull()
    expect(blockedOnWords).toBe('true')
  })

  it('says why it can read nothing out of "90m", before anything is pressed', () => {
    expect(unreadable).toContain('It reads 5h, 5 hours and 2.5 hrs')
  })
})

describe('the How big cell on a plan', () => {
  let said: { value: string; near: string }
  let sized: number | null
  let afterWords: number | null
  let refusal: string

  beforeAll(async () => {
    await page.goto(`${site}/#/plans/${planId}/edit`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.waitForFunction(
      () =>
        document.querySelector('input.pi-hours') !== null ||
        [...document.querySelectorAll('button')].some((one) => (one.textContent ?? '').trim() === 'Table'),
      undefined,
      { timeout: 30_000 },
    )
    const table = page.getByRole('button', { name: /^Table$/ })
    if ((await table.count()) > 0) await table.first().click()

    const box = page.locator('input.pi-hours').first()
    await box.waitFor({ timeout: 30_000 })
    await box.click()
    await box.fill('5h')
    await page.keyboard.press('Enter')
    // THE BOX SAYS WHAT IT READ ONCE THE PRESS IS MADE, which is the reading this case asserts.
    await page.waitForFunction(() => document.body.innerText.includes('Read “5h” as 5h.'), undefined, {
      timeout: 30_000,
    })
    await until(
      'the work to hold five hours',
      async () => (await call('GET', `/api/records/${workId}`)).record.data.effort_hours ?? null,
      5,
    )
    said = await boxSaid('input.pi-hours')
    sized = (await call('GET', `/api/records/${workId}`)).record.data.effort_hours ?? null

    // AND THE CONTROL, on the same box: words with no number of hours in them write NOTHING, and the
    // estimate that was already there is left alone.
    const again = page.locator('input.pi-hours').first()
    await again.click()
    await again.fill('about a day')
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.body.innerText.includes('Nothing was written'), undefined, {
      timeout: 30_000,
    })
    refusal = (await boxSaid('input.pi-hours')).near
    afterWords = (await call('GET', `/api/records/${workId}`)).record.data.effort_hours ?? null
  }, 120_000)

  it('sizes the work at five hours', () => {
    expect(sized).toBe(5)
  })

  it('says what it read', () => {
    expect(said.near).toContain('Read “5h” as 5h.')
  })

  it('writes nothing at all from words it cannot read, and leaves the estimate alone', () => {
    expect(afterWords).toBe(5)
    expect(refusal).toContain('Nothing was written')
  })
})
