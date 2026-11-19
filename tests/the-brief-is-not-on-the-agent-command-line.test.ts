// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { syntheticDshReader } from './dsh-native-stand-in.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * THE BRIEF GOES TO THE AGENT BY PATH, SO NOBODY'S `ps` PRINTS IT.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS FILE IS WRITTEN AGAINST
 * ---------------------------------------------------------------------------------------
 *
 * Until 16 September 2026 `tools/dsh-hooks/run-agent.sh` handed the brief to dsh as one argv
 * element — `dsh --profile office "$(cat "$BRIEF")"` — so `ps`, `pgrep -a` and every process list on
 * the machine printed several thousand characters of every agent's brief. One agent dumped two briefs
 * into its own context in one turn (problem `Kosaa7dI_RGc`, message `1DnWGm_oCuHH`). The one-shot
 * dsh app takes its task as the command line itself (its `--help` says "the task text; multiple
 * words are joined by spaces"), so the fix cannot hand dsh the text at all: the runner passes the
 * brief's PATH as the task, and `tools/dsh-hooks/brief-by-path.patch.yml` — passed on dsh's command
 * line with `--patch` — reads that file whole, once, including its last line.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED, one case each
 * ---------------------------------------------------------------------------------------
 *
 *   - a runner started with a brief file has NO BRIEF TEXT on its command line: the test starts the
 *     real `run-agent.sh` with a fake dsh (`MOLE_OFFICE_DSH_DIR` points at a scratch install) and
 *     reads `/proc/<the fake dsh's pid>/cmdline` while the fake is alive;
 *   - the agent still receives the WHOLE brief, including a last line with no trailing newline: the
 *     fake dsh writes the file its task names, byte for byte;
 *   - the first line still names the pid, the process group and the cwd, and the log carries it.
 *
 * THE FAKE dsh IS THE CONTRACT, NOT A COPY OF THE PATCH: it does exactly what
 * `brief-by-path.patch.yml` does with the task — reads the file the task names — and nothing else.
 * The patch's own expression was measured against the real dsh before this file was written; this
 * file is about the runner's command line, which is where the defect was.
 *
 * THE MUTATION THIS IS WRITTEN AGAINST, after a control run: put the brief text back on the command
 * line (`"$(cat "$BRIEF")"` in place of the `--patch` and the path) and the cmdline case goes red,
 * because the marker is then in `/proc/<pid>/cmdline`. Restored byte for byte afterwards.
 *
 * NO /tmp ANYWHERE: every scratch directory is under this checkout's gitignored `.cache/`, so seven
 * other workers' scratch directories under /tmp are never touched.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/+$/, '')
const RUN_AGENT = join(REPO, 'tools', 'dsh-hooks', 'run-agent.sh')
const OVERLAY = join(REPO, 'tools', 'dsh-hooks', 'brief-by-path.patch.yml')

/** The one string that must never reach a command line. It is in the brief TEXT, not its name. */
const MARKER = 'MARKER-the-brief-text-that-must-not-be-in-ps-9c1f'
const LAST_LINE = 'this last line has no trailing newline'
const BRIEF_TEXT = `${MARKER}\nthe brief's first body line\nthe brief's second body line\n${LAST_LINE}`

let server: Server
let api = ''
const made: string[] = []

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.method === 'GET' && request.url?.startsWith('/api/office/run-models/for/')) {
      // The runner now asks for effort before handing the brief to the program. This fixture has none.
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ model: null, effort: null, effortFrom: 'none' }))
      return
    }
    // keep-the-brief.mjs posts the note and the link; the fake office only has to answer 201 in the
    // shape the hook reads (`body.record.id`), so the hook does not print its one failure sentence.
    request.resume()
    request.on('end', () => {
      response.writeHead(201, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ record: { id: 'note-from-the-brief-by-path-test' } }))
    })
  })
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready))
  api = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
})

