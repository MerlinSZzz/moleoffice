// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LINK ROW NAMES THE RECORD IT NAMES, AND A SUMMARY NAMES ITSELF.
 *
 * ---------------------------------------------------------------------------------------------
 * THE TWO FAULTS THIS WATCHES, BOTH MEASURED BEFORE ANYTHING WAS BUILT
 * ---------------------------------------------------------------------------------------------
 *
 * The owner's dogfood, 29 August 2026: *"even specific record links falls back to the entire parent
 * Report/Decision. The linked object itself is not preserved as the semantic target, and the
 * composer therefore also fails to use that linked context when suggesting the relevant Agent."*
 *
 * Measured at `3bf359f` across the five records the owner's gate names: 120 anchors whose address is
 * another record, and 4 of them resolved to that record. The other 116 resolved to the record they
 * were printed on. Separately, all five authored short-form lines at the top of a report resolved
 * six levels up to the whole record, and at reading length 1 the ONE line that IS the whole
 * projection resolved to the record too.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IS HERE AND WHAT IS NOT
 * ---------------------------------------------------------------------------------------------
 *
 * Everything here is about declarations and lookups: the grouping a rail draws, the region a stored
 * path names, the section the server can find, and what a stored `drawnIn` is allowed to be.
 *
 * WHETHER A PRESS LANDS ON THEM IS A BROWSER QUESTION AND IS NOT ANSWERED HERE.
 * `design/problem-03/baseline/link-rows.mjs` right-clicks three real link rows and the summary line
 * at reading length 1, at real coordinates, and reads the composer that opens.
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { expectPanelError, freshDb, type TestDb } from './helpers.ts'
import type { ChangeSession } from '../src/web/api.ts'
import { theLinkedRecord } from '../src/web/components/sections.ts'
import { relationGroups, SUMMARY_LINE_KEY, TITLE_LINE_KEY } from '../src/shared/sections.ts'
import {
  parseRegionId,
  regionOfDrawnLine,
  sectionRegionId,
  shortFormRegionId,
  spellRegionId,
} from '../src/shared/regions.ts'
import { declaredAttributes } from '../src/web/components/declares.ts'
import { targetAttributeValue, targetFromAttributeValue, TARGET_ATTRIBUTE } from '../src/shared/targets.ts'
import type { Change, GatedLink } from '../src/shared/types.ts'



const WORKSPACE = 'panelx'
const HUMAN = { type: 'human', id: 'owner' } as const

let t: TestDb
let targets: typeof import('../src/server/lib/targets.ts')

beforeAll(async () => {
  t = await freshDb()
  // The app's own module instance, imported after `freshDb` resets the module registry.
  targets = await import('../src/server/lib/targets.ts')
}, 60_000)

afterAll(() => {
  t.close()
})

// =========================================================================== what a row declares

describe('a row drawn for another record declares that record', () => {
  it('uses the `about` arm, which had no call sites until this step', () => {
    expect(theLinkedRecord('lfLve4F30JIy', WORKSPACE)).toEqual({
      about: { kind: 'record', recordId: 'lfLve4F30JIy', workspaceId: WORKSPACE },
    })
  })

  it('writes one target attribute, through the one function that writes them', () => {
    expect(declaredAttributes(theLinkedRecord('lfLve4F30JIy', WORKSPACE))).toEqual({
      [TARGET_ATTRIBUTE]: `record/lfLve4F30JIy/${WORKSPACE}`,
    })
  })
})

describe('a relation phrase with a space in it survives every spelling it goes through', () => {
  it('parses, spells back, and rides the attribute there and back', () => {
    // A SECTION KEY HAD NEVER HELD A SPACE BEFORE THIS STEP. Two of the three relations on the
    // report in the owner's own screenshot do — *subject of*, *discussed by* — so this is the ordinary case
    // and not an edge. Three spellings have to agree: the grammar, the writer, and the attribute a
    // press reads back off the page, where the space arrives percent-encoded.
    const id = sectionRegionId('subject of')
    expect(id).toBe('section.subject of')
    const read = parseRegionId(id).read
    expect(read?.steps).toEqual([{ form: 'name', name: 'subject of' }])
    expect(spellRegionId({ root: 'section', steps: read?.steps ?? [], at: null })).toBe(id)

    const target = { kind: 'region', recordId: 'm2Q0CybxoGNF', regionId: id } as const
    const value = targetAttributeValue(target)
    expect(value).toBe('region/m2Q0CybxoGNF/section.subject%20of')
    expect(targetFromAttributeValue(value)).toEqual({ target })
  })
})

