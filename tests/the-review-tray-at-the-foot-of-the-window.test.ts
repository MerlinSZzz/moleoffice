// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW AS A TRAY AT THE FOOT OF THE WINDOW, AT EVERY WIDTH (wave 13y round 146, item 73a: option A
 * was chosen, and the supervisor's decisions of round 146 settle its details).
 *
 * 1. THE TRAY, CLOSED, AT 1440: fixed to the window's foot, from the sidebar's right edge to the window's right edge.
 *    The page keeps the width it had before the review started, and its foot is never under the tray. The row says
 *    "Your review · 1 comment · going to …", then Change, Show comments and Send review, and nothing else is shown.
 * 2. SHOW COMMENTS opens the list upward, no taller than 70 % of the window, and the press then reads Hide comments.
 * 3. EDIT opens a box with the comment's words in place, and the press reads Stop editing. Save stores the new words,
 *    the server holds them, and the list draws them.
 * 4. REMOVE takes the comment out at once, with no question. Its row reads Removed, with Undo, the count is 0, and
 *    Undo puts the comment back.
 * 5. SEND REVIEW sends it, and the tray stays at the foot. Its row says what Mole Office said about the send, the
 *    same sentence the sent review says under Show comments, with Show comments and Close. Close closes the panel.
 * 6. THE SETTING for a sent comment's mark: Hide them completely is the default, so a sent comment draws no circle
 *    and lights no words; Keep showing them draws the circle, which is marked as a sent one; Hide puts it away.
 * 7. AT 390 the tray is fixed to the foot from the window's left edge to its right edge, and the page keeps its width.
 * 10. THE COMMENT BOX HAS A PIN: pinned, it stays open while the person clicks elsewhere and selects and copies text
 *    there; unpinned it closes as it did before. While it holds words it is drawn as unsent, with its own word, and
 *    its mark in the page is the heavier, solid one.
 * 11. THE CHAT CONVERSATION STAYS READABLE AT 660 AND 390 while a review collects: the tray takes no width from it.
 * 12. THE UNSENT MARK ALWAYS SHOWS: with Keep showing them chosen, an unsent comment's mark is drawn, and with Hide
 *    them completely chosen the sent marks are gone and its mark still shows.
 *
 * Set W13Y_ITEM_73A_SHOTS to a folder outside the checkout, and W13Y_ITEM_73A_LOOK to light or dark, to photograph
 * each step at 1440, 990, 660 and 390 in that look, in English and in Chinese. One run takes one look, so each look is
 * taken in a test office of its own. Set W13Y_ITEM_73A_FILM to a folder to film the whole way at 1440 in light, from
 * the first right-click to the review sent and the setting changed. The ordinary run takes neither. Every record,
 * name and comment here is made up. Every picture says so above the page, and the film says so at the top of the
 * sidebar in every frame.
 *
 * MUTATIONS THIS ROUND, each after a green control and each restored. The proofs are on run 3Om17qf3ye0T, in the
 * supervisor's out/r153/proofs/ folder outside this checkout:
 *   - the pin's guard is removed, so a press elsewhere closes even a pinned box: case 10 goes red (use 45);
 *   - the sent-mark default is changed from hide to show: case 6 goes red (use 46);
 *   - the control and the restore are green (uses 43 and 47).
 * The case-level mutations an earlier draft listed (the tray rules inside the band query, Show comments' old word,
 * Save writing nothing, Remove asking nothing, the sent row not drawn, the mark layer leaving sent comments in) are
 * still the mutations of the same cases; this round re-ran the two above only.
 */
import { mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createI18n, type WordKey } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { goKeeping, liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { putThePageAt, toTheEndOfThePage } from './the-page-scroller.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS = (handle: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })
const WRITER = { name: 'Kiln Keeper', handle: 'kiln-keeper' }
const COMMENT = { en: 'Made-up comment: which shelf sagged?', zh: '编造的评论：哪一块搁板下沉了？' }
const EDITED = 'Made-up comment, edited: was it the left shelf?'
const MADE_UP = 'Made-up data — an invented office, not real office data'
const shots = process.env['W13Y_ITEM_73A_SHOTS']
/** The one look a picture run takes. */
const look = process.env['W13Y_ITEM_73A_LOOK']
const film = process.env['W13Y_ITEM_73A_FILM']

let app: LiveApp
let n = 0

/** The page's words, through the one reader. A key the word lists do not hold yet is named as it is. */
function wordsIn(lang: 'en' | 'zh') {
  const { t } = createI18n(lang)
  return (key: string, values?: Record<string, string | number>) => t(key as WordKey, values)
}
const en = wordsIn('en')

async function post<T>(path: string, body: unknown, headers: Record<string, string> = PERSON): Promise<T> {
  const reply = await fetch(app.api + path, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return (await reply.json()) as T
}

/** A made-up report the kiln agent wrote, so the review goes to it by default. */
async function aReport(): Promise<string> {
  n += 1
  const report = await post<{ record: { id: string } }>('/api/records', {
    kind: 'report', title: `Made-up kiln report ${String(n)}`,
    data: {
      for: 'Robin Vale', date: '2026-10-04',
      blocks: [
        { id: 'b-1', type: 'text', heading: 'What I found', text: 'The second firing held its temperature for the whole hour.' },
        { id: 'b-2', type: 'text', heading: 'What moved', text: 'The left shelf sagged by two millimetres between the firings.' },
      ],
    },
  }, AS(WRITER.handle))
  return report.record.id
}

async function openTheReport(page: Page, reportId: string, lang: 'en' | 'zh'): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=${lang}#/r/${reportId}`)
  await waitForThePage(page, 60_000)
  await page.locator('[data-text-field="data.blocks[#b-2].text"]').waitFor({ timeout: 30_000 })
}

/** Selects words of the second paragraph, right-clicks them and writes a comment in the box. */
async function writeAComment(page: Page, words: string): Promise<void> {
  const run = '[data-text-field="data.blocks[#b-2].text"]'
  const at = await page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel)
    if (el === null) throw new Error('the paragraph is not drawn')
    el.scrollIntoView({ block: 'center' })
    const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode() as Text
    const range = document.createRange()
    range.setStart(node, 4)
    range.setEnd(node, 14)
    const s = window.getSelection()
    s?.removeAllRanges()
    s?.addRange(range)
    const r = range.getClientRects()[0]
    if (r === undefined) throw new Error('the words have no box')
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  }, run)
  await page.mouse.click(at.x, at.y, { button: 'right' })
  await page.locator('.px-talk textarea').waitFor({ timeout: 20_000 })
  await page.locator('.px-talk textarea').fill(words)
}

