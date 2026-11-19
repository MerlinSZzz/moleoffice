// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SEND KEY DOES NOTHING WHERE THE BOX'S OWN PRESS WOULD NOT ACT. A decision made the send key a
 * setting. Commit 74ceb77f made it wait for the press beside each box.
 *
 * Before that commit, Shift+Enter called a box's save even when its press was disabled or pending.
 * An emptied comment was sent to the server to be stored, a reading nobody had changed was written
 * again, and a second press during a save sent a second save. This file presses the real keys in the
 * real boxes and counts the writes the page sends, because a refused or repeated write can leave the
 * stored words looking the same while the page still sent it.
 *
 * Two boxes are tested, both under the default setting, where Shift+Enter saves:
 *
 * - the review pane's comment box (`NoteWaiting`): not on an empty box, not while a save is pending;
 * - the reading box on a comment's own page (`ReadingBesideIt`): not on an empty box, not when the
 *   words are unchanged.
 *
 * Each box also has one positive case: with words the press would take, Shift+Enter does save. So
 * the file cannot pass with the key doing nothing at all.
 *
 * THE CHECKS THAT ARE NOT HERE. The talk box's `sending` guard and the change-this-instruction box's
 * `why` guard are not tested by this file; the commit that adds it says why.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Request, Route } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { setTheReviewTraysList } from './the-review-trays-list.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp
let reportId: string
let noteId: string
let readNoteId: string

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const NOTE_WORDS = 'Which of the two numbers was measured on Tuesday?'
const READING = 'Asks which of two numbers was measured.'
const THE_NOTE_BOX = 'textarea[aria-label="What this comment says"]'
const THE_READING_BOX = '.rd-two-side textarea[aria-label="What Mole Office made of this comment"]'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers: AS_THE_OWNER, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as Record<string, unknown>
}

