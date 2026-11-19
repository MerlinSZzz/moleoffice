// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `setAnAgentsRunModel` was moved byte for byte out of src/server/lib/run-models.ts, with no change of behaviour.
 * It writes through records.ts, which is in the runtime cycle. With it here, run-models.ts no longer reaches the
 * cycle, so that file does not re-export it, and src/server/api/run-models.ts imports it from here.
 */

import { whyAnAgentsModelIsRefused, type AnAgentsRunModel } from '@shared/run-models.ts'
import { theModelOnTheAgentRecord } from '../db/the-model-on-the-agent-record.ts'
import { PanelError } from './panel-error.ts'
import { nothingWrittenSentence } from './records/patching.ts'
import { patchRecord, type Actor } from './records.ts'
import { THE_WORKER_GIVES, anAgentsRunModel } from './run-models.ts'

/**
 * SET OR CLEAR ONE AGENT'S OWN MODEL, on its record beside its runtime. `agentId` is a registry id.
 *
 * `model` null clears the model and the reasoning effort together, because the effort means
 * nothing without the model it goes with.
 */
export function setAnAgentsRunModel(
  agentId: string,
  change: { model: string | null; variant?: string | null },
  actor: Actor,
): AnAgentsRunModel & { nothingWritten?: string } {
  const own = theModelOnTheAgentRecord(agentId)
  if (own === null) throw new PanelError(`Agent ${agentId} has no agent record, so there is nowhere to keep its model. Nothing was written.`, 404)
  // A CLEAR CLEARS EVERY RECORD OF THE AGENT THAT NAMES ONE, so an older project's model does not come back as its own.
  if (change.model === null) {
    if (own.holding.length === 0) return { ...anAgentsRunModel(agentId), nothingWritten: nothingWrittenSentence({ kind: 'nothing-to-clear' }) }
    const writes = own.holding.map((record) => patchRecord(record, { dataPatch: { model: null, variant: null } }, actor))
    return { ...anAgentsRunModel(agentId), ...(writes.every((one) => one.nothingWritten !== undefined) ? { nothingWritten: nothingWrittenSentence({ kind: 'already-stored' }) } : {}) }
  }
  const model = change.model.trim()
  const variant = change.variant === undefined || change.variant === null || change.variant.trim() === '' ? null : change.variant.trim()
  const refused = whyAnAgentsModelIsRefused(own.runtime, model, variant, THE_WORKER_GIVES)
  if (refused !== null) throw new PanelError(refused, 400)
  const written = patchRecord(own.record, { dataPatch: { model, variant } }, actor)
  return { ...anAgentsRunModel(agentId), ...(written.nothingWritten === undefined ? {} : { nothingWritten: nothingWrittenSentence({ kind: 'already-stored' }) }) }
}
