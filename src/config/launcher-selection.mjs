// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { maskedAsAPrintedLine } from './inspection-ending.mjs'
/** The additive launcher wire contract. Names and native values belong to the selected data. */
import { basename } from 'node:path'
import { AN_UNPROVED_EFFORT_NOT_THE_ROWS, THE_RUNTIMES_FAST_MODE } from './model-efforts.mjs'
import { THE_PROGRAM_A_RUNTIME_RUNS, THE_PROVIDER_A_RUNTIME_RUNS } from './runtime-native-providers.mjs'
import { HOW_EACH_COMMAND_TAKES_AN_EFFORT } from './how-a-command-takes-an-effort.mjs'
import { THE_FAST_SETTING, THE_OFFICE_PROFILES_OWN_CONFIG, WHY_CODEX_CANNOT_NAME_IT, aCopyOfTheSettings, aPartCodexCannotName, aSettingNamed, partsOfASettingName,
  theLaunchersRefusalOfASetting, theSettingTheLauncherKeeps, theSettingsAsOneObject, theSettingsJoinedInto, theTomlOf, whyTheSettingsCannotBeStored } from './the-launchers-own-settings.mjs'

/** @typedef {{runtime: string, model: string, native: {model: string, provider: string|null, variant: string|null, effort: string|null, providerRow?: string, settings?: {name: string, value: unknown}[]}, casting: {id: number, revision: string}|null}} LauncherSelection */
export const LEGACY_SELECTION_NOTICE = 'Native selection data is unavailable from this older Office; using the exact legacy compatibility data and the existing effort handoff.'
export const THE_AGENTS_OWN_EFFORT = 'the agent'
export const THE_OFFICE_SAYS_THE_AGENTS_OWN = "(the office says: the agent's own setting)"
export const THE_ROW_IS_NOT_HELD_NO_EFFORT_WAS_TRIED = 'The row is not held, because it was not tried without an effort.'
export const THE_ROW_IS_NOT_HELD_OWN_EFFORT_WAS_NOT_TRIED = 'The row is not held, because its own effort was not tried.'
/** The provider whose models a runtime's own program runs, for a runtime that has one: src/config/runtime-native-providers.mjs reads the data file, and this module re-exports it. */
export { THE_PROVIDER_A_RUNTIME_RUNS }
/** The program each runtime's command runs: src/config/runtime-native-providers.mjs reads the data file, and this module re-exports it. */
export { THE_PROGRAM_A_RUNTIME_RUNS }
const map = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const word = value => typeof value === 'string' && value.length > 0 && value.length <= 4096 && value.trim() === value && !/[\x00-\x1f\x7f]/.test(value)
const keys = (value, names) => map(value) && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name))
/** Every way the one table says a command line takes an effort, so a caller's own effort is read whichever runtime it names. */
const EFFORT_LINES = Object.values(HOW_EACH_COMMAND_TAKES_AN_EFFORT).filter((line) => line !== null)
const EFFORT_OPTIONS = EFFORT_LINES.flatMap((line) => line.option === null ? [] : [line.option])
const EFFORT_SETTINGS = EFFORT_LINES.flatMap((line) => line.setting === null ? [] : [line.setting])
/** The word a refusal uses for an option: its own name without the dashes. */
const theOptionWord = (option) => option.replace(/^-+/, '')
/** The line the one table gives a runtime, or null for a runtime it has none for. */
const theLineOf = (tool) => Object.hasOwn(HOW_EACH_COMMAND_TAKES_AN_EFFORT, tool) ? HOW_EACH_COMMAND_TAKES_AN_EFFORT[tool] : null
/**
 * The one reader of a selection. Its native data carries `settings` only when its row has some: a list that is not empty,
 * read as src/config/the-launchers-own-settings.mjs reads a row's settings. It carries `providerRow` only when its row
 * names a row of the provider table, by that row's id; which programs may take one is applyLauncherSelection's to say.
 * @param {unknown} value @returns {LauncherSelection}
 */