/** What the office holds on one record, read back through the API rather than off the page. */
async function stored(id: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}/api/records/${id}`, { headers: AS_THE_OWNER })
  expect(res.status, await res.clone().text()).toBe(200)
  return ((await res.json()) as { record: { data: Record<string, unknown> } }).record.data
}

/**
 * EVERY WRITE THE PAGE SENDS TO ONE RECORD, counted as the page sends it. Both boxes save by a PATCH
 * of the record, so a PATCH is the one thing a press that should do nothing must not send.
 */
function countWritesTo(id: string): { count: () => number; stop: () => void } {
  let n = 0
  const seen = (req: Request): void => {
    if (req.method() === 'PATCH' && req.url().includes(`/api/records/${id}`)) n += 1
  }
  app.page.on('request', seen)
  return { count: () => n, stop: () => app.page.off('request', seen) }
}

beforeAll(async () => {
  app = await liveApp({ name: 'send-key-waits', viewport: { width: 1440, height: 1000 }, opensAt: 'full', workspace: 'default' })

  // A REPORT, A REVIEW THAT IS STILL COLLECTING, AND ONE COMMENT IN IT. While a review collects, its
  // comments may still be changed, so the review pane offers the Edit press and the box behind it.
  const report = (await post('/api/records', {
    kind: 'report',
    title: 'What the gripper did on Tuesday',
    summary: 'One run in three dropped the part.',
    data: { date: '2026-09-29', blocks: [{ id: 'b-prose', type: 'text', text: 'The gripper let go on 37% of runs.' }] },
  })) as { record: { id: string } }
  reportId = report.record.id
  await post('/api/reviews', { entry: { target: { kind: 'record', recordId: reportId, workspaceId: 'default' } } })
  const note = (await post('/api/records', {
    kind: 'annotation',
    title: NOTE_WORDS.slice(0, 40),
    data: { body: NOTE_WORDS, context: { target: { kind: 'record', recordId: reportId, workspaceId: 'default' } } },
  })) as { record: { id: string } }
  noteId = note.record.id

  // A SECOND COMMENT, ON A SECOND REPORT THAT HAS NO REVIEW, WITH A READING BESIDE IT. Its own page
  // draws the reading with the press that changes it. It is kept off the first report so that the
  // review there holds one comment, and "More" opens that one.
  const other = (await post('/api/records', {
    kind: 'report',
    title: 'What the run log said',
    summary: 'The log and the report disagree.',
    data: { date: '2026-09-29', blocks: [{ id: 'b-prose', type: 'text', text: 'The run log counts 12 drops.' }] },
  })) as { record: { id: string } }
  const read = (await post('/api/records', {
    kind: 'annotation',
    title: 'The run log says otherwise',
    data: {
      body: 'The run log says otherwise.',
      interpretation: READING,
      context: { target: { kind: 'record', recordId: other.record.id, workspaceId: 'default' } },
    },
  })) as { record: { id: string } }
  readNoteId = read.record.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/**
 * Open the report, then the review pane, then the one review, then the one comment, then its Edit
 * box. The steps are the ones tests/organising-is-reachable.test.ts walks to the same pane.
 */
async function openTheNoteBox(): Promise<void> {
  await app.page.goto(`${app.site}/#/r/${reportId}`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await sleep(800)
  await app.page.evaluate(() => {
    window.localStorage.removeItem('mole-office.review')
  })
  await app.page.reload({ timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await sleep(800)
  await app.page.locator('.px-review-switch').click()
  await sleep(600)
  await app.page.locator('.px-pane-list .px-rev-go').first().click()
  await sleep(600)
  // THE TRAY'S LIST IS SHUT AT FIRST (wave 13y round 146, item 73a), so Show comments opens the rows behind More.
  await setTheReviewTraysList(app.page, 'open')
  // IN THE TRAY the review's rows are behind More about this review.
  const more = app.page.locator('details.px-b-more')
  await more.waitFor({ timeout: 30_000 })
  if (!(await more.evaluate((el) => (el as HTMLDetailsElement).open))) await more.locator('summary').click()
  await sleep(400)
  // THE ONE COMMENT'S ROW IS CLOSED; "More" opens it onto the comment and its presses.
  await app.page.locator('.px-pane-list').getByRole('button', { name: 'More', exact: true }).first().click()
  await sleep(600)
  const item = app.page.locator(`.px-review-item[data-note-id="${noteId}"]`)
  await item.waitFor({ timeout: 30_000 })
  await item.getByRole('button', { name: 'Edit', exact: true }).click()
  await app.page.waitForSelector(THE_NOTE_BOX, { timeout: 15_000 })
  // THE BOX READS THE SETTING FROM THE OFFICE; let the page's own read of the person finish first.
  await sleep(600)
}

/** Open the second comment's own page and press "Change this reading". */
async function openTheReadingBox(): Promise<void> {
  await app.page.goto(`${app.site}/#/r/${readNoteId}`, { timeout: 60_000 })
  // LEAVING A PAGE WHOSE REVIEW HOLDS A COMMENT NOT SENT ASKS WHAT TO DO (wave 13r round 15), when a case above left
  // that review open. Keep changes nothing and goes on.
  const question = app.page.locator('[data-part="leave-question"]')
  await Promise.race([question.waitFor({ timeout: 30_000 }), app.page.locator('.rd-two-side').waitFor({ timeout: 30_000 })])
  if (await question.isVisible()) {
    await question.getByRole('button', { name: 'Keep', exact: true }).click()
    await question.waitFor({ state: 'detached' })
  }
  await waitForThePage(app.page, 60_000)
  // THE PRESS ON THE PAGE ITSELF, not one in a review pane a case above may have left open. That review's list
  // stands over the page's foot, so it is shut first.
  if ((await app.page.locator('[data-part="your-review-bar"]').count()) > 0) await setTheReviewTraysList(app.page, 'shut')
  await app.page.locator('.rd-two-side').getByRole('button', { name: 'Change this reading' }).click()
  await app.page.waitForSelector(THE_READING_BOX, { timeout: 15_000 })
  await sleep(600)
}

describe('the send key does nothing where the press beside the box would not act', () => {
  it('in the review pane, an emptied comment box and Shift+Enter send nothing', async () => {
    await openTheNoteBox()
    const writes = countWritesTo(noteId)
    try {
      await app.page.fill(THE_NOTE_BOX, '   ')
      await app.page.press(THE_NOTE_BOX, 'Shift+Enter')
      await sleep(1500)
      expect(writes.count(), 'Shift+Enter on an empty comment sent a write').toBe(0)
      expect((await stored(noteId))['body'], 'the stored comment changed').toBe(NOTE_WORDS)
    } finally {
      writes.stop()
    }
  }, 180_000)

  it('in the review pane, a second Shift+Enter while the save is pending sends nothing more', async () => {
    // HOLD THE FIRST SAVE, so the press beside the box is pending when the second key comes.
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const hold = async (route: Route): Promise<void> => {
      if (route.request().method() !== 'PATCH') return route.continue()
      await held
      await route.continue()
    }
    await app.page.route(`**/api/records/${noteId}`, hold)
    const writes = countWritesTo(noteId)
    const changed = 'Which of the two numbers did the run log measure?'
    try {
      await app.page.fill(THE_NOTE_BOX, changed)
      await app.page.press(THE_NOTE_BOX, 'Shift+Enter')
      await sleep(800)
      expect(writes.count(), 'the first Shift+Enter, with words in the box, did not save').toBe(1)
      await app.page.press(THE_NOTE_BOX, 'Shift+Enter')
      await sleep(800)
      expect(writes.count(), 'a second Shift+Enter while the save was pending sent a second write').toBe(1)
    } finally {
      release()
      writes.stop()
    }
    // AND THE ONE SAVE LANDS: the positive case for this box.
    await expect.poll(async () => (await stored(noteId))['body'], { timeout: 15_000 }).toBe(changed)
    await app.page.unroute(`**/api/records/${noteId}`, hold)
  }, 180_000)

  it('on a comment page, Shift+Enter with the reading unchanged or emptied writes nothing', async () => {
    await openTheReadingBox()
    const writes = countWritesTo(readNoteId)
    try {
      // THE WORDS AS THEY ARE STORED.
      await app.page.press(THE_READING_BOX, 'Shift+Enter')
      await sleep(1500)
      expect(writes.count(), 'Shift+Enter on an unchanged reading sent a write').toBe(0)

      // AN EMPTIED BOX.
      await app.page.fill(THE_READING_BOX, '  ')
      await app.page.press(THE_READING_BOX, 'Shift+Enter')
      await sleep(1500)
      expect(writes.count(), 'Shift+Enter on an empty reading sent a write').toBe(0)
      expect((await stored(readNoteId))['interpretation'], 'the stored reading changed').toBe(READING)

      // AND WITH NEW WORDS, SHIFT+ENTER DOES SAVE: the positive case for this box.
      const changed = 'Asks which number the run log measured.'
      await app.page.fill(THE_READING_BOX, changed)
      await app.page.press(THE_READING_BOX, 'Shift+Enter')
      await expect.poll(async () => (await stored(readNoteId))['interpretation'], { timeout: 15_000 }).toBe(changed)
      expect(writes.count(), 'one save sent one write').toBe(1)
    } finally {
      writes.stop()
    }
  }, 180_000)
})
