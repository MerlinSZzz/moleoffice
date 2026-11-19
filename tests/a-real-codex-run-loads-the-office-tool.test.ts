// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * GX23T1MQs-aZ / IcgsA-OGvbzL: measured on Codex 0.159.2, exec only initializes the office
 * MCP server when its overrides follow exec. Opt-in: OFFICE_TOOL_REAL_CODEX=1.
 *
 * Starts the installed Codex with aCommandsOfficeTool's command and reads its actual rmcp log.
 * The prompt asks only for tool names. Both API addresses point at an unused loopback port;
 * initialization needs neither a model reply nor an office request. Stop at that observation.
 * Never read or copy a real auth.json (GX23T1MQs-aZ). Codex rotates ChatGPT refresh tokens;
 * refreshing a copy invalidates the original, and deleting the copy loses the replacement.
 * Codex 0.159.2 says: "Your access token could not be refreshed because your refresh token was already used".
 * Use an empty Codex home and a stand-in API key for the loopback provider instead.
 * RATbb8xNemOW step 2 uses a stand-in office key: sandbox measures the shell policy without a model,
 * and a wrapper records only whether the real MCP server inherits the key. No key value is recorded.
 * User configuration is ignored, so its hooks and servers do not run.
 * f_hnh472ssVM: the snapshot case builds its environment from nothing, so no variable of the session running the tests,
 * such as a messaging token, can reach a snapshot. It reads variable names from a snapshot, never their values.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { aCommandsOfficeTool } from '../src/config/run-permissions.mjs'

const ON = process.env['OFFICE_TOOL_REAL_CODEX'] === '1'

