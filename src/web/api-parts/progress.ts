// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13s. The browser's door to the project's progress card.
import { WORKSPACE_HEADER } from '../lib/workspace.ts'
import { request } from '../api.ts'
import type { ProjectProgress } from '../../shared/progress.ts'

export const progressDoors = {
  /**
   * `workspaceId` NAMES THE PROJECT THE ASK WAS MADE FOR, when the ask had to wait its turn
   * (src/web/lib/oneask.ts): a delayed read must read the project it was asked about, not the one
   * on screen when it finally starts. Left out, the request names the project on screen.
   */
  projectProgress: (line?: string, workspaceId?: string) =>
    request<ProjectProgress>(line === undefined ? '/api/backlog/progress' : `/api/backlog/progress?line=${encodeURIComponent(line)}`, workspaceId === undefined ? undefined : { headers: { [WORKSPACE_HEADER]: workspaceId } }),
}
