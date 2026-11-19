// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHECK'S MODEL STARTS WITH THE HARNESS'S OWN SUBAGENTS AND WORKFLOWS OFF, and so does a dsh worker. Each switch is
 * the one tools/harness-features-off.mjs hands on, read from there and never written here.
 *
 *   1. Claude Code: the inspector's command (theChecksCommand in tools/the-inspector.mjs, read from its source) has
 *      Claude Code's switch right after `claude`, on the host and in the sandbox, and runInside writes it into the
 *      check view's wrapper.
 *   2. Codex: the same, with Codex's switch right after `codex`, for a check with no provider row and for one whose
 *      row names one.
 *   3. OpenCode: the command's OPENCODE_CONFIG_CONTENT denies OpenCode's task tool, and runInside starts it. The same
 *      command with an empty config is refused before anything is asked of the launcher.
 *   4. A dsh check: the inspector's client, copied as runClaudeInTheSandbox copies it, gives dsh a second --patch, the
 *      copy of dsh's patch list beside it, byte for byte and read-only.
 *   5. A dsh worker: tools/dsh-hooks/run-agent.sh gives dsh the patch list of its own checkout right after the
 *      brief-by-path patch.
 *   6. A Claude Code or Codex command the switch cannot be put into, because it starts another program, starts nothing:
 *      theChecksCommand refuses it with what tools/harness-features-off.mjs says about it.
 *
 * No model, harness or container starts. The launcher is tests/inspector-view-stand-in.ts, dsh's ACP side is
 * tests/a-dsh-acp-stand-in.mjs, and a dsh worker's dsh is a stand-in that writes down how it was started.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it } from 'vitest'
import { CLAUDE_CODE_FEATURES_OFF, CODEX_FEATURES_OFF, DSH_FEATURES_OFF, OPENCODE_FEATURES_OFF, aCommandWithTheHarnessFeaturesOff } from '../tools/harness-features-off.mjs'
import { OPENCODE_CHECK_ENV, copyTheDshClient, runInside, theCodexProviderOptions } from '../tools/inspector-sandbox.mjs'
import * as client from '../tools/inspector-dsh-acp.mjs'
import { aCommandsStartValues } from '../tools/sandbox-common.mjs'
import { applyLauncherSelection, readLauncherSelection } from '../src/config/launcher-selection.mjs'
import { withoutTheProvider } from '../src/config/model-efforts.mjs'
import { HOW_EACH_COMMAND_TAKES_AN_EFFORT } from '../src/config/how-a-command-takes-an-effort.mjs'
import { FULL_PERMISSIONS } from '../src/config/run-permissions.mjs'
import { inspectorViewStandIn } from './inspector-view-stand-in.ts'
import { syntheticDshReader } from './dsh-native-stand-in.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function aScratchFolder(name: string): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), `${name}-`)))
  roots.push(root)
  return root
}

/** Made-up models, as the inspector's other command tests give them. */
const MODELS: Record<string, string> = { 'claude-code': 'anthropic/claude-opus-5-5', codex: 'openai/gpt-6.1-sol', opencode: 'opencode-go/deepseek-v4.1-flash' }

