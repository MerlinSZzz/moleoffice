// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO IS ANSWERING AS A DURABLE AGENT: the shape on the wire, and the words a person reads.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A HOLD IS, IN ONE SENTENCE
 * ---------------------------------------------------------------------------------------
 *
 * A hold says that one session — a terminal somebody opened — is answering as one durable agent.
 * While a hold is fresh, a message to that agent goes to that session and Mole Office starts no run
 * beside it. Criteria H1 to H4 of design/messages/ACCEPTANCE.md section 10: while the agent is
 * plainly open, starting a second one beside it does not make sense.
 *
 * ---------------------------------------------------------------------------------------
 * FRESH, KEPT, LAPSED AND RELEASED ARE FOUR DIFFERENT FACTS
 * ---------------------------------------------------------------------------------------
 *
 * FRESH: the session said it was there inside the lapse window, so it is answering.
 * KEPT: the session has stopped saying it is there, but not for long enough to give the handle up.
 * The handle is still that session's, a message to the agent waits for it, and nothing is started.
 * LAPSED: the session has not said anything for longer than the grace window either. Nobody knows
 * whether it died or is only busy, so the hold is released with that reason.
 * RELEASED: somebody said the hold was over — the waiter stopping, or a second session taking a
 * lapsed handle over.
 *
 * ---------------------------------------------------------------------------------------
 * WHY KEPT EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M81, on problem `i05BSaUcdfXF` of 7 September 2026. For Claude Code the waiter's own
 * EXIT is how its session is woken: a session reads a background command's output when that command
 * ends. So the waiter stops beating every time a message arrives and starts again once the session
 * has answered. Between those two moments the handle read as held by nobody, the message worker
 * started a run for the next message, and that run wrote in a group as the secretary while the
 * secretary's own session was writing something else. Two answers signed by one handle inside a
 * minute is what a reader of that group met.
 *
 * So a hold that stops beating is not free at once. It stays its session's for the grace window —
 * `MOLE_OFFICE_HANDLE_GRACE_SECONDS`, two minutes — or until that session says it is done, which is
 * what letting the handle go already means.
 *
 * Nothing is ever signalled. A lapsed hold's session may still be alive and doing something else;
 * releasing the hold says only that Mole Office will no longer send it messages.
 */

import type { ParticipantRef } from './participants.ts'
import { parseLocalStamp } from './time.ts'
import type { DevSaying } from './dev-sayings.ts'

/** The four states a hold can be read in. */
export const HOLD_STATES = ['fresh', 'kept', 'lapsed', 'released'] as const

/** One of the four. */
export type HoldState = (typeof HOLD_STATES)[number]

/**
 * What a reader sees for one state.
 *
 * A `Record` keyed by the value rather than an array, so a word added to `HOLD_STATES` with no
 * reading does not compile. That is the same guard `DELIVERY` in shared/messages.ts uses.
 */
export const HOLD: Readonly<Record<HoldState, { word: string; sentence: string }>> = {
  fresh: {
    word: 'Answering now',
    sentence:
      'A session somebody has open is answering as this agent. A message to it goes straight to that session and ' +
      'Mole Office starts no run.',
  },
  kept: {
    word: 'Still held',
    sentence:
      'The session answering as this agent has stopped saying it is there, and the handle still belongs to that ' +
      'session for a short while longer. This is what a session looks like while it writes an answer. A message to ' +
      'this agent waits for that session, and Mole Office starts no run.',
  },
  lapsed: {
    word: 'Went quiet',
    sentence:
      'The session that was answering as this agent has not said it is there for longer than it was meant to. ' +
      'Nothing was signalled: it may still be alive and busy. Mole Office will start a run for the next message.',
  },
  released: {
    word: 'Over',
    sentence: 'This hold has ended. The reason it ended is written on it.',
  },
}

