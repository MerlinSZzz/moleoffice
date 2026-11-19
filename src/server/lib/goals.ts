// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S GOAL IS MARKED AS THE AGENT'S UNTIL THE PERSON CONFIRMS IT. Criterion P1.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE MARK IS TWO FIELDS IN THE GOAL'S OWN DATA
 * ---------------------------------------------------------------------------------------
 *
 * P1 says an agent may file a goal and that it is marked as the agent's until the person confirms
 * it. That cannot go through ownership: `createRecordWithReport` in src/server/lib/records.ts gives
 * every agent-written record to the person at once, and moving that would move every kind in the
 * product. So the mark is two fields on the goal itself:
 *
 *   `filed_by`      the agent that filed it, set by the OFFICE from the actor, never by the caller.
 *                   It is absent on a goal the person filed.
 *   `confirmed_by`  the person's press: who confirmed it and when. Absent until they press.
 *
 * Presence of `filed_by` with no `confirmed_by` IS the mark, which is why no separate boolean is
 * stored — a boolean would be one more fact that can disagree with the two fields it is worked out
 * from, and the ninth invariant says a fact is worked out in one place.
 *
 * ---------------------------------------------------------------------------------------
 * THE PRESS IS THE PERSON'S, AND A WARRANT ALONE DOES NOT OPEN IT
 * ---------------------------------------------------------------------------------------
 *
 * This is the pattern `assertMayRevokeARegulation` sets for a person-only field, and the reason is
 * the same one turned around: a warrant says the person made THIS act an agent's, and confirming an
 * agent's goal is the act of the person looking at what the agent filed. If any agent could write
 * `confirmed_by`, the mark would mean nothing at all. So an agent is refused, warrant or not, with
 * the two exceptions below.
 *
 * A SECRETARY CONFIRMS ONE ON THE OWNER'S WORD, NAMING THE EVIDENCE: a secretary may confirm a goal for the
 * owner when it names the evidence, the owner's message or decision that says so, and the goal keeps who pressed,
 * on whose word, and the evidence, so the mark stays honest, as a decision
 * says. So the confirmation a secretary writes holds four fields: `by` names the person,
 * whose word it is; `pressed_by` names the secretary by the name the request was made under, and the office
 * checks it against the caller; `at` is the day; and `evidence` is `decision:<id>` or `message:<id>`. A decision
 * must be a live one the owner made that names the goal, read by the reader that closes a fork on their decision.
 * A message is cited by a warrant on the same write, so the warrant door has already found the message and held
 * the warrant to this goal, and the change row keeps the person's quoted words. The decision changes this for
 * goals only.
 *
 * AN ELEVATION IS NOT A WARRANT AND DOES CARRY IT. Criterion P17: an authorised period gives every
 * one of the person's declared acts but revoking a regulation. A decision registered `goal.confirm` under `The
 * person's own acts`, so a secretary the person has raised for a period confirms an agent's goal as their own
 * press, and the write is stamped with the period. The warrant refusal above is
 * unchanged: the guard asks whether one was carried before it asks the elevation.
 *
 * THE CREATE PATH IS GUARDED TOO, because a rule enforced on one write path is not a rule: without
 * it an agent could file a goal already claiming the person had confirmed it. A secretary's
 * confirmation is refused there: the goal is filed first, and then confirmed by a change.
 */

import { GOAL_KIND } from '@shared/goal.ts'
import { THE_PERSON } from '@shared/person.ts'
import {
  actsForThePerson,
  aDecisionTheOwnerMadeThatNames,
  assertThePersonIsProved,
  theSecretaryOfThisOffice,
  type Actor,
} from './records.ts'
import { theWordsAllowThis } from '@shared/the-person-proved.ts'
import { PanelError } from './panel-error.ts'
import { participantForActor } from './participant-for-actor.ts'
import { theAgentRowAnIdNames } from './the-agent-row-an-id-names.ts'
// THE REFUSAL FOR A REQUEST NOT PROVED TO BE THE PERSON, written in one place for every door that keeps
// an act for them.
import { theRefusalForSomebodyNotProvedThePerson, whatThisRequestShowed } from './not-proved-the-person.ts'

/** One field of a record, read defensively: a record is stored as an unknown object. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The field only the person may write. Named once so the guard and its message agree. */
const CONFIRMATION_FIELD = 'confirmed_by'

/** The field the office writes from the actor when an agent files a goal. */
const FILED_BY_FIELD = 'filed_by'

/** In a secretary's confirmation: the secretary that pressed, checked against the caller. */
const PRESSED_BY_FIELD = 'pressed_by'

