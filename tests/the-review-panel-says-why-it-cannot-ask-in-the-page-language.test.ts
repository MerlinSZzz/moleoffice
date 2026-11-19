// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW COLUMN'S "HAVE THESE COMMENTS READ" PANEL SAYS WHY MOLE OFFICE CANNOT WRITE THE QUESTION, IN THE PAGE'S
 * LANGUAGE, AND ITS HEADING WRAPS INSTEAD OF BEING CUT.
 *
 * The secretary's recorded review of wave 13n round 32, points 3 and 5: on a Chinese page the panel's refusal was
 * English ("There is nothing in review … that can be read"), and at 1440 its heading ran out of the column and was cut
 * ("…for this revie"). The refusal now carries a code, reviewNothingToRead, and the panel draws the code's sentence from
 * the word lists. The heading shrinks and wraps inside the box.
 *
 * WHAT THIS FILE PROVES:
 *   1. GET /api/reviews/<id>/organise refuses a review with nothing in it to read with 409, the code
 *      reviewNothingToRead, and the English sentence an agent reads.
 *   2. In a real browser, at 1440 and at 390, the panel's heading is drawn whole inside its box, in English and in
 *      Chinese, and the refusal is the code's sentence in the page's language, with no English word left on the
 *      Chinese page beyond "Mole Office".
 *   3. In developer mode the panel names no route, status or review id (a coded refusal says what failed in words),
 *      and the column draws what the "Not in it" reading does not read, and the line under a saved comment nobody is
 *      chosen for, in the page's language (the re-review of round 32, wave 13n round 33).
 *   4. With TEST_SHOTS set, the panel is photographed at 1440, 990, 660 and 390 in both looks, in English and in
 *      Chinese.
 *
 * THE OFFICE IS THIS TEST'S OWN. `liveApp` starts its own API and database. Every name here is made up.
 *
 * Three-run proofs, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/the-review-panel-says-why-it-cannot-ask-in-the-page-language.test.ts
 * - The refusal not coded: in src/server/lib/reviews.ts, `organiseRequest`, drop the code. Cases 1 and 2 go red.
 * - The panel not handed the code: in src/web/components/agent/ReviewBar.tsx, drop `fault={asked.fault}` from the
 *   ErrorNote. Case 2 goes red in Chinese.
 * - The heading that cannot shrink: in src/web/components/ui.tsx, give `.px-error-mark` `flex: none` again. Case 2
 *   goes red.
 */

