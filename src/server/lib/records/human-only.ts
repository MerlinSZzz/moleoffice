// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHY A WRITE THAT IS THE PERSON'S OWN IS REFUSED TO ANYBODY ELSE, in the words the refusal uses: the seven verbs
 * a guard names, the refusal itself, the press or the words that would allow the act, the fork to write instead,
 * and the three verbs the person's quoted words cover. `AlreadyLinkedThere` and `describeAlreadyLinkedThere`,
 * which were declared beside them, came too. They were moved out of src/server/lib/records.ts with no change of
 * behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`. This file does not import records.ts.
 */
import { participantPagePath } from '@shared/addresses.ts'
import { theFourActs } from '@shared/governance-acts.ts'
import { THE_OWNER } from '@shared/kinds.ts'
import { named } from '@shared/named.ts'
import { THE_LIMIT_ON_A_GOVERNANCE_ACT } from '@shared/person.ts'
import { REGULATION_KIND } from '@shared/regulation.ts'
import { A_ROW_WITH_NO_ROLE_READS_AS, mayBeElevated } from '@shared/roles.ts'
import { thePress } from '@shared/the-press.ts'
import { RESOLVES_PROPOSAL, type RecordKind } from '@shared/types.ts'
import { theRoleCards, theRoleCardsAreRead } from '../roles.ts'
import type { Actor } from './actor.ts'
import type { LinkEndRef } from './link-requests.ts'
import { aRunDoesNotCarryTheGrant, theCallersCardIsTheSecretarys, theGrantAndTheRunOf } from './own-words.ts'
import { theCallersAgentRow } from './the-callers-agent-row.ts'

/**
 * THE THINGS A NON-HUMAN CAN TRY ON A HUMAN-ONLY KIND, named once so none is forgotten again.
 *
 * `change` has two entry points, the whole record and one checklist item, and they say the same
 * sentence because they are the same act to whoever reads the record.
 *
 * `reclassify` is the seventh and it arrived on 27 August 2026, after the hole it names was measured
 * over HTTP: `PATCH /api/records/<a decision> {"kind":"note"}` was answered 200 to an agent, and the
 * record was then deletable by anybody, because every rule that protects a decision reads the kind
 * the record has NOW. Changing a record out of a human-only kind is therefore the same act as
 * deleting it from that kind, and it is refused here rather than by a rule of its own.
 *
 * Creating and changing were guarded from the start. Deleting and restoring were not, and the
 * stages audit of 2026-08-10 measured the consequence: an agent sent DELETE on a decision the person
 * had written, got HTTP 200, and the change log attributed the delete to that agent. Soft delete
 * takes a record out of every listing and every page in the product, so it is a write to that
 * record in every sense that matters to a reader, and restore is the same write backwards.
 *
 * `promote` is the fifth, and it arrived with the `proposal` kind. Settling a fork — filing the
 * decision a proposal was made for — is the governance act itself, so it is guarded in the same
 * place and in the same words as writing the decision by hand, and not by a second rule of its own.
 *
 * Naming the five here does not by itself stop a sixth being added unguarded — nothing in the type
 * system can see a new function that forgets to ask. What does see it is
 * tests/guard-human-only.test.ts, which finds every write to the `records` table in the source and
 * fails on any whose enclosing function does not consult HUMAN_ONLY_KINDS. That test is the reason
 * this hole cannot come back; this union only keeps the wording honest once a guard is written.
 */
export type HumanOnlyVerb = 'create' | 'change' | 'delete' | 'restore' | 'promote' | 'move' | 'reclassify'

/**
 * The same seven verbs as the act a person would name, for a refusal that opens with the act.
 *
 * `promote` is here for completeness and is never read: promoting is described as promoting a
 * PROPOSAL into a decision, which is a different sentence and is written where it is used.
 */
export const WRITING: Record<HumanOnlyVerb, string> = {
  create: 'Writing',
  change: 'Changing',
  delete: 'Deleting',
  restore: 'Restoring',
  promote: 'Promoting',
  move: 'Moving',
  reclassify: 'Changing the kind of',
}

/**
 * The QUESTION an agent is told to file instead, per verb, as the fork it really reached.
 *
 * One sentence per verb rather than one for all of them, because the requests are asking for
 * different things and "the choice you would file" on a DELETE would be describing the wrong act.
 * A proposal to withdraw a decision has to say what changed since it was written; that is the whole
 * content of the argument the human will read.
 *
 * Takes the kind rather than saying "decision", even though `decision` is the only human-only kind
 * today. HUMAN_ONLY_KINDS is a list and a second entry would otherwise be described here by the
 * name of the first — a refusal that tells an agent to write about the wrong sort of record.
 */
function proposalQuestionFor(verb: HumanOnlyVerb, kind: RecordKind): string {
  switch (verb) {
    case 'create':
      return 'the choice you reached, written as a question somebody can answer'
    case 'change':
      return `what should change about this ${kind}, written as a question`
    case 'delete':
      return `whether this ${kind} should be withdrawn, written as a question, saying what changed since it was written`
    case 'restore':
      return `whether this ${kind} should come back, written as a question, saying what changed since it was deleted`
    // The kind change asks the same question as the delete — should this record stop standing as a
    // decision — and it is worth asking in those words, because a caller that meant to tidy a kind
    // has usually not noticed that it is what it is asking.
    case 'reclassify':
      return `whether this ${kind} should stop being one, written as a question, saying what changed since it was written`
    // A move is asked of EVERY record a move carries, not only of the one the request named, so an
    // agent can meet this refusal for a decision it never mentioned. The question therefore has to
    // be about which project the decision belongs in, which is the judgement being made.
    case 'move':
      return `which project this ${kind} belongs in, written as a question, saying what the evidence is`
    // Unreachable: the promote refusal is written out in full below, because an agent that asked to
    // promote has ALREADY filed the proposal and must not be told to file another.
    case 'promote':
      return 'the fork you would settle, written as a question'
  }
}

/**
 * What an agent is told when it reaches for a kind only the human may write.
 *
 * ---------------------------------------------------------------------------------------
 * THIS SENTENCE HAS BEEN WRONG TWICE, IN OPPOSITE DIRECTIONS, AND BOTH WAYS COST SOMETHING
 * ---------------------------------------------------------------------------------------
 *
 * It first said "An agent may propose one, but the choice has to be yours" while there was no
 * propose path at all — an instruction that cannot be carried out, which is worse than a blunt
 * refusal, because the caller spends its next turn hunting a route that does not exist.
 *
 * It was then corrected to "There is no proposal endpoint; do not look for one… write the proposal
 * as a note and link it", which was true of the product as it stood and pointed at the one kind
 * NOTHING QUERIES. Four choices that shaped this codebase were filed that way, and a later reader
 * could not tell them from choices the owner had made. That is the hole `proposal` was added to
 * close, so this sentence now names it: an agent files the FORK, the human settles it, and the
 * settling is one request.
 *
 * Every path named here is a route this server serves right now — POST /api/records,
 * POST /api/links, GET /api/records?kind=proposal and POST /api/records/:id/promote — and
 * tests/patch.test.ts carries the instructions out over the real route table rather than reading
 * them, so a renamed route fails there instead of misleading an agent here.
 */
interface Refusal {
  /** What the door has always said: what was refused, what was not written, what to do instead. */
  message: string
  /**
   * THE SAME REFUSAL IN ONE SHORT SENTENCE, under 90 characters, for the box on the screen.
   *
   * It is written in the same statement as the long one, from the same facts, so the short one
   * cannot come to say something the long one does not. `PanelError.reason` has the rule
   * and why the browser is not the place to shorten anything.
   */
  reason: string
}

/**
 * EXPORTED FOR ONE CALLER, and the reason is worth stating because exporting a guard is usually a
 * smell. `POST /api/records/:id/restore` has to ask this question BEFORE it decides whether the
 * restore is a no-op: a record that was never deleted is returned unchanged, and that early return
 * used to reach the reader before `restoreRecord` did. So an agent that asked to restore a decision
 * which happened not to be deleted was answered 200 — told "fine" when the true answer was "not
 * yours". Nothing was corrupted; the ANSWER was wrong, and an agent learns what it may do from what
 * it is refused.
 *
 * The route calls this rather than restating the rule, so `HUMAN_ONLY_KINDS` and the refusal wording
 * keep exactly one home. Two places that must agree, with nothing making them agree, is the defect
 * this codebase keeps producing, and a permission rule is the worst possible place for it.
 */
export function humanOnlyRefusal(
  kind: RecordKind,
  verb: HumanOnlyVerb,
  actor: Actor,
  subject: string,
): Refusal {
  const who = `this request came from ${actor.type} "${actor.id}"`

  // THE LIMIT, LAST, ON EVERY ONE OF THE THREE REFUSALS THIS FUNCTION WRITES. Criterion P16: agents must follow
  // the governance identity rule. The limit is stated
  // here because this is the door the rule is about: an agent reading why it was refused is exactly
  // the reader who might try the same request under the person's name instead. The words come from
  // `THE_LIMIT_ON_A_GOVERNANCE_ACT` and are not retyped, so the refusal, the general rules file and
  // the skill cannot come to say three different things about what Mole Office can prove.
  const said = (parts: readonly string[]): string =>
    [...parts, THE_LIMIT_ON_A_GOVERNANCE_ACT].filter((one) => one !== '').join(' ')

  // Promotion is refused in its own words. The agent asking has already done the part that is
  // its to do — the proposal exists — so the ordinary "file a proposal instead" sentence would be
  // telling it to repeat itself, and the useful news is different: what was NOT written, where its
  // fork is read, and how to say what is waiting on the answer.
  if (verb === 'promote') {
    return {
      message: said([
        `Only the human may promote a proposal into a ${kind} — settling a fork IS the governance act, and ${who}.`,
        `Nothing was written: no ${kind} was created, no link was made, and the proposal ${subject} is exactly as`,
        `it was and still reads as open.`,
        `Filing the proposal was your part and it is done. It sits in the queue at`,
        `GET /api/records?kind=proposal until a ${kind} the human writes links back to it with \`${RESOLVES_PROPOSAL}\`,`,
        `which is what marks it resolved — the resolution is that link and there is no stored flag beside it.`,
        `If work is waiting on the answer, say so and the fork becomes visible as a cost rather than as an open`,
        `question: POST /api/links {"fromId":"${subject}","toId":"<the work that is waiting>","type":"blocks"}.`,
        // THE FOUR ACTS, SO THE READER DOES NOT TAKE THIS FOR A FLAT BAN. Criterion P90: an agent
        // refused here is exactly the reader who must be able to tell deciding from recording the person's
        // words, from acting under the person's grant, and from being raised for a while.
        `FOUR ACTS LOOK LIKE DECIDING AND ARE NOT: ${theFourActs()}`,
        // AND THE PRESS, on the one card that could hold one. Criterion P59. Promotion settles a choice
        // reserved for the person, so this refusal needs to say what authorization would permit it. Empty for every other caller.
        thePressThatWouldAllowThis(actor),
        // AND THE WORDS, for the secretary the new rule admits: a warrant on this request.
        theWordsThatWouldSettleThis(actor),
      ]),
      reason: 'Only a person may settle a fork; an agent files a proposal.',
    }
  }

  // A kind change is refused in its own words too, because the caller did not ask to delete
  // anything and a refusal that describes the wrong act sends the reader to the wrong problem. What
  // it has to say is why the two are the same act, which is not obvious and was the whole hole.
  if (verb === 'reclassify') {
    return {
      message: said([
        `Only the human may change a ${kind} into something else — that takes it out of the kind only they may`,
        `write, and ${who}.`,
        `Nothing was written and ${subject} is still a ${kind}.`,
        `WHY THIS IS THE SAME ACT AS DELETING IT. Every rule that protects a ${kind} reads the kind the record has`,
        `NOW, so a ${kind} that has become a note is out of every reading that asks for ${kind}s, and it is then`,
        `deletable by anybody. Measured over HTTP on 27 August 2026: the kind change was answered 200 and the`,
        `delete that followed it was answered 200 as well.`,
        theForkYouWriteInstead(kind, verb, subject),
        `Whether the ${kind} stands is the human's to say.`,
      ]),
      reason: `Only a person may change a ${kind} into something else.`,
    }
  }

  // Creating and changing are about the words in the record; deleting and restoring are about
  // whether it stands at all. The closing sentence says which of the two this refusal is about,
  // so a caller that just tried to delete one is not told it may not "write" it.
  const closing =
    verb === 'create' || verb === 'change'
      ? `The ${kind} itself stays the human's to write.`
      : `Whether the ${kind} stands is the human's to say.`
  return {
    message: said([
      `Only the human may ${verb} a ${kind} — the choice has to be theirs, and ${who}.`,
      theForkYouWriteInstead(kind, verb, subject),
      closing,
      // AND THE PRESS, ON THE ONE CARD THAT COULD HOLD ONE. Criterion P59: *the refusal names the
      // press*. Empty for every other caller, so a worker is never sent looking for a button it
      // cannot have, and empty for a regulation, which the card keeps for the person by default.
      thePressThatWouldAllowThis(actor, kind),
    ]),
    reason: `Only a person may ${verb} a ${kind}.`,
  }
}

