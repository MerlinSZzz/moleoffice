// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORDS SOMEBODY WROTE HAVE TO BE ON THE PAGE.
 *
 * ---------------------------------------------------------------------------------------------
 * THE DEFECT THIS FILE EXISTS FOR
 * ---------------------------------------------------------------------------------------------
 *
 * A note's body reached no screen at all in Normal mode. The mechanism is worth understanding,
 * because it is a trap laid for the next kind somebody adds:
 *
 *   `IN_HEADLINE` in src/shared/sections.ts lists, per kind, the fields the KIND HEADLINE
 *   already answers. `bodySections` reads that list and leaves those fields out of the body, so
 *   nothing is printed twice.
 *
 *   `IN_HEADLINE` claimed `body` and `date` for a note and `body`, `from` and `read` for a message.
 *   `KindLead` — the component that draws the headline — had no case for either kind.
 *
 * So the claim was never met. The body was skipped by the body and drawn by nothing, and the only
 * place a person could read a note's own words was the "Stored fields" panel, which is behind the
 * Developer switch and prints them as a key and a raw value. A note IS its body; a note whose
 * content is invisible on its own page is the emptiest page in the product.
 *
 * NOTHING FAILED WHEN THAT HAPPENED. Not the type checker — `IN_HEADLINE` is a table of strings.
 * Not tests/record-tiers.test.ts, which checks that every key in the table is a DECLARED field of
 * its kind, which these all are. That is this repository's recurring defect exactly: one fact — "the
 * headline draws this field" — written in two places, with nothing making them agree.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THE GUARD BELOW DOES, AND WHAT IT CANNOT DO
 * ---------------------------------------------------------------------------------------------
 *
 * It writes a distinctive value into every field `IN_HEADLINE` claims, renders the whole Normal
 * record page except the panels behind the Developer switch, and looks for each value.
 *
 * IT CHECKS PLAIN STRING FIELDS ONLY, and that is a real limit rather than an oversight. A date is
 * reformatted for the reader, a number is drawn as a figure, a boolean is drawn as words, and an
 * open object has no single spelling on screen — so searching for the stored spelling of any of
 * those would fail on a page that is drawing them correctly. Their kinds are named below in
 * `NOT_CHECKED_BY_VALUE`, so what this file does not cover is written down rather than implied.
 *
 * KINDS THAT STILL FAIL ARE LISTED IN `notDrawn()` WITH THE REASON, and the list is checked in both
 * directions: an entry that has STOPPED failing fails this file, so a fix deletes the entry instead
 * of leaving a stale excuse behind. The normal-mode test, deleted on 12 November 2026, had the same
 * arrangement for the pages it could not fix.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { describe, expect, it, vi } from 'vitest'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { KIND_SPECS, declaredTypeOf } from '../src/shared/kinds.ts'
import type { PanelRecord, RecordKind } from '../src/shared/types.ts'
import { IN_HEADLINE } from '../src/shared/sections.ts'
import { sectionsOf } from '../src/web/components/sections.ts'

type Page = typeof import('../src/web/pages/RecordPage.tsx')
type Gov = typeof import('../src/web/components/Governance.tsx')

/**
 * A window, and the page imported after it exists.
 *
 * src/web/lib/mode.ts reads the mode once, while it is loading — see the head of
 * tests/record-tiers.test.ts for why it does that — so a file that wants a particular mode has to
 * set the store, forget the loaded modules, and import again. Nothing here is under test.
 */
async function boot(mode?: string) {
  const store = new Map<string, string>()
  if (mode !== undefined) store.set('mole-office.mode', mode)
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
  vi.resetModules()
  return {
    page: (await import('../src/web/pages/RecordPage.tsx')) as Page,
    gov: (await import('../src/web/components/Governance.tsx')) as Gov,
  }
}

const NOW = '2026-08-10 09:00:00'

function record(kind: RecordKind, data: Record<string, unknown>, over: Record<string, unknown> = {}): PanelRecord {
  return {
    id: 'rec-1',
    workspaceId: 'panelx',
    kind,
    title: 'Zarnwell gauge, third calibration',
    summary: null,
    data,
    origin: 'authored',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ownerId: THE_TEST_OFFICES_OWNER.id,
    ...over,
  } as unknown as PanelRecord
}

