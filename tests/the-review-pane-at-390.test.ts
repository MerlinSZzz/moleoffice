// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW PANE ON A PHONE, AND THE THREE OTHER THINGS THE PANE SAID THAT WERE NOT TRUE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A BROWSER, AND WHY AT 390
 * ---------------------------------------------------------------------------------------
 *
 * Every defect pinned here passed the type checker, passed the suite, and was visible the moment
 * somebody opened the product. The worst of them only happened at 390: the pane counted the
 * comments in a review at the top and then drew none of them, because the scrolling list inside it
 * was given a height of 19 pixels with 501 pixels of comments in it. That is
 * design/UX-CONTRACT.md's clause by name — *the value works in one view and disappears from the
 * other* — and the phone is the size the owner reads on when they are away from the desk.
 *
 * The servers come from `liveApp` in tests/helpers.ts. Nothing here touches ./data/panelx.db.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE THREE RIGHT-CLICKS PRESS THE HEADING, AND NOT THE CENTRE OF THE PAGE
 * ---------------------------------------------------------------------------------------
 *
 * They used to press `[data-target^="record/"]`, which is the whole-page article, so the click
 * landed on whatever sat at its CENTRE. That was never the record: it was whatever the page's
 * height happened to put there, and it worked only because nothing had changed that height.
 *
 * MEASURED, 13 September 2026, when criterion T2 added a folded panel to the rail. The article grew
 * 45 pixels, 977 to 1,022, so the centre moved from (844, 503) to (844, 525) — from 8 pixels clear
 * of the reading-level control to 15 pixels inside it. The press then hit `div.sb-level`, whose
 * target is `uiSurface/report.readas`, Mole Office's own furniture and not the record, and the
 * composer rightly said the review did not reach that target. Removing the new panel from the DOM
 * restored the height, the centre, the target and the sentence, which is what proved the cause.
 *
 * So the aim is now the record's own heading. It is the record whatever the page's height is, and
 * the next panel anybody adds to this rail will not move it.
 */

import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

/** Waits until `read` answers something `done` accepts, or the deadline passes, and answers the last read. */
async function waitUntil<T>(read: () => T | Promise<T>, done: (value: T) => boolean, ms = 20_000): Promise<T> {
  const until = Date.now() + ms
  let value = await read()
  while (!done(value) && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 50))
    value = await read()
  }
  return value
}

/** Waits until the local clock shows a later second, so two stamps can be told apart. */
async function waitForTheNextSecond(): Promise<void> {
  const second = Math.floor(Date.now() / 1000)
  await waitUntil(() => Math.floor(Date.now() / 1000), (now) => now > second, 5_000)
}

const REPORT = 'What the gripper did on Tuesday'
const ELSEWHERE = 'What the gripper did on Wednesday'
const NO_REVIEW_HERE = 'What the gripper did on Thursday'
const COMMENTS = [
  'These two numbers disagree and the paragraph does not say which is right.',
  'The second run is missing from the table entirely.',
  'Say what the gripper was holding when it let go.',
]
const WRITTEN_WITH_THE_COLUMN_CLOSED = 'Written while the review column was closed.'

let app: LiveApp
let apiPort: number
let webPort: number
let page: Page
let reportId: string
let elsewhereId: string
/** A record no collecting review reaches. The composer has to say so, and mean it. */
let noReviewHereId: string
/** The review collecting on the report. */
let reviewHere: string
/** A second review, started a second later, so two rows in the list have to be told apart. */
let reviewThere: string

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`http://127.0.0.1:${apiPort}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as Record<string, unknown>
}

async function get(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`http://127.0.0.1:${apiPort}${path}`)
  if (!res.ok) throw new Error(`GET ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as Record<string, unknown>
}

const onRecord = (recordId: string) => ({ target: { kind: 'record', recordId, workspaceId: 'default' } })

/**
 * PUT THE COLUMN WHERE THE TEST WANTS IT AND RELOAD.
 *
 * The stored word is the one `stored()` in src/web/lib/review.ts writes: whether the column is
 * open, which review it is drawing, and which one is collecting.
 */
async function browserRemembers(word: string, address: string): Promise<void> {
  // THE PAGE IS ALREADY ON THIS SITE from the load before, so the stored word is written in place and the page loads
  // once with it, rather than loading, storing and loading again.
  await page.evaluate((remembered) => {
    window.localStorage.setItem('mole-office.review', remembered)
  }, word)
  // BLANK FIRST, so the address below is a load of the app and not a change of hash on the page already open,
  // which would not read the stored word at all.
  await page.goto('about:blank')
  await page.goto(`http://127.0.0.1:${webPort}/${address}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('.px-review-switch').waitFor({ state: 'attached', timeout: 60_000 })
  await page.locator('.px-pane').waitFor({ timeout: 60_000 })
}

