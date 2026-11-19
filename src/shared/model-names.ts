// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MODEL'S NAME IN WORDS A PERSON READS, for a stored model id. Problem 2tbFWxiFyjtv: a person cannot weigh what
 * they read without knowing which model wrote it, and "claude-opus-5-5" is an id, not a name.
 *
 * ONLY THE MODELS THIS OFFICE'S RUNS ARE STARTED ON ARE NAMED. A name is not worked out from the id's letters: that
 * would guess the capitals and the version of a model nobody listed here ("deepseek" is "DeepSeek"). An id this table
 * does not hold answers null, and a page then says it has no name for the model and shows the id only in developer
 * mode. Add a model here when runs start on it.
 */

/** A model name without its provider prefix: everything up to its last "/" is taken off. */
export function withoutTheProvider(name: string): string {
  return name.slice(name.lastIndexOf('/') + 1).trim()
}

/** Each id, without its provider prefix, and the model's own name. A name is the same in every language. */
const MODEL_NAMES: Readonly<Record<string, string>> = {
  'claude-opus-5-5': 'Claude Opus 5.5',
  'claude-sonnet-5': 'Claude Sonnet 5',
  'claude-sonnet-5-5': 'Claude Sonnet 5.5',
  'claude-fable-5-1': 'Claude Fable 5.1',
  'claude-haiku-4-5': 'Claude Haiku 4.5',
  'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
  'deepseek-v4.1-flash': 'DeepSeek V4.1 Flash',
  'gpt-6.1-sol': 'GPT-6.1 Sol',
  'gpt-6-astra': 'GPT-6 Astra',
  'gpt-6-luna': 'GPT-6 Luna',
}

/** The model's name for this stored id, or null because this office has no name for it. */
export function theModelsName(id: string): string | null {
  return MODEL_NAMES[withoutTheProvider(id)] ?? null
}
