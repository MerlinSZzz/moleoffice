// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The shell's frame: what the sidebar offers, where each entry goes, and what its numbers mean.
 *
 * WHY THIS FILE EXISTS. The frame is the one part of the app a reader cannot avoid, so a mistake
 * in it is on every screen. Three mistakes are worth a test each, and all three have happened in
 * this product already:
 *
 *   1. A LINK THAT LANDS NOWHERE. The sessions page existed, was tested, and was unreachable for a
 *      whole phase because the header pointed at an address the router had no case for. Every
 *      address in the sidebar is parsed back through the real router here.
 *   2. A PAGE WITH NO WAY IN. A page in FLAT_ROUTES that nothing links to is the same defect from
 *      the other end, so the destinations are checked to cover the router's whole map.
 *   3. A KIND THAT QUIETLY VANISHES. The five families group every record kind. A kind that is
 *      neither a destination nor printed under its family would silently have no route in, so the
 *      two lists are checked to add up to KIND_FAMILIES exactly. How many kinds there are is not
 *      written down here either — that number belongs to `RECORD_KINDS` and to nothing else.
 *
 * WHY IT LOOKS LIKE THIS. The runner's environment is `node` — there is no DOM and adding jsdom
 * would mean a dependency this project has ruled out. src/web/api.ts reads window.localStorage at
 * module scope, so the smallest possible stand-in for a window is installed before the sidebar is
 * imported, exactly as tests/ui.test.ts and tests/app-routes.test.ts do it. Components are then
 * rendered to static markup with react-dom/server, which runs the render but no effects — which
 * is all that is wanted here.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { readFileSync } from 'node:fs'

const read = (file: string): string => readFileSync(file, 'utf8')

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { familyOf, KIND_FAMILIES } from '../src/shared/work.ts'
import { SURFACES } from '../src/shared/surfaces.ts'
import type { AttentionRow } from '../src/shared/attention.ts'
import { ATTENTION_PART_ROWS } from '../src/shared/attention-first-page.ts'
import { parseRoute } from '../src/web/components/router.tsx'
import type { AttentionHome } from '../src/web/api.ts'
import type { AsyncState } from '../src/web/components/ui.tsx'
import type { WaitingReply } from '../src/web/lib/waiting.ts'
import { THE_NARROW_FROM, THE_WIDE_FROM } from '../src/web/lib/the-shell-width.ts'

type SidebarModule = typeof import('../src/web/components/Sidebar.tsx')
let S: SidebarModule
type AllPagesModule = typeof import('../src/web/pages/AllPagesPage.tsx')
let A: AllPagesModule

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
  S = await import('../src/web/components/Sidebar.tsx')
  A = await import('../src/web/pages/AllPagesPage.tsx')
})

// ---------------------------------------------------------------------------- fixtures

/** One attention row, with only the fields a test cares about spelled out. */
function row(over: Partial<AttentionRow> & Pick<AttentionRow, 'key' | 'recordKind'>): AttentionRow {
  return {
    shape: 'record',
    recordId: over.key,
    origin: 'authored',
    partId: null,
    itemId: null,
    title: 'a thing',
    state: 'open',
    progress: 'stopped_short',
    group: 'stopped:work',
    score: 10,
    safety: false,
    displacedBy: null,
    reason: {
      selectedBy: 'stopped_short',
      owed: null,
      stoppedShort: { state: 'open', since: '2026-08-01 09:00:00', sinceSource: 'state-change' },
      // The third way onto the list, added to the contract while this pass was running. Null here
      // because these rows are on the list for their state word; the field is spelled out rather
      // than left off so a fixture cannot drift away from the shape the server actually sends.
      pauseElapsed: null,
      consequence: null,
      safetyFloor: false,
      because: 'its state word is "open", which means the work stopped short of finishing',
      coded: [{ code: 'stoppedShort', values: { state: 'open' } }],
      factors: [],
    },
    ...over,
  }
}

/**
 * A waiting reading with nothing in it, for the tests that are about navigation rather than about
 * the queue. `waitingReply` below builds one with rows in it.
 */
const READY_WAITING = { status: 'ready' as const, value: waitingReply(0) }

/** A reading of `n` things waiting on the person, in one tier. Only the shape the rail reads. */
function waitingReply(settle: number, asked = 0, setAside = 0): WaitingReply {
  const rows: WaitingReply['items'] = []
  const add = (tier: 'settle' | 'asked' | 'set-aside', many: number): void => {
    for (let at = 0; at < many; at += 1) {
      rows.push({
        id: `${tier}-${at}`,
        tier,
        act: 'settle',
        because: { rule: 'refused-act', doors: [] },
        why: 'only a person may settle this',
        // Nothing on these fixture rows stands on the owner's quoted words, which is the ordinary answer.
        onThePersonsWords: null,
        replacedButStillHere: null,
        // And nobody passed these on: they are tier-1 rows, and only a `whose_move` question goes
        // through a starter. Criterion P55.
        passedOnBy: null,
        fromAgent: { answer: 'not-an-agent' },
        workspaceId: 'panelx',
        workspaceTitle: 'Mole Office',
        kind: 'proposal',
        title: `${tier} ${at}`,
        said: null,
        blocking: 0,
        since: null,
      })
    }
  }
  add('settle', settle)
  add('asked', asked)
  add('set-aside', setAside)
  return {
    items: rows,
    counts: { settle, asked, setAside },
    excluded: [],
    scope: 'every project',
    note: 'what is waiting on the person',
  }
}

function reply(over: Partial<AttentionHome> = {}): AttentionHome {
  const visible = over.visible ?? []
  const remainder = over.remainder ?? []
  const rows = [...visible, ...remainder]
  const byKind: AttentionHome['badgeCounts']['byKind'] = {}
  const byFamily: AttentionHome['badgeCounts']['byFamily'] = {}
  for (const row of rows) {
    byKind[row.recordKind] = (byKind[row.recordKind] ?? 0) + 1
    const family = familyOf(row.recordKind)
    if (family !== null) byFamily[family] = (byFamily[family] ?? 0) + 1
  }
  return {
    visible,
    remainder,
    remainderNext: null,
    badgeCounts: { byKind, byFamily, safety: rows.some((row) => row.safety) },
    openWork: { open: 0, uncertain: 0 },
    alarms: { rows: [], total: 0, overdue: 0, sessionIds: [] },
    total: visible.length + remainder.length,
    remainderByGroup: [],
    remainderNote: null,
    passedOver: [],
    counts: { candidates: 0, selected: 0, visible: visible.length, remainder: remainder.length, passedOver: 0, deleted: 0 },
    reports: [],
    reportCounts: { waiting: 0, read: 0 },
    questions: {
      paused: { total: 0, holding: 0, holdingByStanding: [], onList: [] },
      unclassified: { count: 0, words: [] },
      noState: { count: 0, written: 0, noField: 0, unknownKind: 0 },
    },
    at: '2026-08-09 18:00:00',
    read: { records: 0, links: 0, changes: 0, changesCapped: false },
    ...over,
  }
}

/**
 * The sidebar as markup, WITHOUT its stylesheet.
 *
 * The component ships its own rules in a hoisted `<style>`, and those rules name every class it
 * draws — so "the markup does not contain shell-badge" is true of the elements and false of the
 * string unless the style block comes out first. Asserting against the stylesheet by accident is
 * a test that passes whatever the component renders.
 */
