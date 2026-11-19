#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE OPENROUTER TOOL: the one way an agent uses OpenRouter's models. Under a decision, a resource is used only through
 * its tools; each tool checks the limit before a use and records the use and its cost after.
 * Its first command reviews a video.
 * The robotics department reviews its run videos with Gemini, which takes video, and the one key there
 * is is OpenRouter's (the brief for wave 13s round 41), as the owner told a secretary.
 *
 * node tools/openrouter.mjs video-review --file <clip.mp4> --prompt <text, or @file> [--model <id>] [--processing static|agentic] [--json]
 *
 * BEFORE THE CALL, and nothing goes to the model until every one has passed:
 *   - the model is not on Codex's read-only `~/.codex/models_cache.json` list or OpenCode Go's `opencode models
 *     opencode-go` list, both read first, before the file, the key or the model list;
 *     if neither readable list catches it, the family table answers; its refusal names unreadable lists and why, and if
 *     no family catches it the call goes on with one note on stderr about any unreadable lists;
 *   - the file is a regular file named .mp4, of at most 20 MiB, that begins with an MP4 `ftyp` box and gives its length
 *     in its `mvhd` box;
 *   - the key: the office's own OpenRouter key, through the one reader every office tool uses (`theKey`);
 *   - the model takes video, by OpenRouter's public model list (asked with no key), kept for a day in the tool's folder;
 *   - --processing is given only with a Google model, because OpenRouter documents it for Gemini alone;
 *   - the limits, each against this call's estimate (`theEstimate`): the monthly cap on this machine
 *     (MOLE_OFFICE_OPENROUTER_MONTHLY_CAP_USD; its default 0 is no cap of our own, and the tool says so on each call),
 *     and the key's own limit at OpenRouter (GET /api/v1/key), whose remaining figure the tool says, never the key.
 *
 * THE CALL is one POST /api/v1/chat/completions: the prompt, and the video inline as a base64 data URL in a video_url
 * part, with usage asked for and the answer held to ANSWER_TOKEN_CAP tokens. OPENROUTER HAS NO FRAME-RATE OR
 * RESOLUTION SETTING for video: its video page and the model list's supported_parameters name none (read on 13 October
 * 2026). Its one video setting is `processing`, which --processing sets; left out, OpenRouter sends nothing and Gemini's
 * default applies. So the tool says how densely the video was seen instead: prompt tokens per second of video.
 *
 * AFTER THE CALL, one line in ~/.cache/mole-office/openrouter/receipts.jsonl (folder 0700, file 0600, opened without
 * following a link): when, which agent, the command, the model, the file's name and size, the video's length, the
 * processing, the tokens, the cost OpenRouter's answer gives (never one worked out here), the seconds and the outcome.
 * No prompt and no answer. A call that got no answer is written down too, because OpenRouter may still charge for it.
 * The same call is also one line on the calling run, through POST /api/toolset/uses (decision Vt0GdSlApWce,
 * point d; vbDf83UQeVOh), when the environment names the run's office; the tool says whether it was written,
 * and its exit code is the same either way. A refusal is no use of OpenRouter, so it writes neither.
 *
 * THE KEY is the office's own OpenRouter key (RFQuMw4h09jZ), by a decision. The office's key
 * file beside the database MOLE_OFFICE_DB names, set on the Settings page, and OPENROUTER_API_KEY only when that file
 * holds none. From a worktree whose MOLE_OFFICE_DB names no office database the file is not there, and the tool refuses,
 * naming where it looked. It never reads the sandboxes' secrets file, which holds OpenCode's runtime key, a different
 * key. The key is sent only to OpenRouter in the Authorization header of the two calls that need it, and never printed,
 * logged or written. A body OpenRouter sends back with an error has the key masked, and is then cut, before anything
 * shows it.
 *
 * stdout is the model's answer, or with --json one JSON object. Every note is on stderr.
 * Exit 0: answered. Exit 2: refused, and nothing was sent to the model. Exit 75: no answer from OpenRouter.
 */
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { closeSync, constants, existsSync, fchmodSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, statSync, writeSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { providerKeyFromTheFileThenTheEnvironment } from '../src/config/provider-keys.mjs'
import { ENV_FILE, keysPathFrom, loadEnvFileIntoProcess, settingValue } from '../src/config/settings.mjs'
import { carriesTheTestMark } from '../src/config/the-test-mark.mjs'
import { localStamp, parseStoredStamp } from '../src/shared/time.ts'
import { TOOL_USE_MOST_CHARACTERS } from '../src/shared/toolset.ts'
import { aToolRouteToTheProvider } from './provider-router-tool-calls.mjs'
import { theOfficeInThisEnvironment, writeAUseLine } from './use-line.mjs'

/** The tool's slug in the toolset (tools/file-the-basic-toolset.mjs), which its use line names. */
export const THE_SLUG = 'openrouter'
/** OpenRouter. The key goes nowhere else: a test reaches a stand-in only by calling `main` with its own `api`. */
export const THE_API = 'https://openrouter.ai/api/v1'
/** The model when --model is not given: the one a clip was measured on, 455 prompt tokens for 5 seconds. */
export const DEFAULT_MODEL = 'google/gemini-3.8-flash'
/** The most a video may be, in bytes: 20 MiB, sent inline in one request. */
export const MOST_VIDEO_BYTES = 20 * 1024 * 1024
/** OpenRouter's one documented video setting, for Gemini only. */
export const PROCESSING = Object.freeze(['static', 'agentic'])
/**
 * PROMPT TOKENS A SECOND OF VIDEO, FOR THE ESTIMATE: Gemini's documented rate at its default resolution, one frame a
 * second at 258 tokens and 32 a second for the sound, rounded up. The first 29 clips through OpenRouter came to less
 * (2.4k to 4.2k prompt tokens for 15 to 60 seconds, 13 October 2026). Another provider's rate may differ.
 */
export const VIDEO_TOKENS_PER_SECOND = 300
/** The most tokens an answer may use, its thinking included. The call sends it as max_tokens, so the estimate holds. */
export const ANSWER_TOKEN_CAP = 16384
/** How long the model list is kept before it is asked again. */
const MODEL_LIST_KEPT_MS = 24 * 60 * 60 * 1000
/** How long the tool waits for OpenRouter's answer to one request. */
const WAITS_MS = 300_000
/** How long the tool waits for OpenCode Go's subscription list. */
const OPENCODE_GO_LIST_TIMEOUT_MS = 10_000
/** The office's key file names OpenRouter by this word, and OPENROUTER_API_KEY is its environment line. */
const THE_PROVIDER = 'openrouter'
const KEY_NAME = 'OPENROUTER_API_KEY'
const CAP_SETTING = 'MOLE_OFFICE_OPENROUTER_MONTHLY_CAP_USD'
const USAGE = 'Use: node tools/openrouter.mjs video-review --file <clip.mp4> --prompt <text, or @file> [--model <id>] [--processing static|agentic] [--json].'

/** A refusal: nothing was sent to the model. Its message is a sentence a person reads. */
export class Refused extends Error {}

/**
 * THE MODELS OUR SUBSCRIPTIONS CARRY, which this tool refuses. By a decision, with a message of 13 October 2026,
 * OpenRouter is only for a model we need that none of our subscriptions carries, such as Gemini for video
 * review. Luna's row is also under another decision, with a message:
 * Codex first, and OpenCode Go only when Codex rate-limits Luna. Each
 * row is one family and what to use instead.
 *
 * A ROW MATCHES THE START OF OPENROUTER'S MODEL ID (provider/model), after a leading "~" is taken off, so a newer model
 * of the family is caught, and so is an alias such as ~moonshotai/kimi-latest, which OpenRouter says always goes to the
 * family's latest model. The first row that matches is the one, so Luna's row comes before the other GPT-6 models'.
 * Checked against OpenRouter's public model list on 13 October 2026 (461 models): the rows catch 106 ids and none of
 * the 44 google/ ones. The table does not catch openai/gpt-5.6-luna, gpt-5.6-sol or other GPT-5 models; the lists can.
 */
export const CARRIED_BY_A_SUBSCRIPTION = Object.freeze([
  Object.freeze({
    ids: /^openai\/gpt-(6[\w.]*-)?luna/iu,
    family: 'a GPT-6 Luna model',
    instead: "The Codex subscription carries GPT-6 Luna, so use it through codex first. Only when Codex rate-limits Luna, use OpenCode Go's opencode-go/gpt-6-luna through opencode.",
  }),
  Object.freeze({
    ids: /^openai\/gpt-(6|astra|sol)/iu,
    family: 'a GPT-6 model',
    instead: 'The Codex subscription carries GPT-6 Astra and GPT-6.1 Sol, so use them through codex.',
  }),
  Object.freeze({
    ids: /^moonshotai\/kimi/iu,
    family: 'a Kimi model',
    instead: 'The OpenCode Go subscription carries Kimi, so use it through opencode.',
  }),
  Object.freeze({
    ids: /^z-ai\/glm/iu,
    family: 'a GLM model',
    instead: 'The OpenCode Go subscription carries GLM, so use it through opencode.',
  }),
  Object.freeze({
    ids: /^xiaomi\/mimo/iu,
    family: 'a MiMo model',
    instead: 'The OpenCode Go subscription carries MiMo, so use it through opencode.',
  }),
  Object.freeze({
    ids: /^deepseek\//iu,
    family: 'a DeepSeek model',
    instead: 'The OpenCode Go subscription carries DeepSeek, so use it through opencode, or through dsh.',
  }),
  Object.freeze({
    ids: /^anthropic\/claude/iu,
    family: 'a Claude model',
    instead: 'The Claude subscription carries Claude, so use it through claude (Claude Code).',
  }),
])

/** The row of CARRIED_BY_A_SUBSCRIPTION that carries this OpenRouter model id, or undefined. @param {string} model */
export function theSubscriptionThatCarries(model) {
  const id = model.replace(/^~/u, '')
  return CARRIED_BY_A_SUBSCRIPTION.find((row) => row.ids.test(id))
}

/**
 * Match list ids by one rule. Take the OpenRouter name after its last slash, remove a `:variant`, lowercase it, and
 * read each dot as a dash; for example, `anthropic/claude-haiku-5.5` matches `claude-haiku-5-5`.
 * @param {string} id
 * @returns {string}
 */
function subscriptionListName(id) {
  return id.slice(id.lastIndexOf('/') + 1).replace(/:.*/u, '').toLowerCase().replace(/\./gu, '-')
}

/** Find the id on a list which has the same name as this OpenRouter model.
 * @param {string} model
 * @param {string[]} ids
 * @returns {string | undefined}
 */
function idOnSubscriptionList(model, ids) {
  const name = subscriptionListName(model)
  return ids.find((id) => subscriptionListName(id) === name)
}

/** The Codex cache is read-only. A missing file, bad JSON or missing models array is reported to the caller.
 * @returns {{ids: string[], file: string, failure?: string}}
 */
function readCodexList() {
  const file = join(homedir(), '.codex', 'models_cache.json')
  try {
    const source = readFileSync(file, 'utf8')
    /** @type {any} */
    let cache
    try {
      cache = JSON.parse(source)
    } catch (error) {
      return { ids: [], failure: `the JSON is bad (${error instanceof Error ? error.message.split(/\r?\n/u)[0] : String(error)})`, file }
    }
    if (!Array.isArray(cache?.models)) return { ids: [], failure: 'the JSON has no models list', file }
    const models = /** @type {unknown[]} */ (cache.models)
    const ids = models.flatMap((model) => {
      if (model === null || typeof model !== 'object' || !('slug' in model)) return []
      return typeof model.slug === 'string' ? [model.slug] : []
    })
    return { ids, file }
  } catch (error) {
    const code = /** @type {NodeJS.ErrnoException} */ (error).code
    const failure = code === 'ENOENT' ? 'the file is missing' : `the file could not be read (${error instanceof Error ? error.message : String(error)})`
    return { ids: [], failure, file }
  }
}

/** OpenCode Go's list comes from its command, never from a shell.
 * @param {NodeJS.ProcessEnv} env
 * @param {number} timeoutMs
 * @returns {{ids: string[], failure?: string}}
 */
function readOpenCodeGoList(env, timeoutMs) {
  const result = spawnSync('opencode', ['models', 'opencode-go'], { encoding: 'utf8', env, timeout: timeoutMs, maxBuffer: 1024 * 1024 })
  const stderr = typeof result.stderr === 'string' ? result.stderr.trim().split(/\r?\n/u)[0] ?? '' : ''
  if (result.error !== undefined) {
    const code = /** @type {NodeJS.ErrnoException} */ (result.error).code
    if (code === 'ENOENT') return { ids: [], failure: 'opencode is not on PATH' }
    if (code === 'ETIMEDOUT') return { ids: [], failure: `opencode timed out after ${String(timeoutMs)} milliseconds` }
    return { ids: [], failure: `opencode could not be run (${result.error.message})` }
  }
  if (result.status !== 0) {
    const detail = stderr === '' ? 'stderr was empty' : `first line of stderr: ${stderr}`
    return { ids: [], failure: `opencode exited with code ${String(result.status)}; ${detail}` }
  }
  const ids = result.stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
  const invalid = ids.find((id) => !id.startsWith('opencode-go/') || id.length === 'opencode-go/'.length)
  if (invalid !== undefined) return { ids: [], failure: `opencode printed an invalid model id (${invalid})` }
  return { ids }
}

/** Each failure names the list and the reason it could not be read.
 * @param {{failure?: string, file?: string}} codex
 * @param {{failure?: string}} opencode
 * @returns {string[]}
 */
function subscriptionListProblems(codex, opencode) {
  const problems = []
  if (codex.failure !== undefined) {
    problems.push(`Codex's list could not be read from ~/.codex/models_cache.json at ${codex.file}: ${codex.failure}`)
  }
  if (opencode.failure !== undefined) {
    problems.push(`OpenCode Go's list could not be read using \`opencode models opencode-go\`: ${opencode.failure}`)
  }
  return problems
}

/** Check both lists, then use the family table when neither readable list matches.
 * A failed list is named in a table refusal or in the stderr note when no family matches.
 * @param {string} model
 * @param {NodeJS.ProcessEnv} env
 * @param {number} timeoutMs
 * @param {(line: string) => void} say
 */
function refusedWhenASubscriptionCarries(model, env, timeoutMs, say) {
  const codex = readCodexList()
  const opencode = readOpenCodeGoList(env, timeoutMs)
  const problems = subscriptionListProblems(codex, opencode)
  const codexId = idOnSubscriptionList(model, codex.ids)
  const opencodeId = idOnSubscriptionList(model, opencode.ids)
  const row = theSubscriptionThatCarries(model)
  const closing = 'OpenRouter is only for a model we need that none of our subscriptions carries, such as Gemini for video review.'
  if (codexId !== undefined || opencodeId !== undefined) {
    const onCodex = codexId === undefined ? '' : `${model} is on Codex's list, read from ~/.codex/models_cache.json at ${codex.file}. Use it through codex.`
    const onOpenCode = opencodeId === undefined
      ? ''
      : row?.family === 'a GPT-6 Luna model'
        ? `${model} is on OpenCode Go's list from \`opencode models opencode-go\`. Use it through opencode as \`${opencodeId}\` only when Codex rate-limits Luna.`
        : `${model} is on OpenCode Go's list from \`opencode models opencode-go\`. Use it through opencode as \`${opencodeId}\`.`
    const family = row === undefined ? '' : ` It is ${row.family}. ${row.instead}`
    throw new Refused(`${[onCodex, onOpenCode].filter(Boolean).join(' ')}${family} ${closing}`)
  }
  if (row !== undefined) {
    const fallback = problems.length === 0 ? '' : ` The family table answered instead because ${problems.join('; ')}.`
    throw new Refused(`${model} is ${row.family}. ${row.instead}${fallback} ${closing}`)
  }
  if (problems.length > 0) say(`Subscription list note: ${problems.join('; ')}. The model may be one of those lists.`)
}
/** No answer from OpenRouter. `outcome` is the short reason the receipt keeps, without any body OpenRouter sent. */
export class NoAnswer extends Error {
  /** @param {string} message @param {string} outcome */
  constructor(message, outcome) {
    super(message)
    this.outcome = outcome
  }
}

/** The tool's folder: the receipts and the kept model list. */
export function theFolder(home = homedir()) {
  return join(home, '.cache/mole-office/openrouter')
}

/** The folder, made 0700 when missing, and refused unless it is this user's and nobody else's. */
function ourFolder(home = homedir()) {
  const folder = theFolder(home)
  mkdirSync(folder, { recursive: true, mode: 0o700 })
  const stat = lstatSync(folder)
  if (!stat.isDirectory() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0) {
    throw new Refused(`The folder ${folder} must be a folder owned by this user with mode 0700.`)
  }
  return folder
}

/**
 * Write one file in the tool's folder, 0600, without following a link: appended to, or replaced.
 * @param {string} path @param {string} text @param {boolean} append
 */
function writeOurFile(path, text, append) {
  const how = constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | (append ? constants.O_APPEND : constants.O_TRUNC)
  const fd = openSync(path, how, 0o600)
  try {
    const held = fstatSync(fd)
    if (!held.isFile() || held.uid !== process.getuid?.()) throw new Refused(`${path} must be a regular file owned by this user.`)
    fchmodSync(fd, 0o600)
    writeSync(fd, text)
  } finally {
    closeSync(fd)
  }
}

/**
 * The options of video-review. Refused, with the use line, when a command or an option is not one it takes.
 * @param {string[]} argv
 */
export function theArguments(argv) {
  const [command, ...rest] = argv
  if (command !== 'video-review') throw new Refused(`The command is video-review. ${USAGE}`)
  /** @type {{ file: string | null, prompt: string | null, model: string, processing: string | null, json: boolean }} */
  const options = { file: null, prompt: null, model: DEFAULT_MODEL, processing: null, json: false }
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (arg === '--json') {
      options.json = true
      continue
    }
    const name = /** @type {Record<string, 'file' | 'prompt' | 'model' | 'processing'>} */ ({ '--file': 'file', '--prompt': 'prompt', '--model': 'model', '--processing': 'processing' })[String(arg)]
    const value = rest[i + 1]
    if (name === undefined || value === undefined) throw new Refused(`${String(arg)} is not an option of video-review, or has no value. ${USAGE}`)
    options[name] = value
    i += 1
  }
  if (options.file === null || options.prompt === null) throw new Refused(`video-review needs --file and --prompt. ${USAGE}`)
  if (options.processing !== null && !PROCESSING.includes(options.processing)) throw new Refused('--processing is static or agentic.')
  if (options.processing !== null && !options.model.startsWith('google/')) {
    throw new Refused(`--processing is a Gemini setting at OpenRouter, and ${options.model} is not a Google model. Leave --processing out, or name a google/ model.`)
  }
  return options
}

