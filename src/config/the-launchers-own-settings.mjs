// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CASTING ROW'S OWN PROGRAM SETTINGS, AND THE NAMES THE LAUNCHER SETS ITSELF.
 *
 * A row's native data may carry `settings`: a list of {name, value}. The name is a dotted path, and a part may be quoted
 * with " or '. A part that holds a dot must be quoted. The name is stored as written and read by unquoting each part. The
 * value is any JSON but null, at any depth, and its JSON text is at most 4096 characters.
 *
 * THE LAUNCHER SETS SOME NAMES ITSELF: the main-world guard's hook, the office's own tool, the run's key and identity,
 * its permissions, its login and the row's own native fields. A row may not set one. The door refuses such a row, and
 * the launcher refuses it again at start. Both ask theSettingTheLauncherKeeps, and this file holds the only copy of the
 * list. A name matches a listed name when it equals it, lies under it, or holds it. A value that is an object is read
 * as names under its own name, so a table cannot set what its name could not.
 *
 * NOTHING HERE IMPORTS A NODE MODULE, because the shared Casting reader in src/shared/casting.ts reads the shape with it
 * and the pages load that file. So the names that other files also write are written here again, each with the file and
 * line it comes from, and tests/a-casting-rows-settings-pass-to-its-program.test.ts fails when the two differ.
 */

/**
 * THE CONFIG THE dsh OFFICE PROFILE GIVES AN ENTRY OF ITS OWN, by entry id, where it is the same for every checkout.
 * tools/dsh-hooks/install-profile.mjs writes it into the profile. A row's dsh setting is named `<entry id>.<config path>`,
 * and its patch entry starts from this config (tools/dsh-hooks/run-settings.mjs), because a patch entry replaces the
 * entry's whole config. An entry with none here takes no setting from a row.
 */
export const THE_OFFICE_PROFILES_OWN_CONFIG = Object.freeze({
  'bash-sandbox': Object.freeze({ timeoutMs: 1800000 }),
})

/** The longest name, and the longest JSON text of a value. */
export const THE_LONGEST_SETTING = 4096

/** The programs a row's settings go to. A row with no program, or with another program, holds none. */
export const THE_PROGRAMS_THAT_TAKE_SETTINGS = Object.freeze(['codex', 'claude-code', 'opencode', 'dsh'])

/**
 * EACH PROGRAM'S FAST SETTING, or null where it has none. A row that names it decides fast mode for its runs, and the
 * program's switch (THE_RUNTIMES_FAST_MODE in src/config/model-efforts.mjs) decides for a row that does not. Fast mode is
 * on only when the row's value is `on`.
 */
export const THE_FAST_SETTING = Object.freeze({
  codex: Object.freeze({ name: 'service_tier', on: 'fast' }),
  'claude-code': Object.freeze({ name: 'fastMode', on: true }),
  opencode: null,
  dsh: null,
})

const map = value => value !== null && typeof value === 'object' && !Array.isArray(value)

