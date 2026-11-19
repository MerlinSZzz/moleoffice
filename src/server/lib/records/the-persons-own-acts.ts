// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON'S OWN ACTS: the shared refusal for a caller that has not proved it is the person, the
 * guards on dismissing a restriction, changing a canonical method, deciding, pinning or reclassifying
 * a fork, and taking a record out of its kind. They were moved out of src/server/lib/records.ts with
 * no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`; the governance guards
 * import all seven names from this file. This file reads `assertMayWrite` from ./may-write.ts inside a
 * function body only, and imports each other name from the file where it lives.
 */
import { AGENT_AUTHORITIES, DECISION_AUTHORITIES, FORK_SETTLERS, THE_OWNER } from '@shared/kinds.ts'
import { DECISION_KIND } from '@shared/decision-kind.ts'
// THE FOUR ACTS THAT LOOK LIKE DECIDING, written once. Criterion P90: the promote door's refusal and
// the decision guard's refusal both read this table, so the blanket refusal that stopped an agent's
// session cannot come back in one of them alone.
import { theFourActs } from '@shared/governance-acts.ts'
import { THE_LIMIT_ON_A_GOVERNANCE_ACT } from '@shared/person.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import type { PanelRecord, RecordKind } from '@shared/types.ts'
import { kindWord } from '@shared/words.ts'
import { isJsonObject } from '../../db/the-decision-names-this-fork.ts'
import { whoWroteTheValue } from '../../db/who-wrote-the-value.ts'
import { theRefusalForSomebodyNotProvedThePerson, whatThisRequestShowed } from '../not-proved-the-person.ts'
import { PanelError } from '../panel-error.ts'
import { assertMayWrite } from './may-write.ts'
import type { Actor } from './actor.ts'
import { WHO_SETTLES_IT, theFiveAuthorities, wordsSinceChanged } from './fork-settling.ts'
import { theForkYouWriteInstead } from './human-only.ts'
import { actsForThePerson } from './own-words.ts'
import { assertMayRemoveAFork } from './planning-guards.ts'
import { getRecord } from './reading.ts'
import { liveFallbacksAbout } from './restrictions.ts'
import { sameAgent, theNamesTheCallerMayWrite } from './same-agent.ts'
import { referenceOf, whoseRecordsAreThese } from '../the-persons-own-words.ts'

/**
 * REFUSE UNLESS THIS CALLER HAS PROVED IT IS THE PERSON. The one refusal the person's own acts share.
 *
 * `doing` is the act in words a person reads, the same shape `refuseAnybodyButThePerson` takes.
 * `whoMay` is the last sentence, for a door whose way on is not simply that the person does it.
 * Nothing was written is always true here: the guard throws before any write. `nothingWasDone` is null only for
 * a door that says so in its own words after the refusal, so that the reader does not read it twice.
 */
export function assertThePersonIsProved(
  actor: Actor,
  doing = 'This act',
  whoMay = 'The person does it themselves.',
  nothingWasDone: string | null = 'Nothing was written.',
): void {
  if (thePersonIsProved(actor)) return
  // THE WORDS ARE WRITTEN IN ONE PLACE, lib/not-proved-the-person.ts: why this request is not the person
  // and the way on for where it came from. This guard holds the actor and not the request, so the
  // words say only what holds whichever way the facts it cannot read go.
  throw new PanelError(
    theRefusalForSomebodyNotProvedThePerson(whatThisRequestShowed(actor, null), {
      refused: `${doing} is the person's own act`,
      nothingWasDone,
      whoMay,
    }),
    403,
  )
}

// ======================================================================= RESTRICTIONS AND FALLBACK

/**
 * AN AGENT MAY NOT DISMISS A PERSON'S `stops_final` RESTRICTION.
 *
 * This is the narrowest actor-keyed refusal in the feature, and it closes a two-request erasure the
 * fork rule does not cover. An agent files one `resolves` link — which is honest, and it is allowed,
 * because resolving a restriction is a claim about the world and an agent may make one — and then
 * marks each affected record `not_affected`. The owner's `stops_final` placeholder, whose whole
 * purpose is to say *this still cannot be called final*, then stops being drawn on every record it
 * reached, with no reason recorded and no person involved.
 *
 * SO THE GUARD IS ON THE JUDGEMENT AND NOT ON THE LINK. `checked` stays open to agents — it agrees
 * with the restriction's author rather than overriding them, and judging evidence is the work
 * agents do here. `not_affected` at `limits_claims`, and `not_affected` on an agent's own
 * restriction, are open too. One combination is refused: `not_affected`, on a `stops_final`
 * restriction, that a person wrote.
 *
 * AND IT NAMES THE ALTERNATIVE RATHER THAN ONLY SAYING NO. File a `claim` or an `annotation` saying
 * why the restriction does not apply here, link it `about` this record, and a person can then
 * dismiss the row in one press with your reasoning in front of them. Nothing is lost and the
 * agent's finding is recorded where findings go.
 */
export function assertMayDismissARestriction(
  restriction: { id: string; title: string; severity: string; writtenByAPerson: boolean },
  recordId: string,
  state: string,
  actor: Actor,
): void {
  if (state !== 'not_affected') return
  if (restriction.severity !== 'stops_final') return
  if (!restriction.writtenByAPerson) return
  if (actor.type === 'human' && actor.stated !== false) {
    assertThePersonIsProved(actor)
    return
  }
  // AND THE PERSON'S PRESS ANSWERS IT, exactly as it answers every other act that is theirs. Criterion P59: an
  // elevation gives the person's own acts, and this one is declared under that power in roles.json.
  if (actor.type !== 'human' && actsForThePerson(actor)) return
  throw new PanelError(
    `"${restriction.title}" is a person's own statement that nothing resting on it may be called final, and ` +
      `"was not affected" takes it off ${recordId} altogether. That is the one judgement an agent may not ` +
      `record. Nothing was written and the restriction still stands on every record it reaches. What to do ` +
      `instead: file a claim or a comment saying why it does not apply here, link it about ${recordId} with an ` +
      `\`about\` link, and a person can dismiss the row in one press with your reasoning in front of them. ` +
      `"Still stands" is open to you on this record, and so is "was not affected" on any restriction that does ` +
      `not stop something being called final.`,
    403,
  )
}

