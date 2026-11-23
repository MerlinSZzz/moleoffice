// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RECORD ID MAY BEGIN WITH DASHES, and a tool that takes one as a flag's value must not read it as a
 * forgotten value. Acceptance finding 49 (report EnJvvsDTF_Dx, block f-49): ids are 12 characters of
 * A-Za-z0-9_-, so one in 4,096 begins with `--`. tools/the-merger.mjs refused such a --session, and
 * tools/isolated-mole-office.mjs (--run, --handback) and tools/cluster-register.mjs (--pipeline) had the same
 * rule. Each now refuses a value only when there is none, or when it is one of its own flags, which is what a
 * forgotten value looks like.
 *
 * MUTATION PROOF, 23 September 2026, each alone: the old refusal of any value beginning with `--` put back in
 * isolated-mole-office's `wants`, and the first case goes red; put back in cluster-register's `valueAfter`,
 * and the third goes red.
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readArguments } from '../tools/isolated-mole-office.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
/** An id of the shape the office writes, beginning with two dashes as one in 4,096 does. */
const ID = '--0123456789'

describe('a record id that begins with two dashes', () => {
  it('is taken as --run and --handback by isolated-mole-office', () => {
    const args = readArguments(['start', 'cw-fresh', '--show-to-the-person', '--run', ID, '--handback', ID, '--api', 'http://127.0.0.1:9', '--workspace', 'default'])
    expect(args.bad, JSON.stringify(args)).toBeUndefined()
    expect(args.run).toBe(ID)
    expect(args.handback).toBe(ID)
  })

  it('does not hide a value forgotten before another flag, in isolated-mole-office', () => {
    const args = readArguments(['start', 'cw-fresh', '--show-to-the-person', '--run', '--api', 'http://127.0.0.1:9'])
    expect(args.bad).toContain('`--run` needs a session record id after it.')
  })

  it('is taken as --pipeline by cluster-register, and a forgotten value is still refused', () => {
    const tool = (...args: string[]) => spawnSync(process.execPath, [join(REPO, 'tools', 'cluster-register.mjs'), ...args], { encoding: 'utf8', timeout: 30_000 })
    // THE PARSE IS ENDED ON PURPOSE by a word the tool does not know, after the dashed id: reaching that word is
    // the proof that the id was taken as the value, and nothing is read or written.
    const dashed = tool('--pipeline', ID, '--not-a-flag-of-this-tool')
    expect(dashed.stderr + dashed.stdout).toContain('I do not know the argument "--not-a-flag-of-this-tool"')
    expect(dashed.stderr + dashed.stdout).not.toContain('needs a value')
    const forgotten = tool('--pipeline', '--api', 'http://127.0.0.1:9')
    expect(forgotten.stderr + forgotten.stdout).toContain('--pipeline needs a value after it.')
  })
})
