// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `annotation`, somebody pointing at something and saying something.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `commonFields` AND THE `KindSpec` TYPE FROM ./kind-common.ts. IT IMPORTS
 * NOTHING FROM ../types.ts. NO DECLARATION MOVED WITH THIS KIND.
 */
import { commonFields, type KindSpec } from './kind-common.ts'

export const annotationKind: KindSpec = {
    kind: 'annotation',
    purpose:
      'Somebody pointed at something and said something about it. That is the whole of it, and whether it is ever ' +
      'sent to anybody is a later and separate question.',
    whenToRecord:
      'When you want to leave a remark ON a particular thing — a passage of a report, a cell of a table, a line of ' +
      'a plan, a whole record. Not a note: a note is free writing about nothing in particular, and this points at ' +
      'something exact. Not a message either: a message is addressed to an agent and exists inside a conversation ' +
      'with one, so it dies with the conversation. This survives navigation, a reload, a review being finished and ' +
      'the agent it was meant for going away. If you wrote it and Mole Office said it was stored, it is still here.',
    humanOnly: false,
    fields: [
      {
        key: 'body',
        type: 'string',
        required: true,
        description:
          'WHAT THE PERSON WROTE, KEPT EXACTLY. Never rewritten, ever, by anything. While the state is "queued" ' +
          'the writer may change it or delete the whole annotation, because nothing has been said to anybody yet. ' +
          'Once it is "sent" this field is IMMUTABLE and a PATCH of it is refused: a correction is a NEW ' +
          'annotation with a `supersedes` link to this one, POST /api/links ' +
          '{"fromId":"<the new annotation>","toId":"<this annotation>","type":"supersedes"}, so both are readable ' +
          "and neither was rewritten behind anybody's back.",
        example: 'This number does not match the one in the run log. Which of the two was measured?',
      },
      {
        key: 'context',
        type: 'Context',
        required: true,
        description:
          'WHAT IT IS ABOUT: the thing, optionally the exact words inside it, optionally the revision it was ' +
          'written against. See the Context shape, and the Target shape under it for the thirteen things that can ' +
          'be pointed at. Required, because an annotation that points at nothing is a note and should be filed as ' +
          'one.',
        example: {
          target: { kind: 'reportBlock', recordId: 'PtnsAZ3meHwk', blockId: 'b-2' },
          span: { quote: '1.9', from: 18, to: 21, field: 'data.blocks[#b-2].rows[1].cells[1]' },
          revision: { seq: 4, contentHash: '9f2c1ab0d3e4' },
        },
      },
      {
        key: 'recipientHint',
        type: 'string',
        required: false,
        description:
          'WHO THEY SEEMED TO MEAN, in their own words. A HINT AND NOT A DECISION: nothing routes anything from ' +
          'this, and an annotation is NEVER refused because of who it might be sent to. Leave it out when nobody ' +
          'said, which is the common case — most remarks are written before anybody has thought about who should ' +
          'read them.',
        example: 'whoever ran the calibration on Tuesday',
      },
      {
        key: 'chosenRecipient',
        type: 'ChosenRecipient',
        required: false,
        description:
          'WHO SOMEBODY CHOSE THIS COMMENT TO GO TO, which is a decision and not a hint. Leave it out when nobody ' +
          'has chosen — that is the ordinary case and it is what a comment holds until a person picks an agent ' +
          'for it. Sending is still a separate act: this says where the comment WOULD go and nothing goes ' +
          'anywhere until somebody presses Send. Set it to null to unchoose. It exists because a choice that ' +
          'lived only in the browser was lost on a reload, with nothing on the screen saying it was not stored.',
        example: { kind: 'new', said: 'a new agent' },
      },
      {
        key: 'interpretation',
        type: 'string',
        required: false,
        description:
          'WHAT MOLE OFFICE MADE OF THE WORDS, in one or two sentences, shown BESIDE the body and never instead of it. ' +
          'It is a claim about somebody else\'s words, so it is always visible and always attributed. Leave it out ' +
          'when nothing has read them — "nobody has organised this yet" is a complete answer and a guessed reading ' +
          'is worse than none.',
        example: 'Reads as a question about which of two numbers was measured, addressed to whoever ran the calibration.',
      },
      ...commonFields('annotation'),
    ],
    rules: [
      'what else this annotation touches is a LINK and never a field: POST /api/links ' +
        '{"fromId":"<this annotation>","toId":"<the other record>","type":"about"}. There is no `relatedRecords` ' +
        'field and there must not be one — a second stored copy of what every reader of "what is this about" ' +
        'already reads would be free to disagree with it.',
      'a correction to a comment that has gone out is a new annotation with a `supersedes` link from the new ' +
        'one to the old one: POST /api/links ' +
        '{"fromId":"<the new annotation>","toId":"<the old annotation>","type":"supersedes"}. `body` and ' +
        '`context` are refused on a PATCH once somebody has been given these ' +
        'words — which means once a message carrying them has been sent. It is NOT read off this record: a ' +
        'field saying "sent" could be wrong in both directions and could be put back, and it was.',
      'the `revision` inside `context` is checked against the revision ledger of the record the target names: a ' +
        'seq that record has no revision for, or a contentHash that does not match that revision, is refused and ' +
        'nothing is stored.',
    ],
    // THE WORKED EXAMPLE POINTS AT A PAGE, AND THAT IS THE ONLY TARGET SAFE TO COPY VERBATIM.
    //
    // Every other kind of target names something — a record, a block inside it, a line of a plan —
    // and the write path checks that the thing is really there, in this project. So an example
    // carrying a made-up record id would be answered 404 by the caller who copied it exactly, which
    // is the failure `pipeline`'s example already made once with four block ids no record held. A
    // page is a route and holds nothing, so this is a complete, valid annotation anywhere.
    //
    // The INTERESTING case — a few words of a block of a report, at the revision they were read at —
    // is the example on the `context` field above, where it is documentation rather than something a
    // caller pastes into a POST.
    example: {
      body: 'The numbers on this page do not match the ones in the run log. Which of the two was measured?',
      context: { target: { kind: 'page', route: '/records' } },
      recipientHint: 'whoever ran the calibration on Tuesday',
    },
}
