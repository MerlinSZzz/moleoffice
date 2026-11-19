// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY LIST SAYS WHAT ITS ROWS ARE, SO EVERY LIST CAN BE TALKED ABOUT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, AND WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Counted in Chromium on 18 August 2026, as `document.querySelectorAll('[data-target]').length` on
 * each page: Home 0, the plans list 0, a plan on the tab it opens on 0, the Schedule 0, Work to do
 * 0, Decisions 0, Modules 0, Findings 0, Reports and notes 0 — while the same records on Everything
 * answered 230. So the same record could be talked about in one view and not in another, which
 * docs/UX-CONTRACT.md names by hand as a feature that is not done.
 *
 * Addressability was built as a property of the markup — an element says what it is and one
 * listener at the document reads it, see src/shared/targets.ts — and then almost nothing said what
 * it was. That is the failure this file is against, and it is a SILENT one: a list that says
 * nothing about its rows draws exactly as it did before, passes every other test, and simply cannot
 * be pointed at.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ASSERTED, AND WHAT IS DELIBERATELY NOT
 * ---------------------------------------------------------------------------------------
 *
 * Each surface is rendered and its rows are counted against the objects handed in. A count is what
 * makes this a test rather than a spot check: a page that says what ONE of its four rows is has the
 * defect this file is about, and an assertion of "at least one" would pass.
 *
 * The attribute's SPELLING is not restated here. `targetKey` in src/shared/targets.ts writes it and
 * these tests read the same function, so a change to the format cannot make this file disagree with
 * the browser about what a row is called.
 *
 * The runner has no DOM, so components are rendered to static markup — the same way
 * tests/family-rows.test.ts and tests/talk-on-real-work.test.ts do it. What that cannot see is a
 * row hidden by CSS, which the browser review photographs for.
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { targetKey } from '../src/shared/targets.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import type { RecordListItem, ReportsAndNotesReply, PlanBlocksReply, PlanReviewsReply, PlanSinceReadReply } from '../src/web/api.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

type WebApi = typeof import('../src/web/api.ts')
type Rows = typeof import('../src/web/pages/family/rows.tsx')
type Structure = typeof import('../src/web/pages/family/StructurePage.tsx')
type Findings = typeof import('../src/web/pages/family/FindingsPage.tsx')
type Ideas = typeof import('../src/web/pages/family/IdeasPage.tsx')
type Notes = typeof import('../src/web/pages/family/NotesPage.tsx')
type Modules = typeof import('../src/web/pages/family/ModulesPage.tsx')
type Work = typeof import('../src/web/pages/family/WorkPage.tsx')
type Tiles = typeof import('../src/web/components/home/DecisionTiles.tsx')
type Decided = typeof import('../src/web/components/home/DecidedCards.tsx')
type DecisionRead = typeof import('../src/web/components/home/decisions.ts')
type PlansPageModule = typeof import('../src/web/pages/plans/PlansPage.tsx')
type OnePlanModule = typeof import('../src/web/pages/plans/OnePlanPage.tsx')
type Planning = typeof import('../src/web/components/Planning.tsx')
type Blocks = typeof import('../src/web/components/SummaryBlocks.tsx')
type Inline = typeof import('../src/shared/inline.ts')

let db: TestDb
let app: FastifyInstance
let webApi: WebApi
let rows: Rows
let structure: Structure
let findings: Findings
let ideas: Ideas
let notes: Notes
let modules: Modules
let work: Work
let tiles: Tiles
let decided: Decided
let decisionRead: DecisionRead
let plansPage: PlansPageModule
let onePlan: OnePlanModule
let planning: Planning
let blocks: Blocks
let inline: Inline

/** The plan every plan test below reads, written through the real write path. */
let planId: string

const AS_HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

const PLAN_BODY = ['# Week of 17 August', '', '- Build the plans grid', '- Measure at 390'].join('\n')