/** In a secretary's confirmation: where the person said so, `decision:<id>` or `message:<id>`. */
const EVIDENCE_FIELD = 'evidence'

/**
 * Refuse a create or a patch that writes `confirmed_by` on a `goal`, unless the actor is a stated
 * person, a secretary naming the owner's word, or a secretary the person raised. Called on both
 * write paths, for the reason above. `recordId` is the goal a patch changes; a create has none.
 */
export function assertMayConfirmAGoal(opts: { kind: string; arriving: unknown; actor: Actor; recordId?: string }): void {
  if (opts.kind !== GOAL_KIND) return
  const arriving = opts.arriving
  if (!isObject(arriving)) return
  const mark = arriving[CONFIRMATION_FIELD]
  if (mark === undefined) return

  const isStatedPerson = opts.actor.type === 'human' && opts.actor.stated !== false
  if (isStatedPerson) {
    // AND THE STATED PERSON HAS TO HOLD THE PERSON'S KEY. Criterion P83 point 1: every act the
    // declaration names as the person's is refused a caller that only claims to be them. The
    // declaration now carries `goal.confirm` under `The person's own acts`, so this guard asks the
    // one question `thePersonIsProved` answers, exactly as every other declared act's guard does.
    assertThePersonIsProved(opts.actor, 'Confirming a goal')
    return
  }

  // A SECRETARY THAT NAMES THE EVIDENCE IS ASKED EVERY CLAUSE OF A DECISION, and a secretary that
  // names none is asked what any agent is asked below.
  if (isObject(mark) && mark[EVIDENCE_FIELD] !== undefined && theSecretaryOfThisOffice(opts.actor)) {
    assertTheSecretaryNamesTheOwnersWord(mark, opts.actor, opts.recordId)
    return
  }

  // AN ELEVATION CARRIES IT, AND A WARRANT DOES NOT. P17 says an authorised period gives every one
  // of the person's declared acts but revoking a regulation, and `goal.confirm` is declared under
  // that power, so a secretary the person has raised for a period confirms it as their press. A
  // warrant alone is different and is still refused: it says the person made THIS act the agent's,
  // and looking at what an agent filed is the act the person keeps for themselves unless a secretary
  // names their word in the mark itself. The test of the warrant is asked before `actsForThePerson`,
  // because that function opens for either key and the elevation is the one this act takes.
  if (opts.actor.warrant === undefined && actsForThePerson(opts.actor)) return

  // THE WORDS ARE WRITTEN IN ONE PLACE, lib/not-proved-the-person.ts. This guard is called from the
  // record write path, which holds the actor and not the request, so the facts are read from the
  // actor alone and the words say only what holds whichever way the unread facts go.
  throw new PanelError(
    theRefusalForSomebodyNotProvedThePerson(whatThisRequestShowed(opts.actor, null), {
      refused: `"${CONFIRMATION_FIELD}" on a goal is the person's own press`,
      nothingWasDone: 'Nothing was written.',
      whoMay:
        'An agent may FILE a goal and is then marked as the agent\'s until the person confirms it. A secretary may ' +
        `confirm it for the person when the confirmation names where the person said so: "by" is the person, ` +
        `"${PRESSED_BY_FIELD}" is the secretary itself, and "${EVIDENCE_FIELD}" is "decision:<id>", a decision the ` +
        'person made that names this goal, or "message:<id>", the person\'s message, cited by a warrant on the same ' +
        'write. No other agent may, and a warrant alone does not open it. Otherwise say in a message that the goal ' +
        'waits, and let the person press Confirm on the goal\'s page.',
    }),
    403,
  )
}

/**
 * EVERY CLAUSE OF A DECISION IS ASKED OF A SECRETARY'S CONFIRMATION, EACH REFUSED IN ITS
 * OWN SENTENCE. It returns only when the mark is one the office can defend: on a
 * goal already filed, on what the person said, pressed by this caller, and with evidence that holds.
 */
