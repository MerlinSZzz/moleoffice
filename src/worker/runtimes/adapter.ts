// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { NO_MODEL_SAYS } from '../../config/agent-model.mjs'
import { databasePathFrom } from '../../config/settings.mjs'
import { theOfficeToolEnvironment } from '../../config/the-office-tool-environment.mjs'
import { MERGE_TOOL_RUNTIME } from '../../shared/merge-queue.ts'
import { ROUND_LAUNCHER_RUNTIME } from '../../shared/next-round.ts'
import type { UsageReceipt } from '../../shared/usage-receipts.ts'
import { isAgentRuntime, type AgentRuntime } from '../../shared/participants.ts'
import type { TheRowAMessageRunKeeps } from '../../shared/run-models.ts'
import type { RulesFile } from '../../shared/rules-text.ts'
/**
 * ONE INTERFACE FOR EVERY AGENT TOOL THE WORKER MAY START.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M10 of `design/messages/ACCEPTANCE.md`: *One interface: start with a prompt, resume a
 * conversation by the provider's id, hand over the rules and the headers, detect the end, read the
 * result.* Claude Code, Codex and OpenCode are three programs with three command lines and three
 * output formats. Everything above this file works against the six methods below and knows none of
 * that.
 *
 * All three are wanted: Codex and OpenCode as well as Claude Code.
 *
 * ---------------------------------------------------------------------------------------
 * THE SIX METHODS, AND WHY EACH ONE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 *   `whereItIs`    the path of the program, or null because it is not installed. The worker holds a
 *                  message in the queue when this is null and writes down that reason, rather than
 *                  starting some other program instead.
 *   `commandFor`   the exact command line, worked out and returned rather than run. A test can read
 *                  what an adapter would run without a model call costing anybody anything.
 *   `start`        run it, in its own process group, with its output going to a file.
 *   `alive`        is that run still going.
 *   `stop`         end it, by process group, with a reason written down.
 *   `readResult`   what it answered, and the provider's own id for the conversation.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT AN ADAPTER MAY NOT DO
 * ---------------------------------------------------------------------------------------
 *
 * It never reaches the database. A run it starts is given `MOLE_OFFICE_API` and the actor headers
 * for the agent it serves, and `MOLE_OFFICE_DB` is deliberately absent: a run writes through the
 * same door as everybody else. `envFor` below is the one place that environment is built. The one
 * exception is the office's own check tool, which is not an agent; `envFor` says why.
 *
 * It never guesses a result. When a run's output holds no provider conversation id, `readResult`
 * answers null and says so in `because`. A guessed id would resume the wrong conversation.
 */

/** A run whose conversation another run picked up: its session record, and the file its output went to. */
export interface TheRunItContinues {
  run: string
  outputPath: string
}

/** Which file in the working directory this tool reads its rules from. Declared in src/shared/rules-text.ts, which builds that file's text. */
export type { RulesFile }

/** What the worker asks for when it wants a run. */
export interface RunRequest {
  /**
   * MOLE OFFICE'S OWN ID FOR THIS RUN: the `session` record the worker filed a moment before it
   * asked for the run.
   *
   * It is here because one tool needs it. Kimi CLI lets the caller choose the conversation id, so
   * the Kimi adapter builds one out of this rather than waiting to read one out of the tool's
   * output. Nothing else uses it, and no adapter may invent one when it is missing: this is a
   * required field so that a caller who has no id gets a type error rather than a run whose
   * conversation is named after nothing.
   */
  session: string
  /** The handle of the durable agent this run serves. It becomes the run's actor id. */
  agent: string
  /** The message, written out for the tool to read. */
  prompt: string
  /** This run's own agent key, carried only in its environment. */
  key?: string | null
  /** Where the run works. The worker refuses anything outside the project's checkout. */
  cwd: string
  /** The address of the Mole Office API, which is the run's only way to the database. */
  api: string
  /** Which project the run writes into. */
  workspace: string
  /** Where this run's output is written, so `readResult` can read it after the run ends. */
  outputPath: string
  /** File the selected effort before the model process starts, when the caller owns a run record. */
  recordEffort?: (effort: string) => Promise<void>
  /**
   * THE CASTING ROW THE QUEUE READ FOR THIS MESSAGE RUN, or none, with its sentence. The start gives it to the office,
   * which reads the row again and takes no other. Absent for a start the queue kept no row for.
   */
  kept?: TheRowAMessageRunKeeps
  /** The provider's own id for a conversation to pick up again. Absent starts a new one. */
  resume?: string
  /** With `resume`, the newest run of that conversation and where its output is (`RunHandle.continues`). */
  continues?: TheRunItContinues
  /**
   * The world this run's agent is a citizen of, and the visit it is working under. Criterion C6.
   *
   * `home` is the database identity of the agent's home world; `visit` is the office id of the trip
   * the worker registered on its behalf. Both absent means the run is working at home, which needs
   * no visit and is not a state to invent one for.
   */
  home?: string
  visit?: string
}

