// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REQUEST WHOSE ORIGIN IS NOT THIS OFFICE'S IS REFUSED, AND TOUCHES NOTHING.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * A browser sends an `Origin` header to say where the page that made a request was served. Until SEC-2 the office
 * answered a page on any port of 127.0.0.1 or localhost with leave to send its cookie, and it still served a request
 * from an origin it did not take: only the browser hid the answer from the page. A page on another site may send a
 * plain POST with no preflight, so the office did the write before the browser hid the answer. Now a request whose
 * Origin is not one of this office's own is refused before any door, and its answer carries no leave to read it.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH ORIGINS ARE THIS OFFICE'S
 * ---------------------------------------------------------------------------------------
 *
 * ONE LIST WITH THE HOST CHECK (SEC-2's design, item 6). `isAPageOfThisOffice` in ./a-host-that-is-not-this-office.ts
 * says which scheme, name and port are a page of this office, from the names the Host check takes.
 *
 * THE DEV SERVER, ONLY WHILE THE OFFICE IS NOT BUILT FOR PRODUCTION. Under `npm run dev` Vite serves the page on its
 * own port and the page calls the API on another, so `theDevServersOrigins` in src/config/settings.mjs is the page's
 * origin there. A built office serves its page itself, and no dev server is there.
 *
 * NO OTHER WORLD'S ORIGIN, on the live office (the starter's decision on worlds). A page of another world on this
 * machine is another program's page, and a cookie goes to every port of its host.
 *
 * A VISITED WORLD TAKES ONLY THE OFFICE'S OWN PAGES, EXACTLY, WITHOUT CREDENTIALS (SEC-2's design, items 2 and 6). A
 * page on a trip sends its calls to the world it visits, from the origin of the office that served it. The office writes
 * the exact origins of its own pages into its mirror, made from the names its Host check takes
 * (`theOriginsOfThisOfficesPages` in ./a-host-that-is-not-this-office.ts). A world that is not the office takes a page's
 * origin only when it is exactly on that list: never a pattern, and never another world's address. Its answer names that
 * one origin and gives no leave to send a cookie, and the page sends neither half there (src/web/lib/visiting.ts). With
 * no list, because there is no mirror, it cannot be read, or the office wrote none in it, the world takes no page's
 * origin. The office itself takes no such origin. The key settings door and the pairing press take none on any world.
 *
 * ---------------------------------------------------------------------------------------
 * NO ORIGIN, AND AN ORIGIN OF NULL
 * ---------------------------------------------------------------------------------------
 *
 * NO ORIGIN IS NOT A FOREIGN PAGE (item 5). The desktop apps, agents with their keys, the sandboxes, curl and a tool
 * send none, and they go on as before. CORS adds nothing to their answers.
 *
 * AN ORIGIN OF NULL IS NEVER MISSING (item 5). A sandboxed frame and a page opened from a file send it, and neither is
 * a page of this office. ONE DOOR TAKES IT: a plugin page's own files (`plugins.files`, src/server/api/plugins.ts). A
 * plugin page runs in a sandboxed frame, whose origin is null, and its scripts and fonts are fetched with that origin.
 * The files are the plugin's own and carry nothing of the office, so that door answers any origin itself and CORS adds
 * nothing, no leave to send a cookie included.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH REQUESTS ARE CHECKED
 * ---------------------------------------------------------------------------------------
 *
 * The standing of every request's Origin is decided here, once, and kept for the request. The CORS answer in
 * src/server/index.ts, the two streams that write their own headers, the key settings door and the pairing press all
 * read that one decision.
 *
 * A REQUEST A LISTENER CARRIED IS REFUSED here when its Origin is not this office's. A request with no arrival
 * (`stampArrival` in ./http.ts) is not refused here, as the Host check does not refuse it: it was built in-process and no
 * page sent it. Its Origin is still judged, so CORS gives it nothing and a door that asks still refuses it.
 *
 * It is the request hook right after the Host check, so for a refused request no other request hook and no handler
 * runs, the CORS answer included, and nothing is written for it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE REFUSAL SAYS
 * ---------------------------------------------------------------------------------------
 *
 * 403, with the code `originIsNotThisOffice`. The words say nothing was done and never repeat the Origin, which is words
 * a stranger chose.
 *
 * EACH REFUSAL IS ONE WARN LINE IN THE SERVER'S LOG. On a world that could not read the office's list of its pages,
 * the line says so, with the kind of the Origin. Otherwise, when the Origin is the exact origin of a live world this
 * world can name, the line names that world's kind and nothing else. Otherwise it names the kind of the Origin:
 * loopback, a number, a name, null, or unreadable when it is no origin a browser writes. The line never holds the
 * Origin.
 */

import { isIP } from 'node:net'
import type { FastifyInstance, FastifyRequest } from 'fastify'

