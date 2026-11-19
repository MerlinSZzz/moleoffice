// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Tests for the attention rule in src/shared/attention.ts.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PINNED HERE, AND WHY EACH ONE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Every group below is a measured failure of the rule that shipped before it, not a hypothetical.
 *
 *   SELECTION   — the two halves of the rule, and the four answers that are NOT a selection:
 *                 discharged, paused, unclassified, and no state at all. The last two are
 *                 questions for a person, so they come back in their own lists; a test that only
 *                 checked they were absent from the panel would pass on a rule that dropped them.
 *
 *   SAFETY      — a dangerous problem filed this morning ranked 48th and the same problem three
 *                 weeks old ranked 31st, because staleness was doing the ranking. The test here is
 *                 the extreme case: one minute old, against a three-week-old row that scores the
 *                 maximum of every other factor.
 *
 *   NO FACTOR CAN FILL THE LIST — the old panel was seven crashed sessions at every setting,
 *                 because one tier held seven rows and the cap was seven. Two things stop that
 *                 coming back and both are tested: the arithmetic property that every factor's
 *                 maximum is smaller than the sum of the others, and the group cap.
 *
 *   THE OVERDUE EXEMPTION — the group cap held a promise 6.9 days past its date off the screen and
 *                 kept a checklist item scoring 16 on it. An overdue owed row now walks past the
 *                 cap, and the exemption is BOUNDED, so both halves are pinned: the row that was
 *                 hidden is shown, and ten overdue promises still cannot take all seven rows.
 *
 *   THE COUNTING — the product owner rejected solving the problem by hiding information. So
 *                 `visible + remainder === total` exactly, and every candidate that was not
 *                 selected is in exactly one named bucket. Both are asserted on made-up data and
 *                 again on the invented corpus in tests/fixtures/an-invented-corpus-for-the-attention-rule.ts.
 *
 * `dueMs` is passed in from src/web/lib/attention.ts on purpose. The end-of-day rule for a bare
 * date exists there already and a second copy in shared/ would be the defect this codebase keeps
 * producing. Importing it here also means these tests break if that rule changes underneath, which
 * is the point.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { describe, expect, it } from 'vitest'
import {
  FACTOR_MAX,
  FACTOR_NAMES,
  MAX_OVERDUE_OWED_ROWS,
  MAX_ROWS_PER_GROUP,
  PAUSE_STANDING_SENTENCES,
  REASON_GROUPS,
  REASON_GROUP_LABELS,
  VISIBLE_ROWS,
  computeAttention,
  isOverdueOwed,
  kindDeclaresState,
  reasonGroupHeading,
  type AttentionInput,
  type AttentionResult,
  type MachineResourceRef,
} from '../src/shared/attention.ts'
import { localStamp } from '../src/shared/time.ts'
import { unclassifiedNote } from '../src/shared/work.ts'
import type { Change, Link, PanelRecord, RecordKind } from '../src/shared/types.ts'
import { parseDueStamp } from '../src/web/lib/attention.ts'
import * as corpus from './fixtures/an-invented-corpus-for-the-attention-rule.ts'

// ---------------------------------------------------------------------------- fixtures

/** A fixed clock, so every age in the expectations is a constant rather than a race. */
const NOW = new Date(2026, 7, 9, 9, 40, 0).getTime() // 2026-08-09 09:40 local

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** A stored stamp N milliseconds before the clock, in the format the server writes. */
const ago = (ms: number): string => localStamp(new Date(NOW - ms))
const ahead = (ms: number): string => localStamp(new Date(NOW + ms))

function record(
  over: Partial<PanelRecord> & Pick<PanelRecord, 'id' | 'kind' | 'title'>,
): PanelRecord {
  return {
    workspaceId: 'ws-test',
    ownerId: THE_TEST_OFFICES_OWNER.id,
    summary: null,
    data: {},
    createdAt: ago(30 * DAY_MS),
    updatedAt: ago(DAY_MS),
    deletedAt: null,
    ...over,
  }
}

function run(over: Partial<AttentionInput> = {}): AttentionResult {
  return computeAttention({
    now: NOW,
    records: [],
    links: [],
    changes: [],
    resources: [],
    dueMs: parseDueStamp,
    ...over,
  })
}

/** Every selected row, visible first, in rank order. */
const allRows = (result: AttentionResult) => [...result.visible, ...result.remainder]
const keys = (result: AttentionResult) => allRows(result).map((row) => row.key)

// ---------------------------------------------------------------------------- selection

describe('the rule selects owed things and things that stopped short, and nothing else', () => {
  it('selects an obligation somebody outside is waiting for', () => {
    const result = run({
      records: [
        record({
          id: 'obl-1',
          kind: 'obligation',
          title: 'ESA report',
          data: { owedTo: 'the ESA grant review', due: ago(6 * DAY_MS).slice(0, 10) },
        }),
      ],
    })
    expect(result.total).toBe(1)
    const row = result.visible[0]
    expect(row?.reason.selectedBy).toBe('owed')
    expect(row?.reason.owed?.party).toBe('the ESA grant review')
    expect(row?.reason.owed?.hops).toBe(0)
    expect(row?.group).toBe('owed')
  })

  it('drops the same obligation once data.done says the promise was kept', () => {
    // The correction this pass carries: the mechanism already existed. `data.done` is declared in
    // kinds.ts and was never written by anything, which is why every obligation looked permanent.
    const result = run({
      records: [
        record({
          id: 'obl-1',
          kind: 'obligation',
          title: 'ESA report',
          data: {
            owedTo: 'the ESA grant review',
            due: ago(6 * DAY_MS).slice(0, 10),
            done: true,
            fulfilledAt: ago(2 * DAY_MS),
            fulfilledNote: 'sent to the reviewer, acknowledged',
          },
        }),
      ],
    })
    expect(result.total).toBe(0)
    expect(result.passedOver.find((b) => b.bucket === 'discharged')?.keys).toEqual(['rec:obl-1'])
  })

  it('reads `fulfilled` and `cancelled` as discharged too, through readFulfilment', () => {
    for (const state of ['fulfilled', 'cancelled']) {
      const result = run({
        records: [
          record({ id: `obl-${state}`, kind: 'obligation', title: 'a promise', data: { owedTo: 'the lab', state } }),
        ],
      })
      expect(result.total).toBe(0)
    }
  })

  it('keeps a record that says two opposite things, and says which two', () => {
    // `done: true` beside a state word that says the work stopped short is a contradiction in the
    // record. Mole Office does not pick a winner in silence: the row stays, because "open" is the word
    // that means somebody should look, and the reason names both so the wrong one can be fixed.
    const result = run({
      records: [
        record({
          id: 'obl-1',
          kind: 'obligation',
          title: 'a promise',
          data: { owedTo: 'the lab', due: ago(2 * DAY_MS).slice(0, 10), done: true, state: 'open' },
        }),
      ],
    })
    expect(result.total).toBe(1)
    expect(result.visible[0]?.reason.selectedBy).toBe('stopped_short')
    expect(result.visible[0]?.reason.owed).toBeNull()
    expect(result.visible[0]?.reason.because).toContain('one of the two is wrong')
  })

  it('selects a record whose own state word says the work stopped short', () => {
    const result = run({
      records: [record({ id: 'ses-1', kind: 'session', title: 'a run that died', data: { state: 'crashed' } })],
    })
    expect(result.total).toBe(1)
    expect(result.visible[0]?.reason.selectedBy).toBe('stopped_short')
    expect(result.visible[0]?.reason.stoppedShort?.state).toBe('crashed')
    expect(result.visible[0]?.group).toBe('stopped:notes')
  })

  it('does not select work that never started, or work somebody is on right now', () => {
    const result = run({
      records: [
        record({ id: 'tsk-1', kind: 'task', title: 'not begun', data: { state: 'todo' } }),
        record({ id: 'tsk-2', kind: 'task', title: 'under way', data: { state: 'doing' } }),
        record({ id: 'tsk-3', kind: 'task', title: 'over', data: { state: 'done' } }),
        record({ id: 'ses-1', kind: 'session', title: 'nobody could tell', data: { state: 'unknown' } }),
      ],
    })
    expect(result.total).toBe(0)
    const bucketNames = result.passedOver.map((b) => b.bucket)
    expect(bucketNames).toContain('not_started')
    expect(bucketNames).toContain('in_flight')
    expect(bucketNames).toContain('finished')
    expect(bucketNames).toContain('unknown')
  })

  it('selects a failed checklist item and a blocked pipeline block in their own groups', () => {
    // A BLOCK ARRIVES AS AN ORDINARY RECORD NOW, with its own key — `rec:` and not the composite
    // `step:<pipeline>:<step>` that nothing enforced and that the API once served twice for two
    // steps sharing an id. It keeps its own reason-group all the same: 61 blocks against 12
    // modules would take the whole `structure` group's share of the screen.
    const result = run({
      records: [
        record({
          id: 'mod-1',
          kind: 'module',
          title: 'Tray clamp',
          data: { parts: [{ id: 'p1', name: 'Shape', items: [{ id: 'i1', text: 'print v3', state: 'failed' }] }] },
        }),
        record({ id: 'pipe-1', kind: 'pipeline', title: 'Transplant v2', data: { blockIds: ['s1'] } }),
        record({ id: 's1', kind: 'block', title: 'Transplant v2 \u203a grasp the cube', data: { state: 'blocked' } }),
      ],
    })
    expect(keys(result).sort()).toEqual(['item:mod-1:i1', 'rec:s1'])
    expect(allRows(result).map((r) => r.group).sort()).toEqual(['stopped:block', 'stopped:item'])
  })

  it('leaves deleted records out of the population entirely, and counts them', () => {
    const result = run({
      records: [
        record({ id: 'ses-1', kind: 'session', title: 'a dead run', data: { state: 'crashed' }, deletedAt: ago(DAY_MS) }),
      ],
    })
    expect(result.total).toBe(0)
    expect(result.counts.deleted).toBe(1)
    expect(result.counts.candidates).toBe(0)
  })
})

// ---------------------------------------------------------------------------- owed through blocks