export function readLauncherSelection(value) {
  const settings = map(value) && map(value.native) && Object.hasOwn(value.native, 'settings')
  const providerRow = map(value) && map(value.native) && Object.hasOwn(value.native, 'providerRow')
  if (!keys(value, ['runtime','model','native','casting']) || !Object.hasOwn(THE_PROGRAM_A_RUNTIME_RUNS,value.runtime) || !word(value.model) ||
    !keys(value.native, ['model','provider','variant','effort',...(providerRow ? ['providerRow'] : []),...(settings ? ['settings'] : [])]) || !word(value.native.model) ||
    !['provider','variant','effort'].every(name => value.native[name] === null || word(value.native[name])) || (providerRow && !word(value.native.providerRow)) ||
    !(value.casting === null || (keys(value.casting, ['id','revision']) && Number.isSafeInteger(value.casting.id) && value.casting.id > 0 && word(value.casting.revision)))) {
    throw new Error('The launcher selection is malformed or incomplete. Nothing was started.')
  }
  if (settings) {
    const why = Array.isArray(value.native.settings) && value.native.settings.length === 0 ? 'The settings are an empty list.' : whyTheSettingsCannotBeStored(value.native.settings)
    if (why !== null) throw new Error(`The launcher selection's settings cannot be read: ${why} Nothing was started.`)
  }
  return {runtime:value.runtime,model:value.model,native:{model:value.native.model,provider:value.native.provider,variant:value.native.variant,effort:value.native.effort,
    ...(providerRow ? {providerRow:value.native.providerRow} : {}),...(settings ? {settings:aCopyOfTheSettings(value.native.settings)} : {})},casting:value.casting === null ? null : {id:value.casting.id,revision:value.casting.revision}}
}
/**
 * WHETHER A NAME NAMES A ROW'S SELECTION: exactly its Office model, or exactly `<native provider>/<native model>`. The
 * native provider is the row's stored one, else the provider of the runtime's own program. Nothing is stripped,
 * lower-cased or guessed. A row with no native data is named by its Office model alone, and a row with no Office model
 * is named by nothing. The office's answer and the launcher both ask this.
 * @param {unknown} name
 * @param {{runtime: string|null, model: string|null, native: {model: string, provider: string|null}|null}} row
 */
export function aNameNamesTheSelection(name, { runtime, model, native }) {
  if (typeof name !== 'string' || typeof model !== 'string') return false
  if (name === model) return true
  if (native === null || native === undefined) return false
  const provider = native.provider ?? (typeof runtime === 'string' && Object.hasOwn(THE_PROVIDER_A_RUNTIME_RUNS, runtime) ? THE_PROVIDER_A_RUNTIME_RUNS[runtime] : null)
  return provider !== null && name === `${provider}/${native.model}`
}
/**
 * THE ONE DIFFERENCE A SELECTION MAY HAVE FROM ITS ROW (wave 13n round BK): an effort that is set and is not the row's,
 * the agent's own effort the office put in. An OpenCode row's variant is replaced with the same effort, because OpenCode
 * carries one variant option. Gives the row's own effort (an OpenCode row's variant, else its effort), null for a row
 * that sets none, or undefined when the selection is the row's own or differs in anything else.
 * @param {LauncherSelection} selected @param {LauncherSelection} rows
 * @returns {string|null|undefined}
 */
export function theRowsEffortUnder(selected, rows) {
  const effort = selected.native.effort, rowsEffort = rows.native.variant ?? rows.native.effort
  if (effort === null || effort === rowsEffort) return undefined
  const carried = {...rows, native:{...rows.native, variant:rows.native.variant === null ? null : effort, effort}}
  return JSON.stringify(carried) === JSON.stringify(selected) ? rowsEffort : undefined
}
/** The row a selection came from, in words. */
const theRowOf = selection => selection.casting === null ? 'the selection' : `Casting row ${selection.casting.id}`
/**
 * A -c option as Codex 0.159.2 reads it: the name is what comes before the first equals sign, split at every dot, and a
 * quote stays part of a key. Its parts and its value text; null with no equals sign.
 */
function aConfigOption(text) {
  const equals = text.indexOf('=')
  return equals < 0 ? null : { parts: text.slice(0, equals).trim().split('.'), value: text.slice(equals + 1).trim() }
}
/**
 * A ROW'S SETTING AS CODEX'S -c, which Codex reads as aConfigOption says: each part goes without its quotes. A part
 * Codex's -c cannot name (aPartCodexCannotName) is checked again here, with the rule the door asked, before anything
 * starts.
 */
