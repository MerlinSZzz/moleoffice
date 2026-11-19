// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO WROTE A SHORT FORM IS IN THE COMPOSER, AND NOWHERE ON THE PAGE.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULING
 * ---------------------------------------------------------------------------------------
 *
 * The report body drew a mark under the form written for the length being read:
 *
 *   Written for this length by claude-code/short-form-writer
 *
 * and, at Full, *Written for reading length 6 by claude-code/short-form-writer*, because Full has no
 * form of its own and the body drew the longest one that exists. The ruling was that a line like
 * that is not for a person to read. So it left the page. And at Full the form
 * left with it: without the mark, a summary somebody wrote would stand above the report with nothing
 * saying what it is, which is the fault the mark had been added to repair.
 *
 * Criterion A11 of `design/pointing-reopened/ACCEPTANCE.md`, retired into that rule; §C-3Sept of
 * `design/problem-02/ACCEPTANCE.md`.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS NOT GONE FROM THE PRODUCT, AND THAT IS THE OTHER HALF OF THIS FILE
 * ---------------------------------------------------------------------------------------
 *
 * Who wrote a form and when is a stored fact and a person can still reach it: right-click the form
 * and the composer says it, beside what the form stands for. That is criterion A9, and it is checked
 * here in the same browser, because "the line is gone" and "the fact is unreachable" are one press
 * apart and only one of them is what was asked for.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, so a reader can check these assertions are not decoration
 * ---------------------------------------------------------------------------------------
 *
 *   draw `<span className="sb-open-why">Written for this length</span>` under the line in
 *   `ReportOpening` → *no line saying who wrote a form* goes red at every length a reader reaches.
 *   Five since 3 September 2026, criterion A19; it was seven, and three of those seven drew one
 *   position.
 *
 *   make `formDrawnAt` in src/shared/reportrungs.ts answer at Full again — take out the
 *   `if (at === 'full') return null` — → *the report's own first block opens the body at Full* goes
 *   red.
 *
 *   take `whoWroteIt` out of `WhatThisStandsFor` in src/web/components/agent/TalkBox.tsx → *the
 *   composer names the writer* goes red, and nothing else in this file does.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { DETAIL_KEY_EVERYWHERE } from '../src/shared/detail.ts'
import { sectionRegionId } from '../src/shared/regions.ts'
import { SUMMARY_LINE_KEY } from '../src/shared/sections.ts'
// THE ONE WRITER OF THE ATTRIBUTE THE PAGE PUTS ON AN ELEMENT. A selector spelled by hand here would
// be a second spelling of the key, and it fails silently: the element is on the screen and the
// selector matches nothing.
import { targetAttributeValue } from '../src/shared/targets.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** The three headers a write carries. The writer is read off the second and nowhere else. */
const THE_WRITER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'short-form-writer',
  'x-mole-office-session': 'sess-who-wrote-a-form',
}

const HUMAN = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

const TITLE = 'What the bench said about the wrist mount'
const OPENS_WITH = 'Three of the four printed mounts broke below the load the trials need.'
const GIST =
  'Three of the four printed wrist mounts broke below the load the handover trials need, so the ' +
  'aluminium version is now the only one worth testing at all.'
/** A form written by a request that states no actor, so nobody is recorded as having written it. */
const NOBODY_WROTE_THIS = 'Mounts broke early'

const BLOCKS = [
  { id: 'b-one', type: 'text', heading: 'What the rig showed', text: OPENS_WITH },
  { id: 'b-two', type: 'text', heading: 'What nobody has measured', text: 'The bolt circle was never measured.' },
]

let app: LiveApp
let page: Page
let reportId: string

