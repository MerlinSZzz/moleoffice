// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TOOL RUNS WITH ITS FULL PERMISSIONS ONLY IN A SANDBOX, OR ON THE HOST BEHIND THE GUARD.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO DECISIONS THIS PINS
 * ---------------------------------------------------------------------------------------
 *
 * On 22 September 2026 a decision said that inside a sandbox, Claude Code, Codex, OpenCode and dsh run with their
 * full permissions, because the container is the wall. A second decision the same day said: on the
 * host, only when the main-world guard is mounted into the tool; otherwise the tool's own default, and nothing
 * added.
 * Before them a Claude Code run carried no permission flag anywhere, and
 * `tools/dsh-hooks/run-agent.sh` gave every dsh run `danger-full-access`, on the host as well.
 *
 * The rule is worked out in one place, src/config/run-permissions.mjs, and applied in four: the
 * Claude Code, Codex and OpenCode adapters, run-agent.sh for dsh, and tools/sandbox-start.mjs for a
 * command line somebody else wrote. The Claude Code half of the adapters is pinned in
 * tests/one-interface-for-every-agent-tool.test.ts, where the old rule was; the rest is here, one
 * tool at a time. The end-to-end half of sandbox-start is in tests/sandbox-launcher.test.ts.
 *
 * "BEHIND THE GUARD" IS READ OFF THE COMMAND ITSELF, by `theGuardOn` in
 * src/config/main-world-guard.mjs: the guard's `--settings` hook for Claude Code, its `-c` hook and
 * `--dangerously-bypass-hook-trust` for Codex, its plugin in the environment for OpenCode, and the
 * PreToolUse entry in tools/dsh-hooks/hooks.json for dsh. The adapters mount the guard on every run,
 * so every run they build on the host is behind it; the half without the guard is the rule asked
 * about a command that does not carry it. Until the bootstrap batch was put together (22 September
 * 2026) this file read the guard from a `MOLE_OFFICE_GUARD` list that a launcher was to set, and
 * that nothing set; the guard piece used the same name for something else.
 *
 * EVERY ENVIRONMENT IS BUILT HERE, never read off the machine, because the suite also runs inside a
 * sandbox (the merge queue's), where SANDBOX_DIR is set for everything.
 *
 * THE MUTATIONS THIS IS WRITTEN AGAINST are listed in this piece's handback, with the red each one
 * gave. NO /tmp: every scratch folder is under this checkout's gitignored `.cache/`.
 */
import { syntheticDshReader } from './dsh-native-stand-in.ts'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { spawn, type ChildProcess } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  FULL_PERMISSIONS,
  RUNTIMES_WITH_A_FULL_FORM,
  aCommandsPermissions,
  aCodexContainerCommand,
  aCommandsOfficeTool,
  aCommandsProgram,
  aRuntimeIsCodex,
  thePermissionsARunGets,
} from '../src/config/run-permissions.mjs'
import { THE_GUARD, THE_GUARD_COMMAND, claudeCodeGuard, codexGuard, openCodeGuard, theGuardOn } from '../src/config/main-world-guard.mjs'
import { envFor, type RunRequest } from '../src/worker/runtimes/adapter.ts'
import { CodexAdapter } from '../src/worker/runtimes/codex.ts'
import { OpenCodeAdapter } from '../src/worker/runtimes/opencode.ts'
import { whatACopyOfSettingsCarries } from './what-a-copy-of-settings-carries.ts'
import { walkFrom } from '../src/config/import-graph.mjs'
import { DSH_PATCH_IN_A_CHECKOUT } from '../tools/harness-features-off.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/+$/, '')
const RUN_AGENT = join(REPO, 'tools', 'dsh-hooks', 'run-agent.sh')

/** The rule's answer for a command, with the guard read off that command. */
function forTheCommand(runtime: string, env: Record<string, string>, command: { args: string[]; env?: Record<string, string> }) {
  return thePermissionsARunGets(runtime, env, theGuardOn(runtime, command))
}

/** A sandbox's instance folder, as sandbox-start sets it. Nothing is read from it. */
const A_SANDBOX = `${THE_TEST_FIXTURE_ROOT}/.cache/mole-office/sandboxes/one`
/** OpenCode's full permissions: bash, edit and webfetch allowed. */
const OPENCODE_FULL = '{"bash":"allow","edit":"allow","webfetch":"allow"}'
/** An office that never answers, so keep-the-brief.mjs fails fast and nothing reaches the live one. */
const UNREACHABLE_API = 'http://127.0.0.1:9'

