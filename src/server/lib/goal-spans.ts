// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE GOAL SPANS: THE THREE NUMBERS READ AND WRITTEN. Criterion P1.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE NUMBERS LIVE
 * ---------------------------------------------------------------------------------------
 *
 * Three columns on the installation singleton row: `goal_short_days`, `goal_medium_days` and
 * `goal_long_days`. NULL means nobody has chosen, and then the default in `@shared/goal-spans.ts`
 * is in force and the reader is told so. A value that is present and cannot be read is
 * `unreadable`: a refusal that names the setting, never a quiet default. Distant has no column and
 * no entry here, and the reason is written in the shared file.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING HERE IS CACHED
 * ---------------------------------------------------------------------------------------
 *
 * Every read goes to the row at the moment somebody asks. A remembered number would be one that
 * goes stale while the page says it is current.
 */

import {
  GOAL_SPAN_DEFAULTS,
  GOAL_SPAN_KEYS,
  GOAL_SPAN_LABELS,
  GOAL_SPAN_MEANS,
  GOAL_SPAN_HORIZON,
  DISTANT_HAS_NO_LIMIT,
  isGoalSpanNumber,
  type GoalSpanKey,
  type GoalSpanOnScreen,
  type TheGoalSpans,
} from '@shared/goal-spans.ts'
import { sqlite } from '../db/client.ts'

/** The column each setting is stored in, worked out once. */
const COLUMNS: Readonly<Record<GoalSpanKey, string>> = {
  shortGoalDays: 'goal_short_days',
  mediumGoalDays: 'goal_medium_days',
  longGoalDays: 'goal_long_days',
}

/** A present value that cannot be read. The sentence names the setting and refuses the default. */
export class GoalSpanCannotBeRead extends Error {
  constructor(sentence: string) {
    super(sentence)
    this.name = 'GoalSpanCannotBeRead'
  }
}

/** How the three columns read, exactly as SQLite hands them over, or null because there is no row. */
function theRawRow(): Record<string, unknown> | null {
  const row = sqlite
    .prepare(
      'SELECT goal_short_days, goal_medium_days, goal_long_days FROM installation WHERE only_row = 1',
    )
    .get() as Record<string, unknown> | undefined
  return row ?? null
}

/** The value the row holds for one setting, or null because nobody has chosen or there is no row. */
function rawValueFor(key: GoalSpanKey): unknown {
  const row = theRawRow()
  if (row === null) return null
  return row[COLUMNS[key]] ?? null
}

/** One number as the screen reads it, including a refusal when the stored value cannot be read. */
export function readingOf(key: GoalSpanKey): GoalSpanOnScreen {
  const raw = rawValueFor(key)
  const label = GOAL_SPAN_LABELS[key]
  const means = GOAL_SPAN_MEANS[key]
  const horizon = GOAL_SPAN_HORIZON[key]

  // NOBODY HAS CHOSEN. The default is in force and the reader is told that, rather than being
  // handed the default as though it were their own choice.
  if (raw === null || raw === undefined) {
    const theDefault = GOAL_SPAN_DEFAULTS[key]
    return {
      key,
      horizon,
      label,
      means,
      nobodyChose: true,
      inForce: theDefault,
      from: 'the default',
      says: `Nobody has chosen, so the default of ${String(theDefault)} days is in force.`,
    }
  }

  // PRESENT AND UNREADABLE. A refusal that names the setting. The default is NOT substituted: a
  // value the office itself wrote and can no longer read is not nobody having chosen.
  if (!isGoalSpanNumber(raw)) {
    return {
      key,
      horizon,
      label,
      means,
      nobodyChose: false,
      inForce: null,
      from: 'unreadable',
      says:
        `${label} holds a value this office cannot read: ${JSON.stringify(raw)}. ` +
        'The default is not used, and nothing has been changed.',
    }
  }

  return {
    key,
    horizon,
    label,
    means,
    nobodyChose: false,
    inForce: raw,
    from: "the person's setting",
    says: `You chose ${String(raw)} days, and that is what is in force.`,
  }
}

/**
 * ONE SPAN IN FORCE, FOR A READER THAT CANNOT CONTINUE WITHOUT IT.
 *
 * Throws `GoalSpanCannotBeRead` when the value is present and unreadable, so a caller that must
 * decide whether a goal is inside its horizon stops and says which setting it was. A NULL column is
 * not a refusal: it is nobody having chosen, and the default applies.
 */
export function theGoalSpanInForce(key: GoalSpanKey): number {
  const reading = readingOf(key)
  if (reading.from === 'unreadable') throw new GoalSpanCannotBeRead(reading.says)
  return reading.inForce as number
}

/** Everything the goal-spans section draws: the three numbers and why distant is not among them. */
export function theGoalSpans(): TheGoalSpans {
  return {
    distantHasNoLimit: DISTANT_HAS_NO_LIMIT,
    spans: GOAL_SPAN_KEYS.map(readingOf),
  }
}

/**
 * WRITE ONE OR MORE OF THE NUMBERS, AND ANSWER WITH THE WHOLE READING.
 *
 * Only the settings the caller named are written, so a person changing one number does not rewrite
 * the other two. A named value of null takes the choice away again, which is how the person returns
 * a number to nobody-having-chosen. The reply is read fresh from the row.
 */
export function setTheGoalSpans(change: Partial<Record<GoalSpanKey, number | null>>): TheGoalSpans {
  const sets: string[] = []
  const values: (number | null)[] = []
  for (const key of GOAL_SPAN_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(change, key)) continue
    sets.push(`${COLUMNS[key]} = ?`)
    values.push(change[key] ?? null)
  }
  if (sets.length > 0) {
    sqlite.prepare(`UPDATE installation SET ${sets.join(', ')} WHERE only_row = 1`).run(...values)
  }
  return theGoalSpans()
}
