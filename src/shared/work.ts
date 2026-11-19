// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * What a state WORD means, what a consequence is, what a pause is, and what a gate is.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office has many record kinds and several separate state vocabularies. Until now nothing
 * said what any of those words MEANT, so every reader invented its own answer: the alarm panel
 * hard-coded six conditions, the module page counted five item states, and a purchase in a state
 * nobody had thought about was silently treated as fine.
 *
 * This file is the one place that classifies a state word. Everything that needs to know whether
 * work has stopped short of finishing asks here, and a word this file has never heard of comes
 * back as `unclassified` — which is a visible answer that puts the record in front of a person,
 * not a quiet no.
 *
 * ---------------------------------------------------------------------------------------
 * THE THINGS THIS FILE DEFINES, AND WHY EACH IS DATA RATHER THAN A GUESS
 * ---------------------------------------------------------------------------------------
 *
 * 1. PROGRESS — what a state word says about whether work stopped short. Selected by a table, not
 *    by reading prose. A word that is not in the table is `unclassified` and says so.
 *
 * 2. CONSEQUENCE — who gets hurt if nothing is done. STORED, never inferred from a title. The
 *    measurement that led here found a software emergency stop that does nothing, filed three
 *    times, reaching no screen; every rule that ranked it well did so by accident, because
 *    nothing in the data said a person could be hurt. A title is not evidence. One stored word is.
 *
 * 3. PAUSE — a deliberate postponement, with the reason kept and, where there is one, the
 *    condition that should end it. A paused thing has NOT stopped short; it is waiting on purpose.
 *    Without this, "stopped short" cannot tell the difference between work that fell over and work
 *    somebody consciously put down, and a list that cannot tell those apart stops being read.
 *
 * 4. GATES — A must finish before B can proceed (hard), or B may proceed only as far as a named
 *    stage until A finishes (partial). These ride on the EXISTING `blocks` link rather than
 *    becoming a second dependency system — including the order inside a pipeline, whose blocks are
 *    records and wait on each other through the same link every other dependency uses.
 *
 * 5. FULFILMENT — reading whether an obligation has been discharged. NOTE: the mechanism already
 *    existed. `data.done` has been declared in kinds.ts and read by the alarm panel all along; it
 *    was simply never written by anything, so every obligation looked permanent. What is added
 *    here is `fulfilledAt`, and one reader both sides can share.
 *
 * 6. WHEN AN OBLIGATION COMES DUE — a date, a stated condition, or another record finishing. The
 *    same three ways a pause can end, in the same shape, because it is the same idea; and the
 *    lateness reader answers `null` rather than inventing a deadline for the two that have none.
 *
 * 7. WHY SOMETHING WAS PUT DOWN, wherever the reason was written. One reader with one per-kind
 *    exception, which is declared and argued rather than tidied away.
 *
 * NOT HERE, AND DELIBERATELY: a direction's DEPTH, and a record's ORIGIN. Both are ladders with
 * their own meanings, both are read by their own readers in `./types.ts` beside the words
 * themselves, and neither may enter `STATE_MEANING` — putting the depth ladder in there once
 * already gave `measured` two opposite meanings. See the note above that table.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE THAT SELECTS FOR THE ATTENTION LIST
 * ---------------------------------------------------------------------------------------
 *
 *     A thing needs attention when it is OWED to somebody outside this project,
 *     or when its own recorded state says the work STOPPED SHORT of finishing.
 *
 * Paused things are excluded by the second half — that is the whole point of pause. Unclassified
 * things are excluded from the ranked list but reported as their own visible group, because
 * "nobody has said what this word means" is a question for a person and not a verdict.
 *
 * The ranking lives in `attention.ts`, which imports this. This file answers WHAT A THING IS;
 * that file answers WHICH MATTERS MOST.
 */

/**
 * TYPE ONLY, AND THAT IS WHAT KEEPS THE TWO FILES FROM IMPORTING EACH OTHER AT RUN TIME.
 *
 * ./types.ts already imports `Consequence`, `Gate` and `Pause` from this file, also as a type. Both
 * imports are erased before anything runs, so neither file loads the other and there is no cycle.
 * Reaching for a VALUE out of ./types.ts here — `RECORD_KINDS`, say — would make a real one.
 * `PLAN_HOURS_BY_KIND` below is exhaustive over `RecordKind` through the type alone.
 */
import type { RecordKind } from './types.ts'
import { mainSuiteFixSchema } from './main-suite-fix.ts'
import type { MoveActor } from './kinds.ts'
import { storedWordIfDeclared } from './stored-word-reader.ts'

// ============================================================================ progress

/**
 * What a state word says about whether the work stopped short of finishing.
 *
 * These six are exhaustive over what a state word can mean, and the difference between the last
 * two is the one that matters most:
 *
 *   `unknown`      — RECORDED as undetermined. A person or an adapter looked and could not tell.
 *                    A judgement, and an honest one.
 *   `unclassified` — nobody has ever said what this word means. An absence of a judgement.
 *
 * Collapsing those two would turn a question into an answer, which is the failure this whole
 * exercise exists to remove.
 */
export const PROGRESS = [
  /** Work that has not begun. Nothing has stopped, because nothing started. */
  'not_started',
  /** Work under way right now. Somebody is on it. */
  'in_flight',
  /** Work that began and did not finish: it failed, it is blocked, it fell over, it was left. */
  'stopped_short',
  /** Work that reached its end. */
  'finished',
  /** Deliberately put down, with a reason. See `Pause`. Not a failure. */
  'paused',
  /** Recorded as genuinely undetermined. Never guessed at. */
  'unknown',
  /** Nobody has said what this state word means. Surfaced as a question, never as a no. */
  'unclassified',
] as const
export type Progress = (typeof PROGRESS)[number]

/**
 * Every state word Mole Office understands, and what each means.
 *
 * ONE TABLE, DELIBERATELY FLAT. It is keyed by the word alone and not by kind-then-word, because
 * the same word must not mean two things in one product: if `open` meant "not started" on a
 * problem and "finished" on a purchase, no reader could be written and no person could learn it.
 * Where a kind needs a distinction this table cannot make, the kind needs a different word.
 *
 * ADDING A KIND MEANS ADDING ITS WORDS HERE. That is the whole cost, and it is deliberate: a kind
 * whose words are not classified will report `unclassified` on every record, loudly, until
 * somebody says what they mean. The alternative — defaulting to "fine" — is how a purchase in
 * state `chasing` was passed over silently.
 *
 * ---------------------------------------------------------------------------------------
 * ONLY A `state` FIELD IS READ HERE, AND A DIRECTION'S DEPTH IS NOT ONE
 * ---------------------------------------------------------------------------------------
 *
 * `progressOf` is only ever given a record's `state` — see its callers in `attention.ts`,
 * `RecordsPage.tsx` and the graph model. A direction does not have one. It records how far it has
 * been taken in `depth`, on a six-rung ladder whose rungs are `noticed`, `read`, `ran`, `measured`,
 * `integrated` and `defended`, and those rungs have their own meanings in `DIRECTION_DEPTH_MEANINGS`
 * in kinds.ts.
 *
 * Those six words WERE in this table, classified as if they were state words. That put one word in
 * here twice over. `measured` is level four of the direction ladder, where it means the work is
 * still going; `measured` is also a claim's word, where it means the measurement has been taken and
 * the work is done. Two opposite meanings for one word is exactly what this table is flat to
 * prevent.
 *
 * It was resolved by removing the six depth rungs, on 2026-08-10, for three measured reasons.
 *
 *   1. No kind declares a `state` field that takes a depth word, so a depth could never arrive
 *      here through the only reader.
 *   2. In the live corpus of 229 records, all eleven directions store `depth` and none stores
 *      `state`, while the only records storing `measured` as a state word are eight claims. So the
 *      entry that said "measured means work in flight" was, in practice, only ever applied to
 *      claims — and it told every screen the opposite of what those claims said.
 *   3. Nothing had to change in stored data: no record's stored word changes meaning, because no
 *      record stores a depth as a state.
 *
 * If a depth is ever handed to this table it comes back `unclassified`, which is a question for a
 * person rather than a wrong answer. Classifying the ladder here again would put the collision back.
 */
