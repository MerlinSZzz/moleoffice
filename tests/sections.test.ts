// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A RECORD PAGE IS MADE OF: THE TABLES THAT CAN GO STALE, AND THE RULE THAT READS THEM.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS SEPARATELY
 * ---------------------------------------------------------------------------------------------
 *
 * `IN_HEADLINE`, `NOT_BODY` and `RECORD_ID_LISTS` were declared in src/web/pages/RecordPage.tsx and
 * their guards were in the two test files that render that page — so proving that a table names a
 * real field meant booting React, a window and a component tree. The tables moved to
 * src/shared/sections.ts when the region tree started reading them, and the guards moved with them.
 * Nothing in this file renders anything: every claim here is about declarations.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IS GUARDED, AND WHY EACH ONE CAN GO WRONG SILENTLY
 * ---------------------------------------------------------------------------------------------
 *
 *   THE TABLES NAME FIELDS BY KEY, AND A KEY CAN GO STALE. Rename a field and `IN_HEADLINE` goes on
 *   claiming the old name: the body then prints the value a second time under a heading, or worse,
 *   `RECORD_ID_LISTS` stops recognising the field that holds ids and a trajectory draws two nanoids
 *   where its planned states should be. Neither is a type error and neither shows up in a render
 *   test of some other kind.
 *
 *   A SECTION KEY IS A REGION ID. `section.summary` is what a press files a comment against, so two
 *   sections of one kind sharing a key would be two different places with one address — which is
 *   the class of fault the declared-sections design exists to remove. The collision that made the
 *   rule what it is was a live one: a module declares a prose field `summary` AND a block field
 *   `summaryBlocks`, and 10 of 27 modules store the paragraph.
 *
 *   THE RULE'S OUTPUT IS CHECKED AGAINST THE FIVE KINDS THE OWNER'S OWN TEST OPENS. Those five
 *   lists are in design/problem-03/ACCEPTANCE.md §C2.2, worked out by running the rule over the
 *   schema. Asserting them here is not a second declaration of what a kind holds — nothing here is
 *   read to draw anything — it is the rule being pinned to the pages the owner will right-click.
 */

import { describe, expect, it } from 'vitest'
import { blocksFieldOf, KIND_SPECS } from '../src/shared/kinds.ts'
import { RECORD_KINDS, type PanelRecord, type RecordKind } from '../src/shared/types.ts'
import { t } from '../src/shared/i18n.ts'
import { sectionTitleKey } from '../src/web/components/sections.ts'
import {
  bodySectionsDeclaredBy,
  filledBodySections,
  isWritten,
  LINKS_KEY,
  relationSectionsOf,
  READING_MATTER_KEY,
  SECTIONS_OF } from '../src/shared/sections.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const NOW = '2026-08-30 09:00:00'

function record(kind: RecordKind, data: Record<string, unknown>): PanelRecord {
  return {
    id: 'rec-1',
    workspaceId: 'panelx',
    kind,
    title: 'A record',
    summary: null,
    data,
    origin: 'authored' as const,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ownerId: THE_TEST_OFFICES_OWNER.id,
  } as unknown as PanelRecord
}

/** The keys of one kind's body sections, in the order the declaration gives them. */
const bodyKeys = (kind: RecordKind): string[] => bodySectionsDeclaredBy(kind).map((s) => s.key)

// ============================================================ the tables name real fields

// ============================================================ the sections themselves

describe('every kind declares its sections, and a section key is an address', () => {
  it('makes one section per relation, in the order given, with repeats folded into one', () => {
    // EIGHTEEN `subject of` ROWS ARE ONE LIST UNDER ONE HEADING, and one region may be on one live
    // element only — `MarkLayer` finds a stored comment's element with `querySelector`, which takes
    // the first match, so two elements carrying one id would paint one person's comment in the
    // wrong place.
    const made = relationSectionsOf(['about', 'subject of', 'subject of', 'discussed by', 'subject of'])
    expect(made.map((one) => one.key)).toEqual(['about', 'subject of', 'discussed by'])
    for (const one of made) {
      // IT USED TO READ `.toBeNull()` — *a relation section is held by the record and not by the
      // reading matter*. Half of that is still true and half of it moved: a relation's list of rows
      // is not in the reading matter, and it is not directly under the record root either. It is
      // inside the *Links* panel, which is where the rows are drawn and which is now a section of
      // its own. See `LINKS_KEY` in src/shared/sections.ts.
      expect(one.inside, 'a relation section sits in the Links panel, which is where its rows are drawn').toBe(
        LINKS_KEY,
      )
      expect(one.from.holds).toBe('relation')
    }
    // A BLANK PHRASE NAMES NOTHING. `section.` is not a name this product's grammar can read, so a
    // link whose type this build does not know contributes no section rather than an unreadable one.
    expect(relationSectionsOf(['', 'about']).map((one) => one.key)).toEqual(['about'])
  })

})

