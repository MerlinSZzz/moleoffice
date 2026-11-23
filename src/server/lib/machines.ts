// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH MACHINE A REQUEST CAME FROM, AND WHAT PROGRAM WROTE IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * A machine a person works from is identified and recorded, so that Mole Office knows and says which computer
 * somebody was at. The decision says how a machine is named: the trusted private
 * network's name for the caller, and the hostname when the
 * caller is on this machine.
 *
 * Criterion M63 is the first thing to use it: a message records where it was written from.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, AND THE HALF OF THE DECISION THIS DOES NOT BUILD
 * ---------------------------------------------------------------------------------------
 *
 * THE ADDRESS IS THE MEASUREMENT. `callerAddressOf` in ./http.ts reads it from the socket, or from
 * the forwarded header for the door a private network daemon passes requests through, and that
 * file's own comment says which is which and why neither is a guess.
 *
 * THIS MACHINE'S OWN NAME COMES FROM `OsProbe.machineName`, and never from `node:os` here. Anything
 * describing what the machine IS belongs on that interface — src/server/lib/resources.ts says so.
 * A probe that cannot answer means
 * nobody could name the machine, and that is what gets recorded.
 *
 * THE TAILNET'S NAME FOR ANOTHER MACHINE IS NOT READ, AND THAT IS THE HALF OF THE DECISION THIS
 * DOES NOT BUILD. Reading it means running `tailscale status --json`. Exactly two files under
 * `src/` may start a process: the operating-system layer, which has no method for running a command
 * on purpose — the header of src/server/api/export.ts makes that argument at length — and the
 * message worker's own. A third spawner fails the boundary test, and climbing that fence to put a
 * nicer label on a message would be the wrong trade.
 *
 * SO A CALLER FROM ANOTHER MACHINE IS MEASURED BY ITS ADDRESS, MARKED AS AN ADDRESS. `how` says
 * which it is, every screen draws it as "the address 192.0.2.10" rather than as a machine
 * somebody called that, and nothing anywhere claims to know the address is cedar. That is an
 * incomplete answer said out loud, which this product prefers to a plausible one.
 *
 * ---------------------------------------------------------------------------------------
 * UNLESS THE PERSON HAS NAMED THE ADDRESS
 * ---------------------------------------------------------------------------------------
 *
 * The person names which address is which machine in a table in Settings (lib/machine-names.ts), which settles
 * problem 8Kf0hCaK4lQY, so a message reads "from laptop". `writtenFrom` below still
 * measures only the address, because the visitor and
 * registration gates compare what it measured with the machines this office trusts, and a name they
 * gave is not a measurement. The name is put on when a message is STORED, by `asAMessageStoresIt`:
 * `how` says the name is their name for the address, and the address is kept beside it. A message
 * keeps the name it was stored with, so renaming an address later does not rewrite what earlier
 * messages said.
 */

import type { FastifyRequest } from 'fastify'

import { PROGRAM_HEADER } from '@shared/messages.ts'
import { THE_PERSONS_NAME_FOR_THE_ADDRESS } from '@shared/renamed-words.ts'
import { arrivalOf } from '@shared/arrival-of.ts'
import { callerAddressOf } from './caller-address-of.ts'
import { headerValue } from './header-value.ts'
import { theMachineNames, theNameTheyGave } from './machine-names.ts'
// THE ONE PLACE UNDER src/ THAT MAY ASK THE MACHINE ANYTHING ABOUT ITSELF. See the header.
import { osProbe } from './resources.ts'

/**
 * WHAT THIS MACHINE CALLS ITSELF, or null because the probe in use cannot say.
 *
 * One line, and a named function anyway, because a caller that asked the probe itself would be a
 * caller free to invent a fall-back the day the probe answers null.
 */
export function thisMachine(): string | null {
  return osProbe().machineName?.() ?? null
}

