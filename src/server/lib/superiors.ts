// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Route an unreachable agent's messages through its recorded owners. The original addressee keeps
 * the message. The first owner that can receive it gets a copy; an uncertain reach stops the walk.
 * Missing, broken, circular or person ownership leaves the message waiting without a guessed recipient.
 * The separate starter walk below still supplies the boundary used by other authorization decisions.
 */

import { theRecordedOwner } from './agent-owner.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import {
  sameParticipant,
  BROKEN_OWNERS_ROUTING_ENDING,
  NO_REACHABLE_OWNER_ENDING,
  PERSON_OWNER_ROUTING_ENDING,
  OWNERLESS_ROUTING_ENDING,
  theRoutedLine,
  type RoutedAddressee,
  type RoutedPassedOver,
  type TheRoutedLineSaid,
  type RoutedWas,
  type TheOwnerEnding,
  type TheRoutedEnding,
} from '@shared/messages.ts'
import { THE_PERSON } from '@shared/person.ts'
import {
  type AStarter,
  type RegisteredAgent,
} from './participants.ts'
import { theAgentAStoredReferenceNamesIn } from './the-agent-a-stored-reference-names-in.ts'
import { theChainUpWith } from '@shared/the-chain-up-with.ts'
import { theStarterEachStringNames } from './the-starter-each-string-names.ts'
import { listParticipants } from '../db/list-participants.ts'
import { readParticipant } from '../db/read-participant.ts'
import { theRoleCards, theRoleCardsAreRead } from './roles.ts'
import {
  everyRunRow,
  runsWaitingAmong,
  theReachOfEachAgentAlone,
  whyThisAgentCannotBeReached,
  type WaitingRun,
  type WhyThisAgentCannotBeReached,
} from './worker.ts'
import { theNameOf } from '@shared/participant-name.ts'

/** One agent's reach in one project, as `whyThisAgentCannotBeReached` answers it. */
type OneReach = ReturnType<typeof whyThisAgentCannotBeReached>

/**
 * WHAT ONE SEND READS ONCE IN ONE PROJECT, and hands to every reach reading and every walk it makes.
 * That is the run rows, the runs waiting among them, every registered agent, and the reach of each
 * agent it asks about. Each is read the first time it is needed and then kept. The dead-letter sweep
 * keeps one per project for the whole sweep.
 *
 * WHY. None of these depends on the letter. A send reads every addressee's reach before the letter is
 * stored, and the sweep decides every letter before it writes anything, so a reading kept is the one it
 * would take again. The sweep read every agent again for each letter, and the waiting runs again for
 * each rung of each letter. Measured on made-up offices of the live counts (round 22 of wave 13u), it
 * held the server for 41 to 49 seconds with 3,300 letters from agents waiting, and for 312 seconds when
 * most runs were the message worker's.
 */
export interface TheReadingsForOneSend {
  /** Why this agent cannot be reached in the project, or null; asked of `whyThisAgentCannotBeReached` once. */
  reachOf: (agentId: string) => OneReach
  /** The stored reader the chain of starters is followed with: the agent a stored starter names, or nobody. */
  starters: () => (id: string) => AStarter | null
}

export function theReadingsForOneSend(workspaceId: string, readTheRows: (workspaceId: string) => ReturnType<typeof everyRunRow> = everyRunRow): TheReadingsForOneSend {
  // THE RUN ROWS TOO ARE READ THE FIRST TIME THEY ARE NEEDED, which is when a reach reading gets past the retired check. They
  // are every session record of the project with its data: 7,700 rows and 92 ms on the made-up office of the live counts
  // (round 34 of wave 13u). A send with no agent addressee, or an office line to an agent who is not retired, reads none.
  // A caller may name a narrower reading that gives each reach the same answer: the dead-letter sweep reads only the rows
  // a reach reads (`theRunRowsAnyReachReads` in lib/worker.ts).
  let rows: ReturnType<typeof everyRunRow> | null = null
  const theRows = (): ReturnType<typeof everyRunRow> => (rows ??= readTheRows(workspaceId))
  let waiting: readonly WaitingRun[] | null = null
  let agents: readonly RegisteredAgent[] | null = null
  const reach = new Map<string, OneReach>()
  return {
    reachOf: (agentId) => {
      const held = reach.get(agentId)
      if (held !== undefined) return held
      const read = whyThisAgentCannotBeReached(agentId, workspaceId, theRows, () => (waiting ??= runsWaitingAmong(workspaceId, theRows())))
      reach.set(agentId, read)
      return read
    },
    starters: () => theAgentAStoredReferenceNamesIn(agents ??= listParticipants().agents),
  }
}

