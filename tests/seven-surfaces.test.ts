// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SEVEN SURFACES, POINTED AT AND COMMENTED ON, IN A REAL BROWSER.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * All seven surfaces are proved here: Report prose; Report table; Plan table; Schedule; Module;
 * an ordinary plain-text area; an Agent draft/message. Round seven could point
 * at three things, and the acceptance found that most of what a person tried to point at could not be
 * pointed at. So the claim that it can now is worth exactly as much as the measurement behind it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, AND WHY IT IS NOT "DOES THE ATTRIBUTE EXIST"
 * ---------------------------------------------------------------------------------------
 *
 * A test that read the markup for `data-target` would pass on a page where the listener was never
 * mounted, where the composer was painted under a table, or where the comment went nowhere. So this
 * does what a person does: right-click the thing, or select words inside it, then write a comment
 * and add it to the review. Then it asks the SERVER what it stored — the target, and the quoted
 * words with the offsets the screen worked out — and checks that against the record as written.
 *
 * THE SPAN IS THE PART THAT COULD LIE QUIETLY. Rendered Markdown is not the string it was rendered
 * from, so a quote taken off the screen is matched to the source by arithmetic. If the arithmetic
 * is wrong, everything still works: the comment is stored, the page draws, and Mole Office later tells
 * somebody that untouched words have changed. The last assertion in each case is therefore the
 * server's own reading of its own stored comment, which has to say the words are still there.
 *
 * NOTHING IS SENT. The review collects, and this never dispatches: what is being proved is that a
 * person can say something about anything, not that an agent answered.
 */

import type { Locator, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteTheCopiedDefaultChapters, goKeeping, keepTheCommentInAReview, liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { setTheReviewTraysList } from './the-review-trays-list.ts'
import { shortenToWords } from '../src/shared/shortening.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const WORKSPACE = 'default'
const HUMAN = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': WORKSPACE,
}

// ============================================================================ what is on the screen

let app: LiveApp
let page: Page

/** Ids of everything seeded, so an assertion can name the record it is about. */
let reportId: string
let moduleId: string
let noteId: string
let planId: string
let lineId: string
let windowId: string
let messageId: string
let threadId: string

const REPORT_PROSE =
  'The gripper let go of the part on every run above fifteen newtons, and nobody has measured why.'
const NOTE_BODY = 'The pad is the suspect. It has been on the finger since March and the surface is glazed.'
const MODULE_PROSE = 'The controller reads the strain gauge at 200Hz and averages over five samples.'

async function api(path: string, body: unknown, method: 'POST' | 'PATCH' = 'POST'): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}${path}`, {
    method,
    headers: HUMAN,
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as Record<string, unknown>
}

async function read(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}${path}`, { headers: HUMAN })
  if (!res.ok) throw new Error(`GET ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as Record<string, unknown>
}

beforeAll(async () => {
  // ONE SHARED STACK: its own database, its own API, the page built once for the run, and the one
  // Chromium this worker shares. `opensAt: 'full'` is the reading level these blocks are drawn at.
  app = await liveApp({ name: 'seven-surfaces', viewport: { width: 1440, height: 900 }, workspace: WORKSPACE, opensAt: 'full' })
  page = app.page
  // The default chapters a fresh office copies at its first start are module records this test did
  // not file, and it counts or draws modules, so it deletes them first.
  await deleteTheCopiedDefaultChapters(app.api)
  // ---- a report with prose and a real table in it
  const report = await api('/api/records', {
    kind: 'report',
    title: 'What the gripper did on Tuesday',
    summary: 'One run in three dropped the part.',
    data: {
      date: '2026-08-18',
      blocks: [
        { id: 'b-prose', type: 'text', text: REPORT_PROSE },
        {
          id: 'b-table',
          type: 'table',
          columns: [{ label: 'Run' }, { label: 'What happened' }],
          rows: [{ cells: ['1', 'held to twenty newtons'] }, { cells: ['2', 'dropped at sixteen newtons'] }],
        },
      ],
    },
  })
  reportId = ((report as { record: { id: string } }).record).id

  // ---- a module, whose curated summary is the same block vocabulary
  const module_ = await api('/api/records', {
    kind: 'module',
    title: 'Tray clamp controller',
    summary: 'Reads the gauge and closes the loop.',
    data: { summaryBlocks: [{ id: 'm-1', type: 'text', text: MODULE_PROSE }] },
  })
  moduleId = ((module_ as { record: { id: string } }).record).id

  // ---- an ordinary plain-text area: a note is one stored string drawn as a paragraph
  const note = await api('/api/records', {
    kind: 'note',
    title: 'Why the pad is the suspect',
    data: { body: NOTE_BODY },
  })
  noteId = ((note as { record: { id: string } }).record).id

  // ---- a plan with one line
  const plan = await api('/api/plans', { title: 'This week on the gripper', body: '- replace the gripper pad' })
  planId = ((plan as { plan: { id: string } }).plan).id
  const lines = (await read(`/api/plans/${planId}`)) as { lines: { line: { id: string } }[] }
  lineId = lines.lines[0]!.line.id

  // ---- a block on the week, which needs a piece of work to be about
  const task = await api('/api/records', { kind: 'task', title: 'Replace the gripper pad', data: { state: 'todo' } })
  const taskId = ((task as { record: { id: string } }).record).id
  const window_ = await api('/api/planning/windows', {
    recordId: taskId,
    startsOn: '2026-08-17',
    endsOn: '2026-08-19',
    note: 'Grip starts slipping above fifteen newtons; recalibrate before the next test.',
  })
  windowId = ((window_ as { window: { id: string } }).window).id

  // ---- something an agent was told, so there is a message to point at
  const thread = await api('/api/agent/threads', { title: 'About the gripper', mode: 'direct' })
  threadId = ((thread as { thread: { id: string } }).thread).id
  const said = await api(`/api/agent/threads/${threadId}/messages`, {
    intent: 'ask',
    body: 'Did anybody check the pad before the run, or is that still unknown?',
  })
  messageId = ((said as { message: { id: string } }).message).id
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

// ============================================================================ doing what a person does

async function open(where: string): Promise<void> {
  // KEEP IS ANSWERED IF ASKED: a comment kept with Start review leaves the page's review holding a
  // comment not sent, and leaving that page asks what to do with it.
  await goKeeping(page, `${app.site}/#${where}`)
  await waitForThePage(page, 60_000)
}

