// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE THREE ADAPTERS DO THE SAME WAY.
 *
 * Starting a run, asking whether it is still going, ending it and reading its output off disk are
 * the same four acts whichever tool is being run. Only the command line and the shape of the output
 * differ, and those are what each adapter holds. This file exists so that a fifth adapter is a
 * command line and an output reader, and nothing else.
 *
 * Nothing here touches the operating system directly: `runtimes/os.ts` is the one file that does.
 */

import { readFileSync } from 'node:fs'
import { aCommandsStartValues, aCommandsStartFromTheOffice } from '../../config/sandbox-start-values.mjs'
import { THE_COMPACTION_VARIABLE, theCompactionWindowGiven, theConversationsWindow } from '../../config/the-compaction-window.mjs'
import { anAgentsToolHeaders } from '../../../for-agents/agent-key.mjs'

import { clockStamp } from '@shared/time.ts'

import type { TheRowAMessageRunKeeps } from '../../shared/run-models.ts'
import type { CommandLine, RunHandle, RunResult, RunStart } from './adapter.ts'
import { envFor } from './adapter.ts'
import { endGroupAsGentlyAsItCan, exitCodePathOf, problemPathOf, startInItsOwnGroup, stillTheProcessThatStarted, whereItIs } from './os.ts'

export const A_SOURCE_THE_ADAPTER_DID_NOT_NAME = 'a source the adapter did not name'

/** The words a start's end gains when the office's effort replaced a default variant. */
export function theVariantNotUsedWords(variant: string, source: string | undefined): string {
  return `. The variant ${variant} from ${source ?? A_SOURCE_THE_ADAPTER_DID_NOT_NAME} was not used`
}

/**
 * Start one run of `adapter`, in its own process group, with its output going to a file.
 *
 * It asks of the adapter only its runtime word and the command line it would run, so the office's
 * merge tool — which is not an agent runtime and takes no prompt — starts the same way every run does.
 */
/** Native model starts read the office asynchronously. Other process starts keep their existing path. */
export async function startModelRun<R extends RunStart & { agent: string; session: string; recordEffort?: (effort: string) => Promise<void>; kept?: TheRowAMessageRunKeeps }>(
  adapter: { readonly runtime: string; commandFor(run: R): CommandLine }, run: R, from: NodeJS.ProcessEnv,
): Promise<RunHandle> {
  const asked = adapter.commandFor(run)
  const actualEnv = envFor(run, from, asked.env, adapter.runtime)
  const args = asked.defaultEffortAt === undefined ? asked.args : [...asked.args.slice(0, asked.defaultEffortAt), ...asked.args.slice(asked.defaultEffortAt + 2)]
  // WHEN A CLAUDE CODE CONVERSATION STARTED HERE COMPACTS: MOLE_OFFICE_CLAUDE_COMPACTS_AT_ON_THE_HOST, read at every start
  // (src/config/the-compaction-window.mjs). In a sandbox it keeps the sandbox's window. Codex and OpenCode are given nothing.
  const window = adapter.runtime === 'claude-code' ? theConversationsWindow(from) : null
  const asks = await aCommandsStartFromTheOffice([asked.command, ...args], {
    api: run.api, agent: run.agent, workspace: run.workspace, runtime: adapter.runtime, place: 'conversation',
    env: window === null ? actualEnv : { ...actualEnv, [THE_COMPACTION_VARIABLE]: window.tokens },
    ...(window === null ? {} : { envFrom: { [THE_COMPACTION_VARIABLE]: window.from } }),
    headers: anAgentsToolHeaders({ self: run.agent, withoutAKey: run.agent, key: run.key ?? null }),
    ...(run.kept === undefined ? {} : { castingRow: run.kept.row }),
  })
  const given = window === null ? asks : theCompactionWindowGiven(asks, window)
  // A CODEX RUN THAT ANSWERS A MESSAGE NEVER STARTS ON CODEX'S OWN CONFIGURATION. The office names its model, or its
  // Casting row gives one; when neither reached the command, it is refused here rather than started on a guess.
  if (adapter.runtime === 'codex' && given.start?.model == null) {
    throw new Error(
      'No model was named for this Codex run that answers a message, so it is not started on Codex\'s own configuration. ' +
        "Name one on the agent's profile, or fill in its Casting row on the Casting page." +
        (given.start?.officeUnavailable === true ? ' The office could not be asked.' : '') +
        ' Nothing was started.',
    )
  }
  // With no model and no office effort, another runtime keeps its existing default, as before. The start's words name
  // the default and where it came from, because no launcher start says it.
  let putBack: string | undefined
  if (given.start === null && asked.defaultEffortAt !== undefined) {
    given.command = [asked.command, ...asked.args]
    putBack = `no model named and no effort from the office; variant ${asked.args[asked.defaultEffortAt + 1]!} from ${asked.defaultEffortFrom ?? A_SOURCE_THE_ADAPTER_DID_NOT_NAME}`
  }
  // A DEFAULT VARIANT THE OFFICE'S EFFORT REPLACED IS SAID, NEVER DROPPED IN SILENCE. The start words go to the
  // worker's log and onto the handle, so the sentence is where a person looking at a run that started elsewhere finds it.
  if (given.start !== null && asked.defaultEffortAt !== undefined) {
    const variant = asked.args[asked.defaultEffortAt + 1]!
    if (given.start.effort !== variant) {
      given.start = {
        ...given.start,
        words: `${given.start.words}${theVariantNotUsedWords(variant, asked.defaultEffortFrom)}`,
      }
    }
  }
  // THE CASTING ROW THE QUEUE READ IS SAID WHERE THE OFFICE DID NOT READ IT AGAIN: an office given none read the Casting
  // table as it is now, and an office that could not be asked read no row again. The words go to the log and the run.
  const notAsked = given.start?.officeUnavailable ?? ('effortAnswer' in given && given.effortAnswer.unavailable)
  const unread = run.kept === undefined
    ? notAsked ? null : 'No Casting row was kept for this start when it was asked, so it reads the Casting table as it is now'
    : run.kept.row !== null && notAsked
      ? `The office could not be asked, so Casting row ${String(run.kept.row.id)}, which the queue read for this message run, was not read again, and the run starts on the owner's rule`
      : null
  if (unread !== null) {
    if (given.start !== null) given.start = { ...given.start, words: `${given.start.words}. ${unread}` }
    else if (putBack !== undefined) putBack = `${putBack}. ${unread}`
    else console.error(`${unread}.`)
  }
  if (given.start?.effort != null && !given.start.officeUnavailable) await run.recordEffort?.(given.start.effort)
  const handle = startRun({ runtime: adapter.runtime, commandFor: () => asked }, run, from, given)
  if (putBack === undefined) return handle
  console.error(`The run started with ${putBack}.`)
  return { ...handle, startWords: putBack }
}

