// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH MODEL A RUN THE OFFICE STARTS IS GIVEN, AND WHERE THAT ANSWER CAME FROM. Criterion M85.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS ONE FUNCTION AND NOT A LINE IN EACH ADAPTER
 * ---------------------------------------------------------------------------------------
 *
 * Three things start a run of an agent's tool on this machine: the message worker through an
 * adapter, `tools/agent-worker.mjs`, and `tools/the-inspector.mjs`. The last two already read
 * `MOLE_OFFICE_AGENT_MODEL`. The adapter did not, so a run the message worker started took whatever
 * the person's own CLI was configured with — measured on 7 September 2026: fifty-eight runs that
 * night, none of them recording a model, all of them on a default nobody had chosen for them.
 *
 * NOT CHOOSING WAS NOT NEUTRAL. It was choosing silently and leaving no way to find out afterwards,
 * which is the first invariant of this repository read backwards.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT LIVES IN `src/config` AND NOT BESIDE THE ADAPTER THAT PASSES IT
 * ---------------------------------------------------------------------------------------
 *
 * Two programs need this one answer: the worker passes the model on a command line, and the server
 * says on the runtime page which model runs are given. It was written in `src/worker/runtimes/` at
 * first, and `tests/a-program-is-judged-on-the-files-it-is-built-from.test.ts` caught that at once:
 * the server would have loaded a fourth file out of another program's folders, and `tsx watch`
 * would have restarted the server on edits to the worker. It is a question about a setting, the
 * setting is declared next door in `settings.mjs`, and `src/config` is the one folder both programs
 * already load from. So it belongs here, and neither program reaches into the other.
 */

import { ENV_FILE, mergedEnvironment, readSettingHere, settingNamed } from './settings.mjs'

/** The name of the setting that decides this, spelt once. */
const SETTING = 'MOLE_OFFICE_AGENT_MODEL'

/**
 * The model named in ONE ENVIRONMENT, or null because nothing in it named one.
 *
 * THE ENVIRONMENT HANDED IN IS THE WHOLE WORLD. An adapter answers out of the environment it was
 * built with and nothing else: the worker builds that environment as `.env` under its own
 * (`workerSettingsFrom`), so a line in the file reaches a run the same way a shell's export does;
 * and a test that builds an environment of its own is describing a world of its own, which this
 * function must not answer out of a file the test did not read. That is the lesson `readSetting`
 * in settings.mjs records from 28 August 2026, and it was paid for again on 8 September: the two
 * adapters fell back from a built environment to the checkout's `.env`, and the suite went red on
 * main the moment the owner's `.env` named a model.
 *
 * IT NEVER ANSWERS AN EMPTY STRING. A blank setting is somebody having unset it rather than having
 * chosen "whatever the tool does", and passing `--model ''` would be an argument no tool can read.
 *
 * NULL IS A REAL ANSWER. The office ships no default model, as FLO-05 of a decision says, so null means nobody named
 * one, and the caller refuses the run with `NO_MODEL_SAYS`.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string | null}
 */
export function theModelIn(env) {
  const said = env[SETTING]
  if (said !== undefined && String(said).trim() !== '') return String(said).trim()
  return settingNamed(SETTING).fallback
}

/**
 * WHAT A RUN WITH NO MODEL IS TOLD, for each place the office starts one. Under FLO-05 of a decision, the office ships
 * no default model, so a run with none named is not started.
 *
 * Each sentence names only the places that can name a model for that kind of run. A builder and a
 * check take theirs from the Casting table (src/server/lib/run-models.ts). A run answering a message
 * takes its model from the Settings page, never from the Casting table, so its sentence names the
 * Settings page instead. The server's answer and the message worker's refusal both use these.
 */
export const NO_MODEL_SAYS = Object.freeze({
  builder:
    'No model is named for this run, so it is not started. Mark a ' +
    "casting with a model for its role card on the Casting page, or set a model on the agent's profile.",
  check:
    'No model is named for this check, so it is not started. Mark a ' +
    "casting with a model for the inspector card on the Casting page, or set a model on the checking agent's profile.",
  conversation:
    'No model is named for this run, so it is not started. Name a ' +
    "model for a run answering a message on the Settings page, or set a model on the agent's profile.",
})

/**
 * The model the runs THIS PROCESS starts are given: `.env` under the real environment, which is the
 * world the server answers the runtime page from.
 *
 * @param {Record<string, string | undefined>} [processEnv]
 * @param {string} [file]
 * @returns {string | null}
 */
export function theModelASettingNamed(processEnv = process.env, file = ENV_FILE) {
  return theModelIn(mergedEnvironment(processEnv, file))
}

/**
 * WHERE THAT ANSWER CAME FROM, in words, for the runtime page.
 *
 * A person reading which model their runs cost money on needs to know whether they set it or the
 * product did, because those are two different things to do something about.
 *
 * @returns {string}
 */
/**
 * @param {Record<string, string | undefined>} [processEnv]
 * @param {string} [file]
 * @returns {string}
 */
export function whereTheModelCameFrom(processEnv = process.env, file = ENV_FILE) {
  const reading = whereTheModelCameFromReading(processEnv, file)
  return reading.nobodySetIt
    ? `${SETTING} is not set, and the office has no default model.`
    : `${SETTING} says so, from ${reading.source}.`
}

/**
 * THE FACTS BEHIND THAT SENTENCE: which setting, which layer answered, and whether anybody set it.
 * The runtime page draws the sentence in the page's language from these (src/server/lib/runtime.ts).
 *
 * @param {Record<string, string | undefined>} [processEnv]
 * @param {string} [file]
 * @returns {{ setting: string, source: string, nobodySetIt: boolean }}
 */
export function whereTheModelCameFromReading(processEnv = process.env, file = ENV_FILE) {
  // THE SOURCE AND NOT THE VALUE. `settingValue` answers the declared default when nobody has set
  // one, so a reader asking it cannot tell "someone chose this" from "nobody chose anything" — and
  // those are the two different things a person reading what their runs cost has to act on.
  // `readSettingHere` says which layer answered, which is the fact.
  const reading = readSettingHere(SETTING, processEnv, file)
  return {
    setting: SETTING,
    source: reading.source,
    nobodySetIt: reading.source === 'the built-in default' || reading.source === 'nothing set it',
  }
}
