// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A READER GOES NO LOWER THAN THE CONCLUSION, AND LEVELS 1 AND 2 ARE STILL WRITTEN AND SERVED.
 *
 * ---------------------------------------------------------------------------------------
 * WHOSE RULE THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * The rule says:
 *
 *   Levels 1 and 2 could be read only for debugging. Once that is over, a reader of a report goes no
 *   lower than the conclusion (level 3), and the page needs to explain nothing about it.
 *
 * Levels 1 and 2 were reachable on a report page while the ladder was being checked. That checking
 * is over, so the control runs Full, Level 6, Level 5, Level 4, Conclusion and stops. Nothing on the
 * page says so, and nothing needs to. Criterion A19 of `design/pointing-reopened/ACCEPTANCE.md`.
 *
 * ---------------------------------------------------------------------------------------
 * THE HALF THAT IS EASY TO BREAK IS THE OTHER HALF
 * ---------------------------------------------------------------------------------------
 *
 * A19 removes two positions from ONE control and ONE settings choice, ON A REPORT. It removes
 * nothing from the ladder, and nothing from any other kind of record. The limit is for reports only,
 * because only a report has this level-by-level control, and nothing else should be limited. A module's
 * curated summary is drawn by the same component, through the same surface, and keeps all seven —
 * which is `tests/the-reader-floor-is-for-reports-only.test.ts`, beside this file.
 *
 * The label is still written, still stored under `data.shortForms`, still served by
 * `GET /api/records/:id/short-forms`, still drawn in lists, cards and the graph, and still counted
 * on the settings grid. The obvious way to satisfy the first half — take the two rungs off `RUNGS`
 * — would satisfy it by deleting the second, so half of this file is about what did NOT change.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT PROVE THESE ARE NOT DECORATION
 * ---------------------------------------------------------------------------------------
 *
 *   point `LevelControl` in src/web/components/SummaryBlocks.tsx back at `stepFrom` → section 2
 *     goes red: minus walks off Conclusion down to Level 1.
 *   make `rungFor` in src/shared/detail.ts return `chosen.value` unraised → section 3 goes red: a
 *     stored Level 1 puts the label on the report page.
 *   make `notAReadingChoice` in src/web/components/DetailSays.tsx answer false → section 4 goes red:
 *     the Report content row offers all seven again.
 *   set `READER_FLOOR` to `label` → sections 2, 3 and 4 go red together, which is the one constant
 *     the three of them read.
 *   make `readerFloorApplies` in src/shared/detail.ts ignore the kind → this file stays green and
 *     `tests/the-reader-floor-is-for-reports-only.test.ts` goes red, because what breaks then is a
 *     module being floored and nothing about a report changes.
 *   take `label` and `title` off `SHORT_FORM_LEVELS` in src/shared/zoom.ts → sections 5 and 6 go
 *     red, which is the half of A19 that is about what stayed.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { openSettingsPanel } from './settings-folds.ts'
import {
  asReaderRung,
  DETAIL_DEFAULTS,
  DETAIL_KEY_EVERYWHERE,
  DETAIL_SURFACES,
  detailKeyForHere,
  detailKeyForSurface,
  FLOORED_KIND,
  isReaderRung,
  levelLabel,
  nearestOffered,
  OFFERED_TO_A_READER,
  READER_FLOOR,
  READER_RUNGS,
  readerStepFrom,
  rungFor,
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

/** The two positions a reader no longer reaches on a report page. */
const BELOW_THE_FLOOR = ['label', 'title'] as const

const REPORT_TITLE = 'Printed wrist mounts broke below the trial load'
const REPORT_SUMMARY =
  'Three of four printed wrist mounts broke below the load the handover trials need, so only the ' +
  'aluminium one is worth another run and the printed design is not worth its blanks.'
/** The label, which is level 1: written, stored, served, and drawn in a list. */
const REPORT_LABEL = 'Wrist mounts broke'

const ROW_TITLE = 'The wrist camera calibration check is owed to the trials team'
const ROW_SUMMARY = 'Nobody has measured the wrist camera after a full shift.'
/** A list row draws this at level 1, and a list row is not a report page. */
const ROW_LABEL = 'Wrist camera drift'

// A REPORT LONG ENOUGH TO HAVE EVERY POSITION ON THE LADDER. A record whose own words are already as
// short as one of the reading levels has no levels above that one, since 5 September 2026, so three
// short lines would give the control two positions and this file would be about the length rule
// rather than about how low a reader goes.
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

let app: LiveApp
let browser: Page
let reportId: string
/** The record section 6 reads in a Home list row. */
let rowRecordId: string

/** File a record and hand back its id. */
async function file(body: unknown): Promise<string> {
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers: HUMAN, body: JSON.stringify(body) })
  if (!made.ok) throw new Error(`filing a record answered ${String(made.status)}: ${await made.text()}`)
  return ((await made.json()) as { record: { id: string } }).record.id
}

