// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
import { writeFileSync } from 'node:fs'
import { isIP } from 'node:net'
import { join } from 'node:path'
import { withSecretsMarked } from './secret-shapes.mjs'
import { inspectionUsageIn, jsonLines } from './usage.mjs'

/** Only a completed second answer with no verdict uses this exit code. Other failures are not retry requests. */
export const CHECK_ENDED_WITH_NO_VERDICT = 42

/**
 * THE KEY, IN A CHECK SESSION'S data.extra, UNDER WHICH THE CHECK TOOL KEEPS A VERDICT IT REFUSED BEFORE POSTING IT, TWICE
 * (round BL, item 2ao). Its value is `{verdict, answer, refusals}`: the model's verdict as JSON text, what the model answered
 * when it was asked once to correct it (or null), and the tool's two refusals, word for word. The tool writes it
 * (tools/the-inspector.mjs) and the office reads it from both sessions when a second check of a run ends with no verdict
 * (recordCheckToolEnded, src/server/lib/inspection.ts).
 */
export const THE_UNPOSTED_VERDICT = 'unpostedVerdict'

/**
 * THE WORDS THAT INTRODUCE THE PATHS A CHECKER TOOL HANDED ON FOR JUDGMENT. tools/the-inspector.mjs prints the first
 * before the list of those paths. The check's prompt (src/server/lib/inspection.ts) puts the second before each path's
 * why. Tests read both here.
 */
export const THE_PATHS_HANDED_ON_FOR_JUDGMENT = 'Paths a checker tool handed on for judgment:'
export const WHY_THE_TOOL_COULD_NOT_DECIDE_IT = 'Why the tool could not decide it:'

// ================================================================================ the commands a check runs

/**
 * THE FOLDER A CHECK'S COMMANDS ARE READ FROM INSIDE ITS VIEW. tools/inspector-sandbox.mjs runs each command as
 * `sh <this folder>/<label>.sh`, and the launcher writes that command into the command's process row. So the row says which
 * command it was, and `whyTheCheckCrashed` reads the stage from the rows.
 */
export const THE_CHECK_COMMANDS_FOLDER = '/inputs/commands'

/**
 * The command line tools/inspector-sandbox.mjs runs for one of a check's commands, by its label.
 * @param {string} label
 * @returns {string[]}
 */
export function aCheckCommand(label) {
  return ['sh', `${THE_CHECK_COMMANDS_FOLDER}/${label}.sh`]
}

// THE LABELS BELOW ARE WRITTEN AS TEXT IN tools/the-inspector.mjs TOO, which does not import them: two tests lift single
// functions out of its source and run them without its imports. tests/a-crashed-check-says-why.test.ts reads each of them
// there, so a label changed in one place and not the other fails that test.

/** The label of the command that checks the work out, in tools/the-inspector.mjs. */
export const THE_CHECKOUT_COMMAND = 'checkout'

/** The runtimes a check can run its model in, as tools/the-inspector.mjs takes them from the office. */
export const THE_RUNTIMES_A_CHECK_RUNS = /** @type {const} */ (['claude-code', 'codex', 'opencode', 'dsh'])

/**
 * The label of the command that runs a check's model, in tools/the-inspector.mjs: the runtime's own name, and `claude`
 * for Claude Code.
 * @param {string} runtime
 * @returns {string}
 */
export function theModelsCommand(runtime) {
  return runtime === 'claude-code' ? 'claude' : runtime
}

// ================================================================================ masked as a printed line

/** What stands where a value is not shown. */
const NOT_SHOWN = '<not shown>'

/**
 * A VALUE GIVEN TO A NAME THAT HOLDS KEY, TOKEN, SECRET OR PASSWORD, in upper or lower case anywhere in the name: `NAME=value`,
 * `name: value` and `"name": "value"`. The value is the quoted string, or the run of letters up to the next space.
 */