/** Everything `RecordDetail` needs, as plain data. Nothing here fetches. */
function detailProps(rec: PanelRecord, body: unknown[], over: Record<string, unknown> = {}) {
  return {
    record: rec,
    editable: false,
    deleted: false,
    records: [rec],
    detailLinks: [],
    relations: [],
    evolutionLinks: [],
    log: { changes: [], sessions: [] },
    titles: [rec.title],
    titleById: new Map([[rec.id, rec.title]]),
    unfilledByRecord: new Map<string, number>(),
    body,
    onChanged: () => {},
    ...over,
  }
}

/** Everything `RecordHead` needs. The project list is what turns a project id into a name. */
function headProps(rec: PanelRecord) {
  return {
    record: rec,
    projects: [{ id: 'panelx', title: 'Mole Office', records: 4, note: null }],
    incomplete: [],
    deleted: false,
    editing: false,
    busy: false,
    onSaved: () => {},
    onDelete: async () => {},
  }
}

const strip = (markup: string): string => markup.replace(/<style[\s\S]*?<\/style>/g, '')

/** Render in Normal mode and hand back the markup, without the stylesheets. */
function drawn(element: ReactElement): string {
  return strip(renderToStaticMarkup(element))
}

// ============================================================================ a note's own words

describe('a note is its body, so the body is on the page', () => {
  const WRITING =
    'Spent the morning on the mast knock.\n\nReprojection went 0.4 px to 1.9 px, so something really did move.'

  it('draws the words a person wrote, in Normal mode, without opening anything', async () => {
    const { page } = await boot('normal')
    const rec = record('note', { body: WRITING, date: '2026-08-07' })
    const html = drawn(h(page.RecordDetail, detailProps(rec, page.bodySections(rec)) as never))
    expect(html, 'a note’s own words are not on its page').toContain('Spent the morning on the mast knock.')
    expect(html, 'the rest of the note is not on its page').toContain('so something really did move.')
  })

  it('keeps the paragraph breaks the person typed', async () => {
    const { page } = await boot('normal')
    const rec = record('note', { body: WRITING })
    const html = drawn(h(page.RecordDetail, detailProps(rec, page.bodySections(rec)) as never))
    // The two paragraphs with the blank line between them still in one text node. The rule that
    // makes that visible is `.rd-writing { white-space: pre-wrap }` in the page's own stylesheet;
    // what is checked here is that nothing collapsed or dropped the newlines on the way.
    expect(html, 'the blank line between the two paragraphs was thrown away').toContain(
      'mast knock.\n\nReprojection',
    )
  })

  it('says the note is empty rather than drawing nothing', async () => {
    const { page } = await boot('normal')
    const rec = record('note', { date: '2026-08-07' })
    const html = drawn(h(page.RecordDetail, detailProps(rec, page.bodySections(rec)) as never))
    expect(html).toContain('Nothing is written in this note')
  })

  it('prints the day the writing is about, and prints no second date when there is none', async () => {
    const { page } = await boot('normal')
    const dated = record('note', { body: WRITING, date: '2026-08-07' })
    expect(drawn(h(page.RecordDetail, detailProps(dated, page.bodySections(dated)) as never))).toContain(
      'The day this writing is about: 2026-08-07',
    )
    const undated = record('note', { body: WRITING })
    // NOT a sentence announcing the absence. The day a record was written is on the header line of
    // every record in the product, so a note with no `date` has one date rather than a hole.
    expect(
      drawn(h(page.RecordDetail, detailProps(undated, page.bodySections(undated)) as never)),
      'an undated note announced an absence that is not one',
    ).not.toContain('The day this writing is about')
  })

  it('does not tell a note with a body that it stores no prose', async () => {
    // "This record stores no prose of its own" was printed under a note's own words, because
    // `props.body` is what is left AFTER the fields the headline drew — an empty list means there
    // is nothing FURTHER, not that there is nothing. It was a false sentence about the record on
    // screen. It lived in the sections layout, which round four deleted, so this now pins that no
    // layout says it and that the note's writing still reaches the page.
    const { page } = await boot('normal')
    const rec = record('note', { body: WRITING })
    const html = drawn(h(page.RecordDetail, detailProps(rec, page.bodySections(rec)) as never))
    // The control: the note really was drawn, so the assertion under it is about a page with the
    // writing on it rather than about an empty string.
    expect(html, 'the note’s own words went missing').toContain('Spent the morning on the mast knock.')
    expect(html).not.toContain('stores no prose of its own')
  })
})

