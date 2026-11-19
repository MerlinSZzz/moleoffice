// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NOTHING THAT COMES FROM A SANDBOX IS THE PERSON. This answers problem T5Dbi_Z55666.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * An ordinary sandbox runs with this computer's network (`--network=host`), so a request from inside it arrives on
 * the listener for this machine, exactly where their browser's requests arrive. Two roads then made a program in a
 * sandbox the person: while the one-version key window is open, a keyless claim to be them from this machine counts as them;
 * and the pairing press answers their key itself, in a cookie, to any request from this machine. The sandbox covers the
 * key file, and both roads gave out what it covers.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE, AND WHY THE SANDBOX IS NOT ASKED
 * ---------------------------------------------------------------------------------------
 *
 * The person never works inside a sandbox, so a claim to be them from one is never true. The office finds out where a request
 * came from ITSELF: a mark a sandbox put on its own requests is one it could leave off. So for a keyless claim to be
 * them from this machine, and for the pairing press, it asks the operating system which program holds the other end of
 * the connection (`senderOfAConnection` in lib/resources.ts): its owner, and whether it runs in a container this
 * server is not in. It counts as them only when that program is found, runs as the same user this server runs as, and
 * runs in no container this server is not in. Everything else, a program it cannot find included, is not them: a rule
 * that let through what it could not see would be a rule a sandbox could hide from.
 *
 * Their browser runs as them and in no container, so it goes on as before, and a request carrying their key is not asked
 * at all. An agent's own keyless claim is not narrowed: the rule is about them.
 *
 * ---------------------------------------------------------------------------------------
 * ONE ANSWER PER CONNECTION
 * ---------------------------------------------------------------------------------------
 *
 * A browser keeps one connection open for many requests, and the program at its other end cannot change, so the
 * answer is kept on the socket and read once. It is kept beside the probe that gave it, so a probe changed in a test
 * is asked again.
 *
 * ---------------------------------------------------------------------------------------
 * THE READING THAT WAITS
 * ---------------------------------------------------------------------------------------
 *
 * Inside the installed Windows app the answer runs PowerShell, which took about four and a half seconds when it was
 * measured, and the server answers nothing else while a reading holds its thread. So the probe there has only
 * `readSenderOfAConnection`, and `readWhoSentItFromThisComputer` reads by it and keeps the answer on the socket as the
 * first does. Wherever the probe reads that way (`theSenderIsReadByTheWayThatWaits`), a request the window would count
 * is read before its handler (`readWhoSentAClaimToBeThemFirst` in lib/http.ts), and the handler's own question then
 * finds the answer kept. A door that asks outside `actorFrom` reads by the way that waits itself. A question on the
 * thread that finds no answer kept there is refused in words, and is not read as "not found": a door that forgot to
 * read first would otherwise refuse the person's own window with nothing failing.
 *
 * A reading is waited for only so long (`THE_LONGEST_A_READING_WAITS`). One that runs past its time is refused in
 * words, with the code `senderNotReadInTime` that the window's first page reads to ask again, and nothing is kept, so the
 * next request on the connection is read again. Each such refusal is written to the log once, when its reading has
 * ended, with how long the reading took and whether it ended with an answer. The installed Windows app's reading always
 * ends, because its script is stopped after twenty seconds (src/config/systems/windows-commands.mjs).
 *
 * ---------------------------------------------------------------------------------------
 * WHOM THIS COMPUTER FINDS
 * ---------------------------------------------------------------------------------------
 *
 * Which programs on this computer can be found at all is a fact of the probe, and the sentence about pairing is read
 * from it in one place (`whomThisComputerFinds` below). On Linux any program of this server's user is found, so a
 * browser can pair. Inside the installed Mac or Windows app only the app's own window is found. Anywhere else no
 * program is found.
 */
import type { FastifyRequest } from 'fastify'
import { privateRequestLogAddress } from '../../config/private-sandbox-login.mjs'
import { named } from './named-timers.ts'
import { PanelError } from './panel-error.ts'
import { osProbe, type OsProbe, type OsSender } from './resources.ts'

/** Who sent a request from this machine, in the words a refusal says. Only the first counts as them. */
export type TheSender =
  | "one of this computer's own programs"
  | 'a program inside a container, which is a sandbox'
  | "a program another user runs"
  | 'a program Mole Office could not find'

/** The one answer that counts as them. */
export const THEIR_OWN_PROGRAM: TheSender = "one of this computer's own programs"

const kept = new WeakMap<object, { probe: OsProbe; answer: TheSender }>()