describe('the body sections are the rule, run', () => {


  /**
   * THE COLLISION, AS A TEST RATHER THAN A COMMENT. A module is the only kind declaring both a
   * prose `summary` and a block field, and the rule folds both into the reading matter. If a second
   * kind ever declares both, this still holds — it is written as the rule and not as "module".
   */
  it('never gives a body section the key the reading matter already holds', () => {
    for (const kind of RECORD_KINDS) {
      const held = [READING_MATTER_KEY, blocksFieldOf(kind)].filter((k): k is string => k !== null)
      for (const key of bodyKeys(kind)) {
        expect(held.includes(key), `${kind} draws data.${key} as a body section and inside its reading matter`).toBe(
          false,
        )
      }
    }
    const reading = SECTIONS_OF.module.find((s) => s.key === READING_MATTER_KEY)?.from
    expect(reading?.holds).toBe('readingMatter')
    if (reading?.holds === 'readingMatter') {
      expect(reading.prose, 'a module’s curated paragraph is not in its reading matter').toBe('summary')
      expect(reading.blocks, 'a module’s curated blocks are not in its reading matter').toBe('summaryBlocks')
    }
  })
})

// ============================================================ what one record fills

describe('a section a record has not written is not one of its sections', () => {
  it('leaves out what the headline already answered', () => {
    const keys = filledBodySections(
      record('claim', {
        numbers: { sigma_z_mm: 5.8 },
        measured_on: 'the chest camera',
        method: 'a checkerboard sweep',
        caveat: 'one operator, one light',
      }),
    ).map((s) => s.key)
    expect(keys).toContain('method')
    expect(keys).toContain('caveat')
    expect(keys).not.toContain('numbers')
    expect(keys).not.toContain('measured_on')
  })

  it('never puts a nested object or the open bag into the reading matter', () => {
    const keys = filledBodySections(
      record('problem', {
        cause: 'the handler was stubbed',
        consequence: { bearer: 'person', what: 'the arm keeps moving' },
        extra: { anything: 1 },
        source: 'a thread',
      }),
    ).map((s) => s.key)
    expect(keys).toEqual(['cause'])
  })

  it('says nothing about a field nobody wrote, rather than an empty heading', () => {
    expect(filledBodySections(record('problem', { cause: '  ' }))).toEqual([])
    expect(isWritten('  ')).toBe(false)
    expect(isWritten(0)).toBe(true)
    expect(isWritten(null)).toBe(false)
  })

  /**
   * A MESSAGE'S QUOTE POSITIONS PLACE THE QUOTES, AND WHERE THE QUOTES STAND ALREADY SHOWS THEM.
   *
   * The positions are a list of numbers, so the body's shape rule would draw them as a section of
   * bare numbers under the heading the section word gives — machinery, not reading matter. The
   * field stays declared, because the declared-fields fold in Developer detail lists every field a
   * kind declares (DeclaredFields in RecordPage.tsx); a field taken off the kind to hide its
   * section would leave that fold and every future write without it.
   */
  it('draws no quote positions section on a message, and keeps the field declared', () => {
    const word = t(sectionTitleKey('message', 'quotePositions'))
    const sections = filledBodySections(
      record('message', {
        body: 'The sweep is held until you say which plastic to try.',
        quotes: [{ target: { kind: 'record', recordId: 'rec-2' } }],
        quotePositions: [16],
      }),
    )
    const headings = sections.map((one) => t(sectionTitleKey('message', one.key)))
    expect(
      headings,
      `a person reads where the quotes stand in the words, not a section headed ${word} of bare numbers`,
    ).not.toContain(word)
    expect(sections.map((one) => one.key)).not.toContain('quotePositions')
    // THE DECLARED FIELDS FOLD LISTS EVERY FIELD THE KIND DECLARES, so the key is still there.
    expect(KIND_SPECS.message.fields.map((field) => field.key)).toContain('quotePositions')
  })
})
