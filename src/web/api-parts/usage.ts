// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13n, tests, checks and harnesses. The browser's doors to usage reads. Wave 13y's round 68 moved them
// here out of the one `api` object in src/web/api.ts; a line adds its new doors to its own part, and
// src/web/api-parts/join.ts joins every part into `api`.
import { request } from '../api.ts'

export const usageDoors = {

  usageSummary: () => request<unknown>('/api/usage/summary'),
  usageTraces: () => request<unknown>('/api/usage/traces'),
  usageOperations: () => request<unknown>('/api/usage/operations'),
  usageOutsideReads: () => request<unknown>('/api/usage/outside-reads'),
  usagePatterns: () => request<unknown>('/api/usage/patterns'),
  // WHICH OPERATION FOLLOWS WHICH. This read shipped with no browser consumer at all, so the only
  // way to see what agents do next was curl — the sixth wave running to ship a server half a person
  // cannot reach. The band on `#/agent-use` is its door.
  usageSequences: () => request<unknown>('/api/usage/sequences'),

  /**
   * WHICH TOOL THE AGENTS RAN IN, WHERE THEY WERE REFUSED, AND HOW LONG BEFORE THEY WROTE ANYTHING.
   *
   * A call row carries the actor and the session and never the tool, so the server works the tool
   * out by joining on the session record or the agent registry, and says which of the two answered.
   */
  usageAgents: () => request<unknown>('/api/usage/agents'),

  /**
   * ONE PIECE OF WORK, CALL BY CALL. Developer mode only, and the page says so where it draws it:
   * Normal mode never draws a raw request, which is the owner's rule about which projection draws
   * what rather than about which data exists.
   */
  usageTrace: (traceId: string) => request<unknown>(`/api/usage/traces/${encodeURIComponent(traceId)}`),
}
