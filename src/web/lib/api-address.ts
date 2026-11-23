// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE THIS PAGE'S API IS: the host it was served from, and the port it was told.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE, IN ONE SENTENCE
 * ---------------------------------------------------------------------------------------
 *
 * The API is the Mole Office on the machine that served this page. So the host comes out of the
 * address bar — it is never written down anywhere — and only the port is told, by whoever served
 * the page. Criterion R1 of `design/ground/ACCEPTANCE.md` section 7: *the page reads the API address
 * from where it was served, never from a guess.*
 *
 * IN A BUILD THERE IS NOTHING TO TELL. Fastify serves the built page itself, on the API's own port,
 * so the page's own origin is the API. `apiPortInDevelopment` is null there and this returns
 * `location.origin`, which is the same answer read off the page rather than declared.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS NOT JUST A PATH, WHICH IS WHAT IT USED TO BE
 * ---------------------------------------------------------------------------------------
 *
 * Every request used to be sent to `/api/…`, and in development Vite proxied that to
 * `http://127.0.0.1:<api port>`. The page worked. What was lost was who was calling: the API saw
 * every browser call arrive on its loopback door, from this computer, whichever machine the browser
 * was really on.
 *
 * Two things followed, and the second is the worse one. A browser opened from another machine was
 * never named in *Machines that reached it from somewhere else* — measured on 4 September 2026 by
 * the seventh verifier, who held a page open on the address for other machines through the whole of
 * the human act and watched the count stay where it was. And a request from that machine arrived
 * stamped *this machine*, so it was given the authority of somebody sitting at this keyboard: the
 * acts Mole Office keeps on this machine were not refused to it. Problem `MqQjiJIdjK4a`.
 *
 * Calling the API's own door fixes both at once, and it needs nothing new to be trusted: the address
 * is the peer on the socket, which the caller cannot write.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS A CROSS-ORIGIN CALL IN DEVELOPMENT, AND THAT IS ALREADY PROVIDED FOR
 * ---------------------------------------------------------------------------------------
 *
 * A page on port 5173 calling the API on MOLE_OFFICE_PORT is a different origin, so the browser
 * applies CORS. The API takes the origins of its own pages and, while it is not built for production,
 * the dev server's (src/server/lib/an-origin-that-is-not-this-office.ts), and it exposes the headers
 * this app reads off a reply. Criterion R2 built that: the API names the headers this app reads in every
 * reply, so a page on another origin can read them, and a page on the address for other machines has been
 * reading its world header across origins since.
 */
/**
 * THE PORT IS HANDED IN, NOT IMPORTED HERE, and that is the same rule `src/web/lib/world.ts` and
 * `src/web/pages/RuntimePage.tsx` follow about the served stamp.
 *
 * The value comes out of `virtual:mole-office-api`, a module Vite makes as it serves the page. A
 * file that imports one of those cannot be loaded by anything but Vite, and this file is reached
 * from `src/web/api.ts`, which two hundred tests import under plain Node. So the importing is done
 * by `src/web/lib/api-port.ts`, which the app's entry loads and nothing else does.
 *
 * `undefined` MEANS NOBODY HAS SAID, and it is not the same as null. Null is somebody saying "this
 * page came out of a build, so its own origin is the API". Undefined is the entry having failed to
 * tell this file anything, and the answer to that is to stop rather than to guess an address: a
 * guess would be the page quietly talking to whoever served it, which is the fault problem
 * `MqQjiJIdjK4a` was.
 */
let thePort: number | null | undefined = undefined

/**
 * Say which port the API this page talks to is on, or null because the page's own server is the API.
 *
 * Called once, by `src/web/lib/api-port.ts`, before the page draws anything.
 */
export function theApiIsOnPort(port: number | null): void {
  thePort = port
}

/**
 * THE HOST THIS PAGE WAS SERVED FROM, which is how it reached the office.
 *
 * It decides which of a world's two addresses will reach it: a page on loopback is on the computer
 * the worlds run on; a page on anything else came from another machine and needs the door that world
 * opens for one. `theAddressToReachAWorldBy` in src/shared/worlds.ts has the rule and the account of
 * problem `5mG-KxUAXObJ`.
 *
 * AN EMPTY STRING WHEN THERE IS NO ADDRESS TO READ, exactly as `theApiThisPageTalksTo` answers, and
 * for the same reason: nothing outside a browser was served by anybody, and a host guessed here
 * would decide a world's address on a guess. An empty host is not loopback, so a page that cannot
 * say where it is gets the answer for another machine — the cautious one of the two.
 */
export function thisPageIsOn(): string {
  const at = typeof window === 'undefined' ? undefined : (window.location as Partial<Location> | undefined)?.hostname
  return typeof at === 'string' ? at : ''
}

/**
 * The origin this page's API answers on, worked out now rather than remembered.
 *
 * `new URL` rather than joining strings, because an IPv6 host is written with brackets in an address
 * and `location.hostname` gives it without them. Setting the port on a parsed URL and reading its
 * origin back is the one way that is right for every kind of host.
 */
export function theApiThisPageTalksTo(): string {
  /**
   * NO ADDRESS TO READ MEANS NO ADDRESS IS INVENTED, AND THE PATH STANDS ALONE.
   *
   * This app runs in a browser, where `window.location.href` is always there. Two things that are
   * not a browser reach this code, and neither has an address: plain Node, which two hundred tests
   * use to import `src/web/api.ts` and drive it against a stand-in for `fetch`, and the small
   * hand-made `window` a dozen of those tests install so that the module's own `localStorage` reads
   * work — it carries a `location` with a hash and a search and nothing else. Neither was served by
   * anybody, so there is no host to read and none is guessed.
   *
   * IT CANNOT SILENTLY REACH A REAL SERVER. Node's own `fetch` refuses a path — `Failed to parse
   * URL from /api/records` — so anything outside a browser that really tried to call would fail
   * loudly rather than reaching the wrong Mole Office. That is what makes this a true answer rather
   * than a convenient one.
   */
  const servedAt =
    typeof window === 'undefined' ? undefined : (window.location as Partial<Location> | undefined)?.href
  if (typeof servedAt !== 'string' || servedAt === '') return ''
  if (thePort === undefined) {
    throw new Error(
      'Mole Office does not know where its API is. Nothing told this page which port to call, so it will not ' +
        'guess one: a guess would send every request to whoever served the page. The app entry is what says it, ' +
        'by loading src/web/lib/api-port.ts.',
    )
  }
  const at = new URL(servedAt)
  // A BUILT PAGE IS SERVED BY THE API ITSELF, so its own port is the answer and nothing is changed.
  if (thePort !== null) at.port = String(thePort)
  return at.origin
}

/**
 * One API path turned into the whole address to call.
 *
 * Every request this app makes goes through here, so there is one place the joining happens and one
 * place to read when somebody asks where the calls are going.
 */
export function theApiUrlFor(path: string): string {
  return `${theApiThisPageTalksTo()}${path}`
}