/**
 * The environment this process runs in, without any of the four things this file sets on purpose:
 * where the run is, the guard's command for OpenCode, and the two permission variables. Inside a sandbox the
 * suite inherits SANDBOX_DIR, and a case about the host must not.
 */
function theHostWithout(): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {}
  const leftOut = ['SANDBOX_DIR', THE_GUARD_COMMAND, 'DSH_PERMISSION_MODE', 'OPENCODE_PERMISSION']
  for (const [key, value] of Object.entries(process.env)) if (!leftOut.includes(key)) out[key] = value
  return out
}

let dir = ''
beforeAll(() => {
  mkdirSync(join(REPO, '.cache'), { recursive: true })
  dir = mkdtempSync(join(REPO, '.cache', 'full-permissions-'))
})
afterAll(() => {
  if (dir !== '') rmSync(dir, { recursive: true, force: true })
})

let n = 0
function ask(prompt: string, extra: Partial<RunRequest> = {}): RunRequest {
  n += 1
  return {
    session: `a-session-${String(n)}`,
    agent: 'builder-x',
    prompt,
    cwd: dir,
    api: 'http://127.0.0.1:29999',
    workspace: 'panelx',
    outputPath: join(dir, `run-${String(n)}.out`),
    ...extra,
  }
}

// ============================================================================ the rule itself

describe('the rule, in the one place it is worked out', () => {
  it('gives each of the four tools its full form in a sandbox, and adds nothing on the host without the guard', () => {
    expect(RUNTIMES_WITH_A_FULL_FORM).toEqual(['claude-code', 'codex', 'opencode', 'dsh'])
    for (const runtime of RUNTIMES_WITH_A_FULL_FORM) {
      const host = thePermissionsARunGets(runtime, {})
      expect(host.full, runtime).toBe(false)
      expect(host.args, runtime).toEqual([])
      expect(host.env, runtime).toEqual({})
      expect(host.because, runtime).toContain('guard is not mounted')

      const sandboxed = thePermissionsARunGets(runtime, { SANDBOX_DIR: A_SANDBOX })
      expect(sandboxed.full, runtime).toBe(true)
      expect(sandboxed.args, runtime).toEqual([...FULL_PERMISSIONS[runtime]!.args])
      expect(sandboxed.env, runtime).toEqual({ ...FULL_PERMISSIONS[runtime]!.env })
      expect(sandboxed.because, runtime).toContain('because it is in a sandbox')
    }
    // THE WORDS, as measured on 22 September 2026 against the installed tools.
    expect(FULL_PERMISSIONS['claude-code']!.args).toEqual(['--permission-mode', 'bypassPermissions'])
    expect(FULL_PERMISSIONS['codex']!.args).toEqual(['-s', 'danger-full-access', '-a', 'never'])
    expect(FULL_PERMISSIONS['opencode']!.env).toEqual({ OPENCODE_PERMISSION: OPENCODE_FULL })
    expect(FULL_PERMISSIONS['dsh']!.env).toEqual({ DSH_PERMISSION_MODE: 'danger-full-access' })
  })

  it('widens a tool on the host only when its command carries the guard, mounted the way that tool mounts it', () => {
    const claude = forTheCommand('claude-code', {}, { args: ['-p', 'x', ...claudeCodeGuard('builder-x')] })
    expect(claude.full).toBe(true)
    expect(claude.args).toEqual([...FULL_PERMISSIONS['claude-code']!.args])
    expect(claude.because).toContain('because the main-world guard is mounted into it')
    expect(forTheCommand('codex', {}, { args: ['exec', ...codexGuard('builder-x'), 'x'] }).full).toBe(true)
    expect(forTheCommand('opencode', {}, { args: ['run'], env: openCodeGuard('builder-x') }).full).toBe(true)
    // ANOTHER TOOL'S WAY OF MOUNTING IT IS NOT THIS TOOL'S GUARD.
    expect(forTheCommand('codex', {}, { args: ['exec', ...claudeCodeGuard('builder-x'), 'x'] }).full).toBe(false)
    expect(forTheCommand('claude-code', {}, { args: ['-p', 'x', ...codexGuard('builder-x')] }).full).toBe(false)
    // HALF A MOUNT IS NO MOUNT: a hook Codex would not run, a plugin not told how to run the guard.
    const untrusted = codexGuard('builder-x').filter((a) => a !== '--dangerously-bypass-hook-trust')
    expect(forTheCommand('codex', {}, { args: ['exec', ...untrusted, 'x'] }).full).toBe(false)
    const pluginOnly = { OPENCODE_CONFIG_CONTENT: openCodeGuard('builder-x')['OPENCODE_CONFIG_CONTENT'] ?? '' }
    const half = forTheCommand('opencode', {}, { args: ['run'], env: pluginOnly })
    expect(half.full).toBe(false)
    expect(half.because).toContain('does not say how to run the guard')
    // dsh's guard is the hooks file its office profile mounts, which this checkout's does.
    expect(thePermissionsARunGets('dsh', {}, theGuardOn('dsh', { args: [] })).full).toBe(true)
  })

  it('refuses a sandbox claim it cannot read, and takes no guard claim from the environment at all', () => {
    expect(() => thePermissionsARunGets('dsh', { SANDBOX_DIR: 'a/relative/folder' })).toThrow(/absolute path/)
    expect(() => thePermissionsARunGets('dsh', { SANDBOX_DIR: '' })).toThrow(/absolute path/)
    // THE OLD MARKER IS NOT A DOOR: a variable that says the guard is mounted widens nothing.
    for (const runtime of RUNTIMES_WITH_A_FULL_FORM) {
      expect(thePermissionsARunGets(runtime, { MOLE_OFFICE_GUARD: runtime }).full, runtime).toBe(false)
    }
  })

  it('takes out a full-permission value the host environment carried in, and leaves a narrower one alone', () => {
    const inherited = thePermissionsARunGets('dsh', { DSH_PERMISSION_MODE: 'danger-full-access' })
    expect(inherited.full).toBe(false)
    expect(inherited.env).toEqual({ DSH_PERMISSION_MODE: null })
    expect(inherited.because).toContain('taken out')
    expect(thePermissionsARunGets('dsh', { DSH_PERMISSION_MODE: 'read-only' }).env).toEqual({})
    expect(thePermissionsARunGets('opencode', { OPENCODE_PERMISSION: OPENCODE_FULL }).env).toEqual({ OPENCODE_PERMISSION: null })
  })
})

