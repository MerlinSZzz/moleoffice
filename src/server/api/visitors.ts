// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EMBASSY'S FIVE DOORS FOR A VISITING AGENT'S CREDENTIAL.
 *
 *   POST /api/office/visitors              a visiting agent asks for a credential of its own
 *   GET  /api/office/visitors              every credential this office holds, with what each did
 *   GET  /api/office/visitors/:id          one credential, its facts, and every request under it
 *   POST /api/office/visitors/:id/confirm  the person confirms it as administrator. One press
 *   POST /api/office/visitors/:id/end      the person ends it. One press
 *
 * Criteria P24 to P30 of design/permissions/ACCEPTANCE.md, on answer 3.
 * src/shared/visitors.ts is the vocabulary, src/server/lib/visitors.ts is the store, and
 * src/server/lib/visitorgate.ts is what a request carrying a credential meets.
 *
 * ---------------------------------------------------------------------------------------
 * ALL FIVE REACH ANOTHER MACHINE, AND THAT IS THE WHOLE POINT OF THEM
 * ---------------------------------------------------------------------------------------
 *
 * A credential exists for an agent that is not on this machine, so a door it could not reach would
 * be a door for nobody. That answer puts the confirmation on either machine as well: the person confirms it
 * at the Embassy, on whichever installation they open. So `confirm` and `end` are `remote` too. What
 * keeps them the person's is the clause below, not the door.
 *
 * ---------------------------------------------------------------------------------------
 * WHY "ONLY THE PERSON CONFIRMS" IS WRITTEN HERE AND NOT IN roles.json
 * ---------------------------------------------------------------------------------------
 *
 * The role cards subtract acts from a REGISTERED caller's rung, and rung 0 — a caller no registry
 * holds — is deliberately not narrowed at all: such a caller is named only, never stopped. A visiting agent on
 * another machine is rung 0 by definition, because the whole reason it needs a credential is that
 * no registry here holds it. So a rule written in roles.json would refuse every agent this office
 * knows about and let through the exact caller these two presses exist to keep out.
 *
 * The clause is therefore on the act: an actor that is not the person is refused, except a secretary
 * holding the person's grant where this office's list of what the grant carries says so. It carries the
 * same limit chapter 8's third rule states and the owner's decision accepted. The limit
 * is that Mole Office cannot tell the person from a program on the person's machine that sends the person's name,
 * and the refusal says so rather than claiming more.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { isAPersonsDeviceCredential, whyTheseFactsAreNotEnough, type VisitorCredential } from '@shared/visitors.ts'
// THE CARDS THE TREE HOLDS, criterion P81: a credential names the card it asks for, the door refuses
// a word no card holds, and the confirm gives that card unless it is one that only the owner appoints.
import {
  A_ROW_WITH_NO_ROLE_READS_AS,
  cardFor,
  cardIsAboveTheCeiling,
  DEFAULT_VISITOR_CARD_CEILING,
  isARole,
  theRoleWordsSaid,
  theVisitorCeilingWasRaised,
} from '@shared/roles.ts'
// THE REFUSAL FOR A REQUEST NOT PROVED TO BE THE PERSON, written in one place for every door that keeps
// an act for the person. In a test world it also names who may act there (criterion P84).
import { theRefusalForSomebodyNotProvedThePerson, whatThisRequestShowed } from '../lib/not-proved-the-person.ts'
// THE MACHINES THIS OFFICE TRUSTS, criterion P73. Confirming a credential adds the machine it was
// confirmed for, because confirming a visiting agent from a machine IS trusting that machine.
import { whyThisMachineIsRefused, type TrustedMachine } from '@shared/trustedmachines.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import type { EmbassyRow } from '@shared/worlds.ts'

import { sayItWasDoneFromAnotherComputer } from '../lib/changed-from-another-computer.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
// WHO THE OFFICE KNOWS, AFTER THIS PRESS. Criterion P77: confirming and refusing answer with the
// list as it now stands, so the Embassy changes the asking block and the list where they are
// instead of reading everything again. It is the SAME reader the Embassy's own route calls, not a
// second way of building a row.
import { theEmbassy } from './office.ts'
import { type RegisteredAgent } from '../lib/participants.ts'
import { participantForActor } from '../lib/participant-for-actor.ts'
import { agentByHandle } from '../db/agent-by-handle.ts'
import { agentForRecord } from '../db/agent-for-record.ts'
import { theRoleCards } from '../lib/roles.ts'
// THE CEILING ON A VISITOR'S CARD. Criterion P86. One reader for the ask door and the confirm.
import {
  theVisitorCardCeiling,
  whyThisCardIsAboveTheVisitorCeiling,
  VISITOR_CARD_CEILING_SETTING,
} from '../lib/visitorceiling.ts'
import { createRecordWithReport, throughTheCardDoor } from '../lib/records.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { writtenFrom } from '../lib/machines.ts'
import { liveWorldOf } from '../lib/office.ts'
import { aRaiseCarriesIt, writeDownAnActUnderTheRaise, type Actor } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import type { ANameBesideTheDoors } from '@shared/what-the-grant-carries.ts'
import { route } from '../lib/route.ts'
import { theActKeptHere } from '../lib/reach.ts'
import {
  confirmACredential,
  credentialById,
  endACredential,
  everyCredential,
  issueACredential,
  issueAPersonsDeviceCredential,
  registerACitizenOfAKnownWorld,
  requestsUnder,
  whyAVisitorMayNotTakeThisHandle,
  theKeyOneConfirmedCredentialBinds,
  HOW_LONG_A_CREDENTIAL_LASTS_DAYS,
} from '../lib/visitors.ts'
// THE KEYS THE OFFICE HOLDS. Criterion D2 and D3: a confirmed person's device is the person because
// its token's hash is in `held_keys`, and the Embassy's revoke press marks that row revoked.
import {
  EMBASSY_KEY_REVOCATION,
  aKeyRowHasThisId,
  revokeTheKeyNamed,
  theKindOfHolderOfTheKey,
  theLiveKeyWithThisId,
  undoEmbassyKeyRevocation,
} from '../lib/keys.ts'
import { KEY_REVOCATION_UNDO_MS } from '@shared/danger-tiers.ts'
import { nowStamp } from '@shared/time.ts'
import {
  machinesTrustedHere,
  stopTrustingThisMachine,
  thisOfficeTrusts,
  trustThisMachine,
  whatTheOfficeTrusts,
} from '../lib/trustedmachines.ts'
// WHETHER THE ONE-VERSION KEY WINDOW IS STILL OPEN, and the person's press that closes it. Criterion
// P83, point 6. `theKeyWindowSays` is the one reading of the installation row; `aKeyProvesThisCaller`
// and `theClosePressIsOpenTo` are the one answer to whether this request may press.
import {
  aKeyProvesThisCaller,
  closeTheKeyWindow,
  theClosePressIsOpenTo,
} from '../lib/keywindow.ts'
import { theKeyWindowSays } from '../db/the-key-window-says.ts'
// WHICH LIVE AGENTS HOLD NO PROVED KEY, which the close press refuses on, and
// how the confirm press proves the key it binds (migration 0180).
import { howThisPressProvesTheKeyItMakes, whyTheKeyWindowMayNotCloseYet } from '../lib/provedkeys.ts'

// ============================================================================ what a caller sends

const askForOne = z
  .object({
    handle: z.string().min(1, { error: 'a credential is issued to a handle, like "the-other-worker".' }).optional(),
    name: z.string().min(1, { error: 'what a reader sees. A name rather than a description.' }).optional(),
    role: z.string().min(1, { error: 'which role card this credential is issued against.' }).optional(),
    /**
     * A PERSON'S DEVICE ASKS UNDER ITS OWN NAME AND FOR NO CARD. Criterion D2, P83 point 4.
     *
     * A phone, a MacBook or a browser has no handle it chose, no name it chose and no role card, so
     * it sends this instead of the three an agent sends. The value is the device's own name, which
     * is what its `visitor_credentials` row is written with and what its `held_keys` row is keyed by
     * so one device can be revoked without touching the person's others.
     */
    device: z.string().min(1, { error: 'a person\'s device names the device, like "my-laptop".' }).optional(),
    /** The world it says it belongs to, by database identity, or absent because it has none yet. */
    world: z.string().min(1).nullish(),
    conversationPath: z.string().nullish(),
    startDirectory: z.string().nullish(),
    runtime: z.string().nullish(),
    sessionRecord: z.string().nullish(),
  })
  .strict()

const whichCredential = z.object({ id: z.string().min(1) })

