// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Mole Office shared vocabulary.
 *
 * This file is the contract. The server and the browser both import it, so there is exactly
 * one definition of what a record is and what a link means.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE DESIGN DECISION WORTH REVIEWING AT CHECKPOINT 1
 * ---------------------------------------------------------------------------------------
 *
 * Every kind of thing in Mole Office -- a module, a problem, a task, a session, an idea -- is
 * stored in ONE table called `records`, distinguished by a `kind` column, with the fields
 * specific to that kind held in a JSON `data` column.
 *
 * The alternative was one table per kind. It was rejected for a measured reason. The review
 * of this project found that each new record type has to be handled in about ten places:
 * schema, migration, API, validation, markdown export, markdown import, search index,
 * restore test, empty state, and phone layout. With about twelve record types that repetition
 * was estimated at two to three weeks of work that produces nothing new.
 *
 * With a shared base, adding a record type means adding one entry to `RECORD_KINDS` below and
 * one KindSpec in `src/shared/kinds.ts`. Everything else -- links, history, export, search,
 * backlinks -- works on it immediately because it works on all records.
 *
 * The cost of this choice: fields inside `data` are not checked by the database itself, only by
 * `validateData` in shared/kinds/validation.ts, which the server runs on every write through
 * src/server/lib/validate.ts. That trade is worth it at this size. It would not be at a hundred
 * times the size. The cost only stays paid while that check exists — for two months it did not,
 * and a POST of {"contxet":"typo","parts":"should be an array"} was answered with a 201.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE DOES NOT DEFINE
 * ---------------------------------------------------------------------------------------
 *
 * It says what a record STORES. It does not say what any of it MEANS. What a state word says
 * about whether work stopped short, who is hurt if something is left alone, what a pause is and
 * how hard a dependency is are all defined once in `./work.ts`, and the shapes below import them
 * rather than declaring a second copy. Two declarations of a stored shape always drift apart,
 * which is the defect this codebase keeps producing.
 *
 * TWO VOCABULARIES BREAK THAT RULE ON PURPOSE, AND BOTH SAY SO WHERE THEY ARE DECLARED. A
 * direction's DEPTH ladder and a record's ORIGIN carry their meanings here, beside the words, and
 * neither goes anywhere near `STATE_MEANING` in work.ts. The reason is the same for both and it is
 * measured rather than tidy: the depth ladder WAS in that table, where `measured` meant "level four
 * of six, the work continues" for a direction and "the measurement was taken, the work is done" for
 * a claim, and one word with two meanings is what that table is flat to prevent. Keeping these two
 * ladders here, each with its own reader, is what stops the second attempt at folding them in.
 */

import type { Audience } from './audience.ts'
import type { MeasureAsked } from './beside.ts'
import type { ClaimProblemCode } from './paths.ts'
import type { Consequence, Gate, GateStage, Pause } from './work.ts'
import type { ParticipantKind, ParticipantRef } from './participants.ts'
import type { ModulePlanning } from './planning-flow.ts'
import { STILL_GOING_STATES as THE_STILL_GOING_STATES, saysStillGoing } from '../config/still-going.mjs'

// ---------------------------------------------------------------------------- record kinds

/** Every kind of thing Mole Office stores. Adding one here is most of the work of adding a type. */
export const RECORD_KINDS = [
  'knowledge_entry',
  'knowledge_category',
  'knowledge_bookmark',
  'knowledge_change',
  'knowledge_query',
  'knowledge_rating',
  'whole_suite_receipt',
  'sealed_tip',
  // ONE CHANGESET WAITING TO BE CARRIED INTO THE MAIN WORLD, and where it has got to. Sandbox v1,
  // piece P6, on decision R3 of 21 September 2026: the queue carries a changeset — a git
  // branch or a manifest of files — and every entry is written by the merge queue's own doors and by
  // nothing else. ./merge-queue.ts holds its words; KIND_SPECS.merge_entry in kinds.ts its fields.
  'merge_entry',
  // ONE EMERGENCY PUSH TO MAIN, past the merge queue, because an emergency fix goes straight to main
  // (wave 13u round 82, item 16): who pushed, the chat message, the commit, main before it and the
  // emergency switch's row. Written only by its own doors. ./emergency-push.ts holds its words.
  'emergency_push',
  'module',      // a subsystem, hardware or software
  'pipeline',    // an ordered set of blocks producing an outcome
  // One step of one pipeline. Its own record BECAUSE problems and claims attach to the step rather
  // than to whatever implements it, and a nested object cannot be the end of a link. NOT a summary
  // block (SUMMARY_BLOCK_TYPES below) and NOT a home-page panel (PanelGrid): three different things
  // share this word, and only this one is a record. See shared/blocks.ts.
  'block',
  'session',     // one agent working session
  'problem',     // something wrong or blocking
  'task',        // something to do
  'purchase',    // something to buy
  'obligation',  // something owed, with a due date
  'claim',       // a result that could be wrong, that something depends on
  // The FORK, before the choice: what has to be decided, the defensible options, and — where the
  // writer has one — a recommendation. An AGENT may write one, and that is the whole point of the
  // kind: a `decision` is a governance act and stays human-only, so an agent that reached a fork
  // had two options, filing nothing or filing a `note`, and nothing queries notes. Four choices
  // that shaped this codebase were recorded that way and a later reader could not tell them from
  // choices the owner had made. See KIND_SPECS.proposal in kinds.ts for how one is resolved, which
  // is a link that already exists and never a second stored fact.
  'proposal',
  'decision',    // a choice made, and why. Human-writable only.
  'idea',        // a research idea
  'criticism',   // product friction and a requested change; a problem records something wrong or blocking
  'direction',   // a line of exploration, with a depth level
  'wanna_try',   // something to try that is not yet an idea
  'message',     // an entry on the message board
  'note',        // free writing with a date. Diary entries are notes.
  // Something written for a person to read: a review, a report, a write-up. It carries the SAME
  // blocks a module's curated summary carries — prose, a chart, an equation, a table, a picture —
  // in a field called `blocks`, and it says who it is for and which day it is about.
  //
  // IT IS NOT A NOTE and it is not a module's summary. A note is free writing that nothing queries,
  // so a review filed as one is a review nobody can find. A module's summary says where that
  // subsystem stands NOW and is rewritten as the subsystem changes, while a report is dated and
  // stays as it was written. See KIND_SPECS.report in kinds.ts, which carries the whole argument.
  'report',
  // WRITING THAT IS NOT SENT YET. An agent keeps a draft in the office while it works, and one door
  // turns it into a message, a report or a note. The draft is kept after that, linked to what it
  // became. A decision settles six points about drafts; ./drafts.ts holds
  // its words and KIND_SPECS.draft in kinds.ts its fields.
  'draft',
  // SOMEBODY POINTED AT SOMETHING AND SAID SOMETHING. The atomic fact of reviewing.
  //
  // IT IS NOT A MESSAGE, and that is the whole reason it is its own kind. Round seven stored a review
  // comment as a row in `agent_messages`, so a comment only existed inside a conversation with an
  // agent: it could not outlive the thread, could not be collected by a second review, and was
  // refused outright when the agent it named could not be reached. Whether what somebody wrote is
  // ever sent to anybody is a LATER AND SEPARATE QUESTION. See KIND_SPECS.annotation in kinds.ts.
  'annotation',
  // A DURABLE AGENT: the identity that outlives any one process.
  //
  // A `session` is one run of a tool and it dies with the process. Until this kind existed, the
  // only way to address an agent was to name one of its past runs, so a comment written on Tuesday
  // to the agent that wrote a report could not be delivered on Wednesday: the run was gone. This is
  // the thing that stays. Its handle is the short name a person types, its inbox is a query over
  // `agent_messages`, and whether anybody is listening as it right now is worked out from the
  // requests this server is holding — never stored, because a stored answer to that goes stale the
  // moment a process dies. See KIND_SPECS.agent in kinds.ts.
  'agent',
  // WHERE A STRETCH OF WORK STOPPED, written so the next stretch can pick it up.
  //
  // What was being done, what the next safe action is, what changed, what is unfinished, what
  // failed. It is an ordinary record with an `about` link, so it is drawn wherever a linked record
  // is drawn. NOT a session: a session is the process, and several stopping points belong to one.
  'stopping_point',
  // A DELIBERATE UNRESOLVED SLOT, and what it stops the project claiming.
  //
  // The owner's Placeholder, addendum G.1: "a deliberate unresolved slot, optionally carrying a
  // temporary substitute, whose incompleteness and validity boundaries are explicit". It is NOT
  // the incompleteness `completenessOf` already reports — that is a field nobody got round to,
  // and this is a field left out on purpose with the cost written down. It is not a state of the
  // thing it is about, it is not work, and it is not example data. See KIND_SPECS.placeholder.
  'placeholder',
  // THE CANONICAL METHOD FOR A STEP IS ONE THING AND THE THING THAT ACTUALLY RAN WAS ANOTHER.
  //
  // The owner's Fallback, addendum G.11. NOT called `fallback`, because that word is already
  // going on a screen in this product meaning "an agent went outside Mole Office for something", and
  // two record-level concepts named Fallback on two screens is the collision this campaign is
  // about. It never writes `data.method` on the block it is about. See KIND_SPECS.ran_instead.
  'ran_instead',
  // ONE STRETCH OF TOP-LEVEL WORK: what an agent said it would do, what the machine resolved, what
  // the criticism decided, and what was accepted.
  //
  // IT IS NOT A LOCK, a lease or a reservation. Two agents may accept domains that collide; both
  // writes succeed and both are told. This repository has the measurement that says why: nine rows
  // of `session_resources` were never released, one of them a process registered on 11 August for a
  // process that was already gone, and three of them claim port 8787 from three different sessions.
  // A lock nobody releases is worse than no lock, because a reader believes it.
  //
  // IT IS NOT A SESSION AND NOT A TASK. A session is the process; one session may file several
  // domains over its life. A task is something somebody has to do; a work domain is a statement
  // about work already under way, which is why it takes no hours — see PLAN_HOURS_BY_KIND.
  //
  // Its revisions ARE its history: revision 1 is the hypothesis the agent wrote, the resolve route
  // writes the machine's reading as a later revision, and acceptance is a later one again. See
  // KIND_SPECS.work_domain in kinds.ts.
  'work_domain',
  // ONE INTENDED FUTURE FOR ONE THING: an ordered set of intended states, held together so that our
  // idea of the future can change as a whole and be versioned as a whole.
  //
  // IT IS NOT A SCHEDULE — `plans` and `plan_lines` own dates and hours. It is not a proposal, which
  // is a fork waiting on a person. And it is not a record of anything that happened: nothing in a
  // trajectory has occurred, which is what `worldOf` in src/shared/world.ts says in one function and
  // what every guard named `assertMayShapeTheFuture` protects.
  'trajectory',
  // ONE INTENDED STATE INSIDE ONE TRAJECTORY: what would be true when this part is real.
  //
  // `planned_state`, NOT `planned_step`. `KIND_WORDS.block` and `DISPLAY_WORDS.block` are both the
  // word `step`, with a test that fails if they stop matching, so a kind called `planned_step` would
  // put the product's own word for a block onto intentions — on pages beside a column headed
  // `steps done` that counts blocks. Planned State is the owner's own phrase.
  //
  // NOTHING RUNS ONE. It has no progress state, it can never be a member of a pipeline (`checkBlockIds`
  // refuses any id that is not a block), and whether it has come true is worked out from links and
  // never stored.
  'planned_state',
  // WHAT SOMEBODY WANTED A COPY OF, so the same copy can be made again against a project that has
  // moved, and so an answer coming back can be joined to the context it was based on.
  //
  // IT HOLDS NO PROJECT CONTENT. It is a scope, a preset and a list of what was handed over. The
  // text is resolved on demand from the records the scope names, never stored, because a stored
  // copy is a second account of what a record says and it is stale the moment the record is
  // edited. See KIND_SPECS.context_bundle in kinds.ts.
  //
  // IT IS NOT A REPORT AND IT IS NOT A MESSAGE. A report is writing somebody did. A message goes
  // to somebody. A bundle is a recipe for a reading, and Mole Office never claims it was delivered.
  'context_bundle',
  // ONE ROLE CARD, COPIED FROM THE DECLARATION SO THAT THE PERSON CAN READ IT IN THE PRODUCT.
  //
  // THE RECORD IS NOT THE AUTHORITY AND MUST NEVER BECOME ONE. What an agent of a role may do is
  // design/permissions/roles.json and nothing else; this kind is a copy of one card, filed so that a
  // card is a thing in the graph — findable, linkable, readable on a page — rather than a file only
  // somebody with a checkout can open. Writing for the person is published inside
  // Mole Office.
  //
  // SO IT SAYS WHEN IT IS STALE RATHER THAN BEING KEPT IN STEP BY HAND. `copiedAt` and the card
  // itself are compared to the declaration on every read of GET /api/roles, and a record that no
  // longer matches is reported as out of date. That is the third of the three answers CLAUDE.md
  // allows for one fact in two places: make something fail when they disagree.
  'role_card',
  // THE WORDS OF ONE ROLE CARD, AS THE OFFICE HOLDS THEM, which the person may change on the record's
  // page. A card's powers stay in the declaration and are never read from this record; its words are
  // read from here. The office files one per card at its first start (src/server/lib/card-words.ts).
  'role_card_words',
  // AN AGENT ASKING ITS STARTER FOR A HIGHER RUNG, AND THE STARTER'S ANSWER. Criterion P65: an agent registers
  // as a worker by default and may ask whoever started it for a higher rung; if the starter agrees, it
  // rises to supervisor.
  //
  // ITS OWN KIND AND NOT A `proposal`. A proposal is a fork waiting on the PERSON, and this waits on
  // the agent that started the asker — which is the whole point: an agent talks to whoever started it. It is
  // not a `task` either: nobody has to do anything, one press answers it, and what a grant does is
  // computed rather than carried out.
  'role_request',
  // ONE SECRETARY'S NOTEBOOK: how this person works, and who the secretary is at work.
  //
  // Each secretary gets a notebook of its own, under its name, that records the person's preferences, how to
  // answer them, and what the secretary may do itself and what the person does, as a secretary in the real
  // world would; the person can read and change it. It also records what the secretary felt in its work, its
  // own character and its way of replying, like a soul.md, so that after a change of model the secretary soon
  // recovers how to work with the person and its own character.
  //
  // IT IS NOT A `note`, AND THAT IS THE WHOLE REASON IT IS ITS OWN KIND. A note is free writing that
  // nothing queries — the comment on `note` above says exactly that — and this is queried three
  // times on every run: the brief reads it for the agent the brief is read for, the role card counts
  // it, and the doors refuse a second one for the same agent. A marker field on a note would put
  // those three readings on a shape nothing declares, and GET /api/kinds would describe none of it.
  //
  // ONE PER SECRETARY AGENT, refused by `checkTheNotebook` in server/lib/records/notebook-entries.ts on both write
  // paths, which also refuses a notebook for an agent that does not hold the secretary card.
  'notebook',
  // SEVERAL DEFECTS ACTING TOGETHER CAUSED A LARGE LOSS, AND THE SCENE IS RECONSTRUCTED.
  //
  // Criteria I1 to I7, design/incidents/ACCEPTANCE.md. An incident is not a bigger `problem`: a
  // problem is one thing wrong; an incident is the timeline of what happened, the loss in the person's own
  // words, expected against actual, the causes, responsibility weighed for the person, the agents
  // and the office each with its uncertainty, the corrective actions, and whether the fix has been
  // verified to hold. The first incident is an
  // experiment of 9 September, kept until now as report lw8MnlO28ZxC and problem 4PJiqATNy7YH
  // because no kind held it.
  //
  // IT IS NOT A SECOND `report`. A report is writing done once and read; an incident is a record
  // other records keep pointing at as its own investigation moves: a problem linked `about` it goes
  // `fixed` without closing it (criterion I2 — the fix and the incident's own state are two facts,
  // and conflating them is the defect I2 exists to prevent), and its `timeline` keeps gaining
  // moments, each with the record that is its evidence, for as long as anybody is still finding out
  // what happened.
  //
  // FILED BY A SECRETARY OR THE PERSON, refused to every other agent by `checkWhoMayFileAnIncident`
  // in server/lib/records/who-files-an-incident.ts, on both the create path and a kind change into `incident` — criterion
  // I4. Every agent may still append a timeline moment (`POST /api/records/:id/timeline`) and link a
  // problem; only filing and changing `responsibility` are narrower. `checkTheIncidentHasLossAndTimeline`
  // in server/lib/records/creating.ts refuses a CREATE that has no `loss` or no `timeline` — criterion I1's own door
  // test — and refuses it only there: a kind change into `incident` is left to the ordinary
  // completeness reading, for the reason written above that function, so this kind stays part of
  // the ordinary kind-change sweep every other kind is part of.
  'incident',
  // A PERSON'S CONSTRAINT ON THEMSELVES: the sentence in their own words, whom it binds, since when, and
  // whether it still stands. G2 of design/regulations/ACCEPTANCE.md.
  //
  // An agent may file or change one on the person's quoted words. The decision of
  // 23 October 2026 also lets a secretary using its own key revoke on a change with words naming
  // that revocation and record. The grant never revokes; an agent never files one already revoked.
  // `assertMayRevokeARegulation` in src/server/lib/regulations.ts guards the two revocation fields.
  //
  // IT IS NOT A CHAPTER, AND A CHAPTER IS NOT THIS. See shared/regulation.ts for why the two rule
  // kinds are not folded into one, now that G1 gives both the one name "office regulations".
  'regulation',
  // WHAT WOULD BE TRUE WHEN IT IS MET, AT ONE OF FOUR HORIZONS: short, medium, long or distant.
  // Criterion P1 of design/planning/ACCEPTANCE.md.
  //
  // This module lacked three large fields: short-term, medium-term and long-term goals.
  // Decision JN_pkWYtQhd3 answered it: the spans are settings; long is within a
  // year; distant is a fourth horizon with no time limit, holding the abstract aims, whose changes
  // are kept as a revision the person can read.
  //
  // WORK SERVES A GOAL, through a `serves` link from a trajectory, an obligation, a task or a
  // cluster (a `module` record). The goal does not contain the work: the plan graph starts from the
  // goals, beside the obligations and directions that anchor it, so the drawing is what the period
  // is working TOWARD rather than only what it owes and what it has planned.
  //
  // AN AGENT MAY FILE ONE, and it is marked as the agent's until the person confirms it, through
  // two fields in the goal's own data — `filed_by` and `confirmed_by` — and never through
  // ownership: an agent-written record is given to the person at once
  // (src/server/lib/records.ts), and changing that would move every kind. See
  // `assertMayConfirmAGoal` in src/server/lib/goals.ts for the mark and the person's press.
  //
  // IT IS NOT HUMAN-ONLY. It is deliberately absent from `HUMAN_ONLY_KINDS` below: an agent
  // planning its own work is the whole point of P1 and P3, and the mark, not a human-only gate, is
  // what keeps an agent-filed goal distinguishable from one the person has confirmed.
  'goal',
  // ONE OFFICE FLOW AS ONE RECORD: where it is declared, who runs it, what it produces, and whether
  // code governs it. NO GATE, on the settled proposal 1LaCQBRYRjls option A
  // filing a flow blocks
  // nothing and the office checks nothing against it in this piece. It sits with the office's own
  // kinds in `notes` of KIND_FAMILIES (shared/work.ts), beside `regulation` and `role_card`, and
  // NOT with the research kinds: it is the office reading itself rather than the lab reading the
  // world. ./flow.ts is where its one open vocabulary lives. `role_card` left `notes` on
  // 1 October 2026, at item 3 of a decision, and is read on its own page at
  // #/roles.
  'flow',
  // ONE RUN'S FLOW RUN: which flow a run followed, at which revision, and each step as it happened. Wave 1
  // of the office flow, M1, on design B: record first, no gates. The
  // office files one beside every session record and is its only writer: `assertMayWrite` in
  // src/server/lib/records/may-write.ts refuses every other write to the kind. ./flow-run.ts holds its words. It
  // sits in `notes` of KIND_FAMILIES beside `flow`, because it is the office reading itself.
  'flow_run',
  // ONE ASK FOR A REGISTERED HOST TOOL, AND WHAT CAME OF IT. Only the host-job doors write it
  // (src/server/lib/host-jobs.ts); src/shared/host-jobs.ts holds its fields and words.
  'host_job',
  'pack',
  // A COUNTER AND ITS TIMED TRIGGERS: what it counts, who may add to it, what makes it fire and what
  // it does then. Criteria CT1 to CT10 of design/counters/ACCEPTANCE.md: Mole Office gains
  // counters.
  //
  // WRITTEN ONLY BY ITS OWN DOORS, the way a `merge_entry` is, and for a related reason: CT6 puts a
  // guard on every change — only whoever filed it, a secretary or the owner — and asks for a reason
  // on each one, and POST /api/records could carry neither. `assertMayWrite` in
  // src/server/lib/records/may-write.ts refuses every other write to the kind, whoever asks.
  //
  // ITS COUNT AND ITS AMOUNT ARE NOT IN ITS `data`. Every addition, firing and held-back firing is
  // one row of `counter_rows`, and the two numbers are worked out from the rows after the last
  // firing (decision `uLV_1NVD8jeV`, point 1): a growing history inside `data` would store
  // the whole of it again as a revision on every addition.
  //
  // It sits in `notes` of KIND_FAMILIES (shared/work.ts) beside `flow`, because it is the office's
  // own bookkeeping rather than something to do. ./counters.ts holds its vocabularies and shapes.
  'counter',
  'notice_rules',
  'quick_note',
  // ONE CATEGORY OF THE TOOLSET CATALOGUE: its name, one sentence on what belongs in it, and the
  // decision that confirmed it. Anyone proposes a category, the
  // secretary collects the proposals, and the owner confirms one. A category with no
  // `confirmedBy` is proposed and not confirmed. The catalogue's records stay in the
  // office.
  // ./toolset.ts holds its words; KIND_SPECS.tool_category in kinds.ts its fields.
  'tool_category',
  // ONE ENTRY OF THE TOOLSET CATALOGUE, AND ITS MANUAL PAGE: the ten items of the draft's block b-4
  // (report i69HYz8BQhSx), with whether it is built yet and where its code is kept. A use of a tool
  // is one line on the calling run's record (decision Vt0GdSlApWce point d), never a record.
  'tool',
  // ONE PERSON'S OR ONE AGENT'S CHECKLIST: its items, each one request with its words, the message it
  // came in, where it stands and what shows it was done.
  // ./checklists.ts holds its rules; KIND_SPECS.checklist in kinds.ts its fields.
  'checklist',
  // ONE BOOKING OF THE HOST GPU: who, how long, how many GiB, what for, and the program doing the work, by the
  // owner's decisions. ./bookings.ts holds its lists;
  // KIND_SPECS.booking its fields.
  'booking',
  // WHAT ONE SECRETARY DOES IN A PROJECT: its area, what it answers for, its lines and the person's decisions it rests
  // on. Item 2 of wave 13s's requirements. src/server/lib/grant/secretary-duties.ts guards it; KIND_SPECS its fields.
  'secretary_duties',
  // ONE WATCH OR TIMER AN AGENT KEEPS RUNNING: what it does, whose it is, how it runs and whether it is running. Item 38
  // of wave 13s's requirements. ./watches.ts holds its lists; KIND_SPECS.watch its fields.
  'watch',
  // ONE ITEM OF A LINE'S BACKLOG: its line and number, who placed it and why, what counts as done, its order and where it
  // stands. Item 38 of wave 13s's requirements. ./backlog.ts holds its states; KIND_SPECS.backlog_item its fields.
  'backlog_item',
  // GUIDANCE FOR WHOEVER STARTS A FLOW OR TAKES A ROLE CARD: whom it is for, where it stands, its text by language, the
  // places it hangs on and why each text change was made. ./handbooks.ts holds its lists and its check;
  // KIND_SPECS.handbook its fields.
  'handbook',
  // ONE PROJECT'S OWN CHAPTER OF RULES, ONE DESIGN, AND ONE REVIEW OF ONE REVISION OF A DESIGN. The design-first build
  // of wave 13s's requirements. ./project-rules.ts holds their closed lists; KIND_SPECS their fields.
  'project_chapter',
  'design',
  'design_review',
  // ONE REMINDER OF A MISSING REVIEWED DESIGN, OR ONE MISS, and its judgement. Part 6 of the same build.
  // ./design-reminders.ts holds its closed lists; KIND_SPECS.design_reminder its fields.
  'design_reminder',
  // ONE DEPARTMENT OF A PROJECT: its names, what it does, its codes, the department above it, its supervisor and its
  // state. Step 1 of departments and posts, wave 13s round 281. ./departments.ts holds its lists; KIND_SPECS.department
  // its fields; src/server/lib/grant/departments.ts guards it.
  'department',
  // ONE KEY ITEM OF A PROJECT: its title, its place in the order, its progress and an estimate of the time left. Point
  // HD-2c of home as a data dashboard, wave 13s round 281. ./key-items.ts holds its lists and read shapes;
  // KIND_SPECS.key_item its fields; src/server/lib/key-items.ts writes and reads it.
  'key_item',
] as const

