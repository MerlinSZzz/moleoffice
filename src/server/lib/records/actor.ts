// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO IS WRITING: the `Actor` every write carries, the machine it arrived from (`Arrival`), the person's press
 * it may carry (`PressForThePerson`), and `HUMAN`. They were moved out of src/server/lib/records.ts with no change
 * of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`. This file does not import records.ts.
 */
import { THE_PERSON } from '@shared/person.ts'
import type { Elevation } from '@shared/roles.ts'
import type { ActorType, ProvedHolder } from '@shared/types.ts'
import type { Warrant } from '@shared/warrant.ts'
import type { TheSender } from '../from-a-sandbox.ts'
import type { HowACallerProvedItself } from '../keys.ts'
import type { TheOwnersAuthorityHere } from '../worldauthority.ts'

/**
 * WHICH MACHINE ASKED. Two words, because they are the words a person would say out loud.
 *
 * Declared here rather than in lib/http.ts, where it is read from the request, because `Actor`
 * below carries it and http.ts already imports records.ts, which hands this file on. Declaring it there
 * and importing it here would be the only circular import in the server, bought for one string union. `lib/http.ts`
 * re-exports the name so a caller reading about arrival finds it beside `arrivalOf`.
 */
export type Arrival = 'this machine' | 'another machine'

export interface Actor {
  type: ActorType
  id: string
  /**
   * THE PERSON'S SIGNATURE ON THIS ONE PACKAGE ITEM, for this one run of its act.
   *
   * SET IN ONE PLACE: the carry-out door in lib/signing-packages.ts, on a copy of the named
   * agent's actor, around the one act. Nothing a caller sends can set it. Absent is the ordinary
   * answer. Both ledgers write the item, so the signature is named without naming the person
   * as the one who pressed, and it opens no other request or door.
   */
  signedItem?: { package: string; item: string }
  /**
   * The session responsible, as the CALLER named it: a session record's id, or a run name.
   *
   * Named `sessionId` for history, but it is a REFERENCE and not necessarily an id — see
   * "WHAT x-mole-office-SESSION MEANS" in records.ts for why that is deliberate and what is done with it.
   */
  sessionId?: string | null
  /**
   * Was this identity STATED, or defaulted because the request said nothing?
   *
   * `false` only ever comes from `actorFrom` answering a request that supplied no actor header at
   * all. Absent means "not applicable" — an in-process caller, a script, a test — and is treated as
   * stated, because nothing about those went through a header at all.
   *
   * WHY IT EXISTS. Settled by the owner, `design/DECISIONS-PENDING.md` §36: *human-only governance
   * actions require explicit human attribution; missing actor headers are not proof of human
   * authority.* Every request that CLAIMS to be an agent was already refused. Silence was not —
   * and silence is the mistake a client makes most easily, so a script with a bug in its header
   * code could settle a fork and the permanent log would say the owner did it.
   *
   * Ordinary writes are unaffected and the documented default stands: a header-less `POST
   * /api/records` is still the person typing by hand. This flag is read by `assertMayWrite` alone.
   */
  stated?: boolean
  /**
   * HOW THIS CALLER PROVED ITSELF. Criterion P83, point 1.
   *
   * THE PERSON'S KEY, THE OFFICE'S OWN KEY, OR AN AGENT'S KEY — or absent because the caller held
   * no key at all. It is worked out in `actorFrom` from the one place a key is read or compared,
   * src/server/lib/keys.ts, so every guard reads one answer rather than each asking its own
   * question of the request.
   *
   * ABSENT IS THE ORDINARY ANSWER and it means the caller proved nothing. Whether nothing is
   * enough is the window's question, and `theKeyWindowCovers` below carries that half. It is never
   * filled in by a caller: a request body or header cannot set it.
   */
  provedBy?: HowACallerProvedItself
  /**
   * WHO A KEY PROVED, WHERE THAT DIFFERS FROM `id`. Criterion P83, point 5.
   *
   * FILLED IN ONE PLACE, `actorFrom`, where the key's holder and the name the headers gave are both
   * in hand, and absent everywhere else. Absent is the ordinary answer and it means the rule does
   * not apply: the request carried no key, or the key's holder is the very name the headers gave.
   * That is the shape `stated`, `from` and `theOwnersAuthority` already have on this interface, and
   * it is why there is no `{ mismatch: false }` on every actor in the product.
   *
   * IT IS THE WHOLE OBJECT `ProvedHolder`, and both ledgers write it as stored: the holder's id, the
   * word for how it proved, and the name the headers gave instead. The word is what lets the page
   * tell the office's own key from an agent's, and the name is the only copy that survives on a
   * person's-key row, where `id` itself was replaced by the proof.
   */
  provedHolder?: ProvedHolder
  /**
   * THE HOLDER AN AGENT'S KEY PROVED, as `held_keys` stores it: the agent's id (criterion I5).
   *
   * FILLED IN ONE PLACE, `actorFrom` in lib/http.ts, on every request an agent's key proved, and
   * absent everywhere else. `participantForActor` hands it to the resolver's step 1, so an agent that
   * sends its handle and its key is resolved to itself even where that handle is also a retired
   * legacy agent's id (criterion I3). It is not `provedHolder`, which is on the actor only when the
   * key proved an agent other than the one the headers named.
   */
  keyHolder?: string
  /**
   * THE `held_keys` ROW OF THE AGENT'S KEY THIS REQUEST CARRIED, where that key proved its holder itself. Absent for a
   * run key acting for another run, for a sealed or finished run's own key on the acts after its end, and for every
   * other proof. Filled in one place, `actorFrom` in lib/http.ts. Whether the key is the holder's own or a run's is
   * asked of the row only where a rule needs it (`whyThisWriteIsNotAHostFiling`), because that reading is not cheap.
   */
  agentKeyRow?: string
  /** Actual live session bound to this request's own agent key. Only actorFrom sets it; a session header proves none. */
  ownKeyRun?: string
  /**
   * THE RUN A RUN KEY ON THIS REQUEST IS BOUND TO, read from the key's binding rather than from its session header.
   * Only `actorFrom` sets it, and only for a live run key that is still its run's newest. A write that names another
   * run of the same agent is taken, and its answer carries the reminder `theRunKeyReminderSentence` builds; the run it
   * wrote carries one line, once for the pair.
   */
  runKeyFor?: string
  /**
   * THE RUN WHOSE OWN KEY, REVOKED WHEN IT ENDED, PROVED THIS REQUEST, and only because the request is a PATCH of that
   * run's own record. After a run has sealed or ended, its own key may still
   * write that run's `served` conditions, and nothing else. Filled in one place, `actorFrom` in lib/http.ts, from
   * `aSealedRunsOwnKey` in lib/keys.ts; `patchRecord` holds the rest of the rule (`aSealedRunWritesOnlyItsServed`).
   */
  sealedRunsOwnKey?: string
  /**
   * THE RUN WHOSE OWN KEY, REVOKED WHEN IT FINISHED LESS THAN FIFTEEN MINUTES AGO, PROVED THIS REQUEST, and only because
   * the request is a read of that run's record, a PATCH of it, or a POST of a record. During that fifteen-minute
   * window, the key may store the run's usage receipt, post the
   * sandbox helper's message about the run's end, and read the run's record, and nothing else. Filled in one place,
   * `actorFrom` in lib/http.ts, from `aFinishedRunsOwnKey` in lib/keys.ts; `patchRecord` and `createRecord` hold the rest
   * of the rule (`aFinishedRunStoresOnlyItsReceipt`, `aFinishedRunPostsOnlyItsEndMessage`).
   */
  finishedRunsOwnKey?: string
  /**
   * WHETHER THE ONE-VERSION HEADER WINDOW COVERS THIS REQUEST.
   *
   * Under P83 point 6, for one version a header claim with no key still counts when
   * the request came from loopback or from a machine on the trusted list. The person's phone, laptop
   * and browser use the trusted list because they cannot hold a key yet.
   *
   * SET BY `actorFrom` FROM THE LISTENER'S STAMP AND THE TRUSTED LIST, and absent everywhere else.
   * Absent means the window does not cover it — either the request carried a listener's stamp from
   * a machine this office does not trust, or it was in-process and the question is answered by
   * `from` being absent instead. A caller cannot set it.
   */
  theKeyWindowCovers?: boolean
  /**
   * Which machine this request came in on, as the listener that accepted it recorded.
   *
   * NEVER FROM A HEADER. `actorFrom` fills this from `arrivalOf`, which reads a symbol that one of
   * Mole Office's own listeners wrote on the raw request before Fastify started routing it. A caller
   * cannot set it: headers arrive as strings in `req.headers`, and this is a symbol-keyed property
   * on a different object.
   *
   * ABSENT MEANS THE QUESTION DOES NOT APPLY, exactly as `stated` above means for the identity: an
   * in-process caller — a migration, a script, `app.inject()` in a test — is not on a socket at all,
   * so no listener saw it and there is no machine to name. A guard reading this must treat absent as
   * *the rule does not apply* and never as `this machine`, because those are different facts.
   *
   * WHO READS IT, AND WHICH WAVE OWNS THE CLAUSE. Three guards read it — `assertMayWrite`,
   * `assertMaySettleFork` and `assertMayRemoveAFork` — and **they are wave 1's**, added in commit
   * `e350484`. This comment used to say `NOTHING READS IT YET` and that the clause would arrive
   * `with the delete guard, not here`, meaning wave 2. That was true when the field was written and
   * it stopped being true in the same session; the build plan's collision 11 table settles it the
   * other way, and a comment naming a different wave from the plan is one fact in two places with
   * nothing making them agree. **The two guards wave 2 adds — `assertMayRemoveAnAsk` and the
   * `commitIntent` guard — carry their own arrival clause in the same commit as the guard**, which is
   * what collision 11 decided and why none of it is a later pass.
   *
   * AND IT IS ONLY HALF OF THE RULE. `remote-access.md` §6.1 states authority as an AND: the machine
   * may perform the act, AND the actor may. This field is the machine half. The actor half is
   * `isSomebodyMoleOfficeCannotPlace` in records/served-doors.ts, and the two are asked separately on purpose
   * — until wave 15 step 6 brings the second listener up, nothing stamps `another machine`, so this
   * field refuses nothing that can be asked of the product and must never be read as evidence that
   * the actor half works.
   */
  from?: Arrival
  /**
   * WHETHER THIS CALLER HOLDS THE OWNER'S AUTHORITY IN A TEST WORLD. Criterion P84, rule 5 of
   * chapter 8.
   *
   * ---------------------------------------------------------------------------------------
   * WHAT IT IS AND WHAT IT IS NOT
   * ---------------------------------------------------------------------------------------
   *
   * Inside a world started for a
   * handback or a check, the agent that started it holds the person's authority, and the secretary holds it
   * in every test world.
   *
   * IT IS NOT AN IDENTITY, AND IT CHANGES NEITHER `type` NOR `id`. Every change row and every
   * revision still says which agent asked, by its own handle. A world that let an agent write as
   * `human` would put a false name in a permanent change log, which is chapter 8's first rule, and
   * would make the person's own presses indistinguishable from the builder's photographs of them.
   *
   * ABSENT IS THE ORDINARY ANSWER and means it does not hold — the same shape `stated` and `from`
   * above have. It is absent on every request in the office, which is never a test world, and on
   * every request in a world by somebody who holds nothing there. Only a caller that DOES hold it
   * carries this, so a guard reads `actor.theOwnersAuthority?.holds === true` and nothing else.
   */
  theOwnersAuthority?: TheOwnersAuthorityHere
  /**
   * WHO SENT A CLAIM TO BE THE PERSON THAT DID NOT COUNT, when that is why it did not. Nothing that comes from a sandbox
   * is the person, so a keyless claim to be the person from this machine counts
   * only when this computer's own program sent it (lib/from-a-sandbox.ts). Absent is the ordinary answer: the claim was
   * not asked about, or it came from the person's own program. The refusal that a person-only act writes reads it.
   */
  sentFrom?: TheSender
  /**
   * THE PERSON'S OWN WORDS THIS REQUEST CARRIES, when it carries any.
   *
   * ---------------------------------------------------------------------------------------
   * WHY IT SITS ON THE ACTOR AND NOT IN EVERY GUARD'S PARAMETER LIST
   * ---------------------------------------------------------------------------------------
   *
   * A warrant is not an identity, and this field does not claim it is: `type` and `id` still say who
   * is asking, and nothing here changes either. What a warrant says is WHAT THIS REQUEST STANDS ON,
   * which is a fact about the request — exactly like `stated` and `from`, which are already here for
   * the same reason. Four guards read it, and the write path between a route and a guard is six
   * functions deep in places (`promoteProposal` → `createRecordWithReport` → `createLink` →
   * `assertMaySettleFork`). A parameter would have to be threaded through every one of them, and a
   * function that forgot to pass it would refuse a warranted act with no way to tell why.
   *
   * IT IS ALSO WHAT PUTS THE WORDS IN THE LEDGER. `logChange` and `saveRevision` both take an
   * `Actor` and nothing else about the request, so a warrant on the actor is written into both
   * ledgers with no caller having to remember to hand it over. That is the whole of W2's first half.
   *
   * ABSENT IS THE ORDINARY CASE and it means the request carried no warrant. It is never filled in:
   * nothing infers a warrant, nothing defaults one, and no code path writes one that a caller did
   * not send. `readWarrant` in @shared/warrant.ts is the only thing that makes one.
   */
  warrant?: Warrant
  /**
   * DID A GUARD ACTUALLY USE THE WARRANT ON THIS REQUEST? Set by `theWordsAllowThis` and by nothing
   * else.
   *
   * The two ledgers store the warrant only when this is true. A warrant sent with a write that
   * needed none opened no door, and writing it into the ledger would put *on the owner's words*
   * beside an ordinary edit — a claim about the person that the person never made.
   */
  warrantUsed?: boolean
  /**
   * THE PERSON'S SAY THAT THIS AGENT MAY ACT FOR THEM, when it holds. Criterion P59.
   *
   * IT IS NOT SENT AND IT IS NOT CLAIMED. A warrant arrives on the request, because it is the
   * person's words and the agent is the one carrying them. An elevation is a fact the product holds:
   * the person pressed it, it is on the secretary's registry row, and no request could assert one.
   * So this is filled in by `actsForThePerson` in records/own-words.ts, from `theElevationHeldBy`, at the moment a
   * guard asks — and never from anything a caller sent.
   *
   * ABSENT MEANS THE QUESTION WAS NEVER ASKED, which is every ordinary request: the lookup happens
   * only where the answer could change what happens.
   */
  elevation?: Elevation
  /**
   * DID A GUARD ACTUALLY USE THE ELEVATION ON THIS REQUEST? Set by `actsForThePerson` and nothing
   * else, and read by the two ledgers for the reason `warrantUsed` is read: an elevated secretary
   * filing an ordinary note needed no elevation, and writing one beside that row would say the
   * person's authority was spent on a write any worker could have made.
   */
  elevationUsed?: boolean
  /**
   * WHICH DOOR THIS REQUEST PRESSES, AND THE REASON IT GAVE FOR PRESSING IT FOR THE PERSON. A secretary presses for the
   * person under their grant, each press with a reason, and only at doors the secretary card does not keep for them.
   *
   * FILLED IN ONE PLACE, `actorFrom` in lib/http.ts, on an agent's actor, from the operation the matched route declared
   * and from the `forThePerson` field the request carried (lib/for-the-person.ts). It is one object for the whole
   * request, so every copy of the actor names the same press, and `logChange` writes one press row for it.
   *
   * ABSENT FOR A CALLER NO ROUTE CARRIED: a step inside the office, or a test that calls a guard itself. Nothing then
   * says which door it is, so `mayPressForThePerson` refuses a secretary there rather than guess.
   */
  press?: PressForThePerson
}

/** One request's door and reason, as `Actor.press` carries them. */
export interface PressForThePerson {
  /** The operation the route declared (src/shared/ops.ts), or null because the route declared none. */
  operation: string | null
  /** True when that operation only reads. A read changes nothing, so it needs no reason. */
  aRead: boolean
  /** The reason the request gave, or null because it gave none. */
  reason: string | null
  /** The press row's id, made when the request's first change row under the grant is written. */
  id?: string
  /**
   * THE GRANT THE CHECK LET THIS PRESS THROUGH UNDER, by id, set by `aRaiseCarriesIt` when it said yes. Absent while the
   * grant carried nothing in this request. Kept on the press as well as on the actor, because a door's copies of its
   * caller are different objects and the press is one, and the route layer reads it after the reply
   * (`writeDownAPressOutsideTheLog`).
   */
  underTheGrant?: string
}

/**
 * The one person Mole Office is for, as the guards in records.ts read them.
 *
 * THE ID IS NOT WRITTEN HERE. It is the office's owner, read from the office's own database by
 * src/server/lib/owner.ts and held in `THE_PERSON` in `@shared/person.ts`. `id` is a getter so that
 * it reads `THE_PERSON` when it is asked, not when this module was loaded: the modules load before
 * the server has read its database. Spreading `HUMAN` reads the getter at that moment.
 */
export const HUMAN: Actor = {
  type: 'human',
  get id(): string {
    return THE_PERSON
  },
}
