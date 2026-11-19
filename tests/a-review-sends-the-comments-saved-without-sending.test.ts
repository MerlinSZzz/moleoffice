// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW COLUMN HOLDS THE COMMENTS SAVED WITHOUT SENDING, AND SENDING THE REVIEW SENDS THEM. Problem H031xonpPSqa.
 *
 * A person saved
 * comments on a report without sending them, opened the review column, and they were not in it, so they could not be sent
 * together. Since wave 13r round 15 (record 9BZZVKQxWV9Z, third detail) a review takes in the comments kept on
 * its page when it starts, so they are its members and no longer listed apart under "Saved, not sent". The review's
 * own send carries them, each to the agent chosen for it. While one has nobody chosen and the review goes to nobody,
 * the send is refused and names it, and the pane's Send press stays off.
 *
 * THE PICKER, BY ITEM 5 OF A DECISION: who a comment is for is chosen from one short list with a
 * filter box, one row each and no group headings, in the order `theRowsInOrder` in
 * src/web/components/ContactsInOrder.tsx gives.
 *
 * THE OFFICE IS THIS TEST'S OWN. Two agents that have written to the person, so the chat's contacts hold them, and a
 * report. The two comments are written through the door and in the shape the right-click panel's "Save without
 * sending" writes (`writeAnnotation` in src/web/api.ts: a message with a target and no `to`). One of them also carries
 * the agent somebody chose for it, as the chat's unsent comments can, and the other carries nobody. Every name and
 * word is made up. The browser pairs first, because sending asks for the owner’s proof.
 *
 * Three-run proofs, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/a-review-sends-the-comments-saved-without-sending.test.ts
 * After a green control, copy the changed file before each one-line mutation:
 * - The saved comments not taken in: in src/server/lib/reviews.ts, `savedNotSent` answering `[]` at its first
 *   line. The review starts empty and the first case goes red.
 * - The taken-in comments left out of the members: `takenInOf` answering `[]` at its first line. The first case goes
 *   red.
 * - A group heading drawn in the picker: in src/web/components/ContactsInOrder.tsx, an `<h4>` above the list. The
 *   second case goes red.
 * - The filter removed: the same file, the `<input type="search">` taken out. The second case goes red.
 * - The order given not kept: in `inTheOrderGiven`, `return contacts.map(...)` with no reason first. The third case
 *   goes red.
 * Restore each file with cp, check it with cmp, and run this command again for green.
 * REVIEW_SAVED_SHOTS=<folder> saves the column with the saved group and the picker open, at the four chapter 6 widths
 * in both looks and at 1440 in Chinese (review-saved-*), and the picker ranked on a report an agent filed, the filer
 * first and nothing chosen (review-ranked-*).
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ReviewDetail, SendOutcome } from '../src/server/lib/reviews.ts'
import type { ContactsReply } from '../src/web/api.ts'
import { inTheOrderGiven, theRowsInOrder } from '../src/web/components/ContactsInOrder.tsx'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { setTheReviewTraysList } from './the-review-trays-list.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS = (handle: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })
const HARBOUR = { name: 'Harbour survey agent', handle: 'harbour-survey' }
const TIDE = { name: 'Tide gauge agent', handle: 'tide-gauge' }
const CHOSEN_BEFORE = 'Synthetic saved comment one: the soundings table needs units.'
const NOBODY_YET = 'Synthetic saved comment two: the chart and the table disagree.'
let app: LiveApp
let reportId: string
const recordOf = new Map<string, string>()
const savedIds: string[] = []

async function post<T>(path: string, body: unknown, headers: Record<string, string> = PERSON): Promise<T> {
  const reply = await fetch(app.api + path, { method: 'POST', headers, body: JSON.stringify(body) })
  const aLetterNothingHolds = path === '/api/records' && theAnswerToAWriteInATestOffice(headers, body) === 409
  expect(aLetterNothingHolds ? reply.status === 409 : reply.ok, await reply.clone().text()).toBe(true)
  return await reply.json() as T
}