export type RecordKind = (typeof RECORD_KINDS)[number]

/**
 * THE KINDS A WRITE OF IS A GOVERNANCE ACT. Enforced on the server.
 *
 * THIS COMMENT USED TO READ *"Record kinds only the human may create or change"*, and that stopped
 * governing on 27 August 2026. What every kind in this list still gets, on every verb: a request
 * that named nobody is refused, a request in a name Mole Office cannot place is refused, a request from
 * another machine is refused, and deleting, restoring, moving or promoting one is refused to every
 * agent.
 *
 * WHAT CHANGED IS WRITING ONE. An agent may now write a `decision` it can say what it stands on —
 * `authority`, one of five words, with what that word needs beside it — and may write down a
 * decision the OWNER made only by citing a durable record of the owner making it. A decision with no
 * authority is refused to every agent. The rule that moved it: an agent may close
 * a question when it can cite sufficient authoritative evidence, and it may not manufacture
 * authority that the evidence does not contain. The rule is `assertMayDecide` in
 * src/server/lib/records/the-persons-own-acts.ts and it is the only place it is written.
 */
export const HUMAN_ONLY_KINDS: RecordKind[] = [
  'decision',
  // A REGULATION IS THE PERSON'S OWN CONSTRAINT ON THEMSELVES (or, bound to a role, on the office). An
  // agent gets the ordinary 403 unless it carries a warrant on the person's quoted words — the generic path
  // below, `VERBS_THE_OWNERS_WORDS_COVER.includes(verb) && actsForThePerson(actor)` in
  // src/server/lib/records/may-write.ts, which `decision` also uses. Unlike `decision` it has no second,
  // citation-based way in: `assertMayDecide` is not asked about a regulation, because a constraint an
  // agent talked itself into believing the person meant is exactly what G2 exists to prevent.
  'regulation',
]

// ---------------------------------------------------------------------------- link types

/**
 * A link is stored once, in one direction. The reverse is shown, never stored.
 *
 * Storing `A blocks B` and `B blocked-by A` as two rows would mean two things to keep in
 * step, and they would eventually disagree. So each type below declares the label to show
 * when you are looking at the record on the receiving end.
 *
 * `relates_to` is symmetric and is the default when you link two things without saying how.
 * It is what typing a name in a text field produces.
 */
