// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13q, the stable office and its tools. The browser's doors to the stable office: health and upgrade
// history, and one host job with its digests. Wave 13y's round 68 moved them here out of the one `api` object in
// src/web/api.ts; a line adds its new doors to its own part, and src/web/api-parts/join.ts joins every part into `api`.
import { request } from '../api.ts'
import type { TheDigestsOfAHostJob } from '@shared/host-jobs.ts'
import type { StableOfficeHistoryPage } from '@shared/stable-bootstrap-notices.ts'
import type { PanelRecord } from '@shared/types.ts'

export const stableDoors = {

  health: () => request<{ ok: true; records: number }>('/api/health'),
  /** One page of original upgrade events. The page limit stays at 25; `before` is the server cursor. */
  upgradeHistory: (before?: string) => {
    const query = new URLSearchParams({ limit: '25' })
    if (before !== undefined) query.set('before', before)
    return request<StableOfficeHistoryPage>(`/api/office/upgrades?${query.toString()}`)
  },
  /** One host job as filed, and the digests the office works out from it (wave 13q round 60). */
  hostJob: (id: string) => request<{ job: PanelRecord; digests: TheDigestsOfAHostJob }>(`/api/host-jobs/${encodeURIComponent(id)}`),
}