/**
 * OPENS "MORE ABOUT THIS REVIEW" IF IT IS SHUT. Since wave 13r round 15 a collecting review is drawn in shape B: your
 * review, who it goes to and Send, with the whole pane behind More.
 */
async function openMore(): Promise<void> {
  await showTheComments()
  const more = page.locator('details.px-b-more')
  await more.waitFor({ timeout: 30_000 })
  if (!(await more.evaluate((el) => (el as HTMLDetailsElement).open))) await more.locator('summary').click()
  await page.locator('.px-b-more-body').waitFor({ timeout: 30_000 })
}

/** Leaving a page whose review holds comments not sent asks what to do (wave 13r round 15). Keep changes nothing. */
async function keepIfAsked(): Promise<void> {
  const question = page.locator('[data-part="leave-question"]')
  await question.waitFor({ timeout: 15_000 })
  await question.getByRole('button', { name: 'Keep', exact: true }).click()
  await question.waitFor({ state: 'detached' })
}

/** The tray's Show comments press opens the list. The old shape B bar had an Open press in its place. */
async function showTheComments(): Promise<void> {
  const bar = page.locator('.px-b-bar')
  if ((await bar.count()) === 0) return
  const show = bar.getByRole('button', { name: 'Show comments', exact: true })
  if ((await show.count()) > 0 && (await show.isVisible())) await show.click()
}

/**
 * WHAT THE PANE ACTUALLY DRAWS, rather than what is in its markup.
 *
 * A row is counted only when no scrolling box between it and the pane clips it and it is inside
 * the window. That distinction is the whole test: the rows were in the document the whole time.
 * The rows are shape B's list of your review's comments (wave 13r round 15), which is what a
 * collecting review draws.
 */
const whatThePaneDraws = () =>
  page.evaluate(() => {
    const pane = document.querySelector('.px-pane')
    const list = document.querySelector('.px-b-list')
    const rows = [...document.querySelectorAll('.px-b-list .px-b-comment')]
    const clipped = (row: Element) => {
      const b = row.getBoundingClientRect()
      if (b.height === 0) return true
      let el: Element | null = row
      while (el !== null) {
        const box = el.getBoundingClientRect()
        if (b.top < box.top - 1 || b.bottom > box.bottom + 1) {
          if (window.getComputedStyle(el).overflowY !== 'visible') return true
        }
        if (el === pane) break
        el = el.parentElement
      }
      return b.top >= window.innerHeight || b.bottom <= 0
    }
    const title = document.querySelector('h1')
    return {
      listHeight: list === null ? 0 : Math.round(list.getBoundingClientRect().height),
      rowsDrawn: rows.filter((row) => !clipped(row)).length,
      rowsInTheReview: rows.length,
      recipientLinesInTheRows: document.querySelectorAll('.px-b-list .px-b-comment .px-comment-recipient').length,
      reasonsInTheRows: document.querySelectorAll('.px-b-list .px-b-comment [data-part="delivery-recovery"]').length,
      pageTitle: title === null ? null : title.textContent,
      pageTitleTop: title === null ? null : Math.round(title.getBoundingClientRect().top),
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      windowHeight: window.innerHeight,
    }
  })