async function get<T>(path: string): Promise<T> {
  const reply = await fetch(app.api + path, { headers: PERSON })
  expect(reply.status, await reply.clone().text()).toBe(200)
  return await reply.json() as T
}

/** What the person and one agent have said to each other, as the chat reads it. */
async function conversationWith(handle: string): Promise<{ body: string; notSentYet: boolean }[]> {
  return (await get<{ messages: { body: string; notSentYet: boolean }[] }>(
    `/api/messages/conversation?kind=agent&id=${encodeURIComponent(handle)}`,
  )).messages
}

beforeAll(async () => {
  app = await liveApp({ name: 'review-sends-saved', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  // THE CONTACTS: two agents that have written to the person, which is how the chat's contacts come to hold them.
  for (const one of [HARBOUR, TIDE]) {
    await post('/api/records', { kind: 'agent', title: one.name, data: { handle: one.handle, runtime: 'claude-code', state: 'active' } })
    await post('/api/records', {
      kind: 'message', title: 'A note', data: { body: `${one.name} has a note.`, to: [{ kind: 'person', id: THE_PERSON }] },
    }, AS(one.handle))
  }
  const agents = (await get<{ agents: { handle: string; record?: string | null }[] }>('/api/participants')).agents
  for (const one of [HARBOUR, TIDE]) {
    const record = agents.find((agent) => agent.handle === one.handle)?.record ?? ''
    expect(record).not.toBe('')
    recordOf.set(one.handle, record)
  }

  const report = await post<{ record: { id: string } }>('/api/records', {
    kind: 'report', title: 'Synthetic report: harbour soundings',
    data: { for: 'Robin Vale', date: '2026-10-01', blocks: [{ id: 'b-1', type: 'text', heading: 'Soundings', text: 'Two places to look at.' }] },
  })
  reportId = report.record.id
  const target = { target: { kind: 'reportBlock', recordId: reportId, blockId: 'b-1' }, place: { at: 'surface' } }
  // SAVED WITHOUT SENDING, the shape the right-click panel writes. The first carries the agent chosen for it.
  const first = await post<{ record: { id: string } }>('/api/records', {
    kind: 'message', title: CHOSEN_BEFORE.slice(0, 40),
    data: {
      body: CHOSEN_BEFORE, target,
      chosenRecipient: { kind: 'agent', agentId: recordOf.get(HARBOUR.handle) },
    },
  })
  const second = await post<{ record: { id: string } }>('/api/records', {
    kind: 'message', title: NOBODY_YET.slice(0, 40), data: { body: NOBODY_YET, target },
  })
  savedIds.push(first.record.id, second.record.id)
  // A REVIEW TAKES WHAT IS WRITTEN FROM THE SECOND IT STARTS, stamped to the second. So the review is started in a
  // later second, which makes both comments earlier than it, as the owner’s were.
  await new Promise((resolve) => setTimeout(resolve, 1_200))

  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: 'Pair this browser', exact: true }).click()
  await app.page.getByText('This browser is paired.', { exact: true }).waitFor()
}, 180_000)

afterAll(async () => { await app?.stop() })

/** Open the column on the report, start a review there, and answer the review it started. */
async function startTheReviewInTheColumn(): Promise<string> {
  await app.page.goto(`${app.site}/#/r/${reportId}`)
  await waitForThePage(app.page)
  if (!(await app.page.locator('.px-pane').isVisible())) await app.page.locator('.px-review-switch').click()
  const started = app.page.waitForResponse((response) =>
    response.url() === `${app.api}/api/reviews` && response.request().method() === 'POST')
  await app.page.locator('.px-pane').getByRole('button', { name: 'Start a review here', exact: true }).click()
  const reply = await started
  expect(reply.status(), await reply.text()).toBeLessThan(300)
  return ((await reply.json()) as { review: { id: string } }).review.id
}

/**
 * Finish collecting in the column, with its confirm. Who a comment is for is chosen, and a review sent, only after
 * that: `NoteWaiting` offers the choice once a comment may go.
 */
