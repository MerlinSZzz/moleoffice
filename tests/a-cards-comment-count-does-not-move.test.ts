// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE COMMENT COUNT ON A CARD DOES NOT CHANGE WITH THE DETAIL TICK — CRITERION D23, IN A BROWSER.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE OWNER MET
 * ---------------------------------------------------------------------------------------
 *
 * Section 23 of design/messages/ACCEPTANCE.md: after the detail tick was pressed, a 1 for a comment
 * appeared, and pressing it opened Your reviews in the right-hand column with no comment to be seen.
 * One of the problems is that a comment behaved differently with the tick, appearing and disappearing.
 *
 * REPRODUCED ON THE OWNER'S OWN HANDOVER V2 PIPELINE, on an isolated copy of the owner's database, 6 September 2026.
 * A comment left on one part of the ZED 2i card drew a circle reading 1 while the card's detail tick
 * was on and the card was at level 5. Taking the tick off dropped the card to level 3, and at level
 * 3 a card draws no parts at all — so the element carrying that comment's key left the page and the
 * circle went with it.
 *
 * THE CAUSE, EXACTLY. A comment on a part of a record is filed against that part's own region key.
 * `whereEachIsDrawn` in MarkLayer.tsx already re-spells a key nothing on the page carries, through
 * `elementDrawing` — but only for comments the server sent, and only to a report's own blocks. A
 * comment saved and not sent is kept in this browser and arrives as a key alone, so it went through
 * neither. Both are fixed: a drawing's card answers for every part of its record, and a kept draft
 * is re-spelled the same way a server mark is.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE DOES NOT COVER, AND WHERE IT WENT
 * ---------------------------------------------------------------------------------------
 *
 * The other half of what the owner reported — pressing the count opens *Your reviews* and the column shows
 * nothing — is the review column's, not the card's. It was filed as its own problem for the builder
 * working on the review column. Since shape B the composer has no Save without sending: its second
 * press is Start review, which writes the same comment and puts it in the page's review. The comment
 * this file writes goes that way, so the count under test is the count of a comment in a review.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   make `elementDrawing` in src/web/lib/drawnhere.ts return null instead of asking
 *     `theCardDrawnFor` → red: the count disappears when the tick comes off.
 *   stop passing the kept drafts to `whereEachIsDrawn` in MarkLayer.tsx → red for the same reason,
 *     from the other end.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { keepTheCommentInAReview, type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { theDrawingHasSettled } from './the-drawing-has-settled.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let app: LiveApp
let page: Page
let richId = ''

const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

const SUMMARY =
  'Quokka three of four printed wrist mounts broke below the load the handover trials need, so only ' +
  'the aluminium one is worth another run this week.'
const HEADING_ONE = 'Gannet the printed mount fails below the trial load'
const HEADING_TWO = 'Kestrel the aluminium mount is still on order'

const BLOCKS = [
  {
    id: 'b-1',
    type: 'finding',
    text:
      'Ostrich four printed wrist mounts were pulled to failure on the bench jig this week, and three of ' +
      'them broke at the thin section behind the bolt circle, at fourteen point two, fifteen point one and ' +
      'fifteen point four newtons, which is below the twenty the transplant trials need, so the printed part ' +
      'cannot be used for them at all. The fourth held to twenty-two newtons and had been printed at half ' +
      'the layer height, which was a mistake in the print queue rather than a decision anybody made.',
  },
  {
    id: 'b-2',
    type: 'finding',
    text:
      'Marmot nobody has pulled the aluminium mount yet, because the shop has not cut one: the order went ' +
      'in on Tuesday and the same geometry is expected next week, so the bench is free until then and the ' +
      'jig can stay set up as it is. Nothing else on the handover work is waiting on this, and the trials ' +
      'themselves are held by the gripper calibration rather than by the mount.',
  },
]

async function post(path: string, body: unknown): Promise<{ record: { id: string } }> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as { record: { id: string } }
}

