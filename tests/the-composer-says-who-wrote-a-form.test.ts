// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE COMPOSER NAMES WHO WROTE THE FORM SOMEBODY RIGHT-CLICKED, AND WHEN.
 *
 * ---------------------------------------------------------------------------------------
 * THE SENTENCE THIS GUARDS
 * ---------------------------------------------------------------------------------------
 *
 * A summary is to record who produced it.
 * Two surfaces already answered it — the *Shorter forms of this report* panel beside each stored
 * form, and the report's own opening line, on the mark that says the line was written for this
 * length. The third place a person meets a form is the composer that opens when they right-click
 * it, and it said nothing.
 *
 * ONE FUNCTION WRITES THE PHRASE. `whoWroteIt` in src/shared/zoom.ts, so the three surfaces cannot
 * describe one stored fact three ways. This file reads the phrase off that function rather than
 * spelling it out, for the same reason.
 *
 * ---------------------------------------------------------------------------------------
 * AND IT LINKS TO THE RUN THAT WROTE IT
 * ---------------------------------------------------------------------------------------
 *
 * Criterion A9a: this ought to link straight to the agent session that made the
 * summary. Both write doors stamp `session` on a form from the caller's own
 * `x-mole-office-session` header, resolved to the session record it names, and the
 * composer draws that as a link.
 *
 * ---------------------------------------------------------------------------------------
 * AND WHERE NOBODY RECORDED A WRITER, NOTHING IS WRITTEN AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * Every form stored before 2 September 2026 carries neither a name nor a time. This box drew
 * *nobody recorded who wrote this* in the place a writer's name goes. That read oddly, and writing
 * nothing is better, so the line is gone. A form with a writer and no run
 * draws the writer and no link; the run is a second fact and its absence is not a hole in the first.
 *
 * NO WRITE DOOR CAN PRODUCE THAT STATE ANY MORE, AND THAT IS MEASURED RATHER THAN ASSUMED. Both
 * doors stamp the time: `shortFormWriting` in src/server/lib/zoom.ts sets `at` from the clock on
 * every write, and clears `by` only where the request stated no actor at all. Writing this case
 * through `POST /short-forms` and through a plain `PATCH` were both tried on 2 September 2026 and
 * both came back with a name and a time. So the row is written into the test's own database file
 * directly — `app.dir` is the throwaway directory `liveApp` made — which is the only way to stand a
 * legacy row up, and it is exactly the shape 20 reports in the live corpus were carrying that
 * morning.
 *
 * It opens the product and presses it, in a real browser, the way
 * `tests/the-composer-says-what-a-projection-stands-for.test.ts` does. `liveApp` in
 * tests/helpers.ts gives a throwaway database and two free ports; nothing here touches
 * ./data/panelx.db.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { DETAIL_KEY_EVERYWHERE } from '../src/shared/detail.ts'
import { sectionRegionId } from '../src/shared/regions.ts'
// THE KEY THE RECORD'S OWN SUMMARY SITS UNDER, from the one file that declares it. Reading length 3
// is that column since criterion A14b, so the paragraph pressed at length 3 is the declared section
// `section.summaryLine` rather than a stored form's own region.
import { SUMMARY_LINE_KEY } from '../src/shared/sections.ts'
// THE ONE WRITER OF THE ATTRIBUTE THE PAGE PUTS ON AN ELEMENT. A selector spelled by hand here
// would be a second spelling of the key, and it fails silently: the element is on the screen and
// the selector matches nothing.
import { targetAttributeValue } from '../src/shared/targets.ts'
import { whoWroteIt } from '../src/shared/zoom.ts'
// THE ONE FUNCTION THAT SPELLS A RECORD'S ADDRESS, so this test and the composer cannot disagree
// about where a link goes.
import { recordPath } from '../src/web/components/router.tsx'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** The agent this test files the forms as, which is what the composer must name. */
const WRITER = 'short-form-writer'
/** The name it is registered under, which the reading gives beside the stored id. */
const WRITERS_NAME = 'Short Form Writer'

const AS_THE_WRITER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': WRITER,
}

const AS_A_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