describe('a promise reaches what is holding it up', () => {
  const chain = (blockerState: string): AttentionResult =>
    run({
      records: [
        record({
          id: 'obl-esa',
          kind: 'obligation',
          title: 'ESA report',
          data: { owedTo: 'the ESA grant review', due: ago(6 * DAY_MS).slice(0, 10) },
        }),
        record({ id: 'tsk-reprint', kind: 'task', title: 'reprint the shell', data: { state: blockerState } }),
        record({ id: 'prb-printer', kind: 'problem', title: 'the printer queue', data: { state: 'open' } }),
      ],
      links: [
        link('lnk-1', 'tsk-reprint', 'obl-esa'),
        link('lnk-2', 'prb-printer', 'tsk-reprint'),
      ],
    })

  it('carries the promise one link and then two, fading with each hop', () => {
    const result = chain('blocked')
    const reprint = allRows(result).find((row) => row.recordId === 'tsk-reprint')
    const printer = allRows(result).find((row) => row.recordId === 'prb-printer')
    expect(reprint?.reason.owed?.hops).toBe(1)
    expect(printer?.reason.owed?.hops).toBe(2)
    expect(reprint?.reason.owed?.party).toBe('the ESA grant review')
    const owedPoints = (row: typeof reprint) => row?.reason.factors.find((f) => f.name === 'owed')?.points ?? 0
    expect(owedPoints(reprint)).toBeGreaterThan(owedPoints(printer))
    expect(owedPoints(printer)).toBeGreaterThan(0)
  })

  it('stops at a blocker that has finished, because a finished thing blocks nobody', () => {
    const result = chain('done')
    // The reprint is finished: it is not on the list, and the promise does not travel past it.
    expect(keys(result)).not.toContain('rec:tsk-reprint')
    const printer = allRows(result).find((row) => row.recordId === 'prb-printer')
    expect(printer?.reason.owed).toBeNull()
    expect(printer?.reason.selectedBy).toBe('stopped_short')
  })
})

// ---------------------------------------------------------------------------- when it comes due

/**
 * A PROMISE COMES DUE THREE WAYS AND ONLY ONE OF THEM CAN BE LATE.
 *
 * `data.due` takes a date, a trigger written in words, or the record whose finishing makes it due.
 * Until this pass it took a date and nothing else, so "owed when the reprint lands" — a thing this
 * lab says constantly — could be written on a pause and not on the obligation it was about.
 *
 * WHAT THESE TESTS ARE REALLY DEFENDING is the one substitution that would be invisible afterwards.
 * The attention rule ranks hardest on OVERDUE, so a promise with no date is a promise the ranking
 * cannot see, and the tempting repair is to turn "when the reprint lands" into a date so that there
 * is a number to sort on. An invented date looks exactly like a date somebody wrote. Every test in
 * this block is a different route to that invention: the score, the sentence, the overdue reading,
 * and the cap exemption that only overdue promises are allowed past.
 */
describe('a promise owed on a trigger is waiting, and a promise owed on a date can be late', () => {
  const owedWhen = (due: unknown, over: Partial<PanelRecord> = {}): AttentionResult =>
    run({
      records: [
        record({
          id: 'obl-1',
          kind: 'obligation',
          title: 'the force table for the reprint',
          data: { owedTo: 'the ESA grant review', due },
          ...over,
        }),
      ],
    })

  it('does not tell a reader that nothing was agreed when a condition was agreed', () => {
    // THE MEASURED FALSEHOOD. Every form but a date read back as `due: null`, and one sentence
    // covered all of them: "no date was ever agreed for this promise". On this record somebody said
    // perfectly clearly when it is owed, in a form GET /api/kinds publishes and the write path
    // accepts, and the panel told the reader they had said nothing.
    const result = owedWhen({ condition: 'the reprint is on the bench' })
    const row = result.visible[0]
    expect(row?.reason.owed?.condition).toBe('the reprint is on the bench')
    expect(row?.reason.owed?.dueStanding).toBe('waiting-on-a-condition')
    expect(row?.reason.because).toContain('the reprint is on the bench')
    expect(row?.reason.because).not.toContain('no date was ever agreed')
    const late = row?.reason.factors.find((factor) => factor.name === 'late')
    expect(late?.why).toContain('the reprint is on the bench')
    expect(late?.why).not.toContain('no date was ever agreed')
  })

  it('says a promise owed on a condition is waiting rather than late, and cannot be overdue', () => {
    const result = owedWhen({ condition: 'the reprint is on the bench' }, { updatedAt: ago(90 * DAY_MS) })
    const row = result.visible[0]
    // No lateness exists to state, so none is stated. Null here is "there is no answer", and the
    // row's own words say which of the four reasons that is.
    expect(row?.reason.owed?.lateMs).toBeNull()
    expect(row?.reason.owed?.due).toBeNull()
    expect(isOverdueOwed(row!)).toBe(false)
    expect(row?.reason.factors.find((factor) => factor.name === 'late')?.points).toBe(0)
    expect(row?.reason.because).toContain('waiting')
  })

  // THE RANKING CONSEQUENCE — that a trigger-due promise never earns the overdue exemption — is
  // pinned where that exemption is defended, in "still caps a promise whose date has not arrived"
  // below, because it needs a genuinely full screen to mean anything. Both new forms are in the list
  // that test walks.

  it('keeps a promise owed on another record waiting until that record finishes', () => {
    const result = run({
      records: [
        record({
          id: 'obl-1',
          kind: 'obligation',
          title: 'the force table',
          data: { owedTo: 'the ESA grant review', due: { recordId: 'tsk-reprint' } },
        }),
        record({ id: 'tsk-reprint', kind: 'task', title: 'reprint the shell', data: { state: 'doing' } }),
      ],
    })
    const row = allRows(result).find((r) => r.recordId === 'obl-1')
    expect(row?.reason.owed?.dueStanding).toBe('waiting-on-a-record')
    expect(row?.reason.owed?.trigger?.finished).toBe(false)
    expect(row?.reason.owed?.trigger?.title).toBe('reprint the shell')
    expect(row?.reason.owed?.lateMs).toBeNull()
    expect(isOverdueOwed(row!)).toBe(false)
    expect(row?.reason.because).toContain('waiting rather than late')
  })

  it('says the promise has come due once that record’s own word says it reached its end', () => {
    // The trigger firing is the news a person needs, and it is the whole of what "it becomes due"
    // can honestly mean here. Mole Office checks the record because work.ts hands that question to a
    // caller holding the rows, and this rule holds them.
    const result = run({
      records: [
        record({
          id: 'obl-1',
          kind: 'obligation',
          title: 'the force table',
          data: { owedTo: 'the ESA grant review', due: { recordId: 'tsk-reprint' } },
        }),
        record({ id: 'tsk-reprint', kind: 'task', title: 'reprint the shell', data: { state: 'done' } }),
      ],
    })
    const row = allRows(result).find((r) => r.recordId === 'obl-1')
    expect(row?.reason.owed?.trigger?.finished).toBe(true)
    expect(row?.reason.because).toContain('has come due')
  })

  it('gives a promise that has come due no lateness, because nobody said by when', () => {
    // THE LAST DOOR THE INVENTED DEADLINE COULD COME THROUGH. Once the trigger fires it would be
    // easy to call the promise "0 days late", or to date it from the moment the trigger record
    // finished. Nothing anywhere says by when it is owed from there, so there is no duration to
    // report and none is reported — and it does not become overdue, so it earns no exemption.
    const fired = run({
      records: [
        record({
          id: 'obl-1',
          kind: 'obligation',
          title: 'the force table',
          data: { owedTo: 'the ESA grant review', due: { recordId: 'tsk-reprint' } },
        }),
        record({ id: 'tsk-reprint', kind: 'task', title: 'reprint the shell', data: { state: 'done' }, updatedAt: ago(30 * DAY_MS) }),
      ],
    })
    const row = allRows(fired).find((r) => r.recordId === 'obl-1')
    expect(row?.reason.owed?.lateMs).toBeNull()
    expect(row?.reason.owed?.due).toBeNull()
    expect(isOverdueOwed(row!)).toBe(false)
    expect(row?.reason.factors.find((factor) => factor.name === 'late')?.points).toBe(0)
  })

  it('does not read a record nobody has said anything about as one that finished', () => {
    // Two ways a record says nothing: no state word at all, and a word nobody has classified.
    // Reading either as "finished" would make a promise come due on silence.
    for (const data of [{}, { state: 'chasing' }]) {
      const result = run({
        records: [
          record({
            id: 'obl-1',
            kind: 'obligation',
            title: 'the force table',
            data: { owedTo: 'the ESA grant review', due: { recordId: 'tsk-reprint' } },
          }),
          record({ id: 'tsk-reprint', kind: 'task', title: 'reprint the shell', data }),
        ],
      })
      const row = allRows(result).find((r) => r.recordId === 'obl-1')
      // Null, not false: Mole Office cannot tell, and the note says which of the two silences it is.
      expect(row?.reason.owed?.trigger?.finished, JSON.stringify(data)).toBeNull()
      expect(row?.reason.owed?.trigger?.note).toContain('cannot say whether it has')
      expect(row?.reason.owed?.lateMs).toBeNull()
    }
  })

  it('says so when the record a promise waits on is not there at all', () => {
    const result = owedWhen({ recordId: 'rec-that-went-away' })
    const row = result.visible[0]
    expect(row?.reason.owed?.trigger?.recordId).toBe('rec-that-went-away')
    expect(row?.reason.owed?.trigger?.title).toBeNull()
    expect(row?.reason.owed?.trigger?.finished).toBeNull()
    expect(row?.reason.because).toContain('no live record answers to that id')
  })

  it('keeps a date it cannot read apart from a promise that named no date', () => {
    // Three different situations that all score zero for lateness, and the reason lines have to tell
    // them apart: an unreadable stamp, a trigger in words, and nothing recorded at all.
    const unreadable = owedWhen('when the arm comes back')
    const unreadableRow = unreadable.visible[0]
    expect(unreadableRow?.reason.owed?.dueStanding).toBe('date-unreadable')
    expect(unreadableRow?.reason.owed?.due).toBe('when the arm comes back')
    expect(unreadableRow?.reason.owed?.lateMs).toBeNull()
    expect(unreadableRow?.reason.factors.find((f) => f.name === 'late')?.why).toContain('is not one Mole Office can read')

    const standings = [
      owedWhen('when the arm comes back').visible[0]?.reason.owed?.dueStanding,
      owedWhen({ condition: 'the reprint is on the bench' }).visible[0]?.reason.owed?.dueStanding,
      owedWhen({ recordId: 'tsk-x' }).visible[0]?.reason.owed?.dueStanding,
      owedWhen(undefined).visible[0]?.reason.owed?.dueStanding,
      owedWhen(ago(2 * DAY_MS).slice(0, 10)).visible[0]?.reason.owed?.dueStanding,
    ]
    expect(new Set(standings).size).toBe(5)
  })

  it('still reports the date when a promise carries a date AND a condition', () => {
    // Two things were said and a reader is owed both. The date is what decides lateness — that is
    // `readDue`'s published precedence — and the condition is kept beside it rather than dropped.
    const result = owedWhen({ date: ago(3 * DAY_MS).slice(0, 10), condition: 'the reprint is on the bench' })
    const row = result.visible[0]
    expect(row?.reason.owed?.dueStanding).toBe('dated')
    expect(row?.reason.owed?.due).toBe(ago(3 * DAY_MS).slice(0, 10))
    expect(row?.reason.owed?.condition).toBe('the reprint is on the bench')
    expect(isOverdueOwed(row!)).toBe(true)
  })

  it('leaves a plain stored date behaving exactly as it always did', () => {
    // The regression guard. Every obligation in the database holds a bare date string, and this
    // change must not have moved any of them.
    const result = owedWhen(ago(6 * DAY_MS).slice(0, 10))
    const row = result.visible[0]
    expect(row?.reason.owed?.dueStanding).toBe('dated')
    expect(row?.reason.owed?.due).toBe(ago(6 * DAY_MS).slice(0, 10))
    expect(row?.reason.owed?.trigger).toBeNull()
    expect((row?.reason.owed?.lateMs ?? 0) > 0).toBe(true)
    expect(isOverdueOwed(row!)).toBe(true)
    expect(row?.reason.because).toContain('the date agreed was')
  })
})

