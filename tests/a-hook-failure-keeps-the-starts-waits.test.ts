// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HOOK FAILURE KEEPS THE STARTUP STAGES EVEN WHEN NO WAIT TIMER HAS SPOKEN.
 *
 * Two child runs use this checkout's real setup and reporters. The fixture observes liveApp's first stage and
 * stops it before it reserves ports. One hook then remains pending until its own short limit; the other returns.
 * The failed hook must carry the recorded stage in both the printed error and JSON, independently of console
 * timers. The successful hook stays quiet. The fixture's name is generated and its stage is read from the callback.
 */
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { A_WAIT_IS_NAMED_AFTER_MS } from './a-start-names-its-wait.ts'

const ROOT = join(import.meta.dirname, '..')

function aHook(mode: 'timeout' | 'passes', nested = false): {
  status: number | null; output: string; failures: string; name: string; stage: string; recorded: boolean
} {
  const folder = aTestDatabaseFolder('hook-startup-journal')
  const tests = join(folder, 'tests')
  mkdirSync(tests)
  const name = randomUUID()
  const limit = Math.min(250, A_WAIT_IS_NAMED_AFTER_MS / 10)
  const observed = join(folder, 'observed.json')
  const input = join(folder, 'fixture.json')
  writeFileSync(input, JSON.stringify({ name, mode, observed, nested }))
  const fixture = join(tests, 'hook.test.ts')
  writeFileSync(fixture, `
import { beforeAll, describe, expect, inject, it, vi } from 'vitest'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
vi.mock(${JSON.stringify(join(ROOT, 'tests/the-time-a-hook-has-left.ts'))}, async (original) => ({
  ...await original(), whenThisHookOrCaseMustEnd: () => null,
}))
import { liveApp } from ${JSON.stringify(join(ROOT, 'tests/helpers.ts'))}
const data = JSON.parse(readFileSync(${JSON.stringify(input)}, 'utf8'))
function register() {
beforeAll(async () => {
  await liveApp({ name: data.name, onSetupWait: (what) => {
    const folder = inject('theTestFilesRunning')
    const rows = readdirSync(folder).filter((file) => file.endsWith('.jsonl')).flatMap((file) =>
      readFileSync(join(folder, file), 'utf8').trim().split('\\n').filter(Boolean).map((line) => JSON.parse(line)))
    const recorded = rows.some((row) => typeof row.who === 'string' && row.who.includes(data.name) && row.what === what)
    writeFileSync(data.observed, JSON.stringify({ what, recorded }))
    throw new Error('The fixture stops before reserving ports.')
  } }).catch(() => {})
  if (data.mode === 'timeout') await new Promise(() => {})
}, ${String(limit)})
it('needs its setup', () => expect(true).toBe(true))
}
if (data.nested) describe('a nested startup', register)
else register()
`)
  const report = join(folder, 'report.json')
  try {
    const ran = spawnSync(process.execPath, [
      join(ROOT, 'node_modules/vitest/vitest.mjs'), 'run', `--dir=${folder}`,
      '--no-file-parallelism', '--reporter=default', '--reporter=json',
      `--outputFile.json=${report}`, fixture,
    ], { cwd: ROOT, env: process.env, encoding: 'utf8', timeout: 60_000 })
    if (ran.error) throw ran.error
    const output = `${ran.stdout}\n${ran.stderr}`
    const saved = JSON.parse(readFileSync(report, 'utf8')) as {
      testResults: { message: string; assertionResults: { failureMessages: string[] }[] }[]
    }
    const failures = saved.testResults.map((one) => [one.message, ...one.assertionResults.flatMap((case_) => case_.failureMessages)].join('\n')).join('\n')
    const { what: stage, recorded } = JSON.parse(readFileSync(observed, 'utf8')) as { what: string; recorded: boolean }
    return { status: ran.status, output, failures, name, stage, recorded }
  } finally {
    removeThisTestFolder(folder)
  }
}

it('retains a stage in the timed-out hook error, its printed output and JSON, before the wait alarm', () => {
  for (const nested of [false, true]) {
    const seen = aHook('timeout', nested)
    expect(seen.status, seen.output).toBe(1)
    expect.soft(seen.recorded, 'the stage was recorded before onSetupWait ran').toBe(true)
    expect.soft(seen.failures).not.toBe('')
    for (const text of [seen.output, seen.failures]) {
      expect.soft(text).toContain(seen.name)
      expect.soft(text).toContain(seen.stage)
    }
  }
}, 120_000)

it('keeps a successful hook quiet while its stage is still recorded', () => {
  const seen = aHook('passes')
  expect(seen.status, seen.output).toBe(0)
  expect(seen.recorded, 'the successful hook also recorded its stage before the callback').toBe(true)
  expect(seen.output).not.toContain(seen.name)
  expect(seen.output).not.toContain(seen.stage)
  expect(seen.failures.trim()).toBe('')
}, 120_000)