beforeAll(async () => {
  app = await liveApp({ name: 'count-does-not-move', viewport: { width: 1440, height: 1000 } })
  page = app.page

  const rich = await post('/api/records', {
    kind: 'module',
    title: 'Wrist mount pull rig',
    summary: SUMMARY,
    data: { state: 'active', parts: [], summaryBlocks: BLOCKS },
  })
  richId = rich.record.id
  for (const [title, summary] of [
    ['Bench jig', 'Holds the mount while it is pulled.'],
    ['Load cell bench', 'Where the pulls are done and the numbers come from.'],
  ] as const) {
    const made = await post('/api/records', { kind: 'module', title, summary, data: { state: 'active', parts: [] } })
    const linked = await fetch(`${app.api}/api/links`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ fromId: richId, toId: made.record.id, type: 'relates_to' }),
    })
    if (!linked.ok) throw new Error(`the modules could not be linked: ${await linked.text()}`)
  }

  // THE RECORD WRITTEN BY PART, which is what levels 4 to 6 are and what the detail tick opens.
  const revisions = await fetch(`${app.api}/api/records/${richId}/revisions`, { headers: HEADERS })
  const list = (await revisions.json()) as { revisions: { seq: number; contentHash: string }[] }
  const newest = [...list.revisions].sort((a, b) => b.seq - a.seq)[0]
  if (newest === undefined) throw new Error('the module has no revision for a by-part summary to name')
  const wrote = await fetch(`${app.api}/api/records/${richId}/short-forms`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      madeFrom: { seq: newest.seq, contentHash: newest.contentHash },
      forms: {
        parts: [
          {
            id: 'p-one',
            heading: HEADING_ONE,
            text30: 'Bittern three of four printed mounts broke between fourteen and sixteen newtons, under twenty.',
            text120:
              'Caribou four printed mounts were pulled on the bench jig and three broke at the thin section ' +
              'behind the bolt circle, below the twenty newtons the handover trials need.',
            covers: ['b-1'],
          },
          {
            id: 'p-two',
            heading: HEADING_TWO,
            text30: 'Aardvark an aluminium mount of the same geometry has been ordered and nothing waits on it.',
            text120:
              'Tapir an aluminium mount of the same geometry has been ordered and is expected next week, and ' +
              'nothing else on the handover work is waiting on it.',
            covers: ['b-2'],
          },
        ],
      },
    }),
  })
  if (!wrote.ok) throw new Error(`the parts were not stored: ${await wrote.text()}`)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function openTheDrawing(theme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme })
  await page.goto(`${app.site}/#/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.evaluate(() => {
    window.sessionStorage.clear()
    window.localStorage.removeItem('mole-office.detail')
    window.localStorage.removeItem('mole-office.detail.graph')
  })
  await page.goto(`${app.site}/#/pipeline/drawing`, { timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.gx-canvas-wrap[data-shows="1"]', { timeout: 60_000 })
  await theDrawingHasSettled(page)
}

/** Press the card, which is what puts its own controls on it. */
async function focusTheCard(): Promise<void> {
  await page.locator(`.gx-card[data-target^="record/${richId}/"]`).first().click({ position: { x: 3, y: 3 } })
  await theDrawingHasSettled(page)
}

/** Turn the card's detail tick on or off. It is the one control at the card's bottom-right. */
async function pressTheTick(): Promise<void> {
  // ONLY WHERE IT IS NOT ALREADY FOCUSED. A second press on a focused card takes the focus off it —
  // that is the card's own toggle, criterion D1 — so pressing blindly would hide the tick.
  const tick = page.locator(`.gx-card[data-target^="record/${richId}/"] .gx-card-tick`).first()
  if ((await tick.count()) === 0) await focusTheCard()
  if ((await tick.count()) === 0) throw new Error('the card has no detail tick on it')
  await tick.click()
  await theDrawingHasSettled(page)
}

