// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON'S LOOK AND OWN THEMES, AS THE OFFICE KEEPS THEM (migration 0347), read here once for the
 * whole page and written back through the participant change door.
 *
 * The office is where the look is kept, so a new browser, or one whose storage was cleared, draws the
 * look the person chose. The office is written only when the person chooses a look in the page; a page
 * load never writes it. The browser's own stored choice (`mole-office.preset.theme`) is what the first
 * frame is drawn in, before the office answers, and what is drawn while the office holds none.
 * src/web/components/PresetBar.tsx follows this reading and draws it.
 *
 * FIVE ANSWERS, AND THEY ARE KEPT APART:
 *
 *   loading      the office has not answered yet
 *   elsewhere    nothing here can keep a look in the office: no person is signed in, the office did not
 *                answer, or it did not say; the browser keeps the look, as it did before the office could
 *   none         the office answers that nobody set a look for this person
 *   set          the office holds this look, and it is drawn
 *   unreadable   the office holds a look this build's reader does not take, with the reader's sentences.
 *                It is never taken for none: then the browser's choice would be written over the
 *                themes the person made. The page draws Auto and writes nothing until the person
 *                chooses to keep a new look.
 */

import { useSyncExternalStore } from 'react'

import { isAnUnreadableLook, type TheLook, type TheStoredLook } from '@shared/own-themes.ts'
import { api, errorMessage, getActor, subscribeActor } from '../api.ts'
import { readParticipantsOnce } from './oneread.ts'
import { makeBroadcast } from './store.ts'

export type TheLookInTheOffice =
  | { readonly status: 'loading' }
  | { readonly status: 'elsewhere'; readonly because: string }
  | { readonly status: 'none'; readonly personId: string }
  | { readonly status: 'set'; readonly personId: string; readonly look: TheLook }
  | { readonly status: 'unreadable'; readonly personId: string; readonly why: readonly string[] }

const broadcast = makeBroadcast()
let reading: TheLookInTheOffice = { status: 'loading' }
let requestNumber = 0

function announce(next: TheLookInTheOffice): void {
  reading = next
  broadcast.announce()
}

/** What the office's answer for this person's row says, as one of the answers above. */
function fromTheRow(personId: string, themes: TheStoredLook | undefined): TheLookInTheOffice {
  // THE FIELD IS GIVEN ON A PERSON'S OWN ROW AND ON NO OTHER. A row without it is an office that did
  // not say, which is not the same as one that says nobody set a look.
  if (themes === undefined) return { status: 'elsewhere', because: 'The office did not say which look this person keeps.' }
  if (themes === null) return { status: 'none', personId }
  if (isAnUnreadableLook(themes)) return { status: 'unreadable', personId, why: themes.unreadable }
  return { status: 'set', personId, look: themes }
}

/**
 * READ THE SIGNED-IN PERSON'S OWN ROW for their look, through the roster read the page already makes
 * once (`readParticipantsOnce`), as `src/web/lib/send-key.ts` reads the send key.
 */
export async function readThePersonsLook(fresh = false): Promise<void> {
  const request = ++requestNumber
  const actor = getActor()
  try {
    const reply = await (fresh ? readParticipantsOnce.again() : readParticipantsOnce())
    if (request !== requestNumber) return
    const person = actor.type === 'human' ? reply.people.find((one) => one.id === actor.id) : undefined
    if (person === undefined) {
      announce({ status: 'elsewhere', because: 'No person is signed in on this page, so the look is kept in this browser.' })
      return
    }
    announce(fromTheRow(person.id, person.themes))
  } catch (err: unknown) {
    if (request === requestNumber) announce({ status: 'elsewhere', because: errorMessage(err) })
  }
}

/**
 * KEEP THIS LOOK IN THE OFFICE. The door reads it with the theme reader and the one readability
 * check and refuses it whole, with a sentence for each fault; then nothing was written and the reading
 * here is left as it was. Kept, the reading becomes what the door answers is stored now.
 */
export async function keepTheLook(look: TheLook): Promise<{ ok: true } | { ok: false; why: string }> {
  const now = reading
  if (now.status !== 'none' && now.status !== 'set' && now.status !== 'unreadable') {
    return { ok: false, why: now.status === 'elsewhere' ? now.because : 'The office has not said yet which look this person keeps.' }
  }
  try {
    const reply = await api.changeParticipant('person', now.personId, { themes: look })
    requestNumber++
    announce(fromTheRow(now.personId, reply.participant.themes))
    return { ok: true }
  } catch (err: unknown) {
    return { ok: false, why: errorMessage(err) }
  }
}

/** The reading now, for code that is not a component. */
export function theLookInTheOffice(): TheLookInTheOffice {
  return reading
}

/** Call `listener` each time the reading changes. Returns what stops it. */
export function whenTheLookInTheOfficeChanges(listener: () => void): () => void {
  return broadcast.subscribe(listener)
}

/** The reading, for a component. */
export function useTheLookInTheOffice(): TheLookInTheOffice {
  return useSyncExternalStore(broadcast.subscribe, theLookInTheOffice, theLookInTheOffice)
}

// Read once as the page loads, and again whenever the page acts as somebody else. A page with no
// address to ask from, such as one opened from a file, does not ask, and its look stays 'loading'.
if (typeof window !== 'undefined' && window.location?.protocol?.startsWith('http')) {
  subscribeActor(() => {
    void readThePersonsLook(true)
  })
  void readThePersonsLook()
}