export const LINK_TYPES = {
  relates_to: {
    forward: 'relates to',
    reverse: 'relates to',
    symmetric: true,
    description:
      'The honest generic. It means somebody joined these and did not say how, which is a true and useful thing ' +
      'to record — it is what typing a name in a text field produces. Reach for a stronger type only when you are ' +
      'asserting the fact that type names.',
  },
  part_of: {
    forward: 'part of',
    reverse: 'has part',
    symmetric: false,
    description: 'The part, to the whole it belongs to.',
  },
  produces: {
    forward: 'produces',
    reverse: 'produced by',
    symmetric: false,
    description: 'The work, to what it made.',
  },
  consumes: {
    forward: 'consumes',
    reverse: 'consumed by',
    symmetric: false,
    description:
      'The work that depends on a result, to the result. This is the type the whole model exists for: ' +
      '`GET /api/queries/unconsumed` finds a result nothing depends on and `GET /api/queries/unmet` finds work ' +
      'depending on something now gone. Both are blind unless the agent that used a result links it. Not the ' +
      'same fact as `measures`, which says one thing evaluated another rather than depended on it.',
  },
  blocks: {
    forward: 'blocks',
    reverse: 'blocked by',
    symmetric: false,
    description:
      'The thing in the way, to the thing it holds up. The only type that may carry a `gate` saying how much it ' +
      'blocks. What a record holds up is most of what decides whether it reads as urgent: a real defect, filed ' +
      'with nothing else changed, moved from row 7 of the remainder to row 2 of the visible list on ' +
      'GET /api/attention — 18 points to 48 — the day one truthful `blocks` link was added. Say `about` instead ' +
      'when the record merely concerns the other one rather than holding it up.',
  },
  // THE TWO WORDS THE DOGFOOD REACHED FOR AND DID NOT HAVE, and there are two and no more.
  //
  // `resolves` — this work, change or finding ENDED that problem. It is the counterpart of `blocks`
  // and reads the same way round: the thing that acted, then the thing acted on. Without it the two
  // records were joined by `relates_to`, which says only that somebody linked them, so "what fixed
  // this" could not be asked at all.
  //
  // `about` — this problem, finding or piece of work IS ABOUT that module, block or thing. It is
  // the honest weak statement `blocks` was being stretched to make: a problem filed against the
  // tray clamp module does not necessarily hold the module up, and recording it as `blocks` says it
  // does. `discusses` is not the same word either — that is a note or a message talking ABOUT
  // something, one record of writing pointed at its subject, and it was never meant to carry a
  // problem's scope.
  //
  // `relates_to` STAYS THE HONEST GENERIC and neither of these replaces it. It is what typing a
  // name produces and it means "somebody joined these and did not say how", which is a true and
  // useful thing to be able to record. Only reach for `about` or `resolves` when you are asserting
  // the stronger fact they name.
  resolves: {
    forward: 'resolves',
    reverse: 'resolved by',
    symmetric: false,
    description:
      'The work or finding that ended a problem, to the problem it ended. Reads the same way round as `blocks`: ' +
      'the thing that acted, then the thing acted on. Use it only when the problem stopped being a problem ' +
      'BECAUSE OF this — work that merely touched the problem did not resolve it.',
  },
  about: {
    forward: 'about',
    reverse: 'subject of',
    symmetric: false,
    description:
      'The problem, finding or piece of work, to the module or thing it concerns. The honest weak statement ' +
      '`blocks` is often stretched to make: a problem filed against a module does not necessarily hold that ' +
      'module up, and recording it as `blocks` says it does. Not the same as `discusses`, which is one piece of ' +
      'writing pointed at its subject rather than a problem’s scope.',
  },
  supersedes: {
    forward: 'supersedes',
    reverse: 'superseded by',
    symmetric: false,
    description:
      'The newer thing, to the thing it replaces. Not the same fact as `duplicate_of`: this says one version ' +
      'replaced the other, and keeps which record is the original.',
  },
  contradicts: {
    forward: 'contradicts',
    reverse: 'contradicted by',
    symmetric: false,
    description:
      'The finding, to the finding it disagrees with. Keep both records rather than picking a winner you cannot ' +
      'point at evidence for.',
  },
  measures: {
    forward: 'measures',
    reverse: 'measured by',
    symmetric: false,
    description:
      'The measurement, to what it measures. Not the same as `consumes`: this says one thing evaluated another, ' +
      'which is how you found out, rather than something built on top of it.',
  },
  implements: {
    forward: 'implements',
    reverse: 'implemented by',
    symmetric: false,
    description:
      'The module, to the pipeline block it carries out. Many-to-many: a block may be carried by several ' +
      'modules or by none, and none is a real answer rather than a gap to fill. Only a module to a block: any ' +
      'other pair is refused, and work done for a decision or an idea is `about` it.',
  },
  discusses: {
    forward: 'discusses',
    reverse: 'discussed by',
    symmetric: false,
    description:
      'The note or message, to what it is about. One piece of writing pointed at its subject — never a ' +
      'problem’s scope, which is `about` or `blocks`.',
  },
  derived_from: {
    forward: 'derived from',
    reverse: 'source of',
    symmetric: false,
    description: 'The derived thing, to what it came from.',
  },
  // ---------------------------------------------------------------- the three intended types
  //
  // Nothing on any of these three has happened. See `worldOf` in src/shared/world.ts, the `intent`
  // line family in src/web/components/graph/lines.ts, and `checkLinkKinds` in
  // src/server/lib/links.ts, which is what stops one intention from being said to have realised
  // another.
  plans_for: {
    forward: 'plans for',
    reverse: 'planned future',
    symmetric: false,
    description: 'The planned future, to the pipeline, module or block it is a future for. Nothing on either end has happened yet.',
  },
  // THE THING THAT HAPPENED, THEN THE INTENTION IT ANSWERED. Same direction as `resolves`: the
  // thing that acted, then the thing acted on.
  realises: {
    forward: 'realises',
    reverse: 'realised by',
    symmetric: false,
    description:
      'The thing that happened, to the planned state it made real. Reads the same way round as `resolves`: the ' +
      'thing that acted, then the thing acted on.',
  },
  // THE SAME QUESTION, ASKED TWICE. Not the same as `supersedes`, and collapsing the two would lose
  // which one is the original: *a newer version replaced it* and *somebody asked this already* are
  // different facts, and only the second one means the two records should have one answer between
  // them. `A duplicate_of B` says A is the repeat and B is the one to answer; B reads back as
  // *also asked as* A, so the canonical item carries the list of times the question came round again.
  //
  // MEASURED, AND THIS IS WHY IT EXISTS. On 27 August 2026 the owner's queue held three forks asking
  // the same question about which repository 152 module claims belong to — Wq2WNIJngXtd,
  // CUi3VI1lsM9U and E4Tjt9D1Yvrs — and Mole Office had no way to say so. Explicit
  // supersedes and duplicate links count as deduplication evidence, and only one of the two existed.
  //
  // A LINK IS ONLY EVER WRITTEN BY AN ACTOR THAT RECORDS WHY. Nothing in Mole Office writes one from a
  // resemblance: uncertain items are never merged silently.
  duplicate_of: {
    forward: 'duplicate of',
    reverse: 'also asked as',
    symmetric: false,
    description:
      'The repeat, to the one to answer. Not the same fact as `supersedes`: this says the two are the same ' +
      'question asked twice, and the record you name as the OTHER end is the one that keeps answering it. Never ' +
      'write this from a resemblance — only once you have read both and can say why.',
  },
  // WHAT WAS DONE INSTEAD. A separate type from `supersedes` on purpose: `supersedes` is in the
  // `builds` family, whose stated meaning is *the tail makes the head*, so `blkX supersedes pC`
  // would be drawn as *blkX makes pC* — the opposite of what it means. A second type costs one row
  // in a table; an overloaded one costs a wrong drawing that nothing fails on.
  instead_of: {
    forward: 'instead of',
    reverse: 'answered instead by',
    symmetric: false,
    description:
      'The thing that happened, to the planned state it answered a different way. Kept apart from `supersedes` ' +
      'on purpose: `supersedes` says the tail MADE the head happen, which is the wrong shape for "we did ' +
      'something else instead."',
  },
  // WHAT IS WORKING TOWARD THIS GOAL. Criterion P1.
  //
  // It runs from the work TO the goal — a trajectory, an obligation, a task or a cluster (a `module`
  // record), to a `goal` — and reads the same way round as `resolves`: the thing that acts, then the
  // thing acted on. `checkLinkKinds` in src/server/lib/records/planning-guards.ts refuses every other pair, with one
  // sentence naming what may serve a goal. A PLAN is not a record, so a plan document cannot be an
  // end of this link today; see the report of this piece for what a plan serving a goal would need.
  serves: {
    forward: 'serves',
    reverse: 'served by',
    symmetric: false,
    description:
      'The work, to the goal it works toward. The work may be a trajectory, an obligation, a task or a cluster ' +
      '(a `module` record); the goal is a `goal` record. It is the edge the plan graph reads to hang work under ' +
      'what the period is working toward. A plan document is not a record, so it cannot be an end of this link ' +
      'yet — file the lines it holds as the work that serves the goal.',
  },
  // TWO DECISIONS THAT BOTH STAND (wave 13j round loop-4). The nightly governs check
  // lists every pair of live decisions naming one file, and most such pairs are different rules of one brief. The
  // only link that quieted a pair was `supersedes`, which retires the whole older decision. This one retires nothing:
  // `theGovernsCheck` in src/server/lib/governs.ts counts a pair it joins instead of listing it. Symmetric, because
  // "both stand" has no first one. `checkLinkKinds` in src/server/lib/records/planning-guards.ts refuses any end but a decision.
  coexists_with: {
    forward: 'coexists with',
    reverse: 'coexists with',
    symmetric: true,
    description:
      'Two decisions that both stand: neither replaces the other, and both are in force. It retires nothing, and ' +
      'the nightly governs check counts a pair of decisions on one file that it joins instead of listing it. Only ' +
      'between two decisions. Not `supersedes`, which retires the older one, and not `relates_to`, which says ' +
      'nothing about whether both stand.',
  },
  // WHAT MOVES FROM ONE BLOCK OR MODULE TO ANOTHER.
  // The pipeline page and the big map have read it between two blocks since the `carries` column was added. It joins
  // blocks and modules, a block or a module at each end, so that a person or an outside part drawn as a module is
  // joined to its boxes by a link that says what it does; with no lanes stored, the master's Boxes level draws those.
  // `checkLinkKinds` in src/server/lib/records/planning-guards.ts refuses any end but a block or a module, and still
  // only this type may carry `carries`, the names of what moves.
  feeds: {
    forward: 'feeds',
    reverse: 'fed by',
    symmetric: false,
    description:
      'The block or module a flow leaves, to the block or module it reaches: blocks and modules, a block or a module ' +
      'at each end. Between two blocks it is drawn as an arrow on the pipeline page and the big map. With no lanes ' +
      'stored for the master pipeline, its Boxes level also draws the modules it joins to the boxes, and the link ' +
      'between them. Only this link may carry `carries`, a list of {out, in?} naming what moves, in the writer\'s ' +
      'own words. Not `blocks`, which says one step waits for the other, and not `implements`, which says a module ' +
      'carries out a step.',
  },
} as const

export type LinkType = keyof typeof LINK_TYPES

/**
 * THE LINK TYPES THAT ANSWER A PLAN'S PART, rather than merely relating two records.
 *
 * `realises` says the work made the planned state real. `instead_of` says the work answered the
 * same question another way. Both are answers to a plan, and both carry who wrote the link and
 * when, because the link row stores that. A reader of the plan page asks which of the two it is,
 * so the pair is declared once here rather than written out on each page that draws them.
 */
export const ANSWERING_LINK_TYPES = ['realises', 'instead_of'] as const satisfies readonly LinkType[]

export type AnsweringLinkType = (typeof ANSWERING_LINK_TYPES)[number]

/** Whether a stored link type answers a plan's part. Takes a string because a link read may carry a word this build does not know. */
export function isAnAnsweringLink(type: string): type is AnsweringLinkType {
  return (ANSWERING_LINK_TYPES as readonly string[]).includes(type)
}

/**
 * The link that marks a proposal resolved: from the decision, to the proposal.
 *
 * Taken from LINK_TYPES rather than written as a bare string, so renaming the type stops this file
 * compiling instead of leaving resolution silently unreadable. Why `derived_from` and not
 * `supersedes` or `relates_to` is argued where the kind is declared, in src/shared/kinds.ts: the
 * decision really was made FROM this reasoning, the link is directional so which record is the
 * governance act stays visible, and a proposal is not an early draft of the decision.
 *
 * Moved here from src/server/lib/records.ts on 3 October 2026, so the proposal page's press that closes a fork by a
 * decision already made sends the same type the server reads.
 */
export const RESOLVES_PROPOSAL: LinkType = 'derived_from'

/**
 * `consumes` is the field the whole system exists for.
 *
 * A result that nothing consumes is a finding nobody is using. A task that consumes a result
 * which does not exist yet is work waiting on something nobody has produced. Those two
 * queries are why links are typed rather than plain.
 */
export const CONSUMPTION_LINK: LinkType = 'consumes'

// ---------------------------------------------------------------------------- status

/** Progress checklist item states, matching the colours already used on the slide board. */
export const ITEM_STATES = ['todo', 'doing', 'done', 'failed', 'blocked'] as const
export type ItemState = (typeof ITEM_STATES)[number]

/**
 * The seven states an agent session can be in, and every one of them is storable.
 *
 *   running  — output in the last few minutes; it is working
 *   idle     — alive, but has said nothing for a while; usually waiting on you
 *   finished — exited cleanly
 *   crashed  — exited badly, or stopped without finishing
 *   paused   — stopped on purpose by a shutdown of Mole Office, to be resumed by a press
 *   orphaned — see below
 *   unknown  — see below
 *
 * `paused` IS NOT `crashed`. Criterion W6 (design/window/ACCEPTANCE.md): a shutdown with runs at
 * work pauses them with their data kept, and W7 resumes each by one press. A run cut off by a crash
 * or a restart stays `running` until the worker meets it and carries it on by itself (criterion
 * M24); a paused run is never carried on by itself, because the person who shut down asked for the
 * work to stop (the owner's point 5 of 6 September 2026, answered as question 2 of plan
 * hp7Z-IW9JWSX). The record says who paused it, when and why, in its `paused` field.
 *
 * "idle" and "running" are kept apart because conflating them is how a session that has been
 * waiting forty minutes for an answer looks like a session that is busy.
 *
 * THIS IS THE ONLY DECLARATION. `src/web/lib/attention.ts` used to keep a second copy for the
 * alarm panel and was left behind when `orphaned` and `unknown` were added; it now imports and
 * re-exports this one, and tests/validate.test.ts pins the two names as the same list so a copy
 * cannot come back. `src/server/lib/adapters/types.ts` holds the same six words in a different
 * ORDER, because the sessions page sorts by which state wants a human first; tests/sessions.test.ts
 * pins those two as equal sets.
 */
export const SESSION_STATES = [
  'running',
  'idle',
  'finished',
  'crashed',
  /** Stopped on purpose by a shutdown of Mole Office, with its conversation kept, to be resumed by a press. */
  'paused',
  /** Ended without saying so, and left something running. What the resource ledger looks for. */
  'orphaned',
  /** Genuinely undetermined. Honest, and never guessed at -- a wrong 'finished' is the silence
   *  this project exists to remove. */
  'unknown',
] as const
export type SessionState = (typeof SESSION_STATES)[number]

/** Whether a stored value is one of the session state words above. */
export const isASessionState = (value: unknown): value is SessionState => (SESSION_STATES as readonly unknown[]).includes(value)

/**
 * The states in which a run is still going. Every other state has stopped, or nobody can tell. They are
 * listed once, in src/config/still-going.mjs, so a `.mjs` reader can import them too; the type here says
 * each one is a session state.
 */
