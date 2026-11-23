// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { kimiUsage } from './usage.ts'
/**
 * KIMI CLI, AS ONE RUNTIME ADAPTER.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH KIMI THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * Moonshot AI's `kimi-cli` from PyPI, version 1.50.0, whose binary is `kimi`. Moonshot ships two
 * programs called Kimi and both install a binary of that name: the other one is
 * `@moonshot-ai/kimi-code` on npm, and it is not this. Both call themselves "Kimi Code CLI" in
 * their own help, and their version numbers point the wrong way — the higher number, 1.50.0, is
 * the older product. `design/agents/FRAMEWORK-SURVEY-2026-09.md` measured both and keeps them
 * apart. Nothing here serves the npm one.
 *
 * Kimi CLI is in the adapter list too, and the other two CLIs are left out.
 *
 * ---------------------------------------------------------------------------------------
 * THE COMMAND, READ AND MEASURED ON THIS MACHINE ON 5 SEPTEMBER 2026, VERSION 1.50.0
 * ---------------------------------------------------------------------------------------
 *
 *     kimi --print -p <prompt> -w <cwd> -S <the id we choose> \
 *          --output-format stream-json --final-message-only
 *
 * `--print` is print-and-exit, so the run is over when the process is. `-w` is the working
 * directory the agent works in. `-S` is the conversation, and the same flag both mints one and
 * picks one up again, so the resume command is this command with a different id.
 *
 * ---------------------------------------------------------------------------------------
 * WE CHOOSE THE CONVERSATION ID, WHICH IS WHY THERE IS NOTHING TO GUESS
 * ---------------------------------------------------------------------------------------
 *
 * Kimi CLI is one of the few tools in the survey where the caller names the conversation. So this
 * adapter never searches somebody else's output for an id: it builds one from Mole Office's own id
 * for the run — the `session` record the worker filed for it — and hands that to `-S`. The id is
 * known before the process starts and is on the handle from that moment.
 *
 * THE ID BECOMES A DIRECTORY NAME, so it has to be safe as one. Measured on 5 September 2026: a run
 * started with `-S control-run-001` left its transcript in
 * `~/.kimi/sessions/<Kimi's own hash of the working directory>/control-run-001/`. So
 * `theConversationId` below keeps only letters, digits, dashes and underscores, and puts a prefix
 * in front so that an id starting with a dash can never be read by the command line as a flag.
 * Mole Office's ids are twelve characters from nanoid's alphabet, which is exactly those four
 * kinds of character — a leading dash included — so the prefix is the part that is load-bearing
 * today and the filtering is what keeps it true if the ids ever change.
 *
 * RESUMING AN ID KIMI HAS NEVER SEEN STARTS A FRESH CONVERSATION UNDER THAT NAME, and says nothing.
 * Measured on 5 September 2026: `-r no-such-session-at-all` made a session directory of that name
 * rather than refusing. The npm Kimi answers `Session "…" not found`; this one does not. So an id
 * this adapter cannot use is refused HERE, before the process starts, rather than handed over to be
 * silently turned into a new conversation.
 *
 * ---------------------------------------------------------------------------------------
 * WHY `stream-json` AND NOT `text`
 * ---------------------------------------------------------------------------------------
 *
 * Because a refusal has to be told apart from an answer, and with `--output-format text` it cannot
 * be. Two things were measured on 5 September 2026 and one was read out of the shipped program:
 *
 *   Measured. `kimi --print -p "say ok" --output-format text --final-message-only`, on a machine
 *   with no Kimi credentials, printed `LLM not set` on STANDARD OUTPUT — where an answer goes — and
 *   exited 1. The line `To resume this session: kimi -r <id>` went to standard error, and it is
 *   printed by every run, successful or not, so it says nothing about how the run went.
 *
 *   Measured. `--output-format stream-json` printed the same bare line on that failure, because the
 *   failure happens before any turn produces a message.
 *
 *   Read from the program. `kimi_cli/ui/print/visualize.py` at 1.50.0 has a printer per output
 *   format. With `--output-format stream-json --final-message-only` a turn that produced an answer
 *   prints ONE JSON object, `{"role":"assistant","content":"<the text>"}`, and every failure path in
 *   `kimi_cli/ui/print/__init__.py` prints the failure with `rich.print` as plain text instead.
 *   Building that same object with the same library on this machine gave exactly that JSON.
 *
 * So an answer is a JSON object naming the assistant, and anything else on standard output is not
 * an answer. That is the distinction `readResult` reads, and it is the same shape of reading the
 * Claude Code adapter does.
 *
 * THE EXIT CODE IS NOT AVAILABLE HERE and this file does not pretend otherwise. A run is started
 * detached with its output going to a file, so what a reader has afterwards is the two files. That
 * is why the distinction above had to come out of the output rather than out of the status.
 *
 * ---------------------------------------------------------------------------------------
 * TWO MORE THINGS A READER SHOULD KNOW
 * ---------------------------------------------------------------------------------------
 *
 * IT PHONES HOME BY DEFAULT. `KIMI_DISABLE_TELEMETRY=1` TURNS OFF ONE HALF OF THAT AND NOT THE
 * OTHER, AND THIS SAYS WHICH HALF.
 *
 * WHAT THE VARIABLE STOPS. The telemetry sink. `kimi_cli/app.py:333` in 1.50.0 reads it, and on a
 * true value calls `disable_telemetry()` and builds no sink and no transport — so nothing is queued
 * for `https://telemetry-logs.kimi.com/v1/event` (`kimi_cli/telemetry/transport.py:22`) and no
 * `~/.kimi/telemetry/failed_*.jsonl` is written. Measured on 5 September 2026, twice: a run without
 * it left two of those files, and the same run with it set left none.
 *
 * WHAT THE VARIABLE DOES NOT STOP, AND THIS IS THE PART THAT WAS WRONG HERE UNTIL 6 SEPTEMBER 2026.
 * A run that reaches a model still mints a device id and still sends it, with this machine's name,
 * on every request:
 *
 *   THE FILE. `get_device_id()` at `kimi_cli/auth/oauth.py:228` writes a fresh 32-character uuid to
 *   `<share directory>/device_id` if it is not already there, then chmods it to 0600. The share
 *   directory is `~/.kimi` unless `KIMI_SHARE_DIR` names another one (`kimi_cli/share.py:9`).
 *   Measured on 5 September 2026 with `KIMI_DISABLE_TELEMETRY=1` set and a working key:
 *   `~/.kimi/device_id` was there afterwards.
 *
 *   THE HEADERS. `_common_headers()` at `kimi_cli/auth/oauth.py:250` builds `X-Msh-Platform`,
 *   `X-Msh-Version`, `X-Msh-Device-Name` (this machine's hostname, from `platform.node()`),
 *   `X-Msh-Device-Model` (on Linux, the system, kernel release and architecture),
 *   `X-Msh-Os-Version` (the kernel build string) and `X-Msh-Device-Id`. `_kimi_default_headers` at
 *   `kimi_cli/llm.py:317` puts all six on the chat client at `kimi_cli/llm.py:357`, as its
 *   `default_headers`, so every model request of the run carries them.
 *
 *   WHY THE VARIABLE CANNOT REACH EITHER. The chat client is built by `create_llm` at
 *   `kimi_cli/app.py:243`, and `_common_headers()` mints the device id while building it. The
 *   telemetry gate is ninety lines later, at `app.py:333`. The id exists before the switch is read.
 *
 *   WHERE THEY GO. Wherever the run is pointed. Those headers are chosen by the PROVIDER'S TYPE and
 *   not by the host: `kimi_cli/llm.py:349` matches `case "kimi"`, which is the same provider type
 *   `KIMI_BASE_URL` redirects, and there is no host check anywhere in that path. So a run pointed at
 *   a third party sends this machine's name and id to the third party. READ FROM THE PROGRAM, NOT
 *   SEEN ON THE WIRE: nobody has captured the requests of a run to check.
 *
 * WHY THE OLD SENTENCE HERE WAS WRONG. It said a run with the variable set wrote no device id, and
 * that was true of the run it was taken from — a machine with no credentials, where `create_llm`
 * returns before the headers are ever built, so the minting code is never reached. It is not true of
 * any run that answers. Problem MP-cIWO25U9W.
 *
 * THERE IS NO WAY TO TURN THE DEVICE ID OR THE HEADERS OFF, and this file promises none. The whole
 * of kimi-cli 1.50.0 was searched on 6 September 2026 for one: no environment variable, no key in
 * `~/.kimi/config.toml` and no command-line flag does it. The only privacy key the config has is
 * `telemetry` (`kimi_cli/config.py:261`), which is the same switch as the variable and stops the
 * same half. `KIMI_SHARE_DIR` moves the file somewhere else; it does not stop it being written or
 * sent. Anybody who needs those headers not to leave the machine has to keep the run off the
 * network, not configure it away.
 *
 * `--print` AUTO-APPROVES TOOL CALLS FOR THAT ONE INVOCATION, in its own help's words, and there is
 * no headless mode without it. The Claude Code, Codex and OpenCode adapters beside this one widen a
 * run only where a decision allows it: in a sandbox, or on the host behind the main-world guard, as
 * src/config/run-permissions.mjs works out. That is because giving a started
 * run powers is a decision, not a default. Kimi is not one of the tools those decisions name. Here the powers come with
 * the only way to run headless at all, so this file states it rather than leaving it to be discovered: nothing extra is
 * passed — not `--yolo`, not `--afk` — and `--print` is what it is, on the host as well.
 *
 * THE RULES IT READS ARE `AGENTS.md` IN THE WORKING DIRECTORY, the same file Codex and OpenCode
 * read, written by `src/worker/rules.ts` from the same source as Claude Code's `CLAUDE.md`.
 * Measured on 5 September 2026: the system prompt of a run in an empty directory names `AGENTS.md`
 * and says it merges them from every applicable directory.
 *
 * ---------------------------------------------------------------------------------------
 * THIS ADAPTER HAS BEEN RUN AGAINST THE INSTALLED PROGRAM, AND A MODEL HAS ANSWERED THROUGH IT
 * ---------------------------------------------------------------------------------------
 *
 * FIRST, ON 5 SEPTEMBER 2026, WITH NO CREDENTIAL, so nothing answered. kimi-cli 1.50.0 at
 * `~/.local/bin/kimi`, `HOME` pointed at a scratch directory. `start` resolved that path, ran the
 * command above and ended on its own. `readResult` answered `failed`, with Kimi's own words —
 * `LLM not set` — and the conversation id this adapter chose; standard error held
 * `To resume this session: kimi -r mole-office-RealRun00001`, so the id was taken exactly as it was
 * handed over; and the transcript was at
 * `<scratch home>/.kimi/sessions/8f174cb…/mole-office-RealRun00001/`, which is the shape
 * `whereTheTranscriptIs` says it is.
 *
 * THEN, ON 5 SEPTEMBER 2026, WITH A MODEL. Verifier KV drove this adapter with the real message
 * worker; a model answered, `readResult` read the answer as an answer, and the conversation id was
 * on the session record from the moment the run started. The whole run, every command and its
 * output, is in `design/agents/KIMI-RUN-2026-09-06.md`.
 *
 * TWO THINGS THAT RUN MEASURED AND THIS FILE HAD WRONG. The answer arrives with a space in front of
 * it and this adapter used not to trim it (problem 3eZN6NO8SGQt, fixed in `readResult` below). And
 * a run that answers writes a device id and sends it however the telemetry switch is set (problem
 * MP-cIWO25U9W, and the section above now says exactly what that switch does and does not do).
 *
 * NOT MEASURED ON THE OWNER'S OWN MOONSHOT KEY. That key authenticates against
 * `https://api.moonshot.ai/v1` but the account behind it has a zero balance and is suspended, so
 * every model call answers HTTP 429. The model that answered was the same model served by
 * OpenRouter, reached by pointing `KIMI_BASE_URL` at it — the same program and the same adapter,
 * a different endpoint and a different billing account. Nothing here says a Moonshot-served run
 * behaves identically. That empty account is problem 8YffJbtvKiaN and it is the owner's to settle.
 *
 * ITS PROGRAM IS LOOKED UP IN THE WHOLE ENVIRONMENT IT WAS GIVEN, through `whereItIs` in ./os.ts, so on Windows a
 * search path held as `Path` is found.
 */

