// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13r, the office's settings and gates. The browser's doors to the gate counters. Wave 13y's round 68
// moved them here out of the one `api` object in src/web/api.ts; a line adds its new doors to its own part, and
// src/web/api-parts/join.ts joins every part into `api`.
import { type CounterDetailReply, type CounterPressReply, type CountersAcrossReply, type CountersReply, request } from '../api.ts'
import { WORKSPACE_HEADER } from '../lib/workspace.ts'
import { type ProjectChoice, projectsQuery } from '@shared/across-projects.ts'

export const countersDoors = {
  /**
   * THE COUNTERS OF THE PROJECT ON SCREEN. Criterion CT8 of design/counters/ACCEPTANCE.md.
   *
   * A reading of this through `useProjectAsync` is read again when the project changes, the same way
   * every other list page reads its rows, so the header on every request is the project the reader is
   * looking at.
   */
  listCounters: () => request<CountersReply>('/api/counters'),

  /**
   * THE COUNTERS OF EVERY PROJECT, OR OF ONE CHOSEN ON THE PAGE, each naming its project. The page
   * under All projects reads this; `listCounters` above is the old reading, by the request's header.
   */
  listCountersAcross: (choice: ProjectChoice) =>
    request<CountersAcrossReply>(`/api/counters?${projectsQuery(choice)}`),

  /**
   * ONE COUNTER, ITS ROWS AND ITS CHANGES. `before` asks for the page of rows older than that
   * sequence number, which is what the page's `more` press sends.
   */
  readCounter: (id: string, opts: { before?: number; projects?: ProjectChoice } = {}) => {
    const asked = [
      opts.before === undefined ? '' : `before=${String(opts.before)}`,
      opts.projects === undefined ? '' : projectsQuery(opts.projects),
    ].filter(Boolean)
    return request<CounterDetailReply>(`/api/counters/${encodeURIComponent(id)}` + (asked.length === 0 ? '' : `?${asked.join('&')}`))
  },

  /**
   * PAUSE A COUNTER. The reason is required by the door, and the door's own sentence comes back.
   *
   * There is no browser-side check of who may pause: `assertMayChange` refuses at the write and the
   * page draws the server's own words, so the rule lives in one place.
   */
  pauseCounter: (id: string, because: string, workspaceId?: string) =>
    request<CounterPressReply>(`/api/counters/${encodeURIComponent(id)}/pause`, {
      method: 'POST',
      // IN THE COUNTER'S OWN PROJECT when the caller names it: a counter read across projects may be
      // in a project other than the one in the switcher.
      headers: { 'content-type': 'application/json', ...(workspaceId === undefined ? {} : { [WORKSPACE_HEADER]: workspaceId }) },
      body: JSON.stringify({ because }),
    }),

  /** LET A PAUSED COUNTER FIRE AGAIN, with the same reason and the same one refusal. */
  resumeCounter: (id: string, because: string, workspaceId?: string) =>
    request<CounterPressReply>(`/api/counters/${encodeURIComponent(id)}/resume`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(workspaceId === undefined ? {} : { [WORKSPACE_HEADER]: workspaceId }) },
      body: JSON.stringify({ because }),
    }),
}
