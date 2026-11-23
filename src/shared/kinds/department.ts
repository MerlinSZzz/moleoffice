// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `department`, one department or team of a project. Wave 13s round 281, step 1 of
 * departments and posts.
 *
 * THIS FILE IMPORTS `commonFields` AND THE `KindSpec` TYPE FROM ./kind-common.ts. src/shared/kinds.ts hands it on with
 * `export *`. The guard is src/server/lib/grant/departments.ts, and the reads are src/server/lib/departments.ts.
 */
import { commonFields, type KindSpec } from './kind-common.ts'
export const departmentKind: KindSpec = {
  kind: 'department',
  purpose:
    'ONE DEPARTMENT OF A PROJECT: its names in English and in Chinese, what it does, the codes the board and packages ' +
    'name it by, the department above it, its one supervisor and its state. A department may sit under another, to any ' +
    'depth. One with no live sub-department that is not merged is called a team; that word and its leader, the owner of ' +
    'its supervisor, are worked out when it is read and never stored.',
  whenToRecord:
    'When the person sets up a department or a team, or changes one. The person writes it by their own press. A ' +
    "secretary may write it with its own key and a warrant quoting the person's words from a decision in restsOn. Write " +
    'it with POST /api/departments and PUT /api/departments/<id>; POST and PATCH /api/records meet the same guard.',
  humanOnly: false,
  fields: [
    {
      key: 'codes',
      type: 'string[]',
      required: false,
      description:
        'THE CODES THIS DEPARTMENT IS NAMED BY, such as the code packages and the board name it by. None or more, each written ' +
        'once, of at most 100 characters and on one line. A code is held by at most one department that is not merged.',
      example: ['front-desk'],
    },
    {
      key: 'nameEn',
      type: 'string',
      required: false,
      description: 'Its name in English, in one line. A department has a name in English, in Chinese or both.',
      example: 'The front desk',
    },
    {
      key: 'nameZh',
      type: 'string',
      required: false,
      description: 'Its name in Chinese, in one line. A missing name is shown as not recorded, and never made from the other.',
      example: '前台',
    },
    {
      key: 'doesEn',
      type: 'string',
      required: false,
      description: 'What it does, in English.',
      example: 'It answers visitors and sorts the post.',
    },
    {
      key: 'doesZh',
      type: 'string',
      required: false,
      description: 'What it does, in Chinese.',
      example: '接待来访，分发信件。',
    },
    {
      key: 'parent',
      type: 'string',
      required: false,
      description:
        'THE ID OF THE DEPARTMENT ABOVE IT, in this project, or left out for a top department. Not the department ' +
        'itself, not one of its sub-departments at any depth, and not a merged department.',
      example: 'Dp1e2r3t4y5u',
    },
    {
      key: 'supervisor',
      type: 'ParticipantRef',
      required: false,
      description:
        'ITS ONE SUPERVISOR, as {"kind": "agent", "id": <registry id>}: an agent holding the supervisor card, not retired. ' +
        'One agent supervises at most one department in a project that is not merged. Its leader is read from the ' +
        "supervisor's recorded owner.",
      example: { kind: 'agent', id: 'Sp1e2r3t4y5u' },
    },
    {
      key: 'state',
      type: "'running' | 'resting' | 'merged'",
      required: true,
      description: 'Running, resting, or merged into another department, which mergedInto names.',
      example: 'running',
    },
    {
      key: 'mergedInto',
      type: 'string',
      required: false,
      description:
        'THE ID OF THE DEPARTMENT IT WAS MERGED INTO, in this project, written only when state is merged. Not the ' +
        'department itself and not one of its sub-departments. A code it holds then names that department.',
      example: 'Dp9e8r7t6y5u',
    },
    {
      key: 'restsOn',
      type: 'string[]',
      required: false,
      description:
        "THE IDS OF THE PERSON'S DECISIONS IT RESTS ON. Required when a secretary writes it; the person's own press may " +
        'leave it out. Each is a live decision in this project, replaced by none, decided by "the owner", on the ' +
        "person's own words.",
      example: ['Dc1e2r3t4y5u'],
    },
    ...commonFields('department'),
  ],
  rules: [
    'Only the person, by their own press, or a secretary using its own key and carrying a warrant, writes it. The grant alone, a signed package item and every other agent are refused.',
    "The warrant is bound to department.write:<id, or new on a create>: plus JSON of the department as it will stand, and its words appear in a decision in restsOn or in the person's message that decision cites.",
    'A code is held by at most one department that is not merged, and one agent supervises at most one, in a project.',
    'Its level word and its leader are worked out when it is read, and never stored.',
    'A write of only its short forms, which changes nothing else in data and not its title, summary or kind, is not a change of the department: it meets the ordinary write rules and not these.',
  ],
  example: {
    codes: ['front-desk'],
    nameEn: 'The front desk',
    nameZh: '前台',
    state: 'running',
  },
}