export const STATE_MEANING: Readonly<Record<string, Progress>> = {
  // ---- checklist items and tasks (ITEM_STATES)
  todo: 'not_started',
  doing: 'in_flight',
  done: 'finished',
  failed: 'stopped_short',
  blocked: 'stopped_short',

  // ---- sessions (SESSION_STATES)
  running: 'in_flight',
  /** Alive but silent. Usually waiting on the operator, which is why it must not read as busy. */
  idle: 'stopped_short',
  finished: 'finished',
  crashed: 'stopped_short',
  /** Ended without saying so and left something running. */
  orphaned: 'stopped_short',
  unknown: 'unknown',

  // ---- problems (PROBLEM_STATES)
  //
  // Four declared words, and only `open` says the problem is still costing something with nothing
  // done about it. The other three are the three ways a problem stops being live, so all three are
  // `finished`. `closed` is not declared by any kind and is kept for records written before the
  // vocabulary existed.
  //
  // `fixed` — the cause was removed. Nothing about this one is arguable.
  //
  // `worked_around` — the cause is still there and the work goes past it. It is `finished` because
  // the problem has reached the end somebody chose for it, and there is a real alternative reading:
  // you could call it `stopped_short` on the ground that nobody ever fixed the cause. That reading
  // was not taken for two reasons. It would put every workaround this lab has ever adopted on the
  // list of things that need a person today, permanently, with nothing to do about any of them. And
  // it would leave no way at all to record "this is handled, and here is how" — you would have to
  // leave the problem `open`, which says the opposite. A workaround somebody genuinely means to
  // replace stays `open` with the workaround written in `fix`.
  //
  // `accepted` — THIS ONE IS A JUDGEMENT AND THE READING IS WRITTEN DOWN SO IT CAN BE ARGUED WITH.
  // Read beside `fixed` and `worked_around` it means "we have decided to live with this", and a
  // decision to live with something is a decision rather than an unfinished job. So: `finished`.
  // The competing reading is that an accepted problem is still doing damage and somebody should go
  // on being reminded of it, which would make it `stopped_short`. That was rejected because it
  // makes the word useless: `accepted` would then say exactly what `open` says, and a four-word
  // vocabulary carrying two spellings of one answer is a vocabulary that gets typed at random.
  // "Live with it for now and look again later" is a different fact and already has a home — it is
  // `paused`, which is a field on a problem and carries the reason and the condition that ends it.
  open: 'stopped_short',
  closed: 'finished',
  fixed: 'finished',
  worked_around: 'finished',
  accepted: 'finished',

  // ---- obligations
  fulfilled: 'finished',
  cancelled: 'finished',

  // ---- goals (GOAL_STATES)
  //
  // `open` and `dropped` are already above and mean the same thing here, which is the flat table
  // doing its job: an open goal is `stopped_short` for the same reason an open problem is — it has
  // not reached an end and somebody should be reminded of it — and a dropped goal is `finished` for
  // the reason `cancelled` is. `met` is the one new word: what the goal said became true, so the
  // work reached the end somebody chose for it. It is deliberately not `in_flight`: the sentence is
  // true or it is not, and whether anybody is still busy around it is a different fact.
  met: 'finished',

  // ---- incidents (INCIDENT_STATES)
  //
  // Three new words, in the order corrective work moves through them, criterion I2. The other two
  // words the ladder uses are already classified above and mean the same thing here: `open` is
  // `stopped_short`, the loss named and nothing decided yet, the same reading a problem's `open`
  // gets; and `closed` is `finished`, the person's or a secretary's word that the corrective
  // decisions are done (criterion I7), the same end a problem reaches.
  //
  // `investigating` — the scene is being reconstructed and the causes worked out. Work is under
  // way: `in_flight`.
  //
  // `corrected` — the corrective actions exist, but the verification has not been shown to hold
  // yet. Still moving: `in_flight`. The competing reading is `stopped_short` — nothing is verified
  // — but that would put a corrected incident on the same footing as an open one, and the ladder
  // word says the correction has been made. When the correction is later found not to hold, the
  // state moves back, and the word moves with it.
  //
  // `verified` — the fix has been shown to hold, which is what I1's verification field records.
  // `finished`, because what remains is only the closing line, which is a record-keeping act and
  // not work (criterion I7).
  investigating: 'in_flight',
  corrected: 'in_flight',
  verified: 'finished',

  // ---- deliberate postponement, on any kind
  paused: 'paused',
  deferred: 'paused',

  // ---- claims (CLAIM_STATES)
  //
  // A claim is a result that could be wrong, so its three words are about the MEASUREMENT, not
  // about somebody being busy.
  //
  // `proposed` — believed, and nothing has been measured. Nothing has stopped, because the
  // measuring never started. It is not `in_flight`: a claim can sit proposed for months with
  // nobody on it, and saying "somebody is on it right now" would be a guess about a person.
  //
  // `measured` — there are numbers. The measuring reached its end, which is what `finished` means.
  // Read the note above this table for why this word is here once and not twice.
  //
  // `retracted` — withdrawn, with `retracted_because` required to say why. It is `finished` for the
  // same reason `cancelled` is on an obligation: it has reached its end and nobody owes it anything
  // more. It is deliberately NOT `stopped_short`, which would put every retraction on the attention
  // list for ever with nothing to do about it. What a retraction breaks is the work that CONSUMED
  // the claim, and that is a question about those records, asked by `GET /api/queries/unmet`.
  proposed: 'not_started',
  measured: 'finished',
  retracted: 'finished',

  // ---- purchases (PURCHASE_STATES)
  //
  // `cancelled` is already above, on the obligation line, and means the same thing here. That is
  // the flat table doing its job: one word, one meaning, wherever it is written.
  //
  // `wanted` — somebody has said the lab needs it and nobody has bought it. The buying has not
  // begun, so nothing has stopped short. This is `todo` with a price on it.
  //
  // `ordered` — it is bought and it is on its way. `in_flight` is about the work, not about a
  // person being busy, and money that has left the account is work in progress.
  //
  // `arrived` — it is on the bench, which is the whole of what a purchase is for. What the thing
  // is then USED for is other records; this one is over.
  wanted: 'not_started',
  ordered: 'in_flight',
  arrived: 'finished',

  // ---- ideas (IDEA_STATES)
  //
  // `new` — written down and not picked up. Nothing has stopped, because nothing started.
  //
  // `active` — somebody is working on it now.
  //
  // `parked` — put down on purpose, which is exactly what `paused` means, so it reads the same as
  // `paused` and `deferred` above. ONE THING IS WORTH KNOWING ABOUT THIS: an `idea` is not one of
  // the kinds that carry the `paused` field, so `readPause` finds nothing on it and the attention
  // reply reports a parked idea as paused with no reason recorded — while the reason is sitting in
  // its `parked_because`. The classification is still right and the misread sentence is a separate
  // defect; it is reported rather than fixed here, because both halves of it are in files this
  // change does not own.
  //
  // `dropped` — decided against. `finished` for the same reason `cancelled` and `retracted` are:
  // it has reached its end and nobody owes it anything more. Calling it `stopped_short` would put
  // every idea this project has ever turned down in front of a person for ever, which is the
  // failure that empties the list of readers.
  new: 'not_started',
  active: 'in_flight',
  parked: 'paused',
  dropped: 'finished',

  // ---- modules (MODULE_STATES)
  //
  // A module's lifecycle answers ONE question — what is our posture toward this subsystem right now
  // — and it is coarse on purpose. It does not say how much of the module is done, which part is
  // done, what might replace it one day, or that somebody has had an idea about it. Those are four
  // other facts and every one of them already has a home: the checklist in `parts`, the items inside
  // it, an `idea`, a `direction`. A lifecycle word that tried to carry any of them would be a
  // second, coarser copy of a count that is computed from the items, which is the defect this
  // codebase keeps producing.
  //
  // TWO OF THE FOUR WORDS WERE ALREADY IN THIS TABLE, AND THAT IS WHY THEY WERE CHOSEN. `active` on
  // a module means what `active` means on an idea: somebody is working on it now. `paused` on a
  // module means what `paused` means anywhere: put down on purpose, with the reason in the `paused`
  // block. Neither is a collision. A COLLISION IS ONE WORD WITH TWO MEANINGS, not one word used by
  // two kinds — the table is flat precisely so that a word can be shared when the meaning really is
  // shared. Had `stable` or `retired` needed a meaning some other kind's copy of the same word could
  // not have, the MODULE would have needed a different word; this table would not have been made
  // kind-scoped.
  //
  // `stable` — the implementation that exists is sufficient for what is being done with it now. It
  // is `finished` because the work on it reached the end somebody chose for it. IT IS NOT A CLAIM
  // THAT THE SUBSYSTEM CAN NEVER CHANGE: a stable module that needs work again is set back to
  // `active`, and nothing about the word or this classification stands in the way of that. The
  // competing reading — that a subsystem is never finished, so `stable` is `in_flight` — was
  // rejected because it would leave every module in the product on the list of things that need a
  // person today, permanently, with nothing to do about any of them.
  //
  // `retired` — it is out of use. `finished`, for the reason `cancelled`, `dropped` and `retracted`
  // are: it has reached its end and nobody owes it anything more. The record is kept rather than
  // deleted, so that what depended on it is still findable.
  stable: 'finished',
  retired: 'finished',

  // ---- notes somebody left on something (ANNOTATION_STATES)
  //
  // THE SAME THREE WORDS A COMMENT TO AN AGENT ALREADY USES, and they entered this table when
  // `annotation` became a record kind: a record kind's state words are read by `progressOf` like
  // every other kind's, and a word this product invented that came back `unclassified` would be an
  // absurd answer about a vocabulary the schema itself hands out.
  //
  // `queued` — written, and not sent to anybody. Nothing has begun, so `not_started`. It is the one
  // state in which the words may still be changed.
  //
  // `sent` — it has gone to somebody. `in_flight`: it is out, and whether anything comes back is
  // not this word's business.
  //
  // `answered` — somebody dealt with it. `finished`, and the annotation stays exactly as readable
  // as it was; nothing is hidden by having been answered.
  //
  // NONE OF THE THREE IS `stopped_short`, AND THAT IS THE POINT RATHER THAN AN OVERSIGHT. The
  // attention rule puts a record in front of a person when it is owed outside the project or when
  // its own state says the work stopped short. A remark somebody left on a paragraph is not work
  // and must never fill the list of what needs a person today; the work a remark asks for is its
  // own record, and that record is what the list is for.
  queued: 'not_started',
  sent: 'in_flight',
  answered: 'finished',

  // ---- where a comment to an agent has got to (MESSAGE_STATES, src/server/lib/dispatch.ts)
  //
  // THREE MORE WORDS ARRIVED WHEN THE DISPATCH LIFECYCLE BECAME ONE COLUMN. `queued` and `sent`
  // above are two of the six and mean here exactly what they mean above; `failed` is already in
  // this table under checklist items and means the same thing again. These are the other three.
  //
  // `delivered` — a live listener or a claiming worker has been handed it. `in_flight`, beside
  // `sent`: it is out and nothing has come back.
  //
  // `picked_up` — the receiving agent said, by id, that it has it. `in_flight` for the same reason.
  // It is a further step and not a different answer to "did the work stop short".
  //
  // `handled` — the receiving agent said what it did with it. `finished`, which is what `answered`
  // above says, because it is the same event under the word that replaced it.
  //
  // NONE OF THE THREE IS `stopped_short`, for the reason written above the three before them: a
  // comment is not work, and the work a comment asks for is its own record.
  delivered: 'in_flight',
  picked_up: 'in_flight',
  handled: 'finished',

  // ---- merge entries (MERGE_STATES in ./merge-queue.ts), sandbox v1 piece P6
  //
  // Twelve words, none of them already in this table. Eight are the queue carrying the entry
  // forward — pinning it, waiting on the inspector's release, waiting for its lane, putting it on
  // top of the main world, waiting for its own supervisor to resolve a conflict, checking again what
  // that changed, testing it, and landing it — so all eight are `in_flight`, `submitted` included:
  // nobody has to be reminded of an entry the office is carrying. `resolving` is the one of them
  // that waits on a supervisor, and it is `in_flight` too: the design of tier 2 has the office ask
  // that supervisor, and bounce the entry when its time to resolve ends.
  //
  // `merged` — it is in the main world: `finished`. `withdrawn` and `superseded` are `finished` for
  // the reason `cancelled` and `dropped` are: the entry reached an end somebody chose, and the work
  // it carried is either not wanted or carried by a newer entry.
  //
  // `bounced` — IS `stopped_short`, AND IT IS THE ONE WORD HERE THAT ASKS FOR SOMEBODY. The office
  // sent it back to its submitter for a conflict, a guard, a red test, a refusal or churn, and
  // nothing moves until the submitter fixes it and submits again. That is what `open` on a problem
  // says, and it is read the same way.
  submitted: 'in_flight',
  pinned: 'in_flight',
  judged: 'in_flight',
  integrating: 'in_flight',
  resolving: 'in_flight',
  reinspecting: 'in_flight',
  testing: 'in_flight',
  landing: 'in_flight',
  merged: 'finished',
  bounced: 'stopped_short',
  withdrawn: 'finished',
  superseded: 'finished',

  // ---- an emergency push to main (EMERGENCY_PUSH_STATES in ./emergency-push.ts), wave 13u round 82
  //
  // `stopped` — main stayed where it was and nothing was pushed: the push began and did not finish.
  pushing: 'in_flight',
  pushed: 'finished',
  stopped: 'stopped_short',

  // ---- toolset catalogue entries (TOOL_STATES in ./toolset.ts)
  //
  // Two words, neither already in this table. `built` — a file or a door does what the entry says:
  // `finished`. `not built yet` — the tool is planned and nobody has built it: `not_started`, which
  // says nothing began, rather than `stopped_short`, which would say somebody started and stopped.
  built: 'finished',
  'not built yet': 'not_started',

  // ---- checklist items, with CHECKLIST_ITEM_STATES in ./checklists.ts
  //
  // Five words. `open`, `done` and `superseded` are already here and mean the same on an item: open
  // work nobody has finished, finished with evidence, and ended by a later message. Two are new.
  // `in progress` — somebody is doing it: `in_flight`. `waiting on the owner` — nothing moves until the
  // owner answers, which is what `bounced` and `open` on a problem say: `stopped_short`.
  'in progress': 'in_flight',
  'waiting on the owner': 'stopped_short',

  // ---- bookings of the host GPU, with BOOKING_STATES in ./bookings.ts
  //
  // Four words. `running` and `cancelled` are already here and mean the same on a booking: its program is
  // on the card now, and it was called off before it ended. Two are new. `waiting` — its time has not
  // come and nothing of it has begun: `not_started`, as `queued` is. `ended` — its program ended, which is
  // the end a booking is for: `finished`.
  waiting: 'not_started',
  ended: 'finished',

  // ---- a request to go first, on a booking (GO_FIRST_STATES in ./bookings.ts)
  //
  // Four new words. `asked` — nobody has answered yet and nothing has moved: `not_started`, as `queued`
  // is; it is not `stopped_short`, because a request a few minutes old is not a job left undone.
  // `granted`, `refused` and `lapsed` — each is an end the request reached: answered yes, answered no, or
  // overtaken when the applicant's own turn came. All three are `finished`, as `retracted` is: nobody owes
  // the request anything more.
  asked: 'not_started',
  granted: 'finished',
  refused: 'finished',
  lapsed: 'finished',

  // ---- an ask the office keeps on a run: a next round, and a worker run (src/shared/next-round.ts and
  // src/shared/worker-runs.ts), wave 13j rounds loop-2 and loop-3
  //
  // Four words. `wanted` and `failed` are already here and mean the same on an ask: nothing has begun yet,
  // and it stopped before it started anything. Two are new. `starting` — the message worker filed its
  // launcher run and the launcher is going: `in_flight`. `started` — the launcher filed the run that was
  // asked for, and the office minted its key: `finished`, because that is the end the ask is for. The run
  // it started is a record of its own, with its own state.
  starting: 'in_flight',
  started: 'finished',
  // Main-suite dispatch and verification progress. Completion here says only that verification answered.
  planned: 'not_started',
  attempted: 'in_flight',
  complete: 'finished',
  unavailable: 'stopped_short',

  // ---- a first handoff to the stable checkout (StableBootstrapOutcome in ./stable-bootstrap-notices.ts)
  //
  // Three new words. `refused` is already here and means the same on a first handoff: an end reached
  // before anything was published. `handed-off` — the stable checkout serves, and its receipt and serving
  // identity were verified: `finished`. `failed-restored` — the handoff failed and the development office
  // was restored and verified: `stopped_short`, because the handoff did not happen and another attempt
  // needs fresh preparation and fresh words from the owner. `not-restored` — restoration was not verified:
  // `stopped_short`, and the one of the three that needs a person first.
  'handed-off': 'finished',
  'failed-restored': 'stopped_short',
  'not-restored': 'stopped_short',

  // ---- a move of the data folder (DataFolderMoveOutcome in ./stable-bootstrap-notices.ts)
  //
  // Two new words. `refused` and `not-restored` are already here and mean the same on a move: an end
  // reached before the stop, and a restoration nobody verified. `moved` — the database answers from the
  // target folder and its keys matched by hash: `finished`. `restored` — the move failed and the original
  // folder was put back and verified: `stopped_short`, as `failed-restored` is above, because the folder
  // did not move and the owner's act is reserved once, so another attempt needs a fresh act.
  moved: 'finished',
  restored: 'stopped_short',

  // ---- a host job (HOST_JOB_STATES in ./host-jobs.ts)
  //
  // Three new words. `asked`, `running` and `finished` are already here and mean the same on a job: no runner has
  // taken it, the tool is going, and the tool ended by itself. The three new words are each a way the tool did not
  // do what was asked, so all three are `stopped_short`. `ended at its time limit` — the runner ended the tool's
  // group when its time ran out. `could not start` — the runner refused it or it failed to start, and the record says
  // why. `lost` — the runner found a job it had taken with no result, so nobody knows how the tool ended.
  'ended at its time limit': 'stopped_short',
  'could not start': 'stopped_short',
  lost: 'stopped_short',

  // ---- handbooks (HANDBOOK_STATES in ./handbooks.ts)
  //
  // Two new words. `retired` is already here and means what it means on a module: out of use, and kept
  // so that what depended on it is still findable. `draft` — being written, and sent to nobody:
  // `not_started`, for the reason `queued` is on an annotation. It is not `in_flight`, because a draft can
  // sit for months with nobody writing it. `in use` — the office sends it to whoever starts its flow or
  // takes its card: `finished`, for the reason `stable` is on a module. The writing reached the end
  // somebody chose, and the sending that goes on is not work anybody owes.
  draft: 'not_started',
  'in use': 'finished',
}

/**
 * What a state word means, or `unclassified` when nobody has said.
 *
 * `null` and `undefined` come back as `null` rather than as a Progress, because "this record has
 * no state at all" is a third thing, different from both a classified word and an unclassified
 * one. Nine of sixty sessions in the test corpus are like that, and a reader that turns them into
 * a default loses them.
 */
export function progressOf(state: unknown): Progress | null {
  if (typeof state !== 'string') return null
  const word = state.trim().toLowerCase()
  if (word === '') return null
  return STATE_MEANING[word] ?? 'unclassified'
}

