// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EVERYTHING AND MESSAGES PAGES DRAW ONE PAGE OF ROWS AT A TIME.
 *
 * Measured on a copy of the office's data on 27 September 2026: the Everything page drew 16,557 rows
 * and was 1.2 million pixels tall; the Messages page drew 8,857 messages and was 2.5 million pixels
 * tall; each took seven to fifteen seconds to open. Now each draws fifty rows, a line saying which
 * rows are shown out of how many, and a press to the next and the previous page. A search runs over
 * every row, so it finds a row that was on another page. And the Messages page does not reach past
 * the right edge of a 390 px phone when a delivery's reason carries a long address: the reason is the
 * hover text of the delivery word (wave 13j round 12), and the row's words may break anywhere.
 *
 * Everything here is read off a real page, drawn by the built app from a real server.
 *
 * MUTATIONS, each red here:
 *   1. RecordsPage.tsx: send `offset: 0` whatever page is asked for. The rows after Next are the
 *      same fifty and the line still says 1 to 50.
 *   2. RecordsPage.tsx: stop sending `q` to the records door. The search for the record on page two
 *      draws page one unchanged.
 *   3. MessagesPage.tsx: set MESSAGES_PAGE_SIZE to 1000, so one page is the whole list. The page
 *      draws every message and the row count is red.
 *   4. MessagesPage.tsx: leave the delivery's reason off the delivery word's hover text. The phone
 *      case finds no long reason on the first page and is red.
 *   5. MessagesPage.tsx: pass `offset: 0` to `hidingLine`. After Next the sentence under the filters
 *      still says this page shows 1 to 50.
 *   6. src/server/api/messages.ts: count the unread messages on the page instead of every matching
 *      one. The line says nothing is unread while a message to the person waits on the last page.
 *      The unread count is drawn in developer mode only (answer 7 to report
 *      n9Mjk3c_sJRu), so that case opens the page with ?mode=inspect.
 *   7. RecordsPage.tsx: judge the alarm panel over the rows on screen (`const judged = shown`). The
 *      record of a kind nobody declared waits on the last page and the panel does not name it.
 *   8. src/server/api/records.ts: find the records no heading holds among one page of rows, newest
 *      first, instead of every row. The door's list and the panel both leave the record out.
 *   9. RecordsPage.tsx: put back `@media (max-width: 60rem)` for the card rule. At 1,100 px with
 *      the sidebar open the table is wider than the box that holds it.
 *  10. App.tsx: take out the call to useTheBarIsRoomAtTheTop, so the window keeps no room for the
 *      phone's bar. After the press below the list, the bar covers the line at the top of it.
 *  11. RecordsPage.tsx: draw the line under the filter whenever a control hides something
 *      (`filter.filtered` alone). With a group chosen the sentence is on the screen twice.
 *  16. RecordsPage.tsx: delete the `.rec-table thead th` keep-all rule. In Chinese at 1440 a column
 *      head such as the one for Updated is broken over several lines.
 *  15. RecordsPage.tsx: drop `filter.sentence !== ''` from the same condition. A search alone that
 *      matched nothing draws the line as an empty paragraph.
 *  12. Pager.tsx: draw the presses whatever the page (`{false ? null : (`). A search that found one
 *      message draws Previous page and Next page, and neither can be pressed.
 *  13. RecordsPage.tsx: delete the `word-break: keep-all` rule. In Chinese at 1440 a state word
 *      with no space in it is broken over several lines.
 *  14. MessagesPage.tsx: pass `said.toGroup` to `toAGroup` instead of the group's name. The row
 *      says the group's stored id.
 *  17. src/server/lib/messages.ts: ask `gte` where the moment's own second must be left out
 *      (`gt(records.createdAt, after)` becomes `gte(records.createdAt, after)`). The case that reads
 *      from a message's own second keeps that message as well. The same cases also read the moment
 *      the reply says it used, and the total against the same read done the old way.
 */
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { t } from '../src/shared/i18n.ts'
import { MESSAGES_PAGE } from '../src/shared/messages.ts'