export function startRun<R extends RunStart>(
  adapter: { readonly runtime: string; commandFor(run: R): CommandLine },
  run: R,
  from: NodeJS.ProcessEnv,
  selected?: Awaited<ReturnType<typeof aCommandsStartFromTheOffice>>,
): RunHandle {
  const asked = adapter.commandFor(run)
  const actualEnv = envFor(run, from, asked.env, adapter.runtime)
  const given = selected ?? aCommandsStartValues([asked.command, ...asked.args], { runtime: adapter.runtime, env: actualEnv })
  const [command, ...args] = given.command as [string, ...string[]]
  const where = whereItIs(command, from['PATH'])
  if (where === null) {
    throw new Error(
      `${command} is not installed on this machine, so a run of ${adapter.runtime} cannot be started. ` +
        'Nothing was started and no message was marked delivered.',
    )
  }
  const started = startInItsOwnGroup({
    command: where,
    args,
    cwd: run.cwd,
    env: { ...actualEnv, ...given.env },
    outputPath: run.outputPath,
    stdin: asked.stdin,
  })
  const startedTime = clockStamp()
  if (given.start !== null) console.error(`The launcher started ${given.start.model === null ? '' : `model ${given.start.model}; `}${given.start.words}.`)
  return {
    runtime: adapter.runtime,
    ...(given.start === null ? {} : { effort: given.start.effort, effortFrom: given.start.effortFrom, ruleEffort: given.start.ruleEffort, startWords: given.start.words, start: given.start }),
    pid: started.pid,
    pgid: started.pgid,
    startedAt: startedTime.stamp,
    startedTime,
    providerSession: run.resume ?? null,
    resumed: run.resume !== undefined && run.resume !== '' ? run.resume : null,
    ...(run.continues === undefined || run.resume === undefined || run.resume === '' ? {} : { continues: run.continues }),
    outputPath: run.outputPath,
    exitCodePath: started.exitCodePath,
    cwd: run.cwd,
  }
}

/**
 * Is this run still going? Its pid is running, and it is the process that started when the handle
 * says. The worker's own stamp, to the millisecond, when the handle carries one; otherwise the
 * handle's `startedAt`, which for a run picked up is the ledger's reading of the process's start.
 */
