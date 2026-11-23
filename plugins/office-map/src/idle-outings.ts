// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The one switch for idle outings: idle moles walking out, meeting and playing. They run on a timer
 * and are on as decided: calm and bounded, at most three out at a time, and nothing under reduced
 * motion, while the page is hidden or in quiet mode. Off, no new outing starts: one already under way
 * goes on and comes home, and then its moles stay home. A screen test can turn them off, or on, by its hook. */
export const IDLE_OUTINGS = true
export function idleOutingsOn(hooks: { idleOutings?: boolean } | undefined): boolean {
  return hooks?.idleOutings ?? IDLE_OUTINGS
}

/** A fixed sequence in [0, 1) for one seed (mulberry32), so a test or a film repeats the same outings. */
export function seededChances(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
/** Who goes out and where are drawn from the browser's random numbers, or from a seed a screen test gives. */
export function outingChances(seed: number | undefined): () => number {
  return Number.isSafeInteger(seed) ? seededChances(seed!) : Math.random
}
/** A separate seeded stream avoids coupling sitting to the group-size draw. */
export function sittingChances(seed: number | undefined): () => number {
  return Number.isSafeInteger(seed) ? seededChances(seed! ^ 0x27d4eb2f) : Math.random
}