let app: LiveApp

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** How many notes and messages this file writes: more than one page of fifty, so there is a page two. */
const NOTES = 63
const MESSAGES = 57
/** A kind this product does not declare, as a program writing a word it made up would store it. */
const STRAY_KIND = 'lathe_setting'
/** The title of the one record of that kind. It is the oldest record, so it is on the last page. */
const STRAY_TITLE = 'Tailstock offset for the walnut blank'
/** The name of the one group this file opens. */
const GROUP_NAME = 'The lathe bench'
/** The words of the first message written. It is the oldest, so it is on the last page. */
const OLDEST_WORDS = 'The walnut gauge block reads long by four microns.'
/** A reason with no space in it, as long as a delivery's reason carrying an address. */
const LONG_REASON = `The check failed without a verdict: http://127.0.0.1:39017/api/checks/${'x'.repeat(24)}/verdict`
/**
 * THREE MESSAGES THE GROUP GAINED, at three moments of one morning, so a read from a moment can keep the
 * later ones alone. The lines opening the group are put on a moment before them all.
 */
const GROUP_EARLY_WORDS = 'The collet was changed before the first cut.'
const GROUP_MIDDLE_WORDS = 'The feed screw was oiled at eleven.'
const GROUP_LATE_WORDS = 'The bench is clear for the afternoon.'
const BEFORE_THE_THREE = '2026-03-01 10:30:00'
const AT_THE_MIDDLE = '2026-03-01 11:00:00'

async function post(body: unknown): Promise<string> {
  const filed = await fetch(`${app.api}/api/records`, { method: 'POST', headers: AS_THE_PERSON, body: JSON.stringify(body) })
  expect(filed.status, await filed.clone().text()).toBe(theAnswerToAWriteInATestOffice(AS_THE_PERSON, body))
  return ((await filed.json()) as { record: { id: string } }).record.id
}

async function door(path: string): Promise<Record<string, unknown>> {
  const read = await fetch(`${app.api}${path}`, { headers: AS_THE_PERSON })
  expect(read.status, await read.clone().text()).toBe(200)
  return (await read.json()) as Record<string, unknown>
}

/** The door's answer, refused or not, so a case can read a refusal's words. */
async function attempt(path: string): Promise<{ status: number; body: string }> {
  const read = await fetch(`${app.api}${path}`, { headers: AS_THE_PERSON })
  return { status: read.status, body: await read.text() }
}

async function openAt(hash: string, rows: string): Promise<void> {
  await app.page.goto(`${app.site}/#/`)
  await waitForThePage(app.page, 60_000)
  await app.page.goto(`${app.site}/${hash}`)
  await app.page.waitForSelector(rows, { timeout: 60_000 })
}

const line = async (): Promise<string> => (await app.page.locator('.px-pager-line').first().textContent()) ?? ''

/** Press a paging button and wait until the line has changed. */
async function press(name: 'Next page' | 'Previous page'): Promise<void> {
  const before = await line()
  await app.page.locator('.px-pager').first().getByRole('button', { name }).click()
  await app.page.waitForFunction((was) => document.querySelector('.px-pager-line')?.textContent !== was, before, {
    timeout: 30_000,
  })
}

let oldestMessage = ''
let strayRecord = ''
/** A note with a long summary, made the newest record, so the table on page one is short of room. */
let wideNote = ''
let groupId = ''
/** The three messages the group gains at three moments of one morning. */
let groupEarly = ''
let groupMiddle = ''
let groupLate = ''
/** The lines opening the group, put on a moment before those three. */
const theGroupsOwnLines: string[] = []
let newestMessage = ''
/** A message from the agent to the person, made the oldest, so it waits unread on the last page. */
let unreadOnTheLastPage = ''

