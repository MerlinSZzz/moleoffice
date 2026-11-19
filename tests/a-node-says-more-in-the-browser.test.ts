// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE NODE SAYS MORE AS IT IS FOCUSED AND ENLARGED, ON A SCREEN, WITHOUT THE GRAPH-WIDE CONTROL.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR, AND WHY NO OTHER TEST COULD MAKE ITS CLAIM
 * ---------------------------------------------------------------------------------------
 *
 * The acceptance for problem 5: the global detail selector is not used. One real card is focused,
 * enlarged and shrunk again, and what it says has to unfold and fold back along the semantic ladder,
 * in both a Module and a Pipeline drawing.
 *
 * The negative control beside it: three global detail buttons that exist, and a canvas zoom that is
 * independent, are not enough to call the original semantic zoom requirement complete. Criterion D9
 * of design/drawings/ACCEPTANCE.md.
 *
 * `tests/a-card-says-more-as-it-grows.test.ts` proves the ladder as a function. It would pass on a
 * page with no way for a person to move a card at all — which is exactly the page the owner met.
 * So this file presses. `document.elementFromPoint` at the middle of each control is the instrument:
 * it answers what a click there would hit, which is clipping, covering, pointer events and z-order
 * at once, and it is what found the detail control clipped away for a whole round.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   delete the per-node size affordance — take `CardControls` out of `CardSays` → every section
 *     below goes red: there is no way to move one node, which is the state before this pass.
 *   make the detail tick do nothing → the levels 4 to 6 sections go red.
 *   make `sizeWithFocus` answer its argument → the focus section goes red.
 *
 * ---------------------------------------------------------------------------------------
 * THE COMMENT CASES ABOUT A PIPELINE ARE ON A STEP'S LANES CARD SINCE 15 NOVEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * A filed pipeline's page draws its lanes, so a step card is drawn there and nowhere else. The case
 * that names the drawing a comment was written on writes it on a step's lanes card, and keeps its
 * drawing and pipeline assertions. It no longer asks for the box the step sat in, because the lanes
 * draw no frame for the pipeline a step belongs to.
 *
 * It was red when it was moved there: a comment on a lanes card stored no drawing, because the page
 * reads data-drawing="lanes" as no drawing and a numbered data-rung as no reading length. It goes
 * green when the page records the drawing a lanes card is on.
 *
 * A lanes card is to write its own number on data-card-rung (CARD_RUNG_ATTRIBUTE in
 * src/web/lib/drawnat.ts), and data-rung stays a reading length, so the page never reads a lanes
 * card's number as one. So the case also listens to the page's console while the comment is filed.
 * The page warns, in a line that begins "Mole Office: ", when an element claims a drawing or a
 * reading length it cannot place. The case asks for no warning containing "is not a reading length"
 * and none containing "is not a drawing". It matches the two by those words, so another warning does
 * not count.
 *
 * The case that opens a comment from the messages list writes it on the same card, and keeps its
 * address, card and level assertions. The level is the rung the lanes drew the card at, read off
 * data-card-rung and not pressed, because the lanes give a card no level control of its own. It was red when it was moved:
 * the messages list opened that comment on the step's record page. It goes green when the list opens
 * it on the pipeline's lanes with that card selected and at that rung.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ConsoleMessage, Page } from 'playwright'
import { goKeeping, keepTheCommentInAReview, type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { theDrawingHasSettled } from './the-drawing-has-settled.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { englishWords } from '../src/shared/words/joined.ts'
import { CARD_RUNG_ATTRIBUTE } from '../src/web/lib/drawnat.ts'
import { DRAWING, cardOf, theDrawingIsDrawn } from './a-made-up-office-drawn-in-lanes.ts'

let app: LiveApp
let page: Page
let pipelineId = ''
let richId = ''
let plainId = ''
let bareId = ''

const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/**
 * THE WORDS THIS FILE WRITES INTO THE CORPUS, one per level, each with a rare first word.
 *
 * A measurement has to be about the record and not about the page's own furniture, so every string
 * asked about below is one nothing else on the screen could have produced.
 */
/** Level 1 on the rich module: a name, not a sentence, and nothing else on screen produces it. */
const LABEL = 'Marlin wrist pull rig'
const STEP_LINE_ONE = 'Nineteen boards, all of them at arm reach.'
const STEP_LINE_TWO = 'Reprojection settled at four tenths of a pixel.'
const SUMMARY =
  'Quokka three of four printed wrist mounts broke below the load the handover trials need, so only ' +
  'the aluminium one is worth another run this week.'
const HEADING_ONE = 'Gannet the printed mount fails below the trial load'
const SHORT_ONE =
  'Bittern three of four printed mounts broke between fourteen and sixteen newtons, under the twenty the trials need.'
const LONG_ONE =
  'Caribou four printed mounts were pulled on the bench jig and three broke at the thin section behind ' +
  'the bolt circle, below the twenty newtons the handover trials need.'
const HEADING_TWO = 'Kestrel the aluminium mount is still on order'
const SHORT_TWO = 'Aardvark an aluminium mount of the same geometry has been ordered and nothing else waits on it.'
const LONG_TWO =
  'Tapir an aluminium mount of the same geometry has been ordered and is expected next week, and ' +
  'nothing else on the handover work is waiting on it.'

/**
 * A BODY LONGER THAN THE LADDER, on purpose.
 *
 * `rungsFor` stops a record's ladder at the first length the whole record fits in — the owner's rule
 * that no level says more than the record — and one part's long text is 120 words. A record shorter
 * than that has no level 6 to reach, so a fixture for the ladder has to be longer than the ladder.
 */
const BLOCKS = [
  {
    id: 'b-1',
    type: 'finding',
    text:
      'Ostrich four printed wrist mounts were pulled to failure on the bench jig this week, and three of ' +
      'them broke at the thin section behind the bolt circle, at fourteen point two, fifteen point one and ' +
      'fifteen point four newtons, which is below the twenty the transplant trials need, so the printed part ' +
      'cannot be used for them at all. The fourth held to twenty-two newtons and had been printed at half ' +
      'the layer height, which was a mistake in the print queue rather than a decision anybody made, and ' +
      'nobody has repeated it since. One sample is not a finding and the rig is not the question here.',
  },
  {
    id: 'b-2',
    type: 'finding',
    text:
      'Marmot nobody has pulled the aluminium mount yet, because the shop has not cut one: the order went ' +
      'in on Tuesday and the same geometry is expected next week, so the bench is free until then and the ' +
      'jig can stay set up as it is. Nothing else on the handover work is waiting on this, and the trials ' +
      'themselves are held by the gripper calibration rather than by the mount, which is written down on ' +
      'the pipeline and not here. The next run pulls four aluminium mounts and one printed one for comparison.',
  },
]

async function post(path: string, body: unknown): Promise<{ record: { id: string } }> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as { record: { id: string } }
}

