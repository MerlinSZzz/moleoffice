// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ASKS AND COMMITMENTS: who may close a problem for the person, the guard on removing an ask,
 * passing a question on, turning words into hours, committing hours and an intent, and writing a
 * count of what is waiting. They were moved out of src/server/lib/records.ts with no change of
 * behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`. This file does not import records.ts.
 */
import { CONFIRMED_BY } from '@shared/confirming.ts'
import type { PROBLEM_STATES } from '@shared/kinds.ts'
import { now } from '@shared/now.ts'
import { participantWord, type ParticipantRef } from '@shared/participants.ts'
import { THE_SECRETARY } from '@shared/roles.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import type { PanelRecord } from '@shared/types.ts'
import { displayWord, progressOf } from '@shared/work.ts'
import { gatePosition } from '../../../config/settings.mjs'
import { readParticipant } from '../../db/read-participant.ts'
import { isJsonObject } from '../../db/the-decision-names-this-fork.ts'
import { whoWroteTheValue } from '../../db/who-wrote-the-value.ts'
import { participantKey, passedItOnBy, whereOneQuestionIs } from '../confirming.ts'
import { gateMet, gateMetOnceTheWriteIsTakenBack } from '../gate-counts.ts'
import { PanelError } from '../panel-error.ts'
import { participantForActor } from '../participant-for-actor.ts'
import { theRoleCards, theRoleCardsAreRead } from '../roles.ts'
import { NAMING_NOUNS, RESERVED_WAITING_PHRASES, bodyBeingWritten, countOfWhatIsWaitingIn } from '../summary.ts'
import { theAgentAnArrivingReferenceNames } from '../the-agent-an-arriving-reference-names.ts'
import { anAgentItsOwnKeyProves, refusedWhileTheGateIsOff } from '../who-may-act.ts'
import type { Actor } from './actor.ts'
import { PROBLEM_KIND, actsForThePerson, actsForThePersonWithoutTheRaise } from './own-words.ts'
import { THE_PERSONS_MOVE, WHOSE_MOVE, dayOf } from './planning-guards.ts'
import { sameAgent, theWriterAStampNames } from './same-agent.ts'
import { ARRIVAL_IS_NOT_A_CLAIM, ONE_PERSON_AND_THE_NAME_IS_ITS_OWN, arrivalDetail, isSomebodyMoleOfficeCannotPlace, strangerDetail, theSecretaryOfThisOffice } from './served-doors.ts'

/**
 * THE ENDINGS A SECRETARY MAY GIVE A PROBLEM WHOSE MOVE IS THE PERSON'S: fixed and worked around.
 *
 * Once such a problem is fixed and only the close is
 * left, a secretary closes it, and the person can reopen it. `accepted` is not here. It means "we decided to
 * live with this", which is a judgement, and chapter 4 rule 5 lists marking a problem accepted among
 * the acts that need the person's words.
 */
const A_SECRETARY_CLOSES_AS: readonly (typeof PROBLEM_STATES)[number][] = ['fixed', 'worked_around']

/** The two fields a secretary's close writes: the ending, and what fixed it. */
const WHAT_A_SECRETARYS_CLOSE_WRITES = ['state', 'fix'] as const

/** What `whyASecretaryMayNotCloseThis` answers for a caller that holds no secretary card. */
const NOT_A_SECRETARY = 'the caller holds no secretary card'

/** The card a secretary holds, by the name the declaration gives it. */
function theSecretarysCard(): string {
  return theRoleCardsAreRead() ? theRoleCards().elevation.onlyThisCardCanHoldIt : THE_SECRETARY
}

/**
 * WHO MAY CLOSE A PROBLEM WHOSE MOVE IS THE PERSON'S, in the words a refused agent reads.
 */
function whoMayCloseAProblemForThem(): string {
  const card = theSecretarysCard()
  return (
    `The person may close it, and so may an agent holding the ${card} card. ` +
    `A ${card} closes it only as fixed or worked around, with what fixed it written in "fix", ` +
    'and changes nothing else in the same write.'
  )
}

/**
 * MAY A SECRETARY CLOSE THIS PROBLEM WHOSE MOVE IS THE PERSON'S? Null means yes. Otherwise it is the
 * reason, as the end of a sentence that begins "This write", or `NOT_A_SECRETARY`.
 *
 * All of these must hold:
 *
 *   · the record is a problem;
 *   · the caller is an agent holding the secretary card, read by `theSecretaryOfThisOffice`, the one
 *     reading of that card on a live, unretired registry row. No list of handles;
 *   · the write sets fixed or worked around (`A_SECRETARY_CLOSES_AS`);
 *   · the stored record will hold a fix text that is not empty;
 *   · nothing else in `data` changes. The question stays on the record, so when the person reopens the
 *     problem it is back on their list.
 *
 * The caller asks this only for a close. A delete is never asked here, so a secretary is refused a
 * delete exactly as every other agent is.
 */
function whyASecretaryMayNotCloseThis(
  kind: string,
  held: Record<string, unknown>,
  after: Record<string, unknown> | null,
  actor: Actor,
): string | null {
  if (kind !== PROBLEM_KIND || after === null) return NOT_A_SECRETARY
  if (!theSecretaryOfThisOffice(actor)) return NOT_A_SECRETARY
  const state = after['state']
  if (!A_SECRETARY_CLOSES_AS.some((word) => word === state)) {
    return `sets the state "${String(state)}", and a ${theSecretarysCard()} closes a problem only as fixed or worked around`
  }
  const fix = after['fix']
  if (typeof fix !== 'string' || fix.trim() === '') return 'leaves "fix" empty'
  const others = [...new Set([...Object.keys(held), ...Object.keys(after)])].filter(
    (key) =>
      !(WHAT_A_SECRETARYS_CLOSE_WRITES as readonly string[]).includes(key) &&
      JSON.stringify(held[key]) !== JSON.stringify(after[key]),
  )
  if (others.length > 0) return `also changes ${others.map((key) => `"${key}"`).join(', ')}`
  return null
}

/**
 * THE FOURTH GOVERNANCE ACT: TAKING SOMETHING OUT OF THE QUEUE OF THINGS THE OWNER WAS ASKED.
 *
 * ---------------------------------------------------------------------------------------
 * THE HOLE, REPRODUCED RATHER THAN DESCRIBED
 * ---------------------------------------------------------------------------------------
 *
 * `data.whose_move` says whose move it is on a piece of work, and `person` means the next step needs
 * a judgement, an approval, a hand on the hardware or money. It is the owner's queue of things an
 * agent has asked the person for, and until this guard existed an agent could empty it.
 *
 * Measured on 25 August 2026 over real HTTP, against a copy of the corpus, as
 * `x-mole-office-actor-type: agent`:
 *
 *   · created a `problem` carrying `whose_move: person`, then `DELETE /api/records/<id>` — **200**,
 *     `deletedAt` set, the record out of every live reading;
 *   · on a `problem` a PERSON had written `whose_move: person` on,
 *     `PATCH {"dataPatch":{"state":"fixed"}}` — **200**, the record closed;
 *   · on the same record, `PATCH {"dataPatch":{"whose_move":null}}` — **200**, the question gone.
 *
 * An agent could answer "nothing is waiting on you" by emptying the list, and
 * three different writes did it.
 *
 * ---------------------------------------------------------------------------------------
 * THREE ACTS, AND THE THIRD IS THE ONE THAT KEEPS THIS FROM BEING A LOCK
 * ---------------------------------------------------------------------------------------
 *
 * On a LIVE record carrying `whose_move: person` that has not already reached an end state, a
 * non-person is refused:
 *
 *   1. deleting the record — always;
 *   2. setting a state that means the work is finished — always, except that since 2 October 2026 a
 *      secretary may close a problem as fixed or worked around (`whyASecretaryMayNotCloseThis`);
 *   3. clearing or changing `whose_move` — ONLY when THIS SAME agent wrote the value it holds now.
 *
 * The third is what stops this being an agent-proof lock on the corpus. An agent may withdraw its
 * OWN request for the owner's attention and then close or delete the record; two writes, both in the
 * change log. It may never withdraw the owner's, and never another agent's.
 * `settings-and-governance.md` §8.5 states the rule that way round and says why both of the
 * alternatives are worse: a guard that let an agent close the record silently empties the queue, and
 * a guard that refused every clearing would let an agent make a record nobody can ever close by
 * asking a question on it.
 *
 * ---------------------------------------------------------------------------------------
 * THE ASKER IS AN IDENTITY AND NOT A KIND OF CALLER, AND THAT WAS MEASURED THE HARD WAY
 * ---------------------------------------------------------------------------------------
 *
 * Act 3 first shipped comparing the asker's TYPE and nothing else — `asked.actorType !== 'human'`.
 * That builds *"an agent may withdraw its own request"* as *"an agent may withdraw any non-human's
 * request"*, which is a different rule. A verifier reproduced it over real HTTP with two
 * agent identities on 25 August 2026: one agent filed a problem carrying
 * `whose_move: person`, a second agent cleared it — **200** — and then deleted it — **200**.
 * No person was involved at any point.
 * `design/round-ten/verification/wave-2.json`, `newFaults` entry 1.
 *
 * So the comparison is BOTH HALVES of the identity: the actor type and the actor id together,
 * against the type and the id on the revision that put the value there. Two agents are two askers
 * even though they are the same kind of caller. `settings-and-governance.md` §8.5 says the same
 * thing in the rule column, which is the half of that section this fix corrected — the note beside
 * it had said *own* from the start.
 *
 * WHY THE ID ALONE IS NOT ENOUGH EITHER. An agent using the same id as the person
 * is not the same asker, so the type is compared as well and a human-written
 * ask stays refused to every agent whatever it calls itself. The type clause `!== 'human'` stays for
 * its own reason: a person is refused nothing here and never reaches this test.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE `whoAsked` HAS NO ANSWER THE GUARD REFUSES RATHER THAN ALLOWS
 * ---------------------------------------------------------------------------------------
 *
 * Act 3 asks who wrote the value the record holds now. `whoWroteTheValue` in lib/revisions.ts is
 * that reading — the revision ledger, for the reasons written there — and it answers `null` when the
 * ledger cannot say: a record with no revisions, or one whose newest revision disagrees with the
 * record in front of it.
 *
 * **Null is refused.** An asker Mole Office cannot place is not a permitted one, and the direction matters
 * more than the case is common: failing open here re-opens the whole hole for any record whose
 * history is missing, which is exactly the set of records an archive import produces. Failing closed
 * costs the agent one refusal that says the person can clear the field, which is a working way
 * forward rather than a dead end. `settings-and-governance.md` §8.5a weighed the same two and picked
 * the same side.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS THE NARROWEST RULE THAT COVERS THE ACT
 * ---------------------------------------------------------------------------------------
 *
 * Four things are deliberately left alone, and each one is a reading rather than an exception:
 *
 *   · a record NOT carrying `whose_move: person`. Nothing is being asked of the owner;
 *   · a record already deleted. It is not in the queue, so nothing is taken from it;
 *   · a record already at an end state. The same: `settings-and-governance.md` §8.4 makes queue
 *     membership *live, not an end state, field set*, so a closed record is not in the queue;
 *   · every other write. Editing the words, adding a link, changing the title of a record that asks
 *     the owner something are all ordinary work and stay ordinary. This is not a permission layer
 *     and must not grow into one.
 *
 * IT DOES NOT GUARD RESTORE, for the reason `assertMayRemoveAFork` does not: putting the record back
 * puts the question back in front of the person, which is the direction this rule protects.
 */
export function assertMayRemoveAnAsk(
  record: Pick<PanelRecord, 'id' | 'kind' | 'title' | 'data' | 'deletedAt'>,
  /**
   * What `data` will hold AFTER this write, or `null` when the write is a delete.
   *
   * The value that will be STORED, never the patch that was sent, so a merge patch cannot get past a
   * check the wholesale path applies — the same rule the pipeline order and the checklist lines are
   * checked under a few hundred lines up.
   */
  after: Record<string, unknown> | null,
  actor: Actor,
): void {
  const held = isJsonObject(record.data) ? record.data : {}
  if (held[WHOSE_MOVE] !== THE_PERSONS_MOVE) return
  if (record.deletedAt !== null) return
  if (progressOf(held['state']) === 'finished') return

  // WHAT THIS WRITE IS DOING TO THE ASK, or nothing, in which case there is nothing to refuse.
  const deleting = after === null
  const closing = after !== null && progressOf(after['state']) === 'finished'
  const withdrawing = after !== null && after[WHOSE_MOVE] !== THE_PERSONS_MOVE
  if (!deleting && !closing && !withdrawing) return

  // WHO ASKED. Read once, because all three refusals name the writer and the date, and because act 3
  // turns on the answer. `settings-and-governance.md` §8.5a calls this reading `whoAsked`.
  //
  // AND THE WRITER IS NAMED, NOT PRINTED. The ledger holds a `"<type>:<id>"` stamp, and after the mint
  // an agent's id is twelve characters nobody chose. `theWriterAStampNames` is the same reader the
  // annotation refusal one guard over uses: it names the agent the stamp
  // resolves to, keeps the `human:` stamp and the person's id for the person, and falls back to the raw string only where
  // nothing can be placed.
  const asked = whoWroteTheValue(record.id, WHOSE_MOVE, THE_PERSONS_MOVE)
  const askedStamp = asked === null ? null : `${asked.actorType}:${asked.actorId}`
  const whoAsked =
    asked === null || askedStamp === null
      ? `Nobody recorded who asked: this record has no revision holding "${WHOSE_MOVE}": "${THE_PERSONS_MOVE}", so ` +
        `Mole Office cannot tell your own request from the person's.`
      : `${theWriterAStampNames(askedStamp)} wrote "${WHOSE_MOVE}": "${THE_PERSONS_MOVE}" on this ` +
        `${displayWord(record.kind)} on ${dayOf(asked.at)}, at revision ${asked.seq}.`

  // IS THE ASK THE CALLER'S OWN? Both halves of the identity, for the reason written above: two
  // agents are two askers. A person never matches, because `actorType !== 'human'` is asked first,
  // and a person is refused nothing here anyway.
  //
  // AND BOTH HALVES ARE RESOLVED. `asked.actorId` is the NAME the headers gave when the question was
  // put on the queue, which is the agent's handle for every agent alive today and its minted id
  // afterwards. `sameAgent` in records/same-agent.ts asks which agent each of the two names, so an agent may withdraw
  // the question it asked under its old name, and an agent that took a retired agent's freed name
  // may not withdraw the retired one's.
  const isTheCallersOwnAsk = asked !== null && asked.actorType !== 'human' && sameAgent(asked, actor)

  // ACT 3, ANSWERED BEFORE ANYTHING ELSE, BECAUSE IT IS THE ONE THAT CAN BE ALLOWED. An agent
  // withdrawing its own request is ordinary work; anybody else's ask is not its to withdraw.
  if (withdrawing && !deleting && !closing && isTheCallersOwnAsk) return

  /**
   * AND SINCE 6 SEPTEMBER 2026, A QUESTION THAT HAS NOT REACHED THE PERSON IS THE STARTER'S.
   * Criterion P55: the starter reviews the question and decides whether to close it
   * or pass it to the person.
   *
   * While a question is still with a starter it is NOT on the person's list — `whereTheQuestionIs` is what
   * the queue reads too, so the two cannot disagree — and closing it or taking the question off it
   * therefore empties nobody's queue. Those are the starter's own two answers, beside passing it on.
   *
   * IT IS NARROW ON PURPOSE, AND EVERY WORD OF IT IS MEASURED:
   *
   *   · only the agent the question is with NOW. Not its starter, not another agent it started, and
   *     not an agent that merely appears somewhere in the chain — the rungs are walked in order and
   *     `with` is the one whose turn it is;
   *   · closing and taking the question off, and NOT deleting. A delete is refused to every agent
   *     for the reason written above: a closed record is still readable and restorable, a deleted
   *     one is off every listing;
   *   · once it HAS reached the person, this clause is false and the refusals below are exactly what they
   *     were. That is what "the closing gate stays as it is for the person's own questions" means.
   */
  const whereItIs = whereOneQuestionIs({ id: record.id, data: held })
  // THIS ONE ALREADY RESOLVED, and it is on `sameAgent` now so there is ONE reader of the question
  // rather than two shapes of it in one file — invariant 9. What it asked was
  // `whereItIs.with.id === actor.id || participantForActor(actor)?.id === whereItIs.with.id`, and
  // `whereItIs.with` when the question has not reached the person is always an AGENT and always a
  // registry row — `whereTheQuestionIs` fills it from the agent rungs of `theChainUpWith` — so the
  // stored side here is an exact id and answers the same agent it answered before. ONE
  // case moves, and it moves the safe way: where the CALLER's own name means two agents, the first
  // half of the old test could still say yes by characters before the second half ever asked, and
  // `sameAgent` raises I-1's refusal naming both agents instead.
  const itIsWithTheCaller =
    !whereItIs.reachedThePerson &&
    whereItIs.with !== null &&
    actor.type === 'agent' &&
    sameAgent({ actorType: 'agent', actorId: whereItIs.with.id }, actor)
  if (!deleting && itIsWithTheCaller) return

  // AND SINCE 2 OCTOBER 2026, A SECRETARY CLOSES A PROBLEM THAT IS FIXED. See
  // `whyASecretaryMayNotCloseThis`. When it answers null the write is the secretary's own act: it
  // returns here, before `actsForThePerson`, so the change row carries no warrant and no raise.
  const secretaryRefusedBecause = closing && !deleting ? whyASecretaryMayNotCloseThis(record.kind, held, after, actor) : undefined
  if (secretaryRefusedBecause === null) return

  // AND SINCE 3 SEPTEMBER 2026, THE PERSON'S OWN WORDS ANSWER THE OTHER TWO. Closing a record the person was
  // asked about, and withdrawing a question somebody else asked them, are both open to an agent that
  // can quote the person saying so. The refusals below are unchanged for a request that carries no warrant.
  //
  // DELETING IS NOT COVERED, AND THAT IS THE NARROW READING ON PURPOSE. Authorization to close a
  // settled record or withdraw a question does not authorize removing the record. A closed record is still
  // readable, still on the person's page and
  // still restorable to open; a deleted one is off every listing. So a delete stays refused to every
  // agent, warrant or not, and the refusal it gets is the one it always got.
  //
  // IT IS A CONDITION ON THE FIRST CLAUSE AND NOT A RETURN, so the three clauses after it still run.
  // A warranted agent at another machine is still refused there, because which machine asked is not
  // a question anybody's words can answer.
  //
  // AND A WHO-MAY-ACT GATE STANDS AT THIS CLAUSE. At off the raise is not asked, so nothing is written
  // under the grant, and an agent its own key proves passes this clause too: it may close the record or take the
  // question off it, and the change row names it. The three clauses after this one still run, and the gate counts that
  // agent at the end, once all of them pass. A delete is not gated, so it is refused to every agent at both positions.
  const position = !deleting && actor.type !== 'human' ? gatePosition('who-removes-an-ask-on-the-person') : null
  const onTheirWords = position !== null && (position === 'block' ? actsForThePerson(actor) : actsForThePersonWithoutTheRaise(actor))
  const keyed = position !== null && !onTheirWords && anAgentItsOwnKeyProves(actor) !== null
  const letPastAtOff = keyed && position !== 'block'

  const way = isTheCallersOwnAsk
    ? `The request is yours, so withdraw it first — PATCH /api/records/${record.id} ` +
      `{"dataPatch":{"${WHOSE_MOVE}":null}} — and then do this. That is two lines in the change log ` +
      `instead of none, and it leaves the person able to see that the question was asked and dropped.`
    : asked !== null && askedStamp !== null && asked.actorType !== 'human'
      ? // ASKED BY A DIFFERENT AGENT. It is not the caller's to withdraw, and the sentence must not
        // say "the request is yours" — that was the wrongness the verifier found beside the hole.
        //
        // AND THE ASKER IS NAMED, the same reading `whoAsked` uses above:
        // `theWriterAStampNames` names the agent the stamp resolves to and falls back to the raw
        // string only where nothing can be placed.
        `${theWriterAStampNames(askedStamp)} asked the question, so only ` +
        `they or the person can take it out of the queue. Say what you have found instead, on the ` +
        `record, and leave the question where the person can see it: PATCH /api/records/${record.id} ` +
        `{"summary":"<what you found>"}.`
      : `Say what you have found instead, on the record, and leave the question where the person can ` +
        `see it: PATCH /api/records/${record.id} {"summary":"<what you found>"}. Clearing the ` +
        `question is the person's own act and it is done in the browser at the machine Mole Office runs on.`

  /**
   * WHERE THE QUESTION IS, said on every refusal, because it decides who may answer this.
   *
   * A question still with a starter is refused to everybody else with the name of whoever it IS
   * with, so the refused agent knows who to ask rather than only that it was not allowed.
   */
  const whereItIsSays = whereItIs.reachedThePerson ? '' : ` ${whereItIs.says}`

  const tail = `Nothing was written and "${record.title}" is exactly as it was. ${whoAsked}${whereItIsSays} ${way}`

  const act = deleting
    ? `Deleting a ${displayWord(record.kind)} that asks the person something takes it out of their queue`
    : closing
      ? `Closing a ${displayWord(record.kind)} that asks the person something answers the question for them`
      : `Clearing the question on a ${displayWord(record.kind)} takes it out of the person's queue`

  if (actor.type !== 'human' && !onTheirWords && !letPastAtOff) {
    if (position !== null && position !== 'block') {
      throw refusedWhileTheGateIsOff(actor.id, 'who-removes-an-ask-on-the-person', 'close a record that asks the person something, or take the question off it')
    }
    // WHO MAY CLOSE IT, said on every refused close of a problem. A secretary that was refused is
    // told what in its own write stopped it.
    const whoMayClose =
      closing && record.kind === PROBLEM_KIND
        ? ` ${whoMayCloseAProblemForThem()}` +
          (typeof secretaryRefusedBecause === 'string' && secretaryRefusedBecause !== NOT_A_SECRETARY
            ? ` This write ${secretaryRefusedBecause}.`
            : '')
        : ''
    const refusal = new PanelError(`${act}, and this request came from ${actor.type} "${actor.id}".${whoMayClose} ${tail}`, 403)
    // AN AGENT ITS OWN KEY PROVES IS COUNTED AS STOPPED, when the gate is all that stops it: from another machine the
    // last clause would refuse it at off too.
    if (!keyed || actor.from === 'another machine') throw refusal
    throw gateMetOnceTheWriteIsTakenBack(refusal, () => gateMet('who-removes-an-ask-on-the-person', 'block'))
  }
  if (actor.stated === false) {
    throw new PanelError(
      `${act}, and this request sent no actor headers, so nothing said who is asking. Ordinary writes take ` +
        `that as the person typing by hand; emptying their queue may not, because an absent header is not ` +
        `evidence that a person made the act. ${tail} ` +
        `Send x-mole-office-actor-type: human and x-mole-office-actor-id: <who you are>.`,
      403,
    )
  }
  // AND IS IT SOMEBODY MOLE OFFICE KNOWS, asked with the actor clauses above and before the machine one,
  // for the reason the other three guards give: it holds from any machine, so its advice is worth
  // giving wherever the caller is.
  if (isSomebodyMoleOfficeCannotPlace(actor)) {
    throw new PanelError(
      `${act}, and this request was made in the name "${actor.id}", which is not somebody Mole Office can place. ` +
        `${tail} ${ONE_PERSON_AND_THE_NAME_IS_ITS_OWN}`,
      403,
      strangerDetail(`${deleting ? 'delete' : 'change'} ${record.kind} ${record.id}`, actor),
    )
  }
  // AND WHERE IT WAS ASKED FROM, asked last, for the reason the other three give: the clauses above
  // are true from any machine and this one is the answer only once the actor half has passed. It is
  // in this commit and not a later one — the other three guards already read `actor.from`,
  // and a fourth that did not would be the one act in the set reachable from another machine.
  if (actor.from === 'another machine' && !thePersonIsProved(actor)) {
    throw new PanelError(
      `${act}, and it is the person's own act, done at the machine Mole Office runs on. This request came from ` +
        `another machine. ${tail} ${ARRIVAL_IS_NOT_A_CLAIM}`,
      403,
      arrivalDetail(`${deleting ? 'delete' : 'change'} ${record.kind} ${record.id}`),
    )
  }
  if (letPastAtOff) gateMet('who-removes-an-ask-on-the-person', 'off')
}

