// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { ATTENTION_PART_ROWS } from '../src/shared/attention-first-page.ts'
import { familyOf } from '../src/shared/work.ts'
import { BLOCK_KIND } from '../src/shared/blocks.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { alarmKind, isAlarm, overdue } from '../src/shared/attention-first-page.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import type { AttentionReading } from '../src/server/lib/records.ts'

let folder = ''
let reading: AttentionReading

beforeAll(async () => {
  folder = aTestDatabaseFolder('attention-page-counts')
  const file = join(folder, 'office.db')
  const env = { ...process.env }
  for (const name of Object.keys(env)) if (name.startsWith('MOLE_OFFICE_') || name === 'MOLE_AGENT_KEY') delete env[name]
  const built = spawnSync(process.execPath, ['--import', 'tsx', 'tools/build-a-made-up-office.ts', '--scale', '4-november', '--one-in', '10', file], { env, encoding: 'utf8', timeout: 240_000 })
  expect(built.status, built.stderr).toBe(0)
  process.env.MOLE_OFFICE_DB = file
  const { attentionNow } = await import('../src/server/lib/records/attention.ts')
  const { theMessageReader } = await import('../src/server/lib/messages.ts')
  reading = attentionNow({ workspaceId: 'default', resources: [], reader: theMessageReader({ type: 'human', id: THE_PERSON }) })
}, 300_000)

afterAll(async () => {
  const { sqlite } = await import('../src/server/db/client.ts')
  if (sqlite.open) sqlite.close()
  removeThisTestFolder(folder)
})

it('keeps page counts and the four displayed alarms equal to the whole reading', async () => {
  const { homeAttention } = await import('../src/server/lib/attention-shapes.ts')
  const home = homeAttention(reading) as ReturnType<typeof homeAttention> & {
    remainderNext: string | null
    badgeCounts: { byKind: Record<string, number>; byFamily: Record<string, number>; safety: boolean }
    openWork: { open: number; uncertain: number }
    alarms: { rows: typeof reading.visible; total: number; overdue: number; sessionIds: string[] }
  }
  const selected = [...reading.visible, ...reading.remainder]
  expect(home.visible).toEqual(reading.visible)
  expect(home.remainder.map((row) => row.key)).toEqual(reading.remainder.slice(0, ATTENTION_PART_ROWS).map((row) => row.key))
  expect(home.remainderNext === null).toBe(reading.remainder.length <= ATTENTION_PART_ROWS)
  expect(home.reportCounts.waiting).toBe(reading.reports.filter((row) => row.waiting).length)
  for (const kind of new Set(selected.map((row) => row.recordKind))) expect(home.badgeCounts.byKind[kind]).toBe(selected.filter((row) => row.recordKind === kind).length)
  for (const family of new Set(selected.map((row) => familyOf(row.recordKind)).filter((one) => one !== null))) expect(home.badgeCounts.byFamily[family]).toBe(selected.filter((row) => familyOf(row.recordKind) === family).length)
  expect(home.badgeCounts.safety).toBe(selected.some((row) => row.safety))
  const selectedForAlarms = [...reading.visible, ...reading.remainder.map((row) => ({ ...row, reason: { ...row.reason, safetyFloor: false } }))]
  const alarms = selectedForAlarms.filter(isAlarm)
  const priority = { safety: 0, late: 1, stopped: 2, pause: 3 }
  const pageSize = (await import('../src/shared/attention-first-page.ts')).HOME_ALARMS_SHOWN
  const first = alarms.map((row, index) => ({ row, index })).sort((a, b) => priority[alarmKind(a.row)] - priority[alarmKind(b.row)] || a.index - b.index).slice(0, pageSize)
  expect(home.alarms.rows.map((row) => row.key)).toEqual(first.map(({ row }) => row.key))
  expect(home.alarms.total).toBe(alarms.length)
  expect(home.alarms.overdue).toBe(selectedForAlarms.filter(overdue).length)
  expect(home.alarms.sessionIds).toEqual([...new Set(alarms.filter((row) => row.recordKind === 'session').map((row) => row.recordId))])
  const known = new Set(['not_started', 'in_flight', 'paused_waiting', 'paused_cannot_tell'])
  const unknown = new Set(['unknown', 'unclassified', 'no_state_written', 'unknown_kind'])
  const open = selected.filter((row) => row.progress === 'not_started' || row.progress === 'in_flight' || row.progress === 'stopped_short' || row.progress === 'paused').length + reading.passedOver.filter((group) => known.has(group.bucket)).reduce((sum, group) => sum + group.count, 0)
  const uncertain = selected.filter((row) => row.progress !== 'not_started' && row.progress !== 'in_flight' && row.progress !== 'stopped_short' && row.progress !== 'paused' && row.progress !== 'finished').length + reading.passedOver.filter((group) => unknown.has(group.bucket)).reduce((sum, group) => sum + group.count, 0)
  expect(home.openWork).toEqual({ open, uncertain })
})

it('retains every graph row and all displayed block reasons in the flow reply', async () => {
  const { flowAttention } = await import('../src/server/lib/attention-shapes.ts')
  const example = reading.visible[0] ?? reading.remainder[0]
  expect(example).toBeDefined()
  const withBlock: AttentionReading = { ...reading, remainder: [...reading.remainder, { ...example!, recordKind: BLOCK_KIND }] }
  const flow = flowAttention(withBlock)
  for (const list of ['visible', 'remainder'] as const) {
    expect(flow[list]).toHaveLength(withBlock[list].length)
    for (const [index, row] of withBlock[list].entries()) {
      const sent = flow[list][index]!
      if (row.recordKind === BLOCK_KIND) expect(sent).toEqual(row)
      else expect(sent).toEqual({ recordId: row.recordId, recordKind: row.recordKind, score: row.score, safety: row.safety, reason: { coded: row.reason.coded, owed: row.reason.owed, consequence: row.reason.consequence, stoppedShort: row.reason.stoppedShort === null ? null : { since: row.reason.stoppedShort.since } } })
    }
  }
})
