// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MESSAGES PAGE: WAITING FOR YOUR ANSWER FIRST, THEN THE MESSAGES BY DAY.
 *
 * The owner took wave 13k's proposal for this page as recommended (report n9Mjk3c_sJRu block b-17), with "Waiting for
 * your answer" first, then lists by day, and message counts in developer mode only (answer 7).
 * This file holds the page to it on a real page from a real office. All content is made up for the test.
 *
 * WHAT EACH CASE MEASURES:
 *   1. a question to the person (asksThePerson true) is under "Waiting for your answer", in the ask
 *      colour; a plain message is not;
 *   2. the messages go by day: Today, Yesterday, then the date, each message under its own day;
 *   3. no message is drawn as a box, and no box holds the lists;
 *   4. the unread count and the count in the mark-all press are drawn only in developer mode;
 *   5. a press anywhere on a row's words opens its conversation;
 *   6. once the person sends an answer, the question leaves the list and the quiet line says so;
 *   7. nothing is wider than the window at 1440 and 390, in the light look. With
 *      MESSAGES_PAGE_SHOTS naming a folder, the page is photographed there at each, and at 1440 in
 *      Chinese.
 *
 * MUTATIONS, each red here after a control run (see the commit that adds this file):
 *   - MessagesPage.tsx reads ?only=waiting-for-me for the first section: case 1 red.
 *   - byDay keys a day by its year: case 2 red.
 *   - .px-ms-one gets a border all round: case 3 red.
 *   - the unread count is drawn in normal mode too: case 4 red.
 *   - .px-ms-open no longer lies over the row: case 5 red.
 */

import Database from 'better-sqlite3'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { dayInThePageLanguage, t } from '../src/shared/i18n.ts'
import { localStamp } from '../src/shared/time.ts'
import { MESSAGES_PAGE } from '../src/shared/messages.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({ ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

const QUESTION = 'Made-up question: shall I print the clamp in PLA at setting 15?'
const PLAIN = 'Made-up note: the bore gauge reads a tenth high on the left jaw.'
const YESTERDAY_WORDS = 'Made-up note from yesterday: the sweep ran overnight.'
const OLD_WORDS = 'Made-up note from March: the first camera fit.'
const OLD_DAY = '2026-03-04'

async function say(from: Record<string, string>, data: Record<string, unknown>): Promise<string> {
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: from,
    body: JSON.stringify({ kind: 'message', title: String(data['body']).slice(0, 40), data }),
  })
  expect(said.status, await said.clone().text()).toBe(theAnswerToAWriteInATestOffice(from, { kind: 'message', data }))
  return ((await said.json()) as { record: { id: string } }).record.id
}

/**
 * Go to the home page, wait until it is drawn, then go to the Messages page. The frame holds a move to
 * another page until it has read whether a review is collecting, so a move straight back would find the
 * Messages page never left, with the messages it read last time.
 */
async function open(query = ''): Promise<void> {
  await app.page.goto(`${app.site}/${query}#/`)
  await waitForThePage(app.page)
  await app.page.goto(`${app.site}/${query}#/messages`)
  await waitForThePage(app.page, 60_000)
  await app.page.waitForSelector('.px-ms-day .px-ms-one', { timeout: 30_000 })
  await app.page.waitForSelector('.px-ms-waiting .px-ms-list, .px-ms-waiting .px-ms-quiet', { timeout: 30_000 })
}

const TO_THE_PERSON = [{ kind: 'person', id: THE_PERSON }]