/** The parts of a setting's name, unquoted, or null when the name is not one a row may store. */
export function partsOfASettingName(name) {
  if (typeof name !== 'string' || name.length === 0 || name.length > THE_LONGEST_SETTING || name.trim() !== name || /[\x00-\x1f\x7f]/.test(name)) return null
  const parts = []
  for (let at = 0; ;) {
    const quote = name[at]
    let part, next
    if (quote === '"' || quote === "'") {
      const close = name.indexOf(quote, at + 1)
      if (close < 0) return null
      part = name.slice(at + 1, close)
      next = close + 1
    } else {
      const dot = name.indexOf('.', at)
      next = dot < 0 ? name.length : dot
      part = name.slice(at, next)
      if (/["'\s=]/.test(part)) return null
    }
    if (part === '') return null
    parts.push(part)
    if (next === name.length) return parts
    if (name[next] !== '.') return null
    at = next + 1
  }
}

/** Whether a value is JSON a program can take: no null at any depth, and every number finite. */
function aProgramsValue(value) {
  if (typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(aProgramsValue)
  return map(value) && Object.getPrototypeOf(value) === Object.prototype && Object.values(value).every(aProgramsValue)
}

/** Whether one list of parts equals, lies under, or holds the other. */
const overlaps = (one, other) => one.slice(0, Math.min(one.length, other.length)).every((part, i) => part === other[i])

/**
 * WHY A LIST OF SETTINGS CANNOT BE STORED, in one sentence, or null when it can. An empty list can: the door stores it as
 * no key. The door, the shared Casting reader and the launcher's reader all ask this.
 */
export function whyTheSettingsCannotBeStored(value) {
  if (!Array.isArray(value)) return 'The settings are not a list.'
  const seen = []
  for (const [index, one] of value.entries()) {
    if (!map(one) || Object.keys(one).length !== 2 || !Object.hasOwn(one, 'name') || !Object.hasOwn(one, 'value')) return `Setting ${index + 1} is not one name and one value.`
    const parts = partsOfASettingName(one.name)
    if (parts === null) {
      return `Setting ${index + 1} has no name a row may store: a name is a dotted path of 1 to ${THE_LONGEST_SETTING} characters with no ` +
        'spaces at its ends and no control characters, and a part that holds a dot, a space, a quote or = is quoted with " or \'.'
    }
    if (!aProgramsValue(one.value)) return `Setting ${one.name} has no value a program can take: it is null, or holds a null.`
    if (JSON.stringify(one.value).length > THE_LONGEST_SETTING) return `Setting ${one.name} has a value longer than ${THE_LONGEST_SETTING} characters as JSON text.`
    const other = seen.find(earlier => overlaps(earlier.parts, parts))
    if (other !== undefined) {
      return other.parts.length === parts.length
        ? `Settings ${other.name} and ${one.name} name the same setting.`
        : `Setting ${other.parts.length > parts.length ? other.name : one.name} lies under setting ${other.parts.length > parts.length ? one.name : other.name}, so one would undo the other.`
    }
    seen.push({ name: one.name, parts })
  }
  return null
}

/** A copy of a stored list of settings, with every value copied too. */
export function aCopyOfTheSettings(settings) {
  return settings.map(({ name, value }) => ({ name, value: JSON.parse(JSON.stringify(value)) }))
}

/** The words for what each listed name is for. */
const GUARD_HOOK = "the main-world guard's hook"
const OFFICE_TOOL = "the office's own tool, office_request"
const RUN_IDENTITY = "the run's identity and its own key, which the office reads"
const RUN_HOME = "the run's own home, where its program keeps its configuration and login"
const ROWS_MODEL = "the row's own native model, which the row's model fields set"
const ROWS_EFFORT = "the row's own effort, which the row's effort cell sets"
const PERMISSIONS = "the run's permissions"
const LOGIN = 'the login the run is paid by'
const PLUGINS = "the program's plugins, which can take the guard's hook away"
const NOT_IN_THIS_OPENCODE = `${GUARD_HOOK} and ${OFFICE_TOOL}; OpenCode 1.18.31 does not have this setting`

const listed = (name, guards) => Object.freeze({ parts: Object.freeze(name.split('.')), guards })
const environment = (name, guards) => Object.freeze({ environment: name, guards })

/** EVERY PROGRAM'S ENVIRONMENT that the launcher sets, named under `env.`. */
const EVERY_PROGRAMS_ENVIRONMENT = [
  // src/config/run-permissions.mjs:86-88 (OFFICE_MCP_ENV_VARS)
  ...['MOLE_OFFICE_AGENT', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_API', 'MOLE_AGENT_KEY'].map(name => environment(name, RUN_IDENTITY)),
  // tools/sandbox.mjs:1152 sets HOME, and tools/sandbox.mjs:2696-2697 sets CODEX_HOME and XDG_CONFIG_HOME for a check. The
  // office finds a run's login through CLAUDE_CONFIG_DIR (src/config/claude-code-login.mjs:33) and a Codex run's own log
  // through CODEX_HOME (src/config/runtime-served.mjs:102).
  ...['HOME', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'XDG_CONFIG_HOME'].map(name => environment(name, RUN_HOME)),
]

/** The variables Claude Code signs in with: src/config/claude-code-login.mjs:19 (CLAUDE_CODE_LOGINS). */
const CLAUDE_CODE_LOGINS = ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX']

/**
 * THE LIST, per program. `parts` is a name and everything under it; `environment` is a variable named under `env.`; `last`
 * is a Codex name whose last part is that, under any prefix.
 */
export const THE_LAUNCHERS_OWN_SETTINGS = Object.freeze({
  codex: Object.freeze([
    // The row's own native fields: src/config/launcher-selection.mjs (applyLauncherSelection) and
    // src/config/how-a-command-takes-an-effort.mjs:25.
    listed('model', ROWS_MODEL),
    listed('model_reasoning_effort', ROWS_EFFORT),
    // and tools/inspector-sandbox.mjs (theCodexProviderOptions), for a check whose row names a provider row
    listed('model_provider', ROWS_MODEL),
    listed('model_providers', ROWS_MODEL),
    // src/config/run-permissions.mjs:441 (FULL_PERMISSIONS), under any prefix, such as a profile's.
    Object.freeze({ last: 'sandbox_mode', guards: "the run's sandbox" }),
    Object.freeze({ last: 'approval_policy', guards: "the run's approval policy" }),
    // src/config/run-permissions.mjs:502: a profile can change the sandbox and the approval policy.
    listed('profile', "the run's sandbox and approval policy, which a profile can change"),
    // src/config/main-world-guard.mjs:119 (codexGuard)
    listed('hooks', GUARD_HOOK),
    listed('features.hooks', GUARD_HOOK),
    listed('features.codex_hooks', GUARD_HOOK),
    listed('allow_managed_hooks_only', GUARD_HOOK),
    listed('features.plugins', PLUGINS),
    listed('plugins', PLUGINS),
    // src/config/run-permissions.mjs:268-271 (aCommandsOfficeTool)
    listed('mcp_servers.mole_office', OFFICE_TOOL),
    // src/config/run-permissions.mjs:274, and tools/inspector-sandbox.mjs (WHAT_A_CODEX_CHECKS_SHELL_LEAVES_OUT)
    listed('shell_environment_policy', "the run's key, kept out of the commands its shell runs"),
    // src/config/run-permissions.mjs:276
    listed('features.shell_snapshot', "the run's key, kept out of the shell snapshot file"),
    // tools/inspector-sandbox.mjs (THE_CODEX_PROVIDER_VARIABLES): what a check whose row names a provider row is handed
    environment('PROVIDER_ROW_BASE_URL', 'where the program sends its model requests, which the provider row sets'),
    environment('PROVIDER_ROW_API_KEY', "the run's keys and logins"),
  ]),
  'claude-code': Object.freeze([
    // src/config/launcher-selection.mjs (applyLauncherSelection) and src/config/how-a-command-takes-an-effort.mjs:24
    listed('model', ROWS_MODEL),
    environment('CLAUDE_CODE_EFFORT_LEVEL', ROWS_EFFORT),
    // src/config/run-permissions.mjs:440 (FULL_PERMISSIONS)
    listed('permissions', PERMISSIONS),
    // src/config/main-world-guard.mjs:103-109 (claudeCodeGuard)
    listed('hooks', GUARD_HOOK),
    listed('disableAllHooks', GUARD_HOOK),
    listed('allowManagedHooksOnly', GUARD_HOOK),
    listed('strictPluginOnlyCustomization', GUARD_HOOK),
    environment('CLAUDE_CODE_SIMPLE', GUARD_HOOK),
    environment('CLAUDE_CODE_SAFE_MODE', GUARD_HOOK),
    // src/config/run-permissions.mjs:349-375 (aClaudeCommandsOfficeTool) gives the tool with --mcp-config, and these
    // can keep it from loading.
    listed('allowedMcpServers', OFFICE_TOOL),
    listed('deniedMcpServers', OFFICE_TOOL),
    listed('disabledMcpjsonServers', OFFICE_TOOL),
    listed('allowManagedMcpServersOnly', OFFICE_TOOL),
    // src/config/run-permissions.mjs:108 and :357-358
    environment('MOLE_OFFICE_TOOL_CONFIGURATION', OFFICE_TOOL),
    environment('MOLE_AGENT_KEY', RUN_IDENTITY),
    // src/config/claude-code-login.mjs:19, both as a setting and under env
    listed('apiKeyHelper', LOGIN),
    ...CLAUDE_CODE_LOGINS.flatMap(name => [listed(name, LOGIN), environment(name, LOGIN)]),
    // tools/sandbox.mjs:1962-1977 (noAttributionInCommits)
    listed('attribution', "the owner's rule of no AI attribution in commits"),
    listed('includeCoAuthoredBy', "the owner's rule of no AI attribution in commits"),
  ]),
  opencode: Object.freeze([
    // src/config/launcher-selection.mjs (applyLauncherSelection)
    listed('model', ROWS_MODEL),
    listed('provider', ROWS_MODEL),
    // src/config/run-permissions.mjs:445 (FULL_PERMISSIONS)
    listed('permission', PERMISSIONS),
    environment('OPENCODE_PERMISSION', PERMISSIONS),
    // src/config/main-world-guard.mjs:56 and :126-128 (openCodeGuard)
    listed('plugin', GUARD_HOOK),
    environment('OPENCODE_CONFIG_CONTENT', GUARD_HOOK),
    environment('MOLE_GUARD_COMMAND', GUARD_HOOK),
    environment('OPENCODE_PURE', GUARD_HOOK),
    environment('OPENCODE_DISABLE_DEFAULT_PLUGINS', PLUGINS),
    // tools/inspector-sandbox.mjs:55-56: where OpenCode reads its configuration from
    environment('OPENCODE_DISABLE_PROJECT_CONFIG', GUARD_HOOK),
    environment('OPENCODE_CONFIG', GUARD_HOOK),
    environment('OPENCODE_CONFIG_DIR', GUARD_HOOK),
    // The published schema has these; the installed OpenCode does not.
    listed('policies', NOT_IN_THIS_OPENCODE),
    listed('plugins', NOT_IN_THIS_OPENCODE),
    // No line of the launcher gives OpenCode this server; the name is kept for a configuration that does.
    listed('mcp.mole_office', OFFICE_TOOL),
    // tools/sandbox-common.mjs:334 (THE_OPENCODE_DATABASE_VARIABLE)
    environment('OPENCODE_DB', "the run's own database file"),
    // tools/opencode-output-cap.mjs:18
    environment('OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX', 'the output cap the launcher gives every OpenCode run'),
  ]),
  dsh: Object.freeze([
    // tools/dsh-hooks/run-settings.mjs:187: the row's own native fields and the saved dsh settings
    listed('settings', ROWS_MODEL),
    listed('agent-default-model', ROWS_MODEL),
    // tools/dsh-hooks/install-profile.mjs:125-130
    listed('dsh.profile', "the office profile's bundles"),
    // tools/dsh-hooks/install-profile.mjs:160-165
    listed('hooks-claude-code', GUARD_HOOK),
    // tools/dsh-hooks/install-profile.mjs:169-171
    listed('office-request', OFFICE_TOOL),
    // src/config/run-permissions.mjs:447 and tools/dsh-hooks/run-agent.sh:56
    environment('DSH_PERMISSION_MODE', PERMISSIONS),
    environment('DSH_HOME', "the office profile, which DSH_HOME holds"),
    // tools/inspector-sandbox.mjs (theDshProviderVariables): what a check whose row names a provider row is handed
    environment('DEEPSEEK_BASE_URL', 'where the program sends its model requests, which the provider row sets'),
    environment('DEEPSEEK_API_KEY', "the run's keys and logins"),
  ]),
})

/** The whole _-separated parts that make a variable a secret. */
const SECRET_PARTS = ['KEY', 'TOKEN', 'SECRET', 'PASSWORD', 'AUTH']

/** What a variable is for, or null for one a row may set. Names compare ignoring case. */
function whatAVariableGuards(program, variable) {
  const upper = variable.toUpperCase()
  const named = [...EVERY_PROGRAMS_ENVIRONMENT, ...THE_LAUNCHERS_OWN_SETTINGS[program]].find(one => one.environment?.toUpperCase() === upper)
  if (named !== undefined) return named.guards
  if (upper.startsWith('MOLE_')) return "the office's own variables for the run"
  if (upper.startsWith('OPENCODE_')) return "OpenCode's own variables, which the launcher sets"
  if (upper.startsWith('DSH_')) return "dsh's own variables, which the launcher sets"
  if (upper.endsWith('_BASE_URL')) return 'where the program sends its model requests'
  if (upper.split('_').some(part => SECRET_PARTS.includes(part))) return "the run's keys and logins"
  return null
}

/** What one name is for, or null. */
function whatANameGuards(program, parts) {
  if (parts[0] === 'env') return parts.length === 1 ? "the run's environment, which holds its key and its identity" : whatAVariableGuards(program, parts[1])
  for (const one of THE_LAUNCHERS_OWN_SETTINGS[program]) {
    if (one.parts !== undefined && overlaps(one.parts, parts)) return one.guards
    if (one.last !== undefined && parts.at(-1) === one.last) return one.guards
  }
  return null
}

/** Every name a setting sets: its own, and the names under it that an object value holds. */
function* theNamesASettingSets(parts, value) {
  yield parts
  if (map(value)) for (const [key, inner] of Object.entries(value)) yield* theNamesASettingSets([...parts, key], inner)
}

/**
 * THE ONE QUESTION THE DOOR AND THE LAUNCHER ASK: the first of a row's settings that the launcher sets for the program,
 * with the words for what it is for, or null when the launcher keeps none of them. `program` is one of
 * THE_PROGRAMS_THAT_TAKE_SETTINGS, and `settings` a list whyTheSettingsCannotBeStored found nothing wrong with.
 * @param {string} program @param {{name: string, value: unknown}[]} settings @returns {{name: string, guards: string} | null}
 */
export function theSettingTheLauncherKeeps(program, settings) {
  if (!THE_PROGRAMS_THAT_TAKE_SETTINGS.includes(program)) throw new Error(`${program} takes no settings from a Casting row.`)
  for (const { name, value } of settings) {
    for (const parts of theNamesASettingSets(partsOfASettingName(name), value)) {
      const guards = whatANameGuards(program, parts)
      if (guards !== null) return { name, guards }
    }
  }
  return null
}

/** The launcher's refusal of a setting it keeps. A dsh refusal begins "DSH ", which tools/dsh-hooks/run-settings.mjs passes on. */
export function theLaunchersRefusalOfASetting(row, program, kept) {
  const said = `${row} sets ${kept.name} for ${program}, which the launcher sets itself (${kept.guards}). A row may not set it. Nothing was started.`
  return program === 'dsh' ? `DSH refused the selection: ${said}` : said
}

/** Whether a setting's name has these parts. */
export const aSettingNamed = (setting, parts) => JSON.stringify(partsOfASettingName(setting.name)) === JSON.stringify(parts)

/** Set an own property, so a part named __proto__ is a key like any other. */
const put = (object, key, value) => Object.defineProperty(object, key, { value, enumerable: true, writable: true, configurable: true })

/** A row's settings as one nested object, as Claude Code's --settings and OpenCode's configuration take them. */
export function theSettingsAsOneObject(settings) {
  const whole = {}
  for (const { name, value } of settings) {
    const parts = partsOfASettingName(name)
    let at = whole
    for (const part of parts.slice(0, -1)) at = Object.hasOwn(at, part) ? at[part] : put(at, part, {})[part]
    put(at, parts.at(-1), JSON.parse(JSON.stringify(value)))
  }
  return whole
}

/**
 * A ROW'S SETTINGS JOINED INTO A CONFIGURATION ALREADY GIVEN. Objects join key by key, and the given configuration's own
 * keys stay. A name both set, to different values, calls `differs` with its dotted path, which throws.
 */
export function theSettingsJoinedInto(given, settings, differs, path = []) {
  const joined = { ...given }
  for (const [key, value] of Object.entries(settings)) {
    if (!Object.hasOwn(joined, key)) put(joined, key, value)
    else if (map(joined[key]) && map(value)) put(joined, key, theSettingsJoinedInto(joined[key], value, differs, [...path, key]))
    else if (JSON.stringify(joined[key]) !== JSON.stringify(value)) differs([...path, key].join('.'))
  }
  return joined
}

/** A TOML string: a JSON string is a TOML basic string once DEL is escaped too. */
const aTomlString = text => JSON.stringify(text).replace(/\x7f/g, '\\u007f')

/** A value as TOML, as Codex's -c reads it: arrays as [..] and objects as inline tables. */
export function theTomlOf(value) {
  if (typeof value === 'string') return aTomlString(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `[${value.map(theTomlOf).join(', ')}]`
  const entries = Object.entries(value).map(([key, inner]) => `${/^[A-Za-z0-9_-]+$/.test(key) ? key : aTomlString(key)} = ${theTomlOf(inner)}`)
  return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`
}

/** Why Codex's -c cannot name such a part, in the words the door and the launcher both give after naming it. */
export const WHY_CODEX_CANNOT_NAME_IT = 'Codex splits a -c name at every dot and at its first equals sign, and trims the spaces at its two ends.'

/**
 * THE PART OF A SETTING'S NAME THAT CODEX'S -c CANNOT NAME, or undefined. Codex 0.159.2 splits a -c at its first equals
 * sign and its name at every dot, keeps a quote as part of a key, and trims the spaces at the two ends of the name. So a
 * part that holds a dot or an equals sign, a first part that begins with a space and a last part that ends with one cannot
 * be named: the last two would reach another key than the one the door checked. A table at the part's parent could name
 * it, but would undo what the launcher's own -c set under that parent. The door (src/server/lib/casting.ts) and the
 * launcher (src/config/launcher-selection.mjs) both ask this. A space is JavaScript's \s or the next line character,
 * which Rust's trim also takes.
 */
export function aPartCodexCannotName(name) {
  const parts = partsOfASettingName(name)
  return parts.find((part, at) => /[.=]/.test(part) || (at === 0 && /^[\s\u0085]/.test(part)) || (at === parts.length - 1 && /[\s\u0085]$/.test(part)))
}
