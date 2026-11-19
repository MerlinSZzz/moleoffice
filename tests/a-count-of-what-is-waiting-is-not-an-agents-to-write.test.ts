// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT MAY NOT WRITE DOWN HOW MANY THINGS ARE WAITING ON THE PERSON. THE PERSON MAY.
 *
 * ---------------------------------------------------------------------------------------
 * THE FAILURE THIS IS ABOUT, IN THE CORPUS
 * ---------------------------------------------------------------------------------------
 *
 * Report `NHtlTgnKAG8h`, block `b-6`, says "Nineteen things are waiting on you" and then names four
 * of them. The number was true on the day it was typed, nothing recomputes it, and the other
 * fifteen are in a repository file. `GET /api/waiting` is the one reading of what waits on the
 * person; a body that asserts its own count is a second one, frozen on the day it was written.
 *
 * ---------------------------------------------------------------------------------------
 * BOTH DIRECTIONS, BECAUSE HALF OF THIS RULE IS THAT IT IS NOT A CENSOR
 * ---------------------------------------------------------------------------------------
 *
 *   · an AGENT is refused, and nothing is stored;
 *   · the PERSON is not refused, and the bytes stored are exactly what was typed.
 *
 * The second half is the one a test suite forgets. A guard that refused everybody would pass every
 * refusal test in this file and would have taken the person's own words out of the person's own report.
 *
 * The DRAWN half — the mark beside a stored number that disagrees with the live one — is not here.
 * It is drawn on `SummaryBlocks.tsx`, which the shared-surfaces table reserves for the regions wave,
 * and its proof is in that wave. This file is the refusal half, in the wave that builds it.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AGENT, expectPanelError, freshDb, type TestDb } from './helpers.ts'
// Type-only, so this import is erased before it runs. A value import of records.ts here would open
// a database before helpers.ts had pointed MOLE_OFFICE_DB at a throwaway one.
import type { Actor } from '../src/server/lib/records.ts'

let t: TestDb
/**
 * The block reader, loaded after the throwaway database exists.
 *
 * `freshDb` resets the module registry and points `MOLE_OFFICE_DB` at a fresh file, and lib/summary.ts
 * reaches lib/records.ts, which opens whatever that names the moment it loads. Importing it at the
 * top of this file would open the owner's own corpus.
 */
let summary: typeof import('../src/server/lib/summary.ts')
/** The project this case files into, made fresh so a count of reports sees only its own. */
let PROJECT = 'default'
let caseNumber = 0
let makeWorkspace: (input: { id: string; title: string }) => unknown

beforeAll(async () => {
  t = await freshDb()
  summary = await import('../src/server/lib/summary.ts')
  ;({ createWorkspace: makeWorkspace } = await import('../src/server/lib/workspaces.ts'))
}, 60_000)

afterAll(() => {
  t.close()
})

beforeEach(() => {
  caseNumber += 1
  PROJECT = `count-of-waiting-case-${String(caseNumber)}`
  makeWorkspace({ id: PROJECT, title: `Count of waiting case ${String(caseNumber)}` })
})

/** The owner, as the browser sends them: a stated person Mole Office can place. */
function person(): Actor {
  return { type: 'human', id: t.api.HUMAN.id, stated: true }
}

/** A report body of one paragraph, which is the shape the failure took. */
function bodyOf(text: string): Record<string, unknown> {
  return {
    blocks: [{ id: 'b-1', type: 'text', heading: 'What I found', text }],
    for: `${THE_TEST_OFFICES_OWNER.name}, who asked for the review`,
    date: '2026-08-25',
  }
}

/** File a report saying this, as whoever is given. */
function fileReport(text: string, actor: Actor, title = `report · ${text.slice(0, 24)}`): string {
  return t.api.createRecord({ workspaceId: PROJECT, kind: 'report', title, data: bodyOf(text), actor }).id
}

/** The first block's text, straight out of the database — the bytes, not a summary of them. */
function storedText(id: string): string {
  const record = t.api.getRecord(id) as { data: Record<string, unknown> }
  const blocks = record.data['blocks'] as { text: string }[]
  return blocks[0]?.text ?? ''
}