/** Write the label — the one whole-record form still written beside a record — on this record. */
async function writeTheLabel(recordId: string, text: string): Promise<void> {
  const ledger = (await (
    await fetch(`${app.api}/api/records/${recordId}/revisions`, { headers: HUMAN })
  ).json()) as { revisions: { seq: number; contentHash: string }[] }
  const newest = [...ledger.revisions].sort((a, b) => b.seq - a.seq)[0]
  if (newest === undefined) throw new Error('the seeded record has no revision to write a short form from')
  const wrote = await fetch(`${app.api}/api/records/${recordId}/short-forms`, {
    method: 'POST',
    headers: HUMAN,
    body: JSON.stringify({ madeFrom: { seq: newest.seq, contentHash: newest.contentHash }, forms: { label: text } }),
  })
  if (!wrote.ok) throw new Error(`writing the label answered ${String(wrote.status)}: ${await wrote.text()}`)
}

/**
 * THE REPORT'S PARTS, WHICH ARE LEVELS 4, 5 AND 6.
 *
 * THE OWNER'S ACT OF 15 SEPTEMBER 2026 (criterion A14a as amended) takes a level nobody wrote off the
 * reader's control, so a report with no parts offers only Conclusion and Full. This file's claim is
 * about how LOW a reader goes, not about which levels exist, so the fixture writes its parts and the
 * report keeps the five positions the floor is measured against. Every block of the report is
 * covered exactly once, which is what the write door asks.
 */
const REPORT_PARTS = [
  {
    id: 'r-p1',
    heading: 'What the pull test showed',
    text30: 'Three of four printed mounts broke below the load the trials need.',
    text120:
      'Three of four printed clamp mounts broke at the thin section behind the bolt circle, below the load the transplant trials need, so the printed part cannot be used.',
    covers: ['b-open', 'b-part'],
  },
  {
    id: 'r-p2',
    heading: 'The aluminium mount is next',
    text30: 'Nobody has pulled it yet; the blanks are not bought.',
    text120: 'Nobody has pulled the aluminium mount because the blanks are not bought, and it is the only candidate left.',
    covers: ['b-work', 'b-long'],
  },
]

/** Write the parts through the one route that takes them. */
async function writeTheParts(recordId: string): Promise<void> {
  const ledger = (await (
    await fetch(`${app.api}/api/records/${recordId}/revisions`, { headers: HUMAN })
  ).json()) as { revisions: { seq: number; contentHash: string }[] }
  const newest = [...ledger.revisions].sort((a, b) => b.seq - a.seq)[0]
  if (newest === undefined) throw new Error('the seeded record has no revision to write parts from')
  const wrote = await fetch(`${app.api}/api/records/${recordId}/short-forms`, {
    method: 'POST',
    headers: HUMAN,
    body: JSON.stringify({ madeFrom: { seq: newest.seq, contentHash: newest.contentHash }, forms: { parts: REPORT_PARTS } }),
  })
  if (!wrote.ok) throw new Error(`writing the parts answered ${String(wrote.status)}: ${await wrote.text()}`)
}

