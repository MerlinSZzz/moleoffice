// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REVIEW'S ERROR NOTE KEEPS ITS FAULT. Wave 13r round 18, piece 4.
 *
 * ErrorNote draws a failure by one rule only when it is given the fault. The review column and the saved comment kept
 * only the caught error's message, so every note there was the message as it came, whatever the failure was. Each note
 * now keeps the error as its message and its fault (`Failure` in src/web/components/agent/ReviewBar.tsx).
 *
 * WHAT THIS FILE PROVES, in a real browser, on one note: the collecting review's own Send, under the column. The
 * person comments on a report, chooses who the review goes to, and presses Send. Between the press and the office, the
 * test finishes the review's collecting itself, as the person, so the office refuses the page's own request: the
 * review is no longer collecting. That refusal is real and carries no code. On a Chinese page, the note draws the
 * office's sentence marked as the office's own words, in the page's language, which is ErrorNote's rule for a
 * refusal with no code.
 * MUTATION: in ReviewBar.tsx, drop the fault from the note above `.px-b-do`. The case goes red: the note draws the
 * message with no mark.
 *
 * AND WHEN THE OFFICE CANNOT BE REACHED (round 18b). ErrorNote's rule for an unreachable fault says nothing on the page
 * could be read and drops the note's own heading. For one failed act that is untrue, so the review column passes no
 * fault for it (`theFaultANoteDraws` in src/web/components/agent/SavedComment.tsx). The test aborts the page's request,
 * so nothing answers, for two acts: the Send, and a change of who the review goes to. On a Chinese page, the note's
 * heading is the act's own label, and the cannot-reach sentence is under it.
 * MUTATION: `theFaultANoteDraws` passes the fault through unchanged. The two unreachable cases go red: the heading is
 * the cannot-reach sentence, and the page-level blank sentence is under it.
 *
 * AND A SEND REFUSED AFTER COLLECTING FINISHED READS THE REVIEW AGAIN. The page's finish-collecting request goes on to
 * the office, so collecting really finishes; then the page's send request is aborted, so nothing answers it. Once the
 * page has read the review again, its head says collecting finished rather than that it is collecting.
 * MUTATION: in ReviewBar.tsx, drop the reviewChanged() call from the catch in finishAndSend. The case goes red: the head
 * still says the review is collecting.
 *
 * THE OFFICE IS THIS TEST'S OWN. `liveApp` starts its own API and database. Every name here is made up.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { Locator } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS = (handle: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })
const WRITER = { name: 'Kiln Keeper', handle: 'kiln-keeper' }
const OTHER = { name: 'Glaze Reader', handle: 'glaze-reader' }
const RUN = '[data-text-field="data.blocks[#b-2].text"]'
const FINISH = /\/api\/reviews\/([^/]+)\/finish-collecting$/
const SEND = /\/api\/reviews\/([^/]+)\/send$/
const RECIPIENT = /\/api\/reviews\/[^/]+\/recipient$/

let app: LiveApp

async function post<T>(path: string, body: unknown, headers: Record<string, string> = PERSON): Promise<T> {
  const reply = await fetch(app.api + path, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return (await reply.json()) as T
}

/** A made-up report with one comment on it, in a review that is collecting, on a page in this language. */
async function aCollectingReview(lang: 'en' | 'zh'): Promise<Locator> {
  const t = createI18n(lang).t
  const report = await post<{ record: { id: string } }>('/api/records', {
    kind: 'report', title: `Made-up kiln report, ${lang}`,
    data: {
      blocks: [
        { id: 'b-1', type: 'text', heading: 'What I found', text: 'The second firing held its temperature for the whole hour.' },
        { id: 'b-2', type: 'text', heading: 'What moved', text: 'The left shelf sagged by two millimetres between the firings, and the right one held.' },
      ],
    },
  }, AS(WRITER.handle))
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${lang}#/r/${report.record.id}`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator(RUN).waitFor({ timeout: 30_000 })
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
  }, RUN)
  await app.page.mouse.click(at.x, at.y, { button: 'right' })
  await app.page.locator('.px-talk textarea').waitFor({ timeout: 20_000 })
  await app.page.locator('.px-talk textarea').fill('A made-up comment: which shelf sagged?')
  await app.page.locator('.px-talk').getByRole('button', { name: t('talk.startReview'), exact: true }).click()
  await app.page.getByText(t('talk.state.reviewStarted'), { exact: true }).waitFor({ timeout: 30_000 })
  await app.page.locator('.px-talk').getByRole('button', { name: t('talk.backToReading'), exact: true }).click()
  await app.page.locator('.px-talk').waitFor({ state: 'detached', timeout: 30_000 })

  const review = app.page.locator('[data-part="your-review"]')
  await review.waitFor({ timeout: 30_000 })
  return review
}

