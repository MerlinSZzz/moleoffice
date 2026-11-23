// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The old positive sweep said every non-human-only kind was writable. Office-only seals are now a third explicit partition; their creation and mutation refusals are exercised in sealed-submission.test.ts. */
/**
 * The human-only rule, on EVERY path that writes a record.
 *
 * WHY THIS FILE EXISTS. `HUMAN_ONLY_KINDS` is the only access control Mole Office has. It is stated in
 * the README, in the agent skill and in the published contract at GET /api/kinds. Until
 * 2026-08-10 it was enforced on two of the four ways a record can be written: an agent could not
 * create or change a decision, and could delete one and get HTTP 200. The tests that existed
 * asserted create and change and stopped there, so the hole was invisible from inside the suite.
 *
 * So this file does not test the two paths that were broken. It tests the RULE, over every write
 * path and every kind, taken from the contract rather than typed out here:
 *
 *   1. Every human-only kind is refused to a non-human on every write path, with nothing written.
 *   2. Every other kind is still writable by an agent on every path, so the guard cannot be
 *      "refuse everybody", which would pass part 1 and break the product.
 *   3. Every write to the `records` table in the whole product is inside a function that consults
 *      HUMAN_ONLY_KINDS. This is the part that catches the NEXT one: a sixth write path added
 *      without a guard fails here on the day it is written, rather than in an audit two months on.
 *
 * Adding a kind to HUMAN_ONLY_KINDS needs no change here. Adding a write path does, and that is
 * the point — the failure message says which function is unguarded.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AGENT, apiApp, buildTheFirstOfficeInAHook, expectPanelError, freshDb, type TestDb } from './helpers.ts'
import { HUMAN_ONLY_KINDS, RECORD_KINDS, type PanelRecord, type RecordKind } from '@shared/types.ts'
import { theCastingRoll } from '@shared/casting-roll.ts'
import { KNOWLEDGE_KINDS } from '@shared/knowledge/constants.ts'
import { PACK_KIND } from '@shared/kinds/pack.ts'
// Type-only, so this import is erased before it runs. A value import of records.ts here would open
// a database before helpers.ts had pointed MOLE_OFFICE_DB at a throwaway one; helpers.ts explains why.
import type { Actor } from '../src/server/lib/records.ts'

// The first office of this process is built in a hook, so each case below keeps its 5 s for what it tests.
buildTheFirstOfficeInAHook()

let t: TestDb

// ONE DATABASE FOR THE FILE. Every case below writes records of its own, and a refusal is checked
// against a snapshot of the one record it aimed at, so nothing here reads what another case wrote.
// `written_n` keeps every record's title different, which is what makes a failure readable.
beforeAll(async () => {
  t = await freshDb()
})
afterAll(() => {
  t.close()
})

/**
 * A non-human who might try. Both are refused, and neither is exercised anywhere else.
 *
 * `system` matters as much as `agent`: the rule in lib/records.ts is written as "not human", not
 * as "is an agent", and scripts/reindex.ts already writes as a system actor. If the condition were
 * ever narrowed to `actor.type === 'agent'`, a system actor could delete a decision and every
 * agent-only test in the suite would still pass.
 */
const REFUSED_ACTORS: Actor[] = [AGENT, { type: 'system', id: 'reindex-script' }]

/** A module with one checklist item, so the per-item write path has something to aim at. */
const CHECKLIST_DATA = {
  parts: [{ id: 'mount', name: 'Mount and extrinsics', items: [{ id: 'mount-1', text: 'Bolt it on', state: 'todo' }] }],
}

/**
 * One way to write a record.
 *
 * `fn` is the exported function that performs it, in lib/records.ts or in one of the modules moved
 * out of it into lib/records/. The source check at the bottom
 * of this file matches these names against the writes it finds, so a path that is listed here but
 * no longer writes anything, or a write that belongs to no listed path, both fail.
 */
interface WritePath {
  what: string
  fn: string
  attempt(recordId: string, kind: RecordKind, actor: Actor): unknown
}

