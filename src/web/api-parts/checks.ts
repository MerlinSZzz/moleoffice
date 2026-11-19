// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13n, tests, checks and harnesses. The browser's doors to checklists, the toolset, the check on a run
// and run models. Wave 13y's round 68 moved them here out of the one `api` object in src/web/api.ts; a line adds
// its new doors to its own part, and src/web/api-parts/join.ts joins every part into `api`.
import { type ChecklistItemReply, type ChecklistsAcrossReply, json, request } from '../api.ts'
import type { ManualPage, ToolsetList } from '../../server/lib/toolset.ts'
import type { ToolUsesPage, ToolsetReader } from '@shared/toolset.ts'
import type { ChecklistEvidence, ChecklistReading, EvidenceChoice, EvidenceKind } from '@shared/checklists.ts'
import { WORKSPACE_HEADER } from '../lib/workspace.ts'
import { type ProjectChoice, projectsQuery } from '@shared/across-projects.ts'

export const checksDoors = {

  /**
   * CHECKLISTS ACROSS PROJECTS. `owner` is the door's own word: absent for the reader's own, `everyone`, or
   * `agent:<id>` / `person:<id>` for one owner's.
   */
  listChecklistsAcross: (choice: ProjectChoice, owner?: string) =>
    request<ChecklistsAcrossReply>(`/api/checklists?${projectsQuery(choice)}${owner === undefined ? '' : `&owner=${encodeURIComponent(owner)}`}`),

  /** ONE CHECKLIST, in whichever project holds it. */
  readChecklistAcross: (id: string) =>
    request<{ checklist: ChecklistReading; workspaceId: string }>(`/api/checklists/${encodeURIComponent(id)}?${projectsQuery('all')}`),

  /** WHAT AN ITEM'S "DONE" MAY NAME, in the checklist's own project, a page at a time, to pick from. */
  evidenceChoices: (checklist: ChecklistReading, kind: EvidenceKind, words: string, offset: number) =>
    request<{ choices: EvidenceChoice[]; matched: number; left: number; says: string }>(
      `/api/checklists/evidence-choices?kind=${encodeURIComponent(kind)}&offset=${String(offset)}${words.trim() === '' ? '' : `&words=${encodeURIComponent(words.trim())}`}`,
      { headers: { [WORKSPACE_HEADER]: checklist.workspaceId } },
    ),

  /** MARK ONE ITEM DONE WITH ITS EVIDENCE, in the checklist's own project. The door refuses an agent's done without evidence. */
  markChecklistItemDone: (checklist: ChecklistReading, itemId: string, evidence: ChecklistEvidence) =>
    request<ChecklistItemReply>(`/api/checklists/${encodeURIComponent(checklist.id)}/items/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', [WORKSPACE_HEADER]: checklist.workspaceId },
      body: JSON.stringify({ state: 'done', addEvidence: [evidence], ifVersion: checklist.version }),
    }),

  /**
   * MARK ONE ITEM DONE ON THE PERSON'S OWN PRESS. The door takes it only from the
   * person, and tells whoever the item names; from anybody else it is refused for want of evidence. An item of the
   * evidence-or-words style also carries the owner's own words, exactly as typed, and may carry picked evidence; both go
   * in the same change, with the version the view read. A message asked for this in wave 14a.
   */
  markChecklistItemDoneByThePerson: (checklist: ChecklistReading, itemId: string, said: { words?: string; evidence?: ChecklistEvidence } = {}) =>
    request<ChecklistItemReply>(`/api/checklists/${encodeURIComponent(checklist.id)}/items/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', [WORKSPACE_HEADER]: checklist.workspaceId },
      body: JSON.stringify({
        state: 'done',
        ...(said.words === undefined ? {} : { response: said.words }),
        ...(said.evidence === undefined ? {} : { addEvidence: [said.evidence] }),
        ifVersion: checklist.version,
      }),
    }),

  /**
   * MAKE ONE ITEM STANDING, OR ORDINARY AGAIN. The press is wave 13j round loop-6.
   * `false` takes `standing` away. The door refuses a standing item in any state but open or replaced.
   */
  makeChecklistItemStanding: (checklist: ChecklistReading, itemId: string, standing: boolean) =>
    request<ChecklistItemReply>(`/api/checklists/${encodeURIComponent(checklist.id)}/items/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', [WORKSPACE_HEADER]: checklist.workspaceId },
      body: JSON.stringify({ standing, ifVersion: checklist.version }),
    }),

  /**
   * THE TOOLSET CATALOGUE, piece P3. `who` narrows it to the tools for one kind of reader and the
   * tools for both; null lists every tool. The door refuses any other word.
   */
  readToolset: (who: ToolsetReader | null) =>
    request<ToolsetList>('/api/toolset' + (who === null ? '' : `?who=${encodeURIComponent(who)}`)),

  /** ONE TOOL'S MANUAL PAGE, by its slug. A slug no live tool has is a 404 in the door's words. */
  readManualPage: (slug: string) =>
    request<ManualPage & { workspaceId: string }>(`/api/toolset/${encodeURIComponent(slug)}`),

  /** ONE PAGE OF A RUN'S TOOL USES, newest first. `before` is the last page's `older`; null reads the newest. */
  readToolUses: (run: string, before: number | null) =>
    request<ToolUsesPage & { workspaceId: string }>(
      `/api/toolset/runs/${encodeURIComponent(run)}/uses` + (before === null ? '' : `?before=${String(before)}`),
    ),

  /**
   * THE PERSON CONFIRMS A PROPOSED CATEGORY, with their sentence saying why. The door files their
   * decision and sets the category's `confirmedBy` in one step, and refuses it to an agent.
   */
  confirmToolCategory: (id: string, why: string) =>
    request<{ category: string; decision: { id: string }; says: string }>(
      `/api/toolset/categories/${encodeURIComponent(id)}/confirm`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ why }) },
    ),

  /**
   * THE SUPERVISOR CONFIRMS THE REPORT A RELEASED RUN MADE, which is what closes the run.
   *
   * Criterion C29. A release settles the check and does not end the run; this does. `because` is
   * required by the route, because a close with nothing behind it cannot be told from a mis-press a
   * year later. The reply says where the run stands afterwards, in the same shape every other check
   * route answers with.
   */
  askForTheCheckAgain: (run: string) => request(`/api/checks/${encodeURIComponent(run)}/ask-again`, { method: 'POST', body: JSON.stringify({}) }),
  confirmTheReport: (run: string, input: { because: string }) =>
    request<{ stands: Record<string, unknown>; says: string; toTheWorker: string }>(
      `/api/checks/${encodeURIComponent(run)}/confirm`,
      { method: 'POST', body: json(input) },
    ),

  /**
   * THE MODEL EACH RUN USES. Criterion U2.
   *
   * `runModels` reads the place it keeps: what is set and what is in force. `setRunModels` sets or
   * clears the slots it names (null clears) and answers the whole reading. A builder's model and the
   * check's are in the Casting table, below. `agentRunModel` reads one
   * agent's own model and what its runs get; `setAgentRunModel` sets it, or clears it with null.
   * Both writes are the person's own: an agent is refused with a 403 whose words say so.
   */
  runModels: () => request<import('@shared/run-models.ts').RunModelsReading>('/api/office/run-models'),

  setRunModels: (change: {
    places?: Partial<Record<import('@shared/run-models.ts').RunModelPlace, import('@shared/run-models.ts').RunModelPair | null>>
  }) =>
    request<import('@shared/run-models.ts').RunModelsReading>('/api/office/run-models', {
      method: 'POST',
      body: JSON.stringify(change),
    }),

  agentRunModel: (agent: string) =>
    request<import('@shared/run-models.ts').AnAgentsRunModel>(`/api/office/run-models/agent/${encodeURIComponent(agent)}`),

  setAgentRunModel: (agent: string, model: string | null, variant: string | null) =>
    request<import('@shared/run-models.ts').AnAgentsRunModel>(`/api/office/run-models/agent/${encodeURIComponent(agent)}`, {
      method: 'POST',
      body: JSON.stringify({ model, variant }),
    }),
}