/**
 * WHETHER A ROW NAMES ANOTHER MACHINE.
 *
 * Problem `pvpFkZTZRoyY`: a session row may name the machine it was on, and the session kind's
 * `machine` key exists for that, the same word the file kinds use — absent meaning this machine.
 * A row that names a machine is only closable by the reads of the machine it names: a path or a pid
 * is meaningful where the run wrote them, which is not here. So the row closers in ./own-rows.ts
 * skip such a row rather than read this machine's disk for it, the main-world count leaves it out
 * (./main-world.ts), and a seal or a check of its code is refused (./sealed-tip.ts, ./inspection.ts).
 * All four ask this one function, so they cannot disagree about which rows are elsewhere. The
 * absence itself is every row already on the record, which this machine's reads have always been
 * the reading of.
 *
 * THIS MACHINE'S NAME COMES FROM `thisMachine`, and it can be null when the probe cannot answer.
 * A named row is then left alone too: to close a named row by this machine's disk would be to
 * guess which of the two machines that name belongs to, and a live run on the far one is exactly
 * the row this must not close.
 */
export function theRowNamesAnotherMachine(row: { data: Record<string, unknown> }): boolean {
  const named = row.data['machine']
  if (typeof named !== 'string' || named === '') return false
  return named !== thisMachine()
}

/**
 * WHY A RUN MAY NOT SAY IT WORKS ON THIS MACHINE NAME, or null when it may.
 *
 * A run of an agent that names another computer is read as elsewhere by every reader of
 * `theRowNamesAnotherMachine`: its seal of code is refused, the check of its code is refused, and the
 * sweeps leave it alone. So the name must be one somebody can defend. It may be this computer's own
 * name, or a name the owner gave an address in their table on the Settings page, in
 * ./machine-names.ts. Any other name is a computer nobody added, and is refused (a condition,
 * message Mtt-iDulvWDc). Absent is this computer, as it always was.
 */
export function whyARunsMachineIsNotKnown(named: unknown): string | null {
  if (named === undefined || named === null) return null
  const here = thisMachine()
  if (typeof named === 'string' && named !== '' && (named === here || theMachineNames().some((one) => one.name === named))) return null
  const their = [...new Set(theMachineNames().map((one) => one.name))]
  return (
    `A run says which computer it works on with a name the owner gave that computer's address on the Settings page, ` +
    `or with this computer's own name${here === null ? ', which this computer could not say' : `, ${here}`}. ` +
    `${JSON.stringify(named)} is neither: ` +
    (their.length === 0 ? 'the owner has named no machine yet. ' : `the owner's table names ${their.join(', ')}. `) +
    'The owner names a machine under "Machine names" on the Settings page. Nothing was written.'
  )
}

/**
 * WHETHER A CONNECTION'S OWN ADDRESS IS ONE OF THIS MACHINE'S ADDRESSES, loopback left out.
 *
 * A request whose connection comes from one of this machine's own addresses counts as this machine,
 * by the owner, on 25 September 2026. The owner opened the office on this machine at its
 * tailnet address, and that connection comes from the tailnet address, which is this machine's own.
 * `address` must be the address at the other end of the socket. An address a request wrote in a
 * header is never passed here, and the one caller, the door in src/server/index.ts that other
 * machines reach directly, reads the socket and nothing else.
 *
 * THE ADDRESSES ARE ASKED OF THE PROBE ON EVERY CALL, because a tailnet address can appear after the
 * server starts. A probe that cannot say answers no address as this machine's.
 *
 * LOOPBACK IS LEFT OUT, AND ON PURPOSE, BY THE PROBE: `ownAddresses` names no address the operating
 * system marks as loopback. In real use this door is bound to the address other machines reach, and a
 * program on this machine that connects to that address connects from that same address, not from
 * loopback. Loopback has its own door, the first listener on 127.0.0.1, which already stamps every
 * request this machine. The only way a loopback address reaches this door is a door bound to a
 * loopback address, and that is how the tests stand in for another machine: they bind it to 127.0.0.2
 * and connect to it, and such a connection comes from 127.0.0.1, which the probe does not name.
 */
export function anAddressOfThisMachine(address: string | undefined): boolean {
  if (address === undefined) return false
  return theAddressesOfThisMachine().includes(address)
}

/**
 * THIS MACHINE'S OWN ADDRESSES, loopback left out, as the probe names them now, or none when it cannot say. The one
 * place they are read, so the Host check's list of the office's pages (./a-host-that-is-not-this-office.ts) and the
 * question above give one answer.
 */
