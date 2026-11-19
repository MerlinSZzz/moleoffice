// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GOVERNANCE GUARDS AND THEIR ONE LIST: the guards that refuse an agent an act the person may
 * do, and the registry of every guard the office exports. They were moved out of
 * src/server/lib/records.ts with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands every name here on with `export *`, and every caller still
 * imports these names from records.ts. Every guard the list holds comes from the file that owns it,
 * and nothing here imports records.ts.
 */
// WHO MAY CONFIRM A PACKAGE'S TASK FINISHED. Criterion F16 point 5. The rule lives beside the
// package it confirms, in lib/delegation.ts, and is registered here because this is the one list of
// the acts a guard stands in front of. It is registered with a queue: a packaged task that has
// something back from outside and nobody has confirmed is waiting on the person's list, which is
// what `pendingWhen` below says and what `PENDING_ACTS` in lib/waiting.ts asks it about.
import { assertMayConfirmPackage } from '../delegation.ts'
// AN AGENT'S GOAL IS MARKED AS THE AGENT'S UNTIL THE PERSON CONFIRMS IT. Criterion P1. The mark is
// two fields in the goal's own data, never ownership; see the file's header.
import { assertMayConfirmAGoal } from '../goals.ts'
// CHANGING WHETHER THE OFFICE MAP MOVES IS THE PERSON'S. It is the one setting of criterion P59's office scene
// a person still changes (wave 13y round 119), declared under `The person's own acts` in roles.json.
// The rule lives beside the setting it refuses, in lib/pixel-office.ts, and is registered here
// because this is the one list of the acts a guard stands in front of.
import { assertMayRestartOrPause } from '../office-restart.ts'
import { PanelError } from '../panel-error.ts'
import { assertMayChangeTheOfficeScene } from '../pixel-office.ts'
// WHICH MODULE GROUPINGS THE WHOLE-PROJECT DRAWING SHOWS IS THE PERSON'S. Criterion P38.
// The guard lives beside the write it refuses, in lib/presentation.ts, and is
// registered here because this is the one list of the acts a guard stands in front of.
import { assertMayArrangeTheModuleGraph } from '../presentation.ts'
// REVOKING NEEDS THE PERSON OR A SECRETARY ON WORDS FOR THAT REVOCATION. See the file’s header for this
// narrower question than the human-only kind check `assertMayWrite` already asks.
import { assertMayRevokeARegulation } from '../regulations.ts'
import { assertMayChangeThisDomain } from '../workdomain.ts'
import { type Actor } from './actor.ts'
import { assertMayCommitAnIntent, assertMayCommitTheHours, assertMayPassTheQuestionOn, assertMayRemoveAnAsk, assertMayWriteACountOfWhatIsWaiting } from './asks-and-commitments.ts'
import { assertMayRemoveAnAgent } from './decision-core.ts'
import { assertMayRemoveAnExportedBundle, assertMayWriteAnExportList } from './export-list-guards.ts'
import { assertMayReplaceAFork, assertMaySettleFork } from './fork-settling.ts'
import { thePressThatWouldAllowThis } from './human-only.ts'
import { assertMayAcceptAGuess, assertMayAcceptAnImportPiece, assertMayRepointARepository, assertMayRetireSomebodyElsesRow } from './implementation-map-gates.ts'
import { assertMayPutAForkBackOnTheQueue } from './links.ts'
import { assertMayWrite, assertMayWriteASandbox, assertMayWriteAUseOn, assertMayWriteServed } from './may-write.ts'
import { actsForThePerson, theSecretaryActingForThePerson } from './own-words.ts'
import { assertMayRemoveAFork, type FutureAct, isPlanned, sameShelf, shelvedIn, theWordsThatWouldShelveThis, WHAT_THE_ACT_DOES } from './planning-guards.ts'
import { isSomebodyMoleOfficeCannotPlace, ONE_PERSON_AND_THE_NAME_IS_ITS_OWN, strangerDetail } from './served-doors.ts'
import { assertMayRevokeAnAct } from './taking-back.ts'
import { assertMayChangeACanonicalMethod, assertMayDecide, assertMayDismissARestriction, assertMayPinAFork, assertMayReclassifyAFork, assertMayTakeARecordOutOfItsKind, assertThePersonIsProved } from './the-persons-own-acts.ts'
import { named } from '@shared/named.ts'
import { type PanelRecord, type RecordKind } from '@shared/types.ts'
import { kindWord } from '@shared/words.ts'
import { and, or } from 'drizzle-orm'

// ============================================================================ shaping the future
//
// ---------------------------------------------------------------------------------------
// AN AGENT MAY PUT A FUTURE IN FRONT OF THE PERSON AND MAY NOT TAKE ONE AWAY
// ---------------------------------------------------------------------------------------
//
// A `trajectory` is one intended future and a `planned_state` is one intended state inside it.
// Agents propose futures — that is the whole point of letting them write one — and an agent may
// file a trajectory, add states, reorder them, add an edge, word an unanswered state, say a plan
// came true and say it was answered another way.
//
// What it may not do is REMOVE. Every act below takes something out of the person's plan and
// leaves at most one change row behind, and every one of them was reachable with an HTTP 200
// before this guard existed.
//
// The owner forbade an agent four verbs — retire, delete, supersede, resolve. Three are refused
// here. The fourth, `resolve`, is deliberately permitted: an agent may write `realises` and
// `instead_of`, because a plan nobody may say came true is a plan nobody maintains. The owner's own line
// forbids doing it SILENTLY, and it is not silent — the link carries who wrote it, and unlike the
// other three it is removable by the person.

/**
 * REFUSE A NON-HUMAN ONE OF THE TEN ACTS, and refuse a request that did not say who it was.
 *
 * It is the shape `assertMayRemoveAFork` already has, and for the same reasons: an absent actor
 * header is not evidence that a person made the act, and a name Mole Office cannot place is not a
 * person either.
 */