export const STILL_GOING_STATES: readonly SessionState[] = THE_STILL_GOING_STATES
/** Whether a stored value says the run is still going. */
export { saysStillGoing }

/**
 * The six-level depth ladder a `direction` is tracked on.
 *
 * Depth is the whole point of the kind: "we are looking into X" means nothing until it says how
 * far it has been taken. The levels go up in what it would cost to be wrong — reading something
 * costs an afternoon, having a running system depend on it costs a rewrite.
 */
export const DIRECTION_DEPTHS = ['noticed', 'read', 'ran', 'measured', 'integrated', 'defended'] as const
export type DirectionDepth = (typeof DIRECTION_DEPTHS)[number]

/** What each level of the ladder claims. Shown to whoever is filing a direction. */
export const DIRECTION_DEPTH_MEANINGS: Record<DirectionDepth, string> = {
  noticed: 'it was seen and written down. Nothing has been examined.',
  read: 'the literature, the docs or the source have been read. No code has been run.',
  ran: 'something was run and it did something. No numbers were taken from it.',
  measured: 'there are numbers, taken on purpose, that can be quoted and argued with.',
  integrated: 'it is in the system and other work now depends on it.',
  defended: 'it held against an attempt to break it — a reviewer, a rerun, an adversarial case.',
}

/**
 * ---------------------------------------------------------------------------------------
 * READING A DIRECTION'S DEPTH — ITS OWN PROGRESS DIMENSION, AND NOT A STATE WORD
 * ---------------------------------------------------------------------------------------
 *
 * A direction has no `state` field and is not getting one. It records how far it has been taken in
 * `depth`, on the ladder above, and the six rungs are deliberately NOT in `STATE_MEANING`: the
 * argument is written out in work.ts and the short form is that `measured` means "level four of six,
 * keep going" here and "the measurement was taken, this is done" on a claim. That stays settled.
 *
 * What was wrong is one sentence further out. Every reading surface asked each record for a state
 * word, found none on a direction, and filed sixteen of seventeen of them under *nobody wrote a
 * state here* — which reads as a gap in the record and is not one. Every one of those records
 * carries a required, validated progress word; it is simply called something else and is measured on
 * a different scale.
 *
 * So this is the reader. It answers in the direction's OWN language, and it deliberately cannot be
 * plugged into the state machinery: there is no function here that turns a depth into a `Progress`,
 * and `progressOf` still answers `unclassified` if a rung is ever handed to it.
 */
export interface DepthReading {
  /** The rung this direction has reached, or null when `depth` is missing or is not a rung. */
  depth: DirectionDepth | null
  /** Which rung, counting from 1, or null. `2 of 6` is a thing a reader can draw. */
  rung: number | null
  /** How many rungs there are, so a caller never counts them itself. */
  rungs: number
  /**
   * What to print where another kind prints its state word. Says which ladder this is, so nobody
   * reads `read` as a state word from some vocabulary they have not met.
   */
  note: string
  /**
   * WHAT A DEPTH SAYS ABOUT WORK HAVING STOPPED SHORT: nothing, at every rung, including the first.
   *
   * The type is the literal `false` and not `boolean`, so this is a declaration rather than a value
   * somebody could compute differently tomorrow. A direction at `noticed` is a line of exploration
   * nobody has started, which is exactly what the kind is for — the existence of a direction is not
   * a job somebody is late on, and ranking it as one would put every future idea this lab has ever
   * written down in front of a person today. What SHOULD raise a direction is the ordinary
   * machinery every other kind uses: a `paused` block that has run out, or a consequence somebody
   * stored on it.
   */
  stoppedShort: false
}

/** The rung a record stores, or null when `depth` is absent or is not one of the six. */
export function readDepth(data: unknown): DirectionDepth | null {
  if (data === null || typeof data !== 'object') return null
  const raw = (data as Record<string, unknown>)['depth']
  if (typeof raw !== 'string') return null
  const word = raw.trim()
  return (DIRECTION_DEPTHS as readonly string[]).includes(word) ? (word as DirectionDepth) : null
}

/**
 * How far a direction has been taken, in words a reader can print without knowing the ladder.
 *
 * Null depth is reported as the gap it is — the field is required for a direction, and "nobody has
 * said how far this went" is the one thing a direction must not leave out — but it is still not a
 * state word and is still not urgent.
 */
export function depthReading(data: unknown): DepthReading {
  const depth = readDepth(data)
  const rung = depth === null ? null : DIRECTION_DEPTHS.indexOf(depth) + 1
  const note =
    depth === null
      ? 'no depth is recorded, and depth is what this kind is for: a direction says how far it has actually been taken, not whether work on it has started'
      : `taken as far as "${depth}" — rung ${String(rung)} of ${DIRECTION_DEPTHS.length} on this kind's own ladder, where ${DIRECTION_DEPTH_MEANINGS[depth]}`
  return { depth, rung, rungs: DIRECTION_DEPTHS.length, note, stoppedShort: false }
}

/** Who made a change. Every write is attributed. */
export const ACTOR_TYPES = ['human', 'agent', 'system'] as const
export type ActorType = (typeof ACTOR_TYPES)[number]

/**
 * Whose id an actor's id is, as the kind stored beside it. A system actor writes under the office's own agent row, so
 * its id is an agent's.
 */
export function theKindOfAnActorsId(type: ActorType): ParticipantKind {
  return type === 'human' ? 'person' : 'agent'
}

/** What happened, for the change log. Dated views are filters over this. */
export const CHANGE_OPS = ['create', 'update', 'delete', 'link', 'unlink'] as const
export type ChangeOp = (typeof CHANGE_OPS)[number]

/**
 * What kind of write a stored revision came out of. The revision ledger's own vocabulary.
 *
 * FIVE WORDS, AND `restore` AND `baseline` ARE THE TWO THAT ARE NOT A CHANGE OP:
 *
 *   create    the record was filed. This revision is what it held at that moment.
 *   update    any ordinary write to the record's content, including a soft delete being undone.
 *   delete    a soft delete. The revision carries `deletedAt` set, because being deleted is a real
 *             state of the record and putting it back needs the state before it.
 *   restore   an earlier revision's content written forward. It ADDS a revision and removes none;
 *             history is never rewritten. The note says which revision was put back.
 *   baseline  nobody performed this write. It is what the record held when the ledger was built,
 *             written by the backfill in src/server/db/revision-backfill.ts, whose note says in
 *             plain words that what the record held before that was never stored. A baseline is
 *             never evidence about how a record was created.
 *
 * These are NOT `CHANGE_OPS` and must not be folded into it. A change row says what moved; a
 * revision says what the record then held, and two of these five describe a write that a change row
 * has no word for.
 */
/**
 * THE WORDS A CONVERSATION WITH AN AGENT IS MADE OF.
 *
 * THEY LIVE HERE AND NOT IN `server/lib/agents.ts` FOR THE REASON `ALLOCATABLE_KINDS` DOES: that
 * module opens the database when it is imported, so a test that wanted one of these lists was
 * opening the operator's real corpus before it could say otherwise. `tests/the-composer-is-short.ts`
 * draws a screen and touches no database, and it was reaching through the whole agent library for
 * three words. `server/lib/agents.ts` re-exports all three, so every route is unaffected.
 *
 * Nothing about the values changed; only where they are declared.
 */
/**
 * HERE AND NOT IN `server/lib/recipients.ts` for the reason the three lists below are: that module
 * opens the database when it is imported, and a test that draws the composer was reaching through it
 * for this one array of words. `server/lib/recipients.ts` re-exports it, so nothing else changed.
 */
/**
 * Every reason a run can be on the ranked list, STRONGEST FIRST. This array is the ranking.
 *
 * The order is the owner's, from `design/ROUND-SEVEN.md` §C18b. One idea runs through it: what a
 * run DID to the thing you pointed at beats what it SAID about the work around it, which beats
 * where Mole Office worked out it belongs, which beats the fact that it touched something nearby.
 */
export const RECIPIENT_GROUNDS = [
  /** The change log says this run created the record you pointed at. */
  'filed-this-record',
  /** The run said which work it was on, and what you pointed at is part of that work. */
  'said-it-was-on-this-work',
  /** The change log says this run wrote to the record you pointed at. */
  'wrote-to-this-record',
  /** Mole Office filed the run under the same pipeline or module, from what it wrote rather than said. */
  'filed-under-the-same-work',
  /** It wrote to a record this one is linked to. The weakest, and the sentence says so. */
  'wrote-to-something-this-is-linked-to',
] as const

export type RecipientGround = (typeof RECIPIENT_GROUNDS)[number]

export const THREAD_MODES = ['direct', 'review'] as const
export type ThreadMode = (typeof THREAD_MODES)[number]

export const THREAD_STATES = ['open', 'dispatched', 'answered', 'abandoned'] as const
export type ThreadState = (typeof THREAD_STATES)[number]

export const MESSAGE_ROLES = ['human', 'agent', 'system'] as const
export type MessageRole = (typeof MESSAGE_ROLES)[number]

export const REVISION_OPS = ['create', 'update', 'delete', 'restore', 'baseline'] as const
export type RevisionOp = (typeof REVISION_OPS)[number]

// ---------------------------------------------------------------------------- shapes

/** A single line in a module's Progress checklist. */
export interface ProgressItem {
  id: string
  text: string
  state: ItemState
  /** Kept when an item fails, e.g. "Setting 15 broke the clamp, need reprint". */
  note?: string
  hours?: number
}

/** A named section of a module, e.g. "Part 1: Mount Design". */
export interface ModulePart {
  id: string
  name: string
  items: ProgressItem[]
}

/** What is at the far end of a PathRef. Drawn with its own icon, so "other" is a real answer. */
export const PATH_KINDS = ['dir', 'markdown', 'html', 'pdf', 'image', 'video', 'code', 'other'] as const
export type PathKind = (typeof PATH_KINDS)[number]

/**
 * A pointer to something that lives outside Mole Office and is not copied into it:
 * a report, a directory, a CAD file, a video.
 */
export interface PathRef {
  id: string
  label: string
  path: string
  kind: PathKind
  /** Which machine it is on. Empty means this one. */
  machine?: string
}

// ------------------------------------------------------------------- curated summary blocks
//
// A block is one piece of written content: prose, a chart, an equation, a small table, a picture.
// An ordered list of them is what a person reads.
//
// TWO FIELDS HOLD THEM, AND THE SHAPE IS THE SAME ONE. A module's `summaryBlocks` is its curated
// summary — the layer between the checklist (structure) and the full report. A `report` record's
// `blocks` is the report itself: a review or a write-up addressed to somebody, kept in Mole Office
// rather than in a file outside it. The shape below is declared once and both read it, so a chart
// drawn from a report is drawn by the same code as a chart drawn from a module.
//
// WHY THESE LIVE HERE NOW. They were declared in scripts/seed.ts, which meant the only way to
// find out that a module's charts go in `data.summaryBlocks` was to read a seed script. An agent
// that guessed `data.blocks` instead got a 201 and 700 lines of raw JSON where a chart should be.
// The shape is part of the contract, so it lives in the contract file.
//
// WHO CHECKS THEM: `src/server/lib/summary.ts` holds the zod schemas, and they are the
// authority on the RULES (an axis must be labelled, a table row must be as wide as its header,
// a LaTeX string must be closed). The interfaces here are the STRUCTURE those schemas produce;
// src/server/lib/validate.ts asserts at compile time that the two agree, so neither can move
// without the other.

/**
 * Every block a module's curated summary or a report can be made of.
 *
 * ---------------------------------------------------------------------------------------
 * IT WAS FIVE, AND SEVEN MORE WERE ALREADY BEING DRAWN
 * ---------------------------------------------------------------------------------------
 *
 * `SummaryBlocks.tsx` had arms for heading, finding, metrics, list, code, quote and path, and this
 * list had none of them. So a person could see one of those blocks on screen and could not write
 * one: the write path answered 400 for a shape the drawer already knew. That is the same fact —
 * what a block is — worked out in two places, which is the defect this repository keeps finding, and
 * the half that was wrong was this one.
 *
 * `section` and `columns` are new and are the only two that hold other blocks. Between them they are
 * what makes a report a tree rather than a list: a section is a titled run of blocks, and side by
 * side is `columns` with two columns in it. There is deliberately no third layout type, because a
 * gallery of named arrangements is a list of things somebody has to learn, and two containers
 * compose into all of them.
 *
 * ---------------------------------------------------------------------------------------
 * THAT LAST PARAGRAPH WAS OVERTURNED, AND IT IS KEPT BECAUSE THE ARGUMENT IN IT IS STILL RIGHT
 * ---------------------------------------------------------------------------------------
 *
 * There are now FOUR containers: `section`, `columns`, `grid` and `tabs`. The owner's Phase 12 list
 * asks for a grid, a gallery and tabs by name (design/ROUND-EIGHT-OWNER-MESSAGE.md, the Layout
 * list). A gallery IS a grid of pictures and was not added; that is the paragraph above being obeyed.
 * The other two were added because each does something `columns` cannot, and the reason is written
 * on each interface below:
 *
 *   grid  puts blocks in reading order ACROSS a row and wraps. `columns` is column-major — a reader
 *         reads all of column one, then all of column two — so nine pictures in a `columns` block
 *         have to be transposed by hand and read down instead of across.
 *   tabs  is the only block that HIDES what it holds. Everything else on the page is on the page.
 *
 * The rule that survives is the one the paragraph is actually about: a container is added when the
 * arrangement cannot be composed from the ones that exist, and never to give an arrangement a name.
 * `side-by-side` is still `columns` with two columns, `full-width` is still what a block does when
 * nothing narrows it, and a gallery is still a `grid` of `image` blocks.
 */
export const SUMMARY_BLOCK_TYPES = [
  'text',
  'heading',
  'finding',
  'callout',
  'metrics',
  'keyvalue',
  'list',
  'checklist',
  'code',
  'quote',
  'path',
  'chart',
  'math',
  'table',
  'timeline',
  'image',
  'file',
  'audio',
  'video',
  'section',
  'columns',
  'grid',
  'tabs',
  'beside',
  'world',
  'choice',
  'fillin',
  'button',
  'box',
] as const
export type SummaryBlockType = (typeof SUMMARY_BLOCK_TYPES)[number]

