// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WORDS ABOUT TIME, ON A WEEK THAT ALREADY HAS HOURS, BEFORE AND AFTER THE PRESS.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO DEFECTS THIS FILE IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * The owner used the schedule on 16 August 2026 and reported one screen twice.
 *
 *   1  It said "12h planned this week" at the top and, eleven lines below, "Nothing has been
 *      scheduled from it yet" about the work those hours were on. Both sentences were true — the
 *      WORDS were never scheduled while an allocation existed — and printed together they are two
 *      opposite statements about one item. The rule: make both facts readable at once, or
 *      stop printing one of them.
 *
 *   2  Readings that had stopped being true were still on screen. The instances the owner met are under a
 *      cell in the plan table, which is another file. What THIS surface could go stale in the same
 *      way is the confirmation after the press: it is a statement about one week, and the arrows
 *      move the page to another week without remounting anything. That is checked below and the
 *      week surface passes it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A REAL BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * The first one is about two sentences being on ONE SCREEN together, and the surfaces that draw
 * them are two different components mounted by a third file. Rendering either on its own proves
 * nothing about what a person meets. The second needs a real press against a real server followed
 * by a real navigation, and nothing about either exists in static markup.
 *
 * WHAT WAS LEARNED HERE AND WRITTEN BACK INTO THE PRODUCT. A fourth shape was added to the kept row
 * for this pass — "these words are hours on the plan now", for the moment between the press and the
 * list coming back. Driving it showed the moment does not exist: the press makes the panel ask for
 * the list again, `useAsync` goes to its loading state on every re-run, and the whole list is a
 * loading block until the reply lands. The branch was unreachable, so it was taken out rather than
 * shipped with a test that only passed in isolation.
 *
 * The servers come from `liveApp` in tests/helpers.ts, which is the one place the lifecycle of a
 * test server is written down: a throwaway database, two free ports, and the ports proved free
 * again at the end. Nothing here touches ./data/panelx.db.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { periodKey } from '../src/shared/planning.ts'
import { en } from '../src/shared/words/en.ts'
import { zh } from '../src/shared/words/zh.ts'

/** The week this test plans in: the one the schedule opens on, so no address has to be invented. */
const THIS_WEEK = periodKey('week', new Date())
/** The hours already on the week. This is the number the kept row used to contradict. */
const ALREADY = 12

// ------------------------------------------------------------------- the servers and the page

let app: LiveApp
let apiPort: number
let webPort: number
let page: Page

