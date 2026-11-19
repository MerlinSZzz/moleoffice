// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH AGENT THIS BROWSER IS FOLLOWING, WHICH IS THE ONLY THING THAT LETS ONE MOVE THIS PAGE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT FOLLOWING IS, AND WHY IT IS KEPT IN THE BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M8: an agent may offer to take a person to a page, and the page moves only if the
 * person presses the offer or has said they are following that agent. A right-click anywhere lets
 * an agent take the person to that report.
 *
 * Following is about ONE SCREEN, not about a person. The same person at two screens is watching two
 * things, and an agent that moved both because one of them said yes would be moving a page nobody
 * was looking at. So it is kept in this browser, in `localStorage`, and it is not a stored fact
 * about anybody.
 *
 * ---------------------------------------------------------------------------------------
 * THE AGENT IS TOLD, AND THAT PART IS NOT KEPT HERE
 * ---------------------------------------------------------------------------------------
 *
 * Starting and stopping are both announced to the agent as an ordinary message, because an agent
 * that is not told cannot know whether to offer or to lead. Sending that message is the caller's
 * job: this file holds what this browser decided and nothing else.
 *
 * ---------------------------------------------------------------------------------------
 * A BROWSER THAT REFUSES STORAGE IS NOT AN ERROR
 * ---------------------------------------------------------------------------------------
 *
 * `readStored` and `writeStored` answer with whether they worked. When nothing can be read the
 * honest answer is that this browser is following nobody, which is also the safe one: nothing moves.
 */

import { useSyncExternalStore } from 'react'
import { participantFromKey, participantKey } from '@shared/messages.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { makeBroadcast, readStored, writeStored } from './store.ts'

/** Where the decision is kept in this browser. */
export const FOLLOWING_KEY = 'mole-office.following'

const broadcast = makeBroadcast()

/** Held so every reader gets the same object, which is what `useSyncExternalStore` compares. */
let held: ParticipantRef | null = null
let read = false

/** Who this browser is following, or null when it is following nobody. */
export function whoIsBeingFollowed(): ParticipantRef | null {
  if (read) return held
  read = true
  const stored = readStored(FOLLOWING_KEY)
  held = stored.ok && stored.value !== null && stored.value !== '' ? participantFromKey(stored.value) : null
  return held
}

/** Start following one agent. Telling the agent is the caller's job. */
export function startFollowing(who: ParticipantRef): void {
  held = who
  read = true
  writeStored(FOLLOWING_KEY, participantKey(who))
  broadcast.announce()
}

/** Stop following whoever this browser was following. Telling them is the caller's job. */
export function stopFollowing(): void {
  held = null
  read = true
  writeStored(FOLLOWING_KEY, '')
  broadcast.announce()
}

/** Who this browser is following, kept up to date as it changes. */
export function useFollowing(): ParticipantRef | null {
  return useSyncExternalStore(broadcast.subscribe, whoIsBeingFollowed, whoIsBeingFollowed)
}
