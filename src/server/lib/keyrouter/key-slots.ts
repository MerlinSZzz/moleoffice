// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KEY SLOTS IN THE PROVIDER ROUTER'S KEY SLOTS FILE, as the Settings page reads, adds and removes them. The owner
 * adds or removes a key with a press. The router turns between the OpenCode Go slots in the order the file holds them
 * (tools/provider-router.mjs); the file's reader and writer are the router's own, in
 * src/config/provider-router.mjs, so the page and the router read one file in one way.
 *
 * EVERY ROUTED PROVIDER HAS A SLOT: OpenCode Go's subscriptions, DeepSeek's key, OpenRouter's key and OpenAI's key.
 * The Go slots are the only ones the router turns between; the others always use their first slot. A slot's provider
 * is one of the names in THE_ROUTED_PROVIDERS, and a name the router does not route is refused.
 *
 * NO ANSWER HOLDS A KEY. A slot is answered by its provider, its id, its label and the start of its key's sha256. A key
 * travels only in the add request, is written into the file at mode 0600 and is dropped. Each door refuses while the
 * router is off.
 */
import { lstatSync } from 'node:fs'
import type { GoSlotsReading, KeySlotsReading } from '@shared/go-slots.ts'
import { aSecretsMark, readTheGoPin, readTheKeySlots, theGoPinFile, theKeySlotsFile, THE_ROUTED_PROVIDERS, writeTheGoPin, writeTheKeySlots } from '../../../config/provider-router.mjs'
import { theOwnersHome } from '../../../config/install-the-entry.mjs'
import { PanelError } from '../panel-error.ts'
import { refuseWhileOff } from './provider-router.ts'

const GO = 'opencode-go'
const THE_FILE_AS_NAMED = theKeySlotsFile('~')

type Slot = ReturnType<typeof readTheKeySlots>[number]

/** The file's slots, none when it does not exist yet. A file the router would not read is refused with its reader's sentence. */
function theSlotsInTheFile(): { file: string; slots: Slot[] | null } {
  const file = theKeySlotsFile(theOwnersHome())
  // A file that is not there yet is no slot, and the first press writes it. Every other reason is the reader's own.
  if (lstatSync(file, { throwIfNoEntry: false }) === undefined) return { file, slots: null }
  try {
    return { file, slots: readTheKeySlots(file) }
  } catch (error) {
    throw new PanelError(`${error instanceof Error ? error.message : String(error)} Nothing was changed.`, 409)
  }
}

/** The slots of one provider, for a caller that turns between them or names them in a notice. */
function theReadingOfOneProvider(slots: Slot[] | null, provider: string): GoSlotsReading {
  const named = THE_ROUTED_PROVIDERS[provider as keyof typeof THE_ROUTED_PROVIDERS].named
  const its = (slots ?? []).filter((one) => one.provider === provider)
  const others = (slots ?? []).length - its.length
  const says = slots === null
    ? `The key slots file ${THE_FILE_AS_NAMED} does not exist yet, so the provider router holds no ${named} key. Adding a slot writes it.`
    : `The key slots file ${THE_FILE_AS_NAMED} holds ${its.length === 1 ? 'one' : String(its.length)} ${named} ${its.length === 1 ? 'slot' : 'slots'}` +
      (others === 0 ? '.' : `, and ${others === 1 ? 'one slot' : `${String(others)} slots`} of another provider.`)
  return { file: THE_FILE_AS_NAMED, slots: its.map(({ id, label, key }) => ({ id, label, mark: aSecretsMark(key) })), says }
}