/**
 * AN AGENT MAY NOT CHANGE A BLOCK'S CANONICAL METHOD WHILE A FALLBACK IS RUNNING. A PERSON MAY.
 *
 * The rule's operative word is *silently*: a fallback may preserve execution, but must not silently
 * redefine the canonical method. `data.method` on a block IS the
 * canonical method. A `ran_instead` record says what actually ran, and it never writes that field —
 * there is no route that does, which is the first mechanism. This is the second.
 *
 * WHAT IT MEANS, SAID PLAINLY, BECAUSE IT IS A SIDE EFFECT WORTH STATING. The `ran_instead` kind is
 * not human-only, so ONE AGENT FILING ONE RECORD CHANGES WHAT EVERY OTHER AGENT MAY WRITE TO A
 * DIFFERENT RECORD. A block's `data.method` becomes person-only for as long as a live fallback names
 * it. That is the intended behaviour — an agent that could lift its own lock would not be locked —
 * but it must not be a surprise, so the block's own reply carries the fact and says which record
 * holds it, and an agent learns it before it tries.
 *
 * IT IS NOT A LEASE AND IT IS NOT EXCLUSIVITY: nothing is claimed, nothing expires, no second agent
 * is queued, and the only thing it stops is one field on one record.
 */
export function assertMayChangeACanonicalMethod(
  record: { id: string; kind: string; title: string; workspaceId: string },
  data: Record<string, unknown> | null | undefined,
  actor: Actor,
): void {
  if (data === null || data === undefined || !('method' in data)) return
  if (actor.type === 'human' && actor.stated !== false) {
    assertThePersonIsProved(actor)
    return
  }
  // AND THE PERSON'S PRESS ANSWERS IT. Criterion P59: an elevation gives the person's own acts, and this one
  // is declared under that power in roles.json.
  if (actor.type !== 'human' && actsForThePerson(actor)) return
  const live = liveFallbacksAbout(record.id)
  if (live.length === 0) return
  const fallback = live[0]!
  throw new PanelError(
    `"${fallback.title}" says something ran instead of this step's canonical method, and while it is live only ` +
      `a person may change data.method on "${record.title}". Changing it now would rewrite the canonical method ` +
      `because a fallback happened to run, which is the one thing a fallback record exists to stop. Nothing was ` +
      `written. If the thing that ran is better, that is four records and the last is the person's: file a ` +
      `claim with what it measured, a proposal naming both methods, criticism on it, and the decision. ` +
      `Link the claim to ${fallback.id} so whoever reads the fork can see what the fallback actually measured.`,
    403,
  )
}

// ======================================================= WHAT A DECISION AN AGENT WROTE STANDS ON
//
// ---------------------------------------------------------------------------------------
// THE RULE THIS REPLACES, AND THE DATE IT STOPPED GOVERNING
// ---------------------------------------------------------------------------------------
//
// Until 27 August 2026 the rule was one sentence: *only the human may write a decision*, and every
// agent got a 403 on the kind. It was the only access control in the product and it did its job —
// an agent asserting a decision would launder its own choices into the record where nobody could
// tell them from the owner's.
//
// What it also did was leave an agent that KNEW the owner had already decided something able to
// file only a note, which nothing queries. The owner replaced the sentence themselves:
//
//     "An Agent may close a question when it can cite sufficient authoritative evidence.
//      It may not manufacture authority that the evidence does not contain."
//
// So the question moves from WHO IS ASKING to WHAT IS THIS STANDING ON. The old sentence is not
// deleted anywhere it was written down; it is kept with this date beside it.
//
// ---------------------------------------------------------------------------------------
// WHAT IS UNCHANGED, AND IT IS MOST OF THE BOUNDARY
// ---------------------------------------------------------------------------------------
//
// Deleting, restoring and moving a decision are refused to every agent exactly as before, and so is
// a request that named nobody, a request in a name Mole Office cannot place, and a request from
// another machine. WRITING one moved, for a caller that hands over the body so this guard can read
// what it stands on; and on 15 September 2026, promoting a proposal and pointing a
// decision at one moved for the secretary carrying the person's authorization, with the card asked
// before the words. A caller that does not hand the body over is refused by
// the old sentence, which is the safe direction to fail in.
//
// `assertMaySettleFork` now asks the P59 question for the secretary: `theSecretaryActingForThePerson`
// is where the card and the authorization are asked once.