/** The prompt: the words given, or the file after @. @param {string} given */
function thePrompt(given) {
  let text = given
  if (given.startsWith('@')) {
    try {
      text = readFileSync(given.slice(1), 'utf8')
    } catch {
      throw new Refused(`The prompt file ${given.slice(1)} could not be read.`)
    }
  }
  if (text.trim() === '') throw new Refused('The prompt is empty.')
  return text
}

/**
 * THE VIDEO'S LENGTH IN SECONDS, from the MP4's own header: the first box is `ftyp`, and the `moov` box holds `mvhd`,
 * whose timescale and duration give the length. Refused when either is missing: then it is not an MP4 this tool can
 * price, and the tool does not guess a length.
 * @param {Buffer} data @param {string} name
 */
export function theLength(data, name) {
  /** @param {number} from @param {number} to */
  const boxes = (from, to) => {
    const found = []
    let at = from
    while (at + 8 <= to) {
      let size = data.readUInt32BE(at)
      let header = 8
      if (size === 1) {
        if (at + 16 > to) break
        size = Number(data.readBigUInt64BE(at + 8))
        header = 16
      } else if (size === 0) size = to - at
      if (size < header || at + size > to) break
      found.push({ type: data.toString('latin1', at + 4, at + 8), start: at + header, end: at + size })
      at += size
    }
    return found
  }
  const top = boxes(0, data.length)
  if (top[0]?.type !== 'ftyp') throw new Refused(`${name} does not begin with an MP4 file-type box, so it is not an MP4 file.`)
  const moov = top.find((box) => box.type === 'moov')
  const mvhd = moov === undefined ? undefined : boxes(moov.start, moov.end).find((box) => box.type === 'mvhd')
  const wide = mvhd !== undefined && data[mvhd.start] === 1
  if (mvhd === undefined || mvhd.end - mvhd.start < (wide ? 32 : 20)) {
    throw new Refused(`${name} has no movie header (moov, then mvhd), so its length cannot be read and the call's cost cannot be estimated.`)
  }
  const timescale = data.readUInt32BE(mvhd.start + (wide ? 20 : 12))
  const duration = wide ? Number(data.readBigUInt64BE(mvhd.start + 24)) : data.readUInt32BE(mvhd.start + 16)
  if (timescale === 0 || duration === 0) throw new Refused(`${name}'s movie header gives no length, so the call's cost cannot be estimated.`)
  return duration / timescale
}