const theInspectorSource = readFileSync(join(process.cwd(), 'tools/the-inspector.mjs'), 'utf8')
/** The inspector's own command builder, read from its source, because the tool's top level starts work. */
function theChecksCommand(runtime: string, where: 'host' | 'sandbox', over: Record<string, unknown> = {}): { command: string[]; env: Record<string, string> } {
  const at = theInspectorSource.indexOf('function theChecksCommand(')
  if (at < 0) throw new Error('The inspector holds no theChecksCommand.')
  const end = theInspectorSource.indexOf('\n}\n', at) + 3
  const context = {
    RUNTIME: runtime, MODEL: MODELS[runtime], SELECTION: null, EFFORT: { effort: 'xhigh' }, GIVEN: { effortFrom: 'Casting', provider: null },
    NATIVE_ROUTE: MODELS['opencode'], THE_MODEL_SESSION: null, SANDBOX: where === 'host' ? null : { checkDir: '/synthetic/check' },
    MADE_A_WORKTREE: null, WHERE: '/synthetic/work', PROVIDER_KEY: null,
    FULL_PERMISSIONS, aCommandsStartValues, withoutTheProvider, OPENCODE_CHECK_ENV, HOW_EACH_COMMAND_TAKES_AN_EFFORT,
    aCommandWithTheHarnessFeaturesOff, theRecordsFolder: () => '/synthetic/records', ...over,
  }
  const read = runInNewContext(`${theInspectorSource.slice(at, end)}\n;({theChecksCommand})`, context) as { theChecksCommand: (resume: string | null) => { command: string[]; env: Record<string, string> } }
  return read.theChecksCommand(null)
}

/** The argument list runClaudeInTheSandbox hands runInside: the command's environment through env, then the command. */
const theArgv = (given: { command: string[]; env: Record<string, string> }) =>
  [...(Object.keys(given.env).length === 0 ? [] : ['env', ...Object.entries(given.env).map(([key, value]) => `${key}=${value}`)]), ...given.command]
/** Words as the check view's wrapper quotes them. */
const quoted = (words: readonly string[]) => words.map(word => `'${word.replaceAll("'", "'\\''")}'`).join(' ')