/**
 * PASSING A QUESTION UP IS AN ACT, AND ONLY WHOEVER IT IS WITH MAY MAKE IT. Criterion P55.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE RULE IS HERE AND NOT ONLY IN THE ROUTE
 * ---------------------------------------------------------------------------------------
 *
 * `confirmed_by` is an ordinary declared field, so `PATCH /api/records/<id>` can write it. A rule
 * that lived only in `POST /api/records/<id>/pass-the-question-on` would be a rule with a door
 * beside it, and any agent could put its starter's name on the list and hand itself the person's
 * attention. So the check is on the write path, the route builds the same patch, and the route is a
 * convenience rather than the enforcement.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT ALLOWS, AND IT IS ONE SHAPE
 * ---------------------------------------------------------------------------------------
 *
 * Exactly one entry appended, naming the caller, on a record whose question is with the caller. Not
 * two at once, not somebody else's name, not an entry inserted in the middle, and never a change to
 * one already there: the list is the path the question took, and a path that can be edited
 * afterwards is not a record of anything.
 *
 * THE PERSON MAY PASS ONE ON TOO, and that is not a loosening. A chain that has stalled — an agent
 * that will never run again — would otherwise hold a question nobody can move, and the one party
 * every rung of the chain answers to is the person. It goes in the list under their own name, so the
 * record says the person did it rather than looking as though the chain completed.
 */
