// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE ADDRESS A BROWSER IS SENT TO, SO THAT ONE PAIRING COVERS THE OFFICE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * The owner opened the office at this machine's private-network name and at its private-network number,
 * which reach the same server. A browser keeps the pairing cookie per address, so they had to pair twice.
 * So one address is the office's address for browsers, and a page load that arrives at another of this
 * machine's own addresses is sent to the same path and query there. Whether pairing stays in the design
 * at all is their question, and this file does not answer it.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE ADDRESS COMES FROM
 * ---------------------------------------------------------------------------------------
 *
 * The person chooses it on the Settings page, and it is stored in `installation.address_for_browsers`
 * (migration 0207). NULL is nobody having chosen, and then the address MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES
 * names is in force, or none. It is a stored setting and not only that line in `.env` because that line
 * is what the server BINDS, and the owner's names a number: a name there must resolve before the server
 * may start, and a number does not. The address a browser is sent to does not have to be the one bound.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS SENT, AND WHAT NEVER IS
 * ---------------------------------------------------------------------------------------
 *
 * ONLY A PAGE LOAD: GET or HEAD, a path outside /api, and an Accept header that asks for HTML, which is
 * what a browser sends when it opens a page and not when it fetches a script, a picture or the API. An
 * agent, a tool and a hook call /api, and /api is never sent anywhere.
 *
 * ONLY AT ANOTHER OF THIS MACHINE'S OWN ADDRESSES. The Host header says which address the browser typed,
 * because the private-network name and number arrive at the same socket. It is only compared with the
 * list the operating system layer gives (`anAddressOfThisMachine` in ./machines.ts, whose list leaves
 * loopback out), and loopback is left
 * out here as well by name. A Host header that names anything else is answered where it arrived.
 *
 * THE TARGET IS NEVER BUILT FROM THE REQUEST'S HOST. It is the stored address, the port the connection
 * arrived on as the socket reports it, and the path and query. So a forged Host header can at most cause
 * a redirect to the office's own chosen address, never to an address the header names.
 *
 * THE CHOSEN ADDRESS IS THIS MACHINE'S, checked when it is chosen (wave 13x round 7d). A number must be one
 * of this machine's own addresses, and a name must resolve to one of them, or the choice is refused and
 * nothing is stored: a browser sent anywhere else would leave this office. When the name cannot be looked
 * up at that moment, as when the private network is down, that is said and nothing is stored either.
 *
 * 307 AND NOT 308: a browser keeps a permanent redirect, and the person may choose another address
 * tomorrow. `cache-control: no-store` says the same to anything in between.
 */

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

import type { FastifyInstance } from 'fastify'

import { settings } from '../../config/settings.mjs'
import { sqlite } from '../db/client.ts'
// PanelError, SO THE SENTENCE REACHES WHOEVER ASKED. Built only when something throws, never at import.
import { PanelError } from './panel-error.ts'
import { anAddressOfThisMachine } from './machines.ts'

/** The address for browsers as the Settings page and the door read it. */
export interface AddressForBrowsers {
  /** The address a page load is sent to now, or null because there is none and nothing is sent. */
  inForce: string | null
  /** What the person chose, or null because nobody has. */
  chosen: string | null
  /** What MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES names, which is in force when nobody has chosen; null when it names none. */
  fromTheEnvironment: string | null
}

/** A host name: labels of letters, digits and hyphens, joined by dots. */
const A_HOST_NAME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/

/** Whether a host, without brackets and in lower case, is this computer's loopback. */
function isLoopback(host: string): boolean {
  return host === 'localhost' || host.endsWith('.localhost') || host === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
}

/**
 * THE ADDRESS AS IT IS STORED, or why it cannot be.
 *
 * Spaces around it are dropped and it is put in lower case. An IPv6 address loses its brackets. A port, a
 * scheme, a path, every address at once and loopback are refused: the port is the one the browser came in
 * on, and a browser on another computer sent to loopback would reach itself.
 */
