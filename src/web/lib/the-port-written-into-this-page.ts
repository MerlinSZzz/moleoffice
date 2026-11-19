// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE API'S PORT, WRITTEN INTO THIS PAGE BY WHOEVER SERVED IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THERE IS A THIRD WAY OF SAYING IT
 * ---------------------------------------------------------------------------------------
 *
 * Criterion R1 of `design/ground/ACCEPTANCE.md` section 7: *the page reads the API address from
 * where it was served, never from a guess.* Three servers serve this page, and each says where the
 * API is in the way it can:
 *
 *   · Vite, in development, serves a module with the number in it. `vite.config.ts` holds that
 *     plugin and `./api-port.ts` is the one file that imports the module.
 *   · Fastify, serving a build, IS the API, so the page's own origin is the answer and there is
 *     nothing to say. The module carries null there.
 *   · A server handing out a built page on a port of its own is neither. It did not build the page,
 *     so it cannot put anything in the module, and it is not the API, so its own origin is the
 *     wrong answer. It writes the port into the page it serves, and this reads it.
 *
 * The third one is `liveApp` in tests/helpers.ts: every browser test gets its own API on its own
 * port, and one page built once for the whole run, so the port cannot be known until the page is
 * handed over.
 *
 * ---------------------------------------------------------------------------------------
 * NO TAG IS NOT A FAILURE, AND A TAG THAT IS NOT A PORT IS
 * ---------------------------------------------------------------------------------------
 *
 * No tag is the ordinary case — it is every page Vite and Fastify serve — and it means nobody wrote
 * a port into this page, so the caller keeps what its own server told it.
 *
 * A tag that is there and is not a port is refused rather than ignored. Somebody meant to say where
 * the API is and said something else; carrying on would leave the page calling whoever served it,
 * which is the fault problem `MqQjiJIdjK4a` was, arriving by a new road.
 */

/** The name of the tag. One spelling, read here and written by whoever serves the page. */
export const THE_API_PORT_TAG = 'mole-office-api-port'

/**
 * The API port written into this page, or null because nobody wrote one.
 *
 * @param where the document to read, for a test that has no browser. The page's own by default.
 */
export function theApiPortWrittenIntoThisPage(
  where: Pick<Document, 'querySelector'> | undefined = typeof document === 'undefined' ? undefined : document,
): number | null {
  if (where === undefined) return null
  const said = where.querySelector(`meta[name="${THE_API_PORT_TAG}"]`)?.getAttribute('content') ?? null
  if (said === null) return null
  const port = Number(said)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      `Mole Office was served with an API port of "${said}", which is not a port. Whoever served this page ` +
        'wrote that into it. The page will not guess an address in its place, because a guess would send every ' +
        'request to whoever served the page.',
    )
  }
  return port
}
