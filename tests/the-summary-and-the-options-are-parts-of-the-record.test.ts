// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TWO PARTS THE OWNER'S OWN ACCEPTANCE NAMES FIRST SAY WHICH PART THEY ARE.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, 30 AUGUST 2026, BEFORE ANY OF THIS EXISTED
 * ---------------------------------------------------------------------------------------------
 *
 * A real Chromium at 1600x1200 against the live corpus, right-clicking with the real mouse and
 * reading the composer that opened:
 *
 *   THE RECORD SUMMARY, on one record of each of four kinds. Module `vGshWp_JiSrx`, report
 *   `CnnEp_jlEnAt`, problem `ONkx85Ufkhr_`, note `SatzlTE5jnn7`. Four presses, four answers, and
 *   every one of them was the whole record: the walk went up four elements from the paragraph and
 *   stopped at `record/<id>/panelx`. Summary is the FIRST item on the owner's own list of the meaningful
 *   sections of a page.
 *
 *   THE FORK IN THE OWNER'S SECOND DOGFOOD SCREENSHOT. Proposal `h6O_RMpeYBTD`. Right-clicking *3 options*
 *   answered the whole proposal, and so did the question and the recommendation. That is the
 *   picture the owner filed.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THIS FILE HOLDS AND WHAT IT DELIBERATELY DOES NOT
 * ---------------------------------------------------------------------------------------------
 *
 * It asserts the two halves that can go wrong separately, because they did:
 *
 *   THE DECLARATION — that the region tree holds `section.summaryLine` and the fork's three
 *   sections, that each is there exactly when the record has written it, and that the summary
 *   section carries the summary's own characters so a comment on it can be checked later.
 *
 *   THE DRAWING — that the elements a reader presses carry those ids. A declaration nothing draws
 *   is a target resolving to nothing on the screen, which is the silent falsehood this cluster
 *   exists to remove, and `tests/the-composer-names-the-linked-record.test.ts` was found covering
 *   its sentence builder and not its drawing.
 *
 * IT DOES NOT SIMULATE THE WALK. Whether a press lands is a browser fact and it is measured in a
 * browser: `design/problem-03/baseline/five-sections.mjs` and the D1 press probe. What is here is
 * the pair of facts that make the walk possible, each of which a code change can break silently.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { beforeAll, describe, expect, it } from 'vitest'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { flatten, recordRegionsOf, sectionRegionId, sectionsOnThisRecord } from '../src/shared/regions.ts'
import {
  DRAWN_BY_THE_HEADLINE,
  IN_HEADLINE,
  OPTIONS_KEY,
  QUESTION_KEY,
  READING_MATTER_KEY,
  RECOMMENDATION_KEY,
  SECTIONS_OF,
  SUMMARY_LINE_KEY,
  bodySectionsDeclaredBy,
} from '../src/shared/sections.ts'
import { sectionsOf } from '../src/web/components/sections.ts'
import { KIND_SPECS } from '../src/shared/kinds.ts'
import { RECORD_KINDS, type PanelRecord, type RecordKind } from '../src/shared/types.ts'

type RecordPage = typeof import('../src/web/pages/RecordPage.tsx')
type Gov = typeof import('../src/web/components/Governance.tsx')

let rp: RecordPage
let gov: Gov

beforeAll(async () => {
  // These modules reach api.ts and router.tsx, which touch `window` while they are loading. This is
  // the smallest stand-in that lets them load; nothing here is under test.
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  rp = await import('../src/web/pages/RecordPage.tsx')
  gov = await import('../src/web/components/Governance.tsx')
})

const NOW = '2026-08-30 09:00:00'

function record(over: Partial<PanelRecord>): PanelRecord {
  return {
    id: 'rec000000001',
    workspaceId: 'panelx',
    ownerId: THE_TEST_OFFICES_OWNER.id,
    kind: 'note',
    title: 'Zarnwell gauge, third calibration',
    summary: null,
    data: {},
    origin: 'authored',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...over,
  } as unknown as PanelRecord
}

/** Markup with the hoisted style blocks stripped, so a class name in CSS is not evidence. */
const drawn = (el: ReactElement): string => renderToStaticMarkup(el).replace(/<style[\s\S]*?<\/style>/g, '')

/** The header, drawn as a reader sees it. */
const head = (rec: PanelRecord): string =>
  drawn(
    h(rp.RecordHead, {
      record: rec,
      projects: [{ id: 'panelx', title: 'Mole Office', records: 4, note: null }],
      // NOTHING IS JOINED TO IT, which is a statement about this fixture and not a gap in it.
      relations: [],
      incomplete: [],
      deleted: false,
      editing: false,
      busy: false,
      onSaved: () => {},
      onDelete: async () => {},
    } as never),
  )