export function theAddressForBrowsersAsStored(written: string): { address: string } | { why: string } {
  const trimmed = written.trim().toLowerCase()
  const bare = trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed
  if (bare === '') return { why: 'The address is empty.' }
  if (bare.includes('/') || (isIP(bare) !== 6 && bare.includes(':'))) {
    return { why: `"${written.trim()}" is not a name or an address on its own. Write only the name or the number, with no http:// and no port.` }
  }
  if (isIP(bare) === 0 && !A_HOST_NAME.test(bare)) return { why: `"${written.trim()}" is not a name or an address.` }
  if (bare === '0.0.0.0' || bare === '::') return { why: `"${written.trim()}" means every address this computer has, not one.` }
  if (isLoopback(bare)) return { why: `"${written.trim()}" is this computer's own loopback, which another computer cannot reach.` }
  return { address: bare }
}

/** The numbers a name stands for. Throws when the name cannot be looked up. */
export type ANameResolver = (name: string) => Promise<readonly string[]>

/** The system's own resolver, the one the browser on this machine would use too. */
const THE_SYSTEMS_RESOLVER: ANameResolver = async (name) =>
  (await lookup(name, { all: true, verbatim: true })).map((one) => one.address)

let resolveAName: ANameResolver = THE_SYSTEMS_RESOLVER

/** Put a stand-in resolver in place of the system's, or the system's back with null. For tests, which never ask the network. */
export function useANameResolver(resolver: ANameResolver | null): void {
  resolveAName = resolver ?? THE_SYSTEMS_RESOLVER
}

/**
 * WHY AN ADDRESS IN ITS STORED FORM IS NOT THIS MACHINE'S, or null because it is.
 *
 * A number must be one of this machine's own addresses as `anAddressOfThisMachine` lists them. A name must
 * resolve to at least one of them. A name that cannot be looked up now is not called foreign: what is said
 * is that it could not be checked, with a 503, because the answer may be different when the network is back.
 */
export async function whyTheAddressIsNotThisMachines(address: string): Promise<{ why: string; status: 400 | 503 } | null> {
  if (isIP(address) !== 0) {
    if (anAddressOfThisMachine(address)) return null
    return { why: `"${address}" is not one of this computer's own network addresses, so a browser sent there would leave this office.`, status: 400 }
  }
  let numbers: readonly string[]
  try {
    numbers = await resolveAName(address)
  } catch (error) {
    const code = (error as { code?: unknown }).code
    return {
      why:
        `The name "${address}" could not be looked up just now${typeof code === 'string' ? ` (${code})` : ''}, so whether it ` +
        'is this computer\'s is not known. This happens when the private network is down. Try again when the name can be looked up.',
      status: 503,
    }
  }
  if (numbers.some((number) => anAddressOfThisMachine(number))) return null
  const said = numbers.length === 0 ? 'no address' : numbers.join(', ')
  return {
    why: `The name "${address}" stands for ${said}, and none of that is this computer's own network address, so a browser sent there would leave this office.`,
    status: 400,
  }
}

/** The stored value exactly as SQLite hands it over, or null because nobody chose or there is no row. */
function theStoredValue(): unknown {
  const row = sqlite.prepare('SELECT address_for_browsers AS address FROM installation WHERE only_row = 1').get() as
    | { address: unknown }
    | undefined
  return row?.address ?? null
}

/** What MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES names, in lower case without brackets, or null. */
function theAddressTheEnvironmentNamed(): string | null {
  const host = settings().otherMachines?.host
  if (typeof host !== 'string' || host.trim() === '') return null
  const checked = theAddressForBrowsersAsStored(host)
  return 'address' in checked ? checked.address : null
}

/**
 * THE ADDRESS FOR BROWSERS. The one reader.
 *
 * Read from the row on every call, with nothing cached, so a choice made on the Settings page holds for
 * the very next page load. A stored value that is not an address in its stored form is not guessed at.
 */
