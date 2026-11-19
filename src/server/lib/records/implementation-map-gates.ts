// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE IMPLEMENTATION MAP'S GATES, IN A MODULE OF THEIR OWN.
 *
 * The gates were moved whole out of src/server/lib/records.ts with no change of behaviour:
 * AND_WHAT_YOUR_PART_WAS, assertMayAcceptAGuess, assertMayAcceptAnImportPiece,
 * assertMayRetireSomebodyElsesRow and assertMayRepointARepository. records.ts hands the guards on
 * with `export *`, so no caller changed; AND_WHAT_YOUR_PART_WAS stays unexported.
 *
 * This file imports records.ts for actsForThePerson, actsForThePersonWithoutTheRaise,
 * assertThePersonIsProved and the Actor type; every reference it makes to that file is inside a
 * function body, so the cycle is safe.
 */
import { gateMet, gateMetAgainOnceTheWriteIsTakenBack } from '../gate-counts.ts'
import { PanelError } from '../panel-error.ts'
import {
  actsForThePerson,
  actsForThePersonWithoutTheRaise,
  assertThePersonIsProved,
  type Actor,
} from '../records.ts'
import { anAgentItsOwnKeyProves, refusedWhileTheGateIsOff } from '../who-may-act.ts'
import { gatePosition } from '../../../config/settings.mjs'

// ================================================================ THE IMPLEMENTATION MAP'S GATES
//
// A.4 ends with one sentence: *"An LLM guess must not silently become canonical ownership."* Four
// of the five mechanisms that hold it are structural — a resolver cannot write a `links` row, the
// findings table has no column for a second record, a guessed row is in a different table from a
// computed one, and every reader is told which it is. THE FIFTH IS A GATE, and it is here, because
// without it the whole mechanism has a door through it: two calls by one agent — POST
// /api/implementation with `"proposing": true`, then POST /api/implementation/:id/accept — would
// turn its own guess into a `stated` row and raise all three of the counts that mean ownership.
// That is A.4's sentence happening through the route built to prevent it.
//
// THEY LIVE HERE, IN records/implementation-map-gates.ts, AND NOT IN `lib/implementation.ts`. One
// function per act, called by the route rather than restated in it, so the rule and its wording
// keep one home — and `GOVERNANCE_GUARDS` in records/governance-guards.ts is the one list, swept by
// tests/guard-registry.test.ts over every file under lib/, so a guard written anywhere and
// registered nowhere is a failing build on the day it is written.
//
// WHY THESE ACTS AND NOT EVERY WRITE HERE. Declaring a relationship is ordinary work and an agent
// does it — an agent that has read the code and is stating a fact is not guessing, and forcing it
// to mark everything as a guess would make the mark mean nothing. What an agent may not do is
// SETTLE: turn its own guess into ownership, retire what somebody else stated, or move the pointer
// that every stated pattern in a repository resolves against.
//
// ONE OF THE THREE HAS A QUEUE BEHIND IT AND THE OTHER TWO ARE REFUSALS.
// `assertMayAcceptAGuess` is the third registered guard with real objects pending on it — every
// un-accepted `llm` row is sitting in the "proposed" list of some record's page waiting on one
// press — so `GET /api/waiting` asks it, and `tests/waiting-queue.test.ts` is what fails the build
// for a guard that declares a queue nothing reads.

/** Said once, because all three refusals end by telling an agent what its part actually was. */
const AND_WHAT_YOUR_PART_WAS =
  'Filing what you worked out was your part and it is done. It is on the record, attributed to you, and it is ' +
  'in front of the person on the record’s own page.'

/**
 * ACCEPTING A GUESS IS A GOVERNANCE ACT, SO ONLY A PERSON MAY PERFORM IT.
 *
 * Two conditions, and they are the two `assertMaySettleFork` already carries, for the same reasons:
 *
 *   1. `actor.type !== 'human'` — refused. Accepting is what turns `guessed` into `stated`, and a
 *      machine accepting its own inference is the product answering its own governance question.
 *   2. `actor.stated === false` — refused. A request that sent no actor headers is taken as the
 *      person typing by hand on an ORDINARY write, and this is not one. Owner decision §36:
 *      *"governance actions such as Proposal promotion, GOVERNANCE-SETTLING LINKS, and Planning
 *      approval/apply must require an explicit valid human actor."*
 *
 * WITHOUT IT THE WHOLE MECHANISM HAS A DOOR THROUGH IT. Two calls by one agent — POST
 * /api/implementation with `"proposing": true`, then POST /api/implementation/:id/accept — would
 * turn its own guess into a `stated` row and raise all three of the counts that mean ownership.
 * That is A.4's sentence happening through the route built to prevent it.
 *
 * IT DOES NOT ALTER `provenance`, which is the route's business rather than this gate's, and it is
 * why the gate can be this narrow: the corpus keeps both facts afterwards — an agent proposed this,
 * and a named person accepted it on a named day.
 */
