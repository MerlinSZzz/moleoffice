// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { syntheticDshReader } from './dsh-native-stand-in.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * run-agent.sh SOURCES nvm ONLY WHEN IT IS THERE.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS FILE IS WRITTEN AGAINST
 * ---------------------------------------------------------------------------------------
 *
 * `tools/dsh-hooks/run-agent.sh` used to run `. "$NVM_DIR/nvm.sh"` unconditionally. On this host
 * that file exists and always has, so nobody noticed it is not guarded. Sandbox v1 (SPEC.md P5)
 * runs this same script inside a container image that has no nvm at all — Node 22 is already on
 * PATH from the image — and sourcing a file that is not there makes bash print
 * "<path>/nvm.sh: No such file or directory" on stderr, once per run, because this script has no
 * `errexit` to stop it there. It is not fatal, but it is noise nobody asked for and a run that
 * looks slightly broken every single time it starts in a sandbox.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED, one case each
 * ---------------------------------------------------------------------------------------
 *
 *   - with no ~/.nvm at all (the sandbox shape): the run finishes, dsh still runs, and stderr says
 *     nothing about nvm.sh.
 *   - with ~/.nvm/nvm.sh present (the host shape): it is still sourced exactly as before — the
 *     fake dsh reads the environment variable the fake nvm.sh exports, and gets it — so nothing
 *     about the host's own behaviour changed.
 *
 * THE MUTATION THIS IS WRITTEN AGAINST, after a control run: put the unconditional
 * `. "$NVM_DIR/nvm.sh"` back in place of the `if [ -f ... ]` guard. The no-`.nvm` case then has
 * bash print the "No such file or directory" line on stderr, and the first case below goes red.
 * Restored byte for byte afterwards.
 *
 * NO /tmp ANYWHERE: every scratch directory is under this checkout's gitignored `.cache/`.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/+$/, '')
const RUN_AGENT = join(REPO, 'tools', 'dsh-hooks', 'run-agent.sh')

// AN OFFICE THAT NEVER ANSWERS, ON PURPOSE. keep-the-brief.mjs's own fetch fails in a few
// milliseconds against a closed loopback port, and its one failure sentence is unrelated to
// nvm — this file never sends a single byte to the live office's port.
const UNREACHABLE_API = 'http://127.0.0.1:9'

const made: string[] = []