import { KIMI_SETTINGS, readSetting } from '../../config/settings.mjs'
import { providerKeyFromTheFileThenTheEnvironment } from '../../config/provider-keys.mjs'
import {
  NO_CONVERSATION_ID,
  trimAnswer,
  type RunHandle,
  type RunRequest,
  type RunResult,
  type RuntimeAdapter,
  type ServedReading,
} from './adapter.ts'
import { theServedOfAKimiRun } from '../../config/runtime-served.mjs'
import { endRun, jsonLines, nothingWasPrinted, outputOf, runIsAlive, startRun, withExitStatus } from './common.ts'
import { whereItIs } from './os.ts'

/**
 * WHAT A KIMI RUN IS TOLD ABOUT ITS MODEL, built from the declaration and not from names typed here.
 *
 * THE PROBLEM THIS CLOSES. Until 6 September 2026 nothing in this repository said how a Kimi run
 * got a key. `envFor` passes the whole environment through, so a run authenticated only if whoever
 * started the worker happened to have the right variables in their shell, and nobody was told which
 * ones. The owner had supplied a key and it did nothing. Problem oY8Vs5feaRai.
 *
 * THE THREE NAMES ARE KIMI CLI'S OWN, read out of the shipped program at `kimi_cli/llm.py:276`:
 * KIMI_API_KEY, KIMI_BASE_URL and KIMI_MODEL_NAME. `src/config/settings.mjs` declares all three,
 * with what each is for and what it means when nobody sets it, and this reads them from there —
 * so the names exist in one place and `GET /api/runtime` reports on the same three.
 *
 * THE ONE TRANSLATION: the owner keeps their key under `MOONSHOT_API_KEY`, which is the owner's name for it
 * on Moonshot's global platform, and KIMI CLI NEVER READS THAT NAME. So when a key is set under
 * that name and not under `KIMI_API_KEY`, it is handed to the run as `KIMI_API_KEY`. Setting
 * `KIMI_API_KEY` yourself wins, because the name Kimi reads is the more specific statement.
 *
 * THE OFFICE'S OWN KEY FILE IS READ FIRST, and the two environment names only when nothing is set
 * there. Criterion U2: a key set on the Settings page is the office's own and takes precedence, and
 * the environment names are what keep an installation that already had one working.
 *
 * WHAT IS NOT SUPPLIED, AND WHY NOT. No endpoint and no model name. Neither has a default here and
 * neither is guessed from the other: which service a key belongs to cannot be read off the key, and
 * a wrong guess would send somebody's credential to a company they did not choose. With no endpoint
 * Kimi CLI's own default provider is empty and the run prints `LLM not set` and stops, which is a
 * refusal a person can read rather than a run that quietly went somewhere.
 *
 * A NAME SET TO AN EMPTY VALUE STOPS THE RUN, and the refusal comes from the declaration and names
 * the variable. Set-and-empty and never-set are different statements.
 */