import { arrivalOf } from '@shared/arrival-of.ts'
import { sayInEnglish } from '@shared/i18n.ts'
import type { Mirror, World, WorldKind } from '@shared/worlds.ts'

import { settings, theDevServersOrigins } from '../../config/settings.mjs'
import { whatToTellAPageOnAnotherOrigin } from '../../config/what-a-page-may-read.mjs'
import { isAPageOfThisOffice } from './a-host-that-is-not-this-office.ts'
import { theOperationThisRouteDeclared } from './http.ts'
import { readTheMirror, theMirrorThisWorldMayRead, theOfficeIsInThisDatabase, worldsHere } from './office.ts'
import { PanelError } from './panel-error.ts'

/** The loopback names, without brackets and in lower case, as the log line tells them apart. */
const LOOPBACK_NAMES: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '::1'])

/** An origin as a browser writes it: http or https, a name or a bracketed IPv6 address, an optional port. Lower case. */
const AN_ORIGIN = /^(https?):\/\/(\[[0-9a-f.:]*:[0-9a-f.:]*\]|[a-z0-9.-]+)(?::(\d{1,5}))?$/

/** The one door that takes an Origin of null, by the operation its route declares. */
const THE_PLUGIN_FILES_DOOR = 'plugins.files'

/** What a refused Origin was, as its log line names it. */
export type TheKindOfAnOrigin = 'loopback' | 'number' | 'name' | 'null' | 'unreadable'

/** Every kind, so a reader can know every line a refusal of an Origin may write. */
export const EVERY_KIND_OF_ORIGIN: readonly TheKindOfAnOrigin[] = ['loopback', 'number', 'name', 'null', 'unreadable']

/** The one line a refusal writes in the server's log when the Origin is no world's. It never holds the Origin. */
export function aRefusalsLogLine(kind: TheKindOfAnOrigin): string {
  return `The Origin check refused a request. The kind of its Origin: ${kind}.`
}

/** The one line a refusal writes when the Origin is a live world's this world can name: that world's kind only. */
export function aWorldsRefusalLogLine(kind: WorldKind): string {
  return `The Origin check refused a request from a page of another world. The kind of that world: ${kind}.`
}

/** The one line a refusal writes on a world that could not read the office's list of its pages. */
export function aRefusalWithoutTheOfficesListLogLine(kind: TheKindOfAnOrigin): string {
  return (
    "The Origin check refused a request: the office's list of its own pages could not be read, so this world takes " +
    `no page's origin. The kind of its Origin: ${kind}.`
  )
}

/** The standing of one request's Origin, decided once by the hook below. */
export type TheOriginsStanding =
  | { is: 'no Origin' }
  | { is: "this office's"; origin: string }
  | { is: "the office's page, on a visited world"; origin: string }
  | { is: "a plugin page's null" }
  | { is: "not this office's"; origin: string; theOfficesListWasNotRead: boolean }

/** Each request's standing, kept on the request the server read. */
const decided = new WeakMap<object, TheOriginsStanding>()

/** The standing the hook decided for this request. A request the hook did not see is a broken assumption, said so. */
export function theStandingOfTheOrigin(req: FastifyRequest): TheOriginsStanding {
  const standing = decided.get(req.raw)
  if (standing === undefined) {
    throw new Error('The Origin check did not run for this request, so nothing here can say whether its page is this office\'s.')
  }
  return standing
}

/**
 * Whether a page sent this request from an origin that is not this office's. False when no Origin came. The office's
 * page on a visited world is not this world's own: a door that asks takes only this world's own pages.
 */
export function aPageThatIsNotThisOfficesSentIt(req: FastifyRequest): boolean {
  const { is } = theStandingOfTheOrigin(req)
  return is === "not this office's" || is === "the office's page, on a visited world"
}

/**
 * THE CORS HEADERS A REPLY THAT WRITES ITS OWN HEADERS OWES THIS REQUEST: the event stream and a terminal's stream,
 * whose hijacked replies no hook reaches. The same decision the CORS answer in src/server/index.ts reads.
 */
export function theCorsHeadersOfAHijackedReply(req: FastifyRequest): Record<string, string> {
  const standing = theStandingOfTheOrigin(req)
  if (standing.is === "this office's") return whatToTellAPageOnAnotherOrigin(standing.origin, true)
  if (standing.is === "the office's page, on a visited world") return whatToTellAPageOnAnotherOrigin(standing.origin, false)
  return {}
}

/**
 * THE MIRROR A TEST NAMES AS THE OFFICE'S, or undefined for the one this world may read. A world under a test runner
 * reads no mirror (`theMirrorThisWorldMayRead` in ./office.ts), so a test that stands in for the office's list of its
 * pages names the file it wrote. Nothing but a test calls `useTheOfficesMirrorAt`.
 */