/**
 * WHAT EVERY BLOCK HAS, WHATEVER TYPE IT IS.
 *
 * Twenty interfaces below extend this one and none of them declares `id` again. That is not tidying:
 * `audience` has to be on the union for `SummaryBlocks.tsx` to read `block.audience` at all, because
 * reading a property off a discriminated union requires EVERY member to declare it. So an interface
 * that missed the field would not compile rather than quietly draw a block nobody could mark.
 *
 * `design/round-ten/design/projections.md` §4.3 declares this, and says the other two halves — the
 * zod `blockCommon` in `src/server/lib/summary.ts` and `BLOCK_COMMON_FIELDS` in `src/shared/kinds.ts`
 * — do NOT bind themselves and are held by `tests/audience.test.ts` instead.
 */
export interface BlockCommon {
  id: string
  /**
   * The least technical reader this block is for. Left out, it is for everyone.
   *
   * `developers` means: a normal reader does not see it on screen, a developer does, and an agent
   * receives it either way. The rule is `readerSees` in `src/shared/audience.ts` and it is written
   * nowhere else.
   */
  audience?: Audience
  /**
   * THIS BLOCK IS ADDRESSED TO THE OWNER. Left out, it is not.
   *
   * An optional key on any block says it is
   * addressed to the owner, so a marked block is promoted at every level of semantic zoom including
   * the lowest. `design/problem-02/OWNER-ANSWERS.md` §1 is the answer and
   * `design/problem-02/ACCEPTANCE.md` C12 is what it has to do.
   *
   * WHY THE NAME IS `forOwner`. It says what the block is to a reader — this one is for you — and
   * not how it is used. Chapter 6 rule 4 of the office regulations: do not name a thing after the
   * mechanism that produces it, so not `ownerGate`, which is the campaign's word for the mechanism.
   * And not `audience: 'owner'`: `audience` above means the LEAST TECHNICAL READER a block is for,
   * and `developers` there keeps a block off a normal reader's screen. Being addressed to the owner
   * and being too technical for a normal reader are two different questions, and one field
   * answering both would mean a block marked for the owner could not also be marked for developers.
   *
   * WHY A BOOLEAN AND NOT A LIST OF PEOPLE. Mole Office has one owner. A field that could name
   * anybody would be a capability with nothing behind it, which is the sixth rule. If a second
   * person ever needs one, this becomes a field that names them, with a reason.
   *
   * `false` IS STORED AND MEANS THE SAME AS ABSENT, which is how `ordered` on a list block and
   * `dashed` on a chart series already work. The one reader of this field is `blockRegions` in
   * `src/shared/regions.ts`, which asks `=== true`, so there is one answer to "is it marked".
   *
   * WHAT MARKING A BLOCK DOES, AND WHAT IT DOES NOT. It sets `forOwner` on the region derived from
   * that block, which is what lets a projection promote it. It does not put the block in the
   * *Waiting on you* queue, it does not create a proposal, and it does not make the record
   * incomplete. It is a statement about the writing, made by whoever wrote it.
   *
   * IT IS DECLARED HERE AND NOT ON THE TWENTY-ONE BLOCKS, for the reason the paragraph above this
   * interface gives about `audience`. The other two halves — the zod `blockCommon` in
   * `src/server/lib/summary.ts` and `BLOCK_COMMON_FIELDS` in `src/shared/kinds.ts` — do not bind
   * themselves and are held by `tests/a-block-addressed-to-the-owner.test.ts`.
   */
  forOwner?: boolean
  /**
   * HOW WIDE THE WRITING INSIDE THIS BLOCK READS. Layer 4 of the composition model, and the layer
   * the owner described without a composition anywhere near it:
   *
   *   "For a single prose part, however, the Agent authoring the Report may optionally express a
   *   prose-width / whitespace preference. This preference affects only the prose measure inside its
   *   full-width column."
   *
   * A preset name, widest first — `full`, `wide`, `narrow` or `narrowest` — or a plain ratio
   * between 0.3 and 1 meaning that much of the column. Left out, the writing uses the whole column,
   * which is `full`.
   *
   * IT NEVER MAKES THE BLOCK'S COLUMN NARROWER. The block keeps the whole width of the region it is
   * in; this narrows the writing inside it, as a maximum. Those are two different boxes.
   *
   * ONLY ON A BLOCK THAT HOLDS WRITING, and the write door refuses it anywhere else, because a
   * reading width is a statement about writing and a stored key that could never do anything is the
   * silent no-op this product refuses. Which blocks hold writing is asked of `leastNeededByBlocks`
   * in `src/shared/regions.ts` and is not listed anywhere.
   *
   * IT IS DECLARED HERE RATHER THAN ON THE SIX PROSE BLOCKS, for the reason the comment above this
   * interface gives about `audience`: reading a property off a discriminated union requires every
   * member to declare it, so a block type that missed the field could not be given one in the
   * renderer. The values are in `src/shared/beside.ts` and `BesidePart.measure` is the same field
   * one level up, about a whole part rather than about one block.
   */
  measure?: MeasureAsked
}

/** Prose. The paragraph that says what happened, in the author's own words. */
export interface TextBlock extends BlockCommon {
  type: 'text'
  heading?: string
  text: string
  /** `quiet` draws it as an aside beside the writing rather than as part of it. */
  tone?: 'normal' | 'quiet'
  /** The Chinese of this block, drawn on a Chinese page while `from` is `englishHash([heading, text])`. */
  zh?: { heading: string; text: string; from: string }
}

/** A heading inside the writing. The record's own title is the page's first heading. */
export interface HeadingBlock extends BlockCommon {
  type: 'heading'
  text: string
  /** 2 or 3. Left out it is 2, the first level below the record's title. */
  level?: 2 | 3
}

/** The one sentence worth remembering, with its evidence under it. */
export interface FindingBlock extends BlockCommon {
  type: 'finding'
  text: string
  /** The evidence, in prose. Markdown, like a text block. */
  detail?: string
  state?: ItemState
}

/**
 * WHAT AN ASIDE IS FOR, SAID OUT LOUD. The two words are the whole point of the block.
 *
 * A `text` block with `tone: 'quiet'` is already an aside, and that is a PRESENTATION choice: draw
 * this one smaller and to the side. A callout is a MEANING: this is a caveat about what you just
 * read, or this will bite you. Putting `warning` into the tone of a text block would mix the two,
 * and a reader cannot act on "drawn quietly".
 *
 * It is not a `finding` either. A finding is the conclusion of the work with its evidence under it,
 * and its `state` says how that work went. A warning is not a state of any work.
 */
export const CALLOUT_TONES = ['note', 'warning'] as const
export type CalloutTone = (typeof CALLOUT_TONES)[number]

/** Something set apart from the writing, saying why it is set apart. */
export interface CalloutBlock extends BlockCommon {
  type: 'callout'
  /**
   * Required, not optional. A callout that does not say what kind of aside it is has nothing a
   * `text` block does not have, so leaving it out is choosing the wrong block rather than choosing
   * a default.
   */
  tone: CalloutTone
  /** What it is about, in a few words. */
  title?: string
  /** The aside itself. Markdown, like a text block. */
  text: string
}

/** One measured number. */
export interface MetricItem {
  id: string
  label: string
  /** Kept as written, so "0.4" and "not measured" are both sayable. */
  value: string
  unit?: string
  note?: string
  state?: ItemState
}

/** A row of measured numbers, drawn large enough to read across a room. */
export interface MetricsBlock extends BlockCommon {
  type: 'metrics'
  items: MetricItem[]
}

/** One named value: what something is, in one line. */
export interface KeyValueItem {
  id: string
  /** What this value is called. */
  label: string
  /** The value, kept exactly as written. */
  value: string
}

/**
 * NAMED VALUES: what a thing is, one line each. The machine it ran on, the commit, the driver.
 *
 * IT HAS THE SAME FIELDS AS `metrics` AND IT IS NOT THE SAME BLOCK. A metric is a MEASUREMENT: it
 * has a unit, it can carry a state, and it is drawn large because a reader scans a row of them for
 * magnitude. One of these is a STATED FACT about the thing being written about: no unit, no state,
 * nothing measured it, and a reader looks one up rather than scanning them all. Drawing "birch" in
 * the size a holding force is drawn in would claim it is a quantity.
 *
 * `text` and `quote` are the precedent: one shape, two blocks, because the meaning differs.
 */
export interface KeyValueBlock extends BlockCommon {
  type: 'keyvalue'
  items: KeyValueItem[]
}

/** A bulleted or numbered list. */
export interface ListBlock extends BlockCommon {
  type: 'list'
  items: string[]
  /** Numbered rather than bulleted. */
  ordered?: boolean
}

/** One thing on a checklist, and where it stands. */
export interface ChecklistItem {
  id: string
  text: string
  /**
   * Required, and it is what makes this a checklist rather than a list. An item with no state is a
   * line of a `list`, and a checklist half of whose items say nothing is a list pretending to be a
   * checklist — a reader counts the ticks and gets a wrong answer.
   */
  state: ItemState
  /** Why it stands there, when the item alone does not say it. */
  note?: string
}

/** A list where every item says where it stands. */
export interface ChecklistBlock extends BlockCommon {
  type: 'checklist'
  items: ChecklistItem[]
}

/** A block of code or of terminal output, drawn in the fixed-width face and never reflowed. */
export interface CodeBlock extends BlockCommon {
  type: 'code'
  code: string
  /** What it is written in, e.g. "typescript". Drawn as a small label, never used to colour it. */
  language?: string
  caption?: string
}

/** Somebody else's words, kept as theirs. */
export interface QuoteBlock extends BlockCommon {
  /**
   * NARROWED, AND THE NARROWING IS THE RULE. A quote may never be marked for developers, by anybody:
   * `projections.md` §9.2 rule 2, because a quote is somebody else's words. The zod schema refuses it
   * and `blocksAgree` in `src/server/lib/validate.ts` is what keeps this line and that one together.
   */
  audience?: 'everyone'
  type: 'quote'
  text: string
  /** Who said it. */
  source?: string
}

/**
 * A pointer into the archive: a report, a directory, a CAD file. Never copied in.
 *
 * The same idea as `PathRef`, as a block, so a piece of writing can point at a file where the
 * sentence about it is rather than in a list at the bottom of the record.
 */
export interface PathBlock extends BlockCommon {
  type: 'path'
  label: string
  path: string
  kind?: PathKind
  /** Which machine it is on. Empty means this one. */
  machine?: string
}

/**
 * A TEST WORLD THE PERSON IS BEING ASKED TO GO AND LOOK AT. Criterion C31.
 *
 * A world is a natural test ground: for a new feature, the person can be called into a test world to look at
 * it, and then decide whether it meets what was asked. A world is a builder's own Mole Office, serving a
 * copy of the corpus on its own ports, and it is where the person looks at a new feature before deciding
 * whether it meets what they asked. A picture is not that, and does not replace it.
 *
 * IT IS A BLOCK BECAUSE IT GOES IN A HANDBACK. A handback is a `report` record, its content is its
 * blocks, and this is one of them: the address, what to look at, and the ledger row that says
 * whether it is still up.
 *
 * ONLY A HANDBACK THAT ASKS FOR IT CARRIES ONE. Nothing makes a builder keep a world running, and
 * a world nobody asked to see is stopped when the builder finishes, as it always was.
 */
export interface WorldBlock extends BlockCommon {
  /** The same world on the office’s interface for other machines. */
  webForOtherMachines?: string
  apiForOtherMachines?: string
  type: 'world'
  /** What the person should go and look at, in words. */
  label: string
  /** The address to open, e.g. http://127.0.0.1:41573. */
  web: string
  /** The API behind it, when it is worth naming. */
  api?: string
  /**
   * The ledger row this world holds, by id, so the page can say whether it is still up and offer
   * the press that stops it. Absent means nobody registered it, and the page says so rather than
   * reporting a world it cannot see as running.
   */
  ledgerRow?: string
  /** Why it is being kept up: what the person is being asked to decide by looking. */
  because?: string
}

/**
 * A QUESTION THE PERSON ANSWERS IN THE REPORT BY CHOOSING, on the design
 * CI_hZmfzVGJk.
 *
 * Two to four options, one of them or several. The option the writer recommends is marked. Every
 * choice also takes a line of the person's own words, so the page always offers one. The option chosen is
 * kept in the report's `answers`, and once it is sent it is recorded as the person's decision.
 */
export interface ChoiceBlock extends BlockCommon {
  type: 'choice'
  /** The question, in words the person can answer without reading anything else. */
  question: string
  options: ChoiceOption[]
  /** True when the person may choose more than one option. Left out, they choose one. */
  many?: boolean
  /**
   * The decision or the proposal this question is about, by record id. The decision made from the person's answer links to
   * it: a proposal is settled by the answer, and a decision is replaced by it.
   */
  about?: string
}

/** One option of a choice. `id` is what an answer stores, so the words may be corrected later. */
export interface ChoiceOption {
  id: string
  label: string
  /** The option the writer recommends. At most one option of a single choice carries it. */
  recommended?: boolean
}

/** A BOX THE PERSON FILLS IN WITH THEIR OWN WORDS, one line or several. */
export interface FillInBlock extends BlockCommon {
  type: 'fillin'
  /** The sentence that says what to write. */
  asks: string
  /** How tall the box starts: 'one' for a short answer, 'many' for a longer one. Left out, 'one'. Either takes line breaks. */
  lines?: 'one' | 'many'
  /**
   * HOW WIDE THE ANSWER BOX IS, as the writing agent chooses: 'narrow' (the 36rem the choices keep) or 'wide'
   * (the whole column). Left out, a one-line box is narrow and a box of several lines is
   * wide. Not `width` (a report has two widths already, `share` and `measure`) and not
   * `measure` (a fill-in holds no writing of its own).
   */
  boxWidth?: 'narrow' | 'wide'
}

/**
 * ONE PRESS THAT TAKES EFFECT.
 *
 * The page asks once more before it acts. The press is sent at once, on its own, to the agent the
 * button names, so a button never waits for a box: it is a submit whose scope is itself.
 */
export interface ButtonBlock extends BlockCommon {
  type: 'button'
  label: string
  /** The question the page asks before the press takes effect. Left out, the page asks whether the person is sure. */
  confirm?: string
  /** The agent the press goes to, by handle or id. Left out, the report's writer. */
  to?: string
}

/**
 * A BOX OF QUESTIONS UNDER ONE TITLE.
 *
 * The page draws no submit for a box: the whole report's one submit sends its answers with the rest,
 * each to the agent its box names (wave 13u round 19). The answer door still takes a press scoped to
 * one box, and no page presses it. A block sits in one box only, so a box is never inside another
 * box, and a button, which sends itself, never sits in a box.
 */
