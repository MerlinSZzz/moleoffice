// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * READING LENGTHS 2 AND 3 ARE THE RECORD'S OWN TITLE AND ITS OWN SUMMARY.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE THIS GUARDS
 * ---------------------------------------------------------------------------------------
 *
 * A title is at most 15 words and a summary 20 to 60. Earlier reports are left as they are, and are
 * not shortened or filled in; a level a record does not have is written as not existing.
 * A report is filed with a title and a summary, and those two ARE reading lengths 2 and 3. There is
 * no separate title form and no gist any more; what is stored under those two keys stays on disk,
 * undrawn. The two word counts are targets and nothing is refused for its length. And, on the page:
 * the summary is drawn in the report's
 * body at length 3 and is not repeated at the top of the page. Criterion A14b of
 * `design/pointing-reopened/ACCEPTANCE.md`.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A BROWSER AND NOT A RENDERING
 * ---------------------------------------------------------------------------------------
 *
 * Four things have to agree for a person to read the title at length 2: the declaration says which
 * stored field that length reads, the body draws it, the record page stops drawing the summary
 * above the body, and the region tree holds a part for each so a press names it. A rendering test
 * proves the second alone, and every one of the other three can break with it still green. So this
 * opens the product on its own database and presses it.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE REPORTS THIS SEEDS
 * ---------------------------------------------------------------------------------------
 *
 *   `whole`      a title, a summary, a label and one part. Every length below Full is written, so
 *                this is the report the drawing, the pointing and the reading are all measured on.
 *   `noSummary`  a title and a label, and no summary. It has no length 3 and must say so.
 *   `legacy`     a title and a summary on the record, AND a stored `title` form and `gist` written
 *                straight into its own database row, which is the shape three reports in the live
 *                corpus carry. Neither stored form may be drawn.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS THAT TURN THESE RED
 * ---------------------------------------------------------------------------------------
 *
 * All seven were run, each against a control run of the whole file, and each was reverted after.
 *
 *   in `formsWrittenIn` in src/shared/reportrungs.ts, stop pushing the title column → 4 of 20 red.
 *
 *   in the same function, stop pushing the summary column → 4 of 20 red.
 *
 *   in `readStoredShortForms` in src/shared/zoom.ts, read `SHORT_FORM_LEVELS` again instead of
 *   `STORED_SHORT_FORM_LEVELS` → 1 red: the retired gist is drawn at Conclusion on the legacy
 *   report. That reader is the ONE gate on a retired key, which is why this mutation reaches the
 *   page at all — see the note on the loop in `formsWrittenIn`.
 *
 *   in `RETIRED_SHORT_FORM_KEYS` in the same file, take `title` and `gist` back out → 2 red: both
 *   doors accept a new title form and a new gist.
 *
 *   in src/web/pages/RecordPage.tsx, draw the summary lede on a report again → 2 red.
 *
 *   in `columnAt` in src/server/lib/zoom.ts, stop reading the ledger for a column's writer → 3 red.
 *
 *   in `whatKindOfPlace` in src/web/components/agent/context.ts, ask `nameOfRegionId` before the
 *   drawing → 1 red: the chip reads *Section “Summary”* instead of *Conclusion*.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { DETAIL_KEY_EVERYWHERE, detailKeyForHere, levelLabel, RUNGS, type Rung } from '../src/shared/detail.ts'
// THE ONE WRITER OF A SECTION'S REGION ID and the two keys the columns sit under, so this file
// cannot spell an id the page does not carry.
import { sectionRegionId } from '../src/shared/regions.ts'
import { SUMMARY_LINE_KEY } from '../src/shared/sections.ts'
import { targetAttributeValue } from '../src/shared/targets.ts'
import { SHORT_FORM_SPECS } from '../src/shared/zoom.ts'
import { recordPath } from '../src/web/components/router.tsx'
import type { SummaryBlock } from '../src/shared/types.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * The agent that files the three reports, which is the name the ledger has to give back.
 *
 * IT IS A HANDLE THAT CAN BE REGISTERED, AND `beforeAll` REGISTERS IT. The records door refuses a
 * write under an agent id no registry row holds, so a name with a slash in it — which no handle may
 * carry — could not be stood up at all. The registration is the standing-up this fixture needs.
 */