export function assertMayShapeTheFuture(
  subject: { id: string; kind: string; title: string },
  act: FutureAct,
  actor: Actor,
): void {
  if (!isPlanned(subject.kind)) return
  const does = WHAT_THE_ACT_DOES[act]
  // A GOAL'S SENTENCE GETS ITS OWN TAIL. Rewriting it takes nothing out of a plan, and a goal has no
  // states or edges, so the tail the other ten acts share would not be true of it.
  const tail =
    act === 'goal-what'
      ? `Nothing was written and "${subject.title}" is exactly as it was. Changing it is the person's own act. ` +
        `An agent may change the sentence of a goal it filed until the person confirms it.`
      : `Nothing was written and "${subject.title}" is exactly as it was. An agent may ADD to a planned future — ` +
        `file one, add states, reorder them, add an edge, word a state nothing has answered yet, and say a state ` +
        `came true or was answered another way. Taking something out of it is the person's own act.`

  if (actor.type !== 'human' && !actsForThePerson(actor)) {
    throw new PanelError(`This would ${does}, and this request came from ${actor.type} "${actor.id}". ${tail}`, 403)
  }
  if (actor.stated === false) {
    throw new PanelError(
      `This would ${does}, and this request sent no actor headers, so nothing said who is asking. Ordinary ` +
        `writes take that as the person typing by hand; changing what the project intends may not. ${tail} ` +
        `Send x-mole-office-actor-type: human and x-mole-office-actor-id: <who you are>.`,
      403,
    )
  }
  if (isSomebodyMoleOfficeCannotPlace(actor)) {
    throw new PanelError(
      `This would ${does}, and it was asked in the name "${actor.id}", which is not somebody Mole Office can ` +
        `place. ${tail} ${ONE_PERSON_AND_THE_NAME_IS_ITS_OWN}`,
      403,
      strangerDetail(`${act} on the ${kindWord(subject.kind).text} ${subject.id}`, actor),
    )
  }
  // AND A STATED PERSON HAS TO HOLD THE PERSON'S KEY. P83 point 1. Asked last so the header-less
  // and unplaceable-name cases keep their own refusals above.
  if (actor.type === 'human') {
    assertThePersonIsProved(actor)
  }
}

/**
 * REFUSE AN AGENT THE SHELVING ACT, unless it is the secretary carrying the person's words.
 *
 * ---------------------------------------------------------------------------------------
 * THE ACT, AND WHY IT IS THE PERSON'S
 * ---------------------------------------------------------------------------------------
 *
 * Setting `shelved` on a direction, changing it, or clearing it is putting a line of work down and
 * keeping it. Criterion S1 reserves that to the person, or to the secretary on their quoted words, for
 * the same reason a fork is the owner's to settle: the shelf is where a line of research is deliberately
 * stopped, and an agent that could stop one could quietly take it out of the open loops while
 * nobody was looking. It is written in the shape `assertMayShapeTheFuture` already has, and it sits
 * on this act only: an agent may still patch a direction's depth, its evidence, its `next`, as it
 * may today.
 *
 * IT IS NOT A `paused` GUARD. `paused` is refused to an agent by `futureActsIn`'s `because` act,
 * which protects the person's own words about why a future was put down; this is a separate field
 * and a separate act, and neither guard reads the other's key.
 *
 * `before` and `after` are the record's own `data` either side of the write, so a patch that does
 * not touch `shelved` compares equal and is not refused. A `data` that replaces the whole object and
 * leaves `shelved` out is a CLEARING, and it is refused here exactly as a set is.
 */
export function assertMayShelve(
  subject: { id: string; title: string },
  before: unknown,
  after: unknown,
  actor: Actor,
): void {
  const was = shelvedIn(before)
  const is = shelvedIn(after)
  if (sameShelf(was, is)) return

  const does =
    was === null
      ? 'put this direction on the shelf'
      : is === null
        ? 'take this direction off the shelf'
        : 'change why this direction is on the shelf'
  const tail =
    `Nothing was written and "${subject.title}" is exactly as it was. A shelf is the person's own act: they do ` +
    `it by their press in Mole Office, and the secretary may do it on their own words quoted as a warrant.`

  if (actor.type !== 'human' && !theSecretaryActingForThePerson(actor)) {
    throw new PanelError(
      `This would ${does}, and this request came from ${actor.type} "${actor.id}": a shelf is the person's own ` +
        `act, done by their press in Mole Office or by the secretary on their own words carried as a warrant, and ` +
        `nothing was written, so "${subject.title}" is exactly as it was. ` +
        thePressThatWouldAllowThis(actor) +
        theWordsThatWouldShelveThis(actor),
      403,
    )
  }
  // AND A REQUEST THAT DID NOT SAY WHO IT WAS IS NOT A PERSON. Owner decision §36: an absent header is
  // not evidence that a person made the write, and this is a governance act. Asked before the name is
  // placed so the two refusals keep their own words, exactly as `assertMayShapeTheFuture` does.
  if (actor.stated === false) {
    throw new PanelError(
      `This would ${does}, and this request sent no actor headers, so it named no asker. Ordinary ` +
        `writes take that as the person typing by hand; shelving a direction may not. ${tail} Send ` +
        `x-mole-office-actor-type: human and x-mole-office-actor-id: <your id>.`,
      403,
    )
  }
  if (isSomebodyMoleOfficeCannotPlace(actor)) {
    throw new PanelError(
      `This would ${does}, and it was asked in the name "${actor.id}", which Mole Office cannot ` +
        `place. ${tail} ${ONE_PERSON_AND_THE_NAME_IS_ITS_OWN}`,
      403,
      strangerDetail(`${does} on the direction ${subject.id}`, actor),
    )
  }
  // AND A STATED PERSON HAS TO HOLD THE PERSON'S KEY. P83 point 1, asked last like every other guard. The act is
  // named only when this write puts the direction on the shelf; changing a shelf or emptying it keeps "This act".
  if (actor.type === 'human') {
    assertThePersonIsProved(actor, was === null ? 'Shelving a direction' : undefined)
  }
}

