// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WRITE A WEBSITE COULD SEND IS REFUSED BEFORE ANY DOOR.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * While the key window is open, the office takes a request from this machine with no key as the person. A page on any
 * website the person has open can make the browser send some requests without asking the office first: a POST with no
 * body, a form, or a GET from an image tag. The page cannot read the answer, but the office would already have done
 * what was asked.
 *
 * Such a request cannot carry a header of the office's own, or a JSON body, without a preflight. The office answers
 * no preflight from a website elsewhere: the CORS registration in src/server/index.ts gives an access-control-allow-origin
 * only to the origins the Origin check in src/server/lib/an-origin-that-is-not-this-office.ts takes. So this rule rests on
 * that registration, and a request that carries either is one a website could not have sent.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT CARRIES THE OFFICE'S MARK
 * ---------------------------------------------------------------------------------------
 *
 * A header whose name starts with `x-mole-office-`, or a Content-Type whose media type is exactly application/json.
 * The media type is the text before the first `;`, trimmed and in lower case, so `application/json; charset=utf-8`
 * and `Application/JSON` carry it, and `text/plain; application/json` does not. `carriesTheOfficesMark` below is the
 * one place this is worked out.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH REQUESTS MUST CARRY IT
 * ---------------------------------------------------------------------------------------
 *
 * Every request whose method is not GET, HEAD or OPTIONS, a request no door answers included. A GET, HEAD or
 * OPTIONS only when its route declares that it changes something, always or by its query: `itChangesSomething` in
 * ./route.ts. Fastify gives a GET route's HEAD the GET's declaration. The rule is the same with the key window open
 * or closed.
 *
 * Every request a listener carried is checked, which is every request with an arrival (`stampArrival` in ./http.ts).
 * It is the request hook after the Host check, so a request with a Host the office does not answer to gets the Host
 * check's answer, and for a refused request no later request hook and no handler runs.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE REFUSAL SAYS
 * ---------------------------------------------------------------------------------------
 *
 * 403, with the code writeWithoutTheOfficesMark and no values. The words say the office changes nothing for such a
 * request, and that a program writing to the office sends one of the two. The private login door's error handler
 * gives its own code in place of this one, with the same status.
 *
 * EACH REFUSAL IS ONE WARN LINE IN THE SERVER'S LOG, naming the method and the route's pattern. It never holds the
 * URL, the query, the Host, the Origin or any header's value, which are words a website chose.
 */

import type { IncomingHttpHeaders } from 'node:http'
import type { FastifyInstance, FastifyRequest } from 'fastify'

import { arrivalOf } from '@shared/arrival-of.ts'
import { sayInEnglish } from '@shared/i18n.ts'

import { PanelError } from './panel-error.ts'
import type { RouteDeclaration } from './route.ts'

/** The start of the name of every header of the office's own. Node gives a header's name in lower case. */
const THE_OFFICES_OWN_HEADER = 'x-mole-office-'

/** The methods that change nothing unless their route declares that they do. */
const ONLY_READS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Whether a request's headers carry the office's mark: a header of its own, or a JSON body. */
export function carriesTheOfficesMark(headers: IncomingHttpHeaders): boolean {
  if (Object.keys(headers).some((name) => name.startsWith(THE_OFFICES_OWN_HEADER))) return true
  const type = headers['content-type']
  if (type === undefined) return false
  const end = type.indexOf(';')
  return (end === -1 ? type : type.slice(0, end)).trim().toLowerCase() === 'application/json'
}

/** Whether the request must carry the mark: by its method, or by what its route declares. */
function needsTheMark(req: FastifyRequest): boolean {
  if (!ONLY_READS.has(req.method)) return true
  const config: unknown = req.routeOptions?.config
  if (typeof config !== 'object' || config === null) return false
  const declared = (config as Pick<RouteDeclaration, 'changesSomething'>).changesSomething
  if (declared === undefined) return false
  return declared === true || declared(req.query as Readonly<Record<string, unknown>>)
}

/** The one line a refusal writes in the server's log. A request no door answers has no pattern. */
export function aRefusalsLogLine(method: string, pattern: string | undefined): string {
  return `A ${method} request without the office's mark was refused. Its route: ${pattern ?? 'none'}.`
}

/** Refuse every request a listener carried that must carry the office's mark and does not. */
export function refuseAWriteWithoutTheOfficesMark(app: FastifyInstance): void {
  app.addHook('onRequest', async (req) => {
    // A request with no arrival passes because no listener carried it, so no browser could have sent it: it was made in
    // the office's own process, or it came on a socket no listener stamped, which `refuseAnUnclassifiedDoor` in
    // ./http.ts refuses after this hook.
    if (arrivalOf(req) === undefined) return
    if (!needsTheMark(req) || carriesTheOfficesMark(req.headers)) return
    req.log.warn(aRefusalsLogLine(req.method, req.routeOptions?.url))
    throw new PanelError(sayInEnglish('server.writeWithoutTheOfficesMark'), 403, undefined, undefined, undefined, {
      code: 'writeWithoutTheOfficesMark',
      values: {},
    })
  })
}