beforeAll(async () => {
  app = await liveApp({ name: 'who-wrote-a-form', viewport: { width: 1440, height: 1000 } })
  page = app.page
  // THE WRITER IS REGISTERED BEFORE IT WRITES. The records door refuses a write under an agent id
  // no registry row holds, and the report below is filed under `short-form-writer`.
  const registered = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST',
    headers: HUMAN,
    body: JSON.stringify({ handle: 'short-form-writer', name: 'Short Form Writer' }),
  })
  if (!registered.ok) throw new Error(`registering the writer answered ${String(registered.status)}: ${await registered.text()}`)
  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: THE_WRITER,
    // `for` AND `date` BECAUSE THE BYLINE IS THE TRAP. A report page draws *Written for* and the person's name over
    // the report — who the report was written FOR, which is a different fact from who wrote a form
    // and is not what was ruled out. A test that looked for the words *Written for* anywhere on the
    // page would pass here only because the fixture had no byline, and go red on every real report.
    body: JSON.stringify({
      kind: 'report',
      title: TITLE,
      // READING LENGTH 3 IS THE RECORD'S OWN SUMMARY SINCE 3 SEPTEMBER 2026, criterion A14b. These
      // words were a stored `gist`, written through the short-forms route by a named agent; that
      // key is retired, so they are the record's own summary and the same length draws them. The
      // writer is still a real recorded value — the revision ledger holds the agent that filed this
      // record — so the assertions below still ask about a form somebody is recorded as writing.
      summary: GIST,
      data: { for: THE_TEST_OFFICES_OWNER.name, date: '2026-09-02', blocks: BLOCKS },
    }),
  })
  if (!made.ok) throw new Error(`seeding the report answered ${String(made.status)}: ${await made.text()}`)
  reportId = ((await made.json()) as { record: { id: string } }).record.id

  const revisions = (await (await fetch(`${app.api}/api/records/${reportId}/revisions`, { headers: HUMAN })).json()) as {
    revisions: { seq: number; contentHash: string }[]
  }
  const newest = [...revisions.revisions].sort((a, b) => b.seq - a.seq)[0]
  if (newest === undefined) throw new Error('the seeded report has no revision to write a short form from')
  // ONE FORM NOBODY RECORDED A WRITER FOR, written by a request that states no actor. That is
  // every form stored before 2 September 2026, and the composer has to say so rather than drawing
  // a phrase with a hole where a name would go. `actorFrom` stores null for a request like this.
  const anon = await fetch(`${app.api}/api/records/${reportId}/short-forms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      madeFrom: { seq: newest.seq, contentHash: newest.contentHash },
      forms: { label: NOBODY_WROTE_THIS },
    }),
  })
  if (!anon.ok) throw new Error(`writing the unattributed form answered ${String(anon.status)}: ${await anon.text()}`)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** The record page at one reading length, with the length set where the control keeps it. */
async function openAt(length: string): Promise<void> {
  await page.goto(`${app.site}/#/r/${reportId}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.evaluate(
    ([key, value]) => {
      window.localStorage.setItem(key as string, value as string)
    },
    [DETAIL_KEY_EVERYWHERE, length],
  )
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('.rd-report').first().waitFor({ timeout: 30_000 })
  await sleep(800)
}