// ---------------------------------------------------------------------------- pause

/**
 * THE THREE ANSWERS `pauseElapsed` CAN GIVE, AND THE THREE DIFFERENT THINGS THE RULE DOES.
 *
 * A pause used to silence a record for ever, so "not now, until the 6th" and "not now, ever" were
 * the same thing on every screen. They are not. `pauseElapsed` in work.ts answers true, false or
 * null, and the whole point of this block is that NULL IS NOT FALSE: an open-ended pause and one
 * whose date is still ahead land in different buckets with different sentences, because one is a
 * pause doing its job and the other is a pause nobody can say anything about.
 */
describe('a pause holds work back only while its own resume condition still says “not yet”', () => {
  const pausedRecord = (until?: Record<string, string>) =>
    record({
      id: 'tsk-1',
      kind: 'task',
      title: 'the twin validation',
      data: {
        state: 'blocked',
        paused: { since: ago(10 * DAY_MS), why: 'the arm is on loan until September', ...(until ? { until } : {}) },
      },
    })

  // ---- null: Mole Office cannot tell. Off the list, and said in its own words.
  it('does not select an open-ended pause, and reports it as open-ended rather than as waiting', () => {
    const result = run({ records: [pausedRecord()] })
    expect(result.total).toBe(0)
    expect(result.paused).toHaveLength(1)
    expect(result.paused[0]?.pause?.why).toBe('the arm is on loan until September')
    expect(result.paused[0]?.dueToResume).toBeNull() // null is not "no", and the standing says which
    expect(result.paused[0]?.standing).toBe('open-ended')
    expect(result.paused[0]?.note).toContain('Open-ended')
    expect(result.passedOver.find((b) => b.bucket === 'paused_cannot_tell')?.count).toBe(1)
    expect(result.passedOver.find((b) => b.bucket === 'paused_waiting')).toBeUndefined()
  })

  it('keeps a resume condition written in prose, and says Mole Office cannot check it', () => {
    const result = run({ records: [pausedRecord({ condition: 'the SLAM group give the Orin back' })] })
    expect(result.total).toBe(0)
    expect(result.paused[0]?.dueToResume).toBeNull()
    expect(result.paused[0]?.standing).toBe('condition-in-words')
    expect(result.paused[0]?.note).toContain('the SLAM group give the Orin back')
    expect(result.passedOver.find((b) => b.bucket === 'paused_cannot_tell')?.count).toBe(1)
  })

  it('says when a pause waits on another record, and does not pretend to have checked it', () => {
    // Checkable in principle and deliberately NOT checked here: `pauseElapsed` is the one arbiter
    // of whether a pause is over, and a second opinion in this file would be the duplication this
    // codebase keeps producing. See the header of src/shared/attention.ts.
    const result = run({ records: [pausedRecord({ recordId: 'obl-9' })] })
    expect(result.total).toBe(0)
    expect(result.paused[0]?.standing).toBe('waits-on-a-record')
    expect(result.paused[0]?.note).toContain('Mole Office does not check')
  })

  it('says so when the resume date stored on a pause is not one it can read', () => {
    const result = run({ records: [pausedRecord({ date: 'when the arm comes back' })] })
    expect(result.total).toBe(0)
    expect(result.paused[0]?.dueToResume).toBeNull()
    expect(result.paused[0]?.standing).toBe('date-unreadable')
    expect(result.paused[0]?.note).toContain('cannot read')
  })

  // ---- false: the date is still ahead. Off the list, and counted as a pause that is working.
  it('leaves a pause whose date has not arrived off the list, in its own bucket', () => {
    const result = run({ records: [pausedRecord({ date: ahead(10 * DAY_MS).slice(0, 10) })] })
    expect(result.total).toBe(0)
    expect(result.paused[0]?.dueToResume).toBe(false)
    expect(result.paused[0]?.standing).toBe('waiting-for-date')
    expect(result.paused[0]?.note).toContain('It resumes on')
    expect(result.passedOver.find((b) => b.bucket === 'paused_waiting')?.count).toBe(1)
    expect(result.passedOver.find((b) => b.bucket === 'paused_cannot_tell')).toBeUndefined()
  })

  // ---- true: the date has passed. ON the list, in a group of its own.
  it('puts a pause whose date has passed on the list, because the decision expired', () => {
    const result = run({ records: [pausedRecord({ date: ago(2 * DAY_MS).slice(0, 10) })] })
    expect(result.total).toBe(1)
    const row = result.visible[0]
    expect(row?.recordId).toBe('tsk-1')
    expect(row?.reason.pauseElapsed?.date).toBe(ago(2 * DAY_MS).slice(0, 10))
    expect(row?.reason.pauseElapsed?.why).toBe('the arm is on loan until September')
    expect((row?.reason.pauseElapsed?.pastMs ?? 0) > 0).toBe(true)
    expect(row?.reason.because).toContain('that date has passed')
    // Still reported as paused too, and the paused row says it is on the list rather than
    // reading as put down when nothing is holding it any more.
    expect(result.paused[0]?.dueToResume).toBe(true)
    expect(result.paused[0]?.standing).toBe('resume-date-passed')
    expect(result.paused[0]?.onList).toBe(true)
    expect(result.paused[0]?.note).toContain('due to resume')
    expect(result.passedOver.find((b) => b.bucket.startsWith('paused'))).toBeUndefined()
  })

  it('lets the state word be read again once the pause has run out', () => {
    // While the pause held, `blocked` was not "stopped short" — the pause beat the word. Once the
    // date passes the pause holds nothing, so the word is read normally and BOTH facts are on the
    // row. `owed` is absent here, so the sharper of the two remaining is the state word.
    const result = run({ records: [pausedRecord({ date: ago(2 * DAY_MS).slice(0, 10) })] })
    const row = result.visible[0]
    expect(row?.reason.selectedBy).toBe('stopped_short')
    expect(row?.reason.stoppedShort?.state).toBe('blocked')
    expect(row?.reason.pauseElapsed).not.toBeNull()
    expect(row?.group).toBe('stopped:work')
  })

  it('selects a pause that ran out on work whose own word says nothing is wrong', () => {
    // `todo` is not_started, so nothing but the expired pause puts this on the list. That is the
    // case the rule change exists for: the record says nothing is wrong and somebody meant to be
    // back on it three days ago.
    const result = run({
      records: [
        record({
          id: 'tsk-2',
          kind: 'task',
          title: '重印 v3 #4 (setting 13, 壁厚 2.0 mm)',
          data: {
            state: 'todo',
            paused: {
              since: ago(20 * DAY_MS),
              why: 'the printer queue is three jobs deep',
              until: { date: ago(3 * DAY_MS).slice(0, 10) },
            },
          },
        }),
      ],
    })
    expect(result.total).toBe(1)
    expect(result.visible[0]?.reason.selectedBy).toBe('pause_elapsed')
    expect(result.visible[0]?.reason.stoppedShort).toBeNull()
    expect(result.visible[0]?.group).toBe('pause-elapsed')
  })

  it('reports a state word of "paused" with no stored pause as the gap it is', () => {
    const result = run({ records: [record({ id: 'tsk-1', kind: 'task', title: 'a task', data: { state: 'paused' } })] })
    expect(result.total).toBe(0)
    expect(result.paused[0]?.pause).toBeNull()
    expect(result.paused[0]?.standing).toBe('no-pause-recorded')
    // THE SENTENCE IS THE TABLE'S, AND THE TEST READS IT FROM THE TABLE. Asserting the words here
    // would be a fifth copy of a sentence that already had four, and it was the four copies that
    // let the wording go on saying "no reason was recorded" after that became false. What this
    // pins is that the row and the table say the same thing, which is the property that broke.
    expect(result.paused[0]?.note).toBe(PAUSE_STANDING_SENTENCES['no-pause-recorded'])
    // And what the sentence must not claim: no `paused` block was found, which is what `readPause`
    // actually looked for. It cannot speak for a reason a kind spells its own way — an `idea` in
    // state `parked` reaches exactly this standing with its reason in `parked_because`.
    expect(result.paused[0]?.note).not.toContain('no reason')
  })

  it('ends the author’s own sentence once, in either script', () => {
    // MEASURED ON A SCREENSHOT. The old wording joined the author's words to the next clause with
    // ". " whatever they ended in, so a reason ending in a full stop printed ".." and a Chinese one
    // printed "。." — six times on the home page.
    const both = run({
      records: [
        record({
          id: 'tsk-en',
          kind: 'task',
          title: 'english',
          data: { state: 'todo', paused: { since: ago(DAY_MS), why: 'The credits reset monthly and this run burned them.' } },
        }),
        record({
          id: 'tsk-zh',
          kind: 'task',
          title: '中文',
          data: { state: 'todo', paused: { since: ago(DAY_MS), why: '现在没有时间做这个。什么时候做还不知道。' } },
        }),
      ],
    })
    for (const row of both.paused) {
      expect(row.note).not.toContain('..')
      expect(row.note).not.toContain('。.')
    }
    expect(both.paused.find((row) => row.recordId === 'tsk-en')?.note).toContain('burned them. Open-ended')
  })

  it('still lists a paused promise, because a pause is a decision about your own plans', () => {
    // Deliberate, and the one place pause does not remove a row. The rule says a paused thing has
    // not stopped short; it does not say a paused thing is not owed. The paused list says
    // `onList: true` so nothing reads as put down when somebody outside is still waiting.
    const result = run({
      records: [
        record({
          id: 'obl-1',
          kind: 'obligation',
          title: 'return the gauge',
          data: {
            owedTo: 'the metrology lab',
            due: ago(3 * DAY_MS).slice(0, 10),
            paused: { since: ago(DAY_MS), why: 'the lab is shut this week' },
          },
        }),
      ],
    })
    expect(result.total).toBe(1)
    expect(result.visible[0]?.reason.selectedBy).toBe('owed')
    expect(result.paused[0]?.onList).toBe(true)
  })
})