export interface BoxBlock extends BlockCommon {
  type: 'box'
  title?: string
  /** The agent the box's answers go to, by handle or id. Left out, the report's writer. */
  to?: string
  blocks: SummaryBlock[]
}

/** A titled run of blocks. The first of the two containers. */
export interface SectionBlock extends BlockCommon {
  type: 'section'
  title?: string
  blocks: SummaryBlock[]
}

/**
 * Blocks side by side. The second of the two containers.
 *
 * `columns` is a list of columns and each column is a list of blocks, so two columns is side by
 * side and three is three across. On a narrow screen the columns stack, in the order they are
 * written, because two 180px columns are not a comparison.
 */
export interface ColumnsBlock extends BlockCommon {
  type: 'columns'
  columns: SummaryBlock[][]
}

/**
 * MANY OF THE SAME KIND OF THING, ACROSS AND THEN DOWN. The third container.
 *
 * THIS IS WHAT A GALLERY IS. Nine screenshots are a grid of nine `image` blocks, and there is no
 * `gallery` type, because a gallery is this container with pictures in it and a `gallery` word
 * would also have to answer what a gallery of tables is called.
 *
 * WHY IT IS NOT `columns`. `columns` holds a list per column, so the reader reads DOWN column one
 * and then down column two. Written as `columns`, nine pictures in reading order have to be
 * transposed by whoever writes them, and adding a tenth re-cuts every column. A grid holds ONE list
 * in the order somebody reads it, puts as many as fit on a row, and wraps.
 */
export interface GridBlock extends BlockCommon {
  type: 'grid'
  blocks: SummaryBlock[]
  /**
   * The MOST that go on one row. Left out, as many fit as will stay readable, and fewer on a narrow
   * screen. It is a cap and never a promise: two blocks with `across: 4` are two blocks on the row.
   */
  across?: 2 | 3 | 4
}

/** One tab: what it is called, and what is under it. */
export interface TabPanel {
  id: string
  /** What is under this tab, in a word or two. It is the only thing a reader has to choose by. */
  label: string
  blocks: SummaryBlock[]
}

/**
 * ONE THING SHOWN AND THE REST PUT AWAY. The fourth container, and the only block that hides
 * anything.
 *
 * THAT IS WHAT IT IS FOR AND IT IS ALSO ITS WHOLE COST. What is under an unopened tab is not on the
 * screen: a reader scrolling past will not see it, the browser's own find will not reach it, and a
 * comment cannot be left on it until somebody opens the tab. So it is for material a reader chooses
 * BETWEEN — the same measurement on three machines, one version against another — and never for
 * material a reader has to read. Anything that must be read goes in a `section`.
 */
export interface TabsBlock extends BlockCommon {
  type: 'tabs'
  tabs: TabPanel[]
}

/**
 * ONE PART OF A COMPOSITION: what is in it, what it is worth beside its siblings, and how wide the
 * writing inside it reads.
 */
export interface BesidePart {
  /** This part's own name, so a comment left on it survives its siblings being reordered. */
  id: string
  /**
   * HOW MUCH OF THE ROW THIS PART IS WORTH, RELATIVE TO THE OTHER PARTS. A whole number, 1 to 100.
   *
   * THE SENTENCE THAT STOOD HERE IS WITHDRAWN, 29 August 2026. It said A RATIO AND NEVER A
   * PERCENTAGE, meaning a percentage may not be written. The owner has since written that a report
   * may ask for 60/40 and that canonical storage may normalise a percentage into relative shares,
   * so what may be WRITTEN and what is STORED are two different lists and this said only one of
   * them. What is stored is still a ratio, and the next commit says what may be written.
   *
   * A PREFERENCE INSIDE A VALID ARRANGEMENT AND NEVER A COMMAND: Mole Office keeps every
   * part wide enough to read, gives the extra to its neighbours when one would be too narrow, and
   * puts the parts one under another when the screen is too narrow for all of them. Either every
   * part says what it is worth or none does; left out, Mole Office reads the parts and chooses.
   */
  share?: number
  /**
   * HOW WIDE THE WRITING INSIDE THIS PART READS. Only on a part that holds writing.
   *
   * A preset name, widest first — `full`, `wide`, `narrow` or `narrowest` — or a plain ratio
   * between 0.3 and 1 meaning that much of the column. `full` is what happens when nothing is said,
   * and it means the writing uses the whole column.
   *
   * IT NEVER MAKES THE PART NARROWER. The part keeps the whole of its share of the row; this
   * narrows the TEXT INSIDE it, as a maximum. The two are different boxes and this says nothing
   * about the first one. The values are in src/shared/beside.ts.
   */
  measure?: MeasureAsked
  blocks: SummaryBlock[]
}

/**
 * PARTS OF ONE THING, SEEN BESIDE EACH OTHER. Writing beside a picture, two pictures, writing
 * beside a table beside a picture.
 *
 * WHY IT IS NOT A FIELD ON `columns`. `columns` means parallel and EQUAL — a comparison — and its
 * columns are bare lists with no object to hang a share on and no id to make one pointable. Giving
 * them both would mean replacing that shape while keeping its name. Writing beside a picture at 3:2
 * is not a comparison, so it is not the same arrangement wearing different numbers.
 *
 * BETWEEN TWO AND FOUR PARTS. One part is the blocks themselves; five across is unreadable on any
 * screen.
 */
export interface BesideBlock extends BlockCommon {
  type: 'beside'
  /**
   * WHAT THE REPORT ASKED THIS ROW TO BE DIVIDED INTO, IN ITS OWN SPELLING: `"60/40"`, `"3:2"`,
   * `"50%/50%"`. Absent when nobody asked for anything.
   *
   * IT IS NOT A SECOND STATEMENT OF THE SHARES. The shares on the parts are the same proportion
   * reduced to whole numbers with no common factor, and this is the sentence the author wrote. Both
   * are needed and neither is derivable from the other: 60/40, 6/4 and 3:2 all store shares of 3 and
   * 2, so the shares cannot say which was written, and the shares are what the arithmetic reads.
   * That is what makes the reducing lossless — the answer for a write can say *you asked for 60/40*
   * and *this is drawn 74/26* in one sentence.
   *
   * A REPORT MAY WRITE THIS INSTEAD OF THE SHARES, and most will: `proportions: "3:2"` is one
   * statement about the row, and `share` on every part is the same thing said part by part. Writing
   * both is allowed only when they agree, because a stored row sent back through the door carries
   * both. `canonicalRow` in src/shared/beside.ts is the one place that decides.
   */
  proportions?: string
  parts: BesidePart[]
}

/** One plotted line or bar set. Rendered by <Chart spec={block.spec}/>. */
export interface ChartBlock extends BlockCommon {
  type: 'chart'
  spec: ChartSpec
  caption?: string
}

/**
 * A LaTeX formula. Rendered by <MathText tex={block.tex}/>.
 *
 * The `tex` is not parsed against the renderer's command list on purpose: an expression outside
 * that subset must reach the renderer intact so it can be shown as source rather than vanishing.
 */
export interface MathBlock extends BlockCommon {
  type: 'math'
  tex: string
  caption?: string
}

/** A small table of measurements. Not a spreadsheet — the raw data stays in the project. */
export interface TableBlock extends BlockCommon {
  type: 'table'
  columns: TableColumn[]
  rows: TableRow[]
  caption?: string
}

/** One thing that happened, and when. */
export interface TimelineItem {
  id: string
  /**
   * WHEN, KEPT EXACTLY AS WRITTEN, and never parsed into a date.
   *
   * "14 August", "2026-07", "the third print", "after the driver was rolled back" are all real
   * answers to when something happened, and a field that only took a stamp would refuse most of
   * them or, worse, guess one. Nothing sorts, filters or counts by this string: the ORDER OF THE
   * ITEMS is the order the writer put them in, so no arithmetic depends on reading it.
   */
  when: string
  text: string
  /** What happened, at length, when the line above cannot hold it. Markdown, like a text block. */
  detail?: string
  state?: ItemState
}

/**
 * WHAT HAPPENED, IN ORDER, WITH WHEN BESIDE IT.
 *
 * A table with a "when" column holds the same words and says nothing about them: a table's columns
 * are interchangeable and its rows are sortable, so a reader who sorts by the second column has
 * destroyed the only thing a timeline is for. Here the order IS the meaning and there is nothing to
 * sort.
 */
export interface TimelineBlock extends BlockCommon {
  type: 'timeline'
  items: TimelineItem[]
}

/** A picture that lives on disk. Mole Office points at it; it is never copied into the database. */
export interface ImageBlock extends BlockCommon {
  type: 'image'
  /** Absolute path. Relative would depend on where the server happened to be started. */
  path: string
  /** Required, not optional: a picture with no text alternative is invisible to a reader. */
  alt: string
  caption?: string
  /** Which machine the file is on. Empty means this one. */
  machine?: string
}

/**
 * A FILE CARRIED AS A FILE, NOT CUT INTO PROSE. Criterion R3.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * On 8 September 2026 an agent archived five code files by cutting them into text blocks of 4,000
 * characters, because a text block is capped at MAX_PROSE. The cap is right for prose and wrong for
 * a file: cut into pieces, the thing stops being the file and becomes a reading of it.
 *
 * So a report carries this instead. The bytes live on disk, exactly as a picture's do, and are
 * served back through `GET /api/file`. The block carries the file's own facts — where it is, what
 * it is called, how many bytes it is, and a hash of those bytes — so a reader can see at a glance
 * that the thing on the page is the whole file and not a piece of it.
 *
 * `size` AND `hash` ARE THE BYTES' OWN, worked out where the bytes are stored and never taken from
 * whoever writes the block. `hashOfBytes` in src/server/lib/version.ts is the one place this
 * product hashes anything, and it is the same short sha256 token a record's revision uses.
 *
 * IT IS NOT `path`, WHICH POINTS AT SOMETHING ELSE. A `path` block says where a file is and leaves
 * it there. This one carries the facts of a file the report is handing over.
 */
export interface FileBlock extends BlockCommon {
  type: 'file'
  /**
   * Absolute path on this machine. The same shape an image block carries, and served by the same
   * door: `GET /api/file` reads it only while a live record in this project points at it and only
   * inside a preview root.
   */
  path: string
  /** The file's own name, as a person would say it, e.g. `summary.ts`. Never the stored nanoid. */
  name: string
  /** How many bytes the file is, its own length and never a number the caller supplied. */
  size: number
  /** sha256 of the bytes, as the same 16-character token `versionOf` gives a record. */
  hash: string
  /** A line under the file, under the same prose cap as every other caption. */
  caption?: string
  /** Which machine the file is on. Empty means this one. */
  machine?: string
}

/**
 * A SOUND THE REPORT PLAYS IN THE PAGE. The owner hears voice samples inside
 * a report, as they see a picture there.
 *
 * It names a stored file with the same four facts a `file` block carries, from POST
 * /api/report-files, and it is played from the same file door. The file's name or path ends in
 * .wav, .mp3 or .m4a; `src/shared/reportmedia.ts` holds that list.
 */
export interface AudioBlock extends BlockCommon {
  type: 'audio'
  /** Absolute path on this machine, served by `GET /api/file` as a file block's is. */
  path: string
  /** The file's own name, as a person would say it. */
  name: string
  /** How many bytes the file is. */
  size: number
  /** The short sha256 of the bytes. */
  hash: string
  /** Required: what is heard, in words, for a reader who cannot hear it. */
  alt: string
  caption?: string
  /** Which machine the file is on. Empty means this one. */
  machine?: string
}

/**
 * A FILM THE REPORT PLAYS IN THE PAGE. It was decided for the studio's sample films.
 *
 * The same shape as `AudioBlock`, for a file whose name or path ends in .mp4 or .webm.
 */
export interface VideoBlock extends BlockCommon {
  type: 'video'
  path: string
  name: string
  size: number
  hash: string
  /** Required: what is seen and heard, in words, for a reader who cannot see it. */
  alt: string
  caption?: string
  machine?: string
}

export type SummaryBlock =
  | TextBlock
  | HeadingBlock
  | FindingBlock
  | CalloutBlock
  | MetricsBlock
  | KeyValueBlock
  | ListBlock
  | ChecklistBlock
  | CodeBlock
  | QuoteBlock
  | PathBlock
  | ChartBlock
  | MathBlock
  | TableBlock
  | TimelineBlock
  | ImageBlock
  | FileBlock
  | AudioBlock
  | VideoBlock
  | SectionBlock
  | ColumnsBlock
  | GridBlock
  | TabsBlock
  | BesideBlock
  | WorldBlock
  | ChoiceBlock
  | FillInBlock
  | ButtonBlock
  | BoxBlock

export interface ChartAxis {
  label: string
  /** Shown after the numbers, e.g. "N". Kept apart from the label so ticks can carry it. */
  unit?: string
  min?: number
  max?: number
}

export interface ChartPoint {
  x: number
  y: number
}

export interface ChartSeries {
  id: string
  name: string
  points: ChartPoint[]
  /** When set, the series takes --st-<state>, so a failed run is the colour of failure. */
  state?: ItemState
  /** Drawn dashed. The non-colour channel: a dashed line still reads as "this one" in mono. */
  dashed?: boolean
}

/** A reference line, e.g. the force the clamp has to reach. A line with no label is a mystery. */
export interface ChartAnnotation {
  id: string
  axis: 'x' | 'y'
  value: number
  label: string
}

export interface ChartSpec {
  kind: 'line' | 'bar'
  x: ChartAxis
  y: ChartAxis
  series: ChartSeries[]
  annotations?: ChartAnnotation[]
}

export interface TableColumn {
  label: string
  /** Numbers right, words left. Default is left. */
  align?: 'left' | 'right'
}

export interface TableRow {
  /** Numbers stay numbers so they can be right-aligned; "not measured" stays a string. */
  cells: (string | number)[]
  /** Optional semantic state for the whole row, e.g. a print attempt that failed. */
  state?: ItemState
}

