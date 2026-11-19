// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE COMPOSER ITSELF SAYS WHAT THE PROJECTION SOMEBODY RIGHT-CLICKED STANDS FOR.
 *
 * ---------------------------------------------------------------------------------------
 * THE ACT THIS GUARDS, AND WHY THE GUARD THAT EXISTED WAS NOT ONE
 * ---------------------------------------------------------------------------------------
 *
 * design/problem-03/ACCEPTANCE.md:538: *"At the shortest level, right-click the summary itself. It
 * must name which parts of the full report it stands for, and View original must land on those
 * parts rather than on a new object."*
 *
 * That sentence is drawn by `WhatThisStandsFor` in src/web/components/agent/TalkBox.tsx. Measured on
 * 1 September 2026: DELETE THE LINE THAT DRAWS IT — one line, `<WhatThisStandsFor context={context}
 * />` — and typecheck stayed clean and 534 test files / 9,912 tests stayed green.
 * `tests/a-projection-says-what-it-stands-for.test.ts` renders `StandsForLine`, the row in the
 * *Shorter forms* panel, and its own header says so. Nothing anywhere rendered the composer. So the
 * whole of the owner's Act 3 could be removed and the suite would have said the product was fine.
 *
 * ---------------------------------------------------------------------------------------
 * SO THIS OPENS THE PRODUCT AND PRESSES IT
 * ---------------------------------------------------------------------------------------
 *
 * A real browser, a real record page, the reading length set to the shortest, a right-click on the
 * summary line — which at that length is the whole projection — and the sentence read off the box
 * that opens. `liveApp` in tests/helpers.ts gives a throwaway database and two free ports; nothing
 * here touches ./data/panelx.db.
 *
 * WHAT MAKES IT RED, run on 1 September 2026 against a control run of the same command:
 *
 *   delete `<WhatThisStandsFor context={context} />` from TalkBox  → 3 of 7 red
 *   name the parts by their kind again                            → 1 of 7 red
 *   draw the chip's word from the target declaration again        → 2 of 7 red
 *   delete the `changedSinceDrawn` line from TalkBox               → 1 of 7 red
 *
 * Control: 7 of 7 green, before and after each.
 *
 * ---------------------------------------------------------------------------------------
 * THE OTHER SENTENCES ON THIS SURFACE
 * ---------------------------------------------------------------------------------------
 *
 * Every other thing the composer is required to say was checked the same way: deleted from the
 * render, whole suite run, restored. Eleven of them, and the table is in
 * design/problem-03/WHAT-A-READER-MUST-BE-ABLE-TO-READ.md under F-R2. Nine were caught by something.
 * ONE MORE WAS NOT — the line that says the page has moved on under the reader — and it is guarded
 * at the end of this file, because a survey that finds an unguarded sentence and leaves it unguarded
 * has only written the defect down.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { DETAIL_KEY_EVERYWHERE, READER_FLOOR } from '../src/shared/detail.ts'
import { sectionRegionId } from '../src/shared/regions.ts'
// THE KEY THE RECORD'S OWN SUMMARY SITS UNDER, read from the one file that declares it. Reading
// length 3 is that column since criterion A14b, so the paragraph a reader presses at length 3 is
// the declared section `section.summaryLine` and no longer a stored form's own region.
import { SUMMARY_LINE_KEY } from '../src/shared/sections.ts'
// THE ONE WRITER OF THE ATTRIBUTE THE PAGE PUTS ON AN ELEMENT. A selector spelled by hand here
// would be a second spelling of the key, which is the defect this repository keeps finding — and it
// fails silently: the element is on the screen and the selector matches nothing.
import { targetAttributeValue } from '../src/shared/targets.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const HUMAN = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

const TITLE = 'What the bench said about the wrist mount'
const LABEL = 'Bench, round eight'
/**
 * THE WORDS AT READING LENGTH 3, WHICH ARE THE RECORD'S OWN SUMMARY COLUMN.
 *
 * They were a stored gist form until 3 September 2026. Criterion A14b made length 3 the `summary`
 * column and retired the key, so these are filed with the record and the short-forms route refuses
 * them. The name is kept because every case below still asks the question it always asked: what
 * does a projection whose sources nobody recorded say it stands for?
 */
const GIST =
  'Three of the four printed wrist mounts broke below the load the handover trials need, so the ' +
  'aluminium version is now the only one worth testing at all.'

const BLOCKS = [
  { id: 'b-one', type: 'text', heading: 'What the rig showed', text: 'Three of four printed mounts broke.' },
  { id: 'b-two', type: 'text', heading: 'What nobody has measured', text: 'The bolt circle was never measured.' },
]

