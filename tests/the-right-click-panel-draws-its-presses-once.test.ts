// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RIGHT-CLICK PANEL DRAWS ONE ROW OF PRESSES, ONCE, THE SAME EACH TIME. Wave 13y round 134, item 72 a and c.
 *
 * The problem as it was seen: after a right-click, two sets of send controls appeared one after the other, and Add to
 * review was sometimes yellow and sometimes gone. The panel drew Send and Start review while it read which reviews
 * collect, then swapped them for Add to review and "Send now, outside the review" when the read answered. Add to review
 * was yellow only while words were in the box, and Send was never yellow.
 *
 * What the line's secretary set for item 72: Send is the first press and the yellow one, and says "Send" whether or not
 * a review collects. The second press is Start review, or Add to review while a collecting review reaches the thing.
 * The row is held at its own height until both reads answer, and then drawn once. A read that fails is said in words.
 * While a collecting review reaches the thing the send key does what Add to review does, and otherwise it sends, and a
 * small mark on the press says which one the key does.
 *
 * In a real browser against a Mole Office of its own, with made-up records, each case right-clicks words of a report
 * and reads the press row on every frame the browser draws, from before the click until the row has stood for a second.
 * The read of the reviews is held back 700 ms in every case, so the time it takes is long enough to see on every run.
 *  1. With no review collecting: Send, then Start review, then More, drawn once, at one height.
 *  2. With no review collecting, the send key sends, and Send carries the key's mark.
 *  3. After a send to an agent nothing holds, which answers 409 with the letter stored: the box empties at once under
 *     the routed line, and the next opening on the same words has an empty box and its row drawn once, at one height.
 *  4. With a review collecting that reaches the thing, and going to the agent the box shows: Send, then Add to review,
 *     then More, drawn once, at one height, at 1440 and at 390. With words written, Add to review is its words alone.
 *  5. With that review, the send key adds the comment to the review and sends nothing, and Add to review carries no
 *     mark. Send keeps its word and says on hover that it sends now, outside the review.
 *  6. With a review collecting about another thing: Send, then Start review, then More, drawn once, at 1440 and at
 *     390. With words written, Start review is its words alone.
 *  7. When the read of the reviews fails: the row is drawn once, with Send first, and the failure is said in words.
 *
 * Test change (wave 13y round 169, point RC-2 of the right-click box): after his first use of the box, the owner asked
 * that the review press be its words alone. Start review and Add to review now carry no key mark, no keys for a screen
 * reader and no sentence on hover, at 1440 and at 390, and the send key still adds to the review while one collects.
 * Send keeps its mark while the key sends, and its hover sentence while a review collects. Cases 2, 4, 5 and 6 say so.
 *
 * THE FILM is taken only when W13Y_PANEL_FILM names a folder outside the checkout: a right-click while a review
 * collects, at 1440, with the read held back as in the cases. It is made-up data, and it carries the label that says so.
 *
 * Everything here is made up.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp, thePersonsKeyHeader } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS = (handle: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })
const AGENT = { name: 'Made-up Kiln Keeper', handle: 'made-up-kiln-keeper' }
/** An agent that nothing holds, so a person's send to it answers 409 with the letter stored and routed. */
const UNHELD = { name: 'Made-up Glaze Mixer', handle: 'made-up-glaze-mixer' }
const film = process.env.W13Y_PANEL_FILM
const LABEL = 'Made-up data — an invented office, not real office data'
/** How long each read of the reviews is held back, so the read is long enough to be seen on every run. */
const HELD_BACK_MS = 700
/**
 * The keys the send key is before anybody chooses, as aria-keyshortcuts writes them, and the mark drawn for them. They
 * are written out here because the code before this file has no export for them, and the file runs against it too.
 */
const THE_KEYS = 'Shift+Enter Alt+Enter'
const THE_MARK = '⇧↵'
/** The words the panel draws, read by their keys. More's menu arrow is drawn after its word. */
const { t } = createI18n('en')
const SEND = t('talk.send')
const START = t('talk.startReview')
const ADD = t('talk.addToReview')
const MORE = `${t('talk.more')} ▾`
const YELLOW = (name: string): string => `${name} (primary)`

