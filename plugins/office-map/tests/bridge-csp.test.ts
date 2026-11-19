// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

it('first-use bridge validates with zero Function construction', () => {
  const helper = fileURLToPath(new URL('./bridge-csp.case.mjs', import.meta.url))
  const child = spawnSync(process.execPath, ['--import', 'tsx', helper], { encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024 })
  const evidence = process.env.OFFICE_MAP_BRIDGE_CSP_EVIDENCE
  if (evidence) {
    const at = resolve(evidence)
    expect(at.includes('/out/office-map/round12/production-transport/') && !at.includes('/worktrees/'), 'HELPER_EVIDENCE_MUST_BE_EXTERNAL').toBe(true)
    const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
    writeFileSync(join(at, 'stdout.log'), child.stdout ?? '', { flag: 'wx' })
    writeFileSync(join(at, 'stderr.log'), child.stderr ?? '', { flag: 'wx' })
    writeFileSync(join(at, 'command.json'), JSON.stringify({ argv: [process.execPath, '--import', 'tsx', helper], pid: child.pid, exit: child.status, signal: child.signal, error: child.error ? String(child.error) : null, sourceSHA256: sha(readFileSync(new URL('../src/bridge.ts', import.meta.url))), helperSHA256: sha(readFileSync(helper)), stdoutSHA256: sha(child.stdout ?? ''), stderrSHA256: sha(child.stderr ?? '') }, null, 2) + '\n', { flag: 'wx' })
  }
  expect(child.error, 'FRESH_BRIDGE_HELPER_MUST_START_AND_FINISH').toBeUndefined()
  expect(child.signal, 'FRESH_BRIDGE_HELPER_MUST_NOT_BE_SIGNALLED').toBeNull()
  const lines = child.stdout.split('\n').filter(line => line.startsWith('BRIDGE_CSP_RECEIPT '))
  expect(lines, 'ACTUAL_BRIDGE_PROBE_RECEIPT_REQUIRED').toHaveLength(1)
  const receipt = JSON.parse(lines[0]!.slice('BRIDGE_CSP_RECEIPT '.length))
  expect(receipt.importJitless).toBe(false)
  expect(receipt.uncachedBeforeFirstUse).toBe(true)
  expect(receipt.validationComplete).toBe(true)
  expect(receipt.reads).toEqual(['asleep', 'online', 'projects', 'roster'])
  if (child.status !== 0) {
    expect(child.status, 'UNRELATED_HELPER_EXIT').toBe(1)
    expect(child.stderr, 'INTENDED_HELPER_ASSERTION_REQUIRED').toContain('BRIDGE_FIRST_USE_FUNCTION_PROBE')
    expect(receipt.probes, 'ACTUAL_FUNCTION_PROBE_REQUIRED_FOR_RED').toBeGreaterThan(0)
    expect(receipt.probeEvents.every((event: { kind: string; args: string[]; stack: string }) => event.kind === 'construct' && event.args.length === 1 && event.args[0] === '' && /zod[\\/]v4[\\/]core[\\/]util\.(?:cjs|js)/.test(event.stack)), 'ONLY_REAL_ZOD_CAPABILITY_PROBE_IS_INTENDED').toBe(true)
  }
  console.log('BRIDGE_CSP_RECEIPT ' + JSON.stringify(receipt))
  expect(receipt.probes, 'BRIDGE_FIRST_USE_FUNCTION_PROBE').toBe(0)
  expect(child.status, 'FRESH_BRIDGE_HELPER_MUST_PASS').toBe(0)
}, 30000)
