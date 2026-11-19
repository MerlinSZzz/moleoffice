// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHICH WORLD ANSWERED, WRITTEN ONE WAY AND READ ONE WAY.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion G3 of design/ground/ACCEPTANCE.md: *every reply says which world answered.* Every
 * reply from the API carries one header, `x-mole-office-world`, and this file is the only place
 * that header is written and the only place it is read.
 *
 * The state to prevent: a real API and a scratch API side by side, a browser still pointing at the
 * scratch database, and health checks that appear green. A reply from the wrong server looks
 * exactly like a reply from the right one, so the reply has to say.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIVE FACTS, AND WHY THESE FIVE
 * ---------------------------------------------------------------------------------------
 *
 *   db=        which database file answered, as an identity rather than a path (below)
 *   repo=      the checkout the answering code came from, absolute
 *   port=      the port that server was configured with
 *   head=      the commit that checkout was on, short
 *   standing=  canonical or scratch
 *
 * They are the five in `World` in src/shared/runtime.ts, which is what `worldNow()` reads and what
 * a resource row already carries. Nothing new is invented here: this is that shape on a wire.
 *
 * ---------------------------------------------------------------------------------------
 * THE OPTIONAL SIXTH KEY: THE DEVELOPMENT CHECKOUT
 * ---------------------------------------------------------------------------------------
 *
 * A stable office runs from its own checkout and serves the owner's development checkout, and it
 * says so with `dev=`, the absolute path of the development checkout it serves. It is a sixth key
 * and it is optional: a stable office writes it, every other office writes the header it always
 * wrote, and a header from an office that sends none is a whole header. It is NOT one of the five
 * facts, so `WORLD_FIELDS`, `factByFact`, `worldsDiffer` and `worldInWords` never read it: an old
 * reader ignores a key it was not told about, which is how this one travels to it safely. The
 * self-check is the one reader that uses it (src/config/the-self-check.mjs).
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE DATABASE IS AN IDENTITY AND NOT A PATH
 * ---------------------------------------------------------------------------------------
 *
 * A path is not an identity. The negative control this criterion is written for COPIES the
 * database and serves the copy, and a copy restored back over the original path would keep the
 * path while being a different file with different work in it. The declaration in
 * src/config/settings.mjs gives the database no id — it gives a path and nothing else — so there
 * is no id to take from it. So the id is worked out: the first 16 hex characters of the SHA-256 of
 * the absolute path and the file's creation time, written in src/server/lib/world.ts, which is the
 * only place it is computed. Creation time is what tells a copy from the file it was copied from;
 * the path is in the hash because two files created in the same instant at different paths are
 * still two files.
 *
 * The header carries `unknown` when the file could not be read. `unknown` is a real answer here
 * and never a guess: `GET /api/runtime` says why, in `database.problem` and `couldNotRead`.
 *
 * ---------------------------------------------------------------------------------------
 * THE ENCODING, AND WHY THERE IS ONE
 * ---------------------------------------------------------------------------------------
 *
 * A header value may hold only printable ASCII here, and one of the five values is a filesystem
 * path, which may hold anything at all. So each value is percent-encoded, and ONLY the characters
 * that would break the format or the wire are touched: `%`, `;`, and anything outside printable
 * ASCII. `/srv/mole-office` survives unchanged and stays readable in a terminal, which is
 * the whole point of a header a person is meant to be able to read.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS JAVASCRIPT
 * ---------------------------------------------------------------------------------------
 *
 * The same reason src/config/settings.mjs is, and it is written out in full there: one of the
 * callers is `tools/session-hook.mjs`, which Claude Code spawns with the bare word `node`, which
 * on this machine is v18.19.1 and cannot read TypeScript at all. The hook has to compare the world
 * that answered with the world the declaration calls canonical BEFORE it files anything, so it
 * needs this parser. A second copy of the format for the hook is the defect CLAUDE.md names at the
 * top of the file — one fact worked out in two places, free to disagree — and this project has
 * already paid for that once, with a hook whose built-in port went stale the day the port moved.
 *
 * The types are not given up: `// @ts-check` above and the JSDoc below are checked by `tsc`, and
 * every TypeScript caller gets the same types a `.ts` file would have given it.
 */

/** The one header name. Named like the other Mole Office headers: `x-mole-office-…`. */
export const WORLD_HEADER = 'x-mole-office-world'

