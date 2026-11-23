// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PRESS THAT GIVES A BROWSER A KEY TAKES A REQUEST FROM A PAGE OF THIS OFFICE, OR FROM NO PAGE, AND NO OTHER.
 *
 * The pairing press, the ask door and the move door set a browser's cookie half and answer its header half. A page on
 * another site can make the browser send a form or a fetch to any of them, and the browser attaches what it holds. So
 * the three doors read the two headers the browser itself writes and a page cannot set: `Origin` and `Sec-Fetch-Site`.
 *
 * - An `Origin` must be absent or one the Origin check takes as this office's (./an-origin-that-is-not-this-office.ts),
 *   which decided it once for this request. `null` is not absent: a sandboxed frame and a file page send it, and
 *   neither is a page of this office.
 * - `Sec-Fetch-Site` may be absent, `none` (the person typed or opened the address) or `same-origin`. `same-site` is
 *   taken only when this process is not production and the page is on the dev server, where Vite serves the page on
 *   one port and the office answers on another. `cross-site` and every other value are refused.
 *
 * NO HEADER IS NOT A PAGE. Node's fetch, curl and a tool send neither, and nothing a page can do removes them, so a
 * request with neither is taken here and proved by what the door itself asks.
 *
 * A refusal sets no cookie, ends no cookie, answers no half and issues no credential, because it is thrown before the
 * door does any of those.
 */
import type { FastifyRequest } from 'fastify'
import { sayInEnglish } from '@shared/i18n.ts'
import { settings, theDevServersOrigins } from '../../config/settings.mjs'
import { oneHeader } from '../db/the-key-on-this-request-was-made-for-a-run.ts'
import { aPageThatIsNotThisOfficesSentIt } from './an-origin-that-is-not-this-office.ts'
import { PanelError } from './panel-error.ts'

/** The two values of `Sec-Fetch-Site` that say the request came from no other page. */
const FROM_THIS_ORIGIN_OR_NO_PAGE: readonly string[] = ['none', 'same-origin']

/** Refuse a press another site's page sent. `production` is whether this process serves the built page itself. */
export function refuseAPressAnotherSiteSent(req: FastifyRequest, production: boolean): void {
  const origin = oneHeader(req.headers.origin)
  const site = oneHeader(req.headers['sec-fetch-site'])
  if (aPageThatIsNotThisOfficesSentIt(req)) throw aPressFromAnotherSite()
  if (site === undefined || FROM_THIS_ORIGIN_OR_NO_PAGE.includes(site)) return
  if (site === 'same-site' && !production && origin !== undefined && theDevServersOrigins(settings()).includes(origin)) return
  throw aPressFromAnotherSite()
}

function aPressFromAnotherSite(): PanelError {
  return new PanelError(sayInEnglish('server.aPressFromAnotherSite'), 403, undefined, undefined, undefined, { code: 'aPressFromAnotherSite', values: {} })
}