// ---------------------------------------------------------------------------- the questions

describe('a word nobody has classified is a question, not a no', () => {
  it('reports an unclassified word in its own list, with the shared sentence', () => {
    const result = run({
      records: [record({ id: 'pur-1', kind: 'purchase', title: 'a force gauge', data: { state: 'chasing' } })],
    })
    expect(result.total).toBe(0)
    expect(keys(result)).toHaveLength(0)
    expect(result.unclassified).toHaveLength(1)
    expect(result.unclassified[0]?.state).toBe('chasing')
    expect(result.unclassified[0]?.note).toContain(unclassifiedNote('chasing'))
    expect(result.passedOver.find((b) => b.bucket === 'unclassified')?.keys).toEqual(['rec:pur-1'])
  })

  it('keeps "no state at all" apart from "a word nobody has classified"', () => {
    const result = run({
      records: [
        record({ id: 'ses-1', kind: 'session', title: 'a run', data: {} }),
        record({ id: 'not-1', kind: 'note', title: 'a diary entry', data: {} }),
        record({ id: 'pur-1', kind: 'purchase', title: 'a gauge', data: { state: 'chasing' } }),
      ],
    })
    expect(result.unclassified.map((r) => r.key)).toEqual(['rec:pur-1'])
    expect(result.noState.map((r) => r.key).sort()).toEqual(['rec:not-1', 'rec:ses-1'])

    // A session declares a state and has none; a note has no state field at all. Two different
    // sentences, because they are two different gaps.
    const session = result.noState.find((r) => r.recordId === 'ses-1')
    const note = result.noState.find((r) => r.recordId === 'not-1')
    expect(session?.expected).toBe(true)
    expect(session?.note).toContain('none was written here')
    expect(note?.expected).toBe(false)
    expect(note?.note).toContain('have no state field')
  })

  it('reads "does this kind carry a state" out of the published schema', () => {
    expect(kindDeclaresState('session')).toBe(true)
    expect(kindDeclaresState('problem')).toBe(true)
    expect(kindDeclaresState('obligation')).toBe(true)
    // A MODULE NOW CARRIES ONE, AND THIS LINE USED TO SAY IT DID NOT. Modules were given a stored
    // lifecycle — active, paused, stable, retired — so "nobody wrote a state on this module" became
    // a real gap in a real record rather than a question about a kind that never had the field. The
    // point of reading this out of KIND_SPECS rather than listing it here is that the answer follows
    // the schema the product publishes; this test moved because the schema did.
    expect(kindDeclaresState('module')).toBe(true)
    expect(kindDeclaresState('note')).toBe(false)
    // A DIRECTION HAS NO `state` FIELD AND IS NOT A RECORD MISSING ONE. Its progress is `depth`, and
    // the rule reports it as such rather than through this question — see the direction block below.
    expect(kindDeclaresState('direction')).toBe(false)
    // Not a kind. Mole Office cannot say what was expected, so it does not say.
    expect(kindDeclaresState('sandwich')).toBeNull()
  })
})

// ---------------------------------------------------------------------------- directions

/**
 * A DIRECTION IS NOT A RECORD MISSING ITS STATE.
 *
 * MEASURED ON THE LIVE DATABASE: sixteen of seventeen directions sat in the `noState` group beside
 * notes, messages and decisions, under the sentence *records of this kind have no state field, so
 * there is no word to read*. Literally true, and it reads as a gap in the record. There is no gap.
 * A direction is the one kind whose whole purpose sentence is about progress — "a line of
 * exploration, tracked by how far it has actually been taken" — and it records that in `depth`, on a
 * required, validated six-rung ladder that GET /api/kinds calls "what the kind is for".
 *
 * THE OTHER HALF IS THE ONE THAT COULD DO DAMAGE. The obvious repair is to read the ladder as
 * progress: `noticed` and `read` become work that stopped short, and every direction in the lab
 * arrives on the list of what needs a person today. A direction is usually written down precisely
 * because nobody is taking it now, so that reading would fill the list permanently with things
 * nobody intends to act on and empty it of readers. These tests pin both halves: it is reported in
 * its own words, and no rung of the ladder puts it on the list.
 */
describe('a direction records its progress as depth, and a shallow one is not an urgent job', () => {
  const direction = (id: string, data: Record<string, unknown>): PanelRecord =>
    record({ id, kind: 'direction', title: `direction ${id}`, data })

  it('is not reported as a record that has no state word', () => {
    const result = run({
      records: [
        direction('dir-1', { depth: 'noticed', question: 'What breaks when the base moves?' }),
        record({ id: 'not-1', kind: 'note', title: 'a diary entry', data: {} }),
      ],
    })
    // The note genuinely has nothing. The direction is not filed beside it.
    expect(result.noState.map((r) => r.recordId)).toEqual(['not-1'])
    expect(result.directions.map((r) => r.recordId)).toEqual(['dir-1'])
    expect(result.passedOver.find((b) => b.bucket === 'progress_on_its_own_ladder')?.keys).toEqual(['rec:dir-1'])
  })

  it('says how far it has been taken, in the ladder’s own language', () => {
    const result = run({ records: [direction('dir-1', { depth: 'ran' })] })
    const row = result.directions[0]
    expect(row?.depth).toBe('ran')
    expect(row?.rung).toBe(3)
    expect(row?.rungs).toBe(6)
    // The sentence names the ladder, so nobody reads "ran" as a state word from a vocabulary they
    // have not met, and it carries what that rung claims.
    expect(row?.note).toContain('rung 3 of 6')
    expect(row?.note).toContain('No numbers were taken from it')
    expect(row?.note).not.toContain('no state')
  })

  it('does not put a direction on the list at any rung, including the first', () => {
    const result = run({
      records: ['noticed', 'read', 'ran', 'measured', 'integrated', 'defended'].map((depth, i) =>
        direction(`dir-${i}`, { depth }),
      ),
    })
    expect(result.total).toBe(0)
    expect(result.directions).toHaveLength(6)
    expect(result.noState).toHaveLength(0)
    expect(result.unclassified).toHaveLength(0)
  })

  it('reports a direction that never said how far it went as the gap it is, and still not as urgent', () => {
    // `depth` is required by the kind, so a direction without one has left out the one thing the
    // kind is for. That is worth saying and it is still not a reason to act today.
    const result = run({ records: [direction('dir-1', { question: 'How much is invisible to both cameras?' })] })
    expect(result.total).toBe(0)
    const row = result.directions[0]
    expect(row?.depth).toBeNull()
    expect(row?.rung).toBeNull()
    expect(row?.note).toContain('no depth is recorded')
  })

  it('still raises a direction somebody said a person could be hurt by', () => {
    // THE PATHS THAT DO REACH THE LIST ARE UNTOUCHED, and this is the sharpest of them. Decision 15
    // takes the depth ladder out of the selection rule; it takes nothing out of the ordinary
    // machinery every other kind uses.
    const result = run({
      records: [
        direction('dir-1', {
          depth: 'noticed',
          consequence: { bearer: 'person', what: 'the arm keeps moving while this is being tried on the bench' },
          state: 'open',
        }),
      ],
    })
    expect(result.total).toBe(1)
    expect(result.visible[0]?.safety).toBe(true)
    expect(result.directions).toHaveLength(0)
  })

  it('still raises a direction whose pause has run past the date it was set until', () => {
    const result = run({
      records: [
        direction('dir-1', {
          depth: 'read',
          paused: {
            since: ago(30 * DAY_MS),
            why: 'the Orin is with the SLAM group',
            until: { date: ago(4 * DAY_MS).slice(0, 10) },
          },
        }),
      ],
    })
    expect(result.total).toBe(1)
    expect(result.visible[0]?.reason.selectedBy).toBe('pause_elapsed')
    expect(result.directions).toHaveLength(0)
  })

  it('still raises a direction somebody outside is waiting for', () => {
    const result = run({
      records: [direction('dir-1', { depth: 'measured', owedTo: 'the ESA grant review', due: ago(5 * DAY_MS).slice(0, 10) })],
    })
    expect(result.total).toBe(1)
    expect(result.visible[0]?.reason.selectedBy).toBe('owed')
    expect(result.directions).toHaveLength(0)
  })

  it('counts every direction it passed over, so the list balances exactly as before', () => {
    const result = run({
      records: [
        ...['noticed', 'read', 'ran'].map((depth, i) => direction(`dir-${i}`, { depth })),
        record({ id: 'ses-1', kind: 'session', title: 'a run that died', data: { state: 'crashed' } }),
      ],
    })
    const bucketed = result.passedOver.reduce((sum, group) => sum + group.count, 0)
    expect(bucketed + result.total).toBe(result.counts.candidates)
    const keysSeen = result.passedOver.flatMap((group) => group.keys)
    expect(new Set(keysSeen).size).toBe(keysSeen.length)
  })
})

