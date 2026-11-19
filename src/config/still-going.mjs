// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE STATES IN WHICH A RUN IS STILL GOING, listed once. Every other state has stopped, or nobody can tell.
 *
 * A `.mjs` so that a JavaScript reader can import it as well as a TypeScript one. src/shared/types.ts
 * gives the list its type, and src/config/own-rows.mjs reads it to say whether a row is still going.
 * Until this file each of those, and the server's world module, wrote the two states out for itself.
 */

/** @type {readonly ['running', 'idle']} */
export const STILL_GOING_STATES = Object.freeze(/** @type {const} */ (['running', 'idle']))

/**
 * Whether a stored value says the run is still going.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function saysStillGoing(value) {
  return /** @type {readonly unknown[]} */ (STILL_GOING_STATES).includes(value)
}
