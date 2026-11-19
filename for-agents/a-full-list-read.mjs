// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * READ A LIST DOOR'S FULL ANSWER FROM THIS CHECKOUT OR FROM AN OLDER OFFICE.
 *
 * The list doors GET /api/records, GET /api/messages and GET /api/attention answer narrow by
 * default: a caller that needs whole records asks `?shape=full`, and the attention answer's
 * `?shape=full` sends its lists as pages, each with a link to the next. A caller that needs whole
 * messages asks `?full=1`, and the session hook asks its search `?shape=hook`, which is narrower
 * still. An office of an older version knows none of these words, and its default is the whole
 * answer. Its query schema is strict, so it refuses the new word with a 400.
 *
 * SO THE RULE IS ONE RULE: ask the new way; if the answer is a 400, retry the same read once with
 * that one word taken out, and accept the older office's whole answer. A cut or unreadable answer
 * is the caller's to refuse by name — this file never builds a record or a message out of a narrow
 * one, and never guesses what a missing field said.
 *
 * The two functions differ only in what the caller passes: `readAFullList` takes any reader that
 * answers `{ status }`, and `fetchAFullList` takes a fetch implementation.
 */

/** The one query pair each list door adds when it is asked for the answer it needs. */
const THE_FULL_WORDS = new Set(['shape=full', 'full=1', 'shape=hook'])

/** The same request with `shape=full`, `full=1` or `shape=hook` taken out, and every other pair left as it was. */
export function withoutTheFullAsk(path) {
  const at = path.indexOf('?')
  if (at === -1) return path
  const kept = path
    .slice(at + 1)
    .split('&')
    .filter((pair) => !THE_FULL_WORDS.has(pair))
  return kept.length === 0 ? path.slice(0, at) : `${path.slice(0, at)}?${kept.join('&')}`
}

/** One read of a full list: the new ask, or an older office's answer after one retry without it. */
export async function readAFullList(ask, path) {
  const first = await ask(path)
  if (first?.status !== 400) return first
  return ask(withoutTheFullAsk(path))
}

/** The same rule for a caller that reads with `fetch`: the first reply, or one retry without the new word. */
export async function fetchAFullList(fetchImpl, url, init) {
  return readAFullList(async (one) => fetchImpl(one, init), url)
}