/**
 * THE SENTENCE THAT NAMES THE PRESS, for a caller whose card could act for the person and does not.
 *
 * Criterion P59: *before elevation a secretary may not write a decision nor settle a fork marked for
 * the owner, and the refusal names the press*. Three refusals reach an agent that would have been
 * allowed by one — the human-only kinds, settling a fork, and the role gate — and this is what they
 * all say, so a person cannot read two names for one button.
 *
 * IT IS EMPTY FOR EVERYBODY ELSE. A worker told to ask for a press its card can never hold would go
 * looking for a door that is not there, which is worse than the refusal on its own.
 */
export function thePressThatWouldAllowThis(actor: Actor, kind?: string): string {
  if (actor.type !== 'agent' || !theRoleCardsAreRead()) return ''
  // NO PRESS IS NAMED FOR A REGULATION. Every write of a regulation is one the card keeps
  // for the person by default. This office's person may open it on the list of what the grant carries, but this
  // sentence does not read that list, so it names no press: where the list keeps it, the press would not help.
  if (kind === REGULATION_KIND) return ''
  const row = theCallersAgentRow(actor)
  if (row === null || !mayBeElevated(theRoleCards(), row.role ?? A_ROW_WITH_NO_ROLE_READS_AS)) return ''
  // A RUN IS TOLD WHY THE GRANT ITS AGENT HOLDS IS NOT ITS. Criterion M81.
  const held = theGrantAndTheRunOf(actor)
  if (held !== null && held.run !== null) {
    return (
      `This act is one of the person's own. ${aRunDoesNotCarryTheGrant(actor.id, held.run.run)} Nothing was ` +
      'written. Say what you need in a message to that session.'
    )
  }
  if (held !== null) return ''
  return (
    `This act is one of the person's own. The person can let you make it by pressing "${thePress(row.name)}" on your page in ` +
    `Mole Office, at ${participantPagePath('agent', row.handle)}, and choosing how long it lasts. Nobody else can, and you ` +
    'cannot ask for it by sending a request.'
  )
}

