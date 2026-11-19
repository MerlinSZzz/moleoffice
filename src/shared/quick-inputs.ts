// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * QUICK INPUTS: AN INPUT FROM THE OWNER'S LIST, TYPED INTO AN AGENT'S TERMINAL WHEN THE AGENT ASKS FOR IT.
 * Wave 13u, round 21.
 *
 * -----------------------------------------------------------------------------------------
 * WHAT THE OFFICE TYPES, AND WHEN
 * -----------------------------------------------------------------------------------------
 *
 * The office types an input into an agent's terminal only when all three of these hold:
 *   1. the agent asked for it, with its own run's key, for the office terminal that run works in;
 *   2. the input is on the owner's list, exactly as it is written there;
 *   3. nothing has been typed for that agent in the last ten minutes.
 * When one of them does not hold, nothing is typed, the reply says which one, and the ask is kept, so the agent and
 * the person both see why. The order of the outcomes below is the order the three are asked in.
 *
 * THE OWNER'S "YES" IN THE CHAT IS NEVER TYPED. The owner did not take option 3, which would have typed the chat's
 * "yes" into a terminal: the office cannot see what a tool's question on the screen is. So the list takes only
 * commands that begin with "/", such as /context and /compact, and a word that answers a question on the screen
 * ("y", "yes", a number) cannot be put on it.
 *
 * -----------------------------------------------------------------------------------------
 * TEN MINUTES, FOR EACH AGENT
 * -----------------------------------------------------------------------------------------
 *
 * WHY TEN MINUTES: it is about as fast as the person decides on an ask, and it is seldom enough if a fault makes an
 * agent ask again and again. The
 * ten minutes are counted for each agent, from the last input typed for that agent, or that may have been typed when the
 * office cannot tell; an ask that was refused does not start them. For each agent, because the timer is there to bound
 * an agent that asks again and again by mistake: one agent's mistake then reaches only its own terminal, and it does not
 * keep another agent from the input it needs.
 */

/** At most one quick input is typed for one agent in this many milliseconds: ten minutes. */
export const ONE_QUICK_INPUT_EVERY_MS = 10 * 60 * 1000

/** The longest input the list may hold, in characters. */
export const THE_LONGEST_QUICK_INPUT = 200

/** The most inputs the list may hold. */
export const THE_MOST_QUICK_INPUTS = 20

/** The owner's list: none set, or the inputs the office may type, in the order the owner gave them. */
export type QuickInputListReading = { state: 'none' } | { state: 'set'; inputs: string[] }

/**
 * The sentence for the honest absence: there is no list now, so nothing is typed. It does not say that nobody ever set
 * one, because a list the owner cleared reads the same; `setBy` says who cleared it.
 */
export function theNoQuickInputListSentence(): string {
  return 'There is no list of quick inputs now, so the office types nothing into an agent\'s terminal when the agent asks.'
}

/** A character a terminal reads as a key rather than as text: a control character, or DEL. */
const A_CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u

/** The most characters of one input the refusal sentence shows. */
const THE_MOST_CHARACTERS_SHOWN_OF_AN_INPUT = 40

/**
 * WHAT A PERSON CAN SEE OF ONE INPUT, for a refusal that says which input was wrong: the part before the first
 * character a terminal reads as a key, at most 40 characters. An input that holds a key is never drawn with that key
 * in it, because nobody can see it there.
 */
export function theVisiblePartOfAQuickInput(input: string): string {
  const beforeAKey = input.split(A_CONTROL_CHARACTER)[0] ?? ''
  return beforeAKey.slice(0, THE_MOST_CHARACTERS_SHOWN_OF_AN_INPUT)
}

/**
 * THE RULE ONE REFUSED LIST BROKE, with what the refusal needs to name: for a rule about one input, its place in the
 * list (counted from 1, among the inputs as sent) and what a person can see of it; for a rule about the whole list,
 * what was wrong with the list. The code is the rule, because a page draws a refusal's sentence from its code alone
 * (src/web/components/ui.tsx, `theRefusalInWords`) and a sentence cannot branch on a value.
 */
export type ARefusedQuickInputList =
  | { code: 'quickInputListNotAList'; values: Record<string, never> }
  | { code: 'quickInputListEmpty'; values: Record<string, never> }
  | { code: 'quickInputListTooMany'; values: { most: number; count: number } }
  | { code: 'quickInputListItemNotWords'; values: { place: number } }
  | { code: 'quickInputListItemEmpty'; values: { place: number } }
  | { code: 'quickInputListItemTooLong'; values: { place: number; longest: number; input: string } }
  | { code: 'quickInputListItemHoldsAKey'; values: { place: number; input: string } }
  | { code: 'quickInputListItemNoSlash'; values: { place: number; input: string } }
  | { code: 'quickInputListItemTwice'; values: { place: number; input: string } }

