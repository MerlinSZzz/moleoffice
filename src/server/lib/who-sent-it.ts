// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO SENT A MESSAGE, IN THE WORDS EVERY HAND-OVER PRINTS. Problem ynGL0myEnAbi.
 *
 * Since wave 13b a new agent's id is minted, for example WNHuOwWZxXdf, and is no longer its handle.
 * A hand-over that printed the stored id alone told the reader nothing about who wrote. This reads
 * the sender in the registries, and `DELIVERY_ENVELOPE.theSender` in src/shared/messages.ts turns
 * what it found into words.
 *
 * ONE PLACE, CARRIED BY EVERY DOOR THAT HANDS A MESSAGE OVER (invariant 9). A tool has no database,
 * so it cannot read the registry itself. The took door (the waiter), the message pool (the dsh hook)
 * and the worker's queue and runs (the run prompt) each call this and carry the words, and each
 * caller passes them to `deliveryEnvelope` unchanged.
 *
 * A MESSAGE'S `sentBy` IS A STORED REFERENCE (criterion I2). It is read by exact id first. Failing
 * that, it is read as a handle, because a message written before the mint holds the handle, and a
 * handle may be borne by one live agent and any number of retired ones. Where no agent or more than
 * one answers, nobody is named and the words say so.
 */

import { sqlite } from '../db/client.ts'
import { type AgentIdentity } from './agent-references.ts'
import { everyAgentAReferenceCouldName } from '../db/agent-references.ts'
import { readParticipant } from '../db/read-participant.ts'
import { DELIVERY_ENVELOPE, participantKey, type TheGroupOfAHandOver, type TheSenderAsRead } from '@shared/messages.ts'
import { isParticipantKind, type ParticipantRef } from '@shared/participants.ts'
import { theAddressAsInWords } from '@shared/address-as.ts'
import { readGroup } from '../db/read-group.ts'
import { EVERY_PROJECT } from '@shared/which-projects.ts'

/** One stored `sentBy` as a participant reference, or null because it is not one. The one check of its shape. */
function theStoredSender(sentBy: unknown): ParticipantRef | null {
  const held = sentBy as { kind?: unknown; id?: unknown } | null | undefined
  if (held === null || typeof held !== 'object' || !isParticipantKind(held.kind) || typeof held.id !== 'string') return null
  return { kind: held.kind, id: held.id }
}

/** What the registries say about one stored `sentBy`. */
export function theSenderAsRead(sentBy: unknown): TheSenderAsRead {
  const held = theStoredSender(sentBy)
  if (held === null) return { found: 'nobody-was-recorded' }
  const stored = held.id
  if (held.kind === 'person') {
    const person = readParticipant({ kind: 'person', id: stored })
    return person === null
      ? { found: 'nobody-could-be-named', kind: 'person', stored, answering: 0 }
      : { found: 'a-person', id: person.id, name: person.name }
  }
  const could = everyAgentAReferenceCouldName(sqlite, stored)
  const answering = new Map<string, AgentIdentity>()
  if (could.byId !== null) {
    answering.set(could.byId.id, could.byId)
  } else {
    for (const one of [could.liveByHandle, ...could.everyRetiredByHandle]) {
      if (one !== null) answering.set(one.id, one)
    }
  }
  if (answering.size !== 1) return { found: 'nobody-could-be-named', kind: 'agent', stored, answering: answering.size }
  const agent = [...answering.values()][0]!
  return { found: 'an-agent', id: agent.id, handle: agent.handle, name: agent.name, retired: agent.retired, retiredAt: agent.retiredAt }
}

/** The WHO SENT IT words for one stored `sentBy`, as every hand-over prints them. */
export function whoSentItInWords(sentBy: unknown): string {
  return DELIVERY_ENVELOPE.theSender(theSenderAsRead(sentBy))
}

