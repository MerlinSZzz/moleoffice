// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE COMPOSER'S CHIP IS A LINE OF WORDS, NOT A COLUMN OF LETTERS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED HERE
 * ---------------------------------------------------------------------------------------
 *
 * Right-clicking a part of a report at reading levels 4, 5 and 6 is the act criterion A17 and
 * section 4 act 6 of the acceptance ask for by name. The composer named the right part, said which
 * blocks it stood for, and drew its frame on the right element — and what a person met was the
 * part's heading drawn one letter per line down a column 12 pixels wide and 716 tall, filling the
 * window and pushing everything else out of it. Measured on 3 September 2026 by the fifth
 * verification, at 1440 and at 390, on every by-part level. Problem `SvldVNEE5B-g`.
 *
 * THE CAUSE WAS A RULE THAT ASSUMED A SHORT WORD. The chip is a flex row of two parts: the word
 * saying what kind of thing was pressed, and the thing's own name. The kind used to be one short
 * noun and was told never to wrap. A part of a report says which part it is, of how many, and at
 * which length — about ten words — so the kind kept the whole width, and the name, which is allowed
 * to break between any two letters, was shrunk by flexbox to the width of one letter. The chip could
 * not wrap onto a second line, so there was nowhere else for the name to go.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS A BROWSER, BECAUSE NOTHING ELSE CAN ANSWER THIS
 * ---------------------------------------------------------------------------------------
 *
 * This is a fault of layout and only a layout engine has the answer. Every string the composer draws
 * was correct while the page was unreadable, so a test of the strings passed throughout. Written in
 * the shape of `tests/one-part-of-a-report-is-one-part-at-every-level.test.ts`, which proved the
 * addressing of the same element.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT PROVE THESE ARE NOT DECORATION
 * ---------------------------------------------------------------------------------------
 *
 *   take `flex-wrap: wrap` off `.px-talk-chip` AND put `white-space: nowrap` back on
 *     `.px-talk-chip-kind` → sections 1 and 2 go red, five of the six tests; section 3 stays green,
 *     which is the point of section 3.
 *   either one of those two alone leaves it green, and that is measured rather than assumed: each
 *     is enough on its own to stop the collapse, and they are both kept because they answer two
 *     different lengths of sentence — see the note on the rules themselves.
 *
 * CRITERION CHANGE, 27 SEPTEMBER 2026. A decision replaced the chip with a quote bar drawn like the chat's quote block:
 * the kind on one line and the name under it. The same measurements are read off the bar
 * (`.px-talk-quote`), because the fault they guard, a name squeezed into a column of letters, is a fault of whatever
 * holds the name. The two mutations above were measured against the chip, before that date.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { DETAIL_KEY_EVERYWHERE, detailKeyForHere, type Rung } from '../src/shared/detail.ts'
import type { StoredPart } from '../src/shared/zoom.ts'

/** A report of four blocks in two headed halves. */
const BLOCKS = [
  { id: 'b-1', type: 'heading', text: 'What broke' },
  // LONG ON PURPOSE. `rungsFor` stops a record's ladder at the first length the whole record fits
  // in, and the conclusion's own budget is 60 words, so a report shorter than that has no level 4,
  // 5 or 6 and the write door refuses a summary written by part on it. A fixture this file writes
  // parts to has to be a report with room for them.
  {
    id: 'b-2',
    type: 'finding',
    text: 'Three of four printed mounts cracked at about fifteen newtons.' + ' The jig was reset between pulls and the load cell was zeroed each time, so the numbers are comparable with one another. The fourth mount held to twenty-two newtons and had been printed at half the layer height, which was a mistake in the print queue rather than a decision anybody made, and nobody has repeated it since. One sample is not a finding and the rig is not the question here.',
  },
  { id: 'b-3', type: 'heading', text: 'What is still open' },
  { id: 'b-4', type: 'finding', text: 'Nobody has pulled the aluminium mount yet, because the blanks are not bought.' },
]

/**
 * TWO PARTS WHOSE HEADINGS RUN TO THE FULL TEN WORDS, because a short heading would fit in a
 * one-letter column's worth of luck and prove nothing.
 */
const PARTS: StoredPart[] = [
  {
    id: 'p-broke',
    heading: 'Existing printed mounts fail below the load the trials need',
    text30: 'Three of four printed mounts failed between fourteen and sixteen newtons, under the twenty the handover trials need.',
    text120:
      'Four printed wrist mounts were pulled on the bench jig and three broke at the thin section behind the bolt ' +
      'circle, below the twenty newtons the handover trials need, so the printed part is out of those trials.',
    covers: ['b-1', 'b-2'],
  },
  {
    id: 'p-open',
    heading: 'An aluminium mount is on order and nothing waits',
    text30: 'An aluminium mount of the same geometry has been ordered, and no other handover work is waiting on it.',
    text120:
      'An aluminium mount of the same geometry has been ordered and is expected next week. Nothing else on the ' +
      'handover work is waiting on it, because the trials that need twenty newtons are the last in the sequence.',
    covers: ['b-3', 'b-4'],
  },
]

