// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `design_review`, one review of one design revision.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `unionOf` AND THE `KindSpec` TYPE FROM ./kind-common.ts, AND
 * `DESIGN_REVIEW_VERDICTS` FROM ../project-rules.ts. IT IMPORTS NOTHING FROM ../types.ts. NO
 * DECLARATION MOVED WITH THIS KIND.
 */
import { unionOf, type KindSpec } from './kind-common.ts'
import { DESIGN_REVIEW_VERDICTS } from '../project-rules.ts'
export const designReviewKind: KindSpec = {
    kind: 'design_review',
    purpose:
      "ONE REVIEW OF ONE REVISION OF A DESIGN: which design and which of its revisions, the project chapter's revision it " +
      'was read under, the verdict, the words, and who reviewed it, written by the office from the key.',
    whenToRecord:
      'Never through POST /api/records: every write to this kind is refused there, the person\'s included. Write one with ' +
      'POST /api/designs/<id>/reviews.',
    humanOnly: false,
    fields: [
      { key: 'design', type: 'string', required: true, description: 'THE ID OF THE DESIGN REVIEWED.', example: 'De1s2i3g4n5x' },
      { key: 'designRevision', type: 'number', required: true, description: "THE DESIGN'S REVISION REVIEWED, as GET /api/records/<id>/revisions numbers it. A later revision of the design is not reviewed by this.", example: 4 },
      { key: 'rulesRevision', type: 'number', required: false, description: "THE PROJECT CHAPTER'S REVISION THE REVIEW WAS READ UNDER. Absent means the project held no chapter then.", example: 3 },
      { key: 'verdict', type: unionOf(DESIGN_REVIEW_VERDICTS), required: true, description: 'THE VERDICT: "approved", or "changes-asked".', example: 'approved' },
      { key: 'words', type: 'string', required: true, description: 'WHAT THE REVIEWER SAYS, in words.', example: 'Candidate A is the right first pilot. Film every trial.' },
      { key: 'reviewer', type: 'ParticipantRef', required: true, description: 'WHO REVIEWED IT, written by the office from the key and refused from every body.', example: { kind: 'agent', id: 'Se1c2r3e4t5y' } },
    ],
    rules: ['Only its own door writes a design review. Every other create, change, kind change, delete, restore and move is refused, whoever asks.'],
    example: {
      design: 'De1s2i3g4n5x',
      designRevision: 4,
      rulesRevision: 3,
      verdict: 'approved',
      words: 'Candidate A is the right first pilot. Film every trial.',
      reviewer: { kind: 'agent', id: 'Se1c2r3e4t5y' },
    },
}
