// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUNTIME THAT ANSWERS WITHOUT A MODEL, SO THE WHOLE FLOW CAN BE TESTED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS AND WHY IT IS LABELLED EVERYWHERE IT APPEARS
 * ---------------------------------------------------------------------------------------
 *
 * Every path the worker has — a message queued, a run started, an answer read, a reply filed, a
 * mark moved, a run stopped — needs a run at the end of it. Doing that with a real agent tool would
 * cost a model call per test, so the test suite runs `tests/fake-runtime.mjs` instead: a script
 * that reads the prompt, prints a reply, and exits.
 *
 * Invariant 3 of USER.md says a placeholder is labelled, prominently, in the place it appears. So
 * this adapter exists only when `MOLE_OFFICE_FAKE_RUNTIME` names a script, the worker's health row
 * on `GET /api/runtime` says in words that runs are being faked, and every run it starts says
 * `fake` where a runtime word goes. Nothing about a fake run is ever reported as a real one.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS A REAL ADAPTER, NOT A STUB
 * ---------------------------------------------------------------------------------------
 *
 * It starts a real process in its own process group, its output goes to a real file, and it is
 * stopped by a real signal. So the test of the worker is a test of the worker: the only thing that
 * is not real is the model at the far end. That also means the interface in `adapter.ts` is proved
 * by four implementations rather than three.
 *
 * The script prints one JSON object of its own shape — `{"reply": …, "conversation": …}` — rather
 * than copying Claude Code's. A fake that spoke another tool's format would let that tool's reader
 * pass its tests without ever seeing that tool's output.
 *
 * ONE BEHAVIOUR PRINTS A LINE BEFORE THAT: `{"conversation": …}` alone, and then it hangs. That is
 * the fake standing in for Codex and OpenCode, which name their conversation near the start of their
 * output. Plan hp7Z-IW9JWSX, piece H5: the worker reads that id with `conversationSoFar` while the
 * run is going, so a run killed mid-turn keeps it on its record.
 *
 * A LINE `{"tokens": {"input": …, "cacheWrites": …, "cacheReads": …, "output": …}}` IS ONE ANSWER'S TOKENS, so a
 * test's stand-in can make a run spend tokens while it runs (wave 14d). `tokensSoFar` adds them up.
 *
 * ITS PROGRAM IS LOOKED UP IN THE WHOLE ENVIRONMENT IT WAS GIVEN, through `whereItIs` in ./os.ts, so on Windows a
 * search path held as `Path` is found.
 */

import { NO_CONVERSATION_ID, theModelForTheCommand, type RunHandle, type RunRequest, type RunResult, type RuntimeAdapter, type ServedReading } from './adapter.ts'
import { aServed } from '../../config/runtime-served.mjs'
import { endRun, jsonLines, nothingWasPrinted, outputOf, runIsAlive, startRun, withExitStatus } from './common.ts'
import { whereItIs } from './os.ts'
import { theModelAChoreIsGiven } from '../../config/chores.mjs'
import { theTokensCounted } from '../../config/tokens-so-far.mjs'
import { NOTHING_CHOSEN, type TheOfficesChoice } from '../../shared/run-models.ts'

/** The setting that turns this on. Naming a script is what switches every runtime word to this one. */
export const FAKE_RUNTIME_SETTING = 'MOLE_OFFICE_FAKE_RUNTIME'

/** The sentence the runtime page and the worker's own health row carry while this is on. */
export const RUNS_ARE_FAKED =
  'Runs are not real. This installation is set to answer every message with the script named in ' +
  `${FAKE_RUNTIME_SETTING} instead of starting an agent tool, which is how the test suite exercises ` +
  'the worker without spending a model call. Nothing an agent says here came from a model.'

/** What the fake script prints. */
interface FakeEnvelope {
  reply?: unknown
  conversation?: unknown
  /** What the script says served the run: itself, "fake-runtime", never a real model's name. */
  model?: unknown
}

export class FakeAdapter implements RuntimeAdapter {
  readonly runtime = 'fake'
  readonly command = 'node'
  readonly rulesFile = 'AGENTS.md' as const

  constructor(
    /** The script this runs. */
    private readonly script: string,
    private readonly from: NodeJS.ProcessEnv = process.env,
    /** What the office chose for this run (criterion U2), read before the environment. */
    private readonly chosen: TheOfficesChoice = NOTHING_CHOSEN,
  ) {}

  whereItIs(): string | null {
    return whereItIs(this.command, this.from)
  }

