// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ClaudeCodeAdapter } from '../src/worker/runtimes/claude-code.ts'

describe('a Claude Code answer is trimmed as the other runtime answers are', () => {
  it('stores the envelope answer without its leading or trailing whitespace', () => {
    const dir = mkdtempSync(join(tmpdir(), 'claude-answer-trim-'))
    try {
      const outputPath = join(dir, 'run.out')
      writeFileSync(outputPath, JSON.stringify({ result: ' MOLE ', session_id: 'session-one' }), 'utf8')

      const result = new ClaudeCodeAdapter({}).readResult({
        runtime: 'claude-code',
        pid: 1,
        pgid: 1,
        startedAt: '2026-09-30 12:00:00',
        providerSession: null,
        outputPath,
      })

      expect(result.text).toBe('MOLE')
      expect(result.endedHow).toBe('answered')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
