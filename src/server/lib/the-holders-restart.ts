// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * STARTING AND RESTARTING THE TERMINAL HOLDER FROM A PAGE. Wave 13u, round 23.
 *
 * The holder (src/holder/index.mjs) is a process of its own, started detached in a process group of its own, so the
 * office's terminals keep running while the server restarts. `mole-office restart` and the stable upgrade leave it
 * running. `mole-office stop` does not: once the server has stopped, it ends the holder, and the holder's terminals end
 * with it (src/config/the-service-command.mjs). So a
 * holder started before an update keeps running the old program until somebody restarts it, and until round 23 only a
 * command in a terminal could, which the person must never be asked to type (chapter 10, rule 4). So there is now
 * a press under Tools in Settings that lists the terminals that will be ended and restarts only after a confirming press.
 *
 * WHO MAY. It is the person's act, kept on this computer, like the start press: the door asks the person first, and then
 * the person's grant, where this office's list of what the grant carries says it presses the restart, so any other
 * agent's key is refused before anything is read or stopped (src/server/api/terminals.ts). A restart under the grant is
 * written as the secretary's: the ledger row is released by it, and its note says it restarted the holder for the person
 * under their grant.
 *
 * HOW IT IS STOPPED. Only by the holder's own row in the ledger, which the server wrote when it first reached the holder
 * (`recordTheHolder` in lib/terminals.ts), through `releaseResource`: it signals the recorded process group with SIGTERM,
 * and only after it has checked that the process is the one recorded, by its start time and its group, and that the
 * group is neither init's nor this server's (chapter 2). Windows has no SIGTERM, so there the release sends the stop
 * request on the recorded group's pipe, after the group's Job Object has said that it holds the holder and does not
 * hold this server. Nothing here signals a pid it read anywhere else, and nothing sends SIGKILL: a holder that does not
 * go is reported as still running, and no new holder is started beside it.
 *
 * NO READING OF A PROCESS HOLDS THE SERVER'S THREAD on the way. Each is read by the way that waits where the probe
 * has one (Windows, where each reading is a PowerShell script of about a second), and as before elsewhere.
 *
 * WHAT THE PRESS SAW IS WHAT IS STOPPED. The confirming press sends back the holder's pid and start time and the id of
 * every terminal it listed. A different holder, or a terminal it did not list, is refused before anything is stopped. A
 * terminal that has ended or been closed since is not a reason to refuse, because nothing it did not show is ended.
 *
 * AFTERWARDS the new holder is read once more, which records it in the ledger, closes the old holder's rows, and opens
 * each agent that worked in one of the old terminals again with its runtime's resume command, telling the person in
 * one message who came back (`reconcileTheAgentsInTerminals` in lib/terminal-agents.ts).
 *
 * A RESTART THAT ENDS WITHOUT A NEW HOLDER after the signal (still running, not started, no answer, or Windows could
 * not say whose holder answered) asks about the old holder's session row at once (wave 13u round 35). Until then the
 * row said "running" until a new holder was recorded, the minute pass looked, or the server started again. It is asked
 * by the minute pass's own close
 * (`closeTheOwnRowsWhoseProcessIsGone` in lib/own-rows.ts), for that one row, so the two cannot disagree: the row is
 * closed only when its process is gone, with the pid and the time it was looked for. A holder that still runs after
 * SIGTERM, or after the stop request, keeps a row that says it runs, because it does.
 */

