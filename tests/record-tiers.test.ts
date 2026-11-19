// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE THREE TIERS ON A RECORD PAGE, AND THE TWO THINGS THAT CANNOT DRIFT.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS SEPARATELY FROM tests/record-page.test.ts
 * ---------------------------------------------------------------------------------------------
 *
 * That file installs one `window` in `beforeAll` and imports the page once, at module scope. The
 * mode is read at import time, on purpose (src/web/lib/mode.ts explains why: an effect runs after
 * the first paint, so restoring there would show one frame of the wrong page). A file that imports
 * the page once therefore cannot express "in inspect" at all — every test in it renders in normal
 * mode and nothing in the suite could see the difference.
 *
 * So the mode tests here use `boot()` below: build the window, `vi.resetModules()`, and import the
 * page INSIDE the test, after the store holds the mode being asked about.
 *
 * ---------------------------------------------------------------------------------------------
 * THE GUARD THAT MATTERS MORE THAN THE RENDERING
 * ---------------------------------------------------------------------------------------------
 *
 *   `englishHeading` computes a heading from a key instead of a table mapping one to the other. The
 *   claim that makes that safe is "every declared key reads as English when it is de-snaked", and
 *   that claim is checked against the whole schema here rather than trusted.
 *
 *   `IN_HEADLINE` USED TO BE GUARDED HERE and is not any more. The table moved to
 *   src/shared/sections.ts, where the region tree reads it too, and the guard moved with it to
 *   tests/sections.test.ts — which needs no window and no React to prove that a table names a real
 *   field. What is still here is the drawing: what the body does with what the headline claims.
 */

import { describe, expect, it, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { KIND_SPECS } from '../src/shared/kinds.ts'
// The fork reading moved to shared code so that GET /api/needs-you and this page cannot disagree
// about whether an agent picked an option — Home badged the one fork whose agent refused to choose
// as having a recommendation. Imported from where it now lives rather than re-exported from the
// component, because a re-export is the second path this move exists to remove.
import { optionCards, pickedOption, rejectedBy, takenOption, TAKE_NONE } from '../src/shared/proposal.ts'
import type { PanelRecord, RecordKind } from '../src/shared/types.ts'
import { sectionsOf } from '../src/web/components/sections.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

type Page = typeof import('../src/web/pages/RecordPage.tsx')
type Gov = typeof import('../src/web/components/Governance.tsx')

/**
 * A window, a mode, and the page imported after both are set.
 *
 * `vi.resetModules()` is the runner's own way of saying "forget what you have loaded", which is
 * exactly what a module that reads its setting once at import needs.
 */
async function boot(options: { mode?: string } = {}) {
  const store = new Map<string, string>()
  if (options.mode !== undefined) store.set('mole-office.mode', options.mode)
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
    title: 'A record',
    summary: null,
    data,
    origin: 'authored' as const,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ownerId: THE_TEST_OFFICES_OWNER.id,
    ...over,
  }
}

/** Everything `RecordDetail` needs, as plain data. Nothing here fetches. */
function detailProps(rec: ReturnType<typeof record>, over: Record<string, unknown> = {}) {
  return {
    record: rec,
    editable: true,
    records: [rec],
    detailLinks: [],
    relations: [],
    evolutionLinks: [],
    log: { changes: [], sessions: [] },
    titles: ['A record'],
    titleById: new Map([['rec-1', 'A record']]),
    unfilledByRecord: new Map<string, number>(),
    body: [],
    onChanged: () => {},
    ...over,
  }
}

function strip(markup: string): string {
  return markup.replace(/<style[\s\S]*?<\/style>/g, '')
}

/**
 * The words a person reads, with the tags taken out and nothing put in their place.
 *
 * NOT `drawnText` from ./drawn.ts, which puts a newline where each tag was: that answers *is this
 * sentence Mole Office's own prose or somebody's stored words*, and it would split a label from the
 * value beside it. This answers *does the reader see these words in this order*, which is the
 * question a sentence made of a label and a stored string needs asked.
 */
function textOf(markup: string): string {
  return strip(markup).replace(/<[^>]+>/g, '')
}

// ============================================================================ headings