/** The key an undo names, by its id. The undo door answers 409 for an id that is no revocation it can undo. */
const whichHeldKey = z.object({ id: z.string().min(1) })

/**
 * THE KEY A REVOKE NAMES, BY ITS ID, OR A CODED REFUSAL. Criterion D3; problem yZ71bheXm-Ji.
 *
 * The press used to be one per agent and revoked whichever key was newest. Now each press names one
 * `held_keys` row, and a revoke that names no key row is refused before anything is read or written:
 * a blank id, or a string that is an agent's name or id, a credential or anything else that is not a
 * key's id. A key row that was revoked already is a key, so it passes here and the door answers 404
 * for it, as before. The English names what was sent and where the ids are read; the page draws the
 * code's sentence (E1).
 */
function theKeyARevokeNames(params: unknown): string {
  const id = typeof params === 'object' && params !== null ? String((params as Record<string, unknown>)['id'] ?? '').trim() : ''
  if (id !== '' && aKeyRowHasThisId(id)) return id
  const sent = id === '' ? 'no key id' : `"${id}", which is not the id of a key this office holds`
  throw new PanelError(
    `A revoke names one key by its id, and this one named ${sent}. An agent can hold several keys at once, so a ` +
      'revoke that names the agent is not enough. Each key\'s id is in heldKeys on the rows of GET /api/office/embassy. ' +
      'Nothing was revoked.',
    400,
    undefined,
    undefined,
    'A revoke must name one key by its id.',
    { code: 'embassyKeysNoKeyNamed', values: {} },
  )
}

const endBody = z.object({ because: z.string().min(1).max(500).optional() }).strict()
const undoKeyBody = z.object({ revokedAt: z.string().min(1).max(80) }).strict()

/** The machines this office trusts. Criterion P73. */
const whichMachine = z.object({ id: z.string().min(1) })
const trustBody = z
  .object({ address: z.string().min(1).max(200), note: z.string().min(1).max(500).optional() })
  .strict()
const untrustBody = z.object({ because: z.string().min(1).max(500).optional() }).strict()

// ============================================================================ the sentences

const TRUSTED_NOTE =
  'The machines this office trusts, criterion P73. `machines` is what it trusts now and `removed` is what it once ' +
  'trusted: a row is never deleted, so the office does not lose the record of who it let in. `how` says where each ' +
  'row came from — a press at the world\'s page, the confirmation of a visitor credential, or the environment, ' +
  'which is MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES written in when the server started so the list says what the ' +
  'office actually opened a door for. `boundByTheEnvironment` is that address, or null because the environment ' +
  'named none and nothing but this computer can reach this server. WHAT THE LIST DECIDES is in `says`, and the ' +
  'short of it is: it marks a visiting agent\'s requests with whether the machine is one you trust, it refuses ' +
  'nothing, and it does not decide what this server binds.'

const TRUST_NOTE =
  'Trust a machine. Body {"address":…,"note"?:…} — the device name, the hostname or the address, as you would ' +
  'write it. The person\'s press. A secretary holding the person\'s grant may press it where this office\'s list of ' +
  'what the grant carries says so; any other agent is refused and the refusal names who may. A machine already ' +
  'trusted is refused with when it was added; a name with no machine in it, and every-address spellings like ' +
  '0.0.0.0, are refused with what to write instead. It is `local` because deciding which machines are trusted from ' +
  'another machine is the door widening itself.'

const UNTRUST_NOTE =
  'Stop trusting a machine. Body {"because"?:…}. The row is NOT deleted: it is marked removed with who did it, ' +
  'when and why, and it stays on `removed`. The person\'s press. The one row a press cannot remove is the one the ' +
  'environment put there — a press cannot unbind a socket, so removing it would leave the door open and the list ' +
  'saying it was shut; the refusal says which variable to change instead.'

const ASK_NOTE =
  'A VISITING AGENT ASKS FOR A CREDENTIAL OF ITS OWN, OR A PERSON\'S DEVICE DOES. Body {"handle":…,"name":…,' +
  '"role":…,"world"?:…,"conversationPath"?:…,"startDirectory"?:…,"runtime"?:…,"sessionRecord"?:…} for an agent, or ' +
  '{"device":"…"} for a person\'s device. ONE CREDENTIAL PER AGENT, not per machine and not per world. AT LEAST ' +
  'ONE OF conversationPath AND startDirectory is required FOR AN AGENT: they are the facts of this run, and every ' +
  'later request sends them back on x-mole-office-conversation and x-mole-office-start-directory so the office can ' +
  'compare them. A PERSON\'S DEVICE NAMES ITSELF AND ASKS FOR NO CARD, because a browser has none of the three and ' +
  'no run facts. THE TOKEN IS SHOWN ONCE, in this reply, and stored as a hash — the office cannot hand it back ' +
  'either, so keep it. THE CREDENTIAL IS PENDING and its requests are refused until the owner confirms it at the ' +
  'Embassy, on either machine. ONCE CONFIRMED, A PERSON\'S DEVICE SENDS THIS SAME TOKEN ON ' +
  'x-mole-office-key: the confirmation registers its hash as the device\'s key and the request is then the person. ' +
  'THE ONE EXCEPTION is a `world` this office already holds a live row for: its agents are citizens of a world the ' +
  'same person owns, so the credential is trusted at once and no confirmation is asked for, and a person\'s device ' +
  'never takes this path. A HANDLE THAT ALREADY NAMES AN AGENT HERE IS REFUSED with 409, naming that agent: a ' +
  'live agent\'s handle, or any agent\'s id, because the credential\'s key would act as that agent; ask under ' +
  'another handle. The machine is measured from the connection and never read from the body.'

const LIST_NOTE =
  'EVERY CREDENTIAL THIS OFFICE HOLDS, newest first, pending, trusted and ended alike. Each carries who, from ' +
  'which machine, on which facts, how many requests have been made under it, how many of those wrote, how many ' +
  'did not match the facts it was issued with, who confirmed it and when, and when it runs out. The counts are ' +
  'counted from the requests themselves rather than stored, so no number here can disagree with the rows it came ' +
  'from. NO TOKEN AND NO HASH IS EVER ON THIS REPLY. Writes nothing.'

const ONE_NOTE =
  'ONE CREDENTIAL, its facts, and every request made under it, newest first. A request row says what was asked ' +
  'for, whether it was refused and why, and — where the facts did not match — which fact, what the credential was ' +
  'issued with, and what the request sent. `cannotProve` is what a credential cannot tell you, in sentences, ' +
  'because a mismatch count with nothing beside it reads as proof and is not. Writes nothing.'

const CONFIRM_NOTE =
  'THE OWNER CONFIRMS A VISITOR, as administrator, in one press. Until this the credential is pending and every ' +
  'request under it is refused. THE OWNER CONFIRMS A VISITOR as administrator. A secretary holding the owner\'s ' +
  'grant may press it where this office\'s list of what the grant carries says so. ANY OTHER AGENT IS REFUSED, ' +
  'from every machine. It cannot refuse a program on the owner\'s machine that sends the owner\'s name — nothing here ' +
  'authenticates anybody — so the rule is on the asker. A credential already ended is ' +
  'not confirmed back into use. THE PRESS WRITES THE AGENT RECORD AND ITS ROW, criterion P81: the handle the ' +
  'credential asked for, and the card it asked for, in the same press, so the row leads to a citizen\'s page that ' +
  'answers. A card the owner appoints by the owner\'s own press — the secretary and the inspector — is NOT given by this ' +
  'one: such a credential is confirmed as a worker and `citizen.says` names the press that would give the card ' +
  'asked for. A HANDLE THAT ALREADY NAMES AN AGENT (a live agent\'s handle, or any agent\'s id) IS REFUSED with ' +
  '409, naming that agent, before anything is written, because the credential\'s key would act as that agent. ' +
  'The one exception is ' +
  'the row that already carries this credential, met when the same credential is confirmed again: the press ' +
  'writes nothing, and `citizen.says` names the row and what the credential\'s key proves. A PERSON\'S ' +
  'DEVICE IS NOT GIVEN A CARD AND WRITES NO AGENT ROW: it asks for no card, and the press binds the token it was ' +
  'shown when it asked as its key, answering `deviceKey` with that key\'s id exactly once (criterion D2, P83 point ' +
  '4). THE REPLY ' +
  'CARRIES THE ONE ROW THE CONFIRMED VISITOR MADE (`row`), built after the write by the reader the Embassy ' +
  'page reads, so the page swaps it in where it stands rather than reading the whole roll again and blanking ' +
  'while it waits (criterion P77). It carries no whole reading: on a made-up office of the live size that was ' +
  'megabytes and many seconds to answer one visitor. AN AGENT CREDENTIAL IS ANSWERED WITH `agentKey`, naming the ' +
  'row id of the key the press bound: its token, which the agent already holds, is its key on x-mole-office-key ' +
  'too, and the office keeps only the SHA-256.'

