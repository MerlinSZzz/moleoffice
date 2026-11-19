// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW A RUNNING SESSION OF EACH TOOL CAN BE WOKEN FROM OUTSIDE — measured, not assumed.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS ANSWERS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion H5 of design/messages/ACCEPTANCE.md section 10: the same on Codex and
 * OpenCode, built and tested. A durable agent answers from the session somebody has open, and that only works if
 * something outside that session can reach into it. Whether it can is a fact about each tool, and
 * the three answers are not the same.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE MEASUREMENTS ARE IN THE CODE AND NOT ONLY IN A RECORD
 * ---------------------------------------------------------------------------------------
 *
 * `tools/hold-the-handle.mjs` acts on these answers: which act it performs when a message arrives
 * depends entirely on which tool the session is. A table of behaviours in the code and a paragraph
 * of findings in a record would be the same fact in two places, free to disagree — the defect
 * CLAUDE.md names as this repository's own. So the finding IS the table, with the date it was taken
 * and the version it was taken against, and the waiter reads it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, ON 4 SEPTEMBER 2026, ON THE OWNER'S MACHINE
 * ---------------------------------------------------------------------------------------
 *
 * CLAUDE CODE 2.1.259 can be woken, and the way is a side effect rather than a feature: a command a
 * session starts in the background invokes that session again when it exits, and what the command
 * printed is what the session then reads. So the waiter waits and EXITS, and its exit is the wake.
 * That is what Mole Office does today, in `tools/hold-the-handle.mjs`.
 *
 * OPENCODE 1.18.23 can be woken, and it is a real feature: a session started with `--port <n>`
 * serves the same HTTP API `opencode serve` does, including `POST /tui/append-prompt` and
 * `POST /tui/submit-prompt`, which put text into the running session's prompt and send it. Measured
 * on a session started with `--port 29971`: the text appeared in the running session's prompt box,
 * and submitting it started a turn which answered. So the waiter POSTS to that session and goes on
 * waiting; it does not need to exit at all.
 *
 * AN ORDINARY CODEX 0.147.0 SESSION CANNOT BE REACHED. It has no port, no socket and no hook that
 * carries a message in, so the waiter prints the message and stops, and it waits in that terminal
 * until somebody looks. That is H5's own answer for a session nothing can reach: H2 falls back to
 * the next turn. The message is marked delivered either way, because it did reach the terminal.
 *
 * KIMI CLI 1.50.0 WAS ADDED ON 5 SEPTEMBER 2026 AND NOTHING REACHES A RUNNING SESSION OF IT. Its
 * `kimi web` and `kimi --wire` surfaces were not measured, its own help marks the Wire server
 * experimental, and no route into a session somebody has open was found. So the waiter prints the
 * message and stops, which is what Codex gets and for the same reason.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED ON 5 SEPTEMBER 2026, WHICH CORRECTED TWO OF THE THREE
 * ---------------------------------------------------------------------------------------
 *
 * This section is here because two sentences written above on 4 September were later measured to be
 * false, and a table of measurements that quietly drops the day it was wrong is worth less than one
 * that keeps both. Problem `20EZGdlvhyS1`.
 *
 * CODEX: A SESSION STARTED WITH `--remote` CAN BE REACHED, and no second install is needed for it.
 * Verifier CX measured this against codex-cli 0.147.0, the npm package already on this machine:
 * `codex app-server --listen ws://127.0.0.1:29981` starts an app server, a session started with
 * `codex --remote ws://127.0.0.1:29981` joins it, and `turn/start` sent over that WebSocket from a
 * separate process put the message in the running session, which answered. What refuses without the
 * standalone install is one subcommand, `codex app-server daemon start`, and the daemon buys process
 * management rather than reach. The whole run is in
 * `design/messages/verification/CODEX-WAKE-EXPERIMENT.md`. The 4 September sentence — that a running
 * Codex session cannot be reached on this machine — was true only of a session started the ordinary
 * way, and it is now written that way, in `startedAnotherWay` below.
 *
 * MOLE OFFICE DOES NOT DO IT YET. Reaching a Codex session this way means Mole Office deciding how
 * sessions are started on somebody's machine, and what shape that adaptation takes is proposal
 * `l6jxQ_tNpfUP`, which is the person's to settle. Until they do, the waiter's act for Codex is unchanged.
 *
 * CLAUDE CODE: THERE IS A PER-SESSION INBOX SOCKET, and the 4 September sentence saying there is no
 * socket that carries a message in was wrong. Researcher FS found it in the framework survey
 * (`design/agents/FRAMEWORK-SURVEY-2026-09.md`): since 2.1.224 a session exports
 * `CLAUDE_CODE_MESSAGING_SOCKET` and `CLAUDE_CODE_MESSAGING_TOKEN`, and a script that connects to
 * that unix socket and writes a JSON line reaches the session. Measured present on this machine on
 * 2.1.259 — this session exported both, and two live sessions had sockets under
 * `/run/user/1000/cc-socks/`. DELIVERY WAS NOT TESTED, on purpose: the only session available to
 * test against was the researcher's own, and injecting a message into it would have put words in
 * that conversation which the owner had not written. So the socket is recorded as present and
 * untried, and what Mole Office uses today is still the background-command exit.
 */

