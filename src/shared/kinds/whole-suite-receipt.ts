// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `whole_suite_receipt`, the evidence of one build and whole-suite
 * run on one exact development commit.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same order of the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts; the kind's fields and rules are the constants it already
 * imported from src/shared/whole-suite-receipt.ts.
 *
 * THIS FILE IMPORTS ONLY A TYPE FROM ./kind-common.ts. The compiler erases that import, so this
 * folder makes no runtime cycle through the central file.
 */
import type { KindSpec } from './kind-common.ts'
import { WHOLE_SUITE_RECEIPT_EXAMPLE, WHOLE_SUITE_RECEIPT_FIELDS, WHOLE_SUITE_RECEIPT_RULES } from '../whole-suite-receipt.ts'

export const wholeSuiteReceipt: KindSpec = {
  kind: 'whole_suite_receipt',
  purpose: 'Evidence of a build and whole-suite run on one exact development commit on the cloud box.',
  whenToRecord: 'After the periodic cloud-box run, keep only the evidence actually observed. The example below is made up and is never a real observation.',
  humanOnly: false,
  fields: WHOLE_SUITE_RECEIPT_FIELDS,
  rules: WHOLE_SUITE_RECEIPT_RULES,
  example: { ...WHOLE_SUITE_RECEIPT_EXAMPLE },
}