beforeAll(async () => {
  app = await liveApp({ name: 'node-says-more', viewport: { width: 1440, height: 1000 } })
  page = app.page

  const pipeline = await post('/api/records', {
    kind: 'pipeline',
    title: 'Wrist calibration sweep',
    summary: 'Does the wrist camera hold its calibration across a working day?',
    data: { blockIds: [] },
  })
  pipelineId = pipeline.record.id
  // EACH STEP GETS ITS OWN LINE, so a step card has a level 3 to reach. A block filed with a name
  // and nothing else has a title and no summary, and its ladder stops at level 2 — which is the
  // record having no level 3 rather than the card refusing to draw one.
  for (const [name, line] of [
    ['Collect boards', STEP_LINE_ONE],
    ['Solve the intrinsics', STEP_LINE_TWO],
  ] as const) {
    const block = await post(`/api/records/${pipelineId}/blocks`, { name, state: 'done' })
    const patched = await fetch(`${app.api}/api/records/${block.record.id}`, {
      method: 'PATCH',
      headers: HEADERS,
      body: JSON.stringify({ summary: line }),
    })
    if (!patched.ok) throw new Error(`the block's line was not stored: ${await patched.text()}`)
  }

  const rich = await post('/api/records', {
    kind: 'module',
    title: 'Wrist mount pull rig',
    summary: SUMMARY,
    data: { state: 'active', parts: [], summaryBlocks: BLOCKS },
  })
  richId = rich.record.id
  const plain = await post('/api/records', {
    kind: 'module',
    title: 'Bench jig',
    summary: 'Holds the mount while it is pulled.',
    data: { state: 'active', parts: [] },
  })
  plainId = plain.record.id
  // A THIRD MODULE: LONG ENOUGH TO HAVE LEVELS 4, 5 AND 6, AND NOBODY HAS WRITTEN THEM.
  //
  // The three reasons a record has not got a level are three different facts and the card says
  // which. `Bench jig` above is the record that is too short for them; this one has room and is
  // simply unwritten, which is the reason a reader can act on. Without both, one sentence could
  // stand in for the other and nothing would fail.
  const bare = await post('/api/records', {
    kind: 'module',
    title: 'Load cell bench',
    summary: 'Where the pulls are done and the numbers come from.',
    data: { state: 'active', parts: [], summaryBlocks: BLOCKS },
  })
  bareId = bare.record.id
  for (const toId of [plainId, bareId]) {
    const linked = await fetch(`${app.api}/api/links`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ fromId: richId, toId, type: 'relates_to' }),
    })
    if (!linked.ok) throw new Error(`the modules could not be linked: ${await linked.text()}`)
  }

  // THE LEVELS WRITTEN BY PART, through the one write door. They cannot be sent with the record: a
  // by-part summary names the revision it was written from and a record being filed has none.
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
        // LEVEL 1, WRITTEN, so this record has every position of the ladder and the name line has
        // two different texts to move between. Nothing in the corpus had one, which is why the
        // rule that a card's title changes from level 1 to level 2 was never seen to fail.
        label: LABEL,
        parts: [
          { id: 'p-one', heading: HEADING_ONE, text30: SHORT_ONE, text120: LONG_ONE, covers: ['b-1'] },
          { id: 'p-two', heading: HEADING_TWO, text30: SHORT_TWO, text120: LONG_TWO, covers: ['b-2'] },
        ],
      },
    }),
  })
  if (!wrote.ok) throw new Error(`the parts were not stored: ${await wrote.text()}`)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/**
 * Open one drawing from cold, with nothing chosen on it, and wait until it has been laid out. A filed
 * pipeline's address draws its lanes, so `lanes` waits for those instead of the canvas.
 */
async function openTheDrawing(
  hash: string,
  theme: 'light' | 'dark' = 'light',
  drawn: 'canvas' | 'lanes' = 'canvas',
): Promise<void> {
  await page.emulateMedia({ colorScheme: theme })
  // KEEP IS ANSWERED IF ASKED: a comment written with Start review leaves the page's review holding
  // a comment not sent, and leaving that page asks what to do with it.
  await goKeeping(page, `${app.site}/#/`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    window.sessionStorage.clear()
    window.localStorage.removeItem('mole-office.detail')
    window.localStorage.removeItem('mole-office.detail.graph')
  })
  await goKeeping(page, `${app.site}/#/${hash}`)
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  if (drawn === 'lanes') {
    await theDrawingIsDrawn(page)
    return
  }
  await page.waitForSelector('.gx-canvas-wrap[data-shows="1"]', { timeout: 60_000 })
  await theDrawingHasSettled(page)
}

/** The id of the first step card on a pipeline's lanes. */
async function aStepOnTheLanes(): Promise<string> {
  const stepId = await page.locator(`${DRAWING} .e-card[data-role="step"]`).first().getAttribute('data-id')
  if (stepId === null) throw new Error('the pipeline’s lanes have no step card on them')
  return stepId
}

/** Every card on the drawing, keyed by the record it stands for, with what it says and where it is. */
async function theCards(): Promise<Record<string, { words: string; level: string | null; rung: string | null }>> {
  return page.evaluate(() => {
    const out: Record<string, { words: string; level: string | null; rung: string | null }> = {}
    for (const el of document.querySelectorAll('.gx-card, .gx-group')) {
      const target = el.getAttribute('data-target') ?? ''
      const id = target.split('/')[1] ?? target
      out[id] = {
        words: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
        level: el.getAttribute('data-rung'),
        rung: el.getAttribute('data-card-rung'),
      }
    }
    return out
  })
}

