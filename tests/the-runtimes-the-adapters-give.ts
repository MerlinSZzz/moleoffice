// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH RUNTIMES THE MESSAGE WORKER GIVES A MODEL AND A REASONING EFFORT TO, AS THE ADAPTERS THEMSELVES ANSWER.
 *
 * A test asks each real adapter here rather than copy a list of runtime words. Each one is handed a model and an
 * effort, the way the worker hands it the office's choice, and a runtime gives one where its adapter says it would
 * use what it was handed. The environment is empty, so the fake runtime never answers.
 *
 * Both lists keep the order of THE_RUNTIMES_THE_OFFICE_DISPATCHES, so a test that takes the first runtime takes the
 * same one each time. No runtime given a model is a broken assumption, and it fails here in words rather than hand a
 * test an undefined runtime.
 */
import type { AgentRuntime } from '../src/shared/participants.ts'
import { THE_RUNTIMES_THE_OFFICE_DISPATCHES, adapterFor } from '../src/worker/runtimes/index.ts'

const HANDED = 'a-value-the-test-hands-the-adapter'

export function theRuntimesTheAdaptersGive(): { aModelTo: [AgentRuntime, ...AgentRuntime[]]; aVariantTo: AgentRuntime[] } {
  const asked = THE_RUNTIMES_THE_OFFICE_DISPATCHES.map((word) => {
    const adapter = adapterFor(word, {}, { model: HANDED, variant: HANDED })
    if (adapter === null) throw new Error(`No adapter serves ${word}, which the office dispatches.`)
    return { word, model: adapter.modelItWouldUse?.() === HANDED, variant: adapter.variantItWouldUse?.() === HANDED }
  })
  const [first, ...rest] = asked.filter((one) => one.model).map((one) => one.word)
  if (first === undefined) {
    throw new Error('No adapter the office dispatches passes on a model it is handed, so no test here has a runtime to set one for.')
  }
  return { aModelTo: [first, ...rest], aVariantTo: asked.filter((one) => one.variant).map((one) => one.word) }
}