beforeAll(async () => {
  app = await liveApp({ name: 'pane390', viewport: { width: 390, height: 844 } })
  apiPort = app.apiPort
  webPort = app.webPort
  page = app.page
  await page.goto(app.site, { timeout: 60_000 })
  await waitForThePage(page, 60_000)

  const made = (await post('/api/records', {
    kind: 'report',
    title: REPORT,
    summary: 'One run in three dropped the part.',
    data: {
      date: '2026-08-18',
      blocks: [{ id: 'b-prose', type: 'text', text: 'The gripper let go of the part on every run.' }],
    },
  })) as { record: { id: string } }
  reportId = made.record.id

  const other = (await post('/api/records', {
    kind: 'report',
    title: ELSEWHERE,
    summary: 'Two runs in three dropped the part.',
    data: { date: '2026-08-19', blocks: [{ id: 'b-prose', type: 'text', text: 'It held every time.' }] },
  })) as { record: { id: string } }
  elsewhereId = other.record.id

  // A THIRD RECORD, AND NO REVIEW IS EVER STARTED ON IT. Both reviews below reach the record they
  // were started from, so neither of those is a place where nothing collects. Until 21 August 2026
  // this test used the second record for that, and it passed only because the composer was reading
  // the review this browser remembered instead of asking Mole Office which reviews reach here.
  const third = (await post('/api/records', {
    kind: 'report',
    title: NO_REVIEW_HERE,
    summary: 'Nobody watched.',
    data: { date: '2026-08-20', blocks: [{ id: 'b-prose', type: 'text', text: 'The run was not recorded.' }] },
  })) as { record: { id: string } }
  noReviewHereId = third.record.id

  const here = (await post('/api/reviews', { entry: onRecord(reportId) })) as { review: { id: string } }
  reviewHere = here.review.id
  // A LATER SECOND BETWEEN THEM. Mole Office stamps to the second, and two reviews started inside one
  // second are two rows Mole Office itself cannot order.
  await waitForTheNextSecond()
  const there = (await post('/api/reviews', { entry: onRecord(elsewhereId) })) as { review: { id: string } }
  reviewThere = there.review.id

  // AND A LATER SECOND BEFORE THE COMMENTS, so Mole Office can say they were written after the press.
  await waitForTheNextSecond()
  for (const words of COMMENTS) {
    await post('/api/records', {
      kind: 'annotation',
      title: words.slice(0, 40),
      data: { body: words, context: onRecord(reportId) },
    })
  }
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the review pane on a phone', () => {
  /**
   * MEASURED BEFORE THE FIX, in Chromium at 390x844: the band was 279px, the scrolling list inside
   * it was 19px tall with 501px of comments in it, and 0 of 4 rows were drawn. The heading above
   * them read "4 comments, 1 sent."
   */
  it('draws the comments it says it holds', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await browserRemembers(`open|${reviewHere}|default|${reviewHere}|default`, `#/r/${reportId}`)
    // ON A PHONE SHAPE B IS A BAR AT THE WINDOW'S FOOT, and its list opens on the bar's own press.
    await page.locator('.px-b-bar').getByRole('button', { name: 'Show comments', exact: true }).click()
    // THE SEND PLAN READ FIRST. Until it is, each row says who it is for; once it is, a comment that cannot go stops
    // saying so, and the rows are drawn as they stay.
    const drawn = await waitUntil(
      whatThePaneDraws,
      (now) => now.rowsInTheReview === COMMENTS.length && now.listHeight > 100 && now.recipientLinesInTheRows === 0,
    )
    expect(drawn.rowsInTheReview, 'the review holds all three comments').toBe(COMMENTS.length)
    expect(drawn.recipientLinesInTheRows, 'the send plan was read').toBe(0)
    expect(drawn.listHeight, 'the list of comments has room to draw one').toBeGreaterThan(100)
    expect(drawn.rowsDrawn, 'comments are drawn, not only counted').toBeGreaterThanOrEqual(2)
    // SAID ONCE, OVER THE LIST. This review goes to nobody and so does every comment in it, so the line over the list
    // says why and holds the press that chooses. Said again under every comment, it made each row 211 pixels tall here
    // and one comment was drawn (19 November 2026).
    expect(drawn.reasonsInTheRows, 'no row repeats why the review cannot go').toBe(0)

    // AND THE READING IS STILL THERE. A band that solved this by taking the screen would have
    // moved the defect rather than fixed it.
    expect(drawn.pageTitle).toBe(REPORT)
    expect(drawn.pageTitleTop).toBeLessThan(drawn.windowHeight)
    expect(drawn.sideways, 'nothing scrolls sideways at 390').toBe(0)
  }, 180_000)

  /**
   * EACH PRESS ONCE. Wave 13r round 16: with the list open at 390, Change, Fold and Send
   * were each drawn twice, once on the bar and once where the column draws them.
   */
  it('shows Change, Fold and Send once each in the open list, and keeps them in view as it scrolls', async () => {
    const shown = await pressesShown()
    expect(shown, JSON.stringify(shown)).toEqual({ Change: 1, Hide: 1, Send: 1 })
    // A SHORT WINDOW, so the open list has more than it can show and has to scroll.
    await page.setViewportSize({ width: 390, height: 480 })
    await page.locator('.px-b-bar').waitFor({ timeout: 30_000 })
    // MORE IS OPENED FIRST, so the scroll reaches past the review's own rows into what More holds: the bar's parent
    // has to reach that far too, or the bar scrolls away with it.
    const more = page.locator('details.px-b-more')
    const wasOpen = await more.evaluate((el) => (el as HTMLDetailsElement).open)
    if (!wasOpen) await more.locator('> summary').click()
    await page.locator('.px-b-more-body').waitFor({ timeout: 30_000 })
    const scrolled = await waitUntil(
      () =>
        page.evaluate(() => {
          const pane = document.querySelector<HTMLElement>('.px-pane')
          const bar = document.querySelector<HTMLElement>('.px-b-bar')
          const says = document.querySelector<HTMLElement>('.px-b-bar-says')
          if (pane === null || bar === null || says === null) return { scrolls: false, kept: false, at: 'not drawn' }
          pane.scrollTop = pane.scrollHeight
          const scrolls = pane.scrollTop > 0
          const top = pane.getBoundingClientRect().top
          const kept = bar.getBoundingClientRect().top >= top - 1 && says.getBoundingClientRect().top >= top - 1
          const at = JSON.stringify({ pane: top, bar: bar.getBoundingClientRect().top, says: says.getBoundingClientRect().top })
          pane.scrollTop = 0
          return { scrolls, kept, at }
        }),
      (measure) => measure.scrolls && measure.kept,
    )
    if (!wasOpen) await more.locator('> summary').click()
    await page.setViewportSize({ width: 390, height: 844 })
    expect(scrolled.scrolls, 'the open list did not scroll, so this measured nothing').toBe(true)
    expect(scrolled.kept, `the bar scrolled out of the open list: ${scrolled.at}`).toBe(true)
  }, 180_000)

  it('still draws them all at 1440', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await showTheComments()
    const drawn = await waitUntil(whatThePaneDraws, (now) => now.rowsDrawn === COMMENTS.length)
    expect(drawn.rowsDrawn).toBe(COMMENTS.length)
    expect(drawn.sideways).toBe(0)
    const shown = await waitUntil(pressesShown, (now) => JSON.stringify(now) === JSON.stringify({ Change: 1, Fold: 1, Send: 1 }))
    expect(shown, 'the tray lost one of its presses').toEqual({ Change: 1, Hide: 1, Send: 1 })
  }, 180_000)
})

