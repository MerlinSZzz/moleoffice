// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13y, pages and speed. The browser's doors to presence, sessions, who is working, the runtime, search,
// attention and the office's load. Wave 13y's round 68 moved them here out of the one `api` object in
// src/web/api.ts; a line adds its new doors to its own part, and src/web/api-parts/join.ts joins every part into `api`.
import { type AttentionHome, type AttentionOfOtherProjects, type PresenceOnTheWire, json, request } from '../api.ts'
import type { OfficeLoad } from '@shared/office-load.ts'
import type { AttentionPart, AttentionPartPage } from '@shared/attention-first-page.ts'
import type { ParticipantKind } from '@shared/participants.ts'
import { participantKey } from '@shared/messages.ts'
import type { RuntimeRecord } from '@shared/runtime.ts'
import type { HomeRoster, WhoIsWorking } from '../../server/lib/working.ts'
import type { SearchReply } from '../../server/api/search.ts'
import type { AttentionFlowReply, AttentionFullReply } from '../../server/lib/attention-shapes.ts'
import type { MachineSweepReport } from '../../server/api/queries.ts'
import type { DiscoverReply, SessionDetailReply } from '../../server/api/sessions.ts'
import type { SessionTimeline } from '../../server/lib/sessions.ts'
import { WORKSPACE_HEADER } from '../lib/workspace.ts'
import { PROJECTS_QUERY, type ProjectChoice } from '@shared/across-projects.ts'
import type { PanelRecord, RecordKind } from '@shared/types.ts'

/** A search's reply asked at level 2, where every result carries its title. */
export type SearchReplyWithTitles = Omit<SearchReply, 'results'> & { results: (SearchReply['results'][number] & { record: { title: string } })[] }

type AttentionOptions = { machine?: 'include' | 'omit'; workspaceId?: string }
function readAttention(opts: AttentionOptions & { shape: 'flow' }): Promise<AttentionFlowReply>
function readAttention(opts?: AttentionOptions & { shape?: undefined }): Promise<AttentionFullReply & { machineSweep: MachineSweepReport }>
function readAttention(opts: AttentionOptions & { shape?: 'flow' } = {}): Promise<AttentionFlowReply | (AttentionFullReply & { machineSweep: MachineSweepReport })> {
  const query: string[] = []
  if (opts.machine !== undefined) query.push(`machine=${opts.machine}`)
  query.push(`shape=${opts.shape ?? 'full'}`)
  return request(`/api/attention?${query.join('&')}`, opts.workspaceId === undefined ? undefined : { headers: { [WORKSPACE_HEADER]: opts.workspaceId } })
}