function aCodexOption(setting, row) {
  const part = aPartCodexCannotName(setting.name)
  if (part !== undefined) throw new Error(`${row} sets ${setting.name} for codex, and Codex's -c cannot name its part "${part}". ${WHY_CODEX_CANNOT_NAME_IT} Nothing was started.`)
  return ['-c', `${partsOfASettingName(setting.name).join('.')}=${theTomlOf(setting.value)}`]
}
/** Whether a value a caller gave a program as text is a row's setting: its TOML, or the plain string. */
const theSameValue = (text, value, plain) => {
  if (text === theTomlOf(value)) return true
  try { return typeof value === 'string' && plain(text) === value } catch { return false }
}
/** A row's settings joined into a JSON object a command already gives its program, or a refusal in words. */
function theSettingsJoinedIntoText(text, settings, where, row) {
  let given
  try { given = text === undefined ? {} : JSON.parse(text) } catch { given = undefined }
  if (!map(given)) throw new Error(`${where} is not a JSON object, so ${row}'s settings cannot join it. Nothing was started.`)
  return JSON.stringify(theSettingsJoinedInto(given, theSettingsAsOneObject(settings), name => {
    throw new Error(`${where} sets ${name} to a value different from ${row}'s setting. Nothing was started.`)
  }))
}
/** The refusal of a name with another provider in front, for a runtime whose own program runs one provider; else null. */
function anotherProvidersModel(tool, name, chosen) {
  const own = Object.hasOwn(THE_PROVIDER_A_RUNTIME_RUNS, tool) ? THE_PROVIDER_A_RUNTIME_RUNS[tool] : null
  const slash = name.indexOf('/')
  if (own === null || name === chosen.model || slash <= 0 || name.slice(0, slash) === own) return null
  return `${tool} cannot run another provider's model, so it cannot run ${name}. Nothing was started.`
}
/**
 * WHICH COMPACTION WINDOW A CLAUDE CODE START USES, AND WHICH BASH TIMEOUT A DSH START USES, and who set each, for the
 * start's words. A row may set either. Claude Code 2.1.281 reads CLAUDE_CODE_AUTO_COMPACT_WINDOW before its own
 * autoCompactWindow setting, and copies the env of its --settings over the environment it was started with; tools/sandbox.mjs
 * gives every command in a sandbox the variable. The office gives its Claude Code starts the variable from a setting
 * (src/config/the-compaction-window.mjs says which starts), and `envFrom` names the setting.
 * dsh 0.1.5-rc.2 takes an entry's config from the last layer that names the entry, and the run's patch
 * (tools/dsh-hooks/run-settings.mjs) comes after the office profile's.
 */
function theOpenSettingsWords(tool, settings, row, env, envFrom) {
  if (tool === 'claude-code') {
    const rows = settings.find(one => aSettingNamed(one, ['env', 'CLAUDE_CODE_AUTO_COMPACT_WINDOW']))
    if (rows !== undefined) return `; compaction window ${JSON.stringify(rows.value)}, set by ${row}`
    const unread = settings.find(one => aSettingNamed(one, ['autoCompactWindow']))
    const given = env.CLAUDE_CODE_AUTO_COMPACT_WINDOW
    if (given !== undefined) return `; compaction window ${given}, from ${envFrom.CLAUDE_CODE_AUTO_COMPACT_WINDOW ?? "the command's environment"}${unread === undefined ? '' : `, which Claude Code reads before ${row}'s autoCompactWindow`}`
    return unread === undefined ? "; compaction window Claude Code's own" : `; compaction window ${JSON.stringify(unread.value)}, set by ${row}`
  }
  if (tool !== 'dsh') return ''
  const rows = settings.find(one => aSettingNamed(one, ['bash-sandbox', 'timeoutMs']))
  return rows === undefined ? `; bash timeout ${THE_OFFICE_PROFILES_OWN_CONFIG['bash-sandbox'].timeoutMs} ms, the office profile's` : `; bash timeout ${JSON.stringify(rows.value)} ms, set by ${row}`
}

/**
 * WHY A START CANNOT TAKE THE PROVIDER ROW ITS SELECTION NAMES, or null when it names none or the start can. Only a dsh
 * check and a Codex check take their key from a provider row so far, so `aCheckCarriesTheProvider` is set only by the
 * inspector (tools/the-inspector.mjs). No other start takes the key, and none falls back to its own login.
 * @param {LauncherSelection} selection @param {boolean} aCheckCarriesTheProvider @returns {string | null}
 */
