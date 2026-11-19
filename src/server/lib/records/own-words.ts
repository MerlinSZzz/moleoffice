// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MAY AN AGENT ACT FOR THE PERSON RIGHT NOW, by a signed item, the person's quoted words or a raise: the answer
 * every guard asks, what a press touches, the words for a press that is kept, and the secretary acting for the
 * person. `PROBLEM_KIND`, which was declared beside them, came too. They were moved out of
 * src/server/lib/records.ts with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`. This file does not import records.ts.
 */
import { theActAGateAsksAbout } from '@shared/ops.ts'
import { A_ROW_WITH_NO_ROLE_READS_AS, mayBeElevated, type Elevation } from '@shared/roles.ts'
import { thePersonIsProved, theWordsAllowThis } from '@shared/the-person-proved.ts'
import type { RecordKind } from '@shared/types.ts'
import { isANameBesideTheDoors, THE_NAMES_BESIDE_THE_DOORS } from '@shared/what-the-grant-carries.ts'
import { sqlite } from '../../db/client.ts'
import { theRunAWriteCameFrom } from '../../db/the-run-a-write-came-from.ts'
// WHETHER A SECRETARY IS ACTING FOR THE PERSON RIGHT NOW. Criterion P59. It reads the registry row
// and imports nothing from here, so there is no loop.
import { theElevationHeldBy } from '../elevation.ts'
import { PanelError } from '../panel-error.ts'
import { participantForActor } from '../participant-for-actor.ts'
import { theCanonicalAgentId } from '../registry-aliases/worker-runs.ts'
import { theRoleCards, theRoleCardsAreRead } from '../roles.ts'
import { theAnswerAboutAPress, type TheAnswerAboutAPress } from '../what-the-grant-carries.ts'
import type { Actor } from './actor.ts'
import { theCallersAgentRow } from './the-callers-agent-row.ts'

/**
 * MAY THIS AGENT ACT FOR THE PERSON RIGHT NOW — by a signed item, quoted words or a raise? Criterion P59 and signing package piece 3a.
 *
 * ---------------------------------------------------------------------------------------
 * ONE ANSWER FOR THE SIGNED ITEM AND THE TWO OTHER PROOFS, AND WHY THERE IS NOT A SECOND SET OF CLAUSES
 * ---------------------------------------------------------------------------------------
 *
 * A warrant is the person's quoted words for one act. An elevation is their press, for every act of theirs, for a
 * period. Both answer the SAME question — is this agent allowed to do a thing that is the person's —
 * so both open the same doors, and every guard that asks this asks it once. Writing elevation into
 * the guards as a second condition beside the warrant would be four places to keep in step, and the
 * fourth would be the one somebody forgot.
 *
 * THE SIGNED ITEM IS ASKED FIRST. The carry-out door has already checked the named agent and the
 * hold and put this one item's signature on a copy of the actor for this one act. A warrant or
 * raise the same agent also holds must not replace that signature on either ledger.
 *
 * THE WARRANT IS ASKED BEFORE THE RAISE, and that is not a preference between them. A warrant is on the request
 * and an elevation is a row lookup, so asking the cheap one first keeps an ordinary warranted write
 * from touching the registry. Where both would answer yes, the warrant is what the ledgers record,
 * because the warrant is what the agent chose to carry.
 *
 * IT MARKS THE ACTOR, for the reason `theWordsAllowThis` does: `logChange` and `saveRevision` write
 * the elevation into the ledgers, and they must write it on the act it allowed and on nothing else.
 *
 * A PERSON IS NEVER ASKED THIS. Every caller of it has already found the actor is not the person.
 *
 * EXPORTED because the guards in records.ts ask it, and three guards in other files ask it too — the
 * module graph in `presentation.ts`, the machine-written fields in `workdomain.ts`, and confirming a
 * goal in `goals.ts`. A fourth guard, in records/implementation-map-gates.ts, asks it for
 * accepting a piece of a folder reading. One door for two keys, wherever the guard is written.
 */
export function actsForThePerson(actor: Actor, touches: WhatThePressTouches = {}): boolean {
  if (actsForThePersonWithoutTheRaise(actor)) return true
  // THE PERSON'S PRESS, asked in one place. `aRaiseCarriesIt` below holds the rule that a run never inherits the grant
  // (criterion M81), so this door and the doors a raise opens cannot come to disagree about it (invariant 9).
  return aRaiseCarriesIt(actor, touches)
}

/**
 * THE SAME QUESTION WITHOUT THE RAISE: the test world, a signed item or a warrant. `actsForThePerson` asks this first, so
 * the two answer alike in every case but the raise. A who-may-act gate at off asks this instead, because the raise is
 * asked only at block and nothing is then written under the grant.
 */
export function actsForThePersonWithoutTheRaise(actor: Actor): boolean {
  // INSIDE A TEST WORLD, ITS STARTER AND THE SECRETARY HOLD THE PERSON'S AUTHORITY. Criterion P84, rule 5 of chapter 8.
  // Asked here, at the one question nearly every guard of the person's acts already asks of an agent, so a guard
  // that asks this cannot be the one that forgot the world. The field is set by `actorFrom` from
  // `theOwnersAuthorityOf` (lib/worldauthority.ts) and absent in the office, which is never a test world. Asked first,
  // because it is a question about WHERE this is rather than about the write, and it marks nothing: the ledgers name
  // the agent that asked and no warrant and no raise, so nothing written in a world reads as the person's word.
  if (actor.theOwnersAuthority?.holds === true) return true
  // This one item's signature precedes a warrant or raise the same agent might also hold, so
  // both ledgers name the signature that carried the act. It grants no standing power.
  if (actor.signedItem !== undefined) return true
  return theWordsAllowThis(actor)
}

/**
 * THE RAISE THIS ACTOR HOLDS NOW, or null, and nothing is marked: a page asks it to know which press to draw, and a read
 * names no grant. `aRaiseCarriesIt` asks it and marks the write.
 */
export function theRaiseThisActorHolds(actor: Actor): ReturnType<typeof theElevationHeldBy> {
  const held = theGrantAndTheRunOf(actor)
  return held === null || held.run !== null ? null : held.grant
}

/**
 * THE GRANT THIS AGENT HOLDS NOW, AND THE RUN ITS REQUEST CAME FROM, or null where it holds none. The grant is asked
 * first, because most agents hold none and then the run is not looked up.
 *
 * A RUN NEVER INHERITS THE GRANT ITS AGENT HOLDS. The grant is the person's press on one agent, and what they pressed on
 * was the mind they had been talking to; a run the office started is a different mind under the same handle. So a grant
 * with a run beside it is no grant for this request, and the two readers of it, `theRaiseThisActorHolds` and
 * `mayPressForThePerson`, both say so. A warrant is asked before either in `actsForThePerson`, and it still stands for a
 * run, because a warrant carries the person's quoted words for one named act rather than a standing power.
 */
export function theGrantAndTheRunOf(actor: Actor): { grant: Elevation; run: { run: string; servingAgent: string } | null } | null {
  if (actor.type !== 'agent') return null
  const grant = theElevationHeldBy(actor.id)
  return grant === null ? null : { grant, run: theRunAWriteCameFrom(actor.sessionId) }
}

/**
 * WHY A RUN'S AGENT'S GRANT IS NOT THE RUN'S, in one sentence for every refusal that says it. Criterion M81. Without
 * it a run refused an act its own handle can perform reads the refusal as a bug in the gate.
 */
export function aRunDoesNotCarryTheGrant(handle: string, run: string): string {
  return (
    `"${handle}" holds the person's grant, but you are a run Mole Office started for it (${run}) and a run does not ` +
    'carry the grant: the session the person gave it to does.'
  )
}

