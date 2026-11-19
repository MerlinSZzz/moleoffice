// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO IS ANSWERING AT A WORLD'S ADDRESS, AND THE ONE SENTENCE THAT SAYS IT HAS ENDED.
 *
 * Criterion P87's third part: a world whose address answers nothing is dead, and the row says why
 * in one plain sentence. There are exactly three answers and no fourth, because the world's own
 * identity travels on every reply as the `x-mole-office-world` header:
 *
 *   NOTHING ANSWERS at that address — the world has ended.
 *   SOMETHING ANSWERS AND IS THAT WORLD — it is alive and is left alone.
 *   SOMETHING ANSWERS AND IS ANOTHER WORLD — the port was taken by something else, so the world
 *     that had it has ended. The sentence names the world that is there now, because a row closed
 *     with "nothing answered" would be a sentence that is not true.
 *
 * WHY NOTHING ANSWERED IS THREE THINGS AND NOT ONE. A read can fail because nothing is listening
 * (`refused`), because it ran out of time (`timeout`), or for any other reason (`unreadable`). A
 * busy machine that holds its event loop looks exactly like a dead world to a reader that only
 * knows the read failed, so the distinction is reported rather than flattened. This reader only
 * names the failure.
 *
 * TWO RULES THAT ARE THE OFFICE TICK'S ALONE, NOT THIS FILE'S. `closeTheWorldsNothingIsServing` in
 * src/server/lib/office.ts skips the world whose database identity is the office's own, and closes
 * a world on a refused connection only on the second tick in a row. `tools/close-worlds-nobody-serves.mjs`
 * has neither rule: it is still one-shot, it still asks the office's own address, and it can still
 * close the home row by hand with `--close` on a busy office. That is a known gap named here and
 * left to its own piece. The three answers above are unchanged.
 *
 * ONE READER FOR BOTH CALLERS. `tools/close-worlds-nobody-serves.mjs` asks this by hand today, and
 * the office's own reminder sweep asks it every minute so a world that never reached the ledger
 * still dies. A second copy of the three answers written for the server would be the same rule in
 * two places, free to disagree about which worlds are alive — the defect CLAUDE.md names.
 *
 * IT IS PLAIN JAVASCRIPT because the tool is run by `node` without a TypeScript loader and the
 * server is run by `tsx`; a `.mjs` module is read by both.
 */

import { WORLD_HEADER, parseWorldHeader } from './world-header.mjs'
import { STAND_IN_HEADER } from './stand-in-header.mjs'

/** How long a world gets to answer for itself, on one ask. A world that needs longer is not answering. */
export const WORLD_ANSWER_WAIT_MS = 2000

/**
 * HOW MANY TIMES A SILENT ADDRESS IS ASKED BEFORE THE SILENCE IS REPORTED, and how long between.
 *
 * The tick below this reader already refuses to act on one silence. This is the same care one level
 * down, and it is here for the caller that has no ticks: `tools/close-worlds-nobody-serves.mjs` runs
 * once, by hand, and whatever this reader hands it is all it will ever know.
 *
 * On the night of 22 September 2026, while forty agents worked, the live office missed two-second
 * reads of its own worlds. A world that is really gone is silent twice a second apart and loses
 * nothing by being asked again; a world that is merely busy usually answers the second time.
 *
 * ONLY SILENCE IS ASKED AGAIN. A refused connection is not silence — the machine answered, and what
 * it said was that nothing is listening — so it is handed back on the first ask, and the tick's
 * count of refusals in a row keeps meaning ticks, not asks. Something that answers with a header
 * this cannot read has also answered, and is likewise not asked again.
 */
export const WORLD_ASKS = 2
export const WORLD_ASK_GAP_MS = 1000

