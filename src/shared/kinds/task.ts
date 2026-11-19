// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `task`, something to do that is small enough to finish,
 * and what it waits on.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports from kinds.ts.
 *
 * THIS FILE IMPORTS `ITEM_STATES` FROM ../types.ts, `PACKAGE_SUITS` AND `RETURN_FORMS` FROM
 * ../delegation.ts, AND `attentionFields`, `commonFields`, `effortField`, `passedItOnField`,
 * `unionOf`, `whoseMoveField` AND THE `FieldSpec`, `KindSpec` AND `ShapeSpec` TYPES FROM
 * ./kind-common.ts. `packageFields`, which only this kind uses, moved here with it, so kinds.ts
 * and this file do not load each other. `TASK_SHAPES` holds the task kind's shapes as they move
 * out of ../kinds.ts, with their comments and text unchanged.
 */
import { attentionFields, commonFields, effortField, passedItOnField, unionOf, whoseMoveField, type FieldSpec, type KindSpec, type ShapeSpec } from './kind-common.ts'
import { ITEM_STATES } from '../types.ts'
// The three kinds of outside work a package suits, declared once for the schema and the readings.
import { ALL_PACKAGE_CHECK_JUDGMENTS, PACKAGE_SUITS, PLAN_HINT_CODES, RETURN_FORMS } from '../delegation.ts'

/**
 * THE FOUR FIELDS THAT MAKE A TASK A PACKAGE. Criterion F16 point 1.
 *
 * DECLARED TOGETHER AND ONCE, so that one file declares the whole of a package and no later worker
 * edits the task kind again. `package` is what the packaging door writes; `takenOutside`, `returns`
 * and `completed` are the three things later pieces fill. This piece writes only `package`, and the
 * other three are declared now so the shape of a package does not arrive in pieces that could
 * disagree about it.
 *
 * APPEND-ONLY MEANS WHAT IT SAYS. `takenOutside` and `returns` are oldest first and an entry once
 * written is never changed or removed; `completed` is written once, when somebody confirms. The
 * enforcement of those rules belongs to the doors that fill them, and the sentences here are the
 * contract those doors are held to.
 */
const packageFields: FieldSpec[] = [
  {
    key: 'package',
    type: 'Package',
    required: false,
    description:
      'WHAT THIS TASK BECAME WHEN IT WAS PACKAGED FOR SOMEBODY ELSE: its context bundle, the words for a reader ' +
      'outside the office, which kind of outside work it suits, the acceptance criteria in full and where they ' +
      'were copied from. Written by POST /api/delegation/<this task>/package, which files a `context_bundle`, ' +
      'links it here with an `about` link, and writes this field in one transaction. LEAVE IT OUT and the task is ' +
      'not a package and does not appear in the delegation column. Packaging again REPLACES this field and files a ' +
      'new bundle; the old bundle record stays, so what already left the building is still answerable.',
    example: {
      bundleId: 'jT4UYozpfgVQ',
      forTheOutside:
        'Build the module on its own. Do not touch the office\'s records. Return a zip with the source and a note ' +
        'of what you could not finish.',
      suits: 'own_module',
      moduleIds: ['37jKRBaZWcdR'],
      acceptance: 'The module runs on its own and its tests pass.',
      acceptanceSource: { file: 'design/flows/ACCEPTANCE.md', criterion: 'F16', commit: '2d7f256e' },
      at: '2026-09-14 18:55:00',
      by: { actorType: 'agent', actorId: 'f16-package' },
    },
  },
  {
    key: 'takenOutside',
    type: 'TakenOutside[]',
    required: false,
    description:
      'WHO HAS TAKEN THIS PACKAGE OUT OF THE OFFICE, oldest first. APPEND-ONLY: an entry once written is never ' +
      'changed and never removed, because it is the promise somebody made and a later edit would be a claim about ' +
      'it. Written by the take door (not built in this piece). An empty list and an absent one mean the same ' +
      'thing here — nobody has taken it — and the column draws that as `open`.',
    example: [
      {
        who: 'ChatGPT (my own account)',
        comesBack: 'A zip holding the module and a one-page note.',
        byWhen: '2026-09-18',
        at: '2026-09-14 19:10:00',
        takenBy: { actorType: 'human', actorId: 'owner' },
      },
    ],
  },
  {
    key: 'returns',
    type: 'ReturnedFromOutside[]',
    required: false,
    description:
      'WHAT HAS COME BACK FROM OUTSIDE THE OFFICE, oldest first. APPEND-ONLY: an entry once written is never ' +
      'changed and never removed, and every entry carries words from outside rather than the office\'s own ' +
      'observation. Written by the return door (not built in this piece). An empty list and an absent one both ' +
      'mean nothing has come back.',
    example: [
      {
        at: '2026-09-16 11:02:00',
        broughtBackBy: { actorType: 'human', actorId: 'owner' },
        fromOutside: 'ChatGPT (my own account)',
        form: 'zip',
        words: 'Finished the module. The one test I could not run needs the office\'s key.',
        file: 'data/packages/returns/wrist-camera-module.zip',
        saysItIsFromOutside: true,
      },
    ],
  },
  {
    key: 'completed',
    type: 'PackageCompletion',
    required: false,
    description:
      'WHO CONFIRMED THIS TASK FINISHED, AND WHEN. Written once, by the responsible one or by the person, through ' +
      'the confirm door (not built in this piece). Leave it out while the task is not confirmed: absence means ' +
      'nobody has confirmed it, which is different from a confirmation nobody dated. This is the fact that puts ' +
      'the column\'s state at `confirmed`.',
    example: { by: { actorType: 'agent', actorId: 'secretary-1' }, at: '2026-09-17 09:30:00' },
  },
]

