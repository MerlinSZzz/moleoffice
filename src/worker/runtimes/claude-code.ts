// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { claudeUsage } from './usage.ts'
/**
 * CLAUDE CODE, AS ONE RUNTIME ADAPTER.
 *
 * The command, read from `claude --help` on this machine on 4 September 2026, version 2.1.259:
 *
 *     claude -p <prompt> --output-format json --model <model> --session-id <uuid>   a new conversation
 *     claude -p <prompt> --output-format json --model <model> --resume <id>         picking one up again
 *
 * `-p` is print-and-exit, so the run is over when the process is. `--output-format json` makes the
 * whole answer one JSON object on standard output, which is what `readResult` reads.
 *
 * THE CONVERSATION ID IS CHOSEN HERE, NOT READ BACK AT THE END. Plan hp7Z-IW9JWSX, piece H5, for
 * criterion W6. With `--output-format json` Claude Code prints nothing until the run ends, so a run
 * killed mid-turn used to leave no id anywhere the office could read it. `--session-id` (read from
 * `claude --help`, version 2.1.281, on 3 October 2026) makes the tool use the id it is given. The
 * adapter derives one from the run's own record id (`theClaudeConversationFor`), puts it on the
 * handle when the run starts, and the worker writes it on the record at that moment.
 *
 * THE RULES IT READS ARE `CLAUDE.md` IN THE WORKING DIRECTORY. In a developer checkout that is this
 * repository's own file, and nothing generates one. In an installation, which carries none,
 * `src/worker/rules.ts` writes one from the same sources as `AGENTS.md`, marked as the office's own,
 * and never over a `CLAUDE.md` without that mark (`writeRulesInto`). It writes `AGENTS.md` for the
 * tools that read that name, so they all read the same rules.
 *
 * A PERMISSION FLAG IS PASSED ONLY WHERE A DECISION ALLOWS IT. Until 22 September 2026 none was, on
 * purpose: `--permission-mode bypassPermissions` gives a started run powers, and section 0 of
 * `design/messages/ACCEPTANCE.md` calls giving a started process new powers an important decision
 * point — the owner's, not an agent's. It was made that day. A decision says that inside a sandbox every run gets its
 * tool's full permissions, because the container is the wall. Another decision says that on the
 * host it gets them only when the main-world guard is mounted into Claude Code. Otherwise
 * nothing is added, a run gets the ordinary permissions, and a run that cannot do something says so.
 * Which of the two a run is, and the flag itself, are worked out in src/config/run-permissions.mjs
 * and nowhere here. Measured with 2.1.278: the flag turns the run's `permissionMode` from `default`
 * into `bypassPermissions`.
 *
 * THE MODEL IS PASSED, AND UNTIL CRITERION M85 IT WAS NOT.
 *
 * This file used to say that picking a model here would be deciding what somebody's runs cost, and
 * left the tool's own default to decide instead. Measured on 7 September 2026: that default is
 * whatever the person's CLI is configured with, so fifty-eight runs the office started that night
 * ran on a model nobody chose and none of their records said which. Not choosing was not neutral —
 * it was choosing silently, and leaving no way to find out afterwards.
 *
 * So the model is the one the office chose for this run on the Settings page or the agent's profile
 * (criterion U2), and when it chose none, the one `.env` names: the chore model, then
 * `MOLE_OFFICE_AGENT_MODEL`. It is written onto the run's own session record as well, so a run's
 * cost can be read off the record rather than guessed from the night it happened on.
 *
 * THE MAIN-WORLD GUARD IS MOUNTED ON EVERY RUN. A decision says one office guard, with the same policy for every
 * runtime, runs before each tool call. For Claude Code it is `--settings` with a PreToolUse
 * hook (`claudeCodeGuard` in src/config/main-world-guard.mjs, which also says how each other runtime mounts it).
 * `theGuardOn('claude-code', …)` reads the command back, and that answer is the marker a run's permission flags are set
 * by. Since the guard is on every run this adapter builds, every run it builds on the host is given the flag.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  NO_CONVERSATION_ID,
  theModelForTheCommand,
  type CommandLine,
  type RunHandle,
  type RunRequest,
  type RunResult,
  type ServedReading,
  type RuntimeAdapter,
  trimAnswer,
} from './adapter.ts'
import { endRun, nothingWasPrinted, outputOf, runIsAlive, startModelRun, withExitStatus } from './common.ts'
import { whereItIs } from './os.ts'
import { theModelAChoreIsGiven } from '../../config/chores.mjs'
import { NOTHING_CHOSEN, type TheOfficesChoice } from '../../shared/run-models.ts'
import { whatItPassesOn } from './what-a-runtime-passes-on.ts'
import { claudeCodeGuard, theGuardOn } from '../../config/main-world-guard.mjs'
import { theModelsInAResult, theServedOfAClaudeCodeRun, theTranscriptFolder } from '../../config/claude-code-served.mjs'
import { claudeCodeTokensSoFar } from '../../config/tokens-so-far.mjs'
import { aServed } from '../../config/runtime-served.mjs'
import { thePermissionsARunGets } from '../../config/run-permissions.mjs'

/** What `claude -p --output-format json` prints: one object, with the answer and the conversation id. */
interface ClaudeEnvelope {
  result?: unknown
  session_id?: unknown
  is_error?: unknown
  subtype?: unknown
}

