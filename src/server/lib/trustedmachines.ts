// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MACHINES THIS OFFICE TRUSTS, READ AND WRITTEN. Criterion P73.
 *
 * The measurement that made this exist, and what the list decides, are in @shared/trustedmachines.ts
 * beside the shape. This file is the table.
 */

import { anOfficeId } from './ids.ts'

import { nowStamp } from '@shared/time.ts'
import { hostOf } from '@shared/visitors.ts'
import {
  THE_ENVIRONMENT_PUT_IT_HERE,
  WHAT_THE_LIST_DECIDES,
  isHowAMachineIsTrusted,
  theOfficeTrusts,
  whyThisMachineIsRefused,
  type HowAMachineIsTrusted,
  type TrustedMachine,
  type WhatTheOfficeTrusts,
} from '@shared/trustedmachines.ts'
import type { ParticipantRef } from '@shared/participants.ts'

import { sqlite } from '../db/client.ts'
import { PanelError } from './panel-error.ts'
import { settings } from '../../config/settings.mjs'

interface Row {
  id: string
  address: string
  note: string | null
  how: string
  credential_id: string | null
  added_at: string
  added_by_kind: string | null
  added_by_id: string | null
  removed_at: string | null
  removed_by_kind: string | null
  removed_by_id: string | null
  removed_because: string | null
}

function asMachine(row: Row): TrustedMachine {
  const how: HowAMachineIsTrusted = isHowAMachineIsTrusted(row.how) ? row.how : 'a press'
  return {
    id: row.id,
    address: row.address,
    note: row.note,
    how,
    credential: row.credential_id,
    addedAt: row.added_at,
    addedBy:
      row.added_by_kind === null || row.added_by_id === null
        ? null
        : { kind: row.added_by_kind, id: row.added_by_id },
    removedAt: row.removed_at,
    removedBy:
      row.removed_by_kind === null || row.removed_by_id === null
        ? null
        : { kind: row.removed_by_kind, id: row.removed_by_id },
    removedBecause: row.removed_because,
    // THE ONE ROW A PRESS MAY NOT REMOVE. The environment decides what the server bound and no press
    // here unbinds a socket, so removing the row would leave the door open and the list saying shut.
    mayBeRemoved: how !== 'the environment',
  }
}

/** Every machine still trusted, newest first. */
export function machinesTrustedHere(): TrustedMachine[] {
  const rows = sqlite
    .prepare('SELECT * FROM trusted_machines WHERE removed_at IS NULL ORDER BY added_at DESC, id DESC')
    .all() as Row[]
  return rows.map(asMachine)
}

/** Every machine somebody removed, newest first. The office does not delete who it once trusted. */
export function machinesNoLongerTrusted(): TrustedMachine[] {
  const rows = sqlite
    .prepare('SELECT * FROM trusted_machines WHERE removed_at IS NOT NULL ORDER BY removed_at DESC, id DESC')
    .all() as Row[]
  return rows.map(asMachine)
}

/** The whole answer, as the world's page, the Settings panel and GET /api/access draw it. */
export function whatTheOfficeTrusts(): WhatTheOfficeTrusts {
  return {
    machines: machinesTrustedHere(),
    removed: machinesNoLongerTrusted(),
    says: WHAT_THE_LIST_DECIDES,
    boundByTheEnvironment: theAddressTheEnvironmentNamed(),
  }
}

/** Whether one machine is trusted right now, by the one reading of "the same machine". */
export function thisOfficeTrusts(machine: string | null): boolean {
  return theOfficeTrusts(machine, machinesTrustedHere())
}

/** The address the environment named for other machines, or null because it named none. */
function theAddressTheEnvironmentNamed(): string | null {
  const said: unknown = settings().otherMachines
  if (typeof said !== 'object' || said === null) return null
  const host = (said as { host?: unknown }).host
  return typeof host === 'string' && host.trim() !== '' ? host.trim() : null
}

/**
 * ADD A MACHINE. Refuses a name that is not one, and a machine already on the list.
 *
 * A MACHINE THAT WAS REMOVED CAN BE ADDED AGAIN, and doing so writes a NEW row rather than clearing
 * the old one's `removed_at`. Both rows stay: the person removed it then and trusts it now, and the list of
 * removed ones is where the person can see that they changed their mind.
 */
export function trustThisMachine(
  address: string,
  by: ParticipantRef | null,
  how: HowAMachineIsTrusted,
  note: string | null,
  credentialId: string | null,
): TrustedMachine {
  const wrong = whyThisMachineIsRefused(address)
  if (wrong !== null) throw new PanelError(wrong, 400)
  const said = address.trim()
  const already = machinesTrustedHere().find((one) => hostOf(one.address) === hostOf(said))
  if (already !== undefined) {
    throw new PanelError(
      `This office already trusts ${already.address}, added ${already.addedAt}. Nothing was written.`,
      409,
    )
  }
  const id = anOfficeId()
  sqlite
    .prepare(
      'INSERT INTO trusted_machines (id, address, note, how, credential_id, added_at, added_by_kind, added_by_id) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(id, said, note?.trim() === '' ? null : (note?.trim() ?? null), how, credentialId, nowStamp(), by?.kind ?? null, by?.id ?? null)
  const written = sqlite.prepare('SELECT * FROM trusted_machines WHERE id = ?').get(id) as Row
  return asMachine(written)
}

/** Remove a machine, with who and when. The row stays and reads as removed. */
export function stopTrustingThisMachine(id: string, by: ParticipantRef | null, because: string | null): TrustedMachine {
  const row = sqlite.prepare('SELECT * FROM trusted_machines WHERE id = ?').get(id) as Row | undefined
  if (row === undefined) throw new PanelError(`No machine on this list has the id "${id}". Nothing was written.`, 404)
  const held = asMachine(row)
  if (held.removedAt !== null) {
    throw new PanelError(`${held.address} was already removed, ${held.removedAt}. Nothing was written.`, 409)
  }
  if (!held.mayBeRemoved) throw new PanelError(THE_ENVIRONMENT_PUT_IT_HERE, 409)
  sqlite
    .prepare(
      'UPDATE trusted_machines SET removed_at = ?, removed_by_kind = ?, removed_by_id = ?, removed_because = ? ' +
        'WHERE id = ?',
    )
    .run(nowStamp(), by?.kind ?? null, by?.id ?? null, because?.trim() === '' ? null : (because?.trim() ?? null), id)
  return asMachine(sqlite.prepare('SELECT * FROM trusted_machines WHERE id = ?').get(id) as Row)
}

/**
 * PUT THE ADDRESS THE ENVIRONMENT NAMED INTO THE LIST, when the server starts.
 *
 * WHY THE SERVER WRITES A ROW AT ALL. The environment names an address and the process binds a
 * socket on it, and until this row existed there was nothing anywhere saying so that a person could
 * read. A list of trusted machines that did not hold the one machine the office had actually opened
 * a door for would be a list that contradicted the server.
 *
 * IT IS WRITTEN ONCE AND NOT REWRITTEN. A row already on the list for that machine — however it got
 * there — is left as it is, so a machine the person added by a press does not turn into the environment's.
 * Nothing is removed when the environment stops naming one either: what was trusted stays trusted
 * until somebody removes it, and the row says the environment put it there.
 */
export function recordTheAddressTheEnvironmentNamed(): void {
  const host = theAddressTheEnvironmentNamed()
  if (host === null) return
  if (thisOfficeTrusts(host)) return
  if (whyThisMachineIsRefused(host) !== null) return
  trustThisMachine(host, null, 'the environment', null, null)
}
