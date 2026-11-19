// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `emergency_push`, one commit pushed straight to main in an
 * emergency and what came of it.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `unionOf` AND THE `KindSpec` TYPE FROM ./kind-common.ts, and the emergency
 * push's states from ../emergency-push.ts and the emergency switch's name from
 * ../stable-emergency.ts. It calls no other shared field helper, so kind-common.ts does not
 * change this round.
 */
import { unionOf, type KindSpec } from './kind-common.ts'
import { EMERGENCY_PUSH_STATES } from '../emergency-push.ts'
import { STABLE_EMERGENCY_GATE } from '../stable-emergency.ts'

// Wave 13u round 82, item 16: an emergency fix pushed straight to main, past the queue, and the account of it.
export const emergencyPushKind: KindSpec = {
    kind: 'emergency_push',
    purpose:
      'ONE COMMIT PUSHED STRAIGHT TO MAIN IN AN EMERGENCY, PAST THE MERGE QUEUE, AND WHAT CAME OF IT. ' +
      'The person, or the agent holding the secretary card, pushes it with the merge tool while the emergency switch is on. ' +
      'The record holds main while the push moves it, so a landing waits for it and it waits for a landing.',
    whenToRecord:
      'Never by hand, and never through POST /api/records: every write to this kind is refused there, the ' +
      "person's included. The merge tool starts one with POST /api/merge-queue/emergency-pushes and ends it with " +
      'POST /api/merge-queue/emergency-pushes/<id>/end: node tools/the-merger.mjs --emergency-push.',
    humanOnly: false,
    fields: [
      { key: 'state', type: unionOf(EMERGENCY_PUSH_STATES), required: true, description: 'pushing while the push holds main; pushed once main is at the commit; stopped when main stayed where it was. Written only by the two doors.', example: 'pushing' },
      { key: 'root', type: 'string', required: true, description: 'The checkout whose main the push moves, resolved on this machine. It is the lane of the merge queue that lands in the same checkout.', example: '/srv/mole-office-fixtures/checkout' },
      { key: 'repository', type: 'string', required: true, description: 'The name of the repository this project registered with that checkout.', example: 'mole-office' },
      { key: 'commit', type: 'string', required: true, description: 'The commit pushed, by its 40-character hash. It comes after main as it was.', example: 'commit sha' },
      { key: 'mainBefore', type: 'string', required: true, description: 'Main in the checkout when the push started, as the office read it.', example: 'commit sha' },
      { key: 'message', type: 'Record<string, unknown>', required: true, description: "{id, seq, contentHash}: the secretary's chat message that told the owner alone which commit goes to main. The emergency release of the same commit names the same message.", example: { id: 'message-id', seq: 1, contentHash: 'sha256 of the revision' } },
      { key: 'switch', type: 'Record<string, unknown>', required: true, description: `The office gate list's row for the emergency switch, ${STABLE_EMERGENCY_GATE}, as the push door judged it: its value, its end time and its latest change.`, example: { value: '1', unreadable: null, chosen: { value: '1', until: '2026-10-25 02:00:00' }, ranOut: null, lastChange: { id: 'change-id', appendOrder: 1, at: '2026-10-25 01:30:00', to: '1', until: '2026-10-25 02:00:00', ranOut: false } } },
      { key: 'by', type: 'Record<string, unknown>', required: true, description: '{kind, id}: who pushed: the person, or the agent holding the secretary card.', example: { kind: 'agent', id: 'agent-id' } },
      { key: 'line', type: 'Record<string, unknown> | null', required: false, description: '{kind, id}: the supervisor of the line whose branch the fix came from, as the push named it. A red follow-up in a file the push changed goes back to it first. Null when the push named none; absent on a push recorded before the push could name one.', example: { kind: 'agent', id: 'agent-id' } },
      { key: 'startedAt', type: 'string', required: true, description: 'When the push door let the push start.', example: '2026-10-25 01:31:00' },
      { key: 'ended', type: 'Record<string, unknown> | null', required: false, description: "{at, mainAfter, says, onward}: when the push ended, main as the office read it then, the merge tool's sentence, and what the onward push to the private GitHub copy and the mirror said ({ok, says}, or null when main did not move). Null while the push is pushing.", example: null },
    ],
    rules: [
      'Only its two doors write an emergency push. Every other create, change, kind change, delete, restore and move is refused, whoever asks.',
      `A push starts only while the emergency switch, ${STABLE_EMERGENCY_GATE}, lets an emergency in, by the rule an emergency release is judged by.`,
      'Main has one writer at a time. A push does not start while a merge entry of the same checkout is landing or another push of it is pushing, and an entry does not start landing while a push of its checkout is pushing.',
      'A push that is pushed or stopped needs `ended`. While it is pushing, `ended` is null and the push is not incomplete.',
      "The follow-up is worked out when the push is read: the first authored whole-suite receipt after it whose commit contains the pushed commit and is on main.",
      'A red follow-up in a file the push changed goes back first to the line the push names; with none named, to whoever pushed when that is an agent, and to whoever holds the secretary card when the person pushed. The office files one open problem about the push and tells them once. A green follow-up, or a red one in no file the push changed, goes where a red whole suite goes.',
    ],
    example: {
      state: 'pushing',
      root: '/srv/mole-office-fixtures/checkout',
      repository: 'mole-office',
      commit: 'commit sha',
      mainBefore: 'commit sha',
      message: { id: 'message-id', seq: 1, contentHash: 'sha256 of the revision' },
      switch: { value: '1', unreadable: null, chosen: { value: '1', until: '2026-10-25 02:00:00' }, ranOut: null, lastChange: { id: 'change-id', appendOrder: 1, at: '2026-10-25 01:30:00', to: '1', until: '2026-10-25 02:00:00', ranOut: false } },
      by: { kind: 'agent', id: 'agent-id' },
      line: { kind: 'agent', id: 'agent-id' },
      startedAt: '2026-10-25 01:31:00',
      ended: null,
    },
}