beforeAll(async () => {
  app = await liveApp({ name: 'kept', workspace: 'default', viewport: { width: 1440, height: 1000 } })
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

  // THE WEEK REALLY HAS HOURS. This is the "12h planned this week" the kept row used to deny.
  const hasHours = (await post('/api/records', {
    kind: 'task',
    title: 'Fit the reading view to the week',
    data: { state: 'doing' },
  })) as { record: { id: string } }
  await post('/api/planning/allocations', {
    horizon: 'week',
    period: THIS_WEEK,
    recordId: hasHours.record.id,
    plannedHours: ALREADY,
  })

  // AND A SECOND PIECE OF WORK WITH WORDS WAITING ABOUT IT. A separate record, because one piece of
  // work has one allocation in one period and committing onto the first would be refused — which
  // would test the refusal rather than the sentence.
  const waiting = (await post('/api/records', {
    kind: 'task',
    title: 'Write the handover note',
    data: { state: 'todo' },
  })) as { record: { id: string } }
  await post('/api/planning/intents', { said: '3h this week', recordId: waiting.record.id })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** The whole week as a person reads it, with the page being planned rather than read. */
async function openTheWeek(): Promise<string> {
  await page.goto(`http://127.0.0.1:${webPort}/#/plan/${THIS_WEEK}/edit`, {
    timeout: 60_000,
  })
  await waitForThePage(page, 60_000)
  // WAIT FOR THE PAGE'S OWN READINGS: the hours the week holds and the words waiting on it.
  await page.waitForFunction(
    (total) => {
      const text = document.body.innerText.replace(/\s+/g, ' ')
      return text.includes(total) && text.includes('3h this week')
    },
    `${String(ALREADY)}h planned this week`,
    { timeout: 30_000 },
  )
  return (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ')
}

// ============================================================================ 1

describe('a week with hours, and words nobody has scheduled, on one screen', () => {
  let read: string

  beforeAll(async () => {
    read = await openTheWeek()
  }, 120_000)

  it('really does hold the hours, so nothing below passes on an empty week', () => {
    expect(read).toContain(`${ALREADY}h planned this week`)
  })

  it('really does have words waiting on the same screen', () => {
    expect(read).toContain('3h this week')
    expect(read).toContain('Words you wrote about time')
  })

  it('prints no denial of that total beside it', () => {
    // The exact sentences the owner read under a week that had hours.
    expect(read).not.toContain('Nothing has been scheduled from it yet')
    expect(read).not.toContain('Nothing has been scheduled from these words')
  })

  it('says what is unscheduled about the words, once, naming the words as the subject', () => {
    expect(read).toContain('Nothing on the plan came from these words')
    // Once, not once per row: the row used to repeat it.
    expect(read.split('Nothing on the plan came from these words').length - 1).toBe(1)
  })

  it('says how both facts can be true, which is what stops the pair reading as a contradiction', () => {
    expect(read).toContain('The work they name may still have hours, given some other way.')
  })

  it('still shows the words as written and what Mole Office made of them', () => {
    expect(read).toContain('Mole Office read this as')
    expect(read).toContain('3 hours')
  })
})

// ============================================================================ 2

/**
 * A CONFIRMATION IS ABOUT ONE PERIOD, AND THE PAGE CAN BE MOVED TO ANOTHER.
 *
 * Pressing "Give it that time" leaves the server's own sentence standing above the list: *"3h this
 * week" is now 3 hours in …*. The week surface is not remounted when the arrows move the page to
 * another week — the reply changes and the component instance does not — so that sentence, which is
 * true of the week it was pressed on, went on being drawn on the next week's page. That is a stale
 * reading: a statement about one period printed under the heading of another.
 *
 * It is measured here rather than argued about, in both directions: the sentence has to be there
 * after the press, and gone after the arrow.
 */
describe('a confirmation about one week, after the page has moved to another', () => {
  let afterPress: string
  let afterArrow: string
  let answered: string[]

  beforeAll(async () => {
    await openTheWeek()
    answered = []
    page.on('response', (res) => {
      if (res.url().includes('/api/planning/intents')) {
        answered.push(`${res.status()} ${res.request().method()}`)
      }
    })
    await page.getByRole('button', { name: 'Give it that time' }).click()
    // THE CONFIRMATION IS THE PAGE'S OWN CHANGE, so wait for the sentence rather than a timer.
    await page.waitForFunction((said) => document.body.innerText.includes(said), en['schedule.intentScheduled'], {
      timeout: 30_000,
    })
    afterPress = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ')
    const next = page.getByRole('link', { name: 'next →' })
    const to = await next.getAttribute('href')
    if (to === null) throw new Error('the next-week link has no address')
    await next.click()
    // THE ADDRESS MOVES FIRST, and the page says when it has finished drawing the new one.
    await page.waitForFunction((wanted) => window.location.hash === wanted, to, { timeout: 30_000 })
    await waitForThePage(page, 30_000)
    afterArrow = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ')
  }, 120_000)

  it('really did schedule the words, so nothing below passes on a press that failed', () => {
    expect(answered.some((a) => a.startsWith('201 POST'))).toBe(true)
  })

  // CRITERION CHANGE, plan 7FEOshq3mBGG (G8b): the confirmation is the word list's sentence, in the
  // reader's language, and no longer the server's English note. What is proved is unchanged: the
  // sentence is there after the press, and gone after the arrow.
  it('says what the press did, on the week it was pressed on', () => {
    expect(afterPress).toContain(en['schedule.intentScheduled'])
  })

  it('really did move to another week, or the check below proves nothing', async () => {
    // The week's range is drawn in the page's header, so this is the page saying which week it is
    // on rather than this test assuming the arrow worked. CRITERION CHANGE, plan 7FEOshq3mBGG
    // (G8b): the raw key is Developer mode's, so the range is read, named by the page's own namer.
    const { periodSaid } = await import('../src/web/components/Planning.tsx')
    const range = periodSaid(THIS_WEEK, null).range
    expect(afterPress).toContain(range)
    expect(afterArrow).not.toContain(range)
  })

  it('does not print that confirmation on the next week’s page', () => {
    // A statement about one week, drawn under the heading of another, is a stale reading. This is
    // the check that says the week surface does not have that defect; the ones the owner met were
    // under a cell in the plan table, which is a different file.
    expect(afterArrow).not.toContain(en['schedule.intentScheduled'])
  })
})

// ============================================================================ 3

/** The schedule row names whether its stored period came from the words (problem bZ571Mf18WTT). */
describe('the period beside kept words says whether those words name it', () => {
  let week: string
  let nextWeek: string
  let recordIds: string[]

  const actorHeaders = {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': 'robin',
  }

  async function request(path: string, method = 'GET', body?: unknown): Promise<any> {
    const response = await fetch(app.api + path, {
      method,
      headers: actorHeaders,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const text = await response.text()
    if (!response.ok) throw new Error(method + ' ' + path + ' answered ' + response.status + ': ' + text)
    return JSON.parse(text)
  }

  async function rowText(said: string): Promise<string> {
    const rows = await app.page.locator('.px-pl-keptrow').all()
    for (const row of rows) {
      const words = (await row.locator('.px-pl-keptsaid').innerText()).replace(/[“”]/g, '').trim()
      if (words === said) return row.innerText()
    }
    throw new Error('No kept row showed the words: ' + said)
  }

  beforeAll(async () => {
    const today = await request('/api/planning/today')
    week = today.week as string
    nextWeek = periodKey('week', new Date(new Date(today.day + 'T12:00:00').getTime() + 7 * 24 * 60 * 60 * 1000))

    const task = async (title: string): Promise<string> => {
      const result = await request('/api/records', 'POST', { kind: 'task', title, data: { state: 'todo' } })
      return result.record.id as string
    }
    recordIds = [
      await task('Check the greenhouse fan'),
      await task('Pack the seed trays'),
      await task('Review the garden map'),
      await task('Label a spare toolbox'),
    ]
    await request('/api/planning/intents', 'POST', { said: '3h this week', recordId: recordIds[0] })
    await request('/api/planning/intents', 'POST', { said: 'next week', period: week, recordId: recordIds[1] })
    await request('/api/planning/intents', 'POST', { said: 'around 1.5 maybe more', period: week, recordId: recordIds[2] })
    await request('/api/planning/intents', 'POST', { said: 'sometime next week', recordId: recordIds[3] })

    await app.page.goto(app.site + '/#/plan/' + week + '/edit', { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await app.page.locator('.px-pl-keptrow').nth(3).waitFor({ state: 'visible', timeout: 30_000 })
  }, 240_000)

  it('uses the page language and tells the truth for matching, different, absent, and unassigned periods', async () => {
    const same = await rowText('3h this week')
    const different = await rowText('next week')
    const absent = await rowText('around 1.5 maybe more')
    const unassigned = await rowText('sometime next week')

    expect(same).toContain('Mole Office read this as')
    expect(different).toContain(en['planKept.periodGiven'].split('{period}')[0]!)
    expect(different).toContain(en['planKept.wordsNamePeriod'].split('{period}')[0]!)
    expect(different).toContain('Your words do not name this period.')
    expect(different).not.toContain('Mole Office read this as')
    expect(different).not.toContain(nextWeek)
    expect(absent).toContain(en['planKept.periodGiven'].split('{period}')[0]!)
    expect(absent).toContain(en['planKept.wordsNameNoPeriod'])
    expect(absent).toContain('Your words do not name this period.')
    expect(absent).not.toContain('Mole Office read this as')
    expect(unassigned).toContain(en['schedule.noPeriodRead'])

    const english = (await app.page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ')
    for (const id of recordIds) expect(english).not.toContain(id)
    expect(english).not.toMatch(/2026-W\d{2}|\/api\/|planKept\./)

    await app.page.goto(app.site + '/?lang=zh#/plan/' + week + '/edit')
    await waitForThePage(app.page, 30_000)
    const chinese = (await app.page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ')
    expect(chinese).toContain(zh['planKept.periodGiven'].split('{period}')[0]!)
    expect(chinese).toContain(zh['planKept.wordsNamePeriod'].split('{period}')[0]!)
    expect(chinese).toContain(zh['planKept.wordsNameNoPeriod'])
    expect(chinese).not.toContain('This is for ')

    await app.page.goto(app.site + '/?lang=xx#/plan/' + week + '/edit')
    await waitForThePage(app.page, 30_000)
    const testLanguage = (await app.page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ')
    expect(testLanguage).toContain('⟦This is for ')
    expect(testLanguage).toContain('⟦Your words name no period.')
    expect(testLanguage).not.toContain('planKept.')
    const shots = process.env.W13Q_R16_KEPT_SHOTS
    if (shots !== undefined) {
      mkdirSync(shots, { recursive: true })
      const sizes = [
        { width: 1440, height: 1000 },
        { width: 990, height: 1000 },
        { width: 660, height: 900 },
        { width: 390, height: 844 },
      ]
      for (const size of sizes) {
        for (const theme of ['light', 'dark']) {
          const languages = size.width === 1440 ? ['en', 'zh'] : ['en']
          for (const language of languages) {
            const context = await app.browser.newContext({ viewport: size, colorScheme: theme as 'light' | 'dark' })
            await context.addInitScript((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
            const shotPage = await context.newPage()
            try {
              await shotPage.goto(app.site + '/?lang=' + language + '#/plan/' + week + '/edit')
              await waitForThePage(shotPage, 30_000)
              await shotPage.locator('.px-pl-keptrow').nth(3).waitFor({ state: 'visible', timeout: 30_000 })
              await shotPage.addStyleTag({ content: '#shell-side{display:none!important}' })
              await shotPage.screenshot({ path: join(shots, 'kept-' + size.width + '-' + theme + '-' + language + '.png'), fullPage: true })
            } finally {
              await context.close()
            }
          }
        }
      }
      const testContext = await app.browser.newContext({ viewport: sizes[0], colorScheme: 'light' })
      await testContext.addInitScript((look) => localStorage.setItem('mole-office.preset.theme', look), 'light')
      const testPage = await testContext.newPage()
      try {
        await testPage.goto(app.site + '/?lang=xx#/plan/' + week + '/edit')
        await waitForThePage(testPage, 30_000)
        await testPage.locator('.px-pl-keptrow').nth(3).waitFor({ state: 'visible', timeout: 30_000 })
        await testPage.addStyleTag({ content: '#shell-side{display:none!important}' })
        await testPage.screenshot({ path: join(shots, 'kept-1440-light-xx.png'), fullPage: true })
      } finally {
        await testContext.close()
      }
    }
  }, 240_000)
})