/** Selects words of the first paragraph, beside a comment box that is already open, so a pinned box can be shown
 *  staying open while the person copies from another place. */
async function selectOtherWords(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-text-field="data.blocks[#b-1].text"]')
    if (el === null) throw new Error('the other paragraph is not drawn')
    const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode()
    if (node === null) throw new Error('the other paragraph has no words')
    const range = document.createRange()
    range.setStart(node, 4)
    range.setEnd(node, 14)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
  })
}

/** Start review in the box, and on a phone Back to reading, so the tray is what is left at the foot. */
async function startTheReview(page: Page, say: ReturnType<typeof wordsIn>, phone: boolean): Promise<void> {
  // THE BOX HAS SHOWN WHO IT WILL CARRY BEFORE START REVIEW IS PRESSED, so the review goes to the page's writer by
  // the box's choice on every run (the note in the-review-panel-in-shape-b-photographed-at-every-step.test.ts).
  await page.locator('.px-talk .px-talk-to-btn').getByText(WRITER.name, { exact: true }).waitFor({ timeout: 30_000 })
  await page.locator('.px-talk').getByRole('button', { name: say('talk.startReview'), exact: true }).click()
  await page.getByText(say('talk.state.reviewStarted'), { exact: true }).waitFor({ timeout: 30_000 })
  if (phone) await page.locator('.px-talk').getByRole('button', { name: say('talk.backToReading'), exact: true }).click()
  else await page.locator('.px-talk .px-talk-close').click()
  await page.locator('.px-talk').waitFor({ state: 'detached', timeout: 30_000 })
  // ATTACHED, NOT VISIBLE: where the row is, and whether it is shown, is what each case checks for itself.
  await page.locator('.px-pane [data-part="your-review-bar"]').waitFor({ state: 'attached', timeout: 30_000 })
}

const tray = (page: Page) => page.locator('.px-pane')
const row = (page: Page) => page.locator('.px-pane [data-part="your-review-bar"]')

/** The width the page is drawn at, as a number of pixels. */
async function pageWidth(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelector('.shell-main > .page')?.getBoundingClientRect().width ?? -1)
}

/** Where the tray is, against the window and the page's column beside the sidebar. */
async function whereTheTrayIs(page: Page) {
  const at = await page.evaluate(() => {
    const pane = document.querySelector<HTMLElement>('.px-pane')
    const body = document.querySelector<HTMLElement>('.shell-body')
    if (pane === null || body === null) return null
    const p = pane.getBoundingClientRect()
    return {
      position: getComputedStyle(pane).position,
      left: p.left, right: p.right, top: p.top, bottom: p.bottom,
      sidebarEdge: body.getBoundingClientRect().left,
      windowRight: document.documentElement.clientWidth,
      windowFoot: window.innerHeight,
    }
  })
  if (at === null) throw new Error('the tray or the page column is not drawn')
  return at
}

async function atTheFoot(page: Page, name: string): Promise<{ left: number; top: number; bottom: number }> {
  const at = await whereTheTrayIs(page)
  expect(at.position, `${name}: the tray is not held in the window`).toBe('fixed')
  expect(Math.abs(at.left - at.sidebarEdge), `${name}: the tray does not start at the sidebar's right edge`).toBeLessThanOrEqual(1)
  expect(Math.abs(at.right - at.windowRight), `${name}: the tray does not reach the window's right edge`).toBeLessThanOrEqual(1)
  expect(Math.abs(at.bottom - at.windowFoot), `${name}: the tray is not at the window's foot`).toBeLessThanOrEqual(1)
  return at
}

/** At the end of the page, the page's foot is above the tray's top. */
async function theFootIsClear(page: Page, name: string): Promise<void> {
  await toTheEndOfThePage(page)
  await page.waitForTimeout(300)
  const gap = await page.evaluate(() => {
    const foot = document.querySelector('.shell-main > .page')?.getBoundingClientRect().bottom
    const top = document.querySelector('.px-pane')?.getBoundingClientRect().top
    return foot === undefined || top === undefined ? null : top - foot
  })
  expect(gap, `${name}: the page's foot is under the tray`).not.toBeNull()
  expect(gap ?? -1, `${name}: the page's foot is under the tray`).toBeGreaterThanOrEqual(-1)
}

async function noSideways(page: Page, name: string): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name}: the page scrolls sideways`).toBe(true)
}

/** The circles drawn for comments on the page, and how many ranges of words are lit for them. */
async function marksDrawn(page: Page): Promise<{ circles: number; lit: number }> {
  return page.evaluate(() => {
    const registry = (CSS as unknown as { highlights?: Map<string, { size?: number }> }).highlights
    return {
      circles: document.querySelectorAll('.px-comment-circle').length,
      lit: registry?.get('mole-office-noted')?.size ?? 0,
    }
  })
}

/** Chooses one answer of the setting for a sent comment's mark, on the Settings page's Review marks panel. */
async function chooseSentMarks(page: Page, say: ReturnType<typeof wordsIn>, answer: 'show' | 'hide'): Promise<void> {
  // THE LANGUAGE IS IN THE ADDRESS, SO IT IS CARRIED TO THE SETTINGS PAGE. A goto without it draws the browser's language,
  // and a Chinese picture run then looked for a Chinese radio on an English page.
  const lang = new URL(page.url()).searchParams.get('lang') ?? 'en'
  await page.goto(`${app.site}/?lang=${lang}#/settings/review`)
  await waitForThePage(page, 60_000)
  const choice = page.getByRole('radio', { name: say(`review.sentMarks.${answer}`), exact: true })
  await choice.waitFor({ timeout: 30_000 })
  await choice.check()
  expect(await choice.isChecked()).toBe(true)
}

