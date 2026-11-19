// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `tool`, one tool the office offers.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `commonFields`, `unionOf` AND THE `KindSpec` TYPE FROM ./kind-common.ts, AND
 * `TOOL_AUDIENCES` AND `TOOL_ENTRIES` AND `TOOL_KEPT` AND `TOOL_STATES` AND `THE_TEST_FILES_TOOL`
 * FROM ../toolset.ts. IT IMPORTS NOTHING FROM ../types.ts. NO DECLARATION MOVED WITH THIS KIND.
 */
import { commonFields, unionOf, type KindSpec } from './kind-common.ts'
// THE TOOLSET CATALOGUE'S WORDS. ../toolset.ts is the only place they live, and this kind, the tool-use
// shapes in ./tool-use.ts and the checks in ./cross-checks.ts and ./incompleteness.ts read them rather than
// repeating them.
import { TOOL_AUDIENCES, TOOL_ENTRIES, TOOL_KEPT, TOOL_STATES, THE_TEST_FILES_TOOL } from '../toolset.ts'
export const toolKind: KindSpec = {
    kind: 'tool',
    purpose:
      'ONE ENTRY OF THE TOOLSET CATALOGUE, AND ITS MANUAL PAGE. The title is the tool\'s name. The fields are the ' +
      'ten items of a manual page in the toolset draft, in order: what it does; ' +
      'who it is for; its category; when to use it and when not to; who may use it; how to call it, with an ' +
      'example; what it costs; what it protects; what each use records; and who keeps it, which version, and ' +
      'what it is a copy of. Beside them it says what kind of entry it is, its short name, where its code is ' +
      'kept, and whether it is built yet. GET /api/toolset lists the entries and GET /api/toolset/<slug> gives ' +
      'one manual page.',
    whenToRecord:
      'When a tool is planned, and again when it is built. File a planned tool with `state` "not built yet": the ' +
      'catalogue never makes a planned tool look finished. A user\'s own tool that lives elsewhere, for example ' +
      'in a GitHub repository, is an entry only when somebody files it; nothing is added by default. ' +
      'A use of a tool is not a record: it is one row against the run that used it, ' +
      `written by POST /api/toolset/uses and read by GET /api/toolset/runs/<run id>/uses. Only for ${THE_TEST_FILES_TOOL}, ` +
      'the use door also takes files and tree together and stores one test_file_runs row per file atomically.',
    humanOnly: false,
    fields: [
      {
        key: 'entry',
        type: unionOf(TOOL_ENTRIES),
        required: true,
        description:
          '"tool", "service" or "part of the office". A service is something outside the office that the office ' +
          'calls with its own key, such as OpenRouter or Modal. A "part of the office" entry is a how-to page for ' +
          'one foundation part, such as sending a message, and it names no category.',
        example: 'tool',
      },
      {
        key: 'slug',
        type: 'string',
        required: true,
        description:
          'THE SHORT NAME IN THE MANUAL PAGE\'S ADDRESS, GET /api/toolset/<slug>, and the name a use line gives. ' +
          'Lowercase letters, digits and hyphens. No two live tool records in one project share one, and a ' +
          'write that would make two is refused with the other record named.',
        example: 'data-copy',
      },
      {
        key: 'does',
        type: 'string',
        required: true,
        description: 'ITEM 1: WHAT THE TOOL DOES, in one sentence. The title is its name.',
        example: 'Makes a copy of the office database for a sandbox, with every key taken out, and keeps it compressed.',
      },
      {
        key: 'forWhom',
        type: unionOf(TOOL_AUDIENCES),
        required: true,
        description:
          'ITEM 2: WHO THE TOOL IS FOR. "users" are people who use the office without developing it, "developers" ' +
          'are people who develop the office, and "both" is both. GET /api/toolset?who=users lists the tools for ' +
          'users and for both.',
        example: 'developers',
      },
      {
        key: 'category',
        type: 'string',
        required: false,
        description:
          'ITEM 3: THE ID OF THE CATEGORY THIS TOOL IS IN, a live `tool_category` record in this project; anything ' +
          'else is refused. A "part of the office" entry names no category and is refused one. Every other entry ' +
          'is incomplete until it names one.',
        example: 'Xw2kq9TT0abc',
      },
      {
        key: 'whenToUse',
        type: 'string',
        required: true,
        description: 'ITEM 4, FIRST HALF: WHEN TO USE THE TOOL, in plain words.',
        example: 'When a sandbox needs the office\'s real records.',
      },
      {
        key: 'whenNotToUse',
        type: 'string',
        required: true,
        description: 'ITEM 4, SECOND HALF: WHEN NOT TO USE IT, and what to use instead.',
        example: 'Not for a backup: that is npm run db:backup.',
      },
      {
        key: 'whoMayUse',
        type: 'string',
        required: true,
        description: 'ITEM 5: WHO MAY USE THE TOOL: the owner, the secretary, a supervisor, a worker, or a person using the office.',
        example: 'The secretary.',
      },
      {
        key: 'howToCall',
        type: 'string',
        required: true,
        description: 'ITEM 6, FIRST HALF: HOW TO CALL IT: one command or one door, with what it takes.',
        example: 'node tools/office-copy.mjs make --to <sandbox> --for <run>, then node tools/office-copy.mjs open --in <sandbox> --for <run>',
      },
      {
        key: 'example',
        type: 'string',
        required: true,
        description: 'ITEM 6, SECOND HALF: ONE REAL CALL, written out whole.',
        example: 'node tools/office-copy.mjs make --to w13n --for <the id of the run the copy is for>',
      },
      {
        key: 'costs',
        type: 'string',
        required: true,
        description: 'ITEM 7: WHAT ONE USE COSTS in processor time, time, money or tokens, and its limits.',
        example: 'About 600 MB before compression, and one read of the live file.',
      },
      {
        key: 'protects',
        type: 'string',
        required: true,
        description: 'ITEM 8: WHAT THE TOOL PROTECTS, for example that no key leaves, that the live office is never written, or that nothing is deleted.',
        example: 'No key hash is left in the file. The live database is never written.',
      },
      {
        key: 'eachUseRecords',
        type: 'string',
        required: true,
        description: 'ITEM 9: WHAT EACH USE RECORDS, and where: a log file, a line on the run that used it, or nothing.',
        example: 'A block in <sandbox>/out/office-copy.log, and one line on the calling run\'s record.',
      },
      {
        key: 'keptBy',
        type: 'string',
        required: true,
        description: 'ITEM 10, FIRST PART: WHO KEEPS THE TOOL. For a tool nobody has built yet, say so.',
        example: 'The office\'s builders.',
      },
      {
        key: 'version',
        type: 'string',
        required: true,
        description: 'ITEM 10, SECOND PART: WHICH VERSION IT IS AT. For a tool nobody has built yet, say so.',
        example: 'Wave 13n, version 1.',
      },
      {
        key: 'copyOf',
        type: 'string',
        required: false,
        description:
          'ITEM 10, THIRD PART, ONLY FOR AN ADAPTABLE COPY OF A PART OF THE OFFICE: what it is a copy of, and that ' +
          'changing the copy does not change the office\'s own. Leave it out for every other tool.',
        example: 'The office\'s own timers and triggers. Changing this copy does not change the office\'s own.',
      },
      {
        key: 'kept',
        type: unionOf(TOOL_KEPT),
        required: true,
        description: '"in this repository" or "elsewhere": where the tool\'s code is kept.',
        example: 'in this repository',
      },
      {
        key: 'location',
        type: 'string',
        required: false,
        description:
          'WHERE THE CODE IS: a path relative to the repository\'s root when it is kept in this repository, or an ' +
          'address, such as a GitHub repository, when it is kept elsewhere. Required once the tool is built; a ' +
          'tool not built yet may leave it out, because nobody knows yet where it will be. GET /api/toolset says ' +
          'whether the file named for a built tool kept here exists in the checkout that answers.',
        example: 'tools/office-copy.mjs',
      },
      {
        key: 'state',
        type: unionOf(TOOL_STATES),
        required: true,
        description:
          '"built" when a file or door does what the entry says, and "not built yet" otherwise. A planned tool is ' +
          'never marked built.',
        example: 'built',
      },
      ...commonFields('tool'),
    ],
    rules: [
      '`slug` is lowercase letters, digits and hyphens, and is unique among the live tool records of a project. A duplicate is refused with the other record named.',
      '`category` names a live tool category record in this project, and a write naming anything else is refused. A "part of the office" entry is refused a category.',
      'A tool, and a service, is incomplete until it names a category. A built entry is incomplete until it names its `location`.',
      'When `kept` is "in this repository", `location` is a path inside the repository: not absolute, not climbing out with "..", and not an address.',
    ],
    // A "PART OF THE OFFICE" PAGE, BECAUSE IT NAMES NO CATEGORY. A tool's example would have to name a
    // category id, and no id in an example answers to a live record: the write gate refuses it, and
    // tests/kind-can-change.test.ts files every kind's own example.
    example: {
      entry: 'part of the office',
      slug: 'records',
      does: 'Keeps the project\'s decisions, problems, reports and tasks, the links between them, and every earlier version.',
      forWhom: 'both',
      whenToUse: 'To file what happened, to read what is filed, and to change part of a record.',
      whenNotToUse: 'Not for a use of a tool: that is one row against your run, through POST /api/toolset/uses.',
      whoMayUse: 'Everyone. A decision is the owner\'s own act; an agent files a proposal instead.',
      howToCall: 'POST /api/records to file one, GET /api/records/<id> to read one, PATCH /api/records/<id> with dataPatch to change part of one, and POST /api/links to link two.',
      example: 'POST /api/records {"kind":"problem","title":"The export stops at 3 MB","data":{"symptom":"The tab runs out of memory."}}',
      costs: 'One request each. Nothing is spent outside this machine.',
      protects: 'Every change is kept as a revision with who made it, and a deleted record can be restored.',
      eachUseRecords: 'A change row and a revision on the record, with the actor and the run.',
      keptBy: 'The office\'s builders.',
      version: 'The office as it is served now.',
      kept: 'in this repository',
      location: 'src/server/api/records.ts',
      state: 'built',
    },
}