// ============================================================ the record's own one-line summary

const LINE = 'Mount is printed and calibrated. The bracket may still clip the gripper at full close.'

describe('the record summary is a part of the record and says so', () => {
  it('is a section of every kind, and the tree holds it when the record wrote one', () => {
    for (const kind of RECORD_KINDS) {
      const keys = SECTIONS_OF[kind].map((one) => one.key)
      expect(keys, `${kind} declares no summary line`).toContain(SUMMARY_LINE_KEY)

      const written = flatten(recordRegionsOf({ kind, data: {}, title: 'The printed wrist mount cracked under load', summary: LINE, relations: [] })).map(
        (one) => one.id,
      )
      expect(written, `${kind} wrote a summary and the tree has no region for it`).toContain(
        sectionRegionId(SUMMARY_LINE_KEY),
      )
    }
  })

  it('is not in the tree for a record with no summary, because the page draws an absence there', () => {
    const none = flatten(recordRegionsOf({ kind: 'problem', data: {}, title: 'The printed wrist mount cracked under load', summary: null, relations: [] })).map((o) => o.id)
    expect(none).not.toContain(sectionRegionId(SUMMARY_LINE_KEY))
    const blank = flatten(recordRegionsOf({ kind: 'problem', data: {}, title: 'The printed wrist mount cracked under load', summary: '   ', relations: [] })).map((o) => o.id)
    expect(blank, 'whitespace is not a summary somebody wrote').not.toContain(sectionRegionId(SUMMARY_LINE_KEY))
  })

  it('carries the summary’s own characters, under the path the server looks a quote up in', () => {
    const tree = recordRegionsOf({ kind: 'problem', data: {}, title: 'The printed wrist mount cracked under load', summary: LINE, relations: [] })
    const part = flatten(tree).find((one) => one.id === sectionRegionId(SUMMARY_LINE_KEY))
    expect(part).toBeDefined()
    // `stringsOfRecord` on the server names a record's own strings `title`, `summary` and `data.…`.
    // A region naming anything else here would send the server looking for the words in a field
    // that does not exist, and it would report an untouched summary as gone.
    expect(part?.field).toBe('summary')
    expect(part?.text).toBe(LINE)
    expect(part?.range).toEqual({ from: 0, to: LINE.length })
  })

  it('is a different region from the reading matter, on the one kind that has both', () => {
    // A module stores a `data.summary` — its curated paragraph — as well as the envelope line, and
    // both are on its page at once. One key for the two would be one id on two elements, which is
    // the fault `MarkLayer` cannot survive: it finds a stored comment's element with
    // `document.querySelector` and would paint one person's words in the wrong place.
    const tree = recordRegionsOf({
      kind: 'module',
      data: { summary: 'The curated paragraph, which is a different string.' },
      title: 'Wrist mount',
      summary: LINE,
      relations: [],
    })
    const ids = flatten(tree).map((one) => one.id)
    expect(ids).toContain(sectionRegionId(SUMMARY_LINE_KEY))
    expect(ids).toContain(sectionRegionId(READING_MATTER_KEY))
    expect(sectionRegionId(SUMMARY_LINE_KEY)).not.toBe(sectionRegionId(READING_MATTER_KEY))
    const line = flatten(tree).find((one) => one.id === sectionRegionId(SUMMARY_LINE_KEY))
    expect(line?.text, 'the envelope line came back holding the curated paragraph').toBe(LINE)
  })

  /**
   * A REPORT LEFT THIS LIST ON 3 SEPTEMBER 2026 AND IT WAS FOUR KINDS BEFORE THAT.
   *
   * The header of a report no longer draws the one-line summary at all: the summary IS reading
   * length 3, drawn in the report's own body, and it is drawn once and not twice: on the page the
   * summary shows only in the body, as Level 3, and is not repeated at the top. Criterion A14b. So a
   * report's summary is still a part a reader can press; the element that carries the id is in the
   * body, and the case below is what says the header stopped drawing one.
   */
  it('draws the id on the paragraph a reader presses, on the three kinds whose header draws one', () => {
    for (const kind of ['module', 'problem', 'note'] as const) {
      const html = head(record({ kind, summary: LINE }))
      expect(html, `a ${kind}'s summary carries no target`).toContain(
        `data-target="region/rec000000001/${sectionRegionId(SUMMARY_LINE_KEY)}"`,
      )
      // AND THE WORDS ARE STILL MARKED SEPARATELY. The label "summary" beside them is seven
      // characters this record does not hold, so the offset mark belongs on the words alone.
      expect(html).toContain('data-text-field="summary"')
    }
  })

  it('draws no summary paragraph in the header of a report, because the report body draws it', () => {
    const html = head(record({ kind: 'report', summary: LINE }))
    expect(html, 'the header drew the summary as well as the report body').not.toContain(LINE)
    expect(html, 'the header claimed the summary as a part of itself').not.toContain(
      `region/rec000000001/${sectionRegionId(SUMMARY_LINE_KEY)}`,
    )
    // AND IT IS NOT THE ABSENCE LINE EITHER. The record has a summary; the header simply does not
    // draw it on this kind, so neither the words nor the sentence about their absence belongs here.
    expect(html, 'the header says nobody wrote a summary for a record that has one').not.toContain(
      'No summary was written for this record.',
    )
  })

  it('draws no target over “No summary was written”, because there is no region to name', () => {
    const html = head(record({ kind: 'note', summary: null }))
    expect(html).toContain('No summary was written for this record.')
    expect(html, 'an absence claimed to be a part of the record').not.toContain(
      `region/rec000000001/${sectionRegionId(SUMMARY_LINE_KEY)}`,
    )
  })
})