beforeAll(async () => {
  app = await liveApp({ name: 'review-tray', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  if (look !== undefined) {
    await app.page.addInitScript((theme) => localStorage.setItem('mole-office.preset.theme', theme), look)
  }
  await post<{ record: { id: string } }>('/api/records', { kind: 'agent', title: WRITER.name, data: { handle: WRITER.handle, runtime: 'claude-code', state: 'active' } })
  // THE WRITER HAS WRITTEN TO THE PERSON, so it is a contact.
  await post('/api/records', { kind: 'message', title: 'A note', data: { body: `${WRITER.name} has a made-up note.`, to: [{ kind: 'person', id: THE_PERSON }] } }, AS(WRITER.handle))
  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: 'Pair this browser', exact: true }).click()
  await app.page.getByText('This browser is paired.', { exact: true }).waitFor()
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

it('1 to 6. the tray at the foot at 1440: closed, open, edit, remove and undo, send, close, and the sent marks setting', async () => {
  const page = app.page
  await page.setViewportSize({ width: 1440, height: 1000 })
  const reportId = await aReport()
  await openTheReport(page, reportId, 'en')
  const before = await pageWidth(page)
  await writeAComment(page, COMMENT.en)
  await startTheReview(page, en, false)
  // THE COMMENT IS UNSENT, SO ITS MARK IS THE HEAVIER, SOLID ONE (not the dashed one a sent comment draws).
  await page.locator('.px-comment-circle[data-mark="unsent"]').first().waitFor({ timeout: 30_000 })

  // 1. CLOSED: at the foot, the page as wide as before, one row and nothing else.
  const closed = await atTheFoot(page, 'closed at 1440')
  expect(Math.abs((await pageWidth(page)) - before), 'the page moved aside for the review').toBeLessThanOrEqual(1)
  const says = await row(page).locator('.px-b-bar-says').innerText()
  expect(says.startsWith(`${en('review.b.yourReview')} · ${en('review.b.comments', { n: 1 })} · `), says).toBe(true)
  expect(says).toContain(WRITER.name)
  expect(await row(page).getByRole('button').allInnerTexts()).toEqual([en('review.b.change'), en('review.tray.show'), en('review.tray.send')])
  expect(await tray(page).locator('li.px-b-comment').isVisible(), 'the closed tray shows the list').toBe(false)
  expect(closed.bottom - closed.top, 'the closed tray is more than one row').toBeLessThan(80)
  await theFootIsClear(page, 'closed at 1440')
  await noSideways(page, 'closed at 1440')

  // 2. SHOW COMMENTS opens the list upward, and the press reads Hide comments.
  await row(page).getByRole('button', { name: en('review.tray.show'), exact: true }).click()
  const hide = row(page).getByRole('button', { name: en('review.tray.hide'), exact: true })
  await hide.waitFor({ timeout: 10_000 })
  expect(await hide.getAttribute('aria-expanded')).toBe('true')
  const comment = tray(page).locator('li.px-b-comment').first()
  await comment.waitFor({ state: 'visible', timeout: 10_000 })
  expect(await comment.innerText()).toContain(COMMENT.en)
  const open = await atTheFoot(page, 'open at 1440')
  expect(open.top, 'the list did not open upward').toBeLessThan(closed.top)
  expect(open.bottom - open.top, 'the open tray is taller than 70 % of the window').toBeLessThanOrEqual(700 + 1)

  // 3. EDIT, then Save: the words are in the box, the press reads Stop editing, and the new words are stored.
  await comment.getByRole('button', { name: en('review.pane.note.edit'), exact: true }).click()
  const box = comment.getByRole('textbox', { name: en('review.pane.note.saysLabel'), exact: true })
  await box.waitFor({ timeout: 10_000 })
  expect(await box.inputValue()).toBe(COMMENT.en)
  expect(await comment.getByRole('button', { name: en('review.pane.note.stopEditing'), exact: true }).count()).toBe(1)
  const commentId = await comment.getAttribute('data-comment')
  expect(commentId).not.toBeNull()
  await box.fill(EDITED)
  await comment.getByRole('button', { name: en('review.pane.note.save'), exact: true }).click()
  await tray(page).locator('li.px-b-comment .px-b-body').getByText(EDITED, { exact: true }).waitFor({ timeout: 30_000 })
  const stored = await (await fetch(`${app.api}/api/records/${commentId ?? ''}`, { headers: PERSON })).json() as { record: { data: { body?: string } } }
  expect(stored.record.data.body, 'the edited words are not stored').toBe(EDITED)

  // 4. REMOVE at once, with no question; the row reads Removed with Undo, and Undo puts it back.
  const theComment = tray(page).locator(`li[data-comment="${commentId ?? ''}"]`)
  await theComment.getByRole('button', { name: en('review.pane.note.remove'), exact: true }).click()
  await theComment.getByText(en('review.tray.removed'), { exact: true }).waitFor({ timeout: 30_000 })
  expect(await page.locator('[role="dialog"], [role="alertdialog"]').count(), 'Remove asked a question').toBe(0)
  await expect.poll(() => row(page).locator('.px-b-bar-says').innerText(), { timeout: 30_000 }).toContain(en('review.b.comments', { n: 0 }))
  // A REMOVED COMMENT IS SOFT-DELETED: the record stays, marked deleted, so Undo can put it back.
  const gone = await fetch(`${app.api}/api/records/${commentId ?? ''}`, { headers: PERSON })
  const goneRecord = gone.ok ? ((await gone.json()) as { record: { deletedAt: string | null } }).record : null
  expect(gone.status === 404 || (goneRecord?.deletedAt ?? null) !== null, 'the removed comment is not marked deleted').toBe(true)
  await theComment.getByRole('button', { name: en('talk.undo'), exact: true }).click()
  await tray(page).locator('li.px-b-comment .px-b-body').getByText(EDITED, { exact: true }).waitFor({ timeout: 30_000 })
  await expect.poll(() => row(page).locator('.px-b-bar-says').innerText(), { timeout: 30_000 }).toContain(en('review.b.comments', { n: 1 }))

  // 5. SEND REVIEW: the tray stays at the foot and says what was sent, with Show comments and Close.
  const sent = page.waitForResponse((r) => r.url().includes('/send') && r.request().method() === 'POST')
  await row(page).getByRole('button', { name: en('review.tray.send'), exact: true }).click()
  expect((await sent).status()).toBe(200)
  await row(page).getByRole('button', { name: en('review.tray.close'), exact: true }).waitFor({ timeout: 30_000 })
  await atTheFoot(page, 'sent at 1440')
  expect(await row(page).getByRole('button').allInnerTexts()).toEqual([en('review.tray.show'), en('review.tray.close')])
  const sentence = await row(page).locator('.px-b-bar-says').innerText()
  expect(sentence.length, 'the sent row says nothing').toBeGreaterThan(0)
  await row(page).getByRole('button', { name: en('review.tray.show'), exact: true }).click()
  const said = tray(page).locator('.px-send-said').first()
  await said.waitFor({ state: 'visible', timeout: 30_000 })
  expect(await said.innerText(), 'the row and the sent review say two things about one send').toBe(sentence)
  await row(page).getByRole('button', { name: en('review.tray.close'), exact: true }).click()
  await tray(page).waitFor({ state: 'detached', timeout: 30_000 })

  // 6. THE SETTING: hidden by default, so the sent comment draws no circle and lights nothing; Keep showing them
  // draws it as a sent mark; Hide puts it away again and leaves the default in place for the next case.
  await openTheReport(page, reportId, 'en')
  await page.waitForTimeout(1_500)
  expect(await marksDrawn(page), 'the default still draws the mark of a sent comment').toEqual({ circles: 0, lit: 0 })
  await chooseSentMarks(page, en, 'show')
  await openTheReport(page, reportId, 'en')
  await page.locator('.px-comment-circle[data-mark="sent"]').first().waitFor({ timeout: 30_000 })
  expect((await marksDrawn(page)).circles).toBe(1)
  await chooseSentMarks(page, en, 'hide')
  await openTheReport(page, reportId, 'en')
  await page.waitForTimeout(1_500)
  expect(await marksDrawn(page), 'Hide them completely left a mark of the sent comment').toEqual({ circles: 0, lit: 0 })
}, 300_000)

it('7. the tray at the foot at 390, the whole width of the window, and the page keeps its width', async () => {
  const page = app.page
  await page.setViewportSize({ width: 390, height: 844 })
  const reportId = await aReport()
  await openTheReport(page, reportId, 'en')
  const before = await pageWidth(page)
  await writeAComment(page, COMMENT.en)
  await startTheReview(page, en, true)
  const at = await atTheFoot(page, 'closed at 390')
  expect(at.left, 'the tray does not start at the window\'s left edge').toBeLessThanOrEqual(1)
  expect(Math.abs((await pageWidth(page)) - before), 'the page changed width for the review').toBeLessThanOrEqual(1)
  await theFootIsClear(page, 'closed at 390')
  await noSideways(page, 'closed at 390')
  // THE REVIEW IS SENT, so the next test office's run starts with nothing collecting.
  const sent = page.waitForResponse((r) => r.url().includes('/send') && r.request().method() === 'POST')
  await row(page).getByRole('button', { name: en('review.tray.send'), exact: true }).click()
  expect((await sent).status()).toBe(200)
  await row(page).getByRole('button', { name: en('review.tray.close'), exact: true }).click()
}, 300_000)

it('10. the comment box pins open across a click and a selection elsewhere, and an unsent comment looks unsent', async () => {
  const page = app.page
  await page.setViewportSize({ width: 1440, height: 1000 })
  const reportId = await aReport()
  await openTheReport(page, reportId, 'en')
  await writeAComment(page, 'Made-up comment: the pin keeps this open while I copy from another paragraph.')
  const box = page.locator('.px-talk')
  // A HALF-WRITTEN COMMENT IS NOT DRAWN LIKE A SENT ONE: dashed edge, its own word, and a solid mark in the page.
  expect(await box.getAttribute('data-unsent'), 'the half-written box is drawn as a sent one').toBe('1')
  await box.getByText(en('talk.notSentYet'), { exact: true }).waitFor({ timeout: 10_000 })
  // PIN IT.
  await box.getByRole('button', { name: en('talk.pin'), exact: true }).click()
  const pin = box.getByRole('button', { name: en('talk.unpin'), exact: true })
  expect(await pin.getAttribute('aria-pressed')).toBe('true')
  // A CLICK ELSEWHERE DOES NOT CLOSE IT.
  const other = page.locator('[data-text-field="data.blocks[#b-1].text"]')
  await other.click({ position: { x: 24, y: 12 } })
  await page.waitForTimeout(300)
  expect(await box.count(), 'the pinned box closed on a click elsewhere').toBe(1)
  // AND NEITHER DOES A SELECTION ELSEWHERE.
  await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-text-field="data.blocks[#b-1].text"]')
    if (el === null) throw new Error('the other paragraph is not drawn')
    const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode()
    if (node === null) throw new Error('the other paragraph has no words')
    const range = document.createRange()
    range.setStart(node, 4)
    range.setEnd(node, Math.min(9, node.textContent?.length ?? 9))
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
  })
  await page.waitForTimeout(300)
  expect(await box.count(), 'the pinned box closed on a selection elsewhere').toBe(1)
  expect(await box.locator('textarea').inputValue()).toContain('the pin keeps this open')
  // UNPINNED IT CLOSES AS BEFORE.
  await box.getByRole('button', { name: en('talk.unpin'), exact: true }).click()
  await other.click({ position: { x: 24, y: 12 } })
  await box.waitFor({ state: 'detached', timeout: 10_000 })
  // THE MARK OF A DRAFT IS SOLID AND SAYS IT IS UNSENT, drawn when the box lets go of the place.
  await page.locator('.px-comment-circle[data-mark="unsent"]').first().waitFor({ timeout: 30_000 })
  // THE KEPT REQUIREMENT IS THIS BROWSER'S, so it is taken out here and draws no mark in a later case.
  await page.evaluate(() => localStorage.removeItem('mole-office.talk.drafts'))
}, 240_000)

