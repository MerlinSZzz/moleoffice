// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Project marks for the chat and agent pages.
 *
 * The owner's chat decision asks for one list with project marks and a project filter. Person contacts and conversations
 * show at most two project names followed by "+N" for the rest; their title holds the full list.
 * Agent rows show every project the agent belongs to. The chat stylesheet styles both kinds of mark.
 *
 * Project names are the titles people gave them, so they carry `data-chat-content` as message bodies do.
 */

import { t } from '@shared/i18n.ts'
import type { WorkspaceReading } from '@shared/workspaces.ts'
import { theMarkToDraw } from '../lib/projectmarks.ts'

export function ProjectMarks({ projects, known, agent = false }: { projects: readonly string[]; known: readonly WorkspaceReading[]; agent?: boolean }) {
  const mark = theMarkToDraw(projects, known)
  if (agent) {
    if (projects.length > 0 && known.length === 0) return null
    return (
      <span className="agent-projects" data-agent-projects>
        {projects.length === 0 ? <span>{t('agentTags.noProjects')}</span> : mark.all.map((name, i) => (
          <span key={`${String(i)}:${name}`} className="px-chat-project-mark agent-project" data-agent-project data-chat-content>{name}</span>
        ))}
      </span>
    )
  }
  if (mark.all.length === 0) return null
  return (
    <span className="px-chat-projects" title={t('chat.projects.markTitle', { names: mark.all.join(', ') })}>
      {mark.names.map((name, i) => (
        <span key={`${String(i)}:${name}`} className="px-chat-project-mark" data-chat-content>
          {name}
        </span>
      ))}
      {mark.more === 0 ? null : <span className="px-chat-project-more">{t('chat.projects.more', { n: mark.more })}</span>}
    </span>
  )
}