/**
 * Ask one address who is there.
 *
 * @param {string} address
 * TWO THINGS MORE, FOR THE SELF-CHECK (src/config/the-self-check.mjs). An answer that came back says
 * the whole `world` it read, not only its database. Something that answered with no world this can
 * read also says `answeredWithoutAWorld: true`, because that is a reply and a failed read is not, and
 * the self-check tells the two apart. With `withHealth`, an answer also carries what the health check
 * said in its body: `ok`, the `wrong` sentences, and `holder`, what it said of the terminal holder (null
 * when it said nothing of one, as an office from before wave 13u). A body that cannot be read is `ok: false` with
 * the reason, never a guess that all is well. The office's own tick does not ask for the body.
 *
 * A STAND-IN THAT NAMES A REFUSAL CARRIES IT TOO (the supervisor's addition to round 12). The dev
 * supervisor's stand-in answers 503 with `refusal` in its body when it was started with
 * `--refusal=<code>` (tools/serve-dev-stand-in.mjs), and this hands that code back on the silence it
 * is read as: `refusal`. The window and the self-check need it to tell a refusal that the start
 * cannot fix from an answering office that is merely down (src/config/stable-tag.mjs).
 *
 * @param {string} address
 * @param {{ headers?: Record<string, string>, waitMs?: number, fetchImpl?: typeof fetch, asks?: number, gapMs?: number, withHealth?: boolean }} [options]
 * @returns {Promise<{ answering: false, why: string, failure: 'refused' | 'timeout' | 'unreadable', answeredWithoutAWorld?: true, refusal?: string } | { answering: true, database: string, why: string, world: import('./world-header.mjs').WorldOnTheWire, health?: { ok: boolean, wrong: string[], holder: { running: boolean, says: string } | null, updateWaiting?: true, version?: unknown } }>}
 */
export async function whoIsAt(address, options = {}) {
  const headers = options.headers ?? {}
  const waitMs = options.waitMs ?? WORLD_ANSWER_WAIT_MS
  const fetchImpl = options.fetchImpl ?? fetch
  const asks = Math.max(1, options.asks ?? WORLD_ASKS)
  const gapMs = options.gapMs ?? WORLD_ASK_GAP_MS
  /** @type {{ answering: false, why: string, failure: 'refused' | 'timeout' | 'unreadable', refusal?: string }} */
  let silence = { answering: false, why: `nothing answered at ${address}`, failure: 'unreadable' }
  for (let ask = 1; ask <= asks; ask += 1) {
    try {
      const res = await fetchImpl(`${address}/api/health`, { headers, signal: AbortSignal.timeout(waitMs) })
      // THE DEV SUPERVISOR'S STAND-IN IS A PAUSE, NOT AN ANSWER. It says no server is answering on the port
      // now (stand-in-header.mjs), so it is not "something else on this address" and it is not a dead
      // world either. It is read like silence: asked again after the gap, and handed back with its words.
      const standIn = res.headers.get(STAND_IN_HEADER)
      if (standIn !== null) {
        const said = /** @type {any} */ (await res.json().catch(() => null))
        silence = {
          answering: false,
          why: `the dev supervisor (process ${standIn}) holds ${address} and no server is answering on it: ${String(said?.error ?? 'it gave no reason')}`,
          failure: 'unreadable',
          // A REFUSAL IT NAMES IS CARRIED. Without this the window cannot tell a start that cannot
          // help from an office that is merely down.
          ...(typeof said?.refusal === 'string' ? { refusal: said.refusal } : {}),
        }
        if (ask < asks && gapMs > 0) await new Promise((wait) => setTimeout(wait, gapMs))
        continue
      }
      const said = parseWorldHeader(res.headers.get(WORLD_HEADER))
      // SOMETHING ANSWERED AND IS NOT A WORLD THIS CAN READ. That is an answer, so it is taken at
      // its word and not asked again.
      if (!said.ok) {
        return { answering: false, why: `something answered at ${address} but ${said.why}`, failure: 'unreadable', answeredWithoutAWorld: true }
      }
      const answered = { answering: /** @type {const} */ (true), database: said.world.database, why: `${address} answered as database ${said.world.database}`, world: said.world }
      return options.withHealth === true ? { ...answered, health: await whatTheHealthCheckSaid(res) } : answered
    } catch (err) {
      const failure = wayTheReadFailed(err)
      silence = { answering: false, why: whyTheReadFailed(address, failure, err), failure }
      // A REFUSED CONNECTION IS AN ANSWER, NOT A SILENCE. It goes back on the first ask, so the
      // tick's "refused twice in a row" keeps counting ticks a minute apart, not asks a second apart.
      if (failure === 'refused') return silence
      if (ask < asks && gapMs > 0) await new Promise((wait) => setTimeout(wait, gapMs))
    }
  }
  if (asks === 1) return silence
  const gap = gapMs === 1000 ? '1 second' : `${String(gapMs / 1000)} seconds`
  return { ...silence, why: `${silence.why}, asked ${String(asks)} times ${gap} apart` }
}