beforeAll(async () => {
  app = await liveApp({ name: 'reader-floor', viewport: { width: 1440, height: 1200 } })
  browser = app.page

  // A PROMISE PAST ITS DATE, so Home's Late or stuck draws it as a list row. That is the Home list
  // that draws a record at the length the home setting asks for, since the approved Home took off
  // the ranked list, where an active module used to be drawn.
  rowRecordId = await file({
    kind: 'obligation',
    title: ROW_TITLE,
    summary: ROW_SUMMARY,
    data: { due: '2020-03-01', owedTo: 'the trials team', state: 'open' },
  })
  await writeTheLabel(rowRecordId, ROW_LABEL)
  reportId = await file({
    kind: 'report',
    // THE TITLE IS READING LENGTH 2 AND THE SUMMARY IS LENGTH 3, criterion A14b, so both are filed
    // with the record and neither goes through the short-forms route.
    title: REPORT_TITLE,
    summary: REPORT_SUMMARY,
    data: { blocks: BLOCKS },
  })
  await writeTheLabel(reportId, REPORT_LABEL)
  // AND ITS PARTS, so the report keeps levels 4, 5 and 6 as positions a reader can stand on. See
  // `REPORT_PARTS`: without them the act of 15 September 2026 leaves this report two positions and
  // the walk below would be about the narrowing rather than about the floor.
  await writeTheParts(reportId)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Open the report page with one reading length stored as the reader's own choice. */
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

/** What both controls read, and whether each one's minus is disabled. */
async function bothControls(): Promise<{ said: string[]; minusOff: boolean[] }> {
  const said = await browser.evaluate(() =>
    [...document.querySelectorAll('.sb-level-label')].map((one) => (one.textContent ?? '').trim()),
  )
  const minus = browser.locator('.sb-level button[aria-label="One level shorter"]')
  const minusOff: boolean[] = []
  for (let at = 0; at < (await minus.count()); at += 1) minusOff.push(await minus.nth(at).isDisabled())
  return { said, minusOff }
}

// ============================================================ 1. the ladder and the reader's walk

describe('the ladder keeps seven positions and a reader walks five of them', () => {
  it('offers a reader five positions, ending at the conclusion', () => {
    expect([...READER_RUNGS]).toEqual(['gist', 'outline', 'sketch', 'digest', 'full'])
    expect(READER_RUNGS.map(levelLabel)).toEqual(['Conclusion', 'Level 4', 'Level 5', 'Level 6', 'Full'])
    expect(READER_FLOOR, 'the floor is not the conclusion').toBe('gist')
  })

  it('answers null for a step below the conclusion, which is what disables the button', () => {
    expect(readerStepFrom('gist', -1)).toBeNull()
    expect(readerStepFrom('full', 1), 'there is a position above Full').toBeNull()
    for (const rung of READER_RUNGS) {
      const shorter = readerStepFrom(rung, -1)
      if (shorter !== null) expect(readerStepFrom(shorter, 1), `${rung} does not come back`).toBe(rung)
    }
  })

  /**
   * THE CONTROL OFFERS EXACTLY THREE POSITIONS AND NO OTHER. The choices a report gives a
   * reader are cut to three, conclusion, level 6 and full.
   * Every other rung stays in `RUNGS`, storable and reachable through the API and for agents; this
   * list is only what the report's control offers a reader, and a reader's minus is disabled at the
   * shortest of them.
   */
  it('offers a report’s control exactly Conclusion, Level 6 and Full, and nothing else', () => {
    expect([...OFFERED_TO_A_READER]).toEqual(['gist', 'digest', 'full'])
    expect(OFFERED_TO_A_READER.map(levelLabel)).toEqual(['Conclusion', 'Level 6', 'Full'])
    expect(OFFERED_TO_A_READER.map(levelLabel)).toEqual(
      RUNGS.filter((one) => OFFERED_TO_A_READER.includes(one)).map(levelLabel),
    )
    expect(OFFERED_TO_A_READER.some((one) => !RUNGS.includes(one)), 'a offered rung is not on the ladder').toBe(false)
  })

  it('reads a position below the floor as the conclusion, and leaves the other five alone', () => {
    for (const rung of BELOW_THE_FLOOR) {
      expect(isReaderRung(rung), `${rung} is offered to a reader`).toBe(false)
      expect(asReaderRung(rung), `${rung} does not read as the conclusion`).toBe(READER_FLOOR)
    }
    for (const rung of READER_RUNGS) expect(asReaderRung(rung), `${rung} was moved`).toBe(rung)
  })

  /**
   * WHAT THIS ASSERTED UNTIL 3 SEPTEMBER 2026: that a stored choice below the floor was raised on
   * the `reportContent` surface, whatever was being drawn on it. No kind was asked for, so a
   * module's curated summary — the other body drawn through that surface — was raised too. The owner's
   * ruling that day took every kind but the report out of the rule, so the assertion now names the
   * kind and a module is asserted to keep its stored choice.
   */
  it('raises a stored choice for a report, and for no other kind and no other surface', () => {
    expect(rungFor('reportContent', FLOORED_KIND, undefined, { everywhere: 'label' }).rung).toBe(READER_FLOOR)
    expect(rungFor('reportContent', FLOORED_KIND, undefined, { here: 'title' }).rung).toBe(READER_FLOOR)
    // THE REASON IS STILL THE ONE THAT ANSWERED. Raising the position does not make Mole Office's
    // own default the thing that decided it, and the settings panel draws that reason.
    expect(rungFor('reportContent', FLOORED_KIND, undefined, { here: 'title' }).decider).toBe('here')
    // THE SAME SURFACE, DRAWING A MODULE'S CURATED SUMMARY, IS NOT RAISED. The limit is for reports only.
    expect(rungFor('reportContent', 'module', undefined, { everywhere: 'label' }).rung).toBe('label')
    expect(rungFor('reportContent', null, undefined, { everywhere: 'label' }).rung).toBe('label')
    for (const surface of DETAIL_SURFACES) {
      if (surface === 'reportContent') continue
      expect(rungFor(surface, FLOORED_KIND, undefined, { everywhere: 'label' }).rung, surface).toBe('label')
    }
  })

  /**
   * THE OPENING POSITION MOVED TWICE. First, act 3a made a record page open at reading level 2 — the
   * authored summary line — and the floor raised a report's level 2 to the conclusion.
   * Then a later ruling put a report's opening back at Full, because a reader kept
   * having to switch to Full by hand. A reader who wants the shorter
   * form lowers the level themselves. So a report with no reader setting opens at Full again, and a
   * module opens at its own level-2 line, its page showing as it always did.
   */
  it('opens a report at full and a module at its own level 2', () => {
    expect(DETAIL_DEFAULTS.reportContent, 'the surface default moved off level 2').toBe('title')
    expect(rungFor('reportContent', FLOORED_KIND).rung, 'a report with no setting does not open at Full').toBe('full')
    expect(rungFor('reportContent', 'module').rung, 'a module no longer opens at its own line').toBe('title')
  })
})

// ============================================================ 1b. what a page opens at

/**
 * THE OPENING POSITION, ON A REAL PAGE, WITH NOBODY'S CHOICE STORED.
 *
 * THE OWNER'S ACT OF 16 SEPTEMBER 2026: a report opens at Full again. The resolver
 * cases above say what `rungFor` answers; this proves the page a reader meets. It is the page and
 * not the resolver because the stored choice, the surface default and the report floor meet in three
 * different places, and a break in any one of them leaves the resolver correct and the page wrong.
 */
describe('a record page opens at its summary when nobody has chosen', () => {
  /** Clear every stored choice, open the record, and read both controls. */
  async function opensWithNoChoice(recordId: string): Promise<string[]> {
    await browser.goto(`${app.site}/#/`, { timeout: 60_000 })
    await waitForThePage(browser, 60_000)
    await browser.evaluate(
      ([everywhere, surface]) => {
        window.localStorage.removeItem(everywhere as string)
        window.localStorage.removeItem(surface as string)
      },
      [DETAIL_KEY_EVERYWHERE, detailKeyForSurface('reportContent')],
    )
    await browser.goto(`${app.site}/#/r/${recordId}`, { timeout: 60_000 })
    await waitForThePage(browser, 60_000)
    await browser.waitForSelector('.sb-level', { timeout: 30_000 })
    const { said } = await bothControls()
    return said
  }

  /**
   * A REPORT WITH NO READER SETTING OPENS AT FULL, by a decision.
   * The surface default is still level 2; `rungFor` answers for the kind, and this is the test that says a report with
   * nothing stored lands on the whole report.
   */
  it('opens a report at full when nobody has set anything', async () => {
    expect(await opensWithNoChoice(reportId)).toEqual([levelLabel('full'), levelLabel('full')])
  }, 120_000)

  it('still lets a stored choice win over the default, and the choice is kept', async () => {
    await openAt('gist')
    const { said } = await bothControls()
    expect(said, 'a stored choice lost to the new default').toEqual([levelLabel('gist'), levelLabel('gist')])
  }, 120_000)
})

// ============================================================ 2. pressing minus stops at Conclusion

/**
 * THE WIRING, WHICH NO RENDER CAN SHOW. A control that draws the right label and steps somewhere
 * else is exactly the defect this project keeps finding, and it passes every rendering test.
 */
describe('pressing minus from Full stops at Conclusion through the three offered positions', () => {
  /**
   * THE OFFER IS EXACTLY THREE since 16 September 2026: Full, Level 6,
   * Conclusion. The walk names every position the control reaches, with one more press than there
   * are positions, so a control that walks past the shortest offered position is caught here rather
   * than by the label reading something unexpected at the end.
   */
  it('walks Full, Level 6, Conclusion and then will not move', async () => {
    await openAt('full')
    const walked: string[] = []
    // ONE MORE PRESS THAN THERE ARE POSITIONS, so a control that walks past the floor is caught
    // here rather than by the label reading something unexpected at the end.
    for (let step = 0; step < RUNGS.length + 1; step += 1) {
      const { said, minusOff } = await bothControls()
      expect(said, 'the two controls disagree about the level').toEqual([said[0], said[0]])
      expect(new Set(minusOff).size, 'one control disabled minus and the other did not').toBe(1)
      walked.push(said[0] ?? '')
      if (minusOff[0] === true) break
      await browser.locator('.sb-level button[aria-label="One level shorter"]').first().click()
      await browser.waitForTimeout(250)
    }
    expect(walked).toEqual(['Full', 'Level 6', 'Conclusion'])
  }, 240_000)

  it('leaves minus disabled on both controls at Conclusion, and plus working', async () => {
    await openAt('gist')
    const { said, minusOff } = await bothControls()
    expect(said).toEqual(['Conclusion', 'Conclusion'])
    expect(minusOff, 'minus is pressable at the conclusion').toEqual([true, true])
    const plus = browser.locator('.sb-level button[aria-label="One level longer"]')
    expect(await plus.first().isDisabled(), 'plus is disabled at the conclusion').toBe(false)
  }, 120_000)
})

// ============================================================ 3. a stored choice below the floor

describe('a choice of Level 1 or Level 2 stored before this rule reads as Conclusion', () => {
  for (const rung of BELOW_THE_FLOOR) {
    it(`draws Conclusion, not ${levelLabel(rung)}, when ${levelLabel(rung)} is the stored choice`, async () => {
      await openAt(rung)
      const { said, minusOff } = await bothControls()
      expect(said, `the control stood at ${levelLabel(rung)}`).toEqual(['Conclusion', 'Conclusion'])
      expect(minusOff, 'minus is pressable below the conclusion').toEqual([true, true])
      const body = await browser.evaluate(() => {
        const drawn = document.querySelector('.sb')
        if (drawn === null) throw new Error('the page drew no report body')
        return ((drawn as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim()
      })
      expect(body, 'the summary is not what the body drew').toContain(REPORT_SUMMARY)
      expect(body, 'the label reached a reader').not.toContain(REPORT_LABEL)
    }, 120_000)
  }

  /**
   * A CHOICE SET FOR EVERYTHING REACHES THIS SURFACE TOO, and it is the likelier of the two ways a
   * reader lands below the floor: the Everywhere row is one press, and lists are what levels 1 and
   * 2 are for. `openAt` writes exactly that key.
   */
  it('says nothing on the page about why it stopped there', async () => {
    await openAt('label')
    const page = await browser.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
    for (const said of ['no lower', 'not a reading choice', 'Level 1 is not', 'debug']) {
      expect(page.toLowerCase(), `the page explained itself: ${said}`).not.toContain(said.toLowerCase())
    }
  }, 120_000)
})

// ============================================================ 4. the settings page's own choice

describe('the settings page offers report content exactly the five', () => {
  /** Every cell of one row of the grid, in column order, with whether it can be pressed. */
  async function row(name: string): Promise<{ rung: string; off: boolean; called: string }[]> {
    await browser.goto(`${app.site}/#/settings`, { timeout: 60_000 })
    await waitForThePage(browser, 60_000)
    await openSettingsPanel(browser, 'settings.detail')
    await browser.waitForSelector('.dsay-grid', { timeout: 30_000 })
    return browser.evaluate(
      (which) =>
        [...document.querySelectorAll(`[data-detail-row="${which as string}"]`)].map((one) => ({
          rung: one.getAttribute('data-detail-rung') ?? '',
          off: (one as HTMLButtonElement).disabled,
          called: one.getAttribute('aria-label') ?? '',
        })),
      name,
    )
  }

  it('draws all seven columns and lets a person press only the five', async () => {
    const cells = await row('reportContent')
    expect(cells.map((one) => one.rung), 'a column left the grid').toEqual([...RUNGS])
    expect(
      cells.filter((one) => !one.off).map((one) => one.rung),
      'the choices offered for report content',
    ).toEqual([...READER_RUNGS])
  }, 120_000)

  it('says what the two shut cells are, in the grid’s own words', async () => {
    const cells = await row('reportContent')
    for (const rung of BELOW_THE_FLOOR) {
      const cell = cells.find((one) => one.rung === rung)
      expect(cell?.off, `${rung} can still be pressed`).toBe(true)
      expect(cell?.called, `${rung} is not named as anything unusual`).toContain('not a reading choice')
    }
    const mark = await browser.evaluate(() => {
      const name = document.querySelector('[aria-label="Report content"] .dsay-rowname')
      return ((name as HTMLElement | null)?.innerText ?? '').replace(/\s+/g, ' ').trim()
    })
    expect(mark, 'the row does not say which cells it will not take').toContain('not a reading choice')
    // WHO THE FLOOR IS FOR, IN THE ROW'S OWN WORDS. This one row also sets how much a module's
    // curated summary says, and a module is not floored, so a row that said only "not a reading
    // choice" would be claiming the shut cells are shut for everything it governs. The rule
    // is that the limit is for reports; the row says which kind it is shutting them
    // for rather than a second row being invented for the same stored value.
    expect(mark, 'the row does not say the floor is a report’s').toContain('for a report')
  }, 120_000)

  /**
   * THE COUNTER ROW IS WHY THE TWO COLUMNS STAY. It counts what is written at every position, and
   * the label is still written, so taking the column away would hide a true number.
   */
  it('keeps the counter under all seven columns, and marks the two that are not a choice', async () => {
    await browser.goto(`${app.site}/#/settings`, { timeout: 60_000 })
    await waitForThePage(browser, 60_000)
    await openSettingsPanel(browser, 'settings.detail')
    await browser.waitForSelector('.dsay-counter', { timeout: 30_000 })
    const counts = await browser.evaluate(() =>
      [...document.querySelectorAll('.dsay-counter .dsay-count')].map((one) => ({
        words: (one as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
        called: one.getAttribute('aria-label') ?? '',
        reading: one.getAttribute('data-reading') ?? '',
      })),
    )
    expect(counts, 'the counter row lost a column').toHaveLength(RUNGS.length)
    for (const one of counts) expect(one.words, 'a column counts nothing at all').toMatch(/\d+\s*\/\s*\d+/)
    const shut = counts.filter((one) => one.reading === 'no')
    expect(shut, 'the counter marks the wrong number of columns').toHaveLength(BELOW_THE_FLOOR.length)
    for (const one of shut) expect(one.called).toContain('not a reading choice')
  }, 120_000)

  /**
   * THE MARK IS LONGER THAN EVERY OTHER MARK ON THIS GRID, SO IT IS MEASURED.
   *
   * Every absence mark in this product is one short phrase held to one line by `white-space:
   * nowrap` on the shared class. This one names two positions. Measured on 3 September 2026 before
   * the rule that lets it wrap: it wanted 245px in a 112px column at 660 and drew straight over the
   * Level 1 and Level 2 dots. A rule stated only in a stylesheet is one the next change to the
   * font, the density or the wording can take away with nothing failing — problem `7anOzYmzR4oO`
   * says so about the label on the report control — so the measurement is here.
   */
  it('keeps the row’s mark inside its own column, at every width', async () => {
    const was = browser.viewportSize()
    try {
      for (const width of [1440, 990, 660, 390]) {
        await browser.setViewportSize({ width, height: 1000 })
        await browser.goto(`${app.site}/#/settings`, { timeout: 60_000 })
        await waitForThePage(browser, 60_000)
        await openSettingsPanel(browser, 'settings.detail')
        await browser.waitForSelector('.dsay-grid', { timeout: 30_000 })
        await browser.waitForTimeout(400)
        const fit = await browser.evaluate(() => {
          const name = document.querySelector('[aria-label="Report content"] .dsay-rowname')
          const page = document.documentElement
          return {
            wants: name?.scrollWidth ?? 0,
            gets: name?.clientWidth ?? 0,
            pageWants: page.scrollWidth,
            pageGets: page.clientWidth,
          }
        })
        expect(fit.wants, `the mark spills out of its column at ${String(width)}`).toBeLessThanOrEqual(fit.gets)
        expect(fit.pageWants, `the page scrolls sideways at ${String(width)}`).toBeLessThanOrEqual(fit.pageGets)
      }
    } finally {
      if (was !== null) await browser.setViewportSize(was)
    }
  }, 240_000)

  /** Every other row still offers all seven, because a label is what a list row is for. */
  it('leaves the other rows offering all seven', async () => {
    for (const name of ['everywhere', 'home', 'graph'] as const) {
      const cells = await row(name)
      expect(cells.map((one) => one.rung), `${name} lost a column`).toEqual([...RUNGS])
      expect(cells.filter((one) => one.off).map((one) => one.rung), `${name} shut a cell`).toEqual([])
    }
  }, 180_000)
})

// ============================================================ 5. the route still serves all seven

describe('the short-forms route still reports seven positions, with the label and the title', () => {
  it('names all seven rungs, and carries the words at the two below the floor', async () => {
    const read = (await (
      await fetch(`${app.api}/api/records/${reportId}/short-forms`, { headers: HUMAN })
    ).json()) as { levels: { rung: string; from: string | null; text: string | null; state: string }[] }
    expect(read.levels.map((one) => one.rung), 'the route stopped serving a position').toEqual([...RUNGS])
    const one = read.levels.find((it) => it.rung === 'label')
    expect(one?.text, 'the label is no longer served').toBe(REPORT_LABEL)
    expect(one?.state).toBe('current')
    const two = read.levels.find((it) => it.rung === 'title')
    expect(two?.text, 'the title is no longer served').toBe(REPORT_TITLE)
    expect(two?.from, 'the title stopped coming from the record’s own column').toBe('title')
  }, 60_000)

  it('still takes a written label through the door', async () => {
    // The seeding above wrote one; this asks the record itself, so a route that answered 200 and
    // stored nothing is caught here rather than believed.
    const read = (await (
      await fetch(`${app.api}/api/records/${reportId}`, { headers: HUMAN })
    ).json()) as { record: { data: { shortForms?: Record<string, { text?: string }> } } }
    expect(read.record.data.shortForms?.['label']?.text).toBe(REPORT_LABEL)
  }, 60_000)
})

// ============================================================ 6. a list row still draws the label

describe('a list row still draws the label at Level 1', () => {
  /**
   * The words on the home page with that row set to one position.
   *
   * IT RELOADS AFTER WRITING THE SETTING, AND THE RELOAD IS THE WHOLE POINT. Going from `/` to
   * `#/` is a hash change and not a load, so the page keeps the value it read when it mounted and
   * every reading comes out one position behind the one asked for. Measured here on 3 September
   * 2026: with no reload the walk read the summary where it had asked for the label and the label
   * where it had asked for the conclusion, which looks exactly like a control wired backwards.
   */
  async function homeAt(rung: Rung): Promise<string> {
    await browser.goto(`${app.site}/#/`, { timeout: 60_000 })
    await waitForThePage(browser, 60_000)
    await browser.evaluate(
      ([key, value]) => {
        window.localStorage.setItem(key as string, value as string)
      },
      [detailKeyForSurface('home'), rung],
    )
    await browser.reload({ timeout: 60_000 })
    await waitForThePage(browser, 60_000)
    // THE ROW FIRST DRAWS THE TITLE THE LATE LIST CARRIES, then the words at the asked length once
    // the record is read. So this waits for Late or stuck's row to stop drawing the title.
    await browser.waitForFunction(
      (title) => {
        const row = document.querySelector('[data-home-section="late"] .hm-alarm-row .hm-row-title')
        return row !== null && row.textContent !== title
      },
      ROW_TITLE,
      { timeout: 30_000 },
    )
    return browser.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
  }

  /**
   * TWO POSITIONS AND NOT ONE. A page that drew the label at every position would pass a test that
   * only asked whether the label was there, and would prove nothing about the control.
   */
  it('draws the label at Level 1 and the summary at Conclusion, on the same list', async () => {
    const one = await homeAt('label')
    expect(one, 'the label is not drawn in a list row').toContain(ROW_LABEL)
    expect(one, 'the row drew the summary at Level 1').not.toContain(ROW_SUMMARY)

    const three = await homeAt('gist')
    expect(three, 'the row drew no summary at Conclusion').toContain(ROW_SUMMARY)
    expect(three, 'the row drew the label at Conclusion').not.toContain(ROW_LABEL)
  }, 240_000)
})
