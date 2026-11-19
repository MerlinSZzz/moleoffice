// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13r, the office's settings and gates. The browser's doors to the office's settings, setting changes,
// notice rules, the pause and the restart, the shutdown, words waiting, dead letters and reminder secretaries. Wave
// 13y's round 68 moved them here out of the one `api` object in src/web/api.ts; a line adds its new doors to its
// own part, and src/web/api-parts/join.ts joins every part into `api`.
import { type OfficeDeadLetterSecretaryReply, type OfficeModuleReminderSecretariesReply, type OfficeSettingChangesReply, request, ApiError, readFault } from '../api.ts'
import type { DeadLetterThresholds } from '@shared/dead-letter-thresholds.ts'
import type { TheLiveRunsReading, TheShutDownAnswer } from '@shared/shutting-down.ts'

import type { PrivateLoginCapability, PrivateLoginState } from '@shared/private-sandbox-login.ts'
import { PRIVATE_LOGIN_MS } from '../../config/private-sandbox-login.mjs'
import { t } from '@shared/i18n.ts'
const privateHeaders = (binding: string, generation?: string) => ({ 'x-private-login-binding': binding, ...(generation ? { 'x-private-login-generation': generation } : {}) })
const privatePath = (state: PrivateLoginState, suffix: string) => `/api/office/sandbox-logins/claude/attempts/${encodeURIComponent(state.attempt)}/${suffix}`
const expiredPrivateRequest = (path: string) => {
  const message = t('server.privateLoginExpired')
  return new ApiError(409, message, readFault(409, path, { error: message, code: 'privateLoginExpired', values: {} }))
}
/** A private request has its own deadline and drops its owned body even if a transport stalls. */
async function privateRequest<T>(path: string, init: RequestInit, deadline = Date.now() + PRIVATE_LOGIN_MS): Promise<T> {
  const remaining = Math.min(PRIVATE_LOGIN_MS, deadline - Date.now())
  if (!Number.isFinite(remaining) || remaining <= 0) { delete init.body; throw expiredPrivateRequest(path) }
  const controller = new AbortController()
  const bounded = { ...init, signal: controller.signal }
  let stopped!: () => void
  const ended = new Promise<never>((_resolve, reject) => { stopped = () => reject(expiredPrivateRequest(path)); controller.signal.addEventListener('abort', stopped, { once: true }) })
  const timer = setTimeout(() => controller.abort(), remaining)
  try { return await Promise.race([request<T>(path, bounded), ended]) }
  finally { clearTimeout(timer); controller.signal.removeEventListener('abort', stopped); delete bounded.body; delete init.body }
}
export const settingsDoors = {
  privateLoginCapability: (binding: string) => privateRequest<PrivateLoginCapability>('/api/office/sandbox-logins/claude/capability', { headers: privateHeaders(binding), cache: 'no-store' }),
  privateLoginStart: (binding: string, generation: string, nonce: string) => privateRequest<PrivateLoginState>('/api/office/sandbox-logins/claude/attempts', { method: 'POST', headers: privateHeaders(binding, generation), cache: 'no-store', body: JSON.stringify({ nonce }) }),
  privateLoginStatus: (binding: string, state: PrivateLoginState) => privateRequest<PrivateLoginState>(privatePath(state, 'status'), { headers: privateHeaders(binding, state.generation), cache: 'no-store' }),
  privateLoginSignIn: (binding: string, state: PrivateLoginState) => privateRequest<{ url: string }>(privatePath(state, 'sign-in'), { headers: privateHeaders(binding, state.generation), cache: 'no-store' }, state.deadline),
  privateLoginCode: (binding: string, state: PrivateLoginState, code: string) => privateRequest<PrivateLoginState>(privatePath(state, 'code'), { method: 'POST', headers: privateHeaders(binding, state.generation), cache: 'no-store', body: JSON.stringify({ code }) }, state.deadline),
  privateLoginCancel: (binding: string, state: PrivateLoginState) => privateRequest<PrivateLoginState>(privatePath(state, 'cancel'), { method: 'POST', headers: privateHeaders(binding, state.generation), cache: 'no-store', body: '{}' }),
  privateLoginDisconnect: (binding: string, state: PrivateLoginState) => privateRequest<{ disconnected: boolean }>(privatePath(state, 'disconnect'), { method: 'POST', headers: privateHeaders(binding, state.generation), cache: 'no-store', keepalive: true, body: '{}' }),

  storageDestinations: (change?: unknown) => request<import('../../server/lib/storage/destinations.ts').DestinationSettingsReply>('/api/office/storage-destinations', change === undefined ? undefined : {method:'POST',body:JSON.stringify(change)}),
  noticeRules: (change?: {mutedKinds:string[];batchedKinds?:string[];because:string;ifVersion:string|null}, seq?:number) => request<import('../../server/api/notice-rules.ts').NoticeRulesReply>('/api/messages/notice-rules'+(seq === undefined ? '' : '/restore'), change === undefined ? undefined : {method:seq === undefined ? 'PUT' : 'POST',body:JSON.stringify(seq === undefined ? change : {seq,because:change.because,ifVersion:change.ifVersion})}),
  officeSettings: (changes?: { changes: { name: string; value: string | null; decision?: string | null }[]; because: string }) => request<import('../../server/api/runtime-settings.ts').RuntimeSettingsReply>('/api/office/settings', changes === undefined ? undefined : { method: 'POST', body: JSON.stringify(changes) }),
  restartAgents: (words: string) => request<{agents:{id:string;name:string;handle:string}[]}>(`/api/office/restart?agentWords=${encodeURIComponent(words)}`),
  officePauseState: () => request<{paused:boolean;by:string|null;at:string|null;because:string|null;available:boolean}>('/api/office/pause'),
  changeOfficePause: (paused:boolean,why:string) => request<{state:{paused:boolean;by:string|null;at:string|null;because:string|null;available:boolean};paused:unknown[];notPaused:unknown[];worker:string}>(paused?'/api/office/pause':'/api/office/resume',{method:'POST',body:JSON.stringify({why})}),
  restartState: (signal?: AbortSignal) => request<{ instance: string; mode: 'checkout' | 'installed' | null; grants: { agent: { id: string; name: string | null }; decision: { id: string; title: string | null }; live: boolean }[]; history:{agent:string|null;by:string|null;at:string;from:string|null;to:string|null}[] }>('/api/office/restart', {signal}),
  restartOffice: (because: string) => request<{ requested: true; mode: string; instance: string }>('/api/office/restart', { method: 'POST', body: JSON.stringify({ because }) }),
  restartGrant: (agent: string, decision: string | null, because: string) => request('/api/office/restart-grant', { method: 'POST', body: JSON.stringify({ agent, decision, because }) }),

  /** The newest recorded change to each setting whose history the office keeps. */
  settingChanges: () => request<OfficeSettingChangesReply>('/api/office/setting-changes'),

  /**
   * WHO TAKES THE DEAD LETTERS. Problem 0WUuvB0IhRfb. With no argument it reads; with an agent's id, or
   * null for nobody, it names one and answers the reading as it now stands.
   */
  deadLetterThresholds: (chosen?: { days: number | null; count: number | null; because: string; decision?: string | null }) =>
    request<DeadLetterThresholds>('/api/office/dead-letter-thresholds', chosen === undefined ? {} : { method: 'POST', body: JSON.stringify(chosen) }),

  deadLetterSecretary: (agent?: string | null) =>
    request<OfficeDeadLetterSecretaryReply>(
      '/api/office/dead-letter-secretary',
      agent === undefined ? {} : { method: 'POST', body: JSON.stringify({ agent }) },
    ),

  /** WHO IS REMINDED ABOUT EACH PROJECT'S MODULES, set here or by the .env line. Decision aZGg6gerakM1. */
  moduleReminderSecretaries: () => request<OfficeModuleReminderSecretariesReply>('/api/office/module-reminder-secretaries'),

  /**
   * SET ONE PROJECT'S MODULE REMINDER SECRETARY, by the agent's id, or null to set nothing here so the .env line counts
   * again. Answers the whole reading as it now stands.
   */
  setModuleReminderSecretary: (project: string, secretary: string | null) =>
    request<OfficeModuleReminderSecretariesReply>(`/api/office/module-reminder-secretaries/${encodeURIComponent(project)}`, {
      method: 'POST',
      body: JSON.stringify({ secretary }),
    }),

  /** THE AGENT RUNS A SHUTDOWN WOULD PAUSE, and whether this caller may press it. Criterion W6. */
  liveRuns: () => request<TheLiveRunsReading>('/api/office/live-runs'),

  /**
   * SHUT MOLE OFFICE DOWN, pausing the runs `seen` names. The server refuses anybody but the owner, and refuses
   * when a run is at work that `seen` does not name; both refusals carry a code.
   */
  shutDown: (seen: readonly string[]) =>
    request<TheShutDownAnswer>('/api/office/shut-down', { method: 'POST', body: JSON.stringify({ seen }) }),

  /** The first `limit` words waiting for translation, with the count of all of them. */
  /** The words waiting for one language's translation; with no language named, the Chinese answer as before. */
  wordsWaiting: (limit: number, language?: import('@shared/i18n.ts').Language) =>
    request<import('../../server/lib/words-waiting.ts').WhatTheWordsWaitingDoorSays | import('../../server/lib/words-waiting.ts').WhatTheWordsWaitingForALanguageDoorSays>(
      `/api/words/waiting?limit=${String(limit)}${language === undefined ? '' : `&language=${encodeURIComponent(language)}`}`),
}