/** One hold, as every reader of it sees it. */
export interface HoldOnTheWire {
  id: string
  /** The agent whose handle is held, by registry id. */
  agent: ParticipantRef
  /** The short name a person types to address that agent. */
  handle: string
  /** The name a reader sees for that agent. */
  name: string
  /** The `records` row of kind `session` for the session that is answering. */
  session: string
  /** The computer that session is running on, in its own words. */
  machine: string
  /** `claude-code`, `codex` or `opencode`. */
  runtime: string
  /** When the hold was claimed. Local wall clock. */
  claimedAt: string
  /** When the session last said it was still there. Local wall clock. */
  lastHeardAt: string
  /** How many seconds ago that was, worked out when this was read. */
  quietFor: number
  /** Fresh, kept, lapsed or released. */
  state: HoldState
  /** When it was released, or null because it has not been. */
  releasedAt: string | null
  /** One plain sentence saying why, or null because it has not been released. */
  releasedBecause: string | null
}

/**
 * Which of the answers a question about who is answering as an agent.
 *
 * `a waiting run` is a run the worker started that has answered and is waiting for the next message
 * (criterion M22). Its process has ended and its hold is released, but for the length of the wait the
 * queue gives the next message to that run's conversation. So it is not `nobody` (criterion M89).
 *
 * `its own conversation` is a secretary or a supervisor whose run is past its wait. No run is going
 * or waiting, and a message to it still picks up its own conversation.
 * So it is not `nobody` either.
 */
export type AnsweringHow = 'a live session' | 'a run' | 'a waiting run' | 'its own conversation' | 'nobody'

/** Who is answering as one agent right now, for a page and for the worker. */
export interface WhoIsAnswering {
  how: AnsweringHow
  /** The session record answering, whether a live session, a run or a waiting run, or null when nobody is. */
  session: string | null
  /** One plain sentence for a person to read. */
  says: string
  /**
   * THE SAME SENTENCE AS A CODE WITH ITS VALUES (src/shared/dev-sayings.ts), so a page draws it in its own
   * language (wave 13k round 35). Left out by an older server, and the page then draws `says` as it came.
   */
  said?: DevSaying
  /** The hold, when a live session is answering. Null otherwise. */
  hold: HoldOnTheWire | null
}

/**
 * THE TWO FIELDS ONE QUEUE ROW CARRIES ABOUT A RUN OR A HOLD ALREADY ANSWERING AS AN AGENT.
 *
 * THEY ARE ONE ANSWER, NOT TWO. `runningAlready` names the session record that is answering, a run's
 * or a live session's hold, and `runningAlreadySays` is the one sentence about it. Both are set
 * together when somebody is answering, and both are null together when nobody is. The rule is here
 * once, so the server's row and the message worker's hand-written copy cannot drift apart: a change
 * to either field is a change to this type, and both files follow it.
 */
export type AlreadyAnsweringOnARow =
  | { runningAlready: string; runningAlreadySays: string }
  | { runningAlready: null; runningAlreadySays: null }

/** The sentence each of the three run sentences ends with, said once so that a test reads it here (round 130). */
export const NO_TERMINAL_HAS_THIS_AGENT_OPEN = 'No terminal has this agent open.'

/**
 * The sentence for each of the four, so the page and the server cannot say different things.
 *
 * A RUN IN A SANDBOX IS STILL A RUN, and `sandbox` names it when the run's own record does. The name is
 * the INSTANCE, not the template the sandbox was made from: `theSandboxNameIn` in the server's worker
 * reads the folder's last segment. Then the sentence says where the run is going, because a run inside a
 * sandbox and a run on the host are opened and tidied up in different places. A message-worker run carries
 * no sandbox field, so this names one only when the launcher wrote it.
 *
 * A RUN WITH NO SANDBOX happened on the host, and this says only that a run is going for the agent.
 * It says "A run Mole Office started" only when `startedByMoleOffice` is true. The caller reads that
 * from the run's own record, the same way `theRunAWriteCameFrom` does, so a run a person or a tool
 * started is never claimed as the office's.
 */