/** The longest reason a press for the person may give, in characters. */
export const THE_LONGEST_REASON_FOR_THE_PERSON = 1000

/**
 * WHETHER THE PERSON'S GRANT PRESSES THIS DOOR, as `mayPressForThePerson` answers. `no grant` and `a run` are the two
 * answers a door has always had for an agent with no grant; the other four are a secretary that holds one.
 */
export type WhetherTheGrantPressesIt =
  | { may: true; grant: Elevation }
  | { may: false; because: 'no grant' }
  | { may: false; because: 'a run' | 'no door' | 'its own' | 'no reason'; grant: Elevation; why: string }
  | {
      may: false
      because: 'kept' | 'ask first'
      grant: Elevation
      why: string
      /** The name whose answer it was: the operation, the act its gate asks about, or a name beside the doors. */
      name: string
      /** Whose answer: the card's default, or this office's own. */
      by: 'the card' | 'this office'
    }

/**
 * WHAT A DOOR TELLS THE CHECK ABOUT ITS PRESS, beyond the operation its route declared. `also` names the parts beside the
 * doors this press touches (src/shared/what-the-grant-carries.ts), such as a regulation, or a person's key. `filedBy` is
 * the registry id that what the press answers stores for the agent that filed it, for the doors the card never lets a
 * secretary press on its own filing. It may be an old id, filed before an alias.
 */
