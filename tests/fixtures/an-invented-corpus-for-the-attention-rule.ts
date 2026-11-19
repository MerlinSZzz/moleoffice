// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN INVENTED CORPUS FOR THE ATTENTION RULE, read by the describe block 'an invented corpus' in
 * tests/attention-rule.test.ts.
 *
 * EVERY RECORD HERE IS MADE UP. No person, project or record in it exists anywhere. The ids are
 * readable words, not the office's twelve-character ids: `computeAttention` takes any string as an
 * id, so nothing here needs that shape.
 *
 * WHY IT EXISTS. That block used to read an export of a real project. The real data was chosen
 * because it held cases that made-up data in the rest of the test file missed: promises reached
 * through a chain of `blocks` links, links whose other end was deleted, change rows written in two
 * spellings, state words of every family, checklist items inside modules, sessions with no state,
 * directions with and without a depth, held processes, and ideas put down with a reason. This file
 * keeps each of those cases, one or two records apiece, and says beside each what it is for.
 *
 * THE CLOCK. The test reads it at 2026-08-09 09:40 local time. Every date below is set against that.
 * A bare date means the END of that day, as `parseDueStamp` reads it.
 */

import type { MachineResourceRef } from '../../src/shared/attention.ts'
import type { Change, Link, PanelRecord, RecordKind } from '../../src/shared/types.ts'

const WORKSPACE = 'ws-invented'
const OWNER = 'person-a'

function rec(
  id: string,
  kind: RecordKind,
  title: string,
  data: Record<string, unknown>,
  updatedAt: string,
  deletedAt: string | null = null,
): PanelRecord {
  return { id, kind, workspaceId: WORKSPACE, ownerId: OWNER, title, summary: null, data, createdAt: '2026-07-20 09:00:00', updatedAt, deletedAt }
}

function link(id: string, fromId: string, toId: string, type: Link['type']): Link {
  return { id, fromId, toId, type, inferred: false, createdAt: '2026-07-25 10:00:00', createdBy: 'human:person-a', createdByType: 'human' }
}

function stateChange(id: string, recordId: string, oldValue: string | null, newValue: string, at: string): Change {
  return {
    id,
    recordId,
    origin: null,
    op: 'update',
    actorType: 'agent',
    actorId: 'agent-x',
    sessionId: null,
    field: 'data.state',
    oldValue,
    newValue,
    at,
  }
}