const WRITE_PATHS: WritePath[] = [
  {
    // yFiC5HsshiTi's later look writes a record too, so it must ask the guard. Only the office calls it.
    what: "the office's later-look mark",
    fn: 'writeTheEndedRunLookMark',
    attempt: (id, _kind, actor) => t.api.writeTheEndedRunLookMark(id, '2026-10-01 12:00:00', actor),
  },
  {
    // Wave 13j round loop-1: how a round ended is the office's own account on a run, and its writer asks the guard too.
    // MUTATION, RUN ON 12 OCTOBER 2026, after a control run: its `assertMayWrite` taken out, and its four refusals here and
    // the source check below went red; restored, green.
    what: 'how the round ended',
    fn: 'writeHowTheRoundEnded',
    attempt: (id, _kind, actor) => t.api.writeHowTheRoundEnded(id, { sealed: false, at: '2026-10-12 00:00:00', says: 'Synthetic.' }, actor),
  },
  {
    // Wave 13j round loop-2: the next round asked for on a run is the office's own record there, and its writer asks the
    // guard too. MUTATION, RUN ON 12 OCTOBER 2026, after a control run: its `assertMayWrite` taken out, and its four
    // refusals here and the source check below went red; restored, green.
    what: 'the next round',
    fn: 'writeTheNextRound',
    attempt: (id, _kind, actor) => t.api.writeTheNextRound(id, { state: 'wanted', says: 'Synthetic.' }, actor),
  },
  {
    // Wave 13j round loop-3: a worker run a supervisor asked for is the office's own record on the supervisor's run, and
    // its writer asks the guard too. MUTATION, RUN ON 12 OCTOBER 2026, after a control run: its `assertMayWrite` taken out,
    // and its four refusals here and the source check below went red; restored, green.
    what: 'a worker run',
    fn: 'writeTheWorkerRun',
    attempt: (id, _kind, actor) => t.api.writeTheWorkerRun(id, 'a-made-up-worker', { state: 'wanted', says: 'Synthetic.' }, actor),
  },
  {
    // Wave 13s round 44: the Casting roll kept on a worker's run is the office's own record there, and its writer asks the
    // guard too. The roll is a made-up one, drawn from one made-up row. MUTATION, RUN ON 13 OCTOBER 2026, after a control
    // run: its `assertMayWrite` taken out, and its four refusals here and the source check below went red; restored, green.
    what: "a run's Casting roll",
    fn: 'writeTheCastingRoll',
    attempt: (id, _kind, actor) => t.api.writeTheCastingRoll(id, theCastingRoll({
      role: 'worker',
      project: 'default',
      rows: [{ id: 1, program: 'codex', model: 'test-model', effort: 'high', probability: 1, marked: true, labels: [], outUntil: null }],
      difficulty: null,
      named: null,
      earlier: null,
      builderModel: null,
      limits: { limited: [], unreadableStops: [], week: 'Synthetic.' },
      random: () => 0.5,
    }).record, actor),
  },
  {
    // Wave 13j, the round after loop-10: which commit a worker's run was asked to be cut from is the office's own record
    // on that run, and its writer asks the guard too. The commit is a made-up one. MUTATION, RUN ON 14 OCTOBER 2026,
    // after a control run: its `assertMayWrite` taken out, and its four refusals here and the source check below went
    // red; restored, green.
    what: 'the cut asked',
    fn: 'writeTheCutAsked',
    attempt: (id, _kind, actor) =>
      t.api.writeTheCutAsked(id, { commit: '3f2a9c1e0000000000000000000000000000beef', named: null, used: true, stoodAt: null, says: 'Synthetic.' }, actor),
  },
  {
    // Wave 13n: which images a codex worker's run was given is the office's own record on that run, and its writer asks
    // the guard too. The image and the worktree are made up.
    what: 'the images given',
    fn: 'writeTheImagesGiven',
    attempt: (id, _kind, actor) =>
      t.api.writeTheImagesGiven(id, { images: ['design/a-made-up-page.png'], worktree: '/made-up/worktree', says: 'Synthetic.' }, actor),
  },
  {
    what: 'create',
    fn: 'createRecordWithReport',
    attempt: (_id, kind, actor) => t.api.createRecord({ workspaceId: 'default', kind, title: `guard · a new ${kind} ${++written_n}`, actor }),
  },
  {
    what: 'change the record',
    fn: 'patchRecord',
    // THE TITLE AND NOT THE SUMMARY, since criterion P76 of 13 September. A decision is no longer
    // one flat object: its core — the option taken, the words why, the title, the words added after
    // the press — is closed to every agent, and the notes around it, the summary among them, are
    // open to any agent with the change saying who and when. Patching the summary therefore stopped
    // being refused for a decision, which would have made this row of the table pass for the wrong
    // reason on one kind and the right reason on the others. The title is refused on every
    // human-only kind, so the row asks one question again.
    attempt: (id, _kind, actor) => t.api.updateRecord(id, { title: 'rewritten by somebody else' }, actor),
  },
  {
    what: 'change one checklist item',
    fn: 'patchChecklistItem',
    attempt: (id, _kind, actor) => t.api.patchChecklistItem(id, 'mount-1', { state: 'done' }, actor),
  },
  {
    what: 'delete',
    fn: 'deleteRecord',
    attempt: (id, _kind, actor) => t.api.deleteRecord(id, actor),
  },
  {
    what: 'restore',
    fn: 'restoreRecord',
    attempt: (id, _kind, actor) => t.api.restoreRecord(id, actor),
  },
  {
    /**
     * MOVE IT INTO ANOTHER PROJECT — the fifth way to write a record, added 2026-08-12.
     *
     * It reaches this table because a move rewrites `records.workspace_id`, and it is listed here
     * for the reason the file header gives: a write path that is not listed is a rule nobody checks.
     * The source scan below found it on the first run when the write lived in lib/move.ts, which is
     * why the write is in lib/records.ts and the judgement is not.
     *
     * WHY IT IS AIMED AT `fileRecordsInWorkspace` AND NOT AT `moveRecordToWorkspace`. This section
     * asks whether every write to this table is guarded, so it must reach the write. The verb in
     * lib/move.ts asks the same guard about the same records before it writes anything, and
     * tests/workspace-move.test.ts drives that over HTTP — including the side door, where an agent
     * names an ordinary note and the decision joined to it would be carried along.
     */
    what: 'move it into another project',
    fn: 'fileRecordsInWorkspace',
    attempt: (id, _kind, actor) => {
      // A real destination, so the refusal is about who is asking and not about a project that does
      // not exist. Written straight in: `createWorkspace` lives in lib/workspaces.ts, and importing
      // that here for one row would pull a second module into a file that deliberately holds one.
      t.client.sqlite
        .prepare(
          "INSERT OR IGNORE INTO workspaces (id, title, note, created_at, updated_at) " +
            "VALUES ('elsewhere', 'Elsewhere', NULL, '2026-08-12 00:00:00', '2026-08-12 00:00:00')",
        )
        .run()
      return t.api.fileRecordsInWorkspace([id], 'elsewhere', actor)
    },
  },
]