export interface WhatThePressTouches {
  also?: readonly string[]
  filedBy?: string | null
}

/**
 * MAY THIS SECRETARY PRESS THIS DOOR FOR THE PERSON NOW? The one check. Under the person's grant a secretary may press
 * for them everything but what the secretary card keeps for them, and each press gives its reason. Every door a raise
 * carries asks it through `aRaiseCarriesIt`, and the role gate asks it without the reason, so the card's lists are read
 * in one place.
 *
 * IT SAYS NO, AND WHY, in this order:
 *   1. the caller holds no grant now. Only the card the elevation rule names can hold one (`theElevationHeldBy`);
 *   2. the caller is a run the office started, which never inherits its agent's grant (criterion M81);
 *   3. no route carried the request, so nothing says which door it is;
 *   4. the door is kept for the person;
 *   5. the door is one to ask the person about first. Nothing records the person's answer about one press yet, so it
 *      is refused;
 *   6. the card's `neverOnItsOwnFiling` names the door and the secretary filed what the press answers, under its id
 *      or an old one;
 *   7. the request changes something and gives no reason. Asked only when `withTheReason` is true: the role gate runs
 *      before the body is read.
 * A door is named by the operation its route declared, by the act the gates ask about for it (`gatedAs` in
 * src/shared/ops.ts), so a check is kept wherever its write is, and by any part beside the doors the press touches.
 *
 * KEPT, OR ASKED ABOUT FIRST, IS THIS OFFICE'S ANSWER WHERE IT HAS ONE AND THE CARD'S OTHERWISE, for each of those names,
 * and the strictest of them stands (`theAnswerAboutAPress` in lib/what-the-grant-carries.ts). An office that changed
 * nothing answers as the card does.
 *
 * IT MARKS NOTHING. `aRaiseCarriesIt` marks the actor when the answer is yes.
 */
