// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW A RUN'S TOOL IS STARTED: THE START VALUES OF ONE COMMAND, AND THE REQUESTS THEY ARE ASKED THROUGH.
 *
 * The sandbox launcher and the message worker (src/worker/runtimes/) start a run's tool with the same
 * values, worked out here. They were in tools/sandbox-common.mjs until wave 13t round W2. An installed
 * office carries no tools/, so its worker failed as it loaded, and no Codex, OpenCode or Kimi run could
 * start. tools/sandbox-common.mjs exports every name here as before.
 *
 * NOTHING HERE IMPORTS FROM tools/, so the worker an installed office ships can load it. One check lives in
 * tools/: whether DSH can take the selected model, and whether the effort is a plain word (theDshSelection
 * in tools/sandbox-common.mjs). So the caller hands that check in, as `checkTheDshSelection`, and a
 * DSH start that needs it and was given none is refused in words. tools/sandbox-common.mjs hands it in
 * on every launcher path. The worker starts no DSH run (src/worker/runtimes/index.ts), so it hands in
 * nothing.
 */

import { join } from 'node:path'
import { REPO_ROOT } from './settings.mjs'
import { carriesTheTestMark } from './the-test-mark.mjs'
import { STAND_IN_HEADER } from './stand-in-header.mjs'
import { THE_EFFORT_SOURCES, THE_MODELS_START_VALUES, THE_RUNTIMES_FAST_MODE, theOwnersEffort, withoutTheProvider } from './model-efforts.mjs'
import { CODEX_OPTIONS_WITH_A_VALUE } from './run-permissions.mjs'
import { LAUNCHER_MODEL_COMPATIBILITY } from './model-efforts.mjs'
import { readLauncherSelection, applyLauncherSelection, theRowsEffortUnder, THE_PROGRAM_A_RUNTIME_RUNS, LEGACY_SELECTION_NOTICE } from './launcher-selection.mjs'
import { HOW_EACH_COMMAND_TAKES_AN_EFFORT } from './how-a-command-takes-an-effort.mjs'

/** How long one request to the office may take. Every request here is small. A test may shorten it (aWaitATestMayShorten). */
export const REQUEST_TIMEOUT_MS = 30_000

/**
 * A WAIT A TEST MAY SHORTEN: a shorter whole number of milliseconds in the variable `named`, read only when this process
 * carries the test mark, and `longest` otherwise. Nothing a person or an ordinary run sets can shorten a bound.
 * @param {number} longest
 * @param {string} named
 * @returns {number}
 */
export function aWaitATestMayShorten(longest, named) {
  const shorter = Number(carriesTheTestMark() ? process.env[named] : undefined)
  return Number.isInteger(shorter) && shorter > 0 && shorter < longest ? shorter : longest
}

/**
 * ONE REQUEST TO THE OFFICE. Answers `{status, body, standIn}`, or `{status: null, why, code}` when nothing
 * answered at all, so a caller can tell "the office refused" from "the office is not there". `code` says why
 * nothing answered when the error says (ECONNREFUSED, TimeoutError), and is null when it does not. `standIn`
 * is true when the answer came from the dev supervisor's stand-in (STAND_IN_HEADER), not from a server.
 * `timeoutMs` is the bound for this one request; without it every request waits the ordinary bound, which a test
 * may shorten.
 *
 * @param {string} api
 * @param {string} path
 * @param {{ method?: string, headers?: Record<string, string>, body?: unknown, workspace?: string, timeoutMs?: number }} [options]
 */
