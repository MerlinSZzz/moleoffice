// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `notice_rules`, one recipient's notice wake rules.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS ONLY A TYPE FROM ./kind-common.ts. The compiler erases that import, so this
 * folder makes no runtime cycle through the central file.
 */
import type { KindSpec } from './kind-common.ts'

export const noticeRules: KindSpec = {
    kind: 'notice_rules', humanOnly: false,
    purpose: 'One recipient’s notice wake rules. Every message remains kept and shown.',
    whenToRecord: 'Only the recipient’s own notice-rules door writes this kind.',
    fields: [
      {key:'recipient',type:'ParticipantRef',required:true,description:'The registered recipient, written by the authenticated door.',example:{kind:'agent',id:'made-up-agent'}},
      {key:'mutedKinds',type:'string[]',required:true,description:'Known notice kinds that do not wake this recipient.',example:[]},
      {key:'batchedKinds',type:'string[]',required:false,description:'Known notice kinds held until the next independent work turn or the office batch time limit. A missing list means none. A kind cannot be both muted and batched.',example:[]},
      {key:'because',type:'string',required:true,description:'Why the recipient changed its rules.',example:'I read these notices in the message centre.'},
    ],
    example: {recipient:{kind:'agent',id:'made-up-agent'},mutedKinds:[],because:'Use the office defaults.'},
}