export function mayPressForThePerson(actor: Actor, withTheReason = true, touches: WhatThePressTouches = {}): WhetherTheGrantPressesIt {
  const held = theGrantAndTheRunOf(actor)
  if (held === null) return { may: false, because: 'no grant' }
  const { grant, run } = held
  if (run !== null) {
    return {
      may: false,
      because: 'a run',
      grant,
      why:
        `This act is one of the person's own. ${aRunDoesNotCarryTheGrant(actor.id, run.run)} Nothing was done. Say ` +
        'what you need in a message to that session.',
    }
  }
  const press = actor.press
  if (press === undefined || press.operation === null) {
    return {
      may: false,
      because: 'no door',
      grant,
      why:
        'This act was asked under the person\'s grant with no door named, so Mole Office cannot tell whether the ' +
        'secretary card keeps it for the person. Nothing was done. Make it through its door in the API.',
    }
  }
  const names = [press.operation, theActAGateAsksAbout(press.operation)?.name ?? press.operation, ...(touches.also ?? [])]
  const said = theAnswerAboutAPress(names)
  if (said.answer !== 'may-press') {
    const because = said.answer === 'kept' ? 'kept' : 'ask first'
    return { may: false, because, grant, why: theWordsForAKeptPress(actor, press.operation, because, said), name: said.name, by: said.by }
  }
  // THE FILER AND THE CALLER ARE COMPARED BY CANONICAL ID. A filing made before the re-mint holds its filer's old id.
  // The caller's id is read from its agents row, and an alias never names a row's id, so it is canonical already.
  const filedBy = touches.filedBy ?? null
  if (
    filedBy !== null &&
    names.some((name) => theRoleCards().elevation.neverOnItsOwnFiling.includes(name)) &&
    theCanonicalAgentId(sqlite, filedBy) === participantForActor(actor)?.id
  ) {
    return {
      may: false,
      because: 'its own',
      grant,
      why:
        `The secretary card never lets the grant press ${press.operation} on something the same secretary filed, and ` +
        `"${actor.id}" filed this one. Nothing was done. Ask the person to press it.`,
    }
  }
  if (withTheReason && !press.aRead && press.reason === null) {
    return {
      may: false,
      because: 'no reason',
      grant,
      why:
        `This press of ${press.operation} is made for the person under their grant, and every such press gives its ` +
        `reason. Nothing was done. Send it again with "forThePerson": {"reason": "…"} in the body, or, where the request ` +
        `has no body, with forThePerson.reason=… in the query: up to ${String(THE_LONGEST_REASON_FOR_THE_PERSON)} ` +
        'characters saying why you press it for them.',
    }
  }
  return { may: true, grant }
}

/**
 * WHY A PRESS KEPT FOR THE PERSON, OR ONE TO ASK THEM ABOUT FIRST, IS REFUSED: whose answer it is, the card's default or
 * this office's, and the way on. A door is said by the name that was kept, and a part beside the doors by what it does.
 * Writing a regulation keeps the sentence it has had since it was decided that a raise never carries it. That sentence is
 * said only when the card's default keeps it; this office's person may open it on the list since.
 */
function theWordsForAKeptPress(actor: Actor, operation: string, because: 'kept' | 'ask first', said: TheAnswerAboutAPress): string {
  // A DOOR NAMED IN `also` IS SAID AS ITSELF, because that door and not the press's own is what was kept. The press's
  // operation and the act its gate asks about are both said as the operation.
  const door = said.name === (theActAGateAsksAbout(operation)?.name ?? operation) ? operation : said.name
  const what = isANameBesideTheDoors(said.name) ? THE_NAMES_BESIDE_THE_DOORS[said.name] : door
  const whose = said.by === 'the card' ? 'The secretary card' : `This office's list of what the grant carries, since ${said.at ?? 'a time nobody recorded'},`
  if (because === 'ask first') {
    return (
      `${whose} says to ask the person before ${what === door ? `pressing ${door}` : what} for them, and Mole ` +
      'Office holds no answer of theirs about this press. Nothing was done. Ask the person.'
    )
  }
  if (said.name === 'record:regulation' && said.by === 'the card') {
    return (
      `A regulation is the person's alone to write, and "${actor.id}" is acting for them under their grant, which does not carry ` +
      'it: a raise never carries a write of a regulation. Nothing was written. ' +
      'Tell the person what the regulation should say, and they write it.'
    )
  }
  return `${whose} keeps ${what} for the person, so their grant does not press it for them. Nothing was done. Ask the person to do it.`
}

/**
 * WHETHER A RAISE CARRIES THIS REQUEST: `mayPressForThePerson` says yes. The grant alone, with no warrant, because this
 * is asked for the acts the person's quoted words do not name. Marks the actor as acting under the grant, so the change
 * row and the revision name it, as `actsForThePerson` does: every act done under a raise is recorded as done under it.
 * Asked for the kinds only a person may write and by the doors a raise opens, each only after every other way the act is
 * allowed, so the grant is named on a write only when nothing else allowed it.
 *
 * FALSE WHERE NO GRANT IS THE ANSWER, so the door gives its own refusal, as it did before the check. A SECRETARY THAT
 * HOLDS THE GRANT AND MAY NOT PRESS THIS DOOR IS REFUSED HERE, in the check's own words: the door's refusal would say
 * only the person may, and the secretary is owed what is missing.
 */