async function dragTheEdge(by: number): Promise<void> {
  const grip = await page.evaluate((id) => {
    const el = document.querySelector(`.gx-card[data-target^="record/${id}/"] .gx-grip[data-grip="right"]`)
    if (el === null) return null
    const box = el.getBoundingClientRect()
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }, richId)
  if (grip === null) throw new Error('the card has no right grip on screen')
  await page.mouse.move(grip.x, grip.y)
  await page.mouse.down()
  for (let step = 1; step <= 8; step += 1) {
    await page.mouse.move(grip.x + (by * step) / 8, grip.y, { steps: 2 })
    await page.waitForTimeout(60)
  }
  await page.mouse.up()
  await theDrawingHasSettled(page)
}

/**
 * BRING THE WHOLE DRAWING BACK INTO THE WINDOW, so the card under test is one a reader can see.
 *
 * A CARD NOBODY CAN SEE DRAWS NO COUNT, and that is criterion D27 rather than a gap in this one: a
 * mark placed from the box of a card the canvas has clipped away lands at a document coordinate
 * below the whole page, which is the blank area the owner found. So growing a card until it hangs
 * out of the canvas and then asking for its count would be asserting that defect. `Fit all` puts
 * the drawing back in the window; it changes the canvas zoom and nothing a card says.
 */
async function fitTheDrawing(): Promise<void> {
  const fit = page.getByRole('button', { name: 'Fit all' }).first()
  // `dispatchEvent` AND NOT `click`: the control draws itself as not available when the drawing
  // already fits — criterion D1 — and Playwright waits for a disabled button for ever.
  if ((await fit.count()) > 0) await fit.dispatchEvent('click')
  await theDrawingHasSettled(page)
}

/** Wait until the composer is open and its box can be typed into. */
async function theComposerIsOpen(): Promise<void> {
  await page.getByRole('dialog', { name: 'Talk about this' }).locator('textarea').first().waitFor({ timeout: 30_000 })
}

/**
 * Wait until the composer has gone from the page.
 *
 * `.px-talk` is the composer's own frame (src/web/components/agent/TalkBox.tsx), whichever state it
 * is in, so its leaving is the composer closing.
 */
async function theComposerHasClosed(): Promise<void> {
  await page.waitForSelector('.px-talk', { state: 'detached', timeout: 30_000 })
}

/**
 * Wait until this browser is keeping the words typed into the composer.
 *
 * The composer keeps an unsent instruction in `mole-office.talk.drafts` (src/web/lib/drafts.ts) on
 * every change to the box, and the case is about that kept instruction, so this is the thing to wait
 * for before the composer is closed.
 */
async function theWordsAreKept(words: string): Promise<void> {
  await page.waitForFunction(
    (said) => (window.localStorage.getItem('mole-office.talk.drafts') ?? '').includes(said),
    words,
    { timeout: 30_000 },
  )
}

/** What the card is showing, and every comment count drawn on the page. */
async function theState(): Promise<{ level: string | null; parts: number; counts: string[] }> {
  return page.evaluate((id) => {
    const el = document.querySelector(`.gx-card[data-target^="record/${id}/"]`)
    return {
      level: el?.getAttribute('data-rung') ?? null,
      parts: el?.querySelectorAll('.gx-card-part').length ?? 0,
      counts: [...document.querySelectorAll('.px-comment-circle')].map((c) => (c.getAttribute('aria-label') ?? '')),
    }
  }, richId)
}

