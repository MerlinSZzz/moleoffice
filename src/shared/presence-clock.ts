// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW OFTEN THE SERVER'S PRESENCE CLOCK LOOKS AGAIN at everybody's presence, while a person has a page open, when
 * nothing sets `THE_PRESENCE_LOOK_SETTING`. The live office keeps it.
 */
export const LOOK_AT_PRESENCE_AGAIN_EVERY_MS = 60_000

/**
 * THE SETTING THAT GIVES THE LOOK ANOTHER INTERVAL, in milliseconds. A test office sets it to a few seconds, so a test
 * waits one short look for a presence change and not up to a minute. src/config/settings.mjs declares it.
 */
export const THE_PRESENCE_LOOK_SETTING = 'MOLE_OFFICE_LOOK_AT_PRESENCE_AGAIN_EVERY_MS'

/** The shortest interval the setting may give: a look a second. */
const THE_SHORTEST_LOOK_MS = 1_000

/** The longest wait a Node timer keeps. A timer given a longer one runs every millisecond instead, so it is refused. */
const THE_LONGEST_LOOK_MS = 2_147_483_647

/**
 * THE INTERVAL OF THE LOOK, from the setting's value: the default when it is unset, and otherwise the whole number of
 * milliseconds it says. Any other value throws a sentence that names the setting, and nothing is guessed from it. The
 * server's clock (`startTheClock` in src/server/api/events.ts) asks this, once, when it starts.
 */
export function theIntervalOfThePresenceLook(value: string | null): number {
  if (value === null) return LOOK_AT_PRESENCE_AGAIN_EVERY_MS
  const every = /^\d+$/.test(value) ? Number(value) : Number.NaN
  if (!(every >= THE_SHORTEST_LOOK_MS && every <= THE_LONGEST_LOOK_MS)) {
    throw new Error(
      `${THE_PRESENCE_LOOK_SETTING} is ${JSON.stringify(value)}; it must be a whole number of milliseconds from ` +
        `${String(THE_SHORTEST_LOOK_MS)} to ${String(THE_LONGEST_LOOK_MS)}. Nothing was guessed from it.`,
    )
  }
  return every
}
