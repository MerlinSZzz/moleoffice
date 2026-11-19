// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TWO VOCABULARIES OF AN AGENT'S LIFE, AND NOTHING IN THIS FILE JOINS THEM.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE, AND WHY IT IS A FILE RATHER THAN A PARAGRAPH
 * ---------------------------------------------------------------------------------------
 *
 * The owner's brief, section 14: *"Presence and Work State are orthogonal."* Round ten's addendum
 * two, section 3, says the same thing the other way round: *"Do NOT put everything into one giant
 * Agent status enum."*
 *
 * Two lists live here. **Presence** answers *can this agent be reached right now*. **Work state**
 * answers *why does this agent exist right now*. `inactive` joined presence on 11 September 2026,
 * so there are now four presence words and five work-state words; section 2.5 of
 * `design/round-eleven/design/agent-lifecycle.md` walks the fifteen pairs of the first three and
 * finds every one of them possible. A builder who marks one impossible will have built a join
 * between the two
 * dimensions, and the pair they will want to call impossible — **Offline · Working** — is the most
 * important pair there is: it is what a provider dying mid-work looks like, and calling it
 * *Finished* would report every API death as a success.
 *
 * **No function in this file takes a word of one list and returns a word of the other.**
 * `tests/two-dimensions-that-never-join.test.ts` asserts both halves: no value is in both lists,
 * and no exported function maps one vocabulary onto the other. The mutation it is written against
 * is the obvious one — make the work state a function of presence, so that every unattached agent
 * reads `Finished`.
 *
 * ---------------------------------------------------------------------------------------
 * THE SENTENCE IS THE DESIGN AND THE WORD IS A HANDLE FOR IT
 * ---------------------------------------------------------------------------------------
 *
 * Every entry below carries `word` — what a person sees — and `sentence` — what the product says
 * when they ask what it means. The sentences are written for somebody who has never read a design
 * document, which is USER.md's seventh invariant, and two of them carry a rule the word alone does
 * not: *Reporting* says nothing will chase it, because the addendum's section 3 says it *"must NOT
 * be watchdog-slapped merely because time passes"*; and *Standing by* says days like this are
 * normal, because that section describes an agent kept available that *"may stay attached for hours
 * or days"* and adds *"This is not a stuck worker."*
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * It is not a store. Presence is a reading taken at the moment it is asked for
 * (`src/server/lib/presence.ts`) and work state is the newest row of `agent_work_transitions`
 * (`src/server/lib/lifecycle.ts`). Neither is a column and neither is cached. A `presence`,
 * `heartbeat` or `last_seen` column, or a work-state column anywhere, is the second copy this
 * whole arrangement exists to make impossible.
 *
 * It is also not `session.data.state`, which holds `running`, `idle`, `finished`, `crashed`,
 * `orphaned`, `unknown` on 103 records today. That word describes A PROCESS. These describe A JOB.
 * They share the spelling `finished` and mean different things: `session.state = 'finished'` means
 * the process ended, and work state `Finished` means the responsibility ended. Nothing anywhere may
 * read one as the other.
 */

import { THE_RUN_SAID_SO, THE_SWEEPS_CLOSE } from '../config/finished.mjs'

// ============================================================================ presence

/** The four presence words, as they are stored. */
export const PRESENCE_WORDS = ['online', 'stale', 'offline', 'inactive'] as const

/** Whether an agent can be reached right now. Never stored; always read. */
export type Presence = (typeof PRESENCE_WORDS)[number]

/**
 * HOW LONG SILENCE IS ALLOWED TO LAST BEFORE IT IS CALLED SILENCE. FIFTEEN MINUTES.
 *
 * **Declared once, in minutes, here, and drawn into the sentences below rather than typed into
 * them.** A number a person reads on a screen and a number the code compares against are the same
 * fact, and this repository's recurring defect is that fact worked out in two places.
 *
 * **NOBODY HAS MEASURED WHAT IT SHOULD BE.** The closest measurement anybody has taken is the gap
 * between consecutive requests from an agent-typed caller over the whole life of `api_calls`: 77
 * rows, 76 gaps, median 7 seconds, p90 6.8 minutes, p95 37 minutes. It does not settle the question,
 * because those rows span several unrelated working periods and no attachment exists to bound them,
 * so most of the long gaps are the space between two sessions rather than a silence inside one. The
 * measurement that would settle it — the gap distribution WITHIN one attachment — cannot be taken
 * until attachments exist. `design/round-eleven/design/agent-lifecycle.md` section 4 names the two
 * measurements that would, in order of cost.
 *
 * Fifteen rather than five, because five would have called an agent stale inside more than a tenth
 * of its ordinary gaps. Fifteen rather than sixty, because the number's job is to make *reachable
 * now* different from *gone* inside the time the owner is willing to wait before doing something
 * themselves — and how long that is has not been measured and is the owner's number.
 */