/**
 * THE ONE WHOLE-RECORD FORM STILL WRITTEN BESIDE A RECORD, and the two the record itself carries.
 *
 * All three went through the short-forms route until 3 September 2026. Criterion A14b made reading
 * length 2 the record's own `title` column and length 3 its own `summary`, and retired both keys,
 * so those two are filed with the record below and the label goes through the route.
 */
const WRITTEN = {
  label: 'Wrist mounts broke',
} as const

const RECORD_TITLE = 'Printed wrist mounts broke below the trial load'
const RECORD_SUMMARY =
  'Three of four printed wrist mounts broke below the load the handover trials need, so only the ' +
  'aluminium one is worth another run and the printed design is not worth its blanks.'

const HUMAN = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

let app: LiveApp
let browser: Page
let reportId: string

beforeAll(async () => {
  app = await liveApp({ name: 'chip-drawing', viewport: { width: 1440, height: 1200 } })
  browser = app.page
  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: HUMAN,
    body: JSON.stringify({ kind: 'report', title: RECORD_TITLE, summary: RECORD_SUMMARY, data: { blocks: BLOCKS } }),
  })
  if (!made.ok) throw new Error(`seeding the report answered ${String(made.status)}: ${await made.text()}`)
  reportId = ((await made.json()) as { record: { id: string } }).record.id

  const ledger = (await (
    await fetch(`${app.api}/api/records/${reportId}/revisions`, { headers: HUMAN })
  ).json()) as { revisions: { seq: number; contentHash: string }[] }
  const newest = [...ledger.revisions].sort((a, b) => b.seq - a.seq)[0]
  if (newest === undefined) throw new Error('the seeded report has no revision to write a short form from')
  const wrote = await fetch(`${app.api}/api/records/${reportId}/short-forms`, {
    method: 'POST',
    headers: HUMAN,
    body: JSON.stringify({
      madeFrom: { seq: newest.seq, contentHash: newest.contentHash },
      forms: { ...WRITTEN, parts: PARTS },
    }),
  })
  if (!wrote.ok) throw new Error(`writing the forms answered ${String(wrote.status)}: ${await wrote.text()}`)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Open the report with one reading length stored as the reader's own choice, and wait for it. */
async function openAt(rung: Rung): Promise<void> {
  await browser.goto(`${app.site}/#/r/${reportId}`, { timeout: 60_000 })
  await waitForThePage(browser, 60_000)
  await browser.evaluate(
    ([everywhere, here, length]) => {
      window.localStorage.setItem(everywhere as string, length as string)
      window.sessionStorage.removeItem(here as string)
    },
    [DETAIL_KEY_EVERYWHERE, detailKeyForHere('reportContent'), rung],
  )
  await browser.reload({ timeout: 60_000 })
  await waitForThePage(browser, 60_000)
  await browser.waitForSelector('.sb-level', { timeout: 30_000 })
}

/** What the chip measures, and what it says. */
interface Chip {
  /** The whole chip: the word in front, the name, and whatever else it carries. */
  whole: { w: number; h: number } | null
  /** The half holding the thing's own name — the one that collapsed. */
  name: { w: number; h: number } | null
  /** How many lines the name is drawn on, counted as line boxes rather than guessed from a height. */
  lines: number
  /** The words in each half, so a failure says what was being drawn. */
  kindSaid: string | null
  nameSaid: string | null
}

/** Close whatever composer is open, so the next press reaches the page. */
async function putTheComposerAway(): Promise<void> {
  if ((await browser.locator('.px-talk').count()) === 0) return
  await browser.keyboard.press('Escape')
  await browser.locator('.px-talk').first().waitFor({ state: 'detached', timeout: 15_000 })
}