// =========================================================================== the rail's grouping

/** One link, with only what the grouping reads. */
function link(label: string, id: string): GatedLink {
  return {
    linkId: `l-${id}`,
    type: 'about',
    label,
    isBacklink: false,
    inferred: false,
    broken: false,
    other: { id, kind: 'problem', title: `problem ${id}`, summary: null, origin: 'authored' },
    gate: null,
    gateLabel: null,
    gateProblem: null,
  } as unknown as GatedLink
}

describe('the rail draws a group per relation and never drops one', () => {
  it('hands the budget round the relations rather than taking the first few links', () => {
    // THE FAULT THIS REPLACES: `links.slice(0, 5)` off the front of one list, so a record whose
    // first five links were all `subject of` said nothing at all about what it is `about`.
    const links = [
      ...Array.from({ length: 18 }, (_, i) => link('subject of', `s${String(i)}`)),
      link('about', 'a1'),
      link('discussed by', 'd1'),
    ]
    const groups = relationGroups(links, 5)
    expect(groups.map((g) => g.relation)).toEqual(['subject of', 'about', 'discussed by'])
    expect(groups.every((g) => g.rows.length >= 1), 'every relation draws at least one row').toBe(true)
    expect(groups.reduce((n, g) => n + g.rows.length, 0)).toBe(5)
    // AND IT SAYS WHAT IT DID NOT DRAW, on the list rather than as a total at the foot of the page.
    expect(groups.find((g) => g.relation === 'subject of')?.more).toBe(15)
    expect(groups.find((g) => g.relation === 'about')?.more).toBe(0)
  })

  it('gives every relation a row even when there are more relations than the budget', () => {
    const links = [link('about', 'a'), link('subject of', 'b'), link('discussed by', 'c'), link('blocks', 'd')]
    const groups = relationGroups(links, 2)
    expect(groups.length).toBe(4)
    expect(groups.every((g) => g.rows.length === 1)).toBe(true)
  })

  it('draws nothing for a record with no links', () => {
    expect(relationGroups([], 5)).toEqual([])
  })
})

// =========================================================================== the summary's region

describe('a drawn line names the stored short form it was read out of', () => {
  it('gives the short form the id the region tree holds', () => {
    expect(regionOfDrawnLine('data.shortForms.label')).toBe('data.shortForms.label.text')
    expect(regionOfDrawnLine('data.shortForms.gist')).toBe(shortFormRegionId('gist'))
  })

  /**
   * THIS USED TO ASSERT THAT `title` AND `summary` BOTH ANSWERED NULL, on the grounds that the
   * title is a column and is not in `data` at all, and that the summary is cut into paragraphs so
   * the region under it is `data.summary@0` and the bare path names nothing. Criterion A14b of
   * design/pointing-reopened/ACCEPTANCE.md changed that on 3 September 2026. Reading length 2 IS
   * the record's own title and length 3 IS its own summary, so both are lines somebody reads and
   * presses. Neither string is in `data`, so neither hangs a region under a `data.…` path; each is
   * a DECLARED SECTION carrying its own characters, and those are the ids the record's region tree
   * holds. Answering null now would be the walk-past this file was written about.
   */
  it('names the declared section of each column that is a reading length', () => {
    expect(regionOfDrawnLine('title')).toBe(sectionRegionId(TITLE_LINE_KEY))
    expect(regionOfDrawnLine('summary')).toBe(sectionRegionId(SUMMARY_LINE_KEY))
  })

  it('answers null for the paths that name no region, rather than inventing one', () => {
    // A MADE-UP ID HERE would open the composer on a name the server answers `gone` about. None of
    // these three is a path a line is drawn from: the first names the container and not a form in
    // it, the second names a length nobody declared, and the third is one step past the form.
    expect(regionOfDrawnLine('data.shortForms')).toBeNull()
    expect(regionOfDrawnLine('data.shortForms.nonesuch')).toBeNull()
    expect(regionOfDrawnLine('data.shortForms.gist.text')).toBeNull()
  })
})

