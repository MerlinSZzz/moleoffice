// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPORT OFFERS THE POSITIONS IT HAS WORDS FOR, AND A LEVEL NOBODY WROTE IS NOT ONE OF THEM.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE HOLDS NOW, AND WHAT IT HELD BEFORE
 * ---------------------------------------------------------------------------------------
 *
 * The owner's act of 15 September 2026 amended
 * criterion A14a: A LEVEL THAT NOBODY WROTE IS NOT ADVERTISED ON THAT REPORT. The control does not
 * offer the position, and no agent backfills a paraphrase to fill it. The sentence *this level does
 * not exist yet* is drawn only where another rule advertises a level that is empty.
 *
 * UNTIL THAT DAY THIS FILE ASSERTED THE OLDER READING — that the control offered every position a
 * reader reaches and the body said, at each level nobody wrote, *Level n has not been written for
 * this report.* That sentence is still in the product (`WhatStandsAtThisLength`) and is still
 * reachable; what changed is which path reaches it. The old assertion is replaced rather than
 * weakened: the walk below now proves the position is not offered at all.
 *
 * ---------------------------------------------------------------------------------------
 * THE REPORT THIS SEEDS, AND WHY IT IS THE INTERESTING ONE
 * ---------------------------------------------------------------------------------------
 *
 * A title, a summary, a label, and no by-part structure: the shape of a report filed before the
 * ladder existed. Levels 4, 5 and 6 are positions the kind has and nobody has written, so they are
 * exactly the three the act takes off the control. The report is long enough that `rungsFor` keeps
 * the whole ladder, so the only thing that can remove those positions is the act.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT STILL REACHES THE ABSENCE SENTENCE, AND THIS FILE PROVES BOTH
 * ---------------------------------------------------------------------------------------
 *
 *   A LEVEL 3 NOBODY WROTE. Level 3 is the record's own summary (criterion A14b) and is never
 *   narrowed away, so a report with no summary says at the conclusion that it has none. That is the
 *   one place the amended criterion leaves the sentence on the ordinary path.
 *
 *   A STORED CHOICE FROM BEFORE. A reader whose `everywhere` setting still names Level 4 stands on a
 *   position the control does not offer — on this report because nobody wrote it, and since
 *   16 September 2026 because the offer is exactly Conclusion, Level 6 and
 *   Full on ANY report. The control labels Level 4's page at the nearest offered position, the body
 *   says it has not been written, and the buttons still move — which is the second half of the act:
 *   a reader is not trapped on a position that is no longer advertised.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS
 * ---------------------------------------------------------------------------------------
 *
 *   in `readerRungsFor` in src/shared/detail.ts, drop the `why[rung] !== 'notWritten'` clause →
 *   the control offers Level 4 again and *offers only the positions it has words for* goes red.
 *
 *   in the same function, narrow `full` or `gist` as well → *never narrows away the title, the
 *   summary or Full* goes red.
 *
 *   in `stepWithin` in the same file, return null in both directions for a rung that is not in the
 *   list → *still moves a reader off a position the control no longer offers* goes red.
 *
 *   in `WhatStandsAtThisLength` in src/web/components/SummaryBlocks.tsx, return null for a missing
 *   level → the kept-choices-but-unfinished half of the last case goes red, because a Level 4 the
 *   record has no words for would draw nothing at all.
 *
 *   in the `offeredRungs` narrowing in src/web/components/SummaryBlocks.tsx, offer a level nobody
 *   wrote again (drop the intersection with what this report has) → the walk below lands on Level 6
 *   and *the control offered a level nobody wrote* goes red.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import {
  DETAIL_KEY_EVERYWHERE,
  detailKeyForHere,
  levelLabel,
  READER_FLOOR,
  RUNGS,
  type Rung,
} from '../src/shared/detail.ts'
import type { SummaryBlock } from '../src/shared/types.ts'

/** The headers a person's own write carries. */
const HUMAN = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

// A REPORT LONG ENOUGH THAT `rungsFor` KEEPS THE WHOLE LADDER. A record whose own words are already
// as short as one of the reading levels has no levels above that one, since 5 September 2026, so a
// three-line report would have no levels to narrow and this file would prove nothing.
const BLOCKS: SummaryBlock[] = [
  { id: 'b-open', type: 'text', text: 'Three of four printed wrist mounts broke below the load the trials need.' },
  { id: 'b-part', type: 'heading', text: 'What is still open' },
  { id: 'b-work', type: 'text', text: 'Nobody has pulled the aluminium mount, because the blanks are not bought.' },
  {
    id: 'b-long',
    type: 'text',
    text:
      'Four printed clamp mounts were pulled to failure on the bench jig over two afternoons. Three broke at ' +
      'the thin section behind the bolt circle, at 14.2, 15.1 and 15.4 newtons. The transplant trials need ' +
      'twenty newtons and the margin the rig asks for is another five, so the printed part cannot be used for ' +
      'them at all and the print queue for it has been stopped. The fourth sample held to 22 newtons; it had ' +
      'been printed at half the layer height, which was a mistake in the queue rather than a decision anybody ' +
      'made, and nobody has repeated it. One sample is not a finding and it is written down here so that the ' +
      'number is not read as one. An aluminium mount of the same geometry has been ordered.',
  },
]

