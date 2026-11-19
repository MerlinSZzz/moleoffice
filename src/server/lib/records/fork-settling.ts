// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO SETTLES A FORK, AND WHETHER IT IS SETTLED: the field that says who may settle one, the
 * reader for it, the link that takes a fork off the owner's queue, the decisions and secretaries
 * that settle one, and the words for the five authorities. They were moved out of
 * src/server/lib/records.ts with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`. This file does not import records.ts.
 */
import { and, eq, isNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { DECISION_KIND } from '@shared/decision-kind.ts'
import { DECISION_AUTHORITIES, DECISION_AUTHORITY_NEEDS, FORK_SETTLERS, FORK_SETTLER_MEANINGS, THE_OWNER, type ForkSettler } from '@shared/kinds.ts'
import { aResidencyProposalHasItsOwnDoors, isAResidencyProposal } from '@shared/residents.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { RESOLVES_PROPOSAL, type ActorType } from '@shared/types.ts'
import { db } from '../../db/client.ts'
import { keptStatement } from '../../db/kept-statement.ts'
import { numbering } from '../../db/numbering.ts'
import { readParticipant } from '../../db/read-participant.ts'
import { changes, links, records } from '../../db/schema.ts'
import { isJsonObject, theDecisionNamesThisFork } from '../../db/the-decision-names-this-fork.ts'
import { whoWroteTheValue } from '../../db/who-wrote-the-value.ts'
import { PanelError } from '../panel-error.ts'
import { participantForActor } from '../participant-for-actor.ts'
import type { RegisteredAgent } from '../participants.ts'
import { theResidentsDoorsAreSettling } from '../residents-door.ts'
import { theRoleCards, theRoleCardsAreRead } from '../roles.ts'
import type { Actor } from './actor.ts'
import { LINKS_THAT_REPLACE_A_FORK, PROPOSAL_KIND } from './fork-settled.ts'
import { thePressThatWouldAllowThis, theWordsThatWouldSettleThis } from './human-only.ts'
import { readCreatedByType } from './link-readers.ts'
import { actsForThePerson, theSecretaryActingForThePerson } from './own-words.ts'
import { getRecord } from './reading.ts'
import { ARRIVAL_IS_NOT_A_CLAIM, ONE_PERSON_AND_THE_NAME_IS_ITS_OWN, arrivalDetail, isSomebodyMoleOfficeCannotPlace, strangerDetail, theSecretaryOfThisOffice } from './served-doors.ts'

/**
 * THE OTHER GOVERNANCE ACT, WHICH IS NOT A KIND AND NOT A VERB: pointing a decision at a fork.
 *
 * Settling a proposal is not a field somebody sets. It IS the `derived_from` link from a decision to
 * the proposal — `proposalResolution` reads that link and nothing else — so the link is the act, and
 * §36 names it in the same breath as promotion:
 *
 *   > governance actions such as Proposal promotion, GOVERNANCE-SETTLING LINKS, and Planning
 *   > approval/apply must require an explicit valid human actor.
 *
 * Writing the decision was already refused to everything but a stated human. Writing the LINK was
 * not, and that was the whole hole: a decision the owner really made about fonts could be pointed at
 * an unrelated fork by an agent — or by a request that named nobody, which the log would then record
 * as the owner's own act — and the fork would read as settled. `GET /api/needs-you` defended itself
 * by counting only human-made links, but a defence on the reading side leaves the false row in the
 * database and leaves every other reader to remember the rule. This refuses the write.
 *
 * IT IS DELIBERATELY THE NARROWEST RULE THAT COVERS THE ACT: a decision, through `derived_from`, at
 * a proposal. A note derived from a proposal is ordinary work and is not touched; neither is a
 * `relates_to` between the same two records, which is the honest weak statement and settles nothing.
 * Anything wider would be a permission layer this product does not have and was told not to invent.
 *
 * WHAT IT DOES NOT REPLACE. `humanLinked` in api/needs-you.ts still reads the change log, because
 * rows written before this rule — and rows arriving through an archive — are still out there, and a
 * reader that trusted the write gate for them would be trusting a gate that was not standing when
 * they were made.
 *
 * ---------------------------------------------------------------------------------------
 * THE SENTENCE ABOVE THAT STOPPED GOVERNING ON 27 AUGUST 2026, AND WHAT REPLACED IT
 * ---------------------------------------------------------------------------------------
 *
 * Until that day this guard refused the link to EVERY agent, unconditionally, and the paragraphs
 * above are written in that voice — *"pointing a decision at a fork is still the person's act"*.
 * That sentence is kept here because it is what every link made before that date was made under.
 *
 * It left a hole once agents were allowed to decide. An agent may now write a `decision` that says
 * what it stands on (`assertMayDecide` above, commit e058781) and a fork may now say who settles it
 * (`who_settles_it`, commit 48f8d29). But the LINK is the settling act — there is no stored flag
 * beside it — so an agent could write the decision and could not point it at the fork, which means
 * it could not close anything. An agent may close a question only with enough authoritative evidence,
 * and may claim no authority beyond what that evidence establishes.
 *
 * SO THE QUESTION THIS GUARD ASKS OF AN AGENT MOVED FROM *WHO IS ASKING* TO *WHAT DOES THE FORK
 * SAY*, and there are three answers:
 *
 *   1. `who_settles_it` is "the owner" — refused, in the words it was always refused in. This is
 *      governance and it stays the owner's.
 *   2. `who_settles_it` is not there — refused, and the refusal says why. Nobody has classified
 *      this fork, and a fork nobody has classified is not an agent's to settle. ABSENCE IS NOT
 *      PERMISSION: the owner's own rule is that if you are unsure whether a fork is the owner's, it is the owner's.
 *   3. `who_settles_it` is "an agent", "the parent" or "a measurement" — the agent may settle it,
 *      but only with a decision that carries an `authority`. A decision that does not say what it
 *      stands on is an opinion, and an opinion closes nothing.
 *
 * THE HUMAN CLAUSES DID NOT MOVE. A person may settle anything, including with a decision that
 * carries no authority, for the reason `assertMayDecide` gives: a person deciding because they feel
 * like it is a decision and it is theirs. The three clauses after this one — no actor headers, a
 * name Mole Office cannot place, another machine — are unchanged and are asked in the same order, for
 * the reasons written on each of them. An agent that gets past the fork's own answer is asked them
 * too: the second can only ever be a person, the third returns false for a non-human by
 * construction, and the fourth is the machine question, which is nobody's to answer by header.
 */
export function assertMaySettleFork(
  from: {
    /** The decision's id, when the caller has one. Used only to tell an agent which record to fix. */
    id?: string
    kind: string
    title: string
    /**
     * WHAT THE DECISION SAYS IT STANDS ON, handed over by the caller that has the row.
     *
     * OMITTING IT IS "NO AUTHORITY", AND THAT IS THE SAFE DIRECTION — the same shape and the same
     * reasoning as the `body?` parameter on `assertMayWrite`. `createLink` passes the stored row, so
     * the only caller that leaves this out is one asking a hypothetical question: `GET /api/waiting`
     * probes this guard with "a decision" that does not exist, to find out whether a fork is still
     * the person's. A missing body can therefore only ever make this guard stricter, never looser.
     */
    data?: unknown
  },
  to: { id: string; kind: string; title: string },
  type: string,
  actor: Actor,
): void {
  if (type !== RESOLVES_PROPOSAL) return
  if (to.kind !== PROPOSAL_KIND || from.kind !== DECISION_KIND) return

  // A RESIDENCY PROPOSAL IS SETTLED ONLY BY ITS OWN TWO PRESSES, Confirm and Not now (src/server/lib/residents.ts),
  // because confirming it makes the agent's personal space in the same act and no other door does. Every generic way
  // of settling a fork reaches this guard — promote, choose again, a decision filed with a link, POST /api/links — so
  // it is refused here, for anybody, the person included, before anything is written: each of those writes runs in
  // one transaction with the link, and the refusal takes the decision back with it.
  if (!theResidentsDoorsAreSettling() && isAResidencyProposal(getRecord(to.id)?.data)) {
    throw new PanelError(aResidencyProposalHasItsOwnDoors(to.title), 409, undefined, undefined, undefined, {
      code: 'residentProposalHasItsOwnDoors',
      values: {},
    })
  }

  const tail =
    `Nothing was written and the fork "${to.title}" is exactly as it was: still open, still in ` +
    `GET /api/needs-you, and still the person's to answer. The browser settles it with one button on ` +
    `the proposal's own page, which is the act this refusal is protecting.`

  // THE FOUR CLAUSES BELOW ARE SKIPPED WHEN THE REQUEST CARRIES THE PERSON'S OWN AUTHORIZATION, and
  // that authorization is only the
  // SECRETARY'S: the person's quoted words carried as a warrant, or their press of an elevation. They answer
  // the same question a warrant answers — is this fork this agent's to settle — with the one answer
  // they could not give, and all four keep their exact wording for a request that carries none. The
  // three clauses AFTER this block are not skipped and are still asked of an agent, which is why
  // this is a condition on the block rather than a return: the machine question is not one
  // anybody's words can answer.
  //
  // A WARRANT ON A WORKER'S REQUEST SKIPS NOTHING, and that is the point: the card is asked before
  // the words, so an agent that is not the secretary is refused in exactly the words it met before
  // and its warrant is never marked as used. `theSecretaryActingForThePerson` is where both halves
  // are asked once.
  //
  // IT ALSO ANSWERS CLAUSE 4, AND THAT IS DELIBERATE. Clause 4 asks what the decision stands on, and
  // `the owner said so` is the one authority an agent may not claim for itself, because claiming it
  // needs a durable record of the owner saying it. A warrant IS that record, carried on the request rather
  // than looked up: the person's words, where they said them and when, kept on the act, drawn beside it, and
  // revocable by the person in one press. A decision made on a warrant does not need an `authority` as
  // well; the warrant is a stronger one than any of the five.
  //
  // AND THEY ARE SKIPPED FOR A SECRETARY POINTING A DECISION THE OWNER ALREADY MADE AT THE FORK IT IS ABOUT.
  // That is one of a secretary's ordinary duties, with no warrant and no
  // raise. `aSecretaryMayCloseThisByTheOwnersDecision` holds the three conditions, and the queue's reader asks the
  // same decision half of them, so the door and the queue agree about the link.
  if (
    actor.type !== 'human' &&
    !theSecretaryActingForThePerson(actor) &&
    !aSecretaryMayCloseThisByTheOwnersDecision(actor, from.id, to.id)
  ) {
    const settles = whoSettlesThisFork(to.id)

    // 1. THE OWNER'S. The words this guard has always refused an agent in, unchanged.
    if (settles === THE_OWNER) {
      throw new PanelError(
        `Pointing a decision at a proposal SETTLES that fork — the link is the governance act, there is no ` +
          `stored flag beside it — and this request came from ${actor.type} "${actor.id}". ${tail} ` +
          `Filing the proposal was your part and it is done. ` +
          // AND THE PRESS, on the one card that could hold one. Criterion P59 names this refusal by
          // name: *before elevation a secretary may not … settle a fork marked for the owner, and
          // the refusal names the press*. Empty for every other caller.
          thePressThatWouldAllowThis(actor) +
          // AND THE PERSON'S WORDS, for the secretary the new rule admits. Empty for every other caller.
          theWordsThatWouldSettleThis(actor),
        403,
      )
    }

    // 2. NOBODY HAS SAID. Refused, and told what is missing rather than told it is the owner's — because it
    // is not known to be the owner's, and saying so would be inventing the classification from the refusal.
    if (settles === null) {
      throw new PanelError(
        `Pointing a decision at a proposal SETTLES that fork — the link is the governance act, there is no ` +
          `stored flag beside it — this request came from ${actor.type} "${actor.id}", and nobody has ` +
          `classified "${to.title}". Its \`who_settles_it\` field is ` +
          `not there, so nobody has said who may settle this fork. An empty field is not permission. A fork ` +
          `nobody has classified is not an agent's to close, and the person's rule is that a fork you are ` +
          `unsure about is theirs. Nothing was written: no link was made, and the fork is exactly as it was — ` +
          `still open, still in GET /api/needs-you, and still unclassified.\n\n` +
          `WHAT WOULD LET THIS THROUGH, AND IT IS NOT SOMETHING YOU CAN DO YOURSELF. Somebody has to say ` +
          `who settles this fork, and if that somebody is you it does not count: an agent that classified a ` +
          `fork and then closed it would have written its own permission. So ask THE PERSON to classify it — say on ` +
          `the record why you think it is not a governance question, in an \`annotation\` linked to the fork ` +
          `or a \`proposal\` asking them to classify it — and this link goes through afterwards, with a ` +
          `decision that carries an \`authority\`.\n\n` +
          `YOU MAY STILL CLASSIFY IT, AND IT IS WORTH DOING: ` +
          `PATCH /api/records/${to.id} {"dataPatch":{"who_settles_it":"<${FORK_SETTLERS.join(' | ')}>"}}. ` +
          `That sorts the person's queue and it tells them what you think. What it does not do is make the fork yours ` +
          `to close. Marking it "${THE_OWNER}" is the one classification that changes nothing, because that ` +
          `is what Mole Office already treats it as. ${theWordsThatWouldSettleThis(actor)}`,
        403,
      )
    }

    // 3. IT SAYS SOMEBODY ELSE, AND AN AGENT WROTE THAT ONTO IT. Refused, because the fork was
    // unclassified until an agent said otherwise, and unclassified is the owner's.
    if (anAgentGaveThisForkItsClassification(to.id)) {
      throw new PanelError(
        `Pointing a decision at a proposal SETTLES that fork — the link is the governance act, there is no ` +
          `stored flag beside it — and this request came from ${actor.type} "${actor.id}". ` +
          `${AN_AGENT_WROTE_THIS_PERMISSION(to, settles)} ${tail} ${theWordsThatWouldSettleThis(actor)}`,
        403,
      )
    }

    // 4. YOURS TO SETTLE, WITH SOMETHING UNDER IT. `authority` is what makes the record a decision
    // rather than an opinion, and it is read off the decision that is being pointed at the fork.
    const said = isJsonObject(from.data) ? from.data['authority'] : undefined
    const stands = typeof said === 'string' ? said.trim() : ''
    if (!(DECISION_AUTHORITIES as readonly string[]).includes(stands)) {
      const which = from.id === undefined ? `the decision "${from.title}"` : `decision ${from.id}`
      throw new PanelError(
        `Pointing a decision at a proposal SETTLES that fork, and a decision that does not say what it stands ` +
          `on settles nothing. "${to.title}" says ${FORK_SETTLER_MEANINGS[settles]} — so this fork IS open to ` +
          `${actor.type} "${actor.id}" — but ${which} ` +
          `${stands === '' ? 'carries no `authority`' : `says its authority is "${stands}", which is not one of the five`}. ` +
          `\`authority\` is the field that makes a decision different from an opinion, and an opinion cannot ` +
          `close a question. Nothing was written: no link was made, the decision is exactly as it was, and the ` +
          `fork is still open.\n\n` +
          `WHAT WOULD LET THIS THROUGH. Say what the decision stands on, then make this link again. ` +
          `PATCH /api/records/${from.id ?? '<the decision>'} {"dataPatch":{"authority":"<one of the five>"}}. ` +
          `THE FIVE ARE: ${theFiveAuthorities()}.`,
        403,
      )
    }
    // It said who settles it, it is not the owner, and the decision says what it stands on. The three
    // clauses below are asked of this agent as well, for the reasons written on each of them.
  }
  if (actor.stated === false) {
    throw new PanelError(
      `Pointing a decision at a proposal SETTLES that fork — the link is the governance act, there is no ` +
        `stored flag beside it — and this request sent no actor headers, so nothing said who is asking. ` +
        `Ordinary writes take that as the person typing by hand; a governance act may not, because an absent ` +
        `header is not evidence that a person made it. ${tail} ` +
        `Send x-mole-office-actor-type: human and x-mole-office-actor-id: <who you are>.`,
      403,
    )
  }
  // AND IS IT SOMEBODY MOLE OFFICE KNOWS. Asked here, with the other two actor clauses and before the
  // machine one, for the reason they give: it is true from any machine. Until this clause existed
  // the two above were the whole of the actor half, and both read a header — so a caller that typed
  // `human` and any name at all settled forks. See `isSomebodyMoleOfficeCannotPlace`.
  if (isSomebodyMoleOfficeCannotPlace(actor)) {
    throw new PanelError(
      `Pointing a decision at a proposal SETTLES that fork — the link is the governance act, there is no ` +
        `stored flag beside it — and this request was made in the name "${actor.id}", which is not somebody ` +
        `Mole Office can place. ${tail} ${ONE_PERSON_AND_THE_NAME_IS_ITS_OWN}`,
      403,
      strangerDetail(`settle fork ${to.id} with ${from.kind} "${from.title}"`, actor),
    )
  }
  // AND WHERE IT WAS ASKED FROM. The actor clauses above are true from anywhere, so they are asked
  // first: an agent is told to file a proposal instead whatever machine it is on, which is advice it
  // can act on. This one is about the machine and is the last thing asked, so it is only ever the
  // answer when the actor half has already passed.
  if (actor.from === 'another machine' && !thePersonIsProved(actor)) {
    // WHO IS IN FRONT OF IT. Until 27 August 2026 only a person could get this far, so this clause
    // said settling was the person's own act and the tail said the fork was still theirs to answer.
    // An agent settling an engineering fork reaches it now, and both of those sentences would be
    // the wrong reason to give it — a refusal that is not about what happened. The CONDITION is
    // unchanged, and so is every word a person reads.
    const person = actor.type === 'human'
    throw new PanelError(
      `${person ? `Settling a fork is the person's own act, and it` : `Settling a fork`} is done at the machine ` +
        `Mole Office runs on — pointing a decision at a proposal IS the act, there is no stored flag beside it. This ` +
        `request came from another machine. ` +
        `${person ? tail : `Nothing was written and the fork "${to.title}" is exactly as it was: still open and still unsettled.`} ` +
        `${ARRIVAL_IS_NOT_A_CLAIM} From another ` +
        `machine the fork is open to read, to argue ` +
        `with and to comment on; it is answered at the machine Mole Office is running on.`,
      403,
      arrivalDetail(`settle fork ${to.id} with ${from.kind} "${from.title}"`),
    )
  }
}