/** Opens the list of who the review can go to, and presses the other agent. */
async function chooseTheOther(lang: 'en' | 'zh', review: Locator): Promise<void> {
  const t = createI18n(lang).t
  // THE TRAY'S ROW CARRIES CHANGE AT EVERY WIDTH; its press opens the list where the contact picker is.
  await review.locator('[data-part="your-review-bar"]').getByRole('button', { name: t('review.b.change'), exact: true }).click()
  const contacts = review.locator('.px-review-contacts')
  await contacts.locator('.px-talk-contact').first().waitFor({ timeout: 30_000 })
  await contacts.locator('.px-talk-contact', { hasText: OTHER.name }).first().click()
}

/** Chooses the other agent, and waits until the office has answered and the column says so. */
async function theOtherIsChosen(lang: 'en' | 'zh', review: Locator): Promise<void> {
  const t = createI18n(lang).t
  const chosen = app.page.waitForResponse((r) => RECIPIENT.test(new URL(r.url()).pathname) && r.request().method() === 'POST')
  await chooseTheOther(lang, review)
  expect((await chosen).status()).toBe(200)
  await review.locator('[data-part="goes-to"]').getByText(t('review.b.goingTo', { name: OTHER.name }), { exact: true }).waitFor({ timeout: 30_000 })
}

/** What the note under the column drew. */
async function theNote(review: Locator): Promise<{ heading: string; text: string; said: string[]; mark: string[] }> {
  const note = review.locator('.px-error').first()
  await note.waitFor({ timeout: 20_000 })
  return {
    heading: (await note.locator('.px-error-mark').innerText()).trim(),
    text: (await note.locator('.px-error-msg').innerText()).trim(),
    said: await note.locator('.px-error-said').allInnerTexts(),
    mark: await note.locator('.px-error-own-mark').allInnerTexts(),
  }
}

/** What the office refused, and what the note under the column drew for it, on a page in this language. */
async function theRefusalAndItsNote(lang: 'en' | 'zh'): Promise<{ status: number; error: string; heading: string; said: string[]; mark: string[] }> {
  const t = createI18n(lang).t
  const review = await aCollectingReview(lang)
  await theOtherIsChosen(lang, review)

  // THE REVIEW STOPS COLLECTING BETWEEN THE PRESS AND THE OFFICE. The page's request is held, the person's own
  // finish-collecting goes first, and then the page's request goes on to the office as it was, which refuses it.
  const finish = FINISH
  await app.page.route(finish, async (route) => {
    const id = finish.exec(new URL(route.request().url()).pathname)?.[1] ?? ''
    await post(`/api/reviews/${id}/finish-collecting`, {})
    await route.continue()
  })
  const refused = app.page.waitForResponse((r) => finish.test(new URL(r.url()).pathname) && r.request().method() === 'POST')
  await review.locator('[data-part="your-review-bar"]').getByRole('button', { name: t('review.tray.send'), exact: true }).click()
  const answer = await refused
  await app.page.unroute(finish)
  const status = answer.status()
  const error = ((await answer.json()) as { error: string }).error
  const { heading, said, mark } = await theNote(review)
  return { status, error, heading, said, mark }
}

/** The Send, with nothing answering it: the page's request to finish collecting is aborted before the office. */
async function aSendNothingAnswers(lang: 'en' | 'zh'): Promise<{ heading: string; text: string }> {
  const t = createI18n(lang).t
  const review = await aCollectingReview(lang)
  await theOtherIsChosen(lang, review)
  await app.page.route(FINISH, (route) => route.abort('connectionrefused'))
  await review.locator('[data-part="your-review-bar"]').getByRole('button', { name: t('review.tray.send'), exact: true }).click()
  const seen = await theNote(review)
  await app.page.unroute(FINISH)
  return seen
}

