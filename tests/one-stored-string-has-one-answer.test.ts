// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE STORED STRING IS DRAWN ONCE ON A RECORD PAGE, SO A PRESS ON IT HAS ONE ANSWER.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * `resultWillBeUsedTo` is the owner's own field on a proposal — *"A Proposal should make the human
 * answer, explicitly or structurally: Result will be used to: ______"*. It was drawn TWICE on a
 * proposal page: once by `ProposalGovernance` in the panel above the body, and once by the fold
 * stack below it, because `IN_HEADLINE` did not claim the key.
 *
 * The two copies did not answer the same thing. Measured in a real Chromium on 31 August 2026 on
 * all 9 of the 33 proposals in `data/panelx.db` that write the field, 9 of 9 disagreed:
 *
 *     span.px-gov-for-said      up 4 -> record/<id>/panelx
 *     p.rd-prose                up 1 -> region/<id>/section.resultWillBeUsedTo
 *
 * So a comment on that sentence landed in one of two different places depending on which copy of it
 * the reader happened to press. Which copy owns the field is decided in `DRAWN_BY_THE_HEADLINE` in
 * src/shared/sections.ts, at length: the panel owns it, and the fold stack no longer prints it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A RENDER TEST AND NOT A TABLE TEST
 * ---------------------------------------------------------------------------------------
 *
 * `tests/the-summary-and-the-options-are-parts-of-the-record.test.ts` already checks one direction:
 * every key in `DRAWN_BY_THE_HEADLINE` is claimed by `IN_HEADLINE`, so the stack cannot print a
 * field the panel draws. That guard was green throughout the defect, and it had to be — the defect
 * was a field in NEITHER table while a panel drew it anyway. No table can catch that, because no
 * table knew the panel was drawing it.
 *
 * What catches it is counting the string on the rendered page. That is what this file does, and it
 * is why the assertions below are `toBe(1)` rather than `toContain`.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { en } from '../src/shared/words/en.ts'
import { describe, expect, it, vi } from 'vitest'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { PanelRecord } from '../src/shared/types.ts'
import {
  DRAWN_BUT_NOT_WRITTEN_BY_A_PANEL,
  DRAWN_BY_THE_HEADLINE,
  IN_HEADLINE,
  RESULT_WILL_BE_USED_TO_KEY,
} from '../src/shared/sections.ts'
import { sectionsOf } from '../src/web/components/sections.ts'

type Page = typeof import('../src/web/pages/RecordPage.tsx')
type Gov = typeof import('../src/web/components/Governance.tsx')

/** A window, and the page imported after it exists. Copied from tests/record-body.test.ts. */
async function boot() {
  const store = new Map<string, string>()
  store.set('mole-office.mode', 'normal')
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

/**
 * THE SENTENCE THE TEST COUNTS, and it is deliberately unlike anything else on the page.
 *
 * A string that also occurs in a heading, a stored word or this repository's own prose would make
 * the count say something other than what it claims to say.
 */
const USED_TO = 'Unblock the zarnwell gauge page: the answer decides which list it reads.'

const FORK: Record<string, unknown> = {
  question: 'Should a plan live in a project, or above every project?',
  options: ['In a project.', 'Above every project.'],
  recommendation: 'In a project. (a)',
  [RESULT_WILL_BE_USED_TO_KEY]: USED_TO,
}

function proposal(data: Record<string, unknown> = FORK): PanelRecord {
  return {
    id: 'rec-1',
    workspaceId: 'panelx',
    kind: 'proposal',
    title: 'Zarnwell gauge, third calibration',
    summary: null,
    data,
    origin: 'authored',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ownerId: THE_TEST_OFFICES_OWNER.id,
  } as unknown as PanelRecord
}

const strip = (markup: string): string => markup.replace(/<style[\s\S]*?<\/style>/g, '')

function drawn(element: ReactElement): string {
  return strip(renderToStaticMarkup(element))
}

function detailProps(rec: PanelRecord, body: unknown[]) {
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
  }
}