// ---------------------------------------------------------------------------- safety

describe('safety has a floor that age cannot move', () => {
  /** Everything except a consequence, three weeks old, owed, overdue, with work behind it. */
  const olderEverythingElse: PanelRecord[] = [
    record({
      id: 'obl-old',
      kind: 'obligation',
      title: 'a promise three weeks past its date',
      data: { owedTo: 'the ESA grant review', due: ago(21 * DAY_MS).slice(0, 10) },
      updatedAt: ago(21 * DAY_MS),
    }),
    record({ id: 'tsk-a', kind: 'task', title: 'a', data: { state: 'todo' } }),
    record({ id: 'tsk-b', kind: 'task', title: 'b', data: { state: 'todo' } }),
    record({ id: 'tsk-c', kind: 'task', title: 'c', data: { state: 'todo' } }),
    record({ id: 'tsk-d', kind: 'task', title: 'd', data: { state: 'todo' } }),
  ]
  const standing: Link[] = ['tsk-a', 'tsk-b', 'tsk-c', 'tsk-d'].map((id, i) =>
    link(`lnk-${i}`, 'obl-old', id),
  )

  const brandNewSafety = record({
    id: 'prb-estop',
    kind: 'problem',
    title: 'The E-stop path in the demo launcher is a no-op',
    data: {
      state: 'open',
      consequence: { bearer: 'person', what: 'the arm keeps moving when somebody hits the stop' },
    },
    createdAt: ago(MINUTE_MS),
    updatedAt: ago(MINUTE_MS),
  })

  it('puts a safety item filed one minute ago above a three-week-old everything else', () => {
    const result = run({ records: [...olderEverythingElse, brandNewSafety], links: standing })
    const first = result.visible[0]
    expect(first?.recordId).toBe('prb-estop')
    expect(first?.safety).toBe(true)
    expect(first?.reason.safetyFloor).toBe(true)
    // And it wins on the floor, not on the score: the old promise scores more points.
    const promise = allRows(result).find((row) => row.recordId === 'obl-old')
    expect(promise?.score).toBeGreaterThan(first?.score ?? 0)
  })

  it('gives the same item the same place whether it is one minute or three weeks old', () => {
    const fresh = run({ records: [...olderEverythingElse, brandNewSafety], links: standing })
    const stale = run({
      records: [
        ...olderEverythingElse,
        { ...brandNewSafety, createdAt: ago(21 * DAY_MS), updatedAt: ago(21 * DAY_MS) },
      ],
      links: standing,
    })
    expect(fresh.visible[0]?.recordId).toBe('prb-estop')
    expect(stale.visible[0]?.recordId).toBe('prb-estop')
  })

  it('never lets the group cap displace a safety row', () => {
    // Five safety problems, all one group, plus four ordinary rows in another group. Without the
    // exemption the cap would hold two of the five back.
    const safeties = [1, 2, 3, 4, 5].map((n) =>
      record({
        id: `prb-${n}`,
        kind: 'problem',
        title: `dangerous ${n}`,
        data: { state: 'open', consequence: { bearer: 'person', what: 'somebody could be hurt' } },
      }),
    )
    const others = [1, 2, 3, 4].map((n) =>
      record({ id: `ses-${n}`, kind: 'session', title: `crash ${n}`, data: { state: 'crashed' } }),
    )
    const result = run({ records: [...safeties, ...others] })
    expect(result.visible.filter((row) => row.safety)).toHaveLength(5)
    expect(result.visible.every((row, i) => i >= 5 || row.safety)).toBe(true)
    expect(result.remainder.some((row) => row.safety)).toBe(false)
  })
})

// ---------------------------------------------------------------------------- no factor dominates

describe('no single factor can fill the list', () => {
  it('keeps every factor smaller than the sum of the others', () => {
    // The structural guarantee, checked over the table rather than over the numbers in it. A row
    // that scores everything except X always outranks a row that scores only X.
    const total = FACTOR_NAMES.reduce((sum, name) => sum + FACTOR_MAX[name], 0)
    for (const name of FACTOR_NAMES) {
      expect(FACTOR_MAX[name]).toBeLessThan(total - FACTOR_MAX[name])
    }
  })

  it('beats the biggest single factor with the other four', () => {
    // `harm` is the biggest, and a safety consequence also gets the floor, so this is the strongest
    // form of the claim: everything else together beats the largest factor that is not the floor.
    const propertyOnly = record({
      id: 'prb-money',
      kind: 'problem',
      title: 'expensive but nothing else',
      data: { state: 'open', consequence: { bearer: 'outside', what: 'a bill' } },
      updatedAt: ago(0),
    })
    const everythingElse = record({
      id: 'obl-1',
      kind: 'obligation',
      title: 'late, waited on, and long left',
      data: { owedTo: 'the metrology lab', due: ago(30 * DAY_MS).slice(0, 10) },
      updatedAt: ago(30 * DAY_MS),
    })
    const behind = [1, 2, 3, 4].map((n) => record({ id: `tsk-${n}`, kind: 'task', title: `t${n}`, data: { state: 'todo' } }))
    const result = run({
      records: [propertyOnly, everythingElse, ...behind],
      links: behind.map((r, i) => link(`lnk-${i}`, 'obl-1', r.id)),
    })
    expect(result.visible[0]?.recordId).toBe('obl-1')
  })
})

// ---------------------------------------------------------------------------- diversity

describe('no group can take the visible list while another has rows waiting', () => {
  /** The measured failure: seven crashed sessions filled a panel of seven, for ever. */
  const crashes = (n: number): PanelRecord[] =>
    Array.from({ length: n }, (_, i) =>
      record({
        id: `ses-${i}`,
        kind: 'session',
        title: `a run that died ${i}`,
        data: { state: 'crashed' },
        updatedAt: ago((20 - i) * DAY_MS), // old, so they score well on age
      }),
    )

  it('caps one group at MAX_ROWS_PER_GROUP and shows the others', () => {
    const result = run({
      records: [
        ...crashes(20),
        record({
          id: 'obl-1',
          kind: 'obligation',
          title: 'a late promise',
          data: { owedTo: 'the ESA grant review', due: ago(6 * DAY_MS).slice(0, 10) },
        }),
        record({
          id: 'mod-1',
          kind: 'module',
          title: 'Tray clamp',
          data: { parts: [{ id: 'p', name: 'shape', items: [{ id: 'i1', text: 'print v3', state: 'failed' }] }] },
        }),
        record({ id: 'pipe-1', kind: 'pipeline', title: 'Handover', data: { blockIds: ['s1'] } }),
        record({ id: 's1', kind: 'block', title: 'Handover \u203a grasp', data: { state: 'failed' } }),
        record({ id: 'prb-1', kind: 'problem', title: 'something wrong', data: { state: 'open' } }),
      ],
    })
    const sessionsShown = result.visible.filter((row) => row.group === 'stopped:notes')
    expect(sessionsShown.length).toBeLessThanOrEqual(MAX_ROWS_PER_GROUP)
    // Every other group that had a qualifying row is on the screen.
    const groupsShown = new Set(result.visible.map((row) => row.group))
    expect(groupsShown).toContain('owed')
    expect(groupsShown).toContain('stopped:item')
    expect(groupsShown).toContain('stopped:block')
    expect(groupsShown).toContain('stopped:work')
    expect(result.visible).toHaveLength(VISIBLE_ROWS)
  })

  it('says which cap moved each row it did not show', () => {
    // Twenty crashes outrank the four rows below them on age alone. The cap lets three of them
    // through, so crashes four to twenty are on the screen's own terms good enough to be shown and
    // are not — that is the displacement, and it has to be visible in the remainder.
    const result = run({
      records: [
        ...crashes(20),
        record({ id: 'prb-1', kind: 'problem', title: 'something wrong', data: { state: 'open' }, updatedAt: ago(HOUR_MS) }),
        record({ id: 'prb-2', kind: 'problem', title: 'something else wrong', data: { state: 'open' }, updatedAt: ago(HOUR_MS) }),
        record({
          id: 'mod-1',
          kind: 'module',
          title: 'Tray clamp',
          updatedAt: ago(HOUR_MS),
          data: { parts: [{ id: 'p', name: 'shape', items: [{ id: 'i1', text: 'print v3', state: 'failed' }] }] },
        }),
        record({
          id: 'pipe-1',
          kind: 'pipeline',
          title: 'Handover',
          updatedAt: ago(HOUR_MS),
          data: { steps: [{ id: 's1', name: 'grasp', state: 'failed' }] },
        }),
      ],
    })
    expect(result.visible).toHaveLength(VISIBLE_ROWS)
    expect(result.visible.every((row) => row.displacedBy === null)).toBe(true)
    expect(result.remainder.every((row) => row.displacedBy !== null)).toBe(true)
    // The crashes that outranked a row on the screen and did not get one say so.
    const displaced = result.remainder.filter((row) => row.displacedBy === 'group-cap')
    expect(displaced.length).toBeGreaterThan(0)
    expect(displaced.every((row) => row.group === 'stopped:notes')).toBe(true)
  })

  it('does not shorten the list when there is nothing else waiting', () => {
    // The cap exists to keep other groups on the screen. With only one group in the data it must
    // not leave four empty rows, so the rows it held back go back in.
    const result = run({ records: crashes(20) })
    expect(result.visible).toHaveLength(VISIBLE_ROWS)
    expect(result.visible.every((row) => row.group === 'stopped:notes')).toBe(true)
    expect(result.visible.every((row) => row.displacedBy === null)).toBe(true)
    expect(result.remainder.every((row) => row.displacedBy === 'row-cap')).toBe(true)
  })

  it('shows everything when there is less than a screenful', () => {
    const result = run({ records: crashes(2) })
    expect(result.visible).toHaveLength(2)
    expect(result.remainder).toHaveLength(0)
    expect(result.remainderNote).toBeNull()
    expect(result.remainderByGroup).toEqual([])
  })
})