const WRITER = 'report-writer'

const AS_A_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

const BLOCKS: SummaryBlock[] = [
  // LONG ON PURPOSE. `rungsFor` stops a record's ladder at the first length the whole record fits
  // in, and the conclusion's own budget is 60 words, so a report shorter than that has no level 4,
  // 5 or 6 and the write door refuses a summary written by part on it. A fixture this file writes
  // parts to has to be a report with room for them.
  {
    id: 'b-one',
    type: 'text',
    heading: 'What the rig showed',
    text: 'Three of four printed mounts broke under load.' + ' The jig was reset between pulls and the load cell was zeroed each time, so the numbers are comparable with one another. The fourth mount held to twenty-two newtons and had been printed at half the layer height, which was a mistake in the print queue rather than a decision anybody made, and nobody has repeated it since. One sample is not a finding and the rig is not the question here.',
  },
  { id: 'b-two', type: 'text', heading: 'What nobody measured', text: 'The bolt circle of the aluminium mount.' },
]

/** Runs of the report's own writing, so a test can ask whether any of it leaked into a short length. */
const THE_REPORTS_OWN_WORDS = ['Three of four printed mounts broke', 'The bolt circle of the aluminium mount']

const TITLE = 'What the bench said about the printed wrist mount in round eight'
const SUMMARY =
  'Three of the four printed wrist mounts broke below the load the handover trials need, so the aluminium ' +
  'version is the only one worth another run and nobody has measured its bolt circle yet.'
const LABEL = 'Bench, round eight'

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

/** The words stored under the two retired keys on the legacy report. Nothing may draw either. */
const RETIRED_TITLE_FORM = 'Every wave checked; half the plan never built'
const RETIRED_GIST =
  'A stored gist from before the columns were the levels, kept on disk exactly as it was written and drawn ' +
  'by nothing at all on any screen in this product.'

let app: LiveApp
let page: Page
/** The run the reports are filed in, so the ledger has a session record to link to. */
let session: string
let whole: string
let noSummary: string
let legacy: string

/** File a report as the writing agent, in the run above, and hand back its id. */
async function fileTheReport(title: string, summary: string | null): Promise<string> {
  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': WRITER,
      'x-mole-office-session': session,
    },
    body: JSON.stringify({
      kind: 'report',
      title,
      ...(summary === null ? {} : { summary }),
      data: { blocks: BLOCKS },
    }),
  })
  if (!made.ok) throw new Error(`seeding a report answered ${String(made.status)}: ${await made.text()}`)
  return ((await made.json()) as { record: { id: string } }).record.id
}

/** The newest revision of one record, which is what a stored form has to name. */
async function newestRevisionOf(recordId: string): Promise<{ seq: number; contentHash: string }> {
  const read = (await (
    await fetch(`${app.api}/api/records/${recordId}/revisions`, { headers: AS_A_PERSON })
  ).json()) as { revisions: { seq: number; contentHash: string }[] }
  const newest = [...read.revisions].sort((a, b) => b.seq - a.seq)[0]
  if (newest === undefined) throw new Error(`${recordId} has no revision to write a short form from`)
  return { seq: newest.seq, contentHash: newest.contentHash }
}

/** Write the label, and the parts where they are asked for, through the one route that takes them. */
async function writeTheForms(recordId: string, withParts: boolean): Promise<void> {
  const madeFrom = await newestRevisionOf(recordId)
  const wrote = await fetch(`${app.api}/api/records/${recordId}/short-forms`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': WRITER,
      'x-mole-office-session': session,
    },
    body: JSON.stringify({ madeFrom, forms: { label: LABEL, ...(withParts ? { parts: PARTS } : {}) } }),
  })
  if (!wrote.ok) throw new Error(`writing the forms answered ${String(wrote.status)}: ${await wrote.text()}`)
}

