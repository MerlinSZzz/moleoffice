// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SAME PART OF A REPORT, PRESSED AT LEVEL 4 AND AT LEVEL 6, IS ONE THING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED HERE
 * ---------------------------------------------------------------------------------------
 *
 * A heading pressed at a low level maps straight to the same heading, with its paragraph, at a higher
 * one. So a part carries ONE address whatever length it is
 * drawn at, and the composer names it as one thing:
 *
 *   which part it is, of how many, and at which reading length,
 *   and which blocks of the report it stands for, named the way this product names blocks.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS A BROWSER, BECAUSE NOTHING ELSE CAN ANSWER THIS
 * ---------------------------------------------------------------------------------------
 *
 * The press walks UP the DOM from whatever was under the mouse until it finds something that says
 * what it is. A rendered string cannot show that walk, and a unit test of the id builder cannot show
 * that the element on the page carries it. Both halves have failed in this product before, which is
 * why criterion B1 exists at all: the composer named one thing and the frame was drawn round
 * another. This file is written in the shape of
 * `tests/one-level-control-above-and-below-the-report.test.ts`, which proved the same kind of fact
 * about the level control.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT PROVE THESE ARE NOT DECORATION
 * ---------------------------------------------------------------------------------------
 *
 *   put the reading level into `partRegionId` → section 2 goes red: the two presses name two things.
 *   drop the `theRegion(...)` spread from the drawn part → section 1 goes red: the press walks past
 *     the part and lands on the report.
 *   have `whichPartOfTheReport` answer null → section 1 goes red: the chip reads the plain noun.
 *   delete `<WhatAPartStandsFor>` from the composer → section 3 goes red.
 *   make `whatAPartStandsFor` name the blocks by their ids → section 3 goes red.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { openSettingsPanel } from './settings-folds.ts'
import {
  DETAIL_KEY_EVERYWHERE,
  RUNGS,
  detailKeyForHere,
  levelLabel,
  type Rung,
} from '../src/shared/detail.ts'
import { partRegionId } from '../src/shared/regions.ts'
import { targetAttributeValue } from '../src/shared/targets.ts'
import type { StoredPart } from '../src/shared/zoom.ts'
import { READING_LENGTH_ATTRIBUTE } from '../src/web/lib/drawnat.ts'

/** A report with two headed halves, a finding in each, and a chart in the second. */
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
  { id: 'b-4', type: 'finding', text: 'Nobody has pulled the aluminium mount, because the blanks are not bought.' },
]

const PARTS: StoredPart[] = [
  {
    id: 'p-broke',
    heading: 'The printed mount fails below the trial load',
    text30: 'Three of four printed mounts broke between fourteen and sixteen newtons, under the twenty the handover trials need.',
    text120:
      'Four printed wrist mounts were pulled on the bench jig and three broke at the thin section behind the bolt ' +
      'circle, below the twenty newtons the handover trials need, so the printed part is out of those trials.',
    covers: ['b-1', 'b-2'],
  },
  {
    id: 'p-open',
    heading: 'The aluminium mount has not been pulled yet',
    text30: 'Nobody has pulled the aluminium mount, because the blanks have not been bought and nothing else waits on it.',
    text120:
      'Nobody has pulled the aluminium mount yet, because the blanks have not been bought. Nothing else on the ' +
      'handover work is waiting on it, since the trials that need twenty newtons are the last in the sequence.',
    covers: ['b-3', 'b-4'],
  },
]

/**
 * THE WORDS AT EACH OF THE THREE WHOLE-RECORD LENGTHS, AND WHERE EACH OF THEM IS STORED.
 *
 * `label` is a short form, filed through the short-forms route. `title` and `gist` are not forms:
 * since criterion A14b, on 3 September 2026, reading length 2 IS the record's own `title` column and
 * length 3 IS its own `summary`, so both are filed with the record below and the route refuses
 * either key by name. All three are here so that the report this file points at has words at every
 * length the page draws.
 */
const WRITTEN = {
  label: 'Wrist mounts broke',
  title: 'Printed wrist mounts broke below the trial load',
  gist: 'Three of four printed wrist mounts broke below the load the handover trials need, so only the aluminium one is worth another run.',
} as const

/** The headers a person's own write carries. */
const HUMAN = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

let app: LiveApp
let browser: Page
let reportId: string