beforeAll(async () => {
  app = await liveApp({ name: 'one-page', viewport: { width: 1440, height: 900 } })
  const agent = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({ kind: 'agent', title: 'Lathe Hand', data: { handle: 'lathe-hand', runtime: 'claude-code', state: 'active' } }),
  })
  expect(agent.status, await agent.text()).toBe(201)
  for (let i = 1; i <= NOTES; i += 1) {
    const n = String(i).padStart(2, '0')
    await post({ kind: 'note', title: `Workshop note ${n}`, data: { body: `Bench reading number ${n}.` } })
  }
  wideNote = await post({
    kind: 'note',
    title: 'The long bench log',
    summary:
      'Every reading from the walnut blank, the tailstock, the steady rest and the gauge block, written out in full, ' +
      'one after another, so that the title column of the table has more to hold than the room there is for it.',
    data: { body: 'The long bench log.' },
  })
  strayRecord = await post({ kind: 'note', title: STRAY_TITLE, data: { body: 'Offset 0.4 mm toward the operator.' } })
  oldestMessage = await post({ kind: 'message', title: 'The walnut gauge block', data: { body: OLDEST_WORDS, to: [{ kind: 'agent', id: 'lathe-hand' }] } })
  for (let i = 2; i <= MESSAGES; i += 1) {
    const words = `Shop floor line ${String(i).padStart(2, '0')}.`
    newestMessage = await post({ kind: 'message', title: words, data: { body: words, to: [{ kind: 'agent', id: 'lathe-hand' }] } })
  }
  const toThem = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'lathe-hand' },
    body: JSON.stringify({ kind: 'message', title: 'The tailstock', data: { body: 'The tailstock is locked.', to: [{ kind: 'person', id: THE_PERSON }] } }),
  })
  expect(toThem.status, await toThem.clone().text()).toBe(201)
  unreadOnTheLastPage = ((await toThem.json()) as { record: { id: string } }).record.id
  // ONE GROUP. Opening it writes its first line into it, which is the message the case below reads.
  const participants = (await door('/api/participants')) as { agents?: { id: string; handle: string }[] }
  const lathe = (participants.agents ?? []).find((a) => a.handle === 'lathe-hand')
  expect(lathe, 'the agent this file registered is not in the registry').toBeDefined()
  const opened = await fetch(`${app.api}/api/groups`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({
      name: GROUP_NAME,
      because: 'the bench work is talked over in one place',
      members: [
        { who: { kind: 'agent', id: lathe?.id }, because: 'it runs the lathe' },
        { who: { kind: 'person', id: THE_PERSON }, because: 'the owner watches' },
      ],
    }),
  })
  expect(opened.status, await opened.clone().text()).toBeLessThan(300)
  groupId = ((await opened.json()) as { group: { id: string } }).group.id
  // THE LINES OPENING THE GROUP, read with the group narrowing the door already has: they are put on a
  // moment before the three this file adds, so a read from a moment can keep the later ones alone.
  const openedLines = await door(`/api/messages?group=${groupId}&full=1&limit=50`)
  for (const one of openedLines['messages'] as { id: string }[]) theGroupsOwnLines.push(one.id)
  expect(theGroupsOwnLines.length, 'opening the group wrote no line into it').toBeGreaterThan(0)
  groupEarly = await post({ kind: 'message', title: GROUP_EARLY_WORDS, data: { body: GROUP_EARLY_WORDS, toGroup: groupId } })
  groupMiddle = await post({ kind: 'message', title: GROUP_MIDDLE_WORDS, data: { body: GROUP_MIDDLE_WORDS, toGroup: groupId } })
  groupLate = await post({ kind: 'message', title: GROUP_LATE_WORDS, data: { body: GROUP_LATE_WORDS, toGroup: groupId } })
  // THE CLOCK AND ONE LONG REASON, written into the database the server reads. Rows written in one
  // second share a stamp, so the oldest message is made oldest on the clock and the newest newest;
  // and a delivery's reason is written by the office itself, never by a request, so it is put on the
  // newest message's deliveries here, where the first page draws it.
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    db.prepare('UPDATE records SET created_at = ?, updated_at = ? WHERE id = ?').run('2026-01-01 09:00:00', '2026-01-01 09:00:00', oldestMessage)
    db.prepare('UPDATE records SET created_at = ?, updated_at = ? WHERE id = ?').run('2030-01-01 09:00:00', '2030-01-01 09:00:00', newestMessage)
    db.prepare('UPDATE records SET created_at = ?, updated_at = ? WHERE id = ?').run('2025-06-01 09:00:00', '2025-06-01 09:00:00', unreadOnTheLastPage)
    // THE GROUP'S OWN LINES, THEN THE THREE THIS FILE ADDED, at moments a read from can be put between.
    for (const id of theGroupsOwnLines) {
      db.prepare('UPDATE records SET created_at = ?, updated_at = ? WHERE id = ?').run('2026-02-01 09:00:00', '2026-02-01 09:00:00', id)
    }
    db.prepare('UPDATE records SET created_at = ?, updated_at = ? WHERE id = ?').run('2026-03-01 10:00:00', '2026-03-01 10:00:00', groupEarly)
    db.prepare('UPDATE records SET created_at = ?, updated_at = ? WHERE id = ?').run('2026-03-01 11:00:00', '2026-03-01 11:00:00', groupMiddle)
    db.prepare('UPDATE records SET created_at = ?, updated_at = ? WHERE id = ?').run('2026-03-01 12:00:00', '2026-03-01 12:00:00', groupLate)
    // THE RECORD OF A KIND NOBODY DECLARED. The door refuses to write one, so it is written into the
    // file, as an older build or another program would have left it, and made the oldest record.
    db.prepare('UPDATE records SET created_at = ?, updated_at = ? WHERE id = ?').run('2031-01-01 09:00:00', '2031-01-01 09:00:00', wideNote)
    db.prepare('UPDATE records SET kind = ?, created_at = ?, updated_at = ? WHERE id = ?').run(STRAY_KIND, '2020-01-01 09:00:00', '2020-01-01 09:00:00', strayRecord)
    const changed = db.prepare('UPDATE message_delivery SET because = ? WHERE message_id = ?').run(LONG_REASON, newestMessage)
    expect(changed.changes, 'the newest message has no delivery row to carry the reason').toBeGreaterThan(0)
  } finally {
    db.close()
  }
}, 300_000)

