// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT TO CALL THE STAGE A PARTIAL GATE STOPS AT, worked out once for every drawing that words a gate (wave 13y round
 * 85).
 *
 * A gate stores its stage as `upTo`, and `upTo` is one of three things (Gate.upTo in src/shared/work.ts): the id of a
 * step's block, the id of a checklist item, or a stage in words. `gateWordsForReader` in src/web/components/ui.tsx
 * cannot tell an id from words, so it draws `upTo` as stored unless its caller passes the stage's words. Drawn as
 * stored, a step's id was the gate's words: "only as far as rl-weigh-it3 until this finishes". Each drawing knows a
 * different amount, and these two functions say what each may conclude from what it knows:
 *
 *   - a drawing handed a pipeline's steps says a step of that pipeline by its number and title, "03 Weigh the reel";
 *   - a drawing that can also tell a block from any other record says "a step that is not in this pipeline" for a
 *     block that is no step of it;
 *   - a drawing of the plan holds the blocks it draws and not their pipeline's order, so it says such a block by its
 *     title alone.
 *
 * Anything else may be a stage named in words, which is its author's words, so it is drawn as it is stored.
 */
import { t } from '@shared/i18n.ts'

/** The stage of one gate, as far as the drawing can say it. `words` is undefined where `upTo` is drawn as stored. */
export type GateStage =
  | { at: 'named'; words: string }
  | { at: 'not-a-step-here'; words: string }
  | { at: 'as-stored'; words: undefined }

/** What a drawing says when it can say nothing more than what is stored. */
export const AS_STORED: GateStage = { at: 'as-stored', words: undefined }

/**
 * The stage a gate stops at, in a drawing of one pipeline.
 *
 * `steps` are the pipeline's steps in their order. `numbered` is the drawing's own number for a row
 * (`stepNumber` in src/web/components/PipelineFlow.tsx), handed in so this file does not import the drawing that
 * imports it. `isABlock` is false for every id when the drawing is handed no records, and then a block of another
 * pipeline is drawn as stored.
 */
export function stageInAPipeline(
  upTo: string | undefined,
  steps: readonly { id: string; name: string }[],
  numbered: (index: number) => string,
  isABlock: (id: string) => boolean = () => false,
): GateStage {
  if (upTo === undefined) return AS_STORED
  const at = steps.findIndex((step) => step.id === upTo)
  if (at >= 0) return { at: 'named', words: `${numbered(at)} ${steps[at]!.name}` }
  if (isABlock(upTo)) return { at: 'not-a-step-here', words: t('graph.wall.aStepNotInThisPipeline') }
  return AS_STORED
}

/** The stage a gate stops at, in a drawing of the plan: a block the plan draws, by the name its card is given. */
export function stageInThePlan(
  upTo: string | undefined,
  nodes: readonly { recordId: string; kind: string; name: string }[],
): GateStage {
  if (upTo === undefined) return AS_STORED
  const node = nodes.find((one) => one.recordId === upTo && one.kind === 'block')
  return node === undefined ? AS_STORED : { at: 'named', words: node.name }
}