export const taskKind: KindSpec = {
    kind: 'task',
    purpose: 'Something to do that is small enough to finish, and what it is waiting on.',
    whenToRecord:
      'When work is identified that someone has to do and that is not already a step of a pipeline or a line on a ' +
      'module checklist. If it belongs to a module, put it on that module instead — two lists of the same work drift.',
    humanOnly: false,
    fields: [
      {
        key: 'state',
        type: unionOf(ITEM_STATES),
        required: false,
        description: 'Where it has got to. Leaving it out means it has never been given one; nothing infers `todo` for you.',
        example: 'blocked',
      },
      { key: 'command', type: 'string', required: false, description: 'The exact command that does it, when there is one. Copy-pasteable, with no placeholders.', example: 'make run-clamp-60mm-wizard' },
      // THERE IS NO `blocked_by` ON A TASK ANY MORE, and its absence is the point.
      //
      // It was published as "The TITLE of the record blocking it. Link it with a `blocks` link as
      // well, so the graph knows" — one fact asked for twice, in one request, in a product whose
      // house rule is one statement per fact. Which of the two is canonical was a measurement rather
      // than a preference: the `blocks` link is read by the gate rule, the attention rule,
      // `unmetDependencies`, the record page and the graph, and `data.blocked_by` was read by
      // NOTHING — the only hits in the repository were its own declaration and the seed that filled
      // it in.
      //
      // So the typed link is the dependency, and the prose case already had a field: the one below,
      // for what a task waits on that is not a record yet. Nothing was taken away that this kind
      // could not already say. `obligation.blocked_by` STAYS, and that is not an oversight: it is
      // honestly declared as "a record title OR prose", an obligation has no `also_waiting_on` to
      // move prose into, and there is no replacement for it. MOVED_OUT_OF_DATA below refuses the key
      // on a task with the link to write instead, so an agent that learnt the old schema is answered
      // with the route rather than being sent into `extra`.
      { key: 'also_waiting_on', type: 'string', required: false, description: 'Anything else it waits on that is not a record yet, in prose. If it IS a record, the dependency is a `blocks` link from that record to this task — POST /api/links {"fromId":"<the blocker>","toId":"<this task>","type":"blocks","gate":{"kind":"hard"}} — because that is what every reader of a dependency reads.', example: 'a reprinted clamp at setting 12' },
      // WHOSE TASK IT IS, by registry id (item 38 of wave 13s's requirements). `whose_move` says only whether the next
      // step is a person's or an agent's, and a secretary keeping its own tasks could not tell its from another's.
      {
        key: 'holder',
        type: 'ParticipantRef',
        required: false,
        description:
          'WHOSE TASK IT IS: the agent or the person who does it, as a registry reference, kind "agent" or "person" ' +
          'and its registry id, never a handle. GET /api/participants lists every registry id. A write naming ' +
          'somebody no registry row answers to is refused. Absent means nobody wrote whose it is. It is not ' +
          '`whose_move`, which says whether the next step is a person\'s or an agent\'s and names nobody.',
        example: { kind: 'agent', id: 'Ag1e2n3t4i5d' },
      },
      effortField('task'),
      ...packageFields,
      whoseMoveField('task'),
      passedItOnField('task'),
      ...attentionFields('task'),
      ...commonFields('task'),
    ],
    rules: [
      'A task that waits on a condition is paused until it: paused {"since": "<date>", "why": "<words>", "until": {"condition": "<the condition in words>"}}. It is kept off the list of what needs somebody today, and its condition is read back in words, because Mole Office cannot check it.',
      'The record a task belongs to is named by a link from the task to that record: POST /api/links {"fromId": "<this task>", "toId": "<the record>", "type": "part_of"}.',
    ],
    example: {
      state: 'blocked',
      command: 'make run-clamp-60mm-wizard',
      also_waiting_on: 'a reprinted clamp at setting 12',
      whose_move: 'person',
    },
}