export function assertMayDecide(
  write: { verb: 'create' | 'change'; data: unknown; subject: string },
  actor: Actor,
): void {
  if (actor.type === 'human') return

  const data = isJsonObject(write.data) ? write.data : {}

  // THE FOUR ACTS THIS GUARD SITS BETWEEN, in the table's own words. Criterion P90: this refusal
  // used to talk only of the five authority words and never said that an agent may record a decision
  // the person made in words, act for them under their grant, or be raised for a while — so a reader
  // could not tell deciding from the three that are allowed.
  const fourActsRule = `FOUR ACTS LOOK LIKE DECIDING AND ARE NOT: ${theFourActs()}`

  /**
   * WORDS THE PERSON ADDED AFTER THE PRESS ARE THEIRS, AND NO AUTHORITY MAKES THEM AN AGENT'S. Criterion M83.
   *
   * MEASURED 7 SEPTEMBER 2026, and it is why this clause is here rather than in the checks below.
   * `promoteProposal` fills a decision the person settles by pressing an option with `authority`: "the owner
   * said so", `decided_by`: "the owner" and `authority_reference`: the proposal. On a CHANGE the
   * merged data reaches this function, so all three clauses below are satisfied by what the
   * PROMOTION wrote — and an agent could rewrite the `because` of a decision the person made
   * themselves. That hole is older than this criterion and is filed as its own problem.
   *
   * WHAT IS SHUT HERE IS THE FIELD THIS CRITERION ADDS. `words_since` is what the person says about
   * a decision after making it; an agent writing into it is the person's words invented, on the one record
   * kind that is theirs. The wider hole is not shut from here, because narrowing who may change a
   * decision the person made is theirs to settle and a guard built on a guess would refuse work agents
   * do legitimately today.
   */
  if (write.verb === 'change' && wordsSinceChanged(write.subject, data)) {
    throw new PanelError(
      'Words added to a decision after it was made are the person\'s own, and this write would change them. ' +
        '`words_since` holds what THE PERSON said about this decision after making it, and no authority makes those an ' +
        'agent\'s to write: a decision is the one kind of record that is the person\'s, and words put in their mouth on one ' +
        `are worse than a decision filed under a false name. Nothing was written and decision ${write.subject} is ` +
        'exactly as it was. Say what you want to say in a comment or a message, where it carries your name.\n\n' +
        fourActsRule,
      403,
    )
  }

  const said = data['authority']
  const decidedBy = data['decided_by']
  const reference = data['authority_reference']
  // THE LIMIT, WHEN THIS WRITE CLAIMS THE PERSON'S WORD. A decision that says the
  // owner made it, or that stands on "the owner said so", is where an agent asking in the person's name
  // lands, so every refusal below ends with the same sentence `humanOnlyRefusal` ends with. It is
  // `THE_LIMIT_ON_A_GOVERNANCE_ACT` itself and is not retyped. A write that claims neither gets
  // the refusal without it, because it did not ask in the person's name.
  const claimsTheirWord = decidedBy === THE_OWNER || said === 'the owner said so'
  const theLimitIfTheirWordIsClaimed = claimsTheirWord ? `\n\n${THE_LIMIT_ON_A_GOVERNANCE_ACT}` : ''
  const nothingWritten =
    write.verb === 'create'
      ? 'Nothing was written and no decision was created.'
      : `Nothing was written and decision ${write.subject} is exactly as it was.`
  const yourPart = `If you cannot cite one of these: ${theForkYouWriteInstead(DECISION_KIND, write.verb, write.subject)}`

  if (typeof said !== 'string' || said.trim() === '') {
    throw new PanelError(
      `A decision needs to say what it stands on, and this one says nothing. \`authority\` is missing, and it is ` +
        `the field that makes this a decision rather than an opinion — everywhere else in Mole Office a missing field ` +
        `means nobody has said, and here it does not. ${nothingWritten}\n\n` +
        `WHAT WOULD SATISFY THIS. Send \`authority\` as one of: ${theFiveAuthorities()}. ` +
        `Four of them are yours to claim for a decision you made yourself: send \`decided_by\`: ` +
        `${theNamesTheCallerMayWrite(actor)}. The fifth, "the owner said so", is for writing down a decision THE OWNER made — send ` +
        `\`decided_by\`: "${THE_OWNER}" and \`authority_reference\`: the id of the record that carries their words.\n\n` +
        `${yourPart}\n\n${fourActsRule}${theLimitIfTheirWordIsClaimed}`,
      403,
    )
  }
  if (!(DECISION_AUTHORITIES as readonly string[]).includes(said)) {
    throw new PanelError(
      `"${said}" is not one of the five things a decision may stand on, so Mole Office cannot tell what this one rests ` +
        `on. ${nothingWritten}\n\nTHE FIVE ARE: ${theFiveAuthorities()}.\n\n${fourActsRule}${theLimitIfTheirWordIsClaimed}`,
      403,
    )
  }

  // WHO DECIDED IT. An agent that names nobody is the case the old rule existed for: a decision with
  // no author reads on every page as the product's own, which is the laundering this guard prevents.
  if (typeof decidedBy !== 'string' || decidedBy.trim() === '') {
    throw new PanelError(
      `A decision has to say who made it, and this one does not. \`decided_by\` is missing. An unattributed ` +
        `decision reads on every page as though nobody in particular made it, which is how an agent's own choice ` +
        `becomes indistinguishable from the owner's. ${nothingWritten}\n\n` +
        `WHAT WOULD SATISFY THIS. Send \`decided_by\`: ${theNamesTheCallerMayWrite(actor)}, if you made this choice yourself — that is ` +
        `allowed, on authority ${AGENT_AUTHORITIES.map((w) => `"${w}"`).join(', ')}. Send \`decided_by\`: ` +
        `"${THE_OWNER}" only if you are writing down a decision THE OWNER made, which also needs \`authority\`: ` +
        `"the owner said so" and an \`authority_reference\` naming the record that carries their words.\n\n${fourActsRule}${theLimitIfTheirWordIsClaimed}`,
      403,
    )
  }

  if (decidedBy === THE_OWNER) {
    if (said !== 'the owner said so') {
      throw new PanelError(
        `This decision says the owner made it and that it stands on "${said}". Those two cannot both be true from ` +
          `an agent: if THE OWNER made the decision, the authority is what they said, and the record has to point at where they said it. ` +
          `${nothingWritten}\n\n` +
          `WHAT WOULD SATISFY THIS. Either send \`authority\`: "the owner said so" together with ` +
          `\`authority_reference\`: the id of the note, annotation or change row that carries their words, and quote ` +
          `them in \`because\` rather than paraphrasing — or, if this is YOUR choice on ${said}, send ` +
          `\`decided_by\`: ${theNamesTheCallerMayWrite(actor)}, and say so plainly. Evidence can settle engineering; it cannot ` +
          `impersonate governance.\n\n${fourActsRule}${theLimitIfTheirWordIsClaimed}`,
        403,
      )
    }
    if (typeof reference !== 'string' || reference.trim() === '') {
      throw new PanelError(
        `This decision says the owner made it, and nothing here says where they said so. \`authority_reference\` is ` +
          `missing. ${nothingWritten}\n\n` +
          `WHAT WOULD SATISFY THIS. Send \`authority_reference\`: the id of a live record that carries their words — ` +
          `a note, an annotation, or the record holding the message they wrote it in — and quote the words themselves ` +
          `in \`because\`. A paraphrase is your words wearing their authority. If they never said it, this is your ` +
          `choice: send \`decided_by\`: ${theNamesTheCallerMayWrite(actor)}, with one of ` +
          `${AGENT_AUTHORITIES.map((w) => `"${w}"`).join(', ')}.\n\n${fourActsRule}${theLimitIfTheirWordIsClaimed}`,
        403,
      )
    }
    const cited = getRecord(reference.trim())
    if (cited === null || cited.deletedAt !== null) {
      throw new PanelError(
        `This decision says the owner made it and cites ${reference} as where they said so, and ` +
          `${cited === null ? 'nothing in Mole Office answers to that id' : `record ${reference} is deleted`}. A ` +
          `reference nobody can open is a claim about them nobody can check. ${nothingWritten}\n\n` +
          `WHAT WOULD SATISFY THIS. Cite a record of their own words: a message they sent, a report holding an answer ` +
          `they gave, or a proposal they settled by pressing. Words they said somewhere else go in first as a \`note\` ` +
          `with \`for_the_person_to_file\`: true, which they file as their own with one press. If they never said it, ` +
          `this is your choice: send ` +
          `\`decided_by\`: ${theNamesTheCallerMayWrite(actor)}, with one of ${AGENT_AUTHORITIES.map((w) => `"${w}"`).join(', ')}.\n\n${fourActsRule}${theLimitIfTheirWordIsClaimed}`,
        403,
      )
    }
    // THE RECORD MUST BE THE PERSON'S OWN WORDS, not only a record that exists. It may be a message they sent, a
    // report holding an answer they gave, a
    // proposal they settled by pressing, or a record they wrote, which includes a note filed by their own press on
    // "File as my words". `whoseRecordsAreThese` is the one reading, and the mark on old decisions asks it too.
    // ASKED OF A NEW DECISION, AND OF A CHANGE THAT MOVES THE REFERENCE OR PUTS THE DECISION IN THEIR NAME. A change that
    // leaves both as stored is not asked, so an old decision keeps every other change it had; nothing old is changed by
    // this rule, and the mark says which old ones do not stand on the person's own words.
    const stored = write.verb === 'change' ? getRecord(write.subject) : null
    const storedData = stored !== null && isJsonObject(stored.data) ? stored.data : {}
    const asked = write.verb === 'create' || referenceOf(storedData) !== reference.trim() || storedData['decided_by'] !== THE_OWNER
    const theirs = asked ? whoseRecordsAreThese([cited.id]).get(cited.id) : undefined
    if (theirs !== undefined && !theirs.own) {
      const what =
        theirs.because === 'agentsMessage'
          ? 'a message an agent sent, not one they sent'
          : theirs.because === 'wordsChanged'
            ? `a ${kindWord(cited.kind).text} whose words somebody other than them changed after it was written`
            : `a ${kindWord(cited.kind).text} somebody other than them wrote`
      throw new PanelError(
        `This decision says the owner made it and cites ${reference} as where they said so, and that record is ${what}. ` +
          `A decision in the owner's name stands on what they said themselves: a message they sent, a report holding an ` +
          `answer they gave, a proposal they settled by pressing, or a record they wrote themselves, whose words nobody ` +
          `else has changed since. ${nothingWritten}\n\n` +
          `WHAT WOULD SATISFY THIS. If they said it in a message, cite that message. If they said it somewhere else, such ` +
          `as in your terminal, write their words as a \`note\` with \`for_the_person_to_file\`: true and ask them to ` +
          `press "File as my words" on its page: that press files the words as their own note, and you cite the note it ` +
          `files. If they never said it, this is your choice: send \`decided_by\`: ${theNamesTheCallerMayWrite(actor)}, with one of ` +
          `${AGENT_AUTHORITIES.map((w) => `"${w}"`).join(', ')}.\n\n${fourActsRule}${theLimitIfTheirWordIsClaimed}`,
        403,
      )
    }
    return
  }

  /**
   * ITS OWN CHOICE. `decided_by` must be this agent: an agent writing another actor's name into it
   * is signing somebody else's decision, which is the same act the owner clause above is careful
   * about, one step down.
   *
   * THIS ONE IS DIFFERENT IN KIND FROM THE OTHER FOUR GUARDS, and it is worth saying why it uses the
   * same reader anyway. The other four compare a stamp the LEDGER stored against the caller. This
   * compares a `data` field the agent is writing RIGHT NOW against the name it is writing under. So
   * resolving it does not recover a past; it means an agent may name itself by its id or by its
   * handle and be believed for either, which is right — after the mint an agent has two true names
   * for itself and neither is a lie.
   *
   * AND IT IS A GOVERNANCE WRITE, SO WHERE THE TWO READINGS DISAGREE IT FAILS CLOSED. A string that
   * is one agent's id and another agent's handle names two agents, and `sameAgent` answers no to
   * that rather than picking the half that would let the write through. The refusal below stands,
   * and it says what was sent and what would be accepted instead.
   */
  if (!sameAgent({ actorType: actor.type, actorId: decidedBy }, actor)) {
    throw new PanelError(
      `This decision says "${decidedBy}" made it, and this request came from ${actor.type} "${actor.id}". An agent ` +
        `may write down a decision it made itself, or one the OWNER made, and nothing else — signing a third ` +
        `party's name to a choice is how a record stops being evidence about anybody. ${nothingWritten}\n\n` +
        `WHAT WOULD SATISFY THIS. Send \`decided_by\`: ${theNamesTheCallerMayWrite(actor)} if this is your ` +
        `choice, or \`decided_by\`: ` +
        `"${THE_OWNER}" with \`authority\`: "the owner said so" and an \`authority_reference\` naming where they ` +
        `said it. If "${decidedBy}" is another agent, it writes its own decision under its own handle.\n\n${fourActsRule}${theLimitIfTheirWordIsClaimed}`,
      403,
    )
  }
  if (said === 'the owner said so') {
    throw new PanelError(
      `This decision says you made it and that it stands on the owner having said so. Those two do not go ` +
        `together: a decision that stands on the owner's authority was made by THE OWNER. ${nothingWritten}\n\n` +
        `WHAT WOULD SATISFY THIS. Send \`decided_by\`: "${THE_OWNER}" with \`authority_reference\` naming the ` +
        `record that carries their words — you are then writing down their decision, which is allowed and is what ` +

        `\`recorded_by\` will show. Or keep \`decided_by\`: ${theNamesTheCallerMayWrite(actor)}, and cite what YOU are standing on: ` +
        `${AGENT_AUTHORITIES.map((w) => `"${w}"`).join(', ')}.\n\n${fourActsRule}${theLimitIfTheirWordIsClaimed}`,
      403,
    )
  }
}