/**
 * EVERY GUARD MOLE OFFICE EXPORTS, IN ONE LIST, HOLDING THE GUARD FUNCTIONS THEMSELVES.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS NOT ONLY THE PERSON'S ACTS, AND `personAct` IS HOW AN ENTRY SAYS WHICH IT IS
 * ---------------------------------------------------------------------------------------
 *
 * Most of these entries refuse an act only the person may do, and `personAct` names that act in
 * `design/permissions/roles.json`'s `The person's own acts`. Two are not the person's at all — the
 * waiting count, which refuses a claim to agents, and the outside hand-over record, which is
 * reserved to the SERVER and refuses the person exactly as it refuses an agent — and two more are
 * not separate acts: `assertMayDecide` is the narrower half of the decision write, and
 * `assertMayTakeARecordOutOfItsKind` asks three other guards and writes no rule of its own. Those
 * four carry `personAct: null` and are not counted as the person's acts anywhere. Other entries
 * carry null too, each with its reason beside it. One of them, `assertMayRemoveAnExportedBundle`,
 * does leave its act to the person, but the declaration does not name that act yet.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * A reader that wants to know which acts are refused to an agent has had to read this file and hope
 * it found them all. Two things need that answer and neither can get it today: the governance queue
 * is meant to list the forks a person still has to answer, and `design/round-ten/design/
 * remote-access.md` §6.5 writes a remote action scope over the same set. Both were going to be
 * hand-kept lists of guard names — a second place saying which guards exist, free to fall behind the
 * first the day a fourth guard is written. That is the defect `CLAUDE.md` names as this codebase's
 * own: the same fact worked out in two places, with nothing making them agree.
 *
 * ---------------------------------------------------------------------------------------
 * IT HOLDS THE FUNCTION, NEVER THE NAME
 * ---------------------------------------------------------------------------------------
 *
 * `guard` is the function value. Nothing here writes `'assertMayWrite'` as a string, so an entry
 * cannot name a guard that does not exist, and renaming a guard cannot leave a stale name behind:
 * the name a reader gets is `entry.guard.name`, read off the function.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE LIST OF GUARDS IS NOT KEPT HERE EITHER — A TEST KEEPS IT
 * ---------------------------------------------------------------------------------------
 *
 * `tests/guard-registry.test.ts` imports every file under `src/server/lib/`, finds every exported
 * function whose name begins `assertMay`, and fails when one of them is not in this list. So this is
 * not a list somebody has to remember to add to: forgetting is a failing build, on the day the guard
 * is written, wherever its author chose to put it. `settings-and-governance.md` §8.4 asks for exactly
 * that and says why the sweep is over the directory rather than over this file — a fourth guard is
 * already planned for another module, and a test that only read this one would have let it escape.
 *
 * The sweep is why the list is honest and it is not a proof that a guard is CALLED from anywhere.
 * A guard that is exported, registered and called from nowhere would pass the sweep, and that was
 * the failure: a registered guard did not run. Each guard's own test drives the route.
 */
export interface GovernanceGuard {
  /**
   * The guard itself. A function value, never a name written out again — see the note above.
   *
   * The parameter lists differ, because each guard is handed what its own act is about, so the type
   * here is the one every function is assignable to.
   */
  guard: (...args: never[]) => void
  /** What the act is, in the words a person would use for it. */
  act: string
  /**
   * THE STABLE KEY FOR THE ACT WHEN IT IS ALSO REFUSED FROM ANOTHER MACHINE, or null when it is not.
   *
   * ---------------------------------------------------------------------------------------
   * WHY THIS IS NOT SIMPLY `act`, AND WHY IT IS NULLABLE
   * ---------------------------------------------------------------------------------------
   *
   * `act` above is a sentence for a person, written for the governance queue. `GET /api/access`
   * publishes what a caller from another machine may not do, and a browser matches on that
   * publication to decide whether to draw a control at all, so it needs a key rather than prose.
   * `remote-access.md` §8.5 asks for exactly this and names four of them.
   *
   * NULL IS THE COMMON CASE AND IT IS THE HONEST ONE. This registry holds every exported `assertMay`
   * function under lib/, which is wider than the acts remote access refuses: two of the entries are
   * not reserved to the person at all, and most of the rest carry no arrival clause. Giving all of
   * them a key would publish a refusal the server does not perform — the browser hiding a control
   * the server allows, which is the one failure §8.5's binding test exists against.
   *
   * SO IT IS NOT A LABEL SOMEBODY TYPES AND NOBODY CHECKS. `tests/the-published-refusal-is-the-one-
   * enforced.test.ts` reads the source of every registered guard and fails when a key is set on a
   * guard whose body does not ask `actor.from`, or missing from one whose body does.
   */
  actKey: string | null
  /**
   * THE DECLARED KEY OF THE PERSON'S OWN ACT THIS GUARD REFUSES, or null when the guard is not one
   * of the person's own acts.
   *
   * ---------------------------------------------------------------------------------------
   * WHY THIS IS NOT `actKey`, AND WHY THE TWO ARE BOTH NEEDED
   * ---------------------------------------------------------------------------------------
   *
   * `actKey` above is non-null exactly when the act is ALSO refused from another machine, and a test
   * reads each guard's body to hold that. Most of the person's own acts are refused by WHO is asking
   * and not by WHERE, so `actKey` is null for them: this field is the one that names them.
   *
   * It is the bridge to `design/permissions/roles.json`'s `The person's own acts`. That declaration
   * is the one table the role gate, the refusal sentences and `GET /api/access` read; this field is
   * how a guard says which act in that table it stands in front of.
   * `tests/the-persons-acts-are-declared-once.test.ts` diffs the two sets, so an act added to one and
   * not the other is a failing build.
   */
  personAct: string | null
  /** The route or routes that perform the act. */
  route: string
  /**
   * The query that finds the objects this act is still pending on, in words, or `null`.
   *
   * `null` MEANS A REFUSAL AND NOT A PENDING ACT, and it is the honest answer for three of these six:
   * deleting a fork is something Mole Office refuses, and there is no queue of forks waiting to be
   * deleted. Writing it as a nullable field rather than leaving those rows out is what lets the sweep
   * above demand an entry from a guard that has no queue.
   *
   * IT IS WORDS AND NOT A FUNCTION, and no code under `src/` reads it. That half of this note has
   * been true since the field was written and still is.
   *
   * THE OTHER HALF SAID `GET /api/waiting` WAS NOT BUILT, AND IT IS. This comment landed in
   * `288f560`, step 1, and was true that hour. The route landed five commits later in
   * `b34e7ec` — `src/server/api/waiting.ts` and `src/server/lib/waiting.ts`, 1615 lines. The
   * sentence stayed behind and told every reader afterwards to go and build a route that was already
   * there. Corrected on 25 August 2026, from `design/round-ten/verification/wave-2.json`, `newFaults`
   * entry 2.
   *
   * AND THE PROMISE THAT WENT WITH IT — *"when that reading lands it replaces these sentences with
   * the query itself"* — IS WITHDRAWN HERE, WITH THE REASON, so nobody goes looking for the work.
   * The query is not moving into this field, because the one act that has a queue behind it counts
   * planning intents, and that query lives in the planning layer. This file must not import the
   * planning layer: `assertMayCommitAnIntent` takes a structural type for exactly that reason, said
   * on the parameter itself. A field here holding that query would drag the import in behind it.
   *
   * WHAT WAS BUILT INSTEAD, AND IT IS A BETTER ANSWER THAN THE PROMISE WAS. This field is not inert.
   * `tests/waiting-queue.test.ts > tier 1 is derived from the guard functions > asks every registered
   * guard that has a queue of objects pending on it` reads the null / not-null distinction and fails
   * the build when a guard says it has a queue and `GET /api/waiting` does not ask it. That is the
   * failure the words were there to prevent — objects waiting on the person and on no list — and a
   * test now catches it on the day the guard is registered. `tests/guard-registry.test.ts` also
   * refuses an entry whose `pendingWhen` is an empty string.
   *
   * WHAT IS STILL ONLY WORDS, SAID PLAINLY BECAUSE IT IS THE PART THAT ROTS. The test holds the
   * null / not-null distinction. It cannot hold the SENTENCE. `intentsWaitingForOnePress` in
   * lib/waiting.ts applies three conditions — not committed, a period was read, it names a piece of
   * work — and the sentence below says those same three in English. Narrow that query and nothing
   * here fails: the same fact in two places, which is this codebase's own named defect, kept
   * deliberately and written down rather than hidden. **Change the query and change these words in
   * the same commit.**
   */
  pendingWhen: string | null
}