export function whyAStartCannotTakeTheProviderRow(selection, aCheckCarriesTheProvider) {
  const providerRow = selection.native.providerRow, tool = selection.runtime, row = theRowOf(selection)
  if (providerRow === undefined) return null
  if (tool !== 'dsh' && tool !== 'codex') return `${row} names provider ${providerRow}, and ${tool} does not take its key from a provider yet. Only a dsh check and a Codex check take one now. Nothing was started.`
  return aCheckCarriesTheProvider ? null : `${tool === 'dsh' ? 'DSH' : 'Codex'} refused the selection: ${row} names provider ${providerRow}, and only a check takes its key from a provider so far. Nothing was started.`
}

/**
 * Apply only syntax this runtime can carry; never interpret a model or level name. `rowsEffort` is the row's own effort
 * when the selection carries another (theRowsEffortUnder), and the words name both. `officeSaysTheAgent` is set only
 * where the launcher holds the office's answer and that answer says the effort is the agent's. `aCheckCarriesTheProvider`
 * is set only by the inspector, which hands a dsh or Codex check the one key of the provider row its selection names
 * (tools/the-inspector.mjs); any other start of a selection that names a provider row is refused.
 */
export function applyLauncherSelection(command, { runtime, model, selection, env = {}, envFrom = {}, rowsEffort = undefined, officeSaysTheAgent = false, aCheckCarriesTheProvider = false }) {
  const chosen = readLauncherSelection(selection)
  const tool = chosen.runtime, native = chosen.native
  const programs = THE_PROGRAM_A_RUNTIME_RUNS
  if (runtime !== null && runtime !== undefined && runtime !== tool) throw new Error('The selected runtime differs from the requested runtime. Nothing was started.')
  if (model !== null && model !== undefined && !aNameNamesTheSelection(model, chosen)) {
    throw new Error(anotherProvidersModel(tool, model, chosen) ?? 'The selected Office model differs from the requested model. Nothing was started.')
  }
  const program = basename(command[0] ?? '')
  if (['sh','bash'].includes(program)) throw new Error('A shell command cannot carry the selected native model and options. Nothing was started.')
  if (command.length && program !== programs[tool]) throw new Error('This command cannot carry the selected runtime fields. Nothing was started.')
  if (native.variant !== null && tool !== 'opencode') throw new Error(`${tool} cannot carry a separate native variant. Nothing was started.`)
  if (tool === 'opencode' && native.variant !== null && native.effort !== null && native.variant !== native.effort) throw new Error('OpenCode has one variant option and cannot carry distinct variant and effort values. Nothing was started.')
  if (native.provider !== null && tool !== 'opencode' && tool !== 'dsh') throw new Error(`${tool} cannot carry the selected provider independently. Nothing was started.`)
  if (tool === 'dsh' && native.provider === null) throw new Error('DSH needs an explicit native provider in the selection. Nothing was started.')
  const row = theRowOf(chosen)
  const cannotTakeTheProvider = whyAStartCannotTakeTheProviderRow(chosen, aCheckCarriesTheProvider)
  if (cannotTakeTheProvider !== null) throw new Error(cannotTakeTheProvider)
  const providerRow = native.providerRow
  // A ROW'S OWN PROGRAM SETTINGS are checked again here, against the same list the door asked, before anything starts.
  const settings = native.settings ?? []
  const kept = settings.length === 0 ? null : theSettingTheLauncherKeeps(tool, settings)
  if (kept !== null) throw new Error(theLaunchersRefusalOfASetting(row, tool, kept))
  // FAST MODE IS THE ROW'S WHERE IT NAMES THE PROGRAM'S FAST SETTING, and the program's switch decides where it does not.
  const fastSetting = Object.hasOwn(THE_FAST_SETTING, tool) ? THE_FAST_SETTING[tool] : null
  const rowsFast = fastSetting === null ? undefined : settings.find(one => aSettingNamed(one, [fastSetting.name]))
  const fast = rowsFast === undefined ? THE_RUNTIMES_FAST_MODE[tool] === true : rowsFast.value === fastSetting.on
  const fastWords = rowsFast === undefined ? `fast mode ${fast ? 'on' : 'off'}, from the program's switch` : `fast mode set by ${row} (${rowsFast.name} ${JSON.stringify(rowsFast.value)})`
  const settingsWords = settings.length === 0 ? '' : `; settings from ${row}: ${settings.map(one => `${one.name} = ${JSON.stringify(one.value)}`).join(', ')}`
  const openWords = theOpenSettingsWords(tool, settings, row, env, envFrom)
  // THE ROW'S OWN EFFORT, NAMED WHEN THE SELECTION CARRIES ANOTHER: the launcher proves only that the effort is not the
  // row's. Where it came from is said only when the office's answer said it.
  const replaced = rowsEffort === undefined ? '' : `${rowsEffort === null ? `; ${row} sets no effort` : `, in place of ${row}'s ${rowsEffort}`}${officeSaysTheAgent ? ` ${THE_OFFICE_SAYS_THE_AGENTS_OWN}` : ''}`
  const effortFrom = native.effort === null ? 'none' : rowsEffort === undefined ? 'Casting' : officeSaysTheAgent ? THE_AGENTS_OWN_EFFORT : AN_UNPROVED_EFFORT_NOT_THE_ROWS
  const start = { runtime:tool, model:chosen.model, native, selection:chosen, effort:native.effort, requestedEffort:native.effort,
    effortFrom, ...(rowsEffort === undefined ? {} : {rowsEffort}), ruleEffort:null, officeUnavailable:false, officePredatesEffort:false, fast,
    words:`Office model ${chosen.model}; native model ${native.model}${native.provider === null ? '' : ` on provider ${native.provider}`}${providerRow === undefined ? '' : `; key and address from provider row ${providerRow}`}; variant ${native.variant ?? 'not set'}; effort ${native.effort ?? 'not set'}${replaced}; ${fastWords}${openWords}${settingsWords}` }
  if (tool === 'dsh') return { command, env:{SANDBOX_DSH_SELECTION:JSON.stringify(start)}, start }
  const wantedModel = tool === 'opencode' && native.provider !== null ? `${native.provider}/${native.model}` : native.model
  const wantedVariant = native.variant ?? native.effort
  const line = theLineOf(tool)
  const args = [...command], found = new Set()
  const plain = text => {
    const value = text.trim()
    if (value.startsWith('"')) {
      try { return JSON.parse(value) } catch { throw new Error('The native configuration string is unreadable. Nothing was started.') }
    }
    return value.replace(/^'(.*)'$/, '$1')
  }
  const check = (name, value, expected) => { if (value !== expected) throw new Error(`The caller sets ${name} to a value different from the selected native value. Nothing was started.`); found.add(name) }
  const end = args.indexOf('--') < 0 ? args.length : args.indexOf('--')
  for (let i=1;i<end;i++) {
    const word = args[i], equals = word.indexOf('=')
    const long = equals > 0 && ['--model', '--config', ...EFFORT_OPTIONS].includes(word.slice(0, equals)) ? word.slice(0, equals) : null
    const short = long === null ? /^(-m|-c)(.+)$/.exec(word) : null
    const paired = long === null && short === null && ['--model', '-m', '-c', '--config', ...EFFORT_OPTIONS].includes(word)
    if (long === null && short === null && !paired) continue
    const key = long ?? short?.[1] ?? word
    const at = paired ? ++i : i, value = paired ? args[at] : long !== null ? word.slice(equals + 1) : short?.[2]
    if (typeof value !== 'string') throw new Error('A native startup option has no value. Nothing was started.')
    if (key === '--model' || key === '-m') {
      if (value !== wantedModel && !aNameNamesTheSelection(value, chosen)) {
        throw new Error(anotherProvidersModel(tool, value, chosen) ?? 'The command model differs from the selected Office and native models. Nothing was started.')
      }
      args[at] = paired ? wantedModel : key + (key.startsWith('--') ? '=' : '') + wantedModel; found.add('model')
    } else if (EFFORT_OPTIONS.includes(key)) check(theOptionWord(key), value, key === line?.option && native.variant !== null ? native.variant : native.effort)
    else {
      // A CALLER'S -c NAMING ONE OF THE ROW'S CODEX SETTINGS must give it the row's value, and the row's -c is then not added.
      const option = tool === 'codex' ? aConfigOption(value) : null
      const rows = option === null ? undefined : settings.find(one => aSettingNamed(one, option.parts))
      if (rows !== undefined) {
        if (!theSameValue(option.value, rows.value, plain)) throw new Error(`The caller sets ${rows.name} to a value different from ${row}'s setting. Nothing was started.`)
        found.add(rows)
        continue
      }
      const config = /^([^=\s]+)\s*=\s*(.*)$/.exec(value.trim())
      if (config !== null && (EFFORT_SETTINGS.includes(config[1]) || config[1] === 'service_tier')) {
        check(config[1], plain(config[2]), config[1] === 'service_tier' ? (fast ? 'fast' : 'off') : native.effort)
        if (EFFORT_SETTINGS.includes(config[1])) {
          const literal = `${config[1]}=${JSON.stringify(native.effort)}`
          args[at] = paired ? literal : key + (key.startsWith('--') ? '=' : '') + literal
        }
      }
    }
  }
  const variable = line?.environment ?? null
  if (variable !== null && env[variable] !== undefined) {
    if (env[variable] !== native.effort) {
      const named = envFrom[variable]
      const source = typeof named === 'string' && named.trim() !== '' ? named : 'a source that was not given'
      const row = chosen.casting === null ? 'a selection with no Casting row' : `Casting row ${chosen.casting.id}`
      throw new Error(`The caller sets ${variable} to ${env[variable]}, from ${source}, but the selected native effort is ${native.effort ?? 'not set'} for ${row}. Nothing was started.`)
    }
    found.add(line.option !== null ? theOptionWord(line.option) : line.setting)
  }
  const effortFlags = line === null ? []
    : line.option !== null
      ? (wantedVariant === null || found.has(theOptionWord(line.option)) ? [] : [line.option, wantedVariant])
      : [...(native.effort === null || found.has(line.setting) ? [] : ['-c', `${line.setting}=${JSON.stringify(native.effort)}`]),
        ...(fast && rowsFast === undefined && !found.has('service_tier') ? ['-c', 'service_tier=fast'] : [])]
  // THE ROW'S SETTINGS: Codex takes each as -c, and Claude Code takes them in its one --settings, joined into the first
  // --settings the command already gives (the main-world guard's hook is read from the first one).
  const settingsFlags = tool === 'codex' ? settings.filter(one => !found.has(one)).flatMap(one => aCodexOption(one, row)) : []
  if (tool === 'claude-code' && settings.length > 0) {
    const given = args.findIndex((one, i) => i > 0 && i < end && (one === '--settings' || one.startsWith('--settings=')))
    if (given < 0) settingsFlags.push('--settings', JSON.stringify(theSettingsAsOneObject(settings)))
    else if (args[given] === '--settings') {
      if (given + 1 >= end) throw new Error('A native startup option has no value. Nothing was started.')
      args[given + 1] = theSettingsJoinedIntoText(args[given + 1], settings, "The command's --settings", row)
    } else args[given] = `--settings=${theSettingsJoinedIntoText(args[given].slice('--settings='.length), settings, "The command's --settings", row)}`
  }
  const flags = [...(found.has('model') ? [] : [tool === 'claude-code' ? '--model' : '-m', wantedModel]), ...effortFlags, ...settingsFlags]
  // Codex resume options must follow exec, before resume, or native Codex drops earlier configuration.
  const resume = tool === 'codex' ? args.indexOf('resume') : -1
  const at = resume > 0 && resume < end ? resume : end
  args.splice(at,0,...flags)
  // OpenCode takes the row's settings in OPENCODE_CONFIG_CONTENT, joined into the content the caller's environment gives.
  const content = tool === 'opencode' && settings.length > 0
    ? {OPENCODE_CONFIG_CONTENT:theSettingsJoinedIntoText(env.OPENCODE_CONFIG_CONTENT, settings, 'OPENCODE_CONFIG_CONTENT', row)} : {}
  return {command:args,env:{...(line !== null && line.environment !== null && native.effort !== null ? {[line.environment]:native.effort} : {}),...content},start}
}
/** Read only a terminal native error envelope; discussion and quota/capacity events are never model refusals. */
/** The finite native refusal codes are protocol words, independent of model and effort names. */
export function nativeRefusalWithCode(code, message) {
  if (code === 'not_found_error' && (typeof message !== 'string' || !/^model:/.test(message))) return null
  const modelCodes = ['model_not_found','invalid_model','unsupported_model','ProviderModelNotFoundError','MODEL_NOT_FOUND','NO_ADAPTER','not_found_error']
  const optionCodes = ['unsupported_parameter','invalid_reasoning_effort','unsupported_reasoning_effort','UNSUPPORTED_REASONING_EFFORT','unknown_variant','invalid_option']
  const kind = modelCodes.includes(code) ? 'model' : optionCodes.includes(code) ? 'option' : null
  if (kind === null || typeof message !== 'string' || message.trim() === '') return null
  return {kind,code,said:maskedAsAPrintedLine(message).slice(0,2000)}
}
export function theNativeSelectionRefusal(runtime, text) {
  const lines = String(text).slice(-256*1024).trim().split(/\r?\n/)
  if (runtime === 'dsh') {
    // The installed headless driver writes this terminal stderr line, after any assistant text.
    // A shell runner may append its own exit marker after it.
    if (/^=== dsh agent end .* exit \d+$/.test(lines.at(-1) ?? '')) lines.pop()
    const native = /^dsh: ([A-Za-z_]+): (.+)$/.exec(lines.at(-1) ?? '')
    return native === null ? null : nativeRefusalWithCode(native[1],native[2])
  }
  let event
  try { event = JSON.parse(lines.at(-1)) } catch { return null }
  let error
  if (runtime === 'codex') error = event?.type === 'turn.failed' ? event.error : event?.type === 'error' ? event.error ?? event :
    event?.type === 'event_msg' && event.payload?.type === 'task_complete' ? event.payload.error : null
  else if (runtime === 'claude-code') {
    if (event?.type !== 'result' || event.is_error !== true || !Array.isArray(event.errors)) return null
    for (const diagnostic of event.errors) {
      if (typeof diagnostic !== 'string') continue
      const at = diagnostic.indexOf('{')
      if (at === -1) continue
      try {
        const body = JSON.parse(diagnostic.slice(at)), problem = body.error
        if (problem?.type === 'not_found_error' && !/^model:/.test(problem.message ?? '')) continue
        const refusal = nativeRefusalWithCode(problem?.code ?? problem?.type,problem?.message)
        if (refusal !== null) return refusal
      } catch { /* An unstructured native diagnostic stays unknown. */ }
    }
    return null
  } else if (runtime === 'opencode') {
    if (event?.type !== 'error') return null
    if (event.error?.name === 'ProviderModelNotFoundError' && word(event.error.data?.providerID) && word(event.error.data?.modelID)) {
      return nativeRefusalWithCode(event.error.name,`Model not found: ${event.error.data.providerID}/${event.error.data.modelID}`)
    }
    if (event.error?.name !== 'APIError') return null
    try { error = JSON.parse(event.error.data.responseBody)?.error } catch { return null }
  } else return null
  return !map(error) ? null : nativeRefusalWithCode(error.code ?? error.codex_error_info ?? error.name ?? error.type,error.message)
}
/**
 * CASE 3 (wave 13n round BK): the native program refused, with an option refusal, an effort that is not the row's own.
 * The row is not held, because its own effort was not tried; this is the one sentence the launcher logs and the crash
 * detail carries. Null for a refusal of the model, or for a start at the row's own effort: those hold the row as before.
 */
