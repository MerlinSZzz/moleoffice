// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `sealed_tip`, the immutable content a run submitted for a check.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS ONLY THE `KindSpec` TYPE FROM ./kind-common.ts. Its two fields are typed
 * `Record<string, unknown>`, which is TypeScript's own, and it calls no shared field helper, so
 * nothing else moved with it and kind-common.ts does not change this round.
 */
import type { KindSpec } from './kind-common.ts'

export const sealedTipKind: KindSpec = {
    kind: 'sealed_tip', purpose: 'The immutable content a run submitted for a check.',
    whenToRecord: 'The office writes a new seal when a run finishes.', humanOnly: false,
    fields: [
      { key: 'seal', type: 'Record<string, unknown>', required: true, description: 'Run, attempt, registered area, time, exact Git or record manifest and SHA-256 digest, and the standard kind a git seal declared, when it declared one. A git seal also says in git.forkBaseSays how its fork base was chosen; a seal written before that field existed has none. A seal of a run whose filing commit the office read names in carriedCommits each commit it holds whose change was already on main or in an earlier seal: the commit, the commit it matches, and where, main or the id of that seal; a seal that carries no commit, and a seal of any other run, has none. Written by the office, and no write may change it.', example: {} },
      {
        key: 'starterNotice',
        type: 'Record<string, unknown>',
        required: false,
        description:
          "Whether the office told the run's starter of this seal. `to` names the starter the office " +
          'sent one message to, and that message is linked to this seal. Or `to` is absent and `because` says why no message was ' +
          'sent. Written by the office in the same write as the seal. Absent on a seal written before the office told starters.',
        example: { to: { kind: 'agent', id: 'w-supervisor' } },
      },
    ],
    rules: ['A seal cannot be changed or deleted. A later finish writes another seal.'], example: { seal: {} },
}
