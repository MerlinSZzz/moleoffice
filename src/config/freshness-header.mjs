// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * HOW OLD THE ANSWERING SERVER'S CODE IS, ON EVERY REPLY.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion G4 of design/ground/ACCEPTANCE.md asks the page to shout when the code it is looking at
 * is not the code in the checkout. It caught one direction of that and not the other, and the
 * GROUND verifier measured the miss on 3 September 2026: the server had loaded `src/` at 23:20:53
 * and the page was served at 23:21:41, so the two halves of one stack were running different code.
 * `GET /api/runtime/freshness` said "older than the checkout" and two measuring tools refused to
 * measure. The page drew nothing at all, because it only ever compared ITSELF with the checkout.
 * Problem `JoI0x23xXBRK`.
 *
 * The server already knows. This carries what it knows to the page on every reply, as one small
 * header, so the page learns it without asking a second time.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A SECOND HEADER AND NOT A FIELD ON THE WORLD ONE
 * ---------------------------------------------------------------------------------------
 *
 * The world header is read ONCE per process and put on every reply after that, and the header
 * block of `src/server/lib/world.ts` explains why that is honest: every one of its five facts is
 * fixed for the life of the process. Freshness is not. It changes the moment somebody saves a file,
 * which is the whole point of it, so it is worked out for every reply. The look at the times of the
 * files the server is built from, under it, is read again only for as long as the rule above
 * `theServersHalf` in `src/server/lib/runtime.ts` says. In wave 13y round 33 a look cost 1.5
 * milliseconds in a warm process (the median of 30), at the times of 707 files, and every reply
 * looked. Before that round it looked at the page's 567 files as well, and cost 2.6 to 3.1
 * milliseconds. In round 86 a look at 828 files cost 1.6 to 1.8 milliseconds, and thirty replies
 * within one second cost 3.5 to 3.9 milliseconds together once that rule held the look, where they
 * had cost 55 to 57. Putting it on the world header would either make that header a lie or make
 * every reply pay for six `git` processes.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE VALUES, AND WHY THESE THREE
 * ---------------------------------------------------------------------------------------
 *
 *   verdict=    fresh, stale, or unknown — what the server says about its own code
 *   staleFor=   how many whole seconds it has been stale, or `-` when it is not
 *   grace=      how long stale has to last before a page draws a banner, in seconds
 *
 * `staleFor` rather than a moment, because the page needs a length of time and working one out from
 * a moment means the page and the server agreeing about the clock. They do not have to: the server
 * counts, and the page reads the count.
 *
 * `grace` travels because the page cannot read the declaration. `src/config/settings.mjs` imports
 * `node:fs`, so a browser cannot load it, and a number the page held its own copy of would be the
 * defect CLAUDE.md names at the top of the file: the same setting in two places, free to disagree.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS JAVASCRIPT
 * ---------------------------------------------------------------------------------------
 *
 * The same reason `src/config/settings.mjs` and `src/config/world-header.mjs` are, and it is
 * written out in full in the first of those: everything in `src/config` is read by callers this
 * repository does not control the Node version of. The types are not given up — `// @ts-check`
 * above and the JSDoc below are checked by `tsc`.
 */

/** The one header name. Named like the other Mole Office headers. */
export const FRESHNESS_HEADER = 'x-mole-office-freshness'

/**
 * What a server says about the age of its own code.
 *
 * @typedef {object} FreshnessOnTheWire
 * @property {'fresh' | 'stale' | 'unknown'} verdict What the server says about its own code.
 * @property {number | null} staleFor Whole seconds it has been stale. Null when it is not, or when
 *   the verdict is unknown.
 * @property {number} grace How long stale has to last before a page says so, in seconds.
 */

/**
 * One reading, as the header value.
 *
 * @param {FreshnessOnTheWire} reading
 * @returns {string}
 */
export function formatFreshnessHeader(reading) {
  const staleFor = reading.staleFor === null ? '-' : String(Math.max(0, Math.floor(reading.staleFor)))
  return `verdict=${reading.verdict}; staleFor=${staleFor}; grace=${String(Math.max(0, Math.floor(reading.grace)))}`
}

/**
 * Read a header value back, or say why it could not be read.
 *
 * A REFUSAL RATHER THAN A GUESS, for the reason `parseWorldHeader` gives: a header this cannot read
 * is a reply from something that is not this product, or from a version of it that says something
 * else. Reading a missing verdict as `fresh` would be the page saying "the code is current" about a
 * server that never claimed it.
 *
 * @param {string | null | undefined} text
 * @returns {{ ok: true, reading: FreshnessOnTheWire } | { ok: false, why: string }}
 */
export function parseFreshnessHeader(text) {
  if (text === null || text === undefined || text.trim() === '') {
    return { ok: false, why: `the reply carried no ${FRESHNESS_HEADER} header at all` }
  }
  /** @type {Record<string, string>} */
  const found = {}
  for (const part of text.split(';')) {
    const trimmed = part.trim()
    if (trimmed === '') continue
    const at = trimmed.indexOf('=')
    if (at === -1) return { ok: false, why: `"${trimmed}" in the ${FRESHNESS_HEADER} header is not a name and a value` }
    found[trimmed.slice(0, at).trim()] = trimmed.slice(at + 1).trim()
  }
  const verdict = found['verdict']
  if (verdict !== 'fresh' && verdict !== 'stale' && verdict !== 'unknown') {
    return {
      ok: false,
      why: `the ${FRESHNESS_HEADER} header says the code is "${String(verdict)}", which is not fresh, stale or unknown`,
    }
  }
  const staleForText = found['staleFor']
  if (staleForText === undefined) {
    return { ok: false, why: `the ${FRESHNESS_HEADER} header does not say how long it has been stale (no "staleFor=")` }
  }
  const graceText = found['grace']
  if (graceText === undefined || !/^\d+$/.test(graceText)) {
    return { ok: false, why: `the ${FRESHNESS_HEADER} header does not say the grace (no readable "grace=")` }
  }
  if (staleForText !== '-' && !/^\d+$/.test(staleForText)) {
    return { ok: false, why: `the ${FRESHNESS_HEADER} header says it has been stale for "${staleForText}", which is not a number of seconds` }
  }
  return {
    ok: true,
    reading: {
      verdict,
      staleFor: staleForText === '-' ? null : Number(staleForText),
      grace: Number(graceText),
    },
  }
}

/**
 * How long something has been stale, in the words a person reads.
 *
 * Written once because the banner says it and so does anything else that reports one. Whole seconds
 * up to a minute, then whole minutes, then whole hours: the reader is deciding whether to reload or
 * to go and look at a server, and neither decision turns on the difference between 4 and 5 seconds.
 *
 * @param {number} seconds
 * @returns {string}
 */
export function howLongStale(seconds) {
  const whole = Math.max(0, Math.floor(seconds))
  if (whole < 60) return `${String(whole)} second${whole === 1 ? '' : 's'}`
  const minutes = Math.floor(whole / 60)
  if (minutes < 60) return `${String(minutes)} minute${minutes === 1 ? '' : 's'}`
  const hours = Math.floor(minutes / 60)
  return `${String(hours)} hour${hours === 1 ? '' : 's'}`
}