/**
 * WHAT ONE MESSAGE READS ONCE, WITH EACH AGENT'S REACH READ FROM THAT AGENT'S OWN RUNS. The record door asks this for
 * every message it writes; `theReadingsForOneSend` above reads every run row of the project once, the notice of what an
 * ended run left open still asks that one, and the dead-letter sweep asks it with the rows any reach reads.
 *
 * WHY A MESSAGE DOES NOT READ EVERY RUN. It asks about the addressee and the rungs of one walk, a few agents. Reading
 * every run row for them was 7,700 rows and 84 ms inside SQLite for one message on the made-up office of the live counts
 * (round 36 of wave 13u). Each reach is still asked of `whyThisAgentCannotBeReached`, with the rows
 * `theReachOfEachAgentAlone` in lib/worker.ts says give the same answer.
 *
 * NOR EVERY AGENT. The chain of starters is followed with `theStarterEachStringNames`, which reads only the rows a stored
 * starter can name, once for each string in the message. Reading every agent for it was 1,962 of the 2,048 rows one answer
 * to an agent read, on a made-up office of 972 agents (round 42 of wave 13u).
 */
export function theReadingsForOneMessage(workspaceId: string): TheReadingsForOneSend {
  const reachAlone = theReachOfEachAgentAlone(workspaceId)
  let starters: ((id: string) => AStarter | null) | null = null
  const reach = new Map<string, OneReach>()
  return {
    reachOf: (agentId) => {
      const held = reach.get(agentId)
      if (held !== undefined) return held
      const read = reachAlone(agentId)
      reach.set(agentId, read)
      return read
    },
    starters: () => (starters ??= theStarterEachStringNames()),
  }
}

/** Whether one registry row holds the secretary card. The card's name comes from the declaration. */
function holdsTheSecretaryCard(row: RegisteredAgent): boolean {
  if (!theRoleCardsAreRead()) return false
  return row.role === theRoleCards().elevation.onlyThisCardCanHoldIt
}

export { theNameOf }

/**
 * The agents routing may visit, nearest first, and the owner ending after they are passed over.
 * Reachability chooses among these rungs when a line is sent; it does not change this boundary.
 * Problem y9kWUYTAqYsC, inspector's IzRXmfdDVH_2, the secretary's sHBreuZqBPad and KyB-FsT804bq:
 * an agent above the first secretary cannot receive the line. A secretary addressee starts no walk.
 * USER.md invariant 9: routing and ended-run stop permission read these stops in one place.
 * The participants page still supplies the registered chain through theChainUpFrom.
 */
export function theRungsOfTheRoutingWalk(
  addressee: ParticipantRef,
  // THE STORED READER, made by a caller that walks for many letters (`theReadingsForOneSend`) from every agent read once,
  // or by a caller that walks once (one message, one credential's notice, one stop) from the rows each string names
  // (`theStarterEachStringNames`). There is no default, so no caller reads every agent without saying so.
  theAgentThisNames: (id: string) => AStarter | null,
): {
  rungs: { who: ParticipantRef; row: RegisteredAgent }[]
  ending: TheOwnerEnding
} {
  const ownerName = theNameOf(readParticipant({ kind: 'person', id: THE_PERSON }), THE_PERSON)
  const addresseeRow = addressee.kind === 'agent' ? readParticipant(addressee) as RegisteredAgent | null : null
  const rungs: { who: ParticipantRef; row: RegisteredAgent }[] = []
  if (addresseeRow !== null && holdsTheSecretaryCard(addresseeRow)) {
    return { rungs, ending: { how: 'the addressee holds the secretary card', owner: ownerName } }
  }

  const chain = theChainUpWith(addresseeRow?.startedBy ?? null, theAgentThisNames)
  for (const who of chain.chain) {
    if (who.kind === 'person') return { rungs, ending: { how: 'no secretary', owner: ownerName } }
    const row = readParticipant(who) as RegisteredAgent | null
    if (row === null) return { rungs, ending: { how: 'a name no single agent answers', owner: ownerName } }
    const isSecretary = holdsTheSecretaryCard(row)
    rungs.push({ who, row })
    if (isSecretary) return { rungs, ending: { how: 'nobody reachable', owner: ownerName } }
  }

  if (chain.loopAt !== null) return { rungs, ending: { how: 'a loop', owner: ownerName } }
  if (chain.stopsAt !== null) {
    const row = chain.stopsAt.kind === 'agent' ? readParticipant(chain.stopsAt) as RegisteredAgent | null : null
    if (row === null) return { rungs, ending: { how: 'a name no single agent answers', owner: ownerName } }
    return { rungs, ending: { how: 'nobody started', owner: ownerName, stoppedAt: theNameOf(row, chain.stopsAt.id) } }
  }
  return { rungs, ending: { how: 'nobody started', owner: ownerName, stoppedAt: theNameOf(addresseeRow, addressee.id) } }
}

