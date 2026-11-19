// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `role_request`, an agent asking for a higher rung.
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

export const roleRequestKind: KindSpec = {
    kind: 'role_request',
    purpose:
      'AN AGENT ASKING THE AGENT THAT STARTED IT FOR A HIGHER RUNG, and the answer. An agent is registered as a worker by ' +
      'default and may ask the agent that started it for a higher rung. The request is one ' +
      'record and the answer is written on it, so the ask and what came of it are one thing a reader can follow.',
    whenToRecord:
      'Through POST /api/roles/requests and never by hand. The asker is the caller and the starter is read from ' +
      'the registry, because an agent that could name its own answerer could name one that would say yes. The ' +
      'starter answers with one press — POST /api/roles/requests/<id>/grant or /refuse — and a grant writes the ' +
      'card on the asker\'s agent record. A record filed straight through POST /api/records is refused: it would ' +
      'be a request nobody was asked and an answer nothing enforced.',
    humanOnly: false,
    fields: [
      {
        key: 'asking',
        type: 'string',
        required: true,
        description:
          'THE CARD BEING ASKED FOR, one word from the cards list of src/config/roles.json — the rung ' +
          'above the one this agent holds. A word no card holds is refused at the door, because a rung nothing ' +
          'enforces is not a rung.',
        example: 'worker',
      },
      {
        key: 'holding',
        type: 'string',
        required: false,
        description:
          'THE CARD THE ASKER HELD WHEN IT ASKED, so the request still says what it was asking to move FROM after ' +
          'the answer moved it. Absent where its row named no card, which every refusal reads as the worker card.',
        example: 'worker',
      },
      {
        key: 'asker',
        type: 'ParticipantRef',
        required: true,
        description:
          'WHO IS ASKING. The caller, read from the actor headers and never from the body: an agent naming ' +
          'somebody else would be asking for a rung on their behalf, which nobody agreed to.',
        example: { kind: 'agent', id: 'builder-one' },
      },
      {
        key: 'answersTo',
        type: 'ParticipantRef',
        required: true,
        description:
          'THE AGENT THAT STARTED THE ASKER, which is who answers: whoever starts an agent is responsible for it and ' +
          'is the one it talks to. Read from the registry, never sent.',
        example: { kind: 'agent', id: 'secretary-1' },
      },
      {
        key: 'because',
        type: 'string',
        required: false,
        description:
          'WHY THE ASKER SAYS IT NEEDS THE RUNG, in its own words: for example, the module is large and needs more ' +
          'workers. Absent means it gave no reason, which is a real ' +
          'answer and never filled in.',
        example: 'This module needs more workers than one agent can start.',
      },
      {
        key: 'answer',
        type: 'string',
        required: false,
        description:
          'WHAT THE STARTER SAID: `granted` or `refused`. A new-key grant nobody collected may later read ' +
          '`withdrawn`: the person, or the starter that granted it, withdrew it, and `extra.newKey` says when. ' +
          'A request to the person that nobody answered may also read `withdrawn`: its asker, or the asker\'s ' +
          'registered starter, took it back, and `extra.withdrawn` says when, which agent and as what. ' +
          'Only the role request doors write this field. ' +
          'ABSENT MEANS NOBODY HAS ANSWERED YET, which is what ' +
          'puts the request in front of the starter; it is never filled in with a default, because a request ' +
          'nobody answered and one that was refused are different facts.',
        example: 'granted',
      },
      {
        key: 'answeredAt',
        type: 'date',
        required: false,
        description: 'When they pressed, in local wall clock. Absent while nobody has.',
        example: '2026-09-07 18:20:00',
      },
      {
        key: 'answerSays',
        type: 'string',
        required: false,
        description:
          'THE ANSWERER\'S OWN WORDS, where they wrote any. A refusal with no words is a refusal and not a fault: ' +
          'the press is one press, and this is what it may carry.',
        example: 'Take it: the module needs more than one worker.',
      },
      /*
       * WHO PRESSED IS NOT A FIELD HERE, and its absence is a decision rather than an omission.
       *
       * It is on the revision the press wrote — GET /api/records/<id>/revisions says who made every
       * version — and that is the ledger every other write in this product is attributed by. A copy
       * in `data` would be one fact in two places, and it would usually be `answersTo` written out
       * a second time, which the record validator refuses outright: two ParticipantRef objects in
       * one record may not share an id. The reply to the press names who pressed as well.
       */
      ...commonFields('role_request'),
    ],
    rules: [
      'the asker and the answerer are read from the registry and never from the body. An agent that could name ' +
        'its own answerer could name one that would say yes.',
      'a grant raises the rung within the starter\'s own rung, checked with the same reading registration uses. ' +
        'A starter cannot hand out a card it could not register somebody with.',
      'the answer is written once. A request that has been answered is answered, and a second press is refused ' +
        'with what the first one said.',
    ],
    example: {
      asking: 'worker',
      asker: { kind: 'agent', id: 'builder-one' },
      answersTo: { kind: 'agent', id: 'secretary-1' },
      because: 'This module needs more workers than one agent can start.',
    },
}