/** What one card says, by the record it stands for. */
async function theCard(recordId: string): Promise<{ words: string; level: string | null; rung: string | null }> {
  const cards = await theCards()
  const one = cards[recordId]
  if (one === undefined) throw new Error(`no card for ${recordId} on the drawing: ${Object.keys(cards).join(', ')}`)
  return one
}

/**
 * PRESS A CARD TO FOCUS IT, at a corner rather than in the middle.
 *
 * The card's name is a button that opens the record, so a press in the middle of a small card lands
 * on it and leaves the page. A press at the corner lands on the card's own padding, which is what
 * selects it — that is React Flow's own behaviour and the one this drawing keeps.
 */
async function focusTheCard(recordId: string): Promise<void> {
  await page.locator(`[data-target^="record/${recordId}/"]`).first().click({ position: { x: 3, y: 3 } })
  await theStripIsPressable()
}

/**
 * WAIT UNTIL A PRESS AT THE MIDDLE OF THE FOCUSED CARD'S CONTROLS WOULD REACH THEM.
 *
 * NOT A FIXED PAUSE, and the difference is a real one. Focusing a node changes what it says, so the
 * drawing is laid out again — and for a pipeline box it is laid out with more room in its head, so
 * the step inside it MOVES. Until ELK has answered, the step is still drawn where it was, over the
 * box's own controls. A fixed pause passed this file alone and failed it inside the full suite,
 * where the machine is busy; asking the question the test is about is what settles it.
 *
 * THE QUESTION IS ASKED OF A DRAWING THAT HAS STOPPED MOVING, so a strip that is reachable for one
 * frame on its way somewhere else is not taken as the answer. For twenty seconds at most.
 */
async function theStripIsPressable(): Promise<void> {
  const until = Date.now() + 20_000
  while (Date.now() < until) {
    await theDrawingHasSettled(page)
    const strip = await theStrip()
    if (strip.length > 0 && strip.every((one) => one.reachable)) return
  }
  const strip = await theStrip()
  throw new Error(
    `the focused card's controls are not at a point a press would reach after twenty seconds: ` +
      `${strip.length} controls, ${strip.filter((one) => one.reachable).length} of them reachable. ` +
      `A press at the middle of each lands on: ${strip.map((one) => one.hitInstead ?? 'itself').join(' · ')}`,
  )
}

/** The controls on the focused card, and whether a press at the middle of each would reach it. */
async function theStrip(): Promise<{ words: string; reachable: boolean; hitInstead: string | null }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.gx-card-strip button')].map((el) => {
      const r = el.getBoundingClientRect()
      const hit = r.width === 0 || r.height === 0 ? null : document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      const reachable = hit !== null && (hit === el || el.contains(hit))
      return {
        words: `${(el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim()}`,
        reachable,
        hitInstead: reachable ? null : `${hit?.tagName ?? 'nothing'}.${String(hit?.className ?? '')}`.slice(0, 80),
      }
    }),
  )
}

/** One press on a control of the focused card, named the way its accessible name names it. */
async function pressOnTheCard(label: string): Promise<void> {
  await page.locator(`.gx-card-strip button[aria-label="${label}"]`).first().click()
  await page.waitForSelector('.gx-canvas-wrap[data-shows="1"]', { timeout: 60_000 })
  await theDrawingHasSettled(page)
}

/** Press one of the card's own controls until it refuses, which is how it says it is at a limit. */
async function pressUntilRefused(label: string): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    const control = page.locator(`.gx-card-strip button[aria-label="${label}"]`).first()
    if ((await control.getAttribute('aria-disabled')) === 'true') return
    await control.click()
    await theDrawingHasSettled(page)
  }
  throw new Error(`${label} never refused, so its limit was never reached`)
}

/**
 * OPEN THE HAND CONTROL ON THE FOCUSED CARD, which is behind an unfold since 6 September 2026.
 *
 * Criterion D18: hide the setting where a person adjusts the level by hand. The control is kept and hidden, so a
 * test that presses it opens the fold first — which is what a person does.
 */
async function openTheHandControl(): Promise<void> {
  const unfold = page.locator('.gx-card-unfold[aria-label="Set the level by hand"]').first()
  if ((await unfold.count()) === 0) return
  await unfold.click()
  await page.locator('.gx-card-strip button[aria-label="One level longer for this card"]').first().waitFor({ timeout: 30_000 })
}

/** Less room, more room: the two words this file presses. Named once so a rename fails loudly. */
const LESS = 'Less room for this card'
const MORE = 'More room for this card'

/** The detail tick on the focused card, which has no minus or plus and is pressed by its own class. */
async function pressTheTick(): Promise<void> {
  await page.locator('.gx-card-tick').first().click()
  await page.waitForSelector('.gx-canvas-wrap[data-shows="1"]', { timeout: 60_000 })
  await theDrawingHasSettled(page)
}

/** The size word the focused card says it is at. */
async function sizeOnTheCard(): Promise<string | null> {
  return page.evaluate(() => document.querySelector('.gx-card-at[data-size]')?.getAttribute('data-size') ?? null)
}

/**
 * WHAT A READER READS OFF THE LEVEL PART OF THE STRIP — `Level 2`, `Level Conclusion`, `Level 6`.
 *
 * It is the axis word and the readout together, not the readout alone, because those two are what
 * a person's eye takes as one phrase. Reading only the readout is how `Level  Level 2` got onto a
 * card and passed every test here: the readout said `Level 2` and was right, and the strip said
 * the word twice. Problem `ffKdX7dfulEO`.
 */
async function levelOnTheCard(): Promise<string> {
  return page.evaluate(() => {
    const at = document.querySelector('.gx-card-at[data-level]')
    const axis = at?.previousElementSibling
    const word = axis?.classList.contains('gx-card-axis') ? `${(axis.textContent ?? '').trim()} ` : ''
    return `${word}${(at?.textContent ?? '').trim()}`.trim()
  })
}

/**
 * THE NAME LINE ON ONE CARD, and which stored field it says it came from.
 *
 * `data-name-from` is `shortForm` when the card drew somebody's written label and `node` when it
 * drew the record's own name. The card has always written it; nothing read it until the name line
 * started moving between the two.
 */