const TITLE = 'What the bench said about the wrist mount'
const LABEL = 'Bench, round eight'
/**
 * THE WORDS AT READING LENGTH 3, WHICH ARE THE RECORD'S OWN SUMMARY COLUMN.
 *
 * They were a stored gist form until 3 September 2026, filed through the short-forms route with the
 * label. Criterion A14b made length 3 the `summary` column and retired the key, so they are filed
 * with the record instead — and by the actor whose name the case is about, because a column carries
 * no writer of its own and `columnAt` in src/server/lib/zoom.ts reads one off the revision ledger.
 */
const GIST =
  'Three of the four printed wrist mounts broke below the load the handover trials need, so the ' +
  'aluminium version is now the only one worth testing at all.'

const BLOCKS = [
  // LONG ON PURPOSE. `rungsFor` stops a record's ladder at the first length the whole record fits
  // in, and the conclusion's own budget is 60 words, so a report shorter than that has no level 4,
  // 5 or 6 and the write door refuses a summary written by part on it. A fixture this file writes
  // parts to has to be a report with room for them.
  {
    id: 'b-one',
    type: 'text',
    heading: 'What the rig showed',
    text: 'Three of four printed mounts broke.' + ' The jig was reset between pulls and the load cell was zeroed each time, so the numbers are comparable with one another. The fourth mount held to twenty-two newtons and had been printed at half the layer height, which was a mistake in the print queue rather than a decision anybody made, and nobody has repeated it since. One sample is not a finding and the rig is not the question here.',
  },
  { id: 'b-two', type: 'text', heading: 'What nobody has measured', text: 'The bolt circle was never measured.' },
]

/** The report in one part, which is the by-part structure levels 4 to 6 are written in. */
const PARTS = [
  {
    id: 'p-1',
    heading: 'What the bench showed and what nobody measured',
    text30: 'Most printed mounts failed on the rig, and the bolt circle of the aluminium one was never measured.',
    text120:
      'Most of the printed mounts failed on the rig at loads under the trials, and nobody has measured the ' +
      'bolt circle of the aluminium one, so the part that might pass has never been checked against the arm.',
    covers: ['b-one', 'b-two'],
  },
]

let app: LiveApp
let page: Page
/** The run this test writes as, filed as a session record so there is something to link to. */
let session: string
/** The writer's registry id, as its registration answered it. A stored form names its writer by this. */
let writerId: string
/** The report whose forms were written by a run that named itself in its headers. */
let named: string
/** The report whose forms were written by an actor that named no run. */
let noRun: string
/** The report whose forms were stored with no writer at all, as every form before 2 September was. */
let anonymous: string

/**
 * File a report, as one actor, with or without a summary, and hand back its id.
 *
 * IT TOOK NO ARGUMENTS UNTIL 3 SEPTEMBER 2026: every report here was filed by a person and carried
 * no summary, because the words for reading length 3 were a form written through the short-forms
 * route. Criterion A14b made length 3 the record's own `summary` column, and the writer of a column
 * is the write that put the value there — read off the revision ledger and never stamped on the
 * record. So the actor who files the report IS the writer the composer names at that length, and
 * each of the three reports below has to be filed by the actor its own case is about.
 */
async function fileTheReport(summary: string | null, headers: Record<string, string>): Promise<string> {
  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      kind: 'report',
      title: TITLE,
      ...(summary === null ? {} : { summary }),
      data: { blocks: BLOCKS },
    }),
  })
  if (!made.ok) throw new Error(`seeding the report answered ${String(made.status)}: ${await made.text()}`)
  return ((await made.json()) as { record: { id: string } }).record.id
}

/** The newest revision of one record, which is what a stored form has to name. */
async function newestRevisionOf(recordId: string): Promise<{ seq: number; contentHash: string }> {
  const read = (await (
    await fetch(`${app.api}/api/records/${recordId}/revisions`, { headers: AS_A_PERSON })
  ).json()) as { revisions: { seq: number; contentHash: string }[] }
  const newest = [...read.revisions].sort((a, b) => b.seq - a.seq)[0]
  if (newest === undefined) throw new Error(`${recordId} has no revision to write a short form from`)
  // THE TWO FIELDS AND NOTHING ELSE. A revision row carries its own id and the operation that made
  // it, and a stored form's `madeFrom` takes only these two — the write door refuses the rest by
  // name, which is what said so the first time this was run.
  return { seq: newest.seq, contentHash: newest.contentHash }
}