/**
 * THE OTHER TWO WAYS OUT OF THE OWNER'S QUEUE, REFUSED IN THE SAME WORDS AS THE FIRST.
 *
 * ---------------------------------------------------------------------------------------
 * THE HOLE THIS CLOSES, MEASURED ON THE LIVE CORPUS AND NOT ON A PROBE
 * ---------------------------------------------------------------------------------------
 *
 * `readForks` in lib/forks.ts has THREE exits and only one of them was guarded. `assertMaySettleFork`
 * above opens with `if (type !== RESOLVES_PROPOSAL) return`, and `RESOLVES_PROPOSAL` is
 * `derived_from`. The other two are `supersedes` onto a proposal and `duplicate_of` from one, and
 * nothing asked about either: `checkLinkKinds` only refuses `supersedes` between planned things, and
 * `assertMayShapeTheFuture` only fires when the far end is a trajectory.
 *
 * Three forks were out of the owner's queue on agent-made links on 27 August 2026, in the owner's own
 * corpus:
 *
 *     <newer> supersedes <older>        first agent, 2026-08-24 17:38:47
 *     <copy-a> duplicate_of <original>  second agent, 2026-08-27 14:35:26
 *     <copy-b> duplicate_of <original>  second agent, 2026-08-27 14:35:26
 *
 * None of the three forks stores `who_settles_it` at all, so the queue and the settling guard both
 * treat all three as the owner's. Every one of those outcomes is right on its merits, which is why nobody
 * noticed the door.
 *
 * ---------------------------------------------------------------------------------------
 * THE QUESTION IT ASKS IS THE ONE `assertMaySettleFork` ASKS, AND FOR THE SAME REASON
 * ---------------------------------------------------------------------------------------
 *
 * An agent gets three answers, read from the fork's own `who_settles_it` through
 * `whoSettlesThisFork`, which is the reader the settling guard asks:
 *
 *   1. "the owner" — refused. Taking one of the owner's forks off their queue is theirs to do, whether the link
 *      answers the question or says somebody else already has.
 *   2. nobody has said — refused. ABSENCE IS NOT PERMISSION, and the owner's rule is that a fork you
 *      are unsure about is the owner's.
 *   3. "an agent", "the parent" or "a measurement" — allowed. The fork itself says it is not the owner's.
 *
 * WHY ANSWER 3 CARRIES NO EXTRA CONDITION, SAID PLAINLY BECAUSE IT IS THE ONE PLACE THIS GUARD IS
 * NOT WORD-FOR-WORD THE SETTLING GUARD. Settling a fork an agent may settle also demands that the
 * DECISION says what it stands on — its `authority` — because a decision that stands on nothing is
 * an opinion and an opinion closes nothing. These two links have no decision in them. `supersedes`
 * runs from whatever replaced the fork and `duplicate_of` runs to whichever fork is the one to
 * answer, and neither record carries an `authority` field. Inventing a new field to demand here
 * would be a rule with nothing behind it. What the two links DO carry is the other record, by name,
 * on the fork's own page — so the claim is checkable by whoever reads it, which is what `authority`
 * buys on a decision.
 *
 * AND NEITHER OF THEM ANSWERS ANYTHING. A `supersedes` says the question was replaced; a
 * `duplicate_of` says it is asked twice and names the copy that is still open. Both leave a live
 * record a reader can follow, which a deleted fork does not.
 *
 * IT GUARDS EVERY PAIR OF KINDS, WHERE THE SETTLING GUARD GUARDS ONE. `assertMaySettleFork` returns
 * unless a decision points at a proposal, because nothing else is an exit — `proposalResolution`
 * counts decisions and no other kind. `leftTheQueueBecause` counts a `supersedes` or a
 * `duplicate_of` whatever is on the other end, so this guards whatever is on the other end too.
 *
 * WHAT IT DOES NOT REPLACE. `leftTheQueueBecause` still asks whether a HUMAN made the link, for
 * forks that are the owner's, exactly as `linkSettlesThisFork` does for the settling link. The three rows
 * above were written before this guard existed, and an archive restored tomorrow carries whatever
 * it carries.
 */