beforeAll(async () => {
  app = await liveApp({ name: 'own-title-and-summary', viewport: { width: 1440, height: 1200 } })
  page = app.page

  // THE WRITER MUST BE REGISTERED BEFORE IT WRITES: the records door refuses a write under an agent
  // id no registry row holds, and this file's whole fixture is the reports this agent files.
  const registered = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST',
    headers: AS_A_PERSON,
    body: JSON.stringify({ handle: WRITER, name: 'Report Writer' }),
  })
  if (!registered.ok) throw new Error(`registering the writer answered ${String(registered.status)}: ${await registered.text()}`)

  const ran = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_A_PERSON,
    body: JSON.stringify({
      kind: 'session',
      title: 'The run that filed the reports in this test',
      data: { state: 'running', runtime: 'claude-code' },
    }),
  })
  if (!ran.ok) throw new Error(`filing the session answered ${String(ran.status)}: ${await ran.text()}`)
  session = ((await ran.json()) as { record: { id: string } }).record.id

  whole = await fileTheReport(TITLE, SUMMARY)
  await writeTheForms(whole, true)

  noSummary = await fileTheReport('A report filed in a hurry with nothing under its name', null)
  await writeTheForms(noSummary, false)

  legacy = await fileTheReport(TITLE, SUMMARY)
  const forLegacy = await newestRevisionOf(legacy)
  // THE TWO RETIRED KEYS, WRITTEN STRAIGHT INTO THIS TEST'S OWN DATABASE FILE, because both write
  // doors refuse them now — which is the other half of this file. It is the shape three reports in
  // the live corpus were carrying on 3 September 2026, and the only way to stand one up.
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    const row = db.prepare('select data from records where id = ?').get(legacy) as { data: string }
    const data = JSON.parse(row.data) as Record<string, unknown>
    data['shortForms'] = {
      title: { text: RETIRED_TITLE_FORM, writtenBy: 'agent', madeFrom: forLegacy },
      gist: { text: RETIRED_GIST, writtenBy: 'agent', madeFrom: forLegacy },
    }
    db.prepare('update records set data = ? where id = ?').run(JSON.stringify(data), legacy)
  } finally {
    db.close()
  }
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

// ============================================================ what the body draws

/** What the report body says at one length, and the two things an instrument reads off it. */
interface Read {
  rung: Rung
  /** The words of the one form drawn above the report, as a person reads them. */
  form: string[]
  /** The stored path each of those lines came from — what `tools/zoom-sweep.mjs` reads. */
  drawnFrom: string[]
  /** The whole body as text, for asking what is NOT there. */
  words: string
  marks: string[]
  /** Whether the page drew the record's one-line summary above the body. */
  ledes: string[]
}