async function nameOnTheCard(id: string): Promise<{ text: string; from: string | null }> {
  return page.evaluate((recordId) => {
    const card = document.querySelector(`[data-target^="record/${recordId}/"]`)
    const title = card?.querySelector('.gx-card-title') ?? null
    return { text: (title?.textContent ?? '').trim(), from: title?.getAttribute('data-name-from') ?? null }
  }, id)
}

/** Which step of the graph-wide control is marked, so a test can say it never moved. */
async function markedStep(): Promise<string | null> {
  return page.evaluate(
    () => document.querySelector('.gx-says-step[aria-checked="true"]')?.getAttribute('data-gx-says') ?? null,
  )
}

/** What the drawing says about a refused press, wherever it draws it. */
async function refusalsOnScreen(): Promise<string> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.px-why, .gx-refused')]
      .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
      .join(' | '),
  )
}

/**
 * WAIT UNTIL THE PAGE SAYS SOMETHING ABOUT A REFUSED PRESS, for ten seconds at most.
 *
 * A refused press draws its reason in the same render as the press, so this usually ends on the
 * first look. It does not throw when nothing is said: the assertion after it is what says so, in its
 * own words, so a press that stays silent fails there and not at a timeout.
 */
async function untilARefusalIsDrawn(): Promise<void> {
  const until = Date.now() + 10_000
  while (Date.now() < until && (await refusalsOnScreen()) === '') {
    await page.evaluate(() => new Promise<void>((done) => window.requestAnimationFrame(() => done())))
  }
}

// ============================================================ D4, D5 and D9 on the module drawing

