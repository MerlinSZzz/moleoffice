// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW OPEN IN THE COLUMN DRAWS WHAT CHANGED ELSEWHERE, AND SEND NEVER SENDS WHAT THE OWNER DID NOT SEE.
 *
 * Wave 13x round 24. Round 23 made the list of collecting reviews read again at each move inside the app and on focus (a
 * "look"). The detail of the one review the column has open was still read once for each change this tab makes, so a
 * comment added elsewhere, or the review ended elsewhere, was never drawn: the column drew 1 comment and "Send 1" while
 * the server held 2, and still drew an abandoned review as collecting, with Send. A press of Send sends what the server
 * holds, by the review's id, so it could send a comment nobody had seen.
 *
 * Two fixes are held here:
 * - Between presses, the column reads the review again when the list of collecting reviews, read at each look, shows it
 *   differently from what is drawn: another count of comments not sent, or not collecting at all. No new read per look.
 * - At the press of Send, the review is read fresh. If its comments or its state differ from what is drawn, the new
 *   state is drawn, nothing is sent, and a sentence says why.
 *
 * Every write here is a call to the server, never a press on the page, so the page has written nothing that would make
 * it read again. Everything is made up: the notes, the agent Kiln Keeper, and the comments, in a Mole Office of the
 * test's own.
 *
 * WHAT MAKES IT FAIL
 * - OneReview in src/web/components/agent/ReviewBar.tsx reading the review only once for each change: the first two
 *   cases draw 1 comment, and a review that has ended as collecting.
 * - OneReview reading the review again at every look: the first case counts a read of the review on a quiet look.
 * - Send not reading the review fresh at the press: the last two cases send the review, or draw the refusal of a send.
 * - This test pressing the first row of the column's list, or reading the column in more than one read: the two cases
 *   at the end of the file. The list holds the reviews the cases before ended, and orders reviews started in the same
 *   second by their ids; between two reads, the column can be drawn again.
 *
 * PICTURES. When `OPEN_REVIEW_SHOTS` names a directory, the column is photographed at 1440, 990, 660 and 390, light and
 * dark, after each press of Send that sent nothing: with the second comment drawn, and with the review drawn as ended.
 */
import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { en } from '../src/shared/words/en.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

/** The sentence drawn when a press of Send found the review changed, in English. */
const CHANGED_AT_SEND = 'Nothing was sent. This review changed somewhere else after it was shown here. It is shown again below as it is now.'

const SHOTS = process.env['OPEN_REVIEW_SHOTS']

const AS_THE_PERSON = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let app: LiveApp
/** The made-up agent every review here goes to, so Send can be pressed. */
let kiln = ''

