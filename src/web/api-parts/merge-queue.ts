// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13u, the merge queue. The browser's doors to the merge queue, its owner, claims, the honour board,
// readiness and the project board. Wave 13y's round 68 moved them here out of the one `api` object in src/web/api.ts; a line adds its new
// doors to its own part, and src/web/api-parts/join.ts joins every part into `api`.
import { type ClaimsOnRecordReply, type ClaimsReply, type OfficeMergeQueueOwnerReply, request } from '../api.ts'
import type { EmergencyPushReading } from '@shared/emergency-push.ts'
import type { MergeQueueReply } from '@shared/merge-queue-page.ts'
import type { ProjectBoard, TheMasterPipeline } from '@shared/project-board.ts'
import type { QueueMeasures } from '@shared/merge-queue-measures.ts'
import type { AReadinessChecklist, ASignerRef } from '../../server/lib/readiness.ts'
import type { HonourBoard } from '../../server/lib/honour.ts'

export const mergeQueueDoors = {

  /**
   * THE READINESS CHECKLISTS. `signer` is `person` or `agent:<id>`. The
   * person's signature goes only through sign-as-the-person, which nobody else may press.
   */
  readinessChecklists: () => request<{ checklists: AReadinessChecklist[] }>('/api/readiness?limit=25'),
  readinessWaitingFor: (signer: string) =>
    request<{ signer: ASignerRef; checklists: AReadinessChecklist[] }>(`/api/readiness/waiting-for?signer=${encodeURIComponent(signer)}`),
  // THE HONOUR BOARD, criteria HB3 and HB5: one page of one standing's runs, and the weekly table. Never more than 25.
  honourBoard: (standing: 'exemplary' | 'noted', offset = 0) =>
    request<HonourBoard & { workspaceId: string }>(`/api/honour-board?standing=${standing}&limit=25&offset=${String(offset)}`),
  readinessChecklist: (id: string) => request<{ checklist: AReadinessChecklist }>(`/api/readiness/${encodeURIComponent(id)}`),
  signAsThePerson: (id: string) =>
    request<{ checklist: AReadinessChecklist; ran: boolean; said?: string }>(`/api/readiness/${encodeURIComponent(id)}/sign-as-the-person`, { method: 'POST' }),
  withdrawASignature: (id: string) =>
    request<{ checklist: AReadinessChecklist }>(`/api/readiness/${encodeURIComponent(id)}/withdraw`, { method: 'POST' }),
  cancelAReadinessChecklist: (id: string) =>
    request<{ checklist: AReadinessChecklist }>(`/api/readiness/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),

  /** Every work claim in this project, and every overlap between two live ones. */
  claims: () => request<ClaimsReply>('/api/claims'),

  /** The live claims naming one record, and any conflict over it. What the record page draws. */
  claimsOnRecord: (recordId: string) =>
    request<ClaimsOnRecordReply>(`/api/claims/on/${encodeURIComponent(recordId)}`),

  /**
   * WHO OWNS THE MERGE QUEUE, as a decision settles it. With no argument it reads; with an
   * agent's id, or null for nobody, it names one and answers the reading as it now stands.
   */
  mergeQueueOwner: (agent?: string | null) =>
    request<OfficeMergeQueueOwnerReply>(
      '/api/office/merge-queue-owner',
      agent === undefined ? {} : { method: 'POST', body: JSON.stringify({ agent }) },
    ),

  /**
   * THE MERGE QUEUE IN THE STATES ASKED, lane by lane, with the speed of the last 24 hours, each lane's newest bus and
   * landing order, and who was moved to the front, in one reply. Each entry holds only the fields
   * the page draws (`shape=page`, wave 13u round 123).
   */
  mergeQueue: (states: readonly string[]) => request<MergeQueueReply>(`/api/merge-queue?state=${encodeURIComponent(states.join(','))}&shape=page`),

  /** ONE EMERGENCY PUSH, as the queue's reply carries each, for its own record page (wave 13u round 88). */
  emergencyPush: (id: string) => request<{ push: EmergencyPushReading; workspaceId: string }>(`/api/merge-queue/emergency-pushes/${encodeURIComponent(id)}`),

  /** THE QUEUE'S MEASURES OF ITS LAST DAYS, one day at a time, for the section on the merge queue page (wave 13u round 91). */
  mergeQueueMeasures: (days: number) => request<QueueMeasures & { workspaceId: string }>(`/api/merge-queue/measures?days=${String(days)}`),
  /** The project board, worked out when asked: wave 13u round 216, package BV. */
  projectBoard: (project: string) => request<ProjectBoard>(`/api/projects/${encodeURIComponent(project)}/board`),
  /** Which pipeline the project marks as its master, read by the pipeline page to open on it (package BV, point BV-5). */
  masterPipeline: (project: string) => request<TheMasterPipeline>(`/api/projects/${encodeURIComponent(project)}/master-pipeline`),

  /**
   * MOVE A MERGE ENTRY TO THE FRONT OF ITS LANE, with the reason in one sentence. The door decides who may, and its
   * refusal comes back as an ApiError in its own words.
   */
  moveToTheFront: (id: string, because: string) =>
    request<{ entry: unknown; says: string }>(`/api/merge-queue/${encodeURIComponent(id)}/first`, { method: 'POST', body: JSON.stringify({ because }) }),

  /**
   * PRESS A MERGE ENTRY TO LAND, when it touches a path that lands only after a press, with the
   * reason in one sentence. The door decides who may, and its refusal comes back as an ApiError in its own words.
   */
  pressToLand: (id: string, because: string) =>
    request<{ entry: unknown; says: string }>(`/api/merge-queue/${encodeURIComponent(id)}/press-to-land`, { method: 'POST', body: JSON.stringify({ because }) }),
}