/**
 * HOW THE SENDER OF ONE STORED `sentBy` ASKS TO BE ADDRESSED, in the words the hand-over line prints,
 * or null.
 *
 * The sender is found the way `theSenderAsRead` finds it, so the address line and the WHO SENT IT
 * line are always about the same person or agent. Null in three cases, and the hand-over prints no
 * line for any of them: nobody was recorded as the sender, nobody or more than one answers to the
 * stored id, or the sender has set no part.
 */
export function howTheSenderAsksToBeAddressedInWords(sentBy: unknown): string | null {
  return theAddressOfTheSenderAsRead(theSenderAsRead(sentBy))
}

/** How the sender `theSenderAsRead` found asks to be addressed, in words, or null by the three cases above. */
function theAddressOfTheSenderAsRead(read: TheSenderAsRead): string | null {
  if (read.found !== 'a-person' && read.found !== 'an-agent') return null
  const row = readParticipant({ kind: read.found === 'a-person' ? 'person' : 'agent', id: read.id })
  return row === null ? null : theAddressAsInWords(row.addressAs)
}

/** What a hand-over door says about one message's sender. */
export interface TheSenderOfAHandOver {
  whoSentIt: string
  howToAddressTheSender: string | null
}

/**
 * THE TWO THINGS EVERY HAND-OVER DOOR ANSWERS ABOUT A SENDER, together: who sent it, and how that
 * sender asks to be addressed (null when there is nothing to print). A door spreads this onto the
 * message it hands over, and the tool passes both to `deliveryEnvelope` unchanged.
 *
 * THE SENDER IS FOUND ONCE FOR BOTH (wave 13y round 48). Each half used to find it again, so every
 * hand-over looked the stored reference up twice.
 */
export function theSenderForAHandOver(sentBy: unknown): TheSenderOfAHandOver {
  const read = theSenderAsRead(sentBy)
  return { whoSentIt: DELIVERY_ENVELOPE.theSender(read), howToAddressTheSender: theAddressOfTheSenderAsRead(read) }
}

/**
 * THE SENDER WORDS FOR MANY MESSAGES IN ONE ANSWER, each stored sender read once (wave 13y round 48).
 *
 * The queue door asked `theSenderForAHandOver` once per row: one answer on a made-up office had 4,685
 * rows and 943 senders. The words depend only on the stored kind and id, so they are kept by that pair.
 * Every `sentBy` that is not a participant reference reads alike, as nobody recorded, and shares one key.
 * The message pool's door reads its senders through this too (wave 13y round 49).
 *
 * MAKE ONE FOR ONE ANSWER AND DROP IT WITH THE ANSWER. What it keeps is right while nothing is written
 * between the rows, which holds inside one synchronous pass over them; it would go stale if kept longer.
 */
export function theSendersReadOncePerAnswer(): (sentBy: unknown) => TheSenderOfAHandOver {
  const kept = new Map<string, TheSenderOfAHandOver>()
  return (sentBy) => {
    const held = theStoredSender(sentBy)
    const key = held === null ? '' : participantKey(held)
    const known = kept.get(key)
    if (known !== undefined) return known
    const words = theSenderForAHandOver(sentBy)
    kept.set(key, words)
    return words
  }
}

/**
 * THE GROUP A MESSAGE WAS SENT TO, FOR THE FIRST LINE OF A HAND-OVER, or null because it was sent to
 * no group, as item 5 of a decision says.
 *
 * `toGroup` is the group id stored on the message. The group is read across every project, because a
 * group follows the conversations and not the project on screen (decision `t5DlN5-uTZoT`). The name
 * is the group's title as it is now. Where no group row answers to the id, `name` is null and the line
 * says so. Every door that hands a message over carries this as `fromGroup`, and the tool passes it to
 * `deliveryEnvelope` unchanged.
 */
export function theGroupForAHandOver(toGroup: string | null): TheGroupOfAHandOver | null {
  if (toGroup === null || toGroup === '') return null
  const group = readGroup(toGroup, EVERY_PROJECT)
  return { id: toGroup, name: group === null ? null : group.name }
}
