// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHAT A RUN WAS SERVED, READ FROM EACH RUNTIME'S OWN RECORD OF THE RUN. HB1 of design/honour-board/ACCEPTANCE.md,
 * and a decision covers it, in wave 13s round 36.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------------
 *
 * Wave 13u found `served.model` on none of 136 exemplary runs. Only dsh's stop hook and tools/sandbox-start.mjs, for
 * Claude Code, wrote `served`; the message worker's runtimes wrote none. Every runner now writes it at the run's end,
 * from what the runtime itself wrote of the run and never from what an agent says it was, which is the
 * condition of a decision.
 * This file is where the Codex, OpenCode and Kimi readings are worked out; the Claude Code reading stays in
 * ./claude-code-served.mjs, and each runner calls one of the two.
 *
 * ---------------------------------------------------------------------------------------------
 * WHERE EACH RUNTIME'S MODEL IS READ FROM
 * ---------------------------------------------------------------------------------------------
 *
 *   CODEX: its rollout, `<CODEX_HOME or ~/.codex>/sessions/…/rollout-…-<thread>.jsonl`, found by theCodexRolloutFor
 *     (./codex-log.mjs). Every `turn_context` line stamped at or after the run's start names the model the turn ran
 *     with. `codex exec --json` prints no model. Read from rollouts Codex 0.159.2 wrote in this sandbox.
 *   OPENCODE: `opencode export <session>`, which prints `{info, messages: [{info, parts}]}` on standard output. Every
 *     assistant message's info names `providerID` and `modelID`, and the model is written "providerID/modelID". Its
 *     `--format json` events name no model. Read from the OpenCode 1.18.31 program itself (its export command and its
 *     AssistantMessage shape), not from a run: no OpenCode run has been made on this machine.
 *   KIMI: nothing. `--output-format stream-json --final-message-only` prints the answer alone, and the office reads
 *     nothing else of a Kimi run. Kimi is not installed here, so nothing more could be looked at.
 *
 * A run served by more than one model keeps every distinct name, joined by ", ", in the order they first appear.
 *
 * ---------------------------------------------------------------------------------------------
 * THE OTHER FIELDS
 * ---------------------------------------------------------------------------------------------
 *
 * `temperature`: none of these runtimes writes one, so it is "not reported". `briefBytes`: the message worker hands
 * the prompt on the command line and keeps no brief file, so it is "not reported" there. `contextTokens`: for
 * OpenCode, each assistant message's input + cache read + cache write, which is what the provider was sent; for Codex
 * and Kimi "not reported", because Codex repeats its token counts and which lines are one turn's was not worked out.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NOT_REPORTED } from './claude-code-served.mjs'
import { theCodexRolloutFor } from './codex-log.mjs'
import { theWayToStart } from './runtimes.mjs'
import { jsonLines, object } from './usage.mjs'

/** @typedef {{ largestTurn: number | string, total: number | string }} ServedContextTokens */
/** @typedef {{ model: string, temperature: number | string, briefBytes: number | string, contextTokens: ServedContextTokens }} Served */
/** @typedef {{ served: Served, said: string }} ServedReading */

/** How long `opencode export` may take before the reading gives up and says so. */
export const THE_LONGEST_AN_EXPORT_TAKES_MS = 20_000

/**
 * THE `Served` OBJECT for these model names and inputs, with "not reported" where there is nothing.
 * @param {readonly string[]} models
 * @param {readonly number[]} inputs
 * @returns {Served}
 */
export function aServed(models, inputs = []) {
  const names = [...new Set(models.filter((name) => typeof name === 'string' && name.trim() !== ''))]
  return {
    model: names.length === 0 ? NOT_REPORTED : names.join(', '),
    temperature: NOT_REPORTED,
    briefBytes: NOT_REPORTED,
    contextTokens: {
      largestTurn: inputs.length === 0 ? NOT_REPORTED : Math.max(...inputs),
      total: inputs.length === 0 ? NOT_REPORTED : inputs.reduce((sum, one) => sum + one, 0),
    },
  }
}

/**
 * THE MODELS A CODEX ROLLOUT'S TURNS RAN WITH, from the `turn_context` lines stamped at or after `sinceMs`.
 * @param {string} text
 * @param {number} sinceMs
 * @returns {string[]}
 */
export function theModelsInACodexRollout(text, sinceMs) {
  /** @type {string[]} */
  const models = []
  for (const event of jsonLines(text)) {
    if (event['type'] !== 'turn_context') continue
    const at = typeof event['timestamp'] === 'string' ? Date.parse(event['timestamp']) : NaN
    if (!Number.isFinite(at) || at < sinceMs) continue
    const model = object(event['payload'])['model']
    if (typeof model === 'string' && model !== '') models.push(model)
  }
  return models
}

/**
 * WHAT ONE CODEX RUN WAS SERVED, from the rollout of its thread.
 * @param {{ thread: string | null, env: Record<string, string | undefined>, sinceMs: number }} run
 * @returns {ServedReading}
 */
