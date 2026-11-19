// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE'S MERGE TOOL, AS THE MESSAGE WORKER STARTS IT. Sandbox v1, piece P9, SPEC.md 5.3.
 *
 * The server keeps the merge queue and decides; `tools/the-merger.mjs` does the git and container work
 * for one entry; the worker starts that tool and watches it. This adapter is the worker's half: the
 * command line, the start in a process group of its own with its output going to a file, the stop by
 * that group, and the reading of how it ended.
 *
 * IT RUNS NO MODEL AND SERVES NO AGENT. It is not one of the agent runtimes in `runtimes/index.ts`, so
 * `MOLE_OFFICE_FAKE_RUNTIME` — which answers every agent run with a script — never reaches it, and it
 * declares no rules file and takes no prompt. It is started by the worker for a merge entry the office
 * has marked, never for a message.
 *
 * THE COMMAND LINE:
 *
 *     node <checkout>/tools/the-merger.mjs --entry <merge entry id> --session <this run's session id>
 *          --api <the office's address> --workspace <project id> [--pin-only]
 *
 * The tool reads the entry through the API, reports each step through the merge queue's step door as
 * the message worker, and prints one ending line last (src/config/merge-tool.mjs). Its environment is
 * every run's (`envFor`): no database path, the office's address and the project, and from a stable office the pairing.
 *
 * A TEST RUNS A SYNTHETIC TOOL INSTEAD, named by `MOLE_OFFICE_FAKE_MERGE_TOOL`, as the check tool's test
 * does with `MOLE_OFFICE_FAKE_INSPECTION_TOOL`. The run's own record names the script when it is set.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { MERGE_TOOL_RUNTIME } from '@shared/merge-queue.ts'

import { THE_MERGE_TOOL, readTheMergeToolEnding, type MergeToolEnding } from '../../config/merge-tool.mjs'
import { settingNamed } from '../../config/settings.mjs'
import type { UsageReceipt } from '../../shared/usage-receipts.ts'
import type { RunHandle, RunStart } from './adapter.ts'
import { endRun, exitCodeOf, outputOf, runIsAlive, startRun } from './common.ts'
import { whereItIs } from './os.ts'

/**
 * The setting that names a synthetic merge tool for the test suite. Read from the worker's environment.
 * Named through the declaration in src/config/settings.mjs, so this file fails at import if it is not declared there.
 */
export const FAKE_MERGE_TOOL_SETTING = settingNamed('MOLE_OFFICE_FAKE_MERGE_TOOL').name

/**
 * A MERGE TOOL RUN'S RECEIPT, IN WORDS, in wave 13s round 34. The tool runs no model
 * (tools/the-merger.mjs), so there is no runtime usage to read. Every number stays absent, never 0, and the receipt says
 * why. A check the tool asks for is a run of its own, with its own receipt.
 */
export const A_MERGE_TOOL_RUNS_RECEIPT: UsageReceipt = Object.freeze({
  runtime: MERGE_TOOL_RUNTIME,
  source: 'the merge tool, which runs no model',
  says: 'The merge tool runs no model, so this run has no tokens to count. A check it asked for is a run of its own, with its own receipt.',
})

/** What starting the merge tool needs: where, which office, where its output goes, and its own session. */
export interface MergeRunRequest extends RunStart {
  /** The session record the worker filed for this run. The tool sends it on every request it makes. */
  session: string
  /** A run that only pins a submitted entry, while the merge slot is busy with another (problem GS4-3r9FQQCv). */
  pinOnly?: true
  /** A run that checks the resolution a resolving entry's supervisor handed over, outside the lane (XHY2fVFG3Qq8, answer 1). */
  checkResolution?: true
}

export class MergeAdapter {
  readonly runtime = MERGE_TOOL_RUNTIME
  readonly command = 'node'

  constructor(
    /** The merge entry this run is for. */
    readonly entry: string,
    private readonly from: NodeJS.ProcessEnv,
  ) {}

  /** The synthetic tool a test named, or null because the real one runs. */
  fakeScript(): string | null {
    const named = this.from[FAKE_MERGE_TOOL_SETTING]
    return named === undefined || named.trim() === '' ? null : named
  }

  /** The script this runs, for a run working in this checkout. */
  script(checkout: string): string {
    return this.fakeScript() ?? join(checkout, THE_MERGE_TOOL)
  }

  /**
   * WHY THE MERGE TOOL CANNOT BE STARTED HERE, or null because it can.
   *
   * Until the tool itself is merged (piece P8), a checkout has no `tools/the-merger.mjs`, and an entry
   * the office wants merged is held with this sentence rather than started into a failure.
   */
  whyItCannotStart(checkout: string): string | null {
    if (whereItIs(this.command, this.from['PATH']) === null) {
      return `node is not installed on this machine, so the merge tool was not started for merge entry ${this.entry}.`
    }
    const script = this.script(checkout)
    if (!existsSync(script)) {
      return `The merge tool ${script} is not in this checkout, so nothing was started for merge entry ${this.entry}, and nothing else was started in its place.`
    }
    return null
  }

  /** The command line this would run. Worked out, not run. */
  commandFor(run: MergeRunRequest): { command: string; args: string[] } {
    return {
      command: this.command,
      args: [
        this.script(run.cwd), '--entry', this.entry, '--session', run.session, '--api', run.api, '--workspace', run.workspace,
        ...(run.pinOnly === true ? ['--pin-only'] : []),
        ...(run.checkResolution === true ? ['--check-resolution'] : []),
      ],
    }
  }

  /** Start it, in its own process group, with its output going to `run.outputPath`. */
  start(run: MergeRunRequest): RunHandle {
    return startRun(this, run, this.from)
  }

  alive(handle: RunHandle): boolean {
    return runIsAlive(handle)
  }

  /** End it, and everything it started, by the group written down when it started. */
  stop(handle: RunHandle): void {
    endRun(handle)
  }

  /**
   * HOW IT ENDED, read off what it printed. The tool's own ending line when it printed one; otherwise a
   * failure saying it never said, with the last it did print, because a run that did not say it ended
   * well is never recorded as one that did.
   */
  readEnding(handle: RunHandle): MergeToolEnding {
    const { said, problems } = outputOf(handle)
    const exitCode = exitCodeOf(handle)
    if (exitCode !== 0) {
      const status =
        exitCode === null
          ? 'The merge tool ended without a recorded exit code.'
          : `The merge tool exited with code ${exitCode}.`
      const last = (problems.trim() || said.trim()).slice(-600)
      return {
        ok: false,
        says:
          `${status} The merge tool ended without saying how it ended` +
          (last === '' ? ', and it printed nothing.' : `. The last it printed: ${last}`),
      }
    }
    const ending = readTheMergeToolEnding(said)
    if (ending !== null) return ending
    const last = (problems.trim() || said.trim()).slice(-600)
    return {
      ok: false,
      says:
        'The merge tool ended without saying how it ended' +
        (last === '' ? ', and it printed nothing.' : `. The last it printed: ${last}`),
    }
  }
}