/** How many of the tray's Change, Show/Hide comments and Send presses the pane shows, by the word each starts with. */
async function pressesShown(): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const counts: Record<string, number> = { Change: 0, Show: 0, Hide: 0, Send: 0 }
    for (const one of document.querySelectorAll<HTMLButtonElement>('.px-b button')) {
      if (!one.checkVisibility() || one.closest('.px-b-more') !== null) continue
      const word = (one.textContent ?? '').trim().split(/\s+/)[0] ?? ''
      if (word in counts) counts[word] = (counts[word] ?? 0) + 1
    }
    // A PRESS THAT IS NOT DRAWN IS NOT COUNTED, so the open bar does not also report a Show comments of nought.
    return Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0))
  })
}

describe('two reviews in the list', () => {
  /**
   * MEASURED BEFORE THE FIX: two reviews of two different records, started a second apart, both
   * drew "Collecting — Record / just now". Identical, character for character.
   */
  it('are told apart', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await browserRemembers('open||||', `#/r/${reportId}`)
    await waitUntil(() => page.locator('.px-pane .px-rev-go').count(), (n) => n === 2)
    const rows = await page.locator('.px-pane .px-rev-go').allInnerTexts()
    expect(rows.length).toBe(2)
    const [first, second] = rows
    expect(first).not.toBe(second)
    expect(first).toContain('Started ')
    expect(second).toContain('Started ')
    expect(reviewThere).not.toBe(reviewHere)
  }, 180_000)
})