it('11. the chat conversation stays readable at 660 and at 390 while a review collects', async () => {
  const page = app.page
  await page.setViewportSize({ width: 660, height: 1000 })
  const reportId = await aReport()
  await openTheReport(page, reportId, 'en')
  await writeAComment(page, COMMENT.en)
  await startTheReview(page, en, false)
  // STILL COLLECTING, AND THE TRAY IS AT THE FOOT WHILE THE CHAT IS READ. The list is open at 660, so the
  // conversation is opened here and then the window narrows to 390 with it open.
  await goKeeping(page, `${app.site}/?lang=en#/chat`)
  await waitForThePage(page, 60_000)
  const contact = page.locator('.px-chat-contact').filter({ hasText: WRITER.name }).first()
  await contact.waitFor({ timeout: 30_000 })
  await contact.click()
  await page.waitForFunction(() => document.querySelectorAll('.px-chat-page-talk .px-chat-said').length >= 1, undefined, { timeout: 30_000 })
  const measure = async (width: number) => {
    const drawn = await page.evaluate(() => {
      const talk = document.querySelector<HTMLElement>('.px-chat-page-talk')?.getBoundingClientRect()
      const one = document.querySelector<HTMLElement>('.px-chat-page-talk .px-chat-words')?.getBoundingClientRect()
      return {
        talk: talk?.width ?? 0,
        one: one?.width ?? 0,
        sideways: document.documentElement.scrollWidth > window.innerWidth,
        tray: document.querySelector('[data-part="your-review-bar"]') !== null,
      }
    })
    expect(drawn.tray, `${String(width)}: the tray is not drawn while the chat is read`).toBe(true)
    expect(drawn.talk, `${String(width)}: the chat's conversation is a strip ${String(Math.round(drawn.talk))}px wide`).toBeGreaterThanOrEqual(width === 660 ? 280 : 300)
    expect(drawn.one, `${String(width)}: a message is not readable, ${String(Math.round(drawn.one))}px wide`).toBeGreaterThanOrEqual(200)
    expect(drawn.sideways, `${String(width)}: the chat page scrolls sideways`).toBe(false)
  }
  await measure(660)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(500)
  await measure(390)
  // SEND IT SO NOTHING IS LEFT COLLECTING FOR A LATER CASE.
  const sent = page.waitForResponse((r) => r.url().includes('/send') && r.request().method() === 'POST')
  await row(page).getByRole('button', { name: en('review.tray.send'), exact: true }).click()
  expect((await sent).status()).toBe(200)
  await row(page).getByRole('button', { name: en('review.tray.close'), exact: true }).click()
}, 300_000)