let app: LiveApp
let page: Page
let reportHere = ''
let reportElsewhere = ''
/** The report case 3 right-clicks, which no other case opens. */
let reportRouted = ''
let reviewId = ''
/** The made-up agent's record, which the review is chosen to go to. */
let agentRecord = ''

/** One press of the row, as it was drawn in one frame. */
interface Press {
  name: string
  variant: string
  off: boolean
  keys: string | null
  mark: string | null
}
/** The row in one frame: null while there is no panel. */
type Frame = { busy: boolean; height: number; presses: Press[] } | null

async function post<T>(path: string, body: unknown, headers: Record<string, string> = PERSON): Promise<T> {
  const reply = await fetch(app.api + path, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return (await reply.json()) as T
}

/** What is waiting for the agent: each message's words, as the agent asks. */
async function waitingForTheAgent(): Promise<string[]> {
  const reply = await fetch(`${app.api}/api/messages?only=waiting-for-me&full=1`, { headers: AS(AGENT.handle) })
  const text = await reply.text()
  expect(reply.status, text).toBe(200)
  return (JSON.parse(text) as { messages: { body: string }[] }).messages.map((one) => one.body)
}

/** How many comments every collecting review holds. */
async function heldInCollectingReviews(): Promise<number> {
  const reply = await fetch(`${app.api}/api/reviews?state=collecting`, { headers: PERSON })
  const text = await reply.text()
  expect(reply.status, text).toBe(200)
  return Object.values((JSON.parse(text) as { collectingHolds: Record<string, number> }).collectingHolds).reduce((sum, n) => sum + n, 0)
}

/** Hold back every read of the reviews, and fail the one that asks what reaches the thing when `failing` says so. */
async function holdTheReviewsBack(on: Page, failing = false): Promise<void> {
  await on.unroute('**/api/reviews*')
  await on.route('**/api/reviews*', async (route) => {
    const url = new URL(route.request().url())
    if (route.request().method() !== 'GET' || url.pathname !== '/api/reviews') return route.fallback()
    await new Promise((resolve) => setTimeout(resolve, HELD_BACK_MS))
    if (failing && url.searchParams.has('covers')) {
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Made-up failure: the test refused this read.' }) })
    }
    return route.fallback()
  })
}

/** Open a report fresh, in English. */
async function openTheReport(on: Page, id: string): Promise<void> {
  await on.goto(`${app.site}/?lang=en#/r/${id}`, { timeout: 60_000 })
  await on.reload({ timeout: 60_000 })
  await waitForThePage(on, 60_000)
  await on.locator('[data-text-field="data.blocks[#b-2].text"]').waitFor({ timeout: 30_000 })
}

/**
 * THE FILM'S LABEL WHILE A REVIEW COLLECTS. The review ring is a frame round the whole reading, drawn on its border only,
 * so its box holds every place a label can go and the label helper's box check counts the ring as covered. The ring is
 * taken out for the helper's check alone, and the label is then checked against the ring itself: it lies inside the
 * ring's border, where the ring draws nothing.
 */
async function labelInsideTheRing(on: Page, called: string): Promise<void> {
  const was = await on.evaluate(() => {
    const before = document.documentElement.getAttribute('data-review-edge')
    document.documentElement.setAttribute('data-review-edge', 'off')
    return before
  })
  try {
    await putTheMadeUpLabelIn(on, LABEL, on.locator('h1').first(), called)
  } finally {
    await on.evaluate((before) => {
      if (before === null) document.documentElement.removeAttribute('data-review-edge')
      else document.documentElement.setAttribute('data-review-edge', before)
    }, was)
  }
  const onTheRing = await on.evaluate(() => {
    const label = document.querySelector('[data-made-up-label]')?.getBoundingClientRect()
    if (label === undefined) return 'no label'
    for (const ring of document.querySelectorAll<HTMLElement>('.px-strip-ring')) {
      const r = ring.getBoundingClientRect()
      const w = parseFloat(getComputedStyle(ring).borderTopWidth)
      if (label.left < r.left + w || label.right > r.right - w || label.top < r.top + w || label.bottom > r.bottom - w) {
        return `label ${JSON.stringify([label.left, label.top, label.right, label.bottom])}, ring ${JSON.stringify([r.left, r.top, r.right, r.bottom])}, border ${String(w)}`
      }
    }
    return ''
  })
  expect(onTheRing, 'the label lies on the review ring').toBe('')
}

/** Start reading the press row on every frame. */
async function watchTheRow(on: Page): Promise<void> {
  await on.evaluate(() => {
    const w = window as unknown as { rowFrames: unknown[]; rowWatched: boolean }
    w.rowFrames = []
    w.rowWatched = true
    const tick = (): void => {
      if (!w.rowWatched) return
      const row = document.querySelector<HTMLElement>('.px-talk .px-talk-do')
      w.rowFrames.push(
        row === null
          ? null
          : {
              busy: row.getAttribute('aria-busy') === 'true',
              height: Math.round(row.getBoundingClientRect().height * 10) / 10,
              presses: [...row.querySelectorAll<HTMLElement>(':scope > button')]
                .filter((one) => one.offsetParent !== null && getComputedStyle(one).visibility !== 'hidden')
                .map((one) => ({
                  name: (one.getAttribute('aria-label') ?? one.innerText).replace(/\s+/g, ' ').trim(),
                  variant: one.dataset.variant ?? '',
                  off: one.getAttribute('aria-disabled') === 'true',
                  keys: one.getAttribute('aria-keyshortcuts'),
                  mark: one.dataset.keyMark ?? null,
                })),
            },
      )
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

/** Stop reading the row, and answer every frame read since the panel was first drawn. */
async function theFramesSeen(on: Page): Promise<Exclude<Frame, null>[]> {
  const frames = await on.evaluate(() => {
    const w = window as unknown as { rowFrames: unknown[]; rowWatched: boolean }
    w.rowWatched = false
    return w.rowFrames
  })
  const seen = frames as Frame[]
  const first = seen.findIndex((one) => one !== null)
  expect(first, 'the panel was never drawn').toBeGreaterThanOrEqual(0)
  const after = seen.slice(first)
  expect(after.every((one) => one !== null), 'the panel went away and came back while it was watched').toBe(true)
  return after as Exclude<Frame, null>[]
}

/** Select the first words of the report's second paragraph, right-click them, and wait until the row has stood a second. */
async function rightClickTheWords(on: Page): Promise<void> {
  const run = '[data-text-field="data.blocks[#b-2].text"]'
  await on.locator(run).evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const at = await on.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel)
    if (el === null) throw new Error('the paragraph is not drawn')
    const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode() as Text
    const range = document.createRange()
    range.setStart(node, 0)
    range.setEnd(node, 24)
    const s = window.getSelection()
    s?.removeAllRanges()
    s?.addRange(range)
    const r = range.getClientRects()[0]
    if (r === undefined) throw new Error('the words have no box')
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  }, run)
  await on.mouse.click(at.x, at.y, { button: 'right' })
  await on.locator('.px-talk').waitFor({ timeout: 20_000 })
  await on.locator('.px-talk .px-talk-do:not([aria-busy="true"])').waitFor({ timeout: 30_000 })
  await on.waitForTimeout(1_000)
}

/**
 * WHAT THE ROW DREW, frame by frame: each different set of presses in the order they came, how many frames drew no
 * press after the first that drew some, and every height the row had.
 */
function whatTheRowDrew(frames: Exclude<Frame, null>[]): { sets: Press[][]; emptyAfterDrawn: number; heights: number[] } {
  const sets: string[] = []
  let emptyAfterDrawn = 0
  for (const frame of frames) {
    if (frame.presses.length === 0) {
      if (sets.length > 0) emptyAfterDrawn += 1
      continue
    }
    const one = JSON.stringify(frame.presses)
    if (sets[sets.length - 1] !== one) sets.push(one)
  }
  return { sets: sets.map((one) => JSON.parse(one) as Press[]), emptyAfterDrawn, heights: [...new Set(frames.map((one) => one.height))] }
}

/** Right-click the words of `reportIdToOpen` and answer what the row drew. */
async function openAndWatch(reportIdToOpen: string, failing = false): Promise<ReturnType<typeof whatTheRowDrew>> {
  await holdTheReviewsBack(page, failing)
  await openTheReport(page, reportIdToOpen)
  await watchTheRow(page)
  await rightClickTheWords(page)
  return whatTheRowDrew(await theFramesSeen(page))
}

/** The presses of the open row as they stand: their words, their keys, the key's mark and the sentence on hover. */
async function theRow(): Promise<{ name: string; keys: string | null; mark: string | null; title: string | null }[]> {
  return await page.locator('.px-talk .px-talk-do > button').evaluateAll((all) =>
    all.map((one) => ({
      name: one.getAttribute('aria-label') ?? (one as HTMLElement).innerText.trim(),
      keys: one.getAttribute('aria-keyshortcuts'),
      mark: (one as HTMLElement).dataset.keyMark ?? null,
      title: one.getAttribute('title'),
    })),
  )
}

/**
 * The second press, with words in the box so it is on: its words alone, with no keys, no mark and no hover sentence.
 * The check is soft, so a press that fails it still leaves the box emptied for the cases after it in this one world.
 */
async function expectTheReviewPressIsItsWords(name: string): Promise<void> {
  const box = page.locator('.px-talk textarea')
  await box.fill('Made-up words, so the press is on.')
  expect.soft((await theRow())[1], `the second press at ${String(page.viewportSize()?.width)}`).toEqual({ name, keys: null, mark: null, title: null })
  // EMPTIED AGAIN, so no later opening finds these words kept.
  await box.fill('')
}

/** The presses as a person reads them: their words and whether each is the yellow one. */
const named = (presses: Press[]): string[] => presses.map((one) => `${one.name}${one.variant === 'primary' ? ' (primary)' : ''}`)

/** Expect the row to have drawn exactly `wanted`, once, at one height. */
function expectDrawnOnce(drew: ReturnType<typeof whatTheRowDrew>, wanted: string[]): void {
  expect(drew.sets.map(named), 'every set of presses the row drew, in order').toEqual([wanted])
  expect(drew.emptyAfterDrawn, 'frames with no press after the presses were drawn').toBe(0)
  expect(Math.max(...drew.heights) - Math.min(...drew.heights), `the row's heights: ${drew.heights.join(', ')}`).toBeLessThanOrEqual(0.5)
}

/** Write words in the open panel and choose the agent under To, then put the cursor back in the box. */
async function writeToTheAgent(words: string, name = AGENT.name): Promise<void> {
  const talk = page.locator('.px-talk')
  await talk.locator('textarea').fill(words)
  await talk.locator('.px-talk-to-btn').click()
  await talk.locator('.px-talk-contact', { hasText: name }).first().click()
  await talk.locator('textarea').click()
}

beforeAll(async () => {
  app = await liveApp({ name: 'the-panel-draws-its-presses-once', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  page = app.page
  agentRecord = (
    await post<{ record: { id: string } }>('/api/records', { kind: 'agent', title: AGENT.name, data: { handle: AGENT.handle, runtime: 'claude-code', state: 'active' } })
  ).record.id
  await post('/api/records', { kind: 'agent', title: UNHELD.name, data: { handle: UNHELD.handle, runtime: 'claude-code', state: 'active' } })
  const report = async (title: string, moved: string): Promise<string> =>
    (
      await post<{ record: { id: string } }>('/api/records', {
        kind: 'report',
        title,
        data: {
          for: 'A made-up reader',
          date: '2026-11-04',
          blocks: [
            { id: 'b-1', type: 'text', heading: 'What I found', text: 'The made-up kiln holds its heat through a second firing.' },
            { id: 'b-2', type: 'text', heading: 'What moved', text: moved },
          ],
        },
      })
    ).record.id
  reportHere = await report('Made-up report: the second firing', 'The made-up glaze ran at the foot of the tile. Nothing else moved.')
  reportElsewhere = await report('Made-up report: the clay store', 'The made-up clay store stayed dry all week. Nothing else moved.')
  reportRouted = await report('Made-up report: the kiln log', 'The made-up kiln log has no entry for Tuesday. Nothing else moved.')
}, 240_000)

afterAll(async () => {
  // LEFT FINISHED RATHER THAN COLLECTING, so nothing after this file inherits an open review.
  if (reviewId !== '') await post(`/api/reviews/${reviewId}/finish-collecting`, {})
  await app?.stop()
}, 60_000)

describe('with no review collecting', () => {
  it('draws Send, Start review and More once, at one height, with Send first and yellow', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    const drew = await openAndWatch(reportHere)
    expectDrawnOnce(drew, [YELLOW(SEND), START, MORE])
    await page.keyboard.press('Escape')
  }, 180_000)

  it('sends with the send key, and Send carries the key\'s mark', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    // CASE 2 IS ABOUT WHAT THE SEND KEY DOES, so it sends to an agent that is held and gets a real 201, and the message
    // waits for the agent. A send to an agent nothing holds answers 409, and case 3 holds what the box does then. The
    // hold is taken through the door an existing test uses (tests/the-chats-presence-mark-is-true.test.ts).
    const session = await post<{ record: { id: string } }>('/api/records', { kind: 'session', title: 'A made-up session holding the Kiln Keeper', data: { state: 'running', runtime: 'claude-code' } })
    await post(`/api/handles/${AGENT.handle}/hold`, { session: session.record.id, machine: 'a-made-up-machine', runtime: 'claude-code' }, { ...PERSON, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) })
    await openAndWatch(reportHere)
    const words = 'Made-up comment one: the glaze ran at the foot.'
    await writeToTheAgent(words)
    // SOFT, so a row that fails it still sends, and no later opening on this report finds the words kept.
    const row = await theRow()
    expect.soft(row.slice(0, 2)).toEqual([
      expect.objectContaining({ name: SEND, keys: THE_KEYS, mark: THE_MARK }),
      { name: START, keys: null, mark: null, title: null },
    ])
    await page.keyboard.press('Shift+Enter')
    await expect.poll(waitingForTheAgent, { timeout: 30_000 }).toContain(words)
    expect(await heldInCollectingReviews()).toBe(0)
  }, 180_000)
})

describe('after a send that answered 409 with the letter stored', () => {
  it('empties the box at once under the routed line, and the next opening on the same words has an empty box and one row height', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await openAndWatch(reportRouted)
    await writeToTheAgent('Made-up comment three: the kiln log has no entry for Tuesday.', UNHELD.name)
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed.
    const answered = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/records' && r.request().method() === 'POST')
    await page.keyboard.press('Shift+Enter')
    const reply = await answered
    expect(reply.status()).toBe(409)
    const said = (await reply.json()) as { error: string; record?: { id?: string } }
    expect(said.record?.id, 'the 409 still carries the stored letter').toBeTruthy()
    // THE BOX EMPTIES AT ONCE, AND THE ROUTED LINE IS ITS HEADING. The letter is stored, so the words are not left to look
    // unsent, and a second press makes no second letter.
    const heading = page.locator('.px-talk .px-error-mark strong')
    await heading.waitFor({ timeout: 15_000 })
    expect(await heading.textContent()).toBe(said.error)
    expect(await page.locator('.px-talk textarea').inputValue(), 'the words in the open box').toBe('')
    await page.keyboard.press('Escape')
    // THE NEXT OPENING ON THE SAME WORDS, after a reload: nothing was kept, so the box is empty and the row is drawn once.
    const drew = await openAndWatch(reportRouted)
    expect(await page.locator('.px-talk textarea').inputValue(), 'the words in the next opening').toBe('')
    expectDrawnOnce(drew, [YELLOW(SEND), START, MORE])
    await page.keyboard.press('Escape')
  }, 180_000)
})

