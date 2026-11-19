// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KINDS AS THEY ARE WRITTEN OUT, AND WHAT THE API PUBLISHES ABOUT THEM.
 *
 * The kinds' fields and rules were moved out of src/shared/kinds.ts, one kind to a file under
 * src/shared/kinds/, across many slices. This file holds the table that names one kind per record
 * kind, the shapes generated from ../targets.ts, the package completion shape, and the gate
 * contract.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands every name here on, and every caller still imports
 * it from kinds.ts.
 *
 * IT IMPORTS THE KIND FILES, AND THE DECLARATIONS THE SHAPES ARE BUILT FROM, AND NOTHING THAT
 * TOUCHES THE DATABASE.
 *
 * IT READS `KIND_SPECS` FROM src/shared/kinds.ts INSIDE `describeKinds` ONLY, so the cycle that
 * file and this one make is resolved before either asks the other for a value — the same shape as
 * ./validation.ts.
 */

import { STABLE_BOOTSTRAP_SHAPES } from '../stable-bootstrap-notices.ts'
import { WHOLE_SUITE_RECEIPT_SHAPES } from '../whole-suite-receipt.ts'
import { DRAWN_ON_SHAPES } from './drawn-on.ts'
import { SHARED_SHAPES } from './shared-shapes.ts'
import { TOOL_USE_SHAPES } from './tool-use.ts'
import { REPORT_BLOCK_SHAPES } from './report-blocks.ts'
import { MAIN_SUITE_FIX_SHAPES } from '../main-suite-fix.ts'
import { SHORT_FORM_SHAPES } from './short-form-fields.ts'
import { type FieldSpec, type KindSpec, type ShapeSpec } from './kind-common.ts'
import { HUMAN_ONLY_KINDS, RECORD_KINDS, type RecordKind } from '../types.ts'
import { KIND_SPECS } from '../kinds.ts'
// WHAT A PERSON CAN POINT AT, DECLARED ONCE, in ../targets.ts. The shapes an annotation's `context`
// is checked against are BUILT from that declaration below — see `targetShapeSpecs` — so a
// fourteenth thing a person can point at is published, validated and named on screen without
// anybody editing this file.
import { PLACES, TARGET_KINDS, TARGET_SPECS_BY_KIND, type PlaceAt } from '../targets.ts'
// The gate imports are here for `describeGate` below and for nothing else. A
// gate is not a field of any record, so no FieldSpec mentions one and `validateData` never sees
// one; what this file does with a gate is PUBLISH it. `gateFault`, which decides whether a gate is
// well formed, is deliberately not imported: importing the verdict would invite a second check to
// grow here, and the second check is what the block change removed.
import { GATE_FAULTS, GATE_FAULT_RULES, GATE_KINDS, type Gate, type GateKind } from '../work.ts'
import { wholeSuiteReceipt } from './whole-suite-receipt.ts'
import { noticeRules } from './notice-rules.ts'
import { QUICK_NOTE_SHAPES, quickNoteKind } from './quick-note.ts'
import { MODULE_SHAPES, moduleKind } from './module.ts'
import { pipelineKind } from './pipeline.ts'
import { blockKind } from './block.ts'
import { sealedTipKind } from './sealed-tip.ts'
import { mergeEntryKind } from './merge-entry.ts'
import { emergencyPushKind } from './emergency-push.ts'
import { SESSION_SHAPES, sessionKind } from './session.ts'
import { PROBLEM_SHAPES, problemKind } from './problem.ts'
import { TASK_SHAPES, taskKind } from './task.ts'
import { purchaseKind } from './purchase.ts'
import { obligationKind } from './obligation.ts'
import { claimKind } from './claim.ts'
import { proposalKind } from './proposal.ts'
import { DECISION_SHAPES, decisionKind } from './decision.ts'
import { ideaKind } from './idea.ts'
import { CRITICISM_SHAPES, criticismKind } from './criticism.ts'
import { DIRECTION_SHAPES, directionKind } from './direction.ts'
import { wannaTryKind } from './wanna_try.ts'
import { MESSAGE_SHAPES, messageKind } from './message.ts'
import { NOTE_SHAPES, noteKind } from './note.ts'
import { REPORT_SHAPES, reportKind } from './report.ts'
import { draftKind } from './draft.ts'
import { annotationKind } from './annotation.ts'
import { AGENT_SHAPES, agentKind } from './agent.ts'
import { roleCardKind } from './role-card.ts'
import { roleCardWordsKind } from './role-card-words.ts'
import { roleRequestKind } from './role-request.ts'
import { STOPPING_POINT_SHAPES, stoppingPointKind } from './stopping-point.ts'
import { CONTEXT_BUNDLE_SHAPES, contextBundleKind } from './context-bundle.ts'
import { placeholderKind } from './placeholder.ts'
import { ranInsteadKind } from './ran-instead.ts'
import { WORK_DOMAIN_SHAPES, workDomainKind } from './work-domain.ts'
import { TRAJECTORY_SHAPES, trajectoryKind } from './trajectory.ts'
import { plannedStateKind } from './planned-state.ts'
import { NOTEBOOK_SHAPES, notebookKind } from './notebook.ts'
import { INCIDENT_SHAPES, incidentKind } from './incident.ts'
import { REGULATION_SHAPES, regulationKind } from './regulation.ts'
import { GOAL_SHAPES, goalKind } from './goal.ts'
import { FLOW_SHAPES, flowKind } from './flow.ts'
import { FLOW_RUN_SHAPES, flowRunKind } from './flow-run.ts'
import { hostJobKind } from './host-job.ts'
import { counterKind } from './counter.ts'
import { CHECKLIST_SHAPES, checklistKind } from './checklist.ts'
import { BOOKING_SHAPES, bookingKind } from './booking.ts'
import { secretaryDutiesKind } from './secretary-duties.ts'
import { watchKind } from './watch.ts'
import { backlogItemKind } from './backlog-item.ts'
import { HANDBOOK_SHAPES, handbookKind } from './handbook.ts'
import { PROJECT_CHAPTER_SHAPES, projectChapterKind } from './project-chapter.ts'
import { DESIGN_SHAPES, designKind } from './design.ts'
import { designReviewKind } from './design-review.ts'
import { DESIGN_REMINDER_SHAPES, designReminderKind } from './design-reminder.ts'
import { toolCategoryKind } from './tool-category.ts'
import { toolKind } from './tool.ts'