/** How many reports are on file, so a refusal can be shown to have written nothing. */
function reportCount(): number {
  return t.api.listRecords({ workspaceId: PROJECT, kind: 'report' }).length
}

// ============================================================ the control

describe('the control: an agent writes reports, and this changes none of that', () => {
  it('files a report that says nothing about how many things are waiting', () => {
    const id = fileReport('The mount holds calibration through a full handover. What moved was the mast.', AGENT)
    expect(storedText(id)).toContain('The mount holds calibration')
    expect(reportCount()).toBe(1)
  })

  it('files a report that counts something that is not what is waiting on the person', () => {
    // A COUNT IS NOT THE THING REFUSED. Nineteen of anything else is ordinary writing, and a guard
    // that refused every number in a report would be refusing the reports this product exists for.
    const id = fileReport('Nineteen of the twenty-seven modules record no state at all.', AGENT)
    expect(storedText(id)).toContain('Nineteen of the twenty-seven modules')
  })

  it('files a report that uses the phrase with no quantity anywhere near it', () => {
    // THE PHRASE ALONE IS NOT THE CLAIM EITHER. "This is waiting on you" is a true sentence about
    // one thing and is how a report says what it wants; what is refused is asserting HOW MANY.
    const id = fileReport('The module boundary fork is still open and is waiting on you.', AGENT)
    expect(storedText(id)).toContain('waiting on you')
  })
})

// ============================================================ the agent, refused

describe('a body that says how many things are waiting on the person', () => {
  it('is refused to an agent when the number is a word, which is how it was actually written', () => {
    // `Nineteen`, SPELLED OUT. The first version of this check was going to grep source files for a
    // digit beside the phrase; it would have been green through the whole failure it exists to
    // prevent, because the number is a word in a database row.
    const refusal = expectPanelError(
      t,
      () => fileReport('Nineteen things are waiting on you, and four of them are named below.', AGENT),
      403,
    )
    expect(refusal.message).toContain('Nineteen')
    expect(refusal.message).toContain('waiting on you')
    expect(refusal.message).toContain('GET /api/waiting')
    // NOTHING WAS WRITTEN, and that is checked rather than assumed from the status.
    expect(reportCount()).toBe(0)
  })

  it('is refused when the number is digits', () => {
    expectPanelError(t, () => fileReport('19 things are waiting on you this week.', AGENT), 403)
    expect(reportCount()).toBe(0)
  })

  it('is refused for each of the reserved phrases, with a quantity beside it', () => {
    // EVERY PHRASE IS DRIVEN, so a phrase added to the list and never wired up shows up here.
    for (const [at, phrase] of summary.RESERVED_WAITING_PHRASES.entries()) {
      expectPanelError(t, () => fileReport(`There are seven things that ${phrase} answer.`, AGENT, `r-${at}`), 403)
    }
    expect(reportCount()).toBe(0)
  })

  it('is refused when the count is approximate, because an approximate count is still a count', () => {
    expectPanelError(t, () => fileReport('About twenty of these need you before Friday.', AGENT), 403)
    expect(reportCount()).toBe(0)
  })

  it('is refused on a patch as well as on a create, and the report is exactly as it was', () => {
    // A RULE ENFORCED ON ONE WRITE PATH IS NOT A RULE. The create is the obvious door and the patch
    // is the one that stays open.
    const id = fileReport('The mount holds calibration through a full handover.', AGENT)
    const before = storedText(id)
    expectPanelError(
      t,
      () => t.api.patchRecord(id, { dataPatch: { blocks: bodyOf('Nineteen things are waiting on you.')['blocks'] } }, AGENT),
      403,
    )
    expect(storedText(id)).toBe(before)
  })

  it('is refused inside a module summary too, because a body is a body', () => {
    // The design named the report, which is where it was found. The check is over the prose of a
    // body, and a module's curated summary is the other body this product has: refusing one and
    // storing the other would be the rule holding on whichever kind somebody thought of first.
    const refusal = expectPanelError(
      t,
      () =>
        t.api.createRecord({
          workspaceId: PROJECT,
          kind: 'module',
          title: 'the wrist camera mount',
          data: {
            context: 'why this module exists',
            parts: [],
            paths: [],
            summaryBlocks: [{ id: 'b-1', type: 'text', text: 'Nineteen things are waiting on you here.' }],
          },
          actor: AGENT,
        }),
      403,
    )
    expect(refusal.message).toContain('Nineteen')
  })
})

