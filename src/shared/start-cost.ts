// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readStoredWord as t, type WordKey } from './i18n.ts'
import { en } from './words/en.ts'
/**
 * THE CEILING ON WHAT A START MAY COST, AND THE STEPS OF A START, DECLARED ONCE.
 * F15 point 6, amended later.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS ONE FILE, AND WHY EVERYTHING ELSE READS IT FROM HERE
 * ---------------------------------------------------------------------------------------
 *
 * The ceiling is two numbers now: tokens and minutes. They are declared ONCE, in
 * `START_COST_CEILING` below, with what they cover carried beside them. The receipt a
 * session writes, the panel on the Runtime page and the red test all read them from this export;
 * none of them retypes a number. A number typed a second time is free to drift the first time
 * either copy changes, which is the ninth invariant's own defect — one fact worked out in two
 * places.
 *
 * ---------------------------------------------------------------------------------------
 * TOOL ROUNDS WERE RETIRED, AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * A decision named three numbers: 15,000 tokens, two minutes AND five tool
 * rounds.
 * A later decision amended it:
 *
 * No counting this fine-grained. It does not work with every harness, and making a worker record it
 * wastes tokens. What must be recorded is which office-flow STEP cost which tokens and time, and
 * the office must record it by itself, never by sending an agent back to summarise a session.
 *
 * The old tool-round number was read from a Claude Code transcript file. That reading was too fine,
 * it existed for one harness (a Codex or an OpenCode run answered "not measured"), the transcript
 * file is rotated so a measured start became "nobody measured" later, and the work of keeping it
 * was the token waste that amendment named. So `toolRounds` is gone from the ceiling and from the receipt, and
 * nothing reads a transcript. A start is measured when it has a token receipt, a startedAt and a
 * first write outside its own session record.
 *
 * ---------------------------------------------------------------------------------------
 * WHOSE NUMBER THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * The two remaining numbers are on proposal `ide2Dq0I7C08`, option A:
 *
 * Registering — the avatar, the labels and the session record — plus restoring the project's
 * knowledge, together: at most 15,000 tokens and two minutes. The office measures the real number
 * of every start from its own trace and its own usage; over the ceiling is red. The five tool
 * rounds in those words were retired; the two numbers were not. Changing either
 * is the person's decision to make, from Mole Office's own decision door — never a worker's, and never a
 * quiet edit to this file.
 *
 * ---------------------------------------------------------------------------------------
 * THE STEPS OF A START, DECLARED ONCE, NAMED BY THE OFFICE'S OWN OPERATIONS
 * ---------------------------------------------------------------------------------------
 *
 * The office already writes one row in `api_calls` for every request it answers, carrying the
 * request's operation, its instant and the session that made it. `START_STEPS` below is the closed
 * list of the steps of a start, and each step names the operations from `src/shared/ops.ts` that
 * belong to it. The step table is worked out from those rows and from the run's own first write
 * outside its session record. Nothing here is retyped by the reader: the receipt writer in
 * `src/server/lib/start-cost.ts` and the panel on the Runtime page both iterate this list.
 *
 * The three steps are:
 *
 *   registering  the doors that register this run and the write that files its session record;
 *   restoring    the reads that restore the project's knowledge before any work;
 *   the first write   the first write outside this session record, which ends the start.
 *
 * ---------------------------------------------------------------------------------------
 * ABSENCE IS NOT ZERO, AND THIS IS THE RULE THE WHOLE PIECE STANDS ON
 * ---------------------------------------------------------------------------------------
 *
 * A run with no receipt, or a receipt whose runtime gave no counts, is a run NOBODY MEASURED. It is
 * never drawn or counted as a start that cost nothing. A step with no request of its kind says so
 * in words rather than showing a zero. A start that has not yet made a write outside its own
 * session record has not finished starting, and that is not a start that cost nothing either.
 * `src/shared/pick-up-cost.ts` states the same rule for its own two numbers, in the same words.
 */

/** The ceiling itself, and what it covers. Nothing here is a default: it is a fact. */
export interface StartCostCeiling {
  /** Estimated tokens: the run's own usage receipt, summed the one way usage-receipts.ts sums. */
  tokens: number
  /** Whole minutes, from the session record's startedAt to its first write outside itself. */
  minutes: number
  /** What the two numbers cover, so a reader never has to take them on faith. */
  covers: string
}

export const START_COST_CEILING: StartCostCeiling = {
  tokens: 15_000,
  minutes: 2,
  covers:
    "Registering (the avatar, the labels and the session record) plus restoring the project's knowledge, " +
    'together: at most 15,000 tokens and two minutes. The tool-round number is retired: what is recorded ' +
    'instead is which office-flow step cost which tokens and time, recorded by the office itself. The office ' +
    'measures the real number of every start from its own trace and usage; over the ceiling is red.',
}

