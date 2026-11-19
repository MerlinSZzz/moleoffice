// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT EACH RUNTIME PASSES ON OF THE MODEL AND THE EFFORT THE OFFICE CHOSE FOR A RUN. Criterion U2.
 *
 * The office chooses a model and a reasoning effort for a run, and the message worker hands both to the
 * runtime's adapter. Not every runtime puts both on its command line. This file is the one place that is
 * written. The adapters read it for `modelItWouldUse`, `variantItWouldUse` and the command they build, so
 * what a command line carries and what an adapter says it would use are the same answer. The API server
 * reads it through `theRuntimesTheWorkerGives`, to refuse a stored model or effort that would never reach a
 * command and to tell the Settings page and an agent's profile which runtimes take one.
 *
 * IT IS IN src/shared BECAUSE src/shared/kinds.ts READS IT, for the `agent` kind's `variant` field, and a
 * shared file may not import a worker file. src/worker/runtimes/what-a-runtime-passes-on.ts exports its
 * names again, beside the second table it hands on, so the adapters and the API server import them from
 * there as before. It imports nothing but types, so the pages can load it too.
 */
import type { AgentRuntime, THE_RUNTIMES_THE_OFFICE_DISPATCHES } from './participants.ts'
import type { TheOfficesChoice, TheRuntimesTheWorkerGives } from './run-models.ts'

/** A runtime word the office dispatches a run on, and so one with an adapter and a line in the table below. */
type ADispatchedRuntime = (typeof THE_RUNTIMES_THE_OFFICE_DISPATCHES)[number]

/** The model and the effort a runtime puts on its command line, of the ones it was handed. Each is null where it puts none. */
export interface WhatItPassesOn {
  readonly model: string | null
  readonly variant: string | null
}

/** One line per dispatched runtime, so a runtime added to the office's list with no line here does not compile. */
const WHAT_EACH_RUNTIME_PASSES_ON: { readonly [R in ADispatchedRuntime]: (chosen: TheOfficesChoice) => WhatItPassesOn } = {
  // `--model`. Claude Code gets the owner's effort from the launcher's table, so it passes none of the office's.
  'claude-code': (chosen) => ({ model: chosen.model, variant: null }),
  // `-m`. The shared launcher puts the Casting row's model and effort in its place, and no effort of the office's.
  codex: (chosen) => ({ model: chosen.model, variant: null }),
  // `-m` and `--variant`. The office's effort goes with the office's model, and with no model it passes neither.
  opencode: (chosen) => ({ model: chosen.model, variant: chosen.model === null ? null : chosen.variant }),
  // Neither: Kimi is told its model through its own settings (`whatKimiIsToldAboutItsModel` in kimi.ts).
  kimi: () => ({ model: null, variant: null }),
}

/** What one runtime passes on of the model and the effort the office chose for a run. */
export function whatItPassesOn(runtime: ADispatchedRuntime, chosen: TheOfficesChoice): WhatItPassesOn {
  return WHAT_EACH_RUNTIME_PASSES_ON[runtime](chosen)
}

/** What `theRuntimesTheWorkerGives` hands each runtime, as a model and as an effort, to see whether it is passed on. */
const HANDED_TO_SEE_WHETHER_IT_IS_PASSED = 'a-value-the-office-hands-a-runtime-to-see-whether-it-is-passed'

/**
 * WHICH RUNTIMES THE MESSAGE WORKER PASSES A MODEL AND A REASONING EFFORT TO.
 *
 * Each runtime is handed a model and an effort, and it is given one where it passes on what it was handed.
 * The server refuses a stored choice by this answer and carries it on both run-models readings, so the
 * Settings page and an agent's profile offer what the doors take.
 *
 * THE ORDER IS FIXED: both lists keep the order of `dispatched`, which the server hands in as
 * THE_RUNTIMES_THE_OFFICE_DISPATCHES, so the first runtime offered is the same on every reading.
 */
export function theRuntimesTheWorkerGives(dispatched: readonly ADispatchedRuntime[]): TheRuntimesTheWorkerGives {
  const handed = HANDED_TO_SEE_WHETHER_IT_IS_PASSED
  const passed = dispatched.map((word) => ({ word, ...whatItPassesOn(word, { model: handed, variant: handed }) }))
  const words = (which: 'model' | 'variant'): AgentRuntime[] => passed.filter((one) => one[which] === handed).map((one) => one.word)
  return { aModelTo: words('model'), aVariantTo: words('variant') }
}
