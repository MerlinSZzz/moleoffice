// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { openCodeUsage } from './usage.ts'
/**
 * OPENCODE, AS ONE RUNTIME ADAPTER.
 *
 * The command, read from `opencode run --help` on this machine on 13 September 2026, version
 * 1.18.30:
 *
 *     opencode run --format json --dir <cwd> [-m <model>] [--variant <effort>] [--session <id>] <message>
 *
 * `--format json` prints raw JSON events rather than a formatted transcript. `--dir` is the
 * directory to run in. `--session` continues a session by its id. `-m` names a model in the form
 * `provider/model`. `--variant` names the provider's reasoning effort, for example `high`, `max` or
 * `minimal`; it exists on `run` and not at the top level. `--thinking` exists too and is not passed:
 * it only decides whether thinking blocks are shown, which changes nothing a run does.
 *
 * THE MODEL AND THE VARIANT COME FROM THE INSTALLATION'S CHORE SETTINGS, and are absent when nobody
 * named them. The adapter then passes neither flag. An empty `-m` would be this record claiming a
 * choice was made, which is the same silent non-choice criterion M85 exists to end.
 *
 * THE HEADER USED TO NAME 1.18.23, and the argv below used to pass no model at all. Both were
 * measured again on 13 September 2026: the binary here is 1.18.30, and `opencode run --help` lists
 * `-m, --model` in the form provider/model, `--agent`, `--variant` and `--thinking`. The office had
 * never started an opencode run before; the eleven session records that named opencode were
 * records an agent filed for itself while working under opencode, and none carried
 * `startedByMoleOffice`.
 *
 * THE RULES IT READS ARE `AGENTS.md` IN THE WORKING DIRECTORY, the same file Codex reads, written
 * by `src/worker/rules.ts` from the same source as Claude Code's `CLAUDE.md`.
 *
 * ITS FULL PERMISSIONS GO IN THE ENVIRONMENT, not on the command line: `OPENCODE_PERMISSION` with
 * bash, edit and webfetch allowed, which OpenCode 1.18.31 merges over every configuration file
 * (measured with `opencode debug config` on 22 September 2026; the argv above is unchanged). They are
 * given only where a decision allows them: in a sandbox, or on the host with the
 * main-world guard mounted into OpenCode. src/config/run-permissions.mjs
 * works out which. MEASURED AT THE SAME TIME, AND SAID HERE SO NOBODY READS "RESTRICTED" INTO IT:
 * OpenCode's own default already allows all three (`"*": "allow"`), so a run on the host without the
 * guard is not narrower than one with it for those three. `opencode run` rejects whatever is left
 * at `ask` (outside the project directory, a loop) unless `--auto` is passed, which it is not.
 *
 * THE MAIN-WORLD GUARD RIDES IN THE ENVIRONMENT, NOT THE ARGUMENTS. A decision says every run is given the office's
 * guard. OpenCode has no command hooks, so the guard plugin goes in `OPENCODE_CONFIG_CONTENT`
 * and the guard's command line in `MOLE_GUARD_COMMAND` (`openCodeGuard` in src/config/main-world-guard.mjs). The argv
 * above is unchanged by it. `theGuardOn` reads those two back, and that answer sets the permissions, so every run this
 * adapter builds on the host is full.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE CONVERSATION ID COMES FROM
 * ---------------------------------------------------------------------------------------
 *
 * An OpenCode session id begins with `ses_` and then runs on in letters and digits — read off this
 * machine on 4 September 2026 from the files under `~/.local/share/opencode/storage/session_diff/`,
 * which are named after the session they belong to. The first one in the event stream is this run's.
 *
 * When there is none in the stream, the answer is null and the sentence says the conversation
 * cannot be picked up again.
 *
 * THE ID IS READ WHILE THE RUN IS GOING, NOT ONLY AT ITS END. Plan hp7Z-IW9JWSX, piece H5: every
 * event OpenCode prints carries the session, and the worker reads it with `conversationSoFar` on
 * every pass and writes it on the run's record, so a run killed mid-turn keeps it. `readResult`
 * reads it with the same function.
 *
 * ---------------------------------------------------------------------------------------
 * READING THE ANSWER OUT OF THE EVENTS
 * ---------------------------------------------------------------------------------------
 *
 * The events carry the assistant's words in text parts. Every string under a `text` key on an event
 * is collected, in order, and joined. When that comes to nothing, the whole output is reported as
 * the run's words with a sentence saying no text part was found in it — the same run's output
 * either way, and the reader is told which reading they are looking at.
 */