export type WorkStateSource = 'stored' | 'derived from mainSuiteFix'

/**
 * The explicit state, or the authoritative main-suite repair outcome when state is absent.
 * A queued take-out is still open. Only an actually returned change is worked around, and
 * only a verified repair is fixed. Invalid namespaces supply no state. This never changes data.
 */
export function readWorkState(data: unknown): { state: unknown; source: WorkStateSource | null } {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return { state: undefined, source: null }
  const bag = data as Record<string, unknown>
  if (Object.hasOwn(bag, 'state')) return { state: bag['state'], source: 'stored' }
  if (bag['mainSuiteFix'] === undefined) return { state: undefined, source: null }
  const parsed = mainSuiteFixSchema.safeParse(bag['mainSuiteFix'])
  if (!parsed.success) return { state: undefined, source: null }
  const outcome = parsed.data.outcome
  const state = outcome && 'fixed' in outcome ? 'fixed' : outcome && 'returned' in outcome ? 'worked_around' : 'open'
  return { state, source: 'derived from mainSuiteFix' }
}

/** The canonical work word. Stored-state audits read data.state instead. */
export function stateOfWork(data: unknown): unknown {
  return readWorkState(data).state
}

/**
 * WHETHER A RECORD'S OWN STATE WORD SAYS ITS WORK HAS ENDED.
 *
 * Asked of the record's `data`. It reads `stateOfWork` through `progressOf`, so a word a state
 * chip draws as finished is ended here too. A record with no state, or a state nobody classified,
 * has not ended. The waiting list, the open-loops reader and the side card on a record page all ask
 * this one function.
 */
export function theWorkHasEnded(data: unknown): boolean {
  return progressOf(stateOfWork(data)) === 'finished'
}

/**
 * WHOSE MOVE IT IS NOW, read from a record's `data`.
 *
 * `ended` when the work has ended, whatever `whose_move` holds: once a problem is closed, nobody has a
 * move on it. The stored `whose_move` is kept as it is, so a reopened record reads it again. While
 * the work is live, the answer is the stored word when it is one of the three, and null when nobody
 * has said or the stored value is not one of the three.
 */
export function whoseMoveNow(data: unknown): MoveActor | 'ended' | null {
  if (theWorkHasEnded(data)) return 'ended'
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
  const stored = (data as Record<string, unknown>)['whose_move']
  return stored === 'person' || stored === 'agent' || stored === 'either' ? stored : null
}

/** Did the work begin and not finish? The second half of the attention rule. */
export function stoppedShort(state: unknown): boolean {
  return progressOf(state) === 'stopped_short'
}

/**
 * The sentence to print when a state word is not classified.
 *
 * Written here so every surface says the same thing, and phrased as a gap in the record rather
 * than as a fault of the reader — because it is one.
 */
export function unclassifiedNote(state: string): string {
  return `the meaning of the state "${state}" is not recorded, so Mole Office cannot tell whether this stopped short`
}

// ============================================================================ consequence

/**
 * Who is hurt if this is left alone, worst first.
 *
 * STORED, NEVER INFERRED. The whole reason this vocabulary exists is that the measurement found a
 * safety-critical record that no rule could rank properly, because ranking it would have meant
 * reading its title. A rule that reads titles is a rule that can be fooled by a title.
 */
export const CONSEQUENCE_BEARERS = [
  /** Somebody could be physically hurt. The rig moves; this is not hypothetical. */
  'person',
  /** A person or body outside this project is waiting and will be let down. */
  'outside',
  /** Money, hardware or data is at risk. */
  'property',
  /** Other recorded work depends on this and is wrong or stuck without it. */
  'dependent',
  /** Only the owner's own plans. */
  'owner',
  /** Nothing follows from leaving it. Worth recording: it is what makes a list shorter honestly. */
  'none',
] as const
export type ConsequenceBearer = (typeof CONSEQUENCE_BEARERS)[number]

/** What goes wrong if nothing is done, and who it happens to. */
export interface Consequence {
  bearer: ConsequenceBearer
  /** One sentence, in the author's words. Shown on the row; it is why the row is worth reading. */
  what: string
}

/**
 * Safety is `bearer: 'person'` and nothing else.
 *
 * A safety item MUST NOT lose its place because it is new. Every age-based ranking punishes a
 * record filed this morning, and the measurement showed exactly that: the same dangerous problem
 * filed today ranked 48th where the three-week-old one ranked 31st. `attention.ts` gives anything
 * that answers true here a rank floor that age cannot move.
 */
export function isSafety(c: Consequence | null | undefined): boolean {
  return c?.bearer === 'person'
}

