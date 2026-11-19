// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW PANE IS OPENED, IN A BROWSER, AND NO TWO PARTS OF ONE RECORD READ ALIKE IN IT.
 *
 * ---------------------------------------------------------------------------------------
 * THE CRITERION THIS GUARDS, AND WHY THE GUARD THAT EXISTED WAS NOT ONE
 * ---------------------------------------------------------------------------------------
 *
 * D-R1 in design/problem-03/WHAT-A-READER-MUST-BE-ABLE-TO-READ.md, raised on 2 September 2026 to
 * the standard E-R2 already sets: *over every part of one record, no two of the pane's where
 * sentences are the same string.*
 *
 * It used to ask only that EIGHT PLACES OF EIGHT DIFFERENT KINDS differ — a paragraph, a table, a
 * headed block, three declared sections, two short forms — and the guard written to it said so in
 * its own header: *"IT DOES NOT CLAIM that two headed blocks are told apart from each other."* The
 * owner's own acceptance is a distinctness test and always was: right-click five different sections
 * of one Module, and if all five come back the same it failed.
 *
 * MEASURED IN CHROMIUM AGAINST A COPY OF THE OWNER'S OWN CORPUS ON 2 SEPTEMBER 2026, on report
 * `OOOt4Kouc5dT`: seventeen comments on sixteen different parts drew THIRTEEN different sentences.
 * Two paragraphs both read *the paragraph of the report "…"*; two rows of one table both read *the
 * row of a table of the report "…"*; two cells of one row both read *the cell of a table of the
 * report "…"*. After the repair the same seventeen comments drew sixteen — one for each part, and
 * the only pair alike were the two comments left on the same part.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE OPENS THE PANE INSTEAD OF RENDERING IT
 * ---------------------------------------------------------------------------------------
 *
 * D-R2, raised the same day, for the reason F-R1 gives four sections down that file.
 * `tests/the-review-pane-names-the-place.test.ts` renders `PaneBody` with `renderToStaticMarkup`
 * and hands it `showing: {state:'none'} as never` — a value cast past the type that describes it,
 * because the real one is only made when the pane is open. That is a component handed a world the
 * product does not put it in, which is the fault this cluster keeps finding.
 *
 * So this opens the product: a real record page, real comments written through the API, the review
 * column opened the way the column's own store opens it, and the sentences read off the screen.
 *
 * THE PARTS ARE READ OFF THE DERIVATION AND NOT SPELLED HERE. `recordRegionsOf` is the tree the
 * page draws from and the tree the write door validates against; a region id typed into this file
 * would be a second spelling free to drift, and it would fail silently — the comment would be
 * written, the pane would draw a row, and the row would be about a part nobody can see.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { setTheReviewTraysList } from './the-review-trays-list.ts'
import { recordRegionsOf, sectionRegionId, shortFormRegionId, type Region } from '../src/shared/regions.ts'
import { HISTORY_KEY, OPEN_AROUND_KEY, SUMMARY_LINE_KEY } from '../src/shared/sections.ts'

const HUMAN = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

const TITLE = 'What the bench said about the wrist mount'
/** The record's own summary, which IS reading length 3 since 3 September 2026 (criterion A14b). */
const SUMMARY =
  'Three of the four printed wrist mounts broke below the load the handover trials need, so the ' +
  'aluminium version is now the only one worth testing at all.'

/**
 * ONE REPORT WITH THE PAIRS THE OLD CRITERION COULD NOT SEE.
 *
 * Two paragraphs of one block, two headed blocks, and a table whose first row holds two cells: each
 * pair is two parts of one kind, which is the reading the owner's Act 4 fails on when they come
 * back the same.
 */
const BLOCKS = [
  {
    id: 'b-para',
    type: 'text',
    text:
      'The mount tolerance is 0.2 mm and nobody measured it.\n\n' +
      'The bolt circle was never measured either, on any of the four.',
  },
  { id: 'b-one', type: 'text', heading: 'What the rig showed', text: 'Three of four printed mounts broke.' },
  { id: 'b-two', type: 'text', heading: 'What nobody has measured', text: 'The load at which the fourth broke.' },
  {
    id: 'b-tab',
    type: 'table',
    columns: [{ label: 'Run' }, { label: 'Broke' }],
    // BOTH ROWS OPEN WITH `4`, SO TWO CELLS OF THIS RECORD HOLD THE SAME WORD. That is the case
    // E-R2 names — a cell reading `3` that another cell also reads — and without it the rule has
    // nothing to climb for and the guard would assert a behaviour the fixture never asked for.
    rows: [{ cells: ['4', 'three'] }, { cells: ['4', 'one'] }],
  },
]

