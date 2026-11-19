// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHEN A CLAUDE CODE SESSION THE OFFICE STARTS COMPACTS ITS CONVERSATION. The rule in wave 13q round 58 is that
 * early compaction ships with the office as a default anyone can change. Two office settings give the window in tokens,
 * and src/config/settings.mjs declares their defaults:
 *   - MOLE_OFFICE_CLAUDE_COMPACTS_AT_ON_THE_HOST, for the conversations the message worker starts on this computer
 *     (startModelRun in src/worker/runtimes/common.ts);
 *   - MOLE_OFFICE_CLAUDE_COMPACTS_AT_IN_A_SANDBOX, for every command tools/sandbox.mjs starts in a sandbox, which has
 *     given each such command a window since 4 October 2026. A message worker that runs in a sandbox is such a
 *     command, so the conversations it starts keep the sandbox's window and are given no other (theConversationsWindow).
 * Both are read at every start, so a change on the Settings page is used from the next start. A Casting row may name its
 * own number as env.CLAUDE_CODE_AUTO_COMPACT_WINDOW in its settings, and then the row's number is used.
 *
 * WHAT CLAUDE CODE 2.1.281 DOES WITH IT, measured in round 58: it reads CLAUDE_CODE_AUTO_COMPACT_WINDOW before its own
 * autoCompactWindow setting. The env of a --settings it is given is copied over the env of its home settings.json, and
 * that over the environment it was started with. It compacts at the smaller of the window and the model's own limit, and
 * its own words take "100k to 1M tokens".
 *
 * Since wave 13q round 64 the dispatch worker, tools/agent-worker.mjs, gives the Claude Code runs it starts the same
 * window as the message worker, through theConversationsWindow and theCompactionWindowGiven.
 *
 * ONLY CLAUDE CODE IS GIVEN IT. Codex, OpenCode and dsh are given nothing, and compact as their own settings say. One
 * Claude Code start is not given it: the inspector's check views, which start in a container of their own without the
 * helper.
 */
import { theSandboxIn } from './run-permissions.mjs'
import { readSettingHere } from './settings.mjs'

/** The variable Claude Code reads its window from. */
export const THE_COMPACTION_VARIABLE = 'CLAUDE_CODE_AUTO_COMPACT_WINDOW'

/** The setting for each place a Claude Code session is started. */
export const THE_COMPACTION_SETTINGS = Object.freeze({
  host: 'MOLE_OFFICE_CLAUDE_COMPACTS_AT_ON_THE_HOST',
  sandbox: 'MOLE_OFFICE_CLAUDE_COMPACTS_AT_IN_A_SANDBOX',
})

/**
 * Where a sandbox start's window came from, in the start's words: tools/sandbox.mjs read the sandbox setting on the host
 * and gave its number to the command it started, and the helper in the container cannot read the setting itself.
 */
export const A_SANDBOX_STARTS_WINDOW_FROM = `${THE_COMPACTION_SETTINGS.sandbox}, which tools/sandbox.mjs read on the host for this start`

/** The fewest and the most tokens Claude Code 2.1.281 takes as a window, in its own words. */
const THE_WINDOWS_CLAUDE_CODE_TAKES = Object.freeze({ fewest: 100_000, most: 1_000_000 })

/**
 * Why a value of one of the two settings cannot be used, or null when it can, or when the name is another setting's.
 * The settings door asks this before a choice is stored, and every start asks it again of the value it read.
 * @param {string} name @param {string} value @returns {string | null}
 */
export function whatIsWrongWithACompactionWindow(name, value) {
  if (!/** @type {string[]} */ (Object.values(THE_COMPACTION_SETTINGS)).includes(name)) return null
  const { fewest, most } = THE_WINDOWS_CLAUDE_CODE_TAKES
  if (/^\d+$/.test(value) && Number(value) >= fewest && Number(value) <= most) return null
  return `Use a whole number of tokens from ${fewest} to ${most}, the window Claude Code 2.1.281 takes.`
}

/**
 * @typedef {{ tokens: string, setting: string, from: string }} CompactionWindow
 * `from` names the setting and where its value came from, for the start's words.
 */

/**
 * The window a Claude Code start in this place is given, read now. A setting that could not be read, or whose value
 * cannot be used, is refused, and no other number is used in its place.
 * @param {keyof typeof THE_COMPACTION_SETTINGS} place @returns {CompactionWindow}
 */
