// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REQUEST WHOSE HOST IS NOT THIS OFFICE'S IS REFUSED, AND TOUCHES NOTHING.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * A site can make its own name stand for this computer's loopback number. A page from that site can then
 * call the office by that name, and the browser lets the page read the answers, because to the browser
 * they come from the site's own name. The browser still sends the name it used, in the Host header. So a
 * request is answered only when its Host is a name this office already holds, with the port the request
 * came in on.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH NAMES EACH LISTENER TAKES
 * ---------------------------------------------------------------------------------------
 *
 * EVERY LISTENER: 127.0.0.1, localhost and [::1], with the port of the socket the request came in on.
 *
 * THE DOOR FOR OTHER MACHINES also takes, with that port: the host MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES
 * names, the address for browsers in force, one of this machine's own numbers as `anAddressOfThisMachine`
 * in ./machines.ts lists them, the number the door's socket is bound to, as the socket reports it,
 * this machine's own tailnet name, and that name's short name.
 *
 * THE SECOND LISTENER, which a proxy on this computer carries requests to, takes those names (but not its
 * own bound number, which is loopback) with no port and with :443, the ports the proxy answers on. The
 * tailnet name and its short name are among them.
 *
 * THE LOOPBACK LISTENER takes none of them, the tailnet name and its short name included.
 *
 * A HOST WITH NO PORT NAMES PORT 80, as a browser means it, except for those names on the second listener.
 *
 * A NAME IS TAKEN ONLY WHEN THE OFFICE ALREADY HOLDS IT. Nothing here looks a name up: the site that owns a
 * name also decides what its name stands for, so a lookup would ask that site whether to let it in.
 *
 * THE ORIGIN CHECK READS THE SAME NAMES, through `isAPageOfThisOffice` below, so a page's origin and a request's Host
 * are judged by one list.
 *
 * SO DO THE OFFICE'S WORLDS. `theOriginsOfThisOfficesPages` below makes the exact origins of the office's pages from
 * the same names, listener by listener, once `start()` has said which listeners it bound. The office writes that list
 * into its mirror, and a world takes a page's origin only when it is on it (SEC-2's design, item 6).
 *
 * ---------------------------------------------------------------------------------------
 * THIS MACHINE'S OWN TAILNET NAME
 * ---------------------------------------------------------------------------------------
 *
 * The name tailscale gives this machine: the DNSName of Self in `tailscale status --json`, without its
 * final dot and in lower case. The probe's `ownTailnetName` in ./resources.ts runs that command, with no
 * shell and a limit of 3 seconds, and no other file starts it.
 *
 * WHEN IT IS READ. `start()` in src/server/index.ts reads it as the server starts, and again every 5
 * minutes, through `keepReadingThisMachinesTailnetName` below, and works out the list of the office's pages again
 * after each read. A read never holds a request, and nothing
 * here reads it for a request: the check compares with the name the last good read found. Until a read
 * finds one, no tailnet name is held. A read that finds none keeps the last name, and says so in one line.
 * The Mac's and Windows' probes have no way to read it, so there the first read says so, once, and no
 * name is held. An app that is built and served without `start()` reads no name, so there the check
 * takes none.
 *
 * ITS SHORT NAME is the tailnet name's first label, the text before its first dot, such as a-machine: the
 * one-word name a machine on the tailnet may call this one by. It is worked out once, when a read finds the
 * full name, and nowhere else, so it follows the full name: no full name, no short name, and a new full
 * name brings its own short name. Nothing reads tailscale again for it. Only the tailnet name gives a short
 * name: the first label of the address for browsers, of the setting or of any other name is not taken.
 *
 * WHY TAKING IT DOES NOT LET A SITE IN. The name is this machine's own setting, read from this machine's own
 * tailscale daemon. A site can choose what its own names stand for, but it cannot choose this name: it is
 * never read from a request, and nothing here looks a name up. A page on another site may still send a
 * request to this name. To the browser that is a request to another site, the same as one to the address
 * for browsers. The short name is safe in the same way. It comes from this machine's own setting and is
 * never read from a request. A site cannot make a one-word name stand for this computer, because only the
 * tailnet's own DNS answers it.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH REQUESTS ARE CHECKED
 * ---------------------------------------------------------------------------------------
 *
 * Every request a listener carried, which is every request with an arrival (`stampArrival` in ./http.ts). A
 * request with no arrival passes here as `refuseAnUnclassifiedDoor` in ./http.ts lets it pass: either it was
 * built in-process and no listener could have carried it, or it came on a socket no listener stamped, and
 * that hook refuses it after this one. A carried request whose arriving port cannot be read is refused,
 * because its Host cannot be checked against it.
 *
 * It is the first request hook, above the redirect to the address for browsers, so for a refused request no
 * other request hook and no handler runs, and nothing is written for it. The call recorder in ./usage.ts
 * writes a row only for a request its own request hook saw, so it writes none either.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE REFUSAL SAYS
 * ---------------------------------------------------------------------------------------
 *
 * 421 is the status for a request sent to a server that does not answer for the name it names. The words
 * say nothing was done, give the office's loopback address with the socket's port, and say where the name
 * the office answers to is chosen. They never repeat the Host, which is words a stranger chose. When the
 * socket's port cannot be read, the port given is the API port the settings name.
 *
 * EACH REFUSAL IS ONE WARN LINE IN THE SERVER'S LOG, naming the listener that carried the request and the
 * kind of its Host: loopback, a number, a name, or none when there is no Host or it cannot be read. The
 * line never holds the Host either.
 */

