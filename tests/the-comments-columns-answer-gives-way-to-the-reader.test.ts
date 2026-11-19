// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE COMMENTS COLUMN'S ANSWER TO A PRESSED COUNT GIVES WAY TO THE READER, AT 390.
 * Backlog item 9.22, wave 13y round 43.
 *
 * At 390 the comments column is a band in the page's own flow above the record. Pressing a comment count opens
 * the band and, in the same press, sends the mark layer to the comment's place (`showMeThat` in MarkLayer.tsx).
 * The band's own answer to the press (the effect in `ReviewPane`, ReviewBar.tsx, under "ONE FRAME WAS NOT
 * ENOUGH") runs frame by frame until the window has stayed home at the band for three frames, for at most one
 * second. The reader's own wheel, touch, pointer press or key stops that answer at once, so it never pulls the
 * window back against them (`MOVED_BY_THE_READER`).
 *
 * WHAT THIS HOLDS, at 390 in light:
 *  - a control: a press on a count whose comment names the record alone. The mark layer's move carries the band
 *    above the window, the answer brings it home, and the heading "Comments here" ends at or below the top
 *    bar's foot;
 *  - the reader's four ways of moving — a wheel, a key, a pointer press and a touch — each made while the
 *    answer is still running. The test then puts the window where the reader would have taken it, away from the
 *    band, and 1.2 seconds later it is still there.
 *
 * WHY THE READER'S CASES PRESS A COUNT WHOSE COMMENT NAMES THE TITLE. The answer stops by itself once the band
 * has been away from the window and then home for three frames, about 90ms after the press. A comment whose
 * mark-layer move carries the band out of the window therefore stops the answer long before a reader's move can
 * reach it, and no test can then tell the listeners from no listeners. A comment whose place is the record's own
 * title is centred near the top of the page, where the window already is, so the mark layer's smooth scroll asks
 * for a place it is already at and moves nothing: the band never leaves, and the answer runs its full second
 * with a move away from the band still pulled back. The control's comment has no place, so its answer really
 * does bring the band home from above the window.
 *
 * WHAT THIS DOES NOT HOLD: what a reader's move does at any other width, or anything about the office's own
 * writes. The window is put away with a programmatic scroll after the reader's move; every move the reader
 * makes is Playwright's trusted input (mouse wheel, key, mouse press, touchscreen tap), never `dispatchEvent`.
 *
 * WHY THE REPORT CARRIES SEVERAL PARAGRAPHS. Each reader case scrolls the page to put the window away from the
 * band (`window.scrollTo(0, 600)`), so the fixture report must be long enough to scroll that far at 390 by 1440.
 * The made-up paragraphs below are only there to give the page that height; nothing checks their words.
 *
 * A TRUSTED TAP IN CHROMIUM FIRES `pointerdown` AS WELL AS `touchstart`, and the touch case would then be
 * stopped by the pointerdown listener even with the touchstart listener taken out. The touch case therefore
 * loads its page with one small listener of the test's own that stops touch-originated `pointerdown` before the
 * column's own listeners see it, so the case proves the touchstart listener itself. The pointer press case
 * proves the pointerdown listener, with a mouse. The test's own listener is added before the page loads, so it
 * runs first.
 *
 * MUTATIONS, each a run of this whole file after a control and before its restore:
 *  A. the `for` loop that adds all four listeners removed: the four reader cases are red, the control is green.
 *  B. 'wheel' removed from `MOVED_BY_THE_READER`: the wheel case is red, the other three and the control green.
 *  C. 'keydown' removed: the key case is red, the rest green.
 *  D. 'pointerdown' removed: the pointer case is red, the rest green.
 *  E. 'touchstart' removed: the touch case is red, the rest green.
 *
 * Everything here is made up. A throwaway office, one synthetic agent, two synthetic records, and one synthetic
 * remark on each.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS = (handle: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })
const WRITER = { name: 'Kiln Keeper', handle: 'give-way-kiln' }

const ANSWER_TITLE = 'Synthetic shelf remarks'
const ANSWER_REMARK = 'Synthetic remark: the shelf holds, for the person.'
const READER_TITLE = 'Synthetic glaze remarks'
const READER_REMARK = 'Synthetic remark: the glaze moved, for the person.'

let app: LiveApp
let answerPageId = ''
let readerPageId = ''