/**
 * THE NAMESPACE OF THE CONVERSATION IDS THIS ADAPTER CHOOSES, a fixed UUID made once for this use.
 * Changing it would give every future run a different id for the same record, and nothing else.
 */
const OUR_CLAUDE_CONVERSATIONS = 'c0f1d2e3-5a4b-4c6d-8e7f-90a1b2c3d4e5'

/**
 * THE CLAUDE CODE CONVERSATION ID FOR ONE RUN, worked out from Mole Office's own id for the run.
 *
 * Claude Code takes only a UUID for `--session-id`. This is a name-based UUID (version 5, RFC 9562
 * section 5.5): the SHA-1 of the namespace above and the record id, with the version and variant
 * bits set. The same record always gives the same id, so the command that starts the run and the
 * handle it returns cannot disagree, and a command worked out again later names the same one.
 */
export function theClaudeConversationFor(moleOfficeId: string): string {
  const namespace = Buffer.from(OUR_CLAUDE_CONVERSATIONS.replace(/-/g, ''), 'hex')
  const bytes = createHash('sha1').update(namespace).update(moleOfficeId, 'utf8').digest().subarray(0, 16)
  bytes[6] = (bytes[6]! & 0x0f) | 0x50
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** The conversation a run is in: the one it picks up, or the one this adapter chooses for a new run. */
function theConversationOf(run: RunRequest): string {
  return run.resume !== undefined && run.resume !== '' ? run.resume : theClaudeConversationFor(run.session)
}

export class ClaudeCodeAdapter implements RuntimeAdapter {
  readonly runtime = 'claude-code'
  readonly command = 'claude'
  readonly rulesFile = 'CLAUDE.md' as const

  constructor(
    private readonly from: NodeJS.ProcessEnv = process.env,
    private readonly chosen: TheOfficesChoice = NOTHING_CHOSEN,
  ) {}

  whereItIs(): string | null {
    return whereItIs(this.command, this.from['PATH'])
  }

  /**
   * WHICH MODEL A RUN OF THIS TOOL IS GIVEN. Criteria M85, T7 and U2.
   *
   * The model the office chose for this run comes first: the agent's own, or the Settings page's
   * (criterion U2, worked out by `theModelARunGets` on the server and carried on the queue row).
   * When it chose none, the installation's chore model when one is named, and
   * `MOLE_OFFICE_AGENT_MODEL` otherwise, read through the one function that answers both. Null when
   * none of them names one: the office ships no model, and `startOne` refuses the run. Which of the
   * office's choice Claude Code passes on is `whatItPassesOn`'s answer, the one the server reads too,
   * and `commandFor` puts this on `--model`. Claude Code gets the owner's effort from the launcher's
   * table. The environment this adapter was built with is the whole world: the worker builds it as
   * `.env` under its own, so a line in the file and a shell's export reach the same answer, and a
   * test that builds an environment of its own gets an answer about that world and not about the
   * checkout's `.env`.
   */
  modelItWouldUse(): string | null {
    return whatItPassesOn(this.runtime, this.chosen).model ?? theModelAChoreIsGiven(this.from)
  }

  commandFor(run: RunRequest): CommandLine {
    const rest = ['-p', run.prompt, '--output-format', 'json', '--model', theModelForTheCommand(this.modelItWouldUse(), 'conversation'), ...claudeCodeGuard(run.agent)]
    if (run.resume !== undefined && run.resume !== '') rest.push('--resume', run.resume)
    else rest.push('--session-id', theConversationOf(run))
    // THE PERMISSION ARGUMENTS COME FIRST, right after the program's name, where every launcher puts
    // them. They are set by the guard as it is read off the rest of this very command.
    const permissions = thePermissionsARunGets(this.runtime, this.from, theGuardOn(this.runtime, { args: rest }))
    return { command: this.command, args: [...permissions.args, ...rest] }
  }

  /** The conversation is on the handle from the moment the run starts, because this adapter chose it. */
  async start(run: RunRequest): Promise<RunHandle> {
    return { ...await startModelRun(this, run, this.from), providerSession: theConversationOf(run) }
  }

  alive(handle: RunHandle): boolean {
    return runIsAlive(handle)
  }

  stop(handle: RunHandle, _why: string): void {
    endRun(handle)
  }

  /**
   * THE TOKENS SO FAR FROM THE RUN'S CONVERSATION FILE, which Claude Code writes as it goes, in its transcript folder
   * (theTranscriptFolder) and named by the conversation this adapter chose. Only the lines since the run began are
   * counted, because a resumed conversation's file holds the rounds before it. The whole file is read each time; the
   * worker asks at most once every 30 seconds.
   */
  tokensSoFar(handle: RunHandle): { tokens: number; read: string } | { tokens: null; why: string } {
    if (handle.cwd === undefined) return { tokens: null, why: "The run's working directory was not kept on its handle, so its conversation file is not known." }
    if (handle.providerSession === null) return { tokens: null, why: 'The run names no conversation, so its conversation file is not known.' }
    const folder = theTranscriptFolder(this.from, handle.cwd)
    if (folder === null) return { tokens: null, why: 'The command had neither CLAUDE_CONFIG_DIR nor HOME, so there is no conversation folder to read.' }
    const file = join(folder, `${handle.providerSession}.jsonl`)
    let text: string
    try {
      text = readFileSync(file, 'utf8')
    } catch (err) {
      return { tokens: null, why: `The conversation file ${file} could not be read: ${(err as Error).message}` }
    }
    return claudeCodeTokensSoFar(text, Date.parse(handle.startedTime?.instant ?? handle.startedAt.replace(' ', 'T')))
  }

  /**
   * THE MODEL FROM THE RUN'S OWN JSON RESULT, and its context from its transcripts, as tools/sandbox-start.mjs reads a
   * Claude Code run (theServedOfAClaudeCodeRun). A handle saved before round 36 has no working directory, so for it the
   * transcripts are not looked for and the sentence says so.
   */
  servedOf(handle: RunHandle): ServedReading {
    if (handle.cwd === undefined) {
      const models = theModelsInAResult(outputOf(handle).said) ?? []
      return { served: aServed(models), said: "The run's working directory was not kept on its handle, so only its JSON result was read, and no transcript." }
    }
    return theServedOfAClaudeCodeRun({ outPath: handle.outputPath, env: this.from, cwd: handle.cwd, startedAt: handle.startedTime?.instant ?? handle.startedAt, briefPath: null })
  }

  readResult(handle: RunHandle): RunResult {
    const { said, problems } = outputOf(handle)
    const usageReceipt = claudeUsage(said)
    if (said.trim() === '') {
      return withExitStatus(handle, {
        usageReceipt,
        text: '',
        providerSession: handle.providerSession,
        endedHow: 'failed',
        because: nothingWasPrinted(this.runtime, problems),
      })
    }
    let envelope: ClaudeEnvelope | null = null
    try {
      const parsed: unknown = JSON.parse(said)
      if (typeof parsed === 'object' && parsed !== null) envelope = parsed as ClaudeEnvelope
    } catch {
      envelope = null
    }
    if (envelope === null) {
      // WHAT IT PRINTED IS STILL WHAT IT SAID. Reporting the raw text is the same run's words; it is
      // the structure that was missing, and the sentence says so rather than calling this a success.
      return withExitStatus(handle, {
        usageReceipt,
        text: said.trim(),
        providerSession: handle.providerSession,
        endedHow: 'failed',
        because:
          'Claude Code was asked for JSON and printed something else, so this is its raw output and ' +
          'nothing here read a conversation id out of it.',
      })
    }
    const text = typeof envelope.result === 'string' ? trimAnswer(envelope.result) : ''
    const session = typeof envelope.session_id === 'string' ? envelope.session_id : null
    const failed = envelope.is_error === true
    // CLAUDE CODE MARKS A REFUSAL ITSELF (`is_error`), so an answer read here stands when the exit went unseen.
    return withExitStatus(
      handle,
      {
        usageReceipt,
        text,
        providerSession: session ?? handle.providerSession,
        endedHow: failed ? 'failed' : 'answered',
        because: failed
          ? `Claude Code reported an error of its own: ${typeof envelope.subtype === 'string' ? envelope.subtype : 'it did not say which'}.`
          : session === null
            ? NO_CONVERSATION_ID
            : 'Read from the one JSON object Claude Code prints with --output-format json.',
      },
      { refusalsAreMarked: true },
    )
  }
}