/** The whole file as the Settings page draws it: every routed provider, every slot, and no key. */
function theReadingOf(slots: Slot[] | null): KeySlotsReading {
  const all = slots ?? []
  const providers = Object.entries(THE_ROUTED_PROVIDERS).map(([id, one]) => ({ id, named: one.named }))
  const says = slots === null
    ? `The key slots file ${THE_FILE_AS_NAMED} does not exist yet, so the provider router holds no key. Adding a slot writes it.`
    : `The key slots file ${THE_FILE_AS_NAMED} holds ${all.length === 1 ? 'one slot' : `${String(all.length)} slots`}.`
  return {
    file: THE_FILE_AS_NAMED,
    providers,
    pin: readTheGoPin(theGoPinFile(theKeySlotsFile(theOwnersHome()))),
    slots: all.map(({ id, provider, label, key }) => ({
      id,
      provider,
      providerName: THE_ROUTED_PROVIDERS[provider as keyof typeof THE_ROUTED_PROVIDERS].named,
      label,
      mark: aSecretsMark(key),
    })),
    says,
  }
}

function writeThem(file: string, slots: Slot[]): void {
  try {
    writeTheKeySlots(file, slots)
  } catch (error) {
    throw new PanelError(`${error instanceof Error ? error.message : String(error)} Nothing was changed.`, 409)
  }
}

/** The OpenCode Go slots in the key slots file, each without its key. The launcher's long-wait notice reads these. */
export function theGoSlots(): GoSlotsReading {
  refuseWhileOff()
  return theReadingOfOneProvider(theSlotsInTheFile().slots, GO)
}

/** Every slot in the key slots file, each without its key. Nothing is written. */
export function theKeySlots(): KeySlotsReading {
  refuseWhileOff()
  return theReadingOf(theSlotsInTheFile().slots)
}

/**
 * ADDS ONE SLOT for a routed provider, after every slot the file holds, under the first of <provider>-1, <provider>-2, …
 * the file does not hold. OpenCode Go keeps its shorter `go-1` prefix. A key the file already holds is refused by the
 * label of the slot that holds it, and a provider the router does not route is refused by name.
 */
export function addAKeySlot(provider: string, label: string, key: string): KeySlotsReading {
  refuseWhileOff()
  if (!Object.hasOwn(THE_ROUTED_PROVIDERS, provider)) {
    throw new PanelError(`The provider router does not route ${provider}, so no slot was added. It routes ${Object.keys(THE_ROUTED_PROVIDERS).join(', ')}.`, 400)
  }
  const { file, slots } = theSlotsInTheFile()
  const all = slots ?? []
  const holder = all.find((one) => one.key === key)
  if (holder !== undefined) {
    throw new PanelError(`That key is already in the slot ${holder.id}, "${holder.label}", so it was not added again. Nothing was changed.`, 409)
  }
  const prefix = provider === GO ? 'go' : provider
  let number = 1
  while (all.some((one) => one.id === `${prefix}-${String(number)}`)) number += 1
  const kept = [...all, { id: `${prefix}-${String(number)}`, provider, label, key }]
  writeThem(file, kept)
  return theReadingOf(kept)
}

/** REMOVES ONE SLOT and keeps every other slot as it was. An id the file does not hold is refused. */
export function removeAKeySlot(id: string): KeySlotsReading {
  refuseWhileOff()
  const { file, slots } = theSlotsInTheFile()
  const all = slots ?? []
  if (!all.some((one) => one.id === id)) {
    throw new PanelError(`The key slots file holds no slot ${id}, so nothing was removed.`, 404)
  }
  const kept = all.filter((one) => one.id !== id)
  writeThem(file, kept)
  return theReadingOf(kept)
}

/** Set or clear the Go pin after checking that a selected slot is a Go slot. */
export function setTheGoPin(id: string | null, who: string): KeySlotsReading {
  refuseWhileOff()
  const { file, slots } = theSlotsInTheFile()
  if (id !== null && !(slots ?? []).some((slot) => slot.id === id && slot.provider === GO)) {
    throw new PanelError('The pin must name an existing Go slot. Nothing was changed.', 400)
  }
  writeTheGoPin(theGoPinFile(file), id === null ? null : { slot: id, who, at: new Date().toISOString() })
  return theReadingOf(slots)
}