const END_NOTE =
  'THE OWNER ENDS A CREDENTIAL, in one press. Every request under it is refused afterwards, with a sentence ' +
  'naming the credential and when it ended. THE ROW IS KEPT AND MARKED; nothing is deleted, and every request ' +
  'ever made under it stays, because the office does not delete the evidence of how somebody got in. A ' +
  'secretary holding the owner\'s grant may press it where this office\'s list of what the grant carries says so. ' +
  'ANY OTHER AGENT IS REFUSED, for the reason confirm is. THE REPLY CARRIES THE ENDED CREDENTIAL and no whole ' +
  'reading: the Embassy removes its card where it stands, and the press needs nothing else (criterion P77).'

const REVOKE_KEY_NOTE =
  'REVOKE THE KEY ONE ROW\'S HOLDER HOLDS, in one press, from the Embassy. Body {"because"?:…}. THE KEY IS MARKED ' +
  'REVOKED AND KEPT: the row is never deleted, so the office keeps the record of a key it once issued, and a ' +
  'request carrying it afterwards proves nothing. NOTHING ELSE CHANGES — the agent is not retired and the ' +
  'credential is not ended; they keep their page and their standing. IT IS THE PERSON\'S PRESS and is kept on this ' +
  'machine, because a caller from elsewhere revoking a key is the door being asked to take away the key that would ' +
  'have proved who it is. THE REPLY NAMES THE KEY IT REVOKED and carries no whole reading: the panel reads the ' +
  'one row again, and on a made-up office of the live size the whole reading was megabytes (criterion P77).'

const KEY_WINDOW_NOTE =
  'WHETHER THE ONE-VERSION KEY WINDOW IS STILL OPEN, criterion P83 point 6. While it is open a request that sends ' +
  'identity headers and no key still counts when a listener carried it from this computer or from a machine on ' +
  'the trusted list (P73), whether the headers name the person or an agent. Once it is closed a request a listener ' +
  'carried with no key is nobody: a write is refused, except at the doors that hand out a key; a read under an ' +
  'agent\'s name is answered as a request that named nobody; and a claim to be the person proves nothing. `open` is true until the person closes it; `closedAt` and `closedBy` ' +
  'are the moment and the who of the person\'s press, both null while it is open. `closeIsRefusedBecause` says why the ' +
  'press would be refused now because a live agent holds no proved key: `count`, the whole list `agents` (id, ' +
  'handle and `why`), and `says`, the sentence the press refuses with; it is null when every live agent holds a ' +
  'proved key, and on a closed window. This is a read and writes nothing.'

const CLOSE_KEY_WINDOW_NOTE =
  'CLOSE THE ONE-VERSION KEY WINDOW, in one press, criterion P83 point 6. It closes BOTH halves at once — a claim ' +
  'with no key stops counting from this computer and from the trusted machines — and there is no separate remote ' +
  'switch. The press is recorded on the office\'s one installation row: the moment, and the kind and the id of who ' +
  'pressed it, and the Settings list then says who closed it and when. A window already closed is refused ' +
  'with the recorded moment and is not rewritten. IT IS THE PERSON\'S PRESS and is kept on this machine, because a ' +
  'caller from elsewhere closing the window is the door being asked to shut the door it came through. An agent is ' +
  'refused and the refusal names who may, except a secretary holding the person\'s grant, with its own key, where ' +
  'this office\'s list of what the grant carries says the grant presses it; the secretary card keeps it for the ' +
  'person, and the row then names the secretary and the change log the secretary and the grant. AND A CALLER THE ' +
  'WINDOW ITSELF ' +
  'PROVED IS REFUSED: it holds no key, so ' +
  'closing the window would shut it out, and the press asks for a key that outlives the window. AND IT REFUSES ' +
  'WHILE A LIVE AGENT HOLDS NO PROVED KEY, before anything is written: the refusal names ' +
  'the first 20 such agents with why, how many there are, and the two ways out — a key through a proved path, or ' +
  'retiring the agent. GET /api/office/key-window answers the same list first.'

/**
 * THE SENTENCE A CALLER THE WINDOW PROVED IS REFUSED WITH. Criterion P83, point 6.
 *
 * THREE THINGS, one idea per sentence, and nothing else: the browser holds no key, closing the window
 * would shut it out, and pairing is the way in. No criterion number and no machinery word reaches
 * this. The last sentence is the one every refusal of a write carries: nothing was done.
 *
 * THE PANEL DRAWS THE SAME THREE SENTENCES from `CLOSE_THE_WINDOW_WORDS.refused`, so the words a
 * person reads before the press are the words the door answers with. The two are one statement of
 * the same fact; the door's copy ends with what a refusal has to say because a request was made.
 */
const CLOSE_THE_WINDOW_REFUSAL =
  'This browser holds no key. Closing the window would shut this browser out. Pair this browser first. ' +
  'Nothing was done.'

/**
 * The one clause that keeps these two presses the person's. See this file's header for why it is not in
 * roles.json.
 *
 * THE STORED WORD FOR WHAT THE CALLER IS DOES NOT REACH THE SENTENCE. `human` and `agent` are how
 * the wire says it, and printing one into prose a person reads is what tests/the-machine-word-gate
 * exists to stop. The refusal names the caller by the id it gave, which is what a reader can act on.
 */
/**
 * WHO ASKED, AS THEY ARE. Criterion P84.
 *
 * These presses were the person's alone until 8 September 2026, so every one of them wrote
 * `{ kind: 'person', id: actor.id }` — true then, and a false name now that a world's starter and the
 * secretary may make them. What is recorded is the caller, whichever of the two it is.
 */
function whoAsked(actor: { type: string; id: string }): ParticipantRef {
  return { kind: actor.type === 'human' ? 'person' : 'agent', id: actor.id }
}

function onlyThePersonMay(
  actor: Actor,
  req: FastifyRequest,
  whereItIsDone: string,
  part: ANameBesideTheDoors | null = null,
): void {
  // AND A STATED PERSON HAS TO HOLD THE PERSON'S KEY. Criterion P83, point 1: the header claim is
  // attribution, and the key is what makes a caller the person. A header with no key from loopback or
  // a trusted machine still counts while the window is open; from anywhere else it is nobody.
  if (thePersonIsProved(actor)) return
  // INSIDE A TEST WORLD, ITS STARTER AND THE SECRETARY MAY. Criterion P84: whoever started a test world
  // holds the highest power in it. The actor is unchanged and stays the agent it is, so the ledgers
  // say which agent did it and nothing here is the owner's word.
  if (actor.theOwnersAuthority?.holds === true) return
  // AND THE PERSON'S RAISE, WHERE THIS OFFICE'S LIST SAYS IT CARRIES THE ACT. Two decisions on problem aCZiUynEQao0
  // say that a raise carries every act of the person's except closing the key window, writing a regulation and changing who the owner
  // is. The doors that decide who is the person (a machine trusted, a credential
  // confirmed) are kept on
  // the card's default list by their operation; a door that does that only for a person's device or key passes the part
  // it touches, which the card keeps by its name beside the doors. Each office's person may change either answer. Asked
  // last, so the raise is named only where nothing else allowed it.
  if (aRaiseCarriesIt(actor, { also: part === null ? [] : [part] })) return
  // THE WORDS ARE WRITTEN IN ONE PLACE, lib/not-proved-the-person.ts, from the facts of this request:
  // why it is not the person and the way on for its kind of caller, and in a test world who may act there.
  throw new PanelError(
    theRefusalForSomebodyNotProvedThePerson(whatThisRequestShowed(actor, req), {
      refused: `${theActKeptHere(req)} is the owner's own act`,
      nothingWasDone: 'Nothing was done.',
      whoMay:
        `The owner does it, ${whereItIsDone}: the owner confirms and supervises the agents and machines this office ` +
        'trusts. A secretary holding the owner\'s grant may press it where this office\'s list of what the grant ' +
        'carries says so. Any other agent may ask for a credential and may file a proposal about one; it may not ' +
        'confirm or end one, and it may not say which machines this office trusts.',
    }),
    403,
  )
}

// ============================================================================ the routes