export function whatKimiIsToldAboutItsModel(from: NodeJS.ProcessEnv): Record<string, string> {
  const told: Record<string, string> = {}
  const reading = providerKeyFromTheFileThenTheEnvironment(
    'moonshot',
    [KIMI_SETTINGS.key, KIMI_SETTINGS.ownersKey],
    from,
  )
  if (reading.empty) {
    throw new Error(
      `${reading.why}. Set and empty and not set at all are different statements, and this cannot guess ` +
        'which you meant.',
    )
  }
  if (reading.value !== null) told[KIMI_SETTINGS.key] = reading.value
  for (const name of [KIMI_SETTINGS.baseUrl, KIMI_SETTINGS.modelName]) {
    const value = readSetting(name, from).value
    if (value !== null) told[name] = value
  }
  return told
}

/**
 * WHAT KIMI CLI IS TOLD ABOUT TELEMETRY, on top of the environment every run is given.
 *
 * It is put into the environment `envFor` reads rather than added afterwards, so the one place a
 * run's environment is built stays the one place.
 *
 * THE NAME IS THE WHOLE OF WHAT IT DOES: the telemetry sink is off. It is not privacy. A run that
 * reaches a model still writes a device id and still sends it with this machine's hostname on every
 * request, and no setting in Kimi CLI 1.50.0 stops that. The header of this file says which lines of
 * the shipped program each half of that comes from.
 */
