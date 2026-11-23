// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MAIN-WORLD GUARD, MOUNTED IN OPENCODE. A railing, not a wall, exactly as the hook it runs.
 *
 * OpenCode has no command hooks. It has plugins, and a plugin's `tool.execute.before` runs before
 * every tool and stops the call by throwing (measured on OpenCode 1.18.31, 22 September 2026: the
 * thrown message is what the model is shown as the tool's error). This plugin hands the call to the
 * same hook every other runtime calls, `main-world-guard.mjs`, in the shape Claude Code sends, so
 * there is still one policy.
 *
 * The office names this file in `OPENCODE_CONFIG_CONTENT` for each run it starts, and puts the
 * hook's command line in `MOLE_GUARD_COMMAND` (src/config/main-world-guard.mjs, `openCodeGuard` and
 * `THE_GUARD_COMMAND`, which is the one declaration of that name), because OpenCode gives a plugin
 * no arguments of its own.
 *
 * WHEN THE HOOK CANNOT RUN, THE HOOK'S OWN RULE HOLDS: a call that looks like a delete is stopped
 * and everything else goes on, with the same text test the hook uses when it breaks.
 *
 * ONLY THE PLUGIN IS EXPORTED. OpenCode calls every function a plugin module exports as a plugin.
 */
import { spawnSync } from 'node:child_process'

import { looksDeleteShaped } from './main-world-guard.mjs'

/** How long the hook may take, in milliseconds; the hook's own office requests end sooner. */
const HOOK_TIMEOUT_MS = 25_000

/** @param {{ directory?: string }} context */
export const MoleOfficeMainWorldGuard = async (context) => ({
  /**
   * @param {{ tool: string }} input
   * @param {{ args: Record<string, unknown> }} output
   */
  'tool.execute.before': async (input, output) => {
    const payload = {
      hook_event_name: 'PreToolUse',
      tool_name: input.tool,
      tool_input: output.args ?? {},
      cwd: context.directory ?? process.cwd(),
    }
    let argv = null
    try {
      argv = JSON.parse(process.env['MOLE_GUARD_COMMAND'] ?? 'null')
    } catch {
      argv = null
    }
    const text = JSON.stringify(payload.tool_input)
    if (!Array.isArray(argv) || argv.length === 0) {
      if (looksDeleteShaped(String(output.args?.['command'] ?? output.args?.['patchText'] ?? ''))) {
        throw new Error("Mole Office's guard is named but MOLE_GUARD_COMMAND does not say how to run it, so this call, which looks like a delete, is stopped.")
      }
      return
    }
    const ran = spawnSync(String(argv[0]), argv.slice(1).map(String), {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      timeout: HOOK_TIMEOUT_MS,
      cwd: payload.cwd,
    })
    if (ran.status === 0) return
    if (ran.status === 2) throw new Error(ran.stderr.trim() || "Mole Office's guard stopped this call.")
    const why = ran.error?.message ?? `it exited ${String(ran.status ?? ran.signal)}`
    if (looksDeleteShaped(String(output.args?.['command'] ?? output.args?.['patchText'] ?? text))) {
      throw new Error(`Mole Office's guard could not run (${why}), and this call looks like a delete, so it is stopped. Everything else is let through while the guard is broken.`)
    }
  },
})