it('12. an unsent comment keeps its mark under both choices for a sent comment\'s mark', async () => {
  const page = app.page
  await page.setViewportSize({ width: 1440, height: 1000 })
  const reportId = await aReport()
  // A COMMENT SAVED AND NOT SENT, on the paragraph the box right-clicks, written through the door a saved comment is
  // stored by (tests/a-review-sends-the-comments-saved-without-sending.test.ts).
  await post('/api/records', {
    kind: 'message',
    title: 'Made-up unsent comment: the shelf sagged',
    data: {
      body: 'Made-up comment: the shelf is still unsent.',
      target: { target: { kind: 'reportBlock', recordId: reportId, blockId: 'b-2' }, place: { at: 'surface' } },
    },
  })
  // THE CHOICE THAT COULD HIDE A MARK IS THE ONE THAT KEEPS SHOWING THEM; an unsent comment is drawn under it too.
  await chooseSentMarks(page, en, 'show')
  await openTheReport(page, reportId, 'en')
  await page.locator('.px-comment-circle[data-mark="unsent"]').first().waitFor({ timeout: 30_000 })
  expect(await page.locator('.px-comment-circle[data-mark="unsent"]').count(), 'the showing choice drew no mark for the unsent comment').toBe(1)
  // AND UNDER THE ONE THAT HIDES THEM the sent marks go, and this mark stays, as Settings says it does.
  await chooseSentMarks(page, en, 'hide')
  await openTheReport(page, reportId, 'en')
  await page.locator('.px-comment-circle[data-mark="unsent"]').first().waitFor({ timeout: 30_000 })
  expect(await page.locator('.px-comment-circle[data-mark="unsent"]').count(), 'the hiding choice hid the unsent comment\'s mark').toBe(1)
}, 240_000)

/** The report's block that holds the paragraph the comment is on. */
const theCommentedBlock = (page: Page) => page.locator('.sb-block', { has: page.locator('[data-text-field="data.blocks[#b-2].text"]') })

/**
 * The open tray's own section. At 390 the open tray covers the page, so while the list is open the label goes above
 * the section, inside the tray.
 */
const theOpenTray = (page: Page) => tray(page).locator('section.px-b').first()

/** The Settings choice for a sent comment's mark. */
const theSentMarksChoice = (page: Page) => page.locator('fieldset[data-part="sent-marks"]')

/**
 * The made-up label goes above the block the picture shows, so it covers nothing in it. While a review
 * collects, the review ring is drawn over the whole window, so the label is put in with the ring taken out,
 * and then it must lie inside the ring's border, as in tests/the-right-click-panel-draws-its-presses-once.test.ts.
 */