// ============================================================ the person, not refused

describe('the person writing the same sentence', () => {
  it('is not refused, and the stored bytes are exactly what was typed', () => {
    // THE HALF THAT PROVES THIS IS NOT A CENSOR. The eighth rule: a human-facing box is not where
    // rules are enforced by refusal. They write what they mean, Mole Office stores it as typed, and the
    // live count is drawn beside it.
    const said = 'Nineteen things are waiting on you, and four of them are named below.'
    const id = fileReport(said, person())
    expect(storedText(id)).toBe(said)
  })

  it('is not refused on a patch either', () => {
    const id = fileReport('The mount holds calibration through a full handover.', person())
    t.api.patchRecord(id, { dataPatch: { blocks: bodyOf('19 things are waiting on you.')['blocks'] } }, person())
    expect(storedText(id)).toBe('19 things are waiting on you.')
  })
})

// ============================================================ what it does not catch

describe('what the check deliberately does not treat as a count', () => {
  it('lets a date through, because a date is not a quantity of anything', () => {
    const id = fileReport('The fork has been waiting on you since 2026-08-21.', AGENT)
    expect(storedText(id)).toContain('2026-08-21')
  })

  it('lets a number and the phrase through when they are not one claim', () => {
    // THE SPAN IS SIX WORDS AND IT IS WHY THIS PASSES. A report that counts something in one
    // sentence and uses the phrase later is not asserting how many things are waiting, and a span
    // wide enough to join them would refuse honest writing.
    const said =
      'Nineteen modules were reviewed last week and nobody has looked at any of them since, which is ' +
      'the sort of thing that is waiting on you.'
    const id = fileReport(said, AGENT)
    expect(storedText(id)).toBe(said)
  })

  it('does not read a body the write is not touching', () => {
    // A PATCH THAT DOES NOT SEND THE BODY IS NOT TOUCHING IT. The owner writes the sentence; an
    // agent then marks the report read. Refusing that would be the guard reaching a write it is not
    // about, and `bodyBeingWritten` is where that is decided.
    const id = fileReport('Nineteen things are waiting on you.', person())
    t.api.patchRecord(id, { dataPatch: { read: 'read' } }, AGENT)
    expect(storedText(id)).toBe('Nineteen things are waiting on you.')
  })
})

// ============================================================ the reading underneath

describe('the reading the guard asks', () => {
  it('answers with the phrase and the quantity, as facts rather than as a sentence', () => {
    const found = summary.countOfWhatIsWaitingIn([
      { id: 'b-1', type: 'text', text: 'Nineteen things are waiting on you.' },
    ] as never)
    expect(found?.phrase).toBe('waiting on you')
    expect(found?.quantity).toBe('Nineteen')
  })

  it('reads the words a person reads, including a heading and a list item', () => {
    // The prose reader is `proseOfBlocks`, which is the same one the short-form rule asks, so a
    // count hidden in a heading or a bullet is not a way past this.
    const inAHeading = summary.countOfWhatIsWaitingIn([
      { id: 'b-1', type: 'text', heading: 'Seven things need you', text: 'and here they are' },
    ] as never)
    expect(inAHeading?.quantity).toBe('Seven')

    const inAList = summary.countOfWhatIsWaitingIn([
      { id: 'b-2', type: 'list', items: ['eight of these are waiting for you'] },
    ] as never)
    expect(inAList?.quantity).toBe('eight')
  })

  it('says nothing about a body with no count in it', () => {
    expect(
      summary.countOfWhatIsWaitingIn([{ id: 'b-1', type: 'text', text: 'This one is waiting on you.' }] as never),
    ).toBeNull()
  })
})
