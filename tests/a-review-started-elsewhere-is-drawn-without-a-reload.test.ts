// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REVIEW STARTED ELSEWHERE IS DRAWN WITHOUT A RELOAD, AND LEAVING A PAGE ASKS ABOUT IT FROM A FRESH READ.
 *
 * Problem PlYP52YPzs0R (wave 13x round 23). The frame's ring, the sidebar's Reviews dot, the review column and the
 * question asked on leaving a page all drew one shared read of the reviews collecting in the project
 * (`useTheCollectingList` in src/web/components/agent/ReviewBar.tsx). That read was kept for each count of changes, and
 * the count moved only when this tab wrote to a review. Measured on the round 22 code: a review started by a server call
 * was drawn in none of the four places after moves inside the app, and leaving the page that held its comment asked
 * nothing and went on. Only a reload drew it.
 *
 * The secretary's answer 4QA9FU7IMxbG decided how fresh each place must be:
 * - the question on leaving a page never decides from the list as last read. It reads the list fresh at the moment of
 *   leaving, and asks whenever a review holds comments on the page being left (the first case);
 * - the ring, the dot and the column draw a review started elsewhere by the next move inside the app at the latest
 *   (the second case), and also when the window comes back into focus (the third case);
 * - nothing polls on a timer.
 *
 * A FRESH READ THAT FAILED IS SAID, and the person is not moved on as if nothing were held (the fourth case). The
 * question then says the reviews could not be read, and offers Stay on this page and Leave anyway.
 *
 * Every review here is started by a call to the server, never by the page, so the page has written nothing that would
 * make it read again. Each case ends its review by the abandon door, so the next case starts with nothing collecting.
 * Everything is made up: the notes, their titles and the comments, in a Mole Office of the test's own.
 *
 * PICTURES. When `REVIEW_ELSEWHERE_SHOTS` names a directory, the page is photographed at 1440, 990, 660 and 390, light
 * and dark: the question asked from a fresh read, the ring, the dot and the column after a move, and the question when
 * the fresh read failed.
 */
import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { en } from '../src/shared/words/en.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const AS_THE_PERSON = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The heading of the question when the fresh read failed. Written out, not read from the word list, so this test is the criterion the word is checked against. */
const COULD_NOT_READ = "Mole Office could not read whether this page's review holds comments not sent"

/** The press that leaves anyway. Written out for the same reason. */
const LEAVE_ANYWAY = 'Leave anyway'

const SHOTS = process.env['REVIEW_ELSEWHERE_SHOTS']

/**
 * THE REVIEW'S OWN ANNOUNCEMENT, the hidden polite live region the review frame draws (src/web/components/agent/ReviewBar.tsx).
 * The shell's re-read word is a hidden polite live region too (src/web/components/ReReadStrip.tsx). It says
 * "Refreshing…" while any read that keeps its earlier answer is out, such as the column's comment count when the column
 * opens. It is not about a review, so it is left out. Read with it, a slow comment count made the check after opening
 * the column fail with " Refreshing…" (wave 13y round 147).
 */
const THE_REVIEWS_ANNOUNCEMENT = '.sr-only[aria-live="polite"]:not(.px-reread-what)'

let app: LiveApp

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

/** A review started on a note by a call to the server, holding one made-up comment on that note. Answers the review's id. */
async function aReviewStartedElsewhere(on: string): Promise<string> {
  const target = { target: { kind: 'record', recordId: on, workspaceId: 'default' }, place: { at: 'surface' } }
  const review = (await ask<{ review: { id: string } }>('POST', '/api/reviews', { entry: target })).review.id
  await ask('POST', '/api/records', { kind: 'message', title: 'Made-up comment', data: { body: 'A made-up comment, written by the test.', target } })
  return review
}

/** Ends a review without sending it, so the next case starts with nothing collecting. */
async function abandon(review: string): Promise<void> {
  await ask('POST', `/api/reviews/${review}/abandon`)
}

/**
 * Opens a note as a new load of the page, so the list of collecting reviews is read now, while nothing collects, and
 * waits until it has been read.
 */