/**
 * PINNING A FORK IS THE OWNER SAYING SO, AND NOBODY ELSE MAY SAY IT FOR THEM.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A PIN NEEDS A GUARD AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * Every other fact the owner's queue is ordered by is counted from the corpus — how much work a
 * fork is holding up, how far that reaches, how old it is. A pin is the one that is not counted: it
 * is a statement. The owner's brief asks for "owner pin / explicit importance" as one of the facts and for
 * a mark on the card that shows it. A pin an agent could write would be one more thing arguing for
 * its own place in the owner's queue, and the queue would go back to being noise.
 *
 * ---------------------------------------------------------------------------------------
 * TWO CONDITIONS, THE SAME TWO `assertMaySettleFork` CARRIES
 * ---------------------------------------------------------------------------------------
 *
 *   1. `actor.type !== 'human'` — refused.
 *   2. `actor.stated === false` — refused. Owner decision §36: an absent header is not evidence
 *      that a person made the write, and this is not an ordinary one.
 *
 * IT FIRES ON THE VALUE CHANGING AND NOT ON THE KEY BEING PRESENT. An agent that patches something
 * else on a pinned fork, or writes back the value the record already holds, has not pinned anything
 * — and refusing it would make an ordinary edit to a pinned fork impossible for the agent that
 * files them. TAKING A PIN OFF IS PINNING IN THE OTHER DIRECTION and is refused the same way.
 */
