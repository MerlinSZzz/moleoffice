// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE ENVIRONMENT A CODEX IS STARTED WITH: ONE LIST OF THE NAMES IT KEEPS, AND ONE FUNCTION THAT KEEPS ONLY THEM.
 *
 * Every start of Codex that the office makes hands its finished environment to `theEnvironmentACodexGets` as its last
 * step. So a name a later change adds to a start is dropped too, unless this list keeps it. No other place keeps a list
 * of a Codex's names.
 *
 * It is a list of what is kept, not of what is dropped. A start's environment comes from the office, the launcher and
 * whichever shell started them, and nobody can list what those might hold. A list of names to drop lets through every
 * name nobody thought of, and that is how a Codex run was once given the names of a Claude Code session.
 *
 * A name is matched as the system spells names (`theSameSpelling`), so in any case on Windows, and the Codex is given it
 * as this list spells it. That is how `theEnvironmentATerminalGets` in src/server/lib/terminals.ts matches its names.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS LEFT OUT, AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * Everything this list does not name. These names were read and left out on purpose, so nobody adds them back unasked:
 *   - every other runtime's key: ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN, DEEPSEEK_API_KEY, OPENCODE_API_KEY and
 *     OPENROUTER_API_KEY. A Codex signs in with none of them;
 *   - every CLAUDE_CODE_* name and CLAUDECODE. They belong to a Claude Code session, and one of them carries a token;
 *   - SANDBOX_RUN_KEY. A run's key reaches its Codex as MOLE_AGENT_KEY, which is kept;
 *   - the proxy names, in capitals and in small letters (HTTP_PROXY, HTTPS_PROXY, NO_PROXY, ALL_PROXY). A proxy address
 *     can hold a password, and no office setup uses a proxy;
 *   - SSL_CERT_FILE and SSL_CERT_DIR. It is not confirmed that Codex reads them, and no office setup uses them;
 *   - MOLE_OFFICE_DSH_DIR and DSH_HOME, which are dsh's;
 *   - DEBIAN_FRONTEND and DISABLE_AUTOUPDATER, which the sandbox image sets for other programs;
 *   - SLOT_ASK_EVERY_S_FOR_A_TEST and SWEEP_PAUSE_MS_FOR_A_TEST, which only tests set.
 */

import { CODEX_OFFICE_MCP_ENV_VARS, FULL_PERMISSIONS, IN_A_SANDBOX, OFFICE_TOOL_CONFIGURATION } from './run-permissions.mjs'
import { thisSystem } from './systems/the-system.mjs'
import { theSameSpelling } from './the-paths-of-a-system.mjs'

/**
 * @typedef {import('./systems/the-system.mjs').ASystem} ASystem
 * @typedef {{ name: string, because: string }} AKeptName
 * @typedef {{ group: string, names: readonly string[], because: string }} AKeptGroup
 * @typedef {{ group: string, theSystems: 'aTerminalIsGiven', because: string }} TheSystemsGroup
 * @typedef {AKeptName | AKeptGroup | TheSystemsGroup} AnEntry
 */

/**
 * THE NAMES A CODEX KEEPS, each name or named group with its reason. The one group read from the system is the
 * terminal's list, which differs between Linux or the Mac and Windows.
 * @type {readonly AnEntry[]}
 */
