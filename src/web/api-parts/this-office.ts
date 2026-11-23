// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13s, the person's authority. The browser's doors to this office's own machine settings: push, sandbox
// logins, quick inputs, the price table, addresses, the GPU watcher, machine names, the owner, the mail tool, the
// entry, injection, interrupted runs, what is kept, goal spans and preview roots. Wave 13y's round 68 moved them
// here out of the one `api` object in src/web/api.ts; a line adds its new doors to its own part, and
// src/web/api-parts/join.ts joins every part into `api`.
import { type OfficeAddressForBrowsers, type OfficeGpuWatcherReply, type OfficeMachineNameWriteReply, type OfficeMachineNamesReply, request } from '../api.ts'
import type { AnInterruptedRun } from '@shared/interrupted.ts'
import type { TheOfficeOwner } from '@shared/owner.ts'
import type { PreviewRootsReply } from '../../server/api/preview-roots.ts'
import type { TheGoalSpans } from '@shared/goal-spans.ts'

export const thisOfficeDoors = {

  /**
   * THE SPANS IN FORCE FOR SHORT, MEDIUM AND LONG. Criterion P1: the spans are the person's
   * setting, so the planning page reads them here rather than writing a default into the page.
   * Distant has no span and the reply says so in its own sentence.
   */
  goalSpans: () => request<TheGoalSpans>('/api/office/goal-spans'),

  /**
   * THE DIRECTORIES A PREVIEW MAY READ IN THIS PROJECT, WITH WHERE EACH ONE CAME FROM.
   *
   * Criterion U4: the list is derived per project and the
   * Settings page shows it. It is a read: the panel draws it and changes nothing. The press that
   * adds a directory by hand is a later piece.
   */
  previewRoots: () => request<PreviewRootsReply>('/api/preview-roots'),

  /**
   * ADD ONE DIRECTORY BY HAND AS A PREVIEW ROOT, recorded with who and when.
   *
   * Criterion U4's odd case: a directory that is nobody's registered repository and is named by no
   * work area. It is kept on this machine because it names a folder on this computer, and the reply
   * is the whole updated list.
   */
  addPreviewRoot: (body: { path: string; why: string }) =>
    request<PreviewRootsReply>('/api/preview-roots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),

  /**
   * WHETHER AGENTS MAY INJECT: ONE SWITCH FOR EVERY AGENT. Criterion M91.
   *
   * With no argument it reads; with `true` or `false` it switches, and answers the reading as it now
   * stands, read fresh from the row.
   */
  agentsMayInject: (may?: boolean) =>
    request<import('@shared/profile.ts').MayInject>(
      '/api/office/agents-may-inject',
      may === undefined ? {} : { method: 'POST', body: JSON.stringify({ may }) },
    ),

  /** Every address the person has named, with the name they gave it. */
  machineNames: () => request<OfficeMachineNamesReply>('/api/office/machine-names'),

  /** Name an address, rename it, or take its name away. The reply says back what was stored. */
  setMachineName: (change: { address: string; name: string | null }) =>
    request<OfficeMachineNameWriteReply>('/api/office/machine-names', {
      method: 'POST',
      body: JSON.stringify(change),
    }),

  /** The one address a browser is sent to, so one pairing covers the office. */
  addressForBrowsers: () => request<OfficeAddressForBrowsers>('/api/office/address-for-browsers'),

  /** Choose the address for browsers, or take the choice away with null. The reply is the reading as it now stands. */
  setAddressForBrowsers: (address: string | null) =>
    request<OfficeAddressForBrowsers>('/api/office/address-for-browsers', {
      method: 'POST',
      body: JSON.stringify({ address }),
    }),

  /** WHO IS THE GPU WATCHER, set here or by the .env line. */
  gpuWatcher: () => request<OfficeGpuWatcherReply>('/api/office/gpu-watcher'),

  /** NAME THE GPU WATCHER by the agent's id, or null for nobody, with the reason. Answers the reading as it now stands. */
  setGpuWatcher: (agent: string | null, because: string | null) =>
    request<OfficeGpuWatcherReply>('/api/office/gpu-watcher', {
      method: 'POST',
      body: JSON.stringify(because === null ? { agent } : { agent, because }),
    }),

  /**
   * WHAT THE OFFICE KEEPS: the three numbers and the backups folder. Criterion U6.
   *
   * With no argument it reads; with a change it writes that change and answers the whole reading,
   * read fresh from the row and the folder.
   */
  whatIsKept: (change?: {
    keepBackups?: number | null
    untracedRequestDays?: number | null
    tracedRequestDays?: number | null
  }) =>
    request<import('@shared/what-is-kept.ts').WhatTheOfficeKeeps>(
      '/api/office/what-is-kept',
      change === undefined ? {} : { method: 'POST', body: JSON.stringify(change) },
    ),

  /** THE INTERRUPTED RUNS IN THIS PROJECT, newest first. Criterion W7. */
  interruptedRuns: () => request<{ runs: AnInterruptedRun[] }>('/api/office/interrupted-runs'),

  /**
   * THE PERSON'S ONE PRESS TO RESUME AN INTERRUPTED RUN. The server writes the ask on the run and the
   * message worker starts the resume on its next pass. The server refuses anybody but the person.
   */
  resumeARun: (session: string) =>
    request<{ run: AnInterruptedRun }>(`/api/office/interrupted-runs/${encodeURIComponent(session)}/resume`, { method: 'POST' }),

  /**
   * WHO OWNS THIS OFFICE, AND WHETHER THEY HAVE BEEN NAMED YET.
   *
   * src/web/owner.ts asks it once before the app loads. src/web/components/OwnerGate.tsx asks it
   * again at each new address while `named` is false, and every address draws the guide meanwhile.
   */
  officeOwner: () => request<TheOfficeOwner>('/api/office/owner'),

  /**
   * NAME THE OWNER, ONCE, FROM THE FIRST-RUN GUIDE. The server stores the name exactly as typed,
   * trimmed, and keeps the language on the person. It refuses once the office has a named owner,
   * and it refuses an agent with a sentence the guide draws as it is.
   */
  nameTheOwner: (said: { name: string; language?: import('@shared/i18n.ts').Language }) =>
    request<TheOfficeOwner>('/api/office/owner', { method: 'POST', body: JSON.stringify(said) }),

  /**
   * THE SANDBOXES' LOGINS: each login the sandbox templates declare, set or not set, and
   * never a value. `setASandboxLogin` writes one into the sandboxes' secrets file and `clearASandboxLogin` takes one
   * out; each answers the same reading.
   */
  sandboxLogins: () => request<import('@shared/sandbox-logins.ts').SandboxLogins>('/api/office/sandbox-logins'),

  setASandboxLogin: (name: string, value: string) =>
    request<import('@shared/sandbox-logins.ts').SandboxLogins>('/api/office/sandbox-logins/set', {
      method: 'POST',
      body: JSON.stringify({ name, value }),
    }),

  clearASandboxLogin: (name: string) =>
    request<import('@shared/sandbox-logins.ts').SandboxLogins>('/api/office/sandbox-logins/clear', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  testASandboxLogin: (name: string) =>
    request<import('@shared/sandbox-logins.ts').SandboxLoginTested>('/api/office/sandbox-logins/test', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  /**
   * THE KEY SLOTS in the provider router's key slots file: every routed provider a new slot may name, and each slot's
   * provider, id, label and key mark, never a key. `addAKeySlot` writes one key into the file and `removeAKeySlot` takes
   * one slot out; each answers the same reading.
   */
  keySlots: () => request<import('@shared/go-slots.ts').KeySlotsReading>('/api/provider-router/key-slots'),

  addAKeySlot: (provider: string, label: string, key: string) =>
    request<import('@shared/go-slots.ts').KeySlotsReading>('/api/provider-router/key-slots/add', {
      method: 'POST',
      body: JSON.stringify({ provider, label, key }),
    }),

  removeAKeySlot: (id: string) =>
    request<import('@shared/go-slots.ts').KeySlotsReading>('/api/provider-router/key-slots/remove', {
      method: 'POST',
      body: JSON.stringify({ id }),
    }),

  /**
   * THE MAIL TOOL, which a decision brought. `theMailTool` reads whether it is installed and
   * runs, and where the tool answers on this computer with its secret, which src/web/lib/the-mail-tool.ts asks
   * directly; `installTheMailTool` is their press that gives it its personal tool key and installs it as a service of
   * their login; `disableTheMailTool` is their press that turns it off without uninstalling it.
   * All three are the person's, or a secretary's holding the person's grant where this office's list of what the grant
   * carries says so.
   */
  theMailTool: () => request<import('@shared/summons.ts').TheMailTool>('/api/office/mail-tool'),

  installTheMailTool: () =>
    request<import('@shared/summons.ts').TheMailToolInstalled>('/api/office/mail-tool/install', { method: 'POST' }),

  takeBackTheMailToolsKey: () =>
    request<import('@shared/summons.ts').TheMailToolKeyTakenBack>('/api/office/mail-tool/take-back-key', { method: 'POST' }),
  disableTheMailTool: () =>
    request<import('@shared/summons.ts').TheMailToolDisabled>('/api/office/mail-tool/disable', { method: 'POST' }),
  /**
   * AND THE TOOL'S OWN SETTINGS, READ THROUGH THE OFFICE: on their other devices the tool cannot be asked directly, so the
   * office on its computer asks it and passes the answer on. The person's alone.
   */
  theMailToolsState: () =>
    request<import('@shared/the-mail-tool-through-the-office.ts').TheMailToolThroughTheOffice<import('../lib/the-mail-tool.ts').TheToolsState>>(
      '/api/office/mail-tool/state',
    ),
  /** AND THEIR THREE PRESSES ON THEM, passed on the same way, each answered with the tool's own answer. The person's alone. */
  saveTheMailToolsAddresses: (addresses: string) =>
    request<
      import('@shared/the-mail-tool-through-the-office.ts').TheMailToolsChangeThroughTheOffice<{
        done: import('../lib/the-mail-tool.ts').AddressesDone
        state: import('../lib/the-mail-tool.ts').TheToolsState
      }>
    >('/api/office/mail-tool/addresses', { method: 'POST', body: JSON.stringify({ addresses }) }),
  pickTheMailToolsAccount: (id: string) =>
    request<
      import('@shared/the-mail-tool-through-the-office.ts').TheMailToolsChangeThroughTheOffice<{
        done: { picked: boolean }
        state: import('../lib/the-mail-tool.ts').TheToolsState
      }>
    >('/api/office/mail-tool/account', { method: 'POST', body: JSON.stringify({ id }) }),
  sendTheMailToolsTest: () =>
    request<
      import('@shared/the-mail-tool-through-the-office.ts').TheMailToolsChangeThroughTheOffice<{
        done: { tested: boolean }
        state: import('../lib/the-mail-tool.ts').TheToolsState
      }>
    >('/api/office/mail-tool/test', { method: 'POST' }),

  /**
   * PUSH ON THIS DEVICE. `pushState` reads the key a browser subscribes
   * with and their devices, never their addresses; `allowThisDevice` keeps the subscription this browser made;
   * `stopADevice` forgets a device by its id; `testADevice` sends one notification to it.
   */
  pushState: () => request<import('@shared/push.ts').PushState>('/api/office/push'),

  allowThisDevice: (device: { endpoint: string; keys: { p256dh: string; auth: string }; name: string }) =>
    request<{ device: import('@shared/push.ts').PushDevice; state: import('@shared/push.ts').PushState }>('/api/office/push/devices', {
      method: 'POST',
      body: JSON.stringify(device),
    }),

  stopADevice: (device: string) =>
    request<{ removed: boolean; state: import('@shared/push.ts').PushState }>('/api/office/push/devices/remove', {
      method: 'POST',
      body: JSON.stringify({ device }),
    }),

  testADevice: (device: string) =>
    request<import('@shared/push.ts').PushOutcome>('/api/office/push/test', { method: 'POST', body: JSON.stringify({ device }) }),

  /**
   * PUT THE MOLE OFFICE ENTRY IN PLACE FOR EVERY DIRECTORY. F15 point 1; problem pHFu8nivPZ_O.
   *
   * The person's own press: it writes the skill link and the three hook lines into their home directory
   * at user level, merging into the existing settings file rather than replacing it. The reply names
   * every line it added and where the previous file was backed up; a second press changes nothing.
   */
  installTheEntry: () =>
    request<import('@shared/entry.ts').TheEntryInstallResult>('/api/office/install-the-entry', { method: 'POST' }),

  /** THE STATE OF THIS COMPUTER'S ENTRY KEY, read when the Settings entry is drawn: none yet, held, or refused. */
  theEntrysKeyState: () =>
    request<import('@shared/entry.ts').TheEntrysKeyReading>('/api/office/install-the-entry/this-computers-key'),

  /**
   * THE PRICE TABLE THE USAGE PAGE ESTIMATES FROM. Criterion U3.
   *
   * `priceTable` reads it with who set it and when. `setThePriceTable` sends a whole table and
   * `clearThePriceTable` removes it; both answer the reading as it now stands. The table is
   * checked on the server, and a refused one leaves the stored table as it was.
   */
  priceTable: () =>
    request<import('../../server/lib/price-table.ts').WhatThePriceTableDoorSays>('/api/office/price-table'),

  setThePriceTable: (table: unknown) =>
    request<import('../../server/lib/price-table.ts').WhatThePriceTableDoorSays>('/api/office/price-table', {
      method: 'POST',
      body: JSON.stringify({ table }),
    }),

  clearThePriceTable: () =>
    request<import('../../server/lib/price-table.ts').WhatThePriceTableDoorSays>('/api/office/price-table', {
      method: 'POST',
      body: JSON.stringify({ clear: true }),
    }),

  /**
   * THE LIST OF QUICK INPUTS THE OFFICE MAY TYPE INTO AN AGENT'S TERMINAL. Wave 13u, round 21.
   *
   * `quickInputs` reads it with who set it and when. `setTheQuickInputs` replaces the whole list and
   * `clearTheQuickInputs` removes it; both answer the reading as it now stands. The list is checked on the
   * server (`readQuickInputList`), and a refused one leaves the stored list as it was.
   */
  quickInputs: () => request<import('@shared/quick-inputs.ts').WhatTheQuickInputListDoorSays>('/api/office/quick-inputs'),

  setTheQuickInputs: (inputs: string[]) =>
    request<import('@shared/quick-inputs.ts').WhatTheQuickInputListDoorSays>('/api/office/quick-inputs', {
      method: 'POST',
      body: JSON.stringify({ inputs }),
    }),

  clearTheQuickInputs: () =>
    request<import('@shared/quick-inputs.ts').WhatTheQuickInputListDoorSays>('/api/office/quick-inputs', {
      method: 'POST',
      body: JSON.stringify({ clear: true }),
    }),
}