/**
 * What a value says when the thing it names could not be read.
 *
 * It is never a substitute for a reading. A field that says `unknown` means nobody could answer,
 * and the reason is in `GET /api/runtime`'s `couldNotRead`, which is where reasons live.
 */
export const UNKNOWN = 'unknown'

/**
 * One world as it travels on a header: five strings, because a wire has no types.
 *
 * Everything is a string on purpose. A reader that turned `port` back into a number would be a
 * second interpretation of the same characters, and two interpretations can disagree. Comparing
 * worlds is comparing strings.
 *
 * @typedef {object} WorldOnTheWire
 * @property {string} database The database identity, 16 hex characters, or `unknown`.
 * @property {string} repository The checkout, absolute.
 * @property {string} port The API port this server was configured with, or `unknown`.
 * @property {string} head The commit, short, or `unknown`.
 * @property {string} standing `canonical` or `scratch`.
 * @property {string} [developmentCheckout] The development checkout a stable office serves, absolute; written as `dev`, and absent when the office names none.
 */

/**
 * The five fact keys, which are the keys of `WorldOnTheWire` that a fact has. The optional
 * `developmentCheckout` above is not one of them: no fact is compared about it.
 *
 * @typedef {'database' | 'repository' | 'port' | 'head' | 'standing'} AWorldFactKey
 */

/**
 * The five keys, in the order they are written, with the plain words for each.
 *
 * The plain words are what the banner and the session hook print. They are here rather than in the
 * banner because the hook prints them too, and a second list of names for the same five facts
 * would be free to disagree with this one.
 *
 * @type {readonly { key: AWorldFactKey, wire: string, what: string }[]}
 */
export const WORLD_FIELDS = [
  { key: 'database', wire: 'db', what: 'the database' },
  { key: 'repository', wire: 'repo', what: 'the checkout' },
  { key: 'port', wire: 'port', what: 'the port' },
  { key: 'head', wire: 'head', what: 'the commit' },
  { key: 'standing', wire: 'standing', what: 'whether it is the canonical stack' },
]

/**
 * Percent-encode the three sorts of character that cannot travel: the separator, the escape itself,
 * and anything outside printable ASCII.
 *
 * @param {string} value
 * @returns {string}
 */
function encodeValue(value) {
  let out = ''
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0
    out += ch === '%' || ch === ';' || code < 0x20 || code > 0x7e ? encodeURIComponent(ch) : ch
  }
  return out
}

/**
 * One world, as the header value.
 *
 * The five facts go in the order WORLD_FIELDS writes them. `dev=` follows them, only when the world
 * names a development checkout, as a stable office does: it is not one of the five facts, and an
 * office that names none writes the header it always wrote.
 *
 * @param {WorldOnTheWire} world
 * @returns {string}
 */
export function formatWorldHeader(world) {
  const facts = WORLD_FIELDS.map((field) => `${field.wire}=${encodeValue(world[field.key])}`).join('; ')
  const developmentCheckout = world.developmentCheckout
  return typeof developmentCheckout === 'string' && developmentCheckout !== '' ? `${facts}; dev=${encodeValue(developmentCheckout)}` : facts
}

/**
 * Read a header value back, or say why it could not be read.
 *
 * A REFUSAL RATHER THAN A GUESS. A header this cannot parse is not a world with some fields
 * missing — it is a reply from something that is not this product, or from a version of it that
 * says something else, and either way the caller has to be told rather than handed a half-built
 * answer. `tools/session-hook.mjs` refuses to file on one of these and the browser app draws its
 * banner, so both of them need the reason in words.
 *
 * @param {string | null | undefined} text
 * @returns {{ ok: true, world: WorldOnTheWire } | { ok: false, why: string }}
 */
