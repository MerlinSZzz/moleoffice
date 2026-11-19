// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHAT A CLAUDE CODE RUN WAS SERVED, READ FROM ITS JSON RESULT OR ITS OWN TRANSCRIPTS. Problem VBtbw0hSO1E2.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------------
 *
 * A run's record holds `model`, the word its starter asked for. On 24 September 2026 every Claude Code
 * run in the sandboxes was registered for anthropic/claude-opus-5-5, and their transcripts show that
 * claude-opus-5 answered. Nothing in the office said so. `served` (the `Served` shape in
 * src/shared/kinds.ts) is the office's one field for the model that actually answered. dsh's stop hook
 * writes it for a dsh run, and tools/sandbox-start.mjs writes it for a Claude Code run, when the run's
 * command ends, from what this module reads.
 *
 * ---------------------------------------------------------------------------------------------
 * WHERE THE MODEL IS READ FROM, IN ORDER
 * ---------------------------------------------------------------------------------------------
 *
 *   1. THE RUN'S OUT FILE, when it holds a `claude -p --output-format json` result (its last line of JSON of type result). The models
 *      are the keys of its `modelUsage`, or its `model` when `modelUsage` names none.
 *   2. OTHERWISE, THE RUN'S OWN TRANSCRIPTS. Claude Code writes one `<conversation id>.jsonl` per
 *      conversation in `<its folder>/projects/<the working directory, every character that is not a
 *      letter or a digit made "-">/`. Its folder is CLAUDE_CONFIG_DIR, or `~/.claude`, as
 *      theCredentialsFile in ./claude-code-login.mjs works out. Subagents' transcripts sit in folders
 *      below that one and are not the run's own, so only the top level is read. Nothing records which
 *      conversation was the run's, so every top-level transcript changed at or after the run started
 *      is read, and only its lines stamped at or after that moment count. Every assistant line's
 *      `message.model` counts, except "<synthetic>", which Claude Code writes for its own notices
 *      (a usage limit, for one) and which no model answered.
 *
 * The encoding of the folder name was read from Claude Code 2.1.281 itself on 24 September 2026:
 * `e.replace(/[^a-zA-Z0-9]/g,"-")`, with a hash added after the first 200 characters of a longer
 * name. That hash is not worked out here. A working directory whose name is longer than 200 characters
 * reads as "no transcript found", and the sentence says which folder was looked in.
 *
 * ---------------------------------------------------------------------------------------------
 * THE OTHER THREE FIELDS
 * ---------------------------------------------------------------------------------------------
 *
 * `temperature`: Claude Code writes none anywhere, so it is always "not reported".
 * `briefBytes`: the size of the brief file the launcher was given, or "not reported" without one.
 * `contextTokens`: `ServedContextTokens` counts the provider's own usage rows in the conversation
 * transcript and nothing else, so it is read from the transcripts even when the model came from a JSON
 * result. Claude Code writes one line per content block of a response, and every one of those lines
 * repeats the same `usage`. So each response's usage counts once, by its `message.id`. A turn's input
 * is `input_tokens` + `cache_creation_input_tokens` + `cache_read_input_tokens`, because the provider
 * reports the cached part of the input apart from the rest, and all three were the model's context.
 *
 * `theLastLinesOf` in ./stopped-run-cause.mjs is not used. It reads only the last 256 KiB of a file,
 * and a model that answered only earlier in the run would be missed.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { theCredentialsFile } from './claude-code-login.mjs'
import { object, theEnvelopeLineIn } from './usage.mjs'

/** The words a field holds when the run gave nothing for it (the `Served` shape). */
export const NOT_REPORTED = 'not reported'

/** The model name Claude Code writes on its own notices, which no model answered. */
const SYNTHETIC = '<synthetic>'

/**
 * THE FOLDER CLAUDE CODE KEEPS A WORKING DIRECTORY'S TRANSCRIPTS IN, for a command with this environment,
 * or null when the environment names no folder for Claude Code at all.
 * @param {Record<string, string | undefined>} env
 * @param {string} cwd
 * @returns {string | null}
 */