let app: LiveApp
let page: Page
let reportId: string
/** Every part a comment was left on, and what the pane must not say twice about them. */
let places: { what: string; regionId: string }[] = []
/** The review the comments were collected into, so a case can read the server's own answer back. */
let reviewId: string

/** Every region of the record, in the order a reader meets them. */
function everyPart(root: Region): Region[] {
  const all: Region[] = []
  const walk = (one: Region): void => {
    all.push(one)
    for (const child of one.children) walk(child)
  }
  walk(root)
  return all
}

beforeAll(async () => {
  app = await liveApp({ name: 'pane-names-which-part', viewport: { width: 1440, height: 1200 } })
  page = app.page

  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: HUMAN,
    // AND ITS OWN SUMMARY, WHICH IS READING LENGTH 3 SINCE 3 SEPTEMBER 2026, criterion A14b. It was
    // a `gist` written through the short-forms route below; that key is retired and the words are
    // the record's own. `section.summaryLine` is the part a reader points at, and it is on the list
    // of places below.
    body: JSON.stringify({ kind: 'report', title: TITLE, summary: SUMMARY, data: { blocks: BLOCKS } }),
  })
  if (!made.ok) throw new Error(`seeding the report answered ${String(made.status)}: ${await made.text()}`)
  reportId = ((await made.json()) as { record: { id: string } }).record.id

  // THE ONE STORED SHORT FORM, THROUGH THE DOOR THAT WRITES IT. It is a part of the record whose
  // name comes from neither its words nor its role, so it belongs in the list of places below.
  const revisions = (await (await fetch(`${app.api}/api/records/${reportId}/revisions`, { headers: HUMAN })).json()) as {
    revisions: { seq: number; contentHash: string }[]
  }
  const newest = [...revisions.revisions].sort((a, b) => b.seq - a.seq)[0]
  if (newest === undefined) throw new Error('the seeded report has no revision to write a short form from')
  const wrote = await fetch(`${app.api}/api/records/${reportId}/short-forms`, {
    method: 'POST',
    headers: HUMAN,
    body: JSON.stringify({
      madeFrom: { seq: newest.seq, contentHash: newest.contentHash },
      forms: { label: 'Bench, round eight' },
    }),
  })
  if (!wrote.ok) throw new Error(`writing the short forms answered ${String(wrote.status)}: ${await wrote.text()}`)

  // A LINK, SO THE RECORD HAS A RELATION SECTION. Those are the sections whose key is a phrase
  // somebody's link was read under rather than a title any kind declares.
  const other = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: HUMAN,
    body: JSON.stringify({ kind: 'note', title: 'The rig log for the wrist mount runs' }),
  })
  if (!other.ok) throw new Error(`seeding the linked note answered ${String(other.status)}`)
  const otherId = ((await other.json()) as { record: { id: string } }).record.id
  const linked = await fetch(`${app.api}/api/links`, {
    method: 'POST',
    headers: HUMAN,
    body: JSON.stringify({ fromId: reportId, toId: otherId, type: 'about' }),
  })
  if (!linked.ok) throw new Error(`linking answered ${String(linked.status)}: ${await linked.text()}`)

  // WHICH PARTS TO COMMENT ON, READ OFF THE DERIVATION THE PAGE AND THE DOOR BOTH USE.
  const read = (await (await fetch(`${app.api}/api/records/${reportId}`, { headers: HUMAN })).json()) as {
    record: { kind: string; data: Record<string, unknown>; title: string; summary: string | null }
    links?: { label: string }[]
  }
  const root = recordRegionsOf({
    kind: read.record.kind as never,
    data: read.record.data,
    title: read.record.title,
    summary: read.record.summary,
    relations: (read.links ?? []).map((one) => one.label),
  })
  const all = everyPart(root)
  const of = (role: string): Region[] => all.filter((one) => one.role === role && one.declared !== true)
  const named = (what: string, region: Region | undefined): void => {
    if (region === undefined) throw new Error(`the seeded report has no ${what} to leave a comment on`)
    places.push({ what, regionId: region.id })
  }
  const paragraphs = of('paragraph')
  named('the first paragraph', paragraphs[0])
  named('the second paragraph', paragraphs[1])
  const blocks = of('section')
  named('the first headed block', blocks[0])
  named('the second headed block', blocks[1])
  named('the table', of('table')[0])
  const rows = of('tableRow')
  named('the first row of the table', rows[0])
  named('the second row of the table', rows[1])
  const cells = (rows[0]?.children ?? []) as Region[]
  named('the first cell of that row', cells[0])
  named('the second cell of that row', cells[1])
  named('the whole record', all.find((one) => one.role === 'recordRoot'))
  named('the body of the report', all.find((one) => one.role === 'reportBody'))
  places.push(
    { what: 'the openAround section', regionId: sectionRegionId(OPEN_AROUND_KEY) },
    { what: 'the history section', regionId: sectionRegionId(HISTORY_KEY) },
    // THE SHORTER FORMS PANEL IS NOT ON THIS LIST ANY MORE (problem zIdb10n9vao2). No page has drawn
    // it since 2 September 2026, so a comment left on it could not be found or answered, and the
    // write door refuses one. tests/a-comment-on-a-panel-no-page-draws-is-refused.test.ts holds that.
    { what: 'the about relation', regionId: sectionRegionId('about') },
    { what: 'the stored label', regionId: shortFormRegionId('label') },
    // THE RECORD'S OWN SUMMARY, which is reading length 3 since 3 September 2026. It was the stored
    // gist, `shortFormRegionId('gist')`; that key is retired and nothing reads it back, so a
    // comment anchored there would name a part the tree no longer holds.
    { what: 'the record’s own summary', regionId: sectionRegionId(SUMMARY_LINE_KEY) },
  )

  const started = await fetch(`${app.api}/api/reviews`, {
    method: 'POST',
    headers: HUMAN,
    body: JSON.stringify({ entry: { target: { kind: 'record', recordId: reportId, workspaceId: 'default' } } }),
  })
  if (!started.ok) throw new Error(`starting the review answered ${String(started.status)}: ${await started.text()}`)
  reviewId = ((await started.json()) as { review: { id: string } }).review.id

  for (const place of places) {
    const written = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: HUMAN,
      body: JSON.stringify({
        kind: 'annotation',
        title: `on ${place.what}`,
        data: {
          body: `A remark about ${place.what}.`,
          context: { target: { kind: 'region', recordId: reportId, regionId: place.regionId } },
        },
      }),
    })
    if (!written.ok) {
      throw new Error(`commenting on ${place.what} (${place.regionId}) answered ${String(written.status)}: ${await written.text()}`)
    }
  }

  // THE COLUMN, OPENED THE WAY THE COLUMN'S OWN STORE OPENS IT. The five parts are open state,
  // shown review and project, then collecting review and project.
  await page.goto(`${app.site}/#/r/${reportId}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.evaluate(([id]) => {
    window.localStorage.setItem('mole-office.review', `open|${String(id)}|default||`)
  }, [reviewId])
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  // IN THE TRAY THE ROWS ARE BEHIND "More about this review" while the review collects, so it is
  // opened with a press, as a reader opens it, inside the list Show comments opens.
  await setTheReviewTraysList(page, 'open')
  const more = page.locator('details.px-b-more')
  await more.waitFor({ timeout: 30_000 })
  if (!(await more.evaluate((el) => (el as HTMLDetailsElement).open))) await more.locator('summary').click()
  await page.locator('.px-rev-item').first().waitFor({ timeout: 30_000 })
  await new Promise((r) => setTimeout(r, 1500))
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Every *where* sentence the OPEN pane drew, in the order it drew them. */
async function whereSentences(): Promise<string[]> {
  return page.evaluate((title) => {
    const out: string[] = []
    for (const one of document.querySelectorAll('.px-rev-where')) {
      const text = (one.textContent ?? '').replace(/\s+/g, ' ').trim()
      // A ROW DRAWS ITS DATE IN THE SAME CLASS. The place sentence is the one naming the report.
      if (text.includes(title as string)) out.push(text)
    }
    return out
  }, TITLE)
}

describe('the pane, opened, names which part and not what kind of part', () => {
  it('drew one row for every comment', async () => {
    expect(await whereSentences(), 'the pane drew a different number of place sentences than there are comments').toHaveLength(
      places.length,
    )
  })

  it('never says the same thing about two different parts', async () => {
    const said = await whereSentences()
    const counts = new Map<string, number>()
    for (const one of said) counts.set(one, (counts.get(one) ?? 0) + 1)
    const alike = [...counts].filter(([, n]) => n > 1).map(([one, n]) => `${String(n)}x ${one}`)
    expect(alike, `two different parts of one record read alike in the pane: ${alike.join(' | ')}`).toHaveLength(0)
    expect(new Set(said).size).toBe(places.length)
  })

  it('quotes a part by the words it holds, so a reader can get from the name to the part', async () => {
    const said = await whereSentences()
    expect(
      said.some((one) => one.startsWith('the paragraph “The mount tolerance is 0.2 mm and nobody measured it.”')),
      `no row named the first paragraph by its own words. What was drawn: ${said.join(' | ')}`,
    ).toBe(true)
    expect(
      said.some((one) => one.startsWith('the section “What the rig showed”')),
      'no row named a headed block by the heading its author wrote',
    ).toBe(true)
    expect(
      said.some((one) => one.startsWith('the section “What nobody has measured”')),
      'the two headed blocks were not told apart',
    ).toBe(true)
  })

  it('says where a part sits when its own words do not tell it from another', async () => {
    const said = await whereSentences()
    // The cells of one row read `4` and `three`; the second is told from every other cell in the
    // record by the row it is in, and only by as much of that as it takes.
    expect(
      said.some((one) => one.startsWith('the cell of a table “4” in the row of a table ')),
      `the two cells reading "4" were not told apart by the rows they sit in. What was drawn: ${said.join(' | ')}`,
    ).toBe(true)
  })

  it('says the two wholes as wholes, in English, rather than putting the record inside itself', async () => {
    const said = await whereSentences()
    expect(said, 'the record root did not read as the whole of the record').toContain(`the whole of the report “${TITLE}”`)
    expect(said, 'the report body did not read as the body of the report').toContain(`the body of the report “${TITLE}”`)
    for (const one of said) {
      expect(one, 'a row said "of the report" twice over in one sentence').not.toContain('the report of the report')
    }
  })

  it('names a declared section by its title and a relation list by its phrase, not as a titled section', async () => {
    const said = await whereSentences()
    expect(
      said.some((one) => one.startsWith('the section “What is still open around this”')),
      'a declared section was not named by its declared title',
    ).toBe(true)
    expect(
      said.some((one) => one.startsWith('the links read as “about”')),
      `a relation list was not named by the phrase its rows are read under. What was drawn: ${said.join(' | ')}`,
    ).toBe(true)
    for (const one of said) {
      expect(one, 'a relation list was drawn as a section with a title, which is a heading no page draws').not.toContain(
        'the section “about”',
      )
    }
  })

  it('puts the sentence together the one way both surfaces put it together', async () => {
    const said = await whereSentences()
    for (const one of said) {
      // Curly quotation marks around the record's title and the preposition *in* — the record
      // page's assembly, which the pane used to spell with straight quotes and *of*.
      expect(one, `a row still spelled the holder with straight quotes: ${one}`).not.toContain(`"${TITLE}"`)
      expect(one).toContain(`the report “${TITLE}”`)
    }
  })

  it('keeps the region id in what the server said, so Developer detail still shows which part', async () => {
    // THE ID IS IN THE SERVER'S SENTENCE AND THE PANE TAKES IT OUT FOR A READER. Taking it out on
    // the server would take it off both, and the switch to Developer detail would have nothing to
    // show. This reads the review back the way the pane reads it.
    const detail = await page.evaluate(async ([api, review, ownerId]) => {
      const answer = await fetch(`${String(api)}/api/reviews/${String(review)}`, {
        headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': String(ownerId) },
      })
      return (await answer.text())
    }, [app.api, reviewId, THE_TEST_OFFICES_OWNER.id])
    for (const place of places) {
      expect(detail, `the server's sentence lost the id of ${place.what}`).toContain(place.regionId)
    }
  })
})
