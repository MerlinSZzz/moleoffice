// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { pipelinePosition } from '@shared/blocks.ts'
import type { ItemState } from '@shared/types.ts'
import type { Pause } from '@shared/work.ts'
import { content, t } from '@shared/i18n.ts'

/**
 * THE SENTENCE UNDER ONE PIPELINE ON HOME: where it stands.
 *
 * Three paths, in this order:
 *   1. No step is unfinished: every step is done.
 *   2. Every unfinished step carries a pause: the pipeline is standing still. A decision settles
 *      problem RK4zJb6hJyV6 this way, and changes only this sentence.
 *   3. Otherwise: the step `pipelinePosition` picks, exactly as before, even when that step is one
 *      of the paused ones, because the decision changes the sentence only when every one is.
 *
 * A step is unfinished when its state is not `done`. `pipelinePosition` answers null exactly when
 * no step is unfinished, so path 1 needs nothing else.
 */
export function pipelineLine(blocks: readonly { name: string; state: ItemState; pause: Pause | null }[]): string {
  const at = pipelinePosition(blocks)
  if (at === null) return t('home.allStepsDone', { n: blocks.length })
  const still = standsStill(blocks)
  if (still !== null) return t('homeWords.pipelineStill', { n: still })
  return t('home.onStep', { n: blocks.indexOf(at) + 1, total: blocks.length, name: content(at.name) })
}

/**
 * HOW MANY UNFINISHED STEPS A PIPELINE HAS WHEN EVERY ONE OF THEM IS PAUSED, or null when it is not
 * standing still (a step is still moving, or no step is unfinished). The one rule for "standing
 * still": the sentence above and Home's Late or stuck both read it.
 */
export function standsStill(blocks: readonly { state: ItemState; pause: Pause | null }[]): number | null {
  const unfinished = blocks.filter((block) => block.state !== 'done')
  if (unfinished.length === 0) return null
  return unfinished.every((block) => block.pause !== null) ? unfinished.length : null
}