function draw(attention: AsyncState<AttentionHome>, open = false, waiting: AsyncState<WaitingReply> = READY_WAITING): string {
  const html = renderToStaticMarkup(
    h(S.Sidebar, {
      page: 'home' as const,
      open,
      onClose: () => {},
      onRenamed: () => {},
      attention,
      // THE SECOND READING THE FRAME DRAWS FROM. The rail carries two badges now and they count
      // different things: what needs anybody, and what is waiting on the person. A ready reply with
      // nothing in it is the default here, so a test about navigation is not also a test about the
      // waiting queue — the ones that are about it pass their own.
      waiting,
      // WHICH PROJECT the column is counting, which the sidebar is now told rather than assuming.
      // The list of projects is left `loading` because these tests are about navigation: what the
      // switcher draws in each of its three states is tests/workspace-switcher.test.ts.
      sight: {
        id: 'default',
        title: 'default',
        named: false,
        what: 'Every count on this screen is about the project "default".',
        fault: null,
      },
      workspaces: { status: 'loading' as const },
    }),
  )
  return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '')
}

/**
 * The All pages page as markup, without its stylesheet. Test change (wave 13y round 165): every row that is not
 * in front in the sidebar, with the group captions, is drawn here now. The project block stands in the sidebar.
 */
function drawAllPages(): string {
  const html = renderToStaticMarkup(
    h(A.AllPagesPage, {
      sight: { id: 'default', title: 'default', named: false, what: 'Every count on this screen is about the project "default".', fault: null },
    }),
  )
  return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '')
}

// ---------------------------------------------------------------------------- addresses

describe('every destination goes somewhere', () => {
  it('parses every address back through the real router, and none lands on the not-found page', () => {
    for (const destination of S.DESTINATIONS) {
      const route = parseRoute(`#${destination.to}`)
      expect(route.name, `${destination.label} points at "${destination.to}"`).toBe(destination.page)
    }
  })

  it('lights up the Plans row when you are on the plans page, which it did not for a phase', () => {
    // The row shipped before its page, with `page: null` and `marks: false`, so pressing it reached
    // the not-found page. That was honest then. The page landed and those two fields did not change
    // with it, so the row opened a real page and the rail went on saying you were nowhere. Both
    // fields are gone now: a row cannot be declared without a page, and no row may decline to mark
    // itself, so neither can be left stale again.
    const plans = S.DESTINATIONS.find((d) => d.key === 'plans')
    expect(plans?.to).toBe('/plans')
    expect(plans?.page).toBe('plans')
    expect(plans === undefined ? 'x' : S.markFor(plans, 'plans')).toBe('page')
    expect(plans === undefined ? 'x' : S.markFor(plans, 'home')).toBe(null)
  })

  it('lights up the governance row when you are on the governance queue', () => {
    // THE DEFECT: that row is the only one that declares BOTH a page of its own and a family, and
    // `markFor` branched on the family — so it asked "am I on the family route" about a row that
    // never opens the family route, and could never mark itself on the page it opens.
    //
    // The page it opens is the governance queue now — `#/decisions` folded into it and survives as
    // a redirect — and the row still names the decisions family, so both halves are still live.
    const decisions = S.DESTINATIONS.find((d) => d.key === 'decisions')
    expect(decisions?.page).toBe('governance')
    expect(decisions?.family).toBe('decisions')
    expect(decisions === undefined ? 'x' : S.markFor(decisions, 'governance')).toBe('page')
    // And it does not light up because some OTHER family page is open, which is what the family
    // branch is for and why it still exists for the rows that share the family route.
    expect(decisions === undefined ? 'x' : S.markFor(decisions, 'family', 'work')).toBe(null)
  })

  it('counts the addresses in the frame, and every one of them opens the page it claims', () => {
    /**
     * THE COUNT, so a row added or dropped without a reason shows up as a number that changed.
     * Sixteen addresses: fifteen in the column — fourteen places, plus Settings below the rule at
     * the foot — and the component sheet, which is reached from the Settings page.
     *
     * IT WAS FIFTEEN UNTIL ROUND SEVEN ADDED Agent conversations, which is where what somebody said
     * to an agent, and what came back, is read. It is a place, it is about the project in the
     * switcher, and it sits beside Agent runs because a reader looking for one may mean the other.
     *
     * FOUR OF THE ROUTER'S ROUTE NAMES ARE DELIBERATELY NOT IN THE FRAME, and each is
     * reached from a row rather than beside one: `record` from any list, `onePlan` from Plans,
     * `family` for the `structure` family from a module's or a pipeline's own record page, and
     * `unknown` only by mistyping. `#/plan/today` is the same `plan` page at a particular day and
     * is reached from the Schedule, which is where a person is when they want it.
     */
    /*
     * SEVENTEEN SINCE 26 AUGUST 2026, when Placeholders got a row. Round ten wave 8 built two
     * record kinds, twelve routes and six marks and shipped no screen, so what a person could
     * deliberately leave unresolved was reachable only with curl. The row is under "What this
     * project holds", after Pipelines and before Findings, because what has been left open governs
     * how everything under it should be read.
     */
    /*
     * NINETEEN SINCE 27 AUGUST 2026, when Agent use got a row: what agents asked this project for,
     * what it cost them, and what they went outside Mole Office to find. It is the third agent row and
     * sits with the other two, because a reader looking for one of the three may mean any of them.
     *
     * EIGHTEEN SINCE 26 AUGUST 2026, when Context bundles got a row. It is the one surface in this
     * product whose purpose is that content leaves it, and the person pressing the button is the
     * only check on what is handed to an agent Mole Office does not run. The row sits after Placeholders,
     * beside the restrictions a bundle must never drop.
     */
    /*
     * TWENTY SINCE 27 AUGUST 2026, when Who is working got a row. `#/working` had been written into
     * a design and typed into a browser, and it answered "There is no page at /working" because the
     * word was in no route and in no rail row. It is the present tense of the three agent rows and
     * sits above them: runs is history, conversations is what was said, use is what was read.
     */
    /*
     * TWENTY-ONE SINCE 4 SEPTEMBER 2026, when Worlds got a row: which worlds this installation has,
     * who is working away from home, and the way into one. It is drawn at the foot beside Settings
     * rather than in either named group, because a world holds every project it has and so narrows
     * to none of them — the same reason Settings is there.
     *
     * TWENTY-TWO LATER THE SAME DAY, when Messages got one: every message in the project, whoever
     * said it and wherever it was said. Agent conversations could be reached by accident from a comment
     * and then not found again. That is why the message pool has a page of its own, to read and manage it.
     * It sits beside Agent conversations because a reader looking for one may
     * mean the other, and each row's sentence says which. Criterion M27.
     */
    /*
     * TWENTY-THREE SINCE 6 SEPTEMBER 2026, when the Embassy got a row directly under Worlds, in the
     * same part of the sidebar. It was reachable from the Worlds page and
     * from nowhere else, so getting to it meant two presses and remembering which page held the
     * link. Criterion M56.
     */
    /*
     * TWENTY-FOUR SINCE 6 SEPTEMBER 2026, when Role cards got a row directly under the Embassy, as
     * their way in from the interface. Before, the only places the cards could be seen were
     * a file in a checkout and five records whose page drew nothing of the card. It sits
     * in the foot beside Worlds and the Embassy because the cards are one declaration for the whole
     * installation and narrow to no project. Criterion P44.
     */
    /*
     * TWENTY-FIVE SINCE 11 SEPTEMBER 2026, when the office regulations got a row, criterion G5. It
     * sits under the Role cards in the foot: the cards say what each role must keep, and this says
     * the person's own constraints and the chapters the agents read — one declaration for the whole
     * installation, so it narrows to no project, like the rows beside it.
     */
    // TWENTY-SIX SINCE 14 SEPTEMBER 2026, when Tasks to take got a row, criterion F16 point 2: the
    // left-bar entry onto the packaged-tasks column. It is in the rail, so the rail count moves with
    // it, 24 to 25.
    // TWENTY-SEVEN SINCE 15 SEPTEMBER 2026, when the Shelved page got a row, criterion S2 of
    // design/shelved/ACCEPTANCE.md. A shelved direction leaves the open loops on purpose, so the
    // page that lists what is on the shelf is the one place it can still be found; a row that is
    // not in the rail would hide the shelf the criterion exists to make readable. It is in the
    // rail, so the rail count moves with it, 25 to 26.
    // TWENTY-EIGHT SINCE 15 SEPTEMBER 2026, when the goals-and-clusters page got a row, criterion P5
    // of design/planning/ACCEPTANCE.md. The schedule answers when the hours go and this answers what
    // the work is FOR, so it sits beside the schedule. It is in the rail, so the rail count moves
    // with it, 26 to 27.
    // TWENTY-NINE SINCE 24 SEPTEMBER 2026, when the counters page got a row, criterion CT8 of
    // design/counters/ACCEPTANCE.md, decision uLV_1NVD8jeV point 15. A counter counts something in
    // one project and does one thing when it has counted enough, so its row sits in the Project
    // group right after Tasks to take. It is in the rail, so the rail count moves with it, 27 to 28.
    // THIRTY SINCE 25 SEPTEMBER 2026, when the toolset catalogue got a row, piece P3 of plan
    // KP0udNekYcAo. It sits in the foot under the office
    // regulations. It is in the rail, so the rail count moves with it, 28 to 29.
    // THIRTY-ONE SINCE 29 SEPTEMBER 2026, when the Casting table got a row: it stands in the Agents group beside the
    // role cards. It is in the rail, so the rail count moves with it, 29 to 30.
    // THIRTY-TWO SINCE 3 OCTOBER 2026, when the interrupted runs page got a row, criterion W7 of
    // design/window/ACCEPTANCE.md: a page of the runs
    // that stopped half way, with one press to resume each. It stands in the Agents group after the
    // Office Map, which shows the runs at work. It is in the rail, so the rail count moves with it,
    // 30 to 31.
    // THIRTY-THREE SINCE 4 OCTOBER 2026, when Terminal management got a row (wave 13u; the review
    // of the terminal design): a page for developers of every terminal the office holds. It
    // stands in the Developer group after the agent runs. It is in the rail, so the rail count moves with it, 31 to 32.
    // THIRTY-FOUR SINCE 8 OCTOBER 2026, when Resources got a row (wave 13s round 30; design peyJSnLoz_Bk,
    // approved in a decision): who holds the host GPU and the full-suite seat, who is booked next, and this week's
    // use. It stands under All projects after Schedule. It is in the rail, so the rail count
    // moves with it, 32 to 33. THIRTY-FIVE when the merge queue page got a
    // row (wave 13p round 30, option A of a decision): the entries of one project on their way into main, lane by
    // lane. It stands in the Project group after Pipelines. It is in the rail, so the rail
    // count moves with it, 33 to 34.
    // THIRTY-SIX SINCE 9 OCTOBER 2026, when Checklists got a row (wave 13n round 52): everybody's checklists in every
    // project. It stands under All projects after Counters. It is in the rail, so the rail
    // count moves with it, 34 to 35.
    // THIRTY-SEVEN SINCE 10 OCTOBER 2026, when Words for you to confirm got a row (wave 13q round 45, look A of design
    // report U03yQALS7iod): the notes a secretary wrote down from the person's words, waiting for them in every
    // project. It stands under All projects after Decisions. It is in the rail, so the rail
    // count moves with it, 35 to 36. Criterion change:
    // THIRTY-EIGHT SINCE 11 OCTOBER 2026, when Flows got a row (wave 13p round 35): every project's flows, which two
    // decisions settled. It stands under All projects after Checklists.
    // It is in the rail, so the rail count moves with it, 36 to 37. It said 37, 36 and 37. Criterion change:
    // THE HISTORY ABOVE CLOSES ON 11 OCTOBER 2026, wave 13t round 36. It said: the destinations
    // are 38, 37 of them are in the rail, and the addresses are
    // 38. Each new page changed those three numbers on three lines side by side, so two branches that each added a page
    // conflicted here although their pages had nothing to do with each other. A row dropped by accident is still
    // caught: every key is written out once, group by group, in 'draws the groups in the order of the decision' below,
    // and 'puts every destination but Messages in exactly one named group or at the foot' checks that those keys,
    // Settings and Messages are the destinations exactly. What this case says instead of the numbers is that no two
    // rows share an address, and which rows are out of the rail, by key.
    const addresses = S.DESTINATIONS.map((d) => d.to)
    expect(new Set(addresses).size, 'two rows share an address').toBe(addresses.length)
    expect(S.DESTINATIONS.filter((d) => !d.rail).map((d) => d.key), 'a row is out of the rail').toEqual(['sheet'])
    for (const destination of S.DESTINATIONS) {
      expect(parseRoute(`#${destination.to}`).name, `${destination.label} opens the wrong page`).toBe(destination.page)
    }
  })

  it('gives the pipelines page its own address, which it never had', () => {
    expect(parseRoute('#/pipeline').name).toBe('pipeline')
    const pipeline = S.DESTINATIONS.find((d) => d.key === 'pipeline')
    expect(pipeline?.to).toBe('/pipeline')
  })

  it('lights up the Modules row on the modules page, which it could never do', () => {
    /**
     * THE DEFECT. The row carried `marks: false`, with the reason "modules have no page of their
     * own, so it opens Records". That was true once and stopped being true when ModulesPage was
     * written: `#/modules` is its own route, App.tsx draws it, and the page is headed Modules. So
     * one row in the rail could never say "you are here", on a page that exists — and nothing
     * failed, because the field said it was on purpose.
     *
     * The field is gone with the exception it existed for. Every row marks the page it opens.
     */
    const modules = S.DESTINATIONS.find((d) => d.key === 'modules')
    expect(modules?.page).toBe('modules')
    expect(modules === undefined ? null : S.markFor(modules, 'modules')).toBe('page')
    expect(modules === undefined ? null : S.markFor(modules, 'records')).toBe(null)
  })
})

