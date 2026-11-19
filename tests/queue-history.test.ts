// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { history, readLogs, timeOf } from '../tools/queue-history.mjs'

it('counts recorded buses and receipts once, separates blocking files, and reports missing evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'mole-queue-history-'))
  try {
    const logs = `2026-10-08 01:00:00 merge entry leader (git) is submitted; lane synthetic
2026-10-08 01:00:00 the office answered: the entry is now judged
2026-10-08 01:09:00 the bus passes over merge entry conflict: the commits of conflict do not go onto this entry's result without a conflict. While this is the lane's newest bus
2026-10-08 01:09:01 the bus passes over merge entry held: held changes src/shared/ops.ts, which conflict also changes (by file, decision R2); src/shared/words/parts.ts, which conflict also changes (by line), and conflict is ahead of it and not aboard. While this is the lane's newest bus
2026-10-08 01:09:02 tested with merge entry rider in one suite, on the pair's tree abc123
2026-10-08 01:10:00 running pair-suite: synthetic command
2026-10-08 01:20:00 the office's health while the suite ran: synthetic sample
2026-10-08 01:21:00 step landed: {"mainAfter":"synthetic"}
2026-10-08 01:21:01 FAILED: The office refused the step landed
2026-10-08 01:22:00 the office answered: the entry is now merged
2026-10-08 01:00:00 merge entry rider (git) is submitted; lane synthetic
2026-10-08 01:05:00 the office answered: the entry is now judged
2026-10-08 01:23:00 the office answered: the entry is now bounced
2026-10-08 01:04:00 merge entry unrecorded (git) is submitted; lane synthetic
2026-10-08 01:24:00 step landed: {"mainAfter":"synthetic"}
2026-10-08 01:25:00 FAILED: The office refused the step landed
2026-10-08 01:04:00 merge entry later (git) is judged; lane synthetic
2026-10-08 02:00:00 the office answered: the entry is now merged
`
    mkdirSync(join(root, 'queue', 'entry'), { recursive: true })
    mkdirSync(join(root, 'runs', 'run'), { recursive: true })
    writeFileSync(join(root, 'queue', 'entry', 'the-merger.log'), logs)
    writeFileSync(join(root, 'runs', 'run', 'said.txt'), logs)
    const read = readLogs(join(root, 'queue'), join(root, 'runs'))
    expect(read.unreadable).toEqual([])
    const output = history(read.logs, '2026-10-08 01:07:00', '2026-10-08 01:30:00')
    expect(output.buses).toHaveLength(1)
    expect(output.buses[0]).toMatchObject({ started: '2026-10-08 01:09:00', riders: ['leader', 'rider'], leaderEnd: { outcome: 'landed', at: '2026-10-08 01:22:00' }, suiteSeconds: null, suiteElapsedThroughCompletionObservationSeconds: 600, outcomes: [{ entry: 'leader', outcome: 'landed', at: '2026-10-08 01:22:00' }, { entry: 'rider', outcome: 'bounced', at: '2026-10-08 01:23:00' }] })
    expect(output.buses[0]!.passedOver.map((p: { kind: string }) => p.kind)).toEqual(['git conflict', 'file held by an entry ahead'])
    expect(output.totals).toMatchObject({ observedLandings: 1, ridersPerBus: 2, judgedToLanded: { measured: 1, unknown: 0, meanSeconds: 1320 }, files: { code: { 'src/shared/ops.ts': 1 }, wordLists: { 'src/shared/words/parts.ts': 1 } } })
    const missing = readLogs(join(root, 'missing'), join(root, 'runs'))
    expect(missing.unreadable[0]?.path).toBe(join(root, 'missing'))
    const empty = history([], '2026-10-08 01:07:00', '2026-10-08 01:30:00', missing.unreadable)
    expect(empty.coverage.lastEvent).toBe(null)
    expect(empty.coverage.unreadable).toHaveLength(1)
    expect(empty.totals.ridersPerBus).toBe(null)
    const unfinished = history([{ path: 'synthetic', text: `2026-10-08 01:10:00 merge entry waiting (git) is testing; lane synthetic
2026-10-08 01:11:00 the bus passes over merge entry other: the commits of other do not go onto this entry's result without a conflict.
` }], '2026-10-08 01:07:00', '2026-10-08 01:30:00')
    expect(unfinished.coverage.passesWithoutATestDeclaration).toMatchObject([{ leader: 'waiting', entry: 'other', kind: 'git conflict' }])
    const withdrawn = history([{ path: 'synthetic', text: `2026-10-08 01:10:00 merge entry gone (git) is testing; lane synthetic
2026-10-08 01:11:00 tested alone: synthetic
2026-10-08 01:20:00 sandbox synthetic of merge entry gone, which is withdrawn, was still running
` }], '2026-10-08 01:07:00', '2026-10-08 01:30:00')
    expect(withdrawn.buses[0]?.outcomes).toEqual([{ entry: 'gone', outcome: 'withdrawn', at: null, observedAt: '2026-10-08 01:20:00', by: 'not known from the logs', history: [{ outcome: 'withdrawn', at: null, observedAt: '2026-10-08 01:20:00', by: 'not known from the logs' }] }])
    expect(withdrawn.totals.observedLandings).toBe(0)
    const retried = history([{ path: 'synthetic', text: `2026-10-08 01:10:00 merge entry retry (git) is testing; lane synthetic
2026-10-08 01:11:00 tested with merge entry companion in one suite, on the pair's tree first
2026-10-08 01:20:00 the office answered: the entry is now judged
2026-10-08 01:21:00 tested alone: synthetic retry
2026-10-08 01:25:00 the office answered: the entry is now merged
` }], '2026-10-08 01:07:00', '2026-10-08 01:30:00')
    expect(retried.buses.map((b: { leaderEnd: unknown }) => b.leaderEnd)).toEqual([{ outcome: 'returned to judged', at: '2026-10-08 01:20:00' }, { outcome: 'landed', at: '2026-10-08 01:25:00' }])
    expect(retried.totals).toMatchObject({ joinedBuses: 1, soloAttempts: 1, ridersPerJoinedBus: 2 })
    expect(() => timeOf('2026-02-30 00:00:00')).toThrow('Invalid local time')
  } finally { rmSync(root, { recursive: true, force: true }) }
})