import { afterAll, beforeAll, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { testShots } from './where-shots-go.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const FILER = { name: 'Synthetic gravel agent', handle: 'gravel-survey' }
const PANEL = '[data-part="have-them-read"]'

let app: LiveApp
let reportId = ''
let reviewId = ''
const shots = testShots('the-review-panel-says-why-it-cannot-ask')

async function post<T>(path: string, body: unknown, headers: Record<string, string> = PERSON): Promise<T> {
  const reply = await fetch(app.api + path, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return (await reply.json()) as T
}

/** The report's page with the review column open, in one language and look and at one width, at the panel. */
async function openThePanel(lang: 'en' | 'zh', width = 1440, look = 'light', mode: 'normal' | 'inspect' = 'normal') {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${lang}&look=${look}&mode=${mode}#/r/${reportId}`)
  await waitForThePage(app.page, 60_000)
  if (!(await app.page.locator('.px-pane').isVisible())) await app.page.locator('.px-review-switch').click()
  const error = app.page.locator(`${PANEL} .px-error`)
  await error.waitFor({ timeout: 30_000 })
  await error.scrollIntoViewIfNeeded()
  return error
}

beforeAll(async () => {
  app = await liveApp({ name: 'review-panel-page-language', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  await app.page.addInitScript(() => {
    const query = new URLSearchParams(location.search)
    localStorage.setItem('mole-office.preset.theme', query.get('look') ?? 'light')
  })
  await post('/api/records', { kind: 'agent', title: FILER.name, data: { handle: FILER.handle, runtime: 'claude-code', state: 'active' } })
  // THE PAGE IS THE PERSON'S OWN, so the review goes to nobody until somebody is chosen (wave 13r round 15: a review
  // goes to the agent that wrote its page), and the saved comment below has nobody chosen for it.
  const report = await post<{ record: { id: string } }>('/api/records', {
    kind: 'report', title: 'Synthetic report written by the person',
    data: { for: 'Robin Vale', date: '2026-10-02', blocks: [{ id: 'b-1', type: 'text', heading: 'Gravel', text: 'One place to look at.' }] },
  })
  reportId = report.record.id
  const words = 'Synthetic saved comment: is this gravel grade right?'
  await post('/api/records', {
    kind: 'message', title: words.slice(0, 40),
    data: { body: words, target: { target: { kind: 'record', recordId: reportId, workspaceId: 'default' }, place: { at: 'surface' } } },
  })
  // A REVIEW STARTED NOW TAKES IN THE COMMENTS KEPT BEFORE IT (wave 13r round 15), except one that another review
  // still collecting holds. So a project-wide review takes the saved comment in first, this page's review starts
  // while that one holds it and so holds nothing that can be read, and the project-wide one is then abandoned. An
  // abandoned review holds nothing back, so this page's review lists the comment as saved without sending.
  await new Promise((resolve) => setTimeout(resolve, 1_200))
  const entry = { target: { kind: 'record', recordId: reportId, workspaceId: 'default' }, place: { at: 'surface' } }
  const wide = await post<{ review: { id: string } }>('/api/reviews', { entry, reach: 'global' })
  const here = await post<{ review: { id: string }; started: boolean }>('/api/reviews', { entry })
  expect(here.started).toBe(true)
  const { 'content-type': _json, ...noBody } = PERSON
  const abandoned = await fetch(`${app.api}/api/reviews/${encodeURIComponent(wide.review.id)}/abandon`, { method: 'POST', headers: noBody })
  expect(abandoned.status, await abandoned.text()).toBe(200)
  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: 'Pair this browser', exact: true }).click()
  await app.page.getByText('This browser is paired.', { exact: true }).waitFor()
  await app.page.goto(`${app.site}/#/r/${reportId}`)
  await waitForThePage(app.page)
  if (!(await app.page.locator('.px-pane').isVisible())) await app.page.locator('.px-review-switch').click()
  const pane = app.page.locator('.px-pane')
  const toTheList = pane.getByRole('button', { name: 'Your reviews', exact: true })
  if ((await toTheList.count()) > 0) await toTheList.click()
  // COMING BACK TO IT: this page's review is already collecting, so the press resumes it and starts nothing.
  await pane.getByRole('button', { name: 'Start a review here', exact: true }).click()
  // THE TRAY KEEPS THE SAVED COMMENTS AND FINISH COLLECTING BEHIND SHOW COMMENTS, THEN MORE ABOUT THIS REVIEW.
  const bar = pane.locator('[data-part="your-review-bar"]')
  await bar.waitFor({ timeout: 30_000 })
  const showComments = bar.getByRole('button', { name: 'Show comments', exact: true })
  if ((await showComments.count()) > 0) await showComments.click()
  const more = pane.locator('details.px-b-more')
  await more.waitFor({ timeout: 20_000 })
  if ((await more.getAttribute('open')) === null) await more.locator('summary').click()
  await app.page.locator('[data-part="saved-not-sent"]').waitFor({ timeout: 20_000 })
  await pane.getByRole('button', { name: 'Finish collecting', exact: true }).click()
  const finished = app.page.waitForResponse((response) => response.url().includes('/finish-collecting'))
  await pane.locator('.px-pane-confirm').getByRole('button').last().click()
  const answer = await finished
  expect(answer.status()).toBe(200)
  reviewId = decodeURIComponent(/\/api\/reviews\/([^/]+)\/finish-collecting/.exec(answer.url())?.[1] ?? '')
  expect(reviewId.length, answer.url()).toBeGreaterThan(0)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

it('refuses the question for a review with nothing to read, with a code and the English an agent reads', async () => {
  const reply = await fetch(`${app.api}/api/reviews/${encodeURIComponent(reviewId)}/organise`, { headers: PERSON })
  expect(reply.status).toBe(409)
  const said = (await reply.json()) as { error: string; code?: string }
  expect(said.code).toBe('reviewNothingToRead')
  expect(said.error).toContain(`There is nothing in review ${reviewId} that can be read.`)
}, 60_000)

it('draws the heading whole and the refusal in the page language, at 1440 and at 390', async () => {
  for (const lang of ['en', 'zh'] as const) {
    const words = createI18n(lang).t
    for (const width of [1440, 390]) {
      const error = await openThePanel(lang, width)
      const heading = error.locator('.px-error-mark strong')
      expect(await heading.innerText()).toBe(words('review.pane.read.cannotWrite'))
      // WHOLE INSIDE ITS BOX: the heading's right edge is inside the box's, and nothing of it is hidden.
      const measured = await error.evaluate((box) => {
        const strong = box.querySelector('.px-error-mark strong') as HTMLElement
        const mark = box.querySelector('.px-error-mark') as HTMLElement
        return {
          headingRight: strong.getBoundingClientRect().right,
          markRight: mark.getBoundingClientRect().right,
          boxRight: box.getBoundingClientRect().right,
          clipped: strong.scrollWidth > strong.clientWidth + 1,
        }
      })
      expect(measured.headingRight, `${lang} ${String(width)}: ${JSON.stringify(measured)}`).toBeLessThanOrEqual(measured.boxRight)
      expect(measured.markRight, `${lang} ${String(width)}: ${JSON.stringify(measured)}`).toBeLessThanOrEqual(measured.boxRight)
      expect(measured.clipped).toBe(false)
      const message = (await error.locator('.px-error-msg').innerText()).trim()
      expect(message).toBe(words('server.reviewNothingToRead'))
      if (lang === 'zh') expect(message.replaceAll('Mole Office', ''), message).not.toMatch(/[A-Za-z]/)
    }
  }
}, 180_000)

/** What the "Not in it" reading does not read, as developer mode draws it under that heading, in each language. */
const NOT_IN_LIMITS = {
  en: [
    'Only comments filed as their own records are read. A review carried forward from round seven also holds comments that live in a conversation, and this reading does not walk those.',
    'A comment is only reported as being in another review when that review has finished collecting and its membership is written down. A review still collecting works its membership out on every read, and this does not run that for every review in the project.',
    'An abandoned review is not read as another review. It holds a written-down membership so that what it held stops moving, and nothing came of it, so its comments are reported under their own reason here.',
  ],
  zh: [
    '这里只读作为独立记录保存的评论。从第七轮沿用下来的评审还有存在对话里的评论，这次读取不会去找那些评论。',
    '只有当另一次评审已经结束收集、并且记下了它包含哪些评论时，这里才会说一条评论在那次评审里。还在收集的评审每次读取时都重新算出它包含哪些评论，这里不会为项目里的每一次评审都这样算一遍。',
    '已放弃的评审不算作另一次评审。它记下了包含哪些评论，好让这些内容不再变动，但它没有任何结果，所以它的评论在这里按各自的原因列出。',
  ],
} as const

/** The line under the saved comment nobody is chosen for, in "Where each comment would go", in each language. */
const SAVED_WITH_NOBODY = {
  en: 'No recipient chosen for this saved comment, so sending the review would leave it behind. Choose one on its row, then send the review.',
  zh: '这条已保存的评论还没有选择发给谁，所以发出评审时它会被留下。请先在它那一行选择发给谁，再发出评审。',
} as const

// THE RE-REVIEW OF ROUND 32 (wave 13n round 33): in developer mode the panel showed "/api/reviews/<id>/organise: HTTP 409"
// under the refusal, and on a Chinese page the column still drew English under "Not in it" and under the saved comment.
it('in developer mode names no route, status or review id, and draws the column\'s own sentences in the page\'s language', async () => {
  for (const lang of ['en', 'zh'] as const) {
    const words = createI18n(lang).t
    const error = await openThePanel(lang, 1440, 'light', 'inspect')
    expect((await error.locator('.px-error-msg').innerText()).trim()).toBe(words('server.reviewNothingToRead'))
    const panel = (await app.page.locator(PANEL).innerText()).trim()
    for (const inside of ['/api/', reviewId, '409', 'HTTP']) expect(panel, `the panel says "${inside}"`).not.toContain(inside)
    const notIn = (await app.page.locator('section.px-pane-group[data-in="0"] p.px-pane-note').allInnerTexts()).map((one) => one.trim())
    expect(notIn).toEqual([...NOT_IN_LIMITS[lang]])
    const says = (await app.page.locator('[data-part="send-the-review"] .px-send-says').allInnerTexts()).map((one) => one.trim())
    expect(says).toEqual([SAVED_WITH_NOBODY[lang]])
  }
}, 180_000)

it.skipIf(!process.env['TEST_SHOTS'])('photographs the panel at four widths in both looks, in English and in Chinese', async () => {
  for (const lang of ['en', 'zh'] as const) {
    for (const width of [1440, 990, 660, 390]) {
      for (const look of ['light', 'dark']) {
        await openThePanel(lang, width, look)
        expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${lang} ${String(width)} ${look}`).toBe(true)
        await app.page.screenshot({ path: `${shots}/have-them-read-${lang}-${String(width)}-${look}.png` })
        // AND IN DEVELOPER MODE, where the panel once added the route, the status and the review's id (wave 13n round 33).
        await openThePanel(lang, width, look, 'inspect')
        expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `developer ${lang} ${String(width)} ${look}`).toBe(true)
        await app.page.screenshot({ path: `${shots}/have-them-read-developer-${lang}-${String(width)}-${look}.png` })
      }
    }
  }
}, 900_000)