import { choreModelIn, choreVariantIn } from '../../config/chores.mjs'
import { NOTHING_CHOSEN, type TheOfficesChoice } from '../../shared/run-models.ts'
import { HOW_EACH_COMMAND_TAKES_AN_EFFORT, whatItPassesOn } from './what-a-runtime-passes-on.ts'
import { thePermissionsARunGets } from '../../config/run-permissions.mjs'
import {
  NO_CONVERSATION_ID,
  type CommandLine,
  type RunHandle,
  type RunRequest,
  type RunResult,
  type ServedReading,
  type RuntimeAdapter,
  trimAnswer,
} from './adapter.ts'
import { endRun, firstMatch, jsonLines, nothingWasPrinted, outputOf, runIsAlive, startModelRun, withExitStatus } from './common.ts'
import { whereItIs } from './os.ts'
import { openCodeGuard, theGuardOn } from '../../config/main-world-guard.mjs'
import { theServedOfAnOpenCodeRun } from '../../config/runtime-served.mjs'
import { openCodeTokensSoFar } from '../../config/tokens-so-far.mjs'

/** What an OpenCode session id looks like. */
export const AN_OPENCODE_SESSION = /ses_[A-Za-z0-9]+/
export const THE_CHORE_VARIANT_SETTING = 'the setting MOLE_OFFICE_CHORE_VARIANT'
export const THE_OFFICES_CHOICE_WITH_ITS_MODEL = "the office's choice with its model"

/** Every string under a `text` key anywhere in these events, in the order they appear. */
export function textPartsOf(events: readonly Record<string, unknown>[]): string[] {
  const out: string[] = []
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const one of value) walk(one)
      return
    }
    if (typeof value !== 'object' || value === null) return
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'text' && typeof inner === 'string' && inner !== '') out.push(inner)
      else walk(inner)
    }
  }
  for (const event of events) walk(event)
  return out
}

export class OpenCodeAdapter implements RuntimeAdapter {
  readonly runtime = 'opencode'
  readonly command = 'opencode'
  readonly rulesFile = 'AGENTS.md' as const

  /**
   * WHICH MODEL A RUN OF THIS TOOL IS GIVEN, or absent because nobody named one. Criterion M85.
   *
   * The model the office chose for this run comes first: the agent's own, or the Settings page's
   * (criterion U2, carried on the queue row). When it chose none, the installation's chore model
   * setting, read through the environment this adapter was built with. It is an OPTIONAL PROPERTY rather than a method that always exists,
   * because the worker writes a model onto a run's record only where the adapter answers: an
   * opencode run nobody named a model for must record none, rather than a model that never reached
   * the command.
   */
  readonly modelItWouldUse?: () => string

  /**
   * The variant the office chose with its model, else this installation's chore variant. Starts read the office before
   * passing a variant.
   */
  readonly variantItWouldUse?: () => string
  private readonly defaultVariant: string | null
  /** Where the variant above came from, in the words a start names it with when the office gives no effort. */
  private readonly defaultVariantFrom: string

  constructor(
    private readonly from: NodeJS.ProcessEnv = process.env,
    chosen: TheOfficesChoice = NOTHING_CHOSEN,
  ) {
    // WHICH OF THE OFFICE'S CHOICE IT PASSES ON is `whatItPassesOn`'s answer, the one the server reads too. The model
    // and the variant below, and so the `-m` and `--variant` of `commandFor`, are read from it.
    const passed = whatItPassesOn(this.runtime, chosen)
    const model = passed.model ?? choreModelIn(from)
    if (model !== null) this.modelItWouldUse = () => model
    const variant = passed.model !== null ? passed.variant : choreVariantIn(from)
    // The chosen variant stays the fallback. No compiled start value takes its place.
    this.defaultVariant = variant
    this.defaultVariantFrom = passed.model !== null ? THE_OFFICES_CHOICE_WITH_ITS_MODEL : THE_CHORE_VARIANT_SETTING
    if (this.defaultVariant !== null) this.variantItWouldUse = () => this.defaultVariant!
  }