beforeAll(async () => {
  app = await liveApp({ name: 'messages-page-design', viewport: { width: 1440, height: 1000 } })
  for (const [handle, title] of [
    ['builder-x', 'Builder X'],
    ['checker-y', 'Checker Y'],
  ] as const) {
    const filed = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ kind: 'agent', title, data: { handle, runtime: 'claude-code', state: 'active' } }),
    })
    expect(filed.status, await filed.text()).toBe(201)
  }
  const old = await say(asAgent('builder-x'), { body: OLD_WORDS, to: TO_THE_PERSON })
  const yesterday = await say(asAgent('checker-y'), { body: YESTERDAY_WORDS, to: TO_THE_PERSON })
  await say(asAgent('checker-y'), { body: PLAIN, to: TO_THE_PERSON })
  await say(asAgent('builder-x'), { body: QUESTION, to: TO_THE_PERSON, asksThePerson: true })
  // TWO OTHER DAYS, written into the database the server reads: a message's time is when its record
  // was created, and no request may set that.
  const now = new Date()
  const theDayBefore = localStamp(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12)).slice(0, 10)
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    db.prepare('UPDATE records SET created_at = ?, updated_at = ? WHERE id = ?').run(`${OLD_DAY} 10:15:00`, `${OLD_DAY} 10:15:00`, old)
    db.prepare('UPDATE records SET created_at = ?, updated_at = ? WHERE id = ?').run(`${theDayBefore} 11:30:00`, `${theDayBefore} 11:30:00`, yesterday)
  } finally {
    db.close()
  }
}, 240_000)

afterAll(async () => {
  await app.stop()
})