// ============================================================================ the shapes

export const packageCompletionShape: ShapeSpec = {
  name: 'PackageCompletion',
  description:
    'WHO CONFIRMED A PACKAGE\'S TASK FINISHED, AND WHEN. One entry per task, written once, never rewritten, ' +
    'because reopening a finished task is a new piece of work and not an edit to this.',
  fields: [
    {
      key: 'by',
      type: 'BundleExporter',
      required: true,
      description:
        'Who confirmed it finished, in the attribution every write carries. It is the responsible one or the ' +
        'person, and the confirm door is what enforces that.',
      example: { actorType: 'agent', actorId: 'secretary-1' },
    },
    {
      key: 'at',
      type: 'date',
      required: true,
      description: 'When they confirmed it, in local wall clock.',
      example: '2026-09-17 09:30:00',
    },
  ],
}

/**
 * The name of the shape that describes one kind of target: `record` becomes `RecordTarget`.
 *
 * ONE SPELLING, used by the generator below and by the discriminator that selects between them, so
 * a variant cannot be published under a name nothing selects.
 */
function targetShapeName(kind: string): string {
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)}Target`
}

/**
 * THE PUBLISHED SHAPE OF EVERY THING A PERSON CAN POINT AT, BUILT FROM ONE DECLARATION.
 *
 * `TARGET_SPECS` in ./targets.ts says, for each of the thirteen, what identifies it and what each
 * of those fields is in plain English. This turns that into the shapes `GET /api/kinds` publishes
 * and `validateData` enforces — which is what makes "adding a target is one entry" true rather than
 * aspirational. Typing these out by hand would be the same list written twice, free to disagree,
 * and the disagreement would be silent: a field the checker refuses and the schema advertises.
 */
export function targetShapeSpecs(): Record<string, ShapeSpec> {
  const shapes: Record<string, ShapeSpec> = {
    Target: {
      name: 'Target',
      description:
        'WHAT SOMEBODY POINTED AT. The `kind` key decides which of the shapes below the rest of the object has ' +
        'to be. Each one carries only ids: what the thing SAYS is read from the thing itself, never copied here, ' +
        'so nothing stored can come to disagree with it.',
      discriminator: {
        key: 'kind',
        variants: Object.fromEntries(TARGET_KINDS.map((kind) => [kind, targetShapeName(kind)])),
      },
      fields: [],
    },
  }
  for (const kind of TARGET_KINDS) {
    const spec = TARGET_SPECS_BY_KIND[kind]
    shapes[targetShapeName(kind)] = {
      name: targetShapeName(kind),
      description: spec.what,
      fields: [
        {
          key: 'kind',
          type: `'${kind}'`,
          required: true,
          description: `Always the string "${kind}". It says this points at a ${spec.noun}.`,
          example: kind,
        },
        // AN IDENTIFIER THE DECLARATION MARKS OPTIONAL IS PUBLISHED AS OPTIONAL AND VALIDATED AS
        // OPTIONAL, from the same mark, so the shape a reader is served and the shape a write is
        // held to cannot come apart. See `TargetIdentifier.optional` in ./targets.ts.
        ...spec.identifies.map((field) => ({
          key: field.key,
          type: 'string',
          required: field.optional !== true,
          description: field.what,
          example: field.example,
        })),
      ],
    }
  }
  return shapes
}

/**
 * THE PUBLISHED SHAPE OF WHERE SOMEBODY WAS, BUILT FROM ONE DECLARATION.
 *
 * `PLACES` in ./targets.ts is the list of the five, and the `Place` union beside it is their shape.
 * This turns both into the shapes `GET /api/kinds` publishes and `validateData` enforces.
 *
 * WHY THE FIELDS ARE A TABLE KEYED BY THE PLACE WORD, and not five hand-written entries. The table
 * is typed `Record<PlaceAt, ...>`, so adding a sixth member to `PLACES` without describing it here
 * fails the build. Five entries written out by hand would be the same list twice, free to disagree,
 * and the disagreement would be silent in the worst way: a field the checker refuses and the
 * published schema advertises.
 *
 * WHAT THIS DOES NOT DO. It does not decide whether a place may be stored on THIS target — a
 * position inside stored text on a thing that holds none is refused by `checkPlace` in
 * src/server/lib/targets.ts, which can see the target and this cannot.
 */
export function placeShapeSpecs(): Record<string, ShapeSpec> {
  const name = (at: PlaceAt): string => `${at.charAt(0).toUpperCase()}${at.slice(1)}Place`
  const cut: FieldSpec = {
    key: 'cut',
    type: 'boolean',
    required: false,
    description:
      'True when the stored words are only the opening of a longer selection. It applies to the quote at each end ' +
      'when a selection crossed parts. Leave it out when no words were cut.',
    example: true,
  }

  const said: Record<PlaceAt, { what: string; fields: FieldSpec[] }> = {
    words: {
      what: 'BOTH ENDS OF WHAT SOMEBODY CHOSE, IN ONE RUN OF ONE STORED STRING. The exact characters.',
      fields: [
        {
          key: 'span',
          type: 'Span',
          required: true,
          description: 'The words, and where they were. See the Span shape.',
          example: { quote: 'the mast was knocked', from: 41, to: 61, field: 'data.blocks[#b-1].text' },
        },
        cut,
      ],
    },
    across: {
      what:
        'BOTH ENDS IN STORED TEXT, BUT IN DIFFERENT RUNS. Two exact ends, and how many things lay between them. ' +
        'There is deliberately no single span for this: one span names one stored string, so joining the two ends ' +
        'would produce a quote that was never on anybody\'s screen.',
      fields: [
        {
          key: 'from',
          type: 'Span',
          required: true,
          description: 'The first end, in the run it started in.',
          example: { quote: 'the mast', from: 41, to: 49, field: 'data.blocks[#b-1].text' },
        },
        {
          key: 'to',
          type: 'Span',
          required: true,
          description: 'The last end, in the run it finished in.',
          example: { quote: 'was knocked', from: 0, to: 11, field: 'data.blocks[#b-2].text' },
        },
        {
          key: 'parts',
          type: 'number',
          required: true,
          description: 'How many things the selection lay across. At least two, or it was not across anything.',
          example: 3,
        },
        {
          key: 'partWord',
          type: 'string',
          required: true,
          description:
            'The plural word for what those things were — "blocks", "rows" — measured in the browser at the ' +
            'moment of pointing, because nothing on the server can see what lay between two runs on a screen.',
          example: 'blocks',
        },
        cut,
      ],
    },
    quote: {
      what:
        'WORDS THAT WERE ON THE SCREEN AND THAT NO STORED STRING CAN BE SHOWN TO HOLD. This is how somebody who ' +
        'selects words of a note Mole Office draws from its own code keeps them.',
      fields: [
        {
          key: 'words',
          type: 'string',
          required: true,
          description: 'The words, as they were on screen. Never empty: an empty quote is found wherever it is looked for.',
          example: 'says how much a surface says',
        },
        cut,
      ],
    },
    run: {
      what: 'NO SELECTION. The run of stored text that was under the pointer, named by where that run starts.',
      fields: [
        {
          key: 'field',
          type: 'string',
          required: true,
          description: 'Which stored string the run came out of, as a field path from the record down.',
          example: 'data.blocks[#b-1].text',
        },
        {
          key: 'offset',
          type: 'number',
          required: true,
          description:
            'Where the RUN starts inside that string, counted from 0 — never the character under the pointer. ' +
            'The run is found again by containment, so a block drawn in different pieces still finds it.',
          example: 0,
        },
      ],
    },
    surface: {
      what:
        'NOTHING UNDER THE POINTER HELD TEXT, SO THE THING ITSELF IS THE WHOLE ANSWER. The honest floor, and a ' +
        'real answer rather than an absence: it says no place finer than the thing was recorded.',
      fields: [],
    },
  }

  const shapes: Record<string, ShapeSpec> = {
    Place: {
      name: 'Place',
      description:
        'WHERE SOMEBODY WAS INSIDE THE THING THEY POINTED AT. The `at` key decides which of the five shapes below ' +
        'the rest of the object has to be, and one of the five is always true. `words`, `across` and `run` name ' +
        'positions inside stored text, so they need a thing that holds some; `quote` and `surface` are legal on ' +
        'everything.',
      discriminator: { key: 'at', variants: Object.fromEntries(PLACES.map((at) => [at, name(at)])) },
      fields: [],
    },
  }
  for (const at of PLACES) {
    shapes[name(at)] = {
      name: name(at),
      description: said[at].what,
      fields: [
        {
          key: 'at',
          type: `'${at}'`,
          required: true,
          description: `Always the string "${at}".`,
          example: at,
        },
        ...said[at].fields,
      ],
    }
  }
  return shapes
}

/**
 * A CHECKLIST ITEM IS NOT A RECORD, AND THAT IS A DECISION RATHER THAN AN UNFINISHED MIGRATION.
 *
 * Decided 2026-08-11, and written here because this is where somebody looking to change it will
 * arrive. A checklist item stays a nested object inside its module's `data`. It keeps the append,
 * edit and version semantics it has: a stable `id`, a per-item PATCH that does not rewrite the
 * array around it, and a change row of its own.
 *
 * WHY THIS NEEDS SAYING AT ALL. A pipeline step used to be a nested object too, and it became a
 * record — `block` — because nothing could link to one: a problem, a claim or an obligation about a
 * step had nowhere to attach. That is a real precedent and it is the wrong reason to move a
 * checklist item. Nothing has yet needed to attach an independent record, link or history to ONE
 * checklist line. Promoting them because the nearest shape was promoted is speculative abstraction,
 * which is rule 6, and it would double the write paths for a thing nobody has asked to link to.
 *
 * WHAT WOULD REOPEN IT: real use showing a recurring need to attach records, links or history
 * directly to a single checklist item. Not the block precedent, and not tidiness.
 *
 * `tests/checklist-item.test.ts` fails if a checklist-item record kind appears, so the next person
 * to consider this meets the decision instead of finding a half-migration.
 */

export const SHAPE_SPECS: Record<string, ShapeSpec> = {
  ...STABLE_BOOTSTRAP_SHAPES,
  ...MAIN_SUITE_FIX_SHAPES,
  ...WHOLE_SUITE_RECEIPT_SHAPES,
  ...QUICK_NOTE_SHAPES,
  ...SESSION_SHAPES,
  // ------------------------------------------------- what somebody pointed at, and which words
  //
  // Generated from ./targets.ts. See `targetShapeSpecs` above for why.
  ...targetShapeSpecs(),

  // ------------------------------------------------- where somebody was inside it
  //
  // Generated from the five words in ./targets.ts. See `placeShapeSpecs` above for why.
  ...placeShapeSpecs(),

  // ------------------------------------------------- who confirmed a package finished
  //
  // Declared beside the package fields that use it, above. It is keyed by its own name rather than
  // typed here so the sentence about a confirmation lives with the other sentences about a package.
  [packageCompletionShape.name]: packageCompletionShape,
  ...DECISION_SHAPES,
  ...GOAL_SHAPES,
  ...FLOW_SHAPES,
  ...HANDBOOK_SHAPES,
  ...FLOW_RUN_SHAPES,
  ...MODULE_SHAPES,
  ...SHARED_SHAPES,
  ...TOOL_USE_SHAPES,
  ...AGENT_SHAPES,
  ...CRITICISM_SHAPES,
  ...TRAJECTORY_SHAPES,
  ...DRAWN_ON_SHAPES,
  ...MESSAGE_SHAPES,
  ...STOPPING_POINT_SHAPES,
  ...SHORT_FORM_SHAPES,
  ...CHECKLIST_SHAPES,
  ...NOTE_SHAPES,
  ...BOOKING_SHAPES,
  ...REPORT_BLOCK_SHAPES,
  ...REGULATION_SHAPES,
  ...PROBLEM_SHAPES,
  ...DIRECTION_SHAPES,
  ...TASK_SHAPES,
  ...CONTEXT_BUNDLE_SHAPES,
  ...REPORT_SHAPES,
  ...WORK_DOMAIN_SHAPES,
  ...NOTEBOOK_SHAPES,
  ...INCIDENT_SHAPES,
  ...PROJECT_CHAPTER_SHAPES,
  ...DESIGN_SHAPES,
  ...DESIGN_REMINDER_SHAPES,
}

// ============================================================================ the kinds

/**
 * THE KINDS AS THEY ARE WRITTEN OUT, BEFORE THE ONE FIELD EVERY KIND GETS.
 *
 * `KIND_SPECS` below is this with `data.shortForms` added to every kind, and `KIND_SPECS` is what
 * everything else reads. `shortFormsField` in ./kinds/short-form-fields.ts says whose decision that
 * was and what it is for.
 */
export const KINDS_AS_WRITTEN: Record<RecordKind, KindSpec> = {
  whole_suite_receipt: wholeSuiteReceipt,
  notice_rules: noticeRules,
  quick_note: quickNoteKind,
  // ------------------------------------------------------------------------------- module
  module: moduleKind,

  // ------------------------------------------------------------------------------ pipeline
  pipeline: pipelineKind,

  // ------------------------------------------------------------------------------ block
  block: blockKind,

  // ------------------------------------------------------------------------------- session
  sealed_tip: sealedTipKind,
  merge_entry: mergeEntryKind,
  emergency_push: emergencyPushKind,
  session: sessionKind,

  // ------------------------------------------------------------------------------- problem
  problem: problemKind,

  // ---------------------------------------------------------------------------------- task
  task: taskKind,

  // ------------------------------------------------------------------------------ purchase
  purchase: purchaseKind,

  // ---------------------------------------------------------------------------- obligation
  obligation: obligationKind,

  // --------------------------------------------------------------------------------- claim
  claim: claimKind,

  // ------------------------------------------------------------------------------ proposal
  //
  // ---------------------------------------------------------------------------------------
  // THE FORK AN AGENT MAY WRITE, AND THE ONE LINK THAT RESOLVES IT
  // ---------------------------------------------------------------------------------------
  //
  // `decision` is human-only and stays human-only: a decision is a governance act, and an agent
  // asserting one would let it launder its own choices into the record where nobody could tell them
  // from the owner's. That guard is the only access control in the product and it works.
  //
  // What it left with nowhere to go is the fork itself. During this project's own development an
  // agent reached a real choice four times, was refused the kind, and wrote a `note` — and nothing
  // queries notes, so a later reader had to open every note in the workspace to find them, and could
  // not tell a question waiting on the owner from a choice the owner had already made. This kind is
  // that queue, made visible, with the boundary untouched.
  //
  // HOW A PROPOSAL IS RESOLVED, AND WHY THERE IS NO `resolved` FIELD. The human writes the
  // `decision` and links it to the proposal with `derived_from` — from the decision, to the
  // proposal, so the proposal reads back as "source of" that decision. Three reasons that link and
  // not another:
  //
  //   1. It is literally true. The decision was made FROM this proposal's fork, options and
  //      reasoning, which is what `derived_from` says everywhere else in the product.
  //   2. It is directional, so which record is the governance act stays visible. `relates_to` is
  //      symmetric and would lose exactly that.
  //   3. `supersedes` was the other candidate and was rejected. A superseded record is one a newer
  //      version of the same thing has replaced; a proposal is not an early draft of the decision,
  //      it is the reasoning the decision stands on, and it keeps being worth reading afterwards.
  //
  // Resolution is therefore DERIVED — a proposal with a `derived_from` backlink from a decision is
  // resolved, one without it is open — and there is deliberately no second stored fact that could
  // disagree with the link. A `resolved: true` beside a missing link, or a link beside a `resolved:
  // false`, is the defect this codebase keeps producing, and this kind is declared without the field
  // that would make it possible.
  //
  // NO `consequence` AND NO `paused`, unlike the eight kinds that take them. A proposal has no state
  // and cannot stop short, so the attention rule can never select one, and a stored consequence
  // would be a field nothing reads. What is urgent about a fork is the WORK waiting on it, and that
  // work is its own record with its own consequence, linked with `blocks`.
  proposal: proposalKind,

  // ------------------------------------------------------------------------------ decision
  decision: decisionKind,

  // ---------------------------------------------------------------------------------- idea
  idea: ideaKind,

  // ----------------------------------------------------------------------------- criticism
  criticism: criticismKind,

  // ----------------------------------------------------------------------------- direction
  direction: directionKind,

  // ---------------------------------------------------------------------------- wanna_try
  wanna_try: wannaTryKind,

  // ------------------------------------------------------------------------------- message
  message: messageKind,

  // ---------------------------------------------------------------------------------- note
  note: noteKind,

  // -------------------------------------------------------------------------------- report
  //
  // ---------------------------------------------------------------------------------------
  // WRITING FOR A PERSON, KEPT IN MOLE OFFICE. WHY IT IS ITS OWN KIND
  // ---------------------------------------------------------------------------------------
  //
  // A formal report or review is read inside Mole Office, in the module or the
  // context it belongs to. A file in the repository may stay as the durable source and a page
  // elsewhere may be a copy, but the product must not be the last place the person can read their own work.
  //
  // MOLE OFFICE COULD NOT HOLD ONE, AND THAT IS MEASURED. Rich content — prose, a chart, an equation, a
  // table, a picture — could only be written into a module's `summaryBlocks`, and across every
  // module in the corpus not one block had ever been written. A note holds one plain string. So the
  // last review was delivered as a link to a page outside the product, which is the exact failure
  // Mole Office exists to prevent.
  //
  // IT IS NOT A NOTE. A note is free writing with a date, and its own `whenToRecord` says it is the
  // one kind nothing queries. A review filed as a note is a review nobody can find, which is the
  // same failure one step further in. A report says who it is FOR and it says what it is ABOUT, and
  // those two are what make it findable.
  //
  // IT IS NOT A MODULE'S CURATED SUMMARY. That field says where a subsystem stands NOW and is
  // rewritten as the subsystem changes. A report is about a day and stays as it was written. Filing
  // a dated review into `summary` or `summaryBlocks` destroys what those fields are for, and the
  // module can then hold only one of the two things it needs to hold.
  //
  // WHAT IT IS ABOUT IS A LINK AND THERE IS NO FIELD FOR IT. `about` already means "this record is
  // about that one" and reads back from the other end as "subject of", so the module's own page can
  // list the reports about it without a second stored copy that could disagree with the link. The
  // rule below names the route, and `MOVED_OUT_OF_DATA` answers an author who sends `about` in
  // `data` with that route rather than with the bag nothing reads.
  //
  // NO `consequence` AND NO `paused`, for the reason a proposal has neither: a report has no state,
  // it cannot stop short, and the attention rule can therefore never select one. A stored
  // consequence would be a field nothing reads. What is urgent is the WORK a report asks for, and
  // that work is its own record.
  //
  // NO FIELD FOR WHO WROTE IT. Every write is attributed already — the change log carries the actor
  // and the session for the create — so a `by` field would be a second answer to a question the
  // record already answers, free to disagree with the first.
  report: reportKind,

  // --------------------------------------------------------------------------------- draft
  //
  // WRITING THAT IS NOT SENT YET, KEPT IN THE OFFICE. A decision on the six points,
  // and point 3 of another decision. src/shared/drafts.ts holds the words;
  // src/server/lib/drafts.ts holds the send door and the reminder.
  //
  // IT IS NOT A MESSAGE THAT HAS NOT GONE. A message filed with no recipient is how "Save without
  // sending" keeps words today, and it is a message: it can only ever be a message. A draft may become
  // a message, a report or a note, and it stays where it is after it is sent.
  //
  // WHO READS IT IS SAID IN `purpose`: any caller in the project. No reader rule
  // is wanted. A decision of 26 September 2026 said so, and replaced point 4 of another
  // decision.
  draft: draftKind,

  // ------------------------------------------------------------------------------ annotation
  annotation: annotationKind,

  // ------------------------------------------------------------------------------- agent
  agent: agentKind,

  // ------------------------------------------------------------------------ role card
  role_card: roleCardKind,

  // ------------------------------------------------------------------------ role card words
  role_card_words: roleCardWordsKind,

  // ------------------------------------------------------------------------ role request
  //
  // EVERY EXAMPLE BELOW NAMES THE WORKER CARD AND NO OTHER, and that is a rule rather than a
  // preference: `tests/one-declaration-decides-what-a-role-may-do.test.ts` refuses any source file
  // but `src/shared/roles.ts` to write a role word in code, so that no second list of the roles can
  // grow anywhere. The word each field takes is named in its description, which points at the
  // declaration; the example is only there to show the shape.
  role_request: roleRequestKind,

  // ------------------------------------------------------------------------ stopping point
  stopping_point: stoppingPointKind,

  // -------------------------------------------------------------------------- context bundle
  //
  // ITS EXAMPLE CARRIES NO `exports` KEY, ON PURPOSE. Filing a bundle is not an export. A caller
  // that copied the example and sent it would otherwise be claiming, at the moment of filing, that
  // something had already left the building — and `exports` is the only evidence Mole Office has of what
  // was handed to an outside agent.
  context_bundle: contextBundleKind,

  // ------------------------------------------------------------------------------ placeholder
  //
  // IT IS NOT WHAT `completenessOf` ALREADY REPORTS. That says a required field is missing, which
  // means nobody got round to it. This says a slot is unresolved ON PURPOSE and here is what that
  // costs. Merging the two would put a judgement in an author's mouth, and no existing
  // incompleteness is ever turned into one of these.
  //
  // IT IS NOT A STATE OF THE THING IT IS ABOUT. A block whose implementation is not chosen keeps
  // the state it has, and `ITEM_STATES` stays at five.
  //
  // IT IS NOT WORK, and that is why it has no `state`, no `consequence` and no `paused`. What is
  // urgent is the WORK of resolving it, and that work is its own record linked with `blocks` —
  // exactly the argument `proposal` above already makes for itself. Copying it here means the
  // attention rule can never select a placeholder and no second ranking exists.
  //
  // IT IS NOT EXAMPLE DATA. Example content is demonstration material that is never in the
  // database at all. A placeholder is a true statement about the state of real work and has to be
  // queryable, which is the whole point of it.
  placeholder: placeholderKind,

  // ------------------------------------------------------------------------------ ran_instead
  //
  // THE NAME IS NOT `fallback`, AND THAT IS A DECISION WITH A REASON. The word "fallback" is
  // already going on a screen in this product meaning "an agent went outside Mole Office for
  // something". Two record-level concepts named Fallback on two screens of one product is the
  // fault this campaign is about. The word Fallback is kept where an agent will read it: the
  // first sentence of `purpose` below names it the Fallback, and GET /api/kinds is where an
  // agent reads a kind's meaning, so the word is greppable and the intent is on the wire.
  //
  // HOW IT DIFFERS FROM A PLACEHOLDER, IN ONE TESTABLE SENTENCE: a placeholder's slot has no
  // canonical answer yet; a ran_instead record's slot HAS one, and something else ran anyway. That
  // decides the field list, the lifecycle and the governance rule.
  ran_instead: ranInsteadKind,

  // ------------------------------------------------------------------------ work domain
  work_domain: workDomainKind,

  /**
   * ONE INTENDED FUTURE FOR ONE THING. Nothing in it has happened.
   *
   * Its states are `plannedStateIds` and never `blockIds`, and that is not a naming preference: a
   * `blockIds` key would put intentions into the one door a composition has, and from there into
   * done-counts, attention ranking and every structural drawing in the product as things that
   * exist. `NAMED_WRONG_KEYS` refuses each key in the other's place, by name.
   */
  trajectory: trajectoryKind,

  /**
   * ONE INTENDED STATE INSIDE ONE TRAJECTORY. Nothing runs it and it has no progress state.
   *
   * Whether it came true is worked out from `realises` and `instead_of` links and is never stored,
   * for the reason a `direction` has no `state` field either: a stored answer to *has this happened*
   * is a second truth beside the links, and the two go out of step.
   */
  planned_state: plannedStateKind,

  // ------------------------------------------------------------------------------ notebook
  notebook: notebookKind,

  // ------------------------------------------------------------------------------- incident
  incident: incidentKind,
  // ------------------------------------------------------------------------------ regulation
  regulation: regulationKind,
  // ------------------------------------------------------------------------------- goal
  goal: goalKind,
  // ------------------------------------------------------------------------------- flow
  flow: flowKind,
  flow_run: flowRunKind,
  host_job: hostJobKind,
  counter: counterKind,
  // ------------------------------------------------------------------------ checklists
  // Anyone may make a checklist and use one, people included.
  // src/shared/checklists.ts holds its states, its rules and its sentences.
  checklist: checklistKind,
  // ------------------------------------------------------------------------ bookings of the host GPU
  // Two decisions govern the `booking` kind. src/shared/bookings.ts holds its
  // lists and numbers, src/server/lib/bookings.ts its rules.
  booking: bookingKind,
  // ------------------------------------------------------------------------ one secretary's duties
  // Item 2 of wave 13s's requirements, the shape approved in round 90. src/server/lib/grant/secretary-duties.ts
  // holds who may write it and what it must hold; src/server/api/secretary-duties.ts holds its doors.
  secretary_duties: secretaryDutiesKind,
  // ------------------------------------------------------------------------ one watch an agent keeps running
  // Item 38 of wave 13s's requirements, on the decision of 29 October 2026. src/shared/watches.ts holds its
  // lists; src/server/lib/participant-fields.ts asks that its holder is somebody the registries hold.
  watch: watchKind,
  // ------------------------------------------------------------------------ one item of a line's backlog
  // Item 38 of wave 13s's requirements, on the decision of 29 October 2026. src/shared/backlog.ts holds its
  // states and the order of a line; GET /api/backlog?line= reads one line's items.
  backlog_item: backlogItemKind,
  // ------------------------------------------------------------------------ a handbook
  // Guidance for whoever starts a flow or takes a role card. src/shared/handbooks.ts holds its lists and its check;
  // src/server/lib/handbooks.ts asks what a write changed and sends it when a flow is started or a card is given.
  handbook: handbookKind,
  // ------------------------------------------------------------------------ one project's own rules
  // The design-first build of wave 13s's requirements. src/shared/project-rules.ts holds the closed lists; the door is
  // /api/office-regulations/projects/current/chapters.
  project_chapter: projectChapterKind,
  design: designKind,
  design_review: designReviewKind,
  design_reminder: designReminderKind,
  // ------------------------------------------------------------------------ the toolset catalogue
  tool_category: toolCategoryKind,
  tool: toolKind,
}