// =========================================================================== and the server agrees

describe('a relation section is a place the server can find', () => {
  it('resolves `section.<relation>` on a record that has a link read that way', () => {
    const report = t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'report',
      title: 'Round eight: pointing at anything',
      data: {},
      actor: HUMAN,
    })
    const problem = t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'problem',
      title: 'Right-clicking only works where somebody wired it',
      data: { symptom: 'It falls back to the record.' },
      actor: HUMAN,
    })
    // THE PROBLEM IS `about` THE REPORT, so from the REPORT's end the link reads `subject of` —
    // and that phrase, not the stored type, is the section's key.
    t.api.createLink({ fromId: problem.id, toId: report.id, type: 'about', actor: HUMAN })

    const target = { kind: 'region', recordId: report.id, regionId: 'section.subject of' } as const
    expect(() => targets.checkTarget(target, WORKSPACE)).not.toThrow()
    expect(targets.resolveTarget(target).answer).toBe('found')

    // AND THE OTHER END READS THE OTHER WAY. One link, two records, two different section keys.
    const other = { kind: 'region', recordId: problem.id, regionId: 'section.about' } as const
    expect(targets.resolveTarget(other).answer).toBe('found')
  })

  it('refuses a relation this record has no link of, because that heading is on no screen', () => {
    const report = t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'report',
      title: 'A report nothing is joined to',
      data: {},
      actor: HUMAN,
    })
    expectPanelError(
      t,
      () =>
        targets.checkTarget(
          { kind: 'region', recordId: report.id, regionId: 'section.subject of' },
          WORKSPACE,
        ),
      404,
    )
  })
})

// =========================================================================== where it was drawn

describe('a context may say where it was drawn, and only if that place is one', () => {
  it('takes a region of another record, which is the whole point of the field', () => {
    const report = t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'report',
      title: 'The report a link row is printed on',
      data: {},
      actor: HUMAN,
    })
    const problem = t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'problem',
      title: 'The record the row names',
      data: { symptom: 'x' },
      actor: HUMAN,
    })
    t.api.createLink({ fromId: problem.id, toId: report.id, type: 'about', actor: HUMAN })
    expect(() =>
      targets.checkContext(
        {
          // THE COMMENT IS ABOUT THE LINKED RECORD…
          target: { kind: 'record', recordId: problem.id, workspaceId: WORKSPACE },
          // …AND IT WAS MET UNDER `subject of` ON THE REPORT. Two records, on purpose.
          drawnIn: { recordId: report.id, regionId: 'section.subject of' },
        },
        WORKSPACE,
        'human',
      ),
    ).not.toThrow()
  })

  it('refuses a name nobody can read, naming the step, rather than storing it', () => {
    const problem = t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'problem',
      title: 'A problem',
      data: { symptom: 'x' },
      actor: HUMAN,
    })
    expectPanelError(
      t,
      () =>
        targets.checkDrawnIn(
          {
            target: { kind: 'record', recordId: problem.id, workspaceId: WORKSPACE },
            drawnIn: { recordId: problem.id, regionId: 'section.summary.text' },
          },
          WORKSPACE,
        ),
      400,
    )
  })

  it('refuses a place that is not there', () => {
    const problem = t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'problem',
      title: 'A problem with no fix written',
      data: { symptom: 'x' },
      actor: HUMAN,
    })
    expectPanelError(
      t,
      () =>
        targets.checkDrawnIn(
          {
            target: { kind: 'record', recordId: problem.id, workspaceId: WORKSPACE },
            drawnIn: { recordId: problem.id, regionId: 'section.fix' },
          },
          WORKSPACE,
        ),
      404,
    )
  })

  it('says nothing about a context that carries none, which is the ordinary case', () => {
    const problem = t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'problem',
      title: 'A problem',
      data: { symptom: 'x' },
      actor: HUMAN,
    })
    expect(() =>
      targets.checkDrawnIn(
        { target: { kind: 'record', recordId: problem.id, workspaceId: WORKSPACE } },
        WORKSPACE,
      ),
    ).not.toThrow()
  })
})