/** Which of the two measured numbers are over the ceiling. An empty list is a green start. */
export type StartCostOverage = 'tokens' | 'minutes'

/** One step of a start, declared once: its name, its sentence, and the operations that name it. */
export interface StartStepDefinition {
  /** The step's own short name. */
  readonly name: string
  /** What the step is, in one sentence a reader meets on the Runtime page. */
  readonly says: string
  /**
   * The operation names from `src/shared/ops.ts` that belong to this step. Empty for the step that
   * is the first write itself: that step is a moment read from the run's own change log, not a
   * request, and nothing is invented to give it operations.
   */
  readonly operations: readonly string[]
  /** True for the one step that is the first write outside the session record, which ends the start. */
  readonly endsTheStart?: true
}

/**
 * THE STEPS OF A START, IN ORDER, DECLARED ONCE. See the file header for why each step names the
 * operations it does, and `src/server/lib/start-cost.ts` for how a step is measured.
 */
export const START_STEPS: readonly StartStepDefinition[] = [
  {
    name: 'registering',
    get says() { return t('dev.start.registeringSays') },
    // THE SELF-REGISTRATION DOOR AND THE STARTER'S DOOR. A session a person started uses the first;
    // a worker's starter uses the second. The session sweep files records for sessions it found on
    // disk, which is the same first write for a run nobody registered in the moment.
    operations: ['agent.register-myself', 'agent.register-started', 'session.discover'],
  },
  {
    name: 'restoring',
    get says() { return t('dev.start.restoringSays') },
    // THE SHORT ONBOARDING READ, the identity restore, the two whole-project reads and the two
    // catalogue reads. These are the doors F15 points 3 and 4 name; every one is a read the office
    // already records under its own operation.
    operations: [
      'project.onboarding',
      'participant.restore',
      'project.brief',
      'project.where-you-stand',
      'project.bootstrap',
      'project.schema',
      'project.index',
    ],
  },
  {
    name: 'the first write',
    get says() { return t('dev.start.firstWriteSays') },
    operations: [],
    endsTheStart: true,
  },
]

/**
 * One step of a start as the office measured it.
 *
 * AN ABSENT VALUE IS AN ABSENT KEY, NEVER A STORED NULL, because that is what the kind checker can
 * declare (see `src/shared/kinds.ts` on why it holds no `string | null`) and because a stored null
 * would be a third answer beside *absent* and *known*. A reader treats `undefined` and `null`
 * alike: both mean nobody measured that part of the step.
 */
export interface StartStepReading {
  /** The step's name, one of `START_STEPS`. */
  name: string
  /** What the step is, from its declaration. */
  says: string
  /** The operation names this step was counted by. Empty for the step that ends the start. */
  operations: readonly string[]
  /** How many requests of this step's operations the office answered for this start. */
  requests: number
  /** When the first thing of this step happened, local wall-clock; absent when none did. */
  firstAt?: string | null
  /** When the last thing of this step happened, local wall-clock; absent when none did. */
  lastAt?: string | null
  /**
   * Wall-clock milliseconds the start spent in this step: from the first thing to the last, or the
   * one request's own latency when there is exactly one. Absent when no thing of this kind happened
   * — "no request of this kind", never zero.
   */
  spentMs?: number | null
  /** The tokens attributed to this step, or absent when the runtime did not report them per request. */
  tokens?: number | null
  /** Why there is no token number for this step, or absent when there is one. */
  tokensSays?: string | null
  /** True only on the step that is the first write outside the session record. */
  endsTheStart?: true
}

/**
 * WHAT THE OFFICE CAN HONESTLY SAY ABOUT TOKENS PER STEP, IN ONE SENTENCE.
 *
 * Every runtime's stored receipt is one figure for the run: the Codex adapter sums its
 * `turn.completed` events, the OpenCode adapter sums its `step_finish` parts, and the Claude reader
 * gives one total (read `src/worker/runtimes/usage.ts` and `src/server/lib/usage-receipts.ts`).
 * None of them keeps a per-request figure by the time the receipt is stored. So a step gets no
 * token number rather than a share invented for it, and the receipt says so where it shows them.
 */
export const TOKENS_ARE_WHOLE_START = en['dev.start.wholeTokens']

export function startTokensExplanation(says: string): string {
  return says === TOKENS_ARE_WHOLE_START ? t('dev.start.wholeTokens') : says
}