// ============================================================ the fork in the owner's second screenshot

const FORK: Record<string, unknown> = {
  question: 'Should a module card be allowed to draw its name at the farthest view?',
  options: ['Leave it as it is now.', 'Count a module as a boundary too.', 'Group the modules under a frame.'],
  recommendation: 'Leave it as it is now, and look at the picture before deciding.',
}

/** The fork's panel as the record page mounts it, with the reader the page builds. */
const forkPanel = (data: Record<string, unknown>): string =>
  drawn(
    h(gov.ProposalGovernance, {
      recordId: 'p00000000001',
      title: 'Is a module card a boundary?',
      data,
      resolved: false,
      sections: sectionsOf({
        id: 'p00000000001',
        kind: 'proposal',
        data,
        title: 'Is a module card a boundary?',
        summary: null,
        relations: [],
      }),
      onSettled: () => {},
    } as never),
  )

describe('a fork’s question, options and recommendation are parts of the fork', () => {
  it('declares all three, and the tree holds them when the fork wrote them', () => {
    const keys = SECTIONS_OF.proposal.map((one) => one.key)
    for (const key of [QUESTION_KEY, OPTIONS_KEY, RECOMMENDATION_KEY]) expect(keys).toContain(key)

    const ids = flatten(recordRegionsOf({ kind: 'proposal', data: FORK, title: 'Is a module card a boundary?', summary: null, relations: [] })).map((o) => o.id)
    for (const key of [QUESTION_KEY, OPTIONS_KEY, RECOMMENDATION_KEY]) expect(ids).toContain(sectionRegionId(key))
    // AND THE OPTIONS HOLD ONE REGION PER OPTION, named the way the record page names a stored list.
    expect(ids).toContain('data.options[0]')
    expect(ids).toContain('data.options[2]')
  })

  it('leaves out a part the fork has not written', () => {
    const ids = flatten(
      recordRegionsOf({
        kind: 'proposal',
        data: { question: FORK['question'] },
        title: 'Is a module card a boundary?',
        summary: null,
        relations: [],
      }),
    ).map((one) => one.id)
    expect(ids).toContain(sectionRegionId(QUESTION_KEY))
    expect(ids, 'a fork with no options has an options section').not.toContain(sectionRegionId(OPTIONS_KEY))
    expect(ids).not.toContain(sectionRegionId(RECOMMENDATION_KEY))
  })

  it('draws each id on the element a reader presses', () => {
    const html = forkPanel(FORK)
    for (const key of [QUESTION_KEY, OPTIONS_KEY, RECOMMENDATION_KEY]) {
      expect(html, `the fork's ${key} carries no target`).toContain(
        `data-target="region/p00000000001/${sectionRegionId(key)}"`,
      )
    }
    // THE HEADING SAYS IT IS THE NAME OF THE OPTIONS, so the composer's chip reads "3 options"
    // rather than sweeping in the cards below it.
    expect(html).toContain('<span data-name="">3 options</span>')
  })

  it('draws no target on a part the fork has not written', () => {
    const html = forkPanel({ question: FORK['question'] })
    expect(html).toContain('No options were written here.')
    expect(html).not.toContain(`region/p00000000001/${sectionRegionId(OPTIONS_KEY)}`)
    expect(html).not.toContain(`region/p00000000001/${sectionRegionId(RECOMMENDATION_KEY)}`)
  })

  it('keeps the three on the screen after the fork is settled, where the tree still holds them', () => {
    // A SETTLED FORK DRAWS A DIFFERENT PANEL, and the region tree cannot see that it was settled —
    // it is derived from the record's stored fields, and those do not change when a decision is
    // linked to it. So the settled panel has to draw every part the tree declares, or the tree
    // would claim three places and the page would have two.
    const html = drawn(
      h(gov.ProposalGovernance, {
        recordId: 'p00000000001',
        title: 'Is a module card a boundary?',
        data: FORK,
        resolved: true,
        settledBy: [{ id: 'dec-1', title: 'We left it as it is', deleted: false }],
        decisionData: new Map([['dec-1', { alternatives_rejected: ['B', 'C'] }]]),
        sections: sectionsOf({
          id: 'p00000000001',
          kind: 'proposal',
          data: FORK,
          title: 'Is a module card a boundary?',
          summary: null,
          relations: [],
        }),
        onSettled: () => {},
      } as never),
    )
    for (const key of [QUESTION_KEY, OPTIONS_KEY, RECOMMENDATION_KEY]) {
      expect(html, `a settled fork drops its ${key}`).toContain(
        `data-target="region/p00000000001/${sectionRegionId(key)}"`,
      )
    }
    expect(html, 'the agent’s reasoning left the page when the fork was settled').toContain(
      'Leave it as it is now, and look at the picture before deciding.',
    )
  })

  it('keeps them out of the fold stack, so nothing is drawn twice under two headings', () => {
    const body = bodySectionsDeclaredBy('proposal').map((one) => one.key)
    for (const key of [QUESTION_KEY, OPTIONS_KEY, RECOMMENDATION_KEY]) {
      expect(body, `${key} is drawn by the fork's panel and by the fold stack`).not.toContain(key)
    }
  })
})