import { howToStart, REPO_ROOT, settingValue, settings } from '../../config/settings.mjs'
import { startATerminalHolder } from '../../config/the-terminal-holder.mjs'
import type { TerminalHolderRestartRefusalCode } from '@shared/refusal-codes.ts'
import type { TheHolderAsShown, TheHolderRestarted, TerminalReading } from '@shared/terminals.ts'
import { type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { closeTheOwnRowsWhoseProcessIsGone, theProcessesTheOwnRowsCloseReads } from './own-rows.ts'
import { liveRowsOfKey, readAProcess, readFirst, releaseResource, sleep, theGroupsOf, theRowIsAboutThisProcess } from './resources.ts'
import { aTerminalRefusal, askTheHolderFor, readFirstAndRecordTheHolder, theHolder, theOpenRowRecordingTheHolder, theHolderState, theHoldersLastWord, THE_PAGES_HOLDER_READ_MS, THE_SERVER, type HolderHello } from './terminals.ts'

/**
 * HOW LONG THE OLD HOLDER IS GIVEN TO GO after SIGTERM, or the stop request on Windows. It asks each terminal to end
 * and waits up to three seconds for
 * them (STOP_WAIT_MS in src/holder/index.mjs) before it stops listening and exits, so this is that and some to spare.
 */
const THE_OLD_HOLDER_MAY_TAKE_MS = 6_000

/** What starting a holder from a page came to, before a door says it in its own words. */
export type AHolderStarted =
  | Awaited<ReturnType<typeof startATerminalHolder>>
  | { outcome: 'turned off' }
  | { outcome: 'no way to start'; why: string }

/**
 * START A HOLDER THE ONE WAY A PAGE DOES: not when MOLE_OFFICE_TERMINAL_HOLDER is off, and otherwise as `mole-office
 * start` starts it (startATerminalHolder), detached and in a process group of its own. The start press and the restart
 * press both ask this, and each says the outcome in its own words.
 */
export async function startAHolderAsAPageDoes(): Promise<AHolderStarted> {
  // A HOLDER TURNED OFF IS NOT STARTED, by a press or by mole-office start (src/config/the-service-command.mjs).
  if (settingValue('MOLE_OFFICE_TERMINAL_HOLDER') === 'off') return { outcome: 'turned off' }
  let how: { command: string; args: string[]; environment: Record<string, string> }
  try {
    how = howToStart('holder')
  } catch (err) {
    return { outcome: 'no way to start', why: err instanceof Error ? err.message : String(err) }
  }
  return startATerminalHolder({ databasePath: settings().databasePath, how, cwd: REPO_ROOT })
}

function refused(code: TerminalHolderRestartRefusalCode, sentence: string, status: number): PanelError {
  return aTerminalRefusal(code, sentence, status)
}

/**
 * RESTART THE HOLDER the person was shown: stop it by its ledger row, wait for it to go, and start a new one. Answers
 * only when a new holder answers; every other outcome is a refusal whose sentence says where the holder was left,
 * coded except when Windows could not say whether the new holder is the one this restart started.
 */
export async function restartTheHolder(shown: TheHolderAsShown, actor: Actor): Promise<TheHolderRestarted> {
  // 1. THE HOLDER NOW, AND EVERY TERMINAL IT HOLDS. A holder that cannot be listed is not restarted, because the person
  //    could not have been shown what would be ended.
  let hello: HolderHello
  let listed: TerminalReading[]
  try {
    hello = await theHolder(THE_PAGES_HOLDER_READ_MS, 'record', 'return it')
    listed = (await askTheHolderFor({ op: 'list' }, THE_PAGES_HOLDER_READ_MS))['terminals'] as TerminalReading[]
  } catch (err) {
    if (!(err instanceof PanelError)) throw err
    throw refused('terminalHolderRestartNoHolder', `No terminal holder that the office can use is running, so nothing was stopped or started: ${err.message}`, 409)
  }

  // 2. WHAT WAS SHOWN IS WHAT RUNS NOW, or nothing is stopped.
  if (hello.pid !== shown.pid || hello.startedAt !== shown.startedAt) {
    throw refused(
      'terminalHolderRestartChanged',
      `The terminal holder now is process ${String(hello.pid)}, started at ${hello.startedAt ?? 'a time it did not say'}, and the list ` +
        `that was confirmed showed process ${String(shown.pid)}, started at ${shown.startedAt ?? 'a time it did not say'}. Nothing was stopped.`,
      409,
    )
  }
  const unshown = listed.filter((one) => !shown.terminals.includes(one.id))
  if (unshown.length > 0) {
    throw refused(
      'terminalHolderRestartChanged',
      `The terminal holder holds ${unshown.length === 1 ? 'a terminal' : 'terminals'} the confirmed list did not show: ` +
        `${unshown.map((one) => `${one.id} (${one.command})`).join(', ')}. Nothing was stopped.`,
      409,
    )
  }

  // 3. THE HOLDER'S OWN ROW IN THE LEDGER, which is the only way it is stopped.
  const workspaceId = settings().workspace
  let row
  if (hello.anotherCopy === undefined) {
    const { sessionRecordId } = await readFirstAndRecordTheHolder(hello)
    row = liveRowsOfKey({ workspaceId, type: 'process', key: String(hello.pid) }).find((one) => one.sessionRecordId === sessionRecordId)
  } else {
    row = theOpenRowRecordingTheHolder(hello) ?? undefined
  }
  if (row === undefined) {
    throw refused(
      'terminalHolderRestartNotSignalled',
      `No open row in the ledger of project "${workspaceId}" records the terminal holder, process ${String(hello.pid)}, so the office ` +
        'has no recorded process group to stop. Nothing was stopped, and no holder was started.',
      409,
    )
  }
  const running = listed.filter((one) => one.state === 'running').length
  try {
    const grant = actor.press?.underTheGrant
    const byWhom = grant === undefined ? 'the person from Settings' : `${actor.id} for the person under their grant ${grant}`
    await releaseResource(
      row.id,
      { force: true, actor, note: `restarted by ${byWhom}; ${String(running)} running terminal${running === 1 ? '' : 's'} ended with it` },
      workspaceId,
    )
  } catch (err) {
    if (!(err instanceof PanelError)) throw err
    throw refused(
      'terminalHolderRestartNotSignalled',
      `The office did not stop the terminal holder, process ${String(hello.pid)}: ${err.message} No terminal was ended, and no holder was started.`,
      409,
    )
  }

  /**
   * A refusal after the signal: the old holder's row is asked about first (the file's header says why). A refusal no
   * code fits yet has none.
   */
  const endedWithoutANewHolder = async (code: TerminalHolderRestartRefusalCode | null, sentence: string, status: number): Promise<PanelError> => {
    const now = new Date()
    await readFirst(
      () => theProcessesTheOwnRowsCloseReads({ workspaceId, now }),
      () => closeTheOwnRowsWhoseProcessIsGone({ workspaceId, actor: THE_SERVER, now, sessionIds: [row.sessionRecordId] }),
    )
    return code === null ? new PanelError(sentence, status) : refused(code, sentence, status)
  }

  // 4. THE OLD HOLDER GOES. It ends its terminals first and waits for them, so this waits longer than the release did.
  const stillThere = async (): Promise<boolean> => {
    const now = await readAProcess(hello.pid)
    return now !== null && theRowIsAboutThisProcess(row.osStartedAt, now).same !== false
  }
  const deadline = Date.now() + THE_OLD_HOLDER_MAY_TAKE_MS
  while ((await stillThere()) && Date.now() < deadline) await sleep(100)
  if (await stillThere()) {
    const later = `${String(THE_OLD_HOLDER_MAY_TAKE_MS / 1000)} seconds later`
    throw await endedWithoutANewHolder(
      'terminalHolderRestartStillRuns',
      theGroupsOf().gentleStop === null
        ? `A stop request was sent to the terminal holder's group ${String(row.pgid)}, and process ${String(hello.pid)} still ` +
            `runs ${later}. Its terminals may have ended. No new holder was started, and nothing stronger than the stop ` +
            `request was sent. Its row in the ledger, ${row.id}, was closed when it was asked.`
        : `SIGTERM was sent to the terminal holder's process group ${String(row.pgid)}, and process ${String(hello.pid)} still runs ` +
            `${later}. Its terminals may have ended. No new holder was started, and ` +
            `nothing stronger than SIGTERM was sent. Its row in the ledger, ${row.id}, was closed when it was signalled.`,
      504,
    )
  }

  // 5. ITS LAST LINE, read before a new holder writes to the same log: whether every terminal had ended.
  const itsLastWord = theHoldersLastWord().lastWord

  // 6. A NEW HOLDER, started as the start press starts one.
  const started = await startAHolderAsAPageDoes()
  const stoppedIt = `The terminal holder, process ${String(hello.pid)}, was stopped${itsLastWord === null ? '' : ` (its log says: "${itsLastWord}")`}.`
  if (started.outcome === 'turned off') {
    throw await endedWithoutANewHolder('terminalHolderRestartNotStarted', `${stoppedIt} No new holder was started, because MOLE_OFFICE_TERMINAL_HOLDER is off for this office. No terminal holder runs now.`, 502)
  }
  if (started.outcome === 'no way to start' || started.outcome === 'could-not-spawn' || started.outcome === 'ended') {
    throw await endedWithoutANewHolder('terminalHolderRestartNotStarted', `${stoppedIt} A new holder did not start: ${started.why}. No terminal holder runs now.`, 502)
  }
  if (started.outcome === 'another') {
    throw await endedWithoutANewHolder('terminalHolderRestartNotStarted', `${stoppedIt} Something else answers on the terminal holder's socket, not as the holder of this office, so no holder was started.`, 502)
  }
  if (started.outcome === 'another-copy') {
    throw await endedWithoutANewHolder('terminalHolderRestartNotStarted', `${stoppedIt} ${started.why} It was not used, and no holder was started.`, 502)
  }
  if (started.outcome === 'silent') {
    throw await endedWithoutANewHolder('terminalHolderRestartNoAnswer', `${stoppedIt} A new holder, process ${String(started.pid)}, was started and did not answer in time. It was left running.`, 504)
  }
  if (started.outcome === 'unknown') {
    throw await endedWithoutANewHolder(
      null,
      `${stoppedIt} A terminal holder, process ${String(started.pid)}, answers for this office, and Windows could not say whether the Job ` +
        `Object of group ${String(started.group)}, which this restart started, holds it: ${started.why} It was left running.`,
      502,
    )
  }

  // 7. THE HOLDER NOW, read once more: this records it and opens the agents in the old terminals again.
  return { stopped: { pid: hello.pid, startedAt: hello.startedAt }, holder: await theHolderState(), ended: running, itsLastWord }
}