describe('one node on the module drawing says more as it is focused and enlarged', () => {
  for (const theme of ['light'] as const) {
    it(`walks the whole ladder up and back down in the ${theme} theme, without the graph-wide control`, async () => {
      await openTheDrawing('pipeline/drawing', theme)
      const started = await markedStep()
      await focusTheCard(richId)

      // THE CONTROLS ARE AT A POINT A PRESS WOULD REACH. This is the instrument the detail control
      // needed and did not have for a whole round.
      const strip = await theStrip()
      expect(strip.length, 'the focused card has no controls on it at all').toBeGreaterThan(0)
      for (const control of strip) {
        expect(
          control.reachable,
          `the control reading "${control.words}" is in the document and a press at the middle of it ` +
            `lands on ${control.hitInstead ?? 'nothing'}`,
        ).toBe(true)
      }

      // ALL THE WAY DOWN FIRST, so the walk up starts at the bottom of the ladder whatever the
      // drawing opened at.
      await pressUntilRefused(LESS)
      expect(await sizeOnTheCard()).toBe('smallest')
      const smallest = await theCard(richId)
      expect(smallest.level, 'the smallest card is not at level 1').toBe('label')
      expect(smallest.words, 'the smallest card drew the record’s own line').not.toContain(SUMMARY)

      await pressOnTheCard(MORE)
      expect(await sizeOnTheCard()).toBe('small')
      const small = await theCard(richId)
      expect(small.level, 'one size up is not at level 2').toBe('title')
      expect(small.words, 'level 2 drew the record’s own line').not.toContain(SUMMARY)

      await pressOnTheCard(MORE)
      expect(await sizeOnTheCard()).toBe('usual')
      const usual = await theCard(richId)
      expect(usual.level, 'the next size up is not at level 3').toBe('gist')
      expect(usual.words, 'level 3 did not draw the record’s own line under the title').toContain(SUMMARY)

      // ANYTHING ABOVE LEVEL 3 NEEDS THE TICK: a higher level is shown only through the detail tick.
      await pressTheTick()
      const ticked = await theCard(richId)
      expect(ticked.level, 'the step that showed level 3 does not show level 4 once the tick is on').toBe('outline')
      expect(ticked.words, 'level 4 did not draw the part’s heading').toContain(HEADING_ONE)
      expect(ticked.words, 'level 4 drew the part’s short text as well as its heading').not.toContain(SHORT_ONE)
      expect(ticked.words, 'level 4 drew the record’s own line beside its parts').not.toContain(SUMMARY)

      await pressOnTheCard(MORE)
      const larger = await theCard(richId)
      expect(larger.level, 'growing a ticked card does not reach level 5').toBe('sketch')
      expect(larger.words, 'level 5 did not draw the part’s short text').toContain(SHORT_ONE)
      expect(larger.words, 'level 5 drew the part’s long text').not.toContain(LONG_ONE)

      await pressOnTheCard(MORE)
      const largest = await theCard(richId)
      expect(largest.level, 'growing a ticked card does not reach level 6').toBe('digest')
      expect(largest.words, 'level 6 did not draw the part’s long text').toContain(LONG_ONE)
      expect(largest.words, 'level 6 did not draw the second part').toContain(HEADING_TWO)

      // AND IT REFUSES IN WORDS AT THE END, which is the rule for every control on a drawing.
      await page.locator(`.gx-card-strip button[aria-label="${MORE}"]`).first().dispatchEvent('click')
      await untilARefusalIsDrawn()
      // AND THE DRAWING HAS STOPPED MOVING, because the line after next says the press moved nothing.
      await theDrawingHasSettled(page)
      expect(await refusalsOnScreen()).toContain('Already as big as it goes')
      expect((await theCard(richId)).level, 'the refused press changed the level anyway').toBe('digest')

      // SHRINKING TAKES THE WORDS BACK DOWN THE SAME STEPS.
      await pressOnTheCard(LESS)
      expect((await theCard(richId)).level).toBe('sketch')
      await pressOnTheCard(LESS)
      expect((await theCard(richId)).level).toBe('outline')
      await pressOnTheCard(LESS)
      const back = await theCard(richId)
      expect(back.level).toBe('title')
      expect(back.words, 'shrinking left a part on the card').not.toContain(HEADING_ONE)

      // NOT ONE PRESS OF THE GRAPH-WIDE CONTROL, which is the whole of the owner's acceptance for this.
      expect(await markedStep(), 'the graph-wide control moved during the walk').toBe(started)
    }, 600_000)
  }

  it('moves the node it was pressed on and no other, which the graph-wide control cannot do', async () => {
    // D9, THE NEGATIVE CONTROL. On a page with three global detail buttons and an independent canvas
    // zoom and nothing else, there is no way to reach this state at all: every card would move
    // together. So this is the assertion that fails on the old page shape.
    await openTheDrawing('pipeline/drawing')
    const before = await theCards()
    await focusTheCard(richId)
    await pressOnTheCard(MORE)
    await pressTheTick()
    const after = await theCards()
    // `outline` AND NOT `sketch` SINCE 6 SEPTEMBER 2026. Focus used to add a size step of its own,
    // so a focused card started one rung further up; criterion D12 took that away — a press focuses
    // a card and changes nothing about its size. The same walk therefore ends one step lower, and
    // what this test is about is unchanged: one card moved and the other did not.
    expect(after[richId]?.level, 'the focused node did not reach a level written by part').toBe('outline')
    expect(after[richId]?.words, 'the focused node did not say more').toContain(HEADING_ONE)
    expect(
      (after[richId]?.words ?? '').length,
      'the focused node says no more than it did before it was focused and enlarged',
    ).toBeGreaterThan((before[richId]?.words ?? '').length)
    // THE OTHER CARD DID NOT COME WITH IT. A graph-wide control moves every card at once, so a
    // drawing where one card moved and the other did not is the thing that was missing.
    expect(after[plainId]?.words, 'the other card on the drawing gained the same words').not.toContain(HEADING_ONE)
    expect(after[plainId]?.level, 'the other card moved up the ladder too').not.toBe('outline')
  }, 600_000)

  it('says in words that a level nobody wrote is not written, rather than drawing a lower one', async () => {
    // A level a person picks by hand that does not exist is shown as not existing.
    await openTheDrawing('pipeline/drawing')
    await focusTheCard(bareId)
    await openTheHandControl()
    for (let i = 0; i < 5; i += 1) {
      const longer = page.locator('.gx-card-strip button[aria-label="One level longer for this card"]').first()
      if ((await longer.getAttribute('aria-disabled')) === 'true') break
      await longer.click()
      await theDrawingHasSettled(page)
    }
    const said = await theCard(bareId)
    expect(said.words, 'a level nobody wrote for this record was not said to be missing').toContain('is not written for this record')
    expect(said.words, 'a lower level was drawn in place of the one asked for').not.toContain(
      'Where the pulls are done and the numbers come from',
    )
  }, 600_000)

  it('says the record is too short, rather than that nobody wrote it, when that is why', async () => {
    // `Bench jig` is a title and a one-line summary. `rungsFor` stops its ladder at the conclusion,
    // so there is no level 4, 5 or 6 to write — and the write door refuses one. The tick told the
    // reader nobody had written it, which sends them to write something that would be refused and
    // drawn nowhere. Three reasons, three sentences, and only one of them is actionable.
    await openTheDrawing('pipeline/drawing')
    await focusTheCard(plainId)
    await page.locator('.gx-card-tick').first().dispatchEvent('click')
    await untilARefusalIsDrawn()
    const said = await refusalsOnScreen()
    expect(said, 'the tick blames nobody for a level the record has no room for').toContain(
      'too short for levels above the conclusion',
    )
    expect(said, 'the tick still says somebody could write it').not.toContain(englishWords()['g7b.CardFace.nobody_has_written_this_record_by_part'])
  }, 600_000)

  it('skips level 1 on a record nobody wrote a label for, and says level 2', async () => {
    // A level that does not exist is skipped by the automatic steps. The card used to say `Level 1` on this record while
    // drawing its title, which is level 2's text — a level number the record does not have.
    await openTheDrawing('pipeline/drawing')
    await focusTheCard(plainId)
    await pressUntilRefused(LESS)
    expect(await sizeOnTheCard()).toBe('smallest')
    expect((await theCard(plainId)).level, 'the smallest card claims a level nobody wrote').toBe('title')
    expect(await levelOnTheCard(), 'the readout names a level this record has not got').toBe('Level 2')
    // AND THE NAME IS STILL DRAWN, out of the record's own name, which the card says.
    const name = await nameOnTheCard(plainId)
    expect(name.text).toBe('Bench jig')
    expect(name.from).toBe('node')
  }, 600_000)

  it('changes the name line from the written label to the record’s own name between level 1 and level 2', async () => {
    // THE FIRST CLAUSE, AND THE FIRST THING TO BE TRIED: the card's title changes from level 1 to level 2. The
    // name a card drew was picked once for the whole drawing, so a card with a written label drew
    // the label at every size and the record's own name at none.
    await openTheDrawing('pipeline/drawing')
    await focusTheCard(richId)
    await pressUntilRefused(LESS)
    expect(await sizeOnTheCard()).toBe('smallest')
    const one = await nameOnTheCard(richId)
    expect(one.text, 'the smallest card does not draw the written label').toBe(LABEL)
    expect(one.from, 'the card does not say it drew somebody’s written label').toBe('shortForm')

    await pressOnTheCard(MORE)
    expect(await sizeOnTheCard()).toBe('small')
    const two = await nameOnTheCard(richId)
    expect(two.text, 'one size up the name line is not the record’s own name').toBe('Wrist mount pull rig')
    expect(two.from, 'the card does not say it drew the record’s own name').toBe('node')

    // AND IT STAYS THE RECORD'S OWN NAME ABOVE THAT: the title does not change again.
    await pressOnTheCard(MORE)
    expect((await nameOnTheCard(richId)).text, 'the name line moved again above level 2').toBe('Wrist mount pull rig')

    // BACK DOWN TO THE LABEL.
    await pressOnTheCard(LESS)
    await pressOnTheCard(LESS)
    expect((await nameOnTheCard(richId)).text, 'shrinking did not take the name line back to the label').toBe(LABEL)
  }, 600_000)
  it('reaches level 5 and level 6 by hand on a record whose level 4 is not written', async () => {
    // A person can still set the level by hand. The plus was computed from the level the card DREW, which on
    // a not-written level is the name line, so the readout walked 4, 3, 4, 3 for ever and levels 5
    // and 6 could not be asked for at all.
    await openTheDrawing('pipeline/drawing')
    await focusTheCard(bareId)
    await openTheHandControl()
    const readouts: string[] = []
    for (let i = 0; i < 5; i += 1) {
      const longer = page.locator('.gx-card-strip button[aria-label="One level longer for this card"]').first()
      if ((await longer.getAttribute('aria-disabled')) === 'true') break
      await longer.click()
      await theDrawingHasSettled(page)
      readouts.push(await levelOnTheCard())
    }
    expect(readouts, 'the hand control never reached level 5').toContain('Level 5')
    expect(readouts, 'the hand control never reached level 6').toContain('Level 6')
    expect(readouts, 'the hand control walked back down instead of up').toEqual([...new Set(readouts)])
    // THE READOUT NAMES THE LEVEL THE READER ASKED FOR, and the card says that level is not written.
    expect(await levelOnTheCard()).toBe('Level 6')
    expect((await theCard(bareId)).words).toContain('Level 6 is not written for this record')
  }, 600_000)
})