afterAll(async () => {
  await app.stop()
})

describe('the Everything page', () => {
  it('draws one page of fifty, says which rows out of how many, and goes to the next page and back', async () => {
    const whole = await door('/api/records?limit=1')
    const total = whole['matched'] as number
    expect(total, 'the fixture holds fewer than two pages').toBeGreaterThan(50)
    await openAt('#/records', '.rec tbody tr')
    expect(await app.page.locator('.rec tbody tr').count()).toBe(50)
    const all = total.toLocaleString('en-US')
    expect(await line()).toBe(`Showing 1 to 50 of ${all}.`)
    const firstPage = await app.page.locator('.rec tbody tr a.rec-cell-title').allTextContents()
    const previous = app.page.locator('.px-pager').first().getByRole('button', { name: 'Previous page' })
    expect(await previous.getAttribute('aria-disabled'), 'Previous can be pressed on the first page').toBe('true')

    await press('Next page')
    const to = Math.min(100, total)
    expect(await line()).toBe(`Showing 51 to ${String(to)} of ${all}.`)
    const secondPage = await app.page.locator('.rec tbody tr a.rec-cell-title').allTextContents()
    expect(secondPage.length).toBe(to - 50)
    expect(secondPage.filter((title) => firstPage.includes(title)), 'a row is on both pages').toEqual([])

    await press('Previous page')
    expect(await line()).toBe(`Showing 1 to 50 of ${all}.`)
  }, 180_000)

  it('searches every row, so a record on page two is found from page one', async () => {
    const pageTwo = await door('/api/records?shape=light&sort=updated&direction=desc&limit=50&offset=50')
    const onPageTwo = (pageTwo['records'] as { title: string }[]).find((r) => r.title.startsWith('Workshop note'))
    expect(onPageTwo, 'no workshop note is on page two, so this case would prove nothing').toBeDefined()
    const wanted = onPageTwo?.title ?? ''
    await openAt('#/records', '.rec tbody tr')
    const drawn = await app.page.locator('.rec tbody tr a.rec-cell-title').allTextContents()
    expect(drawn, 'the record searched for is already on page one').not.toContain(wanted)
    await app.page.locator('.rec-filters input').fill(wanted)
    await app.page.waitForFunction(
      (title) => [...document.querySelectorAll('.rec tbody tr a.rec-cell-title')].some((a) => a.textContent === title),
      wanted,
      { timeout: 30_000 },
    )
    const found = await app.page.locator('.rec tbody tr a.rec-cell-title').allTextContents()
    expect(found).toContain(wanted)
  }, 180_000)

  it('warns about a record no heading holds even when it is not on the page on screen', async () => {
    const pageOne = await door('/api/records?shape=light&tally=family&sort=updated&direction=desc&limit=50&offset=0')
    const onScreen = (pageOne['records'] as { id: string }[]).map((r) => r.id)
    expect(onScreen, 'the stray record is on page one, so this case would prove nothing').not.toContain(strayRecord)
    const unfiled = ((pageOne['tally'] as { unfiled: { id: string }[] }).unfiled ?? []).map((r) => r.id)
    expect(unfiled, 'the door does not name the stray record from page one').toContain(strayRecord)

    await openAt('#/records', '.rec tbody tr')
    const heading = `${String(unfiled.length)} record${unfiled.length === 1 ? '' : 's'} this page cannot file`
    await app.page.getByText(heading, { exact: true }).waitFor({ timeout: 30_000 })
    // The record is on the last page, so the one place page one can draw its title is the panel.
    expect(await app.page.locator('.rec tbody').textContent(), 'the stray record is in the table on page one').not.toContain(STRAY_TITLE)
    expect(await app.page.getByText(STRAY_TITLE, { exact: true }).count(), 'the panel does not name the stray record').toBe(1)
  }, 180_000)

  it('says once what a chosen group hides, and still says it when a search matched nothing', async () => {
    await openAt('#/records', '.rec tbody tr')
    // THE SENTENCE IS READ FROM THE WORD LIST, with the group's name as the button draws it.
    const button = app.page.locator('.rec-facet').nth(1)
    const group = ((await button.evaluate((b) => b.firstChild?.textContent ?? '')) || '').trim()
    expect(group, 'the group button has no name').not.toBe('')
    const said = t('g7a.records.groupFilter', { group })
    const times = async (): Promise<number> => ((await app.page.locator('.rec').textContent()) ?? '').split(said).length - 1
    const answered = app.page.waitForResponse((r) => r.url().includes('/api/records?') && r.url().includes('family='))
    await button.click()
    await answered
    await app.page.locator('.rec-count').filter({ hasText: said }).waitFor({ timeout: 30_000 })
    expect(await times(), 'the sentence about the chosen group is on the screen more than once').toBe(1)

    // A SEARCH THAT MATCHED NOTHING draws no count line, so the line under the filter is the one
    // place left that says the group is hiding records.
    await app.page.locator('.rec-filters input').fill('zzzz no record says this')
    await app.page.locator('.rec-excluded').waitFor({ timeout: 30_000 })
    expect(await app.page.locator('.rec-count').count()).toBe(0)
    expect(await times()).toBe(1)

    // A SEARCH ALONE HIDES NO GROUP AND NO KIND, so there is nothing for the line to say: it is not
    // drawn as an empty paragraph.
    await app.page.locator('.rec-facet').nth(0).click()
    await app.page.locator('.rec-excluded').waitFor({ state: 'detached', timeout: 30_000 })
    expect(await app.page.locator('.rec-excluded').count()).toBe(0)
  }, 180_000)

  it('keeps a Chinese word on one line in the column heads and the state and source columns', async () => {
    const desk = await app.browser.newContext({ viewport: { width: 1440, height: 900 } })
    try {
      const page = await desk.newPage()
      await page.goto(`${app.site}/?lang=zh#/records`)
      await page.waitForSelector('.rec tbody tr', { timeout: 60_000 })
      const broken = await page.evaluate(() => {
        // HOW MANY LINES EACH TEXT IN THE CELL TAKES, read off the boxes the browser laid out.
        const out: string[] = []
        let read = 0
        for (const cell of document.querySelectorAll('.rec thead th, .rec tbody td[data-col="state"], .rec tbody td[data-col="origin"]')) {
          const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT)
          for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
            const text = (node.textContent ?? '').trim()
            if (text === '' || /\s/.test(text) || !/[\u4e00-\u9fff]/.test(text)) continue
            read += 1
            const range = document.createRange()
            range.selectNodeContents(node)
            const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top / 4)))
            if (tops.size > 1) out.push(`${text} on ${String(tops.size)} lines`)
          }
        }
        return { read, out }
      })
      expect(broken.read, 'no Chinese word was found in the two columns, so nothing was measured').toBeGreaterThan(0)
      expect(broken.out).toEqual([])
    } finally {
      await desk.close()
    }
  }, 180_000)

  it('keeps every column in sight on a desk with the sidebar open', async () => {
    const desk = await app.browser.newContext({ viewport: { width: 1100, height: 900 } })
    try {
      const page = await desk.newPage()
      await page.goto(`${app.site}/#/records`)
      await page.waitForSelector('.rec tbody tr', { timeout: 60_000 })
      const fit = await page.evaluate(() => {
        const box = document.querySelector('.rec-tablewrap') as HTMLElement
        const table = document.querySelector('.rec-table') as HTMLElement
        return { box: box.clientWidth, table: table.scrollWidth }
      })
      expect(fit.table, `the table is ${String(fit.table)} px in a box of ${String(fit.box)} px, so a column is out of sight`).toBeLessThanOrEqual(fit.box)
    } finally {
      await desk.close()
    }
    // WHERE THERE IS ROOM IT IS STILL A TABLE: the fix must not turn every width into cards.
    await openAt('#/records', '.rec tbody tr')
    expect(await app.page.locator('.rec-table').evaluate((el) => getComputedStyle(el).display)).toBe('table')
  }, 180_000)
})