export function assertMayPassTheQuestionOn(
  record: Pick<PanelRecord, 'id' | 'kind' | 'title' | 'data'>,
  /** What `data` will hold after this write, or null when the write is a delete. */
  after: Record<string, unknown> | null,
  actor: Actor,
): void {
  const held = isJsonObject(record.data) ? record.data : {}
  const before = passedItOnBy(held)
  const now = after === null ? [] : passedItOnBy(after)
  const sameAsBefore =
    before.length === now.length &&
    before.every((one, at) => {
      const other = now[at]
      return other !== undefined && participantKey(one.who) === participantKey(other.who) && one.at === other.at
    })
  // A WRITE THAT DOES NOT TOUCH THE LIST IS NOT THIS GUARD'S BUSINESS, which is most writes.
  if (sameAsBefore) return

  const what = `The path a question took up to the person is on this ${displayWord(record.kind)}, in "${CONFIRMED_BY}"`
  const tail = `Nothing was written and "${record.title}" is exactly as it was.`

  // ONE ENTRY, APPENDED, AND NOTHING ELSE MOVED. Checked before who is asking, because a caller that
  // may pass it on still may not rewrite the path.
  const appended = now.length === before.length + 1 ? (now[now.length - 1] ?? null) : null
  const restIsUnchanged =
    appended !== null &&
    before.every((one, at) => {
      const other = now[at]
      return other !== undefined && participantKey(one.who) === participantKey(other.who) && one.at === other.at
    })
  if (appended === null || !restIsUnchanged) {
    throw new PanelError(
      `${what}, and it is only ever added to, one entry at a time. This write would ` +
        `${now.length < before.length ? 'remove' : now.length === before.length ? 'rewrite' : 'add ' + String(now.length - before.length) + ' entries to'} ` +
        `it. ${tail} Pass a question on with POST /api/records/${record.id}/pass-the-question-on, which writes ` +
        'the one entry itself.',
      403,
    )
  }

  // THE NAME IN THE NEW ENTRY ARRIVED IN THIS BODY, so an agent there may be written by its id or
  // its handle. It goes through the one resolver as a write (criterion I2), it is compared with the
  // caller by registry id, and the entry is rewritten to that id, so what is stored is the id.
  // `after` is the body that will be stored, and `passedItOnBy` copies, so the entry is rewritten
  // in `after` itself.
  const me = participantForActor(actor)
  const whoSaid = appended.who
  const whoNamed = whoSaid.kind === 'agent' ? theAgentAnArrivingReferenceNames(whoSaid.id, 'writing') : null
  const who: ParticipantRef = whoNamed === null ? whoSaid : { kind: 'agent', id: whoNamed.agent.id }
  if (me === null || participantKey(me) !== participantKey(who)) {
    throw new PanelError(
      `${what}, and an entry in it says who passed the question on. This write files it under ` +
        `${participantWord(appended.who.kind)} "${appended.who.id}", and this request came from ` +
        `${actor.type} "${actor.id}"${me === null ? ', which is not somebody Mole Office can place' : ''}. ` +
        `You may only pass a question on under your own name. ${tail}`,
      403,
    )
  }
  if (who.id !== whoSaid.id && after !== null) {
    const stored = after[CONFIRMED_BY]
    const last = Array.isArray(stored) ? (stored[stored.length - 1] as unknown) : null
    if (isJsonObject(last)) last['who'] = { kind: who.kind, id: who.id }
  }

  // AND IS IT YOURS TO PASS ON. The same reading the queue and the closing gate use, so a question
  // cannot be on one list here and another there.
  const whereItIs = whereOneQuestionIs({ id: record.id, data: held })
  if (whereItIs.reachedThePerson) {
    throw new PanelError(
      `${what}, and this question has already reached the person, so there is nobody left to pass it on to. ` +
        `${whereItIs.says} ${tail}`,
      403,
    )
  }
  if (whereItIs.with === null) {
    // NOTHING ASKS THE PERSON ANYTHING, so there is no question to pass on. This is what a create
    // arriving with a path already on it gets, and what a record whose `whose_move` is not "person"
    // gets: in both, the list would be a record of something that never happened.
    throw new PanelError(
      `${what}, and this ${displayWord(record.kind)} asks the person nothing, so no question has been passed ` +
        `anywhere. A question starts when somebody writes "${WHOSE_MOVE}": "${THE_PERSONS_MOVE}" on it. ${tail}`,
      403,
    )
  }
  const itIsYours = me.kind === 'person' || participantKey(me) === participantKey(whereItIs.with)
  if (!itIsYours) {
    // AN AGENT IS NAMED BY THE HANDLE ON ITS ROW, never by a minted id nobody chose.
    const caller = me.kind === 'agent' ? (readParticipant(me)?.handle ?? me.id) : me.id
    throw new PanelError(
      `${what}, and it is passed on by whoever it is with. ${whereItIs.says} This request came from ` +
        `${participantWord(me.kind)} "${caller}". ${tail}`,
      403,
    )
  }
}