export const STALE_AFTER_MINUTES = 15

/** The sentence that says the number is a placeholder, wherever the number is drawn. */
export const STALE_THRESHOLD_IS_UNMEASURED =
  `${STALE_AFTER_MINUTES} minutes, not yet measured. The first twenty wakes will measure it.`

/** One presence word, what a person sees, and what the product tells them it means. */
export interface PresenceWord {
  value: Presence
  /** What a person reads on the screen. */
  word: string
  /** What the product says when they ask what it means. One idea per sentence. */
  sentence: string
}

/**
 * The four presence words with their sentences.
 *
 * A `Record` keyed by the value, not an array, so a word added to `PRESENCE_WORDS` with no sentence
 * does not compile. A sentence is not decoration here: it is the only thing that says what the word
 * means to somebody who has not read the design.
 */
export const PRESENCE = {
  online: {
    value: 'online',
    word: 'Online',
    sentence: `Something arrived from this agent in the last ${STALE_AFTER_MINUTES} minutes.`,
  },
  stale: {
    value: 'stale',
    word: 'Stale',
    sentence: `An attachment is open, but nothing has arrived for over ${STALE_AFTER_MINUTES} minutes. It may be thinking or gone.`,
  },
  offline: {
    value: 'offline',
    word: 'Offline',
    sentence: 'No attachment is open. A message will wait, and Mole Office can ask for the agent to be woken.',
  },
  /**
   * THE THIRD PRESENCE WORD UNDER GREY: an agent that
   * is registered but has no run recorded — no session record, no process row — is `inactive`. It is
   * shown under the same grey the offline word is shown under; only the words differ, so nothing
   * that reads the colour moves. The sentence names both the state and what was measured, so a
   * person can check the word against the evidence.
   */
  inactive: {
    value: 'inactive',
    word: 'Inactive',
    sentence:
      'Registered, and no run recorded. No process of this agent is running, no run of it has written down any ' +
      'output, and no connection is open for it.',
  },
} as const satisfies Readonly<Record<Presence, PresenceWord>>

/** Whether a stored string is one of the four presence words. Anything else is a fault. */
export function isPresence(value: unknown): value is Presence {
  return typeof value === 'string' && (PRESENCE_WORDS as readonly string[]).includes(value)
}

// ============================================================================ work state

/**
 * The five work-state words, as they are stored.
 *
 * `standing-by` is stored hyphenated and read as *Standing by*. The stored form is one token so
 * that nothing has to quote it in SQL or split it on a space; the read form is two words because
 * that is what a person says out loud. Both are declared below, once each.
 */
export const WORK_STATES = ['working', 'reporting', 'standing-by', 'blocked', 'finished'] as const

/** Why an agent exists right now. Never stored as a current value; always the newest transition. */
export type WorkState = (typeof WORK_STATES)[number]

/** One work-state word, what a person sees, and what the product tells them it means. */
export interface WorkStateWord {
  value: WorkState
  /** What a person reads on the screen. */
  word: string
  /** What the product says when they ask what it means. */
  sentence: string
}

/**
 * The five work-state words with their sentences.
 *
 * Keyed by the value for the same reason `PRESENCE` is: a word with no sentence does not compile.
 */
export const WORK_STATE: Readonly<Record<WorkState, WorkStateWord>> = {
  working: {
    value: 'working',
    word: 'Working',
    sentence: 'Doing the work now. Mole Office wakes only a working agent by itself.',
  },
  reporting: {
    value: 'reporting',
    word: 'Reporting',
    sentence: 'Finished a stage and wrote something for you. Waiting for you, not stuck; nothing will chase it.',
  },
  'standing-by': {
    value: 'standing-by',
    word: 'Standing by',
    sentence: 'Kept available on purpose; no progress is expected, and quiet days are normal.',
  },
  blocked: {
    value: 'blocked',
    word: 'Blocked',
    sentence: 'This agent cannot go on safely until something changes. What it is waiting for is named beside this.',
  },
  finished: {
    value: 'finished',
    word: 'Finished',
    sentence: 'This agent says its responsibility has ended. New work or a new message would reopen it.',
  },
}

/** Whether a stored string is one of the five work-state words. Anything else is a fault. */
export function isWorkState(value: unknown): value is WorkState {
  return typeof value === 'string' && (WORK_STATES as readonly string[]).includes(value)
}

/**
 * WHAT AN AGENT NOBODY HAS SPOKEN FOR READS AS, AND IT IS NOT ONE OF THE FIVE.
 *
 * An agent with no transition at all has no work state. Opening an attachment does not give it one:
 * the brief's section 16 says an agent *"becomes Working when execution is actually accepted"*, and
 * a process starting is not a decision about the work.
 *
 * **The tempting default is Standing by, and it is not harmless.** Standing by is a claim that
 * availability is INTENTIONAL, so defaulting to it puts a sentence on the screen that nobody said.
 * That is USER.md's fifth invariant, and this is the honest answer it asks for instead.
 *
 * It is also the state every agent is in on the day this ships: the store starts empty and nothing
 * backfills it.
 */
