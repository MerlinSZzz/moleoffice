// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE RUNTIME, MODEL AND REASONING VARIANT THE OFFICE'S OWN RUNS TAKE. Criterion T7.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT "THE OFFICE'S OWN RUNS" MEANS
 * ---------------------------------------------------------------------------------------
 *
 * The runs the office starts by itself. Answering a message in a group is the one today. A check is
 * not one of these: it does not take a runtime from these settings, because `tools/the-inspector.mjs`
 * starts `claude` with a fixed command line and reads that one envelope; its MODEL is already
 * `MOLE_OFFICE_INSPECTION_MODEL`. A notice is not one either: NOTICES START NO RUN. What T7 calls
 * notices are system lines written by `tellThemOncePerCause` in src/server/lib/reminders.ts, and
 * there is no runtime to route. A builder is not one either: a secretary starts a builder, and it
 * takes `MOLE_OFFICE_AGENT_MODEL`.
 *
 * `dsh` IS NOT A CHOICE HERE. `dsh` is a runtime a worker may be STARTED on by the office's own
 * tools outside the message worker, and the office starts no dsh run itself. The runtime words this
 * setting can name are the ones the message worker can dispatch, which is
 * `THE_RUNTIMES_THE_OFFICE_DISPATCHES` in src/worker/runtimes/index.ts.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THESE READERS LIVE IN src/config AND NOT BESIDE THE ADAPTER THAT PASSES THE MODEL
 * ---------------------------------------------------------------------------------------
 *
 * Two readers need the same answers: the opencode adapter, which puts the model and the variant on
 * the command line, and the runtime page, which says which runs go where and where each answer came
 * from. The server may load files out of `src/config` and the worker may too, so this is the one
 * folder both can read. The same argument is written at the top of `agent-model.mjs`.
 *
 * NOTHING HERE IS A SECOND DEFAULT. Every value is read through the declaration in `settings.mjs`,
 * so the name and the meaning of absence are written once. A setting set to an empty value is a
 * refusal from the declaration, the same as everywhere else: it is a different statement from not
 * being set, and this cannot guess which was meant.
 *
 * THE ORDER OF THE RUNTIME IS THE AGENT'S OWN REGISTRY ROW FIRST, THEN THIS SETTING, THEN WHAT
 * HAPPENS TODAY. That order is applied in `theQueue` in src/server/lib/worker.ts, where the runtime
 * word comes off the row. The agent's own row wins because it is the more specific thing a person
 * set, and criterion U2 says an agent's runs get what its profile says. THE MODEL HAS NO ROW LAYER
 * YET: U2 adds a model field to the agent kind, and until it lands the order here is this setting,
 * then whatever the runtime is given today.
 */

import { ENV_FILE, mergedEnvironment, readSetting, readSettingHere } from './settings.mjs'
import { theModelIn } from './agent-model.mjs'

/** The three settings' names, spelt once. */
const RUNTIME = 'MOLE_OFFICE_CHORE_RUNTIME'
const MODEL = 'MOLE_OFFICE_CHORE_MODEL'
const VARIANT = 'MOLE_OFFICE_CHORE_VARIANT'

/**
 * The value of one of the three settings in an environment, trimmed, or null because nothing named
 * one.
 *
 * THE ENVIRONMENT HANDED IN IS THE WHOLE WORLD. An adapter answers out of the environment it was
 * built with and nothing else, the same rule `theModelIn` in `agent-model.mjs` follows: a test that
 * builds an environment of its own gets an answer about that world, not about this checkout's
 * `.env`.
 *
 * @param {string} name
 * @param {Record<string, string | undefined>} env
 * @returns {string | null}
 */
function namedIn(name, env) {
  // `readSetting` is what makes a misspelt name a refusal rather than a silent undefined, and it
  // refuses a value set to nothing as well. The declaration is the only place these names are known.
  const reading = readSetting(name, env)
  return reading.value === null ? null : String(reading.value).trim()
}

/** The runtime the office's own runs take, or null because the agent's own row decides. */
/** @param {Record<string, string | undefined>} env @returns {string | null} */
export function choreRuntimeIn(env) {
  return namedIn(RUNTIME, env)
}

/** The model the office's own runs take, or null because nobody named one. */
/** @param {Record<string, string | undefined>} env @returns {string | null} */
export function choreModelIn(env) {
  return namedIn(MODEL, env)
}

/**
 * THE MODEL A RUN THE OFFICE STARTS BY ITSELF IS GIVEN on a runtime that reads a model from this
 * installation.
 *
 * The chore model names it. When nobody named one, `MOLE_OFFICE_AGENT_MODEL` decides, which is the
 * declaration's own `absentMeans` for the chore model. When neither names one the answer is null, and
 * the message worker refuses the run, because FLO-05 of a decision says the office
 * ships no model.
 *
 * OPENCODE IS DELIBERATELY NOT THIS READER. It is passed no model at all when the chore setting is
 * unset, because `MOLE_OFFICE_AGENT_MODEL` is usually an Anthropic model name that means nothing
 * to opencode, and naming it would be this product inventing a fact. The opencode adapter reads
 * `choreModelIn` for that reason.
 */