  whereItIs(): string | null {
    return whereItIs(this.command, this.from['PATH'])
  }

  commandFor(run: RunRequest): CommandLine {
    // `--format json` AND `--dir` ARE EXACTLY WHERE THEY WERE. The JSON events are what
    // `openCodeUsage` reads, so changing them would take the run's usage receipt with them.
    const args = ['run', '--format', 'json', '--dir', run.cwd]
    const model = this.modelItWouldUse?.()
    if (model !== undefined) args.push('-m', model)
    const variant = this.defaultVariant
    const defaultEffortAt = variant === null ? undefined : args.length
    if (variant !== null) args.push(HOW_EACH_COMMAND_TAKES_AN_EFFORT.opencode.option, variant)
    if (run.resume !== undefined && run.resume !== '') args.push('--session', run.resume)
    args.push(run.prompt)
    // THE GUARD AND THE PERMISSIONS BOTH RIDE IN THE ENVIRONMENT: the guard's plugin on every run,
    // and the permissions set by the guard as it is read off that environment.
    const guard = openCodeGuard(run.agent)
    const { env } = thePermissionsARunGets(this.runtime, this.from, theGuardOn(this.runtime, { args, env: guard }))
    return { command: this.command, args, defaultEffortAt, defaultEffortFrom: this.defaultVariantFrom, env: { ...guard, ...env } }
  }

  start(run: RunRequest): Promise<RunHandle> {
    return startModelRun(this, run, this.from)
  }

  conversationSoFar(handle: RunHandle): string | null {
    return firstMatch(outputOf(handle).said, AN_OPENCODE_SESSION)
  }

  /** The tokens of the steps finished so far, from the step_finish parts of its output, each part once. */
  tokensSoFar(handle: RunHandle): { tokens: number; read: string } | { tokens: null; why: string } {
    return openCodeTokensSoFar(outputOf(handle).said)
  }

  alive(handle: RunHandle): boolean {
    return runIsAlive(handle)
  }

  stop(handle: RunHandle, _why: string): void {
    endRun(handle)
  }

  /** The models the run's session export names (theServedOfAnOpenCodeRun), exported with this adapter's environment. */
  servedOf(handle: RunHandle): ServedReading {
    return theServedOfAnOpenCodeRun({
      session: this.conversationSoFar(handle) ?? handle.providerSession,
      command: this.whereItIs() ?? this.command,
      env: this.from,
    })
  }

  readResult(handle: RunHandle): RunResult {
    const { said, problems } = outputOf(handle)
    const usageReceipt = openCodeUsage(said)
    if (said.trim() === '') {
      return withExitStatus(handle, {
        usageReceipt,
        text: '',
        providerSession: handle.providerSession,
        endedHow: 'failed',
        because: nothingWasPrinted(this.runtime, problems),
      })
    }
    const session = this.conversationSoFar(handle) ?? handle.providerSession
    const parts = textPartsOf(jsonLines(said))
    if (parts.length === 0) {
      return withExitStatus(handle, {
        usageReceipt,
        text: said.trim(),
        providerSession: session,
        endedHow: 'failed',
        because:
          'No text part was found in what OpenCode printed, so this is its whole output. A run that ' +
          'ended before it answered looks like this.',
      })
    }
    return withExitStatus(handle, {
        usageReceipt,
      text: trimAnswer(parts.join('\n')),
      providerSession: session,
      endedHow: 'answered',
      because:
        session === null
          ? NO_CONVERSATION_ID
          : 'The answer is every text part OpenCode printed, joined, and the id is the session in those events.',
    })
  }
}