async function finishCollecting(): Promise<void> {
  const pane = app.page.locator('.px-pane')
  // SHAPE B KEEPS FINISH COLLECTING BEHIND "MORE ABOUT THIS REVIEW" while the review collects (wave 13r round 15).
  const more = pane.locator('details.px-b-more')
  await more.waitFor({ timeout: 20_000 })
  if (!(await more.evaluate((el) => (el as HTMLDetailsElement).open))) await more.locator('summary').click()
  await pane.getByRole('button', { name: 'Finish collecting', exact: true }).click()
  const finished = app.page.waitForResponse((response) => response.url().includes('/finish-collecting'))
  await pane.locator('.px-pane-confirm').getByRole('button').last().click()
  expect((await finished).status()).toBe(200)
}

/** Open one comment's row in the finished review and its list of contacts. */
async function openThePickerOn(body: string) {
  const item = app.page.locator('.px-pane .px-rev-item', { hasText: body })
  const press = item.locator('.px-rev-acts').getByRole('button', { name: 'More', exact: true })
  if (await press.count() > 0) await press.click()
  await item.locator('.px-rev-more').getByRole('button', { name: 'Choose a recipient', exact: true }).click()
  const list = item.locator('.px-review-contacts')
  await list.locator('.px-talk-contact').first().waitFor({ timeout: 20_000 })
  return { item, list }
}

let reviewId = ''

describe('the comments saved without sending, in the review column', () => {
  it('takes both in, refuses to send while one has nobody, and sends each to its agent once one is chosen', { timeout: 240_000 }, async () => {
    reviewId = await startTheReviewInTheColumn()

    // BOTH ARE IN THE REVIEW THE COLUMN DRAWS, AS ITS MEMBERS, AND NEITHER IS LISTED APART OR AS A ROW OF "NOT IN IT".
    const yours = app.page.locator('.px-pane [data-part="your-review"] .px-b-list')
    // THE TRAY'S LIST IS SHUT AT FIRST (wave 13y round 146, item 73a), and this list is inside it.
    await setTheReviewTraysList(app.page, 'open')
    await yours.waitFor({ timeout: 20_000 })
    for (const body of [CHOSEN_BEFORE, NOBODY_YET]) await yours.getByText(body.slice(0, 50)).first().waitFor()
    const read = await get<ReviewDetail>(`/api/reviews/${reviewId}`)
    // SORTED, because two comments written in the same second are listed by id, which says nothing about either.
    expect(read.members.map((one) => one.id).sort()).toEqual([...savedIds].sort())
    expect(read.saved.map((one) => one.id)).toEqual([])
    const notIn = await get<{ rows: { id: string }[] }>(`/api/reviews/${reviewId}/not-in-it`)
    for (const id of savedIds) expect(notIn.rows.map((one) => one.id)).not.toContain(id)

    // FINISH COLLECTING, which writes down the two members and sends nothing.
    await finishCollecting()
    const pane = app.page.locator('.px-pane')

    // WHILE ONE HAS NOBODY CHOSEN, THE PRESS IS OFF, AND THE SEND ITSELF IS REFUSED NAMING THAT ONE.
    const sendPress = pane.getByRole('button', { name: 'Send this review', exact: true })
    await sendPress.waitFor({ timeout: 20_000 })
    await expect.poll(async () => sendPress.isDisabled(), { timeout: 20_000 }).toBe(true)
    // THE REFUSAL COMES BEFORE THE PROOF A SEND ASKS FOR, so the person's own headers reach it.
    const refused = await fetch(`${app.api}/api/reviews/${reviewId}/send`, { method: 'POST', headers: PERSON, body: '{}' })
    const refusal = await refused.text()
    expect(refused.status, refusal).toBe(409)
    expect(refusal).toContain(savedIds[1])
    expect(refusal).not.toContain(savedIds[0])
    // AND NOTHING WENT: the first is in its agent's conversation, still not sent.
    expect((await conversationWith(HARBOUR.handle)).find((one) => one.body === CHOSEN_BEFORE)).toMatchObject({ notSentYet: true })

    // CHOOSE WHO THE SECOND IS FOR, FROM THE PICKER.
    const { item, list } = await openThePickerOn(NOBODY_YET.slice(0, 50))
    const stored = app.page.waitForResponse((response) => response.url().includes(`/api/records/${savedIds[1]}`) && response.request().method() === 'PATCH')
    await list.locator('.px-talk-contact', { hasText: TIDE.name }).click()
    expect((await stored).status()).toBe(200)
    await item.getByRole('button', { name: 'Change the recipient', exact: true }).waitFor({ timeout: 20_000 })

    // AND SEND THE REVIEW, BY ITS OWN PRESS.
    await expect.poll(async () => sendPress.isDisabled(), { timeout: 20_000 }).toBe(false)
    const reply = app.page.waitForResponse((response) =>
      response.url() === `${app.api}/api/reviews/${reviewId}/send` && response.request().method() === 'POST')
    await sendPress.click()
    const sent = await reply
    expect(sent.status(), await sent.text()).toBe(200)
    const outcome = await sent.json() as SendOutcome
    expect(outcome.held).toEqual([])
    expect(outcome.review.review.state).toBe('sent')

    // EACH NOW SITS IN ITS AGENT'S CONVERSATION, AND NEITHER IS "NOT SENT YET" THERE.
    const harbour = (await conversationWith(HARBOUR.handle)).find((one) => one.body === CHOSEN_BEFORE)
    const tide = (await conversationWith(TIDE.handle)).find((one) => one.body === NOBODY_YET)
    expect(harbour, 'the first saved comment is not in the harbour agent\'s conversation').toMatchObject({ notSentYet: false })
    expect(tide, 'the second saved comment is not in the tide agent\'s conversation').toMatchObject({ notSentYet: false })
  })
})