async function write<T>(path: string, body: unknown, method = 'POST', headers = PERSON): Promise<T> {
  const response = await fetch(app.api + path, { method, headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
  expect(response.ok, await response.clone().text()).toBe(true)
  return await response.json() as T
}

async function file(kind: string, title: string, data: unknown, headers = PERSON): Promise<string> {
  return (await write<{ record: { id: string } }>('/api/records', { kind, title, data }, 'POST', headers)).record.id
}

beforeAll(async () => {
  app = await liveApp({ name: 'comments-column-give-way', viewport: { width: 390, height: 1440 }, hasTouch: true, workspace: 'default' })
  await app.page.addInitScript(() => localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light'))
  // THE TEST'S OWN LISTENER FOR THE TOUCH CASE, added before any page loads so it is registered before the
  // column's own listeners. It does nothing unless the address carries the touch case's marker.
  await app.page.addInitScript(() => {
    if (!new URLSearchParams(location.search).has('stop-touch-pointerdowns')) return
    window.addEventListener('pointerdown', (event) => {
      if ((event as PointerEvent).pointerType === 'touch') event.stopImmediatePropagation()
    }, true)
  })
  await file('agent', WRITER.name, { handle: WRITER.handle, runtime: 'claude-code', state: 'active' })
  const blocks = [
    { id: 'b-1', type: 'text', heading: 'Synthetic observations', text: 'Made-up data for this test: a shelf moved and a glaze changed colour.' },
    { id: 'b-2', type: 'text', text: 'The first shelf held forty-one green tiles and the second held thirty-eight, so three tiles were unaccounted for after the move. A note on the bench said the third shelf was reserved for samples.' },
    { id: 'b-3', type: 'text', text: 'A glaze sample fired at 1,180 degrees came out dull grey, while the same mix at 1,240 degrees came out clear. The kiln door was open for four minutes longer than the schedule allowed.' },
    { id: 'b-4', type: 'text', text: 'Two boxes of clay arrived on the Tuesday, one marked with a blue stripe and one with no mark at all. Each box held twelve bags, and one bag in the second box had split at a corner.' },
    { id: 'b-5', type: 'text', text: 'A tile measured 96 millimetres across, and a second tile from the same box measured 95 millimetres. The difference did not change after either tile was fired a second time.' },
    { id: 'b-6', type: 'text', text: 'The middle shelf cooled fastest on every firing that week, and the top shelf stayed warm the longest. A thermometer beside the door read 22 degrees before the first firing and 24 degrees after the last.' },
    { id: 'b-7', type: 'text', text: 'The blue-striped box was moved to the far wall, where the floor is level, and the unmarked box stayed beside the kiln. A label on the far wall said the shelf there was for dry clay only.' },
  ]
  answerPageId = await file('report', ANSWER_TITLE, { for: 'Robin', date: '2026-10-08', blocks }, AS(WRITER.handle))
  readerPageId = await file('report', READER_TITLE, { for: 'Robin', date: '2026-10-08', blocks }, AS(WRITER.handle))
  // THE CONTROL'S COMMENT NAMES THE RECORD ALONE, so the mark layer's move really does carry the band away and
  // the answer has to bring it home.
  await file('message', 'Synthetic remark on the shelf', {
    body: ANSWER_REMARK,
    target: { target: { kind: 'record', recordId: answerPageId, workspaceId: 'default' } },
    to: [{ kind: 'person', id: THE_PERSON }],
  }, AS(WRITER.handle))
  // THE READER'S COMMENT NAMES THE TITLE, a place near the top of the page, where the window already is.
  await file('message', 'Synthetic remark on the glaze', {
    body: READER_REMARK,
    target: {
      target: { kind: 'record', recordId: readerPageId, workspaceId: 'default' },
      place: { at: 'words', span: { quote: READER_TITLE, from: 0, to: READER_TITLE.length, field: 'title' } },
    },
    to: [{ kind: 'person', id: THE_PERSON }],
  }, AS(WRITER.handle))
  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: 'Pair this browser', exact: true }).click()
  await app.page.getByText('This browser is paired.', { exact: true }).waitFor({ timeout: 30_000 })
}, 240_000)

afterAll(async () => { await app?.stop() }, 60_000)

const row = (body: string) => app.page.locator('.px-rev-item').filter({ has: app.page.locator('.px-rev-words', { hasText: body }) })

/** Wait until the window has not moved for five frames in a row, so every smooth scroll has ended. */
async function windowAtRest(): Promise<void> {
  await app.page.evaluate(() => new Promise<void>((resolve) => {
    let last = window.scrollY
    let still = 0
    const look = () => {
      still = window.scrollY === last ? still + 1 : 0
      last = window.scrollY
      if (still >= 5) resolve()
      else requestAnimationFrame(look)
    }
    requestAnimationFrame(look)
  }))
}

/** Open one record's page at 390 in light, press its comment count, and wait for the column's heading. */
async function pressTheCount(pageId: string, stopTouchPointerdowns = false): Promise<void> {
  const marker = stopTouchPointerdowns ? '&stop-touch-pointerdowns=1' : ''
  await app.page.goto(`${app.site}/?lang=en&look=light${marker}#/r/${pageId}`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.px-comment-circle').first().click()
  await app.page.locator('.px-pane-title').waitFor({ timeout: 30_000 })
}

type ReaderMove = 'a wheel' | 'a key' | 'the pointer' | 'a touch'

/**
 * THE READER'S MOVE, AND NOTHING ELSE. Trusted input throughout: Playwright presses the real key and lands the
 * real pointer, touch or wheel where a person would. The point is over the record's own words, so the press
 * starts nothing and the wheel scrolls the page.
 */
async function theReaderMoves(move: ReaderMove): Promise<void> {
  if (move === 'a wheel') {
    await app.page.mouse.move(195, 900)
    await app.page.mouse.wheel(0, 600)
  } else if (move === 'a key') {
    await app.page.keyboard.press('Shift')
  } else if (move === 'the pointer') {
    await app.page.mouse.move(195, 900)
    await app.page.mouse.down()
    await app.page.mouse.up()
  } else {
    await app.page.touchscreen.tap(195, 900)
  }
}

/** Where the top bar's foot, the column's heading and the band's own top are, all in the window. */
async function theBandAndTheBar(): Promise<{ barBottom: number; titleTop: number; paneTop: number; stick: number }> {
  return app.page.evaluate(() => {
    const bar = document.querySelector('.shell-bar')
    const barBottom = bar === null || getComputedStyle(bar).display === 'none' ? 0 : Math.max(0, bar.getBoundingClientRect().bottom)
    const title = document.querySelector('.px-pane-title')
    if (title === null) throw new Error('the comments column has no heading')
    const pane = document.querySelector('.px-pane')
    if (pane === null) throw new Error('the comments column is not drawn')
    return {
      barBottom,
      titleTop: title.getBoundingClientRect().top,
      paneTop: pane.getBoundingClientRect().top,
      stick: parseFloat((pane as HTMLElement).style.getPropertyValue('--px-pane-stick')),
    }
  })
}

/**
 * Press the reader's page, wait until the answer is running, make the reader's move, put the window where the
 * reader would have taken it, and read where it is 1.2 seconds later.
 */
async function theWindowAfterTheReaderMoves(move: ReaderMove): Promise<{ placed: number; after: number }> {
  await pressTheCount(readerPageId, move === 'a touch')
  await row(READER_REMARK).waitFor({ timeout: 30_000 })
  // THE ANSWER RUNS FOR A SECOND AFTER THE PRESS (ReviewPane, ReviewBar.tsx). The move is made well inside it.
  await app.page.waitForTimeout(150)
  await theReaderMoves(move)
  // THE PAGE'S OWN END, not a copied 600: the test page is shorter than it was, and the check is that the reader's move is not undone.
  await app.page.evaluate(() => { window.scrollTo(0, document.documentElement.scrollHeight) })
  const placed = await app.page.evaluate(() => Math.round(window.scrollY))
  await app.page.waitForTimeout(1200)
  const after = await app.page.evaluate(() => Math.round(window.scrollY))
  return { placed, after }
}

it('brings the band home and keeps its heading below the top bar when the reader does not move', async () => {
  await pressTheCount(answerPageId)
  await row(ANSWER_REMARK).waitFor({ timeout: 30_000 })
  await app.page.waitForTimeout(400)
  await windowAtRest()
  const seen = await theBandAndTheBar()
  expect(seen.paneTop, 'the band did not come home in the window').toBeGreaterThanOrEqual(seen.stick - 1)
  expect(seen.titleTop, 'the heading is above the top bar foot').toBeGreaterThanOrEqual(seen.barBottom - 0.5)
}, 120_000)

it('stays where the reader takes it after the reader turns the wheel', async () => {
  const { placed, after } = await theWindowAfterTheReaderMoves('a wheel')
  expect(placed, 'the window never went away from the band').toBeGreaterThan(100)
  expect(after, 'the answer pulled the window back after the reader turned the wheel').toBeGreaterThanOrEqual(placed - 10)
}, 120_000)

it('stays where the reader takes it after the reader presses a key', async () => {
  const { placed, after } = await theWindowAfterTheReaderMoves('a key')
  expect(placed, 'the window never went away from the band').toBeGreaterThan(100)
  expect(after, 'the answer pulled the window back after the reader pressed a key').toBeGreaterThanOrEqual(placed - 10)
}, 120_000)

it('stays where the reader takes it after the reader presses the pointer', async () => {
  const { placed, after } = await theWindowAfterTheReaderMoves('the pointer')
  expect(placed, 'the window never went away from the band').toBeGreaterThan(100)
  expect(after, 'the answer pulled the window back after the reader pressed the pointer').toBeGreaterThanOrEqual(placed - 10)
}, 120_000)

it('stays where the reader takes it after the reader touches the page', async () => {
  const { placed, after } = await theWindowAfterTheReaderMoves('a touch')
  expect(placed, 'the window never went away from the band').toBeGreaterThan(100)
  expect(after, 'the answer pulled the window back after the reader touched the page').toBeGreaterThanOrEqual(placed - 10)
}, 120_000)
