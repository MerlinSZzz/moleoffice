// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `module`, a subsystem being built or characterised.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields and example, and the same place in the kind list.
 *
 * `MODULE_STATES` and `ModuleState` moved with it, because its `state` field is
 * `unionOf(MODULE_STATES)` and a file that imported them from kinds.ts would make the central
 * file and this one load each other. `MODULE_STATES_LEFT_OUT_OF_THE_AGE_CHECK` stays in
 * ./kind-words.ts and takes the type from here.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind and the two names from kinds.ts.
 *
 * THIS FILE IMPORTS `attentionFields`, `commonFields`, `unionOf` AND THE `KindSpec` AND
 * `ShapeSpec` TYPES FROM ./kind-common.ts, `ITEM_STATES` FROM ../types.ts, AND `PLAN_ENDINGS`,
 * `PLAN_QUESTIONS` AND `PLAN_QUESTION_KEYS` FROM ../planning-flow.ts. IT IMPORTS NOTHING FROM
 * THE CENTRAL FILE, so no runtime cycle is made.
 */
import { attentionFields, commonFields, unionOf, type KindSpec, type ShapeSpec } from './kind-common.ts'
import { ITEM_STATES } from '../types.ts'
import { PLAN_ENDINGS, PLAN_QUESTIONS, PLAN_QUESTION_KEYS } from '../planning-flow.ts'

/**
 * Our posture toward a subsystem right now. Four words, coarse on purpose.
 *
 * It is NOT a progress figure and must never become one. How much of a module is done is counted
 * from the items in its `parts`, computed on every read; what might replace it is a `direction` or
 * an `idea`; that somebody has had a thought about it is a `wanna_try`. A lifecycle word that tried
 * to say any of those would be a hand-maintained second copy of something already derived, and the
 * two would disagree the first time an item changed.
 *
 * What each word MEANS — and why `stable` is classified as finished without claiming the subsystem
 * can never change — is written once, in STATE_MEANING in shared/work.ts, beside every other state
 * word in the product.
 */
export const MODULE_STATES = ['active', 'paused', 'stable', 'retired'] as const
export type ModuleState = (typeof MODULE_STATES)[number]

