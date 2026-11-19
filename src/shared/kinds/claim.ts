// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `claim`, a result that could be wrong and that other work
 * depends on.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind, CLAIM_STATES and ClaimState from kinds.ts.
 *
 * THIS FILE IMPORTS `attentionFields`, `commonFields`, `unionOf` AND THE `KindSpec` TYPE FROM
 * ./kind-common.ts. `CLAIM_STATES` AND `ClaimState` moved here with the kind, because its `state`
 * field is `unionOf(CLAIM_STATES)` and a file that imported them from kinds.ts would make the
 * central file and this one load each other.
 */
import { attentionFields, commonFields, unionOf, type KindSpec } from './kind-common.ts'

/** How much weight a claim can carry. `retracted` is kept, never deleted — see the seed. */
export const CLAIM_STATES = ['proposed', 'measured', 'retracted'] as const
export type ClaimState = (typeof CLAIM_STATES)[number]

export const claimKind: KindSpec = {
    kind: 'claim',
    purpose: 'A result that could be wrong and that other work depends on.',
    whenToRecord:
      'When a number or a finding starts being used to decide things. If work would change on hearing it was wrong, ' +
      'it is a claim — file it and link what consumes it, so being wrong later is a query rather than an archaeology dig.',
    humanOnly: false,
    fields: [
      { key: 'evidence', type: 'string[]', required: false, description: 'What was actually observed, one entry per piece. Quote the output rather than summarising it.', example: ['240 replayed transplants, mean error 33 mm at a 200 ms horizon'] },
      { key: 'method', type: 'string', required: false, description: 'How it was measured, precisely enough for someone else to repeat.', example: 'Replayed the 07-30 captures through the baseline predictor, 20 trials per horizon.' },
      { key: 'measured_on', type: 'string', required: false, description: 'What it was measured on and when — the data, the rig, the date.', example: 'transplant demo replays, 2026-05' },
      {
        key: 'numbers',
        type: 'Record<string, number>',
        required: false,
        description:
          'The measurements the claim rests on, named. Numbers go here rather than as top-level keys so that every ' +
          'claim can be read the same way: {"horizon_ms": 200, "trials": 240}.',
        example: { horizon_ms: 200, baseline_error_mm: 33, trials: 240 },
      },
      { key: 'caveat', type: 'string', required: false, description: 'Why it might be narrower than it sounds. The sentence that stops it being over-quoted.', example: 'All 240 trials are the same two people. It may be a claim about them, not about transplants.' },
      { key: 'what_would_prove_it_wrong', type: 'string', required: false, description: 'The observation that would retract it. A claim with no such observation is an opinion.', example: 'A learned predictor beating 33 mm at 200 ms on people who were not in the training set.' },
      { key: 'confidence', type: 'string', required: false, description: 'How sure, and why — in words, not a number nobody can calibrate.', example: 'high — reproduced three times with different payloads' },
      { key: 'state', type: unionOf(CLAIM_STATES), required: false, description: 'proposed = believed but not measured. measured = there are numbers. retracted = withdrawn, and kept visible so what consumed it shows as broken.', example: 'measured' },
      {
        key: 'retracted_because',
        type: 'string',
        required: false,
        description:
          'Why it was withdrawn. Send `state`: "retracted" in the same write — this field on its own is refused, whether `state` says ' +
          'something else or is left out, because a withdrawal nothing marks as withdrawn still reads as live. The record is never ' +
          'deleted, because what consumed it must still be findable.',
        example: 'a static hold is not the same load case as a transplant pull',
      },
      ...attentionFields('claim'),
      ...commonFields('claim'),
    ],
    rules: [
      'A claim that sets `retracted_because` is withdrawn, so it must also set `state` to "retracted". Leaving `state` out is refused ' +
        'as well as setting it to something else: a withdrawal nothing marks as withdrawn still reads as live everywhere it is consumed.',
    ],
    example: {
      method: 'Replayed the 07-30 transplant captures against the zero-velocity baseline, 20 trials per horizon.',
      measured_on: 'transplant demo replays, 2026-05',
      numbers: { horizon_ms: 200, baseline_error_mm: 33, best_learned_error_mm: 41, trials: 240 },
      caveat: 'All 240 trials are the same two people.',
      state: 'measured',
    },
}