/** Module-specific fields, stored in `data`. */
export interface ModuleData {
  /** Why this exists. The "Context" block on the slide board. */
  context: string
  parts: ModulePart[]
  /** Links out to the full report and materials, which stay in the project directory. */
  paths?: PathRef[]
  /**
   * The code in THIS repository the module is responsible for, as repository-relative paths or
   * glob patterns. Resolved against the derived source index; see SourceCoverage below.
   *
   * NOT the same field as `paths`, and the difference is which side of the repository each one
   * points at. A PathRef points OUT: an absolute path to a report, a CAD directory or a video
   * that Mole Office never scans and possibly cannot see, because it is on another machine. A claim
   * points IN: a path relative to this repository's root, which something scans, so it can be
   * checked rather than believed. A hardware module has paths and no claims.
   */
  claims?: string[]
  /** The curated summary in one paragraph: what is worth knowing without the full report. */
  summary?: string
  /**
   * The curated summary in full: prose, charts, equations, tables and pictures, in order.
   *
   * This field is the reason this phase exists. It was stored by the seed script, read by
   * ModuleView and rendered by SummaryBlocks, and declared in none of them — so `data.blocks`,
   * which every signal pointed at, was accepted and drawn as nothing.
   */
  summaryBlocks?: SummaryBlock[]
  /**
   * Who is hurt if this module is left alone, and what happens to them.
   *
   * STORED, NEVER INFERRED. The type is `Consequence` from ./work.ts, which is also where the six
   * bearers and what each one claims are written down. Absent means nobody has said, which is not
   * the same as `bearer: 'none'` — one is a gap and the other is an answer.
   */
  consequence?: Consequence
  /**
   * Deliberately put down, with a reason and optionally the thing that should bring it back.
   *
   * A paused module has NOT stopped short; it is waiting on purpose. `Pause` is defined in
   * ./work.ts, and so is the reader that tells the two apart.
   */
  paused?: Pause
  /** Who plans this module's work. Absent means nobody has been named. */
  planner?: ParticipantRef
  /** Where the plan stands in the planning flow. Written only by the office; see src/shared/planning-flow.ts. */
  planning?: ModulePlanning
  /** Anything this kind has no field for. See KIND_SPECS in shared/kinds.ts. */
  extra?: Record<string, unknown>
}

// ------------------------------------------------------------------------------ pipelines

/**
 * One block of a pipeline: one step of the work, stored as its own record.
 *
 * ---------------------------------------------------------------------------------------
 * THIS REPLACED A NESTED `PipelineStep`, AND THE NESTING WAS THE DEFECT
 * ---------------------------------------------------------------------------------------
 *
 * A pipeline used to store `data.steps[]`, an array of objects with their own ids. Because
 * `links.from_id` and `links.to_id` are foreign keys to `records.id`, nothing could point at one of
 * those objects: a problem, a claim or an idea had to attach to the whole pipeline instead of to
 * the one step that was wrong. Two steps could also share an id behind a 201, and a step named its
 * modules by TITLE while a parallel `implements` link named the same modules by ID — so one accepted
 * rename broke ten mappings silently.
 *
 * A block is a record. Its `name` is the record's title (qualified by its pipeline — see
 * shared/blocks.ts), its modules are `implements` links, and what it waits on are `blocks` links
 * carrying the gate. Nothing about a block is nested inside another record any more, and there is
 * no second shape: `PipelineStep`, `StepNeed` and the `PipelineBlock` alias are gone rather than
 * kept beside this.
 *
 * `modules`, `needs` and `id` are deliberately NOT fields here. They are links and a primary key.
 * Putting either back would recreate the two-representations defect this change removed.
 */
export interface BlockData {
  /** Where this block has got to. The pipeline reads these to say which block it is standing on. */
  state: ItemState
  /** What was measured on this block, in the units it was measured in. Absent when nothing has. */
  measured?: string
  /** Who is hurt if this block is left alone. Stored, never inferred — see ./work.ts. */
  consequence?: Consequence
  /** Deliberately put down, with a reason. A paused block has not stopped short. */
  paused?: Pause
  /** Where this came from, when it was taken from somewhere else. */
  source?: string
  extra?: Record<string, unknown>
}

/**
 * Pipeline-specific fields, stored in `data`.
 *
 * ---------------------------------------------------------------------------------------
 * THE KEY IS `blockIds`, AND IT IS THE ONLY STATEMENT OF BOTH MEMBERSHIP AND ORDER
 * ---------------------------------------------------------------------------------------
 *
 * It used to be `steps`, an array of whole objects. It is now an ordered array of block record ids.
 *
 * The order had to live somewhere, and there were two defensible homes: an ordered array on the
 * pipeline, or an ordinal on each block. The array won for three reasons, all of them about what
 * can go wrong rather than about taste:
 *
 *   1. Order is CONTENT, not a sort — nothing sorts these, they are the order the work happens in —
 *      and content about the pipeline belongs on the pipeline.
 *   2. A reorder is then ONE write and ONE change row, and cannot half-apply. With an ordinal on
 *      each block a reorder is N writes, and a reorder that stops half way leaves an order that is
 *      neither the old one nor the new one.
 *   3. An array cannot say "two blocks at position 3" or "nothing at position 2". An ordinal column
 *      can, and nothing would check it — which is the duplicate-step-id defect this whole change
 *      removes, moved into a new column.
 *
 * And because the array is the membership too, a block stores no `pipelineId`. Two statements of
 * one fact with nothing making them agree is the defect this codebase keeps producing, and it is
 * exactly what `modules[]` titles beside `implements` links already was. Finding a block's pipeline
 * is `pipelinesHolding` in shared/blocks.ts, over the eleven pipeline records.
 */
export interface PipelineData {
  /** The blocks, by record id, in the order the work happens. */
  blockIds: string[]
  /** Who is hurt if this pipeline is left alone. Stored, never inferred — see ./work.ts. */
  consequence?: Consequence
  /** Deliberately put down, with a reason. A paused pipeline has not stopped short. */
  paused?: Pause
  extra?: Record<string, unknown>
}

// ---------------------------------------------------------------------------- provenance
//
// ---------------------------------------------------------------------------------------
// HOW A RECORD GOT HERE. TWO VALUES, AND THE REASON THERE ARE EXACTLY TWO
// ---------------------------------------------------------------------------------------
//
// Measured on the working database: 385 records, 220 of them written by the generated fixture, and
// nothing whatever marking which is which. No column, no naming convention, no marker on any screen,
// nothing in the durable export. A reader — a person, or the next agent — cannot tell this project's
// own development record from greenhouse content written to give a layout something to draw. Two
// separate agents read both as equally true.
//
// THE CLAIM THIS FIELD MAKES IS NARROW AND IT IS ABOUT THE PATH, NOT THE CONTENT. `fixture` does not
// mean false, invented or worthless: much of that content paraphrases real bench notes from this
// lab, and some of it is more carefully written than the records beside it. It means the record
// entered this corpus through the fixture or seed path rather than being filed as a project record.
// That is a fact nobody has to judge — the writer knows it at write time — which is exactly why it
// can be stored honestly and why nothing infers it later.
//
// TWO VALUES, NOT AN ONTOLOGY. The temptation is a general provenance vocabulary: imported,
// migrated, restored, inferred, machine-read, hand-typed. Every one of those is a different question
// with a different reader, and the product already answers several of them elsewhere — `Change`
// carries who wrote every version, `Link.inferred` says when Mole Office worked a relationship out itself,
// and the source index says loudly that it is derived and never canonical. This field answers ONE
// question, the one that was unanswerable: is this row part of the real record, or is it furniture?
// A third value would mean a second question had been folded into it and nobody could then read
// either. If another provenance question turns out to need an answer, it needs its own field.

/** How a record entered this corpus. Two values, deliberately — see above. */
export const RECORD_ORIGINS = [
  /** A real project record: somebody, or some agent doing real work, filed it about the work. */
  'authored',
  /** It entered this corpus through the generated fixture or the seed. A claim about the path only. */
  'fixture',
] as const
export type RecordOrigin = (typeof RECORD_ORIGINS)[number]

/** What each value claims, in the words every surface should use. */
export const ORIGIN_MEANINGS: Readonly<Record<RecordOrigin, string>> = {
  authored: 'filed as a record of real work, by a person or by an agent doing that work',
  fixture:
    'it entered this corpus through the generated fixture or the seed. That is a statement about how the record ' +
    'got here and not about whether its content is true — some of it paraphrases real notes — but it is not part ' +
    'of the project record and must never be quoted as an observation',
}

/**
 * The origin stored on a record, or null when nothing has been stamped on it.
 *
 * NULL IS NOT `authored`, and collapsing the two is the one way this field can do harm. A row with
 * no stamp is a row nobody has said anything about — every row written before the column existed is
 * one — and answering "authored" for it would turn the absence of a judgement into a judgement, in
 * the exact direction that makes fixture content read as real. `unstampedOriginNote` below is the
 * sentence for that case; it is a question for a person, not a verdict.
 *
 * It reads a COLUMN, not a key inside `data`, so it takes the stored value rather than the record's
 * bag. Origin is a fact about the row itself: it must survive an export, it must be queryable, and
 * it must not be something a `dataPatch` can quietly rewrite.
 */
export function readOrigin(value: unknown): RecordOrigin | null {
  if (typeof value !== 'string') return null
  const word = value.trim().toLowerCase()
  return (RECORD_ORIGINS as readonly string[]).includes(word) ? (word as RecordOrigin) : null
}

/** What to say about a record carrying no origin. One wording, so every surface says the same. */
export function unstampedOriginNote(): string {
  return 'how this record got here is not recorded, so Mole Office cannot say whether it is a project record or a made-up example'
}

// ---------------------------------------------------------------------------- records

export interface PanelRecord {
  id: string
  kind: RecordKind
  workspaceId: string
  ownerId: string
  /** Short name. Unique within a workspace, because typing a name is how you link. */
  title: string
  /**
   * One line saying what this record is. Whatever the writer sent, stored verbatim.
   *
   * THIS USED TO SAY "generated for most kinds, never hand-maintained", AND THAT WAS NEVER TRUE
   * OF THE STORED FIELD. `createRecord` in src/server/lib/records.ts stores `body.summary`
   * unchanged and `patchRecord` replaces it with whatever a PATCH sends. Nothing refuses a
   * hand-written summary and nothing refreshes a stale one, so this is exactly as current as the
   * last person who typed it.
   *
   * There is no exception. A `session` record discovery files used to get its summary from the
   * transcript's opening request; `ensureSessionRecord` now files it with none, because that request
   * can be a message that not every reader may read.
   *
   * Derived one-liners DO exist, and they are not this field: the graph cards in
   * src/web/components/graph/model.ts build phrases like "4 of 8 done" and "2 items stopped
   * short" from checklist states and links, every time they are drawn. That is what a generated
   * summary would look like if this field ever became one. It has not.
   */
  summary: string | null
  /**
   * Kind-specific fields.
   *
   * What belongs in here for each kind is declared in `src/shared/kinds.ts` (KIND_SPECS) and
   * checked by `validateData` in `src/shared/kinds/validation.ts`, which `src/server/lib/validate.ts` runs on every write.
   * SQLite checks none of it — see the note at the top of this file about why there is one
   * table for every kind.
   */
  data: Record<string, unknown>
  createdAt: string
  updatedAt: string
  /** Soft delete. Nothing is ever really removed, so links never dangle silently. */
  deletedAt: string | null
  /**
   * How this record entered the corpus. See RECORD_ORIGINS above for why there are two values.
   *
   * THE COLUMN EXISTS AND `toRecord` CARRIES IT, so every record served by this product answers
   * this field. It is `null` when nobody has stamped the row — never `authored`, which would turn
   * the absence of a judgement into a judgement in the exact direction that makes fixture content
   * read as real work.
   *
   * WHY IT IS STILL OPTIONAL, WHICH IS NOT THE SAME AS "SOMETIMES FORGOTTEN". Absent and null mean
   * two different things to a reader, and both are honest: `null` is *nobody has said*, absent is
   * *this reply did not carry the field at all*. A screen must be able to tell them apart, because
   * drawing "nobody recorded an origin" over a corpus that is fully stamped is a false statement
   * about the project rather than about the request.
   *
   * That is not hypothetical. This field was declared here one wave before `toRecord` filled it, so
   * for a whole wave the column held 290 `fixture` stamps and every API reply omitted it — and
   * because the field is optional, nothing failed to compile. `tests/vocab-provenance.test.ts` now
   * fails if a served record loses it again, which is what makes the optionality safe to keep.
   */
  origin?: RecordOrigin | null
}

export interface Link {
  id: string
  fromId: string
  toId: string
  type: LinkType
  /** True when Mole Office worked the link out itself rather than being told. Shown differently. */
  inferred: boolean
  createdAt: string
  createdBy: string
  /**
   * Whether `createdBy` is a person, an agent or the office itself. NULL MEANS NOT RECORDED: the
   * link was written before `links.created_by_type` existed (migration 0193, problem zt5F7xG_moRl).
   */
  createdByType: ActorType | null
}

/**
 * HOW A CALLER PROVED ITSELF. Criterion P83, point 1. `actorFrom` puts person, office and agent
 * proofs on an Actor as `provedBy`. The person's tool proof is read directly at the summons door and never
 * makes an Actor. Two decisions and report H-forI_Vk5H7 change the agent identity that an earlier
 * decision set.
 * Declared here rather than in `src/server/lib/keys.ts` because the browser
 * must read the same word off a change row to tell the office's own key from an agent's, and the
 * browser may import `src/shared/` and may not import the server.
 */
export type HowACallerProvedItself = 'the-person-key' | 'the-office-key' | 'an-agent-key' | 'his-tool-key'

/**
 * THE DISAGREEMENT A KEY SETTLED: who the key proved, and the name the request gave instead.
 *
 * ONE ROW PER KEYED WRITE, and only where the two differ — absent means there was nothing to say.
 * One exception: the create and the mint of a run a starter files by hand for its agent carry the
 * starter's own key, so the run's own key can prove the run (lib/keys.ts). There the key proved
 * the very agent the row names, and `Change.provedHolderIsTheWriter` says so.
 * The name on the row is the actor's (`Change.actorId`); this carries the proof beside it so a page
 * can say which of the two it is. `id` is the holder the key proved, `how` is the word for how it
 * proved, and `claimed` is the name the request's headers gave. The last is present because the
 * person's own key REPLACES that name in `actorId`, so on that row this is the only place the name
 * survives.
 */
export interface ProvedHolder {
  /** The id the key proved: the person, the office, or an agent. */
  id: string
  /** The word for how it proved. */
  how: HowACallerProvedItself
  /** The name the request's headers gave: another than `id`, except on a starter's run's create and mint. */
  claimed: string
}