/**
 * THE RULE'S OWN WORDS, WRITTEN ONCE SO NO TWO DOORS CAN SAY IT DIFFERENTLY.
 *
 * `assertMayCommitAnIntent` and `assertMayCommitTheHours` below both read this string, and the
 * sentence is composed from it. A second copy of it anywhere is the drift this constant exists to
 * stop.
 */
const TURNING_WORDS_INTO_HOURS = 'Turning words about time into hours on the calendar is the person’s own act'

/**
 * THE ONE CLAUSE THAT REFUSES AN AGENT THE HOURS, CALLED FROM EVERY DOOR THAT WRITES ONE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS HERE AND NOT IN EITHER DOOR
 * ---------------------------------------------------------------------------------------
 *
 * Committing hours is the person's own act. That rule reaches the calendar through two doors:
 * `POST /api/planning/intents/:id/commit`, through `assertMayCommitAnIntent`, and every door that
 * writes an allocation — `POST /api/planning/allocations`, giving a plan line time, filing a line
 * whose own words already read as time, and applying a settled change set. Every one of those
 * writes the allocations table through `createAllocation`, so this is what `createAllocation` and
 * `assertMayCommitAnIntent` both call: one sentence, two doors, and no second copy of the words.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not ask whether the caller said who it was, whether the
 * name can be placed, or which machine the request came from. Those are the rest of the governance
 * guard `assertMayCommitAnIntent` keeps, and they belong to the door where the words being committed
 * are in hand. This is the clause that every hour-writing path must carry.
 *
 * AN ELEVATION STILL ANSWERS IT. `actsForThePerson` is the person's own press for a period, exactly
 * as it is on the intent guard that already had this clause. Nothing here widens that. It is asked about
 * committing hours by that part's own name beside the door the press came through, so each office's
 * person may keep the hours for themselves on every one of these doors at once.
 *
 * `tail` is the caller's account of what was not written. The rule's sentence and the way out an
 * agent may take are composed here from one place; only the facts differ.
 */