// ============================================================================ a message's own words

describe('a message is its body too', () => {
  const SAID = 'The print cracked again at setting 15. I am holding the sweep until you say whether to try PETG.'

  it('draws what was said, and who said it', async () => {
    const { page } = await boot('normal')
    const rec = record('message', { body: SAID, from: 'claude-code · session touch' })
    const html = drawn(h(page.RecordDetail, detailProps(rec, page.bodySections(rec)) as never))
    expect(html, 'the message’s own words are not on its page').toContain('the sweep until you say whether to try PETG')
    expect(html).toContain('From claude-code')
  })

  it('tells stored, stored the other way, and nobody said apart', async () => {
    const { page } = await boot('normal')
    const of = (data: Record<string, unknown>) => {
      const rec = record('message', { body: SAID, ...data })
      return drawn(h(page.RecordDetail, detailProps(rec, page.bodySections(rec)) as never))
    }
    expect(of({ read: true })).toContain('Marked as read.')
    expect(of({ read: false })).toContain('Marked as not read.')
    // The third answer, and the one almost every message in the corpus holds. Collapsing it into
    // "not read" would be Mole Office answering a question nobody asked it.
    expect(of({})).toContain('Nobody has marked this as read or unread.')
    expect(of({})).not.toContain('Marked as not read.')
  })

  it('says a message with no words has none, which is what makes it incomplete', async () => {
    const { page } = await boot('normal')
    const rec = record('message', { from: 'claude-code · session touch' })
    const html = drawn(h(page.RecordDetail, detailProps(rec, page.bodySections(rec)) as never))
    expect(html).toContain('Nothing is written in this message')
  })

  it('says nobody recorded the sender rather than leaving the line off', async () => {
    const { page } = await boot('normal')
    const rec = record('message', { body: SAID })
    expect(drawn(h(page.RecordDetail, detailProps(rec, page.bodySections(rec)) as never))).toContain(
      'Nobody recorded who this is from',
    )
  })
})

// ============================================================================ the standing guard

/**
 * Field shapes this file cannot check by looking for the stored value, and why for each one.
 *
 * Written down rather than skipped: what a test does not cover is as much a fact about it as what
 * it does, and a reader of a green run deserves to know which half they are looking at.
 */
const NOT_CHECKED_BY_VALUE: Readonly<Record<string, string>> = {
  date: 'A date is reformatted for the reader, so the stored spelling is the wrong thing to look for.',
  number: 'A number is drawn as a figure beside its name, and a search for "240" hits any 240 on the page.',
  boolean: 'A boolean is drawn as words — "Marked as read" — and never as true or false.',
  literals: 'A state word is drawn by the state controls and the chips, which this file does not render.',
  array: 'An array is drawn item by item, so there is no one string to look for.',
  open: 'An open bag has no declared shape and therefore no declared drawing.',
  either: 'A field with two shapes is drawn two ways; which one is on screen depends on the value.',
  record: 'A map of numbers is drawn as figures, one per key.',
  shape: 'A nested shape is drawn field by field, if at all.',
}

/** A field `IN_HEADLINE` claims, the value written into it, and where to look for it. */
interface Claimed {
  kind: RecordKind
  key: string
  mark: string
}

/**
 * Which claimed fields are plain strings, and a distinctive value for each.
 *
 * The marks are unique per kind and per key on purpose. A shared mark would let one component
 * satisfy the search for a field a different component was supposed to draw, which is how an
 * assertion passes with the feature deleted.
 */
function claimedStrings(page: Page): Claimed[] {
  const out: Claimed[] = []
  for (const [kind, keys] of Object.entries(IN_HEADLINE)) {
    const spec = KIND_SPECS[kind as RecordKind]
    for (const key of keys as readonly string[]) {
      const field = spec?.fields.find((f) => f.key === key)
      // A key that is not a declared field is already a failure in tests/record-tiers.test.ts, and
      // one failure in one place is enough.
      if (field === undefined) continue
      const node = declaredTypeOf(field)
      if (node.kind !== 'scalar' || node.name !== 'string') continue
      out.push({ kind: kind as RecordKind, key, mark: `Zq7${kind}${key}Zq7` })
    }
  }
  return out
}

