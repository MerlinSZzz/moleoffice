// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * REFUSING AN ACT THE CALLER'S ROLE MAY NOT PERFORM. One hook, one declaration, one sentence.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion P3, decided on 6 September 2026: the roles do not have the same permissions. This is the
 * enforcing half. The other half is `GET /api/access`, which publishes what a caller's role may not do, and
 * BOTH READ `src/config/roles.json`. There is no second list of what a role may do anywhere
 * in this repository, and `tests/one-declaration-decides-what-a-role-may-do.test.ts` is what says so.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS A HOOK AND NOT A CHECK INSIDE EACH HANDLER
 * ---------------------------------------------------------------------------------------
 *
 * The same shape `refuseAnActFromAnotherMachine` has, above every route group, for the same reason:
 * a check written into handlers is a check somebody forgets in one handler, and the failure is
 * silent in the worst direction. A route declares its operation to register at all, so the act a
 * request is asking for is known before the handler runs.
 *
 * ---------------------------------------------------------------------------------------
 * AN UNREGISTERED CALLER IS NOT NARROWED, AND THAT IS THE PERSON'S RULE RATHER THAN AN OVERSIGHT
 * ---------------------------------------------------------------------------------------
 *
 * Rung 0 of the design is a caller nothing has registered, and what it may do is *everything it
 * could do yesterday*: the person's rule of 3 September 2026 — name it, never stop it. The person sometimes
 * starts an agent for something unrelated to this project, and a rule that acted on whatever is
 * unregistered would be too wide.
 *
 * SO REGISTERING NARROWS YOU AND NOT REGISTERING DOES NOT, and that is worth saying out loud rather
 * than leaving somebody to notice. The one thing an unregistered caller may not do is send a message
 * to a person, which is criterion M59 and is enforced on the record write path, not here.
 *
 * ---------------------------------------------------------------------------------------
 * AND A REGISTERED ROW HOLDING A WORD NO CARD HOLDS IS REFUSED EVERYTHING
 * ---------------------------------------------------------------------------------------
 *
 * That is a different case from rung 0 and it used to be the widest one of all: note `c5W3ZBatgdpG`
 * measured it on 6 September 2026, and such a row was refused NOTHING, silently. It is not an
 * absence — somebody wrote a word — so it is not read as the lowest rung, because reading it as one
 * would hand a rung to a row nobody granted one, and a card removed from the declaration would do
 * that to every holder at once. It is refused, in a sentence that quotes the word.
 *
 * ---------------------------------------------------------------------------------------
 * A PERSON IS NEVER REFUSED HERE
 * ---------------------------------------------------------------------------------------
 *
 * A role is a thing an agent holds. The person may do everything, from this machine, as today.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import { actorFrom } from './http.ts'
