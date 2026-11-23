// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SANDBOX LAUNCHER'S ROUND COMMAND, AS THE MESSAGE WORKER STARTS IT FOR A NEXT ROUND. Wave 13j round loop-2
 * (src/server/lib/next-round.ts says what the door checks). Claude Code cannot be started from inside a sandbox, so
 * the office on the host starts the round with the launcher every person and supervisor already uses.
 *
 * IT RUNS NO MODEL AND SERVES NO AGENT, as the merge tool's run does not (runtimes/merge.ts). It is the worker's own
 * run, filed with `startedByMoleOffice`, and the launcher files the agent's run as a child of it.
 *
 * THE COMMAND LINE:
 *
 *     node <checkout>/tools/sandbox.mjs round <instance> --sandboxes <folder> --agent <handle> --brief <file>
 *          --model <model> --runtime <runtime> --as mole-office/the-message-worker --session <this run>
 *          --api <the office's address> --workspace <project id>
 *
 * A REPAIR ROUND receives --worktree and --cut-from together: a new directory and a verified landed main commit.
 * A round after a git seal also receives --at for its released tip, while retaining the previous cutFrom. A round
 * without a git seal works in its previous directory.
 *
 * A WORKER RUN A SUPERVISOR ASKED FOR (wave 13j round loop-3, src/server/lib/worker-runs.ts) is started the same way,
 * with `worker` for `round` and `--parent <the supervisor's run>` after `--session`. The launcher files the worker's
 * run as a child of the supervisor's run, so the worker's end wakes the supervisor, and the office mints its key there.
 * A dsh or OpenCode worker the supervisor chose is started with `exec` for `worker`, because `worker` takes claude-code
 * and codex only, and with `--worktree <sandbox>/worktrees/<worker>` after `--runtime`, so it runs in its own worktree
 * as `worker` makes one for the others. When that worktree is not there yet, either command is given `--cut-from <the
 * commit the ask chose>` after `--worktree`, so the launcher makes it at that commit; a worktree that is there is used
 * as it stands, with no `--cut-from` (wave 13j, the round after loop-10). When the ask named one of the sandbox's
 * clones, `--clone <name>` comes before `--cut-from`, so the launcher makes the worktree from that clone (the clone round).
 * A worker whose ask named paths (`paths`, src/server/lib/worker-runs.ts) is given `--with-path <path>` for each after
 * those, worker and exec alike, so the launcher checks them out in its worktree even when the sandbox's template leaves
 * them out of a worker's (wave 13q round 53). A round takes none.
 * A codex worker whose ask named images (`images`) is given `--image <path>` for each after those, so the launcher gives
 * codex exec each file of its worktree as -i. exec and a round take none.
 * A worker, or a next round, on a Casting row with native selection data is given `--selection <the selection as JSON>`
 * after those, as the starting door answered it, and the launcher asks the office for it again before it starts (wave
 * 13n rounds BQ and BT).
 * For OpenCode, the message worker reads the brief the door checked and gives
 * `-- opencode run --format json <the brief's text>` after the launcher options, with the text as one argument. A dsh
 * worker is given no command, because the sandbox has one of its own for it.
 *
 * THE MODEL IS THE OFFICE'S ANSWER, from the run-models door and the Casting row, given back by the starting door.
 * THE COMMAND LINE NAMES NO EFFORT: the launcher asks the office for it itself, with the runtime and the model above,
 * and passes the effort it is answered where the program can take one. Any effort it passes is written on the run it
 * starts. The starting door records the office's answer to that same question (`theEffortTheLauncherIsAnswered` in
 * src/server/lib/next-round.ts).
 *
 * ITS KEY IS THE OFFICE'S, as the message worker's own requests are. It goes in as `MOLE_AGENT_KEY` through `envFor`
 * and the launcher sends it under `--as`, the message worker's own name. The launcher puts no key of its caller into a
 * sandbox (tools/sandbox.mjs, its header); the round's run gets a key of its own, minted when the launcher files it.
 *
 * FROM A STABLE OFFICE IT IS GIVEN THE PAIRING as well (`envFor`), so the launcher's settings, and the commit address it
 * hands the round, are the development checkout's. What it starts on the host is docker, the devcontainer tool, git and
 * this checkout's own tools. Into a sandbox it passes only the variables it names, and this is not one of them.
 *
 * A TEST RUNS A SYNTHETIC LAUNCHER INSTEAD, named by `MOLE_OFFICE_FAKE_ROUND_LAUNCHER`, and never a real round.
 *
 * ITS PROGRAM IS LOOKED UP IN THE WHOLE ENVIRONMENT IT WAS GIVEN, through `whereItIs` in ./os.ts, so on Windows a
 * search path held as `Path` is found.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { CastingSelection } from '@shared/casting.ts'
