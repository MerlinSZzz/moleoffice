// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLANS PAGES: THE EMPTY SCREEN, THE GRID, THE DOCUMENT, THE TABLE, AND THE ADDRESSES.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THESE TESTS ARE ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * Four things can silently stop being true on these pages, and each has a test here:
 *
 *   1. THE EMPTY SCREEN GROWS. A stranger's first screen is a heading, one sentence and one
 *      button. Every panel, count and helpful explanation added to it is a small loss and none of
 *      them would fail anything.
 *   2. THE PAGE ASKS FOR HOURS. The two planning surfaces are told apart by what is missing from
 *      each, so an hours box on the plans page destroys the distinction with nothing failing.
 *   3. THE DISAGREEMENT IS REPAIRED. Filing a line seeded the record's title once; afterwards the
 *      line's words and the record's title are two facts. A page that shows only one of them has
 *      quietly picked a winner.
 *   4. A TOTAL STOPS SAYING WHAT IT COULD NOT COUNT. "180h over 4 of 12 rows" is an honest number;
 *      "180h" alone is a claim about the eight rows nobody has sized.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT LOOKS LIKE THIS
 * ---------------------------------------------------------------------------------------
 *
 * The runner's environment is `node`: no DOM. So, as tests/panels-follow.test.ts does it, the
 * components are rendered to static markup and `fetch` is pointed at a real Fastify app through
 * `app.inject`. Every reply these pages draw is the reply the server really wrote — nothing here
 * is a hand-made fixture of a server shape.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT CHANGED IN THE TEST AUDIT OF 3 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * THREE OF THE PAGE CASES RESTED ON INTERNAL CLASS NAMES. They asked whether the markup held
 * `pw-box`, `pt-table` or `pd-heading` — names a reader never meets — so renaming one of them
 * turned this file red while changing nothing on screen, and a page could have drawn the wrong
 * thing under the right name and stayed green. Each is now asked as a question about the screen:
 * the writing box by the name a screen reader reads out, the table by its own column headings, and
 * which setting is showing by the press that says it is chosen.
 *
 * ONE OF THEM COULD NOT FAIL AT ALL. `pd-heading` belonged to `PlanDoc`, the plan's Markdown drawn
 * as it reads. That component and its test file were deleted, so the string is in no source file in
 * this repository and the assertion was checking that a deleted thing is absent. The header used to
 * say `tests/plan-doc.test.ts` still held the component; it does not exist. What is asked instead
 * is that the writing view draws the document's words nowhere but in the box.
 *
 * AND THE TABLE IS NOW GIVEN THE PLAN IT IS DRAWING. `PlanTable` takes `plan`, and this file was
 * the last caller that did not pass it — the prop's own comment in
 * src/web/components/plans/PlanTable.tsx says so by name. A table with no plan cannot offer to
 * write the first item into a plan that has none, which is the emptiest shelf in the product.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Fastify, { type FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb, THIS_TEST_ONLY_DRAWS_THE_TABLE } from './helpers.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { governancePath, parseRoute, planPath, plansPath } from '../src/web/components/router.tsx'
import type { PlansReply, PlanBlocksReply, PlanReviewsReply, PlanSinceReadReply } from '../src/web/api.ts'

type WebApi = typeof import('../src/web/api.ts')
type PlansPageModule = typeof import('../src/web/pages/plans/PlansPage.tsx')
type OnePlanModule = typeof import('../src/web/pages/plans/OnePlanPage.tsx')
type PlanTableModule = typeof import('../src/web/components/plans/PlanTable.tsx')

let db: TestDb
let app: FastifyInstance
let webApi: WebApi
let plansPage: PlansPageModule
let onePlan: OnePlanModule
let planTable: PlanTableModule

/** The plan every test below reads, and the line that was filed as work. */
let planId: string
let filedLineId: string

const AS_HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

