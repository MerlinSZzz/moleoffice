// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REVIEW'S COMMENTS GO TO A CONTACT CHOSEN FROM THE CHAT'S CONTACTS. Problem sLyxTMlvze6A.
 *
 * The right-click panel lists the chat's contacts as one short list with a filter box, by option B of a
 * decision, and a review chooses the same way. The review pane used to choose from a ranked
 * list of agent runs over GET /api/agent/recipients. It now draws the panel's own list, `TheChatContacts`.
 *
 * THE REVIEW IS A COPY OF THE SHAPE OF THE ONE THE OWNER WAITS TO SEND (e1Ko0gDCPqhK), in this test's own office: a review
 * of a report, seven comments on it, collected, with nobody chosen for any of them. Every name and word is made up.
 * The browser pairs first, as the owner's own browser is paired, because sending asks for the owner's proof.
 *
 * Three-run proofs, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/a-review-sends-to-a-chat-contact.test.ts
 * After a green control, copy the changed file before each one-line mutation:
 * - The old picker back: in src/web/components/agent/ReviewBar.tsx, the per-comment `<ContactsForAReview` drawn
 *   as the old `RecipientPicker` over api.agentRecipients. The contact list never opens and this goes red.
 * - In src/server/lib/reviews.ts, `chosenOn` not reading a choice of kind "agent" (the `if (kind === 'agent')`
 *   branch taken out). The stored choices are then read as nobody chosen, nothing can go, and this goes red.
 * - In ReviewBar.tsx, ContactsForAReview choosing an agent with no record here by its registry id instead
 *   (`if (record === null)` to `if (false)`, with `agentRecordId: record ?? who.id`). The sentence is not drawn and a
 *   choice is stored, and the case about a contact a review cannot go to goes red.
 * Restore each file with cp, check it with cmp, and run this command again for green.
 * REVIEW_CONTACT_SHOTS saves the contact list open in the pane at the four chapter 6 widths in both looks.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ReviewDetail, SendOutcome } from '../src/server/lib/reviews.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const { t } = createI18n('en')
const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS = (handle: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })
const CONTACT = 'Harbour survey agent'
/** An agent whose only record is in another project. */
const FAR_CONTACT = 'Far harbour agent'
const COMMENTS = 7
let app: LiveApp
let reportId: string
let reviewId: string
/** The agent's record in this project, which is what a comment's choice and a message name it by. */
let agentRecordId: string
const commentIds: string[] = []