import { AGENT_RUNTIMES, type AgentRuntime } from './participants.ts'

/** The three acts a waiter can perform when a message arrives for the session it belongs to. */
export const WAKING_ACTS = ['exit-and-be-invoked-again', 'send-it-to-the-session', 'print-it-and-stop'] as const

/** One of the three. */
export type WakingAct = (typeof WAKING_ACTS)[number]

/**
 * A SECOND MEASUREMENT, ABOUT A SESSION THIS TOOL STARTED A PARTICULAR WAY.
 *
 * It exists because for Codex the answer is not one boolean: an ordinary session cannot be reached
 * and a session started with `--remote` against an app server can. Writing one of those two and
 * dropping the other is how a measurement becomes false, which is what problem `20EZGdlvhyS1` was.
 *
 * IT CARRIES NO `act`, and that is deliberate. `act` is what the waiter DOES, and the waiter does
 * the same thing whichever way the session was started, because Mole Office does not start sessions
 * this way. An `act` here would be a behaviour nothing performs.
 */
export interface StartedAnotherWay {
  /** What the session has to have been started with, in the words a person would type. */
  startedWith: string
  /** Whether a session started that way can be reached from outside. */
  canBeWoken: boolean
  /** The version this was measured against. */
  measuredAgainst: string
  /** When it was measured. */
  measuredOn: string
  /** What was found, and whether Mole Office does anything with it. */
  says: string
}

/** What is known about waking one runtime, and when it was found out. */
export interface HowToWake {
  /**
   * Whether a session of this tool that is already running, AND STARTED THE ORDINARY WAY, can be
   * reached from outside. `startedAnotherWay` below holds the answer for a session started some
   * other way, where that changes it.
   */
  canBeWoken: boolean
  /** The act the waiter performs. */
  act: WakingAct
  /** The version this was measured against, so a later version being different is visible. */
  measuredAgainst: string
  /** When it was measured. */
  measuredOn: string
  /** One plain paragraph: what was found, and what the waiter therefore does. */
  says: string
  /**
   * What the waiter has to be told for this to work, or null because it needs nothing.
   *
   * OpenCode is the only one that needs anything: the address its session is serving on, which is a
   * number the person who started it chose. Nothing can work it out — a session started without
   * `--port` serves on a port the operating system picked and does not say which.
   */
  needs: string | null
  /**
   * WHAT IS TRUE OF A SESSION STARTED SOME OTHER WAY, or null because how the session was started
   * makes no difference to the answer above.
   */
  startedAnotherWay: StartedAnotherWay | null
}

/**
 * THE THREE ANSWERS, keyed by the runtime word.
 *
 * A `Record` keyed by `AgentRuntime` rather than an array, so a fourth runtime added to
 * `AGENT_RUNTIMES` with nothing measured does not compile. That is the same guard `DELIVERY` in
 * shared/messages.ts uses, and it is the guard that matters most here: a runtime nobody measured
 * would otherwise silently get whatever the default branch happened to be.
 */