// ============================================================================ Codex

describe('Codex', () => {
  it('takes -s danger-full-access -a never before exec, for a new run and a resumed one, only in a sandbox or behind the guard', () => {
    const resume = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    // THE RULE FOR A CODEX COMMAND WITHOUT THE GUARD: Codex's own default, nothing added.
    expect(forTheCommand('codex', {}, { args: ['exec', '--json', 'say hello'] }).args).toEqual([])

    // IN A SANDBOX, AND ON THE HOST, WHERE THE ADAPTER MOUNTS THE GUARD: before `exec`, where Codex takes
    // them for both (`codex exec resume` has no -s and no -a of its own): 0.155.1, the host's, and 0.159.2,
    // the dev image's since 30 September 2026, each checked with a value it refuses.
    for (const env of [{ SANDBOX_DIR: A_SANDBOX }, {}]) {
      const adapter = new CodexAdapter(env)
      const fresh = adapter.commandFor(ask('say hello'))
      expect(theGuardOn('codex', fresh).mounted).toBe(true)
      expect(fresh.args.slice(0, 5)).toEqual(['-s', 'danger-full-access', '-a', 'never', 'exec'])
      expect(adapter.commandFor(ask('say hello', { resume })).args.slice(0, 7)).toEqual([
        '-s', 'danger-full-access', '-a', 'never', 'exec', 'resume', resume,
      ])
      // THE PROMPT GOES ON STANDARD INPUT, so the command names the word that tells Codex to read it there.
      expect(fresh.args.at(-1)).toBe('-')
      expect(fresh.stdin).toBe('say hello')
    }
  })
})

// ============================================================================ OpenCode

