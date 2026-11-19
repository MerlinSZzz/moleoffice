#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A RUN OF ONE AGENT TOOL STARTED FROM HERE IS GIVEN, FOR A LAUNCHER WRITTEN IN SHELL.
 *
 *     node tools/run-permissions.mjs <runtime word>
 *
 * `tools/dsh-hooks/run-agent.sh` asks this before it starts dsh, so the rule of two decisions is worked out in one
 * place, src/config/run-permissions.mjs, and not a second time in bash. It
 * reads this process's environment and `.env`, the same world the office's own worker reads.
 *
 * WHAT IT PRINTS, one line each, on standard output:
 *
 *     # <one sentence: full or not, and why>
 *     export NAME=value      set this in the tool's environment
 *     unset NAME             take this out of it
 *
 * The first line is always the sentence. A tool whose full permissions are arguments (Claude Code,
 * Codex) has nothing to export; its sentence still says whether a launcher should pass them.
 *
 * THE GUARD IS READ AS `theGuardOn` READS IT FOR A COMMAND WITH NO ARGUMENTS. For dsh that is the
 * hooks file the office profile mounts, tools/dsh-hooks/hooks.json, which is what run-agent.sh starts
 * dsh with; for the others it is "not mounted", because a shell launcher of them would have to pass
 * their command, and none does.
 *
 * Exit 0 when it answered, 1 when the environment's claim could not be read (a SANDBOX_DIR that is
 * not an absolute path): then the refusal is on standard error and nothing should be started. 2 for
 * bad usage.
 */

import { mergedEnvironment } from '../src/config/settings.mjs'
import { RUNTIMES_WITH_A_FULL_FORM, thePermissionsARunGets } from '../src/config/run-permissions.mjs'
import { theGuardOn } from '../src/config/main-world-guard.mjs'

const [runtime, ...rest] = process.argv.slice(2)
if (runtime === undefined || rest.length > 0 || runtime.startsWith('-')) {
  process.stderr.write(`node tools/run-permissions.mjs <${RUNTIMES_WITH_A_FULL_FORM.join(' | ')}>\n`)
  process.exit(2)
}

let answer
try {
  answer = thePermissionsARunGets(runtime, mergedEnvironment(), theGuardOn(runtime, { args: [] }))
} catch (why) {
  process.stderr.write(`run-permissions: ${why instanceof Error ? why.message : String(why)}\n`)
  process.exit(1)
}
const lines = [`# ${answer.because}`]
for (const [name, value] of Object.entries(answer.env)) lines.push(value === null ? `unset ${name}` : `export ${name}=${value}`)
process.stdout.write(`${lines.join('\n')}\n`)