export function whoIsAnsweringSays(
  how: AnsweringHow,
  where: { machine: string; runtime: string } | null,
  sandbox: string | null = null,
  startedByMoleOffice = false,
  // WHEN A WAITING RUN'S WAIT ENDS, as the stored `waitsUntil` stamp. Read only for `a waiting run`.
  waitsUntil: string | null = null,
): string {
  /**
   * "CAN", AND "IF THE AGENT STILL USES THE SAME TOOL", because the message may still be held (a live
   * session, a review, a cap, the hop limit, a check that starts its own run), and because the worker
   * picks the conversation up only when its tool made it. That last comparison stays in the worker:
   * `startARun` compares with the adapter it is about to start, and the worker's own environment can
   * turn every runtime word into the fake runtime (`MOLE_OFFICE_FAKE_RUNTIME`), which the server never
   * sees. A server-side copy would disagree with the worker in exactly that case.
   */
  if (how === 'a waiting run') {
    const who = startedByMoleOffice ? 'A run Mole Office started for this agent' : 'A run started for this agent'
    return (
      `${who} has answered and waits for the next message until ${theClockTimeOf(waitsUntil)}. ` +
      "Until then, a message to this agent can be answered in that run's conversation, if the agent still uses " +
      'the same tool.'
    )
  }
  /**
   * NO PROCESS IS CLAIMED, because none is going: the run ended when its wait did. What is true on
   * every path is what a run started for a message does. It may not be started at all (the message
   * may be held, or a session may take the handle first), and the conversation is picked up only by
   * the tool that made it, so the sentence says "if" twice.
   */
  if (how === 'its own conversation') {
    return (
      'Nothing is running as this agent right now. It is a secretary or a supervisor, so its conversation is ' +
      'kept: if a run is started for a message to it, that run picks up the newest conversation it had here, if ' +
      'the agent still uses the same tool.'
    )
  }
  if (how === 'a live session') {
    const at = where === null ? 'a terminal' : `a ${where.runtime} session on ${where.machine}`
    return `Answering from ${at}. A message goes to that session, and Mole Office starts no run.`
  }
  if (how === 'a run') {
    if (sandbox !== null && sandbox.trim() !== '') {
      return `A run is going for this agent in the sandbox ${sandbox.trim()}. ${NO_TERMINAL_HAS_THIS_AGENT_OPEN}`
    }
    if (startedByMoleOffice) {
      return `A run Mole Office started is answering. ${NO_TERMINAL_HAS_THIS_AGENT_OPEN}`
    }
    return `A run is going for this agent. ${NO_TERMINAL_HAS_THIS_AGENT_OPEN}`
  }
  return (
    'Nothing is answering as this agent right now: no session holds its handle and no run is going for it. Whether ' +
    'a message starts a run depends on whether this agent has a conversation here to pick up; where it has none, ' +
    'the person is asked before anything is started.'
  )
}

/**
 * WHO IS ANSWERING, AS THE ENGLISH SENTENCE AND AS THE CODE A PAGE DRAWS IN ITS OWN LANGUAGE (wave 13k round 35).
 *
 * Every place that builds a `WhoIsAnswering` spreads this, so the English and the code are made from one
 * list of facts and cannot describe two situations. The code's English word is the same sentence; it is kept
 * the same by hand, because the
 * word lists cannot be read from this file without a cycle (the word lists read this module's neighbours).
 */
export function whoIsAnsweringLine(
  how: AnsweringHow,
  where: { machine: string; runtime: string } | null,
  sandbox: string | null = null,
  startedByMoleOffice = false,
  waitsUntil: string | null = null,
): { says: string; said: DevSaying } {
  return { says: whoIsAnsweringSays(how, where, sandbox, startedByMoleOffice, waitsUntil), said: whoIsAnsweringSaid(how, where, sandbox, startedByMoleOffice, waitsUntil) }
}