export function assertMayAcceptAGuess(
  row: { id: string; recordId: string; pattern: string; provenance: string },
  actor: Actor,
  // THE ACT AS ITS DOOR DECLARES IT, read from the route by the handler, so the person's refusal below names it. The
  // waiting queue asks this check as an agent, which never reaches that refusal, so it passes none.
  theAct?: string,
): void {
  const what =
    `Accepting a guess is what turns it into ownership — it raises the file count on the record's page, it makes ` +
    `the file count as claimed, and it is what a placeholder then propagates through`
  const tail =
    `Nothing was written and row ${row.id} is exactly as it was: still a proposal, still attributed to whoever made ` +
    `it, still in the "proposed" list on record ${row.recordId}'s page waiting on the person. The browser accepts ` +
    `it with one press there, which is the act this refusal is protecting.`

  if (actor.type !== 'human' && !actsForThePerson(actor)) {
    throw new PanelError(
      `${what}, and this request came from ${actor.type} "${actor.id}". ${tail} ${AND_WHAT_YOUR_PART_WAS} ` +
        `If you disagree with a row somebody else stated, write your own beside it — same record, same pattern, ` +
        `"proposing": true. Neither touches the other and the person sees both.`,
      403,
    )
  }
  if (actor.stated === false) {
    throw new PanelError(
      `${what}, and this request sent no actor headers, so nothing said who is asking. Ordinary writes take that ` +
        `as the person typing by hand; a governance act may not, because an absent header is not evidence that a ` +
        `person made it. ${tail} Send x-mole-office-actor-type: human and x-mole-office-actor-id: <who you are>.`,
      403,
    )
  }
  // AND A STATED PERSON HAS TO HOLD THE PERSON'S KEY. P83 point 1: the header claim is attribution,
  // and the key is what makes a caller the person. Asked last so the header-less case keeps its own
  // refusal above and the agent path keeps its own refusal above that.
  if (actor.type === 'human') {
    assertThePersonIsProved(actor, theAct)
  }
}

/**
 * ACCEPTING A PIECE OF WHAT AN AGENT READ IN A FOLDER IS THE PERSON'S OWN ACT.
 *
 * `import.accept` is declared under `The person's own acts` in design/permissions/roles.json, and
 * this guard is the door the route at POST /api/import/drafts/:id/pieces/:pieceId asks before it
 * writes. The check used to live inline in that route, which is why this one act was named by
 * neither the guard registry nor a role card — the same defect the ten registry-only acts had, in
 * a route rather than in a guard.
 *
 * TWO KEYS ANSWER IT, AS EVERY OTHER ACT OF THE PERSON'S. A stated person may do it, and an agent carrying
 * their quoted words for this piece or a secretary holding their press may do it for them — both through
 * `actsForThePerson`, which is the one door every guard of the person's own acts asks.
 */
export function assertMayAcceptAnImportPiece(actor: Actor): void {
  if (actor.type === 'human' && actor.stated !== false) {
    assertThePersonIsProved(actor)
    return
  }
  if (actor.type !== 'human' && actsForThePerson(actor)) return
  throw new PanelError(
    actor.type !== 'human'
      ? `Accepting a piece of a folder reading puts a record in the project, and only a person may do ` +
        `that — this request came from ${actor.type} "${actor.id}". Nothing was written. Reading the ` +
        'folder and filing the draft was your part.'
      : 'This request sent no actor headers, so nothing said who is asking. An absent header is not ' +
        'evidence that a person pressed anything. Nothing was written. Send x-mole-office-actor-type: ' +
        'human and x-mole-office-actor-id: <who you are>.',
    403,
  )
}

/**
 * DECLINING IS DELETING, AND AN AGENT MAY NOT DELETE WHAT A PERSON STATED.
 *
 * Without this, an agent that disagrees with *this module implements `src/server/lib/records.ts`* —
 * written by the owner — sends one request and gets a 200. That is broken assumption 19 reproduced
 * in a fresh table.
 *
 * WHAT AN AGENT MAY DELETE: a row it stated itself, and any row a person did not write. Nothing
 * else. So the gate is narrow on purpose — it fires only when the row's author was a human and the
 * caller is not.
 *
 * THE REFUSAL NAMES WHAT TO DO INSTEAD, AND THE THING TO DO INSTEAD ALREADY WORKS. The unique index
 * on `implementation_map` includes `provenance`, so the agent writes its own row BESIDE the
 * person's: same record, same pattern, `provenance='llm'`. Neither touches the other. Disagreement
 * is two rows a person can see, which is J's *"Preserve Agent-versus-resolver disagreement and
 * criticism."*
 *
 * THERE IS STILL NO REJECT ROUTE AND THAT IS NOT AN OMISSION. Rejecting IS deleting, and a second
 * word for one act would make somebody wonder which one they wanted.
 */
