// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sqlite } from './client.ts'

/** Every registered agent's projects, from its live agent records, in one read. */
export function projectsOfAgents(): Map<string, string[]> {
  const rows = sqlite.prepare(
    'SELECT DISTINCT m.agent_id AS agent, r.workspace_id AS project ' +
    'FROM agent_records m CROSS JOIN records r ON r.id = m.record_id ' +
    "WHERE r.deleted_at IS NULL AND r.kind = 'agent' ORDER BY m.agent_id, r.workspace_id",
  ).all() as { agent: string; project: string }[]
  const projects = new Map<string, string[]>()
  for (const row of rows) {
    const held = projects.get(row.agent)
    if (held === undefined) projects.set(row.agent, [row.project])
    else held.push(row.project)
  }
  return projects
}

/** One agent's projects, using the same membership rule without reading every agent. */
export function projectsOfAgent(agent: string): string[] {
  const rows = sqlite.prepare(
    'SELECT DISTINCT r.workspace_id AS project ' +
    'FROM agent_records m CROSS JOIN records r ON r.id = m.record_id ' +
    "WHERE m.agent_id = ? AND r.deleted_at IS NULL AND r.kind = 'agent' ORDER BY r.workspace_id",
  ).all(agent) as { project: string }[]
  return rows.map((row) => row.project)
}