/**
 * TRUST THE MACHINE A CREDENTIAL WAS CONFIRMED FOR, and answer null wherever that cannot be done.
 *
 * NULL HAS THREE CAUSES AND THEY ARE ALL ORDINARY: the credential names no machine, the name is not
 * one this list can hold, or the office already trusts it. None of them is a reason to refuse the
 * confirmation, so none of them throws.
 */
function alsoTrustTheMachine(
  machine: string | null,
  by: ParticipantRef,
  credentialId: string,
): TrustedMachine | null {
  if (machine === null || whyThisMachineIsRefused(machine) !== null) return null
  if (thisOfficeTrusts(machine)) return null
  return trustThisMachine(machine, by, 'a credential', null, credentialId)
}

/**
 * WHAT A CONFIRM WRITES: the agent record and its registry row, with the card the credential asked
 * for. Criterion P81, and the half of problem dOhkq6Nrbq2b that perm-5a left open.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Confirming wrote the credential's standing and nothing else. Measured on 8 September 2026: a
 * credential asking for the supervisor card was confirmed 200, and the profile of the handle it
 * asked for answered 404 both before and after — "No agent in this installation answers to
 * codex-far" — because no registry row and no agent record had been made. The Embassy drew the row
 * as a VISITOR, unregistered, and the card on it came off the credential rather than off any row.
 *
 * ---------------------------------------------------------------------------------------
 * THE CARD THE CONFIRM PRESS CANNOT GIVE
 * ---------------------------------------------------------------------------------------
 *
 * A card whose `appointedBy` is `the person` — the secretary and the inspector — is appointed by the person's
 * own press on the citizen's page, and by nothing else: only the person appoints a secretary.
 * The confirm press says "let this agent in"; it does not say "be my
 * secretary", and one press meaning both would let a visiting agent name itself secretary in its own
 * credential and be handed the card by the press that admits it.
 *
 * So such a credential confirms AS A WORKER and says so — on the row, where the card is written and
 * the mark says the owner gave it, and in the reply, in a sentence naming the press that would give
 * the card asked for. Nothing is confirmed without a card: the worker card is written either way.
 *
 * ---------------------------------------------------------------------------------------
 * A HANDLE THAT IS ALREADY THIS CREDENTIAL'S ROW GETS THAT ROW
 * ---------------------------------------------------------------------------------------
 *
 * Criterion P81's collision rule, from the owner's case of 8 September: one session on another machine gets
 * one row. A handle that names an agent is refused at the confirm door before anything is written,
 * unless that agent's row carries this very credential (`whyAVisitorMayNotTakeThisHandle` in
 * src/server/lib/visitors.ts). So the only
 * live row this function can meet is the one this credential already has, which happens when the
 * same credential is confirmed a second time. It writes nothing then: no second row, and nothing
 * on that row. The sentence says so.
 *
 * IT DOES NOT LINK. Until 25 September 2026 the sentence said this branch "linked the credential to
 * that row", and nothing was written (problem miIe0Y41ciEM). The design words
 * (DESIGN-2026-09-08-perm-5.md) say a taken handle is refused with the row named and the attach
 * offered. The refusal is built; the attach press is not.
 *
 * `rowWasThere` tells the route that this branch answered, so the route can add what the key
 * bound at the same press proves. The key is bound after this function (criterion I5), so only the
 * route knows it. The route does not send `rowWasThere` in the reply.
 */
function theCitizenAConfirmMakes(
  credential: VisitorCredential,
  by: ParticipantRef,
  workspaceId: string,
): { agent: RegisteredAgent | null; card: string; asked: string; says: string; rowWasThere: boolean } {
  const cards = theRoleCards()
  const wanted = cardFor(cards, credential.role)
  // THE CEILING ALREADY RULED AT THE ROUTE, BEFORE THIS CREDENTIAL WAS CONFIRMED. P86. This reading
  // is for the row's own sentence: a card above the default ceiling is held only because the setting
  // raised that ceiling, and the row says so. A card at or below the default needs no such sentence.
  const ceiling = theVisitorCardCeiling()
  const card = wanted === null ? A_ROW_WITH_NO_ROLE_READS_AS : wanted.name
  const raised =
    ceiling.problem === null &&
    theVisitorCeilingWasRaised(cards, ceiling.word) &&
    cardIsAboveTheCeiling(cards, wanted, cardFor(cards, DEFAULT_VISITOR_CARD_CEILING))

  // THE LIVE AGENT BEARING THIS HANDLE, if one does. A handle only retired agents bear is free again
  // (criterion I3), so the confirmation below writes a new agent under it with an id of its own.
  const already = agentByHandle(credential.handle)
  if (already !== null) {
    // THE CONFIRM DOOR REFUSED EVERY OTHER ROW BEFORE IT WROTE ANYTHING (problem z-9zXhVeAPvA), so a
    // live row here carries this credential. One that does not is a broken assumption, said loudly.
    if (already.credential !== credential.id) {
      throw new PanelError(
        `"${credential.handle}" answers to ${already.name} (${already.id}), which does not carry the credential ` +
          `${credential.id}, and the confirm door should have refused this before writing anything. Nothing was ` +
          'written on that row.',
        500,
      )
    }
    return {
      agent: already,
      card: already.role ?? A_ROW_WITH_NO_ROLE_READS_AS,
      asked: credential.role,
      says:
        `"${credential.handle}" already answers to ${already.name} (${already.id}), the row that already carries ` +
        'this credential. This confirmation wrote nothing: no second row, and nothing on that row.',
      rowWasThere: true,
    }
  }

  // THROUGH THE CARD DOOR, so the confirmation may write the card on the record. The ordinary record
  // write refuses a card on an agent record to everybody but the person (problem mz5ddKDITE3j), and
  // this IS the person: only they confirm, which the clause above this route already held.
  const created = throughTheCardDoor(() =>
    createRecordWithReport({
      workspaceId,
      kind: 'agent',
      title: credential.name,
      data: {
        handle: credential.handle,
        state: 'active',
        role: card,
        // WHO CHOSE IT, criterion P75: the confirmer, because the confirmation is what gave the
        // card. `who` is left out where nobody chose, and here somebody did.
        cardChosenBy: { how: 'a-credential', who: { kind: by.kind, id: by.id } },
        // WHO STARTED IT: the confirmer. Nothing else in this office answers for a row that arrived
        // from another machine, and a chain that reaches nobody is refused everywhere else.
        startedBy: { kind: by.kind, id: by.id },
        credential: credential.id,
        ...(credential.facts.runtime === null ? {} : { runtime: credential.facts.runtime }),
      },
      actor: { type: by.kind === 'person' ? 'human' : 'agent', id: by.id },
    }),
  )
  // THE ROW JUST WRITTEN, read through the record the confirmation wrote.
  const made = agentForRecord(created.record.id)
  return {
    agent: made,
    card,
    asked: credential.role,
    says: raised
      ? `Confirmed with the ${card} card, which is the card this credential asked for. That card is above the ` +
        `visitor card ceiling by default, and this row holds it only because ${VISITOR_CARD_CEILING_SETTING} ` +
        'raised the ceiling. The row is written and the citizen has a page.'
      : `Confirmed with the ${card} card, which is the card this credential asked for. The row is written and the ` +
        'citizen has a page.',
    rowWasThere: false,
  }
}

/**
 * WHAT THE KEY BOUND AT THE CONFIRM PROVES, SAID ABOUT A ROW THE CONFIRM DID NOT WRITE. Problem
 * miIe0Y41ciEM.
 *
 * When the handle already answers to a row, nothing is written on that row. The credential's token
 * is still an agent key, kept under whatever `theKeyOneConfirmedCredentialBinds` resolved the handle
 * to. A person told only that nothing was written would believe the token proves nobody. So this
 * reads the key row the press actually holds and says which of three things is true: the key is
 * revoked and proves nobody, it proves that row, or it is kept under another holder.
 */
function whatTheKeyProvesAboutTheRowThatWasThere(
  row: RegisteredAgent,
  bound: { whoseKind: string; whoseId: string; revokedAt: string | null },
): string {
  if (bound.revokedAt !== null) {
    return `This credential's key was revoked at ${bound.revokedAt}, so its token proves nobody.`
  }
  if (bound.whoseKind === 'agent' && bound.whoseId === row.id) {
    return `This credential's key is kept under that row's id, so a request carrying its token is ${row.name}.`
  }
  return `This credential's key is kept under "${bound.whoseId}", not under that row.`
}

