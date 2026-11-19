// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SPANS OF THE THREE TIMED GOAL HORIZONS: SHORT, MEDIUM AND LONG. Criterion P1.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE SPANS ARE
 * ---------------------------------------------------------------------------------------
 *
 * Criterion P1 of design/planning/ACCEPTANCE.md. The spans are a SETTING, so the person may adjust
 * them; short is within two weeks, medium within two months, and long within a year; and the fourth
 * horizon, distant, has NO time limit.
 *
 * ---------------------------------------------------------------------------------------
 * THREE NUMBERS AND NO FOURTH, AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * Short, medium and long each have a span in days, and each is a number the person may set. Distant
 * has no time limit by criterion P1, so there is no number to store for it. A fourth column that
 * must always be NULL would say "nobody has chosen" about a thing nobody can choose, which is
 * invariant 5 of USER.md turned into a storage mistake; and a fourth default would be a number for
 * a horizon whose whole meaning is that it has none. So distant has no column, no default and no
 * reader here, and the reason is this paragraph.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE NUMBERS LIVE, AND WHY NOT ONE TABLE
 * ---------------------------------------------------------------------------------------
 *
 * Three columns on the installation singleton row: `goal_short_days`, `goal_medium_days` and
 * `goal_long_days`. They belong to the OFFICE rather than to a person, like the three numbers U6
 * put on the same row (drizzle/0166), and there is still no settings table: drizzle/0152 states the
 * rule in the repository's own words, a settings table would be a place for any future setting to
 * go, which is invariant 6 of USER.md. Each setting is a column where it belongs.
 *
 * ---------------------------------------------------------------------------------------
 * NULL MEANS NOBODY HAS CHOSEN, AND A PRESENT VALUE THAT CANNOT BE READ IS A REFUSAL
 * ---------------------------------------------------------------------------------------
 *
 * A NULL column means nobody has chosen, so the default below is in force and a reader is TOLD that
 * rather than handed the default as though it were the person's choice — invariant 5 of USER.md, the pattern
 * `media_load` sets. A value that is PRESENT and cannot be read is a different thing: a refusal
 * that names the setting, never a quiet default. `isGoalSpanNumber` is the one place that decides
 * both what may be stored and what may be read.
 */

/** The three settings, in the order the horizons run, coarse to fine by how far out they reach. */
export const GOAL_SPAN_KEYS = ['shortGoalDays', 'mediumGoalDays', 'longGoalDays'] as const

/** One of the three. */
export type GoalSpanKey = (typeof GOAL_SPAN_KEYS)[number]

/** The goal horizon each setting is the span of. Distant is deliberately absent: it has no span. */
export const GOAL_SPAN_HORIZON: Readonly<Record<GoalSpanKey, 'short' | 'medium' | 'long'>> = {
  shortGoalDays: 'short',
  mediumGoalDays: 'medium',
  longGoalDays: 'long',
}

/**
 * WHAT IS IN FORCE WHEN NOBODY HAS CHOSEN.
 *
 * Each span, and its number in days:
 *
 *   short   two weeks   = 14 days.
 *   medium  two months  = 60 days. A calendar month is 28 to 31 days, so "two months" is a range
 *                        rather than a number; 60 is the ordinary working reading of it — two
 *                        30-day months — and it is a default the person may change, not a rule.
 *   long    a year      = 365 days.
 *
 * THESE ARE DEFAULTS, NOT THE SETTING. The person sets the setting; this is what is in force until
 * they do, and the reader says so.
 */
export const GOAL_SPAN_DEFAULTS: Readonly<Record<GoalSpanKey, number>> = {
  shortGoalDays: 14,
  mediumGoalDays: 60,
  longGoalDays: 365,
}

/**
 * THE SMALLEST AND LARGEST A NUMBER MAY HONESTLY BE.
 *
 * One is the smallest: a span of zero days is not a span, and a goal that must be met today is not
 * a horizon. The ceiling is a guard against arithmetic that overflows a day count, and it is
 * generous — a hundred thousand days is more than a lifetime. The two bounds are the ones U6's
 * settings already use, because they answer the same question about a day count.
 */
export const GOAL_SPAN_LOWEST = 1
export const GOAL_SPAN_HIGHEST = 100_000

/** What each number is called on the screen. A name, not a field and not a sentence. */
export const GOAL_SPAN_LABELS: Readonly<Record<GoalSpanKey, string>> = {
  shortGoalDays: 'Short: within so many days',
  mediumGoalDays: 'Medium: within so many days',
  longGoalDays: 'Long: within so many days',
}

/** What each number means, in one plain sentence. Drawn under its control. */
export const GOAL_SPAN_MEANS: Readonly<Record<GoalSpanKey, string>> = {
  shortGoalDays: 'A short goal is one meant to be met within this many days of when it was filed.',
  mediumGoalDays: 'A medium goal is one meant to be met within this many days of when it was filed.',
  longGoalDays: 'A long goal is one meant to be met within this many days of when it was filed.',
}

/** What distant means, in one sentence, so a reader learns why it has no control beside the three. */
export const DISTANT_HAS_NO_LIMIT =
  'A distant goal has no time limit — it holds the abstract aims — so there is nothing to set ' +
  'for it and it is not drawn beside the three.'

/** One of the three numbers as a screen reads it. */
export interface GoalSpanOnScreen {
  key: GoalSpanKey
  /** The horizon this span is the span of: short, medium or long. */
  horizon: 'short' | 'medium' | 'long'
  /** What the number is called on the screen. */
  label: string
  /** What the number means, in one plain sentence. */
  means: string
  /** True when nobody has chosen, so the default is in force. */
  nobodyChose: boolean
  /** The value in force, or null because a present value could not be read. */
  inForce: number | null
  /** Where the value in force came from. */
  from: "the person's setting" | 'the default' | 'unreadable'
  /** What a reader is told: which default, whose choice, or the refusal. */
  says: string
}

/** Everything the goal spans section draws. */
export interface TheGoalSpans {
  /** Why distant has no control here, in one sentence. */
  distantHasNoLimit: string
  /** The three numbers, in declaration order. */
  spans: GoalSpanOnScreen[]
}

/** Whether a value that came out of a row is a number the office may store. */
export function isGoalSpanNumber(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= GOAL_SPAN_LOWEST &&
    value <= GOAL_SPAN_HIGHEST
  )
}

/** Whether a value is one of the three keys. */
export function isGoalSpanKey(value: unknown): value is GoalSpanKey {
  return typeof value === 'string' && (GOAL_SPAN_KEYS as readonly string[]).includes(value)
}

/**
 * WHAT THE CONTROL SAYS WHEN WHAT WAS TYPED IS NOT A NUMBER THE OFFICE MAY STORE.
 *
 * It is here rather than in a panel so the bounds and the sentence that names them are one fact.
 */
export function goalSpanRangeSays(): string {
  return (
    `Enter a whole number from ${String(GOAL_SPAN_LOWEST)} to ${String(GOAL_SPAN_HIGHEST)}, ` +
    'or leave it as it is.'
  )
}