async function labelled(page: Page, above: Locator, called: string): Promise<void> {
  const was = await page.evaluate(() => {
    const before = document.documentElement.getAttribute('data-review-edge')
    document.documentElement.setAttribute('data-review-edge', 'off')
    return before
  })
  try {
    await putTheMadeUpLabelIn(page, MADE_UP, above, called)
  } finally {
    await page.evaluate((before) => {
      if (before === null) document.documentElement.removeAttribute('data-review-edge')
      else document.documentElement.setAttribute('data-review-edge', before)
    }, was)
  }
  const onTheRing = await page.evaluate(() => {
    const label = document.querySelector('[data-made-up-label]')?.getBoundingClientRect()
    if (label === undefined) return 'no label'
    for (const ring of document.querySelectorAll<HTMLElement>('.px-strip-ring')) {
      const r = ring.getBoundingClientRect()
      const w = parseFloat(getComputedStyle(ring).borderTopWidth)
      if (label.left < r.left + w || label.right > r.right - w || label.top < r.top + w || label.bottom > r.bottom - w) {
        return `label ${JSON.stringify(label)}, ring ${JSON.stringify(r)}, border ${String(w)}`
      }
    }
    return ''
  })
  expect(onTheRing, `${called}: the label lies on the review ring`).toBe('')
}

/** The label is whole inside the window and nothing is drawn over it, so the picture says it is made up. */
async function theLabelShows(page: Page, called: string): Promise<void> {
  const said = await page.evaluate(() => {
    const label = document.querySelector('[data-made-up-label]')
    if (label === null) return 'no label'
    const box = label.getBoundingClientRect()
    if (box.top < 0 || box.left < 0 || box.bottom > innerHeight || box.right > innerWidth) return `outside the window at ${JSON.stringify(box)}`
    const points: [number, number][] = [[box.left + 2, box.top + 2], [box.right - 2, box.top + 2], [box.left + 2, box.bottom - 2], [box.right - 2, box.bottom - 2], [(box.left + box.right) / 2, (box.top + box.bottom) / 2]]
    for (const [x, y] of points) {
      const top = document.elementFromPoint(x, y)
      if (top === null || !(top === label || label.contains(top))) return `covered at ${String(Math.round(x))},${String(Math.round(y))} by <${top?.tagName.toLowerCase() ?? 'nothing'} class="${top?.getAttribute('class') ?? ''}">`
    }
    return ''
  })
  expect(said, `${called}: the made-up label shows in the picture`).toBe('')
}

it.runIf(shots)('8. photographs each step at 1440, 990, 660 and 390 in one look, in English and in Chinese', async () => {
  if (shots === undefined) throw new Error('the pictures need W13Y_ITEM_73A_SHOTS')
  if (look !== 'light' && look !== 'dark') throw new Error('the pictures need W13Y_ITEM_73A_LOOK, light or dark')
  mkdirSync(shots, { recursive: true })
  const page = app.page
  for (const lang of ['en', 'zh'] as const) {
    const say = wordsIn(lang)
    for (const width of [1440, 990, 660, 390]) {
      const phone = width === 390
      const name = (step: string) => `item-73a-${step}-${String(width)}-${look}-${lang}`
      const shoot = async (step: string) => {
        await page.waitForTimeout(700)
        await theLabelShows(page, name(step))
        await noSideways(page, name(step))
        await page.screenshot({ path: join(shots, `${name(step)}.png`) })
      }
      await page.setViewportSize({ width, height: phone ? 844 : 1000 })
      const reportId = await aReport()
      await openTheReport(page, reportId, lang)
      await labelled(page, theCommentedBlock(page), name('first-comment'))
      await writeAComment(page, COMMENT[lang])
      await shoot('first-comment')
      // PINNED, WITH WORDS SELECTED IN ANOTHER PARAGRAPH: the box stays open while the person copies from there.
      // The label above the commented block is already in from the picture before, and stays for this one.
      await page.locator('.px-talk').getByRole('button', { name: say('talk.pin'), exact: true }).click()
      await selectOtherWords(page)
      await shoot('pinned')
      await page.locator('.px-talk').getByRole('button', { name: say('talk.unpin'), exact: true }).click()
      await startTheReview(page, say, phone)
      await labelled(page, theCommentedBlock(page), name('closed'))
      await atTheFoot(page, name('closed'))
      await shoot('closed')
      // THE CHAT, AT THE TWO NARROW WIDTHS, WITH THE REVIEW STILL COLLECTING.
      if (width === 660 || width === 390) {
        if (width === 390) await page.setViewportSize({ width: 660, height: 1000 })
        await goKeeping(page, `${app.site}/?lang=${lang}#/chat`)
        await waitForThePage(page, 60_000)
        const contact = page.locator('.px-chat-contact').filter({ hasText: WRITER.name }).first()
        if ((await contact.count()) > 0) await contact.click()
        await page.waitForFunction(() => document.querySelectorAll('.px-chat-page-talk .px-chat-said').length >= 1, undefined, { timeout: 30_000 })
        if (width === 390) {
          await page.setViewportSize({ width: 390, height: 844 })
          await page.waitForTimeout(500)
        }
        await labelled(page, page.locator('.px-chat-page-talk .px-chat-said').first(), name('chat'))
        await shoot('chat')
        await page.setViewportSize({ width, height: phone ? 844 : 1000 })
        await page.goto('about:blank')
        await openTheReport(page, reportId, lang)
      }
      await row(page).getByRole('button', { name: say('review.tray.show'), exact: true }).click()
      await tray(page).locator('li.px-b-comment').first().waitFor({ state: 'visible', timeout: 10_000 })
      await labelled(page, theOpenTray(page), name('open'))
      await shoot('open')
      const comment = tray(page).locator('li.px-b-comment').first()
      await comment.getByRole('button', { name: say('review.pane.note.edit'), exact: true }).click()
      await comment.getByRole('textbox').waitFor({ timeout: 10_000 })
      await labelled(page, theOpenTray(page), name('editing'))
      await shoot('editing')
      await comment.getByRole('button', { name: say('review.pane.note.stopEditing'), exact: true }).click()
      await comment.getByRole('button', { name: say('review.pane.note.remove'), exact: true }).click()
      await comment.getByRole('button', { name: say('talk.undo'), exact: true }).waitFor({ timeout: 30_000 })
      await labelled(page, theOpenTray(page), name('removed'))
      await shoot('removed')
      await comment.getByRole('button', { name: say('talk.undo'), exact: true }).click()
      await tray(page).locator('li.px-b-comment .px-b-body').first().waitFor({ timeout: 30_000 })
      await row(page).getByRole('button', { name: say('review.tray.hide'), exact: true }).click()
      const sent = page.waitForResponse((r) => r.url().includes('/send') && r.request().method() === 'POST')
      await row(page).getByRole('button', { name: say('review.tray.send'), exact: true }).click()
      expect((await sent).status()).toBe(200)
      await row(page).getByRole('button', { name: say('review.tray.close'), exact: true }).waitFor({ timeout: 30_000 })
      await labelled(page, theCommentedBlock(page), name('sent'))
      await shoot('sent')
      await row(page).getByRole('button', { name: say('review.tray.show'), exact: true }).click()
      await tray(page).locator('.px-send-said').first().waitFor({ state: 'visible', timeout: 30_000 })
      // THE SENT REVIEW'S PANE IS TALLER THAN THE LIST WAS, so a label above it would sit outside the pane. It goes
      // inside it, above what it says was sent.
      await labelled(page, tray(page).locator('.px-send-said').first(), name('sent-open'))
      await shoot('sent-open')
      await row(page).getByRole('button', { name: say('review.tray.close'), exact: true }).click()
      await tray(page).waitFor({ state: 'detached', timeout: 30_000 })
      await page.goto(`${app.site}/?lang=${lang}#/settings/review`)
      await waitForThePage(page, 60_000)
      const hideChoice = page.getByRole('radio', { name: say('review.sentMarks.hide'), exact: true })
      await hideChoice.check()
      await labelled(page, theSentMarksChoice(page), name('setting'))
      await shoot('setting')
      await openTheReport(page, reportId, lang)
      await labelled(page, theCommentedBlock(page), name('hidden'))
      await shoot('hidden')
      // THE SETTING CHANGED: Keep showing them draws the sent mark again.
      await chooseSentMarks(page, say, 'show')
      await openTheReport(page, reportId, lang)
      await page.locator('.px-comment-circle[data-mark="sent"]').first().waitFor({ timeout: 30_000 })
      await labelled(page, theCommentedBlock(page), name('shown'))
      await shoot('shown')
      // A HALF-WRITTEN COMMENT BESIDE THE SENT ONE: the box is dashed and says Not sent yet, and its mark would be
      // the solid one if it were written down. The label goes in before the box opens, so its overlay cannot hide it.
      await labelled(page, page.locator('h1').first(), name('half-written'))
      await writeAComment(page, COMMENT[lang])
      // THE BOX IS PLACED AT THE WORDS; THE PAGE COMES BACK TO ITS TOP SO THE LABEL ABOVE THE TITLE IS IN THE PICTURE.
      await putThePageAt(page, 0)
      await shoot('half-written')
      await page.evaluate(() => localStorage.removeItem('mole-office.talk.drafts'))
      await page.locator('.px-talk').getByRole('button', { name: say('talk.close'), exact: true }).click()
      await page.locator('.px-talk').waitFor({ state: 'detached', timeout: 10_000 })
      await chooseSentMarks(page, say, 'hide')
    }
  }
}, 1_800_000)

