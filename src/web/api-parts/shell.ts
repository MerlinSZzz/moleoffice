// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13y, pages and speed. The browser's doors to the web shell: projects (workspaces) and the brief. Wave
// 13y's round 68 moved them here out of the one `api` object in src/web/api.ts; a line adds its new doors to its
// own part, and src/web/api-parts/join.ts joins every part into `api`.
import { request } from '../api.ts'
import type { WorkspacesReply } from '../../server/api/workspaces.ts'
import { WORKSPACE_HEADER } from '../lib/workspace.ts'
import type { TheFirstEntry } from '@shared/getting-started.ts'
import type { ReviewLevel, Workspace } from '@shared/workspaces.ts'

export const shellDoors = {

  /**
   * Every project this installation holds, and which one THIS request was answered from.
   *
   * THE ONLY CALL IN THIS FILE THAT ASKS ABOUT MORE THAN ONE WORKSPACE, and it is the switcher's
   * whole supply: the browser knows the id it is sending and nothing else — not the title, not
   * how much is in it, not whether the id names anything at all.
   *
   * IT SENDS THE WORKSPACE HEADER LIKE EVERY OTHER CALL, on purpose, even though the list it asks
   * for is not scoped. The reply's `current` block says which project the SERVER answered from and
   * whether it heard a request say so, so the switcher can compare that against what this browser
   * believes it asked for. That comparison is the only live check that the two ends still agree
   * about the header — the day the name drifts, every screen goes on drawing the default project's
   * records under another project's name, and this is what notices.
   *
   * A workspace id the server has no workspace for is refused (404) rather than created, so this
   * call fails when the stored project does not exist here. That is not a dead end: the switcher
   * shows the server's own sentence and offers the stated default, which every migrated database
   * has. See `WorkspaceSwitcher` in components/Sidebar.tsx.
   */
  listWorkspaces: () => request<WorkspacesReply>('/api/workspaces'),

  /**
   * CHANGE ONE PROJECT: its title, the note under its name, or how much review its finished runs
   * get. The last of the three follows a decision.
   *
   * THE PROJECT IS NAMED IN THE PATH AND NOT TAKEN FROM THE HEADER, because a person may be reading
   * one project and changing the settings of another; the header says which project a READ is about,
   * and this is a write to a named row.
   *
   * `reviewLevel: null` puts the project back to nobody having chosen, which Mole Office reads as
   * `full`. Leaving the key out keeps what is stored.
   */
  changeWorkspace: (id: string, body: { title?: string; note?: string | null; reviewLevel?: ReviewLevel | null; packageInspection?: boolean }) =>
    request<Workspace>(`/api/workspaces/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),

  /**
   * WHAT AN ARRIVING AGENT IS TOLD, exactly as it is told it.
   *
   * IT IS A DIFFERENT ASSEMBLER FROM THE ONE A BUNDLE USES, and this is the only screen that reads
   * it. `src/server/api/brief.ts` does not import `src/server/lib/continuation.ts`; the two share
   * four readers and nothing else — `openLoopsFor`, `listRecords`, `readForks` and, since criterion
   * B20, `rankOpenWork`, which is why the open work comes out in one order. It said ONE reader here
   * and on the page until 7 September 2026, and it was three even then. The bundles page draws this
   * beside the copies it makes so a person
   * can check what an agent was handed, and says on the page that the two are not the same thing.
   * It follows criterion B17 of design/bundle/ACCEPTANCE.md and a decision.
   */
  brief: (workspaceId: string) => request<unknown>('/api/brief', { headers: { [WORKSPACE_HEADER]: workspaceId } }),

  /**
   * A NEW OFFICE'S FIRST ENTRY, and the press that ends it when the person opens its report from the checklist (wave 13y
   * round 138). src/web/lib/first-entry.tsx is the one reader of both.
   */
  firstEntry: () => request<TheFirstEntry>('/api/getting-started'),
  endTheFirstEntry: () =>
    request<{ changed: boolean; firstEntry: TheFirstEntry }>('/api/getting-started/opened', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }),
}