/** The video: its name without its folders, its bytes and its length. @param {string} file */
function theVideo(file) {
  const name = basename(file)
  if (!name.toLowerCase().endsWith('.mp4')) throw new Refused(`${name} is not named .mp4. video-review sends MP4 files only.`)
  let stat
  try {
    stat = statSync(file)
  } catch {
    throw new Refused(`There is no file ${file}.`)
  }
  if (!stat.isFile()) throw new Refused(`${file} is not a regular file.`)
  if (stat.size > MOST_VIDEO_BYTES) {
    throw new Refused(`${name} is ${String(stat.size)} bytes. The most video-review sends is 20 MiB (${String(MOST_VIDEO_BYTES)} bytes).`)
  }
  const data = readFileSync(file)
  return { name, data, size: stat.size, seconds: theLength(data, name) }
}

/**
 * THE KEY: the office's own OpenRouter key, read by src/config/provider-keys.mjs, the one reader every office tool uses,
 * so a key changed on the Settings page is the key every one of them sends. That reader takes the office's key file
 * beside the database MOLE_OFFICE_DB names first, and OPENROUTER_API_KEY in the environment or `.env` only when the file
 * holds none. `.env` is loaded first, as the picture tools load it, because it may name the database. Returns the key
 * and the words that say which store it came from. Nothing here says the value.
 * @param {string} envFile
 */