/** Everything a refused write must leave exactly as it found it. */
function snapshot(id: string): unknown {
  return {
    record: t.api.getRecord(id),
    changes: t.api.listChanges({ workspaceId: 'default', recordId: id }).length,
    // Counts the create path too, whose attempt is aimed at no existing record.
    recordsInTable: t.api.listRecords({ workspaceId: 'default', includeDeleted: true }).length,
  }
}

/**
 * A different title for every record this file writes.
 *
 * NOT BECAUSE THE DATABASE REQUIRES IT — `records_title_idx` stopped being UNIQUE on 17 August 2026.
 * Because these tests count what is in the table after a refusal, and a repeated name would make a
 * failure impossible to read back to the test that caused it.
 */
let written_n = 0

/**
 * A record of `kind`, written by the human, carrying a checklist so every path can be tried.
 *
 * A BLOCK IS THE ONE KIND THAT CANNOT BE FILED ON ITS OWN, and that is not an exception this test
 * makes for it — it is the product refusing, because a block's title and its position both live on
 * its pipeline. So a block is filed the way the route files one, through its pipeline.
 */
function written(kind: RecordKind): PanelRecord {
  written_n += 1
  if (kind === 'block') {
    const pipeline = t.api.createRecord({ workspaceId: 'default',
      kind: 'pipeline',
      title: `guard · the pipeline holding block ${written_n}`,
      data: { blockIds: [] },
      actor: t.api.HUMAN,
    })
    return t.blocks.addBlock(pipeline.id, { name: `the block under test ${written_n}`, state: 'todo' }, t.api.HUMAN).block
  }
  // AND A `ran_instead` IS THE SECOND, for the same reason and through its own route. It says the
  // canonical method for a step is one thing and something else ran, so it is filed on the step:
  // which method it stands in for and which record its restriction is against both live there.
  if (kind === 'ran_instead') {
    const pipeline = t.api.createRecord({ workspaceId: 'default',
      kind: 'pipeline',
      title: `guard · the pipeline holding the step under test ${written_n}`,
      data: { blockIds: [] },
      actor: t.api.HUMAN,
    })
    const block = t.blocks.addBlock(
      pipeline.id,
      { name: `the step under test ${written_n}`, state: 'todo' },
      t.api.HUMAN,
    ).block
    t.api.patchRecord(block.id, { dataPatch: { method: 'the canonical method' } }, t.api.HUMAN)
    return t.api.fileRanInstead(
      block.id,
      {
        ran: 'something else',
        because: 'the canonical method would not run',
        since: '2026-08-30',
        allowed_uses: ['downstream plumbing'],
        disallowed_claims: ['that the canonical method works'],
        severity: 'limits_claims',
      },
      t.api.HUMAN,
    ).record
  }
  return t.api.createRecord({ workspaceId: 'default',
    kind,
    title: `guard · the ${kind} under test ${written_n}`,
    summary: 'written by the human',
    // Only a module declares `parts`, and the write path validates against the kind's fields, so
    // giving it to anything else would be refused for the wrong reason.
    ...(kind === 'module' ? { data: CHECKLIST_DATA } : {}),
    // A MESSAGE NAMES WHO IT IS TO. Since 4 September 2026 one that names nobody and points at
    // nothing is refused, so leaving it out here would fail this file for a reason it is not about.
    // AN INCIDENT NAMES ITS LOSS AND A MOMENT, for the same reason: I1's door refuses a create with
    // neither, on purpose, so an empty create would fail this file for a reason it is not about
    // either. This file is about who may write, not about what the kind demands.
    ...(kind === 'message' ? { data: { to: [{ kind: 'person', id: THE_TEST_OFFICES_OWNER.id }] } } : {}),
    ...(kind === 'incident'
      ? { data: { loss: 'A loss for the guard to read.', timeline: [{ id: 'm-1', at: 'now', who: 'the guard', what: 'Something happened.', evidence: 'ev-placeholder' }] } }
      : {}),
    actor: t.api.HUMAN,
  })
}