/**
 * THE OTHER SENTENCE THAT NAMES WHAT WOULD ADMIT A SECRETARY: the person's own quoted words, carried as a
 * warrant.
 *
 * `thePressThatWouldAllowThis` names the elevation and only the elevation, because a warrant does not
 * cover every act that function is asked about. On a SETTLING act a warrant does cover it, so the
 * refusal says both. Empty for everybody else: a worker told to carry a warrant it could never have
 * spend on the act would go looking for a door that is not there.
 */
export function theWordsThatWouldSettleThis(actor: Actor): string {
  if (!theCallersCardIsTheSecretarys(actor)) return ''
  return (
    'You may also settle it by carrying the person\'s own words as a warrant on this request, naming this fork in `for` — ' +
    'their sentence, copied, with where and when they said it. ' +
    // CLOSING a fork by a decision the owner already made is a secretary's
    // ordinary duty. `aSecretaryMayCloseThisByTheOwnersDecision` says when.
    'Or, when the person has already decided it, point that decision at this fork with ' +
    `POST /api/links {"fromId":"<the decision>","toId":"<this fork>","type":"${RESOLVES_PROPOSAL}"}: ` +
    `a secretary may, when the decision says \`decided_by\`: "${THE_OWNER}" and names this fork, ` +
    'by its id in its own text or by a link from the decision to the fork.'
  )
}