/** Collecting finishes on the office, and then the send is refused: nothing answers the page's send request. */
async function aSendRefusedAfterCollectingFinished(lang: 'en' | 'zh'): Promise<{ finished: number; head: string }> {
  const t = createI18n(lang).t
  const review = await aCollectingReview(lang)
  await theOtherIsChosen(lang, review)
  await app.page.route(SEND, (route) => route.request().method() === 'POST' ? route.abort('connectionrefused') : route.continue())
  try {
    const finished = app.page.waitForResponse((r) => FINISH.test(new URL(r.url()).pathname) && r.request().method() === 'POST')
    await review.locator('[data-part="your-review-bar"]').getByRole('button', { name: t('review.tray.send'), exact: true }).click()
    const answer = await finished
    // THE HEAD IS WHERE A REVIEW SAYS WHERE IT STANDS. Wait until it has read the review again, then say which
    // state word it drew, never the collecting one.
    const head = app.page.locator('.px-pane-head .px-pane-count').first()
    // A COLLECTING REVIEW DRAWS NO WHOLE-PANE HEAD, so the state it is drawn in is the collecting word.
    await expect.poll(async () => (await head.count()) === 0 ? t('review.pane.state.collecting') : (await head.innerText()).trim().split(' · ')[0], { timeout: 30_000 }).toBe(t('review.pane.state.collected'))
    return { finished: answer.status(), head: (await head.innerText()).trim() }
  } finally {
    await app.page.unroute(SEND)
  }
}

/** A change of who the review goes to, with nothing answering it. */
async function aRecipientChangeNothingAnswers(lang: 'en' | 'zh'): Promise<{ aborted: number; heading: string; text: string }> {
  const review = await aCollectingReview(lang)
  let aborted = 0
  await app.page.route(RECIPIENT, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    aborted += 1
    await route.abort('connectionrefused')
  })
  await chooseTheOther(lang, review)
  const seen = await theNote(review)
  await app.page.unroute(RECIPIENT)
  return { aborted, ...seen }
}

beforeAll(async () => {
  app = await liveApp({ name: 'a-review-error-note-keeps-its-fault', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  await app.page.addInitScript(() => localStorage.setItem('mole-office.preset.theme', 'light'))
  for (const agent of [WRITER, OTHER]) {
    await post('/api/records', { kind: 'agent', title: agent.name, data: { handle: agent.handle, runtime: 'claude-code', state: 'active' } })
    await post('/api/records', { kind: 'message', title: 'A note', data: { body: `${agent.name} has a made-up note.`, to: [{ kind: 'person', id: THE_PERSON }] } }, AS(agent.handle))
  }
  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: 'Pair this browser', exact: true }).click()
  await app.page.getByText('This browser is paired.', { exact: true }).waitFor()
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe("a review's error note keeps its fault", () => {
  it.each(['zh'] as const)("%s: the collecting review's Send, refused with no code, draws the office's sentence marked as its own", async (lang) => {
    const t = createI18n(lang).t
    const seen = await theRefusalAndItsNote(lang)
    expect(seen.status, seen.error).toBe(409)
    expect(seen.heading).toBe(t('review.b.notSent'))
    expect(seen.mark, 'the mark that says the sentence is the office’s own').toEqual([t('error.ownWords')])
    expect(seen.said, 'the office’s sentence, once').toHaveLength(1)
    expect(seen.error).toContain(seen.said[0])
  }, 180_000)

  it.each(['zh'] as const)('%s: a Send that nothing answers keeps "Not sent" as its heading and says the office cannot be reached', async (lang) => {
    const t = createI18n(lang).t
    const seen = await aSendNothingAnswers(lang)
    expect(seen.heading).toBe(t('review.b.notSent'))
    expect(seen.text).toContain(t('frameFiles.api.cannotReach'))
    expect(seen.text, 'the sentence for a page that could not be read at all').not.toContain(t('error.blank'))
  }, 180_000)

  it.each(['zh'] as const)('%s: a change of who the review goes to that nothing answers keeps its own label, that who it goes to was not changed, as its heading', async (lang) => {
    const t = createI18n(lang).t
    const seen = await aRecipientChangeNothingAnswers(lang)
    expect(seen.aborted, 'the change was asked once, and nothing answered it').toBe(1)
    expect(seen.heading).toBe(t('review.b.notChanged'))
    expect(seen.text).toContain(t('frameFiles.api.cannotReach'))
    expect(seen.text, 'the sentence for a page that could not be read at all').not.toContain(t('error.blank'))
  }, 180_000)

  it.each(['zh'] as const)('%s: a send refused after collecting finished reads the review again, and its head says collecting finished', async (lang) => {
    const t = createI18n(lang).t
    const seen = await aSendRefusedAfterCollectingFinished(lang)
    expect(seen.finished, 'the office finished collecting before the send was refused').toBe(200)
    expect(seen.head.split(' · ')[0], 'the state word the head draws once it has read the review again').toBe(t('review.pane.state.collected'))
  }, 180_000)
})