export function parseWorldHeader(text) {
  if (text === null || text === undefined || text.trim() === '') {
    return { ok: false, why: `the reply carried no ${WORLD_HEADER} header at all` }
  }
  /** @type {Record<string, string>} */
  const found = {}
  for (const part of text.split(';')) {
    const trimmed = part.trim()
    if (trimmed === '') continue
    const at = trimmed.indexOf('=')
    if (at === -1) return { ok: false, why: `"${trimmed}" in the ${WORLD_HEADER} header is not a name and a value` }
    const wire = trimmed.slice(0, at).trim()
    const raw = trimmed.slice(at + 1).trim()
    try {
      found[wire] = decodeURIComponent(raw)
    } catch {
      return { ok: false, why: `the value of "${wire}" in the ${WORLD_HEADER} header is not readable: ${raw}` }
    }
  }
  /** @type {Partial<WorldOnTheWire>} */
  const world = {}
  for (const field of WORLD_FIELDS) {
    const value = found[field.wire]
    if (value === undefined) {
      return { ok: false, why: `the ${WORLD_HEADER} header does not say ${field.what} (no "${field.wire}=")` }
    }
    world[field.key] = value
  }
  // `dev=` is optional: an office from before it sends none, and a header without one is whole. An
  // empty value says nothing and is left out, as formatWorldHeader leaves it out.
  const developmentCheckout = found['dev']
  if (developmentCheckout !== undefined && developmentCheckout !== '') world.developmentCheckout = developmentCheckout
  return { ok: true, world: /** @type {WorldOnTheWire} */ (world) }
}

/**
 * Whether one fact says nothing that can be compared: `unknown`, which is what this header writes
 * for a fact that could not be read, or nothing at all.
 *
 * @param {string} value
 * @returns {boolean}
 */
export function isAnUnknownFact(value) {
  return value === UNKNOWN || value.trim() === ''
}

/**
 * THE FIVE FACTS OF TWO WORLDS, SIDE BY SIDE: the one place two worlds are compared.
 *
 * For each fact, in the order they are written: its plain words, both values, whether the two
 * values are the same words (`same`), and which side could not say it (`unknownTo`: null when both
 * could, otherwise 'expected', 'answered' or 'both').
 *
 * Two readers ask two questions of this, and each reads its answer from here:
 *   - `worldsDiffer` below asks WHICH WORDS DIFFER. The browser's banner uses it, and `unknown`
 *     on both sides is no difference, because the words did not change.
 *   - src/config/the-self-check.mjs asks WHAT IS SHOWN. A fact unknown to either side is shown
 *     neither equal nor different (invariant 5), so it reads `unknownTo` before `same`.
 * So the two differ in exactly one place, a fact that both sides say they do not know, and on
 * purpose. tests/two-worlds-are-compared-in-one-place.test.ts holds them to this.
 *
 * @param {WorldOnTheWire} expected
 * @param {WorldOnTheWire} answered
 * @returns {{ key: AWorldFactKey, what: string, expected: string, answered: string, same: boolean, unknownTo: null | 'expected' | 'answered' | 'both' }[]}
 */
export function factByFact(expected, answered) {
  return WORLD_FIELDS.map((field) => {
    const here = expected[field.key]
    const there = answered[field.key]
    const unknownHere = isAnUnknownFact(here)
    const unknownThere = isAnUnknownFact(there)
    /** @type {null | 'expected' | 'answered' | 'both'} */
    const unknownTo = unknownHere && unknownThere ? 'both' : unknownHere ? 'expected' : unknownThere ? 'answered' : null
    return { key: field.key, what: field.what, expected: here, answered: there, same: here === there, unknownTo }
  })
}

/**
 * Which of the five facts two worlds disagree about in their words, in the order they are written.
 *
 * An empty list means the same words answered. Every entry names the fact in plain words and
 * carries both values, because "the world changed" without the two values is a sentence somebody
 * has to go and investigate, and this is what the banner and the hook both print.
 *
 * It is the words view of `factByFact` above: `unknown` on both sides is no difference here. Whether
 * a world is shown to be the one expected is the self-check's question, which never takes an unknown
 * as equal.
 *
 * The key is on every entry as well as the plain words, so a reader can name the fact it reports.
 *
 * @param {WorldOnTheWire} expected
 * @param {WorldOnTheWire} answered
 * @returns {{ key: AWorldFactKey, what: string, expected: string, answered: string }[]}
 */
export function worldsDiffer(expected, answered) {
  return factByFact(expected, answered)
    .filter((fact) => !fact.same)
    .map((fact) => ({ key: fact.key, what: fact.what, expected: fact.expected, answered: fact.answered }))
}

/**
 * One world in one line, for a log or a terminal.
 *
 * @param {WorldOnTheWire} world
 * @returns {string}
 */
export function worldInWords(world) {
  return (
    `database ${world.database}, checkout ${world.repository}, port ${world.port}, ` +
    `commit ${world.head}, ${world.standing}`
  )
}