// ---------------------------------------------------------------------------- the rail's shape

describe('the rail separates shared destinations from this project', () => {
  // The order comes from a decision.
  it('draws the groups in the order of the decision', () => {
    // The project's pages stand in their block under All projects, and Settings is at the foot.
    // Criterion change (wave 13q round 14): Goals, Counters, Context bundles and All records left the
    // project block and follow the rows already under All projects, after a decision.
    // Criterion change (wave 13q round 44): Messages left the project block and stands in no group; messages are
    // read in the chat, which reads across projects. Criterion change (wave 13q round 45):
    // Words for you to confirm stands after Decisions. Criterion
    // change (wave 13p round 35): Flows joined after Checklists, on the word of a decision.
    // Test change (wave 13u round 242, package KN-1): Knowledge joined after Flows, the one new row the knowledge page's drawing drew.
    // Criterion change (wave 13t round 36): each group was one line, so two pages added to the same group
    // conflicted. One key per line, so two rows added in different places go into different
    // places here too. Criterion change (wave 13y round 125, the decision in message 068zuX0EZMQu): Gates and Office
    // controls left Settings for pages of their own. Gates stands after Office regulations, and Office controls ends
    // Developer. Criterion change (wave 13u round 216, package BV): the project board stands under This project
    // after Pipelines, since each of its rows is a step of the master pipeline. Criterion
    // change (wave 13y round 167, point QN-2 of the quick notes): My notes stands after Reports, as option C's step
    // 6 picture draws it, and lists every quick note of every project.
    expect(S.SHIPPED_RAIL_GROUPS.map(group => S.groupRows(group).map(row => row.key))).toEqual([
      [
        'home',
        'decisions',
        'yourWords',
        'notes',
        'myNotes',
        'work',
        'schedule',
        'resources',
        'plans',
        'horizons',
        'counters',
        'checklists',
        'flows',
        'knowledge',
        'bundles',
        'records',
      ],
      [
        'modules',
        'pipeline',
        'board',
        'mergequeue',
        'findings',
        'ideas',
        'shelved',
      ],
      [
        'working',
        'interrupted',
        'agents',
        'tasksToTake',
        'roles',
        'casting',
        'toolset',
        'honourBoard',
      ],
      [
        'embassy',
        'regulations',
        'gates',
        'readiness',
        'signingPackages',
        'versionHistory',
      ],
      [
        'sessions',
        'terminals',
        'usage',
        'queries',
        'worlds',
        'placeholders',
        'sheet',
        'officeControls',
      ],
    ])
  })

  // Test change (wave 13y round 165): the groups are captioned on All pages, and the sidebar draws no caption.
  it('names every group on All pages and omits Developer in normal mode', () => {
    expect(S.SHIPPED_RAIL_GROUPS.map(group => group.caption)).toEqual(['All projects', 'This project', 'Agents', 'Office', 'Developer'])
    expect(draw({ status: 'ready', value: reply() })).not.toContain('shell-cap-')
    const html = drawAllPages()
    for (const group of S.railGroups().filter(group => !group.developer)) {
      expect(html).toContain(`aria-labelledby="ap-cap-${group.key}"`)
    }
    // The project block is named by the project's own name. Test change (wave 13y round 165): it stands in the
    // sidebar again.
    expect(draw({ status: 'ready', value: reply() })).toContain('class="sbp-block" aria-labelledby="sbp-name"')
    expect(html).not.toContain('ap-cap-developer')
  })

  it('keeps a page that ignores the project switcher out of "Project"', () => {
    /**
     * THE CAPTION IS A CLAIM ABOUT EVERY ROW UNDER IT, so it can be wrong, and it was: `#/work`
     * reads GET /api/work, which is every project's work, and `#/decisions` reads GET /api/forks,
     * which takes no project at all. Both were drawn under the rooms of the project in the
     * switcher. A reader learning where numbers come from learnt the wrong thing from two of the
     * ten rows.
     *
     * The declaration is `everyProject` on the row, and this is what stops the two drifting apart
     * again — moving such a row into the second group fails here rather than misleading somebody.
     *
     * THE CHECK IS "NOT IN THE PROJECT'S GROUP", NOT "IN THE FIRST GROUP", and the difference is
     * Settings. It spans every project, and it is in NEITHER named group: it is about this browser,
     * so it is drawn on its own below the rule at the foot. Requiring the first group would have
     * been the shortcut passing for the rule while every such row happened to be in a group.
     */
    const inGroup = (key: string) =>
      S.SHIPPED_RAIL_GROUPS.find((g) => g.keys.includes(key))?.key ?? 'no group'
    for (const destination of S.DESTINATIONS) {
      if (destination.everyProject !== true) continue
      expect(
        inGroup(destination.key),
        `"${destination.label}" does not narrow to the project and is drawn under "Project"`,
      ).not.toBe('project')
    }
    // Both directions of one claim: nothing under the second caption may ignore the switcher.
    const project = S.SHIPPED_RAIL_GROUPS.find((g) => g.key === 'project')
    for (const row of project === undefined ? [] : S.groupRows(project)) {
      expect(row.everyProject, `"${row.label}" is under the project's caption and spans projects`).toBeUndefined()
    }
    // And the rows that do span every project are named, so this cannot pass by there being none.
    expect(S.DESTINATIONS.filter((d) => d.everyProject === true).map((d) => d.key)).toEqual([
      // HOME AND NOTES, from 14 October 2026 (wave 13r round 5, item 2; cYujzIgA5iBQ and yreP4qPJlY0e), and a
      // decision. Criterion change: the top bar now reads this mark and not the page's group,
      // so a page that reads every project carries it. Home's sections read every project, and so does the Notes page.
      'home',
      'plans',
      'work',
      'schedule',
      // RESOURCES, from 8 October 2026 (wave 13s round 30). The host GPU and the test seat are the
      // machine's, so the row narrows to no project.
      'resources',
      // GOALS, CONTEXT BUNDLES, COUNTERS AND ALL RECORDS, from 30 September 2026, under a
      // decision. Their pages read across projects since wave 13j's round 14, and their rows
      // stand under All projects.
      'horizons',
      'decisions',
      'bundles',
      'counters',
      // WORDS FOR YOU TO CONFIRM, from 10 October 2026, wave 13q round 45. The page
      // reads the notes waiting for the person in every project, and its row stands under All projects.
      'yourWords',
      // CHECKLISTS, from 9 October 2026 (wave 13n round 52). The page reads everybody's checklists
      // in every project, and its row stands under All projects.
      'checklists',
      // FLOWS, from 11 October 2026 (wave 13p round 35), as a decision asked. Criterion
      // change: the page reads every project's flows, and its row stands under All projects after Checklists.
      'flows',
      // KNOWLEDGE, wave 13u round 242, package KN-1: the library stands outside projects, so its row narrows to none of them.
      'knowledge',
      'notes',
      // MY NOTES, from 15 November 2026 (wave 13y round 167, point QN-2 of the quick notes). Criterion change: the page
      // lists every quick note of every project, and its row stands under All projects after Notes.
      'myNotes',
      'records',
      // EVERY TERMINAL THE OFFICE HOLDS, from 4 October 2026 (wave 13u). The terminal holder holds the
      // terminals of every project, so the row narrows to none of them.
      'terminals',
      // WHICH WORLDS THIS INSTALLATION HAS, from 4 September 2026. A world holds every project it
      // has, so a row that opens the office narrows to none of them.
      'worlds',
      // AND WHO THOSE WORLDS HOLD, from 6 September 2026. A citizen belongs to a world and to no
      // project, so the same reason applies to the row under Worlds. Criterion M56.
      'embassy',
      // AND WHAT EACH OF THEM MAY DO, from 6 September 2026. The role cards are one declaration for
      // the whole installation, so the list of them narrows to no project either. Criterion P44.
      'roles',
      // AND WHAT EACH ROLE IS CAST WITH, from 29 September 2026. The Casting
      // table belongs to the whole installation, so its row narrows to no project either.
      'casting',
      // AND WHAT THE OFFICE ITSELF MUST KEEP, from 11 September 2026. The chapters are one
      // declaration for the installation and the regulations bind their person or their role, so
      // this row narrows to no project either. Criterion G5.
      'regulations',
      // AND THE GATES THAT HOLD IT TO THEM, from 2 November 2026 (wave 13y round 125). Criterion change: the gates were a
      // Settings panel and are now a page of the Office group. They are the office's, so the row narrows to no project.
      'gates',
      // AND WHAT WAITS FOR A SIGNATURE, from 10 October 2026 (wave 13u round 13). A readiness checklist may be raised
      // in any project and an agent signs from wherever it works, so the row narrows to no project either.
      'readiness',
      'signingPackages',
      'settings',
      // AND THE OFFICE'S OWN CONTROLS, from 2 November 2026 (wave 13y round 125). Criterion change: they were a
      // developer-only panel on Settings and are now the Developer group's last page. Like Settings, they are the office's.
      'officeControls',
    ])
  })

  it('reads a row label from the shared declaration rather than typing it again', () => {
    // The rail row, the page title and the facet bar on Everything all print the family's label.
    // `WorkPage.tsx` used to open with a hard-coded "Work" beside this table's "Work" — one fact in
    // two places, and nothing would have failed when one of them changed.
    //
    // ONE ROW NAMES A FAMILY AND IS NOT NAMED BY IT. The decisions row opens the governance queue,
    // which holds forks, questions an agent asked and anything set aside — so it is called what the
    // queue is called, out of `SURFACES`, and it still names the family so that a proposal and a
    // decision are reachable from it. Its label is a shared declaration too; it is a different one.
    //
    // AND ONE ROW IS SHORTER THAN ITS PAGE, BY NAME. Plan row S1 calls the notes row "Reports"; its
    // page keeps the heading "Reports and notes" until the Reports piece renames it (scope message
    // hhjUiQ-8MiU-). Any other row that parts from its family's name fails here.
    const NAMED_APART: Record<string, string> = { decisions: SURFACES['rail.decisions'], notes: 'Reports' }
    for (const group of S.SHIPPED_RAIL_GROUPS) {
      for (const destination of S.groupRows(group)) {
        if (destination.family === undefined) continue
        const expected = NAMED_APART[destination.key] ?? KIND_FAMILIES[destination.family].label
        expect(destination.label, destination.key).toBe(expected)
      }
    }
  })

  it('indents nothing under anything, and never brings back a heading that names nothing', () => {
    // THE TWO DEFECTS THIS CLOSES, both measured in the live rail. The one heading was "TOOLS",
    // over the two least-used rows, describing neither. And the same indent meant two opposite
    // things: Sessions under What happened, where the child holds what the parent excludes, and
    // Modules under Structure, where the parent holds what the child holds.
    //
    // The two captions the rail has now are not that heading returning: they name the one
    // difference that must be made clear, and the test above checks each is true of every
    // row under it. "TOOLS" could pass no such check, which is the whole difference.
    const html = draw({ status: 'ready', value: reply() })
    expect(html).not.toContain('shell-heading')
    expect(html).not.toContain('data-under')
    // AS A WORD, since 25 September 2026: the rail row "Toolset" holds the letters and is not the
    // heading. The old heading was the word "Tools" on its own.
    // The word is looked for in everything drawn except the rows' own descriptions, one of which
    // says "Tools and services" and is not a heading.
    const drawn = html.replace(/ title="[^"]*"/g, '')
    expect(drawn).not.toMatch(/\bTools\b/)
    expect(html).not.toMatch(/\bTOOLS\b/)
  })

  it('carries nothing in the navigation column but the places you can go', () => {
    // What used to sit in here and compete: a row's worth of the top of the attention list, and a
    // fold explaining what the badges counted. A frame is the one copy of itself a reader cannot
    // dismiss, so anything in it that is not navigation is on every screen for ever.
    const html = draw({
      status: 'ready',
      value: reply({ visible: [row({ key: 'a', recordKind: 'problem', title: 'The E-stop path is a no-op' })] }),
    })
    expect(html).not.toContain('shell-signal')
    expect(html).not.toContain('shell-legend')
    expect(html).not.toContain('The E-stop path is a no-op')
  })

  it('puts every destination but Messages in exactly one named group or at the foot', () => {
    // Criterion change (wave 13q round 44): every destination stood in a group or at the
    // foot. Messages now stands in neither. It stays a destination, because
    // its page is named by it, and it is reached from the chat's foot rather than from a row.
    const keys = [...S.SHIPPED_RAIL_GROUPS.flatMap(group => group.keys), ...S.FOOT_ROW_KEYS]
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).not.toContain('messages')
    expect([...keys, 'messages'].sort()).toEqual(S.DESTINATIONS.map(row => row.key).sort())
    expect(S.FOOT_ROW_KEYS).toEqual(['settings'])
    expect(S.SHIPPED_RAIL_GROUPS.find(group => group.key === 'developer')?.keys).toContain('sheet')
  })

})

