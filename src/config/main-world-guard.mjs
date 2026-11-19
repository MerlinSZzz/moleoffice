// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * HOW EACH RUNTIME MOUNTS THE MAIN-WORLD GUARD, AND HOW TO TELL THAT IT DID. One place.
 *
 * A decision, of 22 September 2026, says one guard, the same policy for every runtime, is mounted into each runtime's
 * pre-execution hook, and a runtime in the main world runs with full permissions only when the guard is
 * mounted. The policy is `tools/guard/policy.mjs`; the hook that runs it is
 * `tools/guard/main-world-guard.mjs`. This file says how each runtime is told to call that hook, and `theGuardOn` reads
 * a command line back to say whether it was — that answer is the marker the permission flags are set by, so it is read
 * off the command itself and cannot drift from it.
 *
 * MEASURED ON THIS MACHINE ON 22 SEPTEMBER 2026, each against a scripted stand-in for the model's
 * API so that nothing was sent anywhere and no runtime's own home was touched
 * (tests/the-guard-in-each-runtime.test.ts does it again on demand):
 *
 *   Claude Code 2.1.278  `--settings <json>` with a PreToolUse command hook. Exit 2 stops the call,
 *                        also under `--permission-mode bypassPermissions`.
 *   Codex 0.155.1        `-c hooks.PreToolUse=[…]` with `--dangerously-bypass-hook-trust`, because a
 *                        hook nobody reviewed in Codex's own interface is otherwise not run. The
 *                        shell reaches the hook as tool `Bash`, a patch as `apply_patch`.
 *   OpenCode 1.18.31     a plugin named in `OPENCODE_CONFIG_CONTENT`; its `tool.execute.before`
 *                        throws to stop a call. The plugin runs the same hook.
 *   dsh                  the Claude Code hooks bridge already mounted by the office profile, with a
 *                        PreToolUse entry in `tools/dsh-hooks/hooks.json`.
 *
 * WHAT IS NOT GUARDED: Kimi CLI, and `tools/agent-worker.mjs`, which starts `claude` by itself. Neither
 * is given a permission flag, so neither is widened.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { REPO_ROOT, backupsDirectoryFrom, databasePathFrom, keysPathFrom, mergedEnvironment, theInstallsNode } from './settings.mjs'

/** The hook every runtime calls, in the checkout the office runs from. */
export const THE_GUARD = resolve(REPO_ROOT, 'tools', 'guard', 'main-world-guard.mjs')

/** The OpenCode plugin that calls the same hook. */
export const THE_OPENCODE_PLUGIN = resolve(REPO_ROOT, 'tools', 'guard', 'opencode-plugin.mjs')

/** The dsh bridge's hooks file, which the office profile mounts. */
export const THE_DSH_HOOKS = resolve(REPO_ROOT, 'tools', 'dsh-hooks', 'hooks.json')

/**
 * The environment variable that carries the guard's command line to the OpenCode plugin, as a JSON
 * array. OpenCode gives a plugin no arguments, so this is how it learns which agent is asking.
 *
 * IT IS NOT A MOLE OFFICE SETTING, so its name does not start with MOLE_OFFICE_: it is one run's
 * value, written by the adapter for that run, and `envFor` lets no MOLE_OFFICE_ name into a run's
 * environment from an adapter. `tools/guard/opencode-plugin.mjs` spells the same name, because it
 * imports nothing it does not need; tests/the-guard-is-mounted-on-every-runtime.test.ts runs the
 * plugin through this constant, so the two cannot differ without a red.
 */
export const THE_GUARD_COMMAND = 'MOLE_GUARD_COMMAND'

/** How long a runtime waits for the hook, in seconds. The hook's own office requests end well before. */
export const HOOK_TIMEOUT_SECONDS = 30