function assertTheSecretaryNamesTheOwnersWord(mark: Record<string, unknown>, actor: Actor, recordId: string | undefined): void {
  const refuse = (why: string): never => {
    throw new PanelError(`${why} Nothing was written.`, 403)
  }
  if (recordId === undefined) {
    refuse(
      `A secretary confirms a goal that is already filed, so a new goal may not carry "${CONFIRMATION_FIELD}". ` +
        'File the goal first, then confirm it with a change.',
    )
  }
  if (mark['by'] !== THE_PERSON) {
    refuse(
      `A secretary's "${CONFIRMATION_FIELD}" says on whose word the goal is confirmed, so its "by" names the person, ` +
        `and this one says "${String(mark['by'])}".`,
    )
  }
  const pressed = mark[PRESSED_BY_FIELD]
  if (pressed !== actor.id) {
    refuse(
      `"${CONFIRMATION_FIELD}.${PRESSED_BY_FIELD}" names who pressed, and the office checks it against the caller: ` +
        `this request was made by "${actor.id}", and it says ${pressed === undefined ? 'nobody' : `"${String(pressed)}"`}. ` +
        'Write there the name this request was made under: the handle it named, or the registry id its key proved when it named none.',
    )
  }
  const evidence = String(mark[EVIDENCE_FIELD])
  const colon = evidence.indexOf(':')
  const word = colon <= 0 ? '' : evidence.slice(0, colon)
  const id = colon <= 0 ? '' : evidence.slice(colon + 1)
  if (word === 'decision' && id !== '') {
    if (aDecisionTheOwnerMadeThatNames(id, recordId!)) return
    refuse(
      `"${CONFIRMATION_FIELD}.${EVIDENCE_FIELD}" names decision ${id}, and that is not a live decision the person made ` +
        'that names this goal. Its "decided_by" must be "the owner", and the goal\'s id must be in its text or a ' +
        'link must run from it to the goal.',
    )
  }
  if (word === 'message' && id !== '') {
    const warrant = actor.warrant
    if (warrant === undefined) {
      refuse(
        `"${CONFIRMATION_FIELD}.${EVIDENCE_FIELD}" names the person's message ${id}, so this write must carry a ` +
          `warrant that cites it ("where": "${evidence}") and quotes the person's words there. This write carries no warrant.`,
      )
    }
    if (warrant!.where !== evidence) {
      refuse(
        `"${CONFIRMATION_FIELD}.${EVIDENCE_FIELD}" names the person's message ${id}, so this write's warrant must cite ` +
          `it ("where": "${evidence}"). This write's warrant cites "${warrant!.where}".`,
      )
    }
    // THE WARRANT IS WHAT LET THIS WRITE IN, so the ledgers keep it on this act.
    theWordsAllowThis(actor)
    return
  }
  refuse(
    `"${CONFIRMATION_FIELD}.${EVIDENCE_FIELD}" names where the person said so, as "decision:<id>", a decision the person made ` +
      `that names this goal, or as "message:<id>", the person's message, cited by a warrant on this write. "${evidence}" is neither.`,
  )
}

/**
 * The body a create should store for an agent-filed goal, or null when this is not one and nothing
 * needs stamping.
 *
 * THE OFFICE SETS `filed_by` RATHER THAN TRUSTING IT. An agent that sent a different name would
 * otherwise choose who the record says filed it, and the mark exists to say which agent's goal this
 * is. The caller's value is refused rather than overwritten, so nothing is stored that the caller
 * did not write. A goal the person files carries no `filed_by`: the mark is only ever an agent's.
 *
 * AN AGENT MAY NAME ITSELF BY AN OLD ID FILED AS ITS ALIAS, as a writer that kept it while the office
 * was closed for the re-mint does. The id sent and the caller are compared by the agent each names,
 * and the id is stored as it was sent.
 */
export function theAgentMarkAsStored(
  data: unknown,
  actor: Actor,
  kind: string,
): Record<string, unknown> | null {
  if (kind !== GOAL_KIND) return null
  const base = isObject(data) ? data : {}
  const sent = base[FILED_BY_FIELD]

  if (actor.type !== 'agent') {
    if (sent === undefined || sent === null || sent === '') return null
    throw new PanelError(
      `"${FILED_BY_FIELD}" is set by the office when an AGENT files a goal, so a goal the person files carries ` +
        'none. Nothing was written. Leave the field out, and say who owns the goal with `owner` instead.',
      403,
    )
  }

  const named = typeof sent === 'string' && sent !== actor.id ? theAgentRowAnIdNames(sent) : null
  const itNamesTheCaller = named !== null && named.id === participantForActor(actor)?.id
  if (sent !== undefined && sent !== null && sent !== '' && sent !== actor.id && !itNamesTheCaller) {
    throw new PanelError(
      `"${FILED_BY_FIELD}" says this goal was filed by "${String(sent)}", and this request was made by ` +
        `"${actor.id}". The office writes this field from the actor, so the two cannot disagree and nothing was ` +
        'written. Leave the field out and it will name you.',
      403,
    )
  }
  if (sent === actor.id || itNamesTheCaller) return null
  return { ...base, [FILED_BY_FIELD]: actor.id }
}