// ---------------------------------------------------------------------------- settings

describe('the column answers where you can go, and holds no setting at all', () => {
  it('draws no configuration control in the column, because every one of them is on #/settings', () => {
    /**
     * THE RULE, AS A CHECK: the main rail answers where a person can go; product configuration
     * lives under Settings.
     *
     * Four controls used to sit at the foot of this column on every page — who a write is
     * attributed to, the Normal and Developer switch, a link to the component sheet, and a fold
     * holding the theme, density, corners and type. Each word below is one of their captions, so
     * this fails the moment one comes back. The light or dark switch at the foot is not one of
     * them: it writes the one stored theme through `choosePreset`, and
     * tests/the-sidebar-project-block.test.ts holds it to that.
     */
    const html = draw({ status: 'loading' })
    for (const word of ['Acting as', 'Detail', 'Appearance', 'Theme', 'Density', 'Corners']) {
      expect(html, `"${word}" is a setting and it is back in the navigation column`).not.toContain(word)
    }
    expect(html, 'the appearance controls are back in the column').not.toContain('presetbar')
    expect(html, 'the detail switch is back in the column').not.toContain('viewswitch')
  })

  // This test cites a decision.
  it('puts Settings at the foot and in no group', () => {
    const html = draw({ status: 'loading' })
    const settings0 = S.DESTINATIONS.find(row => row.key === 'settings')
    expect(settings0?.to).toBe('/settings')
    expect(settings0?.page).toBe('settings')
    // It is a place, so it marks itself when you are on it and it keeps its icon in the rail.
    expect(settings0 === undefined ? 'x' : S.markFor(settings0, 'settings')).toBe('page')
    expect(settings0?.rail).toBe(true)
    expect(S.SHIPPED_RAIL_GROUPS.filter(group => group.keys.includes('settings')).map(group => group.key)).toEqual([])
    const foot = html.indexOf('class="sbp-foot"')
    expect(foot).toBeGreaterThan(0)
    expect(html.indexOf('href="#/settings"')).toBeGreaterThan(foot)
    expect(html.slice(0, foot)).not.toContain('href="#/settings"')
  })

  it('names the person at the foot and says so there when the page writes as somebody else', async () => {
    /**
     * THE "WRITING AS" LINE WENT: the foot now names the person. A write
     * attributed to somebody else with nothing on screen saying so is still a silent default, so
     * when developer mode has made the page write as an agent, the foot says it in words, and it
     * keeps saying it after the page goes back to normal mode.
     */
    const html = draw({ status: 'loading' })
    expect(html).not.toContain('Writing as')
    expect(html).not.toContain('shell-writer')
    const foot = html.slice(html.indexOf('class="sbp-foot"'))
    expect(foot, 'the actor picker is back in the column').not.toContain('<select')
    expect(foot).toContain('href="#/settings"')
    const api = await import('../src/web/api.ts')
    const was = api.getActor()
    try {
      api.setActor({ type: 'agent', id: 'claude', sessionId: 'web-test' })
      const writing = draw({ status: 'loading' })
      expect(writing).toContain('class="sbp-writer"')
      expect(writing).toContain('Writing as claude (agent), not as you')
    } finally {
      api.setActor(was)
    }
  })

  it('does not offer to switch the product into another design', () => {
    // "Comparing 3 designs" was a row here. It let a reader switch four surfaces between two
    // complete designs, and a first-time reader who pressed it could not find the way back. Round
    // four settled all three questions — see the note on `SettingsBlock` for which answer each one
    // kept — and the row went with them. This test only pins the rail.
    const html = draw({ status: 'loading' })
    expect(html, 'the design switcher is back in the rail').not.toContain('Comparing')
  })

  it('keeps the component sheet out of the column entirely, and behind Developer detail', () => {
    // A gallery of every component in every state is not a place in anybody's project. It is now
    // reached from the Settings page, and only when Detail is Developer — conditionally rendered
    // rather than hidden with CSS, so a screen reader in Normal detail does not read out a link to
    // a page the reader has not asked to see.
    const sheet = S.DESTINATIONS.find((d) => d.key === 'sheet')
    expect(sheet?.rail).toBe(false)
    // The row says what the page it opens says, word for word. It read "Component sheet" over a
    // page headed "Mole Office component sheet" — the one row-against-heading disagreement live in the
    // product when this pass began.
    expect(sheet?.label).toBe('Mole Office component sheet')
    // Not in the sidebar in either detail level any more: the sidebar never reads the mode.
    expect(draw({ status: 'loading' })).not.toContain(sheet?.to ?? '/ui')
  })
})

