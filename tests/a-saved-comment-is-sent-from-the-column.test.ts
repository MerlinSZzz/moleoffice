// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COMMENT SAVED WITHOUT SENDING IS SENT, CHANGED AND REMOVED FROM THE COLUMN ITS COUNT OPENS.
 * Problem 7VI4cV5ppiFQ.
 *
 * Comments left on a report with Save without sending, opened by the count beside the block,
 * showed in the column with nothing to press. A message says saved comments that were not sent had
 * no way to be sent; the column showed them, but nothing could be done with them.
 *
 * WHAT THIS DOES, IN A REAL BROWSER, IN ITS OWN OFFICE. Every name and word is made up. A report with
 * one block; an agent that has written to the person, which is how the chat's contacts come to hold
 * it. Three comments are saved without sending on the report, through the write that press made (shape B, wave 13r
 * round 15, has no such press; a comment saved before it, or left by an abandoned review, is the same record). Then the person presses
 * the count beside the block, and from the column:
 *   1. sends the first to the agent chosen from the contacts list: the agent's conversation then
 *      holds it, and the presses under it give way to who it waits for;
 *   2. changes the words of the second;
 *   3. removes the third: the count beside the block falls by one, and the record is soft-deleted
 *      with the change log naming the removal.
 * The message worker's queue (GET /api/worker/queue) says the first is not held by any review: it goes
 * to the agent as any message does.
 *
 * AND WHERE A REVIEW LISTS THE COMMENT (problem g4M_z6965R5o). On a second report, a comment saved
 * without sending and then a review started there: the review lists it, so the column says "Goes
 * with the review", its press is "Save the recipient", and after the choice the worker's queue says
 * the review holds it. Sending the review is what lets it go.
 *
 * Three-run proofs, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/a-saved-comment-is-sent-from-the-column.test.ts
 * After a green control, copy src/web/components/agent/SavedComment.tsx before each one-line mutation:
 * - The send press removed: in `send`, the line `await api.chooseWhoItIsFor(...)` taken out. Nothing is
 *   addressed, and the case about sending goes red.
 * - The recipient not passed: the same line with `null` in place of the agent. The comment stays
 *   addressed to nobody, and the case about sending goes red.
 * - The column not asking which review holds it: `const holding = (await api.reviewHolding(note.id)).review`
 *   made `const holding = null`. The review path's words are the send path's, and its case goes red.
 * In src/web/components/ContactsInOrder.tsx, the one seam `theRowsInOrder` (copy it first too):
 * - The ranking not read: in `theRanking`, `api.agentRanking(asked.about, asked.review?.id ?? null)` made
 *   `Promise.resolve(null)`. The rows come in the book's order, and the cases about the filer and the retired filer
 *   go red.
 * In src/server/lib/recipients.ts, where the review's starter is ranked now (GET /api/agent/recipients/agents with
 * review=<id>):
 * - The starter's reason not added: in `agentRankingFor`, `fromTheStarter` made `[]`. The review case goes red.
 * In src/web/components/agent/SavedComment.tsx:
 * - A review's comment chosen for in advance: `|| asked.review !== null` taken out of the preselect effect. The case
 *   about a review holding the comment goes red.
 * In src/server/lib/reviews.ts, with COLUMN_SAVED_SHOTS set, because only the pictures case draws a sent review:
 * - `sent` left out of `ENDED_REVIEW_STATES`. The sent review is said to hold the comment, and the pictures case goes red.
 * Restore the file with cp, check it with cmp, and run the command again for green.
 * COLUMN_SAVED_SHOTS=<folder> saves the pictures the last case names.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { t } from '../src/shared/i18n.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS = (handle: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