/**
 * Fields the headline claims and nothing draws, each with the file whose owner has to fix it.
 *
 * LISTED, NOT SKIPPED. The test at the foot renders each one and fails when it has STARTED being
 * drawn, so the person who fixes it deletes the entry rather than leaving an excuse nothing checks.
 */
function notDrawn(): { kind: RecordKind; key: string; reason: string }[] {
  return [
    {
      kind: 'obligation',
      key: 'fulfilledNote',
      reason:
        'ObligationPanel draws the note only on a promise that has been discharged, and the record ' +
        'this file builds has no discharge on it. Not measured either way for a discharged one.',
    },
    {
      kind: 'block',
      key: 'measured',
      reason:
        'The task and block headline says what the work is part of and offers its state word. What ' +
        'a pipeline step measured is claimed by IN_HEADLINE and drawn by nothing.',
    },
    {
      kind: 'session',
      key: 'workspace',
      reason:
        'The session headline says what the run is doing, its state and who ran it. The directory ' +
        'it ran in is claimed and drawn nowhere.',
    },
    {
      kind: 'purchase',
      key: 'currency',
      reason: 'KindLead has no purchase case at all, so every string field a purchase declares is claimed and drawn nowhere.',
    },
    { kind: 'purchase', key: 'vendor', reason: 'Same: KindLead has no purchase case.' },
    { kind: 'purchase', key: 'url', reason: 'Same: KindLead has no purchase case.' },
  ]
}

describe('every field the headline claims is drawn on a Normal screen', () => {
  it('has something to check, and says what it cannot check', async () => {
    const { page } = await boot('normal')
    // A GUARD THAT MEASURED NOTHING PASSES EVERY ASSERTION BELOW. Checked by a number first, for
    // the same reason the review tools are: a run that never started reads as a run that succeeded.
    expect(claimedStrings(page).length, 'no claimed string fields were found at all').toBeGreaterThan(15)
    expect(Object.keys(NOT_CHECKED_BY_VALUE).length).toBeGreaterThan(0)
  })

  for (const kind of Object.keys(KIND_SPECS) as RecordKind[]) {
    it(`${kind}`, async () => {
      const { page, gov } = await boot('normal')
      const mine = claimedStrings(page).filter((c) => c.kind === kind)
      if (mine.length === 0) return
      const excused = new Set(notDrawn().filter((e) => e.kind === kind).map((e) => e.key))
      // THE KIND'S OWN EXAMPLE UNDERNEATH, AND THE MARKS ON TOP. A record holding one field and
      // nothing else is not a record of that kind, and a panel is allowed to need a companion field
      // — a proposal's recommendation is drawn beside the options it names, so a proposal with a
      // recommendation and no options draws neither, and the guard would have reported a hole that
      // no real proposal has. The example is the schema's own, so it cannot drift from the kind.
      const data: Record<string, unknown> = { ...(KIND_SPECS[kind]?.example ?? {}) }
      for (const claim of mine) data[claim.key] = claim.mark
      const html = wholePage(page, gov, record(kind, data))
      const missing = mine
        .filter((c) => !excused.has(c.key) && !html.includes(c.mark))
        .map((c) => `${c.kind}.${c.key}`)
      expect(
        missing,
        `IN_HEADLINE in src/web/pages/RecordPage.tsx says the ${kind} headline answers these ` +
          `fields, so bodySections leaves them out — and nothing draws them. The words are stored ` +
          `and no Normal reader can see them: ${missing.join(', ')}`,
      ).toEqual([])
    })
  }
})

describe('the fields nothing draws yet', () => {
  for (const entry of notDrawn()) {
    // NOT `it.skip`. This runs, and it asserts the hole is still there. When somebody fills it this
    // goes red and the entry is deleted.
    it(`is still missing, and RecordPage.tsx has to change: ${entry.kind}.${entry.key}`, async () => {
      const { page, gov } = await boot('normal')
      const claim = claimedStrings(page).find((c) => c.kind === entry.kind && c.key === entry.key)
      expect(claim, `${entry.kind}.${entry.key} is no longer a claimed string field`).toBeDefined()
      if (claim === undefined) return
      const html = wholePage(
        page,
        gov,
        record(entry.kind, { ...(KIND_SPECS[entry.kind]?.example ?? {}), [entry.key]: claim.mark }),
      )
      expect(
        html.includes(claim.mark),
        `${entry.kind}.${entry.key} is now drawn on a Normal screen. Delete its entry from ` +
          `notDrawn() in this file. Reason recorded: ${entry.reason}`,
      ).toBe(false)
    })
  }
})