/** The panel and the body together, which is what a reader of a proposal page is looking at. */
function wholeProposalPage(page: Page, gov: Gov, rec: PanelRecord, resolved: boolean): string {
  const reads = sectionsOf({
    id: rec.id,
    kind: 'proposal',
    data: rec.data as Record<string, unknown>,
    title: rec.title,
    summary: rec.summary,
    relations: [],
  })
  const settled = resolved
    ? [{ id: 'dec-1', title: 'The plan lives in the project', deleted: false }]
    : []
  return [
    drawn(h(page.RecordDetail, detailProps(rec, page.bodySections(rec)) as never)),
    drawn(
      h(gov.ProposalGovernance, {
        recordId: rec.id,
        title: rec.title,
        data: rec.data as Record<string, unknown>,
        resolved,
        settledBy: settled,
        decisionData: new Map(),
        sections: reads,
        onSettled: () => {},
      } as never),
    ),
  ].join('\n')
}

const times = (haystack: string, needle: string): number => haystack.split(needle).length - 1

// ============================================================ the field is on the page exactly once

describe("what the answer will be used to do is drawn once, so a comment on it has one home", () => {
  it('is on the page at all, which is the control the count below needs', async () => {
    // WITHOUT THIS THE NEXT TEST PASSES ON AN EMPTY PAGE. A count of one and a count of zero are
    // told apart here and nowhere else in this file.
    const { page, gov } = await boot()
    const html = wholeProposalPage(page, gov, proposal(), false)
    expect(html, 'the owner’s own field is nowhere on a proposal page').toContain(USED_TO)
    expect(html).toContain('Result will be used to')
  })

  it('is drawn once and not twice', async () => {
    const { page, gov } = await boot()
    const html = wholeProposalPage(page, gov, proposal(), false)
    expect(
      times(html, USED_TO),
      'the sentence is on the page more than once, so a press on it has more than one answer',
    ).toBe(1)
  })

  it('is drawn by the panel, which declares the section, and not by a fold that also would', async () => {
    const { page, gov } = await boot()
    const html = wholeProposalPage(page, gov, proposal(), false)
    // The copy that survives is the panel's, and it says which section it is. The class is read
    // rather than the target alone, because the target alone would pass if the FOLD carried it.
    expect(html, 'the surviving copy is not the panel’s').toContain('px-gov-for-said')
    expect(html, 'the panel draws the sentence and does not say which section it is').toContain(
      `region/rec-1/section.${RESULT_WILL_BE_USED_TO_KEY}`,
    )
  })

  it('is left out of the fold stack, which is what stops the second copy', async () => {
    const { page } = await boot()
    const rec = proposal()
    const keys = (page.bodySections(rec) as { key: string }[]).map((one) => one.key)
    expect(
      keys,
      'the fold stack still prints the field the fork’s own panel draws above it',
    ).not.toContain(RESULT_WILL_BE_USED_TO_KEY)
  })

  it('is still on the page after the fork is settled, because that panel replaces the other one', async () => {
    // THE HOLE THIS CLOSES. `SettledPanel` is drawn INSTEAD of the open panel, and it did not print
    // this field. Claiming the key in `IN_HEADLINE` without adding it there would have taken the
    // sentence off the page at the moment somebody settled a fork, while `section.resultWillBeUsedTo`
    // went on being derived for it — a region declared on a place that is on no screen.
    const { page, gov } = await boot()
    const html = wholeProposalPage(page, gov, proposal(), true)
    // The control: this really is the settled panel and not the open one.
    expect(html, 'the fork was not drawn as settled').toContain('Decided')
    expect(html, 'settling a fork took the owner’s own field off the page').toContain(USED_TO)
    expect(times(html, USED_TO), 'the settled page draws it more than once').toBe(1)
    expect(html).toContain(`region/rec-1/section.${RESULT_WILL_BE_USED_TO_KEY}`)
  })

  it('says nobody filled it in, and declares nothing, when nobody did', async () => {
    // AN EMPTY FIELD IS NOT A PLACE IN THE RECORD. `sectionsOnThisRecord` does not derive the
    // section for a proposal that has not written it, so the panel must not claim it either or the
    // server would answer "that part is not there" about a box a reader is looking at.
    const { page, gov } = await boot()
    const bare: Record<string, unknown> = { question: FORK['question'], options: FORK['options'] }
    const html = wholeProposalPage(page, gov, proposal(bare), false)
    expect(html, 'the blank stopped being drawn').toContain('Result will be used to')
    expect(html).toContain(en['decisions.noUse'])
    expect(html, 'an unwritten field claimed a region the record does not have').not.toContain(
      `section.${RESULT_WILL_BE_USED_TO_KEY}`,
    )
  })
})

