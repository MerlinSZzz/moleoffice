// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The router's Go switch log, kept beside the key slots file. */
import { randomBytes } from 'node:crypto'
import { closeSync, constants, fchmodSync, openSync, writeSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { aSecretsMark, thePrivateGoStateFolder } from '../../src/config/provider-router.mjs'

export const theGoSwitchLogFile = (slotsFile) => join(dirname(slotsFile), 'go-switches.jsonl')

/** Only these three fields can cross from a slot into a switch record. */
function theSlotMark(slot) { return { id: slot.id, label: slot.label, mark: aSecretsMark(slot.key) } }

/** Append one JSON line and return its correlation id. Null disables writing for a router constructed without a state path. */
export function writeTheGoSwitch(file, given) {
  const id = `gs_${randomBytes(12).toString('hex')}`
  const entry = given.event === 'hand-off'
    ? { id, at: given.at, event: 'hand-off', run: given.run, from: theSlotMark(given.from), to: theSlotMark(given.to) }
    : { id, at: given.at, event: 'dsh', agent: given.agent, slots: given.slots.map(theSlotMark) }
  if (file === null) return id
  thePrivateGoStateFolder(file)
  const fd = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW, 0o600)
  try {
    fchmodSync(fd, 0o600)
    writeSync(fd, `${JSON.stringify(entry)}\n`)
  } finally { closeSync(fd) }
  return id
}