describe('a heading is computed from the stored key, never written down beside it', () => {
  it('turns every declared key of every kind into English', async () => {
    const { page } = await boot()
    for (const [kind, spec] of Object.entries(KIND_SPECS)) {
      for (const field of spec.fields) {
        const heading = page.englishHeading(field.key)
        expect(heading, `${kind}.${field.key} still reads as a stored key`).not.toContain('_')
        expect(heading, `${kind}.${field.key} produced an empty heading`).not.toBe('')
        // A heading, not a sentence fragment starting mid-word.
        expect(heading[0], `${kind}.${field.key} does not start with a capital`).toBe(
          (heading[0] ?? '').toUpperCase(),
        )
      }
    }
  })

  it('splits a camelCase key as well as a snake_case one', async () => {
    const { page } = await boot()
    expect(page.englishHeading('what_would_prove_it_wrong')).toBe('What would prove it wrong')
    expect(page.englishHeading('owedTo')).toBe('Owed to')
    expect(page.englishHeading('caveat')).toBe('Caveat')
  })
})

// ============================================================================ the body

describe('the body is the record’s own prose and nothing else', () => {
  it('leaves out what the headline already answered', async () => {
    const { page } = await boot()
    const sections = page.bodySections(
      record('claim', {
        numbers: { sigma_z_mm: 5.8 },
        measured_on: 'the chest camera',
        method: 'a checkerboard sweep',
        caveat: 'one operator, one light',
      }),
    )
    const keys = sections.map((s) => s.key)
    expect(keys).toContain('method')
    expect(keys).toContain('caveat')
    // `numbers` and `measured_on` are drawn by the headline; printing them again under a heading is
    // the duplication this tier exists to remove.
    expect(keys).not.toContain('numbers')
    expect(keys).not.toContain('measured_on')
  })

  it('never puts a nested object or the open bag into the reading matter', async () => {
    const { page } = await boot()
    const keys = page
      .bodySections(
        record('problem', {
          cause: 'the handler was stubbed',
          consequence: { bearer: 'person', what: 'the arm keeps moving' },
          extra: { anything: 1 },
          source: 'a thread',
        }),
      )
      .map((s) => s.key)
    expect(keys).toEqual(['cause'])
  })

  it('says nothing about a field nobody wrote, rather than printing an empty heading', async () => {
    const { page } = await boot()
    expect(page.bodySections(record('problem', { cause: '  ' }))).toEqual([])
  })
})

// ============================================================================ normal and inspect

describe('the machinery is absent in normal and present in inspect, not merely hidden', () => {
  const rec = () =>
    record('problem', {
      symptom: 'the arm keeps moving',
      cause: 'the handler was stubbed',
      state: 'open',
    })

  const links = [
    {
      linkId: 'l1',
      type: 'blocks',
      label: 'blocks',
      isBacklink: false,
      inferred: false,
      broken: false,
      other: { id: 'other-9', kind: 'task', title: 'Implement the handler', summary: null, origin: 'authored' },
    },
  ]

  it('draws a link as a sentence in normal mode, with no id and no storage note', async () => {
    const { page } = await boot({ mode: 'normal' })
    const html = strip(renderToStaticMarkup(h(page.RecordDetail, detailProps(rec(), { detailLinks: links }) as never)))
    expect(html).toContain('Implement the handler')
    expect(html).toContain('blocks')
    // An id inside an href is the address of the page it opens and is not on screen; an id in a
    // text node is. Only the second is what this pass was told to take off the page.
    //
    // `data-target` IS THE SECOND MACHINE ATTRIBUTE TO CARRY ONE, added 30 August 2026. A link row
    // now says which record it names, so a press on it answers that record instead of the record
    // the row is printed on — and the id is in the attribute the walk reads, exactly as the address
    // is in `href`. NOTHING ABOUT WHAT THIS TEST ASSERTS HAS CHANGED: no id may be drawn as text in
    // normal mode, and none is. What changed is that the reading now takes the id off both machine
    // attributes rather than one, which is this comment's own rule applied a second time.
    const visible = html.replace(/href="[^"]*"/g, '').replace(/data-target="[^"]*"/g, '')
    expect(visible, 'a record id is drawn as text in normal mode').not.toContain('other-9')
    expect(html).not.toContain('stored here')
    expect(html).not.toContain('stored on the other record')
  })

  it('grows the same row with its direction and its id in inspect', async () => {
    const { page } = await boot({ mode: 'inspect' })
    const html = strip(renderToStaticMarkup(h(page.RecordDetail, detailProps(rec(), { detailLinks: links }) as never)))
    expect(html).toContain('Implement the handler')
    expect(html).toContain('other-9')
    expect(html).toContain('stored here')
  })
})

// ============================================================================ the body, folded

