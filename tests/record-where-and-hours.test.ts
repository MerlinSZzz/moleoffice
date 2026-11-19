// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RECORD PAGE'S ANSWER TO "WHERE DOES THIS SIT, AND HOW BIG IS IT".
 *
 * ---------------------------------------------------------------------------------------------
 * THE THREE DEFECTS THESE TESTS HOLD SHUT
 * ---------------------------------------------------------------------------------------------
 *
 * 1. THE PAGE HAD ITS OWN CONTAINMENT READER. It filtered this record's own `part_of` links, which
 *    is one of the three stores Mole Office keeps containment in, so every step of every pipeline opened
 *    saying "Nothing says what this is part of" while the rest of the product showed the same step
 *    inside its pipeline. It now asks `parentOf` in src/shared/containment.ts, the one reader.
 *
 * 2. AN ESTIMATE COULD BE WRITTEN ONCE AND NEVER CHANGED. `effort_hours` was drawn as a folded
 *    heading with a bare number under it, and the row that offers a control only offers fields the
 *    record does NOT have. So a person who typed 6 could not make it 9.
 *
 * 3. STORED KEYS WERE PRINTED AT THE READER. "data.due is not filled in" opened the report on every
 *    unfinished obligation, and the button that saved a field read "Save data.effort_hours".
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT MAKES EACH OF THESE ABLE TO FAIL
 * ---------------------------------------------------------------------------------------------
 *
 * The containment tests hand the page NO link on the record itself: the pipeline's stored order is
 * the only thing that says the block belongs anywhere, and the `part_of` case puts its link in the
 * project's links and not in the record's. A page that went back to filtering `detailLinks` would
 * answer "Nothing says what this is part of" in both, which is what these assert against.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { KIND_SPECS, completenessOf } from '../src/shared/kinds.ts'
import type { PanelRecord, RecordKind } from '../src/shared/types.ts'
import { EFFORT_KEY, IN_HEADLINE } from '../src/shared/sections.ts'

type Page = typeof import('../src/web/pages/RecordPage.tsx')
let page: Page

beforeAll(async () => {
  // The page reaches api.ts and router.tsx, which touch `window` while they are being evaluated.
  // The smallest stand-in that lets them load. Nothing here is under test.
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  page = (await import('../src/web/pages/RecordPage.tsx')) as Page
})

const NOW = '2026-08-14 09:00:00'

function record(kind: RecordKind, id: string, over: Partial<PanelRecord> = {}): PanelRecord {
  return {
    id,
    workspaceId: 'panelx',
    kind,
    title: `${kind} ${id}`,
    summary: null,
    data: {},
    origin: 'authored',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ownerId: THE_TEST_OFFICES_OWNER.id,
    ...over,
  } as PanelRecord
}

/** Everything `RecordDetail` needs, as plain data. Nothing here fetches. */
function detailProps(rec: PanelRecord, over: Record<string, unknown> = {}) {
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
    titleById: new Map<string, string>(),
    unfilledByRecord: new Map<string, number>(),
    body: page.bodySections(rec),
    onChanged: () => {},
    ...over,
  }
}

/** The words a person reads, with the tags and their attributes taken out. */
function readable(markup: string): string {
  return markup.replace(/<[^>]+>/g, ' ')
}

function drawn(rec: PanelRecord, over: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(h(page.RecordDetail, detailProps(rec, over) as never)).replace(
    /<style[\s\S]*?<\/style>/g,
    '',
  )
}

// ============================================================================ what it is part of

describe('what a record is part of comes from the one reader, not from this page', () => {
  const step = () => record('block', 'blk-1', { title: 'Wave 1 — the visual language' })
  const pipeline = () =>
    record('pipeline', 'pipe-1', { title: 'The development campaign', data: { blockIds: ['blk-1'] } })

  it('reads a pipeline’s stored order, which is not a link and was invisible before', () => {
    const html = drawn(step(), { records: [step(), pipeline()] })
    expect(html).toContain('The development campaign')
    expect(html).toContain('Step 1 of')
    expect(html).not.toContain('Nothing says what this is part of')
  })

  it('reads a part_of link that is in the project rather than on this record', () => {
    const module = record('module', 'mod-1', { title: 'The gripper module' })
    const html = drawn(step(), {
      records: [step(), module],
      // NOT in `detailLinks`. The old reader only ever looked there.
      detailLinks: [],
      relations: [],
      evolutionLinks: [{ id: 'lnk-1', fromId: 'blk-1', toId: 'mod-1', type: 'part_of', inferred: false }],
    })
    expect(html).toContain('The gripper module')
    expect(html).toContain('Part of')
    expect(html).not.toContain('Nothing says what this is part of')
  })

  it('says nothing holds it when nothing does, rather than guessing', () => {
    const html = drawn(step(), { records: [step()] })
    expect(html).toContain('Nothing says what this is part of')
  })

  it('names every claimant when two things claim it, and picks neither', () => {
    const module = record('module', 'mod-1', { title: 'The gripper module' })
    const html = drawn(step(), {
      records: [step(), pipeline(), module],
      evolutionLinks: [{ id: 'lnk-1', fromId: 'blk-1', toId: 'mod-1', type: 'part_of', inferred: false }],
    })
    expect(html).toContain('Mole Office will not choose between them')
    expect(html).toContain('The development campaign')
    expect(html).toContain('The gripper module')
    // A conflict drawn as one of the two would be the page answering a question the data does not.
    expect(html).not.toContain('Step 1 of')
  })
})