/** Every run of the report's own writing, so a test can ask whether any of it was drawn. */
const THE_REPORTS_OWN_WORDS = ['Three of four printed wrist mounts broke', 'Nobody has pulled the aluminium mount']

const RECORD_TITLE = 'Wrist mount pull test, round eight'
const RECORD_SUMMARY =
  'Three of four printed mounts failed under the trial load, so only the aluminium one is worth another ' +
  'run and the printed design is not worth the blanks it would cost.'
const WRITTEN = { label: 'Wrist mounts broke' } as const

/** The three positions this report's kind has and nobody wrote. */
const NOBODY_WROTE: Rung[] = ['outline', 'sketch', 'digest']

let app: LiveApp
let browser: Page
/** A report with a title, a summary and a label, and no by-part structure. */
let hole: string
/** A report with a title, a label and no summary. Its level 3 is empty and is never narrowed away. */
let noSummary: string

/** File a report and write its label. */
async function seed(title: string, summary: string | null): Promise<string> {
  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: HUMAN,
    body: JSON.stringify({
      kind: 'report',
      title,
      ...(summary === null ? {} : { summary }),
      data: { blocks: BLOCKS },
    }),
  })
  if (!made.ok) throw new Error(`seeding a report answered ${String(made.status)}: ${await made.text()}`)
  const id = ((await made.json()) as { record: { id: string } }).record.id

  const ledger = (await (
    await fetch(`${app.api}/api/records/${id}/revisions`, { headers: HUMAN })
  ).json()) as { revisions: { seq: number; contentHash: string }[] }
  const newest = [...ledger.revisions].sort((a, b) => b.seq - a.seq)[0]
  if (newest === undefined) throw new Error('the seeded report has no revision to write a short form from')
  const wrote = await fetch(`${app.api}/api/records/${id}/short-forms`, {
    method: 'POST',
    headers: HUMAN,
    body: JSON.stringify({ madeFrom: { seq: newest.seq, contentHash: newest.contentHash }, forms: WRITTEN }),
  })
  if (!wrote.ok) throw new Error(`writing the label answered ${String(wrote.status)}: ${await wrote.text()}`)
  return id
}

