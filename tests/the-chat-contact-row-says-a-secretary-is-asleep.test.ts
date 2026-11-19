// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT'S CONTACT ROW SAYS A SECRETARY IS ASLEEP WHEN THE OFFICE BEGINS THE SLEEP.
 *
 * The open problem's own words: a secretary's sleep had been begun by the office's sleep clock at 03:57. The profile's
 * Sleep place and the open conversation's header both said it was asleep until 05:27, and the contact row, drawn after
 * a reload and a press on the back arrow, still said "Sleeps at 03:57" at four widths in both looks — the line it had
 * at 03:54, before the sleep began. The office begins and ends a secretary's sleep every day without any press, so a
 * row out of date at every sleep time reads a secretary as awake while it sleeps, or as asleep after it woke.
 *
 * This file is a case in a test office of its own (`liveApp`) and a real browser. Every name, handle and value in it is
 * made up; none of it is a real person's or a real office's.
 *
 * WHAT IS PROVED, for a secretary that is a permanent resident and has set a sleep time:
 *   shown while open  1. The chat is open on the contact list, and its row for the secretary says the sleep time. The
 *                       office begins the sleep by its clock, at a moment inside the sleep time. With no reload, the
 *                       row's `.px-chat-sleep` comes to say it is asleep within the time the server promises for a
 *                       presence change: one look of its presence clock (THE LOOK, below).
 *   after a reload    2. The chat is open on the secretary's conversation, and this browser remembers that. No page of
 *                       this browser watches while the clock begins the sleep, so the answer kept for it still says
 *                       the sleep time. The page is loaded again into the conversation and the back arrow is pressed:
 *                       the row must say it is asleep, from a reading of its own and not only the kept one.
 *   once it has ended 3. The person wakes it. The row stops saying asleep within one look of the same clock.
 *
 * THE CLOCK. The test office's API server is a child process of its own, so a minute of `aMinuteOfTheSleepClock` cannot
 * be run in it from here, and the test never runs one. The office's own sleep clock is given one run a second through
 * `liveApp`'s `runTheSleepClockEveryMs` (the setting MOLE_OFFICE_RUN_THE_SLEEP_CLOCK_EVERY_MS), so the wait left is the
 * wait for the sleep time's minute to open. The test first sets a sleep time thirty minutes ahead, so each contact row
 * has a sleep time to say when its page opens. It opens the two pages below and parks one of them. It then sets the
 * sleep time to the first whole minute at least ten seconds ahead, checks that the door answered before that minute
 * opened, and waits for the office's own clock to begin the sleep. That wait is at most the chosen minute, under seventy
 * seconds away, and then two runs of the short clock (2,000 ms); it is never 200,000 ms. The presence read after the
 * parking shows that the sleep had not begun, so the parked page's kept answer is from before it.
 *
 * MIDNIGHT. A whole minute ahead may be 00:00 of the next day. The test works the minute out as an absolute instant,
 * `Math.ceil((Date.now() + margin) / 60_000) * 60_000`, and asks `new Date` for its local `HH:MM`. A minute that falls
 * on 00:00 is written as the next day's first minute, and no arithmetic is done on the time string. The thirty-minute
 * first time is worked out the same way, so it crosses midnight as an instant too.
 *
 * THE LOOK IS WHAT CHANGES THE ROW. The server's presence clock looks again at everybody's presence while a page is
 * open, and tells the page what changed; nothing else tells an open page that a sleep began or ended. The live office
 * looks once a minute. This office is given a look every `THE_LOOK_THIS_OFFICE_IS_GIVEN_MS` through `liveApp`'s
 * `lookAtPresenceAgainEveryMs` (the setting MOLE_OFFICE_LOOK_AT_PRESENCE_AGAIN_EVERY_MS), so a case waits for one short
 * look and not up to a minute. Each case still waits for the look itself, and runs nothing in its place.
 *
 * MUTATIONS, each after a green control run and restored (the round's out/ folder holds the logs):
 *   shown while open   events.ts `whatAPageDraws` leaves `residentSleep` out of what it compares → 1 goes red;
 *   after a reload     Chat.tsx `readingOf` asks only for a dot it holds no reading for, as before → 2 goes red;
 *   once it has ended  events.ts `whatAPageDraws` leaves `residentSleep` out of what it compares → 3 goes red;
 *   the short look     events.ts `startTheClock` ignores the setting and keeps the minute → 1 and 3 go red;
 *   the short clock    src/server/index.ts `startTheSleepClock` ignores the setting and keeps the minute → the sleep is
 *                      not begun within two runs of the short clock after its minute opens, so the file goes red.
 *
 * THE WORDS ARE READ FROM THE CODE THAT SAYS THEM: `createI18n('en').t` for every word a case compares, and the sleep
 * time from the office's own answer to the door that set it. No sentence is typed into this file.
 */

import { join } from 'node:path'
import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { openTheChat } from './open-the-chat.ts'

const t = createI18n('en').t

/**
 * HOW OFTEN THIS TEST'S OFFICE LOOKS AGAIN AT EVERYBODY'S PRESENCE, which is how long the server promises a presence
 * change takes. The office is given this value (`lookAtPresenceAgainEveryMs` below), and every limit here is read from
 * the same one, so no copy of the number is typed twice.
 */
const THE_LOOK_THIS_OFFICE_IS_GIVEN_MS = 2_000

/** The most one case may take: the look it waits for, plus a minute for the page and the office's clock around it. */
const A_CASE_MAY_TAKE_MS = THE_LOOK_THIS_OFFICE_IS_GIVEN_MS + 60_000

/**
 * HOW OFTEN THIS TEST'S OFFICE RUNS ITS SLEEP CLOCK, in milliseconds. The office is given this value
 * (`runTheSleepClockEveryMs` below), and the wait for a sleep to begin is read from it, so no copy of the number is
 * typed twice.
 */
const THE_SLEEP_CLOCK_THIS_OFFICE_IS_GIVEN_MS = 1_000

/** The least time between the set and the minute it names, so the set is written before that minute opens. */
const THE_SET_IS_WRITTEN_WITHIN_MS = 10_000

/** How far ahead the first sleep time is set, so its minute is never the minute chosen after the pages open. */
const THE_FIRST_SLEEP_TIME_IS_MS_AHEAD = 30 * 60_000

const SLEEPER = { handle: 'made-up-sleep-secretary', name: 'Made-up Secretary', minutes: 15 } as const
const PROPOSER = { handle: 'made-up-proposer', name: 'Made-up Proposer' } as const

let app: LiveApp
let person: Record<string, string>
let sleeperId = ''
/** The words the row must say once the office has begun the sleep, read from the office's own answer. */
let asleepWords = ''
/** The words the row says before the sleep begins: the sleep time it was set to. */
let sleepTimeWords = ''
/** The parked browser whose kept answer is the contact list read before the sleep began. */
let parked: BrowserContext | null = null

interface Reply {
  status: number
  text: string
  json: Record<string, any>
}

async function call(method: 'GET' | 'POST' | 'PUT', path: string, headers: Record<string, string>, body?: unknown): Promise<Reply> {
  const res = await fetch(`${app.api}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await res.text()
  let json: Record<string, any> = {}
  try {
    json = JSON.parse(text) as Record<string, any>
  } catch {
    json = {}
  }
  return { status: res.status, text, json }
}

const asPerson = (): Record<string, string> => ({ 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, ...person })
const asAgent = (handle: string, key: string): Record<string, string> => ({
  ...asPerson(),
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': key,
})

async function started(handle: string, name: string, role: string): Promise<{ id: string; key: string }> {
  const reply = await call('POST', '/api/agents/started', asPerson(), { handle, name, role, runtime: 'claude-code' })
  expect(reply.status, reply.text).toBe(201)
  return { id: String(reply.json['agent'].id), key: String(reply.json['whatToGiveIt']?.key) }
}

/** One contact row, by the registry id it is drawn for. */
const theContactRow = (page: Page, id: string): ReturnType<Page['locator']> => page.locator(`.px-chat-contact[data-contact="agent:${id}"]`).first()

/** That row's sleep line. */
const theSleepLine = (page: Page, id: string): ReturnType<Page['locator']> => theContactRow(page, id).locator('.px-chat-sleep')

/** The words the line draws, trimmed; empty when it is not drawn. */
async function theWordsOf(line: ReturnType<Page['locator']>): Promise<string> {
  return ((await line.textContent()) ?? '').trim()
}

/** Open the chat in its own window on the contact list, from the address this browser writes as. */
async function openTheContactList(page: Page): Promise<void> {
  await page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000, waitUntil: 'domcontentloaded' })
  await waitForThePage(page, 60_000)
  await openTheChat(page)
  await page.locator('.px-chat-tab[data-tab="contacts"]').click()
}

/** The secretary's presence as the office reads it now: whether its sleep has begun, and when it wakes. */
async function theSleepAsRead(): Promise<{ status: number; presence: Record<string, any>; wakesAt: string | null }> {
  const read = await call('GET', `/api/presence/agent/${sleeperId}`, asPerson())
  const presence = (read.json['presence'] ?? {}) as Record<string, any>
  const sleep = (presence['residentSleep'] ?? {}) as Record<string, any>
  const begun = read.status === 200 && sleep['asleepSince'] != null && typeof sleep['wakesAt'] === 'string'
  return { status: read.status, presence, wakesAt: begun ? String(sleep['wakesAt']) : null }
}

/**
 * Wait for the office's own clock to begin the sleep, and answer when it wakes. Nothing here runs a minute of it. The
 * wait starts at the minute the test chose and lasts two runs of the short clock, so it is bounded by that minute and
 * that clock, never by the old 200,000 ms.
 */
async function waitForTheSleepToBegin(beginsAt: number): Promise<{ wakesAt: string }> {
  const waitAfterTheMinuteMs = 2 * THE_SLEEP_CLOCK_THIS_OFFICE_IS_GIVEN_MS
  const deadline = beginsAt + waitAfterTheMinuteMs
  let last: Record<string, any> = {}
  while (Date.now() < deadline) {
    const read = await theSleepAsRead()
    last = read.presence
    if (read.wakesAt !== null) return { wakesAt: read.wakesAt }
    await new Promise((go) => setTimeout(go, 250))
  }
  throw new Error(
    `The office's sleep clock did not begin the made-up secretary's sleep within ${String(waitAfterTheMinuteMs)} ms ` +
      `of the minute ${new Date(beginsAt).toISOString()} opening, though the office was given a run every ` +
      `${String(THE_SLEEP_CLOCK_THIS_OFFICE_IS_GIVEN_MS)} ms. The last presence reading was ${JSON.stringify(last)}.`,
  )
}

beforeAll(async () => {
  app = await liveApp({
    name: 'chat-contact-row-sleep',
    viewport: { width: 1440, height: 900 },
    lookAtPresenceAgainEveryMs: THE_LOOK_THIS_OFFICE_IS_GIVEN_MS,
    runTheSleepClockEveryMs: THE_SLEEP_CLOCK_THIS_OFFICE_IS_GIVEN_MS,
  })
  person = thePersonsKeyHeader(join(app.dir, 'keys.json'))
  const proposer = await started(PROPOSER.handle, PROPOSER.name, 'secretary')
  const sleeper = await started(SLEEPER.handle, SLEEPER.name, 'secretary')
  sleeperId = sleeper.id
  const proposed = await call('POST', '/api/residents/proposals', asAgent(PROPOSER.handle, proposer.key), {
    agentId: sleeperId,
    because: 'Made-up reason: it has kept this office’s schedule for weeks.',
  })
  expect(proposed.status, proposed.text).toBe(201)
  const confirmed = await call('POST', `/api/residents/proposals/${String(proposed.json['proposal'].id)}/confirm`, asPerson())
  expect(confirmed.status, confirmed.text).toBe(200)

  // THE FIRST SLEEP TIME, thirty minutes ahead, so each contact row has a sleep time to say when its page opens. Its
  // minute is never the minute chosen below.
  const farBegins = Math.ceil((Date.now() + THE_FIRST_SLEEP_TIME_IS_MS_AHEAD) / 60_000) * 60_000
  const far = new Date(farBegins)
  const farStartsAt = `${String(far.getHours()).padStart(2, '0')}:${String(far.getMinutes()).padStart(2, '0')}`
  const firstSet = await call('PUT', `/api/residents/${sleeperId}/sleep-time`, asPerson(), { startsAt: farStartsAt, minutes: SLEEPER.minutes })
  expect(firstSet.status, firstSet.text).toBe(200)
  expect(firstSet.json['sleep'].sleepTime.startsAt).toBe(farStartsAt)
  sleepTimeWords = t('resident.sleep.line.sleepsAt', { at: farStartsAt })

  // THE PAGE THAT STAYS OPEN, on the contact list, while the office begins the sleep.
  await openTheContactList(app.page)
  const line = theSleepLine(app.page, sleeperId)
  await line.waitFor({ state: 'visible', timeout: 30_000 })
  expect(await theWordsOf(line), 'the contact row did not first say the sleep time the office had just set').toBe(sleepTimeWords)

  // THE PAGE THAT IS PARKED IN THE CONVERSATION, so its kept answer is the list read before the sleep began.
  parked = await app.browser.newContext({ viewport: { width: 1440, height: 900 } })
  const parkedPage = await parked.newPage()
  await openTheContactList(parkedPage)
  const parkedLine = theSleepLine(parkedPage, sleeperId)
  await parkedLine.waitFor({ state: 'visible', timeout: 30_000 })
  expect(await theWordsOf(parkedLine), 'the parked page did not first say the sleep time').toBe(sleepTimeWords)
  await theContactRow(parkedPage, sleeperId).click()
  await parkedPage.locator('.px-chat-back').first().waitFor({ state: 'visible', timeout: 30_000 })
  // THE PAGE CACHE WRITES WHAT THE DRAWING HOLDS 400 MS AFTER ITS LAST CHANGE; the kept answer must be on disk.
  await parkedPage.waitForTimeout(900)
  await parkedPage.goto('about:blank')
  await parkedPage.close()
  // THE SLEEP HAD NOT BEGUN WHEN THE PARKED PAGE WAS CLOSED, so its kept answer is the one from before the sleep.
  const beforeTheSleep = await theSleepAsRead()
  expect(beforeTheSleep.status, JSON.stringify(beforeTheSleep.presence)).toBe(200)
  expect(beforeTheSleep.wakesAt, `the office began the sleep before the parked page was closed: ${JSON.stringify(beforeTheSleep.presence)}`).toBeNull()

  // AND THE SLEEP TIME IS SET AGAIN, now that both pages are open and one of them is parked, to the first whole minute at
  // least ten seconds ahead. The set must be answered before that minute opens, so the office's clock may begin it.
  const now = Date.now()
  const begins = Math.ceil((now + THE_SET_IS_WRITTEN_WITHIN_MS) / 60_000) * 60_000
  const at = new Date(begins)
  const nearStartsAt = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
  const set = await call('PUT', `/api/residents/${sleeperId}/sleep-time`, asPerson(), { startsAt: nearStartsAt, minutes: SLEEPER.minutes })
  expect(set.status, set.text).toBe(200)
  expect(set.json['sleep'].sleepTime.startsAt).toBe(nearStartsAt)
  expect(Date.now(), `the sleep time was answered after the minute ${nearStartsAt} had opened`).toBeLessThan(begins)

  // AND THE OFFICE BEGINS THE SLEEP, by its own clock, while only the first page watches.
  const began = await waitForTheSleepToBegin(begins)
  asleepWords = t('resident.sleep.line.asleepUntil', { until: began.wakesAt.slice(11, 16) })
}, 600_000)

afterAll(async () => {
  await parked?.close()
  await app?.stop()
}, 120_000)

describe('the chat’s contact row for a sleeping secretary', () => {
  it('1: says it is asleep without a reload, within the one look the server promises for a presence change', async () => {
    const line = theSleepLine(app.page, sleeperId)
    await expect
      .poll(() => theWordsOf(line), {
        timeout: THE_LOOK_THIS_OFFICE_IS_GIVEN_MS + 20_000,
        message:
          'the contact row did not come to say the secretary is asleep within the look this office was given ' +
          `(${String(THE_LOOK_THIS_OFFICE_IS_GIVEN_MS)} ms) and the server promises for a presence change`,
      })
      .toBe(asleepWords)
    expect(await line.getAttribute('data-sleep')).toBe('asleep')
  }, A_CASE_MAY_TAKE_MS)

  it('2: after a reload back into the conversation, the back arrow draws the row asleep', async () => {
    expect(parked, 'the parked browser was not made').not.toBeNull()
    const page = await parked!.newPage()
    try {
      await page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000, waitUntil: 'domcontentloaded' })
      await waitForThePage(page, 60_000)
      await openTheChat(page)
      // IT COMES BACK INTO THE CONVERSATION, from the contact this browser remembered.
      await page.locator('.px-chat-back').first().waitFor({ state: 'visible', timeout: 30_000 })
      await page.locator('.px-chat-back').first().click()
      const row = theContactRow(page, sleeperId)
      await row.waitFor({ state: 'visible', timeout: 30_000 })
      const line = row.locator('.px-chat-sleep')
      await expect
        .poll(() => theWordsOf(line), {
          timeout: 30_000,
          message: 'the contact row drawn by the back arrow did not read its dot again, so it kept the line from before the sleep',
        })
        .toBe(asleepWords)
      expect(await line.getAttribute('data-sleep')).toBe('asleep')
    } finally {
      await page.close()
    }
  }, 120_000)

  it('3: once the person wakes it, the row stops saying asleep', async () => {
    const line = theSleepLine(app.page, sleeperId)
    await expect.poll(() => theWordsOf(line), { timeout: 30_000, message: 'the row was not asleep before the wake was pressed' }).toBe(asleepWords)
    const woke = await call('POST', `/api/residents/${sleeperId}/wake`, asPerson())
    expect(woke.status, woke.text).toBe(200)
    await expect
      .poll(() => theWordsOf(line), {
        timeout: THE_LOOK_THIS_OFFICE_IS_GIVEN_MS + 20_000,
        message:
          'the contact row still said the secretary was asleep after the person woke it, past the look this office ' +
          `was given (${String(THE_LOOK_THIS_OFFICE_IS_GIVEN_MS)} ms)`,
      })
      .not.toBe(asleepWords)
    expect(await line.getAttribute('data-sleep')).not.toBe('asleep')
  }, A_CASE_MAY_TAKE_MS)
})