/**
 * WHO SENT THIS REQUEST, among this computer's programs. Asked only for a request that arrived on the listener for
 * this machine; the caller says so, and this reads the socket and nothing the request says about itself. Where the
 * probe reads only by the way that waits, it answers only what was read first, and refuses otherwise.
 */
export function whoSentItFromThisComputer(req: FastifyRequest): TheSender {
  const socket = req.socket ?? req.raw?.socket
  if (socket === undefined || socket === null) return 'a program Mole Office could not find'
  const probe = osProbe()
  const held = kept.get(socket)
  if (held !== undefined && held.probe === probe) return held.answer
  const answer = theVerdictOn(theSenderOf(probe, socket))
  kept.set(socket, { probe, answer })
  return answer
}

/**
 * THE SAME ANSWER, READ WITHOUT HOLDING THE SERVER'S THREAD where the probe has a way that waits, and kept on the
 * socket in the same place. Where it has none, the answer is made as `whoSentItFromThisComputer` makes it.
 */
export async function readWhoSentItFromThisComputer(req: FastifyRequest): Promise<TheSender> {
  const socket = req.socket ?? req.raw?.socket
  if (socket === undefined || socket === null) return 'a program Mole Office could not find'
  const probe = osProbe()
  const held = kept.get(socket)
  if (held !== undefined && held.probe === probe) return held.answer
  const answer = theVerdictOn(await readTheSenderOf(probe, socket, theRequestIn(req)))
  kept.set(socket, { probe, answer })
  return answer
}

type TheSocket = { remoteAddress?: string; remotePort?: number; localAddress?: string; localPort?: number }

function theVerdictOn(sender: OsSender | null): TheSender {
  if (sender === null) return 'a program Mole Office could not find'
  if (!runsAsThisServersUser(sender)) return 'a program another user runs'
  if (sender.pid === null || sender.inAnotherContainer === null) return 'a program Mole Office could not find'
  return sender.inAnotherContainer ? 'a program inside a container, which is a sandbox' : THEIR_OWN_PROGRAM
}

/** Whether the sender runs as the user this server runs as: the same uid, or on Windows the same SID. */
function runsAsThisServersUser(sender: OsSender): boolean {
  return 'sid' in sender ? sender.sid === sender.serversSid : sender.uid === process.getuid?.()
}

/** The two ends of the socket, as the probe is asked about them, or null when the socket does not say both. */
function theEndsOf(socket: TheSocket): [{ address: string; port: number }, { address: string; port: number }] | null {
  const { remoteAddress, remotePort, localAddress, localPort } = socket
  if (remoteAddress === undefined || remotePort === undefined || localAddress === undefined || localPort === undefined) return null
  return [{ address: remoteAddress, port: remotePort }, { address: localAddress, port: localPort }]
}

/**
 * WHETHER THE PROBE READS WHO SENT A CONNECTION BY THE WAY THAT WAITS, as the installed Windows app's does. Then a
 * request is read that way before the question on the server's thread is asked.
 */
export function theSenderIsReadByTheWayThatWaits(probe: OsProbe = osProbe()): boolean {
  return probe.readSenderOfAConnection !== undefined
}

/**
 * The refusal of a question on the server's thread where the probe reads only by the way that waits. It is a fault in
 * the office's own door and not in the request, so it answers 500, with this sentence.
 */
const NOT_READ_FIRST =
  "This office reads who sent a request only by the way that waits, and this request was not read that way first. So " +
  "it is not read here, on the server's thread, and nothing was decided about who sent it. The door that asked must " +
  'read the sender first.'

/** The operating system's answer about the far end of one connection, or null when it gives none. */
function theSenderOf(probe: OsProbe, socket: TheSocket): OsSender | null {
  if (probe.senderOfAConnection === undefined && theSenderIsReadByTheWayThatWaits(probe)) throw new PanelError(NOT_READ_FIRST, 500)
  if (probe.senderOfAConnection === undefined) return null
  const ends = theEndsOf(socket)
  if (ends === null) return null
  try {
    return probe.senderOfAConnection(...ends)
  } catch {
    return null
  }
}

/**
 * THE LONGEST A READING BY THE WAY THAT WAITS IS WAITED FOR, in milliseconds. One reading inside the installed Windows
 * app took about four and a half seconds, so this is about twice that. It is shorter than the twenty seconds after
 * which the script itself is stopped (src/config/systems/windows-commands.mjs).
 */
export const THE_LONGEST_A_READING_WAITS = 10_000

