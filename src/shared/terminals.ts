// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE OFFICE'S TERMINALS LOOK LIKE ON THE WIRE, read by the server and the pages alike. Wave 13u.
 *
 * GET /api/terminals answers a holder and a list. The server builds both (src/server/lib/terminals.ts,
 * src/server/api/terminals.ts) and the terminal pages draw them (src/web/lib/terminals.ts). The shapes
 * are written here once, so the two sides cannot come to disagree about a field.
 */

import { parseLocalStamp } from './time.ts'

/** Who a terminal names: the person who opened it, or an agent. */
export interface TerminalParty {
  kind: 'person' | 'agent'
  id: string
}

/** One terminal, as the terminal holder describes it. */
export interface TerminalReading {
  id: string
  /** Who opened it. */
  who: TerminalParty | null
  /** The agent working in it, or null when none is (every terminal until wave 13u's round 3). */
  agent: TerminalParty | null
  /** The project it was opened in. */
  project: string
  command: string
  args: string[]
  folder: string
  /** The names of the variables it was given; never their values. */
  envNames: string[]
  state: 'running' | 'ended'
  pid: number
  cols: number
  rows: number
  /** When it opened, in the office's local stamp. */
  openedAt: string
  endedAt: string | null
  exit: { code: number; signal: number | null } | null
  /** Whether what the person types here is kept as their notes (wave 13u, round 4). On when a terminal opens. */
  keeping: boolean
  /**
   * THE LINE A SECRETARY PREPARED when it opened this terminal for the person, whole, and the secretary that prepared it.
   * The holder typed it in with no Enter, and the person runs it with their own Enter. Null when none was; absent from
   * a holder older than this office.
   */
  prepared?: { line: string; by: TerminalParty } | null
  /** The name, the group and the tags the person gave it: null and an empty list for none, absent from an older holder. */
  name?: string | null
  group?: string | null
  tags?: string[]
}

/** The most terminals one reading of several carries (GET /api/terminals/stream). */
export const THE_MOST_TERMINALS_IN_ONE_READING = 16

/**
 * WHERE THE TERMINAL HOLDER STANDS, in one of four states.
 *
 * - `running`: a holder answers for this office and speaks the server's words.
 * - `off`: none answers, and MOLE_OFFICE_TERMINAL_HOLDER is off, so none was meant to be started.
 * - `not running`: none answers. `says` is why it could not be reached, and `lastWord` is the last line
 *   of the holder's log, its own last sentence, or null when there is no log; `logUnread` is why a log
 *   that is there could not be read, or null.
 * - `unusable`: something is there but cannot be used. `noAnswerWithinMs` is the time it was given when it
 *   did not answer in that time; it is null when it answered but speaks other words or holds another database.
 *   `anotherCopy` names a replaceable holder and the restart press may be offered for it.
 */
export type HolderState =
  | { state: 'running'; pid: number; startedAt: string | null }
  | { state: 'off'; says: string }
  | { state: 'not running'; says: string; lastWord: string | null; logUnread: string | null }
  | {
      state: 'unusable'; says: string; noAnswerWithinMs: number | null
      /** Present only when the holder's only fault is that it is another copy's from this root or names none: the copy
       *  in words, and the pid and start time a confirming press sends back. The restart press may replace it. */
      anotherCopy?: { copy: string; pid: number; startedAt: string | null }
    }

/**
 * ONE TERMINAL AS GET /api/terminals LISTS IT: the holder's reading, and whether it is the office's view of an agent's
 * tmux pane (wave 13u, round 11). In a view, `agent` names the agent whose pane it shows, and that agent does not work
 * in it. The server works `paneView` out in one place (src/server/lib/agent-pane.ts); the holder does not record it.
 */
export interface ListedTerminal extends TerminalReading {
  /** The pane it shows, when it is a pane view; null for every other terminal. */
  paneView: { pane: string; session: string } | null
}

/** What GET /api/terminals answers. `terminals` is null, never an empty list, when no holder runs. */
export interface TheTerminalsNow {
  holder: HolderState
  terminals: ListedTerminal[] | null
}

/*
 * RESTARTING THE TERMINAL HOLDER FROM SETTINGS (wave 13u round 23; POST
 * /api/terminals/holder/restart). The page shows the holder and its terminals from GET /api/terminals, and the
 * confirming press sends back what it showed. A restart ends every terminal the holder holds.
 */