/**
 * The whole Normal record page bar the Developer panels: the header, the proposal fork where there
 * is one, and the three tiers.
 *
 * ONE FUNCTION, called by the guard and by the list of holes below it. Two renders of "the record
 * page" would be two ideas of what the page is, and the list could then say a field is missing from
 * a page that draws it.
 *
 * `ProposalGovernance` is included because a proposal's headline is drawn there and not in
 * `KindLead` — leaving it out would put four fields on the list of holes that are on the screen.
 */
function wholePage(page: Page, gov: Gov, rec: PanelRecord): string {
  const parts = [
    drawn(h(page.RecordHead, headProps(rec) as never)),
    drawn(h(page.RecordDetail, detailProps(rec, page.bodySections(rec)) as never)),
  ]
  if (rec.kind === 'proposal') {
    parts.push(
      drawn(
        h(gov.ProposalGovernance, {
          recordId: rec.id,
          title: rec.title,
          data: rec.data as Record<string, unknown>,
          resolved: false,
          settledBy: [],
          decisionData: new Map(),
          // WHICH SECTION EACH PART OF THE PANEL DRAWS, from the same reader the record page
          // builds. This fixture has no envelope summary and no links, and `null` and `[]` say so.
          sections: sectionsOf({
            id: rec.id,
            kind: 'proposal',
            data: rec.data as Record<string, unknown>,
            title: rec.title,
            summary: rec.summary,
            relations: [],
          }),
          onSettled: () => {},
        } as never),
      ),
    )
  }
  return parts.join('\n')
}

// ============================================================================ the two derived sections

/**
 * *WHERE THIS LIVES* AND *WHAT THIS WAS MADE OF* ARE PLACES ON THE PAGE, SO A PRESS LANDS ON THEM.
 *
 * WHAT WAS WRONG, MEASURED. On 30 August 2026 the owner's own Act 1 was run against the live app:
 * right-click five named headings on module `cegP4HnIk9nd` and read the composer. Three landed on
 * their section. Two — *What this was made of* and *Where this lives* — put "PanelX — work-state
 * rules: state words, consequence, gates" in the composer, which is the whole module. The owner's pass
 * condition is that the five differ and none of them is the module root, so it failed.
 *
 * The two panels declared `{ surface: null }`, on the argument that their ROWS come from other
 * records. That is right about a row and wrong about the panel: the panel is a place on THIS
 * record's page, and the owner's own acceptance names both — *Sources & history* and *Implementation* — in
 * its list of meaningful sections on a module.
 *
 * WHAT THIS TEST HOLDS. The element carrying the panel says which section it is. It is the DOM
 * attribute and not the composer, so it is the near half of the proof; the far half is a person
 * right-clicking the heading and reading the chip.
 */
describe('the two panels drawn from other records still say which section of this record they are', () => {
  const CASES = [
    { kind: 'module' as const, wants: ['section.whereItLives', 'section.madeOf'] },
    { kind: 'pipeline' as const, wants: ['section.whereItLives', 'section.madeOf'] },
    // A BLOCK HAS NO STORED MEMBERSHIP, so it draws no *What this was made of* and declares no
    // section for one. `KINDS_WITH_COMPOSITION` is the one place that is written down.
    { kind: 'block' as const, wants: ['section.whereItLives'] },
  ]

  for (const one of CASES) {
    it(`a ${one.kind} page carries ${one.wants.join(' and ')}`, async () => {
      const { page } = await boot()
      const rec = record(one.kind, {})
      const html = drawn(h(page.RecordDetail, detailProps(rec, page.bodySections(rec)) as never))
      for (const key of one.wants) {
        expect(html, `${one.kind} draws the panel and does not say which section it is`).toContain(
          `data-target="region/${rec.id}/${key}"`,
        )
      }
    })
  }

  it('a kind with neither panel carries neither section', async () => {
    const { page } = await boot()
    const rec = record('note', { body: 'a note is its body' })
    const html = drawn(h(page.RecordDetail, detailProps(rec, page.bodySections(rec)) as never))
    expect(html).not.toContain('section.whereItLives')
    expect(html).not.toContain('section.madeOf')
  })
})