/** The three numbers a finished start really cost, measured — never typed by an agent. */
export interface StartCostMeasured {
  measured: true
  tokens: number
  minutes: number
  /** Which of the two are over the ceiling. Empty means this start is green. */
  over: StartCostOverage[]
  /** The start's own steps, in order, from the office's call log. */
  steps: StartStepReading[]
  /** Why step tokens are absent when they are, or null. `TOKENS_ARE_WHOLE_START` today. */
  tokensSays: string | null
}

/** A start nobody could measure, and why. Never a zero, and never drawn as one. */
export interface StartCostUnmeasured {
  measured: false
  /** Why there is no number, in one plain sentence. */
  why: string
}

export type StartCost = StartCostMeasured | StartCostUnmeasured

/**
 * WHICH OF THE TWO NUMBERS CROSS THE CEILING, worked out in the one place both the receipt and the
 * red test read it from. Pure, so a test can drive it directly with numbers of its own instead of
 * building a whole session to prove the comparison. Tool rounds are gone; `startCostOverage` now
 * compares exactly two numbers, because the ceiling has exactly two.
 */
export function startCostOverage(
  tokens: number,
  minutes: number,
  ceiling: StartCostCeiling = START_COST_CEILING,
): StartCostOverage[] {
  const over: StartCostOverage[] = []
  if (tokens > ceiling.tokens) over.push('tokens')
  if (minutes > ceiling.minutes) over.push('minutes')
  return over
}

/** One session, its start cost, and enough to draw a row about it. */
export interface StartCostRow {
  sessionId: string
  title: string
  cost: StartCost
}

/** The Runtime page's whole panel: the ceiling, the recent rows, and the two counts it leads with. */
export interface StartCostPanel {
  ceiling: StartCostCeiling
  recent: StartCostRow[]
  overCeilingCount: number
  unmeasuredCount: number
}

/** "N word" or "N words", so a start of exactly one minute never reads "1 minutes". */
function plural(n: number, word: 'token' | 'minute' | 'second'): string {
  const key = { token: 'dev.start.tokens', minute: 'dev.start.minutes', second: 'dev.start.seconds' } as const
  return t(key[word], { n, count: n.toLocaleString('en-GB') })
}

/**
 * THE TWO NUMBERS, IN WORDS, WRITTEN ONCE. `startCostSaid` below and the Runtime panel both read a
 * start's two numbers this same way, so a reader comparing the panel with a report never meets two
 * different phrasings of one measurement.
 */
export function startCostNumbers(tokens: number, minutes: number): string {
  return `${plural(tokens, 'token')}, ${plural(minutes, 'minute')}`
}

/** One token count in words, so the step rows and the receipt both pluralise it the same way. */
export function startTokensSaid(tokens: number): string {
  return plural(tokens, 'token')
}

/** One sentence: green or red, with the numbers a reader would check it against. */
export function startCostSaid(cost: StartCost, ceiling: StartCostCeiling = START_COST_CEILING): string {
  if (!cost.measured) return cost.why
  const against = startCostNumbers(ceiling.tokens, ceiling.minutes)
  const measured = startCostNumbers(cost.tokens, cost.minutes)
  if (cost.over.length === 0) return t('dev.start.under', { measured, against })
  return t('dev.start.over', { dimensions: cost.over.map((one) => t(one === 'tokens' ? 'dev.runtime.tokens' : 'dev.runtime.minutes')).join(t('dev.runtime.and')), measured, against })
}

/** The ceiling in one line. The Runtime page reads this rather than retyping. */
export function startCostCeilingSaid(ceiling: StartCostCeiling = START_COST_CEILING): string {
  return t('dev.start.ceiling', { numbers: startCostNumbers(ceiling.tokens, ceiling.minutes) })
}

/** How long a step took, in plain words. Absent is an absence and is said as one, never as zero. */
export function startStepSpentSaid(step: StartStepReading): string {
  if (step.spentMs == null) return t('dev.runtime.noRequestOfThisKind')
  if (step.spentMs < 1_000) return t('dev.start.milliseconds', { n: step.spentMs })
  const seconds = Math.round(step.spentMs / 1_000)
  if (seconds < 60) return plural(seconds, 'second')
  return plural(Math.round(seconds / 60), 'minute')
}

// The step identifiers stay stable; only their page labels follow the reader.
const START_STEP_WORDS: Readonly<Record<string, WordKey>> = {
  registering: 'dev.start.registering',
  restoring: 'dev.start.restoring',
  'the first write': 'dev.start.firstWrite',
}

export function startStepNameSaid(step: StartStepReading): string {
  const word = START_STEP_WORDS[step.name]
  return word === undefined ? step.name : t(word)
}

export function startStepDescriptionSaid(step: StartStepReading): string {
  return START_STEPS.find((one) => one.name === step.name)?.says ?? step.says
}