describe('OpenCode', () => {
  it('puts OPENCODE_PERMISSION beside the guard in the run’s environment, and leaves its command line alone', () => {
    const run = ask('say hello')
    const host = new OpenCodeAdapter({}).commandFor(run)
    const sandboxed = new OpenCodeAdapter({ SANDBOX_DIR: A_SANDBOX }).commandFor(run)
    expect(theGuardOn('opencode', host).mounted).toBe(true)
    expect(host.env).toEqual({ ...openCodeGuard('builder-x'), OPENCODE_PERMISSION: OPENCODE_FULL })
    expect(sandboxed.env).toEqual({ ...openCodeGuard('builder-x'), OPENCODE_PERMISSION: OPENCODE_FULL })
    expect(sandboxed.args).toEqual(host.args)
    // THE RULE FOR AN OPENCODE RUN WITHOUT THE GUARD: nothing added, and an inherited full value out.
    expect(forTheCommand('opencode', {}, { args: ['run'], env: {} }).env).toEqual({})
    expect(forTheCommand('opencode', { OPENCODE_PERMISSION: OPENCODE_FULL }, { args: ['run'], env: {} }).env).toEqual({ OPENCODE_PERMISSION: null })
  })

  it('hands the permission and the guard’s command to the program it starts, and envFor takes out what it is told to', async () => {
    // A PROGRAM CALLED `opencode` THAT IS NOT OPENCODE: it writes down the two variables and stops.
    const bin = join(dir, 'stand-in-bin')
    mkdirSync(bin, { recursive: true })
    writeFileSync(join(bin, 'opencode'), `#!/bin/sh\necho "PERM<\${OPENCODE_PERMISSION-unset}>"\necho "GUARD<\${${THE_GUARD_COMMAND}-unset}>"\n`)
    chmodSync(join(bin, 'opencode'), 0o755)
    const PATH = `${bin}:/usr/bin:/bin`

    const saidBy = async (env: NodeJS.ProcessEnv): Promise<string> => {
      const adapter = new OpenCodeAdapter(env)
      const run = ask('say hello')
    const handle = await adapter.start(run)
      const deadline = Date.now() + 10_000
      while (adapter.alive(handle) && Date.now() < deadline) await new Promise((go) => setTimeout(go, 25))
      return readFileSync(run.outputPath, 'utf8')
    }
    for (const env of [{ PATH, SANDBOX_DIR: A_SANDBOX }, { PATH }]) {
      const said = await saidBy(env)
      expect(said).toContain(`PERM<${OPENCODE_FULL}>`)
      // THE PLUGIN LEARNS HOW TO RUN THE GUARD FROM THIS, so it must reach the program.
      expect(said).toContain(THE_GUARD)
    }
    // A CHANGE OF null TAKES AN INHERITED VALUE OUT; a Mole Office setting is never let in by one.
    const built = envFor(ask('x'), { PATH, OPENCODE_PERMISSION: OPENCODE_FULL }, { OPENCODE_PERMISSION: null, MOLE_OFFICE_DB: '/nowhere' })
    expect(built['OPENCODE_PERMISSION']).toBeUndefined()
    expect(built['MOLE_OFFICE_DB']).toBeUndefined()
  })
})

// ============================================================================ dsh, through run-agent.sh

interface Ran {
  code: number | null
  stderr: string
  stdout: string
  /** What the fake dsh saw, or null because it never ran. */
  seen: { mode: string } | null
  log: string
}