/**
 * THE ENGLISH SENTENCE OF A REFUSED LIST, for the server's own reply. The page draws the code's words from
 * src/shared/words/en-wave-13u.ts instead, in the page's language.
 */
export function theSentenceForARefusedQuickInputList(refused: ARefusedQuickInputList): string {
  switch (refused.code) {
    case 'quickInputListNotAList':
      return 'A list of quick inputs is a list of words, one per input.'
    case 'quickInputListEmpty':
      return 'A list of quick inputs holds at least one input. To have none, clear the list.'
    case 'quickInputListTooMany':
      return `A list of quick inputs holds at most ${String(refused.values.most)} inputs, and this one holds ${String(refused.values.count)}.`
    case 'quickInputListItemNotWords':
      return `Input ${String(refused.values.place)} of the list is not words. Each quick input is written as words.`
    case 'quickInputListItemEmpty':
      return `Input ${String(refused.values.place)} of the list is empty. A quick input is one line of text.`
    case 'quickInputListItemTooLong':
      return `Input ${String(refused.values.place)} of the list is longer than the ${String(refused.values.longest)} characters a quick input may hold. It begins "${refused.values.input}…".`
    case 'quickInputListItemHoldsAKey':
      return `Input ${String(refused.values.place)} of the list holds a key such as Enter or Escape, so it is not one line of text. The part before that key is "${refused.values.input}".`
    case 'quickInputListItemNoSlash':
      return `Input ${String(refused.values.place)} of the list is "${refused.values.input}", which does not begin with "/". Only commands such as /context and /compact may be on the list, so an answer to a question on the screen is never typed.`
    case 'quickInputListItemTwice':
      return `Input ${String(refused.values.place)} of the list repeats "${refused.values.input}". An input is on the list once.`
  }
}

/**
 * A LIST THIS OFFICE WILL NOT KEEP, carrying the rule it broke so the door can answer with that rule's code and
 * values. Its message is the English sentence `theSentenceForARefusedQuickInputList` writes.
 */
export class AQuickInputListTheOfficeWillNotKeep extends Error {
  readonly refused: ARefusedQuickInputList
  constructor(refused: ARefusedQuickInputList) {
    super(theSentenceForARefusedQuickInputList(refused))
    this.refused = refused
  }
}

/** Refuse one list by the rule it broke. Nothing is changed by a list that is refused. */
function notOne(refused: ARefusedQuickInputList): never {
  throw new AQuickInputListTheOfficeWillNotKeep(refused)
}

/**
 * READ A LIST AS STORED OR AS SENT. Throws `AQuickInputListTheOfficeWillNotKeep`, whose message says in a sentence,
 * and whose `refused` says in a code and values, the first thing that is wrong; nothing is changed by a list that is
 * refused. `undefined` and `null` are the honest absence. Each input is trimmed, and the reading is what is kept, so
 * the person is shown back what the office made of what they wrote.
 */
export function readQuickInputList(raw: unknown): QuickInputListReading {
  if (raw === undefined || raw === null) return { state: 'none' }
  if (!Array.isArray(raw)) notOne({ code: 'quickInputListNotAList', values: {} })
  if (raw.length === 0) notOne({ code: 'quickInputListEmpty', values: {} })
  if (raw.length > THE_MOST_QUICK_INPUTS) {
    notOne({ code: 'quickInputListTooMany', values: { most: THE_MOST_QUICK_INPUTS, count: raw.length } })
  }
  const inputs: string[] = []
  for (const [at, one] of raw.entries()) {
    const place = at + 1
    if (typeof one !== 'string') notOne({ code: 'quickInputListItemNotWords', values: { place } })
    const input = one.trim()
    if (input === '') notOne({ code: 'quickInputListItemEmpty', values: { place } })
    if (input.length > THE_LONGEST_QUICK_INPUT) {
      notOne({ code: 'quickInputListItemTooLong', values: { place, longest: THE_LONGEST_QUICK_INPUT, input: theVisiblePartOfAQuickInput(input) } })
    }
    if (A_CONTROL_CHARACTER.test(input)) {
      notOne({ code: 'quickInputListItemHoldsAKey', values: { place, input: theVisiblePartOfAQuickInput(input) } })
    }
    if (!input.startsWith('/')) notOne({ code: 'quickInputListItemNoSlash', values: { place, input } })
    if (inputs.includes(input)) notOne({ code: 'quickInputListItemTwice', values: { place, input } })
    inputs.push(input)
  }
  return { state: 'set', inputs }
}