/** Right-click the nth drawn part and measure the chip the composer opens with. */
async function chipOfPart(nth: number): Promise<Chip> {
  await putTheComposerAway()
  const where = browser.locator('.sb-part').nth(nth)
  await where.scrollIntoViewIfNeeded()
  await where.click({ button: 'right' })
  await browser.locator('.px-talk').first().waitFor({ timeout: 15_000 })
  await browser.waitForTimeout(1200)
  return browser.evaluate(() => {
    const talk = [...document.querySelectorAll('.px-talk')].find(
      (one) => one.getAttribute('data-target') === 'uiSurface/composer',
    )
    const empty = { whole: null, name: null, lines: 0, kindSaid: null, nameSaid: null }
    if (talk === undefined) return empty
    const name = talk.querySelector('.px-talk-chip-what')
    const whole = name?.closest('.px-talk-quote') ?? null
    const size = (el: Element | null) => {
      if (el === null) return null
      const r = el.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height) }
    }
    // LINE BOXES, COUNTED. A range over the words gives one rectangle per line the browser drew
    // them on, which is the thing being asserted; dividing a height by a line height would be this
    // test working out for itself what the browser already knows.
    let lines = 0
    if (name !== null) {
      const range = document.createRange()
      range.selectNodeContents(name)
      lines = range.getClientRects().length
    }
    return {
      whole: size(whole),
      name: size(name),
      lines,
      kindSaid: (talk.querySelector('.px-talk-chip-kind')?.textContent ?? '').trim() || null,
      nameSaid: (name?.textContent ?? '').trim() || null,
    }
  })
}

// ============================================================ 1. the three by-part levels at 1440

describe('the chip for a part is wider than it is tall, on every level written by part', () => {
  for (const rung of ['sketch', 'digest'] as const) {
    it(`draws the part's heading as words at ${rung}, not as a column of letters`, async () => {
      await openAt(rung)
      const chip = await chipOfPart(0)
      const said = JSON.stringify(chip)
      // THE PHRASE THAT BROKE IT IS THERE. Without this the test could pass on a chip that had lost
      // the sentence altogether, which would be the fault fixed by hiding what was asked for.
      expect(chip.kindSaid, said).toContain('Part 1 of 2')
      expect(chip.nameSaid, said).toContain('Existing printed mounts fail')
      expect(chip.name, said).not.toBeNull()
      expect(chip.name?.w ?? 0, said).toBeGreaterThan(chip.name?.h ?? 0)
      expect(chip.whole?.w ?? 0, said).toBeGreaterThan(chip.whole?.h ?? 0)
      expect(chip.lines, said).toBeGreaterThan(0)
      expect(chip.lines, said).toBeLessThanOrEqual(3)
    }, 120_000)
  }

  it('draws the second part the same way, so this is the chip and not one part of one report', async () => {
    await openAt('digest')
    const chip = await chipOfPart(1)
    const said = JSON.stringify(chip)
    expect(chip.nameSaid, said).toContain('An aluminium mount is on order')
    expect(chip.name?.w ?? 0, said).toBeGreaterThan(chip.name?.h ?? 0)
    expect(chip.lines, said).toBeLessThanOrEqual(3)
  }, 120_000)
})

// ============================================================ 2. and on a narrow screen

describe('the chip holds on a narrow screen, where there is least room for it', () => {
  it('draws the heading on at most three lines at 390 wide', async () => {
    await browser.setViewportSize({ width: 390, height: 900 })
    try {
      await openAt('outline')
      const chip = await chipOfPart(0)
      const said = JSON.stringify(chip)
      expect(chip.nameSaid, said).toContain('Existing printed mounts fail')
      expect(chip.name?.w ?? 0, said).toBeGreaterThan(chip.name?.h ?? 0)
      expect(chip.lines, said).toBeLessThanOrEqual(3)
      // AND THE CHIP STAYS INSIDE THE WINDOW. A sentence that never wraps does not collapse the
      // name; it runs off the side instead, which is the other half of the same fault.
      expect(chip.whole?.w ?? 0, said).toBeLessThanOrEqual(390)
    } finally {
      await browser.setViewportSize({ width: 1440, height: 1200 })
    }
  }, 120_000)
})

// ============================================================ 3. a plain target is unchanged

describe('a target whose word in front is short is drawn as it always was', () => {
  it('keeps the chip for a block of the report to one line at Full', async () => {
    await openAt('full')
    await putTheComposerAway()
    const block = browser.locator('[data-target^="reportBlock/"]').first()
    await block.scrollIntoViewIfNeeded()
    await block.click({ button: 'right' })
    await browser.locator('.px-talk').first().waitFor({ timeout: 15_000 })
    await browser.waitForTimeout(1200)
    const chip = await browser.evaluate(() => {
      const talk = [...document.querySelectorAll('.px-talk')].find(
        (one) => one.getAttribute('data-target') === 'uiSurface/composer',
      )
      const name = talk?.querySelector('.px-talk-chip-what') ?? null
      if (name === null) return null
      const r = name.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(name)
      return { w: Math.round(r.width), h: Math.round(r.height), lines: range.getClientRects().length }
    })
    expect(chip, 'the composer drew no chip at all').not.toBeNull()
    expect(chip?.w ?? 0, JSON.stringify(chip)).toBeGreaterThan(chip?.h ?? 0)
    expect(chip?.lines ?? 0, JSON.stringify(chip)).toBeLessThanOrEqual(2)
  }, 120_000)
})