export function assertMayPinAFork(
  write: { data: unknown; stored: unknown; recordId: string | null },
  actor: Actor,
): void {
  if (!isJsonObject(write.data) || !Object.hasOwn(write.data, 'pinned')) return
  const sending = write.data['pinned'] === true
  const already = isJsonObject(write.stored) && write.stored['pinned'] === true
  if (sending === already) return
  if (actor.type === 'human' && actor.stated !== false) {
    assertThePersonIsProved(actor)
    return
  }
  // AND THE PERSON'S PRESS ANSWERS IT. Criterion P59: an elevation gives the person's own acts, and this one
  // is declared under that power in roles.json.
  if (actor.type !== 'human' && actsForThePerson(actor)) return

  const what = sending ? 'Pinning a fork' : 'Taking the pin off a fork'
  const nothing =
    write.recordId === null
      ? 'Nothing was written and no proposal was created.'
      : `Nothing was written and proposal ${write.recordId} is exactly as it was.`
  if (actor.type !== 'human') {
    throw new PanelError(
      `${what} is the owner saying it matters more than its other facts say, so only the owner may do it — and this ` +
        `request came from ${actor.type} "${actor.id}". ${nothing}\n\n` +
        `WHY IT IS THE OWNER'S ALONE. Every other fact the owner's queue is ordered by is COUNTED from the corpus: how much work ` +
        `the fork is holding up, how far that reaches, whether somebody could be hurt, how long it has waited. A ` +
        `pin is the one that is stated rather than counted, and a pin an agent could write would be one more ` +
        `thing arguing for its own place in the owner's list.\n\n` +
        `WHAT TO DO INSTEAD, AND IT ALREADY MOVES THE ORDER. Say what the fork is holding up: POST /api/links ` +
        `{"fromId":"<this proposal>","toId":"<the work that is waiting>","type":"blocks"}. That is counted, it is ` +
        `checkable, and it is what makes a fork's cost visible rather than asserted.`,
      403,
    )
  }
  throw new PanelError(
    `${what} is the owner's own statement, and this request sent no actor headers, so nothing said who is ` +
      `asking. Ordinary writes take that as the person typing by hand; this one may not, because an absent ` +
      `header is not evidence that a person made it. ${nothing} Send x-mole-office-actor-type: human and ` +
      `x-mole-office-actor-id: <who you are>.`,
    403,
  )
}