// ============================================================ 1. refused, on every path

describe('a kind only the human may write', () => {
  for (const kind of HUMAN_ONLY_KINDS) {
    for (const path of WRITE_PATHS) {
      for (const actor of REFUSED_ACTORS) {
        it(`refuses ${actor.type} "${actor.id}" on ${path.what} of a ${kind}, and writes nothing`, () => {
          const record = written(kind)
          // Restore is the one path that needs the record already gone. The human puts it there,
          // which is also the state the audit found: a decision the person recorded, an agent's hand on it.
          if (path.fn === 'restoreRecord') t.api.deleteRecord(record.id, t.api.HUMAN)

          const before = snapshot(record.id)
          const err = expectPanelError(t, () => path.attempt(record.id, kind, actor), 403)

          // The refusal names the kind and who was refused, and offers the route that DOES work.
          //
          // That route changed with decision 1 and this assertion changed with it. It used to read
          // `"kind":"note"`, because a note was the only thing an agent could write about a fork it
          // was not allowed to settle — and the old comment here said a 403 must not send an agent
          // "looking for a proposal endpoint that has never existed". One now exists. `proposal` is
          // a real kind an agent may write, holding the options, the recommendation and what would
          // reopen the question, and a human promotes it into the decision.
          //
          // So the old assertion was not wrong when it was written; it is wrong now, and it is the
          // TEST that moves. Worth stating plainly, because "the test was out of date" is also what
          // somebody says when they have quietly broken the product.
          expect(err.message).toContain(kind)
          expect(err.message).toContain(actor.id)
          expect(err.message).toContain('"kind":"proposal"')

          // And it names no OTHER human-only kind. Vacuous while the list holds one entry, real the
          // day it holds two: the sentences in the refusal are built per kind for exactly this
          // reason, and a hard-coded "decision" in one of them would fail here rather than tell an
          // agent to write a proposal about the wrong sort of record.
          for (const other of HUMAN_ONLY_KINDS.filter((k) => k !== kind)) {
            expect(err.message).not.toContain(other)
          }

          expect(snapshot(record.id)).toEqual(before)
        })
      }
    }
  }
})

// ============================================================ 2. and not over-broad

