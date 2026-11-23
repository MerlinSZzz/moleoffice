// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MODE A PERSON STARTS IN, taken by a browser that has stored no mode, as decided.
 *
 * The office writes `inspect`, Developer mode, as the starting mode of a person it makes, and NULL on a person it had
 * before, who has been using the office in Normal mode. A browser that has stored a mode keeps it. A browser that has
 * stored none is in Normal mode until the page has read the person it acts as; then it takes that person's starting
 * mode, Developer for `inspect` and Normal for null, and stores it, so every later load reads it from the store.
 *
 * Nothing is taken when the address names a mode, when the store cannot be read or held a word this build does not
 * know, when the page acts as no person, or when the read fails: the page stays in Normal mode, and src/web/lib/mode.ts
 * says why for the store. The desktop window reads the stored word itself, so it follows once the page has stored one.
 */

import { getActor, subscribeActor } from '../api.ts'
import { nothingIsStored, takeAStartingMode } from './mode.ts'
import { readParticipantsOnce } from './oneread.ts'

let requestNumber = 0

/** Read the person the page acts as, and take their starting mode while this browser has stored no mode. */
export async function takeTheStartingMode(fresh = false): Promise<void> {
  if (!nothingIsStored()) return
  const request = ++requestNumber
  const actor = getActor()
  if (actor.type !== 'human') return
  try {
    const reply = await (fresh ? readParticipantsOnce.again() : readParticipantsOnce())
    if (request !== requestNumber) return
    const person = reply.people.find((one) => one.id === actor.id)
    // A mode the person chose while the page was reading is stored by then, and is never replaced.
    if (person === undefined || !nothingIsStored()) return
    takeAStartingMode(person.startingMode === 'inspect' ? 'inspect' : 'normal')
  } catch {
    // A read that failed takes nothing: the page stays in Normal mode, stores nothing, and asks again on the next load.
    return
  }
}

if (typeof window !== 'undefined' && window.location?.protocol?.startsWith('http')) {
  subscribeActor(() => { void takeTheStartingMode(true) })
  void takeTheStartingMode()
}
