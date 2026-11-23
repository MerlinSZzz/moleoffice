// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * THE MAIN-WORLD GUARD IS MOUNTED ON EVERY RUN THE OFFICE STARTS, AND THE MARKER SAYS SO.
 *
 * One guard, mounted into every runtime's pre-execution hook, and a runtime in the main world runs
 * with full permissions only when the guard is mounted. This file pins
 * mounting, runtime by runtime, from the command each adapter actually builds:
 *
 *   Claude Code  `--settings` with a PreToolUse hook that runs the guard for the run's agent;
 *   Codex        `-c hooks.PreToolUse=[…]` and `--dangerously-bypass-hook-trust`, fresh and resumed;
 *   OpenCode     the guard plugin in `OPENCODE_CONFIG_CONTENT` and the guard's command in
 *                `MOLE_GUARD_COMMAND` (THE_GUARD_COMMAND), which reach the process because
 *                `startRun` hands an adapter's environment to `envFor`;
 *   dsh          a PreToolUse entry in tools/dsh-hooks/hooks.json.
 *
 * It also runs the hook exactly as each runtime is told to — the settings' command string through a
 * shell, the Codex command string out of its TOML, the OpenCode plugin called as OpenCode calls it —
 * so a quoting mistake in the mounting is caught here and not on a real run. And it pins the marker,
 * `theGuardOn`, which reads a command back and is what the permission flags are set by: true for
 * each mounted command, false for a bare one.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each after a control run, each restored after
 * ---------------------------------------------------------------------------------------
 *
 *   drop `args.push(...claudeCodeGuard(run.agent))` from claude-code.ts   → the Claude Code case is red.
 *   drop `...codexGuard(run.agent)` from the fresh Codex argv            → the Codex case is red.
 *   `startRun` stops handing the adapter's `env` to `envFor`             → the OpenCode environment case is red.
 *   drop the PreToolUse entry from tools/dsh-hooks/hooks.json             → the dsh case is red.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  THE_GUARD,
  THE_GUARD_COMMAND,
  THE_OPENCODE_PLUGIN,
  theDshHooksCarryTheGuard,
  theGuardOn,
} from '../src/config/main-world-guard.mjs'
import { backupsDirectoryFrom, databasePathFrom, keysPathFrom, mergedEnvironment } from '../src/config/settings.mjs'
import type { RunRequest } from '../src/worker/runtimes/adapter.ts'
import { ClaudeCodeAdapter } from '../src/worker/runtimes/claude-code.ts'
import { CodexAdapter } from '../src/worker/runtimes/codex.ts'
import { runIsAlive, startRun } from '../src/worker/runtimes/common.ts'
import { OpenCodeAdapter } from '../src/worker/runtimes/opencode.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/+$/, '')

let dir = ''

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'guard-mounted-'))
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

function ask(prompt: string, extra: Partial<RunRequest> = {}): RunRequest {
  return {
    session: 'a-session-id',
    agent: 'builder-x',
    prompt,
    cwd: dir,
    api: 'http://127.0.0.1:9',
    workspace: 'panelx',
    outputPath: join(dir, 'run.out'),
    ...extra,
  }
}