async function post<T>(path: string, body: unknown, headers: Record<string, string> = PERSON): Promise<T> {
  const reply = await fetch(app.api + path, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return await reply.json() as T
}

beforeAll(async () => {
  app = await liveApp({ name: 'review-to-a-contact', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  // THE CONTACT: an agent that has written to the person, which is how the chat's contacts come to hold it.
  await post('/api/records', { kind: 'agent', title: CONTACT, data: { handle: 'harbour-survey', runtime: 'claude-code', state: 'active' } })
  const agents = (await (await fetch(`${app.api}/api/participants`, { headers: PERSON })).json()) as {
    agents: { id: string; handle: string; record?: string | null }[]
  }
  agentRecordId = agents.agents.find((one) => one.handle === 'harbour-survey')?.record ?? ''
  expect(agentRecordId).not.toBe('')
  await post('/api/records', {
    kind: 'message', title: 'A note',
    data: { body: 'The harbour soundings are in.', to: [{ kind: 'person', id: THE_PERSON }] },
  }, AS('harbour-survey'))

  const report = await post<{ record: { id: string } }>('/api/records', {
    kind: 'report', title: 'Synthetic proposal: the harbour pages drawn again',
    data: { for: 'Robin Vale', date: '2026-09-28', blocks: [{ id: 'b-1', type: 'text', heading: 'The proposal', text: 'Seven places to look at.' }] },
  })
  reportId = report.record.id
  const target = { target: { kind: 'record', recordId: reportId, workspaceId: 'default' }, place: { at: 'surface' } }
  const review = await post<{ review: { id: string } }>('/api/reviews', { entry: target })
  reviewId = review.review.id
  for (let n = 1; n <= COMMENTS; n += 1) {
    const comment = await post<{ record: { id: string } }>('/api/records', {
      kind: 'message', title: `Synthetic comment ${String(n)}`,
      data: { body: `Synthetic comment ${String(n)}: look at this place again.`, target },
    })
    commentIds.push(comment.record.id)
  }
  await post(`/api/reviews/${reviewId}/finish-collecting`, {})

  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: 'Pair this browser', exact: true }).click()
  await app.page.getByText('This browser is paired.', { exact: true }).waitFor()
})

afterAll(async () => { await app?.stop() })

async function readReview(): Promise<ReviewDetail> {
  const reply = await fetch(`${app.api}/api/reviews/${reviewId}`, { headers: PERSON })
  expect(reply.status).toBe(200)
  return await reply.json() as ReviewDetail
}

describe('a collected review goes to a contact chosen from the chat contacts', () => {
  it('chooses the contact for each of the seven comments, from the chat list, and sends them to that agent', { timeout: 180_000 }, async () => {
    const askedTheOldList: string[] = []
    // THE OLD LIST IS GET /api/agent/recipients itself. GET /api/agent/recipients/agents is the one ranking the new list
    // orders its rows by (src/web/components/ContactsInOrder.tsx), so it is not counted here.
    app.page.on('request', (request) => {
      const path = new URL(request.url()).pathname
      if (path === '/api/agent/recipients') askedTheOldList.push(request.url())
    })

    await app.page.goto(`${app.site}/#/r/${reportId}`)
    await waitForThePage(app.page)
    await app.page.locator('.px-review-switch').click()
    await app.page.locator('.px-pane-list .px-rev-go').click()
    await app.page.getByRole('button', { name: 'Send this review', exact: true }).waitFor()

    const pane = app.page.locator('.px-pane')
    // WHO READS THEM IS CHOSEN FROM THE SAME LIST: the ask for an agent to read the comments.
    const reading = pane.locator('[data-part="have-them-read"]')
    await reading.getByRole('button', { name: 'Choose a reader', exact: true }).click()
    await reading.locator('.px-review-contacts .px-talk-contact', { hasText: CONTACT }).click()
    await expect.poll(async () => reading.locator('.px-org-to').innerText(), { timeout: 20_000 }).toBe(`To ${CONTACT}`)

    // EACH COMMENT'S CHOICE IS UNDER ITS ROW'S "More", one row at a time, in the order the pane draws them.
    for (let n = 0; n < COMMENTS; n += 1) {
      const acts = pane.locator('.px-rev-acts').nth(n)
      const press = acts.getByRole('button', { name: 'More', exact: true })
      if (await press.count() > 0) await press.click()
      const opened = pane.locator('.px-rev-more')
      await opened.getByRole('button', { name: 'Choose a recipient', exact: true }).click()
      // THE CHAT'S OWN LIST: its filter box and its rows, one per contact.
      const list = opened.locator('.px-review-contacts')
      await list.locator('.px-talk-filter').waitFor({ timeout: 20_000 })
      const stored = app.page.waitForResponse((response) => response.url().includes('/api/records/') && response.request().method() === 'PATCH')
      await list.locator('.px-talk-contact', { hasText: CONTACT }).click()
      expect((await stored).status()).toBe(200)
      await opened.getByRole('button', { name: 'Change the recipient', exact: true }).waitFor({ timeout: 20_000 })
      await acts.getByRole('button', { name: 'Less', exact: true }).click()
    }
    expect(askedTheOldList).toEqual([])

    // EACH CHOICE IS STORED AS THE AGENT THE CONTACT NAMES.
    const before = await readReview()
    expect(before.members).toHaveLength(COMMENTS)
    for (const member of before.members) expect(member).toMatchObject({ chosen: { says: expect.stringContaining(CONTACT) as unknown } })

    const reply = app.page.waitForResponse((response) =>
      response.url() === `${app.api}/api/reviews/${reviewId}/send` && response.request().method() === 'POST')
    await app.page.getByRole('button', { name: 'Send this review', exact: true }).click()
    const sent = await reply
    expect(sent.status(), await sent.text()).toBe(200)
    const outcome = await sent.json() as SendOutcome
    expect(outcome.held).toEqual([])
    await app.page.getByText('This review has gone', { exact: true }).waitFor()

    const after = await readReview()
    expect(after.review.state).toBe('sent')
    for (const member of after.members) expect(member).toMatchObject({ state: 'sent' })
    // AND IT WENT TO THAT AGENT: the conversation's message is addressed to the durable agent the contact names.
    const thread = (await (await fetch(`${app.api}/api/agent/threads/${outcome.threadId}`, { headers: PERSON })).json()) as {
      messages: { recipient: { kind: string; agentId: string | null } | null }[]
    }
    expect(thread.messages.length).toBeGreaterThan(0)
    for (const message of thread.messages) expect(message.recipient).toMatchObject({ kind: 'agent', agentId: agentRecordId })
  })
})

describe('a contact a review cannot go to', () => {
  /**
   * AN AGENT WITH NO RECORD IN THIS PROJECT. The chat's contacts are gathered from every project, so an agent whose only
   * record is in another project, and who has written to the person there, is a contact here too. A review cannot go
   * to it: a comment's choice names an agent by its record in this project. The press chooses nobody, stores nothing,
   * leaves the list open, and says it has no record here. (A person contact takes the same path with its own sentence; a fresh office
   * holds no second person whose conversation would put one in the list, so no case presses one.)
   */
  it('says an agent has no record here, and stores nothing', { timeout: 120_000 }, async () => {
    const made = await fetch(`${app.api}/api/workspaces`, { method: 'POST', headers: PERSON, body: JSON.stringify({ id: 'far-harbour', title: 'Far harbour' }) })
    expect(made.status, await made.text()).toBe(201)
    const there = { ...PERSON, 'x-mole-office-workspace': 'far-harbour' }
    await post('/api/records', { kind: 'agent', title: FAR_CONTACT, data: { handle: 'far-harbour-agent', runtime: 'claude-code', state: 'active' } }, there)
    await post('/api/records', {
      kind: 'message', title: 'A note',
      data: { body: 'The far harbour soundings are in.', to: [{ kind: 'person', id: THE_PERSON }] },
    }, { ...there, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'far-harbour-agent' })

    const note = await post<{ record: { id: string } }>('/api/records', {
      kind: 'note', title: 'Synthetic page for a contact with no record here', data: { body: 'One place to look at.' },
    })
    const target = { target: { kind: 'record', recordId: note.record.id, workspaceId: 'default' }, place: { at: 'surface' } }
    const review = await post<{ review: { id: string } }>('/api/reviews', { entry: target })
    await post('/api/records', { kind: 'message', title: 'Synthetic comment', data: { body: 'Synthetic comment for a far contact.', target } })
    await post(`/api/reviews/${review.review.id}/finish-collecting`, {})

    await app.page.goto(`${app.site}/#/r/${note.record.id}`)
    // A NEW DOCUMENT, so the contacts are read afresh: the page reads them once, and they were read above.
    await app.page.reload()
    await waitForThePage(app.page)
    if (!(await app.page.locator('.px-pane').isVisible())) await app.page.locator('.px-review-switch').click()
    const toTheList = app.page.locator('.px-pane').getByRole('button', { name: 'Your reviews', exact: true })
    if (await toTheList.count() > 0) await toTheList.click()
    await app.page.locator('.px-pane-list .px-rev-go').first().click()
    await app.page.locator('.px-pane .px-rev-acts').first().getByRole('button', { name: 'More', exact: true }).click()
    await app.page.getByRole('button', { name: 'Choose a recipient', exact: true }).first().click()
    const list = app.page.locator('.px-review-contacts')
    await list.locator('.px-talk-contact').first().waitFor({ timeout: 20_000 })

    const stored: string[] = []
    app.page.on('request', (request) => { if (request.method() === 'PATCH' && request.url().includes('/api/records/')) stored.push(request.url()) })
    await list.locator('.px-talk-contact', { hasText: FAR_CONTACT }).click()
    await list.getByText(t('savedComment.agentHasNoRecord'), { exact: true })
      .waitFor({ timeout: 20_000 })
    expect(await list.locator('.px-talk-filter').isVisible()).toBe(true)
    expect(stored).toEqual([])
    const after = (await (await fetch(`${app.api}/api/reviews/${review.review.id}`, { headers: PERSON })).json()) as ReviewDetail
    for (const member of after.members) expect(member).toMatchObject({ chosen: null })
  })
})

describe('pictures', () => {
  it('draws the contact list open in the pane', { timeout: 300_000 }, async () => {
    const shots = process.env['REVIEW_CONTACT_SHOTS']
    if (shots === undefined) return
    mkdirSync(shots, { recursive: true })
    const note = await post<{ record: { id: string } }>('/api/records', {
      kind: 'note', title: 'Synthetic page for the pictures', data: { body: 'One place to look at.' },
    })
    const target = { target: { kind: 'record', recordId: note.record.id, workspaceId: 'default' }, place: { at: 'surface' } }
    const review = await post<{ review: { id: string } }>('/api/reviews', { entry: target })
    await post('/api/records', { kind: 'message', title: 'Synthetic comment', data: { body: 'Synthetic comment for the pictures.', target } })
    await post(`/api/reviews/${review.review.id}/finish-collecting`, {})
    // OPENED ONCE: the pane, the comment's row and the contact list. Each picture then changes only the width and look.
    await app.page.goto(`${app.site}/#/r/${note.record.id}`)
    await waitForThePage(app.page)
    // THE PANE MAY STILL BE OPEN from the send above, so it is opened only if it is closed, and the review is found
    // as the first in the list of reviews, which is the newest; the other has been sent.
    if (!(await app.page.locator('.px-pane').isVisible())) await app.page.locator('.px-review-switch').click()
    const toTheList = app.page.locator('.px-pane').getByRole('button', { name: 'Your reviews', exact: true })
    if (await toTheList.count() > 0) await toTheList.click()
    await app.page.locator('.px-pane-list .px-rev-go').first().click()
    await app.page.locator('.px-pane .px-rev-acts').first().getByRole('button', { name: 'More', exact: true }).click()
    await app.page.getByRole('button', { name: 'Choose a recipient', exact: true }).first().click()
    const list = app.page.locator('.px-review-contacts')
    await list.locator('.px-talk-contact').first().waitFor({ timeout: 20_000 })
    for (const width of [1440, 990, 660, 390]) {
      for (const look of ['light', 'dark'] as const) {
        await app.page.setViewportSize({ width, height: 1000 })
        await app.page.emulateMedia({ colorScheme: look })
        await app.page.evaluate((theme) => { document.documentElement.dataset['theme'] = theme }, look)
        await list.scrollIntoViewIfNeeded()
        await app.page.screenshot({ path: join(shots, `review-contacts-${String(width)}-${look}.png`) })
      }
    }
  })
})