/** What the confirming press was shown: the holder by its pid and start time, and the id of every terminal listed. */
export interface TheHolderAsShown {
  pid: number
  startedAt: string | null
  terminals: string[]
}

/** What a restart that came back answers. Every other outcome is a coded refusal that says where the holder was left. */
export interface TheHolderRestarted {
  /** The holder that was stopped. */
  stopped: { pid: number; startedAt: string | null }
  /** The holder that answers now, read after the start, which also opens the agents in terminals again. */
  holder: HolderState
  /** How many of the terminals shown were still running when the holder was asked to stop. */
  ended: number
  /** The last line of the holder's log after the old holder stopped, in its own words; null when there was none. */
  itsLastWord: string | null
}

/*
 * WHAT THE TERMINAL PAGES WORK OUT FROM THE LIST, here rather than in a page so a test can ask without a
 * browser: which terminals Terminal management's filters let through, and which are one agent's.
 */

/** The command as it was started, with its arguments, as every terminal page shows it. */
export function theCommandLine(terminal: TerminalReading): string {
  return [terminal.command, ...terminal.args].join(' ')
}

/** The filters a person can set. An empty string means any. */
export interface TerminalFilters {
  words: string
  /** An agent's id, `none` for terminals no agent works in, or empty for any. */
  agent: string
  project: string
  state: '' | 'running' | 'ended'
  time: '' | 'hour' | 'today' | 'week'
}

export const NO_FILTERS: TerminalFilters = { words: '', agent: '', project: '', state: '', time: '' }

/** The moment from which a time filter counts. */
function since(time: TerminalFilters['time'], now: Date): number | null {
  if (time === '') return null
  if (time === 'hour') return now.getTime() - 60 * 60 * 1000
  if (time === 'week') return now.getTime() - 7 * 24 * 60 * 60 * 1000
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  return midnight.getTime()
}

/**
 * THE TERMINALS THE FILTERS LET THROUGH, newest first. Exported so a test can ask it without a page. A
 * terminal whose opening time cannot be read is let through a time filter rather than hidden on a guess.
 */
export function theTerminalsShown<T extends TerminalReading>(all: readonly T[], filters: TerminalFilters, now: Date): T[] {
  const words = filters.words.trim().toLowerCase()
  const from = since(filters.time, now)
  return all
    .filter((one) => words === '' || theCommandLine(one).toLowerCase().includes(words) || one.folder.toLowerCase().includes(words))
    .filter((one) => filters.agent === '' || (filters.agent === 'none' ? one.agent === null : one.agent?.id === filters.agent))
    .filter((one) => filters.project === '' || one.project === filters.project)
    .filter((one) => filters.state === '' || one.state === filters.state)
    .filter((one) => {
      if (from === null) return true
      const opened = parseLocalStamp(one.openedAt)
      return opened === null || opened >= from
    })
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
}

/**
 * The agent's own terminals, the office's views of its tmux pane, and the terminals it opened, from every terminal the
 * holder holds. EACH TERMINAL IS LISTED ONCE (the review of round 2, point 5): a terminal it works in is its own,
 * even when it opened it too, and `opened` holds only the terminals it opened and does not work in. A VIEW OF ITS PANE
 * NAMES IT AS `agent` AND IS NOT ITS OWN (round 11): the agent works in its pane, not in the office's view of it.
 */
export function theAgentsTerminals(all: readonly ListedTerminal[], agentId: string): { own: ListedTerminal[]; views: ListedTerminal[]; opened: ListedTerminal[] } {
  const named = (one: ListedTerminal): boolean => one.agent?.kind === 'agent' && one.agent.id === agentId
  const worksIn = (one: ListedTerminal): boolean => named(one) && one.paneView === null
  return {
    own: all.filter(worksIn),
    views: all.filter((one) => named(one) && one.paneView !== null),
    opened: all.filter((one) => one.who?.kind === 'agent' && one.who.id === agentId && !named(one)),
  }
}


/*
 * THE PERSON'S TYPING AS THEIR OWN WORDS, wave 13u, round 3. A line the person typed into the
 * office's own terminal may be kept as a note of theirs, which then counts as their own words. A password typed where the
 * screen shows nothing is never kept. A line that looks like a key is offered and kept like any other, with a warning
 * that blocks nothing. That is round 12 below, and answer LBC7EuG5aIqI under one of the owner's decisions.
 */