export const THE_NAMES_A_CODEX_KEEPS = Object.freeze([
  Object.freeze({
    group: "the names a shell needs on this system",
    theSystems: /** @type {const} */ ('aTerminalIsGiven'),
    because: "What a program needs to run as in this user's own shell on this system, Windows included. They are read from " +
      'aTerminalIsGiven in src/config/systems/the-system.mjs, and that list says none of its names carries a key.',
  }),
  Object.freeze({
    group: "a terminal's screen",
    names: Object.freeze(['TERM', 'COLORTERM']),
    because: 'A Codex shown in a terminal draws its screen by them.',
  }),
  Object.freeze({
    group: "what Codex's env_vars forwards to the office tool",
    names: CODEX_OFFICE_MCP_ENV_VARS,
    because: 'CODEX_OFFICE_MCP_ENV_VARS in src/config/run-permissions.mjs: the office names, the run\'s own office key, ' +
      'the path of the agent\'s own key file and never the key in it, the run\'s output file, and CODEX_HOME, where ' +
      'Codex keeps its sign-in, its configuration and its sessions.',
  }),
  Object.freeze({
    group: "Codex's sign-in by key",
    names: Object.freeze(['OPENAI_API_KEY', 'CODEX_API_KEY']),
    because: 'The two names a Codex signs in by key with. Which of the two Codex reads is not confirmed, so both are kept, ' +
      'and a run holds whichever its launcher was given.',
  }),
  Object.freeze({
    group: "a provider row's key and address",
    // THE_CODEX_PROVIDER_VARIABLES in tools/inspector-sandbox.mjs. src/ imports nothing from tools/, so they are words
    // here, and tests/the-environment-a-codex-gets.test.ts fails when the two differ.
    names: Object.freeze(['PROVIDER_ROW_API_KEY', 'PROVIDER_ROW_BASE_URL']),
    because: 'A provider row hands Codex its key and its address under these names, through model_providers.<id>.env_key.',
  }),
  Object.freeze({
    group: "the names the office sets for a run's own commands",
    // SANDBOX_FACTS is THE_FACTS_VARIABLE in tools/sandbox-common.mjs, held as a word for the same reason, with the same test.
    names: Object.freeze([IN_A_SANDBOX, OFFICE_TOOL_CONFIGURATION, 'SANDBOX_FACTS', 'MOLE_OFFICE_API_ROOT', 'MOLE_OFFICE_AGENT_MODEL', 'MOLE_OFFICE_COMMIT_EMAIL']),
    because: "The office's tools and hooks that a run's commands start read them. None of them is a key: " +
      `${OFFICE_TOOL_CONFIGURATION} is the path of the file the run's key is read from.`,
  }),
  Object.freeze({
    group: "each runtime's full permissions",
    names: Object.freeze(Object.values(FULL_PERMISSIONS).flatMap((full) => Object.keys(full.env))),
    because: 'The names of FULL_PERMISSIONS in src/config/run-permissions.mjs. aCommandsPermissions gives them to every ' +
      'command, so another runtime started from a Codex command keeps its full form. None of them is a key.',
  }),
  Object.freeze({
    group: "the names a run commits under",
    names: Object.freeze(['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL']),
    because: 'The run commits under the names its launcher gave it.',
  }),
  Object.freeze({
    group: "the sandbox image's installs and browsers",
    names: Object.freeze(['npm_config_nodedir', 'NPM_CONFIG_UPDATE_NOTIFIER', 'PLAYWRIGHT_BROWSERS_PATH']),
    because: "The sandbox image sets them for the run's npm installs and its browser tests.",
  }),
  Object.freeze({
    group: 'the home and the visit of a run away from home',
    // envFor in src/worker/runtimes/adapter.ts gives them, and tests/the-environment-a-codex-gets.test.ts fails when envFor
    // gives a run away from home a name this list does not keep.
    names: Object.freeze(['MOLE_OFFICE_HOME_WORLD', 'MOLE_OFFICE_VISIT']),
    because: "Criterion C6 of design/messages/ACCEPTANCE.md: the environment of a run working away from home carries its " +
      'home and its visit. Neither is a key.',
  }),
  Object.freeze({
    name: 'BROWSER',
    because: "The tool's own sign-in (startTheToolsOwnSignIn in src/server/lib/setting-up-an-agent-tool.ts) starts with " +
      'BROWSER set to a program that opens nothing, so that no second browser tab opens. The criterion ' +
      "tests/a-sign-in-answers-only-the-address-its-tool-declares.test.ts checks that for Codex's sign-in too. Its value " +
      'names a program and is not a key.',
  }),
  Object.freeze({
    name: 'SANDBOX_PROCESS_ROW',
    // The launcher's other name, SANDBOX_LAUNCH_LOGS, needs no entry: tools/sandbox-start.mjs deletes it from the
    // command's environment before the gate runs.
    because: "The sandbox helper's gate (GATE in tools/sandbox-start.mjs) gives every command it starts the id of that " +
      "command's own process row under this name. A run's commands take seats under that row: tools/test-batch-seat.mjs " +
      'reads it inside a sandbox when its caller passes no row, and stops without it; tools/slot.mjs takes it as ' +
      '--resource inside a sandbox. Its value is an id, not a key.',
  }),
])

/**
 * THE KEPT NAMES ON ONE SYSTEM, each with its reason, and the starts of names kept whole (LC_ on Linux and the Mac).
 * @param {ASystem} system
 * @returns {{ names: AKeptName[], startingWith: AKeptName[] }}
 */
export function theNamesACodexKeepsOn(system) {
  /** @type {AKeptName[]} */
  const names = []
  /** @type {AKeptName[]} */
  const startingWith = []
  for (const entry of THE_NAMES_A_CODEX_KEEPS) {
    if ('name' in entry) names.push(entry)
    else if ('names' in entry) for (const name of entry.names) names.push({ name, because: entry.because })
    else {
      const given = system[entry.theSystems]
      for (const name of given.names) names.push({ name, because: entry.because })
      for (const start of given.startingWith) startingWith.push({ name: start, because: entry.because })
    }
  }
  return { names, startingWith }
}

/**
 * THE ENVIRONMENT A CODEX GETS: a new object holding only the names the list keeps, out of the environment a start
 * finished with. A name with no value is left out.
 * @param {Readonly<Record<string, string | undefined>>} env
 * @param {ASystem} [system]
 * @returns {Record<string, string>}
 */
export function theEnvironmentACodexGets(env, system = thisSystem()) {
  const { names, startingWith } = theNamesACodexKeepsOn(system)
  /** @type {Record<string, string>} */
  const out = {}
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) continue
    const listed = names.find((one) => theSameSpelling(one.name, name, system.platform))
    if (listed !== undefined) out[listed.name] = value
    else if (startingWith.some((start) => name.startsWith(start.name))) out[name] = value
  }
  return out
}