/** The shapes of this kind, moved out of ../kinds.ts with their comments unchanged. */
export const TASK_SHAPES: Record<string, ShapeSpec> = {
  // ------------------------------------------------------------------------------- a package
  //
  // FOUR SHAPES FOR ONE PACKAGE, and each one is published rather than opaque. A package is what a
  // task becomes when it is handed to somebody else, and the only part of it written for a reader
  // who cannot reach Mole Office is `forTheOutside`; everything else is the office's own record of
  // what left the building. Criterion F16 point 1.

  Package: {
    name: 'Package',
    description:
      'THE PACKAGE A TASK WAS MADE INTO: the context bundle that produces its text, the words for a reader ' +
      'outside the office, which kind of outside work it suits, the acceptance criteria in full and where they ' +
      'were copied from. Written by POST /api/delegation/<record id>/package; nothing else writes it.',
    fields: [
      {
        key: 'bundleId',
        type: 'string',
        required: true,
        description:
          'The `context_bundle` record that produces this package\'s text. Packaging a task again REPLACES this ' +
          'field and files a new bundle, so the old bundle record stays and what already left the building is ' +
          'still answerable. There is no honest way to leave it out: a package with no bundle is not a package.',
        example: 'jT4UYozpfgVQ',
      },
      {
        key: 'forTheOutside',
        type: 'string',
        required: true,
        description:
          'THE PACKAGER\'S OWN WORDS FOR SOMEBODY OUTSIDE THE OFFICE: what may be changed, what is to be returned ' +
          'and in which form. This is the only part of a package written for a reader who cannot reach Mole ' +
          'Office, and it is used only in the export to an outside chat. Leaving it out is refused, because an ' +
          'outside reader with no instructions cannot know what is theirs to change.',
        example:
          'Build the module on its own. Do not touch the office\'s records. Return a zip holding the source and a ' +
          'short note saying what you could not finish.',
      },
      {
        key: 'suits',
        type: unionOf(PACKAGE_SUITS),
        required: false,
        description:
          'WHICH KIND OF OUTSIDE WORK THIS SUITS, chosen by the packager from the owner\'s own three and never a ' +
          `fourth: ${PACKAGE_SUITS.join(', ')}. It is used to decide which chat or person a package is offered ` +
          'to. A word outside the three is refused with the three named. Nothing infers it from the title or the ' +
          'bundle, so an agent that sends none is told rather than guessed for.',
        example: 'own_module',
      },
      {
        key: 'acceptance',
        type: 'string',
        required: true,
        description:
          'THE ACCEPTANCE CRITERIA IN FULL, as prose, written by the packager. Nothing in this project carries ' +
          'acceptance criteria as records, so this is a COPY; `acceptanceSource` is what makes it answerable as ' +
          'one. Leaving it out is refused: a package a reader cannot be judged against is not ready to leave.',
        example:
          'The module runs on its own with no office connection. A file named what the task names exists and its ' +
          'tests pass. The reader says in one line what it did not finish.',
      },
      {
        key: 'acceptanceSource',
        type: 'PackageAcceptanceSource',
        required: false,
        description:
          'WHERE THE PROSE WAS COPIED FROM: a file under design/, the criterion\'s own name, and the commit it was ' +
          'copied at. All three are required, so a reader can tell a copy from its source the way a bundle export ' +
          'names the version each record held. Saying only where it came from would leave a reader unable to tell ' +
          'whether the source has moved since.',
        example: {
          file: 'design/flows/ACCEPTANCE.md',
          criterion: 'F16',
          commit: '2d7f256e',
        },
      },
      {
        key: 'moduleIds',
        type: 'string[]',
        required: false,
        description:
          'THE RECORD IDS OF THE MODULES THE WORK IS IN, named by the packager. A task is work done ON code, not ' +
          'code, so a task\'s files are never stated on the task: the export takes them from these modules\' own rows ' +
          'in the implementation map, and prints them as the files of the modules this work is in — never as the ' +
          'files this task owns. The packaging door refuses an id that names nothing in this project, and an id of ' +
          'a record that cannot own code, because a relationship to code is about a module, a block or a pipeline. ' +
          'LEAVING IT OUT IS A REAL ANSWER: it means nobody named any module, and nothing infers one from a link or ' +
          'a title. An empty list sent on purpose means the same as leaving it out — naming all of them is a scope ' +
          'nobody has said.',
        example: ['37jKRBaZWcdR'],
      },
      { key: 'parent', type: 'PackageParent', required: false, description: 'The parent record this brief sits under, named by the packager; absent means none was named. Nothing infers it.', example: { kind: 'decision', id: 'decision-id' } },
      { key: 'lines', type: 'string[]', required: false, description: 'The lines this brief is open to, written by the packaging door; absent means none were named. Nothing infers them.', example: [] },
      { key: 'pointIds', type: 'string[]', required: false, description: 'The backlog points carried, in order, written by the packaging door; absent means none were named. Nothing infers them.', example: [] },
      { key: 'materials', type: 'PackageMaterial[]', required: false, description: 'The bundle, parent and points packed by the program; absent means no materials were recorded. Nothing infers them.', example: [] },
      { key: 'takenInside', type: 'InsideTake[]', required: false, description: 'Inside takes, oldest first and append-only, written by the take door; absent means nobody took it. A second take is recorded too, and the newest names the taker. Nothing infers a take.', example: [] },
      { key: 'alignments', type: 'PackageRestatement[]', required: false, description: 'The taker’s restatements and plans, oldest first and append-only, written by the alignment door; absent means none were made. A restatement made while another waits, or after one was aligned, is recorded too, and an answer answers the newest. A plan is the fixed shape {workers, waves, waits} — each worker naming worker, outcome, points, files, difficulty, difficultyWhy, model and modelWhy, with no field for the worker’s own steps — or the older free text, stored and shown as it was. `goOnWhy` keeps the supervisor’s sentence for going on past the office’s hints, and `hints` keeps the hints the align door worked out and stored when it wrote the entry. An entry written before hints were stored has no `hints`, which says they were not stored and never that there were none. Nothing infers any of them.', example: [] },
      { key: 'alignmentAnswers', type: 'PackageAlignmentAnswer[]', required: false, description: 'The parent’s answers to restatements, oldest first and append-only, written by the answer door; absent means none were given. A second answer to one restatement is recorded too, and the newest counts. Nothing infers them.', example: [] },
      { key: 'handedBack', type: 'PackageHandback[]', required: false, description: 'The taker’s per-point hand-backs, oldest first and append-only, written by the hand-back door; absent means none were made. Nothing infers them.', example: [] },
      { key: 'checks', type: 'PackageCheck[]', required: false, description: 'The parent’s answers to hand-backs, oldest first and append-only, written by the check door; absent means none were made. Nothing infers them.', example: [] },
      { key: 'acceptances', type: 'PackageAcceptance[]', required: false, description: 'The maker’s or the person’s answers to the points of hand-backs, oldest first and append-only, written by the accept door; absent means no point was answered. A point is done only when an acceptance accepts it. Nothing infers them, and a landing writes none.', example: [] },
      {
        key: 'at',
        type: 'date',
        required: true,
        description:
          'When the package was made, in local wall clock. It is what puts the newest package first in the ' +
          'delegation column, and it is written by the door and never sent by a caller.',
        example: '2026-09-14 18:55:00',
      },
      {
        key: 'by',
        type: 'BundleExporter',
        required: true,
        description:
          'Who packaged the task, in the attribution every write in this product carries. It is written by the ' +
          'door and never sent by a caller, so the record names the hand rather than trusting a claim.',
        example: { actorType: 'agent', actorId: 'f16-package' },
      },
    ],
  },

  PackageParent: {
    name: 'PackageParent',
    description: 'The parent decision or task named by the packager; nothing infers it.',
    fields: [
      { key: 'kind', type: "'decision' | 'task'", required: true, description: 'The kind of the parent record.', example: 'decision' },
      { key: 'id', type: 'string', required: true, description: 'The id written for this entry; nothing infers it.', example: 'example' },
    ],
  },

  PackageMaterial: {
    name: 'PackageMaterial',
    description: 'The source and contents of material the program packed; nothing infers it.',
    fields: [
      { key: 'kind', type: "'decision' | 'point' | 'bundle' | 'task'", required: true, description: 'The kind of source the program packed.', example: 'point' },
      { key: 'ref', type: 'string', required: true, description: 'The ref written for this entry; nothing infers it.', example: 'example' },
      { key: 'says', type: 'string', required: true, description: 'One sentence saying what the material is.', example: 'example' },
    ],
  },

  InsideTake: {
    name: 'InsideTake',
    description: 'An inside take, appended by the take door; nothing infers who took it.',
    fields: [
      { key: 'by', type: 'BundleExporter', required: true, description: 'Who wrote this entry, recorded by the door.', example: { actorType: 'agent', actorId: 'worker' } },
      { key: 'at', type: 'date', required: true, description: 'When the door wrote this entry.', example: '2026-11-09 12:30:00' },
      { key: 'order', type: 'number', required: false, description: 'The place of this act among every act on the package, from 1, written by the door: one more than the entries the package held. Absent on an entry written before acts were numbered; such an entry is read by the older rule.', example: 4 },
    ],
  },

  PlanHint: {
    name: 'PlanHint',
    description: 'One thing the office pointed out about a supervisor\'s plan when the align door worked out and stored the hints. A hint never refuses the alignment: it is words for the reader, worked out once from the plan and the Casting rows the draw reads.',
    fields: [
      { key: 'code', type: unionOf(PLAN_HINT_CODES), required: true, description: `Which hint this is: ${PLAN_HINT_CODES.join(', ')}. The code selects the word that draws it.`, example: 'strongModelNoReason' },
      { key: 'values', type: 'Record<string, unknown>', required: true, description: 'The words and numbers that hint\'s sentence fills in, as the door worked them out. The sentence is read from PLAN_HINT_WORD_KEYS by the code, and the page fills it from this object.', example: { worker: 'made-up-worker', difficulty: 'hard', model: 'made-up-plan-model', models: 'made-up-row-model' } },
    ],
  },

  PackageRestatement: {
    name: 'PackageRestatement',
    description: 'The taker’s own restatement and plan, appended by the alignment door; nothing infers them.',
    fields: [
      { key: 'by', type: 'BundleExporter', required: true, description: 'Who wrote this entry, recorded by the door.', example: { actorType: 'agent', actorId: 'worker' } },
      { key: 'at', type: 'date', required: true, description: 'When the door wrote this entry.', example: '2026-11-09 12:30:00' },
      { key: 'order', type: 'number', required: false, description: 'The place of this act among every act on the package, from 1, written by the door: one more than the entries the package held. Absent on an entry written before acts were numbered; such an entry is read by the older rule.', example: 4 },
      { key: 'restated', type: 'string', required: true, description: 'The taker’s own words restating the points.', example: 'example' },
      { key: 'plan', type: 'string | Record<string, unknown>', required: true, description: 'The taker’s plan: the fixed shape {workers, waves, waits}, each worker naming worker, outcome, points, files, difficulty, difficultyWhy, model and modelWhy, or the older free text kept as the words it was.', example: { workers: [{ worker: 'worker', outcome: 'The whole outcome', points: ['point'], files: ['src/'], difficulty: 'simple', difficultyWhy: 'One file.', model: 'deepseek-v4.1-flash', modelWhy: 'One file needs no stronger model.' }], waves: 1, waits: [] } },
      { key: 'hints', type: 'PlanHint[]', required: false, description: 'The office’s hints about the plan, worked out once by the align door when it wrote this entry and stored here so the page draws what was said rather than working them out again from rows that may have moved since. Present, possibly empty, on an entry written from the round that stored them. Absent on an earlier entry, which says they were not stored and never that there was no hint.', example: [{ code: 'strongModelNoReason', values: { worker: 'worker', difficulty: 'simple', model: 'claude-opus-4', models: 'deepseek-v4.1-flash' } }] },
      { key: 'goOnWhy', type: 'string', required: false, description: 'The supervisor’s sentence for going on past the office’s hints, when it wrote one; absent when it wrote none.', example: 'One worker covers both files, and the second wave is worth the wait.' },
    ],
  },

  PackageAlignmentAnswer: {
    name: 'PackageAlignmentAnswer',
    description: 'The parent’s answer to a restatement, appended by the answer door; nothing infers it.',
    fields: [
      { key: 'by', type: 'BundleExporter', required: true, description: 'Who wrote this entry, recorded by the door.', example: { actorType: 'agent', actorId: 'worker' } },
      { key: 'at', type: 'date', required: true, description: 'When the door wrote this entry.', example: '2026-11-09 12:30:00' },
      { key: 'order', type: 'number', required: false, description: 'The place of this act among every act on the package, from 1, written by the door: one more than the entries the package held. Absent on an entry written before acts were numbered; such an entry is read by the older rule.', example: 4 },
      { key: 'answer', type: "'aligned' | 'differs'", required: true, description: 'Whether the parent agrees with the restatement.', example: 'aligned' },
      { key: 'words', type: 'string', required: true, description: 'The words written for this entry; nothing infers it.', example: 'example' },
    ],
  },

  PackagePointOutcome: {
    name: 'PackagePointOutcome',
    description: 'The taker’s outcome and words for one point in a hand-back; nothing infers them.',
    fields: [
      { key: 'pointId', type: 'string', required: true, description: 'The backlog point this outcome describes.', example: 'example' },
      { key: 'outcome', type: "'done' | 'part' | 'not'", required: true, description: 'Whether the point is done, partly done, or not done.', example: 'part' },
      { key: 'words', type: 'string', required: true, description: 'The words written for this entry; nothing infers it.', example: 'example' },
    ],
  },

  PackageHandback: {
    name: 'PackageHandback',
    description: 'The taker’s per-point hand-back, appended by the hand-back door; nothing infers it.',
    fields: [
      { key: 'by', type: 'BundleExporter', required: true, description: 'Who wrote this entry, recorded by the door.', example: { actorType: 'agent', actorId: 'worker' } },
      { key: 'at', type: 'date', required: true, description: 'When the door wrote this entry.', example: '2026-11-09 12:30:00' },
      { key: 'order', type: 'number', required: false, description: 'The place of this act among every act on the package, from 1, written by the door: one more than the entries the package held. Absent on an entry written before acts were numbered; such an entry is read by the older rule.', example: 4 },
      { key: 'points', type: 'PackagePointOutcome[]', required: true, description: 'The taker’s outcome and words for each point.', example: [] },
      { key: 'run', type: 'string', required: false, description: 'The run whose own run key wrote this hand-back, recorded by the door from the key and never from a header. Absent when no run key proved a run; an inspector cannot check such a hand-back.', example: 'example' },
    ],
  },

  PackageCheck: {
    name: 'PackageCheck',
    description: 'An answer to a hand-back, appended by the check door: the parent’s, or the judgement of the inspector of the run that handed it back; nothing infers it.',
    fields: [
      { key: 'by', type: 'BundleExporter', required: true, description: 'Who wrote this entry, recorded by the door.', example: { actorType: 'agent', actorId: 'worker' } },
      { key: 'at', type: 'date', required: true, description: 'When the door wrote this entry.', example: '2026-11-09 12:30:00' },
      { key: 'order', type: 'number', required: false, description: 'The place of this act among every act on the package, from 1, written by the door: one more than the entries the package held. Absent on an entry written before acts were numbered; such an entry is read by the older rule.', example: 4 },
      { key: 'answer', type: "'holds' | 'refused'", required: true, description: 'Whether the hand-back is accepted. On an inspector’s check it is holds when every point holds and refused otherwise.', example: 'holds' },
      { key: 'words', type: 'string', required: true, description: 'The words written for this entry. On an inspector’s check they are built from its points.', example: 'example' },
      { key: 'run', type: 'string', required: false, description: 'The run whose hand-back the inspector judged. Present only on an inspector’s check.', example: 'example' },
      { key: 'points', type: 'PackageCheckPoint[]', required: false, description: 'The inspector’s judgement of every point. Present only on an inspector’s check.', example: [] },
    ],
  },

  PackageAcceptance: {
    name: 'PackageAcceptance',
    description: 'The maker’s or the person’s answer to points of the latest hand-back, appended by the accept door; nothing infers it.',
    fields: [
      { key: 'by', type: 'BundleExporter', required: true, description: 'Who answered, recorded by the door: the maker of the package or the person, never the taker.', example: { actorType: 'agent', actorId: 'worker' } },
      { key: 'at', type: 'date', required: true, description: 'When the door wrote this entry.', example: '2026-11-09 12:30:00' },
      { key: 'order', type: 'number', required: true, description: 'The place of this act among every act on the package, from 1, written by the door.', example: 6 },
      { key: 'points', type: 'PackageAcceptedPoint[]', required: true, description: 'The answer to each point named, each point once.', example: [] },
    ],
  },

  PackageAcceptedPoint: {
    name: 'PackageAcceptedPoint',
    description: 'One point of a hand-back as its maker or the person answered it; nothing infers it.',
    fields: [
      { key: 'pointId', type: 'string', required: true, description: 'The backlog point answered, one of the package’s points.', example: 'example' },
      { key: 'answer', type: "'accepted' | 'returned'", required: true, description: 'Accepted marks the point done. Returned sends it back to the taker, and it is not done until a later answer accepts it.', example: 'returned' },
      { key: 'words', type: 'string', required: false, description: 'Why the point was returned, in the answerer’s words. The door refuses a returned point without them.', example: 'example' },
    ],
  },

  PackageCheckPoint: {
    name: 'PackageCheckPoint',
    description: 'One point as the inspector of the run that handed it back judged it; nothing infers it.',
    fields: [
      { key: 'pointId', type: 'string', required: true, description: 'The backlog point judged.', example: 'example' },
      { key: 'judged', type: unionOf(ALL_PACKAGE_CHECK_JUDGMENTS), required: true, description: 'What the inspector found. Part and not are from older checks.', example: 'more_than_asked' },
      { key: 'holds', type: 'boolean', required: true, description: 'Whether the hand-back’s outcome and words hold. Done, off target and more than asked can hold for done; narrower and unfinished can hold for part or not.', example: false },
      { key: 'rulesKept', type: 'boolean', required: false, description: 'Whether the run kept the rules. Absent from older checks.', example: true },
      { key: 'why', type: 'string', required: true, description: 'Why the inspector judged it so.', example: 'example' },
      { key: 'outcome', type: "'done' | 'part' | 'not'", required: true, description: 'The handed-back outcome when it holds, or not when it does not.', example: 'not' },
    ],
  },

  PackageAcceptanceSource: {
    name: 'PackageAcceptanceSource',
    description:
      'WHERE THE PACKAGE\'S ACCEPTANCE PROSE WAS COPIED FROM. All three keys are required: a copy without its ' +
      'source is indistinguishable from something the packager wrote, which is exactly what this prevents.',
    fields: [
      {
        key: 'file',
        type: 'string',
        required: true,
        description:
          'The path under design/ the prose was copied from, such as design/flows/ACCEPTANCE.md. It identifies ' +
          'the file rather than a version of it, which is what `commit` is for.',
        example: 'design/flows/ACCEPTANCE.md',
      },
      {
        key: 'criterion',
        type: 'string',
        required: true,
        description:
          'The criterion\'s own name inside that file, such as F16. It is the name the file itself uses, so a ' +
          'reader can find the words the copy came from.',
        example: 'F16',
      },
      {
        key: 'commit',
        type: 'string',
        required: true,
        description:
          'The commit the prose was copied at. It is what tells a later reader whether the source has moved since, ' +
          'and it is required for the same reason a bundle export names the version each record held.',
        example: '2d7f256e',
      },
    ],
  },

  TakenOutside: {
    name: 'TakenOutside',
    description:
      'ONE PERSON TAKING A PACKAGE OUT OF THE OFFICE. Written once and never changed or removed: the list of these ' +
      'on a task is the path the work took out of the building, so a later edit would be a claim about what ' +
      'somebody promised.',
    fields: [
      {
        key: 'who',
        type: 'string',
        required: true,
        description:
          'Who will do the work: an outside chat by name, or a person. It is a name rather than a participant, ' +
          'because Mole Office does not register a chat window it does not run. Leaving it out is refused, and ' +
          'the outside reader named here is what the column draws beside the task.',
        example: 'ChatGPT (my own account)',
      },
      {
        key: 'comesBack',
        type: 'string',
        required: true,
        description:
          'What will come back and in which form, in the taker\'s own words. It is what the return is judged ' +
          'against, so it says the form and not only the thing: a zip, pictures, or text.',
        example: 'A zip holding the module and a one-page note of what it did not finish.',
      },
      {
        key: 'byWhen',
        type: 'date',
        required: true,
        description:
          'When the work is expected back, in local wall clock. A date and not a condition: somebody outside the ' +
          'office cannot be asked about a record here, so a checkable date is the honest promise.',
        example: '2026-09-18',
      },
      {
        key: 'at',
        type: 'date',
        required: true,
        description:
          'When the take was written down, in local wall clock. It is the moment the promise was made, which is ' +
          'what a person searching for an old take needs.',
        example: '2026-09-14 19:10:00',
      },
      {
        key: 'takenBy',
        type: 'BundleExporter',
        required: true,
        description:
          'Who filled the form in, in the attribution every write in this product carries. The person who takes a ' +
          'package and the person who does the outside work are often different, and this field keeps them apart.',
        example: { actorType: 'human', actorId: 'owner' },
      },
    ],
  },

  ReturnedFromOutside: {
    name: 'ReturnedFromOutside',
    description:
      'ONE THING BROUGHT BACK FROM OUTSIDE THE OFFICE. APPEND-ONLY, oldest first: written once and never changed ' +
      'or removed, because it is somebody else\'s work and an edit would be the office rewriting a stranger.',
    fields: [
      {
        key: 'at',
        type: 'date',
        required: true,
        description: 'When it came back, in local wall clock.',
        example: '2026-09-16 11:02:00',
      },
      {
        key: 'broughtBackBy',
        type: 'BundleExporter',
        required: true,
        description:
          'Who put the return into the office, in the attribution every write carries. It is the person who ' +
          'carried it, which is not the same as who did the work: that is `fromOutside`.',
        example: { actorType: 'human', actorId: 'owner' },
      },
      {
        key: 'fromOutside',
        type: 'string',
        required: true,
        description:
          'The name of the outside chat or person the work was done by. It is what makes the words below ' +
          'attributable to somebody who is not a participant in this office.',
        example: 'ChatGPT (my own account)',
      },
      {
        key: 'form',
        type: unionOf(RETURN_FORMS),
        required: true,
        description:
          'What came back: text, pictures or a zip. It says which of the three keys below to read, and it is ' +
          'required so a return is never a pile of fields with nothing saying what it is.',
        example: 'zip',
      },
      {
        key: 'words',
        type: 'string',
        required: false,
        description:
          'What the outside reader said, in their own words, when text or a note came back. This is somebody ' +
          'else\'s writing and never the office\'s own observation. Leave it out when nothing was written.',
        example: 'Finished the module. The one test I could not run needs the office\'s key.',
      },
      {
        key: 'pictures',
        type: 'string[]',
        required: false,
        description:
          'Paths to the pictures that came back, when the form is pictures. A path and not the bytes: the office ' +
          'stores the picture beside the pictures door and never opens it. Leave it out when none came.',
        example: ['data/packages/returns/wrist-camera-01.png'],
      },
      {
        key: 'file',
        type: 'string',
        required: false,
        description:
          'A path to the zip that came back, when the form is zip. The office stores it and never opens it. Leave ' +
          'it out when the return is not a zip.',
        example: 'data/packages/returns/wrist-camera-module.zip',
      },
      {
        key: 'saysItIsFromOutside',
        type: 'boolean',
        required: true,
        description:
          'ALWAYS TRUE ON A RETURN. It marks these words as somebody outside the office\'s and never as this ' +
          'office\'s own observation, which is the distinction the whole return list exists to keep. A return ' +
          'claiming otherwise is refused rather than stored.',
        example: true,
      },
    ],
  },
}