const CONTACT = 'Harbour survey agent'
const HANDLE = 'harbour-survey'
const HEADING = 'The soundings'
const TO_SEND = 'Synthetic comment one: the depth at the north pier looks too shallow.'
const TO_CHANGE = 'Synthetic comment two: the tide table is from last year.'
const CHANGED = 'Synthetic comment two, changed: the tide table is from 2025.'
const TO_REMOVE = 'Synthetic comment three: this sentence repeats the one above.'

let app: LiveApp
let reportId = ''
/** A second report, where a review lists the comment saved on it. */
let reviewedId = ''
let heldId = ''
/** The record of the agent that asked for the review. */
let starterRecordId = ''
const TO_HOLD = 'Synthetic comment four: the second report needs a map.'
/** An agent that filed a report, and one that filed a report and was retired. Made-up names. */
const FILER = 'Pier survey agent'
const OLD_FILER = 'Old pier agent'
/** The agent that asked for the review on the second report. */
const STARTER = 'Tide table agent'
let filedId = ''
let retiredFiledId = ''
/** The agent's registry id, which a delivery row and a conversation are addressed to. */
let agentId = ''
const ids: Record<'send' | 'change' | 'remove', string> = { send: '', change: '', remove: '' }

async function post<T>(path: string, body: unknown, headers: Record<string, string> = PERSON): Promise<T> {
  const reply = await fetch(app.api + path, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return (await reply.json()) as T
}

async function get<T>(path: string): Promise<T> {
  const reply = await fetch(app.api + path, { headers: PERSON })
  expect(reply.status, await reply.clone().text()).toBe(200)
  return (await reply.json()) as T
}

interface Message {
  id: string
  body: string
  to: { kind: string; id: string }[]
  notSentYet: boolean
}

/** Every comment in the project, as the column reads them. */
async function comments(): Promise<{ id: string; kind: string; data: { body?: string; target?: unknown } }[]> {
  return (await get<{ comments: { id: string; kind: string; data: { body?: string; target?: unknown } }[] }>('/api/messages/comments'))
    .comments
}

/** The message worker's own row for one message: whether a review holds it back. */
async function theWorkersRow(messageId: string): Promise<{ heldByAReview: string | null } | undefined> {
  const queue = await get<{ queue: { messageId: string; heldByAReview: string | null }[] }>('/api/worker/queue')
  return queue.queue.find((one) => one.messageId === messageId)
}

/** The count beside the block, as drawn. */
async function theCount(): Promise<string> {
  return ((await app.page.locator('.px-comment-circle').first().textContent()) ?? '').trim()
}

beforeAll(async () => {
  app = await liveApp({ name: 'saved-comment-sent', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  await post('/api/records', { kind: 'agent', title: CONTACT, data: { handle: HANDLE, runtime: 'claude-code', state: 'active' } })
  const registries = await get<{ agents: { id: string; handle: string }[] }>('/api/participants')
  agentId = registries.agents.find((one) => one.handle === HANDLE)?.id ?? ''
  expect(agentId).not.toBe('')
  // THE CONTACT: an agent that has written to the person.
  await post('/api/records', {
    kind: 'message', title: 'A note',
    data: { body: 'The harbour soundings are in.', to: [{ kind: 'person', id: THE_PERSON }] },
  }, AS(HANDLE))
  const report = await post<{ record: { id: string } }>('/api/records', {
    kind: 'report', title: 'Synthetic report: the harbour soundings',
    data: {
      for: 'Robin Vale', date: '2026-10-01',
      blocks: [{ id: 'b-1', type: 'text', heading: HEADING, text: 'The north pier reads four metres at low water.' }],
    },
  })
  reportId = report.record.id
  const reviewed = await post<{ record: { id: string } }>('/api/records', {
    kind: 'report', title: 'Synthetic report: the harbour map',
    data: { for: 'Robin Vale', date: '2026-10-01', blocks: [{ id: 'b-1', type: 'text', heading: 'The map', text: 'The map is not drawn yet.' }] },
  })
  reviewedId = reviewed.record.id

  // THREE MORE AGENTS, EACH A CONTACT because each has written to the person.
  const agentRecords: Record<string, string> = {}
  for (const [title, handle] of [[FILER, 'pier-survey'], [OLD_FILER, 'old-pier'], [STARTER, 'tide-table']] as const) {
    const made = await post<{ record: { id: string } }>('/api/records', { kind: 'agent', title, data: { handle, runtime: 'claude-code', state: 'active' } })
    agentRecords[handle] = made.record.id
    await post('/api/records', { kind: 'message', title: 'A note', data: { body: `${title} reporting in.`, to: [{ kind: 'person', id: THE_PERSON }] } }, AS(handle))
  }
  starterRecordId = agentRecords['tide-table'] ?? ''
  // A REPORT EACH OF THE FIRST TWO FILED, and a comment the person saved on each.
  for (const [handle, set] of [['pier-survey', (id: string) => { filedId = id }], ['old-pier', (id: string) => { retiredFiledId = id }]] as const) {
    const filed = await post<{ record: { id: string } }>('/api/records', {
      kind: 'report', title: `Synthetic report filed by ${handle}`,
      data: { for: 'Robin Vale', date: '2026-10-01', blocks: [{ id: 'b-1', type: 'text', heading: 'The pier', text: 'The pier needs paint.' }] },
    }, AS(handle))
    set(filed.record.id)
    const target = { target: { kind: 'record', recordId: filed.record.id, workspaceId: 'default' }, place: { at: 'surface' } }
    await post('/api/records', { kind: 'message', title: 'Synthetic comment on a filed report', data: { body: `Synthetic comment on what ${handle} filed.`, target } })
  }
  // THE SECOND FILER IS RETIRED, so the message door would refuse it.
  const oldPier = (await get<{ agents: { id: string; handle: string }[] }>('/api/participants')).agents.find((one) => one.handle === 'old-pier')?.id ?? ''
  const retired = await fetch(`${app.api}/api/participants/agent/${encodeURIComponent(oldPier)}/retire`, {
    method: 'POST', headers: PERSON, body: JSON.stringify({ because: 'Synthetic: this test needs an agent that cannot receive.' }),
  })
  expect(retired.status, await retired.text()).toBe(200)

  // PAIRED, as the owner's own browser is.
  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: 'Pair this browser', exact: true }).click()
  await app.page.getByText('This browser is paired.', { exact: true }).waitFor()
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('comments saved without sending, and the column the count opens', () => {
  it('keeps three comments saved without sending on the same place', { timeout: 180_000 }, async () => {
    // SHAPE B HAS NO SAVE WITHOUT SENDING (wave 13r round 15): Start review took its place, and a comment it keeps is in
    // the review. A comment saved without sending still exists, written before shape B or left when a review that
    // held it was abandoned, and the column is still where it is sent from. So the three are written here as that
    // press wrote them: a message with a place and nobody to go to.
    const target = { target: { kind: 'record', recordId: reportId, workspaceId: 'default' }, place: { at: 'surface' } }
    const first = await post<{ record: { id: string } }>('/api/records', { kind: 'message', title: TO_SEND.slice(0, 40), data: { body: TO_SEND, target } })
    const saved = (await comments()).find((one) => one.id === first.record.id)
    expect(saved, 'the write stored the comment').toBeDefined()
    ids.send = first.record.id
    const stored = await get<{ message: Message }>(`/api/messages/${ids.send}`)
    expect(stored.message.to, 'saved without sending, it is addressed to nobody').toEqual([])

    for (const [which, body] of [['change', TO_CHANGE], ['remove', TO_REMOVE]] as const) {
      const made = await post<{ record: { id: string } }>('/api/records', { kind: 'message', title: body.slice(0, 40), data: { body, target } })
      ids[which] = made.record.id
    }
  })

  it('sends the first to the agent chosen from the contacts list, and the agent’s conversation holds it', { timeout: 180_000 }, async () => {
    await app.page.goto(`${app.site}/#/r/${reportId}`)
    await app.page.reload()
    await waitForThePage(app.page)
    await expect.poll(theCount, { timeout: 30_000 }).toBe('3')
    await app.page.locator('.px-comment-circle').first().click()
    await app.page.getByText('Comments here', { exact: true }).waitFor({ timeout: 30_000 })

    const row = app.page.locator(`[data-saved-comment="${ids.send}"]`)
    await row.getByRole('button', { name: 'Send this comment', exact: true }).click()
    // NOBODY IS CHOSEN YET, so the press asks: the contacts list opens, with its filter box.
    await row.locator('.px-talk-filter').waitFor({ timeout: 20_000 })
    await row.locator('.px-talk-contact', { hasText: CONTACT }).click()
    await expect.poll(async () => (await row.locator('.px-saved-chosen').innerText()).replace(/\s*▾$/, ''), { timeout: 20_000 })
      .toBe(`To ${CONTACT}`)
    const patched = app.page.waitForResponse((response) =>
      response.url().endsWith(`/api/records/${ids.send}`) && response.request().method() === 'PATCH')
    await row.getByRole('button', { name: 'Send this comment', exact: true }).click()
    expect((await patched).status()).toBe(200)

    const after = await get<{ message: Message }>(`/api/messages/${ids.send}`)
    expect(after.message.to, 'the comment is addressed to the chosen agent').toEqual([{ kind: 'agent', id: agentId }])
    const conversation = await get<{ messages: { id: string }[] }>(
      `/api/messages/conversation?kind=agent&id=${encodeURIComponent(agentId)}`,
    )
    expect(conversation.messages.map((one) => one.id), 'the agent’s conversation holds it').toContain(ids.send)
    const worker = await theWorkersRow(ids.send)
    expect(worker, 'the message worker has it to hand over').toBeDefined()
    expect(worker?.heldByAReview, 'no review holds it, so it goes as any message does').toBeNull()

    // THE PRESSES GIVE WAY TO WHO IT WAITS FOR.
    await app.page.locator(`[data-saved-comment="${ids.send}"]`).waitFor({ state: 'detached', timeout: 20_000 })
    const waits = app.page.locator('.px-saved-to', { hasText: CONTACT })
    await waits.waitFor({ timeout: 20_000 })
    expect((await waits.innerText()).replace(/\s+/g, ' ').trim()).toBe(`${t('savedComment.notSent')} To ${CONTACT}`)
  })

  it('changes the words of the second', { timeout: 120_000 }, async () => {
    const row = app.page.locator(`[data-saved-comment="${ids.change}"]`)
    await row.getByRole('button', { name: 'Edit', exact: true }).click()
    await row.getByRole('textbox', { name: 'What this comment says' }).fill(CHANGED)
    await row.getByRole('button', { name: 'Save the change', exact: true }).click()
    await app.page.locator('.px-rev-words', { hasText: CHANGED }).waitFor({ timeout: 20_000 })
    const after = await get<{ message: Message }>(`/api/messages/${ids.change}`)
    expect(after.message.body).toBe(CHANGED)
    expect(after.message.to, 'changing the words sends nothing').toEqual([])
  })

  it('removes the third: the count falls, and the record is kept as deleted with its change', { timeout: 120_000 }, async () => {
    const row = app.page.locator(`[data-saved-comment="${ids.remove}"]`)
    await row.getByRole('button', { name: 'Remove', exact: true }).click()
    await app.page.locator('.px-rev-words', { hasText: TO_REMOVE }).waitFor({ state: 'detached', timeout: 20_000 })
    await expect.poll(theCount, { timeout: 30_000 }).toBe('2')
    expect((await comments()).map((one) => one.id)).not.toContain(ids.remove)
    // A SOFT DELETE: the newest revision is the delete, and the record can be brought back.
    const revisions = await get<{ revisions: { op: string }[] }>(`/api/records/${ids.remove}/revisions`)
    expect(revisions.revisions[0]?.op, 'the record keeps its history, the delete newest').toBe('delete')
    const back = await fetch(`${app.api}/api/records/${ids.remove}/restore`, { method: 'POST', headers: PERSON })
    expect(back.status, await back.text()).toBe(200)
  })
})

describe('where a review lists the comment, the column says it goes with the review', () => {
  it('says so, saves who it is for, and the worker holds it for the review', { timeout: 180_000 }, async () => {
    const target = { target: { kind: 'record', recordId: reviewedId, workspaceId: 'default' }, place: { at: 'surface' } }
    const made = await post<{ record: { id: string } }>('/api/records', { kind: 'message', title: TO_HOLD.slice(0, 40), data: { body: TO_HOLD, target } })
    heldId = made.record.id
    // A REVIEW STARTED AFTER IT, by the person who saved it, on the same report: it lists the comment.
    await new Promise((resolve) => setTimeout(resolve, 1_100))
    const review = await post<{ review: { id: string } }>('/api/reviews', { entry: target, startedByAgent: starterRecordId })
    // Since wave 13r round 15 the review takes the comment in as a member when it starts (record 9BZZVKQxWV9Z,
    // detail 3), so it is among the members; it would be listed as saved if it had not been taken in.
    const detail = await get<{ members: { id: string }[]; saved: { id: string }[] }>(`/api/reviews/${review.review.id}`)
    expect([...detail.members, ...detail.saved].map((one) => one.id), 'the review holds the saved comment').toContain(heldId)

    await app.page.goto(`${app.site}/#/r/${reviewedId}`)
    await app.page.reload()
    await waitForThePage(app.page)
    await expect.poll(theCount, { timeout: 30_000 }).toBe('1')
    await app.page.locator('.px-comment-circle').first().click()
    const row = app.page.locator(`[data-saved-comment="${heldId}"]`)
    await row.getByText('Goes with the review', { exact: true }).waitFor({ timeout: 30_000 })
    expect(await row.getByRole('button', { name: 'Send this comment', exact: true }).count(), 'nothing offers to send it now').toBe(0)
    // THE AGENT THAT ASKED FOR THE REVIEW IS FIRST, saying so, and the server says it can receive. Nobody is chosen in
    // advance all the same, because a review holds the comment (review.md section 5.2): no "To" is drawn before a press.
    expect(await row.locator('.px-saved-chosen').count(), 'nobody is chosen in advance').toBe(0)
    await row.getByRole('button', { name: 'Choose a recipient', exact: true }).click()
    const first = row.locator('.px-talk-contact').first()
    await first.waitFor({ timeout: 20_000 })
    expect(await first.locator('.px-talk-contact-name').innerText()).toBe(STARTER)
    expect(await first.locator('.px-pick-reason').innerText()).toBe('started this review')
    await row.locator('.px-talk-contact', { hasText: CONTACT }).click()
    const patched = app.page.waitForResponse((response) =>
      response.url().endsWith(`/api/records/${heldId}`) && response.request().method() === 'PATCH')
    await row.getByRole('button', { name: 'Save the recipient', exact: true }).click()
    expect((await patched).status()).toBe(200)

    const after = await get<{ message: Message }>(`/api/messages/${heldId}`)
    expect(after.message.to, 'it is for the chosen agent').toEqual([{ kind: 'agent', id: agentId }])
    expect(after.message.notSentYet, 'and nobody has been handed it').toBe(true)
    const worker = await theWorkersRow(heldId)
    expect(worker?.heldByAReview ?? null, 'the worker holds it for the review').not.toBeNull()
    // THE COLUMN SAYS THE SAME after the choice: who it is for, and that it goes with the review.
    const waits = app.page.locator('.px-saved-to', { hasText: CONTACT })
    await waits.waitFor({ timeout: 20_000 })
    expect(await waits.getByText('Goes with the review', { exact: true }).count()).toBe(1)
  })
})

describe('the ranking orders the list and chooses in advance (problem Nu0y2IKdzPcw)', () => {
  /** Open the column on the one comment on a report, and answer its row. */
  async function theRowOn(recordId: string, title: string) {
    await app.page.goto(`${app.site}/#/r/${recordId}`)
    // LEAVING A PAGE WHOSE REVIEW HOLDS A COMMENT NOT SENT ASKS WHAT TO DO (wave 13r round 15). The case above left
    // the second report under a review that holds comment four, so leaving it asks. Keep changes nothing and goes on.
    const question = app.page.locator('[data-part="leave-question"]')
    const arrived = app.page.getByRole('heading', { name: title, exact: true })
    await Promise.race([question.waitFor({ timeout: 30_000 }), arrived.waitFor({ timeout: 30_000 })])
    if (await question.isVisible()) {
      await question.getByRole('button', { name: 'Keep', exact: true }).click()
      await question.waitFor({ state: 'detached' })
    }
    await arrived.waitFor({ timeout: 30_000 })
    await app.page.reload()
    await waitForThePage(app.page)
    await expect.poll(theCount, { timeout: 30_000 }).toBe('1')
    await app.page.locator('.px-comment-circle').first().click()
    const row = app.page.locator('[data-saved-comment]').first()
    await row.getByRole('button', { name: 'Edit', exact: true }).waitFor({ timeout: 30_000 })
    return row
  }

  it('puts the agent that filed the record first, saying "filed this", and chooses it in advance', { timeout: 120_000 }, async () => {
    const row = await theRowOn(filedId, 'Synthetic report filed by pier-survey')
    const chosen = row.locator('.px-saved-chosen')
    await chosen.waitFor({ timeout: 20_000 })
    expect((await chosen.innerText()).replace(/\s*▾$/, '').replace(/\s+/g, ' ').trim()).toBe(`To ${FILER}`)
    await chosen.click()
    const first = row.locator('.px-talk-contact').first()
    await first.waitFor({ timeout: 20_000 })
    expect(await first.locator('.px-talk-contact-name').innerText()).toBe(FILER)
    expect(await first.locator('.px-pick-reason').innerText()).toBe('filed this')
    expect(await first.getAttribute('aria-selected')).toBe('true')
  })

  it('draws a filer that cannot receive first but unchoosable, with the door’s sentence, and chooses nobody', { timeout: 120_000 }, async () => {
    const row = await theRowOn(retiredFiledId, 'Synthetic report filed by old-pier')
    await app.page.waitForTimeout(1_500)
    expect(await row.locator('.px-saved-chosen').count(), 'nobody is chosen in advance').toBe(0)
    await row.getByRole('button', { name: 'Send this comment', exact: true }).click()
    const first = row.locator('.px-talk-contact').first()
    await first.waitFor({ timeout: 20_000 })
    expect(await first.locator('.px-talk-contact-name').innerText()).toContain(OLD_FILER)
    expect(await first.locator('.px-pick-reason').innerText()).toBe('filed this')
    expect(await first.getAttribute('aria-disabled')).toBe('true')
    const cannot = row.locator('.px-pick-cannot').first()
    expect(await cannot.innerText(), 'a short state').toContain('Cannot receive messages now')
    expect((await cannot.getAttribute('title'))?.length ?? 0, 'the door’s own sentence, under the pointer').toBeGreaterThan(10)
    // A PRESS ON IT CHOOSES NOBODY. Forced, because the browser itself treats the row as one that cannot be pressed.
    await first.click({ force: true })
    expect(await row.locator('.px-saved-chosen').count()).toBe(0)
  })

  it('ranks the list but chooses nobody once a review holds the comment (review.md section 5.2)', { timeout: 120_000 }, async () => {
    // A REVIEW OF THE FILED REPORT, started by the person after the comment was saved: it lists the comment.
    const target = { target: { kind: 'record', recordId: filedId, workspaceId: 'default' }, place: { at: 'surface' } }
    await post('/api/reviews', { entry: target })
    const row = await theRowOn(filedId, 'Synthetic report filed by pier-survey')
    await row.getByText('Goes with the review', { exact: true }).waitFor({ timeout: 30_000 })
    await app.page.waitForTimeout(1_500)
    expect(await row.locator('.px-saved-chosen').count(), 'nobody is chosen for a review').toBe(0)
    await row.getByRole('button', { name: 'Choose a recipient', exact: true }).click()
    const first = row.locator('.px-talk-contact').first()
    await first.waitFor({ timeout: 20_000 })
    expect(await first.locator('.px-talk-contact-name').innerText()).toBe(FILER)
    expect(await first.locator('.px-pick-reason').innerText()).toBe('filed this')
  })
})

/**
 * PICTURES, ONLY WITH COLUMN_SAVED_SHOTS=<folder>. Without it this case returns at once and takes none.
 *
 * Each state is set up afresh here, because the cases above leave the first report under a review and the second
 * comment addressed. Each is drawn at 1440, 990, 660 and 390 in light and dark, and once at 1440 in Chinese.
 *   column-saved-filed-to-<width>-<look>.png      a report an agent filed: "To <the filer>" before any press
 *   column-saved-filed-list-<width>-<look>.png    the same, the list open, the filer first, "filed this"
 *   column-saved-retired-list-<width>-<look>.png  a retired filer, first and greyed out, with the door's sentence
 *   column-saved-review-list-<width>-<look>.png   a review an agent asked for: "Goes with the review", the list open,
 *                                                 the starter first, "started this review"
 *   column-saved-sent-review-<width>-<look>.png   a comment saved before a review that was sent: no review holds it,
 *                                                 so the row offers its own send (check 9K27DM6LOr_Z)
 * and the same names with -1440-zh for the Chinese ones.
 */
describe('pictures', () => {
  it('draws the saved comment’s presses and the ranked list in the column', { timeout: 600_000 }, async () => {
    const shots = process.env['COLUMN_SAVED_SHOTS']
    if (shots === undefined) return
    mkdirSync(shots, { recursive: true })

    const target = (recordId: string) => ({ target: { kind: 'record', recordId, workspaceId: 'default' }, place: { at: 'surface' } })
    const aReport = async (headers: Record<string, string>, title: string) =>
      (await post<{ record: { id: string } }>('/api/records', {
        kind: 'report', title,
        data: { for: 'Robin Vale', date: '2026-10-01', blocks: [{ id: 'b-1', type: 'text', heading: 'The pier', text: 'The pier needs paint before the winter storms.' }] },
      }, headers)).record.id
    const aComment = async (recordId: string, body: string) => {
      await post('/api/records', { kind: 'message', title: body.slice(0, 40), data: { body, target: target(recordId) } })
    }
    const filed = await aReport(AS('pier-survey'), 'Synthetic report: the pier, filed by an agent')
    await aComment(filed, 'Synthetic comment: the paint colour is not named.')
    const reviewed = await aReport(PERSON, 'Synthetic report: the tide tables')
    await aComment(reviewed, 'Synthetic comment: the tide tables need a second source.')
    const sentReviewed = await aReport(PERSON, 'Synthetic report: the harbour lights')
    await aComment(sentReviewed, 'Synthetic comment: the light on the east pier is not listed.')
    await new Promise((resolve) => setTimeout(resolve, 1_100))
    await post('/api/reviews', { entry: target(reviewed), startedByAgent: starterRecordId })
    // A REVIEW SENT BEFORE 1 OCTOBER 2026, whose send did not carry the comment saved before it started. No door of
    // today's office writes that state, so the review's state is written into this test's own database directly, the
    // way tests/a-contacts-row-says-the-state-of-the-conversation.test.ts writes a state no door produces on request.
    const sentReview = (await post<{ review: { id: string } }>('/api/reviews', { entry: target(sentReviewed) })).review.id
    await post(`/api/reviews/${sentReview}/finish-collecting`, {})
    const database = new Database(join(app.dir, 'panelx.db'))
    try {
      database.prepare("UPDATE reviews SET state = 'sent', sent_at = ? WHERE id = ?").run('2026-09-30 10:00:00', sentReview)
    } finally {
      database.close()
    }

    /** Open the column on the one comment on a record, in a language, and answer its row. */
    const open = async (recordId: string, lang: 'en' | 'zh') => {
      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await app.page.emulateMedia({ colorScheme: 'light' })
      await app.page.goto(`${app.site}/?lang=${lang}#/r/${recordId}`)
      await app.page.reload()
      await waitForThePage(app.page)
      await expect.poll(theCount, { timeout: 30_000 }).toBe('1')
      await app.page.locator('.px-comment-circle').first().click()
      const row = app.page.locator('[data-saved-comment]').first()
      await row.locator('.px-saved-acts').waitFor({ timeout: 30_000 })
      await app.page.waitForTimeout(1_000)
      return row
    }
    /** The press that sends or chooses: the first button of the row's presses that is not the "To" button. */
    const thePress = (row: ReturnType<typeof app.page.locator>) => row.locator('.px-saved-acts > button:not(.px-saved-chosen)').first()
    const openTheList = async (row: ReturnType<typeof app.page.locator>, byTheTo: boolean) => {
      await (byTheTo ? row.locator('.px-saved-chosen') : thePress(row)).click()
      await row.locator('.px-talk-contact').first().waitFor({ timeout: 20_000 })
    }
    const take = async (name: string, row: ReturnType<typeof app.page.locator>, lang: 'en' | 'zh') => {
      const sizes: [number, 'light' | 'dark'][] = lang === 'zh'
        ? [[1440, 'light']]
        : [1440, 990, 660, 390].flatMap((width) => [[width, 'light'], [width, 'dark']] as [number, 'light' | 'dark'][])
      for (const [width, look] of sizes) {
        await app.page.setViewportSize({ width, height: 1000 })
        await app.page.emulateMedia({ colorScheme: look })
        await app.page.evaluate((theme) => { document.documentElement.dataset['theme'] = theme }, look)
        await row.scrollIntoViewIfNeeded()
        await app.page.waitForTimeout(300)
        const file = lang === 'zh' ? `column-saved-${name}-1440-zh.png` : `column-saved-${name}-${String(width)}-${look}.png`
        await app.page.screenshot({ path: join(shots, file) })
      }
    }

    for (const lang of ['en', 'zh'] as const) {
      let row = await open(filed, lang)
      await row.locator('.px-saved-chosen').waitFor({ timeout: 20_000 })
      await take('filed-to', row, lang)
      await openTheList(row, true)
      await take('filed-list', row, lang)

      row = await open(retiredFiledId, lang)
      await openTheList(row, false)
      await row.locator('.px-pick-cannot').first().waitFor({ timeout: 20_000 })
      await take('retired-list', row, lang)

      row = await open(reviewed, lang)
      await row.locator('.px-saved-held').waitFor({ timeout: 20_000 })
      await openTheList(row, false)
      await take('review-list', row, lang)

      // A SENT REVIEW HOLDS NOTHING, so the row says nothing about a review and offers its own send.
      row = await open(sentReviewed, lang)
      expect(await row.locator('.px-saved-held').count(), 'a sent review is said to hold the comment').toBe(0)
      if (lang === 'en') await row.getByRole('button', { name: 'Send this comment', exact: true }).waitFor({ timeout: 20_000 })
      await take('sent-review', row, lang)
    }
  })
})
