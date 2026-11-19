// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE HARNESS'S OWN SUBAGENTS AND WORKFLOWS ARE OFF IN EVERY RUN, BY ONE LIST. Every place that starts a harness reads
 * its switch from here: the sandbox launchers through tools/harness-features-off.mjs, and the office's own terminal
 * launches in src/server/lib/terminal-agents.ts. Work a run would hand to a subagent goes to a worker registered in the
 * office, where it is recorded. Each switch was read from the version in the sandbox image, by sending its first model
 * request to a stand-in server and reading the tools it named:
 * - Claude Code 2.1.281 sends the tools Agent and Workflow, and ListAgents and SendMessage, which only talk to subagents
 *   and agent teams. --disallowedTools after the program takes them out, and so does permissions.deny in its settings
 *   file. The list also names Task, the older name of its subagent tool, and RunWorkflow, which that version also knows.
 *   TaskStop stays: it also stops a run's own background commands.
 * - codex-cli 0.159.2 sends its subagent tool through the feature multi_agent, and through multi_agent_v2 when that is
 *   on. --disable before exec turns both off, for a new run and a resumed one, and so does each set false under
 *   [features] in its config.toml. It has no workflow feature.
 * - OpenCode 1.18.31 reads permission.task from OPENCODE_CONFIG_CONTENT, over OPENCODE_PERMISSION and over its home's
 *   config, and then gives no agent its task tool. It has no workflow tool.
 * - dsh 0.1.5-rc.2 loads its tools as rows of a profile. dsh-harness-features-off.patch.json, beside this file, disables
 *   the subagent, workflow and ralph rows, and dsh takes it with --patch.
 */
import { fileURLToPath } from 'node:url'

/** The tools a Claude Code run is denied, by the names its version gives them, in the order its switch names them. */
export const CLAUDE_CODE_TOOLS_OFF = Object.freeze(['Agent', 'Task', 'Workflow', 'RunWorkflow', 'ListAgents', 'SendMessage'])
/** Claude Code's switch in its command, as one word after the program. */
export const CLAUDE_CODE_FEATURES_OFF = Object.freeze([`--disallowedTools=${CLAUDE_CODE_TOOLS_OFF.join(',')}`])
/** The Codex features that give a run its subagent tool. */
export const CODEX_FEATURE_NAMES_OFF = Object.freeze(['multi_agent', 'multi_agent_v2'])
/** Codex's switches in its command. They go before exec: an option there applies to the run that exec starts or resumes. */
export const CODEX_FEATURES_OFF = Object.freeze(CODEX_FEATURE_NAMES_OFF.flatMap(name => ['--disable', name]))
/** What OpenCode's config gets, merged into any OPENCODE_CONFIG_CONTENT the command already has. */
export const OPENCODE_FEATURES_OFF = Object.freeze({ permission: Object.freeze({ task: 'deny' }) })
/** Where a checkout holds dsh's patch list, so that a launcher can name it in another checkout as well. */
export const DSH_PATCH_IN_A_CHECKOUT = 'src/config/dsh-harness-features-off.patch.json'
/** dsh's switch: the patch list in this checkout, a file so that every dsh start can name the same one. */
export const DSH_FEATURES_OFF = Object.freeze(['--patch', fileURLToPath(new URL(`../../${DSH_PATCH_IN_A_CHECKOUT}`, import.meta.url))])

/**
 * OPENCODE_CONFIG_CONTENT with OpenCode's switch merged in, keeping everything else the content says. No content is an
 * empty config. Content that is not a JSON object, or whose permission is not an object, is refused, because the switch
 * cannot be put into it.
 * @param {string | undefined} content
 * @returns {string}
 */
export function anOpenCodeConfigWithTheFeaturesOff(content) {
  let config = null
  try { config = JSON.parse(content ?? '{}') } catch { config = null }
  const object = (/** @type {unknown} */ value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  if (!object(config) || (config.permission !== undefined && !object(config.permission))) {
    throw new Error("OPENCODE_CONFIG_CONTENT is not a JSON object whose permission is an object, so OpenCode's task tool could not be turned off in it. Nothing was started.")
  }
  return JSON.stringify({ ...config, permission: { ...config.permission, ...OPENCODE_FEATURES_OFF.permission } })
}