/**
 * Written once because two guards refuse two halves of one act, so the queue behind them is one
 * queue. `assertMaySettleFork` refuses the link and `assertMayWrite` refuses the decision the link
 * would come from; a fork nobody has answered is what both of them are standing in front of.
 */
const A_FORK_NOBODY_HAS_ANSWERED = 'a live proposal with no decision that a person linked to it'

export const GOVERNANCE_GUARDS: readonly GovernanceGuard[] = [
  {
    guard: assertMayRestartOrPause,
    act: 'restart or pause the office',
    actKey: null,
    personAct: null,
    route: 'POST /api/office/restart · POST /api/office/pause · POST /api/office/resume',
    // An agent with a live grant may also press. This is a refusal, with no pending queue.
    pendingWhen: null,
  },
  {
    // The kind guard covers filing and changing a regulation. This narrower guard keeps revocation
    // for the person, or on a change for a secretary carrying words for that revocation.
    // An agent never creates one revoked, and the grant never revokes.
    guard: assertMayRevokeARegulation,
    act: 'revoke a regulation — the person, or a secretary carrying the person’s written words for that revocation',
    // NO ARRIVAL CLAUSE in the access sense: the guard asks what the WRITE TOUCHES, not who is
    // asking from where, so there is nothing for GET /api/access to publish about a caller.
    actKey: null,
    personAct: 'regulation.revoke',
    route: 'POST /api/records · PATCH /api/records/:id',
    // A REFUSAL AND NOT A PENDING ACT. Nothing queues waiting for the person to revoke: the regulation
    // stands until they say otherwise, from any surface where they can decide.
    pendingWhen: null,
  },
  {
    // CRITERION P1. The person's press on an agent-filed goal. An agent may file a goal; the
    // person confirms it, and a warrant alone does not open this one, for the reason the regulation
    // guard above gives turned around: a warrant says the person made this act the agent's, and looking at
    // what an agent filed is the act of the person. A secretary may
    // confirm one for them when the confirmation names their decision or message as the evidence and
    // keeps who pressed. See `assertMayConfirmAGoal` in lib/goals.ts.
    guard: assertMayConfirmAGoal,
    act: 'confirm an agent-filed goal, which clears the mark that says it is the agent\'s',
    // NO ARRIVAL CLAUSE in the access sense: the guard asks what the WRITE TOUCHES and who is
    // asking, not where they are asking from, so there is nothing for GET /api/access to publish.
    actKey: null,
    // THE DECLARATION NOW NAMES IT. design/permissions/roles.json carries `goal.confirm` under
    // `The person's own acts`, so the roles page
    // and the published answer name the act the guard already refuses. The guard asks for the
    // person's key as P83 point 1 requires of every declared act. A plain agent, and an agent
    // carrying a warrant alone, are still refused; an elevation carries it because P17 says the
    // person's own power carries every declared act but revoking a regulation; and a secretary
    // naming what the person said as evidence may confirm the goal. The declaration is
    // not changed for that, as `fork.settle` is not changed for a secretary closing a fork.
    personAct: 'goal.confirm',
    route: 'POST /api/records · PATCH /api/records/:id',
    // The queue reads agent-filed goals with no confirmation through `goalNeedsConfirmation` in
    // shared/horizons.ts, the same rule the Goals page uses.
    pendingWhen: 'An agent-filed goal has no confirmed_by value yet.',
  },
  {
    guard: assertMayArrangeTheModuleGraph,
    act: 'choose which module groupings the whole-project drawing shows',
    // NO ARRIVAL CLAUSE. This is refused by WHO is asking and not by where they are asking from, so
    // there is nothing for GET /api/access to publish about a caller on another machine.
    actKey: null,
    personAct: 'module-graph.arrange',
    route:
      'PUT /api/presentation/:scope · DELETE /api/presentation/:scope · PUT /api/presentation/:scope/nodes/:target · ' +
      'DELETE /api/presentation/:scope/nodes/:target · PUT /api/presentation/:scope/direction · ' +
      'DELETE /api/presentation/:scope/direction',
    // A REFUSAL AND NOT A PENDING ACT. Nothing queues waiting for the person to arrange a drawing; an agent
    // that thinks a grouping is wrong files a proposal, which is a fork and has its own queue.
    pendingWhen: null,
  },
  {
    guard: assertMayWrite,
    act: 'write a decision, and promote a proposal into one',
    actKey: 'decision.write',
    personAct: 'decision.write',
    route: 'POST /api/records · PATCH /api/records/:id · DELETE /api/records/:id · POST /api/records/:id/promote',
    pendingWhen: A_FORK_NOBODY_HAS_ANSWERED,
  },
  {
    guard: assertMayPinAFork,
    act: 'pin a fork, or take the pin off one — the owner saying it matters more than its other facts say',
    // NO ARRIVAL CLAUSE. Where the request came from is not asked here; `actor.from` is read by
    // `assertMayWrite` for the kinds that are governance acts, and a proposal is not one of those.
    actKey: null,
    personAct: 'fork.pin',
    route: 'POST /api/records · PATCH /api/records/:id',
    // A REFUSAL AND NOT A PENDING ACT. Nothing is queued waiting to be pinned: a pin is something
    // the owner does to a fork that is already in their queue, and the fork itself is what is waiting.
    pendingWhen: null,
  },
  {
    guard: assertMayReclassifyAFork,
    act: 'say that a fork the owner reserved is no longer the owner’s — the one change that takes a fork out of the owner’s queue',

    // NO ARRIVAL CLAUSE. Where the request came from is not asked here, for the same reason
    // `assertMayPinAFork` does not ask it: a proposal is not one of the human-only kinds, so
    // `assertMayWrite` never reaches its machine clause on this write.
    actKey: null,
    personAct: 'fork.reclassify',
    route: 'PATCH /api/records/:id',
    // A REFUSAL AND NOT A PENDING ACT. Nothing is queued waiting to be reclassified. What IS
    // waiting on the owner is the fork itself, which `assertMaySettleFork` already declares; declaring
    // it here as well would put one fork on GET /api/waiting twice.
    pendingWhen: null,
  },
  {
    guard: assertMayDecide,
    act: 'write a decision an agent cannot say what it stands on, or sign the owner’s name to one',
    // NO ARRIVAL CLAUSE OF ITS OWN. Where the request came from is asked by `assertMayWrite`, once,
    // for every human-only kind and every verb; this guard asks only what the decision stands on.
    // AND IT IS NOT A SEPARATE ACT. This is the narrower half of the decision write that
    // `assertMayWrite` already counts, so `personAct` is null: the act it refuses is `decision.write`,
    // declared once, and listing it again here would make the registry count one act twice.
    actKey: null,
    personAct: null,
    route: 'POST /api/records · PATCH /api/records/:id',
    // A REFUSAL AND NOT A PENDING ACT. Nothing is queued waiting for this guard to be satisfied: it
    // refuses a write rather than holding one for the person to make later. What IS waiting on the
    // person is the fork itself, which the two guards below already declare, and declaring it a
    // third time here would put it on `GET /api/waiting` twice.
    pendingWhen: null,
  },
  {
    guard: assertMaySettleFork,
    act: 'point a decision at a proposal, which is what settles the fork',
    actKey: 'fork.settle',
    personAct: 'fork.settle',
    route: 'POST /api/links',
    pendingWhen: A_FORK_NOBODY_HAS_ANSWERED,
  },
  {
    guard: assertMayRevokeAnAct,
    act: 'take back an act an agent made on the owner’s own quoted words',
    // A KEY, BECAUSE THIS GUARD'S BODY ASKS WHICH MACHINE ASKED. Revoking is done on the record's
    // page at the machine Mole Office runs on, exactly as settling a fork is.
    actKey: 'act.revoke',
    personAct: 'act.revoke',
    route: 'POST /api/records/:id/revisions/:seq/revoke',
    // A REFUSAL AND NOT A PENDING ACT. Nothing is queued waiting to be revoked: an act on the person's words
    // stands until they say otherwise, and reading it as pending would put every such act on their
    // list as though it were a question — which is the opposite of what the warrant is for.
    pendingWhen: null,
  },
  {
    guard: assertMayReplaceAFork,
    act: 'say that a fork was replaced, or that it is the same question as another one — the two ways out of the queue that do not answer it',
    actKey: 'fork.replace',
    personAct: 'fork.replace',
    route: 'POST /api/links',
    // A REFUSAL AND NOT A PENDING ACT. Nothing is queued waiting to be superseded or joined to
    // another fork. What IS waiting on the person is the fork itself, and `assertMaySettleFork`
    // above already declares it; declaring it here as well would put one fork on GET /api/waiting
    // twice, which is the reason `assertMayReclassifyAFork` says null for the same queue.
    pendingWhen: null,
  },
  {
    guard: assertMayPutAForkBackOnTheQueue,
    act: 'remove the link that took a fork off the owner’s queue — the settling link, or the one that said something replaced it',
    // A KEY, BECAUSE THIS GUARD'S BODY ASKS WHICH MACHINE ASKED, exactly as the other three fork
    // guards do. `tests/the-published-refusal-is-the-one-enforced.test.ts` reads the body and fails
    // when the two disagree, so this is not a label somebody typed.
    actKey: 'fork.reopen',
    personAct: 'fork.reopen',
    route: 'DELETE /api/links/:id',
    // A REFUSAL AND NOT A PENDING ACT. Nothing is queued waiting for a link to be removed. What IS
    // waiting on the person is the fork itself, and `assertMaySettleFork` above already declares
    // it; declaring it here as well would put one fork on GET /api/waiting twice.
    pendingWhen: null,
  },
  {
    guard: assertMayShapeTheFuture,
    act: 'take something out of a planned future — delete it, set it aside, un-set it aside, replace it, unlink it, shorten it, unwire it, reword an answered state, re-point it, or overwrite the person’s own words about why — or rewrite the sentence of a goal the person filed or confirmed',
    actKey: null,
    personAct: 'plan.shape',
    route: 'DELETE /api/records/:id · PATCH /api/records/:id · POST /api/links · DELETE /api/links/:id',
    // NO QUEUE. Nothing is pending on this guard: it refuses an act rather than holding one for the
    // person to perform later. An agent that wanted a state dropped says so in a record; the person
    // drops it when they agree.
    pendingWhen: null,
  },
  {
    guard: assertMayRemoveAFork,
    // AND THE KIND CHANGE, which takes a fork out of the queue exactly as the delete does and is
    // refused by this same guard. `assertMayTakeARecordOutOfItsKind` is what asks it there.
    act: 'delete a proposal nobody has answered, or change it into another kind',
    actKey: 'fork.remove',
    personAct: 'fork.remove',
    route: 'DELETE /api/records/:id · PATCH /api/records/:id',
    pendingWhen: null,
  },
  {
    guard: assertMayTakeARecordOutOfItsKind,
    act: 'change a record out of the kind it is, when guards stand in front of that kind',
    // NO ARRIVAL CLAUSE OF ITS OWN. This guard asks three others and writes no rule; where the
    // request came from is asked by `assertMayWrite` and by `assertMayRemoveAFork`, each once.
    // AND IT IS NOT A SEPARATE ACT. It is a composite that asks three other guards, so `personAct` is
    // null: each act it refuses is declared once, on the guard that owns it, and counting this entry
    // as one of the person's acts would make the registry count the same acts twice.
    actKey: null,
    personAct: null,
    route: 'PATCH /api/records/:id',
    // A REFUSAL AND NOT A PENDING ACT. Nothing is queued waiting to change kind. What IS waiting on
    // the person is whatever the kind it is leaving was protecting, and the guards this one asks
    // already declare those queues; declaring them again here would list one fork twice.
    pendingWhen: null,
  },
  {
    guard: assertMayChangeThisDomain,
    act: 'write what the machine resolved, or rewrite a hypothesis after it was accepted',
    actKey: null,
    personAct: 'workdomain.change',
    route: 'PATCH /api/records/:id',
    // A REFUSAL AND NOT A PENDING ACT. Nothing is queued waiting for a resolution to be written by
    // hand: the four machine-written fields are written by their own routes, and the freeze after
    // acceptance is a refusal with no queue behind it. What IS waiting on somebody after a work
    // domain is resolved is the agent answering its own differences, and that sits on the domain
    // itself as an unanswered difference rather than on this guard.
    pendingWhen: null,
  },
  {
    guard: assertMayRemoveAnAgent,
    act: 'delete a durable agent that still has messages waiting for it',
    actKey: null,
    personAct: null,
    route: 'DELETE /api/records/:id',
    // A REFUSAL AND NOT A PENDING ACT. Nothing is queued waiting for an agent to be deleted. What
    // is waiting is the agent's own inbox, which is a query over agent_messages and is read there.
    pendingWhen: null,
  },
  {
    guard: assertMayRemoveAnAsk,
    act: 'delete, close, or clear the question on a record that asks the person something',
    actKey: 'ask.remove',
    personAct: 'ask.remove',
    route: 'DELETE /api/records/:id · PATCH /api/records/:id',
    // A REFUSAL AND NOT A PENDING ACT. Nothing is queued waiting to be deleted or closed. What IS
    // waiting on the person is the record's own `whose_move: person`, which the queue reads from the
    // record rather than from this guard — `settings-and-governance.md` §8.4 calls that its second
    // source and keeps it separate from this one so that nothing arrives in the queue twice.
    pendingWhen: null,
  },
  {
    guard: assertMayPassTheQuestionOn,
    act: 'pass a question up to the person, on behalf of an agent that was started',
    // NO ACT KEY. `actKey` is what a role card names to be refused an act, and this one is not
    // refused by role at all: it is refused by WHO the question is with, which is a fact about the
    // record and the chain of starters rather than about the caller's rung. A key here would let a
    // card claim to grant or refuse something no card decides.
    actKey: null,
    personAct: null,
    route: 'POST /api/records/:id/pass-the-question-on · PATCH /api/records/:id',
    // A REFUSAL AND NOT A PENDING ACT ON THE PERSON. Something IS queued — the questions waiting for
    // a starter to look at them — but they are waiting on an AGENT, and `GET /api/waiting` is what
    // is waiting on the PERSON. Those questions are counted there as they leave, in the
    // `with-a-starter` bucket, which is where a reader meets them.
    pendingWhen: null,
  },
  {
    guard: assertMayCommitAnIntent,
    act: 'turn words about time into hours on the calendar',
    actKey: 'plan.commit',
    personAct: 'plan.commit',
    route: 'POST /api/planning/intents/:id/commit',
    // NOT NULL, AND THE DIFFERENCE IS REAL. Unlike the three above, this act HAS a queue of objects
    // pending on it: every set of words Mole Office read a period out of that nobody has committed yet is
    // sitting on the planning screen waiting for one press. Writing `null` here would be claiming
    // there is no such queue, which is false.
    pendingWhen:
      'a planning intent nobody has committed, that Mole Office read a period out of, and that names a piece of work',
  },
  {
    // THE SAME RULE, WHERE THE OTHER DOORS REACH IT. A measurement on 15 September 2026 found that five
    // paths write hours onto the person's calendar and only the intent commit above carried the
    // refusal, so an agent could give a plan line time and the row was written. The clause now lives
    // once, here, and the intent guard and `createAllocation` both ask it.
    guard: assertMayCommitTheHours,
    act: 'write hours onto the person’s own calendar, by whichever door asks',
    // NO ARRIVAL CLAUSE, for the reason the guard above has none: the act is refused by WHO is
    // asking rather than by where they ask from.
    actKey: null,
    // NULL, AND IT IS THE DECLARATION'S RULE RATHER THAN A JUDGEMENT. `plan.commit` is the declared
    // act and the intent guard above stands in front of it; `the-persons-acts-are-declared-once.test.ts`
    // requires each declared act to be named ONCE on each side, so a second guard naming the same key
    // would count the act twice. This guard enforces that act at the other doors and the declaration
    // keeps one name for it.
    personAct: null,
    route: 'POST /api/planning/allocations · POST /api/plans/:id/lines/:lineId/give-time · the filing path · the apply route',
    // A REFUSAL AND NOT A PENDING ACT. The queue of things waiting for the person to give them time is on
    // the intent guard above; this guard stands in front of the same queue and would count it twice.
    pendingWhen: null,
  },
  {
    guard: assertMayAcceptAGuess,
    act: 'turn a machine’s guess about which code a record owns into ownership',
    actKey: null,
    personAct: 'implementation.accept',
    route: 'POST /api/implementation/:id/accept',
    // NOT NULL, AND THE DIFFERENCE IS REAL. This act HAS a queue of objects pending on it: every
    // un-accepted `llm` row in `implementation_map` is sitting in the "proposed" list of some
    // record's page waiting on one press only a person may make. Writing `null` here would be
    // claiming an agent's proposals wait on nobody.
    pendingWhen:
      'a live implementation_map row whose authority is guessed — an llm row no person has accepted — on a record that is not deleted',
  },
  {
    guard: assertMayAcceptAnImportPiece,
    act: 'accept a piece of what an agent read in a folder, which turns the piece into a record',
    actKey: null,
    personAct: 'import.accept',
    route: 'POST /api/import/drafts/:id/pieces/:pieceId',
    // NOT COUNTED IN GET /api/waiting, AND THAT IS A DECISION THIS PIECE DOES NOT MAKE. A proposed
    // piece of a folder reading is sitting on the folder-reading screen waiting for one press only a
    // person may make, so there is a queue in the world; whether the person's queue should ask this
    // guard is separate work, and `null` here says only that nothing in GET /api/waiting reads it.
    pendingWhen: null,
  },
  {
    guard: assertMayRetireSomebodyElsesRow,
    act: 'delete a relationship a person stated about their own code',
    actKey: null,
    personAct: 'implementation.retire',
    route: 'DELETE /api/implementation/:id',
    // A REFUSAL AND NOT A PENDING ACT. Nothing is queued waiting to be deleted, and there is no
    // reject route on purpose: rejecting IS deleting. What an agent does instead of deleting is
    // write its own row beside the person's, which the refusal names.
    pendingWhen: null,
  },
  {
    guard: assertMayRepointARepository,
    act: 'move the checkout a repository’s stated patterns resolve against, once it has been scanned',
    actKey: null,
    personAct: 'repository.repoint',
    route: 'PATCH /api/implementation/repositories/:id',
    // A REFUSAL AND NOT A PENDING ACT. Nothing is queued waiting for a root to move. A root that
    // needs re-pointing after an archive restore is found by the rebuild refusing, which names the
    // value — that is a failed rebuild, not a queue.
    pendingWhen: null,
  },
  {
    guard: assertMayDismissARestriction,
    act: 'take a person’s "this cannot be called final" off a record by calling it not affected',
    actKey: null,
    personAct: 'restriction.dismiss',
    route: 'PUT /api/revalidations/:restrictionId/:recordId',
    // A REFUSAL AND NOT A PENDING ACT, and it is worth saying why, because a `needs_review` row
    // LOOKS like a queue item. It is not one. The governance queue holds acts reserved to the
    // person, and re-checking a record after a restriction is resolved is not: `checked` is open
    // to agents, because judging evidence is the work agents do here and it agrees with the
    // restriction's author rather than overriding them. Only the narrowest half — taking a
    // person's `stops_final` restriction off a record — is the person's. Counting these rows as
    // pending would put an agent's own work in the person's queue, and the queue is a claim about
    // what only they can do. A re-validation row surfaces at the boundaries and on the affected
    // record's page; it never enters GET /api/waiting, GET /api/needs-you or GET /api/forks.
    pendingWhen: null,
  },
  {
    guard: assertMayChangeACanonicalMethod,
    act: 'change the canonical method of a step while a fallback is running on it',
    actKey: null,
    personAct: 'block.method.change',
    route: 'PATCH /api/records/:id',
    // A REFUSAL AND NOT A PENDING ACT. Nothing is queued waiting for a method to change. What is
    // waiting is the four-record route the refusal names — a claim, a proposal, criticism and the
    // decision — and each of those is an ordinary record that reaches the queue on its own terms.
    pendingWhen: null,
  },
  {
    guard: assertMayChangeTheOfficeScene,
    act: 'change whether the office map moves',
    actKey: null,
    personAct: 'office.scene-settings.change',
    route: 'PATCH /api/office/scene-settings',
    // A REFUSAL AND NOT A PENDING ACT. Nothing queues waiting for it to change: it is one shared
    // setting the person changes on the Settings page whenever they like, and an agent that wants it
    // different asks them rather than holding a place in a queue.
    pendingWhen: null,
  },
  {
    guard: assertMayWriteACountOfWhatIsWaiting,
    act: 'write into a body how many things are waiting on the person',
    actKey: null,
    personAct: null,
    route: 'POST /api/records · PATCH /api/records/:id',
    // A REFUSAL AND NOT A PENDING ACT, AND NOT ONE OF THE PERSON'S ACTS. `personAct` is null because
    // this guard refuses a CLAIM to agents — the person may write their own count and the bytes are
    // stored exactly as they typed them. Nothing is queued waiting to be counted: the count is
    // GET /api/waiting, computed at read time, and there is nothing for a person to do about it.
    // The registry holds it because `tests/guard-registry.test.ts` sweeps every exported assertMay
    // function under lib/, and a guard nobody registered is what that sweep exists to catch.
    pendingWhen: null,
  },
  {
    guard: assertMayWriteAUseOn,
    act: 'write a use of a tool on a run',
    actKey: null,
    personAct: null,
    route: 'POST /api/toolset/uses',
    // A REFUSAL AND NOT A PENDING ACT, AND NOT ONE OF THE PERSON'S ACTS. Since migration 0231 a use is a row in
    // `tool_uses` and not a patch of the run, so the use door asks here what `patchRecord` asked of it before: no
    // ended run's key, and `assertMayWrite` for a change to a session. Nothing is queued waiting for a use.
    pendingWhen: null,
  },
  {
    guard: assertMayWriteAnExportList,
    act: 'write, rewrite or drop the record of what was handed to an agent Mole Office does not run',
    actKey: null,
    personAct: null,
    route: 'POST /api/records · PATCH /api/records/:id',
    // A REFUSAL AND NOT A PENDING ACT, AND NOT ONE OF THE PERSON'S ACTS EITHER. `personAct` is null
    // because this one is reserved to the SERVER, and a person hand-writing an export entry is
    // refused exactly as an agent is. Nothing is queued waiting for an export to be written —
    // `POST /api/bundles/export` writes one the moment somebody hands the text over, and a bundle
    // nobody has exported is a recipe nobody has used rather than a thing waiting on anyone. What a
    // person may still do here is DELETE an exported bundle, and that is the separate rule
    // `assertMayRemoveAnExportedBundle` holds.
    pendingWhen: null,
  },
  {
    // THE SEPARATE RULE NAMED JUST ABOVE. It refuses an agent deleting a context bundle whose
    // `exports` list holds at least one entry; a person may delete it, and so may anybody when the
    // bundle has never exported. Until 30 September 2026 it had no `export` keyword, so
    // `tests/guard-registry.test.ts`, which sweeps only exported names, could not see it and this
    // list did not hold it.
    guard: assertMayRemoveAnExportedBundle,
    act: 'delete a context bundle once it has exported at least once',
    // NO ARRIVAL CLAUSE. The guard asks who is asking and what the bundle holds, never `actor.from`.
    actKey: null,
    // NULL BECAUSE THE DECLARATION DOES NOT NAME THIS ACT, NOT BECAUSE IT IS NOT THE PERSON'S. The guard
    // leaves this act to the person alone, but `design/permissions/roles.json`'s `The person's own
    // acts` has no entry for it, and `tests/the-persons-acts-are-declared-once.test.ts` holds this
    // field to that list. Naming it there is a change to the declaration, which this registry entry
    // does not make.
    personAct: null,
    route: 'DELETE /api/records/:id',
    // A REFUSAL AND NOT A PENDING ACT. Nothing queues waiting for a bundle to be deleted: an
    // exported bundle stays as the record of what was handed over until somebody decides otherwise.
    pendingWhen: null,
  },
  {
    guard: assertMayConfirmPackage,
    act: 'confirm that a packaged task has come back and is finished — the responsible one\'s, or the person\'s, last step after the ordinary acceptance',
    // NO ARRIVAL CLAUSE. The act is refused by WHO is asking, not by where they are asking from:
    // the responsible one and the person may confirm from any machine, and `actor.from` is not part
    // of the rule. `tests/the-published-refusal-is-the-one-enforced.test.ts` reads this body and
    // holds the two together.
    actKey: null,
    // NOT ONE OF THE PERSON'S OWN ACTS. The person may always confirm, but so may the one
    // `responsibleFor` names when that is an agent, so this is not reserved to the person and
    // saying it were would make `the-persons-acts-are-declared-once.test.ts` count an act that is
    // not the person's alone.
    personAct: null,
    route: 'POST /api/delegation/:recordId/confirm',
    // NOT NULL, AND THE DIFFERENCE IS REAL. A packaged task that has something back from outside
    // and no confirmation is waiting on the person's list: the return door writes `returns`, the
    // confirm door writes `completed`, and until the second one runs the task is in the state
    // `packageStateOf` draws as `handed_back`. `PENDING_ACTS` in lib/waiting.ts asks this guard about
    // every such task, which is what puts the verb on that list.
    pendingWhen:
      'a packaged task with at least one entry in its `returns` list and no `completed` field',
  },
  {
    // CRITERION S1 of design/shelved/ACCEPTANCE.md. Putting a direction on the shelf, changing what
    // is written on the shelf, and taking it off again: one act, refused to an agent unless it is
    // the secretary carrying the person's quoted words, exactly as settling a fork is.
    guard: assertMayShelve,
    act: 'put a direction on the shelf, or take it off — the act that removes a line of work from the open loops without deleting it',
    // NO ARRIVAL CLAUSE. The act is refused by WHO is asking and not by where they ask from: the
    // person may shelve from any machine, and a secretary's warrant carries the person's words rather than a
    // place.
    actKey: null,
    // THE DECLARATION NOW NAMES IT. design/permissions/roles.json carries `direction.shelve` under
    // `The person's own acts`. The person authorized shelving
    // to join that table; the guard still refuses the same callers in
    // the same words, and only the declared name is new.
    personAct: 'direction.shelve',
    route: 'POST /api/records · PATCH /api/records/:id',
    // A REFUSAL AND NOT A PENDING ACT. Nothing queues waiting to be shelved: a direction stays open
    // work until somebody decides otherwise, and reading it as pending would put every live
    // direction on the owner's list as a question nobody asked.
    pendingWhen: null,
  },
  // THE TWO GUARDS OF A RUN'S OWN FIELDS, `served` and `sandbox`. `patchRecord` asks both on the patch door, and the
  // create path in records/creating.ts asks both on the create door. Neither had the `export` keyword until the create
  // path moved into that file and imported them from here, so `tests/guard-registry.test.ts`, which sweeps only exported
  // names, could not see them and this list did not hold them. Neither asks `actor.from`, neither is one of the person's
  // declared acts, and both are refusals with nothing queued behind them.
  {
    guard: assertMayWriteServed,
    act: "write a run's served conditions",
    actKey: null,
    personAct: null,
    route: 'POST /api/records · PATCH /api/records/:id',
    pendingWhen: null,
  },
  {
    guard: assertMayWriteASandbox,
    act: "write a run's sandbox",
    actKey: null,
    personAct: null,
    route: 'POST /api/records · PATCH /api/records/:id',
    pendingWhen: null,
  },
]

/**
 * What a delete did, in the same voice every other write in this server answers in.
 *
 * IT USED TO ANSWER `{"ok":true}`. That is the one reply in the product that says nothing: the
 * create says what the record is still missing, the patch says which paths moved, the discharge
 * says what settled the promise and whether it had already been settled, and the block delete at
 * least names the pipeline. A soft delete has three things worth saying and said none of them —
 * that the record is still there and can come back, that every link pointing at it is now shown as
 * broken rather than removed, and, the one that matters, whether this call did anything at all.
 */
export interface DeleteResult {
  /** The record as it now stands, `deletedAt` set. It is not gone; a soft delete never removes. */
  record: PanelRecord
  /** True when it was ALREADY deleted and this call wrote nothing. */
  alreadyDeleted: boolean
  /**
   * The records whose links to this one are now drawn as broken.
   *
   * Links are never removed by a delete — a dependency somebody recorded is a fact about the
   * archive even after the thing it pointed at is gone — so this is the list of pages that change
   * appearance because of this request, and nobody was told about them before.
   */
  brokenLinksAt: { id: string; kind: RecordKind; title: string }[]
  /** The same news in one sentence, for whoever reads the first line rather than the object. */
  note: string
}