export function theAddressesOfThisMachine(): readonly string[] {
  return osProbe().ownAddresses?.() ?? []
}

/**
 * WHERE A REQUEST WAS WRITTEN FROM: the machine, and the program the writer says it is.
 *
 * `machine` is a name where one could be read and an ADDRESS where one could not, and `how` says
 * which of the three it is, so nothing downstream has to guess whether it is holding a name.
 * `program` is whatever the writer said, or null because it said nothing.
 */
export interface WrittenFrom {
  /** The machine's own name, or the address it was reached at, or null because neither is known. */
  machine: string | null
  /**
   * How `machine` was arrived at. `an address` means nobody could put a name to it.
   *
   * THERE IS NO WORD HERE FOR "THE PRIVATE NETWORK NAMED IT", and that is deliberate: nothing
   * produces one. See the header for why naming another machine is not built. A word declared and
   * never written would be a claim about what Mole Office can do, read by every screen that draws
   * this field.
   */
  how: 'this machine' | 'an address' | 'nobody could tell'
  /** The browser or runtime the writer said it is writing in, or null because it said nothing. */
  program: string | null
}

/**
 * WHERE A MESSAGE WAS WRITTEN FROM, AS THE MESSAGE STORES IT: what `writtenFrom` measured, with the
 * person's name for the address put on where they gave one.
 */
export interface StoredWrittenFrom {
  /** The machine's own name, the person's name for the address, the address itself, or null. */
  machine: string | null
  /** As `WrittenFrom['how']`, and `the name the person gave the address` when `machine` is that name. */
  how: WrittenFrom['how'] | typeof THE_PERSONS_NAME_FOR_THE_ADDRESS
  /** The address the name stands for. Present only when `how` is `the name the person gave the address`. */
  address?: string
  program: string | null
}

/**
 * WHAT A MESSAGE STORES ABOUT WHERE IT WAS WRITTEN FROM. An address the person has named becomes their
 * name for it, with the address kept beside it. Everything else is stored as it was measured.
 */
export function asAMessageStoresIt(measured: WrittenFrom): StoredWrittenFrom {
  if (measured.how !== 'an address' || measured.machine === null) return measured
  const name = theNameTheyGave(measured.machine)
  if (name === null) return measured
  return { machine: name, how: THE_PERSONS_NAME_FOR_THE_ADDRESS, address: measured.machine, program: measured.program }
}

/** The longest a program's name may be. A word or two; anything longer is not a name. */
const LONGEST_PROGRAM_NAME = 60

export function writtenFrom(req: FastifyRequest): WrittenFrom {
  const program = programOf(req)

  // FROM THIS MACHINE, THE MACHINE IS THIS ONE, and its name is the one it calls itself. There is
  // no address to look up: the socket's peer address for a local call is a loopback address or one
  // of this machine's own addresses, and the machine's own name says more than either.
  if (arrivalOf(req) !== 'another machine') {
    const here = thisMachine()
    return here === null
      ? { machine: null, how: 'nobody could tell', program }
      : { machine: here, how: 'this machine', program }
  }

  const address = callerAddressOf(req)
  if (address === null) return { machine: null, how: 'nobody could tell', program }
  // NOBODY IS ASKED WHAT THAT ADDRESS IS CALLED. See the header: a tailnet's names need a command,
  // and this server has one operating-system layer, which has no method for running one.
  return { machine: address, how: 'an address', program }
}

/**
 * WHAT THE WRITER SAID IT IS WRITING IN, trimmed, or null.
 *
 * A LONG VALUE IS CUT AND NOT REFUSED. This is a line beside a message rather than an identity, so
 * a browser that sends its whole user-agent string gets the first words of it on the message rather
 * than a refused write. Blank is absence — the same rule every header in ./http.ts answers to,
 * except that here absence is ordinary rather than a fault: `curl` says nothing and never will.
 */
function programOf(req: FastifyRequest): string | null {
  const said = headerValue(req, PROGRAM_HEADER)
  if (said === undefined) return null
  const trimmed = said.trim()
  if (trimmed === '') return null
  return trimmed.slice(0, LONGEST_PROGRAM_NAME)
}