/** A scratch directory under this checkout's gitignored `.cache/`, never under /tmp. */
function scratch(name: string): string {
  mkdirSync(join(REPO, '.cache'), { recursive: true })
  const dir = mkdtempSync(join(REPO, '.cache', `run-agent-nvm-${name}-`))
  made.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

interface Ran {
  code: number | null
  stderr: string
  stdout: string
  logText: string
  nvmMarker: string
}

/**
 * Run the real run-agent.sh against a fake dsh, with a HOME this test controls. When `withNvm` is
 * true, HOME holds a fake `.nvm/nvm.sh` that exports a marker; when false, HOME holds no `.nvm` at
 * all, the shape a sandbox image has.
 */
async function runTheRunner(withNvm: boolean): Promise<Ran> {
  const dir = scratch(withNvm ? 'present' : 'absent')
  const home = join(dir, 'home')
  const worktree = join(dir, 'a-worktree')
  const brief = join(dir, 'the-brief.md')
  const log = join(dir, 'the-run.log')
  const dshDir = join(dir, 'dsh')
  const bin = join(dshDir, 'npm', 'node_modules', '.bin')
  const fake = join(bin, 'dsh')
  const nvmMarkerFile = join(dir, 'nvm-marker')

  mkdirSync(home, { recursive: true })
  mkdirSync(worktree, { recursive: true })
  mkdirSync(bin, { recursive: true })
  mkdirSync(join(dshDir, 'home'), { recursive: true })
  writeFileSync(join(dshDir, 'env'), '')
  writeFileSync(brief, 'a brief for the nvm test\n')
  writeFileSync(nvmMarkerFile, '') // proof the fake dsh actually ran and looked

  if (withNvm) {
    mkdirSync(join(home, '.nvm'), { recursive: true })
    writeFileSync(join(home, '.nvm', 'nvm.sh'), '#!/usr/bin/env bash\nexport NVM_WAS_SOURCED="host-nvm-ran"\n')
  }

  // THE FAKE dsh WRITES WHAT IT SEES OF THE ENVIRONMENT nvm.sh WOULD HAVE SET, then exits at once
  // — this file does not need the process alive, only its one observation.
  writeFileSync(
    fake,
    ['#!/usr/bin/env bash', 'set -u', 'printf \'%s\' "${NVM_WAS_SOURCED:-}" > "$FAKE_NVM_MARKER_FILE"', 'exit 0', ''].join('\n'),
  )
  chmodSync(fake, 0o755)

  const env: NodeJS.ProcessEnv = {
    ...withoutInheritedEffort(),
    HOME: home,
    MOLE_OFFICE_AGENT_MODEL: 'deepseek-v4.1-flash',
    SANDBOX_DSH_NATIVE_READER: syntheticDshReader(dir),
    MOLE_OFFICE_DSH_DIR: dshDir,
    MOLE_OFFICE_API: UNREACHABLE_API,
    FAKE_NVM_MARKER_FILE: nvmMarkerFile,
  }
  // THE RUNNER IS RUN AS THE HOST RUNS IT, whoever runs this test. A test run an agent started inside a sandbox inherits the
  // launcher's SANDBOX_DIR, and run-agent.sh then refuses to start dsh without a key of its own there (problem
  // epOLxauSbzd9), so nothing this file is about would happen (message acFFnOkxrPSr: wave 13n's run of 29 September
  // 2026). tests/run-agent-takes-the-deepseek-key-from-its-environment.test.ts is about that refusal.
  delete env['SANDBOX_DIR']

  const child: ChildProcess = spawn('bash', [RUN_AGENT, worktree, brief, log, 'the-test-handle', 'the-test-session', 'default'], {
    cwd: REPO,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')))
  child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')))
  const code = await new Promise<number | null>((settled) => child.on('close', settled))

  return {
    code,
    stderr,
    stdout,
    logText: readFileSync(log, 'utf8'),
    nvmMarker: readFileSync(nvmMarkerFile, 'utf8'),
  }
}

describe('run-agent.sh sources nvm only when it is there', () => {
  it('with no ~/.nvm at all (the sandbox shape), the run finishes clean and says nothing about nvm.sh', async () => {
    const ran = await runTheRunner(false)
    expect(ran.stderr, `stderr mentions nvm.sh: ${ran.stderr}`).not.toContain('nvm.sh')
    expect(ran.stderr, `stderr mentions the missing file: ${ran.stderr}`).not.toContain('No such file or directory')
    expect(ran.code, ran.stderr).toBe(0)
    // THE RUN STILL DID ITS WORK: the fake dsh ran (there is no NVM_WAS_SOURCED to have set, so it
    // is empty), and the runner's own log line is there.
    expect(ran.nvmMarker).toBe('')
    expect(ran.logText).toContain('dsh agent pid')
  })

  it('with ~/.nvm/nvm.sh present (the host shape), it is still sourced exactly as before', async () => {
    const ran = await runTheRunner(true)
    expect(ran.stderr, `stderr mentions the missing file even though nvm.sh exists: ${ran.stderr}`).not.toContain('No such file or directory')
    expect(ran.code, ran.stderr).toBe(0)
    // THE FAKE dsh SAW THE VARIABLE THE FAKE nvm.sh EXPORTS, so sourcing genuinely happened and
    // reached the process that matters — not merely "no error was printed".
    expect(ran.nvmMarker).toBe('host-nvm-ran')
  })
})