describe('a press below a list on a phone', () => {
  for (const at of [
    { page: 'Everything', hash: '#/records', rows: '.rec tbody tr', first: '.rec-count' },
    { page: 'Messages', hash: '#/messages', rows: 'li.px-ms-one', first: '.px-pager-line' },
  ]) {
    it(`brings the top of the ${at.page} list back clear of the phone's bar`, async () => {
      const phone = await app.browser.newContext({ viewport: { width: 390, height: 844 } })
      try {
        const page = await phone.newPage()
        await page.goto(`${app.site}/${at.hash}`)
        await page.waitForSelector(at.rows, { timeout: 60_000 })
        const before = await page.locator('.px-pager-line').first().textContent()
        await page.locator('.px-pager').last().getByRole('button', { name: 'Next page' }).click()
        await page.waitForFunction((was) => document.querySelector('.px-pager-line')?.textContent !== was, before, { timeout: 30_000 })
        await page.waitForTimeout(300)
        const where = await page.evaluate((first) => ({
          bar: (document.querySelector('.shell-bar') as HTMLElement).getBoundingClientRect().bottom,
          line: (document.querySelector(first) as HTMLElement).getBoundingClientRect().top,
        }), at.first)
        // HALF A PIXEL IS ALLOWED, because nobody can see a part of a pixel. The check of the right edge below allows the same.
        expect(where.line, `the line starts at ${String(where.line)} px and the bar ends at ${String(where.bar)} px`).toBeGreaterThanOrEqual(where.bar - 0.5)
      } finally {
        await phone.close()
      }
    }, 180_000)
  }
})