describe('the picker of who a comment is for', () => {
  it('is one short list with a filter and no group headings, in the order its one function gives', { timeout: 180_000 }, async () => {
    // A FRESH SAVED COMMENT AND A FRESH REVIEW, on a note of its own, so the picker is opened on a saved row.
    const note = await post<{ record: { id: string } }>('/api/records', { kind: 'note', title: 'Synthetic page for the picker', data: { body: 'One place.' } })
    reportId = note.record.id
    const words = 'Synthetic saved comment three: who should look at this?'
    await post('/api/records', {
      kind: 'message', title: words.slice(0, 40),
      data: { body: words, target: { target: { kind: 'record', recordId: reportId, workspaceId: 'default' }, place: { at: 'surface' } } },
    })
    await new Promise((resolve) => setTimeout(resolve, 1_200))
    await app.page.reload()
    const toTheList = app.page.locator('.px-pane').getByRole('button', { name: 'Your reviews', exact: true })
    await startTheReviewInTheColumnFromAnywhere(toTheList)
    await finishCollecting()
    const { list } = await openThePickerOn(words.slice(0, 50))

    // ONE LIST, WITH ITS FILTER, AND NO HEADINGS OF ANY KIND INSIDE IT.
    const picker = list.locator('[data-part="contacts-in-order"]')
    expect(await picker.locator('input.px-talk-filter').isVisible()).toBe(true)
    expect(await picker.locator('h1, h2, h3, h4, h5, h6, [role="heading"]').count()).toBe(0)
    expect(await picker.locator('ul.px-talk-contacts').count()).toBe(1)

    // THE ROWS ARE IN THE ORDER THE ONE FUNCTION GIVES, drawn by the names the registries hold.
    const book = await get<ContactsReply>('/api/messages/contacts')
    const registries = await get<{ agents?: { id: string; name: string }[]; people?: { id: string; name: string }[] }>('/api/participants')
    const nameOf = (who: { kind: string; id: string } | null): string =>
      (who === null ? '' : (who.kind === 'agent' ? registries.agents : registries.people)?.find((one) => one.id === who.id)?.name) ?? ''
    const expected = (await theRowsInOrder(book, { about: null, review: null })).rows.map((row) => nameOf(row.line.who))
    expect(expected).toEqual(expect.arrayContaining([HARBOUR.name, TIDE.name]))
    expect(await picker.locator('.px-talk-contact-name').allInnerTexts()).toEqual(expected)

    // THE FILTER NARROWS IT BY NAME.
    await picker.locator('input.px-talk-filter').fill('tide')
    await expect.poll(async () => picker.locator('.px-talk-contact-name').allInnerTexts(), { timeout: 10_000 }).toEqual([TIDE.name])
  })
})

