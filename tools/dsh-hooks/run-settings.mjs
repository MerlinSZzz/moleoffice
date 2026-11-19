// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readLauncherSelection } from '../../src/config/launcher-selection.mjs'
import { LAUNCHER_MODEL_COMPATIBILITY } from '../../src/config/model-efforts.mjs'
import { THE_OFFICE_PROFILES_OWN_CONFIG, partsOfASettingName, theLaunchersRefusalOfASetting, theSettingTheLauncherKeeps } from '../../src/config/the-launchers-own-settings.mjs'
/** Per-run DSH settings. Saved bytes may contain credentials; neither bytes nor native errors are logged. */
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { delimiter, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readSetting } from '../../src/config/settings.mjs'
import { theDshSelection, aCommandsStartFromTheOffice, anAgentsToolHeaders } from '../sandbox-common.mjs'

/** Locate the installed implementation; an explicit stand-in path never falls through to a real install. */
function theInstalledReader(dshDir, env) {
  if (env.SANDBOX_DSH_NATIVE_READER !== undefined) return env.SANDBOX_DSH_NATIVE_READER
  const installations = [createRequire(join(dshDir, 'npm/package.json'))]
  for (const program of (env.PATH ?? '').split(delimiter).filter(Boolean).map(dir => join(dir, 'dsh'))) {
    if (existsSync(program)) installations.push(createRequire(realpathSync(program)))
  }
  for (const require of installations) {
    try { return require.resolve('@deepseek-ai/dsh-settings-file') }
    catch (error) { if (error.code !== 'MODULE_NOT_FOUND' && error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error }
  }
  throw new Error('native reader unavailable')
}

const isMap = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const NATIVE_UNAVAILABLE = 'DSH native settings validator is unavailable or its interface changed; nothing was started.'
const SIMPLE_SCALARS = 'DSH saved settings require simple scalar lines for the selected fields; nothing was started.'

// Native diagnostics can contain saved source text. This child has no Office/model credentials and its streams are
// captured and discarded. Only our bound writer emits the finite status object, after calling the installed parse.
const NATIVE_PARSE = String.raw`
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const reply = process.stdout.write.bind(process.stdout)
process.stdout.write = () => true
process.stderr.write = () => true
process.emitWarning = () => {}
globalThis.fetch = () => { throw new Error('No network in settings validation') }
const send = value => reply(JSON.stringify(value))
try {
  const native = await import(pathToFileURL(process.argv[1]).href)
  const parse = native.FileSettingsProvider?.prototype?.parse
  if (typeof parse !== 'function') throw new Error('parse unavailable')
  const selected = JSON.parse(process.argv[3])
  const context = { spec: { format: 'yaml', filename: process.argv[2] } }
  const isMap = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  if (!isMap(parse.call(context, '{}'))) throw new Error('parse interface changed')
  let refused = false
  try { parse.call(context, 'invalid: [unterminated') } catch { refused = true }
  if (!refused) throw new Error('parse validation changed')
  try {
    const result = parse.call(context, readFileSync(0, 'utf8'))
    if (!isMap(result)) throw new Error('parse result changed')
    const pair = result['agent-default-model']
    const selectionMatches = pair?.provider === selected.provider && pair?.model === selected.model &&
      (!Object.hasOwn(selected, 'reasoningEffort') || (pair?.reasoningEffort === selected.reasoningEffort && result[selected.namespace]?.reasoningEffort === selected.reasoningEffort))
    send({ valid: true, thinkingDisabled: result[selected.namespace]?.thinking === 'disabled', selectionMatches })
  } catch { send({ valid: false }) }
} catch { send({ unavailable: true }) }
`

/** Private installed-source seam, not a public DSH API: call only parse, never construct a service or boot plugins. */
function theNativeValidator(dshDir, env, filename, selected) {
  let reader
  try { reader = theInstalledReader(dshDir, env) } catch { throw new Error(NATIVE_UNAVAILABLE) }
  return text => {
    const checked = spawnSync(process.execPath, ['--input-type=module', '-e', NATIVE_PARSE, reader, filename, JSON.stringify(selected)], {
      input: text, encoding: 'utf8', timeout: 10_000, maxBuffer: 64 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { PATH: env.PATH, HOME: env.HOME, TMPDIR: env.TMPDIR, DSH_HOME: join(dshDir, 'home'), NODE_NO_WARNINGS: '1', NO_COLOR: '1' },
    })
    // Never include child output, error messages or saved contents in a refusal.
    let result
    try { result = JSON.parse(checked.stdout) } catch { throw new Error(NATIVE_UNAVAILABLE) }
    if (checked.status !== 0 || checked.error || !isMap(result) || typeof result.valid !== 'boolean' ||
      (result.valid && (typeof result.thinkingDisabled !== 'boolean' || typeof result.selectionMatches !== 'boolean'))) throw new Error(NATIVE_UNAVAILABLE)
    return result
  }
}

/** Replace only proved plain scalar spans; every other original byte, comments and anchors included, stays. */
function withSelectedScalars(text, namespace, fields) {
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? []
  const body = raw => raw.replace(/\r?\n$/, '')
  const newline = text.includes('\r\n') ? '\r\n' : '\n'
  const header = lines.findIndex(raw => new RegExp(`^(?:${namespace}|"${namespace}"|'${namespace}')\\s*:`).test(body(raw)))
  if (header === -1) {
    const prefix = text === '' || text.endsWith('\n') ? text : text + newline
    return prefix + namespace + (fields.length === 0 ? ': {}' + newline : ':' + newline + fields.map(([key, value]) => `  ${key}: ${value}${newline}`).join(''))
  }
  if (fields.length === 0) return text
  if (!new RegExp(`^${namespace}:[ \\t]*(?:#.*)?$`).test(body(lines[header]))) throw new Error(SIMPLE_SCALARS)
  let end = header + 1
  while (end < lines.length && (/^\s/.test(body(lines[end])) || /^\s*(?:#.*)?$/.test(body(lines[end])))) end++
  const missing = []
  for (const [key, value] of fields) {
    const broad = new RegExp(`^  (?:${key}|"${key}"|'${key}')\\s*:`)
    const index = lines.findIndex((raw, at) => at > header && at < end && broad.test(body(raw)))
    if (index === -1) { missing.push(`  ${key}: ${value}${newline}`); continue }
    const scalar = new RegExp(`^(  ${key}:[ \\t]+)([A-Za-z0-9][A-Za-z0-9._:/@-]*)([ \\t]+#.*|[ \\t]*)$`).exec(body(lines[index]))
    if (scalar === null) throw new Error(SIMPLE_SCALARS)
    for (let after = index + 1; after < end; after++) {
      const next = body(lines[after])
      if (/^\s*(?:#.*)?$/.test(next)) continue
      if (/^ {3,}\S/.test(next)) throw new Error(SIMPLE_SCALARS)
      break
    }
    const ending = lines[index].slice(body(lines[index]).length)
    lines[index] = scalar[1] + value + scalar[3] + ending
  }
  if (missing.length !== 0) {
    if (!lines[header].endsWith('\n')) lines[header] += newline
    lines.splice(header + 1, 0, ...missing)
  }
  return lines.join('')
}

/** Set an own property, so a part named __proto__ is a key like any other. */
const put = (object, key, value) => Object.defineProperty(object, key, { value, enumerable: true, writable: true, configurable: true })

/**
 * A CASTING ROW'S dsh SETTINGS AS PATCH ENTRIES. A setting is named `<entry id>.<config path>`. A run's patch entry
 * replaces the entry's whole config, so each starts from the office profile's own config for that entry
 * (THE_OFFICE_PROFILES_OWN_CONFIG in src/config/the-launchers-own-settings.mjs, which tools/dsh-hooks/install-profile.mjs
 * writes into the profile). An entry the office profile gives no config of its own is refused.
 */
function theRowsPatchEntries(selected) {
  const settings = selected.native.settings ?? []
  const row = selected.casting === null ? 'the selection' : `Casting row ${selected.casting.id}`
  const kept = settings.length === 0 ? null : theSettingTheLauncherKeeps('dsh', settings)
  if (kept !== null) throw new Error(theLaunchersRefusalOfASetting(row, 'dsh', kept))
  const entries = new Map()
  for (const { name, value } of settings) {
    const [id, ...path] = partsOfASettingName(name)
    const refused = why => new Error(`DSH refused the selection: ${row} sets ${name}, ${why}. Nothing was started.`)
    if (!Object.hasOwn(THE_OFFICE_PROFILES_OWN_CONFIG, id)) throw refused(`and the office profile gives entry ${id} no config of its own to start from`)
    if (path.length === 0) throw refused(`which names entry ${id} and no setting in its config`)
    const config = entries.get(id) ?? JSON.parse(JSON.stringify(THE_OFFICE_PROFILES_OWN_CONFIG[id]))
    let at = config
    for (const part of path.slice(0, -1)) {
      if (!Object.hasOwn(at, part)) put(at, part, {})
      else if (!isMap(at[part])) throw refused(`under ${part}, which the office profile's config for entry ${id} gives a value that is not a table`)
      at = at[part]
    }
    put(at, path.at(-1), JSON.parse(JSON.stringify(value)))
    entries.set(id, config)
  }
  return [...entries].map(([id, config]) => ({ id, config }))
}

/**
 * Validate the whole document natively, then edit bytes only in the two selected namespaces. The patch it writes holds the
 * settings file, the selected model, and a Casting row's own dsh settings, each as an entry of dsh's patch list.
 */
export async function prepareDshSettings({ model, effort, selection: selectedTuple, dshDir, scratch, env = process.env, notice = line => process.stderr.write(line + '\n') }) {
  const selected = selectedTuple === undefined ? null : readLauncherSelection(selectedTuple)
  const native = selected === null ? null : selected.native
  const rowsEntries = selected === null ? [] : theRowsPatchEntries(selected)
  const selection = native === null ? theDshSelection(model, effort) : {provider:native.provider,model:native.model,...(native.effort === null ? {} : {reasoningEffort:native.effort})}
  const namespace = LAUNCHER_MODEL_COMPATIBILITY.dshProviderNamespaces[selection.provider]
  if (effort !== null && namespace === undefined) throw new Error('DSH cannot carry effort for this native provider without its settings namespace. Nothing was started.')
  const saved = join(dshDir, 'home/settings.yaml')
  let text
  // Latin-1 is a reversible view of saved bytes. Inserted literals enter that same view; validation reads UTF-8.
  try { text = readFileSync(saved).toString('latin1') }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('The saved DSH settings could not be read; nothing was started.') }
  const validate = theNativeValidator(dshDir, env, saved, {...selection,namespace})
  const held = validate(Buffer.from(text ?? '', 'latin1'))
  if (!held.valid) throw new Error('The saved DSH settings could not be parsed; nothing was started.')
  if (held.thinkingDisabled && effort !== null && effort !== LAUNCHER_MODEL_COMPATIBILITY.dsh.disabledThinkingEffort) {
    throw new Error('DSH thinking is disabled in the saved settings and conflicts with the selected effort; nothing was started.')
  }
  let edited = text ?? ''
  const literal = value => native === null ? value : Buffer.from(JSON.stringify(value).replace(/[\u0085\u2028\u2029]/g,char=>'\\u'+char.charCodeAt(0).toString(16).padStart(4,'0')),'utf8').toString('latin1')
  edited = withSelectedScalars(edited, 'agent-default-model', Object.entries(selection).map(([key,value])=>[key,literal(value)]))
  if (namespace !== undefined) edited = withSelectedScalars(edited, namespace, effort === null ? [] : [['reasoningEffort', literal(effort)]])
  // A quoted key, flow root or document-end marker must never make an appended field a second ignored selection.
  const editedStatus = validate(Buffer.from(edited, 'latin1'))
  if (!editedStatus.valid) throw new Error(SIMPLE_SCALARS)
  if (!editedStatus.selectionMatches) throw new Error('DSH edited settings do not match the selected native model and effort; nothing was started.')
  const folder = mkdtempSync(join(scratch, 'dsh-settings-'))
  const file = join(folder, 'settings.yaml')
  const patch = join(folder, 'selection.patch.json')
  writeFileSync(file, Buffer.from(edited, 'latin1'), { mode: 0o600, flag: 'wx' })
  writeFileSync(patch, JSON.stringify([{ id: 'settings', config: { path: file } }, { id: 'agent-default-model', config: { provider: selection.provider, model: selection.model } }, ...rowsEntries]) + '\n', { mode: 0o600, flag: 'wx' })
  if (text === undefined) notice('The saved DSH settings file is missing; this run uses only the selected namespaces.')
  return patch
}

// A standalone runner asks once. The launcher hands its already selected effort and source to its child.
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const given = process.env.SANDBOX_DSH_SELECTION === undefined
      ? (await aCommandsStartFromTheOffice(['dsh', '--profile', 'office'], {
          api: readSetting('MOLE_OFFICE_API', process.env).value, agent: readSetting('MOLE_OFFICE_AGENT', process.env).value, workspace: readSetting('MOLE_OFFICE_WORKSPACE', process.env).value,
          headers: anAgentsToolHeaders({}), model: readSetting('MOLE_OFFICE_AGENT_MODEL', process.env).value,
        })).start
      : JSON.parse(process.env.SANDBOX_DSH_SELECTION)
    const patch = given.model === null ? '' : await prepareDshSettings({ model: given.model, effort: given.requestedEffort, selection: given.selection,
      dshDir: process.argv[2], scratch: process.argv[3] })
    process.stdout.write(given.words + '\n' + patch + '\n')
  } catch (error) {
    process.stderr.write((error instanceof Error && /^(DSH |The saved DSH )/.test(error.message) ? error.message : 'DSH settings could not be prepared; nothing was started.') + '\n')
    process.exitCode = 2
  }
}