let theOfficesMirrorATestNamed: string | undefined

/** Read the office's mirror from this file, or from the one this world may read again when it is undefined. */
export function useTheOfficesMirrorAt(file: string | undefined): void {
  theOfficesMirrorATestNamed = file
}

/** The office's mirror as this world reads it, or null because there is none or it cannot be read. */
function theOfficesMirror(): Mirror | null {
  return readTheMirror(theOfficesMirrorATestNamed ?? theMirrorThisWorldMayRead().file)
}

/**
 * The live worlds this world can name: its own list, and on a world that is not the office, the office's list it read.
 * Read each time it is asked, as both lists are. For the log line alone: no world's address is taken as a page's.
 */
function theLiveWorldsThisWorldCanName(): World[] {
  const theirs = theOfficeIsInThisDatabase() ? [] : theOfficesMirror()?.worlds ?? []
  return [...worldsHere(), ...theirs].filter((world) => world.diedAt === null)
}

/** The live world this world can name whose address, or address for other machines, has exactly this origin. */
export function theWorldWhoseOriginThisIs(origin: string): World | undefined {
  return theLiveWorldsThisWorldCanName().find((world) => [world.address, world.addressForOtherMachines].some((address) => {
    if (address === null) return false
    try {
      return new URL(address).origin === origin
    } catch {
      return false
    }
  }))
}

/** Decide the standing of this request's Origin. `production` is whether this process serves the built page itself. */
function decide(req: FastifyRequest, production: boolean): TheOriginsStanding {
  const said = req.headers.origin
  if (said === undefined) return { is: 'no Origin' }
  if (said === 'null' && theOperationThisRouteDeclared(req)?.name === THE_PLUGIN_FILES_DOOR) return { is: "a plugin page's null" }
  const origin = said.toLowerCase()
  const parts = AN_ORIGIN.exec(origin)
  if (parts !== null) {
    const name = bare(parts[2]!)
    if (isAPageOfThisOffice(req, parts[1] as 'http' | 'https', name, parts[3])) return { is: "this office's", origin: said }
  }
  if (!production && theDevServersOrigins(settings()).includes(origin)) return { is: "this office's", origin: said }
  if (theOfficeIsInThisDatabase() || parts === null) return { is: "not this office's", origin: said, theOfficesListWasNotRead: false }
  // ON A VISITED WORLD, THE OFFICE'S OWN PAGES, exactly as the office's list names them, and nothing else.
  const theOfficesPages = theOfficesMirror()?.pageOrigins ?? null
  if (theOfficesPages === null) return { is: "not this office's", origin: said, theOfficesListWasNotRead: true }
  if (theOfficesPages.includes(origin)) return { is: "the office's page, on a visited world", origin: said }
  return { is: "not this office's", origin: said, theOfficesListWasNotRead: false }
}

/** A host as it is compared: without brackets. */
function bare(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
}

/** The kind of an Origin as its log line names it. */
function theKindOf(origin: string): TheKindOfAnOrigin {
  if (origin === 'null') return 'null'
  const parts = AN_ORIGIN.exec(origin.toLowerCase())
  if (parts === null) return 'unreadable'
  const name = bare(parts[2]!)
  if (LOOPBACK_NAMES.has(name)) return 'loopback'
  return isIP(name) === 0 ? 'name' : 'number'
}

/**
 * The line a refusal of this Origin writes: that the office's list could not be read, when it could not; the world's
 * kind, when the Origin is a live world's; or else the Origin's kind.
 */
function theLineFor(origin: string, theOfficesListWasNotRead: boolean): string {
  if (theOfficesListWasNotRead) return aRefusalWithoutTheOfficesListLogLine(theKindOf(origin))
  const world = theWorldWhoseOriginThisIs(origin.toLowerCase())
  return world === undefined ? aRefusalsLogLine(theKindOf(origin)) : aWorldsRefusalLogLine(world.kind)
}

function theRefusal(): PanelError {
  return new PanelError(sayInEnglish('server.originIsNotThisOffice'), 403, undefined, undefined, undefined, {
    code: 'originIsNotThisOffice',
    values: {},
  })
}

/**
 * Decide every request's Origin, and refuse a request a listener carried whose Origin is not this office's.
 * `production` is whether this process serves the built page itself.
 */
export function refuseAnOriginThatIsNotThisOffice(app: FastifyInstance, production: boolean): void {
  app.addHook('onRequest', async (req) => {
    const standing = decide(req, production)
    decided.set(req.raw, standing)
    if (standing.is !== "not this office's" || arrivalOf(req) === undefined) return
    req.log.warn(theLineFor(standing.origin, standing.theOfficesListWasNotRead))
    throw theRefusal()
  })
}