beforeAll(async () => {
  // The browser modules read window.localStorage at module scope. This is the smallest stand-in
  // that lets them load; nothing here is under test.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
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
  rows = await import('../src/web/pages/family/rows.tsx')
  structure = await import('../src/web/pages/family/StructurePage.tsx')
  findings = await import('../src/web/pages/family/FindingsPage.tsx')
  ideas = await import('../src/web/pages/family/IdeasPage.tsx')
  notes = await import('../src/web/pages/family/NotesPage.tsx')
  modules = await import('../src/web/pages/family/ModulesPage.tsx')
  work = await import('../src/web/pages/family/WorkPage.tsx')
  tiles = await import('../src/web/components/home/DecisionTiles.tsx')
  decided = await import('../src/web/components/home/DecidedCards.tsx')
  decisionRead = await import('../src/web/components/home/decisions.ts')
  plansPage = await import('../src/web/pages/plans/PlansPage.tsx')
  onePlan = await import('../src/web/pages/plans/OnePlanPage.tsx')
  planning = await import('../src/web/components/Planning.tsx')
  blocks = await import('../src/web/components/SummaryBlocks.tsx')
  inline = await import('../src/shared/inline.ts')

  const written = await webApi.api.newPlan('August plans', PLAN_BODY)
  planId = written.plan.id
})

afterAll(async () => {
  await app.close()
  db.close()
})

// ---------------------------------------------------------------------------- reading the markup

/** Markup with the hoisted style blocks removed, so a class name in a stylesheet is not evidence. */
function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/** Everything this markup says a person can point at, in the order it is drawn. */
function addressable(markup: string): string[] {
  return [...markup.matchAll(/data-target="([^"]+)"/g)].map((m) => (m[1] ?? '').replace(/&amp;/g, '&'))
}

let seq = 0
function record(over: Partial<RecordListItem> = {}): RecordListItem {
  seq += 1
  return {
    id: `rec-${String(seq)}`,
    kind: 'task' as PanelRecord['kind'],
    workspaceId: 'w1',
    ownerId: THE_TEST_OFFICES_OWNER.id,
    title: `Record ${String(seq)}`,
    summary: null,
    data: {},
    createdAt: '2026-08-01 09:00:00',
    updatedAt: '2026-08-02 09:00:00',
    deletedAt: null,
    incompleteCount: 0,
    ...over,
  }
}

/** What a record row must say about itself, written by the one writer of the attribute. */
function saysRecord(one: { id: string; workspaceId: string }): string {
  return targetKey({ kind: 'record', recordId: one.id, workspaceId: one.workspaceId })
}

const noop = () => {}

/** One page of the Reports page's reply holding these records, all filed earlier and none marked. */
function reportsReply(records: readonly RecordListItem[]): ReportsAndNotesReply {
  return {
    rows: records.map((one) => ({ ...one, group: 'earlier' as const, read: null })),
    show: 'both',
    groups: { 'needs-you': 0, 'this-week': 0, earlier: records.length },
    kinds: { report: records.filter((one) => one.kind === 'report').length, note: records.filter((one) => one.kind === 'note').length },
    matched: records.length,
    returned: records.length,
    offset: 0,
    limit: 50,
    left: 0,
  }
}
const NO_PROJECTS = { workspaces: [], current: { id: 'w1', stated: true } } as never

function moduleWith(states: readonly string[], over: Partial<RecordListItem> = {}): RecordListItem {
  return record({
    kind: 'module' as PanelRecord['kind'],
    data: { parts: [{ name: 'Mount', items: states.map((state, at) => ({ text: `item ${String(at)}`, state })) }] },
    ...over,
  })
}

// ============================================================================ the family pages

/**
 * THE SIX LISTS THAT DREW NOTHING ADDRESSABLE, each with TWO records rather than one.
 *
 * Two is the number that matters. A page that names one row and forgets the rest passes any test
 * written with a single row, and "the rows are drawn by one component" is exactly the kind of
 * assumption that stops being true when somebody adds a second band to a page.
 */