beforeAll(async () => {
  app = await liveApp({ name: 'who-wrote-a-form', viewport: { width: 1440, height: 1000 } })
  page = app.page

  // THE WRITER IS REGISTERED BEFORE IT WRITES. The records door refuses a write under an agent id
  // no registry row holds, and every form in this file is filed under `short-form-writer`. The
  // subject of this file is the name the composer draws, not the registration; the register call is
  // what stands the name up.
  const registered = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST',
    headers: AS_A_PERSON,
    body: JSON.stringify({ handle: WRITER, name: WRITERS_NAME }),
  })
  if (!registered.ok) throw new Error(`registering the writer answered ${String(registered.status)}: ${await registered.text()}`)
  writerId = ((await registered.json()) as { agent: { id: string } }).agent.id

  // THE RUN, FILED FIRST, because a form's `session` is the id of a session record and a reference
  // that names nothing is stored as nothing. This is the record the composer's link goes to.
  const ran = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_A_PERSON,
    body: JSON.stringify({
      kind: 'session',
      title: 'The run that wrote the forms in this test',
      data: { state: 'running', runtime: 'claude-code' },
    }),
  })
  if (!ran.ok) throw new Error(`filing the session answered ${String(ran.status)}: ${await ran.text()}`)
  session = ((await ran.json()) as { record: { id: string } }).record.id

  // THE REPORT FILED BY THE RUN ITSELF, so the ledger row behind its summary column names both the
  // agent and the run. It was filed by a person until 3 September 2026, when its length 3 was a
  // stored form and the route was what stamped a writer on it.
  named = await fileTheReport(GIST, { ...AS_THE_WRITER, 'x-mole-office-session': session })
  const forNamed = await newestRevisionOf(named)
  const wrote = await fetch(`${app.api}/api/records/${named}/short-forms`, {
    method: 'POST',
    headers: { ...AS_THE_WRITER, 'x-mole-office-session': session },
    body: JSON.stringify({
      madeFrom: { seq: forNamed.seq, contentHash: forNamed.contentHash },
      // THE PARTS TOO, because the by-part structure is stamped with the run exactly as a form is
      // and the two are stamped by two branches of the same function. One part covering both
      // blocks is the smallest structure the door accepts.
      //
      // AND THE GIST IS NOT HERE. This sent `{ label, gist, parts }`; the gist key is retired and
      // the route answers 400 naming it, so length 3 is the summary column filed with the record.
      forms: { label: LABEL, parts: PARTS },
    }),
  })
  if (!wrote.ok) throw new Error(`writing the short forms answered ${String(wrote.status)}: ${await wrote.text()}`)

  // A FORM WITH A WRITER AND NO RUN, which is what a write with no session header stores. Every
  // form written before 3 September 2026 is in this state too, and nothing fills one in for them.
  noRun = await fileTheReport(GIST, AS_THE_WRITER)
  const forNoRun = await newestRevisionOf(noRun)
  const wroteNoRun = await fetch(`${app.api}/api/records/${noRun}/short-forms`, {
    method: 'POST',
    headers: AS_THE_WRITER,
    body: JSON.stringify({
      madeFrom: { seq: forNoRun.seq, contentHash: forNoRun.contentHash },
      // THE LABEL ALONE. This sent the gist with it until the key was retired; the summary column
      // filed with the record above is length 3 here too, and it names no run either.
      forms: { label: LABEL },
    }),
  })
  if (!wroteNoRun.ok) throw new Error(`writing the second set answered ${String(wroteNoRun.status)}: ${await wroteNoRun.text()}`)

  // NO SUMMARY ON THIS ONE, and that is deliberate. The case it stands up is a form with nobody's
  // name on it, and a column always has a writer in the ledger because a write put it there. So
  // this report simply has no reading length 3, and its label is the form nobody is named on.
  anonymous = await fileTheReport(null, AS_A_PERSON)
  const forAnonymous = await newestRevisionOf(anonymous)
  // A FORM WITH NO WRITER AND NO TIME, WHICH IS WHAT EVERY FORM STORED BEFORE 2 SEPTEMBER 2026 IS.
  // Written into this test's own database file, because no write door leaves both empty — see the
  // head of this file for what was tried. The server is a separate process reading the same file,
  // so the handle is opened, one row is changed, and the handle is closed again.
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    const row = db.prepare('select data from records where id = ?').get(anonymous) as { data: string }
    const data = JSON.parse(row.data) as Record<string, unknown>
    // THE LABEL ALONE. A gist was written beside it here until 3 September 2026, so that the two
    // whole-record forms of a legacy record could both be pressed. The gist key is retired and
    // `readStoredShortForms` hands nothing back under it, so a row written here would be a row
    // nothing reads — the legacy shape and what it does draw is the subject of
    // tests/levels-two-and-three-are-the-records-own-words.test.ts, not of this file.
    data['shortForms'] = {
      label: { text: LABEL, writtenBy: 'agent', madeFrom: forAnonymous },
    }
    db.prepare('update records set data = ? where id = ?').run(JSON.stringify(data), anonymous)
  } finally {
    db.close()
  }
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Everything the composer's stands-for box says, in the order a reader meets it. */
interface Said {
  standsFor: string[]
  wrote: string[]
  /** Where every link in the writer line goes, so a link to a run can be told from words about one. */
  links: string[]
}