import { ROUND_LAUNCHER_RUNTIME } from '@shared/next-round.ts'
import { THE_MESSAGE_WORKER_ID } from '@shared/participants.ts'

import { settingNamed } from '../../config/settings.mjs'
import type { UsageReceipt } from '../../shared/usage-receipts.ts'
import type { RunHandle, RunStart } from './adapter.ts'
import { endRun, exitCodeOf, outputOf, runIsAlive, startRun } from './common.ts'
import { whereItIs } from './os.ts'

/** The setting that names a synthetic launcher for the test suite, through the declaration in src/config/settings.mjs. */
export const FAKE_ROUND_LAUNCHER_SETTING = settingNamed('MOLE_OFFICE_FAKE_ROUND_LAUNCHER').name

/** The launcher, in a checkout. */
export const THE_ROUND_LAUNCHER = 'tools/sandbox.mjs'

/** Who the launcher says it is: the message worker, whose key it holds. */
export const THE_LAUNCHER_ASKS_AS = THE_MESSAGE_WORKER_ID

/** The refusal of a round given a new worktree without its cut, or a cut without its worktree. */
export const A_FRESH_ROUND_NEEDS_BOTH = 'A fresh round needs both its new worktree and exact cutFrom.'
export const A_ROUND_TIP_NEEDS_A_WORKTREE = "A round's tip needs a new worktree. Nothing was started."

/** The refusal of images on the launcher's `verb` command, which is not worker: only a worker's codex exec is given any. */
export function theCommandTakesNoImage(verb: string): string {
  return `The sandbox launcher's ${verb} command takes no --image.`
}

/** A launcher run's receipt, in words: no model ran in it. The round's own run has its own. */
export const A_ROUND_LAUNCHER_RUNS_RECEIPT: UsageReceipt = Object.freeze({
  runtime: ROUND_LAUNCHER_RUNTIME,
  source: 'the sandbox launcher, which runs no model',
  says: "The sandbox launcher runs no model, so this run has no tokens to count. The round it started is a run of its own, with its own receipt.",
})

/** What the starting door answers, and what the launcher is given. */
export interface RoundRunRequest extends RunStart {
  /** The worker's launcher run. The launcher files the round's run under it. */
  session: string
  instance: string
  sandboxes: string
  handle: string
  brief: string
  model: string
  runtime: string
  /** `worker`, or `exec` for a dsh or OpenCode worker, for a worker run a supervisor asked for; a next round when absent. */
  verb?: 'round' | 'worker' | 'exec'
  /** The supervisor's run, which a worker's run is filed under. Given for a worker run, and only for it. */
  parent?: string
  /**
   * The run a next round follows, which the launcher continues: --continues. Given for a next round, and only for it.
   * Not `continues`, which a start holds for the conversation a runtime resumes.
   */
  follows?: string
  /** An exec worker's own worktree, or a next round's new directory when it has one. */
  worktree?: string
  /** The worker or round's recorded cut, given with a new round worktree. */
  cutFrom?: string
  /** The released commit a new ordinary round's worktree starts at. */
  tip?: string
  /** The sandbox's clone the worker's worktree is made from, with `cutFrom`. Given for a worker run only. */
  clone?: string
  /** The paths the worker's ask named, which the launcher checks out in its worktree: --with-path. A worker run's only. */
  paths?: string[]
  /** The images the worker's ask named, files of its worktree the launcher gives codex exec as -i: --image. A codex worker run's only. */
  images?: string[]
  /** The native selection of the Casting row the worker run or the next round starts on, as the starting door answered it. */
  selection?: CastingSelection
  /** The command given after `--` for OpenCode, with the brief's text as one argument; absent for dsh. */
  command?: string[]
  /** Outside worker place, supplied only to the host launcher. */
  place?: unknown
  agentId?: string
  commitAddress?: string
}

export interface RoundLauncherEnding {
  ok: boolean
  says: string
  beforeRuntime?: boolean
}

export class RoundAdapter {
  readonly runtime = ROUND_LAUNCHER_RUNTIME
  readonly command = 'node'

  constructor(private readonly from: NodeJS.ProcessEnv) {}

  /** The synthetic launcher a test named, or null because the real one runs. */
  fakeScript(): string | null {
    const named = this.from[FAKE_ROUND_LAUNCHER_SETTING]
    return named === undefined || named.trim() === '' ? null : named
  }

  script(checkout: string): string {
    return this.fakeScript() ?? join(checkout, THE_ROUND_LAUNCHER)
  }