export function readConsequence(data: unknown): Consequence | null {
  if (data === null || typeof data !== 'object') return null
  const raw = (data as Record<string, unknown>)['consequence']
  if (raw === null || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const bearer = obj['bearer']
  const what = obj['what']
  if (typeof bearer !== 'string' || !CONSEQUENCE_BEARERS.includes(bearer as ConsequenceBearer)) return null
  if (typeof what !== 'string' || what.trim() === '') return null
  return { bearer: bearer as ConsequenceBearer, what: what.trim() }
}

// ============================================================================ pause

/**
 * A deliberate postponement.
 *
 * Three fields, and the third is the one that makes a pause different from forgetting:
 *
 *   since  — when it was put down
 *   why    — the reason, in the author's words. A pause with no reason is indistinguishable from
 *            abandonment six weeks later, so the reason is required.
 *   until  — what should bring it back: a date, or a condition in words, or the record whose
 *            finishing should resume it. Optional, because "not now, no idea when" is honest and
 *            common; when it is absent the pause is reported as open-ended rather than hidden.
 */
export interface Pause {
  since: string
  why: string
  until?: {
    /** A stored stamp. The pause ends on this date. */
    date?: string
    /** In words, when the condition is not something Mole Office can check. */
    condition?: string
    /** The record whose finishing should end this pause. Checkable, and preferred. */
    recordId?: string
  }
}

export function readPause(data: unknown): Pause | null {
  if (data === null || typeof data !== 'object') return null
  const raw = (data as Record<string, unknown>)['paused']
  if (raw === null || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const since = obj['since']
  const why = obj['why']
  if (typeof since !== 'string' || since.trim() === '') return null
  if (typeof why !== 'string' || why.trim() === '') return null
  const pause: Pause = { since: since.trim(), why: why.trim() }
  const until = obj['until']
  if (until !== null && typeof until === 'object') {
    const u = until as Record<string, unknown>
    const out: NonNullable<Pause['until']> = {}
    if (typeof u['date'] === 'string' && u['date'].trim() !== '') out.date = u['date'].trim()
    if (typeof u['condition'] === 'string' && u['condition'].trim() !== '') out.condition = u['condition'].trim()
    if (typeof u['recordId'] === 'string' && u['recordId'].trim() !== '') out.recordId = u['recordId'].trim()
    if (Object.keys(out).length > 0) pause.until = out
  }
  return pause
}

/**
 * Is this pause over?
 *
 * Returns null when Mole Office cannot tell — an open-ended pause, or one whose condition is prose.
 * Null is not "no". A caller showing paused work says which of the three it is, so an open-ended
 * pause is visible as open-ended rather than looking like one that is still waiting on something.
 */
export function pauseElapsed(pause: Pause, nowMs: number, dueMs: (stamp: string) => number | null): boolean | null {
  const date = pause.until?.date
  if (date !== undefined) {
    const ms = dueMs(date)
    if (ms === null) return null
    return nowMs >= ms
  }
  return null
}

/**
 * WHETHER A PIECE OF WORK HAS STOPPED SHORT: its state word means `stopped_short` (blocked, failed and the like) and
 * no live pause holds it. A pause whose date has passed is not live. A pause with no date, or one Mole Office cannot
 * read, still holds: nobody can tell it has ended.
 *
 * The attention list and the project board both ask this one function, so a step the board calls stalled is one the
 * attention list would raise, and the two cannot drift.
 */
export function theWorkHasStoppedShort(data: unknown, nowMs: number, dueMs: (stamp: string) => number | null): boolean {
  const progress = progressOf(stateOfWork(data))
  if (progress !== 'stopped_short') return false
  const pause = readPause(data)
  if (pause === null) return true
  return pauseElapsed(pause, nowMs, dueMs) === true
}

// ------------------------------------------------------ why it was put down, wherever that is kept

/** Why a record was put down, and which field said so. */
export interface PutDownReason {
  why: string
  /**
   * The field it came out of, addressed the way a caller would — `paused.why`, `parked_because`.
   * A reader that shows the reason can then say where to go and change it.
   */
  from: 'paused.why' | 'parked_because'
}

/**
 * ---------------------------------------------------------------------------------------
 * ONE PER-KIND EXCEPTION, DECLARED AS DATA, AND IT IS DELIBERATE — DO NOT TIDY IT AWAY
 * ---------------------------------------------------------------------------------------
 *
 * An `idea` in state `parked` keeps its reason in `parked_because`, and that field is CANONICAL for
 * that kind. It is not an untidy duplicate of `Pause.why` and it is not waiting to be migrated into
 * one. The next reader who notices that this file has one shape for "put down on purpose" and one
 * kind that does it differently will want to fold the two together; this comment is here to say
 * that the difference was measured and chosen.
 *
 * WHY AN IDEA IS DIFFERENT. `Pause` requires `since` — the date it was put down — and that
 * requirement is what makes an old pause visible as an old one, which a bare flag cannot do. An idea
 * that was never picked up has no such date, because nothing ever started. Giving it one would mean
 * inventing a stamp, and a stamp nobody wrote is the guess this product refuses. Making `since`
 * optional instead would weaken the field on the eight kinds where it is doing real work, to
 * accommodate the one kind where it cannot apply.
 *
 * WHAT THIS IS NOT. It is not a licence for per-kind spellings in general, and it is not a second
 * general mechanism: `readPause` still reads `data.paused` and nothing else, on every kind. This is
 * a one-entry table with a reason written against it, and a second entry needs the same argument
 * made again, in writing, before it is added.
 */
const REASON_FIELD_BY_KIND: Readonly<Record<string, 'parked_because'>> = {
  idea: 'parked_because',
}

/**
 * Why this record was put down, wherever the reason lives, or null when nobody wrote one.
 *
 * THE DEFECT THIS EXISTS TO CLOSE. `parked` is classified as `paused`, so a parked idea is correctly
 * kept off the attention list — and the sentence beside it read "no reason and no resume condition
 * were ever written" on three ideas whose reasons were sitting in `parked_because`, on a kind whose
 * own schema says "Without this, a parked idea reads as a forgotten one". The reading surface was
 * looking in exactly one place. This is the one reader that looks where each kind actually keeps it.
 */
export function putDownReason(kind: string, data: unknown): PutDownReason | null {
  const field = REASON_FIELD_BY_KIND[kind]
  if (field !== undefined) {
    if (data === null || typeof data !== 'object') return null
    const raw = (data as Record<string, unknown>)[field]
    if (typeof raw !== 'string' || raw.trim() === '') return null
    return { why: raw.trim(), from: field }
  }
  const pause = readPause(data)
  return pause === null ? null : { why: pause.why, from: 'paused.why' }
}

// ============================================================================ when it comes due

/**
 * ---------------------------------------------------------------------------------------
 * AN OBLIGATION COMES DUE THE SAME THREE WAYS A PAUSE ENDS, IN THE SAME SHAPE
 * ---------------------------------------------------------------------------------------
 *
 * `Pause.until` has always accepted a date, a condition in words, or the record whose finishing
 * ends it. `obligation.due` accepted a date and nothing else, so "owed when the reprint lands" — a
 * thing this lab says constantly — could be recorded on a pause and not on the obligation it was
 * actually about. The two are one idea: WHAT HAS TO HAPPEN BEFORE THIS MATTERS AGAIN. So `due`
 * takes the same three keys, checked by the same `PauseUntil` shape in src/shared/kinds/shared-shapes.ts, and there is no
 * second representation to keep in step. A bare date string is still accepted and is still what
 * every stored obligation holds; nothing had to be rewritten.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT MUST SURVIVE: NO DEADLINE IS EVER INVENTED SO THAT SOMETHING CAN BE SCORED
 * ---------------------------------------------------------------------------------------
 *
 * A date-due obligation can become overdue, and overdue is the strongest thing the attention rule
 * ranks on. An obligation due on a condition is WAITING: its trigger has not fired, nobody is late,
 * and it cannot be overdue at all. The tempting middle — resolving a written condition into a date
 * so the ranking has a number to work with — is exactly the silent substitution this product bans,
 * and it would be invisible afterwards, because the invented date looks like a date somebody wrote.
 *
 * So `latenessMs` answers null for every form but a readable date. NULL IS NOT "ON TIME", and a
 * caller must not turn it into a zero: the standings below are how a reader says which of the four
 * situations it is looking at.
 */
export interface Due {
  /**
   * Which of the three decides when this comes due, or `unstated` when nothing readable was
   * written. The other keys are still reported when they were written — an obligation carrying both
   * a date and a condition has said two things and a reader should show both — but exactly one of
   * them can be the answer to "is this late", and this says which.
   */
  when: 'date' | 'condition' | 'record' | 'unstated'
  /** The stored stamp, exactly as written. */
  date?: string
  /** The trigger in words. Read by a person; Mole Office never evaluates it. */
  condition?: string
  /** The record whose completion condition makes this due. Checkable by a caller that has the rows. */
  recordId?: string
}

/**
 * Where an obligation stands on coming due. Five answers, because a screen that printed one
 * sentence for all of them would be hiding four different things to do.
 */
export const DUE_STANDINGS = [
  /** A date Mole Office can read. This one, and only this one, can become overdue. */
  'dated',
  /** A date is stored and Mole Office cannot read it, so it cannot say whether it has passed. */
  'date-unreadable',
  /** It comes due when a condition written in words becomes true. A person judges that. */
  'waiting-on-a-condition',
  /** It comes due when another record reaches its completion condition. Checkable, by a caller. */
  'waiting-on-a-record',
  /** Nothing readable says when. The obligation can never come due, which is worth saying out loud. */
  'no-due-recorded',
] as const
export type DueStanding = (typeof DUE_STANDINGS)[number]

/**
 * One sentence per standing, so every surface says the same thing about the same situation.
 *
 * THIS TABLE IS THE ENGLISH, and the word lists read it: `g2b.deadline.standing.<standing>` in
 * src/shared/words/en.ts is this table's entry, so the record page's `t()` and the server say the
 * same words. It stays the source because the word lists import this file, and a file the word
 * lists import cannot import them back without failing to load (problem qdtawpOHQh-B).
 */
export const DUE_STANDING_SENTENCES: Readonly<Record<DueStanding, string>> = {
  dated: 'it is owed by a date Mole Office can read, so it can be late and is ranked on how late',
  'date-unreadable':
    'the due stamp stored on it is not one Mole Office can read, so it cannot say whether it has passed — nothing is ' +
    'assumed either way',
  'waiting-on-a-condition':
    'it comes due when a condition written in words becomes true, which Mole Office cannot check, so it is waiting ' +
    'rather than late. When the condition does become true, write the date it is owed by; Mole Office will not invent one',
  'waiting-on-a-record':
    'it comes due when the record it names reaches its completion condition, so until that happens it is waiting ' +
    'rather than late',
  'no-due-recorded': 'nothing says when this is owed, so it can never come due and nothing will ever raise it',
}

/**
 * Read `data.due` in either form: the bare date every stored obligation carries, or the object that
 * `Pause.until` already uses.
 *
 * PRECEDENCE WHEN MORE THAN ONE IS WRITTEN: date, then record, then condition — the order of how
 * much Mole Office can say for itself, which is the same order `pauseStandingOf` uses. Everything written
 * is kept in the answer, so a reader shows the condition beside the date rather than dropping it.
 */
export function readDue(data: unknown): Due {
  if (data === null || typeof data !== 'object') return { when: 'unstated' }
  const raw = (data as Record<string, unknown>)['due']

  // The form every obligation in the database is stored in, and still the ordinary one to write.
  if (typeof raw === 'string') {
    const date = raw.trim()
    return date === '' ? { when: 'unstated' } : { when: 'date', date }
  }

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { when: 'unstated' }
  const obj = raw as Record<string, unknown>
  const read = (key: string): string | undefined => {
    const value = obj[key]
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
  }
  const due: Due = { when: 'unstated' }
  const date = read('date')
  const condition = read('condition')
  const recordId = read('recordId')
  if (date !== undefined) due.date = date
  if (condition !== undefined) due.condition = condition
  if (recordId !== undefined) due.recordId = recordId
  if (date !== undefined) due.when = 'date'
  else if (recordId !== undefined) due.when = 'record'
  else if (condition !== undefined) due.when = 'condition'
  return due
}

/** Which of the five standings this obligation is in. `dueMs` is the caller's stamp reader. */
export function dueStandingOf(due: Due, dueMs: (stamp: string) => number | null): DueStanding {
  if (due.when === 'date') return due.date !== undefined && dueMs(due.date) !== null ? 'dated' : 'date-unreadable'
  if (due.when === 'record') return 'waiting-on-a-record'
  if (due.when === 'condition') return 'waiting-on-a-condition'
  return 'no-due-recorded'
}

/**
 * How late this obligation is, in milliseconds, or NULL WHEN THERE IS NO TRUTHFUL ANSWER.
 *
 * Signed: positive is that much late, negative is that much still to go. Null is returned for every
 * form but a readable date, and it means "there is no lateness to state", never "it is not late" and
 * never zero. A caller that needs a number for a ranking has to decide what to do with a null; that
 * decision belongs to the ranking, in the open, and not to a reader quietly returning 0.
 */
export function latenessMs(due: Due, nowMs: number, dueMs: (stamp: string) => number | null): number | null {
  if (due.when !== 'date' || due.date === undefined) return null
  const ms = dueMs(due.date)
  if (ms === null) return null
  return nowMs - ms
}

// ============================================================================ gates

/**
 * How hard a dependency is.
 *
 *   hard    — B cannot proceed at all until A finishes.
 *   partial — B may proceed as far as a named stage, and no further, until A finishes.
 *
 * A partial gate is the common case in this lab and had nowhere to live: the growth model can be
 * built and checked against recorded runs without the bench, but it cannot be validated without the
 * bench. Recorded as a hard gate, that work looks blocked when most of it is not; recorded as
 * nothing, the wall at the end is a surprise.
 */
export const GATE_KINDS = ['hard', 'partial'] as const
export type GateKind = (typeof GATE_KINDS)[number]

/**
 * WHICH OF THREE THINGS A PARTIAL GATE'S STAGE IS. Problem TZP9AJb4o2Cs.
 *
 *   item   — the id of a checklist item on the record the gate is on.
 *   block  — the id of a block on the record the gate is on: a block the pipeline lists, or, for a
 *            block, itself or a block of a pipeline that lists it.
 *   words  — anything else: a stage named in words.
 *
 * `createLink` in server/lib/records/links.ts works it out when a link is written and stores it in
 * `links.gate_up_to_sort`, so a reader does not have to guess from the shape of the text. A link
 * written before that column existed has no sort, and `GateStage` says `not_recorded` for it.
 */
export const GATE_STAGE_SORTS = ['item', 'block', 'words'] as const
export type GateStageSort = (typeof GATE_STAGE_SORTS)[number]

/**
 * What a reader is told about a stored gate's stage: one of the three sorts, `not_recorded` when a
 * partial gate was written before the sort was stored, or null when the gate names no stage.
 */
export type GateStage = GateStageSort | 'not_recorded' | null

/**
 * A gate carried by a `blocks` link. ONE CARRIER, since a pipeline block became a record.
 *
 * WHY IT RIDES ON `blocks` RATHER THAN BEING ITS OWN THING. Mole Office already stores "A blocks B" as
 * a typed link, and the brief was explicit that gates must integrate rather than become a second
 * parallel model. A gate is not a new relationship; it is a `blocks` link that says how much it
 * blocks. So the link keeps its type and gains two optional columns, every existing `blocks` link
 * keeps working, and no query has to learn a new table.
 *
 * It used to have a SECOND carrier: `StepNeed`, a nested object on a pipeline step. That was the
 * dependency graph existing as two systems at once — one of them checked, one of them not — and it
 * is the part of the block change that made the model smaller. A step's `needs` is now a `blocks`
 * link like every other dependency in the product.
 */
export interface Gate {
  kind: GateKind
  /**
   * The furthest stage the blocked thing may reach. A checklist item id, a BLOCK RECORD's id, or a
   * stage named in words.
   *
   * "A pipeline step id" is what this used to say, and it was free text nothing could check: a gate
   * naming a step of the wrong pipeline was indistinguishable from a stage named in words, and both
   * were stored behind a 201. A block is a record, so a gate naming one names a row that either
   * exists or does not, and the difference is now visible.
   *
   * REQUIRED when kind is 'partial' — a partial gate that does not say how far is a hard gate that
   * is lying. REFUSED when kind is 'hard' — a hard gate stops the work completely, so there is no
   * stage to name and nothing would ever read one written here. `gateFault` below is the rule, and
   * it is the only statement of it.
   */
  upTo?: string
}

/**
 * ---------------------------------------------------------------------------------------
 * ONE GATE RULE, ONE CARRIER, AND FOUR PLACES THAT ASK IT
 * ---------------------------------------------------------------------------------------
 *
 * A gate rides on a `blocks` link, and on nothing else. That is the one CARRIER. It is a different
 * count from the number of CALLERS, and confusing the two is what this whole comment is about: one
 * carrier means there is a single answer, and four callers is why the answer has to be declared
 * here rather than written as an `if` wherever it is first needed.
 *
 *   - `checkGate` in `server/lib/records/link-gates.ts`, on every POST /api/links. It calls `gateFault` and
 *     turns the fault into the refusal a caller writing a link should read.
 *   - `checkGates` in `server/lib/import.ts`, on every archive an import reads back. An importer
 *     is a write path, and a rule enforced on one and not the other is a back door.
 *   - `readLinkGate` in `server/lib/records/stored-link-gates.ts`, on the READ side, through
 *     `gateIsWellFormed`. A row edited by hand can hold a gate no write path would have taken, and
 *     it is reported rather than drawn as though somebody had said it.
 *   - `scripts/seed.ts`, which checks its own corpus before it writes it.
 *
 * WHY THE RULE IS STILL WRITTEN SEPARATELY FROM ITS CALLERS. Until 2026-08-10 half of it was here
 * and half was in a `StepNeed` shape check, and the stages audit measured the cost with two
 * requests: `{"kind":"hard","upTo":"…"}` sent to POST /api/links came back 201 and was stored, and
 * the same gate inside a pipeline step came back 400. The rule GET /api/kinds published was false
 * for half the gates in the product, and nothing failed, because nothing joined the two paths. The
 * second carrier is now gone rather than kept in step — but the rule stays a declaration rather
 * than an `if` inside `checkGate`, because that is what let the two be compared at all.
 *
 * ---------------------------------------------------------------------------------------
 * THE DECISION: A HARD GATE CARRYING `upTo` IS REFUSED, NOT IGNORED
 * ---------------------------------------------------------------------------------------
 *
 * Three reasons, and the first is the smallest.
 *
 *   1. Refusing is already what the product SAYS it does. `describeGate` in shared/kinds/the-kinds-as-written.ts serves
 *      it at GET /api/kinds, and `web/api.ts` tells the browser the server refuses it. Making the
 *      code true to the published rule changes one behaviour; ignoring would mean rewriting the
 *      rule wherever it has been published and read. (This sentence used to name `GET /api/links`,
 *      which is not an endpoint. The other place a gate is described to an agent is the note beside
 *      `POST /api/links` in server/api/kinds.ts, and that note states the partial half of this rule
 *      and not the hard half. It belongs to another owner and is reported, not edited.)
 *   2. Ignoring means storing a value nothing reads. A stored field nothing reads is the defect
 *      this codebase names as its own, and `gateLabel` for a hard gate never prints a stage.
 *   3. Ignoring means throwing away something the author wrote without telling them. The two gates
 *      they might have meant — "it cannot start at all" and "it may get as far as X" — are
 *      different facts about the work, and only the author knows which. The refusal names both.
 *
 * Nothing stored had to change: measured on the live corpus, no link carries a hard gate with a
 * stage, so this rule refuses writes that have never been made rather than invalidating rows that
 * exist.
 */
export const GATE_FAULTS = ['partial_without_upTo', 'hard_with_upTo'] as const
export type GateFault = (typeof GATE_FAULTS)[number]

/**
 * The rule broken by each fault, in one sentence, in the words the product publishes.
 *
 * WHERE THESE ARE SERVED, AND WHY IT HAD TO BE SAID AGAIN. They used to be served as the `rules` of
 * the `StepNeed` shape in shared/kinds.ts, which is what this comment said until today. That shape
 * was deleted when a pipeline step became a record, and the only publication of these two sentences
 * went with it. From that commit until this one they were enforced by `checkGate` and printed to
 * nobody: `GET /api/kinds` said nothing whatever about a gate, so the one way to find out that a
 * hard gate must not carry `upTo` was to send one and be refused.
 *
 * `describeGate` in shared/kinds/the-kinds-as-written.ts serves them now, built off `GATE_FAULTS`, and
 * tests/gate-rule.test.ts drives every gate through the write path and requires the published
 * document and the refusal to agree in both directions.
 *
 * A fault added to `GATE_FAULTS` does not compile until it has a sentence here, and it is published
 * the moment it does.
 */
export const GATE_FAULT_RULES: Readonly<Record<GateFault, string>> = {
  partial_without_upTo:
    'a `partial` gate must carry `upTo`, and the write is refused without it: a partial gate that does not say how far ' +
    'is a hard gate that is lying.',
  hard_with_upTo:
    'a `hard` gate must NOT carry `upTo`, and the write is refused with it. A hard gate stops the blocked work ' +
    'completely, so there is no stage to name and nothing would ever read the one written there.',
}

/**
 * What each gate kind says about naming a stage, and what is wrong when it does not.
 *
 * A TABLE RATHER THAN TWO IFS, because `Record<GateKind, …>` is exhaustive: a third gate kind
 * cannot be added to `GATE_KINDS` without deciding here whether it names a stage. That decision is
 * the whole content of this rule, and a new kind that skipped it would be taken by every caller
 * with nobody having said what it means.
 */
const STAGE_RULE: Readonly<Record<GateKind, { namesAStage: boolean; fault: GateFault }>> = {
  partial: { namesAStage: true, fault: 'partial_without_upTo' },
  hard: { namesAStage: false, fault: 'hard_with_upTo' },
}

/**
 * What is wrong with this gate, or null when nothing is.
 *
 * EVERY CALLER ASKS THIS AND DECIDES NOTHING OF ITS OWN. There were once two carriers — a `blocks`
 * link and a pipeline step's `needs` — and the sentence each said was its own while the VERDICT was
 * meant to be shared; for months it was not, and nothing failed. The second carrier is gone; this is
 * still a declaration rather than an `if` inside `checkGate`, because a rule written down separately
 * is what made the disagreement findable, and because three other callers now ask it.
 */
export function gateFault(gate: Gate): GateFault | null {
  // Annotated rather than inferred: the lookup is exhaustive over the two declared kinds, and a
  // `Gate` built from stored text or from a request body can still carry a third word.
  const rule: { namesAStage: boolean; fault: GateFault } | undefined = STAGE_RULE[gate.kind]
  // A kind this table has never heard of cannot be judged, and NULL HERE IS NOT "the gate is fine".
  // Nothing reaches this line without having been told already: `checkGate` and `checkGates` test
  // the word against GATE_KINDS before they ask, and `readLinkGate` reports a stored word it does
  // not know as an unreadable gate rather than building one to pass here. The seed is the fourth
  // caller and does not test the word, because it reads back rows it wrote through `createLink` a
  // moment earlier — so it is covered by the first of these rather than by a check of its own.
  if (rule === undefined) return null
  // Blank is the same as absent, on both halves and for one reason: `upTo` is read for a stage to
  // print, and a stage of spaces is not one. Asking the same question twice here is how the two
  // halves would drift apart.
  const namesAStage = typeof gate.upTo === 'string' && gate.upTo.trim() !== ''
  return namesAStage === rule.namesAStage ? null : rule.fault
}

/**
 * Is this gate usable as written?
 *
 * The one predicate the write paths and the read paths share. It is `gateFault` with the reason
 * dropped, so the two can never give different answers about the same gate.
 */
export function gateIsWellFormed(gate: Gate): boolean {
  return gateFault(gate) === null
}

/** The words shown on an edge. One place, so the pipeline drawing and the record page agree. */
export function gateLabel(gate: Gate): string {
  if (gate.kind === 'hard') return 'must finish first'
  return `only as far as ${gate.upTo ?? '(unstated)'} until this finishes`
}

// ============================================================================ fulfilment

/**
 * Has an obligation been discharged?
 *
 * THE MECHANISM ALREADY EXISTED and this is a shared reader for it, not a new field. `data.done`
 * has been declared in kinds.ts and honoured by the alarm panel from the start. What was missing
 * was anything that WROTE it — no interface offered the action and the seed never set it — so
 * every obligation looked permanent and the analysis concluded, wrongly, that the field did not
 * exist. `fulfilledAt` is the one genuine addition: when a promise was kept is worth keeping, and
 * a boolean cannot say it.
 */
export interface Fulfilment {
  done: boolean
  /** When it was discharged, as a stored stamp. Null when done is true but nobody said when. */
  at: string | null
  /** What settled it, if recorded. */
  note: string | null
}

export function readFulfilment(data: unknown): Fulfilment {
  const obj = data !== null && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const state = typeof obj['state'] === 'string' ? obj['state'].trim().toLowerCase() : null
  const done =
    obj['done'] === true ||
    state === 'done' ||
    state === 'fulfilled' ||
    state === 'cancelled'
  const at = typeof obj['fulfilledAt'] === 'string' && obj['fulfilledAt'].trim() !== '' ? obj['fulfilledAt'].trim() : null
  const note = typeof obj['fulfilledNote'] === 'string' && obj['fulfilledNote'].trim() !== '' ? obj['fulfilledNote'].trim() : null
  return { done, at, note }
}

// ============================================================================ families

/**
 * Every record kind, grouped into six families FOR READING ONLY.
 *
 * Grouping, headings and navigation order. NOT a filter and NOT a schema.
 *
 * THIS USED TO SAY "AND ABOVE ALL NOT A COLOUR", AND THAT IS NO LONGER TRUE. A family is now drawn
 * with a glyph and a low-chroma 3px rail, on the one tag component in src/web/components/ui.tsx, so
 * a kind finally has a channel. Nothing here decides the drawing and nothing here stores a colour:
 * this table names the six, `familyOf` below maps a kind to one where one applies, and
 * `FAMILY_GLYPHS` and the `--family-*` tokens in ui.tsx do the rest.
 *
 * THE OLD REASON WAS GOOD AND IS WHY THE NEW DRAWING IS SHAPED THE WAY IT IS. It ran: colour in this
 * product is fully spent on state, and a family colour beside a state chip in the same row would
 * make two different things look like one. The restriction was asked for, and then round four
 * asked for the opposite — a coherent visual language for kinds and tags instead of mostly
 * black and grey labels — after measurement found 8 of 607 chips carrying any hue at all and all
 * sixteen kinds drawn as one grey pill. The objection was answered rather than overruled: the
 * family hues are low-chroma, are drawn as a rail rather than as an ink or a fill, carry a glyph
 * that works without them, and are measured in every palette to sit a distance away from the accent,
 * from `--ask` and from the alarm colour. `docs/UX-CONTRACT.md` states the rule and
 * tests/ui.test.ts enforces the numbers.
 *
 * ---------------------------------------------------------------------------------------
 * THE LABEL IS THE WORD ON THE SCREEN, AND IT IS WRITTEN HERE ONCE
 * ---------------------------------------------------------------------------------------
 *
 * The rail row, the page title and the facet button all read the label from here. They used to be
 * three strings: `WorkPage.tsx` opened with a hard-coded "Work" while this table said "Work" too,
 * and nothing would have failed if one of them had changed.
 *
 * The labels changed in the vocabulary pass, for one measured reason. The owner showed the product
 * to somebody who understood "Project" at once and could not say what "Work", "What we believe" or
 * "Might do" were for. A label names what is on the page:
 *
 *   Work                -> Work to do             (the page holds problems, tasks, obligations and
 *                                                  purchases; "Work" alone reads as work you did)
 *   Structure           -> Modules and pipelines  (exactly the two things on the page)
 *   What we believe     -> Decisions AND Findings (one name became two; see the note below)
 *   Might do            -> Ideas                  (exactly the two kinds inside)
 *   What happened       -> Notes and messages     (precisely what the page draws; the runs are on
 *                                                  the Sessions page and are filtered out here)
 *
 * ---------------------------------------------------------------------------------------
 * THE KEY IS THE ADDRESS, SO RENAMING A KEY RENAMES A PAGE PEOPLE HAVE BOOKMARKED
 * ---------------------------------------------------------------------------------------
 *
 * `familyPath` in src/web/components/router.tsx is `/${key}`, so these keys are what a person
 * pastes to a colleague. They were `belief`, `maybe` and `happened`, and none of those three says
 * what is on its page. The old addresses still parse and then rewrite themselves — see
 * RENAMED_ADDRESSES in that file — so a bookmark lands and then corrects itself.
 *
 * ---------------------------------------------------------------------------------------
 * `work` IS A PAGE. IT IS NOT THE LIST OF KINDS A PLAN MAY GIVE HOURS TO
 * ---------------------------------------------------------------------------------------
 *
 * That list is `KINDS_A_PLAN_CAN_GIVE_HOURS_TO`, at the bottom of this file, and the two differ on
 * three kinds on purpose. The two questions are different: this table answers WHICH PAGE A KIND IS
 * READ ON, and that one answers WHICH KINDS CAN HOLD HOURS. `PLAN_HOURS_BY_KIND` beside it gives
 * the reason for every kind, one at a time.
 */
export const KIND_FAMILIES = {
  // A `purchase` is here and cannot take hours: buying is not time somebody spends. See
  // `PLAN_HOURS_BY_KIND`. `block` and `direction` are the other way round — they take hours and
  // are read on other pages.
  // A `checklist` IS HERE BECAUSE IT IS A LIST OF REQUESTS SOMEBODY HAS TO DO. Like a
  // purchase it takes no hours; the hours go on the task or run that does what an item asks. Its own page is
  // part 2 of that work; until then it is read here and on its record page.
  // A `backlog_item` IS HERE FOR THE CHECKLIST'S REASON (item 38 of wave 13s's requirements): it is one piece of work a
  // line has to do. Like a checklist it takes no hours; the hours go on the round that does it.
  work: { label: 'Work to do', kinds: ['task', 'obligation', 'purchase', 'problem', 'checklist', 'backlog_item'] },
  // `block` is here because a pipeline block IS structure and belongs under Structure in the rail.
  // The attention rule takes an exception to it for its own grouping and says why there; this is
  // about reading and navigation only.
  // A `trajectory` AND A `planned_state` ARE HERE, AND IT IS THE LEAST WRONG OF SIX RATHER THAN A
  // FIT. This is a fork the history-and-future design did not settle, so it is filed as a proposal
  // in the owner's governance queue and the narrowest true thing is built meanwhile.
  //
  //   WHAT A FAMILY DECIDES is rail grouping, one hue and one glyph — reading and navigation, as
  //   the note on `block` above says. A person who wants the planned future of the tray clamp
  //   module goes where the tray clamp module is. That is the whole case for putting it here.
  //
  //   `ideas` WAS THE OTHER CANDIDATE AND IS WORSE, for the reason written under `decisions`: an
  //   idea is something the lab might do one day, a planned future is the future somebody has
  //   decided on, and filing it under "Ideas" is how it would stop being read.
  //
  //   THE COST, SAID RATHER THAN HIDDEN: the label "Modules and pipelines" does not name these two,
  //   and a planned future is grouped with things that exist. What keeps it from READING as one of
  //   them is not this table — it is the kind word ("planned future"), the `intent` line family,
  //   the two lanes, and `worldOf`. The `notes` family already carries the same cost and says so.
  //   A `goal` IS HERE ON THE SAME ARGUMENT AND WITH THE SAME COST, since 15 September 2026,
  //   criterion P1. A goal is what a trajectory serves, and `serves` runs from the work to it, so a
  //   person looking for the goal a cluster is aimed at goes where that cluster's future already is.
  //   `work` was the other candidate and is wrong: a goal is not something anybody does, it is what
  //   the doing is for, and the hours table says so by giving it no hours.
  structure: {
    label: 'Modules and pipelines',
    kinds: ['module', 'pipeline', 'block', 'trajectory', 'planned_state', 'goal'],
  },
  // `proposal` sits beside `decision` because it is read with it: the fork, then the choice made
  // from it. It is NOT in `ideas` — a proposal is not something the lab might do one day, it is a
  // question waiting on a person, and filing it under "ideas" is how it would stop being read.
  // A `regulation` IS NOT HERE, and that is measured: the decisions family is closed — a fork and
  // the choice made from it, and no third thing — and a regulation is neither. It is the standing
  // constraint that came later, not a choice somebody is being asked to make (criterion G2).
  decisions: { label: 'Decisions', kinds: ['proposal', 'decision'] },
  // ONE FAMILY BECAME TWO, AND THE REASON IS MEASURED. `belief` held all four kinds under the
  // label "What we believe" and then under "Decisions and findings". In the live corpus that is
  // three settled choices, four open questions and seventeen measurements under one name, and no
  // name covers those without going abstract. Two people who were shown the product
  // both failed on the abstract name. A claim and a direction are what the lab has FOUND OUT; a
  // proposal and a decision are what it has CHOSEN, or has to choose. Those are two different
  // questions and a reader arrives with one of them.
  //
  // "Findings" rather than "Results": "results" is already the first list on the Missing and unused
  // page, where it means a result nothing is using.
  // A `placeholder` AND A `ran_instead` ARE HERE, AND GUESSING A FAMILY WOULD BE A FAULT: a kind
  // no family covers is drawn as a warning and named, never quietly put somewhere. So both get an
  // entry in the same change that adds them.
  //
  // "What the lab found out" is what this family holds, and a restriction is a statement about
  // what is and is not known — a slot deliberately unresolved, and what that stops the project
  // claiming. The two alternatives were considered and both are wrong. `work` is wrong because a
  // restriction is NOT work: what is urgent is the work of resolving it, and that work is its own
  // record. `decisions` is wrong because a placeholder must never look like a settled fork; the
  // whole of its governance rule is that it settles nothing.
  //
  // THIS IS A JUDGEMENT MADE FROM A TABLE AND IT IS THE ONE MOST LIKELY TO BE CHANGED BY LOOKING
  // AT IT ON A SCREEN. What would falsify it: a Findings list with a placeholder in it that reads
  // as a result. The repair is a different one of the six, not a seventh — a seventh family costs
  // a hue in seven palettes and a word a person has to learn.
  // A criticism is something found out about the product.
  findings: { label: 'Findings', kinds: ['claim', 'direction', 'placeholder', 'ran_instead', 'criticism'] },
  ideas: { label: 'Ideas', kinds: ['idea', 'wanna_try'] },
  // A `report` IS READ HERE, AND IT IS NOT A SEVENTH FAMILY. The case, because it is a decision
  // rather than a default:
  //
  //   WHAT A FAMILY ANSWERS is "what sort of thing is this", in one hue and one glyph. The answer
  //   for a report is the answer this family already gives — somebody wrote this for a person to
  //   read. A report and a note differ in how much is in them and in whether anybody is asked to
  //   read them, and neither of those is what a rail can say.
  //
  //   A SEVENTH FAMILY COSTS A SEVENTH HUE, and the hue is the expensive half. Every rail is held
  //   in every one of the eight palettes to three measured numbers by tests/ui.test.ts: 3:1 against
  //   its surface, a spread no wider than that palette's accent, and a measured distance from the
  //   accent, from `--ask` and from the alarm colour. It also costs a seventh glyph, and
  //   `FAMILY_GLYPHS` in src/web/components/ui.tsx is exhaustive over this table, so a seventh key
  //   fails the typecheck until somebody draws one. That is a real price and it buys a distinction
  //   the kind tag beside the rail already makes.
  //
  //   SIX IS THE NUMBER A PERSON LEARNS. `docs/UX-CONTRACT.md` says so and the whole rail rests
  //   on it. Seven families for seventeen kinds is close to giving up on grouping.
  //
  // THE LABEL LEADS WITH REPORTS because a label names what is on the page and a report is what
  // somebody comes to this page looking for. It names a note too, because a note is the other kind
  // that lives only here. It does NOT name a message, and since 15 September 2026 that is not a
  // length limit: a message is not in this family at all. See the note on `message` below.
  //
  // AN `annotation` IS HERE FOR THE SAME REASON A `report` IS: it is somebody's writing. A remark
  // left on a passage of a report and the report it is left on are the same sort of thing to a
  // reader — words a person wrote for another person — and they differ in size rather than in kind.
  //
  // AN `agent` AND A `stopping_point` ARE HERE, AND NEITHER IS A SEVENTH FAMILY. The paragraphs
  // above are the whole argument against a seventh, and it does not get weaker with two more kinds.
  // What each of these two is to a reader:
  //
  //   A `stopping_point` is somebody's writing about where work stopped. It sits beside a `session`
  //   for the obvious reason — a session is the run, and a stopping point is what was written at the
  //   end of one — and a reader looking for "what was happening when this stopped" comes to this
  //   page looking for both.
  //
  //   An `agent` is NOT writing, and it is here because the alternative is worse rather than
  //   because it fits. It is not work to do, not structure, not a choice, not a finding and not an
  //   idea. It sits with `session` because those two are the same subject seen twice: the identity
  //   and the runs it worked as, and a person who wants one wants the other in the same list. The
  //   honest reading is that this family is now "writing, and who did it", and the label does not
  //   say so — that is a real cost and it is smaller than a seventh hue.
  //   A `work_domain` IS HERE AND NOT IN `work`, and the difference is the label. `work` is labelled
  //   "Work to do" and drives the Work to do page and the attention grouping: everything in it is
  //   something SOMEBODY HAS TO DO. A work domain is a statement about work already under way and
  //   nobody has to do it, so filing it there would put it under a label meaning the opposite. It
  //   sits beside `session` — the run that filed it — for the reason `stopping_point` does.
  //
  // A `context_bundle` IS HERE, AND IT IS THE LEAST WRONG OF SIX RATHER THAN A FIT. A bundle is a
  // recipe for a reading of records that already exist, plus the record of what was handed to an
  // agent Mole Office does not run. That second half is what puts it here: it is a written account of
  // something that happened, addressed to a person who wants to know what went out — the same sort
  // of thing a `stopping_point` and a `session` are. `structure` is wrong because a bundle is not a
  // part of the project; `findings` is wrong because a bundle finds nothing out. THE COST, SAID
  // RATHER THAN HIDDEN: the label does not name it, exactly as it does not name a session or a work
  // domain, and a seventh family costs a hue in eight palettes and a glyph. Its own rail row —
  // `rail.bundles` — is what a person navigates by, and that is what the row exists for.
  //
  // A `message` IS NOT HERE, AND IT LEFT ON 15 SEPTEMBER 2026. Criterion E1: the
  // list called Reports and notes draws messages among them, and it must not. The answer that night,
  // settled in one line by the secretary on the person's behalf: take `message` out and nothing else; `annotation`
  // stays. WHAT WAS WRONG: a message was in this list because THIS TABLE said it belonged here,
  // while a second path — a pool narrowed to what is addressed to the reader or to nobody — made
  // the page double as the person's inbox. WHERE MESSAGES ARE READ INSTEAD: in the chat, on `#/messages`
  // (the whole pool), and on the record a message is about. E1 asks that a message about a record
  // be reached from that record rather than from this list. THIS IS NOT A MOVE TO A SEVENTH FAMILY
  // and not a move to any other one: the six-family argument above still stands, and a message is
  // read on a page of its own rather than grouped in the rail. THE COST, SAID RATHER THAN HIDDEN:
  // `familyOf('message')` is null, so a message carries no family rail or glyph and Everything's
  // facet bar has no heading for it. Its own page, which the chat's foot leads to, is what a person
  // navigates by, and the record it is about is where the message itself is read. The sidebar has
  // given it no row of its own since a decision.
  notes: {
    label: 'Reports and notes',
    kinds: [
      'report', 'session', 'note', 'annotation', 'agent', 'stopping_point', 'work_domain',
      // A `draft` IS HERE, BESIDE THE REPORT AND THE NOTE IT MAY BECOME: it is writing, kept until it is
      // sent, and not itself something to do.
      'draft',
      // A `role_card` IS NOT HERE, AND IT LEFT ON 1 OCTOBER 2026. It is a kind of its own, not a report, as item 3
      // of a decision says. It is read on the Role cards page at `#/roles`, whose rail row
      // is its own, and on its own record page. `KINDS_READ_ON_THEIR_OWN_PAGE` below names it, exactly as it names
      // `message`. THE COST, SAID RATHER THAN HIDDEN: a role card carries no family hue or glyph, and Everything's
      // facet bar has no heading for it.
      'context_bundle', 'sealed_tip',
      // A `role_card_words` record IS HERE, unlike the card it gives words to. It is text the person keeps
      // and changes, like a notebook or a regulation, and it has no page of its own; its record page is
      // where it is edited.
      'role_card_words',
      // A `merge_entry` IS HERE, BESIDE THE SEAL IT IS SUBMITTED ON, and for the seal's reason: it is
      // the office's own account of finished work on its way into the main world — written by the
      // queue's doors, read back to a person — and not itself something to do. Sandbox v1, P6.
      'merge_entry',
      // An `emergency_push` IS HERE, BESIDE THE MERGE ENTRY, for the entry's reason: it is the office's account of a
      // push to main past the queue, written by its own doors and read back to a person (wave 13u round 82).
      'emergency_push',
      // The office's account of a completed cloud run is read beside its other run records.
      'whole_suite_receipt',
      'notebook', 'notice_rules', 'incident',
      // A `regulation` IS HERE, AND THE NEIGHBOUR IT IS READ BESIDE IS THE REASON (criterion G2,
      // 11 September 2026). It holds somebody's own words about how the work goes, exactly as a
      // `notebook` does, and like the notebook it is read back to the person rather than worked
      // on. `decisions` is closed — a fork and the choice made from it, and no third thing — and
      // a regulation is neither: it is the standing constraint, not a choice somebody is being
      // asked to make. What would move it: if the regulations grow a life of their own that reads
      // as governance rather than as words kept — and G5's own rail row, not this family, is what
      // a person navigates by either way.
      'regulation',
      // A `flow` IS HERE, AND IT IS WITH THE OFFICE'S OWN KINDS ON PURPOSE (proposal
      // 1LaCQBRYRjls option A). A flow is the
      // office reading ITSELF — how its work actually goes, who runs it and what it leaves —
      // which is what a regulation, a notebook and a role card already are: definitions and
      // accounts, not findings and not work. A role card was in this family when this was written. It
      // left on 1 October 2026 and is read on #/roles, as item 3 of a decision
      // says. `structure` is wrong because a flow is not a part of
      // the project; `work` is wrong because a flow is not itself something to do. No gate, says
      // the proposal: nothing is blocked by filing one.
      'flow',
      // A `flow_run` IS HERE, BESIDE THE FLOW IT RECORDS A PASS THROUGH, for the flow's reason: it is the
      // office reading itself (wave 1 of the office flow, M1). The office writes it, never a person.
      'flow_run',
      // A `host_job` IS HERE, BESIDE THE FLOW RUN, for its reason: the office's own record of a tool it ran for a run.
      'host_job',
      // A `counter` IS HERE, BESIDE THE FLOW, AND FOR THE FLOW'S REASON, for criteria CT1 to
      // CT7. A counter is the office watching itself: what
      // has happened so far and what is to happen when enough of it has. `work` is wrong because a
      // counter is not itself something to do — the task it files when it fires is, and that task is
      // an ordinary task in the work family. `structure` is wrong because a counter is not a part of
      // the project. THE COST, SAID RATHER THAN HIDDEN: the label does not name it, and a reader
      // looking for counters finds them under Reports and notes, or on the counters page of their
      // own project.
      'counter',
      // THE TOOLSET CATALOGUE'S TWO KINDS ARE HERE, BESIDE THE COUNTER, AND FOR ITS REASON: a tool and
      // a category of tools are the office describing its own equipment, as report i69HYz8BQhSx
      // records. Neither is something to do, so `work` is wrong; neither is a part of the project
      // being built, so `structure` is wrong. A reader looking for them finds them under Reports and
      // notes, or through GET /api/toolset.
      'tool_category',
      'tool',
      // A `booking` IS HERE, BESIDE THE TOOL, AND FOR ITS REASON: it is the office keeping its own equipment,
      // here the host GPU, in order. It is not itself work to do — the work is what runs
      // under it — and it is not a part of the project being built. A reader finds the live line through GET
      // /api/resources/gpu; its page is a later round.
      'booking',
      // A `secretary_duties` IS HERE, BESIDE THE NOTEBOOK, AND FOR ITS REASON: it is an account of one secretary,
      // here the share of the work the person gave it (item 2 of wave 13s's requirements). It is not itself work to
      // do, and it is not a part of the project being built. A reader finds them through GET /api/secretaries/duties.
      'secretary_duties',
      // A `watch` IS HERE, BESIDE THE BOOKING, AND FOR ITS REASON: it is an account of one watch or timer an agent keeps
      // running (item 38 of wave 13s's requirements). It is not itself work to do — the work is what it watches, and
      // what it wakes somebody for — and it is not a part of the project being built. A reader finds them through
      // GET /api/records?kind=watch.
      'watch',
      // A `handbook` IS HERE, BESIDE THE FLOW, AND FOR ITS REASON: it is the office's own guidance for whoever starts a flow
      // or takes a role card, read back to them rather than worked on. It is not itself work to do, and it is not a part
      // of the project being built. A reader finds handbooks on the Records page, filtered by their kind, and on the page
      // of each flow a handbook is linked to.
      'handbook',
      // A `project_chapter` IS HERE, BESIDE THE REGULATION, AND FOR ITS REASON: it is a standing rule a project keeps,
      // not a choice somebody is asked to make (the design-first build of wave 13s's requirements). A `design` and a
      // `design_review` are here beside the report: a design is a written account of the candidates and the one chosen,
      // and a review is a judgement written about one revision of it. A `design_reminder` is the office's account of one
      // reminder of a missing reviewed design, and its judgement. None of the four is work to do.
      'project_chapter',
      'design',
      'design_review',
      'design_reminder',
    ],
  },
} as const
// AN `incident` IS HERE, AND IT IS THE LEAST WRONG OF SIX RATHER THAN A FIT, the same judgement
// `stopping_point` and `context_bundle` above already make and say why. `work` is wrong for the
// reason it is wrong for a `placeholder`: an incident is not itself something to do, and what is
// urgent is its corrective actions, which are their own records with their own family. `findings` is
// wrong because an incident is not a claim the lab made — it is a written account of what happened,
// which is the same sort of thing a `stopping_point` already is: writing about an event, addressed
// to a person who needs to know. THE COST, SAID RATHER THAN HIDDEN: the label does not name it, and a
// reader who wants "incidents" has to know they live under Reports and notes, exactly the cost this
// family already carries for a notebook, a stopping point and a bundle.
export type KindFamily = keyof typeof KIND_FAMILIES

// ============================================================================ words on the screen

/**
 * The word a person reads for a value Mole Office stores.
 *
 * ---------------------------------------------------------------------------------------
 * NO STORED IDENTIFIER REACHES A SCREEN, AND NO UNDERSCORE EITHER
 * ---------------------------------------------------------------------------------------
 *
 * A stored value is chosen so that a program can hold it: it is lower case, it has no spaces, and
 * it is often shortened. `wanna_try` is the clearest case — it was the label on a menu a person
 * picks from, and it is a column value nobody says out loud. An underscore on a screen is a leak
 * from the database, every time.
 *
 * THE STORED VALUE NEVER CHANGES. Renaming what is in the database would cost a migration, the API
 * schema and every agent's skill file, and would buy the reader exactly what this table buys them.
 * So the two are separated: the stored word stays, and this says what to print.
 *
 * ONLY THE WORDS THAT NEED A DIFFERENT ONE ARE LISTED. Everything else has its underscores turned
 * into spaces, which is the whole of the rule for `worked_around`, `not_started` and their like.
 * Reading it from one function is what stops a second surface inventing a second spelling.
 */
const DISPLAY_WORDS: Readonly<Record<string, string>> = {
  notice_rules: 'notice wake rules',
  sealed_tip: 'submitted tip',
  // Record kinds.
  wanna_try: 'worth a try',
  // A block is one step of a pipeline. "Block" was the word the schema chose and it means nothing
  // to a reader looking at a pipeline drawn as a row of steps.
  block: 'step',
  // A `trajectory` is one intended future for one thing. "Trajectory" is a physics word for a path
  // through space and it tells a reader nothing about what is on the page; "planned future" is what
  // it is. `planned_state` needs no entry — the underscore rule already spells it the way
  // KIND_WORDS does, and an entry that agreed with the rule would be a second statement of it.
  trajectory: 'planned future',
  // A `notebook` is one secretary's notes, and the person reads it as "secretary notes" (秘书笔记), as
  // item 1 of a decision says. The stored word stays `notebook`;
  // KIND_WORDS says the same.
  notebook: 'secretary notes',
  // A `role_card_words` record holds a role card's words, and the underscore rule would print the plural
  // "role card words", which reads wrong wherever a sentence names the kind as one thing. KIND_WORDS says
  // the same.
  role_card_words: 'role card text',
  // State words. "todo" is the only one of the thirty-one in STATE_MEANING that is not already an
  // English word, and it is the only entry needed here for that reason: every other state word, and
  // `worked_around` once its underscore is gone, is printed unchanged by the rule below.
  //
  // IT IS HERE BECAUSE IT WAS MISSING AND THE TWO TABLES DISAGREED. `STATE_WORDS` in
  // src/web/lib/words.ts said "to do" while this file answered "todo", which is the same fact
  // worked out in two places — the defect CLAUDE.md names as this repository's own. It was the only
  // word of the sixty-odd in the two tables where they differed. A test then required
  // them to agree on every state word and every kind, until it was deleted on 12 November 2026.
  todo: 'to do',
  attempted: 'verification attempted',
  complete: 'verification complete',
  unavailable: 'verification unavailable',
  'handed-off': 'handed off',
  'failed-restored': 'failed and restored',
  'not-restored': 'restoration not verified',
  moved: 'moved',
  restored: 'failed and restored',
  // `queued` is the second state word that is not what a person says. A queue is the mechanism; what
  // the reader sees is that the words are waiting to go somewhere. `sent` and `answered` are already
  // English and are printed unchanged.
  queued: 'waiting',
  // TWO SESSION WORDS THAT NAME THE MECHANISM AND NOT WHAT A PERSON HAS TO DO. An idle session is an
  // agent that stopped and is waiting for an answer; "idle" reads as "nothing is happening here".
  // An orphaned run is one nobody owns that is still going. Both readings were decided in an earlier
  // round and lived in a table in src/web/components/ui.tsx that no server file could reach; they
  // are here, and in STATE_WORDS, so the two tables say the same word.
  idle: 'waiting for you',
  orphaned: 'left running',
  // Where a comment to an agent has got to. `picked_up` would come out of the underscore rule as
  // "picked up" anyway and is written out so a word that reaches a screen does not depend on a rule
  // about punctuation. `handled` is a word about a process; what a person wants to know is that
  // somebody did something about their comment.
  picked_up: 'picked up',
  handled: 'dealt with',
  // A note somebody left on something. The stored word is what a program holds; what a person says
  // is where the note is, not what the row is called. See KIND_WORDS in src/web/lib/words.ts, which
  // this table is checked against on every kind and every state word.
  annotation: 'comment',
  // Where a stretch of work stopped. The underscore rule would print "stopping point", which names
  // the mechanism rather than what the record is to a reader: what they want off a tag is that this
  // says where the work got to. "Handover" was the first word for it and it is wrong — most of
  // these are written by somebody handing over to themselves tomorrow.
  stopping_point: 'where work stopped',
  // What a state word says about whether the work stopped short. `PROGRESS` above holds the stored
  // spellings; these are the same six facts said in words a person uses.
  not_started: 'not started',
  in_flight: 'under way',
  stopped_short: 'did not finish',
  unclassified: 'nobody has said',
}

/**
 * What to print for a stored value. Never the stored value itself when it holds an underscore.
 *
 * An empty or blank input comes back as an empty string rather than as a made-up word, because
 * "nothing is stored here" is a real answer and the surfaces that draw it have their own words
 * for it.
 */
export function displayWord(stored: string): string {
  const word = stored.trim()
  if (word === '') return ''
  for (const key of [`kind.${word}`, `state.${word}`]) {
    const read = storedWordIfDeclared(key)
    if (read !== undefined) return read
  }
  return DISPLAY_WORDS[word] ?? word.replace(/_/g, ' ')
}

/**
 * A stored field key as the words a person reads: `effort_hours` -> "effort hours".
 *
 * IT IS `displayWord` WITH ONE MORE RULE, not a second table. Seven declared keys are written in
 * camel case — `blockIds`, `lastOutputAt`, `summaryBlocks` and four more — and `displayWord` only
 * knows about underscores, so it hands those back unchanged and a reader gets `lastOutputAt` on a
 * screen. The camel case is split here and everything else is `displayWord`'s answer.
 *
 * A STORED PATH IS READ WHOLE OR NOT AT ALL, and that is the rule added on 1 September 2026. The
 * change log drew `changed data.short forms.gist` — one path, one of its three segments in English —
 * because this function was written for a KEY and is handed a PATH by `changeVerb`. A path whose
 * every segment is a plain key is now read innermost first, *gist in short forms in data*, and a
 * path carrying a stored id or a rename arrow is handed back exactly as it is stored.
 *
 * THE RECORD PAGE COMPUTES THE SAME WORDS AND CAPITALISES THEM. `englishHeading` in
 * src/web/pages/RecordPage.tsx turns a key into a heading, and that is the same fact as this one.
 * The two are not merged here because this file may not import a React page; instead
 * tests/kind-change-and-plain-replies.test.ts checks that the two agree on EVERY declared key of
 * every kind, so a rule changed in one place and not the other is a red test rather than two
 * spellings of one field on two screens.
 */
export function fieldWords(key: string): string {
  const steps = key.split('.')
  if (steps.length === 1) return oneFieldWord(key)
  // A PATH IS READ INNERMOST FIRST, WHICH IS THE ORDER SOMEBODY SAYS IT IN: the thing that moved,
  // then where it sits. Nothing is dropped — `data` stays, because `title` and `data.title` are two
  // different fields and a reading that left the container off would print one name for both.
  if (steps.every(READABLE)) return steps.map(oneFieldWord).reverse().join(' in ')
  // A PATH WITH MACHINERY IN IT IS PRINTED EXACTLY AS IT IS STORED. `parts[#p1].items[#i2].state`
  // carries two stored ids and `data.agent -> data.runtime` carries a rename arrow, and neither has
  // words for a reader. Half of a path in English is worse than all of it as machinery: this
  // function used to hand back `data.short forms.gist`, which is one key with one of its three
  // segments turned into words, and reads as a typo rather than as either thing.
  return key
}

/** A stored key with nothing in it but letters, digits and underscores: something with words. */
const READABLE = (step: string): boolean => /^[A-Za-z0-9_]+$/.test(step)

/** One stored key as the words a person reads. `displayWord` with the camel case split first. */
function oneFieldWord(key: string): string {
  return displayWord(key.replace(/([a-z0-9])([A-Z])/g, '$1 $2')).toLowerCase()
}

/**
 * A word with the article that belongs in front of it: "a task", "an obligation", "an idea".
 *
 * WHY THIS IS A FUNCTION. "Tracked as a obligation" and "This record was a obligation and is now a
 * problem" both reached a reader, from two different files, because both wrote `a ${word}` and a
 * kind name is not known until it runs. Three server files had already worked the rule out inline
 * and a fourth had not. This is the one place that answers it.
 *
 * IT TESTS THE LETTER AND NOT THE SOUND, which is right for every word this product puts through
 * it: the seventeen kind names, their reader's words, and the declared field keys. A word like
 * "hour" — vowel sound, consonant letter — would come out wrong, and none is used here. Anything
 * that needs the sound rule needs a pronunciation table, which is not a thing to invent for a
 * vocabulary this file can list.
 */
export function withArticle(word: string): string {
  const said = word.trim()
  if (said === '') return said
  return `${/^[aeiou]/i.test(said) ? 'an' : 'a'} ${said}`
}

/**
 * Which family a kind belongs to, or null when a kind is read on a page of its own.
 *
 * EVERY KIND BELONGS TO AT MOST ONE, and a kind found in two families is the defect a test at
 * tests/vocabulary-families.test.ts catches. A NULL IS A REAL ANSWER AND IT IS NOT ALWAYS A GAP.
 * `message` has no family by design since 15 September 2026: criterion E1 took it out of `notes`,
 * and it is read on `#/messages`, in the chat and on the record it is about. A kind this product
 * does not declare also answers null, and Everything draws that as the finding it is.
 */
export function familyOf(kind: string): KindFamily | null {
  for (const [name, family] of Object.entries(KIND_FAMILIES)) {
    if ((family.kinds as readonly string[]).includes(kind)) return name as KindFamily
  }
  return null
}

/**
 * KINDS THAT ARE READ ON A PAGE OF THEIR OWN AND SIT IN NO FAMILY, AND WHICH PAGE THAT IS.
 *
 * `message` was the only one from 15 September 2026, when criterion E1 took it out of the `notes`
 * family. The note beside the `notes` family says why it left and where it is read instead.
 * `role_card` is the second since 1 October 2026. It is a kind of its own and not a report, and it is read
 * on the Role cards page at `#/roles`, as item 3 of a decision says.
 *
 * THE PAGE IS NAMED HERE, BESIDE THE KIND, so a record page's crumb and this set cannot disagree
 * about where a kind is read. The value is the route's name in src/web/components/router.tsx.
 *
 * THIS SET EXISTS SO THE SURFACES THAT ASK "WHICH FAMILY?" CAN TELL A DELIBERATE ABSENCE FROM A
 * GAP. Everything's facet bar and a record's breadcrumb both read `familyOf`, and for a declared
 * kind that answers null they draw a warning that Mole Office is missing a heading. That warning
 * is right for a kind somebody added to `RECORD_KINDS` and forgot to file; it is wrong for a kind
 * deliberately read on its own page, so those surfaces read this set first.
 */
export const THE_PAGE_A_KIND_IS_READ_ON = { message: 'messages', role_card: 'roles', role_request: 'embassy', quick_note: 'quickNote' } as const

export const KINDS_READ_ON_THEIR_OWN_PAGE: ReadonlySet<string> = new Set(Object.keys(THE_PAGE_A_KIND_IS_READ_ON))

/** The page a kind with no family is read on, or null for a kind that sits in a family or is not declared. */
export function thePageAKindIsReadOn(kind: string): (typeof THE_PAGE_A_KIND_IS_READ_ON)[keyof typeof THE_PAGE_A_KIND_IS_READ_ON] | null {
  return Object.hasOwn(THE_PAGE_A_KIND_IS_READ_ON, kind)
    ? THE_PAGE_A_KIND_IS_READ_ON[kind as keyof typeof THE_PAGE_A_KIND_IS_READ_ON]
    : null
}

/**
 * WHETHER NO HEADING ON THE LEFT HOLDS THIS KIND, which is what puts a record in Everything's alarm
 * panel. Two cases answer yes: a kind Mole Office does not declare, and a declared kind no family
 * covers. A kind read on a page of its own answers no. `GET /api/records` asks it over every row for
 * the panel, and the panel asks it again to say which of the two cases each row is, so the door and
 * the page cannot come to disagree about which records are in it.
 */
export function noHeadingHolds(kind: string): boolean {
  return familyOf(kind) === null && !KINDS_READ_ON_THEIR_OWN_PAGE.has(kind)
}

// ============================================================================ what a plan may fund

/**
 * WHICH KINDS A PLAN MAY GIVE HOURS TO, AND WHY EACH OF THE OTHERS MAY NOT.
 *
 * ---------------------------------------------------------------------------------------
 * THERE WERE TWO LISTS OF "WORK" AND THEY DISAGREED ABOUT FOUR KINDS
 * ---------------------------------------------------------------------------------------
 *
 * `KIND_FAMILIES.work` above said task, obligation, purchase, problem. `ALLOCATABLE_KINDS` in
 * src/server/lib/planning.ts said task, block, obligation, direction, problem. Both were called
 * work, neither derived from the other, and nothing would have failed if one had changed. That is
 * the recurring defect this repository names in CLAUDE.md.
 *
 * They are now one declaration and two readings of it. This table is the declaration; the server's
 * constant is `KINDS_A_PLAN_CAN_GIVE_HOURS_TO` under its old name, so nothing re-types the list.
 *
 * ---------------------------------------------------------------------------------------
 * AND THEY STILL DIFFER, BECAUSE THEY ARE DIFFERENT QUESTIONS
 * ---------------------------------------------------------------------------------------
 *
 * A page is not a plan. `KIND_FAMILIES.work` says which page a kind is READ on; this says which
 * kinds can HOLD HOURS. Three kinds sit on one side and not the other, and each is a decision:
 *
 *   purchase   read under Work to do, and takes no hours. Money is not time.
 *   block      read under Modules and pipelines, and takes hours: a step of a pipeline is the
 *              usual size of a day's work in this lab.
 *   direction  read under Findings, and takes hours: a plan has to be able to hold
 *              a future branch, not only a current task.
 *
 * The two names are different so that the difference reads as a decision rather than as a typo.
 * `tests/plan-hours.test.ts` prints the three and fails when the difference changes, so widening
 * either list has to be done on purpose.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY KIND IS IN THE TABLE, INCLUDING THE ONES THAT TAKE NO HOURS
 * ---------------------------------------------------------------------------------------
 *
 * `Record<RecordKind, …>` is exhaustive, so a kind added to `RECORD_KINDS` does not compile until
 * somebody has said whether a plan may give it hours and why. A list of only the kinds that can
 * would have let a new kind arrive with nobody deciding, and the refusal would then have read as
 * if the kind had been considered. `report` is the most recent one to arrive this way, and the
 * answer written below is no.
 *
 * The `why` of a kind that takes no hours is PRINTED IN THE REFUSAL. That is what makes the table
 * worth having: the write path used to say the same two sentences for every one of them, one for a
 * container and one for everything else, so a person who tried to plan a `claim` was told to file a
 * task without being told what was wrong with planning a claim.
 */
export interface PlanHoursRule {
  /** True when a plan may give this kind hours in a period. */
  mayHaveHours: boolean
  /**
   * Why, in one sentence. For a kind that takes hours it says what the hours mean; for a kind that
   * does not it is the sentence the refusal prints, so it has to say what to do instead.
   */
  why: string
}

/**
 * Every record kind, and whether a plan may give it hours.
 *
 * THE ORDER MATTERS AND IS NOT THE ORDER OF `RECORD_KINDS`. `KINDS_A_PLAN_CAN_GIVE_HOURS_TO` keeps
 * this order, and that list is printed in the refusal a person reads and in the plan reply the
 * browser draws its "add to this week" menu from. So the kinds that take hours come first, in the
 * order the product has always printed them, and the kinds that do not follow.
 */
export const PLAN_HOURS_BY_KIND: Readonly<Record<RecordKind, PlanHoursRule>> = {
  whole_suite_receipt: { mayHaveHours: false, why: 'a whole suite receipt keeps build and suite evidence; give hours to the work that produced it.' },
  sealed_tip: { mayHaveHours: false, why: 'a submitted tip preserves finished evidence; give hours to the work that produced it.' },
  merge_entry: { mayHaveHours: false, why: 'a merge entry is the office carrying finished work into the main world; give hours to the work that produced it.' },
  emergency_push: { mayHaveHours: false, why: 'an emergency push is the account of a fix pushed to main past the queue; give hours to the work that produced it.' },
  // ---- the kinds a plan may give hours to
  task: { mayHaveHours: true, why: 'a task is something somebody does, which is what hours are.' },
  block: {
    mayHaveHours: true,
    why: 'a block is one step of a pipeline, which is the usual size of a day of work here.',
  },
  obligation: {
    mayHaveHours: true,
    why: 'an obligation is owed to somebody, and discharging it takes time like anything else.',
  },
  direction: {
    mayHaveHours: true,
    why:
      'a direction is a line of exploration, and it takes hours WITHOUT an estimate: the total effort ' +
      'of an exploration is usually the thing you are exploring to find out. Nothing promotes it into ' +
      'another kind, and a surface showing it says its estimate is unknown rather than showing a zero.',
  },
  problem: { mayHaveHours: true, why: 'working on a problem is work, and it is planned like any other.' },

  // ---- the two containers, and this is the reason planning arithmetic can be read at all
  pipeline: {
    mayHaveHours: false,
    why:
      'a pipeline is a container. Six hours on the pipeline and two on one of its blocks is either ' +
      'eight hours or six, and nothing stored could say which was meant. Give the time to the block; ' +
      'the pipeline’s figure is the sum of its blocks, which is derived and cannot disagree.',
  },
  module: {
    mayHaveHours: false,
    why:
      'a module is a container. Six hours on the module and two on a task inside it is either eight ' +
      'hours or six, and nothing stored could say which was meant. Give the time to the task inside it; ' +
      'the module’s figure is the sum of its parts, which is derived and cannot disagree.',
  },

  // ---- the kinds that are not work somebody does
  criticism: { mayHaveHours: false, why: 'a criticism records what was found; give hours to the work addressing it.' },
  purchase: {
    mayHaveHours: false,
    why:
      'a purchase is money, not time. Ordering it, chasing it and unpacking it are work and take a ' +
      'task; the purchase itself records what was bought.',
  },
  session: {
    mayHaveHours: false,
    why:
      'a session is a record of work that has already happened. Hours on it would be a plan to do ' +
      'something that is over. Plan the work the session was about.',
  },
  work_domain: {
    mayHaveHours: false,
    why:
      'a work domain is not time somebody spends. It is a statement ABOUT the time somebody is ' +
      'spending — what an agent said it would touch, and what was accepted after criticism. Hours ' +
      'on it would be a second, hand-kept figure beside the work it describes. Give the time to the ' +
      'task or the block the work is about.',
  },
  claim: {
    mayHaveHours: false,
    why:
      'a claim is a result that could be wrong, not a job. Measuring it, or measuring it again, is ' +
      'a task; file that and plan it.',
  },
  proposal: {
    mayHaveHours: false,
    why:
      'a proposal is a fork waiting on a person. It is answered by a decision rather than by hours. ' +
      'If reaching the decision needs work done first, file that work as a task and plan that.',
  },
  decision: {
    mayHaveHours: false,
    why:
      'a decision is a choice already made. What follows from it is work, and that work is filed as ' +
      'tasks; plan those.',
  },
  idea: {
    mayHaveHours: false,
    why:
      'an idea is not yet work. Deciding to spend hours on it is deciding to do it, so file the task ' +
      'or the direction it becomes and plan that.',
  },
  wanna_try: {
    mayHaveHours: false,
    why:
      'a thing worth a try is not yet work, for the same reason an idea is not. File what trying it ' +
      'would actually be and plan that.',
  },
  message: {
    mayHaveHours: false,
    why: 'a message is something somebody wrote on the board. Whatever it asks for is filed on its own and planned.',
  },
  note: {
    mayHaveHours: false,
    why: 'a note is writing with a date on it. Whatever it describes doing is filed on its own and planned.',
  },
  // A REPORT IS WRITING ABOUT WORK, WHICH IS NOT THE WORK. Writing one does take an afternoon, and
  // that afternoon is a task: file the task, plan that, and link it to the report. Giving the hours
  // to the report itself would put the same afternoon in the week twice as soon as the task existed,
  // which is the arithmetic both containers above are kept out of the plan to protect.
  report: {
    mayHaveHours: false,
    why:
      'a report is writing about work rather than the work itself. Writing one takes time, and that time is a ' +
      'task: file the task and plan that, so the same afternoon is not counted twice.',
  },
  draft: {
    mayHaveHours: false,
    why:
      'a draft is writing that is not sent yet. Writing it takes time, and that time is a task: file the task and ' +
      'plan that, so the same afternoon is not counted twice.',
  },
  annotation: {
    mayHaveHours: false,
    why:
      'an annotation is a remark somebody left on something. It is a sentence, not a piece of work, and the work ' +
      'it asks for is its own record: file that and plan it.',
  },
  agent: {
    mayHaveHours: false,
    why:
      'an agent is who does the work, not the work. Hours belong to what it is being asked to do: file that as a ' +
      'task and plan that, and the agent is who it goes to.',
  },
  stopping_point: {
    mayHaveHours: false,
    why:
      'a stopping point is a record of where work stopped, which has already happened. Hours on it would be a ' +
      'plan to do something that is over. Plan whatever the `next` line says to do.',
  },
  placeholder: {
    mayHaveHours: false,
    why:
      'a placeholder is a slot somebody deliberately left unresolved, not a job. The work of resolving it is its ' +
      'own record — linked to it with `blocks` — and that is what a plan gives hours to. Hours here would put the ' +
      'same afternoon in the week twice as soon as the resolving work existed.',
  },
  ran_instead: {
    mayHaveHours: false,
    why:
      'a record of what ran instead of the canonical method is a statement about a run that already happened. ' +
      'Getting the canonical method working is work: file that and plan it.',
  },
  trajectory: {
    mayHaveHours: false,
    why:
      'a planned future is a shape, not a job. Hours on it would turn an intention into a schedule, and a ' +
      'schedule is a plan — which this product already has, with dates and hours of its own. Put the hours on ' +
      'whatever work is meant to make one of its states real.',
  },
  planned_state: {
    mayHaveHours: false,
    why:
      'a planned state says what would be TRUE, not what would be done, and hours are hours of doing. Nothing ' +
      'runs one. Put the hours on the task or block meant to realise it.',
  },
  context_bundle: {
    mayHaveHours: false,
    why:
      'a context bundle is a recipe for a reading of records that already exist. Making one costs a press, and ' +
      'the work is whatever somebody does with the text afterwards. Put the hours on that.',
  },
  role_card: {
    mayHaveHours: false,
    why:
      'a role card is a copy of a declaration, made so that it can be read in the product. Nobody does it and ' +
      'there are no hours in it. Put the hours on whatever the role is being given to somebody for.',
  },
  role_card_words: {
    mayHaveHours: false,
    why:
      'a role card\'s words are text the office shows wherever the card is drawn. Nobody does them. Put the hours ' +
      'on whatever the words are being changed for.',
  },
  role_request: {
    mayHaveHours: false,
    why:
      'a role request is an agent asking its starter for a higher rung, and one press answers it. Nobody spends ' +
      'hours on it. Put the hours on the work the rung is being asked for.',
  },
  incident: {
    mayHaveHours: false,
    why:
      'an incident is the investigation, not the work: what happened, why, and who answers for it. The hours go ' +
      'on the corrective actions it names — a decision, a problem, a change to the rules or the office — each ' +
      'already able to carry its own.',
  },
  notebook: {
    mayHaveHours: false,
    why:
      'secretary notes are what a secretary and the person have written down about working together. They are ' +
      'added to a few lines at a time as the work goes on, and nobody sets out to spend an afternoon on them. Put ' +
      'the hours on the work the entries are about.',
  },
  regulation: {
    mayHaveHours: false,
    why:
      'a regulation is a stated constraint, written down once and read back when it is relevant. It is not work ' +
      'with hours of its own. Put the hours on the work the constraint touches.',
  },
  goal: {
    mayHaveHours: false,
    why:
      'a goal is what would be true when it is met, not the work that makes it true. It has no hours of its own; ' +
      'give hours to the task, block, obligation or planned future that serves it through a `serves` link.',
  },
  flow: {
    mayHaveHours: false,
    why:
      'a flow is the office\'s own procedure written down as it actually happens — a definition, not a job. ' +
      'Reading and retuning one is its own task when it happens. Put the hours on the work that carries out a ' +
      'step of the flow, whenever that step becomes somebody\'s doing.',
  },
  flow_run: {
    mayHaveHours: false,
    why:
      'a flow run is what the office recorded about one run as it happened, not work somebody plans. Put the ' +
      'hours on the task or block the run did.',
  },
  host_job: {
    mayHaveHours: false,
    why: 'a host job is what the office recorded of a tool it ran for a run, not work somebody plans. Put the hours on the work the run did.',
  },
  notice_rules: {mayHaveHours:false,why:'Notice rules configure waking; they are not planned work.'},
  quick_note: { mayHaveHours: false, why: 'a quick note is what the person wrote and drew to keep a thought, not planned work. Give hours to the work it leads to.' },
  counter: {
    mayHaveHours: false,
    why:
      'a counter is a thing the office watches, not work somebody does. Nobody spends hours on it: it counts, ' +
      'and when a trigger holds it writes a line, files a task or asks for a job. Put the hours on whatever the ' +
      'firing produces — the task it files is an ordinary task and takes hours like any other.',
  },
  tool_category: {
    mayHaveHours: false,
    why:
      'a category is a heading in the toolset catalogue, not work somebody does. Put the hours on the task that ' +
      'builds or files a tool.',
  },
  tool: {
    mayHaveHours: false,
    why:
      'a tool record is one entry of the toolset catalogue and its manual page: it says what a tool is, not work ' +
      'to do. Put the hours on the task that builds the tool or changes it.',
  },
  checklist: {
    mayHaveHours: false,
    why:
      'a checklist keeps requests and where each one stands, and its items are not records. Put the hours on the ' +
      'task or the run that does the work an item asks for.',
  },
  booking: {
    mayHaveHours: false,
    why:
      'a booking holds the GPU for a time; it is not work. Put the hours on the task or the run that uses the card.',
  },
  secretary_duties: {
    mayHaveHours: false,
    why:
      "a secretary's duties say what its share of the work is; they are not work. Put the hours on the task or the run " +
      'that does the work.',
  },
  watch: {
    mayHaveHours: false,
    why: 'a watch says what keeps running and whose it is; it is not work. Put the hours on the task or the run it watches for.',
  },
  backlog_item: {
    mayHaveHours: false,
    why:
      "a backlog item says what a line has to do and when it is done; the time is spent by the round that does it. Put " +
      'the hours on that round or on the task it works from.',
  },
  handbook: {
    mayHaveHours: false,
    why: 'a handbook is guidance for whoever starts a flow or takes a card; it is not work. Put the hours on the task that writes it.',
  },
  project_chapter: {
    mayHaveHours: false,
    why: "a project chapter holds a project's rules; it is not work. Put the hours on the round that writes the rules.",
  },
  design: {
    mayHaveHours: false,
    why: 'a design says what was compared and what was chosen; the time is spent by the round that writes it. Put the hours on that round.',
  },
  design_review: {
    mayHaveHours: false,
    why: 'a design review is a judgement on one revision of a design; it is not work. Put the hours on the round that reviews it.',
  },
  design_reminder: {
    mayHaveHours: false,
    why: "a design reminder is the office's account of one reminder and its judgement; it is not work. Put the hours on the round it reminded.",
  },
}

/**
 * The kinds a plan may give hours to, in the order the product prints them.
 *
 * DERIVED, so it cannot disagree with the table above. `ALLOCATABLE_KINDS` in
 * src/server/lib/planning.ts is this same array under the name the routes already import, and
 * `tests/plan-hours.test.ts` requires them to be the same object rather than the same contents —
 * because a copy with the same contents today is exactly the drift that has to be impossible.
 */
export const KINDS_A_PLAN_CAN_GIVE_HOURS_TO: readonly RecordKind[] = Object.entries(PLAN_HOURS_BY_KIND)
  .filter(([, rule]) => rule.mayHaveHours)
  .map(([kind]) => kind as RecordKind)

/**
 * The same array under the name the server routes and the tests already use.
 *
 * IT LIVES HERE RATHER THAN IN `server/lib/planning.ts`, WHERE IT USED TO, FOR ONE REASON: that
 * module opens the database when it is imported. A test that only wanted this list of words was
 * therefore opening the operator's real corpus before it could say otherwise — measured on 18 August
 * 2026 across five test files that draw screens and touch no database at all. Nothing about the
 * value changed; only where it is declared, so that wanting it costs nothing.
 *
 * `server/lib/planning.ts` re-exports it, so every route that imports it from there is unaffected.
 */
export const ALLOCATABLE_KINDS = KINDS_A_PLAN_CAN_GIVE_HOURS_TO

/**
 * Whether a plan may give this kind hours, and why, for a kind that may not be one at all.
 *
 * A word that is not a record kind comes back as refused with a sentence saying nobody has said what
 * it is — not as allowed, and not as one of the declared refusals. The write path checks the
 * kind against the schema before it gets here; this is what stops a caller that does not.
 */
export function planHoursRuleOf(kind: string): PlanHoursRule {
  const rule = PLAN_HOURS_BY_KIND[kind as RecordKind]
  if (rule !== undefined) return rule
  return {
    mayHaveHours: false,
    why: `"${kind}" is not a kind of record Mole Office knows about, so nothing has said whether a plan may give it hours.`,
  }
}