describe('with a review collecting that reaches the thing', () => {
  beforeAll(async () => {
    reviewId = (
      await post<{ review: { id: string } }>('/api/reviews', {
        entry: { target: { kind: 'record', recordId: reportHere, workspaceId: 'default' }, place: { at: 'surface' } },
      })
    ).review.id
    // GOING TO THE AGENT THE BOX WILL SHOW, as a review started with Start review does. A review nobody chose a
    // recipient for is tests/a-comment-added-to-a-review-waits-with-the-review.test.ts; here the case asks only what
    // the send key does.
    await post(`/api/reviews/${reviewId}/recipient`, { recipient: { kind: 'agent', agentId: agentRecord } })
  }, 120_000)

  for (const width of [1440, 390]) {
    it(`draws Send, Add to review and More once, at one height, with Send first and yellow, at ${String(width)}`, async () => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      const drew = await openAndWatch(reportHere)
      expectDrawnOnce(drew, [YELLOW(SEND), ADD, MORE])
      await expectTheReviewPressIsItsWords(ADD)
      await page.keyboard.press('Escape')
    }, 180_000)
  }

  it('adds to the review with the send key and sends nothing, and Add to review carries no mark', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await openAndWatch(reportHere)
    const before = { waiting: await waitingForTheAgent(), held: await heldInCollectingReviews() }
    const words = 'Made-up comment two: the second firing ran long.'
    await writeToTheAgent(words)
    // SOFT, so a row that fails it still adds, and no later opening on this report finds the words kept.
    const row = await theRow()
    expect.soft(row.slice(0, 2)).toEqual([
      { name: SEND, keys: null, mark: null, title: t('talk.sendNow.title') },
      { name: ADD, keys: null, mark: null, title: null },
    ])
    await page.keyboard.press('Shift+Enter')
    await expect.poll(heldInCollectingReviews, { timeout: 30_000 }).toBe(before.held + 1)
    await page.waitForTimeout(1_000)
    expect(await waitingForTheAgent()).toEqual(before.waiting)
  }, 180_000)
})