export function assertMayCommitTheHours(actor: Actor, tail: string): void {
  if (actor.type !== 'human' && actsForThePerson(actor, { also: ['plan:committing-hours'] })) return
  if (actor.type !== 'human') {
    throw new PanelError(
      `${TURNING_WORDS_INTO_HOURS}, and this request came from ${actor.type} "${actor.id}". ${tail} The person ` +
        `does this in the browser on the planning screen, with the press labelled “Give it that time”. Writing ` +
        `down what somebody said about time is yours and it is done: POST /api/planning/intents keeps the words ` +
        `and Mole Office offers a reading of them. Scheduling the time is the part that is not.`,
      403,
    )
  }
}

/**
 * THE FIFTH GOVERNANCE ACT: TURNING SOMEBODY'S WORDS ABOUT TIME INTO HOURS ON THE CALENDAR.
 *
 * ---------------------------------------------------------------------------------------
 * THE HOLE, REPRODUCED RATHER THAN DESCRIBED
 * ---------------------------------------------------------------------------------------
 *
 * A person writes `around 1.5 maybe more` against a piece of work. Mole Office reads a week out of that
 * and OFFERS it beside the words, unchanged — the eighth rule's three layers: what was written, what
 * Mole Office made of it, and what was committed. Committing is the third layer, and it is the only one
 * arithmetic reads: it writes a row into the allocations table, which is what every total, every
 * capacity check and every "this week is full" is computed from.
 *
 * `commitIntent` took an actor and never looked at it. Measured on 25 August 2026 over real HTTP
 * against a copy of the corpus, as `x-mole-office-actor-type: agent`:
 * `POST /api/planning/intents/<record>/commit` answered **HTTP 201** and wrote an allocation
 * record — a week of the owner's time — into the canonical table. The allocation count went
 * from 10 to 11.
 *
 * Owner decision §36 names planning approval and apply among the acts that need an explicit person.
 * For apply that was built, inside `src/server/api/planning.ts`. For commit it was not, and any agent
 * on this machine could schedule the owner's week. `remote-access.md` §6.7 found it and §15.2 step 1b
 * ordered it here.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A GUARD AND NOT ONLY THE ROUTE'S `reach: 'local'`
 * ---------------------------------------------------------------------------------------
 *
 * The route already declares `reach: 'local'`, which keeps the act off the second listener when that
 * listener is switched on. That is a different question from this one. `reach` says which machines
 * may ask; this says who may ask. Declaring the route local keeps the hole off the tailnet and does
 * not close it, and §6.7 says so in those words.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS THE NARROWEST RULE THAT COVERS THE ACT
 * ---------------------------------------------------------------------------------------
 *
 * An agent may still write down what somebody said about time, and Mole Office still reads a period out of
 * it and offers that beside the words. What an agent may not do is turn the offer into hours. Nothing
 * else about planning moves: reading, drafting, critiquing and proposing are all untouched, and the
 * apply route keeps its own check, which is deliberately not merged into this one — `remote-access.md`
 * §6.7 measured that a clause added to the guards never runs on that route.
 */