export function assertMayReplaceAFork(
  from: { id: string; kind: string; title: string },
  to: { id: string; kind: string; title: string },
  type: string,
  actor: Actor,
): void {
  const exit = LINKS_THAT_REPLACE_A_FORK.find((one) => one.type === type)
  if (exit === undefined) return
  // WHICH END IS THE FORK, from the declaration both this guard and the reader read.
  const fork = exit.forkEnd === 'to' ? to : from
  const instead = exit.forkEnd === 'to' ? from : to
  if (fork.kind !== PROPOSAL_KIND) return

  const act =
    exit.type === 'supersedes'
      ? `Saying that "${instead.title}" replaces the fork "${fork.title}" takes that fork out of the queue ` +
        `without answering it`
      : `Saying that the fork "${fork.title}" is the same question as "${instead.title}" takes that fork out of ` +
        `the queue without answering it`
  const tail =
    `Nothing was written and the fork "${fork.title}" is exactly as it was: still open, still in ` +
    `GET /api/needs-you, and still the person's to answer.`
  /** What an agent does instead, on a fork it may not take off the owner. Both links have the same answer. */
  const sayItInstead =
    `WHAT TO DO INSTEAD. Say it on the record and let the person make the link: POST /api/records ` +
    `{"kind":"annotation","title":"<short name>","data":{"body":"<why these two are one question, or what ` +
    `replaced this one>"}} then POST /api/links {"fromId":"<the annotation>","toId":"${fork.id}","type":"about"}. ` +
    `The person sees it on the fork's own page, and joining them stays one request for them.`

  // AND THE PERSON'S PRESS ANSWERS IT, exactly as their quoted words do. Criterion P59: an elevation gives the
  // person's own acts, and this is one of them — `actKey` on this guard's entry in GOVERNANCE_GUARDS
  // is the act, and the declaration files that act under the power an elevation hands over. The
  // refusal below is unchanged for a request with no warrant and no elevation.
  if (actor.type !== 'human' && actsForThePerson(actor)) return
  if (actor.type !== 'human') {
    const settles = whoSettlesThisFork(fork.id)

    // 1. THE OWNER'S. Refused in the words the settling link is refused in, because it is the same act:
    // the fork stops waiting on the owner and nobody answered it.
    if (settles === THE_OWNER) {
      throw new PanelError(
        `${act}, and this request came from ${actor.type} "${actor.id}". This fork says "${THE_OWNER}" settles ` +
          `it, and taking it off the person's queue is the same act as settling it whichever link does it. ${tail}\n\n` +
          `${sayItInstead}`,
        403,
      )
    }

    // 2. NOBODY HAS SAID. Told what is missing rather than told it is the owner's, because it is not KNOWN
    // to be the owner's and saying so would be inventing the classification out of the refusal.
    if (settles === null) {
      throw new PanelError(
        `${act}, this request came from ${actor.type} "${actor.id}", and nobody has classified ` +
          `"${fork.title}". Its \`who_settles_it\` field is not there, so nobody has said who may take this fork ` +
          `off the queue. An empty field is not permission, and the person's rule is that a fork you are unsure ` +
          `about is theirs. ${tail}\n\n` +
          `WHAT WOULD LET THIS THROUGH, AND IT IS NOT SOMETHING YOU CAN DO YOURSELF. Somebody has to say ` +
          `who settles this fork, and if that somebody is you it does not count: an agent that classified a ` +
          `fork and then took it off the queue would have written its own permission. Ask the person to classify it.\n\n` +
          `YOU MAY STILL CLASSIFY IT, AND IT IS WORTH DOING: ` +
          `PATCH /api/records/${fork.id} {"dataPatch":{"who_settles_it":"<${FORK_SETTLERS.join(' | ')}>"}}. ` +
          `That sorts the person's queue and tells them what you think. What it does not do is make the fork yours to ` +
          `take off it.\n\n${sayItInstead}`,
        403,
      )
    }
    // 3. IT SAYS SOMEBODY ELSE, AND AN AGENT WROTE THAT ONTO IT. Refused, in the words the settling
    // guard refuses it in, because it is the same act: an agent wrote its own permission.
    if (anAgentGaveThisForkItsClassification(fork.id)) {
      throw new PanelError(
        `${act}, and this request came from ${actor.type} "${actor.id}". ` +
          `${AN_AGENT_WROTE_THIS_PERMISSION(fork, settles)} ${tail}\n\n${sayItInstead}`,
        403,
      )
    }
    // NOT THE OWNER'S, AND THE FORK ITSELF SAYS SO. The three clauses below are asked of this agent as well,
    // for the reasons written on each of them.
  }
  if (actor.stated === false) {
    throw new PanelError(
      `${act}, and this request sent no actor headers, so nothing said who is asking. Ordinary writes take that ` +
        `as the person typing by hand; emptying somebody's queue may not, because an absent header is not ` +
        `evidence that a person made the write. ${tail} ` +
        `Send x-mole-office-actor-type: human and x-mole-office-actor-id: <who you are>.`,
      403,
    )
  }
  // AND IS IT SOMEBODY MOLE OFFICE KNOWS. Asked with the actor clause above and before the machine one,
  // for the reason `assertMaySettleFork` gives: it is true from any machine.
  if (isSomebodyMoleOfficeCannotPlace(actor)) {
    throw new PanelError(
      `${act}, and this request was made in the name "${actor.id}", which is not somebody Mole Office can place. ` +
        `${tail} ${ONE_PERSON_AND_THE_NAME_IS_ITS_OWN}`,
      403,
      strangerDetail(`take fork ${fork.id} off the queue with a ${exit.type} link`, actor),
    )
  }
  // AND WHERE IT WAS ASKED FROM, last, because the clauses above hold from any machine and this one
  // does not.
  if (actor.from === 'another machine' && !thePersonIsProved(actor)) {
    throw new PanelError(
      `${act}, and that is done at the machine Mole Office runs on. This request came from another machine. ${tail} ` +
        `${ARRIVAL_IS_NOT_A_CLAIM} From another machine the fork is open to read, to argue with and to comment ` +
        `on; what leaves the queue is decided at the machine Mole Office is running on.`,
      403,
      arrivalDetail(`take fork ${fork.id} off the queue with a ${exit.type} link`),
    )
  }
}