beforeAll(async () => {
  app = await liveApp({ name: 'level-says-so', viewport: { width: 1440, height: 1200 } })
  browser = app.page
  hole = await seed(RECORD_TITLE, RECORD_SUMMARY)
  noSummary = await seed('Wrist mount pull test, no conclusion written', null)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Open a report page with one reading length stored as the reader's own choice. */
async function openAt(recordId: string, rung: Rung): Promise<void> {
  await browser.goto(`${app.site}/#/r/${recordId}`, { timeout: 60_000 })
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

/** What both controls read, in the order they are drawn. */
async function labels(): Promise<string[]> {
  return browser.evaluate(() =>
    [...document.querySelectorAll('.sb-level-label')].map((one) => (one.textContent ?? '').trim()),
  )
}

/** Whether each plus / minus button is disabled, in the order they are drawn. */
async function shut(called: 'One level shorter' | 'One level longer'): Promise<boolean[]> {
  const buttons = browser.locator(`.sb-level button[aria-label="${called}"]`)
  const out: boolean[] = []
  for (let at = 0; at < (await buttons.count()); at += 1) out.push(await buttons.nth(at).isDisabled())
  return out
}

/** The report body as a person reads it, plus what it marked about its own level. */
async function readTheBody(): Promise<{ label: string; words: string; marks: string[] }> {
  return browser.evaluate(() => {
    const body = document.querySelector('.sb')
    if (body === null) throw new Error('the page drew no report body')
    return {
      label: (document.querySelector('.sb-level-label')?.textContent ?? '').trim(),
      words: ((body as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim(),
      marks: [...body.querySelectorAll('[data-summary]')].map((one) => one.getAttribute('data-summary') ?? ''),
    }
  })
}

// ============================================================ 1. only the levels with words

describe('the control offers only the positions this report has words for', () => {
  it('offers Conclusion and Full, and not the three levels nobody wrote', async () => {
    await openAt(hole, READER_FLOOR)
    expect(await labels()).toEqual([levelLabel('gist'), levelLabel('gist')])
    expect(await shut('One level shorter'), 'minus is pressable at the conclusion').toEqual([true, true])
    expect(await shut('One level longer'), 'plus is disabled at the conclusion').toEqual([false, false])
    expect(
      (await labels()).map((one) => NOBODY_WROTE.map(levelLabel).includes(one)),
      'the control offered a level nobody wrote',
    ).toEqual([false, false])
  })

  /**
   * PRESSED, NOT SET. The walk is what a reader does, and a control that offered the position and
   * then stepped over it would pass a test that only read the label.
   */
  it('walks Conclusion, then Full, and stops', async () => {
    const seen: string[] = []
    const drawn: string[] = []
    for (let step = 0; step < RUNGS.length; step += 1) {
      const here = await readTheBody()
      seen.push(here.label)
      drawn.push(here.words)
      const longer = browser.locator('.sb-level button[aria-label="One level longer"]').first()
      if (await longer.isDisabled()) break
      await longer.click()
      await browser.waitForTimeout(300)
    }
    expect(seen).toEqual([levelLabel('gist'), levelLabel('full')])
    for (const rung of NOBODY_WROTE) {
      expect(seen, `the walk landed on ${levelLabel(rung)}`).not.toContain(levelLabel(rung))
      expect(
        drawn.join(' '),
        `the walk drew the line for ${levelLabel(rung)}, which is not advertised`,
      ).not.toContain(`${levelLabel(rung)} has not been written for this report.`)
    }
  })
})

// ============================================================ 2. what each offered level draws

describe('an offered level draws the words written for it, and nothing stands in for a level with none', () => {
  it('draws the record’s own summary at Conclusion and the report itself at Full', async () => {
    await openAt(hole, READER_FLOOR)
    let here = await readTheBody()
    expect(here.words, 'the conclusion did not draw the record’s own summary').toContain(RECORD_SUMMARY)
    expect(here.marks, 'the conclusion is not marked as written').toContain('written')
    expect(here.words, 'the label stands in for the conclusion').not.toContain(WRITTEN.label)

    await browser.locator('.sb-level button[aria-label="One level longer"]').first().click()
    await browser.waitForTimeout(300)
    here = await readTheBody()
    for (const said of THE_REPORTS_OWN_WORDS) {
      expect(here.words, `Full did not draw the report’s own writing: ${said}`).toContain(said)
    }
    expect(here.words, 'Full repeated the summary above the report').not.toContain(RECORD_SUMMARY)
    expect(here.marks, 'Full says a level is missing').not.toContain('missing')
  })

  it('never draws a level nobody wrote, anywhere on the offered path', async () => {
    await openAt(hole, READER_FLOOR)
    for (const rung of NOBODY_WROTE) {
      const said = `${levelLabel(rung)} has not been written for this report.`
      const words = (await readTheBody()).words
      expect(words, `the page drew the absence line for ${levelLabel(rung)}`).not.toContain(said)
    }
  })
})

// ============================================================ 3. a level 3 nobody wrote

describe('level 3 is never narrowed away, so a report with no summary says so there', () => {
  it('opens at the conclusion and says the conclusion has not been written', async () => {
    await openAt(noSummary, READER_FLOOR)
    const here = await readTheBody()
    expect(here.label, 'the page did not open at the conclusion').toBe(levelLabel('gist'))
    expect(here.words, 'a report with no summary said nothing about it').toContain(
      `${levelLabel('gist')} has not been written for this report.`,
    )
    expect(here.marks, 'the missing mark is not drawn').toContain('missing')
  })
})

// ============================================================ 4. a stored choice the control no longer offers

describe('a stored choice from before is still readable, and its reader still moves', () => {
  /**
   * KEPT, AND SHOWN AT THE NEAREST OF THE THREE, from 16 September 2026. The
   * control offers exactly Conclusion, Level 6 and Full, so a kept `outline` (Level 4) is shown at
   * the nearest offered position — the conclusion — without the stored choice being touched, and the
   * body drawn at Level 4 still says Level 4 has not been written. A title on the label says the two
   * are different (the tree in one-level-control above asserts that title; this case stays with the
   * body, which is the drawing, and with the press).
   */
  it('stands at the stored level, shown at the nearest offered position, and is not trapped there', async () => {
    // LEVEL 4 NO LONGER EXISTS ON THIS REPORT OR ON THE CONTROL. `everywhere` is the likeliest way a
    // reader lands on a position the control no longer offers: one press on the settings page,
    // inherited by every surface, and it wins over the default exactly as it always did.
    await openAt(hole, 'outline')
    const here = await readTheBody()
    expect(here.label, 'the stored level was not shown at the nearest offered position').toBe(levelLabel('gist'))
    expect(here.words, 'the absent level said nothing').toContain(
      `${levelLabel('outline')} has not been written for this report.`,
    )
    expect(await shut('One level shorter'), 'minus at the position the label reads').toEqual([true, true])
    expect(await shut('One level longer'), 'plus is dead too, which traps the reader').toEqual([false, false])

    // AND THE PRESS MOVES. The offered list on this report is the two the report has words for, so
    // the first plus press steps from Level 4's shown position past the absent levels to Full, and
    // the stored choice is replaced — which is what a press is.
    await browser.locator('.sb-level button[aria-label="One level longer"]').first().click()
    await browser.waitForTimeout(300)
    expect(await labels(), 'the press did not move the reader off the absent level').toEqual([
      levelLabel('full'),
      levelLabel('full'),
    ])
  })
})