/**
 * THE FORK AN AGENT WRITES WHEN IT MAY NOT WRITE THE DECISION, said in one place.
 *
 * TWO REFUSALS SEND AN AGENT DOWN THIS PATH and until 27 August 2026 there was only one, so the
 * paragraph lived inside it. `humanOnlyRefusal` is the flat "this kind is not yours"; `assertMayDecide`
 * is the newer "you may write one, but not one that stands on nothing". Both end the same way,
 * because the thing to do instead is the same thing, and two copies of these routes would be two
 * things that must agree with nothing making them agree.
 *
 * `tests/patch.test.ts` carries these instructions out over the real route table rather than reading
 * them, so a renamed route fails there instead of misleading an agent here.
 */
export function theForkYouWriteInstead(kind: RecordKind, verb: HumanOnlyVerb, subject: string): string {
  const link =
    verb === 'create'
      ? `POST /api/links {"fromId":"<the id the proposal came back with>","toTitle":"<the record it is about>","type":"about"}`
      : `POST /api/links {"fromId":"<the id the proposal came back with>","toId":"${subject}","type":"about"}`
  return [
    `What an agent writes instead is the FORK, as a \`proposal\`, which is a kind you may write:`,
    `POST /api/records {"kind":"proposal","title":"<short name>","data":{"question":"<${proposalQuestionFor(verb, kind)}>",`,
    `"options":["<one answer you would defend>","<the other, including the one you are not recommending>"],`,
    `"because":"<the reasoning, in enough detail to be argued with>",`,
    `"who_settles_it":"<the owner | an agent | the parent | a measurement, or leave it out if nobody has said>"}}`,
    `then ${link}.`,
    `A proposal is a QUERY: GET /api/records?kind=proposal is the queue of forks waiting on a person. That is`,
    `why this no longer sends you to a note — nothing queries notes, and choices filed as notes could not`,
    `afterwards be told from choices the owner had already made.`,
    `The human settles yours with POST /api/records/<the proposal id>/promote, which files the ${kind} and links`,
    `it back to your proposal with \`${RESOLVES_PROPOSAL}\` in one write; that link is also what marks the proposal`,
    `resolved, so nothing is written twice.`,
  ].join(' ')
}