export function theAddressForBrowsers(): AddressForBrowsers {
  const stored = theStoredValue()
  const fromTheEnvironment = theAddressTheEnvironmentNamed()
  if (stored === null) return { inForce: fromTheEnvironment, chosen: null, fromTheEnvironment }
  const checked = typeof stored === 'string' ? theAddressForBrowsersAsStored(stored) : null
  if (checked === null || !('address' in checked) || checked.address !== stored) {
    throw new PanelError(
      `The address for browsers is stored as ${JSON.stringify(stored)} in installation.address_for_browsers, and ` +
        'that is not an address in its stored form. Nothing was guessed and nothing was changed.',
      500,
    )
  }
  return { inForce: stored, chosen: stored, fromTheEnvironment }
}

/**
 * CHOOSE THE ADDRESS FOR BROWSERS, OR TAKE THE CHOICE AWAY, AND ANSWER WITH THE READING AS IT NOW STANDS.
 *
 * The caller has already checked who is asking and put the address in its stored form. An update that
 * changed no row means this database has no installation row, and that is said rather than answered as done.
 */
export function setTheAddressForBrowsers(address: string | null): AddressForBrowsers {
  const written = sqlite.prepare('UPDATE installation SET address_for_browsers = ? WHERE only_row = 1').run(address)
  if (written.changes !== 1) {
    throw new PanelError(
      'This database has no installation row, so the address for browsers could not be stored. Nothing was changed.',
      500,
    )
  }
  return theAddressForBrowsers()
}

/** One request, as much of it as the rule reads. */
export interface APageLoad {
  method: string
  url: string
  /** The Host header, which says which address the browser typed. Compared only, never copied into the answer. */
  host: string | undefined
  accept: string | undefined
  /** The port the connection arrived on, as the socket reports it. */
  port: number | undefined
}

/** The host part of a Host header, in lower case and without brackets, or null when it has none. */
function theHostNamed(header: string | undefined): string | null {
  if (header === undefined) return null
  const value = header.trim().toLowerCase()
  if (value.startsWith('[')) {
    const end = value.indexOf(']')
    return end > 1 ? value.slice(1, end) : null
  }
  const colon = value.indexOf(':')
  const host = colon === -1 ? value : value.slice(0, colon)
  return host === '' ? null : host
}

/**
 * WHERE A PAGE LOAD BELONGS, or null because it stays where it arrived. The whole rule, with nothing read
 * from the machine or the database: those are handed in, and asked only once everything cheaper has passed.
 */
export function whereThisPageLoadBelongs(
  ask: APageLoad,
  office: { address: () => string | null; isOneOfThisMachinesAddresses: (host: string) => boolean },
): string | null {
  if (ask.method !== 'GET' && ask.method !== 'HEAD') return null
  if (!ask.url.startsWith('/')) return null
  if (ask.url === '/api' || ask.url.startsWith('/api/') || ask.url.startsWith('/api?')) return null
  if (ask.accept === undefined || !ask.accept.toLowerCase().includes('text/html')) return null
  if (ask.port === undefined) return null
  const typed = theHostNamed(ask.host)
  if (typed === null || isLoopback(typed)) return null
  if (!office.isOneOfThisMachinesAddresses(typed)) return null
  const address = office.address()
  if (address === null || address === typed) return null
  const authority = isIP(address) === 6 ? `[${address}]` : address
  return `http://${authority}:${String(ask.port)}${ask.url}`
}

/**
 * SEND A PAGE LOAD AT ANOTHER OF THIS MACHINE'S OWN ADDRESSES TO THE ADDRESS FOR BROWSERS. Registered
 * before every other check of a request, so a browser is sent on before anything is refused or served.
 */
export function sendPageLoadsToTheAddressForBrowsers(app: FastifyInstance): void {
  app.addHook('onRequest', async (req, reply) => {
    const to = whereThisPageLoadBelongs(
      {
        method: req.method,
        url: req.url,
        host: req.headers.host,
        accept: req.headers.accept,
        port: req.raw.socket.localPort,
      },
      {
        address: () => theAddressForBrowsers().inForce,
        isOneOfThisMachinesAddresses: anAddressOfThisMachine,
      },
    )
    if (to === null) return
    return reply.code(307).header('location', to).header('cache-control', 'no-store').send()
  })
}
