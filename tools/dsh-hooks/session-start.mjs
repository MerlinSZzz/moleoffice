#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SessionStart: attach the messages addressed to this agent that it has not marked seen.
 *
 * The bridge runs this at `agent/session-start` and folds the `additionalContext` it prints into
 * the new session, so the agent's first request already carries the card message the office wrote
 * when it registered and anything else that arrived while nothing was answering for it. Each
 * attached message is marked delivered by the read; only the agent itself marks it seen after reading.
 *
 * NOTHING TO ATTACH IS NO OUTPUT, and every failure is one sentence on stderr with an exit code of
 * zero, because a hook must never stop a run by failing. If scratch state fails, messages are still
 * attached and may be repeated. See `office.mjs` for the door and the memory of attached ids.
 *
 * THEN IT SAYS THE RUN'S TURN STARTED, once in the run (sayTheTurnStartedOnce), so Mole Office holds what the run writes
 * in a turn and sends it when the turn ends; stop.mjs says when it ends.
 */
import { apiAddress, attachUnseen, identity, sayTheTurnStartedOnce } from './office.mjs'

try {
  await attachUnseen('SessionStart')
} catch (error) {
  process.stderr.write(
    `dsh-hooks SessionStart: ${error instanceof Error ? error.message : String(error)}, so no message was attached.\n`,
  )
}
try {
  const id = identity()
  const started = id === null ? null : await sayTheTurnStartedOnce(apiAddress(), id, 'dsh-hooks SessionStart')
  if (started !== null) process.stderr.write(started)
} catch (error) {
  process.stderr.write(
    `dsh-hooks SessionStart: ${error instanceof Error ? error.message : String(error)}, so the run's turn was not said to have started.\n`,
  )
}
