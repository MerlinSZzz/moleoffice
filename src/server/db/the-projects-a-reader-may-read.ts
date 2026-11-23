// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROJECTS A READER MAY READ.
 * `theProjectsAReaderMayRead` was moved byte for byte out of src/server/lib/across-projects.ts, with no
 * change of behaviour. That file imports it back and re-exports it, so every caller keeps its import.
 */
import type { Workspace } from '@shared/workspaces.ts'
import type { AMessageReader } from './types/messages.ts'
import { listWorkspaces } from './list-workspaces.ts'

/** Every project this reader may read. Today every registered project; see the header in across-projects.ts. */
export function theProjectsAReaderMayRead(_reader: AMessageReader): Workspace[] {
  return listWorkspaces()
}