import { howThisRequestProvedItself } from './keys.ts'
import { participantForActor } from './participant-for-actor.ts'
import { readParticipant } from '../db/read-participant.ts'
import { mayPressForThePerson, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { theRoleCards, theRoleCardsAreRead } from './roles.ts'
import {
  A_ROW_WITH_NO_ROLE_READS_AS,
  actsRefusedTo,
  cardFor,
  everyActNamed,
  mayBeElevated,
  powersOn,
  roleNames,
  roleWordNobodyDeclares,
  theActsACardIsKeptTo,
  type RolesDeclaration,
} from '@shared/roles.ts'
import { theActAGateAsksAbout } from '@shared/ops.ts'
import { thePress } from '@shared/the-press.ts'
import { participantPagePath } from '@shared/addresses.ts'

/**
 * EVERY ACT ANY CARD REFUSES, worked out once and held.
 *
 * The union across every role, so a request whose act is in none of them can leave the hook before
 * anything is read about the caller. It is safe to hold because the cards are read once, at the
 * start: `readTheRoleCards` is what could change the answer, and it runs before the first request.
 * `forgetTheRoleCards` is a test's way back, so this is cleared with it.
 */
let everyRefusedAct: { of: RolesDeclaration; acts: Set<string> } | null = null

function everyActSomeRoleRefuses(): ReadonlySet<string> {
  const cards = theRoleCards()
  // KEYED ON THE DECLARATION ITSELF, so a test that reads a different set of cards gets a different
  // answer without anything having to remember to clear this. `readTheRoleCards` hands back a new
  // object every time it reads, and holding the object rather than a flag is what makes that enough.
  if (everyRefusedAct !== null && everyRefusedAct.of === cards) return everyRefusedAct.acts
  const acts = new Set<string>()
  for (const card of cards.cards) {
    for (const act of actsRefusedTo(cards, card.name).keys()) acts.add(act)
  }
  // AND EVERY ACT THE DECLARATION NAMES, because a registry row holding a word no card holds is
  // refused all of them and this set is what decides whether the question is asked at all. Without
  // this line the acts the LOWEST rung holds would never reach the check, and an unreadable word
  // would quietly get exactly a worker's powers — which is the guess this rule exists to refuse.
  // What it costs, measured: 28 of the 214 operations are named by the role cards (now src/config/roles.json),
  // `record.read` among them, so a read made with actor headers now resolves the caller and is
  // filed as `checked` rather than `header` in the call log. That is a real change to what that
  // column separates and it is the price of the rule being true for every act rather than most.
  for (const act of everyActNamed(cards).keys()) acts.add(act)
  everyRefusedAct = { of: cards, acts }
  return acts
}

/**
 * The act a route asks the card about, or null for a route outside `/api`: what it declared, or, for
 * a door that only checks a write, that write (`gatedAs` in src/shared/ops.ts), so a card that may not
 * write a record may not be told that its record would be accepted either.
 */
function operationOf(req: FastifyRequest): string | null {
  const config: unknown = req.routeOptions?.config
  if (typeof config !== 'object' || config === null) return null
  const said = (config as { operation?: unknown }).operation
  return typeof said === 'string' ? (theActAGateAsksAbout(said)?.name ?? said) : null
}

/** Whether the route declared that its door asks the caller's card itself (`theDoorAsksTheCard` in lib/route.ts). */
function theDoorAsksTheCardOf(req: FastifyRequest): boolean {
  const config: unknown = req.routeOptions?.config
  if (typeof config !== 'object' || config === null) return false
  return (config as { theDoorAsksTheCard?: unknown }).theDoorAsksTheCard === true
}

/** An agent a request's own key proved, as its registry row names it. */
export interface AnAgentItsKeyProved {
  id: string
  handle: string
  role: string
}

/**
 * WHAT A CALLER'S OWN KEY PROVES ABOUT ONE ACT, for a door that asks the card itself.
 *
 * `may` is true only when the request carries an agent's own key, the key proves a registered agent that is not
 * retired, and a power that agent's card holds names the act. A name in the headers with no key proves nothing
 * here, so an agent that only names a secretary is not a secretary. A supervisor's run key acting for another agent
 * is not that agent's own key, so it proves no card here either. `cardsThatMay` names every agent card whose powers
 * hold the act, read from src/config/roles.json, so the refusal says who may.
 *
 * AN ELEVATION IS NOT FOLDED IN. This answers what the card holds. A door that also lets the person's raise through
 * asks the raise itself, so the act is written down as done under it.
 */
export type WhatTheKeyProves =
  | { may: true; agent: AnAgentItsKeyProved; cardsThatMay: string[] }
  | { may: false; agent: AnAgentItsKeyProved | null; cardsThatMay: string[] }

export function whatTheCallersOwnKeyProvesForThisAct(req: FastifyRequest, actor: Actor): WhatTheKeyProves {
  const operation = operationOf(req)
  if (operation === null) throw new Error('A door asked the card for a route that declares no operation.')
  const cards = theRoleCards()
  const holdsTheAct = (card: Parameters<typeof powersOn>[1]): boolean =>
    powersOn(cards, card).some((power) => power.acts.some((one) => one.act === operation))
  const cardsThatMay = cards.cards.filter(holdsTheAct).map((card) => card.name)
  const agent = theAgentItsOwnKeyProves(actor)
  if (agent === null) return { may: false, agent: null, cardsThatMay }
  const card = cardFor(cards, agent.role)
  if (card === null || !holdsTheAct(card)) return { may: false, agent, cardsThatMay }
  return { may: true, agent, cardsThatMay }
}

/** The registered, unretired agent this request's own key proves, or null. */
function theAgentItsOwnKeyProves(actor: Actor): AnAgentItsKeyProved | null {
  if (actor.type !== 'agent' || actor.provedBy !== 'an-agent-key') return null
  if (actor.provedHolder !== undefined || actor.keyHolder === undefined) return null
  const who = participantForActor({ type: 'agent', id: actor.keyHolder })
  const row = who === null || who.kind !== 'agent' ? null : readParticipant(who)
  if (row === null || !('retired' in row) || row.retired) return null
  return { id: row.id, handle: row.handle, role: row.role ?? A_ROW_WITH_NO_ROLE_READS_AS }
}

/**
 * WHICH ROLE THIS REQUEST IS BEING MADE UNDER, or null because no role narrows it.
 *
 * Null for a person, for a caller no registry holds, and for a request with no actor at all. Each is
 * a different reason and none of them is a role, so one null is the honest answer for all three.
 */
export function theRoleOfTheCaller(req: FastifyRequest): { role: string; id: string; handle: string; name: string } | null {
  // WHO IS CALLING, and nothing about the run its session header names: that is the door's question (`whoOnly` in lib/http.ts).
  const actor = actorFrom(req, { whoOnly: true })
  if (actor.type !== 'agent') return null
  const who = participantForActor(actor)
  if (who === null || who.kind !== 'agent') return null
  // `who.id` is already the registry id the resolver answered with, so the row is read by exact id.
  // A handle lookup here would answer nobody once an agent's id is not its handle.
  const row = readParticipant(who)
  if (row === null || !('role' in row)) return null
  // A ROW WITH NO ROLE IS READ AS A WORKER. `A_ROW_WITH_NO_ROLE_READS_AS` is the one place saying so,
  // and a registry row that is somehow gone is read as no role at all rather than as a worker: it is
  // an unregistered caller by then, and rung 0 is not narrowed.
  // THE ID AND THE HANDLE ARE TWO FIELDS. The id is what the office asks about the agent with; the
  // handle, read from the row, is what a refusal names it by for a person.
  // AND THE NAME, which the press on its page is drawn with, as item 3 of a decision
  // says, so a refusal
  // that names the press quotes the button as the person sees it.
  return { role: row.role ?? A_ROW_WITH_NO_ROLE_READS_AS, id: row.id, handle: row.handle, name: row.name }
}

/**
 * Refuse the act if this caller's role may not perform it.
 *
 * The words in the refusal are the card's own `inWords`, so a person reading the refusal and a
 * person reading the card read the same sentence about the same act.
 */
export function refuseAnActThisRoleMayNotPerform(req: FastifyRequest, reply: FastifyReply): void {
  const operation = operationOf(req)
  // The summons door asks the proof itself, including the old live mail-tool agent. It must
  // survive removal of the mailer card; report H-forI_Vk5H7.
  if (operation === 'office.read-summonses') return
  if (!theRoleCardsAreRead()) return
  if (operation === null) return
  // A DOOR THAT ASKS THE CARD ITSELF gives its own coded refusal, from the same declaration, and asks for the key.
  if (theDoorAsksTheCardOf(req)) return
  // This preview setting is an owner's act inside the world as well as in the office.
  if (operation === 'office.scene-settings.change' && actorFrom(req, { whoOnly: true }).theOwnersAuthority?.holds === true) return
  // NOTHING IS ASKED ABOUT THE CALLER FOR AN ACT NO CARD REFUSES, and that is not only speed.
  // `actorFrom` RESOLVES an identity, and the call log publishes whether anything resolved the one a
  // request claimed: `header` means the headers were there and nothing checked them, which is what an
  // ordinary read is. A gate that asked on every request would turn every read in the product into
  // `checked` and quietly empty that distinction. So the question is asked only where the answer
  // could change what happens.
  if (!everyActSomeRoleRefuses().has(operation)) {
    // EXCEPT OF A KEY WHOSE CARD IS REFUSED EVERYTHING ELSE, which is asked by the key alone, below.
    refuseAnActOutsideTheActsACardIsKeptTo(req, reply, operation)
    return
  }
  // INSIDE A TEST WORLD NO CARD NARROWS ITS STARTER OR THE SECRETARY. They hold the owner's authority there (criterion
  // P84, rule 5 of chapter 8), and no card narrows the person. The door's own guard still asks who may; this gate only stops
  // answering for it first (problem aRP8Co6BB_Hv). Asked here, after the line above, so an act no card refuses still
  // asks nothing about the caller. The field is absent in the office, which is never a test world.
  if (actorFrom(req, { whoOnly: true }).theOwnersAuthority?.holds === true) return
  const mine = theRoleOfTheCaller(req)
  if (mine === null) return

  const cards = theRoleCards()
  // AND THE PERSON'S SAY THAT THIS AGENT MAY ACT FOR THEM, folded in as one more power. Criterion
  // P59. `actsRefusedTo` is the same subtraction before and after: an elevated secretary holds
  // `The person's own acts` as well as its rung's powers, so the acts under that power stop being
  // refused and nothing else changes. There is no second rule here and no second list.
  // AND IT IS FOLDED IN ONLY WHERE THE GRANT PRESSES THIS DOOR, as `mayPressForThePerson` answers for every door a
  // raise opens: not for a run (criterion M81), and not for a door the secretary card keeps for the person. The reason
  // is not asked here, because no body has been read yet; the door asks it. The grant is looked up by the agent this
  // gate already found, `mine`: a handle can be one agent's handle and a retired agent's id.
  const pressing = mayPressForThePerson({ ...actorFrom(req, { whoOnly: true }), id: mine.id }, false)
  const acting = pressing.may ? [cards.elevation.givesThePower] : []
  const refused = actsRefusedTo(cards, mine.role, acting)
  const inWords = refused.get(operation)
  if (inWords === undefined) return

  const card = cardFor(cards, mine.role)

  // A WORD NO CARD HOLDS IS REFUSED IN ITS OWN SENTENCE, because the ordinary refusal below would be
  // untrue about it in two ways: it would say a role holds no power, when the truth is that nobody
  // knows what this word means, and it would tell the reader to ask for a role that may — which is
  // right advice for the wrong problem. Note `c5W3ZBatgdpG`: such a row used to be refused nothing
  // at all. The word is quoted, because the fix is one edit to a registry row or one card added
  // back to the declaration, and neither is findable without it.
  const unknown = roleWordNobodyDeclares(cards, mine.role)
  if (unknown !== null) {
    reply.code(403)
    throw new PanelError(
      `"${mine.handle}" is registered with the role "${unknown}", and no role card holds that word, so Mole ` +
        `Office cannot say what it may do — and ${inWords} is refused along with every other act any role is ` +
        `refused. Nothing was done. The roles this office holds are ${roleNames(cards).join(', ')}. A word ` +
        'outside them is not read as the lowest rung: nobody granted this row a rung, and guessing one would ' +
        'hand it powers on a word nobody wrote. Put one of those words on the registry row — PATCH ' +
        `/api/records/<the agent record> {"dataPatch":{"role":"worker"}} — or add the card back to ` +
        'src/config/roles.json, which takes effect on the next start with no code change.',
      403,
    )
  }

  // WHICH POWERS IT DOES HOLD, NAMED, so the refusal says where the line is rather than only that
  // there is one. The names are the card's own, computed off the tree; nothing here writes a list.
  const held = card === null ? [] : powersOn(cards, card).map((one) => one.name)
  // WOULD THE PRESS HAVE LET THIS THROUGH? True when this card can hold an elevation, has none, and
  // the act is under the power an elevation hands over. Worked out rather than guessed, so the
  // sentence below cannot come to name the press for an act the press would not open.
  const underThePersonsOwnActs = (cards.powers.find((one) => one.name === cards.elevation.givesThePower)?.acts ?? []).some(
    (one) => one.act === operation,
  )
  const isRefusedForWantOfElevation = mayBeElevated(cards, mine.role) && !pressing.may && pressing.because === 'no grant' && underThePersonsOwnActs
  // A SECRETARY THAT HOLDS THE GRANT IS TOLD WHY IT DOES NOT REACH THIS DOOR, in the check's own words: it is a run, or
  // the card keeps the door for the person. The sentence below would send it to a press it already holds.
  if (!pressing.may && pressing.because !== 'no grant' && underThePersonsOwnActs) {
    reply.code(403)
    throw new PanelError(pressing.why, 403)
  }
  reply.code(403)
  throw new PanelError(
    `${inWords} is not something a ${mine.role} may do, and "${mine.handle}" is a ${mine.role}. Nothing was done. ` +
      `A ${mine.role} holds ${held.length === 0 ? 'no power' : held.join(', ')}, and this act is under a power it ` +
      'does not hold. The powers and the cards are in src/config/roles.json, which is the only place that ' +
      'says so — a power moved there takes effect on the next start, with no code change. ' +
      // THE PRESS, NAMED, ON THE ONE CARD THAT COULD HOLD ONE. Criterion P59: *the refusal names the
      // press*. It is said only to the card the declaration allows to be elevated, because telling a
      // worker to ask for a press it can never hold would be pointing at a door that is not there.
      (isRefusedForWantOfElevation
        ? `This act is one of the person's own. They can let you make it by pressing "${thePress(mine.name)}" on your page in ` +
          `Mole Office, at ${participantPagePath('agent', mine.handle)}, and choosing how long it lasts. Nobody else can, and ` +
          'you cannot ask for it by sending a request.'
        : 'Ask the agent that started you to do it, or to give you a role that may.'),
    403,
  )
}

/**
 * A CARD REFUSED EVERYTHING ELSE IS REFUSED THE ACTS NO POWER NAMES AS WELL. A decision, of 27
 * September 2026, says the mail tool holds a key of its own "which may do one thing, read the summonses, and is refused
 * everything else". The refusal above covers every act a power names, since such a card lacks every power but its own;
 * this covers the rest, which every other card may do.
 *
 * ASKED OF A KEY ALONE. Only a request that proves an agent with that agent's own key is asked, and only
 * while some card is refused everything else, so an ordinary read is still not resolved and the call log's
 * `header` keeps its meaning. A claim by name alone proves nothing since the person closed the key window:
 * a read under it is answered as a request that named nobody, as on every door, and a write under it is
 * refused.
 */
function refuseAnActOutsideTheActsACardIsKeptTo(req: FastifyRequest, reply: FastifyReply, operation: string): void {
  const cards = theRoleCards()
  if (!cards.cards.some((one) => one.refusedEverythingElse === true)) return
  const proof = howThisRequestProvedItself(req)
  if (proof?.how !== 'an-agent-key') return
  const who = participantForActor({ type: 'agent', id: proof.whoseId })
  const row = who === null || who.kind !== 'agent' ? null : readParticipant(who)
  if (row === null || !('role' in row)) return
  const role = row.role ?? A_ROW_WITH_NO_ROLE_READS_AS
  const keptTo = theActsACardIsKeptTo(cards, role)
  if (keptTo === null || keptTo.has(operation)) return
  const card = cardFor(cards, role)
  const held = card === null ? [] : powersOn(cards, card)
  reply.code(403)
  throw new PanelError(
    `"${row.handle}" holds the ${role} card, which may do only what its own powers hold ` +
      `(${held.map((one) => one.name).join(', ')}) and is refused everything else, so ${operation} is refused. ` +
      'Nothing was done. The card says so in src/config/roles.json (refusedEverythingElse): the person gave this ' +
      'card one job and refused it every other act.',
    403,
  )
}

/**
 * Install the refusal above every route group, so every `/api` route inherits it.
 *
 * A hook registered after a route group does not run for that group's routes, and the failure is
 * silent in the worst direction: those routes would go on being answered with nobody having asked
 * the question. `refuseActsKeptOnThisMachine` is placed for the same rule, a few lines above this
 * one in `buildApp`.
 */
export function refuseActsARoleMayNotPerform(app: FastifyInstance): void {
  app.addHook('onRequest', async (req, reply) => {
    refuseAnActThisRoleMayNotPerform(req, reply)
  })
}