// ---------------------------------------------------------------------------- the counts

describe('what a number in the frame means', () => {
  it('counts what a person can act on now for the Home row, which is what the page opens with', () => {
    // PROBLEM zKalIBZccv9F. This badge counted the whole selection — 1,382 on the live corpus,
    // beside a page whose ranked list opens with 7. The count a person can act on is the number
    // the page lists first, from `needsSomebodyNow`; the rest is one line under the list.
    const r = reply({
      visible: [row({ key: 'a', recordKind: 'problem' })],
      remainder: [row({ key: 'b', recordKind: 'problem' }), row({ key: 'c', recordKind: 'session' })],
    })
    expect(S.badgeCount(r, { of: 'everything' })).toBe(1)
  })

  it('counts a destination by the kind of record its rows belong to', () => {
    const r = reply({
      visible: [row({ key: 'a', recordKind: 'session' })],
      remainder: [row({ key: 'b', recordKind: 'session' }), row({ key: 'c', recordKind: 'module' })],
    })
    expect(S.badgeCount(r, { of: 'kind', kind: 'session' })).toBe(2)
    expect(S.badgeCount(r, { of: 'kind', kind: 'module' })).toBe(1)
    expect(S.badgeCount(r, { of: 'kind', kind: 'pipeline' })).toBe(0)
  })

  it('uses the server count when more selected rows are behind the next page', () => {
    const held = Array.from({ length: ATTENTION_PART_ROWS }, (_, index) => row({ key: `held-${String(index)}`, recordKind: 'session' }))
    const total = held.length + 2
    const r = reply({
      visible: [row({ key: 'shown', recordKind: 'session' })],
      remainder: held,
      remainderNext: `/api/attention?shape=part&part=homeRemainder&from=${String(ATTENTION_PART_ROWS)}`,
      badgeCounts: { byKind: { session: total }, byFamily: {}, safety: false },
    })
    expect(S.badgeCount(r, { of: 'kind', kind: 'session' })).toBe(total)
  })

  it('counts a stopped pipeline block under `block`, because a block is a record of its own', () => {
    // IT USED TO COUNT UNDER `pipeline`, because a step was a nested object carrying its parent's
    // kind. A block is a record with its own kind, so the rail counts it as itself — and a reader
    // clicking the pipeline count gets pipelines rather than a mixture of two things.
    const r = reply({ visible: [row({ key: 'rec:hv2-04', recordKind: 'block', shape: 'record' })] })
    expect(S.badgeCount(r, { of: 'kind', kind: 'block' })).toBe(1)
    expect(S.badgeCount(r, { of: 'kind', kind: 'pipeline' })).toBe(0)
  })

  it('reports safety from the row the server marked, and never from a title', () => {
    expect(S.anySafety(reply({ visible: [row({ key: 'a', recordKind: 'problem' })] }))).toBe(false)
    expect(
      S.anySafety(reply({ remainder: [row({ key: 'a', recordKind: 'problem', safety: true })] })),
    ).toBe(true)
  })
})