/** Run the real run-agent.sh against a fake dsh that writes down the two variables, in `env`. */
async function runTheRunner(name: string, env: NodeJS.ProcessEnv, runner = RUN_AGENT): Promise<Ran> {
  const at = join(dir, `dsh-${name}`)
  const home = join(at, 'home')
  const worktree = join(at, 'a-worktree')
  const brief = join(at, 'the-brief.md')
  const log = join(at, 'the-run.log')
  const dshDir = join(at, 'dsh')
  const bin = join(dshDir, 'npm', 'node_modules', '.bin')
  const seenFile = join(at, 'seen.json')
  for (const folder of [home, worktree, bin, join(dshDir, 'home')]) mkdirSync(folder, { recursive: true })
  writeFileSync(join(dshDir, 'env'), '')
  writeFileSync(brief, 'a brief for the permission test\n')
  writeFileSync(log, '')
  writeFileSync(
    join(bin, 'dsh'),
    [
      '#!/usr/bin/env bash',
      `printf '{"mode":"%s"}' "\${DSH_PERMISSION_MODE-unset}" > ${JSON.stringify(seenFile)}`,
      '',
    ].join('\n'),
  )
  chmodSync(join(bin, 'dsh'), 0o755)

  const child: ChildProcess = spawn('bash', [runner, worktree, brief, log, 'the-test-handle', 'the-test-session', 'default'], {
    cwd: REPO,
    env: { ...env, SANDBOX_DSH_NATIVE_READER: syntheticDshReader(at), HOME: home, MOLE_OFFICE_DSH_DIR: dshDir, MOLE_OFFICE_API: UNREACHABLE_API, MOLE_OFFICE_AGENT_MODEL: 'deepseek-v4.1-flash' },
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
    seen: existsSync(seenFile) ? (JSON.parse(readFileSync(seenFile, 'utf8')) as { mode: string }) : null,
    log: readFileSync(log, 'utf8'),
  }
}

/**
 * A COPY OF THE FEW FILES run-agent.sh READS, whose hooks file does not mount the guard. dsh's guard
 * is that file, so the half without the guard needs a checkout where it is missing; this one is
 * made under the scratch folder and holds an empty `.env`, so no other `.env` is read.
 */
function aCheckoutWithoutTheGuard(): string {
  const root = join(dir, 'checkout-without-the-guard')
  const files = [
    'tools/dsh-hooks/run-agent.sh',
    'tools/dsh-hooks/run-settings.mjs',
    'tools/dsh-hooks/keep-the-brief.mjs',
    ...walkFrom('tools/dsh-hooks/office.mjs', REPO).files,
    ...walkFrom('tools/sandbox-common.mjs', REPO).files,
    // sandbox-common.mjs imports this one from tools, where the walk does not follow it.
    ...walkFrom('tools/sandbox-git.mjs', REPO).files,
    // The server's import walk stays inside src; these helper dependencies live outside it.
    'tools/label-a-record.mjs',
    'for-agents/agent-key.mjs',
    'tools/run-permissions.mjs',
    // run-agent.sh reads dsh's patch list from this one, and gives dsh the list it names.
    ...walkFrom('tools/harness-features-off.mjs', REPO).files,
    DSH_PATCH_IN_A_CHECKOUT,
    // settings.mjs with what it imports, read from its imports so a module it starts to import is copied too.
    ...whatACopyOfSettingsCarries(REPO),
    'src/config/run-permissions.mjs',
    'src/config/main-world-guard.mjs',
  ]
  for (const file of files) {
    mkdirSync(join(root, file, '..'), { recursive: true })
    writeFileSync(join(root, file), readFileSync(join(REPO, file)))
  }
  const hooks = JSON.parse(readFileSync(join(REPO, 'tools', 'dsh-hooks', 'hooks.json'), 'utf8')) as { hooks: Record<string, unknown> }
  delete hooks.hooks['PreToolUse']
  writeFileSync(join(root, 'tools', 'dsh-hooks', 'hooks.json'), JSON.stringify(hooks))
  writeFileSync(join(root, '.env'), '')
  return join(root, 'tools', 'dsh-hooks', 'run-agent.sh')
}

describe('dsh, through run-agent.sh', () => {
  it('on the host, where the office profile’s hooks file mounts the guard, gives it danger-full-access', async () => {
    const ran = await runTheRunner('guarded', theHostWithout())
    expect(ran.code, ran.stderr).toBe(0)
    expect(ran.seen).toEqual({ mode: 'danger-full-access' })
    expect(ran.log).toContain('because the main-world guard is mounted into it')
  })

  it('on the host without the guard runs dsh on its own default, takes out a danger-full-access it inherited, and says why', async () => {
    // THE PATH THIS CLOSES: a dsh supervisor that ran with danger-full-access starts a worker, and
    // the worker would inherit it with nobody having decided it.
    const runner = aCheckoutWithoutTheGuard()
    const ran = await runTheRunner('host', { ...theHostWithout(), DSH_PERMISSION_MODE: 'danger-full-access' }, runner)
    expect(ran.code, ran.stderr).toBe(0)
    expect(ran.seen).toEqual({ mode: 'unset' })
    expect(ran.log).toContain('dsh runs with its own default permissions')
    expect(ran.log).toContain('taken out')
  })

  // A dsh RUN IN A SANDBOX IS GIVEN ITS KEY BY THE LAUNCHER, and one with none is refused before anything else (problem
  // epOLxauSbzd9); so the two sandbox cases below carry a made-up key, as every dsh run there does.
  it('in a sandbox gives it danger-full-access', async () => {
    const ran = await runTheRunner('sandboxed', { ...theHostWithout(), SANDBOX_DIR: A_SANDBOX, DEEPSEEK_API_KEY: 'not-a-real-key' })
    expect(ran.code, ran.stderr).toBe(0)
    expect(ran.seen?.mode).toBe('danger-full-access')
    expect(ran.log).toContain('because it is in a sandbox')
  })

  it('refuses to start dsh at all on a sandbox claim it cannot read', async () => {
    const ran = await runTheRunner('unreadable', { ...theHostWithout(), SANDBOX_DIR: 'not/absolute', DEEPSEEK_API_KEY: 'not-a-real-key' })
    expect(ran.code).toBe(1)
    expect(ran.seen).toBeNull()
    expect(ran.stderr).toContain('SANDBOX_DIR is "not/absolute"')
    expect(ran.stderr).toContain('dsh was not started')
  })
})

// ============================================================================ a command line somebody else wrote

describe('the launcher handed a whole command line (tools/sandbox-start.mjs)', () => {
  const inASandbox = { SANDBOX_DIR: A_SANDBOX }

  it('puts a tool’s arguments right after its program’s name, found by the name however the path is written', () => {
    expect(aCommandsPermissions(['claude', '-p', 'hi'], inASandbox).command).toEqual([
      'claude', '--permission-mode', 'bypassPermissions', '-p', 'hi',
    ])
    expect(aCommandsPermissions(['/usr/local/bin/codex', 'exec', 'hi'], inASandbox).command).toEqual([
      '/usr/local/bin/codex', '-s', 'danger-full-access', '-a', 'never', 'exec', 'hi',
    ])
  })

  it('gives every command every tool’s environment part, so a tool started below it has them too', () => {
    const permitted = aCommandsPermissions(['bash', 'tools/dsh-hooks/run-agent.sh', 'w'], inASandbox)
    expect(permitted.command).toEqual(['bash', 'tools/dsh-hooks/run-agent.sh', 'w'])
    expect(permitted.env).toEqual({ OPENCODE_PERMISSION: OPENCODE_FULL, DSH_PERMISSION_MODE: 'danger-full-access' })
  })

  it('leaves a command that already names the permission option as it was written, and says so', () => {
    const permitted = aCommandsPermissions(['claude', '--permission-mode', 'plan', '-p', 'hi'], inASandbox)
    expect(permitted.command).toEqual(['claude', '--permission-mode', 'plan', '-p', 'hi'])
    expect(permitted.says.join(' ')).toContain('left as written')
  })

  it('adds nothing on the host without the guard, and reads the guard off a tool’s command when it is there', () => {
    const permitted = aCommandsPermissions(['claude', '-p', 'hi'], {})
    expect(permitted.command).toEqual(['claude', '-p', 'hi'])
    expect(permitted.env).toEqual({})
    // ONLY THE PROGRAM AT THE HEAD IS READ: nothing here knows how a tool started below it is started.
    const guarded = ['claude', '-p', 'hi', ...claudeCodeGuard('builder-x')]
    expect(aCommandsPermissions(guarded, {}).command).toEqual(['claude', '--permission-mode', 'bypassPermissions', ...guarded.slice(1)])
    expect(aCommandsPermissions(guarded, {}).env).toEqual({})
  })

  // Mutations: the runtime word read as Codex for another tool, or not for 'codex'; the two rules
  // split, so a run record's runtime and a command's program can disagree about Codex.
  it('reads a run record’s runtime word as Codex by the same rule as a command’s program', () => {
    expect(aRuntimeIsCodex('codex')).toBe(true)
    for (const runtime of ['claude-code', 'opencode', 'dsh', 'kimi', 'Codex', ' codex', '', undefined, null, 7]) {
      expect(aRuntimeIsCodex(runtime)).toBe(false)
    }
    for (const word of ['codex', 'claude', 'claude-code', 'opencode', 'dsh', 'Codex', '']) {
      expect(aRuntimeIsCodex(word)).toBe(aCommandsProgram([word]).isCodex)
    }
  })
})

describe('B18 Codex container argv contract', () => {
  const container = { SANDBOX_DIR: A_SANDBOX }
  it.each([
    ['profile sandbox', ['-c', 'profiles.synthetic.sandbox_mode="workspace-write"']],
    ['deep approval', ['--config', 'nested.synthetic.deep.approval_policy="on-request"']],
    ['matching nested sandbox', ['--config=profiles.synthetic.sandbox_mode="danger-full-access"']],
    ['matching nested approval', ['-cnested.synthetic.approval_policy="never"']],
  ])('B18 nested permission selector %s refuses agents without a profile flag and preserves unverified plain argv', (_kind, flags) => {
    for (const head of [['codex'], ['env', 'SYNTHETIC=value', 'codex']]) {
      const argv = [...head, ...FULL_PERMISSIONS.codex!.args, ...flags, 'exec', '--', 'synthetic']
      expect(() => aCommandsPermissions(argv, container)).toThrow(/Codex.*-s danger-full-access -a never.*before exec/)
      const plain = aCommandsPermissions(argv, container, { plain: true })
      expect(plain.command).toEqual(argv)
      expect(plain.says.join(' ')).toContain('permissions not verifiable')
      expect(plain.says.join(' ')).not.toContain('full permissions')
      expect(aCommandsPermissions(argv, {}).command).toEqual(argv)
    }
  })

  it.each([
    ['short', ['-p', 'synthetic']], ['long', ['--profile', 'synthetic']],
    ['joined', ['-psynthetic']], ['short equals', ['-p=synthetic']], ['long equals', ['--profile=synthetic']],
  ])('B18 profile selector %s independently refuses agents and preserves unverified plain argv', (_kind, flags) => {
    const argv = ['codex', ...FULL_PERMISSIONS.codex!.args, ...flags, 'exec', '--', 'synthetic']
    expect(() => aCommandsPermissions(argv, container)).toThrow(/Codex.*-s danger-full-access -a never.*before exec/)
    const plain = aCommandsPermissions(argv, container, { plain: true })
    expect(plain.command).toEqual(argv)
    expect(plain.says.join(' ')).toContain('permissions not verifiable')
    expect(plain.says.join(' ')).not.toContain('full permissions')
    expect(aCommandsPermissions(argv, {}).command).toEqual(argv)
  })

  it('B18 skips selector words inside unrelated dotted config values and prompts', () => {
    const argv = ['codex', ...FULL_PERMISSIONS.codex!.args, 'exec', '-c',
      'profiles.synthetic.model="other.sandbox_mode=read-only -p --profile"', '--', 'synthetic -p approval_policy']
    const checked = aCommandsPermissions(argv, container)
    expect(checked.command).toEqual(argv)
    expect(checked.says.join(' ')).toContain('Codex container argv checked')
  })
  it('B18 keeps a refusal on one line when the found flag value contains a newline', () => {
    let message = ''
    try { aCommandsPermissions(['codex', '-s', 'danger-full-access', '-a', 'on-request\nsynthetic extra line', 'exec'], container) }
    catch (error) { message = (error as Error).message }
    expect(message).toContain('-a on-request')
    expect(message).toContain('-s danger-full-access -a never before exec')
    expect(message.split('\n')).toHaveLength(1)
  })
  it.each([
    ['sandbox', ['-s', 'read-only', '-a', 'never']],
    ['workspace', ['-s', 'workspace-write', '-a', 'never']],
    ['approval', ['-s', 'danger-full-access', '-a', 'on-request']],
    ['approval-untrusted', ['-s', 'danger-full-access', '-a', 'untrusted']],
    ['alias', ['--sandbox', 'danger-full-access', '-a', 'never']],
  ])('B18 refuses explicit %s instead of claiming full permissions', (_name, flags) => {
    for (const head of [['codex'], ['env', 'SYNTHETIC=value', '/usr/bin/codex']]) {
      const command = [...head, ...flags, 'exec', '--', 'synthetic brief']
      expect(() => aCommandsPermissions(command, container)).toThrow(/Codex.*-s danger-full-access -a never.*before exec/)
      expect(aCommandsPermissions(command, {}).command).toEqual(command)
    }
  })

  it.each(['fresh', 'correction', 'resume'])('B18 preserves the real inspector %s argv and simple env form', kind => {
    const command = ['codex', ...FULL_PERMISSIONS.codex!.args, '-C', '/work', 'exec', '--json',
      '-c', 'model_reasoning_effort=xhigh', '-c', 'service_tier=fast',
      ...(kind === 'fresh' ? [] : ['resume', '01234567-89ab-cdef-0123-456789abcdef']),
      '-m', 'gpt-6.1-sol', '--', '-']
    for (const argv of [command, ['env', 'SYNTHETIC=value', ...command]]) {
      const answer = aCommandsPermissions(argv, container)
      expect(answer.command).toEqual(argv)
      expect(answer.says.join(' ')).toContain('Codex container argv checked')
    }
  })

  it('B18 inserts the shared form before exec while skipping option values and prompt text', () => {
    for (const head of [['codex'], ['env', 'SYNTHETIC=value', 'codex']]) {
      const tail = ['-m', 'exec', '-c', '-s', 'exec', '--json', '--', '-a on-request -s read-only']
      const answer = aCommandsPermissions([...head, ...tail], container)
      expect(answer.command).toEqual([...head, ...FULL_PERMISSIONS.codex!.args, ...tail])
      expect(answer.says.join(' ')).toContain('Codex container argv checked')
    }
  })

  it.each([
    ['missing', ['codex', 'exec'], 'no permission flags given'],
    ['long', ['codex', '--sandbox', 'danger-full-access', '--ask-for-approval', 'never', 'exec'], 'permissions not verifiable'],
    ['equals', ['codex', '-s=danger-full-access', '-a=never', 'exec'], 'permissions not verifiable'],
    ['joined', ['codex', '-sdanger-full-access', '-anever', 'exec'], 'permissions not verifiable'],
    ['exec alias', ['codex', '-s', 'danger-full-access', '-a', 'never', 'e', 'synthetic'], 'permissions not verifiable'],
    ['config override', ['codex', '-s', 'danger-full-access', '-a', 'never', 'exec', '-c', 'sandbox_mode="danger-full-access"'], 'permissions not verifiable'],
  ])('B18 plain %s keeps argv and states its actual limit', (_kind, command, words) => {
    const answer = aCommandsPermissions(command as string[], container, { plain: true })
    expect(answer.command).toEqual(command)
    expect(answer.says.join(' ')).toContain(words)
    expect(answer.says.join(' ')).not.toContain('full permissions')
  })

  it.each([
    ['approval alias', ['-s', 'danger-full-access', '--ask-for-approval', 'never', 'exec']],
    ['equals', ['-s=danger-full-access', '-a=never', 'exec']],
    ['joined', ['-sdanger-full-access', '-anever', 'exec']],
    ['exec alias', ['-s', 'danger-full-access', '-a', 'never', 'e']],
    ['late', ['exec', '-s', 'danger-full-access', '-a', 'never']],
    ['partial', ['-s', 'danger-full-access', 'exec']],
    ['duplicate', ['-s', 'danger-full-access', '-a', 'never', '-a', 'never', 'exec']],
    ['unknown', ['--unrecognized-native-option', 'exec']],
    ['config sandbox', ['-s', 'danger-full-access', '-a', 'never', 'exec', '-c', 'sandbox_mode="danger-full-access"']],
    ['config approval', ['-s', 'danger-full-access', '-a', 'never', 'exec', '--config=approval_policy="never"']],
  ])('B18 shared agent %s is unverifiable and refuses', (_kind, flags) => {
    expect(() => aCommandsPermissions(['codex', ...flags], container)).toThrow(/Codex.*-s danger-full-access -a never.*before exec/)
  })
})


describe('B18 permission explanations describe only their own additions', () => {
  const container = { SANDBOX_DIR: A_SANDBOX }
  const syntheticOffice = {
    ...container,
    MOLE_OFFICE_AGENT: 'synthetic-worker',
    MOLE_OFFICE_SESSION: 'synthetic-run',
    MOLE_OFFICE_WORKSPACE: 'synthetic-project',
    MOLE_OFFICE_API: 'http://example.invalid',
  }

  it('B18 opaque Claude explanation leaves room for its later permission preparation', () => {
    const original = ['claude', '-p', 'synthetic task']
    const checked = aCodexContainerCommand(original, { plain: true })
    const prepared = aCommandsPermissions(checked.command, container, { plain: true })
    expect(checked.says).toEqual(['Codex container argv is unverifiable for this opaque plain program.'])
    expect(checked.command).toEqual(original)
    expect(prepared.command).toEqual(['claude', ...FULL_PERMISSIONS['claude-code']!.args, '-p', 'synthetic task'])
    expect(prepared.command).not.toEqual(original)
  })

  it('B18 plain flagless Codex explanation leaves room for later Office tool arguments', () => {
    const original = ['codex', 'exec', '--', 'synthetic task']
    const checked = aCodexContainerCommand(original, { plain: true })
    const prepared = aCommandsOfficeTool(checked.command, syntheticOffice)
    expect(checked.says).toEqual(['Codex container command: no permission flags given; no Codex sandbox or approval flags were added to this command.'])
    expect(checked.command).toEqual(original)
    expect(prepared.command).not.toEqual(original)
    expect(prepared.command).toContain('mcp_servers.mole_office.enabled=true')
    expect(prepared.command).not.toContain('-s')
    expect(prepared.command).not.toContain('-a')
  })

  it('B18 plain profile Codex explanation leaves room for later Office tool arguments', () => {
    const original = ['codex', '-p', 'synthetic-profile', 'exec', '--', 'synthetic task']
    const checked = aCodexContainerCommand(original, { plain: true })
    const prepared = aCommandsOfficeTool(checked.command, syntheticOffice)
    expect(checked.says).toEqual(['Codex container argv is unverifiable: permissions not verifiable ("-p"); no Codex sandbox or approval flags were added to this command.'])
    expect(checked.command).toEqual(original)
    expect(prepared.command).not.toEqual(original)
    expect(prepared.command).toContain('mcp_servers.mole_office.enabled=true')
    expect(prepared.command).not.toContain('-s')
    expect(prepared.command).not.toContain('-a')
  })
})