beforeAll(async () => {
  app = await liveApp({ name: 'part-pointing', viewport: { width: 1440, height: 1200 } })
  browser = app.page
  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: HUMAN,
    // THE TITLE AND THE SUMMARY GO IN WITH THE RECORD, because they ARE lengths 2 and 3. This was
    // filed as *Wrist mount pull test, round eight* with no summary until 3 September 2026, and the
    // words for those two lengths went to the short-forms route below; criterion A14b moved them.
    body: JSON.stringify({
      kind: 'report',
      title: WRITTEN.title,
      summary: WRITTEN.gist,
      data: { blocks: BLOCKS },
    }),
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
      // THE LABEL AND THE PARTS, WHICH IS EVERYTHING THIS ROUTE STILL WRITES. It was sent
      // `{ ...WRITTEN, parts: PARTS }` and answers 400 naming `title` and `gist` now: both keys are
      // retired, and the words for those two lengths are the record's own columns above.
      forms: { label: WRITTEN.label, parts: PARTS },
    }),
  })
  if (!wrote.ok) throw new Error(`writing the forms answered ${String(wrote.status)}: ${await wrote.text()}`)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Open the report with one reading length stored as the reader's own choice, and wait for it. */
async function openAt(rung: Rung) {
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
  // WAIT FOR THE REPORT DRAWN AT THE LENGTH ASKED FOR, NOT FOR ANY LEVEL CONTROL. The drawing writes
  // the length it drew onto its own body (`drawnAtLength`), and its level control and its parts are
  // drawn inside that body in the same render. So this waits for the very drawing every case below
  // reads. The old wait took the first `.sb-level` at any length, which says a report was drawn but
  // not that it was drawn at this length.
  await browser
    .locator(`.sb-reads[${READING_LENGTH_ATTRIBUTE}="${rung}"] > .sb-level`)
    .first()
    .waitFor({ timeout: 30_000 })
}

/** What the composer says about the thing that was pressed, and where the box was drawn. */
interface Said {
  /** The word in front of the chip: what kind of place this is. */
  kind: string | null
  /** What the chip quotes or names. */
  what: string | null
  /** Every stands-for sentence the composer drew. */
  stands: string[]
  /** The rectangle of the frame drawn round the subject, and of the part that was pressed. */
  frame: { x: number; y: number; w: number; h: number } | null
  part: { x: number; y: number; w: number; h: number } | null
}

/**
 * Right-click the nth drawn part and read what the composer says about it.
 *
 * THE COMPOSER IS PUT AWAY FIRST. It is drawn over the page, so a second press with one already
 * open lands on the composer rather than on the part, and Playwright waits thirty seconds to say so.
 */
async function rightClickPart(nth: number): Promise<Said> {
  await putTheComposerAway()
  const where = browser.locator('.sb-part').nth(nth)
  await where.scrollIntoViewIfNeeded()
  await where.click({ button: 'right' })
  await theComposerHasStoppedMoving(nth)
  return browser.evaluate((which) => {
    const talk = [...document.querySelectorAll('.px-talk')].find(
      (one) => one.getAttribute('data-target') === 'uiSurface/composer',
    )
    const box = (el: Element | null | undefined) => {
      if (el === null || el === undefined) return null
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
    }
    const said = { frame: box(document.querySelector('.px-subject-frame')), part: box(document.querySelectorAll('.sb-part')[which as number]) }
    if (talk === undefined) return { kind: null, what: null, stands: [], ...said }
    const read = (sel: string) => {
      const at = talk.querySelector(sel)
      return at === null ? null : (at.textContent ?? '').trim()
    }
    return {
      kind: read('.px-talk-chip-kind'),
      what: read('.px-talk-chip-what'),
      stands: [...talk.querySelectorAll('.px-talk-stands .px-talk-said')].map((one) => (one.textContent ?? '').trim()),
      ...said
    }
  }, nth)
}

/** Which press this is, so each wait below keeps its own count of still frames. */
let pressCount = 0

/**
 * WAIT UNTIL THE COMPOSER, ITS FRAME AND THE PRESSED PART ARE DRAWN AND HAVE STOPPED MOVING.
 *
 * This replaces a fixed wait of 1200 ms, which guessed how long the page takes to draw what a press
 * draws. The composer and the frame round the part are drawn by different layers, and the page may
 * scroll after a press, so a read taken too early can find one of them missing or still moving.
 * This waits for exactly what `rightClickPart` reads: the composer's chip and words, the frame and
 * the part, all present and each in the same place for three animation frames in a row. It never
 * compares the frame with the part, because that comparison is what the cases assert.
 */
