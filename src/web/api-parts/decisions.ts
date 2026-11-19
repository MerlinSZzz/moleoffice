// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13q, the stable office and its tools. The browser's doors to the decisions that govern a record. Wave
// 13y's round 68 moved them here out of the one `api` object in src/web/api.ts; a line adds its new doors to its
// own part, and src/web/api-parts/join.ts joins every part into `api`.
import { request } from '../api.ts'
import type { WhichDecisionsGovern } from '../../server/lib/governs.ts'

export const decisionsDoors = {
  /**
   * WHICH DECISIONS GOVERN A PATH OR A MODULE, FLOW OR PIPELINE, newest first, with the replaced ones
   * marked. A read of the project on screen.
   */
  decisionsGoverning: (asked: { path: string } | { record: string }) =>
    request<WhichDecisionsGovern>(
      `/api/decisions/governing?${'path' in asked ? `path=${encodeURIComponent(asked.path)}` : `record=${encodeURIComponent(asked.record)}`}`,
    ),
}