async function openAt(recordId: string, rung: Rung): Promise<Read> {
  await page.goto(`${app.site}/#/r/${recordId}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.evaluate(
    ([everywhere, here, length]) => {
      window.localStorage.setItem(everywhere as string, length as string)
      window.sessionStorage.removeItem(here as string)
    },
    [DETAIL_KEY_EVERYWHERE, detailKeyForHere('reportContent'), rung],
  )
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.sb-level', { timeout: 30_000 })
  const here = await page.evaluate(() => {
    const body = document.querySelector('.sb')
    if (body === null) throw new Error('the page drew no report body')
    return {
      form: [...body.querySelectorAll('.sb-open-line')].map((one) => ((one as HTMLElement).innerText ?? '').trim()),
      drawnFrom: [...body.querySelectorAll('.sb-open-line')].map((one) => one.getAttribute('data-drawn-from') ?? ''),
      words: ((body as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim(),
      marks: [...body.querySelectorAll('[data-summary]')].map((one) => one.getAttribute('data-summary') ?? ''),
      // THE WHOLE PAGE AND NOT THE BODY, because this asks about the paragraph ABOVE the body.
      ledes: [...document.querySelectorAll('.rp-lede')].map((one) => ((one as HTMLElement).innerText ?? '').trim()),
    }
  })
  return { rung, ...here }
}

describe('the report body draws the record’s own title and its own summary', () => {
  /**
   * THIS ASSERTED `draws the title at Level 2, byte for byte, and says it came from the title`
   * UNTIL 3 SEPTEMBER 2026: it stored Level 2 as the reader's choice, opened the report page, and
   * read the title out of the body.
   *
   * CRITERION A19 TOOK THAT ROUTE AWAY. A reader goes no lower than the conclusion, so a stored
   * Level 2 reads as Conclusion on a report page. Level 2 IS still the record's own title —
   * criterion A14b — and that is proved below by the reading, which is the channel that still
   * carries it, and by `GET /api/records/:id/short-forms`, which still reports seven positions.
   * What is asserted here now is what the page does with a choice a reader can no longer make.
   */
  it('reads a stored Level 2 as Conclusion, and draws the summary rather than the title', async () => {
    const here = await openAt(whole, 'title')
    expect(here.form).toEqual([SUMMARY])
    expect(here.drawnFrom, 'the line does not say it came from the record’s own summary').toEqual(['summary'])
    expect(here.words, 'the title was drawn as the body of the report').not.toContain(TITLE)
  }, 120_000)

  it('draws the summary at Conclusion, byte for byte, and says it came from the summary', async () => {
    const here = await openAt(whole, 'gist')
    expect(here.form).toEqual([SUMMARY])
    expect(here.drawnFrom, 'the line does not say it came from the record’s own summary').toEqual(['summary'])
    expect(here.marks).toContain('written')
  }, 120_000)

  it('draws nothing of the report itself at either length', async () => {
    // `title` STILL READS AS Conclusion HERE, criterion A19, so this walks the same position twice.
    // It is left as two because what it asks is that no stored choice at or below the conclusion
    // puts a run of the report itself on the page, and that is the claim either way.
    for (const rung of ['title', 'gist'] as const) {
      const here = await openAt(whole, rung)
      for (const said of THE_REPORTS_OWN_WORDS) {
        expect(here.words, `${rung} drew a run of the report itself`).not.toContain(said)
      }
    }
  }, 180_000)
})

describe('the report page never draws the summary above the body', () => {
  it('draws no summary paragraph under the heading, at any of the seven lengths', async () => {
    for (const rung of RUNGS) {
      const here = await openAt(whole, rung)
      expect(here.ledes, `${rung} drew the summary above the report`).toEqual([])
    }
  }, 300_000)

  it('draws the summary exactly once on the page at Conclusion, and it is in the body', async () => {
    const here = await openAt(whole, 'gist')
    const times = await page.evaluate(
      (words) => (document.body.innerText.split(words as string).length - 1),
      SUMMARY,
    )
    expect(times, 'the summary is drawn more than once on the page').toBe(1)
    expect(here.form).toEqual([SUMMARY])
  }, 120_000)

  it('still draws the one-line summary above the body on a record that is not a report', async () => {
    const made = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_A_PERSON,
      body: JSON.stringify({
        kind: 'note',
        title: 'A note whose one-line summary is still drawn under its name',
        summary: 'The header of every kind but a report still draws this line.',
        data: { body: 'Nothing here is a report.' },
      }),
    })
    if (!made.ok) throw new Error(`filing the note answered ${String(made.status)}: ${await made.text()}`)
    const id = ((await made.json()) as { record: { id: string } }).record.id
    await page.goto(`${app.site}/#/r/${id}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.waitForSelector('.rp-title', { timeout: 30_000 })
    const ledes = await page.evaluate(() =>
      [...document.querySelectorAll('.rp-lede')].map((one) => ((one as HTMLElement).innerText ?? '').trim()),
    )
    expect(ledes.join(' '), 'the header stopped drawing the summary on every kind, not just a report').toContain(
      'The header of every kind but a report still draws this line.',
    )
  }, 120_000)
})