export const moduleKind: KindSpec = {
    kind: 'module',
    purpose: 'A subsystem you are building or characterising — hardware or software — with its own checklist and its own findings.',
    whenToRecord:
      'When work starts on a distinct piece of the system that will have its own progress and its own report. ' +
      'One module per thing you would write a separate report about.',
    humanOnly: false,
    fields: [
      {
        key: 'context',
        type: 'string',
        required: true,
        description:
          'Why this module exists, in a few sentences. Write the reason, not the description: what goes wrong ' +
          'without it. This is the first thing on the module page and the last thing anyone remembers.',
        example:
          'A second camera on the right jaw. The overhead camera loses sight of the hand exactly when the lane ' +
          'moves into the transplant, which is the moment that matters.',
      },
      {
        key: 'state',
        type: unionOf(MODULE_STATES),
        required: false,
        description:
          'Our posture toward this subsystem right now, in one coarse word. active = somebody is working on it. ' +
          'paused = it has been deliberately put down, and the `paused` field carries the reason and what brings ' +
          'it back. stable = the implementation that exists is sufficient for what is being done with it now — ' +
          'which is NOT a claim that it can never change: a stable module that needs work again goes back to ' +
          'active. retired = it is out of use, and the record is kept so that whatever depended on it is still ' +
          'findable. IT DOES NOT SAY HOW MUCH IS DONE: that is counted from the items in `parts` on every read, ' +
          'and a word here that tried to summarise it would be a second copy of a figure nothing keeps in step ' +
          'with the checklist. Leaving it out means nobody has said, which is different from all four.',
        example: 'active',
      },
      {
        key: 'parts',
        type: 'ModulePart[]',
        required: true,
        description:
          'The progress checklist, grouped into named parts. Needed before the module is complete, because the ' +
          'home page refuses to draw a module whose parts it cannot read. Send [] when there is nothing on the ' +
          'checklist yet — an empty checklist is an answer, and it counts as complete. ' +
          'TO CHANGE ONE LINE, DO NOT SEND THIS FIELD: `dataPatch` replaces an array whole, so a one-item edit ' +
          'through it means reading the record and resending the entire checklist. Use ' +
          'PATCH /api/records/<id>/checklist/<itemId> with only that item\'s keys — {"state":"done"} — which ' +
          'writes one change row naming the item rather than a row holding the whole list twice. Send `parts` ' +
          'itself when you are adding, removing or reordering lines, which is what an array-shaped edit really is. ' +
          'AND WHEN YOU DO SEND IT, SEND `ifVersion` BESIDE IT if the array changes a line that is already ' +
          'stored: a `parts` that drops or rewrites a stored line is refused with a 400 naming what it would ' +
          'lose, because a copy read ten minutes ago and a deliberate change look identical from here. Adding, ' +
          'reordering and resending what is already there need no version.',
        example: [{ id: 'mount', name: 'Mount design', items: [{ id: 'mount-1', text: 'Print the clamp mount', state: 'done', hours: 3 }] }],
      },
      {
        key: 'paths',
        type: 'PathRef[]',
        required: false,
        description:
          'Pointers to material that stays in the project directory: the full report, CAD, captures, video. These ' +
          'point OUT of Mole Office at things nothing scans, and they are written absolute. For code inside a ' +
          'repository this project is implemented in, the relationship is a ROW OF ITS OWN and not a field here: ' +
          'POST /api/implementation, read back with GET /api/implementation/record/<id>. There used to be a ' +
          '`claims` field on this kind that said the same thing for one repository. IT IS GONE AND IT IS NOW ' +
          'REFUSED, because one file may serve several records and a field on one record cannot say that.',
        example: [{ id: 'calib', label: 'Calibration output', path: '/srv/mole-office-fixtures/projects/greenhouse/docs/close_up_camera', kind: 'dir' }],
      },
      {
        key: 'summary',
        type: 'string',
        required: false,
        description:
          'One paragraph: what is worth knowing without opening the full report. It is drawn at the top of this ' +
          "module's curated summary panel, on the module page and nowhere else, and the long form of the same job " +
          'goes in summaryBlocks. NOT the same field as the record\'s envelope `summary` (the one beside "title" ' +
          'in a POST body): that is the single line shown wherever the module is referenced — the records list, ' +
          'the home cards, link rows, the header of its own page. Both are stored, both are read, and neither is ' +
          'a copy of the other: the envelope line says what this module is, this paragraph says where it has got to.',
        example: 'Mount is printed and calibrated. The remaining risk is mechanical: the mount may clip the jaws at full close.',
      },
      {
        key: 'summaryBlocks',
        type: 'SummaryBlock[]',
        required: false,
        description:
          'The curated summary in full: prose, charts, equations, tables and pictures, in the order they should be read. ' +
          'THIS IS WHERE A MODULE\'S CHARTS GO. `summary_blocks` and `charts` are not fields, and neither is `blocks` — ' +
          'that is the field a report record keeps its content in, and a dated review belongs on one of those rather ' +
          'than in here. A write that uses any of the three is refused with a 400 that names this key, and nothing is ' +
          'stored — so a chart you were answered 201 for is a chart that is in `summaryBlocks`. ' +
          'WHAT THIS FIELD IS FOR, as against a report: it says where this subsystem stands NOW, and it is rewritten as ' +
          'the subsystem changes. A report is about a day and stays as it was written, so filing one never edits this.',
        example: [
          { id: 'b-1', type: 'text', heading: 'What was measured', text: 'Holding force against commanded setting, on the 60 mm pot.' },
          {
            id: 'b-2',
            type: 'chart',
            spec: {
              kind: 'line',
              x: { label: 'setting' },
              y: { label: 'holding force', unit: 'N' },
              series: [{ id: 's1', name: 'v3 shell', points: [{ x: 12, y: 11.2 }, { x: 18, y: 19.4 }] }],
              annotations: [{ id: 'need', axis: 'y', value: 12, label: '12 N needed' }],
            },
            caption: 'Two prints, three settings each.',
          },
        ],
      },
      {
        key: 'zh',
        type: 'ChapterChinese',
        required: false,
        description:
          'ONLY ON A CHAPTER RECORD (extra.chapter set): the Chinese of the record\'s title, summary and label, which the ' +
          'office regulations page draws in Chinese. Each rule\'s Chinese is on its own text block, as the block\'s ' +
          'zh. A write that changes the title, the summary or the label and leaves this with a from that is not the hash of ' +
          'the new English is refused, and nothing is written.',
        example: { title: '测试随代码一起提交', summary: '每个新测试都要先跑对照，再做变异。', label: '测试与关卡', from: '656eb835c8d14f20' },
      },
      {
        key: 'neutral',
        type: 'NeutralChapter',
        required: false,
        description:
          'ONLY ON A CHAPTER RECORD: the chapter\'s name, title, conclusion and reason in neutral words, in English and ' +
          'Chinese, as a new office gets them in the default regulations. Written once by an agent beside the chapter\'s own ' +
          'words, which it never replaces. Each rule\'s neutral words are on its own text block, as the block\'s neutral. ' +
          'tools/rules-chapters.mjs writes src/config/rules/default-regulations.json from these.',
        example: {
          label: 'Tests and gates',
          title: 'A test ships with the code and is proved by mutation, after a control run',
          conclusion: 'A test is proved by mutation, after a control run. Read this before you add a test.',
          context: 'A test that would pass with its feature deleted is not a test.',
          zh: { label: '测试与关卡', title: '测试随代码一起提交，先跑对照再做变异来证明', conclusion: '测试要先做对照运行，再用变异来证明。', from: '63db6b393f1529d6' },
          from: '0eba37c80285221b',
        },
      },
      {
        key: 'onlyThisOffice',
        type: 'OnlyThisOfficeMark[]',
        required: false,
        description:
          'ONLY ON A CHAPTER RECORD: the rules the person marked as only for this office, one entry each, which the default ' +
          'regulations leave out. Written only by the person\'s own press on the regulations page ' +
          '(POST /api/office-regulations/only-this-office); any other write that would set, change or drop it is refused.',
        example: [{ rule: 'r-3', by: 'the-owner', at: '2026-10-02 21:00:00' }],
      },
      {
        key: 'planner',
        type: 'ParticipantRef',
        required: false,
        description:
          'WHO PLANS THIS MODULE\'S WORK: the agent that writes the plan into the module, draws it as a pipeline and ' +
          'questions it. Only the planner named here may tell the office the plan ' +
          'step is done (POST /api/modules/<id>/plan-step-done) and submit the plan (POST /api/modules/<id>/plan). ' +
          'Absent means nobody has been named, and both doors refuse until somebody is.',
        example: { kind: 'agent', id: 'ooNSJY6rVzuI' },
      },
      {
        key: 'planning',
        type: 'ModulePlanning',
        required: false,
        description:
          'WHERE THE PLAN STANDS IN THE PLANNING FLOW: the pipeline, when the plan step was done, the office\'s message ' +
          'with the four questions, the checklist item, and once submitted when the plan was questioned and the ' +
          'planner\'s answers. WRITTEN ONLY BY THE OFFICE, at the two planning doors and when its checklist item is ' +
          'ticked by hand; any other write that would set, change or drop it is refused. Absent means the plan step ' +
          'has never been said to be done for this module.',
        example: {
          pipeline: 'Pp3pipeline1',
          flowRun: 'Fr3flowrun01',
          planStepDoneAt: '2026-10-10 21:00:00',
          planStepDoneBy: { kind: 'agent', id: 'ooNSJY6rVzuI' },
          prompt: 'Ms3prompt001',
          checklistItem: { checklist: 'Ck3checklist', item: 'i-4' },
        },
      },
      // WHICH LINE OWNS THE MODULE: a field at the end of the module kind, rather than a new link type or the planner.
      {
        key: 'owner',
        type: 'ParticipantRef',
        required: false,
        description:
          'WHICH LINE OWNS THIS MODULE: the agent of the line supervisor whose files these are. The map dictionary ' +
          'reads it to say whose a block is. A module whose files are split between two lines still names one owner. ' +
          'Absent means nobody has recorded the owner, and the map dictionary says so; nothing guesses it from the ' +
          'files or from who last worked here.',
        example: { kind: 'agent', id: 'line-supervisor' },
      },
      ...attentionFields('module'),
      ...commonFields('module'),
    ],
    example: {
      context:
        'A second camera on the right jaw. The overhead camera loses sight of the hand exactly when the lane ' +
        'moves into the transplant, which is the moment that matters.',
      state: 'active',
      parts: [
        {
          id: 'mount',
          name: 'Mount design',
          items: [
            { id: 'mount-1', text: 'Print the clamp mount', state: 'done', hours: 3 },
            { id: 'mount-2', text: 'Check the mount does not clip the jaws at full close', state: 'doing' },
          ],
        },
      ],
      paths: [{ id: 'calib', label: 'Calibration output', path: '/srv/mole-office-fixtures/projects/greenhouse/docs/close_up_camera', kind: 'dir' }],
      summary: 'Mount is printed and calibrated. The remaining risk is mechanical.',
      summaryBlocks: [{ id: 'b-1', type: 'text', heading: 'What was measured', text: 'Position error 0.4 px over 40 test frames.' }],
    },
}