export function runIsAlive(handle: RunHandle): boolean {
  return stillTheProcessThatStarted(handle.pid, handle.startedTime?.instant ?? handle.startedAt)
}

/**
 * End this run, and everything it started, by the group id written down when it started.
 *
 * Answers false when there was nothing left to end. That is not a failure: a run that has already
 * finished is exactly what a caller stopping it wanted. Linux and the Mac ask the group to stop with
 * SIGTERM. Windows has no gentle stop, so there the group is ended at once: the sentence that says so
 * goes on the handle's `endedAtOnce` and into the worker's log, and `withHowItWasEnded` adds it to
 * what the run's record says.
 */
export function endRun(handle: RunHandle): boolean {
  const how = endGroupAsGentlyAsItCan(handle.pgid)
  if (how.atOnce !== null) {
    handle.endedAtOnce = how.atOnce
    console.error(how.atOnce)
  }
  return how.ended
}

/** What a run's record says about how it ended, with the sentence of an end at once when a stop gave one. */
export function withHowItWasEnded(words: string, handle: RunHandle): string {
  return handle.endedAtOnce === undefined ? words : `${words} ${handle.endedAtOnce}`
}

/** What a run has written so far: what it printed, and what it complained about. */
export function outputOf(handle: RunHandle): { said: string; problems: string } {
  return { said: readFileOrEmpty(handle.outputPath), problems: readFileOrEmpty(problemPathOf(handle.outputPath)) }
}

/** The process code, or null because it is missing, malformed or represents a signal rather than an exit. */
export function exitCodeOf(handle: RunHandle): number | null {
  const path = handle.exitCodePath ?? exitCodePathOf(handle.outputPath)
  const text = readFileOrEmpty(path).trim()
  if (!/^(0|[1-9]\d*)$/.test(text)) return null
  const code = Number(text)
  return Number.isSafeInteger(code) && code <= 255 ? code : null
}

/**
 * A RUN'S EXIT CODE DECIDES WHETHER ITS OUTPUT IS AN ANSWER. Problem dCsNFBSUatCe: a tool that printed a refusal where its
 * answer goes and exited non-zero was filed as finished, and its refusal shown as the agent's reply.
 *
 * A recorded zero lets the adapter's reading stand; any other recorded code makes it a failure. An UNKNOWN code (the
 * worker that started the run restarted before it ended, so nothing saw it exit) is not a zero: the output is refused as
 * an answer, UNLESS the tool marks a refusal in its own output (`refusalsAreMarked`: Claude Code's `is_error` in its one
 * JSON object, Kimi CLI's final message, which a refusal is not). Then the adapter has already told a refusal from an
 * answer, and a reply is not lost only because a worker restarted.
 */
export function withExitStatus(handle: RunHandle, result: RunResult, how: { refusalsAreMarked?: boolean } = {}): RunResult {
  const code = exitCodeOf(handle)
  if (code === 0) return result
  if (code === null && (result.endedHow !== 'answered' || how.refusalsAreMarked === true)) return result
  const why =
    code === null
      ? `The ${handle.runtime} run has no recorded exit code, so its output was not accepted as an answer.`
      : `The ${handle.runtime} run exited with code ${code}, so its output was not accepted as an answer.`
  return {
    ...result,
    endedHow: 'failed',
    because: `${why} ${result.because}`,
  }
}

/** A file's text, or an empty string because it is not there. */
export function readFileOrEmpty(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    // A run that never wrote a byte leaves no file. That is nothing there, and the caller says so.
    return ''
  }
}

/**
 * The first thing in this text that looks like the given kind of id, or null because there is none.
 *
 * Used by the Codex and OpenCode adapters, whose output is a stream of events rather than one
 * object. It is a search and it is described as one: a run whose output holds no id gets null and a
 * sentence saying the conversation cannot be picked up again, never a made-up id.
 */
export function firstMatch(text: string, pattern: RegExp): string | null {
  const found = text.match(pattern)
  return found === null ? null : found[0]
}

/** A version-4 or version-7 style identifier, which is what Claude Code and Codex both use. */
export const A_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/

/** Every line of a stream of JSON events that parses, in order. The rule is src/config/usage.mjs's, so the launcher reads by it too. */
export { jsonLines } from '../../config/usage.mjs'

/** How a run that printed nothing is reported, so an empty answer is never read as a silent one. */
export function nothingWasPrinted(runtime: string, problems: string): string {
  const said = problems.trim() === '' ? 'It printed nothing on the problem channel either.' : problems.trim().slice(0, 600)
  return `The ${runtime} run printed nothing where its answer should be. ${said}`
}