// ============================================================ D18: the hand control is behind a fold

/**
 * THE LEVEL CONTROL IS HIDDEN, AND IT IS STILL THERE — CRITERION D18.
 *
 * Criterion D18: hide the setting where a person adjusts the level by hand. An earlier rule, which still
 * stands, keeps that control available. So it is kept and folded away: the automatic steps, which
 * are the drag and the detail tick, are what a person sees.
 */
describe('the level control on a card is behind an unfold', () => {
  it('draws no level control on a focused card until the fold is opened', async () => {
    await openTheDrawing('pipeline/drawing')
    await focusTheCard(richId)
    expect(
      await page.locator('.gx-card-strip button[aria-label="One level longer for this card"]').count(),
      'the hand control is on the card before anybody asked for it',
    ).toBe(0)
    expect(
      await page.locator('.gx-card-strip button[aria-label="One level shorter for this card"]').count(),
      'the hand control is on the card before anybody asked for it',
    ).toBe(0)
    // WHAT IS ON THE CARD INSTEAD IS THE LEVEL IT IS AT, as a readout. A reader can see where the
    // automatic steps have got to without being offered a way to overrule them.
    expect(await levelOnTheCard(), 'the card does not say which level it is at').not.toBe('')
    expect(
      await page.locator('.gx-card-unfold[aria-label="Set the level by hand"]').count(),
      'there is no way to reach the hand control at all, so it is not kept',
    ).toBe(1)
  }, 600_000)

  it('opens the hand control on one press, and puts it away on the next', async () => {
    await openTheDrawing('pipeline/drawing')
    await focusTheCard(richId)
    await openTheHandControl()
    expect(
      await page.locator('.gx-card-strip button[aria-label="One level longer for this card"]').count(),
      'the fold opened and the hand control is not in it',
    ).toBe(1)
    await page.locator('.gx-card-unfold[aria-label="Put the level control away"]').first().click()
    await theDrawingHasSettled(page)
    expect(
      await page.locator('.gx-card-strip button[aria-label="One level longer for this card"]').count(),
      'the fold would not close again',
    ).toBe(0)
  }, 600_000)

  it('opens by itself on a card whose level somebody chose, so the way back is never hidden', async () => {
    // `Back to the sizes` is the only way out of a level chosen by hand, and a way out behind a fold
    // is a reader stuck at a level with the control that put them there out of sight.
    await openTheDrawing('pipeline/drawing')
    await focusTheCard(richId)
    await openTheHandControl()
    await page.locator('.gx-card-strip button[aria-label="One level longer for this card"]').first().click()
    await theDrawingHasSettled(page)
    expect(await page.locator('.gx-card-auto').count(), 'nothing offers the way back to the sizes').toBe(1)
    // AND IT IS STILL THERE AFTER THE CARD IS DRAWN AGAIN FROM COLD, because the level was stored.
    await focusTheCard(plainId)
    await focusTheCard(richId)
    expect(
      await page.locator('.gx-card-strip button[aria-label="One level longer for this card"]').count(),
      'the fold closed on a card whose level was chosen by hand',
    ).toBe(1)
    expect(await page.locator('.gx-card-auto').count(), 'the way back went away when the card was pressed again').toBe(1)
    await page.locator('.gx-card-auto').first().click()
    await theDrawingHasSettled(page)
    expect(await page.locator('.gx-card-auto').count(), 'the way back stayed after it had been used').toBe(0)
  }, 600_000)
})

// ============================================================ D6 and D7: the default, and both drawings

/**
 * THE GRAPH-WIDE DEFAULT IS STILL A DEFAULT, AND IT IS NO LONGER A CONTROL OVER THE DRAWING.
 *
 * Criterion D14. This section used to press the three steps of that control. That control is gone,
 * as not needed, so the default is set where the settings page sets
 * it, and read back off the cards exactly as before. What is being proved is the same: the default
 * decides where EVERY card opens, and a record with no level 1 opens at the next level it has.
 */
