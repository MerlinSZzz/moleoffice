// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ANSWER TO ONE ROLE REQUEST: grant or refuse it, with every check the door makes.
 *
 * Two places run it. The route POST /api/roles/requests/:id/grant|refuse in src/server/api/roles.ts runs it once the
 * request is read, and the person's one press in src/server/lib/one-press.ts runs the same function. It lives here, and
 * not beside the route, so that one-press.ts imports no API module. src/server/api/roles.ts re-exports it under the same
 * name.
 */
import { gatePosition } from '../../config/settings.mjs'
import { sqlite } from '../db/client.ts'
import { theOneAgentAStringNames } from './agent-references.ts'
import { theNameAPersonReads } from './inspection.ts'
import { syncTheBroadcastSchedules } from './broadcast.ts'
import { writeTheCardMessageToOne } from './cardmessage.ts'
import { anyRecordForAgent } from '../db/any-record-for-agent.ts'
import { gateMet, gateMetAgainOnceTheWriteIsTakenBack } from './gate-counts.ts'
import { A_WITHDRAWN_GRANT, aNewKeyAsk, answerANewKeyAsk, theWithdrawalTimeOn } from './newkey.ts'
import { type RegisteredAgent } from './participants.ts'
import { participantForActor } from './participant-for-actor.ts'
import { agentByHandle } from '../db/agent-by-handle.ts'
import { readParticipant } from '../db/read-participant.ts'
import {
  // THE PERSON'S PRESS THAT ADMITS A REGISTRATION, checked before it writes anything (message 1uZgEr3aLmke).
  asTheirPressThatAdmitsARegistration,
  // THE ONE DOOR THAT WRITES A ROLE REQUEST'S ANSWER, its grant, refuse and withdraw presses (check nktwJZR4jbWM). Every other write is refused it.
  asTheRoleRequestDoor,
  patchRecord,
  throughTheCardDoor,
  aRaiseCarriesIt,
  type Actor,
} from './records.ts'
import { now } from '@shared/now.ts'
import { PanelError } from './panel-error.ts'
import { ROLE_CARDS_FILE, theRoleCards } from './roles.ts'
import { syncTheSecretariatGroup } from './secretariat.ts'
// A WAITING SELF-REGISTRATION IS ADMITTED BY THE SAME PRESS THAT GRANTS ITS CARD. F15 point 2. The
// one act of writing the agent, its session and its card lives in the library, so this door and the
// self-registration door cannot come to disagree about what a self-registration is.
import {
  aWaitingSelfRegistration,
  howItsKeyIsCollected,
  registerTheSessionItself,
  theFirstKeyOn,
  whatAStartFolderDoes,
} from './selfregistration.ts'
import { anAgentItsOwnKeyProves, refusedWhileTheGateIsOff } from './who-may-act.ts'
import { MOLE_OFFICES_OWN_ROW_HOLDS_NO_CARD, isMoleOffice, participantWord } from '@shared/participants.ts'
import { A_ROW_WITH_NO_ROLE_READS_AS, whyThisRoleMayNotBeGiven } from '@shared/roles.ts'
import type { PanelRecord } from '@shared/types.ts'

/**
 * GRANT OR REFUSE ONE ROLE REQUEST, the whole of what POST /api/roles/requests/:id/grant|refuse does once the request is
 * read. Its own function so the person's one press on a request for one press (src/server/lib/one-press.ts) runs this
 * same door, with every check in it, and not a copy of it. `created` is called when the answer admitted a waiting
 * self-registration, which the route answers with 201.
 */
