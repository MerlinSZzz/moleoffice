// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE HEADERS A PAGE ON ANOTHER ORIGIN IS ALLOWED TO READ, DECLARED ONCE.
 *
 * A browser hides every response header from a page's own JavaScript except a handful it deems safe,
 * unless the reply names the others in `access-control-expose-headers`. Nothing did, so a page on
 * another origin read no world header at all, and the check criterion G3 exists for was not drawing
 * a false banner — it was silently never running. Problem `a36N9Ivqf46H`.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A MODULE OF ITS OWN
 * ---------------------------------------------------------------------------------------
 *
 * Two places send these headers and they must not come to disagree. `src/server/index.ts` registers
 * the CORS plugin, which puts them on every ordinary reply. `src/server/api/events.ts` calls
 * `reply.hijack()` — that takes the reply out of Fastify's hands, so no hook of any kind runs on it
 * — and writes its headers itself. A stream whose headers said something different from every other
 * reply would be a page that can read the world on a record and not on the live channel, which is
 * the half a reader has open the longest.
 *
 * A JavaScript file rather than TypeScript, like the rest of `src/config`, so that anything can read
 * it without a build step.
 */

import { aPageOnThisMachine } from './settings.mjs'
import { CALL_ID_HEADER } from './call-header.mjs'
import { FRESHNESS_HEADER } from './freshness-header.mjs'
import { VERSION_TAG_HEADER } from './version-tag-header.mjs'
import { HOME_MOVED_HEADER } from './visit-headers.mjs'
import { WORLD_HEADER } from './world-header.mjs'

/**
 * The five, in the order they were added. Each is declared beside the code that sets it, so this
 * list cannot come to disagree with what is sent. The version tag joined on 12 October 2026, so that
 * a plugin's page can be told the tag of what it read (wave 13x round 15).
 *
 * @type {readonly string[]}
 */
export const HEADERS_A_PAGE_MAY_READ = [WORLD_HEADER, FRESHNESS_HEADER, CALL_ID_HEADER, HOME_MOVED_HEADER, VERSION_TAG_HEADER]

/**
 * EVERY METHOD A PAGE ON ANOTHER ORIGIN MAY USE.
 *
 * A browser asks before sending anything but a plain GET or POST — the preflight — and the reply
 * says which methods are allowed. A method missing from this list is refused before the request is
 * sent, so the page sees a failure with no status and no body and the server never hears about it.
 *
 * IT WENT WRONG EXACTLY THAT WAY. `PUT` was left off while every page call went through a proxy on
 * the page's own origin, where CORS never applied, so nothing failed. The day the page began calling
 * the API's own door, every write through `PUT` was refused by the browser: seventeen tests across
 * five files, all of them about saving something a person had typed, and none of them naming CORS.
 *
 * `tests/a-page-on-another-origin.test.ts` fails when a route uses a method this omits, which is what
 * keeps this list and the routes from drifting apart. The list cannot be derived: the CORS plugin is
 * registered before any route exists.
 *
 * @type {readonly string[]}
 */
export const METHODS_A_PAGE_MAY_USE = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']

/**
 * A PAGE ON ANOTHER ORIGIN MAY SEND ITS COOKIE, on every reply and on the event stream alike.
 * Criterion P83, point 2.
 *
 * A browser attaches a cookie to a request for another origin only when the page asks for it, and
 * then refuses the reply unless it carries `access-control-allow-credentials: true`. The pairing
 * cookie is how a paired browser's key reaches the office, so without this header a paired page on
 * another origin cannot prove who it is. That is the shape `npm run dev` has: Vite serves the page on
 * one port and the API answers on another.
 *
 * IT LETS NO NEW PAGE IN. The origins admitted are still only the ones `mayAPageOnThisOriginRead`
 * admits, and the reply names that one origin rather than `*`, which is what the browser demands.
 *
 * ONE RULE, READ IN TWO PLACES. `src/server/index.ts` passes it to the CORS plugin as `credentials`.
 * `whatToTellAPageOnAnotherOrigin` below writes the header for the event stream, whose reply no hook
 * reaches. Until 27 September 2026 the stream wrote the header itself, in
 * `src/server/api/events.ts`. `tests/the-stream-and-every-reply-allow-a-cookie-alike.test.ts` fails
 * when the stream and an ordinary reply disagree.
 *
 * @type {boolean}
 */
export const A_PAGE_MAY_SEND_ITS_COOKIE = true

/**
 * The CORS headers a reply owes a page on another origin, or nothing at all.
 *
 * NOTHING AT ALL IS AN ANSWER, and it is the right one twice: for a caller that sent no `Origin` —
 * curl, a tool, an agent, anything that is not a page — and for a page on an origin this
 * installation does not declare. In the second case the browser refuses the reply, which is what
 * `originsAPageMayBeOn` is for.
 *
 * IT IS FOR A REPLY THAT WRITES ITS OWN HEADERS. Everything else gets these from the CORS plugin,
 * which reads the same list of origins, this same list of headers and the same cookie rule.
 *
 * @param {string | undefined} origin The `Origin` header the request carried, if any.
 * @param {readonly string[]} originsAllowed What `originsAPageMayBeOn` says for this installation.
 * @returns {Record<string, string>}
 */
export function whatToTellAPageOnAnotherOrigin(origin, originsAllowed) {
  if (origin === undefined || !mayAPageOnThisOriginRead(origin, originsAllowed)) return {}
  return {
    'access-control-allow-origin': origin,
    // WHICH REPLY IS FOR WHICH ORIGIN. Without it a cache could hand a reply made for one origin to
    // a page on another, and the page would be refused for a reason nothing on it explains.
    vary: 'Origin',
    'access-control-expose-headers': HEADERS_A_PAGE_MAY_READ.join(', '),
    ...(A_PAGE_MAY_SEND_ITS_COOKIE ? { 'access-control-allow-credentials': 'true' } : {}),
  }
}

/**
 * MAY A PAGE ON THIS ORIGIN READ THIS INSTALLATION'S REPLIES? One answer, asked in two places.
 *
 * `src/server/index.ts` asks it in the CORS plugin's callback, for every ordinary reply.
 * `src/server/api/events.ts` asks it through `whatToTellAPageOnAnotherOrigin` above, because a
 * hijacked reply gets no hook of any kind and has to write its own headers. Until 4 September the
 * two disagreed: the plugin allowed a page anywhere on this machine and the stream allowed only the
 * declared origins, so a page that had walked into another world could read every record and lost
 * its live channel with nothing on screen saying why. Problem `PjlpSf-hizZA`.
 *
 * NO ORIGIN IS NOT A PAGE. curl, a tool and an agent send none, and there is nothing to allow or
 * refuse; the caller above turns that into no headers rather than into a refusal.
 *
 * @param {string | undefined} origin
 * @param {readonly string[]} originsAllowed What `originsAPageMayBeOn` says for this installation.
 * @returns {boolean}
 */
export function mayAPageOnThisOriginRead(origin, originsAllowed) {
  if (origin === undefined) return true
  return originsAllowed.includes(origin) || aPageOnThisMachine(origin)
}