it.runIf(film)('9. films the whole way at 1440 in light: the first right-click to the review sent and the setting changed', async () => {
  if (film === undefined) throw new Error('the film needs W13Y_ITEM_73A_FILM')
  const dir = join(film, 'films')
  mkdirSync(dir, { recursive: true })
  const context = await app.browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ['clipboard-read', 'clipboard-write'],
    storageState: await app.page.context().storageState(),
  })
  await context.addInitScript(() => localStorage.setItem('mole-office.preset.theme', 'light'))
  // NO FRAME IS WHITE AND NO FRAME SHOWS A MADE-UP ROW WITHOUT THE LABEL. The report is opened by its address once,
  // before the film starts. One label then goes in at the top of the sidebar, and the film starts only once it is
  // drawn. From there every move is a press a person makes: the tray's own buttons, Settings at the sidebar's foot,
  // and All pages, All records and the report's title to come back. A press changes only the part of the address
  // after the #, so the page is never loaded again and the label is never taken out. The sidebar is held at the
  // window's top while its list scrolls inside it, and the tray and the review ring both stay right of it, so the
  // label stays whole in its place. It is checked after every step.
  const filmed = await context.newPage()
  const slowly = () => filmed.waitForTimeout(1_200)
  /** The label is in, whole inside the window, with nothing over it and no review ring across it. */
  const stillLabelled = async (called: string): Promise<void> => {
    await theLabelShows(filmed, called)
    const onTheRing = await filmed.evaluate(() => {
      const label = document.querySelector('[data-made-up-label]')?.getBoundingClientRect()
      if (label === undefined) return 'no label'
      for (const ring of document.querySelectorAll('.px-strip-ring')) {
        const r = ring.getBoundingClientRect()
        if (label.left < r.right && label.right > r.left && label.top < r.bottom && label.bottom > r.top) {
          return `label ${JSON.stringify(label)}, ring ${JSON.stringify(r)}`
        }
      }
      return ''
    })
    expect(onTheRing, `${called}: the review ring is drawn across the label`).toBe('')
  }
  /** Settings at the sidebar's foot, the Work category if another one is open, and the Review marks choice. */
  const settings = async (answer: 'show' | 'hide', called: string): Promise<void> => {
    await filmed.locator('a.sbp-settings').click()
    await waitForThePage(filmed, 60_000)
    const work = filmed.locator('button.sf-jump[data-category="work"]')
    if ((await work.getAttribute('aria-current')) !== 'true') await work.click()
    await theSentMarksChoice(filmed).scrollIntoViewIfNeeded()
    await stillLabelled(called)
    await slowly()
    const choice = filmed.getByRole('radio', { name: en(`review.sentMarks.${answer}`), exact: true })
    await choice.check()
    expect(await choice.isChecked()).toBe(true)
    await stillLabelled(called)
    await slowly()
  }
  /** Back to the report: All pages in the sidebar, All records there, and the report's title in the list. */
  const backToTheReport = async (reportId: string, called: string): Promise<void> => {
    await filmed.locator('a.shell-all-pages').click()
    await waitForThePage(filmed, 60_000)
    await stillLabelled(`${called}-all-pages`)
    await filmed.locator('#main a[href="#/records"]').click()
    await waitForThePage(filmed, 60_000)
    await stillLabelled(`${called}-all-records`)
    await filmed.locator(`a.rec-cell-title[href$="/${reportId}"]`).click()
    await waitForThePage(filmed, 60_000)
    await filmed.locator('[data-text-field="data.blocks[#b-2].text"]').waitFor({ timeout: 30_000 })
    await stillLabelled(called)
  }
  const named = join(dir, 'item-73a-the-whole-way.webm')
  try {
    const reportId = await aReport()
    await openTheReport(filmed, reportId, 'en')
    await putTheMadeUpLabelIn(filmed, MADE_UP, filmed.locator('.shell-side-head'), 'item-73a-film')
    await stillLabelled('item-73a-film')
    // WHERE THE LABEL IS IN THE FILM, for the check that reads every frame. The window and the film are the same size.
    const where = await filmed.evaluate(() => {
      const label = document.querySelector('[data-made-up-label]')?.getBoundingClientRect()
      const page = document.querySelector('.shell-body')?.getBoundingClientRect()
      return { label: label?.toJSON() as unknown, pageLeft: page?.left }
    })
    console.log(`item-73a-film: the label and the page column in the film: ${JSON.stringify(where)}`)
    await filmed.screencast.start({ path: named, size: { width: 1440, height: 1000 } })
    await slowly()
    await writeAComment(filmed, COMMENT.en)
    await stillLabelled('item-73a-film-comment')
    await slowly()
    // PINNED, AND WORDS COPIED FROM ANOTHER PARAGRAPH AND PASTED INTO IT.
    await filmed.locator('.px-talk').getByRole('button', { name: en('talk.pin'), exact: true }).click()
    await selectOtherWords(filmed)
    await filmed.keyboard.press('Control+C')
    await filmed.locator('.px-talk textarea').click()
    await filmed.keyboard.press('Control+V')
    await slowly()
    await filmed.locator('.px-talk').getByRole('button', { name: en('talk.unpin'), exact: true }).click()
    await startTheReview(filmed, en, false)
    await stillLabelled('item-73a-film-collecting')
    await slowly()
    await row(filmed).getByRole('button', { name: en('review.tray.show'), exact: true }).click()
    await tray(filmed).locator('li.px-b-comment').first().waitFor({ state: 'visible', timeout: 10_000 })
    await stillLabelled('item-73a-film-open')
    await slowly()
    const comment = tray(filmed).locator('li.px-b-comment').first()
    await comment.getByRole('button', { name: en('review.pane.note.edit'), exact: true }).click()
    await slowly()
    await comment.getByRole('textbox').fill(EDITED)
    await stillLabelled('item-73a-film-editing')
    await slowly()
    await comment.getByRole('button', { name: en('review.pane.note.save'), exact: true }).click()
    await tray(filmed).locator('li.px-b-comment .px-b-body').getByText(EDITED, { exact: true }).waitFor({ timeout: 30_000 })
    await slowly()
    await comment.getByRole('button', { name: en('review.pane.note.remove'), exact: true }).click()
    await comment.getByRole('button', { name: en('talk.undo'), exact: true }).waitFor({ timeout: 30_000 })
    await stillLabelled('item-73a-film-removed')
    await slowly()
    await comment.getByRole('button', { name: en('talk.undo'), exact: true }).click()
    await slowly()
    await row(filmed).getByRole('button', { name: en('review.tray.send'), exact: true }).click()
    await row(filmed).getByRole('button', { name: en('review.tray.close'), exact: true }).waitFor({ timeout: 30_000 })
    await stillLabelled('item-73a-film-sent')
    await slowly()
    await row(filmed).getByRole('button', { name: en('review.tray.show'), exact: true }).click()
    await tray(filmed).locator('.px-send-said').first().waitFor({ state: 'visible', timeout: 30_000 })
    await stillLabelled('item-73a-film-sent-open')
    await slowly()
    await row(filmed).getByRole('button', { name: en('review.tray.close'), exact: true }).click()
    await tray(filmed).waitFor({ state: 'detached', timeout: 30_000 })
    await stillLabelled('item-73a-film-closed')
    await slowly()
    // THE SETTING AT ITS NEW DEFAULT: Hide them completely is already chosen, and the sent mark is not drawn.
    await settings('hide', 'item-73a-film-setting-default')
    await backToTheReport(reportId, 'item-73a-film-hidden')
    await slowly()
    // THE SETTING CHANGED: Keep showing them draws the sent mark.
    await settings('show', 'item-73a-film-setting-shown')
    await backToTheReport(reportId, 'item-73a-film-shown')
    await filmed.locator('.px-comment-circle[data-mark="sent"]').first().waitFor({ timeout: 30_000 })
    await slowly()
    // A HALF-WRITTEN COMMENT BESIDE THE SENT ONE, with its own dashed box and word.
    await writeAComment(filmed, COMMENT.en)
    await stillLabelled('item-73a-film-half-written')
    await slowly()
    await filmed.evaluate(() => localStorage.removeItem('mole-office.talk.drafts'))
    await filmed.locator('.px-talk').getByRole('button', { name: en('talk.close'), exact: true }).click()
    await filmed.locator('.px-talk').waitFor({ state: 'detached', timeout: 10_000 })
    await slowly()
    await settings('hide', 'item-73a-film-setting-hidden')
    await filmed.screencast.stop()
  } finally {
    await context.close()
  }
  expect(statSync(named).size, 'the film was not written').toBeGreaterThan(0)
}, 600_000)