// ============================================================ the two tables cannot drift apart

describe('the fields a panel draws are a field of that kind, and are left out of the body', () => {
  it('names only keys the kind really declares', () => {
    for (const [kind, keys] of Object.entries(DRAWN_BY_THE_HEADLINE)) {
      const spec = KIND_SPECS[kind as RecordKind]
      expect(spec, `DRAWN_BY_THE_HEADLINE names a kind "${kind}" that does not exist`).toBeDefined()
      for (const key of keys as readonly string[]) {
        expect(
          spec?.fields.some((f) => f.key === key),
          `DRAWN_BY_THE_HEADLINE says a ${kind} draws "${key}", and a ${kind} declares no such field`,
        ).toBe(true)
      }
    }
  })

  it('names only keys the headline already claims, so the body cannot print them as well', () => {
    for (const [kind, keys] of Object.entries(DRAWN_BY_THE_HEADLINE)) {
      const headlined = IN_HEADLINE[kind as RecordKind] ?? []
      for (const key of keys as readonly string[]) {
        expect(
          headlined.includes(key),
          `a ${kind}'s panel draws "${key}" and IN_HEADLINE does not claim it, so the fold stack prints it too`,
        ).toBe(true)
      }
    }
  })

  it('gives every one of them a section that sits on the record and not in the reading matter', () => {
    for (const [kind, keys] of Object.entries(DRAWN_BY_THE_HEADLINE)) {
      for (const key of keys as readonly string[]) {
        const spec = SECTIONS_OF[kind as RecordKind].find((one) => one.key === key)
        expect(spec, `${kind}.${key} is drawn by a panel and is no section`).toBeDefined()
        expect(spec?.from.holds).toBe('headlineField')
        expect(spec?.inside, 'a panel above the body is not inside the reading matter').toBeNull()
      }
    }
  })

  it('agrees with the browser about every section, on a record that has written all of them', () => {
    // The same two-way comparison `tests/a-panel-says-which-section-it-draws.test.ts` makes, on a
    // fork with a summary and all three of its panel's fields filled in.
    const data = FORK
    const source = {
      id: 'p00000000001',
      kind: 'proposal' as const,
      data,
      title: 'Is a module card a boundary?',
      summary: LINE,
      relations: [],
    }
    const inTheTree = new Set(
      flatten(recordRegionsOf(source))
        .filter((one) => one.declared)
        .map((one) => one.id),
    )
    const asks = sectionsOf(source)
    for (const spec of SECTIONS_OF.proposal) {
      expect('about' in asks(spec.key), `proposal.${spec.key}`).toBe(inTheTree.has(sectionRegionId(spec.key)))
    }
    expect(new Set(sectionsOnThisRecord(source).map((one) => sectionRegionId(one.key)))).toEqual(inTheTree)
  })
})
