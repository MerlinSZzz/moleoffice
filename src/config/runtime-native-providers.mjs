// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * EACH RUNTIME'S FACTS, from the one data file that says them: the program its command runs, the provider whose
 * models that program runs, and whether its command gets fast mode. The data file is read here only.
 *
 * A `.mjs` so that src/shared, which is bundled for the browser, can import it: src/config/launcher-selection.mjs
 * imports node:path and cannot be read there. That module imports this one and re-exports it, and so does
 * src/config/model-efforts.mjs, so every existing importer is unchanged.
 */
import runtimes from './runtime-native-providers.json' with { type: 'json' }

const THE_FILE = 'src/config/runtime-native-providers.json'
for (const [runtime, entry] of Object.entries(runtimes)) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`The runtime data file ${THE_FILE} has an entry for ${runtime} that is not an object.`)
  if (typeof entry.program !== 'string' || entry.program === '') throw new Error(`The runtime data file ${THE_FILE} has no program for ${runtime}.`)
  if (!(entry.provider === null || (typeof entry.provider === 'string' && entry.provider !== ''))) throw new Error(`The runtime data file ${THE_FILE} has a provider for ${runtime} that is neither null nor a name.`)
  if (entry.fastMode !== true && entry.fastMode !== false) throw new Error(`The runtime data file ${THE_FILE} has no fast mode for ${runtime}.`)
}

/**
 * The provider whose models a runtime's own program runs, for the runtimes that have one. A runtime whose program runs
 * the models it is given, under no provider of its own, is absent.
 */
export const THE_PROVIDER_A_RUNTIME_RUNS = /** @type {Readonly<Record<string, string>>} */ (Object.freeze(Object.fromEntries(
  Object.entries(runtimes).flatMap(([runtime, entry]) => (typeof entry.provider === 'string' ? [[runtime, entry.provider]] : [])),
)))

/** The program each runtime's command runs, keyed by runtime. */
export const THE_PROGRAM_A_RUNTIME_RUNS = /** @type {{ readonly [R in keyof typeof runtimes]: string }} */ (Object.freeze(Object.fromEntries(
  Object.entries(runtimes).map(([runtime, entry]) => [runtime, entry.program]),
)))

/** Whether each runtime's command gets fast mode, keyed by runtime. */
export const THE_RUNTIMES_FAST_MODE = /** @type {{ readonly [R in keyof typeof runtimes]: boolean }} */ (Object.freeze(Object.fromEntries(
  Object.entries(runtimes).map(([runtime, entry]) => [runtime, entry.fastMode]),
)))