// ======================================================== the rows that answered the page, drawn

/**
 * WHAT THE BLOCKS BELOW ARE, AND WHY THEY RENDER RATHER THAN DECLARE.
 *
 * Everything above this line is about declarations and lookups. Step D2's fault was in the
 * DRAWING: three surfaces holding a reference to another record drew it with nothing on it, so the
 * upward walk ran past and answered the page. A test that only asked whether `theLinkedRecord`
 * returns the right shape passes with every one of those drawings deleted — which is the hollow
 * guard `design/problem-03/ACCEPTANCE.md` §D warns about. These render the components and read the
 * attributes out of the markup.
 *
 * MEASURED IN A REAL BROWSER, 31 August 2026, before this step and after it, by
 * `design/problem-03/baseline/link-rows.mjs` and `design/problem-03/baseline/lower-page-presses.mjs`:
 * on the five records the owner's gate names, 120 anchors address another record and **87** answered it
 * before, **120** after.
 *
 * THE GROUPS USED TO DECLARE `section.<relation>` AND THEY STOPPED ON 2 SEPTEMBER 2026. The rail's
 * own sentence list declares the same id on the same page, so the id named two elements and no
 * longer named a place. A press inside this fold walks up to the panel, which declares
 * `section.links`. See `LinkRows` in src/web/components/LinkPanel.tsx for the whole argument.
 */
describe('the panel behind the fold groups its rows by relation and declares no relation region', () => {
  let lp: typeof import('../src/web/components/LinkPanel.tsx')

  beforeEach(async () => {
    // LinkPanel reaches ui.tsx and router.tsx; router.tsx touches window on import. The same stub
    // tests/changes.test.ts uses, for the same reason.
    ;(globalThis as unknown as { window: unknown }).window = {
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      location: { hash: '' },
      addEventListener: () => {},
      removeEventListener: () => {},
    }
    lp = await import('../src/web/components/LinkPanel.tsx')
  })

  const link = (over: Partial<GatedLink>): GatedLink => ({
    linkId: 'l1',
    type: 'consumes',
    label: 'about',
    isBacklink: false,
    inferred: false,
    other: { id: 'a1', kind: 'note', title: 'The first note', summary: null },
    broken: false,
    gate: null,
    gateLabel: null,
    gateProblem: null,
    gateStage: null,
    ...over,
  })

  /** Two relations, three rows: the shape the rail's fold opens on a real record page. */
  const LINKS: GatedLink[] = [
    link({}),
    link({ linkId: 'l2', other: { id: 'a2', kind: 'note', title: 'The second note', summary: null } }),
    link({
      linkId: 'l3',
      label: 'subject of',
      isBacklink: true,
      other: { id: 'b1', kind: 'problem', title: 'A problem about it', summary: null },
    }),
  ]

  /** The markup, with the hoisted style blocks taken out so CSS cannot stand in as evidence. */
  const drawn = (links: GatedLink[] = LINKS): string =>
    renderToStaticMarkup(
      createElement(lp.LinkPanel, {
        // WHAT THE RECORD PAGE HANDS IT: the panel's own section, and no relation regions at all.
        declares: { about: { kind: 'region', recordId: 'r1', regionId: 'section.links' } },
        // THE KIND THE PANEL NAMES ITS HEADING FROM. `Links` is declared once, on the section.
        kind: 'report' as const,
        recordId: 'r1',
        links,
        knownTitles: [],
        editable: false,
        onChanged: () => undefined,
      }),
    ).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')

  const targetsIn = (html: string): string[] =>
    [...html.matchAll(/data-target="([^"]+)"/g)].map((m) => decodeURIComponent(m[1] as string))

  it('draws every row grouped by relation, and the only region it declares is its own', () => {
    // THE WHOLE SEQUENCE, IN DOCUMENT ORDER. The panel says which section it is, once, and every
    // other target here is a record. A relation region drawn here would be a second element on the
    // page carrying an id the rail's sentence list already carries.
    expect(targetsIn(drawn())).toEqual([
      'region/r1/section.links',
      'record/a1/default',
      'record/a2/default',
      'record/b1/default',
    ])
  })

  it('names no relation group, because a name on an element with no target is given upwards', () => {
    // A `data-name` on an element carrying no target is read as the name of whatever encloses it —
    // `nameSaidBy` in components/agent/pointing.ts — and that is this panel, whose name is Links.
    const html = drawn()
    expect(html).not.toContain('data-name="about"')
    expect(html).not.toContain('data-name="subject of"')
  })

  it('keeps the rows grouped by relation, which is the order this panel draws them in', () => {
    // The grouping is what changed the order the server sent; only the declaration went.
    const html = drawn()
    expect(html.indexOf('The second note')).toBeLessThan(html.indexOf('A problem about it'))
    expect(html).toContain('lp-relation')
  })

  it('still draws every link it was handed, which is what the fold is for', () => {
    const html = drawn()
    for (const title of ['The first note', 'The second note', 'A problem about it']) {
      expect(html).toContain(title)
    }
  })
})

