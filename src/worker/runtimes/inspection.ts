// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The office's check tool, using the worker's ordinary process group and output lifecycle. */
import { closeSync, fstatSync, openSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { INSPECTION_RUNTIME, theModelForTheCommand, type RunHandle, type RunRequest, type RunResult, type RuntimeAdapter, type ServedReading } from './adapter.ts'
import { theModelsInAResult } from '../../config/claude-code-served.mjs'
import { aServed } from '../../config/runtime-served.mjs'
import { endRun, exitCodeOf, outputOf, readFileOrEmpty, runIsAlive, startRun, withExitStatus } from './common.ts'
import { CHECK_ENDED_WITH_NO_VERDICT } from '../../config/inspection-ending.mjs'
import { problemPathOf, whereItIs } from './os.ts'
import { inspectionSettings } from '../../config/inspection.mjs'
import { writeTheNeedsJudgmentList } from '../../config/needs-judgment.mjs'
import { settingNamed } from '../../config/settings.mjs'
import { theStopCauseInAClaudeResult } from '../../config/stopped-run-cause.mjs'
import { DshTranscriptRefused, inspectionClaudeResults, inspectionUsageIn, inspectionUsageReceipt, jsonLines, modelIn } from '../../config/usage.mjs'
import type { UsageReceipt } from '../../shared/usage-receipts.ts'
import { clockStamp } from '@shared/time.ts'

/**
 * THE RECEIPT THE TOOL PRINTED, when the check ran a model.
 *
 * The tool's standard output is a person's report. Its model-output line names the runtime and
 * carries that runtime's native stdout. The shared Claude or Codex reader builds its receipt.
 * A check that ran no model prints no such line, so
 * no receipt is made; absence beats a guess. A check that ran a model and then died still carries
 * its receipt, because the tokens were spent either way.
 */
function usageIn(said: string): { receipt: UsageReceipt | undefined; dshTranscriptRefused: boolean } {
  try {
    const native = inspectionUsageIn(said)
    return { receipt: native === null ? undefined : inspectionUsageReceipt(native), dshTranscriptRefused: false }
  } catch (why) {
    return { receipt: { source: 'the inspection output line', says: why instanceof Error ? why.message : String(why) }, dshTranscriptRefused: why instanceof DshTranscriptRefused }
  }
}

/**
 * WHY A CHECK'S CLAUDE LOGIN STOPPED IT, when the tool printed a Claude Code result that is an error naming a cause, such
 * as `You've hit your session limit · resets 7:10pm (Europe/London)`; otherwise undefined. `at` is the instant, with its
 * offset, at which the tool last wrote its output, read from the same open of the file as the words
 * (`theOutputAndItsMoment`), or null when the output could not be opened: the result carries no time of its own.
 *
 * ONLY THE LAST RESULT IS READ. A check asked again for its verdict prints a second result, and only the last says how it
 * ended. A Codex check is not read: no limit answer from Codex has been captured from a check. An output line that cannot
 * be read gives undefined here; the check's usage receipt says what was wrong with it.
 */
export function theStopCauseInACheck(said: string, at: string | null): RunResult['stopCause'] {
  let native
  try { native = inspectionUsageIn(said) } catch { return undefined }
  if (native === null || native.runtime !== 'claude-code') return undefined
  const last = inspectionClaudeResults(native.output).at(-1)
  let result: unknown
  try { result = JSON.parse(last ?? '') } catch { return undefined }
  const cause = theStopCauseInAClaudeResult(result)
  return cause === null ? undefined : { ...cause, at }
}

/**
 * THE TOOL'S OUTPUT AND THE MOMENT IT WAS LAST WRITTEN, from one open of the file: its words, and the instant with its
 * offset of its last change. The file is opened once, so the moment is that of the file whose words were read, and not of
 * another file put at the same path in between. A run that never wrote a byte leaves no file: no words and no moment.
 */
function theOutputAndItsMoment(outputPath: string): { said: string; at: string | null } {
  let fd: number
  try { fd = openSync(outputPath, 'r') } catch { return { said: '', at: null } }
  try {
    const said = readFileSync(fd, 'utf8')
    return { said, at: clockStamp(() => fstatSync(fd).mtime).instant }
  } finally {
    closeSync(fd)
  }
}

/**
 * WHERE THE NEEDS-JUDGMENT LIST IS WRITTEN FOR THE TOOL: beside the run's own output, so it is
 * kept with the run and removed with it. `tools/the-inspector.mjs --needs-judgment` reads a file,
 * and the list is `{needsJudgment: [{path, why}]}`, the shape src/config/needs-judgment.mjs reads.
 */
export function needsJudgmentFileFor(run: Pick<RunRequest, 'outputPath'>): string {
  return join(dirname(run.outputPath), 'needs-judgment.json')
}

/**
 * The setting that names a synthetic check tool for the test suite. Read from the worker's environment.
 * Named through the declaration in src/config/settings.mjs, so this file fails at import if it is not declared there.
 */
export const FAKE_INSPECTION_TOOL_SETTING = settingNamed('MOLE_OFFICE_FAKE_INSPECTION_TOOL').name

export class InspectionAdapter implements RuntimeAdapter {
  readonly runtime = INSPECTION_RUNTIME
  readonly command = 'node'
  readonly rulesFile = 'AGENTS.md' as const
  constructor(
    readonly target: {
      run: string
      checkout: string | null
      model?: string
      minutes?: number
      /**
       * A SCOPED CHECK, asked for by the merge queue (sandbox v1, piece P7): the tool judges only
       * these changed paths, and reads the paths a checker tool handed on. Absent is a whole check.
       */
      only?: string[]
      needsJudgment?: { path: string; why: string }[]
    },
    private readonly from: NodeJS.ProcessEnv,
  ) {}
  whereItIs(): string | null { return whereItIs(this.command, this.from['PATH']) }
  // THE MODEL THE QUEUE ROW CARRIES FIRST: the checking agent's own, or the Settings page's choice for
  // the check (criterion U2). Without one, MOLE_OFFICE_INSPECTION_MODEL in this worker's environment,
  // and null when that names none too: `startOne` then refuses the check.
  modelItWouldUse(): string | null { return this.target.model ?? inspectionSettings(this.from).model }
  minutes(): number { return this.target.minutes ?? inspectionSettings(this.from).minutes }
  commandFor(run: RunRequest): { command: string; args: string[] } {
    const only = this.target.only ?? []
    return { command: this.command, args: [this.from[FAKE_INSPECTION_TOOL_SETTING] ?? join(run.cwd, 'tools/the-inspector.mjs'),
      '--run', this.target.run, '--as', run.agent, '--check', run.session, '--api', run.api, '--workspace', run.workspace,
      '--checkout', this.target.checkout ?? run.cwd, '--model', theModelForTheCommand(this.modelItWouldUse(), 'check'), '--limit', String(this.minutes()),
      // THE SCOPE GOES ON THE COMMAND LINE EXACTLY AS THE OFFICE ASKED, and the list goes in a file
      // the tool reads before it does anything else. A scoped check started without them would be a
      // whole check wearing a scoped check's record.
      ...(only.length === 0 ? [] : ['--only', ...only]),
      ...(this.target.needsJudgment === undefined ? [] : ['--needs-judgment', needsJudgmentFileFor(run)])] }
  }
  start(run: RunRequest): RunHandle {
    if (this.target.needsJudgment !== undefined) writeTheNeedsJudgmentList(needsJudgmentFileFor(run), this.target.needsJudgment)
    return startRun(this, { ...run, resume: undefined }, this.from)
  }
  alive(handle: RunHandle): boolean { return runIsAlive(handle) }
  stop(handle: RunHandle): void { endRun(handle) }
  /**
   * The models named by native output. Codex output that names no model stays unreported;
   * neither the command's requested model nor its Casting row proves which model served it.
   */
  servedOf(handle: RunHandle): ServedReading {
    let native
    try { native = inspectionUsageIn(outputOf(handle).said) }
    catch (why) { return { served: aServed([]), said: why instanceof Error ? why.message : String(why) } }
    if (native === null) return { served: aServed([]), said: 'The check tool printed no model envelope, so it ran no model or ended before it printed one.' }
    if (native.runtime === 'codex') {
      const model = modelIn(jsonLines(native.output))
      return { served: aServed(model === undefined ? [] : [model]),
        said: model === undefined ? 'The check\'s Codex JSON events named no model, so the served model is not reported.' : `The check's Codex JSON events named ${model}.` }
    }
    if (native.runtime === 'opencode') return { served: aServed([]), said: "The model served by this OpenCode check is not reported." }
    // See 1S-Comh3Shf- point 4. The transcript may name a model, which the receipt keeps; it is not read here.
    if (native.runtime === 'dsh') return { served: aServed([]), said: 'The model served by this dsh check is not reported.' }
    const results = inspectionClaudeResults(native.output).map(theModelsInAResult)
    const models = results.every((one) => one !== null) ? results.flatMap((one) => one!) : null
    return {
      served: aServed(models ?? []),
      said: models === null ? 'The envelope the check tool printed is not a Claude Code JSON result.' : `The check's Claude Code JSON result named ${models.length === 0 ? 'no model' : models.join(', ')}.`,
    }
  }

  readResult(handle: RunHandle): RunResult {
    const { said, at } = theOutputAndItsMoment(handle.outputPath)
    const problems = readFileOrEmpty(problemPathOf(handle.outputPath))
    const { receipt: usageReceipt, dshTranscriptRefused } = usageIn(said)
    const stopCause = theStopCauseInACheck(said, at)
    return withExitStatus(handle, { text: said, providerSession: null, endedHow: 'failed',
      ...(stopCause === undefined && exitCodeOf(handle) === CHECK_ENDED_WITH_NO_VERDICT ? { inspectionEnding: 'no-verdict' as const } : {}),
      ...(usageReceipt === undefined ? {} : { usageReceipt }),
      ...(dshTranscriptRefused ? { dshTranscriptRefused: true as const } : {}),
      ...(stopCause === undefined ? {} : { stopCause }),
      because: (problems.trim() || said.trim() || 'The tool process ended without recording a verdict.').slice(-2000) })
  }
}