describe('with a review collecting about another thing', () => {
  for (const width of [1440, 390]) {
    it(`draws Send, Start review and More once, and Start review is its words alone, at ${String(width)}`, async () => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      expect(reviewId, 'the review of the earlier cases is collecting').not.toBe('')
      const drew = await openAndWatch(reportElsewhere)
      expectDrawnOnce(drew, [YELLOW(SEND), START, MORE])
      await expectTheReviewPressIsItsWords(START)
      await page.keyboard.press('Escape')
    }, 180_000)
  }
})

describe('when the read of the reviews fails', () => {
  it('draws the row once with Send first, and says in words that the reviews were not read', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    const drew = await openAndWatch(reportHere, true)
    expectDrawnOnce(drew, [YELLOW(SEND), START, MORE])
    expect(await page.locator('.px-talk').innerText()).toContain(t('talk.reviewsNotRead'))
    await page.keyboard.press('Escape')
    await holdTheReviewsBack(page)
  }, 180_000)
})

it.runIf(film)('films a right-click while a review collects, at 1440', async () => {
  if (film === undefined || reviewId === '') throw new Error('the film needs W13Y_PANEL_FILM and the collecting review')
  const dir = join(film, 'films')
  mkdirSync(dir, { recursive: true })
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 }, recordVideo: { dir, size: { width: 1440, height: 1000 } } })
  await context.addInitScript(() => {
    localStorage.setItem('mole-office.preset.theme', 'light')
    localStorage.setItem('mole-office.language', 'en')
    localStorage.setItem('mole-office.workspace', 'default')
  })
  const filmed = await context.newPage()
  try {
    await holdTheReviewsBack(filmed)
    await openTheReport(filmed, reportHere)
    await labelInsideTheRing(filmed, 'the-panel-draws-its-presses-once')
    await filmed.waitForTimeout(800)
    for (let time = 0; time < 3; time++) {
      await rightClickTheWords(filmed)
      await filmed.waitForTimeout(800)
      await filmed.keyboard.press('Escape')
      await filmed.waitForTimeout(600)
    }
  } finally {
    await context.close()
  }
  const video = filmed.video()
  if (video === null) throw new Error('the window recorded no film')
  await video.saveAs(join(dir, 'the-panel-draws-its-presses-once.webm'))
  await video.delete()
}, 240_000)