export function theRefusalOfAnEffortNotTheRows(start, refusal) {
  if (refusal?.kind !== 'option' || start?.rowsEffort === undefined) return null
  const said = refusal.said.trimEnd(), ended = /[.!?]$/.test(said) ? said : `${said}.`
  const refused = `The native program refused effort ${start.effort} for native model ${start.native.model} on ${theRowOf(start.selection)}`
  return start.rowsEffort === null
    ? `${refused}, which sets no effort: ${ended} ${THE_ROW_IS_NOT_HELD_NO_EFFORT_WAS_TRIED}`
    : `${refused}, in place of the row's own effort ${start.rowsEffort}: ${ended} ${THE_ROW_IS_NOT_HELD_OWN_EFFORT_WAS_NOT_TRIED}`
}

/** The words a launcher command uses when the runtime map does not hold the runtime it was asked for. */
export function theRuntimeTheMapDoesNotHoldWords(verb, runtime, runtimes) {
  return `${verb} cannot start runtime ${runtime}: it starts ${runtimes.join(', ')}. Nothing was started.`
}
/** The words a launcher command uses when the map holds the runtime but this file has no command for it. */
export function theRuntimeWithNoCommandWords(verb, runtime) {
  return `${verb} has no command for runtime ${runtime}. Nothing was started.`
}