export const TELEMETRY_OFF: Readonly<Record<string, string>> = { KIMI_DISABLE_TELEMETRY: '1' }

/** What every conversation this adapter mints is called before its id. */
export const OUR_CONVERSATIONS_START_WITH = 'mole-office-'

/** The characters a Kimi conversation id may hold here, because it becomes a directory name. */
const SAFE_IN_A_PATH = /^[A-Za-z0-9_-]+$/

/**
 * THE CONVERSATION ID FOR ONE RUN, built from Mole Office's own id for it.
 *
 * The prefix is not decoration. Kimi makes a directory named after this id, and a command line
 * reads a leading dash as a flag; Mole Office's ids come from nanoid, whose alphabet includes the
 * dash, so one in twelve of them could start with one. The prefix puts a letter first for all of
 * them and says, in the transcript directory, who made it.
 *
 * Anything outside letters, digits, dash and underscore becomes an underscore. Nothing today
 * produces such a character — this is what keeps the sentence above true if the ids ever change.
 */
export function theConversationId(moleOfficeId: string): string {
  return OUR_CONVERSATIONS_START_WITH + moleOfficeId.replace(/[^A-Za-z0-9_-]/g, '_')
}

/** Is this id one Kimi can be given: safe as a directory name, and not readable as a flag? */
export function safeAsAConversationId(id: string): boolean {
  return id !== '' && !id.startsWith('-') && SAFE_IN_A_PATH.test(id)
}