/**
 * The field on a proposal that says who may settle it.
 *
 * ONE SPELLING, because four things read it now: the reader below, the guard that refuses an agent
 * writing it, the guard that refuses an agent taking the fork away, and the reader that asks who put
 * the value there. The key itself is declared on the `proposal` kind in src/shared/kinds.ts and
 * served at GET /api/kinds; this is the one place in the server that names it.
 */
export const WHO_SETTLES_IT = 'who_settles_it'

/**
 * WHO THE FORK ITSELF SAYS MAY SETTLE IT, read from the stored record and from nowhere else.
 *
 * `null` is the fifth answer and it is a real one: NOBODY HAS SAID. It is returned three ways — the
 * field is not there, the field holds a word that is not one of the four, or no live record answers
 * to that id — and none of the three is permission. Nothing here reads the question, the title or
 * the kind to fill a value in; `FORK_SETTLERS` in @shared/kinds.ts says why that matters.
 *
 * IT READS THE STORED ROW RATHER THAN TAKING THE FIELD FROM A CALLER, because `assertMaySettleFork`
 * turns the answer into permission. A caller that could hand this over would be handing the guard
 * its own answer to the question the guard is asking.
 *
 * THE FIELD IT READS IS GUARDED. `assertMayReclassifyAFork` refuses an agent that would change
 * `who_settles_it` away from "the owner", because a guard that reads a field anybody may write is
 * not a guard. Classifying a fork nobody has classified is open to agents and always was.
 *
 * EVERYTHING THAT ASKS WHO SETTLES A FORK ASKS HERE. `assertMaySettleFork` above turns the answer
 * into permission. `priorityOf` in lib/forks.ts orders the owner's queue by it, and `readForks`
 * writes the sentence a person reads from it. `priorityOf` used to work it out for itself —
 * `fields['who_settles_it'] === THE_OWNER` — which was one fact in two places with nothing making
 * them agree; that reading moved onto this function on 27 August 2026.
 */
