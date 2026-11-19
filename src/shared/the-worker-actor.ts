// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ACTOR THE MESSAGE WORKER WRITES AS.
 * `THE_WORKER` was moved byte for byte out of src/server/lib/worker.ts, with no change of behaviour. That
 * file imports it back and re-exports it. `Actor` is declared in src/server/lib/records/actor.ts and handed on by
 * records.ts, so this file imports it as a type only, and nothing of src/server is loaded when this file runs.
 */

import type { Actor } from '../server/lib/records.ts'
import { THE_MESSAGE_WORKER_ID } from '@shared/participants.ts'

/** The actor the worker writes as. It is an agent, and it is never any agent's own name. */
export const THE_WORKER: Actor = { type: 'agent', id: THE_MESSAGE_WORKER_ID }
