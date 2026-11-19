// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `tool_category`, a category of the office's tools.
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
export const toolCategoryKind: KindSpec = {
    kind: 'tool_category',
    purpose:
      'ONE CATEGORY OF THE TOOLSET CATALOGUE: its name is the title, `says` is one sentence on what belongs in it, ' +
      'and `confirmedBy` names the decision that confirmed it. Anyone may ' +
      'propose a category, the secretary collects the proposals, and the owner confirms one. A category with no ' +
      '`confirmedBy` is proposed and not confirmed. Anyone may add a tool to a category that exists.',
    whenToRecord:
      'When the tools you are filing belong to no category that exists. File it with no `confirmedBy`: it is then ' +
      'a proposal for the secretary to collect. It becomes confirmed when the owner decides it, and the decision ' +
      'is the record `confirmedBy` names. GET /api/toolset lists every category with whether it is confirmed.',
    humanOnly: false,
    fields: [
      {
        key: 'says',
        type: 'string',
        required: true,
        description:
          'WHAT BELONGS IN THIS CATEGORY, in one plain sentence, so somebody with a new tool can tell whether it ' +
          'goes here.',
        example: 'Tools the people who develop the office use to build, test and check it.',
      },
      {
        key: 'confirmedBy',
        type: 'string',
        required: false,
        description:
          'THE ID OF THE DECISION THAT CONFIRMED THIS CATEGORY. It must name a live `decision` record in this ' +
          'project whose `decided_by` is "the owner", and anything else is refused. Leave it out while the category is only proposed: absence ' +
          'means nobody has confirmed it yet.',
        example: 'Madeup100008',
      },
      ...commonFields('tool_category'),
    ],
    rules: [
      '`confirmedBy` names a live decision record in this project that the owner made: its `decided_by` is "the owner". A write whose `confirmedBy` names anything else is refused, on the create and on the patch, and the refusal says what it names.',
    ],
    example: {
      says: 'Tools the people who develop the office use to build, test and check it.',
    },
}
