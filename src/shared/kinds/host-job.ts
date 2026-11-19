// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `host_job`, a job the host runs for the office.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `commonFields` AND THE `KindSpec` TYPE FROM ./kind-common.ts, AND
 * `HOST_JOB_EXAMPLE` AND `HOST_JOB_FIELDS` AND `HOST_JOB_PURPOSE` AND `HOST_JOB_RULES` AND
 * `HOST_JOB_WHEN` FROM ../host-jobs.ts. IT IMPORTS NOTHING FROM ../types.ts. NO DECLARATION MOVED
 * WITH THIS KIND.
 */
import { commonFields, type KindSpec } from './kind-common.ts'
import { HOST_JOB_EXAMPLE, HOST_JOB_FIELDS, HOST_JOB_PURPOSE, HOST_JOB_RULES, HOST_JOB_WHEN } from '../host-jobs.ts'
export const hostJobKind: KindSpec = {
    kind: 'host_job',
    purpose: HOST_JOB_PURPOSE,
    whenToRecord: HOST_JOB_WHEN,
    humanOnly: false,
    fields: [...HOST_JOB_FIELDS, ...commonFields('host_job')],
    rules: HOST_JOB_RULES,
    example: { ...HOST_JOB_EXAMPLE },
}