export function assertMayCommitAnIntent(
  /** Enough of the intent to say what would have been scheduled. A structural type, so this file does not import the planning layer. */
  intent: { id: string; said: string; period: string | null },
  actor: Actor,
): void {
  const act = TURNING_WORDS_INTO_HOURS
  const tail =
    `Nothing was scheduled: no hours were written, no capacity was used, and no total moved. The words ` +
    `“${intent.said}” are exactly where they were, and what Mole Office made of them is still offered beside ` +
    `them${intent.period === null ? '' : ` — ${intent.period}`}, waiting.`
  const detail = `commit planning intent ${intent.id}`

  // AND THE PERSON'S PRESS ANSWERS IT, exactly as their quoted words do. Criterion P59: an elevation gives the
  // person's own acts, and this is one of them — `actKey` on this guard's entry in GOVERNANCE_GUARDS
  // is the act, and the declaration files that act under the power an elevation hands over. The
  // refusal below is unchanged for a request with no warrant and no elevation.
  //
  // THE REFUSAL ITSELF LIVES IN `assertMayCommitTheHours`, which `createAllocation` calls too: an
  // allocation written from any door carries the same rule, in the same sentence. See that function
  // for why the clause is not restated here.
  assertMayCommitTheHours(actor, tail)
  if (actor.stated === false) {
    throw new PanelError(
      `${act}, and this request sent no actor headers, so nothing said who is asking. Ordinary writes take that ` +
        `as the person typing by hand; scheduling their week may not, because an absent header is not evidence ` +
        `that a person made the act. ${tail} ` +
        `Send x-mole-office-actor-type: human and x-mole-office-actor-id: <who you are>.`,
      403,
    )
  }
  // AND IS IT SOMEBODY MOLE OFFICE KNOWS, asked with the actor clauses above and before the machine one,
  // for the reason the other four guards give: it holds from any machine.
  if (isSomebodyMoleOfficeCannotPlace(actor)) {
    throw new PanelError(
      `${act}, and this request was made in the name "${actor.id}", which is not somebody Mole Office can place. ` +
        `${tail} ${ONE_PERSON_AND_THE_NAME_IS_ITS_OWN}`,
      403,
      strangerDetail(detail, actor),
    )
  }
  // AND WHERE IT WAS ASKED FROM. In this commit and not a later pass, for the reason collision 11
  // settled: a guard whose arrival clause arrives separately is a guard that could not refuse the
  // machine on the day it landed. The route's own `reach: 'local'` declaration answers a different
  // question — which machines may ask at all — and nothing enforces it yet.
  if (actor.from === 'another machine' && !thePersonIsProved(actor)) {
    throw new PanelError(
      `${act}, and it is done at the machine Mole Office runs on. This request came from another machine. ${tail} ` +
        `${ARRIVAL_IS_NOT_A_CLAIM}`,
      403,
      arrivalDetail(detail),
    )
  }
}