// ============================================================================ the gate contract
//
// A gate is the one part of the write contract that is not a record field, and this is the only
// place the schema document says anything about it.

/**
 * What `GET /api/kinds` publishes about a gate.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A GATE IS PUBLISHED FROM HERE AND CHECKED SOMEWHERE ELSE
 * ---------------------------------------------------------------------------------------
 *
 * A gate says how hard a dependency is. It does not live inside a record's `data`: it rides on a
 * `blocks` link, so it has no FieldSpec, no ShapeSpec, and `validateData` never sees one. The one
 * place that refuses a malformed gate is `checkGate` in server/lib/records/link-gates.ts, and the one place
 * that decides WHICH fault a gate has is `gateFault` in shared/work.ts.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS PUBLISHED HERE BECAUSE IT STOPPED BEING PUBLISHED ANYWHERE AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * Until a pipeline step became a record, the two sentences below were served as the `rules` of a
 * `StepNeed` shape in SHAPE_SPECS, under a comment saying they were published from the declaration
 * that enforces them. Deleting that shape deleted the publication with it and left its imports
 * standing. From that commit until this one, GET /api/kinds said NOTHING WHATEVER about a gate,
 * while `POST /api/links {"gate":{"kind":"hard","upTo":"…"}}` went on coming back 400 — so the
 * only way to learn that rule was to break it.
 *
 * A rule you can find out about only by being refused is the same defect as a rule that is
 * published and not enforced, with the two halves swapped. Both were live on this one rule this
 * month: the shape published the hard-gate rule for months while the link path did not enforce it,
 * and then the link path started enforcing it while nothing published it at all.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING HERE IS RETYPED
 * ---------------------------------------------------------------------------------------
 *
 * The vocabulary is `GATE_KINDS` and the sentences are `GATE_FAULT_RULES`, both from shared/work.ts
 * beside `gateFault`. A third gate kind or a third fault reaches this document the moment it is
 * declared there, and it cannot be declared there without a sentence for this to publish.
 */