describe('a list row says which record it is', () => {
  const surfaces: [string, () => { markup: string; expected: string[] }][] = [
    [
      'Modules',
      () => {
        const a = moduleWith(['done', 'todo'])
        const b = moduleWith(['todo'])
        return {
          markup: body(h(modules.ModulesPage, { records: [a, b], links: [], onFiled: noop })),
          expected: [saysRecord(a), saysRecord(b)],
        }
      },
    ],
    [
      'Modules and pipelines',
      () => {
        const a = moduleWith(['done'])
        const b = moduleWith(['todo'])
        return {
          markup: body(h(structure.StructurePage, { records: [a, b], links: [], onFiled: noop })),
          expected: [saysRecord(a), saysRecord(b)],
        }
      },
    ],
    [
      'Findings',
      () => {
        const a = record({ kind: 'claim' as PanelRecord['kind'], data: { state: 'measured' } })
        const b = record({ kind: 'direction' as PanelRecord['kind'], data: { depth: 'explored' } })
        return {
          markup: body(h(findings.FindingsPage, { records: [a, b], onFiled: noop })),
          expected: [saysRecord(b), saysRecord(a)],
        }
      },
    ],
    [
      'Ideas',
      () => {
        const a = record({ kind: 'idea' as PanelRecord['kind'], data: { state: 'new' } })
        const b = record({ kind: 'idea' as PanelRecord['kind'], data: { state: 'new' } })
        return {
          markup: body(h(ideas.IdeasPage, { records: [a, b], onFiled: noop })),
          expected: [saysRecord(a), saysRecord(b)],
        }
      },
    ],
    [
      'Reports and notes',
      () => {
        const a = record({ kind: 'note' as PanelRecord['kind'] })
        const b = record({ kind: 'note' as PanelRecord['kind'] })
        return {
          markup: body(h(notes.ReportsList, { reply: reportsReply([a, b]), projects: NO_PROJECTS, onShow: noop, onGo: noop, onFiled: noop })),
          expected: [saysRecord(a), saysRecord(b)],
        }
      },
    ],
  ]

  it.each(surfaces)('%s names every one of its rows', (name, draw) => {
    const { markup, expected } = draw()
    // A BAND'S OWN HEADING IS NOW A PART OF THE SCREEN WITH A NAME, AND IT IS NOT A ROW. Step 16
    // made every container say what it is, so the markup of a list surface holds the band's
    // `uiSurface` key as well as one key per record. They are told apart here rather than dropped:
    // the rows must be exactly the records, and everything else must be a named part of Mole Office.
    const found = addressable(markup)
    const rowsFound = found.filter((one) => !one.startsWith('uiSurface/'))
    const parts = found.filter((one) => one.startsWith('uiSurface/'))
    expect(
      rowsFound.length,
      `${name} drew ${String(rowsFound.length)} addressable rows and holds ${String(expected.length)} records`,
    ).toBe(expected.length)
    expect([...rowsFound].sort()).toEqual([...expected].sort())
    expect(found.length - rowsFound.length, `${name} drew ${String(parts.length)} named parts`).toBe(parts.length)
  })
})

/**
 * ONE MODULE ROW, DRAWN ON TWO PAGES, SAYING THE SAME THING ON BOTH.
 *
 * The contract's phrase is "the value works in one view and disappears from the other". This is
 * that clause as an assertion: the row component both pages share names the record, so neither page
 * can lose it on its own.
 */
describe('the module row both pages share', () => {
  it('names the record, with the project the record itself is filed in', () => {
    const one = moduleWith(['done', 'todo'], { workspaceId: 'robotics' })
    const markup = body(
      h(rows.ModuleRow, {
        record: one,
        problems: { open: 0, linked: 0 },
        lifecycle: null,
        sayLifecycle: false,
        sayNoProblems: false,
      }),
    )
    expect(addressable(markup)).toEqual([saysRecord(one)])
    // The RECORD'S project, not the project the switcher happens to be on. A row from another
    // project pointed at under this project's name is a comment the server refuses.
    expect(addressable(markup)[0]).toContain('robotics')
  })
})

// ============================================================================ work to do

describe('Work to do', () => {
  it('names every piece of work on the list, in the project that piece of work belongs to', () => {
    const row = (id: string, workspaceId: string) => ({
      id,
      kind: 'task' as PanelRecord['kind'],
      title: id,
      name: id,
      within: null,
      summary: null,
      state: 'todo',
      origin: null,
      incompleteCount: 0,
      due: null,
      workspaceId,
      above: [],
      aboveStopped: null,
      parentsInOtherProjects: [],
      estimateHours: null,
      hoursGiven: [],
    })
    const markup = body(
      h(work.WorkList as never, {
        reply: {
          rows: [row('w-1', 'panelx'), row('w-2', 'robotics')],
          counted: 2,
          returned: 2,
          cap: 200,
          leftOut: 0,
          note: null,
          said: [],
        },
        projects: {
          workspaces: [
            { id: 'panelx', title: 'Mole Office', records: 1 },
            { id: 'robotics', title: 'Robotics', records: 1 },
          ],
        },
        view: 'flat',
        now: Date.parse('2026-08-18T10:00:00'),
      } as never),
    )
    const found = addressable(markup)
    expect(found).toContain(targetKey({ kind: 'record', recordId: 'w-1', workspaceId: 'panelx' }))
    expect(found).toContain(targetKey({ kind: 'record', recordId: 'w-2', workspaceId: 'robotics' }))
  })
})

// ============================================================================ decisions