async function saidByTheComposer(): Promise<Said> {
  return page.evaluate(() => {
    const talk = [...document.querySelectorAll('.px-talk')].find(
      (one) => one.getAttribute('data-target') === 'uiSurface/composer',
    )
    if (talk === undefined) return { standsFor: [], wrote: [], links: [] }
    return {
      standsFor: [...talk.querySelectorAll('.px-talk-stands .px-talk-said')].map((e) => (e.textContent ?? '').trim()),
      wrote: [...talk.querySelectorAll('.px-talk-stands .px-talk-wrote')].map((e) => (e.textContent ?? '').trim()),
      links: [...talk.querySelectorAll('.px-talk-stands .px-talk-wrote a')].map((e) => e.getAttribute('href') ?? ''),
    }
  })
}

/** Open one record at one reading length and right-click the form drawn there. */
async function rightClickTheForm(recordId: string, regionId: string, atLength: string): Promise<Said> {
  await page.goto(`${app.site}/#/r/${recordId}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.evaluate(
    ([key, length]) => {
      window.localStorage.setItem(key as string, length as string)
    },
    [DETAIL_KEY_EVERYWHERE, atLength],
  )
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  const where = `[data-target="${targetAttributeValue({ kind: 'region', recordId, regionId })}"]`
  await page.locator(where).first().waitFor({ timeout: 30_000 })
  await page.locator(where).first().scrollIntoViewIfNeeded()
  await page.locator(where).first().click({ button: 'right' })
  await page.locator('.px-talk').first().waitFor({ timeout: 15_000 })
  await sleep(1200)
  return saidByTheComposer()
}

describe('right-clicking a short form opens a composer that names who wrote it', () => {
  /**
   * IT PRESSED THE LABEL AT LEVEL 1 UNTIL 3 SEPTEMBER 2026. Criterion A19 stops a reader at the
   * conclusion, so a report page draws no label and the press moved to the summary line, which is
   * the shortest thing a reader can now right-click. The claim is unchanged: the composer names the
   * writer of the form under the mouse, with the time beside the name, in the one phrase
   * `whoWroteIt` writes. What changed is where the writer comes from — the revision ledger for a
   * column rather than the row stored beside the record — and that this report is therefore filed
   * by the writing agent.
   */
  it('names the writer and the time, under the sentence saying what the form stands for', async () => {
    const said = await rightClickTheForm(named, sectionRegionId(SUMMARY_LINE_KEY), 'gist')
    expect(said.standsFor, 'the composer did not open on the form at all').not.toHaveLength(0)
    expect(said.wrote, 'the composer said nothing about who wrote this form').toHaveLength(1)
    const drawn = said.wrote[0] ?? ''
    expect(drawn, 'the composer did not name the agent that wrote the form').toContain(WRITER)
    // THE WHOLE PHRASE, from the one function both other screens draw it with. The time is read off
    // what the page actually said rather than guessed, because the write door stamps it.
    const at = /on (.+)$/.exec(drawn)?.[1] ?? null
    expect(at, 'the composer named a writer with no time beside it').not.toBeNull()
    expect(drawn).toBe(whoWroteIt(WRITER, at))
  }, 120_000)

  /**
   * THE THING PRESSED HERE WAS `shortFormRegionId('gist')` — a stored gist form's own region —
   * until 3 September 2026. Criterion A14b made reading length 3 the record's own `summary` column,
   * which is not in `data` and hangs no region under a `data.…` path, so the paragraph a reader
   * presses at that length carries the declared section `section.summaryLine`. The claim is
   * unchanged: the composer names the writer of the length under the mouse and not of another one.
   *
   * WHO IT NAMES COMES OUT OF THE REVISION LEDGER NOW, and that is why this report is filed by the
   * writing agent rather than by a person. Nothing is stamped beside the summary on the record.
   */
  it('says it about the length that was pressed, and not about a different one', async () => {
    const said = await rightClickTheForm(named, sectionRegionId(SUMMARY_LINE_KEY), 'gist')
    expect(said.wrote, 'the composer said nothing about who wrote the summary').toHaveLength(1)
    expect(said.wrote[0] ?? '').toContain(WRITER)
  }, 120_000)

  /**
   * A CASE WAS PRESSED HERE UNTIL 3 SEPTEMBER 2026 AND IS NOW SOMEWHERE ELSE.
   *
   * It read `writes nothing at all where nobody recorded a writer`. It right-clicked the label of
   * `anonymous` — a row written straight into this test's own database with no writer and no time —
   * and asserted the composer wrote nothing in the writer's place. That is criterion A9a: the
   * phrase *nobody recorded* read oddly, and writing nothing is better.
   *
   * CRITERION A19 TOOK THE PRESS AWAY on the same day. A reader goes no lower than the conclusion,
   * so a report page draws no label. Nor can the shape be reached at the conclusion: a column's
   * writer is read off the revision ledger, where the actor is never null and the time is always
   * stamped, so a column always names somebody. `anonymous` has no summary at all, by design.
   *
   * `tests/a-short-form-says-who-wrote-it.test.ts` HOLDS IT NOW. It stands a row like that up
   * directly and reads what the composer draws, which is the only way left to reach a state the
   * write door cannot make. The `anonymous` fixture below stays, because the reading route still
   * serves that row and the API cases in this file still read it.
   */
})

// ============================================================ the run that wrote it

/**
 * THE COMPOSER LINKS THE FORM TO THE RUN THAT WROTE IT, criterion A9a.
 *
 * THE STORED FIELD AND THE DRAWN LINK ARE ASSERTED SEPARATELY, because they fail separately: a
 * write door that stamps nothing leaves the page nothing to link, and a page that draws no link
 * leaves the stored fact unreachable. Between them they are the whole of the criterion.
 *
 * A STORED FORM NAMES ITS WRITER BY REGISTRY ID, though the writer sent its handle, and the reading
 * gives the writer's name beside it. The summary column's writer is read off the revision ledger as
 * the request sent it, so the phrase the composer draws there is still the handle.
 */
describe('the composer links a form to the run that wrote it', () => {
  it('reports the run beside who wrote it and when, on GET short-forms', async () => {
    const read = (await (
      await fetch(`${app.api}/api/records/${named}/short-forms`, { headers: AS_A_PERSON })
    ).json()) as { levels: { level: string | null; by: string | null; byName: string | null; at: string | null; session: string | null }[] }
    const label = read.levels.find((one) => one.level === 'label')
    expect(label?.by, 'the reading lost who wrote it').toBe(writerId)
    expect(label?.byName, 'the reading does not name who wrote it').toBe(WRITERS_NAME)
    expect(label?.at, 'the reading lost when it was written').not.toBeNull()
    expect(label?.session, 'the reading does not say which run wrote it').toBe(session)
  }, 60_000)

  it('reports the run on the by-part structure as well', async () => {
    const read = (await (
      await fetch(`${app.api}/api/records/${named}/short-forms`, { headers: AS_A_PERSON })
    ).json()) as { levels: { rung: string; by: string | null; byName: string | null; session: string | null }[] }
    for (const rung of ['outline', 'sketch', 'digest']) {
      const here = read.levels.find((one) => one.rung === rung)
      expect(here?.by, `${rung} lost who wrote the parts`).toBe(writerId)
      expect(here?.byName, `${rung} does not name who wrote the parts`).toBe(WRITERS_NAME)
      expect(here?.session, `${rung} does not say which run wrote the parts`).toBe(session)
    }
  }, 60_000)

  it('reports no run for a form written by an actor that named none', async () => {
    const read = (await (
      await fetch(`${app.api}/api/records/${noRun}/short-forms`, { headers: AS_A_PERSON })
    ).json()) as { levels: { level: string | null; by: string | null; session: string | null }[] }
    const label = read.levels.find((one) => one.level === 'label')
    expect(label?.by, 'the reading lost who wrote it').toBe(writerId)
    expect(label?.session, 'a run was invented for a write that named none').toBeNull()
  }, 60_000)

  /**
   * BOTH OF THESE PRESSED THE LABEL AT LEVEL 1 UNTIL 3 SEPTEMBER 2026, criterion A19. They press the
   * summary line at the conclusion now, which is the shortest thing a reader reaches. The two
   * records still differ in exactly the way the cases are about: `named` was filed in a run and
   * `noRun` was not, so the ledger has a session for one and none for the other.
   */
  it('draws the writer and a link to that run’s record', async () => {
    const said = await rightClickTheForm(named, sectionRegionId(SUMMARY_LINE_KEY), 'gist')
    expect(said.wrote, 'the composer said nothing about who wrote this form').toHaveLength(1)
    expect(said.wrote[0] ?? '').toContain(WRITER)
    expect(said.links, 'the composer drew no link to the run that wrote the form').toHaveLength(1)
    // THE ADDRESS OF THAT RECORD AND NOT A GUESS AT ONE. `recordPath` is the one function that
    // spells a record's address, so a link spelled by hand here would be a second spelling.
    expect(said.links[0] ?? '').toContain(recordPath(session))
  }, 120_000)

  it('draws the writer and no link where no run was recorded', async () => {
    const said = await rightClickTheForm(noRun, sectionRegionId(SUMMARY_LINE_KEY), 'gist')
    expect(said.wrote, 'the composer said nothing about who wrote this form').toHaveLength(1)
    expect(said.wrote[0] ?? '').toContain(WRITER)
    expect(said.links, 'the composer linked to a run nobody recorded').toHaveLength(0)
  }, 120_000)

  /**
   * THE SENTENCE IS ON NO PAGE AND IN NO COMPOSER, which is the half a per-element assertion cannot
   * reach: it could have moved into the report body, a tooltip or a fold rather than being removed.
   */
  /**
   * IT WALKED THREE RECORDS AT LEVEL 1 UNTIL 3 SEPTEMBER 2026 and walks two at the conclusion now.
   * `anonymous` left the walk because it has no summary, by design, so there is nothing on its page
   * to open a composer on — its own state is read through the route in the cases above.
   */
  it('says nobody recorded who wrote this nowhere on the page or in the composer', async () => {
    for (const recordId of [named, noRun]) {
      const said = await rightClickTheForm(recordId, sectionRegionId(SUMMARY_LINE_KEY), 'gist')
      expect(said.standsFor, `the composer did not open on ${recordId}`).not.toHaveLength(0)
      const everything = await page.evaluate(() => document.body.innerHTML)
      expect(everything, `the sentence is still on the page of ${recordId}`).not.toContain(
        'nobody recorded who wrote this',
      )
    }
  }, 240_000)
})
