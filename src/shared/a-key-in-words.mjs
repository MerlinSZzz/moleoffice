// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHAT COUNTS AS A KEY IN WORDS, AND WHAT IT IS SHOWN AS. The office tool (tools/office-request.mjs) replaces every key
 * in an answer before a model reads it, so what a run reads of a message is its words with each key replaced.
 */

/** What a key in a reply is replaced by. */
export const A_KEY_SHOWN_AS = '<a key, not shown>'

/** Exactly 64 hex characters, not inside a longer hex run: the shape of every key the office makes. */
const A_KEY = /(?<![0-9A-Fa-f])[0-9A-Fa-f]{64}(?![0-9A-Fa-f])/g

/**
 * THE TEXT WITH EVERY KEY IN IT REPLACED (the office tool's rule 3). Only a run of exactly 64 hex characters is a key here.
 * @param {unknown} text
 * @returns {string}
 */
export function withoutKeys(text) {
  return String(text).replace(A_KEY, A_KEY_SHOWN_AS)
}