import { isIP } from 'node:net'
import type { FastifyInstance, FastifyRequest } from 'fastify'

import { arrivalOf } from '@shared/arrival-of.ts'
import { sayInEnglish } from '@shared/i18n.ts'

import { settings } from '../../config/settings.mjs'
import { theAddressForBrowsers } from './address-for-browsers.ts'
import { whoTheSocketIs } from './caller-address-of.ts'
import { theAddressesOfThisMachine } from './machines.ts'
import { named } from './named-timers.ts'
import { PanelError } from './panel-error.ts'
import { osProbe } from './resources.ts'

/** The loopback names every listener takes, without brackets and in lower case. */
const LOOPBACK_NAMES: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '::1'])

/** A Host header: a name or a bracketed IPv6 address, then an optional port. Read in lower case. */
const A_HOST = /^(\[[0-9a-f.:]*:[0-9a-f.:]*\]|[a-z0-9.-]+)(?::(\d{1,5}))?$/

/** The three listeners, told apart as each is stamped. */
export type TheListener = 'the loopback listener' | 'the door for other machines' | 'the second listener'

/** What a refused Host was, as its log line names it: one of the loopback names, a number, a name, or none. */
export type TheKindOfAHost = 'loopback' | 'number' | 'name' | 'none'

/**
 * THIS MACHINE'S OWN TAILNET NAME, as the last read that found one found it, with its short name, or null until a
 * read has. One for the process, because it is the machine's name and not one server's. The two are set together,
 * so the short name cannot belong to another full name.
 */
let theTailnetName: { readonly full: string; readonly short: string } | null = null

/** A tailnet name's short name: its first label, the text before its first dot, or the whole name with no dot. */
function theShortNameOf(full: string): string {
  const dot = full.indexOf('.')
  return dot === -1 ? full : full.slice(0, dot)
}

/** How often the tailnet name is read again, so a machine renamed in its tailnet is taken within this time. */
const READ_THE_TAILNET_NAME_EVERY_MS = 5 * 60_000

/** The read's timer, by the name a long run of it is said under in the log. */
const THE_READS_TIMER = "the read of this machine's tailnet name"

/** The line a read that found no tailnet name writes. Exported so the test reads the same sentence. */
export const THE_TAILNET_NAME_WAS_NOT_READ =
  "This machine's tailnet name could not be read: tailscale is missing, failed, ran past its limit or named " +
  'none. The Host check keeps the last name it read, if it read one.'

/** The line a read writes when this system's probe cannot read the name, as the Mac's and Windows' cannot. */
export const THIS_PROBE_READS_NO_TAILNET_NAME =
  "This system's probe does not read a tailnet name, so the Host check holds none."

/**
 * READ THIS MACHINE'S TAILNET NAME ONCE, through the probe, and keep it when the read finds one. A read that finds
 * none keeps the last name and says so in one line through `say`.
 */
export async function readThisMachinesTailnetName(say: (line: string) => void): Promise<void> {
  const probe = osProbe()
  if (probe.ownTailnetName === undefined) {
    say(THIS_PROBE_READS_NO_TAILNET_NAME)
    return
  }
  const found = await probe.ownTailnetName()
  if (found === null) say(THE_TAILNET_NAME_WAS_NOT_READ)
  else theTailnetName = { full: found, short: theShortNameOf(found) }
}

/**
 * READ IT NOW AND EVERY 5 MINUTES, and answer with what stops it. For `start()` in src/server/index.ts alone, so an
 * app a test builds starts no read. NAMED, so a long read is a line in the log. The timer keeps no process alive.
 * A read that throws is a line in the log, and the next one tries again.
 *
 * `afterEachRead` runs after every read, whatever it found, so `start()` can work out the list of the office's pages
 * again: this machine's numbers are read anew at each read as well.
 */