describe('the graph-wide default is still where every node starts', () => {
  const setTheDefault = async (rung: string): Promise<void> => {
    await page.evaluate((one) => {
      window.localStorage.setItem('mole-office.detail.graph', one)
    }, rung)
    await page.reload({ timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.waitForSelector('.gx-canvas-wrap[data-shows="1"]', { timeout: 60_000 })
    await theDrawingHasSettled(page)
  }

  it('sets where every card opens', async () => {
    await openTheDrawing('pipeline/drawing')
    await setTheDefault('label')
    const atOne = await theCards()
    for (const [id, card] of Object.entries(atOne)) {
      // LEVEL 1, AND A RECORD WITH NO LEVEL 1 OPENS AT THE NEXT LEVEL IT HAS. That is the skip rule
      // applied to the default, and it is the same rule the sizes follow: only the rich module has
      // a written label, so it is the only card that opens at level 1.
      expect(card.level, `${id} did not start at the level the default was set to`).toBe(
        id === richId ? 'label' : 'title',
      )
    }
    await setTheDefault('gist')
    const atThree = await theCards()
    for (const [id, card] of Object.entries(atThree)) {
      expect(card.level, `${id} did not start at the level the default was set to`).toBe('gist')
    }
  }, 600_000)
})

// ============================================================ D8: a comment says where it was written

/**
 * WHAT A COMMENT ON A CARD RECORDS, read back from the server rather than from the page.
 *
 * The owner's section 4 of design/PROBLEM-REGISTER-OWNER-MESSAGE.md: *A right-click anchor should
 * preserve: exact visible place when possible; current projection; underlying stable Semantic
 * Region; ancestor chain. A summary projection must not become an unrelated new object simply
 * because it is rendered differently from the Full presentation.* Criterion D8.
 *
 * MEASURED BEFORE THIS PASS: a right-click on any card stored the whole record and no view at all.
 * The card carried its nine-position card rung on `data-card-rung`, which the reader of a view
 * cannot place, so `theViewThisWasWrittenIn` answered `undefined` — honestly, and with nothing
 * recorded. `src/web/lib/drawnat.ts` said so in its own header.
 */
describe('a comment written on a card records the part it was on and the level it was at', () => {
  /** Right-click one element and write a comment on it, the way the rail's own test does. */
  const commentOn = async (selector: string, words: string): Promise<void> => {
    await page.evaluate((which) => {
      const el = document.querySelector(which)
      if (el === null) throw new Error(`${which} is not on the page`)
      const at = el.getBoundingClientRect()
      el.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: Math.round(at.left + 8),
          clientY: Math.round(at.top + 8),
        }),
      )
    }, selector)
    await page.waitForSelector('.px-talk', { timeout: 15_000 })
    await page.locator('.px-talk textarea').first().fill(words)
    // START REVIEW, THE KEEPING PRESS IN SHAPE B, which replaced Save without sending. It writes the
    // comment first and then starts this page's review. Since wave 13x round 22, once that review
    // collects here, the keeping press is Add to review in its place (`keepTheCommentInAReview`).
    // What this file reads is the comment's stored context; the wait is for the frame to say the
    // comment is in the review, so the review's own write has finished before the next case goes
    // elsewhere.
    await keepTheCommentInAReview(page)
    await page.waitForSelector('.px-talk-said [data-part="in-the-review"]', { timeout: 30_000 })
    await page.getByRole('button', { name: 'Back to reading', exact: true }).click()
    await page.waitForSelector('.px-talk', { state: 'detached', timeout: 15_000 })
  }

  /**
   * Every comment this database holds, read from Node.
   *
   * NOT THROUGH THE PAGE UNDER TEST, because what is being checked is what the server stored, and a
   * read taken inside that browser could be answered by its own memory of what it just wrote.
   */
  const stored = async (body: string): Promise<Record<string, unknown> | null> => {
    const reply = (await (
      await fetch(`${app.api}/api/messages/comments`, { headers: { 'x-mole-office-workspace': 'default' } })
    ).json()) as { comments?: { kind: string; data?: Record<string, unknown> }[] }
    const found = (reply.comments ?? []).find((row) => row.data?.['body'] === body)
    if (found === undefined) return null
    const context = found.kind === 'annotation' ? found.data?.['context'] : found.data?.['target']
    return (context ?? null) as Record<string, unknown> | null
  }

  it('names the part and the level, and not the whole record, when the card was showing a part', async () => {
    await openTheDrawing('pipeline/drawing')
    await focusTheCard(richId)
    await pressUntilRefused(MORE)
    await pressTheTick()
    expect((await theCard(richId)).level, 'the card is not at a level written by part').toBe('digest')
    await commentOn('.gx-card-part', 'this part of the summary is the one I mean')
    const context = await stored('this part of the summary is the one I mean')
    expect(context, 'the comment was not written at all').not.toBeNull()
    const target = context?.['target'] as { kind?: string; recordId?: string; regionId?: string } | undefined
    expect(target?.kind, 'a comment on a part of a record was filed against the whole record').toBe('region')
    expect(target?.recordId).toBe(richId)
    // THE PART'S OWN ID, spelled by `partRegionId` in src/shared/regions.ts — the one function that
    // spells one, and the same one the report page's parts carry.
    expect(target?.regionId, 'the part the card was showing was not named').toBe('data.shortForms.parts[#p-one]')
    const view = context?.['view'] as { detail?: string } | undefined
    expect(view?.detail, 'nothing recorded which level the card was drawn at').toBe('digest')
  }, 600_000)

  it('names the record and the level when the card was showing the record’s own line', async () => {
    await openTheDrawing('pipeline/drawing')
    await focusTheCard(plainId)
    // GROWN TO LEVEL 3 ON PURPOSE. Focus used to add a size step and land the card here by itself;
    // criterion D12 took that away, so the card is dragged up to the level this test is about
    // rather than the test being about whatever focus happened to give it.
    await pressOnTheCard(MORE)
    expect((await theCard(plainId)).level).toBe('gist')
    await commentOn(`[data-target^="record/${plainId}/"]`, 'this whole module is the one I mean')
    const context = await stored('this whole module is the one I mean')
    const target = context?.['target'] as { kind?: string; recordId?: string } | undefined
    expect(target?.kind, 'a comment on a card showing no part is not about the record').toBe('record')
    expect(target?.recordId).toBe(plainId)
    const view = context?.['view'] as { detail?: string } | undefined
    expect(view?.detail, 'nothing recorded which level the card was drawn at').toBe('gist')
  }, 600_000)

  it('records the level the card was actually at, and not the one the drawing is set to', async () => {
    // THE DIFFERENCE IS THE WHOLE POINT OF READING IT OFF THE CARD. The graph-wide control says
    // where every card starts; this card has been moved since, and what a comment on it records is
    // where the card IS.
    await openTheDrawing('pipeline/drawing')
    const opened = await markedStep()
    await focusTheCard(richId)
    await pressUntilRefused(LESS)
    expect((await theCard(richId)).level).toBe('label')
    await commentOn(`[data-target^="record/${richId}/"]`, 'this card at its smallest is the one I mean')
    const context = await stored('this card at its smallest is the one I mean')
    const view = context?.['view'] as { detail?: string } | undefined
    expect(view?.detail, 'the level recorded is not the one the card was drawn at').toBe('label')
    // AND THE GRAPH-WIDE CONTROL IS WHERE THE DRAWING OPENED IT, which is what makes the level above
    // the card's own and not the drawing's.
    expect(await markedStep(), 'the graph-wide control moved, so this proves nothing').toBe(opened)
  }, 600_000)

  it('names the drawing the card was on, and the pipeline whose lanes a step was drawn in', async () => {
    // THE OWNER'S ANCHOR RULE, WHICH WAS QUOTED IN THIS FILE'S OWN HEADER WITH NOTHING ASSERTED ABOUT IT:
    // *A right-click anchor should preserve: exact visible place when possible; current
    // projection; underlying stable Semantic Region; ancestor chain.* A comment on a card stored
    // the record and the level and nothing above them, so a comment written on a step inside a
    // pipeline box read exactly like one written anywhere else about that step.
    await openTheDrawing(`pipeline/${pipelineId}`, 'light', 'lanes')
    const stepId = await aStepOnTheLanes()
    // THE PAGE FINDS NOTHING WRONG WITH THE CARD WHILE THE COMMENT IS FILED. It warns in its console, in
    // a line that begins "Mole Office: ", when an element claims a drawing or a reading length it cannot
    // place, and then stores neither. The two warnings are matched by their own words, so another warning
    // does not count. They are soft, so a build that still warns also shows what it stored.
    const warned: string[] = []
    const listen = (message: ConsoleMessage): void => {
      if (message.type() === 'warning') warned.push(message.text())
    }
    page.on('console', listen)
    let context: Record<string, unknown> | null
    try {
      await commentOn(cardOf(stepId), 'this step inside this pipeline is the one I mean')
      context = await stored('this step inside this pipeline is the one I mean')
    } finally {
      page.off('console', listen)
    }
    const warnedOf = (words: string): string[] => warned.filter((line) => line.startsWith('Mole Office: ') && line.includes(words))
    const asALength = warnedOf('is not a reading length')
    const asADrawing = warnedOf('is not a drawing')
    expect.soft(asALength, `the page read the lanes card as claiming a reading length: ${asALength.join(' / ')}`).toEqual([])
    expect.soft(asADrawing, `the page read the lanes as claiming a drawing it cannot place: ${asADrawing.join(' / ')}`).toEqual([])
    expect(context, 'the comment was not written at all').not.toBeNull()
    const drawnOn = context?.['drawnOn'] as { drawing?: string; pipelineId?: string } | undefined
    expect(drawnOn?.drawing, 'nothing records which drawing the card was on').toBe('pipeline')
    expect(drawnOn?.pipelineId, 'nothing records which pipeline the drawing draws').toBe(pipelineId)
    // NO BOX IS ASKED FOR. The canvas drew the pipeline as a box with its steps inside, and `inside`
    // named that box. The lanes draw a pipeline's steps in one lane that no record heads, with no frame
    // (data-framed="0" and no data-head), so there is no box the step sat in for a comment to name.
    // AND THE TARGET IS STILL THE STEP'S OWN RECORD. The chain is not a second way of saying what
    // the comment is about.
    expect((context?.['target'] as { recordId?: string } | undefined)?.recordId).toBe(stepId)
  }, 600_000)

  it('tells a comment on the module drawing from one written inside a pipeline', async () => {
    // THE PAIR THAT MAKES THE FIELD WORTH STORING. The same record is on two drawings, and without
    // this the two comments are the same row twice.
    await openTheDrawing('pipeline/drawing')
    await commentOn(`[data-target^="record/${plainId}/"]`, 'this module seen among the modules is the one I mean')
    const context = await stored('this module seen among the modules is the one I mean')
    const drawnOn = context?.['drawnOn'] as { drawing?: string; pipelineId?: string; inside?: string } | undefined
    expect(drawnOn?.drawing, 'the module drawing is not named').toBe('modules')
    expect(drawnOn?.pipelineId, 'the module drawing draws no single pipeline, so it may not name one').toBeUndefined()
    expect(drawnOn?.inside, 'a card at the top of the drawing is inside nothing').toBeUndefined()
  }, 600_000)

  it('opens the drawing at that card and that level when the comment is opened from the messages list', async () => {
    // D8's SECOND SENTENCE, which is the half that makes the first half worth anything: *Opening
    // the comment later from the chat or the review column takes the reader to that card at that
    // level.* Every press landed on `#/r/<id>`, the record page: the drawing the comment was
    // written on and the level the card was at were recorded and read by nothing, so the reader
    // had to find the card again and set its level again by hand.
    await openTheDrawing(`pipeline/${pipelineId}`, 'light', 'lanes')
    const stepId = await aStepOnTheLanes()
    // THE LEVEL IS THE DRAWING'S. The lanes draw every card at one rung, the one the drawing fits, and
    // a card has no level control of its own there, so the level is read off the card, not pressed. A
    // lanes card writes its own number on data-card-rung, because data-rung is a reading length. The
    // check is soft, so a card with no number still goes on to the press this case is about.
    const wrote = await page.locator(cardOf(stepId)).getAttribute(CARD_RUNG_ATTRIBUTE)
    expect.soft(wrote, `the step card carries no level on ${CARD_RUNG_ATTRIBUTE}`).not.toBeNull()
    const words = 'open this one and it should take me back to this card'
    await commentOn(cardOf(stepId), words)

    // AWAY FROM THE DRAWING ENTIRELY, so what happens next cannot be the page it was written on
    // still being open.
    await goKeeping(page, `${app.site}/#/messages`)
    await waitForThePage(page, 60_000)
    const row = page.locator('.px-ms-one').filter({ hasText: words }).first()
    await row.waitFor({ timeout: 30_000 })
    await row.locator('.px-ms-about a').first().click()
    // THE ADDRESS IS WAITED FOR, and only for so long, so a comment that opens anywhere else fails here
    // by name rather than at a time-out.
    await expect
      .poll(() => page.url(), { timeout: 30_000, message: 'the comment did not open the drawing it was written on' })
      .toContain(`#/pipeline/${pipelineId}`)
    await waitForThePage(page, 60_000)
    await theDrawingIsDrawn(page)

    const landed = await page.evaluate(
      ({ card, rung }) => {
        const one = document.querySelector(card)
        return {
          level: one?.getAttribute(rung) ?? null,
          focused: one?.getAttribute('aria-pressed') === 'true',
        }
      },
      { card: cardOf(stepId), rung: CARD_RUNG_ATTRIBUTE },
    )
    expect(landed.focused, 'the drawing opened but the card the comment was on is not focused').toBe(true)
    expect(landed.level, 'the card is focused at a different level from the one the comment was written at').toBe(wrote)
  }, 600_000)
})