describe('Decisions', () => {
  const NOW = Date.parse('2026-08-18T10:00:00')
  const fork = (id: string) => ({
    recordId: id,
    workspaceId: 'panelx',
    workspaceTitle: 'Mole Office',
    title: `A fork called ${id}`,
    summary: null,
    question: 'Which way?',
    options: 2,
    // TWO FACTS SINCE 27 AUGUST 2026, and the queue's own ordering facts beside them.
    recommendationWritten: false,
    namesAnOption: false,
    blocks: [],
    fields: { question: 'Which way?', options: ['a — one', 'b — two'], recommendation: null },
    createdAt: '2026-08-14 09:00:00',
    because: 'Settling a fork is a governance act, so Mole Office refuses it to every agent.',
    // Nothing on this fixture stands on the owner's quoted words, which is the ordinary answer.
    onThePersonsWords: null,
    unreadable: [],
    priority: {
      pinned: false,
      safety: false,
      blocking: 0,
      reaches: 0,
      governance: false,
      waitingDays: 7,
      namesAnOption: false,
      because: 'Ordered by: it has waited 7 days.',
    },
  })

  it('names every fork waiting on a person', () => {
    const forks = [fork('p-1'), fork('p-2')] as never
    const read = decisionRead.readDecisions(forks, NOW, [])
    const markup = body(
      h(tiles.DecisionTiles, {
        rows: read,
        tally: decisionRead.tallyDecisions(read),
        here: 'panelx',
        onOpen: noop,
        onSettled: noop,
        inspect: false,
      }),
    )
    const found = addressable(markup)
    expect(found).toEqual([
      targetKey({ kind: 'record', recordId: 'p-1', workspaceId: 'panelx' }),
      targetKey({ kind: 'record', recordId: 'p-2', workspaceId: 'panelx' }),
    ])
  })

  it('names every decision already made', () => {
    const one = (id: string) => ({
      recordId: id,
      workspaceId: 'panelx',
      workspaceTitle: 'Mole Office',
      title: `Decided ${id}`,
      question: 'Which way?',
      taken: 'the first one',
      takenIsOption: true,
      decidedAt: '2026-08-14 09:00:00',
      waited: 'waiting 1 day',
      proposalId: null,
    })
    const markup = body(
      h(decided.DecidedCards as never, { rows: [one('d-1'), one('d-2')], here: 'panelx', onOpen: noop } as never),
    )
    expect(addressable(markup)).toEqual([
      targetKey({ kind: 'record', recordId: 'd-1', workspaceId: 'panelx' }),
      targetKey({ kind: 'record', recordId: 'd-2', workspaceId: 'panelx' }),
    ])
  })
})

// ============================================================================ the plans list

describe('the plans list', () => {
  it('names every plan on it, so one can be talked about without being opened first', async () => {
    const reply = await webApi.api.plans()
    expect(reply.plans.length, 'no plan was written, so this test is measuring nothing').toBeGreaterThan(0)
    const markup = body(h(plansPage.PlansGrid, { reply }))
    expect(addressable(markup)).toEqual(reply.plans.map((one) => targetKey({ kind: 'plan', planId: one.plan.id })))
  })
})

// ============================================================================ what a plan opens on

/**
 * A PLAN OPENS ON A VIEW THAT CARRIES ITS LINES.
 *
 * The writing surface is one box a person types in. A box holds no element per line, so a plan
 * that opened on it carried nought addressable elements and the only way to comment on a line was
 * to know to press Table first. Both halves are asserted, and both are needed: the constant alone
 * would pass with the page reading some other value, and the drawing alone would pass with the page
 * opening somewhere else.
 */