export interface Change {
  /** JSON naming the package and item whose signature carried this act; NULL otherwise. */
  signed_item?: string | null
  id: string
  recordId: string
  /**
   * WHO A KEY PROVED, where that differs from the actor named on the row. Criterion P83, point 5.
   *
   * NULL IS THE ORDINARY ANSWER. It means no key proved this caller, or the key's holder is the very
   * name the headers gave — in both cases the rule does not apply and the actor id is the whole
   * truth. It is never a `{ mismatch: false }` written on every row to say a thing that is true of
   * almost all of them. See `ProvedHolder` for what is stored when it is not null.
   */
  provedHolder?: ProvedHolder | null
  /**
   * WHETHER THE KEY IN `provedHolder` PROVED THIS ROW'S OWN WRITER, decided on the server, where an old id
   * or a handle can be read as the agent it names. Present only on a row that carries a holder. True on the
   * create and the mint of a run a starter filed by hand; a page then draws no proved-by words, which would
   * only repeat the writer.
   */
  provedHolderIsTheWriter?: boolean
  /**
   * How the record this row is ABOUT entered the corpus. Null when nobody said, or when the record
   * is no longer there to ask.
   *
   * The change log is the first panel on Home, so it is one of the rows a reader meets before any
   * record. A list of "X changed" where X may be furniture and may be the project's own history,
   * with nothing saying which, is the same gap the attention row had.
   *
   * IT IS READ IN BULK, one query for the records a page of rows mentions — see `toChanges` in
   * lib/records.ts. Nothing stores it here, so it cannot drift from the record.
   */
  origin: RecordOrigin | null
  op: ChangeOp
  actorType: ActorType
  actorId: string
  /** The agent session responsible, when there was one. */
  sessionId: string | null
  field: string | null
  oldValue: string | null
  newValue: string | null
  at: string
}

// ------------------------------------------------------------------- the derived source index
//
// TWO LAYERS, AND THE RULE THAT KEEPS THEM APART.
//
//   CANONICAL — the `module` records above. Curated by a person or an agent. They carry
//   responsibility, history, decisions and engineering context. Few, stable, meaningful. A module
//   survives a refactor that moves every file it covers.
//
//   DERIVED — everything below. Built by scanning the repository: files, their language, size,
//   what they import and export, when they last changed. Many, volatile, mechanical. It is
//   REBUILT, not edited, and nothing a person types may live in it, because the next scan would
//   delete it. That is why the API has no PUT and no PATCH for a source file: the only write is
//   a rebuild.
//
//   THE RULE: the derived layer is never canonical and never hand-maintained. When the two
//   disagree about a file, the scan is right about what EXISTS and the module is right about
//   what it MEANS.
//
//   THE LINK: a module declares `claims` (see ModuleData above), and the index resolves those
//   claims to real files. That is what makes the two queries this exists for possible —
//   UNCLAIMED code that no module has taken responsibility for, and STALE claims pointing at
//   paths that no longer exist.
//
// These shapes are here rather than in the server because the browser draws them, and because a
// derived view still needs one definition: two descriptions of a scan drift the same way two
// descriptions of a stored shape do.

/** The languages the scan can recognise. Anything else is not indexed, and the scan says so. */
export const SOURCE_LANGUAGES = ['typescript', 'tsx', 'javascript', 'jsx', 'css', 'html', 'sql', 'python'] as const
export type SourceLanguage = (typeof SOURCE_LANGUAGES)[number]

/**
 * File extension -> language. This list IS the definition of what counts as source here.
 *
 * A file whose extension is not in it is not indexed, and the number of such files is reported
 * in the index stamp rather than dropped quietly: a coverage figure computed over a set nobody
 * can see is a number that cannot be argued with.
 */
export const SOURCE_FILE_EXTENSIONS: Readonly<Record<string, SourceLanguage>> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'jsx',
  '.css': 'css',
  '.html': 'html',
  '.sql': 'sql',
  '.py': 'python',
}

/** One file, as the scan found it. Nothing here is typed by a person. */
export interface SourceFile {
  /** Relative to the repository root, with "/" separators, e.g. "src/web/pages/HomePage.tsx". */
  path: string
  language: SourceLanguage
  sizeBytes: number
  lines: number
  /** What it imports, as written in the source — module specifiers, not resolved paths. */
  imports: string[]
  /** The names it declares for other files to use. Empty for a language that has none. */
  exports: string[]
  /** The file's own last-modified time, in local time like every other stamp Mole Office stores. */
  modifiedAt: string
}

/**
 * WHEN the index was last built, and what it looked at.
 *
 * Every source response carries one. A derived view that does not say how old it is invites
 * somebody to trust it after a refactor, which is the one way this feature can do harm.
 */
export interface SourceIndexStamp {
  /** When the scan that produced this index finished, in local time. */
  builtAt: string
  /** How long ago that was, measured on this request. */
  ageSeconds: number
  /** The same age as a person reads it: "45s", "12m", "3h20m", "2d4h". */
  age: string
  fileCount: number
  /** The directory that was walked. Absolute, because a relative one depends on the caller. */
  root: string
  /** How long the scan took, in milliseconds. */
  scanMs: number
  /** "human:owner" or "agent:claude-code" — who asked for the rebuild. */
  builtBy: string
  /** What the scan did NOT look at, one sentence each. An unsearched place is not an empty one. */
  skipped: string[]
  /** How imports and exports were read, and what that method cannot see. */
  howRead: string
  /** The sentence that stops this being mistaken for the canonical layer. */
  derived: string
}

/** One claim of one module, resolved against the index. */
export interface ResolvedClaim {
  /** Exactly as the module wrote it. */
  pattern: string
  /** The files it matched, in path order. Empty means the claim is stale. */
  matched: string[]
  /**
   * Why this claim could never match, when that is knowable without the index — an absolute
   * path, a Windows separator, a `..` that climbs out of the repository. Null otherwise, which
   * includes the ordinary stale case: a well-formed claim whose files have gone.
   */
  problem: string | null
  /** A refusal code for an unmatchable pattern, carried so pages can draw it in the reader's language. */
  problemCode?: ClaimProblemCode | null
  /**
   * The registered repository the stated row names, whose stored scan this claim was matched against.
   * Absent where the claim was matched against the workspace scan, which names no repository.
   */
  repository?: RepositoryNamed
}

/** A registered repository, as an answer names it: its id and what a person calls it. */
export interface RepositoryNamed {
  id: string
  name: string
}

/** A module's stated rows in one registered repository, counted against that repository's own stored scan. */
export interface ClaimsInOneRepository {
  repository: RepositoryNamed
  /** The stored scan of this repository the claims were counted against, or null because none is stored. */
  scan: SourceIndexStamp | null
  /** Every pattern stated in this repository, resolved. Empty when `notCounted` is set. */
  claims: ResolvedClaim[]
  /** Every file of this repository matched by at least one claim, deduplicated and sorted. */
  files: string[]
  /** Why the patterns stated in this repository were not counted, with how to scan it; null when they were. */
  notCounted: string | null
}

/**
 * What one module claims, counted repository by repository: decision 0KSoGUNDF9ml, as the secretary settled
 * it on 6 October 2026 (messages VNOIBKwRSVlk and ZDUbogzJDKYC). Each stated row is counted against
 * the stored scan of the repository the row names, and never against another repository's.
 */
export interface ModuleClaimsByRepository {
  moduleId: string
  moduleTitle: string
  /** One entry per repository at least one of this module's stated rows names, in name order. */
  repositories: ClaimsInOneRepository[]
  /** Paths this module claims in more than one repository, each with the repositories it was counted in. */
  inMoreThanOne: { path: string; repositories: RepositoryNamed[] }[]
}

/** What one module claims, resolved. */
export interface ModuleClaims {
  moduleId: string
  moduleTitle: string
  claims: ResolvedClaim[]
  /** Every file matched by at least one of this module's claims, deduplicated and sorted. */
  files: string[]
  /**
   * Set when this module's stated rows in the implementation map cannot be counted against the
   * workspace scan, because the project holds more than one repository and the scan names none of
   * them. The sentence names the repositories. Null otherwise.
   *
   * In coverage of a project with registered repositories: set when none of this module's stated rows
   * could be counted, and it then joins each repository's `notCounted` sentence, as the source door does.
   */
  problem: string | null
  /**
   * Present in coverage of a project with registered repositories: the module's rows counted repository
   * by repository, by the source door's own reading (`claimsByRepository`). `claims` then holds the
   * counted claims, each naming its repository, and `files` holds each counted path once per repository
   * it was counted in, so a path counted in two repositories is in `files` twice.
   */
  repositories?: ClaimsInOneRepository[]
}

/** A stale claim, named with the module that made it, because that is who has to fix it. */
export interface StaleClaim {
  moduleId: string
  moduleTitle: string
  pattern: string
  problem: string | null
  /** The same source-claim code, when the pattern can never match. */
  problemCode?: ClaimProblemCode | null
  /** The repository whose stored scan the pattern matched nothing in, in a project with registered repositories. */
  repository?: RepositoryNamed
}

/**
 * Coverage of one registered repository, counted against its own stored scan, or why it was not counted.
 * Every count here is of files in this repository only.
 */
export type CoverageInOneRepository =
  | {
      repository: RepositoryNamed
      /** The stored scan of this repository the files were counted in. */
      scan: SourceIndexStamp
      totalFiles: number
      claimedFiles: number
      unclaimedFiles: number
      /** Claimed as a percentage of this repository's scan, to one decimal. Null when the scan holds no file. */
      percentClaimed: number | null
      /** The files of this repository no module claims in it, in path order. */
      unclaimed: string[]
      notCounted: null
    }
  | {
      repository: RepositoryNamed
      /** Null because no scan of this repository is stored. */
      scan: null
      /** Why its files were not counted, with how to scan it. */
      notCounted: string
    }

/** The two queries this whole layer exists for, plus the number that summarises them. */
export interface SourceCoverage {
  totalFiles: number
  claimedFiles: number
  unclaimedFiles: number
  /** Claimed as a percentage of the index, to one decimal. Null when the index is empty. */
  percentClaimed: number | null
  /** The files no module has taken responsibility for, in path order. */
  unclaimed: string[]
  /** Claims pointing at paths that are not in the index. */
  staleClaims: StaleClaim[]
  /** Every live module, including the ones that claim nothing — a gap is a finding. */
  modules: ModuleClaims[]
  /**
   * Null when the project registers no repository: then every count above is of the workspace scan.
   *
   * Otherwise one entry per registered repository, in name order, each counted against that
   * repository's own stored scan; the workspace scan is not counted, because it does not record which
   * repository it is of. The counts above are then the sums over the repositories that were counted,
   * `unclaimed` lists each repository's unclaimed paths in turn (so a path unclaimed in two repositories
   * is in it twice), and each stale claim names its repository.
   */
  repositories: CoverageInOneRepository[] | null
}

/** One file that is in both scans and is not the same file it was. */
export interface SourceChange {
  path: string
  /** What differs, in words: "1,203 -> 1,455 bytes; 2 imports added". */
  what: string
}

/** What a rebuild changed. The answer to "is anything I was told still true?". */
export interface ReindexReport {
  /** True when there was no index before this one, so nothing could be compared. */
  firstScan: boolean
  previousBuiltAt: string | null
  added: string[]
  removed: string[]
  changed: SourceChange[]
  /** Files that were in the old index and came back identical. */
  unchanged: number
}

/** A link as shown on a page, already resolved to the other end and the right label. */
export interface ResolvedLink {
  linkId: string
  type: LinkType
  /** How to describe it from the point of view of the record you are looking at. */
  label: string
  /** True when this record is the target, so the reverse label applies. */
  isBacklink: boolean
  inferred: boolean
  /**
   * WHO WROTE THE LINK AND WHEN, copied from the stored row this projection is made from.
   *
   * The link table has carried all three since `links.created_by_type` existed (migration 0193),
   * and `WorkspaceLink` already serves them to `GET /api/links`. This projection served none of
   * them, so the record page could not name the writer of a `realises` or `instead_of` answer even
   * though the row held the name. They are optional here because a test or an older reply may
   * have no such fields, and absence must read as not recorded rather than as a guess.
   */
  createdAt?: string
  createdBy?: string
  createdByType?: ActorType | null
  /**
   * The record at the other end, including HOW IT ENTERED THE CORPUS.
   *
   * `origin` is on this projection for the reason it is on an attention row: the neighbour is what a
   * reader meets, and the record it names is a second request away. A link row on a fixture record's
   * page used to carry id, kind, title and summary and no mark at all. It is a projection and not a
   * copy — `resolveLinks` reads the records fresh on every request and nothing stores this shape —
   * so the record's `origin` cannot change and leave it wrong.
   */
  other: Pick<PanelRecord, 'id' | 'kind' | 'title' | 'summary' | 'origin'>
  /** True when the record at the other end has been deleted. Shown as broken, never hidden. */
  broken: boolean
}

/**
 * How much a link blocks, as it is SERVED — on either end, on every link.
 *
 * Three fields, because they answer three different questions and none may be guessed at:
 *
 *   gate        — what is STORED. Null means nobody said how hard this dependency is. NULL IS NOT
 *                 `hard`: every `blocks` link written before the columns existed has null here, and
 *                 reading it as hard would put a word in the author's mouth.
 *   gateLabel   — the words to print. Written in one place so that the record page and the pipeline
 *                 drawing cannot word one edge two ways.
 *   gateProblem — set when the two stored columns do not make a gate anybody can read: a word
 *                 GATE_KINDS does not have, or a `partial` with no stage. Serving null there would
 *                 say nobody stated anything, when somebody stated something unreadable.
 *
 * THEY ARE REQUIRED BECAUSE THE SERVER ALWAYS SENDS THEM. Every link served goes through
 * `readLinkGate`, which returns all three on every path. This type used to exist three times — the
 * server declared it, the browser mirrored it as optional in LinkPanel.tsx, and `RecordDetail` in
 * web/api.ts did not admit to it at all, so the fields arrived in the JSON and no type in the
 * browser named them. That is the defect this codebase keeps producing, and it is fixed by there
 * being one declaration rather than by a comment asking three files to agree.
 *
 * A reader that must also cope with a reply that did NOT carry them wants `Partial<LinkGate>`, which
 * says so in the type instead of weakening this one. `gateOf` in LinkPanel.tsx is the one such
 * reader, and it checks at runtime.
 */
export interface LinkGate {
  gate: Gate | null
  gateLabel: string | null
  gateProblem: string | null
  /**
   * WHICH SORT OF THING THE STAGE IS, as stored when the link was written: a checklist `item`, a
   * `block`, or `words`. `not_recorded` on a partial gate written before `links.gate_up_to_sort`
   * existed, and null when the gate names no stage. Problem TZP9AJb4o2Cs.
   */
  gateStage: GateStage
}

/** A link as a page gets it: the shared shape, plus what it is waiting for and how much. */
export type GatedLink = ResolvedLink & LinkGate
