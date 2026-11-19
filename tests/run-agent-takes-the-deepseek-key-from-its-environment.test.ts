// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { syntheticDshReader } from './dsh-native-stand-in.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * run-agent.sh TAKES THE DEEPSEEK KEY FROM ITS OWN ENVIRONMENT, AND IN A SANDBOX FROM NOWHERE ELSE.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS FILE IS WRITTEN AGAINST
 * ---------------------------------------------------------------------------------------
 *
 * Problem epOLxauSbzd9, 28 September 2026. Every sandbox kept a copy of dsh's env file, which holds the DeepSeek key,
 * and `tools/dsh-hooks/run-agent.sh` sourced it (`set -a; . $D/env`). Any run in the sandbox could read that file,
 * whatever its runtime, so the rule that a run holds its own model's logins and no other's (theDeclaredSecrets in
 * tools/sandbox-common.mjs) did not hold for DeepSeek. The launcher now gives the key to a dsh run alone, and the copy
 * is no longer made (tests/sandbox-launcher.test.ts holds that half).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED, one case each
 * ---------------------------------------------------------------------------------------
 *
 *   1. In a sandbox, with the key in the run's environment and no env file: dsh starts, with that key.
 *   2. In a sandbox, with the key in the run's environment and an older copy of the env file beside it: the file is
 *      not read, and dsh starts with the environment's key.
 *   3. In a sandbox, with no key in the environment and an older copy of the env file beside it: nothing is started,
 *      the runner exits 2 and says how a DeepSeek worker is started, and the file is not read.
 *   4. On the host, with no key in the environment: the host's env file is read as before, and dsh starts with its key.
 *
 * THE KEYS ARE MADE UP, and differ by where they came from, so the fake dsh's one observation says which was used. No
 * real dsh can start: `$D/npm/node_modules/.bin/dsh` is a script this file writes. The office named is one that never
 * answers.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN
 * ---------------------------------------------------------------------------------------
 *
 *   1. run-agent.sh sources $D/env unconditionally again, after the new lines. Cases 1 and 2 go red.
 *   2. The refusal in a sandbox taken out, so a keyless run there reads the older copy. Case 3 goes red.
 *   3. The host's fallback to its env file taken out. Case 4 goes red.
 *
 * AND THE LAUNCHER'S HALF, in tests/sandbox-launcher.test.ts: dsh's env file copied into the instance again, or any part
 * of dsh's home but its profiles copied in, and its first case goes red.
 *
 * NO /tmp ANYWHERE: every scratch directory is under this checkout's gitignored `.cache/`.
 */
import { spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/+$/, '')
const RUN_AGENT = join(REPO, 'tools', 'dsh-hooks', 'run-agent.sh')

// AN OFFICE THAT NEVER ANSWERS, ON PURPOSE: nothing here may reach the live office's port.
const UNREACHABLE_API = 'http://127.0.0.1:9'
const FROM_THE_ENVIRONMENT = 'not-a-real-key-from-the-environment'
const FROM_THE_FILE = 'not-a-real-key-from-the-file'

const made: string[] = []
afterAll(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** One run of the real runner, in a scratch dsh folder of its own, and what its fake dsh saw. */
async function runTheRunner(input: { sandbox: boolean; keyInTheEnvironment: boolean; envFile: boolean }) {
  mkdirSync(join(REPO, '.cache'), { recursive: true })
  const dir = mkdtempSync(join(REPO, '.cache', 'run-agent-deepseek-key-'))
  made.push(dir)
  const home = join(dir, 'home')
  const worktree = join(dir, 'a-worktree')
  const brief = join(dir, 'the-brief.md')
  const log = join(dir, 'the-run.log')
  const dshDir = join(dir, 'dsh')
  const bin = join(dshDir, 'npm', 'node_modules', '.bin')
  const saw = join(dir, 'the-key-dsh-saw')
  for (const one of [home, worktree, bin, join(dshDir, 'home')]) mkdirSync(one, { recursive: true })
  writeFileSync(brief, 'a brief for the key test\n')
  if (input.envFile) writeFileSync(join(dshDir, 'env'), `DEEPSEEK_API_KEY=${FROM_THE_FILE}\n`, { mode: 0o600 })
  // THE FAKE dsh WRITES THE KEY IT WAS STARTED WITH, a made-up one, and exits at once.
  writeFileSync(join(bin, 'dsh'), ['#!/usr/bin/env bash', `printf '%s' "\${DEEPSEEK_API_KEY:-}" > '${saw}'`, 'exit 0', ''].join('\n'))
  chmodSync(join(bin, 'dsh'), 0o755)

  const env: NodeJS.ProcessEnv = { ...withoutInheritedEffort(), HOME: home, MOLE_OFFICE_AGENT_MODEL: 'deepseek-v4.1-flash', SANDBOX_DSH_NATIVE_READER: syntheticDshReader(dir), MOLE_OFFICE_DSH_DIR: dshDir, MOLE_OFFICE_API: UNREACHABLE_API }
  delete env['DEEPSEEK_API_KEY']
  delete env['SANDBOX_DIR']
  if (input.sandbox) env['SANDBOX_DIR'] = dir
  if (input.keyInTheEnvironment) env['DEEPSEEK_API_KEY'] = FROM_THE_ENVIRONMENT

  const child = spawn('bash', [RUN_AGENT, worktree, brief, log, 'the-test-handle', 'the-test-session', 'default'], {
    cwd: REPO,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')))
  child.stdout?.resume()
  const code = await new Promise<number | null>((settled) => child.on('close', settled))
  return { code, stderr, dshStarted: existsSync(saw), keyDshSaw: existsSync(saw) ? readFileSync(saw, 'utf8') : null }
}

describe('run-agent.sh and the DeepSeek key', () => {
  it('1: in a sandbox, starts dsh with the key from its environment, with no env file there', async () => {
    const ran = await runTheRunner({ sandbox: true, keyInTheEnvironment: true, envFile: false })
    expect(ran.code, ran.stderr).toBe(0)
    expect(ran.keyDshSaw).toBe(FROM_THE_ENVIRONMENT)
    expect(ran.stderr).not.toContain('No such file or directory')
  })

  it('2: in a sandbox, does not read an older copy of the env file when the key is in its environment', async () => {
    const ran = await runTheRunner({ sandbox: true, keyInTheEnvironment: true, envFile: true })
    expect(ran.code, ran.stderr).toBe(0)
    expect(ran.keyDshSaw, 'the older copy of the env file was read in the sandbox').toBe(FROM_THE_ENVIRONMENT)
  })

  it('3: in a sandbox with no key in its environment, starts nothing, says how a DeepSeek worker is started, and reads no file', async () => {
    const ran = await runTheRunner({ sandbox: true, keyInTheEnvironment: false, envFile: true })
    expect(ran.dshStarted, `dsh was started with ${String(ran.keyDshSaw)}`).toBe(false)
    expect(ran.code).toBe(2)
    expect(ran.stderr).toContain('was given no DEEPSEEK_API_KEY')
    expect(ran.stderr).toContain('--runtime dsh')
  })

  it("4: on the host, with no key in its environment, reads the host's env file as before", async () => {
    const ran = await runTheRunner({ sandbox: false, keyInTheEnvironment: false, envFile: true })
    expect(ran.code, ran.stderr).toBe(0)
    expect(ran.keyDshSaw).toBe(FROM_THE_FILE)
  })
})