/**
 * TAKING A FORK OFF THE OWNER IS THE SAME ACT AS SETTLING IT, SO IT IS REFUSED THE SAME WAY.
 *
 * ---------------------------------------------------------------------------------------
 * THE HOLE THIS CLOSES, MEASURED OVER HTTP
 * ---------------------------------------------------------------------------------------
 *
 * Commit 6e9af68 made `assertMaySettleFork` read the fork's `who_settles_it` to decide whether an
 * agent may settle it. Nothing guarded that field. Measured on the running server on 27 August
 * 2026, two requests, both from an agent:
 *
 *     PATCH /api/records/<a fork marked "the owner">  {"dataPatch":{"who_settles_it":"an agent"}}   200
 *     POST  /api/links {"fromId":"<a decision>","toId":"<that fork>","type":"derived_from"}         201
 *
 * So every fork in the owner's queue was one PATCH away from being an agent's. A guard that reads a
 * field anybody may write is not a guard; it is a question the caller answers for itself.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS REFUSED, AND WHAT IS DELIBERATELY NOT
 * ---------------------------------------------------------------------------------------
 *
 * ONLY THIS: changing `who_settles_it` AWAY FROM "the owner" on a fork that already stores it.
 *
 *   · Classifying a fork NOBODY has classified is allowed, and must stay allowed. That is how the
 *     queue gets sorted, it is what the sweep does, and it takes nothing off the owner — an unclassified
 *     fork is refused to agents anyway, by `assertMaySettleFork`, so saying "an agent" out loud is
 *     an agent taking on work rather than taking work away.
 *   · Reclassifying a fork that says `an agent`, `the parent` or `a measurement` is allowed, in
 *     every direction, including to "the owner". None of those forks is the owner's, so none of those
 *     changes takes one off the owner, and escalating one TO the owner is the direction their own rule points:
 *     if you are unsure whether a fork is the owner's, it is the owner's.
 *   · Writing back the value the record already holds changes nothing and is not refused.
 *
 * IT FIRES ON THE VALUE CHANGING AND NOT ON THE KEY BEING PRESENT, which is `assertMayPinAFork`'s
 * rule and it is here for the same reason: an agent editing the question or the options on one of
 * the owner's forks must still be able to send the whole object back.
 *
 * A `data` THAT LEAVES THE KEY OUT IS A CHANGE. `data` replaces the whole object, so an agent could
 * take the classification off a fork without ever sending the field — the guard walked around
 * rather than broken. `replacesEverything` is how the caller says which door this came through: a
 * `dataPatch` with no mention of the field is leaving it alone, a `data` with no mention of it is
 * deleting it. The pin defends the same walk-around by carrying its stored value across; this
 * refuses instead, because silently rewriting what a caller sent is a worse answer than telling
 * them what they may not do.
 *
 * ---------------------------------------------------------------------------------------
 * TWO CONDITIONS, THE SAME TWO `assertMayPinAFork` AND `assertMaySettleFork` CARRY
 * ---------------------------------------------------------------------------------------
 *
 *   1. `actor.type !== 'human'` — refused.
 *   2. `actor.stated === false` — refused. Owner decision §36: an absent header is not evidence
 *      that a person made the write, and this is not an ordinary one.
 *
 * IT IS NOT ASKED ON CREATE, and that is not an omission. A fork being filed has no stored value to
 * take off the owner, and a fork created saying "the owner" is a fork handed TO the owner. There is nothing at
 * that door for this rule to refuse.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS DOES NOT CLOSE, MEASURED THE SAME DAY AND STILL OPEN
 * ---------------------------------------------------------------------------------------
 *
 * A KIND CHANGE TAKES A FORK OFF THE OWNER'S QUEUE IN ONE REQUEST, and nothing refuses it. Measured on the
 * running server on 27 August 2026, as an agent, on a throwaway record:
 *
 *     PATCH /api/records/<a fork marked "the owner">  {"kind":"note"}   200, and the fork was gone
 *                                                                      from GET /api/needs-you
 *     PATCH /api/records/<a decision>                 {"kind":"note"}   200, and the record was then
 *                                                                      deletable, which a decision is not
 *
 * It is the same defect one door along: `assertMayRemoveAFork` and the human-only delete rule are
 * asked by DELETE and are not asked by the kind change, although a kind change removes the record
 * from the kind those rules protect. The fix is to ask both of them when `patch.kind` moves a
 * record out of its kind. IT IS NOT MADE HERE, because it is a different act with its own refusal
 * wording and its own tests, and a guard that grew a second act inside it is what
 * `GOVERNANCE_GUARDS` exists to prevent.
 */