/** The last line the person typed, as the holder offers it: only a line the screen showed is offered. */
export interface TheLastLine {
  line: { text: string; at: string } | null
  /** Why no line is offered: nothing typed yet, a line the screen did not show (a password prompt), or one longer than
   * THE_LONGEST_LINE_KEPT. */
  why: 'none' | 'not-shown' | 'too-long' | null
  /** True when the offered line looks like a key; the page warns, and the line can still be kept. */
  looksLikeAKey: boolean
}

/**
 * The note field that says where a kept line was typed (src/shared/kinds.ts). The note counts as their own words because they
 * created it, by the `record` path of whoseRecordsAreThese in src/server/lib/the-persons-own-words.ts, which needs no
 * change for it; the field only says where the words were said.
 */
export const TYPED_IN_TERMINAL = 'typed_in_terminal'

/**
 * KEEPING EVERY LINE WITH NO PRESS, wave 13u, round 4, by decision YLv8grhgilBV, which rests on one of the
 * owner's decisions.
 * While a terminal's keeping is on, each line the person ends with Enter goes into one note of theirs for that terminal,
 * one line per line of its `body`. A line the screen did not show, one edited with an arrow or another control key and
 * one longer than THE_LONGEST_LINE_KEPT is never stored; the note only counts it, by why. These are the note's fields
 * for that (src/shared/kinds.ts). A line typed for somebody else (typeALine in src/holder/index.mjs, wave 13s round 83)
 * is not the person's words, and is counted the same way.
 *
 * A LINE THAT LOOKS LIKE A KEY IS KEPT, at round 12. Until 7 October
 * 2026 such a line was left out and counted in `left_out_secret`. It is now kept like any other, and the terminal view
 * says, in a line that blocks nothing, how many kept lines look like a key. A note written before then may still hold
 * that count, so it is read as KEY_LIKE_LEFT_OUT_BEFORE and shown, and nothing writes it any more.
 */
export const KEPT_FROM_TERMINAL = 'kept_from_terminal'
export const TYPED_TO_AGENT = 'typed_to_agent'
export const LEFT_OUT = {
  notShown: 'left_out_not_shown',
  edited: 'left_out_edited',
  tooLong: 'left_out_too_long',
  typedByAnother: 'left_out_typed_by_another',
} as const
export type WhyLeftOut = keyof typeof LEFT_OUT
export const KEY_LIKE_LEFT_OUT_BEFORE = 'left_out_secret'

/** A note's left-out counts, by why, from its stored fields; `before` is KEY_LIKE_LEFT_OUT_BEFORE's count. */
export function theLeftOutCountsOf(data: Record<string, unknown>): Record<WhyLeftOut, number> & { before: number } {
  const one = (key: string): number => (typeof data[key] === 'number' ? (data[key] as number) : 0)
  return {
    notShown: one(LEFT_OUT.notShown),
    edited: one(LEFT_OUT.edited),
    tooLong: one(LEFT_OUT.tooLong),
    typedByAnother: one(LEFT_OUT.typedByAnother),
    before: one(KEY_LIKE_LEFT_OUT_BEFORE),
  }
}

/** What a terminal's keeping is now: whether it is on, and the note the lines go in once one has been kept. `keyLike`
 * is how many of the note's lines look like a key now, worked out from its body at each reading. */
export interface TheKeeping {
  on: boolean
  note: { id: string; title: string; lines: number; keyLike: number; leftOut: ReturnType<typeof theLeftOutCountsOf> } | null
}

/** The longest line that is kept; a longer one is not a line somebody says, and is not kept. */
export const THE_LONGEST_LINE_KEPT = 2000

/*
 * THE SHAPES A SECRET TAKES, and the marking of each, are src/config/secret-shapes.mjs's: plain JavaScript, because the
 * session hook stores a screened command line and runs on Node 18, which cannot load this file. There is no second list.
 */
export {
  SECRET_SHAPE_NAMES,
  theMarkerFor,
  whatLooksLikeASecret,
  whyThisLooksLikeASecret,
  withSecretsMarked,
} from '../config/secret-shapes.mjs'
export type { ASecretSeen, ScreenedText, SecretShape } from '../config/secret-shapes.mjs'
/**
 * THE WORD A PRESENCE READING GIVES AN AGENT AT WORK IN ONE OF THE OFFICE'S TERMINALS (wave 13u, round 3): the dot is
 * grey, because a terminal alone cannot take a message, and the word says where the agent is at work. Read by
 * src/server/lib/presence.ts, and here so a page can draw it in its own language.
 */