  /**
   * WHICH MODEL A RUN OF THIS WOULD BE GIVEN. Criterion M85.
   *
   * The fake stands in for a tool that takes a model, so it answers the question that tool answers
   * and passes the argument that tool is passed. Without this a run under the fake would record no
   * model, and the record every worker test reads would be a different shape from the one the
   * product writes — which is the whole thing a stand-in must not be. It reads what the office
   * chose first, as the claude-code adapter does.
   */
  modelItWouldUse(): string | null {
    return this.chosen.model ?? theModelAChoreIsGiven(this.from)
  }

  commandFor(run: RunRequest): { command: string; args: string[] } {
    const args = [this.script, run.prompt, '--model', theModelForTheCommand(this.modelItWouldUse(), 'conversation')]
    if (run.resume !== undefined && run.resume !== '') args.push('--resume', run.resume)
    return { command: this.command, args }
  }

  start(run: RunRequest): RunHandle {
    return startRun(this, run, this.from)
  }

  /** The first conversation any line of the output names, which is this run's. */
  conversationSoFar(handle: RunHandle): string | null {
    for (const line of jsonLines(outputOf(handle).said)) {
      if (typeof line['conversation'] === 'string') return line['conversation']
    }
    return null
  }

  alive(handle: RunHandle): boolean {
    return runIsAlive(handle)
  }

  stop(handle: RunHandle, _why: string): void {
    endRun(handle)
  }

  /**
   * THE TOKENS SO FAR, from the output's `tokens` lines, each one answer's, added up and counted by the one rule
   * (theTokensCounted). A number that some line leaves out is not taken as zero: the count is then not known.
   */
  tokensSoFar(handle: RunHandle): { tokens: number; read: string } | { tokens: null; why: string } {
    const answers = jsonLines(outputOf(handle).said).map((line) => line['tokens']).filter((one): one is Record<string, unknown> => typeof one === 'object' && one !== null)
    if (answers.length === 0) return { tokens: null, why: 'The fake runtime has printed no tokens line.' }
    const summed = (key: string): number | undefined =>
      answers.every((one) => typeof one[key] === 'number') ? answers.reduce((total, one) => total + (one[key] as number), 0) : undefined
    return theTokensCounted(
      { inputTokens: summed('input'), cacheCreationInputTokens: summed('cacheWrites'), cachedInputTokens: summed('cacheReads'), outputTokens: summed('output'), inputIncludesCached: false },
      "the fake runtime's output",
      `each tokens line once. ${RUNS_ARE_FAKED}`,
    )
  }

  /** The model the script's own envelope names, which is the script itself. */
  servedOf(handle: RunHandle): ServedReading {
    const envelope = [...jsonLines(outputOf(handle).said)].reverse().find((line) => 'model' in line) as FakeEnvelope | undefined
    const model = typeof envelope?.model === 'string' ? envelope.model : null
    return {
      served: aServed(model === null ? [] : [model]),
      said: model === null ? 'The fake runtime printed no model.' : `The fake runtime named ${model}: no model served this run. ${RUNS_ARE_FAKED}`,
    }
  }

  readResult(handle: RunHandle): RunResult {
    const { said, problems } = outputOf(handle)
    if (said.trim() === '') {
      return withExitStatus(handle, {
        text: '',
        providerSession: handle.providerSession,
        endedHow: 'failed',
        because: nothingWasPrinted(this.runtime, problems),
      })
    }
    const lines = jsonLines(said)
    if (lines.length === 0) {
      return withExitStatus(handle, {
        text: said.trim(),
        providerSession: handle.providerSession,
        endedHow: 'failed',
        because: 'The fake runtime printed something that is not the one JSON object it is meant to print.',
      })
    }
    const session = this.conversationSoFar(handle)
    const envelope = [...lines].reverse().find((line) => 'reply' in line) as FakeEnvelope | undefined
    if (envelope === undefined) {
      return withExitStatus(handle, {
        text: '',
        providerSession: session ?? handle.providerSession,
        endedHow: 'failed',
        because: 'The fake runtime said which conversation it is in and ended before it printed a reply.',
      })
    }
    return withExitStatus(handle, {
      text: typeof envelope.reply === 'string' ? envelope.reply : '',
      providerSession: session ?? handle.providerSession,
      endedHow: 'answered',
      because: session === null ? NO_CONVERSATION_ID : RUNS_ARE_FAKED,
    })
  }
}