// ============================================================================ how big it is

describe('the hours a piece of work holds are on its own page, and can be changed', () => {
  const sized = () => record('task', 'tsk-1', { data: { effort_hours: 6 } })

  it('prints the estimate the record holds', () => {
    const html = drawn(sized())
    expect(html).toContain('Estimated at')
    expect(html).toContain('6')
  })

  it('tells an unestimated piece of work apart from one estimated at zero', () => {
    const html = drawn(record('task', 'tsk-2'))
    expect(html).toContain('Nobody has estimated how long this is')
    expect(html).not.toContain('Estimated at')
  })

  it('offers the press that changes an estimate already written', () => {
    const html = drawn(sized(), { editable: true })
    expect(html).toContain('Change the estimate')
  })

  it('offers the press that writes a first estimate', () => {
    const html = drawn(record('task', 'tsk-2'), { editable: true })
    expect(html).toContain('Estimate it')
  })

  it('offers no press at all on a record being read', () => {
    const html = drawn(sized())
    expect(html).not.toContain('Change the estimate')
    expect(html).not.toContain('Estimate it')
  })

  it('draws the estimate once, not in the panel and again in the body', () => {
    // `IN_HEADLINE` is what keeps the body and the "Add:" row off a field the panel answers.
    expect(page.bodySections(sized()).map((s) => s.key)).not.toContain(EFFORT_KEY)
    expect(IN_HEADLINE['task']).toContain(EFFORT_KEY)
    expect(IN_HEADLINE['block']).toContain(EFFORT_KEY)
  })
})

// ============================================================================ a written field

describe('a field that is already written can still be changed', () => {
  it('puts a press under the words, named after the field in English', () => {
    const rec = record('task', 'tsk-3', { data: { command: 'make demo-handover' } })
    const html = drawn(rec, { editable: true })
    expect(html).toContain('Change command')
    // The stored path belongs in a PATCH, not in front of a person.
    //
    // NARROWED ON 18 AUGUST 2026, FROM THE WHOLE MARKUP TO THE WORDS ON THE SCREEN. The paragraph
    // now carries `data-talk-field="data.command"`, which is how a comment on a few of these words
    // tells the server which stored string to look them up in. That is an attribute and not a
    // sentence: nobody reads it, and it is the field's real stored path on purpose, because a name
    // of this page's own invention there is exactly the second spelling that would silently stop
    // matching. What this test is about is the words, so the words are what it now reads.
    expect(readable(html)).not.toContain('data.command')
  })

  it('draws no press while the record is being read', () => {
    const rec = record('task', 'tsk-3', { data: { command: 'make demo-handover' } })
    expect(drawn(rec)).not.toContain('Change command')
  })
})

// ============================================================================ words, not paths

describe('the report of a missing field names the field in English', () => {
  it('turns the stored path at the front of the sentence into the field’s name', () => {
    const [first] = completenessOf('obligation', {})
    expect(first).toBeDefined()
    const plain = page.plainIncompleteness(first!)
    expect(plain.message.startsWith('Due is not filled in')).toBe(true)
    // The path itself is untouched: it is what the control uses to find the field to write.
    expect(plain.path).toBe('data.due')
  })

  it('leaves a sentence it does not recognise exactly as it was', () => {
    const odd = { path: 'kind', message: 'This record’s kind is "wibble", which is not one Mole Office knows.' }
    expect(page.plainIncompleteness(odd)).toEqual(odd)
  })

  /**
   * THE ANTI-DRIFT GUARD. `plainIncompleteness` swaps a prefix it expects `completenessOf` to
   * write. That is one fact known in two files, so this checks it against every required field of
   * every kind: if the schema ever rephrases, this goes red rather than the swap quietly stopping.
   */
  it('matches what completenessOf really writes, for every required field of every kind', () => {
    for (const [kind, spec] of Object.entries(KIND_SPECS)) {
      const items = completenessOf(kind as RecordKind, {})
      const required = spec.fields.filter((f) => f.required)
      expect(items.length, `${kind} reported a different number of missing fields`).toBe(required.length)
      for (const item of items) {
        expect(
          item.message.startsWith(`${item.path} `),
          `${kind}: completenessOf no longer opens with the stored path, so the swap to English is dead`,
        ).toBe(true)
        const plain = page.plainIncompleteness(item)
        const name = page.englishHeading(item.path.slice('data.'.length))
        expect(plain.message.startsWith(`${name} `), `${kind}.${item.path} kept its stored path`).toBe(true)
        expect(plain.message).not.toContain(`${item.path} is not filled in`)
      }
    }
  })
})