// ---------------------------------------------------------------------------- the overdue exemption

/**
 * AN OVERDUE PROMISE WALKS PAST THE GROUP CAP, AND THE EXEMPTION IS ITSELF BOUNDED.
 *
 * MEASURED, like every other block in this file. Over the live corpus on 2026-08-10 there were ten
 * owed rows and six of them were past their date. Three were on the screen. Three sat in the
 * remainder marked `displacedBy: 'group-cap'` — the highest scoring 80 and 6.9 days late — while
 * visible row seven was a checklist item scoring 16.
 *
 * THE CAP IT WALKS PAST IS NOT A MISTAKE, so the bound is pinned as hard as the exemption. Ten
 * overdue obligations filling all seven rows would be the seven-crashed-sessions failure wearing a
 * different word, and the tests below fail if the exemption is deleted AND if it is made unbounded.
 */
describe('an overdue promise is not hidden by its group’s quota, and cannot take the screen either', () => {
  /** An obligation somebody outside is waiting for, `daysLate` days past the date agreed. */
  const overdue = (n: number, daysLate: number): PanelRecord =>
    record({
      id: `obl-${n}`,
      kind: 'obligation',
      title: `a promise ${daysLate} days past its date (${n})`,
      data: { owedTo: 'the ESA grant review', due: ago(daysLate * DAY_MS).slice(0, 10) },
    })

  /** Six rows in two other groups, so the screen is full without any exemption being spent. */
  const otherWork = (): PanelRecord[] => [
    ...[1, 2, 3].map((n) =>
      record({
        id: `ses-${n}`,
        kind: 'session',
        title: `a run that died ${n}`,
        data: { state: 'crashed' },
        updatedAt: ago(2 * DAY_MS),
      }),
    ),
    record({
      id: 'mod-1',
      kind: 'module',
      title: 'Tray clamp',
      updatedAt: ago(2 * DAY_MS),
      data: {
        parts: [
          {
            id: 'p',
            name: 'shape',
            items: [1, 2, 3].map((n) => ({ id: `i${n}`, text: `print v${n}`, state: 'failed' })),
          },
        ],
      },
    }),
  ]

  it('leaves a full group’s share of the screen for every other reason', () => {
    // The bound checked over the constants rather than over the number four, the same way the
    // factor table is checked: the numbers can be tuned and the guarantee cannot be tuned away.
    expect(MAX_OVERDUE_OWED_ROWS).toBeGreaterThan(MAX_ROWS_PER_GROUP)
    expect(VISIBLE_ROWS - MAX_OVERDUE_OWED_ROWS).toBeGreaterThanOrEqual(MAX_ROWS_PER_GROUP)
  })

  it('shows a fourth overdue promise that the group cap held back before', () => {
    // Four overdue promises against six rows in two other groups. Under the plain cap the fourth
    // sat in the remainder while a checklist item took row seven, which is the measured failure.
    const result = run({ records: [overdue(1, 9), overdue(2, 7), overdue(3, 5), overdue(4, 3), ...otherWork()] })
    expect(result.visible).toHaveLength(VISIBLE_ROWS)
    expect(result.visible.map((row) => row.key)).toContain('rec:obl-4')
    expect(result.visible.filter((row) => row.group === 'owed')).toHaveLength(MAX_OVERDUE_OWED_ROWS)
    expect(result.visible.every((row) => row.displacedBy === null)).toBe(true)
    // The row that made way is counted, not lost.
    expect(result.visible.length + result.remainder.length).toBe(result.total)
  })

  it('still caps a promise whose date has not arrived, and one that never had a date', () => {
    // ONLY OVERDUE. A future obligation is ordinary work: somebody outside is waiting, nothing
    // measured says it is late, and it earns its place on score like everything else. "Due today"
    // is in here on purpose — a bare date is due at the END of that day, so at 09:40 it is not yet
    // past, and reading it as overdue would put the panel back to crying wolf every morning.
    //
    // THE LAST THREE ARE THE FORMS `due` LEARNED THIS PASS, AND THEY ARE HERE FOR THE SAME REASON.
    // A promise owed on a trigger cannot be late, so it must not take a seat the exemption keeps for
    // promises that are. If a worded condition were ever resolved into a date so that the ranking
    // had a number to sort on, this is the line that would go red — the invented deadline would show
    // up as a fourth `owed` row on the screen, and the substitution would be invisible everywhere
    // else, because a resolved condition looks exactly like a date somebody wrote. The fired trigger
    // is in here too: coming due is not the same as being late, and neither is worth a seat.
    const notOverdue: Record<string, unknown>[] = [
      { owedTo: 'the ESA grant review', due: ahead(10 * DAY_MS).slice(0, 10) },
      { owedTo: 'the ESA grant review', due: localStamp(new Date(NOW)).slice(0, 10) },
      { owedTo: 'the ESA grant review' },
      { owedTo: 'the ESA grant review', due: { condition: 'the reprint is on the bench' } },
      { owedTo: 'the ESA grant review', due: { recordId: 'ses-1' } },
      { owedTo: 'the ESA grant review', due: { recordId: 'tsk-reprint' } },
      { owedTo: 'the ESA grant review', due: { recordId: 'nothing-answers-to-this' } },
    ]
    for (const data of notOverdue) {
      const result = run({
        records: [
          overdue(1, 9),
          overdue(2, 7),
          overdue(3, 5),
          record({ id: 'obl-4', kind: 'obligation', title: 'a promise not yet due', data }),
          // A FINISHED task, so one of the rows above is a promise whose trigger HAS fired. It adds
          // no row of its own — finished work is passed over — so the screen it competes for is the
          // same screen every other row in this loop competes for.
          record({ id: 'tsk-reprint', kind: 'task', title: 'reprint the shell', data: { state: 'done' } }),
          ...otherWork(),
        ],
      })
      const row = allRows(result).find((r) => r.key === 'rec:obl-4')
      expect(isOverdueOwed(row!), `${JSON.stringify(data)} is not overdue`).toBe(false)
      expect(row?.displacedBy, `${JSON.stringify(data)} should stay capped`).toBe('group-cap')
      expect(result.visible.filter((r) => r.group === 'owed')).toHaveLength(MAX_ROWS_PER_GROUP)
      expect(result.visible.length + result.remainder.length).toBe(result.total)
    }
  })

  it('gives ten overdue promises four rows of seven, and names the six it held back', () => {
    // THE FAILURE THE BOUND EXISTS TO PREVENT. Unbounded, these ten would take every row and the
    // screen would be one reason again. Bounded, three rows — a full group's share — stay with
    // the other reasons, and the six that did not fit are in the remainder under their own name.
    const ten = Array.from({ length: 10 }, (_, i) => overdue(i + 1, i + 1))
    const result = run({ records: [...ten, ...otherWork()] })

    const owedShown = result.visible.filter((row) => row.group === 'owed')
    expect(owedShown).toHaveLength(MAX_OVERDUE_OWED_ROWS)
    expect(owedShown.every(isOverdueOwed)).toBe(true)
    expect(result.visible.filter((row) => row.group !== 'owed')).toHaveLength(VISIBLE_ROWS - MAX_OVERDUE_OWED_ROWS)

    const owedHeld = result.remainder.filter((row) => row.group === 'owed')
    expect(owedHeld).toHaveLength(ten.length - MAX_OVERDUE_OWED_ROWS)
    // Held by the bound reads as `group-cap`, because what held it back was its group's share
    // being full — the same fact the plain cap reports, reached by a longer route.
    expect(owedHeld.every((row) => row.displacedBy === 'group-cap')).toBe(true)
    expect(result.remainderByGroup.find((group) => group.group === 'owed')?.count).toBe(owedHeld.length)
    expect(result.remainderNote).toContain(REASON_GROUP_LABELS.owed)

    // The counting still balances exactly, which is the promise the whole reply rests on.
    expect(result.visible.length + result.remainder.length).toBe(result.total)
    expect(result.total).toBe(result.counts.selected)
    const bucketed = result.passedOver.reduce((sum, group) => sum + group.count, 0)
    expect(bucketed + result.total).toBe(result.counts.candidates)
  })

  it('cannot take a row from safety, with ten overdue promises waiting', () => {
    // A GUARD, and honest about what holds it up: safety is a separate SORT KEY, so every safety
    // row is considered before any owed row and the exemption never reaches one. It passes today
    // for that reason alone; it is here as the tripwire if the exemption is ever moved ahead of
    // that key, which is the one way this change could have hurt somebody.
    const safeties = [1, 2, 3, 4, 5].map((n) =>
      record({
        id: `prb-${n}`,
        kind: 'problem',
        title: `dangerous ${n}`,
        data: { state: 'open', consequence: { bearer: 'person', what: 'somebody could be hurt' } },
      }),
    )
    const result = run({ records: [...safeties, ...Array.from({ length: 10 }, (_, i) => overdue(i + 1, i + 1))] })
    expect(result.visible.filter((row) => row.safety)).toHaveLength(safeties.length)
    expect(result.remainder.some((row) => row.safety)).toBe(false)
  })

  it('cannot reach past the seats safety already took from its own group', () => {
    // Five of these overdue promises are ALSO safety, so they take the `owed` group's seats on the
    // safety exemption. The bound counts the group's OWN rows, safety included, so nothing is left
    // for a sixth overdue promise and the last two rows go to a different reason. Made unbounded,
    // those two rows would go to more obligations and the crashed sessions would leave the screen.
    const dangerousPromises = [1, 2, 3, 4, 5].map((n) =>
      record({
        id: `obl-safe-${n}`,
        kind: 'obligation',
        title: `an overdue promise that is also dangerous ${n}`,
        data: {
          owedTo: 'the metrology lab',
          due: ago((10 + n) * DAY_MS).slice(0, 10),
          consequence: { bearer: 'person', what: 'the gauge is the only one at the bench' },
        },
      }),
    )
    const result = run({
      records: [
        ...dangerousPromises,
        ...Array.from({ length: 5 }, (_, i) => overdue(i + 1, i + 1)),
        ...[1, 2, 3, 4].map((n) =>
          record({ id: `ses-${n}`, kind: 'session', title: `a run that died ${n}`, data: { state: 'crashed' } }),
        ),
      ],
    })
    expect(result.visible.filter((row) => row.safety)).toHaveLength(dangerousPromises.length)
    expect(result.visible.filter((row) => row.group === 'owed')).toHaveLength(dangerousPromises.length)
    expect(result.visible.filter((row) => row.group === 'stopped:notes')).toHaveLength(
      VISIBLE_ROWS - dangerousPromises.length,
    )
    expect(result.remainder.filter((row) => row.group === 'owed' && !row.safety)).toHaveLength(5)
    expect(result.visible.length + result.remainder.length).toBe(result.total)
  })
})