/** Every word on the page, including anything a fold or a title attribute is holding. */
async function everythingOnThePage(): Promise<string> {
  return page.evaluate(() => {
    const text = document.body.textContent ?? ''
    const titles = [...document.querySelectorAll('[title]')].map((el) => el.getAttribute('title') ?? '').join(' ')
    const labels = [...document.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label') ?? '').join(' ')
    return `${text} ${titles} ${labels}`
  })
}

// ============================================================ 1. not on the page, at any length

describe('the line saying who wrote a form is on no reading length of a record page', () => {
  // IT WALKED ALL SEVEN UNTIL 3 SEPTEMBER 2026. Criterion A19 stops a reader at the conclusion, so
  // `openAt('label')` and `openAt('title')` both draw the conclusion: three of the seven cases were
  // measuring one position under three names, and the case names said `at label` about a page drawn
  // at the conclusion. A name that does not describe what ran is worse than one case fewer.
  for (const rung of ['gist'] as const) {
    it(`says nothing about who wrote a form at ${rung}`, async () => {
      await openAt(rung)
      const said = await everythingOnThePage()
      // THE TWO WORDINGS THE MARK EVER HAD, and the element it was drawn in. Both are named, because
      // the mark said *this length* where the words were written for the length being read and
      // *reading length N* everywhere else, and a page that kept one of them would keep the fault.
      expect(said, `the writer line is back at ${rung}`).not.toContain('Written for this length')
      expect(said, `the writer line is back at ${rung}, in its other wording`).not.toContain('Written for reading length')
      // THE AGENT'S NAME IS NOT ASSERTED ABSENT, and that is deliberate. It is on the page — the
      // change log says which actor last wrote to this record, which is provenance and is what that
      // panel is for. What was ruled out is the mark above the report, and that is what is named.
      const marks = await page.evaluate(() => document.querySelectorAll('.sb-open-why').length)
      expect(marks, `the element the mark was drawn in is back at ${rung}`).toBe(0)
      // AND THE BYLINE IS STILL THERE, so this is not passing because the page drew nothing. It says
      // who the report was written FOR, which is a different fact and stays.
      expect(said, `the byline is gone from the page at ${rung}`).toContain(`Written for ${THE_TEST_OFFICES_OWNER.name}`)
    }, 180_000)
  }
})

// ============================================================ 2. Full is the report alone

describe('at Full the body opens with the report and not with a written form', () => {
  it('draws the report’s own first block as the first words of the body', async () => {
    await openAt('full')
    const seen = await page.evaluate(() => {
      const body = document.querySelector('.rd-report .sb')
      return {
        forms: body === null ? -1 : body.querySelectorAll('.sb-open-line').length,
        first: (body?.querySelector('.sb-block, .sb-p, p, h1, h2, h3') as HTMLElement | null)?.innerText ?? '',
        all: (body as HTMLElement | null)?.innerText ?? '',
      }
    })
    expect(seen.forms, 'a written form is drawn above the report at Full').toBe(0)
    expect(seen.all, 'Full is not drawing the report itself').toContain(OPENS_WITH)
    expect(seen.all, 'the account or another written form is drawn at Full').not.toContain(GIST)
  }, 180_000)

  it('draws the form written for a shorter length, so the check above is not of an empty page', async () => {
    await openAt('gist')
    const said = await page.evaluate(() => (document.querySelector('.rd-report .sb') as HTMLElement | null)?.innerText ?? '')
    expect(said, 'the form written for reading length 3 is not drawn either').toContain(GIST)
  }, 180_000)
})

// ============================================================ 3. the composer still says it

describe('the composer names the writer of a form on right-click', () => {
  it('says who wrote it and when, beside what it stands for', async () => {
    await openAt('gist')
    const where = `[data-target="${targetAttributeValue({
      kind: 'region',
      recordId: reportId,
      // THE REGION IS THE RECORD'S OWN SUMMARY, which is what reading length 3 draws since
      // 3 September 2026. It was `shortFormRegionId('gist')` while a gist was stored beside it.
      regionId: sectionRegionId(SUMMARY_LINE_KEY),
    })}"]`
    await page.locator(where).first().waitFor({ timeout: 30_000 })
    await page.locator(where).first().scrollIntoViewIfNeeded()
    await page.locator(where).first().click({ button: 'right' })
    await page.locator('.px-talk').first().waitFor({ timeout: 15_000 })
    await sleep(1200)
    const said = await page.evaluate(() => {
      const talk = [...document.querySelectorAll('.px-talk')].find(
        (one) => one.getAttribute('data-target') === 'uiSurface/composer',
      )
      if (talk === undefined) return null
      return {
        wrote: [...talk.querySelectorAll('.px-talk-wrote')].map((e) => (e.textContent ?? '').trim()),
        standsFor: [...talk.querySelectorAll('.px-talk-stands .px-talk-said')].map((e) => (e.textContent ?? '').trim()),
      }
    })
    expect(said, 'the composer did not open at all').not.toBeNull()
    // WHO WROTE IT. The actor id is the one on the write's headers and nothing else in this test
    // wrote a form, so a wrong name could not come from anywhere else.
    expect(said?.wrote.join(' '), 'the composer says nothing about who wrote the form').toContain(
      'short-form-writer',
    )
    expect(said?.wrote.join(' ')).toContain('Written by')
    // AND WHAT IT STANDS FOR, which is criterion A9's other half and is on the same box.
    expect(said?.standsFor.join(' ')).toContain('Stands for the whole report.')
  }, 180_000)

  /**
   * A CASE WAS PRESSED HERE UNTIL 3 SEPTEMBER 2026 AND IS NOW SOMEWHERE ELSE.
   *
   * It read `names the time and no name, where the request that wrote it stated no actor`. It
   * opened the report at Level 1, right-clicked the label — written through the short-forms route
   * from a request that stated no actor — and asserted the composer said `Written on …` and never
   * `Written by`.
   *
   * CRITERION A19 TOOK THE PRESS AWAY. A reader goes no lower than the conclusion, so a report page
   * draws no label at any position and there is nothing to right-click. Nor can the shape be made
   * at the conclusion: level 3 is the record's own summary column, and a column's writer is read
   * off the revision ledger, where `actor_id` is not null. Every column names somebody.
   *
   * `whoWroteIt` HAS THREE ANSWERS AND THIS FILE NOW PRESSES ONE. A writer and a time is the case
   * above. A time alone, and neither, are both drawn from stored rows that no reader can reach, and
   * `tests/a-short-form-says-who-wrote-it.test.ts` holds both: it can stand either row up directly
   * and read the drawing, which is what that file was already doing for the third.
   */
})
