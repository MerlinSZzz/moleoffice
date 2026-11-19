#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Stop, for a Claude Code run in a sandbox: hold the stop by the same rules dsh's stop hook follows (whatHoldsTheStop
 * in office.mjs; message ro57jzXSPCR3), for problem UbG6k-7jGLa5.
 *
 * On 29 September 2026 wave 13k's round 15 supervisor under claude -p ended its turn while its workers and a subagent
 * ran, and was ended ten minutes later with them: claude -p waits only 600 seconds for background work after a turn
 * ends. A blocked Stop is Claude Code's own way to go on with a reason, and it works under claude -p. A supervisor is
 * held for an unseen message or a worker it started that still runs; any agent is held while its own run still runs
 * unsealed; the same sight at most HOLDS_IN_A_ROW times in a row, and the stop the cap lets go says so on stderr.
 *
 * IT READS WITH THE RUN'S OWN KEY (problem RJradfGfKxlq). Claude Code runs this hook in its own environment, which holds
 * no MOLE_AGENT_KEY unless the run starts runs, and since the key window closed the office refuses every read under an
 * agent's name with no key; theHeaders in office.mjs takes the key from the run's office tool configuration. A read
 * that fails no longer lets a supervisor go by itself: its own run still running holds it (whatHoldsTheStop).
 *
 * It writes nothing about what served the run: for a Claude Code run the launcher reads that when its command ends
 * (tools/sandbox-start.mjs, theServedIsWritten), and dsh's stop hook writes it only for dsh. A run with no identity in
 * its environment, such as the check's model, is let stop with one sentence on stderr. A failure that leaves nothing
 * to hold for lets it stop, with one sentence on stderr, and the exit code is always zero.
 *
 * FIRST IT SAYS THE RUN'S TURN ENDED, when the run has said it reports its turns (the step hook says so once), so the
 * messages it held in this turn go now, whether or not the stop is then held.
 */
import { apiAddress, holdOrLetGo, identity, readStdin, sayTheTurn, theCapLetItGo, theRunReportsItsTurns, whatHoldsTheStop } from './office.mjs'

async function main() {
  await readStdin()
  const id = identity()
  if (id === null) {
    process.stderr.write('claude-code Stop: this run has no MOLE_OFFICE_AGENT, MOLE_OFFICE_SESSION and MOLE_OFFICE_WORKSPACE, so the stop was allowed.\n')
    return
  }
  if (theRunReportsItsTurns(id)) {
    const ended = await sayTheTurn(apiAddress(), id, 'ended', 'claude-code Stop')
    if (ended !== null) process.stderr.write(ended)
  }
  const decided = await whatHoldsTheStop(apiAddress(), id, 'claude-code Stop')
  if (decided.couldNotTell !== undefined) {
    process.stderr.write(decided.couldNotTell)
    return
  }
  if (decided.hold !== null && !holdOrLetGo(id, decided.hold)) process.stderr.write(theCapLetItGo('claude-code Stop', decided.hold))
}
try {
  await main()
} catch (error) {
  process.stderr.write(`claude-code Stop: ${error instanceof Error ? error.message : String(error)}, so the stop was allowed.\n`)
}