afterAll(async () => {
  await new Promise<void>((closed) => server.close(() => closed()))
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A scratch directory under this checkout's gitignored `.cache/`, never under /tmp. */
function scratch(): string {
  mkdirSync(join(REPO, '.cache'), { recursive: true })
  const dir = mkdtempSync(join(REPO, '.cache', 'brief-by-path-'))
  made.push(dir)
  return dir
}

/** Wait for a condition, or give up; used only for reading a file a child is about to write. */
async function waitFor(what: string, ready: () => boolean, ms = 8_000): Promise<void> {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (ready()) return
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error(`timed out waiting for ${what}`)
}

interface Ran {
  code: number | null
  stdout: string
  stderr: string
  cmdline: string
  argv: string
  received: string
  firstLine: string
  logFirstLine: string
  worktree: string
  brief: string
  patch: string
}

/**
 * Start the real run-agent.sh against a fake dsh, and read back everything a person would want to
 * check. The fake dsh writes its own pid, its argv and the file its task names, then waits to be
 * released, so the test can read `/proc/<pid>/cmdline` while it is still the process it describes.
 */
async function runTheRunner(): Promise<Ran> {
  const dir = scratch()
  const worktree = join(dir, 'a-worktree')
  const brief = join(dir, 'the-brief.md')
  const log = join(dir, 'the-run.log')
  const patch = OVERLAY
  const dshDir = join(dir, 'dsh')
  const bin = join(dshDir, 'npm', 'node_modules', '.bin')
  const fake = join(bin, 'dsh')
  const pidFile = join(dir, 'fake-dsh.pid')
  const argvFile = join(dir, 'fake-dsh.argv')
  const receivedFile = join(dir, 'fake-dsh.received')
  const releaseFile = join(dir, 'fake-dsh.release')

  mkdirSync(worktree, { recursive: true })
  mkdirSync(bin, { recursive: true })
  writeFileSync(brief, BRIEF_TEXT)
  writeFileSync(
    fake,
    [
      '#!/usr/bin/env bash',
      '# A fake dsh: the contract is the task names a file and the file is the brief, whole.',
      'set -u',
      'printf \'%s\' "$$" > "$FAKE_DSH_PID_FILE"',
      'printf \'%s\' "$*" > "$FAKE_DSH_ARGV_FILE"',
      'BRIEF_PATH="${!#}"',
      'cat "$BRIEF_PATH" > "$FAKE_DSH_BRIEF_FILE"',
      'while [ ! -e "$FAKE_DSH_RELEASE_FILE" ]; do sleep 0.02; done',
      'exit 0',
      '',
    ].join('\n'),
  )
  chmodSync(fake, 0o755)

  const env: NodeJS.ProcessEnv = {
    ...withoutInheritedEffort(),
    MOLE_OFFICE_DSH_DIR: dshDir,
    SANDBOX_DSH_NATIVE_READER: syntheticDshReader(dir),
    MOLE_OFFICE_API: api,
    MOLE_OFFICE_AGENT_MODEL: 'deepseek-v4.1-flash',
    FAKE_DSH_PID_FILE: pidFile,
    FAKE_DSH_ARGV_FILE: argvFile,
    FAKE_DSH_BRIEF_FILE: receivedFile,
    FAKE_DSH_RELEASE_FILE: releaseFile,
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

  // THE FAKE'S PID, WRITTEN BEFORE IT READS ANYTHING, so the command line is read while the process
  // still exists and still describes this invocation.
  await waitFor('the fake dsh pid file', () => existsSync(pidFile))
  const pid = Number(readFileSync(pidFile, 'utf8'))
  const cmdline = readFileSync(`/proc/${String(pid)}/cmdline`, 'utf8').split('\0').filter((one) => one !== '').join(' ')

  await waitFor('the fake dsh to write the brief it was handed', () => existsSync(receivedFile))
  const received = readFileSync(receivedFile, 'utf8')
  const argv = readFileSync(argvFile, 'utf8')

  writeFileSync(releaseFile, 'go')
  const code = await new Promise<number | null>((settled) => child.on('close', settled))

  const firstLine = stdout.split('\n')[0] ?? ''
  const logFirstLine = readFileSync(log, 'utf8').split('\n')[0] ?? ''
  return { code, stdout, stderr, cmdline, argv, received, firstLine, logFirstLine, worktree, brief, patch }
}

describe('the runner hands dsh the brief by path, and the agent still gets the whole brief', () => {
  it('shows no brief text on the dsh command line, and names the brief file instead', async () => {
    const ran = await runTheRunner()
    expect(ran.stderr).not.toContain(MARKER)
    expect(ran.cmdline, `the brief text is on the command line: ${ran.cmdline}`).not.toContain(MARKER)
    // THE COMMAND LINE STILL NAMES THE THINGS A PERSON NEEDS TO TELL RUNS APART.
    expect(ran.cmdline).toContain(ran.patch)
    expect(ran.cmdline).toContain(ran.brief)
    expect(ran.argv).toContain(`--profile office --patch ${ran.patch} --patch `)
    expect(ran.argv.endsWith(' ' + ran.brief)).toBe(true)
  })

  it('still delivers the whole brief to the agent, last line and all', async () => {
    const ran = await runTheRunner()
    expect(ran.received).toBe(BRIEF_TEXT)
    expect(ran.received.endsWith(LAST_LINE)).toBe(true)
    expect(ran.received).toContain(MARKER)
    expect(ran.code, ran.stderr).toBe(0)
  })

  it('prints the pid, the process group and the cwd on its first line, and logs it', async () => {
    const ran = await runTheRunner()
    // The first line now also carries the effort reminder. Pin its exact words after the same process fields.
    expect(ran.firstLine).toMatch(
      new RegExp(`^dsh agent pid \\d+ pgid \\d+ cwd ${ran.worktree.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} handle the-test-handle session the-test-session workspace default started \\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}; no Office effort selected; native settings apply; fast mode off; headless DSH starts a fresh native session; Office ancestry is not native resume$`),
    )
    const pid = Number(/^dsh agent pid (\d+) pgid (\d+) /.exec(ran.firstLine)?.[1])
    const pgid = Number(/^dsh agent pid (\d+) pgid (\d+) /.exec(ran.firstLine)?.[2])
    expect(pid).toBeGreaterThan(0)
    expect(pgid).toBe(pid)
    expect(ran.logFirstLine).toBe(`=== ${ran.firstLine}`)
  })
})

