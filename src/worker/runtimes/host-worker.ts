// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { RoundAdapter, type RoundRunRequest, type RoundLauncherEnding } from './round.ts'
import type { RunHandle } from './adapter.ts'
import { exitCodeOf, outputOf } from './common.ts'
import { whereItIs } from './os.ts'

/** A place worker uses the same wrapper lifecycle as a sandbox launcher. */
export class HostWorkerAdapter extends RoundAdapter {
  constructor(private readonly environment: NodeJS.ProcessEnv) { super(environment) }

  override script(checkout: string): string {
    return this.fakeScript() ?? join(checkout, 'tools/host-worker-launcher.mjs')
  }

  override whyItCannotStart(checkout: string): string | null {
    if (whereItIs(this.command, this.environment) === null) return 'node is not installed on this machine, so the host launcher was not started.'
    const script = this.script(checkout)
    return existsSync(script) ? null : `The host launcher ${script} is not in this checkout, so no worker was started.`
  }

  override commandFor(run: RoundRunRequest): { command: string; args: string[] } {
    if (run.parent === undefined || run.place === undefined) throw new Error('The host launcher needs a parent and a place.')
    return { command: this.command, args: [this.script(run.cwd), '--place', JSON.stringify(run.place), '--agent', run.handle,
      '--brief', run.brief, '--model', run.model, '--runtime', run.runtime, '--parent', run.parent,
      '--session', run.session, '--api', run.api, '--workspace', run.workspace, '--output', run.outputPath,
      ...(run.agentId === undefined ? [] : ['--agent-id', run.agentId]),
      ...(run.commitAddress === undefined ? [] : ['--commit-address', run.commitAddress]),
      ...(run.cutFrom === undefined ? [] : ['--cut-from', run.cutFrom]),
      ...(run.selection === undefined ? [] : ['--selection', JSON.stringify(run.selection)]),
      ...(run.command === undefined ? [] : ['--', ...run.command]),
    ] }
  }

  override readEnding(handle: RunHandle): RoundLauncherEnding {
    const { said, problems } = outputOf(handle)
    const last = (problems.trim() || said.trim()).slice(-600)
    const printed = last === '' ? ' It printed nothing.' : ` The last it printed: ${last}`
    const code = exitCodeOf(handle)
    return { ok: code === 0, says: `${code === null ? 'The host launcher ended without a recorded exit code.' : `The host launcher exited with code ${code}.`}${printed}`, ...(code === 2 ? { beforeRuntime: true } : {}) }
  }
}