describe('what the composer says about joining a review', () => {
  /**
   * MEASURED BEFORE THE FIX. A review was collecting on this report and the column was closed. The
   * composer offered "Send" and "Write it down and keep it", and after the press it said the
   * comment was "kept with your reports and notes, and a review can send it later". Then
   * `GET /api/reviews/:id` came back with that comment as a member of the review.
   *
   * The browser had made "is the column open" a condition of membership. Mole Office has no such rule.
   *
   * WHERE THAT DEFECT WOULD SHOW NOW, AND SO WHAT THIS CASE READS. The defect was `leaveReview` in
   * src/web/lib/review.ts forgetting which review was collecting when the column closed. The
   * composer cannot show it any more: since criterion W4 it reads no review state of this browser's,
   * and it sends the same request whatever the column is doing. Since wave 13x round 22 it asks
   * Mole Office whether a review collects what the comment is about, and offers Add to review
   * where one does; it still asks nothing of the column. The server's membership
   * list cannot show it either, because the browser sends it nothing about a review. What the browser
   * still holds is its note of which review is collecting, in its store under `mole-office.review`.
   * So this case reads that note: it names the review before the column closes, still names it
   * after, and still names it after a reload.
   *
   * IT USED TO READ THE NOTE THROUGH THE DOT on the Reviews switch, which was drawn from it. Since
   * 30 September 2026 the dot asks Mole Office instead, so it would stay lit
   * here with the note forgotten, and the note is read where it is kept. The dot is still read: a
   * review really is collecting here, so it must be lit throughout.
   *
   * THE MUTATIONS THAT TURN IT RED, each after a control run and each put back:
   *   `leaveReview` sets `on: false, reviewId: null, reviewProjectId: null` → red at the note after
   *     the column closes.
   *   `readWord` answers null for a five-part word that begins `shut` → `restore` clears the note it
   *     cannot read, and it is red at the note after the reload.
   */
  it('files a comment with the column closed, and the collecting review takes it', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    // THE COLUMN IS CLOSED BY PRESSING THE CONTROL A PERSON PRESSES, not by writing the closed
    // state into this browser's memory. The press is the thing that used to drop the review.
    await browserRemembers(`open|${reviewHere}|default|${reviewHere}|default`, `#/r/${reportId}`)
    expect(await page.locator('.px-pane').count(), 'the column is open to start with').toBe(1)
    // THE DOT ASKS MOLE OFFICE, so it is waited for rather than read once.
    const dotIsLit = async (): Promise<boolean> =>
      page
        .waitForFunction(
          () => document.querySelector('.px-review-switch .px-review-dot')?.getAttribute('data-on') === '1',
          undefined,
          { timeout: 10_000 },
        )
        .then(
          () => true,
          () => false,
        )
    // THE NOTE THIS BROWSER KEEPS OF WHICH REVIEW IS COLLECTING: the fourth of the five parts.
    const noteNames = async (): Promise<string | null> =>
      page.evaluate(() => (window.localStorage.getItem('mole-office.review') ?? '').split('|')[3] ?? null)
    expect(await dotIsLit(), 'the Reviews switch does not say a review is collecting').toBe(true)
    expect(await noteNames(), 'this browser does not note the collecting review to start with').toBe(reviewHere)
    await page.locator('.px-review-switch').click()
    await page.locator('.px-pane').waitFor({ state: 'detached', timeout: 15_000 })
    expect(await page.locator('.px-pane').count(), 'the column really is closed').toBe(0)
    await waitUntil(noteNames, (name) => name === reviewHere, 5_000)
    expect(await noteNames(), 'closing the column made this browser forget the collecting review').toBe(reviewHere)
    expect(await dotIsLit(), 'the Reviews switch stopped saying a review is collecting').toBe(true)
    // AND AFTER A RELOAD, which reads the review back from what this browser stored when it closed.
    await page.reload({ timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.locator('.px-review-switch').waitFor({ state: 'attached', timeout: 60_000 })
    await waitUntil(() => page.locator('.px-pane').count(), (n) => n === 0, 5_000)
    expect(await page.locator('.px-pane').count(), 'the reload opened the column again').toBe(0)
    expect(
      await noteNames(),
      'after a reload with the column closed, this browser no longer knows a review is collecting',
    ).toBe(reviewHere)
    expect(await dotIsLit(), 'after a reload the Reviews switch does not say a review is collecting').toBe(true)

    await page.locator('h1.rp-title').first().click({ button: 'right' })
    const said = await waitUntil(
      async () => (await page.locator('.px-talk').innerText()).replace(/\s+/g, ' '),
      (text) => text.includes('Add to review'),
    )
    // THE PANEL MAKES NO PROMISE ABOUT JOINING. Criterion W4 took the review press and its sentence
    // out: a comment is saved unsent, and whether a review collects it is derived from what the
    // comment is about and not from a press. The membership read below says whether it joined.
    // Since wave 13r round 15 the keep press was Start review, which joins the review collecting on the
    // page. Since wave 13x round 22 a review collecting here draws Add to review in its place, with
    // the column closed as with it open, because Mole Office is asked and the column is not.
    expect(said).toContain('Add to review')
    expect(said).not.toContain('Start review')

    await page.locator('.px-talk textarea').first().fill(WRITTEN_WITH_THE_COLUMN_CLOSED)
    await page.getByRole('button', { name: 'Add to review', exact: true }).click()

    const detail = await waitUntil(
      () => get(`/api/reviews/${reviewHere}`) as Promise<{ members: { body: string }[] }>,
      (now) => now.members.some((one) => one.body === WRITTEN_WITH_THE_COLUMN_CLOSED),
      15_000,
    )
    expect(
      detail.members.map((m) => m.body),
      'the comment written while the column was closed is not in the collecting review',
    ).toContain(WRITTEN_WITH_THE_COLUMN_CLOSED)
  }, 180_000)

  /**
   * THE OTHER DIRECTION. Neither collecting review reaches the third record, so a comment left
   * there joins nothing. Since wave 13x round 22 the panel offers Start review here and Add to
   * review where a review collects, because Mole Office answers for the target and not for the pane.
   * What decides membership is the target, and that is the same answer with the pane open or shut.
   */
  it('files a comment the same way where the review does not collect', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await browserRemembers(`open|${reviewHere}|default|${reviewHere}|default`, `#/r/${reportId}`)
    await page.locator('.px-review-switch').click()
    await page.locator('.px-pane').waitFor({ state: 'detached', timeout: 15_000 })
    await page.goto(`http://127.0.0.1:${webPort}/#/r/${noReviewHereId}`, {
      timeout: 60_000,
    })
    await keepIfAsked()
    await waitForThePage(page, 60_000)
    await page.locator('h1.rp-title').first().click({ button: 'right' })
    const said = await waitUntil(
      async () => (await page.locator('.px-talk').innerText()).replace(/\s+/g, ' '),
      (text) => text.includes('Start review'),
    )
    expect(said).toContain('Start review')
    expect(said).not.toContain('Add to review')
  }, 180_000)

  /**
   * PRESSING *Your reviews* IS READING A LIST, NOT STOPPING A REVIEW. It dropped the collecting
   * review too, for the same reason closing the column did: one field held both "which review is
   * the column drawing" and "which review is collecting".
   */
  it('goes on collecting while the column shows the list of reviews', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await browserRemembers(`open|${reviewHere}|default|${reviewHere}|default`, `#/r/${reportId}`)
    await openMore()
    await page.getByRole('button', { name: 'Your reviews' }).click()
    await waitUntil(() => page.locator('.px-pane .px-rev-go').count(), (n) => n === 2)
    expect(await page.locator('.px-pane .px-rev-go').count(), 'the column is on the list').toBe(2)

    await page.locator('h1.rp-title').first().click({ button: 'right' })
    const said = await waitUntil(
      async () => (await page.locator('.px-talk').innerText()).replace(/\s+/g, ' '),
      (text) => text.includes('Add to review'),
    )
    // THE SAME PRESS, WHATEVER THE COLUMN IS DRAWING. Criterion W4: the server decides membership
    // from the target, so the pane's own state changes nothing here. A review collects this report,
    // so since wave 13x round 22 that press is Add to review.
    expect(said).toContain('Add to review')
    expect(said).not.toContain('Start review')
  }, 180_000)
})