describe('every other kind', () => {
  // `merge_entry` SINCE 21 SEPTEMBER 2026, sandbox v1 piece P6: written only by the merge queue's
  // doors, and refused to every other write whoever asks.
  // `counter` SINCE 23 SEPTEMBER 2026, criteria CT1 and CT6: written only by its own doors, because
  // every change to one says who may and keeps why, and POST /api/records carries neither —
  // tests/counter-doors.test.ts proves the refusal.
  // `flow_run` SINCE 4 OCTOBER 2026, wave 1 of the office flow (M1): written only by the office, beside the run it
  // records — tests/the-office-writes-a-runs-steps.test.ts proves the refusal.
  // `checklist` SINCE 8 OCTOBER 2026, written only by its own doors, so that its owner is the
  // caller. tests/a-checklist-keeps-requests-and-brings-them-back.test.ts proves the
  // refusal.
  // `booking` SINCE 8 OCTOBER 2026, written only by its own doors, because the office places it in the
  // line. tests/gpu-bookings.test.ts drives those doors.
  // `emergency_push` SINCE 25 OCTOBER 2026, wave 13u round 82: written only by its two doors, so that it names who
  // pushed. tests/an-emergency-push-to-main.test.ts proves the refusal.
  // `host_job` SINCE 7 NOVEMBER 2026: written only by its own doors, the ask and the host runner's take and answer,
  // because it says which registered tool ran for which run and what came of it.
  // tests/a-sandboxed-agent-asks-the-office-for-a-registered-host-tool.test.ts proves the refusal.
  // `project_chapter` AND `design_review` SINCE 8 NOVEMBER 2026, wave 13s round 226: written only by their own doors,
  // the person included, because the chapter's door reads every rule and keeps each revision with its reason, and the
  // review's door writes the reviewer from the key. tests/project-rules-the-chapter.test.ts (cases 2 and 3) and
  // tests/project-rules-the-judge.test.ts (case 11) prove the refusals.
  // `design_reminder` SINCE 8 NOVEMBER 2026, wave 13s round 228: kept by the office before a seal, and judged or filed as
  // a miss only through its own doors, the person included, so that the office writes who judged it from the key.
  // tests/a-design-reminder-is-judged-once-and-counted-by-the-day.test.ts (case 6) proves the refusal.
  // `key_item` SINCE 20 NOVEMBER 2026, wave 13s round 281: written only by its own doors, the person included, so that
  // the office writes who set its progress and its estimate, and when, from the key and its own clock.
  // tests/key-items-carry-progress-and-a-time-left-estimate.test.ts (case 1) proves the refusal.
  // The knowledge kinds SINCE 20 NOVEMBER 2026: written only by their own doors to preserve workspace and review rules.
  // tests/knowledge-entries-and-changes.test.ts proves the ordinary door's refusals.
  const OFFICE_ONLY_KINDS = ['sealed_tip', 'merge_entry', 'counter', 'flow_run', 'checklist', 'booking', 'emergency_push', 'host_job', PACK_KIND, 'project_chapter', 'design_review', 'design_reminder', 'key_item', ...KNOWLEDGE_KINDS]
  // `message` SINCE 29 SEPTEMBER 2026, only its writer may change, delete or bring back a message,
  // and the writer may change only its words. This loop has the person write
  // each record and an agent change it, which is exactly what a message now refuses.
  // tests/only-its-writer-changes-a-message.test.ts proves that an agent creates, changes, deletes and
  // brings back its own message.
  const WRITER_ONLY_KINDS = ['message']
  // `role_card_words` SINCE WAVE 13W ROUND 5, by a decision of the owner's: an agent creates, changes, deletes or
  // restores one only with a warrant that copies the owner's words from their message, and a live decision of the
  // owner's must rest on that message. This loop has an agent change each record with no warrant, which is exactly
  // what a card's words now refuse. tests/an-agents-change-to-a-cards-words-stands-on-the-owners-decision.test.ts
  // proves the refusal for each of the four acts, and that each act on such a decision is written.
  // `secretary_duties` SINCE WAVE 13S ROUND 92: the person writes one, or the secretary it names with a warrant quoting
  // the person's words from a decision it rests on, and every other agent is refused. tests/secretary-duties.test.ts
  // proves the create and the change.
  // `department` SINCE WAVE 13S ROUND 281: the person writes one by a press, or a secretary with its own key and a
  // warrant quoting the person's words from a decision it rests on, and every other agent is refused.
  // tests/departments-are-records-of-their-own.test.ts proves the create, the change, the delete and the restore.
  const ON_THE_OWNERS_DECISION_KINDS = ['role_card_words', 'secretary_duties', 'department']
  // Personal choices use the recipient's own door. This file proves generic writes refuse below;
  // personal-notice-rules-keep-every-message.test.ts proves own edits and restoration work.
  const RECIPIENT_DOOR_KINDS = ['notice_rules']
  const OPEN_KINDS = RECORD_KINDS.filter(
    (k) =>
      !HUMAN_ONLY_KINDS.includes(k) &&
      !OFFICE_ONLY_KINDS.includes(k) &&
      !WRITER_ONLY_KINDS.includes(k) &&
      !ON_THE_OWNERS_DECISION_KINDS.includes(k) &&
      !RECIPIENT_DOOR_KINDS.includes(k),
  )

  it('keeps personal notice choices behind the recipient’s own door on every generic write', async () => {
    const app = (await apiApp()).app
    try {
      await app.ready()
      const saved = await app.inject({ method: 'PUT', url: '/api/messages/notice-rules',
        headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default' },
        payload: { mutedKinds: [], because: 'Made-up personal choice', ifVersion: null } })
      expect(saved.statusCode, saved.body).toBe(200)
      const record = t.api.getRecord(saved.json().recordId)!
      const before = snapshot(record.id)
      for (const actor of [AGENT, t.api.HUMAN]) {
        const attempts = [
          () => t.api.createRecord({ kind: 'notice_rules', title: 'Made-up duplicate', data: record.data, workspaceId: record.workspaceId, actor }),
          () => t.api.patchRecord(record.id, { dataPatch: { mutedKinds: ['theBroadcastIsDue'] } }, actor),
          () => t.api.deleteRecord(record.id, actor),
          () => t.api.restoreRecord(record.id, actor),
        ]
        for (const attempt of attempts) {
          expect(expectPanelError(t, attempt, 403).message).toContain('Your notice wake rules')
          expect(snapshot(record.id)).toEqual(before)
        }
      }
    } finally { await app.close() }
  })

  for (const kind of OPEN_KINDS) {
    it(`still lets an agent create, change, delete and restore a ${kind}`, () => {
      const record = written(kind)

      t.api.updateRecord(record.id, { summary: 'an agent may say this' }, AGENT)
      // A BLOCK IS TAKEN OUT OF ITS PIPELINE'S ORDER FIRST. `deleteRecord` refuses a block a
      // pipeline still lists, because deleting it there would leave a hole in the order that
      // somebody has to repair by hand. That refusal is a 400 about the order, not a 403 about who
      // may write, so this path files it the way the route does and then deletes it.
      // A PROPOSAL IS THE OTHER EXCEPTION, AND IT IS ABOUT WHO MAY WRITE. Deleting one takes it out
      // of GET /api/needs-you, which is the whole queue of things only a person may answer, so
      // `assertMayRemoveAFork` refuses an agent — while leaving create, change and restore alone,
      // which is what the two lines above and below this block have already used.
      //
      // SETTLING IT NO LONGER MAKES IT DELETABLE, AND THAT CHANGED ON 27 AUGUST 2026. This branch
      // used to have the owner answer the fork and then let the agent delete it, on the guard's old
      // argument that a settled fork takes nothing off the owner's queue. An adversary used that argument:
      // it deleted a fork the owner had settled one request earlier, 200, and the fork and its
      // decision left every fork reading in Mole Office. The owner's settled fork is still their record, so the
      // guard now refuses a fork that is theirs whether or not it has been answered, and the person
      // deletes it — exactly as they do for a planned future in the branch below.
      //
      // WHICH FORK AN AGENT MAY STILL DELETE IS ASSERTED, not described, in the test after this
      // one, so "the guard is narrow" stays a measured fact.
      if (kind === 'proposal') {
        const refusal = expectPanelError(t, () => t.api.deleteRecord(record.id, AGENT), 403)
        expect(refusal.message).toContain('needs-you')
        expect(t.api.getRecord(record.id)?.deletedAt).toBeNull()
        t.api.deleteRecord(record.id, t.api.HUMAN)
      } else if (kind === 'trajectory' || kind === 'planned_state' || kind === 'goal') {
        // A GOAL IS HERE SINCE 16 SEPTEMBER 2026, and it arrived by joining the intended world
        // (`INTENDED_KINDS` in src/shared/world.ts), which rests on a decision. A goal has not
        // happened either, so deleting one takes an intended future out of the project exactly as deleting a trajectory
        // does, and the same guard refuses an agent in the same sentence.
        // Creating, changing and restoring are untouched, which the lines around this block use.
        //
        // THE THIRD EXCEPTION, AND IT IS ALSO ABOUT WHO MAY WRITE. Deleting a planned future or one
        // of its states takes an intended future out of the project with one change row and nothing
        // left behind, so `assertMayShapeTheFuture` refuses an agent — while leaving create, change
        // and RESTORE alone, exactly as the proposal branch above does. Restoring is not refused for
        // the same reason it is not there: it puts the question back in front of the person, which
        // is the direction the whole guard has.
        //
        // Asserted rather than described, so "the guard is narrow" stays a measured fact: the two
        // lines above this block already made an agent create one and change it, and the two lines
        // below restore it.
        const refusal = expectPanelError(t, () => t.api.deleteRecord(record.id, AGENT), 403)
        expect(refusal.message).toContain('take an intended future out of the project')
        expect(t.api.getRecord(record.id)?.deletedAt).toBeNull()
        t.api.deleteRecord(record.id, t.api.HUMAN)
      } else if (kind === 'block') {
        const holder = t.api.pipelineHolding(record.id)
        if (holder !== null) t.blocks.removeBlock(holder.id, record.id, AGENT)
      } else {
        t.api.deleteRecord(record.id, AGENT)
      }
      expect(t.api.getRecord(record.id)?.deletedAt).not.toBeNull()
      expect(t.api.restoreRecord(record.id, AGENT).deletedAt).toBeNull()
    })
  }

  it('still lets an agent delete a fork that was filed as an agent’s and has been answered', () => {
    // THE ONE FORK `assertMayRemoveAFork` LETS GO, ASSERTED SO THAT "THE GUARD IS NARROW" IS A
    // MEASURED FACT. The fork was filed carrying `who_settles_it: an agent`, so it was never in the
    // owner's queue unclassified and nothing is being taken off the owner. It has been answered, so
    // nobody is waiting on it either.
    const fork = t.api.createRecord({
      workspaceId: 'default',
      kind: 'proposal',
      title: 'guard · which timeout on the gripper poll',
      data: {
        question: 'Which timeout on the gripper poll?',
        options: ['a — 200ms', 'b — 500ms'],
        who_settles_it: 'an agent',
      },
      actor: AGENT,
    })
    const decision = t.api.createRecord({
      workspaceId: 'default',
      kind: 'decision',
      title: 'guard · the gripper poll waits 500ms',
      data: { because: 'The bench run timed out at 200ms.', authority: 'a measurement', decided_by: 'claude-code' },
      actor: AGENT,
    })
    t.api.createLink({ fromId: decision.id, toId: fork.id, type: 'derived_from', actor: AGENT })
    t.api.deleteRecord(fork.id, AGENT)
    expect(t.api.getRecord(fork.id)?.deletedAt).not.toBeNull()
  })

  it('refuses an agent the same delete when an agent classified the fork after it was filed', () => {
    // THE ELEVENTH WAY, IN ONE TEST. Same three steps as the test above, with one difference: the
    // fork was filed with nothing said about who settles it, and the agent wrote the classification
    // itself afterwards. That is an agent granting itself the authority, so the classification is
    // not read as permission and every step after it is refused.
    const fork = t.api.createRecord({
      workspaceId: 'default',
      kind: 'proposal',
      title: 'guard · which timeout on the wrist camera poll',
      data: { question: 'Which timeout on the wrist camera poll?', options: ['a — 200ms', 'b — 500ms'] },
      // FILED BY THE PERSON, so that nothing says who settles it. Since 3 September 2026 a fork an
      // AGENT files says `who_settles_it: "an agent"` unless the agent names something else, so an
      // agent can no longer file one nobody has classified. This test is about the classification
      // arriving AFTER the filing, which is still exactly what happens below.
      actor: t.api.HUMAN,
    })
    t.api.updateRecord(
      fork.id,
      {
        data: {
          question: 'Which timeout on the wrist camera poll?',
          options: ['a — 200ms', 'b — 500ms'],
          who_settles_it: 'an agent',
        },
      },
      AGENT,
    )
    const decision = t.api.createRecord({
      workspaceId: 'default',
      kind: 'decision',
      title: 'guard · the wrist camera poll waits 500ms',
      data: { because: 'The bench run timed out at 200ms.', authority: 'a measurement', decided_by: 'claude-code' },
      actor: AGENT,
    })
    const refusedLink = expectPanelError(
      t,
      () => t.api.createLink({ fromId: decision.id, toId: fork.id, type: 'derived_from', actor: AGENT }),
      403,
    )
    expect(refusedLink.message).toContain('an agent wrote that onto the fork AFTER it was filed')
    const refusedDelete = expectPanelError(t, () => t.api.deleteRecord(fork.id, AGENT), 403)
    expect(refusedDelete.message).toContain('needs-you')
    expect(t.api.getRecord(fork.id)?.deletedAt).toBeNull()
  })

  it('lets an agent change a checklist item, which only a module has', () => {
    const module = written('module')
    const result = t.api.patchChecklistItem(module.id, 'mount-1', { state: 'done' }, AGENT)
    expect(result.item.state).toBe('done')
  })

})

