// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SCHEDULE, AS THE OWNER ADOPTED IT: WHAT A REAL PAGE DRAWS.
 *
 * Wave 13k proposed a design for the Schedule (report n9Mjk3c_sJRu, block b-13) and the owner adopted
 * it with the shared rules. This file opens the real page, served by a real
 * server on a database of its own, and measures what the design promises:
 *
 *   1. one control row, in order: Day / Week / Month, back, forward, Today, the date field;
 *   2. one primary press, "Plan this week", at the right of the title, leading to the planning address;
 *   3. hours first, with one large number;
 *   4. a hatched part of the bar for work that has no hours;
 *   5. a week nobody gave a capacity says "not set", never 0h, and draws no bar;
 *   6. no total adds the week's own hours to the hours on its days;
 *   7. seven columns at 1440, and the blocks one under another at 390, each saying its days;
 *   8. the work on the week as its own list, after the board;
 *   9. goals and deadlines as a short list;
 *  10. the existing way to start a plan, item 6 of a decision;
 *  11. no box inside a box.
 *
 * And, without a browser: the press the server's refusal names is the press the page draws.
 *
 * Every write below is made the way the person makes it, with the person's headers, through the API.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { periodKey } from '../src/shared/planning.ts'
import { en } from '../src/shared/words/en.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'