// LIGHT ONLY. A comment count does not depend on the colour scheme, so the light half is the one kept.
for (const theme of ['light'] as const) {
  describe(`a card's comment count does not change with the detail tick, in ${theme}`, () => {
    it('keeps the count when the tick that drew the part comes off', async () => {
      await openTheDrawing(theme)
      await pressTheTick()
      await dragTheEdge(200)
      const open = await theState()
      expect(open.parts, 'the card is drawing its parts with the tick on').toBeGreaterThan(0)

      // A COMMENT ON ONE PART, written the way a person writes one: right-click, type, Start review.
      // The review may already be collecting, in which case the press is Add to review (wave 13x
      // round 22), and `keepTheCommentInAReview` presses whichever is offered.
      await page.locator(`.gx-card[data-target^="record/${richId}/"] .gx-card-part`).first().click({ button: 'right' })
      await page.getByRole('dialog', { name: 'Talk about this' }).waitFor({ timeout: 30_000 })
      await theComposerIsOpen()
      const box = page.getByRole('dialog', { name: 'Talk about this' })
      await box.locator('textarea').first().fill('A comment on one part of this card, left on the drawing.')
      await keepTheCommentInAReview(page)
      // THE COMPOSER SAYS THE COMMENT IS IN THE PAGE'S REVIEW once the write and the review have both
      // been answered. Waiting for that sentence, and not for the frame alone, is what makes sure the
      // comment was written and not left kept with the review refused.
      await page.waitForSelector('.px-talk-said [data-part="in-the-review"]', { timeout: 30_000 })
      // ESCAPE DOES NOT CLOSE THE COMPOSER IN THIS STATE: its frame stays open, saying the comment
      // was written down, as it did when this waited a fixed time here. So there is nothing to wait
      // for after it. What the next line needs is the drawing with the comment's count on it, and
      // `fitTheDrawing` waits for that: no request out, and the drawing still.
      await page.keyboard.press('Escape')

      await fitTheDrawing()
      const withTheTick = await theState()
      const onThePart = withTheTick.counts.filter((said) => said.includes('part of a record'))
      // AT LEAST ONE, not exactly one: the two cases run against one database and one browser, so
      // the second case sees the first case's comment as well as its own. What is under test is that
      // the SET of counts is the same before and after the tick, which is asserted below.
      expect(onThePart.length, 'the comment on the part draws a count').toBeGreaterThan(0)

      // THE TICK COMES OFF, so the card falls back to level 3 and draws no parts at all.
      await pressTheTick()
      await fitTheDrawing()
      const without = await theState()
      expect(without.parts, 'the card is drawing no parts with the tick off').toBe(0)
      expect(
        without.counts.filter((said) => said.includes('part of a record')),
        'the same count is drawn, on the card that holds the part',
      ).toEqual(onThePart)
    }, 240_000)

    /**
     * THE SAME THING FOR AN INSTRUCTION SOMEBODY STARTED AND HAS NOT SENT, WHICH IS WHAT THE OWNER HAD.
     *
     * A comment the server knows about and an instruction kept in this browser reach the mark layer
     * by two different roads, and only the first was re-spelled. On the owner's own pipeline the server's
     * list was empty — no conversation about that project was open — so what drew the owner's circle was the
     * kept instruction, and it was the one road with no re-spelling on it.
     *
     * NOTHING IS SENT AND NOTHING IS SAVED HERE. Typing into the composer keeps the instruction, and
     * closing it leaves it kept; that is the whole of what this case needs.
     */
    it('keeps the count for an instruction that is only kept in this browser', async () => {
      await openTheDrawing(theme)
      await pressTheTick()
      await dragTheEdge(200)
      expect((await theState()).parts, 'the card is drawing its parts with the tick on').toBeGreaterThan(0)

      await page.locator(`.gx-card[data-target^="record/${richId}/"] .gx-card-part`).nth(1).click({ button: 'right' })
      await page.getByRole('dialog', { name: 'Talk about this' }).waitFor({ timeout: 30_000 })
      await theComposerIsOpen()
      await page
        .getByRole('dialog', { name: 'Talk about this' })
        .locator('textarea')
        .first()
        .fill('Started about this part and never sent.')
      await theWordsAreKept('Started about this part and never sent.')
      await page.keyboard.press('Escape')
      await theComposerHasClosed()

      await fitTheDrawing()
      const kept = (await theState()).counts.filter((said) => said.includes('have not sent'))
      expect(kept.length, 'the kept instruction draws a count').toBeGreaterThan(0)
      await pressTheTick()
      await fitTheDrawing()
      const without = await theState()
      expect(without.parts, 'the card is drawing no parts with the tick off').toBe(0)
      expect(
        without.counts.filter((said) => said.includes('have not sent')),
        'the same count is drawn, on the card that holds the part',
      ).toEqual(kept)
    }, 240_000)
  })
}