/**
 * WHAT BECAME OF ONE ASK. `typed` is the one outcome that types; the others type nothing, except
 * `typed-without-enter`, where the input reached the terminal and the Enter after it did not, and `unknown`, where the
 * office cannot tell.
 *
 *   - `not-the-agent`: the ask did not carry the run's own key (condition 1);
 *   - `no-list`: the owner has set no list (condition 2);
 *   - `not-on-the-list`: the input is not on the list as written (condition 2);
 *   - `too-soon`: an input was typed for this agent less than ten minutes before (condition 3);
 *   - `not-typed`: all three held, and the terminal holder took nothing: the terminal has ended or is not held, the
 *     person has a line half typed in it, or the holder is older than quick inputs;
 *   - `typed-without-enter`: the input was typed and the holder did not press the Enter after it, because the terminal
 *     ended or the person began typing in it in the moment between. It counts towards the ten minutes;
 *   - `unknown`: the input was sent to the holder and no answer the office can read came back (the holder was silent,
 *     closed the connection, or answered something that is not an answer), so the office cannot tell whether anything
 *     was typed. It counts towards the ten minutes, so a holder that stops answering cannot be asked into typing twice.
 */
export const QUICK_INPUT_OUTCOMES = [
  'typed',
  'not-the-agent',
  'no-list',
  'not-on-the-list',
  'too-soon',
  'not-typed',
  'typed-without-enter',
  'unknown',
] as const
export type QuickInputOutcome = (typeof QUICK_INPUT_OUTCOMES)[number]

/**
 * The outcomes that start the ten minutes: the two that put something into the terminal, and `unknown`, where something
 * may have been put there.
 */
export const QUICK_INPUT_OUTCOMES_THAT_START_THE_TEN_MINUTES: readonly QuickInputOutcome[] = ['typed', 'typed-without-enter', 'unknown']

/** ONE ASK, AS KEPT. Stamps are the office's stored form (`localStamp`). */
export interface QuickInputAsk {
  id: string
  at: string
  /** The agent whose terminal it was asked for, by its registry id, and its handle as the registry holds it now. */
  agent: { id: string; handle: string | null }
  /** The run (a session record) the ask named, and the office terminal that run works in. */
  run: string
  terminal: string
  input: string
  outcome: QuickInputOutcome
  /** Who asked, as the request named itself, and how it proved that; `provedBy` is null when it proved nothing. */
  askedBy: { kind: string; id: string; provedBy: string | null }
  /** The sentence the asker was answered with, in English. */
  says: string
}

/** One agent's asks, newest first, and when the next input may be typed for it: null when it may be typed now. */
export interface AnAgentsQuickInputs {
  agent: { id: string; handle: string | null }
  asks: QuickInputAsk[]
  /** How many older asks there are than the ones returned. */
  left: number
  nextAllowedAt: string | null
}

/**
 * WHAT `GET /api/office/quick-inputs` AND `POST /api/office/quick-inputs` ANSWER: the owner's list as stored, who set it
 * and when, and what a reader needs beside it.
 */
export interface WhatTheQuickInputListDoorSays {
  reading: QuickInputListReading
  /**
   * When the list was last set or cleared. A clear keeps the row, with no inputs, so after a clear this is when it was
   * cleared. Null only when there is no row at all, which no office migrated past 0272 has unless the row was removed
   * by hand.
   */
  setAt: string | null
  /**
   * The kind and id the last write was stamped with, exactly as stored: who set the list, or who cleared it when the
   * reading is `none`. The list the office starts with, /context and /compact (the two examples in the rule for quick
   * inputs), is stamped `{ kind: 'migration', id: '0272' }` as migration 0190 stamps the
   * rows it writes: the office wrote it, not the owner. Null only when there is no row at all, as `setAt` is. A cleared
   * list keeps its row so that a restore carries the clear over the list a fresh migration starts with (wave 13u
   * round 21).
   */
  setBy: { kind: string; id: string } | null
  /** The sentence saying nobody has set a list, or null when one is set. */
  says: string | null
  /** Why this caller may not change the list, in the words the write door refuses with, or null when it may. */
  refusal: string | null
}

/** WHAT `POST /api/terminals/quick-input` ANSWERS when the input was typed. A refusal is answered as a refusal, with its code. */
export interface WhatAQuickInputAskIsAnswered {
  ask: QuickInputAsk
  /** When the next input may be typed for this agent. */
  nextAllowedAt: string
}