describe('a record draws the headline it computes and folds the rest', () => {
  /**
   * There were two layouts here until round four — the answer-first one below, and a set of named
   * sections all held open — so the owner could compare them on the real corpus. The owner kept this one.
   * What the pair of them was really pinning is what stays worth pinning: the parent computes the
   * headline and the body sections, and the layout only arranges what it is handed.
   */
  const rec = () => record('problem', { symptom: 'the arm keeps moving', cause: 'the handler was stubbed' })
  const body = [{ key: 'cause', heading: 'Cause', value: 'the handler was stubbed' }]

  it('shows the kind’s own prose behind a fold, under the headline the parent worked out', async () => {
    const { page } = await boot()
    const html = strip(renderToStaticMarkup(h(page.RecordDetail, detailProps(rec(), { body }) as never)))

    expect(html).toContain('Cause')
    expect(html).toContain('the handler was stubbed')
    expect(html, 'the headline is not drawn with the body').toContain('the arm keeps moving')
    expect(html, 'the body was not folded').toContain('<details')
    // The sections layout is gone, not hidden behind a setting: its heading element went with it.
    expect(html, 'the deleted sections layout is still being drawn').not.toContain('rd-sec-h')
  })
})

// ============================================================================ the fork

describe('an option is known by the letter its author gave it', () => {
  it('moves a written label into the gutter rather than printing it twice', async () => {
    const { gov } = await boot()
    const cards = optionCards(['a — as proposed', 'b — tasks only', 'c — nothing yet'])
    expect(cards.map((c) => c.letter)).toEqual(['A', 'B', 'C'])
    expect(cards[0]?.body).toBe('as proposed')
    expect(cards.every((c) => c.authored)).toBe(true)
  })

  it('letters an unlabelled option by its position and takes nothing off it', async () => {
    const { gov } = await boot()
    const cards = optionCards(['Leave the key as it is.', 'Add actorId to the key.'])
    expect(cards.map((c) => c.letter)).toEqual(['A', 'B'])
    expect(cards[1]?.body).toBe('Add actorId to the key.')
    expect(cards[1]?.authored).toBe(false)
  })
})

// ======================================================== the choice, written down and read back

/**
 * THE OWNER SETTLED §38: a decision selects a recorded option or an explicit custom option, and
 * either may carry free-text notes that qualify the choice but never replace it.
 *
 * `decision` declares no field for the option TAKEN — only `alternatives_rejected` — so the choice
 * is written NEGATIVELY and completely, and read back as the one answer left standing. That makes
 * two functions that must agree with nothing else making them agree, which is this repository's
 * recurring defect. The round trip below is what makes them agree: change either one alone and
 * these go red.
 */
describe('the option a person took is really recorded, and can be read back', () => {
  const cards = () => optionCards(['a — as proposed', 'b — tasks only', 'c — nothing yet'])

  it('rejects every option but the one taken, and reads that one back', () => {
    const rejected = rejectedBy(cards(), 'B')
    expect(rejected).toEqual(['A', 'C'])
    expect(takenOption(cards(), rejected)).toEqual({ at: 'named', index: 1, letter: 'B' })
  })

  it('records taking none of them as rejecting all of them, rather than as nothing at all', () => {
    // THE BUG THIS FIXES. "None of these" used to store an empty list, which the write path then
    // dropped — so a decision that deliberately took none of the options and a decision that never
    // made a choice were the same record.
    const rejected = rejectedBy(cards(), TAKE_NONE)
    expect(rejected).toEqual(['A', 'B', 'C'])
    expect(takenOption(cards(), rejected)).toEqual({ at: 'own' })
  })

  it('round-trips every answer a person can give', () => {
    for (const answer of ['A', 'B', 'C', TAKE_NONE]) {
      const read = takenOption(cards(), rejectedBy(cards(), answer))
      const said = read.at === 'named' ? read.letter : read.at === 'own' ? TAKE_NONE : 'not-said'
      expect(said, `writing "${answer}" and reading it back gave "${said}"`).toBe(answer)
    }
  })

  it('says nothing rather than guessing when the decision was written another way', () => {
    // The schema's own example for `alternatives_rejected` is whole sentences, and a decision filed
    // by hand or before the picker existed carries those or carries nothing. Neither says which
    // option was taken, and a complement over them would be an invention.
    expect(takenOption(cards(), undefined)).toEqual({ at: 'not-said' })
    expect(takenOption(cards(), [])).toEqual({ at: 'not-said' })
    expect(takenOption(cards(), ['teleoperate the approach'])).toEqual({ at: 'not-said' })
    // Two options still standing is not an answer either.
    expect(takenOption(cards(), ['A'])).toEqual({ at: 'not-said' })
  })

  it('takes the letters as the author wrote them, in either case', () => {
    expect(takenOption(cards(), ['a', 'c'])).toEqual({ at: 'named', index: 1, letter: 'B' })
  })
})

