// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHAT PERMISSIONS A RUN OF AN AGENT TOOL IS STARTED WITH, WORKED OUT IN ONE PLACE.
 *
 * ---------------------------------------------------------------------------------------
 * THE OWNER'S TWO DECISIONS
 * ---------------------------------------------------------------------------------------
 *
 * A decision of 22 September 2026 says that inside a sandbox, Claude Code, Codex, OpenCode and dsh all run with their
 * full permissions, because the container is the wall. Another decision, the same day, refines
 * it for the host: a run in the main world gets its full permissions only when the main-world guard is mounted into its
 * tool. Otherwise it runs with the tool's own default, and the office adds nothing.
 *
 * They amend an older rule: a Claude Code run the office started carried no permission flag at all,
 * because giving a started process new powers is an important decision point, and those are the
 * owner's (design/messages/ACCEPTANCE.md, section 0). These two decisions are the owner making it.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE A RUN IS, AND HOW THAT IS READ
 * ---------------------------------------------------------------------------------------
 *
 * IN A SANDBOX when `SANDBOX_DIR` is in the environment. `tools/sandbox-start.mjs` sets it for
 * every process it starts in a sandbox, and it is the one place a run's `sandbox` field is written,
 * so every process below it inherits it. A value that is not an absolute path is refused: a
 * malformed claim never widens anything.
 *
 * ON THE HOST WITH THE GUARD when the run's own command carries the main-world guard, mounted the
 * way that tool mounts it. `theGuardOn` in src/config/main-world-guard.mjs reads the command back and
 * answers; the launcher that built the command asks it and hands the answer in here. So the marker
 * is the command itself and cannot drift from it: there is no separate claim to set, or to forget,
 * and a guard mounted into one tool says nothing about another. (Until the bootstrap batch was put
 * together, 22 September 2026, a `MOLE_OFFICE_GUARD` list in the environment was the marker. Nothing
 * set it, and the guard used the same name for the OpenCode plugin's command, so it was replaced by
 * the command itself.)
 *
 * OTHERWISE ON THE HOST WITHOUT THE GUARD. Nothing is added. A full-permission value the environment
 * carried in is taken out, so a run cannot inherit what nobody gave it: a dsh supervisor that ran
 * with `DSH_PERMISSION_MODE=danger-full-access` would otherwise hand it to every worker it starts.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT "FULL" IS FOR EACH TOOL, MEASURED ON 22 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * Each was measured on this machine with HOME, XDG and CODEX_HOME pointed at a scratch folder and no
 * credentials, so nothing reached a model.
 *
 * - Claude Code 2.1.278: `--permission-mode bypassPermissions`. The `system init` event of
 *   `claude -p --output-format stream-json --verbose` said `"permissionMode":"default"` without it and
 *   `"permissionMode":"bypassPermissions"` with it.
 * - Codex 0.155.1: `-s danger-full-access -a never`, BEFORE `exec`. `codex exec --help` lists `-s`
 *   and has no `-a`; `codex exec resume --help` has neither. Both are top-level options, and placed
 *   before `exec` they reach a new run and a resumed one alike: the banner said
 *   `approval: never` / `sandbox: danger-full-access` for both. Without them a new run says
 *   `sandbox: read-only`, and a resumed one `workspace-write`.
 * - OpenCode 1.18.31: `OPENCODE_PERMISSION={"bash":"allow","edit":"allow","webfetch":"allow"}` in
 *   the environment. `opencode debug config` printed `permission: null` without it and those three
 *   with it; the binary merges it over every configuration file. OPENCODE_CONFIG_CONTENT does the
 *   same, and is left alone because the guard may need it for its plugin. NOTE: OpenCode's own
 *   default already allows all three (`opencode debug agent build` starts with `"*": "allow"`), so
 *   on the host "its own default" is not a restricted one. See the handback of this piece.
 * - dsh 0.1.5-rc.2: `DSH_PERMISSION_MODE=danger-full-access` in the environment. Its base profile
 *   reads it as `mode: process.env.DSH_PERMISSION_MODE ?? 'workspace-write'`, with approval `never`
 *   for danger-full-access and `ask` otherwise.
 *
 * FULL-PERMISSION ARGUMENTS ARE INSERTED RIGHT AFTER THE PROGRAM'S NAME: Codex's -s/-a reach new
 * and resumed runs there, and the other tools accept that placement. Claude Code's later MCP flag
 * precedes its permission arguments; its equals form keeps the variadic option from swallowing a prompt.
 * CODEX'S OFFICE TOOL AND SHELL POLICY
 * OVERRIDES GO AFTER exec OR ITS e ALIAS, and after the program's name otherwise: Codex 0.159.2
 * ignores root -c overrides for exec (GX23T1MQs-aZ; inspector's vtuzjBniM_iu).
 */

import { lstatSync, readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { REPO_ROOT, theInstallsNode } from './settings.mjs'
import { theGuardOn } from './main-world-guard.mjs'
import { theAgentKey } from './agent-key-reader.mjs'

/** The variable `tools/sandbox-start.mjs` sets for every process it starts in a sandbox. */
export const IN_A_SANDBOX = 'SANDBOX_DIR'

/** The server belongs to the launcher's checkout, even when its command runs in another worktree. */
export const OFFICE_MCP_SERVER = join(REPO_ROOT, 'tools', 'office-mcp.mjs')
/** Only names go into Codex's configuration; env_vars forwards their values from its environment. */
export const OFFICE_MCP_ENV_VARS = Object.freeze([
  'MOLE_OFFICE_AGENT', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_API', 'MOLE_AGENT_KEY',
])

/**
 * THE RUN'S OUTPUT FILE, which tools/sandbox-start.mjs names to a Codex run that keeps its output, in wave 13s
 * round 34. Codex 0.159.2 gives its MCP server no thread id, even when env_vars names
 * CODEX_THREAD_ID (measured 11 October 2026), and the file's first line names the thread. office_request reads the
 * thread's own rollout from it at the run's seal (tools/the-seal-receipt.mjs).
 */
export const THE_RUN_OUTPUT = 'MOLE_OFFICE_RUN_OUTPUT'

/** What Codex's env_vars forwards to office_request: the office's names, and the two its seal receipt reads. */
export const CODEX_OFFICE_MCP_ENV_VARS = Object.freeze([...OFFICE_MCP_ENV_VARS, THE_RUN_OUTPUT, 'CODEX_HOME'])

/**
 * RJradfGfKxlq: the variable naming a Claude Code run's office tool configuration, for the run's own hooks. It holds the
 * path, never the key. Claude Code runs its hooks in its own environment, which holds no MOLE_AGENT_KEY unless the run
 * starts runs, and since the key window closed the office refuses every read under an agent's name that carries no key.
 * So the hooks take the run's key from this file (tools/dsh-hooks/office.mjs, theHeaders); agreed in message
 * 1s5mFLOPSg-4.
 */
export const OFFICE_TOOL_CONFIGURATION = 'MOLE_OFFICE_TOOL_CONFIGURATION'

/**
 * THE RUN'S KEY IN AN OFFICE TOOL CONFIGURATION `aClaudeCommandsOfficeTool` WROTE, or null. Answered only when the
 * configuration names the very agent and run that ask, so a file that names another agent or another run gives no key
 * (message 1s5mFLOPSg-4). The shape is read here, beside the code that writes it.
 * @param {unknown} configuration The file's contents, parsed.
 * @param {{agent: string | undefined, session: string | undefined}} asking The hook's own MOLE_OFFICE_AGENT and MOLE_OFFICE_SESSION.
 * @returns {string | null}
 */
export function theRunsKeyInItsOfficeToolConfiguration(configuration, { agent, session }) {
  return theRunsKeyOrWhyNot(configuration, { agent, session }).key
}

/**
 * The same reading, with the reason when it gives no key: the configuration holds no office tool, names another agent,
 * names another run, or holds no key. The reason names the agent and the run, never the key.
 * @param {unknown} configuration The file's contents, parsed.
 * @param {{agent: string | undefined, session: string | undefined}} asking
 * @returns {{ key: string, why: null } | { key: null, why: string }}
 */
function theRunsKeyOrWhyNot(configuration, { agent, session }) {
  const written = /** @type {{mcpServers?: {mole_office?: {env?: Record<string, unknown>}}} | null} */ (configuration)
  const env = written?.mcpServers?.mole_office?.env
  if (env === null || env === undefined || typeof env !== 'object') return { key: null, why: 'it holds no office tool' }
  if (typeof agent !== 'string' || agent === '' || env['MOLE_OFFICE_AGENT'] !== agent) {
    return { key: null, why: `it names the agent ${String(env['MOLE_OFFICE_AGENT'])}, not this one (${String(agent || 'none')})` }
  }
  if (typeof session !== 'string' || session === '' || env['MOLE_OFFICE_SESSION'] !== session) {
    return { key: null, why: `it names the run ${String(env['MOLE_OFFICE_SESSION'])}, not this one (${String(session || 'none')})` }
  }
  const key = env['MOLE_AGENT_KEY']
  return typeof key === 'string' && key !== '' ? { key, why: null } : { key: null, why: 'it holds no key' }
}

/**
 * A RUN'S OWN KEY, READ FROM THE FILE MOLE_OFFICE_TOOL_CONFIGURATION NAMES, for the run's hooks (problem RJradfGfKxlq)
 * and for the use lines of the commands it runs (problems rB33NQrssDEu and 4aX9F5p2XbDx): one reading for both (see
 * message I7tf4M-nNaER). The launcher takes MOLE_AGENT_KEY out of a Claude Code run's shell, so a command the run starts
 * holds no key, and the office refuses a write under an agent's name that carries none. The shell holds only the
 * file's path.
 *
 * THE FILE MUST BE THE RUN'S OWN AND KEPT FROM EVERYONE ELSE: a plain file, not a link, that this user owns and nobody
 * else may read or write, which names this very agent and run. Otherwise there is no key, and `why` says which of those
 * failed. The key is read at the moment of use, for the one request it goes in; it is never printed and never put in
 * an environment. tools/sandbox-start.mjs writes the file with mode 600 in a folder of its own with mode 700.
 *
 * @param {Record<string, string | undefined>} env The environment that names the file.
 * @param {{agent: string | undefined, session: string | undefined}} asking The agent and run the key is read for.
 * @returns {{ key: string, why: null } | { key: null, why: string }}
 */
export function theRunsKeyFromItsOfficeToolFile(env, { agent, session }) {
  const path = env[OFFICE_TOOL_CONFIGURATION]
  if (typeof path !== 'string' || path === '') return { key: null, why: `${OFFICE_TOOL_CONFIGURATION} names no office tool configuration` }
  const named = `the office tool configuration ${path}`
  /** @type {import('node:fs').Stats} */
  let file
  try {
    file = lstatSync(path)
  } catch {
    return { key: null, why: `${named} is not there` }
  }
  if (!file.isFile()) return { key: null, why: `${named} is not a plain file` }
  if (typeof process.getuid === 'function' && file.uid !== process.getuid()) return { key: null, why: `${named} belongs to another user` }
  if ((file.mode & 0o077) !== 0) {
    return { key: null, why: `${named} may be read or written by others than its owner (mode ${(file.mode & 0o777).toString(8)})` }
  }
  /** @type {unknown} */
  let configuration
  try {
    configuration = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return { key: null, why: `${named} does not read as JSON` }
  }
  const read = theRunsKeyOrWhyNot(configuration, { agent, session })
  return read.key === null ? { key: null, why: `${named} is not this run's own: ${read.why}` } : read
}

/**
 * THE KEY A RUN'S TOOL SENDS, AND WHERE IT CAME FROM. This is the one place the order is written. officeHeaders in
 * tools/sandbox-common.mjs and tools/rules-chapters.mjs both ask here.
 *   1. The environment's key, from MOLE_AGENT_KEY_FILE or MOLE_AGENT_KEY (theAgentKey). The answer says `environment`.
 *   2. When the environment holds none, the run's own key from the office tool file MOLE_OFFICE_TOOL_CONFIGURATION
 *      names, read by theRunsKeyFromItsOfficeToolFile for this agent and this run. The answer says `file`. The file is
 *      read only when the agent and the run are both strings that are not empty.
 *   3. Otherwise no key, and `why` says why. When the agent or the run is empty, `why` names which, in the words
 *      `names` gives for them. Otherwise it is the reason theRunsKeyFromItsOfficeToolFile gives. `why` never holds a key.
 * A key the caller is handed comes before all of these, and is the caller's to put first.
 *
 * @param {Record<string, string | undefined>} env The environment read.
 * @param {{agent?: string, session?: string}} asking The agent and the run the key is read for.
 * @param {{agent: string, session: string}} [names] The words `why` uses for the agent and the run. A caller that reads
 *   the two from variables passes the variables' names, so the reason names what the person can set.
 * @returns {{ key: string, from: 'environment' | 'file', why: null } | { key: null, from: null, why: string }}
 */
export function theKeyARunsToolSends(env, { agent, session }, names = { agent: 'the agent', session: 'the run' }) {
  const environments = theAgentKey(env)
  if (environments !== null) return { key: environments, from: 'environment', why: null }
  /** @type {Array<[string, unknown]>} */
  const asked = [[names.agent, agent], [names.session, session]]
  const notSet = asked.filter(([, value]) => typeof value !== 'string' || value === '').map(([name]) => name)
  if (notSet.length > 0) {
    return { key: null, from: null, why: `${notSet.join(' and ')} ${notSet.length === 1 ? 'is' : 'are'} not set, so the run's office tool file was not read` }
  }
  const read = theRunsKeyFromItsOfficeToolFile(env, { agent, session })
  return read.key === null ? { key: null, from: null, why: read.why } : { key: read.key, from: 'file', why: null }
}

/**
 * Read the program once for the office tools and the launcher's explanation.
 * @param {readonly string[]} command
 */
export function aCommandsProgram(command) {
  const program = String(command[0] ?? '').split('/').pop()
  return { program, isCodex: theWordIsCodex(program) }
}

/**
 * Read a run record's runtime word for the launcher's usage receipt, by the same rule as a program.
 * @param {unknown} runtime
 */
export function aRuntimeIsCodex(runtime) {
  return theWordIsCodex(runtime)
}

/** @param {unknown} word */
function theWordIsCodex(word) {
  return word === 'codex'
}

/**
 * THE CODEX OPTIONS THAT TAKE A VALUE, at the top level and on exec, so a scan of a command skips the value: a model,
 * profile or setting named "exec" or "resume" is not the subcommand. aCommandsOfficeTool finds exec with it, and
 * tools/sandbox-common.mjs finds a resumed thread's `resume` with it.
 */
export const CODEX_OPTIONS_WITH_A_VALUE = new Set([
  '-c', '--config', '--enable', '--disable', '--remote', '--remote-auth-token-env',
  '-i', '--image', '-m', '--model', '--local-provider', '-p', '--profile',
  '-s', '--sandbox', '-C', '--cd', '--add-dir', '-a', '--ask-for-approval',
  '--output-schema', '--color', '-o', '--output-last-message',
])

/**
 * IcgsA-OGvbzL: messages hX_qDiISkTCp, xu5mbrN9ucmN and t_YPyiwf07YJ give Codex office_request.
 * RATbb8xNemOW, step 2: Codex's shell policy takes MOLE_AGENT_KEY out of a worker's commands while
 * env_vars still forwards it from Codex itself to office_request. A run that starts runs keeps it
 * (t_YPyiwf07YJ). This is hygiene, not a wall: the same user can read Codex's /proc environment.
 * f_hnh472ssVM: every such run, a run that starts runs too, writes no shell snapshot. Codex 0.159.2 writes its
 * commands' environment, values included, to CODEX_HOME/shell_snapshots, and a killed run leaves the file there.
 * @param {readonly string[]} command
 * @param {Record<string, string | undefined>} env
 * @param {{plainEnv?: boolean, startsRuns?: boolean}} [options]
 * @returns {{command: string[], says: string[]}}
 */
export function aCommandsOfficeTool(command, env, { plainEnv = false, startsRuns = false } = {}) {
  if (plainEnv || !aCommandsProgram(command).isCodex ||
      !OFFICE_MCP_ENV_VARS.slice(0, 4).every((name) => typeof env[name] === 'string' && env[name].trim() !== '')) {
    return { command: [...command], says: [] }
  }
  const overrides = [
    '-c', 'mcp_servers.mole_office.command="node"',
    '-c', `mcp_servers.mole_office.args=${JSON.stringify([OFFICE_MCP_SERVER])}`,
    '-c', `mcp_servers.mole_office.env_vars=${JSON.stringify(CODEX_OFFICE_MCP_ENV_VARS)}`,
    '-c', 'mcp_servers.mole_office.enabled=true',
    // -c replaces any configured exclude list; sandbox config.toml has no shell_environment_policy
    // (measured 30 September 2026, IcgsA-OGvbzL). Any future exclude list must include MOLE_AGENT_KEY too.
    ...(codexKeepsTheKeyFromItsShell(command, startsRuns) ? ['-c', 'shell_environment_policy.exclude=["MOLE_AGENT_KEY"]'] : []),
    // Measured on 0.159.2 (f_hnh472ssVM): with this switch no snapshot folder is made, and commands still run.
    '-c', 'features.shell_snapshot=false',
  ]
  // GX23T1MQs-aZ / IcgsA-OGvbzL: measured on Codex 0.159.2, exec starts this MCP server
  // only with overrides after exec. Find the first word that is neither an option nor its value:
  // a model/profile named "exec" is not the subcommand, and a later prompt may say "exec" too.
  // Interactive commands and every other subcommand keep the overrides after the program's name.
  let at = 1
  for (let i = 1; i < command.length; i++) {
    const word = command[i] ?? ''
    if (word === '--') break
    if (word.startsWith('-')) {
      if (CODEX_OPTIONS_WITH_A_VALUE.has(word)) i++
      continue
    }
    // Inspector's vtuzjBniM_iu: codex --help names e as exec's alias.
    if (word === 'exec' || word === 'e') at = i + 1
    break
  }
  return {
    command: [...command.slice(0, at), ...overrides, ...command.slice(at)],
    says: [
      `Codex gets office_request through ${OFFICE_MCP_SERVER}; env_vars forwards ${CODEX_OFFICE_MCP_ENV_VARS.join(', ')} by name (IcgsA-OGvbzL, step 1).`,
      startsRuns
        ? "--starts-runs: Codex's commands keep MOLE_AGENT_KEY, because this run starts runs."
        : "Codex's commands get no MOLE_AGENT_KEY; office_request still has it (RATbb8xNemOW).",
      "Codex writes no shell snapshot, so its commands' environment is not copied to disk.",
    ],
  }
}

/**
 * Whether Codex's shell policy takes MOLE_AGENT_KEY out of the commands Codex runs: for every Codex command, unless the
 * run starts runs (aCommandsOfficeTool). aShellsOfficeToolFile reads the same answer.
 * @param {readonly string[]} command
 * @param {boolean} startsRuns
 */
function codexKeepsTheKeyFromItsShell(command, startsRuns) {
  return aCommandsProgram(command).isCodex && !startsRuns
}

/**
 * THE RUN'S OFFICE TOOL CONFIGURATION, which the launcher writes to a file of mode 600: the office_request server and
 * the run's identity and key, from the command's environment. Claude Code reads it with --mcp-config, and a shell reads
 * the key in it with theRunsKeyFromItsOfficeToolFile. One shape for both, written here beside its reader.
 * @param {Record<string, string | undefined>} env
 */
function theOfficeToolConfiguration(env) {
  const node = theInstallsNode()
  return {
    mcpServers: {
      mole_office: {
        type: 'stdio',
        command: node.program, // Claude need not forward PATH for the server to start.
        args: [OFFICE_MCP_SERVER],
        // What the install's Node needs set goes to this office program alone, never into Claude's own environment.
        env: { ...Object.fromEntries(OFFICE_MCP_ENV_VARS.map((name) => [name, env[name]])), ...node.environment },
      },
    },
  }
}

/**
 * rgAmP45EklqO: Claude Code gets the same office_request server through a per-start MCP file.
 * The launcher writes it in a folder made for it alone in its temporary directory, never in a log or a worktree,
 * before starting Claude, and removes the folder when the command ends.
 * RATbb8xNemOW: take the key out of Claude's environment so its Bash commands do not inherit it;
 * the configuration's env still gives it to the MCP server. --starts-runs keeps it, as for Codex.
 * This is hygiene, not a wall: the same user can read the configuration file.
 * RJradfGfKxlq: the run's hooks run in that same environment, so OFFICE_TOOL_CONFIGURATION names the file for them, the
 * path and not the key. A command could already read the path on Claude's own command line.
 * @param {readonly string[]} command
 * @param {Record<string, string | undefined>} env
 * @param {string} configurationPath
 * @param {{plainEnv?: boolean, startsRuns?: boolean}} [options]
 */
export function aClaudeCommandsOfficeTool(command, env, configurationPath, { plainEnv = false, startsRuns = false } = {}) {
  /** @type {Record<string, string | null>} */
  const changes = {}
  if (plainEnv || aCommandsProgram(command).program !== 'claude' ||
      !OFFICE_MCP_ENV_VARS.slice(0, 4).every((name) => typeof env[name] === 'string' && env[name].trim() !== '')) {
    return { command: [...command], env: changes, configuration: null, says: [] }
  }
  const configuration = theOfficeToolConfiguration(env)
  if (!startsRuns) changes['MOLE_AGENT_KEY'] = null
  changes[OFFICE_TOOL_CONFIGURATION] = configurationPath
  return {
    // --mcp-config goes immediately after the program, in equals form: Commander treats its
    // separate form as variadic and would swallow a following prompt word. Full-permission
    // arguments stay where aCommandsPermissions put them, ahead of the original arguments;
    // Claude accepts them there even with this MCP flag inserted before them.
    command: [command[0] ?? '', `--mcp-config=${configurationPath}`, ...command.slice(1)],
    env: changes,
    configuration,
    says: [
      `Claude Code gets office_request through ${OFFICE_MCP_SERVER}; its configuration ${configurationPath} (mode 600) gives the server ${OFFICE_MCP_ENV_VARS.join(', ')}.`,
      startsRuns
        ? "--starts-runs: Claude Code's commands keep MOLE_AGENT_KEY, because this run starts runs."
        : "Claude Code's commands get no MOLE_AGENT_KEY; office_request still has it (RATbb8xNemOW).",
      `Its hooks find that configuration through ${OFFICE_TOOL_CONFIGURATION}, the path only, and read the run's key from it (RJradfGfKxlq).`,
    ],
  }
}

/**
 * Wave 13n, item 2h: A CODEX OR dsh RUN'S SHELL HAS ITS RUN'S KEY THE WAY A CLAUDE CODE RUN'S SHELL HAS IT.
 * Codex's shell policy (aCommandsOfficeTool) and dsh itself keep MOLE_AGENT_KEY out of every command the model runs, so
 * a tool such as tools/run-named-tests.mjs found no key there, and the run sent its use line by hand. Such a run now
 * gets the configuration a Claude Code run gets, in a file the launcher writes, and OFFICE_TOOL_CONFIGURATION names
 * the file. The key stays out of the shell: tools/use-line.mjs reads it from the file at the moment of a write
 * (theRunsKeyFromItsOfficeToolFile), and the file names the run's own agent and run. That variable is the only change
 * to the command's environment; dsh itself keeps MOLE_AGENT_KEY for its own office_request.
 *
 * ONLY A RUN WHOSE COMMAND HOLDS THE RUN'S OWN KEY gets a file, so the key in it is never the starter's: the launcher
 * puts the run's key in MOLE_AGENT_KEY and nothing else there. A run named with --run holds none, a Codex run that
 * starts runs keeps the key in its shell, OpenCode keeps it in its shell too, and Claude Code has its own file
 * (aClaudeCommandsOfficeTool). As there, this is hygiene and not a wall: the same user can read the file.
 * @param {readonly string[]} command
 * @param {Record<string, string | undefined>} env The command's environment, with the run's own key in MOLE_AGENT_KEY.
 * @param {string} configurationPath
 * @param {{plainEnv?: boolean, startsRuns?: boolean, runtime?: string | null}} [options] `runtime` is the command's
 *   runtime as the launcher reads it (aCommandsRuntime in tools/sandbox-common.mjs): a dsh run's command is a shell.
 * @returns {{env: Record<string, string>, configuration: ReturnType<typeof theOfficeToolConfiguration> | null, says: string[]}}
 */
export function aShellsOfficeToolFile(command, env, configurationPath, { plainEnv = false, startsRuns = false, runtime = null } = {}) {
  const which = codexKeepsTheKeyFromItsShell(command, startsRuns) ? 'Codex' : runtime === 'dsh' ? 'dsh' : null
  if (plainEnv || which === null || !OFFICE_MCP_ENV_VARS.every((name) => typeof env[name] === 'string' && env[name].trim() !== '')) {
    return { env: {}, configuration: null, says: [] }
  }
  return {
    env: { [OFFICE_TOOL_CONFIGURATION]: configurationPath },
    configuration: theOfficeToolConfiguration(env),
    says: [
      `${which}'s commands get no MOLE_AGENT_KEY, so ${OFFICE_TOOL_CONFIGURATION} names ${configurationPath} (mode 600, in a ` +
        "folder made for it alone), which holds this run's own key for tools/use-line.mjs and names this run. The folder goes " +
        'when the command ends.',
    ],
  }
}

/**
 * @typedef {object} GuardAnswer
 * @property {boolean} mounted Whether the run's command carries the main-world guard.
 * @property {string} because One sentence saying how that was read.
 */

/**
 * The answer for a run whose command nobody read for the guard: not mounted. A launcher that knows
 * its command passes `theGuardOn(runtime, command)` instead.
 *
 * @type {Readonly<GuardAnswer>}
 */
export const NOT_READ_FOR_THE_GUARD = Object.freeze({ mounted: false, because: 'Nobody read its command for the guard.' })

/**
 * @typedef {object} FullForm
 * @property {string} program The program the tool is started as.
 * @property {readonly string[]} args What goes on its command line, right after the program's name.
 * @property {Readonly<Record<string, string>>} env What goes in its environment.
 */

/**
 * EACH TOOL'S FULL PERMISSIONS, BY RUNTIME WORD. The only place these words are written.
 *
 * @type {Readonly<Record<string, FullForm>>}
 */
export const FULL_PERMISSIONS = Object.freeze({
  'claude-code': Object.freeze({ program: 'claude', args: Object.freeze(['--permission-mode', 'bypassPermissions']), env: Object.freeze({}) }),
  codex: Object.freeze({ program: 'codex', args: Object.freeze(['-s', 'danger-full-access', '-a', 'never']), env: Object.freeze({}) }),
  opencode: Object.freeze({
    program: 'opencode',
    args: Object.freeze([]),
    env: Object.freeze({ OPENCODE_PERMISSION: JSON.stringify({ bash: 'allow', edit: 'allow', webfetch: 'allow' }) }),
  }),
  dsh: Object.freeze({ program: 'dsh', args: Object.freeze([]), env: Object.freeze({ DSH_PERMISSION_MODE: 'danger-full-access' }) }),
})

/**
 * Read only a direct Codex argv or env followed by simple assignments and Codex. Shell text and
 * unknown descendants are never inspected. Built agent starts must be verifiable; plain commands
 * keep their permission argv and report what could not be checked. Inspector model arrays call
 * this before becoming protected scripts; the check-view launcher cannot verify those inner arrays.
 * @param {readonly string[]} command
 * @param {{runtime?: string | null, plain?: boolean, insert?: boolean}} [options]
 * @returns {{command: string[], says: string[]}}
 */
export function aCodexContainerCommand(command, { runtime = null, plain = false, insert = false } = {}) {
  const at = theCodexProgramAt(command)
  const form = /** @type {FullForm} */ (FULL_PERMISSIONS.codex)
  const contract = `${form.args.join(' ')} before exec`
  /** @param {string} found */
  const refused = (found) => { throw new Error(`Codex container argv refused: found ${JSON.stringify(found)}; requires ${contract}.`) }
  /** @param {string} found */
  const unverified = (found) => {
    if (!plain) refused(found)
    return { command: [...command], says: [`Codex container argv is unverifiable: permissions not verifiable (${JSON.stringify(found)}); no Codex sandbox or approval flags were added to this command.`] }
  }
  if (at === -1) {
    if (aRuntimeIsCodex(runtime)) return unverified(`unverifiable program ${JSON.stringify(command[0] ?? '')}`)
    return { command: [...command], says: plain ? ['Codex container argv is unverifiable for this opaque plain program.'] : [] }
  }
  const expected = new Map([[form.args[0], form.args[1]], [form.args[2], form.args[3]]])
  const seen = new Set()
  let uncertain = null
  let exec = false
  let rootWord = false
  let explicit = false
  // These options take no value. Other spellings are unverifiable, rather than guessed at.
  const switches = new Set(['--json', '--skip-git-repo-check', '--no-alt-screen', '--oss', '--search',
    '--ephemeral', '--help', '-h', '--version', '-V', '--last', '--all', '--dangerously-bypass-hook-trust'])
  for (let i = at + 1; i < command.length; i++) {
    const word = command[i] ?? ''
    if (word === '--') break
    if (expected.has(word)) {
      explicit = true
      const value = command[++i]
      if (value !== expected.get(word)) refused(`${word} ${value ?? '(missing value)'}`)
      if (exec || seen.has(word)) uncertain ??= `${word} ${value} ${exec ? 'after exec' : 'more than once'}`
      seen.add(word)
      continue
    }
    if (/^(?:--sandbox|--ask-for-approval)(?:=|$)|^-[sa].+/.test(word)) {
      explicit = true
      uncertain ??= word
      if (word === '--sandbox' || word === '--ask-for-approval') i++
      continue
    }
    if (word.startsWith('-')) {
      const key = word.split('=')[0] ?? ''
      if (key === '-p' || key === '--profile' || word.startsWith('-p')) uncertain ??= word
      let value = null
      if (CODEX_OPTIONS_WITH_A_VALUE.has(key)) {
        value = word.includes('=') ? word.slice(word.indexOf('=') + 1) : command[++i]
        if (value === undefined) uncertain ??= `${key} (missing value)`
      } else if (/^-[cmCpio].+/.test(word)) {
        value = word.slice(2)
      } else if (!switches.has(word)) uncertain ??= word
      if ((key === '-c' || key === '--config' || word.startsWith('-c')) &&
          typeof value === 'string' && /^(?:[^=]*\.)?["']?(sandbox_mode|approval_policy)["']?\s*=/.test(value.trim())) {
        uncertain ??= `${key} ${value}`
      }
      continue
    }
    if (!rootWord) {
      rootWord = true
      if (word === 'exec') exec = true
      else uncertain ??= word
    }
  }
  if (!exec) uncertain ??= 'no exec subcommand'
  if (uncertain !== null) return unverified(uncertain)
  if (seen.size === 0 && !explicit) {
    if (plain) return { command: [...command], says: ['Codex container command: no permission flags given; no Codex sandbox or approval flags were added to this command.'] }
    if (insert) {
      return { command: [...command.slice(0, at + 1), ...form.args, ...command.slice(at + 1)],
        says: [`Codex container argv checked against ${contract}; ${form.args.join(' ')} was put after codex.`] }
    }
  }
  if (seen.size !== expected.size) return unverified(`missing ${[...expected.keys()].filter(key => !seen.has(key)).join(' and ')}`)
  return { command: [...command], says: [`Codex container argv checked against ${contract}.`] }
}

/** @param {readonly string[]} command */
function theCodexProgramAt(command) {
  let at = 0
  if (String(command[0] ?? '').split('/').pop() === 'env') {
    at = 1
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(command[at] ?? '')) at++
  }
  return aCommandsProgram(command.slice(at)).isCodex ? at : -1
}

/** The runtime words that have a full-permission form here, in the order above. */
export const RUNTIMES_WITH_A_FULL_FORM = Object.freeze(Object.keys(FULL_PERMISSIONS))

/**
 * @typedef {object} Permissions
 * @property {boolean} full Whether the run gets its tool's full permissions.
 * @property {string[]} args What to put on the tool's command line, right after the program's name.
 * @property {Record<string, string | null>} env What to change in its environment: a value sets the
 *   variable, null takes it out.
 * @property {string} because One sentence saying which, and why.
 */

/**
 * The sandbox folder this environment says it is in, or null because it names none.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string | null}
 */
export function theSandboxIn(env) {
  const dir = env[IN_A_SANDBOX]
  if (dir === undefined) return null
  if (dir === '' || !isAbsolute(dir)) {
    throw new Error(
      `${IN_A_SANDBOX} is "${dir}", and it must be the absolute path of the sandbox's instance folder, as ` +
        'tools/sandbox-start.mjs sets it. Nothing was widened, and nothing was started.',
    )
  }
  return dir
}

/**
 * WHAT A RUN OF `runtime` STARTED FROM THIS ENVIRONMENT IS GIVEN.
 *
 * The environment is the whole world, as it is for every reader in this folder: an adapter passes
 * the one it was built with, and a tool passes its own. `guard` is `theGuardOn(runtime, command)`
 * for the command the run is started with, read by the launcher that built it.
 *
 * @param {string} runtime
 * @param {Record<string, string | undefined>} env
 * @param {GuardAnswer} [guard]
 * @returns {Permissions}
 */
export function thePermissionsARunGets(runtime, env, guard = NOT_READ_FOR_THE_GUARD) {
  const form = FULL_PERMISSIONS[runtime]
  if (form === undefined) {
    return {
      full: false,
      args: [],
      env: {},
      because: `${runtime} has no full-permission form the office sets, so nothing was added and it runs as it always has.`,
    }
  }
  const sandbox = theSandboxIn(env)
  if (sandbox !== null) {
    return {
      full: true,
      args: [...form.args],
      env: { ...form.env },
      because: `${runtime} runs with full permissions, because it is in a sandbox (${IN_A_SANDBOX}=${sandbox}), where only the instance folder can be written.`,
    }
  }
  if (guard.mounted) {
    return {
      full: true,
      args: [...form.args],
      env: { ...form.env },
      because: `${runtime} runs with full permissions on the host, because the main-world guard is mounted into it. ${guard.because}`,
    }
  }
  /** @type {Record<string, string | null>} */
  const takenOut = {}
  for (const [name, value] of Object.entries(form.env)) if (env[name] === value) takenOut[name] = null
  const names = Object.keys(takenOut)
  return {
    full: false,
    args: [],
    env: takenOut,
    because:
      `${runtime} runs with its own default permissions, because this is the host and the main-world guard is not ` +
      `mounted into it. ${guard.because}` +
      (names.length === 0 ? '' : ` ${names.join(' and ')} came in from the environment with the full-permission value and was taken out.`),
  }
}

/**
 * @typedef {object} ACommandsPermissions
 * @property {string[]} command The command line, with its tool's arguments put in when it starts one.
 * @property {Record<string, string | null>} env Every tool's environment part, for the command and
 *   everything it starts.
 * @property {string[]} says One sentence for each thing that was, or could not be, done.
 */

/**
 * WHAT A LAUNCHER HANDED A WHOLE COMMAND LINE PUTS ON IT. `tools/sandbox-start.mjs` is that
 * launcher: it starts commands other agents wrote.
 *
 * Every tool's environment part goes into the command's environment, so a tool started anywhere
 * below it is given its permissions too. When the command's program is one of the tools, that
 * tool's arguments go right after the program's name. Codex container argv is checked against the
 * shared form, including simple env assignments; plain Codex permission argv stays unchanged.
 * Other tools keep an explicitly named permission option as written, with a sentence saying so.
 *
 * ONLY THE PROGRAM AT THE HEAD IS READ FOR THE GUARD. Nothing here knows how a tool started below
 * the command will be started, so on the host the environment parts are those of a tool without the
 * guard; a launcher below (run-agent.sh for dsh) asks for its own tool when it starts it. In a
 * sandbox the guard does not matter: every tool is full there.
 *
 * @param {readonly string[]} command
 * @param {Record<string, string | undefined>} env
 * @param {{plain?: boolean}} [options] Keep a plain Codex command's permission argv unchanged.
 * @returns {ACommandsPermissions}
 */
export function aCommandsPermissions(command, env, { plain = false } = {}) {
  /** @type {Record<string, string | null>} */
  const changes = {}
  for (const runtime of RUNTIMES_WITH_A_FULL_FORM) Object.assign(changes, thePermissionsARunGets(runtime, env).env)
  if (theSandboxIn(env) !== null && theCodexProgramAt(command) !== -1) {
    const checked = aCodexContainerCommand(command, { plain, insert: !plain })
    return { ...checked, env: changes }
  }
  const program = String(command[0] ?? '').split('/').pop()
  const runtime = RUNTIMES_WITH_A_FULL_FORM.find((word) => FULL_PERMISSIONS[word]?.program === program)
  if (runtime === undefined) return { command: [...command], env: changes, says: [] }
  const permissions = thePermissionsARunGets(runtime, env, theGuardOn(runtime, { args: command.slice(1), env }))
  Object.assign(changes, permissions.env)
  if (permissions.args.length === 0) return { command: [...command], env: changes, says: [permissions.because] }
  if (command.includes(/** @type {string} */ (permissions.args[0]))) {
    return {
      command: [...command],
      env: changes,
      says: [
        `${permissions.because} The command already names ${permissions.args[0]}, so it was left as written, ` +
          `without ${permissions.args.join(' ')}.`,
      ],
    }
  }
  return {
    command: [command[0] ?? '', ...permissions.args, ...command.slice(1)],
    env: changes,
    says: [`${permissions.because} ${permissions.args.join(' ')} was put after ${program}.`],
  }
}