/**
 * THE ROUTING OF ONE ADDRESSEE THAT COULD NOT BE REACHED, ready to be stored on the message.
 *
 * `addressee` is the one that could not be reached; `reach` is the reading already taken for it, so
 * the clause on the first line is never worked out a second time; `sender` is the caller resolved to
 * a registry id, or null when the writer is the office or a run. `readings` is what the send reads
 * once in the project the letter was written in (`theReadingsForOneSend`). The returned entry is
 * exactly what `data.routed` holds: the addressee, the reading's own sentence, the one participant
 * chosen, every rung passed over, and the finished line.
 */
export function theRoutingOfOneAddressee(
  addressee: ParticipantRef,
  reach: WhyThisAgentCannotBeReached,
  sender: ParticipantRef | null,
  readings: TheReadingsForOneSend,
): RoutedAddressee {
  const addresseeRow = addressee.kind === 'agent' ? readParticipant(addressee) as RegisteredAgent | null : null
  const addresseeName = theNameOf(addresseeRow, addressee.id)
  // Keep each passed owner’s reading for the line as well as its stored delivery facts.
  const met: { who: ParticipantRef; because: string; was: RoutedWas; name: string }[] = []
  const finish = (to: ParticipantRef | null, ending: TheRoutedEnding): RoutedAddressee => {
    const passedOver = met.map((one) => ({ who: one.who, because: one.because }))
    // Store the line and its facts together so pages can redraw it in their own language.
    const said: TheRoutedLineSaid = { addressee: addresseeName, was: reach.was, passedOver: met.map((one) => ({ name: one.name, was: one.was })), ending }
    return { for: addressee, because: reach.because, to, passedOver, line: theRoutedLine(said), said }
  }
  const broken = (at: string): RoutedAddressee => finish(null, { how: BROKEN_OWNERS_ROUTING_ENDING, stoppedAt: at })
  if (addresseeRow === null) return broken(addresseeName)
  const named = readings.starters()
  const seen = new Set<string>([addressee.id])
  let current = addresseeRow
  while (true) {
    const owner = theRecordedOwner(current)
    if (owner.state === 'absent') return finish(null, { how: current === addresseeRow ? OWNERLESS_ROUTING_ENDING : NO_REACHABLE_OWNER_ENDING })
    if (owner.state === 'broken') return broken(theNameOf(current, current.id))
    if (owner.owner.kind === 'person') return finish(null, { how: PERSON_OWNER_ROUTING_ENDING })
    const found = named(owner.owner.id)
    if (found === null || seen.has(found.id)) return broken(theNameOf(current, current.id))
    seen.add(found.id)
    const rung: ParticipantRef = { kind: 'agent', id: found.id }
    const row = readParticipant(rung) as RegisteredAgent | null
    if (row === null) return broken(theNameOf(current, current.id))
    const cannot = readings.reachOf(rung.id)
    // Uncertain reach stops the walk; a known unreachable owner is passed over.
    if (cannot === null || cannot.was === 'could not tell') {
      // The sender needs no copy of its own words.
      if (sender !== null && sameParticipant(sender, rung)) return finish(null, { how: 'the owner sent it' })
      return finish(rung, { how: cannot?.was === 'could not tell' ? 'an owner whose reach is uncertain' : cannot === null ? 'an owner' : 'an owner waiting', reached: theNameOf(row, rung.id) })
    }
    met.push({ who: rung, because: cannot.because, was: cannot.was, name: theNameOf(row, rung.id) })
    current = row
  }
}