// ---------------------------------------------------------------------------- remembering

describe('the chosen width is remembered', () => {
  const fake = (initial: string | null) => {
    let held = initial
    return {
      getItem: () => held,
      setItem: (_k: string, v: string) => {
        held = v
      },
      removeItem: () => {
        held = null
      },
      read: () => held,
    }
  }

  it('starts expanded when nothing has been chosen, with nothing to complain about', () => {
    const store = fake(null)
    expect(S.readSidebarState(store)).toEqual({ state: 'expanded', fault: null })
  })

  it('gives back what was chosen', () => {
    expect(S.readSidebarState(fake('collapsed')).state).toBe('collapsed')
    const store = fake(null)
    expect(S.writeSidebarState(store, 'collapsed').fault).toBe(null)
    expect(store.read()).toBe('collapsed')
  })

  it('says so when a stored width is one this build has never heard of', () => {
    // Not silently defaulted: a value this build does not know means a downgrade or a hand-edited
    // store, and quietly ignoring it is how a control comes to look broken.
    const answer = S.readSidebarState(fake('half'))
    expect(answer.state).toBe('expanded')
    expect(answer.fault).toBe('The saved sidebar width is unavailable.')
  })

  it('says so when the browser refuses to remember anything, rather than failing silently', () => {
    const refusing = {
      getItem: () => {
        throw new Error('storage is disabled')
      },
      setItem: () => {
        throw new Error('storage is disabled')
      },
      removeItem: () => {},
    }
    expect(S.readSidebarState(refusing).fault).toBe('This browser could not read the saved sidebar width.')
    expect(S.writeSidebarState(refusing, 'collapsed').fault).toBe('The width changed, but this browser could not save it.')
  })
})

// ---------------------------------------------------------------------------- what it draws

