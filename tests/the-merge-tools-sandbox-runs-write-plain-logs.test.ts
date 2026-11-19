// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY VITEST RUN THE MERGE TOOL STARTS IN A SANDBOX WRITES A PLAIN LOG (decision Au-emIg8JIx3). vitest colours
 * its log unless it sees an agent, and the queue is not one, so a coloured FAIL line matched neither the failure-lines
 * reader nor a test's exact lookup. The tool now runs each sandbox command with NO_COLOR=1 and without FORCE_COLOR.
 *
 *   1. The words the sandbox runs for the tool's vitest command carry NO_COLOR=1 and take FORCE_COLOR out, before npm.
 *   2. Those words, run here with FORCE_COLOR set and NO_COLOR unset, give the command NO_COLOR=1 and no FORCE_COLOR.
 *
 * The cloud box's suite and the Modal second opinion are not started through the sandbox, and are not covered here.
 */

import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { theCommandInTheSandbox } from '../tools/merge-tool/plain-logs.mjs'

describe("the merge tool's sandbox runs write plain logs", () => {
  it("1: the tool's vitest command carries NO_COLOR=1 and takes FORCE_COLOR out", () => {
    const words = theCommandInTheSandbox('npm', ['test', '--', '--reporter=default', 'tests/one.test.ts'])
    const npm = words.indexOf('npm')
    expect(npm).toBeGreaterThan(0)
    const before = words.slice(0, npm)
    expect(before).toContain('NO_COLOR=1')
    const unset = before.indexOf('-u')
    expect(unset).toBeGreaterThan(-1)
    expect(before[unset + 1]).toBe('FORCE_COLOR')
    expect(words.slice(npm)).toEqual(['npm', 'test', '--', '--reporter=default', 'tests/one.test.ts'])
  })

  it('2: run with FORCE_COLOR set, the command sees NO_COLOR=1 and no FORCE_COLOR', () => {
    const [program, ...args] = theCommandInTheSandbox(process.execPath, [
      '-e',
      'process.stdout.write(JSON.stringify({ no: process.env.NO_COLOR ?? null, force: process.env.FORCE_COLOR ?? null }))',
    ])
    const env: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: '1' }
    delete env['NO_COLOR']
    const ran = spawnSync(program!, args, { env, encoding: 'utf8' })
    expect(ran.status, ran.stderr).toBe(0)
    expect(JSON.parse(ran.stdout)).toEqual({ no: '1', force: null })
  })
})
