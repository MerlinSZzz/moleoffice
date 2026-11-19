// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readWorkspacesOnce } from '../lib/oneread.ts'
import { ProjectMarks } from './ProjectMarks.tsx'
import { useAsync } from './ui.tsx'

/** The names are read once for the page and shared with the chat. */
export function AgentProjectMarks({ projects }: { projects: readonly string[] }) {
  const [reading] = useAsync(() => readWorkspacesOnce(), [])
  return <ProjectMarks agent projects={projects} known={reading.status === 'ready' ? reading.value.workspaces : []} />
}