/**
 * THE HEALTH CHECK'S WORD FOR "A DATABASE UPDATE WAITS FOR THE OWNER'S PRESS" (round 58). An installed
 * office whose database is behind its code answers `ok: false` with this set to true, from the reduced
 * mode in src/server/lib/the-update.ts, and the window then opens the office's page, which offers the
 * update, instead of its own page saying the office is unhealthy.
 */
export const THE_UPDATE_WAITS = 'updateWaiting'

/**
 * WHAT A HEALTH CHECK'S BODY SAID: whether it said ok, and its sentences about what is wrong.
 *
 * Only a body that says `ok: true` is ok. A body that cannot be read, or that says neither, is not
 * ok, and the reason says which, so nothing unread is ever reported as healthy.
 *
 * The version the office says it runs goes back as `version` as the body sent it: a string, or null when its bundle
 * recorded none, or any other value it sent, which the window then does not compare. A body read with no such field
 * still leaves `version` out: an office older than the field answered.
 *
 * @param {Response} res
 * @returns {Promise<{ ok: boolean, wrong: string[], holder: { running: boolean, says: string } | null, updateWaiting?: true, version?: unknown }>}
 */
async function whatTheHealthCheckSaid(res) {
  /** @type {unknown} */
  let body
  try {
    body = await res.json()
  } catch (err) {
    return { ok: false, wrong: [`its health check's answer could not be read (${err instanceof Error ? err.message : String(err)})`], holder: null }
  }
  const said = /** @type {{ ok?: unknown, wrong?: unknown, terminalHolder?: unknown, version?: unknown }} */ (typeof body === 'object' && body !== null ? body : {})
  const wrong = Array.isArray(said.wrong) ? said.wrong.map(String) : []
  const told = /** @type {{ running?: unknown, says?: unknown }} */ (typeof said.terminalHolder === 'object' && said.terminalHolder !== null ? said.terminalHolder : {})
  const holder = typeof told.running === 'boolean' && typeof told.says === 'string' ? { running: told.running, says: told.says } : null
  const version = 'version' in said ? { version: said.version } : {}
  if (said.ok === true) return { ok: true, wrong, holder, ...version }
  if (wrong.length === 0) wrong.push('its health check did not say it was ok')
  if (/** @type {Record<string, unknown>} */ (said)[THE_UPDATE_WAITS] === true) return { ok: false, wrong, holder, updateWaiting: true, ...version }
  return { ok: false, wrong, holder, ...version }
}

/**
 * WHY A READ FAILED, in the three words the caller goes on.
 *
 * A REFUSAL is the only one that may close a world: nothing is listening at the address. A TIMEOUT
 * is the read running out of time or being aborted, and a busy machine looks exactly like a dead
 * world this way, so it proves nothing. UNREADABLE is everything else — a reset connection, a name
 * that would not resolve, a reply that carries no world header — and it is a failure to read rather
 * than a reading.
 *
 * THE ERROR AND EVERYTHING IT WAS CAUSED BY are read, because Node's fetch wraps the real reason: a
 * refused connection arrives as "fetch failed" with an ECONNREFUSED error underneath it.
 *
 * @param {unknown} err
 * @returns {'refused' | 'timeout' | 'unreadable'}
 */