export const records: PanelRecord[] = [
  // ---- OWED: five promises past their date, and one not yet due -------------------------------
  //
  // Together these are the case for the overdue exemption. Five rows are overdue, MAX_ROWS_PER_GROUP
  // is three and MAX_OVERDUE_OWED_ROWS is four, so exactly one overdue row is held back. Without the
  // exemption the fourth would be held as well, because enough rows of other groups wait below it.

  // Owed directly and five days past its date. It must be on the screen.
  rec('promise-late-report', 'obligation', 'The quarterly report for the review panel', {
    due: '2026-08-03',
    owedTo: 'the review panel',
    why: 'the next payment waits for it',
  }, '2026-08-07 22:00:00'),
  // Owed through ONE blocks link to the late report above, and carrying a Chinese title, as the old
  // corpus mixed two languages in its titles.
  rec('task-redo-the-draft', 'task', '重写报告草稿第四版', { state: 'blocked', blocked_by: 'the shared printer queue' }, '2026-08-06 09:15:00'),
  // Owed directly and two days past its date.
  rec('promise-return-the-loan', 'obligation', 'Return the borrowed screen to the team next door', {
    due: '2026-08-06',
    owedTo: 'the team next door',
  }, '2026-08-06 21:10:00'),
  // THE FOURTH OVERDUE ROW. Owed through one link to the loan above, while its own word says somebody
  // is on it (`doing`). It ranks fourth in the owed group, so only the exemption puts it on the screen.
  rec('task-check-before-return', 'task', 'Check the screen against the spare before it goes back', {
    state: 'doing',
  }, '2026-08-08 09:33:00'),
  // THE FIFTH OVERDUE ROW. Owed through TWO links (it blocks the redraft, which blocks the report). The
  // exemption is bounded at four, so this one is held back, and held back by the group cap.
  rec('problem-queue-is-full', 'problem', 'The shared printer queue holds two jobs ahead of ours', {
    state: 'open',
    symptom: 'the redraft cannot be printed until two other jobs finish',
  }, '2026-08-06 09:15:00'),
  // Owed directly but due in five weeks: not overdue, so no exemption, and held back by the group cap.
  rec('promise-later', 'obligation', 'Hand the spare keyboard back after the term starts', {
    due: '2026-09-15',
    owedTo: 'the front desk',
  }, '2026-07-19 11:30:00'),

  // ---- STOPPED SHORT, owed to nobody -----------------------------------------------------------

  // The problem no old rule could reach: open, owed to nobody, and found by an audit that nobody took
  // further. It must be selected with `stoppedShort.state` 'open'.
  rec('problem-cancel-does-nothing', 'problem', 'The cancel button in the import tool does nothing', {
    state: 'open',
    symptom: 'pressing cancel writes "cancel requested" to the log and the import goes on',
  }, '2026-07-18 09:30:00'),
  // A task stopped short that blocks nothing owed.
  rec('task-blocked-elsewhere', 'task', 'Rename the old folders', { state: 'blocked' }, '2026-08-01 10:00:00'),
  // A module with no state word of its own (so it is in `noState`, expected) whose checklist items
  // carry every item word the old corpus used. `co-5` says the same thing as the problem above, and
  // only a checklist reading can see it. `co-2` is the other item word that stops short.
  rec('module-import', 'module', 'Import tool', {
    parts: [
      {
        id: 'import-part-1',
        name: 'Import',
        items: [
          { id: 'co-1', text: 'Read the file list', state: 'done' },
          { id: 'co-2', text: 'Read the second format', state: 'failed' },
          { id: 'co-3', text: 'Write the summary page', state: 'todo' },
          { id: 'co-4', text: 'Show progress while it runs', state: 'doing' },
          { id: 'co-5', text: 'The cancel button really cancels (it does nothing now)', state: 'blocked' },
        ],
      },
    ],
  }, '2026-08-02 12:00:00'),
  // Three session words that stop short: a crash, a session left behind, and one sitting idle.
  rec('session-crashed', 'session', 'A session that crashed', { state: 'crashed' }, '2026-08-05 10:00:00'),
  rec('session-left-behind', 'session', 'A session left behind', { state: 'orphaned' }, '2026-07-26 12:20:00'),
  rec('session-idle', 'session', 'A session sitting idle', { state: 'idle' }, '2026-08-07 18:00:00'),

  // ---- NOT SELECTED, one state word of each other family -----------------------------------------
  //
  // So the test can say the corpus holds no word nothing classifies, every word the old corpus used is
  // here at least once. `fixed` and `parked` are the two that were once left unclassified.

  rec('session-running', 'session', 'A session running now', { state: 'running' }, '2026-08-09 09:30:00'),
  rec('session-finished', 'session', 'A session that finished', { state: 'finished' }, '2026-08-01 09:00:00'),
  // Recorded as genuinely undetermined, which is not the same as stopped.
  rec('session-cannot-tell', 'session', 'A session whose log stops mid-line', { state: 'unknown' }, '2026-08-06 09:05:00'),
  // Two sessions found with no state word at all. A session's kind declares a state, so each is in
  // `noState` with `expected: true`.
  rec('session-found-1', 'session', 'A process found with no session record', { agent: 'unknown-agent' }, '2026-07-28 04:30:00'),
  rec('session-found-2', 'session', 'A second process found with no session record', { agent: 'unknown-agent' }, '2026-07-29 04:30:00'),
  // `fixed`, with a change row whose old value is null: the state was first written by that change.
  rec('problem-fixed', 'problem', 'The export skipped empty folders', { state: 'fixed' }, '2026-07-22 15:40:00'),
  rec('problem-worked-around', 'problem', 'The preview is slow on large files', { state: 'worked_around' }, '2026-07-23 10:00:00'),
  rec('claim-measured', 'claim', 'The import reads 2,000 files a minute', { state: 'measured' }, '2026-07-24 10:00:00'),
  rec('claim-proposed', 'claim', 'The import could read twice as fast', { state: 'proposed' }, '2026-07-24 11:00:00'),
  rec('purchase-wanted', 'purchase', 'A second screen', { state: 'wanted' }, '2026-07-25 10:00:00'),
  rec('purchase-ordered', 'purchase', 'A longer cable', { state: 'ordered' }, '2026-07-25 11:00:00'),
  rec('purchase-cancelled', 'purchase', 'A spare stand', { state: 'cancelled' }, '2026-07-25 12:00:00'),
  rec('task-todo', 'task', 'Write the help page', { state: 'todo' }, '2026-07-26 10:00:00'),
  rec('task-done', 'task', 'Clear the old logs', { state: 'done' }, '2026-07-26 11:00:00'),
  rec('idea-active', 'idea', 'Show a preview before import', { state: 'active' }, '2026-07-27 10:00:00'),
  rec('idea-new', 'idea', 'Import from a shared folder', { state: 'new' }, '2026-07-27 11:00:00'),
  // TWO IDEAS PUT DOWN WITH A REASON. `parked` reads as paused. Neither carries a `paused` block, so
  // the honest standing is 'no-pause-recorded'; each has `parked_because`, so its note must not say
  // there is no reason.
  rec('idea-sort-by-size', 'idea', 'Sort the import list by size', {
    state: 'parked',
    parked_because: 'the list is short enough today that the order does not matter',
  }, '2026-07-24 18:20:00'),
  rec('idea-undo-import', 'idea', 'Undo a whole import in one step', {
    state: 'parked',
    parked_because: 'it needs the cancel button to work first',
  }, '2026-07-24 18:30:00'),

  // ---- KINDS THAT ARE NOT MEASURED BY A STATE WORD -------------------------------------------------

  // Three directions: two at a rung of the six-rung ladder, one with no depth written at all. None of
  // them belongs in `noState` and none of them is on the list.
  rec('direction-search', 'direction', 'Which way of splitting words makes search usable', {
    depth: 'measured',
    depth_reason: 'two ways were built and measured on a sample',
    question: 'Which way of splitting words gives usable search?',
  }, '2026-08-04 17:25:00'),
  rec('direction-sharing', 'direction', 'Whether two tools can share one folder', {
    depth: 'noticed',
    question: 'Can two tools share one folder without a lock?',
  }, '2026-08-03 12:00:00'),
  rec('direction-no-depth', 'direction', 'Whether the summary page needs a date', {
    question: 'Does the summary page need a date on it?',
  }, '2026-08-03 20:10:00'),
  // Kinds with no state field at all: `no_state_field`, `expected: false`.
  rec('note-one', 'note', 'A note about the folder layout', { body: 'The folders are sorted by month.' }, '2026-07-30 10:00:00'),
  rec('decision-one', 'decision', 'Keep one import at a time', { chosen: 'one at a time' }, '2026-07-30 11:00:00'),

  // ---- DELETED -----------------------------------------------------------------------------------
  //
  // Two deleted records, each the far end of a link below. A link to a deleted record is a broken
  // link: it must carry no promise and must not stop the rule.
  rec('claim-withdrawn', 'claim', 'The import reads 5,000 files a minute', { state: 'retracted' }, '2026-07-20 09:05:00', '2026-07-20 09:10:00'),
  rec('task-dropped', 'task', 'Buy a second spare stand', { state: 'todo' }, '2026-07-30 10:30:00', '2026-07-30 10:40:00'),
]

