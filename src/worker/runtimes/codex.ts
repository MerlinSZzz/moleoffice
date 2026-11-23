// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { codexUsage, theRoundsOwnCodexUsage } from './usage.ts'
/**
 * CODEX, AS ONE RUNTIME ADAPTER.
 *
 * The command, read from `codex exec --help` and `codex exec resume --help` on this machine on
 * 4 September 2026, version 0.147.0:
 *
 *     codex exec --json -o <file> -C <cwd> --skip-git-repo-check -- -
 *     codex exec resume <id> --json -o <file> --skip-git-repo-check -- -
 *
 * The last word is `-`, which tells Codex to read its prompt on standard input. A word of a command line may be at
 * most 128 KB on Linux, so a longer prompt could not start there at all, and every prompt word could be read in the
 * process list. The prompt itself is given as the command line's `stdin` text.
 *
 * `--json` prints its events to standard output as one JSON object per line. `-o` writes the
 * agent's last message to a file, which is the answer without any event parsing at all. `-C` is the
 * working root, and `codex exec resume` takes the working root from the session it is resuming, so
 * it is not passed there.
 *
 * `--skip-git-repo-check` is passed because a run may work in a directory that is a worktree of the
 * checkout rather than the checkout itself, and Codex otherwise refuses to start outside a
 * repository it recognises. It grants the run no powers; the sandbox is untouched.
 *
 * THE RULES IT READS ARE `AGENTS.md` IN THE WORKING DIRECTORY. `src/worker/rules.ts` writes that
 * file from the same source Claude Code's `CLAUDE.md` comes from.
 *
 * ITS FULL PERMISSIONS ARE `-s danger-full-access -a never`, BEFORE `exec`, and only where the owner
 * decided: in a sandbox, or on the host with the main-world guard mounted
 * into Codex. src/config/run-permissions.mjs works out which, and holds the
 * words. Measured with 0.155.1 on 22 September 2026: `codex exec` has `-s` and no `-a`, and
 * `codex exec resume` has neither, so both go before `exec`, where they reach a new run and a resumed
 * one alike. Without them a new run is `sandbox: read-only` and a resumed one `workspace-write`, both
 * with `approval: never`: that is Codex's own default, and what a run on the host without the guard
 * keeps.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE CONVERSATION ID COMES FROM
 * ---------------------------------------------------------------------------------------
 *
 * Out of the event stream, where it is a UUID. Codex also writes a session file of its own at
 * `$CODEX_HOME/sessions/<year>/<month>/<day>/rollout-<time>-<id>.jsonl` whose first line is a
 * `session_meta` object holding the same id and the working directory — verified by reading one on
 * this machine on 4 September 2026. That file is not read here: one reading is enough, and a second
 * one that could disagree with the first is the defect CLAUDE.md names as this codebase's own.
 *
 * When the stream holds no id, the answer is null and the sentence says the conversation cannot be
 * picked up again. It is never a guess.
 *
 * THE ID IS READ WHILE THE RUN IS GOING, NOT ONLY AT ITS END. Plan hp7Z-IW9JWSX, piece H5: Codex's
 * first event names the conversation, and the worker reads it with `conversationSoFar` on every
 * pass and writes it on the run's record, so a run killed mid-turn keeps it. `readResult` reads it
 * with the same function.
 *
 * ---------------------------------------------------------------------------------------
 * THE MAIN-WORLD GUARD
 * ---------------------------------------------------------------------------------------
 *
 * A decision says every run is given the office guard as a PreToolUse hook. It is given with
 * `-c hooks.PreToolUse=[…]` and `--dangerously-bypass-hook-trust` (`codexGuard` in src/config/main-world-guard.mjs).
 * The second flag does not widen what the run may do: it tells Codex to run a hook nobody reviewed in Codex's own
 * interface, which this one is, because the office wrote it. Measured on Codex 0.155.1: a shell command reaches the
 * hook as tool `Bash` and a patch as `apply_patch`, and exit 2 stops either.
 *
 * ITS PROGRAM IS LOOKED UP IN THE WHOLE ENVIRONMENT IT WAS GIVEN, through `whereItIs` in ./os.ts, so on Windows a
 * search path held as `Path` is found.
 */

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
import { A_UUID, endRun, firstMatch, nothingWasPrinted, outputOf, readFileOrEmpty, runIsAlive, startModelRun, withExitStatus } from './common.ts'
import { whereItIs } from './os.ts'
import { codexGuard, theGuardOn } from '../../config/main-world-guard.mjs'
import { CODEX_SHELL_SNAPSHOT_OFF, thePermissionsARunGets } from '../../config/run-permissions.mjs'
import { theServedOfACodexRun } from '../../config/runtime-served.mjs'
import { theOutputOfTheRunItContinues } from '../../config/the-run-it-continues.mjs'
import { NOTHING_CHOSEN, type TheOfficesChoice } from '../../shared/run-models.ts'
import { whatItPassesOn } from './what-a-runtime-passes-on.ts'
import { codexTokensSoFar } from '../../config/tokens-so-far.mjs'

/** Where Codex is asked to write the agent's last message, given where its events go. */
export function lastMessagePathOf(outputPath: string): string {
  return `${outputPath}.answer`
}