/**
 * WHAT STARTING A PROCESS NEEDS OF A REQUEST, whoever the process is for: the parts `startRun` and
 * `envFor` read. An agent run's `RunRequest` is one; the office's merge tool, which serves no agent and
 * is handed no prompt, asks with this and its own few fields (src/worker/runtimes/merge.ts).
 */
export type RunStart = Pick<RunRequest, 'cwd' | 'api' | 'workspace' | 'outputPath' | 'resume' | 'continues' | 'home' | 'visit' | 'key'>

/**
 * WHAT THE LAUNCHER SAID WHEN IT STARTED THE RUN, kept for the one sentence a native refusal gets: the effort it was
 * started at, the native model, the row the selection came from, and the row's own effort when the two differ. Absent on
 * a start the launcher gave no values for, and on a handle picked up after a worker restart.
 */
export interface TheStartTheLauncherGave {
  effort?: string | null
  native?: { model: string }
  selection?: { casting: { id: number } | null } | null
  rowsEffort?: string | null
}

/** What `start` gives back: enough to find the run again, stop it, and read what it said. */
export interface RunHandle {
  /** The runtime word this is a run of. */
  runtime: string
  effort?: string | null
  effortFrom?: string
  ruleEffort?: string | null
  startWords?: string
  /** The launcher's start values, when it gave any; the sentence for a refused effort reads them. */
  start?: TheStartTheLauncherGave
  pid: number
  /** The process group. Everything the run starts in turn is in it, so one signal ends all of it. */
  pgid: number
  /**
   * The sentence of a stop that ended the group at once rather than asking it to stop, which is the
   * only stop on Windows (`endRun` in ./common.ts). Absent when no stop ended it that way.
   */
  endedAtOnce?: string
  /** Local wall-clock time, the same reader and writer everything else here uses. */
  startedAt: string
  /** Absent on recovered legacy handles: their old local stamp cannot identify an instant. */
  startedTime?: import('../../shared/time.ts').ClockStamp
  /**
   * The provider's own id for this conversation, when it is known at the moment of starting.
   *
   * It is known when resuming, because the caller supplied it. For Codex and OpenCode it is not
   * known for a new conversation: the tool mints one and prints it near the start of its output, so
   * this is null until the worker has read it there with `conversationSoFar`. Null here means
   * nobody has read one yet, never "there is none".
   *
   * FOR CLAUDE CODE AND KIMI IT IS ALWAYS KNOWN, because both tools take the id from whoever starts
   * them (`--session-id` and `-S`). Those adapters choose one and put it here at the moment of
   * starting, so nothing about their runs depends on finding an id in somebody else's output.
   */
  providerSession: string | null
  /**
   * The provider's id this run was started to resume, as the caller gave it, or null for a new conversation. It is
   * kept apart from `providerSession`, which the worker fills in once it has read the id, so it says whether the run
   * resumed. A Codex receipt needs that: a resumed thread reports its total so far, not the run's own (wave 13s round
   * 42). Absent on handles saved before that round.
   */
  resumed?: string | null
  /**
   * THE RUN WHOSE CONVERSATION THIS RUN PICKED UP, and where that run's output is, or absent because the worker was not
   * told it. A resumed Codex thread reports its total so far, so a Codex receipt takes the total this run reported at its
   * end off its own (wave 13s round 43). Absent on a resumed handle, the receipt says the figures are the thread's.
   */
  continues?: TheRunItContinues
  /** The file the run's output is going to. */
  outputPath: string
  /** The file holding its exit code, absent only on handles saved before this field existed. */
  exitCodePath?: string
  /** The working directory it ran in, absent only on handles saved before round 36. Claude Code's transcripts are kept by it. */
  cwd?: string
}

/** How a run ended. */
export type EndedHow = 'answered' | 'failed' | 'stopped' | 'still-running'

/** One trimming rule for the answer text all runtime adapters store (problem `qi-LJDIwunIL`). */
export function trimAnswer(answer: string): string {
  return answer.trim()
}