export function theKey(envFile = ENV_FILE) {
  const loaded = loadEnvFileIntoProcess(envFile)
  let keyFile
  try {
    keyFile = keysPathFrom(process.env)
  } catch {
    keyFile = 'whose path could not be worked out from MOLE_OFFICE_DB'
  }
  const read = providerKeyFromTheFileThenTheEnvironment(THE_PROVIDER, [KEY_NAME])
  if (read.value === null) {
    throw new Refused(
      `No OpenRouter key was found. The tool looked in the office's key file ${keyFile}, and then for ${KEY_NAME} in the environment and in ${loaded.path}${loaded.found ? '' : ', which does not exist'}.` +
        (read.why === null ? '' : ` It found: ${read.why}.`) +
        " Set the key on the Settings page of Mole Office. The key file is the one beside the database MOLE_OFFICE_DB names, so a run from a worktree sets MOLE_OFFICE_DB to the office's database. The sandboxes' secrets file holds another key, and this tool does not read it.",
    )
  }
  const from = read.from === KEY_NAME ? `${KEY_NAME}, because the office's key file ${keyFile} holds no OpenRouter key` : `the office's key file ${keyFile}`
  return { key: read.value, from }
}

/**
 * TEXT FROM OPENROUTER, SAFE TO SHOW: the key masked, anything shaped like an OpenRouter key or a bearer token masked,
 * on one line, and then cut. Masking comes first, so a cut can never leave part of the key standing.
 * @param {string} text @param {string | null} key
 */
