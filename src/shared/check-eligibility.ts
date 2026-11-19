// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sayInEnglish, type Say, type WordKey } from './i18n.ts'
import { MERGE_TOOL_RUNTIME } from './merge-queue.ts'
import { ROUND_LAUNCHER_RUNTIME } from './next-round.ts'

/** All four facts must be established before a check can start. */
export const CHECK_FACTS = ['workerServed', 'registeredArea', 'submittedTip', 'noInspector'] as const
export type CheckFact = (typeof CHECK_FACTS)[number]
export type CheckEligibilityFacts = Record<CheckFact, boolean | null>
export interface CheckEligibility {
  eligible: boolean
  code: 'CHECK_ELIGIBLE' | 'CHECK_NOT_ELIGIBLE'
  missing: { fact: CheckFact; state: 'missing' | 'unknown' }[]
  says: string
  nextAct: string
}

/**
 * THE RUNTIMES THAT RUN NO MODEL AND SERVE NO WORKER: the round launcher and the merge tool.
 * A run of one of these is filed with its runtime and no model, and the check note reads that
 * runtime rather than the absent model, because an ordinary run may store no model too.
 */
export const RUNTIMES_THAT_RUN_NO_MODEL: readonly string[] = [ROUND_LAUNCHER_RUNTIME, MERGE_TOOL_RUNTIME]

/** Whether a run's stored data says it runs no model, read from its `runtime` and nothing else. */
export function aRunRunsNoModel(data: Record<string, unknown> | undefined): boolean {
  const runtime = data === undefined ? undefined : data['runtime']
  return typeof runtime === 'string' && RUNTIMES_THAT_RUN_NO_MODEL.includes(runtime)
}

/**
 * THE FACTS WHOSE ACT CANNOT APPLY TO A RUN THAT RUNS NO MODEL. Such a run serves no worker and runs
 * no model, so no act can name the worker it serves, register that worker's area, or submit its own
 * run for a check. The note leaves those acts out and keeps the facts, which are still true.
 * `submittedTip` is not in this list: a run with no model still records a working directory, or a
 * cut and a tip, so its act can apply.
 */
const FACTS_WHOSE_ACT_CANNOT_APPLY_TO_A_RUN_WITH_NO_MODEL: readonly CheckFact[] = ['workerServed', 'registeredArea', 'noInspector']

/**
 * Each fact's name and the act that establishes it, as word keys: the English is in src/shared/words/en.ts.
 * The act is said on the run's note only where it can apply to the run; which facts cannot is above.
 */
const requirements: Record<CheckFact, { name: WordKey; act: WordKey }> = {
  workerServed: { name: 'chk.says.noCheck.workerServed', act: 'chk.says.noCheck.workerServed.act' },
  registeredArea: { name: 'chk.says.noCheck.registeredArea', act: 'chk.says.noCheck.registeredArea.act' },
  submittedTip: { name: 'chk.says.noCheck.submittedTip', act: 'chk.says.noCheck.submittedTip.act' },
  noInspector: { name: 'chk.says.noCheck.noInspector', act: 'chk.says.noCheck.noInspector.act' },
}

const STATE_WORDS: Record<CheckEligibility['missing'][number]['state'], WordKey> = {
  missing: 'chk.says.noCheck.isMissing',
  unknown: 'chk.says.noCheck.isUnknown',
}

/**
 * WHY NO CHECK WAS ASKED FOR, AND WHAT TO DO, read from the word lists by `say`. The server hands it the
 * English reader and stores the two sentences on the run; the run's check panel hands it the page's reader,
 * so a Chinese page reads them in Chinese. One function, so the two cannot come to say different things.
 * The acts are only those that can apply to this run: with `runsNoModel` the acts that need a worker or an
 * inspector are left out, and `nextAct` is the empty string when no act is left. The missing facts are
 * always all listed, because they are still true.
 */
export function noCheckWords(
  missing: CheckEligibility['missing'], say: Say, runsNoModel = false,
): { says: string; nextAct: string } {
  const factsWithAnAct = runsNoModel
    ? missing.filter(({ fact }) => !FACTS_WHOSE_ACT_CANNOT_APPLY_TO_A_RUN_WITH_NO_MODEL.includes(fact))
    : missing
  return {
    says: say('chk.says.noCheck', {
      missing: missing.map(({ fact, state }) => say(STATE_WORDS[state], { fact: say(requirements[fact].name) }))
        .join(say('chk.says.noCheck.listGap')),
    }),
    nextAct: factsWithAnAct.map(({ fact }) => say(requirements[fact].act)).join(say('chk.says.sentenceGap')),
  }
}

/**
 * A REFUSED CHECK SAID IN FULL: why it was refused, then the acts that apply, or the reason alone
 * where no act applies. `noCheckSays` builds the stored note on it, and a door that throws the
 * refusal says the full sentence through it too, so the note and the door cannot come to disagree.
 */
export function noCheckSentenceFrom(why: string, nextAct: string, say: Say): string {
  return nextAct === '' ? why : why + say('chk.says.sentenceGap') + nextAct
}

/**
 * The stored sentence: why, then the acts that apply, as the office writes it on the run. Where no act
 * applies, the sentence is the first one alone, with no sentence gap after it and no empty act.
 */
export function noCheckSays(missing: CheckEligibility['missing'], say: Say, runsNoModel = false): string {
  const words = noCheckWords(missing, say, runsNoModel)
  return noCheckSentenceFrom(words.says, words.nextAct, say)
}

/**
 * Pure and fail-closed, including callers passing malformed data across an untyped boundary.
 * `runsNoModel` says whether the run the facts came from runs no model; it defaults to false, so a
 * caller that does not know the run's kind gets exactly the answer it always got.
 */
export function checkEligibility(input: unknown, runsNoModel = false): CheckEligibility {
  const facts = typeof input === 'object' && input !== null && !Array.isArray(input)
    ? input as Record<string, unknown> : {}
  const missing: CheckEligibility['missing'] = CHECK_FACTS.flatMap((fact) =>
    facts[fact] === true ? [] : [{ fact, state: facts[fact] === false ? 'missing' as const : 'unknown' as const }],
  )
  if (missing.length === 0) return {
    eligible: true, code: 'CHECK_ELIGIBLE', missing, says: 'This run is eligible for a check.',
    nextAct: 'An independent checker may check this run.',
  }
  return { eligible: false, code: 'CHECK_NOT_ELIGIBLE', missing, ...noCheckWords(missing, sayInEnglish, runsNoModel) }
}