async function theComposerHasStoppedMoving(nth: number): Promise<void> {
  await browser.waitForFunction(
    ([which, press]) => {
      // ONE RECORD PER PRESS, so a press never counts frames left over from the press before it.
      const all = window as unknown as { __partPress?: Record<string, { last?: string; still: number }> }
      all.__partPress ??= {}
      const holder = (all.__partPress[press as string] ??= { still: 0 })
      const talk = [...document.querySelectorAll('.px-talk')].find(
        (one) => one.getAttribute('data-target') === 'uiSurface/composer',
      )
      const chip = talk?.querySelector('.px-talk-chip-kind') ?? null
      const frame = document.querySelector('.px-subject-frame')
      const part = document.querySelectorAll('.sb-part')[which as number]
      if (chip === null || frame === null || part === undefined) {
        holder.last = undefined
        holder.still = 0
        return false
      }
      const rect = (el: Element) => {
        const r = el.getBoundingClientRect()
        return [r.left, r.top, r.width, r.height].map(Math.round).join(',')
      }
      const now = [chip.textContent ?? '', rect(frame), rect(part), talk?.textContent ?? ''].join('|')
      holder.still = now === holder.last ? holder.still + 1 : 0
      holder.last = now
      return holder.still >= 3
    },
    [nth, `press-${String(pressCount++)}`] as const,
    { polling: 'raf', timeout: 15_000 },
  )
}

/** Close whatever composer is open, so the next press reaches the page. */
async function putTheComposerAway(): Promise<void> {
  if ((await browser.locator('.px-talk').count()) === 0) return
  await browser.keyboard.press('Escape')
  await browser.locator('.px-talk').first().waitFor({ state: 'detached', timeout: 15_000 })
}

/** The addresses of the parts the page has drawn, in the order it drew them. */
function partTargets(): Promise<(string | null)[]> {
  return browser.evaluate(() =>
    [...document.querySelectorAll('.sb-part')].map((one) => one.getAttribute('data-target')),
  )
}

// ============================================================ 1. the page draws the parts, addressably

describe('at levels 4, 5 and 6 the page draws one addressable element per part', () => {
  it('draws two parts at each of the three lengths, and none at Conclusion or Full', async () => {
    for (const rung of ['outline', 'sketch', 'digest'] as const) {
      await openAt(rung)
      expect(await browser.locator('.sb-part').count(), rung).toBe(2)
    }
    for (const rung of ['gist', 'full'] as const) {
      await openAt(rung)
      expect(await browser.locator('.sb-part').count(), rung).toBe(0)
    }
  }, 120_000)

  it('gives each drawn part the address built from its own stored id', async () => {
    await openAt('outline')
    // BUILT BY THE DECLARATION'S OWN WRITER. A hand-built string here would be a second spelling of
    // an address, which is the defect this whole file is about — and it would have been wrong: the
    // ids inside an address are percent-encoded, so `[#p-broke]` is written `%5B%23p-broke%5D`.
    expect(await partTargets()).toEqual(
      PARTS.map((one) =>
        targetAttributeValue({ kind: 'region', recordId: reportId, regionId: partRegionId(one.id) }),
      ),
    )
  }, 60_000)

  it('names the part in the composer: which one, of how many, and at which length', async () => {
    await openAt('outline')
    const said = await rightClickPart(0)
    expect(said.kind, JSON.stringify(said)).toContain('Part 1 of 2')
    expect(said.kind).toContain('outline')
    expect(said.what, 'the chip quotes the part’s own heading').toContain('The printed mount fails')
  }, 60_000)

  it('draws the frame round the part that was pressed, and not round something else', async () => {
    // CLICK = TARGET = BOX, criterion B1, asked of a part. The frame the mark layer draws sits over
    // the element, so its rectangle is the part's rectangle give or take the frame's own width.
    await openAt('digest')
    const said = await rightClickPart(1)
    expect(said.frame, JSON.stringify(said)).not.toBeNull()
    expect(said.part).not.toBeNull()
    expect(Math.abs((said.frame?.y ?? 0) - (said.part?.y ?? 0)), 'the top edge').toBeLessThanOrEqual(6)
    expect(Math.abs((said.frame?.h ?? 0) - (said.part?.h ?? 0)), 'the height').toBeLessThanOrEqual(12)
  }, 60_000)
})

// ============================================================ 2. one part, two levels, one address