// ---------------------------------------------------------------------------- the counting

describe('everything not shown is counted and named', () => {
  const mixed = (): AttentionInput => ({
    now: NOW,
    records: [
      ...Array.from({ length: 9 }, (_, i) =>
        record({ id: `ses-${i}`, kind: 'session', title: `run ${i}`, data: { state: 'crashed' } }),
      ),
      record({ id: 'obl-1', kind: 'obligation', title: 'a promise', data: { owedTo: 'the lab', due: ago(DAY_MS).slice(0, 10) } }),
      record({ id: 'pur-1', kind: 'purchase', title: 'a gauge', data: { state: 'chasing' } }),
      record({ id: 'not-1', kind: 'note', title: 'a note', data: {} }),
      record({ id: 'tsk-1', kind: 'task', title: 'paused work', data: { state: 'blocked', paused: { since: ago(DAY_MS), why: 'waiting for the arm' } } }),
    ],
    links: [],
    changes: [],
    resources: [{ type: 'gpu', key: '4102', detail: 'isaac sim, 4861 MiB', note: 'no live session claims it' }],
    dueMs: parseDueStamp,
  })

  it('adds the shown and the remainder to exactly the total', () => {
    const result = computeAttention(mixed())
    expect(result.visible.length + result.remainder.length).toBe(result.total)
    expect(result.total).toBe(result.counts.selected)
    expect(result.counts.visible).toBe(result.visible.length)
    expect(result.counts.remainder).toBe(result.remainder.length)
  })

  it('puts every candidate it did not select in exactly one named bucket', () => {
    const result = computeAttention(mixed())
    const bucketed = result.passedOver.reduce((sum, group) => sum + group.count, 0)
    expect(bucketed + result.total).toBe(result.counts.candidates)
    const seen = result.passedOver.flatMap((group) => group.keys)
    expect(new Set(seen).size).toBe(seen.length) // nothing counted twice
    expect(result.passedOver.every((group) => group.sentence.length > 0)).toBe(true)
  })

  it('names the remainder by group and count, and never says "more" on its own', () => {
    const result = computeAttention(mixed())
    expect(result.remainderNote).not.toBeNull()
    expect(result.remainderNote).not.toMatch(/^\+?\d+ more$/)
    expect(result.remainderNote).toContain(REASON_GROUP_LABELS['stopped:notes'])
    const counted = result.remainderByGroup.reduce((sum, group) => sum + group.count, 0)
    expect(counted).toBe(result.remainder.length)
  })

  it('counts held processes and never ranks one', () => {
    const result = computeAttention(mixed())
    expect(result.machine).toHaveLength(1)
    expect(result.machine[0]?.detail).toBe('isaac sim, 4861 MiB')
    expect(keys(result).some((key) => key.startsWith('res:'))).toBe(false)
    expect(result.passedOver.find((b) => b.bucket === 'machine')?.count).toBe(1)
  })
})

// ---------------------------------------------------------------------------- the reasons

describe('every row says why it is there and why it ranks where it does', () => {
  it('carries a machine-readable reason on every row', () => {
    const result = computeAttention({
      now: NOW,
      records: [
        record({ id: 'obl-1', kind: 'obligation', title: 'a promise', data: { owedTo: 'the lab', due: ago(2 * DAY_MS).slice(0, 10) } }),
        record({ id: 'ses-1', kind: 'session', title: 'a run', data: { state: 'crashed' } }),
      ],
      links: [],
      changes: [],
      resources: [],
      dueMs: parseDueStamp,
    })
    for (const row of allRows(result)) {
      expect(row.reason.owed !== null || row.reason.stoppedShort !== null).toBe(true)
      expect(row.reason.because.length).toBeGreaterThan(0)
      expect(row.reason.factors.length).toBeGreaterThan(0)
      for (const factor of row.reason.factors) {
        expect(FACTOR_NAMES).toContain(factor.name)
        expect(factor.points).toBeGreaterThanOrEqual(0)
        expect(factor.points).toBeLessThanOrEqual(FACTOR_MAX[factor.name])
        expect(factor.why.length).toBeGreaterThan(0)
      }
      expect(row.score).toBe(row.reason.factors.reduce((sum, factor) => sum + factor.points, 0))
    }
  })

  it('says that nobody recorded who is hurt, rather than assuming nobody is', () => {
    const result = run({ records: [record({ id: 'ses-1', kind: 'session', title: 'a run', data: { state: 'crashed' } })] })
    const harm = result.visible[0]?.reason.factors.find((factor) => factor.name === 'harm')
    expect(harm?.points).toBe(0)
    expect(harm?.why).toBe('nobody has recorded who is hurt if this is left alone')
  })

  it('dates a stop from the change that caused it when the log says so', () => {
    const changes: Change[] = [
      change('chg-1', 'ses-1', 'data.state', '"running"', '"crashed"', ago(9 * DAY_MS)),
      change('chg-2', 'ses-1', 'title', 'old', 'new', ago(HOUR_MS)),
    ]
    const result = run({
      records: [record({ id: 'ses-1', kind: 'session', title: 'a run', data: { state: 'crashed' }, updatedAt: ago(HOUR_MS) })],
      changes,
    })
    const row = result.visible[0]
    expect(row?.reason.stoppedShort?.sinceSource).toBe('state-change')
    expect(row?.reason.stoppedShort?.since).toBe(ago(9 * DAY_MS))
    // Nine days of standing still, not the one hour since somebody fixed the title.
    expect(row?.reason.factors.find((factor) => factor.name === 'sat')?.points).toBe(9)
  })

  it('falls back to the record it sits in for a checklist item, and says so on the row', () => {
    const result = run({
      records: [
        record({
          id: 'mod-1',
          kind: 'module',
          title: 'Tray clamp',
          updatedAt: ago(4 * DAY_MS),
          data: { parts: [{ id: 'p', name: 'shape', items: [{ id: 'i1', text: 'print v3', state: 'failed' }] }] },
        }),
      ],
    })
    const sat = result.visible[0]?.reason.factors.find((factor) => factor.name === 'sat')
    expect(sat?.why).toContain('an item carries no time of its own')
  })

  it('never invents a date it was not given', () => {
    const result = run({
      records: [record({ id: 'obl-1', kind: 'obligation', title: 'a promise', data: { owedTo: 'the group meeting' } })],
    })
    const row = result.visible[0]
    expect(row?.reason.owed?.due).toBeNull()
    expect(row?.reason.owed?.condition).toBeNull()
    expect(row?.reason.owed?.lateMs).toBeNull()
    expect(row?.reason.factors.find((factor) => factor.name === 'late')?.points).toBe(0)
    // A promise where NOTHING was recorded about when it is owed. The sentence says exactly that,
    // and it says the consequence: it can never come due. It used to say "no date was ever agreed",
    // which was true here and false on the two promises below, because one sentence was covering
    // four situations.
    expect(row?.reason.owed?.dueStanding).toBe('no-due-recorded')
    expect(row?.reason.because).toContain('nothing says when it is owed')
  })
})

// ---------------------------------------------------------------------------- vocabulary

describe('the reason groups', () => {
  it('has a label for every group, and a heading that reads as one', () => {
    for (const group of REASON_GROUPS) {
      expect(REASON_GROUP_LABELS[group].length).toBeGreaterThan(0)
      expect(reasonGroupHeading(group)[0]).toBe(REASON_GROUP_LABELS[group][0]?.toUpperCase())
    }
  })

  it('names the own-page group in the owner’s form, without the rule’s word (W1)', () => {
    // Criterion W1, on the owner’s words of 16 September 2026: the naming rule now
    // is a word a person says about the thing, never the attention rule's vocabulary. The group was
    // "records read on a page of their own, stopped short", then "Stopped reads"; "stopped" is the
    // rule's word, so it is now "Set aside". "Paused" was the other candidate and it is wrong here:
    // this panel already says "Pauses left out", so a "Paused" group would name rows it excludes.
    expect(REASON_GROUP_LABELS['stopped:own-page']).toBe('Set aside')
    expect(reasonGroupHeading('stopped:own-page')).toBe('Set aside')
  })

  it('lists every reading family from work.ts, so a new one cannot be forgotten', () => {
    expect(REASON_GROUPS).toContain('pause-elapsed')
    expect(REASON_GROUPS).toContain('stopped:work')
    expect(REASON_GROUPS).toContain('stopped:structure')
    expect(REASON_GROUPS).toContain('stopped:decisions')
    expect(REASON_GROUPS).toContain('stopped:findings')
    expect(REASON_GROUPS).toContain('stopped:ideas')
    expect(REASON_GROUPS).toContain('stopped:notes')
    expect(new Set(REASON_GROUPS).size).toBe(REASON_GROUPS.length)
  })
})