export const links: Link[] = [
  // The two chains that make three of the overdue rows owed through somebody else's promise.
  link('link-1', 'task-redo-the-draft', 'promise-late-report', 'blocks'),
  link('link-2', 'problem-queue-is-full', 'task-redo-the-draft', 'blocks'),
  link('link-3', 'task-check-before-return', 'promise-return-the-loan', 'blocks'),
  // A finished task blocking a promise: the walk stops at a finished thing, so this carries nothing.
  link('link-4', 'task-done', 'promise-later', 'blocks'),
  // An ordinary consumes link, which the rule reads apart from blocks.
  link('link-5', 'task-check-before-return', 'module-import', 'consumes'),
  // Broken links: the far end is deleted.
  link('link-6', 'promise-late-report', 'claim-withdrawn', 'consumes'),
  link('link-7', 'claim-withdrawn', 'task-blocked-elsewhere', 'blocks'),
  link('link-8', 'module-import', 'task-dropped', 'relates_to'),
]

export const changes: Change[] = [
  // The value stored JSON-quoted, which the change log does for some fields.
  stateChange('change-1', 'task-redo-the-draft', '"todo"', '"blocked"', '2026-08-04 10:00:00'),
  // The value stored bare, with no old value: the first time the state was written.
  stateChange('change-2', 'problem-fixed', null, 'fixed', '2026-07-22 15:40:00'),
  // A change to a word the record no longer holds. It does not date the current state.
  stateChange('change-3', 'session-crashed', 'idle', 'running', '2026-08-05 09:00:00'),
  stateChange('change-4', 'session-crashed', 'running', 'crashed', '2026-08-05 10:00:00'),
  // A change on a deleted record.
  stateChange('change-5', 'claim-withdrawn', 'measured', 'retracted', '2026-07-20 09:05:00'),
]

/** Held processes, one of each type the sweep reports. Counted, and never ranked. */
export const resources: MachineResourceRef[] = [
  { type: 'gpu', key: '4100', detail: 'a render job, 4,000 MiB', note: 'No session record names this process.' },
  { type: 'port', key: '5173', detail: 'a development server' },
  { type: 'container', key: 'scratch-database', detail: 'a scratch database container', note: 'Started by hand; nobody recorded by whom.' },
]