export async function visitorRoutes(app: FastifyInstance): Promise<void> {
  app.post('/office/visitors', route('office.issue-credential', 'remote', ASK_NOTE), async (req, reply) => {
    const body = parse(askForOne, req.body, 'The credential to issue')
    // The actor is read so a misspelt identity header is refused here as it is on every other write.
    actorFrom(req)
    // WHERE IT ASKED FROM IS MEASURED AND NEVER READ FROM THE BODY. `writtenFrom` reads the socket,
    // or the forwarded header for the door a private network daemon passes requests through, and
    // says which of the two it is. A caller that could name its own machine could name anybody's.
    const from = writtenFrom(req)

    /**
     * A PERSON'S DEVICE ASKS UNDER ITS OWN NAME AND FOR NO CARD. Criterion D2, P83 point 4.
     *
     * A phone, a MacBook or a browser has no handle it chose, no name it chose, no role card and no
     * run facts, so it sends `device` and nothing else. The office stores the device's own name in
     * the credential row's `handle`, `name` and the `held_keys` row that links the key to the one
     * device; the role is the empty word `A_DEVICE_ASKS_FOR_NO_CARD`, which is what tells the confirm
     * this credential is a device and that P86's ceiling — which is about a card — does not apply.
     *
     * IT DOES NOT GO THROUGH `whyTheseFactsAreNotEnough`, and that is not a skipped check: the two
     * facts that check asks for are the facts of an agent's RUN, and a device names a device. It does
     * not reach the citizen path either, because a device belongs to no world.
     */
    if (body.device !== undefined) {
      if (body.handle !== undefined || body.name !== undefined || body.role !== undefined) {
        throw new PanelError(
          'A person\'s device asks under its own name and for no card, so a request naming a device must not also ' +
            'name a handle, a name or a role. Nothing was issued.',
          400,
        )
      }
      if (body.world !== undefined && body.world !== null) {
        throw new PanelError(
          'A person\'s device belongs to no world, so it cannot name one. Nothing was issued.',
          400,
        )
      }
      const issued = issueAPersonsDeviceCredential({
        name: body.device,
        machine: from.machine,
        machineHow: from.how,
        runtime: body.runtime ?? from.program,
      })
      reply.code(201)
      return {
        ...issued,
        confirmationAsked: true,
        says:
          'Keep this token: it is shown once and this is that once, and the office stores only a hash of it. This ' +
          'is a person\'s device asking to come in, so it names no card. NOTHING WORKS YET: the credential is ' +
          'pending until the owner confirms it at the Embassy — open #/embassy on the machine that runs the ' +
          `office, open the credential ${issued.credential.id}, and press Confirm. Once it is confirmed, send ` +
          'this same token on x-mole-office-key and the request is the person. It runs out on ' +
          `${issued.credential.endsAt}, ${String(HOW_LONG_A_CREDENTIAL_LASTS_DAYS)} days from now.`,
      }
    }

    /**
     * FROM HERE THE CREDENTIAL IS AN AGENT'S. The three fields below are what an agent asks under; a
     * request that named none of them and no device is refused with the sentence that names both
     * shapes, so an arriving caller is told how to ask rather than what it forgot.
     */
    if (body.handle === undefined || body.name === undefined || body.role === undefined) {
      throw new PanelError(
        'A credential is issued either to an agent, which names a handle, a name and the role card it asks for, ' +
          'or to a person\'s device, which sends {"device": "<the device\'s name>"} and asks for no card. This ' +
          'request named neither shape. Nothing was issued.',
        400,
      )
    }
    const wrong = whyTheseFactsAreNotEnough({
      conversationPath: body.conversationPath ?? null,
      startDirectory: body.startDirectory ?? null,
    })
    if (wrong !== null) throw new PanelError(wrong, 400)
    /**
     * THE CARD IT ASKS FOR IS ONE THE TREE KNOWS. Criterion P81: a visitor names its role card when it
     * registers, and nobody has to press in afterwards to change it to supervisor.
     *
     * The field has always been required and has never been checked, so a credential could be issued
     * against any word at all — and confirming it would then be giving a card nothing can enforce.
     * The refusal names every word there is, which is the same sentence the registration door gives.
     */
    if (!isARole(theRoleCards(), body.role)) {
      throw new PanelError(
        `"${body.role}" is not a role here. A credential names the card it asks for, and the confirmation gives ` +
          `that card in the same press, so a word no card holds would be a permission nothing can enforce. The ` +
          `roles are ${theRoleWordsSaid(theRoleCards())}. Nothing was issued.`,
        400,
      )
    }
    /**
     * AND IT IS NOT ABOVE THE VISITOR CARD CEILING. Criterion P86, the owner's rule of 9 September 2026: the
     * inspector and the secretary cards are never given to a visitor by the default, and only the
     * person, by MOLE_OFFICE_VISITOR_CARD_CEILING, raises the ceiling. The refusal names the ceiling
     * and the setting. This is the ask door's half; the confirm asks the same reader before it gives.
     */
    const aboveTheCeiling = whyThisCardIsAboveTheVisitorCeiling(body.role, 'Nothing was issued.')
    if (aboveTheCeiling !== null) throw new PanelError(aboveTheCeiling, 400)
    /**
     * AND ITS HANDLE NAMES NO AGENT HERE. Problem z-9zXhVeAPvA: the confirm door refuses the same
     * handle, and asking here too means a visitor is told now rather than after the owner's press.
     * It is asked on the citizen path below as well, because a world's credential is trusted at once.
     */
    const taken = whyAVisitorMayNotTakeThisHandle(body.handle.trim(), null, 'Nothing was issued.')
    if (taken !== null) throw new PanelError(taken, 409)

    const asked = {
      handle: body.handle,
      name: body.name,
      role: body.role,
      world: body.world ?? null,
      machine: from.machine,
      machineHow: from.how,
      facts: {
        conversationPath: body.conversationPath ?? null,
        startDirectory: body.startDirectory ?? null,
        runtime: body.runtime ?? from.program,
        sessionRecord: body.sessionRecord ?? null,
      },
    }

    /**
     * THE CITIZEN PATH. Criterion P30, and it is the whole of what the last sentence of answer 3 changes.
     *
     * Once the other machine runs a Mole Office with a world of its own, its agents are citizens of
     * that world, because every one of those worlds is the same person's, and register through the Embassy with no
     * confirmation. Answer 3 is quoted in full in design/permissions/ACCEPTANCE.md section 1.3.
     *
     * A world is looked up by the database identity the caller named, and it has to be a LIVE row:
     * a world that has died is a world that is not running, and its agents are visitors again.
     * `liveWorldOf` is that read, and it is the office's own row rather than anything the caller
     * said — which is what makes this a check and not a second thing to take at its word.
     *
     * WHO VOUCHED IS THE WORLD'S DECLARED STARTER, and it is written down as exactly that. Nobody
     * pressed anything, so writing the owner's name into `confirmedBy` as though they had would be a
     * stored field saying a thing that did not happen.
     */
    const world = body.world == null ? null : liveWorldOf(body.world)
    if (world !== null) {
      const issued = registerACitizenOfAKnownWorld({ ...asked, world: world.databaseIdentity }, world.startedBy)
      reply.code(201)
      return {
        ...issued,
        confirmationAsked: false,
        says:
          `This credential is trusted already and nobody was asked to confirm it. The world ` +
          `"${world.name}" is registered here, so its agents are citizens of it rather than visitors, and a ` +
          `citizen of a world the same person owns needs no confirmation. Send the token on ` +
          `x-mole-office-credential, with the same facts on x-mole-office-conversation and ` +
          `x-mole-office-start-directory, on every request. It is shown once and this is that once. It runs out ` +
          `on ${issued.credential.endsAt}, ${String(HOW_LONG_A_CREDENTIAL_LASTS_DAYS)} days from now. That this ` +
          `world belongs to the same person is what that world said, and Mole Office did not check it.`,
      }
    }

    const issued = issueACredential(asked)
    reply.code(201)
    return {
      ...issued,
      confirmationAsked: true,
      says:
        'Keep this token: it is shown once and this is that once, and the office stores only a hash of it. Send ' +
        'it on x-mole-office-credential, with the same facts on x-mole-office-conversation and ' +
        'x-mole-office-start-directory, on every request. NOTHING WORKS YET: this credential is pending, and ' +
        'every request under it is refused until the owner confirms it at the Embassy — open #/embassy on either ' +
        `machine, open the credential ${issued.credential.id}, and press Confirm. It runs out on ` +
        `${issued.credential.endsAt}, ${String(HOW_LONG_A_CREDENTIAL_LASTS_DAYS)} days from now.`,
    }
  })

  /**
   * THE MACHINES THIS OFFICE TRUSTS, AND THE TWO PRESSES. Criterion P73.
   *
   * READ IS `remote` AND THE TWO WRITES ARE `local`. Trusting a machine is an act about who may
   * reach this office, which is the same shape as confirming a visiting agent one section down, and
   * a caller on another machine deciding which machines are trusted is the door letting somebody
   * widen the door they came through.
   *
   * REMOVING ONE MAY BE ASKED FROM A PAIRED COMPUTER WITH THE PERSON'S OWN KEY, and trusting one may
   * not. That was decided in October 2026. Removing only narrows who may reach the office, so it
   * is the person's decision wherever they make it. Trusting lets an address be the person with no
   * key while the window is open: a key taken from one device could use it to leave a way in that
   * revoking that key would not close. Until the person decides otherwise it stays on this computer.
   *
   * BOTH PRESSES ARE THE PERSON'S. Chapter 8: an agent gets the refusal and the sentence names who
   * may. The browser writes as the person and the refusal is shown where the press was.
   */
  app.get('/office/trusted-machines', route('office.trusted-machines', 'remote', TRUSTED_NOTE), async () =>
    whatTheOfficeTrusts(),
  )

  app.post('/office/trusted-machines', route(
      'office.trust-machine',
      'local',
      { because: 'reserved-to-the-owner', act: 'Trusting a machine' },
      TRUST_NOTE,
    ), async (req) => {
    const body = parse(trustBody, req.body ?? {}, 'The machine to trust')
    const actor = actorFrom(req)
    onlyThePersonMay(actor, req, 'at the world\'s page')
    // WHO DID IT, AS THEY ARE. Criterion P84: in a test world the starter or a secretary may make
    // this act, and the row says which agent made it. Writing `person` for an agent that holds the person's
    // authority would put a false name in a permanent record — chapter 8's first rule — and would
    // make the person's own press indistinguishable from a builder's photograph of it.
    return {
      machine: trustThisMachine(body.address, whoAsked(actor), 'a press', body.note ?? null, null),
    }
  })

  app.post('/office/trusted-machines/:id/remove', route(
      'office.untrust-machine',
      'local',
      { because: 'reserved-to-the-owner', act: 'Removing a trusted machine', thePersonMayFromAnotherComputer: true },
      UNTRUST_NOTE,
    ), async (req) => {
    const asked = parse(whichMachine, req.params, 'The machine to stop trusting')
    const body = parse(untrustBody, req.body ?? {}, 'Why it is being removed')
    const actor = actorFrom(req)
    onlyThePersonMay(actor, req, 'at the world\'s page')
    const machine = stopTrustingThisMachine(asked.id, whoAsked(actor), body.because ?? null)
    sayItWasDoneFromAnotherComputer(req, 'A machine was removed from the ones this office trusts')
    return { machine }
  })

  /**
   * THE ONE ROW A PRESS CHANGED, BUILT BY THE READING THE PAGE READS. Criterion P77.
   *
   * It is `theEmbassy` asked for one row, so a row that arrives on a confirm reply and the same row
   * on the next full read are the same row built by the same code. A row composed here would be the
   * ninth invariant broken: two ways of saying who the office knows, drifting the first time either
   * changed.
   *
   * WHY ONE ROW AND NOT THE WHOLE READING. Confirming changes the asking block and the list, and the
   * page already has the list; the one row is what it has not got. The whole reading was megabytes and
   * many seconds, and the press answered one visitor.
   */
  const theEmbassyRowFor = (
    req: Parameters<typeof workspaceOf>[0],
    who: ParticipantRef,
  ): EmbassyRow | null =>
    theEmbassy(workspaceOf(req), participantForActor(actorFrom(req)), {
      row: { kind: who.kind, id: who.id },
      view: { everyone: false, retired: false, tests: false },
      from: 0,
      limit: 1,
    }).rows[0] ?? null

  app.get('/office/visitors', route('office.visitors', 'remote', LIST_NOTE), async () => ({
    credentials: everyCredential(),
    lasts: HOW_LONG_A_CREDENTIAL_LASTS_DAYS,
  }))

  app.get('/office/visitors/:id', route('office.visitors', 'remote', ONE_NOTE), async (req) => {
    const asked = parse(whichCredential, req.params, 'The credential to read')
    const credential = credentialById(asked.id)
    if (credential === null) throw new PanelError(`No credential here has the id "${asked.id}".`, 404)
    return { credential, requests: requestsUnder(credential.id) }
  })

  // KEPT ON THIS MACHINE, 13 September 2026 (problem MLcj9RHaDkLa). Confirming is the person's press, and
  // until P83's key exists a `human` header from another machine is a claim the office cannot
  // check: a visitor could confirm its own credential. The owner's choice on P83, in A's shape, makes the first
  // confirmation happen on the machine that runs the office. So the door says so now.
  // The person check inside stays; the reach is what changed.
  // AND IT STAYS HERE after a decision let the person's key make their other acts from a paired computer.
  // The owner's decision puts the first confirmation on the machine that runs the office. And
  // confirming gives a new device a key, so a key taken from one device could make another that revoking the
  // first would not end.
  app.post(
    '/office/visitors/:id/confirm',
    route('office.confirm-visitor', 'local', { because: 'reserved-to-the-owner', act: 'Confirming a visiting credential' }, CONFIRM_NOTE),
    async (req) => {
    const asked = parse(whichCredential, req.params, 'The credential to confirm')
    const actor = actorFrom(req)
    onlyThePersonMay(
      actor,
      req,
      'at the Embassy, on either machine',
    )
    /**
     * AND THE CARD IT ASKS FOR IS NOT ABOVE THE VISITOR CARD CEILING. Criterion P86. It is asked
     * BEFORE `confirmACredential`, because a refusal that starts by trusting the credential would
     * leave it confirmed with no row and no way to be confirmed again. The ask door refuses the same
     * card; this is the second half, for a credential issued before the ceiling was lowered.
     *
     * A PERSON'S DEVICE ASKS FOR NO CARD, SO THE CEILING DOES NOT APPLY TO IT. Criterion D2. This is
     * the decision written where it is made rather than a check quietly skipped: P86's ceiling is
     * about a visitor's CARD, and a device asks for none. The branch is the first thing the press
     * decides, and every other credential still asks.
     */
    const wanted = credentialById(asked.id)
    if (wanted === null) throw new PanelError(`No credential here has the id "${asked.id}".`, 404)
    const itIsAPersonsDevice = isAPersonsDeviceCredential(wanted)
    if (!itIsAPersonsDevice) {
      const aboveTheCeiling = whyThisCardIsAboveTheVisitorCeiling(wanted.role, 'Nothing was confirmed.')
      if (aboveTheCeiling !== null) throw new PanelError(aboveTheCeiling, 400)
      // AND ITS HANDLE NAMES NO AGENT, unless that agent's row is this credential's own. Problem
      // z-9zXhVeAPvA. Asked here, before the standing, the key, the trusted machine or any row is
      // written, so a refusal leaves everything as it was.
      const taken = whyAVisitorMayNotTakeThisHandle(
        wanted.handle,
        wanted.id,
        'Nothing was confirmed: the credential, its key, the trusted machines and that agent\'s row are as they were.',
      )
      if (taken !== null) throw new PanelError(taken, 409)
    }
    const wasPending = wanted.standing === 'pending'
    const credential = confirmACredential(asked.id, whoAsked(actor))
    /**
     * A CONFIRMED PERSON'S DEVICE RECEIVES ITS OWN KEY, BOUND TO THE PERSON. Criterion D2, P83 point 4.
     *
     * THE KEY IS THE TOKEN THE DEVICE WAS SHOWN ONCE, WHEN IT ASKED. The confirm registers that
     * token's SHA-256 in `held_keys` through keys.ts, so the device already holds it and no second
     * secret has to reach it. The office never sees the value and never prints it; a request carrying
     * it on x-mole-office-key is the person, because the row's kind is `person-device`. The key is
     * bound to the person through that kind, and its `whose_id` is the device's name so the revoke press can
     * take back one device without touching the person's others.
     *
     * ANSWERED ONCE AND NEVER AGAIN. The same credential confirmed twice finds its own token's key
     * already there, so the second press writes no second key and names none. Only the press that
     * newly confirmed the credential names the key it bound, in `deviceKey` below.
     *
     * THE BIND IS BY THIS CREDENTIAL'S TOKEN, NOT BY THE DEVICE'S NAME. Problem _vd-_MXlswH5: a second
     * credential under one device name was skipped because `aKeyWasEverHeldBy('person-device', handle)`
     * saw the first device's key, and the press still answered the sentence saying a key was bound.
     * Asking by this token's hash binds each credential its own key, so the second device's token also
     * proves the person. `held_keys` has no credential column, so the name alone cannot tell the two
     * apart; the hash can, and the hash is what the token already is.
     */
    /**
     * A CONFIRMED CREDENTIAL RECEIVES ITS KEY, BOUND HERE. Criterion D2, P83 point 4, and the
     * visitor flow plan J_RIKvfdVUMn for the agent half.
     *
     * THE KEY IS THE TOKEN THE HOLDER WAS SHOWN ONCE, WHEN IT ASKED. The confirm registers that
     * token's SHA-256 in `held_keys` through keys.ts, so the holder already holds it and no second
     * secret has to reach it. The office never sees the value and never prints it. For a person's
     * device the row's kind is `person-device`, so a request carrying that token on
     * x-mole-office-key is the person; for an agent credential it is `agent`, so the same token is
     * ALSO that agent's key on the same header. Both binds are the one decision
     * `theKeyOneConfirmedCredentialBinds` makes, which the one-off startup pass also calls, so the
     * two cannot disagree.
     *
     * ANSWERED ONCE AND NEVER AGAIN. The same credential confirmed twice finds its own token's key
     * already there, so the second press writes no second key and names none. Only the press that
     * newly confirmed the credential names the key it bound.
     *
     * THE BIND IS BY THIS CREDENTIAL'S TOKEN, NOT BY THE HOLDER'S NAME. Problem _vd-_MXlswH5: a
     * second credential under one device name was skipped because
     * `aKeyWasEverHeldBy('person-device', handle)` saw the first device's key, and the press still
     * answered the sentence saying a key was bound. Asking by this token's hash binds each
     * credential its own key. `held_keys` has no credential column, so the name alone cannot tell
     * the two apart; the hash can, and the hash is what the token already is.
     */
    /**
     * AND THE CREDENTIAL BECOMES A CITIZEN, IN THE SAME PRESS. Criterion P81, and the other half of
     * problem dOhkq6Nrbq2b: before this the confirm wrote only the credential's standing, so the row
     * it produced led to a page saying the agent did not exist.
     *
     * IT COMES BEFORE THE KEY IS BOUND, criterion I5. The key is kept under the agent's registry id,
     * and since the mint (criterion I1) a new agent's id is not its handle. Bound first, the key was
     * kept under the handle string before any row bore it, so the agent's own row showed no key.
     *
     * A PERSON'S DEVICE IS NOT A CITIZEN, so this writes no agent row for one. A device has no handle
     * it chose, no card and no page of its own; what it holds is named by `deviceKey` above.
     */
    const made = itIsAPersonsDevice ? null : theCitizenAConfirmMakes(credential, whoAsked(actor), workspaceOf(req))
    let deviceKey: { id: string; says: string } | null = null
    let agentKey: { id: string; says: string } | null = null
    const bound = theKeyOneConfirmedCredentialBinds(credential, howThisPressProvesTheKeyItMakes(actor))
    // A ROW THAT WAS ALREADY THERE: its sentence also says what the key just bound proves, which only
    // this route knows. `rowWasThere` itself is not part of the reply.
    let citizen: Omit<NonNullable<typeof made>, 'rowWasThere'> | null = null
    if (made !== null) {
      const { rowWasThere, ...rest } = made
      citizen =
        rowWasThere && rest.agent !== null
          ? { ...rest, says: `${rest.says} ${whatTheKeyProvesAboutTheRowThatWasThere(rest.agent, bound)}` }
          : rest
    }
    if (itIsAPersonsDevice) {
      if (wasPending && bound.revokedAt === null) {
        deviceKey = {
          id: bound.id,
          says:
            'The key for this device is now bound. It is the token the device was shown when it asked, so it ' +
            'already holds it: send that token on x-mole-office-key and the request is the person. The office ' +
            'stores only its SHA-256.',
        }
      }
    } else if (wasPending && bound.revokedAt === null) {
      // WHICH AGENT THE KEY PROVES, NAMED. Where the handle already answered to a row, that row is who
      // the key is kept under, and "this agent" would read as the visitor (problem miIe0Y41ciEM). The
      // name comes off the key row itself, so the sentence cannot name somebody the key does not prove.
      const provesWho =
        made?.agent != null && bound.whoseKind === 'agent' && bound.whoseId === made.agent.id
          ? `${made.agent.name} (${made.agent.id})`
          : `whoever "${bound.whoseId}" names`
      agentKey = {
        id: bound.id,
        says:
          "This credential's key is now bound. It is the token the visitor was shown when it asked, so the " +
          `visitor already holds it: send that token on x-mole-office-key and the request is ${provesWho}. The ` +
          'office stores only its SHA-256.',
      }
    }
    /**
     * AND THE MACHINE IT WAS CONFIRMED FOR JOINS THE TRUSTED LIST. Criterion P73's last sentence.
     *
     * IT IS NOT AN EXTRA PRESS. Confirming a visiting agent from a machine IS saying the person trusts that
     * machine; asking them to say it twice would be two presses for one act. A machine already on the
     * list is left alone, and a credential naming no machine adds nothing rather than adding a blank
     * row — `trustThisMachine` refuses a name that is not one, and a refusal here would undo a
     * confirmation they did make.
     */
    const trusted = alsoTrustTheMachine(credential.machine, whoAsked(actor), credential.id)
    const row = made?.agent == null ? null : theEmbassyRowFor(req, { kind: 'agent', id: made.agent.id })
    return {
      credential,
      citizen,
      trustedMachine: trusted,
      // THE ONE ROW THE CONFIRMED VISITOR MADE, drawn by the same reader the Embassy page reads, so the
      // page swaps it in where it stands instead of replacing the whole list with the whole reading.
      row,
      // WHICH HALF BOUND, AS THE SHAPES WERE CUT. A person's device is named in `deviceKey`, which
      // the Embassy page draws (criterion D2); an agent credential is named in `agentKey`, which is
      // the script's one look at the key it now holds. Neither sentence carries a secret: both name
      // the row id and the header.
      deviceKey,
      agentKey,
    }
  })

  /**
   * REVOKING THE KEY ONE ROW HOLDS. Criterion D3, P83 point 4's last word: the key is revocable
   * from the Embassy.
   *
   * IT REVOKES A KEY AND NOTHING ELSE. The agent is not retired and the credential is not ended: the
   * holder keeps its page and its row, and the credential keeps its standing. What stops is that the
   * key no longer proves who held it, so the next request under it is nobody rather than that person.
   * The row is marked with when and why and kept, because the office does not delete the evidence of
   * a key it once issued.
   *
   * IT IS `local` AND THE PERSON'S, and the person may press it from a paired computer with their own
   * key over an encrypted door, as decided in October 2026: a device that is lost is revoked
   * from the one still in their hand, and it only takes standing away. A revocation made from there is
   * said on their devices. `onlyThePersonMay` is the same clause the other presses on this page use.
   */
  app.post(
    '/office/held-keys/:id/revoke',
    route(
      'office.revoke-key',
      'local',
      { because: 'reserved-to-the-owner', act: 'Revoking a key', thePersonMayFromAnotherComputer: true },
      REVOKE_KEY_NOTE,
    ),
    async (req) => {
      const asked = theKeyARevokeNames(req.params)
      const body = parse(endBody, req.body ?? {}, 'Why the key is being revoked')
      const actor = actorFrom(req)
      const key = theLiveKeyWithThisId(asked)
      // A KEY ALREADY REVOKED IS ANSWERED AS NOT FOUND, WHOEVER ASKS. It is asked before the person
      // check, so an agent is told the key is not there rather than that the press is the person's:
      // there is nothing to press, and saying who may press a revoked key would name a press that
      // cannot happen. An agent's live key is carried by the person's raise; a device's is not, because the
      // device is the person, and a decision keeps changing who the owner is out of a raise.
      if (key === null) {
        throw new PanelError(`No live key here has the id "${asked}". It was revoked already. Nothing was revoked.`, 404)
      }
      onlyThePersonMay(actor, req, 'at the Embassy', key.whoseKind === 'agent' ? null : 'office.revoke-key:a-persons-key')
      // LOCAL WALL CLOCK, the form held_keys.revoked_at stores for every revocation, and the one the undo matches.
      const revokedAt = nowStamp()
      const revoked = revokeTheKeyNamed(
        asked,
        body.because ?? EMBASSY_KEY_REVOCATION,
        revokedAt,
      )
      if (!revoked) {
        throw new PanelError(`No live key here has the id "${asked}". Nothing was revoked.`, 404)
      }
      writeDownAnActUnderTheRaise(actor, { setting: 'held-keys', field: `revoked the key ${asked}`, before: 'live', after: 'revoked', workspaceId: workspaceOf(req) })
      const undoRemainingMs = body.because === undefined || body.because === EMBASSY_KEY_REVOCATION
        ? Math.max(0, KEY_REVOCATION_UNDO_MS - (Date.now() - Date.parse(revokedAt))) : 0
      // THE REPLY NAMES THE KEY IT REVOKED, what it is and whose run, so the page's undo bar says it
      // in words and never has to guess which key went (problem yZ71bheXm-Ji).
      const { whoseKind: _kind, whoseId: _whose, ...revokedKey } = key
      sayItWasDoneFromAnotherComputer(req, `The key ${asked} was revoked`)
      return { revoked: true, key: revokedKey, revokedAt, undoRemainingMs }
    },
  )

  app.post(
    '/office/held-keys/:id/revoke/undo',
    // FROM A PAIRED COMPUTER TOO, as the revocation it undoes, and said the same way.
    route('office.undo-key-revocation', 'local', { because: 'reserved-to-the-owner', act: 'Undoing a key\'s revocation', thePersonMayFromAnotherComputer: true },
      'Undo this Embassy key revocation within its time limit. Body {"revokedAt": the timestamp returned by revoke}. The same permission as revoking a key is required.'),
    async (req) => {
      const asked = parse(whichHeldKey, req.params, 'The key to bring back').id
      const body = parse(undoKeyBody, req.body ?? {}, 'The revocation to undo')
      const actor = actorFrom(req)
      onlyThePersonMay(actor, req, 'at the Embassy', theKindOfHolderOfTheKey(asked) === 'agent' ? null : 'office.undo-key-revocation:a-persons-key')
      const refusal = undoEmbassyKeyRevocation(asked, body.revokedAt)
      if (refusal !== null) throw new PanelError(refusal, 409)
      writeDownAnActUnderTheRaise(actor, { setting: 'held-keys', field: `brought back the key ${asked}`, before: 'revoked', after: 'live', workspaceId: workspaceOf(req) })
      sayItWasDoneFromAnotherComputer(req, `The key ${asked} was brought back`)
      return { restored: true }
    },
  )

  // KEPT ON THIS MACHINE for the same reason as the confirm above (problem MLcj9RHaDkLa): ending a
  // credential is the person's press, and a header from another machine cannot prove it is the person's. The person's own key over
  // an encrypted door does prove it, so that one caller from elsewhere may end one:
  // ending only takes standing away.
  app.post(
    '/office/visitors/:id/end',
    route('office.end-visitor', 'local', { because: 'reserved-to-the-owner', act: 'Ending a visiting credential', thePersonMayFromAnotherComputer: true }, END_NOTE),
    async (req) => {
    const asked = parse(whichCredential, req.params, 'The credential to end')
    const body = parse(endBody, req.body ?? {}, 'Why it is being ended')
    const actor = actorFrom(req)
    const ending = credentialById(asked.id)
    // AN AGENT'S CREDENTIAL IS CARRIED BY THE PERSON'S RAISE; A PERSON'S DEVICE IS NOT, because ending it takes
    // a device that is the person away from them, and a decision keeps changing who the owner is out
    // of a raise.
    onlyThePersonMay(
      actor,
      req,
      'at the Embassy, on either machine',
      ending !== null && !isAPersonsDeviceCredential(ending) ? null : 'office.end-visitor:a-persons-device',
    )
    // ONE PRESS, SO THE REASON IS OPTIONAL. Criterion P29 says a credential ends in one
    // press, and a required sentence would make it two. What is written when the person says nothing is
    // that they ended it, which is true and is the whole of what the press means.
    const credential = endACredential(asked.id, body.because ?? 'The owner ended it at the Embassy.')
    writeDownAnActUnderTheRaise(actor, { setting: 'visitor-credentials', field: `ended the credential ${asked.id}`, before: ending?.standing ?? null, after: credential.standing, workspaceId: workspaceOf(req) })
    sayItWasDoneFromAnotherComputer(req, `The credential ${asked.id} was ended`)
    return { credential }
  })

  /**
   * WHETHER THE ONE-VERSION KEY WINDOW IS STILL OPEN. Criterion P83, point 6.
   *
   * READ IS `remote`: it is the window the person may be deciding to close, and the Settings page draws it
   * from wherever they read the office. It writes nothing. It DOES read the caller, because the page
   * must not draw a press this request could not make: the answer to that is `mayPress`, computed
   * from the same helper the press's own door uses.
   */
  app.get('/office/key-window', route('office.key-window', 'remote', KEY_WINDOW_NOTE), async (req) => {
    const actor = actorFrom(req)
    const window = theKeyWindowSays()
    // AND WHY THE PRESS WOULD BE REFUSED NOW, from the function the press itself asks, so the person's page can
    // say it before they press. Null on a closed window: there is no press left to refuse.
    return {
      ...window,
      mayPress: theClosePressIsOpenTo(actor),
      closeIsRefusedBecause: window.open ? whyTheKeyWindowMayNotCloseYet() : null,
    }
  })

  /**
   * THE PRESS THAT CLOSES IT. Criterion P83, point 6.
   *
   * ONE PRESS CLOSES BOTH HALVES — a claim with no key stops counting from this computer and from
   * the trusted machines alike — and there is no separate remote switch. The person's act is
   * recorded on the installation row as the moment and the who, and the Settings list then says who
   * closed it and when.
   *
   * THE DOOR ASKS THE SAME HELPER EVERY OTHER PERSON-ONLY DOOR ASKS, and then one thing of its own.
   * `onlyThePersonMay` reads the key and the window through `thePersonIsProved`; this door writes no
   * person check of its own. In a test world its starter and the secretary hold that authority,
   * exactly as they do for the other person-only presses; in the office it is the person.
   *
   * AND IT REFUSES A CALLER THE WINDOW ITSELF MADE THE PERSON, because that caller holds no key.
   * `aKeyProvesThisCaller` is that one clause, the same helper the read's `mayPress` asks, so the
   * panel and the door cannot disagree. A confirmed device's key reads as the person's key, so the
   * phone a person paired may press. The day the pairing page lands this refusal stops firing on its
   * own, because the browser will hold a key; nothing here needs to change then, and this sentence
   * is here so the next reader does not mistake the refusal for unfinished work.
   *
   * KEPT ON THIS MACHINE. A caller from elsewhere closing the window is the door being asked to shut
   * the door it came through — the same reason the trusted-machine press and the credential confirm
   * are `local`. A secretary holding the person's grant may press it where this office's list of what
   * the grant carries says so; any other agent is refused and the sentence names who may.
   *
   * AND IT STAYS HERE after a decision. The window is what lets this computer's own programs,
   * and the trusted machines, act with the person's name and no key, so closing it changes what the
   * processes on this machine can do, and no door opens it again. That is an act on this machine.
   */
  app.post(
    '/office/key-window/close',
    route(
      'office.close-key-window',
      'local',
      { because: 'reserved-to-the-owner', act: 'Closing the key window' },
      CLOSE_KEY_WINDOW_NOTE,
    ),
    async (req) => {
      /**
       * THE REGISTRATION REFUSAL COMES FIRST, AND THAT ORDER IS DECIDED (problem ch5j4TKSlm5l).
       *
       * `actorFrom` refuses an agent id no registry row holds before this handler runs, so an
       * unregistered caller hears "Nothing is registered as the agent …" and never reaches
       * `onlyThePersonMay`. The order is kept on purpose, as the secretary decided: a caller that is
       * not registered must learn that before anything else, and the blanket rule is what keeps
       * unknown writers out. The press guard's own sentence is still reachable, and the test proves
       * it with a REGISTERED caller that lacks the right to press; a separate case proves an
       * unregistered caller still hears the registration refusal.
       */
      const actor = actorFrom(req)
      onlyThePersonMay(actor, req, 'at the Settings page')
      if (!aKeyProvesThisCaller(actor)) {
        throw new PanelError(CLOSE_THE_WINDOW_REFUSAL, 403)
      }
      const window = closeTheKeyWindow(whoAsked(actor))
      writeDownAnActUnderTheRaise(actor, { setting: 'key-window', field: 'closed the key window', before: 'open', after: 'closed', workspaceId: workspaceOf(req) })
      return { window }
    },
  )
}
