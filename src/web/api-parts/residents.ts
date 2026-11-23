// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13s, the person's authority. The browser's doors to residents and their spaces. Wave 13y's round 68
// moved them here out of the one `api` object in src/web/api.ts; a line adds its new doors to its own part, and
// src/web/api-parts/join.ts joins every part into `api`.
import type { TheAnsweredRename, TheRenamesOfAnAgent } from '@shared/agent-renames.ts'
import { moleOfficeRequest, request } from '../api.ts'
import type { OneResidentReading, TheConfirmReply, TheDeclineReply, TheNamedReply, TheResidentsList, TheSleepReading, TheSpaceListing } from '../lib/residents.ts'
import { WORKSPACE_HEADER } from '../lib/workspace.ts'

export const residentsDoors = {

  // -------------------------------------------------------------------- permanent residents
  // The proposal report GsGFiDygATd5 (wave 13r, round 4) and a decision.
  // The shapes are in src/web/lib/residents.ts.

  /** Every resident and every open proposal to make an agent one. */
  residents: () => request<TheResidentsList>('/api/residents'),

  /** One agent's residency, and its space as far as this caller may know it. */
  resident: (agentId: string) => request<OneResidentReading>(`/api/residents/${encodeURIComponent(agentId)}`),

  /** The files in a resident's personal space. Only a caller that may read the space gets them. */
  residentSpace: (agentId: string) =>
    request<TheSpaceListing>(`/api/residents/${encodeURIComponent(agentId)}/space`),

  /** One file of a resident's personal space, as its text. */
  residentSpaceFileText: (agentId: string, path: string) =>
    moleOfficeRequest<string>(
      `/api/residents/${encodeURIComponent(agentId)}/space/file?path=${encodeURIComponent(path)}`,
      {},
      'text',
    ),

  /**
   * THE PERSON CONFIRMS A PROPOSAL: the agent becomes a resident and its space is made, in one act.
   * Sent to the project the proposal was filed in, because Home and the Embassy draw proposals from
   * every project.
   */
  confirmResidentProposal: (proposalId: string, workspaceId: string) =>
    request<TheConfirmReply>(`/api/residents/proposals/${encodeURIComponent(proposalId)}/confirm`, {
      method: 'POST',
      body: '{}',
      headers: { [WORKSPACE_HEADER]: workspaceId },
    }),

  /** The person says "not now", with a reason or none. */
  declineResidentProposal: (proposalId: string, workspaceId: string, because: string | null) =>
    request<TheDeclineReply>(`/api/residents/proposals/${encodeURIComponent(proposalId)}/decline`, {
      method: 'POST',
      body: JSON.stringify(because === null ? {} : { because }),
      headers: { [WORKSPACE_HEADER]: workspaceId },
    }),

  /**
   * SAY A NEW RESIDENT'S PICTURE AND NAME ARE CHOSEN. The person, or the resident with its own key. It takes the reminder
   * off the person's list and changes no picture and no name.
   */
  residentNamed: (agentId: string) =>
    request<TheNamedReply>(`/api/residents/${encodeURIComponent(agentId)}/named`, { method: 'POST', body: '{}' }),

  /** Put a resident to sleep now. The person, or the resident with its own key. */
  residentSleep: (agentId: string) =>
    request<{ said: string; sleep: TheSleepReading }>(`/api/residents/${encodeURIComponent(agentId)}/sleep`, { method: 'POST', body: '{}' }),

  /** Wake a sleeping resident. The person, or the resident with its own key. */
  residentWake: (agentId: string) =>
    request<{ said: string; held: number; sleep: TheSleepReading }>(`/api/residents/${encodeURIComponent(agentId)}/wake`, { method: 'POST', body: '{}' }),

  /** The resident postpones a sleep, with its reason. The resident with its own key only; it is sent to nobody. */
  residentPostpone: (agentId: string, because: string) =>
    request<{ said: string; sleep: TheSleepReading }>(`/api/residents/${encodeURIComponent(agentId)}/sleep/postpone`, {
      method: 'POST',
      body: JSON.stringify({ because }),
    }),

  /**
   * Set a resident's own sleep time: the time of day it begins on the office's clock, as written, and how many minutes
   * it lasts. The person, or the resident with its own key: each resident sets its own.
   */
  residentSleepTime: (agentId: string, time: { startsAt: string; minutes: number }) =>
    request<{ said: string; sleep: TheSleepReading }>(`/api/residents/${encodeURIComponent(agentId)}/sleep-time`, {
      method: 'PUT',
      body: JSON.stringify(time),
    }),

  /** Mark one file of a space void, with the reason. The file stays. */
  voidASpaceFile: (agentId: string, path: string, because: string) =>
    request<unknown>(`/api/residents/${encodeURIComponent(agentId)}/space/void`, {
      method: 'POST',
      body: JSON.stringify({ path, because }),
    }),

  /** End one grant of leave to read a space before its date. */
  endASpaceGrant: (agentId: string, grantId: string) =>
    request<unknown>(
      `/api/residents/${encodeURIComponent(agentId)}/grants/${encodeURIComponent(grantId)}/end`,
      { method: 'POST', body: '{}' },
    ),

  /** Name the agent that may read a retired resident's space. */
  nameASuccessor: (agentId: string, successorId: string) =>
    request<unknown>(`/api/residents/${encodeURIComponent(agentId)}/successor`, {
      method: 'POST',
      body: JSON.stringify({ agentId: successorId }),
    }),

  // -------------------------------------------------------------------- an agent's new name
  // Item 42 of wave 13s (round 192). The agent's page reads its renames, and the person approves or refuses the one
  // that waits. The shapes are in src/shared/agent-renames.ts.

  /** Every rename of one agent, newest first, and whether this caller may answer the one that waits. */
  agentRenames: (agentId: string) =>
    request<TheRenamesOfAnAgent>(`/api/participants/agent/${encodeURIComponent(agentId)}/renames`),

  /** Approve the new name that waits, with the reason. */
  approveAgentRename: (renameId: string, because: string) =>
    request<TheAnsweredRename>(`/api/renames/${encodeURIComponent(renameId)}/approve`, {
      method: 'POST',
      body: JSON.stringify({ because }),
    }),

  /** Refuse the new name that waits, with the reason. The agent keeps its name. */
  refuseAgentRename: (renameId: string, because: string) =>
    request<TheAnsweredRename>(`/api/renames/${encodeURIComponent(renameId)}/refuse`, {
      method: 'POST',
      body: JSON.stringify({ because }),
    }),
}