describe('a comment whose quoted words have gone', () => {
  /**
   * MEASURED BEFORE THE FIX, in Developer detail: three paragraphs one under the other, each
   * saying what the revision this comment was written against held. The server appends the
   * revision's own sentence to its reading, and the pane then drew that sentence again, and then
   * drew the old text a third time in its own words.
   */
  it('explains itself once in Developer detail, and once in Normal', async () => {
    const revs = (await get(`/api/records/${reportId}/revisions`)) as {
      revisions: { seq: number; contentHash: string }[]
    }
    const last = revs.revisions[revs.revisions.length - 1]
    if (last === undefined) throw new Error('the report has no revision to write a comment against')
    await post('/api/records', {
      kind: 'annotation',
      title: 'A comment whose words moved',
      data: {
        body: 'This sentence has since been rewritten.',
        context: {
          target: { kind: 'record', recordId: reportId, workspaceId: 'default' },
          span: { quote: 'a sentence that is not in the report at all', field: 'summary', from: 0, to: 42 },
          revision: { seq: last.seq, contentHash: last.contentHash },
        },
      },
    })

    // AND THE RECORD MOVES, WHICH IS WHAT THE COMMENT IS ABOUT. Added 3 September 2026 with
    // criterion A14b. The pane now draws the record's own summary beside each comment, because that
    // summary IS reading length 3 — and this record's summary was the very string this case counts,
    // so the count went from one to two without anything being explained twice. Changing the
    // summary makes the fixture say what it always meant: the words the comment was written against
    // are GONE, so the text held then and the text held now are two different strings and the count
    // is again a count of explanations.
    const moved = await fetch(`http://127.0.0.1:${String(apiPort)}/api/records/${reportId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ summary: 'Every run dropped the part, and the log says so.' }),
    })
    if (!moved.ok) throw new Error(`moving the summary answered ${String(moved.status)}: ${await moved.text()}`)

    /** How many times the old text this comment was written against is printed. */
    const timesTheOldTextIsPrinted = async (address: string): Promise<number> => {
      await page.setViewportSize({ width: 1440, height: 1000 })
      await browserRemembers(`open|${reviewHere}|default|${reviewHere}|default`, address)
      await openMore()
      // ONLY THE PRESSES NAMED MORE, each row's once and in order. A row's acts hold other presses too, such as Choose
      // another recipient, and a count of every press went stale as the send plan drew those under the rows. The pane
      // opens one row at a time, so each press of More turns the row open before it back to More.
      const rows = page.locator('.px-pane .px-rev-acts').getByRole('button', { name: /^(More|Less)$/ })
      const many = await rows.count()
      for (let i = 0; i < many; i += 1) {
        if ((await rows.nth(i).innerText()).trim() !== 'More') continue
        await rows.nth(i).click()
        const now = await waitUntil(async () => (await rows.nth(i).innerText()).trim(), (text) => text === 'Less', 10_000)
        if (now !== 'Less') throw new Error(`More on row ${String(i + 1)} of ${String(many)} did not open it: it reads ${now}`)
      }
      const said = (await page.locator('.px-pane').innerText()).replace(/\s+/g, ' ')
      return said.split('One run in three dropped the part.').length - 1
    }

    expect(await timesTheOldTextIsPrinted(`?mode=inspect#/r/${reportId}`)).toBe(1)
    expect(await timesTheOldTextIsPrinted(`#/r/${reportId}`)).toBe(1)
  }, 240_000)
})
