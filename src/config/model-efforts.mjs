// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Explicit Office effort choices come first. Exact compatibility data is the last layer and offline fallback.
import compatibility from './launcher-model-compatibility.json' with { type: 'json' }
export { compatibility as LAUNCHER_MODEL_COMPATIBILITY }
export const THE_MODELS_START_VALUES = Object.freeze(Object.fromEntries(Object.entries(compatibility.startValues).map(([model,value]) => [model,Object.freeze(value)])))

/**
 * The launcher's source for an effort that is set and is not its Casting row's, where it holds only the selection and
 * cannot prove where the effort came from. The office never answers it.
 */
export const AN_UNPROVED_EFFORT_NOT_THE_ROWS = "not the Casting row's, source not proved"

/**
 * The sources of a run's effort. The shared type and both launcher checks read this list.
 * The agent: the agent's own effort setting.
 * Casting roll: the row chosen by the run's Casting roll.
 * Casting: the marked row in the Casting table.
 * The owner's rule: the owner's start value for the model.
 * None: no effort was selected.
 * Not the Casting row's: the launcher's own word for a selection whose effort differs from its row's, from a source it
 * cannot prove (AN_UNPROVED_EFFORT_NOT_THE_ROWS).
 */
export const THE_EFFORT_SOURCES = Object.freeze(/** @type {const} */ ([
  'the agent', 'Casting roll', 'Casting', "the owner's rule", 'none', AN_UNPROVED_EFFORT_NOT_THE_ROWS,
]))

/** Fast mode is a runtime's fact in the data file: src/config/runtime-native-providers.mjs reads it, and this module re-exports it. */
export { THE_RUNTIMES_FAST_MODE } from './runtime-native-providers.mjs'

export const withoutTheProvider = (name) => name.slice(name.lastIndexOf('/') + 1).trim()

/** Null means the owner has set no effort for this model. */
export function theOwnersEffort(model) {
  return typeof model === 'string' ? THE_MODELS_START_VALUES[compatibility.aliases[model]]?.effort ?? null : null
}
