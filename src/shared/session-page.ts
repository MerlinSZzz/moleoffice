// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { listJoined, t } from './i18n.ts'
import { theModelsName, withoutTheProvider } from './model-names.ts'

/**
 * THE SENTENCE UNDER A RUN'S MODEL ROW, AND NOTHING ELSE. Every other word a run's own page says is in
 * the word lists, under `runPage.*` or a key the record page already had, so it is drawn in the page's
 * language (problem h-kUysNG_2Ib). The three model sentences are word-list words too; this file only
 * works out which one applies.
 */

/** The words `served.model` holds when the runner looked and found no model name (the `Served` shape). */
const NOT_REPORTED = 'not reported'


/**
 * THE SENTENCE UNDER A RUN'S MODEL ROW, OR NULL. Problem VBtbw0hSO1E2. It is worked out here from the
 * two stored facts, `data.model` (what the run was registered for) and `data.served` (what answered,
 * written by the runner when the run ended), and nothing stores it.
 *
 * Null when there is nothing to say: no registered model, no `served`, a `served` with no model word,
 * or every model that answered is the registered one once the provider prefix is taken off from both
 * (anthropic/claude-opus-5-5 and claude-opus-5-5 are the same model). `served.model` holds several
 * names separated by ", " when more than one model answered, and the sentence names all of them.
 *
 * EACH MODEL IS NAMED BY ITS NAME, never by its id (`theModelsName`); one this office has no name for is said to be
 * one. The stored ids follow the names only when `withIds` is true, which the pages pass in developer mode. The run
 * page and the agent card both read this one function.
 */
export function theModelThatAnsweredSentence(
  model: unknown,
  served: unknown,
  withIds: boolean,
): { differs: boolean; text: string } | null {
  if (typeof model !== 'string' || model.trim() === '') return null
  if (served === null || typeof served !== 'object' || Array.isArray(served)) return null
  const answered = (served as Record<string, unknown>)['model']
  if (typeof answered !== 'string' || answered.trim() === '') return null
  const registered = inWords(model, withIds)
  if (answered === NOT_REPORTED) return { differs: false, text: t('runPage.modelNotReported', { registered }) }
  const ids = answered.split(', ')
  if (ids.every((id) => withoutTheProvider(id) === withoutTheProvider(model))) return null
  return {
    differs: true,
    text: t(ids.length === 1 ? 'runPage.modelAnswered' : 'runPage.modelsAnswered', {
      registered,
      answered: listJoined(ids.map((id) => inWords(id, withIds))),
    }),
  }
}

/** One model as the sentence says it: its name, or that this office has none for it, and its stored id only when asked. */
function inWords(id: string, withIds: boolean): string {
  const name = theModelsName(id) ?? t('runPage.model.unnamedOne')
  return withIds ? t('runPage.model.withId', { name, id: id.trim() }) : name
}
