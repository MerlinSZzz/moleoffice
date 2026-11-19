// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLUGIN THAT KEEPS THE PROVIDER KEYS OUT OF THE COMMANDS AN OPENCODE AGENT RUNS (round 57; mkofsn195wGD, widened
 * to every provider key by MMYiBgR1p7gr and vRE7nNlTQsrB).
 *
 * OpenCode 1.18.31 gives a command its bash tool runs OpenCode's own environment, and then what each plugin's shell.env
 * hook puts in output.env over it. A name set to undefined there is left out of the command's environment. The session's
 * own shell and its terminal take the same hook; OpenCode's MCP servers do not. OpenCode keeps the keys itself, so it still
 * reaches its model (tests/an-opencode-agents-shell-does-not-see-its-key.test.ts, against the real OpenCode).
 * tools/sandbox-start.mjs names this file for every OpenCode command.
 *
 * IT IS HYGIENE AND NOT A WALL. A command runs as the same user as OpenCode and can read OpenCode's environment in /proc.
 * A check runs OpenCode with --pure, which loads no plugin, so a check's commands still see its key; the infrastructure
 * agent's key layer is the fix for both. MOLE_AGENT_KEY stays: an OpenCode command writes on its run with it
 * (theKeyForAWriteOnTheRun in tools/use-line.mjs), since src/config/run-permissions.mjs gives OpenCode no office tool file.
 *
 * THE KEYS ARE THE ONES THE TEMPLATE GIVES OPENCODE: every name in sandboxes/mole-office-dev/sandbox.json's secrets whose
 * readBy holds opencode. The test fails when the two lists part.
 *
 * OPENCODE_CONFIG_CONTENT GOES TOO (EuJ4HiWuImkt): under the provider router bridge it holds the run's token as the
 * provider's key (tools/provider-router-bridge.mjs). OpenCode read it when it started and loaded its plugins from it then.
 * A command that starts OpenCode again goes through tools/sandbox-start.mjs, which builds the content anew.
 *
 * ONLY THE PLUGIN IS EXPORTED. OpenCode calls every function a plugin module exports as a plugin.
 */
const PROVIDER_KEYS = ['DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENCODE_API_KEY', 'OPENROUTER_API_KEY']
const TAKEN_OUT = [...PROVIDER_KEYS, 'OPENCODE_CONFIG_CONTENT']

export const MoleOfficeShellWithoutProviderKeys = async () => ({
  /** @param {unknown} _input @param {{ env: Record<string, string | undefined> }} output */
  'shell.env': async (_input, output) => {
    for (const name of TAKEN_OUT) output.env[name] = undefined
  },
})