describe('the order a ranking gives', () => {
  it('puts the agents it places first, with their words and sentence, and the rest after in the list\'s order', () => {
    // MADE-UP ROWS, in the shape GET /api/messages/contacts answers. Wave 13q's ranking is turned into the placed rows.
    const row = (key: string, who: { kind: 'agent' | 'person'; id: string }) => ({ key, who, at: 0 }) as never
    const contacts = [row('a', { kind: 'person', id: 'p1' }), row('b', { kind: 'agent', id: 'harbour' }), row('c', { kind: 'agent', id: 'tide' })]
    const placed = [
      { agentId: 'tide', reason: 'filed this', cannotReceive: null },
      { agentId: 'not-a-contact', reason: 'wrote here', cannotReceive: null },
      { agentId: 'harbour', reason: 'wrote here', cannotReceive: 'This agent is retired, so it cannot receive messages.' },
    ]
    expect(inTheOrderGiven(contacts, placed).map((one) => [(one.line as { key: string }).key, one.reason, one.cannotReceive])).toEqual([
      ['c', 'filed this', null],
      ['b', 'wrote here', 'This agent is retired, so it cannot receive messages.'],
      ['a', null, null],
    ])
    // NOTHING PLACED IS THE LIST AS IT IS, with no words: today's seam.
    expect(inTheOrderGiven(contacts, []).map((one) => [(one.line as { key: string }).key, one.reason])).toEqual([['a', null], ['b', null], ['c', null]])
  })
})

/** The same start as above, from wherever the column was left. */
async function startTheReviewInTheColumnFromAnywhere(toTheList: ReturnType<LiveApp['page']['locator']>): Promise<void> {
  await app.page.goto(`${app.site}/#/r/${reportId}`)
  await waitForThePage(app.page)
  if (!(await app.page.locator('.px-pane').isVisible())) await app.page.locator('.px-review-switch').click()
  if (await toTheList.count() > 0) await toTheList.click()
  await app.page.locator('.px-pane').getByRole('button', { name: 'Start a review here', exact: true }).click()
  await setTheReviewTraysList(app.page, 'open')
  await app.page.locator('.px-pane [data-part="your-review"] .px-b-list').waitFor({ timeout: 20_000 })
}

