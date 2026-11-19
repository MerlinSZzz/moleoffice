// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW OFTEN THE SERVER'S SLEEP CLOCK RUNS, when nothing sets `THE_SLEEP_CLOCK_SETTING`. The live office keeps it: once
 * a minute.
 */
export const RUN_THE_SLEEP_CLOCK_EVERY_MS = 60_000

/**
 * THE SETTING THAT GIVES THE SLEEP CLOCK ANOTHER INTERVAL, in milliseconds. A test office sets it to a second, so the
 * office begins a sleep whose minute opens within a second rather than within a minute. src/config/settings.mjs
 * declares it.
 */
export const THE_SLEEP_CLOCK_SETTING = 'MOLE_OFFICE_RUN_THE_SLEEP_CLOCK_EVERY_MS'

/** The shortest interval the setting may give: one run of the clock a second. */
const THE_SHORTEST_RUN_MS = 1_000

/** The longest wait a Node timer keeps. A timer given a longer one runs every millisecond instead, so it is refused. */
const THE_LONGEST_RUN_MS = 2_147_483_647

/**
 * THE INTERVAL OF THE SLEEP CLOCK, from the setting's value: the default when it is unset, and otherwise the whole
 * number of milliseconds it says. Any other value throws a sentence that names the setting, and nothing is guessed from
 * it. The server's start (`startTheSleepClock` at src/server/index.ts) asks this, once, when the clock starts.
 */
export function theIntervalOfTheSleepClock(value: string | null): number {
  if (value === null) return RUN_THE_SLEEP_CLOCK_EVERY_MS
  const every = /^\d+$/.test(value) ? Number(value) : Number.NaN
  if (!(every >= THE_SHORTEST_RUN_MS && every <= THE_LONGEST_RUN_MS)) {
    throw new Error(
      `${THE_SLEEP_CLOCK_SETTING} is ${JSON.stringify(value)}; it must be a whole number of milliseconds from ` +
        `${String(THE_SHORTEST_RUN_MS)} to ${String(THE_LONGEST_RUN_MS)}. Nothing was guessed from it.`,
    )
  }
  return every
}