export function shown(text, key) {
  let safe = key === null || key === '' ? text : text.split(key).join('[the key]')
  safe = safe.replace(/sk-or-[A-Za-z0-9_-]+/gu, '[a key]').replace(/Bearer\s+\S+/gu, 'Bearer [a key]')
  safe = safe.replace(/\s+/gu, ' ').trim()
  return safe.length > 300 ? `${safe.slice(0, 300)}…` : safe
}

/**
 * ONE REQUEST TO OPENROUTER, answered as JSON. No answer, an error status, or a body that is not JSON is NoAnswer, and
 * its words carry the body only through `shown`.
 * @param {string} url @param {RequestInit} init @param {number} waitMs @param {string | null} key
 * @param {any} [route]
 */
async function asked(url, init, waitMs, key, route = null) {
  const where = `OpenRouter (${new URL(url).pathname})`
  let text
  let status
  try {
    const res = route === null
      ? await fetch(url, { ...init, signal: AbortSignal.timeout(waitMs) })
      : await route.fetch(url, init, waitMs)
    status = res.status
    text = await res.text()
  } catch (error) {
    const late = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    if (late) throw new NoAnswer(`nothing came back from ${where} within ${String(waitMs / 1000)} s`, `no answer within ${String(waitMs / 1000)} s`)
    const code = error instanceof Error && error.cause instanceof Error ? /** @type {{ code?: string }} */ (error.cause).code : undefined
    throw new NoAnswer(`${where} could not be reached (${code ?? 'the network failed'})`, `could not reach OpenRouter (${code ?? 'the network failed'})`)
  }
  if (status < 200 || status > 299) throw new NoAnswer(`${where} answered ${String(status)}: ${shown(text, key)}`, `OpenRouter answered ${String(status)}`)
  try {
    return JSON.parse(text)
  } catch {
    throw new NoAnswer(`${where} answered ${String(status)} with something that is not JSON: ${shown(text, key)}`, 'OpenRouter answered with something that is not JSON')
  }
}

/** A price in dollars a token from the model list, or null when it gives none. @param {string | null} value */
function aPrice(value) {
  const price = typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  return Number.isFinite(price) && price >= 0 ? price : null
}

/**
 * OPENROUTER'S MODEL LIST, asked with no key and kept for a day. Each model as the tool needs it: whether it takes
 * video, and its prompt and completion prices as the list writes them.
 * @param {string} api @param {string} folder @param {number} now @param {number} waitMs @param {string | null} secret
 * @param {any} [route]
 * @returns {Promise<{ id: string, video: boolean, prompt: string | null, completion: string | null }[]>}
 */