export function assertMayReclassifyAFork(
  write: {
    /** What the write is about to store into `data`: the `data` body or the `dataPatch` body. */
    data: unknown
    /** True when the body REPLACES the whole object, so a missing key deletes what is stored. */
    replacesEverything: boolean
    /** The record as it stands. `null` on a create, which is why a create can never reach the throw. */
    stored: unknown
    recordId: string | null
    /**
     * THE KIND THE RECORD IS BECOMING, when a kind change is what takes the field off it.
     *
     * A record that stops being a proposal keeps `who_settles_it` nowhere a reader looks: every
     * field the new kind has no place for is set aside under `extra`. So the classification comes
     * off the fork without the field ever being sent, which is this guard walked around rather than
     * broken — the same walk-around a wholesale `data` performs, and it is refused the same way.
     * This changes the words only, so the refusal names what the caller actually asked for.
     */
    becoming?: RecordKind
  },
  actor: Actor,
): void {
  // WHAT THE FORK STORES NOW. The stored value is what this rule is about — never the sent one, for
  // the reason `whoSettlesThisFork` gives: a caller that could hand the guard its answer would be
  // answering the question the guard is asking.
  if (!isJsonObject(write.stored)) return
  const held = write.stored[WHO_SETTLES_IT]
  // NOTHING STORED, NOTHING TO DEFEND. Classifying an unclassified fork is open, and stays open.
  if (typeof held !== 'string' || !(FORK_SETTLERS as readonly string[]).includes(held)) return
  if (!isJsonObject(write.data)) return
  const sent = Object.hasOwn(write.data, WHO_SETTLES_IT)
  if (!sent && !write.replacesEverything) return
  const sending = sent ? write.data[WHO_SETTLES_IT] : undefined
  /** What the fork would say afterwards, or null when it would say nothing Mole Office can read. */
  const wouldSay =
    typeof sending === 'string' && (FORK_SETTLERS as readonly string[]).includes(sending) ? sending : null
  if (wouldSay === held) return

  // THE FIRST RULE, AND THE ONE THIS GUARD WAS WRITTEN FOR: moving a fork AWAY from the owner.
  const takingItOffThem = held === THE_OWNER && wouldSay !== THE_OWNER
  /**
   * THE SECOND RULE, ADDED 27 AUGUST 2026: A CLASSIFICATION IS DURABLE. An agent may not take one
   * off a fork, whichever of the four words it holds.
   *
   * WHY, AND IT IS NOT SYMMETRY FOR ITS OWN SAKE. Every reader in this product treats a fork with no
   * classification as the owner's — `forkIsTheOwnersToSettle` says so, and the two settling guards
   * say it in their refusals. So an agent that can empty the field can manufacture "nobody has said"
   * on any fork that is not the owner's. Measured on 27 August 2026: a whole-`data` replace dropping the
   * field from a fork marked "an agent" answered 200 and put the fork back in the owner's queue,
   * and re-writing the field afterwards re-armed an exit link the archive already held, taking the
   * fork off the queue again in ONE request. A field that can be flipped off and on is not a
   * statement about the fork; it is a switch.
   *
   * IT IS ALSO SOMEBODY'S SENTENCE. Whoever classified the fork said something about it. Deleting
   * that says nothing in its place, and the product has a better answer: change it to one of the
   * other three words, or hand it to the owner.
   *
   * THE DIRECTION IS THE SAFE ONE AND IT IS STILL REFUSED. Un-classifying puts a fork back into the owner's
   * queue rather than taking one out of it, so nothing is stolen by it. It is refused because of
   * what it makes possible next, not because of what it does.
   *
   * IT IS ABOUT A FORK THAT STAYS A FORK, SO IT DOES NOT FIRE ON A KIND CHANGE. A record that stops
   * being a proposal is the DELETE's act, and `assertMayRemoveAFork` is the guard for it — that
   * guard is asked first, on the same request, and it lets exactly one case through: a fork that is
   * not the owner's and that nobody is waiting on. Firing this rule there as well would refuse the kind
   * change while the delete beside it is allowed, which is two doors onto one act answering
   * differently. That is this repository's named recurring defect, and it is the defect this change closes.
   */
  const unclassifying = wouldSay === null && write.becoming === undefined
  if (!takingItOffThem && !unclassifying) return
  if (actor.type === 'human' && actor.stated !== false) {
    assertThePersonIsProved(actor)
    return
  }

  /**
   * THE THIRD RULE, ADDED 3 SEPTEMBER 2026: AN AGENT MAY CORRECT ITS OWN CLASSIFICATION.
   *
   * The two rules above are about taking somebody else's sentence off a fork. Neither of them is
   * about an agent changing its mind about a fork it classified itself an hour earlier, and until
   * today that was refused too — an agent that marked a fork "the owner" could never mark it
   * anything else, so the safest first answer was the one it could not take back.
   *
   * BOTH HALVES OF THE IDENTITY, for the reason `assertMayRemoveAnAsk` gives at length: two agents
   * are two people here, and comparing only the type would build *its own* as *any agent's*. The
   * reading is the same one, `whoWroteTheValue` over the revision ledger, and a `null` answer — a
   * fork whose history cannot say who classified it — is refused, in the same direction and for the
   * same reason.
   *
   * THE OWNER'S OWN CLASSIFICATION IS NEVER THE CALLER'S OWN, because `actorType !== 'human'` is
   * part of the comparison. A fork the owner marked stays refused to every agent unless it carries their
   * authorization — their quoted words, or their press.
   */
  const wrote = write.recordId === null ? null : whoWroteTheValue(write.recordId, WHO_SETTLES_IT, held)
  // AND THE TWO SIDES ARE RESOLVED RATHER THAN COMPARED AS CHARACTERS. `sameAgent` in records/same-agent.ts compares
  // the type and then asks which agent each side names, so an agent that classified a fork under its
  // handle may still correct it after it comes back under its minted id — and an agent that took a
  // retired agent's freed name may not correct what the retired one classified.
  const isTheCallersOwnClassification = wrote !== null && wrote.actorType !== 'human' && sameAgent(wrote, actor)
  if (isTheCallersOwnClassification) return

  // AND THE PERSON'S OWN WORDS ANSWER THE REST. An agent that can quote the person saying who settles a
  // fork may write that onto it. The two refusals below are unchanged for a request with no warrant.
  if (actor.type !== 'human' && actsForThePerson(actor)) return

  const to =
    write.becoming !== undefined
      ? `turn the fork into a ${kindWord(write.becoming).text}, which takes that field off it`
      : sending === undefined
        ? 'leave it out, which deletes it'
        : typeof sending === 'string'
          ? `change it to "${sending}"`
          : 'overwrite it with something that is not one of the four words'
  const says = `This fork says "${held}" may settle it`
  const nothing =
    write.recordId === null
      ? 'Nothing was written.'
      : `Nothing was written and proposal ${write.recordId} is exactly as it was: still marked "${held}".`
  if (actor.type !== 'human') {
    throw new PanelError(
      takingItOffThem
        ? `${says}, and this request would ${to}. That is the same act as ` +
          `settling it, so it is refused in the same words — and this request came from ${actor.type} ` +
          `"${actor.id}". ${nothing}\n\n` +
          `WHY IT IS THE SAME ACT. \`assertMaySettleFork\` reads this field to decide whether you may point a ` +
          `decision at this fork. An agent that could write the field could settle any fork in the owner's ` +
          `queue in two requests: patch the field, then make the link. Reclassifying a fork away from the owner is ` +
          `manufacturing the authority to close it, and the owner's rule is that a fork you are unsure about is theirs.\n\n` +
          `WHAT IS NOT REFUSED, AND IT IS MOST OF THIS FIELD. Classifying a fork NOBODY has classified: ` +
          `PATCH /api/records/<the fork> {"dataPatch":{"who_settles_it":"<${FORK_SETTLERS.join(' | ')}>"}}. ` +
          `That is how the queue gets sorted and it takes nothing off anybody. Reclassifying a fork that says ` +
          `"an agent", "the parent" or "a measurement" is open to you too, in every direction. So is marking a ` +
          `fork "${THE_OWNER}" when you think it is the owner's.\n\n` +
          `WHAT TO DO WITH THIS ONE. Say on the record why you think it is not a governance question — an ` +
          `\`annotation\` linked to the fork, or a \`proposal\` asking the owner to reclassify it — and the owner moves it. ` +
          `The owner is the only one who can.`
        : `${says}, and this request would ${to}, leaving the fork saying nothing about who settles it. ` +
          `A classification is somebody's statement about the fork and it is not an agent's to remove — and ` +
          `this request came from ${actor.type} "${actor.id}". ${nothing}\n\n` +
          `WHY AN EMPTY FIELD IS NOT A NEUTRAL ONE. Every reader in Mole Office treats a fork nobody has ` +
          `classified as the owner's. So emptying this field does not leave the question open; it moves the ` +
          `fork back into the owner's queue, and it lets the field be written again from scratch — which is how an ` +
          `agent re-arms a link the archive already holds and takes the fork off the queue in one request.\n\n` +
          `WHAT IS NOT REFUSED. Changing it to one of the other three words, and handing the fork to the owner: ` +
          `PATCH /api/records/${write.recordId ?? '<the fork>'} ` +
          `{"dataPatch":{"who_settles_it":"<${FORK_SETTLERS.join(' | ')}>"}}. If you are sending the whole ` +
          `\`data\` object back, send this field with it — a wholesale \`data\` deletes what it does not name.`,
      403,
    )
  }
  throw new PanelError(
    `${says}, and this request would ${to}. ` +
      `${takingItOffThem ? 'Taking a fork off the person' : "Taking a fork's classification off it"} is the person's ` +

      `own statement, and this request sent no actor headers, so nothing said who is asking. Ordinary writes ` +
      `take that as the person typing by hand; this one may not, because an absent header is not evidence ` +
      `that a person made it. ${nothing} Send x-mole-office-actor-type: human and x-mole-office-actor-id: <who you are>.`,
    403,
  )
}