it('puts the question under Waiting for your answer, in the ask colour, and not the plain message', async () => {
  await open()
  const section = app.page.locator('section.px-ms-waiting')
  expect(await section.locator('h2').textContent()).toBe(MESSAGES_PAGE.waitingTitle)
  const rows = await section.locator('.px-ms-one').allInnerTexts()
  expect(rows.some((one) => one.includes(QUESTION)), 'the question is not waiting for an answer').toBe(true)
  expect(rows.some((one) => one.includes(PLAIN)), 'a plain message is listed as waiting for an answer').toBe(false)
  // THE ASK COLOUR is the look's own --ask, read off a probe so the look decides the value.
  const colours = await app.page.evaluate(() => {
    const head = document.querySelector('section.px-ms-waiting h2')
    const probe = document.createElement('span')
    probe.style.color = 'var(--ask)'
    document.body.appendChild(probe)
    const ask = getComputedStyle(probe).color
    probe.remove()
    return { head: head === null ? '' : getComputedStyle(head).color, ask }
  })
  expect(colours.head, 'the heading is not in the ask colour').toBe(colours.ask)
  // AND IT COMES FIRST: before the messages by day.
  const first = await app.page.evaluate(() => {
    const waiting = document.querySelector('section.px-ms-waiting')
    const said = document.querySelector('section.px-ms-said')
    return waiting !== null && said !== null && (waiting.compareDocumentPosition(said) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
  })
  expect(first, 'Waiting for your answer is not first').toBe(true)
}, 180_000)

it('lists the messages by day: Today, Yesterday, then the date', async () => {
  await open()
  const days = await app.page.locator('section.px-ms-said .px-ms-day').evaluateAll((all) =>
    all.map((day) => ({
      head: day.querySelector('h2')?.textContent ?? '',
      rows: Array.from(day.querySelectorAll('.px-ms-one')).map((one) => one.textContent ?? ''),
    })),
  )
  expect(days.map((day) => day.head)).toEqual([MESSAGES_PAGE.today, MESSAGES_PAGE.yesterday, dayInThePageLanguage(new Date(2026, 2, 4), true)])
  expect(days[0]?.rows.some((one) => one.includes(QUESTION))).toBe(true)
  expect(days[0]?.rows.some((one) => one.includes(PLAIN))).toBe(true)
  expect(days[1]?.rows.some((one) => one.includes(YESTERDAY_WORDS))).toBe(true)
  expect(days[2]?.rows.some((one) => one.includes(OLD_WORDS))).toBe(true)
  // THE TIME IS TO THE MINUTE, at the row's right.
  const time = await app.page.locator('section.px-ms-said .px-ms-day').nth(2).locator('.px-ms-when').first().innerText()
  expect(time).toBe('10:15')
}, 180_000)

it('draws no message as a box, and no box around the lists', async () => {
  await open()
  const boxed = await app.page.evaluate(() => {
    const allFour = (el: Element): boolean => {
      const style = getComputedStyle(el)
      return ['Top', 'Right', 'Bottom', 'Left'].every((side) => parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 && style.getPropertyValue(`border-${side.toLowerCase()}-style`) !== 'none')
    }
    const found: string[] = []
    for (const row of Array.from(document.querySelectorAll('.px-ms-one'))) {
      const style = getComputedStyle(row)
      if (parseFloat(style.borderLeftWidth) > 0 || parseFloat(style.borderRightWidth) > 0) found.push(`row: ${row.textContent?.slice(0, 30) ?? ''}`)
      for (let up = row.parentElement; up !== null && up.tagName !== 'MAIN'; up = up.parentElement) {
        if (allFour(up)) found.push(`around: ${up.className}`)
      }
    }
    return found
  })
  expect(boxed, 'a message or the list around it is drawn as a box').toEqual([])
}, 180_000)

it('says the unread count only in developer mode, and the press works in both', async () => {
  await open()
  expect(await app.page.locator('.px-ms-unread-count').count(), 'normal mode says how many are unread').toBe(0)
  const plain = (await app.page.locator('.px-ms-mark-all .px-btn').innerText()).trim()
  expect(plain).toBe(t('messages.unread.markAllPlain'))
  expect(/\d/.test(plain), 'the press counts messages in normal mode').toBe(false)

  await open('?mode=inspect')
  expect(await app.page.locator('.px-ms-unread-count').innerText()).toBe(t('messages.unread.inAll', { n: 4 }))
  expect((await app.page.locator('.px-ms-mark-all .px-btn').innerText()).trim()).toBe(t('messages.unread.markAll', { n: 4, count: '4' }))
}, 180_000)

it('is no wider than the window at 1440 and 390 in light', async () => {
  const shots = process.env['MESSAGES_PAGE_SHOTS']
  for (const theme of ['light'] as const) {
    for (const width of [1440, 390]) {
      await app.page.setViewportSize({ width, height: 1000 })
      await app.page.emulateMedia({ colorScheme: theme })
      await open()
      const over = await app.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(over, `${theme} at ${String(width)}`).toBeLessThanOrEqual(0)
      if (shots !== undefined) await app.page.screenshot({ path: join(shots, `messages-${String(width)}-${theme}.png`), fullPage: true })
    }
  }
  if (shots !== undefined) {
    await app.page.setViewportSize({ width: 1440, height: 1000 })
    await app.page.emulateMedia({ colorScheme: 'light' })
    await open('?lang=zh')
    await app.page.screenshot({ path: join(shots, 'messages-1440-light-zh.png'), fullPage: true })
    await open('?mode=inspect')
    await app.page.screenshot({ path: join(shots, 'messages-1440-light-developer.png'), fullPage: true })
  }
  await app.page.setViewportSize({ width: 1440, height: 1000 })
}, 600_000)

it('opens a message in its conversation from a press anywhere on the row', async () => {
  await open()
  const words = app.page.locator('section.px-ms-said .px-ms-one', { hasText: PLAIN }).locator('.px-ms-words')
  const box = await words.boundingBox()
  expect(box, 'the row has no words to press').not.toBeNull()
  if (box === null) return
  await app.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await app.page.waitForFunction(
    (said: string) => document.querySelector('.px-chat')?.textContent?.includes(said) === true,
    PLAIN,
    { timeout: 30_000 },
  )
}, 180_000)

it('lets the question go once the person writes back, and then says nothing is waiting', async () => {
  await say(AS_THE_OWNER, { body: 'Made-up answer: yes, PLA.', to: [{ kind: 'agent', id: 'builder-x' }] })
  await open()
  expect(await app.page.locator('section.px-ms-waiting .px-ms-quiet').innerText()).toBe(MESSAGES_PAGE.nothingWaiting)
  expect(await app.page.locator('section.px-ms-waiting .px-ms-one').count()).toBe(0)
}, 180_000)