/** Where Kimi keeps this conversation, said in the shape a person can look for it in. */
export function whereTheTranscriptIs(conversation: string): string {
  return `~/.kimi/sessions/<Kimi's own hash of the working directory>/${conversation}/context.jsonl`
}

/** What `--output-format stream-json --final-message-only` prints when a turn produced an answer. */
interface KimiFinalMessage {
  role?: unknown
  content?: unknown
}

export class KimiAdapter implements RuntimeAdapter {
  readonly runtime = 'kimi'
  readonly command = 'kimi'
  readonly rulesFile = 'AGENTS.md' as const

  // NO MODEL IS PASSED ON THE COMMAND LINE, AND THIS ADAPTER DECLARES NO `modelItWouldUse`. Kimi is
  // told its model through its own settings, `whatKimiIsToldAboutItsModel` above. So the Settings
  // page refuses a model for a kimi run answering a message (kimi's line in
  // what-a-runtime-passes-on.ts passes none), rather than store one that would never reach the command.
  constructor(private readonly from: NodeJS.ProcessEnv = process.env) {}

  whereItIs(): string | null {
    return whereItIs(this.command, this.from)
  }

  /**
   * WHICH CONVERSATION THIS RUN IS: the one it was told to pick up, or one built from the run's id.
   *
   * An id handed in that could not be used is REFUSED, rather than mended into a different one. A
   * mended id would name a conversation nobody has, and Kimi would make a fresh one under that name
   * without saying so, so the run would answer out of an empty history looking exactly like a run
   * that carried on.
   */
  conversationFor(run: RunRequest): string {
    if (run.resume !== undefined && run.resume !== '') {
      if (!safeAsAConversationId(run.resume)) {
        throw new Error(
          `"${run.resume}" cannot be handed to Kimi CLI as a conversation to pick up: an id becomes a directory ` +
            'name and a command line argument, so it may hold only letters, digits, dashes and underscores, and ' +
            'may not start with a dash. Nothing was started. Kimi does not refuse an id it has never seen — it ' +
            'makes a new conversation under that name — so a mended id would answer out of an empty history and ' +
            'look like one that carried on.',
        )
      }
      return run.resume
    }
    return theConversationId(run.session)
  }

  commandFor(run: RunRequest): { command: string; args: string[] } {
    return {
      command: this.command,
      args: [
        '--print',
        '-p',
        run.prompt,
        '-w',
        run.cwd,
        '-S',
        this.conversationFor(run),
        '--output-format',
        'stream-json',
        '--final-message-only',
      ],
    }
  }