/** A document with one of everything the reader can meet, including one thing it cannot read. */
const BODY = [
  '# Week of 17 August',
  '',
  'Get the plan pages in front of the owner.',
  '',
  '- Build the plans grid',
  '- [x] Read the brief end to end',
  '- [ ] Measure at 390',
  '',
  '| What | Who |',
  '| --- | --- |',
  '| Tray clamp report | ESA |',
  '',
  '| this table | has no dashes under it |',
  '| so it prints | exactly as typed |',
].join('\n')

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }

  db = await freshDb()

  const { planRoutes } = await import('../src/server/api/plans.ts')
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')

  app = Fastify()
  installErrorHandling(app)
  await app.register(planRoutes, { prefix: '/api' })
  await app.register(recordRoutes, { prefix: '/api' })
  await app.ready()

  ;(globalThis as unknown as { fetch: unknown }).fetch = async (
    input: unknown,
    init: { method?: string; headers?: HeadersInit; body?: string } = {},
  ) => {
    const res = await app.inject({
      method: (init.method ?? 'GET') as 'GET',
      url: String(input),
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      ...(init.body === undefined ? {} : { payload: init.body }),
    })
    return {
      ok: res.statusCode >= 200 && res.statusCode < 300,
      status: res.statusCode,
      text: async () => res.body,
    }
  }

  webApi = await import('../src/web/api.ts')
  webApi.setActor({ ...AS_HUMAN })
  plansPage = await import('../src/web/pages/plans/PlansPage.tsx')
  onePlan = await import('../src/web/pages/plans/OnePlanPage.tsx')
  planTable = await import('../src/web/components/plans/PlanTable.tsx')

  const written = await webApi.api.newPlan('August plans', BODY)
  planId = written.plan.id
  filedLineId = written.lines.find((line) => line.text === '- Build the plans grid')!.id

  // THE CROSSING: one line becomes one record, in one transaction, because somebody pressed. The
  // record's title is seeded from the line's words and then goes its own way.
  const filed = await webApi.api.fileLineAsWork(planId, filedLineId, {
    kind: 'task',
    workspaceId: 'default',
  })
  await webApi.api.updateRecord(filed.recordId, {
    title: 'Plans grid at 1440 and 390',
    dataPatch: { state: 'doing', effort_hours: 6 },
  })
})

afterAll(async () => {
  await app.close()
  db.close()
})

/** The markup with the hoisted style blocks removed, so a class name in the CSS is not evidence. */
function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/** The words a reader sees, with the tags taken out, so an assertion is about the screen. */
function words(el: React.ReactElement): string {
  return wordsOf(body(el))
}

