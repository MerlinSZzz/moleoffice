// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN EXIT NOBODY SAW REFUSES ONLY AN ANSWER THE TOOL DID NOT MARK. Problem dCsNFBSUatCe.
 *
 * A run's exit code is written to a file beside its output by the worker that started it. A run that outlives a worker
 * restart has no such file: nothing saw it exit. `withExitStatus` in src/worker/runtimes/common.ts then refuses an
 * answer from a tool that does not mark a refusal (Codex, OpenCode), because a refusal printed where the answer goes
 * would read as one. It lets the answer stand for a tool that marks a refusal in its own output (Claude Code's
 * `is_error`, Kimi CLI's final message), so a real reply is not lost only because a worker restarted. A recorded
 * non-zero code refuses every answer; a recorded zero lets every answer stand.
 *
 * Three-run proof, this whole file each time:
 *   node tools/run-named-tests.mjs tests/an-unseen-exit-refuses-only-an-unmarked-answer.test.ts
 * Mutation in src/worker/runtimes/common.ts, restored with cp and checked with cmp:
 *   `(result.endedHow !== 'answered' || how.refusalsAreMarked === true)` to `result.endedHow !== 'answered'`: the case
 *   for a marked answer goes red.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { withExitStatus } from '../src/worker/runtimes/common.ts'
import type { RunHandle, RunResult } from '../src/worker/runtimes/adapter.ts'

const DIR = mkdtempSync(join(tmpdir(), 'mole-office-exit-'))
afterAll(() => rmSync(DIR, { recursive: true, force: true }))

function aHandle(name: string, exit: string | null): RunHandle {
  const outputPath = join(DIR, `${name}.out`)
  writeFileSync(outputPath, 'Test: the output')
  if (exit !== null) writeFileSync(`${outputPath}.exit-code`, exit)
  return { runtime: 'codex', pid: 1, pgid: 1, startedAt: '2026-09-29 13:00:00', providerSession: null, outputPath, exitCodePath: `${outputPath}.exit-code` } as RunHandle
}

const ANSWER: RunResult = { text: 'Test: an answer', providerSession: null, endedHow: 'answered', because: 'Test: read from the output.' } as RunResult

describe('an exit nobody saw refuses only an answer the tool did not mark', () => {
  it('an unseen exit refuses an answer the tool did not mark, and says why', () => {
    const out = withExitStatus(aHandle('unmarked', null), ANSWER)
    expect(out.endedHow).toBe('failed')
    expect(out.because).toContain('no recorded exit code')
  })

  it('an unseen exit lets an answer the tool marked stand', () => {
    expect(withExitStatus(aHandle('marked', null), ANSWER, { refusalsAreMarked: true }).endedHow).toBe('answered')
  })

  it('a recorded non-zero exit refuses every answer, marked or not', () => {
    const out = withExitStatus(aHandle('refused', '1'), ANSWER, { refusalsAreMarked: true })
    expect(out.endedHow).toBe('failed')
    expect(out.because).toContain('exited with code 1')
  })

  it('a recorded zero lets every answer stand', () => {
    expect(withExitStatus(aHandle('clean', '0'), ANSWER).endedHow).toBe('answered')
  })
})
