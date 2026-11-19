// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE "WRITTEN DOWN" NOTE STANDS CLEAR OF THE REVIEW BAR AT 390, AND IS NOT SEEN WHILE THE LEAVE QUESTION IS ASKED.
 * Wave 13r round 16, piece 1, item 2 (check LKIg1xz-PjD-). At 390 the talk box is a sheet from the window's foot,
 * and after Start review it says the review has started. It was drawn over the review's bar, and it stayed in view
 * behind the question asked on leaving the page.
 *
 *   1. With the note open, the bar is the thing at the bar's middle, and the note ends where the pane begins.
 *   2. While the leave question is asked, the note is not seen. (Stay is a press outside the note, which closes it
 *      as any press outside it does, so nothing is asked of the note after Stay.)
 *
 * Three-run proof (control, mutation, restore) is in round 16's report. The mutations: the rule that stands the
 * sheet on the pane taken out (case 1 red); the rule that puts the talk box out of sight under the question taken
 * out (case 2 red).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const t = createI18n('en').t
const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
const WRITER = { name: 'Kiln Keeper', handle: 'kiln-keeper' }
const AS_THE_WRITER = { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': WRITER.handle }

let app: LiveApp
let reportId = ''

async function post<T>(path: string, body: unknown, headers: Record<string, string> = PERSON): Promise<T> {
  const reply = await fetch(app.api + path, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!reply.ok) throw new Error(`${path} answered ${String(reply.status)}: ${await reply.text()}`)
  return (await reply.json()) as T
}

beforeAll(async () => {
  app = await liveApp({ name: 'r16-note-clear-of-the-bar', viewport: { width: 390, height: 844 }, workspace: 'default' })
  await post('/api/records', { kind: 'agent', title: WRITER.name, data: { handle: WRITER.handle, runtime: 'claude-code', state: 'active' } })
  reportId = (
    await post<{ record: { id: string } }>('/api/records', {
      kind: 'report', title: 'Made-up kiln report',
      data: { blocks: [{ id: 'b-1', type: 'text', heading: 'What moved', text: 'The left shelf sagged by two millimetres between the firings.' }] },
    }, AS_THE_WRITER)
  ).record.id
  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: 'Pair this browser', exact: true }).click()
  await app.page.getByText('This browser is paired.', { exact: true }).waitFor()

  // A COMMENT, WRITTEN IN THE RIGHT-CLICK BOX, and Start review pressed: the box now says the review has started.
  await app.page.goto(`${app.site}/#/r/${reportId}`)
  await waitForThePage(app.page, 60_000)
  const run = '[data-text-field="data.blocks[#b-1].text"]'
  await app.page.locator(run).waitFor({ timeout: 30_000 })
  const at = await app.page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel)
    if (el === null) throw new Error('the paragraph is not drawn')
    el.scrollIntoView({ block: 'center' })
    const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode() as Text
    const range = document.createRange()
    range.setStart(node, 4)
    range.setEnd(node, 14)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    const r = range.getClientRects()[0]
    if (r === undefined) throw new Error('the words have no box')
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  }, run)
  await app.page.mouse.click(at.x, at.y, { button: 'right' })
  await app.page.locator('.px-talk textarea').fill('Made-up comment: which shelf sagged?')
  await app.page.locator('.px-talk').getByRole('button', { name: t('talk.startReview'), exact: true }).click()
  await app.page.getByText(t('talk.state.reviewStarted'), { exact: true }).waitFor({ timeout: 30_000 })
  await app.page.locator('[data-part="your-review-bar"]').waitFor({ timeout: 30_000 })
  await app.page.waitForTimeout(700)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('at 390, the note after Start review', () => {
  it('stands on the review bar and does not cover it', async () => {
    const seen = await app.page.evaluate(() => {
      const note = document.querySelector<HTMLElement>('.px-talk')
      const bar = document.querySelector<HTMLElement>('[data-part="your-review-bar"]')
      const pane = bar?.closest<HTMLElement>('.px-pane') ?? null
      if (note === null || bar === null || pane === null) return null
      const b = bar.getBoundingClientRect()
      const hit = document.elementFromPoint(b.left + b.width / 4, b.top + b.height / 2)
      return { barIsOnTop: hit !== null && bar.contains(hit), noteBottom: note.getBoundingClientRect().bottom, paneTop: pane.getBoundingClientRect().top }
    })
    expect(seen, 'the note, the bar or the pane is not drawn').not.toBeNull()
    expect(seen?.barIsOnTop, 'something is drawn over the review bar').toBe(true)
    expect(seen?.noteBottom ?? Infinity, 'the note runs down over the pane').toBeLessThanOrEqual((seen?.paneTop ?? 0) + 1)
  }, 120_000)

  it('is out of sight while the leave question is asked', async () => {
    await app.page.evaluate(() => { location.hash = '#/records' })
    const question = app.page.locator('[data-part="leave-question"]')
    await question.waitFor({ timeout: 30_000 })
    const noteShown = () =>
      app.page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.px-talk')].map((one) => one.checkVisibility()))
    expect(await noteShown(), 'the note shows behind the leave question').toEqual([false])
    await question.getByRole('button', { name: t('review.leave.stay'), exact: true }).click()
    await question.waitFor({ state: 'detached' })
  }, 120_000)
})