async function ask<T>(method: string, path: string, body?: unknown): Promise<T> {
  const reply = await fetch(app.api + path, {
    method,
    headers: body === undefined ? AS_THE_PERSON : { ...AS_THE_PERSON, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return (await reply.json()) as T
}

/** A made-up note, by its id. */
async function aNote(title: string): Promise<string> {
  return (await ask<{ record: { id: string } }>('POST', '/api/records', { kind: 'note', title, data: { body: 'Made up for this test.' } })).record.id
}

function onThe(note: string) {
  return { target: { kind: 'record', recordId: note, workspaceId: 'default' }, place: { at: 'surface' } }
}

/** A made-up comment on a note, written by a call to the server. */
async function aComment(note: string, body: string): Promise<void> {
  await ask('POST', '/api/records', { kind: 'message', title: 'Made-up comment', data: { body, target: onThe(note) } })
}

/** A review started on a note by a call to the server, going to Kiln Keeper, holding one made-up comment. */
async function aReviewStartedElsewhere(on: string): Promise<string> {
  const review = (await ask<{ review: { id: string } }>('POST', '/api/reviews', { entry: onThe(on) })).review.id
  await ask('POST', `/api/reviews/${review}/recipient`, { recipient: { kind: 'agent', agentId: kiln } })
  await aComment(on, 'The first made-up comment, written by the test.')
  return review
}

/** What the server holds of the review now: its state, and how many comments it holds. */
async function heldByTheServer(review: string): Promise<{ state: string; comments: number }> {
  const detail = await ask<{ review: { state: string }; members: unknown[]; saved: unknown[] }>('GET', `/api/reviews/${review}`)
  return { state: detail.review.state, comments: detail.members.length + detail.saved.length }
}

async function abandon(review: string): Promise<void> {
  await ask('POST', `/api/reviews/${review}/abandon`)
}

/** Ends the review unless it has ended already. */
async function abandonIfCollecting(review: string): Promise<void> {
  if ((await heldByTheServer(review)).state === 'collecting') await abandon(review)
}

/** Opens a note as a new load of the page, and waits until the list of collecting reviews has been read. */
async function openFresh(note: string): Promise<void> {
  await app.page.goto(`${app.site}/#/r/${note}`)
  const read = app.page.waitForResponse((reply) => reply.url().includes('/api/reviews?state=collecting'), { timeout: 30_000 })
  await app.page.reload()
  await read
  await waitForThePage(app.page)
}

/** How a list row of a collecting review begins, in English: its state word and the dash before its subject. */
const COLLECTING_ROW = en['review.pane.listRow'].split('{subject}')[0]!.replace('{state}', en['review.pane.state.collecting'])

/** Opens the column with the sidebar's Reviews control, then the one collecting review listed in it. */
async function openTheReviewInTheColumn(): Promise<void> {
  const press = app.page.locator('.px-review-switch')
  if ((await press.getAttribute('aria-pressed')) !== 'true') await press.click()
  await app.page.locator('.px-pane').waitFor({ timeout: 20_000 })
  // THE COLLECTING REVIEW'S ROW, NOT THE FIRST ROW. The list also holds the reviews the cases before this one ended, and
  // it orders reviews started in the same second by their ids, so an ended one can be listed first.
  await app.page.locator('.px-pane .px-rev-go').filter({ hasText: COLLECTING_ROW }).click({ timeout: 20_000 })
  await app.page.locator('.px-pane [data-part="your-review"]').waitFor({ timeout: 20_000 })
}

async function shutTheColumn(): Promise<void> {
  const press = app.page.locator('.px-review-switch')
  if ((await press.getAttribute('aria-pressed')) === 'true') await press.click()
  await app.page.locator('.px-pane').waitFor({ state: 'detached', timeout: 20_000 })
}

interface Column {
  collecting: boolean
  comments: number
  send: string
  said: string
}

/** What the column draws of the open review now, and the sentence a press of Send left, if any. */
async function theColumn(): Promise<Column> {
  // ONE READ OF THE PAGE, NOT FOUR. Between separate reads the column can be drawn again, and a read of the Send button
  // after the review was counted as collecting would wait out its limit for a button the ended review no longer has.
  return app.page.evaluate(() => {
    const collecting = document.querySelector('.px-pane [data-part="your-review"]') !== null
    const said = document.querySelector('.px-pane [data-part="changed-at-send"]')
    return {
      collecting,
      comments: collecting ? document.querySelectorAll('.px-pane .px-b-comment').length : 0,
      send: collecting ? (document.querySelector('.px-pane .px-b-do button')?.textContent ?? '') : '',
      said: said === null ? '' : (said.textContent ?? ''),
    }
  })
}

/** The column as drawn for a collecting review holding `n` comments, and the sentence a press of Send left. */
function collectingWith(n: number, said = ''): Column {
  return { collecting: true, comments: n, send: en['review.b.send'][n === 1 ? 'one' : 'other'].replace('{n}', String(n)), said }
}

/** Waits up to 10 s for the column to draw what is expected, and answers what it drew last. */
async function waitForTheColumn(expected: Column): Promise<Column> {
  let now = await theColumn()
  const until = Date.now() + 10_000
  while (Date.now() < until && JSON.stringify(now) !== JSON.stringify(expected)) {
    await app.page.waitForTimeout(250)
    now = await theColumn()
  }
  return now
}

async function moveTo(note: string): Promise<void> {
  await app.page.evaluate((to) => {
    location.hash = to
  }, `#/r/${note}`)
  await app.page.waitForURL(new RegExp(`#/r/${note}`), { timeout: 15_000 })
  await waitForThePage(app.page)
}

async function focus(): Promise<void> {
  await app.page.evaluate(() => window.dispatchEvent(new Event('focus')))
}

/** Counts the page's reads of one review, `GET /api/reviews/<id>` and nothing under it, from now until `stop`. */
function countTheReadsOf(review: string): { stop: () => number } {
  let reads = 0
  const heard = (request: { method: () => string; url: () => string }) => {
    if (request.method() === 'GET' && new URL(request.url()).pathname === `/api/reviews/${review}`) reads += 1
  }
  app.page.on('request', heard)
  return {
    stop: () => {
      app.page.off('request', heard)
      return reads
    },
  }
}

/**
 * Presses the tray's Send review, and waits until no press on its row is pending. Send N at the foot of the list is not
 * drawn in the tray at the window's foot (wave 13y round 146, item 73a), and only the row's Send shows that it is
 * waiting.
 */
async function pressSend(): Promise<void> {
  await app.page.locator('.px-pane [data-part="your-review-bar"]').getByRole('button', { name: createI18n('en').t('review.tray.send'), exact: true }).click()
  await app.page.waitForFunction(() => document.querySelector('.px-pane [data-part="your-review-bar"] button[data-pending="1"]') === null, undefined, { timeout: 30_000 })
  await app.page.waitForTimeout(1_000)
}

/** Photographs the window at the four widths, in both themes, and puts the window back as it was. */
async function photograph(name: string): Promise<void> {
  if (SHOTS === undefined || SHOTS === '') return
  mkdirSync(SHOTS, { recursive: true })
  for (const width of [1440, 990, 660, 390]) {
    await app.page.setViewportSize({ width, height: 1000 })
    if (width === 390 && name === 'look-drew-an-edited-comment') {
      await app.page.locator('.px-b-bar').getByRole('button', { name: 'Open', exact: true }).click()
    }
    for (const theme of ['light', 'dark'] as const) {
      await app.page.emulateMedia({ colorScheme: theme })
      await app.page.waitForTimeout(400)
      await app.page.screenshot({ path: `${SHOTS}/${name}-${String(width)}-${theme}.png` })
    }
  }
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  await app.page.emulateMedia({ colorScheme: 'light' })
}

beforeAll(async () => {
  app = await liveApp({ name: 'open-review-elsewhere', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  kiln = (await ask<{ record: { id: string } }>('POST', '/api/records', { kind: 'agent', title: 'Kiln Keeper', data: { handle: 'kiln-keeper', runtime: 'claude-code', state: 'active' } })).record.id
  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: en['g4.pairing.press'], exact: true }).click()
  await app.page.getByText(en['g4.pairing.paired'], { exact: true }).waitFor()
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('between presses, the review open in the column is read again when the list of collecting reviews shows it differently', () => {
  it('a quiet look reads nothing, and a comment added elsewhere is drawn after a move, and another after focus', async () => {
    const here = await aNote('Made-up glaze note, stood on')
    const next = await aNote('Made-up shelf note, moved to')
    const elsewhere = await aNote('Made-up firing note, commented on elsewhere')
    const review = await aReviewStartedElsewhere(elsewhere)
    try {
      await openFresh(here)
      await openTheReviewInTheColumn()
      expect(await waitForTheColumn(collectingWith(1)), 'the column draws the one comment the review holds').toEqual(collectingWith(1))

      // NO NEW READ PER LOOK. Nothing changed elsewhere, so a move and a focus read the list and not the review.
      const quiet = countTheReadsOf(review)
      await moveTo(next)
      await focus()
      await app.page.waitForTimeout(2_000)
      expect(quiet.stop(), 'reads of the review on two looks with nothing changed').toBe(0)

      await aComment(elsewhere, 'The second made-up comment, written by the test after the column was drawn.')
      expect(await heldByTheServer(review), 'the second comment joined the review').toEqual({ state: 'collecting', comments: 2 })
      const moved = countTheReadsOf(review)
      await moveTo(here)
      expect(await waitForTheColumn(collectingWith(2)), 'the second comment, drawn after a move').toEqual(collectingWith(2))
      await app.page.waitForTimeout(1_000)
      expect(moved.stop(), 'reads of the review on the look that found it changed').toBe(1)

      await aComment(elsewhere, 'The third made-up comment, written by the test.')
      await focus()
      expect(await waitForTheColumn(collectingWith(3)), 'the third comment, drawn after focus').toEqual(collectingWith(3))
    } finally {
      await abandonIfCollecting(review)
      await shutTheColumn()
    }
  }, 180_000)

  it('the review ended elsewhere is no longer drawn as collecting, with Send, after focus', async () => {
    const here = await aNote('Made-up clay note, stood on')
    const elsewhere = await aNote('Made-up kiln log, ended elsewhere')
    const review = await aReviewStartedElsewhere(elsewhere)
    try {
      await openFresh(here)
      await openTheReviewInTheColumn()
      expect(await waitForTheColumn(collectingWith(1)), 'the column draws the review as collecting').toEqual(collectingWith(1))
      await abandon(review)
      expect((await heldByTheServer(review)).state).toBe('abandoned')

      await focus()
      const ended: Column = { collecting: false, comments: 0, send: '', said: '' }
      expect(await waitForTheColumn(ended), 'an ended review, drawn after focus').toEqual(ended)
      expect(await app.page.locator('.px-pane').count(), 'the column is still open, drawing the review as it is now').toBe(1)
    } finally {
      await abandonIfCollecting(review)
      await shutTheColumn()
    }
  }, 180_000)
})

describe('at the press of Send, the review is read fresh, and a review that changed since it was drawn is not sent', () => {
  it('a comment added elsewhere and not yet drawn: nothing is sent, the second comment is drawn, and a sentence says why', async () => {
    const here = await aNote('Made-up glaze log, stood on')
    const elsewhere = await aNote('Made-up shelf log, commented on elsewhere')
    const review = await aReviewStartedElsewhere(elsewhere)
    try {
      await openFresh(here)
      await openTheReviewInTheColumn()
      expect(await waitForTheColumn(collectingWith(1))).toEqual(collectingWith(1))

      // NO LOOK BETWEEN THE COMMENT AND THE PRESS, so what is drawn is still the one comment.
      await aComment(elsewhere, 'The second made-up comment, written by the test and not yet drawn.')
      expect(await theColumn(), 'the press is made on the column as drawn before the comment').toEqual(collectingWith(1))

      await pressSend()
      expect(await heldByTheServer(review), 'nothing was sent: the review is still collecting').toEqual({ state: 'collecting', comments: 2 })
      expect(await waitForTheColumn(collectingWith(2, CHANGED_AT_SEND)), 'the review as it is now, and the sentence').toEqual(collectingWith(2, CHANGED_AT_SEND))
      await photograph('send-found-a-new-comment')

      // WHAT IS DRAWN IS NOW WHAT THE SERVER HOLDS, so the next press sends it.
      await pressSend()
      expect((await heldByTheServer(review)).state, 'the second press sent the review').not.toBe('collecting')
    } finally {
      await abandonIfCollecting(review)
      await shutTheColumn()
    }
  }, 180_000)

  it('the review ended elsewhere and not yet drawn: nothing is sent, the review is drawn as ended, and a sentence says why', async () => {
    const here = await aNote('Made-up clay log, stood on')
    const elsewhere = await aNote('Made-up firing log, ended elsewhere')
    const review = await aReviewStartedElsewhere(elsewhere)
    try {
      await openFresh(here)
      await openTheReviewInTheColumn()
      expect(await waitForTheColumn(collectingWith(1))).toEqual(collectingWith(1))

      await abandon(review)
      expect(await theColumn(), 'the press is made on the column as drawn before the review ended').toEqual(collectingWith(1))

      await pressSend()
      expect((await heldByTheServer(review)).state, 'nothing was sent').toBe('abandoned')
      const ended: Column = { collecting: false, comments: 0, send: '', said: CHANGED_AT_SEND }
      expect(await waitForTheColumn(ended), 'the review as it is now, and the sentence').toEqual(ended)
      expect(await app.page.locator('.px-pane .px-error').count(), 'no refusal is drawn').toBe(0)
      await photograph('send-found-the-review-ended')
    } finally {
      await abandonIfCollecting(review)
      await shutTheColumn()
    }
  }, 180_000)
})


// Holding finish and writing one more comment used to send both comments, including the unseen one.
describe('the gap between the fresh answer and finishing collecting', () => {
  it('measures the browser network gap on one send with made-up data', async () => {
    const network = await app.page.context().newCDPSession(app.page)
    await network.send('Network.enable')
    let active = ''
    let answered = 0
    const reading = new Set<string>()
    const gaps: number[] = []
    network.on('Network.requestWillBeSent', event => {
      const path = new URL(event.request.url).pathname
      if (event.request.method === 'GET' && path === `/api/reviews/${active}`) reading.add(event.requestId)
      if (event.request.method === 'POST' && path === `/api/reviews/${active}/finish-collecting`) {
        expect(answered, 'the fresh review response completed before finishing').toBeGreaterThan(0)
        gaps.push((event.timestamp - answered) * 1000)
      }
    })
    network.on('Network.loadingFinished', event => {
      if (reading.delete(event.requestId)) answered = event.timestamp
    })
    try {
      const here = await aNote('Made-up timing page, stood on')
      const elsewhere = await aNote('Made-up timing page, sent once')
      const review = await aReviewStartedElsewhere(elsewhere)
      await openFresh(here)
      await openTheReviewInTheColumn()
      expect(await waitForTheColumn(collectingWith(1))).toEqual(collectingWith(1))
      active = review
      answered = 0
      try {
        const sent = app.page.waitForResponse(reply => new URL(reply.url()).pathname === `/api/reviews/${review}/send`)
        await pressSend()
        expect((await sent).status()).toBe(200)
        expect((await heldByTheServer(review)).state, 'sending every drawn comment completes the review').toBe('sent')
      } finally {
        active = ''
        await shutTheColumn()
      }
      expect(gaps).toHaveLength(1)
      expect(gaps.every(gap => gap >= 0)).toBe(true)
      console.info('SEND_GAP_MS', JSON.stringify({ samples: gaps, min: gaps[0], median: gaps[0], p95: gaps[0], max: gaps[0] }))
    } finally {
      await network.detach()
    }
  }, 180_000)

  it('does not send an unseen comment written while the finish request is held', async () => {
    const here = await aNote('Made-up gap page, stood on')
    const elsewhere = await aNote('Made-up gap page, commented on')
    const review = await aReviewStartedElsewhere(elsewhere)
    let release = () => {}
    let arrived = () => {}
    const held = new Promise<void>(resolve => { release = resolve })
    const entered = new Promise<void>(resolve => { arrived = resolve })
    const path = `**/api/reviews/${review}/finish-collecting`
    try {
      await openFresh(here)
      await openTheReviewInTheColumn()
      expect(await waitForTheColumn(collectingWith(1))).toEqual(collectingWith(1))
      await app.page.route(path, async route => { arrived(); await held; await route.continue() })
      const pressing = pressSend()
      await entered
      const added = await ask<{ record: { id: string } }>('POST', '/api/records', { kind: 'message', title: 'Made-up unseen comment in the gap', data: {
        body: 'This comment was written while the finish request was held.', target: onThe(elsewhere),
      } })
      release()
      await pressing
      const after = await ask<{ review: { state: string }; members: { id: string; state: string }[] }>('GET', `/api/reviews/${review}`)
      console.info('HELD_FINISH_MEMBERS', JSON.stringify(after.members))
      expect(after.members.find(one => one.id === added.record.id)?.state, 'the person never saw the added comment').toBe('queued')
      expect(after.members.filter(one => one.id !== added.record.id).every(one => one.state === 'sent')).toBe(true)
      expect(after.review.state, 'a comment left out keeps the review not sent').toBe('collected')
      await photograph('held-finish-sent-only-shown')
    } finally {
      release()
      await app.page.unroute(path)
      await abandonIfCollecting(review)
      await shutTheColumn()
    }
  }, 180_000)
})


it('draws a comment edited elsewhere after the next look, with one changed read and no quiet read', async () => {
  const here = await aNote('Made-up edit page, stood on')
  const elsewhere = await aNote('Made-up edit page, commented on')
  const review = await aReviewStartedElsewhere(elsewhere)
  try {
    await openFresh(here)
    await openTheReviewInTheColumn()
    expect(await waitForTheColumn(collectingWith(1))).toEqual(collectingWith(1))
    const before = await ask<{ members: { id: string }[] }>('GET', `/api/reviews/${review}`)
    const body = 'The made-up shelf was measured twice, as edited elsewhere.'
    await ask('PATCH', `/api/records/${before.members[0]!.id}`, { dataPatch: { body } })
    const changed = countTheReadsOf(review)
    await focus()
    await expect.poll(() => app.page.locator('.px-pane .px-b-comment').allTextContents(), { timeout: 10_000 }).toEqual([expect.stringContaining(body)])
    await app.page.waitForTimeout(500)
    expect(changed.stop(), 'the look finding an edit reads the review once').toBe(1)
    await photograph('look-drew-an-edited-comment')
    const quiet = countTheReadsOf(review)
    await focus()
    await app.page.waitForTimeout(1_000)
    expect(quiet.stop(), 'a quiet look reads no detail').toBe(0)
  } finally {
    await abandonIfCollecting(review)
    await shutTheColumn()
  }
}, 180_000)


describe('the test presses the collecting review in the list, and reads the column all at once', () => {
  it('opens the collecting review when an ended one, started in the same second, is listed first', async () => {
    // THE LIST ORDERS NEWEST FIRST, AND REVIEWS STARTED IN THE SAME SECOND BY THEIR IDS. A case that takes under a second
    // leaves its ended review in the second the next case starts its own, and then the ended one can be listed first.
    // Here that order is made: reviews are started and ended until one is listed after an ended one of the same second.
    const here = await aNote('Made-up kiln shelf, stood on')
    let review = ''
    for (let tries = 1; tries <= 20 && review === ''; tries += 1) {
      const one = await aReviewStartedElsewhere(await aNote(`Made-up kiln shelf ${String(tries)}, commented on elsewhere`))
      const listed = (await ask<{ reviews: { id: string; state: string; started: string }[] }>('GET', '/api/reviews')).reviews
      const first = listed[0]
      if (first !== undefined && first.id !== one && first.state !== 'collecting' && first.started === listed.find((r) => r.id === one)?.started) review = one
      else await abandon(one)
    }
    expect(review, 'an ended review started in the same second is listed before the collecting one').not.toBe('')
    try {
      await openFresh(here)
      await openTheReviewInTheColumn()
      expect(await waitForTheColumn(collectingWith(1)), 'the column draws the collecting review').toEqual(collectingWith(1))
    } finally {
      if (review !== '') await abandonIfCollecting(review)
      await shutTheColumn()
    }
  }, 180_000)

  it('reads a column that holds the review but no Send button at once, and does not wait for the button', async () => {
    // WHAT A READ OF THE SEND BUTTON MEETS when the column is drawn again after the review was counted: the button is
    // gone. The page is set to that moment and stands still. This replaces the app's page, so this case runs last.
    await app.page.setContent('<div class="px-pane"><section data-part="your-review"><div class="px-b-comment"></div></section></div>')
    expect(await theColumn(), 'what the column holds, read at once').toEqual({ collecting: true, comments: 1, send: '', said: '' })
  }, 60_000)
})