export function theTranscriptFolder(env, cwd) {
  const credentials = theCredentialsFile(env)
  return credentials === null ? null : join(dirname(credentials), 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'))
}

/**
 * THE MODELS A `--output-format json` RESULT NAMES, or null when the text holds no such result. The result is found by
 * theEnvelopeLineIn (./usage.mjs), the same rule the run's usage receipt is read by.
 * @param {string} text
 * @returns {string[] | null}
 */
export function theModelsInAResult(text) {
  const line = theEnvelopeLineIn(text)
  if (line === null) return null
  const result = JSON.parse(line)
  if (result === null || typeof result !== 'object' || Array.isArray(result) || result['type'] !== 'result') return null
  const used = Object.keys(object(result['modelUsage'])).filter((name) => name !== '' && name !== SYNTHETIC)
  if (used.length > 0) return used
  return typeof result['model'] === 'string' && result['model'] !== '' && result['model'] !== SYNTHETIC ? [result['model']] : []
}

/**
 * WHAT THE TRANSCRIPTS' LINES STAMPED AT OR AFTER `sinceMs` SAY: the models in the order they first
 * answered, and each response's input counted once.
 * @param {string[]} texts
 * @param {number} sinceMs
 * @returns {{ models: string[], inputs: number[] }}
 */
export function theTranscriptsSay(texts, sinceMs) {
  /** @type {Set<string>} */
  const models = new Set()
  /** @type {Map<string, number>} */
  const inputs = new Map()
  let unnamed = 0
  for (const text of texts) {
    for (const line of String(text).split('\n')) {
      if (line.trim() === '') continue
      let event
      try {
        event = JSON.parse(line)
      } catch {
        continue
      }
      if (event === null || typeof event !== 'object' || event['type'] !== 'assistant') continue
      const at = typeof event['timestamp'] === 'string' ? Date.parse(event['timestamp']) : NaN
      if (!Number.isFinite(at) || at < sinceMs) continue
      const message = object(event['message'])
      const model = message['model']
      if (typeof model !== 'string' || model === '' || model === SYNTHETIC) continue
      models.add(model)
      const usage = object(message['usage'])
      const parts = ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens']
        .map((key) => usage[key])
        .filter(/** @returns {one is number} */ (one) => typeof one === 'number' && Number.isFinite(one))
      if (parts.length === 0) continue
      const input = parts.reduce((sum, one) => sum + one, 0)
      const id = typeof message['id'] === 'string' && message['id'] !== '' ? message['id'] : `unnamed-${String((unnamed += 1))}`
      inputs.set(id, input)
    }
  }
  return { models: [...models], inputs: [...inputs.values()] }
}

/**
 * WHAT ONE CLAUDE CODE RUN WAS SERVED, as the `Served` shape, with a sentence saying what was read and
 * where, for the launcher's finish log.
 * @param {{ outPath: string | null, env: Record<string, string | undefined>, cwd: string, startedAt: string, briefPath: string | null }} run
 * @returns {{ served: { model: string, temperature: string, briefBytes: number | string, contextTokens: { largestTurn: number | string, total: number | string } }, said: string }}
 */
export function theServedOfAClaudeCodeRun(run) {
  const sinceMs = Date.parse(run.startedAt)
  const says = []

  let fromTheResult = null
  if (run.outPath === null) {
    says.push('the run had no out file')
  } else {
    let text = null
    try {
      text = readFileSync(run.outPath, 'utf8')
    } catch (why) {
      says.push(`its out file ${run.outPath} could not be read (${why instanceof Error ? why.message : String(why)})`)
    }
    if (text !== null) {
      fromTheResult = theModelsInAResult(text)
      says.push(fromTheResult === null ? `its out file ${run.outPath} holds no --output-format json result` : `its out file ${run.outPath} holds a --output-format json result`)
    }
  }

  const folder = theTranscriptFolder(run.env, run.cwd)
  /** @type {string[]} */
  const read = []
  /** @type {string[]} */
  const texts = []
  if (folder === null) {
    says.push('the command had neither CLAUDE_CONFIG_DIR nor HOME, so there was no transcript folder to look in')
  } else if (!Number.isFinite(sinceMs)) {
    says.push(`the run's start "${run.startedAt}" is not a moment, so no transcript in ${folder} could be told to be the run's`)
  } else if (!existsSync(folder)) {
    says.push(`there is no transcript folder ${folder}`)
  } else {
    for (const name of readdirSync(folder).sort()) {
      if (!name.endsWith('.jsonl')) continue
      const path = join(folder, name)
      try {
        if (!statSync(path).isFile() || statSync(path).mtimeMs < sinceMs) continue
        texts.push(readFileSync(path, 'utf8'))
        read.push(name)
      } catch {
        says.push(`${path} could not be read`)
      }
    }
    says.push(read.length === 0 ? `no transcript in ${folder} was written at or after ${run.startedAt}` : `it read ${read.join(', ')} in ${folder}, from ${run.startedAt} on`)
  }
  const transcripts = theTranscriptsSay(texts, Number.isFinite(sinceMs) ? sinceMs : Infinity)

  const models = fromTheResult ?? transcripts.models
  const from = fromTheResult !== null ? 'the json result' : 'the transcripts'
  says.push(models.length === 0 ? `${from} named no model that answered` : `${from} named ${models.join(', ')}`)

  /** @type {number | string} */
  let briefBytes = NOT_REPORTED
  if (run.briefPath !== null) {
    try {
      briefBytes = statSync(run.briefPath).size
    } catch {
      says.push(`the brief ${run.briefPath} could not be read`)
    }
  }

  const { inputs } = transcripts
  return {
    served: {
      model: models.length === 0 ? NOT_REPORTED : models.join(', '),
      temperature: NOT_REPORTED,
      briefBytes,
      contextTokens: {
        largestTurn: inputs.length === 0 ? NOT_REPORTED : Math.max(...inputs),
        total: inputs.length === 0 ? NOT_REPORTED : inputs.reduce((sum, one) => sum + one, 0),
      },
    },
    said: `${says.join('; ')}.`,
  }
}