describe('a record named inside a sentence is drawn as a reference to that record', () => {
  let cl: typeof import('../src/web/components/ChangeLog.tsx')

  beforeEach(async () => {
    ;(globalThis as unknown as { window: unknown }).window = {
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      location: { hash: '' },
      addEventListener: () => {},
      removeEventListener: () => {},
    }
    cl = await import('../src/web/components/ChangeLog.tsx')
  })

  const change = (over: Partial<Change>): Change => ({
    id: 'c1',
    recordId: 'r1',
    origin: 'authored',
    op: 'update',
    actorType: 'agent',
    actorId: 'claude',
    sessionId: 'sess-1',
    field: 'summary',
    oldValue: 'before',
    newValue: 'after',
    at: '2026-08-07 10:00:00',
    ...over,
  })

  const drawn = (changes: Change[], sessions: ChangeSession[], titles?: ReadonlyMap<string, string>): string =>
    renderToStaticMarkup(
      createElement(cl.ChangeLog, { changes, sessions, ...(titles === undefined ? {} : { titles }) }),
    ).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')

  /**
   * MEASURED ON PROBLEM `a62SOh9fsPe5`, 31 August 2026: nine rows of its change log name a session,
   * and a right-click on one walked up TWELVE elements that said nothing and answered the problem.
   * Twenty-four such anchors across the five records the owner's gate names, and eight more on the other end
   * of a `link` row.
   */
  it('names the session the change was written in, not the record the log is printed on', () => {
    const html = drawn(
      [change({})],
      [{ stored: 'sess-1', recordId: 'z8hXT8FbfKfi', title: 'Round ten', matchedBy: 'recordId', rows: 1, unresolved: false, elsewhereIn: null }],
    )
    expect(html).toContain('data-target="record/z8hXT8FbfKfi/default"')
    // The words of the anchor are the name; "session" in front of it is furniture.
    expect(html).toMatch(/data-name=""[^>]*>Round ten<\/a>|<a[^>]*data-name=""[^>]*>Round ten<\/a>/)
  })

  it('names the record at the other end of a link row', () => {
    const html = drawn(
      [change({ op: 'link', field: 'part_of', newValue: 'KDc5luAuhZeF' })],
      [],
      new Map([['KDc5luAuhZeF', 'The note it was joined to']]),
    )
    expect(html).toContain('data-target="record/KDc5luAuhZeF/default"')
  })

  it('says nothing new about a row whose session nothing answers to', () => {
    // An unresolved name is not a record, so it declares nothing. A target written here would file
    // a comment against an id no record answers to.
    const html = drawn(
      [change({})],
      [{ stored: 'sess-1', recordId: null, title: null, matchedBy: 'unresolved', rows: 1, unresolved: true, elsewhereIn: null }],
    )
    expect(html).not.toContain('data-target="record/')
  })
})