async function openFresh(note: string): Promise<void> {
  await app.page.goto(`${app.site}/#/r/${note}`)
  const read = app.page.waitForResponse((reply) => reply.url().includes('/api/reviews?state=collecting'), { timeout: 30_000 })
  await app.page.reload()
  await read
  await waitForThePage(app.page)
}

/** Opens or shuts the review column with the sidebar's Reviews control. */
async function column(open: boolean): Promise<void> {
  const press = app.page.locator('.px-review-switch')
  if ((await press.getAttribute('aria-pressed')) !== String(open)) await press.click()
  if (open) await app.page.locator('.px-pane').waitFor({ timeout: 20_000 })
  else await app.page.locator('.px-pane').waitFor({ state: 'detached', timeout: 20_000 })
}

/** What the ring, the dot, the announcement and the column's head draw now. */
async function theFourPlaces(): Promise<{ ring: number; dot: number; announced: string; columnSays: string }> {
  const page = app.page
  return {
    ring: await page.locator('.px-strip-ring').count(),
    dot: await page.locator('.px-review-switch .px-review-dot[data-on="1"]').count(),
    announced: (await page.locator(THE_REVIEWS_ANNOUNCEMENT).allTextContents()).join(' '),
    columnSays: (await page.locator('.px-pane .px-pane-count').count()) === 0 ? '' : ((await page.locator('.px-pane .px-pane-count').first().textContent()) ?? ''),
  }
}

/** What the four places draw once a review is drawn, about the note named. */
function drawnAbout(title: string) {
  return {
    ring: 1,
    dot: 1,
    announced: en['review.pane.announce'].replace('{subject}', `Note “${title}”`),
    columnSays: en['review.pane.listCountWithComments']
      .replace('{state}', 'Collecting')
      .replace('{subject}', `Note “${title}”`)
      .replace('{comments}', en['review.pane.count.comments'].one.replace('{n}', '1')),
  }
}

/** Waits until the four places draw what is expected, and answers what they drew last. */
async function waitForTheFourPlaces(expected: ReturnType<typeof drawnAbout>): Promise<Awaited<ReturnType<typeof theFourPlaces>>> {
  let now = await theFourPlaces()
  const until = Date.now() + 15_000
  while (Date.now() < until && JSON.stringify(now) !== JSON.stringify(expected)) {
    await app.page.waitForTimeout(250)
    now = await theFourPlaces()
  }
  return now
}

/** Photographs the window at the four widths, in both themes, and puts the window back as it was. */
async function photograph(name: string): Promise<void> {
  if (SHOTS === undefined || SHOTS === '') return
  mkdirSync(SHOTS, { recursive: true })
  for (const width of [1440, 990, 660, 390]) {
    for (const theme of ['light', 'dark'] as const) {
      await app.page.setViewportSize({ width, height: 1000 })
      await app.page.emulateMedia({ colorScheme: theme })
      await app.page.waitForTimeout(400)
      await app.page.screenshot({ path: `${SHOTS}/${name}-${String(width)}-${theme}.png` })
    }
  }
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  await app.page.emulateMedia({ colorScheme: 'light' })
}

function question() {
  return app.page.locator('[data-part="leave-question"]')
}

/** Leaves the page by a change of the address's hash, the app's own way of moving. */
async function leaveFor(hash: string): Promise<void> {
  await app.page.evaluate((to) => {
    location.hash = to
  }, hash)
}

