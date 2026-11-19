// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE `ps` AND `lsof` THAT ANSWER AS macOS DOES ANSWER ABOUT ONE PROCESS AT A TIME, AND NEVER ABOUT EVERY PROCESS. Wave
 * 13u round 104. The owner's rule: no test may read every process on the machine; a test looks only at what it made.
 * tests/fixtures/a-ps-and-lsof-that-answer-as-macos-does.mjs stands in for macOS `ps` and `lsof` in the test that starts
 * the server with its platform set to darwin. Its servers ask only about one process at a time (round 104 counted 13
 * `ps -o … -p <pid>` calls and no `ps -axo` or `lsof -a -d cwd -Fpn` in one run of that test).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. `ps -axo <columns>`, a question about every process, is not answered: exit 2, nothing printed, and the error
 *      says it was a question about every process.
 *   2. `lsof -a -d cwd -Fpn`, the working folder of every process, is not answered in the same way.
 *   3. The questions about one process are still answered: `ps -o <columns> -p <pid>` and `lsof -a -p <pid> -d cwd -Fn`
 *      about this test's own process.
 *
 * Every question is put to the stand-in, never to the real `ps` or `lsof`. The only process asked about is this test's
 * own.
 *
 * ---------------------------------------------------------------------------------------
 * CONTROL, MUTATION AND RESTORE: in the round 104 report.
 * ---------------------------------------------------------------------------------------
 */

import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PS_COLUMNS } from '../src/config/process-reader.mjs'

const THE_STAND_IN = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'a-ps-and-lsof-that-answer-as-macos-does.mjs')

/** The two questions about every process, as src/config/process-reader.mjs and src/server/lib/darwin-probe.ts ask them on macOS. */
const ABOUT_EVERY_PROCESS = { ps: ['-axo', PS_COLUMNS], lsof: ['-a', '-d', 'cwd', '-Fpn'] }

/** The stand-in asked as `ps` or `lsof`, with no log of the questions. */
function ask(which: 'ps' | 'lsof', args: string[]) {
  const env = { ...process.env }
  delete env['MOLE_OFFICE_TEST_MAC_COMMANDS_LOG']
  const did = spawnSync(process.execPath, [THE_STAND_IN, which, ...args], { encoding: 'utf8', env, timeout: 30_000 })
  return { status: did.status, stdout: did.stdout, stderr: did.stderr }
}

describe('the ps and lsof that answer as macOS does', () => {
  it('1. does not answer ps -axo, a question about every process', () => {
    const did = ask('ps', ABOUT_EVERY_PROCESS.ps)
    expect(did.stdout).toBe('')
    expect(did.stderr).toContain('every process')
    expect(did.status).toBe(2)
  })

  it('2. does not answer lsof -a -d cwd -Fpn, the working folder of every process', () => {
    const did = ask('lsof', ABOUT_EVERY_PROCESS.lsof)
    expect(did.stdout).toBe('')
    expect(did.stderr).toContain('every process')
    expect(did.status).toBe(2)
  })

  it("3. still answers about one process: this test's own", () => {
    const ps = ask('ps', ['-o', PS_COLUMNS, '-p', String(process.pid)])
    expect(ps.status).toBe(0)
    expect(ps.stdout.trim().split(/\s+/u)[0]).toBe(String(process.pid))
    expect(ps.stdout.trim().split('\n')).toHaveLength(1)

    const lsof = ask('lsof', ['-a', '-p', String(process.pid), '-d', 'cwd', '-Fn'])
    expect(lsof.status).toBe(0)
    expect(lsof.stdout).toBe(`p${String(process.pid)}\nfcwd\nn${realpathSync(process.cwd())}\n`)
  })
})