describe('what the sidebar draws', () => {
  it('names every destination it draws, and every family has an address of its own', () => {
    // Test change (wave 13y round 165): the rows not in front are drawn on All pages, so the two are read together.
    const html = draw({ status: 'ready', value: reply() }) + drawAllPages()
    // Developer destinations are absent from normal navigation.
    // Criterion change (wave 13q round 44): every other destination was drawn.
    // Messages is now drawn nowhere in the sidebar, and every other one still is.
    for (const destination of S.DESTINATIONS) {
      if (S.railGroups().some(group => group.developer && group.keys.includes(destination.key))) continue
      if (destination.key === 'messages') {
        expect(html).not.toContain(`>${destination.label}<`)
        continue
      }
      expect(html).toContain(`>${destination.label}<`)
    }

    // Every family has an address and a row of its own, so a kind with no page of its own is
    // reached by going to its family rather than by recognising its type name in a list of them.
    // DERIVED FROM KIND_FAMILIES rather than typed out, for the reason the previous version of
    // this test learned the hard way: a list of kinds written here is a second copy of one the
    // sidebar already reads, which is the defect this codebase keeps producing, in a test.
    for (const [key, family] of Object.entries(KIND_FAMILIES)) {
      // `structure` is the one family with no row: its page survives at #/structure, and its
      // kinds are on the Modules and Pipelines rows. That is the brief's own decision, and the
      // "way in to every kind" test above is what keeps it honest.
      if (key === 'structure') continue
      // THE ROW THAT NAMES THE FAMILY, rather than the family's key as an address and its label as
      // words. The decisions family's row opens the governance queue at `#/governance` and is
      // called "Waiting on you"; asserting the key and the label would be this test insisting a
      // family's page can never be named after what it holds. What it is protecting — that every
      // family is reachable from the rail, by a row a person can read — is unchanged.
      const row = S.DESTINATIONS.find((d) => d.family === key)
      expect(row, `the ${family.label} family has no row in the rail`).toBeDefined()
      if (row === undefined) continue
      expect(html, `the ${family.label} family has no address in the rail`).toContain(`href="#${row.to}"`)
      expect(html, `the ${family.label} family is not named in the rail`).toContain(`>${row.label}<`)
    }
    // And the identifiers themselves are off the screen. `wanna_try` is the clearest case: it is a
    // column value, and it was navigation.
    expect(html, 'a record kind is still being offered as a navigation word').not.toContain('idea · wanna_try')
  })

  // Test change (wave 13y round 165): the case that compared the list of rows declared with a count, and a fixed
  // sentence, is taken out, because it read only that list and those words. Case 12 of
  // tests/the-sidebar-in-one-style.test.ts checks in a browser that Reports and Checklists each draw 1 when one
  // report is unread and one step waits on the person, and that no entry draws a mark at nought. The case below
  // checks the Decisions count.

  it('counts what a person can settle now beside Waiting, which is what the page opens with', () => {
    // PROBLEM 8woJrf898igd, and the one-function rule it hangs on: the badge reads `railCount`,
    // one function over the same reply the page reads. The reading below has one settle-tier row and
    // one asked row that is not an agent's ask; the badge counts the settle tier.
    const html = draw(
      {
        status: 'ready',
        value: reply({
          visible: [row({ key: 'a', recordKind: 'problem', title: 'The E-stop path is a no-op' })],
          remainder: [row({ key: 'b', recordKind: 'session' })],
        }),
      },
      false,
      { status: 'ready' as const, value: waitingReply(1, 1) },
    )
    expect(html).toContain('>1</span>')
    expect(html).not.toContain('>2</span>')
    // AND NOT A SECOND COUNT WORKED OUT IN THE FRAME. The rail's badge takes its number from the
    // function the page reads; a surface that counts the whole reading again is the disagreeing
    // badge the owner met on 16 September 2026 (problem 8woJrf898igd).
    const source = read('src/web/components/Sidebar.tsx')
    expect(source).toContain('railCount(waiting)')
    expect(source).not.toContain('oneNumber(waiting)')
  })

  it('counts an agent asking to come in or for a card, which only the person’s press answers', () => {
    // A DECISION: the rail's number holds what truly waits on the person to decide or act, and an agent asking to
    // come in or for a card is in it. It completes problem NXEhOBumu5ZZ, whose fix asks
    // that the rail's number and the rows Home draws agree. The other asked rows stay out of the badge, as
    // problem 8woJrf898igd settled.
    const reading = waitingReply(1, 2)
    reading.items[1] = { ...reading.items[1]!, act: 'give-card' }
    const html = draw(
      { status: 'ready', value: reply({ visible: [row({ key: 'a', recordKind: 'problem', title: 'The E-stop path is a no-op' })] }) },
      false,
      { status: 'ready' as const, value: reading },
    )
    expect(html, 'one to settle and one agent at the door').toContain('>2</span>')
    expect(html, 'the asked row that is not the person’s press stays out').not.toContain('>3</span>')
  })

  it('does not put a project count or safety state on the shared Home entry', () => {
    const html = draw({ status: 'ready', value: reply({ visible: [row({ key: 'a', recordKind: 'problem', safety: true })] }) })
    expect(S.DESTINATIONS.find(row => row.key === 'home')?.badge).toBeNull()
    expect(html).not.toContain('data-safety="1"')
  })

  it('shows no number at all when the server could not be reached', () => {
    // The wrong answer is a zero. "Nothing needs you" and "Mole Office could not ask" must never be
    // drawn the same way, and a frame is exactly where that mistake would go unnoticed.
    const html = draw({ status: 'error', message: 'fetch failed' }, false, { status: 'error', message: 'fetch failed' })
    expect(html).toContain('Counts unavailable')
    expect(html).not.toContain('shell-badge')
  })

  it('says it is still counting rather than showing an empty frame', () => {
    const html = draw({ status: 'loading' }, false, { status: 'loading' })
    expect(html).toContain('Counting…')
    expect(html).not.toContain('shell-badge')
  })

  it('keeps the drawer out of the page until it is asked for', () => {
    expect(draw({ status: 'loading' })).toContain('data-drawer="closed"')
    const open = draw({ status: 'loading' }, true)
    expect(open).toContain('data-drawer="open"')
    // The scrim only exists while the drawer does; a permanent invisible overlay would swallow
    // every click on the page behind it.
    expect(open).toContain('shell-scrim')
    expect(draw({ status: 'loading' })).not.toContain('shell-scrim')
  })

  it('draws the same foot in the phone menu as at the desk', () => {
    // The phone can still open the new-record form, so the drawer carries the same foot: the person's name,
    // the light or dark switch and Settings.
    const html = draw({ status: 'loading' }, true)
    expect(html).toContain('class="sbp-foot"')
    expect(html).toContain('class="sbp-look"')
  })

  /**
   * THE CONTROL DOES NOT PRINT THE STORED ACTOR TYPE.
   *
   * Its three options read the owner's id with "(human)", then "claude (agent)" and "panelx (system)" — the value of
   * the `actor_type` column, on screen. The change rows on Home and on a record page were fixed to
   * say "person" and the product's name at the same time as this; fixing those and not this would put
   * "person" on a change row and "human" four inches to its left.
   *
   * THE STORED WORDS ARE ASSERTED ABSENT AS WELL. "person" appearing somewhere would pass a check
   * for the reader's word on its own, even if "human" were still printed beside it.
   *
   * IT IS RENDERED ON ITS OWN rather than sliced out of a page, and that is not tidiness. Written
   * against the whole sidebar, the absent-word half used to fail on the theme menu's "Auto
   * (system)" — a different control, on the same screen, using one of these words for something
   * else entirely. The control now has a page of its own and this renders exactly it.
   */
  it('says who you are writing as in the reader’s words, not in the column’s', () => {
    const block = renderToStaticMarkup(h(S.WhoWritesControl))
    expect(block, 'the control was not found, so nothing about it was checked').toContain('option')

    expect(block).toContain(`${THE_TEST_OFFICES_OWNER.id} (person)`)
    expect(block).toContain('claude (agent)')
    // NOT "mole-office (Mole Office)". This product's own writes are stored under the id "mole-office"
    // (they said "panelx", the product's earlier name, before 1 October 2026) and the word for that kind
    // of writer is the product's name, so the name is not printed twice.
    expect(block).toContain('Mole Office')
    expect(block).not.toContain('mole-office (')
    expect(block).not.toContain('panelx (')
    expect(block).not.toContain('(human)')
    expect(block).not.toContain('(system)')
  })
})

// ---------------------------------------------------------------------------- the mark

describe('the product mark in the frame', () => {
  it('draws both forms with the shared component and dresses neither of them here', () => {
    const html = draw({ status: 'ready', value: reply() })
    // Both forms are in the markup at once. Which one is on screen is the collapsed rule's job, so
    // narrowing the rail is a CSS switch rather than a re-render.
    // THE MARK'S OWN NAME AND THE COLLAPSED FORM. Both forms were in the markup at once, and the
    // collapsed rail now draws the icon alone, with no "MO" text any
    // more, so the icon is drawn once and the letters are not drawn at all. See ui.test.ts for the
    // letters' own test.
    expect(html).toContain('<span class="px-wordmark-lead">Mole</span> Office</span>')
    expect(html).not.toContain('<span class="px-wordmark-lead">M</span>O</span>')
    // And the logo is shown in each form once, exactly two marks in the frame's head. Since
    // 25 September 2026 it is the owner's PNG logo, an image, and no longer a drawing.
    expect(html.match(/<img[^>]*class="px-wordmark-icon"/g)).toHaveLength(2)

    // THE DRIFT THIS PREVENTS, and it is the one that actually happened. The frame carried its own
    // `.shell-brand span { color: var(--accent) }`, whose descendant selector matched the WRAPPER
    // span as well as the highlighted half — so the accent was painted across the whole word and
    // the mark became one flat name with the distinction gone. Nothing failed: it is a stylesheet.
    // The frame may place the mark and set its size; colour and weight belong to the component.
    for (const [, body] of S.SIDEBAR_CSS.matchAll(/\.shell-brand[^{}]*\{([^}]*)\}/g)) {
      expect(body).not.toContain('var(--accent)')
      expect(body).not.toContain('font-weight')
    }
  })
})