/** The shapes of this kind, moved out of ../kinds.ts with their comments unchanged. */
export const MODULE_SHAPES: Record<string, ShapeSpec> = {
  /**
   * A MODULE'S PLANNING: the flow for planning a big piece of work, as it stands on the module.
   * src/shared/planning-flow.ts holds the words and src/server/lib/planning-flow.ts the one writer.
   */
  ModulePlanning: {
    name: 'ModulePlanning',
    description:
      "WHERE THE MODULE'S PLAN STANDS IN THE PLANNING FLOW: which pipeline the plan was drawn as, when the planner " +
      'said the plan step was done, the message the office sent with the four questions, the checklist item it put, ' +
      'and, once submitted, when the plan was questioned and the planner\'s answers. Written only by POST ' +
      '/api/modules/<id>/plan-step-done, POST /api/modules/<id>/plan and a hand tick of its checklist item.',
    fields: [
      { key: 'pipeline', type: 'string', required: true, description: 'The id of the pipeline the plan was drawn as.', example: 'Pp3pipeline1' },
      { key: 'flowRun', type: 'string', required: true, description: 'The id of the flow run that records this planning.', example: 'Fr3flowrun01' },
      { key: 'planStepDoneAt', type: 'date', required: true, description: 'When the planner said the plan step was done, local wall clock.', example: '2026-10-10 21:00:00' },
      { key: 'planStepDoneBy', type: 'ParticipantRef', required: true, description: 'The planner who said it.', example: { kind: 'agent', id: 'ooNSJY6rVzuI' } },
      { key: 'prompt', type: 'string', required: true, description: 'The id of the message the office sent the planner with the four questions.', example: 'Ms3prompt001' },
      { key: 'checklistItem', type: 'PlanChecklistItem', required: true, description: "The item the office put on the planner's checklist.", example: { checklist: 'Ck3checklist', item: 'i-4' } },
      {
        key: 'revisionsAtPlanStep',
        type: 'PlanRevisions',
        required: false,
        description:
          'The revision the module, the pipeline and each of its blocks were at when the plan step was done, the module ' +
          "at the revision the office's own write of this planning made. Absent on a planning recorded before wave 13j round 51.",
        example: { module: 4, pipeline: 2, blocks: [{ block: 'Bk3block0001', seq: 1 }] },
      },
      {
        key: 'questioned',
        type: 'PlanQuestioned',
        required: false,
        description: 'When the plan was questioned and the planner\'s short answers. ABSENT MEANS THE PLAN HAS NOT BEEN SUBMITTED THROUGH THE DOOR.',
        example: { at: '2026-10-10 21:30:00', by: { kind: 'agent', id: 'ooNSJY6rVzuI' }, answers: { againstHisDecisions: 'No.', alreadyDone: 'Step 2 was done in round 40; it is out.', localFix: 'No.', leastSure: 'Step 4.' } },
      },
      {
        key: 'ended',
        type: 'PlanEnded',
        required: false,
        description: 'How and when this planning ended. Absent means it is still open: the plan step is done and the plan is not submitted yet.',
        example: { at: '2026-10-10 21:30:00', how: 'submitted', by: { kind: 'agent', id: 'ooNSJY6rVzuI' } },
      },
    ],
  },

  PlanQuestioned: {
    name: 'PlanQuestioned',
    description: 'WHEN THE PLANNER QUESTIONED THE PLAN AND SUBMITTED IT, AND THE SHORT ANSWER TO EACH OF THE FOUR QUESTIONS.',
    fields: [
      { key: 'at', type: 'date', required: true, description: 'When the plan was submitted, local wall clock.', example: '2026-10-10 21:30:00' },
      { key: 'by', type: 'ParticipantRef', required: true, description: 'The planner who submitted it.', example: { kind: 'agent', id: 'ooNSJY6rVzuI' } },
      { key: 'answers', type: 'PlanAnswers', required: true, description: 'The planner\'s short answer to each question.', example: { againstHisDecisions: 'No.', alreadyDone: 'No.', localFix: 'No.', leastSure: 'Step 4.' } },
      {
        key: 'revisionsAtSubmit',
        type: 'PlanRevisions',
        required: false,
        description: 'The revision the module, the pipeline and each of its blocks were at when the plan was submitted, read before the submit wrote anything.',
        example: { module: 6, pipeline: 3, blocks: [{ block: 'Bk3block0001', seq: 2 }] },
      },
      {
        key: 'revised',
        type: 'string[]',
        required: false,
        description:
          "The ids of the plan's records whose revision moved between the plan step and the submit, a block added or " +
          'taken away included. EMPTY MEANS NOTHING CHANGED, which the submit door accepts and says. Absent means ' +
          'nobody can say, because the plan step kept no revisions.',
        example: ['Md3module001', 'Bk3block0001'],
      },
    ],
  },

  PlanRevisions: {
    name: 'PlanRevisions',
    description: "WHICH REVISION THE PLAN'S RECORDS WERE AT, AT ONE MOMENT: the module, the pipeline and each block the pipeline held.",
    fields: [
      { key: 'module', type: 'number', required: true, description: "The module's revision number.", example: 4 },
      { key: 'pipeline', type: 'number', required: true, description: "The pipeline's revision number.", example: 2 },
      { key: 'blocks', type: 'PlanBlockRevision[]', required: true, description: 'Each block the pipeline held, in its order, with its revision number.', example: [{ block: 'Bk3block0001', seq: 1 }] },
    ],
  },

  PlanBlockRevision: {
    name: 'PlanBlockRevision',
    description: 'ONE BLOCK OF THE PLAN\'S PIPELINE AND ITS REVISION NUMBER.',
    fields: [
      { key: 'block', type: 'string', required: true, description: "The block record's id.", example: 'Bk3block0001' },
      { key: 'seq', type: 'number', required: true, description: "The block's revision number.", example: 1 },
    ],
  },

  PlanAnswers: {
    name: 'PlanAnswers',
    description: 'THE PLANNER\'S SHORT ANSWER TO EACH OF THE FOUR QUESTIONS THE OFFICE ASKED, in the planner\'s own words.',
    fields: PLAN_QUESTION_KEYS.map((key) => ({
      key,
      type: 'string',
      required: true,
      description: `The answer to: ${PLAN_QUESTIONS[key]}`,
      example: 'No.',
    })),
  },

  PlanEnded: {
    name: 'PlanEnded',
    description: 'HOW A MODULE\'S PLANNING ENDED: submitted through the door, or its checklist item ticked by hand.',
    fields: [
      { key: 'at', type: 'date', required: true, description: 'When it ended, local wall clock.', example: '2026-10-10 21:30:00' },
      { key: 'how', type: unionOf(PLAN_ENDINGS), required: true, description: `How it ended: ${PLAN_ENDINGS.join(' or ')}.`, example: 'submitted' },
      { key: 'by', type: 'ParticipantRef', required: true, description: 'Who submitted the plan or ticked the item.', example: { kind: 'agent', id: 'ooNSJY6rVzuI' } },
    ],
  },

  ProgressItem: {
    name: 'ProgressItem',
    description:
      'One line of a module checklist. It is a nested object and deliberately not a record of its own — see the ' +
      'note above SHAPE_SPECS. One of these on its own is changed by its id, without the array around ' +
      'it: PATCH /api/records/<module id>/checklist/<item id> with only the keys below that are changing.',
    fields: [
      {
        key: 'id',
        type: 'string',
        required: true,
        description:
          'A stable id, unique within the module. This is what the change log compares to answer ' +
          '"how long has this been doing?", so renumbering items loses that history.',
        example: 'mount-3',
      },
      { key: 'text', type: 'string', required: true, description: 'What is to be done, in one line.', example: 'Print the clamp mount' },
      {
        key: 'state',
        type: unionOf(ITEM_STATES),
        required: true,
        description: 'Where this line has got to. `blocked` means something else must move first; `failed` means it was tried and did not work.',
        example: 'done',
      },
      {
        key: 'note',
        type: 'string',
        required: false,
        description: 'Why it failed or what it is waiting on. Kept forever — this is the sentence that stops the same thing being tried twice.',
        example: 'Setting 15 cracked the shell, waiting on a reprint',
      },
      { key: 'hours', type: 'number', required: false, description: 'Hours actually spent, if they were counted.', example: 3 },
      // A checklist item is a candidate for the attention list in its own right — it has its own
      // reason-group, `stopped:item` — and the rule reads a consequence and a pause off the ITEM,
      // not off the module around it. Without these two fields the write path refused the only
      // thing that rule could have read, so a `failed` item that could hurt somebody had no way to
      // say so and could never reach the safety floor. See `attentionFields`.
      ...attentionFields('checklist item'),
    ],
  },

  ModulePart: {
    name: 'ModulePart',
    description: 'A named section of a module checklist, e.g. "Part 1: Mount Design".',
    fields: [
      { key: 'id', type: 'string', required: true, description: 'A stable id, unique within the module.', example: 'mount' },
      { key: 'name', type: 'string', required: true, description: 'The heading this group of items sits under.', example: 'Mount design' },
      {
        key: 'items',
        type: 'ProgressItem[]',
        required: true,
        description: 'The checklist lines in this part, in the order they should be read. Use [] for a part with nothing on it yet.',
        example: [{ id: 'mount-1', text: 'Print the clamp mount', state: 'done', hours: 3 }],
      },
    ],
  },

  // THE CHINESE HALVES OF THE OFFICE REGULATIONS. Read only on a chapter record
  // (a module carrying extra.chapter) and on a regulation record, by src/shared/office-rules.ts, which
  // also holds the record door's check that a half's from is the hash of the English beside it.
  ChapterChinese: {
    name: 'ChapterChinese',
    description:
      'The Chinese of a chapter record\'s title, summary and label, stored beside the English on a chapter record (a module ' +
      'carrying extra.chapter). The English stays the source. A write that changes the title, the summary or the label must set ' +
      'this in the same write, with from naming the new English, or it is refused.',
    fields: [
      { key: 'title', type: 'string', required: true, description: 'The chapter\'s title in Chinese.', example: '测试随代码一起提交' },
      { key: 'summary', type: 'string', required: true, description: 'The chapter\'s summary (its Conclusion) in Chinese.', example: '每个新测试都要先跑对照，再做变异。' },
      {
        key: 'label',
        type: 'string',
        required: false,
        description:
          'The chapter\'s name at reading level 1 in Chinese: the Chinese of data.shortForms.label. The page draws it ' +
          'where the English page draws the label.',
        example: '测试与关卡',
      },
      {
        key: 'from',
        type: 'string',
        required: true,
        description:
          'Which English this was written from: englishHash([title, summary, label]) of the record, 16 hex characters, ' +
          'with the English label read from data.shortForms.label and the empty string where there is none. ' +
          'src/shared/english-hash.ts defines it and says the command that prints it.',
        example: '656eb835c8d14f20',
      },
    ],
  },

  NeutralChapter: {
    name: 'NeutralChapter',
    description: 'A chapter\'s own words in neutral form, as the default regulations give them to a new office.',
    fields: [
      { key: 'label', type: 'string', required: true, description: 'The chapter\'s name, two to five words.', example: 'Tests and gates' },
      { key: 'title', type: 'string', required: true, description: 'The chapter\'s title.', example: 'A test ships with the code and is proved by mutation, after a control run' },
      { key: 'conclusion', type: 'string', required: true, description: 'The chapter\'s conclusion.', example: 'A test is proved by mutation, after a control run.' },
      { key: 'context', type: 'string', required: true, description: 'Why the chapter exists.', example: 'A test that would pass with its feature deleted is not a test.' },
      { key: 'zh', type: 'NeutralChapterChinese', required: true, description: 'The name, title and conclusion in Chinese.', example: { label: '测试与关卡', title: '测试随代码一起提交', conclusion: '测试要先做对照运行，再用变异来证明。', from: '0b9251f72bc4334d' } },
      {
        key: 'from',
        type: 'string',
        required: true,
        description:
          'Which of the owner\'s English this was written from: theEnglishHashOfAChapter of the chapter\'s title, Conclusion and ' +
          'label (src/shared/office-rules.ts). A stale one stops the default regulations, as a rule\'s does.',
        example: '0eba37c80285221b',
      },
    ],
  },

  NeutralChapterChinese: {
    name: 'NeutralChapterChinese',
    description: 'A neutral chapter\'s name, title and conclusion in Chinese.',
    fields: [
      { key: 'label', type: 'string', required: true, description: 'The name in Chinese.', example: '测试与关卡' },
      { key: 'title', type: 'string', required: true, description: 'The title in Chinese.', example: '测试随代码一起提交' },
      { key: 'conclusion', type: 'string', required: true, description: 'The conclusion in Chinese.', example: '测试要先做对照运行，再用变异来证明。' },
      {
        key: 'from',
        type: 'string',
        required: false,
        description:
          'Which English this Chinese was written from: theEnglishHashOfAChapter of the twin\'s own title, conclusion and ' +
          'label, not the chapter\'s (src/shared/office-rules.ts). A write that changes the twin\'s English or its Chinese sets ' +
          'it, and the record door refuses one that does not match. A twin written before its Chinese named its English has ' +
          'none, and the default regulations name it.',
        example: '0b9251f72bc4334d',
      },
    ],
  },

  OnlyThisOfficeMark: {
    name: 'OnlyThisOfficeMark',
    description: 'One rule the person marked as only for this office, so the default regulations leave it out.',
    fields: [
      { key: 'rule', type: 'string', required: true, description: 'The rule\'s block id on this chapter record.', example: 'r-3' },
      { key: 'by', type: 'string', required: true, description: 'Who pressed: the person\'s id.', example: 'the-owner' },
      { key: 'at', type: 'string', required: true, description: 'When, in local wall-clock time.', example: '2026-10-02 21:00:00' },
    ],
  },
}