let app: LiveApp
let page: Page
const headers = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function request(path: string, method = 'GET', body?: unknown): Promise<any> {
  const reply = await fetch(app.api + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  if (!reply.ok) throw new Error(`${method} ${path} answered ${String(reply.status)}: ${text}`)
  return JSON.parse(text)
}

/** The week the server is in, and the one after it, read from the server's own clock. */
let week = ''
let nextWeek = ''
/** A day of this week, counted from its Monday. */
let dayOf: (offset: number) => string = () => ''

beforeAll(async () => {
  app = await liveApp({ name: 'schedule-as-designed', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  page = app.page
  const today = await request('/api/planning/today')
  week = today.week
  const monday = new Date(`${today.day}T12:00:00`)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  dayOf = (offset) => {
    const d = new Date(monday)
    d.setDate(d.getDate() + offset)
    return periodKey('day', d)
  }
  const after = new Date(monday)
  after.setDate(after.getDate() + 7)
  nextWeek = periodKey('week', after)

  const task = async (title: string) => (await request('/api/records', 'POST', { kind: 'task', title, data: { state: 'todo' } })).record.id as string
  const weigh = await task('Weigh a full tray')
  const move = await task('Move trays without tipping them')
  const count = await task('Count what sprouted')
  const printer = await task('Fix the till receipt printer')
  await request(`/api/planning/capacity/week/${week}`, 'PUT', { hours: 20 })
  await request('/api/planning/allocations', 'POST', { horizon: 'week', period: week, recordId: weigh, plannedHours: 5 })
  await request('/api/planning/allocations', 'POST', { horizon: 'week', period: week, recordId: move, plannedHours: 4 })
  await request('/api/planning/allocations', 'POST', { horizon: 'week', period: week, recordId: count, plannedHours: 2 })
  await request('/api/planning/allocations', 'POST', { horizon: 'week', period: week, recordId: printer, plannedHours: null })
  // Three hours on a day of the week, which is never added to the week's own eleven.
  await request('/api/planning/allocations', 'POST', { horizon: 'day', period: dayOf(1), recordId: weigh, plannedHours: 3 })
  // Next week has one piece of work and no capacity: nobody has said how many hours it holds.
  await request('/api/planning/allocations', 'POST', { horizon: 'week', period: nextWeek, recordId: printer, plannedHours: 2 })
  await request('/api/planning/windows', 'POST', { recordId: weigh, startsOn: dayOf(0), endsOn: dayOf(1) })
  await request('/api/planning/windows', 'POST', { recordId: count, startsOn: dayOf(3), endsOn: dayOf(3) })
  const goal = (await request('/api/records', 'POST', {
    kind: 'goal',
    title: 'Trays move from bench to shelf by themselves',
    data: { horizon: 'short', what: 'Trays move by themselves, and anybody can check it.', owner: THE_PERSON, state: 'open' },
  })).record.id
  await request('/api/records', 'POST', {
    kind: 'goal',
    title: 'The pump stops when told',
    data: { horizon: 'medium', what: 'The pump stops, and anybody can check it.', owner: THE_PERSON, state: 'open' },
  })
  await request('/api/links', 'POST', { fromId: weigh, toId: goal, type: 'serves' })
  await request('/api/links', 'POST', { fromId: move, toId: goal, type: 'serves' })
}, 180_000)

afterAll(async () => {
  await app?.stop()
})

async function open(address: string, width = 1440): Promise<void> {
  await page.setViewportSize({ width, height: 1000 })
  await page.goto(`${app.site}/#/${address}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('[data-target="uiSurface/plan.goals"] .px-pl-toward, [data-target="uiSurface/plan.goals"] .px-pl-none', { timeout: 30_000 })
  await page.waitForSelector('.px-pl-bday', { timeout: 30_000 }).catch(() => undefined)
}

/** The text of one section of the page, found by the part of the screen it declares. */
async function section(surface: string): Promise<string> {
  return page.locator(`[data-target="uiSurface/${surface}"]`).first().innerText()
}

describe('the Schedule as the owner adopted it, on a real page', () => {
  it('1. draws one control row: Day, Week, Month, back, forward, Today, then the date field', async () => {
    await open('plan')
    const controls = await page.evaluate(() => {
      const row = document.querySelector('.px-plan-nav')
      if (row === null) return []
      return [...row.querySelectorAll('.px-plan-h, .px-plan-step, .px-plan-today, .px-plan-when-open')].map((el) => {
        const box = el.getBoundingClientRect()
        return { text: (el.textContent ?? '').trim(), top: box.top, bottom: box.bottom }
      })
    })
    expect(controls.map((one) => one.text)).toEqual([
      en['g8.schedulePage.day'],
      en['g8.schedulePage.week'],
      en['g8.schedulePage.month'],
      en['g8.schedulePage.previous'],
      en['g8.schedulePage.next'],
      en['scheduleDesign.today'],
      en['g8.schedulePage.goToADateOrPeriod'],
    ])
    // ONE ROW at 1440: every control overlaps the first one vertically.
    const first = controls[0]!
    for (const one of controls) {
      expect(one.top < first.bottom && one.bottom > first.top, `"${one.text}" is not on the control row`).toBe(true)
    }
  })

  it('2. draws one primary press, "Plan this week", at the right of the title, leading to planning', async () => {
    await open('plan')
    const presses = await page.evaluate(() =>
      [...document.querySelectorAll('.px-plan-primary')].map((el) => {
        const box = el.getBoundingClientRect()
        const title = document.querySelector('.px-plan-page')!.getBoundingClientRect()
        return { text: (el.textContent ?? '').trim(), href: el.getAttribute('href') ?? '', left: box.left, top: box.top, titleRight: title.right, titleBottom: title.bottom }
      }),
    )
    expect(presses.length, 'the page does not have exactly one primary press').toBe(1)
    const press = presses[0]!
    expect(press.text).toBe(en['schedule.planWeek'])
    expect(press.href.endsWith('/edit'), `the primary press leads to ${press.href}, not to planning`).toBe(true)
    expect(press.left, 'the primary press is not at the right of the title').toBeGreaterThan(press.titleRight)
    expect(press.top, 'the primary press is not beside the title').toBeLessThan(press.titleBottom)
  })

  it('3. draws the hours first, with one large number', async () => {
    await open('plan')
    const first = await page.evaluate(() => {
      const sections = [...document.querySelectorAll('.px-pl-section')]
      const hours = sections[0]
      const big = hours?.querySelector('.px-pl-big')
      const body = hours?.querySelector('.px-pl-read')
      return {
        surface: hours?.getAttribute('data-target') ?? '',
        big: big === null || big === undefined ? '' : (big.textContent ?? '').trim(),
        bigSize: big === null || big === undefined ? 0 : parseFloat(getComputedStyle(big).fontSize),
        bodySize: body === null || body === undefined ? 0 : parseFloat(getComputedStyle(body).fontSize),
      }
    })
    expect(first.surface, 'the first section of the page is not the hours').toBe('uiSurface/plan.hours')
    expect(first.big).toBe('11h')
    expect(first.bigSize, 'the number of hours is not large').toBeGreaterThan(first.bodySize * 1.5)
  })

  it('4. hatches the part of the bar that work with no hours might still take', async () => {
    await open('plan')
    const hatch = await page.evaluate(() => {
      const el = document.querySelector('[data-target="uiSurface/plan.hours"] .px-pl-meter .px-pl-hatch')
      if (el === null) return null
      return { width: el.getBoundingClientRect().width, image: getComputedStyle(el).backgroundImage }
    })
    expect(hatch, 'the bar has no hatched part although one piece of work has no hours').not.toBeNull()
    expect(hatch!.width).toBeGreaterThan(0)
    expect(hatch!.image).toContain('gradient')
    expect(await section('plan.hours')).toContain(sayInEnglish('schedule.unstatedCount', { n: 1 }))
  })

  it('5. says "not set" on a week nobody gave a capacity, and never 0h, with no bar', async () => {
    await open(`plan/${nextWeek}`)
    const hours = await section('plan.hours')
    expect(hours).toContain(en['schedule.notSet'])
    expect(hours).not.toMatch(/of 0h|\b0h left/)
    expect(await page.locator('[data-target="uiSurface/plan.hours"] .px-pl-meter').count(), 'a bar is drawn for a week whose hours nobody set').toBe(0)
  })

  it('6. never adds the week’s own hours to the hours on its days', async () => {
    await open('plan')
    const hours = await section('plan.hours')
    // Eleven on the week itself and three on one of its days. Fourteen would be the two added.
    expect(hours).toContain('11h')
    expect(hours).toContain('3h')
    expect(hours, 'the hours on the days were added to the week’s own').not.toContain('14h')
    const particular = await page.locator('[data-target="uiSurface/plan.hours"] .px-pl-particular').innerText()
    expect(particular).toContain('3h')
  })

  it('7. draws the week as seven columns at 1440', async () => {
    await open('plan', 1440)
    const days = await page.evaluate(() => [...document.querySelectorAll('.px-pl-bday')].map((el) => el.getBoundingClientRect()).map((b) => ({ top: Math.round(b.top), left: b.left })))
    expect(days.length).toBe(7)
    expect(new Set(days.map((one) => one.top)).size, 'the seven days are not in one row').toBe(1)
    const blocks = await page.evaluate(() => [...document.querySelectorAll('.px-pl-block')].map((el) => el.getBoundingClientRect()).map((b) => ({ top: Math.round(b.top), left: b.left })))
    expect(blocks.length).toBe(2)
    expect(blocks[0]!.top, 'the two blocks are not side by side in their columns').toBe(blocks[1]!.top)
  })

  it('7. lists the blocks one under another at 390, each saying its days', async () => {
    await open('plan', 390)
    const blocks = await page.evaluate(() =>
      [...document.querySelectorAll('.px-pl-block')].map((el) => {
        const b = el.getBoundingClientRect()
        const board = el.closest('.px-pl-board')!.getBoundingClientRect()
        return { top: b.top, bottom: b.bottom, width: b.width, boardWidth: board.width, when: el.querySelector('.px-pl-bwhen')?.textContent ?? '' }
      }),
    )
    expect(blocks.length).toBe(2)
    expect(blocks[1]!.top, 'the blocks are not one under another').toBeGreaterThanOrEqual(blocks[0]!.bottom)
    for (const one of blocks) {
      expect(one.width, 'a block does not take the width of the list').toBeGreaterThan(one.boardWidth * 0.9)
      expect(one.when.trim(), 'a block does not say its days').not.toBe('')
    }
  })

  it('8. draws the work on the week as its own list, after the board, and the sections in order', async () => {
    await open('plan')
    const work = await section('plan.work')
    for (const title of ['Weigh a full tray', 'Move trays without tipping them', 'Count what sprouted', 'Fix the till receipt printer']) {
      expect(work).toContain(title)
    }
    expect(work).toContain('4 pieces of work')
    const order = await page.evaluate(() => [...document.querySelectorAll('.px-pl-section')].map((el) => el.getAttribute('data-target')))
    const at = (surface: string) => order.indexOf(`uiSurface/${surface}`)
    expect(at('plan.hours')).toBeLessThan(at('plan.board'))
    expect(at('plan.board')).toBeLessThan(at('plan.work'))
    expect(at('plan.work')).toBeLessThan(at('plan.goals'))
    expect(await page.locator('[data-target="uiSurface/plan.rough"]').count()).toBe(0)
  })

  it('9. draws goals and deadlines as a short list, and counts the rest', async () => {
    await open('plan')
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('[data-target="uiSurface/plan.goals"] .px-pl-trow')].map((el) => ({ text: el.textContent ?? '', href: el.getAttribute('href') ?? '' })),
    )
    expect(rows.length, 'the list does not hold exactly the one goal this week works toward').toBe(1)
    expect(rows[0]!.text).toContain('Trays move from bench to shelf by themselves')
    expect(rows[0]!.text).toContain('2 of 2 linked pieces of work on this week')
    expect(rows[0]!.href).toContain('/r/')
    const toward = await section('plan.goals')
    expect(toward).toContain('Goals and deadlines in')
    expect(toward).toMatch(/more goals and deadlines have nothing on this week|more goal or deadline has nothing on this week/)
    expect(toward).toContain(en['scheduleDesign.openGoals'])
  })

  it('10. starts a plan without the removed drafts routes', async () => {
    const draftRequests: string[] = []
    await page.route('**/api/planning/drafts**', route => {
      draftRequests.push(route.request().url())
      return route.fulfill({ status: 404, body: '{}' })
    })
    try {
      await open('plan')
      await page.getByRole('button', { name: en['g8.shelf.writeANewPlan'], exact: true }).click()
      await page.locator('.px-plan-start input').fill('Check the meadow path')
      await page.locator('.px-plan-start input').press('Enter')
      await page.waitForURL(/#\/plans\//)
      await waitForThePage(page, 30_000)
      expect(await page.locator('#op-plan-name').inputValue()).toBe('Check the meadow path')
      expect(draftRequests).toEqual([])
    } finally { await page.unroute('**/api/planning/drafts**') }
  })

  it('11. draws no box inside a box, and no section as a box', async () => {
    for (const width of [1440, 390]) {
      await open('plan', width)
      const found = await page.evaluate(() => {
        const main = document.querySelector('.px-pl-section')?.parentElement
        if (main === null || main === undefined) return ['no section was found']
        const boxed = (el: Element): boolean => {
          const s = getComputedStyle(el)
          return ['Top', 'Right', 'Bottom', 'Left'].every((side) => parseFloat(s.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 && s.getPropertyValue(`border-${side.toLowerCase()}-style`) !== 'none')
        }
        const out: string[] = []
        for (const one of main.querySelectorAll('.px-pl-section')) if (boxed(one)) out.push(`a section is a box: ${one.getAttribute('data-target') ?? ''}`)
        for (const el of main.querySelectorAll('.px-pl-section *')) {
          // What a person cannot see is not measured: a menu inside a closed fold is not on the screen.
          if (!boxed(el) || !(el as HTMLElement).checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue
          let up = el.parentElement
          while (up !== null && up !== main) {
            if (boxed(up)) {
              out.push(`${el.tagName.toLowerCase()}.${el.className} sits inside ${up.tagName.toLowerCase()}.${up.className}`)
              break
            }
            up = up.parentElement
          }
        }
        return out
      })
      expect(found, `at ${String(width)}`).toEqual([])
    }
  })
})

