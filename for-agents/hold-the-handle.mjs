#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WAITER: it says this session is answering as a durable agent, and keeps saying so.
 *
 *     node for-agents/hold-the-handle.mjs --session <the session record for this run>
 *     node for-agents/hold-the-handle.mjs --agent <handle> --session <record id>
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT IS FOR
 * ---------------------------------------------------------------------------------------------
 *
 * Criterion H1 of design/messages/ACCEPTANCE.md section 10: a script mounted on a live session
 * keeps its terminal heartbeat, state and message feedback current, and brings a message to it.
 * That is what this file is.
 *
 * A session starts this once. It installs its signal handlers, claims the agent's handle, then
 * says every few seconds that the session is still there. A signal during the claim waits for its
 * answer, at most the ten seconds any request here may take, before releasing the hold and
 * stopping. While it is saying so, a message to that agent goes to this session and Mole Office
 * starts no run beside it. When this stops saying so — the session was closed, the machine slept,
 * the process was killed — the hold goes quiet, the next reader releases it with that reason, and
 * the worker goes back to starting runs.
 *
 * ---------------------------------------------------------------------------------------------
 * IT NEVER GUESSES WHICH AGENT IT IS
 * ---------------------------------------------------------------------------------------------
 *
 * A terminal knows its own conversation id and nothing else. Which durable agent it answers as is a
 * fact about the checkout, written once in `.env` as `MOLE_OFFICE_AGENT`, and read from the one
 * declaration through `for-agents/where-is-the-api.mjs`. `--agent` beats it for one run. With neither,
 * this refuses and says how to say — it does not pick an agent for you, because holding somebody
 * else's handle would send that agent's mail to this terminal.
 *
 * ---------------------------------------------------------------------------------------------
 * HOW A MESSAGE REACHES THE SESSION, AND IT IS NOT THE SAME FOR THE THREE TOOLS
 * ---------------------------------------------------------------------------------------------
 *
 * Criteria H2 and H5. What one tool offers another does not, and the three answers were measured
 * rather than assumed. They are in `src/shared/waking.ts`, with the version and the date, and this
 * script reads them rather than holding its own copy.
 *
 * CLAUDE CODE: a command a session started in the background invokes it again when the command
 * exits, and what the command printed is what the session then reads. So this waits, prints the
 * message, and EXITS. The exit is the wake, and it is the way Mole Office uses. There is a second
 * way in that this does not use — the per-session inbox socket, measured present but never tried —
 * and `waking.ts` holds that measurement.
 *
 * OPENCODE: a session started with `--port <n>` serves an HTTP API, and two of its routes put text
 * into the running session and send it. So this SENDS the message straight in and goes on waiting;
 * it never has to stop. Start it with `--wake http://127.0.0.1:<that port>`.
 *
 * CODEX: a session started the ordinary way cannot be reached from outside, and `waking.ts` says
 * exactly why. So this prints the message and stops, and the message waits in that terminal until
 * somebody looks at it. That is H5's own answer for a session nothing can reach: H2 falls back to
 * the next turn. A session started with `codex --remote` against an app server CAN be reached,
 * measured on 5 September 2026, and this script does not do it: that adaptation is proposal
 * `l6jxQ_tNpfUP` and `startedAnotherWay` in `waking.ts` holds what was found.
 *
 * IT DOES NOT LET GO OF THE HANDLE WHEN IT STOPS THAT WAY, and that is deliberate. The session is
 * about to answer; letting go would let a run start beside it for the next message, which is the
 * exact thing this exists to prevent. The hold stays, unbeaten, until the session starts the waiter
 * again — which claims the same hold and starts the heartbeat again. If the session never does, the
 * hold goes quiet and a run answers, which is the right ending. That is what
 * MOLE_OFFICE_HANDLE_LAPSES_AFTER_SECONDS is for: it is how long a session may take to answer and
 * come back before Mole Office stops waiting for it.
 *
 * ---------------------------------------------------------------------------------------------
 * --kept-by-the-kit: THE KIT'S WAITER RUNS THIS TOOL AGAIN BY ITSELF
 * ---------------------------------------------------------------------------------------------
 *
 * A session that starts this tool itself in the background is woken by its exit, so after a hand-over
 * it must start the tool again to keep the handle — that is what the restart instruction is for. The
 * kit's own waiter (`design/agents/kit/waiter.sh`) is different: it runs this tool in a loop, so
 * after a hand-over it has already run it again. A session reading the messages in the middle of
 * them must not start a second waiter, because a second one fights the first for the handle. When
 * `--kept-by-the-kit` is passed the hand-over prints one plain sentence instead, saying the kit's
 * waiter keeps the handle held. Without the flag the restart instruction is printed exactly as it
 * was, because a session that started this tool itself still needs it. The flag is a switch: it
 * takes no value.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT PRINTS AND WHY THAT MATTERS
 * ---------------------------------------------------------------------------------------------
 *
 * Everything it prints is for the agent whose session started it to read. It prints one line when
 * the hold is taken, one line if the hold is refused with who holds it, one line when it lets go,
 * and the whole of a message when one arrives. Nothing else — a heartbeat every twenty seconds
 * printed to a transcript would be the loudest thing in the conversation and would say nothing.
 * AND THE LAST LINE IT PRINTS NAMES WHY IT ENDED — `exiting: delivered <message record ids>` after
 * a hand-over, `exiting: refused: <the office's sentence>` when the office refused with a 4xx this
 * cannot recover from, `exiting: error: <one line>` for anything else, `exiting: stopped` when a
 * signal stopped it (problem `kimEUGbzWDdn`, from a secretary's report of 16 September 2026).
 *
 * ---------------------------------------------------------------------------------------------
 * IT TELLS MOLE OFFICE WHICH CLAUDE PROCESS THIS SESSION IS, ONCE, AFTER THE HOLD
 * ---------------------------------------------------------------------------------------------
 *
 * A session waiting in its terminal writes nothing to its transcript, so what says it can still take
 * a message is its own process. Until 24 September 2026 only the start hook wrote that down, on the
 * record IT filed — which is not always the record this waiter holds for. Twice a durable agent's
 * letters went to the owner because the held record named no process (on 23 September and
 * on 24 September).
 *
 * So after the hold this reads its session's process and asks Mole Office to write it on the held
 * record: first by walking up its own parents, and then — because the kit starts this with `setsid`,
 * which puts it under `systemd` and not under the session — by reading `CLAUDE_PID`, which Claude
 * Code puts in every shell it starts. What it finds is CHECKED BY THE OFFICE, not believed: the
 * office reads the process itself and refuses one it cannot tie to the record's own conversation.
 *
 * IT ASKS ONLY WHEN IT CAN TELL MOLE OFFICE IS ON THIS MACHINE, and only for a claude-code session. A
 * process number means something only on its own machine, so the door is kept there. What this can
 * test is whether the address it was given is a loopback one; a waiter on this machine pointed at
 * this machine's own name cannot be told from one pointed at another computer, so it records nothing
 * there either and says that is what it could not tell.
 *
 * IT NEVER EXITS BECAUSE OF THIS. A refusal, or an office that does not answer, is one printed line
 * and the waiter carries on holding the handle: the handle is what the messages depend on, and
 * losing it over a process number would cost the session its mail.
 *
 * ---------------------------------------------------------------------------------------------
 * THE CREDENTIAL AND THE KEY IT MAY CARRY, AND WHY NOT AS FLAGS
 * ---------------------------------------------------------------------------------------------
 *
 * A visiting agent — one on another machine — was confirmed here through the credential flow
 * (POST /api/office/visitors, confirmed at the Embassy), and every request it sends carries its
 * token on `x-mole-office-credential`. An agent confirmed since the key change also holds an agent
 * key of its own, travelling on `x-mole-office-key`. The waiter sends each of the two secrets when
 * it was given it, and else falls back to the office's own key file, which is beside the
 * database and therefore exists only on the machine the office runs on — the local case.
 *
 * BOTH SECRETS ARE READ FROM FILES WHOSE PATHS THE ENVIRONMENT GIVES, AND NEVER FROM A COMMAND-LINE
 * FLAG. A key on a command line lands in the shell's history and in the process list, where anything
 * on this machine can read it. A key read into the environment is inherited by every child the
 * waiter starts. So the environment holds only the files' paths, MOLE_OFFICE_CREDENTIAL_FILE and
 * MOLE_AGENT_KEY_FILE, and the key is read from its file into a request header. The reason is written
 * out at `tools/register-a-started-agent.mjs` in full, and MOLE_AGENT_KEY_FILE is the name that tool
 * tells a starter to give its started agent.
 *
 * IT PRINTS NEITHER. A secret printed into a transcript is copied into the conversation the
 * transcript belongs to, so no refusal, no line and no message here ever carries one.
 */

import { hostname } from 'node:os'
import { join } from 'node:path'

import { whereIsTheApi, whichAgent, whichWorkspace } from './where-is-the-api.mjs'
import { ENV_FILE, REPO_ROOT, THE_FOR_AGENTS_FOLDER, THE_INSTALL, readSettingHere, settingValue, theInstallsNode, theInstallsNodeInALine } from '../src/config/settings.mjs'
import { HOME_HEADER } from '../src/config/visit-headers.mjs'
import { WORLD_HEADER, parseWorldHeader } from '../src/config/world-header.mjs'
import { KEY_HEADER } from '../src/config/key-header.mjs'
import { CREDENTIAL_HEADER } from '../src/config/visitor-headers.mjs'
import { theOfficeKey } from '../src/config/office-key.mjs'
import { theKeyARunsToolSends } from '../src/config/run-permissions.mjs'
import { A_VISITORS_TOKEN, aSecretFromTheEnvironment, anAgentsToolHeaders, THE_AGENT_KEY } from './agent-key.mjs'
import { CONNECTION_TAG_PARAM } from '../src/shared/events.ts'
import {
  DELIVERY_ENVELOPE,
  deliveryEnvelope,
  quotesOf,
  theMessageAnAgentReads,
  firstInQueueMark,
  routedOf,
  theRoutedLineFor,
} from '../src/shared/messages.ts'
import { whatTheWaiterDoes } from '../src/shared/waking.ts'
import { THE_GROUPS_NEWS_AT_A_HAND_OVER } from '../src/shared/group-news.ts'
import { THE_WAKE_LINE, whenAHandOverWakes } from './when-a-hand-over-wakes.mjs'
import { theSessionProcessForTheWaiter } from '../src/config/session-process.mjs'

/**
 * HOW TO RUN THIS TOOL AGAIN, as the line after a hand-over prints it. From a checkout it is run from the
 * checkout's root, as before. An installed office has no `node` on PATH and no checkout, so there the
 * line names the install's own Node (theInstallsNodeInALine in src/config/settings.mjs) and this file's full path.
 */
const THIS_TOOL_AS_A_COMMAND =
  THE_INSTALL.from === 'bundle'
    ? `${theInstallsNodeInALine(theInstallsNode({ named: true }))} "${join(REPO_ROOT, THE_FOR_AGENTS_FOLDER, 'hold-the-handle.mjs')}"`
    : 'node for-agents/hold-the-handle.mjs'

/**
 * WHAT THIS WAITER CARRIES THAT PROVES OR NAMES IT, ON EVERY REQUEST IT SENDS.
 *
 * WHO IT ASKS AS, AND THE AGENT'S OWN KEY, come from `anAgentsToolHeaders` in for-agents/agent-key.mjs,
 * the one place every agent's tool builds them. With MOLE_AGENT_KEY set, that
 * key goes on the key header under this waiter's own handle, `AGENT`, and so does a key read from the
 * file MOLE_AGENT_KEY_FILE names.
 *
 * ONLY WHEN THE AGENT HOLDS NO KEY does the office's own key go instead, as it did before. The hold,
 * took, process and release doors refuse a request a listener carried with no key the office knows,
 * and the secretary's waiter holds no key of its own yet. THIS FALLBACK GOES ONCE EACH AGENT HOLDS ITS OWN KEY
 * . The office's key is read here per request, as it always was, because a
 * waiter may start before the office has made its key file and should pick it up the day it appears.
 *
 * The visitor credential goes beside either, when this waiter was given one.
 *
 * @returns {Record<string, string>}
 */
function theCallerHeaders() {
  const named = anAgentsToolHeaders({ self: AGENT, withoutAKey: AGENT, key: AGENT_KEY })
  const officeKey = named[KEY_HEADER] === undefined ? theOfficeKey().key : null
  return {
    ...named,
    ...(officeKey === null ? {} : { [KEY_HEADER]: officeKey }),
    ...(CREDENTIAL_TOKEN === null ? {} : { [CREDENTIAL_HEADER]: CREDENTIAL_TOKEN }),
  }
}

// ------------------------------------------------------------------ what this run was told

const argv = process.argv.slice(2)

/** The value after a flag, or null. Written out rather than parsed, because there are four. */
function flag(name) {
  const at = argv.indexOf(`--${name}`)
  if (at === -1 || at + 1 >= argv.length) return null
  const said = argv[at + 1]
  return said.startsWith('--') ? null : said
}

/**
 * THE LAST LINE THIS WAITER PRINTS SAYS WHY IT ENDED, in words a person or an agent reads without
 * parsing the message block. Problem `kimEUGbzWDdn`, on the morning of 16 September 2026: a
 * waiter that restarted, took one message, printed it and exited inside a twelve-second process
 * check read as a failed start, because nothing on the output named why the process had gone.
 *
 * ONE LINE, AND IT IS THE LAST LINE ON STDOUT, CALLER OF EVERY EXIT THERE IS:
 *
 *   after a hand-over            exiting: delivered <message record ids, separated by spaces>
 *   the office refused with a    exiting: refused: <the office's sentence>
 *   4xx this cannot recover from
 *   anything else gone wrong     exiting: error: <one line>
 *   stopped by a signal          exiting: stopped
 *
 * THE EXIT CODE IS NOT CHANGED BY THIS: the line is the record, and the code is what it always was
 * for each case.
 *
 * WRITE FIRST, EXIT SECOND, as tools/checks/verdict.mjs does. A pipe makes Node's writes
 * asynchronous: the 476-letter hand-over on 3 October 2026 lost its tail behind the pipe buffer
 * when process.exit ran immediately (problem frbukDZtsdvB). A write callback on each stream
 * waits for everything already queued on that stream, including stderr's explanation.
 *
 * ONLY THE FIRST EXIT IS SCHEDULED. Its last line and exit code win. Awaiting the promise (which
 * never resolves because the callback exits) also stops early exits from continuing into startup
 * while the writes drain. Help has no exiting line, as before.
 *
 * @param {number} code
 * @param {string} [why] - a single line, without the leading `exiting: `.
 */
let leaving = false

/**
 * WHEN MOLE OFFICE STOPPED ANSWERING, AND WHETHER A HEARTBEAT WENT UNANSWERED SINCE, or null while
 * it answers.
 *
 * AN OUTAGE IS ONE LINE, WRITTEN WHEN THE OFFICE COMES BACK. It used to be
 * a line when it went, a line after three missed beats and a line when it came back: one waiter's out
 * file had 449 such pairs. Nothing is woken by them, so nothing is lost by waiting for the end.
 *
 * THE LINE SAYS WHAT THE OFFICE ANSWERED ABOUT THE HOLD, NOT WHAT IS ASSUMED (a condition set in
 * message AxeM15k4gURu). The hold lapses when it goes quiet, so a long outage can lose it. When a
 * heartbeat went unanswered, the line is written by the first heartbeat answered after it, which is
 * the answer that says whether the hold was kept. When every heartbeat was answered and only the
 * waiting door was not, those answers are what say the hold was kept, and the waiting loop writes
 * the line.
 */
let away = null
function writeThenExit(code, why) {
  return new Promise(() => {
    if (leaving) return
    leaving = true
    // A RUN THAT ENDS WHILE MOLE OFFICE IS AWAY says so here, because the line for its return
    // will never be written.
    if (why !== undefined && away !== null) {
      process.stdout.write(
        away.beatMissed
          ? `Mole Office has not answered a heartbeat since ${whenItWas(away.since)}.\n`
          : `Mole Office has not said what is waiting for "${AGENT}" since ${whenItWas(away.since)}.\n`,
      )
    }
    let waiting = 2
    const oneDone = () => {
      waiting -= 1
      if (waiting === 0) process.exit(code)
    }
    process.stdout.write(why === undefined ? '' : `exiting: ${why}\n`, oneDone)
    process.stderr.write('', oneDone)
  })
}

if (argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(
    [
      'node for-agents/hold-the-handle.mjs --session <record id>   hold this checkout’s agent handle and keep it',
      'node for-agents/hold-the-handle.mjs --agent <handle> --session <record id>',
      '',
      '  --agent      which durable agent this session answers as. Without it, MOLE_OFFICE_AGENT in .env.',
      '  --session    the session record this run is filed under. The session hook prints it at startup.',
      '  --api        where Mole Office is. Without it, the address .env declares.',
      '  --workspace  which project. Without it, the project is taken from the session record, then from',
      '               the agent record, and from .env last; the first line printed says which it used.',
      '  --runtime    claude-code, codex or opencode. Without it, claude-code.',
      '  --wake       for an opencode session: http://127.0.0.1:<the --port it was started with>.',
      '  --kept-by-the-kit  the kit’s waiter runs this tool in a loop and will run it again itself. With',
      '               this, a hand-over says so instead of telling the session to start another waiter.',
      '  --again      with --kept-by-the-kit only: the kit’s waiter has run this tool before, so the lines on',
      '               how the handle is held are left out. A line that reports a failure still prints.',
      '',
      'What proves who you are is read from files and never from a flag. MOLE_OFFICE_CREDENTIAL_FILE is the',
      'full path of the file holding the token your confirmed visitor credential carries (sent on',
      'x-mole-office-credential). MOLE_AGENT_KEY_FILE is the full path of the file holding your own agent key',
      '(sent on x-mole-office-key); for a visitor that is the same token file. Each file must be yours, of',
      'mode 600. MOLE_OFFICE_CREDENTIAL and MOLE_AGENT_KEY may hold the values instead, but never beside their',
      'files. An agent on the machine the office runs on needs neither; the office key file beside its',
      'database answers there.',
      '',
      'It holds the handle, says every few seconds that this session is still there, and waits. When a message',
      'addressed to that agent arrives it prints it and exits, which is what wakes the session that started it.',
      '',
      'After the hold it asks Mole Office to write down which claude process this session is, so that a session',
      'waiting in its terminal still reads as able to answer. It finds the process by walking up from itself, and',
      'then from CLAUDE_PID in its own environment. It asks only when Mole Office is on this machine and only for',
      'a claude-code session, it prints one line saying what happened, and it never stops holding the handle over',
      'the answer.',
      '',
    ].join('\n'),
  )
  await writeThenExit(0)
}

/**
 * NO FLAG TAKES EITHER SECRET, AND A FLAG THAT CARRIES ONE IS REFUSED RATHER THAN IGNORED.
 *
 * A key on a command line is in the shell's history and in every process list on this machine, so
 * a file's path, or the environment, is the only way a secret is given. A caller that passes one anyway is stopped
 * here: ignoring it would start a waiter carrying nothing while the caller believed it carried the
 * flag, which is a failed start wearing a running waiter's face. Both the `--flag value` and the
 * `--flag=value` shapes are refused. The message names the two file variables and no value.
 */
const secretFlags = argv.filter(
  (one) => one === '--credential' || one === '--key' || one.startsWith('--credential=') || one.startsWith('--key='),
)
if (secretFlags.length > 0) {
  process.stderr.write(
    'Neither secret is taken from a command-line flag: a key on a command line lands in the shell’s history and in ' +
      'the process list. Give each one as a file’s full path instead. MOLE_OFFICE_CREDENTIAL_FILE names the file ' +
      'holding the token your confirmed visitor credential carries (sent on x-mole-office-credential), and ' +
      'MOLE_AGENT_KEY_FILE names the file holding your own agent key (sent on x-mole-office-key). Nothing was written.\n',
  )
  await writeThenExit(2, 'error: a secret was passed as a command-line flag, and no flag takes one')
}

const API = whereIsTheApi(flag('api') ?? undefined)
/**
 * THE VISITOR'S CREDENTIAL TOKEN, the token a confirmed visitor was given at issue and told to send on
 * `x-mole-office-credential`. Only this waiter reads it.
 * @type {import('./agent-key.mjs').ASecret}
 */
const THE_VISITORS_CREDENTIAL = {
  value: 'MOLE_OFFICE_CREDENTIAL',
  file: 'MOLE_OFFICE_CREDENTIAL_FILE',
  what: 'token',
  shape: new RegExp(`^${A_VISITORS_TOKEN}\n?$`),
  says: "visitor's token of 43 characters",
}

/**
 * THE TWO SECRETS THIS WAITER MAY CARRY, EACH READ FROM THE FILE WHOSE PATH IT IS GIVEN, AND NEVER FROM A FLAG.
 *
 * MOLE_OFFICE_CREDENTIAL_FILE names the file holding the visitor's token. MOLE_AGENT_KEY_FILE names the file holding
 * the agent key a confirmed credential also binds (criterion P83 point 5), which for a visitor is the same token.
 * Both are read by for-agents/agent-key.mjs, under the rules it reads every agent's key by, so neither secret is in
 * this waiter's environment or a child's. MOLE_OFFICE_CREDENTIAL and
 * MOLE_AGENT_KEY may still hold the values themselves; a value beside its file is refused. A key on a command line is
 * in every process list on this machine, so no flag takes either; a secret printed is copied into a transcript. The
 * office's own key, the third and local way of proving something, is the file beside the database, which
 * `theCallerHeaders` reads per request.
 *
 * A NULL HERE IS A REAL ANSWER AND NOT A FAULT: an agent on the machine the office runs on holds
 * neither, and today it still works under the window. What may not happen is a caller with none of
 * the three pointed at an office on another machine, which is the refusal below. A file that cannot
 * be used stops the waiter here, before it asks anything.
 */
const NOTHING_ASKED = 'This waiter asked nothing and wrote nothing.'
let CREDENTIAL_TOKEN = null
let AGENT_KEY = null
try {
  CREDENTIAL_TOKEN = aSecretFromTheEnvironment(THE_VISITORS_CREDENTIAL, process.env, NOTHING_ASKED)
  AGENT_KEY = aSecretFromTheEnvironment(THE_AGENT_KEY, process.env, NOTHING_ASKED)
} catch (why) {
  process.stderr.write(`${why instanceof Error ? why.message : String(why)}\n`)
  await writeThenExit(2, 'error: a secret this waiter was given could not be used')
}
const NAMED_WORKSPACE = flag('workspace')
/**
 * WHICH PROJECT THIS WAITER SPEAKS FOR, RESOLVED BELOW BEFORE ANYTHING IS ASKED OF MOLE OFFICE.
 *
 * It starts as the flag or the checkout's `.env`, which is what it always was. `resolveTheProject`
 * then replaces it with the project the SESSION RECORD is really in, or the AGENT RECORD's, and
 * leaves `.env` as the last resort — because an agent whose records live in another project was
 * refused twice and started a needless session record before it discovered `--workspace`. The
 * first line printed says which of the three it used.
 */
let WORKSPACE = NAMED_WORKSPACE ?? whichWorkspace()
const AGENT = whichAgent(flag('agent') ?? undefined)
let SESSION = flag('session')
// The file is read once for this agent and run; every request uses the same answer.
const runsKey = AGENT_KEY === null
  ? theKeyARunsToolSends(process.env, { agent: AGENT ?? undefined, session: SESSION ?? undefined })
  : null
if (runsKey?.key) AGENT_KEY = runsKey.key

const MACHINE = process.env.HOSTNAME ?? hostname()

/**
 * WHICH TOOL THIS SESSION IS A SESSION OF.
 *
 * It is claude-code unless the caller says otherwise, and `--runtime` is how Codex and OpenCode
 * sessions say so. There is no sniffing of the process tree: a wrong answer here would put a wrong
 * word on a screen a person reads, and the caller always knows.
 */
const RUNTIME = flag('runtime') ?? 'claude-code'

/**
 * TRUE WHEN THE KIT'S WAITER IS THE CALLER, AND IT WILL RUN THIS TOOL AGAIN BY ITSELF.
 *
 * A session that starts this tool itself in the background is woken by its exit and must start it
 * again to keep the handle, so it is told to. The kit's `design/agents/kit/waiter.sh` is different:
 * it runs this tool in a loop, so after a hand-over it is already running again. A session reading
 * the hand-over in the middle of the messages must not start a second waiter, because a second one
 * fights the first for the handle. With this flag the tool prints one plain sentence instead of the
 * restart instruction. It is a switch and takes no value.
 */
const KEPT_BY_THE_KIT = argv.includes('--kept-by-the-kit')

/**
 * TRUE WHEN THE KIT'S WAITER HAS ALREADY RUN THIS TOOL ONCE SINCE IT STARTED, and the out file
 * already holds the lines that only say how this session holds the handle.
 *
 * Those lines are the project line, the holding line, the paragraph on how a message wakes the
 * session, and the line that says which process this session is. They are the same on every run,
 * and they were about 1.4 KB of every hand-over in one waiter's out file. A decision asks for output that is concise
 * but traceable. With this flag they are left out. A line that reports a failure still prints
 * on every run. Agreed with the agent that keeps this kit, in message AxeM15k4gURu.
 *
 * IT IS REFUSED WITHOUT --kept-by-the-kit. Only the kit's own loop knows its out file already
 * holds the lines, so a session that starts this tool itself is never told less.
 */
const AGAIN = argv.includes('--again')
if (AGAIN && !KEPT_BY_THE_KIT) {
  process.stderr.write(
    '--again is only for the kit\'s waiter, which passes --kept-by-the-kit as well: it leaves out lines the ' +
      'waiter\'s out file already holds. Nothing was held and nothing was written.\n',
  )
  await writeThenExit(2, 'error: --again was passed without --kept-by-the-kit')
}

/** True when this address can only name a machine's own loopback, so the caller is on that machine.
 * @param {string} address */
function isAlikeLoopback(address) {
  try {
    const parsed = new URL(address)
    const name = parsed.hostname.toLowerCase().replace(/\.$/, '')
    return name === 'localhost' || name === '[::1]' || name === '::1' || /^(127\.|::ffff:127\.)/.test(name)
  } catch {
    return false
  }
}

/**
 * WHERE TO SEND A MESSAGE SO IT REACHES THE RUNNING SESSION, or null because nothing said.
 *
 * Only OpenCode has such an address, and only when the session was started with `--port`. Nothing
 * can work it out: a session started without one serves on a port the operating system picked and
 * never says which.
 */
const WAKE_AT = flag('wake')

if (AGENT === null) {
  process.stderr.write(
    [
      'NOTHING SAYS WHICH DURABLE AGENT THIS SESSION ANSWERS AS, so no handle was held.',
      'Either pass --agent <handle>, or write the line once in this checkout’s .env:',
      '    MOLE_OFFICE_AGENT=<handle>',
      'GET /api/participants lists every agent that is registered. Nothing was written.',
      '',
    ].join('\n'),
  )
  await writeThenExit(2, 'error: nothing says which durable agent this session answers as')
}

if (SESSION === null) {
  process.stderr.write(
    [
      'NOTHING SAYS WHICH SESSION RECORD THIS RUN IS FILED UNDER, so no handle was held.',
      'Pass --session <record id>. The Mole Office line printed at the start of this session names it.',
      'Nothing was written.',
      '',
    ].join('\n'),
  )
  await writeThenExit(2, 'error: nothing says which session record this run is filed under')
}

// THE READER'S OWN REASON, WITH THE CONFIGURATION PATH SAID IN PLAIN WORDS. The run-key reader works
// out why it gave no key; its words are printed as they are rather than matched here, so a change in
// that reader reaches this refusal instead of leaving a wrong summary behind. The path is this
// environment's value as it is, so replacing that value leaves no path in anything printed.
if (AGENT_KEY === null && theOfficeKey().key === null) {
  const why = runsKey?.why ?? 'it was not used'
  const configuration = process.env.MOLE_OFFICE_TOOL_CONFIGURATION
  const detail = configuration
    ? why.replaceAll(configuration, 'named by MOLE_OFFICE_TOOL_CONFIGURATION')
    : why
  process.stderr.write(`No MOLE_AGENT_KEY or MOLE_AGENT_KEY_FILE is available (a remote visitor also needs MOLE_OFFICE_CREDENTIAL_FILE), and the run's office tool file named by MOLE_OFFICE_TOOL_CONFIGURATION was missing or not used (${detail}); the run's starter can fix this by starting the run again through tools/sandbox.mjs, which writes that file.\n`)
  await writeThenExit(2)
}

/**
 * HOLDING NOTHING AND CALLING AN OFFICE ON ANOTHER MACHINE, SO THIS SAYS IT AND STOPS.
 *
 * With neither a credential nor an agent key nor an office key file, every request this waiter
 * would send is a request under nobody's name. A caller pointed at the loopback still works under
 * the one-version window, so nothing changes there. Closing that window is their press under P83 point 6,
 * and this tool does not do it here. Pointed at an address a loopback
 * cannot name, the office on the other end measures the caller the registration door does, and the
 * sentence below says what actually makes a visiting agent work: a confirmed credential and the
 * agent key bound to it, both read from the token file.
 */
if (CREDENTIAL_TOKEN === null && AGENT_KEY === null && theOfficeKey().key === null && !isAlikeLoopback(API)) {
  process.stderr.write(
    'Mole Office is at ' +
      API +
      ', which is not this machine, and this waiter holds neither the visitor credential (MOLE_OFFICE_CREDENTIAL_FILE) ' +
      'nor an agent key (MOLE_AGENT_KEY_FILE) nor the office key file, so it could only call under nobody’s name — ask ' +
      'the person to confirm a visitor credential for your handle, set both variables to the full path of your token ' +
      'file, and start this again, which holds nothing and writes nothing here.\n',
  )
  await writeThenExit(
    2,
    'error: Mole Office is at ' + API + ', which is not this machine, and no credential or agent key is held',
  )
}

// ------------------------------------------------------------------ talking to Mole Office

/** Which world this waiter calls home. Null until the first reply has said. */
let HOME = null

/** One request. Answers the parsed body and the status, or null when nothing answered at all. */
async function ask(path, options = {}) {
  // THE ABORT IS TEN SECONDS FOR EVERY CALL EXCEPT THE ONE THAT ASKS THE DOOR TO HOLD. A hold that
  // is allowed to run for thirty seconds must not be aborted by a ten-second timeout, so the one
  // waiting call passes a longer one and every other call keeps the ten it always had.
  const { longestMs = 10_000, withoutWorkspace = false, ...rest } = options
  try {
    const res = await fetch(`${API}${path}`, {
      ...rest,
      headers: {
        'content-type': 'application/json',
        // LEFT OFF FOR THE DISCOVERY READS. To learn which project a record is really in, this has
        // to ask from a place that is allowed to be wrong: a request that names a project is
        // answered about THAT project, so it could never discover another one.
        ...(withoutWorkspace ? {} : { 'x-mole-office-workspace': WORKSPACE }),
        ...theCallerHeaders(),
        ...(HOME === null ? {} : { [HOME_HEADER]: HOME }),
        ...(rest.headers ?? {}),
      },
      signal: AbortSignal.timeout(longestMs),
    })
    if (HOME === null) {
      const read = parseWorldHeader(res.headers.get(WORLD_HEADER))
      if (read.ok) HOME = read.world.database
    }
    return { status: res.status, body: await res.json().catch(() => null) }
  } catch {
    return null
  }
}

/**
 * ASK, AND ASK AGAIN WHEN THE OFFICE DID NOT ANSWER OR SAID IT WAS BROKEN.
 *
 * Problem `TZD7KatHAtEV`, measured on 23 September 2026: Mole Office pauses for a few
 * seconds now and then. The record read was asked once, so a pause left a
 * hand-over block without its sender and its words. Nothing answered and a 5xx are the two shapes
 * of "the office did not answer", and each is tried twice more, two and then five seconds later.
 * Three tries in all.
 *
 * A 4XX IS AN ANSWER AND IS NEVER RETRIED. A refusal is a sentence for a reader, and asking it
 * again is how a refusal turns into a loop. The `took` request is not asked again here either:
 * asking it twice could take one message twice.
 *
 * @param {string} path
 * @param {object} options passed to ask unchanged
 * @returns {Promise<{status:number,body:unknown}|null>} the last answer, or null if none answered
 */
async function askWithRetries(path, options = {}) {
  const waits = [2000, 5000]
  let seen = await ask(path, options)
  for (const wait of waits) {
    if (seen !== null && seen.status < 500) return seen
    await pause(wait)
    seen = await ask(path, options)
  }
  return seen
}

// ------------------------------------------------------------------ which project this is about

/**
 * WHICH PROJECT A RECORD IS IN, ASKED WITHOUT NAMING ONE.
 *
 * A record read that names no project is answered about the default; when the id is in another
 * project the server refuses and says WHERE the record really is, in the refusal's `elsewhere`
 * facts. That is the one honest way to ask a record which project it belongs to without already
 * knowing: the answer is either the record itself or the server's own sentence naming the project
 * it is in. A 404 with no `elsewhere` means no such record, which is a different fact and is not
 * turned into a project.
 */
async function projectOfTheRecord(path, because) {
  const seen = await ask(path, { withoutWorkspace: true })
  if (seen === null) return { id: null, because: null, why: 'Mole Office did not answer' }
  if (seen.status === 200) {
    const id = seen.body?.workspaceId
    if (typeof id === 'string' && id !== '') return { id, because, why: null }
    return { id: null, because: null, why: `the reply for ${path} named no project` }
  }
  const elsewhere = seen.body?.elsewhere?.workspaceId
  if (typeof elsewhere === 'string' && elsewhere !== '') return { id: elsewhere, because, why: null }
  return { id: null, because: null, why: String(seen.body?.error ?? `Mole Office answered ${String(seen.status)}`) }
}

/**
 * WHICH PROJECT THE AGENT RECORD IS IN, WHEN THE SESSION RECORD COULD NOT SAY.
 *
 * The handle read is asked without a project on purpose: the registry row is the installation's, so
 * the office can answer which project its own record is in without being told where the caller
 * stands. A null answer means this installation holds no agent record for the handle, which is a
 * real answer and sends the caller to `.env` rather than to a guessed project.
 */
async function projectOfTheAgent() {
  const seen = await ask(`/api/handles/${encodeURIComponent(AGENT)}`, { withoutWorkspace: true })
  if (seen === null || seen.status !== 200) return { id: null, because: null, why: 'Mole Office did not answer about the agent' }
  const id = seen.body?.agentRecordProject
  if (typeof id === 'string' && id !== '') return { id, because: 'the agent record', why: null }
  return { id: null, because: null, why: `no agent record for "${AGENT}" names a project` }
}

/**
 * THE PROJECT THIS WAITER SPEAKS FOR, AND WHICH OF THE THREE SAID SO. The secretary's ruling under F15
 * point 1, problem `kXXiGKoVoGQN`.
 *
 * `--workspace` still wins, and it is CHECKED against the record rather than trusted: a caller that
 * names a project and holds a record in another one has a real contradiction, and guessing between
 * them is the fault this piece exists to end. Everything else goes record first, agent second,
 * `.env` last.
 */
async function resolveTheProject() {
  // ONLY WHERE THE RECORD IS: a run's whole record answered 30 MB, and the waiter needs its project alone.
  const fromTheSession = await projectOfTheRecord(`/api/records/${encodeURIComponent(SESSION)}?shape=where`, 'the session record')
  if (NAMED_WORKSPACE !== null) {
    if (fromTheSession.id !== null && fromTheSession.id !== NAMED_WORKSPACE) {
      return {
        ok: false,
        says:
          `--workspace ${NAMED_WORKSPACE} disagrees with the session record: "${SESSION}" is in ` +
          `"${fromTheSession.id}". Nothing was held. Name the project the session is really in, or leave ` +
          '--workspace off and this takes it from the record.',
      }
    }
    return { ok: true, id: NAMED_WORKSPACE, because: 'the --workspace you named' }
  }
  if (fromTheSession.id !== null) return { ok: true, id: fromTheSession.id, because: 'the session record' }
  const fromTheAgent = await projectOfTheAgent()
  if (fromTheAgent.id !== null) return { ok: true, id: fromTheAgent.id, because: 'the agent record' }
  return { ok: true, id: whichWorkspace(), because: whereTheSettingSaidIt() }
}

// ------------------------------------------------------------------ holding, beating, letting go

/** True once this process has started letting go, so two signals do not do it twice. */
let lettingGo = false

/**
 * A SIGNAL DURING THE HOLD REQUEST WAITS FOR ITS ANSWER before asking to release it (wave 13y round
 * 37, item 9.17): a release sent beside a hold that has not answered could reach the office
 * first and release nothing. `stopAfterHold` is the reason the signal gave, kept until then.
 */
let takingHold = true
let stopAfterHold = null

/** How many beats in a row have failed. Never printed per beat. */
let missed = 0


/** A moment as this waiter's lines say it: the time, and the date as well when it is not today. */
function whenItWas(at, now = new Date()) {
  const two = (n) => String(n).padStart(2, '0')
  const time = `${two(at.getHours())}:${two(at.getMinutes())}:${two(at.getSeconds())}`
  return at.toDateString() === now.toDateString()
    ? time
    : `${String(at.getFullYear())}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${time}`
}

/** Mole Office stopped answering now, unless it had already. */
function itWentAway(byTheBeat) {
  if (away === null) away = { since: new Date(), beatMissed: false }
  if (byTheBeat) away.beatMissed = true
}

/** The span of the outage that has just ended, as "hh:mm:ss–hh:mm:ss", and the outage is over. */
function itCameBack() {
  const now = new Date()
  const span = `${whenItWas(away.since, now)}–${whenItWas(now, now)}`
  away = null
  return span
}

async function letGo(why, exitCode = 0, outcome = 'stopped') {
  if (lettingGo || leaving) return
  if (takingHold) {
    stopAfterHold ??= why
    return
  }
  lettingGo = true
  const said = await ask(`/api/handles/${encodeURIComponent(AGENT)}/release`, {
    method: 'POST',
    body: JSON.stringify({ session: SESSION, because: why }),
  })
  if (leaving) return
  process.stdout.write(
    said !== null && said.status === 200
      ? `Let go of the handle "${AGENT}": ${why}\n`
      : `Stopped holding the handle "${AGENT}", and Mole Office was not told: ${why}. ` +
          'It will be released by the next reader once the heartbeat has gone quiet.\n',
  )
  await writeThenExit(exitCode, outcome)
}

// WHICH PROJECT, SETTLED BEFORE ANYTHING IS HELD. A disagreement between `--workspace` and the
// record stops here, with nothing held and nothing written.
const project = await resolveTheProject()
if (!project.ok) {
  process.stderr.write(`${project.says}\n`)
  await writeThenExit(2, `error: ${project.says}`)
}
WORKSPACE = project.id

/**
 * THE FIRST LINE SAYS WHICH OF THE THREE SAID WHICH PROJECT THIS IS. The secretary's ruling under F15 point
 * 1: the project follows the session, and a reader must be able to tell whether it came from the
 * session record, the agent record, or the checkout's `.env` without going looking. It is printed
 * before the hold, because it describes how the project was worked out and is true whether or not
 * the hold then succeeds.
 */
if (!AGAIN) process.stdout.write(`Project "${WORKSPACE}" taken from ${project.because}.\n`)

process.on('SIGINT', () => void letGo('the session stopped the waiter'))
process.on('SIGTERM', () => void letGo('the session stopped the waiter'))

const held = await ask(`/api/handles/${encodeURIComponent(AGENT)}/hold`, {
  method: 'POST',
  body: JSON.stringify({ session: SESSION, machine: MACHINE, runtime: RUNTIME }),
})

if (held === null) {
  process.stderr.write(
    `Mole Office is not answering on ${API}, so nothing knows this session is answering as "${AGENT}". ` +
      'A message to it will start a run as before. Nothing else changes.\n',
  )
  await writeThenExit(1, `error: Mole Office is not answering on ${API}`)
}

/**
 * A 5XX IS NOT A REFUSAL. It is the office saying it cannot answer now: the dev supervisor's
 * stand-in says so with 503 while no server is running (problem `xGeC_iM6jxYl`). `refused` stops
 * the kit's waiter for good, so a 5xx ends as `error`, which the kit tries again.
 */
if (held.status >= 500) {
  const sentence = String(held.body?.error ?? `Mole Office answered ${String(held.status)}`)
  process.stderr.write(`The handle "${AGENT}" was not held, because Mole Office could not answer now: ${sentence}\n`)
  await writeThenExit(1, `error: ${sentence}`)
}

if (held.status !== 201) {
  const sentence = String(held.body?.error ?? `Mole Office answered ${String(held.status)}`)
  process.stderr.write(`The handle "${AGENT}" was not held: ${sentence}\n`)
  await writeThenExit(1, `refused: ${sentence}`)
}

// THE HOLD HAS ANSWERED. A signal kept above now releases what was taken before startup continues.
takingHold = false
// A RUN THAT HAS ENDED IS HELD AS THE LIVE RUN OF ITS CONVERSATION: every later call names the run the hold is on.
if (typeof held.body?.hold?.session === 'string' && held.body.hold.session !== '') SESSION = held.body.hold.session
if (typeof held.body?.endedRunAsked?.says === 'string') process.stdout.write(`${held.body.endedRunAsked.says}\n`)
// The successful hold names the agent by its registry id. Its handle is only the address used
// to take the hold; routing compares stored participant references.
const theHeldAgent = held.body?.hold?.agent
if (theHeldAgent?.kind !== 'agent' || typeof theHeldAgent.id !== 'string' || theHeldAgent.id === '') {
  process.stderr.write('The successful hold named no agent id, so routed messages could not be read.\n')
  await letGo('the office did not name the held agent by id', 1, 'error: the office did not name the held agent by id')
}
if (stopAfterHold !== null) await letGo(stopAfterHold)

/**

/**
 * WHAT THIS SESSION'S TOOL LETS A MESSAGE DO, read from the measurements once.
 *
 * AFTER THE HOLD, because the hold is what checks that `--runtime` is a word this product has an
 * adapter for. Asking the table about a word nobody declared would be asking about a runtime that
 * does not exist.
 */
/**
 * HOW LONG THIS WAITS BEFORE TRYING AGAIN WHEN MOLE OFFICE IS NOT ANSWERING, and how long it will
 * ever wait.
 *
 * NOT SETTINGS, and that is deliberate: they are not a fact about this installation, they are how
 * quickly one client notices that the office has gone. Nothing on any screen reads them and nobody
 * would ever turn them. `MOLE_OFFICE_HANDLE_BEAT_SECONDS` is the number that IS a fact about this
 * installation, and it is declared.
 */
const FIRST_WAIT_MS = 1000
const LONGEST_WAIT_MS = 5000

/**
 * HOW LONG THIS ASKS THE WAITING DOOR TO HOLD THE ANSWER, and how long the request may live.
 *
 * THE HOLD IS THE ONLY THING THIS LOOP WAITS ON. The event stream carried exactly one fact this
 * tool acted on — that a message addressed to this agent had arrived — and the write that files a
 * delivery row is what wakes the hold. So the stream is not opened at all, and this ask replaces
 * both the stream and the reconnect pause after a stream that would not stay open. The abort is
 * above the hold window by five seconds, so a request the office holds for its full cap is not
 * killed while the office is still working on it.
 */
const WAIT_SECONDS = 30
const WAITING_ABORT_MS = (WAIT_SECONDS + 5) * 1000

/** Wait, in one place, so every wait in this file is the same kind of thing. */
function pause(ms) {
  return new Promise((go) => setTimeout(go, ms))
}

/**
 * THE CONNECTION TO THE EVENT CHANNEL THAT IS OPEN NOW, so the heartbeat can end it.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THE HEARTBEAT AND NOT THE STREAM DECIDES WHEN TO RECONNECT
 * ---------------------------------------------------------------------------------------------
 *
 * A held stream does not reliably tell you the far end has gone. Measured on 5 September 2026 on a
 * scratch API stopped with SIGTERM: the read neither returned nor threw, and the waiter sat on a
 * socket nobody was serving — alive, holding the handle, and deaf. The coordinator's live stack
 * threw instead, because a supervisor's restart closes the socket differently. Both are ordinary,
 * and a client that only learns from the stream learns nothing in one of them.
 *
 * THE HEARTBEAT ALREADY ASKS THE SAME SERVER EVERY FEW SECONDS AND IS ANSWERED OR NOT. So it is
 * the one thing that knows, and it ends the stream itself: once when Mole Office stops answering,
 * and once when it answers again, because a connection made to a server that has since restarted is
 * a connection to nothing. One place knows and one place acts on it.
 */
let thisConnection = null

/** End the connection to the event channel, so the loop reading it opens a new one. */
function endTheConnection() {
  if (thisConnection === null) return
  const ending = thisConnection
  thisConnection = null
  try {
    ending.abort()
  } catch {
    // It had already finished, which is the ordinary case when a message has just arrived.
  }
}

const WAKING = whatTheWaiterDoes(RUNTIME, WAKE_AT)

const beatEvery = Number(held.body.beatEvery ?? settingValue('MOLE_OFFICE_HANDLE_BEAT_SECONDS'))

/**
 * HOW LONG THE OFFICE LETS THIS HOLD GO QUIET BEFORE IT LAPSES, from the same hold answer that
 * carried `beatEvery`.
 *
 * THE KIT'S WAITER SIZES A BACK-OFF AGAINST IT. Running this tool is the only thing that beats the
 * hold, so a wait must leave room for one beat interval, the wait and this tool's start before the
 * lapse. The waiter reads both numbers from this run's output rather than keeping its own copy of a
 * number the office declares (design/agents/kit/waiter.sh). The fallback is the declared setting for
 * the same reason `beatEvery` has one.
 */
const lapsesAfter = Number(held.body.lapsesAfter ?? settingValue('MOLE_OFFICE_HANDLE_LAPSES_AFTER_SECONDS'))

if (!AGAIN) {
  process.stdout.write(
    `Holding the handle "${AGENT}" for this session (record ${SESSION}). A message to it comes here, and ` +
      `Mole Office starts no run while this is running. Saying so every ${String(beatEvery)} seconds.\n` +
      `${WAKING.says}\n`,
  )
}

/**
 * TELL MOLE OFFICE WHICH CLAUDE PROCESS THIS SESSION IS, ONCE, AND CARRY ON WHATEVER THE ANSWER.
 *
 * The reading is `theSessionProcessForTheWaiter`: the walk up this waiter's own parents first, then
 * `CLAUDE_PID` from this waiter's own environment. Neither is believed here — the office reads the
 * process itself and refuses one it cannot tie to the held record's conversation.
 *
 * `conversation` IS SENT ONLY WHEN THIS WAITER'S OWN SHELL NAMES BOTH the conversation and this same
 * process. It is the weakest of the office's three ties and it is a claim, so sending a conversation
 * beside somebody else's process — which is exactly what a waiter that outlived its session holds —
 * would be offering a tie to a process this environment says nothing about.
 *
 * THIS FUNCTION NEVER EXITS THE WAITER AND NEVER LETS GO OF THE HANDLE. Every ending is one printed
 * line.
 */
async function recordThisSessionsProcess() {
  // ONLY A CLAUDE-CODE SESSION HAS A CLAUDE PROCESS. Nothing is printed for the other two runtimes:
  // a line about a reading that was never going to be made says nothing.
  if (RUNTIME !== 'claude-code') return
  if (!isAlikeLoopback(API)) {
    process.stdout.write(
      'This waiter cannot tell that Mole Office is on this machine, so it recorded no process: a process ' +
        'number means something only on its own machine.\n',
    )
    return
  }
  const found = theSessionProcessForTheWaiter(process.ppid)
  if (!found.recorded) {
    process.stdout.write(
      `No claude process was found for this session, so none was recorded on record ${SESSION}: ${found.why}.\n`,
    )
    return
  }
  const namedConversation = process.env['CLAUDE_CODE_SESSION_ID'] ?? null
  const sameProcess = Number(process.env['CLAUDE_PID']) === found.pid
  const said = await ask(`/api/handles/${encodeURIComponent(AGENT)}/process`, {
    method: 'POST',
    body: JSON.stringify({
      session: SESSION,
      pid: found.pid,
      pidStartedAt: found.pidStartedAt,
      ...(namedConversation === null || namedConversation === '' || !sameProcess
        ? {}
        : { conversation: namedConversation }),
    }),
  })
  if (said === null) {
    process.stdout.write(
      "Mole Office did not answer when this waiter asked it to record this session's process, so nothing was " +
        'recorded. This waiter has not let go of the handle.\n',
    )
    return
  }
  if (said.status !== 200) {
    const sentence = String(said.body?.error ?? `Mole Office answered ${String(said.status)}.`)
    process.stdout.write(
      `Mole Office did not record this session's process on record ${SESSION}: ${sentence} This waiter has not ` +
        'let go of the handle.\n',
    )
    return
  }
  // THE ONE LINE HERE THAT SAYS NOTHING WENT WRONG, so the only one --again leaves out.
  if (AGAIN) return
  process.stdout.write(
    `This session's own process is on record ${SESSION}: pid ${String(found.pid)}, started ` +
      `${String(found.pidStartedAt)}, ` +
      (found.foundBy === 'the walk'
        ? 'found by walking up from this waiter.\n'
        : "found through CLAUDE_PID in this waiter's environment.\n"),
  )
}

await recordThisSessionsProcess()

/**
 * ONE HEARTBEAT: say this session is still there, and act on the answer.
 *
 * The timer below runs it. The waiting loop also runs it once when Mole Office answers again after a
 * heartbeat went unanswered, before it hands anything over, so the line that says what the office
 * answered about the hold comes before the message and is not lost when the hand-over ends the run.
 */
function beatOnce() {
  // ONE HEARTBEAT AT A TIME. When the loop asks while the timer's is still out, it waits for that
  // one, so the same return is never said twice.
  if (beating === null) beating = oneHeartbeat().finally(() => (beating = null))
  return beating
}

/** The heartbeat in flight now, or null. */
let beating = null

async function oneHeartbeat() {
  if (leaving) return
  const said = await ask(`/api/handles/${encodeURIComponent(AGENT)}/beat`, {
    method: 'POST',
    body: JSON.stringify({ session: SESSION }),
  })
  if (leaving) return
  if (said !== null && said.status === 200) {
    // MOLE OFFICE IS ANSWERING AGAIN AFTER IT WAS NOT, so whatever stream is open is one to a
    // server that has since restarted. Ending it is what makes the loop open a live one.
    if (missed > 0) endTheConnection()
    missed = 0
    if (away !== null && away.beatMissed) {
      process.stdout.write(
        `Mole Office was away ${itCameBack()}. It answers that this session still holds "${AGENT}", and anything ` +
          'written while it was away is read now.\n',
      )
    }
    return
  }
  /**
   * THE HOLD WAS RELEASED WHILE MOLE OFFICE WAS AWAY, SO THIS TAKES IT BACK.
   *
   * A 409 has two meanings and they are not the same fact. NOBODY holds the handle: the hold went
   * quiet while the API was down for longer than the lapse window, and this session is still the
   * one somebody has open, so it claims it again. SOMEBODY ELSE holds it: a second terminal took
   * it over, which is the rule working, and this waiter has nothing left to do.
   *
   * Problem `Dm8eX0oNrVS5`: exiting on either of them killed the waiter across an ordinary
   * restart of the API, and the session it belonged to was answering as nobody from then on with
   * nothing on screen to say so.
   */
  if (said !== null && said.status === 409) {
    const again = await ask(`/api/handles/${encodeURIComponent(AGENT)}/hold`, {
      method: 'POST',
      body: JSON.stringify({ session: SESSION, machine: MACHINE, runtime: RUNTIME }),
    })
    if (leaving) return
    if (again !== null && again.status === 201) {
      missed = 0
      process.stdout.write(
        (away === null
          ? `The hold on "${AGENT}" had lapsed`
          : `Mole Office was away ${itCameBack()}. The hold on "${AGENT}" lapsed while it was away`) +
          ', and this session has taken it again. Messages come here again.\n',
      )
      return
    }
    // NOTHING ANSWERED THE HOLD, OR A 5XX DID: the office went away again between the two calls. That
    // is not a refusal, so it is a missed beat like any other, below, and the next beat tries again.
    if (again !== null && again.status < 500) {
      clearInterval(beat)
      const sentence = String(again.body?.error ?? said.body?.error ?? 'Mole Office refused the heartbeat')
      if (away !== null) process.stdout.write(`Mole Office was away ${itCameBack()}.\n`)
      process.stdout.write(
        `This session no longer holds the handle "${AGENT}": ${sentence}\n` +
          'Nothing was signalled. This waiter has stopped; it is holding nothing, so it released nothing.\n',
      )
      await writeThenExit(0, `refused: ${sentence}`)
    }
  }
  missed += 1
  itWentAway(true)
  // AND THE STREAM GOES WITH IT. The read may sit for ever on a socket nobody is serving, so the
  // beat is what ends it; the loop then reconnects and keeps trying. Nothing is printed until
  // Mole Office answers again: if it stays down past the lapse window the hold goes quiet, and
  // the next answered beat takes it again and says so.
  if (missed === 1) endTheConnection()
}

const beat = setInterval(() => void beatOnce(), beatEvery * 1000)

// ------------------------------------------------------------------ waiting for a message

/**
 * PUT THE MESSAGE INTO A RUNNING OPENCODE SESSION.
 *
 * Two requests, in this order: the text goes into its prompt, then the prompt is sent. Answers true
 * when the session took it, and false when anything at all went wrong — the caller then prints the
 * message here instead, so the words are never lost because a request failed.
 */
async function sendItToTheSession(text) {
  try {
    for (const [path, body] of [
      ['/tui/append-prompt', { text }],
      ['/tui/submit-prompt', {}],
    ]) {
      const res = await fetch(`${String(WAKE_AT).replace(/\/+$/, '')}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) return false
    }
    return true
  } catch {
    return false
  }
}

/**
 * WHERE THE PICTURES IN A MESSAGE ARE, so the agent reading this can open them. Criterion M65.
 *
 * ---------------------------------------------------------------------------------------
 * BOTH THE PATH AND THE ADDRESS, AND WHY BOTH
 * ---------------------------------------------------------------------------------------
 *
 * A file sent from another machine is stored on the machine the API runs on, and an agent waiting
 * on a handle is usually on that same machine — so the PATH is what it wants: it can read the file
 * with the tool it already has, with no HTTP at all. An agent somewhere else cannot, so the ADDRESS
 * is printed beside it, and that address is the ordinary preview door, which serves the file
 * because this very message points at it.
 *
 * A PICTURE ON ANOTHER MACHINE SAYS SO AND GETS NO ADDRESS. `machine` on an image block means the
 * file is over there, and this Mole Office will refuse to serve it — rightly, because the file of
 * the same name here would be a different file. Printing an address that is going to 409 would be
 * this tool promising something it has been told is not true.
 *
 * NULL WHEN THERE ARE NO PICTURES, so nothing is printed for the messages that carry none, which is
 * almost all of them.
 */
function whereThePicturesAre(record) {
  const held = record?.data?.pictures
  if (!Array.isArray(held)) return null
  const lines = []
  for (const one of held) {
    if (one === null || typeof one !== 'object') continue
    const path = typeof one.path === 'string' ? one.path : null
    if (path === null || path === '') continue
    const alt = typeof one.alt === 'string' && one.alt !== '' ? one.alt : null
    const machine = typeof one.machine === 'string' && one.machine !== '' ? one.machine : null
    lines.push(alt === null ? 'A PICTURE:' : `A PICTURE — ${alt}`)
    lines.push(`  the file: ${path}${machine === null ? '' : ` (on ${machine}, not on this machine)`}`)
    if (machine === null) {
      const hint = typeof record?.id === 'string' && record.id !== '' ? `&record=${encodeURIComponent(record.id)}` : ''
      lines.push(`  or read it at: ${API}/api/file?path=${encodeURIComponent(path)}${hint}`)
    }
  }
  return lines.length === 0 ? null : lines.join('\n')
}

/**
 * TELL MOLE OFFICE ONE MESSAGE REACHED THIS SESSION, AND SAY WHAT IT SAYS.
 *
 * Mole Office is told first, so the clock on the message becomes a tick before anything else
 * happens and there is no window in which the worker could read the message as still waiting. When
 * Mole Office refuses that, the refusal is handed back with the message rather than swallowed: the
 * session has the words either way, and it needs to know the row does not say so.
 *
 * NOTHING IS PRINTED HERE AND NOTHING STOPS HERE. This describes one message; `wakeTheSessionWith`
 * below decides what happens to the whole set of them, which is what criterion M74 changed.
 *
 * ---------------------------------------------------------------------------------------------
 * IT MARKS THE MESSAGE DELIVERED; READ IS THE SESSION'S OWN ACT
 * ---------------------------------------------------------------------------------------------
 *
 * A decision replaces M127. `took` says this session was given the words, so it writes
 * delivered with the hand-over sentence and time (problem JRjR0HGrOpGU). The waiter sends no seen
 * option and posts no read mark. It tells the session to mark the message read through its office
 * tool once it has read it. The record read still retries pauses (problem TZD7KatHAtEV); took does not.
 */
async function takeOneAndDescribe(messageId, urgent, batchTurn = null, prepareOnly = false) {
  // WHETHER THIS IS AN EMERGENCY comes from the waiting row that asked this message to be handed
  // over, so the door is not asked a second time for a fact its first answer already carried.
  const took = await ask(`/api/handles/${encodeURIComponent(AGENT)}/took`, {
    method: 'POST',
    body: JSON.stringify({ session: SESSION, message: messageId, ...(batchTurn === null ? {} : { batchTurn }), ...(prepareOnly ? { prepareOnly: true } : {}) }),
  })
  // WHERE THE MESSAGE WAS WRITTEN, as `took` says it. A message is kept in the office's message
  // centre and belongs to no project, so it is read from this waiter's own project like any other, and the mark says only
  // where the words were said. An answer joins the conversation wherever it is written.
  const held = took?.body?.writtenIn
  const writtenIn = typeof held === 'object' && held !== null && !Array.isArray(held) ? held : null
  // THE SAME SECOND TRY FOR THE RECORD READ, because a pause in it is what the person saw as a block
  // with no sender and no words. Problem TZD7KatHAtEV.
  const read = await askWithRetries(`/api/records/${encodeURIComponent(messageId)}`, {})
  const record = read?.body?.record ?? null
  // THE MESSAGE AS THE OFFICE HANDS IT OVER, which is where the instructions for its mark and its own label are,
  // worked out from the sender's row. Read only after `took` said this session was given the message, and only when
  // it did: a refused take hands over nothing. The record read above is the words and their stored mark; these two
  // sentences are the office's reading of them for this hand-over.
  const handed = took !== null && took.status === 200 ? await askWithRetries(`/api/messages/${encodeURIComponent(messageId)}`, {}) : null
  const handedAsRead = handed !== null && handed.status === 200 && typeof handed.body === 'object' && handed.body !== null && typeof handed.body.message === 'object' && handed.body.message !== null
    ? handed.body.message
    : null
  // WHETHER THE OFFICE NEVER ANSWERED, which is a different fact from a refusal. The refusal is a
  // sentence for the session to read; never answering is something the session must finish itself.
  const readDidNotAnswer = read === null || read.status >= 500
  // A LINE OF THE OFFICE'S OWN IS A FEW WORDS WITH THE WHOLE SENTENCE BEHIND IT (criterion M34), and a
  // person reads the sentence by hovering. A session cannot hover, so it is handed the sentence after
  // the line, or it would get the few words and never what they stand for.
  const line = typeof record?.data?.body === 'string'
    ? theMessageAnAgentReads(record.data.body, quotesOf({ kind: typeof record.kind === 'string' ? record.kind : 'message', data: record.data }), record.data.quotePositions ?? null)
    : null
  const behind = typeof record?.data?.saidInFull === 'string' && record.data.saidInFull !== '' ? record.data.saidInFull : null
  const body = line === null ? behind : behind === null ? line : `${line}\n\n${behind}`
  // WHO SENT IT, in the words the took door handed over (problem ynGL0myEnAbi). The office reads the
  // sender's name in its registries, and the run prompt and the dsh hook are given the same words, so
  // all three hand-overs print the same line. Where the took door refused or did not answer, there are
  // no such words, and the line keeps the stored sender and says the office did not name it.
  const from =
    typeof took?.body?.whoSentIt === 'string'
      ? took.body.whoSentIt
      : DELIVERY_ENVELOPE.aSenderTheOfficeDidNotName(record?.data?.sentBy)
  // AND HOW THAT SENDER ASKS TO BE ADDRESSED, in the words the same took door handed over. Null
  // when the sender set no part, and null when the took door refused or did not answer, because then nothing here
  // knows; either way the hand-over has no line for it.
  const addressTheSender = typeof took?.body?.howToAddressTheSender === 'string' ? took.body.howToAddressTheSender : null
  // AND THE PICTURES IT CARRIES, criterion M65. An agent only told that there was a picture has
  // been told about something it cannot open, so the path and the address are printed with the
  // words — in the terminal and into a running session alike.
  const pictures = whereThePicturesAre(record)
  const said = pictures === null ? body : body === null ? pictures : `${body}\n\n${pictures}`
  const marked = took !== null && took.status === 200
  // ONE PLAIN LINE WHEN THE OFFICE NEVER ANSWERED THE RECORD READ, naming the record and its project
  // so the session can read the message itself. This is the block that used to read "nobody the
  // registries know". Problem TZD7KatHAtEV.
  const unreadRecord = readDidNotAnswer ? `Mole Office did not answer in three tries. Read record ${messageId} yourself.` : null
  // AND A LINE OF ITS OWN WHEN THE FLAG'S READING IS MISSING, because that is a different door. It says which door
  // answered what, so a 4xx is a refusal with its sentence and a took door that never asked is not called silent.
  const readTheMessageDoor = took !== null && took.status === 200
  let unreadMessage = null
  if (!readTheMessageDoor) {
    const why = took === null
      ? 'the took door did not answer'
      : `the took door refused: ${String(took.body?.error ?? `Mole Office answered ${String(took.status)}`).replace(/\.$/, '')}`
    unreadMessage = `This hand-over did not ask the message door what its mark and label ask, because ${why}. Read GET /api/messages/${messageId} yourself for what its mark and label ask.`
  } else if (handed === null) {
    unreadMessage = `Mole Office did not answer in three tries. Read GET /api/messages/${messageId} yourself for what its mark and label ask.`
  } else if (handed.status >= 400 && handed.status < 500) {
    unreadMessage = `Mole Office refused to say what this message's mark and label ask: ${String(handed.body?.error ?? `Mole Office answered ${String(handed.status)}`)} Read GET /api/messages/${messageId} yourself for what its mark and label ask.`
  } else if (handed.status !== 200) {
    unreadMessage = `Mole Office did not answer in three tries. Read GET /api/messages/${messageId} yourself for what its mark and label ask.`
  } else if (handedAsRead === null) {
    // A 200 WITH NO MESSAGE IS NOT A READING. It used to fall through both this chain and
    // `handedAsRead`, so the hand-over printed no flag line and no line saying the reading is
    // missing, which decision 4B_co_7OVpPB closes.
    unreadMessage = `Mole Office answered ${String(handed.status)} but did not say what this message's mark and label ask. Read GET /api/messages/${messageId} yourself for what its mark and label ask.`
  }
  return {
    messageId,
    // Keep the pool door's group, as item 5 of a decision and 13n's ExgRp9L2BdPC say.
    fromGroup: took?.body?.fromGroup ?? null,
    urgent,
    from,
    addressTheSender,
    said,
    writtenIn,
    marked,
    unreadRecord,
    unreadMessage,
    // THE ROUTED LINE, WHEN THIS WAITER IS A RECIPIENT THE ROUTING CHOSE.
    // The message record carries the office's own `routed` entries, and the one matcher decides
    // whether this session's agent is one of the `to` participants. Null when it is the addressee.
    routedLine: theRoutedLineFor({ routed: routedOf(record?.data ?? {}) }, theHeldAgent),
    // WHAT THE SENDER WANTS BACK, the mark and the person's own label, with the instructions the office handed over
    // for each. The record read carries the stored mark and label; the message read carries the office's reading of
    // them, so a flag whose instruction the person changed is handed over in their words and not a constant's.
    intent: handedAsRead?.intent ?? record?.data?.intent ?? null,
    label: handedAsRead?.label ?? record?.data?.label ?? null,
    whatTheMarkAsks: handedAsRead?.whatTheMarkAsks ?? null,
    whatTheLabelAsks: handedAsRead?.whatTheLabelAsks ?? null,
    markedParts: Array.isArray(handedAsRead?.markedParts) ? handedAsRead.markedParts : null,
    noMarkName: typeof handedAsRead?.noMarkName === 'string' ? handedAsRead.noMarkName : null,
    batchTurn,
    refusal: marked ? null : String(took?.body?.error ?? 'nothing answered'),
    // WHAT DECIDES WHEN THE KIT'S WAITER WAKES THE SESSION FOR IT (whenAHandOverWakes), as the record stores it.
    read: record !== null,
    sentBy: record?.data?.sentBy,
    toGroup: record?.data?.toGroup,
    words: record?.data?.body,
    deliveredOnlyTo: record?.data?.deliveredOnlyTo,
  }
}

/**
 * THIS AGENT AS AN @ NAMES IT: its registry id, its handle and the name the chat draws, read from the office, or null
 * when the office did not say, and then one line says so. Read only when a hand-over's answer turns on it.
 */
async function theAgentAsAnAtNamesIt() {
  const read = await ask(`/api/participants/agent/${encodeURIComponent(theHeldAgent.id)}`)
  const { handle, name } = read?.status === 200 ? (read.body?.participant ?? {}) : {}
  if (typeof handle === 'string' && typeof name === 'string') return { who: { kind: 'agent', id: theHeldAgent.id }, handle, name }
  process.stderr.write("The office did not say this agent's name, so each group message in this hand-over counts as naming it.\n")
  return null
}

/** What one taken message reads as in the terminal, as a block of lines. */
function whatOneMessageReadsAs(one) {
  // THE ENVELOPE FIRST, THE SAME THREE LINES THE RUN PROMPT CARRIES. The reason of 14 September 2026:
  // the office's repetitive hand-over text costs tokens for nothing, and there was no envelope at
  // all. It is declared once in src/shared/messages.ts and both hand-overs build it from there, so a
  // bridge that copies this needs no preamble of its own.
  const envelope = deliveryEnvelope({
    fromGroup: one.fromGroup,
    from: one.from,
    addressTheSender: one.addressTheSender,
    writtenIn: one.writtenIn ?? null,
    message: one.messageId,
    routedLine: one.routedLine,
    intent: one.intent,
    label: one.label,
    whatTheMarkAsks: one.whatTheMarkAsks,
    whatTheLabelAsks: one.whatTheLabelAsks,
    body: typeof one.words === 'string' ? one.words : '',
    markedParts: Array.isArray(one.markedParts) ? one.markedParts : null,
    noMarkName: typeof one.noMarkName === 'string' ? one.noMarkName : null,
  })
  const lines = one.urgent
    ? [
        // THE MARK USES THE PAGE WORD, so the agent and the person read one name for it. Criterion M62.
        `${firstInQueueMark()} — AN EMERGENCY MESSAGE ARRIVED FOR "${AGENT}".`,
        '',
        ...envelope,
      ]
    : envelope
  if (!one.marked) {
    lines.push(
      '',
      'MOLE OFFICE DID NOT MARK IT DELIVERED: ' +
        one.refusal +
        ' The words are below either way, and the row still shows a clock.',
    )
  }
  // NO LINE ABOUT WHERE TO ANSWER. A message belongs to no project now: every message is kept in
  // the office's message centre, and an answer joins the conversation wherever it is written. The envelope above says
  // where these words were written, and that is all a project has to do with it. This block used to tell the session to
  // answer in the project the message was filed in (criterion M76), which is what that decision ended.
  lines.push(
    '',
    one.said !== null
      ? one.said
      : // THE OFFICE NEVER ANSWERED THE RECORD: say so with the record id and its project, so the session can
        // read the message itself. A 4xx is an answer, and keeps the older sentence.
        (one.unreadRecord ?? 'Mole Office would not hand back what it says. Read it with the record id above.'),
  )
  // THE WORDS ARRIVED BUT THE OFFICE'S READING OF THEIR FLAG DID NOT. The session has the words and must read the
  // message door itself for what its mark and label ask, so the line is printed even when the record answered.
  if (one.unreadMessage !== null) lines.push('', one.unreadMessage)
  lines.push('', howTheSessionMarksRead(one))
  return lines
}

/** The same instruction reaches the terminal, OpenCode, and a failed OpenCode send printed here. */
function howTheSessionMarksRead(one) {
  return (one.marked ? 'The message is delivered. ' : '') +
    'Marking it read is your own act: ' +
    `POST /api/messages/${one.messageId}/mark {"mark":"seen"} through your office tool once you have read it.`
}

/**
 * HAND EVERY MESSAGE WAITING TO THE SESSION, AND WAKE IT ONCE.
 *
 * Criterion M74: while an agent prepares a reply after receiving a message, it shows as offline in the chat,
 * and becomes online again only when it replies. A picture sent while the agent was replying may not
 * have arrived because the agent's script was not mounted.
 *
 * WHY IT TAKES A LIST AND NOT ONE MESSAGE. For Claude Code the wake IS this process stopping, so a
 * waiter that stopped after the first message left every other one waiting for the next hold. It
 * took them one at a time down a loop that could only ever run once. Everything waiting now goes in
 * one wake: taken, printed in order with the emergencies first, and then one exit.
 *
 * WHAT HAPPENS NEXT DEPENDS ON THE TOOL, and `src/shared/waking.ts` is where that was measured.
 * OpenCode takes each message straight in and this goes on waiting. Claude Code is woken by this
 * process exiting. A Codex session started the ordinary way cannot be reached, so the messages are
 * printed and this stops, and they wait in that terminal until somebody looks.
 */
async function wakeTheSessionWith(waitingRows) {
  // EACH ROW CARRIES WHETHER IT IS AN EMERGENCY, which is what the door's one answer already said.
  // Criterion M62 used to cost a second call to the same door per message to ask this; the wait
  // that produced the rows is now the same answer, so the second call is gone.
  const asked = (Array.isArray(waitingRows) ? waitingRows : [waitingRows]).map((one) => ({
    messageId: String(one.messageId),
    urgent: one.urgent === true,
    batchTurn: typeof one.batchTurn === 'string' ? one.batchTurn : null,
  }))
  if (asked.length === 0) return false
  const hasBatch = asked.some((one) => one.batchTurn !== null)
  const acknowledge = async (taken) => {
    for (const one of taken) {
      const reply = await ask(`/api/handles/${encodeURIComponent(AGENT)}/took`, {
        method: 'POST',
        body: JSON.stringify({ session: SESSION, message: one.messageId, ...(one.batchTurn === null ? {} : { batchTurn: one.batchTurn }) }),
      })
      if (reply?.status !== 200) process.stderr.write(`The notice batch handover could not be acknowledged for message ${one.messageId}; its original delivery remains available.\n`)
    }
  }
  if (hasBatch && WAKING.act === 'send-it-to-the-session') {
    const taken = []
    for (const row of asked) taken.push(await takeOneAndDescribe(row.messageId, row.urgent, row.batchTurn, true))
    if (taken.some((one) => one.said === null)) {
      process.stderr.write('The notice batch could not be read for handover. Every original delivery remains queued.\n')
      return false
    }
    const text = taken.flatMap((one) => [...whatOneMessageReadsAs(one), '']).join('\n')
    if (await sendItToTheSession(text)) await acknowledge(taken)
    else process.stderr.write('The session refused the notice batch handover. Every original delivery remains queued.\n')
    return false
  }

  // OPENCODE: STRAIGHT INTO THE RUNNING SESSION, one after another, and this waiter carries on.
  if (WAKING.act === 'send-it-to-the-session') {
    let allWentIn = true
    const printed = []
    for (const row of asked) {
      const one = await takeOneAndDescribe(row.messageId, row.urgent)
      if (leaving) return true
      if (one.said === null) {
        allWentIn = false
        printed.push(one)
        continue
      }
      // THE SAME ENVELOPE, so an OpenCode session and a printed one are handed the message the same
      // way. The envelope says where the message was written, so no separate sentence about it is needed.
      const envelope = deliveryEnvelope({
        fromGroup: one.fromGroup,
        from: one.from,
        addressTheSender: one.addressTheSender,
        writtenIn: one.writtenIn ?? null,
        message: row.messageId,
        routedLine: one.routedLine,
        intent: one.intent,
        label: one.label,
        whatTheMarkAsks: one.whatTheMarkAsks,
        whatTheLabelAsks: one.whatTheLabelAsks,
        body: typeof one.words === 'string' ? one.words : '',
        markedParts: Array.isArray(one.markedParts) ? one.markedParts : null,
        noMarkName: typeof one.noMarkName === 'string' ? one.noMarkName : null,
      }).join('\n')
      const sent = await sendItToTheSession(
        one.urgent
          ? `${firstInQueueMark()} — an EMERGENCY message arrived for you in Mole Office. It was put in front of everything ` +
            `else waiting for you. Answer it before you go back to what you were doing.\n\n${envelope}\n\n${one.said}\n\n${howTheSessionMarksRead(one)}`
          : `${envelope}\n\n${one.said}\n\n${howTheSessionMarksRead(one)}`,
      )
      if (leaving) return true
      if (sent) {
        process.stdout.write(`Sent message ${row.messageId} into this OpenCode session. Still holding "${AGENT}".\n`)
        continue
      }
      allWentIn = false
      printed.push(one)
      process.stdout.write(
        `Message ${row.messageId} could not be sent into the OpenCode session at ${String(WAKE_AT)}, so it is ` +
          'printed here instead.\n',
      )
    }
    if (allWentIn) return false
    // THE ONES THAT COULD NOT GO IN ARE PRINTED, and this waiter stays up: it is still the session
    // holding the handle, and stopping would not wake an OpenCode session anyway.
    const lines = []
    for (const one of printed) lines.push(...whatOneMessageReadsAs(one), '')
    process.stdout.write(`${lines.join('\n')}\n`)
    return false
  }

  const taken = []
  for (const row of asked) taken.push(await takeOneAndDescribe(row.messageId, row.urgent, row.batchTurn, hasBatch))
  if (hasBatch && taken.some((one) => one.said === null)) return false
  // AND WHAT THE AGENT'S GROUPS GAINED THAT DID NOT REACH IT ONE BY ONE, read while the beat still holds the handle.
  const groupsNews = await theGroupsNewsForAHandOver()
  // AND WHEN THE KIT'S WAITER WAKES THE SESSION FOR THIS HAND-OVER, worked out while the beat still holds the handle.
  const wakes = KEPT_BY_THE_KIT ? await whenAHandOverWakes(taken, theAgentAsAnAtNamesIt) : null

  if (leaving) return true
  clearInterval(beat)
  const lines = []
  if (taken.length > 1) {
    lines.push(
      `${String(taken.length)} MESSAGES ARE WAITING FOR "${AGENT}", and they are all below, oldest first with any`,
      // THE KIT KEEPS THE HANDLE ITSELF, so a session reading several messages is not told to start a
      // waiter that is already running and would fight this one. It is still told to answer them all.
      KEPT_BY_THE_KIT
        ? 'emergency in front. Answer them all.'
        : 'emergency in front. Answer them all before you start the waiter again.',
      '',
    )
  }
  for (const one of taken) lines.push(...whatOneMessageReadsAs(one), '')
  lines.push(...groupsNews)
  if (KEPT_BY_THE_KIT) {
    // THE KIT'S OWN WAITER RUNS THIS TOOL AGAIN BY ITSELF, so there is no waiter to start. One plain
    // sentence says the handle stays held and why a second waiter must not be started. Problem
    // `TZD7KatHAtEV`; the secretary's review of 23 September 2026.
    lines.push(
      "The kit's waiter runs this tool again by itself, so the handle stays held; do not start another waiter, " +
        'because a second one fights this one for the handle.',
    )
  } else {
    lines.push(
      'Start the waiter again so the next message comes here too:',
      // PROBLEM `9GprctNxq97I`: THE COMMAND CARRIES THE PROJECT THIS WAITER WAS STARTED IN. It used to
      // print --workspace only when the message came from another project, so a secretary in another
      // project copied a command that failed with "is in another project". The workspace this waiter
      // resolved is known here, so the copyable command names it and only it.
      `    ${THIS_TOOL_AS_A_COMMAND} --agent ${AGENT} --session ${SESSION} --workspace ${WORKSPACE}`,
      'Until then this session still holds the handle: nothing is lost, and no run answers in your place.',
    )
  }
  if (hasBatch) {
    await new Promise((resolve, reject) => process.stdout.write(`${lines.join('\n')}\n`, (error) => error ? reject(error) : resolve()))
    await acknowledge(taken)
  } else process.stdout.write(`${lines.join('\n')}\n`)
  if (KEPT_BY_THE_KIT) {
    // THE OFFICE'S OWN TIMING, FOR THE WAITER THAT WILL RUN THIS TOOL AGAIN. The kit's waiter caps a
    // back-off against the lapse and the beat, so it reads them from each run's output rather than
    // assuming the declared defaults. AND WHEN IT WAKES THE SESSION FOR THIS HAND-OVER: now, after-a-burst
    // or nobody. Both are printed just before the last line, so the last line still names why this run
    // ended. Without the flag nothing here changes.
    process.stdout.write(
      `office hold timing: beatEvery=${String(beatEvery)} lapsesAfter=${String(lapsesAfter)}\n${THE_WAKE_LINE}${wakes}\n`,
    )
  }
  // THE LAST LINE NAMES THE HAND-OVER, problem `kimEUGbzWDdn`: a process check run against a waiter
  // that had already taken a message and gone read the run as failed. The ids are the messages this
  // printing handed over, so a restart knows what was taken and by which waiter.
  await writeThenExit(0, `delivered ${taken.map((one) => one.messageId).join(' ')}`)
}

/**
 * WHAT THE AGENT'S GROUPS GAINED THAT DID NOT REACH IT ONE BY ONE, for a hand-over, with its read point in each group
 * moved to now (message RFv1V8oxkYGF; criterion GM4). A group message that @s members reaches only them, so the
 * rest learn of it here; every message with a delivery to this agent comes through this waiter whole, so the door leaves
 * it out. Moving the point to now loses nothing: what was handed over came before it, and a delivery not handed over yet
 * goes with the next wake. Answers the lines to print: the door's text and a blank line, none when no group has anything
 * left, and one sentence when the door could not be read, in which case the point did not move.
 *
 * ONLY A PRINTED HAND-OVER READS IT. An OpenCode session is sent its messages one by one and is given the groups' news by
 * its next brief, as before.
 */
async function theGroupsNewsForAHandOver() {
  const read = await askWithRetries(THE_GROUPS_NEWS_AT_A_HAND_OVER)
  const groups = read?.body?.summary?.groups
  if (read === null || read.status !== 200 || !Array.isArray(groups) || typeof read.body?.text !== 'string') {
    return [
      `${read === null ? 'Mole Office did not answer' : `Mole Office answered ${String(read.status)}`} when this waiter ` +
        'asked what your groups gained, so their news is not here and your read point in them did not move; ' +
        'GET /api/messages/groups reads it.',
      '',
    ]
  }
  return groups.length === 0 ? [] : [read.body.text, '']
}

/**
 * ANYTHING WAITING FOR THIS HANDLE, AND IT IS THE HOLD ITSELF.
 *
 * The one request this loop makes asks the door to hold the answer until a delivery row is written
 * for this agent or thirty seconds pass. It answers the rows for an empty hold, the rows that
 * arrived during it for a woken one, and null when the office did not answer at all. Null is a
 * different fact from an empty list and the loop says so once.
 *
 * THE ROW CARRIES `urgent` AS WELL AS THE ID, so the message does not ask the same door a second
 * time to find out whether it is an emergency. Criterion M62.
 *
 * THE ORDER IS THE SERVER'S AND IS NOT REDONE HERE. `everythingWaitingFor` puts every emergency in
 * front of every ordinary message and leaves both groups oldest first, so taking this list as it
 * comes is what makes an emergency reach the session first. Sorting again here would be the same
 * rule in two places, free to disagree.
 */
async function anythingAlreadyWaiting() {
  // THE ONE CALL WHOSE ABORT IS RAISED ABOVE THE HOLD WINDOW. Every other ask keeps its ten seconds.
  const seen = await ask(`/api/handles/${encodeURIComponent(AGENT)}/waiting?wait=${String(WAIT_SECONDS)}`, {
    longestMs: WAITING_ABORT_MS,
  })
  if (seen === null || seen.status !== 200) return null
  const waiting = Array.isArray(seen.body?.waiting) ? seen.body.waiting : []
  return waiting.map((one) => ({ messageId: String(one.messageId), urgent: one?.urgent === true, ...(typeof one.batchTurn === 'string' ? { batchTurn: one.batchTurn } : {}) }))
}

/**
 * KEEP ONE CONNECTION OPEN FOR THIS AGENT, SO EVERY PAGE READS IT AS PRESENT.
 *
 * MEASURED, AND IT IS NOT WHAT THE BRIEF EXPECTED. The only event name this tool ever acted on was
 * `message.new`, and only when it was addressed to this agent. But an open connection is also the
 * `listen` input of the presence dot: `src/server/lib/presence.ts` reads `whoIsConnected` from
 * src/server/lib/events.ts, and a held agent with no process row and no transcript reads green
 * because a request is open for it. The test `the-waiter-holds-while-the-session-answers`, which
 * must stay green, depends on exactly that: start the waiter and the agent reads green. So the
 * stream is KEPT FOR THE PRESENCE DOT ALONE. It carries no message work any more, because the hold
 * is the only message path.
 *
 * THIS READER ASKS NOTHING. The old loop asked the waiting door before every stream open,
 * including every reconnect after a stream that would not stay open. That is where the reconnect
 * rows came from. This reader discards what it receives and never touches the waiting door, so a
 * stream that keeps dropping now costs no rows at all.
 *
 * IT RECONNECTS ON A SHORT GROWING BACKOFF, and the heartbeat ends the connection when the office
 * stops answering so a connection to a server that has since restarted is replaced. Both are the
 * behaviour the stream loop already had; only the asking is gone.
 */
async function keepAConnectionOpen() {
  let waitFor = FIRST_WAIT_MS
  for (;;) {
    const connection = new AbortController()
    thisConnection = connection
    let res = null
    try {
      res = await fetch(
        `${API}/api/events?${CONNECTION_TAG_PARAM}=hold-the-handle-${encodeURIComponent(SESSION)}`,
        {
          signal: connection.signal,
          headers: {
            'x-mole-office-workspace': WORKSPACE,
            ...theCallerHeaders(),
            ...(HOME === null ? {} : { [HOME_HEADER]: HOME }),
            accept: 'text/event-stream',
          },
        },
      )
    } catch {
      res = null
    }
    if (res === null || res.body === null) {
      await pause(waitFor)
      waitFor = Math.min(waitFor * 2, LONGEST_WAIT_MS)
      continue
    }
    waitFor = FIRST_WAIT_MS
    const reader = res.body.getReader()
    try {
      // READ AND DISCARD. The hold is the message path; this connection exists only so the presence
      // dot can see the agent while the waiter is up.
      for (;;) {
        const { done } = await reader.read()
        if (done) break
      }
    } catch {
      // The stream died while it was being read, which is what an ordinary restart of the API looks
      // like from here. The loop opens it again.
    }
    try {
      await reader.cancel()
    } catch {
      // The reader was already finished with, which is the ordinary way out of the loop above.
    }
    await pause(waitFor)
  }
}

/**
 * WAIT FOR A MESSAGE ADDRESSED TO THIS AGENT, ON THE HOLD ITSELF.
 *
 * THE HOLD IS THE ONLY MESSAGE PATH. It asks the waiting door to hold the answer until a delivery
 * row is written for this agent or thirty seconds pass, and hands over whatever the answer carries.
 * The delivery write is the narrowest wake point in the product and `writeTheDeliveries` is the one
 * place both record write paths pass through.
 *
 * WHY THAT IS BETTER THAN THE OLD LOOP EVEN WITH THE STREAM STILL OPEN. Where a stream will not stay
 * open, the old loop asked the waiting door on every reconnect: one to five seconds apart, one ask
 * each. This loop waits a full thirty seconds at a time and never asks on a reconnect, so a stream
 * that keeps dropping costs nothing; one mechanism the waiter can rely on for messages beats two.
 * Problem `_79jf1BwYLWM` holds what is known about streams dropping, and it is not much: why they
 * drop has not been measured, and the first version of that problem said it had been. This tool's
 * own waiter wrote 23 rows an hour at that door, not the 1,130 an hour the local bridges wrote.
 *
 * THE HEARTBEAT IS UNTOUCHED and stays on its own twenty-second timer. The lapse is ninety seconds
 * and a hold answers at most every thirty, so the heartbeat is still the thing that says this
 * session is there.
 *
 * A HOLD THAT TIMES OUT ANSWERS EMPTY and the loop asks again. Nothing arrived is not a failure.
 * When the office does not answer at all, the loop says so once, waits a growing moment, and tries
 * again.
 */
async function waitForAMessage() {
  // THE PRESENCE CONNECTION RUNS BESIDE THE HOLD AND IS NOT AWAITED. It is not the message path.
  void keepAConnectionOpen()
  let waitFor = FIRST_WAIT_MS
  for (;;) {
    // THE ONE REQUEST THIS LOOP MAKES, and it holds until a message arrives or the cap passes.
    const waiting = await anythingAlreadyWaiting()
    if (leaving) return
    if (waiting === null) {
      // NOTHING IS PRINTED NOW. A message written meanwhile stays queued and the next hold asks
      // again, so the one line waits until Mole Office answers.
      itWentAway(false)
      await pause(waitFor)
      waitFor = Math.min(waitFor * 2, LONGEST_WAIT_MS)
      continue
    }
    // A HEARTBEAT WENT UNANSWERED, so only a heartbeat's answer says whether the hold was kept. One
    // is asked now and writes the line, before anything is handed over.
    if (away !== null && away.beatMissed) {
      await beatOnce()
      if (leaving) return
    }
    // EVERY HEARTBEAT WAS ANSWERED THROUGH IT, so those answers say the hold was kept.
    if (away !== null && !away.beatMissed) {
      process.stdout.write(
        `Mole Office would not say what is waiting for "${AGENT}" from ${itCameBack()}. Every heartbeat was ` +
          'answered meanwhile, so this session held the handle throughout, and anything written meanwhile is read now.\n',
      )
    }
    waitFor = FIRST_WAIT_MS
    // EVERYTHING WAITING GOES IN ONE WAKE. Criterion M74: taking them one at a time could only ever
    // deliver the first for Claude Code, because the wake is this process stopping.
    if (waiting.length > 0) await wakeTheSessionWith(waiting)
    // AN EMPTY HOLD IS THE ORDINARY CASE. Ask again; the next answer may carry a message.
  }
}

await waitForAMessage()

/**
 * WHERE MOLE_OFFICE_WORKSPACE CAME FROM, in the words the first line prints. An installed office has no
 * checkout, and its .env is in the data folder, so the sentence names the file it read rather than a
 * checkout (wave 13t, round 16).
 * @returns {string}
 */
function whereTheSettingSaidIt() {
  const { source } = readSettingHere('MOLE_OFFICE_WORKSPACE')
  if (source === 'the environment') return "MOLE_OFFICE_WORKSPACE in this process's environment"
  if (source === '.env') return `the .env file at ${ENV_FILE}`
  return 'the built-in default, because nothing set MOLE_OFFICE_WORKSPACE'
}