// Mutations, each alone: overrides back after the program's name; MOLE_AGENT_KEY omitted from env_vars.
it.skipIf(!ON)('real Codex initializes mole-office; skipped unless OFFICE_TOOL_REAL_CODEX=1 because it starts Codex', async () => {
  mkdirSync(join(process.cwd(), '.logs'), { recursive: true })
  const dir = mkdtempSync(join(process.cwd(), '.logs/real-codex-office-'))
  try {
    const codexHome = join(dir, 'codex-home')
    mkdirSync(codexHome)
    const env = isolatedEnv(dir, codexHome)
    Object.assign(env, {
      RUST_LOG: 'rmcp=info', MOLE_AGENT_KEY: 'synthetic-office-tool-key',
      OFFICE_TOOL_PROBE_API_KEY: 'synthetic-office-tool-probe-key',
      MOLE_OFFICE_AGENT: 'synthetic-codex-probe', MOLE_OFFICE_SESSION: 'synthetic-session',
      MOLE_OFFICE_WORKSPACE: 'synthetic-workspace', MOLE_OFFICE_API: 'http://127.0.0.1:1',
    })
    // The wrapper starts the actual office-mcp server with its own environment and inherited stdio.
    // Its marker records presence only, never the stand-in key's value.
    const marker = join(dir, 'mcp-key-presence')
    const wrapper = join(dir, 'mcp-probe.cjs')
    writeFileSync(wrapper, `require('fs').writeFileSync(${JSON.stringify(marker)}, Object.hasOwn(process.env, 'MOLE_AGENT_KEY') ? 'present' : 'absent');
require('child_process').spawn(process.execPath, [${JSON.stringify(join(process.cwd(), 'tools/office-mcp.mjs'))}], { stdio: 'inherit' }).on('exit', (code) => { process.exitCode = code ?? 1 })
`)
    const { command } = aCommandsOfficeTool([
      'codex', '-s', 'danger-full-access', '-a', 'never', 'exec',
      '--ignore-user-config', '--ephemeral', '--skip-git-repo-check', '--color', 'never',
      '-c', 'model_provider="office-tool-probe"',
      '-c', 'model_providers.office-tool-probe={name="office-tool-probe",base_url="http://127.0.0.1:1/v1",wire_api="responses",env_key="OFFICE_TOOL_PROBE_API_KEY",requires_openai_auth=false,supports_websockets=false}',
      '-c', `mcp_servers.mole_office.args=${JSON.stringify([wrapper])}`,
      'List only the names of your available tools.',
    ], env)
    const child = spawn(command[0]!, command.slice(1), { cwd: dir, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const group = child.pid
    const stop = () => {
      if (group !== undefined) {
        try { process.kill(-group, 'SIGTERM') } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
        }
      }
    }
    let log = ''
    let initialized: string | undefined
    child.stdout.on('data', (data: Buffer) => { log += data.toString('utf8') })
    child.stderr.on('data', (data: Buffer) => {
      log += data.toString('utf8')
      initialized = log.split('\n').find((line) => line.includes('rmcp') && line.includes('mole-office') && /initialized/i.test(line))
      if (initialized !== undefined) stop()
    })
    const timer = setTimeout(stop, 20_000)
    try {
      await new Promise<void>((resolve, reject) => {
        child.on('error', reject)
        child.on('close', () => resolve())
      })
      expect(initialized, log).toBeDefined()
      expect(readFileSync(marker, 'utf8')).toBe('present')
      process.stdout.write('Real Codex MCP key forwarding with shell exclusion: present (stand-in key only).\n')
      process.stdout.write(`Real Codex MCP initialization: ${initialized}\n`)
    } finally {
      clearTimeout(timer)
      stop()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}, 30_000)

/** No real credentials or this session's office settings reach a probe. */
function isolatedEnv(dir: string, codexHome: string): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const name of Object.keys(env)) {
    if (/^(MOLE_|OPENAI_|CODEX_)/.test(name)) delete env[name]
  }
  return { ...env, HOME: dir, CODEX_HOME: codexHome }
}

// Mutations, each alone: shell exclusion removed; startsRuns ignored.
it.skipIf(!ON)('real Codex sandbox excludes the stand-in key for workers and keeps it with --starts-runs, without a model', () => {
  mkdirSync(join(process.cwd(), '.logs'), { recursive: true })
  const dir = mkdtempSync(join(process.cwd(), '.logs/real-codex-shell-'))
  try {
    const env = {
      ...isolatedEnv(dir, dir), MOLE_AGENT_KEY: 'synthetic-office-tool-key',
      MOLE_OFFICE_AGENT: 'synthetic-codex-probe', MOLE_OFFICE_SESSION: 'synthetic-session',
      MOLE_OFFICE_WORKSPACE: 'synthetic-workspace', MOLE_OFFICE_API: 'http://127.0.0.1:1',
    }
    for (const startsRuns of [false, true]) {
      const { command } = aCommandsOfficeTool(['codex', 'exec'], env, { startsRuns })
      // sandbox, like exec, reads its own -c flags: root overrides were measured to be ignored.
      // Exercise the exact settings built for exec, under the model-free sandbox subcommand.
      const ran = spawnSync(command[0]!, [
        'sandbox', ...command.slice(2), '-c', 'sandbox_mode="danger-full-access"', '/bin/sh', '-c',
        'if test "${MOLE_AGENT_KEY+x}" = x; then echo present; else echo absent; fi',
      ], { cwd: dir, env, encoding: 'utf8', timeout: 10_000 })
      expect(ran.error).toBeUndefined()
      expect(ran.status, ran.stderr).toBe(0)
      expect(ran.stdout.trim()).toBe(startsRuns ? 'present' : 'absent')
      process.stdout.write(`Real Codex sandbox key presence: startsRuns=${startsRuns}: ${ran.stdout.trim()} (stand-in key only).\n`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}, 30_000)

/** Only what Codex needs to start, and stand-ins: nothing of the environment running the tests. */
function aSnapshotProbesEnv(dir: string, codexHome: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env['PATH'], HOME: dir, CODEX_HOME: codexHome, SHELL: '/bin/bash', LANG: 'C.UTF-8',
    MOLE_AGENT_KEY: 'synthetic-office-tool-key', OFFICE_TOOL_PROBE_API_KEY: 'synthetic-office-tool-probe-key',
    MOLE_OFFICE_AGENT: 'synthetic-codex-probe', MOLE_OFFICE_SESSION: 'synthetic-session',
    MOLE_OFFICE_WORKSPACE: 'synthetic-workspace', MOLE_OFFICE_API: 'http://127.0.0.1:1',
  }
}

/** Starts the command, watches CODEX_HOME/shell_snapshots for up to `ms`, stops the group, and answers the names seen. */
async function theSnapshotsNames(command: string[], env: NodeJS.ProcessEnv, cwd: string, ms: number): Promise<string[] | null> {
  const folder = join(String(env['CODEX_HOME']), 'shell_snapshots')
  const child = spawn(command[0]!, command.slice(1), { cwd, env, detached: true, stdio: 'ignore' })
  let ended = false
  child.on('close', () => { ended = true })
  const started = Date.now()
  let names: string[] | null = null
  try {
    while (!ended && names === null && Date.now() - started < ms) {
      for (const file of existsSync(folder) ? readdirSync(folder) : []) {
        const found = [...readFileSync(join(folder, file), 'utf8').matchAll(/^(?:export|declare -x) ([A-Za-z_][A-Za-z0-9_]*)/gm)].map((m) => m[1]!)
        if (found.length > 0) names = [...new Set(found)].sort()
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  } finally {
    try { process.kill(-child.pid!, 'SIGTERM') } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
    }
    if (!ended) await new Promise((resolve) => child.on('close', resolve))
  }
  return names
}

// Mutations, each alone: the snapshot switch taken out of aCommandsOfficeTool; the switch kept only for a worker.
// The control turns the switch back on after the launcher's words and must see a snapshot, so a watcher that looks in
// the wrong place cannot pass. Measured on Codex 0.159.2: with the switch on, the snapshot appears about 0.4 s after the
// start and is still there after a SIGTERM.
it.skipIf(!ON)('real Codex writes no shell snapshot for a worker or a run that starts runs, without a model', async () => {
  mkdirSync(join(process.cwd(), '.logs'), { recursive: true })
  const dir = mkdtempSync(join(process.cwd(), '.logs/real-codex-snapshot-'))
  try {
    for (const startsRuns of [false, true]) {
      for (const control of [true, false]) {
        const codexHome = mkdtempSync(join(dir, 'codex-home-'))
        const env = aSnapshotProbesEnv(dir, codexHome)
        const { command } = aCommandsOfficeTool([
          'codex', '-s', 'danger-full-access', '-a', 'never', 'exec',
          '--ignore-user-config', '--skip-git-repo-check', '--color', 'never',
          '-c', 'model_provider="office-tool-probe"',
          '-c', 'model_providers.office-tool-probe={name="office-tool-probe",base_url="http://127.0.0.1:1/v1",wire_api="responses",env_key="OFFICE_TOOL_PROBE_API_KEY",requires_openai_auth=false,supports_websockets=false}',
          ...(control ? ['-c', 'features.shell_snapshot=true'] : []),
          'Say hello.',
        ], env, { startsRuns })
        const names = await theSnapshotsNames(command, env, dir, control ? 15_000 : 5_000)
        const what = `startsRuns=${startsRuns}, ${control ? 'switch turned back on' : 'as the launcher builds it'}`
        if (control) {
          expect(names, what).not.toBeNull()
          expect(names, what).toContain('OFFICE_TOOL_PROBE_API_KEY')
          if (startsRuns) expect(names, what).toContain('MOLE_AGENT_KEY')
          else expect(names, what).not.toContain('MOLE_AGENT_KEY')
        } else {
          expect(names, what).toBeNull()
          expect(existsSync(join(codexHome, 'shell_snapshots')), what).toBe(false)
        }
        process.stdout.write(`Real Codex shell snapshot, ${what}: ${names === null ? 'none written' : `names ${names.join(' ')}`} (stand-ins only).\n`)
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}, 90_000)