// ============================================================ 3. no unguarded write path exists

/**
 * The tripwire for the next one.
 *
 * The two tests above can only check paths somebody thought to list. This one reads the source and
 * finds the writes themselves, so a sixth way to write a record cannot be added without either a
 * guard or a deliberate decision to fail this test and say why.
 *
 * What it does NOT catch, stated so nobody trusts it further than it goes: a write built as a
 * hand-written SQL string through `sqlite.prepare`, and a guard that is present but wrong. Part 1
 * covers the second of those for the kinds the contract declares.
 */
describe('every write to the records table', () => {
  /**
   * LIB/RECORDS.TS AND THE MODULES MOVED OUT OF IT, each read from its top. Wave 13s round 108 (24 October 2026) moved
   * the office's own writes on a run whole into lib/records/run-writes.ts, so this reads every module in lib/records/
   * as well as records.ts, and a guard that moves with its write is still asked for. A module in a folder below
   * lib/records/ is not read here; a write in one is named by the last check in this block.
   */
  const FILES = [
    'records.ts',
    ...readdirSync(fileURLToPath(new URL('../src/server/lib/records/', import.meta.url)))
      .filter((name) => name.endsWith('.ts'))
      .sort()
      .map((name) => `records/${name}`),
  ].map((name) => {
    const path = fileURLToPath(new URL(`../src/server/lib/${name}`, import.meta.url))
    return { name, path, lines: readFileSync(path, 'utf8').split('\n') }
  })

  /** A write through the query builder: db.insert(records), db.update(records), db.delete(records). */
  const WRITE = /\bdb\.(?:insert|update|delete)\(records\)/
  /** The start of a top-level exported function. Everything in these files is written at column 0. */
  const EXPORTED = /^export (?:async )?function (\w+)\s*\(/

  /** Which exported function each write sits in, by walking each file once from the top. */
  function writesByFunction(): Map<string, string[]> {
    const found = new Map<string, string[]>()
    for (const { name, lines } of FILES) {
      let current: string | null = null
      lines.forEach((line, i) => {
        const start = EXPORTED.exec(line)
        if (start?.[1] !== undefined) current = start[1]
        // A closing brace at column 0 ends whatever was open, so a write in a top-level constant or
        // a non-exported helper is attributed to nothing and reported below rather than passed over.
        else if (line === '}') current = null
        if (!WRITE.test(line)) return
        const key = current ?? `<not inside an exported function, ${name}:${i + 1}>`
        found.set(key, [...(found.get(key) ?? []), `${name}:${i + 1}`])
      })
    }
    return found
  }

  it('sits inside a function that consults HUMAN_ONLY_KINDS', () => {
    const writes = writesByFunction()
    expect(writes.size).toBeGreaterThan(0) // the regex still matches something at all

    /** The body of one exported function: from its signature to the next top-level closing brace. */
    function bodyOf(name: string): string {
      const declaring = FILES.filter(({ lines }) => lines.some((line) => EXPORTED.exec(line)?.[1] === name))
      if (declaring.length === 0) throw new Error(`no exported function called ${name} in lib/records.ts or lib/records/`)
      // The writes are keyed by the function's name, so one name in two files would put two functions' writes together.
      if (declaring.length > 1) throw new Error(`${name} is declared in ${declaring.map((f) => f.name).join(' and ')}`)
      const theFile = declaring[0]?.lines ?? []
      const start = theFile.findIndex((line) => EXPORTED.exec(line)?.[1] === name)
      const end = theFile.findIndex((line, i) => i > start && line === '}')
      return theFile.slice(start, end < 0 ? theFile.length : end).join('\n')
    }

    /**
     * A function is guarded if it consults the list itself, or calls the one helper that does.
     *
     * `assertMayWrite` was extracted so the route layer could ask the same question BEFORE its
     * no-op shortcut — an agent restoring an undeleted decision was being answered 200, because
     * the shortcut returned before `restoreRecord`'s guard ran. Extracting it gave the rule and
     * its wording exactly one home.
     *
     * This scanner used to look for the literal `HUMAN_ONLY_KINDS` in a function body, so the
     * extraction read as an unguarded write. Accepting the helper by name keeps the check strict:
     * `assertMayWrite` is itself an exported function in this file, so its own body is scanned by
     * the same rule and must still consult the list. The indirection is one hop and it is named
     * here, rather than the check being loosened to whatever happens to pass. It stays in
     * lib/records.ts when a write moves out to lib/records/.
     */
    const GUARD_HELPER = 'assertMayWrite'
    const guardBody = bodyOf(GUARD_HELPER)
    expect(
      guardBody,
      `${GUARD_HELPER} is what every other write now trusts, so it must consult the list itself`,
    ).toContain('HUMAN_ONLY_KINDS')

    const unguarded = [...writes.keys()].filter(
      (fn) =>
        !fn.startsWith('<') &&
        !bodyOf(fn).includes('HUMAN_ONLY_KINDS') &&
        !bodyOf(fn).includes(GUARD_HELPER),
    )
    expect(unguarded, `these write a record without checking who may write that kind: ${unguarded.join(', ')}`).toEqual(
      [],
    )

    const homeless = [...writes.keys()].filter((fn) => fn.startsWith('<'))
    expect(homeless, `a write nobody can guard: ${homeless.join(', ')}`).toEqual([])
  })


  it('happens nowhere else in the product', () => {
    const roots = ['src', 'scripts'].map((d) => fileURLToPath(new URL(`../${d}`, import.meta.url)))
    const offenders: string[] = []
    for (const root of roots) {
      for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.ts')) continue
        const path = `${entry.parentPath}/${entry.name}`
        if (FILES.some((file) => file.path === path)) continue
        if (WRITE.test(readFileSync(path, 'utf8'))) offenders.push(path)
      }
    }
    // lib/records.ts, with the modules moved out of it into lib/records/, is the one door. A write
    // anywhere else would be outside the guard and outside the change log, which is the same defect twice.
    expect(offenders).toEqual([])
  })
})