/** @param {string} word @returns {string} */
function quoted(word) {
  return `'${word.replace(/'/g, `'\\''`)}'`
}

/**
 * THE OFFICE'S OWN PATHS THAT THE GUARD PROTECTS: its database, its keys file and its backups
 * folder, as src/config/settings.mjs works them out from this process's environment.
 * @param {Record<string, string | undefined>} [processEnv]
 * @returns {{ database: string, keys: string, backups: string }}
 */
export function theOfficesPaths(processEnv = process.env) {
  const env = mergedEnvironment(processEnv)
  return { database: databasePathFrom(env), keys: keysPathFrom(env), backups: backupsDirectoryFrom(env) }
}

/**
 * The guard's command line for one agent: this Node, the hook, the agent it asks about, and the
 * office's own paths. `node` is this process's own, because a hook run by the bare word may meet
 * the system Node 18.
 *
 * THE PATHS ARE WORKED OUT HERE, in the office that starts the run, because the hook cannot work
 * them out where it runs. It runs in the agent's environment, and `envFor` lets no MOLE_OFFICE_ name
 * into it. In a paired office the hook is the stable checkout's, and its own settings would name
 * the stable checkout's default database, which nobody uses.
 *
 * ON LINUX AN INSTALLED OFFICE'S NODE IS THE APP'S OWN PROGRAM, which opens the app unless it is
 * told to run as Node (`theInstallsNode` in ./settings.mjs). The command line then starts with
 * /usr/bin/env and that variable, so a shell and OpenCode's plugin give it to the hook alone.
 * @param {string} agent @param {string} [node]
 * @returns {string[]}
 */
export function guardArgv(agent, node) {
  const at = theOfficesPaths()
  const installs = node === undefined ? theInstallsNode() : { program: node, environment: {} }
  const environment = Object.entries(installs.environment).map(([name, value]) => `${name}=${value}`)
  return [
    ...(environment.length === 0 ? [] : ['/usr/bin/env', ...environment]),
    installs.program, THE_GUARD, '--agent', agent, '--database', at.database, '--keys', at.keys, '--backups', at.backups,
  ]
}

/** @param {string} agent @param {string} [node] @returns {string} */
function guardCommand(agent, node) {
  return guardArgv(agent, node).map(quoted).join(' ')
}

/**
 * Claude Code: the two arguments that mount the guard on one run.
 * @param {string} agent @param {string} [node] @returns {string[]}
 */
export function claudeCodeGuard(agent, node) {
  const settings = {
    hooks: {
      PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: guardCommand(agent, node), timeout: HOOK_TIMEOUT_SECONDS }] }],
    },
  }
  return ['--settings', JSON.stringify(settings)]
}

/**
 * Codex: the arguments that mount the guard on one `codex exec` (or `codex exec resume`).
 * A JSON string is a valid TOML basic string for these paths, which is what `-c` parses.
 * @param {string} agent @param {string} [node] @returns {string[]}
 */
export function codexGuard(agent, node) {
  const hook = `{type="command",command=${JSON.stringify(guardCommand(agent, node))},timeout=${HOOK_TIMEOUT_SECONDS}}`
  return ['-c', `hooks.PreToolUse=[{matcher="",hooks=[${hook}]}]`, '--dangerously-bypass-hook-trust']
}

/**
 * OpenCode: the environment that mounts the guard on one `opencode run`.
 * @param {string} agent @param {string} [node] @returns {Record<string, string>}
 */
export function openCodeGuard(agent, node) {
  return {
    OPENCODE_CONFIG_CONTENT: JSON.stringify({ plugin: [pathToFileURL(THE_OPENCODE_PLUGIN).href] }),
    [THE_GUARD_COMMAND]: JSON.stringify(guardArgv(agent, node)),
  }
}

/**
 * The PreToolUse hook commands a Claude-shaped hooks object names.
 * @param {unknown} config @returns {string[]}
 */
function preToolUseCommands(config) {
  const hooks = typeof config === 'object' && config !== null ? /** @type {Record<string, unknown>} */ (config)['hooks'] : undefined
  const pre = typeof hooks === 'object' && hooks !== null ? /** @type {Record<string, unknown>} */ (hooks)['PreToolUse'] : undefined
  if (!Array.isArray(pre)) return []
  return pre.flatMap((group) => {
    const inner = typeof group === 'object' && group !== null ? /** @type {Record<string, unknown>} */ (group)['hooks'] : undefined
    return Array.isArray(inner) ? inner.map((h) => (typeof h === 'object' && h !== null ? String(/** @type {Record<string, unknown>} */ (h)['command'] ?? '') : '')) : []
  })
}

/**
 * Whether the dsh hooks file mounts the guard.
 * @param {string} [file] @returns {{ mounted: boolean, because: string }}
 */
export function theDshHooksCarryTheGuard(file = THE_DSH_HOOKS) {
  if (!existsSync(file)) return { mounted: false, because: `${file} does not exist.` }
  let config
  try {
    config = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    return { mounted: false, because: `${file} is not JSON: ${error instanceof Error ? error.message : String(error)}` }
  }
  const found = preToolUseCommands(config).some((c) => c.includes('tools/guard/main-world-guard.mjs'))
  return found
    ? { mounted: true, because: `${file} names tools/guard/main-world-guard.mjs as a PreToolUse hook.` }
    : { mounted: false, because: `${file} has no PreToolUse hook naming tools/guard/main-world-guard.mjs.` }
}

/**
 * THE MARKER: WHETHER THIS COMMAND LINE MOUNTS THE GUARD, read off the command itself.
 *
 * The permission flags of a run on the host are set by this answer and by nothing else, so a run
 * is widened exactly when the command it is started with carries the guard. The launcher that builds
 * the command asks this and hands the answer to `thePermissionsARunGets` in
 * src/config/run-permissions.mjs, which holds the flags.
 *
 * @param {string} runtime The runtime word: claude-code, codex, opencode, dsh.
 * @param {{ args: readonly string[], env?: Record<string, string | null | undefined> }} command
 * @returns {{ mounted: boolean, because: string }}
 */
export function theGuardOn(runtime, command) {
  const { args, env = {} } = command
  if (runtime === 'claude-code') {
    const at = args.indexOf('--settings')
    let parsed = null
    try { parsed = at === -1 ? null : JSON.parse(args[at + 1] ?? '') } catch { parsed = null }
    const found = preToolUseCommands(parsed).some((c) => c.includes(THE_GUARD))
    return found
      ? { mounted: true, because: 'The run is given --settings with a PreToolUse hook that runs the guard.' }
      : { mounted: false, because: 'The run is given no --settings naming the guard as a PreToolUse hook.' }
  }
  if (runtime === 'codex') {
    const hooked = args.some((a, i) => args[i - 1] === '-c' && a.startsWith('hooks.PreToolUse=') && a.includes(THE_GUARD))
    const trusted = args.includes('--dangerously-bypass-hook-trust')
    if (hooked && trusted) return { mounted: true, because: 'The run is given -c hooks.PreToolUse naming the guard, and Codex is told to run it.' }
    return {
      mounted: false,
      because: hooked
        ? 'The run names the guard as a hook, but without --dangerously-bypass-hook-trust Codex does not run a hook nobody reviewed.'
        : 'The run is given no -c hooks.PreToolUse naming the guard.',
    }
  }
  if (runtime === 'opencode') {
    let plugins = []
    try { plugins = JSON.parse(env['OPENCODE_CONFIG_CONTENT'] ?? '{}')['plugin'] ?? [] } catch { plugins = [] }
    const named = Array.isArray(plugins) && plugins.includes(pathToFileURL(THE_OPENCODE_PLUGIN).href)
    const told = (env[THE_GUARD_COMMAND] ?? '').includes(THE_GUARD)
    if (named && told) return { mounted: true, because: 'The run is given the guard plugin in OPENCODE_CONFIG_CONTENT, and the plugin is told how to run the guard.' }
    return { mounted: false, because: named ? `The plugin is named, but ${THE_GUARD_COMMAND} does not say how to run the guard.` : 'The run is given no OPENCODE_CONFIG_CONTENT naming the guard plugin.' }
  }
  if (runtime === 'dsh') return theDshHooksCarryTheGuard()
  return { mounted: false, because: `No guard is wired for the runtime "${runtime}".` }
}