describe('the same part pressed at level 4 and at level 6', () => {
  it('carries one address at both levels, and the address holds no reading level', async () => {
    await openAt('outline')
    const atFour = await partTargets()
    await openAt('digest')
    const atSix = await partTargets()
    expect(atSix).toEqual(atFour)
    expect(atFour[1]).toBe(
      targetAttributeValue({ kind: 'region', recordId: reportId, regionId: partRegionId('p-open') }),
    )
    // AND THE ADDRESS SAYS NOTHING ABOUT THE LENGTH. A comment left on this part at level 4 has to
    // read as being about the same thing at level 6.
    for (const rung of RUNGS) expect(atFour.join(' '), rung).not.toContain(rung)
  }, 90_000)

  it('is named by the same heading both times, and by the length it was pressed at', async () => {
    await openAt('outline')
    const atFour = await rightClickPart(1)
    await openAt('digest')
    const atSix = await rightClickPart(1)
    expect(atFour.what, JSON.stringify([atFour, atSix])).toBe(atSix.what)
    expect(atFour.kind).toContain('outline')
    expect(atSix.kind).toContain('digest')
    expect(atFour.kind).toContain('Part 2 of 2')
    expect(atSix.kind).toContain('Part 2 of 2')
  }, 90_000)

  it('says it stands for the same blocks at both levels', async () => {
    await openAt('outline')
    const atFour = await rightClickPart(0)
    await openAt('digest')
    const atSix = await rightClickPart(0)
    expect(atFour.stands.join(' ')).toBe(atSix.stands.join(' '))
  }, 90_000)
})

// ============================================================ 3. what a part stands for

describe('the composer says which blocks a part stands for', () => {
  it('names them, and names them the way this product names a block', async () => {
    await openAt('digest')
    const said = await rightClickPart(0)
    const sentence = said.stands.join(' ')
    expect(sentence, JSON.stringify(said)).toContain('Stands for')
    expect(sentence, 'the heading it covers').toContain('What broke')
    expect(sentence, 'the finding it covers').toContain('finding')
  }, 60_000)

  it('says something different about the second part, which covers different blocks', async () => {
    // THE REPORT HAS TWO HEADINGS AND TWO FINDINGS. A sentence naming the blocks by their kind
    // alone would be the same five words for both parts, which names neither — the reason this
    // names them the way a comment's own sentence names a part rather than by the role word.
    await openAt('digest')
    const first = await rightClickPart(0)
    const second = await rightClickPart(1)
    expect(second.stands.join(' '), JSON.stringify([first, second])).not.toBe(first.stands.join(' '))
    expect(second.stands.join(' ')).toContain('What is still open')
  }, 90_000)
})

// ============================================================ 4. the settings page names the same seven

describe('the settings page lists the seven reading levels', () => {
  it('draws one column per position, with the label the report’s own control uses', async () => {
    // PUT AWAY THE COMPOSER THE LAST CASE OF SECTION 3 LEFT OPEN, AND WAIT UNTIL IT IS GONE. Going
    // to Settings changes only the part of the address after the `#`, so the page is not reloaded
    // and the composer stays drawn over the Settings page. Measured on 3 October 2026 at 1440 by
    // 1200: the composer's box started at x 844, y 631, and the panel's press was centred at x 844,
    // y 624. Playwright clicks the centre of the press, so that click missed the composer by 7
    // pixels. When the composer lands a little higher or further left, it takes the click, and
    // Playwright retries for its 30 seconds and fails. Once it is put away, nothing is drawn over
    // the press.
    await putTheComposerAway()
    await browser.goto(`${app.site}/#/settings`, { timeout: 60_000 })
    await waitForThePage(browser, 60_000)
    // Every Settings panel is folded to its title; the grid is in this one.
    await openSettingsPanel(browser, 'settings.detail')
    await browser.waitForSelector('.dsay-col', { timeout: 30_000 })
    const columns = await browser.evaluate(() =>
      [...document.querySelectorAll('.dsay-col')].map((one) => (one.textContent ?? '').trim()),
    )
    expect(columns).toHaveLength(RUNGS.length)
    expect(RUNGS.length).toBe(7)
  }, 60_000)

  it('offers every one of the seven as a choice a reader can set', async () => {
    const names = await browser.evaluate(() =>
      [...document.querySelectorAll('[data-detail-rung]')].map((one) => one.getAttribute('data-detail-rung')),
    )
    for (const rung of RUNGS) expect(new Set(names), rung).toContain(rung)
    // AND THE THREE RETIRED LENGTHS ARE NOT AMONG THEM. A settings page still offering `card` would
    // be offering a reading length nothing draws.
    for (const gone of ['card', 'brief', 'account']) expect(new Set(names), gone).not.toContain(gone)
  }, 60_000)

  it('names Conclusion and Full in words and the rest by number, which is the owner\'s rule', () => {
    expect(RUNGS.map(levelLabel)).toEqual([
      'Level 1',
      'Level 2',
      'Conclusion',
      'Level 4',
      'Level 5',
      'Level 6',
      'Full',
    ])
  })
})