export const IN_A_TERMINAL_WORD = 'In a terminal'


/**
 * THE WAY BACK TO AN AGENT'S NEWEST RUN, as GET /api/terminals/agents/:agent/way-back answers it (wave 13u, round 10).
 * The command is src/config/the-way-back.mjs's. `press` says what the press would do now:
 *
 *   ready    the run's program is not running, and the press opens it in the office's terminal;
 *   running  its program still runs, so the press would start a second copy of the same conversation, and is refused;
 *   sandbox  it ran in a sandbox, and opening a terminal inside one waits for the sandbox tool, so the command is shown;
 *   none     there is no command, and `because` says why.
 */
export interface AWayBack {
  agent: { id: string; handle: string }
  /** The newest session record serving the agent, or null when it has none. */
  run: { id: string; title: string; createdAt: string } | null
  /** A host way's `kept` are the flags and values its command keeps, and `dropped` the names of the rest, never their
   * values. Both went through the secret-shape check (src/config/the-way-back.mjs). */
  way:
    | { way: 'host'; runtime: string; program: string; args: string[]; command: string; folder: string; sessionId: string; kept: string[]; dropped: string[] }
    | { way: 'sandbox'; runtime: string; command: string; folder: string; sessionId: string }
    | { way: 'none'; runtime: string | null; because: string }
  press: 'ready' | 'running' | 'sandbox' | 'none'
  /** Why the press is what it is, in English, for Developer mode: which process was read, and what it showed. */
  says: string
}

/**
 * AN AGENT'S TMUX PANE, as GET /api/terminals/agents/:agent/pane answers it: wave 13u, round 10, way B, under a
 * decision. The pane is found from the agent's newest run: its process, that process's
 * terminal, and the tmux pane on that terminal. `state` is one of:
 *
 *   shown              the screen was found; an office-held screen has `view` and a null `pane`; a tmux screen names its `pane` and any open `view`;
 *   no-run             the office has no record of a run of this agent;
 *   sandbox            its newest run works in a sandbox, which has no pane here (its steps are way C's);
 *   not-running        no process of its newest run is running;
 *   not-in-a-terminal  its process has no terminal;
 *   not-in-tmux        its process's terminal is not a tmux pane, or no tmux server runs;
 *   no-tmux            tmux is not on this server's PATH.
 */
export interface AnAgentsPane {
  agent: { id: string; handle: string }
  run: { id: string } | null
  state: 'shown' | 'no-run' | 'sandbox' | 'not-running' | 'not-in-a-terminal' | 'not-in-tmux' | 'no-tmux'
  /** The pane: its id (%7), where it is (session:window.pane), its session, its terminal and its size. */
  pane: { id: string; target: string; session: string; tty: string; cols: number; rows: number } | null
  /** The run's own office-held terminal, or an open tmux view; null when neither is held. */
  view: TerminalReading | null
  /** How the pane was found, or why it was not, in English, for Developer mode. */
  says: string
}

/**
 * ONE STEP OF A RUN, read from its conversation (wave 13u, round 10, way C). Its thinking is never a step.
 *
 *   read   it read a file (`what` is the file);
 *   ran    it ran a command (`what` is the command, on one line);
 *   wrote  it wrote or edited a file (`what` is the file);
 *   said   it wrote words to whoever reads its answer (`what` is the words);
 *   used   it used another tool (`tool` names it, and `what` is what that tool was asked, when it says).
 */
export interface ARunsStep {
  /** When the conversation stamped the step, in local time; null when it did not. */
  at: string | null
  kind: 'read' | 'ran' | 'wrote' | 'said' | 'used'
  /** The tool's own name; empty for `said`. */
  tool: string
  what: string
}

/**
 * A SANDBOXED RUN'S STEPS, as GET /api/terminals/agents/:agent/steps answers it, built in wave 13u, round 10, way C,
 * on a decision. `state` is one of:
 *
 *   shown             its newest run works in a sandbox and is running; `steps` are what it did since `after`;
 *   no-run            the office has no record of a run of this agent;
 *   not-in-a-sandbox  its newest run does not work in a sandbox (its pane is way B's);
 *   ended             its newest run works in a sandbox and has ended;
 *   no-log            its newest run is running, and its conversation file was not found or could not be read.
 */