export function theServedOfACodexRun(run) {
  if (run.thread === null) return { served: aServed([]), said: 'The run named no Codex thread, so there was no rollout to read.' }
  // A START THAT IS NOT A MOMENT would let every turn the thread ever had count as this run's, so nothing is read.
  if (!Number.isFinite(run.sinceMs)) return { served: aServed([]), said: "The run's start is not a moment, so no turn of the rollout could be told to be the run's." }
  const home = run.env['CODEX_HOME'] !== undefined && run.env['CODEX_HOME'] !== '' ? run.env['CODEX_HOME'] : run.env['HOME'] ? join(run.env['HOME'], '.codex') : null
  if (home === null) return { served: aServed([]), said: 'Neither CODEX_HOME nor HOME was set, so there was no Codex folder to look in.' }
  const root = join(home, 'sessions')
  const path = theCodexRolloutFor(run.thread, root)
  if (path === null) return { served: aServed([]), said: `No rollout of Codex thread ${run.thread} is in ${root}.` }
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch (why) {
    return { served: aServed([]), said: `The rollout ${path} could not be read (${why instanceof Error ? why.message : String(why)}).` }
  }
  const models = theModelsInACodexRollout(text, run.sinceMs)
  const served = aServed(models)
  return {
    served,
    said:
      models.length === 0
        ? `The rollout ${path} has no turn_context naming a model since the run began.`
        : `The rollout ${path}: ${String(models.length)} ${models.length === 1 ? 'turn' : 'turns'} since the run began named ${served.model}.`,
  }
}

/**
 * THE MODELS AND INPUTS AN `opencode export` NAMES, from its assistant messages.
 * @param {string} text
 * @returns {{ models: string[], inputs: number[] } | null} null when the text is not an export.
 */
export function theOpenCodeExportSays(text) {
  const start = text.indexOf('{')
  if (start === -1) return null
  let exported
  try {
    exported = JSON.parse(text.slice(start))
  } catch {
    return null
  }
  const messages = object(exported)['messages']
  if (!Array.isArray(messages)) return null
  /** @type {string[]} */
  const models = []
  /** @type {number[]} */
  const inputs = []
  for (const message of messages) {
    const info = object(object(message)['info'])
    if (info['role'] !== 'assistant') continue
    const provider = info['providerID']
    const model = info['modelID']
    if (typeof model === 'string' && model !== '') models.push(typeof provider === 'string' && provider !== '' ? `${provider}/${model}` : model)
    const tokens = object(info['tokens'])
    const cache = object(tokens['cache'])
    const parts = [tokens['input'], cache['read'], cache['write']].filter(
      /** @returns {one is number} */ (one) => typeof one === 'number' && Number.isFinite(one),
    )
    if (parts.length > 0) inputs.push(parts.reduce((sum, one) => sum + one, 0))
  }
  return { models, inputs }
}

/**
 * WHAT ONE OPENCODE RUN WAS SERVED, from `opencode export <session>` run with the run's own environment, so it reads
 * the same OpenCode data folder the run wrote.
 *
 * `run.command` is the program the adapter found, which on Windows is the opencode.cmd npm installs. Node will not start
 * a .cmd without cmd.exe, so it is started the way `theWayToStart` in ./runtimes.mjs gives it, and a word that function
 * refuses is said here as an export that could not run.
 * @param {{ session: string | null, command: string, env: Record<string, string | undefined> }} run
 * @param {import('./runtimes.mjs').TheSystem} [system] this machine unless a test names another
 * @returns {ServedReading}
 */
export function theServedOfAnOpenCodeRun(run, system) {
  if (run.session === null) return { served: aServed([]), said: 'The run named no OpenCode session, so there was nothing to export.' }
  /** @type {ReturnType<typeof theWayToStart>} */
  let way
  try {
    way = theWayToStart(run.command, ['export', run.session], system)
  } catch (err) {
    // The refusal ends with a full stop of its own.
    return { served: aServed([]), said: `opencode export ${run.session} could not run: ${/** @type {Error} */ (err).message}` }
  }
  const ran = spawnSync(way.command, way.args, {
    env: /** @type {NodeJS.ProcessEnv} */ (run.env),
    encoding: 'utf8',
    timeout: THE_LONGEST_AN_EXPORT_TAKES_MS,
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsVerbatimArguments: way.windowsVerbatimArguments,
    windowsHide: true,
  })
  if (ran.error !== undefined) return { served: aServed([]), said: `opencode export ${run.session} could not run: ${ran.error.message}.` }
  if (ran.status !== 0) {
    return { served: aServed([]), said: `opencode export ${run.session} exited with ${String(ran.status ?? ran.signal)}: ${String(ran.stderr).trim().slice(-300)}` }
  }
  const says = theOpenCodeExportSays(String(ran.stdout))
  if (says === null) return { served: aServed([]), said: `opencode export ${run.session} printed no session export.` }
  const served = aServed(says.models, says.inputs)
  return {
    served,
    said:
      says.models.length === 0
        ? `opencode export ${run.session} named no model on any assistant message.`
        : `opencode export ${run.session}: ${String(says.models.length)} assistant ${says.models.length === 1 ? 'message' : 'messages'} named ${served.model}.`,
  }
}

/**
 * WHAT A KIMI RUN WAS SERVED: nothing the office reads names it.
 * @returns {ServedReading}
 */
export function theServedOfAKimiRun() {
  return { served: aServed([]), said: "Kimi's --final-message-only output names no model, and the office reads nothing else of a Kimi run." }
}