describe('a report with no summary has no Conclusion and says so', () => {
  it('says the level has not been written, and draws nothing in its place', async () => {
    const here = await openAt(noSummary, 'gist')
    expect(here.words).toContain(`${levelLabel('gist')} has not been written for this report.`)
    expect(here.marks).toContain('missing')
    expect(here.form, 'something was drawn where the summary would have been').toEqual([])
    expect(here.words, 'the label stood in for the level nobody wrote').not.toContain(LABEL)
  }, 120_000)

  /**
   * THIS ASSERTED `still draws its own title at Level 2` UNTIL 3 SEPTEMBER 2026 — that a report with
   * no summary still had a Level 2 to fall back to on the page. Criterion A19 stops a reader at the
   * conclusion, so a stored Level 2 on this record reads as Conclusion, which nobody wrote, and the
   * body says so. The title is not drawn in its place: criterion A14a, nothing stands in for a
   * level that is not written.
   */
  it('reads a stored Level 2 as Conclusion, and says that level is not written', async () => {
    const here = await openAt(noSummary, 'title')
    expect(here.words).toContain(`${levelLabel('gist')} has not been written for this report.`)
    expect(here.marks).toContain('missing')
    expect(here.form, 'something was drawn where the summary would have been').toEqual([])
    expect(here.words, 'the title stood in for the level nobody wrote').not.toContain(
      'A report filed in a hurry with nothing under its name',
    )
  }, 120_000)
})

describe('a stored title form and a stored gist are on disk and nothing draws them', () => {
  /**
   * THIS ASSERTED `draws the record's own columns at Levels 2 and 3, not the stored forms` UNTIL
   * 3 SEPTEMBER 2026, reading the title out of the page at a stored Level 2. Criterion A19 reads a
   * stored Level 2 as Conclusion, so both stored choices now land on the record's own summary. What
   * this file is for is unchanged and is still asserted: neither retired form reaches the page.
   */
  it('draws the record’s own summary at both stored choices, and neither retired form', async () => {
    for (const rung of ['title', 'gist'] as const) {
      const here = await openAt(legacy, rung)
      expect(here.form, `the body at a stored ${rung}`).toEqual([SUMMARY])
      expect(here.words, `the retired title form was drawn at a stored ${rung}`).not.toContain(RETIRED_TITLE_FORM)
      expect(here.words, `the retired gist was drawn at a stored ${rung}`).not.toContain(RETIRED_GIST)
    }
  }, 180_000)

  it('leaves both stored forms exactly where they are on disk', async () => {
    const read = (await (
      await fetch(`${app.api}/api/records/${legacy}`, { headers: AS_A_PERSON })
    ).json()) as { record: { data: { shortForms?: Record<string, { text?: string }> } } }
    const held = read.record.data.shortForms ?? {}
    expect(held['title']?.text, 'the stored title form was deleted rather than left alone').toBe(RETIRED_TITLE_FORM)
    expect(held['gist']?.text, 'the stored gist was deleted rather than left alone').toBe(RETIRED_GIST)
  }, 60_000)
})

// ============================================================ the door

