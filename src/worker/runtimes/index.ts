// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH ADAPTER SERVES WHICH RUNTIME WORD.
 *
 * Every runtime word legal on an agent's registry row is declared once in
 * `src/shared/participants.ts`, and there is one adapter for each. This file is the only place that
 * mapping is written, so a word the registry accepts and nothing can serve would fail here rather
 * than somewhere further in.
 *
 * When `MOLE_OFFICE_FAKE_RUNTIME` names a script, every word is served by the fake adapter instead.
 * That is how the test suite runs the worker end to end without a model call, and it is said out
 * loud wherever it is on: see `RUNS_ARE_FAKED` in `runtimes/fake.ts`.
 *
 * `whatIsInstalled` asks of the whole environment, so on Windows a search path held as `Path` is
 * found.
 */

import { AGENT_RUNTIMES, THE_RUNTIMES_THE_OFFICE_DISPATCHES, whyTheOfficeCannotStartThisRuntime, type AgentRuntime } from '@shared/participants.ts'
import { NOTHING_CHOSEN, type TheOfficesChoice } from '@shared/run-models.ts'

import { installedTools } from '../../config/runtimes.mjs'
import type { RuntimeAdapter } from './adapter.ts'
import { ClaudeCodeAdapter } from './claude-code.ts'
import { CodexAdapter } from './codex.ts'
import { FAKE_RUNTIME_SETTING, FakeAdapter } from './fake.ts'
import { KimiAdapter } from './kimi.ts'
import { OpenCodeAdapter } from './opencode.ts'

/** Whether this installation is answering every message with the fake runtime, and with which script. */
export function fakeRuntimeScript(from: NodeJS.ProcessEnv): string | null {
  const said = from[FAKE_RUNTIME_SETTING]
  return said === undefined || said.trim() === '' ? null : said
}

/**
 * The adapter for one runtime word, or null because no adapter serves it.
 *
 * `chosen` is the model and reasoning effort the office chose for this run (criterion U2), carried
 * on the queue row. The adapters that pass a model read it before their own environment; kimi passes
 * none, and says why beside its constructor.
 */
export function adapterFor(
  runtime: string,
  from: NodeJS.ProcessEnv = process.env,
  chosen: TheOfficesChoice = NOTHING_CHOSEN,
): RuntimeAdapter | null {
  const faked = fakeRuntimeScript(from)
  if (faked !== null) return new FakeAdapter(faked, from, chosen)
  switch (runtime) {
    case 'claude-code':
      return new ClaudeCodeAdapter(from, chosen)
    case 'codex':
      return new CodexAdapter(from, chosen)
    case 'opencode':
      return new OpenCodeAdapter(from, chosen)
    case 'kimi':
      return new KimiAdapter(from)
    default:
      return null
  }
}

/**
 * WHICH RUNTIME WORDS THE OFFICE CAN DISPATCH A RUN ON: the ones with an adapter behind them.
 *
 * THIS IS NOT `AGENT_RUNTIMES`, AND THE DIFFERENCE IS THE POINT. `AGENT_RUNTIMES` says which words
 * an agent's row may declare; this says which the message worker can actually start a run on. They
 * were one list until 12 September 2026, when `dsh` had to become a word a registration may declare
 * (criterion P88, as amended) while remaining a runtime the office does not dispatch: a dsh worker
 * is started by the office's own tools — `~/.cache/mole-office/dsh/run-worker.sh` — and not by the
 * message worker, and there is no adapter for it.
 *
 * ONE LIST ANSWERING TWO QUESTIONS IS THE NINTH INVARIANT'S CASE: changing one could leave the other
 * wrong with nothing failing. So they are two lists, and `adapterForWordAlone` refuses loudly for a
 * word that is on neither.
 */
export { THE_RUNTIMES_THE_OFFICE_DISPATCHES } from '@shared/participants.ts'

/** One adapter for each runtime word the office can dispatch a run on, in the order declared. */
export function everyAdapter(from: NodeJS.ProcessEnv = process.env): RuntimeAdapter[] {
  return THE_RUNTIMES_THE_OFFICE_DISPATCHES.map((word) => adapterForWordAlone(word, from))
}

/**
 * The real adapter for a word, never the fake one. Used where the question is about the tools themselves.
 *
 * THE SWITCH HAS NO DEFAULT BRANCH, so a word added to `AGENT_RUNTIMES` with no adapter behind it
 * does not compile. It used to fall through to null, which meant `everyAdapter` quietly listed one
 * fewer tool than the registry accepts and nothing said so.
 */
export function adapterForWordAlone(runtime: AgentRuntime, from: NodeJS.ProcessEnv = process.env): RuntimeAdapter {
  switch (runtime) {
    case 'claude-code':
      return new ClaudeCodeAdapter(from)
    case 'codex':
      return new CodexAdapter(from)
    case 'opencode':
      return new OpenCodeAdapter(from)
    case 'kimi':
      return new KimiAdapter(from)
    case 'dsh':
      // A LOUD REFUSAL AND NOT A NULL. The office does not dispatch a dsh run: a dsh worker is
      // started by this office's own tools outside the message worker, so there is no adapter to
      // hand back. Returning null here would have `everyAdapter` quietly list one fewer tool than
      // the registry accepts, which is the defect the comment above this switch records.
      throw new Error(
        'The office does not start a dsh run. A dsh worker is started by the office\'s own tools ' +
          '(~/.cache/mole-office/dsh/run-worker.sh), so "dsh" is a runtime an agent may declare when it ' +
          'registers and not one the message worker can dispatch. THE_RUNTIMES_THE_OFFICE_DISPATCHES is ' +
          'the list of the ones it can.',
      )
  }
}

/**
 * WHICH OF THE AGENT TOOLS ARE INSTALLED ON THIS MACHINE, AND WHERE EACH ONE IS.
 *
 * IT ANSWERS FOR EVERY WORD THE REGISTRY ALLOWS, not only the ones the office can dispatch, because
 * a reader asking what is on this machine is asking about the words they will meet on an agent's
 * row. A word with no adapter is not left out and is not counted as a missing tool either: it comes
 * back with `where` null and a sentence saying it is started by its own tool and never dispatched
 * from here. Leaving it out would answer a question nobody asked; calling it missing would say this
 * machine lacks something it does not need.
 */
export function whatIsInstalled(
  from: NodeJS.ProcessEnv = process.env,
): { runtime: string; where: string | null; says: string | null }[] {
  // THE COMPOSITION IS IN src/config/runtimes.mjs, so the API server's runtime page draws the same
  // answer without loading this file: of src/worker/runtimes the server loads only
  // what-a-runtime-passes-on.ts. The registry list and the reason a word is not dispatched from here
  // are handed in, because those live in src/shared.
  return installedTools(from, AGENT_RUNTIMES, whyTheOfficeCannotStartThisRuntime)
}
