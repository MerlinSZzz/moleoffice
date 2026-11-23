// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The shared knowledge workspace's registry row. It is established on startup so knowledge
 * records have a place independent of projects.
 */
import { KNOWLEDGE_KINDS, KNOWLEDGE_WORKSPACE } from '@shared/knowledge/constants.ts'
import { KNOWLEDGE_WORDS } from '@shared/words/en-wave-13u.ts'
import { now } from '@shared/now.ts'
import { sqlite } from '../db/client.ts'

/** Establish the shared row, refusing an existing project that contains non-knowledge records. */
export function establishKnowledgeWorkspace(): void {
  const found = sqlite.prepare('SELECT id FROM workspaces WHERE id = ?').get(KNOWLEDGE_WORKSPACE)
  const otherRecord = found && sqlite.prepare(`SELECT 1 FROM records WHERE workspace_id = ? AND kind NOT IN (${KNOWLEDGE_KINDS.map(() => '?').join(', ')}) LIMIT 1`).get(KNOWLEDGE_WORKSPACE, ...KNOWLEDGE_KINDS)
  if (otherRecord) throw new Error(KNOWLEDGE_WORDS.collision)
  const at = now()
  sqlite.prepare('INSERT OR IGNORE INTO workspaces (id, title, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(KNOWLEDGE_WORKSPACE, KNOWLEDGE_WORDS.workspaceTitle, KNOWLEDGE_WORDS.workspaceNote, at, at)
}