export const HOW_TO_WAKE: Readonly<Record<AgentRuntime, HowToWake>> = {
  /**
   * MEASURED 13 SEPTEMBER 2026, AND THE ANSWER IS THAT THERE IS NEVER A SESSION TO WAKE.
   *
   * dsh joined the runtime words on 12 September (criterion P88, as amended) because every worker
   * building this project runs on it. It is the one runtime the office does not dispatch, and it is
   * also the one where the question "can a running session be reached" has a different shape: there
   * is no running session between runs at all.
   */
  dsh: {
    canBeWoken: false,
    act: 'print-it-and-stop',
    measuredAgainst: '0.1.5-rc.1',
    measuredOn: '2026-09-13',
    says:
      'A dsh worker runs its brief once and ends, so nothing is left running for a message to reach. It is started ' +
      'by ~/.cache/mole-office/dsh/run-worker.sh, which passes the brief file as the whole task and closes stdin ' +
      '(< /dev/null), then writes the exit code and stops; nothing can be typed into it even while it runs. Four ' +
      'were started that way on 12 September 2026 for this cluster and all four ended by themselves with exit 0. ' +
      'So the waiter prints the message and stops, and the message waits for whoever starts the next worker. ' +
      '@deepseek-ai/dsh 0.1.5-rc.1 is what is installed at ~/.cache/mole-office/dsh/npm. ONE SURFACE WAS NOT ' +
      'MEASURED: that package tree carries dsh-host-webserver and dsh-sdk-jsonrpc-server, so a dsh started some ' +
      'other way may well serve a socket something could send to. Nobody has tried it, and this entry is about the ' +
      'way this office starts one. If somebody measures that, it belongs in startedAnotherWay below rather than ' +
      'here, the way Codex\'s --remote does.',
    needs: null,
    startedAnotherWay: null,
  },
  'claude-code': {
    canBeWoken: true,
    act: 'exit-and-be-invoked-again',
    measuredAgainst: '2.1.259',
    measuredOn: '2026-09-04',
    says:
      'A command a Claude Code session starts in the background invokes that session again when it exits, and what ' +
      'the command printed is what the session reads. So the waiter waits for a message, prints it and exits, and ' +
      'its exit is what wakes the session. That is the way Mole Office uses, in for-agents/hold-the-handle.mjs, and it ' +
      'is measured and in use. There is a second way in, found on 5 September 2026 and not used yet: since 2.1.224 ' +
      'a session exports CLAUDE_CODE_MESSAGING_SOCKET and CLAUDE_CODE_MESSAGING_TOKEN, and a script that connects ' +
      'to that unix socket and writes a JSON line reaches the session. On 2.1.259 on this machine both variables ' +
      'were exported and two live sessions had sockets under /run/user/1000/cc-socks/, so the socket is measured ' +
      'present — but DELIVERY WAS NOT TESTED, because the only session to test against was the researcher’s own ' +
      'and a message injected into it would have been words the owner never wrote. See ' +
      'design/agents/FRAMEWORK-SURVEY-2026-09.md.',
    needs: null,
    // HOW THE SESSION WAS STARTED MAKES NO DIFFERENCE. The background-command exit works on any
    // Claude Code session, and so does the inbox socket named above.
    startedAnotherWay: null,
  },
  opencode: {
    canBeWoken: true,
    act: 'send-it-to-the-session',
    measuredAgainst: '1.18.23',
    measuredOn: '2026-09-04',
    says:
      'An OpenCode session started with --port <n> serves the same HTTP API the headless server does, and two of ' +
      'its routes reach the running session: POST /tui/append-prompt puts text in its prompt and POST ' +
      '/tui/submit-prompt sends it. Measured against a session on port 29971: the text appeared in the running ' +
      'session and submitting it started a turn that answered. So the waiter sends the message straight to the ' +
      'session and goes on waiting; it never needs to stop.',
    needs: 'the address that session is serving on, which is the --port it was started with',
    // A SESSION SERVES THE SAME API HOWEVER IT WAS STARTED; what --port changes is whether anybody
    // can find out which address it is on, and that is what `needs` above says.
    startedAnotherWay: null,
  },
  codex: {
    canBeWoken: false,
    act: 'print-it-and-stop',
    measuredAgainst: '0.147.0',
    measuredOn: '2026-09-04',
    says:
      'A Codex session started the ordinary way cannot be reached from outside: it has no port, no socket and no ' +
      'hook that carries a message in. So the waiter prints the message and stops, and the message waits in that ' +
      'terminal until somebody looks at it. The app-server daemon subcommand — codex app-server daemon start — ' +
      'refuses here, saying the managed standalone install is not at ~/.codex/packages/standalone/current/codex, ' +
      'because this Codex is the npm package. That is still true, and it is not what decides the answer: ' +
      'startedAnotherWay says what a session started with --remote can do without any of it.',
    needs: null,
    startedAnotherWay: {
      startedWith: 'codex --remote ws://<host>:<port>, against an app server started with codex app-server --listen',
      canBeWoken: true,
      measuredAgainst: '0.147.0',
      measuredOn: '2026-09-05',
      says:
        'Verifier CX started an app server from the npm Codex already on this machine — codex app-server --listen ' +
        'ws://127.0.0.1:29981, nothing installed — joined a session to it with codex --remote, and sent turn/start ' +
        'over that WebSocket from a separate process. The message appeared in the running session and the session ' +
        'answered. thread/inject_items puts a message in the model’s history without starting a turn, and nobody ' +
        'watching the terminal sees it arrive. The standalone install is needed only by the daemon subcommand, ' +
        'which adds process management rather than reach. The whole run is in ' +
        'design/messages/verification/CODEX-WAKE-EXPERIMENT.md. MOLE OFFICE DOES NOT DO THIS YET: it would mean ' +
        'Mole Office deciding how sessions are started on somebody’s machine, and what that adaptation should be ' +
        'is an open proposal, which is the owner’s to settle. Until the owner does, the act above is what happens.',
    },
  },
  kimi: {
    canBeWoken: false,
    act: 'print-it-and-stop',
    measuredAgainst: '1.50.0',
    measuredOn: '2026-09-05',
    says:
      'Nothing reaches a Kimi CLI session that is already running, so the waiter prints the message and stops, and ' +
      'the message waits in that terminal until somebody looks at it. Kimi CLI 1.50.0 was installed on this ' +
      'machine on 5 September 2026 and its command surface was read: a headless run is kimi --print, which starts ' +
      'a process, answers and exits, and there is no port, socket or hook on an interactive session that carries a ' +
      'message in. Two surfaces might one day be one and NEITHER WAS MEASURED: kimi web, and kimi --wire, which ' +
      'its own help marks experimental. Researcher FS2 measured the rest of this tool on 5 September 2026 and left ' +
      'both unmeasured too; see design/agents/FRAMEWORK-SURVEY-2026-09.md, the section "Three more frameworks". So ' +
      'this row says what is known, which is that Mole Office has no way in, and not that there is none.',
    needs: null,
    // HOW THE SESSION WAS STARTED MAKES NO DIFFERENCE TO WHAT IS KNOWN. There is no flag on an
    // interactive kimi session that opens a way in, the way codex --remote does. A second
    // measurement here would be a claim about kimi web, and nobody has taken it.
    startedAnotherWay: null,
  },
}