// ---------------------------------------------------------------------------- the frame explains nothing

/**
 * Everything a reader sees BEFORE pressing anything, and nothing else.
 *
 * There is no DOM here, so a `<details>` cannot be opened and clicked. What CAN be checked, and
 * what the fold contract is actually about, is which words are inside a `<summary>` and which are
 * only behind one.
 */
function shownAtRest(html: string): string {
  return [...html.matchAll(/<summary[^>]*>([\s\S]*?)<\/summary>/g)]
    .map((match) => match[1] ?? '')
    .join(' ')
    .replace(/<[^>]+>/g, '')
}

describe('the frame navigates — it does not explain itself at all', () => {
  it('has no legend under the rail, because the badges no longer disagree with their pages', () => {
    // THE LEGEND EXISTED FOR ONE STATED REASON and that reason has been removed rather than
    // reworded. It read "Numbers: what needs you there, not how many exist", and it was on screen
    // because the badges disagreed with the pages they opened — the rail said "What happened 15"
    // over a page whose button said "Mark all 4 read". Every badge that could not say the page's
    // own number in the page's own words has been taken off its row. A legend for a number that
    // already agrees with its page is a sentence about nothing, on every screen, for ever.
    const html = draw({ status: 'ready', value: reply() })
    expect(html).not.toContain('shell-legend')
    expect(html).not.toContain('shell-note')
    expect(html).not.toContain('not how many exist')
    // And the rule it is replaced by is a note beside the table, not a string on the screen.
    expect(html).not.toContain(S.BADGE_RULE)
  })

  // Test change (wave 13y round 165): the sidebar holds one list with no group in it, and All pages shows every
  // group open, so nothing is folded in either.
  it('folds nothing, in the sidebar or on All pages', () => {
    const html = draw({ status: 'ready', value: reply() })
    expect(shownAtRest(html)).toBe('')
    expect(html).not.toContain('<details')
    expect(html).not.toContain('shell-fold')
    const all = drawAllPages()
    expect(all).not.toContain('<details')
    expect(all).toContain('id="ap-cap-all"')
  })

  it('has nothing left to say about plain words, because there are none', () => {
    const html = draw({ status: 'ready', value: reply() })
    expect(html).not.toContain('idea · wanna_try')
    expect(html, 'the frame still explains plain words it no longer draws').not.toMatch(/plain word/)
  })
})

// ---------------------------------------------------------------------------- the rail's geometry

/**
 * The stylesheet as selector-and-body pairs.
 *
 * `[^{}]` cannot cross a brace, so a `@media` wrapper never matches as a rule of its own and the
 * rules INSIDE it match on their own — which is the same trick the wordmark test above relies on.
 * A selector may come back with the comment above it attached, so every check here is a substring
 * check rather than an equality.
 */
function rulesOf(css: string): { selector: string; body: string }[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1] ?? '', body: m[2] ?? '' }))
}

/**
 * WHAT THESE TWO TESTS CAN AND CANNOT DO, SAID PLAINLY.
 *
 * There is no DOM in this runner and no browser, so nothing here measures a pixel. What they pin
 * is the MECHANISM in the stylesheet — which is where the defect was. The pixels were measured in
 * Chromium at 1440 with the real tokens, and the numbers are in the header of Sidebar.tsx: with
 * the labels in the flow, "Components" overflowed its own row by 2px at the default text size, by
 * 6px at the comfortable density, and by 12px with 4px of horizontal scroll in the nav column for
 * a reader whose browser base size is 20px. A test that claimed to have measured that would be
 * lying about how it was run.
 */
describe('the collapsed rail is geometry, not typesetting', () => {
  /** The desk block, from the 1024px media query to the phone one. Both markers are checked. */
  const collapsed = (): string => {
    const desk = S.SIDEBAR_CSS.indexOf(`@media ${THE_WIDE_FROM}`)
    const phone = S.SIDEBAR_CSS.indexOf(`@media ${THE_NARROW_FROM}`)
    expect(desk, 'the desk media query').toBeGreaterThan(-1)
    expect(phone, 'the phone media query').toBeGreaterThan(desk)
    return S.SIDEBAR_CSS.slice(desk, phone)
  }

  // Test change (wave 13y round 165): the case that read the narrowed rail's label rule out of the stylesheet is
  // taken out, because it read only that text. Narrowed, the entries draw no word, and case 2 of
  // tests/the-sidebar-in-one-style.test.ts measures in a browser that none is drawn and that each entry's name
  // shows beside it on hover and on keyboard focus, in English and in Chinese.

  it('sets its width in the same unit as its type, and with the density token', () => {
    const width = rulesOf(collapsed()).find((r) => r.body.includes('--sidebar-w:'))
    expect(width?.selector).toContain('[data-state="collapsed"]')
    const value = /--sidebar-w:([^;]+);/.exec(width?.body ?? '')?.[1] ?? ''
    // rem, because the type is in rem: a reader who raised their browser's base text size gets a
    // wider rail with the bigger digits instead of a clipped one. The old value was 88px, measured
    // off one screenshot of one word at one text size.
    expect(value).toContain('rem')
    // --pad, because a density preset changes the inner padding and would otherwise eat the room
    // the badge needs.
    expect(value).toContain('var(--pad)')
    expect(value).not.toMatch(/\d+px/)
  })

  it('keeps all of it above 1024px, because the drawer is always the full sidebar', () => {
    // A rail inside a 300px drawer would be a narrow thing inside a narrow thing. Every collapsed
    // rule lives inside the desk media query rather than hanging off the attribute alone.
    expect(S.SIDEBAR_CSS.indexOf(`@media ${THE_WIDE_FROM}`)).toBeGreaterThan(-1)
    expect(S.SIDEBAR_CSS.indexOf(`@media ${THE_WIDE_FROM}`)).toBeLessThan(
      S.SIDEBAR_CSS.indexOf('data-state="collapsed"'),
    )
  })
})

describe('the frame is set one step below the page', () => {
  it('sets every word in the column at the caption size, and the mark is the one exception', () => {
    // The column used to be --fs-2, which is the size the app's rows and body text are set in, so
    // a frame full of navigation read as another column of the document. This pins the rule rather
    // than the appearance: one size for the whole frame, one step below the page, and the mark
    // keeps --fs-3 because a mark that shrinks with the chrome stops being a mark. The project's
    // name in its block is the other exception: a decision takes proposal vVPo6PUlGNB-, which sets it in bold,
    // larger than a row, so it reads as what the rows belong to.
    const sized = rulesOf(S.SIDEBAR_CSS).filter((r) => /font-size:\s*var\(--fs-/.test(r.body))
    expect(sized.length).toBeGreaterThan(0)
    for (const rule of sized) {
      const size = /font-size:\s*var\(--fs-(\d)\)/.exec(rule.body)?.[1]
      const isMark = rule.selector.includes('.shell-brand') || rule.selector.trim() === '.sbp-name'
      expect(size, `${rule.selector.trim()} is set at --fs-${size}`).toBe(isMark ? '3' : '1')
    }
  })
})