async function theModelList(api, folder, now, waitMs, secret, route = null) {
  const kept = join(folder, 'models.json')
  try {
    const held = JSON.parse(readFileSync(kept, 'utf8'))
    const keptAt = typeof held.at === 'string' ? parseStoredStamp(held.at) : null
    if (held.from === api && keptAt !== null && now - keptAt < MODEL_LIST_KEPT_MS && Array.isArray(held.models)) return held.models
  } catch {
    // Nothing kept, or nothing usable: the list is asked for again below.
  }
  const answer = await asked(`${api}/models`, { method: 'GET' }, waitMs, secret, route)
  if (!Array.isArray(answer?.data)) throw new NoAnswer("OpenRouter's model list came back without its list of models", 'the model list came back without models')
  const models = answer.data
    .filter((/** @type {any} */ one) => typeof one?.id === 'string')
    .map((/** @type {any} */ one) => ({
      id: one.id,
      video: Array.isArray(one.architecture?.input_modalities) && one.architecture.input_modalities.includes('video'),
      prompt: typeof one.pricing?.prompt === 'string' ? one.pricing.prompt : null,
      completion: typeof one.pricing?.completion === 'string' ? one.pricing.completion : null,
    }))
  writeOurFile(kept, JSON.stringify({ from: api, at: localStamp(new Date(now)), models }), false)
  return models
}

/**
 * THIS CALL'S ESTIMATE, in US dollars, meant to be at or above what the call costs: the video at
 * VIDEO_TOKENS_PER_SECOND, the prompt at one token a byte, and an answer of ANSWER_TOKEN_CAP tokens, at the model
 * list's prices. It decides the two limit checks only. The receipt's cost is OpenRouter's.
 * @param {{ seconds: number, promptBytes: number, prices: { prompt: number, completion: number } }} call
 */
export function theEstimate({ seconds, promptBytes, prices }) {
  return (Math.ceil(seconds * VIDEO_TOKENS_PER_SECOND) + promptBytes) * prices.prompt + ANSWER_TOKEN_CAP * prices.completion
}

/**
 * What this calendar month's receipts hold: the costs they give, and how many give none.
 * @param {string} file @param {string} month YYYY-MM, in local time as the receipts' `at` is
 */
function thisMonthsSpend(file, month) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return { spent: 0, unknown: 0 }
  }
  let spent = 0
  let unknown = 0
  for (const line of text.split('\n').filter(Boolean)) {
    let row
    try {
      row = JSON.parse(line)
    } catch {
      throw new Refused(`A line of ${file} is not JSON, so this month's spend cannot be counted against the monthly cap.`)
    }
    if (typeof row?.at !== 'string' || row.at.slice(0, 7) !== month) continue
    if (typeof row.cost === 'number' && Number.isFinite(row.cost) && row.cost >= 0) spent += row.cost
    else unknown += 1
  }
  return { spent, unknown }
}

/** Dollars as words: up to six decimals, and at least two. @param {number} amount */
export function dollars(amount) {
  const text = String(Number(amount.toFixed(6)))
  const [whole, part = ''] = text.split('.')
  return `$${String(whole)}.${part.padEnd(2, '0')}`
}

/**
 * THE ANSWER FOR --json: the text read as JSON when it is JSON, or when it is one JSON block inside a code fence, which
 * is how Gemini often writes JSON; otherwise the text. `answerIs` says which of the three it was.
 * @param {string} text
 */
export function readAsJSON(text) {
  try {
    return { answer: JSON.parse(text), answerIs: 'json' }
  } catch {
    // Not JSON as it stands: perhaps inside a fence.
  }
  const fenced = /^\s*```(?:json)?[ \t]*\n([\s\S]*?)\n\s*```\s*$/u.exec(text)
  if (fenced !== null) {
    try {
      return { answer: JSON.parse(String(fenced[1])), answerIs: 'json inside a code fence' }
    } catch {
      // A fence that does not hold JSON: the text it is.
    }
  }
  return { answer: text, answerIs: 'text' }
}

/**
 * THE USE LINE ON THE CALLING RUN: what the receipt holds, in one line of at most TOOL_USE_MOST_CHARACTERS characters,
 * the file's name cut first when the line would be longer. No prompt, no answer and no key.
 * @param {{ id: string, model: string, file: string, videoSeconds: number, processing: string | null, promptTokens: number | null, completionTokens: number | null, cost: number | null, outcome: string }} receipt
 */
export function theUseLine(receipt) {
  const tokens = receipt.promptTokens === null ? 'no tokens given' : `${String(receipt.promptTokens)} prompt and ${String(receipt.completionTokens)} completion tokens`
  const cost = receipt.cost === null ? 'no cost given' : dollars(receipt.cost)
  const line = (/** @type {string} */ name) =>
    `video-review of ${name} (${String(receipt.videoSeconds)} s of video) on ${receipt.model}, processing ${receipt.processing ?? 'not set'}: ${receipt.outcome}; ${tokens}; ${cost}; receipt ${receipt.id}`
  const whole = line(receipt.file)
  if (whole.length <= TOOL_USE_MOST_CHARACTERS) return whole
  const room = receipt.file.length - (whole.length - TOOL_USE_MOST_CHARACTERS) - 1
  return line(`${receipt.file.slice(0, Math.max(room, 1))}…`).slice(0, TOOL_USE_MOST_CHARACTERS)
}

/**
 * THE COMMAND. `api`, `waitMs`, `env`, `envFile` and `now` are for the tests, which point the tool at a stand-in; the
 * command line always asks OpenRouter itself.
 * @param {string[]} argv
 * @param {{ api?: string, waitMs?: number, opencodeTimeoutMs?: number, env?: Record<string, string | undefined>, envFile?: string, now?: () => number }} [over]
 * @returns {Promise<number>}
 */