describe('a recommendation counts as a pick only when it names an option', () => {
  it('finds the option a bracketed letter names', async () => {
    const { gov } = await boot()
    const cards = optionCards(['a — as proposed', 'b — tasks only'])
    expect(pickedOption('(a), but only after the two open questions are answered', cards)).toBe(0)
  })

  it('reads an agent declining to choose as no pick, however long the sentence', async () => {
    const { gov } = await boot()
    const cards = optionCards(['Leave the key as it is.', 'Add actorId.', 'Keep the key and change the words.'])
    // The real stored value on acsi4ZoHx6ZB. It is full of the word "a", and the page used to bold
    // "Recommended:" in front of it.
    expect(
      pickedOption(
        'No recommendation. All three are defensible and the choice is about which risk the project would rather carry, which is not mine to take.',
        cards,
      ),
    ).toBe(null)
  })

  it('treats a sentence naming two options as naming neither', async () => {
    const { gov } = await boot()
    const cards = optionCards(['a — one', 'b — two', 'c — three'])
    expect(pickedOption('Either (a) or (b) would do.', cards)).toBe(null)
  })
})

// ======================================================== what is left after somebody decides

/**
 * THE OWNER: *"when I settled the first decision, I could not find it everywhere, it just
 * disappeared and it is difficult to review it or change my mind if it is difficult to find it."*
 *
 * Settling really did take the question off the screen. This panel named the decision and stopped,
 * and the record page draws no other reading of a proposal — `IN_HEADLINE` claims every one of its
 * fields and `KindLead` has no proposal case — so after a promote the question, the options and
 * what would reopen it were reachable only through Inspect's raw field dump.
 *
 * These hold the whole of what a settled decision has to keep. Revert `SettledPanel` to naming the
 * decision and they go red on the first line.
 */
