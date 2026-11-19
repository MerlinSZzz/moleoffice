// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * run-agent.sh REFUSES TO RUN THE HOST'S dsh INSIDE A SANDBOX.
 *
 * Acceptance finding 68, 24 September 2026. A second round of a dsh agent in the same run was started with
 * `tools/sandbox-start.mjs exec --run <id> -- bash tools/dsh-hooks/run-agent.sh ...`. The launcher named the instance's
 * own dsh folder only to a new dsh run, so run-agent.sh fell back to the host's own folder, which is not in the
 * container. It printed `nice: '.../dsh': No such file or directory` and exited 127: a round that looked started and
 * ended in the same second.
 *
 * WHAT IS PROVED: with SANDBOX_DIR set and MOLE_OFFICE_DSH_DIR not set, run-agent.sh exits 2, says why and names the
 * folder to use, and never reaches the line that starts dsh. The launcher's half, that every command in a sandbox with
 * a dsh folder is told its folder, is held in tests/sandbox-launcher.test.ts.
 *
 * NO REAL dsh CAN START HERE, even with the refusal taken out. A stand-in `nice` first on PATH, the one program the
 * script starts dsh through, writes down that it was reached and exits 97. What it was handed is not written down, and
 * neither is its environment, because the fallback would have sourced the host's dsh env file.
 *
 * MUTATION PROOF, 24 September 2026, alone in tools/dsh-hooks/run-agent.sh: the refusal taken out, and this goes red,
 * because the script reaches nice.
 *
 * NO /tmp ANYWHERE: the scratch directory is under this checkout's gitignored `.cache/`.
 */
import { spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/+$/, '')
const RUN_AGENT = join(REPO, 'tools', 'dsh-hooks', 'run-agent.sh')

// AN OFFICE THAT NEVER ANSWERS, ON PURPOSE: nothing here may reach the live office's port.
const UNREACHABLE_API = 'http://127.0.0.1:9'

const made: string[] = []
afterAll(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('run-agent.sh inside a sandbox', () => {
  it("refuses, and says why, when it is not told the instance's dsh folder", async () => {
    mkdirSync(join(REPO, '.cache'), { recursive: true })
    const dir = mkdtempSync(join(REPO, '.cache', 'run-agent-in-a-sandbox-'))
    made.push(dir)
    const bin = join(dir, 'bin')
    const home = join(dir, 'home')
    const worktree = join(dir, 'a-worktree')
    const brief = join(dir, 'the-brief.md')
    const log = join(dir, 'the-run.log')
    const reached = join(dir, 'nice-was-reached')
    for (const one of [bin, home, worktree]) mkdirSync(one, { recursive: true })
    writeFileSync(brief, 'a brief for the sandbox test\n')
    writeFileSync(join(bin, 'nice'), `#!/bin/sh\n: > '${reached}'\nexit 97\n`)
    chmodSync(join(bin, 'nice'), 0o755)

    const env: NodeJS.ProcessEnv = {
      ...withoutInheritedEffort(),
      HOME: home,
      SANDBOX_DIR: dir,
      PATH: `${bin}:${process.env['PATH'] ?? ''}`,
      MOLE_OFFICE_API: UNREACHABLE_API,
    }
    delete env['MOLE_OFFICE_DSH_DIR']

    const child = spawn('bash', [RUN_AGENT, worktree, brief, log, 'the-test-handle', 'the-test-session', 'default'], {
      cwd: REPO,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')))
    child.stdout?.resume()
    const code = await new Promise<number | null>((settled) => child.on('close', settled))

    expect(existsSync(reached), 'the script reached the line that starts dsh').toBe(false)
    expect(code).toBe(2)
    expect(stderr).toContain('MOLE_OFFICE_DSH_DIR is not set')
    expect(stderr).toContain(`${dir}/dsh`)
  })
})