export async function main(argv = process.argv.slice(2), over = {}) {
  const { api = THE_API, waitMs = WAITS_MS, opencodeTimeoutMs = OPENCODE_GO_LIST_TIMEOUT_MS, env = process.env, envFile = ENV_FILE, now = Date.now } = over
  const say = (/** @type {string} */ line) => process.stderr.write(`${line}\n`)
  try {
    if (api === THE_API && carriesTheTestMark(env)) {
      throw new Refused('A process the test suite started may not call OpenRouter itself. A test calls main() with a stand-in api.')
    }
    const options = theArguments(argv)
    // BOTH LISTS ARE READ HERE, before any OpenRouter request. A list match refuses; an unreadable list falls back to
    // the family table, which names that fallback in its words.
    // THIS REFUSAL IS FOR THIS TOOL ONLY (XsbDESw4Xiz_): tools/openrouter.mjs never ships, and it spends the
    // account's own balance. Do not copy it into src/. If the product ever checks the same thing, a rule
    // applies there instead: the office reminds and never refuses, because it does not manage a user's
    // behaviour.
    refusedWhenASubscriptionCarries(options.model, env, opencodeTimeoutMs, say)
    const video = theVideo(/** @type {string} */ (options.file))
    const prompt = thePrompt(/** @type {string} */ (options.prompt))
    // THE CALL GOES THROUGH THE OFFICE'S ROUTE WHEN THIS RUN HAS A TOOL TOKEN TO MINT. An older office answers 404 and
    // the call uses the key file as before; an office that refuses the mint is a refusal and not a fallback.
    loadEnvFileIntoProcess(envFile)
    const atTheRouter = await aToolRouteToTheProvider({
      provider: 'openrouter', model: options.model, endpoints: ['/models', '/key', '/chat/completions'], env,
    })
    if (atTheRouter.refused === true) throw new Refused(`${atTheRouter.why} Nothing was sent to the model.`)
    const route = atTheRouter.route
    const keyRead = route === null ? theKey(envFile) : null
    const key = keyRead === null ? null : keyRead.key
    const from = keyRead === null ? null : keyRead.from
    // WHAT IS MASKED IN A PROVIDER'S ERROR BODY: the key when the key file carried the call, the tool token when the
    // router did.
    const secret = route === null ? key : route.token
    const folder = ourFolder()
    const receipts = join(folder, 'receipts.jsonl')

    const models = await theModelList(api, folder, now(), waitMs, secret, route)
    const model = models.find((one) => one.id === options.model)
    if (model === undefined) throw new Refused(`${options.model} is not in OpenRouter's model list.`)
    if (!model.video) throw new Refused(`${options.model} does not take video, by OpenRouter's model list. Name a model whose input includes video.`)
    const prices = { prompt: aPrice(model.prompt), completion: aPrice(model.completion) }
    if (prices.prompt === null || prices.completion === null) {
      throw new Refused(`OpenRouter's model list gives no price for ${options.model}, so this call's cost cannot be estimated.`)
    }
    const estimate = theEstimate({ seconds: video.seconds, promptBytes: Buffer.byteLength(prompt), prices: { prompt: prices.prompt, completion: prices.completion } })

    // THE MONTHLY CAP ON THIS MACHINE. 0 is no cap of our own, and the tool says so.
    const capText = String(settingValue(CAP_SETTING, env, envFile) ?? '')
    if (!/^[0-9]+(\.[0-9]+)?$/u.test(capText)) throw new Refused(`${CAP_SETTING} is not a number of US dollars. Set it to a number such as 10 or 2.5, or to 0 for no cap of our own.`)
    const cap = Number(capText)
    let capSays
    if (cap === 0) capSays = `Monthly cap: none of our own (${CAP_SETTING} is 0), so only the key's limit at OpenRouter applies.`
    else {
      const { spent, unknown } = thisMonthsSpend(receipts, localStamp(new Date(now())).slice(0, 7))
      const unpriced = unknown === 0 ? '' : ` ${String(unknown)} of this month's receipts give no cost, so the month's spend may be higher.`
      if (spent + estimate > cap) {
        throw new Refused(`This month's receipts hold ${dollars(spent)}, and this call may cost up to ${dollars(estimate)}: together over the monthly cap of ${dollars(cap)} (${CAP_SETTING}).${unpriced}`)
      }
      capSays = `Monthly cap: ${dollars(cap)} (${CAP_SETTING}); this month's receipts hold ${dollars(spent)}.${unpriced}`
    }

    // THE KEY'S OWN LIMIT AT OPENROUTER.
    const held = await asked(`${api}/key`, { method: 'GET', headers: key === null ? {} : { Authorization: `Bearer ${key}` } }, waitMs, secret, route)
    const data = held?.data
    if (data === null || typeof data !== 'object') throw new NoAnswer("OpenRouter's answer about the key holds no data, so its limit cannot be read", 'the key answer held no data')
    /** @type {number | null | undefined} */
    let left
    if ('limit_remaining' in data) left = typeof data.limit_remaining === 'number' ? data.limit_remaining : data.limit_remaining === null ? null : undefined
    else if (data.limit === null || data.limit === undefined) left = null
    else if (typeof data.limit === 'number' && typeof data.usage === 'number') left = data.limit - data.usage
    if (left === undefined) throw new NoAnswer("OpenRouter's answer about the key gives no limit the tool can read", 'the key answer gave no readable limit')
    if (left !== null && left < estimate) {
      throw new Refused(`OpenRouter says this key has ${dollars(left)} of its limit left, and this call may cost up to ${dollars(estimate)}.`)
    }
    const keySays = left === null ? "The key has no limit of its own at OpenRouter; the account's credit still applies, and this tool does not read it." : `The key's limit at OpenRouter: ${dollars(left)} left.`

    say(`OpenRouter video review: asking ${options.model} about ${video.name} (${String(video.size)} bytes, ${video.seconds.toFixed(1)} s of video).`)
    say(`Estimate: at most ${dollars(estimate)}, counting ${String(VIDEO_TOKENS_PER_SECOND)} prompt tokens a second of video and an answer of at most ${String(ANSWER_TOKEN_CAP)} tokens.`)
    if (route === null) {
      say(`Key: the office's own OpenRouter key, from ${from}.`)
      if (atTheRouter.olderOffice === true) say(`The office has no tool-token door, so this run uses the office key file as before.`)
    } else {
      say(`Route: the provider router at ${route.office}, with a tool token minted for this run and checked on every call.`)
    }
    say(capSays)
    say(keySays)
    if (options.processing !== null) say(`Processing: ${options.processing}.`)
    else if (options.model.startsWith('google/')) say("Processing: not given, so OpenRouter sends none and Gemini's own default applies.")

    // THE CALL.
    const videoPart = { url: `data:video/mp4;base64,${video.data.toString('base64')}`, ...(options.processing === null ? {} : { processing: options.processing }) }
    const body = {
      model: options.model,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'video_url', video_url: videoPart }] }],
      max_tokens: ANSWER_TOKEN_CAP,
      usage: { include: true },
    }
    const startedAt = now()
    /** @type {any} */
    let answer = null
    /** @type {NoAnswer | null} */
    let failure = null
    try {
      answer = await asked(`${api}/chat/completions`, { method: 'POST', headers: { ...(key === null ? {} : { Authorization: `Bearer ${key}` }), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, waitMs, secret, route)
    } catch (error) {
      if (!(error instanceof NoAnswer)) throw error
      failure = error
    }
    const seconds = Math.round((now() - startedAt) / 100) / 10
    const usage = answer !== null && typeof answer.usage === 'object' && answer.usage !== null ? answer.usage : null
    const count = (/** @type {unknown} */ value) => (typeof value === 'number' && Number.isFinite(value) ? value : null)
    const promptTokens = count(usage?.prompt_tokens)
    const completionTokens = count(usage?.completion_tokens)
    const cost = count(usage?.cost)
    const choice = answer?.choices?.[0]
    const text = typeof choice?.message?.content === 'string' && choice.message.content !== '' ? choice.message.content : null
    const cut = choice?.finish_reason === 'length'
    if (failure === null && text === null) {
      failure = new NoAnswer(`OpenRouter answered with no text${cut ? `: the answer reached the cap of ${String(ANSWER_TOKEN_CAP)} tokens first` : ''}`, cut ? 'no text: the answer reached its token cap' : 'no text in the answer')
    }

    // THE RECEIPT, for every call that was made.
    const receipt = {
      id: randomBytes(9).toString('base64url'),
      at: localStamp(new Date()),
      agent: settingValue('MOLE_OFFICE_AGENT', env, envFile) ?? null,
      command: 'video-review',
      model: options.model,
      file: video.name,
      bytes: video.size,
      videoSeconds: Math.round(video.seconds * 10) / 10,
      processing: options.processing,
      promptTokens,
      completionTokens,
      cost,
      usage: answer === null ? 'none: there was no answer' : usage === null ? 'none: the answer carried no usage' : 'carried',
      seconds,
      outcome: failure !== null ? `no answer: ${failure.outcome}` : cut ? 'answered, cut at the token cap' : 'answered',
    }
    writeOurFile(receipts, `${JSON.stringify(receipt)}\n`, true)
    const used = await writeAUseLine({ tool: THE_SLUG, said: theUseLine(receipt), office: theOfficeInThisEnvironment() })
    if (failure !== null) {
      say(`Receipt ${receipt.id}, in ${receipts}. ${used.words}`)
      throw failure
    }

    const perSecond = promptTokens === null ? null : Math.round(promptTokens / video.seconds)
    say(
      usage === null
        ? `Answered in ${String(seconds)} s. OpenRouter's answer carried no usage, so the receipt has no tokens and no cost.`
        : `Answered in ${String(seconds)} s: ${String(promptTokens)} prompt and ${String(completionTokens)} completion tokens, costing ${cost === null ? 'an amount the answer did not give' : dollars(cost)} by OpenRouter's answer.`,
    )
    if (perSecond !== null) {
      say(`${String(perSecond)} prompt tokens per second of video (${String(promptTokens)} over ${video.seconds.toFixed(1)} s). The prompt's own words are counted in them.`)
    }
    if (cut) say(`The answer reached the cap of ${String(ANSWER_TOKEN_CAP)} tokens and was cut off.`)
    say(`Receipt ${receipt.id}, in ${receipts}. ${used.words}`)
    const said = /** @type {string} */ (text)
    if (options.json) {
      const read = readAsJSON(said)
      const out = {
        ...read,
        model: options.model,
        processing: options.processing,
        tokens: { prompt: promptTokens, completion: completionTokens },
        cost,
        videoSeconds: receipt.videoSeconds,
        promptTokensPerVideoSecond: perSecond,
        cut,
        seconds,
        receipt: receipt.id,
      }
      process.stdout.write(`${JSON.stringify(out)}\n`)
    } else process.stdout.write(said.endsWith('\n') ? said : `${said}\n`)
    return 0
  } catch (error) {
    if (error instanceof Refused) {
      say(`OpenRouter video review refused: ${error.message} Nothing was sent to the model.`)
      return 2
    }
    if (error instanceof NoAnswer) {
      say(`OpenRouter video review got no answer: ${error.message}.`)
      return 75
    }
    throw error
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      console.error(`The OpenRouter tool could not finish: ${shown(String(error instanceof Error ? error.message : error), null)}`)
      process.exitCode = 1
    })
}