export function assertMayRetireSomebodyElsesRow(
  row: { id: string; recordId: string; pattern: string; statedBy: string },
  actor: Actor,
): void {
  if (!row.statedBy.startsWith('human:')) return
  if (actor.type === 'human') {
    assertThePersonIsProved(actor)
    return
  }
  // AND THE PERSON'S PRESS ANSWERS IT. Criterion P59: an elevation gives the person's own acts, and this one
  // is declared under that power in roles.json. A person was answered above, so this asks an agent.
  // AT OFF, AN AGENT ITS OWN KEY PROVES DELETES THE ROW TOO. The raise is asked only at block, so
  // nothing is written under the grant at off. Any other caller is refused in the off words. At block that agent is
  // counted as stopped.
  const position = gatePosition('who-retires-a-row-the-person-stated')
  if (position === 'block' ? actsForThePerson(actor) : actsForThePersonWithoutTheRaise(actor)) return
  const keyed = anAgentItsOwnKeyProves(actor) !== null
  if (keyed && gateMet('who-retires-a-row-the-person-stated', position!) !== 'block') return
  if (!keyed && position !== 'block') {
    throw refusedWhileTheGateIsOff(actor.id, 'who-retires-a-row-the-person-stated', 'delete a row of the implementation map that a person stated')
  }
  const refusal = new PanelError(
    `"${row.pattern}" on record ${row.recordId} was stated by ${row.statedBy}, and this request came from ` +
      `${actor.type} "${actor.id}". Deleting it would retire a person's statement about their own code on the ` +
      `word of a machine, and nothing on any page would show that it had happened. Nothing was written.\n\n` +
      `WHAT TO DO INSTEAD, AND IT ALREADY WORKS. Write your own row beside it: POST /api/implementation with the ` +
      `same recordId and the same pattern and "proposing": true. The unique index includes the provenance, so both ` +
      `rows stand — theirs in "stated", yours in "proposed", one line below, waiting on them. That is the ` +
      `disagreement being preserved rather than one side of it being deleted.`,
    403,
  )
  if (!keyed) throw refusal
  throw gateMetAgainOnceTheWriteIsTakenBack(refusal, () => gateMet('who-retires-a-row-the-person-stated', 'block'))
}

/**
 * RE-POINTING A ROOT IS REFUSED TO A NON-HUMAN ONCE THE REPOSITORY HAS BEEN SCANNED.
 *
 * It changes what every stated pattern in that repository resolves against, and it throws away
 * every derived row hanging off the old tree in the same transaction. A repository that has NEVER
 * been scanned has nothing derived hanging off it and nothing to throw away, so that case is not
 * gated at all — the narrowest rule that covers the act, which is what `assertMaySettleFork`'s own
 * comment asks for.
 *
 * ONE CONDITION AND NOT TWO. `actor.stated === false` is NOT refused here, and the difference from
 * the two guards above is real: accepting and declining are acts on somebody else's statement,
 * where an unattributed request cannot be taken as the person. Re-pointing is a repair a person
 * makes to their own machine's configuration after a restore, and §36's list is about proposals,
 * links and planning. Refusing it would make the routine repair after every archive restore
 * impossible from a script the owner runs themselves.
 */
export function assertMayRepointARepository(
  repository: { id: string; name: string; root: string | null },
  everScanned: boolean,
  actor: Actor,
  // THE ACT AS ITS DOOR DECLARES IT, read from the route by the handler, so the person's refusal below names it.
  theAct?: string,
): void {
  if (!everScanned) return
  if (actor.type === 'human') {
    assertThePersonIsProved(actor, theAct)
    return
  }
  // AND THE PERSON'S PRESS ANSWERS IT. Criterion P59: an elevation gives the person's own acts, and this one
  // is declared under that power in roles.json. A person was answered above, so this asks an agent.
  // AT OFF, AN AGENT ITS OWN KEY PROVES RE-POINTS IT TOO. The raise is asked only at block, so nothing
  // is written under the grant at off. Any other caller is refused in the off words. At block that agent is counted as
  // stopped.
  const position = gatePosition('who-repoints-a-scanned-repository')
  if (position === 'block' ? actsForThePerson(actor) : actsForThePersonWithoutTheRaise(actor)) return
  const keyed = anAgentItsOwnKeyProves(actor) !== null
  if (keyed && gateMet('who-repoints-a-scanned-repository', position!) !== 'block') return
  if (!keyed && position !== 'block') {
    throw refusedWhileTheGateIsOff(actor.id, 'who-repoints-a-scanned-repository', 'point a repository that has been scanned at another folder')
  }
  const refusal = new PanelError(
    `Re-pointing "${repository.name}" changes what every pattern stated against it resolves to, and it deletes ` +
      `every indexed file and every resolver finding of the tree it is leaving — because nothing derived from a ` +
      `tree may outlive the pointer to that tree. This request came from ${actor.type} "${actor.id}". Nothing was ` +
      `written and it still points at ${repository.root ?? 'no checkout on this machine'}.\n\n` +
      `This repository has been scanned, which is what makes the act consequential; a repository that has never ` +
      `been scanned can be re-pointed by anybody, because there is nothing to throw away. ${AND_WHAT_YOUR_PART_WAS}`,
    403,
  )
  if (!keyed) throw refusal
  throw gateMetAgainOnceTheWriteIsTakenBack(refusal, () => gateMet('who-repoints-a-scanned-repository', 'block'))
}


