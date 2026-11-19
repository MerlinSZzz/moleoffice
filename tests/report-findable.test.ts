// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPORT IS FINDABLE FROM THE THING IT IS ABOUT, AND FROM THE FRONT DOOR.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THESE TESTS ARE ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * The owner's rule is that a formal report or review is read inside Mole Office, in the module or the
 * context it belongs to, rather than as a link to a page somewhere else. Three things have to be
 * true for that, and each has a section below:
 *
 *   1. THE RULE REPORTS A REPORT. A report is not work — it carries no state word, it cannot be
 *      late and nothing is blocked by it — so it must never be ranked against work, and it must
 *      never be filed under "records of this kind have no state field" either, which would say a
 *      report is a note nobody queries. It comes back in a list of its own with who it is for,
 *      which day it is about, and whether that person has read it.
 *
 *   2. HOME SHOWS ONE WAITING TO BE READ. In `--ask`, the hue that already means a person is
 *      waiting, and never as a row of the ranked list.
 *
 *   3. A MODULE'S PAGE SHOWS THE REPORTS WRITTEN ABOUT IT, read from the `about` links, because
 *      that is the only place what a report is about is stored.
 *
 * ---------------------------------------------------------------------------------------
 * THE EMPTY STATES ARE TESTED HARDER THAN THE FULL ONES, AND THAT IS DELIBERATE
 * ---------------------------------------------------------------------------------------
 *
 * There are no reports in this corpus. So on the day this ships every one of these surfaces is
 * empty, and an empty state that reads as "there are none" when the truth is "nobody has written
 * one" is the defect this product cares most about. Each empty state is checked for the sentence it
 * must say AND for the sentence it must not.
 *
 * The fixture is built by running the REAL rule over hand-made records, as tests/home-attention
 * does it and for the same reason: a hand-typed reply would let this file and the page agree with
 * each other while both disagreed with the rule.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  PASSED_OVER_SENTENCES,
  computeAttention,
  reportReading,
  type AttentionResult,
} from '../src/shared/attention.ts'
import type { Link, PanelRecord, RecordKind } from '../src/shared/types.ts'
import { en } from '../src/shared/words/en.ts'
import { attentionFirstPage, attentionPartOf } from '../src/shared/attention-first-page.ts'

/**
 * WHAT THESE RENDERS PASS FOR `declares`: see-through, because none of them reads a target.
 *
 * The panels below now take the answer from their caller's own `sectionsOf`. These tests read what
 * is INSIDE each panel — the words, the fold, the absence — so the see-through answer is the one
 * that leaves the markup they read exactly as it was.
 */
const SEE_THROUGH = { surface: null } as const


type AP = typeof import('../src/web/components/AttentionPanel.tsx')
type MV = typeof import('../src/web/components/ModuleView.tsx')
type WebApi = typeof import('../src/web/api.ts')

let ap: AP
let mv: MV
let webApi: WebApi

const NOW = new Date(2026, 7, 15, 12, 0, 0).getTime()

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
  webApi = await import('../src/web/api.ts')
  ap = await import('../src/web/components/AttentionPanel.tsx')
  mv = await import('../src/web/components/ModuleView.tsx')
})

// ---------------------------------------------------------------------------- the fixture