const A_SECRET_NAMES_VALUE = /([A-Za-z0-9_.-]*(?:key|token|secret|password)[A-Za-z0-9_.-]*["']?\s*[:=]\s*)("[^"\n]*"|'[^'\n]*'|\S+)/gi

/** A login: a name, @, and a host whose name starts with a letter, so `vitest@4.0.1` is not one. */
const A_LOGIN = /(?<![\w.%+-])[A-Za-z0-9._%+-]+@[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)*/g

/** A home folder: /home/<name>, /Users/<name> or /root, not inside a longer word or path. */
const A_HOME = /(?<![\w.~/-])(?:\/home\/[A-Za-z0-9._-]+|\/Users\/[A-Za-z0-9._-]+|\/root(?![\w.-]))/g

/** What may be an address of version 4. `isIP` decides. */
const MAYBE_AN_IPV4 = /(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.]*\d)/g

/** What may be an address of version 6: hex digits and colons with at least one colon and one digit. `isIP` decides. */
const MAYBE_AN_IPV6 = /(?<![\w:.])[0-9A-Fa-f:]*:[0-9A-Fa-f:]*(?:%[A-Za-z0-9_-]+)?(?![\w:])/g

/**
 * TEXT MASKED AS EVERY PRINTED LINE IS. The value of every name that holds KEY, TOKEN, SECRET or PASSWORD, in any case;
 * then every piece src/config/secret-shapes.mjs takes for a key; then logins, home folders and addresses. A name keeps
 * its place, and its value is written `<not shown>`. A home folder is written `~`.
 *
 * The named values are taken out first and the shapes are looked for between them, so the shapes never read the
 * `<not shown>` that stands for a value as a value of its own.
 * @param {string} text
 * @returns {string}
 */
export function maskedAsAPrintedLine(text) {
  const pieces = text.split('\n').flatMap((line, index) => {
    const parts = []
    let from = 0
    for (const match of line.matchAll(A_SECRET_NAMES_VALUE)) {
      // The first group always takes part in a match: it is the name and its sign.
      parts.push({ text: line.slice(from, match.index + /** @type {string} */ (match[1]).length), hidden: true })
      from = match.index + match[0].length
    }
    parts.push({ text: line.slice(from), hidden: false })
    return index === 0 ? parts : [{ text: '\n', hidden: false }, ...parts]
  })
  return pieces
    .map((piece) => withSecretsMarked(piece.text).text + (piece.hidden ? NOT_SHOWN : ''))
    .join('')
    .replace(A_LOGIN, '<a login, not shown>')
    .replace(A_HOME, '~')
    .replace(MAYBE_AN_IPV4, (word) => (isIP(word) === 4 ? '<an address, not shown>' : word))
    .replace(MAYBE_AN_IPV6, (word) => (/[0-9A-Fa-f]/.test(word) && isIP(word.split('%')[0] ?? '') === 6 ? '<an address, not shown>' : word))
}

// ================================================================================ why a check crashed

/**
 * @typedef {'before the first process row' | 'during the checkout' | 'after the checkout' | 'during the model' | 'after the model' | 'not known'} CheckStage
 * @typedef {{ op?: unknown, field?: unknown, oldValue?: unknown, newValue?: unknown, appendOrder?: unknown }} ARecordsChange
 * @typedef {{ carried?: unknown, total?: unknown }} TheChangesCarried
 * @typedef {{ changes?: unknown, changesCarried?: unknown }} ARecordAsTheOfficeGaveIt
 * @typedef {{ stage: CheckStage, stageSays: string, code: number | null, signal: string | null, exitSays: string,
 *   errorStreamSays: string, refusal?: string, lastLines?: string | null, leftOut?: number }} CheckCrash
 */

/** The most of the error stream that is kept, in bytes, after it is masked. */
export const THE_LAST_LINES_KEPT = 2048

/**
 * THE SENTENCES THE LAUNCHER AND ITS HELPER PRINT WHEN THEY START NOTHING, as a check's error stream carries them. A
 * command whose one argument is too long gets no seat, and its sentence is the third, naming E2BIG. `words` is a piece of
 * the sentence as each file in `writtenIn` writes it. A test reads those files for it, so a sentence changed there fails
 * that test and is not silently missed here.
 */
export const THE_STARTERS_REFUSALS = [
  { about: 'the disk floor', pattern: /the machine has [^\n]*? free where the sandboxes are, [^\n]*/g, words: ' free where the sandboxes are, under the ', writtenIn: ['tools/sandbox.mjs'] },
  { about: 'free space that could not be read', pattern: /the free space where the sandboxes are is unknown: [^\n]*/g, words: 'the free space where the sandboxes are is unknown: ', writtenIn: ['tools/sandbox.mjs'] },
  { about: 'no seat', pattern: /No \S+ seat was given \([^\n]*/g, words: ' seat was given (', writtenIn: ['tools/sandbox.mjs', 'tools/sandbox-start.mjs'] },
]

/**
 * HOW THE CHECK'S PROCESS ENDED, from the text of the file the worker writes beside its output when it exits: `N`, or
 * `signal:SIGNAME`. Null is no such file, and nothing recorded the end.
 * @param {string | null} exit
 * @returns {{ code: number | null, signal: string | null, exitSays: string }}
 */
export function theWayACheckExited(exit) {
  if (exit === null) return { code: null, signal: null, exitSays: "Nothing recorded how the check's process ended: there was no exit file." }
  const text = exit.trim()
  if (/^(0|[1-9]\d{0,2})$/.test(text) && Number(text) <= 255) return { code: Number(text), signal: null, exitSays: `The check's process exited with code ${text}.` }
  const signal = /^signal:(SIG[A-Z0-9]+)$/.exec(text)?.[1]
  if (signal !== undefined) return { code: null, signal, exitSays: `The check's process was ended by the signal ${signal}.` }
  return { code: null, signal: null, exitSays: `The exit file held "${maskedAsAPrintedLine(text).slice(0, 80)}", which is neither an exit code nor a signal.` }
}

/** The label in a process row's text, when the row is for one of a check's commands; otherwise null. */
const A_COMMANDS_LABEL = new RegExp(`(?:^|\\s)sh ${THE_CHECK_COMMANDS_FOLDER.replaceAll('/', '\\/')}\\/([A-Za-z0-9_.-]+)\\.sh(?=\\s|$)`)

/** The labels of the commands that run a check's model. */
const THE_MODELS_COMMANDS = new Set(THE_RUNTIMES_A_CHECK_RUNS.map(theModelsCommand))

/**
 * HOW FAR A CHECK GOT, read from the process rows its session record holds. Each command a check runs in its view has a
 * process row, made when it starts and released when it ends, and the row's text names the command. The newest of them
 * says the stage: the model's command, still open or released; the checkout, still open or released; or another command,
 * which runs after the checkout. A row whose making was not carried, and whose release was, counts as released.
 *
 * The office carries a record's newest changes first. So when any command's row was carried, every newer change was
 * too, and the newest command is known. When none was, the stage is known only when the office says it carried every
 * change: then no command had a row. A check that ran on the host writes no such rows at all, and reads the same.
 * @param {ARecordAsTheOfficeGaveIt | null} record
 * @returns {{ stage: CheckStage, stageSays: string }}
 */
export function theStageACheckReached(record) {
  if (record === null) return { stage: 'not known', stageSays: 'The session record was not read, so the stage is not known.' }
  if (!Array.isArray(record.changes)) return { stage: 'not known', stageSays: 'The session record came without its changes, so the stage is not known.' }
  /** @type {ARecordsChange[]} */
  const changes = record.changes.filter((one) => one !== null && typeof one === 'object')
  const inOrder = [...changes].sort((a, b) => Number(a.appendOrder) - Number(b.appendOrder))
  /** @type {{ label: string, text: string, open: boolean }[]} */
  const rows = []
  for (const change of inOrder) {
    if (change.field !== 'resource.process') continue
    const text = change.op === 'create' ? change.newValue : change.op === 'delete' ? change.oldValue : null
    if (typeof text !== 'string') continue
    const label = A_COMMANDS_LABEL.exec(text)?.[1]
    if (label === undefined) continue
    const made = change.op === 'delete' ? rows.find((row) => row.text === text && row.open) : undefined
    if (made !== undefined) made.open = false
    else rows.push({ label, text, open: change.op === 'create' })
  }
  const newest = rows.at(-1)
  if (newest === undefined) {
    const carried = /** @type {TheChangesCarried} */ (record.changesCarried)
    if (carried !== null && typeof carried === 'object' && typeof carried.carried === 'number' && carried.carried === carried.total) {
      return { stage: 'before the first process row', stageSays: 'No process row was written for any command of this check. It crashed before its first command, or it ran its commands on the host, where no such row is written.' }
    }
    const said = carried !== null && typeof carried === 'object' && typeof carried.carried === 'number' && typeof carried.total === 'number'
      ? `None of the ${String(carried.carried)} changes the office carried is a process row of a check's command, and it left out ${String(carried.total - carried.carried)} older ones`
      : `None of the session's ${String(changes.length)} changes is a process row of a check's command, and the reply did not say whether it carried them all`
    return { stage: 'not known', stageSays: `${said}, so the stage is not known.` }
  }
  if (THE_MODELS_COMMANDS.has(newest.label)) {
    return newest.open
      ? { stage: 'during the model', stageSays: `The process row of the model's command, ${newest.label}, was still open when the record was read.` }
      : { stage: 'after the model', stageSays: `The process row of the model's command, ${newest.label}, was released.` }
  }
  if (newest.label === THE_CHECKOUT_COMMAND && newest.open) {
    return { stage: 'during the checkout', stageSays: 'The process row of the checkout was still open when the record was read.' }
  }
  const name = newest.label === THE_CHECKOUT_COMMAND ? 'the checkout' : newest.label
  return { stage: 'after the checkout', stageSays: `The newest command of this check with a process row was ${name}, and its row ${newest.open ? 'was still open' : 'was released'}.` }
}

/**
 * THE LAST OF THE ERROR STREAM, masked first and then cut: at most THE_LAST_LINES_KEPT bytes, on a whole letter, and from
 * the start of a line when a line starts in what is kept. `leftOut` is the bytes before what is kept. An error stream with
 * no words gives no `lastLines` at all, because the office refuses an empty string; `errorStreamSays` says it was empty.
 * @param {string} masked
 * @returns {{ errorStreamSays: string, lastLines?: string, leftOut?: number }}
 */
function theLastLinesOf(masked) {
  const text = masked.trimEnd()
  if (text === '') return { errorStreamSays: "The check's error stream was empty or blank." }
  const bytes = Buffer.from(text, 'utf8')
  if (bytes.length <= THE_LAST_LINES_KEPT) return { errorStreamSays: 'lastLines is the whole error stream, masked.', lastLines: text, leftOut: 0 }
  let from = bytes.length - THE_LAST_LINES_KEPT
  // A byte 10xxxxxx is inside a letter. The letter starts at the next byte that is not.
  while (from < bytes.length && (/** @type {number} */ (bytes[from]) & 0xc0) === 0x80) from += 1
  const tail = bytes.subarray(from).toString('utf8')
  const newline = tail.indexOf('\n')
  const lastLines = newline === -1 ? tail : tail.slice(newline + 1)
  const kept = Buffer.byteLength(lastLines, 'utf8')
  const leftOut = bytes.length - kept
  return { errorStreamSays: `lastLines is the last ${String(kept)} bytes of the error stream, masked. The ${String(leftOut)} bytes before them were left out.`, lastLines, leftOut }
}

/**
 * WHY A CHECK CRASHED, as one value for the check's session record (its field `whyTheCheckCrashed`, in
 * src/shared/kind-fields/session-wave-13n.ts). The message worker and any other program that ends a check call this, so
 * all of them write the same thing. tools/inspector-why-it-crashed.mjs is the same function for a program that is not
 * written in JavaScript.
 *
 * - `record` is the reply of GET /api/records/<the check's session>, or null when it was not read.
 * - `exit` is the text of the exit file, `N` or `signal:SIGNAME`, or null when there is none.
 * - `errorStream` is what the check's process wrote on its error stream, or null when nothing kept it.
 *
 * The answer holds the stage the check reached, how its process ended, and then the launcher's own refusal when the error
 * stream holds one (the last, when it holds more), or else the last lines of the error stream. `errorStreamSays` says which
 * of those it is, or that the stream was empty, or that nothing kept it. Everything taken from the error stream is masked
 * as every printed line is, before it is cut.
 * @param {{ record: ARecordAsTheOfficeGaveIt | null, exit: string | null, errorStream: string | null }} what
 * @returns {CheckCrash}
 */
export function whyTheCheckCrashed({ record, exit, errorStream }) {
  const stage = theStageACheckReached(record)
  const ended = theWayACheckExited(exit)
  if (errorStream === null) return { ...stage, ...ended, errorStreamSays: "Nothing kept the check's error stream, so what it said last is not known.", lastLines: null }
  const masked = maskedAsAPrintedLine(errorStream)
  /** @type {{ at: number, sentence: string } | null} */
  let last = null
  for (const { pattern } of THE_STARTERS_REFUSALS) {
    for (const match of masked.matchAll(pattern)) {
      if (last === null || match.index > last.at) last = { at: match.index, sentence: match[0] }
    }
  }
  if (last !== null) {
    return { ...stage, ...ended, errorStreamSays: 'The sandbox launcher started nothing, and refusal is its sentence saying why.', refusal: last.sentence.replace(/ Details: .*$/, '').trimEnd() }
  }
  return { ...stage, ...ended, ...theLastLinesOf(masked) }
}

// ================================================================================ the model's steps

/** The file in a check's out folder that holds every tool call its model made. */
export const THE_MODELS_STEPS_FILE = 'the-models-steps.json'

/** How many of the longest calls the check's session names. The file holds all of them. */
export const THE_LONGEST_STEPS_NAMED = 10

/** How many characters of a call's command are kept, after it is masked. A letter outside the basic plane is one. */
export const A_COMMANDS_CHARACTERS_KEPT = 200

/**
 * @typedef {{ tool: string, status: string, start: string, end: string, ms: number, command: string, leftOut?: number }} ModelStep
 * @typedef {{ says: string, count?: number, totalMs?: number, whileAnyRanMs?: number, longest?: ModelStep[], file?: string }} ModelSteps
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isAnObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * A time OpenCode wrote, in milliseconds since 1970, as an instant in UTC. Null when it is not one.
 * @param {unknown} value
 * @returns {string | null}
 */
function anInstant(value) {
  if (typeof value !== 'number' || Number.isNaN(new Date(value).getTime())) return null
  return new Date(value).toISOString()
}

/**
 * ONE TOOL CALL, from the `tool_use` event OpenCode prints when the call has ended: its tool, its status (`completed` or
 * `error`), its start and end, and its command. A bash call's command is its command line. Any other call's command is
 * the tool's name and its input as JSON. The command is masked as every printed line is, and only then cut, so a cut
 * never shows the part of a value that the whole line would have masked. A string is the reason the call cannot be read.
 * @param {Record<string, unknown>} event
 * @returns {ModelStep | string}
 */
function theCallIn(event) {
  const part = isAnObject(event['part']) ? event['part'] : {}
  const state = isAnObject(part['state']) ? part['state'] : {}
  const time = isAnObject(state['time']) ? state['time'] : {}
  const tool = part['tool']
  const status = state['status']
  const input = state['input']
  const start = anInstant(time['start'])
  const end = anInstant(time['end'])
  if (typeof tool !== 'string' || tool.trim() === '') return 'has no tool name'
  if (typeof status !== 'string' || status.trim() === '') return 'has no status'
  if (!isAnObject(input)) return 'has no input'
  if (start === null) return 'has no start time'
  if (end === null) return 'has no end time'
  const ms = /** @type {number} */ (time['end']) - /** @type {number} */ (time['start'])
  if (ms < 0) return 'ends before it starts'
  const commandLine = input['command']
  const command = tool === 'bash' && typeof commandLine === 'string' && commandLine.trim() !== '' ? commandLine.trim() : `${tool} ${JSON.stringify(input)}`
  const letters = Array.from(maskedAsAPrintedLine(command))
  const leftOut = letters.length - A_COMMANDS_CHARACTERS_KEPT
  return { tool, status, start, end, ms, command: letters.slice(0, A_COMMANDS_CHARACTERS_KEPT).join(''), ...(leftOut > 0 ? { leftOut } : {}) }
}

/**
 * EVERY TOOL CALL IN OPENCODE'S OUTPUT, in the order OpenCode printed them. A call is not guessed at: when one cannot be
 * read, no call is counted, and `says` names the first that could not. A line that starts with `{` and is not JSON may
 * have been a call, so then no call is counted either.
 * @param {string} output
 * @returns {{ steps: ModelStep[] } | { says: string }}
 */
function theCallsInOpenCodesOutput(output) {
  const events = jsonLines(output)
  // Every line that starts with { and parses is an object, so jsonLines left out exactly the lines that do not parse.
  const notJson = output.split('\n').filter((line) => line.trim().startsWith('{')).length - events.length
  if (notJson === 1) return { says: "1 line of OpenCode's output starts with { and is not JSON. It may have been a tool call, so none was counted." }
  if (notJson > 1) return { says: `${String(notJson)} lines of OpenCode's output start with { and are not JSON. Each may have been a tool call, so none was counted.` }
  /** @type {ModelStep[]} */
  const steps = []
  for (const event of events) {
    if (event['type'] !== 'tool_use') continue
    const call = theCallIn(event)
    if (typeof call === 'string') return { says: `OpenCode's output holds a tool call that could not be read, so none was counted. Tool call ${String(steps.length + 1)} ${call}.` }
    steps.push(call)
  }
  return { steps }
}

/**
 * HOW LONG AT LEAST ONE CALL WAS RUNNING, in milliseconds. OpenCode runs calls at the same time, so this is less than the
 * calls' times added up when two of them overlap.
 * @param {ModelStep[]} steps
 * @returns {number}
 */
function theTimeWhileAnyRan(steps) {
  const spans = steps.map((one) => [Date.parse(one.start), Date.parse(one.end)]).sort((a, b) => /** @type {number} */ (a[0]) - /** @type {number} */ (b[0]))
  let total = 0
  let until = -Infinity
  for (const [start, end] of /** @type {[number, number][]} */ (spans)) {
    if (end <= until) continue
    total += end - Math.max(start, until)
    until = end
  }
  return total
}

/**
 * @param {number} count
 * @param {number} totalMs
 * @param {number} whileAnyRanMs
 * @param {number} named
 * @returns {string}
 */
function theCallsInWords(count, totalMs, whileAnyRanMs, named) {
  /** @param {number} ms */
  const seconds = (ms) => (ms / 1_000).toFixed(1)
  if (count === 0) return "OpenCode's output holds no tool call by the model, so longest is empty."
  if (count === 1) return `OpenCode's output holds 1 tool call by the model. It ran for ${seconds(totalMs)} seconds, and longest holds it.`
  return `OpenCode's output holds ${String(count)} tool calls by the model. Their times add up to ${seconds(totalMs)} seconds. ` +
    `At least one of them was running for ${seconds(whileAnyRanMs)} seconds. longest holds the ${String(named)} longest, longest first.`
}

/**
 * THE MODEL'S STEPS, as one value for the check's session record (its field `theModelsSteps`, in
 * src/shared/kind-fields/session-wave-13n.ts), and every step in a file in the check's out folder. The message worker
 * and any other program that ends a check call this, so all of them write the same thing.
 * tools/inspector-the-models-steps.mjs is the same function for a program that is not written in JavaScript.
 *
 * - `said` is what the check tool printed on its standard output, or null when nothing kept it.
 * - `folder` is the check's out folder. THE_MODELS_STEPS_FILE is written there.
 *
 * The steps are the tool calls OpenCode printed, read from the model output line the check tool printed. Nothing is
 * asked of the model or of the office. The value holds how many calls there were, their times added up, how long at
 * least one of them was running, and the THE_LONGEST_STEPS_NAMED longest, longest first; two of the same length keep
 * OpenCode's order. The file holds them all. A check whose model ran in another runtime, or whose output cannot be read,
 * gives only `says`, saying why, and no file. When the file cannot be written, the value says so and names no file.
 * @param {{ said: string | null, folder: string }} what
 * @returns {ModelSteps}
 */
export function theModelsSteps({ said, folder }) {
  if (said === null) return { says: "Nothing kept the check tool's output, so no tool call of its model was read." }
  let line
  try {
    line = inspectionUsageIn(said)
  } catch (error) {
    return { says: `The check tool's model output line could not be read, so no tool call was read: ${error instanceof Error ? error.message : String(error)}` }
  }
  if (line === null) return { says: 'The check tool printed no model output line, so its model did not run, or the check ended before the tool printed the line.' }
  if (line.runtime !== 'opencode') return { says: `This check's model ran in ${line.runtime}. Only OpenCode's output is read for tool calls, so none was read.` }
  const read = theCallsInOpenCodesOutput(line.output)
  if (!('steps' in read)) return read
  const { steps } = read
  const count = steps.length
  const totalMs = steps.reduce((sum, one) => sum + one.ms, 0)
  const whileAnyRanMs = theTimeWhileAnyRan(steps)
  const longest = [...steps].sort((a, b) => b.ms - a.ms).slice(0, THE_LONGEST_STEPS_NAMED)
  const summary = theCallsInWords(count, totalMs, whileAnyRanMs, longest.length)
  const file = join(folder, THE_MODELS_STEPS_FILE)
  try {
    writeFileSync(file, `${JSON.stringify({ count, totalMs, whileAnyRanMs, steps }, null, 2)}\n`)
  } catch (error) {
    const why = /** @type {NodeJS.ErrnoException} */ (error).code ?? (error instanceof Error ? error.message : String(error))
    return { says: `${summary} The file ${file} could not be written (${why}), so only this summary is kept.`, count, totalMs, whileAnyRanMs, longest }
  }
  const theFile = count === 0 ? 'The file holds an empty list.' : count === 1 ? 'The file holds it as well.' : `The file holds all ${String(count)}, in the order OpenCode printed them.`
  return { says: `${summary} ${theFile}`, count, totalMs, whileAnyRanMs, longest, file }
}

/**
 * THE YESES OPTIONS AN OLDER OFFICE MAY STILL GIVE THE CHECK TOOL, in the order its line names them. This revision reads
 * no yeses, so tools/the-inspector.mjs takes each of them and ignores what it holds.
 */
export const THE_YESES_OPTIONS = /** @type {const} */ (['--yeses', '--yeses-of', '--no-yeses'])

/** The words every form of that line ends with. */
export const BECAUSE_THIS_REVISION_READS_NO_YESES = 'because this revision reads no yeses'

/**
 * THE ONE LINE THE CHECK TOOL WRITES WHEN IT WAS GIVEN ANY OF THEM: which ones, and that it ignores them. Tests read it here.
 * @param {readonly string[]} given at least one, in the order of THE_YESES_OPTIONS
 */
export function theYesesOptionsAreIgnored(given) {
  const named = given.length === 1 ? given[0] : `${given.slice(0, -1).join(', ')} and ${String(given.at(-1))}`
  return `This check was given ${String(named)}. It ignores ${given.length === 1 ? 'that option' : 'those options'}, ${BECAUSE_THIS_REVISION_READS_NO_YESES}.`
}