/**
 * AN AGENT MAY NOT WRITE DOWN HOW MANY THINGS ARE WAITING ON THE PERSON.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * One report block says "Nineteen things are waiting on you" and then names four
 * of them. The other fifteen are in a repository file. The sentence was true the day it was typed
 * and it is a claim about the corpus, so it goes out of date on its own, in a body nothing
 * recomputes and nobody re-reads.
 *
 * `GET /api/waiting` is the one reading of what is waiting on the person. A stored body that
 * asserts its own count is a second one — frozen, and free to disagree with the live one from the
 * moment it is written.
 *
 * ---------------------------------------------------------------------------------------
 * THE PERSON IS NOT REFUSED, AND THAT IS THE POINT OF SPLITTING IT
 * ---------------------------------------------------------------------------------------
 *
 * The eighth rule: a human-facing box is not where rules are enforced by refusal. If the owner
 * writes "Nineteen things are waiting on you" the write succeeds and the bytes stored are exactly
 * what they typed. Beside it Mole Office draws the live count and says so when the two disagree — that is
 * the drawn half, it belongs to `SummaryBlocks.tsx`, and it is built where that
 * file is owned. This half is the refusal, and both halves are proved where they are built.
 *
 * SO THIS GUARD IS NOT A CENSOR. It refuses one caller — an agent — from writing one kind of
 * sentence into a body. Everything an agent may already write it may still write, including the
 * number itself: `GET /api/waiting` answers with the count, and a report links to the things it is
 * about, which is what makes the number on its page live.
 *
 * ---------------------------------------------------------------------------------------
 * NO ARRIVAL CLAUSE, AND THAT IS DELIBERATE
 * ---------------------------------------------------------------------------------------
 *
 * The four guards above reserve an ACT to the person, so each asks where the request arrived from:
 * a person at another machine is not the person at this one. This guard reserves nothing. It refuses
 * a claim to agents, and an agent is an agent on whichever machine it is running — the clause would
 * refuse nothing that is not already refused, and it would refuse the owner writing their own report
 * from their phone, which is exactly the writing the eighth rule protects.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT LOOKS AT, AND WHAT IT CANNOT SEE
 * ---------------------------------------------------------------------------------------
 *
 * The prose of the body being written — see `countOfWhatIsWaitingIn` in lib/summary.ts for the
 * phrases, the number words and the span. It reads no source file: the failure it exists to prevent
 * is a word in a database row, and a check over `.tsx` files would have been green throughout it.
 *
 * It cannot see a count written some other way — "waiting on you: a good few", a number in a chart,
 * a total a reader adds up from a table. Those are not caught and are not claimed to be. What is
 * caught is the shape the failure actually took.
 *
 * ---------------------------------------------------------------------------------------
 * ON A PATCH IT READS THE WHOLE BODY THIS WRITE WILL STORE
 * ---------------------------------------------------------------------------------------
 *
 * So an agent that merge-patches one field of a report whose body already asserts a count is
 * refused until that sentence goes. That is the same stance `validateRecordData` states for a key
 * no kind declares — "a record stored before this gate existed cannot be merge-patched until the
 * same patch also removes it. That is deliberate." The alternative is a write path that lets a body
 * keep a claim it would refuse today.
 *
 * `RESERVED_WAITING_PHRASES` is imported rather than written out again so the refusal names the
 * same phrases the check looks for.
 */