function stamp(daysAgo: number): string {
  const d = new Date(NOW - daysAgo * 24 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`
}

function record(id: string, kind: RecordKind, title: string, data: Record<string, unknown>, agedDays = 2): PanelRecord {
  return {
    id,
    kind,
    workspaceId: 'default',
    ownerId: THE_TEST_OFFICES_OWNER.id,
    title,
    summary: null,
    data,
    createdAt: stamp(agedDays),
    updatedAt: stamp(agedDays),
    deletedAt: null,
  }
}

function link(id: string, fromId: string, toId: string, type: Link['type']): Link {
  return { id, fromId, toId, type, inferred: false, createdAt: stamp(1), createdBy: 'agent:tester', createdByType: null }
}

const MODULE = record('rec-mod', 'module', 'Tray clamp calibration', { lifecycle: 'active' }, 30)

const REPORT_UNREAD = record(
  'rep-1',
  'report',
  'Owner review: where the gripper stands',
  {
    for: `${THE_TEST_OFFICES_OWNER.name}, who asked for the review`,
    date: '2026-08-14',
    read: 'unread',
    blocks: [{ id: 'b-1', type: 'text', text: 'The mount holds calibration through a full handover.' }],
  },
  1,
)

/** No `read` at all. The third answer, and the common one. */
const REPORT_UNSAID = record(
  'rep-2',
  'report',
  'What the handover replay sweep showed',
  { for: 'the lab meeting', date: '2026-08-11', blocks: [] },
  4,
)

const REPORT_READ = record(
  'rep-3',
  'report',
  'Round four, as it landed',
  { for: THE_TEST_OFFICES_OWNER.name, date: '2026-08-09', read: 'read', blocks: [{ id: 'b-1', type: 'text', text: 'Four questions.' }] },
  6,
)

const LINKS: Link[] = [link('l-1', 'rep-1', 'rec-mod', 'about')]

function ruleOver(records: PanelRecord[], links: Link[] = LINKS): AttentionResult {
  return computeAttention({
    now: NOW,
    records,
    links,
    changes: [],
    resources: [],
    dueMs: () => null,
  })
}

/** The rule's answer dressed as the route dresses Home's first page, so the panel is handed what the browser gets. */
function reply(result: AttentionResult): import('../src/web/api.ts').AttentionHome {
  return {
    ...attentionFirstPage(result),
    at: '2026-08-15 12:00:00',
    read: { records: 0, links: 0, changes: 0, changesCapped: false },
  }
}

// ============================================================================ 1. the rule

describe('the rule reports a report instead of filing it as a record with nothing written on it', () => {
  it('lists every report in `reports`, and never in `noState`', () => {
    const result = ruleOver([MODULE, REPORT_UNREAD, REPORT_UNSAID, REPORT_READ])
    const reports = result.reports ?? []
    expect(reports.map((row) => row.recordId).sort()).toEqual(['rep-1', 'rep-2', 'rep-3'])
    // The thing this list exists to stop: a report drawn as a record somebody forgot to fill in.
    expect(result.noState.map((row) => row.recordId)).not.toContain('rep-1')
    expect(result.noState.map((row) => row.recordId)).not.toContain('rep-2')
    expect(result.noState.map((row) => row.recordId)).not.toContain('rep-3')
  })

  it('keeps read, unread and nobody-has-said as three different answers', () => {
    const reports = ruleOver([REPORT_UNREAD, REPORT_UNSAID, REPORT_READ]).reports ?? []
    const byId = new Map(reports.map((row) => [row.recordId, row]))

    expect(byId.get('rep-1')?.read).toBe('unread')
    expect(byId.get('rep-1')?.waiting).toBe(true)

    // ABSENT IS NOT `unread`. One is a gap in the record and the other is a claim about a person.
    expect(byId.get('rep-2')?.read).toBe(null)
    expect(byId.get('rep-2')?.waiting).toBe(true)
    expect(byId.get('rep-2')?.note).toContain('Not marked read or unread')
    expect(byId.get('rep-2')?.note).not.toContain('marked unread')

    expect(byId.get('rep-3')?.read).toBe('read')
    expect(byId.get('rep-3')?.waiting).toBe(false)
  })

  it('says who each report is for and which day it is about, and says so when nobody wrote it down', () => {
    const reports = ruleOver([REPORT_UNREAD]).reports ?? []
    expect(reports[0]?.for).toBe(`${THE_TEST_OFFICES_OWNER.name}, who asked for the review`)
    expect(reports[0]?.date).toBe('2026-08-14')
    expect(reports[0]?.note).toContain('It is about 2026-08-14.')

    const bare = record('rep-bare', 'report', 'A stub of a review', { blocks: [] }, 1)
    const stub = (ruleOver([bare]).reports ?? [])[0]
    expect(stub?.for).toBe(null)
    expect(stub?.date).toBe(null)
    expect(stub?.note).toContain('No recipient recorded.')
    expect(stub?.note).toContain('Nothing written in it yet')
  })

  it('resolves what a report is about from its `about` link, and reports an empty list honestly', () => {
    const reports = ruleOver([MODULE, REPORT_UNREAD, REPORT_UNSAID]).reports ?? []
    const byId = new Map(reports.map((row) => [row.recordId, row]))
    expect(byId.get('rep-1')?.about).toEqual([{ recordId: 'rec-mod', title: 'Tray clamp calibration' }])
    // No link, so no subject. Empty, never a guess from the title.
    expect(byId.get('rep-2')?.about).toEqual([])
  })

  it('never ranks a report: it reaches neither the visible list nor the remainder', () => {
    const result = ruleOver([MODULE, REPORT_UNREAD, REPORT_UNSAID, REPORT_READ])
    const ranked = [...result.visible, ...result.remainder].map((row) => row.recordId)
    expect(ranked).not.toContain('rep-1')
    expect(ranked).not.toContain('rep-2')
    expect(ranked).not.toContain('rep-3')
  })

  it('gives a report its own passed-over bucket, whose sentence says it has a reader rather than a state', () => {
    const result = ruleOver([REPORT_UNREAD, REPORT_UNSAID, REPORT_READ])
    const bucket = result.passedOver.find((group) => group.bucket === 'written_for_a_person_to_read')
    expect(bucket?.count).toBe(3)
    expect(bucket?.keys.sort()).toEqual(['rec:rep-1', 'rec:rep-2', 'rec:rep-3'])
    expect(bucket?.sentence).toBe(PASSED_OVER_SENTENCES.written_for_a_person_to_read)
    expect(bucket?.sentence).toContain('nobody has said')
    // The bucket a report used to land in, which said the wrong thing about it.
    expect(result.passedOver.find((group) => group.bucket === 'no_state_field')).toBeUndefined()
  })

  it('reads one report the same way wherever it is read from', () => {
    // The rule and a module's page both go through `reportReading`, so this is the proof that the
    // two surfaces cannot word one report two ways.
    const direct = reportReading(REPORT_UNREAD, [{ recordId: 'rec-mod', title: 'Tray clamp calibration' }])
    const throughRule = (ruleOver([MODULE, REPORT_UNREAD]).reports ?? [])[0]
    expect(direct).toEqual(throughRule)
  })
})

// ============================================================================ 2. home
//
// These cases render the band on its own, which proves what the band says. That Home draws it (under
// Needs you, capped at five) is proved on the page by tests/home-keeps-what-the-old-home-owed.test.ts;
// check l3MN04jpFPhK found this section passing in round 16 while no page drew the band.

describe('Home shows a report written for a person', () => {
  it('says nobody has written one, rather than that there are none', () => {
    const html = renderToStaticMarkup(
      h(ap.ReportsForYou, { reply: reply(ruleOver([MODULE])), onMarkedRead: () => {} }),
    )
    expect(html).toContain('No report written in this project yet.')
    // The wording a filter uses when it matched nothing. It is not what is true here.
    expect(html).not.toContain('No reports')
    expect(html).not.toContain('Nothing to show')
  })

  /**
   * WHAT A ROW SAYS AT REST, and it is less than it was on purpose.
   *
   * This row once drew the
   * rule's whole 39-word sentence in a bordered box on a second background, with the button that
   * resolves it on the line above. The row now says where the report stands in a word. The sentence
   * is unchanged, is still written in one place, and is on the mark's tooltip and in Developer mode
   * — tests/absence-weight.test.ts holds both halves of that.
   */
  it('draws the title, the day it is about and where it stands with its reader', () => {
    const html = renderToStaticMarkup(
      h(ap.ReportsForYou, { reply: reply(ruleOver([MODULE, REPORT_UNREAD])), onMarkedRead: () => {} }),
    )
    expect(html).toContain('Owner review: where the gripper stands')
    expect(html).toContain('about 14 Aug 2026')
    expect(html).toContain('marked unread')
    expect(
      html,
      'the paragraph is back on the row, which is the regression this pass was called for',
    ).not.toContain(`It is written for ${THE_TEST_OFFICES_OWNER.name}, who asked for the review.`)
    // NOT "Reports waiting for you" AND NOT "waiting to be read", which is what this asserted.
    // Reading a report is not a governance act, and the phrase is reserved for the one reading of
    // what is waiting on the person — it was one of five claims of that form the owner was told at
    // once. The band says how many nobody has read, which is the claim it can make.
    expect(html).toContain('Reports')
    expect(html).toContain('to read')
    expect(html).not.toContain('waiting to be read')
  })

  it('offers the press to a person, and says what it will record', () => {
    webApi.setActor({ type: 'human', id: THE_TEST_OFFICES_OWNER.id })
    const html = renderToStaticMarkup(
      h(ap.ReportsForYou, { reply: reply(ruleOver([REPORT_UNREAD])), onMarkedRead: () => {} }),
    )
    expect(html).toContain('I have read this')
  })

  it('refuses the press to an agent and says why, exactly as marking a plan read does', async () => {
    const mode = await import('../src/web/lib/mode.ts')
    mode.setMode('inspect')
    webApi.setActor({ type: 'agent', id: 'claude-code · r3' })
    const html = renderToStaticMarkup(
      h(ap.ReportsForYou, { reply: reply(ruleOver([REPORT_UNREAD])), onMarkedRead: () => {} }),
    )
    expect(html).toContain('Only a person can mark a report read')
    expect(html).toContain('claude-code · r3')
    mode.setMode('normal')
    expect(html).not.toContain('I have read this')
    webApi.setActor({ type: 'human', id: THE_TEST_OFFICES_OWNER.id })
  })

  it('stops asking once a report is read, and counts it rather than dropping it', async () => {
    const { familyPath } = await import('../src/web/components/router.tsx')
    const html = renderToStaticMarkup(
      h(ap.ReportsForYou, { reply: reply(ruleOver([REPORT_READ])), onMarkedRead: () => {} }),
    )
    // Nothing is waiting, so the heading may not say anything is.
    expect(html).not.toContain('Reports waiting for you')
    // And it is still reachable: an EXACT count in the head, and the press to the reports page that lists
    // it, never the word "more" on its own. Home's fold of the read ones left Home in wave 13w round 21
    // the count stayed, and the press to the page that holds them is drawn.
    expect(html).toContain('1 already read')
    expect(html).toContain(`<a href="#${familyPath('notes')}">All reports and notes</a>`)
    expect(html).not.toContain('1 things')
    // THE READ ONES ARE NOT IN THE FIRST LOAD, and the server's page of them holds this one.
    expect(html).not.toContain('Round four, as it landed')
    expect(attentionPartOf(ruleOver([REPORT_READ]), 'readReports', 0).rows.map((row) => row.title)).toContain('Round four, as it landed')
  })

  /**
   * THE FAULT IS NOW RAISED WHERE THE COUNTS ARE MADE. Since round 19 of wave 13w the server counts the
   * reports and sends Home the counts, so a reading with no reports list is refused there, rather than
   * sent as nought reports nobody counted.
   */
  it('refuses an answer that carried no reports list at all, rather than counting it as none', () => {
    const bare = ruleOver([MODULE])
    delete (bare as { reports?: unknown }).reports
    expect(() => attentionFirstPage(bare)).toThrow('carried no reports list')
  })
})

// ============================================================================ 3. a module page

describe('a module page shows the reports written about it', () => {
  it('says it was not told which record this is, rather than drawing an empty list', () => {
    const html = renderToStaticMarkup(h(mv.ReportsAbout, { declares: SEE_THROUGH, what: 'module' }))
    expect(html).toContain('Mole Office has not looked.')
    const expected = en['moduleView.reportsAbout.notLookedBody']
      .replaceAll('{what}', 'module')
      .replaceAll("'", '&#x27;')
    expect(html).toContain(expected)
    expect(html).not.toContain('Nobody has written a report about this module.')
  })

  it('reads the reports from the module’s incoming `about` links, and their subjects from their own', async () => {
    const detail = (id: string) => {
      if (id === 'rec-mod') {
        return Promise.resolve({
          record: MODULE,
          incomplete: [],
          changes: [],
          links: [
            {
              linkId: 'l-1',
              type: 'about',
              label: 'subject of',
              isBacklink: true,
              inferred: false,
              broken: false,
              other: { id: 'rep-1', kind: 'report', title: REPORT_UNREAD.title, summary: null, origin: null },
              gate: null,
              gateLabel: null,
              gateProblem: null,
            },
            // A report about this module that somebody deleted. Counted, never dropped.
            {
              linkId: 'l-2',
              type: 'about',
              label: 'subject of',
              isBacklink: true,
              inferred: false,
              broken: true,
              other: { id: 'rep-gone', kind: 'report', title: 'A review that was deleted', summary: null, origin: null },
              gate: null,
              gateLabel: null,
              gateProblem: null,
            },
            // Not a report, so not this panel's business.
            {
              linkId: 'l-3',
              type: 'about',
              label: 'subject of',
              isBacklink: true,
              inferred: false,
              broken: false,
              other: { id: 'rec-prob', kind: 'problem', title: 'A problem', summary: null, origin: null },
              gate: null,
              gateLabel: null,
              gateProblem: null,
            },
          ],
        })
      }
      return Promise.resolve({
        record: REPORT_UNREAD,
        incomplete: [],
        changes: [],
        links: [
          {
            linkId: 'l-1',
            type: 'about',
            label: 'about',
            isBacklink: false,
            inferred: false,
            broken: false,
            other: { id: 'rec-mod', kind: 'module', title: MODULE.title, summary: null, origin: null },
            gate: null,
            gateLabel: null,
            gateProblem: null,
          },
        ],
      })
    }
    const original = webApi.api.getRecord
    ;(webApi.api as { getRecord: unknown }).getRecord = detail as unknown as typeof original
    try {
      const read = await mv.readReportsAbout('rec-mod')
      expect(read.rows.map((row) => row.recordId)).toEqual(['rep-1'])
      expect(read.rows[0]?.for).toBe(`${THE_TEST_OFFICES_OWNER.name}, who asked for the review`)
      expect(read.rows[0]?.about).toEqual([{ recordId: 'rec-mod', title: 'Tray clamp calibration' }])
      // The deleted one is a number the page prints, not a row it silently loses.
      expect(read.deleted).toBe(1)
    } finally {
      ;(webApi.api as { getRecord: unknown }).getRecord = original
    }
  })
})
