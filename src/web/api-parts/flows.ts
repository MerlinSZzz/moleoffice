// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13u, the merge queue. The browser's doors to flows. Wave 13y's round 68 moved them here out of the
// one `api` object in src/web/api.ts; a line adds its new doors to its own part, and src/web/api-parts/join.ts joins
// every part into `api`.
import { type NewFlowBody, json, request } from '../api.ts'
import { FLOW_PAGE_LIMIT, FLOW_REPLACED_SHOW, type FlowListPage, type FlowMayWrite, type FlowRead, type FlowSort, type FlowWriteAnswer } from '@shared/flows.ts'
import type { FlowStageWrite } from '@shared/flow-step-writes.ts'
import { WORKSPACE_HEADER } from '../lib/workspace.ts'
import { projectsQuery } from '@shared/across-projects.ts'

export const flowsDoors = {

  /**
   * A PAGE OF FLOWS, read across every project: the Flows page stands under All projects, so
   * each row names its own project. One request, and the server counts runs for the page's flows only.
   */
  listFlows: (asked: { q: string; sort: FlowSort; offset: number; replaced: boolean }) =>
    request<FlowListPage>(
      `/api/flows?${new URLSearchParams({
        limit: String(FLOW_PAGE_LIMIT),
        offset: String(asked.offset),
        q: asked.q,
        sort: asked.sort,
        ...(asked.replaced ? { replaced: FLOW_REPLACED_SHOW } : {}),
      }).toString()}&${projectsQuery('all')}`,
    ),

  /**
   * ONE FLOW, in whichever project holds it, with its latest runs. `withReasons` asks for each stage's why and sources
   * and the record of changes, which the page asks for only when its fold is opened.
   */
  /** Whether whoever this page acts as may write a flow, answered by the doors' own rule. */
  mayWriteFlows: () => request<FlowMayWrite>('/api/flows/may-i-write'),
  readFlow: (id: string, withReasons = false) =>
    request<FlowRead>(`/api/flows/${encodeURIComponent(id)}?${projectsQuery('all')}${withReasons ? '&secondLevel=show' : ''}`),

  /** A NEW FLOW, filed in the project the body names. No cause is asked: nothing was changed. */
  createFlow: (body: NewFlowBody) =>
    request<FlowWriteAnswer>('/api/flows', { method: 'POST', body: json(body), headers: { 'content-type': 'application/json' } }),

  /**
   * ONE WRITE TO A FLOW'S STAGES, through its own door (wave 13p round 34): add, change, move or remove. The door finds
   * the flow in the header's project only, so the flow's own project is sent as the header, and the write carries the
   * version it was made from.
   */
  writeAFlowStage: (flow: { id: string; project: string }, ifVersion: string, write: FlowStageWrite) => {
    const at = `/api/flows/${encodeURIComponent(flow.id)}/stages`
    const headers = { 'content-type': 'application/json', [WORKSPACE_HEADER]: flow.project }
    switch (write.op) {
      case 'add': {
        const { op: _op, ...said } = write
        return request<FlowWriteAnswer>(at, { method: 'POST', headers, body: json({ ifVersion, ...said }) })
      }
      case 'change': {
        const { op: _op, n, ...said } = write
        return request<FlowWriteAnswer>(`${at}/${String(n)}`, { method: 'PATCH', headers, body: json({ ifVersion, ...said }) })
      }
      case 'move': {
        const { op: _op, n, ...said } = write
        return request<FlowWriteAnswer>(`${at}/${String(n)}/move`, { method: 'POST', headers, body: json({ ifVersion, ...said }) })
      }
      case 'remove': {
        const { op: _op, n, ...said } = write
        return request<FlowWriteAnswer>(`${at}/${String(n)}`, { method: 'DELETE', headers, body: json({ ifVersion, ...said }) })
      }
    }
  },
}