export function whoSettlesThisFork(proposalId: string): ForkSettler | null {
  const fork = getRecord(proposalId)
  if (fork === null || fork.deletedAt !== null) return null
  const said = isJsonObject(fork.data) ? fork.data[WHO_SETTLES_IT] : undefined
  if (typeof said !== 'string') return null
  return (FORK_SETTLERS as readonly string[]).includes(said) ? (said as ForkSettler) : null
}

/**
 * DID AN AGENT WRITE THIS FORK'S CLASSIFICATION ONTO A FORK THAT WAS FILED WITHOUT ONE?
 *
 * ---------------------------------------------------------------------------------------
 * THE HOLE THIS ANSWERS, EXECUTED OVER HTTP ON 27 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * Three requests, all from an agent, on a fork nobody had classified. Every one of them was allowed
 * on purpose, and together they took the fork out of every fork reading in Mole Office:
 *
 *     PATCH /api/records/<record> {"dataPatch":{"who_settles_it":"an agent"}}   200, queue 27 -> 26
 *     POST  /api/links <its own decision> --derived_from--> <record>           201
 *     DELETE /api/records/<record>                                             200
 *
 * `assertMaySettleFork` reads `who_settles_it` to decide whether an agent may settle a fork. An
 * agent wrote that field itself, one request earlier, on a fork the same guard had been refusing.
 * That is an agent granting itself the authority and then using it. The full account is
 * `design/round-eleven/wave-b/attack.md`, section 1b.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS REFUSED IS THE SETTLING, NOT THE CLASSIFYING
 * ---------------------------------------------------------------------------------------
 *
 * Classifying a fork nobody has classified stays open to agents, in every direction, and that has
 * not changed: it is how the queue gets sorted and it is what the sweep does. What changed is that
 * a classification an agent wrote onto an already-filed fork is no longer read as permission. The
 * fork goes on being treated as the owner's, exactly as it was before the agent wrote the field.
 *
 * A FORK FILED CARRYING THE CLASSIFICATION IS NOT THIS. An agent that files a proposal saying "an
 * agent settles this" has said so from the start, in the open, and settling it is the behaviour
 * commit 4941899 built and defended. Nothing was taken off anybody, because the fork was never in
 * the owner's queue unclassified. So the question here is narrow: was the value written onto a fork that
 * already existed without it?
 *
 * ---------------------------------------------------------------------------------------
 * READ FROM THE REVISION LEDGER, WHICH IS WHERE `assertMayRemoveAnAsk` ALREADY READS IT
 * ---------------------------------------------------------------------------------------
 *
 * `whoWroteTheValue` in lib/revisions.ts answers "who put the value this field holds now there",
 * and the long comment on it says why the change log cannot: a value that arrived at creation has
 * no change row, and a field write is logged in three different spellings. `saveRevision` stores
 * the whole record on every write, so the ledger has one shape and no hole. `assertMayRemoveAnAsk`
 * asks it the same question about `whose_move`, and this is that question about `who_settles_it`.
 *
 * `numbering` gives the record's lowest revision number. The value was there when the ledger begins
 * exactly when the revision that set it IS the lowest one.
 *
 * A LEDGER THAT CANNOT SAY ANSWERS TRUE, and that is the fifth rule rather than a guess. If nothing
 * says who wrote the classification, nobody has said, and nobody-has-said is the owner's. Every fork
 * in this corpus carrying the field has a real revision: `who_settles_it` was declared on 27 August
 * 2026, long after the revision backfill, so no fork can carry it with only a baseline revision
 * behind it.
 */
export function anAgentGaveThisForkItsClassification(proposalId: string): boolean {
  const settles = whoSettlesThisFork(proposalId)
  if (settles === null || settles === THE_OWNER) return false
  const wrote = whoWroteTheValue(proposalId, WHO_SETTLES_IT, settles)
  if (wrote === null) return true
  if (wrote.actorType === 'human') return false
  // AND AN AGENT THAT WROTE IT BECAUSE THE OWNER SAID SO DID NOT WRITE ITS OWN PERMISSION. This clause was
  // added on 3 September 2026, with the warrant. The whole argument for reading a fork the way it
  // was read before an agent classified it is that the agent granted itself the authority; an agent
  // quoting THE OWNER saying who settles the fork granted itself nothing, and the write door had already
  // let that through. Without this the door allowed the write and the reading ignored it, so the owner's own
  // list did not shrink after the acts the person's words authorised.
  if (wrote.onTheOwnersWords) return false
  return wrote.seq !== numbering(proposalId).lowest
}

/**
 * WAS THIS FORK HANDED TO SOMEBODY ELSE ON THE OWNER'S OWN WORDS?
 *
 * The same reading `anAgentGaveThisForkItsClassification` makes, asked as its own question, because
 * the waiting list has to say WHY a fork left it and "the owner said so" is a different sentence from "it
 * was always somebody else's". One function, two callers, so the count and the guard cannot come to
 * different conclusions about one fork.
 */
export function forkWasHandedOverOnTheOwnersWords(proposalId: string): boolean {
  const settles = whoSettlesThisFork(proposalId)
  if (settles === null || settles === THE_OWNER) return false
  const wrote = whoWroteTheValue(proposalId, WHO_SETTLES_IT, settles)
  return wrote !== null && wrote.actorType !== 'human' && wrote.onTheOwnersWords
}

/**
 * THE REFUSAL WHEN AN AGENT WROTE THE PERMISSION IT IS TRYING TO USE. One wording, three doors.
 *
 * `assertMaySettleFork`, `assertMayReplaceAFork` and `assertMayPutAForkBackOnTheQueue` all refuse
 * the same act for the same reason, so they say it in the same words. Three copies of one paragraph
 * would drift, and the reader would get three accounts of one rule.
 */
const AN_AGENT_WROTE_THIS_PERMISSION = (
  fork: { id: string; title: string },
  settles: ForkSettler,
): string =>
  `"${fork.title}" says "${settles}" settles it, and an agent wrote that onto the fork AFTER it was filed. ` +
  `Until then nobody had classified it, and a fork nobody has classified is the person's. An agent writing the field ` +
  `that decides whether an agent may close a fork is the agent granting itself the authority, so Mole Office ` +
  `reads this fork the way it read it before the field was written: as the person's.\n\n` +
  `WHAT IS NOT REFUSED, AND IT IS MOST OF THIS FIELD. Classifying a fork nobody has classified is still ` +
  `open to you, in every direction, and so is handing one to the person: ` +
  `PATCH /api/records/${fork.id} {"dataPatch":{"who_settles_it":"<${FORK_SETTLERS.join(' | ')}>"}}. What ` +
  `it no longer does is let you close the fork you have just classified.\n\n` +
  `WHAT WOULD LET THIS THROUGH. Ask the person to classify it — an \`annotation\` on the fork saying why it is ` +
  `not a governance question, or a \`proposal\` asking them to reclassify it. A classification THE PERSON wrote is ` +

  `authority, and so is one the fork was filed with. One you wrote a moment ago is not.`