  /** Why the launcher cannot be started here, or null because it can. */
  whyItCannotStart(checkout: string): string | null {
    if (whereItIs(this.command, this.from) === null) return 'node is not installed on this machine, so the sandbox launcher was not started.'
    const script = this.script(checkout)
    if (!existsSync(script)) return `The sandbox launcher ${script} is not in this checkout, so no round was started.`
    return null
  }

  /** The command line this would run. Worked out, not run. */
  commandFor(run: RoundRunRequest): { command: string; args: string[] } {
    const verb = run.verb ?? 'round'
    // A WORKER RUN WITH NO PARENT would be filed under the launcher run and wake nobody, and a round takes none.
    if ((verb !== 'round') !== (run.parent !== undefined)) throw new Error(`The sandbox launcher's ${verb} command ${verb === 'round' ? 'takes no' : 'needs'} --parent.`)
    // A DSH OR OPENCODE WORKER WITH NO WORKTREE would run in the sandbox's repo/, beside its supervisor.
    if (verb !== 'round' && (verb === 'exec') !== (run.worktree !== undefined)) {
      throw new Error(verb === 'exec' ? "The sandbox launcher's exec command for a worker needs --worktree." : `The sandbox launcher's ${verb} command takes no --worktree.`)
    }
    // A new round directory and its recorded cut are passed together.
    if (verb === 'round' && (run.worktree !== undefined) !== (run.cutFrom !== undefined)) throw new Error(A_FRESH_ROUND_NEEDS_BOTH)
    if (run.tip !== undefined && (verb !== 'round' || run.worktree === undefined)) throw new Error(A_ROUND_TIP_NEEDS_A_WORKTREE)
    if (verb === 'round' && run.clone !== undefined) throw new Error("The sandbox launcher's round command takes no --clone.")
    if (verb === 'round' && run.paths !== undefined && run.paths.length > 0) throw new Error("The sandbox launcher's round command takes no --with-path.")
    if (verb !== 'worker' && run.images !== undefined && run.images.length > 0) throw new Error(theCommandTakesNoImage(verb))
    // A ROUND CONTINUES THE RUN THE DOOR FOLLOWS, named, so the launcher never chooses one itself. A run filed from inside
    // the sandbox is not on the host's list, and the launcher continues it only when it is named.
    if ((verb === 'round') !== (run.follows !== undefined)) {
      throw new Error(verb === 'round' ? "The sandbox launcher's round command needs --continues, the run the round follows." : `The sandbox launcher's ${verb} command takes no --continues.`)
    }
    return {
      command: this.command,
      args: [
        this.script(run.cwd), verb, run.instance,
        '--sandboxes', run.sandboxes,
        '--agent', run.handle,
        '--brief', run.brief,
        '--model', run.model,
        '--runtime', run.runtime,
        ...(run.follows === undefined ? [] : ['--continues', run.follows]),
        ...(run.worktree === undefined ? [] : ['--worktree', run.worktree]),
        ...(run.clone === undefined ? [] : ['--clone', run.clone]),
        ...(run.cutFrom === undefined ? [] : ['--cut-from', run.cutFrom]),
        ...(run.tip === undefined ? [] : ['--at', run.tip]),
        ...(run.paths ?? []).flatMap((path) => ['--with-path', path]),
        ...(run.images ?? []).flatMap((image) => ['--image', image]),
        ...(run.selection === undefined ? [] : ['--selection', JSON.stringify(run.selection)]),
        '--as', THE_LAUNCHER_ASKS_AS,
        '--session', run.session,
        ...(run.parent === undefined ? [] : ['--parent', run.parent]),
        '--api', run.api,
        '--workspace', run.workspace,
        ...(run.command === undefined ? [] : ['--', ...run.command]),
      ],
    }
  }

  /** Start it, in its own process group, with its output going to `run.outputPath`. */
  start(run: RoundRunRequest): RunHandle {
    return startRun(this, run, this.from)
  }

  alive(handle: RunHandle): boolean {
    return runIsAlive(handle)
  }

  stop(handle: RunHandle): void {
    endRun(handle)
  }

  /**
   * HOW IT ENDED: its exit code, and the last it printed. The launcher does not wait for the round (no --wait), so a
   * zero exit means it filed and started the round's run, and anything else means it did not say so.
   */
  readEnding(handle: RunHandle): RoundLauncherEnding {
    const { said, problems } = outputOf(handle)
    const exitCode = exitCodeOf(handle)
    const last = (problems.trim() || said.trim()).slice(-600)
    const printed = last === '' ? ' It printed nothing.' : ` The last it printed: ${last}`
    if (exitCode === 0) return { ok: true, says: `The sandbox launcher exited with code 0.${printed}` }
    const status = exitCode === null ? 'The sandbox launcher ended without a recorded exit code.' : `The sandbox launcher exited with code ${exitCode}.`
    return { ok: false, says: `${status}${printed}` }
  }
}