  /**
   * THE CONVERSATION IS ON THE HANDLE FROM THE MOMENT THE RUN STARTS, because this adapter chose it.
   *
   * `startRun` writes `run.resume ?? null` there, which is right for the three tools that mint their
   * own ids and wrong here: for a new Kimi conversation the id is known and null would say nobody
   * has read one yet.
   */
  start(run: RunRequest): RunHandle {
    const conversation = this.conversationFor(run)
    const told = whatKimiIsToldAboutItsModel(this.from)
    // A RUN THAT CANNOT AUTHENTICATE FAILS HERE, WHERE THE CAUSE IS. Until criterion U2 the key was
    // silently omitted from the run's environment when it was not set, and the refusal happened four
    // layers down inside Kimi CLI's own error message — where nobody could tell a missing key from a
    // wrong endpoint. The two names and the press that fixes it are named here instead. A tool that
    // is not installed is a different refusal and startRun below makes it.
    if (this.whereItIs() !== null && told[KIMI_SETTINGS.key] === undefined) {
      throw new Error(
        'No Kimi key is set, so this run cannot authenticate and nothing was started. Set one on the ' +
          'Settings page under Keys and runtimes, or give a Kimi run a key through ' +
          `${KIMI_SETTINGS.key} or ${KIMI_SETTINGS.ownersKey} in the environment.`,
      )
    }
    const started = startRun(this, run, {
      ...this.from,
      ...TELEMETRY_OFF,
      ...told,
    })
    return { ...started, providerSession: conversation }
  }

  alive(handle: RunHandle): boolean {
    return runIsAlive(handle)
  }

  stop(handle: RunHandle, _why: string): void {
    endRun(handle)
  }

  /** Nothing the office reads of a Kimi run names its model (theServedOfAKimiRun). */
  servedOf(_handle: RunHandle): ServedReading {
    return theServedOfAKimiRun()
  }

  readResult(handle: RunHandle): RunResult {
    const { said, problems } = outputOf(handle)
    const usageReceipt = kimiUsage(said)
    const conversation = handle.providerSession
    const andWhereItIs =
      conversation === null ? '' : ` The conversation is ${conversation} and its transcript is in ${whereTheTranscriptIs(conversation)}.`
    if (said.trim() === '') {
      return withExitStatus(handle, {
        usageReceipt,
        text: '',
        providerSession: conversation,
        endedHow: 'failed',
        because: nothingWasPrinted(this.runtime, problems) + andWhereItIs,
      })
    }
    // THE LAST ASSISTANT MESSAGE IN WHAT IT PRINTED. With --final-message-only there is at most one;
    // the last is taken rather than the first so that a run which printed more than one is read as
    // having ended on the later of them, which is the one a person would call its answer.
    //
    // THE ANSWER USES THE SHARED TRIMMING RULE FROM adapter.ts, and the reason is measured. On
    // 5 September 2026 Kimi CLI printed `{"role":"assistant","content":" MOLE"}` and, through the
    // worker, `{"role":"assistant","content":" BADGER"}`: a leading space on both. This adapter
    // stored it, so a Kimi answer arrived with a space in front of it and the same answer from
    // another tool did not. The shared rule keeps all four answers trimmed the same way.
    // Problem 3eZN6NO8SGQt.
    let answer: string | null = null
    for (const line of jsonLines(said)) {
      const one = line as KimiFinalMessage
      if (one.role === 'assistant' && typeof one.content === 'string') answer = one.content
    }
    if (answer === null) {
      // IT PRINTED SOMETHING AND NONE OF IT WAS AN ANSWER. That is where a refusal lands: Kimi CLI
      // prints a failure as plain text on standard output, in the same place an answer goes, and
      // says which it was only in its exit code. So the raw output is reported as the run's own
      // words with a sentence saying no final message was in it.
      return withExitStatus(handle, {
        usageReceipt,
        text: said.trim(),
        providerSession: conversation,
        endedHow: 'failed',
        because:
          'Kimi CLI printed no final assistant message, so this is its whole output. A run that refused looks ' +
          'like this: on 5 September 2026 a run with no model configured printed "LLM not set" here and exited ' +
          `1.${andWhereItIs}`,
      })
    }
    answer = trimAnswer(answer)
    // KIMI CLI'S FINAL MESSAGE IS A JSON OBJECT AND A REFUSAL IS NOT, so an answer read here stands when the exit went
    // unseen.
    return withExitStatus(
      handle,
      {
        usageReceipt,
        text: answer,
        providerSession: conversation,
        endedHow: 'answered',
        because:
          conversation === null
            ? NO_CONVERSATION_ID
            : 'The answer is the one JSON object Kimi CLI prints with --output-format stream-json ' +
              `--final-message-only, and the conversation is the id this adapter gave it.${andWhereItIs}`,
      },
      { refusalsAreMarked: true },
    )
  }
}