export interface AnAgentsSteps {
  agent: { id: string; handle: string }
  run: { id: string } | null
  state: 'shown' | 'no-run' | 'not-in-a-sandbox' | 'ended' | 'no-log'
  steps: ARunsStep[]
  /** The offset to ask with next time, or null when nothing was read. */
  next: number | null
  /** True when steps before the first one shown were left out, because there were more than one answer holds. */
  earlier: boolean
  /** How the conversation was found and read, or why it was not, in English, for Developer mode. */
  says: string
}

/**
 * WHERE THE TYPING INTO A TERMINAL CAME FROM, as the chat records where a message was written, at point (d) of a
 * decision and wave 13u round 14. This computer with the person's account is the safest,
 * and any other trusted place is the next. So the person types from two levels. An agent types only in the two
 * ways the last two levels name.
 *
 *   - `this computer`: the computer Mole Office runs on, with the person's account. The safest.
 *   - `another computer`: one of the person's other computers, with their own key, over an encrypted door. The next.
 *   - `an agent's ask`: not the person. The office typed an input from the owner's list into an agent's own terminal,
 *     because that agent asked for it with its own run's key (wave 13u round 21;
 *     src/shared/quick-inputs.ts says when). Such a run has no machine or program, its account is the agent's, proved
 *     by "the run's key", and `agentHandle` names the agent.
 *   - `a secretary`: not the person. A secretary typed one whole line through the typing door, under the person's grant
 *     where this office's list lets the grant press it, or with the owner's written words for that line (wave 13s round
 *     83). Such a run has no machine or program, its account is the secretary's, proved by "the secretary's own key" or
 *     by "the secretary's name, with no key", and `agentHandle` names the secretary.
 */
export const TYPED_FROM_LEVELS = ['this computer', 'another computer', "an agent's ask", 'a secretary'] as const
export type TypedFromLevel = (typeof TYPED_FROM_LEVELS)[number]

/**
 * HOW THE TYPIST'S ACCOUNT WAS PROVED. `the person's key` is the key itself; `a device's key` is the key of a device the
 * person paired, whose name is `device`; `no key, from this computer` is the person's name sent by this computer's own
 * program, which the one-version window counts on this computer only. `the run's key` is an agent's own run key, on an
 * input from the owner's list that the agent asked for. `the secretary's own key` and `the secretary's name, with no key`
 * are how a secretary that typed a line was proved.
 */
export type TypedFromProof =
  | "the person's key"
  | "a device's key"
  | 'no key, from this computer'
  | "the run's key"
  | "the secretary's own key"
  | "the secretary's name, with no key"

/**
 * ONE RUN OF TYPING FROM ONE SOURCE: every input from the same level, machine, program and account, one after another,
 * counted, with the first and the last time. A new source starts a new run. Every input is counted in exactly one run.
 */
export interface TypedFromRun {
  level: TypedFromLevel
  /** Where it was typed, as a message stores `writtenFrom`: the machine's name, the person's name for the address, the address itself, or null. */
  machine: string | null
  /** How `machine` was arrived at, in the words `writtenFrom` uses. */
  how: string
  /** The address a name the person gave stands for, when `how` says it is that name. */
  address?: string
  /** The browser the typist said it types in, or null because it said nothing. */
  program: string | null
  /** The account that typed: the person's or the agent's id, how it was proved, and the device whose key proved it, or null. */
  account: { id: string; proof: TypedFromProof; device: string | null }
  /**
   * For `an agent's ask` and `a secretary` only. For an ask, the asking agent's handle as the registry held it then, or
   * null when it had none. For a secretary, the handle it typed under.
   */
  agentHandle?: string | null
  firstAt: string
  lastAt: string
  inputs: number
}

/**
 * WHAT ONE TERMINAL'S TYPING IS KNOWN TO HAVE COME FROM. The office keeps it in memory: `since` is when this server
 * started, and typing before then was not recorded. `forgotten` counts the oldest runs let go to keep `runs` short.
 */
export interface TypedFrom {
  since: string
  runs: TypedFromRun[]
  forgotten: number
}