let app: LiveApp
let page: Page
let reportId: string

beforeAll(async () => {
  app = await liveApp({ name: 'stands-for-composer', viewport: { width: 1440, height: 1000 } })
  page = app.page
  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: HUMAN,
    // THE SUMMARY IS FILED WITH THE RECORD, because it IS reading length 3 — criterion A14b. It
    // was sent to the short-forms route below, as a gist, until 3 September 2026.
    body: JSON.stringify({ kind: 'report', title: TITLE, summary: GIST, data: { blocks: BLOCKS } }),
  })
  if (!made.ok) throw new Error(`seeding the report answered ${String(made.status)}: ${await made.text()}`)
  reportId = ((await made.json()) as { record: { id: string } }).record.id

  const revisions = (await (await fetch(`${app.api}/api/records/${reportId}/revisions`, { headers: HUMAN })).json()) as {
    revisions: { seq: number; contentHash: string }[]
  }
  const newest = [...revisions.revisions].sort((a, b) => b.seq - a.seq)[0]
  if (newest === undefined) throw new Error('the seeded report has no revision to write a short form from')
  // THE LABEL'S SOURCES ARE RECORDED AND THE SUMMARY'S ARE NOT, because the two cases draw two
  // different sentences and both are required. Nothing in the corpus carries recorded sources, so
  // this is the only way either sentence can be pressed at all.
  //
  // AND THE SUMMARY IS NOT SENT HERE ANY MORE. This wrote `{ label: LABEL, gist: GIST }`; the gist
  // key is retired and the route answers 400 naming it, so length 3 is the column filed above and
  // no source list can be recorded for it — which is exactly the state the second block presses.
  const wrote = await fetch(`${app.api}/api/records/${reportId}/short-forms`, {
    method: 'POST',
    headers: HUMAN,
    body: JSON.stringify({
      madeFrom: { seq: newest.seq, contentHash: newest.contentHash },
      forms: { label: LABEL },
      standsFor: { label: ['data.blocks[#b-one]', 'data.blocks[#b-two]'] },
    }),
  })
  if (!wrote.ok) throw new Error(`writing the short forms answered ${String(wrote.status)}: ${await wrote.text()}`)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** What the composer says at this moment: the chip's word, its sentences, and its presses. */
interface Composer {
  chipKind: string | null
  chipWords: string | null
  standsFor: string[]
  presses: string[]
  /** The state words the box is warning with, each one word from the shared vocabulary. */
  warnings: string[]
}

async function composer(): Promise<Composer> {
  return page.evaluate(() => {
    const talk = [...document.querySelectorAll('.px-talk')].find(
      (one) => one.getAttribute('data-target') === 'uiSurface/composer',
    )
    if (talk === undefined) return { chipKind: null, chipWords: null, standsFor: [], presses: [], warnings: [] }
    const words = (e: Element | null) => (e === null ? null : (e.textContent ?? '').trim())
    return {
      chipKind: words(talk.querySelector('.px-talk-chip-kind')),
      chipWords: words(talk.querySelector('.px-talk-chip-what')),
      standsFor: [...talk.querySelectorAll('.px-talk-stands .px-talk-said')].map((e) => (e.textContent ?? '').trim()),
      presses: [...talk.querySelectorAll('button')].map((e) => (e.textContent ?? '').trim()),
      // The word only: the sentence behind each of these is in its `title`, which is where contract
      // 8.10 puts it, and the off-screen span carries it for a reader who cannot hover.
      warnings: [...talk.querySelectorAll('.px-talk-warn')].map((e) =>
        ((e.firstChild?.textContent ?? e.textContent) ?? '').trim(),
      ),
    }
  })
}

/**
 * Open the record at one reading length and right-click one part of it.
 *
 * The reading length is set the way the control sets it, in this browser's own storage, so nothing
 * here holds a second opinion about where that choice lives.
 */