export function keepReadingThisMachinesTailnetName(say: (line: string) => void, afterEachRead: () => void): () => void {
  const read = (): void => {
    readThisMachinesTailnetName(say)
      .catch((err: unknown) => {
        const why = err instanceof Error ? err.message : String(err)
        say(`The read of this machine's tailnet name could not finish: ${why}`)
      })
      .then(afterEachRead)
      .catch((err: unknown) => {
        const why = err instanceof Error ? err.message : String(err)
        say(`After the read of this machine's tailnet name, the list of the office's pages could not be written: ${why}`)
      })
  }
  read()
  // A probe with no way to read the name never will have one, so the first read has said so, once, and none follows.
  if (osProbe().ownTailnetName === undefined) return () => undefined
  const timer = setInterval(named(THE_READS_TIMER, say, read), READ_THE_TAILNET_NAME_EVERY_MS)
  timer.unref()
  return () => clearInterval(timer)
}

/** The one line a refusal writes in the server's log. It never holds the Host. */
export function aRefusalsLogLine(kind: TheKindOfAHost, listener: TheListener): string {
  return `The Host check refused a request on ${listener}. The kind of its Host: ${kind}.`
}

/** The kind of a Host as it is compared, or `none` for a Host that is missing or cannot be read. */
function theKindOf(name: string | undefined): TheKindOfAHost {
  if (name === undefined) return 'none'
  if (LOOPBACK_NAMES.has(name)) return 'loopback'
  return isIP(name) === 0 ? 'name' : 'number'
}

function theListenerOf(req: FastifyRequest, localAddress: string | undefined): TheListener {
  if (whoTheSocketIs(req) === 'a proxy on this computer') return 'the second listener'
  if (localAddress === '127.0.0.1' || localAddress === '::1') return 'the loopback listener'
  return 'the door for other machines'
}

/** A host as it is compared: without brackets and in lower case. */
function bare(host: string): string {
  const lower = host.trim().toLowerCase()
  return lower.startsWith('[') && lower.endsWith(']') ? lower.slice(1, -1) : lower
}

/**
 * The names the office already holds for other machines: the host of the setting for other machines, the address for
 * browsers in force, its own tailnet name and that name's short name, and this machine's own numbers. Read each time,
 * as each can change while the office runs.
 */
function theNamesTheOfficeHolds(): string[] {
  const names: string[] = []
  const forOtherMachines = settings().otherMachines
  if (forOtherMachines !== null) names.push(bare(forOtherMachines.host))
  const inForce = theAddressForBrowsers().inForce
  if (inForce !== null) names.push(inForce)
  if (theTailnetName !== null) names.push(theTailnetName.full, theTailnetName.short)
  names.push(...theAddressesOfThisMachine())
  return names
}

/** Whether the office already holds this name for other machines, as `theNamesTheOfficeHolds` lists them. */
function isANameTheOfficeHolds(name: string): boolean {
  return theNamesTheOfficeHolds().includes(name)
}

/** One listener as `start()` in src/server/index.ts bound it: which it is, the number its socket is bound to, its port. */
export interface TheBoundListener {
  listener: TheListener
  address: string
  port: number
}

/** The listeners the office is bound on, or null until `start()` has bound them and said so. One for the process. */
let theListeners: readonly TheBoundListener[] | null = null

/**
 * TELL THE HOST CHECK WHICH LISTENERS THE OFFICE IS BOUND ON, for the list of its pages below. `start()` in
 * src/server/index.ts says so after it binds them. Null says none is known, as before it has bound them.
 */
export function theOfficeListensOn(bound: readonly TheBoundListener[] | null): void {
  theListeners = bound === null ? null : [...bound]
}

/** An origin as a browser writes it: an IPv6 number in brackets, and no port where it is the scheme's own. */
function anOrigin(scheme: 'http' | 'https', name: string, port: number | undefined): string {
  const host = isIP(name) === 6 ? `[${name}]` : name
  const itsOwn = scheme === 'http' ? 80 : 443
  return port === undefined || port === itsOwn ? `${scheme}://${host}` : `${scheme}://${host}:${String(port)}`
}