describe('the view a plan opens on', () => {
  async function readPlan(): Promise<{
    reply: PlanBlocksReply
    since: PlanSinceReadReply
    reviews: PlanReviewsReply
  }> {
    const [reply, since, reviews] = await Promise.all([
      webApi.api.planBlocks(planId),
      webApi.api.planSinceRead(planId),
      webApi.api.planReviews(planId),
    ])
    return { reply, since, reviews }
  }

  it('carries every line of the plan, with nobody having chosen a view', async () => {
    const { reply, since, reviews } = await readPlan()
    const view = onePlan.viewAPlanOpensOn()
    const markup = body(h(onePlan.PlanView, { reply, since, reviews, view, onView: noop }))
    const found = addressable(markup).filter((one) => one.startsWith('planLine/'))
    // EVERY LINE THAT IS AN ITEM, which is every line but the blank one. A blank line is spacing
    // somebody typed and the table draws no row for it, so there is nothing on screen to point at.
    const written = reply.lines.filter((one) => one.line.text.trim() !== '')
    expect(written.length, 'the plan holds no written lines, so this is measuring nothing').toBeGreaterThan(1)
    expect(
      found,
      `a plan opening on "${view}" carries ${String(found.length)} of its ${String(written.length)} written lines`,
    ).toEqual(written.map((one) => targetKey({ kind: 'planLine', planId, lineId: one.line.id })))
  })

  it('still lets somebody put the writing back to full width, and remembers it', async () => {
    // The writing surface must be able to return to full width. Opening on both
    // is not that promise being broken: every view is still one press, and what is stored wins.
    const { writeStored } = await import('../src/web/lib/store.ts')
    const { getActor } = await import('../src/web/api.ts')
    const actor = getActor()
    writeStored(`mole-office.plan.shown.${actor.type}:${actor.id}`, 'writing')
    expect(onePlan.viewAPlanOpensOn()).toBe('writing')
    const { clearStored } = await import('../src/web/lib/store.ts')
    clearStored(`mole-office.plan.shown.${actor.type}:${actor.id}`)
    expect(onePlan.viewAPlanOpensOn()).toBe('both')
  })
})

// ============================================================================ the week

describe('the week board', () => {
  it('names every block on it, and not only the one somebody has opened', () => {
    const window = (id: string, startsOn: string, endsOn: string) => ({
      window: {
        id,
        recordId: `rec-${id}`,
        startsOn,
        endsOn,
        note: null,
        state: 'planned' as const,
        createdAt: '2026-08-17 09:00:00',
        updatedAt: '2026-08-17 09:00:00',
      },
      work: null,
    })
    const board = { windows: [window('win-1', '2026-08-17', '2026-08-18'), window('win-2', '2026-08-19', '2026-08-19')] }
    const markup = body(
      h(planning.WeekBoard as never, {
        period: '2026-W34',
        windows: { status: 'ready', value: board },
        board,
        onBlockChanged: noop,
        onBlockUnplaced: noop,
        readWindowsAgain: noop,
        editing: false,
        todayDay: null,
        allocatable: [],
        onWrote: noop,
      } as never),
    )
    const found = addressable(markup).filter((one) => one.startsWith('scheduleBlock/'))
    expect(found).toEqual([
      targetKey({ kind: 'scheduleBlock', windowId: 'win-1' }),
      targetKey({ kind: 'scheduleBlock', windowId: 'win-2' }),
    ])
  })
})

// ============================================================================ find in this table

/**
 * "FIND IN THIS TABLE" LOOKS IN THE WORDS ON THE SCREEN.
 *
 * It looked in the stored markdown. A cell stored with asterisks round two of its words draws
 * without them, so searching for the sentence a person can read answered "0 of 9 rows" and then
 * said in plain words that no row in the table had it — observed on the owner's own report
 * CnnEp_jlEnAt. The other way round, the stored spelling with its asterisks matched, and those
 * characters are on nobody's screen.
 */
describe('the words a table cell shows', () => {
  it('are the words without the markers, which is what a person can search for', () => {
    expect(blocks.wordsOfCells(['**Done.** *Where it stands* is gone'], 'k')).toEqual([
      'Done. Where it stands is gone',
    ])
  })

  it('do not include a marker somebody typed, because a marker is on nobody’s screen', () => {
    const [drawn] = blocks.wordsOfCells(['**Alpha** Bravo'], 'k')
    expect(drawn).toBe('Alpha Bravo')
    expect(drawn?.includes('**Alpha**')).toBe(false)
  })

  it('carry a number cell through as the number it draws', () => {
    expect(blocks.wordsOfCells(['run one', 1.9], 'k')).toEqual(['run one', '1.9'])
  })

  it('are read off the drawing itself rather than from a second reading of the markers', () => {
    // THE GUARD AGAINST THE DEFECT THIS REPOSITORY KEEPS FINDING. `renderInline` is the one thing
    // that decides what a stored line draws; this reads what it built. A separate stripper of
    // asterisks would be a second answer to one question, free to disagree with the screen.
    const cell = 'a `code` word, a [link](https://example.com) and a **bold** one'
    const drawnByTheRenderer = blocks.wordsDrawnBy(inline.renderInline(cell, 'k'))
    expect(blocks.wordsOfCells([cell], 'k')).toEqual([drawnByTheRenderer])
    expect(drawnByTheRenderer).toBe('a code word, a link and a bold one')
  })
})