/**
 * IS THIS FORK THE OWNER'S TO SETTLE? One question, one reader, asked by the queue and by all four
 * guards that stand in front of it.
 *
 * THREE ANSWERS MEAN YES.
 *
 *   1. The fork says `the owner` outright.
 *   2. NOBODY HAS SAID. The owner's rule is that a fork you are unsure about is the owner's, and absence is
 *      not permission.
 *   3. The fork says somebody else, AND AN AGENT WROTE THAT ONTO IT after it was filed. The fork was
 *      the owner's under answer 2 until the agent wrote the field, and an agent cannot change that by
 *      writing the field. See `anAgentGaveThisForkItsClassification` above.
 *
 * IT LIVES HERE RATHER THAN IN lib/forks.ts, WHERE IT USED TO BE, and the move is the point. It was
 * `onlyAPersonMaySettle` in the queue reader, so the guards had one way of asking whose fork it is
 * and the queue had another. The same fact worked out in two places is this repository's named
 * recurring defect, and having it on the one access control in the product is the worst place for
 * it. Now the queue imports this.
 */
export function forkIsTheOwnersToSettle(proposalId: string): boolean {
  const settles = whoSettlesThisFork(proposalId)
  if (settles === null || settles === THE_OWNER) return true
  return anAgentGaveThisForkItsClassification(proposalId)
}

/**
 * Did a HUMAN make this one link?
 *
 * READ OFF THE LINK ROW WHERE IT RECORDED IT, AND OFF THE CHANGE LOG WHERE IT DID NOT. Since
 * migration 0193 `createLink` writes `links.created_by_type` beside the id, and that answers the
 * question for every link written since. `links.createdBy` alone cannot distinguish a person from an agent.
 * A link written before holds NULL there, and for it the change log is read: `logChange` records
 * `actorType` and `actorId` for every write, and a link is logged on the record it points FROM with
 * the link type as the field and the other end as the new value.
 *
 * IT TAKES THE LINK'S OWN THREE FIELDS — from, type, to — rather than a proposal and a decision.
 * Until 27 August 2026 it took the pair and wrote `derived_from` into the query itself, and that is
 * why the other two ways out of the queue could not be asked the same question: there was nowhere to
 * put the type. `humanLinked` in lib/forks.ts is the settling case and is the only caller that names
 * a type.
 *
 * IT MOVED HERE FROM lib/forks.ts ON 27 AUGUST 2026, beside `logChange`, which writes the rows it
 * reads. The guards need it too — `assertMayPutAForkBackOnTheQueue` asks whether a person made the
 * link an agent wants to remove — and a second copy in this file would be the recurring defect.
 */
export function humanMadeThisLink(fromId: string, type: string, toId: string): boolean {
  // THE LINK ROW FIRST, where it recorded who made it (migration 0193). A link
  // written before that holds NULL there, and only then is the change log asked.
  const stored = whoMadeTheLinkRow().get({ fromId, type, toId })
  const recorded = stored === undefined ? null : readCreatedByType(stored.createdByType)
  if (recorded !== null) return recorded === 'human'
  const rows = db
    .select({ actorType: changes.actorType })
    .from(changes)
    .where(
      and(
        eq(changes.recordId, fromId),
        eq(changes.op, 'link'),
        eq(changes.field, type),
        eq(changes.newValue, toId),
      ),
    )
    .all()
  return rows.some((row) => row.actorType === 'human')
}

/**
 * Who the one link row says made it. Kept, because the waiting list asks it for each fork
 * (src/server/db/kept-statement.ts).
 */
const whoMadeTheLinkRow = keptStatement(() =>
  db
    .select({ createdByType: links.createdByType })
    .from(links)
    .where(
      and(
        eq(links.fromId, sql.placeholder('fromId')),
        eq(links.type, sql.placeholder('type')),
        eq(links.toId, sql.placeholder('toId')),
      ),
    )
    .prepare(),
)

/**
 * DOES THIS ONE LINK TAKE THAT FORK OFF THE QUEUE? One question, asked of all three ways out.
 *
 * The three ways out of the owner's queue are `derived_from` from a decision, which answers the
 * fork; `supersedes` from something that replaced it; and `duplicate_of` to the fork that is the one
 * to answer. All three end with the fork no longer waiting on anybody, so all three are asked the
 * same question here, and `assertMaySettleFork` and `assertMayReplaceAFork` ask the same question at
 * the write door.
 *
 * UNTIL 27 AUGUST 2026 ONLY THE FIRST WAS ASKED. `theLinkThatTookThisForkOffTheQueue` below counted
 * a `supersedes` or a `duplicate_of` whoever made it, so a fork that was the person's left their queue
 * on an agent's say-so while a `derived_from` from the same agent did not. Three such links were in
 * the live corpus when this was written and all three are on forks nobody has classified.
 */
export function linkTakesThisForkOffTheQueue(
  proposalId: string,
  fromId: string,
  type: string,
  toId: string,
): boolean {
  if (!forkIsTheOwnersToSettle(proposalId)) return true
  return (
    humanMadeThisLink(fromId, type, toId) ||
    linkMadeOnTheOwnersAuthorization(fromId, type, toId) ||
    (type === RESOLVES_PROPOSAL && aSecretaryClosedItByTheOwnersDecision(fromId, toId))
  )
}

/**
 * IS THIS A DECISION THE OWNER ALREADY MADE, NAMING THIS RECORD? A live decision whose `decided_by` is the owner, and
 * which names the record (`theDecisionNamesThisFork`, whose reading is the same for any id). This is the decision
 * check shared by closing
 * a fork and confirming a goal as a secretary.
 *
 * `decided_by` is what the decision says, and an agent may write "the owner" there only with "the owner said so"
 * and a live record carrying the person's words (`assertMayDecide`). That is the guard on the claim; this reads it.
 */
export function aDecisionTheOwnerMadeThatNames(decisionId: string, recordId: string): boolean {
  const decision = getRecord(decisionId)
  if (decision === null || decision.deletedAt !== null || decision.kind !== DECISION_KIND) return false
  if (!isJsonObject(decision.data) || decision.data['decided_by'] !== THE_OWNER) return false
  return theDecisionNamesThisFork(decision, recordId)
}

/**
 * MAY THIS AGENT CLOSE THE FORK BY THIS DECISION, WITH NO WARRANT AND NO RAISE? Closing a proposal by a decision
 * the owner already made is one of a secretary's
 * ordinary duties. All three must hold:
 *
 *   · the caller holds the secretary card on a live, unretired registry row (`theSecretaryOfThisOffice`, the reading
 *     the problem close uses);
 *   · the decision is stored already, so it has an id; a decision only described, as the waiting probe asks, is not;
 *   · it is a decision the owner made, about this fork (`aDecisionTheOwnerMadeThatNames`).
 *
 * An agent's own decision, a caller with another card, and a decision that does not name the fork are refused by the
 * clauses after this, in the words they always had.
 */
function aSecretaryMayCloseThisByTheOwnersDecision(actor: Actor, decisionId: string | undefined, proposalId: string): boolean {
  if (decisionId === undefined || !theSecretaryOfThisOffice(actor)) return false
  return aDecisionTheOwnerMadeThatNames(decisionId, proposalId)
}

/**
 * WAS THIS SETTLING LINK A SECRETARY CLOSING THE FORK BY THE OWNER'S DECISION? The queue's half of
 * `aSecretaryMayCloseThisByTheOwnersDecision`, read off the link row.
 *
 * THE DECISION HALF IS ASKED AGAIN, so a decision deleted, or changed so it no longer says the owner made it or no
 * longer names the fork, stops settling it. THE CARD IS READ OFF THE REGISTRY ROW OF WHOEVER MADE THE LINK, retired or
 * not: retiring a secretary does not undo what it did while it held the card. A link an agent with any other card made
 * does not count, so an old link from before the door existed does not count on the decision alone.
 */