/**
 * Collect rather than send, so nothing needs an agent to be running.
 *
 * TWO PRESSES, AND THAT IS THE POINT OF THE SECOND ONE. The control in the frame opens the review
 * column and writes nothing — it used to create a review on the press, and no route deletes one.
 * Starting is a press inside the column, beside the list of reviews that already exist.
 */
async function collectComments(): Promise<void> {
  const open = await page.locator('.px-review-switch[aria-pressed="true"]').count()
  if (open === 0) await page.locator('.px-review-switch').click()
  await page.waitForSelector('.px-review-switch[aria-pressed="true"]', { timeout: 10_000 })
  const start = page.getByRole('button', { name: 'Start a review here', exact: true })
  if ((await start.count()) > 0) await start.click()
  // Collecting has started when the press that ends it is on screen. In the tray the press is
  // behind "More about this review", which is opened first, inside the list Show comments opens.
  await setTheReviewTraysList(page, 'open')
  const more = page.locator('details.px-b-more')
  await more.waitFor({ timeout: 15_000 })
  if (!(await more.evaluate((el) => (el as HTMLDetailsElement).open))) await more.locator('summary').click()
  await page.getByRole('button', { name: 'Finish collecting', exact: true }).waitFor({ timeout: 15_000 })
  // The cases go on to point at the page, so the list that stands over its foot is shut again.
  await setTheReviewTraysList(page, 'shut')
}

/** Select every word inside one element, exactly as a person dragging across it would. */
async function selectInside(selector: string): Promise<void> {
  await page.evaluate((which) => {
    const el = document.querySelector(which)
    if (el === null) throw new Error(`${which} is not on the page`)
    const range = document.createRange()
    range.selectNodeContents(el)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    // A real drag ends with the pointer coming up, so the gesture is finished the way a person
    // finishes one. Nothing watches for it any more, and nothing may: selection is passive.
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  }, selector)
}

/**
 * Invoke Mole Office on what is selected: right-click it.
 *
 * IT IS THE EVENT A RIGHT-CLICK FIRES, dispatched on the element the press would land on, because a
 * real press can collapse a selection before the handler ever sees it and the point of this gesture
 * is the phrase that is selected. `openTheComposerOnTheProse` in
 * tests/changing-an-instruction-before-it-goes.test.ts does the same thing for the same reason.
 */
async function rightClickInside(selector: string): Promise<void> {
  await page.evaluate((which) => {
    const el = document.querySelector(which)
    if (el === null) throw new Error(`${which} is not on the page`)
    const at = el.getBoundingClientRect()
    el.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: Math.round(at.left + 20),
        clientY: Math.round(at.top + 8),
      }),
    )
  }, selector)
}

/**
 * Write the comment the box is open on. Answers nothing; it asserts.
 *
 * ADD TO REVIEW IS THE WRITING PRESS THAT SENDS NOTHING HERE. Criterion W4: the right-click panel
 * is a dialog, a contact chooser and three presses, and a
 * comment written with no reader is filed unsent. Shape B replaced Save without sending with Start
 * review. Since wave 13x round 22 (problem 6yMD5gal_oXz; y_Vqv-Kab1Ga), while a review
 * collects what the comment is about, the box draws Add to review in Start review's place, which
 * writes the same comment into the review collecting there. Whether one collects here depends on the
 * surface: the review `collectComments` starts on /records does not reach a report, and Start review
 * on the report's prose starts the report's own review, which then reaches its table. So this presses
 * whichever of the two the box offers (`keepTheCommentInAReview`). Both send nothing. Which review
 * holds each comment is not what this file measures.
 *
 * NOBODY IS CHOSEN, AND THAT IS THE POINT. A comment is a note somebody wrote against something,
 * and Mole Office keeps it without being told who it is for — who reads it is a separate decision taken
 * when the review is finished.
 */