beforeAll(async () => {
  app = await liveApp({ name: 'review-started-elsewhere', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: en['g4.pairing.press'], exact: true }).click()
  await app.page.getByText(en['g4.pairing.paired'], { exact: true }).waitFor()
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('a review started elsewhere, while the page stays loaded', () => {
  it('leaving the page that holds its comment asks Send, Keep or Discard, from a read made at the moment of leaving', async () => {
    const title = 'Made-up kiln note, left'
    const note = await aNote(title)
    await openFresh(note)
    const review = await aReviewStartedElsewhere(note)
    try {
      await leaveFor('#/records')
      await question().waitFor({ timeout: 15_000 })
      await question().getByText(en['review.leave.count'].one.replace('{n}', '1'), { exact: true }).waitFor()
      expect(app.page.url(), 'the address is the page the question asks about').toContain(`#/r/${note}`)
      // THE PAGE BEHIND THE QUESTION IS STILL THE PAGE IT ASKS ABOUT.
      await app.page.getByText(title).first().waitFor({ timeout: 5_000 })
      expect(await app.page.getByRole('heading', { name: 'All records', exact: true }).count(), 'the page behind the question is the one being left').toBe(0)
      await photograph('leave-question-fresh-read')
      await question().getByRole('button', { name: en['review.leave.stay'], exact: true }).click()
      await question().waitFor({ state: 'detached' })
      expect(app.page.url(), 'Stay keeps the person on the page').toContain(`#/r/${note}`)
    } finally {
      await abandon(review)
    }
  }, 180_000)

  it('the next move inside the app draws it in the frame, on the sidebar and in the column', async () => {
    const here = await aNote('Made-up glaze note, stood on')
    const next = await aNote('Made-up shelf note, moved to')
    const title = 'Made-up firing note, reviewed elsewhere'
    const elsewhere = await aNote(title)
    await openFresh(here)
    await column(true)
    expect(await theFourPlaces(), 'nothing is collecting when the page is loaded').toEqual({ ring: 0, dot: 0, announced: '', columnSays: '' })
    const review = await aReviewStartedElsewhere(elsewhere)
    try {
      await leaveFor(`#/r/${next}`)
      await waitForThePage(app.page)
      expect(app.page.url(), 'the page held no comment, so the move went on').toContain(`#/r/${next}`)
      expect(await waitForTheFourPlaces(drawnAbout(title)), 'drawn by the move, with no reload').toEqual(drawnAbout(title))
      await photograph('drawn-after-a-move')
    } finally {
      await abandon(review)
      await column(false)
    }
  }, 180_000)

  it('the window coming back into focus draws it, with no move', async () => {
    const here = await aNote('Made-up clay note, stood on')
    const title = 'Made-up kiln log, reviewed elsewhere'
    const elsewhere = await aNote(title)
    await openFresh(here)
    await column(true)
    expect(await theFourPlaces(), 'nothing is collecting when the page is loaded').toEqual({ ring: 0, dot: 0, announced: '', columnSays: '' })
    const review = await aReviewStartedElsewhere(elsewhere)
    try {
      await app.page.evaluate(() => window.dispatchEvent(new Event('focus')))
      expect(await waitForTheFourPlaces(drawnAbout(title)), 'drawn when the window came back into focus').toEqual(drawnAbout(title))
      expect(app.page.url(), 'nothing moved').toContain(`#/r/${here}`)
    } finally {
      await abandon(review)
      await column(false)
    }
  }, 180_000)

  it('a fresh read that fails at leaving is said, and the person chooses to stay or to leave anyway', async () => {
    const title = 'Made-up kiln note, unread'
    const note = await aNote(title)
    await openFresh(note)
    const review = await aReviewStartedElsewhere(note)
    await app.page.route('**/api/reviews?state=collecting*', (route) => route.abort('failed'))
    try {
      await leaveFor('#/records')
      await question().waitFor({ timeout: 15_000 })
      await question().getByRole('heading', { name: COULD_NOT_READ, exact: true }).waitFor({ timeout: 5_000 })
      await question().getByText(en['review.pane.list.failed'], { exact: true }).waitFor({ timeout: 5_000 })
      expect(app.page.url(), 'a read that failed does not move the person on').toContain(`#/r/${note}`)
      await app.page.getByText(title).first().waitFor({ timeout: 5_000 })
      await photograph('leave-question-read-failed')
      await question().getByRole('button', { name: en['review.leave.stay'], exact: true }).click()
      await question().waitFor({ state: 'detached' })
      expect(app.page.url(), 'Stay keeps the person on the page').toContain(`#/r/${note}`)

      await leaveFor('#/records')
      await question().getByRole('button', { name: LEAVE_ANYWAY, exact: true }).click({ timeout: 15_000 })
      await app.page.waitForURL(/#\/records/, { timeout: 15_000 })
      await waitForThePage(app.page)
      await app.page.getByRole('heading', { name: 'All records', exact: true }).waitFor({ timeout: 15_000 })
      expect(await question().count(), 'Leave anyway leaves, and asks nothing more').toBe(0)
    } finally {
      await app.page.unroute('**/api/reviews?state=collecting*')
      await abandon(review)
    }
  }, 180_000)
})