describe('the door refuses a new title form and a new gist by name', () => {
  it('refuses both at the short-forms route, and stores nothing', async () => {
    const madeFrom = await newestRevisionOf(whole)
    for (const key of ['title', 'gist'] as const) {
      const sent = await fetch(`${app.api}/api/records/${whole}/short-forms`, {
        method: 'POST',
        headers: AS_A_PERSON,
        body: JSON.stringify({ madeFrom, forms: { [key]: 'Words nobody may write into a retired key any more.' } }),
      })
      expect(sent.ok, `the route accepted a new ${key}`).toBe(false)
      const said = await sent.text()
      expect(said, `the refusal does not name ${key}`).toContain(`\`${key}\` is retired and cannot be written`)
    }
  }, 60_000)

  it('refuses both on a plain patch of the record, and stores nothing', async () => {
    const madeFrom = await newestRevisionOf(whole)
    for (const key of ['title', 'gist'] as const) {
      const sent = await fetch(`${app.api}/api/records/${whole}`, {
        method: 'PATCH',
        headers: AS_A_PERSON,
        body: JSON.stringify({
          dataPatch: { shortForms: { [key]: { text: 'Words written the other way round.', madeFrom, writtenBy: 'agent' } } },
        }),
      })
      expect(sent.ok, `a patch wrote a new ${key}`).toBe(false)
      expect(await sent.text(), `the refusal does not name ${key}`).toContain(
        `\`shortForms.${key}\` is retired and cannot be written`,
      )
    }
    const read = (await (
      await fetch(`${app.api}/api/records/${whole}`, { headers: AS_A_PERSON })
    ).json()) as { record: { data: { shortForms?: Record<string, unknown> } } }
    expect(Object.keys(read.record.data.shortForms ?? {}).sort()).toEqual(['label', 'parts'])
  }, 60_000)

  it('refuses neither the title nor the summary for its length', async () => {
    const overTitle = Array.from({ length: SHORT_FORM_SPECS.title.maxWords + 6 }, (_, n) => `word${String(n)}`).join(' ')
    const overSummary = Array.from({ length: SHORT_FORM_SPECS.gist.maxWords + 20 }, (_, n) => `word${String(n)}`).join(' ')
    const sent = await fetch(`${app.api}/api/records/${noSummary}`, {
      method: 'PATCH',
      headers: AS_A_PERSON,
      body: JSON.stringify({ title: overTitle, summary: overSummary }),
    })
    expect(sent.ok, `a title of ${String(SHORT_FORM_SPECS.title.maxWords + 6)} words was refused: ${await sent.clone().text()}`).toBe(true)
    const read = (await (
      await fetch(`${app.api}/api/records/${noSummary}`, { headers: AS_A_PERSON })
    ).json()) as { record: { title: string; summary: string | null } }
    expect(read.record.title).toBe(overTitle)
    expect(read.record.summary).toBe(overSummary)
    // PUT BACK, because the reports above are read again by the tests that follow this one.
    await fetch(`${app.api}/api/records/${noSummary}`, {
      method: 'PATCH',
      headers: AS_A_PERSON,
      body: JSON.stringify({ title: 'A report filed in a hurry with nothing under its name', summary: null }),
    })
  }, 60_000)
})

// ============================================================ what the reading says

describe('the reading says levels 2 and 3 are the record’s own words', () => {
  it('names the two columns as the source, with the words in them', async () => {
    const read = (await (
      await fetch(`${app.api}/api/records/${whole}/short-forms`, { headers: AS_A_PERSON })
    ).json()) as { levels: { rung: string; from: string | null; text: string | null; state: string }[] }
    const two = read.levels.find((one) => one.rung === 'title')
    const three = read.levels.find((one) => one.rung === 'gist')
    expect(two?.from).toBe('title')
    expect(two?.text).toBe(TITLE)
    expect(two?.state).toBe('current')
    expect(three?.from).toBe('summary')
    expect(three?.text).toBe(SUMMARY)
    expect(three?.state).toBe('current')
  }, 60_000)

  it('names who last changed each of them, and the run they were changed in', async () => {
    const read = (await (
      await fetch(`${app.api}/api/records/${whole}/short-forms`, { headers: AS_A_PERSON })
    ).json()) as { levels: { rung: string; by: string | null; at: string | null; session: string | null }[] }
    for (const rung of ['title', 'gist'] as const) {
      const here = read.levels.find((one) => one.rung === rung)
      expect(here?.by, `${rung} names nobody`).toBe(WRITER)
      expect(here?.at, `${rung} names no moment`).not.toBeNull()
      expect(here?.session, `${rung} does not link to the run it was written in`).toBe(session)
    }
  }, 60_000)

  it('says both stand for the whole report', async () => {
    const read = (await (
      await fetch(`${app.api}/api/records/${whole}/short-forms`, { headers: AS_A_PERSON })
    ).json()) as { levels: { rung: string; standsFor: { says: string } | null }[] }
    for (const rung of ['title', 'gist'] as const) {
      const here = read.levels.find((one) => one.rung === rung)
      expect(here?.standsFor?.says, `${rung}`).toBe('Stands for the whole report.')
    }
  }, 60_000)

  it('stamps nothing on the record: the writer is read from the ledger', async () => {
    const read = (await (
      await fetch(`${app.api}/api/records/${whole}`, { headers: AS_A_PERSON })
    ).json()) as { record: { data: Record<string, unknown> } }
    // THE RECORD CARRIES ONLY WHAT SOMEBODY WROTE INTO IT. A `by` or a `session` stamped beside the
    // title would be a second copy of a fact the revision ledger already holds.
    expect(Object.keys(read.record.data).sort()).toEqual(['blocks', 'shortForms'])
  }, 60_000)

  it('hands a list the summary when it asks for one line’s worth', async () => {
    const rows = (await (
      await fetch(`${app.api}/api/short-forms/rows`, {
        method: 'POST',
        headers: AS_A_PERSON,
        body: JSON.stringify({ recordIds: [whole], level: 'gist' }),
      })
    ).json()) as { rows: { recordId: string; text: string | null }[] }
    expect(rows.rows[0]?.text, 'a list asking for the conclusion was handed nothing').toBe(SUMMARY)
  }, 60_000)
})