describe('pictures', () => {
  it('draws the saved group and the picker open in the column', { timeout: 300_000 }, async () => {
    const shots = process.env['REVIEW_SAVED_SHOTS']
    if (shots === undefined) return
    mkdirSync(shots, { recursive: true })
    // THE PICKER CASE ABOVE LEFT THE COLUMN OPEN ON A REVIEW WITH ONE TAKEN-IN COMMENT AND ITS LIST OF CONTACTS OPEN.
    const group = app.page.locator('.px-pane .px-rev-item').first()
    await group.waitFor({ timeout: 20_000 })
    for (const width of [1440, 990, 660, 390]) {
      for (const look of ['light', 'dark'] as const) {
        await app.page.setViewportSize({ width, height: 1000 })
        await app.page.emulateMedia({ colorScheme: look })
        await app.page.evaluate((theme) => { document.documentElement.dataset['theme'] = theme }, look)
        await group.scrollIntoViewIfNeeded()
        await app.page.screenshot({ path: join(shots, `review-saved-${String(width)}-${look}.png`) })
      }
    }

    /** One picture at 1440 in light in Chinese, after the same state is opened again in that language. */
    const inChinese = async (file: string, reopen: () => Promise<ReturnType<LiveApp['page']['locator']>>) => {
      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await app.page.emulateMedia({ colorScheme: 'light' })
      await app.page.evaluate(() => { document.documentElement.dataset['theme'] = 'light' })
      const shown = await reopen()
      await shown.scrollIntoViewIfNeeded()
      await app.page.waitForTimeout(500)
      await app.page.screenshot({ path: join(shots, file) })
    }
    /** The column as it was left, reloaded in a language, with the picker opened on the one saved comment. */
    const thePickerIn = async (lang: 'en' | 'zh', recordId: string) => {
      await app.page.goto(`${app.site}/?lang=${lang}#/r/${recordId}`)
      await app.page.reload()
      await waitForThePage(app.page)
      const item = app.page.locator('.px-pane .px-rev-item').first()
      await item.waitFor({ timeout: 30_000 })
      // MORE, by its place: the one press in the row's presses, pressed only while the row is folded.
      if (await item.locator('.px-rev-more').count() === 0) await item.locator('.px-rev-acts button').first().click()
      // THE PRESS THAT OPENS THE LIST, by its words in each language (review.pane.note.choose in en.ts and zh.ts).
      const choose = { en: 'Choose a recipient', zh: '选择发给谁' }[lang]
      await item.locator('.px-rev-more').getByRole('button', { name: choose, exact: true }).click()
      const list = item.locator('.px-review-contacts')
      await list.locator('.px-talk-contact').first().waitFor({ timeout: 20_000 })
      return list
    }
    await inChinese('review-saved-1440-zh.png', () => thePickerIn('zh', reportId))

    // THE REVIEW PANE'S RANKED PICKER: a report an agent filed, a comment saved on it, a review started there. The
    // filer is first with "filed this", and nothing is chosen (review.md section 5.2).
    const filed = await post<{ record: { id: string } }>('/api/records', {
      kind: 'report', title: 'Synthetic report filed by the harbour agent',
      data: { for: 'Robin Vale', date: '2026-10-01', blocks: [{ id: 'b-1', type: 'text', heading: 'Soundings', text: 'One place to look at.' }] },
    }, AS(HARBOUR.handle))
    reportId = filed.record.id
    const words = 'Synthetic saved comment four: is this depth right?'
    await post('/api/records', {
      kind: 'message', title: words.slice(0, 40),
      data: { body: words, target: { target: { kind: 'record', recordId: reportId, workspaceId: 'default' }, place: { at: 'surface' } } },
    })
    await new Promise((resolve) => setTimeout(resolve, 1_200))
    await app.page.goto(`${app.site}/?lang=en#/r/${reportId}`)
    await app.page.reload()
    const toTheList = app.page.locator('.px-pane').getByRole('button', { name: 'Your reviews', exact: true })
    await startTheReviewInTheColumnFromAnywhere(toTheList)
    await finishCollecting()
    const ranked = await thePickerIn('en', reportId)
    const first = ranked.locator('.px-talk-contact').first()
    expect(await first.locator('.px-talk-contact-name').innerText()).toBe(HARBOUR.name)
    expect(await first.locator('.px-pick-reason').innerText()).toBe('filed this')
    expect(await ranked.locator('.px-talk-contact[aria-selected="true"]').count(), 'nothing is chosen').toBe(0)
    for (const width of [1440, 990, 660, 390]) {
      for (const look of ['light', 'dark'] as const) {
        await app.page.setViewportSize({ width, height: 1000 })
        await app.page.emulateMedia({ colorScheme: look })
        await app.page.evaluate((theme) => { document.documentElement.dataset['theme'] = theme }, look)
        await ranked.scrollIntoViewIfNeeded()
        await app.page.screenshot({ path: join(shots, `review-ranked-${String(width)}-${look}.png`) })
      }
    }
    await inChinese('review-ranked-1440-zh.png', () => thePickerIn('zh', reportId))
  })
})