export function assertMayWriteACountOfWhatIsWaiting(
  kind: string,
  /** The `data` this write will store. A write that does not touch the body passes: see `bodyBeingWritten`. */
  data: Record<string, unknown> | undefined,
  actor: Actor,
  /** The record, for the refusal. Null on a create, where there is no id yet. */
  recordId: string | null,
): void {
  if (actor.type === 'human') return
  const body = bodyBeingWritten(kind, data)
  if (body === null) return
  const found = countOfWhatIsWaitingIn(body)
  if (found === null) return

  throw new PanelError(
    `This ${kind}'s body says how many things are waiting on the person — “${found.quantity}” beside ` +
      `“${found.phrase}”, in “…${found.passage}…” — and this request came from ${actor.type} "${actor.id}". ` +
      `Nothing was written${recordId === null ? '' : ` and ${kind} ${recordId} is exactly as it was`}. ` +
      `A number like that is true on the day it is typed and nothing recomputes it, so it is wrong by the ` +
      `following week with nothing saying so.\n\n` +
      `WHERE THE NUMBER COMES FROM INSTEAD. GET /api/waiting is the one reading of what is waiting on the ` +
      `person, in every project, and it is computed at read time. A report's own page draws that reading ` +
      `narrowed to the things this report links to, so link this report to what it is about and the count ` +
      `beside it is live and is somebody's to follow.\n\n` +
      `WHAT WAS LOOKED AT. The prose of the body — headings, paragraphs, findings, list items, quotes, ` +
      `captions, table words and a picture's text alternative — for one of these phrases: ` +
      `${RESERVED_WAITING_PHRASES.map((phrase) => `“${phrase}”`).join(', ')}, with a quantity within six ` +
      `words of it. A quantity is digits, or a number word, so “Nineteen” counts and so does “about ` +
      `twenty”. A date is not a quantity, and nor is a number that names one thing: after ` +
      `${NAMING_NOUNS.map((noun) => `“${noun}”`).join(', ')} or “#”, beside a month's name, after “第”, or ` +
      `before 月, 日, 号 or 年. So “round 11” and “第 11 轮” are names, and “5 things” is a count.\n\n` +
      `THE PERSON IS NOT REFUSED THIS. They may write the sentence and it is stored exactly as typed, with ` +
      `the live count drawn beside it. This is refused to agents, because an agent writing the number is ` +
      `the product answering its own governance question.`,
    403,
  )
}