describe('a decision that has been settled stays readable on the record it settled', () => {
  const DATA = {
    question: 'Does a planning allocation live in the project of the work it points at?',
    options: ['a — as proposed', 'b — a personal space', 'c — a third way'],
    recommendation: 'I would take (a).',
    revisit_when: 'once real allocations exist',
  }

  const settled = (over: Record<string, unknown> = {}) =>
    ({
      recordId: 'prop-1',
      title: 'Where a plan belongs',
      data: DATA,
      resolved: true,
      settledBy: [{ id: 'dec-1', title: 'Allocations stay per project', deleted: false, linkedBy: 'test-settler-id', linkedAt: '2026-08-13 13:04:29' }],
      participants: { people: [{ kind: 'person', id: 'test-settler-id', name: 'Avery Example', handle: 'avery' }], agents: [] },
      decisionData: new Map([['dec-1', { alternatives_rejected: ['B', 'C'] }]]),
      // WHICH SECTION EACH PART OF THE PANEL DRAWS. No envelope summary and no links on this
      // fixture, and `null` and `[]` say so.
      sections: sectionsOf({
        id: 'prop-1',
        kind: 'proposal',
        data: DATA,
        title: 'Where a plan belongs',
        summary: null,
        relations: [],
      }),
      onSettled: () => {},
      ...over,
    }) as never

  it('keeps the question and every option on screen, and marks the one that was taken', async () => {
    const { gov } = await boot()
    const html = strip(renderToStaticMarkup(h(gov.ProposalGovernance, settled())))
    expect(html, 'the question disappeared when it was settled').toContain('Does a planning allocation live')
    expect(html, 'an option nobody took disappeared').toContain('a personal space')
    expect(html).toContain('a third way')
    // The option taken is marked, and by a word rather than by colour alone.
    expect(html).toContain('>taken<')
    expect(html).toContain('data-taken="1"')
  })

  it('names the decision, who settled it and when, and links to it', async () => {
    const { gov } = await boot()
    const html = strip(renderToStaticMarkup(h(gov.ProposalGovernance, settled())))
    expect(html).toContain('Allocations stay per project')
    expect(html).toContain('/r/dec-1')
    expect(html, 'who settled it is not on the page').toContain('Avery Example')
    expect(html).not.toContain('test-settler-id')
    expect(html, 'when it was settled is not on the page').toContain('2026-08-13')
    const { gov: inspecting } = await boot({ mode: 'inspect' })
    const details = strip(renderToStaticMarkup(h(inspecting.ProposalGovernance, settled())))
    expect(details).toContain('Avery Example')
    expect(details).toContain('test-settler-id')
  })

  it('keeps what would reopen it, which is the whole of changing your mind', async () => {
    const { gov } = await boot()
    const html = strip(renderToStaticMarkup(h(gov.ProposalGovernance, settled())))
    expect(html).toContain('once real allocations exist')
  })

  it('says the decision did not record a choice rather than marking an option anyway', async () => {
    const { gov } = await boot()
    const html = strip(
      renderToStaticMarkup(
        h(gov.ProposalGovernance, settled({ decisionData: new Map([['dec-1', {}]]) })),
      ),
    )
    expect(html).toContain('does not say which one it took')
    expect(html).not.toContain('data-taken="1"')
  })

  /**
   * A FORK CHOSEN AGAIN IS SETTLED BY TWO DECISIONS, AND ONE OF THEM IS REPLACED. Problem ZSWftCSVUP2r. The option
   * marked taken is the standing decision's, and the replaced one is marked superseded in the list, so a reader can
   * tell which of the two names stands. Seen in round 25's pictures: both were listed with nothing between them.
   */
  it('marks the replaced decision superseded, and the standing decision chooses the taken option', async () => {
    const { gov } = await boot()
    const html = strip(
      renderToStaticMarkup(
        h(
          gov.ProposalGovernance,
          settled({
            settledBy: [
              { id: 'dec-1', title: 'Allocations stay per project', deleted: false, replacedBy: { id: 'dec-2', title: 'Allocations get a personal space' } },
              { id: 'dec-2', title: 'Allocations get a personal space', deleted: false, replacedBy: null },
            ],
            decisionData: new Map([['dec-1', { option_index: 0 }], ['dec-2', { option_index: 1 }]]),
          }),
        ),
      ),
    )
    const items = [...html.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((one) => one[1] ?? '')
    const first = items.find((one) => one.includes('/r/dec-1')) ?? ''
    const second = items.find((one) => one.includes('/r/dec-2')) ?? ''
    expect(first, 'the replaced decision is not marked').toContain('>superseded<')
    expect(second, 'the standing decision is marked as replaced').not.toContain('>superseded<')
    const taken = html.slice(html.indexOf('data-taken="1"'))
    expect(taken.slice(0, taken.indexOf('</li>')), 'the taken option is not the standing decision’s').toContain('a personal space')
  })

  it('says the caller did not load the decision, which is not the same as there being none', async () => {
    const { gov } = await boot()
    const missing = strip(renderToStaticMarkup(h(gov.ProposalGovernance, settled({ settledBy: undefined }))))
    expect(missing).toContain('was not loaded with this panel')
    const none = strip(renderToStaticMarkup(h(gov.ProposalGovernance, settled({ settledBy: [] }))))
    expect(none).toContain('nothing says which decision settled it')
  })
})

// ======================================================== the words on the deciding surface

/**
 * THE OWNER, ON THE SAME SURFACE: the captions under the controls *"are literally not needed if we
 * design our UI or UX good"*, and separately that the product must be written in plain language.
 * "Fork" is a word they have never used.
 *
 * This is a wording test and it is worth having as one: every sentence it names was written to
 * explain a control, and each of them will be tempting to add back.
 */
describe('the deciding surface explains itself with pixels, not with paragraphs', () => {
  const OPEN_DATA = { question: 'Where does a plan belong?', options: ['a — one', 'b — two'], revisit_when: 'later' }
  const open = () =>
    ({
      recordId: 'prop-1',
      title: 'Where a plan belongs',
      data: OPEN_DATA,
      resolved: false,
      sections: sectionsOf({
        id: 'prop-1',
        kind: 'proposal',
        data: OPEN_DATA,
        title: 'Where a plan belongs',
        summary: null,
        relations: [],
      }),
      onSettled: () => {},
    }) as never

  it('never says the word “fork” to the reader', async () => {
    const { gov } = await boot()
    const html = strip(renderToStaticMarkup(h(gov.ProposalGovernance, open())))
    expect(html.toLowerCase()).not.toContain('fork')
  })

  it('drops the captions that said what the buttons do', async () => {
    const { gov } = await boot()
    const html = strip(renderToStaticMarkup(h(gov.ProposalGovernance, open())))
    expect(html).not.toContain('Nothing is lost by leaving it')
    expect(html).not.toContain('only a person may settle this')
    // …and keeps the stored line that is the actual content of leaving it open.
    //
    // IT USED TO READ `toContain('Revisit when: later')` ON THE RAW MARKUP, and the words are still
    // there in that order. What changed on 31 August 2026 is that the stored half is in a span of
    // its own — `Revisit when: <span data-text-field="data.revisit_when">later</span>` — because
    // *Revisit when* is Mole Office's own label and `later` is the author's word, and only the
    // author's word may carry `data-text-field`. That is the same split `px-gov-for-said` already
    // uses one panel up. So the assertion reads the words a person reads.
    expect(textOf(html)).toContain('Revisit when: later')
  })

  it('keeps the one rule a person cannot see, behind the small round mark', async () => {
    const { gov } = await boot()
    const html = strip(renderToStaticMarkup(h(gov.ProposalGovernance, open())))
    expect(html).toContain('px-hint-mark')
    expect(html).toContain('Only you may choose')
  })
})

describe('what a change set would do, in one line', () => {
  it('has a verb, names every non-zero count, and prints no zeros', async () => {
    const { gov } = await boot()
    const delta = {
      ops: [
        ...Array.from({ length: 6 }, (_, i) => ({ op: 'create_record', kind: 'task', title: `t${i}`, workspaceId: 'p', says: '' })),
        ...Array.from({ length: 3 }, (_, i) => ({ op: 'create_record', kind: 'direction', title: `d${i}`, workspaceId: 'p', says: '' })),
        { op: 'unresolved', says: 'which module?', why: 'the draft names none' },
        { op: 'unresolved', says: 'which date?', why: 'the draft says a month' },
      ],
    }
    const line = gov.deltaOutcome(delta as never)
    expect(line).toBe('Creates 9 records — 6 tasks, 3 directions. Nothing that already exists is changed.')
    // The sentence this replaced was "this would 9 things to the project: 9 created, 0 changed, 0
    // joined, 0 given time" — no verb, the same number twice, and three zeros.
    expect(line).not.toContain('0 ')
  })

  it('says a change set that writes nothing writes nothing, rather than counting to zero', async () => {
    const { gov } = await boot()
    expect(gov.deltaOutcome({ ops: [] } as never)).toBe('Changes nothing in the project.')
    expect(
      gov.deltaOutcome({ ops: [{ op: 'reuse_record', recordId: 'x', says: 'already exists' }] } as never),
    ).toContain('names 1 record that already means this')
  })
})

// ============================================================================ the links panel

/**
 * THE OTHER HALF OF tests/record-page.test.ts's "one list in normal mode".
 *
 * That file asserts the split and the storage notes are ABSENT. On its own, that assertion is
 * satisfied by having deleted them, which is the failure this pass was told not to commit: nothing
 * is destroyed and nothing becomes unreachable. This is the half that says they are still there.
 */
describe('what the links panel keeps for a reader who asks for it', () => {
  const rec = () => record('problem', { symptom: 'the arm keeps moving' })
  const both = [
    {
      linkId: 'l1',
      type: 'blocks',
      label: 'blocks',
      isBacklink: false,
      inferred: false,
      broken: false,
      other: { id: 'other-9', kind: 'task', title: 'Implement the handler', summary: null, origin: 'authored' },
    },
    {
      linkId: 'l2',
      type: 'consumes',
      label: 'consumed by',
      isBacklink: true,
      inferred: false,
      broken: false,
      other: { id: 'other-8', kind: 'claim', title: 'The depth figure', summary: null, origin: 'authored' },
    },
  ]

  it('has the split, the storage notes and the way to undo a join, one switch away', async () => {
    const { page } = await boot({ mode: 'inspect' })
    const html = strip(
      renderToStaticMarkup(h(page.RecordDetail, detailProps(rec(), { detailLinks: both }) as never)),
    )
    expect(html).toContain('Outgoing')
    expect(html).toContain('stored here')
    expect(html).toContain('Incoming')
    expect(html).toContain('stored on their side')
    expect(html).toContain('Unlink')
    expect(html).toContain('The reverse direction is never stored')
  })

  it('offers no way to undo a join in the reading path', async () => {
    const { page } = await boot({ mode: 'normal' })
    const html = strip(
      renderToStaticMarkup(h(page.RecordDetail, detailProps(rec(), { detailLinks: both }) as never)),
    )
    // Both rows are still drawn, and both are still readable as sentences.
    expect(html).toContain('Implement the handler')
    expect(html).toContain('The depth figure')
    expect(html).not.toContain('Unlink')
  })
})