/** What a run said. */
export interface RunResult {
  /** The runtime envelope, never an estimate from the answer text. */
  usageReceipt?: UsageReceipt
  /** What the agent answered, in its own words. Empty when it said nothing. */
  text: string
  /** The provider's own id for this conversation, or null because none was in the output. */
  providerSession: string | null
  endedHow: EndedHow
  /** One plain sentence saying how this was read, for a person looking at a run that went wrong. */
  because: string
  /** A completed second check answer gave no verdict. Only the check tool's dedicated exit proves this. */
  inspectionEnding?: 'no-verdict'
  /** The check tool's line carried a dsh transcript the line's reader refused. Only the check tool reads it. */
  dshTranscriptRefused?: true
  /**
   * WHY THE PROVIDER STOPPED THE RUN, in its own words, when its output named a cause: the shape of a session's
   * `stopCause` (src/config/stopped-run-cause.mjs). Absent when the output named none. Only the check tool reads it today.
   */
  stopCause?: { kind: string; said: string; at: string | null; resetsAt: string | null }
}

/**
 * WHAT AN ADAPTER WOULD RUN: the program, its arguments, and what it changes in the run's environment.
 *
 * `env` is for what a tool takes from the environment rather than its command line: OpenCode's permissions, which two
 * decisions set and src/config/run-permissions.mjs works out. It also carries
 * the main-world guard's plugin, from src/config/main-world-guard.mjs. A value sets the variable, null takes an
 * inherited one out, and absent changes nothing. `envFor` applies it, so the environment is still built in one place.
 */
export interface CommandLine {
  command: string
  args: string[]
  /** An early effort default supplied by the adapter. A fresh office answer replaces it at the model start. */
  defaultEffortAt?: number
  /** Where that default came from, in words. The start names it when the default is put back. */
  defaultEffortFrom?: string
  env?: Record<string, string | null>
  /**
   * TEXT TO GIVE THE CHILD ON STANDARD INPUT, for a runtime whose command names `-` in place of its prompt.
   *
   * It is written to a file only its owner can read and handed over as an open descriptor, so the run may outlive
   * the worker that started it without a pipe tying the two together, and no prompt word is left where the process
   * list can read it. Absent for every runtime that takes its prompt on the command line.
   */
  stdin?: string
}

/** One agent tool. */
export interface RuntimeAdapter {
  /** The runtime word, as the agent registry spells it. */
  readonly runtime: string
  /** The program this runs. */
  readonly command: string
  /** The file this tool reads its rules from, in the run's working directory. */
  readonly rulesFile: RulesFile
  /** Where the program is on this machine, or null because it is not installed. */
  whereItIs(): string | null
  /** The command line this adapter would run. Worked out, not run. */
  /**
   * WHICH MODEL A RUN OF THIS TOOL WOULD BE GIVEN, or absent because this tool is told elsewhere.
   *
   * Criterion M85. Optional on purpose: only the adapter that passes a model can say what it passes,
   * and an adapter that names one it does not pass would put a fact on a run's record that never
   * reached the command. The worker writes the model onto the run only where the adapter answers.
   * Null means nobody named a model, and `startOne` in src/worker/index.ts refuses the run.
   */
  modelItWouldUse?(): string | null
  /**
   * WHAT REASONING EFFORT A RUN OF THIS TOOL WOULD BE GIVEN, or absent because none is passed.
   *
   * Criterion T7. The same rule in the same words as the model above: only the adapter that passes
   * a variant can say what it passes, and an adapter that names one it does not pass would invent a
   * fact. The worker writes the variant onto the run's record as `effort` only where the adapter
   * answers. The shared launcher passes the owner's effort flags to Claude Code, Codex and OpenCode.
   */
  variantItWouldUse?(): string | null
  commandFor(run: RunRequest): CommandLine
  start(run: RunRequest): RunHandle | Promise<RunHandle>
  /**
   * THE CONVERSATION ID THE RUN HAS PRINTED SO FAR, or null because it has printed none yet.
   *
   * Plan hp7Z-IW9JWSX, piece H5, for criterion W6: the id goes on the run's record when the run
   * starts, not when it ends, so a run killed mid-turn can still be resumed. Codex and OpenCode
   * print their id near the start of their event stream, and the worker reads it with this on every
   * pass while the run is going. `readResult` reads the id with the same function, so the two
   * readings cannot disagree. Absent on an adapter whose id is on the handle from the start (Claude
   * Code and Kimi choose it themselves) or which has none (the check and the merge tool).
   */
  conversationSoFar?(handle: RunHandle): string | null
  /**
   * THE TOKENS THE RUN HAS SPENT SO FAR, read from what its runtime has written while it runs, or no count with the
   * reason (wave 14d). The worker reads it on its passes and writes the count on the run's record
   * (recordTheTokensSoFar in ../index.ts), and the office reminds the run of its step when the count reaches the
   * setting. Which tokens are counted is said once, in src/config/tokens-so-far.mjs, and `read` names it. Absent on an
   * adapter whose runtime writes no count while it runs (Kimi) or that runs no model.
   */
  tokensSoFar?(handle: RunHandle): { tokens: number; read: string } | { tokens: null; why: string }
  alive(handle: RunHandle): boolean
  stop(handle: RunHandle, why: string): void
  readResult(handle: RunHandle): RunResult
  /**
   * WHAT THE RUNTIME SERVED THE RUN, read from the runtime's own record of it once the run has ended. HB1 and a
   * decision say every runner writes `served` at the run's end. Required, so an adapter added
   * later cannot leave it out without the type checker saying so. The readings are worked out in
   * src/config/runtime-served.mjs and src/config/claude-code-served.mjs.
   */
  servedOf(handle: RunHandle): ServedReading
}