/** The same, starting from markup that has already been rendered once. */
function wordsOf(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

// ============================================================================ the addresses

describe('the addresses this round adds', () => {
  it('parses the plans list, one plan, and the governance queue', () => {
    expect(parseRoute('#/plans')).toEqual({ name: 'plans' })
    expect(parseRoute('#/plans/abc123')).toEqual({ name: 'onePlan', id: 'abc123' })
    expect(parseRoute('#/governance')).toEqual({ name: 'governance' })
    // The old address still lands on the queue that absorbed it, so nobody's bookmark breaks.
    expect(parseRoute('#/decisions')).toEqual({ name: 'governance' })
  })

  /**
   * THE BUILDERS AND THE PARSER ARE ONE ANSWER. Every link to a plan is built by `planPath`, so a
   * plan whose id needs encoding gets the same address from both ends. A page that wrote the
   * address by hand would agree right up to the first id that needs escaping.
   */
  it('builds addresses that parse back to the route they were built from', () => {
    expect(plansPath()).toBe('/plans')
    expect(governancePath()).toBe('/governance')
    for (const id of ['abc123', 'a b', 'a/b', 'ünïcødé']) {
      expect(parseRoute(`#${planPath(id)}`), id).toEqual({ name: 'onePlan', id })
      expect(parseRoute(`#${planPath(id, { edit: true })}`), id).toEqual({ name: 'onePlan', id, edit: true })
    }
  })

  /**
   * WHETHER YOU ARE READING OR WRITING IS IN THE ADDRESS, on exactly three routes.
   *
   * It round trips: an address with the word parses to a route that says so, and one without it
   * parses to a route that does not — so Back leaves editing and a screenshot can name the state.
   */
  it('carries the editing word on the plan, the schedule and the record, and nowhere else', () => {
    expect(parseRoute('#/plans/abc123/edit')).toEqual({ name: 'onePlan', id: 'abc123', edit: true })
    expect(parseRoute('#/r/abc123/edit')).toEqual({ name: 'record', id: 'abc123', edit: true })
    expect(parseRoute('#/plan/edit')).toEqual({ name: 'plan', edit: true })
    expect(parseRoute('#/plan/2026-W34/edit')).toEqual({ name: 'plan', period: '2026-W34', edit: true })
    expect(parseRoute('#/plan/today/edit')).toEqual({ name: 'plan', today: true, edit: true })

    // Reading is what an address with no such word means, and every fresh visit is reading.
    expect(parseRoute('#/plans/abc123')).toEqual({ name: 'onePlan', id: 'abc123' })
    expect(parseRoute('#/r/abc123')).toEqual({ name: 'record', id: 'abc123' })

    // Every other address refuses it rather than ignoring it. An address that quietly drops a
    // segment is how a broken link goes on working for months.
    for (const address of ['#/records/edit', '#/plans/edit', '#/sessions/edit', '#/pipeline/abc/edit', '#/edit']) {
      expect(parseRoute(address).name, address).toBe('unknown')
    }
  })
})

// ============================================================================ the plans page

describe('the plans page', () => {
  /**
   * THE SCREEN EVERY STRANGER SEES FIRST: a heading, one sentence, one button, and no fourth
   * thing. It is checked by what is NOT on it, because every failure of this screen is an
   * addition.
   */
  it('shows the short mark when nothing is written', async () => {
    const empty: PlansReply = { plans: [], closed: 0, note: 'ignored' }
    const said = words(h(plansPage.PlansGrid, { reply: empty }))
    expect(said).toBe(`${sayInEnglish('absence.mark')} ${sayInEnglish('g8.shelf.noOpenPlan')}`)
  })

  it('draws a card carrying the name, the opening lines and the one number', async () => {
    const reply = await webApi.api.plans('open')
    const said = words(h(plansPage.PlansGrid, { reply }))
    expect(said).toContain('August plans')
    // THE WORDS, NOT THE SOURCE. The card used to print the stored characters, so a row read
    // "# big title Do this {size: large}" — the heading mark and the storage syntax shown raw to
    // somebody scanning four plans. Finding 33 of the language audit, 19 August 2026.
    expect(said).toContain('Week of 17 August')
    expect(said).not.toContain('# Week of 17 August')
    // ONE LINE OF THIS PLAN IS FILED AS WORK AND NOTHING HAS GIVEN IT HOURS. The card used to say
    // "N lines with no time on any week", which counted every unfiled line as well — the heading and
    // the blank lines in BODY among them — so the number read as work still to schedule and was not.
    expect(said).toContain(sayInEnglish('g8.shelf.ofTrackedTimeOnAWeek', { scheduled: 0, n: 1 }))
    expect(said).not.toContain('with no time on any week')
    // "Last written" became "Written": the stamp already says when. Finding 33, 19 August 2026.
    expect(said).toContain('Written')
  })

  /**
   * NOTHING ON THIS PAGE ASKS FOR HOURS, and that absence is what teaches a stranger the
   * difference between this page and the schedule. It is also the rule about reading and writing:
   * a page you are reading has no box and no dropdown on it.
   */
  it('has no box, no dropdown and no hours field on it', async () => {
    const reply = await webApi.api.plans('open')
    const markup = body(h(plansPage.PlansGrid, { reply }))
    expect(markup).not.toContain('<input')
    expect(markup).not.toContain('<select')
    expect(markup).not.toContain('<textarea')
    expect(markup.toLowerCase()).not.toContain('hours')
  })
})

// ============================================================================ one plan

/**
 * ONE PLAN: THE BOX YOU WRITE IN, AND THE PANE BESIDE IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE OWNER REVERSED, AND WHAT THE OWNER DID NOT
 * ---------------------------------------------------------------------------------------
 *
 * Round three settled that a plan is the one page in Mole Office that is always writable, and wrote into
 * this file that it therefore has no Save press and no Done press either. The owner reversed that
 * half, in their own words:
 *
 *   "I still want explicit controls such as Save and Back/Done. Autosave should remain, while a
 *   deliberate Save action gives me confidence that I can force persistence when I want to. A
 *   software interface should not remove useful physical affordances merely because the automatic
 *   mechanism usually works."
 *
 * SO THE ONE THING THAT DID NOT CHANGE IS THE THING THE RULE IS ABOUT. A plan is still always
 * writable: the box is on the page from the moment it opens, nothing has to be pressed to type, and
 * there is no Edit press and no edit mode. What was added is two presses BESIDE a surface that was
 * already writable — Save forces the write autosave would have made anyway, Done stores and goes
 * back. Neither of them switches the page between two states, and that is the whole distinction.
 *
 * The test to run for it is below: the box and both presses are in one render with nothing pressed.
 * An edit mode cannot produce that, because an edit mode draws the box only after a press.
 *
 * ---------------------------------------------------------------------------------------
 * THE SECOND COLUMN IS THE TABLE, AND WRITING ALONE IS THE RESTING STATE
 * ---------------------------------------------------------------------------------------
 *
 * The second column used to be the plan's Markdown drawn as it reads, permanently; then it was one
 * of three settings of a pane inside the writing surface. Both shapes were rejected. The second pane
 * is more valuable as the Table than as a permanent second rendering of the Markdown, and the writing
 * surface must be able to return to full width when no second view is needed.
 *
 * So there is ONE control — Writing, Writing and table, Table, Review — the writing opens on its
 * own at full width, and the drawn document is gone. `PlanDoc.tsx` and its test file were both
 * deleted; nothing in this repository draws a plan's Markdown as it reads.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE AND WHAT IS PROVED ELSEWHERE
 * ---------------------------------------------------------------------------------------
 *
 * This file renders the page against the server's own reply for a real plan, with no browser, so it
 * is where the page's composition is checked cheaply. One other file carries the parts this one
 * cannot reach, and nothing here repeats them:
 *
 *   tests/plan-writing.test.ts types in a real Chromium: what the box holds, the presses, the
 *   layout being switched and remembered, undo, and the save states.
 *
 * WHAT ONLY THIS FILE CHECKS is the disagreement between a line's words and the record's title after
 * somebody has renamed the record. tests/plan-writing.test.ts draws a bound line too, but the record
 * there still carries the line's own words — so nothing in it would fail on the day this page
 * quietly showed one of the two facts instead of both.
 */
describe('one plan: the box you write in, and the table beside it', () => {
  async function readPlan(): Promise<{
    reply: PlanBlocksReply
    since: PlanSinceReadReply
    reviews: PlanReviewsReply
  }> {
    // ALL THREE FROM THE SERVER, like the page itself. The advice about a plan is fetched with the
    // document so that the count on the Review button and the pane behind it are one answer; a
    // fixture written here would be a second opinion about a reply the product already serves.
    const [reply, since, reviews] = await Promise.all([
      webApi.api.planBlocks(planId),
      webApi.api.planSinceRead(planId),
      webApi.api.planReviews(planId),
    ])
    return { reply, since, reviews }
  }

  /**
   * A PLAN IS ALWAYS WRITABLE, AND SAVE AND DONE ARE NOT AN EDIT MODE.
   *
   * The box is drawn with nothing pressed, there is no Edit press, and both of the owner's presses
   * are on the page at the same time as the box. A page with an edit mode cannot render that: it
   * shows you the words and one press, and the box only after the press.
   *
   * AUTOSAVE STAYS, and the page says where the writing stands without being pressed either. The
   * owner asked for the deliberate press ALONGSIDE the automatic mechanism, not instead of it, so a
   * build that added the press and quietly dropped the status line would have answered the owner wrongly
   * with nothing failing.
   *
   * `design/UX-ROUND-THREE.md` section 2 names this page as the one exception to the product's rule
   * about boxes, and tests/read-before-edit.test.ts carries the exception as a list of one, checked
   * against the router, so a second page cannot quietly join it.
   */
  it('is writable with nothing pressed, and carries the two save presses beside the box rather than an edit mode', async () => {
    const { reply, since, reviews } = await readPlan()
    const el = h(onePlan.PlanView, { reply, since, reviews, view: 'writing', onView: () => {} })
    const markup = body(el)
    const said = wordsOf(markup)

    // The plan's name is written in, not pressed into, and the field says what it is for.
    expect(said).toContain('Name of this plan')
    expect(markup).toContain('id="op-plan-name"')
    // And the plan itself is a box, on the page from the moment it opens. It is named by the words
    // a screen reader reads out, because the visible label was deleted on purpose — there is
    // nothing on the page to tell it apart from. See the note beside it in PlanWriting.tsx.
    expect(markup).toContain('aria-label="The plan itself"')
    // No dropdown anywhere: nothing on a plan is chosen from a list until a press asks for one.
    expect(markup).not.toContain('<select')

    // The two presses, in the same render as the box nothing had to unlock.
    expect(said).toContain('Save now')
    // IT SAID "Done" UNTIL 18 AUGUST 2026. A tester found three controls called Done meaning two
    // different things; the two that mean the work is finished kept the word and this one, which
    // stores the plan and leaves the page, says what it does. See tests/record-page.test.ts.
    expect(said).toContain('Save and close')
    expect(said).not.toContain('>Done<')
    // Autosave, still saying where the writing stands with nothing pressed.
    expect(said).toContain('Stored.')

    // No Edit press and no note about the writing view being missing, because a plan is the page
    // you write in.
    expect(said).not.toContain('Not built yet')
    expect(said).not.toContain('Edit')
  })

  /**
   * ONE BOX HOLDS THE WHOLE PLAN, AND THE PANE BESIDE IT IS THE WORK IN THE PLAN.
   *
   * The one box is the correction of 14 August. Every line used to be its own editable element,
   * which a browser cannot select across, cannot undo across, and cannot place a caret in — so that
   * build had to reimplement all of it and was measured as worse than a Markdown file.
   *
   * WHAT IS IN THE BOX IS NOT CHECKED HERE AND CANNOT BE. React hands the plan to the box once, by
   * hand, after the page is on screen, because putting it in a React prop makes React rewrite the
   * element after every keystroke and Chromium then throws the undo history away — measured, with
   * the note on it in PlanWriting.tsx. So the box is empty in markup rendered without a browser.
   * tests/plan-writing.test.ts reads the box in a real Chromium and compares it with what was
   * typed, character for character, which is the stronger proof anyway.
   *
   * NOTHING IS BESIDE IT AT REST: the writing surface must be able to
   * return to full width when no second view is needed. A resting state is the state you get
   * without choosing one, so this renders the setting a plan opens on and counts what is on screen.
   */
  it('puts the whole plan in one box, at full width, with nothing beside it', async () => {
    const { reply, since, reviews } = await readPlan()
    const el = h(onePlan.PlanView, { reply, since, reviews, view: 'writing', onView: () => {} })
    const markup = body(el)
    const said = wordsOf(markup)

    // Two boxes on the whole page and they are these two: the plan's name, and the plan. Not one
    // box per line, and not one per row of a table that is not on screen.
    expect(markup.match(/<textarea/g)).toHaveLength(2)
    expect(markup).toContain('id="op-plan-name"')
    expect(markup).toContain('aria-label="The plan itself"')
    // ONE COLUMN, and the reader is told which setting they are on by the press that says it is
    // the one chosen. `aria-pressed` is what a screen reader announces and what the sheet draws
    // the chosen press from, so this is the same fact the eye gets.
    expect(markup).toMatch(/aria-pressed="true"[^>]*>Writing</)
    // The table is not drawn at all — not drawn and hidden, which a screen reader would still read.
    // A table and its column headings, which is the thing a reader would see beside the writing.
    // Not the WORDS of those headings: "Estimate" is also on the panel that says what the filed
    // lines became, which belongs to this view and is not the table.
    expect(markup).not.toContain('<table')
    expect(markup).not.toContain('<th')
    // Nor is the plan's own text drawn anywhere but in the box. The words go into the box by hand
    // after the page is on screen — see the note below — so a page that also RENDERED the document
    // would be the only thing printing them here.
    expect(said, 'the plan is being drawn as prose beside the box a person types it in').not.toContain(
      'Week of 17 August',
    )

    // The one control names every setting, so both of the other two are one press away.
    for (const choice of ['Writing', 'Writing and table', 'Table', 'Review']) {
      expect(said, choice).toContain(choice)
    }
    // And the pane's own control is gone with it: two controls answering "what am I looking at" is
    // how the two came to disagree.
    for (const gone of ['The work in this plan', 'The document as it reads', 'Nothing beside it']) {
      expect(said, gone).not.toContain(gone)
    }
  })

  /**
   * THE SECOND COLUMN IS THE TABLE, AND THE WRITING IS STILL THERE BESIDE IT.
   *
   * This setting must exist under its own name. The failure it guards against is a build where
   * "Writing and table" quietly means "table instead of writing", which reads the same on a
   * screenshot of a plan whose box happens to be scrolled past.
   */
  it('draws the table in the second column, with the writing box still in the first', async () => {
    const { reply, since, reviews } = await readPlan()
    const markup = body(h(onePlan.PlanView, { reply, since, reviews, view: 'both', onView: () => {} }))

    const said = wordsOf(markup)

    expect(markup, 'the writing box is gone from the setting that keeps it').toContain(
      'aria-label="The plan itself"',
    )
    expect(markup, 'no table is drawn beside the writing').toContain('<table')
    expect(said).toContain('Task')
    expect(said).toContain('Estimate')
    expect(markup).toMatch(/aria-pressed="true"[^>]*>Writing and table</)
  })

  /**
   * THE TABLE ON ITS OWN IS THE THIRD SETTING, and the writing box is then not on the page.
   *
   * Not on the page rather than hidden: a box a screen reader still finds, holding a document
   * nobody can see, is a second copy of the plan that nothing keeps in step.
   */
  it('draws the table alone, with no writing box, when that is the setting', async () => {
    const { reply, since, reviews } = await readPlan()
    const markup = body(h(onePlan.PlanView, { reply, since, reviews, view: 'table', onView: () => {} }))

    const said = wordsOf(markup)

    expect(markup, 'the table is not drawn on the setting that is only the table').toContain('<table')
    expect(said).toContain('Task')
    expect(markup, 'the writing box is still on the page under a setting that says it is not').not.toContain(
      'aria-label="The plan itself"',
    )
    expect(markup).toMatch(/aria-pressed="true"[^>]*>Table</)
    // The name box is still there, because the name is written in on every setting.
    expect(said).toContain('Name of this plan')
    expect(markup).toContain('id="op-plan-name"')
  })

  /**
   * THE TWO FACTS ARE BOTH DRAWN. The line still says what the person wrote; the record says what
   * it is called now; nothing repairs either. This is the test that fails the day somebody makes
   * the table show the record's title instead of the line's words, or the other way round.
   *
   * IT IS THE ONE CLAIM IN THIS BLOCK THAT NO OTHER FILE MAKES, because it needs a line that was
   * filed as work and a record that was renamed afterwards, which needs a server.
   */
  it('shows the line as written and the record as it is now called, when they differ', async () => {
    const { reply, since, reviews } = await readPlan()
    const said = wordsOf(
      body(h(onePlan.PlanView, { reply, since, reviews, view: 'table', onView: () => {} })),
    )
    expect(said).toContain('Build the plans grid')
    expect(said).toContain('Plans grid at 1440 and 390')
    // And the record's state and project beside the line. Not its kind: the table has no kind
    // column, and asserting one would be this test claiming a column the reader does not get.
    expect(said).toContain('doing')
    // THE PROJECT BY NAME. `Default` is what that project is called and `default` is the id it is
    // stored under; the table used to print the id, which is a name nobody chose.
    expect(said).toContain('Default')
  })
})

// ============================================================================ the table view

describe('the table view of the same lines', () => {
  it('says what its total could not count', async () => {
    const reply = await webApi.api.planBlocks(planId)
    const said = words(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines }))
    // REWRITTEN 17 AUGUST 2026. The footer used to add every tracked row's estimate with a plain
    // sum; it now reads the plan as envelopes through src/shared/envelope.ts, so a piece of work and
    // a part of that same work are never both counted. See src/shared/envelope.ts.
    expect(said).toContain('6h in all, from')
    expect(said).toContain('not sized as work')
    expect(said).toContain('not tracked as work')
    expect(said).toContain('blank lines are not shown')
  })

  it('marks a line nobody is tracking as work in words, not only in a border', async () => {
    const reply = await webApi.api.planBlocks(planId)
    const said = words(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines }))
    expect(said).toContain('not tracked')
  })

  /**
   * ONE DECLARATION PER COLUMN: the heading above a value on a desk is the label beside it on a
   * phone. The two used to be two objects on the records page and its own comment records them
   * having drifted.
   */
  it('labels a phone card with the very same words as the table headings', async () => {
    const reply = await webApi.api.planBlocks(planId)
    const wide = words(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines }))

    // The phone. `useNarrow` asks the window, so the window says it is one for this render.
    const win = (globalThis as unknown as { window: Record<string, unknown> }).window
    win.matchMedia = () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} })
    const narrow = words(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines }))
    delete win.matchMedia

    // The stacked list is a different drawing of the same rows: no table, and one label per value.
    expect(body(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines }))).toContain('<table')
    // RENAMED 17 AUGUST 2026 by the owner: Task, Type, Estimate, Schedule, Project, Note.
    for (const heading of ['Task', 'Type', 'Estimate', 'Note', 'Project']) {
      expect(wide, heading).toContain(heading)
      expect(narrow, heading).toContain(heading)
    }
  })
})