export const NOBODY_HAS_SAID = 'No work state recorded for this agent.'

// ============================================================================ the two are not one

/**
 * WHY THERE IS NO FUNCTION BELOW THIS LINE.
 *
 * The obvious helper — given a presence, what work state should be assumed — is the defect this
 * file exists to prevent, and writing it would be silent: it type-checks, it reads sensibly, and it
 * turns every dead runtime into a finished job. Section 2.5 of the design lists all fifteen pairs
 * and every one of them occurs, so there is nothing for such a function to compute.
 *
 * The two dimensions meet in exactly one place in this product, and it is a DRAWING: a row shows
 * one presence glyph and one work-state word side by side. Nothing derives either from the other,
 * and `tests/two-dimensions-that-never-join.test.ts` fails the day something does.
 */

// ============================================================================ how a period ended

/**
 * HOW AN ATTACHMENT ENDED. FIVE WORDS, AND THEY ARE NOT DECORATION.
 *
 * An attachment is one period in which one provider session took part as one durable agent. Ending
 * it is a fact about Mole Office's own record and **it touches no process** — `src/server/lib/attachments.ts`
 * says that in full, and the brief's section 14 says it too: closing an attachment is not
 * killing the provider runtime.
 *
 * The five words exist because *a run that ended* and *a run we stopped hearing from* are different
 * facts, and only the second hides a failure. A close that could not say which of the two happened
 * cannot answer the case this campaign was written after: a parent that went on believing a child
 * workflow was alive after it had died.
 *
 * `person-said` is the only one of them a person causes, and even it stops nothing on the
 * machine. Stopping a runtime is a separate act, on a separate surface, behind a typed phrase, and
 * it writes a release on `session_resources` rather than any of these.
 *
 * `starter-said` IS THE SIXTH, added on 1 October 2026 for problem `XtHehJ90C-hd`. A run whose work
 * was taken and adopted by the agent that started it stayed open for ever when the run never closed
 * itself and recorded no parent attachment: `parent-said` needs a recorded parent, and the other
 * four words would each have named somebody who did not say it. The starter is the agent or person
 * recorded as having started the agent the run served, and only the starter may use this word.
 */
export const CLOSED_HOW = [THE_RUN_SAID_SO, 'provider-event', 'parent-said', THE_SWEEPS_CLOSE, 'person-said', 'starter-said'] as const

/** Which of the six ended an attachment. */
export type ClosedHow = (typeof CLOSED_HOW)[number]

/** One close word, and what the product says it means. */
export interface ClosedHowWord {
  value: ClosedHow
  sentence: string
}

/** The six close words with their sentences. A word with no sentence does not compile. */
export const CLOSED_BECAUSE: Readonly<Record<ClosedHow, ClosedHowWord>> = {
  'agent-said': {
    value: 'agent-said',
    sentence: 'The agent itself said this period of participation was over.',
  },
  'provider-event': {
    value: 'provider-event',
    sentence: 'The provider said the run ended — a session-end hook, or a child run that reported its own stop.',
  },
  'parent-said': {
    value: 'parent-said',
    sentence: 'The attachment that started this one said it was over. Only a child attachment can close this way.',
  },
  'went-stale': {
    value: 'went-stale',
    sentence:
      'Nobody said it ended. Mole Office stopped hearing from it and closed it after the stale threshold, which is a ' +
      'weaker fact than any of the others and is recorded as its own word for that reason.',
  },
  'person-said': {
    value: 'person-said',
    sentence: 'A person closed it. Nothing on the machine was touched, and no process was stopped.',
  },
  'starter-said': {
    value: 'starter-said',
    sentence:
      'The agent or person recorded as having started the agent this run served said this period was over. ' +
      'The run itself did not say so, and no process was stopped.',
  },
}

/** Whether a stored string is one of the six close words. Anything else is a fault. */
export function isClosedHow(value: unknown): value is ClosedHow {
  return typeof value === 'string' && (CLOSED_HOW as readonly string[]).includes(value)
}

/**
 * WHAT CLOSING AN ATTACHMENT DID NOT DO, in the sentence a person reads on the reply.
 *
 * It is here rather than in the route because it is a promise about the product, and the same
 * sentence is what a person reads when they were about to press the other thing.
 */
export const CLOSING_TOUCHES_NO_PROCESS =
  'The attachment is closed and the provider process was not touched. Stopping a process is a separate act, on ' +
  'the “Running on this machine” list, and it asks you to type an exact phrase first.'