/** The `Served` shape of src/shared/kinds.ts, with one sentence saying what was read and where. */
export interface ServedReading {
  served: {
    model: string
    temperature: number | string
    briefBytes: number | string
    contextTokens: { largestTurn: number | string; total: number | string }
  }
  said: string
}

/**
 * THE RUNTIME WORD OF THE OFFICE'S OWN CHECK TOOL (tools/the-inspector.mjs), started by
 * src/worker/runtimes/inspection.ts. It is the one runtime `envFor` hands the database path to.
 */
export const INSPECTION_RUNTIME = 'inspection-tool'

/**
 * THE TOOL A RUN STARTED BY THIS ADAPTER DECLARES, written on its session record as `adaptedTool`, is the adapter's
 * runtime word when that word is one of the tools Mole Office adapts, and null otherwise. Problem uh6-H72Zik9H and a
 * decision say so. Null is the answer for the fake runtime, the office's check tool and its
 * merge tool, none of which is an adapted tool: a fake run must never be counted as a real tool's, and the other two
 * run no agent tool at all.
 */
export function theToolARunDeclares(adapter: { readonly runtime: string }): AgentRuntime | null {
  return isAgentRuntime(adapter.runtime) ? adapter.runtime : null
}


/**
 * THE MODEL FOR A COMMAND LINE, or a loud failure when there is none. `startOne` refuses a run with no
 * model before it builds a command, so reaching the failure here means that check was skipped.
 */
export function theModelForTheCommand(model: string | null, place: 'check' | 'conversation'): string {
  if (model === null) throw new Error(NO_MODEL_SAYS[place])
  return model
}
/**
 * THE ENVIRONMENT A RUN IS GIVEN, BUILT IN ONE PLACE.
 *
 * `MOLE_OFFICE_DB` is not in it and that is the point. A run reaches the database through the API,
 * with the actor headers for the agent it serves, so its writes are attributed to that agent and
 * meet the same rules as everybody else's. A run holding the database file would write rows nothing
 * validated.
 *
 * The variables a tool needs to find its own credentials — `HOME`, `PATH` and the rest — are passed
 * through, because a run that cannot authenticate cannot answer.
 *
 * THE ONE EXCEPTION IS THE CHECK TOOL, the runtime `INSPECTION_RUNTIME`. It is the office's own
 * process and not an agent, and it was decided that it is given the database this worker serves. The tool
 * finds the office's key beside `MOLE_OFFICE_DB` (`theOfficeKey`, src/config/office-key.mjs). Given
 * none, it would read the key beside the database of the checkout it runs in. In a test world that
 * is not the world's key, and the world would refuse its verdict. The path is made absolute here,
 * against this worker's own checkout, the same way this worker finds its own key. So the tool cannot
 * resolve it against a different checkout. Every other runtime is given no `MOLE_OFFICE_DB`.
 *
 * THE OFFICE'S OWN TOOLS KEEP THE PAIRING THIS WORKER RUNS WITH (wave 13q, the first problem after the switch). The
 * stable office's worker runs from the stable checkout with MOLE_OFFICE_DEVELOPMENT_CHECKOUT, and starts the merge tool,
 * the check tool and the sandbox launcher from that checkout. Only through that variable do their settings, their key
 * file and the checkout a check reads come from the development checkout. Without it, the merge tool found no key and
 * every write it made was refused, and the launcher gave every round the placeholder commit address. A tool that runs
 * in the development checkout itself reads its .env as its own and would refuse the variable, so it is given none, and
 * so is every agent's run.
 */