export function theCompactionWindowHere(place) {
  const setting = THE_COMPACTION_SETTINGS[place]
  const reading = readSettingHere(setting)
  if (reading.source === 'not read') {
    throw new Error(`${setting} could not be read, so it is not known when a Claude Code start compacts. ${reading.why ?? 'Nobody recorded why.'} No other number was used in its place. Nothing was started.`)
  }
  const wrong = reading.value === null ? 'It has no value.' : whatIsWrongWithACompactionWindow(setting, reading.value)
  if (wrong !== null) {
    throw new Error(`${setting} is ${JSON.stringify(reading.value)}, from ${reading.source}. ${wrong} No other number was used in its place. Nothing was started.`)
  }
  return { tokens: /** @type {string} */ (reading.value), setting, from: `${setting} (${reading.source})` }
}

/**
 * The window a Claude Code conversation the message worker starts is given, read now, or null when the environment it is
 * started from is in a sandbox (theSandboxIn, src/config/run-permissions.mjs). There tools/sandbox.mjs gave the worker
 * the sandbox's window, in its environment and in its home settings.json, and the conversation keeps that one. That was
 * a condition of the yes this design was given in wave 13q round 58. The office answering in a sandbox has its own
 * database, so its own settings are not the ones the sandbox was started with.
 * @param {Record<string, string | undefined>} from @returns {CompactionWindow | null}
 */
export function theConversationsWindow(from) {
  return theSandboxIn(from) === null ? theCompactionWindowHere('host') : null
}

/**
 * A HOST START OF CLAUDE CODE GIVEN ITS WINDOW, after the launcher worked out its command (aCommandsStartFromTheOffice
 * in src/config/sandbox-start-values.mjs). The window goes into the env of the command's first --settings before `--`,
 * which Claude Code reads before its home settings.json, and into the run's environment. A command with no --settings
 * is given one. Where the Casting row names the variable, the row's number is already in that --settings, and it is
 * used. A --settings that sets the variable to another number is refused. A start whose words name no window is told
 * which one it was given and where that came from.
 * @template {{ command: string[], env: Record<string, string>, start: ({ words: string, native?: { settings?: { name: string }[] } }) | null }} G
 * @param {G} given @param {CompactionWindow} window @returns {G}
 */
export function theCompactionWindowGiven(given, window) {
  const command = [...given.command]
  if ((command[0] ?? '').split('/').pop() !== 'claude') {
    throw new Error(`This Claude Code start runs ${JSON.stringify(command[0] ?? '')} and not claude, so it cannot be given ${window.from}. Nothing was started.`)
  }
  const end = command.indexOf('--') < 0 ? command.length : command.indexOf('--')
  const at = command.findIndex((one, i) => i > 0 && i < end && (one === '--settings' || one.startsWith('--settings=')))
  const paired = at > 0 && command[at] === '--settings'
  const text = at < 0 ? '{}' : paired ? (at + 1 < end ? command[at + 1] : undefined) : String(command[at]).slice('--settings='.length)
  /** @type {unknown} */ let settings
  try { settings = text === undefined ? undefined : JSON.parse(text) } catch { settings = undefined }
  const anObject = (/** @type {unknown} */ value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  const held = /** @type {{ env?: unknown }} */ (settings)
  if (!anObject(settings) || (held.env !== undefined && !anObject(held.env))) {
    throw new Error(`The command's --settings is not a JSON object whose env is an object, so it cannot be given ${window.from}. Nothing was started.`)
  }
  const env = /** @type {Record<string, unknown> | undefined} */ (held.env)
  const named = env?.[THE_COMPACTION_VARIABLE]
  const rowsOwn = (given.start?.native?.settings ?? []).some((one) => one.name === `env.${THE_COMPACTION_VARIABLE}`)
  if (named !== undefined) {
    if (rowsOwn || String(named) === window.tokens) return given
    throw new Error(`The command's --settings sets ${THE_COMPACTION_VARIABLE} to ${JSON.stringify(named)}, and ${window.from} is ${window.tokens}. Nothing was started.`)
  }
  const joined = JSON.stringify({ ...held, env: { ...env, [THE_COMPACTION_VARIABLE]: window.tokens } })
  if (at < 0) command.splice(end, 0, '--settings', joined)
  else if (paired) command[at + 1] = joined
  else command[at] = `--settings=${joined}`
  const start = given.start === null || given.start.words.includes('; compaction window ') ? given.start
    : { ...given.start, words: `${given.start.words}; compaction window ${window.tokens}, from ${window.from}` }
  return { ...given, command, env: { ...given.env, [THE_COMPACTION_VARIABLE]: window.tokens }, start }
}