function aSecretaryClosedItByTheOwnersDecision(decisionId: string, proposalId: string): boolean {
  if (!aDecisionTheOwnerMadeThatNames(decisionId, proposalId)) return false
  if (!theRoleCardsAreRead()) return false
  const card = theRoleCards().elevation.onlyThisCardCanHoldIt
  const row = db
    .select({ createdBy: links.createdBy, createdByType: links.createdByType })
    .from(links)
    .where(and(eq(links.fromId, decisionId), eq(links.type, RESOLVES_PROPOSAL), eq(links.toId, proposalId)))
    .get()
  if (row === undefined || readCreatedByType(row.createdByType) !== 'agent') return false
  const who = participantForActor({ type: 'agent', id: row.createdBy })
  const agent = who === null || who.kind !== 'agent' ? null : (readParticipant(who) as RegisteredAgent | null)
  return agent !== null && agent.role === card
}

/**
 * WAS THIS LINK MADE ON THE OWNER'S OWN AUTHORIZATION — their quoted words, or their press? Read off the
 * change row the link wrote.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT COUNTS EXACTLY AS A PERSON'S LINK DOES
 * ---------------------------------------------------------------------------------------
 *
 * `assertMaySettleFork` lets an agent carrying a warrant settle a fork that is the owner's, and
 * until 3 September 2026 the reading did not know that: the write went through and the fork stayed
 * on the owner's list and on the fork desk as open. Measured on a copy of the live database that day —
 * twelve forks promoted on the person's words, all twelve still on `GET /api/waiting` under `settle`. The
 * door and the reading disagreeing about one governance act is this repository's named recurring
 * defect standing in front of the owner's own queue, which is where it costs the most.
 *
 * THE ELEVATION IS THE SECOND KEY, and it was left out until 15 September 2026. `theWordsAllowThis`
 * marks a request that carried a warrant and `actsForThePerson` marks one that spent an elevation;
 * both marks are written to the change row, but this reader asked only about the warrant. So a
 * secretary acting for the person by their press could settle a fork and leave it on their list. Both
 * forms of authorization count, so both are read here.
 *
 * IT IS ASKED OF ALL THREE EXITS AND NOT ONLY OF THE SETTLING LINK, because this is the one reader
 * of "does this link take that fork off the queue" and every caller has to get the same answer —
 * the desk, the owner's list, and `assertMayPutAForkBackOnTheQueue`, which refuses an agent removing
 * a link that is doing something. A warranted `supersedes` cannot be made today, so for those two
 * types this clause is never true; stating the rule once is smaller than stating it for one type and
 * leaving the other two to a second reader.
 *
 * IT READS THE CHANGE ROW, exactly as `humanMadeThisLink` does and for the same reason: a link row
 * stores an actor id with no type and carries no warrant, and `logChange` records both on the
 * record the link points FROM, with the link type as the field and the other end as the new value.
 */
function linkMadeOnTheOwnersAuthorization(fromId: string, type: string, toId: string): boolean {
  const rows = theAuthorityOnTheLinkWrites().all({ fromId, type, toId })
  return rows.some((row) => row.warrant !== null || row.elevation !== null)
}

/** The warrant and the raise on each change row that wrote the one link. Kept, as `whoMadeTheLinkRow` is. */
const theAuthorityOnTheLinkWrites = keptStatement(() =>
  db
    .select({ warrant: changes.warrant, elevation: changes.elevation })
    .from(changes)
    .where(
      and(
        eq(changes.recordId, sql.placeholder('fromId')),
        eq(changes.op, 'link'),
        eq(changes.field, sql.placeholder('type')),
        eq(changes.newValue, sql.placeholder('toId')),
      ),
    )
    .prepare(),
)

/**
 * DOES THIS ONE DECISION'S LINK SETTLE THAT FORK? Asked of one pair, so the count and the list of
 * settled forks cannot disagree about which link did it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A HUMAN LINK IS DEMANDED FOR SOME FORKS AND NOT FOR OTHERS
 * ---------------------------------------------------------------------------------------
 *
 * FOR A FORK THAT IS THE PERSON'S, ONLY A LINK A HUMAN MADE COUNTS, and the argument for that has
 * not changed. An independent reviewer executed both directions of the attack it stops: an agent
 * pointing an unrelated human decision at a fork with `derived_from`, so the fork vanishes from the
 * queue without anybody having decided anything; and deleting the link of a genuinely settled fork
 * to put it back. `assertMaySettleFork` refuses the first write and
 * `assertMayPutAForkBackOnTheQueue` refuses the second, but rows written before those gates existed
 * are in the live corpus, and an archive restored tomorrow carries whatever it carries. A reader
 * that trusted the gate for those rows would be trusting a gate that was not standing when they
 * were made.
 *
 * FOR A FORK THAT IS NOT THE OWNER'S, A HUMAN LINK IS NOT WHAT SETTLES IT, so demanding one made the whole
 * classification a no-op: an agent could write the decision, could make the link, and the fork
 * stayed in `GET /api/needs-you` while `proposalResolution` said it was resolved. Two readers of one
 * fact, able to disagree, which is this repository's named recurring defect.
 *
 * THE ASYMMETRY IS NOT A WEAKER RULE, IT IS A YOUNGER ONE. `who_settles_it` was added on 27 August
 * 2026, after `assertMaySettleFork` was already standing in front of this link. So no fork can say
 * `an agent` and carry a settling link from before the gate: the classification cannot be older
 * than the guard. There is nothing here for a reader to defend against that the write door did not
 * already refuse.
 */
export function linkSettlesThisFork(proposalId: string, decisionId: string): boolean {
  return linkTakesThisForkOffTheQueue(proposalId, decisionId, RESOLVES_PROPOSAL, proposalId)
}

/**
 * Has whoever may settle this fork settled it? The one answer to the governance question, in one
 * place, and it reads the fork to find out who that is.
 *
 * Exported because three callers ask it: the fork reading in lib/forks.ts, the apply route — a
 * change set may only be applied after the fork it belongs to has been decided — and
 * `assertMayRemoveAFork` below, which lets a fork that is not the owner's and has been answered go. Two
 * functions answering it would be the recurring defect on the governance surface.
 *
 * IT WAS CALLED `settledByHuman` UNTIL 27 AUGUST 2026 and the name was the whole bug. A fork the
 * corpus marks `an agent` is not settled by a human making a link, so the queue never let one go.
 */
export function forkIsSettled(
  proposalId: string,
  resolution: { by: { id: string; deleted: boolean }[] },
): boolean {
  return resolution.by.some((d) => !d.deleted && linkSettlesThisFork(proposalId, d.id))
}

/** The record at the far end of an exit link, so a deleted one can be told apart from live work. */
const recordAtTheFarEnd = alias(records, 'the_other_end_of_a_fork_exit')

/**
 * WHY A FORK LEFT THE QUEUE WITHOUT BEING ANSWERED, or null when it has not left that way.
 *
 * A LINK TO A DELETED RECORD IS NOT AN EXIT. `shared/attention.ts` takes the same view and says why:
 * a link whose other end is deleted is a fact about the archive, not a live claim. A fork whose
 * replacement was deleted is waiting on somebody again, which is the honest answer.
 *
 * THE NEWEST ONE WINS WHEN THERE ARE SEVERAL, and it is not a judgement: two records claiming to
 * replace one fork is a real state and the reader has to name one of them, so it names the most
 * recent link and the older ones are still on the record's own page.
 *
 * AND WHOSE LINK COUNTS, WHICH IS THE SAME QUESTION THE SETTLING LINK IS ASKED. On a fork that is
 * the person's, only a link a human made takes it out of the queue; on a fork the corpus says
 * somebody else settles, any link counts. Both halves are `linkTakesThisForkOffTheQueue` above.
 *
 * THE TWO TYPES ARE READ FROM `LINKS_THAT_REPLACE_A_FORK`, which the write guard reads too, so a
 * third way out cannot be opened in one of them and not the other.
 *
 * IT MOVED HERE FROM lib/forks.ts ON 27 AUGUST 2026, where it was called `leftTheQueueBecause`.
 * `assertMayRemoveAFork` has to know whether a fork has already left the queue, because it was
 * telling people it had not. lib/forks.ts still writes the sentence a person reads from what this
 * returns; the fact is worked out once, here.
 */