/**
 * THE EXACT ORIGINS OF THIS OFFICE'S PAGES, listener by listener, from the names the Host check above takes, or null
 * until the office knows its listeners. SEC-2's design, item 6: the office writes this list into its mirror
 * (`writeTheMirror` in ./office.ts), and a world takes a page's origin only when it is exactly on it
 * (./an-origin-that-is-not-this-office.ts).
 *
 *   - EVERY LISTENER, over http with its own port: 127.0.0.1, localhost and [::1].
 *   - THE DOOR FOR OTHER MACHINES, over http with its port, also: the number its socket is bound to, and each name the
 *     office holds.
 *   - THE SECOND LISTENER, over https with no port, also: each name the office holds, where the proxy on this computer
 *     serves the page.
 *
 * Sorted, and each once, so two lists of the same origins are the same list. Worked out again each time it is asked,
 * because the tailnet name and this machine's numbers can change while the office runs.
 */
export function theOriginsOfThisOfficesPages(): string[] | null {
  if (theListeners === null) return null
  const held = theNamesTheOfficeHolds()
  const origins = new Set<string>()
  for (const { listener, address, port } of theListeners) {
    for (const name of LOOPBACK_NAMES) origins.add(anOrigin('http', name, port))
    if (listener === 'the door for other machines') {
      for (const name of [bare(address), ...held]) origins.add(anOrigin('http', name, port))
    }
    if (listener === 'the second listener') {
      for (const name of held) origins.add(anOrigin('https', name, undefined))
    }
  }
  return [...origins].sort()
}

/**
 * WHETHER A PAGE AT THIS SCHEME, NAME AND PORT IS ONE OF THIS OFFICE'S OWN, for the Origin check in
 * ./an-origin-that-is-not-this-office.ts. One list serves both checks (SEC-2's design, item 6), so the names are the
 * ones above:
 *
 *   - OVER HTTP, with the port of the socket the request came in on: a loopback name, the number that socket is bound
 *     to, or a name the office holds. On every listener, because a page on the door for other machines may call the
 *     loopback address of the same office on the same port, and the browser then sends the door's origin there.
 *   - OVER HTTPS, with no port or :443, on the second listener: a name the office holds, because the proxy on this
 *     computer serves the page there.
 *
 * A request whose socket's port cannot be read has no page of this office, so nothing over http is taken for it.
 * `name` is bare and in lower case; `port` is the one the origin names, or undefined when it names none.
 */
export function isAPageOfThisOffice(req: FastifyRequest, scheme: 'http' | 'https', name: string, port: string | undefined): boolean {
  const socket = req.raw.socket as { localPort?: number; localAddress?: string } | undefined
  if (scheme === 'http') {
    const localPort = socket?.localPort
    if (typeof localPort !== 'number' || (port ?? '80') !== String(localPort)) return false
    return LOOPBACK_NAMES.has(name) || name === socket?.localAddress || isANameTheOfficeHolds(name)
  }
  if (port !== undefined && port !== '443') return false
  return theListenerOf(req, socket?.localAddress) === 'the second listener' && isANameTheOfficeHolds(name)
}

function theRefusal(port: number): PanelError {
  return new PanelError(sayInEnglish('server.hostIsNotThisOffice', { port }), 421, undefined, undefined, undefined, {
    code: 'hostIsNotThisOffice',
    values: { port },
  })
}

/** The refusal, after its one line in the server's log. */
function refused(req: FastifyRequest, kind: TheKindOfAHost, listener: TheListener, port: number): PanelError {
  req.log.warn(aRefusalsLogLine(kind, listener))
  return theRefusal(port)
}

/** Refuse every request a listener carried whose Host is not one this office answers to on that listener. */
export function refuseAHostThatIsNotThisOffice(app: FastifyInstance): void {
  app.addHook('onRequest', async (req) => {
    if (arrivalOf(req) === undefined) return
    const socket = req.raw.socket as { localPort?: number; localAddress?: string } | undefined
    const localPort = socket?.localPort
    const host = A_HOST.exec((req.headers.host ?? '').toLowerCase())
    const name = host === null ? undefined : bare(host[1]!)
    if (typeof localPort !== 'number') {
      throw refused(req, theKindOf(name), theListenerOf(req, socket?.localAddress), settings().apiPort)
    }
    if (host === null || name === undefined) {
      throw refused(req, 'none', theListenerOf(req, socket?.localAddress), localPort)
    }
    const portNamed = host[2]
    const onItsPort = (portNamed ?? '80') === String(localPort)
    if (LOOPBACK_NAMES.has(name) && onItsPort) return
    const listener = theListenerOf(req, socket?.localAddress)
    if (listener === 'the door for other machines' && onItsPort) {
      if (name === socket?.localAddress || isANameTheOfficeHolds(name)) return
    }
    if (listener === 'the second listener' && (portNamed === undefined || portNamed === '443')) {
      if (isANameTheOfficeHolds(name)) return
    }
    throw refused(req, theKindOf(name), listener, localPort)
  })
}
