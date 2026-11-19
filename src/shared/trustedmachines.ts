// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MACHINES THIS OFFICE TRUSTS — CRITERION P73.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS ASKED, AND WHAT WAS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * The trusted devices or addresses could not be adjusted in Settings or in Worlds, and it was
 * decided where the
 * setting goes: the machines this office trusts belong to the installation rather than to a person's
 * preferences, so the list lives on the world's page and Settings shows it read-only.
 *
 * MEASURED THAT EVENING, before any of this existed:
 *
 *   · **No list.** No table, no setting, nothing a person could adjust anywhere.
 *   · **The door other machines call** is decided by which SOCKET a request arrived on.
 *     `stampArrival` in src/server/lib/http.ts writes `this machine` or `another machine`, and no
 *     header sets it.
 *   · **MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES** is read in exactly one place,
 *     src/config/settings.mjs, and names the address the server binds. Changing it means editing a
 *     file and restarting, which chapter 10's fourth rule forbids asking the person to do.
 *   · **The visitor gate reads no address at all.** A credential's machine is recorded and
 *     deliberately never compared: `FACTS_COMPARED` in ./visitors.ts holds the conversation path and
 *     the start directory and nothing else, and the note there says why.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE LIST DECIDES, AND WHAT IT DOES NOT
 * ---------------------------------------------------------------------------------------
 *
 * IT IS THE OFFICE'S ONE ANSWER TO ONE QUESTION: which machines does this office trust. Everything
 * that asks that question asks this list — `GET /api/access` answers from it, and the visitor gate
 * marks each request with whether the machine it came from is on it.
 *
 * IT REFUSES NOTHING, AND THAT IS DELIBERATE. Whether a request from a machine the office does not
 * trust is refused or only marked is question Q2 of design/permissions/ACCEPTANCE.md section 6, and
 * that answer is the person's. Marking leaves both of their answers open; refusing would have to be unbuilt for
 * one of them.
 *
 * IT DOES NOT DECIDE WHAT THE SERVER BINDS. A socket is opened when the process starts, from the
 * environment, and no press here closes one. The address the environment named is written INTO the
 * list when the server starts, so the list says what the office actually opened a door for; a press
 * cannot remove such a row, and the refusal says why.
 */

import { hostOf } from './visitors.ts'

/** How a row came to be here. Three ways, and a row says which. */
export const HOW_A_MACHINE_IS_TRUSTED = ['a press', 'a credential', 'the environment'] as const
export type HowAMachineIsTrusted = (typeof HOW_A_MACHINE_IS_TRUSTED)[number]

export function isHowAMachineIsTrusted(value: unknown): value is HowAMachineIsTrusted {
  return typeof value === 'string' && (HOW_A_MACHINE_IS_TRUSTED as readonly string[]).includes(value)
}

/** One machine this office trusts, or once trusted. */
export interface TrustedMachine {
  id: string
  /** The device name, hostname or address, as it was written. */
  address: string
  /** What somebody wrote about this machine, or null because nobody said. */
  note: string | null
  how: HowAMachineIsTrusted
  /** The credential whose confirmation added this row, or null. */
  credential: string | null
  /** Local wall clock. */
  addedAt: string
  /** Who added it, or null on a row the server wrote itself from the environment. */
  addedBy: { kind: string; id: string } | null
  /** Local wall clock, or null because this machine is still trusted. */
  removedAt: string | null
  removedBy: { kind: string; id: string } | null
  removedBecause: string | null
  /**
   * Whether a press may remove this row. False on a row the environment put here: the environment
   * decides what the server binds and no press unbinds a socket.
   */
  mayBeRemoved: boolean
}

/** What GET /api/office/trusted-machines answers. */
export interface WhatTheOfficeTrusts {
  /** The machines trusted right now, newest first. */
  machines: TrustedMachine[]
  /** The ones somebody removed, kept because the office does not delete who it once trusted. */
  removed: TrustedMachine[]
  /** What this list decides and what it does not, in one sentence, said by the server. */
  says: string
  /** The address the environment named and the server bound, or null because it named none. */
  boundByTheEnvironment: string | null
}

/**
 * WHETHER A MACHINE IS ONE OF THE TRUSTED ONES.
 *
 * IT COMPARES BY `hostOf`, the one reading of "the same machine" this product has, so a row written
 * as a bare name, as `name:<port>` and as `http://name/` all answer the same. A machine nobody could
 * name answers FALSE — never a match, because an unknown is not a trusted one.
 *
 * THE ANSWER IS THREE-VALUED WHERE IT IS ASKED. This function answers two, and its callers keep the
 * third: null for a request nobody could put a machine to, which is a different fact from a machine
 * that is not on the list and leads a reader somewhere else.
 */
export function theOfficeTrusts(machine: string | null, trusted: readonly TrustedMachine[]): boolean {
  const asked = hostOf(machine)
  if (asked === null) return false
  return trusted.some((one) => one.removedAt === null && hostOf(one.address) === asked)
}

/** What is wrong with a machine somebody typed, in a sentence, or null because nothing is. */
export function whyThisMachineIsRefused(address: string): string | null {
  const said = address.trim()
  if (said === '') return 'A machine is named by its device name, its hostname or its address, and this was blank.'
  if (said.length > LONGEST) {
    return `A machine's name is at most ${String(LONGEST)} characters, and this one is ${String(said.length)}.`
  }
  if (hostOf(said) === null) {
    return `"${said}" has no machine in it. Write the device name, the hostname or the address.`
  }
  // EVERY ADDRESS IS NOT A MACHINE. The same four spellings src/config/settings.mjs refuses when the
  // environment names one, refused here for the same reason: it names every machine, which is what
  // trusting nothing in particular looks like.
  if (EVERY_MACHINE.includes(hostOf(said) as string)) {
    return (
      `"${said}" means every address this computer has, which is not a machine. Name the one machine you mean, ` +
      'or leave the list empty.'
    )
  }
  return null
}

const LONGEST = 200
const EVERY_MACHINE = ['0.0.0.0', '::', '*', '0']

/** What the list decides, in the words every screen and the API reply draw. */
export { WHAT_THE_LIST_DECIDES } from './what-the-trusted-list-decides.ts'

/** Said where a press tries to remove the row the environment put here. */
export const THE_ENVIRONMENT_PUT_IT_HERE =
  'This machine is the address the environment named and this server bound when it started, so the list says what ' +
  'the office actually opened a door for. A press here cannot unbind a socket, so removing the row would leave the ' +
  'door open and the list saying it was shut. Change MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES and start the server ' +
  'again, and the row goes with it.'