/** The code of `whoIsAnsweringSays`'s sentence, branch for branch. */
function whoIsAnsweringSaid(
  how: AnsweringHow,
  where: { machine: string; runtime: string } | null,
  sandbox: string | null,
  startedByMoleOffice: boolean,
  waitsUntil: string | null,
): DevSaying {
  if (how === 'a waiting run') {
    const until = theClockTimeOf(waitsUntil)
    return startedByMoleOffice ? { code: 'answeringWaitingRunTheOffice', values: { until } } : { code: 'answeringWaitingRun', values: { until } }
  }
  if (how === 'its own conversation') return { code: 'answeringOwnConversation', values: {} }
  if (how === 'a live session') {
    return where === null
      ? { code: 'answeringLiveSessionTerminal', values: {} }
      : { code: 'answeringLiveSession', values: { runtime: where.runtime, machine: where.machine } }
  }
  if (how === 'a run') {
    if (sandbox !== null && sandbox.trim() !== '') return { code: 'answeringRunInASandbox', values: { sandbox: sandbox.trim() } }
    return startedByMoleOffice ? { code: 'answeringRunTheOffice', values: {} } : { code: 'answeringRun', values: {} }
  }
  return { code: 'answeringNobody', values: {} }
}

/**
 * A stored stamp as HH:MM on the local wall clock. A stamp that cannot be read is shown as itself,
 * so an unreadable moment is never replaced by a guessed one.
 */
function theClockTimeOf(stamp: string | null): string {
  // A WAITING RUN ALWAYS HAS ITS DEADLINE, because that stamp is what makes it a waiting run. A
  // caller that names one without it has read something else, and is told so.
  if (stamp === null) throw new Error('A waiting run was named without the time its wait ends.')
  const ms = parseLocalStamp(stamp)
  if (ms === null) return stamp
  const at = new Date(ms)
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
}

/**
 * THE SENTENCE ON A DELIVERY ROW WHOSE MESSAGE IS WAITING BECAUSE A RUN IS GOING.
 *
 * It answers the two questions that row is read for, and it is the one place both answers are put together,
 * because one situation must not read two ways. The first half is who is answering, built by
 * `whoIsAnsweringSays`, the same sentence the chat's answering mark draws. The second half is what happens
 * to this message, and it is read from what the worker really does with it.
 *
 * A RUN THE MESSAGE WORKER STARTED is the run the office put on this agent for a message. The worker starts
 * that run's next message once the run ends, so this message is delivered then, exactly as the row said
 * before this function existed.
 *
 * A RUN THE OFFICE DID NOT START is a sandbox run or a host run somebody else began. The worker cannot
 * continue it and does not hand it this message; the message stays queued. The run can still read the
 * message by opening the conversation, and that read marks the delivery delivered. Until that run reads
 * the message or ends, the message waits here. Nothing is said about what happens after the run ends,
 * because the code has more than one path from there.
 */
export function theMessageWaitsForARunGoing(sandbox: string | null, startedByMoleOffice: boolean): string {
  const answering = whoIsAnsweringSays('a run', null, sandbox, startedByMoleOffice)
  if (startedByMoleOffice) {
    return `${answering} This message goes to it when that run ends.`
  }
  return (
    `${answering} This run was not started for the message. It can read the message in the conversation, ` +
    'and reading it marks the message delivered. The message waits here until that run reads it or ends.'
  )
}

/**
 * THE TWO FIELDS ABOVE, TOGETHER, read from who is answering as the agent — the hold included.
 *
 * THE HOLD WINS, because that is how `whoIsAnsweringAs` reads it: while a live session holds the
 * handle, a message goes to that session and no run is started beside it. So when a live session
 * holds the handle the sentence is that session's own sentence, which is the same one
 * `GET /api/handles/<handle>` answers with, and it is never a run sentence that says nobody has the
 * agent open in a terminal.
 *
 * A RUN KEEPS THE WAITING SENTENCE WAVE 6 MADE, `theMessageWaitsForARunGoing`, because that sentence
 * also says what happens to the message in hand. `sandbox` and `startedByMoleOffice` are the run
 * row's own facts, read by the caller from the row the answering names. When nobody is answering
 * both fields are null and the run facts are not read.
 *
 * A WAITING RUN IS NOT GOING, and neither is a kept conversation, so both fields are null for them too. Its process has ended, and the
 * queue must still give the next message to its conversation (criterion M22). A row that said a run
 * is already going would make the worker hold the message instead, and the wait would do nothing.
 */
