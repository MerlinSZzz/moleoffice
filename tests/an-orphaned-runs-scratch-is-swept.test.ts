// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic records and process checks; no container or live office is touched. */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { SCRATCH_SWEEP_RULE, sweepRunScratch } from '../tools/sweep-run-scratch.mjs'
import { localStampOf } from '../src/config/stopped-run-cause.mjs'

it('sweeps an orphaned run past 48 hours with no process or live reference', async () => {
  mkdirSync(join(process.cwd(), '.logs'), { recursive: true })
  const root = mkdtempSync(join(process.cwd(), '.logs/orphan-scratch-'))
  const temp = join(root, 'tmp'), instanceDir = join(root, 'instance'), run = 'orphan_12345'
  const folder = join(temp, run + '-ABC123'), now = new Date(2026, 9, 14, 12).getTime()
  mkdirSync(folder, { recursive: true }); mkdirSync(instanceDir)
  writeFileSync(join(folder, 'evidence.txt'), 'Synthetic orphaned-run scratch')
  try {
    // THE PAUSE BETWEEN OFFICE ASKS IS NOT WAITED HERE; tests/the-scratch-sweep-paces-its-office-asks.test.ts proves it.
    await sweepRunScratch({ root: temp, instanceDir, workspace: 'synthetic', now, sleep: async () => {},
      processes: () => ({ using: [], unreadable: [] }), free: () => ({ why: null, unreadable: [] }),
      ask: async (path: string) => {
        if (path === `/api/records/${run}`) return { status: 200, body: { record: {
          id: run, kind: 'session', updatedAt: localStampOf(new Date(now - 49 * 3_600_000)), data: { state: 'orphaned' },
        } } }
        // The named-inside answer as the real door gives it: nothing names the folder.
        if (path.startsWith('/api/report-files/named-inside?')) return { status: 200, body: { folder, records: [], hiddenCount: 0,
          scope: 'Readable live records in this project name their stored paths. hiddenCount counts other live records in every project that name this folder or a path inside it.',
          says: `0 readable records list files inside ${folder}; 0 other live records name the folder or a path inside it.` } }
        if (path.startsWith('/api/search?')) return { status: 200, body: { counts: { matched: 0 }, elsewhere: [] } }
        throw new Error(`No synthetic reply for ${path}`)
      },
    })
    expect(existsSync(folder)).toBe(false)
    const log = readFileSync(join(instanceDir, 'logs', run, 'finish.log'), 'utf8')
    expect(log).toContain(`run ${run}`)
    expect(log).toContain('is removed. Rule:')
    expect(log).toContain(SCRATCH_SWEEP_RULE)
    expect(log).toContain('orphaned')
  } finally { rmSync(root, { recursive: true, force: true }) }
})