export class CodexAdapter implements RuntimeAdapter {
  readonly runtime = 'codex'
  readonly command = 'codex'
  readonly rulesFile = 'AGENTS.md' as const

  /**
   * The model the office chose for this run: the agent's own, the Settings page's, or the agent's Casting row in force
   * (src/server/lib/run-models.ts). It is passed as `-m`, and the shared launcher puts the row's native model and effort
   * in its place. When the office chose none it is absent, and the run is refused before it starts (startModelRun), so a
   * run never falls back to Codex's own configuration in silence. Which of the office's choice Codex passes on is
   * `whatItPassesOn`'s answer, the one the server reads too.
   */
  readonly modelItWouldUse?: () => string

  constructor(
    private readonly from: NodeJS.ProcessEnv = process.env,
    chosen: TheOfficesChoice = NOTHING_CHOSEN,
  ) {
    const model = whatItPassesOn(this.runtime, chosen).model
    if (model !== null) this.modelItWouldUse = () => model
  }

  whereItIs(): string | null {
    return whereItIs(this.command, this.from)
  }

  commandFor(run: RunRequest): CommandLine {
    const answer = lastMessagePathOf(run.outputPath)
    // `-m` FOLLOWS `exec` AND COMES BEFORE `resume`, where Codex takes it for a new run and a resumed one alike.
    const model = this.modelItWouldUse?.()
    // THE SHELL SNAPSHOT IS OFF, right after `exec` where it was measured: this run's environment holds its key.
    const exec = ['exec', ...CODEX_SHELL_SNAPSHOT_OFF, ...(model === undefined ? [] : ['-m', model])]
    const rest =
      run.resume !== undefined && run.resume !== ''
        ? [...exec, 'resume', run.resume, '--json', '-o', answer, '--skip-git-repo-check', ...codexGuard(run.agent), '--', '-']
        : [...exec, '--json', '-o', answer, '-C', run.cwd, '--skip-git-repo-check', ...codexGuard(run.agent), '--', '-']
    // BEFORE `exec`, the one place Codex takes them for a new run and a resumed one alike. They are
    // set by the guard as it is read off the rest of this very command.
    const permissions = thePermissionsARunGets(this.runtime, this.from, theGuardOn(this.runtime, { args: rest }))
    return { command: this.command, args: [...permissions.args, ...rest], stdin: run.prompt }
  }

  start(run: RunRequest): Promise<RunHandle> {
    return startModelRun(this, run, this.from)
  }

  conversationSoFar(handle: RunHandle): string | null {
    return firstMatch(outputOf(handle).said, A_UUID)
  }

  /** The tokens of the turns completed so far, from the receipt readResult reads, so a resumed run counts its own part only. */
  tokensSoFar(handle: RunHandle): { tokens: number; read: string } | { tokens: null; why: string } {
    return codexTokensSoFar(this.readResult(handle).usageReceipt)
  }

  alive(handle: RunHandle): boolean {
    return runIsAlive(handle)
  }

  stop(handle: RunHandle, _why: string): void {
    endRun(handle)
  }

  /** The models the rollout of the run's thread says its turns ran with (theServedOfACodexRun). */
  servedOf(handle: RunHandle): ServedReading {
    return theServedOfACodexRun({ thread: this.conversationSoFar(handle) ?? handle.providerSession, env: this.from, sinceMs: Date.parse(handle.startedTime?.instant ?? handle.startedAt.replace(' ', 'T')) })
  }

  readResult(handle: RunHandle): RunResult {
    const { said, problems } = outputOf(handle)
    // A RESUMED THREAD REPORTS ITS TOTAL SO FAR (wave 13s round 42), so a resumed run's own part is that less the total
    // the run it continues reported at its end (round 43). When the worker was not told which run that is, or its output
    // cannot be read, the receipt gives the figures in words as the thread's, and none as the run's own.
    const resumed = handle.resumed ?? null
    const previous = resumed === null ? null : handle.continues === undefined ? { thread: resumed } : theOutputOfTheRunItContinues(handle.continues.run, handle.continues.outputPath)
    const usageReceipt = previous === null ? codexUsage(said) : theRoundsOwnCodexUsage(said, previous, null)
    const answer = trimAnswer(readFileOrEmpty(lastMessagePathOf(handle.outputPath)))
    const session = this.conversationSoFar(handle) ?? handle.providerSession
    if (answer !== '') {
      return withExitStatus(handle, {
        usageReceipt,
        text: answer,
        providerSession: session,
        endedHow: 'answered',
        because:
          session === null
            ? NO_CONVERSATION_ID
            : 'The answer is the file Codex was asked to write its last message to, and the id came out of its events.',
      })
    }
    if (said.trim() === '') {
      return withExitStatus(handle, {
        usageReceipt,
        text: '',
        providerSession: session,
        endedHow: 'failed',
        because: nothingWasPrinted(this.runtime, problems),
      })
    }
    // IT PRINTED EVENTS AND NO LAST MESSAGE. The events are what it said, so they are what is
    // reported, with a sentence saying the answer file was empty.
    return withExitStatus(handle, {
        usageReceipt,
      text: said.trim(),
      providerSession: session,
      endedHow: 'failed',
      because:
        'Codex wrote no last message, so this is its event stream instead. A run that ended before it ' +
        'answered looks like this.',
    })
  }
}
