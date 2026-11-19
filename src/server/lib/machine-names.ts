// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH ADDRESS IS WHICH MACHINE: THE PERSON'S OWN TABLE, READ AND WRITTEN HERE AND NOWHERE ELSE.
 * Problem 8Kf0hCaK4lQY is settled. A small table in Settings where the person names
 * which address is which machine, written once, so a message reads "from laptop".
 *
 * ---------------------------------------------------------------------------------------
 * WHY A TABLE THEY WRITE, AND NOT THE PRIVATE NETWORK'S NAMES
 * ---------------------------------------------------------------------------------------
 *
 * The private network's name for a caller was asked for. Reading it needs a command, and this
 * server has one operating-system layer, which has no method for running one (lib/machines.ts says so at length).
 * So they name the addresses themselves, once, and the office uses their names.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE IT LIVES, AND WHAT EACH VALUE MEANS
 * ---------------------------------------------------------------------------------------
 *
 * One column on the installation row, `machine_names`, added by migration 0187, beside the office's other
 * settings. It holds a JSON object from address to name. NULL means nobody has named any address. A value that is
 * not such an object is not guessed at: the reader throws a 500 that names the column.
 *
 * AN ADDRESS IS STORED IN ONE FORM. `theAddressAsStored` is the one reading of an address, used both when they
 * write one and when a message's measured address is looked up, so the two cannot disagree about whether
 * "::ffff:192.0.2.10" and "192.0.2.10" are the same address.
 *
 * WHO CHANGED IT, FROM WHAT, TO WHAT AND WHEN is kept in the office's change log (problem 4f6oWJdzJbnk), by the
 * door, through `writeDownASettingChange` in ./records.ts. Nothing here keeps a history of its own.
 */

import { isIP } from 'node:net'

// THE RULE FOR A MACHINE'S NAME lives in src/shared/machine-name.ts, which opens no database, so a tool can check a
// name the same way the Settings table stores one (tools/register-a-run.mjs, --machine).
import { theNameAsStored } from '@shared/machine-name.ts'

import { sqlite } from '../db/client.ts'
// PanelError, SO THE SENTENCE REACHES WHOEVER ASKED. Built only when something throws, never at import, the same
// arrangement lib/inject-setting.ts has with ./records.ts.
import { PanelError } from './panel-error.ts'

/** One address and the name they gave the machine behind it. */
export interface NamedMachine {
  address: string
  name: string
}


/**
 * AN ADDRESS IN THE ONE FORM IT IS STORED AND LOOKED UP IN, or null when the words are not an address.
 *
 * Spaces around it are dropped. An IPv4 address written inside IPv6 ("::ffff:192.0.2.10", which is how a
 * server listening on both kinds of address can see an IPv4 caller) is stored as the IPv4 address. An IPv6
 * address is stored in lower case. Nothing else is rewritten.
 */
export function theAddressAsStored(written: string): string | null {
  const trimmed = written.trim()
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(trimmed)
  const address = mapped?.[1] ?? trimmed
  const kind = isIP(address)
  if (kind === 4) return address
  if (kind === 6) return address.toLowerCase()
  return null
}

/** The stored value exactly as SQLite hands it over, or null because nobody named anything or there is no row. */
function theStoredValue(): unknown {
  const row = sqlite.prepare('SELECT machine_names AS names FROM installation WHERE only_row = 1').get() as
    | { names: unknown }
    | undefined
  return row?.names ?? null
}

function unreadable(why: string): PanelError {
  return new PanelError(
    `The machine names are stored in installation.machine_names, and what is there cannot be read: ${why} ` +
      'Nothing was guessed and nothing was changed.',
    500,
    undefined,
    undefined,
    undefined,
    { code: 'machineNamesUnreadable', values: {} },
  )
}

/**
 * EVERY ADDRESS THEY HAVE NAMED, sorted by name and then by address. An empty list when nobody has named any.
 *
 * Read from the row on every call, with nothing cached, so a name they write holds for the very next message.
 */
export function theMachineNames(): NamedMachine[] {
  const stored = theStoredValue()
  if (stored === null) return []
  if (typeof stored !== 'string') throw unreadable(`it is a ${typeof stored}, not text.`)
  let parsed: unknown
  try {
    parsed = JSON.parse(stored)
  } catch {
    throw unreadable('it is not JSON.')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw unreadable('it is not an object.')
  const out: NamedMachine[] = []
  for (const [address, name] of Object.entries(parsed)) {
    if (theAddressAsStored(address) !== address) throw unreadable(`${JSON.stringify(address)} is not an address in its stored form.`)
    if (typeof name !== 'string') throw unreadable(`the name for ${address} is not text.`)
    const checked = theNameAsStored(name)
    if (!('name' in checked) || checked.name !== name) throw unreadable(`the name for ${address} is not a name in its stored form.`)
    out.push({ address, name })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.address.localeCompare(b.address))
}

/** The name they gave the machine at this address, or null because they gave none or the words are not an address. */
export function theNameTheyGave(address: string): string | null {
  const stored = theAddressAsStored(address)
  if (stored === null) return null
  return theMachineNames().find((one) => one.address === stored)?.name ?? null
}

/**
 * NAME THE MACHINE AT ONE ADDRESS, OR TAKE ITS NAME AWAY, AND ANSWER WITH THE TABLE AS IT NOW STANDS.
 *
 * `name` null takes the name away. The caller has already checked who is asking, and has put the address and the
 * name in their stored forms. An update that changed no row means this database has no installation row, and that
 * is said rather than answered as done.
 */
export function setTheMachineName(address: string, name: string | null): NamedMachine[] {
  const table = new Map(theMachineNames().map((one) => [one.address, one.name]))
  if (name === null) table.delete(address)
  else table.set(address, name)
  const ordered = [...table.entries()].sort(([a], [b]) => a.localeCompare(b))
  const value = ordered.length === 0 ? null : JSON.stringify(Object.fromEntries(ordered))
  const written = sqlite.prepare('UPDATE installation SET machine_names = ? WHERE only_row = 1').run(value)
  if (written.changes !== 1) {
    throw new PanelError(
      'This database has no installation row, so the machine names could not be stored. Nothing was changed.',
      500,
      undefined,
      undefined,
      undefined,
      { code: 'machineNamesNoInstallationRow', values: {} },
    )
  }
  return theMachineNames()
}