// ---------------------------------------------------------------------------- an invented corpus

/**
 * A small invented corpus, which holds the cases a real project's data once brought to this file.
 *
 * Until 2 October 2026 this block read an export of one person's real project (222 records). The
 * open-source copy of this repository carries no such export, so the block reads
 * tests/fixtures/an-invented-corpus-for-the-attention-rule.ts instead. That file names, beside each
 * record, which case it is there for: promises reached through a chain of `blocks` links, broken
 * links, change rows in two spellings, every state word the old corpus used, checklist items,
 * sessions with no state, directions with and without a depth, held processes and ideas put down
 * with a reason.
 *
 * The assertions here are still PROPERTIES of the rule wherever they can be. Where one pins a number
 * or an id, the number or id is a fact about the invented corpus, and the corpus file says why it is
 * there.
 *
 * The corpus holds no `consequence` on any record and no `paused` block on any record, as the old
 * one did not. So the safety floor and a recorded pause are exercised only by the made-up data above:
 * over this corpus, `harm` scores zero everywhere. That is a gap in the DATA, not in the rule.
 */
describe('an invented corpus', () => {
  const result = computeAttention({
    now: NOW,
    records: corpus.records,
    links: corpus.links,
    changes: corpus.changes,
    resources: corpus.resources,
    dueMs: parseDueStamp,
  })

  it('adds up exactly, over every record in it', () => {
    expect(result.visible.length + result.remainder.length).toBe(result.total)
    const bucketed = result.passedOver.reduce((sum, group) => sum + group.count, 0)
    expect(bucketed + result.total).toBe(result.counts.candidates)
    expect(result.counts.deleted).toBe(2)
  })

  it('shows more than one kind of thing, unlike the rule it replaces', () => {
    // The measured failure was seven crashed sessions at every setting. This corpus holds three
    // sessions that stopped short and the visible list is seven rows.
    const groups = new Set(result.visible.map((row) => row.group))
    // The RULE's guaranteed floor is two groups, not three — see MAX_OVERDUE_OWED_ROWS for why that
    // was accepted — so this number is a fact about the corpus and not a property of the rule.
    expect(groups.size).toBeGreaterThanOrEqual(3)
    for (const group of groups) {
      const shown = result.visible.filter((row) => row.group === group && !row.safety)
      // The `owed` group may reach MAX_OVERDUE_OWED_ROWS, and every row past MAX_ROWS_PER_GROUP
      // must be one the exemption actually applies to — an OVERDUE promise, never a future one.
      expect(shown.length).toBeLessThanOrEqual(group === 'owed' ? MAX_OVERDUE_OWED_ROWS : MAX_ROWS_PER_GROUP)
      expect(shown.filter(isOverdueOwed).length).toBeGreaterThanOrEqual(shown.length - MAX_ROWS_PER_GROUP)
    }
  })

  it('puts the fourth overdue promise on the screen, which the group cap used to hold back', () => {
    // The exemption, on a corpus where it decides something. Without it, `task-check-before-return`
    // would be in the remainder marked `group-cap`, two days past its date, while a stopped checklist
    // item scoring far less took row seven. One overdue owed row and one not yet due are still held,
    // and they are counted.
    const owedShown = result.visible.filter((row) => row.group === 'owed')
    expect(owedShown).toHaveLength(MAX_OVERDUE_OWED_ROWS)
    expect(owedShown.every(isOverdueOwed)).toBe(true)
    expect(result.visible.map((row) => row.recordId)).toContain('task-check-before-return')
    const owedHeld = result.remainder.filter((row) => row.group === 'owed')
    expect(owedHeld.length, 'the corpus holds owed rows past what the screen takes').toBeGreaterThan(0)
    expect(owedHeld.every((row) => row.displacedBy === 'group-cap')).toBe(true)
  })

  it('puts the report five days late on the screen', () => {
    expect(result.visible.map((row) => row.recordId)).toContain('promise-late-report')
  })

  it('selects the open problem the old rules could not reach', () => {
    const problem = allRows(result).find((row) => row.recordId === 'problem-cancel-does-nothing')
    expect(problem).toBeDefined()
    expect(problem?.reason.stoppedShort?.state).toBe('open')
    // And the checklist item that says the same thing, which no old condition could see.
    expect(keys(result)).toContain('item:module-import:co-5')
  })

  it('can read every state word in the corpus, which it could not before this pass', () => {
    // THIS TEST ASSERTED THE OPPOSITE UNTIL THIS PASS: that `fixed` and `parked` came back as words
    // nobody had classified. Both are in this corpus on ordinary records — a fixed problem, two
    // parked ideas — and both were being reported to the reader as questions about vocabulary
    // rather than as work at a known stage. The words are classified now, and over a corpus holding
    // every state word the old one used, the group is empty, which is what a corpus written under
    // one vocabulary should look like.
    const words = [...new Set(result.unclassified.map((row) => row.state))]
    expect(result.unclassified, `the corpus still holds words nothing classifies: ${words.join(', ')}`).toEqual([])
  })

  it('reports the two sessions with no state at all as their own group', () => {
    const sessions = result.noState.filter((row) => row.recordKind === 'session')
    expect(sessions).toHaveLength(2)
    expect(sessions.every((row) => row.expected === true)).toBe(true)
  })

  it('takes every direction out of "no state recorded" and reports its depth instead', () => {
    // THE DEFECT DECISION 15 NAMES. All eleven directions of the old corpus used to sit in `noState`
    // under "records of this kind have no state field", which is the sentence a reader gets about a
    // note that says nothing. Not one of them belongs there and not one of them belongs on the list.
    expect(result.noState.some((row) => row.recordKind === 'direction')).toBe(false)
    const directions = corpus.records.filter((r) => r.kind === 'direction' && r.deletedAt === null)
    expect(directions.length).toBeGreaterThan(0)
    expect(result.directions.map((row) => row.recordId).sort()).toEqual(directions.map((r) => r.id).sort())
    expect(keys(result).some((key) => result.directions.some((row) => row.key === key))).toBe(false)
    // Two of the three record a depth and one does not, and the reading says which is which in the
    // ladder's own words rather than reporting the one as a record with nothing on it.
    expect(result.directions.some((row) => row.depth === null)).toBe(true)
    expect(result.directions.some((row) => row.depth !== null)).toBe(true)
    for (const row of result.directions) {
      expect(row.note.length).toBeGreaterThan(0)
      expect(row.rungs).toBe(6)
      if (row.depth === null) expect(row.rung).toBeNull()
      else expect(row.rung).toBeGreaterThanOrEqual(1)
    }
  })

  it('counts the machine sweep and ranks none of it', () => {
    expect(result.machine).toHaveLength(corpus.resources.length)
    expect(keys(result).some((key) => key.startsWith('res:'))).toBe(false)
  })

  it('reports the two parked ideas as paused, each saying which kind of pause it is', () => {
    // THE OLD CORPUS GAINED PAUSED RECORDS WITHOUT ANYBODY EDITING IT. This test used to assert the
    // paused group was empty over the whole corpus, and it was — because `parked` was a word
    // nothing classified, so three parked ideas were reported as questions about vocabulary. The
    // moment `parked` was read as `paused` they became what they always were. This corpus keeps two
    // such ideas so the paused group is measured on data that does not carry a `paused` block.
    expect(result.paused.map((row) => row.recordId).sort()).toEqual(['idea-sort-by-size', 'idea-undo-import'])
    for (const row of result.paused) {
      expect(row.recordKind).toBe('idea')
      // None of them carries a `paused` block, so the honest standing is that none was recorded —
      // and the sentence must not go further than that. Each of these HAS a reason, in
      // `parked_because`, which the kind declares for exactly this job. Whether an idea should be
      // carrying the standard pause shape instead is §15 of design/DECISIONS-PENDING.md.
      expect(row.pause).toBeNull()
      expect(row.standing).toBe('no-pause-recorded')
      expect(row.note).not.toContain('no reason')
      // A pause is not a failure: none of them is on the list, and none is counted as stopped.
      expect(row.onList).toBe(false)
    }
    expect(keys(result).some((key) => key.startsWith('rec:idea-'))).toBe(false)
  })

  it('has no recorded consequence anywhere, and says so by being empty', () => {
    // Pinned deliberately. When the corpus gains one, this test fails and whoever added it should
    // check the safety floor against it as well as against the made-up data above.
    expect(allRows(result).every((row) => row.reason.consequence === null)).toBe(true)
  })
})

// ---------------------------------------------------------------------------- helpers

function link(id: string, fromId: string, toId: string): Link {
  return { id, fromId, toId, type: 'blocks', inferred: false, createdAt: ago(10 * DAY_MS), createdBy: `human:${THE_TEST_OFFICES_OWNER.id}`, createdByType: null }
}

function change(
  id: string,
  recordId: string,
  field: string,
  oldValue: string,
  newValue: string,
  at: string,
): Change {
  return {
    id,
    recordId,
    origin: 'authored',
    op: 'update',
    actorType: 'agent',
    actorId: 'claude-code',
    sessionId: null,
    field,
    oldValue,
    newValue,
    at,
  }
}

/** Every record kind Mole Office knows must land in a reason group; nothing may be homeless. */
describe('every kind can be grouped', () => {
  it('gives a record of any kind a group when it stops short', () => {
    const kinds: RecordKind[] = [
      'module', 'pipeline', 'session', 'problem', 'task', 'purchase', 'obligation',
      'claim', 'decision', 'idea', 'direction', 'wanna_try', 'message', 'note',
    ]
    const result = run({
      records: kinds.map((kind) => record({ id: `r-${kind}`, kind, title: kind, data: { state: 'blocked' } })),
    })
    expect(result.total).toBe(kinds.length)
    expect(allRows(result).every((row) => REASON_GROUPS.includes(row.group))).toBe(true)
    expect(allRows(result).some((row) => row.group === 'stopped:no-family')).toBe(false)
  })
})
