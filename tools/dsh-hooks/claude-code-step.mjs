#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PostToolUse, for a Claude Code run in a sandbox: hand over the messages that wait for it.
 *
 * The hand-over is the one dsh's PostToolUse uses (handOverUnseen in office.mjs). It gives each unseen message whole,
 * once in the session, with the preface and the groups' news, and remembers what it handed over in the scratch file. It
 * marks each message delivered and never seen. Nothing waiting is no output.
 *
 * The launcher writes this into a sandbox's Claude settings (tools/sandbox.mjs, theOfficesRunHooks), never into the
 * host's. A run the launcher did not start has no identity in its environment, and this then says so in one sentence on
 * stderr and prints nothing: the check's model, whose commands get no office variables, is such a run. Every failure
 * is one sentence on stderr with an exit code of zero, because a hook must never stop a run by failing.
 *
 * AFTER THE RUN'S FIRST STEP IT SAYS THE RUN'S TURN STARTED (sayTheTurnStartedOnce in office.mjs), once in the run, so
 * Mole Office holds what the run writes in a turn and sends it when the turn ends; the stop hook says when it ends.
 * What the run writes in its first step goes at once. The hand-over's read leaves held messages held.
 */
import { apiAddress, handOverUnseen, identity, readStdin, sayTheTurnStartedOnce } from './office.mjs'

async function main() {
  await readStdin()
  const id = identity()
  if (id === null) {
    process.stderr.write('claude-code PostToolUse: this run has no MOLE_OFFICE_AGENT, MOLE_OFFICE_SESSION and MOLE_OFFICE_WORKSPACE, so no message was attached.\n')
    return
  }
  const started = await sayTheTurnStartedOnce(apiAddress(), id, 'claude-code PostToolUse')
  if (started !== null) process.stderr.write(started)
  await handOverUnseen('PostToolUse', 'claude-code')
}
try {
  await main()
} catch (error) {
  process.stderr.write(`claude-code PostToolUse: ${error instanceof Error ? error.message : String(error)}, so no message was attached.\n`)
}
