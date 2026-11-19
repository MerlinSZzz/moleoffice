// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `secretary_duties`, one secretary's duties.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `commonFields` AND THE `KindSpec` TYPE FROM ./kind-common.ts. IT IMPORTS
 * NOTHING FROM ../types.ts. NO DECLARATION MOVED WITH THIS KIND.
 */
import { commonFields, type KindSpec } from './kind-common.ts'
export const secretaryDutiesKind: KindSpec = {
    kind: 'secretary_duties',
    purpose:
      'WHAT ONE SECRETARY DOES IN THIS PROJECT: its area in one line, what it answers for, the lines of work it runs, ' +
      "the person's doors it presses for its area, what it reports to the person, and the person's decisions all of " +
      'this rests on. The secretary card holds the rules every secretary shares, and the notebook holds one ' +
      "secretary's own notes; this holds the share of the work the person gave one secretary. A fresh session reads " +
      'its own in full in GET /api/brief, beside every other secretary\'s area.',
    whenToRecord:
      'When the person divides the work between secretaries, or changes one secretary\'s share. One record for each ' +
      'secretary in a project. The person writes it by their own press. The secretary it names may write it with its ' +
      "own key and a warrant quoting the person's words from a decision it rests on. Write it with PUT " +
      '/api/secretaries/<registry id>/duties; POST and PATCH /api/records meet the same guard.',
    humanOnly: false,
    fields: [
      {
        key: 'secretary',
        type: 'ParticipantRef',
        required: true,
        description:
          'THE SECRETARY THESE DUTIES ARE FOR, as a registry reference: kind "agent" and its registry id, never a ' +
          'handle. It must hold the secretary card when the record is written. One record for each secretary in a project.',
        example: { kind: 'agent', id: 'Ag1e2r3t4y5u' },
      },
      {
        key: 'area',
        type: 'string',
        required: true,
        description:
          'ITS AREA, IN ONE LINE of at most 200 characters. Every other secretary sees this line, so it says what this ' +
          'secretary is the one to ask about.',
        example: 'The map plugin, and later one pass on the API\'s response speed.',
      },
      {
        key: 'responsibleFor',
        type: 'string[]',
        required: false,
        description: 'What it answers for, one short line each.',
        example: ['The map plugin.', "Pressing its own line's entries in the merge queue."],
      },
      {
        key: 'lines',
        type: 'string[]',
        required: false,
        description: 'The lines of work it runs, each a short name. These are free words: nothing in the office registers lines.',
        example: ['13y'],
      },
      {
        key: 'doors',
        type: 'string[]',
        required: false,
        description:
          "The person's doors it presses for its area, each a door the list of what the grant carries names " +
          '(GET /api/office/what-the-grant-carries). These are words and not a gate: only that list lets a door be pressed.',
        example: ['plugins.switch'],
      },
      {
        key: 'reportsToThePerson',
        type: 'string[]',
        required: false,
        description: 'What it reports to the person, and when, one short line each.',
        example: ['A line in the chat when a plugin is turned on or off.'],
      },
      {
        key: 'restsOn',
        type: 'string[]',
        required: true,
        description:
          "THE IDS OF THE PERSON'S DECISIONS THIS VERSION RESTS ON, at least one. Each must be a live decision in this " +
          'project, replaced by none, decided by "the owner", and resting on the person\'s own words.',
        example: ['Dc1e2r3t4y5u'],
      },
      {
        key: 'supervisors',
        type: 'Record<string, unknown>[]',
        required: false,
        description:
          'THE SUPERVISORS THIS SECRETARY ANSWERS FOR, each {"agent": {"kind": "agent", "id": <its registry id>}, ' +
          '"area": one line of at most 200 characters}. The chat draws that area under the supervisor\'s name. Each ' +
          'agent holds the supervisor card, is not retired, is named once here, and is named by no other secretary\'s ' +
          'duties in this project.',
        example: [{ agent: { kind: 'agent', id: 'Sp1e2r3t4y5u' }, area: 'The map plugin\'s tiles.' }],
      },
      ...commonFields('secretary_duties'),
    ],
    rules: [
      'Only the person, by their own press, or the secretary the record names, using its own key and carrying a warrant, writes it. The grant alone, a signed package item and every other agent are refused.',
      'The warrant is bound to secretary.set-duties:<secretary id>: plus JSON of the duties as they will stand, and its words appear in a decision the record rests on or in the person\'s message that decision rests on.',
      'One record for each secretary in a project, and the secretary holds the secretary card.',
      'Each door in doors is one the list of what the grant carries names.',
      'A write of only its short forms, which changes nothing else in data and not its title, summary or kind, is not a change of the duties: it meets the ordinary write rules and not these.',
    ],
    example: {
      secretary: { kind: 'agent', id: 'Ag1e2r3t4y5u' },
      area: 'The map plugin, and later one pass on the API\'s response speed.',
      lines: ['13y'],
      restsOn: ['Dc1e2r3t4y5u'],
    },
}