export function theAlreadyAnsweringOnARow(
  answering: WhoIsAnswering,
  sandbox: string | null,
  startedByMoleOffice: boolean,
): AlreadyAnsweringOnARow {
  if (
    answering.how === 'nobody' ||
    answering.how === 'a waiting run' ||
    answering.how === 'its own conversation' ||
    answering.session === null
  ) {
    return { runningAlready: null, runningAlreadySays: null }
  }
  if (answering.how === 'a live session') {
    return { runningAlready: answering.session, runningAlreadySays: answering.says }
  }
  return {
    runningAlready: answering.session,
    runningAlreadySays: theMessageWaitsForARunGoing(sandbox, startedByMoleOffice),
  }
}

/**
 * THE SENTENCE A SECOND SESSION IS REFUSED WITH, naming who is holding the handle.
 *
 * Criterion H4. It names the holder rather than only saying no, because the person reading it is
 * usually the person who left the other terminal open, and "which one" is the whole of what they
 * need. Nothing is signalled by the refusal: the other session is not touched.
 */
export function heldBySomebodyElse(held: {
  handle: string
  session: string
  machine: string
  runtime: string
  lastHeardAt: string
  lapsesInSeconds: number
}): string {
  return (
    `The handle "${held.handle}" is already held by the session filed as record ${held.session}, a ` +
    `${held.runtime} session on ${held.machine}. It last said it was there at ${held.lastHeardAt}. ` +
    `Nothing was signalled and that session was not touched. This handle can be taken over once that session has ` +
    `been quiet for ${String(held.lapsesInSeconds)} seconds; until then, one handle answers to one session.`
  )
}

/**
 * WHY A HOLD ENDED BECAUSE ANOTHER SESSION TOOK THE HANDLE OVER.
 *
 * Criterion H4: *after the heartbeat lapses it may take over; nothing is signalled*. The row says
 * both halves — that the first session went quiet, and who has the handle now — because a person
 * reading it later wants to know which terminal is answering as this agent, and "it went quiet" on
 * its own does not say.
 */
export function takenOverBy(seconds: number, lapsesInSeconds: number, session: string): string {
  return (
    `The session holding this handle said nothing for ${String(seconds)} seconds, which is longer than the ` +
    `${String(lapsesInSeconds)} seconds it was allowed, so the session filed as record ${session} took the handle ` +
    'over. Nothing was signalled and the first session was not touched; it may still be running. Messages to this ' +
    'agent go to the new session from now on.'
  )
}

/**
 * Why a hold was released because nobody said anything for too long.
 *
 * `lapsesInSeconds` is the GRACE window and not the beat window, because the grace is the last
 * moment at which the handle was still this session's. Criterion M81. The last sentence says what
 * happens next, and since M78 that is a question put to the person rather than a run started for
 * them.
 */
export function wentQuiet(seconds: number, lapsesInSeconds: number): string {
  return (
    `The session holding this handle said nothing for ${String(seconds)} seconds, which is longer than the ` +
    `${String(lapsesInSeconds)} seconds it was allowed. Nothing was signalled; that session may still be alive. ` +
    'Mole Office asks the person before it starts a run for the next message to this agent.'
  )
}

/**
 * WHY THE WORKER STARTS NO RUN WHILE A HANDLE IS STILL ITS SESSION'S, though nothing is beating it.
 *
 * Criterion M81. It is a separate sentence from `aLiveSessionHasIt` because the two are different
 * facts and a reader acts on the difference: one says a session is there right now, this one says a
 * session was there a moment ago and the message is waiting for it to come back.
 */
export function itsSessionStillHasIt(handle: string, session: string, seconds: number, graceSeconds: number): string {
  return (
    `The session filed as record ${session} was answering as "${handle}" ${String(seconds)} seconds ago and has ` +
    `stopped saying it is there. A handle stays its session for ${String(graceSeconds)} seconds, because a session ` +
    'writing an answer stops saying it is there while it writes. This message waits for that session, and no run ' +
    'was started.'
  )
}