describe('the Messages page', () => {
  it('draws one page of fifty, says which messages out of how many, and goes to the next page', async () => {
    const whole = await door('/api/messages?limit=1')
    const total = whole['total'] as number
    expect(total).toBeGreaterThan(50)
    await openAt('#/messages', 'li.px-ms-one')
    expect(await app.page.locator('li.px-ms-one').count()).toBe(50)
    const all = total.toLocaleString('en-US')
    expect(await line()).toBe(`Showing 1 to 50 of ${all}.`)
    await press('Next page')
    expect(await line()).toBe(`Showing 51 to ${String(Math.min(100, total))} of ${all}.`)
    expect(await app.page.locator('li.px-ms-one').count()).toBe(Math.min(100, total) - 50)
  }, 180_000)

  it('looks for words in every message, so the oldest one is found from page one', async () => {
    await openAt('#/messages', 'li.px-ms-one')
    const drawn = await app.page.locator('li.px-ms-one .px-ms-words').allTextContents()
    expect(drawn, 'the oldest message is already on page one').not.toContain(OLDEST_WORDS)
    await app.page.click('.px-ms-narrow-open')
    await app.page.locator('.px-ms-filters').getByLabel(MESSAGES_PAGE.byWords).fill('walnut gauge')
    await app.page.waitForFunction(
      (words) => {
        const all = [...document.querySelectorAll('li.px-ms-one .px-ms-words')]
        return all.length === 1 && all[0]?.textContent === words
      },
      OLDEST_WORDS,
      { timeout: 30_000 },
    )
    expect(await line()).toBe('Showing 1 to 1 of 1.')
    // ONE PAGE, NO PRESSES: neither could ever be pressed, above the list or below it.
    expect(await app.page.locator('.px-pager button').count(), 'a list of one page draws paging presses').toBe(0)
  }, 180_000)

  it('says the unread count over every page, and a filter that hides nothing names the page range', async () => {
    const pool = await door('/api/messages?limit=50&offset=0')
    const onPageOne = (pool['messages'] as { id: string }[]).map((m) => m.id)
    expect(onPageOne, 'the unread message is on page one, so this case proves nothing').not.toContain(unreadOnTheLastPage)
    const unread = pool['unreadForYou'] as number
    expect(unread, 'the door does not count the message waiting on the last page').toBeGreaterThanOrEqual(1)
    await openAt('?mode=inspect#/messages', 'li.px-ms-one')
    await app.page.waitForSelector('.px-ms-unread-count', { timeout: 30_000 })
    expect(await app.page.locator('.px-ms-unread-count').textContent()).toBe(t('messages.unread.inAll', { n: unread }))
    expect(await app.page.locator('.px-ms-nothing-unread').count(), 'the page says nothing is unread').toBe(0)

    // A FILTER THAT HIDES NOTHING: every message here was written to the agent or the person, and
    // "queued" keeps each one the door says it keeps. The fixture is checked, not assumed.
    const queued = await door('/api/messages?state=queued&limit=1')
    const total = queued['total'] as number
    expect(queued['matched'], 'the queued filter hides a message, so this is not the case measured').toBe(total)
    await app.page.click('.px-ms-narrow-open')
    // The state is the second select: the sender and the contact are agent pickers, and the group is the first select.
    await app.page.locator('.px-ms-filters select').nth(1).selectOption('queued')
    const all = total.toLocaleString('en-US')
    const firstPage = t('messages.hiding.none', { total: all, from: '1', to: '50' })
    await app.page.waitForFunction((want) => document.querySelector('.px-ms-hiding')?.textContent?.includes(want) === true, firstPage, {
      timeout: 30_000,
    })
    await press('Next page')
    const secondPage = t('messages.hiding.none', { total: all, from: '51', to: String(Math.min(100, total)) })
    expect(await app.page.locator('.px-ms-hiding').textContent()).toContain(secondPage)
  }, 180_000)

  it('names the group a message was written to, not its stored id', async () => {
    const inGroup = await door(`/api/messages?group=${groupId}&limit=50&offset=0`)
    expect(inGroup['matched'], 'opening the group wrote no message into it').toBeGreaterThan(0)
    await openAt('#/messages', 'li.px-ms-one')
    await app.page.click('.px-ms-narrow-open')
    const answered = app.page.waitForResponse((r) => r.url().includes('/api/messages?') && r.url().includes(`group=${groupId}`))
    await app.page.locator('.px-ms-filters select').nth(0).selectOption(groupId)
    await answered
    await app.page.waitForFunction((want) => document.querySelector('.px-pager-line')?.textContent === want, `Showing 1 to ${String(inGroup['matched'])} of ${String(inGroup['matched'])}.`, { timeout: 30_000 })
    const lines = await app.page.locator('li.px-ms-to').allTextContents()
    const groupLines = lines.filter((one) => one.startsWith('Written to the group'))
    expect(groupLines.length, 'no row says which group it was written to').toBeGreaterThan(0)
    for (const one of groupLines) expect(one).toBe(MESSAGES_PAGE.toAGroup(GROUP_NAME))
  }, 180_000)

  describe('a group read from a moment on', () => {
    it('keeps the group messages after the moment, in the same shape, and the next page names the moment', async () => {
      const plain = await door(`/api/messages?group=${groupId}&full=1&limit=1000`)
      const shape = Object.keys((plain['messages'] as Record<string, unknown>[])[0] ?? {}).sort()
      expect(shape.length, 'the plain group read answered no message to compare a shape with').toBeGreaterThan(0)
      // THE ISO FORM WITH ITS ZONE NAMES THE SAME MOMENT AS THE OFFICE'S OWN FORM, and the reply says
      // which moment of the office's clock it read it as.
      const iso = new Date('2026-03-01T10:30:00').toISOString()
      const later = await door(`/api/messages?group=${groupId}&since=${encodeURIComponent(iso)}&full=1&limit=1000`)
      expect(later['since'], 'the reply does not say which moment it read the time as').toBe(BEFORE_THE_THREE)
      expect((later['messages'] as { id: string }[]).map((one) => one.id)).toEqual([groupLate, groupMiddle])
      for (const one of later['messages'] as Record<string, unknown>[]) expect(Object.keys(one).sort()).toEqual(shape)
      expect(later['total'], 'the total is not the pool before the narrowings').toBe(plain['total'])
      expect(later['matched']).toBe(2)
      expect(later['returned']).toBe(2)
      expect(later['left']).toBe(0)
      expect(later['truncated']).toBe(false)
      expect(later['next']).toBeNull()
      // THE NEXT PAGE IS A REQUEST THAT NAMES THE MOMENT TOO.
      const firstPage = await door(`/api/messages?group=${groupId}&since=${encodeURIComponent(BEFORE_THE_THREE)}&limit=1&offset=0`)
      expect(firstPage['left']).toBe(1)
      const next = new URL(String(firstPage['next']).replace(/^GET /, 'http://the.office'))
      expect(next.searchParams.get('group')).toBe(groupId)
      expect(next.searchParams.get('since'), 'the next page does not carry the moment').toBe(BEFORE_THE_THREE)
      expect(next.searchParams.get('offset')).toBe('1')
    })

    it('answers a group read with no since exactly as it did before the since reads', async () => {
      const theHashOfThePlainRead = async (): Promise<string> => {
        const read = await fetch(`${app.api}/api/messages?group=${groupId}&full=1&limit=1000`, { headers: AS_THE_PERSON })
        expect(read.status).toBe(200)
        return createHash('sha256').update(await read.text()).digest('hex')
      }
      const before = await theHashOfThePlainRead()
      await door(`/api/messages?group=${groupId}&since=${encodeURIComponent('2020-01-01 00:00:00')}&full=1&limit=1000`)
      expect(await theHashOfThePlainRead(), 'the plain group read changed after a since read').toBe(before)
    })

    it('answers an empty list and its counts for a moment in the future', async () => {
      const plain = await door(`/api/messages?group=${groupId}&limit=1000`)
      const future = await door(`/api/messages?group=${groupId}&since=${encodeURIComponent('2039-01-01 00:00:00')}&limit=1000`)
      expect(future['messages']).toEqual([])
      expect(future['since']).toBe('2039-01-01 00:00:00')
      expect(future['total'], 'the total is not the pool before the narrowings').toBe(plain['total'])
      expect(future['matched']).toBe(0)
      expect(future['returned']).toBe(0)
      expect(future['left']).toBe(0)
      expect(future['truncated']).toBe(false)
      expect(future['next']).toBeNull()
    })

    it('leaves out a message sent at the very second the moment names', async () => {
      const at = await door(`/api/messages?group=${groupId}&since=${encodeURIComponent(AT_THE_MIDDLE)}&full=1&limit=1000`)
      expect((at['messages'] as { id: string }[]).map((one) => one.id)).toEqual([groupLate])
      expect(at['matched']).toBe(1)
    })

    it('refuses a since it cannot read and says which forms it takes', async () => {
      // THE WORDS ARE THE DOOR'S OWN, read from the shared constant rather than copied here.
      const words = await import('../src/shared/messages.ts')
      expect(words.SINCE_REFUSAL, 'the since refusal is not exported as a constant for a test to read').toBeTypeOf('string')
      for (const unreadable of ['yesterday', '2026-03-01', '2026-03-01T11:00:00']) {
        const refused = await attempt(`/api/messages?group=${groupId}&since=${encodeURIComponent(unreadable)}`)
        expect(refused.status, `"${unreadable}" was not refused`).toBe(400)
        expect(refused.body, `the refusal for "${unreadable}" does not name the forms since takes`).toContain(words.SINCE_REFUSAL)
      }
    })

    it('refuses since without a group, saying since narrows a group\'s messages', async () => {
      const words = await import('../src/shared/messages.ts')
      expect(words.SINCE_WITHOUT_GROUP_REFUSAL, 'the since-needs-group refusal is not exported as a constant').toBeTypeOf('string')
      const refused = await attempt(`/api/messages?since=${encodeURIComponent('2026-03-01 10:00:00')}`)
      expect(refused.status).toBe(400)
      expect(refused.body).toContain(words.SINCE_WITHOUT_GROUP_REFUSAL)
    })
  })

  it('stays inside a 390 px phone when a delivery reason carries a long address', async () => {
    const phone = await app.browser.newContext({ viewport: { width: 390, height: 844 } })
    try {
      const page = await phone.newPage()
      await page.goto(`${app.site}/#/messages`)
      await page.waitForSelector('li.px-ms-one', { timeout: 60_000 })
      const reasons = await page.locator('.px-ms-mark[title]').evaluateAll((all) => all.map((one) => one.getAttribute('title') ?? ''))
      expect(reasons, 'the long reason is not on the first page, so nothing below is measured').toContain(LONG_REASON)
      const wide = await page.evaluate(() => {
        // WHAT REACHES PAST THE EDGE, named, so a red run says which element it was.
        const edge = document.documentElement.clientWidth
        const past = [...document.querySelectorAll('body *')]
          .filter((el) => el.getBoundingClientRect().right > edge + 0.5)
          .map((el) => `${el.tagName}.${String(el.className).slice(0, 40)}`)
        return { width: document.documentElement.scrollWidth, past: past.slice(-5) }
      })
      expect(wide.width, `the Messages page reaches past the right edge of the phone: ${wide.past.join(', ')}`).toBeLessThanOrEqual(390)
    } finally {
      await phone.close()
    }
  }, 180_000)
})