// THE UNION IS FOR THE CALLERS, NOT THE BODY: an agent run's whole `RunRequest` is accepted as written,
// and the merge tool's smaller request (`RunStart` and a session) as well. Only the four fields read below matter.
// `runtime` is the adapter's runtime word. Absent is treated like any runtime that is not the check tool.
export function envFor(
  run: RunStart | RunRequest,
  from: NodeJS.ProcessEnv,
  changes: CommandLine['env'] = {},
  runtime?: string,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(from)) {
    if (value === undefined) continue
    // EVERY MOLE_OFFICE_ SETTING IS DROPPED AND THE THREE A RUN NEEDS ARE PUT BACK BELOW. Dropping
    // by prefix rather than naming `MOLE_OFFICE_DB` means a setting added later is absent from a
    // run until somebody decides a run should have it.
    if (key.startsWith('MOLE_OFFICE_') || key === 'MOLE_AGENT_KEY') continue
    out[key] = value
  }
  // WHAT THE ADAPTER'S COMMAND LINE CHANGES IN THE ENVIRONMENT: a tool's permissions, where the tool
  // reads them from there. A Mole Office setting is never one of them, so the rule above stays whole.
  for (const [key, value] of Object.entries(changes ?? {})) {
    if (key.startsWith('MOLE_OFFICE_') || key === 'MOLE_AGENT_KEY') continue
    if (value === null) delete out[key]
    else out[key] = value
  }
  // THE TWO A RUN NEEDS: where the API is, and which project it is working in. Both are settings
  // this repository declares, and the Mole Office skill reads the first of them to find the API.
  //
  // WHO THE RUN IS TRAVELS IN THE PROMPT AND NOT IN THE ENVIRONMENT. The actor headers are three
  // words an agent puts on every request, and no agent tool reads an environment variable to find
  // them. Inventing two here would be two settings nothing declares and nothing reads.
  // A child gets only its own key. An inherited worker key may belong to another agent.
  if (typeof run.key === 'string' && run.key !== '') out['MOLE_AGENT_KEY'] = run.key
  out['MOLE_OFFICE_API'] = run.api
  out['MOLE_OFFICE_WORKSPACE'] = run.workspace
  // AND, FOR A RUN WORKING AWAY FROM HOME, THE WORLD IT BELONGS TO AND THE TRIP IT IS ON.
  // Criterion C6 of design/messages/ACCEPTANCE.md section 8: *the run's environment carries its home
  // and the visit id.* Both are absent for a run working at home, which is the ordinary case and
  // needs no visit — an empty value here would be a claim that there is one.
  if (run.home !== undefined) out['MOLE_OFFICE_HOME_WORLD'] = run.home
  if (run.visit !== undefined) out['MOLE_OFFICE_VISIT'] = run.visit
  // AND, FOR THE CHECK TOOL ONLY, THE DATABASE THIS WORKER SERVES, as an absolute path.
  if (runtime === INSPECTION_RUNTIME) out['MOLE_OFFICE_DB'] = databasePathFrom(from)
  // AND, FOR THE MERGE TOOL, THE CHECK TOOL AND THE SANDBOX LAUNCHER, THE PAIRING, from the one helper and by this
  // worker's own pairing: the stable checkout's tools get it, the development checkout's get none, and a run in any
  // other checkout is refused, naming MOLE_OFFICE_WORKER_CHECKOUT (src/config/the-office-tool-environment.mjs).
  const ownTool = runtime === INSPECTION_RUNTIME || runtime === MERGE_TOOL_RUNTIME || runtime === ROUND_LAUNCHER_RUNTIME
  if (ownTool) return theOfficeToolEnvironment(out, run.cwd, 'MOLE_OFFICE_WORKER_CHECKOUT').env as Record<string, string>
  return out
}

/** The line an adapter writes when it read no provider conversation id out of a run's output. */
export const NO_CONVERSATION_ID =
  'This run answered, and its output held no id for the conversation. So it cannot be picked up ' +
  'again and the next message to this agent starts a new one.'