async function rightClickThePart(regionId: string, atLength: string): Promise<Composer> {
  await page.goto(`${app.site}/#/r/${reportId}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.evaluate(
    ([key, length]) => {
      window.localStorage.setItem(key as string, length as string)
    },
    [DETAIL_KEY_EVERYWHERE, atLength],
  )
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  const where = `[data-target="${targetAttributeValue({ kind: 'region', recordId: reportId, regionId })}"]`
  await page.locator(where).first().waitFor({ timeout: 30_000 })
  await page.locator(where).first().scrollIntoViewIfNeeded()
  await page.locator(where).first().click({ button: 'right' })
  await page.locator('.px-talk').first().waitFor({ timeout: 15_000 })
  await sleep(1200)
  return composer()
}

// ============================================================ the owner's Act 3, pressed

/**
 * WHAT THIS SECTION PRESSED, AND WHY TWO OF ITS THREE CASES MOVED ON 3 SEPTEMBER 2026.
 *
 * It read `right-clicking the summary at the shortest reading length` and pressed the label at
 * Level 1 three times. Criterion A19 stops a reader at the conclusion, so a report page draws no
 * label and there is nothing there to press.
 *
 *   `names which parts of the full report it stands for, in the composer` asserted the composer's
 *   sentence read *Stands for the section “What the rig showed” and the section “What nobody has
 *   measured”.* That sentence needs a form with recorded source parts, and the label is the only
 *   one left. It is asserted below off `GET /api/records/:id/short-forms`, which still serves it,
 *   because the fact is intact and only the screen is gone.
 *
 *   `says what kind of place was pointed at, above that sentence` asserted the chip read *Label*.
 *   The claim — that the chip names the kind of thing under the mouse rather than one word for all
 *   thirteen kinds — is unchanged and is pressed at the conclusion, where the chip reads
 *   *Conclusion*.
 *
 *   `offers the way back to those parts` asserted a *View original* press. The owner's rule of
 *   2 September 2026 is that a whole-record form with no recorded parts stands for the whole record,
 *   so the composer on the conclusion now offers that press and it lands on the whole report. The
 *   case two sections below asserts the press; the landing is held in
 *   tests/a-form-with-no-recorded-parts-stands-for-the-whole-record.test.ts.
 */
describe('right-clicking the shortest form a reader reaches', () => {
  it('says what kind of place was pointed at, above the sentence about what it stands for', async () => {
    const said = await rightClickThePart(sectionRegionId(SUMMARY_LINE_KEY), READER_FLOOR)
    // Not "Part of a record", which was one word for all thirteen kinds and sat directly above a
    // sentence that already knew which one this was. The word is the noun `RUNG_SPECS` gives this
    // position, so the chip and the control cannot come to two names for it.
    expect(said.chipKind).toBe('Conclusion')
    expect(said.standsFor, 'the composer said nothing about what this stands for').not.toHaveLength(0)
  }, 120_000)
})

// ==================================================== the sources are recorded, and still served

/**
 * THE SENTENCE NAMING THE SECTIONS A FORM STANDS FOR IS STILL WRITTEN AND STILL SERVED.
 *
 * It was read off the composer at Level 1 until 3 September 2026. Criterion A19 took that screen
 * away; criterion A19 also says levels 1 and 2 stay stored and served, and this is what that
 * sentence means for this file. The label's recorded sources, and the sentence composed from them,
 * come back from the route exactly as before.
 */
describe('the route still says which parts the label stands for', () => {
  it('names both sections, in the sentence the composer used to draw', async () => {
    const read = (await (
      await fetch(`${app.api}/api/records/${reportId}/short-forms`, { headers: HUMAN })
    ).json()) as { levels: { rung: string; text: string | null; standsFor: { says: string } | null }[] }
    const one = read.levels.find((it) => it.rung === 'label')
    expect(one?.text, 'the label is no longer served').toBe(LABEL)
    expect(one?.standsFor?.says).toBe(
      'Stands for the section “What the rig showed” and the section “What nobody has measured”.',
    )
  }, 60_000)
})

// ============================================================ the other sentence, and no press

/**
 * AT READING LENGTH 3 AND NOT AT FULL, from 2 September 2026 in the evening. Both cases pressed the
 * gist form at Full, where the page drew it twice: the report body drew it above the report, being
 * the longest written form at or below Full, and the *Shorter forms of this report* panel drew it
 * again. The owner had the panel removed and the line above the report went with the mark that said
 * what it was, so Full is the report alone and the gist is drawn at the length it was written for.
 * §C-3Sept of `design/problem-02/ACCEPTANCE.md`. The question these cases ask is unchanged.
 *
 * AND THE THING PRESSED IS THE RECORD'S OWN SUMMARY, NOT A STORED GIST. Both cases pressed
 * `shortFormRegionId('gist')` — the region a stored gist form hung under — until 3 September 2026.
 * Criterion A14b made reading length 3 the `summary` column, which is not in `data` and cannot hang
 * a region under a `data.…` path, so the paragraph carries the declared section `section.summaryLine`
 * instead. It is the same paragraph on the same screen at the same length, and it is still a
 * projection whose sources nobody recorded, because nothing records sources for a column.
 *
 * AND A PROJECTION WHOSE SOURCES NOBODY RECORDED STANDS FOR THE WHOLE RECORD, by the owner's rule of
 * 2 September 2026, so the press is offered and it lands on the whole report. That is the press the
 * second case below asserts; the sentence is still the one that says what it stands for.
 */
describe('right-clicking a form whose sources nobody recorded', () => {
  it('says it stands for the whole report, in the composer, rather than saying nothing', async () => {
    const said = await rightClickThePart(sectionRegionId(SUMMARY_LINE_KEY), 'gist')
    expect(said.standsFor, 'the composer said nothing at all about the summary').not.toHaveLength(0)
    expect(said.standsFor[0]).toContain('Stands for the whole report.')
    expect(said.standsFor[0], 'the composer still reports the missing source list as an absence').not.toContain(
      'Nobody recorded',
    )
  }, 120_000)

  it('offers the way back to the whole record, because that is what it stands for', async () => {
    const said = await rightClickThePart(sectionRegionId(SUMMARY_LINE_KEY), 'gist')
    // THE PRESS IS OFFERED. This read `not.toContain('View original')`, because a form with no
    // recorded sources was read as a form with nowhere to go. The owner's rule of 2 September 2026
    // says the opposite: it stands for the whole record, so the press has somewhere to go and is
    // drawn. The landing is measured in
    // tests/a-form-with-no-recorded-parts-stands-for-the-whole-record.test.ts.
    expect(said.presses, `the composer offered: ${said.presses.join(', ')}`).toContain('View original')
  }, 120_000)
})

// ============================================================ the page moved under the reader

/**
 * THE ONE OTHER SENTENCE THIS SURFACE COULD LOSE IN SILENCE.
 *
 * Found by the survey above: delete the `changedSinceDrawn` line from the composer and all 9,946
 * tests stayed green. `revisionToStamp` in src/web/api.ts, which decides it, is covered — its own
 * header says it is exported so a test can put every case without a browser — and that was the
 * whole cover. The arithmetic was guarded and the sentence a person reads was not.
 *
 * It matters more than most: it is the one line in the box that keeps the alarm ink, and what it
 * says is that the words on the screen are not the words that are stored. Somebody writing a
 * comment against text that has already moved gets no revision stamped on it, and this is what
 * tells them why.
 */
describe('the composer says when the page has moved on since it was drawn', () => {
  it('says so, in the alarm line, after somebody else changes the record', async () => {
    // A page drawn, and then the record changed by somebody who is not this browser.
    const clean = await rightClickThePart('data.blocks[#b-one].heading', 'full')
    expect(clean.warnings, 'the page said it had moved on before anything moved').not.toContain(
      'Changed since drawn',
    )
    const changed = await fetch(`${app.api}/api/records/${reportId}`, {
      method: 'PATCH',
      headers: HUMAN,
      body: JSON.stringify({
        dataPatch: {
          blocks: [
            { id: 'b-one', type: 'text', heading: 'What the rig showed', text: 'Four of four broke, on the second run.' },
            BLOCKS[1],
          ],
        },
      }),
    })
    expect(changed.ok, `changing the record answered ${String(changed.status)}`).toBe(true)
    // NO RELOAD. The page in front of the reader is the one drawn before the change, which is the
    // whole situation this line exists for.
    const where = `[data-target="${targetAttributeValue({
      kind: 'region',
      recordId: reportId,
      regionId: 'data.blocks[#b-two].heading',
    })}"]`
    // THE FIRST COMPOSER IS SHUT BEFORE THE SECOND PRESS, and no reload with it. The box opened by
    // the press above is a dialog over the page, and from 2 September 2026 the page under it is one
    // paragraph shorter at Full — the written form that used to stand above the report went with
    // the mark that said what it was — so the box now covers the heading this line presses. Escape
    // closes it and changes nothing about what is drawn, which is what this case is measuring.
    await page.keyboard.press('Escape')
    await sleep(400)
    await page.locator(where).first().click({ button: 'right' })
    await page.locator('.px-talk').first().waitFor({ timeout: 15_000 })
    await sleep(1200)
    const after = await composer()
    expect(after.warnings, 'the reader was not told the words on the screen are not the stored ones').toContain(
      'Changed since drawn',
    )
  }, 120_000)
})

// ============================================================ not on everything else

describe('a part that is not a projection', () => {
  it('draws no sentence about standing for anything, because there is no question to answer', async () => {
    const said = await rightClickThePart('data.blocks[#b-one].heading', 'full')
    expect(said.chipKind, 'the composer did not open on the heading').toBe('Heading')
    expect(said.standsFor, 'a heading was told what it stands for').toHaveLength(0)
  }, 120_000)
})
