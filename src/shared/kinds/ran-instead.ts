// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `ran_instead`, the canonical method for a step is one thing and
 * the thing that actually ran was another.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `commonFields` AND THE `KindSpec` TYPE FROM ./kind-common.ts, AND
 * `restrictionFields` FROM ./placeholder.ts, WHICH HOLDS THE HELPER THIS KIND AND `placeholder`
 * SHARE. IT IMPORTS NOTHING FROM ../types.ts. NO DECLARATION MOVED WITH THIS KIND.
 */
import { commonFields, type KindSpec } from './kind-common.ts'
import { restrictionFields } from './placeholder.ts'

export const ranInsteadKind: KindSpec = {
    kind: 'ran_instead',
    purpose:
      "This is the owner's Fallback: the canonical method for a step is one thing and the thing that actually ran " +
      'was another. The canonical method is not changed by this record and must not be. A fallback may preserve ' +
      'execution; it does not prove the canonical method works.',
    whenToRecord:
      'When a run could not use the method the step declares and used something else, and work continued on the ' +
      'result. File it before the result is used for anything. It is created THROUGH the block it is about: ' +
      'POST /api/records/<block id>/ran-instead. A bare POST /api/records {"kind":"ran_instead"} is refused, ' +
      'because two facts about one of these live on its block and nowhere else — which canonical method it stands ' +
      'in for, and which record its restriction is declared against.',
    humanOnly: false,
    fields: [
      {
        key: 'ran',
        type: 'string',
        required: true,
        description: 'What actually ran, precisely enough to repeat.',
        example: 'Classical threshold segmentation — OpenCV adaptiveThreshold, block 51, C 7.',
      },
      {
        key: 'because',
        type: 'string',
        required: true,
        description: 'Why the canonical method could not run.',
        example: 'SAM will not load on the bench computer at 8 GB.',
      },
      {
        key: 'since',
        type: 'date',
        required: true,
        description: 'When it started running instead.',
        example: '2026-08-30',
      },
      ...restrictionFields('fallback'),
      ...commonFields('ran_instead'),
    ],
    rules: [
      'there is NO field holding the canonical method, and that is the whole point. The canonical method is ' +
        '`data.method` on the block this is about, and nothing here ever writes it. What that field said at the ' +
        'moment this record was filed is computed from the revision ledger and shown beside what ran.',
      'while a live one of these is about a block, an AGENT may not patch that block\'s `data.method`; a person ' +
        'may. Changing the canonical method is a governance act, not a runtime one. The block\'s reply says so, so ' +
        'an agent learns it before it tries.',
      'if the thing that ran turns out to be better, that is a claim, then a proposal, then criticism, then a ' +
        'decision — four records that already exist, the last of which only a person may write. Nothing rewrites ' +
        '`data.method` because the fallback happened to run.',
      'severity "harmless" requires `allowed_uses` and `disallowed_claims` to be EMPTY, and the other two ' +
        'severities require at least one entry in each.',
      'it is LIFTED the same way a placeholder is resolved: a `resolves` link into it from the record showing the ' +
        'canonical method ran, POST /api/links ' +
        '{"fromId":"<the record showing the canonical method ran>","toId":"<this record>","type":"resolves"}. ' +
        'Same re-validation rows, same rule that nothing becomes valid.',
    ],
    example: {
      ran: 'Classical threshold segmentation — OpenCV adaptiveThreshold, block 51, C 7.',
      because: 'SAM will not load on the bench computer at 8 GB.',
      since: '2026-08-30',
      allowed_uses: ['downstream plumbing'],
      disallowed_claims: ['that SAM segmentation works', 'segmentation quality comparisons'],
      severity: 'limits_claims',
    },
}