/**
 * CHANGING A RECORD'S KIND WALKS AROUND EVERY GUARD PROTECTING THE KIND IT WAS. THIS ASKS THEM.
 *
 * ---------------------------------------------------------------------------------------
 * THE HOLE, MEASURED OVER HTTP AND NOT REASONED ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * Measured on the running server on 27 August 2026, as an agent, on throwaway records:
 *
 *     PATCH /api/records/<a fork marked "the owner">  {"kind":"note"}   200, and the fork was gone
 *                                                                      from GET /api/needs-you
 *     PATCH /api/records/<a decision>                 {"kind":"note"}   200, and the record was then
 *                                                                      deletable, which a decision is not
 *
 * Three guards protect those two kinds and each of them is asked by the
 * route that performs the act it is named for: `assertMayRemoveAFork` by DELETE, the human-only rule
 * inside `assertMayWrite` by DELETE and by the ordinary write, and `assertMayReclassifyAFork` by the
 * PATCH that writes `who_settles_it`. None of the three was asked when a PATCH moved the record out
 * of the kind they protect, because every one of them reads the kind the record has NOW.
 *
 * ---------------------------------------------------------------------------------------
 * SO IT ASKS THE GUARDS THAT PROTECT THE KIND IT IS LEAVING, AND WRITES NO RULE OF ITS OWN
 * ---------------------------------------------------------------------------------------
 *
 * Each of the three keeps one home. What this adds is the QUESTION, at the door that was not asking
 * it, and a word for what the caller actually asked for so that no refusal describes a delete
 * nobody sent. A fourth copy of any of these rules is what the recurring defect looks like here: one
 * fact worked out in two places, where one of them is the owner's queue.
 *
 * IT IS ASKED ON THE WAY OUT AND NOT ON THE WAY IN. `refuseAKindThisRecordCannotBecome` already asks
 * `assertMayWrite` about the kind the record is BECOMING, which stops an agent making a decision out
 * of a note. This is the other direction and it was missing.
 *
 * IT IS NOT ASKED WHEN THE KIND IS NOT CHANGING. A `PATCH {"kind":"note"}` on something that is
 * already a note asks for a state it is already in, which is why `patchRecord` reports it as no
 * change and writes nothing.
 *
 * WHAT IT DELIBERATELY DOES NOT COVER, SAID SO NOBODY READS MORE INTO IT. Only the three guards
 * above. `assertMayShapeTheFuture` also refuses an agent deleting a planned future, and a kind
 * change out of `trajectory` or `planned_state` walks around it the same way; that is a separate
 * finding with its own wording and its own tests, and inventing it here would be this guard growing
 * a second act inside it.
 */
export function assertMayTakeARecordOutOfItsKind(
  before: Pick<PanelRecord, 'id' | 'kind' | 'title' | 'data'>,
  becoming: RecordKind,
  /**
   * WHAT `data` WILL HOLD UNDER THE NEW KIND, which is not what it holds now.
   *
   * A kind change sets aside every field the new kind has no place for, under `extra`. So the
   * classification on a fork comes off it without the caller ever sending the field, and
   * `assertMayReclassifyAFork` has to be asked about the object that will be STORED rather than
   * about the one that was sent — the same reason `patchRecord` asks the future guards about the
   * merged record rather than about the patch keys.
   */
  after: unknown,
  actor: Actor,
): void {
  if (before.kind === becoming) return

  // 1. THE KIND IT IS LEAVING IS ONE ONLY A PERSON MAY WRITE. Asked through `assertMayWrite`, which
  // is where that rule and all four of its actor clauses live. `reclassify` is the verb, so the
  // refusal says what was asked for and why it is the same act as the delete.
  assertMayWrite(before.kind, 'reclassify', actor, before.id)

  // 2. AND IS IT A FORK NOBODY HAS ANSWERED. The same guard the DELETE asks, told which kind the
  // fork is becoming so that its sentences name a kind change rather than a deletion.
  assertMayRemoveAFork(before, actor, becoming)

  // 3. AND IS IT A FORK THE OWNER RESERVED. Asked about the data that will be stored, where
  // `who_settles_it` has been set aside under `extra`, which is the field coming off the owner.
  assertMayReclassifyAFork(
    { data: after, replacesEverything: true, stored: before.data, recordId: before.id, becoming },
    actor,
  )
}