/** @param {Record<string, string | undefined>} env @returns {string | null} */
export function theModelAChoreIsGiven(env) {
  return choreModelIn(env) ?? theModelIn(env)
}

/** The provider's reasoning effort the office's own runs on opencode take, or null. */
/** @param {Record<string, string | undefined>} env @returns {string | null} */
export function choreVariantIn(env) {
  return namedIn(VARIANT, env)
}

/** The three, read from `.env` under the environment this process was started with. */
/** @param {Record<string, string | undefined>} [processEnv] @param {string} [file] */
function inThisWorld(processEnv = process.env, file = ENV_FILE) {
  return mergedEnvironment(processEnv, file)
}

/** The runtime the office's own runs take on this machine, or null. */
/** @param {Record<string, string | undefined>} [processEnv] @param {string} [file] @returns {string | null} */
export function theChoreRuntimeASettingNamed(processEnv = process.env, file = ENV_FILE) {
  return choreRuntimeIn(inThisWorld(processEnv, file))
}

/** The model the office's own runs take on this machine, or null. */
/** @param {Record<string, string | undefined>} [processEnv] @param {string} [file] @returns {string | null} */
export function theChoreModelASettingNamed(processEnv = process.env, file = ENV_FILE) {
  return choreModelIn(inThisWorld(processEnv, file))
}

/** The reasoning variant the office's own runs on opencode take on this machine, or null. */
/** @param {Record<string, string | undefined>} [processEnv] @param {string} [file] @returns {string | null} */
export function theChoreVariantASettingNamed(processEnv = process.env, file = ENV_FILE) {
  return choreVariantIn(inThisWorld(processEnv, file))
}

/**
 * WHERE EACH ANSWER CAME FROM, in words, for the runtime page.
 *
 * The page draws the answer and its source together, because a person deciding what to do about a
 * run's cost has to be able to tell a thing they set from a thing nobody set. The source is the
 * same reader `whereTheModelCameFrom` uses, so the two pages cannot disagree about which layer
 * answered.
 */
/** @param {Record<string, string | undefined>} [processEnv] @param {string} [file] @returns {string} */
export function whereTheChoreRuntimeCameFrom(processEnv = process.env, file = ENV_FILE) {
  return whereTheChoreCameFrom(
    RUNTIME,
    "the agent's own registry row decides which runtime serves it",
    processEnv,
    file,
  )
}

/** @param {Record<string, string | undefined>} [processEnv] @param {string} [file] @returns {string} */
export function whereTheChoreModelCameFrom(processEnv = process.env, file = ENV_FILE) {
  return whereTheChoreCameFrom(
    MODEL,
    'the runtime is given the model it is given today, and opencode none',
    processEnv,
    file,
  )
}

/** @param {Record<string, string | undefined>} [processEnv] @param {string} [file] @returns {string} */
export function whereTheChoreVariantCameFrom(processEnv = process.env, file = ENV_FILE) {
  return whereTheChoreCameFrom(VARIANT, "the runtime's own default applies", processEnv, file)
}

/**
 * @param {string} name
 * @param {string} absent
 * @param {Record<string, string | undefined>} processEnv
 * @param {string} file
 * @returns {string}
 */
function whereTheChoreCameFrom(name, absent, processEnv, file) {
  const reading = theChoreSettingReading(name, processEnv, file)
  if (reading.nobodySetIt) return `${name} is not set, so ${absent}.`
  return `${name} says so, from ${reading.source}.`
}

/** @typedef {{ setting: string, source: string, nobodySetIt: boolean }} ChoreSettingReading */

/**
 * @param {string} name
 * @param {Record<string, string | undefined>} processEnv
 * @param {string} file
 * @returns {ChoreSettingReading}
 */
function theChoreSettingReading(name, processEnv, file) {
  const reading = readSettingHere(name, processEnv, file)
  return {
    setting: name,
    source: reading.source,
    nobodySetIt: reading.source === 'the built-in default' || reading.source === 'nothing set it',
  }
}

/**
 * THE FACTS BEHIND THE THREE SENTENCES ABOVE: which setting, which layer answered it, and whether
 * anybody set it. The runtime page draws each sentence in the page's language from these
 * (src/server/lib/run-models.ts); the sentences above stay the English every other reader gets.
 *
 * @param {'runtime' | 'model' | 'variant'} which
 * @param {Record<string, string | undefined>} [processEnv]
 * @param {string} [file]
 * @returns {ChoreSettingReading}
 */
export function whereTheChoreCameFromReading(which, processEnv = process.env, file = ENV_FILE) {
  return theChoreSettingReading(which === 'runtime' ? RUNTIME : which === 'model' ? MODEL : VARIANT, processEnv, file)
}
