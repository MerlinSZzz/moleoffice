// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TYPES THE DATABASE LAYER READS, FROM src/server/lib/agents.ts. They are declared here, as they were there, so
 * that src/server/db imports nothing from src/server/lib for them. That file re-exports them, so its importers are
 * unchanged. RUN_STATES is a value: it comes too, because RunState is made from it.
 */

/**
 * `withdrawn` IS A RUN THE OFFICE TOOK BACK BEFORE ANY WORKER TOOK IT, so nothing was tried. Only the data half of
 * migration 0253 writes it (src/server/db/withdraw-review-runs-migration.ts): the runs a sent review wrote before a sent
 * review stopped starting runs (wave 13u round 19). It is not `failed`, which would say something was tried.
 */
export const RUN_STATES = ['queued', 'claimed', 'running', 'finished', 'failed', 'crashed', 'declined', 'withdrawn'] as const

export type RunState = (typeof RUN_STATES)[number]