export const presenceDoors = {
  /** The office's own read time, CPU and memory, and the ranges they are held against. */
  officeLoad: () => request<OfficeLoad>('/api/office/load'),

  /**
   * WHICH RECORDS SAY THIS, asked of the server rather than of what a page happens to hold.
   *
   * ONE PROJECT: the project in the switcher, because that is the header this request carries. The
   * reply's `elsewhere` block says how many records in the OTHER projects match, as counts and never
   * as results, so a reader who searched the wrong project is told where to look.
   *
   * IT READS THE BODY OF A RECORD AND NOT ONLY ITS TITLE, which is why it is a request rather than a
   * filter over rows a page already has. Measured on the live corpus: of the 20 records that mention
   * "clamp", 9 have it in a title or summary; of the 100 that mention "workspace", 13 do. The rule
   * is `src/shared/search.ts` and there is no second one here — two searches with different meanings,
   * one of them called "search" on a screen, is the drift this repository keeps finding.
   *
   * A PICKER LOOKING FOR WORK TO POINT A PLAN LINE AT SHOULD NOT USE THIS. A plan spans projects, so
   * a line may point at work in any of them, and this searches one. Use `api.work()`, which answers
   * about every project, and narrow its rows on the words in the browser. This call is still the
   * right one for finding anything else — a note, a finding, a record that is not work.
   */
  search: (q: string, kind?: RecordKind, limit?: number, projects?: ProjectChoice) => {
    // AT LEVEL 2, THE TITLE (src/shared/results-at-a-level.ts): every page that searches draws a result by its id, title,
    // kind and project, and reads nothing else of it. At level 2 every result carries its title, past the cap as well.
    const params = new URLSearchParams({ q, level: '2' })
    if (kind !== undefined) params.set('kind', kind)
    if (limit !== undefined) params.set('limit', String(limit))
    if (projects !== undefined) params.set(PROJECTS_QUERY, projects)
    return request<SearchReplyWithTitles>(`/api/search?${params.toString()}`)
  },

  /**
   * ONE PAGE OF ONE LIST BEHIND A FOLD ON HOME, from the place `from` in the list. Asked when a reader
   * opens the fold and when they ask for the next page, and never on load.
   */
  attentionPart: <P extends AttentionPart>(part: P, from: number) =>
    request<AttentionPartPage<P>>(`/api/attention?machine=omit&shape=part&part=${part}&from=${String(from)}`),

  /**
   * Home's first page of the answer: see `AttentionHome`.
   *
   * `workspaceId` NAMES THE PROJECT THE ASK WAS MADE FOR, when the ask had to wait its turn
   * (src/web/lib/oneask.ts): a delayed read must read the project it was asked about, not the one
   * on screen when it finally starts. Left out, the request names the project on screen.
   */
  attentionHome: (workspaceId?: string) =>
    request<AttentionHome>('/api/attention?machine=omit&shape=home', workspaceId === undefined ? undefined : { headers: { [WORKSPACE_HEADER]: workspaceId } }),

  /**
   * Home's first page for every project on the list but the one on screen, in one request. Home's Late or
   * stuck and the Projects page's cards read it; the frame reads the project on screen.
   */
  attentionOfOtherProjects: () => request<AttentionOfOtherProjects>('/api/attention?machine=omit&shape=other-projects'),

  /**
   * What needs a person today. Full lists carry their totals and continuation links.
   *
   * THE BROWSER DOES NOT WORK THIS OUT. It used to: src/web/lib/attention.ts held six hard-coded
   * conditions, a fixed tier order and a cap of seven, and the corpus held exactly seven crashed
   * sessions — so the panel was seven crashed sessions at every setting of every input, and an
   * obligation six days past its date sat at row fourteen where no amount of redrawing could reach
   * it. The rule now lives in src/shared/attention.ts and the server serves its answer. A second
   * implementation of "what needs me today" is the one piece of duplication in this product that
   * would be actively dangerous.
   *
   * `machine` is spelled out on purpose and has no default here. Asking for `'include'` sweeps this
   * machine for processes no session claims, which costs a read of /proc and a question to the GPU;
   * leaving it out does not sweep. Either way `machineSweep.swept` says which happened, so an empty
   * `machine` list is never read as a clean machine when nobody looked.
   *
   * Home does not use this call: it reads its first page through `attentionHome` above.
   *
   * WITH NO SHAPE IT ASKS `shape=full`, because the door's own default is the narrow answer and this call's reply is the
   * paged full reply.
   */
  attention: readAttention,

  /**
   * WHO IS WORKING ON WHAT, right now, in this project.
   *
   * One request for the whole page. The alternative — the roster, then a presence call and a
   * work-state call per agent — would be three requests per row and three clocks per row, and two
   * rows could then be drawn from readings taken seconds apart. The server takes one clock and
   * every row on the page is measured from it.
   *
   * IT ASKS FOR NOTHING TO BE STARTED. There is no wake, no attach and no probe behind this call:
   * it is a read of rows that already exist.
   */
  whoIsWorking: (opts: { workspaceId?: string } = {}) =>
    request<WhoIsWorking>(
      '/api/working',
      opts.workspaceId === undefined ? undefined : { headers: { [WORKSPACE_HEADER]: opts.workspaceId } },
    ),

  /**
   * WHO IS ACTIVE IN ONE PROJECT, AS HOME'S AGENTS AT WORK DRAWS IT: the name, who started it and the
   * dot, and nothing else. The same roster as `whoIsWorking` above, read from the same rows;
   * `theRosterHomeDraws` on the server has the measurement that made it. Each row names the run serving
   * the agent (`doingFrom`), so Home asks no other read for it. It does NOT carry what that run says it is
   * doing, which Home does not draw.
   */
  homeRoster: (opts: { workspaceId: string }) =>
    request<HomeRoster>('/api/working?shape=home', { headers: { [WORKSPACE_HEADER]: opts.workspaceId } }),

  /** One run's flow run, by the run's record id: the record, or null and the sentence saying why there is none. */
  flowRunOf: (runId: string) =>
    request<{ run: string; flowRun: PanelRecord | null; says?: string }>(`/api/sessions/${encodeURIComponent(runId)}/flow-run`),

  /** Whether each person and each agent can be reached right now, and what that was read from. */
  presence: () => request<{ presence: PresenceOnTheWire[] }>('/api/presence'),

  /**
   * Whether each of the participants named can be reached right now, in the order named. The chat reads the dots it
   * draws with this, and not everybody's (round 9 of wave 13x). Each agent is read in its home project, because the chat
   * belongs to no project and an agent's dot reads the same from any project it is opened in (wave 13y round 111).
   */
  presenceOf: (whos: readonly { kind: ParticipantKind; id: string }[]) =>
    request<{ presence: PresenceOnTheWire[]; workspaceId: string }>(`/api/presence?of=${whos.map((one) => encodeURIComponent(participantKey(one))).join(',')}&scope=home`),

  /**
   * Whether one participant can be reached right now, read in the project named, or the one on
   * screen when none is. The chat reads it with the open conversation, in the same project.
   */
  presenceOfOne: (kind: ParticipantKind, id: string, workspaceId?: string) =>
    request<{ presence: PresenceOnTheWire }>(
      `/api/presence/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`,
      workspaceId === undefined ? undefined : { headers: { [WORKSPACE_HEADER]: workspaceId } },
    ),

  /**
   * HOW AGENTS READ THIS PROJECT. Six reads, one per band of the Usage page.
   *
   * NONE OF THESE WRITES A ROW IN THE REQUEST LOG. A read of the telemetry that recorded itself
   * would feed itself: the page reads the summary, the read writes a row, the row changes the
   * summary, and within a day the biggest operation in the product is reading the telemetry.
   */
  /**
   * WHAT THIS SERVER IS: the one read the runtime page makes, and the same one WrongWorld makes.
   *
   * Nothing is cached on either side of it. The route reads every field when the request arrives,
   * which is criterion G2's first rule, and a page holding an old answer about what is running is
   * the fault this whole cluster exists to prevent.
   */
  runtime: () => request<RuntimeRecord>('/api/runtime'),

  /**
   * Look on this machine for agent runs and file what is found, so a run can be talked to.
   *
   * IT IS NEVER CALLED ON A PAGE LOAD, and the page that offers it says so. It reads the log
   * directories of the agent tools on this computer and writes a record for every run it finds, so
   * it is a thing a person decides to do rather than something that happens while they are reading.
   *
   * WHY THE PRODUCT NEEDS IT AT ALL. A run can only be picked up where it left off if Mole Office knows
   * where its transcript is, and nothing in the browser wrote that down. In a corpus nobody has
   * swept, every candidate the recipient picker offers answers "this cannot be picked up", so the
   * whole path of sending a message to the agent already working on something is closed. Measured
   * on 18 August 2026 against a copy of the real corpus: 8 candidates, all of them unreachable
   * before this ran and all 39 reachable after it.
   */
  discoverSessions: () => request<DiscoverReply>('/api/sessions/discover', { method: 'POST', body: json({}) }),

  /**
   * ONE AGENT RUN, AND WHERE IT IS FILED. It follows criterion E2 and a decision.
   *
   * `GET /api/sessions/:id` answers the run as the machine sees it now — its live state and why —
   * plus the placement the server works out from the change log, the tail of its log, and what it
   * wrote. The run's own page reads it; the record's own `data` is read beside it through
   * `getRecord`, because the two answer different questions: what was written down, and what is
   * observable now.
   */
  getSession: (id: string) => request<SessionDetailReply>(`/api/sessions/${encodeURIComponent(id)}`),

  /**
   * ONE RUN'S OFFICE CALLS, IN TIME ORDER, WITH ITS POLLS FOLDED. Decision 6eb61657's door.
   *
   * The office records every flow operation itself, so this is the run's own history of what it
   * asked Mole Office for, rather than a reading of its transcript. The run's page draws it in one
   * section; the folding is done at the door and is not repeated here.
   */
  getSessionTimeline: (id: string) =>
    request<SessionTimeline>(`/api/sessions/${encodeURIComponent(id)}/timeline`),
}