export function aRaiseCarriesIt(actor: Actor, touches: WhatThePressTouches = {}): boolean {
  const answer = mayPressForThePerson(actor, true, touches)
  if (!answer.may) {
    if (answer.because === 'no grant' || answer.because === 'a run') return false
    throw new PanelError(answer.why, answer.because === 'no reason' ? 400 : 403)
  }
  actor.elevation = answer.grant
  actor.elevationUsed = true
  if (actor.press !== undefined) actor.press.underTheGrant = answer.grant.id
  return true
}

/**
 * IS THIS CALLER'S ROLE CARD THE SECRETARY'S? The one card the declaration lets hold the person's
 * authority.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A CARD CHECK AND NOT A HANDLE OR A NAME
 * ---------------------------------------------------------------------------------------
 *
 * `design/permissions/roles.json` says which card can hold an elevation, and `mayBeElevated` reads
 * that answer. A secretary is not a name written here: change the card the declaration names and
 * every settling act moves with it, the same reason `mayBeElevated` exists at all. A registry row
 * with no card is READ AS a worker by every other refusal in this product, and it is read that way
 * here too — so an agent nobody carded is not a secretary by accident.
 *
 * IT DOES NOT ASK WHETHER THE AUTHORIZATION IS THERE. `actsForThePerson` answers that, and the
 * caller that wants both asks both rather than folding a card check into the P59 door.
 */
export function theCallersCardIsTheSecretarys(actor: Actor): boolean {
  if (actor.type !== 'agent' || !theRoleCardsAreRead()) return false
  const row = theCallersAgentRow(actor)
  return mayBeElevated(theRoleCards(), row?.role ?? A_ROW_WITH_NO_ROLE_READS_AS)
}

/**
 * MAY THIS AGENT SETTLE A FORK ON THE PERSON'S AUTHORIZATION RIGHT NOW?
 *
 * ---------------------------------------------------------------------------------------
 * THE SECRETARY CARD AND THE PERSON'S AUTHORIZATION ARE BOTH REQUIRED
 * ---------------------------------------------------------------------------------------
 *
 * The door under this comment is the P59 question the other governance guards ask: is this agent
 * acting for the person — by their quoted words, or by their press? Only the secretary card may
 * spend that authority on a SETTLING act.
 * The card is asked FIRST and the authorization second, so a warrant carried by a worker opens
 * nothing and is never marked as used — an ordinary agent is refused in exactly the words it was
 * refused in before. A person is never asked this: every caller has already found the actor is not
 * the person.
 *
 * EXPORTED for the doors of settings the office keeps outside its records and opens to a secretary
 * on the person's words or under the person's raise: their office keys, the sandboxes' logins, their
 * summons settings and the devices a summons tells (api/office-keys.ts, api/sandbox-logins.ts, api/summons.ts and
 * api/push.ts). The same question, asked in one place.
 */
export function theSecretaryActingForThePerson(actor: Actor, touches: WhatThePressTouches = {}): boolean {
  // INSIDE A TEST WORLD THE CARD IS NOT ASKED. Its starter holds the person's authority there whatever card it holds, and so
  // does the secretary of the office the world was copied from (criterion P84). The person is not asked
  // for a card, so neither is somebody holding their authority.
  if (actor.theOwnersAuthority?.holds === true) return true
  if (!theCallersCardIsTheSecretarys(actor)) return false
  return actsForThePerson(actor, touches)
}

/**
 * DID THE PERSON PRESS THIS THEMSELVES? The person is proved, and not by their signature on a package item an agent
 * carries out. Asked when agreeing to a request to change what the grant carries: only the person's own press agrees.
 * A secretary may separately change the list on the person's written words for that change. An agent's grant and an
 * agent's warrant are never the person's own press here, because an agent is never proved the person.
 */
export function thePersonPressedItThemselves(actor: Actor): boolean {
  return actor.signedItem === undefined && thePersonIsProved(actor)
}

export const PROBLEM_KIND: RecordKind = 'problem'
