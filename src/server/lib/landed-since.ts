// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sqlite } from '../db/client.ts'
import { theAgentAndStarterOfAnEntry } from './merge-queue.ts'
import { contentHeld } from './merge-state-machine.ts'

const LANE = "CASE WHEN json_type(data, '$.changeset.root') = 'text' THEN json_extract(data, '$.changeset.root') || CASE WHEN json_extract(data, '$.documents') IS NULL THEN '' ELSE ' documents' END END"
const LANDED_INSTANT = "json_extract(data, '$.integrated.time.instant')"
const LANDED_MOMENT =
  `CASE WHEN json_type(data, '$.integrated.time.instant') = 'text' AND ` +
  `${LANDED_INSTANT} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*' AND ` +
  `(${LANDED_INSTANT} GLOB '*Z' OR ${LANDED_INSTANT} GLOB '*[+-][0-9][0-9]:[0-9][0-9]') ` +
  `THEN unixepoch(${LANDED_INSTANT}, 'subsec') END`

export interface LandedSinceAsked {
  sinceInstant: string
  sinceLocal: string
  limit: number
  repository?: string
  lane?: string
  afterInstant?: string
  afterId?: string
}

interface LandedSinceRow {
  id: string
  title: string
  run: string | null
  repository: string | null
  mainBefore: string | null
  mainAfter: string | null
  landedAt: string | null
  landedInstant: string
  lane: string | null
  files: string | null
  filesType: string | null
}

export interface LandedSinceLanding extends Omit<LandedSinceRow, 'run' | 'files' | 'filesType'> {
  pathsChanged: number | null
  run: string | null
  line: { agent: string | null; starter: string | null }
}

export function landingsSince(workspaceId: string, asked: LandedSinceAsked) {
  const scope = [
    'workspace_id = ?',
    "kind = 'merge_entry'",
    'deleted_at IS NULL',
    "json_extract(data, '$.state') = 'merged'",
  ]
  const scopeValues: string[] = [workspaceId]
  if (asked.repository !== undefined) {
    scope.push("json_extract(data, '$.changeset.root') = ?")
    scopeValues.push(asked.repository)
  }
  if (asked.lane !== undefined) {
    scope.push(`${LANE} = ?`)
    scopeValues.push(asked.lane)
  }
  const index = asked.lane === undefined
    ? (asked.repository === undefined ? 'records_landed_instant_idx' : 'records_landed_instant_repo_idx')
    : (asked.repository === undefined ? 'records_landed_lane_idx' : 'records_landed_repo_lane_idx')
  // Seek separately into a cursor's tied instant and the instants after it. A tuple comparison on
  // an expression index can walk every earlier id in a large tie before reaching the cursor.
  const select =
    "SELECT id, title, json_extract(data, '$.run') AS run, json_extract(data, '$.changeset.root') AS repository, " +
    "json_extract(data, '$.integrated.mainBefore') AS mainBefore, json_extract(data, '$.integrated.mainAfter') AS mainAfter, " +
    "json_extract(data, '$.integrated.at') AS landedAt, json_extract(data, '$.integrated.time.instant') AS landedInstant, " +
    `${LANE} AS lane, json_extract(data, '$.integration.files') AS files, json_type(data, '$.integration.files') AS filesType ` +
    `FROM records INDEXED BY ${index} WHERE ${scope.join(' AND ')}`
  const take = asked.limit + 1
  const after = asked.afterInstant
  const useCursor = after !== undefined && asked.afterId !== undefined && Date.parse(after) >= Date.parse(asked.sinceInstant)
  let rows: LandedSinceRow[]
  if (useCursor) {
    rows = sqlite.prepare(`${select} AND ${LANDED_MOMENT} = unixepoch(?, 'subsec') AND id > ? ORDER BY id LIMIT ?`)
      .all(...scopeValues, after, asked.afterId!, take) as LandedSinceRow[]
    if (rows.length < take) {
      const later = sqlite.prepare(`${select} AND ${LANDED_MOMENT} > unixepoch(?, 'subsec') ORDER BY ${LANDED_MOMENT}, id LIMIT ?`)
        .all(...scopeValues, after, take - rows.length) as LandedSinceRow[]
      rows.push(...later)
    }
  } else {
    rows = sqlite.prepare(`${select} AND ${LANDED_MOMENT} >= unixepoch(?, 'subsec') ORDER BY ${LANDED_MOMENT}, id LIMIT ?`)
      .all(...scopeValues, asked.sinceInstant, take) as LandedSinceRow[]
  }
  const truncated = rows.length > asked.limit
  if (truncated) rows.pop()
  const landings: LandedSinceLanding[] = rows.map((row) => {
    const { agent, starter } = row.run === null ? { agent: null, starter: null } : theAgentAndStarterOfAnEntry({ run: row.run })
    const { files, filesType, ...landing } = row
    let pathsChanged: number | null = null
    try {
      if (filesType === 'object' && files !== null) pathsChanged = Object.keys(contentHeld(JSON.parse(files), 'integration.files', row.id)).length
    } catch { /* The stored map is unreadable. */ }
    return { ...landing, pathsChanged, line: { agent: agent?.id ?? null, starter: starter?.kind === 'agent' ? starter.id : null } }
  })
  const unreadablePresent =
    sqlite
      .prepare(`SELECT 1 AS present FROM records INDEXED BY ${index} WHERE ` + [...scope, `${LANDED_MOMENT} IS NULL`].join(' AND ') + ' LIMIT 1')
      .get(...scopeValues) !== undefined
  // A missing root makes a lane unknowable. With no repository filter it could be this lane.
  const unknownLanePresent = asked.lane !== undefined && asked.repository === undefined &&
    sqlite.prepare(`SELECT 1 FROM records INDEXED BY records_landed_lane_idx WHERE workspace_id = ? AND kind = 'merge_entry' AND deleted_at IS NULL AND json_extract(data, '$.state') = 'merged' AND ${LANE} IS NULL LIMIT 1`).get(workspaceId) !== undefined
  const last = landings.at(-1)
  return {
    repository: asked.repository ?? null,
    lane: asked.lane ?? null,
    since: asked.sinceLocal,
    sinceInstant: asked.sinceInstant,
    boundary: 'inclusive' as const,
    order: 'landedInstant,id' as const,
    unreadablePresent: unreadablePresent || unknownLanePresent,
    limit: asked.limit,
    landings,
    returned: landings.length,
    truncated,
    next: truncated && last !== undefined ? { at: last.landedInstant, id: last.id } : null,
  }
}