/** A module or block a new record was linked to, and the other records already linked to it. */
export interface AlreadyLinkedThere {
  target: LinkEndRef
  /** The other live records linked to `target`, newest first, at most `ALREADY_LINKED_SHOWN`. */
  records: { id: string; kind: RecordKind; title: string }[]
  /** How many there are in all. Larger than `records.length` when the list was cut. */
  count: number
}

/** The sentence beside `theRecordsAlreadyLinkedThere`'s answer. Only called when it named one. */
export function describeAlreadyLinkedThere(recordId: string, there: readonly AlreadyLinkedThere[]): string {
  const each = there.map((t) => {
    const named = t.records.map((r) => `${r.kind} ${r.id} "${r.title}"`).join('; ')
    const more =
      t.count > t.records.length
        ? `; and ${t.count - t.records.length} more, which GET /api/records/${t.target.id} lists with its links`
        : ''
    return `${t.target.kind} ${t.target.id} "${t.target.title}" is already linked to ${named}${more}`
  })
  return (
    `Stored. Other records are already linked to what this one is linked to: ${each.join('. ')}. ` +
    `Nothing was refused and nothing was merged. Two agents filing one fact in different words, or as ` +
    `two kinds, share the work they are about and not their titles, so this is where a second copy shows. ` +
    `If one of them already says what this record says, DELETE /api/records/${recordId} (POST ` +
    `/api/records/${recordId}/restore undoes it) and add to that one; if yours is different, link the two ` +
    `with POST /api/links {"fromId":"${recordId}","toId":"<the other>","type":"relates_to"}.`
  )
}

/**
 * THE THREE VERBS THE OWNER'S WORDS COVER, and the ones they deliberately do not.
 *
 * `promote` settles the proposal the person authorized. `create` is the same act one step further in:
 * promotion FILES the decision, through the ordinary create path, so a warrant that allowed the
 * promotion and then let the write it performs be refused would be one act refused at its second
 * step.
 *
 * `change` ALSO COVERS A DECISION THE PERSON HAS AUTHORIZED CHANGING. This was added on
 * 6 September 2026 so a decision can be corrected on the person's own authorization. What opens is narrow and it
 * is the same bargain as every other warrant: the
 * words have to be the person's, they have to name this decision in `for`, they are written onto the
 * revision beside the change, and one press puts the record back.
 *
 * WITHOUT A WARRANT NOTHING MOVED. A change to a decision from an agent carrying no words is asked
 * the same question it was always asked — what does this decision stand on — by `assertMayDecide`,
 * and refused in the same sentences.
 *
 * `delete`, `restore`, `move` and `reclassify` are still NOT covered and stay refused to every
 * agent, with or without a warrant. Removing a decision or moving it out of the project is not
 * something any rule here covers, and a permission that grew past what was authorized would be the
 * defect this whole build exists to correct, made in the other direction.
 */
export const VERBS_THE_OWNERS_WORDS_COVER: readonly HumanOnlyVerb[] = ['promote', 'create', 'change']