export async function askTheOffice(api, path, { method = 'GET', headers = {}, body, workspace, timeoutMs = aWaitATestMayShorten(REQUEST_TIMEOUT_MS, 'SANDBOX_REQUEST_TIMEOUT_MS') } = {}) {
  try {
    const res = await fetch(`${api}${path}`, {
      method,
      headers: { ...(workspace === undefined ? {} : { 'x-mole-office-workspace': workspace }), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await res.text()
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = { error: text.slice(0, 500) }
    }
    return { status: res.status, body: parsed, standIn: res.headers.has(STAND_IN_HEADER) }
  } catch (why) {
    // WHY NOTHING ANSWERED, as a code when there is one: `ECONNREFUSED` means the request never reached the office
    // (askTheOfficeWhileItRestarts asks again only then), and `TimeoutError` means it may have.
    const code = why instanceof Error ? (/** @type {{ code?: unknown }} */ (why.cause ?? {}).code ?? why.name) : null
    return { status: null, why: why instanceof Error ? why.message : String(why), code: typeof code === 'string' ? code : null }
  }
}

/** What the office said, in its own words, for a refusal printed to a person. */
export function theOfficeSaid(reply) {
  if (reply.status === null) return `nothing answered (${reply.why})`
  const said = reply.body?.error ?? reply.body?.message ?? JSON.stringify(reply.body)
  return `${reply.status}: ${String(said).slice(0, 2000)}`
}

/** Headless DSH has no native resume; Office ancestry links its separate sessions. */
export const DSH_START_WORDS = 'headless DSH starts a fresh native session; Office ancestry is not native resume'

/** The row for the model, or no effort. Missing effort reminds rather than gates. */
export function theModelsStartValues(model) {
  return typeof model === 'string' && Object.hasOwn(THE_MODELS_START_VALUES, withoutTheProvider(model))
    ? THE_MODELS_START_VALUES[LAUNCHER_MODEL_COMPATIBILITY.aliases[model]] ?? { effort: null } : { effort: null }
}

/**
 * How one runtime's command line takes an effort (HOW_EACH_COMMAND_TAKES_AN_EFFORT), or null for a word with no line.
 * @param {string} tool
 */
function howItTakesAnEffort(tool) {
  return Object.hasOwn(HOW_EACH_COMMAND_TAKES_AN_EFFORT, tool) ? HOW_EACH_COMMAND_TAKES_AN_EFFORT[tool] : null
}

/** Every way the table says a command line takes an effort, so a caller's own effort is read whichever runtime it names. */
const EFFORT_LINES = Object.values(HOW_EACH_COMMAND_TAKES_AN_EFFORT).filter((line) => line !== null)
const EFFORT_OPTIONS = EFFORT_LINES.flatMap((line) => line.option === null ? [] : [line.option])
const EFFORT_SETTINGS = EFFORT_LINES.flatMap((line) => line.setting === null ? [] : [line.setting])

/** A command's explicit startup options. Words after -- are input, not options. */
function theStartOptions(command) {
  const found = []
  const long = ['--model', ...EFFORT_OPTIONS, '--config']
  for (let i = 1; i < command.length && command[i] !== '--'; i++) {
    const word = command[i]
    const paired = ['--model', '-m', ...EFFORT_OPTIONS, '-c', '--config'].includes(word)
    const equals = word.indexOf('=')
    const match = (equals > 0 && long.includes(word.slice(0, equals)) ? [word, word.slice(0, equals), word.slice(equals + 1)] : null) ?? /^(-m|-c)(.+)$/.exec(word)
    if (!paired && match === null) continue
    const key = paired ? word : match[1]
    const value = paired ? command[++i] : match[2]
    if (typeof value !== 'string' || value === '') throw new Error(`${key} needs a value. Nothing was started.`)
    found.push({ key, value })
  }
  return found
}

/** The setting a -c or --config option sets, and its value as written, or null for any other option. TOML lets spaces stand around the =. */
function theSettingIn(one) {
  const config = one.key === '-c' || one.key === '--config' ? /^([^=\s]+)\s*=\s*(.*)$/.exec(one.value.trim()) : null
  return config === null ? null : { name: config[1], value: config[2] }
}

/**
 * Why a DSH start through this file alone is refused. The check is in tools/ (see the top of this file).
 */
export const A_DSH_START_NEEDS_ITS_CHECK =
  'This DSH start hands DSH a model and an effort, and nobody handed in the check that DSH can take them. ' +
  'That check is in tools/sandbox-common.mjs, which hands it in. Nothing was started.'

/**
 * WHY A START IS REFUSED WHEN THE LAUNCHER'S TABLE DOES NOT NAME ITS MODEL. An answer that came from the office and
 * gave no native selection is not an older or unavailable Office, so it gets its own words; a missing answer, a
 * stand-in's 503 and an office older than the effort answer keep the older sentence.
 * @param {string} model
 * @param {{ unavailable?: boolean, predatesEffort?: boolean, castingRow?: number | null, noSelection?: { says?: string } } | null | undefined} effortAnswer
 */
function aModelTheLauncherCannotStart(model, effortAnswer) {
  const theOfficeAnswered = effortAnswer !== null && effortAnswer !== undefined && effortAnswer.unavailable !== true && effortAnswer.predatesEffort !== true
  if (!theOfficeAnswered) return `No complete native selection or exact legacy compatibility data is available for model ${model}; this Office is older or unavailable. Nothing was started.`
  const theReason = typeof effortAnswer.noSelection?.says === 'string' ? effortAnswer.noSelection.says : ''
  const oneLine = theReason.replace(/\p{Cc}+/gu, ' ').replace(/\s+/gu, ' ').trim()
  const reason = oneLine.length <= 400 ? oneLine : `${oneLine.slice(0, 399).trimEnd()}…`
  const said = reason === '' ? null : /[.!?…]$/.test(reason) ? reason : `${reason}.`
  if (said !== null) return `The office gave no native selection for model ${model}, and the launcher's table does not name it. ${said} Nothing was started.`
  const row = typeof effortAnswer.castingRow === 'number' && Number.isSafeInteger(effortAnswer.castingRow) && effortAnswer.castingRow > 0 ? effortAnswer.castingRow : null
  const fillIn = row === null
    ? "A person or a secretary adds a Casting row, or fills in a Casting row's native fields, on the Casting page."
    : `A person or a secretary fills in Casting row ${String(row)}'s native fields on the Casting page.`
  return `The office gave no native selection for model ${model}, and the launcher's table does not name it. ${fillIn} Nothing was started.`
}

/**
 * Give a runtime command the owner's values, after the caller's configuration options. All launcher paths use this.
 * A shell wrapper receives the effort through the environment where supported, and says which flags could not pass.
 * DSH receives its selection through a private settings override, never an unsupported model or effort flag.
 * @param {string[]} command
 * A selection whose effort is not its row's carries the row's own effort as `rowsEffort` (null for a row that sets none),
 * from the recheck, and `officeSaysTheAgent` when the office's answer named the agent's own setting as its source.
 * @param {{ runtime?: string | null, model?: string | null, env?: Record<string, string | undefined>, envFrom?: Record<string, string>, selection?: import('./launcher-selection.mjs').LauncherSelection, rowsEffort?: string | null, officeSaysTheAgent?: boolean, effortAnswer?: { effort: string | null, effortFrom: string, model?: string | null, castingRow?: number | null, unavailable?: boolean, predatesEffort?: boolean } | null, checkTheDshSelection?: ((model: string | null, effort: string | null) => unknown) | null }} options
 */
export function aCommandsStartValues(command, { runtime = null, model = null, env = {}, envFrom = {}, effortAnswer = null, selection = undefined, rowsEffort = undefined, officeSaysTheAgent = false, checkTheDshSelection = null } = {}) {
  if (String(command[0] ?? '').split('/').pop() === 'env') {
    let at = 1
    const assigned = { ...env }
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(command[at] ?? '')) {
      const word = command[at++]
      const split = word.indexOf('=')
      assigned[word.slice(0, split)] = word.slice(split + 1)
    }
    const answer = aCommandsStartValues(command.slice(at), { runtime, model, env: assigned, envFrom, effortAnswer, selection, rowsEffort, officeSaysTheAgent, checkTheDshSelection })
    return { ...answer, command: [...command.slice(0, at), ...answer.command] }
  }
  const program = String(command[0] ?? '').split('/').pop()
  // THE HELPER'S OWN DSH RUNNER hands the selection to dsh's settings (run-settings.mjs), so a selected dsh start from a
  // brief is given the selection as a dsh start with no command of its own, and keeps the runner. Any other shell is
  // refused by the selection.
  const theDshRunner = program === 'bash' && command[1] === join(REPO_ROOT, 'tools', 'dsh-hooks', 'run-agent.sh')
  if (selection !== undefined && selection?.runtime === 'dsh' && theDshRunner) {
    return { ...applyLauncherSelection([], { runtime, model, env, envFrom, selection, rowsEffort, officeSaysTheAgent }), command }
  }
  if (selection !== undefined) return applyLauncherSelection(command, { runtime, model, env, envFrom, selection, rowsEffort, officeSaysTheAgent })
  const actual = aCommandsRuntime(command)
  const shell = ['sh', 'bash'].includes(program) && Object.hasOwn(THE_PROGRAM_A_RUNTIME_RUNS, runtime ?? '')
  if (actual === undefined && runtime !== 'dsh' && !shell) return { command, env: {}, start: null }
  const tool = actual ?? runtime
  // Only these commands consume the DSH handoff. A shell's contents are not inspected. The runner's path is
  // under the install's root, which only src/config/settings.mjs works out.
  const consumesDshSelection = program === 'dsh' || command.length === 0 || theDshRunner
  const dshStart = (start) => consumesDshSelection
    ? { command, env: { SANDBOX_DSH_SELECTION: JSON.stringify(start) }, start }
    : { command, env: {}, start: { ...start, requestedModel: start.model, model: null, effort: null,
      words: `The DSH model and effort selection was not applied because ${shell ? 'a shell command' : 'this command'} cannot carry it; DSH's saved settings decide.` } }
  const options = shell || (tool === 'dsh' && !consumesDshSelection) ? [] : theStartOptions(command)
  const named = options.filter((one) => one.key === '--model' || one.key === '-m').map((one) => one.value)
  const given = model ?? named.at(-1) ?? null
  // A command that names no model here is given no model and no effort: Codex's own configuration decides. The message
  // worker's Codex adapter passes the office's model, and its start is refused without one (startModelRun in
  // src/worker/runtimes/common.ts). Other unnamed runtimes retain their existing settings.
  if (given === null && effortAnswer?.effort == null) {
    const start = tool === 'dsh'
      ? { runtime: tool, model: null, effort: null, requestedEffort: null, effortFrom: 'none', ruleEffort: null, officeUnavailable: effortAnswer?.unavailable ?? false, officePredatesEffort: effortAnswer?.predatesEffort ?? false, fast: false, words: `model not named; no Office effort selected; fast mode off; ${DSH_START_WORDS}` }
      : shell ? { runtime: tool, model: null, effort: null, requestedEffort: null, effortFrom: 'none', ruleEffort: null, officeUnavailable: effortAnswer?.unavailable ?? false, officePredatesEffort: effortAnswer?.predatesEffort ?? false, fast: false, words: 'model not named; flags could not be passed into a shell-wrapped command' }
        : tool === 'codex' ? { runtime: tool, model: null, effort: null, requestedEffort: null, effortFrom: 'none', ruleEffort: null, officeUnavailable: effortAnswer?.unavailable ?? false, officePredatesEffort: effortAnswer?.predatesEffort ?? false, fast: false, words: "model not named, so Codex's own configuration decides; no effort is passed" } : null
    return tool === 'dsh' ? dshStart(start) : { command, env: {}, start }
  }
  if (given !== null && !Object.hasOwn(LAUNCHER_MODEL_COMPATIBILITY.aliases,given)) throw new Error(aModelTheLauncherCannotStart(given, effortAnswer))
  const effortModel = given ?? effortAnswer?.model ?? null
  const ruleEffort = theOwnersEffort(effortModel)
  const effort = effortAnswer === null || effortAnswer.unavailable || effortAnswer.predatesEffort
    ? theModelsStartValues(effortModel).effort : effortAnswer.effort
  for (const value of named) {
    if (withoutTheProvider(value) !== withoutTheProvider(String(given))) {
      throw new Error(`The command names model ${value}, but the run names ${given}. Nothing was started.`)
    }
  }
  const fast = THE_RUNTIMES_FAST_MODE[tool] === true
  const check = (source, value, expected, toml = false) => {
    // Codex's -c accepts TOML strings as well as the bare values used by the launcher.
    const plain = toml ? value.trim().replace(/^(["'])(.*)\1$/, '$2') : value
    if (plain !== expected) throw new Error(`The caller sets ${source} to ${plain}, but ${source !== 'service_tier' && effortAnswer !== null && !effortAnswer.unavailable && !effortAnswer.predatesEffort ? 'the office answers' : "the owner's table sets it to"} ${expected ?? 'no effort'} for model ${given ?? "not named (Codex's own default)"}. Nothing was started.`)
  }
  for (const one of options) {
    if (EFFORT_OPTIONS.includes(one.key)) check(one.key, one.value, effort)
    const setting = theSettingIn(one)
    if (setting !== null && (EFFORT_SETTINGS.includes(setting.name) || setting.name === 'service_tier')) check(setting.name, setting.value, setting.name === 'service_tier' ? (fast ? 'fast' : 'off') : effort, true)
  }
  // HOW THIS RUNTIME TAKES AN EFFORT, from the table: the option or setting the effort goes on its command line as, and
  // the variable its program reads it from as well.
  const line = howItTakesAnEffort(tool)
  const variable = line?.environment ?? null
  if (variable !== null && env[variable] !== undefined) check(variable, env[variable], effort)
  const effortFrom = effort === null ? 'none' : effortAnswer?.effortFrom ?? "the owner's rule"
  const reminder = effortFrom === 'Casting' && ruleEffort !== null && ruleEffort !== effort
    ? ` (${effortFrom} row), the owner's rule says ${ruleEffort} for this model` : ''
  const ruleWords = effort === null ? '' : "; effort from the owner's rule"
  const fallback = effortAnswer?.unavailable ? `; the office could not be asked${ruleWords}`
    : effortAnswer?.predatesEffort ? `; the office did not give an effort (it predates this change)${ruleWords}` : ''
  const sourceWords = effortAnswer !== null && !effortAnswer.unavailable && !effortAnswer.predatesEffort && effort !== null && reminder === ''
    ? `; effort from ${effortFrom}` : ''
  const words = (effort === null
    ? `no effort is set for model ${given ?? effortModel} (not in the owner's rule or a Casting row); started at the program's own default; fast mode ${fast ? 'on' : 'off'}`
    : `effort ${effort}${reminder}, fast mode ${fast ? 'on' : 'off'}`) + fallback + sourceWords
  const start = { runtime: tool, model: given, effort, requestedEffort: effort, effortFrom, ruleEffort, officeUnavailable: effortAnswer?.unavailable ?? false, officePredatesEffort: effortAnswer?.predatesEffort ?? false, fast,
    words: given === null && tool === 'codex' ? `model not named (Codex's own default); ${words}` : words }
  if (tool === 'dsh') {
    if (consumesDshSelection) {
      if (checkTheDshSelection === null) throw new Error(A_DSH_START_NEEDS_ITS_CHECK)
      checkTheDshSelection(given, effort)
    }
    start.words = `${effort === null ? 'no Office effort selected; native settings apply; fast mode off' : words}; ${DSH_START_WORDS}`
    return dshStart(start)
  }
  if (shell) {
    const canSetEffort = variable !== null
    return { command, env: canSetEffort && effort !== null ? { [variable]: effort } : {},
      start: { ...start, effort: canSetEffort ? effort : null, fast: false,
        words: `${canSetEffort ? words : `the launcher could not set effort or fast mode; requested ${start.words}`}; flags could not be passed into a shell-wrapped command` } }
  }
  const carries = (name) => options.some((one) => one.key === name || theSettingIn(one)?.name === name)
  const effortFlags = effort === null || line === null ? []
    : line.option !== null ? (carries(line.option) ? [] : [line.option, effort])
      : carries(line.setting) ? [] : ['-c', `${line.setting}=${effort}`]
  // FAST MODE IS A FACT OF ITS OWN (THE_RUNTIMES_FAST_MODE), and only Codex has it, as its service_tier setting.
  const flags = [...effortFlags, ...(fast && !carries('service_tier') ? ['-c', 'service_tier=fast'] : [])]
  const delimiter = command.indexOf('--')
  const at = delimiter === -1 ? command.length : delimiter
  // When a run names the model outside the command, pass it too, so the settings cannot select another model.
  const modelFlag = named.length === 0 && given !== null ? [tool === 'claude-code' ? '--model' : '-m', tool === 'opencode' ? String(given) : withoutTheProvider(String(given))] : []
  // A RESUMED CODEX THREAD TAKES ITS TWO VALUES BEFORE `resume` (measured on Codex 0.159.2 on 13 October 2026, in sandbox
  // acc-assets): a -c given to the resume subcommand makes Codex drop every -c given to exec before it, office_request's
  // mcp_servers overrides included, so a round ran without the office tool and filed nothing (two rounds of wave 13r).
  // Given before resume, the tool and the effort both hold. The model flag stays where it was.
  const resume = tool === 'codex' ? theCodexResumeWord(command, at) : -1
  const before = resume === -1 ? at : resume
  return {
    command: [...command.slice(0, before), ...(resume === -1 ? [] : flags), ...command.slice(before, at), ...modelFlag, ...(resume === -1 ? flags : []), ...command.slice(at)],
    env: variable !== null && effort !== null ? { [variable]: effort } : {},
    start,
  }
}

/**
 * Where a Codex command's `resume` subcommand is, or -1: the first word after exec (or its alias e) that is not an option
 * or an option's value, when that word is resume, and only before `--` and the prompt.
 * @param {readonly string[]} command
 * @param {number} end
 */
function theCodexResumeWord(command, end) {
  let exec = false
  for (let i = 1; i < end; i++) {
    const word = command[i] ?? ''
    if (word.startsWith('-')) {
      if (CODEX_OPTIONS_WITH_A_VALUE.has(word)) i++
      continue
    }
    if (!exec && (word === 'exec' || word === 'e')) { exec = true; continue }
    return exec && word === 'resume' ? i : -1
  }
  return -1
}

/**
 * Resolve native programs and env assignments as the launcher does. A shell needs a declared runtime.
 * @param {string[]} command
 * @param {string | null | undefined} runtime
 */
export function aCommandsRuntime(command, runtime = undefined) {
  const program = String(command[theProgramsPlace(command)] ?? '').split('/').pop()
  return Object.keys(THE_PROGRAM_A_RUNTIME_RUNS).find(key => THE_PROGRAM_A_RUNTIME_RUNS[key] === program) ?? runtime
}

/**
 * Where a command's program is: its first word, or the first after `env` and the assignments that follow it.
 * @param {readonly string[]} command
 */
function theProgramsPlace(command) {
  let at = 0
  if (String(command[0] ?? '').split('/').pop() === 'env') {
    at = 1
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(command[at] ?? '')) at++
  }
  return at
}

/**
 * WHETHER A COMMAND RESUMES A CONVERSATION (round 54's refusal, item 1). True for `codex exec resume`, and for a Claude
 * Code command that has --continue, -c, --resume or -r before `--`. False for a Codex or Claude Code command without
 * one. Null for any other command, a shell's text included, because its words are not read. A round's receipt takes
 * away what the run it is linked to reported only when its command resumed that run's conversation (theRunItContinues
 * in tools/sandbox-start.mjs): a round that follows a run in a new conversation reports its own totals.
 * @param {readonly string[]} command
 * @returns {boolean | null}
 */
export function theCommandResumesAConversation(command) {
  const words = command.slice(theProgramsPlace(command))
  const delimiter = words.indexOf('--')
  const end = delimiter === -1 ? words.length : delimiter
  const runtime = aCommandsRuntime([...command])
  if (runtime === 'codex') return theCodexResumeWord(words, end) !== -1
  if (runtime === 'claude-code') return words.slice(1, end).some((word) => ['--continue', '-c', '--resume', '-r'].includes(word) || word.startsWith('--resume='))
  return null
}

/** Ask the office before applying flags. An unreachable office, its 503 stand-in, or an office predating effort uses the rule and says why. */
/**
 * @param {string[]} command
 * @param {{ api: string, agent?: string | null, workspace?: string, headers?: Record<string, string>, runtime?: string | null, model?: string | null, env?: Record<string, string | undefined>, envFrom?: Record<string, string>, place?: string, selection?: import('./launcher-selection.mjs').LauncherSelection, castingRow?: { id: number, revision: string | null, program: string, model: string, effort: string | null } | null, checkTheDshSelection?: ((model: string | null, effort: string | null) => unknown) | null }} options
 */
export async function aCommandsStartFromTheOffice(command, { api, agent, workspace, headers = {}, runtime = null, model = null, env = {}, envFrom = {}, place = 'builder', selection = undefined, castingRow = undefined, checkTheDshSelection = null }) {
  const at = theProgramsPlace(command)
  const program = String(command[at] ?? '').split('/').pop()
  const tool = aCommandsRuntime(command, runtime)
  const shell = ['sh', 'bash'].includes(program)
  if (!Object.hasOwn(THE_PROGRAM_A_RUNTIME_RUNS, tool ?? '') || (!shell && program !== THE_PROGRAM_A_RUNTIME_RUNS[tool] && tool !== 'dsh')) {
    return aCommandsStartValues(command, { runtime, model, env, envFrom, checkTheDshSelection })
  }
  const named = model ?? (shell ? null : theStartOptions(command.slice(at)).filter(one => ['--model', '-m'].includes(one.key)).at(-1)?.value) ?? null
  if (selection !== undefined) {
    const { rowsEffort } = await recheckLauncherSelection(api, selection, { workspace, headers })
    return aCommandsStartValues(command, { runtime: tool, model, env, envFrom, selection, rowsEffort, checkTheDshSelection })
  }
  let effortAnswer
  if (!api || !agent) {
    effortAnswer = { effort: null, effortFrom: "the owner's rule", unavailable: true }
  } else {
    const query = new URLSearchParams({ place, runtime: tool })
    if (named !== null) query.set('model', named)
    if (castingRow !== undefined) query.set('row', JSON.stringify(castingRow))
    let answer = await askTheOffice(api, `/api/office/run-models/for/${encodeURIComponent(agent)}?${query}`, { workspace, headers })
    if (castingRow !== undefined && answer.status === 400 && typeof answer.body?.error === 'string' && /Unrecognized keys?: .*"row"/.test(answer.body.error)) throw new Error("This run is not started: the office it asks is older than the check that reads the queue's Casting row again. Nothing was filed.")
    const predatesModelQuery = named !== null && answer.status === 400 && answer.body?.error === 'Which run to answer for Unrecognized key: "model"'
    if (predatesModelQuery) {
      query.delete('model')
      answer = await askTheOffice(api, `/api/office/run-models/for/${encodeURIComponent(agent)}?${query}`, { workspace, headers })
    }
    // AN OFFICE THAT WILL NOT ANSWER THIS CALLER (401, 403) IS ONE THAT CANNOT BE ASKED: a sandbox's helper asks with no key
    // of its own (13 October 2026, a sandbox's run). The start goes on with the default rule, in words.
    if (answer.status === null || (answer.status === 503 && answer.standIn) || answer.status === 401 || answer.status === 403) {
      effortAnswer = { effort: null, effortFrom: "the owner's rule", unavailable: true }
    } else {
      if (answer.status === 409) {
        const error = answer.body?.error
        const sentence = typeof error === 'string' && error.trim() !== '' ? error : theOfficeSaid(answer)
        const said = sentence.trimEnd()
        throw new Error(`The office refused this run: ${said}${said.endsWith('.') ? '' : '.'} Nothing was started.`)
      }
      if (answer.status !== 200) throw new Error(`The office could not answer the run's effort (${theOfficeSaid(answer)}). Nothing was started.`)
      if (Object.hasOwn(answer.body ?? {}, 'selection')) {
        const selected = readLauncherSelection(answer.body.selection)
        const { rowsEffort } = await recheckLauncherSelection(api, selected, { workspace, headers })
        // The launcher holds the office's answer here, so only here may the start say the office named the agent's own setting.
        return aCommandsStartValues(command, { runtime: tool, model, env, envFrom, selection: selected, rowsEffort, officeSaysTheAgent: answer.body?.effortFrom === 'the agent', checkTheDshSelection })
      }
      const bodyIsAnObject = answer.body !== null && typeof answer.body === 'object' && !Array.isArray(answer.body)
      const hasEffortKeys = bodyIsAnObject && (Object.hasOwn(answer.body, 'effort') || Object.hasOwn(answer.body, 'effortFrom'))
      const effort = answer.body?.effort
      const from = answer.body?.effortFrom
      const readableEffort = effort === null || (typeof effort === 'string' && effort.trim() !== '' && effort === effort.trim())
      const readableSource = THE_EFFORT_SOURCES.includes(from) && (effort === null) === (from === 'none')
      if (!bodyIsAnObject || (hasEffortKeys && (!readableEffort || !readableSource))) {
        throw new Error('The office answered without a readable effort and its source. Nothing was started.')
      }
      if (predatesModelQuery || !hasEffortKeys) {
        // Keep the launcher's named model. An older reply may name a different model from Casting.
        effortAnswer = { effort: null, effortFrom: "the owner's rule", unavailable: false, predatesEffort: true }
      } else {
        // THE CASTING ROW THE ANSWER NAMES: the row its model or selection came from, else the row a message run's queue kept.
        const castingRow = typeof answer.body?.casting?.id === 'number' ? answer.body.casting.id
          : typeof answer.body?.kept?.row?.id === 'number' ? answer.body.kept.row.id : null
        // THE REASON AN ANSWER WITH NO SELECTION GIVES, when it gives one. An office older than it has none and keeps the words below.
        const noSelection = answer.body?.noSelection !== null && typeof answer.body?.noSelection === 'object' && typeof answer.body.noSelection.says === 'string'
          ? { says: answer.body.noSelection.says } : undefined
        effortAnswer = named !== null && typeof answer.body?.model === 'string' && answer.body.model !== named && !(LAUNCHER_MODEL_COMPATIBILITY.aliases[named] && LAUNCHER_MODEL_COMPATIBILITY.aliases[named] === LAUNCHER_MODEL_COMPATIBILITY.aliases[answer.body.model])
          ? { effort: null, effortFrom: "the owner's rule", unavailable: false, predatesEffort: true }
          : { effort, effortFrom: from, model: typeof answer.body?.model === 'string' ? answer.body.model : null, castingRow, ...(noSelection === undefined ? {} : { noSelection }), unavailable: false }
      }
    }
  }
  return { ...aCommandsStartValues(command, { runtime: tool, model, env, envFrom, effortAnswer, checkTheDshSelection }), compatibilityWords:LEGACY_SELECTION_NOTICE,
    effortAnswer: { effort: effortAnswer.effort, effortFrom: effortAnswer.effortFrom,
      model: effortAnswer.model ?? named, askedModel: named,
      unavailable: effortAnswer.unavailable === true, predatesEffort: effortAnswer.predatesEffort === true } }
}

/**
 * Recheck the exact selected row. A changed, held or unreadable row never causes another choice. The one difference let
 * through is an effort that is set and is not the row's (theRowsEffortUnder), and then the row's own effort is handed
 * back as `rowsEffort` for the start's words. An unanswered recheck is marked `notRechecked`, so a caller can say what it
 * asked with; a changed row is not.
 */
export async function recheckLauncherSelection(api, value, {workspace, headers={}}={}) {
  const selected = readLauncherSelection(value)
  if (selected.casting === null) return { selection: selected }
  const row = selected.casting
  const answer = await askTheOffice(api, `/api/casting/rows/${row.id}/selection?revision=${encodeURIComponent(row.revision)}`, {workspace,headers})
  if (answer.status !== 200) throw Object.assign(new Error(`The selected Casting row could not be rechecked (${theOfficeSaid(answer)}). Nothing was started.`), { notRechecked: true })
  const current = readLauncherSelection(answer.body?.selection)
  if (JSON.stringify(current) === JSON.stringify(selected)) return { selection: current }
  const rowsEffort = theRowsEffortUnder(selected, current)
  if (rowsEffort === undefined) throw new Error('The selected Casting row changed. Nothing was started.')
  return { selection: selected, rowsEffort }
}