// ============================================================ and it can still be filled in

/**
 * TAKING THE FOLD AWAY MUST NOT TAKE THE BOX AWAY, AND IT VERY NEARLY DID.
 *
 * A field claimed by `IN_HEADLINE` gets no fold, so it loses the fold's *Change* button, and
 * `AddRow` used to skip every headlined field on the grounds that its panel would have a control.
 * `ProposalGovernance` has none — it draws this field read-only. So the first version of this
 * change left a proposal saying *nobody said* with no way anywhere on the page for anybody to say.
 * Measured on `h6O_RMpeYBTD`, which stores no answer: the words *result will be used to* vanished
 * from the *Add:* row.
 */
// CRITERION CHANGE, plan 7FEOshq3mBGG piece G2b: the Add row calls a field by the word the lists hold
// for it, so this field is offered as "what the answer will be used for" (record.field.resultWillBeUsedTo)
// and no longer as its key spelled out, "result will be used to". Both tests below look for that word.
const OFFERED_AS = en['record.field.resultWillBeUsedTo']

describe('a proposal that has not answered it can still be given an answer', () => {
  it('offers the field on the Add row, because no panel writes it', async () => {
    const { page } = await boot()
    const bare: Record<string, unknown> = { question: FORK['question'], options: FORK['options'] }
    const rec = proposal(bare)
    const html = drawn(
      h(page.RecordDetail, { ...detailProps(rec, page.bodySections(rec)), editable: true } as never),
    )
    expect(html, 'the Add row is not on the page at all').toContain('Add:')
    expect(
      html,
      'the only way to fill in the owner’s own field on an existing proposal is gone',
    ).toContain(OFFERED_AS)
  })

  it('stops offering it once it is answered, so there is never a second box', async () => {
    const { page } = await boot()
    const rec = proposal()
    const html = drawn(
      h(page.RecordDetail, { ...detailProps(rec, page.bodySections(rec)), editable: true } as never),
    )
    expect(html, 'a filled-in field was offered as if it were empty').not.toContain(OFFERED_AS)
  })
})

// ============================================================ and the tables say the same thing

describe('the three tables agree with the page about who owns the field', () => {
  it('names it in both, which is what keeps the panel and the fold stack apart', async () => {
    // BOTH, NOT EITHER. `DRAWN_BY_THE_HEADLINE` is what gives the panel a section to declare;
    // `IN_HEADLINE` is what takes the fold away. One without the other is one of the two defects
    // this file exists to stop: a panel that cannot say what it draws, or a sentence drawn twice.
    expect(DRAWN_BY_THE_HEADLINE['proposal'] ?? []).toContain(RESULT_WILL_BE_USED_TO_KEY)
    expect(IN_HEADLINE['proposal'] ?? []).toContain(RESULT_WILL_BE_USED_TO_KEY)
  })

  it('names only headlined keys as having no box, because the rest were never skipped', () => {
    // A KEY THAT IS NOT HEADLINED IS ALREADY OFFERED, so naming it here would say nothing and would
    // read as if it did. This is the same staleness guard `IN_HEADLINE` has in tests/sections.ts.
    for (const [kind, keys] of Object.entries(DRAWN_BUT_NOT_WRITTEN_BY_A_PANEL)) {
      const headlined = IN_HEADLINE[kind as keyof typeof IN_HEADLINE] ?? []
      for (const key of keys as readonly string[]) {
        expect(
          headlined.includes(key),
          `DRAWN_BUT_NOT_WRITTEN_BY_A_PANEL names ${kind}.${key}, which IN_HEADLINE does not claim, ` +
            'so the Add row was already offering it and this entry means nothing',
        ).toBe(true)
      }
    }
  })
})