/** Why the worker starts no run for a message to an agent a live session is answering as. */
export function aLiveSessionHasIt(handle: string, session: string): string {
  return (
    `The session filed as record ${session} is answering as "${handle}", so this message goes to it and no run ` +
    'was started. This is what a durable agent means: one mind answers, and Mole Office does not open a second ' +
    'one beside it.'
  )
}

const HAND_OVER_SENTENCE = ['The session filed as record ', ' was waiting for this and has been given it.'] as const

/** What the delivery row says when the waiting session took the message. */
export function theLiveSessionTookIt(session: string): string {
  return HAND_OVER_SENTENCE[0] + session + HAND_OVER_SENTENCE[1]
}

/** A hand-over sentence for any nonempty session, recognised from the same words the writer uses. */
export function isAHandOverSentence(because: string | null): boolean {
  return because !== null && because.startsWith(HAND_OVER_SENTENCE[0]) && because.endsWith(HAND_OVER_SENTENCE[1]) &&
    because.length > HAND_OVER_SENTENCE[0].length + HAND_OVER_SENTENCE[1].length
}

const MESSAGE_READ_SENTENCE = 'This message was handed over when the agent asked for its messages.'

/** The delivered read's sentence stays true after the recipient marks the message seen. */
export function theMessageReadTookIt(): string {
  return MESSAGE_READ_SENTENCE
}

/** The writer and the reply reminder recognise the same evidence of a delivered read. */
export function isAMessageReadSentence(because: string | null): boolean {
  return because === MESSAGE_READ_SENTENCE
}

/**
 * HOW A REMOTE AGENT RUNS THE WAITER AGAINST ONE OFFICE, in the words it would type.
 *
 * Criterion M77: how a Codex on another machine runs the waiter, and whether copies of the script
 * belong in the skill file.
 * They should not: the office serves its own, so a remote agent never runs a version older than the
 * office it is holding a handle with. This is the sentence that goes with it, built here so the
 * route, the skill and any page say one thing.
 *
 * THE THREE ARGUMENTS ARE ALL REQUIRED FROM ANOTHER MACHINE. `--api` because nothing on the other
 * machine knows where this office is; `--agent` because `MOLE_OFFICE_AGENT` is a setting of the
 * office\u2019s own checkout and the other machine has no checkout; `--session` because a hold names
 * a session record, and that record has to exist in THIS office\u2019s database — a session filed on
 * the other machine\u2019s own Mole Office is answered 404 here.
 */
export function howToRunTheWaiter(api: string): string {
  return (
    `Save what this reply carries as hold-the-handle.mjs, then run it and leave it running:\n` +
    `  node hold-the-handle.mjs --api ${api} --agent <your handle here> --session <your session record here>\n` +
    'It says every few seconds that you are the one answering as that agent, so a message to you comes to you and ' +
    'Mole Office starts no run beside you. It prints any message that arrives and then stops, because stopping is ' +
    'what wakes a Claude Code or Codex session; start it again after you have answered. File your session record ' +
    'in THIS office first (POST /api/records, kind session), because a hold names a session record and this office ' +
    'has to be able to open it.'
  )
}

/**
 * HOW TO RUN THE WAITER, WITH THIS OFFICE'S OWN ADDRESS IN IT, OR WHY THERE IS NO LINE.
 *
 * The address is the one this server was told to publish for other machines, and null where none
 * was — because a loopback address printed to another machine is an instruction that cannot work,
 * and saying so is better than serving one. Its own function so that both answers are held by a
 * test on a world built for each, whatever the checkout the test runs in has been told.
 */
export function whatTheWaiterSaysAboutTheAddress(reachable: { api: string } | null): {
  howToRunIt: string | null
  whyThereIsNoAddress: string | null
} {
  return {
    howToRunIt: reachable === null ? null : howToRunTheWaiter(reachable.api),
    whyThereIsNoAddress:
      reachable === null
        ? 'This office has not been told an address other machines can reach it at, so nothing here can print ' +
          'one: a loopback address handed to another machine is an instruction that cannot work. GET /api/access ' +
          'says how this installation is exposed and what would open it.'
        : null,
  }
}