/** Every runtime word, so a caller can list them without importing two modules. */
export const RUNTIMES_WITH_A_MEASUREMENT: readonly AgentRuntime[] = AGENT_RUNTIMES

/**
 * WHAT THE WAITER DOES FOR ONE RUNTIME, given what it was told.
 *
 * `sendTo` is the address an OpenCode session is serving on. Without it, an OpenCode session cannot
 * be reached even though OpenCode can be: the answer is then the same as Codex's, and the sentence
 * says which of the two reasons it is. A wrong act here is a message that reaches nobody, so the
 * two cases are kept apart rather than collapsed into "cannot be woken".
 */
export function whatTheWaiterDoes(
  runtime: AgentRuntime,
  sendTo: string | null,
): { act: WakingAct; says: string } {
  const known = HOW_TO_WAKE[runtime]
  if (known.act !== 'send-it-to-the-session') return { act: known.act, says: known.says }
  if (sendTo === null) {
    return {
      act: 'print-it-and-stop',
      says:
        'An OpenCode session can be reached from outside, and this one did not say where. Start the waiter with ' +
        '--wake http://127.0.0.1:<the port the session was started with> and a message will go straight into it. ' +
        'Without that, the message is printed here and waits in this terminal until somebody looks at it.',
    }
  }
  return { act: known.act, says: known.says }
}