async function writeComment(words: string): Promise<void> {
  await page.waitForSelector('.px-talk', { timeout: 15_000 })
  await page.locator('.px-talk textarea').first().fill(words)
  await keepTheCommentInAReview(page)
  // THE FRAME SAYS THE COMMENT IS IN A REVIEW once the write and the review have both answered, so
  // the next page is not opened while the review's write is still on its way.
  await page.waitForSelector('.px-talk-said [data-part="in-the-review"]', { timeout: 15_000 })
  await page.getByRole('button', { name: 'Back to reading', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.px-talk').length === 0, undefined, { timeout: 15_000 })
}

/** Every comment the review has collected, with what each one points at, from the server. */
interface Stored {
  body: string
  context: {
    target: Record<string, string>
    span?: { quote: string; from: number; to: number; field?: string }
    place?: {
      at: string
      span?: { quote: string; from: number; to: number; field?: string }
      words?: string
      cut?: true
    }
  } | null
  reading: { state: string; says: string } | null
}

/**
 * The words a stored comment names, wherever they are written down.
 *
 * A comment written from now on carries a `place`, and the span is inside it. One written before
 * Mole Office measured where somebody was carries a bare `span`. Both are real, so this test reads both
 * rather than pinning the era a row came from.
 */
function wordsOf(stored: Stored): { quote: string; from: number; to: number; field?: string } | undefined {
  return stored.context?.place?.span ?? stored.context?.span
}

/**
 * Every comment the review has collected, with what each one points at, from the server.
 *
 * WHAT IS STORED IS A NOTE — a record of kind `annotation` — and not a message in a conversation.
 * That is the whole of round eight's Phase 3: the note is the durable fact, it needs nobody's name,
 * and it survives the conversation that may one day carry it.
 *
 * THE READING HAS TO BE ASKED FOR. Whether the quoted words are still where the comment said is
 * computed by the server, and today only the message route computes it — no route reads a note's
 * anchor. So this puts each stored context to that route in a scratch conversation, reads the
 * answer, and abandons the conversation so nothing it wrote is left waiting. The reading is about
 * the context, not about who stored it, so it is the same measurement as before.
 */
async function collected(): Promise<Stored[]> {
  const held = (await read('/api/messages/comments')) as {
    comments: { id: string; kind: string; data: { body?: string; state?: string; context?: Stored['context']; target?: Stored['context'] } }[]
  }
  // A COMMENT IS A COMMENT. This used to keep only the records reading `state: 'queued'`, which is
  // a field GET /api/kinds says nothing decides anything from and tells writers not to write. The
  // composer stopped writing it on 25 August 2026 and this kept nothing at all. Where a comment has
  // got to is `agent_messages.state`; nothing here has been sent anywhere, so every one is waiting.
  const waiting = held.comments
  expect(waiting.length, 'no note was written by adding a comment to the review').toBeGreaterThan(0)

  const thread = await api('/api/agent/threads', { title: 'reading the notes back', mode: 'review' })
  const threadId = (thread['thread'] as { id: string }).id
  const out: Stored[] = []
  for (const note of waiting) {
    // WHICHEVER KEY THE KIND KEEPS IT UNDER: `context` on a comment written before comments and
    // messages became one thing, `target` on one written since.
    const where = (note.kind === 'annotation' ? note.data.context : note.data.target) ?? null
    const said = await api(`/api/agent/threads/${threadId}/messages`, {
      intent: 'ask',
      body: note.data.body ?? '',
      context: where,
    })
    const message = said['message'] as Stored
    out.push({ body: note.data.body ?? '', context: where, reading: message.reading })
  }
  await api(`/api/agent/threads/${threadId}`, { state: 'abandoned' }, 'PATCH')
  return out
}

/** The one comment whose words are these. Named so a failure says which surface it was. */
function commentSaying(all: Stored[], words: string): Stored {
  const found = all.find((one) => one.body === words)
  expect(found, `nothing was stored for "${words}" — the comment never reached the server`).not.toBe(undefined)
  return found!
}

// ============================================================================ the seven

describe('a person can point at each of the seven surfaces and leave a comment on it', () => {
  it('points at all seven, and the server stored what each one was about', async () => {
    await open('/records')
    await collectComments()

    // ---------------------------------------------------------------- 1. report prose
    await open(`/r/${reportId}`)
    await page.waitForSelector('[data-target^="reportBlock/"]', { timeout: 20_000 })
    await selectInside('[data-target^="reportBlock/"] [data-text-field]')

    // NOTHING IS DRAWN BECAUSE WORDS WERE SELECTED, and this is where the opposite used to be
    // measured: how close the offer appeared to the selected words. That whole class of offer is
    // refused, because selection identifies context and does not imply intent. The
    // right-click is what invokes; the selected words are what it is about.
    await rightClickInside('[data-target^="reportBlock/"] [data-text-field]')
    await writeComment('one: the prose of a report')

    // ---------------------------------------------------------------- 2. a cell of a report table
    await page.locator('[data-target^="tableCell/"]').nth(3).click({ button: 'right' })
    await writeComment('two: a cell of a report table')

    // ---------------------------------------------------------------- 3. a module
    await open(`/r/${moduleId}`)
    await page.waitForSelector('article.rp', { timeout: 20_000 })
    await page.locator('article.rp h1').click({ button: 'right' })
    await writeComment('three: a module')

    // ---------------------------------------------------------------- 4. an ordinary plain-text area
    await open(`/r/${noteId}`)
    await page.waitForSelector('[data-text-field="data.body"]', { timeout: 20_000 })
    await selectInside('[data-text-field="data.body"]')
    await rightClickInside('[data-text-field="data.body"]')
    await writeComment('four: an ordinary plain-text area')

    // ---------------------------------------------------------------- 5. a row of the plan table
    await open(`/plans/${planId}`)
    await page.getByRole('button', { name: 'Table', exact: true }).click()
    await page.waitForSelector('.pt-table tbody tr', { timeout: 20_000 })
    await page.locator('.pt-table tbody tr').first().locator('td').first().click({ button: 'right' })
    await writeComment('five: a row of a plan table')

    // ---------------------------------------------------------------- 6. a block on the week
    await open('/plan/2026-W34')
    // The panel that holds a block's note opens when the block on the board is pressed, which is
    // where a person already goes to do anything to one.
    await page.locator('.px-pl-block').first().click()
    await page.waitForSelector(`[data-target="scheduleBlock/${windowId}"]`, { timeout: 20_000 })
    await selectInside(`[data-target="scheduleBlock/${windowId}"] [data-text-field="note"]`)
    await rightClickInside(`[data-target="scheduleBlock/${windowId}"] [data-text-field="note"]`)
    await writeComment('six: a block on the week')

    // ---------------------------------------------------------------- 7. a message to an agent
    await open('/conversations')
    // BY NAME, not by position: the review this test has been collecting into is a conversation of
    // its own and is newer, so the first row is not the one with the message in it.
    await page.locator('.px-thread-row', { hasText: 'About the gripper' }).first().click()
    await page.waitForSelector(`[data-target="agentMessage/${messageId}"]`, { timeout: 20_000 })
    await page.locator(`[data-target="agentMessage/${messageId}"]`).click({ button: 'right' })
    await writeComment('seven: a message in a conversation')

    // ---------------------------------------------------------------- what the server has
    const all = await collected()
    expect(all.length, 'seven comments were written and the review holds a different number').toBe(7)

    // WHAT THIS ASSERTED UNTIL WAVE 5 STEP 7, AND WHY IT CHANGED. It read `{kind: 'reportBlock',
    // recordId, blockId: 'b-prose'}`: a press anywhere in a report's prose was filed against the
    // whole block. That is the owner's own complaint — a comment about one paragraph filed against
    // more than the paragraph — and this step is what fixes it. A paragraph of a report now carries
    // a region target of its own, the upward walk reaches it first, and the comment is about the
    // paragraph. The block's `reportBlock` target is still on the block element and still resolves;
    // it is what the press reaches in the gaps between paragraphs, and what the comments already in
    // the corpus point at until window B converts them.
    const aboutTheProse = commentSaying(all, 'one: the prose of a report').context?.target
    expect(aboutTheProse?.['kind']).toBe('region')
    expect(aboutTheProse?.['recordId']).toBe(reportId)
    expect(String(aboutTheProse?.['regionId'] ?? '')).toMatch(/^data\.blocks\[#b-prose\]\.text@\d+$/)
    // THE CELL, STORED AS THE PART OF THE RECORD IT IS. The element carries `tableCell/…/2/2` and
    // that is what the right-click sent; the door spells it the one way a part of a record is
    // stored, so that a stored comment cannot stop the server coming up — `theRegionItNames` in
    // src/server/lib/targets.ts has the argument. It is the SAME cell: row 2 counts from 1 and the
    // path counts from 0, which is the one conversion, in src/shared/regions.ts.
    const aboutTheCell = commentSaying(all, 'two: a cell of a report table').context?.target
    expect(aboutTheCell?.['kind']).toBe('region')
    expect(aboutTheCell?.['regionId']).toBe('data.blocks[#b-table].rows[1].cells[1]')
    expect(commentSaying(all, 'three: a module').context?.target).toEqual({
      kind: 'record',
      recordId: moduleId,
      workspaceId: WORKSPACE,
    })
    expect(commentSaying(all, 'four: an ordinary plain-text area').context?.target).toEqual({
      kind: 'record',
      recordId: noteId,
      workspaceId: WORKSPACE,
    })
    expect(commentSaying(all, 'five: a row of a plan table').context?.target).toEqual({
      kind: 'planLine',
      planId,
      lineId,
    })
    expect(commentSaying(all, 'six: a block on the week').context?.target).toEqual({
      kind: 'scheduleBlock',
      windowId,
    })
    expect(commentSaying(all, 'seven: a message in a conversation').context?.target).toEqual({
      kind: 'agentMessage',
      messageId,
    })

    // THE QUOTED WORDS, AND THE SERVER'S OWN READING OF THEM. This is the assertion that catches a
    // wrong offset: the arithmetic is the only thing between the screen and Mole Office later saying
    // that untouched words have changed.
    const prose = commentSaying(all, 'one: the prose of a report')
    const shownProse = shortenToWords(REPORT_PROSE)
    expect(shownProse.shortened).toBe(true)
    expect(wordsOf(prose)?.quote).toBe(shownProse.words)
    expect(wordsOf(prose)?.field).toBe('data.blocks[#b-prose].text')
    expect(wordsOf(prose)?.from).toBe(0)
    expect(wordsOf(prose)?.to).toBe(REPORT_PROSE.length)
    expect(prose.context?.place?.cut).toBe(true)
    expect(prose.reading?.state, prose.reading?.says).toBe('there')

    const plain = commentSaying(all, 'four: an ordinary plain-text area')
    const shownNote = shortenToWords(NOTE_BODY)
    expect(shownNote.shortened).toBe(true)
    expect(wordsOf(plain)?.quote).toBe(shownNote.words)
    expect(wordsOf(plain)?.field).toBe('data.body')
    expect(wordsOf(plain)?.to).toBe(NOTE_BODY.length)
    expect(plain.context?.place?.cut).toBe(true)
    expect(plain.reading?.state, plain.reading?.says).toBe('there')

    const week = commentSaying(all, 'six: a block on the week')
    expect(wordsOf(week)?.field).toBe('note')
    expect(week.reading?.state, week.reading?.says).toBe('there')

    // ---------------------------------------------------------------- a cell keeps what it held
    //
    // THIS BLOCK REPLACES AN ASSERTION THAT PINNED A WEAKER CLAIM, and the change is recorded here
    // the way tests/the-ledger-and-its-other-writers.test.ts records the same kind of change.
    //
    // WHAT IT USED TO SAY. Nothing at all about the cell's words, and the reading below was
    // asserted to be `there` along with the other six. It then became `unknown`, and the honest
    // answer was `unknown`: a cell is named by its row and its column, a stored row has no id, and
    // the comment quoted nothing — so Mole Office had no evidence about whether what sits there now is
    // what somebody pointed at. The test was pinning "still there" to a question nobody had asked.
    //
    // WHY IT IS `there` AGAIN, AND HONESTLY THIS TIME. Mole Office now keeps what a cell holds as the
    // comment's quote at the moment the comment is written, which is a measurement rather than a
    // guess. So the reading is `there` while the cell still holds those words and `changed` when it
    // does not — see `quoteWhatItHolds` in src/server/lib/targets.ts. `unknown` is left for the
    // cases nothing measured, which is what it is for.
    const cell = commentSaying(all, 'two: a cell of a report table')
    expect(wordsOf(cell)?.quote, 'the cell comment kept nothing of what the cell held').toBe(
      'dropped at sixteen newtons',
    )
    expect(wordsOf(cell)?.field).toBe('data.blocks[#b-table].rows[1].cells[1]')
    expect(wordsOf(cell)?.from).toBe(0)
    expect(cell.reading?.state, cell.reading?.says).toBe('there')

    // AND EVERY ONE OF THE SEVEN IS STILL THERE, said by the server rather than by this test.
    for (const one of all) {
      expect(one.reading?.state, `${one.body}: ${String(one.reading?.says)}`).toBe('there')
    }
  }, 300_000)

  /**
   * THE MARKS, MEASURED WHERE THEY ARE DRAWN.
   *
   * Two quiet marks are wanted: a subtle transparent highlight and a very small marker on
   * the words, and an equally light contextual mark on a cell, block or node. Both are drawn without
   * putting one element inside a page — the object's mark is a stylesheet built from what the server
   * sent, and the highlight is painted by the browser over the document. So the only way to know
   * either one is really there is to ask the browser what it drew.
   *
   * IT RUNS AFTER THE SEVEN, on purpose: the comments this reads are the ones written above, through
   * the interface, and nothing here writes a fixture to make a mark appear.
   */
  it('marks the block a comment is waiting on, and lights the exact words it quoted', async () => {
    await open(`/r/${reportId}`)
    await page.waitForSelector('[data-target^="reportBlock/"]', { timeout: 20_000 })
    // THE CIRCLE AND THE HIGHLIGHT ARE THE THINGS THE SLEEP STOOD IN FOR, so wait for both.
    await page.locator('.px-comment-circle').first().waitFor({ timeout: 20_000 })
    await page.waitForFunction((prose) => {
      const held = (CSS as unknown as { highlights?: Map<string, Iterable<Range>> }).highlights?.get('mole-office-noted')
      if (held === undefined) return false
      for (const range of held) if (range.toString() === prose) return true
      return false
    }, shortenToWords(REPORT_PROSE).words, { timeout: 20_000 })

    const seen = await page.evaluate((prose) => {
      // THE PARAGRAPH, NOT THE BLOCK. The comment written above is on a region now, so the mark is
      // for the element that IS that region. Asking about the block would be asking about the wrong
      // element and reading "no mark" as "no comment".
      const block =
        [...document.querySelectorAll('[data-target^="region/"]')].find((one) =>
          (one.textContent ?? '').includes(prose),
        ) ?? null
      const key = block?.getAttribute('data-target') ?? ''
      // THE CIRCLE BESIDE THE BLOCK, which is what the mark is since 4 September 2026. It used to
      // be `content: "❝ 1"` on the block itself, which put the number inside the block's own words.
      const circle = document.querySelector(`.px-comment-circle[data-comments-on="${key}"]`)
      const mark = circle === null ? '' : (circle.textContent ?? '')
      const inside = block === null ? '' : getComputedStyle(block, '::before').content
      const registry = (CSS as unknown as { highlights?: Map<string, { size: number } & Iterable<Range>> }).highlights
      const held = registry?.get('mole-office-noted')
      const lit: string[] = []
      if (held !== undefined) for (const range of held) lit.push(range.toString())
      return { mark, inside, lit, prose }
    }, shortenToWords(REPORT_PROSE).words)

    // A CIRCLE BESIDE THE BLOCK, CARRYING HOW MANY. No circle at all is the mark not being there.
    expect(seen.mark, 'the block with a comment waiting on it carries no mark').toBe('1')

    // AND NOTHING IN THE BLOCK'S OWN WORDS. Problem `muxtJ4V4HfUj`.
    expect(seen.inside, 'the block draws a mark inside its own text again').toBe('none')

    // THE HIGHLIGHT IS ON THE WORDS THAT WERE QUOTED AND NOT ON THE PARAGRAPH AROUND THEM.
    expect(seen.lit, 'nothing was lit, so the quoted opening carries no highlight').toContain(seen.prose)
    expect(seen.lit).not.toContain(REPORT_PROSE)
  }, 120_000)

  /**
   * A ROW ANSWERS ACROSS ITS WHOLE WIDTH, NAMES THE RECORD, AND KEEPS ITS SHAPE.
   *
   * ---------------------------------------------------------------------------------------
   * THE THREE MEASUREMENTS THIS EXISTS FOR, ALL TAKEN BY HAND ON 18 AUGUST 2026
   * ---------------------------------------------------------------------------------------
   *
   * A module row 1146px wide answered a right-click in the 5% strip at each end and nowhere across
   * the middle 90%. The row's title is a link, a link overlay covers the whole row, and a link was
   * exempt from the gesture — so the only places that worked were the parts of the row with nothing
   * in them. docs/UX-CONTRACT.md names that by hand: *somebody discovers it only by experimenting
   * with blank space*.
   *
   * The composer's chip then read the row back rather than naming the record: `Record — 1 / 3
   * checked Mole Office — attention, the change window and the`, which is a count, a title and a summary
   * with no gaps between them.
   *
   * And the one row carrying a comment was 90.9px tall beside neighbours of 70.0px, because the
   * mark is a ::before on a grid and became a fourth grid item.
   *
   * ---------------------------------------------------------------------------------------
   * WHY THE HEIGHT IS MEASURED TWICE ON THE SAME ROW
   * ---------------------------------------------------------------------------------------
   *
   * The fixture holds one module, so there is no unmarked neighbour to compare against. Instead the
   * same row is measured with the mark and then with the attribute the mark's rule matches on taken
   * off for one frame — same row, same words, same width, mark on and mark off. That is a control
   * rather than a comparison between two different rows.
   */
  it('answers a right-click across the whole width of a row, names the record, and keeps its shape when a comment waits on it', async () => {
    await open('/modules')
    // The Modules page is a family list (round 11 of wave 13j): the row is .flst-row, and its link
    // .flst-open carries the record's target and is stretched over the whole row.
    await page.waitForSelector(`.flst-open[data-target^="record/${moduleId}"]`, { timeout: 20_000 })
    // The marks are read once for the page, and the comment this reads was written by the first
    // test in this file, through the interface. Wait for the mark itself.
    await page.locator('.px-comment-circle').first().waitFor({ timeout: 20_000 })

    const row = page.locator('.flst-row').filter({ has: page.locator(`.flst-open[data-target^="record/${moduleId}"]`) }).first()
    const box = await row.boundingBox()
    expect(box, 'the module row was not drawn').not.toBe(null)
    expect(box!.width, 'the row is too narrow for this measurement to mean anything').toBeGreaterThan(600)

    // ACROSS THE MIDDLE, where the link is and where the gesture used to do nothing at all.
    for (const part of [0.2, 0.5, 0.8]) {
      await page.mouse.click(box!.x + box!.width * part, box!.y + box!.height / 2, { button: 'right' })
      await page.locator('.px-talk').first().waitFor({ timeout: 15_000 })
      const open_ = await page.locator('.px-talk').count()
      expect(open_, `a right-click ${part * 100}% across the row opened nothing`).toBeGreaterThan(0)

      // AND IT NAMES THE RECORD, from what the row says it is called rather than from the words
      // the row happens to draw.
      const said = await page.locator('.px-talk-chip-what').first().innerText()
      expect(said, `the chip named something other than the module: ${said}`).toBe('Tray clamp controller')
      await page.locator('.px-talk-close').click()
      await page.waitForFunction(() => document.querySelectorAll('.px-talk').length === 0, undefined, { timeout: 15_000 })
    }

    // AN ORDINARY PRESS STILL NAVIGATES. Taking the menu must not cost the link its own job.
    await row.locator('a.flst-open').click()
    await page.waitForFunction(() => window.location.hash.startsWith('#/r/'), undefined, { timeout: 10_000 })
    expect(page.url()).toContain(`#/r/${moduleId}`)

    // ---------------------------------------------------------------- the shape of a marked row
    await open('/modules')
    await page.waitForSelector(`.flst-open[data-target^="record/${moduleId}"]`, { timeout: 20_000 })
    await page.locator('.px-comment-circle').first().waitFor({ timeout: 20_000 })
    const shape = await page.evaluate((id) => {
      const element = document.querySelector(`.flst-open[data-target^="record/${id}"]`)
      const whole = element?.closest('.flst-row') ?? null
      if (element === null || whole === null) return null
      const key = element.getAttribute('data-target') ?? ''
      const circle = document.querySelector(`.px-comment-circle[data-comments-on="${key}"]`)
      const marked = whole.getBoundingClientRect().height
      element.removeAttribute('data-target')
      const plain = whole.getBoundingClientRect().height
      element.setAttribute('data-target', key)
      return {
        drawn: circle === null ? '' : (circle.textContent ?? ''),
        position: circle === null ? 'no circle' : getComputedStyle(circle).position,
        inside: getComputedStyle(element, '::before').content,
        marked,
        plain,
      }
    }, moduleId)

    expect(shape, 'the module row was not on the page').not.toBe(null)
    expect(shape!.drawn, 'the row with a comment waiting on it carries no mark, so this measures nothing').toBe('1')
    expect(shape!.inside, 'the row draws a mark inside its own cells again').toBe('none')
    expect(shape!.position, 'the mark is in the flow, so it takes a cell of the row for itself').toBe('absolute')
    expect(shape!.marked, 'the mark made the row a different height from the row without it').toBe(shape!.plain)
  }, 120_000)

  /**
   * THE BROWSER'S OWN MENU IS ONE SHIFT AWAY, ON EVERY PIXEL OF EVERY PAGE.
   *
   * Useful behaviour of the browser itself must not be destroyed without need. Shift is how that
   * promise is kept, and it is checked here twice: on ordinary
   * prose, and inside a box somebody is typing in.
   *
   * ---------------------------------------------------------------------------------------
   * THIS CASE HAS NOW BEEN WRITTEN THREE WAYS, AND HERE IS WHY IT CHANGED EACH TIME
   * ---------------------------------------------------------------------------------------
   *
   * Round seven exempted a box, so a box could not be commented on at all. Round eight's reading
   * called that a defect, because a box inside a row is a large part of the row — on the plan table
   * it is the task's own words — so exempting it left the gesture working in the gutter and in the
   * gaps between controls. The exemption went, and this case asserted that a right-click inside the
   * plan table's Task cell opens the composer.
   *
   * That fix took paste, spell-check and look-up away from every box in the product, measured on
   * 21 August 2026, and it is CAF-8 in design/round-nine/step59-reconciliation.md. Contract 5.5 is
   * the rule that settles it and it is now built: **a box a person types in belongs to the
   * browser.** So this case asserts that, and the row's own words are still reachable — pointing at
   * the cell around the box, or at the row, opens the composer as it always did.
   *
   * WHAT THAT COSTS, said rather than hidden: a right-click on the CHARACTERS of a plan line no
   * longer opens the composer. Round eight's finding is traded for paste, and the trade is written
   * down in design/round-nine/caf8-the-browsers-own-menu.md so that whoever disagrees can find it.
   */
  it('leaves a box a person types in to the browser, and answers on the row around it', async () => {
    await open(`/r/${noteId}`)
    await page.waitForSelector('article.rp', { timeout: 20_000 })

    const opened = async (act: () => Promise<void>): Promise<boolean> => {
      await act()
      // A RIGHT-CLICK THAT OPENS NOTHING IS PROVED BY A QUIET WINDOW, not by a wait for an element:
      // what is being proved is that nothing appears. One that opens the composer is waited for.
      const count = await page
        .locator('.px-talk')
        .first()
        .waitFor({ state: 'attached', timeout: 400 })
        .then(() => 1)
        .catch(() => 0)
      if (count > 0) {
        await page.locator('.px-talk-close').click()
        await page.waitForFunction(() => document.querySelectorAll('.px-talk').length === 0, undefined, { timeout: 15_000 })
      }
      return count > 0
    }

    expect(
      await opened(() => page.locator('article.rp h1').click({ button: 'right', modifiers: ['Shift'] })),
      'holding Shift did not leave the context menu to the browser',
    ).toBe(false)

    // A BOX A PERSON TYPES IN. The plan table writes a line's words straight back into the plan, so
    // its Task cell is a real box, and the row around it is addressable.
    await open(`/plans/${planId}`)
    await page.getByRole('button', { name: 'Table', exact: true }).click()
    await page.waitForSelector('.pt-table tbody tr', { timeout: 20_000 })
    const box: Locator = page.locator('.pt-table tbody textarea').first()
    await box.waitFor({ timeout: 20_000 })
    expect(
      await opened(() => box.click({ button: 'right' })),
      'Mole Office took the menu inside a box, so paste and spell-check are unreachable there',
    ).toBe(false)

    // AND THE ROW IS STILL ADDRESSABLE, which is what stops this from being round seven again. The
    // gesture is refused in the characters of the line and answers everywhere around them, so
    // nobody has to find it by experimenting with blank space.
    expect(
      await opened(() => page.locator('.pt-table tbody tr').first().click({ button: 'right', position: { x: 4, y: 4 } })),
      'the row holding the box answered nothing, so the box exemption swallowed the row again',
    ).toBe(true)

    // SELECTING WORDS INSIDE THE BOX OFFERS NOTHING, which is the invariant that replaced the
    // measurement this section used to make. It asserted that selecting inside a box drew an offer.
    // That offer was refused and is gone, so the honest thing to assert
    // here is the opposite: the selection is real, and Mole Office draws nothing because of it.
    await box.click()
    await box.press('Control+a')
    await page.waitForFunction(() => {
      const active = document.activeElement
      if (active === null || !('selectionStart' in active)) return false
      const field = active as HTMLTextAreaElement
      return field.selectionEnd > field.selectionStart
    }, undefined, { timeout: 15_000 })
    const selected = await page.evaluate(() => {
      const active = document.activeElement
      if (active === null || !('selectionStart' in active)) return null
      const field = active as HTMLTextAreaElement
      return { from: field.selectionStart, to: field.selectionEnd, words: field.value }
    })
    expect(selected, 'nothing was selected, so this measures nothing').not.toBe(null)
    expect(selected!.to, 'the box holds no selection to offer anything about').toBeGreaterThan(selected!.from ?? 0)
    expect(
      await page.locator('.px-talk-quote').count(),
      'something was drawn because words were selected, and selection must stay passive',
    ).toBe(0)
  }, 120_000)

  /**
   * WHEN THE QUOTED WORDS CHANGE, THE SCREEN SAYS SO.
   *
   * THE MEASUREMENT THIS EXISTS FOR. Twenty-one characters were added to the front of a report's
   * prose block. On reload the highlight was simply gone, and nothing anywhere on the page said
   * why. The server's own reading already knew — it answers `there`, `changed` or `gone` — and the
   * screen threw it away. A comment whose words moved has not vanished: it is the one a person most
   * needs to see, because it may now be about something else.
   *
   * IT RUNS LAST AND IT EDITS THE REPORT, so nothing above it reads a changed corpus. What it
   * changes is only the prose block; the table is written back exactly as it was, which is what
   * makes the second half of this test a control rather than a coincidence.
   */
  it('says on the object when the words a comment quoted are not there any more', async () => {
    const ADDED = 'Rewritten on Friday: '
    expect(ADDED.length, 'the measurement was 21 characters added to the front').toBe(21)

    await api(
      `/api/records/${reportId}`,
      {
        data: {
          date: '2026-08-18',
          blocks: [
            { id: 'b-prose', type: 'text', text: `${ADDED}${REPORT_PROSE}` },
            {
              id: 'b-table',
              type: 'table',
              columns: [{ label: 'Run' }, { label: 'What happened' }],
              rows: [{ cells: ['1', 'held to twenty newtons'] }, { cells: ['2', 'dropped at sixteen newtons'] }],
            },
          ],
        },
      },
      'PATCH',
    )

    await open(`/r/${reportId}`)
    await page.waitForSelector('[data-target^="reportBlock/"]', { timeout: 20_000 })
    // THE CIRCLE'S OWN SENTENCE IS THE THING THE SLEEP STOOD IN FOR.
    await page.waitForSelector(
      '.px-comment-circle[aria-label*="The text around words one of them quoted has changed"]',
      { timeout: 20_000 },
    )

    const seen = await page.evaluate((prose) => {
      // THE PARAGRAPH, NOT THE BLOCK — see the note in the mark test above. The prose was rewritten
      // at the front, so the paragraph is found by the words the comment quoted rather than by
      // position.
      const block =
        [...document.querySelectorAll('[data-target^="region/"]')].find((one) =>
          (one.textContent ?? '').includes(prose),
        ) ?? null
      const cell = document.querySelectorAll('[data-target^="tableCell/"]')[3] ?? null
      const registry = (CSS as unknown as { highlights?: Map<string, { size: number } & Iterable<Range>> }).highlights
      const held = registry?.get('mole-office-noted')
      const lit: string[] = []
      if (held !== undefined) for (const range of held) lit.push(range.toString())
      // WHAT THE CIRCLE BESIDE EACH OF THEM IS CALLED. The sentence about the words having moved
      // used to be the second half of the block's own generated content; it is the circle's name
      // now, which is what a screen reader hears and what a hover shows.
      const named = (el: Element | null): string => {
        const key = el?.getAttribute('data-target') ?? ''
        if (key === '') return ''
        return document.querySelector(`.px-comment-circle[data-comments-on="${key}"]`)?.getAttribute('aria-label') ?? ''
      }
      return {
        block: named(block),
        cell: named(cell),
        cellNumber: (() => {
          const key = cell?.getAttribute('data-target') ?? ''
          return document.querySelector(`.px-comment-circle[data-comments-on="${key}"]`)?.textContent ?? ''
        })(),
        lit,
        prose,
      }
    }, REPORT_PROSE)

    // THE WORDS ARE NOT LIT, because they are not where the comment said they were and Mole Office will
    // not move a highlight onto text a person did not write about.
    expect(seen.lit, 'the highlight was left on words that have moved').not.toContain(seen.prose)

    // AND THE CIRCLE BESIDE THE BLOCK SAYS WHY. This is the whole point: a highlight that is absent
    // says nothing.
    expect(seen.block, 'the block says nothing about the words having changed').toContain(
      'The text around words one of them quoted has changed',
    )

    // THE CONTROL, ON THE SAME PAGE, IN THE SAME PASS. The table cell was written back exactly as it
    // was, its comment keeps what the cell held as its quote, so it is still lit and is NOT marked
    // as changed. Without this, a mark that said "text changed" about everything would pass.
    expect(seen.lit, 'the cell comment lost the words it kept').toContain('dropped at sixteen newtons')
    expect(seen.cell, 'an untouched cell was marked as though its words had changed').not.toContain(
      'The text around words one of them quoted has changed',
    )
    expect(seen.cellNumber, 'the untouched cell lost its mark altogether').not.toBe('')
  }, 120_000)

  /**
   * A COMMENT CAN RECORD WHICH REVISION IT WAS WRITTEN AGAINST, AND THE READING USES IT.
   *
   * This is the server half. A person commenting on a paragraph is commenting on the paragraph AS
   * THEY ARE READING IT, and `changed` is a much better sentence when it can also say what that
   * version held. `GET /api/records/:id/revisions` is where both halves of a revision come from,
   * and Mole Office checks the pair against the ledger rather than ever filling it in.
   *
   * THE BROWSER HALF IS NOT HERE AND IS NOT CLAIMED. Nothing written through the interface records
   * a revision yet, so this writes the context the way the interface will have to.
   */
  it('stores the revision a comment was written against, and says what that revision held', async () => {
    const ledger = (await read(`/api/records/${reportId}/revisions`)) as {
      revisions: { seq: number; contentHash: string }[]
    }
    // The oldest entry is the report as it was created, before the prose block was rewritten above.
    const asWritten = ledger.revisions[ledger.revisions.length - 1]
    expect(asWritten, 'the report has no revisions, so nothing can be written against one').not.toBe(undefined)

    const thread = await api('/api/agent/threads', { title: 'about a version I read', mode: 'review' })
    const threadId = (thread['thread'] as { id: string }).id
    const said = await api(`/api/agent/threads/${threadId}/messages`, {
      intent: 'ask',
      body: 'This sentence is the one I read on Tuesday.',
      context: {
        target: { kind: 'reportBlock', recordId: reportId, blockId: 'b-prose' },
        // WHERE, AS A PLACE AND NOT AS A SPAN BESIDE IT. A context carrying both is refused now, and
        // it is right to: two fields naming words are free to name different words. The span is
        // worked out from the place by one function.
        place: {
          at: 'words',
          span: {
            quote: shortenToWords(REPORT_PROSE).words,
            from: 0,
            to: REPORT_PROSE.length,
            field: 'data.blocks[#b-prose].text',
          },
          cut: true,
        },
        revision: { seq: asWritten!.seq, contentHash: asWritten!.contentHash },
      },
    })

    const message = said['message'] as {
      context: { revision?: { seq: number } } | null
      reading: { state: string; says: string; writtenAgainst?: { heldThere: string | null; says: string } } | null
    }
    // IT IS STORED, and it comes back on the record of what was said.
    expect(message.context?.revision?.seq).toBe(asWritten!.seq)

    // AND THE READING USES IT. The block was rewritten in the test above, so these words have moved,
    // and the sentence now carries what that revision held where the comment was pointing.
    expect(message.reading?.state, message.reading?.says).toBe('changed')
    expect(message.reading?.writtenAgainst?.heldThere, 'the revision the comment names was not read').toBe(
      REPORT_PROSE,
    )
    expect(message.reading?.says).toContain('written against revision')

    await api(`/api/agent/threads/${threadId}`, { state: 'abandoned' }, 'PATCH')
  }, 120_000)
})
