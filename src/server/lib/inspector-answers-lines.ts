// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readSettingHere } from '../../config/settings.mjs'
import { sqlite } from '../db/client.ts'
import { packageOf, whatThePointsLack } from './delegation.ts'

export const INSPECTOR_ANSWER_LINES = 'MOLE_OFFICE_LINES_THE_INSPECTOR_ANSWERS'

/** Parse a comma-separated set without silently dropping unreadable entries. */
export function readInspectorAnswerLines(value: string | null): string[] {
  if (value === null || value.trim() === '') return []
  const lines = value.split(',').map((line) => line.trim())
  if (lines.some((line) => line === '')) {
    throw new Error('Use a comma-separated list of nonempty lines.')
  }
  return lines
}

export function inspectorAnswerLinesAreConfigured(): boolean {
  try {
    const reading = readSettingHere(INSPECTOR_ANSWER_LINES)
    return reading.source !== 'not read' && readInspectorAnswerLines(reading.value).length > 0
  } catch { return false }
}

/** The whole run qualifies only when every latest hand-back belongs wholly to the chosen lines. */
export function inspectorAnswersRun(run: string, workspaceId: string): boolean {
  try {
    const reading = readSettingHere(INSPECTOR_ANSWER_LINES)
    if (reading.source === 'not read') return false
    const lines = new Set(readInspectorAnswerLines(reading.value))
    if (lines.size === 0) return false
    const rows = sqlite.prepare(`SELECT data FROM records WHERE workspace_id = ? AND kind = 'task' AND deleted_at IS NULL
      AND json_valid(data) AND json_extract(data, '$.package.handedBack[#-1].run') = ?`).all(workspaceId, run) as { data: string }[]
    if (rows.length === 0) return false
    return rows.every((row) => {
      const pkg = packageOf(JSON.parse(row.data) as unknown)
      const handback = pkg?.handedBack?.at(-1)
      return pkg !== null && handback?.run === run && pkg.pointIds !== undefined &&
        whatThePointsLack(pkg.pointIds, handback.points.map((point) => point.pointId)) === null &&
        pkg.lines !== undefined && pkg.lines.length > 0 && pkg.lines.every((line) => typeof line === 'string' && lines.has(line))
    })
  } catch {
    return false
  }
}