let theLongestAReadingWaits = THE_LONGEST_A_READING_WAITS

/** Change how long a reading is waited for. This exists for the tests, which cannot wait ten seconds for a refusal. */
export function useTheLongestAReadingWaits(ms: number): void {
  theLongestAReadingWaits = ms
}

/**
 * The refusal of a request whose reading ran past its time. Nobody knows who sent it, and the office could not find
 * out in time, so it answers 503, with this sentence.
 */
function notReadInTime(ms: number): string {
  return (
    'This request was refused, and nothing was done. The operating system did not say within ' +
    `${String(ms / 1000)} seconds which program on this computer sent it, so Mole Office does not know who sent it. ` +
    'Send the request again.'
  )
}

/** The log's line about a request refused because its reading ran past its time, written when the reading has ended. */
function theLateReading(what: string, ms: number, took: number, sender: OsSender | null): string {
  return (
    `${what} was refused with 503: the operating system did not say within ${String(ms / 1000)} seconds which program ` +
    `sent it. The reading ended after ${(took / 1000).toFixed(1)} seconds, ` +
    `${sender === null ? 'with no answer' : 'with an answer that came too late to be used'}.`
  )
}

/** A request as the request log names it: its method and its address, with what is private kept out. */
function theRequestIn(req: FastifyRequest): string {
  return `${req.method} ${privateRequestLogAddress(req.url)}`
}

/**
 * The same answer, by the probe's way that waits when it has one, and refused in words when it does not come in time.
 * `what` names the request in the log.
 */
async function readTheSenderOf(probe: OsProbe, socket: TheSocket, what: string): Promise<OsSender | null> {
  const read = probe.readSenderOfAConnection?.bind(probe)
  if (read === undefined) return theSenderOf(probe, socket)
  const ends = theEndsOf(socket)
  if (ends === null) return null
  const began = performance.now()
  const reading = (async (): Promise<OsSender | null> => {
    try {
      return await read(...ends)
    } catch {
      return null
    }
  })()
  const ms = theLongestAReadingWaits
  let timer: NodeJS.Timeout | undefined
  let refused = false
  const tooLate = new Promise<never>((_answered, refuse) => {
    timer = setTimeout(named("the wait for a sender's reading", (line) => console.warn(line), () => {
      refused = true
      refuse(new PanelError(notReadInTime(ms), 503, undefined, undefined, undefined, { code: 'senderNotReadInTime', values: { seconds: ms / 1000 } }))
    }), ms)
  })
  void reading.then((sender) => {
    if (refused) console.warn(theLateReading(what, ms, performance.now() - began, sender))
  })
  try {
    return await Promise.race([reading, tooLate])
  } finally {
    clearTimeout(timer)
  }
}

/** Which programs on this computer the probe can find, in the words the sentence about pairing is chosen by. */
export type WhomThisComputerFinds = "any program of this server's user" | "only the installed app's own window" | 'no program'

/**
 * WHOM THIS COMPUTER FINDS, from the probe alone. A probe with no way to read who sent a connection finds no program,
 * one that says `findsOnlyTheAppsOwnWindow` finds only the window, and any other finds every program of this server's
 * user.
 */
export function whomThisComputerFinds(probe: OsProbe = osProbe()): WhomThisComputerFinds {
  if (probe.senderOfAConnection === undefined && probe.readSenderOfAConnection === undefined) return 'no program'
  if (probe.findsOnlyTheAppsOwnWindow === true) return "only the installed app's own window"
  return "any program of this server's user"
}

/**
 * THE PROGRAM BEHIND A REQUEST FROM THIS MACHINE: its pid on this machine and whether it runs in a container this server
 * is not in, as the operating system answers, or null when the office cannot place it (no socket, a probe that cannot
 * say, another user's program, one already gone). Read from the socket and never from the request. The ledger asks it
 * to read a bare pid in the caller's own pid namespace (problem xnfjNO3w2GCQ).
 * It is read by the probe's way that waits where the probe has one.
 */
export async function readTheProgramBehind(req: FastifyRequest): Promise<{ pid: number; inAnotherContainer: boolean } | null> {
  const socket = req.socket ?? req.raw?.socket
  if (socket === undefined || socket === null) return null
  const sender = await readTheSenderOf(osProbe(), socket, theRequestIn(req))
  if (sender === null || !runsAsThisServersUser(sender) || sender.pid === null || sender.inAnotherContainer === null) return null
  return { pid: sender.pid, inAnotherContainer: sender.inAnotherContainer }
}