export interface GateContract {
  /** The words a gate's `kind` may be. Anything else is refused before the rules are asked. */
  kinds: readonly GateKind[]
  /** Every rule a gate has to keep, in the words the write path refuses with. */
  rules: readonly string[]
  /**
   * One gate of each kind, valid as written, to copy.
   *
   * These are the whole reason a caller can act on the rules rather than only read them: the two
   * rules below are about the PRESENCE of `upTo`, and prose about a key is harder to get right than
   * an object. tests/gate-rule.test.ts puts every one of them through the real write path, so an
   * example this file cannot store cannot be published.
   */
  examples: readonly Gate[]
}

/** The gate contract, built fresh, from the declarations in shared/work.ts and nowhere else. */
export function describeGate(): GateContract {
  return {
    kinds: GATE_KINDS,
    // Ordered by GATE_FAULTS rather than by the object's own key order, so the list a caller reads
    // is stable, and a fault with no sentence beside it does not compile.
    rules: GATE_FAULTS.map((fault) => GATE_FAULT_RULES[fault]),
    examples: [{ kind: 'hard' }, { kind: 'partial', upTo: 'the growth model checked in simulation' }],
  }
}

/**
 * Everything an agent needs to write any record, in one JSON-serialisable object.
 *
 * This is what a schema endpoint should return. The arrays are built fresh on each call, but the
 * specs inside them are the live ones: treat them as read-only, or serialise them before handing
 * them out. Nothing in Mole Office mutates a spec, and nothing should start.
 *
 * `gate` is the one entry that is not about a record's `data`, and it is here for the same reason
 * `humanOnly` is: both are rules about a WRITE that a caller cannot discover from any field. A
 * dependency between two records is a `blocks` link, not a key inside either of them, so a caller
 * that read only `kinds` and `shapes` would find nothing about the one thing that carries a gate.
 */
export function describeKinds(): {
  kinds: KindSpec[]
  shapes: ShapeSpec[]
  humanOnly: readonly string[]
  gate: GateContract
} {
  return {
    kinds: RECORD_KINDS.map((kind) => KIND_SPECS[kind]),
    shapes: Object.values(SHAPE_SPECS),
    humanOnly: HUMAN_ONLY_KINDS,
    gate: describeGate(),
  }
}