function wayTheReadFailed(err) {
  /** @type {unknown[]} */
  const chain = []
  let at = err
  for (let depth = 0; at !== null && at !== undefined && depth < 6; depth += 1) {
    chain.push(at)
    at = /** @type {{ cause?: unknown }} */ (at).cause
  }
  const said = (key) => chain.map((one) => String((one && one[key]) || '')).join(' ')
  const codes = said('code')
  const names = said('name')
  const messages = said('message')
  if (/ECONNREFUSED/i.test(codes) || /ECONNREFUSED/i.test(messages)) return 'refused'
  if (/TimeoutError|AbortError/.test(names)) return 'timeout'
  if (/ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|UND_ERR_BODY_TIMEOUT/.test(codes)) return 'timeout'
  if (/timed?\s*out|timeout/i.test(messages)) return 'timeout'
  return 'unreadable'
}

/**
 * The plain sentence for a failed read, saying which of the three it was.
 *
 * A reader must be able to tell "did not answer in time" from "refused the connection" from
 * "answered as another database". The last of those is not here: it is answered by
 * `theSentenceSayingWhyTheWorldEnded` below.
 *
 * @param {string} address
 * @param {'refused' | 'timeout' | 'unreadable'} failure
 * @param {unknown} err
 * @returns {string}
 */
function whyTheReadFailed(address, failure, err) {
  if (failure === 'refused') return `nothing is listening at ${address}: the connection was refused`
  if (failure === 'timeout') return `nothing answered at ${address} in time: the read timed out`
  return `nothing answered at ${address} (${err instanceof Error ? err.message : String(err)})`
}

/**
 * WHETHER A ROW'S DYING SENTENCE SAYS A READ TIMED OUT.
 *
 * The office reads this to find the home row its own tick closed, so it can reopen it. The words
 * are matched rather than the row's reason being stored twice, and both spellings are read: the
 * sentence this file makes now, and the older one Node's own timeout message made.
 *
 * @param {string | null | undefined} because
 * @returns {boolean}
 */
export function saysAReadTimedOut(because) {
  if (because === null || because === undefined) return false
  const said = String(because).toLowerCase()
  return said.includes('timed out') || said.includes('timeout')
}

/**
 * ONE PLAIN SENTENCE SAYING WHY A WORLD WITH NOTHING SERVING IT HAS ENDED.
 *
 * The same words reach the tool's dry run and the office's own row, so a reader who compares them
 * is not left wondering whether two different things happened.
 *
 * @param {{ databaseIdentity: string, address?: string | null }} world
 * @param {{ answering: false, why: string, failure: string } | { answering: true, database: string, why: string }} who
 * @returns {string}
 */
export function theSentenceSayingWhyTheWorldEnded(world, who) {
  return who.answering
    ? `nothing serves this world any more: ${world.address ?? 'its address'} is answering for the database ${who.database}, not ${world.databaseIdentity}`
    : `nothing serves this world any more: ${who.why}`
}

/**
 * ONE PLAIN SENTENCE SAYING A WORLD ENDED BECAUSE ITS ADDRESS REFUSED THE CONNECTION TWICE.
 *
 * A single refusal is not proof: the world may be restarting or the machine may be busy. Two ticks
 * in a row with nothing listening is proof, and the sentence says both facts so a reader can tell
 * it from the timeout sentence above.
 *
 * @param {{ databaseIdentity: string, address?: string | null }} world
 * @returns {string}
 */
export function theSentenceSayingTheAddressRefusedTwice(world) {
  const address = world.address ?? 'its address'
  return (
    `nothing serves this world any more: the connection to ${address} was refused twice in a row, ` +
    'and nothing is listening there'
  )
}