/** A payload that the guard stops by rule 1 alone, with no office: a delete of an unset variable. */
const EMPTY_DELETE = { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'rm -rf "$GUARD_PROBE_NEVER_SET"' }, cwd: '/tmp' }
const HARMLESS = { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls -la' }, cwd: '/tmp' }

/** Run a hook command string through a shell, as Claude Code and Codex do, with one payload. */
function throughAShell(command: string, payload: unknown): { status: number | null; stderr: string } {
  const env = { ...withoutInheritedEffort(), MOLE_OFFICE_API: 'http://127.0.0.1:9' } as Record<string, string>
  delete env['GUARD_PROBE_NEVER_SET']
  // A PLAIN MACHINE. The suite runs inside an office sandbox, where the guard stands down because
  // the container is the wall. `SANDBOX_DIR` is the office's one fact for "a sandbox started this
  // process", so removing it is what makes the hook answer as it does on the host.
  delete env['SANDBOX_DIR']
  const ran = spawnSync('sh', ['-c', command], { input: JSON.stringify(payload), encoding: 'utf8', env, timeout: 20_000 })
  return { status: ran.status, stderr: ran.stderr }
}

describe('Claude Code', () => {
  it('is given --settings with a PreToolUse hook that runs the guard for the run’s agent', () => {
    const command = new ClaudeCodeAdapter({ MOLE_OFFICE_AGENT_MODEL: 'a-named-model' }).commandFor(ask('say hello'))
    const at = command.args.indexOf('--settings')
    expect(at, 'no --settings on the command line').toBeGreaterThan(-1)
    const settings = JSON.parse(command.args[at + 1] ?? '') as { hooks: { PreToolUse: { matcher: string; hooks: { type: string; command: string; timeout: number }[] }[] } }
    const hook = settings.hooks.PreToolUse[0]?.hooks[0]
    expect(settings.hooks.PreToolUse[0]?.matcher).toBe('*')
    expect(hook?.type).toBe('command')
    expect(hook?.command).toContain(THE_GUARD)
    expect(hook?.command).toContain(`'--agent' 'builder-x'`)
    expect(theGuardOn('claude-code', command)).toMatchObject({ mounted: true })
    // THE COMMAND STRING RUNS AS WRITTEN, through a shell, and the guard answers.
    expect(throughAShell(hook?.command ?? '', EMPTY_DELETE).status).toBe(2)
    expect(throughAShell(hook?.command ?? '', HARMLESS).status).toBe(0)
  })

  it('keeps --resume last, after the guard', () => {
    const again = new ClaudeCodeAdapter().commandFor(ask('say hello', { resume: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }))
    expect(again.args.slice(-2)).toEqual(['--resume', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'])
    expect(theGuardOn('claude-code', again).mounted).toBe(true)
  })
})

describe('Codex', () => {
  it('is given the guard as a PreToolUse hook, and told to run it, fresh and resumed', () => {
    for (const run of [ask('say hello'), ask('say hello', { resume: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' })]) {
      const command = new CodexAdapter().commandFor(run)
      expect(theGuardOn('codex', command), JSON.stringify(command.args)).toMatchObject({ mounted: true })
      // THE PROMPT GOES ON STANDARD INPUT, so the command names the word that tells Codex to read it there.
      expect(command.args.at(-1)).toBe('-')
      expect(command.stdin).toBe('say hello')
      const toml = command.args.find((a) => a.startsWith('hooks.PreToolUse=')) ?? ''
      const quoted = /command=("(?:[^"\\]|\\.)*")/.exec(toml)?.[1] ?? '""'
      const hookCommand = JSON.parse(quoted) as string
      expect(hookCommand).toContain(THE_GUARD)
      expect(throughAShell(hookCommand, EMPTY_DELETE).status).toBe(2)
    }
  })

  it('is not counted as mounted when Codex would not run the hook', () => {
    const args = new CodexAdapter().commandFor(ask('say hello')).args.filter((a) => a !== '--dangerously-bypass-hook-trust')
    expect(theGuardOn('codex', { args }).mounted).toBe(false)
  })
})

describe('OpenCode', () => {
  it('is given the guard plugin and the guard’s command in its environment, with its argv unchanged', () => {
    const command = new OpenCodeAdapter({}).commandFor(ask('say hello'))
    expect(command.args).toEqual(['run', '--format', 'json', '--dir', dir, 'say hello'])
    const config = JSON.parse(command.env?.['OPENCODE_CONFIG_CONTENT'] ?? '{}') as { plugin: string[] }
    expect(config.plugin).toEqual([pathToFileURL(THE_OPENCODE_PLUGIN).href])
    expect(existsSync(THE_OPENCODE_PLUGIN)).toBe(true)
    // The office's own paths go on the command line, because the run's environment carries no setting.
    const office = mergedEnvironment(process.env)
    expect(JSON.parse(command.env?.[THE_GUARD_COMMAND] ?? '[]')).toEqual([
      process.execPath, THE_GUARD, '--agent', 'builder-x',
      '--database', databasePathFrom(office), '--keys', keysPathFrom(office), '--backups', backupsDirectoryFrom(office),
    ])
    expect(theGuardOn('opencode', command)).toMatchObject({ mounted: true })
  })

  it('has its environment reach the process, because startRun adds it', async () => {
    // A STAND-IN ADAPTER whose one command prints the variable the OpenCode adapter sets.
    const outputPath = join(dir, 'env.out')
    const handle = startRun(
      { runtime: 'probe', commandFor: () => ({ command: 'sh', args: ['-c', `printf %s "$${THE_GUARD_COMMAND}"`], env: { [THE_GUARD_COMMAND]: 'carried' } }) },
      { cwd: dir, api: 'http://127.0.0.1:9', workspace: 'panelx', outputPath },
      process.env,
    )
    for (let i = 0; i < 100 && runIsAlive(handle); i += 1) await new Promise((done) => setTimeout(done, 50))
    expect(readFileSync(outputPath, 'utf8')).toBe('carried')
  })

  it('stops a call through the plugin, called as OpenCode calls it', async () => {
    const saved = process.env[THE_GUARD_COMMAND]
    const savedSandbox = process.env['SANDBOX_DIR']
    process.env[THE_GUARD_COMMAND] = JSON.stringify([process.execPath, THE_GUARD, '--agent', 'builder-x'])
    delete process.env['GUARD_PROBE_NEVER_SET']
    // The plugin hands the hook its own environment, so the process must look like the host for
    // the guard to judge the call. See `throughAShell` above.
    delete process.env['SANDBOX_DIR']
    try {
      const module = (await import(pathToFileURL(THE_OPENCODE_PLUGIN).href)) as Record<string, unknown>
      expect(Object.keys(module), 'OpenCode calls every export as a plugin').toEqual(['MoleOfficeMainWorldGuard'])
      const plugin = module['MoleOfficeMainWorldGuard'] as (ctx: { directory: string }) => Promise<Record<string, (input: unknown, output: unknown) => Promise<void>>>
      const hooks = await plugin({ directory: '/tmp' })
      const before = hooks['tool.execute.before']
      await expect(before?.({ tool: 'bash' }, { args: { command: 'rm -rf "$GUARD_PROBE_NEVER_SET"' } })).rejects.toThrow(/empty or unset/)
      await expect(before?.({ tool: 'bash' }, { args: { command: 'ls -la' } })).resolves.toBeUndefined()
    } finally {
      if (saved === undefined) delete process.env[THE_GUARD_COMMAND]
      else process.env[THE_GUARD_COMMAND] = saved
      if (savedSandbox === undefined) delete process.env['SANDBOX_DIR']
      else process.env['SANDBOX_DIR'] = savedSandbox
    }
  })
})

describe('dsh', () => {
  it('has the guard in the hooks file the office profile mounts', () => {
    expect(theDshHooksCarryTheGuard()).toMatchObject({ mounted: true })
    expect(theGuardOn('dsh', { args: [] }).mounted).toBe(true)
    const config = JSON.parse(readFileSync(join(REPO, 'tools', 'dsh-hooks', 'hooks.json'), 'utf8')) as {
      hooks: Record<string, { matcher?: string; hooks: { command: string; timeout: number }[] }[]>
    }
    const entry = config.hooks['PreToolUse']?.[0]
    expect(entry?.matcher).toBe('')
    expect(entry?.hooks[0]?.command).toBe('node ${CLAUDE_PLUGIN_ROOT}/for-agents/main-world-guard.mjs')
  })

  it('says it is not mounted when a hooks file has no such entry', () => {
    const bare = join(dir, 'hooks.json')
    writeFileSync(bare, JSON.stringify({ hooks: { PostToolUse: [{ matcher: '', hooks: [{ type: 'command', command: 'node x.mjs' }] }] } }))
    expect(theDshHooksCarryTheGuard(bare).mounted).toBe(false)
  })
})

describe('the marker', () => {
  it('is false for a bare command and for a runtime nobody wired', () => {
    expect(theGuardOn('claude-code', { args: ['-p', 'say hello'] }).mounted).toBe(false)
    expect(theGuardOn('codex', { args: ['exec', 'say hello'] }).mounted).toBe(false)
    expect(theGuardOn('opencode', { args: ['run'], env: {} }).mounted).toBe(false)
    expect(theGuardOn('kimi', { args: [] })).toMatchObject({ mounted: false, because: expect.stringContaining('No guard is wired') })
  })
})