describe("the check's model starts with the harness's own subagents and workflows off", () => {
  it('1. Claude Code: its switch comes right after claude, on the host and in the sandbox, and into the wrapper', async () => {
    for (const where of ['host', 'sandbox'] as const) {
      const given = theChecksCommand('claude-code', where)
      expect(given.command.slice(0, 1 + CLAUDE_CODE_FEATURES_OFF.length), where).toEqual(['claude', ...CLAUDE_CODE_FEATURES_OFF])
    }
    const view = inspectorViewStandIn()
    try {
      const ran = await runInside(view.sandbox, { runtime: 'claude-code', label: 'claude', cwd: view.work, argv: theArgv(theChecksCommand('claude-code', 'sandbox')), limitMs: 1000, launcher: view.launcher })
      expect(ran.code, ran.why ?? '').toBe(0)
      expect(readFileSync(join(view.sandbox.checkDir, 'commands', 'claude.sh'), 'utf8')).toContain(` ${quoted(['claude', ...CLAUDE_CODE_FEATURES_OFF])} `)
    } finally { view.close() }
  })

  it('2. Codex: its switch comes right after codex, with and without a provider row, and runInside starts it', async () => {
    for (const where of ['host', 'sandbox'] as const) {
      const given = theChecksCommand('codex', where)
      expect(given.command.slice(0, 1 + CODEX_FEATURES_OFF.length), where).toEqual(['codex', ...CODEX_FEATURES_OFF])
    }
    const selection = readLauncherSelection({ runtime: 'codex', model: 'office-codex', casting: { id: 1, revision: 'a-made-up-revision' },
      native: { model: 'native-codex', provider: null, variant: null, effort: null, providerRow: 'a-made-up-provider' } })
    const withARow = theChecksCommand('codex', 'sandbox', { MODEL: 'office-codex', SELECTION: selection,
      GIVEN: { effortFrom: 'Casting', provider: { baseAddress: 'https://synthetic.invalid/v1' } }, applyLauncherSelection, theCodexProviderOptions })
    expect(withARow.command.slice(0, 1 + CODEX_FEATURES_OFF.length)).toEqual(['codex', ...CODEX_FEATURES_OFF])
    const view = inspectorViewStandIn()
    try {
      const ran = await runInside(view.sandbox, { runtime: 'codex', label: 'codex', cwd: view.work, argv: theArgv(theChecksCommand('codex', 'sandbox')), limitMs: 1000, launcher: view.launcher })
      expect(ran.code, ran.why ?? '').toBe(0)
      expect(readFileSync(join(view.sandbox.checkDir, 'commands', 'codex.sh'), 'utf8')).toContain(` ${quoted(['codex', ...CODEX_FEATURES_OFF])} `)
    } finally { view.close() }
  })

  it('3. OpenCode: its config denies the task tool and runInside starts it; with an empty config nothing is started', async () => {
    const given = theChecksCommand('opencode', 'sandbox')
    expect(JSON.parse(given.env['OPENCODE_CONFIG_CONTENT'] ?? '{}').permission?.task).toBe(OPENCODE_FEATURES_OFF.permission.task)
    const view = inspectorViewStandIn()
    try {
      const ran = await runInside(view.sandbox, { runtime: 'opencode', label: 'opencode', cwd: view.work, argv: theArgv(given), limitMs: 1000, launcher: view.launcher })
      expect(ran.code, ran.why ?? '').toBe(0)
      expect(view.calls).toHaveLength(1)
      const without = await runInside(view.sandbox, { runtime: 'opencode', label: 'opencode', cwd: view.work,
        argv: theArgv({ ...given, env: { ...given.env, OPENCODE_CONFIG_CONTENT: '{}' } }), limitMs: 1000, launcher: view.launcher })
      expect(without.started).toBeNull()
      expect(without.code).toBeNull()
      expect(view.calls).toHaveLength(1)
    } finally { view.close() }
  })

  it("4. a dsh check: the client gives dsh the copy of the patch list beside it as a second --patch", () => {
    const root = aScratchFolder('dsh-check-features-off')
    const commands = join(root, 'commands'), bin = join(root, 'bin'), work = join(root, 'work'), home = join(root, 'home')
    for (const folder of [commands, bin, work, join(home, '.dsh'), join(root, 'tmp')]) mkdirSync(folder, { recursive: true })
    copyTheDshClient(commands)
    client.putTheFeaturesOffBesideTheClient(commands, DSH_FEATURES_OFF[1]!)
    const standIn = join(process.cwd(), 'tests/a-dsh-acp-stand-in.mjs')
    writeFileSync(join(bin, 'dsh'), `#!/bin/sh\nexec ${quoted([process.execPath, standIn])} "$@"\n`, { mode: 0o755 })
    const log = join(root, 'stand-in.log'), scenario = join(root, 'scenario.json')
    const route = ['deepseek-official', 'deepseek-flash']
    writeFileSync(scenario, JSON.stringify({ log, sessionId: '9b2c4e1a-7d3f-4a5b-8c6d-0e1f2a3b4c5d', routeOnNew: route, routeOnResume: route,
      prompt: { stopReason: 'end_turn', updates: [{ sessionUpdate: 'agent_message_chunk', messageId: 'm-1', content: { type: 'text', text: 'A made-up answer.' } }] } }))
    const ran = spawnSync(process.execPath, [join(commands, 'inspector-dsh-acp.mjs'), '--provider', route[0]!, '--model', route[1]!], {
      cwd: work, input: 'A made-up check prompt.\n', encoding: 'utf8', timeout: 60_000,
      env: { PATH: `${bin}:${process.env['PATH'] ?? ''}`, HOME: home, TMPDIR: join(root, 'tmp'), DSH_HOME: join(home, '.dsh'), DSH_PERMISSION_MODE: 'danger-full-access', DSH_ACP_STAND_IN_SCENARIO: scenario },
    })
    expect(ran.status, ran.stderr).toBe(0)
    const start = readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line)).find(entry => entry.at === 'start')
    const copy = join(commands, client.THE_FEATURES_OFF_BESIDE_THE_CLIENT)
    expect(start.argv).toEqual(['--profile', 'acp', '--patch', start.patch.path, '--patch', copy])
    expect(readFileSync(copy, 'utf8')).toBe(readFileSync(DSH_FEATURES_OFF[1]!, 'utf8'))
    expect(lstatSync(copy).mode & 0o777).toBe(0o444)
  })

  it('5. a dsh worker: run-agent.sh gives dsh the patch list of its checkout right after the brief-by-path patch', async () => {
    const root = aScratchFolder('dsh-worker-features-off')
    for (const part of ['home', 'scratch', 'worktree', 'dsh/home', 'dsh/npm/node_modules/.bin']) mkdirSync(join(root, part), { recursive: true })
    const brief = join(root, 'brief'), record = join(root, 'native.json')
    writeFileSync(brief, 'A made-up task.\n')
    writeFileSync(join(root, 'dsh/npm/node_modules/.bin/dsh'), `#!${process.execPath}
// A STAND-IN FOR dsh, written by a test. It starts no model: it writes down how it was started and whether each patch is there.
const fs = require('node:fs'), args = process.argv.slice(2)
fs.writeFileSync(${JSON.stringify(record)}, JSON.stringify({ args, there: args.flatMap((word, i) => word === '--patch' ? [fs.existsSync(args[i + 1])] : []) }))
`, { mode: 0o755 })
    const preload = join(root, 'office.mjs')
    writeFileSync(preload, `globalThis.fetch = async () => new Response(JSON.stringify({ record: { id: 'a-made-up-brief-note' } }), { status: 201 })`)
    const env: NodeJS.ProcessEnv = { ...withoutInheritedEffort(), HOME: join(root, 'home'), TMPDIR: join(root, 'scratch'), SANDBOX_DIR: root,
      MOLE_OFFICE_DSH_DIR: join(root, 'dsh'), MOLE_OFFICE_API: 'http://synthetic.invalid', MOLE_AGENT_KEY: 'd'.repeat(64), DEEPSEEK_API_KEY: 'synthetic-key',
      NODE_OPTIONS: '--import=' + preload, SANDBOX_DSH_NATIVE_READER: syntheticDshReader(root),
      SANDBOX_DSH_SELECTION: JSON.stringify({ runtime: 'dsh', model: null, effort: null, requestedEffort: null, effortFrom: 'none', words: 'A made-up start sentence.' }) }
    for (const name of ['MOLE_OFFICE_AGENT_MODEL', 'MOLE_OFFICE_INSPECTION_MODEL', 'CLAUDE_CODE_EFFORT_LEVEL', 'CLAUDE_EFFORT']) delete env[name]
    const child = spawn('bash', ['tools/dsh-hooks/run-agent.sh', join(root, 'worktree'), brief, join(root, 'dsh.log'), 'synthetic-dsh-agent', 'synthetic-own-run', 'synthetic-workspace'], { env })
    let err = ''
    child.stderr.on('data', chunk => { err += chunk })
    const code = await new Promise<number | null>(done => child.on('close', done))
    expect(code, err).toBe(0)
    const native = JSON.parse(readFileSync(record, 'utf8')) as { args: string[]; there: boolean[] }
    expect(native.args).toEqual(['--profile', 'office', '--patch', join(process.cwd(), 'tools/dsh-hooks/brief-by-path.patch.yml'), ...DSH_FEATURES_OFF, brief])
    expect(native.there).toEqual([true, true])
    expect(existsSync(DSH_FEATURES_OFF[1]!)).toBe(true)
  })

  it('6. a Claude Code or Codex command the switch cannot be put into starts nothing', () => {
    const throughAShell = (command: string[]) => ({ command: ['sh', '-c', command.join(' ')], env: {} })
    for (const runtime of ['claude-code', 'codex']) {
      const says = aCommandWithTheHarnessFeaturesOff(throughAShell([]).command, {}, runtime).says
      expect(says, runtime).not.toEqual([])
      expect(() => theChecksCommand(runtime, 'sandbox', { aCommandsStartValues: throughAShell }), runtime).toThrow(says.join(' '))
    }
  })
})