export function answerARoleRequest(
  request: PanelRecord,
  answer: 'grant' | 'refuse',
  body: { says?: string | undefined },
  actor: Actor,
  created: () => void,
) {
  const asked = { id: request.id }
  const answersTo = request.data['answersTo'] as { kind: string; id: string } | undefined
  const askerRef = request.data['asker'] as { kind: string; id: string } | undefined
  const asking = String(request.data['asking'] ?? '')
  if (answersTo === undefined || askerRef === undefined) {
    throw new PanelError(
      `Request ${asked.id} names no asker or no answerer, so whether this press is allowed cannot be ` +
        'decided. Nothing was written.',
      409,
    )
  }
  // ANSWERED ONCE. A second press on an answered request would rewrite an answer somebody acted
  // on, and the refusal says what the first one was rather than only that it was answered.
  const already = request.data['answer']
  if (typeof already === 'string' && already !== '') {
    // A WITHDRAWN GRANT says when it was withdrawn: `answeredAt` there is still the time of the grant.
    const when = already === A_WITHDRAWN_GRANT ? theWithdrawalTimeOn(request) : request.data['answeredAt']
    throw new PanelError(
      `Request ${asked.id} was already ${already}` +
        `${when === undefined ? '' : ` at ${String(when)}`}. An ` +
        'answer is written once, and the revision that wrote it names the person or agent that pressed: ' +
        `GET /api/records/${request.id}/revisions. Nothing was written.`,
      409,
    )
  }
  // A NEW-KEY ASK IS ANSWERED BY ITS OWN RULE, before the card rule below: the person proved, or the
  // agent's registered starter proving itself with its OWN key. A header naming the starter is not
  // enough here. See problem x8ktQfHS5yGr, src/server/lib/newkey.ts and a decision.
  const newKey = aNewKeyAsk(request)
  if (newKey !== null) {
    return answerANewKeyAsk({ request, ask: newKey, answer, actor, says: body.says ?? null })
  }
  // WHO MAY PRESS: the agent the request says answers it, and the person, who may act anywhere.
  const pressing = participantForActor(actor)
  const itsAnswerer =
    pressing !== null && pressing.kind === answersTo.kind && pressing.id === answersTo.id
  // AND A SECRETARY THEY HAVE RAISED, FOR A REQUEST THAT WAITS FOR THEM. A decision recorded in a
  // message says this door follows another decision. Under that
  // other decision a raised secretary holds their acts but a few, and answering a request is not
  // one of the few. Asked
  // last, so the grant is named on the answer only when nothing else allowed it. An unraised secretary,
  // and every other agent, is refused below as before.
  // The person signed this one answer. Asked before a raise the named agent may also hold, so
  // the ledgers name the signed item. The card limit in chapter 8 rule 4 belongs to the raise;
  // it does not limit the person's own signature on this one card answer.
  const underTheirSignature = actor.type !== 'human' && !itsAnswerer && answersTo.kind === 'person' && actor.signedItem !== undefined
  const underTheirRaise = !underTheirSignature && actor.type !== 'human' && !itsAnswerer && answersTo.kind === 'person' && aRaiseCarriesIt(actor)
  // AT OFF, ANY AGENT ITS OWN KEY PROVES MAY REFUSE A REQUEST ANOTHER AGENT ANSWERS: the gate
  // "who-refuses-a-role-request". A request that waits for the person, a grant and a new-key ask above are not in it,
  // and are answered as at block at both positions. The asker keeps its card and may ask again.
  const inTheGate = answer === 'refuse' && answersTo.kind === 'agent'
  const keyed = inTheGate && anAgentItsOwnKeyProves(actor) !== null
  const position = inTheGate ? gatePosition('who-refuses-a-role-request') : 'block'
  if (actor.type !== 'human' && !itsAnswerer && !underTheirSignature && !underTheirRaise &&
    !(keyed && gateMet('who-refuses-a-role-request', position!) !== 'block')) {
    if (inTheGate && !keyed && position !== 'block') {
      throw refusedWhileTheGateIsOff(actor.id, 'who-refuses-a-role-request', 'refuse a role request that another agent answers')
    }
    // AN AGENT IS NAMED BY ITS HANDLE, read from its row, because a new agent's registry id is not
    // its handle. A stored string no single agent answers, and a person, are shown as stored.
    const named = (who: { kind: string; id: string }): string =>
      who.kind === 'agent' ? (theOneAgentAStringNames(sqlite, who.id)?.handle ?? who.id) : who.id
    // THE PERSON IS THE PERSON, not the agent that started the asker. A request addressed to the person is answered by
    // them, and the sentence names them as what they are rather than reading them as an agent whose starter is themselves.
    const whoAnswers =
      answersTo.kind === 'person'
        ? `the person "${named(answersTo)}"`
        : `${participantWord('agent')} "${named(answersTo)}", which is the agent that started ${named(askerRef)}`
    const refusal = new PanelError(
      `Request ${asked.id} is answered by ${whoAnswers}, and this request came from ` +
        `${actor.type} "${actor.id}". The person's rule is 谁开的向谁沟通: whoever started an agent answers for it. ` +
        'Nothing was written.',
      403,
    )
    if (!keyed) throw refusal
    throw gateMetAgainOnceTheWriteIsTakenBack(refusal, () => gateMet('who-refuses-a-role-request', 'block'))
  }

  const decl = theRoleCards()
  // A WAITING SELF-REGISTRATION: THEIR PRESS ADMITS IT, AND GIVES THE CARD IN THE SAME PRESS. F15
  // point 2, criterion P83 point 6. Nothing is registered until this press. The key is not answered
  // here because the session is not at this keyboard: after the press, the ask of
  // POST /api/agents/register-myself holding the one-time secret its first ask was answered with is
  // answered the key, and that is the one time it is shown.
  const waiting = aWaitingSelfRegistration(request)
  // "NOT YET REGISTERED" MEANS NO LIVE AGENT BEARS THE HANDLE: a retired agent's handle is free
  // again (criterion I3).
  if (waiting !== null && agentByHandle(waiting.handle) === null) {
    // UNDER THEIR RAISE A SECRETARY MAY ADMIT ONE, BUT GIVES ONLY WHAT ITS OWN CARD MAY GIVE. Message
    // vjafrEk1UXk0, answer 1: admitting an agent is carried by the
    // raise.
    // Chapter 8, rule 4: the raise does not carry appointing a secretary or granting elevation, and only the
    // secretary card may hold elevation, so a request to join with a card the secretary's own card may not give is
    // refused with the same sentence as the card grant below.
    if (underTheirRaise && answer === 'grant') {
      const itsCard = (readParticipant(pressing!) as RegisteredAgent | null)?.role ?? A_ROW_WITH_NO_ROLE_READS_AS
      const no = whyThisRoleMayNotBeGiven(decl, itsCard, asking)
      if (no !== null) throw new PanelError(
        `${no} Under the person's raise a secretary may admit an agent for them, but gives only what its own card ` +
          'may give: chapter 8, rule 4. Nothing was written.',
        403,
      )
    }
    const answerSays =
      body.says === undefined || body.says.trim() === '' ? {} : { answerSays: body.says.trim() }
    if (answer === 'refuse') {
      asTheRoleRequestDoor(() => patchRecord(
        request.id,
        { dataPatch: { answer: 'refused', answeredAt: now(), ...answerSays } },
        actor,
      ))
      return {
        request: request.id,
        answer: 'refused',
        agent: waiting.handle,
        role: null,
        note:
          `"${waiting.handle}" was refused the ${asking} card and is not registered: nothing was written about ` +
          'it. The request says who refused it and when.',
      }
    }
    // THE PRESS IS CHECKED BEFORE IT WRITES ANYTHING, and its session for the new agent is filed as their own
    // act (`asTheirPressThatAdmitsARegistration`, answer 4 in message 1uZgEr3aLmke), or under their raise.
    const admitted = asTheirPressThatAdmitsARegistration(actor, () =>
      registerTheSessionItself({
        workspaceId: request.workspaceId,
        actor,
        said: waiting,
        grantTheAskedCard: true,
        answerTheKey: false,
        cardThePersonGave: asking,
      }),
    )
    // AND THE AGENT IT ADMITTED IS WRITTEN BESIDE THE ONE-TIME SECRET'S HASH, so only the ask holding
    // that secret collects this agent's first key (finding 83, mend a2). A row filed before
    // first asks carried a secret has no hash, and nothing is written about one. The session record
    // this press filed is written beside it, so the ask that collects the key is told which it is:
    // that ask never sees this reply.
    asTheRoleRequestDoor(() => patchRecord(
      request.id,
      {
        dataPatch: {
          answer: 'granted',
          answeredAt: now(),
          ...answerSays,
          ...(theFirstKeyOn(request) === null
            ? {}
            : { extra: { firstKey: { agent: admitted.agentId, session: admitted.sessionRecordId } } }),
        },
      },
      actor,
    ))
    // AND THE SECRETARIAT GROUP FOLLOWS THE CARD this press just gave.
    syncTheSecretariatGroup()
    // AND THE BROADCAST SCHEDULE, by a decision.
    syncTheBroadcastSchedules()
    // AND THE START FOLDER THIS PRESS RECORDED, said in the note. Problem xHp5rKVKkXRP. A recorded
    // start folder lets the start hook give this agent's name to sessions started there, so the person's
    // press must not do that without the note saying so. `admitted.startFolder` is the folder
    // `registerTheSessionItself` wrote on the agent record, or null because it wrote none, and the
    // note says "is recorded" only when it is not null.
    const folderSays =
      admitted.startFolder === null
        ? ''
        : ` "${admitted.startFolder}" is recorded as its start folder. ${whatAStartFolderDoes(waiting.handle)}`
    created()
    return {
      request: request.id,
      answer: 'granted',
      agent: waiting.handle,
      agentRecord: admitted.agentRecordId,
      session: admitted.sessionRecordId,
      role: admitted.role,
      startFolder: admitted.startFolder,
      note:
        `"${waiting.handle}" is registered and holds the ${admitted.role} card, and its session record is ` +
        `${admitted.sessionRecordId}. ${howItsKeyIsCollected(request)}${folderSays}`,
    }
  }
  let raisedTo: string | null = null
  if (answer === 'grant') {
    // THE SAME READING REGISTRATION USES. A starter may not grant a card it could not register
    // somebody with, and the refusal names which of the three rules stopped it.
    const theAnswerer =
      answersTo.kind === 'person' ? null : (readParticipant({ kind: 'agent', id: answersTo.id }) as RegisteredAgent | null)
    const heldByAnswerer = answersTo.kind === 'person' ? null : (theAnswerer?.role ?? A_ROW_WITH_NO_ROLE_READS_AS)
    if (answersTo.kind !== 'person') {
      const no = whyThisRoleMayNotBeGiven(decl, heldByAnswerer, asking)
      // MOLE OFFICE'S OWN ROW HOLDS NO CARD. It is held to what a row with no card gives, as before, and its refusal
      // says so first rather than opening as a worker's.
      if (no !== null && isMoleOffice({ kind: 'agent', id: answersTo.id })) {
        const handle = theAnswerer?.handle ?? answersTo.id
        throw new PanelError(
          `Request ${asked.id} is answered by "${handle}", and "${handle}" ${MOLE_OFFICES_OWN_ROW_HOLDS_NO_CARD}. A ` +
            `row with no card may give only what the ${A_ROW_WITH_NO_ROLE_READS_AS} card gives. ${no} Nothing was ` +
            'written.',
          403,
        )
      }
      if (no !== null) throw new PanelError(`${no} Nothing was written.`, 403)
    }
    // UNDER THEIR RAISE, THE SECRETARY GIVES WHAT ITS OWN CARD MAY GIVE. Chapter 8, rule 4: the raise does not carry
    // appointing a secretary, and this is the same reading registration and an agent's answer use, so a raised
    // secretary is told the same sentence for a secretary or an inspector card.
    if (underTheirRaise) {
      const itsCard = (readParticipant(pressing!) as RegisteredAgent | null)?.role ?? A_ROW_WITH_NO_ROLE_READS_AS
      const no = whyThisRoleMayNotBeGiven(decl, itsCard, asking)
      if (no !== null) throw new PanelError(
        `${no} Under the person's raise a secretary answers for them, but gives only what its own card may give: ` +
          'chapter 8, rule 4. Nothing was written.',
        403,
      )
    }
    const askerRow = readParticipant({ kind: 'agent', id: askerRef.id }) as RegisteredAgent | null
    if (askerRow === null) {
      throw new PanelError(`Nothing is registered as "${askerRef.id}" any more. Nothing was written.`, 404)
    }
    const on = anyRecordForAgent(askerRow.id)
    if (on === null) {
      throw new PanelError(
        `"${askerRow.handle}" has no record in any project, so there is nothing to write the card on. Nothing ` +
          'was written.',
        409,
      )
    }
    // THROUGH THE DOOR, for the reason the appointment above goes through it. A granted request
    // for a higher rung is an appointment made by the agent that answers for this one.
    throughTheCardDoor(() => patchRecord(on.record, { dataPatch: { role: asking } }, actor))
    raisedTo = asking
    // AND THE ONE MESSAGE THAT SAYS THE CARD CHANGED, where it really changed. One is written for a
    // change, and none for a change that leaves the card as it was. The waiting
    // self-registration branch above returns before this, because that
    // press registers an agent and the registration's own message is its one message.
    const heldWord = askerRow.role ?? A_ROW_WITH_NO_ROLE_READS_AS
    if (heldWord !== asking) {
      writeTheCardMessageToOne({
        to: { kind: 'agent', id: askerRef.id },
        workspaceId: on.workspaceId,
        role: asking,
        actor,
        change: { from: heldWord, by: actor.id },
      })
    }
  }

  const at = now()
  asTheRoleRequestDoor(() => patchRecord(
    request.id,
    {
      dataPatch: {
        answer: answer === 'grant' ? 'granted' : 'refused',
        // WHO PRESSED IS NOT WRITTEN HERE. It is on the revision this patch makes, which is the
        // ledger every write in this product is attributed by, and a copy in `data` would
        // usually be `answersTo` again — which the record validator refuses outright, because
        // two ParticipantRef objects in one record may not share an id.
        answeredAt: at,
        ...(body.says === undefined || body.says.trim() === '' ? {} : { answerSays: body.says.trim() }),
      },
    },
    actor,
  ))
  // AND THE SECRETARIAT GROUP FOLLOWS THE CARD. A grant that made an agent a secretary adds it; a
  // refusal changes no card and the call writes nothing.
  syncTheSecretariatGroup()
  // AND THE BROADCAST SCHEDULE, by a decision.
  syncTheBroadcastSchedules()

  // THE ASKER IS ANSWERED AND NAMED BY ITS HANDLE, as the other two branches of this door answer
  // `agent`. The stored asker is a registry id, and since the mint (criterion I1) a new agent's id
  // is not its handle. The field is read with the stored reader; where no one agent answers, as stored.
  const askerNamed = theOneAgentAStringNames(sqlite, askerRef.id)?.handle ?? askerRef.id
  // THE SENTENCE NAMES THE OFFICE NAME; THE `agent` FIELD BELOW STAYS THE HANDLE.
  const askerReads = theNameAPersonReads({ kind: 'agent', id: askerRef.id })
  return {
    request: request.id,
    answer: answer === 'grant' ? 'granted' : 'refused',
    // WHO PRESSED, said back rather than stored. The revision this write made carries it too.
    answeredBy: pressing ?? { kind: actor.type === 'human' ? 'person' : 'agent', id: actor.id },
    agent: askerNamed,
    role: raisedTo,
    note:
      raisedTo === null
        ? `${askerReads} was refused the ${asking} card and holds what it held. The request says who refused ` +
          'it and when.'
        : `${askerReads} holds the ${raisedTo} card. What it may do is computed from that word and the tree ` +
          `in ${ROLE_CARDS_FILE} on the next request it makes.`,
  }
}