// ============================================================ pointing at the two lengths

/** Everything the composer says about the thing that was pressed. */
interface Said {
  chip: string
  standsFor: string[]
  wrote: string[]
  links: string[]
}

async function rightClickTheFormAt(recordId: string, rung: Rung, regionId: string): Promise<Said> {
  await openAt(recordId, rung)
  const where = `[data-target="${targetAttributeValue({ kind: 'region', recordId, regionId })}"]`
  await page.locator(where).first().waitFor({ timeout: 30_000 })
  await page.locator(where).first().scrollIntoViewIfNeeded()
  await page.locator(where).first().click({ button: 'right' })
  await page.locator('.px-talk').first().waitFor({ timeout: 15_000 })
  await sleep(1200)
  return page.evaluate(() => {
    const talk = [...document.querySelectorAll('.px-talk')].find(
      (one) => one.getAttribute('data-target') === 'uiSurface/composer',
    )
    if (talk === undefined) return { chip: '', standsFor: [], wrote: [], links: [] }
    return {
      chip: ((talk.querySelector('.px-talk-quote') as HTMLElement | null)?.innerText ?? '').replace(/\s+/g, ' ').trim(),
      standsFor: [...talk.querySelectorAll('.px-talk-stands .px-talk-said')].map((e) => (e.textContent ?? '').trim()),
      wrote: [...talk.querySelectorAll('.px-talk-stands .px-talk-wrote')].map((e) => (e.textContent ?? '').trim()),
      links: [...talk.querySelectorAll('.px-talk-stands .px-talk-wrote a')].map((e) => e.getAttribute('href') ?? ''),
    }
  })
}

/**
 * ONE LENGTH IS RIGHT-CLICKED HERE AND IT WAS TWO UNTIL 3 SEPTEMBER 2026.
 *
 * THE CASE THAT WENT was `names the title, standing for the whole report, with the run linked`. It
 * stored Level 2 as the reader's choice, right-clicked the title line in the report body, and
 * asserted the composer named the title, said it stood for the whole report, named its writer and
 * linked the run. Criterion A19 stops a reader at the conclusion, so a report page never draws that
 * line and there is nothing on it to right-click.
 *
 * NOTHING IS LEFT UNPROVED BY ITS GOING. The mechanism it measured — the composer naming a
 * whole-record form, saying what it stands for, naming who wrote it and linking that run — is the
 * same code path at every whole-record length, and the case below measures it at the one length a
 * reader reaches. The title's own words are still proved: by the reading, above, and by
 * `GET /api/records/:id/short-forms`, which still reports seven positions.
 */
describe('right-clicking the conclusion names it and says who wrote it', () => {
  it('names the conclusion, standing for the whole report, with the run linked', async () => {
    const said = await rightClickTheFormAt(whole, 'gist', sectionRegionId(SUMMARY_LINE_KEY))
    expect(said.chip.toLowerCase(), `the chip read: ${said.chip}`).toContain(SHORT_FORM_SPECS.gist.noun)
    expect(said.standsFor).toContain('Stands for the whole report.')
    expect(said.wrote.join(' '), 'the composer named nobody').toContain(WRITER)
    expect(said.links, 'the composer drew no link at all').toHaveLength(1)
    expect(said.links[0] ?? '', 'the composer did not link to the run').toContain(recordPath(session))
  }, 120_000)
})