export function theLinkThatTookThisForkOffTheQueue(proposalId: string): ReplacingLink | null {
  return newestOf(everyLinkThatSaysSomethingReplacedThisFork(proposalId).filter((link) => link.counted))
}

/**
 * A LINK THAT SAYS SOMETHING REPLACED THIS FORK, AND WHETHER IT COUNTED.
 *
 * `counted` is the difference between a fork that has left the queue and a fork somebody SAID had
 * left it. On a fork that is the owner's, only a link a human made counts; on a fork the corpus says
 * somebody else settles, any link counts. `linkTakesThisForkOffTheQueue` is the one reader of that.
 */
export interface ReplacingLink {
  why: (typeof LINKS_THAT_REPLACE_A_FORK)[number]['why']
  insteadId: string
  insteadTitle: string
  linkedBy: string
  /** Whether `linkedBy` is a person, an agent or the office. Null when the link never recorded it. */
  linkedByType: ActorType | null
  linkedAt: string
  counted: boolean
}

/**
 * EVERY LINK SAYING SOMETHING REPLACED THIS FORK, counted or not, out of one query.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE ONES THAT DID NOT COUNT ARE RETURNED RATHER THAN DROPPED IN THE QUERY
 * ---------------------------------------------------------------------------------------
 *
 * A link that does not count is not a link that does not exist. One proposal has carried
 * a `supersedes` link from another record since 24 August 2026; the link was made by an agent, the
 * fork says the owner settles it, and the reader is right to ignore it — an agent that could take a
 * fork off the owner's queue with a link would have the settling act by another door. But nothing said so.
 * The fork sat on the owner's list for ten days with a stored answer beside it that no surface mentioned,
 * and `GET /api/forks` went on promising in its own description that a superseded fork leaves.
 *
 * So both are read here and the caller decides. `theLinkThatTookThisForkOffTheQueue` takes the ones
 * that counted, which is what it always did. lib/forks.ts takes the ones that did not and puts them
 * on the fork's row, so a question something already answered says so on the owner's own desk.
 *
 * ONE QUERY FOR BOTH, deliberately: two loops over `LINKS_THAT_REPLACE_A_FORK` asking the same two
 * columns would be the same fact worked out in two places, and the second could go on counting a
 * link the first had stopped counting.
 */
export function everyLinkThatSaysSomethingReplacedThisFork(proposalId: string): ReplacingLink[] {
  const found: ReplacingLink[] = []
  for (const exit of LINKS_THAT_REPLACE_A_FORK) {
    const rows = theLinksWithTheForkAt[exit.forkEnd]().all({ fork: proposalId, type: exit.type })
    for (const row of rows) {
      // THE WORD A PERSON READS, FROM THE SAME DECLARATION. lib/forks.ts writes one sentence for
      // each, and they say different things: something replaced this fork, or this fork is the same
      // question as another one that is still open.
      found.push({
        why: exit.why,
        insteadId: row.id,
        insteadTitle: row.title,
        linkedBy: row.by,
        linkedByType: readCreatedByType(row.byType),
        linkedAt: row.at,
        counted: linkTakesThisForkOffTheQueue(proposalId, row.fromId, exit.type, row.toId),
      })
    }
  }
  return found
}

/**
 * THE LINKS OF ONE TYPE THAT HAVE THE FORK AT ONE END, kept, because the waiting list asks for them for each fork
 * twice (src/server/db/kept-statement.ts). One query for each end the fork can be on, since that changes which column
 * is compared; the fork and the link type are the values that change between calls.
 */
const theLinksWithTheForkAt = {
  to: theLinksOfOneTypeWithTheForkAt('to'),
  from: theLinksOfOneTypeWithTheForkAt('from'),
}

function theLinksOfOneTypeWithTheForkAt(forkEnd: 'from' | 'to') {
  return keptStatement(() => {
    // WHICH COLUMN HOLDS THE FORK AND WHICH HOLDS THE OTHER RECORD, from the declared end.
    const forkColumn = forkEnd === 'to' ? links.toId : links.fromId
    const otherColumn = forkEnd === 'to' ? links.fromId : links.toId
    return db
      .select({
        id: recordAtTheFarEnd.id,
        title: recordAtTheFarEnd.title,
        by: links.createdBy,
        byType: links.createdByType,
        at: links.createdAt,
        fromId: links.fromId,
        toId: links.toId,
      })
      .from(links)
      .innerJoin(recordAtTheFarEnd, eq(otherColumn, recordAtTheFarEnd.id))
      .where(
        and(
          eq(forkColumn, sql.placeholder('fork')),
          eq(links.type, sql.placeholder('type')),
          isNull(recordAtTheFarEnd.deletedAt),
        ),
      )
      .prepare()
  })
}

/** The most recent of several, or null. Newest first, then by id so two reads cannot swap a pair. */
export function newestOf(found: readonly ReplacingLink[]): ReplacingLink | null {
  return (
    [...found].sort((a, b) => b.linkedAt.localeCompare(a.linkedAt) || a.insteadId.localeCompare(b.insteadId))[0] ??
    null
  )
}

/** Written once, because three refusals end by telling the agent what the five words are. */
export function theFiveAuthorities(): string {
  return DECISION_AUTHORITIES.map((word) => `"${word}" — ${DECISION_AUTHORITY_NEEDS[word]}`).join('; ')
}

/**
 * AN AGENT MAY DECIDE WHAT IT CAN CITE, AND MAY TRANSCRIBE WHAT THE OWNER SAID.
 *
 * Three rules, and a person passes all three by being a person:
 *
 *   1. A decision with NO authority is refused. This is the one place in Mole Office where a missing
 *      field is not a real answer, and the reason is that the field is what makes the record
 *      different from an opinion.
 *   2. An agent may write a decision it made ITSELF — `decided_by` is its own handle — on any of
 *      the four evidence authorities. Not on "the owner said so": the owner's word means they decided it.
 *   3. An agent may write a decision the OWNER made — `decided_by` is "the owner" — only with
 *      authority "the owner said so" AND an `authority_reference` that answers to a live record.
 *      A reference nobody can open is a claim about the owner nobody can check.
 *
 * A PERSON MAY WRITE ANY OF THEM, INCLUDING WITH NO AUTHORITY, because a person deciding because
 * they feel like it is a decision and it is theirs.
 */
/**
 * Whether a write would change the words the person added to a decision after making it. M83.
 *
 * IT COMPARES AGAINST WHAT IS STORED, because a patch reaches the guard already merged: an agent
 * sending no `words_since` at all arrives here carrying the stored one, and refusing that would
 * refuse every legitimate change to a decision.
 */
export function wordsSinceChanged(subject: string, incoming: Record<string, unknown>): boolean {
  const held = getRecord(subject)
  const before = held === null ? undefined : (held.data as Record<string, unknown>)['words_since']
  const after = incoming['words_since']
  if (after === undefined) return false
  return JSON.stringify(before ?? null) !== JSON.stringify(after)
}
